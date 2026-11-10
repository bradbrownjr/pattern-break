// The title screen, the jukebox, the pause menu, the settings, and the messages drawn over play
// (analyzing, crashed, song complete, errors). Layout is in 384x216 screen px.

import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH, type DifficultyName } from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { BRAND } from '../config/brand.ts';
import { AMBER, BACKGROUND, CYAN, DIM_GREY, GREY, LED_DIM, LED_LIT, LIME, MAGENTA, WHITE } from '../render/palette.ts';
import { PixelText } from '../render/text.ts';
import { textWidth } from '../render/font.ts';
import { DIFFICULTY_LABELS, PAUSE_ITEMS, SETTINGS_ITEMS, TITLE_ITEMS, type PauseItem, type SettingsItem, type TitleItem } from './menu.ts';
import { VOLUME_LEVELS, type Settings } from './settings.ts';
import type { BundledSong } from './songs.ts';

const CENTER = PLAYFIELD_WIDTH / 2;

/** What the title screen shows: the menu cursor and the current choices. */
export interface TitleView {
  cursor: number;
  /** Practice's song. */
  practice: BundledSong;
  difficulty: DifficultyName;
  /** The song playing on the title screen, credited under the menu. */
  music: BundledSong;
  /** The secrets on, in magenta under the credit: "Infinite lives", "God mode", or ''. */
  secret: string;
}

const TITLE_LABELS: Record<TitleItem, string> = {
  play: 'Play',
  practice: 'Practice',
  difficulty: 'Difficulty',
  jukebox: 'Jukebox',
  controls: 'Controls',
  help: 'Help',
  settings: 'Settings',
  credits: 'Credits',
};
const MENU_TOP = 78;
const MENU_ROW = 13;
const LABEL_X = 112;
const VALUE_X = 188;

/** The logo with its shadow, and the LED meter under it. */
function addLogo(container: Container): void {
  const shadow = new PixelText(BRAND.name, MAGENTA, 3).place(CENTER + 2, 30 + 2, 'center');
  const logo = new PixelText(BRAND.name, CYAN, 3).place(CENTER, 30, 'center');
  container.addChild(shadow, logo);
  // An LED meter under the logo, green to red.
  const segments = 24;
  const left = CENTER - (segments * 10 - 2) / 2;
  for (let i = 0; i < segments; i++) {
    const s = new Sprite(Texture.WHITE);
    s.tint = LED_LIT[Math.floor(i / 2)]!;
    s.position.set(left + i * 10, 60);
    s.width = 8;
    s.height = 3;
    container.addChild(s);
  }
}

/**
 * The logo, then either "Press any key" (the start screen, before audio may play) or the
 * menu with the credit for what is selected or playing.
 */
export class TitleScreen {
  readonly container = new Container();
  #menu = new Container();
  #press = new PixelText('Press any key', CYAN).place(CENTER, 120, 'center');
  /** Shown on the start screen after a gamepad press: browsers start sound only on a key or click. */
  #padHint = new PixelText('Key or click for sound', GREY).place(CENTER, 136, 'center');
  #marker = new PixelText('>', AMBER);
  #labels: PixelText[] = [];
  #values: PixelText[] = [];
  #credit = new PixelText('', GREY);
  #secret = new PixelText('', MAGENTA);
  /** What the last update() drew, so an unchanged frame does no work. */
  #drawn: { cursor: number; practice: BundledSong | null; difficulty: DifficultyName | null; secret: string } = {
    cursor: -1,
    practice: null,
    difficulty: null,
    secret: '',
  };

  constructor() {
    addLogo(this.container);
    for (let i = 0; i < TITLE_ITEMS.length; i++) {
      const y = MENU_TOP + i * MENU_ROW;
      const label = new PixelText(TITLE_LABELS[TITLE_ITEMS[i]!]).place(LABEL_X, y);
      const value = new PixelText('').place(VALUE_X - 12, y);
      this.#labels.push(label);
      this.#values.push(value);
      this.#menu.addChild(label, value);
    }
    this.#menu.addChild(
      this.#marker,
      this.#credit,
      this.#secret,
    );
    this.#padHint.visible = false;
    this.container.addChild(this.#menu, this.#press, this.#padHint);
  }

  /** Shows, on the start screen, that a key or click must come first. */
  showPadHint(): void {
    this.#padHint.visible = true;
  }

  /** `view` null shows the start screen. */
  update(view: TitleView | null, blinkBright: boolean): void {
    this.#menu.visible = view !== null;
    if (view) this.#padHint.visible = false;
    this.#press.visible = view === null && blinkBright;
    if (!view) return;
    this.#marker.visible = blinkBright;
    const d = this.#drawn;
    if (view.secret !== d.secret) {
      d.secret = view.secret;
      this.#secret.text = view.secret;
      this.#secret.place(CENTER, MENU_TOP + TITLE_ITEMS.length * MENU_ROW + 20, 'center');
    }
    if (d.cursor === view.cursor && d.practice === view.practice && d.difficulty === view.difficulty) return;
    d.cursor = view.cursor;
    d.practice = view.practice;
    d.difficulty = view.difficulty;
    for (let i = 0; i < TITLE_ITEMS.length; i++) {
      const item = TITLE_ITEMS[i]!;
      const selected = i === view.cursor;
      this.#labels[i]!.color = selected ? AMBER : GREY;
      const value =
        item === 'practice' ? view.practice.title : item === 'difficulty' ? DIFFICULTY_LABELS[view.difficulty] : '';
      // "< Normal >" on the selected row: left and right change it.
      const v = this.#values[i]!;
      v.text = value === '' ? '' : selected ? `< ${value} >` : `  ${value}`;
      v.color = selected ? WHITE : GREY;
    }
    this.#marker.place(LABEL_X - 10, MENU_TOP + view.cursor * MENU_ROW);
    const credited = TITLE_ITEMS[view.cursor] === 'practice' ? view.practice : view.music;
    this.#credit.text = `${credited === view.music ? 'Music: ' : ''}${credited.title} ${credited.credit}`;
    this.#credit.place(CENTER, MENU_TOP + TITLE_ITEMS.length * MENU_ROW + 8, 'center');
  }
}

/** Drawn over the demo: "Demo" at the top and the way back at the bottom. */
export class DemoBanner {
  readonly container = new Container();
  #press = new PixelText('Press any key', CYAN).place(CENTER, 196, 'center');

  /** `text` is the banner: Demo, or Replay when a replay plays. */
  constructor(text = 'Demo') {
    const shadow = new PixelText(text, MAGENTA, 2).place(CENTER + 1, 10 + 1, 'center');
    const label = new PixelText(text, WHITE, 2).place(CENTER, 10, 'center');
    this.container.addChild(shadow, label, this.#press);
  }

  update(blinkBright: boolean): void {
    this.#press.visible = blinkBright;
  }
}

/** A black screen over everything, for fades between screens. */
export class FadeOverlay {
  readonly container = new Container();
  #sprite = new Sprite(Texture.WHITE);

  constructor() {
    this.#sprite.tint = 0x000000;
    this.#sprite.width = PLAYFIELD_WIDTH;
    this.#sprite.height = PLAYFIELD_HEIGHT;
    this.container.addChild(this.#sprite);
    this.set(0);
  }

  /** 0 is clear, 1 is black. */
  set(amount: number): void {
    this.container.visible = amount > 0;
    this.#sprite.alpha = Math.min(1, Math.max(0, amount));
  }
}

/** What the jukebox shows. `levels` holds one height (0 to SPECTRUM_SEGMENTS) per bar. */
export interface JukeboxView {
  cursor: number;
  playing: number | null;
  seconds: number;
  durationSeconds: number;
  levels: Uint8Array;
  /** A message in place of the now-playing line (an import's progress or result), or ''. */
  note: string;
  /** The note is a warning (magenta), not news (cyan). */
  warn: boolean;
  /** On an imported song under the cursor, the key that removes it ("Del Remove"), or ''. */
  removeHint: string;
  /** The first press came; the hint asks for the second ("Del Confirm", magenta). */
  removeArmed: boolean;
  /** Import picks a folder rather than files. */
  importFolder: boolean;
}

export const SPECTRUM_BARS = 24;
export const SPECTRUM_SEGMENTS = LED_LIT.length;
// The spectrum's 12 segments are 2 px tall on a 3 px pitch, so it ends above the
// now-playing lines. The list's rows close up from 11 px to fit above it, down to 10 px
// for 11 rows (2026-11-10: at 11, Back ran into the spectrum once Crush was added); a
// longer list scrolls, with a bar like the help screen's.
const LIST_TOP = 34;
const LIST_ROW = 11;
const LIST_LEFT = 88;
const LIST_RIGHT = 296;
const SPECTRUM_BOTTOM = 182;
const SEGMENT_PITCH = 3;
/** The spectrum's top, and the gap the list keeps above it. */
const SPECTRUM_TOP = SPECTRUM_BOTTOM - SPECTRUM_SEGMENTS * SEGMENT_PITCH;
const LIST_GAP = 3;
const TEXT_HEIGHT = 7;

/** The list's row pitch for `rows` rows: 11 px, or less so the last ends above the spectrum. */
export function jukeboxRow(rows: number): number {
  if (rows < 2) return LIST_ROW;
  return Math.min(LIST_ROW, Math.floor((SPECTRUM_TOP - LIST_GAP - TEXT_HEIGHT - LIST_TOP) / (rows - 1)));
}

/** The top of row `i` of a `rows`-row list. */
export function jukeboxRowY(i: number, rows: number): number {
  return LIST_TOP + i * jukeboxRow(rows);
}

/** The most rows the list shows at once (at 10 px); a longer list scrolls. */
export const JUKEBOX_VISIBLE_ROWS = 11;

/**
 * The first row in view for a list of `rows` rows with the cursor on `cursor`, scrolled as
 * little as possible from `top` to keep the cursor in view.
 */
export function jukeboxTop(top: number, cursor: number, rows: number): number {
  const visible = Math.min(rows, JUKEBOX_VISIBLE_ROWS);
  let t = Math.min(top, cursor);
  if (cursor >= t + visible) t = cursor - visible + 1;
  return Math.max(0, Math.min(t, rows - visible));
}

const SCROLL_BAR_X = LIST_RIGHT + 6;

/** Where the list's last row ends and the spectrum starts, for tests. */
export const JUKEBOX_LIMITS = { spectrumTop: SPECTRUM_TOP, textHeight: TEXT_HEIGHT };
const NOW_Y = 188;

/** m:ss */
function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The bundled songs with their authors, a spectrum of what is playing, and its credit. */
export class JukeboxScreen {
  readonly container = new Container();
  #songs: readonly BundledSong[] = [];
  readonly #folder: boolean;
  #marker = new PixelText('>', AMBER);
  /** One title and one right-hand text per visible row, filled from `#top`. */
  #titles: PixelText[] = [];
  #rights: PixelText[] = [];
  #track = new Sprite(Texture.WHITE);
  #thumb = new Sprite(Texture.WHITE);
  #top = 0;
  #segments: Sprite[] = [];
  /** The song playing and its credit, on one line, or a note. */
  #nowTitle = new PixelText('', GREY);
  #nowTime = new PixelText('', CYAN);
  /** What the list last showed, so an unchanged frame skips the text work. */
  #drawn = '';

  /** `folder`: Import offers Folder as well as File. */
  constructor(songs: readonly BundledSong[], folder = false) {
    this.#folder = folder;
    const shadow = new PixelText('Jukebox', MAGENTA, 2).place(CENTER + 1, 12 + 1, 'center');
    const heading = new PixelText('Jukebox', CYAN, 2).place(CENTER, 12, 'center');
    this.container.addChild(shadow, heading, this.#marker);
    for (let i = 0; i < JUKEBOX_VISIBLE_ROWS; i++) {
      const title = new PixelText('');
      const right = new PixelText('', DIM_GREY);
      this.#titles.push(title);
      this.#rights.push(right);
      this.container.addChild(title, right);
    }
    this.#track.tint = DIM_GREY;
    this.#track.alpha = 0.4;
    this.#track.width = 2;
    this.#thumb.tint = GREY;
    this.#thumb.width = 2;
    this.container.addChild(this.#track, this.#thumb);
    const left = CENTER - (SPECTRUM_BARS * 10 - 2) / 2;
    for (let b = 0; b < SPECTRUM_BARS; b++) {
      for (let k = 0; k < SPECTRUM_SEGMENTS; k++) {
        const seg = new Sprite(Texture.WHITE);
        seg.position.set(left + b * 10, SPECTRUM_BOTTOM - (k + 1) * SEGMENT_PITCH);
        seg.width = 8;
        seg.height = SEGMENT_PITCH - 1;
        seg.tint = LED_DIM[k]!;
        this.#segments.push(seg);
        this.container.addChild(seg);
      }
    }
    this.container.addChild(this.#nowTitle, this.#nowTime);
    this.setSongs(songs);
  }

  /** The songs to list, after an import or a removal. */
  setSongs(songs: readonly BundledSong[]): void {
    this.#songs = songs;
    this.#drawn = '';
  }

  /** Rows in the list: the songs, Import and Back. */
  get rowCount(): number {
    return this.#songs.length + 2;
  }

  /** The first row in view. */
  get top(): number {
    return this.#top;
  }

  #label(i: number, view: JukeboxView): { title: string; right: string; song: BundledSong | null } {
    const song = this.#songs[i];
    if (song) return { title: song.title, right: song.author, song };
    if (i > this.#songs.length) return { title: 'Back', right: '', song: null };
    if (!this.#folder) return { title: 'Import', right: '', song: null };
    // "< File >" on the selected row, like the title screen's choices: left and right change it.
    const value = view.importFolder ? 'Folder' : 'File';
    return { title: 'Import', right: i === view.cursor ? `< ${value} >` : `${value}  `, song: null };
  }

  update(view: JukeboxView): void {
    for (let b = 0; b < SPECTRUM_BARS; b++) {
      const lit = view.levels[b] ?? 0;
      for (let k = 0; k < SPECTRUM_SEGMENTS; k++) {
        this.#segments[b * SPECTRUM_SEGMENTS + k]!.tint = k < lit ? LED_LIT[k]! : LED_DIM[k]!;
      }
    }
    const song = view.playing === null ? null : (this.#songs[view.playing] ?? null);
    if (song) {
      this.#nowTime.text = `${clockText(view.seconds)} / ${clockText(view.durationSeconds)}`;
      this.#nowTime.place(CENTER, NOW_Y + 12, 'center');
    }
    const key = `${view.cursor}|${view.playing}|${view.note}|${view.warn}|${view.removeHint}|${view.removeArmed}|${view.importFolder}`;
    if (key === this.#drawn) return;
    this.#drawn = key;
    const rows = this.rowCount;
    const visible = Math.min(rows, JUKEBOX_VISIBLE_ROWS);
    this.#top = jukeboxTop(this.#top, view.cursor, rows);
    for (let slot = 0; slot < JUKEBOX_VISIBLE_ROWS; slot++) {
      const title = this.#titles[slot]!;
      const right = this.#rights[slot]!;
      const i = this.#top + slot;
      title.visible = right.visible = slot < visible;
      if (slot >= visible) continue;
      const y = jukeboxRowY(slot, visible);
      const row = this.#label(i, view);
      const onCursor = i === view.cursor;
      title.text = row.title;
      title.color = i === view.playing ? LIME : onCursor ? AMBER : GREY;
      title.place(LIST_LEFT, y);
      const hint = onCursor && row.song?.imported ? view.removeHint : '';
      right.text = hint || row.right;
      right.color = hint ? (view.removeArmed ? MAGENTA : AMBER) : onCursor && !row.song && row.right ? AMBER : DIM_GREY;
      right.place(LIST_RIGHT, y, 'right');
    }
    this.#marker.place(LIST_LEFT - 10, jukeboxRowY(view.cursor - this.#top, visible));
    // The scroll bar, when the list doesn't fit: a dim track and a thumb as tall as the
    // share of rows in view.
    const scrolls = rows > visible;
    this.#track.visible = this.#thumb.visible = scrolls;
    if (scrolls) {
      const trackTop = LIST_TOP - 2;
      const trackHeight = jukeboxRowY(visible - 1, visible) + TEXT_HEIGHT + 2 - trackTop;
      this.#track.position.set(SCROLL_BAR_X, trackTop);
      this.#track.height = trackHeight;
      const height = Math.max(4, Math.round((trackHeight * visible) / rows));
      const maxTop = rows - visible;
      this.#thumb.height = height;
      this.#thumb.position.set(SCROLL_BAR_X, trackTop + Math.round(((trackHeight - height) * this.#top) / maxTop));
    }
    this.#nowTime.visible = song !== null && !view.note;
    this.#nowTitle.text = view.note || (song ? `${song.title} ${song.credit}` : '');
    this.#nowTitle.color = view.note ? (view.warn ? MAGENTA : CYAN) : GREY;
    this.#nowTitle.place(CENTER, NOW_Y, 'center');
  }
}

/** A heading and up to a few lines of text on a dark panel, centred on screen. */
export class MessageScreen {
  readonly container = new Container();
  #panel = new Sprite(Texture.WHITE);
  #heading = new PixelText('', WHITE, 2);
  #lines: PixelText[] = [];

  constructor() {
    this.#panel.tint = BACKGROUND;
    this.#panel.alpha = 0.85;
    this.container.addChild(this.#panel, this.#heading);
  }

  /**
   * Shows `heading` over `lines`: grey, the last (the prompt) cyan, and line `highlight`
   * (-1 for none) amber.
   */
  show(heading: string, headingColor: number, lines: readonly string[], highlight = -1): void {
    this.#heading.text = heading;
    this.#heading.color = headingColor;
    while (this.#lines.length < lines.length) {
      const line = new PixelText('', GREY);
      this.#lines.push(line);
      this.container.addChild(line);
    }
    const headingHeight = heading ? 14 + 8 : 0;
    const height = headingHeight + lines.length * 12 - (lines.length ? 5 : 0);
    let y = Math.round(PLAYFIELD_HEIGHT / 2 - height / 2);
    let width = this.#heading.textWidth;
    this.#heading.visible = heading.length > 0;
    if (heading) {
      this.#heading.place(CENTER, y, 'center');
      y += headingHeight;
    }
    for (let i = 0; i < this.#lines.length; i++) {
      const line = this.#lines[i]!;
      line.visible = i < lines.length;
      if (!line.visible) continue;
      line.text = lines[i]!;
      line.color = i === lines.length - 1 ? CYAN : i === highlight ? AMBER : GREY;
      line.place(CENTER, y, 'center');
      width = Math.max(width, line.textWidth);
      y += 12;
    }
    const pad = 10;
    this.#panel.width = width + pad * 2;
    this.#panel.height = height + pad * 2;
    this.#panel.position.set(Math.round(CENTER - width / 2 - pad), Math.round(PLAYFIELD_HEIGHT / 2 - height / 2 - pad));
  }
}

const PAUSE_LABELS: Record<PauseItem, string> = { resume: 'Resume', controls: 'Controls', help: 'Help', quit: 'Quit' };
const PAUSE_ROW = 13;

/** "Paused" over the frozen game, with Resume, Controls and Quit. */
export class PauseScreen {
  readonly container = new Container();
  #marker = new PixelText('>', AMBER);
  #items: PixelText[] = [];
  #cursor = -1;

  constructor() {
    const heading = new PixelText('Paused', AMBER, 2);
    const labels = PAUSE_ITEMS.map((item) => new PixelText(PAUSE_LABELS[item], GREY));
    const width = Math.max(heading.textWidth, ...labels.map((l) => l.textWidth + 10));
    const height = 14 + 10 + PAUSE_ITEMS.length * PAUSE_ROW - 6;
    const top = Math.round(PLAYFIELD_HEIGHT / 2 - height / 2);
    const pad = 12;
    const panel = new Sprite(Texture.WHITE);
    panel.tint = BACKGROUND;
    panel.alpha = 0.85;
    panel.width = width + pad * 2;
    panel.height = height + pad * 2;
    panel.position.set(Math.round(CENTER - width / 2 - pad), top - pad);
    heading.place(CENTER, top, 'center');
    this.container.addChild(panel, heading, this.#marker);
    const left = Math.round(CENTER - width / 2) + 10;
    labels.forEach((label, i) => {
      label.place(left, top + 24 + i * PAUSE_ROW);
      this.#items.push(label);
      this.container.addChild(label);
    });
  }

  update(cursor: number): void {
    if (cursor === this.#cursor) return;
    this.#cursor = cursor;
    this.#items.forEach((item, i) => (item.color = i === cursor ? AMBER : GREY));
    const item = this.#items[cursor]!;
    this.#marker.place(item.x - 10, item.y);
  }
}

const SETTINGS_LABELS: Record<SettingsItem, string> = {
  music: 'Music',
  effects: 'Effects',
  flashing: 'Flashing',
  shake: 'Shake',
  crt: 'CRT',
  leds: 'LEDs',
  keys: 'Keys',
  back: 'Back',
};

type ChoiceItem = 'flashing' | 'shake' | 'crt' | 'leds';

function isChoiceItem(item: SettingsItem): item is ChoiceItem {
  return item === 'flashing' || item === 'shake' || item === 'crt' || item === 'leds';
}

/** What the two-way settings show for each value. */
function choiceText(values: Settings, item: ChoiceItem): string {
  if (item === 'flashing') return values.flashing === 'full' ? 'Full' : 'Reduced';
  if (item === 'leds') return values.leds === 'colourBlind' ? 'Colour-blind' : 'Neon';
  return values[item] ? 'On' : 'Off';
}
/** The widest two-way value, so its right arrow clears it. */
const CHOICE_WIDTH = textWidth('Colour-blind');
const SETTINGS_TOP = 76;
const SETTINGS_ROW = 16;
const CELL_W = 10;
const CELL_H = 5;
const CELL_GAP = 3;

/**
 * The settings: Music and Effects as rows of five LED cells, lit up to the volume, green to
 * red, with "Off" at 0; Flashing, Shake, CRT and LED colours as words; Keys; then Back.
 */
export class SettingsScreen {
  readonly container = new Container();
  #marker = new PixelText('>', AMBER);
  #labels: PixelText[] = [];
  #cells: Sprite[][] = [];
  #arrows: PixelText[][] = [];
  #off: PixelText[] = [];

  constructor() {
    const shadow = new PixelText('Settings', MAGENTA, 2).place(CENTER + 1, 40 + 1, 'center');
    const heading = new PixelText('Settings', CYAN, 2).place(CENTER, 40, 'center');
    this.container.addChild(shadow, heading, this.#marker);
    SETTINGS_ITEMS.forEach((item, row) => {
      const y = SETTINGS_TOP + row * SETTINGS_ROW;
      const label = new PixelText(SETTINGS_LABELS[item]).place(LABEL_X, y);
      this.#labels.push(label);
      this.container.addChild(label);
      const cells: Sprite[] = [];
      const left = new PixelText('<', WHITE).place(VALUE_X - 12, y);
      const right = new PixelText('>', WHITE).place(VALUE_X + VOLUME_LEVELS * (CELL_W + CELL_GAP) + 4, y);
      const off = new PixelText('Off', GREY).place(VALUE_X, y);
      if (isChoiceItem(item)) {
        right.place(VALUE_X + CHOICE_WIDTH + 4, y);
        this.container.addChild(left, right, off);
      } else if (item !== 'back' && item !== 'keys') {
        for (let i = 0; i < VOLUME_LEVELS; i++) {
          const cell = new Sprite(Texture.WHITE);
          cell.width = CELL_W;
          cell.height = CELL_H;
          cell.position.set(VALUE_X + i * (CELL_W + CELL_GAP), y + 1);
          cells.push(cell);
        }
        this.container.addChild(...cells, left, right, off);
      }
      this.#cells.push(cells);
      this.#arrows.push([left, right]);
      this.#off.push(off);
    });
  }

  update(cursor: number, values: Settings): void {
    SETTINGS_ITEMS.forEach((item, row) => {
      const selected = row === cursor;
      this.#labels[row]!.color = selected ? AMBER : GREY;
      for (const a of this.#arrows[row]!) a.visible = selected;
      if (item === 'back' || item === 'keys') return;
      if (isChoiceItem(item)) {
        const value = this.#off[row]!;
        value.text = choiceText(values, item);
        value.color = selected ? WHITE : GREY;
        return;
      }
      const level = values[item];
      this.#off[row]!.visible = level === 0;
      this.#cells[row]!.forEach((cell, i) => {
        cell.visible = level > 0;
        // Five cells across the twelve LED colours, green to red, as on the walls.
        const colour = Math.round((i * (LED_LIT.length - 1)) / (VOLUME_LEVELS - 1));
        cell.tint = i < level ? LED_LIT[colour]! : LED_DIM[colour]!;
      });
    });
    this.#marker.place(LABEL_X - 10, SETTINGS_TOP + cursor * SETTINGS_ROW);
  }
}
