// Draws the app icons for the PWA manifest and the page (docs/DEVELOPMENT.md, "Install and
// offline"): "PB" in the game's 5x7 pixel font, cyan with a magenta shadow like the title
// screen's heading, on the game's dark background. The background fills the square, and
// the letters sit inside the middle 80% circle that a maskable icon keeps, so one drawing
// serves as both a plain and a maskable icon.
//
// Usage: node tools/make-icons.ts   (writes packages/client/public/icons/*.png)

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { GLYPH_ADVANCE, GLYPH_WIDTH, glyphRows } from '../packages/client/src/render/font.ts';
import { BACKGROUND, CYAN, MAGENTA } from '../packages/client/src/render/palette.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'client', 'public', 'icons');
const TEXT = 'PB';
/** Rows of a capital letter: the font's rows 0 to 6 (7 and 8 hold descenders). */
const CAP_ROWS = 7;
/** The icons, by file name and edge in pixels. */
const SIZES: Record<string, number> = {
  'icon-512.png': 512,
  'icon-192.png': 192,
  'apple-touch-icon.png': 180,
  'favicon-32.png': 32,
};

/**
 * The text on a grid of half font pixels, as the title screen draws it at scale 2 with a
 * shadow 1 px right and down: 0 empty, 1 shadow, 2 letter.
 */
function textGrid(): { width: number; height: number; cells: Uint8Array } {
  const width = ((TEXT.length - 1) * GLYPH_ADVANCE + GLYPH_WIDTH) * 2 + 1;
  const height = CAP_ROWS * 2 + 1;
  const cells = new Uint8Array(width * height);
  for (const [layer, d] of [
    [1, 1],
    [2, 0],
  ] as const) {
    for (let c = 0; c < TEXT.length; c++) {
      const rows = glyphRows(TEXT[c]!);
      for (let y = 0; y < CAP_ROWS * 2; y++) {
        for (let x = 0; x < GLYPH_WIDTH * 2; x++) {
          if ((rows[y >> 1]! >> (GLYPH_WIDTH - 1 - (x >> 1))) & 1) cells[(y + d) * width + c * GLYPH_ADVANCE * 2 + x + d] = layer;
        }
      }
    }
  }
  return { width, height, cells };
}

function rgb(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

/** The icon's pixels as RGB rows, each led by PNG's filter byte (0, none). */
function drawIcon(size: number): Buffer {
  const grid = textGrid();
  // Whole pixels per half font pixel, as large as fits in 60% of the edge: inside the
  // maskable circle.
  const scale = Math.max(1, Math.floor((size * 0.6) / grid.width));
  const left = Math.floor((size - grid.width * scale) / 2);
  const top = Math.floor((size - grid.height * scale) / 2);
  const colors = [rgb(BACKGROUND), rgb(MAGENTA), rgb(CYAN)];
  const stride = 1 + size * 3;
  const out = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - left) / scale);
      const gy = Math.floor((y - top) / scale);
      const inside = x >= left && y >= top && gx < grid.width && gy < grid.height;
      const [r, g, b] = colors[inside ? grid.cells[gy * grid.width + gx]! : 0]!;
      out.set([r, g, b], y * stride + 1 + x * 3);
    }
  }
  return out;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** An 8-bit RGB PNG (color type 2), per the PNG specification (W3C, third edition). */
function encodePng(size: number, rows: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size] of Object.entries(SIZES)) {
  writeFileSync(join(OUT, name), encodePng(size, drawIcon(size)));
  console.log(`wrote packages/client/public/icons/${name} (${size}x${size})`);
}
