// The Flashing and Shake settings (docs/PLAN.md, "Accessibility"): with reduced flashing no
// flash is stronger than the cap or starts more than three times in any second, and with
// shake off the playfield never moves.

import { describe, expect, it } from 'vitest';
import { STROBE_PERIOD_MS, strobeAlpha } from '../src/game/hangar.ts';
import { FLASH_GAP_MS, FLASH_MS, FLASH_PEAK, FlashGate, flashAlpha } from '../src/render/flash.ts';
import { seededRandom } from '../src/render/random.ts';
import { SHAKE_MS, SHAKE_PX, shakeOffset } from '../src/render/shake.ts';

/** The times in `times` (sorted) with more than three in some one-second window. */
function tooMany(times: number[]): boolean {
  return times.some((t, i) => times.filter((u, j) => j >= i && u < t + 1000).length > 3);
}

/** A sampled curve's onsets: each ms where it rises from nothing. */
function onsets(alpha: (ms: number) => number, ms: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < ms; t++) if (alpha(t) > 0 && alpha(t - 1) === 0) out.push(t);
  return out;
}

/** Flashes asked for at `asked` ms through `gate`, drawn as the screen shows them. */
function screen(gate: FlashGate, asked: number[]): { starts: number[]; alpha: (ms: number) => number } {
  const starts = asked.filter((t) => gate.admit(t));
  const alpha = (ms: number): number => Math.max(0, ...starts.map((s) => flashAlpha(ms - s, gate.peak)));
  return { starts, alpha };
}

/** Bursts of requests, some closer together than a third of a second. */
function requests(seed: number): number[] {
  const random = seededRandom(seed);
  const out: number[] = [];
  for (let t = 0; t < 10_000; t += 20 + Math.floor(random() * 400)) out.push(t);
  return out;
}

describe('reduced flashing', () => {
  it('is the default peak, a quarter of white or less', () => {
    expect(new FlashGate().flashing).toBe('reduced');
    expect(FLASH_PEAK.reduced).toBeLessThanOrEqual(0.25);
    expect(FLASH_MS).toBeLessThan(FLASH_GAP_MS);
  });

  it('never starts more than three flashes in a second or goes past the cap', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const gate = new FlashGate();
      const asked = requests(seed);
      expect(tooMany(asked)).toBe(true);
      const { starts, alpha } = screen(gate, asked);
      expect(starts.length).toBeGreaterThan(10);
      expect(tooMany(starts)).toBe(false);
      const seen = onsets(alpha, 10_500);
      expect(seen).toEqual(starts);
      let max = 0;
      for (let t = 0; t < 10_500; t++) max = Math.max(max, alpha(t));
      expect(max).toBeLessThanOrEqual(FLASH_PEAK.reduced);
    }
  });

  it('shows the same flash again when asked again, and starts over with the song', () => {
    const gate = new FlashGate();
    expect(gate.admit(5000)).toBe(true);
    expect(gate.admit(5000)).toBe(true);
    expect(gate.admit(5100)).toBe(false);
    expect(gate.admit(100)).toBe(true);
  });

  it('keeps the hangar strobe under three flashes a second and under the cap', () => {
    const lit = onsets((ms) => strobeAlpha(ms, FLASH_PEAK.reduced), 3 * STROBE_PERIOD_MS);
    expect(lit).toEqual([0, 160, 1000, 1160, 2000, 2160]);
    expect(tooMany(lit)).toBe(false);
    let max = 0;
    for (let t = 0; t < STROBE_PERIOD_MS; t++) max = Math.max(max, strobeAlpha(t, FLASH_PEAK.reduced));
    expect(max).toBeLessThanOrEqual(FLASH_PEAK.reduced);
  });
});

describe('full flashing', () => {
  it('shows every flash, stronger', () => {
    const gate = new FlashGate();
    gate.flashing = 'full';
    const asked = requests(1);
    const { starts, alpha } = screen(gate, asked);
    expect(starts).toEqual(asked);
    expect(alpha(asked[0]!)).toBe(FLASH_PEAK.full);
    expect(FLASH_PEAK.full).toBeGreaterThan(FLASH_PEAK.reduced);
  });
});

describe('shake', () => {
  const out = { x: 0, y: 0 };

  it('never moves the playfield when off', () => {
    for (const seed of [0, 1, 99, 12_345]) {
      for (let ms = -50; ms < SHAKE_MS + 50; ms++) {
        shakeOffset(false, ms, seed, out);
        expect(out).toEqual({ x: 0, y: 0 });
      }
    }
  });

  it('moves it by whole pixels within reach while on, then stops', () => {
    let moved = 0;
    for (let ms = 0; ms < SHAKE_MS; ms++) {
      shakeOffset(true, ms, 7, out);
      expect(Number.isInteger(out.x) && Number.isInteger(out.y)).toBe(true);
      expect(Math.max(Math.abs(out.x), Math.abs(out.y))).toBeLessThanOrEqual(SHAKE_PX);
      if (out.x !== 0 || out.y !== 0) moved++;
    }
    expect(moved).toBeGreaterThan(SHAKE_MS / 2);
    for (const ms of [-1, SHAKE_MS, SHAKE_MS + 100, Number.NaN]) {
      shakeOffset(true, ms, 7, out);
      expect(out).toEqual({ x: 0, y: 0 });
    }
  });

  it('shakes the same way for the same crash', () => {
    const a = { x: 0, y: 0 };
    shakeOffset(true, 40, 1234, a);
    shakeOffset(true, 40, 1234, out);
    expect(out).toEqual(a);
  });
});
