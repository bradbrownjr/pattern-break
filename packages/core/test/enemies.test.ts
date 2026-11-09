// Enemy placement (levelgen/enemies.ts): which notes make which enemies, where, and when
// they fire; and that the path guarantee holds with turrets and tanks counted as wall.

import { describe, expect, it } from 'vitest';
import { ENEMY_GRACE_TICKS, FORMATION_TICKS, SHIP_MAX_OFFSET_PX } from '../src/levelgen/enemies.ts';
import { generateLevel } from '../src/levelgen/generate.ts';
import { findPathViolation, solidWalls } from '../src/levelgen/path-check.ts';
import { Difficulty, EnemyKind, EnemyTuning, ShipMotion, type DifficultyName, type Level } from '../src/levelgen/types.ts';
import { ENEMY_ENTRY_X, FIRE_MAX_X, FIRE_MIN_X, SHIP_FIRE_DELAY_TICKS } from '../src/sim/constants.ts';
import { lcg, randomSong, syntheticLevelData, type SyntheticNote } from './level-fixtures.ts';

const Q = 256;
/** Rows of 4800 samples: 12 ticks each, 10 rows a second. */
const ROW = 4800;
const TICKS_PER_ROW = 12;
const DRUM = 2;
const LEAD = 1;
const BASS = 3;

function level(notes: SyntheticNote[], difficulty: DifficultyName = 'easy', rows = 400, vu?: (f: number, c: number) => number): Level {
  const data = syntheticLevelData({ rowLengths: Array.from({ length: rows }, () => ROW), notes, ...(vu ? { vu } : {}) }, difficulty);
  return generateLevel(data, difficulty);
}

const drum = (row: number): SyntheticNote => ({ time: row * ROW, instrument: DRUM, note: 49 });
/** A tune of four pitches, so the lead is not taken for a drum. */
const lead = (row: number, extra: Partial<SyntheticNote> = {}): SyntheticNote => ({
  time: row * ROW,
  instrument: LEAD,
  note: [72, 76, 79, 74][row % 4]!,
  ...extra,
});
const bass = (row: number): SyntheticNote => ({ time: row * ROW, instrument: BASS, note: [36, 40, 43, 38][row % 4]! });

function of(l: Level, kind: number): number[] {
  return Array.from({ length: l.enemies.count }, (_, i) => i).filter((i) => l.enemies.kind[i] === kind);
}

function fireTicks(l: Level, i: number): number[] {
  return Array.from(l.enemies.fireTick.subarray(l.enemies.fireStart[i]!, l.enemies.fireStart[i + 1]!));
}

describe('turrets', () => {
  it('a drum note puts a turret on the tip of its bar, which reaches the ship as the drum plays', () => {
    const l = level([drum(60)]);
    expect(l.enemies.count).toBe(1);
    expect(l.enemies.kind[0]).toBe(EnemyKind.turret);
    // On the floor first: bar 60's lit part is world x 600..608, so the centre is 604.
    expect([l.enemies.side[0], l.enemies.x[0]]).toEqual([0, 604 * Q]);
    // It fills the segment slot on top of the floor.
    expect(l.enemies.y[0]).toBe((216 - 7 * (l.floor[60]! + 1)) * Q + 3 * Q);
    // At the drum's tick bar 60 is at the playhead, so the turret's centre is at screen x 68.
    expect(l.enemies.x[0]! - l.scroll[60 * TICKS_PER_ROW]!).toBe(68 * Q);
    // It appears as it scrolls in from the right edge.
    const spawn = l.enemies.spawnTick[0]!;
    expect(l.enemies.x[0]! - l.scroll[spawn]!).toBeLessThanOrEqual(ENEMY_ENTRY_X * Q);
    expect(l.enemies.x[0]! - l.scroll[spawn - 1]!).toBeGreaterThan(ENEMY_ENTRY_X * Q);
  });

  it('alternate floor and ceiling, and keep the difficulty spacing', () => {
    const notes = Array.from({ length: 200 }, (_, i) => drum(25 + i));
    const l = level(notes);
    const turrets = of(l, EnemyKind.turret);
    // 360 ticks on easy is 30 rows.
    expect(EnemyTuning.easy.turretSpacingTicks).toBe(30 * TICKS_PER_ROW);
    const bars = turrets.map((i) => Math.floor(l.enemies.x[i]! / (10 * Q)));
    expect(bars.slice(0, 4)).toEqual([25, 55, 85, 115]);
    expect(turrets.slice(0, 4).map((i) => l.enemies.side[i])).toEqual([0, 1, 0, 1]);
  });

  it('fire on their drum while ahead of the ship, no more often than the difficulty allows', () => {
    const notes = Array.from({ length: 300 }, (_, i) => drum(25 + i));
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const l = level(notes, d);
      // The first turret meets the drums only once it is past the ship; the rest fire.
      expect(l.enemies.fireTick.length, d).toBeGreaterThan(0);
      for (const i of of(l, EnemyKind.turret)) {
        const ticks = fireTicks(l, i);
        for (let k = 0; k < ticks.length; k++) {
          const t = ticks[k]!;
          // On a drum note, on screen ahead of the ship.
          expect(t % TICKS_PER_ROW).toBe(0);
          const x = l.enemies.x[i]! - l.scroll[t]!;
          expect(x).toBeGreaterThanOrEqual(FIRE_MIN_X * Q);
          expect(x).toBeLessThanOrEqual(FIRE_MAX_X * Q);
          if (k > 0) expect(t - ticks[k - 1]!).toBeGreaterThanOrEqual(EnemyTuning[d].fireIntervalTicks);
        }
      }
    }
  });

  it('are left out where they would narrow the cave below the minimum', () => {
    // Every channel's meter jumps every frame, so the cave stays at its narrowest.
    const notes = Array.from({ length: 200 }, (_, i) => drum(25 + i));
    const squeezed = level(notes, 'hard', 400, (f) => (f % 2 === 0 ? 255 : 0));
    expect(of(squeezed, EnemyKind.turret)).toEqual([]);
    expect(findPathViolation(squeezed)).toBe('');
  });
});

describe('tanks and ships', () => {
  it('nothing appears in the first 2 s', () => {
    const notes = Array.from({ length: 20 }, (_, i) => [drum(i), lead(i), bass(i)]).flat();
    expect(ENEMY_GRACE_TICKS).toBe(240);
    // Row 19 starts at tick 228.
    expect(level(notes).enemies.count).toBe(0);
  });

  it('the bass sends tanks in from the right edge on its notes', () => {
    const notes = Array.from({ length: 200 }, (_, i) => [lead(30 + i), bass(30 + i)]).flat();
    const l = level(notes);
    const tanks = of(l, EnemyKind.tank);
    expect(tanks.length).toBeGreaterThan(0);
    for (const i of tanks) {
      const t = l.enemies.spawnTick[i]!;
      expect(t % TICKS_PER_ROW).toBe(0);
      expect(l.enemies.x[i]! - l.scroll[t]!).toBe(ENEMY_ENTRY_X * Q);
      expect(l.enemies.instrument[i]).toBe(BASS);
    }
    for (let k = 1; k < tanks.length; k++) {
      expect(l.enemies.spawnTick[tanks[k]!]! - l.enemies.spawnTick[tanks[k - 1]!]!).toBeGreaterThanOrEqual(EnemyTuning.easy.tankSpacingTicks);
    }
  });

  it('other instruments send formations of ships, one per note', () => {
    // A lead note every 2 rows (24 ticks), cycling through four pitches.
    const notes = Array.from({ length: 100 }, (_, i): SyntheticNote => ({ time: (30 + 2 * i) * ROW, instrument: LEAD, note: [72, 76, 79, 74][i % 4]! }));
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const l = level(notes, d);
      const ships = of(l, EnemyKind.ship);
      const spawns = ships.map((i) => l.enemies.spawnTick[i]!);
      const size = EnemyTuning[d].formationSize;
      // The first formation: `size` ships on consecutive notes.
      expect(spawns.slice(0, size), d).toEqual(Array.from({ length: size }, (_, k) => 360 + 24 * k));
      expect(24 * (size - 1)).toBeLessThanOrEqual(FORMATION_TICKS);
      // The next one starts after the spacing.
      expect(spawns[size]! - spawns[0]!).toBeGreaterThanOrEqual(EnemyTuning[d].formationSpacingTicks);
    }
  });

  it('a ship flies higher for higher notes, and moves by its note effect', () => {
    // libopenmpt effects: 5 vibrato, 2 slide up, 3 slide down, 1 arpeggio.
    const effects: Array<[number, number, number]> = [
      [5, 0x44, ShipMotion.weave],
      [2, 0x10, ShipMotion.climb],
      [3, 0x10, ShipMotion.dive],
      [1, 0x37, ShipMotion.hop],
      [1, 0, ShipMotion.straight],
      [0, 0, ShipMotion.straight],
    ];
    for (const [effect, param, motion] of effects) {
      const l = level([lead(30, { effect, param }), lead(31), lead(32), lead(33)], 'easy');
      expect(l.enemies.motion[0], `effect ${effect}`).toBe(motion);
    }
    // The middle of 72, 76, 79, 74 is 74. The first ship's note, 72, is 2 semitones below
    // it, so the ship flies 4 px below the cave's centre line.
    const l = level([lead(28), lead(29), lead(30), lead(31)], 'easy');
    const first = of(l, EnemyKind.ship)[0]!;
    expect(l.enemies.y[first]).toBe(4 * Q);
    expect(SHIP_MAX_OFFSET_PX).toBe(24);
  });

  it("ships don't fire on easy, and fire at most once on normal", () => {
    const notes = Array.from({ length: 200 }, (_, i) => lead(30 + i));
    expect(EnemyTuning.easy.shipShots).toBe(0);
    const easy = level(notes, 'easy');
    expect(of(easy, EnemyKind.ship).every((i) => fireTicks(easy, i).length === 0)).toBe(true);
    const normal = level(notes, 'normal');
    for (const i of of(normal, EnemyKind.ship)) {
      const ticks = fireTicks(normal, i);
      expect(ticks.length).toBeLessThanOrEqual(1);
      for (const t of ticks) expect(t - normal.enemies.spawnTick[i]!).toBeGreaterThanOrEqual(SHIP_FIRE_DELAY_TICKS);
    }
  });
});

describe('placement', () => {
  it.each(Object.keys(Difficulty) as DifficultyName[])('keeps the path on random songs, with enemies as wall (%s)', (d) => {
    for (let seed = 1; seed <= 10; seed++) {
      const l = generateLevel(syntheticLevelData(randomSong(lcg(seed * 31), 250, 8), d), d);
      expect(findPathViolation(l), `seed ${seed}`).toBe('');
      // In spawn order.
      for (let i = 1; i < l.enemies.count; i++) expect(l.enemies.spawnTick[i]!).toBeGreaterThanOrEqual(l.enemies.spawnTick[i - 1]!);
    }
  });

  it('turrets count as one more segment of wall at their bar', () => {
    const l = level(Array.from({ length: 200 }, (_, i) => drum(25 + i)));
    const walls = solidWalls(l);
    for (const i of of(l, EnemyKind.turret)) {
      const bar = Math.floor(l.enemies.x[i]! / (10 * Q));
      if (l.enemies.side[i] === 1) expect(walls.ceiling[bar]).toBe(l.ceiling[bar]! + 1);
      else expect(walls.floor[bar]).toBe(l.floor[bar]! + 1);
    }
  });

  it('is the same every time', () => {
    const song = randomSong(lcg(7), 300, 8);
    const a = generateLevel(syntheticLevelData(song, 'normal'), 'normal');
    const b = generateLevel(syntheticLevelData(song, 'normal'), 'normal');
    expect(a.enemies).toEqual(b.enemies);
    expect(a.enemies.count).toBeGreaterThan(0);
  });
});
