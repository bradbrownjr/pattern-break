import { describe, expect, it } from 'vitest';
import {
  BAND_COUNT,
  BAND_HIGH_HZ,
  BAND_LOW_HZ,
  FFT_SIZE,
  LED_LEVELS,
  SAMPLE_RATE,
} from '../src/analysis-constants.ts';
import { SpectrumAnalyzer, ledLevel, quantizeVu } from '../src/spectrum/analyzer.ts';
import {
  BAND_BIN_END,
  BAND_BIN_START,
  HANN_WINDOW,
  LED_THRESHOLDS,
  TWIDDLE_COS,
  TWIDDLE_SIN,
} from '../src/spectrum/tables.generated.ts';

const BIN_HZ = SAMPLE_RATE / FFT_SIZE;
const ZEROS: number[] = Array.from({ length: BAND_COUNT }, () => 0);
const bandCentreHz = (b: number): number =>
  BAND_LOW_HZ * Math.pow(BAND_HIGH_HZ / BAND_LOW_HZ, (b + 0.5) / BAND_COUNT);

function sine(hz: number, amplitude: number, phase: number, length: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE + phase);
  return out;
}

function levels(left: Float32Array, right: Float32Array): { left: number[]; right: number[] } {
  const a = new SpectrumAnalyzer();
  a.push(left, right, left.length);
  const l = new Uint8Array(BAND_COUNT);
  const r = new Uint8Array(BAND_COUNT);
  a.analyze(l, r, 0);
  return { left: [...l], right: [...r] };
}

describe('spectrum tables', () => {
  it('have the expected sizes', () => {
    expect(TWIDDLE_COS.length).toBe(FFT_SIZE / 2);
    expect(TWIDDLE_SIN.length).toBe(FFT_SIZE / 2);
    expect(HANN_WINDOW.length).toBe(FFT_SIZE);
    expect(BAND_BIN_START.length).toBe(BAND_COUNT);
    expect(BAND_BIN_END.length).toBe(BAND_COUNT);
    expect(LED_THRESHOLDS.length).toBe(BAND_COUNT * LED_LEVELS);
  });

  it('twiddles lie on the unit circle', () => {
    expect(TWIDDLE_COS[0]).toBe(1);
    expect(TWIDDLE_SIN[0]).toBe(0);
    for (let k = 0; k < FFT_SIZE / 2; k++) {
      expect(TWIDDLE_COS[k]! * TWIDDLE_COS[k]! + TWIDDLE_SIN[k]! * TWIDDLE_SIN[k]!).toBeCloseTo(1, 14);
    }
  });

  it('the Hann window is periodic, symmetric, and peaks at 1', () => {
    expect(HANN_WINDOW[0]).toBe(0);
    expect(HANN_WINDOW[FFT_SIZE / 2]).toBe(1);
    for (let n = 1; n < FFT_SIZE; n++) {
      expect(HANN_WINDOW[n]).toBeCloseTo(HANN_WINDOW[FFT_SIZE - n]!, 15);
      expect(HANN_WINDOW[n]!).toBeGreaterThan(0);
    }
  });

  it('bands are contiguous, non-empty, and span 40 Hz to 16 kHz', () => {
    expect(BAND_BIN_START[0]!).toBeGreaterThanOrEqual(1);
    expect(BAND_BIN_START[0]! * BIN_HZ).toBeGreaterThanOrEqual(BAND_LOW_HZ);
    for (let b = 0; b < BAND_COUNT; b++) {
      expect(BAND_BIN_END[b]!).toBeGreaterThan(BAND_BIN_START[b]!);
      if (b > 0) expect(BAND_BIN_START[b]).toBe(BAND_BIN_END[b - 1]);
    }
    expect((BAND_BIN_END[BAND_COUNT - 1]! - 1) * BIN_HZ).toBeLessThan(BAND_HIGH_HZ);
    expect(BAND_BIN_END[BAND_COUNT - 1]!).toBeLessThanOrEqual(FFT_SIZE / 2);
  });

  it('thresholds rise in 5 dB steps', () => {
    const step = Math.pow(10, 0.5);
    for (let b = 0; b < BAND_COUNT; b++) {
      for (let i = 1; i < LED_LEVELS; i++) {
        const ratio = LED_THRESHOLDS[b * LED_LEVELS + i]! / LED_THRESHOLDS[b * LED_LEVELS + i - 1]!;
        expect(ratio).toBeCloseTo(step, 12);
      }
    }
  });
});

describe('ledLevel', () => {
  it('counts thresholds met or exceeded, at each boundary', () => {
    for (const b of [0, 7, BAND_COUNT - 1]) {
      expect(ledLevel(0, b)).toBe(0);
      for (let i = 0; i < LED_LEVELS; i++) {
        const t = LED_THRESHOLDS[b * LED_LEVELS + i]!;
        expect(ledLevel(t, b)).toBe(i + 1);
        // The next float below t misses this threshold.
        expect(ledLevel(t * (1 - Number.EPSILON), b)).toBe(i);
      }
      expect(ledLevel(Number.MAX_VALUE, b)).toBe(LED_LEVELS);
      expect(ledLevel(Number.NaN, b)).toBe(0);
    }
  });
});

describe('quantizeVu', () => {
  it('floors v * 255 and clamps to 0..255', () => {
    expect(quantizeVu(0)).toBe(0);
    expect(quantizeVu(-0.5)).toBe(0);
    expect(quantizeVu(Number.NaN)).toBe(0);
    expect(quantizeVu(0.5)).toBe(127);
    expect(quantizeVu(1 / 255)).toBe(1);
    expect(quantizeVu(0.999)).toBe(254);
    expect(quantizeVu(1)).toBe(255);
    expect(quantizeVu(3)).toBe(255);
  });
});

describe('SpectrumAnalyzer', () => {
  it('reads silence as 0 in every band', () => {
    const silent = new Float32Array(FFT_SIZE);
    const out = levels(silent, silent);
    expect(out.left).toEqual(ZEROS);
    expect(out.right).toEqual(ZEROS);
  });

  it.each([0, 0.7, 2.1])('reads a full-scale sine centred in each band as 12 (phase %f)', (phase) => {
    for (let b = 0; b < BAND_COUNT; b++) {
      const s = sine(bandCentreHz(b), 1, phase, FFT_SIZE);
      const out = levels(s, new Float32Array(FFT_SIZE));
      expect(out.left[b], `band ${b}`).toBe(LED_LEVELS);
      // The right channel stays silent apart from rounding.
      expect(out.right[b], `band ${b} right`).toBe(0);
    }
  });

  it('drops one level per 5 dB', () => {
    const b = 8;
    // -7.5 dB sits between the -10 and -5 dB thresholds; -62.5 dB is below all of them.
    for (const [db, want] of [
      [-7.5, 11],
      [-32.5, 6],
      [-57.5, 1],
      [-62.5, 0],
    ] as const) {
      const s = sine(bandCentreHz(b), Math.pow(10, db / 20), 0, FFT_SIZE);
      expect(levels(new Float32Array(FFT_SIZE), s).right[b], `${db} dB`).toBe(want);
    }
  });

  it('keeps left and right apart', () => {
    const low = sine(bandCentreHz(2), 1, 0, FFT_SIZE);
    const high = sine(bandCentreHz(13), 1, 0, FFT_SIZE);
    const out = levels(low, high);
    expect(out.left[2]).toBe(LED_LEVELS);
    expect(out.left[13]).toBe(0);
    expect(out.right[13]).toBe(LED_LEVELS);
    expect(out.right[2]).toBe(0);
  });

  it('uses only the most recent FFT_SIZE samples', () => {
    const a = new SpectrumAnalyzer();
    const loud = sine(bandCentreHz(10), 1, 0, FFT_SIZE);
    a.push(loud, loud, FFT_SIZE);
    const silent = new Float32Array(500);
    for (let i = 0; i < FFT_SIZE / 500 + 1; i++) a.push(silent, silent, 500);
    const l = new Uint8Array(BAND_COUNT);
    const r = new Uint8Array(BAND_COUNT);
    a.analyze(l, r, 0);
    expect([...l]).toEqual(ZEROS);
  });
});
