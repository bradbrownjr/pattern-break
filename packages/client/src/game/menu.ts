// The title menu, the jukebox list, the pause menu, the controls pages and the settings, as state that
// menu actions change. Drawing is in screens.ts and controls.ts; these classes hold no
// display objects, so tests run in Node.

import { Difficulty, type DifficultyName } from '@game/core';
import { KEY_ACTIONS, PAD_ACTIONS, SLOTS, type PadAction } from './bindings.ts';
import type { MenuAction } from './input.ts';
import { VOLUME_LEVELS, type Settings } from './settings.ts';

export const DIFFICULTY_LABELS: Record<DifficultyName, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  impossible: 'Impossible',
};
/** Every difficulty in menu order; Impossible shows only once found (TitleMenu). */
export const DIFFICULTY_ORDER = Object.keys(Difficulty) as DifficultyName[];
/** Passes through easy, normal and hard that show Impossible after the last hard. */
export const IMPOSSIBLE_PASSES = 3;

export const TITLE_ITEMS = ['play', 'practice', 'difficulty', 'jukebox', 'controls', 'settings', 'help'] as const;
export type TitleItem = (typeof TITLE_ITEMS)[number];

/**
 * What one action did on the title menu: what the game plays a sound for or opens.
 * 'impossible' is the difficulty changing to Impossible the first time.
 */
export type TitleEvent =
  | 'moved'
  | 'changed'
  | 'impossible'
  | 'play'
  | 'practice'
  | 'jukebox'
  | 'controls'
  | 'help'
  | 'settings'
  | null;

/** Steps `i` by `step` through `count` values, wrapping at both ends. */
function wrap(i: number, step: number, count: number): number {
  return (((i + step) % count) + count) % count;
}

/**
 * Play, Practice, Difficulty, Jukebox, Controls, Help, Settings. Up and down move the cursor; left and right change
 * Practice's song or the difficulty under it. Confirm on Difficulty steps it forward, so a
 * single button or a click can reach every choice.
 *
 * The secret (Brad and his son, 2026-11-10): stepping the difficulty forward through easy,
 * normal and hard IMPOSSIBLE_PASSES times shows Impossible after the last hard, and from
 * then on it is one of the choices. A step back starts the count again.
 */
export class TitleMenu {
  cursor = 0;
  /** Practice's song, an index into the song list. */
  song: number;
  #songCount: number;
  #difficulty: number;
  #impossible: boolean;
  /** Forward passes through easy, normal and hard so far, and whether this one began on easy. */
  #passes = 0;
  #fromEasy = false;

  constructor(songCount: number, song = 0, difficulty: DifficultyName = 'normal') {
    this.#songCount = songCount;
    this.song = song;
    this.#difficulty = DIFFICULTY_ORDER.indexOf(difficulty);
    this.#impossible = difficulty === 'impossible';
  }

  /** `count` songs were added at the end of the list; Practice's song stays as it was. */
  addSongs(count: number): void {
    this.#songCount += Math.max(0, count);
  }

  /** Song `song` was removed: Practice keeps its song, or takes the next (the first after the last). */
  removeSong(song: number): void {
    if (song < 0 || song >= this.#songCount) return;
    this.#songCount--;
    if (this.song > song) this.song--;
    else if (this.song === song && this.song >= this.#songCount) this.song = 0;
  }

  /** True once Impossible has been found. */
  get impossibleFound(): boolean {
    return this.#impossible;
  }

  get item(): TitleItem {
    return TITLE_ITEMS[this.cursor]!;
  }

  get difficulty(): DifficultyName {
    return DIFFICULTY_ORDER[this.#difficulty]!;
  }

  apply(action: MenuAction): TitleEvent {
    switch (action) {
      case 'up':
      case 'down':
        this.cursor = wrap(this.cursor, action === 'up' ? -1 : 1, TITLE_ITEMS.length);
        return 'moved';
      case 'left':
      case 'right':
        return this.#change(action === 'left' ? -1 : 1);
      case 'confirm':
        if (this.item === 'difficulty') return this.#change(1);
        return this.item;
      case 'back':
        return null;
    }
  }

  #change(step: number): TitleEvent {
    if (this.item === 'practice') {
      if (this.#songCount < 2) return null;
      this.song = wrap(this.song, step, this.#songCount);
      return 'changed';
    }
    if (this.item === 'difficulty') return this.#stepDifficulty(step);
    return null;
  }

  #stepDifficulty(step: number): TitleEvent {
    const from = this.difficulty;
    const count = this.#impossible ? DIFFICULTY_ORDER.length : DIFFICULTY_ORDER.length - 1;
    if (step < 0) {
      this.#passes = 0;
      this.#fromEasy = false;
      this.#difficulty = wrap(this.#difficulty, step, count);
      return 'changed';
    }
    if (from === 'hard' && !this.#impossible && this.#passes >= IMPOSSIBLE_PASSES) {
      this.#impossible = true;
      this.#difficulty = DIFFICULTY_ORDER.indexOf('impossible');
      return 'impossible';
    }
    this.#difficulty = wrap(this.#difficulty, step, count);
    const to = this.difficulty;
    if (from === 'easy' && to === 'normal') this.#fromEasy = true;
    else if (from === 'normal' && to === 'hard' && this.#fromEasy) {
      this.#passes++;
      this.#fromEasy = false;
    } else if (to !== 'easy') this.#fromEasy = false;
    return 'changed';
  }
}

export type JukeboxCommand =
  | { type: 'moved' }
  | { type: 'play'; song: number }
  | { type: 'stop' }
  | { type: 'import'; folder: boolean }
  | { type: 'back' };

/** A row of the jukebox's list. */
export type JukeboxRow = { kind: 'song'; song: number } | { kind: 'import' } | { kind: 'back' };

/**
 * The songs (bundled, then imported), Import, then Back. Confirm plays the song under the
 * cursor, or stops it if it is the one playing; on Import it opens the file picker. Where
 * the browser can pick a folder, left and right on Import choose File or Folder. Back, or
 * confirm on Back, returns to the title. The song list grows and shrinks as songs are
 * imported and removed.
 */
export class JukeboxMenu {
  cursor = 0;
  /** The song playing, or null. The game sets it as playback starts and stops. */
  playing: number | null = null;
  #songCount: number;
  /** Whether Import offers Folder as well as File. */
  readonly folder: boolean;
  /** Import picks a folder rather than files. */
  importFolder = false;

  constructor(songCount: number, folder = false) {
    this.#songCount = songCount;
    this.folder = folder;
  }

  get songCount(): number {
    return this.#songCount;
  }

  /** Every row: the songs, Import and Back. */
  get rowCount(): number {
    return this.#songCount + 2;
  }

  rowAt(i: number): JukeboxRow {
    if (i < this.#songCount) return { kind: 'song', song: i };
    const extra = i - this.#songCount;
    if (extra === 0) return { kind: 'import' };
    return { kind: 'back' };
  }

  get row(): JukeboxRow {
    return this.rowAt(this.cursor);
  }

  /** True when the cursor is on Back. */
  get onBack(): boolean {
    return this.row.kind === 'back';
  }

  apply(action: MenuAction): JukeboxCommand | null {
    switch (action) {
      case 'up':
      case 'down':
        this.cursor = wrap(this.cursor, action === 'up' ? -1 : 1, this.rowCount);
        return { type: 'moved' };
      case 'confirm': {
        const row = this.row;
        if (row.kind === 'song') return this.playing === row.song ? { type: 'stop' } : { type: 'play', song: row.song };
        return row.kind === 'import' ? { type: 'import', folder: this.importFolder } : { type: 'back' };
      }
      case 'left':
      case 'right':
        if (this.row.kind !== 'import' || !this.folder) return null;
        this.importFolder = !this.importFolder;
        return { type: 'moved' };
      case 'back':
        return { type: 'back' };
      default:
        return null;
    }
  }

  /** The song after `song`, wrapping, for playing on when one ends. */
  next(song: number): number {
    return wrap(song, 1, this.#songCount);
  }

  /**
   * `count` songs were added at the end of the list. With `focus`, the cursor goes to the
   * first of them; otherwise it stays on its row (Import and the rows after move down).
   */
  addSongs(count: number, focus = true): void {
    if (count <= 0) return;
    if (focus) this.cursor = this.#songCount;
    else if (this.cursor >= this.#songCount) this.cursor += count;
    this.#songCount += count;
  }

  /**
   * Song `song` was removed: later rows move up one. A cursor on the removed song stays on
   * its row (now the next song, or Import after the last); one further down follows its
   * row, and playing follows its song. Returns true if the removed song was the one
   * playing, which is now null.
   */
  removeSong(song: number): boolean {
    if (song < 0 || song >= this.#songCount) return false;
    this.#songCount--;
    if (this.cursor > song) this.cursor--;
    const wasPlaying = this.playing === song;
    if (wasPlaying) this.playing = null;
    else if (this.playing !== null && this.playing > song) this.playing--;
    return wasPlaying;
  }
}

export const PAUSE_ITEMS = ['resume', 'controls', 'help', 'quit'] as const;
export type PauseItem = (typeof PAUSE_ITEMS)[number];

/** Resume, Controls, Help, Quit (to the title). Back resumes. */
export class PauseMenu {
  cursor = 0;

  get item(): PauseItem {
    return PAUSE_ITEMS[this.cursor]!;
  }

  apply(action: MenuAction): PauseItem | 'moved' | null {
    switch (action) {
      case 'up':
      case 'down':
        this.cursor = wrap(this.cursor, action === 'up' ? -1 : 1, PAUSE_ITEMS.length);
        return 'moved';
      case 'confirm':
        return this.item;
      case 'back':
        return 'resume';
      default:
        return null;
    }
  }
}

export const CONTROL_PAGES = ['arrows', 'wasd', 'gamepad'] as const;
export type ControlPage = (typeof CONTROL_PAGES)[number];

/**
 * The keyboard and gamepad pages. Left and right switch pages. Confirm goes to the next
 * page and leaves from the last, so a click alone can see both; back leaves.
 */
export class ControlsPages {
  index = 0;

  get page(): ControlPage {
    return CONTROL_PAGES[this.index]!;
  }

  apply(action: MenuAction): 'moved' | 'back' | null {
    switch (action) {
      case 'left':
      case 'right':
        this.index = wrap(this.index, action === 'left' ? -1 : 1, CONTROL_PAGES.length);
        return 'moved';
      case 'confirm':
        if (this.index === CONTROL_PAGES.length - 1) return 'back';
        this.index++;
        return 'moved';
      case 'back':
        return 'back';
      default:
        return null;
    }
  }
}

export const SETTINGS_ITEMS = ['music', 'effects', 'flashing', 'shake', 'crt', 'leds', 'keys', 'back'] as const;
export type SettingsItem = (typeof SETTINGS_ITEMS)[number];

/** The two-way settings, each value left to right as the screen shows them. */
export const SETTINGS_CHOICES = {
  flashing: ['reduced', 'full'],
  shake: [false, true],
  crt: [false, true],
  leds: ['neon', 'colourBlind'],
} as const;
type Choice = keyof typeof SETTINGS_CHOICES;

function isChoice(item: SettingsItem): item is Choice {
  return item in SETTINGS_CHOICES;
}

/**
 * Music and Effects volume, 0 (off) to 5; Flashing (Reduced or Full), Shake and CRT (Off or
 * On), LED colours (Neon or Colour-blind); Keys, which opens the Keys screen;
 * then Back. Left and right change a value and stop at the ends; confirm steps a volume up
 * and wraps from 5 to off, and flips a two-way setting, so a click alone can reach every
 * value. Back, or confirm on Back, leaves.
 */
export class SettingsMenu {
  cursor = 0;
  readonly values: Settings;

  constructor(values: Settings) {
    this.values = { ...values };
  }

  get item(): SettingsItem {
    return SETTINGS_ITEMS[this.cursor]!;
  }

  #set<K extends Choice>(item: K, v: Settings[K]): void {
    this.values[item] = v;
  }

  apply(action: MenuAction): 'moved' | 'changed' | 'keys' | 'back' | null {
    const item = this.item;
    switch (action) {
      case 'up':
      case 'down':
        this.cursor = wrap(this.cursor, action === 'up' ? -1 : 1, SETTINGS_ITEMS.length);
        return 'moved';
      case 'left':
      case 'right': {
        if (item === 'back' || item === 'keys') return null;
        if (isChoice(item)) {
          const v = SETTINGS_CHOICES[item][action === 'left' ? 0 : 1];
          if (v === this.values[item]) return null;
          this.#set(item, v);
          return 'changed';
        }
        const v = Math.max(0, Math.min(VOLUME_LEVELS, this.values[item] + (action === 'left' ? -1 : 1)));
        if (v === this.values[item]) return null;
        this.values[item] = v;
        return 'changed';
      }
      case 'confirm':
        if (item === 'back' || item === 'keys') return item;
        if (isChoice(item)) {
          const [a, b] = SETTINGS_CHOICES[item];
          this.#set(item, this.values[item] === a ? b : a);
          return 'changed';
        }
        this.values[item] = wrap(this.values[item], 1, VOLUME_LEVELS + 1);
        return 'changed';
      case 'back':
        return 'back';
    }
  }
}

export type KeysDevice = 'keyboard' | 'pad';
/** One row of the Keys screen: the device, an action, Reset or Back. */
export type KeysRow = 'device' | PadAction | 'reset' | 'back';

/** The Keys screen's rows for `device`. */
export function keysRows(device: KeysDevice): readonly KeysRow[] {
  return ['device', ...(device === 'keyboard' ? KEY_ACTIONS : PAD_ACTIONS), 'reset', 'back'];
}

/** What one action did on the Keys screen. */
export type KeysEvent = 'moved' | 'device' | 'set' | 'reset' | 'back' | null;

/**
 * The Keys screen: the device (Keyboard or Pad), a row per action with SLOTS slots, Reset
 * and Back. Up and down move between rows and keep the slot; left and right move between
 * slots, or change the device on its row. Confirm changes the device, sets the slot under
 * the cursor (the game then waits for a key or button), resets the device's layout, or
 * leaves; back leaves.
 */
export class KeysMenu {
  device: KeysDevice = 'keyboard';
  row = 0;
  slot = 0;

  get rows(): readonly KeysRow[] {
    return keysRows(this.device);
  }

  get item(): KeysRow {
    return this.rows[this.row]!;
  }

  /** The action under the cursor, or null on the device, Reset or Back. */
  get action(): PadAction | null {
    const item = this.item;
    return item === 'device' || item === 'reset' || item === 'back' ? null : item;
  }

  apply(action: MenuAction): KeysEvent {
    switch (action) {
      case 'up':
      case 'down':
        this.row = wrap(this.row, action === 'up' ? -1 : 1, this.rows.length);
        return 'moved';
      case 'left':
      case 'right': {
        if (this.item === 'device') return this.#switchDevice();
        if (this.action === null) return null;
        const slot = Math.max(0, Math.min(SLOTS - 1, this.slot + (action === 'left' ? -1 : 1)));
        if (slot === this.slot) return null;
        this.slot = slot;
        return 'moved';
      }
      case 'confirm':
        if (this.item === 'device') return this.#switchDevice();
        if (this.item === 'reset' || this.item === 'back') return this.item;
        return 'set';
      case 'back':
        return 'back';
    }
  }

  #switchDevice(): KeysEvent {
    this.device = this.device === 'keyboard' ? 'pad' : 'keyboard';
    return 'device';
  }
}

/**
 * A list taller than the screen, scrolled a row at a time: the help screen. Up and down
 * scroll a row, left and right a page. Confirm pages down and leaves from the end, so a click
 * alone reads it all; back leaves.
 */
export class Scroller {
  top = 0;
  readonly rows: number;
  readonly visible: number;

  constructor(rows: number, visible: number) {
    this.rows = rows;
    this.visible = visible;
  }

  /** The highest `top`: the last row at the bottom of the view. */
  get maxTop(): number {
    return Math.max(0, this.rows - this.visible);
  }

  /** Scrolls by `rows`, clamped; true if it moved. */
  scroll(rows: number): boolean {
    const top = Math.max(0, Math.min(this.maxTop, this.top + rows));
    if (top === this.top) return false;
    this.top = top;
    return true;
  }

  apply(action: MenuAction): 'moved' | 'back' | null {
    switch (action) {
      case 'up':
      case 'down':
        return this.scroll(action === 'up' ? -1 : 1) ? 'moved' : null;
      case 'left':
      case 'right':
        return this.scroll(action === 'left' ? -(this.visible - 1) : this.visible - 1) ? 'moved' : null;
      case 'confirm':
        return this.scroll(this.visible - 1) ? 'moved' : 'back';
      case 'back':
        return 'back';
    }
  }
}
