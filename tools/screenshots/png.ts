// Decodes the PNG screenshots Chromium writes (8-bit RGB or RGBA, not interlaced) to RGBA
// pixels, so clip frames can go to the GIF encoder. Other PNG variants are rejected.

import { inflateSync } from 'node:zlib';

export interface Rgba {
  width: number;
  height: number;
  /** width * height * 4 bytes, rows top to bottom. */
  data: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function decodePng(png: Uint8Array): Rgba {
  for (let i = 0; i < 8; i++) if (png[i] !== SIGNATURE[i]) throw new Error('png: bad signature');
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat: Uint8Array[] = [];
  for (let at = 8; at < png.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(png[at + 4]!, png[at + 5]!, png[at + 6]!, png[at + 7]!);
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const depth = body[8];
      colorType = body[9]!;
      const interlace = body[12];
      if (depth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
        throw new Error(`png: unsupported format (depth ${depth}, colour type ${colorType}, interlace ${interlace})`);
      }
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length !== (stride + 1) * height) throw new Error('png: wrong data length');
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[src + x]!;
      const a = x >= channels ? pixels[dst + x - channels]! : 0;
      const b = y > 0 ? pixels[dst - stride + x]! : 0;
      const c = x >= channels && y > 0 ? pixels[dst - stride + x - channels]! : 0;
      let out: number;
      switch (filter) {
        case 0:
          out = value;
          break;
        case 1:
          out = value + a;
          break;
        case 2:
          out = value + b;
          break;
        case 3:
          out = value + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          out = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`png: bad filter ${filter}`);
      }
      pixels[dst + x] = out & 0xff;
    }
  }
  if (channels === 4) return { width, height, data: pixels };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
    data[j] = pixels[i]!;
    data[j + 1] = pixels[i + 1]!;
    data[j + 2] = pixels[i + 2]!;
    data[j + 3] = 255;
  }
  return { width, height, data };
}
