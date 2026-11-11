// The name entry, from the Scores screen: the nickname the boards show and an optional link
// (docs/PLAN.md, "Server", "Players"). Typing and pasting fill the field under the cursor;
// up and down move between Name, Link and Save. ProfileForm is the state, so tests run in
// Node; ProfileScreen draws it.

import { PLAYFIELD_WIDTH } from '@game/core';
import { Container } from 'pixi.js';
import { AMBER, CYAN, GREY, MAGENTA, WHITE } from '../render/palette.ts';
import { PixelText } from '../render/text.ts';
import type { MenuAction } from './input.ts';

export const NICKNAME_MAX = 12;
export const LINK_MAX = 200;
/** The server's rule (packages/server/src/app.ts): printable ASCII, no space at either end. */
export const NICKNAME = /^[\x21-\x7e](?:[\x20-\x7e]{0,10}[\x21-\x7e])?$/;

export const PROFILE_ROWS = ['nickname', 'link', 'save'] as const;
export type ProfileRow = (typeof PROFILE_ROWS)[number];

export class ProfileForm {
  nickname: string;
  link: string;
  cursor = 0;
  /** What went wrong with the last save, shown under the fields ("Name taken"); '' for nothing. */
  error = '';
  /** True while a save is with the server. */
  busy = false;

  constructor(nickname = '', link = '') {
    this.nickname = nickname;
    this.link = link;
  }

  get row(): ProfileRow {
    return PROFILE_ROWS[this.cursor]!;
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
    return true;
  }

  /** Removes the last character of the field under the cursor; true if one went. */
  erase(): boolean {
    const row = this.row;
    if (row === 'save' || this.busy || this[row].length === 0) return false;
    this[row] = this[row].slice(0, -1);
    this.error = '';
    return true;
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
        return 'moved';
      }
      case 'confirm':
        if (this.row !== 'save') {
          this.cursor++;
          return 'moved';
        }
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

/** The field as shown: its last FIELD_CHARS characters, with a cursor when selected. */
export function fieldText(value: string, selected: boolean, blinkBright: boolean): string {
  const shown = value.length > FIELD_CHARS - 1 ? value.slice(value.length - (FIELD_CHARS - 1)) : value;
  return selected ? `${shown}${blinkBright ? '_' : ' '}` : shown;
}

export class ProfileScreen {
  readonly container = new Container();
  #marker = new PixelText('>', AMBER);
  #labels = ['Name', 'Link', 'Save'].map((t) => new PixelText(t, GREY));
  #values = [new PixelText('', GREY), new PixelText('', GREY)];
  #error = new PixelText('', MAGENTA);
  #hint = new PixelText('', CYAN);

  constructor() {
    const shadow = new PixelText('Name', MAGENTA, 2).place(CENTER + 1, 40 + 1, 'center');
    const heading = new PixelText('Name', CYAN, 2).place(CENTER, 40, 'center');
    this.container.addChild(shadow, heading, this.#marker, this.#error, this.#hint);
    this.#labels.forEach((label, i) => {
      label.place(LABEL_X, TOP + i * ROW);
      this.container.addChild(label);
    });
    this.#values.forEach((v, i) => {
      v.place(VALUE_X, TOP + i * ROW);
      this.container.addChild(v);
    });
  }

  update(form: ProfileForm, blinkBright: boolean): void {
    PROFILE_ROWS.forEach((row, i) => {
      const selected = form.cursor === i;
      this.#labels[i]!.color = selected ? AMBER : GREY;
      if (row === 'save') return;
      const v = this.#values[i]!;
      v.text = fieldText(form[row], selected, blinkBright);
      v.color = selected ? WHITE : GREY;
    });
    this.#marker.place(LABEL_X - 10, TOP + form.cursor * ROW);
    this.#error.text = form.busy ? 'Saving' : form.error;
    this.#error.color = form.busy ? GREY : MAGENTA;
    this.#error.place(CENTER, TOP + 3 * ROW + 8, 'center');
    this.#hint.text = form.row === 'save' ? 'Enter Save  Esc Back' : 'Type  Enter Next  Esc Back';
    this.#hint.place(CENTER, 204, 'center');
  }
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
