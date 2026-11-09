import { describe, expect, it } from 'vitest';
import {
  MAX_COMBINED_SEGMENTS,
  gapShiftLimitPx,
  generateLevel,
  playheadAtSample,
} from '../src/levelgen/generate.ts';
import { findPathViolation } from '../src/levelgen/path-check.ts';
import { serializeLevel } from '../src/levelgen/serialize.ts';
import { Difficulty, PEAK_HOLD_BARS, Terrain, type DifficultyName, type Level } from '../src/levelgen/types.ts';
import { PLAYFIELD_HEIGHT, PLAYHEAD_X, SAMPLES_PER_TICK, SEGMENT_PITCH } from '../src/playfield.ts';
import { lcg, syntheticLevelData } from './level-fixtures.ts';

const difficulties = Object.keys(Difficulty) as DifficultyName[];
const rock = Terrain.rockSegments;

function expectAlwaysAPath(level: Level): void {
  expect(findPathViolation(level)).toBe('');
}

const repeat = (n: number, v: number): number[] => Array.from({ length: n }, () => v);
const quiet = { left: () => 0, right: () => 0 };

describe('generateLevel', () => {
  it('builds the floor from the bass bands and the ceiling from the high bands, on either channel', () => {
    // Long rows, so neither the gap nor the movement rule cuts anything. Row r has bass at
    // LED level 7 + (r mod 3) on the left channel and highs at 5 + (r mod 4) on the right.
    // Middle bands are loud and must be ignored.
    const rows = 24;
    // The row holding frame f's window centre, (f + 1) * 800 - 1024.
    const rowOf = (f: number): number => Math.max(0, Math.floor(((f + 1) * 800 - 1024) / 48_000));
    const level = generateLevel(
      syntheticLevelData({
        rowLengths: repeat(rows, 48_000),
        left: (f, b) => (b === 2 ? 7 + (rowOf(f) % 3) : b === 8 ? 12 : 0),
        right: (f, b) => (b === 13 ? 5 + (rowOf(f) % 4) : 0),
      }),
      'easy',
    );
    expect(level.barCount).toBe(rows);
    let meterF = 0;
    let meterC = 0;
    for (let r = 0; r < rows; r++) {
      const rawF = Math.min(12, 3 * (r % 3));
      const rawC = Math.min(12, 3 * (r % 4));
      meterF = Math.max(rawF, meterF - Terrain.decaySegments);
      meterC = Math.max(rawC, meterC - Terrain.decaySegments);
      expect(level.floor[r], `floor ${r}`).toBe(rock + meterF);
      expect(level.ceiling[r], `ceiling ${r}`).toBe(rock + meterC);
    }
  });

  it('builds the same walls on every difficulty; only the bar pitch differs', () => {
    const data = syntheticLevelData({
      rowLengths: repeat(200, 3000),
      left: (f, b) => (f * 7 + b * 3) % 13,
      right: (f, b) => (f * 5 + b) % 13,
    });
    const normal = generateLevel(data, 'normal');
    for (const d of difficulties) {
      const level = generateLevel(data, d);
      expect(level.barPitch).toBe(Difficulty[d].barPitch);
      expect(level.ceiling).toEqual(normal.ceiling);
      expect(level.floor).toEqual(normal.floor);
      expect(level.ceilingPeak).toEqual(normal.ceilingPeak);
      expect(level.floorPeak).toEqual(normal.floorPeak);
    }
  });

  it('takes the maximum over the frames in a row, or the nearest frame for a short row', () => {
    // Bass on band 0 and highs on band 13, two levels lower so both meters match: the gap
    // stays centred and nothing is cut. Frame f's window centre is at (f + 1) * 800 - 1024:
    // frame 1 at 576, frame 2 at 1376, ...
    const both = (v: (f: number) => number) => (f: number, b: number): number =>
      b === 0 ? v(f) : b === 13 ? Math.max(0, v(f) - 2) : 0;
    const peaks = [7, 8, 9, 8, 7];
    // Row 0 spans [0, 2400): centres 576, 1376 and 2176 (frames 1 to 3), so max(8, 9, 8)
    // = 9, a meter of 3 * (9 - 7) = 6.
    const first = generateLevel(syntheticLevelData({ rowLengths: [2400, 800], ...quiet, left: both((f) => peaks[f] ?? 0) }), 'easy');
    expect([first.ceiling[0], first.floor[0]]).toEqual([rock + 6, rock + 6]);
    // Row 16 spans [120100, 120400) and holds no centre. Frame 150 (119776) is 324 samples
    // before its start and frame 151 (120576) 476 after, so frame 150 is used: a meter of
    // 6. Frame 151 would give 9.
    const late = both((f) => (f === 150 ? 9 : f > 150 ? 10 : 0));
    const level = generateLevel(syntheticLevelData({ rowLengths: [100, ...repeat(15, 8000), 300, 3000], ...quiet, left: late }), 'easy');
    expect([level.ceiling[16], level.floor[16]]).toEqual([rock + 6, rock + 6]);
    // A song too short for any frame reads 0: rock only.
    const short = generateLevel(syntheticLevelData({ rowLengths: [300], ...quiet, left: both(() => 12) }), 'easy');
    expect([short.ceiling[0], short.floor[0]]).toEqual([rock, rock]);
  });

  it('cuts both sides in proportion to keep the minimum gap, never into the rock', () => {
    expect(MAX_COMBINED_SEGMENTS).toBe(25);
    expect(PLAYFIELD_HEIGHT - SEGMENT_PITCH * MAX_COMBINED_SEGMENTS).toBeGreaterThanOrEqual(Terrain.minGapPx);
    // Both meters full: 17 + 17 = 34 segments, cut to 25. Equal sides round half up on the
    // ceiling. Bar 0 is then centred on the ship's start, which costs the ceiling one more.
    const full = generateLevel(syntheticLevelData({ rowLengths: repeat(32, 48_000), left: () => 12, right: () => 12 }), 'hard');
    expect([full.ceiling[0], full.floor[0]]).toEqual([12, 12]);
    for (let i = 1; i < full.barCount; i++) {
      expect([full.ceiling[i], full.floor[i]]).toEqual([13, 12]);
    }
    // Highs at 8 (meter 9, 14 in all) and bass at 12 (17 in all): round(14 * 25 / 31) =
    // round(11.3) = 11 on the ceiling, and the floor gets the other 14. Read on bar 1.
    const uneven = generateLevel(
      syntheticLevelData({ rowLengths: [48_000, 48_000], left: (_f, b) => (b > 10 ? 8 : 12), right: () => 0 }),
      'easy',
    );
    expect([uneven.ceiling[1], uneven.floor[1]]).toEqual([11, 14]);
  });

  it("centres the first bar on the ship's start height", () => {
    // A loud floor and quiet highs on bar 0: the floor is cut to match the ceiling.
    const left = (_f: number, b: number): number => (b === 0 ? 11 : 0);
    const level = generateLevel(syntheticLevelData({ rowLengths: [48_000, 48_000], ...quiet, left }), 'normal');
    expect([level.ceiling[0], level.floor[0]]).toEqual([rock, rock]);
    expectAlwaysAPath(level);
    const offCentre = { ...level, floor: Uint8Array.from([rock + 2, rock]), floorPeak: Uint8Array.from([rock + 2, rock]) };
    expect(findPathViolation(offCentre)).toMatch(/bar 0: gap centre moves -7 px, limit 0 px/);
  });

  it('limits how far the gap centre moves on short rows', () => {
    // Rows of 400 samples (one tick): the ship covers 1 px, so the gap may barely move.
    const level = generateLevel(
      syntheticLevelData({
        rowLengths: repeat(64, 400),
        left: (f, b) => (f % 2 === 0 ? (b < 5 ? 12 : 0) : b > 10 ? 12 : 0),
        right: () => 0,
      }),
      'normal',
    );
    expect(gapShiftLimitPx(400)).toBe(1);
    expectAlwaysAPath(level);
    for (let i = 0; i < level.barCount; i++) {
      expect(level.ceiling[i]).toBeGreaterThanOrEqual(rock);
      expect(level.floor[i]).toBeGreaterThanOrEqual(rock);
    }
  });

  it('lets a meter fall by decaySegments per bar, and holds peaks for PEAK_HOLD_BARS bars', () => {
    // One bass frame at level 9 (a meter of 6) in row 1, silence otherwise. Rows of 48 000
    // samples let the gap move 30 px, so the 21 px move to bar 1 is not cut, and a falling
    // floor only widens the gap. Frame 61's centre, 48 576, is in row 1.
    const left = (f: number, b: number): number => (f === 61 && b === 0 ? 9 : 0);
    const level = generateLevel(syntheticLevelData({ rowLengths: repeat(30, 48_000), ...quiet, left }), 'easy');
    expect(Array.from(level.floor.subarray(0, 6))).toEqual([5, 11, 8, 5, 5, 5]);
    const peaks = Array.from(level.floorPeak.subarray(1, 2 + PEAK_HOLD_BARS + 7));
    expect(peaks).toEqual([11, 11, 11, 11, 11, 11, 11, 10, 9, 8, 7, 6, 5, 5]);
    expect(Terrain.decaySegments).toBe(3);
  });

  it('builds the scroll table from row times', () => {
    const level = generateLevel(syntheticLevelData({ rowLengths: [1200, 2000, 800], ...quiet }), 'normal');
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
    expect(playheadAtSample(level.barStartSample, level.totalSamples, 3200, 10)).toBe(2 * 2560);
    expect(playheadAtSample(level.barStartSample, level.totalSamples, 99_999, 10)).toBe(3 * 2560);
    expect(SAMPLES_PER_TICK).toBe(400);
    // A wider pitch scrolls faster: on hard (13 px) the song ends 3 * 13 px along.
    const hard = generateLevel(syntheticLevelData({ rowLengths: [1200, 2000, 800], ...quiet }), 'hard');
    expect(hard.scroll[10]).toBe(3 * 13 * 256 + offset);
    expect(Difficulty.easy.barPitch < Difficulty.normal.barPitch && Difficulty.normal.barPitch < Difficulty.hard.barPitch).toBe(true);
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
    expect(Array.from(base.ceiling)).toEqual([rock, rock, rock]);
    // 13 + 13 segments leave 216 - 182 = 34 px.
    const closed = { ...base, ceiling: Uint8Array.from([13, 5, 5]), ceilingPeak: Uint8Array.from([13, 13, 13]) };
    closed.floor = Uint8Array.from([13, 5, 5]);
    closed.floorPeak = Uint8Array.from([13, 13, 13]);
    expect(findPathViolation(closed)).toMatch(/bar 0: gap 34 px is under 40 px/);
    const jump = { ...base, ceiling: Uint8Array.from([5, 13, 5]), ceilingPeak: Uint8Array.from([5, 13, 13]) };
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
