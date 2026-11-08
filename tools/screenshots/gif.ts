// Encodes clip frames as an animated GIF with gifenc. One global palette for every frame,
// so colours don't shift between frames. When the frames use 256 colours or fewer (neon on
// black usually does), the palette is exactly those colours and no pixel changes; past
// that, gifenc's quantizer builds one from all the frames.

import gifenc, { type Palette } from 'gifenc';
import type { Rgba } from './png.ts';

// gifenc's main entry is CommonJS, which Node imports as one default export.
const { GIFEncoder, applyPalette, quantize } = gifenc;

export interface GifResult {
  bytes: Uint8Array;
  /** Distinct colours in the frames, or more than 256 when they had to be quantized. */
  colors: number;
  quantized: boolean;
}

/** Every distinct RGB value in the frames, sorted, or null if there are more than 256. */
function exactColors(frames: Rgba[]): number[] | null {
  const seen = new Set<number>();
  for (const f of frames) {
    const d = f.data;
    for (let i = 0; i < d.length; i += 4) {
      seen.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
      if (seen.size > 256) return null;
    }
  }
  return [...seen].sort((a, b) => a - b);
}

export function encodeGif(frames: Rgba[], fps: number): GifResult {
  const first = frames[0];
  if (!first) throw new Error('gif: no frames');
  const { width, height } = first;
  for (const f of frames) if (f.width !== width || f.height !== height) throw new Error('gif: frames differ in size');
  const delay = Math.round(1000 / fps);
  const gif = GIFEncoder();

  const colors = exactColors(frames);
  let palette: Palette;
  let indexed: Uint8Array[];
  if (colors) {
    // gifenc pads the table to a power of two with black.
    palette = colors.map((c) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff]);
    const lookup = new Map<number, number>();
    colors.forEach((c, i) => lookup.set(c, i));
    indexed = frames.map((f) => {
      const out = new Uint8Array(width * height);
      const d = f.data;
      for (let p = 0, i = 0; p < out.length; p++, i += 4) out[p] = lookup.get((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!)!;
      return out;
    });
  } else {
    const all = new Uint8Array(frames.length * width * height * 4);
    frames.forEach((f, i) => all.set(f.data, i * width * height * 4));
    palette = quantize(all, 256, { format: 'rgb565' });
    indexed = frames.map((f) => applyPalette(f.data, palette, 'rgb565'));
  }

  indexed.forEach((index, i) => {
    gif.writeFrame(index, width, height, i === 0 ? { palette, delay, repeat: 0 } : { delay });
  });
  gif.finish();
  return { bytes: gif.bytes(), colors: colors ? colors.length : 257, quantized: colors === null };
}
