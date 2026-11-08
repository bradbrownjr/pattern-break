// The game flow: the title menu, the jukebox, analysis, play, pause, crash and retry, song
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
import { barBinEdges, barLevels } from '../render/spectrum.ts';
import { analyzeInWorker } from './analysis.ts';
import { InputSampler, keyToMenuAction, type MenuAction } from './input.ts';
import { DisplayClock, InputLog, catchUp, targetTick } from './loop.ts';
import { DIFFICULTY_LABELS, JukeboxMenu, TitleMenu } from './menu.ts';
import type { PerfMeter } from './perf.ts';
import { drawPlay } from './play-view.ts';
import { JukeboxScreen, MessageScreen, SPECTRUM_BARS, SPECTRUM_SEGMENTS, TitleScreen } from './screens.ts';
import { fetchSongBytes, type BundledSong } from './songs.ts';

type Mode = 'title' | 'jukebox' | 'analyzing' | 'play' | 'paused' | 'crashed' | 'complete' | 'error';

/** A song's bytes, its LevelData once analyzed, and the levels made from it so far. */
interface SongCache {
  bytes: Promise<Uint8Array>;
  levelData: Promise<LevelData> | null;
  levels: Map<DifficultyName, { level: Level; autopilot: Uint8Array | null }>;
}

/** How long the crash and song-complete screens ignore keys, so a held key doesn't skip them. */
const PROMPT_DELAY_MS = 700;
/** The title screen's stars drift at this many px per second of terrain scroll. */
const TITLE_DRIFT_PX_PER_S = 40;
/** The title menu's cursor blinks this often. */
const PROMPT_BLINK_MS = 600;
/** The jukebox spectrum: analyser size and the range its bars cover. */
const FFT_SIZE = 1024;
const SPECTRUM_LOW_HZ = 60;
const SPECTRUM_HIGH_HZ = 14_000;

/** One finished run: what M2's replays will store. */
export interface RunRecord {
  difficulty: DifficultyName;
  inputs: Uint8Array;
  /** The tick the ship crashed on, or -1 if it reached the end. */
  deathTick: number;
}

export interface GameOptions {
  /** The songs to offer, in menu order. */
  songs: readonly BundledSong[];
  /** The song the title menu starts on. */
  song: BundledSong;
  /** Fly the ship with the autopilot instead of the keyboard (a development aid). */
  autopilot: boolean;
  perf: PerfMeter | null;
}

export class Game {
  readonly #r: GameRenderer;
  readonly #songs: readonly BundledSong[];
  readonly #options: GameOptions;
  readonly #menu: TitleMenu;
  readonly #jukeboxMenu: JukeboxMenu;
  readonly #title = new TitleScreen();
  readonly #jukebox: JukeboxScreen;
  readonly #message = new MessageScreen();
  readonly #input = new InputSampler();
  readonly #clock = new DisplayClock();
  readonly #state = createSimState();
  readonly #cache = new Map<BundledSong, SongCache>();
  #mode: Mode = 'title';
  /** The song and difficulty of the run in play (or last played). */
  #song: BundledSong;
  #difficulty: DifficultyName = 'normal';
  #player: Promise<AudioPlayer> | null = null;
  #playerReady: AudioPlayer | null = null;
  /** The song the player has loaded. */
  #loaded: BundledSong | null = null;
  /** Bumped by each jukebox request, so a slower earlier one doesn't start after it. */
  #jukeboxRequest = 0;
  #jukeboxDuration = 0;
  #analyser: AnalyserNode | null = null;
  #analyserBins: Uint8Array<ArrayBuffer> = new Uint8Array(FFT_SIZE / 2);
  #barEdges: Uint16Array | null = null;
  #barLevels = new Uint8Array(SPECTRUM_BARS);
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
    this.#songs = options.songs;
    this.#song = options.song;
    this.#options = options;
    this.#menu = new TitleMenu(options.songs.length, Math.max(0, options.songs.indexOf(options.song)));
    this.#jukeboxMenu = new JukeboxMenu(options.songs.length);
    this.#jukebox = new JukeboxScreen(options.songs);
    r.ui.addChild(this.#title.container, this.#jukebox.container, this.#message.container);
    this.#setMode('title');
  }

  start(): void {
    window.addEventListener('keydown', (e) => this.#onKeyDown(e));
    window.addEventListener('keyup', (e) => this.#input.keyUp(e.code));
    window.addEventListener('pointerdown', () => {
      if (this.#mode === 'title' || this.#mode === 'jukebox') this.#onMenu('confirm');
      else this.#onAnyKey();
    });
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
    this.#jukebox.container.visible = mode === 'jukebox';
    this.#message.container.visible = mode === 'analyzing' || mode === 'paused' || mode === 'error';
    this.#r.world.visible = mode === 'play' || mode === 'paused' || mode === 'crashed' || mode === 'complete';
    if (mode === 'analyzing') this.#message.show('', 0, ['Analyzing song...']);
    if (mode === 'paused') this.#message.show('Paused', AMBER, ['Q quits to the title screen', 'Press Esc to resume']);
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
    if (this.#mode === 'title' || this.#mode === 'jukebox') {
      const action = keyToMenuAction(e.code);
      // A held arrow repeats; a held Enter or Esc does not.
      if (action && (!e.repeat || action === 'up' || action === 'down' || action === 'left' || action === 'right')) {
        e.preventDefault();
        this.#onMenu(action);
      }
      return;
    }
    if (e.repeat) return;
    if (e.code === 'Escape') {
      if (this.#mode === 'play') void this.#pause();
      else if (this.#mode === 'paused') void this.#resume();
      else if (this.#mode === 'crashed' || this.#mode === 'complete') this.#toTitle();
      return;
    }
    if (e.code === 'KeyQ' && this.#mode === 'paused') {
      this.#toTitle();
      return;
    }
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
    this.#onAnyKey();
  }

  #onAnyKey(): void {
    const waited = performance.now() - this.#modeSince >= PROMPT_DELAY_MS;
    if (this.#mode === 'crashed' && waited) void this.#startRun();
    else if (this.#mode === 'complete' && waited) this.#toTitle();
  }

  /** Called from a key press or click, so audio may start here. */
  #onMenu(action: MenuAction): void {
    if (this.#mode === 'title') {
      const open = this.#menu.apply(action);
      if (open === 'play') void this.#begin();
      else if (open === 'jukebox') this.#openJukebox();
      return;
    }
    const command = this.#jukeboxMenu.apply(action);
    if (command?.type === 'play') void this.#jukeboxPlay(command.song);
    else if (command?.type === 'stop') this.#jukeboxStop();
    else if (command?.type === 'back') {
      this.#jukeboxStop();
      this.#setMode('title');
    }
  }

  /**
   * The audio player, created on first use. Call it from a key press or click: the
   * AudioContext is made synchronously inside the call, so the browser lets it run.
   */
  #getPlayer(): Promise<AudioPlayer> {
    if (!this.#player) {
      const created = createAudioPlayer();
      this.#player = created;
      created.then(
        (p) => {
          this.#playerReady = p;
          p.onEnded = () => this.#onSongEnded();
        },
        () => {
          this.#player = null;
        },
      );
    }
    return this.#player;
  }

  #cacheFor(song: BundledSong): SongCache {
    let cache = this.#cache.get(song);
    if (!cache) {
      cache = { bytes: fetchSongBytes(song), levelData: null, levels: new Map() };
      this.#cache.set(song, cache);
    }
    return cache;
  }

  /** Loads `song` into the player unless it is the song already loaded. */
  async #loadSong(player: AudioPlayer, song: BundledSong): Promise<number> {
    const bytes = await this.#cacheFor(song).bytes;
    if (this.#loaded === song && player.state !== 'empty') return this.#jukeboxDuration;
    this.#loaded = null;
    const loaded = await player.load(bytes);
    this.#loaded = song;
    this.#jukeboxDuration = loaded.durationSeconds;
    return loaded.durationSeconds;
  }

  #openJukebox(): void {
    this.#jukeboxMenu.cursor = this.#menu.song;
    this.#jukeboxMenu.playing = null;
    this.#setMode('jukebox');
    // Start the player now, inside the key press, so the first song can start at once.
    this.#getPlayer().catch((err: unknown) => this.#showError(err));
  }

  async #jukeboxPlay(index: number): Promise<void> {
    const request = ++this.#jukeboxRequest;
    const song = this.#songs[index]!;
    try {
      const player = await this.#getPlayer();
      await this.#loadSong(player, song);
      if (request !== this.#jukeboxRequest || this.#mode !== 'jukebox') return;
      this.#connectAnalyser(player);
      await player.start();
      if (request === this.#jukeboxRequest) this.#jukeboxMenu.playing = index;
    } catch (err) {
      if (request === this.#jukeboxRequest) this.#showError(err);
    }
  }

  #jukeboxStop(): void {
    this.#jukeboxRequest++;
    this.#jukeboxMenu.playing = null;
    this.#playerReady?.stop();
  }

  /** In the jukebox, a song that ends hands over to the next one. */
  #onSongEnded(): void {
    const playing = this.#jukeboxMenu.playing;
    if (this.#mode !== 'jukebox' || playing === null) return;
    void this.#jukeboxPlay(this.#jukeboxMenu.next(playing));
  }

  #connectAnalyser(player: AudioPlayer): void {
    if (this.#analyser) return;
    const analyser = player.context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -25;
    analyser.smoothingTimeConstant = 0.7;
    player.output.connect(analyser);
    this.#analyser = analyser;
    this.#barEdges = barBinEdges(SPECTRUM_BARS, FFT_SIZE, player.context.sampleRate, SPECTRUM_LOW_HZ, SPECTRUM_HIGH_HZ);
  }

  async #begin(): Promise<void> {
    const song = this.#songs[this.#menu.song]!;
    const difficulty = this.#menu.difficulty;
    this.#setMode('analyzing');
    try {
      const cache = this.#cacheFor(song);
      const loading = this.#getPlayer().then(async (p) => {
        await this.#loadSong(p, song);
        return p;
      });
      cache.levelData ??= cache.bytes.then((b) => analyzeInWorker(b));
      const [player, levelData] = await Promise.all([loading, cache.levelData]);
      this.#playerReady = player;
      this.#song = song;
      this.#difficulty = difficulty;
      let entry = cache.levels.get(difficulty);
      if (!entry) {
        const level = generateLevel(levelData, difficulty);
        entry = { level, autopilot: this.#options.autopilot ? autopilotInputs(level) : null };
        cache.levels.set(difficulty, entry);
      }
      this.#level = entry.level;
      this.#autopilot = entry.autopilot;
      this.#log = new InputLog(entry.level.tickCount);
      this.#r.terrain.setLevel(entry.level);
      await this.#startRun();
    } catch (err) {
      this.#cache.delete(song);
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
        const view = { cursor: this.#menu.cursor, song: this.#songs[this.#menu.song]!, difficulty: this.#menu.difficulty };
        this.#title.update(view, Math.floor(now / PROMPT_BLINK_MS) % 2 === 0);
        r.starfield.draw((now / 1000) * TITLE_DRIFT_PX_PER_S);
        break;
      }
      case 'jukebox': {
        this.#drawJukebox();
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
          this.#message.show('Crashed', MAGENTA, ['Esc returns to the title screen', 'Press any key to retry']);
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

  #drawJukebox(): void {
    const playing = this.#jukeboxMenu.playing;
    const analyser = this.#analyser;
    if (analyser && this.#barEdges) {
      analyser.getByteFrequencyData(this.#analyserBins);
      barLevels(this.#analyserBins, this.#barEdges, SPECTRUM_SEGMENTS, this.#barLevels);
    }
    this.#jukebox.update({
      cursor: this.#jukeboxMenu.cursor,
      playing,
      seconds: playing === null ? 0 : (this.#playerReady?.songTimeSeconds() ?? 0),
      durationSeconds: this.#jukeboxDuration,
      levels: this.#barLevels,
    });
  }

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
