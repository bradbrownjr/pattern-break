// Pixel maps shared by the HUD (combat.ts) and the on-screen touch buttons (game/touch.ts),
// so a button shows the same symbol as the HUD. One character a pixel: '.' is clear, the
// rest are ICON_COLORS keys. No Pixi here, so the DOM side can draw them too.

import { GLYPH_ADVANCE, GLYPH_HEIGHT, GLYPH_WIDTH, glyphRows, textWidth } from './font.ts';
import { AMBER, BACKGROUND, CYAN, LIME, MAGENTA, VIOLET, WHITE } from './palette.ts';

export const ICON_COLORS: Record<string, number> = { m: MAGENTA, w: WHITE, a: AMBER, l: LIME, g: 0x3c7a1a, c: CYAN, v: VIOLET, k: BACKGROUND };

/** The bomb in the HUD. */
export const BOMB_ICON_MAP = [
  '....ww.',
  '...w...',
  '..aaa..',
  '.aaaaa.',
  '.aawaa.',
  '.aaaaa.',
  '..aaa..',
];
/** The missile in the HUD, shown once bought. */
export const MISSILE_ICON_MAP = [
  '.......',
  '..cc...',
  'mcccccw',
  'mccccww',
  'mcccccw',
  '..cc...',
  '.......',
];
/** A nuke held, in the HUD. */
export const NUKE_MAP = [
  '..aaa..',
  '.a...a.',
  'a.w.w.a',
  'a..w..a',
  'a.w.w.a',
  '.a...a.',
  '..aaa..',
];
/** Fire, on the touch buttons: three of the ship's shots. */
export const FIRE_ICON_MAP = [
  '.......',
  'ccc....',
  '.......',
  '..ccc..',
  '.......',
  '....ccc',
  '.......',
];
/** Boost, on the touch buttons: two chevrons in the controls screen's boost colour. */
export const BOOST_ICON_MAP = [
  '.......',
  'v..v...',
  '.v..v..',
  '..v..v.',
  '.v..v..',
  'v..v...',
  '.......',
];
/** Double, in the HUD and on its capsule: a shot ahead and the angled one above it. */
export const DOUBLE_ICON_MAP = [
  '......c',
  '.....c.',
  '....c..',
  '...c...',
  '.......',
  'ccccccw',
  '.......',
];
/** Shield, on its capsule and in the help: a crest. */
export const SHIELD_ICON_MAP = [
  'ccccccc',
  'cwwwwwc',
  'cwwwwwc',
  'cwwwwwc',
  '.cwwwc.',
  '..cwc..',
  '...c...',
];
/** A drone, in the HUD and on its capsule. */
export const DRONE_ICON_MAP = [
  '..ccc..',
  '.cwwwc.',
  'cwwwwwc',
  'cwwwwwc',
  'cwwwwwc',
  '.cwwwc.',
  '..ccc..',
];
/** The laser, in the HUD and on its capsule: a white beam with a cyan glow. */
export const LASER_ICON_MAP = [
  '.......',
  '.......',
  'ccccccc',
  'wwwwwww',
  'ccccccc',
  '.......',
  '.......',
];

/** Each power-up's icon, in PowerUp order (double, missile, shield, drone, laser, boost). */
export const POWER_UP_ICON_MAPS: readonly (readonly string[])[] = [
  DOUBLE_ICON_MAP,
  MISSILE_ICON_MAP,
  SHIELD_ICON_MAP,
  DRONE_ICON_MAP,
  LASER_ICON_MAP,
  BOOST_ICON_MAP,
];

/**
 * A capsule showing the power-up it unlocks: `icon` (7 x 7) on a dark face inside an amber
 * frame with cut corners, 9 x 9.
 */
export function capsuleMap(icon: readonly string[]): string[] {
  const edge = `.${'a'.repeat(icon[0]!.length)}.`;
  return [edge, ...icon.map((row) => `a${row.replaceAll('.', 'k')}a`), edge];
}

/** Pause, on the touch buttons. */
export const PAUSE_ICON_MAP = [
  '.......',
  '.ww.ww.',
  '.ww.ww.',
  '.ww.ww.',
  '.ww.ww.',
  '.ww.ww.',
  '.......',
];

/** `map` as an SVG document string, one rect per pixel, for a DOM element's background. */
export function iconSvg(map: readonly string[], colors: Record<string, number> = ICON_COLORS): string {
  const w = map[0]!.length;
  const h = map.length;
  let rects = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = colors[map[y]![x]!];
      if (c === undefined) continue;
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="#${c.toString(16).padStart(6, '0')}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`;
}

/**
 * `text` in the game's pixel font as an SVG, one rect a lit pixel, for a labelled touch
 * button. Its viewBox is textWidth(text) by GLYPH_HEIGHT.
 */
export function labelSvg(text: string, color: number): string {
  const fill = `#${color.toString(16).padStart(6, '0')}`;
  let rects = '';
  let x0 = 0;
  for (const char of text) {
    const rows = glyphRows(char);
    for (let y = 0; y < GLYPH_HEIGHT; y++) {
      for (let x = 0; x < GLYPH_WIDTH; x++) {
        if (((rows[y]! >> (GLYPH_WIDTH - 1 - x)) & 1) !== 0) rects += `<rect x="${x0 + x}" y="${y}" width="1" height="1"/>`;
      }
    }
    x0 += GLYPH_ADVANCE;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${textWidth(text)} ${GLYPH_HEIGHT}" shape-rendering="crispEdges" fill="${fill}">${rects}</svg>`;
}
