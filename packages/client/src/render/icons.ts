// Pixel maps shared by the HUD (combat.ts) and the on-screen touch buttons (game/touch.ts),
// so a button shows the same symbol as the HUD. One character a pixel: '.' is clear, the
// rest are ICON_COLORS keys. No Pixi here, so the DOM side can draw them too.

import { AMBER, CYAN, LIME, MAGENTA, VIOLET, WHITE } from './palette.ts';

export const ICON_COLORS: Record<string, number> = { m: MAGENTA, w: WHITE, a: AMBER, l: LIME, g: 0x3c7a1a, c: CYAN, v: VIOLET };

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
