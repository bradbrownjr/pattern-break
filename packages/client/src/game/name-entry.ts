// The name entry on the game over and clear screens (docs/PLAN.md, "Client UI", "Name
// entry"). Each run is posted under the name entered for it, as on an arcade's high score
// table: the last name used is filled in, Enter posts it, and the next player overwrites it.
// Typing replaces the filled-in name; up and down cycle the letter under the cursor, left
// and right move it, Backspace erases. A touch opens the phone's keyboard (touch-text.ts).
// The rules for a name are in packages/core/src/name.ts, shared with the server.

import { NAME_CHARS, NAME_MAX, cleanName, nameProblem } from '@game/core';
import type { MenuAction } from './input.ts';

/** What a key or button does on the name entry: the menu actions, and erasing. */
export type NameEdit = MenuAction | 'erase';

export type NameEvent = 'moved' | 'changed' | 'post' | 'skip' | null;

export class NameEntry {
  name: string;
  /** The place the cursor is on: 0 to the name's length (the empty place after it), below NAME_MAX. */
  at = 0;
  /** True until the first edit: typing then replaces the name filled in from last time. */
  fresh: boolean;
  /** What's wrong with the name after a try to post ("Name refused"); '' for nothing. */
  error = '';

  constructor(name = '') {
    this.name = cleanName(name);
    this.fresh = this.name !== '';
  }

  #edited(): void {
    this.fresh = false;
    this.error = '';
  }

  /** Types `text` at the cursor, over what's there; true if any of it went in. */
  type(text: string): boolean {
    const clean = cleanName(text);
    if (clean === '') return false;
    if (this.fresh) {
      this.name = '';
      this.at = 0;
    }
    this.#edited();
    for (const c of clean) {
      if (this.at < this.name.length) this.name = this.name.slice(0, this.at) + c + this.name.slice(this.at + 1);
      else if (this.name.length < NAME_MAX) this.name += c;
      else break;
      this.at = Math.min(this.at + 1, NAME_MAX - 1);
    }
    return true;
  }

  /** Sets the whole name, as the phone's keyboard leaves it; true if it changed. */
  replace(text: string): boolean {
    const clean = cleanName(text);
    this.#edited();
    if (clean === this.name) return false;
    this.name = clean;
    this.at = Math.min(clean.length, NAME_MAX - 1);
    return true;
  }

  /**
   * Backspace: erases the letter before the cursor, or the last letter when the cursor is
   * on it in the last place. A name filled in from last time goes all at once.
   */
  erase(): boolean {
    if (this.fresh) {
      this.name = '';
      this.at = 0;
      this.#edited();
      return true;
    }
    const full = this.name.length === NAME_MAX && this.at === NAME_MAX - 1;
    if (full) {
      this.name = this.name.slice(0, -1);
    } else if (this.at > 0) {
      this.name = this.name.slice(0, this.at - 1) + this.name.slice(this.at);
      this.at--;
    } else {
      return false;
    }
    this.#edited();
    return true;
  }

  apply(edit: NameEdit): NameEvent {
    const n = NAME_CHARS.length;
    switch (edit) {
      case 'up':
      case 'down': {
        const step = edit === 'up' ? 1 : -1;
        if (this.at === this.name.length) {
          this.name += NAME_CHARS[step > 0 ? 0 : n - 1]!;
        } else {
          const i = NAME_CHARS.indexOf(this.name[this.at]!);
          const next = NAME_CHARS[(((i < 0 ? 0 : i + step) % n) + n) % n]!;
          this.name = this.name.slice(0, this.at) + next + this.name.slice(this.at + 1);
        }
        this.#edited();
        return 'changed';
      }
      case 'left':
        if (this.at === 0) return null;
        this.at--;
        this.fresh = false;
        return 'moved';
      case 'right':
        if (this.at >= this.name.length || this.at + 1 >= NAME_MAX) return null;
        this.at++;
        this.fresh = false;
        return 'moved';
      case 'erase':
        return this.erase() ? 'changed' : null;
      case 'confirm': {
        // Up and down leave spaces where they stopped; a name has none at the ends.
        this.name = this.name.trim();
        this.at = Math.min(this.at, this.name.length, NAME_MAX - 1);
        const problem = nameProblem(this.name);
        this.error = problem === null ? '' : NAME_ERRORS[problem];
        return problem === null ? 'post' : null;
      }
      case 'back':
        return 'skip';
    }
  }

  /**
   * The entry's line: "Name BRAD____", every place shown, empty ones as underscores. With
   * `blinkBright` false the place under the cursor shows blank, so the cursor blinks.
   */
  line(blinkBright: boolean): string {
    let cells = '';
    for (let i = 0; i < NAME_MAX; i++) {
      const c = this.name[i] ?? '_';
      cells += i === this.at && !blinkBright ? ' ' : c;
    }
    return `Name ${cells}`;
  }
}

const NAME_ERRORS = { empty: 'Name needed', bad: 'Bad name', vulgar: 'Name refused' } as const;

/** The end screen's prompt while the name entry is up, for the keyboard or a gamepad. */
export function nameHint(pad: boolean): string {
  return pad ? 'A Post  B Skip' : 'Enter Post  Esc Skip';
}

const LAST_NAME_KEY = 'pattern-break.name';

/** The name last posted under in this browser, or ''. */
export function loadLastName(storage: Pick<Storage, 'getItem'> | null): string {
  try {
    return cleanName(storage?.getItem(LAST_NAME_KEY) ?? '');
  } catch {
    return '';
  }
}

export function saveLastName(storage: Pick<Storage, 'setItem'> | null, name: string): void {
  try {
    storage?.setItem(LAST_NAME_KEY, name);
  } catch {
    // Storage full or blocked: the name is entered again next time.
  }
}
