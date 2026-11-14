// The game flow: the start screen, the title menu with its music and attract demo, the
// jukebox, and runs (the arcade levels in order, or one song from Levels) with their intro
// cards, pause, game over, and level complete, and replays of finished runs. The song
// clock drives the sim (docs/DEVELOPMENT.md, "Renderer and game loop").

import {
  Cheat,
  ARCADE_MAX_SAMPLES,
  Difficulty,
  GEN_VERSION,
  NAME_MAX,
  SIM_VERSION,
  SAMPLES_PER_TICK,
  SAMPLE_RATE,
  PLAYFIELD_WIDTH,
  Q8,
  autopilotInputs,
  createSimState,
  cutLevelData,
  decodeReplay,
  deserializeLevelData,
  runInputLog,
  encodeReplay,
  generateLevel,
  resetSimState,
  type DifficultyName,
  type Replay,
  type Level,
  type LevelData,
} from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { createAudioPlayer, outputLatencyOf, type AudioPlayer } from '../audio/index.ts';
import { SyncSession, type SyncResult } from '../audio/sync.ts';
import { EffectsMixer } from '../audio/mixer.ts';
import { MenuSounds, type MenuSound } from '../audio/sfx.ts';
import { SongNotes } from '../audio/song-notes.ts';
import { songLook, type SongLook } from '../render/copper.ts';
import { FLASH_PEAK } from '../render/flash.ts';
import { BACKGROUND, CYAN, LIME, MAGENTA } from '../render/palette.ts';
import { PixelText } from '../render/text.ts';
import { seededRandom } from '../render/random.ts';
import type { GameRenderer } from '../render/renderer.ts';
import { barBinEdges, barLevels } from '../render/spectrum.ts';
import { analyzeSerializedInWorker } from './analysis.ts';
import { keepStorage, openLibrary, sha256Hex, type Library, type RunKind, type StoredSong } from './library.ts';
import {
  STANDARD_PROFILE,
  assign,
  defaultBindings,
  directionWithoutKey,
  isLockedSlot,
  isReservedKey,
  loadBindings,
  padInputLabel,
  padLayout,
  saveBindings,
  type Bindings,
  type KeyAction,
} from './bindings.ts';
import { PadBit, PadCapture, PadTracker, PadWatcher, connectedPads, padMenuAction, padProfile, readGamepadLean, readGamepads } from './gamepad.ts';
import type { Lean } from './lean.ts';
import { TouchControls } from './touch.ts';
import { BACK_SLOT, FOURTH_SLOT, SELECT_SLOT, THIRD_SLOT, type TouchKey } from './touch-input.ts';
import { enterFullScreen, exitFullScreen } from './fullscreen.ts';
import {
  BACK_ICON_MAP,
  NAME_ICON_MAP,
  NEXT_ICON_MAP,
  POST_ICON_MAP,
  REMOVE_ARMED_ICON_MAP,
  REMOVE_ICON_MAP,
  REPLAY_ICON_MAP,
  RETRY_ICON_MAP,
  SAVE_ICON_MAP,
  SELECT_ICON_MAP,
  SKIP_ICON_MAP,
  STOP_ICON_MAP,
  TITLE_ICON_MAP,
} from '../render/icons.ts';
import { CodeListener, keyToken, padToken, type CodeToken } from './secrets.ts';
import { InputSampler, KeyMap, type MenuAction } from './input.ts';
import { DisplayClock, InputLog, catchUp, targetTick } from './loop.ts';
import { ControlsScreen } from './controls.ts';
import { SoundCues, type Cue } from './cues.ts';
import { ColourFlood, HangarIntro, PLAY_AT, WIPE_MS, hangarCues, introTime, loadHangarArt } from './hangar.ts';
import { CreditsRoll, CreditsScreen, creditRows, endingRows, viewHeight } from './credits.ts';
import { HelpScreen } from './help.ts';
import {
  CONTROL_PAGES,
  ControlsPages,
  DIFFICULTY_LABELS,
  DIFFICULTY_ORDER,
  JukeboxMenu,
  KeysMenu,
  PauseMenu,
  SettingsMenu,
  TitleMenu,
  type TitleEvent,
} from './menu.ts';
import { Leaderboards, outcomeLine, type Outcome } from './net.ts';
import { NameEntry, loadLastName, nameHint, saveLastName, type NameEdit, type NameEvent } from './name-entry.ts';
import { TouchTextEntry } from './touch-text.ts';
import { ScoresMenu, ScoresScreen, type BoardChoice } from './scores.ts';
import { KeysScreen } from './keys-screen.ts';
import { PerfMeter, perfReport, perfText } from './perf.ts';
import { drawPlay } from './play-view.ts';
import {
  DemoBanner,
  FadeOverlay,
  JukeboxScreen,
  MessageScreen,
  PauseScreen,
  SettingsScreen,
  SPECTRUM_BARS,
  SPECTRUM_SEGMENTS,
  TitleScreen,
} from './screens.ts';
import {
  GAME_OVER_MUSIC,
  IMPOSSIBLE_SONG_IDS,
  LEVEL_SONG_IDS,
  TITLE_SONG_ID,
  CREDITS_SONG_ID,
  fetchSongBytes,
  songById,
  FOLDER_PICKER,
  IMPORT_EXTENSIONS,
  importedSong,
  isSongFileName,
  titleFromFileName,
  type BundledSong,
} from './songs.ts';
import { REPLAY_HINT, bestKey, recordBest, replayHint, resultRow, resultRows, scoreBreakdown } from './results.ts';
import { browserStorage, loadSettings, saveSettings, volumeGain, type Settings } from './settings.ts';
import { SyncScreen } from './sync-screen.ts';

type Mode =
  | 'start'
  | 'title'
  | 'demo'
  | 'jukebox'
  | 'controls'
  | 'settings'
  | 'keys'
  | 'sync'
  | 'help'
  | 'credits'
  | 'scores'
  | 'hangar'
  | 'analyzing'
  | 'intro'
  | 'play'
  | 'paused'
  | 'replay'
  | 'gameover'
  | 'complete'
  | 'error';

/** What the player is playing, which decides what happens when a song ends. */
type Music = 'title' | 'jukebox' | 'run' | 'gameover' | 'credits' | null;

/** A run: the arcade levels in order from `level` (0-based), or one song from Levels. */
/** An arcade run plays `songs` in order: the eight levels, or Impossible's one. */
type Run = { kind: 'arcade'; level: number; songs: readonly BundledSong[] } | { kind: 'single'; song: BundledSong };

/**
 * A song's bytes, its LevelData per tempo once analyzed (each difficulty plays the song at
 * its own tempo), and the levels made from it so far.
 */
interface SongCache {
  bytes: Promise<Uint8Array>;
  levelData: Map<number, Promise<LevelData>>;
  /** Keyed by difficulty, with '-cut' after it for the arcade's cut (ARCADE_MAX_SAMPLES). */
  levels: Map<string, { level: Level; autopilot: Uint16Array | null }>;
}

/** A cut level's music fades out over its last seconds (docs/PLAN.md, "Level length"). */
const CUT_FADE_SECONDS = 3;

/** How long game over and level complete ignore keys, so a key held from play doesn't skip them. */
const PROMPT_DELAY_MS = 700;
/** The frame-stats readout's top edge, below the HUD's score and its backing. */
const PERF_READOUT_Y = 17;
/** The title screen's stars drift at this many px per second of terrain scroll. */
const TITLE_DRIFT_PX_PER_S = 40;
/** Prompts and the menu cursor blink this often. */
const PROMPT_BLINK_MS = 600;
/** The Keys screen waits this long for a key or button, then gives up. */
const CAPTURE_MS = 5000;
/** A note on the Keys screen's hint line shows this long. */
const KEYS_NOTE_MS = 2000;
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
/** The ending's credits song fades in over this long. */
const CREDITS_FADE_IN_S = 2;
/** The card before each level stays this long. */
const INTRO_MS = 2000;
/** The jukebox spectrum: analyser size and the range its bars cover. */
const FFT_SIZE = 1024;
const SPECTRUM_LOW_HZ = 60;
const SPECTRUM_HIGH_HZ = 14_000;

/** A replay playing: its level, and the screen it returns to when it ends. */
interface Playback {
  replay: Replay;
  song: BundledSong;
  level: Level;
  from: 'gameover' | 'complete' | 'title';
}

/** What the level-complete screen shows, so it can be shown again after a replay. */
interface CompleteView {
  heading: string;
  lines: string[];
  /** What any key does, for the prompt ("Any key Next") and a touch screen's Select key. */
  action: 'Next' | 'Credits' | 'Title' | 'Back';
  /** A line to show in amber (a new best), or none. */
  highlight?: number;
  after: () => void;
}

/** How far effects pan towards the side they happened on: 1 would be hard left or right. */
const PAN_WIDTH = 0.6;

/** Keys in the hangar intro count after this long, so the press that chose Play doesn't skip it. */
const HANGAR_SKIP_DELAY_MS = 300;

/** Shown on game over and level complete when the run has a replay. */
/** The largest song file the game imports. The biggest bundled song is under 200 KB. */
const MAX_IMPORT_BYTES = 32 * 1024 * 1024;
/** How long the jukebox shows an import's result, and how long a first Del waits for the second. */
const JUKEBOX_NOTE_MS = 3000;
const REMOVE_ARM_MS = 3000;

export interface GameOptions {
  /** The songs Levels and the jukebox offer, in menu order. */
  songs: readonly BundledSong[];
  /** The song Levels starts on. */
  song: BundledSong;
  /** Fly the ship with the autopilot instead of the keyboard (a development aid). */
  autopilot: boolean;
  /** With `?perf=1`: the frame meter, on whatever the Perf setting says (tools/perf-check.ts reads it). */
  perf: PerfMeter | null;
}

export class Game {
  readonly #r: GameRenderer;
  /** The on-screen controls, made in start(). */
  #touch: TouchControls | null = null;
  /** The sticks' lean this frame (#pollPads). */
  #lean: Lean = { x: 0, y: 0 };
  /** The songs Levels and the jukebox offer: the bundled ones, then the imported ones. */
  readonly #songs: BundledSong[];
  /** The jukebox's note line: an import's progress or result, or a removal, until `until`. */
  #jukeboxNote: { text: string; warn: boolean; until: number } | null = null;
  #importing = false;
  /** The imported song a first Del (or Select) picked for removal, until `until`. */
  #removeArmed: { song: BundledSong; until: number } | null = null;
  readonly #levelSongs: readonly BundledSong[] = LEVEL_SONG_IDS.map(songById);
  readonly #impossibleSongs: readonly BundledSong[] = IMPOSSIBLE_SONG_IDS.map(songById);
  /** The Konami code on the title screen, and whether it has turned infinite lives on. */
  readonly #konami = new CodeListener();
  #infiniteLives = false;
  /** Esc held on the keyboard, and the pad's held bits: either held while choosing Play is god mode. */
  #escHeld = false;
  #padHeld = 0;
  /** True while a pad's Start press is being handled: Start alone choosing Play isn't god mode. */
  #confirmByStart = false;
  /** The Cheat flags of the run being played, set as it starts from the title. */
  #runCheats = 0;
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
  readonly #settingsScreen = new SettingsScreen();
  readonly #syncScreen = new SyncScreen();
  /** The Sync screen's clicks and presses, and its result once they are done (null: too uneven). */
  #sync: { session: SyncSession; result: SyncResult | null | undefined; shownAt: number } | null = null;
  readonly #keysScreen = new KeysScreen();
  readonly #keysMenu = new KeysMenu();
  #bindings: Bindings = loadBindings(browserStorage());
  readonly #padWatcher = new PadWatcher();
  /** The pad the Keys screen shows: the last one used. */
  #activePad: number | null = null;
  /**
   * Waiting on the Keys screen for a key or button for the slot under the cursor, until
   * `until`; `pads` holds each pad's inputs as they were when it started.
   */
  #capture: { until: number; pads: Map<number, PadCapture> } | null = null;
  /** A note over the Keys screen's hint, such as a direction left with no key. */
  #keysNote: { text: string; until: number } | null = null;
  readonly #help = new HelpScreen();
  readonly #credits = new CreditsScreen();
  /** The credits rolling now: the title menu's, or the ending's after a finished run. */
  #creditsRoll: CreditsRoll | null = null;
  /** When the roll last moved on, for the frame's time step. */
  #creditsAt = 0;
  /** A note in place of the Credits screen's detail line, such as a link a pad can't open. */
  #creditsNote: { text: string; until: number } | null = null;
  /** The hangar intro, once its art has loaded; it shows in #hangarLayer. */
  #hangar: HangarIntro | null = null;
  readonly #hangarLayer = new Container();
  readonly #flood = new ColourFlood();
  /**
   * The hangar intro playing or skipped: when its clock started, the next of its sound cues,
   * and whether the level is loaded so Play can start the run.
   */
  #intro: { start: number; cue: number; cues: ReturnType<typeof hangarCues>; ready: boolean; skipped: boolean } | null = null;
  /** The run started from the intro is flooding into colour, and its canopy is closing. */
  #flooding = false;
  #wiping = false;
  /** Where the help screen returns to. */
  #helpFrom: 'title' | 'paused' = 'title';
  #settingsMenu: SettingsMenu;
  #settings: Settings = loadSettings(browserStorage());
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
  /** The song library and level cache (library.ts); null where IndexedDB is unavailable. */
  readonly #library: Promise<Library | null> = openLibrary();
  #mode: Mode = 'start';
  #modeSince = 0;
  /** The last key press or click on the title menu, for the demo's idle timer. */
  #lastInput = 0;
  /** A fade in progress: `mid` runs when the screen is black. */
  #transition: { start: number; mid: () => void; fired: boolean } | null = null;

  #player: Promise<AudioPlayer> | null = null;
  #playerReady: AudioPlayer | null = null;
  #sfx: MenuSounds | null = null;
  #fx: EffectsMixer | null = null;
  #musicVolume: GainNode | null = null;
  readonly #cues = new SoundCues();
  readonly #cueList: Cue[] = [];
  /** The song's notes for each level, so effects can take their pitch from it. */
  readonly #songNotes = new WeakMap<Level, SongNotes>();
  readonly #looks = new WeakMap<Level, SongLook>();
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
  /** The last finished run's replay; null for the test song, which has no hash. */
  #lastReplay: Replay | null = null;
  #playback: Playback | null = null;
  readonly #replayBanner = new DemoBanner('Replay');
  #completeView: CompleteView | null = null;
  /** The game over's results rows, made once when the run ends. */
  #results: { rows: string[]; highlight: number } | null = null;
  /** True while game over or level complete shows the run the last replay is of. */
  #offerReplay = false;
  /** The level-complete view to show again after a replay started from it. */
  #completeAfterReplay: CompleteView | null = null;
  /** The leaderboards, once the library is open; null without IndexedDB. */
  #boards: Leaderboards | null = null;
  readonly #scoresScreen = new ScoresScreen();
  #scoresMenu: ScoresMenu | null = null;
  /** Counts board loads, so a slow answer for a board no longer shown is dropped. */
  #scoresRequest = 0;
  /** The end screen's name entry while it waits for a name; null once posted or skipped, and with nothing to post. */
  #nameEntry: NameEntry | null = null;
  /** The blink state the name entry was last drawn in. */
  #nameBlink = false;
  /** With the Perf setting or `?perf=1`: frames a second and the frames' work, over each half second. */
  readonly #perfReadout = new PixelText('', LIME);
  /** A dark panel behind the readout, as behind the score, so the walls don't hide it. */
  readonly #perfBacking = new Sprite(Texture.WHITE);
  #perfFrames = 0;
  #perfSince = 0;
  /** The frame meter, made when the stats are first on. */
  #perf: PerfMeter | null;
  /** The last run's report for game over and the clear screens, or null with the stats off. */
  #perfLines: string[] | null = null;
  /** The hidden input that opens a phone's keyboard on the name entry. */
  #touchText: TouchTextEntry | null = null;
  /** The arcade run's cleared levels' replays, sent with the run when it ends. */
  #runReplays: Replay[] = [];
  /** The name each cleared level was posted under, null for one not posted: the arcade board takes the run only under one name. */
  #runNames: (string | null)[] = [];
  /** Levels the arcade's length cap ended before their song did. */
  readonly #shortened = new WeakSet<Level>();
  /** The cut level's fade-out has started. */
  #cutFading = false;
  /** The end screen's leaderboard line: what became of the run, or null for none. */
  #boardLine: string | null = null;
  /** Counts runs posted, so an answer for an earlier run doesn't change this one's line. */
  #postRequest = 0;

  constructor(r: GameRenderer, options: GameOptions) {
    this.#r = r;
    this.#songs = [...options.songs];
    this.#song = options.song;
    this.#options = options;
    this.#perf = options.perf;
    this.#menu = new TitleMenu(options.songs.length, Math.max(0, options.songs.indexOf(options.song)));
    this.#jukeboxMenu = new JukeboxMenu(options.songs.length, FOLDER_PICKER);
    this.#jukebox = new JukeboxScreen(this.#songs, FOLDER_PICKER);
    this.#settingsMenu = new SettingsMenu(this.#settings);
    this.#input.keys = new KeyMap(this.#bindings.keys);
    this.#applyLook();
    r.ui.addChild(
      this.#title.container,
      this.#jukebox.container,
      this.#controls.container,
      this.#settingsScreen.container,
      this.#syncScreen.container,
      this.#keysScreen.container,
      this.#help.container,
      this.#credits.container,
      this.#scoresScreen.container,
      this.#hangarLayer,
      this.#demoBanner.container,
      this.#replayBanner.container,
      this.#message.container,
      this.#pauseScreen.container,
      this.#fade.container,
    );
    this.#perfBacking.tint = BACKGROUND;
    this.#perfBacking.alpha = 0.85;
    this.#perfBacking.height = 11;
    r.ui.addChild(this.#perfBacking, this.#perfReadout);
    this.#perfReadout.visible = this.#perfBacking.visible = this.#perfOn;
    this.#setMode('start');
  }

  start(): void {
    window.addEventListener('keydown', (e) => this.#onKeyDown(e));
    window.addEventListener('keyup', (e) => {
      this.#input.keyUp(e.code);
      if (e.code === 'Escape') this.#escHeld = false;
    });
    // A click acts on the press; a touch on the lift, the event that lets sound start (the
    // HTML spec's activation-triggering input events: pointerdown only for a mouse,
    // pointerup for anything else).
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') this.#onPointer(false);
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse') this.#onPointer(true);
    });
    // On the Sync screen a click or touch counts on its press, before the touch controls take it.
    window.addEventListener(
      'pointerdown',
      () => {
        if (this.#mode === 'sync') this.#syncPress();
      },
      { capture: true },
    );
    // Full screen (fullscreen.ts), from a user activation. A touch or pen asks on every lift
    // while it's off, so one swiped away comes back. A mouse or key asks once, leaving the
    // start screen: without Keyboard Lock, Esc (pause and back) leaves full screen, and
    // asking again on the next key would fight the player. Settings turns it on or off.
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'mouse' && this.#mode === 'start' && this.#settings.fullScreen) enterFullScreen();
      },
      { capture: true },
    );
    window.addEventListener(
      'pointerup',
      (e) => {
        if (e.pointerType !== 'mouse' && this.#settings.fullScreen) enterFullScreen();
      },
      { capture: true },
    );
    this.#touch = new TouchControls(document.body, this.#r.renderer.canvas as HTMLCanvasElement, () => this.#onPointer(true));
    this.#touch.onPlacement = () => this.#place();
    this.#place();
    this.#touchText = new TouchTextEntry(document.body);
    this.#touchText.onChange = (text) => {
      if (this.#nameEntry?.replace(text)) this.#refreshEndScreen();
    };
    this.#touch.setStartScreen(this.#mode === 'start');
    window.addEventListener('blur', () => {
      this.#input.clear();
      this.#escHeld = false;
      void this.#pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.#pause();
    });
    window.addEventListener('resize', () => this.#place());
    // The mouse wheel scrolls the help screen.
    window.addEventListener('wheel', (e) => {
      if (this.#mode !== 'help' || e.deltaY === 0) return;
      if (this.#help.scroller.scroll(e.deltaY > 0 ? 1 : -1)) this.#help.update();
    });
    // A replay file dropped on the title screen plays; song files dropped on the title or
    // the jukebox are imported.
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      const songs = files.filter((f) => isSongFileName(f.name));
      if (songs.length > 0) {
        if (this.#mode === 'title') this.#openJukebox();
        if (this.#mode === 'jukebox') void this.#importFiles(songs);
      } else if (files[0]) {
        void this.#onDropReplay(files[0]);
      }
    });
    void this.#loadImported();
    void this.#openBoards();
    window.addEventListener('online', () => void this.#boards?.flush());
    // Pasting types into the name entry.
    window.addEventListener('paste', (e) => {
      if (!this.#nameEntryUp()) return;
      const text = e.clipboardData?.getData('text') ?? '';
      if (this.#nameEntry!.type(text.trim())) {
        e.preventDefault();
        this.#refreshEndScreen();
      }
    });
    // The hangar intro's art: a few KB, ready long before anyone presses Play.
    loadHangarArt().then(
      (art) => {
        this.#hangar = new HangarIntro(art);
        this.#applyLook();
        this.#hangarLayer.addChild(this.#hangar.container);
      },
      (err: unknown) => console.error('hangar intro unavailable:', err),
    );
    requestAnimationFrame(this.#frame);
  }

  /** Sizes and places the picture, then the touch controls around it. */
  #place(): void {
    this.#r.resize(this.#touch?.pictureTop ?? false);
    this.#touch?.layout();
  }

  /** True while the touch buttons are on show: on-screen prompts leave out keys then, since the buttons say what they do. */
  #touchShown(): boolean {
    return this.#touch?.visible ?? false;
  }

  /**
   * The touch buttons for the screen on show (Brad, 2026-11-12): the six play buttons in
   * play, and off it only the keys the screen uses, as icons.
   */
  #touchKeys(): TouchKey[] | null {
    const select = (label = 'Select', icon: readonly string[] = SELECT_ICON_MAP): TouchKey => ({ slot: SELECT_SLOT, label, icon, bits: PadBit.a });
    const back = (label = 'Back', icon: readonly string[] = BACK_ICON_MAP): TouchKey => ({ slot: BACK_SLOT, label, icon, bits: PadBit.b });
    switch (this.#mode) {
      case 'play':
      case 'intro':
      case 'hangar':
        return null;
      case 'title':
      case 'paused':
      case 'controls':
      case 'settings':
      case 'keys':
      case 'help':
      case 'credits':
      case 'scores':
        // Back on the title does nothing alone, but held while Select chooses Play it gives
        // god mode, as Esc does, and B is in the Konami code.
        return [select(), back()];
      case 'jukebox': {
        const keys = [select(), back()];
        const row = this.#jukeboxMenu.row;
        const song = row.kind === 'song' ? this.#songs[row.song] : undefined;
        if (song?.imported) {
          const armed = this.#removeArmed !== null && this.#removeArmed.song === song && performance.now() < this.#removeArmed.until;
          keys.push({ slot: THIRD_SLOT, label: armed ? 'Confirm' : 'Remove', icon: armed ? REMOVE_ARMED_ICON_MAP : REMOVE_ICON_MAP, bits: PadBit.select });
        }
        return keys;
      }
      case 'sync': {
        const sync = this.#sync;
        if (!sync || sync.result === undefined) return [back()];
        const retry: TouchKey = { slot: THIRD_SLOT, label: 'Retry', icon: RETRY_ICON_MAP, bits: PadBit.y };
        return sync.result ? [select('Keep'), retry, back()] : [retry, back()];
      }
      case 'replay':
        return [select('Stop', STOP_ICON_MAP)];
      case 'gameover':
      case 'complete': {
        if (this.#nameEntry) {
          if (!this.#nameEntryUp()) return [];
          const entry = this.#nameEntry;
          return [
            select('Post', POST_ICON_MAP),
            back('Skip', SKIP_ICON_MAP),
            { slot: THIRD_SLOT, label: 'Name', icon: NAME_ICON_MAP, bits: 0, action: () => this.#touchText?.open(entry.name, NAME_MAX, true) },
          ];
        }
        const action = this.#mode === 'gameover' ? 'Retry' : (this.#completeView?.action ?? 'Title');
        const icon = action === 'Retry' ? RETRY_ICON_MAP : action === 'Title' ? TITLE_ICON_MAP : action === 'Back' ? BACK_ICON_MAP : NEXT_ICON_MAP;
        const keys = [select(action, icon)];
        if (action !== 'Title' && action !== 'Back') keys.push(back('Title', TITLE_ICON_MAP));
        if (this.#offerReplay && this.#lastReplay) {
          keys.push(
            { slot: THIRD_SLOT, label: 'Replay', icon: REPLAY_ICON_MAP, bits: PadBit.y },
            {
              slot: FOURTH_SLOT,
              label: 'Save',
              icon: SAVE_ICON_MAP,
              bits: 0,
              action: () => {
                if (this.#onEndScreen()) this.#saveReplay();
              },
            },
          );
        }
        return keys;
      }
      default:
        return [];
    }
  }

  // Screens -------------------------------------------------------------------------------

  #setMode(mode: Mode): void {
    this.#mode = mode;
    // The screen on show, for tools that drive the game (tools/offline-check.ts).
    document.documentElement.dataset['mode'] = mode;
    this.#touch?.setStartScreen(mode === 'start');
    this.#modeSince = performance.now();
    this.#title.container.visible = mode === 'start' || mode === 'title';
    this.#jukebox.container.visible = mode === 'jukebox';
    this.#controls.container.visible = mode === 'controls';
    this.#settingsScreen.container.visible = mode === 'settings';
    this.#syncScreen.container.visible = mode === 'sync';
    this.#keysScreen.container.visible = mode === 'keys';
    this.#help.container.visible = mode === 'help';
    this.#credits.container.visible = mode === 'credits';
    this.#scoresScreen.container.visible = mode === 'scores';
    this.#hangarLayer.visible = mode === 'hangar' || (mode === 'play' && this.#wiping);
    this.#pauseScreen.container.visible = mode === 'paused';
    this.#demoBanner.container.visible = mode === 'demo';
    this.#replayBanner.container.visible = mode === 'replay';
    this.#message.container.visible = mode === 'analyzing' || mode === 'error' || mode === 'intro';
    this.#r.world.visible =
      mode === 'demo' ||
      mode === 'intro' ||
      mode === 'play' ||
      mode === 'paused' ||
      mode === 'replay' ||
      mode === 'gameover' ||
      mode === 'complete';
    this.#r.combat.hud.visible = this.#r.world.visible;
    if (mode === 'analyzing') this.#message.show('', 0, ['Loading']);
    if (mode === 'paused') this.#pauseScreen.update(this.#pauseMenu.cursor);
    if (mode === 'controls') this.#controls.show(this.#controlsPages.page, this.#bindings);
    if (mode === 'keys') this.#updateKeys(performance.now());
    if (mode === 'settings') this.#settingsScreen.update(this.#settingsMenu.cursor, this.#settingsMenu.values);
  }

  #showError(err: unknown): void {
    console.error(err);
    const text = err instanceof Error ? err.message : String(err);
    this.#setMode('error');
    this.#message.show('Error', MAGENTA, [text.slice(0, 60), 'Reload to retry']);
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
    const keys = this.#input.keys;
    if (this.#capture) {
      e.preventDefault();
      if (!e.repeat) this.#captureKey(e.code);
      return;
    }
    // The phone's keyboard types into its input, which tells the form (#touchText.onChange);
    // only Enter and Esc act here.
    if (this.#touchText?.owns(e)) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!e.repeat) this.#onMenu('confirm');
      } else if (e.key === 'Escape') {
        this.#onMenu('back');
      }
      return;
    }
    // Game keys don't scroll the page or start the browser's find-as-you-type.
    if (keys.action(e.code) || e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    this.#input.keyDown(e.code);
    if (e.code === 'Escape') this.#escHeld = true;
    this.#setLastPressPad(false);
    const modifier = e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta';
    if (modifier && !keys.action(e.code)) return;
    switch (this.#mode) {
      case 'start':
        if (e.repeat) return;
        if (this.#settings.fullScreen && e.key !== 'Escape') enterFullScreen();
        this.#leaveStart();
        return;
      case 'demo':
        // Any key leaves the demo and does nothing else.
        if (!e.repeat) this.#toTitle();
        return;
      case 'replay':
        if (!e.repeat) this.#endReplay(true);
        return;
      case 'hangar':
        if (!e.repeat) this.#skipHangar();
        return;
      case 'paused':
        // Q quits straight to the title, as before the pause menu, unless it is bound.
        if (e.code === 'KeyQ' && !keys.action(e.code)) {
          if (!e.repeat) this.#toTitle();
        } else {
          this.#menuKey(e);
        }
        return;
      case 'title':
        if (!e.repeat) this.#codePress(keyToken(e.code));
        this.#menuKey(e);
        return;
      case 'keys':
        if (e.code === 'Delete') {
          if (!e.repeat) this.#clearSlot();
        } else {
          this.#menuKey(e);
        }
        return;
      case 'jukebox':
        if (e.code === 'Delete') {
          if (!e.repeat) this.#removePress();
        } else {
          this.#menuKey(e);
        }
        return;
      case 'controls':
      case 'settings':
      case 'help':
      case 'credits':
      case 'scores':
        this.#menuKey(e);
        return;
      case 'sync':
        if (!e.repeat) this.#syncKey(e.code);
        return;
      default:
        break;
    }
    if (this.#nameKey(e)) return;
    if (e.repeat) return;
    if (keys.action(e.code) === 'pause') {
      if (this.#mode === 'play') void this.#pause();
      else if (this.#mode === 'gameover' || this.#mode === 'complete') this.#toTitle();
      return;
    }
    if ((e.code === 'KeyR' || e.code === 'KeyS') && this.#onEndScreen()) {
      if (e.code === 'KeyR') this.#watchLastReplay();
      else this.#saveReplay();
      return;
    }
    this.#onAnyKey();
  }

  /** A key on a menu: a held arrow repeats; a held Enter or Esc does not. */
  #menuKey(e: KeyboardEvent): void {
    const action = this.#input.keys.menuAction(e.code);
    if (action && (!e.repeat || action === 'up' || action === 'down' || action === 'left' || action === 'right')) {
      e.preventDefault();
      this.#onMenu(action);
    }
  }

  /** Polls the gamepads: their held bits go to the sim, new presses act like keys. */
  #pollPads(now: number): void {
    const pads = connectedPads();
    const active = this.#padWatcher.update(pads);
    if (active !== null) this.#activePad = active;
    this.#touch?.setPadConnected(pads.length > 0);
    // While the Keys screen waits, pads go to it and nothing else.
    const capturing = this.#capture !== null;
    if (this.#capture) this.#capturePad(pads, active);
    const bits = readGamepads(pads, this.#bindings) | (this.#touch?.bits ?? 0);
    this.#padHeld = bits;
    // The sticks steer the ship by how far they lean (setLean), so their direction bits,
    // which move the menus' cursor, don't go to the sim; the keys' still do.
    this.#input.setPad(bits & ~(PadBit.up | PadBit.down | PadBit.left | PadBit.right));
    const lean = readGamepadLean(pads, this.#bindings, this.#lean);
    this.#touch?.addLean(lean);
    this.#input.setLean(lean.x, lean.y);
    const presses = this.#pads.update(bits, now);
    if (!capturing) for (const bit of presses) this.#onPadPress(bit);
    this.#touch?.endFrame();
  }

  #onPadPress(bit: number): void {
    this.#setLastPressPad(true);
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
      case 'replay':
        this.#endReplay(true);
        return;
      case 'hangar':
        this.#skipHangar();
        return;
      case 'title': {
        this.#codePress(padToken(bit));
        const action = padMenuAction(bit);
        this.#confirmByStart = bit === PadBit.start;
        if (action) this.#onMenu(action);
        this.#confirmByStart = false;
        return;
      }
      case 'jukebox':
        if (bit === PadBit.select) {
          this.#removePress();
          return;
        }
        const jukeboxAction = padMenuAction(bit);
        if (jukeboxAction) this.#onMenu(jukeboxAction);
        return;
      case 'sync':
        this.#syncPad(bit);
        return;
      case 'controls':
      case 'settings':
      case 'keys':
      case 'help':
      case 'credits':
      case 'scores': {
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
        // On the name entry, Y erases and the rest are as on a menu: A posts, B skips.
        if (this.#nameEntry) {
          const edit: NameEdit | null = bit === PadBit.y ? 'erase' : padMenuAction(bit);
          if (edit && this.#nameEntryUp()) this.#onNameEvent(this.#nameEntry.apply(edit));
          return;
        }
        // B or Select is Esc, Y and X are R and S, and any other button is any key.
        // Directions don't count, so a stick still leaning from play doesn't skip the screen.
        if (bit === PadBit.b || bit === PadBit.select) this.#toTitle();
        else if (bit === PadBit.y && this.#onEndScreen()) this.#watchLastReplay();
        else if (bit === PadBit.x && this.#onEndScreen()) this.#saveReplay();
        else if ((bit & (PadBit.up | PadBit.down | PadBit.left | PadBit.right)) === 0) this.#onAnyKey();
        return;
      default:
        return;
    }
  }

  /** A click, or a touch (`touch`) on its lift. */
  #onPointer(touch: boolean): void {
    if (this.#capture) this.#endCapture();
    // On the name entry a touch opens the phone's keyboard, and a click does nothing.
    else if (this.#nameEntry && (this.#mode === 'gameover' || this.#mode === 'complete')) {
      if (touch && this.#nameEntryUp()) this.#touchText?.open(this.#nameEntry.name, NAME_MAX, true);
    }
    // A click or touch while the clicks play counted on its pointerdown (start()).
    else if (this.#mode === 'sync') {
      if (this.#sync?.result !== undefined) this.#syncKey('Enter');
    }
    else if (this.#mode === 'start') this.#leaveStart();
    else if (this.#mode === 'demo') this.#toTitle();
    else if (this.#mode === 'replay') this.#endReplay(true);
    else if (this.#mode === 'hangar') this.#skipHangar();
    else if (
      this.#mode === 'title' ||
      this.#mode === 'jukebox' ||
      this.#mode === 'paused' ||
      this.#mode === 'controls' ||
      this.#mode === 'settings' ||
      this.#mode === 'keys' ||
      this.#mode === 'help' ||
      this.#mode === 'credits' ||
      this.#mode === 'scores'
    ) {
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
    if (this.#mode === 'settings') {
      this.#onSettingsMenu(action);
      return;
    }
    if (this.#mode === 'scores') {
      this.#onScoresMenu(action);
      return;
    }
    // The phone keyboard's Enter (and Esc) arrive here (#onKeyDown).
    if (this.#mode === 'gameover' || this.#mode === 'complete') {
      if (this.#nameEntryUp()) this.#onNameEvent(this.#nameEntry!.apply(action));
      return;
    }
    if (this.#mode === 'keys') {
      this.#onKeysMenu(action);
      return;
    }
    if (this.#mode === 'credits') {
      this.#onCreditsMenu(action);
      return;
    }
    if (this.#mode === 'help') {
      const event = this.#help.scroller.apply(action);
      if (event === 'moved') this.#help.update();
      else if (event === 'back') {
        this.#sound('back');
        this.#leaveHelp();
      }
      return;
    }
    if (this.#mode === 'controls') {
      const event = this.#controlsPages.apply(action);
      if (event === 'moved') {
        this.#sound('move');
        this.#controls.show(this.#controlsPages.page, this.#bindings);
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
      case 'import':
        this.#openFilePicker(command.folder);
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

  /** A press on the title screen, for the Konami code: it turns infinite lives on or off. */
  #codePress(token: CodeToken | null): void {
    if (!this.#konami.push(token)) return;
    this.#infiniteLives = !this.#infiniteLives;
    this.#sound(this.#infiniteLives ? 'secret' : 'back');
  }

  /** God mode: Esc, or a pad's Start, held while Play is chosen by another key or button. */
  #godHeld(): boolean {
    // On a touch screen it is Back held, as Esc is on a keyboard.
    const touchBack = ((this.#touch?.bits ?? 0) & PadBit.b) !== 0;
    return this.#escHeld || touchBack || ((this.#padHeld & PadBit.start) !== 0 && !this.#confirmByStart);
  }

  #onTitleEvent(event: TitleEvent): void {
    const lives = this.#infiniteLives ? Cheat.infiniteLives : 0;
    switch (event) {
      case 'moved':
        this.#sound('move');
        break;
      case 'changed':
        this.#sound('change');
        break;
      case 'impossible':
        this.#sound('secret');
        break;
      case 'play': {
        const god = this.#godHeld();
        this.#sound(god ? 'secret' : 'start');
        const songs = this.#menu.difficulty === 'impossible' ? this.#impossibleSongs : this.#levelSongs;
        this.#run = { kind: 'arcade', level: 0, songs };
        this.#runCheats = lives | (god ? Cheat.god : 0);
        this.#runScore = 0;
        this.#runReplays = [];
        this.#runNames = [];
        void this.#beginLevel(true);
        break;
      }
      case 'levels':
        this.#sound('start');
        this.#run = { kind: 'single', song: this.#songs[this.#menu.song]! };
        this.#runCheats = lives;
        void this.#beginLevel();
        break;
      case 'jukebox':
        this.#sound('select');
        this.#openJukebox();
        break;
      case 'scores':
        this.#sound('select');
        this.#openScores();
        break;
      case 'controls':
        this.#sound('select');
        this.#openControls('title');
        break;
      case 'help':
        this.#sound('select');
        this.#openHelp('title');
        break;
      case 'settings':
        this.#sound('select');
        this.#settingsMenu.cursor = 0;
        this.#setMode('settings');
        break;
      case 'credits':
        this.#sound('select');
        this.#openCredits(null);
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
      case 'help':
        this.#sound('select');
        this.#openHelp('paused');
        break;
      case 'quit':
        this.#sound('back');
        this.#toTitle();
        break;
      case null:
        break;
    }
  }

  // Leaderboards --------------------------------------------------------------------------

  /** Opens the leaderboards on the library's key and queue, and sends what's queued. */
  async #openBoards(): Promise<void> {
    const library = await this.#library;
    if (!library) return;
    this.#boards = new Leaderboards(library, (hash) => this.#songBytesFor(hash));
    await this.#boards.flush();
  }

  /** A song's bytes by its hash, for the server to check a run on a song it lacks. */
  async #songBytesFor(hash: string): Promise<Uint8Array | null> {
    const song = this.#songs.find((s) => s.sha256 === hash);
    if (!song) return null;
    try {
      return await this.#cacheFor(song).bytes;
    } catch {
      return null;
    }
  }

  /**
   * At a run's end: keeps an arcade level's replay for the run, and puts up the name entry
   * when the run can be posted. A run with a cheat isn't posted, nor one where the browser
   * can't sign.
   */
  #endRun(): void {
    this.#boardLine = null;
    this.#nameEntry = null;
    const replay = this.#lastReplay;
    const run = this.#run;
    if (replay && run?.kind === 'arcade' && this.#state.finished) this.#runReplays.push(replay);
    const boards = this.#boards;
    if (!replay || !run || !boards || boards.available === false || replay.cheats !== 0) return;
    this.#nameEntry = new NameEntry(loadLastName(browserStorage()));
  }

  /**
   * Posts the run that just ended under `name`, or doesn't (null, skipped). A run from Levels
   * goes on its song's board. An arcade level goes on its own board (Level 1 to 8, as the
   * arcade cuts it) when it's cleared; when the run ends, at a game over (with the last try:
   * a retry and a later end post again, and the board keeps the best) or after its last
   * level, it goes on the arcade board too, if every level went under the same name.
   */
  #postRun(name: string | null): void {
    this.#nameEntry = null;
    this.#touchText?.close();
    const replay = this.#lastReplay;
    const run = this.#run;
    const boards = this.#boards;
    if (!replay || !run || !boards) return;
    let kind: RunKind = run.kind === 'arcade' ? 'level' : 'song';
    let replays = [replay];
    if (run.kind === 'arcade') {
      const finished = this.#state.finished;
      const last = run.level === run.songs.length - 1;
      if (finished) this.#runNames.push(name);
      if (name === null) return;
      const names = finished ? this.#runNames : [...this.#runNames, name];
      if ((!finished || last) && names.every((n) => n === name)) {
        kind = 'arcade';
        replays = finished ? [...this.#runReplays] : [...this.#runReplays, replay];
      }
    }
    if (name === null) return;
    saveLastName(browserStorage(), name);
    const request = ++this.#postRequest;
    this.#boardLine = 'Sending';
    // "Sent" once the run is in the queue: from there it's sent whatever the player does
    // next, so they needn't wait for the rank.
    const queued = () => {
      if (request !== this.#postRequest) return;
      this.#boardLine = 'Sent';
      this.#refreshEndScreen();
    };
    void boards.post(kind, name, replays, queued).then((outcome) => {
      if (request !== this.#postRequest) return;
      this.#showOutcome(outcome);
    });
  }

  /** True on game over or a clear screen while the name entry waits and keys count. */
  #nameEntryUp(): boolean {
    return (
      this.#nameEntry !== null &&
      (this.#mode === 'gameover' || this.#mode === 'complete') &&
      performance.now() - this.#modeSince >= PROMPT_DELAY_MS
    );
  }

  /**
   * A key on the end screen while the name entry is up: printable characters type,
   * Backspace erases, arrows edit, Enter posts, Esc skips. False when the entry isn't up.
   */
  #nameKey(e: KeyboardEvent): boolean {
    const entry = this.#nameEntry;
    if (!entry || (this.#mode !== 'gameover' && this.#mode !== 'complete')) return false;
    e.preventDefault();
    // Before the prompt shows, keys from play don't type.
    if (!this.#nameEntryUp()) return true;
    let event: NameEvent = null;
    if (e.key === 'Backspace') event = entry.erase() ? 'changed' : null;
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) event = entry.type(e.key) ? 'changed' : null;
    else {
      const action = this.#input.keys.menuAction(e.code);
      const arrow = action === 'up' || action === 'down' || action === 'left' || action === 'right';
      if (action && (!e.repeat || arrow)) event = entry.apply(action);
    }
    this.#onNameEvent(event);
    return true;
  }

  /** What an edit did on the name entry. */
  #onNameEvent(event: NameEvent): void {
    const entry = this.#nameEntry;
    if (!entry) return;
    switch (event) {
      case 'moved':
        this.#sound('move');
        break;
      case 'changed':
        this.#sound('change');
        break;
      case 'post':
        this.#sound('select');
        this.#postRun(entry.name);
        break;
      case 'skip':
        this.#sound('back');
        this.#postRun(null);
        break;
      case null:
        if (entry.error) this.#sound('back');
        break;
    }
    this.#refreshEndScreen();
  }

  /** Draws the end screen on show again, after its name entry or leaderboard line changed. */
  /**
   * Notes whether the last press was a gamepad's, and when that changes, draws the prompts
   * on show again with the keys or the buttons. The screens drawn every frame follow it there.
   */
  #setLastPressPad(pad: boolean): void {
    if (pad === this.#lastPressPad) return;
    this.#lastPressPad = pad;
    if (this.#mode === 'gameover' || this.#mode === 'complete') this.#refreshEndScreen();
    else if (this.#mode === 'sync') this.#syncScreen.setPad(pad);
  }

  #refreshEndScreen(blink = this.#blinkBright()): void {
    this.#nameBlink = blink;
    if (this.#mode === 'complete') this.#showComplete(this.#offerReplay);
    else if (this.#mode === 'gameover' && this.#message.container.visible) this.#showGameOverMessage();
  }

  #blinkBright(): boolean {
    return Math.floor(performance.now() / PROMPT_BLINK_MS) % 2 === 0;
  }

  /** The name entry's lines, its line and any error, for the end screens; none once it's done. */
  #nameLines(): string[] {
    const entry = this.#nameEntry;
    if (!entry) return [];
    return entry.error ? [entry.line(this.#nameBlink), entry.error] : [entry.line(this.#nameBlink)];
  }

  /** Puts what became of the run on the end screen, if it's still showing. */
  #showOutcome(outcome: Outcome): void {
    this.#boardLine = outcomeLine(outcome);
    this.#refreshEndScreen();
  }

  #openScores(): void {
    // The arcade's total, then each arcade level as the arcade plays it, then each song whole.
    const boards: BoardChoice[] = [{ name: 'arcade', label: 'Arcade' }];
    for (let i = 1; i <= LEVEL_SONG_IDS.length; i++) boards.push({ name: `level-${i}`, label: `Level ${i}` });
    for (const song of this.#songs) if (song.sha256) boards.push({ name: song.sha256, label: song.title });
    const difficulties = this.#menu.impossibleFound ? DIFFICULTY_ORDER : DIFFICULTY_ORDER.filter((d) => d !== 'impossible');
    this.#scoresMenu = new ScoresMenu(boards, difficulties, this.#menu.difficulty);
    this.#setMode('scores');
    this.#loadBoard();
  }

  /** Loads the board the Scores screen has chosen. */
  #loadBoard(): void {
    const menu = this.#scoresMenu;
    if (!menu) return;
    const request = ++this.#scoresRequest;
    menu.setState({ kind: 'loading' });
    void (async () => {
      const client = await this.#boards?.client();
      if (request !== this.#scoresRequest) return;
      if (!client) {
        menu.setState({ kind: 'unavailable' });
        return;
      }
      try {
        const view = await client.board(menu.choice.name, menu.difficultyName, 10, loadLastName(browserStorage()));
        if (request === this.#scoresRequest) menu.setState({ kind: 'board', view });
      } catch {
        if (request === this.#scoresRequest) menu.setState({ kind: 'offline' });
      }
    })();
  }

  #onScoresMenu(action: MenuAction): void {
    const command = this.#scoresMenu?.apply(action);
    switch (command?.type) {
      case 'moved':
        this.#sound('move');
        break;
      case 'changed':
        this.#sound('change');
        this.#loadBoard();
        break;
      case 'back':
        this.#sound('back');
        // The title music plays on.
        this.#lastInput = performance.now();
        this.#setMode('title');
        break;
      default:
        break;
    }
  }

  #onSettingsMenu(action: MenuAction): void {
    const before = { ...this.#settingsMenu.values };
    switch (this.#settingsMenu.apply(action)) {
      case 'moved':
        this.#sound('move');
        break;
      case 'changed': {
        this.#settings = { ...this.#settingsMenu.values };
        saveSettings(browserStorage(), this.#settings);
        this.#applyVolumes();
        this.#applyLook();
        this.#applySync();
        if (this.#settings.fullScreen !== before.fullScreen) {
          if (this.#settings.fullScreen) enterFullScreen();
          else exitFullScreen();
        }
        // A taste of the new effects level; the music is playing to hear its own.
        if (this.#settings.effects !== before.effects) this.#fx?.play('killShip');
        else this.#sound('change');
        break;
      }
      case 'sync':
        this.#sound('select');
        void this.#openSync();
        return;
      case 'keys':
        this.#sound('select');
        this.#keysMenu.row = 0;
        this.#keysMenu.slot = 0;
        this.#keysMenu.device = this.#lastPressPad ? 'pad' : 'keyboard';
        this.#setMode('keys');
        return;
      case 'back':
        this.#sound('back');
        this.#lastInput = performance.now();
        this.#setMode('title');
        return;
      case null:
        return;
    }
    this.#settingsScreen.update(this.#settingsMenu.cursor, this.#settingsMenu.values);
  }

  // Sync ----------------------------------------------------------------------------------

  /** Opens the Sync screen: the title music stops and the clicks start. Called from a key press or click. */
  async #openSync(): Promise<void> {
    this.#stopMusic();
    this.#setMode('sync');
    this.#syncScreen.update({ phase: 'running', presses: 0 }, this.#touchShown(), this.#lastPressPad);
    try {
      const player = await this.#getPlayer();
      if (this.#mode !== 'sync') return;
      const context = player.context;
      if (context instanceof AudioContext && context.state !== 'running') await context.resume();
      if (this.#mode !== 'sync') return;
      this.#sync?.session.stop();
      const session = new SyncSession(context, () => outputLatencyOf(context));
      session.start();
      this.#sync = { session, result: undefined, shownAt: 0 };
    } catch (err) {
      this.#showError(err);
    }
  }

  /** A press on the beat: a key, a click, a touch or a button. */
  #syncPress(): void {
    const sync = this.#sync;
    if (!sync || sync.result !== undefined) return;
    this.#syncScreen.update({ phase: 'running', presses: sync.session.press() }, this.#touchShown(), this.#lastPressPad);
    if (sync.session.done) this.#finishSync();
  }

  /** The clicks are done, or ran out: the result, which the player keeps or not. */
  #finishSync(): void {
    const sync = this.#sync;
    if (!sync || sync.result !== undefined) return;
    sync.session.stop();
    sync.result = sync.session.result();
    sync.shownAt = performance.now();
    this.#syncScreen.update({ phase: 'result', result: sync.result, was: this.#settings.syncMs }, this.#touchShown(), this.#lastPressPad);
  }

  #syncKey(code: string): void {
    const sync = this.#sync;
    if (code === 'Escape') {
      this.#leaveSync(false);
    } else if (sync?.result === undefined) {
      this.#syncPress();
    } else if (performance.now() - sync.shownAt < PROMPT_DELAY_MS) {
      // The last press of the run doesn't also keep the result.
    } else if (code === 'KeyR') {
      this.#sound('select');
      void this.#openSync();
    } else if ((code === 'Enter' || code === 'Space') && sync.result) {
      this.#leaveSync(true);
    }
  }

  /** A on the result keeps it, Y retries and B leaves; while the clicks play any other button is a press. */
  #syncPad(bit: number): void {
    if (bit === PadBit.b || bit === PadBit.select) {
      this.#leaveSync(false);
      return;
    }
    if (this.#sync?.result === undefined) {
      // A touch button counted on its pointerdown already.
      if (((this.#touch?.bits ?? 0) & bit) === 0) this.#syncPress();
      return;
    }
    if (bit === PadBit.y) this.#syncKey('KeyR');
    else if (bit === PadBit.a || bit === PadBit.start) this.#syncKey('Enter');
  }

  /** Back to Settings, keeping the measured offset if `keep`; the title music starts again. */
  #leaveSync(keep: boolean): void {
    const result = this.#sync?.result;
    this.#sync?.session.stop();
    this.#sync = null;
    if (keep && result) {
      this.#settings = { ...this.#settings, syncMs: result.offsetMs };
      this.#settingsMenu.values.syncMs = result.offsetMs;
      saveSettings(browserStorage(), this.#settings);
      this.#applySync();
      this.#sound('change');
    } else {
      this.#sound('back');
    }
    this.#setMode('settings');
    void this.#playMusic(this.#titleSong, 'title', TITLE_FADE_IN_S);
  }

  // Keys ----------------------------------------------------------------------------------

  #onKeysMenu(action: MenuAction): void {
    const menu = this.#keysMenu;
    switch (menu.apply(action)) {
      case 'moved':
        this.#sound('move');
        break;
      case 'device':
        this.#sound('change');
        break;
      case 'set':
        if (isLockedSlot(menu.action!, menu.slot, menu.device)) {
          this.#sound('back');
          this.#note('Esc always pauses');
          break;
        }
        this.#sound('select');
        this.#keysNote = null;
        this.#capture = { until: performance.now() + CAPTURE_MS, pads: new Map() };
        break;
      case 'reset':
        if (menu.device === 'keyboard') this.#bindings.keys = defaultBindings().keys;
        else delete this.#bindings.pads[this.#shownProfile()];
        this.#saveBindings();
        this.#sound('change');
        break;
      case 'back':
        this.#sound('back');
        this.#settingsScreen.update(this.#settingsMenu.cursor, this.#settingsMenu.values);
        this.#setMode('settings');
        return;
      case null:
        return;
    }
    this.#updateKeys(performance.now());
  }

  /** A key pressed while the Keys screen waits: Esc gives up; on the keyboard page, any other key that may be set is. */
  #captureKey(code: string): void {
    if (code === 'Escape') {
      this.#endCapture();
      return;
    }
    if (this.#keysMenu.device !== 'keyboard') return;
    if (isReservedKey(code)) {
      this.#sound('back');
      this.#note('Key reserved');
      return;
    }
    this.#setSlot(code, null);
  }

  /** Each frame while the Keys screen waits: the first new input on any pad, on the Pad page; a pad press gives up on the keyboard page. */
  #capturePad(pads: readonly Gamepad[], active: number | null): void {
    const capture = this.#capture!;
    if (this.#keysMenu.device === 'keyboard') {
      if (active !== null) this.#endCapture();
      return;
    }
    for (const pad of pads) {
      const seen = capture.pads.get(pad.index);
      if (!seen) {
        capture.pads.set(pad.index, new PadCapture(pad));
        continue;
      }
      const input = seen.check(pad);
      if (input) {
        this.#activePad = pad.index;
        this.#setSlot(input, padProfile(pad));
        return;
      }
    }
  }

  /**
   * Puts `input` in the slot under the cursor: a key, or an input of the pad layout
   * `profile`. A keyboard change that leaves a direction with no key is refused, since
   * menus need all four.
   */
  #setSlot(input: string | null, profile: string | null): void {
    const menu = this.#keysMenu;
    const action = menu.action;
    this.#capture = null;
    if (action === null) return;
    if (menu.device === 'keyboard') {
      const keys = assign(this.#bindings.keys, action as KeyAction, menu.slot, input);
      const missing = directionWithoutKey(keys);
      if (missing) {
        this.#sound('back');
        this.#note(`${missing[0]!.toUpperCase()}${missing.slice(1)} needs a key`);
        this.#updateKeys(performance.now());
        return;
      }
      this.#bindings.keys = keys;
    } else {
      const p = profile ?? this.#shownProfile();
      this.#bindings.pads[p] = assign(padLayout(this.#bindings, p), action, menu.slot, input);
    }
    this.#saveBindings();
    this.#sound('change');
    this.#updateKeys(performance.now());
  }

  /** Delete on the Keys screen empties the slot under the cursor. */
  #clearSlot(): void {
    const menu = this.#keysMenu;
    if (menu.action === null || isLockedSlot(menu.action, menu.slot, menu.device)) return;
    this.#setSlot(null, null);
  }

  #endCapture(): void {
    this.#capture = null;
    this.#sound('back');
    this.#updateKeys(performance.now());
  }

  #note(text: string): void {
    this.#keysNote = { text, until: performance.now() + KEYS_NOTE_MS };
  }

  #saveBindings(): void {
    saveBindings(browserStorage(), this.#bindings);
    this.#input.keys = new KeyMap(this.#bindings.keys);
    this.#input.clear();
  }

  /** The pad the Keys screen shows: the last one used, else the first connected, else none. */
  #shownPad(): Gamepad | null {
    const pads = connectedPads();
    return pads.find((pad) => pad.index === this.#activePad) ?? pads[0] ?? null;
  }

  #shownProfile(): string {
    const pad = this.#shownPad();
    return pad ? padProfile(pad) : STANDARD_PROFILE;
  }

  #updateKeys(now: number): void {
    const menu = this.#keysMenu;
    if (this.#capture && now > this.#capture.until) this.#endCapture();
    const pad = this.#shownPad();
    const profile = pad ? padProfile(pad) : STANDARD_PROFILE;
    const standard = profile === STANDARD_PROFILE;
    const layout = menu.device === 'keyboard' ? this.#bindings.keys : padLayout(this.#bindings, profile);
    const note = this.#keysNote && now < this.#keysNote.until ? this.#keysNote.text : '';
    let hint = 'Enter Set  Del Clear  Esc Back';
    if (this.#capture) hint = menu.device === 'keyboard' ? 'Press a key  Esc Cancel' : 'Press a button  Esc Cancel';
    else if (this.#lastPressPad) {
      // The shown pad's own names for Fire and Bomb: confirm and back.
      const padLayoutNow = padLayout(this.#bindings, profile);
      const fire = padLayoutNow.fire.find((i) => i !== null);
      const bomb = padLayoutNow.bomb.find((i) => i !== null);
      if (fire && bomb) hint = `${padInputLabel(fire, standard)} Set  ${padInputLabel(bomb, standard)} Back`;
    }
    this.#keysScreen.update({
      device: menu.device,
      row: menu.row,
      slot: menu.slot,
      layout,
      standard,
      padName: pad ? (standard ? 'Standard pad' : pad.id) : 'No pad',
      waiting: this.#capture !== null,
      blink: Math.floor(now / (PROMPT_BLINK_MS / 2)) % 2 === 0,
      hint: note || hint,
      warn: note !== '',
    });
  }

  /**
   * Starts the credits rolling: the title menu's (`ending` null), looping over the title
   * music, or the ending after a finished run, once, with the credits song.
   */
  #openCredits(ending: { difficulty: string; total: number } | null): void {
    const roll = ending
      ? new CreditsRoll(endingRows(this.#options.songs, ending.difficulty, ending.total), viewHeight('ending'), false)
      : new CreditsRoll(creditRows(this.#options.songs), viewHeight('menu'), true);
    this.#creditsRoll = roll;
    this.#creditsNote = null;
    this.#creditsAt = performance.now();
    this.#credits.show(roll, ending ? 'ending' : 'menu');
    if (ending) this.#clearPlay();
    this.#setMode('credits');
    if (ending) {
      this.#stopMusic();
      void this.#playMusic(CREDITS_SONG_ID ? songById(CREDITS_SONG_ID) : this.#titleSong, 'credits', CREDITS_FADE_IN_S);
    }
  }

  #onCreditsMenu(action: MenuAction): void {
    const roll = this.#creditsRoll;
    if (!roll) return;
    const command = roll.apply(action);
    switch (command?.type) {
      case 'moved':
        this.#sound('move');
        break;
      case 'open':
        this.#openLink(command.url);
        break;
      case 'skipped':
        this.#sound('back');
        break;
      case 'back':
        this.#sound('back');
        if (roll.loop) {
          // The title music plays on.
          this.#lastInput = performance.now();
          this.#setMode('title');
        } else {
          this.#toTitle();
        }
        break;
      default:
        break;
    }
  }

  /**
   * Opens a credit's page in a new tab. Browsers allow that only during a key press, click
   * or tap (user activation), so a gamepad press gets a note instead.
   */
  #openLink(url: string): void {
    if (navigator.userActivation && !navigator.userActivation.isActive) {
      this.#creditsNote = { text: 'Open: keys or touch', until: performance.now() + 3000 };
      return;
    }
    this.#sound('select');
    window.open(new URL(url, window.location.href).href, '_blank', 'noopener');
  }

  /** Opens the help screen at its top. */
  #openHelp(from: 'title' | 'paused'): void {
    this.#helpFrom = from;
    this.#help.scroller.top = 0;
    this.#help.update();
    this.#setMode('help');
  }

  #leaveHelp(): void {
    if (this.#helpFrom === 'paused') this.#setMode('paused');
    else {
      this.#lastInput = performance.now();
      this.#setMode('title');
    }
  }

  /** Opens the controls on the page for the last thing pressed: the keyboard or a pad. */
  #openControls(from: 'title' | 'paused'): void {
    this.#controlsFrom = from;
    this.#controlsPages.index = this.#lastPressPad ? CONTROL_PAGES.indexOf('gamepad') : 0;
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
      this.#musicVolume = context.createGain();
      this.#musicVolume.connect(context.destination);
      this.#fx = new EffectsMixer(context);
      this.#fx.prewarm();
      this.#sfx = new MenuSounds(context, this.#fx.input);
      this.#applyVolumes();
      const created = createAudioPlayer({ context, output: this.#musicVolume });
      this.#player = created;
      created.then(
        (p) => {
          this.#playerReady = p;
          p.userOffsetMs = this.#settings.syncMs;
          p.onEnded = () => this.#onSongEnded();
        },
        () => {
          this.#player = null;
        },
      );
    }
    return this.#player;
  }

  /** Sets the music and effects volumes from the settings. */
  #applyVolumes(): void {
    if (this.#musicVolume) this.#musicVolume.gain.value = volumeGain(this.#settings.music);
    if (this.#fx) this.#fx.volume = volumeGain(this.#settings.effects);
  }

  /** Sets the song clock's offset from the Sync setting. */
  #applySync(): void {
    if (this.#playerReady) this.#playerReady.userOffsetMs = this.#settings.syncMs;
  }

  /** Shows `level`'s terrain, copper bars and sparks, or none. */
  #showLevel(level: Level | null): void {
    this.#r.terrain.setLevel(level);
    const look = level ? (this.#looks.get(level) ?? null) : null;
    this.#r.copper.setSong(look);
    this.#r.sparks.setSong(level, look);
  }

  /** Sets the flashes' caps, the shake, the CRT look and the LED colours from the settings. */
  #applyLook(): void {
    this.#perfReadout.visible = this.#perfBacking.visible = this.#perfOn;
    this.#r.flashes.flashing = this.#settings.flashing;
    this.#r.copper.flashing = this.#settings.flashing;
    this.#r.shakeOn = this.#settings.shake;
    this.#r.crt = this.#settings.crt;
    this.#r.terrain.setColourBlind(this.#settings.leds === 'colourBlind');
    if (this.#hangar) this.#hangar.strobePeak = FLASH_PEAK[this.#settings.flashing];
  }

  /**
   * Builds `level` from `levelData`, cut to the arcade's length cap when `cut`, and keeps
   * the song's notes and look for the effects.
   */
  #makeLevel(levelData: LevelData, difficulty: DifficultyName, cut = false): Level {
    const data = cut ? cutLevelData(levelData, ARCADE_MAX_SAMPLES) : levelData;
    const level = generateLevel(data, difficulty);
    if (data !== levelData) this.#shortened.add(level);
    this.#songNotes.set(level, new SongNotes(data));
    this.#looks.set(level, songLook(data));
    return level;
  }

  /** `song`'s level at `difficulty`, whole or cut, from the cache or built from `levelData` now. */
  #levelEntry(song: BundledSong, levelData: LevelData, difficulty: DifficultyName, cut: boolean) {
    const cache = this.#cacheFor(song);
    const key = cut ? `${difficulty}-cut` : difficulty;
    let entry = cache.levels.get(key);
    if (!entry) {
      const level = this.#makeLevel(levelData, difficulty, cut);
      entry = { level, autopilot: this.#options.autopilot ? autopilotInputs(level) : null };
      cache.levels.set(key, entry);
    }
    return entry;
  }

  /**
   * Fades a cut level's music out over its last CUT_FADE_SECONDS, once `clock` (song
   * samples) gets there. Cosmetic: the level ends on its tick count either way.
   */
  #fadeCut(level: Level, player: AudioPlayer, clock: number): void {
    if (this.#cutFading || !this.#shortened.has(level)) return;
    const left = level.totalSamples - clock;
    if (left > CUT_FADE_SECONDS * SAMPLE_RATE) return;
    this.#cutFading = true;
    player.fade(0, Math.max(0, left) / SAMPLE_RATE);
  }

  /** Plays the sounds for what happened in `level` since the last frame. */
  #playCues(level: Level): void {
    const fx = this.#fx;
    if (!fx) return;
    this.#cues.update(level, this.#state, this.#cueList);
    const notes = this.#songNotes.get(level);
    for (const c of this.#cueList) {
      const pitch = !notes ? 0 : c.instrument >= 0 ? notes.pitchAt(c.instrument, c.tick) : notes.melodyAt(c.tick);
      fx.play(c.effect, ((c.x / PLAYFIELD_WIDTH) * 2 - 1) * PAN_WIDTH, pitch);
    }
    this.#cueList.length = 0;
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
      data = this.#analyze(song, cache, tempo);
      cache.levelData.set(tempo, data);
    }
    return data;
  }

  /**
   * `song`'s LevelData at `tempoPermille`: from the level cache when this GEN_VERSION has
   * analyzed it before, else from the analysis worker, then cached. A cache that fails to
   * read or write, or an entry that won't deserialize, falls back to analyzing.
   */
  async #analyze(song: BundledSong, cache: SongCache, tempoPermille: number): Promise<LevelData> {
    const hash = song.sha256;
    const library = hash ? await this.#library : null;
    if (library && hash) {
      try {
        const hit = await library.level(hash, tempoPermille);
        if (hit) return deserializeLevelData(hit);
      } catch (err) {
        console.warn('level cache read failed:', err);
      }
    }
    const serialized = await analyzeSerializedInWorker(await cache.bytes, tempoPermille);
    const data = deserializeLevelData(serialized);
    if (library && hash) library.putLevel(hash, tempoPermille, serialized).catch((err: unknown) => console.warn('level cache write failed:', err));
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
    if (song.seconds === null && tempoPermille === 1000) this.#learnLength(song, loaded.durationSeconds);
  }

  /**
   * Records the length of a song imported before lengths were kept, once it has played, for
   * the jukebox's list and the library.
   */
  #learnLength(song: BundledSong, seconds: number): void {
    song.seconds = Math.round(seconds * 1000) / 1000;
    this.#jukebox.setSongs(this.#songs);
    const hash = song.sha256;
    if (!song.imported || !hash) return;
    void this.#library.then(async (library) => {
      const stored = await library?.song(hash);
      if (library && stored) await library.putSong({ ...stored, seconds: song.seconds! });
    }).catch((err: unknown) => console.warn('song length not saved:', err));
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
    if (this.#music === 'title' && (this.#mode === 'title' || this.#mode === 'demo' || this.#mode === 'credits')) {
      void this.#playMusic(this.#titleSong, 'title');
    } else if (this.#music === 'credits' && this.#mode === 'credits') {
      void this.#playMusic(CREDITS_SONG_ID ? songById(CREDITS_SONG_ID) : this.#titleSong, 'credits');
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

  /** Clears the run from the screen: its level, effects and sounds. */
  #clearPlay(): void {
    this.#cancelFade();
    this.#fx?.stopAll();
    this.#endFlood();
    this.#run = null;
    this.#showLevel(null);
    this.#r.explosion.hide();
    this.#r.flash.hide();
  }

  #toTitle(): void {
    this.#nameEntry = null;
    this.#touchText?.close();
    this.#clearPlay();
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
      const level = this.#makeLevel(await this.#levelData(this.#titleSong, DEMO_DIFFICULTY), DEMO_DIFFICULTY);
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
    this.#state.cheats = 0;
    resetSimState(this.#state);
    this.#clock.reset();
    this.#showLevel(demo.level);
    this.#setMode('demo');
  }

  // Jukebox -------------------------------------------------------------------------------

  #openJukebox(): void {
    this.#stopMusic();
    this.#jukeboxMenu.cursor = this.#menu.song;
    this.#setMode('jukebox');
  }

  /** The imported songs saved in the library, added after the bundled ones at start. */
  async #loadImported(): Promise<void> {
    const library = await this.#library;
    if (!library) return;
    try {
      const stored = await library.songs();
      const known = new Set(this.#songs.map((s) => s.sha256));
      this.#addSongs(stored.filter((s) => !known.has(s.sha256)).map(importedSong), false);
    } catch (err) {
      console.warn('imported songs unavailable:', err);
    }
  }

  /** Adds songs to Levels and the jukebox; with `focus`, the jukebox's cursor goes to the first. */
  #addSongs(songs: readonly BundledSong[], focus: boolean): void {
    if (songs.length === 0) return;
    this.#songs.push(...songs);
    this.#menu.addSongs(songs.length);
    this.#jukeboxMenu.addSongs(songs.length, focus);
    this.#jukebox.setSongs(this.#songs);
  }

  #jukeboxNoteShow(text: string, warn = false, ms = JUKEBOX_NOTE_MS): void {
    this.#jukeboxNote = { text, warn, until: performance.now() + ms };
  }

  /**
   * Opens the browser's file picker for songs, or a folder. Browsers open it only during a
   * key press, click or tap (user activation), so a gamepad press gets a note instead.
   */
  #openFilePicker(folder: boolean): void {
    if (navigator.userActivation && !navigator.userActivation.isActive) {
      this.#jukeboxNoteShow('Import: keys or touch', true);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (folder) input.webkitdirectory = true;
    else input.accept = IMPORT_EXTENSIONS.join(',');
    input.addEventListener('change', () => {
      const files = [...(input.files ?? [])];
      if (files.length > 0) void this.#importFiles(files);
    });
    input.click();
  }

  /**
   * Imports song files: each is hashed, analyzed at normal's tempo to check that it plays
   * (its level goes in the cache), and stored in the library. A file that isn't a song, is
   * too big, or is already in the list is skipped and counted in the note.
   */
  async #importFiles(files: readonly File[]): Promise<void> {
    if (this.#importing) return;
    const candidates = files.filter((f) => isSongFileName(f.name));
    if (candidates.length === 0) {
      this.#jukeboxNoteShow('No songs found', true);
      return;
    }
    this.#importing = true;
    const library = await this.#library;
    const added: BundledSong[] = [];
    let already = 0;
    let bad = 0;
    let big = 0;
    let unsaved = 0;
    try {
      for (const [n, file] of candidates.entries()) {
        this.#jukeboxNoteShow(`Importing ${n + 1}/${candidates.length}`, false, Infinity);
        if (file.size > MAX_IMPORT_BYTES) {
          big++;
          continue;
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const hash = await sha256Hex(bytes);
        if (hash === null) {
          this.#jukeboxNoteShow('Import needs HTTPS', true);
          return;
        }
        if (this.#songs.some((s) => s.sha256 === hash) || added.some((s) => s.sha256 === hash)) {
          already++;
          continue;
        }
        const tempo = Difficulty.normal.tempoPermille;
        let serialized: Uint8Array;
        try {
          serialized = await analyzeSerializedInWorker(bytes, tempo);
        } catch (err) {
          console.warn(`${file.name} is not a song:`, err);
          bad++;
          continue;
        }
        const data = deserializeLevelData(serialized);
        const meta = data.meta;
        const stored: StoredSong = {
          sha256: hash,
          fileName: file.name,
          title: meta.title.trim() || titleFromFileName(file.name),
          artist: meta.artist.trim(),
          bytes: bytes.buffer as ArrayBuffer,
          added: Date.now(),
          // Analyzed as written (tempo 1000), so this is its length as the jukebox plays it,
          // unless analysis stopped at its cap; then it's learned on the first play.
          ...(data.hitDurationCap ? {} : { seconds: Math.round((data.totalSamples / SAMPLE_RATE) * 1000) / 1000 }),
        };
        if (library) {
          try {
            await library.putSong(stored);
            await library.putLevel(hash, tempo, serialized);
          } catch (err) {
            console.warn('song not saved:', err);
            unsaved++;
          }
        } else {
          unsaved++;
        }
        added.push(importedSong(stored));
      }
      this.#addSongs(added, true);
      const parts = [`${added.length} added`];
      if (already) parts.push(`${already} already here`);
      if (bad) parts.push(`${bad} not songs`);
      if (big) parts.push(`${big} too big`);
      if (unsaved) parts.push(`${unsaved} not saved`);
      this.#jukeboxNoteShow(parts.join(', '), added.length === 0 || unsaved > 0);
      if (added.length > 0) this.#sound('select');
      // The first song kept is the moment to ask that the browser not delete them.
      if (added.length > unsaved) void keepStorage();
    } finally {
      this.#importing = false;
    }
  }

  /** Del, or a pad's Select, on an imported song: the first press arms, the second removes. */
  #removePress(): void {
    const row = this.#jukeboxMenu.row;
    const song = row.kind === 'song' ? this.#songs[row.song] : undefined;
    if (!song?.imported || this.#importing) return;
    const armed = this.#removeArmed;
    if (armed && armed.song === song && performance.now() < armed.until) {
      this.#removeArmed = null;
      void this.#removeSong(song);
    } else {
      this.#removeArmed = { song, until: performance.now() + REMOVE_ARM_MS };
      this.#sound('move');
    }
  }

  async #removeSong(song: BundledSong): Promise<void> {
    const index = this.#songs.indexOf(song);
    if (index < 0 || !song.imported || !song.sha256) return;
    try {
      await (await this.#library)?.deleteSong(song.sha256);
    } catch (err) {
      console.warn('song not removed from storage:', err);
    }
    const at = this.#songs.indexOf(song);
    if (at < 0) return;
    this.#songs.splice(at, 1);
    this.#menu.removeSong(at);
    if (this.#jukeboxMenu.removeSong(at)) this.#stopMusic();
    if (this.#loaded === song) this.#loaded = null;
    this.#cache.delete(song);
    URL.revokeObjectURL(song.url);
    this.#jukebox.setSongs(this.#songs);
    this.#jukeboxNoteShow(`Removed ${song.title}`);
    this.#sound('back');
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
    return run.kind === 'arcade' ? run.songs[run.level]! : run.song;
  }

  /**
   * Analyzes the run's song if needed, builds its level, and shows the intro card; or, with
   * `hangar`, plays the hangar intro while it loads, and the intro's Play key starts the run.
   */
  async #beginLevel(hangar = false): Promise<void> {
    const run = this.#run;
    if (!run) return;
    const song = this.#runSong(run);
    const difficulty = this.#menu.difficulty;
    this.#cancelFade();
    this.#stopMusic();
    this.#endFlood();
    const request = this.#musicRequest;
    const heading = this.#levelHeading(run);
    // Without its art (still loading, or it failed to) the level gets its usual card.
    if (hangar && this.#hangar) {
      const alarm = difficulty === 'impossible';
      this.#intro = { start: performance.now(), cue: 0, cues: hangarCues(alarm), ready: false, skipped: false };
      this.#hangar.setSong(heading, song.title, song.credit, DIFFICULTY_LABELS[difficulty]);
      this.#hangar.setAlarm(alarm);
      this.#setMode('hangar');
    } else {
      this.#intro = null;
      this.#setMode('analyzing');
    }
    try {
      const tempo = Difficulty[difficulty].tempoPermille;
      const loading = this.#getPlayer().then(async (p) => {
        await this.#loadSong(p, song, tempo);
        return p;
      });
      const [player, levelData] = await Promise.all([loading, this.#levelData(song, difficulty)]);
      if (request !== this.#musicRequest || (this.#mode !== 'analyzing' && this.#mode !== 'hangar')) return;
      this.#playerReady = player;
      this.#song = song;
      this.#difficulty = difficulty;
      const entry = this.#levelEntry(song, levelData, difficulty, this.#run?.kind === 'arcade');
      this.#level = entry.level;
      this.#autopilot = entry.autopilot;
      this.#log = new InputLog(entry.level.tickCount);
      this.#showLevel(entry.level);
      this.#state.cheats = this.#runCheats;
      resetSimState(this.#state);
      this.#r.explosion.hide();
      this.#r.flash.hide();
      const intro = this.#intro;
      if (intro) {
        // The hangar's Play key starts the run, or it was skipped and starts now.
        intro.ready = true;
        if (intro.skipped) void this.#startRun();
        return;
      }
      this.#setMode('intro');
      this.#message.show(heading, CYAN, [song.title, song.credit, DIFFICULTY_LABELS[difficulty]]);
    } catch (err) {
      this.#cache.delete(song);
      this.#showError(err);
    }
  }

  #levelHeading(run: Run): string {
    // A song from Levels has no place in a run: its card just says Ready.
    if (run.kind === 'single') return 'Ready';
    if (run.songs === this.#impossibleSongs) return 'Impossible';
    return run.level === run.songs.length - 1 ? 'Final level' : `Level ${run.level + 1}`;
  }

  /** A key in the hangar: start the run now, or as soon as the level has loaded. */
  #skipHangar(): void {
    const intro = this.#intro;
    if (!intro || performance.now() - this.#modeSince < HANGAR_SKIP_DELAY_MS) return;
    intro.skipped = true;
    this.#fx?.stopAll();
    if (intro.ready) void this.#startRun();
    else this.#setMode('analyzing');
  }

  /** Takes the colour flood and the canopy off the screen. */
  #endFlood(): void {
    this.#flooding = false;
    this.#wiping = false;
    this.#r.stage.filters = null;
    this.#hangarLayer.visible = false;
  }

  async #startRun(): Promise<void> {
    const level = this.#level;
    if (!level) return;
    // A run from the hangar floods into colour; skipped, it does without the canopy.
    const intro = this.#intro;
    this.#intro = null;
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
      if (this.#perfOn) this.#perfMeter().reset(performance.now());
      this.#endFlood();
      if (intro) {
        this.#flooding = true;
        this.#flood.set(0);
        this.#r.stage.filters = [this.#flood.filter];
        this.#wiping = !intro.skipped;
        if (this.#wiping) this.#fx?.play('canopy');
      }
      this.#setMode('play');
      this.#music = 'run';
      player.setVolume(1);
      this.#cutFading = false;
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

  /** Keeps the run's replay. */
  #finishRun(): void {
    const log = this.#log;
    const hash = this.#song.sha256;
    this.#lastReplay =
      log && hash
        ? {
            moduleHash: hash,
            difficulty: this.#difficulty,
            cheats: this.#state.cheats,
            cut: this.#run?.kind === 'arcade',
            genVersion: GEN_VERSION,
            simVersion: SIM_VERSION,
            score: this.#state.score,
            inputs: log.toArray(),
          }
        : null;
  }

  /** The frame stats are on: the Perf setting, or `?perf=1`. */
  get #perfOn(): boolean {
    return this.#options.perf !== null || this.#settings.perf;
  }

  #perfMeter(): PerfMeter {
    this.#perf ??= new PerfMeter(undefined, performance.now());
    return this.#perf;
  }

  /** The run just ended's report (perf.ts), with the level, song and difficulty, or null with the stats off. */
  #perfReport(): string[] | null {
    if (!this.#perfOn) return null;
    const perf = this.#perfMeter();
    const run = this.#run;
    return perfReport(
      {
        where: run?.kind === 'arcade' ? `Level ${run.level + 1}` : 'Levels',
        song: this.#song.title,
        difficulty: DIFFICULTY_LABELS[this.#difficulty],
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: window.devicePixelRatio,
        crt: this.#settings.crt,
      },
      perf.fps(performance.now()),
      perf.summary(),
    );
  }

  #onCrash(): void {
    this.#perfLines = this.#perfReport();
    this.#finishRun();
    this.#endRun();
    this.#endFlood();
    this.#stopMusic();
    this.#showGameOver();
    // Game over plays the opening of a song and fades it out.
    void this.#playMusic(this.#gameOverSong, 'gameover').then((started) => {
      if (started) {
        const { seconds, fadeSeconds } = GAME_OVER_MUSIC;
        this.#playerReady?.fade(0, fadeSeconds, seconds - fadeSeconds);
      }
    });
  }

  /**
   * The game over's message: the results, the replay keys, the leaderboard line or the name
   * entry, the prompt. The replay keys wait until the name is done, since R and S type.
   */
  #showGameOverMessage(): void {
    this.#message.container.visible = true;
    const results = this.#results;
    const naming = this.#nameEntry !== null;
    // On a touch screen the buttons name what they do, so the keys are left out; with a
    // gamepad, its buttons are named.
    const touch = this.#touchShown();
    const pad = this.#lastPressPad;
    this.#message.show(
      'Game over',
      MAGENTA,
      [
        ...(results?.rows ?? [`Score ${this.#state.score}`]),
        ...(!naming && !touch && this.#offerReplay && this.#lastReplay ? [replayHint(pad)] : []),
        ...(this.#boardLine ? [this.#boardLine] : []),
        ...this.#nameLines(),
        ...(this.#perfLines ?? []),
        ...(touch ? [] : [naming ? nameHint(pad) : pad ? 'A Retry  B Title' : 'Esc Title  Any key Retry']),
      ],
      results?.highlight ?? -1,
    );
  }

  /**
   * The crash's explosion, then the game-over message (drawn by the frame loop). Back from
   * watching the replay (`fresh` false), it keeps the results it had and shows the message
   * without the crash.
   */
  #showGameOver(fresh = true): void {
    this.#offerReplay = true;
    const s = this.#state;
    if (fresh || !this.#results) this.#results = this.#resultLines();
    if (fresh) {
      this.#r.explosion.start(s.shipX / Q8, s.shipY / Q8, seededRandom(this.#runs));
      this.#r.flash.start((s.deathTick * SAMPLES_PER_TICK * 1000) / SAMPLE_RATE);
      this.#setMode('gameover');
      return;
    }
    // Back from the replay the crash isn't shown again, stopped early or not (Brad,
    // 2026-11-11): no explosion, flash or shake, and the message at once, as though the
    // game over had been showing all along.
    this.#r.explosion.hide();
    this.#r.flash.hide();
    this.#setMode('gameover');
    this.#modeSince -= 60_000;
  }

  #onComplete(): void {
    this.#perfLines = this.#perfReport();
    this.#finishRun();
    this.#endRun();
    this.#endFlood();
    // A cut level's song has faded out but plays on; it ends with the level.
    if (this.#level && this.#shortened.has(this.#level)) this.#stopMusic();
    const run = this.#run;
    const difficulty = DIFFICULTY_LABELS[this.#difficulty];
    const s = this.#state;
    const results = this.#resultLines();
    const score = [...results.rows];
    if (run?.kind === 'arcade') {
      this.#runScore += s.score;
      score.push(resultRow('Total', this.#runScore));
    }
    if (this.#lastReplay) score.push(REPLAY_HINT);
    // The results rows follow one line of song and difficulty.
    const highlight = results.highlight < 0 ? -1 : results.highlight + 1;
    if (run?.kind === 'arcade' && run.level < run.songs.length - 1) {
      this.#completeView = {
        heading: `Level ${run.level + 1} clear`,
        lines: [`${this.#song.title}, ${difficulty}`, ...score],
        action: 'Next',
        highlight,
        after: () => {
          this.#sound('start');
          this.#run = { kind: 'arcade', level: run.level + 1, songs: run.songs };
          void this.#beginLevel();
        },
      };
    } else if (run?.kind === 'arcade') {
      const total = this.#runScore;
      this.#completeView = {
        heading: 'All clear',
        lines: [difficulty, ...score],
        action: 'Credits',
        highlight,
        after: () => this.#openCredits({ difficulty, total }),
      };
    } else {
      this.#completeView = {
        heading: 'Song clear',
        lines: [`${this.#song.title}, ${difficulty}`, ...score],
        action: 'Title',
        highlight,
        after: () => this.#toTitle(),
      };
    }
    this.#showComplete(true);
  }

  /**
   * The results rows for the run just ended (results.ts), recording a personal best for the
   * song and difficulty unless the run had a cheat. `highlight` is the row of a new best.
   */
  #resultLines(): { rows: string[]; highlight: number } {
    const s = this.#state;
    const best = recordBest(browserStorage(), bestKey(this.#song.id, this.#difficulty), s.score, s.cheats !== 0);
    const rows = resultRows(scoreBreakdown(s), best);
    return { rows, highlight: best.isNew ? rows.length - 1 : -1 };
  }

  /** Shows the level-complete screen with #completeView; `offerReplay` lets R and S (Y and X) act. */
  #showComplete(offerReplay = false): void {
    const view = this.#completeView;
    if (!view) return;
    this.#offerReplay = offerReplay;
    // Drawn again on the screen it's on (a new line, the cursor's blink), the key delay runs on.
    if (this.#mode !== 'complete') this.#setMode('complete');
    this.#message.container.visible = true;
    // While the name entry is up, R and S type, so the replay keys wait, and its hint is the
    // prompt. On a touch screen the buttons name what they do, so the keys are left out.
    const naming = this.#nameEntry !== null;
    const touch = this.#touchShown();
    const pad = this.#lastPressPad;
    const lines = view.lines.filter((l) => l !== REPLAY_HINT || (!naming && !touch)).map((l) => (l === REPLAY_HINT ? replayHint(pad) : l));
    if (this.#boardLine) lines.push(this.#boardLine);
    lines.push(...this.#nameLines());
    if (this.#perfLines) lines.push(...this.#perfLines);
    if (!touch) lines.push(naming ? nameHint(pad) : pad ? `A ${view.action}` : `Any key ${view.action}`);
    this.#message.show(view.heading, LIME, lines, view.highlight ?? -1);
    this.#afterComplete = view.after;
  }

  // Replays -------------------------------------------------------------------------------

  /** True on game over or level complete once keys count, with a replay to watch or save. */
  #onEndScreen(): boolean {
    return (
      (this.#mode === 'gameover' || this.#mode === 'complete') &&
      this.#nameEntry === null &&
      this.#offerReplay &&
      this.#lastReplay !== null &&
      performance.now() - this.#modeSince >= PROMPT_DELAY_MS
    );
  }

  #watchLastReplay(): void {
    const replay = this.#lastReplay;
    if (!replay || (this.#mode !== 'gameover' && this.#mode !== 'complete')) return;
    this.#sound('select');
    this.#completeAfterReplay = this.#mode === 'complete' ? this.#completeView : null;
    void this.#watchReplay(replay, this.#song, this.#mode);
  }

  /** Downloads the last run's replay as a file. */
  #saveReplay(): void {
    const replay = this.#lastReplay;
    if (!replay) return;
    this.#sound('select');
    const blob = new Blob([encodeReplay(replay)], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pattern-break-${this.#song.id}-${replay.difficulty}-${replay.score}.pbreplay`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /** A replay file dropped on the title screen: play it if its song is bundled. */
  async #onDropReplay(file: File): Promise<void> {
    if (this.#mode !== 'title') return;
    let replay: Replay;
    try {
      replay = decodeReplay(new Uint8Array(await file.arrayBuffer()));
    } catch (err) {
      console.error(err);
      this.#notice('Bad replay', ['Not a replay file']);
      return;
    }
    const song = this.#songs.find((s) => s.sha256 === replay.moduleHash) ?? null;
    if (!song) {
      this.#notice('Bad replay', ['Unknown song']);
      return;
    }
    void this.#watchReplay(replay, song, 'title');
  }

  /** A message on the level-complete screen that any key dismisses back to the title. */
  #notice(heading: string, lines: string[]): void {
    this.#stopMusic();
    this.#completeView = { heading, lines, action: 'Title', after: () => this.#toTitle() };
    this.#showComplete();
  }

  /** Plays `replay` from the start of its song, then returns to `from`. */
  async #watchReplay(replay: Replay, song: BundledSong, from: Playback['from']): Promise<void> {
    if (replay.genVersion !== GEN_VERSION || replay.simVersion !== SIM_VERSION) {
      this.#notice('Old replay', [`Version ${replay.genVersion}.${replay.simVersion}, need ${GEN_VERSION}.${SIM_VERSION}`]);
      return;
    }
    this.#stopMusic();
    const request = ++this.#musicRequest;
    try {
      const tempo = Difficulty[replay.difficulty].tempoPermille;
      const loading = this.#getPlayer().then(async (p) => {
        await this.#loadSong(p, song, tempo);
        return p;
      });
      const [player, level] = await Promise.all([loading, this.#levelFor(song, replay.difficulty, replay.cut)]);
      if (request !== this.#musicRequest) return;
      this.#playerReady = player;
      this.#playback = { replay, song, level, from };
      this.#showLevel(level);
      this.#state.cheats = replay.cheats;
      resetSimState(this.#state);
      this.#clock.reset();
      this.#displaySamples = 0;
      this.#r.explosion.hide();
      this.#r.flash.hide();
      this.#message.container.visible = false;
      this.#setMode('replay');
      this.#music = 'run';
      player.setVolume(1);
      this.#cutFading = false;
      await player.start();
    } catch (err) {
      this.#showError(err);
    }
  }

  /** The level for `song` at `difficulty`, whole or cut, from the cache or built now. */
  async #levelFor(song: BundledSong, difficulty: DifficultyName, cut: boolean): Promise<Level> {
    return this.#levelEntry(song, await this.#levelData(song, difficulty), difficulty, cut).level;
  }

  /**
   * Ends the replay: shows the score, and whether it matches the one recorded unless the
   * player stopped it early, then returns to where it was started from.
   */
  #endReplay(stopped: boolean): void {
    const playback = this.#playback;
    if (!playback || this.#mode !== 'replay') return;
    this.#playback = null;
    this.#stopMusic();
    const { replay, song, from } = playback;
    const score = this.#state.score;
    const check = stopped ? 'Stopped' : score === replay.score ? 'Score matches' : `Recorded ${replay.score}`;
    this.#completeView = {
      heading: 'Replay end',
      lines: [`${song.title}, ${DIFFICULTY_LABELS[replay.difficulty]}`, `Score ${score}`, check],
      action: 'Back',
      after: () => this.#returnFromReplay(from),
    };
    this.#showComplete();
  }

  #returnFromReplay(from: Playback['from']): void {
    if (from === 'title' || !this.#level) {
      this.#toTitle();
      return;
    }
    // The run is replayed again to its end, since a replay stopped early leaves the sim
    // state and the picture where it stopped: its ship flying on over a level with no walls.
    // It's drawn as play drew it: the tick before the end, with the enemies and the HUD
    // (which aren't drawn once the ship is dead), then the last tick, the crash for a game
    // over.
    const level = this.#level;
    const s = this.#state;
    this.#showLevel(level);
    const replay = this.#lastReplay;
    if (replay) {
      const inputs = replay.inputs;
      resetSimState(s);
      runInputLog(level, inputs.subarray(0, Math.max(0, inputs.length - 1)), s);
      drawPlay(this.#r, level, s, s.tick * SAMPLES_PER_TICK);
      runInputLog(level, inputs.subarray(inputs.length - 1), s);
    }
    this.#displaySamples = (s.dead ? s.deathTick : s.tick) * SAMPLES_PER_TICK;
    drawPlay(this.#r, level, s, this.#displaySamples);
    if (from === 'gameover') {
      this.#showGameOver(false);
    } else {
      this.#completeView = this.#completeAfterReplay;
      this.#showComplete(true);
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
    this.#touch?.setKeys(this.#touchKeys());
    this.#pollPads(now);
    const r = this.#r;
    const level = this.#level;
    const blink = Math.floor(now / PROMPT_BLINK_MS) % 2 === 0;
    // Still unless play or game over shakes it this frame.
    r.shake(-1, 0);
    switch (this.#mode) {
      case 'start': {
        this.#title.update(null, blink);
        r.starfield.draw((now / 1000) * TITLE_DRIFT_PX_PER_S);
        break;
      }
      case 'title': {
        const view = {
          cursor: this.#menu.cursor,
          levelSong: this.#songs[this.#menu.song]!,
          difficulty: this.#menu.difficulty,
          music: this.#titleSong,
          secret: [this.#infiniteLives ? 'Infinite lives' : '', this.#godHeld() ? 'God mode' : ''].filter(Boolean).join('  '),
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
      case 'settings': {
        r.starfield.draw((now / 1000) * TITLE_DRIFT_PX_PER_S);
        break;
      }
      case 'sync': {
        const sync = this.#sync;
        if (sync && sync.result === undefined && sync.session.expired) this.#finishSync();
        r.starfield.draw((now / 1000) * TITLE_DRIFT_PX_PER_S);
        break;
      }
      case 'scores': {
        if (this.#scoresMenu) this.#scoresScreen.update(this.#scoresMenu, blink, this.#touchShown(), this.#lastPressPad);
        r.starfield.draw((now / 1000) * TITLE_DRIFT_PX_PER_S);
        break;
      }
      case 'keys': {
        this.#updateKeys(now);
        r.starfield.draw((now / 1000) * TITLE_DRIFT_PX_PER_S);
        break;
      }
      case 'help': {
        if (this.#helpFrom === 'title') r.starfield.draw((now / 1000) * TITLE_DRIFT_PX_PER_S);
        break;
      }
      case 'credits': {
        // The time step is capped, so a tab left in the background doesn't jump the roll,
        // and never below 0: a frame's timestamp can come before the press that opened it.
        this.#creditsRoll?.tick(Math.max(0, Math.min(100, now - this.#creditsAt)));
        this.#creditsAt = now;
        const note = this.#creditsNote && now < this.#creditsNote.until ? this.#creditsNote.text : '';
        this.#credits.update(note, this.#touchShown(), this.#lastPressPad);
        r.starfield.draw((now / 1000) * TITLE_DRIFT_PX_PER_S);
        break;
      }
      case 'hangar': {
        this.#drawHangar(now);
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
        this.#fadeCut(level, player, clock);
        catchUp(level, this.#state, targetTick(clock, level.tickCount), this.#nextInput, this.#log);
        this.#playCues(level);
        this.#displaySamples = this.#clock.update(now, clock, this.#state.tick);
        if (this.#state.dead) {
          // Freeze the picture on the tick of the crash.
          this.#displaySamples = this.#state.deathTick * SAMPLES_PER_TICK;
          this.#onCrash();
        } else if (this.#state.finished) {
          this.#onComplete();
        }
        drawPlay(r, level, this.#state, this.#displaySamples);
        if (this.#mode === 'play') this.#drawRunStart(level);
        break;
      }
      case 'replay': {
        const player = this.#playerReady;
        const playback = this.#playback;
        if (!player || !playback) break;
        const { level, replay } = playback;
        const clock = player.songTimeSamples();
        this.#fadeCut(level, player, clock);
        catchUp(level, this.#state, targetTick(clock, level.tickCount), (tick) => replay.inputs[tick] ?? 0, null);
        this.#playCues(level);
        this.#displaySamples = this.#clock.update(now, clock, this.#state.tick);
        if (this.#state.dead) this.#displaySamples = this.#state.deathTick * SAMPLES_PER_TICK;
        drawPlay(r, level, this.#state, this.#displaySamples);
        this.#replayBanner.update(blink);
        if (this.#state.dead || this.#state.finished) this.#endReplay(false);
        break;
      }
      case 'gameover': {
        const elapsed = now - this.#modeSince;
        r.explosion.draw(elapsed);
        r.flash.draw(elapsed);
        r.shake(elapsed, this.#state.hitTick);
        if (elapsed >= PROMPT_DELAY_MS && !this.#message.container.visible) this.#showGameOverMessage();
        const player = this.#playerReady;
        if (this.#music === 'gameover' && player && player.songTimeSeconds() >= GAME_OVER_MUSIC.seconds) {
          this.#stopMusic();
        }
        break;
      }
      default:
        break;
    }
    // The name entry's cursor blinks.
    if (this.#nameEntry && blink !== this.#nameBlink) this.#refreshEndScreen(blink);
    this.#drawFade(now);
    r.render();
    if (this.#perfOn) {
      const perf = this.#perfMeter();
      perf.record(performance.now() - start);
      this.#perfFrames++;
      if (now - this.#perfSince >= 500) {
        const fps = (this.#perfFrames * 1000) / (now - this.#perfSince);
        this.#perfReadout.text = perfText(fps, perf.summary(this.#perfFrames));
        // Under the HUD's score, which sits in the top right corner.
        this.#perfReadout.place(PLAYFIELD_WIDTH - 2, PERF_READOUT_Y, 'right');
        this.#perfBacking.width = this.#perfReadout.textWidth + 4;
        this.#perfBacking.position.set(PLAYFIELD_WIDTH - 4 - this.#perfReadout.textWidth, PERF_READOUT_Y - 2);
        this.#perfFrames = 0;
        this.#perfSince = now;
      }
    }
    requestAnimationFrame(this.#frame);
  };

  /**
   * The hangar intro at its clock, playing its sounds as the clock passes them. The clock
   * holds with the hand over Play until the level is loaded, then Play starts the run.
   */
  #drawHangar(now: number): void {
    const intro = this.#intro;
    if (!intro) return;
    const ms = introTime(now - intro.start, intro.ready);
    // Held, the clock restarts from where it stopped.
    intro.start = now - ms;
    while (intro.cue < intro.cues.length && intro.cues[intro.cue]!.at <= ms) {
      const cue = intro.cues[intro.cue++]!;
      this.#fx?.play(cue.effect, cue.pan);
    }
    this.#hangar?.draw(ms);
    // #startRun takes #intro at once, so this starts the run one time; the last frame stays
    // up until the run's first.
    if (intro.ready && ms >= PLAY_AT) void this.#startRun();
  }

  /** The start of a run from the hangar: the canopy closing and the colour flooding in. */
  #drawRunStart(level: Level): void {
    if (this.#wiping) {
      const ms = (this.#displaySamples * 1000) / SAMPLE_RATE;
      if (ms >= WIPE_MS) {
        this.#wiping = false;
        this.#hangarLayer.visible = false;
        this.#fx?.play('thunk');
      } else {
        this.#hangar?.drawWipe(ms);
      }
    }
    if (this.#flooding) {
      const amount = ColourFlood.amount(level, this.#displaySamples);
      if (amount >= 1) {
        this.#flooding = false;
        this.#r.stage.filters = null;
      } else {
        this.#flood.set(amount);
      }
    }
  }

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
    this.#playCues(demo.level);
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
    const now = performance.now();
    const note = this.#jukeboxNote && now < this.#jukeboxNote.until ? this.#jukeboxNote : null;
    const row = this.#jukeboxMenu.row;
    const song = row.kind === 'song' ? this.#songs[row.song] : undefined;
    const armed = this.#removeArmed;
    const isArmed = armed !== null && armed.song === song && now < armed.until;
    if (armed && !isArmed) this.#removeArmed = null;
    const key = this.#lastPressPad ? 'Select' : 'Del';
    this.#jukebox.update({
      cursor: this.#jukeboxMenu.cursor,
      playing,
      seconds: playing === null ? 0 : (this.#playerReady?.songTimeSeconds() ?? 0),
      durationSeconds: this.#loadedSeconds,
      levels: this.#barLevels,
      note: note?.text ?? '',
      warn: note?.warn ?? false,
      // On a touch screen the Remove key says it instead.
      removeHint: song?.imported && !this.#touchShown() ? `${key} ${isArmed ? 'Confirm' : 'Remove'}` : '',
      removeArmed: isArmed,
      importFolder: this.#jukeboxMenu.importFolder,
    });
  }
}
