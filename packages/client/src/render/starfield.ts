// A parallax starfield behind everything (cosmetic). Star positions come from a seeded
// generator and their scroll from the caller, so a given seed and scroll always draw the
// same picture.

import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { seededRandom } from './random.ts';

interface Layer {
  /** Scroll speed relative to the terrain. */
  factor: number;
  count: number;
  color: number;
  width: number;
}

const LAYERS: Layer[] = [
  { factor: 0.12, count: 60, color: 0x262b4d, width: 1 },
  { factor: 0.25, count: 36, color: 0x4b5a92, width: 1 },
  { factor: 0.5, count: 16, color: 0x9fb6ff, width: 2 },
];

export class Starfield {
  readonly container = new Container();
  #stars: { sprite: Sprite; x: number; factor: number }[] = [];

  constructor(seed: number) {
    const random = seededRandom(seed);
    for (const layer of LAYERS) {
      for (let i = 0; i < layer.count; i++) {
        const sprite = new Sprite(Texture.WHITE);
        sprite.tint = layer.color;
        sprite.width = layer.width;
        sprite.height = 1;
        sprite.y = Math.floor(random() * PLAYFIELD_HEIGHT);
        this.container.addChild(sprite);
        this.#stars.push({ sprite, x: random() * PLAYFIELD_WIDTH, factor: layer.factor });
      }
    }
  }

  /** Draws the stars for a terrain scroll of `scrollPx`. */
  draw(scrollPx: number): void {
    for (let i = 0; i < this.#stars.length; i++) {
      const star = this.#stars[i]!;
      let x = (star.x - scrollPx * star.factor) % PLAYFIELD_WIDTH;
      if (x < 0) x += PLAYFIELD_WIDTH;
      star.sprite.x = Math.floor(x);
    }
  }
}
