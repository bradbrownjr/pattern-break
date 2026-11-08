// The PixiJS renderer and the display layers. The game draws at 384x216 and the canvas is
// scaled by a whole number with nearest-neighbour filtering, letterboxed in the window
// (docs/PLAN.md, "Visual spec").

import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '@game/core';
import { Container, TextureSource, autoDetectRenderer, type Renderer } from 'pixi.js';
import { Explosion, Flash } from './effects.ts';
import { BACKGROUND, LETTERBOX } from './palette.ts';
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

/** The largest whole-number scale at which 384x216 fits in `width` x `height`, at least 1. */
export function integerScale(width: number, height: number): number {
  const k = Math.floor(Math.min(width / PLAYFIELD_WIDTH, height / PLAYFIELD_HEIGHT));
  return k < 1 ? 1 : k;
}

export class GameRenderer {
  readonly renderer: Renderer;
  readonly stage = new Container();
  readonly starfield: Starfield;
  readonly world = new Container();
  readonly terrain = new TerrainView();
  readonly ship = new ShipView();
  readonly explosion = new Explosion();
  readonly flash = new Flash();
  /** Screens and messages, drawn over everything. */
  readonly ui = new Container();
  #parent: HTMLElement;

  constructor(renderer: Renderer, options: GameRendererOptions) {
    this.renderer = renderer;
    this.#parent = options.parent;
    this.starfield = new Starfield(options.seed);
    this.world.addChild(this.terrain.container, this.ship.container, this.explosion.container);
    this.stage.addChild(this.starfield.container, this.world, this.flash.sprite, this.ui);
    const canvas = renderer.canvas as HTMLCanvasElement;
    canvas.style.imageRendering = 'pixelated';
    canvas.style.display = 'block';
    options.parent.appendChild(canvas);
    this.resize();
  }

  /** Scales the canvas to the largest whole multiple that fits the window. */
  resize(): void {
    const k = integerScale(window.innerWidth, window.innerHeight);
    const canvas = this.renderer.canvas as HTMLCanvasElement;
    canvas.style.width = `${PLAYFIELD_WIDTH * k}px`;
    canvas.style.height = `${PLAYFIELD_HEIGHT * k}px`;
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
