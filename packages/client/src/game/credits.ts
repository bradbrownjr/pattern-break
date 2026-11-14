// The credits (docs/DEVELOPMENT.md, "Credits"): the bundled songs with their authors, the
// code the game is built on with its licenses, and the game itself, rolling slowly up the
// screen like a film's credits. From the title menu the roll loops over the title music;
// after the last level of a run it opens with a thank-you and the run's total, plays once,
// and ends on "The End" (Brad, 2026-11-10).
//
// Up, down or confirm stops the roll and puts a cursor on a row; Enter then opens the row's
// page: a song's page where it was published, or a license text the build serves beside
// the game (licenses/, written by vite.config.ts), so the licenses open offline too. After
// RESUME_MS with no input the cursor goes and the roll carries on.

import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '@game/core';
import { Container, Graphics } from 'pixi.js';
import { AMBER, CYAN, DIM_GREY, GREY, MAGENTA } from '../render/palette.ts';
import { PixelText } from '../render/text.ts';
import type { MenuAction } from './input.ts';
import type { BundledSong } from './songs.ts';

/**
 * A section heading; a row that opens `url`, with `detail` shown under the roll while it is
 * selected; or a line of text, centred, `size` 2 for a large one ('' for a gap).
 */
export type CreditRow =
  | { heading: string }
  | { label: string; value: string; detail: string; url: string }
  | { text: string; color?: number; size?: 1 | 2 };

export type LinkRow = Extract<CreditRow, { url: string }>;

export function isLink(row: CreditRow | undefined): row is LinkRow {
  return row !== undefined && 'url' in row;
}

/** The game's source code. */
export const SOURCE_URL = 'https://github.com/bradbrownjr/pattern-break';

/** The host of a URL, for the detail line ("modarchive.org"). */
function host(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

/** The sections, top to bottom: Music (the bundled songs, in order), Code, Game. */
export function creditRows(songs: readonly BundledSong[]): CreditRow[] {
  const rows: CreditRow[] = [{ heading: 'Music' }];
  for (const song of songs) {
    if (song.imported || !song.sourceUrl) continue;
    rows.push({ label: song.title, value: song.author, detail: `${song.license}  ${host(song.sourceUrl)}`, url: song.sourceUrl });
  }
  rows.push(
    { text: '' },
    { heading: 'Code' },
    { label: 'libopenmpt', value: 'BSD-3-Clause', detail: 'Plays the songs', url: 'licenses/libopenmpt.txt' },
    { label: 'PixiJS', value: 'MIT', detail: 'Graphics', url: 'licenses/third-party.txt' },
    { label: 'idb', value: 'ISC', detail: 'Song library', url: 'licenses/third-party.txt' },
    { label: 'Workbox', value: 'MIT', detail: 'Offline play', url: 'licenses/workbox.txt' },
    { text: '' },
    { heading: 'Game' },
    { label: 'Pattern Break', value: 'MIT', detail: `Source  ${host(SOURCE_URL)}`, url: SOURCE_URL },
  );
  return rows;
}

/** The roll after a finished run: a thank-you and the run's total, the credits, The End. */
export function endingRows(songs: readonly BundledSong[], difficulty: string, total: number): CreditRow[] {
  const gap: CreditRow = { text: '' };
  return [
    { text: 'Thank you for playing', color: CYAN, size: 2 },
    gap,
    { text: `${difficulty}  Total ${total}`, color: AMBER },
    gap,
    gap,
    { text: 'Credits', color: CYAN, size: 2 },
    gap,
    ...creditRows(songs),
    gap,
    gap,
    gap,
    { text: 'The End', color: CYAN, size: 2 },
  ];
}

/** The height of a row: one line, or two for large text. */
export const ROW = 11;
function rowHeight(row: CreditRow): number {
  return 'text' in row && row.size === 2 ? ROW * 2 : ROW;
}

/** How fast the credits roll. */
export const ROLL_PX_PER_S = 10;
/** How long the roll stays stopped after the last input. */
export const RESUME_MS = 4000;

export type CreditsCommand =
  | { type: 'moved' }
  | { type: 'open'; url: string }
  /** Leave the credits for the title. */
  | { type: 'back' }
  /** The ending's roll jumped to The End. */
  | { type: 'skipped' };

/**
 * The roll's state: how far it has scrolled, whether it is stopped with a cursor on a row,
 * and, for the ending, whether it has reached The End. `offset` is the y in the content at
 * the view's top edge; the roll starts with the content just below the view.
 */
export class CreditsRoll {
  readonly rows: readonly CreditRow[];
  /** The top of each row in the content, in px. */
  readonly rowTops: readonly number[];
  readonly contentHeight: number;
  readonly viewHeight: number;
  /** Loops from the end back to the start (the title menu's credits), or stops at The End. */
  readonly loop: boolean;
  offset: number;
  #cursor: number | null = null;
  #idleMs = 0;
  #ended = false;

  constructor(rows: readonly CreditRow[], viewHeight: number, loop: boolean) {
    this.rows = rows;
    const tops: number[] = [];
    let y = 0;
    for (const row of rows) {
      tops.push(y);
      y += rowHeight(row);
    }
    this.rowTops = tops;
    this.contentHeight = y;
    this.viewHeight = viewHeight;
    this.loop = loop;
    this.offset = -viewHeight;
  }

  /** The row under the cursor while the roll is stopped, or null while it rolls. */
  get cursor(): number | null {
    return this.#cursor;
  }

  /** True once the ending's roll has reached The End. */
  get ended(): boolean {
    return this.#ended;
  }

  /** Where the ending stops: its last row (The End) in the middle of the view. */
  get endOffset(): number {
    const last = this.rows.length - 1;
    return this.rowTops[last]! + rowHeight(this.rows[last]!) / 2 - this.viewHeight / 2;
  }

  /** Moves the roll on by `ms`, or counts towards resuming it while it is stopped. */
  tick(ms: number): void {
    if (this.#ended) return;
    if (this.#cursor !== null) {
      this.#idleMs += ms;
      if (this.#idleMs >= RESUME_MS) this.#cursor = null;
      return;
    }
    this.offset += (ms * ROLL_PX_PER_S) / 1000;
    if (this.loop) {
      if (this.offset >= this.contentHeight) this.offset = -this.viewHeight;
    } else if (this.offset >= this.endOffset) {
      this.offset = this.endOffset;
      this.#ended = true;
    }
  }

  apply(action: MenuAction): CreditsCommand | null {
    if (this.#ended) return action === 'up' || action === 'down' || action === 'left' || action === 'right' ? null : { type: 'back' };
    switch (action) {
      case 'up':
      case 'down':
      case 'confirm': {
        this.#idleMs = 0;
        if (this.#cursor === null) {
          // The first press stops the roll on the row nearest the middle of the view.
          this.#cursor = this.#nearestLink();
          if (this.#cursor === null) return null;
          this.#keepInView(this.#cursor);
          return { type: 'moved' };
        }
        if (action === 'confirm') {
          const row = this.rows[this.#cursor];
          return isLink(row) ? { type: 'open', url: row.url } : null;
        }
        const next = this.#stepLink(this.#cursor, action === 'up' ? -1 : 1);
        if (next === this.#cursor) return null;
        this.#cursor = next;
        this.#keepInView(next);
        return { type: 'moved' };
      }
      case 'back':
        if (this.loop) return { type: 'back' };
        this.#cursor = null;
        this.offset = this.endOffset;
        this.#ended = true;
        return { type: 'skipped' };
      default:
        return null;
    }
  }

  #nearestLink(): number | null {
    const middle = this.offset + this.viewHeight / 2;
    let best: number | null = null;
    let bestDistance = Infinity;
    this.rows.forEach((row, i) => {
      if (!isLink(row)) return;
      const distance = Math.abs(this.rowTops[i]! + ROW / 2 - middle);
      if (distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    });
    return best;
  }

  /** The next link from `from` in direction `step`, or `from` at either end. */
  #stepLink(from: number, step: 1 | -1): number {
    for (let i = from + step; i >= 0 && i < this.rows.length; i += step) {
      if (isLink(this.rows[i])) return i;
    }
    return from;
  }

  /** Scrolls as little as it can to show row `i` whole. */
  #keepInView(i: number): void {
    const top = this.rowTops[i]!;
    if (top < this.offset) this.offset = top;
    else if (top + ROW > this.offset + this.viewHeight) this.offset = top + ROW - this.viewHeight;
  }
}

const CENTER = PLAYFIELD_WIDTH / 2;
const DETAIL_Y = PLAYFIELD_HEIGHT - 14;
const VIEW_BOTTOM = DETAIL_Y - 6;
/** The view's top: under the fixed heading on the menu's credits, near the top for the ending. */
const VIEW_TOP = { menu: 32, ending: 6 } as const;
const LABEL_X = 88;
const HEADING_X = 68;
const VALUE_RIGHT = 296;

/** The roll's height for the menu's credits or the ending. */
export function viewHeight(kind: 'menu' | 'ending'): number {
  return VIEW_BOTTOM - VIEW_TOP[kind];
}

/** What a row draws: its texts, made once. */
interface RowView {
  label: PixelText;
  value: PixelText | null;
}

export class CreditsScreen {
  readonly container = new Container();
  #heading = new Container();
  #content = new Container();
  #mask = new Graphics();
  #marker = new PixelText('>', AMBER);
  #detail = new PixelText('', GREY);
  #rows: RowView[] = [];
  #roll: CreditsRoll | null = null;
  #cursor: number | null = null;
  /** What the detail line last showed, so an unchanged frame skips the text work. */
  #drawnDetail = '';

  constructor() {
    const shadow = new PixelText('Credits', MAGENTA, 2).place(CENTER + 1, 10 + 1, 'center');
    const heading = new PixelText('Credits', CYAN, 2).place(CENTER, 10, 'center');
    this.#heading.addChild(shadow, heading);
    this.#content.mask = this.#mask;
    this.#content.addChild(this.#marker);
    this.container.addChild(this.#heading, this.#mask, this.#content, this.#detail);
  }

  /** Lays out `roll`'s rows: the menu's credits under the fixed heading, or the ending. */
  show(roll: CreditsRoll, kind: 'menu' | 'ending'): void {
    this.#roll = roll;
    for (const row of this.#rows) {
      row.label.destroy();
      row.value?.destroy();
    }
    this.#rows = [];
    this.#heading.visible = kind === 'menu';
    const top = VIEW_TOP[kind];
    this.#mask.clear().rect(0, top, PLAYFIELD_WIDTH, VIEW_BOTTOM - top).fill(0xffffff);
    this.#content.position.set(0, top);
    roll.rows.forEach((row, i) => {
      const y = roll.rowTops[i]!;
      let view: RowView;
      if ('heading' in row) {
        view = { label: new PixelText(row.heading, CYAN).place(HEADING_X, y), value: null };
      } else if ('url' in row) {
        view = {
          label: new PixelText(row.label, GREY).place(LABEL_X, y),
          value: new PixelText(row.value, DIM_GREY).place(VALUE_RIGHT, y, 'right'),
        };
      } else {
        view = { label: new PixelText(row.text, row.color ?? GREY, row.size ?? 1).place(CENTER, y, 'center'), value: null };
      }
      this.#rows.push(view);
      this.#content.addChild(view.label);
      if (view.value) this.#content.addChild(view.value);
    });
    this.#cursor = null;
    this.#marker.visible = false;
    this.#drawnDetail = '\0';
  }

  /** Draws the roll where it is now, with `note` (a warning) in place of the detail line. */
  /**
   * `touch`: the touch buttons are on show and say Select and Back themselves. `pad`: the
   * last press was a gamepad's, so the hint names its buttons.
   */
  update(note = '', touch = false, pad = false): void {
    const roll = this.#roll;
    if (!roll) return;
    this.#content.y = (this.#heading.visible ? VIEW_TOP.menu : VIEW_TOP.ending) - Math.round(roll.offset);
    const cursor = roll.cursor;
    if (cursor !== this.#cursor) {
      if (this.#cursor !== null) this.#paint(this.#cursor, false);
      if (cursor !== null) this.#paint(cursor, true);
      this.#cursor = cursor;
      this.#marker.visible = cursor !== null;
      if (cursor !== null) this.#marker.place(LABEL_X - 10, roll.rowTops[cursor]!);
    }
    const row = cursor === null ? undefined : roll.rows[cursor];
    let detail: string;
    let color = GREY;
    if (note) {
      detail = note;
      color = MAGENTA;
    } else if (isLink(row)) {
      detail = row.detail;
    } else if (roll.ended) {
      detail = touch ? '' : pad ? 'A Title' : 'Any key Title';
      color = CYAN;
    } else {
      detail = roll.loop || touch ? 'Up Down Select' : pad ? 'Up Down Select  B Skip' : 'Up Down Select  Esc Skip';
      color = DIM_GREY;
    }
    const key = `${detail}|${color}`;
    if (key === this.#drawnDetail) return;
    this.#drawnDetail = key;
    this.#detail.text = detail;
    this.#detail.color = color;
    this.#detail.place(CENTER, DETAIL_Y, 'center');
  }

  #paint(i: number, selected: boolean): void {
    const view = this.#rows[i];
    if (!view?.value) return;
    view.label.color = selected ? AMBER : GREY;
    view.value.color = selected ? GREY : DIM_GREY;
  }
}
