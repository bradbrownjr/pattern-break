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
/** The boost button on the controls screen, apart from the other action colours. */
export const VIOLET = 0x8a6cff;
export const GREY = 0x8a8fa8;
export const DIM_GREY = 0x4a4e66;

/** Lit colour of LED segment k, counted from the screen edge (k = 0) towards the gap. */
export const LED_LIT: readonly number[] = [
  0x20e050, 0x30e850, 0x48f048, 0x68f040, 0x90f038, 0xb8f030, 0xe0e828, 0xffd020, 0xffa818, 0xff7c18, 0xff4c20,
  0xff2030,
];

/**
 * Leaderboard rows: each player's row takes one of these, picked by a number from their
 * key (game/scores.ts), so a player keeps one colour on every board. The theme's neons and
 * the LED colours, with a few more in the same vein. Amber is left out, as it marks the
 * selected row, and so is grey. Each is at least 4.5:1 against BACKGROUND (WCAG's level
 * for text; test/palette.test.ts).
 */
export const PLAYER_COLOURS: readonly number[] = [
  0x2de2e6, // cyan
  0xff3bd4, // magenta
  0x9dff3a, // lime
  0x8a6cff, // violet
  0x20e050, // LED green
  0xe0e828, // LED yellow
  0xff7c18, // LED orange
  0xff4c20, // LED red
  0x48a0ff, // sky blue
  0xff6f91, // pink
  0x40ffc0, // mint
  0xc070ff, // purple
];

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

/**
 * Lit segments on Impossible (Brad, 2026-11-10: "a sinister gradient of red"): dried-blood
 * red at the screen edge brightening to a hot crimson at the tips, in place of LED_LIT.
 */
export const LED_RED: readonly number[] = Array.from({ length: 12 }, (_, k) => mix(0x3a0006, 0xff2a2a, Math.round((k * 256) / 11)));

/**
 * Lit segments with the LED colours setting on Colour-blind: cividis (Nunez, Anderton and
 * Renslow, "Optimizing colormaps with consideration for color vision deficiency to enable
 * accurate interpretation of scientific data", PLOS ONE 13(7), 2018,
 * doi:10.1371/journal.pone.0199239), dark blue to yellow, which reads nearly the same to
 * people with red-green colour blindness as to everyone else and brightens evenly. These are
 * Matplotlib 3.9.2's cividis entries 26, 46, 67, ..., 255 (0.1 to 1 in 11 steps), so the
 * segment at the screen edge stays clear of the background.
 */
export const LED_CIVIDIS: readonly number[] = [
  0x0c3470, 0x2f426d, 0x46516c, 0x5a5f6e, 0x6c6e72, 0x7e7d78, 0x928d78, 0xa79d73, 0xbcae6c, 0xd2c060, 0xe9d34e,
  0xfee838,
];

/** Unlit segments: the lit colour at about 12% over the background. */
export const LED_DIM: readonly number[] = LED_LIT.map((c) => mix(BACKGROUND, c, 30));
