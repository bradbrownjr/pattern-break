// Pure geometry for drawing the LED terrain, kept apart from Pixi so Node tests can check
// it against the rules in docs/DEVELOPMENT.md, "Level and sim".

import {
  BAR_LIT_WIDTH,
  BAR_PITCH,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
  Q8,
  SAMPLES_PER_TICK,
  SEGMENT_LIT_HEIGHT,
  SEGMENT_PITCH,
  maxCombinedSegments,
  type DifficultyName,
  Difficulty,
  type Level,
} from '@game/core';

/** The most segments one side can have, on any difficulty. */
export const SEGMENTS_PER_SIDE = Math.max(...(Object.keys(Difficulty) as DifficultyName[]).map((d) => maxCombinedSegments(d)));

/** The most bars that can be on screen at once, partly or wholly. */
export const MAX_VISIBLE_BARS = Math.ceil((PLAYFIELD_WIDTH + BAR_LIT_WIDTH) / BAR_PITCH) + 1;

/**
 * World x of the screen's left edge, in px, at song sample `samples`. Whole ticks read
 * `level.scroll`; between ticks the table is interpolated linearly (cosmetic only: the sim
 * reads whole ticks).
 */
export function scrollPxAt(level: Level, samples: number): number {
  if (samples <= 0) return level.scroll[0]! / Q8;
  const t = Math.floor(samples / SAMPLES_PER_TICK);
  if (t >= level.tickCount) return level.scroll[level.tickCount]! / Q8;
  const frac = (samples - t * SAMPLES_PER_TICK) / SAMPLES_PER_TICK;
  const a = level.scroll[t]!;
  const b = level.scroll[t + 1]!;
  return (a + (b - a) * frac) / Q8;
}

/** A range of bar indices, [first, end). */
export interface BarRange {
  first: number;
  end: number;
}

/**
 * Writes into `out` the range of bar indices with any part on screen at scroll
 * `scrollPx`, and returns it. Taking `out` keeps the per-frame path free of allocation.
 */
export function visibleBars(level: Level, scrollPx: number, out: BarRange = { first: 0, end: 0 }): BarRange {
  // Bar i covers screen x [10i - scroll, 10i - scroll + 8).
  let first = Math.floor((scrollPx - BAR_LIT_WIDTH) / BAR_PITCH) + 1;
  let end = Math.ceil((scrollPx + PLAYFIELD_WIDTH) / BAR_PITCH);
  if (first < 0) first = 0;
  if (end > level.barCount) end = level.barCount;
  if (end < first) end = first;
  out.first = first;
  out.end = end;
  return out;
}

export const SEGMENT_HIDDEN = 0;
export const SEGMENT_LIT = 1;
export const SEGMENT_PEAK = 2;

/**
 * Whether segment k (0 at the screen edge) of a side with `level` lit and `peak` is lit, a
 * peak dot, or not drawn. Unlit segments are not drawn, so the open passage is plain
 * background (2026-11-09).
 */
export function segmentState(level: number, peak: number, k: number): number {
  if (k < level) return SEGMENT_LIT;
  if (peak > level && k === peak - 1) return SEGMENT_PEAK;
  return SEGMENT_HIDDEN;
}

/** The lit colour index of segment k: green at the screen edge to red 12 segments in, then red. */
export function segmentColorIndex(k: number): number {
  return k < 11 ? k : 11;
}

/** Top screen y of ceiling segment k. */
export function ceilingSegmentY(k: number): number {
  return k * SEGMENT_PITCH;
}

/** Top screen y of floor segment k (the mirror image of the ceiling's). */
export function floorSegmentY(k: number): number {
  return PLAYFIELD_HEIGHT - k * SEGMENT_PITCH - SEGMENT_LIT_HEIGHT;
}
