// Pixel-art textures from character maps: each string is a row, each character a pixel
// looked up in a colour table, '.' (or any character not in the table) transparent.

import { BufferImageSource, Texture } from 'pixi.js';

/** RGBA pixels of `map`, which must have rows of equal length. */
export function mapPixels(map: readonly string[], colors: Record<string, number>): Uint8Array {
  const height = map.length;
  const width = map[0]!.length;
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = colors[map[y]![x]!];
      if (color === undefined) continue;
      const o = (y * width + x) * 4;
      out[o] = (color >> 16) & 0xff;
      out[o + 1] = (color >> 8) & 0xff;
      out[o + 2] = color & 0xff;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** A nearest-neighbour texture of `map`. */
export function mapTexture(map: readonly string[], colors: Record<string, number>, label: string): Texture {
  return new Texture({
    source: new BufferImageSource({
      resource: mapPixels(map, colors),
      width: map[0]!.length,
      height: map.length,
      scaleMode: 'nearest',
      label,
    }),
  });
}

/** `map` upside down. */
export function flipRows(map: readonly string[]): string[] {
  return [...map].reverse();
}
