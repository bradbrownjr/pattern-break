// The credits screen, from the title menu (docs/DEVELOPMENT.md, "Credits"): the bundled
// songs with their authors, the code the game is built on with its licenses, and the game
// itself. Each row opens a page: a song's page where it was published, or a license text
// the build serves beside the game (licenses/, written by vite.config.ts), so the licenses
// open offline too. Taller than the screen, so it scrolls to keep the cursor in view.

import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { AMBER, CYAN, DIM_GREY, GREY, MAGENTA } from '../render/palette.ts';
import { PixelText } from '../render/text.ts';
import type { MenuAction } from './input.ts';
import type { BundledSong } from './songs.ts';

/** A heading, or a row that opens `url` with `detail` shown under the list while selected. */
export type CreditRow = { heading: string } | { label: string; value: string; detail: string; url: string };

/** The game's source code. */
export const SOURCE_URL = 'https://github.com/bradbrownjr/pattern-break';

/** The host of a URL, for the detail line ("modarchive.org"). */
function host(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

/** The rows, top to bottom: Music (the bundled songs, in order), Code, Game. */
export function creditRows(songs: readonly BundledSong[]): CreditRow[] {
  const rows: CreditRow[] = [{ heading: 'Music' }];
  for (const song of songs) {
    if (song.imported || !song.sourceUrl) continue;
    rows.push({ label: song.title, value: song.author, detail: `${song.license}  ${host(song.sourceUrl)}`, url: song.sourceUrl });
  }
  rows.push(
    { heading: 'Code' },
    { label: 'libopenmpt', value: 'BSD-3-Clause', detail: 'Plays the songs', url: 'licenses/libopenmpt.txt' },
    { label: 'PixiJS', value: 'MIT', detail: 'Graphics', url: 'licenses/third-party.txt' },
    { label: 'idb', value: 'ISC', detail: 'Song library', url: 'licenses/third-party.txt' },
    { label: 'Workbox', value: 'MIT', detail: 'Offline play', url: 'licenses/workbox.txt' },
    { heading: 'Game' },
    { label: 'Pattern Break', value: 'MIT', detail: `Source  ${host(SOURCE_URL)}`, url: SOURCE_URL },
  );
  return rows;
}

export type CreditsCommand = { type: 'moved' } | { type: 'open'; url: string } | { type: 'back' };

/**
 * The cursor over the rows that open something; headings are skipped. Up and down move it,
 * wrapping; confirm opens the row; back returns to the title.
 */
export class CreditsMenu {
  readonly rows: readonly CreditRow[];
  /** The rows the cursor can be on. */
  readonly #links: number[];
  #at = 0;

  constructor(rows: readonly CreditRow[]) {
    this.rows = rows;
    this.#links = rows.flatMap((row, i) => ('url' in row ? [i] : []));
  }

  /** The row under the cursor, an index into `rows`. */
  get cursor(): number {
    return this.#links[this.#at] ?? 0;
  }

  reset(): void {
    this.#at = 0;
  }

  apply(action: MenuAction): CreditsCommand | null {
    const count = this.#links.length;
    switch (action) {
      case 'up':
      case 'down':
        if (count === 0) return null;
        this.#at = (this.#at + (action === 'up' ? count - 1 : 1)) % count;
        return { type: 'moved' };
      case 'confirm': {
        const row = this.rows[this.cursor];
        return row && 'url' in row ? { type: 'open', url: row.url } : null;
      }
      case 'back':
        return { type: 'back' };
      default:
        return null;
    }
  }
}

const CENTER = PLAYFIELD_WIDTH / 2;
const TOP = 34;
const ROW = 11;
const DETAIL_Y = PLAYFIELD_HEIGHT - 14;
/** Rows that fit between the heading and the detail line. */
export const CREDITS_VISIBLE_ROWS = Math.floor((DETAIL_Y - 6 - TOP) / ROW);
const LABEL_X = 88;
const HEADING_X = 68;
const VALUE_RIGHT = 296;
const BAR_X = 302;

/**
 * The first row in view for the cursor on `cursor`, scrolled as little as possible from
 * `top`. A cursor on the first link of a section shows the section's heading too.
 */
export function creditsTop(top: number, cursor: number, rows: readonly CreditRow[], visible: number): number {
  const above = cursor > 0 && 'heading' in rows[cursor - 1]! ? cursor - 1 : cursor;
  let t = Math.min(top, above);
  if (cursor >= t + visible) t = cursor - visible + 1;
  return Math.max(0, Math.min(t, rows.length - visible));
}

export class CreditsScreen {
  readonly container = new Container();
  #rows: readonly CreditRow[];
  #labels: PixelText[] = [];
  #values: PixelText[] = [];
  #marker = new PixelText('>', AMBER);
  #detail = new PixelText('', GREY);
  #track = new Sprite(Texture.WHITE);
  #thumb = new Sprite(Texture.WHITE);
  #top = 0;
  /** What the screen last showed, so an unchanged frame skips the text work. */
  #drawn = '';

  constructor(rows: readonly CreditRow[]) {
    this.#rows = rows;
    const shadow = new PixelText('Credits', MAGENTA, 2).place(CENTER + 1, 10 + 1, 'center');
    const heading = new PixelText('Credits', CYAN, 2).place(CENTER, 10, 'center');
    this.container.addChild(shadow, heading, this.#marker, this.#detail);
    for (let i = 0; i < CREDITS_VISIBLE_ROWS; i++) {
      const label = new PixelText('');
      const value = new PixelText('', DIM_GREY);
      this.#labels.push(label);
      this.#values.push(value);
      this.container.addChild(label, value);
    }
    this.#track.tint = DIM_GREY;
    this.#track.alpha = 0.4;
    this.#track.width = 2;
    this.#thumb.tint = GREY;
    this.#thumb.width = 2;
    this.container.addChild(this.#track, this.#thumb);
  }

  /** The first row in view. */
  get top(): number {
    return this.#top;
  }

  /** Draws the list with the cursor on row `cursor`, and `note` (a warning) in place of the detail. */
  update(cursor: number, note = ''): void {
    const key = `${cursor}|${note}`;
    if (key === this.#drawn) return;
    this.#drawn = key;
    const rows = this.#rows;
    const visible = Math.min(rows.length, CREDITS_VISIBLE_ROWS);
    this.#top = creditsTop(this.#top, cursor, rows, visible);
    for (let slot = 0; slot < CREDITS_VISIBLE_ROWS; slot++) {
      const label = this.#labels[slot]!;
      const value = this.#values[slot]!;
      const row = rows[this.#top + slot];
      label.visible = value.visible = slot < visible && row !== undefined;
      if (!label.visible || !row) continue;
      const y = TOP + slot * ROW;
      if ('heading' in row) {
        label.text = row.heading;
        label.color = CYAN;
        label.place(HEADING_X, y);
        value.text = '';
        continue;
      }
      const onCursor = this.#top + slot === cursor;
      label.text = row.label;
      label.color = onCursor ? AMBER : GREY;
      label.place(LABEL_X, y);
      value.text = row.value;
      value.color = onCursor ? GREY : DIM_GREY;
      value.place(VALUE_RIGHT, y, 'right');
    }
    this.#marker.place(LABEL_X - 10, TOP + (cursor - this.#top) * ROW);
    const row = rows[cursor];
    this.#detail.text = note || (row && 'detail' in row ? row.detail : '');
    this.#detail.color = note ? MAGENTA : GREY;
    this.#detail.place(CENTER, DETAIL_Y, 'center');
    // The scroll bar, as on the help screen and the jukebox.
    const scrolls = rows.length > visible;
    this.#track.visible = this.#thumb.visible = scrolls;
    if (scrolls) {
      const trackTop = TOP - 2;
      const trackHeight = (visible - 1) * ROW + 7 + 4;
      this.#track.position.set(BAR_X, trackTop);
      this.#track.height = trackHeight;
      const height = Math.max(4, Math.round((trackHeight * visible) / rows.length));
      this.#thumb.height = height;
      this.#thumb.position.set(BAR_X, trackTop + Math.round(((trackHeight - height) * this.#top) / (rows.length - visible)));
    }
  }
}
