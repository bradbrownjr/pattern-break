// Text drawn with the pixel font (font.ts). One sprite per character, reused when the text
// changes, so changing a label does not create display objects unless it gets longer.

import { BufferImageSource, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import {
  ATLAS_COLUMNS,
  ATLAS_HEIGHT,
  ATLAS_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  GLYPH_ADVANCE,
  GLYPH_COUNT,
  GLYPH_HEIGHT,
  GLYPH_WIDTH,
  buildAtlasPixels,
  glyphIndex,
  textWidth,
} from './font.ts';

let glyphTextures: Texture[] | null = null;

function glyphs(): Texture[] {
  if (glyphTextures) return glyphTextures;
  const source = new BufferImageSource({
    resource: buildAtlasPixels(),
    width: ATLAS_WIDTH,
    height: ATLAS_HEIGHT,
    scaleMode: 'nearest',
    label: 'pixel-font',
  });
  const list: Texture[] = [];
  for (let g = 0; g < GLYPH_COUNT; g++) {
    const frame = new Rectangle(
      (g % ATLAS_COLUMNS) * CELL_WIDTH,
      Math.floor(g / ATLAS_COLUMNS) * CELL_HEIGHT,
      GLYPH_WIDTH,
      GLYPH_HEIGHT,
    );
    list.push(new Texture({ source, frame }));
  }
  glyphTextures = list;
  return list;
}

export type Align = 'left' | 'center' | 'right';

export class PixelText extends Container {
  #sprites: Sprite[] = [];
  #text = '';
  #color: number;
  #scale: number;

  constructor(text = '', color = 0xffffff, scale = 1) {
    super();
    this.#color = color;
    this.#scale = scale;
    this.text = text;
  }

  get text(): string {
    return this.#text;
  }

  set text(value: string) {
    if (value === this.#text && this.#sprites.length > 0) return;
    this.#text = value;
    const textures = glyphs();
    let n = 0;
    for (const ch of value) {
      let sprite = this.#sprites[n];
      if (!sprite) {
        sprite = new Sprite(textures[0]);
        this.#sprites.push(sprite);
        this.addChild(sprite);
      }
      sprite.texture = textures[glyphIndex(ch.codePointAt(0)!)]!;
      sprite.visible = ch !== ' ';
      sprite.tint = this.#color;
      sprite.x = n * GLYPH_ADVANCE * this.#scale;
      sprite.y = 0;
      sprite.scale.set(this.#scale);
      n++;
    }
    for (let i = n; i < this.#sprites.length; i++) this.#sprites[i]!.visible = false;
  }

  get color(): number {
    return this.#color;
  }

  set color(value: number) {
    this.#color = value;
    for (const s of this.#sprites) s.tint = value;
  }

  /** Width in screen px at the current scale. */
  get textWidth(): number {
    return textWidth(this.#text) * this.#scale;
  }

  get textHeight(): number {
    return 7 * this.#scale;
  }

  /** Places the text with its left, centre or right edge at x, top at y, on whole pixels. */
  place(x: number, y: number, align: Align = 'left'): this {
    const w = this.textWidth;
    const left = align === 'left' ? x : align === 'center' ? x - Math.floor(w / 2) : x - w;
    this.position.set(Math.round(left), Math.round(y));
    return this;
  }
}
