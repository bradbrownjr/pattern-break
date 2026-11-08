// Golden hashes for the fixture modules (song files made in a music tracker): the
// LevelData built from each, and the Level and sim runs built from that. This file runs in
// Node (the `node` project) and in real browsers (the `browser` project), and every
// environment must produce the committed hashes. Change a LevelData or Level hash only
// together with a GEN_VERSION bump, and a sim hash only with a SIM_VERSION bump.

import {
  Difficulty,
  GEN_VERSION,
  InputBit,
  SIM_VERSION,
  autopilotInputs,
  findPathViolation,
  generateLevel,
  runInputLog,
  serializeLevel,
  serializeSimState,
  type DifficultyName,
  type LevelData,
} from '@game/core';
import { describe, expect, it } from 'vitest';
import goldenLevelgen from '../fixtures/golden-levelgen.json' with { type: 'json' };
import golden from '../fixtures/golden.json' with { type: 'json' };
import { analyze, hashLevelData, loadOpenMpt, sha256Hex } from '../src/index.ts';

async function readFixture(name: string): Promise<Uint8Array> {
  const url = new URL(`../fixtures/${name}`, import.meta.url);
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return new Uint8Array(await readFile(url));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch ${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

describe('golden LevelData', () => {
  it('is pinned for this GEN_VERSION and libopenmpt build', async () => {
    const openmpt = await loadOpenMpt();
    expect(golden.genVersion).toBe(GEN_VERSION);
    expect(golden.libopenmpt).toBe(openmpt.libraryVersion);
  });

  for (const [name, expected] of Object.entries(golden.levelData)) {
    it(`${name} hashes to the committed value`, async () => {
      const openmpt = await loadOpenMpt();
      const level = analyze(openmpt, await readFixture(name));
      expect(await hashLevelData(level)).toBe(expected);
    }, 60_000);
  }
});

/**
 * A fixed input log that ignores the terrain: 40-tick phases of up, down, down and up,
 * drifting right for 400 ticks and then left for 400. It crashes at some point, which pins
 * death handling.
 */
function zigzagInputs(ticks: number): Uint8Array {
  const vertical = [InputBit.up, InputBit.down, InputBit.down, InputBit.up];
  return Uint8Array.from({ length: ticks }, (_, t) => {
    const horizontal = Math.floor(t / 400) % 2 === 0 ? InputBit.right : InputBit.left;
    return vertical[Math.floor(t / 40) % 4]! | horizontal;
  });
}

const levelDataCache = new Map<string, LevelData>();
async function fixtureLevelData(name: string): Promise<LevelData> {
  let data = levelDataCache.get(name);
  if (!data) {
    data = analyze(await loadOpenMpt(), await readFixture(name));
    levelDataCache.set(name, data);
  }
  return data;
}

describe('golden levels and sim runs', () => {
  it('are pinned for this GEN_VERSION and SIM_VERSION', () => {
    expect(goldenLevelgen.genVersion).toBe(GEN_VERSION);
    expect(goldenLevelgen.simVersion).toBe(SIM_VERSION);
  });

  for (const [name, byDifficulty] of Object.entries(goldenLevelgen.fixtures)) {
    for (const difficulty of Object.keys(Difficulty) as DifficultyName[]) {
      const want = byDifficulty[difficulty];
      it(`${name} ${difficulty}: the level, an autopilot run and a zigzag run match`, async () => {
        const level = generateLevel(await fixtureLevelData(name), difficulty);
        const flown = runInputLog(level, autopilotInputs(level));
        const zigzag = runInputLog(level, zigzagInputs(level.tickCount));
        const got = {
          level: await sha256Hex(serializeLevel(level)),
          autopilot: await sha256Hex(serializeSimState(flown)),
          zigzag: await sha256Hex(serializeSimState(zigzag)),
          zigzagDeathTick: zigzag.deathTick,
        };
        expect(findPathViolation(level)).toBe('');
        // The autopilot always finds the path the level generator guarantees.
        expect(flown.dead).toBe(false);
        expect(flown.finished).toBe(true);
        expect(got).toEqual(want);
      }, 60_000);
    }
  }
});
