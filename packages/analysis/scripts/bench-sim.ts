// Generates a level for each difficulty from a module (a song file made in a music
// tracker), flies it with the autopilot, and measures how many sim ticks per second
// runInputLog manages.
// Usage: pnpm --filter @game/analysis bench:sim [file.mod]

import { readFileSync } from 'node:fs';
import {
  Difficulty,
  TICK_HZ,
  autopilotInputs,
  createSimState,
  generateLevel,
  resetSimState,
  runInputLog,
  type DifficultyName,
} from '@game/core';
import { analyze, loadOpenMpt } from '../src/index.ts';

const file = process.argv[2] ?? new URL('../fixtures/pb-fixture-01.mod', import.meta.url).pathname;
const openmpt = await loadOpenMpt();
const bytes = new Uint8Array(readFileSync(file));

for (const name of Object.keys(Difficulty) as DifficultyName[]) {
  // Each difficulty plays the song at its own tempo, so each needs its own LevelData.
  const level = generateLevel(analyze(openmpt, bytes, Difficulty[name].tempoPermille), name);
  const inputs = autopilotInputs(level);
  const state = createSimState();
  // Warm up, then time enough full-song runs to take about a second.
  runInputLog(level, inputs, state);
  const outcome = state.dead ? `died at tick ${state.deathTick}` : 'survived';
  let runs = 0;
  let ticks = 0;
  const start = performance.now();
  while (performance.now() - start < 1000) {
    resetSimState(state);
    runInputLog(level, inputs, state);
    ticks += state.tick;
    runs++;
  }
  const seconds = (performance.now() - start) / 1000;
  const rate = ticks / seconds;
  console.log(
    `${name.padEnd(7)} bars ${level.barCount}, ticks ${level.tickCount}, autopilot ${outcome}; ` +
      `${(rate / 1e6).toFixed(1)} M ticks/s (${Math.round(rate / TICK_HZ)}x real time, ${runs} runs)`,
  );
}
