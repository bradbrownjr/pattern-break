// The title menu, the jukebox list, the pause menu and the controls pages, as state that
// menu actions change. Drawing is in screens.ts and controls.ts; these classes hold no
// display objects, so tests run in Node.

import { Difficulty, type DifficultyName } from '@game/core';
import type { MenuAction } from './input.ts';

export const DIFFICULTY_LABELS: Record<DifficultyName, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
export const DIFFICULTY_ORDER = Object.keys(Difficulty) as DifficultyName[];

export const TITLE_ITEMS = ['play', 'practice', 'difficulty', 'jukebox', 'controls'] as const;
export type TitleItem = (typeof TITLE_ITEMS)[number];

/** What one action did on the title menu: what the game plays a sound for or opens. */
export type TitleEvent = 'moved' | 'changed' | 'play' | 'practice' | 'jukebox' | 'controls' | null;

/** Steps `i` by `step` through `count` values, wrapping at both ends. */
function wrap(i: number, step: number, count: number): number {
  return (((i + step) % count) + count) % count;
}

/**
 * Play, Practice, Difficulty, Jukebox, Controls. Up and down move the cursor; left and right change
 * Practice's song or the difficulty under it. Confirm on Difficulty steps it forward, so a
 * single button or a click can reach every choice.
 */
export class TitleMenu {
  cursor = 0;
  /** Practice's song, an index into the song list. */
  song: number;
  #songCount: number;
  #difficulty: number;

  constructor(songCount: number, song = 0, difficulty: DifficultyName = 'normal') {
    this.#songCount = songCount;
    this.song = song;
    this.#difficulty = DIFFICULTY_ORDER.indexOf(difficulty);
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
    if (this.item === 'difficulty') {
      this.#difficulty = wrap(this.#difficulty, step, DIFFICULTY_ORDER.length);
      return 'changed';
    }
    return null;
  }
}

export type JukeboxCommand = { type: 'moved' } | { type: 'play'; song: number } | { type: 'stop' } | { type: 'back' };

/**
 * The bundled songs, then Back. Confirm plays the song under the cursor, or stops it if it
 * is the one playing. Back, or confirm on Back, returns to the title.
 */
export class JukeboxMenu {
  cursor = 0;
  /** The song playing, or null. The game sets it as playback starts and stops. */
  playing: number | null = null;
  readonly songCount: number;

  constructor(songCount: number) {
    this.songCount = songCount;
  }

  /** True when the cursor is on Back, the row after the songs. */
  get onBack(): boolean {
    return this.cursor === this.songCount;
  }

  apply(action: MenuAction): JukeboxCommand | null {
    switch (action) {
      case 'up':
      case 'down':
        this.cursor = wrap(this.cursor, action === 'up' ? -1 : 1, this.songCount + 1);
        return { type: 'moved' };
      case 'confirm':
        if (this.onBack) return { type: 'back' };
        return this.playing === this.cursor ? { type: 'stop' } : { type: 'play', song: this.cursor };
      case 'back':
        return { type: 'back' };
      default:
        return null;
    }
  }

  /** The song after `song`, wrapping, for playing on when one ends. */
  next(song: number): number {
    return wrap(song, 1, this.songCount);
  }
}

export const PAUSE_ITEMS = ['resume', 'controls', 'quit'] as const;
export type PauseItem = (typeof PAUSE_ITEMS)[number];

/** Resume, Controls, Quit to title. Back resumes. */
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

export const CONTROL_PAGES = ['keyboard', 'gamepad'] as const;
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
