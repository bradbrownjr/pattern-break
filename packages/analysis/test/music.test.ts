// Every bundled song (music/manifest.json) must make a level the ship can fly on every
// difficulty: the path check passes and the autopilot reaches the end. A levelgen change
// that breaks a real song fails here, not in play.

import { readFile } from 'node:fs/promises';
import { Difficulty, autopilotInputs, findPathViolation, generateLevel, runInputLog, type DifficultyName } from '@game/core';
import { describe, expect, it } from 'vitest';
import manifest from '../../../music/manifest.json' with { type: 'json' };
import { analyze, loadOpenMpt } from '../src/index.ts';

describe('bundled songs', () => {
  for (const song of manifest) {
    it(`${song.title} is playable on every difficulty`, async () => {
      const openmpt = await loadOpenMpt();
      const bytes = new Uint8Array(await readFile(new URL(`../../../music/${song.file}`, import.meta.url)));
      const data = analyze(openmpt, bytes);
      for (const difficulty of Object.keys(Difficulty) as DifficultyName[]) {
        const level = generateLevel(data, difficulty);
        expect(findPathViolation(level), difficulty).toBe('');
        const run = runInputLog(level, autopilotInputs(level));
        expect({ difficulty, dead: run.dead, finished: run.finished }).toEqual({ difficulty, dead: false, finished: true });
      }
    }, 60_000);
  }
});
