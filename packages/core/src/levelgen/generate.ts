// generateLevel: LevelData to Level (docs/PLAN.md, "Level generation"). Integer math
// only, in a fixed order, so every engine builds the same Level.

import type { LevelData } from '../level-data/types.ts';
import {
  PLAYFIELD_HEIGHT,
  PLAYHEAD_X,
  Q8,
  SAMPLES_PER_TICK,
  SEGMENT_PITCH,
} from '../playfield.ts';
import { SHIP_HITBOX_HEIGHT, SHIP_SPEED_Q8, SHIP_START_Y } from '../sim/constants.ts';
import { GEN_VERSION } from '../version.ts';
import { Difficulty, PEAK_HOLD_BARS, Terrain, type DifficultyName, type Level } from './types.ts';

/**
 * Consecutive gaps must overlap by at least this many px, so the ship's hitbox fits
 * while it straddles two bars (it is wider than a bar's 2 px opening).
 */
export const MIN_GAP_OVERLAP_PX = SHIP_HITBOX_HEIGHT + 4;

/** The most solid segments ceiling and floor may have together: 25 for a 40 px gap. */
export const MAX_COMBINED_SEGMENTS = Math.floor((PLAYFIELD_HEIGHT - Terrain.minGapPx) / SEGMENT_PITCH);

/**
 * How far, in px, the gap centre may move from one bar to the next, where the earlier
 * bar's row lasts `rowSamples`: the ship's straight vertical travel in that time
 * (SHIP_SPEED_Q8 per tick, rounded down to whole px), but no more than the minimum gap
 * minus MIN_GAP_OVERLAP_PX, so that consecutive gaps always overlap by that much.
 */
export function gapShiftLimitPx(rowSamples: number): number {
  const travel = Math.floor((SHIP_SPEED_Q8 * rowSamples) / (SAMPLES_PER_TICK * Q8));
  const cap = Terrain.minGapPx - MIN_GAP_OVERLAP_PX;
  return travel < cap ? travel : cap;
}

/**
 * World x in Q8 of the playhead at song sample `s`, with bars `pitch` px apart. Bar i's
 * left edge is at world x i * pitch, and the playhead moves from bar i to bar i + 1
 * linearly over row i (P = pitch * Q8):
 *
 *   x(s) = i * P + floor(P * (s - start[i]) / (end[i] - start[i]))
 *
 * where i is the last row with start[i] <= s and end[i] is the next row's start (or
 * totalSamples for the last row). Before row 0 it is 0; from totalSamples on it is
 * barCount * P.
 */
export function playheadAtSample(
  barStartSample: Uint32Array,
  totalSamples: number,
  s: number,
  pitch: number,
  /** Any row index at or before the answer, to start the search from. */
  hint = 0,
): number {
  const pitchQ8 = pitch * Q8;
  const n = barStartSample.length;
  if (n === 0 || s <= barStartSample[0]!) return 0;
  if (s >= totalSamples) return n * pitchQ8;
  let i = hint;
  while (i + 1 < n && barStartSample[i + 1]! <= s) i++;
  const start = barStartSample[i]!;
  const end = i + 1 < n ? barStartSample[i + 1]! : totalSamples;
  if (end <= start) return (i + 1) * pitchQ8;
  return i * pitchQ8 + Math.floor((pitchQ8 * (s - start)) / (end - start));
}

/**
 * The loudest LED level of bands `firstBand` to `lastBand`, on either channel, for the row
 * spanning samples [start, end): the maximum over the analysis frames whose window centre
 * ((f + 1) * hop - fftSize / 2) lies in the span. If none does, the frame whose centre is
 * nearest `start` (the earlier one on a tie).
 */
function rowLevel(
  left: Uint8Array,
  right: Uint8Array,
  frameCount: number,
  bandCount: number,
  hop: number,
  half: number,
  firstBand: number,
  lastBand: number,
  start: number,
  end: number,
): number {
  const frameLevel = (f: number): number => {
    let max = 0;
    for (let b = firstBand; b <= lastBand; b++) {
      const l = left[f * bandCount + b]!;
      const r = right[f * bandCount + b]!;
      if (l > max) max = l;
      if (r > max) max = r;
    }
    return max;
  };
  if (frameCount === 0) return 0;
  // First frame with centre >= x is ceil((x + half) / hop) - 1.
  const firstAtOrAfter = (x: number): number => Math.floor((x + half + hop - 1) / hop) - 1;
  const lo = Math.max(0, firstAtOrAfter(start));
  const hi = Math.min(frameCount, Math.max(0, firstAtOrAfter(end)));
  if (lo < hi) {
    let max = 0;
    for (let f = lo; f < hi; f++) {
      const v = frameLevel(f);
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
  return frameLevel(f);
}

/** Meter segments for an LED level: gain * (level - threshold), clamped to 0..meterSegments. */
function meterSegments(level: number, side: { readonly threshold: number; readonly gain: number }): number {
  const v = side.gain * (level - side.threshold);
  if (v < 0) return 0;
  return v > Terrain.meterSegments ? Terrain.meterSegments : v;
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

  const maxSum = MAX_COMBINED_SEGMENTS;
  const rock = Terrain.rockSegments;
  const pitch = settings.barPitch;
  let meterC = 0;
  let meterF = 0;
  // Twice the gap centre's y. Bar 0 reaches the ship on the first tick, so it is held to
  // the ship's start height with no movement allowed (limit 0).
  let prevCentre2 = 2 * SHIP_START_Y;
  let prevLength = 0;
  let peakC = 0;
  let holdC = 0;
  let peakF = 0;
  let holdF = 0;

  for (let i = 0; i < barCount; i++) {
    const start = barStartSample[i]!;
    const end = i + 1 < barCount ? barStartSample[i + 1]! : totalSamples;
    const hi = Terrain.ceiling;
    const lo = Terrain.floor;
    const levelC = rowLevel(spectrumLeft, spectrumRight, frameCount, bandCount, hopFrames, half, hi.firstBand, hi.lastBand, start, end);
    const levelF = rowLevel(spectrumLeft, spectrumRight, frameCount, bandCount, hopFrames, half, lo.firstBand, lo.lastBand, start, end);

    // 1. Meters: a louder row sets the meter at once; a quieter one lets it fall by at
    //    most decaySegments. Each side is its rock plus its meter.
    const rawC = meterSegments(levelC, hi);
    const rawF = meterSegments(levelF, lo);
    meterC = rawC > meterC - Terrain.decaySegments ? rawC : meterC - Terrain.decaySegments;
    meterF = rawF > meterF - Terrain.decaySegments ? rawF : meterF - Terrain.decaySegments;
    let c = rock + meterC;
    let f = rock + meterF;

    // 2. Minimum gap: cut both sides in proportion. The ceiling gets round(c * maxSum /
    //    (c + f)), halves rounding up, and the floor gets the rest. Neither side falls to
    //    its rock: a cut needs c + f > maxSum, and each side is at most rock + meter.
    const sum = c + f;
    if (sum > maxSum) {
      c = Math.floor((2 * c * maxSum + sum) / (2 * sum));
      f = maxSum - c;
    }

    // 3. Gap movement: the gap's centre may move from the previous bar's by at most what
    //    the ship covers vertically in the previous row's time, and never by so much that
    //    consecutive gaps overlap by less than MIN_GAP_OVERLAP_PX. Only the side the gap
    //    moved toward is cut, down to its rock. Every bar has at least the rock, so once
    //    that side is down to it the new gap contains the old one. Bar 0 is measured from
    //    the ship's start with a limit of 0, so the larger side is cut to match the other.
    const limit2 = i > 0 ? 2 * gapShiftLimitPx(prevLength) : 0;
    let shift2 = SEGMENT_PITCH * (c - f) + PLAYFIELD_HEIGHT - prevCentre2;
    while (shift2 > limit2 && c > rock) {
      c--;
      shift2 -= SEGMENT_PITCH;
    }
    while (shift2 < -limit2 && f > rock) {
      f--;
      shift2 += SEGMENT_PITCH;
    }

    // 4. Peak hold: a new high resets the hold; after PEAK_HOLD_BARS bars it falls one
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

    // 5. Peak dots never close the minimum gap either: lower the ceiling peak first, then
    //    the floor peak. Levels already fit, so this always succeeds.
    let excess = peakC + peakF - maxSum;
    if (excess > 0) {
      const dc = Math.min(excess, peakC - c);
      peakC -= dc;
      excess -= dc;
      peakF -= excess;
    }

    // 6. With solid peaks the solid extent of a side is its peak, so the gap movement
    //    rule of step 3 is applied again to the peaks, down to the rock. A peak is lowered first; once it
    //    is down to its level, both go down together.
    if (settings.solidPeaks) {
      let shift2 = SEGMENT_PITCH * (peakC - peakF) + PLAYFIELD_HEIGHT - prevCentre2;
      while (shift2 > limit2 && peakC > rock) {
        if (c === peakC) c--;
        peakC--;
        shift2 -= SEGMENT_PITCH;
      }
      while (shift2 < -limit2 && peakF > rock) {
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
    scroll[t] = playheadAtSample(barStartSample, totalSamples, s, pitch, hint) - PLAYHEAD_X * Q8;
  }

  return {
    genVersion: GEN_VERSION,
    difficulty,
    totalSamples,
    barCount,
    barPitch: pitch,
    barStartSample,
    ceiling,
    floor,
    ceilingPeak,
    floorPeak,
    tickCount,
    scroll,
  };
}
