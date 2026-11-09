// The path rules shared by the level generator, enemy placement and the path check
// (docs/PLAN.md, "Always a path").

import { BAR_PITCH, PLAYFIELD_HEIGHT, Q8, SAMPLES_PER_TICK, SEGMENT_PITCH } from '../playfield.ts';
import { ENEMY_EXIT_X, SHIP_HITBOX_HEIGHT, SHIP_SPEED_Q8, TANK_SPEED_Q8, TANK_WIDTH } from '../sim/constants.ts';
import { Difficulty, type DifficultyName } from './types.ts';

/**
 * Consecutive gaps must overlap by at least this many px, so the ship's hitbox fits
 * while it straddles two bars (it is wider than a bar's 2 px opening).
 */
export const MIN_GAP_OVERLAP_PX = SHIP_HITBOX_HEIGHT + 4;


/** The most lit segments ceiling and floor may have together at this difficulty. */
export function maxCombinedSegments(difficulty: DifficultyName): number {
  return Math.floor((PLAYFIELD_HEIGHT - Difficulty[difficulty].minGapPx) / SEGMENT_PITCH);
}

/**
 * How far, in px, the gap centre may move from one bar to the next, where the earlier
 * bar's row lasts `rowSamples`: the ship's straight vertical travel in that time
 * (SHIP_SPEED_Q8 per tick, rounded down to whole px), but no more than the minimum gap
 * minus MIN_GAP_OVERLAP_PX, so that consecutive gaps always overlap by that much.
 */
export function gapShiftLimitPx(rowSamples: number, difficulty: DifficultyName): number {
  const travel = Math.floor((SHIP_SPEED_Q8 * rowSamples) / (SAMPLES_PER_TICK * Q8));
  const cap = Difficulty[difficulty].minGapPx - MIN_GAP_OVERLAP_PX;
  return travel < cap ? travel : cap;
}

const BAR_PITCH_Q8 = BAR_PITCH * Q8;

/**
 * The tick a tank that appears at `spawnTick` with its centre at world x `x0` (Q8) has
 * gone off the left of the screen, or the song's last tick. Tanks drive left at
 * TANK_SPEED_Q8 per tick on top of the scroll; the sim moves them the same way.
 */
export function tankExitTick(scroll: Int32Array, tickCount: number, x0: number, spawnTick: number): number {
  let t = spawnTick;
  while (t < tickCount && x0 - TANK_SPEED_Q8 * (t - spawnTick) - scroll[t]! >= ENEMY_EXIT_X * Q8) t++;
  return t;
}

/**
 * The bars a tank's hitbox can overlap on its way from world x `x0` to `x1` (centre, Q8,
 * x1 <= x0), as [first, last]. A tank rides the floor of the bar under its centre, so the
 * bars beside that one are covered too.
 */
export function tankBars(x0: number, x1: number): [number, number] {
  const half = (TANK_WIDTH * Q8) / 2;
  return [Math.floor((x1 - half) / BAR_PITCH_Q8) - 1, Math.floor((x0 + half - 1) / BAR_PITCH_Q8) + 1];
}

/**
 * The floor that counts as solid at bar j under a tank's track: the highest floor among
 * bars j - 1 to j + 1 (the tank sits on whichever its centre is over) plus the one segment
 * the tank stands in. `floor` is the solid floor without enemies.
 */
export function floorUnderTank(floor: ArrayLike<number>, j: number): number {
  let m = floor[j]!;
  if (j > 0 && floor[j - 1]! > m) m = floor[j - 1]!;
  if (j + 1 < floor.length && floor[j + 1]! > m) m = floor[j + 1]!;
  return m + 1;
}
