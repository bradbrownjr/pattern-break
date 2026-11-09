import { describe, expect, it } from 'vitest';
import { duration, peak, render, renderMix, rms, stepLfsr, type Sound } from '../src/index.ts';

const RATE = 48_000;

/** Steps from `start` until the register comes back to it. */
function period(start: number, short: boolean): number {
  let s = start;
  for (let n = 1; n <= 40_000; n++) {
    s = stepLfsr(s, short);
    if (s === start) return n;
  }
  return -1;
}

/** Pitch from the upward zero crossings in a window: cycles between the first and the last. */
function pitchHz(samples: Float32Array, from: number, seconds: number): number {
  const crossings: number[] = [];
  const a = Math.floor(from * RATE);
  const b = Math.floor((from + seconds) * RATE);
  for (let i = a + 1; i < b; i++) if (samples[i - 1]! < 0 && samples[i]! >= 0) crossings.push(i);
  return ((crossings.length - 1) * RATE) / (crossings.at(-1)! - crossings[0]!);
}

describe('noise shift register', () => {
  // https://www.nesdev.org/wiki/APU_Noise: long mode gives a sequence 32 767 steps long;
  // short mode one 93 or 31 steps long, depending on the register when the mode is set.
  it('has the NES periods', () => {
    expect(period(1, false)).toBe(32_767);
    const shortPeriods = new Set<number>();
    for (let s = 1; s < 0x8000; s += 97) shortPeriods.add(period(stepLfsr(s, true), true));
    expect([...shortPeriods].filter((p) => p > 0).sort((a, b) => a - b)).toEqual([31, 93]);
  });
});

describe('render', () => {
  const tone: Sound = { wave: 'square', freq: 440, sustain: 0.1, decay: 0.1, volume: 0.5 };

  it('lasts attack + sustain + decay and holds at volume', () => {
    const s = render({ ...tone, attack: 0.05 }, RATE);
    expect(duration({ ...tone, attack: 0.05 })).toBeCloseTo(0.25, 9);
    expect(s.length).toBe(Math.ceil(0.25 * RATE));
    expect(peak(s)).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(peak(s)).toBeGreaterThan(0.4);
    expect(s.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('gives the same samples every time', () => {
    const a = render({ ...tone, wave: 'noise', freq: 4000, seed: 77 });
    const b = render({ ...tone, wave: 'noise', freq: 4000, seed: 77 });
    expect(b).toEqual(a);
    const c = render({ ...tone, wave: 'noise', freq: 4000, seed: 78 });
    expect(c).not.toEqual(a);
  });

  it('plays the frequency asked for, and slides by octaves per second', () => {
    expect(pitchHz(render({ ...tone, sustain: 0.5 }), 0, 0.1)).toBeCloseTo(440, -1);
    // One octave per second up: about 440 Hz at the start, 880 Hz after a second.
    const up = render({ wave: 'sine', freq: 440, slide: 1, sustain: 1.2 });
    expect(pitchHz(up, 0, 0.05)).toBeCloseTo(450, -1);
    expect(pitchHz(up, 1, 0.05)).toBeCloseTo(900, -2);
  });

  it('jumps pitch by semitones', () => {
    const s = render({ wave: 'sine', freq: 440, sustain: 0.4, jumps: [{ at: 0.2, semitones: 12 }] });
    expect(pitchHz(s, 0.05, 0.1)).toBeCloseTo(440, -1);
    expect(pitchHz(s, 0.25, 0.1)).toBeCloseTo(880, -1);
  });

  it('stops early when a falling pitch passes minFreq', () => {
    const s = render({ wave: 'square', freq: 1000, slide: -10, minFreq: 250, sustain: 1 });
    // 1000 Hz to 250 Hz is two octaves: 0.2 s at 10 octaves a second. The rest is silence.
    expect(peak(s.subarray(0, Math.floor(0.19 * RATE)))).toBeGreaterThan(0.4);
    expect(peak(s.subarray(Math.ceil(0.21 * RATE)))).toBe(0);
  });

  it('punches above the hold level and fades out', () => {
    const s = render({ wave: 'square', freq: 200, sustain: 0.2, decay: 0.2, punch: 0.5, volume: 0.4 });
    expect(peak(s.subarray(0, RATE * 0.02))).toBeGreaterThan(0.55);
    expect(peak(s.subarray(Math.floor(0.39 * RATE)))).toBeLessThan(0.05);
  });

  it('low-pass filtering takes energy out of noise', () => {
    const open = render({ wave: 'noise', freq: 20_000, sustain: 0.2 });
    const closed = render({ wave: 'noise', freq: 20_000, sustain: 0.2, lowpass: 300 });
    expect(rms(closed)).toBeLessThan(rms(open) / 3);
  });

  it('mixes layers without clipping past full scale', () => {
    const loud: Sound = { wave: 'square', freq: 100, sustain: 0.1, volume: 0.9 };
    const m = renderMix([loud, loud]);
    expect(peak(m)).toBe(1);
    expect(m.length).toBe(render(loud).length);
  });
});
