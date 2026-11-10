// The player ship: a 16x8 pixel-art sprite built from the map below, plus an engine flame
// that flickers with song time (so capture mode reproduces it from `t`).

import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import { AMBER, CYAN, MAGENTA, WHITE } from './palette.ts';

const SHIP_MAP = [
  '..cc............',
  '..cbcc..........',
  '.mcbbccccc......',
  'mmcccccwwccccc..',
  'mmcccccccccccccc',
  '.mcbbccccc......',
  '..cbcc..........',
  '..cc............',
];

export const SHIP_SPRITE_WIDTH = 16;
export const SHIP_SPRITE_HEIGHT = 8;

const COLORS: Record<string, number> = { c: CYAN, b: 0x177a94, w: WHITE, m: MAGENTA };

/** The ship sprite's lit pixels: where each is in the sprite, and its colour. */
export const SHIP_PIXELS: readonly { x: number; y: number; color: number }[] = SHIP_MAP.flatMap((row, y) =>
  [...row].flatMap((ch, x) => (COLORS[ch] === undefined ? [] : [{ x, y, color: COLORS[ch]! }])),
);

/** RGBA pixels of the ship sprite. */
export function shipPixels(): Uint8Array {
  const out = new Uint8Array(SHIP_SPRITE_WIDTH * SHIP_SPRITE_HEIGHT * 4);
  for (let y = 0; y < SHIP_SPRITE_HEIGHT; y++) {
    for (let x = 0; x < SHIP_SPRITE_WIDTH; x++) {
      const color = COLORS[SHIP_MAP[y]![x]!];
      if (color === undefined) continue;
      const o = (y * SHIP_SPRITE_WIDTH + x) * 4;
      out[o] = (color >> 16) & 0xff;
      out[o + 1] = (color >> 8) & 0xff;
      out[o + 2] = color & 0xff;
      out[o + 3] = 255;
    }
  }
  return out;
}

let shipTextureCache: Texture | null = null;

/** The ship sprite's texture, also used for the lives shown in play. */
export function shipTexture(): Texture {
  shipTextureCache ??= new Texture({
    source: new BufferImageSource({
      resource: shipPixels(),
      width: SHIP_SPRITE_WIDTH,
      height: SHIP_SPRITE_HEIGHT,
      scaleMode: 'nearest',
      label: 'ship',
    }),
  });
  return shipTextureCache;
}

export class ShipView {
  readonly container = new Container();
  #body: Sprite;
  #flameOuter: Sprite;
  #flameInner: Sprite;

  constructor() {
    this.#flameOuter = new Sprite(Texture.WHITE);
    this.#flameOuter.tint = MAGENTA;
    this.#flameOuter.height = 2;
    this.#flameInner = new Sprite(Texture.WHITE);
    this.#flameInner.tint = AMBER;
    this.#flameInner.height = 2;
    this.#body = new Sprite(shipTexture());
    this.container.addChild(this.#flameOuter, this.#flameInner, this.#body);
  }

  /**
   * Draws the ship with its sprite centre at screen (x, y) px. `phase` is any integer that
   * advances with song time; the flame flickers with it, and is longer while boosting.
   */
  draw(x: number, y: number, phase: number, boosting = false): void {
    const left = Math.round(x) - SHIP_SPRITE_WIDTH / 2;
    const top = Math.round(y) - SHIP_SPRITE_HEIGHT / 2;
    this.#body.position.set(left, top);
    const long = (phase & 1) === 0;
    const outer = boosting ? (long ? 10 : 8) : long ? 4 : 3;
    const inner = boosting ? (long ? 6 : 4) : long ? 2 : 1;
    this.#flameOuter.width = outer;
    this.#flameOuter.position.set(left - outer, top + 3);
    this.#flameInner.width = inner;
    this.#flameInner.position.set(left - inner, top + 3);
  }

  set visible(v: boolean) {
    this.container.visible = v;
  }
}
