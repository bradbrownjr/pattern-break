// generateLevel: LevelData to Level (docs/PLAN.md, "Level generation"). Integer math
// only, in a fixed order, so every engine builds the same Level.

import type { LevelData } from '../level-data/types.ts';
import {
  BAR_PITCH,
  PLAYFIELD_HEIGHT,
  PLAYHEAD_X,
  Q8,
  SAMPLES_PER_TICK,
  SEGMENT_PITCH,
} from '../playfield.ts';
import { SHIP_HITBOX_HEIGHT, SHIP_SPEED_Q8 } from '../sim/constants.ts';
import { GEN_VERSION } from '../version.ts';
import { Difficulty, PEAK_HOLD_BARS, type DifficultyName, type Level } from './types.ts';

/**
 * Consecutive gaps must overlap by at least this many px, so the ship's hitbox fits
 * while it straddles two bars (it is wider than a bar's 2 px opening).
 */
export const MIN_GAP_OVERLAP_PX = SHIP_HITBOX_HEIGHT + 4;

const BAR_PITCH_Q8 = BAR_PITCH * Q8;

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

/**
 * World x in Q8 of the playhead at song sample `s`. Bar i's left edge is at world x
 * i * BAR_PITCH, and the playhead moves from bar i to bar i + 1 linearly over row i:
 *
 *   x(s) = i * BAR_PITCH_Q8 + floor(BAR_PITCH_Q8 * (s - start[i]) / (end[i] - start[i]))
 *
 * where i is the last row with start[i] <= s and end[i] is the next row's start (or
 * totalSamples for the last row). Before row 0 it is 0; from totalSamples on it is
 * barCount * BAR_PITCH_Q8.
 */
export function playheadAtSample(
  barStartSample: Uint32Array,
  totalSamples: number,
  s: number,
  /** Any row index at or before the answer, to start the search from. */
  hint = 0,
): number {
  const n = barStartSample.length;
  if (n === 0 || s <= barStartSample[0]!) return 0;
  if (s >= totalSamples) return n * BAR_PITCH_Q8;
  let i = hint;
  while (i + 1 < n && barStartSample[i + 1]! <= s) i++;
  const start = barStartSample[i]!;
  const end = i + 1 < n ? barStartSample[i + 1]! : totalSamples;
  if (end <= start) return (i + 1) * BAR_PITCH_Q8;
  return i * BAR_PITCH_Q8 + Math.floor((BAR_PITCH_Q8 * (s - start)) / (end - start));
}

/**
 * The LED level of `band` for the row spanning samples [start, end): the maximum over the
 * analysis frames whose window centre ((f + 1) * hop - fftSize / 2) lies in the span. If
 * none does, the frame whose centre is nearest `start` (the earlier one on a tie).
 */
function rowBandLevel(
  levels: Uint8Array,
  frameCount: number,
  bandCount: number,
  hop: number,
  half: number,
  band: number,
  start: number,
  end: number,
): number {
  if (frameCount === 0) return 0;
  // First frame with centre >= x is ceil((x + half) / hop) - 1.
  const firstAtOrAfter = (x: number): number => Math.floor((x + half + hop - 1) / hop) - 1;
  const lo = Math.max(0, firstAtOrAfter(start));
  const hi = Math.min(frameCount, Math.max(0, firstAtOrAfter(end)));
  if (lo < hi) {
    let max = 0;
    for (let f = lo; f < hi; f++) {
      const v = levels[f * bandCount + band]!;
      if (v > max) max = v;
    }
    return max;
  }
  let f = lo;
  if (f > 0) {
    const after = (f + 1) * hop - half - start;
    const before = start - (f * hop - half);
    if (before <= after) f--;
  }
  if (f > frameCount - 1) f = frameCount - 1;
  return levels[f * bandCount + band]!;
}

export function generateLevel(levelData: LevelData, difficulty: DifficultyName): Level {
  const settings = Difficulty[difficulty];
  const { hopFrames, fftSize, bandCount } = levelData.params;
  const { frameCount, spectrumLeft, spectrumRight } = levelData.frames;
  const totalSamples = levelData.totalSamples;
  const barStartSample = levelData.rows.timeSamples.slice();
  const barCount = barStartSample.length;
  const half = fftSize / 2;

  const ceiling = new Uint8Array(barCount);
  const floor = new Uint8Array(barCount);
  const ceilingPeak = new Uint8Array(barCount);
  const floorPeak = new Uint8Array(barCount);

  const maxSum = maxCombinedSegments(difficulty);
  let prevCentre2 = PLAYFIELD_HEIGHT; // twice the gap centre's y; the open screen's centre
  let prevLength = 0;
  let peakC = 0;
  let holdC = 0;
  let peakF = 0;
  let holdF = 0;

  for (let i = 0; i < barCount; i++) {
    const start = barStartSample[i]!;
    const end = i + 1 < barCount ? barStartSample[i + 1]! : totalSamples;
    const slot = i % bandCount;
    let c = rowBandLevel(spectrumLeft, frameCount, bandCount, hopFrames, half, slot, start, end);
    let f = rowBandLevel(spectrumRight, frameCount, bandCount, hopFrames, half, bandCount - 1 - slot, start, end);

    // 1. Minimum gap: cut both sides in proportion. The ceiling gets round(c * maxSum /
    //    (c + f)), halves rounding up, and the floor gets the rest.
    const sum = c + f;
    if (sum > maxSum) {
      c = Math.floor((2 * c * maxSum + sum) / (2 * sum));
      f = maxSum - c;
    }

    // 2. Gap movement: the gap's centre may move from the previous bar's by at most what
    //    the ship covers vertically in the previous row's time, and never by so much that
    //    consecutive gaps overlap by less than MIN_GAP_OVERLAP_PX. Only the side the gap
    //    moved toward is cut; once that side is 0 the new gap contains the old one.
    const limit2 = i > 0 ? 2 * gapShiftLimitPx(prevLength, difficulty) : 0;
    if (i > 0) {
      let shift2 = SEGMENT_PITCH * (c - f) + PLAYFIELD_HEIGHT - prevCentre2;
      while (shift2 > limit2 && c > 0) {
        c--;
        shift2 -= SEGMENT_PITCH;
      }
      while (shift2 < -limit2 && f > 0) {
        f--;
        shift2 += SEGMENT_PITCH;
      }
    }

    // 3. Peak hold: a new high resets the hold; after PEAK_HOLD_BARS bars it falls one
    //    segment per bar until the level catches it.
    if (c >= peakC) {
      peakC = c;
      holdC = PEAK_HOLD_BARS;
    } else if (holdC > 0) {
      holdC--;
    } else {
      peakC--;
    }
    if (f >= peakF) {
      peakF = f;
      holdF = PEAK_HOLD_BARS;
    } else if (holdF > 0) {
      holdF--;
    } else {
      peakF--;
    }

    // 4. Peak dots never close the minimum gap either: lower the ceiling peak first, then
    //    the floor peak. Levels already fit, so this always succeeds.
    let excess = peakC + peakF - maxSum;
    if (excess > 0) {
      const dc = Math.min(excess, peakC - c);
      peakC -= dc;
      excess -= dc;
      peakF -= excess;
    }

    // 5. With solid peaks the solid extent of a side is its peak, so the gap movement
    //    rule of step 2 is applied again to the peaks. A peak is lowered first; once it
    //    is down to its level, both go down together.
    if (settings.solidPeaks && i > 0) {
      let shift2 = SEGMENT_PITCH * (peakC - peakF) + PLAYFIELD_HEIGHT - prevCentre2;
      while (shift2 > limit2 && peakC > 0) {
        if (c === peakC) c--;
        peakC--;
        shift2 -= SEGMENT_PITCH;
      }
      while (shift2 < -limit2 && peakF > 0) {
        if (f === peakF) f--;
        peakF--;
        shift2 += SEGMENT_PITCH;
      }
    }

    ceiling[i] = c;
    floor[i] = f;
    ceilingPeak[i] = peakC;
    floorPeak[i] = peakF;
    prevCentre2 = settings.solidPeaks
      ? SEGMENT_PITCH * (peakC - peakF) + PLAYFIELD_HEIGHT
      : SEGMENT_PITCH * (c - f) + PLAYFIELD_HEIGHT;
    prevLength = end - start;
  }

  const tickCount = Math.floor((totalSamples + SAMPLES_PER_TICK - 1) / SAMPLES_PER_TICK);
  const scroll = new Int32Array(tickCount + 1);
  let hint = 0;
  for (let t = 0; t <= tickCount; t++) {
    const s = t * SAMPLES_PER_TICK;
    while (hint + 1 < barCount && barStartSample[hint + 1]! <= s) hint++;
    scroll[t] = playheadAtSample(barStartSample, totalSamples, s, hint) - PLAYHEAD_X * Q8;
  }

  return {
    genVersion: GEN_VERSION,
    difficulty,
    totalSamples,
    barCount,
    barStartSample,
    ceiling,
    floor,
    ceilingPeak,
    floorPeak,
    tickCount,
    scroll,
  };
}
