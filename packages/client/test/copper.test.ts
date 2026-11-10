// The copper bars (render/copper.ts): the bass and downbeats they follow, how far their
// brightness swings with each Flashing setting, and that they never overlap.

import { HOP_FRAMES, SAMPLE_RATE, type LevelData } from '@game/core';
import { describe, expect, it } from 'vitest';
import {
  BAR_HEIGHT,
  COPPER_BASE,
  COPPER_SWING,
  DOWNBEAT_MS,
  ROWS_PER_MEASURE,
  barTop,
  bassAt,
  copperAlpha,
  sinceDownbeatMs,
  songLook,
} from '../src/render/copper.ts';
import { AMBER, BACKGROUND, CYAN, LIME, MAGENTA, VIOLET, mix } from '../src/render/palette.ts';

/** WCAG 2.2 relative luminance of a 0xRRGGBB colour. */
function luminance(c: number): number {
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((c >> 16) & 255) + 0.7152 * lin((c >> 8) & 255) + 0.0722 * lin(c & 255);
}

function fakeData(): LevelData {
  const bands = 16;
  const frames = 3;
  const left = new Uint8Array(frames * bands);
  const right = new Uint8Array(frames * bands);
  left[1] = 5;
  right[3] = 7;
  left[4] = 12; // 179 Hz and up: not bass
  right[1 * bands + 0] = 12;
  const rows = Array.from({ length: 40 }, (_, i) => i);
  return {
    params: { bandCount: bands, ledLevels: 12 },
    frames: { frameCount: frames, spectrumLeft: left, spectrumRight: right, vuLeft: new Uint8Array(), vuRight: new Uint8Array() },
    rows: { row: Uint16Array.from(rows.map((i) => i % 32)), timeSamples: Uint32Array.from(rows.map((i) => i * 1000)) },
    notes: { timeSamples: Uint32Array.of(0, 0, 2000, 3000, 16_000) },
  } as unknown as LevelData;
}

describe('song look', () => {
  it('takes the bass from the four lowest bands of either side', () => {
    const look = songLook(fakeData());
    expect([...look.bass]).toEqual([7, 12, 0]);
    expect(bassAt(look, HOP_FRAMES - 1)).toBe(0);
    expect(bassAt(look, HOP_FRAMES)).toBe(7 / 12);
    expect(bassAt(look, 2 * HOP_FRAMES)).toBe(1);
    expect(bassAt(look, 99 * HOP_FRAMES)).toBe(0);
  });

  it('puts a downbeat on every 16th row of a pattern', () => {
    const look = songLook(fakeData());
    expect(ROWS_PER_MEASURE).toBe(16);
    expect([...look.downbeats]).toEqual([0, 16_000, 32_000]);
    expect(sinceDownbeatMs(look, 16_000)).toBe(0);
    expect(sinceDownbeatMs(look, 16_000 + SAMPLE_RATE / 10)).toBeCloseTo(100);
    expect(sinceDownbeatMs({ ...look, downbeats: new Uint32Array([500]) }, 100)).toBe(-1);
  });

  it('lists each row with a note starting on it once', () => {
    expect([...songLook(fakeData()).noteRows]).toEqual([0, 2, 3, 16]);
  });
});

describe('copper brightness', () => {
  const colours = [VIOLET, CYAN, LIME, AMBER, MAGENTA];

  /** The widest change in relative luminance of any bar colour over every bass and beat. */
  function widest(flashing: 'reduced' | 'full'): number {
    let lo = Infinity;
    let hi = -Infinity;
    for (let b = 0; b <= 12; b++) {
      for (const beat of [-1, 0, 50, 100, DOWNBEAT_MS, 900]) {
        const a = copperAlpha(flashing, b / 12, beat);
        lo = Math.min(lo, a);
        hi = Math.max(hi, a);
      }
    }
    expect(lo).toBe(COPPER_BASE);
    expect(hi).toBeCloseTo(COPPER_BASE + COPPER_SWING[flashing]);
    return Math.max(
      ...colours.map((c) => luminance(mix(BACKGROUND, c, Math.round(hi * 256))) - luminance(mix(BACKGROUND, c, Math.round(lo * 256)))),
    );
  }

  it("never changes by WCAG's 10% for a flash with reduced flashing", () => {
    expect(widest('reduced')).toBeLessThan(0.1);
  });

  it('swings further with full flashing', () => {
    expect(widest('full')).toBeGreaterThan(widest('reduced'));
  });

  it('pulses on the downbeat and fades', () => {
    expect(copperAlpha('reduced', 0, 0)).toBeGreaterThan(copperAlpha('reduced', 0, DOWNBEAT_MS / 2));
    expect(copperAlpha('reduced', 0, DOWNBEAT_MS)).toBe(COPPER_BASE);
  });
});

describe('copper bars', () => {
  it('never overlap', () => {
    for (let ms = 0; ms < 30_000; ms += 7) {
      for (let k = 0; k < 4; k++) expect(barTop(k + 1, ms) - barTop(k, ms)).toBeGreaterThanOrEqual(BAR_HEIGHT);
    }
  });
});
