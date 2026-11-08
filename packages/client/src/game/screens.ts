// The title screen and the messages drawn over play (analyzing, paused, crashed, song
// complete, errors). Layout is in 384x216 screen px.

import { Difficulty, PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH, type DifficultyName } from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { BRAND } from '../config/brand.ts';
import { AMBER, BACKGROUND, CYAN, DIM_GREY, GREY, LED_LIT, MAGENTA, WHITE, mix } from '../render/palette.ts';
import { PixelText } from '../render/text.ts';
import type { BundledSong } from './songs.ts';

const CENTER = PLAYFIELD_WIDTH / 2;
const PROMPT_DIM = mix(BACKGROUND, CYAN, 120);

export const DIFFICULTY_LABELS: Record<DifficultyName, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
export const DIFFICULTY_ORDER = Object.keys(Difficulty) as DifficultyName[];

export class TitleScreen {
  readonly container = new Container();
  #song = new PixelText('', WHITE);
  #credit = new PixelText('', GREY);
  #options: PixelText[] = [];
  #prompt = new PixelText('Press any key', CYAN);
  /** What the last update() drew, so an unchanged frame does no work. */
  #drawnSong: BundledSong | null = null;
  #drawnDifficulty: DifficultyName | null = null;

  constructor() {
    const shadow = new PixelText(BRAND.name, MAGENTA, 3).place(CENTER + 2, 30 + 2, 'center');
    const logo = new PixelText(BRAND.name, CYAN, 3).place(CENTER, 30, 'center');
    this.container.addChild(shadow, logo);

    // An LED meter under the logo, green to red.
    const segments = 24;
    const left = CENTER - (segments * 10 - 2) / 2;
    for (let i = 0; i < segments; i++) {
      const s = new Sprite(Texture.WHITE);
      s.tint = LED_LIT[Math.floor(i / 2)]!;
      s.position.set(left + i * 10, 60);
      s.width = 8;
      s.height = 3;
      this.container.addChild(s);
    }

    this.container.addChild(this.#song, this.#credit);
    this.container.addChild(new PixelText('Difficulty', GREY).place(CENTER, 114, 'center'));
    for (let i = 0; i < DIFFICULTY_ORDER.length; i++) {
      const option = new PixelText('');
      this.#options.push(option);
      this.container.addChild(option);
    }
    this.container.addChild(
      new PixelText('Arrows or WASD to move. Esc pauses.', GREY).place(CENTER, 150, 'center'),
      this.#prompt,
    );
    this.#prompt.place(CENTER, 178, 'center');
  }

  update(song: BundledSong, difficulty: DifficultyName, promptBright: boolean): void {
    this.#prompt.color = promptBright ? CYAN : PROMPT_DIM;
    if (this.#drawnSong === song && this.#drawnDifficulty === difficulty) return;
    this.#drawnSong = song;
    this.#drawnDifficulty = difficulty;
    this.#song.text = song.title;
    this.#song.place(CENTER, 80, 'center');
    this.#credit.text = song.credit;
    this.#credit.place(CENTER, 92, 'center');
    // "1 Easy   2 Normal   3 Hard", with the chosen one in brackets and amber.
    const labels = DIFFICULTY_ORDER.map((d, i) => {
      const label = `${i + 1} ${DIFFICULTY_LABELS[d]}`;
      return d === difficulty ? `[${label}]` : ` ${label} `;
    });
    const gap = 12;
    let total = gap * (labels.length - 1);
    for (let i = 0; i < labels.length; i++) {
      this.#options[i]!.text = labels[i]!;
      total += this.#options[i]!.textWidth;
    }
    let x = CENTER - Math.floor(total / 2);
    for (let i = 0; i < labels.length; i++) {
      const option = this.#options[i]!;
      option.color = DIFFICULTY_ORDER[i] === difficulty ? AMBER : DIM_GREY;
      option.place(x, 126);
      x += option.textWidth + gap;
    }
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
