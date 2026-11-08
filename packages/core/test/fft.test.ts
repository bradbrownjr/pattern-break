import { describe, expect, it } from 'vitest';
import { FFT_SIZE } from '../src/analysis-constants.ts';
import { fftInPlace } from '../src/spectrum/fft.ts';

function directDft(re: Float64Array, im: Float64Array): { re: Float64Array; im: Float64Array } {
  const n = re.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * k * t) / n;
      outRe[k]! += re[t]! * Math.cos(a) - im[t]! * Math.sin(a);
      outIm[k]! += re[t]! * Math.sin(a) + im[t]! * Math.cos(a);
    }
  }
  return { re: outRe, im: outIm };
}

// A fixed pseudo-random signal, so the test is repeatable.
function signal(n: number, seed: number): Float64Array {
  const out = new Float64Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = s / 0x100000000 - 0.5;
  }
  return out;
}

describe('fftInPlace', () => {
  it.each([1, 2, 4, 8, 16, 64, 256])('matches a direct DFT at size %i', (n) => {
    const re = signal(n, n);
    const im = signal(n, n + 1000);
    const want = directDft(re, im);
    fftInPlace(re, im);
    for (let k = 0; k < n; k++) {
      expect(re[k]).toBeCloseTo(want.re[k]!, 10);
      expect(im[k]).toBeCloseTo(want.im[k]!, 10);
    }
  });

  it('puts a bin-centred sine in its bin', () => {
    const n = FFT_SIZE;
    const bin = 37;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let t = 0; t < n; t++) re[t] = Math.sin((2 * Math.PI * bin * t) / n);
    fftInPlace(re, im);
    // sin gives -i N/2 at bin k and +i N/2 at N - k; everything else is rounding noise.
    expect(im[bin]).toBeCloseTo(-n / 2, 8);
    expect(im[n - bin]).toBeCloseTo(n / 2, 8);
    for (let k = 0; k < n; k++) {
      if (k === bin || k === n - bin) continue;
      expect(Math.hypot(re[k]!, im[k]!)).toBeLessThan(1e-9);
    }
  });

  it('rejects sizes that are not a power of two up to FFT_SIZE', () => {
    expect(() => fftInPlace(new Float64Array(12), new Float64Array(12))).toThrow(RangeError);
    expect(() => fftInPlace(new Float64Array(FFT_SIZE * 2), new Float64Array(FFT_SIZE * 2))).toThrow(
      RangeError,
    );
    expect(() => fftInPlace(new Float64Array(8), new Float64Array(4))).toThrow(RangeError);
  });
});
