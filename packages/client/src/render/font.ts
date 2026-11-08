// A 5x7 pixel font for printable ASCII, drawn here rather than loaded, so text is sharp at
// any integer scale and screenshots never depend on the fonts a machine has installed.
// Each glyph is rows of 5 cells ('#' lit), top to bottom. Row 6 is the baseline; rows 7
// and 8 hold descenders. Characters outside printable ASCII draw as '?'.

export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 9;
/** Horizontal distance from one character to the next. */
export const GLYPH_ADVANCE = 6;
/** Vertical distance between lines of text. */
export const LINE_HEIGHT = 10;

const RAW: Record<string, string> = {
  ' ': '..... ..... ..... ..... ..... ..... .....',
  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
  '"': '.#.#. .#.#. .#.#. ..... ..... ..... .....',
  '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.',
  $: '..#.. .#### #.#.. .###. ..#.# ####. ..#..',
  '%': '##... ##..# ...#. ..#.. .#... #..## ...##',
  '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#',
  "'": '..#.. ..#.. .#... ..... ..... ..... .....',
  '(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
  ')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...',
  '*': '..... ..#.. #.#.# .###. #.#.# ..#.. .....',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  ',': '..... ..... ..... ..... ..... .##.. ..#.. .#...',
  '-': '..... ..... ..... .###. ..... ..... .....',
  '.': '..... ..... ..... ..... ..... .##.. .##..',
  '/': '..... ....# ...#. ..#.. .#... #.... .....',
  '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
  '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ...#. ..#.. .#... #####',
  '3': '##### ...#. ..#.. ...#. ....# #...# .###.',
  '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '..##. .#... #.... ####. #...# #...# .###.',
  '7': '##### ....# ...#. ..#.. .#... .#... .#...',
  '8': '.###. #...# #...# .###. #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ...#. .##..',
  ':': '..... .##.. .##.. ..... .##.. .##.. .....',
  ';': '..... .##.. .##.. ..... .##.. ..#.. .#...',
  '<': '...#. ..#.. .#... #.... .#... ..#.. ...#.',
  '=': '..... ..... ##### ..... ##### ..... .....',
  '>': '.#... ..#.. ...#. ....# ...#. ..#.. .#...',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  '@': '.###. #...# ....# .##.# #.#.# #.#.# .###.',
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '###.. #..#. #...# #...# #...# #..#. ###..',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .####',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# #...# ##..# #.#.# #..## #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  '[': '.###. .#... .#... .#... .#... .#... .###.',
  '\\': '..... #.... .#... ..#.. ...#. ....# .....',
  ']': '.###. ...#. ...#. ...#. ...#. ...#. .###.',
  '^': '..#.. .#.#. #...# ..... ..... ..... .....',
  _: '..... ..... ..... ..... ..... ..... #####',
  '`': '.#... ..#.. ...#. ..... ..... ..... .....',
  a: '..... ..... .###. ....# .#### #...# .####',
  b: '#.... #.... #.##. ##..# #...# #...# ####.',
  c: '..... ..... .###. #.... #.... #...# .###.',
  d: '....# ....# .##.# #..## #...# #...# .####',
  e: '..... ..... .###. #...# ##### #.... .###.',
  f: '..##. .#..# .#... ###.. .#... .#... .#...',
  g: '..... ..... .#### #...# #...# #...# .#### ....# .###.',
  h: '#.... #.... #.##. ##..# #...# #...# #...#',
  i: '..#.. ..... .##.. ..#.. ..#.. ..#.. .###.',
  j: '...#. ..... ..##. ...#. ...#. ...#. ...#. #..#. .##..',
  k: '#.... #.... #..#. #.#.. ##... #.#.. #..#.',
  l: '.##.. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  m: '..... ..... ##.#. #.#.# #.#.# #...# #...#',
  n: '..... ..... #.##. ##..# #...# #...# #...#',
  o: '..... ..... .###. #...# #...# #...# .###.',
  p: '..... ..... ####. #...# #...# #...# ####. #.... #....',
  q: '..... ..... .#### #...# #...# #...# .#### ....# ....#',
  r: '..... ..... #.##. ##..# #.... #.... #....',
  s: '..... ..... .###. #.... .###. ....# ####.',
  t: '.#... .#... ###.. .#... .#... .#..# ..##.',
  u: '..... ..... #...# #...# #...# #..## .##.#',
  v: '..... ..... #...# #...# #...# .#.#. ..#..',
  w: '..... ..... #...# #...# #.#.# #.#.# .#.#.',
  x: '..... ..... #...# .#.#. ..#.. .#.#. #...#',
  y: '..... ..... #...# #...# #...# #...# .#### ....# .###.',
  z: '..... ..... ##### ...#. ..#.. .#... #####',
  '{': '...#. ..#.. ..#.. .#... ..#.. ..#.. ...#.',
  '|': '..#.. ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  '}': '.#... ..#.. ..#.. ...#. ..#.. ..#.. .#...',
  '~': '..... ..... .#... #.#.# ...#. ..... .....',
};

/** First and last character codes the font covers. */
export const FIRST_CHAR = 32;
export const LAST_CHAR = 126;
export const GLYPH_COUNT = LAST_CHAR - FIRST_CHAR + 1;

/** Glyphs per row in the atlas. */
export const ATLAS_COLUMNS = 16;
/** Atlas cell size: one pixel of padding right and below each glyph. */
export const CELL_WIDTH = GLYPH_WIDTH + 1;
export const CELL_HEIGHT = GLYPH_HEIGHT + 1;
export const ATLAS_WIDTH = ATLAS_COLUMNS * CELL_WIDTH;
export const ATLAS_HEIGHT = Math.ceil(GLYPH_COUNT / ATLAS_COLUMNS) * CELL_HEIGHT;

/** The atlas index of a character code, falling back to '?'. */
export function glyphIndex(code: number): number {
  if (code < FIRST_CHAR || code > LAST_CHAR) return '?'.charCodeAt(0) - FIRST_CHAR;
  return code - FIRST_CHAR;
}

/** The glyph's rows as 5-bit masks, most significant bit on the left, padded to 9 rows. */
export function glyphRows(char: string): number[] {
  const raw = RAW[char];
  if (raw === undefined) throw new Error(`font: no glyph for ${JSON.stringify(char)}`);
  const rows = raw.split(' ').map((row) => {
    if (!/^[.#]{5}$/.test(row)) throw new Error(`font: bad row ${JSON.stringify(row)} in ${JSON.stringify(char)}`);
    let mask = 0;
    for (let i = 0; i < 5; i++) mask = (mask << 1) | (row[i] === '#' ? 1 : 0);
    return mask;
  });
  if (rows.length < 7 || rows.length > GLYPH_HEIGHT) throw new Error(`font: ${JSON.stringify(char)} has ${rows.length} rows`);
  while (rows.length < GLYPH_HEIGHT) rows.push(0);
  return rows;
}

/** White-on-transparent RGBA pixels of the whole atlas, ATLAS_WIDTH x ATLAS_HEIGHT. */
export function buildAtlasPixels(): Uint8Array {
  const pixels = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  for (let g = 0; g < GLYPH_COUNT; g++) {
    const rows = glyphRows(String.fromCharCode(FIRST_CHAR + g));
    const x0 = (g % ATLAS_COLUMNS) * CELL_WIDTH;
    const y0 = Math.floor(g / ATLAS_COLUMNS) * CELL_HEIGHT;
    for (let y = 0; y < GLYPH_HEIGHT; y++) {
      for (let x = 0; x < GLYPH_WIDTH; x++) {
        if (((rows[y]! >> (GLYPH_WIDTH - 1 - x)) & 1) === 0) continue;
        pixels.fill(255, ((y0 + y) * ATLAS_WIDTH + x0 + x) * 4, ((y0 + y) * ATLAS_WIDTH + x0 + x) * 4 + 4);
      }
    }
  }
  return pixels;
}

/** Width in px of `text` at scale 1: no trailing gap after the last character. */
export function textWidth(text: string): number {
  const n = codePointCount(text);
  return n === 0 ? 0 : n * GLYPH_ADVANCE - 1;
}

function codePointCount(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}
