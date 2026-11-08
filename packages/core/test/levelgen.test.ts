import { describe, expect, it } from 'vitest';
import {
  gapShiftLimitPx,
  generateLevel,
  maxCombinedSegments,
  playheadAtSample,
} from '../src/levelgen/generate.ts';
import { findPathViolation } from '../src/levelgen/path-check.ts';
import { serializeLevel } from '../src/levelgen/serialize.ts';
import { Difficulty, PEAK_HOLD_BARS, type DifficultyName, type Level } from '../src/levelgen/types.ts';
import { PLAYFIELD_HEIGHT, PLAYHEAD_X, SAMPLES_PER_TICK, SEGMENT_PITCH } from '../src/playfield.ts';
import { lcg, syntheticLevelData } from './level-fixtures.ts';

const difficulties = Object.keys(Difficulty) as DifficultyName[];

function expectAlwaysAPath(level: Level): void {
  expect(findPathViolation(level)).toBe('');
}

const repeat = (n: number, v: number): number[] => Array.from({ length: n }, () => v);
const quiet = { left: () => 0, right: () => 0 };

describe('generateLevel', () => {
  it('maps bar i to left band i mod 16 on the ceiling and right band 15 - i mod 16 on the floor', () => {
    // Small levels and long rows, so neither the gap nor the movement rule cuts anything.
    const level = generateLevel(
      syntheticLevelData({
        rowLengths: repeat(40, 48_000),
        left: (_f, b) => b % 5,
        right: (_f, b) => (b * 3) % 4,
      }),
      'easy',
    );
    expect(level.barCount).toBe(40);
    for (let i = 0; i < 39; i++) {
      expect(level.ceiling[i], `bar ${i}`).toBe((i % 16) % 5);
      expect(level.floor[i], `bar ${i}`).toBe(((15 - (i % 16)) * 3) % 4);
    }
  });

  it('takes the maximum over the frames in a row, or the nearest frame for a short row', () => {
    // Frame f's window centre is at (f + 1) * 800 - 1024: frame 1 at 576, frame 2 at 1376, ...
    const peaks = [1, 2, 5, 3, 1];
    const left = (f: number, b: number): number => (b === 0 ? (peaks[f] ?? (f % 7) + 1) : 0);
    // Row 0 spans [0, 2400): centres 576, 1376 and 2176 (frames 1 to 3), so max(2, 5, 3).
    expect(generateLevel(syntheticLevelData({ rowLengths: [2400, 800], ...quiet, left }), 'easy').ceiling[0]).toBe(5);
    // Row 16 (slot 0 again) spans [120100, 120400) and holds no centre. Frame 150 (119776)
    // is 324 samples before its start and frame 151 (120576) 476 after, so frame 150 is used.
    // The 8000-sample rows before it let the gap move up to 30 px, so nothing is cut.
    const level = generateLevel(
      syntheticLevelData({ rowLengths: [100, ...repeat(15, 8000), 300, 3000], ...quiet, left }),
      'easy',
    );
    expect(level.ceiling[16]).toBe(left(150, 0));
    expect(left(150, 0)).not.toBe(left(151, 0));
    // A song too short for any frame reads 0.
    expect(generateLevel(syntheticLevelData({ rowLengths: [300], ...quiet, left }), 'easy').ceiling[0]).toBe(0);
  });

  it('cuts both sides in proportion to keep the minimum gap', () => {
    for (const d of difficulties) {
      const level = generateLevel(
        syntheticLevelData({ rowLengths: repeat(32, 48_000), left: () => 12, right: () => 12 }),
        d,
      );
      const max = maxCombinedSegments(d);
      expect(PLAYFIELD_HEIGHT - SEGMENT_PITCH * max).toBeGreaterThanOrEqual(Difficulty[d].minGapPx);
      for (let i = 0; i < level.barCount; i++) {
        expect(level.ceiling[i]! + level.floor[i]!).toBe(max);
        // Equal sides round half up on the ceiling.
        expect(level.ceiling[i]).toBe(Math.ceil(max / 2));
      }
    }
    // 12 and 8 at easy (17 segments): round(12 * 17 / 20) = round(10.2) = 10 on the
    // ceiling, and the floor gets the other 7.
    const uneven = generateLevel(syntheticLevelData({ rowLengths: [48_000], left: () => 12, right: () => 8 }), 'easy');
    expect(maxCombinedSegments('easy')).toBe(17);
    expect([uneven.ceiling[0], uneven.floor[0]]).toEqual([10, 7]);
  });

  it('limits how far the gap centre moves on short rows', () => {
    // Rows of 400 samples (one tick): the ship covers 1 px, so the gap may barely move.
    const level = generateLevel(
      syntheticLevelData({
        rowLengths: repeat(64, 400),
        left: (f) => (f % 2 === 0 ? 12 : 0),
        right: (f) => (f % 2 === 0 ? 0 : 12),
      }),
      'normal',
    );
    expect(gapShiftLimitPx(400, 'normal')).toBe(1);
    expectAlwaysAPath(level);
  });

  it('holds peaks for PEAK_HOLD_BARS bars, then drops them one segment per bar', () => {
    // A single loud frame early on, silence afterwards. Each row is 800 samples.
    const left = (f: number, b: number): number => (f === 0 && b === 0 ? 0 : f === 1 ? (b === 0 ? 9 : 0) : 0);
    const level = generateLevel(syntheticLevelData({ rowLengths: repeat(30, 800), ...quiet, left }), 'easy');
    // Frame 1's centre is 576, inside row 0.
    expect(level.ceiling[0]).toBe(9);
    const peaks = Array.from(level.ceilingPeak.subarray(0, 1 + PEAK_HOLD_BARS + 10));
    expect(peaks).toEqual([9, 9, 9, 9, 9, 9, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0]);
  });

  it('builds the scroll table from row times', () => {
    const level = generateLevel(syntheticLevelData({ rowLengths: [1200, 2000, 800], ...quiet }), 'easy');
    expect(level.tickCount).toBe(10);
    expect(level.scroll.length).toBe(11);
    const offset = -PLAYHEAD_X * 256;
    expect(level.scroll[0]).toBe(offset);
    // Tick 3 = sample 1200, the start of row 1.
    expect(level.scroll[3]).toBe(2560 + offset);
    // Tick 4 = sample 1600: 400 of row 1's 2000 samples.
    expect(level.scroll[4]).toBe(2560 + Math.floor((2560 * 400) / 2000) + offset);
    expect(level.scroll[10]).toBe(3 * 2560 + offset);
    for (let t = 1; t < level.scroll.length; t++) expect(level.scroll[t]!).toBeGreaterThanOrEqual(level.scroll[t - 1]!);
    expect(playheadAtSample(level.barStartSample, level.totalSamples, 3200)).toBe(2 * 2560);
    expect(playheadAtSample(level.barStartSample, level.totalSamples, 99_999)).toBe(3 * 2560);
    expect(SAMPLES_PER_TICK).toBe(400);
  });

  it.each(difficulties)('always leaves a path on random loud songs (%s)', (d) => {
    for (let seed = 1; seed <= 20; seed++) {
      const rand = lcg(seed);
      const lengths = Array.from({ length: 300 }, () => 160 * (1 + Math.floor(rand() * 60)));
      const levels = Array.from({ length: 20_000 }, () => Math.floor(rand() * 13));
      const data = syntheticLevelData({
        rowLengths: lengths,
        left: (f, b) => levels[(f * 16 + b) % levels.length]!,
        right: (f, b) => levels[(f * 16 + b + 7919) % levels.length]!,
      });
      expectAlwaysAPath(generateLevel(data, d));
    }
  });

  it('findPathViolation catches a closed gap and a jump', () => {
    const base = generateLevel(syntheticLevelData({ rowLengths: [400, 400, 400], ...quiet }), 'normal');
    expect(findPathViolation(base)).toBe('');
    const closed = { ...base, ceiling: Uint8Array.from([12, 0, 0]), ceilingPeak: Uint8Array.from([12, 12, 12]) };
    closed.floor = Uint8Array.from([12, 0, 0]);
    closed.floorPeak = Uint8Array.from([12, 12, 12]);
    expect(findPathViolation(closed)).toMatch(/bar 0: gap/);
    const jump = { ...base, ceiling: Uint8Array.from([0, 8, 0]), ceilingPeak: Uint8Array.from([0, 8, 8]) };
    expect(findPathViolation(jump)).toMatch(/bar 1: gap centre moves 28 px, limit 1 px/);
  });

  it('is deterministic', () => {
    const data = syntheticLevelData({
      rowLengths: [800, 1600, 400, 2400],
      left: (f, b) => (f + b) % 13,
      right: (f, b) => (f * b) % 13,
    });
    expect(serializeLevel(generateLevel(data, 'hard'))).toEqual(serializeLevel(generateLevel(data, 'hard')));
  });
});
