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
import { SHIP_START_Y } from '../sim/constants.ts';
import { GEN_VERSION } from '../version.ts';
import { Difficulty, PEAK_HOLD_BARS, Terrain, type DifficultyName, type Level } from './types.ts';

import { instrumentNotes, placeEnemies } from './enemies.ts';
import { MIN_GAP_OVERLAP_PX, gapShiftLimitPx, maxCombinedSegments } from './rules.ts';

export { MIN_GAP_OVERLAP_PX, gapShiftLimitPx, maxCombinedSegments };

const BAR_PITCH_Q8 = BAR_PITCH * Q8;

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

/** Instrument numbers are 0..255 (0: none). */
const INSTRUMENTS = 256;
/** Note values are 1..120. */
const NOTES = 121;

/**
 * Marks each instrument that is a drum: its three commonest pitches make up at least
 * Terrain.drumPitchPercent of its notes. Drums play a sound, not a tune, so they repeat a
 * pitch or two; the melody ignores them.
 */
export function findDrums(levelData: LevelData): Uint8Array {
  const { resolvedInstrument, note } = levelData.notes;
  const counts = new Uint32Array(INSTRUMENTS * NOTES);
  const totals = new Uint32Array(INSTRUMENTS);
  for (let k = 0; k < note.length; k++) {
    const inst = resolvedInstrument[k]!;
    counts[inst * NOTES + note[k]!]!++;
    totals[inst]!++;
  }
  const drums = new Uint8Array(INSTRUMENTS);
  for (let inst = 0; inst < INSTRUMENTS; inst++) {
    const total = totals[inst]!;
    if (total === 0) continue;
    let a = 0;
    let b = 0;
    let c = 0;
    for (let p = 0; p < NOTES; p++) {
      const v = counts[inst * NOTES + p]!;
      if (v > a) {
        c = b;
        b = a;
        a = v;
      } else if (v > b) {
        c = b;
        b = v;
      } else if (v > c) {
        c = v;
      }
    }
    if ((a + b + c) * 100 >= Terrain.drumPitchPercent * total) drums[inst] = 1;
  }
  return drums;
}

/**
 * A row's hit strength: for each channel, how far its volume meter (the louder of left and
 * right) rises from the frame before the row to its loudest frame in the row, summed over
 * channels. VU frame f is read after (f + 1) * hop samples, so the row spanning
 * [start, end) holds frames floor(start / hop) up to floor(end / hop), at least one.
 */
function rowHit(levelData: LevelData, start: number, end: number): number {
  const { frameCount, vuLeft, vuRight } = levelData.frames;
  const channels = levelData.meta.numChannels;
  const hop = levelData.params.hopFrames;
  const lo = Math.floor(start / hop);
  if (lo >= frameCount) return 0;
  let hi = Math.floor(end / hop);
  if (hi <= lo) hi = lo + 1;
  if (hi > frameCount) hi = frameCount;
  let hit = 0;
  for (let ch = 0; ch < channels; ch++) {
    let before = 0;
    if (lo > 0) {
      const l = vuLeft[(lo - 1) * channels + ch]!;
      const r = vuRight[(lo - 1) * channels + ch]!;
      before = l > r ? l : r;
    }
    let loudest = 0;
    for (let f = lo; f < hi; f++) {
      const l = vuLeft[f * channels + ch]!;
      const r = vuRight[f * channels + ch]!;
      const v = l > r ? l : r;
      if (v > loudest) loudest = v;
    }
    if (loudest > before) hit += loudest - before;
  }
  return hit;
}

/** round(x / d) for d > 0, halves rounding up, in integers. */
function roundDiv(x: number, d: number): number {
  return Math.floor((2 * x + d) / (2 * d));
}

export function generateLevel(levelData: LevelData, difficulty: DifficultyName): Level {
  const settings = Difficulty[difficulty];
  if (levelData.params.tempoPermille !== settings.tempoPermille) {
    throw new Error(
      `LevelData was analyzed at tempo ${levelData.params.tempoPermille}, ${difficulty} needs ${settings.tempoPermille}`,
    );
  }
  const totalSamples = levelData.totalSamples;
  const barStartSample = levelData.rows.timeSamples.slice();
  const barCount = barStartSample.length;
  const notes = levelData.notes;
  const drums = findDrums(levelData);

  const ceiling = new Uint8Array(barCount);
  const floor = new Uint8Array(barCount);
  const ceilingPeak = new Uint8Array(barCount);
  const floorPeak = new Uint8Array(barCount);

  const maxSum = maxCombinedSegments(difficulty);
  const minSide = Terrain.minSideSegments;
  const H2 = 2 * PLAYFIELD_HEIGHT;
  let squeeze = 0;
  let melody: number = Terrain.pivotNote;
  let nextNote = 0;
  // Twice the gap centre's y. Bar 0 reaches the ship on the first tick, so it is held to
  // the ship's start height with no movement allowed (limit 0).
  let prevCentre2 = 2 * SHIP_START_Y;
  let prevLength = 0;
  // The two previous bars' gaps, for step 6.
  let top1 = 0;
  let bottom1 = PLAYFIELD_HEIGHT;
  let top2 = 0;
  let bottom2 = PLAYFIELD_HEIGHT;
  let peakC = 0;
  let holdC = 0;
  let peakF = 0;
  let holdF = 0;

  for (let i = 0; i < barCount; i++) {
    const start = barStartSample[i]!;
    const end = i + 1 < barCount ? barStartSample[i + 1]! : totalSamples;

    // 1. Squeeze: a hit sets it at once; otherwise it falls by releaseSegments per bar.
    //    The target gap is the base gap less 7 px per squeeze segment, never under the
    //    minimum.
    const raw = Math.floor(rowHit(levelData, start, end) / Terrain.hitPerSegment);
    squeeze = raw > squeeze - Terrain.releaseSegments ? raw : squeeze - Terrain.releaseSegments;
    let gap = settings.baseGapPx - SEGMENT_PITCH * squeeze;
    if (gap < settings.minGapPx) gap = settings.minGapPx;

    // 2. Melody: the highest note a non-drum instrument starts in the row, or the last one
    //    before it. Twice the target centre is 216 less 2 * pxPerSemitone per semitone
    //    above pivotNote.
    let top = -1;
    while (nextNote < notes.timeSamples.length && notes.timeSamples[nextNote]! < end) {
      if (drums[notes.resolvedInstrument[nextNote]!] === 0 && notes.note[nextNote]! > top) top = notes.note[nextNote]!;
      nextNote++;
    }
    if (top >= 0) melody = top;
    let centre2 = PLAYFIELD_HEIGHT - 2 * Terrain.pxPerSemitone * (melody - Terrain.pivotNote);

    // 3. The centre may move from the previous bar's by what the ship covers vertically
    //    in the previous row (bar 0: not at all), and the gap stays clear of each edge by
    //    minSideSegments.
    const limit2 = i > 0 ? 2 * gapShiftLimitPx(prevLength, difficulty) : 0;
    if (centre2 > prevCentre2 + limit2) centre2 = prevCentre2 + limit2;
    if (centre2 < prevCentre2 - limit2) centre2 = prevCentre2 - limit2;
    const edge2 = gap + 2 * SEGMENT_PITCH * minSide;
    if (centre2 < edge2) centre2 = edge2;
    if (centre2 > H2 - edge2) centre2 = H2 - edge2;

    // 4. Segments: each side rounded to whole segments, at least minSide, and together at
    //    most maxSum (the larger side gives one up first, the ceiling on a tie).
    let c = roundDiv(centre2 - gap, 2 * SEGMENT_PITCH);
    let f = roundDiv(H2 - centre2 - gap, 2 * SEGMENT_PITCH);
    if (c < minSide) c = minSide;
    if (f < minSide) f = minSide;
    while (c + f > maxSum) {
      if (c >= f) c--;
      else f--;
    }

    // 5. Gap movement, exactly: rounding can move the centre past the limit, so the side
    //    the gap moved toward is cut, down to minSide. Every bar keeps minSide, so once
    //    that side is down to it the new gap contains the old one.
    let shift2 = SEGMENT_PITCH * (c - f) + PLAYFIELD_HEIGHT - prevCentre2;
    while (shift2 > limit2 && c > minSide) {
      c--;
      shift2 -= SEGMENT_PITCH;
    }
    while (shift2 < -limit2 && f > minSide) {
      f--;
      shift2 += SEGMENT_PITCH;
    }

    // 6. Three in a row: the ship's hitbox is as wide as a bar's pitch, so it touches two
    //    bars nearly all the time and passes from bars (i - 2, i - 1) to (i - 1, i) in a
    //    fifth of a row. Gaps i - 2, i - 1 and i must therefore share MIN_GAP_OVERLAP_PX.
    //    The side that blocks it is cut, down to minSide; the two previous gaps already
    //    share that much, and a bar with minSide on both sides contains them.
    if (i >= 2) {
      const sharedTop = top1 > top2 ? top1 : top2;
      const sharedBottom = bottom1 < bottom2 ? bottom1 : bottom2;
      for (;;) {
        const t = SEGMENT_PITCH * c;
        const b = PLAYFIELD_HEIGHT - SEGMENT_PITCH * f;
        if ((b < sharedBottom ? b : sharedBottom) - (t > sharedTop ? t : sharedTop) >= MIN_GAP_OVERLAP_PX) break;
        if (t > sharedTop && c > minSide) c--;
        else if (b < sharedBottom && f > minSide) f--;
        else break;
      }
    }

    // 7. Peak hold: a new high resets the hold; after PEAK_HOLD_BARS bars it falls one
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

    // 8. Peak dots never close the minimum gap either: lower the ceiling peak first, then
    //    the floor peak. Levels already fit, so this always succeeds.
    let excess = peakC + peakF - maxSum;
    if (excess > 0) {
      const dc = Math.min(excess, peakC - c);
      peakC -= dc;
      excess -= dc;
      peakF -= excess;
    }

    // 9. With solid peaks the solid extent of a side is its peak, so step 5 is applied
    //    again to the peaks (steps 6 and 9 would need to agree before solid peaks return). A peak is lowered first; once it is down to its level, both
    //    go down together.
    if (settings.solidPeaks) {
      let peakShift2 = SEGMENT_PITCH * (peakC - peakF) + PLAYFIELD_HEIGHT - prevCentre2;
      while (peakShift2 > limit2 && peakC > minSide) {
        if (c === peakC) c--;
        peakC--;
        peakShift2 -= SEGMENT_PITCH;
      }
      while (peakShift2 < -limit2 && peakF > minSide) {
        if (f === peakF) f--;
        peakF--;
        peakShift2 += SEGMENT_PITCH;
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
    top2 = top1;
    bottom2 = bottom1;
    top1 = SEGMENT_PITCH * c;
    bottom1 = PLAYFIELD_HEIGHT - SEGMENT_PITCH * f;
  }

  const tickCount = Math.floor((totalSamples + SAMPLES_PER_TICK - 1) / SAMPLES_PER_TICK);
  const scroll = new Int32Array(tickCount + 1);
  let hint = 0;
  for (let t = 0; t <= tickCount; t++) {
    const s = t * SAMPLES_PER_TICK;
    while (hint + 1 < barCount && barStartSample[hint + 1]! <= s) hint++;
    scroll[t] = playheadAtSample(barStartSample, totalSamples, s, hint) - PLAYHEAD_X * Q8;
  }

  const terrain = {
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
  const byInstrument = instrumentNotes(levelData);
  return { ...terrain, enemies: placeEnemies(levelData, terrain, drums, byInstrument), ...byInstrument };
}
