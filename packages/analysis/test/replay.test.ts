// A replay recorded in Chromium (the game's own recording, saved with S on the game-over
// screen; docs/DEVELOPMENT.md, "Replays") must give the recorded score wherever it runs.
// This file runs in Node (the `node` project) and in real browsers (the `browser`
// project): each builds the level from the song file and runs the replay's inputs.
// Re-record it after a GEN_VERSION or SIM_VERSION bump.

import { Difficulty, GEN_VERSION, SIM_VERSION, decodeReplay, generateLevel, runInputLog } from '@game/core';
import { describe, expect, it } from 'vitest';
import { analyze, loadOpenMpt, sha256Hex } from '../src/index.ts';

async function read(url: URL): Promise<Uint8Array> {
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return new Uint8Array(await readFile(url));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch ${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

describe('recorded replay', () => {
  it('Numen in Da Chip on normal, recorded in Chromium, scores what it recorded', async () => {
    const replay = decodeReplay(await read(new URL('../fixtures/replay-numenchip-normal.pbreplay', import.meta.url)));
    expect([replay.genVersion, replay.simVersion]).toEqual([GEN_VERSION, SIM_VERSION]);
    const song = await read(new URL('../../../music/numenchip.xm', import.meta.url));
    expect(await sha256Hex(song)).toBe(replay.moduleHash);
    const openmpt = await loadOpenMpt();
    const level = generateLevel(analyze(openmpt, song, Difficulty[replay.difficulty].tempoPermille), replay.difficulty);
    const state = runInputLog(level, replay.inputs);
    // The run ended on its last recorded tick, with the recorded score.
    expect([state.score, state.tick, state.dead || state.finished]).toEqual([replay.score, replay.inputs.length, true]);
  }, 300_000);
});
