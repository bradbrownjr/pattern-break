// The game flow: the start screen, the title menu with its music and attract demo, the
// jukebox, and runs (the arcade levels in order, or one song in practice) with their intro
// cards, pause, game over, and level complete, and replays of finished runs. The song
// clock drives the sim (docs/DEVELOPMENT.md, "Renderer and game loop").

import {
  Cheat,
  Difficulty,
  GEN_VERSION,
  SIM_VERSION,
  SAMPLES_PER_TICK,
  SAMPLE_RATE,
  PLAYFIELD_WIDTH,
  Q8,
  autopilotInputs,
  createSimState,
  decodeReplay,
  runInputLog,
  encodeReplay,
  generateLevel,
  resetSimState,
  type DifficultyName,
  type Replay,
  type Level,
  type LevelData,
} from '@game/core';
import { Container } from 'pixi.js';
import { createAudioPlayer, type AudioPlayer } from '../audio/index.ts';
import { EffectsMixer } from '../audio/mixer.ts';
import { MenuSounds, type MenuSound } from '../audio/sfx.ts';
import { SongNotes } from '../audio/song-notes.ts';
import { FLASH_PEAK } from '../render/flash.ts';
import { CYAN, LIME, MAGENTA } from '../render/palette.ts';
import { seededRandom } from '../render/random.ts';
import type { GameRenderer } from '../render/renderer.ts';
import { barBinEdges, barLevels } from '../render/spectrum.ts';
import { analyzeInWorker } from './analysis.ts';
import { PadBit, PadTracker, gamepadConnected, padMenuAction, readGamepads } from './gamepad.ts';
import { TouchControls } from './touch.ts';
import { CodeListener, keyToken, padToken, type CodeToken } from './secrets.ts';
import { InputSampler, keyToMenuAction, type MenuAction } from './input.ts';
import { DisplayClock, InputLog, catchUp, targetTick } from './loop.ts';
import { ControlsScreen } from './controls.ts';
import { SoundCues, type Cue } from './cues.ts';
import { ColourFlood, HangarIntro, PLAY_AT, WIPE_MS, hangarCues, introTime, loadHangarArt } from './hangar.ts';
import { HelpScreen } from './help.ts';
import { CONTROL_PAGES, ControlsPages, DIFFICULTY_LABELS, JukeboxMenu, PauseMenu, SettingsMenu, TitleMenu, type TitleEvent } from './menu.ts';
import type { PerfMeter } from './perf.ts';
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
  fetchSongBytes,
  songById,
  songBySha256,
  type BundledSong,
} from './songs.ts';
import { browserStorage, loadSettings, saveSettings, volumeGain, type Settings } from './settings.ts';

type Mode =
  | 'start'
  | 'title'
  | 'demo'
  | 'jukebox'
  | 'controls'
  | 'settings'
  | 'help'
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
type Music = 'title' | 'jukebox' | 'run' | 'gameover' | null;

/** A run: the arcade levels in order from `level` (0-based), or one song in practice. */
/** An arcade run plays `songs` in order: the eight levels, or Impossible's one. */
type Run = { kind: 'arcade'; level: number; songs: readonly BundledSong[] } | { kind: 'practice'; song: BundledSong };

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
  after: () => void;
}

/** How far effects pan towards the side they happened on: 1 would be hard left or right. */
const PAN_WIDTH = 0.6;

/** Keys in the hangar intro count after this long, so the press that chose Play doesn't skip it. */
const HANGAR_SKIP_DELAY_MS = 300;

/** Shown on game over and level complete when the run has a replay. */
const REPLAY_HINT = 'R Replay  S Save';

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
  /** The on-screen controls, made in start(). */
  #touch: TouchControls | null = null;
  readonly #songs: readonly BundledSong[];
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
  readonly #help = new HelpScreen();
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
  /** True while game over or level complete shows the run the last replay is of. */
  #offerReplay = false;
  /** The level-complete view to show again after a replay started from it. */
  #completeAfterReplay: CompleteView | null = null;

  constructor(r: GameRenderer, options: GameOptions) {
    this.#r = r;
    this.#songs = options.songs;
    this.#song = options.song;
    this.#options = options;
    this.#menu = new TitleMenu(options.songs.length, Math.max(0, options.songs.indexOf(options.song)));
    this.#jukeboxMenu = new JukeboxMenu(options.songs.length);
    this.#jukebox = new JukeboxScreen(options.songs);
    this.#settingsMenu = new SettingsMenu(this.#settings);
    this.#applyLook();
    r.ui.addChild(
      this.#title.container,
      this.#jukebox.container,
      this.#controls.container,
      this.#settingsScreen.container,
      this.#help.container,
      this.#hangarLayer,
      this.#demoBanner.container,
      this.#replayBanner.container,
      this.#message.container,
      this.#pauseScreen.container,
      this.#fade.container,
    );
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
      if (e.pointerType === 'mouse') this.#onPointer();
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse') this.#onPointer();
    });
    this.#touch = new TouchControls(document.body, this.#r.renderer.canvas as HTMLCanvasElement, () => this.#onPointer());
    this.#touch.setStartScreen(this.#mode === 'start');
    window.addEventListener('blur', () => {
      this.#input.clear();
      this.#escHeld = false;
      void this.#pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.#pause();
    });
    window.addEventListener('resize', () => {
      this.#r.resize();
      this.#touch?.layout();
    });
    // The mouse wheel scrolls the help screen.
    window.addEventListener('wheel', (e) => {
      if (this.#mode !== 'help' || e.deltaY === 0) return;
      if (this.#help.scroller.scroll(e.deltaY > 0 ? 1 : -1)) this.#help.update();
    });
    // A replay file dropped on the title screen plays.
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) void this.#onDropReplay(file);
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

  // Screens -------------------------------------------------------------------------------

  #setMode(mode: Mode): void {
    this.#mode = mode;
    this.#touch?.setStartScreen(mode === 'start');
    this.#modeSince = performance.now();
    this.#title.container.visible = mode === 'start' || mode === 'title';
    this.#jukebox.container.visible = mode === 'jukebox';
    this.#controls.container.visible = mode === 'controls';
    this.#settingsScreen.container.visible = mode === 'settings';
    this.#help.container.visible = mode === 'help';
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
    if (mode === 'controls') this.#controls.show(this.#controlsPages.page);
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
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    this.#input.keyDown(e.code);
    if (e.code === 'Escape') this.#escHeld = true;
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
      case 'replay':
        if (!e.repeat) this.#endReplay(true);
        return;
      case 'hangar':
        if (!e.repeat) this.#skipHangar();
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
        if (!e.repeat) this.#codePress(keyToken(e.code));
        this.#menuKey(e);
        return;
      case 'jukebox':
      case 'controls':
      case 'settings':
      case 'help':
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
    if ((e.code === 'KeyR' || e.code === 'KeyS') && this.#onEndScreen()) {
      if (e.code === 'KeyR') this.#watchLastReplay();
      else this.#saveReplay();
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
    const pads = readGamepads();
    this.#touch?.setPadConnected(gamepadConnected());
    const bits = pads | (this.#touch?.bits ?? 0);
    this.#padHeld = bits;
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
      case 'controls':
      case 'settings':
      case 'help': {
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
        else if (bit === PadBit.y && this.#onEndScreen()) this.#watchLastReplay();
        else if ((bit & (PadBit.up | PadBit.down | PadBit.left | PadBit.right)) === 0) this.#onAnyKey();
        return;
      default:
        return;
    }
  }

  #onPointer(): void {
    if (this.#mode === 'start') this.#leaveStart();
    else if (this.#mode === 'demo') this.#toTitle();
    else if (this.#mode === 'replay') this.#endReplay(true);
    else if (this.#mode === 'hangar') this.#skipHangar();
    else if (
      this.#mode === 'title' ||
      this.#mode === 'jukebox' ||
      this.#mode === 'paused' ||
      this.#mode === 'controls' ||
      this.#mode === 'settings' ||
      this.#mode === 'help'
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

  /** A press on the title screen, for the Konami code: it turns infinite lives on or off. */
  #codePress(token: CodeToken | null): void {
    if (!this.#konami.push(token)) return;
    this.#infiniteLives = !this.#infiniteLives;
    this.#sound(this.#infiniteLives ? 'secret' : 'back');
  }

  /** God mode: Esc, or a pad's Start, held while Play is chosen by another key or button. */
  #godHeld(): boolean {
    return this.#escHeld || ((this.#padHeld & PadBit.start) !== 0 && !this.#confirmByStart);
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
        void this.#beginLevel(true);
        break;
      }
      case 'practice':
        this.#sound('start');
        this.#run = { kind: 'practice', song: this.#songs[this.#menu.song]! };
        this.#runCheats = lives;
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
      case 'help':
        this.#sound('select');
        this.#openHelp('title');
        break;
      case 'settings':
        this.#sound('select');
        this.#settingsMenu.cursor = 0;
        this.#setMode('settings');
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
        // A taste of the new effects level; the music is playing to hear its own.
        if (this.#settings.effects !== before.effects) this.#fx?.play('killShip');
        else this.#sound('change');
        break;
      }
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

  /** Sets the flashes' caps and the shake from the settings. */
  #applyLook(): void {
    this.#r.flashes.flashing = this.#settings.flashing;
    this.#r.shakeOn = this.#settings.shake;
    if (this.#hangar) this.#hangar.strobePeak = FLASH_PEAK[this.#settings.flashing];
  }

  /** Builds `level` from `levelData` and keeps the song's notes for the effects' pitch. */
  #makeLevel(levelData: LevelData, difficulty: DifficultyName): Level {
    const level = generateLevel(levelData, difficulty);
    this.#songNotes.set(level, new SongNotes(levelData));
    return level;
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
    this.#fx?.stopAll();
    this.#endFlood();
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
      const cache = this.#cacheFor(song);
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
      let entry = cache.levels.get(difficulty);
      if (!entry) {
        const level = this.#makeLevel(levelData, difficulty);
        entry = { level, autopilot: this.#options.autopilot ? autopilotInputs(level) : null };
        cache.levels.set(difficulty, entry);
      }
      this.#level = entry.level;
      this.#autopilot = entry.autopilot;
      this.#log = new InputLog(entry.level.tickCount);
      this.#r.terrain.setLevel(entry.level);
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
    if (run.kind === 'practice') return 'Practice';
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
      this.#options.perf?.reset();
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
            genVersion: GEN_VERSION,
            simVersion: SIM_VERSION,
            score: this.#state.score,
            inputs: log.toArray(),
          }
        : null;
  }

  #onCrash(): void {
    this.#finishRun();
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

  /** The crash's explosion, then the game-over message (drawn by the frame loop). */
  #showGameOver(): void {
    this.#offerReplay = true;
    const s = this.#state;
    this.#r.explosion.start(s.shipX / Q8, s.shipY / Q8, seededRandom(this.#runs));
    this.#r.flash.start((s.deathTick * SAMPLES_PER_TICK * 1000) / SAMPLE_RATE);
    this.#setMode('gameover');
  }

  #onComplete(): void {
    this.#finishRun();
    this.#endFlood();
    const run = this.#run;
    const difficulty = DIFFICULTY_LABELS[this.#difficulty];
    const s = this.#state;
    const score = [`Score ${s.score}  Bonus ${s.survivalBonus}`];
    if (run?.kind === 'arcade') {
      this.#runScore += s.score;
      score.push(`Total ${this.#runScore}`);
    }
    if (this.#lastReplay) score.push(REPLAY_HINT);
    if (run?.kind === 'arcade' && run.level < run.songs.length - 1) {
      this.#completeView = {
        heading: `Level ${run.level + 1} clear`,
        lines: [`${this.#song.title}, ${difficulty}`, ...score, 'Any key Next'],
        after: () => {
          this.#sound('start');
          this.#run = { kind: 'arcade', level: run.level + 1, songs: run.songs };
          void this.#beginLevel();
        },
      };
    } else if (run?.kind === 'arcade') {
      this.#completeView = {
        heading: 'All clear',
        lines: [difficulty, ...score, 'Any key Title'],
        after: () => this.#toTitle(),
      };
    } else {
      this.#completeView = {
        heading: 'Song clear',
        lines: [`${this.#song.title}, ${difficulty}`, ...score, 'Any key Title'],
        after: () => this.#toTitle(),
      };
    }
    this.#showComplete(true);
  }

  /** Shows the level-complete screen with #completeView; `offerReplay` lets R and S act. */
  #showComplete(offerReplay = false): void {
    const view = this.#completeView;
    if (!view) return;
    this.#offerReplay = offerReplay;
    this.#setMode('complete');
    this.#message.container.visible = true;
    this.#message.show(view.heading, LIME, view.lines);
    this.#afterComplete = view.after;
  }

  // Replays -------------------------------------------------------------------------------

  /** True on game over or level complete once keys count, with a replay to watch or save. */
  #onEndScreen(): boolean {
    return (
      (this.#mode === 'gameover' || this.#mode === 'complete') &&
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
    const song = songBySha256(replay.moduleHash);
    if (!song) {
      this.#notice('Bad replay', ['Unknown song']);
      return;
    }
    void this.#watchReplay(replay, song, 'title');
  }

  /** A message on the level-complete screen that any key dismisses back to the title. */
  #notice(heading: string, lines: string[]): void {
    this.#stopMusic();
    this.#completeView = { heading, lines: [...lines, 'Any key Title'], after: () => this.#toTitle() };
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
      const [player, level] = await Promise.all([loading, this.#levelFor(song, replay.difficulty)]);
      if (request !== this.#musicRequest) return;
      this.#playerReady = player;
      this.#playback = { replay, song, level, from };
      this.#r.terrain.setLevel(level);
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
      await player.start();
    } catch (err) {
      this.#showError(err);
    }
  }

  /** The level for `song` at `difficulty`, from the cache or built now. */
  async #levelFor(song: BundledSong, difficulty: DifficultyName): Promise<Level> {
    const cache = this.#cacheFor(song);
    let entry = cache.levels.get(difficulty);
    if (!entry) {
      const level = this.#makeLevel(await this.#levelData(song, difficulty), difficulty);
      entry = { level, autopilot: this.#options.autopilot ? autopilotInputs(level) : null };
      cache.levels.set(difficulty, entry);
    }
    return entry.level;
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
      lines: [`${song.title}, ${DIFFICULTY_LABELS[replay.difficulty]}`, `Score ${score}`, check, 'Any key Back'],
      after: () => this.#returnFromReplay(from),
    };
    this.#showComplete();
  }

  #returnFromReplay(from: Playback['from']): void {
    if (from === 'title' || !this.#level) {
      this.#toTitle();
      return;
    }
    // The replay reproduced the run, so the sim state is the run's final state again,
    // except when it was stopped early: rerun the log to the end to be sure.
    const replay = this.#lastReplay;
    if (replay) {
      resetSimState(this.#state);
      runInputLog(this.#level, replay.inputs, this.#state);
    }
    this.#r.terrain.setLevel(this.#level);
    if (from === 'gameover') {
      this.#showGameOver();
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
          practice: this.#songs[this.#menu.song]!,
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
      case 'help': {
        if (this.#helpFrom === 'title') r.starfield.draw((now / 1000) * TITLE_DRIFT_PX_PER_S);
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
        if (elapsed >= PROMPT_DELAY_MS && !this.#message.container.visible) {
          this.#message.container.visible = true;
          this.#message.show('Game over', MAGENTA, [
            `Score ${this.#state.score}`,
            ...(this.#offerReplay && this.#lastReplay ? [REPLAY_HINT] : []),
            'Esc Title  Any key Retry',
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
    this.#jukebox.update({
      cursor: this.#jukeboxMenu.cursor,
      playing,
      seconds: playing === null ? 0 : (this.#playerReady?.songTimeSeconds() ?? 0),
      durationSeconds: this.#loadedSeconds,
      levels: this.#barLevels,
    });
  }
}
