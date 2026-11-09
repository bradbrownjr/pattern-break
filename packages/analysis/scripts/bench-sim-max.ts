// The sim at its busiest (docs/PLAN.md, "Testing", "Performance check"): the densest
// level, The_Epic_Chip on hard, with a ship that can't be hit and has double, two options
// and the missile, holding fire and pressing bomb and missile every other tick. Prints the
// most entities seen at once, the time for 10 000 ticks, and what a server-side replay
// check of the whole song costs: analysis, level generation, and the sim.
// Usage: pnpm --filter @game/analysis bench:sim:max [file] [difficulty]

import { readFileSync } from 'node:fs';
import {
  BULLET_SLOTS,
  CAPSULE_SLOTS,
  Difficulty,
  EnemyStatus,
  InputBit,
  MISSILE_SLOTS,
  SHOT_SLOTS,
  autopilotInputs,
  createSimState,
  generateLevel,
  resetSimState,
  tick,
  type DifficultyName,
  type Level,
  type SimState,
} from '@game/core';
import { analyze, loadOpenMpt } from '../src/index.ts';

const file = process.argv[2] ?? new URL('../../../music/the_epic_chip.xm', import.meta.url).pathname;
const difficulty = (process.argv[3] ?? 'hard') as DifficultyName;
if (!(difficulty in Difficulty)) throw new Error(`unknown difficulty ${difficulty}`);
const WINDOW = 10_000;

const bytes = new Uint8Array(readFileSync(file));
const openmpt = await loadOpenMpt();
let t = performance.now();
const levelData = analyze(openmpt, bytes, Difficulty[difficulty].tempoPermille);
const analyzeMs = performance.now() - t;
t = performance.now();
const level = generateLevel(levelData, difficulty);
const levelgenMs = performance.now() - t;

// Autopilot steering, with fire held and bomb and missile pressed every other tick.
const steer = autopilotInputs(level);
const inputs = new Uint16Array(level.tickCount);
for (let k = 0; k < inputs.length; k++) {
  inputs[k] = (steer[k] ?? 0) | InputBit.fire | (k % 2 === 0 ? InputBit.bomb | InputBit.missile : 0);
}

/** Resets `s` with every upgrade that adds entities, and no way to lose a life. */
function armed(s: SimState): void {
  resetSimState(s);
  s.double = true;
  s.missile = true;
  s.options = 2;
  s.safeUntil = 0x7fffffff;
}

function count(a: ArrayLike<number>, n: number): number {
  let c = 0;
  for (let i = 0; i < n; i++) if (a[i] === 1) c++;
  return c;
}

function liveEnemies(s: SimState): number {
  let c = 0;
  for (let i = s.firstLive; i < s.nextSpawn; i++) if (s.enemyStatus[i] === EnemyStatus.alive) c++;
  return c;
}

/** One pass over the song, recording the peaks and the WINDOW-tick span with the most live enemies. */
interface Peaks {
  enemies: number;
  shots: number;
  bullets: number;
  missiles: number;
  capsules: number;
}

function survey(lv: Level): { peaks: Peaks; busiest: number } {
  const s = createSimState();
  armed(s);
  const peaks: Peaks = { enemies: 0, shots: 0, bullets: 0, missiles: 0, capsules: 0 };
  const live = new Uint16Array(lv.tickCount);
  for (let k = 0; k < lv.tickCount && !s.finished; k++) {
    tick(lv, s, inputs[k]!);
    live[k] = liveEnemies(s);
    peaks.enemies = Math.max(peaks.enemies, live[k]!);
    peaks.shots = Math.max(peaks.shots, count(s.shotActive, SHOT_SLOTS));
    peaks.bullets = Math.max(peaks.bullets, count(s.bulletActive, BULLET_SLOTS));
    peaks.missiles = Math.max(peaks.missiles, count(s.missileActive, MISSILE_SLOTS));
    peaks.capsules = Math.max(peaks.capsules, count(s.capsuleActive, CAPSULE_SLOTS));
  }
  let sum = 0;
  let best = 0;
  let busiest = 0;
  for (let k = 0; k < live.length; k++) {
    sum += live[k]!;
    if (k >= WINDOW) sum -= live[k - WINDOW]!;
    if (k >= WINDOW - 1 && sum > best) {
      best = sum;
      busiest = k - WINDOW + 1;
    }
  }
  return { peaks, busiest };
}

const { peaks, busiest } = survey(level);

// Time the busiest WINDOW ticks: run to its start untimed, then time the window, repeatedly.
const s = createSimState();
let windows = 0;
let windowMs = 0;
const until = performance.now() + 2000;
while (performance.now() < until || windows < 3) {
  armed(s);
  for (let k = 0; k < busiest; k++) tick(level, s, inputs[k]!);
  const start = performance.now();
  for (let k = busiest; k < busiest + WINDOW; k++) tick(level, s, inputs[k]!);
  windowMs += performance.now() - start;
  windows++;
}
const perWindow = windowMs / windows;

// The whole song, as the server would run a replay of it.
t = performance.now();
armed(s);
for (let k = 0; k < level.tickCount; k++) tick(level, s, inputs[k]!);
const songMs = performance.now() - t;

const songSeconds = level.tickCount / 120;
console.log(`${file.split('/').pop()} on ${difficulty}: ${level.enemies.count} enemies, ${level.tickCount} ticks (${songSeconds.toFixed(0)} s)`);
console.log(
  `most at once: ${peaks.enemies} enemies, ${peaks.shots}/${SHOT_SLOTS} shots, ${peaks.bullets}/${BULLET_SLOTS} bullets, ` +
    `${peaks.missiles}/${MISSILE_SLOTS} missiles, ${peaks.capsules}/${CAPSULE_SLOTS} capsules`,
);
console.log(`busiest ${WINDOW} ticks (from tick ${busiest}): ${perWindow.toFixed(2)} ms, ${((perWindow * 1000) / WINDOW).toFixed(2)} us a tick (${windows} runs)`);
console.log(
  `replay check of the whole song: analysis ${analyzeMs.toFixed(0)} ms + levelgen ${levelgenMs.toFixed(0)} ms + sim ${songMs.toFixed(0)} ms ` +
    `= ${(analyzeMs + levelgenMs + songMs).toFixed(0)} ms`,
);
