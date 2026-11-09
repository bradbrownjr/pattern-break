// The "always a path" guarantee as a check: generateLevel must never produce a level that
// fails it. Tests run it on every generated level.

import { PLAYFIELD_HEIGHT, SEGMENT_PITCH } from '../playfield.ts';
import { SHIP_START_Y } from '../sim/constants.ts';
import { gapShiftLimitPx } from './generate.ts';
import { Difficulty, Terrain, type Level } from './types.ts';

/**
 * Returns a description of the first bar that breaks the guarantee, or '' if none does.
 * For each bar, with the solid extent of a side being its peak on difficulties with solid
 * peaks and its level otherwise:
 * - the open gap between ceiling and floor is at least Terrain.minGapPx, and
 * - the gap centre moves from the previous bar's by at most gapShiftLimitPx() of the
 *   previous row's length, unless the new gap contains the previous one (then the ship
 *   need not move at all). Bar 0 reaches the ship on the first tick, so its gap centre
 *   must be the ship's start height, SHIP_START_Y.
 * Peaks are never below their levels.
 */
export function findPathViolation(level: Level): string {
  const { solidPeaks } = Difficulty[level.difficulty];
  const { minGapPx } = Terrain;
  // Bar 0 is measured against a zero-height gap at the ship's start with a limit of 0.
  let prevTop = SHIP_START_Y;
  let prevBottom = SHIP_START_Y;
  for (let i = 0; i < level.barCount; i++) {
    if (level.ceilingPeak[i]! < level.ceiling[i]! || level.floorPeak[i]! < level.floor[i]!) {
      return `bar ${i}: a peak is below its level`;
    }
    const c = solidPeaks ? level.ceilingPeak[i]! : level.ceiling[i]!;
    const f = solidPeaks ? level.floorPeak[i]! : level.floor[i]!;
    const top = SEGMENT_PITCH * c;
    const bottom = PLAYFIELD_HEIGHT - SEGMENT_PITCH * f;
    if (bottom - top < minGapPx) return `bar ${i}: gap ${bottom - top} px is under ${minGapPx} px`;
    const shift2 = top + bottom - prevTop - prevBottom;
    const limit = i > 0 ? gapShiftLimitPx(level.barStartSample[i]! - level.barStartSample[i - 1]!) : 0;
    const contains = i > 0 && top <= prevTop && bottom >= prevBottom;
    if (!contains && (shift2 > 2 * limit || shift2 < -2 * limit)) {
      return `bar ${i}: gap centre moves ${shift2 / 2} px, limit ${limit} px`;
    }
    prevTop = top;
    prevBottom = bottom;
  }
  return '';
}
