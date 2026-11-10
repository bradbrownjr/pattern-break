// The PixiJS renderer and the display layers. The game draws at 384x216 and the canvas is
// scaled by a whole number with nearest-neighbour filtering, letterboxed in the window
// (docs/PLAN.md, "Visual spec").

import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '@game/core';
import { Container, TextureSource, autoDetectRenderer, type Renderer } from 'pixi.js';
import { CombatView } from './combat.ts';
import { Explosion, Flash } from './effects.ts';
import { FlashGate } from './flash.ts';
import { BACKGROUND, LETTERBOX } from './palette.ts';
import { shakeOffset } from './shake.ts';
import { ShipView } from './ship.ts';
import { Starfield } from './starfield.ts';
import { TerrainView } from './terrain.ts';

export interface GameRendererOptions {
  /** The element the canvas goes in. It is sized to fill the window. */
  parent: HTMLElement;
  /** Seed for cosmetic randomness (the starfield, explosions). */
  seed: number;
  /**
   * Keep the drawing buffer after each frame, so a screenshot taken later reads the last
   * frame. Capture mode sets it.
   */
  preserveDrawingBuffer?: boolean;
}

/**
 * The largest whole number of device pixels per game pixel at which 384x216 fits in a
 * `width` x `height` CSS px window with `dpr` device pixels per CSS px, at least 1. Counting
 * device pixels keeps every game pixel the same size on a high-density screen while using
 * more of it: a phone 390 CSS px tall at 3x gets 5 (360 CSS px), where whole CSS px gave 1.
 */
export function integerScale(width: number, height: number, dpr = 1): number {
  const k = Math.floor(Math.min((width * dpr) / PLAYFIELD_WIDTH, (height * dpr) / PLAYFIELD_HEIGHT));
  return k < 1 ? 1 : k;
}

export class GameRenderer {
  readonly renderer: Renderer;
  readonly stage = new Container();
  readonly starfield: Starfield;
  readonly world = new Container();
  readonly terrain = new TerrainView();
  readonly ship = new ShipView();
  /** Decides which flashes are shown and how strong (the Flashing setting). */
  readonly flashes = new FlashGate();
  /** Enemies, shots, bullets, their bursts, and the lives left. */
  readonly combat = new CombatView(this.flashes);
  readonly explosion = new Explosion();
  readonly flash = new Flash(this.flashes);
  /** The Shake setting: false keeps the playfield still. */
  shakeOn = true;
  #shake = { x: 0, y: 0 };
  /** Screens and messages, drawn over everything. */
  readonly ui = new Container();
  #parent: HTMLElement;

  constructor(renderer: Renderer, options: GameRendererOptions) {
    this.renderer = renderer;
    this.#parent = options.parent;
    this.starfield = new Starfield(options.seed);
    this.world.addChild(this.terrain.container, this.combat.container, this.ship.container, this.explosion.container);
    this.stage.addChild(this.starfield.container, this.world, this.combat.hud, this.flash.sprite, this.ui);
    const canvas = renderer.canvas as HTMLCanvasElement;
    canvas.style.imageRendering = 'pixelated';
    canvas.style.display = 'block';
    options.parent.appendChild(canvas);
    this.resize();
  }

  /**
   * Moves the starfield and the cave for a shake `elapsedMs` after a crash (shake.ts); a
   * negative time, or shake off, puts them back. The HUD and the screens stay put.
   */
  shake(elapsedMs: number, seed: number): void {
    shakeOffset(this.shakeOn, elapsedMs, seed, this.#shake);
    this.world.position.set(this.#shake.x, this.#shake.y);
    this.starfield.container.position.set(this.#shake.x, this.#shake.y);
  }

  /** Scales the canvas to the largest whole multiple of device pixels that fits the window. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const k = integerScale(window.innerWidth, window.innerHeight, dpr);
    const canvas = this.renderer.canvas as HTMLCanvasElement;
    canvas.style.width = `${(PLAYFIELD_WIDTH * k) / dpr}px`;
    canvas.style.height = `${(PLAYFIELD_HEIGHT * k) / dpr}px`;
    this.#parent.style.background = LETTERBOX;
  }

  render(): void {
    this.renderer.render(this.stage);
  }
}

export async function createGameRenderer(options: GameRendererOptions): Promise<GameRenderer> {
  TextureSource.defaultOptions.scaleMode = 'nearest';
  const renderer = await autoDetectRenderer({
    preference: 'webgl',
    width: PLAYFIELD_WIDTH,
    height: PLAYFIELD_HEIGHT,
    resolution: 1,
    autoDensity: false,
    antialias: false,
    roundPixels: true,
    background: BACKGROUND,
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
  });
  return new GameRenderer(renderer, options);
}
