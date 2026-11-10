// The ship breaking apart (render/effects.ts, ShipBreakup): one particle per pixel of the
// ship's sprite, starting on that pixel in its colour, flying outward; the shockwave ring
// capped by the Flashing setting; and nothing left once it is over.

import { describe, expect, it } from 'vitest';
import type { Sprite } from 'pixi.js';
import { BREAKUP_MS, RING_MS, ShipBreakup } from '../src/render/effects.ts';
import { FlashGate, RING_PEAK } from '../src/render/flash.ts';
import { seededRandom } from '../src/render/random.ts';
import { SHIP_PIXELS, SHIP_SPRITE_HEIGHT, SHIP_SPRITE_WIDTH } from '../src/render/ship.ts';

const X = 100;
const Y = 60;

function made(flashing: 'reduced' | 'full' = 'reduced'): { boom: ShipBreakup; ring: Sprite[]; bits: Sprite[] } {
  const gate = new FlashGate();
  gate.flashing = flashing;
  const boom = new ShipBreakup(gate);
  boom.start(X, Y, seededRandom(3));
  const sprites = boom.container.children as Sprite[];
  const bits = sprites.slice(sprites.length - 1 - SHIP_PIXELS.length, sprites.length - 1);
  return { boom, ring: sprites.slice(0, sprites.length - 1 - SHIP_PIXELS.length), bits };
}

describe('ship breakup', () => {
  it('starts as the ship, a particle on each pixel in its colour', () => {
    const { boom, bits } = made();
    boom.draw(0);
    expect(bits.length).toBe(SHIP_PIXELS.length);
    SHIP_PIXELS.forEach((p, i) => {
      expect([bits[i]!.x, bits[i]!.y]).toEqual([X - SHIP_SPRITE_WIDTH / 2 + p.x, Y - SHIP_SPRITE_HEIGHT / 2 + p.y]);
      expect(bits[i]!.tint).toBe(p.color);
    });
  });

  it('throws every pixel outward', () => {
    const { boom, bits } = made();
    boom.draw(0);
    const start = bits.map((b) => Math.hypot(b.x + 0.5 - X, b.y + 0.5 - Y));
    boom.draw(300);
    bits.forEach((b, i) => expect(Math.hypot(b.x + 0.5 - X, b.y + 0.5 - Y)).toBeGreaterThan(start[i]!));
  });

  it('caps the ring with reduced flashing', () => {
    for (const flashing of ['reduced', 'full'] as const) {
      const { boom, ring } = made(flashing);
      let max = 0;
      for (let ms = 0; ms < RING_MS + 10; ms += 5) {
        boom.draw(ms);
        for (const dot of ring) if (dot.visible) max = Math.max(max, dot.alpha);
      }
      expect(max).toBe(RING_PEAK[flashing]);
    }
    expect(RING_PEAK.reduced).toBeLessThan(RING_PEAK.full);
  });

  it('leaves nothing once it is over', () => {
    const { boom } = made();
    boom.draw(200);
    boom.draw(Math.max(BREAKUP_MS, RING_MS));
    const visible = (c: { visible: boolean; children?: unknown[] }): boolean =>
      c.visible && (!c.children?.length || (c.children as { visible: boolean }[]).some((k) => visible(k)));
    expect((boom.container.children as Sprite[]).filter((s) => visible(s)).length).toBe(0);
  });
});
