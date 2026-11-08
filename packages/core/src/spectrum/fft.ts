import { FFT_SIZE } from '../analysis-constants.ts';
import { TWIDDLE_COS, TWIDDLE_SIN } from './tables.generated.ts';

/**
 * In-place forward DFT, X[k] = sum x[n] e^(-2 pi i k n / N), radix-2 decimation in time.
 * `re.length` must be a power of two from 1 to FFT_SIZE; smaller sizes read the FFT_SIZE
 * twiddle table with a stride. Uses only + - * on Float64, in a fixed order, so every
 * engine gives the same bits.
 */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (im.length !== n || n < 1 || n > FFT_SIZE || (n & (n - 1)) !== 0) {
    throw new RangeError(`fftInPlace: size ${n} is not a power of two up to ${FFT_SIZE}`);
  }

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const stride = FFT_SIZE / size;
    // Twiddle outside, butterflies inside: the butterflies of a stage are independent,
    // so the order doesn't change any result.
    for (let j = 0; j < half; j++) {
      const c = TWIDDLE_COS[j * stride]!;
      const s = TWIDDLE_SIN[j * stride]!;
      for (let start = 0; start < n; start += size) {
        const a = start + j;
        const b = a + half;
        const br = re[b]!;
        const bi = im[b]!;
        // (br + i bi)(c - i s)
        const tr = br * c + bi * s;
        const ti = bi * c - br * s;
        const ar = re[a]!;
        const ai = im[a]!;
        re[b] = ar - tr;
        im[b] = ai - ti;
        re[a] = ar + tr;
        im[a] = ai + ti;
      }
    }
  }
}
