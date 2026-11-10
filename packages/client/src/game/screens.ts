// The title screen, the jukebox, the pause menu, the settings, and the messages drawn over play
// (analyzing, crashed, song complete, errors). Layout is in 384x216 screen px.

import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH, type DifficultyName } from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { BRAND } from '../config/brand.ts';
import { AMBER, BACKGROUND, CYAN, DIM_GREY, GREY, LED_DIM, LED_LIT, LIME, MAGENTA, WHITE } from '../render/palette.ts';
import { PixelText } from '../render/text.ts';
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
}

export const SPECTRUM_BARS = 24;
export const SPECTRUM_SEGMENTS = LED_LIT.length;
// The list fits ten rows (nine songs and Back) above the spectrum; the spectrum's 12
// segments are 2 px tall on a 3 px pitch, so it ends above the now-playing lines.
const LIST_TOP = 34;
const LIST_ROW = 11;
const LIST_LEFT = 88;
const LIST_RIGHT = 296;
const SPECTRUM_BOTTOM = 182;
const SEGMENT_PITCH = 3;
const NOW_Y = 188;

/** m:ss */
function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The bundled songs with their authors, a spectrum of what is playing, and its credit. */
export class JukeboxScreen {
  readonly container = new Container();
  readonly #songs: readonly BundledSong[];
  #marker = new PixelText('>', AMBER);
  #titles: PixelText[] = [];
  #authors: PixelText[] = [];
  #segments: Sprite[] = [];
  /** The song playing and its credit, on one line. */
  #nowTitle = new PixelText('', GREY);
  #nowTime = new PixelText('', CYAN);
  #drawn = { cursor: -1, playing: -2 };

  constructor(songs: readonly BundledSong[]) {
    this.#songs = songs;
    const shadow = new PixelText('Jukebox', MAGENTA, 2).place(CENTER + 1, 12 + 1, 'center');
    const heading = new PixelText('Jukebox', CYAN, 2).place(CENTER, 12, 'center');
    this.container.addChild(shadow, heading, this.#marker);
    for (let i = 0; i <= songs.length; i++) {
      const y = LIST_TOP + i * LIST_ROW;
      const song = songs[i];
      const title = new PixelText(song ? song.title : 'Back').place(LIST_LEFT, y);
      const author = new PixelText(song ? song.author : '', DIM_GREY).place(LIST_RIGHT, y, 'right');
      this.#titles.push(title);
      this.#authors.push(author);
      this.container.addChild(title, author);
    }
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
  }

  update(view: JukeboxView): void {
    for (let b = 0; b < SPECTRUM_BARS; b++) {
      const lit = view.levels[b] ?? 0;
      for (let k = 0; k < SPECTRUM_SEGMENTS; k++) {
        this.#segments[b * SPECTRUM_SEGMENTS + k]!.tint = k < lit ? LED_LIT[k]! : LED_DIM[k]!;
      }
    }
    const song = view.playing === null ? null : this.#songs[view.playing]!;
    if (song) {
      this.#nowTime.text = `${clockText(view.seconds)} / ${clockText(view.durationSeconds)}`;
      this.#nowTime.place(CENTER, NOW_Y + 12, 'center');
    }
    const d = this.#drawn;
    const playing = view.playing ?? -1;
    if (d.cursor === view.cursor && d.playing === playing) return;
    d.cursor = view.cursor;
    d.playing = playing;
    for (let i = 0; i < this.#titles.length; i++) {
      this.#titles[i]!.color = i === view.playing ? LIME : i === view.cursor ? AMBER : GREY;
    }
    this.#marker.place(LIST_LEFT - 10, LIST_TOP + view.cursor * LIST_ROW);
    this.#nowTime.visible = song !== null;
    this.#nowTitle.text = song ? `${song.title} ${song.credit}` : '';
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

  show(heading: string, headingColor: number, lines: readonly string[]): void {
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
      line.color = i === lines.length - 1 ? CYAN : GREY;
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

const SETTINGS_LABELS: Record<SettingsItem, string> = { music: 'Music', effects: 'Effects', back: 'Back' };
const SETTINGS_TOP = 92;
const SETTINGS_ROW = 16;
const CELL_W = 10;
const CELL_H = 5;
const CELL_GAP = 3;

/**
 * The settings: Music and Effects as rows of five LED cells, lit up to the volume, green to
 * red, with "Off" at 0; then Back.
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
      if (item !== 'back') {
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
      if (item === 'back') return;
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
