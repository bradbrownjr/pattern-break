// The renderer in a real browser: draws a hand-made level with WebGL and checks pixels of
// the canvas against the terrain rules and the palette.

import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH, Q8, createSimState } from '@game/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drawPlay } from '../../src/game/play-view.ts';
import { BACKGROUND, CYAN, LED_LIT, ROCK } from '../../src/render/palette.ts';
import { createGameRenderer, type GameRenderer } from '../../src/render/renderer.ts';
import { makeLevel } from '../make-level.ts';

let r: GameRenderer;
let parent: HTMLDivElement;

// The game and capture mode need WebGL. Chromium gets it from SwiftShader (vitest.config.ts);
// an engine whose headless build has none skips these tests rather than test a fallback.
const hasWebGl = (() => {
  const canvas = document.createElement('canvas');
  return (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null;
})();

beforeAll(async () => {
  if (!hasWebGl) return;
  parent = document.createElement('div');
  document.body.appendChild(parent);
  r = await createGameRenderer({ parent, seed: 1, preserveDrawingBuffer: true });
});

afterAll(() => {
  if (!hasWebGl) return;
  r.renderer.destroy();
  parent.remove();
});

/** The canvas's pixels, copied through a 2D canvas the way a screenshot sees them. */
function readCanvas(): Uint8ClampedArray {
  const copy = document.createElement('canvas');
  copy.width = PLAYFIELD_WIDTH;
  copy.height = PLAYFIELD_HEIGHT;
  const ctx = copy.getContext('2d')!;
  ctx.drawImage(r.renderer.canvas as HTMLCanvasElement, 0, 0);
  return ctx.getImageData(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT).data;
}

function rgbAt(px: Uint8ClampedArray, x: number, y: number): number {
  const i = (y * PLAYFIELD_WIDTH + x) * 4;
  return (px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!;
}

describe.skipIf(!hasWebGl)('renderer', () => {
  it('uses WebGL at 384x216', () => {
    expect(r.renderer.name).toBe('webgl');
    expect(r.renderer.width).toBe(PLAYFIELD_WIDTH);
    expect(r.renderer.height).toBe(PLAYFIELD_HEIGHT);
  });

  it('draws rock, lit meter segments, no unlit segments or peak dot, the ship, and the background', () => {
    // Ceiling 8 (5 rock, 3 meter) with a peak at 11; floor 10 (5 rock, 5 meter). No
    // difficulty has solid peaks, so the peak segment is not drawn.
    const level = makeLevel({
      ceiling: Array.from({ length: 100 }, () => 8),
      ceilingPeak: Array.from({ length: 100 }, () => 11),
      floor: Array.from({ length: 100 }, () => 10),
    });
    const state = createSimState();
    r.terrain.setLevel(level);
    r.world.visible = true;
    // Stars could land on the background pixels checked below.
    r.starfield.container.visible = false;
    // Song start: scroll is -64 px, so bar 0 starts at screen x 64 and bar 1 at x 74.
    drawPlay(r, level, state, 0);
    r.render();
    const px = readCanvas();
    const x = 74 + 3;
    expect(rgbAt(px, x, 2)).toBe(ROCK[0]);
    expect(rgbAt(px, x, 7 * 4 + 2)).toBe(ROCK[4]);
    expect(rgbAt(px, x, 7 * 5 + 2)).toBe(LED_LIT[0]);
    expect(rgbAt(px, x, 7 * 7 + 2)).toBe(LED_LIT[2]);
    expect(rgbAt(px, x, 7 * 8 + 2)).toBe(BACKGROUND);
    expect(rgbAt(px, x, 7 * 10 + 2)).toBe(BACKGROUND);
    // Floor segment 9 (lit) and 10 (unlit), counted up from the bottom edge.
    expect(rgbAt(px, x, PLAYFIELD_HEIGHT - 7 * 9 - 3)).toBe(LED_LIT[4]);
    expect(rgbAt(px, x, PLAYFIELD_HEIGHT - 7 * 10 - 3)).toBe(BACKGROUND);
    // The 1 px row between segments and the 2 px column between bars are open.
    expect(rgbAt(px, x, 6)).toBe(BACKGROUND);
    expect(rgbAt(px, 74 + 8, 2)).toBe(BACKGROUND);
    // Nothing before bar 0.
    expect(rgbAt(px, 10, 2)).toBe(BACKGROUND);
    // The ship's nose row at its centre, (64, 108).
    expect(state.shipX / Q8).toBe(64);
    expect(rgbAt(px, 64 + 4, 108)).toBe(CYAN);
  });
});
