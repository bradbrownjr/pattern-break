// Breaking terrain (sim.ts, breakTerrain; Brad, 2026-11-11): a missile's or bomb's blast
// breaks the wall segments it overlaps down to TERRAIN_KEEP_SEGMENTS, the ceiling beyond a
// cut falls as a block that crushes enemies and costs the ship a wall's shield points, and
// the floor beyond a cut crumbles.

import { describe, expect, it } from 'vitest';
import { EnemyKind } from '../src/levelgen/types.ts';
import { InputBit, SHIELD_MAX, SHIELD_WALL_COST, TERRAIN_KEEP_SEGMENTS } from '../src/sim/constants.ts';
import { EnemyStatus, createSimState, resetSimState, runInputLog, serializeSimState, tick } from '../src/sim/sim.ts';
import { enemyList, handLevel } from './level-fixtures.ts';

const Q = 256;

describe('breaking terrain', () => {
  // Bar 15 (world x 150 to 158) hangs 20 segments from the ceiling, down to y 139, in the
  // ship's way at y 108; the floor is 2 segments everywhere. A turret hangs from bar 15's
  // tip, and one stands on its floor.
  const bars = Array.from({ length: 40 }, (_, i): [number, number] => (i === 15 ? [20, 2] : [0, 2]));
  const enemies = enemyList([
    { kind: EnemyKind.turret, spawnTick: 0, x: 154 * Q, y: 143 * Q, side: 1 },
    { kind: EnemyKind.turret, spawnTick: 0, x: 154 * Q, y: 199 * Q, side: 0 },
  ]);
  const level = handLevel('easy', bars, 0, 600, enemies);

  /** Fires the missile into bar 15 and runs until it bursts; returns the state. */
  function burst() {
    const s = createSimState();
    s.missile = true;
    tick(level, s, InputBit.missile);
    for (let k = 0; k < 150 && s.missileActive[0]; k++) tick(level, s, 0);
    return s;
  }

  it('cuts a hanging wall where a missile bursts on it, and drops the part below as a block', () => {
    const s = burst();
    expect(s.missileActive[0]).toBe(0);
    // The blast spans y 88 to 128 around the missile: segments 12 (84 to 90) to 18 go, and
    // segment 19 (133 to 139) falls.
    expect(s.ceiling[15]).toBe(12);
    expect(s.floor[15]).toBe(2);
    expect(s.terrainBreaks).toBe(1);
    const b = s.blockActive.indexOf(1);
    expect(b).toBeGreaterThanOrEqual(0);
    expect([s.blockBar[b], s.blockFirst[b], s.blockSegments[b]]).toEqual([15, 19, 1]);
    // The turret on the cut tip fell with it, scoring as a kill.
    expect(s.enemyStatus[0]).toBe(EnemyStatus.destroyed);
    expect(s.enemyPoints[0]).toBeGreaterThan(0);
  });

  it('crushes what the falling block lands on, scoring it, then shatters on the floor', () => {
    const s = burst();
    expect(s.enemyStatus[1]).toBe(EnemyStatus.alive);
    for (let k = 0; k < 200 && s.blockActive.includes(1); k++) tick(level, s, 0);
    expect(s.blockActive.includes(1)).toBe(false);
    expect(s.enemyStatus[1]).toBe(EnemyStatus.destroyed);
    expect(s.enemyPoints[1]).toBeGreaterThan(0);
    // It shattered on the floor: its bottom reached the floor's top at y 203.
    const b = s.blockBar.indexOf(15);
    expect(s.blockY[b]! + 6 * Q).toBeGreaterThanOrEqual(203 * Q);
  });

  it('leaves the 2 segments at a wall\'s edge, and crumbles the floor beyond a cut', () => {
    // A floor 8 segments high (top at y 161) under a dropped bomb.
    const floorLevel = handLevel('easy', Array.from({ length: 40 }, (): [number, number] => [0, 8]), 0, 600);
    const s = createSimState();
    tick(floorLevel, s, InputBit.bomb);
    for (let k = 0; k < 200 && s.bombActive; k++) tick(floorLevel, s, 0);
    expect(s.blastTick).toBeGreaterThan(0);
    const broken = Array.from(s.floor).filter((f) => f < 8);
    expect(broken.length).toBeGreaterThan(0);
    for (const f of broken) expect(f).toBeGreaterThanOrEqual(TERRAIN_KEEP_SEGMENTS);
    expect(s.blockActive.includes(1)).toBe(false);
    // A low floor, all within the blast, keeps its 2.
    const low = handLevel('easy', Array.from({ length: 40 }, (): [number, number] => [0, 3]), 0, 600);
    const t = createSimState();
    tick(low, t, InputBit.bomb);
    for (let k = 0; k < 200 && t.bombActive; k++) tick(low, t, 0);
    expect(Math.min(...t.floor)).toBe(TERRAIN_KEEP_SEGMENTS);
  });

  it('shatters a block on the ship for a wall\'s shield points', () => {
    const open = handLevel('easy', Array.from({ length: 40 }, (): [number, number] => [0, 0]), 0, 600);
    const s = createSimState();
    tick(open, s, 0);
    // Two segments over the ship (x 64, bar 6 at 60 to 68), falling from y 60.
    s.blockActive[0] = 1;
    s.blockBar[0] = 6;
    s.blockFirst[0] = 8;
    s.blockSegments[0] = 2;
    s.blockY[0] = 60 * Q;
    s.blockVY[0] = 0;
    for (let k = 0; k < 200 && s.blockActive[0]; k++) tick(open, s, 0);
    expect(s.blockActive[0]).toBe(0);
    expect(s.shield).toBe(SHIELD_MAX - SHIELD_WALL_COST);
    expect(s.lives).toBe(3);
  });

  it('drops a tank that drives onto broken floor, scoring it', () => {
    const floor4 = Array.from({ length: 40 }, (): [number, number] => [0, 4]);
    const tankLevel = handLevel('easy', floor4, 0, 600, enemyList([{ kind: EnemyKind.tank, spawnTick: 0, x: 300 * Q }]));
    const s = createSimState();
    tick(tankLevel, s, 0);
    expect(s.enemyStatus[0]).toBe(EnemyStatus.alive);
    // Break the floor just ahead of the tank, as a bomb would.
    s.floor[29] = 2;
    for (let k = 0; k < 200 && s.enemyStatus[0] === EnemyStatus.alive; k++) tick(tankLevel, s, 0);
    expect(s.enemyStatus[0]).toBe(EnemyStatus.destroyed);
    expect(s.enemyPoints[0]).toBeGreaterThan(0);
  });

  it('puts the walls back whole on a retry', () => {
    const inputs = new Uint16Array(300);
    inputs[0] = InputBit.missile;
    const a = createSimState();
    a.missile = true;
    runInputLog(level, inputs, a);
    expect(a.ceiling[15]).toBe(12);
    const first = serializeSimState(a);
    // A reset state plays like a fresh one, with the walls whole again.
    resetSimState(a);
    a.missile = true;
    runInputLog(level, inputs, a);
    expect(serializeSimState(a)).toEqual(first);
    resetSimState(a);
    tick(level, a, 0);
    expect(a.ceiling[15]).toBe(20);
    expect(a.blockActive.includes(1)).toBe(false);
  });
});
