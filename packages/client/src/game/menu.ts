// The title menu and the jukebox list, as state that menu actions change. Drawing is in
// screens.ts and jukebox.ts; these classes hold no display objects, so tests run in Node.

import { Difficulty, type DifficultyName } from '@game/core';
import type { MenuAction } from './input.ts';

export const DIFFICULTY_LABELS: Record<DifficultyName, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
export const DIFFICULTY_ORDER = Object.keys(Difficulty) as DifficultyName[];

export const TITLE_ITEMS = ['play', 'song', 'difficulty', 'jukebox'] as const;
export type TitleItem = (typeof TITLE_ITEMS)[number];

/** Steps `i` by `step` through `count` values, wrapping at both ends. */
function wrap(i: number, step: number, count: number): number {
  return (((i + step) % count) + count) % count;
}

/**
 * Play, Song, Difficulty, Jukebox. Up and down move the cursor; left and right change the
 * song or difficulty under it. Confirm on Song or Difficulty steps it forward, so a single
 * button or a click can reach every choice.
 */
export class TitleMenu {
  cursor = 0;
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

  /** Applies one action and returns what to open, if it opens something. */
  apply(action: MenuAction): 'play' | 'jukebox' | null {
    switch (action) {
      case 'up':
      case 'down':
        this.cursor = wrap(this.cursor, action === 'up' ? -1 : 1, TITLE_ITEMS.length);
        return null;
      case 'left':
      case 'right':
        this.#change(action === 'left' ? -1 : 1);
        return null;
      case 'confirm':
        if (this.item === 'play' || this.item === 'jukebox') return this.item;
        this.#change(1);
        return null;
      case 'back':
        return null;
    }
  }

  #change(step: number): void {
    if (this.item === 'song') this.song = wrap(this.song, step, this.#songCount);
    else if (this.item === 'difficulty') this.#difficulty = wrap(this.#difficulty, step, DIFFICULTY_ORDER.length);
  }
}

export type JukeboxCommand = { type: 'play'; song: number } | { type: 'stop' } | { type: 'back' };

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
        return null;
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
