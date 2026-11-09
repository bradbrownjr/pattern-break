// Every bundled song (music/manifest.json) must make a level the ship can fly on every
// difficulty, each at its own tempo: the path check passes with turrets and tanks counted
// as wall, and the autopilot flies the terrain to the end. A levelgen change that breaks a
// real song fails here, not in play.

import { readFile } from 'node:fs/promises';
import {
  Difficulty,
  autopilotInputs,
  findPathViolation,
  generateLevel,
  runInputLog,
  withoutEnemies,
  type DifficultyName,
} from '@game/core';
import { describe, expect, it } from 'vitest';
import manifest from '../../../music/manifest.json' with { type: 'json' };
import { analyze, loadOpenMpt } from '../src/index.ts';

describe('bundled songs', () => {
  for (const song of manifest) {
    it(`${song.title} is playable on every difficulty`, async () => {
      const openmpt = await loadOpenMpt();
      const bytes = new Uint8Array(await readFile(new URL(`../../../music/${song.file}`, import.meta.url)));
      for (const difficulty of Object.keys(Difficulty) as DifficultyName[]) {
        const level = generateLevel(analyze(openmpt, bytes, Difficulty[difficulty].tempoPermille), difficulty);
        expect(findPathViolation(level), difficulty).toBe('');
        expect(level.enemies.count, difficulty).toBeGreaterThan(0);
        const terrain = withoutEnemies(level);
        const run = runInputLog(terrain, autopilotInputs(terrain));
        expect({ difficulty, dead: run.dead, finished: run.finished }).toEqual({ difficulty, dead: false, finished: true });
      }
    }, 120_000);
  }
});
