// Pixel maps shared by the HUD (combat.ts) and the on-screen touch buttons (game/touch.ts),
// so a button shows the same symbol as the HUD. One character a pixel: '.' is clear, the
// rest are ICON_COLORS keys. No Pixi here, so the DOM side can draw them too.

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


// The touch keys off play (game/touch.ts, Brad, 2026-11-12: icons, not words). The key a
// screen's confirm is on is lime, Back white, the rest cyan.

/** Select, Keep: a tick. */
export const SELECT_ICON_MAP = [
  '.......',
  '......l',
  '.....ll',
  'l...ll.',
  'll.ll..',
  '.lll...',
  '..l....',
];
/** Back: an arrow turning back to the left. */
export const BACK_ICON_MAP = [
  '..w....',
  '.ww....',
  'wwwwww.',
  '.ww...w',
  '..w...w',
  '......w',
  '..wwww.',
];
/** Retry: a circle closing on its arrow. */
export const RETRY_ICON_MAP = [
  '..lll.l',
  '.l...ll',
  'l...lll',
  'l......',
  'l.....l',
  '.l...l.',
  '..lll..',
];
/** Title: home. */
export const TITLE_ICON_MAP = [
  '...w...',
  '..www..',
  '.wwwww.',
  'wwwwwww',
  '.ww.ww.',
  '.ww.ww.',
  '.ww.ww.',
];
/** Next, and Credits after the last level: an arrow on. */
export const NEXT_ICON_MAP = [
  '...l...',
  '...ll..',
  'llllll.',
  'lllllll',
  'llllll.',
  '...ll..',
  '...l...',
];
/** Replay: play. */
export const REPLAY_ICON_MAP = [
  '.c.....',
  '.cc....',
  '.ccc...',
  '.cccc..',
  '.ccc...',
  '.cc....',
  '.c.....',
];
/** Save: down into a tray. */
export const SAVE_ICON_MAP = [
  '...c...',
  '...c...',
  '.c.c.c.',
  '..ccc..',
  '...c...',
  'c.....c',
  'ccccccc',
];
/** Post a name: up out of a tray. */
export const POST_ICON_MAP = [
  '...l...',
  '..lll..',
  '.l.l.l.',
  '...l...',
  '...l...',
  'l.....l',
  'lllllll',
];
/** Skip: on to the end. */
export const SKIP_ICON_MAP = [
  '.......',
  '.w...w.',
  '.ww..w.',
  '.www.w.',
  '.ww..w.',
  '.w...w.',
  '.......',
];
/** Name: a letter and a text cursor, for the keyboard it opens. */
export const NAME_ICON_MAP = [
  '.c..www',
  'c.c..w.',
  'c.c..w.',
  'ccc..w.',
  'c.c..w.',
  'c.c..w.',
  '....www',
];
/** Remove an imported song: a bin; magenta to confirm. */
export const REMOVE_ICON_MAP = [
  '..www..',
  'wwwwwww',
  '.w.w.w.',
  '.w.w.w.',
  '.w.w.w.',
  '.w.w.w.',
  '.wwwww.',
];
export const REMOVE_ARMED_ICON_MAP = REMOVE_ICON_MAP.map((row) => row.replaceAll('w', 'm'));
/** Stop a replay. */
export const STOP_ICON_MAP = [
  '.......',
  '.wwwww.',
  '.wwwww.',
  '.wwwww.',
  '.wwwww.',
  '.wwwww.',
  '.......',
];
