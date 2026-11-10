// Cosmetic effects: explosions (the ship's, and smaller ones for enemies) and the screen
// flash on game over. Each is a function of the time since it started, which the caller
// passes in (wall clock or song time). They never touch sim state.

import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { flashAlpha, type FlashGate } from './flash.ts';
import { AMBER, BACKGROUND, CYAN, MAGENTA, WHITE, mix } from './palette.ts';

export interface ExplosionStyle {
  particles: number;
  ms: number;
  colors: readonly number[];
  /** Top particle speed, px per second (the slowest is 20). */
  speed: number;
}

/** The player ship's explosion. */
export const SHIP_EXPLOSION: ExplosionStyle = { particles: 48, ms: 900, colors: [WHITE, CYAN, CYAN, MAGENTA, AMBER], speed: 110 };

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  color: number;
  lifeMs: number;
}

export class Explosion {
  readonly container = new Container();
  #particles: Particle[] = [];
  #style: ExplosionStyle;
  #x = 0;
  #y = 0;

  constructor(style: ExplosionStyle = SHIP_EXPLOSION) {
    this.#style = style;
    for (let i = 0; i < style.particles; i++) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.visible = false;
      this.container.addChild(sprite);
      this.#particles.push({ sprite, vx: 0, vy: 0, color: WHITE, lifeMs: 0 });
    }
  }

  /** Starts a burst at screen (x, y) px; `random` gives floats in [0, 1). */
  start(x: number, y: number, random: () => number): void {
    this.#x = x;
    this.#y = y;
    for (let i = 0; i < this.#particles.length; i++) {
      const p = this.#particles[i]!;
      // An even spread of directions with some jitter, and a mix of speeds.
      const angle = ((i + random() * 0.8) / this.#particles.length) * Math.PI * 2;
      const speed = 20 + random() * (this.#style.speed - 20);
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      const colors = this.#style.colors;
      p.color = colors[Math.floor(random() * colors.length)]!;
      p.lifeMs = this.#style.ms * (0.45 + random() * 0.55);
      const size = random() < 0.3 ? 2 : 1;
      p.sprite.width = size;
      p.sprite.height = size;
    }
  }

  /** Draws the burst `elapsedMs` after it started; hides it once it is over. */
  draw(elapsedMs: number): void {
    // Drag: distance covered is v * (1 - e^(-kt)) / k, which levels off.
    const seconds = elapsedMs / 1000;
    const travel = (1 - Math.exp(-2.5 * seconds)) / 2.5;
    for (let i = 0; i < this.#particles.length; i++) {
      const p = this.#particles[i]!;
      const left = 1 - elapsedMs / p.lifeMs;
      if (left <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.visible = true;
      p.sprite.x = Math.round(this.#x + p.vx * travel);
      p.sprite.y = Math.round(this.#y + p.vy * travel);
      p.sprite.tint = mix(BACKGROUND, p.color, Math.round(256 * Math.min(1, left * 1.5)));
    }
  }

  hide(): void {
    for (const p of this.#particles) p.sprite.visible = false;
  }
}

/** The screen flash on game over; flash.ts has its timing and its caps. */
export class Flash {
  readonly sprite = new Sprite(Texture.WHITE);
  #gate: FlashGate;
  #on = false;

  constructor(gate: FlashGate) {
    this.#gate = gate;
    this.sprite.width = PLAYFIELD_WIDTH;
    this.sprite.height = PLAYFIELD_HEIGHT;
    this.sprite.tint = WHITE;
    this.sprite.visible = false;
  }

  /** Starts the flash at song time `atMs`, if the gate lets it. */
  start(atMs: number): void {
    this.#on = this.#gate.admit(atMs);
  }

  /** Draws the flash `elapsedMs` after it started. */
  draw(elapsedMs: number): void {
    const alpha = this.#on ? flashAlpha(elapsedMs, this.#gate.peak) : 0;
    this.sprite.visible = alpha > 0;
    this.sprite.alpha = alpha;
  }

  hide(): void {
    this.sprite.visible = false;
  }
}
