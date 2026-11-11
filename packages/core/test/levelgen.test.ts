import { describe, expect, it } from 'vitest';
import {
  findDrums,
  gapShiftLimitPx,
  generateLevel,
  maxCombinedSegments,
  playheadAtSample,
} from '../src/levelgen/generate.ts';
import { findPathViolation } from '../src/levelgen/path-check.ts';
import { serializeLevel } from '../src/levelgen/serialize.ts';
import { Difficulty, Terrain, type DifficultyName, type Level } from '../src/levelgen/types.ts';
import { PLAYFIELD_HEIGHT, PLAYHEAD_X, SAMPLES_PER_TICK, SEGMENT_PITCH } from '../src/playfield.ts';
import { lcg, randomSong, syntheticLevelData, type SyntheticNote } from './level-fixtures.ts';

const difficulties = Object.keys(Difficulty) as DifficultyName[];

function expectAlwaysAPath(level: Level): void {
  expect(findPathViolation(level)).toBe('');
}

const repeat = (n: number, v: number): number[] => Array.from({ length: n }, () => v);
const sides = (level: Level, i: number): number[] => [level.ceiling[i]!, level.floor[i]!];
/** Rows of 48 000 samples hold 60 frames: frame f ends in row floor((f + 1) * 800 / 48 000). */
const ROW = 48_000;
const rowOfFrame = (f: number): number => Math.floor(((f + 1) * 800 - 1) / ROW);

describe('generateLevel', () => {
  it('squeezes the cave on a hit and lets it open by releaseSegments per bar', () => {
    // Every channel's meter jumps from 0 to 255 in row 2 and drops back in row 3: a hit of
    // 4 * 255 = 1020, so 15 squeeze segments, more than normal's base gap (104 px) allows
    // above its minimum (58 px). With the melody at the pivot the gap stays centred.
    const vu = (f: number): number => (rowOfFrame(f) === 2 ? 255 : 0);
    const level = generateLevel(syntheticLevelData({ rowLengths: repeat(8, ROW), vu }), 'normal');
    expect(Terrain.hitPerSegment).toBe(64);
    expect(Terrain.releaseSegments).toBe(6);
    // No squeeze: a 104 px gap, 56 px each side. Squeeze 15 or 9: the 58 px minimum,
    // rounded to 11 segments a side (62 px). Squeeze 3: 83 px, 66.5 px a side, rounded up
    // to 10.
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => sides(level, i))).toEqual([
      [8, 8],
      [8, 8],
      [11, 11],
      [11, 11],
      [10, 10],
      [8, 8],
      [8, 8],
    ]);
    expectAlwaysAPath(level);
  });

  it('builds the cave from the base and minimum gaps of each difficulty', () => {
    const vu = (f: number): number => (rowOfFrame(f) === 2 ? 255 : 0);
    for (const d of difficulties) {
      const level = generateLevel(syntheticLevelData({ rowLengths: repeat(4, ROW), vu }, d), d);
      const { baseGapPx, minGapPx } = Difficulty[d];
      const gap = (i: number): number => PLAYFIELD_HEIGHT - SEGMENT_PITCH * (level.ceiling[i]! + level.floor[i]!);
      expect(Math.abs(gap(1) - baseGapPx), d).toBeLessThanOrEqual(SEGMENT_PITCH);
      expect(gap(2), d).toBeGreaterThanOrEqual(minGapPx);
      expect(gap(2), d).toBeLessThan(gap(1));
    }
    expect(Difficulty.easy.minGapPx > Difficulty.normal.minGapPx && Difficulty.normal.minGapPx > Difficulty.hard.minGapPx).toBe(true);
    expect(Difficulty.easy.tempoPermille < Difficulty.normal.tempoPermille && Difficulty.normal.tempoPermille < Difficulty.hard.tempoPermille).toBe(true);
  });

  it('raises the gap on high notes and lowers it on low ones, holding the last note', () => {
    // One melodic note every other row. Four different pitches, so it is not a drum.
    const pitches = [72, 79, 74, 67];
    const notes: SyntheticNote[] = pitches.map((note, k) => ({ time: (1 + 2 * k) * ROW + 100, instrument: 1, note }));
    const level = generateLevel(syntheticLevelData({ rowLengths: repeat(9, ROW), notes }), 'normal');
    // Twice the centre is 216 - 6 per semitone above 72; the sides round to whole segments.
    const centre2 = (i: number): number => SEGMENT_PITCH * (level.ceiling[i]! - level.floor[i]!) + PLAYFIELD_HEIGHT;
    const want = [216, 216, 216, 174, 174, 204, 204, 246, 246];
    for (let i = 0; i < want.length; i++) expect(Math.abs(centre2(i) - want[i]!), `bar ${i}`).toBeLessThanOrEqual(SEGMENT_PITCH);
    expect(centre2(3)).toBeLessThan(216); // higher on screen
    expect(centre2(7)).toBeGreaterThan(216);
  });

  it('ignores drums for the melody', () => {
    // Instrument 2 plays one pitch (a drum); instrument 1 plays a tune.
    const notes: SyntheticNote[] = [];
    for (let k = 0; k < 40; k++) notes.push({ time: k * 4800, instrument: 2, note: 100 });
    for (let k = 0; k < 8; k++) notes.push({ time: k * 4800 + 1, instrument: 1, note: 60 + k });
    notes.sort((a, b) => a.time - b.time);
    const data = syntheticLevelData({ rowLengths: repeat(40, 4800), notes });
    const drums = findDrums(data);
    expect([drums[1], drums[2]]).toEqual([0, 1]);
    // A drum at pitch 100 in a row with no tune note leaves the melody where it was (67).
    const level = generateLevel(data, 'normal');
    const centre2 = SEGMENT_PITCH * (level.ceiling[30]! - level.floor[30]!) + PLAYFIELD_HEIGHT;
    expect(Math.abs(centre2 - (216 + 6 * 5))).toBeLessThanOrEqual(SEGMENT_PITCH);
  });

  it("centres the first bar on the ship's start height", () => {
    const notes: SyntheticNote[] = [{ time: 0, instrument: 1, note: 96 }];
    const level = generateLevel(syntheticLevelData({ rowLengths: [ROW, ROW], notes }), 'normal');
    expect(level.ceiling[0]).toBe(level.floor[0]);
    expectAlwaysAPath(level);
    const offCentre = { ...level, floor: Uint8Array.from([level.floor[0]! + 2, level.floor[1]!]) };
    expect(findPathViolation(offCentre)).toMatch(/bar 0: gap centre moves -7 px, limit 0 px/);
  });

  it('limits how far the gap centre moves on short rows', () => {
    // Rows of 400 samples (one tick): the ship covers 1 px, so the gap may barely move,
    // however far the melody jumps.
    const notes: SyntheticNote[] = Array.from({ length: 64 }, (_, k) => ({ time: k * 400, instrument: 1, note: k % 2 === 0 ? 40 : 100 }));
    const level = generateLevel(syntheticLevelData({ rowLengths: repeat(64, 400), notes }), 'normal');
    expect(gapShiftLimitPx(400, 'normal')).toBe(1);
    expectAlwaysAPath(level);
    for (let i = 0; i < level.barCount; i++) {
      expect(Math.min(level.ceiling[i]!, level.floor[i]!)).toBeGreaterThanOrEqual(Terrain.minSideSegments);
    }
  });

  it('builds the scroll table from row times', () => {
    const level = generateLevel(syntheticLevelData({ rowLengths: [1200, 2000, 800] }), 'normal');
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

  it('refuses LevelData analyzed at another tempo', () => {
    const data = syntheticLevelData({ rowLengths: [ROW] }, 'easy');
    expect(() => generateLevel(data, 'hard')).toThrow(/tempo 900, hard needs 1150/);
  });

  it.each(difficulties)('always leaves a path on random loud songs (%s)', (d) => {
    for (let seed = 1; seed <= 20; seed++) {
      const level = generateLevel(syntheticLevelData(randomSong(lcg(seed), 300, 12), d), d);
      expectAlwaysAPath(level);
      expect(level.ceiling.every((c, i) => c + level.floor[i]! <= maxCombinedSegments(d))).toBe(true);
    }
  });

  it('findPathViolation catches a closed gap and a jump', () => {
    const base = generateLevel(syntheticLevelData({ rowLengths: [400, 400, 400] }), 'normal');
    expect(findPathViolation(base)).toBe('');
    expect(Array.from(base.ceiling)).toEqual([8, 8, 8]);
    // 13 + 13 segments leave 216 - 182 = 34 px.
    const closed = { ...base, ceiling: Uint8Array.from([13, 8, 8]), floor: Uint8Array.from([13, 8, 8]) };
    expect(findPathViolation(closed)).toMatch(/bar 0: gap 34 px is under 58 px/);
    const jump = { ...base, ceiling: Uint8Array.from([8, 12, 8]) };
    expect(findPathViolation(jump)).toMatch(/bar 1: gap centre moves 14 px, limit 1 px/);
  });

  it('findPathViolation catches three gaps that step away from each other', () => {
    // Long rows, so only the 48 px cap limits each move. Gaps [56, 160], [42, 111],
    // [70, 132], [112, 174]: every gap is at least 58 px, each centre moves under 48 px,
    // and each pair overlaps by at least 10 px, but bars 1 to 3 share nothing: the hitbox,
    // touching two bars at once, would have to jump from [70, 111] to [112, 132].
    const base = generateLevel(syntheticLevelData({ rowLengths: repeat(4, ROW) }), 'normal');
    const steps = { ...base, ceiling: Uint8Array.from([8, 6, 10, 16]), floor: Uint8Array.from([8, 15, 12, 6]) };
    expect(findPathViolation(steps)).toBe('bar 3: bars 1 to 3 share -1 px, under 10 px');
    steps.ceiling[3] = 15;
    expect(findPathViolation(steps)).toBe('bar 3: bars 1 to 3 share 6 px, under 10 px');
    steps.ceiling[3] = 14;
    expect(findPathViolation(steps)).toBe('');
  });

  it('is deterministic', () => {
    const data = syntheticLevelData(randomSong(lcg(7), 40, 6), 'hard');
    expect(serializeLevel(generateLevel(data, 'hard'))).toEqual(serializeLevel(generateLevel(data, 'hard')));
  });
});
