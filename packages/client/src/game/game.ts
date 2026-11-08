// The game flow for M1: title screen, analysis, play, pause, crash and retry, song
// complete. The song clock drives the sim (docs/DEVELOPMENT.md, "Renderer and game loop").

import {
  SAMPLES_PER_TICK,
  Q8,
  autopilotInputs,
  createSimState,
  generateLevel,
  resetSimState,
  type DifficultyName,
  type Level,
  type LevelData,
} from '@game/core';
import { createAudioPlayer, type AudioPlayer } from '../audio/index.ts';
import { AMBER, LIME, MAGENTA } from '../render/palette.ts';
import { seededRandom } from '../render/random.ts';
import type { GameRenderer } from '../render/renderer.ts';
import { analyzeInWorker } from './analysis.ts';
import { InputSampler } from './input.ts';
import { DisplayClock, InputLog, catchUp, targetTick } from './loop.ts';
import type { PerfMeter } from './perf.ts';
import { drawPlay } from './play-view.ts';
import { DIFFICULTY_LABELS, DIFFICULTY_ORDER, MessageScreen, TitleScreen } from './screens.ts';
import { fetchSongBytes, type BundledSong } from './songs.ts';

type Mode = 'title' | 'analyzing' | 'play' | 'paused' | 'crashed' | 'complete' | 'error';

/** How long the crash and song-complete screens ignore keys, so a held key doesn't skip them. */
const PROMPT_DELAY_MS = 700;
/** The title screen's stars drift at this many px per second of terrain scroll. */
const TITLE_DRIFT_PX_PER_S = 40;
/** The title prompt alternates bright and dim this often. */
const PROMPT_BLINK_MS = 600;

/** One finished run: what M2's replays will store. */
export interface RunRecord {
  difficulty: DifficultyName;
  inputs: Uint8Array;
  /** The tick the ship crashed on, or -1 if it reached the end. */
  deathTick: number;
}

export interface GameOptions {
  song: BundledSong;
  /** Fly the ship with the autopilot instead of the keyboard (a development aid). */
  autopilot: boolean;
  perf: PerfMeter | null;
}

export class Game {
  readonly #r: GameRenderer;
  readonly #song: BundledSong;
  readonly #options: GameOptions;
  readonly #title = new TitleScreen();
  readonly #message = new MessageScreen();
  readonly #input = new InputSampler();
  readonly #clock = new DisplayClock();
  readonly #state = createSimState();
  readonly #levels = new Map<DifficultyName, { level: Level; autopilot: Uint8Array | null }>();
  #mode: Mode = 'title';
  #difficulty: DifficultyName = 'normal';
  #player: Promise<AudioPlayer> | null = null;
  #playerReady: AudioPlayer | null = null;
  #levelData: Promise<LevelData> | null = null;
  #bytes: Promise<Uint8Array> | null = null;
  #level: Level | null = null;
  #autopilot: Uint8Array | null = null;
  #log: InputLog | null = null;
  #modeSince = 0;
  #displaySamples = 0;
  #runs = 0;
  /** The last finished run, kept for M2's replays. */
  lastRun: RunRecord | null = null;

  constructor(r: GameRenderer, options: GameOptions) {
    this.#r = r;
    this.#song = options.song;
    this.#options = options;
    r.ui.addChild(this.#title.container, this.#message.container);
    this.#setMode('title');
  }

  start(): void {
    window.addEventListener('keydown', (e) => this.#onKeyDown(e));
    window.addEventListener('keyup', (e) => this.#input.keyUp(e.code));
    window.addEventListener('pointerdown', () => this.#onAnyKey());
    window.addEventListener('blur', () => {
      this.#input.clear();
      void this.#pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.#pause();
    });
    window.addEventListener('resize', () => this.#r.resize());
    requestAnimationFrame(this.#frame);
  }

  #setMode(mode: Mode): void {
    this.#mode = mode;
    this.#modeSince = performance.now();
    this.#title.container.visible = mode === 'title';
    this.#message.container.visible = mode === 'analyzing' || mode === 'paused' || mode === 'error';
    this.#r.world.visible = mode === 'play' || mode === 'paused' || mode === 'crashed' || mode === 'complete';
    if (mode === 'analyzing') this.#message.show('', 0, ['Analyzing song...']);
    if (mode === 'paused') this.#message.show('Paused', AMBER, ['Press Esc to resume']);
  }

  #showError(err: unknown): void {
    console.error(err);
    const text = err instanceof Error ? err.message : String(err);
    this.#setMode('error');
    this.#message.show('Something went wrong', MAGENTA, [text.slice(0, 60), 'Reload the page to try again']);
  }

  #onKeyDown(e: KeyboardEvent): void {
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    this.#input.keyDown(e.code);
    if (e.repeat) return;
    if (this.#mode === 'title') {
      const pick = /^(?:Digit|Numpad)([123])$/.exec(e.code);
      if (pick) {
        this.#difficulty = DIFFICULTY_ORDER[Number(pick[1]) - 1]!;
        return;
      }
    }
    if (e.code === 'Escape') {
      if (this.#mode === 'play') void this.#pause();
      else if (this.#mode === 'paused') void this.#resume();
      return;
    }
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
    this.#onAnyKey();
  }

  #onAnyKey(): void {
    const waited = performance.now() - this.#modeSince >= PROMPT_DELAY_MS;
    if (this.#mode === 'title') void this.#begin();
    else if (this.#mode === 'crashed' && waited) void this.#startRun();
    else if (this.#mode === 'complete' && waited) this.#toTitle();
  }

  /** Called from a key press or click: audio may only start from one. */
  async #begin(): Promise<void> {
    this.#setMode('analyzing');
    try {
      // The AudioContext is created here, inside the key press, so the browser lets it run.
      const created = (this.#player ??= createAudioPlayer());
      this.#bytes ??= fetchSongBytes(this.#song);
      const bytes = this.#bytes;
      this.#player = created.then(async (p) => {
        if (p.state === 'empty') await p.load(await bytes);
        return p;
      });
      this.#levelData ??= bytes.then((b) => analyzeInWorker(b));
      const [player, levelData] = await Promise.all([this.#player, this.#levelData]);
      this.#playerReady = player;
      let entry = this.#levels.get(this.#difficulty);
      if (!entry) {
        const level = generateLevel(levelData, this.#difficulty);
        entry = { level, autopilot: this.#options.autopilot ? autopilotInputs(level) : null };
        this.#levels.set(this.#difficulty, entry);
      }
      this.#level = entry.level;
      this.#autopilot = entry.autopilot;
      this.#log = new InputLog(entry.level.tickCount);
      this.#r.terrain.setLevel(entry.level);
      await this.#startRun();
    } catch (err) {
      this.#player = null;
      this.#levelData = null;
      this.#bytes = null;
      this.#showError(err);
    }
  }

  async #startRun(): Promise<void> {
    const player = this.#playerReady;
    if (!player || !this.#level) return;
    resetSimState(this.#state);
    this.#log?.reset();
    this.#clock.reset();
    this.#displaySamples = 0;
    this.#r.explosion.hide();
    this.#r.flash.hide();
    this.#runs++;
    this.#options.perf?.reset();
    this.#setMode('play');
    try {
      await player.start();
    } catch (err) {
      this.#showError(err);
    }
  }

  async #pause(): Promise<void> {
    const player = this.#playerReady;
    if (this.#mode !== 'play' || !player || player.state !== 'playing') return;
    this.#setMode('paused');
    await player.pause();
  }

  async #resume(): Promise<void> {
    const player = this.#playerReady;
    if (this.#mode !== 'paused' || !player) return;
    await player.resume();
    this.#clock.reset();
    this.#setMode('play');
  }

  #toTitle(): void {
    this.#playerReady?.stop();
    this.#r.terrain.setLevel(null);
    this.#setMode('title');
  }

  #finishRun(): void {
    const log = this.#log;
    if (!log) return;
    this.lastRun = {
      difficulty: this.#difficulty,
      inputs: log.toBytes(),
      deathTick: this.#state.dead ? this.#state.deathTick : -1,
    };
  }

  readonly #nextInput = (tick: number): number => {
    const auto = this.#autopilot;
    if (auto) {
      this.#input.sample();
      return auto[tick] ?? 0;
    }
    return this.#input.sample();
  };

  readonly #frame = (now: number): void => {
    const start = performance.now();
    const r = this.#r;
    const level = this.#level;
    switch (this.#mode) {
      case 'title': {
        this.#title.update(this.#song, this.#difficulty, Math.floor(now / PROMPT_BLINK_MS) % 2 === 0);
        r.starfield.draw((now / 1000) * TITLE_DRIFT_PX_PER_S);
        break;
      }
      case 'play': {
        const player = this.#playerReady;
        if (!player || !level) break;
        const clock = player.songTimeSamples();
        catchUp(level, this.#state, targetTick(clock, level.tickCount), this.#nextInput, this.#log);
        this.#displaySamples = this.#clock.update(now, clock, this.#state.tick);
        if (this.#state.dead) {
          // Freeze the picture on the tick of the crash.
          this.#displaySamples = this.#state.deathTick * SAMPLES_PER_TICK;
          this.#onCrash();
        } else if (this.#state.finished) {
          this.#onComplete();
        }
        drawPlay(r, level, this.#state, this.#displaySamples);
        break;
      }
      case 'crashed': {
        const elapsed = now - this.#modeSince;
        r.explosion.draw(elapsed);
        r.flash.draw(elapsed);
        if (elapsed >= PROMPT_DELAY_MS && !this.#message.container.visible) {
          this.#message.container.visible = true;
          this.#message.show('Crashed', MAGENTA, ['Press any key to retry']);
        }
        break;
      }
      default:
        break;
    }
    r.render();
    this.#options.perf?.record(performance.now() - start);
    requestAnimationFrame(this.#frame);
  };

  #onCrash(): void {
    this.#finishRun();
    this.#playerReady?.stop();
    const s = this.#state;
    this.#r.explosion.start(s.shipX / Q8, s.shipY / Q8, seededRandom(this.#runs));
    this.#setMode('crashed');
  }

  #onComplete(): void {
    this.#finishRun();
    this.#setMode('complete');
    this.#message.container.visible = true;
    this.#message.show('Song complete', LIME, [
      `${this.#song.title}, ${DIFFICULTY_LABELS[this.#difficulty]}`,
      'Press any key to continue',
    ]);
  }
}
