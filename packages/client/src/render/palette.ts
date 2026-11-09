// The game's colours (docs/PLAN.md, "Visual spec"): a near-black background with neon
// cyan, magenta, lime and amber accents, and LED segments that go green to amber to red
// with height. Colours are 0xRRGGBB numbers, the form Pixi tints take.

export const BACKGROUND = 0x07080f;
export const LETTERBOX = '#000000';

export const CYAN = 0x2de2e6;
export const MAGENTA = 0xff3bd4;
export const LIME = 0x9dff3a;
export const AMBER = 0xffb000;
export const WHITE = 0xffffff;
export const GREY = 0x8a8fa8;
export const DIM_GREY = 0x4a4e66;

/** Lit colour of LED segment k, counted from the screen edge (k = 0) towards the gap. */
export const LED_LIT: readonly number[] = [
  0x20e050, 0x30e850, 0x48f048, 0x68f040, 0x90f038, 0xb8f030, 0xe0e828, 0xffd020, 0xffa818, 0xff7c18, 0xff4c20,
  0xff2030,
];

/** Peak-hold dots are white. */
export const LED_PEAK = WHITE;

/** Mixes `color` towards `base` (0 gives base, 256 gives color), per channel, in integers. */
export function mix(base: number, color: number, amount256: number): number {
  let out = 0;
  for (let shift = 0; shift <= 16; shift += 8) {
    const b = (base >> shift) & 0xff;
    const c = (color >> shift) & 0xff;
    out |= ((b + (((c - b) * amount256) >> 8)) & 0xff) << shift;
  }
  return out;
}

/** Unlit segments: the lit colour at about 12% over the background. */
export const LED_DIM: readonly number[] = LED_LIT.map((c) => mix(BACKGROUND, c, 30));
