// The PixiJS renderer and the display layers. The game draws at 384x216 and the canvas is
// scaled by a whole number with nearest-neighbour filtering, letterboxed in the window
// (docs/PLAN.md, "Visual spec").

import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '@game/core';
import { Container, Rectangle, TextureSource, autoDetectRenderer, type Filter, type Renderer } from 'pixi.js';
import { CombatView } from './combat.ts';
import { CopperBars } from './copper.ts';
import { bloomFilter, overlayBackground } from './crt.ts';
import { Flash, ShipBreakup } from './effects.ts';
import { FlashGate } from './flash.ts';
import { BACKGROUND, LETTERBOX } from './palette.ts';
import { shakeOffset } from './shake.ts';
import { ShipView } from './ship.ts';
import { TipSparks } from './sparks.ts';
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
  /** The stage, inside the root that carries the CRT setting's bloom. */
  readonly stage = new Container();
  #root = new Container();
  #crt = false;
  #bloom: Filter | null = null;
  /** The CRT setting's scanlines and vignette over the canvas. */
  #overlay = document.createElement('div');
  /** Copper bars behind the stars, in play only. */
  readonly copper = new CopperBars();
  readonly starfield: Starfield;
  readonly world = new Container();
  readonly terrain = new TerrainView();
  /** Sparks off the LED tips on note hits. */
  readonly sparks = new TipSparks();
  readonly ship = new ShipView();
  /** Decides which flashes are shown and how strong (the Flashing setting). */
  readonly flashes = new FlashGate();
  /** Enemies, shots, bullets, their bursts, and the lives left. */
  readonly combat = new CombatView(this.flashes);
  /** The ship breaking apart on the last life (CombatView has the one for other lives). */
  readonly explosion = new ShipBreakup(this.flashes);
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
    this.world.addChild(this.terrain.container, this.sparks.container, this.combat.container, this.ship.container, this.explosion.container);
    this.stage.addChild(this.copper.container, this.starfield.container, this.world, this.combat.hud, this.flash.sprite, this.ui);
    const canvas = renderer.canvas as HTMLCanvasElement;
    canvas.style.imageRendering = 'pixelated';
    canvas.style.display = 'block';
    options.parent.appendChild(canvas);
    this.#root.addChild(this.stage);
    this.#root.filterArea = new Rectangle(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
    const o = this.#overlay.style;
    o.position = 'absolute';
    o.left = '50%';
    o.top = '50%';
    o.transform = 'translate(-50%, -50%)';
    o.pointerEvents = 'none';
    o.display = 'none';
    options.parent.appendChild(this.#overlay);
    this.resize();
  }

  /**
   * Moves the copper bars, the starfield and the cave for a shake `elapsedMs` after a crash
   * (shake.ts); a negative time, or shake off, puts them back. The HUD and the screens stay
   * put.
   */
  shake(elapsedMs: number, seed: number): void {
    shakeOffset(this.shakeOn, elapsedMs, seed, this.#shake);
    this.world.position.set(this.#shake.x, this.#shake.y);
    this.starfield.container.position.set(this.#shake.x, this.#shake.y);
    this.copper.container.position.set(this.#shake.x, this.#shake.y);
  }

  /** Scales the canvas to the largest whole multiple of device pixels that fits the window. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const k = integerScale(window.innerWidth, window.innerHeight, dpr);
    const canvas = this.renderer.canvas as HTMLCanvasElement;
    canvas.style.width = `${(PLAYFIELD_WIDTH * k) / dpr}px`;
    canvas.style.height = `${(PLAYFIELD_HEIGHT * k) / dpr}px`;
    this.#parent.style.background = LETTERBOX;
    this.#overlay.style.width = canvas.style.width;
    this.#overlay.style.height = canvas.style.height;
    this.#overlay.style.background = overlayBackground(k / dpr, k);
  }

  /** The CRT setting: bloom, scanlines and a vignette, or none. */
  get crt(): boolean {
    return this.#crt;
  }

  set crt(on: boolean) {
    this.#crt = on;
    // The bloom is a WebGL shader; with WebGPU (a fallback) the CRT look has no bloom.
    const bloom = on && this.renderer.name === 'webgl';
    if (bloom && !this.#bloom) this.#bloom = bloomFilter();
    this.#root.filters = bloom ? [this.#bloom!] : null;
    this.#overlay.style.display = on ? 'block' : 'none';
  }

  render(): void {
    this.renderer.render(this.#root);
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
