// The game flow: the start screen, the title menu with its music and attract demo, the
// jukebox, and runs (the arcade levels in order, or one song in practice) with their intro
// cards, pause, game over, and level complete. The song clock drives the sim
// (docs/DEVELOPMENT.md, "Renderer and game loop").

import {
  Difficulty,
  SAMPLES_PER_TICK,
  SAMPLE_RATE,
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
import { MenuSounds, type MenuSound } from '../audio/sfx.ts';
import { CYAN, LIME, MAGENTA } from '../render/palette.ts';
import { seededRandom } from '../render/random.ts';
import type { GameRenderer } from '../render/renderer.ts';
import { barBinEdges, barLevels } from '../render/spectrum.ts';
import { analyzeInWorker } from './analysis.ts';
import { PadBit, PadTracker, padMenuAction, readGamepads } from './gamepad.ts';
import { InputSampler, keyToMenuAction, type MenuAction } from './input.ts';
import { DisplayClock, InputLog, catchUp, targetTick } from './loop.ts';
import { ControlsScreen } from './controls.ts';
import { ControlsPages, DIFFICULTY_LABELS, JukeboxMenu, PauseMenu, TitleMenu, type TitleEvent } from './menu.ts';
import type { PerfMeter } from './perf.ts';
import { drawPlay } from './play-view.ts';
import {
  DemoBanner,
  FadeOverlay,
  JukeboxScreen,
  MessageScreen,
  PauseScreen,
  SPECTRUM_BARS,
  SPECTRUM_SEGMENTS,
  TitleScreen,
} from './screens.ts';
import {
  GAME_OVER_MUSIC,
  LEVEL_SONG_IDS,
  TITLE_SONG_ID,
  fetchSongBytes,
  songById,
  type BundledSong,
} from './songs.ts';

type Mode =
  | 'start'
  | 'title'
  | 'demo'
  | 'jukebox'
  | 'controls'
  | 'analyzing'
  | 'intro'
  | 'play'
  | 'paused'
  | 'gameover'
  | 'complete'
  | 'error';

/** What the player is playing, which decides what happens when a song ends. */
type Music = 'title' | 'jukebox' | 'run' | 'gameover' | null;

/** A run: the arcade levels in order from `level` (0-based), or one song in practice. */
type Run = { kind: 'arcade'; level: number } | { kind: 'practice'; song: BundledSong };

/**
 * A song's bytes, its LevelData per tempo once analyzed (each difficulty plays the song at
 * its own tempo), and the levels made from it so far.
 */
interface SongCache {
  bytes: Promise<Uint8Array>;
  levelData: Map<number, Promise<LevelData>>;
  levels: Map<DifficultyName, { level: Level; autopilot: Uint16Array | null }>;
}

/** How long game over and level complete ignore keys, so a key held from play doesn't skip them. */
const PROMPT_DELAY_MS = 700;
/** The title screen's stars drift at this many px per second of terrain scroll. */
const TITLE_DRIFT_PX_PER_S = 40;
/** Prompts and the menu cursor blink this often. */
const PROMPT_BLINK_MS = 600;
/**
 * The demo starts where the title song changes (The_Epic_Chip's fourth pattern, at 18 s),
 * the fade's black falling on the change, if the menu has been left alone for
 * DEMO_CUE_IDLE_MS. Otherwise it starts after DEMO_IDLE_MS with no key press.
 */
const DEMO_CUE_S = 18;
const DEMO_CUE_IDLE_MS = 5000;
const DEMO_IDLE_MS = 20_000;
/** The demo fades back to the title menu after this long. */
const DEMO_LENGTH_MS = 30_000;
/** Normal plays the song as written (tempo 1000), as the title music does. */
const DEMO_DIFFICULTY: DifficultyName = 'normal';
/** Each half of a fade: to black, then from black. */
const FADE_HALF_MS = 400;
/** The title music fades in over this long. */
const TITLE_FADE_IN_S = 1;
/** The card before each level stays this long. */
const INTRO_MS = 2000;
/** The jukebox spectrum: analyser size and the range its bars cover. */
const FFT_SIZE = 1024;
const SPECTRUM_LOW_HZ = 60;
const SPECTRUM_HIGH_HZ = 14_000;

/** One finished run: what M2's replays will store. */
export interface RunRecord {
  difficulty: DifficultyName;
  inputs: Uint16Array;
  /** The tick the ship crashed on, or -1 if it reached the end. */
  deathTick: number;
  /** Points scored, the lives bonus included. */
  score: number;
}

export interface GameOptions {
  /** The songs Practice and the jukebox offer, in menu order. */
  songs: readonly BundledSong[];
  /** The song Practice starts on. */
  song: BundledSong;
  /** Fly the ship with the autopilot instead of the keyboard (a development aid). */
  autopilot: boolean;
  perf: PerfMeter | null;
}

export class Game {
  readonly #r: GameRenderer;
  readonly #songs: readonly BundledSong[];
  readonly #levelSongs: readonly BundledSong[] = LEVEL_SONG_IDS.map(songById);
  readonly #titleSong = songById(TITLE_SONG_ID);
  readonly #gameOverSong = songById(GAME_OVER_MUSIC.songId);
  readonly #options: GameOptions;
  readonly #menu: TitleMenu;
  readonly #jukeboxMenu: JukeboxMenu;
  readonly #title = new TitleScreen();
  readonly #jukebox: JukeboxScreen;
  readonly #message = new MessageScreen();
  readonly #pauseMenu = new PauseMenu();
  readonly #pauseScreen = new PauseScreen();
  readonly #controlsPages = new ControlsPages();
  readonly #controls = new ControlsScreen();
  /** Where the controls screen returns to. */
  #controlsFrom: 'title' | 'paused' = 'title';
  /** True when the last press was on a gamepad, so the controls open on its page. */
  #lastPressPad = false;
  readonly #demoBanner = new DemoBanner();
  readonly #fade = new FadeOverlay();
  readonly #input = new InputSampler();
  readonly #clock = new DisplayClock();
  readonly #state = createSimState();
  readonly #cache = new Map<BundledSong, SongCache>();
  #mode: Mode = 'start';
  #modeSince = 0;
  /** The last key press or click on the title menu, for the demo's idle timer. */
  #lastInput = 0;
  /** A fade in progress: `mid` runs when the screen is black. */
  #transition: { start: number; mid: () => void; fired: boolean } | null = null;

  #player: Promise<AudioPlayer> | null = null;
  #playerReady: AudioPlayer | null = null;
  #sfx: MenuSounds | null = null;
  /** The song the player has loaded, and its length. */
  #loaded: BundledSong | null = null;
  #loadedTempo = 1000;
  #loadedSeconds = 0;
  #music: Music = null;
  /** Bumped by every change of music, so a slow load that a later one replaced doesn't start. */
  #musicRequest = 0;
  #analyser: AnalyserNode | null = null;
  #analyserBins: Uint8Array<ArrayBuffer> = new Uint8Array(FFT_SIZE / 2);
  #barEdges: Uint16Array | null = null;
  #barLevels = new Uint8Array(SPECTRUM_BARS);

  #demo: { level: Level; inputs: Uint16Array } | null = null;
  #run: Run | null = null;
  /** The song and difficulty of the run in play (or last played). */
  #song: BundledSong;
  #difficulty: DifficultyName = 'normal';
  #level: Level | null = null;
  #autopilot: Uint16Array | null = null;
  #log: InputLog | null = null;
  #displaySamples = 0;
  #runs = 0;
  readonly #pads = new PadTracker();
  /** Points from the arcade run's finished levels. */
  #runScore = 0;
  /** What a key does on the level-complete screen. */
  #afterComplete: (() => void) | null = null;
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
    r.ui.addChild(
      this.#title.container,
      this.#jukebox.container,
      this.#controls.container,
      this.#demoBanner.container,
      this.#message.container,
      this.#pauseScreen.container,
      this.#fade.container,
    );
    this.#setMode('start');
  }

  start(): void {
    window.addEventListener('keydown', (e) => this.#onKeyDown(e));
    window.addEventListener('keyup', (e) => this.#input.keyUp(e.code));
    window.addEventListener('pointerdown', () => this.#onPointer());
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

  // Screens -------------------------------------------------------------------------------

  #setMode(mode: Mode): void {
    this.#mode = mode;
    this.#modeSince = performance.now();
    this.#title.container.visible = mode === 'start' || mode === 'title';
    this.#jukebox.container.visible = mode === 'jukebox';
    this.#controls.container.visible = mode === 'controls';
    this.#pauseScreen.container.visible = mode === 'paused';
    this.#demoBanner.container.visible = mode === 'demo';
    this.#message.container.visible = mode === 'analyzing' || mode === 'error' || mode === 'intro';
    this.#r.world.visible =
      mode === 'demo' ||
      mode === 'intro' ||
      mode === 'play' ||
      mode === 'paused' ||
      mode === 'gameover' ||
      mode === 'complete';
    this.#r.combat.hud.visible = this.#r.world.visible;
    if (mode === 'analyzing') this.#message.show('', 0, ['Analyzing song...']);
    if (mode === 'paused') this.#pauseScreen.update(this.#pauseMenu.cursor);
    if (mode === 'controls') this.#controls.show(this.#controlsPages.page);
  }

  #showError(err: unknown): void {
    console.error(err);
    const text = err instanceof Error ? err.message : String(err);
    this.#setMode('error');
    this.#message.show('Something went wrong', MAGENTA, [text.slice(0, 60), 'Reload the page to try again']);
  }

  /** Fades to black, runs `mid`, and fades back in. */
  #fadeThrough(mid: () => void): void {
    this.#transition = { start: performance.now(), mid, fired: false };
  }

  #cancelFade(): void {
    this.#transition = null;
    this.#fade.set(0);
  }

  #sound(sound: MenuSound): void {
    this.#sfx?.play(sound);
  }

  // Input ---------------------------------------------------------------------------------

  #onKeyDown(e: KeyboardEvent): void {
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    this.#input.keyDown(e.code);
    this.#lastPressPad = false;
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
    switch (this.#mode) {
      case 'start':
        if (!e.repeat) this.#leaveStart();
        return;
      case 'demo':
        // Any key leaves the demo and does nothing else.
        if (!e.repeat) this.#toTitle();
        return;
      case 'paused':
        // Q quits straight to the title, as before the pause menu.
        if (e.code === 'KeyQ') {
          if (!e.repeat) this.#toTitle();
        } else {
          this.#menuKey(e);
        }
        return;
      case 'title':
      case 'jukebox':
      case 'controls':
        this.#menuKey(e);
        return;
      default:
        break;
    }
    if (e.repeat) return;
    if (e.code === 'Escape') {
      if (this.#mode === 'play') void this.#pause();
      else if (this.#mode === 'gameover' || this.#mode === 'complete') this.#toTitle();
      return;
    }
    this.#onAnyKey();
  }

  /** A key on a menu: a held arrow repeats; a held Enter or Esc does not. */
  #menuKey(e: KeyboardEvent): void {
    const action = keyToMenuAction(e.code);
    if (action && (!e.repeat || action === 'up' || action === 'down' || action === 'left' || action === 'right')) {
      e.preventDefault();
      this.#onMenu(action);
    }
  }

  /** Polls the gamepads: their held bits go to the sim, new presses act like keys. */
  #pollPads(now: number): void {
    const bits = readGamepads();
    this.#input.setPad(bits);
    for (const bit of this.#pads.update(bits, now)) this.#onPadPress(bit);
  }

  #onPadPress(bit: number): void {
    this.#lastPressPad = true;
    switch (this.#mode) {
      case 'start':
        // Browsers start sound only after a key press or click (the HTML spec's
        // activation-triggering input events don't include gamepads).
        if (navigator.userActivation?.hasBeenActive) this.#leaveStart();
        else this.#title.showPadHint();
        return;
      case 'demo':
        this.#toTitle();
        return;
      case 'title':
      case 'jukebox':
      case 'controls': {
        const action = padMenuAction(bit);
        if (action) this.#onMenu(action);
        return;
      }
      case 'play':
        if (bit === PadBit.start) void this.#pause();
        return;
      case 'paused': {
        // Start resumes and Select quits, whatever the cursor is on.
        if (bit === PadBit.start) void this.#resume();
        else if (bit === PadBit.select) this.#toTitle();
        else {
          const action = padMenuAction(bit);
          if (action) this.#onMenu(action);
        }
        return;
      }
      case 'gameover':
      case 'complete':
        // B or Select is Esc; any other button is any key. Directions don't count, so a
        // stick still leaning from play doesn't skip the screen.
        if (bit === PadBit.b || bit === PadBit.select) this.#toTitle();
        else if ((bit & (PadBit.up | PadBit.down | PadBit.left | PadBit.right)) === 0) this.#onAnyKey();
        return;
      default:
        return;
    }
  }

  #onPointer(): void {
    if (this.#mode === 'start') this.#leaveStart();
    else if (this.#mode === 'demo') this.#toTitle();
    else if (this.#mode === 'title' || this.#mode === 'jukebox' || this.#mode === 'paused' || this.#mode === 'controls') {
      this.#onMenu('confirm');
    }
    else this.#onAnyKey();
  }

  #onAnyKey(): void {
    if (performance.now() - this.#modeSince < PROMPT_DELAY_MS) return;
    if (this.#mode === 'gameover') {
      this.#stopMusic();
      void this.#startRun();
    } else if (this.#mode === 'complete') {
      const next = this.#afterComplete;
      this.#afterComplete = null;
      next?.();
    }
  }

  /** Called from a key press or click, so audio may start here. */
  #onMenu(action: MenuAction): void {
    if (this.#mode === 'title') {
      this.#lastInput = performance.now();
      this.#cancelFade();
      this.#onTitleEvent(this.#menu.apply(action));
      return;
    }
    if (this.#mode === 'paused') {
      this.#onPauseMenu(action);
      return;
    }
    if (this.#mode === 'controls') {
      const event = this.#controlsPages.apply(action);
      if (event === 'moved') {
        this.#sound('move');
        this.#controls.show(this.#controlsPages.page);
      } else if (event === 'back') {
        this.#sound('back');
        if (this.#controlsFrom === 'paused') this.#setMode('paused');
        else {
          this.#lastInput = performance.now();
          this.#setMode('title');
        }
      }
      return;
    }
    const command = this.#jukeboxMenu.apply(action);
    switch (command?.type) {
      case 'moved':
        this.#sound('move');
        break;
      case 'play':
        this.#sound('select');
        void this.#jukeboxPlay(command.song);
        break;
      case 'stop':
        this.#sound('back');
        this.#stopMusic();
        break;
      case 'back':
        this.#sound('back');
        this.#toTitle();
        break;
      default:
        break;
    }
  }

  #onTitleEvent(event: TitleEvent): void {
    switch (event) {
      case 'moved':
        this.#sound('move');
        break;
      case 'changed':
        this.#sound('change');
        break;
      case 'play':
        this.#sound('start');
        this.#run = { kind: 'arcade', level: 0 };
        this.#runScore = 0;
        void this.#beginLevel();
        break;
      case 'practice':
        this.#sound('start');
        this.#run = { kind: 'practice', song: this.#songs[this.#menu.song]! };
        void this.#beginLevel();
        break;
      case 'jukebox':
        this.#sound('select');
        this.#openJukebox();
        break;
      case 'controls':
        this.#sound('select');
        this.#openControls('title');
        break;
      case null:
        break;
    }
  }

  #onPauseMenu(action: MenuAction): void {
    switch (this.#pauseMenu.apply(action)) {
      case 'moved':
        this.#sound('move');
        this.#pauseScreen.update(this.#pauseMenu.cursor);
        break;
      case 'resume':
        void this.#resume();
        break;
      case 'controls':
        this.#sound('select');
        this.#openControls('paused');
        break;
      case 'quit':
        this.#sound('back');
        this.#toTitle();
        break;
      case null:
        break;
    }
  }

  /** Opens the controls on the page for the last thing pressed: the keyboard or a pad. */
  #openControls(from: 'title' | 'paused'): void {
    this.#controlsFrom = from;
    this.#controlsPages.index = this.#lastPressPad ? 1 : 0;
    this.#setMode('controls');
  }

  // Audio ---------------------------------------------------------------------------------

  /**
   * The audio player, created on first use. Call it from a key press or click: the
   * AudioContext is made synchronously inside the call, so the browser lets it run.
   */
  #getPlayer(): Promise<AudioPlayer> {
    if (!this.#player) {
      const context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
      this.#sfx = new MenuSounds(context);
      const created = createAudioPlayer({ context });
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
      cache = { bytes: fetchSongBytes(song), levelData: new Map(), levels: new Map() };
      this.#cache.set(song, cache);
    }
    return cache;
  }

  /** `song`'s LevelData at `difficulty`'s tempo, analyzing it in the worker the first time. */
  #levelData(song: BundledSong, difficulty: DifficultyName): Promise<LevelData> {
    const cache = this.#cacheFor(song);
    const tempo = Difficulty[difficulty].tempoPermille;
    let data = cache.levelData.get(tempo);
    if (!data) {
      data = cache.bytes.then((b) => analyzeInWorker(b, tempo));
      cache.levelData.set(tempo, data);
    }
    return data;
  }

  /**
   * Loads `song` into the player to play at `tempoPermille` (1000: as written), unless it
   * is already loaded at that tempo.
   */
  async #loadSong(player: AudioPlayer, song: BundledSong, tempoPermille = 1000): Promise<void> {
    const bytes = await this.#cacheFor(song).bytes;
    if (this.#loaded === song && this.#loadedTempo === tempoPermille && player.state !== 'empty') return;
    this.#loaded = null;
    const loaded = await player.load(bytes, tempoPermille);
    this.#loaded = song;
    this.#loadedTempo = tempoPermille;
    this.#loadedSeconds = loaded.durationSeconds;
  }

  /**
   * Plays `song` from its start as `kind` of music, fading in over `fadeInSeconds`.
   * Resolves false if other music was asked for in the meantime.
   */
  async #playMusic(song: BundledSong, kind: Exclude<Music, null>, fadeInSeconds = 0): Promise<boolean> {
    const request = ++this.#musicRequest;
    try {
      const player = await this.#getPlayer();
      await this.#loadSong(player, song);
      if (request !== this.#musicRequest) return false;
      this.#music = kind;
      player.setVolume(fadeInSeconds > 0 ? 0 : 1);
      await player.start();
      if (request !== this.#musicRequest) return false;
      if (fadeInSeconds > 0) player.fade(1, fadeInSeconds);
      return true;
    } catch (err) {
      if (request === this.#musicRequest) this.#showError(err);
      return false;
    }
  }

  #stopMusic(): void {
    this.#musicRequest++;
    this.#music = null;
    this.#jukeboxMenu.playing = null;
    this.#playerReady?.stop();
  }

  #onSongEnded(): void {
    if (this.#music === 'title' && (this.#mode === 'title' || this.#mode === 'demo')) {
      void this.#playMusic(this.#titleSong, 'title');
    } else if (this.#music === 'jukebox' && this.#mode === 'jukebox' && this.#jukeboxMenu.playing !== null) {
      // In the jukebox, a song that ends hands over to the next one.
      void this.#jukeboxPlay(this.#jukeboxMenu.next(this.#jukeboxMenu.playing));
    }
  }

  // Start, title and demo ----------------------------------------------------------------

  /** The first key press or click: audio may start now. */
  #leaveStart(): void {
    this.#getPlayer().catch((err: unknown) => this.#showError(err));
    this.#sound('coin');
    this.#toTitle();
    void this.#prepareDemo();
  }

  #toTitle(): void {
    this.#cancelFade();
    this.#run = null;
    this.#r.terrain.setLevel(null);
    this.#r.explosion.hide();
    this.#r.flash.hide();
    this.#lastInput = performance.now();
    this.#setMode('title');
    // From the demo the title music is already playing.
    if (this.#music !== 'title') {
      this.#stopMusic();
      void this.#playMusic(this.#titleSong, 'title', TITLE_FADE_IN_S);
    }
  }

  /** Analyzes the title song and flies its level with the autopilot, for the demo; then level 1. */
  async #prepareDemo(): Promise<void> {
    try {
      const level = generateLevel(await this.#levelData(this.#titleSong, DEMO_DIFFICULTY), DEMO_DIFFICULTY);
      this.#demo = { level, inputs: autopilotInputs(level) };
    } catch (err) {
      // The game works without the demo; the title menu stays up.
      console.error('demo unavailable:', err);
    }
    // Then analyze level 1 at the chosen difficulty while the title plays, so Play starts
    // without a wait.
    const first = this.#levelSongs[0];
    if (first) this.#levelData(first, this.#menu.difficulty).catch(() => this.#cache.delete(first));
  }

  #startDemo(): void {
    const demo = this.#demo;
    if (!demo || this.#music !== 'title') return;
    resetSimState(this.#state);
    this.#clock.reset();
    this.#r.terrain.setLevel(demo.level);
    this.#setMode('demo');
  }

  // Jukebox -------------------------------------------------------------------------------

  #openJukebox(): void {
    this.#stopMusic();
    this.#jukeboxMenu.cursor = this.#menu.song;
    this.#setMode('jukebox');
  }

  async #jukeboxPlay(index: number): Promise<void> {
    const player = await this.#getPlayer().catch(() => null);
    if (!player) return;
    if (await this.#playMusic(this.#songs[index]!, 'jukebox')) {
      this.#connectAnalyser(player);
      this.#jukeboxMenu.playing = index;
    }
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

  // Runs ----------------------------------------------------------------------------------

  #runSong(run: Run): BundledSong {
    return run.kind === 'arcade' ? this.#levelSongs[run.level]! : run.song;
  }

  /** Analyzes the run's song if needed, builds its level, and shows the intro card. */
  async #beginLevel(): Promise<void> {
    const run = this.#run;
    if (!run) return;
    const song = this.#runSong(run);
    const difficulty = this.#menu.difficulty;
    this.#cancelFade();
    this.#stopMusic();
    const request = this.#musicRequest;
    this.#setMode('analyzing');
    try {
      const cache = this.#cacheFor(song);
      const tempo = Difficulty[difficulty].tempoPermille;
      const loading = this.#getPlayer().then(async (p) => {
        await this.#loadSong(p, song, tempo);
        return p;
      });
      const [player, levelData] = await Promise.all([loading, this.#levelData(song, difficulty)]);
      if (request !== this.#musicRequest || this.#mode !== 'analyzing') return;
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
      resetSimState(this.#state);
      this.#r.explosion.hide();
      this.#r.flash.hide();
      this.#setMode('intro');
      const last = run.kind === 'arcade' && run.level === this.#levelSongs.length - 1;
      const heading = run.kind === 'practice' ? 'Practice' : last ? 'Final level' : `Level ${run.level + 1}`;
      this.#message.show(heading, CYAN, [song.title, song.credit, DIFFICULTY_LABELS[difficulty]]);
    } catch (err) {
      this.#cache.delete(song);
      this.#showError(err);
    }
  }

  async #startRun(): Promise<void> {
    const level = this.#level;
    if (!level) return;
    const request = ++this.#musicRequest;
    try {
      const player = await this.#getPlayer();
      await this.#loadSong(player, this.#song, Difficulty[this.#difficulty].tempoPermille);
      if (request !== this.#musicRequest) return;
      resetSimState(this.#state);
      this.#log?.reset();
      this.#clock.reset();
      this.#displaySamples = 0;
      this.#r.explosion.hide();
      this.#r.flash.hide();
      this.#runs++;
      this.#options.perf?.reset();
      this.#setMode('play');
      this.#music = 'run';
      player.setVolume(1);
      await player.start();
    } catch (err) {
      this.#showError(err);
    }
  }

  async #pause(): Promise<void> {
    const player = this.#playerReady;
    if (this.#mode !== 'play' || !player || player.state !== 'playing') return;
    this.#pauseMenu.cursor = 0;
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

  #finishRun(): void {
    const log = this.#log;
    if (!log) return;
    this.lastRun = {
      difficulty: this.#difficulty,
      inputs: log.toArray(),
      deathTick: this.#state.dead ? this.#state.deathTick : -1,
      score: this.#state.score,
    };
  }

  #onCrash(): void {
    this.#finishRun();
    this.#stopMusic();
    const s = this.#state;
    this.#r.explosion.start(s.shipX / Q8, s.shipY / Q8, seededRandom(this.#runs));
    this.#setMode('gameover');
    // Game over plays the opening of a song and fades it out.
    void this.#playMusic(this.#gameOverSong, 'gameover').then((started) => {
      if (started) {
        const { seconds, fadeSeconds } = GAME_OVER_MUSIC;
        this.#playerReady?.fade(0, fadeSeconds, seconds - fadeSeconds);
      }
    });
  }

  #onComplete(): void {
    this.#finishRun();
    this.#setMode('complete');
    this.#message.container.visible = true;
    const run = this.#run;
    const difficulty = DIFFICULTY_LABELS[this.#difficulty];
    const s = this.#state;
    const score = [`Score ${s.score}, lives bonus ${s.survivalBonus}`];
    if (run?.kind === 'arcade') {
      this.#runScore += s.score;
      score.push(`Run total ${this.#runScore}`);
    }
    if (run?.kind === 'arcade' && run.level < this.#levelSongs.length - 1) {
      this.#message.show(`Level ${run.level + 1} complete`, LIME, [
        `${this.#song.title}, ${difficulty}`,
        ...score,
        `Press any key or button for level ${run.level + 2}`,
      ]);
      this.#afterComplete = () => {
        this.#sound('start');
        this.#run = { kind: 'arcade', level: run.level + 1 };
        void this.#beginLevel();
      };
    } else if (run?.kind === 'arcade') {
      this.#message.show('All levels complete', LIME, [
        `Every level on ${difficulty}`,
        ...score,
        'Press any key or button to continue',
      ]);
      this.#afterComplete = () => this.#toTitle();
    } else {
      this.#message.show('Song complete', LIME, [`${this.#song.title}, ${difficulty}`, ...score, 'Press any key or button to continue']);
      this.#afterComplete = () => this.#toTitle();
    }
  }

  readonly #nextInput = (tick: number): number => {
    const auto = this.#autopilot;
    if (auto) {
      this.#input.sample();
      return auto[tick] ?? 0;
    }
    return this.#input.sample();
  };

  // Frame ---------------------------------------------------------------------------------

  readonly #frame = (now: number): void => {
    const start = performance.now();
    this.#pollPads(now);
    const r = this.#r;
    const level = this.#level;
    const blink = Math.floor(now / PROMPT_BLINK_MS) % 2 === 0;
    switch (this.#mode) {
      case 'start': {
        this.#title.update(null, blink);
        r.starfield.draw((now / 1000) * TITLE_DRIFT_PX_PER_S);
        break;
      }
      case 'title': {
        const view = {
          cursor: this.#menu.cursor,
          practice: this.#songs[this.#menu.song]!,
          difficulty: this.#menu.difficulty,
          music: this.#titleSong,
        };
        this.#title.update(view, blink);
        r.starfield.draw((now / 1000) * TITLE_DRIFT_PX_PER_S);
        if (!this.#transition && this.#demo && this.#music === 'title' && this.#playerReady) {
          const idle = now - this.#lastInput;
          const t = this.#playerReady.songTimeSeconds();
          const cue = t >= DEMO_CUE_S - FADE_HALF_MS / 1000 && t < DEMO_CUE_S && idle >= DEMO_CUE_IDLE_MS;
          if (cue || idle >= DEMO_IDLE_MS) this.#fadeThrough(() => this.#startDemo());
        }
        break;
      }
      case 'demo': {
        this.#drawDemo(now, blink);
        break;
      }
      case 'jukebox': {
        this.#drawJukebox();
        r.starfield.draw((now / 1000) * TITLE_DRIFT_PX_PER_S);
        break;
      }
      case 'controls': {
        // From the title the stars drift on; from the pause the game stays frozen.
        if (this.#controlsFrom === 'title') r.starfield.draw((now / 1000) * TITLE_DRIFT_PX_PER_S);
        break;
      }
      case 'intro': {
        if (level) drawPlay(r, level, this.#state, 0);
        if (now - this.#modeSince >= INTRO_MS) {
          this.#message.container.visible = false;
          void this.#startRun();
        }
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
      case 'gameover': {
        const elapsed = now - this.#modeSince;
        r.explosion.draw(elapsed);
        r.flash.draw(elapsed);
        if (elapsed >= PROMPT_DELAY_MS && !this.#message.container.visible) {
          this.#message.container.visible = true;
          this.#message.show('Game over', MAGENTA, [
            `Score ${this.#state.score}`,
            'Esc or B returns to the title screen',
            'Press any key or button to retry',
          ]);
        }
        const player = this.#playerReady;
        if (this.#music === 'gameover' && player && player.songTimeSeconds() >= GAME_OVER_MUSIC.seconds) {
          this.#stopMusic();
        }
        break;
      }
      default:
        break;
    }
    this.#drawFade(now);
    r.render();
    this.#options.perf?.record(performance.now() - start);
    requestAnimationFrame(this.#frame);
  };

  /** The title song's level, flown by the autopilot at the point the music has reached. */
  #drawDemo(now: number, blink: boolean): void {
    const demo = this.#demo;
    const player = this.#playerReady;
    this.#demoBanner.update(blink);
    if (!demo || !player || this.#music !== 'title') return;
    const clock = player.songTimeSamples();
    const target = targetTick(clock, demo.level.tickCount);
    // The title music loops; when it starts over, so does the demo.
    if (target < this.#state.tick) resetSimState(this.#state);
    catchUp(demo.level, this.#state, target, (tick) => demo.inputs[tick] ?? 0, null);
    const shown = this.#clock.update(now, clock, this.#state.tick);
    drawPlay(this.#r, demo.level, this.#state, shown);
    const over = now - this.#modeSince >= DEMO_LENGTH_MS || this.#state.dead || this.#state.finished;
    if (over && !this.#transition) this.#fadeThrough(() => this.#toTitle());
  }

  #drawFade(now: number): void {
    const t = this.#transition;
    if (!t) return;
    const elapsed = now - t.start;
    if (elapsed >= FADE_HALF_MS && !t.fired) {
      t.fired = true;
      t.mid();
      // mid() may have cancelled this fade (toTitle does); it then fades back in from here.
      this.#transition = t;
    }
    if (elapsed >= 2 * FADE_HALF_MS) {
      this.#transition = null;
      this.#fade.set(0);
      return;
    }
    this.#fade.set(elapsed < FADE_HALF_MS ? elapsed / FADE_HALF_MS : 2 - elapsed / FADE_HALF_MS);
  }

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
      durationSeconds: this.#loadedSeconds,
      levels: this.#barLevels,
    });
  }
}
