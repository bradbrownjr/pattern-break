// M6's difficulty measurements (docs/ROADMAP.md, "Difficulty targets"): for each song and
// difficulty, the level as the game builds it (analysis at the difficulty's tempo, then
// generateLevel), and the autopilot flown through it with the normal lives. Per level:
//
// - enemies a minute, and of those, ships, turrets and tanks;
// - enemy bullets on screen at once, the 95th percentile and the most, over the bot's run;
// - the narrowest gap in px, turrets and tank tracks counted as wall (solidWalls), and the
//   5th percentile gap over the bars;
// - how far the bot got (percent of the song) and the lives it lost.
//
// Usage: node tools/difficulty-report.ts [--check] [--json out.json] [file.mod ...]
// With no files it measures the bundled songs (music/manifest.json) and the test songs
// (packages/analysis/fixtures/test-songs) on easy, normal and hard, and Crush on impossible
// too. --check (pnpm check:difficulty) fails unless the guardrails hold (docs/PLAN.md,
// "Difficulty guardrails"): the autopilot finishes every level; on every song each step up
// has more enemies a minute; and no level has as many enemies a minute as the median level
// one difficulty up.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { analyze, loadOpenMpt } from '../packages/analysis/src/index.ts';
import {
  BULLET_SLOTS,
  Difficulty,
  EnemyKind,
  PLAYFIELD_HEIGHT,
  SEGMENT_PITCH,
  TICK_HZ,
  autopilotInputs,
  createSimState,
  generateLevel,
  solidWalls,
  tick,
  type DifficultyName,
  type Level,
} from '../packages/core/src/index.ts';

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
  bulletsP95: number;
  bulletsMax: number;
  gapMinPx: number;
  gapP5Px: number;
  botReachedPct: number;
  botFinished: boolean;
  botLivesLost: number;
}

function percentile(sorted: ArrayLike<number>, q: number): number {
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

function measure(song: string, level: Level): LevelReport {
  const seconds = level.tickCount / TICK_HZ;
  const perMin = (n: number) => Math.round((n / seconds) * 600) / 10;
  const e = level.enemies;
  const kinds = [0, 0, 0];
  for (let k = 0; k < e.count; k++) kinds[e.kind[k]!]!++;

  const walls = solidWalls(level);
  const gaps = new Int32Array(level.barCount);
  for (let i = 0; i < level.barCount; i++) gaps[i] = PLAYFIELD_HEIGHT - (walls.ceiling[i]! + walls.floor[i]!) * SEGMENT_PITCH;
  gaps.sort();

  const inputs = autopilotInputs(level);
  const state = createSimState();
  const bullets = new Uint8Array(level.tickCount);
  let t = 0;
  let lost = 0;
  while (!state.dead && !state.finished && t < level.tickCount) {
    const hit = state.hitTick;
    tick(level, state, inputs[t] ?? 0);
    // Extra lives come with the score, so each life lost counts, not the difference.
    if (state.hitTick !== hit) lost++;
    let n = 0;
    for (let b = 0; b < BULLET_SLOTS; b++) n += state.bulletActive[b]!;
    bullets[t++] = n;
  }
  const flown = bullets.slice(0, t).sort();
  const reached = state.dead ? state.deathTick : state.tick;
  return {
    song,
    difficulty: level.difficulty,
    seconds: Math.round(seconds),
    enemiesPerMin: perMin(e.count),
    shipsPerMin: perMin(kinds[EnemyKind.ship]!),
    turretsPerMin: perMin(kinds[EnemyKind.turret]!),
    tanksPerMin: perMin(kinds[EnemyKind.tank]!),
    bulletsP95: percentile(flown, 0.95),
    bulletsMax: flown.length ? flown[flown.length - 1]! : 0,
    gapMinPx: gaps[0] ?? 0,
    gapP5Px: percentile(gaps, 0.05),
    botReachedPct: Math.round((reached / level.tickCount) * 1000) / 10,
    botFinished: state.finished,
    botLivesLost: lost,
  };
}

const openmpt = await loadOpenMpt();
const rows: LevelReport[] = [];
const header = ['song', 'diff', 's', 'en/min', 'ship', 'turr', 'tank', 'bul95', 'bulMax', 'gapMin', 'gap5', 'bot%', 'lost'];
console.log(header.join('\t'));
for (const file of files) {
  const song = basename(file).replace(/\.[^.]+$/, '');
  const bytes = new Uint8Array(readFileSync(file));
  const difficulties: DifficultyName[] = ['easy', 'normal', 'hard'];
  if (song === 'crush' && positionals.length === 0) difficulties.push('impossible');
  for (const difficulty of difficulties) {
    const data = analyze(openmpt, bytes, Difficulty[difficulty].tempoPermille);
    const r = measure(song, generateLevel(data, difficulty));
    rows.push(r);
    console.log(
      [r.song, r.difficulty.slice(0, 4), r.seconds, r.enemiesPerMin, r.shipsPerMin, r.turretsPerMin, r.tanksPerMin, r.bulletsP95, r.bulletsMax, r.gapMinPx, r.gapP5Px, r.botReachedPct, r.botLivesLost].join('\t'),
    );
  }
}
if (values.json) writeFileSync(values.json, `${JSON.stringify(rows, null, 2)}\n`);

/** The guardrails' failures, one line each. */
function guardrailFailures(reports: readonly LevelReport[]): string[] {
  const failures: string[] = [];
  for (const r of reports) {
    if (!r.botFinished) failures.push(`${r.song} ${r.difficulty}: the autopilot got ${r.botReachedPct}% of the way`);
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
