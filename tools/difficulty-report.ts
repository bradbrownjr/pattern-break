// M6's difficulty measurements (docs/ROADMAP.md, "Difficulty targets"): for each song and
// difficulty, the level as the game builds it (analysis at the difficulty's tempo, then
// generateLevel), and the autopilot flown through it with the normal lives. Per level:
//
// - enemies a minute, and of those, ships, turrets and tanks;
// - the longest wait between ships while the song plays at least a note a second;
// - enemy bullets on screen at once, the 95th percentile and the most, over the bot's run;
// - the narrowest gap in px, turrets and tank tracks counted as wall (solidWalls), and the
//   5th percentile gap over the bars;
// - how far the bot got (percent of the song) and the lives it lost;
// - the same bot missing HUMAN_MISS_PERCENT of the enemy bullets, a stand-in for a person
//   (docs/PLAN.md, "Difficulty guardrails"): how far it got, the lives it lost, and the
//   shield points it spent a minute.
//
// Usage: node tools/difficulty-report.ts [--check] [--json out.json] [file.mod ...]
// With no files it measures the bundled songs (music/manifest.json) and the test songs
// (packages/analysis/fixtures/test-songs) on easy, normal and hard, and Crush on impossible
// too. An arcade song longer than the arcade's length cap is measured a second time as
// the arcade cuts it, as song@arcade. --check (pnpm check:difficulty) fails unless the guardrails hold (docs/PLAN.md,
// "Difficulty guardrails"): the autopilot finishes every level; on every song each step up
// has more enemies a minute; no level has as many enemies a minute as the median level
// one difficulty up; missing HUMAN_MISS_PERCENT of the bullets, the autopilot finishes
// every easy and normal level; and while the song plays at least a note a second, ships
// never stop for more than DROUGHT_SPACINGS + 1 formation spacings.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { analyze, loadOpenMpt } from '../packages/analysis/src/index.ts';
import {
  ARCADE_MAX_SAMPLES,
  BULLET_SLOTS,
  DROUGHT_SPACINGS,
  Difficulty,
  EnemyKind,
  EnemyTuning,
  PLAYFIELD_HEIGHT,
  SEGMENT_PITCH,
  TICK_HZ,
  autopilotInputs,
  createSimState,
  cutLevelData,
  generateLevel,
  solidWalls,
  tick,
  type DifficultyName,
  type Level,
} from '../packages/core/src/index.ts';

/**
 * The share of enemy bullets (out of 100) the human model misses. With the rules before
 * 2026-11-13, the autopilot missing 15 failed level 1 on normal, as Brad did; at 20 every
 * easy and normal level must be finished.
 */
export const HUMAN_MISS_PERCENT = 20;

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { json: { type: 'string' }, check: { type: 'boolean' } },
});

function listed(folder: string): string[] {
  const manifest = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8')) as { file: string }[];
  return manifest.map((m) => join(folder, m.file));
}
const files =
  positionals.length > 0
    ? positionals.map((f) => resolve(f))
    : [...listed(join(ROOT, 'music')), ...listed(join(ROOT, 'packages', 'analysis', 'fixtures', 'test-songs'))];

export interface LevelReport {
  song: string;
  difficulty: DifficultyName;
  seconds: number;
  enemiesPerMin: number;
  shipsPerMin: number;
  turretsPerMin: number;
  tanksPerMin: number;
  shipGapS: number;
  bulletsP95: number;
  bulletsMax: number;
  gapMinPx: number;
  gapP5Px: number;
  botReachedPct: number;
  botFinished: boolean;
  botLivesLost: number;
  humanReachedPct: number;
  humanFinished: boolean;
  humanLivesLost: number;
  humanShieldPerMin: number;
}

/** Flies `level` with the autopilot missing `missPercent` of the bullets. */
function fly(level: Level, missPercent: number) {
  const inputs = autopilotInputs(level, missPercent);
  const state = createSimState();
  const bullets = new Uint8Array(level.tickCount);
  let t = 0;
  let lost = 0;
  let shieldSpent = 0;
  while (!state.dead && !state.finished && t < level.tickCount) {
    const hit = state.hitTick;
    const shield = state.shield;
    tick(level, state, inputs[t] ?? 0);
    // Extra lives come with the score, so each life lost counts, not the difference.
    if (state.hitTick !== hit) lost++;
    else if (state.shield < shield) shieldSpent += shield - state.shield;
    let n = 0;
    for (let b = 0; b < BULLET_SLOTS; b++) n += state.bulletActive[b]!;
    bullets[t++] = n;
  }
  const reached = state.dead ? state.deathTick : state.tick;
  return {
    bullets: bullets.slice(0, t),
    reachedPct: Math.round((reached / level.tickCount) * 1000) / 10,
    finished: state.finished,
    lost,
    shieldSpent,
  };
}

function percentile(sorted: ArrayLike<number>, q: number): number {
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

function measure(song: string, level: Level): LevelReport {
  const seconds = level.tickCount / TICK_HZ;
  const perMin = (n: number) => Math.round((n / seconds) * 600) / 10;
  const e = level.enemies;
  const kinds = [0, 0, 0];
  // The longest wait between ships while the song keeps playing at least a note a
  // second; a quiet stretch has nothing to make ships from.
  const notesAt = new Uint32Array(level.tickCount + 1);
  for (const t of level.noteTick) if (t < level.tickCount) notesAt[t + 1]!++;
  for (let t = 1; t <= level.tickCount; t++) notesAt[t]! += notesAt[t - 1]!;
  let lastShip = -1;
  let shipGap = 0;
  for (let k = 0; k < e.count; k++) {
    kinds[e.kind[k]!]!++;
    if (e.kind[k] !== EnemyKind.ship) continue;
    const t = e.spawnTick[k]!;
    const busy = (notesAt[t]! - notesAt[lastShip + 1]!) * TICK_HZ >= t - lastShip;
    if (lastShip >= 0 && busy && t - lastShip > shipGap) shipGap = t - lastShip;
    lastShip = t;
  }

  const walls = solidWalls(level);
  const gaps = new Int32Array(level.barCount);
  for (let i = 0; i < level.barCount; i++) gaps[i] = PLAYFIELD_HEIGHT - (walls.ceiling[i]! + walls.floor[i]!) * SEGMENT_PITCH;
  gaps.sort();

  const bot = fly(level, 0);
  const human = fly(level, HUMAN_MISS_PERCENT);
  const flown = bot.bullets.sort();
  return {
    song,
    difficulty: level.difficulty,
    seconds: Math.round(seconds),
    enemiesPerMin: perMin(e.count),
    shipsPerMin: perMin(kinds[EnemyKind.ship]!),
    turretsPerMin: perMin(kinds[EnemyKind.turret]!),
    tanksPerMin: perMin(kinds[EnemyKind.tank]!),
    shipGapS: Math.round((shipGap / TICK_HZ) * 10) / 10,
    bulletsP95: percentile(flown, 0.95),
    bulletsMax: flown.length ? flown[flown.length - 1]! : 0,
    gapMinPx: gaps[0] ?? 0,
    gapP5Px: percentile(gaps, 0.05),
    botReachedPct: bot.reachedPct,
    botFinished: bot.finished,
    botLivesLost: bot.lost,
    humanReachedPct: human.reachedPct,
    humanFinished: human.finished,
    humanLivesLost: human.lost,
    humanShieldPerMin: Math.round((human.shieldSpent / seconds) * 600) / 10,
  };
}

const openmpt = await loadOpenMpt();
const rows: LevelReport[] = [];
const header = ['song', 'diff', 's', 'en/min', 'ship', 'turr', 'tank', 'shpGap', 'bul95', 'bulMax', 'gapMin', 'gap5', 'bot%', 'lost', 'hum%', 'hLost', 'hShld'];
console.log(header.join('\t'));
const arcade = JSON.parse(readFileSync(join(ROOT, 'music', 'arcade.json'), 'utf8')) as { levels: string[]; impossible: string[] };
const arcadeSongs = new Set([...arcade.levels, ...arcade.impossible]);
function report(r: LevelReport): void {
  rows.push(r);
  console.log(
    [r.song, r.difficulty.slice(0, 4), r.seconds, r.enemiesPerMin, r.shipsPerMin, r.turretsPerMin, r.tanksPerMin, r.shipGapS, r.bulletsP95, r.bulletsMax, r.gapMinPx, r.gapP5Px, r.botReachedPct, r.botLivesLost, r.humanReachedPct, r.humanLivesLost, r.humanShieldPerMin].join('\t'),
  );
}
for (const file of files) {
  const song = basename(file).replace(/\.[^.]+$/, '');
  const bytes = new Uint8Array(readFileSync(file));
  const difficulties: DifficultyName[] = ['easy', 'normal', 'hard'];
  if (song === 'crush' && positionals.length === 0) difficulties.push('impossible');
  for (const difficulty of difficulties) {
    const data = analyze(openmpt, bytes, Difficulty[difficulty].tempoPermille);
    report(measure(song, generateLevel(data, difficulty)));
    // An arcade song past the length cap is also measured as the arcade plays it.
    const cut = cutLevelData(data, ARCADE_MAX_SAMPLES);
    if (arcadeSongs.has(song) && cut !== data) report(measure(`${song}@arcade`, generateLevel(cut, difficulty)));
  }
}
if (values.json) writeFileSync(values.json, `${JSON.stringify(rows, null, 2)}\n`);

/** The guardrails' failures, one line each. */
function guardrailFailures(reports: readonly LevelReport[]): string[] {
  const failures: string[] = [];
  for (const r of reports) {
    if (!r.botFinished) failures.push(`${r.song} ${r.difficulty}: the autopilot got ${r.botReachedPct}% of the way`);
  }
  for (const r of reports) {
    if ((r.difficulty === 'easy' || r.difficulty === 'normal') && !r.humanFinished) {
      failures.push(`${r.song} ${r.difficulty}: missing ${HUMAN_MISS_PERCENT}% of the bullets, the autopilot got ${r.humanReachedPct}% of the way`);
    }
  }
  for (const r of reports) {
    const limit = (EnemyTuning[r.difficulty].formationSpacingTicks * (DROUGHT_SPACINGS + 1)) / TICK_HZ;
    if (r.shipGapS > limit) failures.push(`${r.song} ${r.difficulty}: ${r.shipGapS} s without ships while the song plays, over ${limit} s`);
  }
  const steps: DifficultyName[] = ['easy', 'normal', 'hard'];
  const rate = (song: string, d: DifficultyName) => reports.find((r) => r.song === song && r.difficulty === d)?.enemiesPerMin;
  for (const song of new Set(reports.map((r) => r.song))) {
    for (let i = 1; i < steps.length; i++) {
      const lower = rate(song, steps[i - 1]!);
      const upper = rate(song, steps[i]!);
      if (lower !== undefined && upper !== undefined && upper <= lower) {
        failures.push(`${song}: ${upper} enemies a minute on ${steps[i]}, not more than ${lower} on ${steps[i - 1]}`);
      }
    }
  }
  for (let i = 1; i < steps.length; i++) {
    const up = reports.filter((r) => r.difficulty === steps[i]).map((r) => r.enemiesPerMin).sort((a, b) => a - b);
    if (up.length === 0) continue;
    const median = up.length % 2 === 1 ? up[(up.length - 1) / 2]! : (up[up.length / 2 - 1]! + up[up.length / 2]!) / 2;
    for (const r of reports) {
      if (r.difficulty === steps[i - 1] && r.enemiesPerMin >= median) {
        failures.push(`${r.song} ${r.difficulty}: ${r.enemiesPerMin} enemies a minute, at least ${steps[i]}'s median of ${median}`);
      }
    }
  }
  return failures;
}

if (values.check) {
  const failures = guardrailFailures(rows);
  for (const f of failures) console.error(f);
  if (failures.length > 0) process.exit(1);
  console.log(`${rows.length} levels, every guardrail holds`);
}
