// The "always a path" guarantee as a check: generateLevel must never produce a level that
// fails it. Tests run it on every generated level.

import { BAR_PITCH, PLAYFIELD_HEIGHT, Q8, SEGMENT_PITCH } from '../playfield.ts';
import { SHIP_START_Y, TANK_SPEED_Q8 } from '../sim/constants.ts';
import { MIN_GAP_OVERLAP_PX, floorUnderTank, gapShiftLimitPx, tankBars, tankExitTick } from './rules.ts';
import { Difficulty, EnemyKind, type Level } from './types.ts';

/** What the per-bar check needs of a level. */
export type PathRules = Pick<Level, 'difficulty' | 'barStartSample'>;

/**
 * Solid segments per bar on each side: the wall, plus one segment where a turret sits on the tip, and under
 * a tank's whole track the floor from floorUnderTank(). Turrets and tanks can be shot, but
 * the path never depends on it.
 */
export function solidWalls(level: Level): { ceiling: Uint8Array; floor: Uint8Array } {
  const ceiling = level.ceiling.slice();
  const base = level.floor.slice();
  const floor = base.slice();
  const e = level.enemies;
  for (let k = 0; k < e.count; k++) {
    if (e.kind[k] === EnemyKind.turret) {
      const bar = Math.floor(e.x[k]! / (BAR_PITCH * Q8));
      const side = e.side[k] === 1 ? ceiling : floor;
      const wall = e.side[k] === 1 ? level.ceiling[bar]! : level.floor[bar]!;
      if (side[bar]! < wall + 1) side[bar] = wall + 1;
    } else if (e.kind[k] === EnemyKind.tank) {
      const exit = tankExitTick(level.scroll, level.tickCount, e.x[k]!, e.spawnTick[k]!);
      const [first, last] = tankBars(e.x[k]!, e.x[k]! - TANK_SPEED_Q8 * (exit - e.spawnTick[k]!));
      for (let j = Math.max(0, first); j <= Math.min(level.barCount - 1, last); j++) {
        const f = floorUnderTank(base, j);
        if (floor[j]! < f) floor[j] = f;
      }
    }
  }
  return { ceiling, floor };
}

/**
 * Checks bar i against bars i - 1 and i - 2, with `ceiling` and `floor` the solid
 * segments per bar. Returns '' or what is wrong:
 * - the open gap between ceiling and floor is at least the difficulty's minimum, and
 * - the gap centre moves from the previous bar's by at most gapShiftLimitPx() of the
 *   previous row's length, unless the new gap contains the previous one (then the ship
 *   need not move at all). Bar 0 reaches the ship on the first tick, so its gap centre
 *   must be the ship's start height, SHIP_START_Y.
 * - every three consecutive gaps share at least MIN_GAP_OVERLAP_PX: the hitbox touches two
 *   bars nearly all the time and moves from one pair to the next almost at once.
 */
export function barPathViolation(
  rules: PathRules,
  ceiling: ArrayLike<number>,
  floor: ArrayLike<number>,
  i: number,
): string {
  const top = SEGMENT_PITCH * ceiling[i]!;
  const bottom = PLAYFIELD_HEIGHT - SEGMENT_PITCH * floor[i]!;
  const { minGapPx } = Difficulty[rules.difficulty];
  if (bottom - top < minGapPx) return `bar ${i}: gap ${bottom - top} px is under ${minGapPx} px`;
  // Bar 0 is measured against a zero-height gap at the ship's start with a limit of 0.
  const prevTop = i > 0 ? SEGMENT_PITCH * ceiling[i - 1]! : SHIP_START_Y;
  const prevBottom = i > 0 ? PLAYFIELD_HEIGHT - SEGMENT_PITCH * floor[i - 1]! : SHIP_START_Y;
  const shift2 = top + bottom - prevTop - prevBottom;
  const limit = i > 0 ? gapShiftLimitPx(rules.barStartSample[i]! - rules.barStartSample[i - 1]!, rules.difficulty) : 0;
  const contains = i > 0 && top <= prevTop && bottom >= prevBottom;
  if (!contains && (shift2 > 2 * limit || shift2 < -2 * limit)) {
    return `bar ${i}: gap centre moves ${shift2 / 2} px, limit ${limit} px`;
  }
  if (i >= 2) {
    const prevTop2 = SEGMENT_PITCH * ceiling[i - 2]!;
    const prevBottom2 = PLAYFIELD_HEIGHT - SEGMENT_PITCH * floor[i - 2]!;
    const shared = Math.min(bottom, prevBottom, prevBottom2) - Math.max(top, prevTop, prevTop2);
    if (shared < MIN_GAP_OVERLAP_PX) return `bar ${i}: bars ${i - 2} to ${i} share ${shared} px, under ${MIN_GAP_OVERLAP_PX} px`;
  }
  return '';
}

/**
 * Returns a description of the first bar that breaks the guarantee, or '' if none does:
 * every bar passes barPathViolation() with the walls from solidWalls(), turrets and tank
 * tracks included.
 */
export function findPathViolation(level: Level): string {
  const walls = solidWalls(level);
  for (let i = 0; i < level.barCount; i++) {
    const v = barPathViolation(level, walls.ceiling, walls.floor, i);
    if (v !== '') return v;
  }
  return '';
}
