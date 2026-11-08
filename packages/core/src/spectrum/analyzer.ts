import { BAND_COUNT, FFT_SIZE, LED_LEVELS, VU_SCALE } from '../analysis-constants.ts';
import { fftInPlace } from './fft.ts';
import {
  BAND_BIN_END,
  BAND_BIN_START,
  HANN_WINDOW,
  LED_THRESHOLDS,
} from './tables.generated.ts';

/** Number of thresholds in band `band`'s row that `power` meets or exceeds: 0..LED_LEVELS. */
export function ledLevel(power: number, band: number): number {
  const row = band * LED_LEVELS;
  let level = 0;
  for (let i = 0; i < LED_LEVELS; i++) {
    if (power >= LED_THRESHOLDS[row + i]!) level++;
  }
  return level;
}

/** floor(min(v, 1) * 255); negative values and NaN give 0. */
export function quantizeVu(v: number): number {
  if (!(v > 0)) return 0;
  return Math.floor((v < 1 ? v : 1) * VU_SCALE);
}

/**
 * Keeps the most recent FFT_SIZE stereo samples (zeros before the song starts) and turns
 * them into BAND_COUNT LED levels per channel.
 *
 * Per frame: window both channels with the Hann table, run one complex FFT with the left
 * channel as the real part and the right as the imaginary part, and split the two spectra
 * with X[k] and X[N - k]. Bin power is the unscaled |X[k]|^2. Band power is the mean bin
 * power over the band's bins, summed in increasing bin order.
 */
export class SpectrumAnalyzer {
  private readonly histLeft = new Float64Array(FFT_SIZE);
  private readonly histRight = new Float64Array(FFT_SIZE);
  /** Index of the oldest sample in the history, and the next one to overwrite. */
  private pos = 0;
  private readonly re = new Float64Array(FFT_SIZE);
  private readonly im = new Float64Array(FFT_SIZE);
  private readonly powLeft = new Float64Array(FFT_SIZE / 2);
  private readonly powRight = new Float64Array(FFT_SIZE / 2);

  /** Appends the first `count` samples of `left` and `right` to the history. */
  push(left: Float32Array, right: Float32Array, count: number): void {
    const mask = FFT_SIZE - 1;
    let pos = this.pos;
    for (let i = 0; i < count; i++) {
      this.histLeft[pos] = left[i]!;
      this.histRight[pos] = right[i]!;
      pos = (pos + 1) & mask;
    }
    this.pos = pos;
  }

  /** Mean bin power of each band, left channel, from the last `computeBandPowers` call. */
  readonly bandLeft = new Float64Array(BAND_COUNT);
  /** Mean bin power of each band, right channel. */
  readonly bandRight = new Float64Array(BAND_COUNT);

  /** Writes BAND_COUNT LED levels for each channel at `outLeft[offset..]` and `outRight[offset..]`. */
  analyze(outLeft: Uint8Array, outRight: Uint8Array, offset: number): void {
    this.computeBandPowers();
    for (let b = 0; b < BAND_COUNT; b++) {
      outLeft[offset + b] = ledLevel(this.bandLeft[b]!, b);
      outRight[offset + b] = ledLevel(this.bandRight[b]!, b);
    }
  }

  /** Fills `bandLeft` and `bandRight` from the current history. */
  computeBandPowers(): void {
    const n = FFT_SIZE;
    const mask = n - 1;
    const { re, im, powLeft, powRight } = this;
    for (let i = 0; i < n; i++) {
      const src = (this.pos + i) & mask;
      const w = HANN_WINDOW[i]!;
      re[i] = this.histLeft[src]! * w;
      im[i] = this.histRight[src]! * w;
    }
    fftInPlace(re, im);

    // L[k] = (X[k] + conj(X[N-k])) / 2 and R[k] = (X[k] - conj(X[N-k])) / 2i.
    for (let k = 1; k < n / 2; k++) {
      const xr = re[k]!;
      const xi = im[k]!;
      const yr = re[n - k]!;
      const yi = im[n - k]!;
      const lr = xr + yr;
      const li = xi - yi;
      const rr = xi + yi;
      const ri = yr - xr;
      powLeft[k] = (lr * lr + li * li) * 0.25;
      powRight[k] = (rr * rr + ri * ri) * 0.25;
    }

    for (let b = 0; b < BAND_COUNT; b++) {
      const start = BAND_BIN_START[b]!;
      const end = BAND_BIN_END[b]!;
      let sumLeft = 0;
      let sumRight = 0;
      for (let k = start; k < end; k++) {
        sumLeft += powLeft[k]!;
        sumRight += powRight[k]!;
      }
      const count = end - start;
      this.bandLeft[b] = sumLeft / count;
      this.bandRight[b] = sumRight / count;
    }
  }
}
