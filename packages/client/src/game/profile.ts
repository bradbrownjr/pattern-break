// The name entry, from the Scores screen: the nickname the boards show and an optional link
// (docs/PLAN.md, "Server", "Players"). Typing and pasting fill the field under the cursor;
// up and down move between Name, Link and Save. A gamepad edits a field the arcade way:
// up and down cycle the character under the cursor, left and right move it (applyPad). A
// touch opens the phone's keyboard (touch-text.ts). ProfileForm is the state, so tests run
// in Node; ProfileScreen draws it.

import { PLAYFIELD_WIDTH } from '@game/core';
import { Container } from 'pixi.js';
import { AMBER, CYAN, GREY, MAGENTA, WHITE } from '../render/palette.ts';
import { GLYPH_ADVANCE } from '../render/font.ts';
import { PixelText } from '../render/text.ts';
import type { MenuAction } from './input.ts';

export const NICKNAME_MAX = 12;
export const LINK_MAX = 200;
/** The server's rule (packages/server/src/app.ts): printable ASCII, no space at either end. */
export const NICKNAME = /^[\x21-\x7e](?:[\x20-\x7e]{0,10}[\x21-\x7e])?$/;

export const PROFILE_ROWS = ['nickname', 'link', 'save'] as const;
export type ProfileRow = (typeof PROFILE_ROWS)[number];
export type ProfileField = Exclude<ProfileRow, 'save'>;

/** The longest each field may be. */
export const FIELD_MAX: Record<ProfileField, number> = { nickname: NICKNAME_MAX, link: LINK_MAX };

const PRINTABLE = Array.from({ length: 0x7e - 0x20 }, (_, i) => String.fromCharCode(0x21 + i));
/**
 * The characters a gamepad cycles through: capitals first, as on an arcade's name entry,
 * then small letters, digits, a space and the rest of printable ASCII.
 */
export const PAD_CHARS = [
  ...PRINTABLE.filter((c) => c >= 'A' && c <= 'Z'),
  ...PRINTABLE.filter((c) => c >= 'a' && c <= 'z'),
  ...PRINTABLE.filter((c) => c >= '0' && c <= '9'),
  ' ',
  ...PRINTABLE.filter((c) => !/[A-Za-z0-9]/.test(c)),
].join('');

/** What a gamepad does on the name entry: the menu actions, and erasing with Y. */
export type PadEdit = MenuAction | 'erase';

export class ProfileForm {
  nickname: string;
  link: string;
  cursor = 0;
  /** What went wrong with the last save, shown under the fields ("Name taken"); '' for nothing. */
  error = '';
  /** True while a save is with the server. */
  busy = false;
  /**
   * The character the cursor is on in the field under it: 0 to the field's length (one past
   * the end is where the next character goes), and below the field's maximum.
   */
  at = 0;

  constructor(nickname = '', link = '') {
    this.nickname = nickname;
    this.link = link;
    this.#home();
  }

  get row(): ProfileRow {
    return PROFILE_ROWS[this.cursor]!;
  }

  /** The field under the cursor, or null on Save. */
  get field(): ProfileField | null {
    const row = this.row;
    return row === 'save' ? null : row;
  }

  /** Puts the character cursor at the end of the field, where typing goes. */
  #home(): void {
    const field = this.field;
    this.at = field ? Math.min(this[field].length, FIELD_MAX[field] - 1) : 0;
  }

  /** Adds printable ASCII to the field under the cursor, up to its length; true if any was added. */
  type(text: string): boolean {
    const row = this.row;
    if (row === 'save' || this.busy) return false;
    const max = row === 'nickname' ? NICKNAME_MAX : LINK_MAX;
    const clean = text.replace(/[^\x20-\x7e]/g, '');
    const room = max - this[row].length;
    if (clean.length === 0 || room <= 0) return false;
    this[row] += clean.slice(0, room);
    this.error = '';
    this.#home();
    return true;
  }

  /** Sets the whole field under the cursor, as the phone's keyboard leaves it; true if it changed. */
  replace(text: string): boolean {
    const field = this.field;
    if (!field || this.busy) return false;
    const clean = text.replace(/[^\x20-\x7e]/g, '').slice(0, FIELD_MAX[field]);
    if (clean === this[field]) return false;
    this[field] = clean;
    this.error = '';
    this.#home();
    return true;
  }

  /** Removes the last character of the field under the cursor; true if one went. */
  erase(): boolean {
    const row = this.row;
    if (row === 'save' || this.busy || this[row].length === 0) return false;
    this[row] = this[row].slice(0, -1);
    this.error = '';
    this.#home();
    return true;
  }

  /**
   * A gamepad on the form. In a field, up and down cycle the character under the cursor
   * through PAD_CHARS (one past the end adds one), left and right move the cursor, and erase
   * removes the character under it, or the last one from past the end. On Save, up and down
   * move between rows. Confirm and back are as apply().
   */
  applyPad(edit: PadEdit): 'moved' | 'changed' | 'save' | 'back' | null {
    const field = this.field;
    if (edit === 'confirm' || edit === 'back' || !field) return edit === 'erase' ? null : this.apply(edit);
    if (this.busy) return null;
    const value = this[field];
    switch (edit) {
      case 'up':
      case 'down': {
        const step = edit === 'up' ? 1 : -1;
        const n = PAD_CHARS.length;
        if (this.at === value.length) {
          if (value.length >= FIELD_MAX[field]) return null;
          this[field] = value + PAD_CHARS[step > 0 ? 0 : n - 1]!;
        } else {
          const i = PAD_CHARS.indexOf(value[this.at]!);
          const next = PAD_CHARS[(((i < 0 ? 0 : i + step) % n) + n) % n]!;
          this[field] = value.slice(0, this.at) + next + value.slice(this.at + 1);
        }
        this.error = '';
        return 'changed';
      }
      case 'left':
        if (this.at === 0) return null;
        this.at--;
        return 'moved';
      case 'right':
        if (this.at >= value.length || this.at + 1 >= FIELD_MAX[field]) return null;
        this.at++;
        return 'moved';
      case 'erase': {
        if (value.length === 0) return null;
        const i = this.at < value.length ? this.at : value.length - 1;
        this[field] = value.slice(0, i) + value.slice(i + 1);
        this.at = Math.min(i, this[field].length);
        this.error = '';
        return 'changed';
      }
    }
  }

  /** What's wrong before asking the server, or null. */
  check(): string | null {
    if (!NICKNAME.test(this.nickname)) return this.nickname.trim() === '' ? 'Name needed' : 'Bad name';
    const link = this.link.trim();
    if (link === '') return null;
    try {
      const url = new URL(link);
      return url.protocol === 'https:' || url.protocol === 'http:' ? null : 'Bad link';
    } catch {
      return 'Bad link';
    }
  }

  apply(action: MenuAction): 'moved' | 'save' | 'back' | null {
    if (this.busy) return action === 'back' ? 'back' : null;
    switch (action) {
      case 'up':
      case 'down': {
        const n = PROFILE_ROWS.length;
        this.cursor = (((this.cursor + (action === 'up' ? -1 : 1)) % n) + n) % n;
        this.#home();
        return 'moved';
      }
      case 'confirm':
        if (this.row !== 'save') {
          this.cursor++;
          this.#home();
          return 'moved';
        }
        // A pad leaves spaces where it stopped cycling; the server wants none at the ends.
        this.nickname = this.nickname.trim();
        this.error = this.check() ?? '';
        return this.error ? null : 'save';
      case 'back':
        return 'back';
      default:
        return null;
    }
  }
}

const CENTER = PLAYFIELD_WIDTH / 2;
const TOP = 76;
const ROW = 16;
const LABEL_X = 72;
const VALUE_X = 120;
/** Characters of a field shown at once; a longer link shows its end. */
const FIELD_CHARS = 36;

/**
 * The field as shown: FIELD_CHARS - 1 characters of it, the end unless the character cursor
 * `at` is further left, and where in that text the cursor sits.
 */
export function fieldView(value: string, at: number): { text: string; cursor: number } {
  const width = FIELD_CHARS - 1;
  const start = Math.min(Math.max(0, value.length - width), at);
  return { text: value.slice(start, start + width), cursor: at - start };
}

export class ProfileScreen {
  readonly container = new Container();
  #marker = new PixelText('>', AMBER);
  #labels = ['Name', 'Link', 'Save'].map((t) => new PixelText(t, GREY));
  #values = [new PixelText('', GREY), new PixelText('', GREY)];
  #error = new PixelText('', MAGENTA);
  #hint = new PixelText('', CYAN);
  #caret = new PixelText('_', WHITE);

  constructor() {
    const shadow = new PixelText('Name', MAGENTA, 2).place(CENTER + 1, 40 + 1, 'center');
    const heading = new PixelText('Name', CYAN, 2).place(CENTER, 40, 'center');
    this.container.addChild(shadow, heading, this.#marker, this.#error, this.#hint, this.#caret);
    this.#labels.forEach((label, i) => {
      label.place(LABEL_X, TOP + i * ROW);
      this.container.addChild(label);
    });
    this.#values.forEach((v, i) => {
      v.place(VALUE_X, TOP + i * ROW);
      this.container.addChild(v);
    });
  }

  /** `pad`: the last press was a gamepad's, so the hint shows its buttons. */
  update(form: ProfileForm, blinkBright: boolean, pad = false): void {
    this.#caret.visible = false;
    PROFILE_ROWS.forEach((row, i) => {
      const selected = form.cursor === i;
      this.#labels[i]!.color = selected ? AMBER : GREY;
      if (row === 'save') return;
      const v = this.#values[i]!;
      const view = fieldView(form[row], selected ? form.at : form[row].length);
      v.text = view.text;
      v.color = selected ? WHITE : GREY;
      if (selected && blinkBright && !form.busy) {
        this.#caret.visible = true;
        this.#caret.place(VALUE_X + view.cursor * GLYPH_ADVANCE, TOP + i * ROW + 2);
      }
    });
    this.#marker.place(LABEL_X - 10, TOP + form.cursor * ROW);
    this.#error.text = form.busy ? 'Saving' : form.error;
    this.#error.color = form.busy ? GREY : MAGENTA;
    this.#error.place(CENTER, TOP + 3 * ROW + 8, 'center');
    this.#hint.text = profileHint(form.row, pad);
    this.#hint.place(CENTER, 204, 'center');
  }
}

/** The prompt under the form, for the keyboard or a gamepad. */
export function profileHint(row: ProfileRow, pad: boolean): string {
  if (pad) return row === 'save' ? 'A Save  B Back' : 'Up Down Letter  Y Erase  A Next';
  return row === 'save' ? 'Enter Save  Esc Back' : 'Type  Enter Next  Esc Back';
}

/** The form's line for what the server said about a save. */
export function saveError(error: string): string {
  switch (error) {
    case 'nickname taken':
      return 'Name taken';
    case 'bad nickname':
      return 'Bad name';
    case 'bad link':
      return 'Bad link';
    case 'offline':
      return 'Offline';
    case 'unavailable':
      return 'Needs HTTPS';
    default:
      return 'Not saved';
  }
}
