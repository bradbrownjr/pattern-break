// Cosmetic effects: explosions (the ship breaking apart, and smaller bursts for enemies,
// the bomb and missiles) and the screen flash on game over. Each is a function of the time
// since it started, which the caller passes in (wall clock or song time). They never touch
// sim state.

import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { flashAlpha, type FlashGate } from './flash.ts';
import { AMBER, BACKGROUND, CYAN, LIME, MAGENTA, WHITE, mix } from './palette.ts';
import { SHIP_PIXELS, SHIP_SPRITE_HEIGHT, SHIP_SPRITE_WIDTH } from './ship.ts';

export interface ExplosionStyle {
  particles: number;
  ms: number;
  colors: readonly number[];
  /** Top particle speed, px per second (the slowest is 20). */
  speed: number;
}


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

  constructor(style: ExplosionStyle) {
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

/** The ship breaking apart: how long its pixels fly, and its shockwave ring. */
export const BREAKUP_MS = 1300;
export const RING_MS = 520;
export const RING_RADIUS = 44;
const RING_DOTS = 96;
const RING_COLORS = [CYAN, LIME, AMBER, MAGENTA];
/** The ring's colours turn this far around it over its life, in dots. */
const RING_TURN = RING_DOTS / 2;
/** Hot sparks thrown out with the pixels. */
const BREAKUP_SPARKS: ExplosionStyle = { particles: 24, ms: 700, colors: [WHITE, AMBER, AMBER, MAGENTA], speed: 130 };

interface Bit {
  sprite: Sprite;
  /**
   * Where the pixel starts, from the ship's centre as ShipView rounds it (whole px, so the
   * first frame is the ship), and its speed, px/s.
   */
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  lifeMs: number;
}

/**
 * The player ship's explosion (docs/PLAN.md, "Explosions"): every pixel of its sprite flies
 * off in its own colour, away from the ship's centre, with hot sparks and a shockwave ring
 * of dots in the neon colours that grows and fades. The ring's brightness comes from the
 * Flashing setting through `gate`. Like Explosion, a function of the time since it started.
 */
export class ShipBreakup {
  readonly container = new Container();
  #bits: Bit[] = [];
  #ring: Sprite[] = [];
  #sparks = new Explosion(BREAKUP_SPARKS);
  #gate: FlashGate;
  #x = 0;
  #y = 0;

  constructor(gate: FlashGate) {
    this.#gate = gate;
    for (let i = 0; i < RING_DOTS; i++) {
      const dot = new Sprite(Texture.WHITE);
      dot.width = 2;
      dot.height = 2;
      dot.visible = false;
      this.#ring.push(dot);
      this.container.addChild(dot);
    }
    for (const p of SHIP_PIXELS) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.visible = false;
      this.container.addChild(sprite);
      const x = p.x - SHIP_SPRITE_WIDTH / 2;
      const y = p.y - SHIP_SPRITE_HEIGHT / 2;
      this.#bits.push({ sprite, x, y, vx: 0, vy: 0, color: p.color, lifeMs: 0 });
    }
    this.container.addChild(this.#sparks.container);
  }

  /** Starts it with the ship's centre at screen (x, y) px; `random` gives floats in [0, 1). */
  start(x: number, y: number, random: () => number): void {
    this.#x = Math.round(x);
    this.#y = Math.round(y);
    for (const b of this.#bits) {
      // Outward from the sprite's centre (pixel centres are half a pixel in), the nose and
      // tail faster, with a little scatter. The ship is wide and flat, so the vertical
      // counts double.
      const cx = b.x + 0.5;
      const cy = b.y + 0.5;
      const angle = Math.atan2(cy * 2, cx) + (random() - 0.5) * 0.9;
      const speed = 25 + Math.hypot(cx, cy) * 6 + random() * 70;
      b.vx = Math.cos(angle) * speed;
      b.vy = Math.sin(angle) * speed;
      b.lifeMs = BREAKUP_MS * (0.55 + random() * 0.45);
    }
    this.#sparks.start(x, y, random);
  }

  /** Draws it `elapsedMs` after it started; hides it once it is over. */
  draw(elapsedMs: number): void {
    const seconds = Math.max(0, elapsedMs) / 1000;
    const travel = (1 - Math.exp(-1.8 * seconds)) / 1.8;
    for (const b of this.#bits) {
      const left = 1 - elapsedMs / b.lifeMs;
      b.sprite.visible = elapsedMs >= 0 && left > 0;
      if (!b.sprite.visible) continue;
      b.sprite.x = this.#x + Math.round(b.x + b.vx * travel);
      b.sprite.y = this.#y + Math.round(b.y + b.vy * travel);
      b.sprite.tint = mix(BACKGROUND, b.color, Math.round(256 * Math.min(1, left * 2)));
    }
    this.#sparks.draw(elapsedMs);

    const t = elapsedMs / RING_MS;
    const on = t >= 0 && t < 1;
    // Fast at first, slowing as it grows; fading slowly, then fast.
    const radius = RING_RADIUS * (1 - (1 - t) * (1 - t) * (1 - t));
    const alpha = this.#gate.ringPeak * (1 - t * t);
    const turn = Math.floor(t * RING_TURN);
    for (let i = 0; i < RING_DOTS; i++) {
      const dot = this.#ring[i]!;
      dot.visible = on;
      if (!on) continue;
      const angle = (i / RING_DOTS) * Math.PI * 2;
      dot.x = this.#x + Math.round(Math.cos(angle) * radius) - 1;
      dot.y = this.#y + Math.round(Math.sin(angle) * radius) - 1;
      dot.tint = RING_COLORS[Math.floor((((i + turn) % RING_DOTS) * RING_COLORS.length) / RING_DOTS)]!;
      dot.alpha = alpha;
    }
  }

  hide(): void {
    for (const b of this.#bits) b.sprite.visible = false;
    for (const dot of this.#ring) dot.visible = false;
    this.#sparks.hide();
  }
}
