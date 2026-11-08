// Analyzes a module and prints the SHA-256 of its serialized LevelData, plus a summary.
// Usage: pnpm --filter @game/analysis analyze <file.mod>

import { readFileSync } from 'node:fs';
import { analyze, hashLevelData, loadOpenMpt } from '../src/index.ts';

const file = process.argv[2];
if (!file) {
  console.error('Usage: pnpm --filter @game/analysis analyze <module file>');
  process.exit(2);
}

const bytes = new Uint8Array(readFileSync(file));
const openmpt = await loadOpenMpt();
const level = analyze(openmpt, bytes);
const hash = await hashLevelData(level);
const seconds = level.totalSamples / level.params.sampleRate;

console.log(`file         ${file}`);
console.log(`title        ${level.meta.title}`);
console.log(`libopenmpt   ${level.libopenmptVersion}`);
console.log(`duration     ${seconds.toFixed(2)} s${level.hitDurationCap ? ' (hit the 15-minute cap)' : ''}`);
console.log(`rows played  ${level.rows.timeSamples.length}`);
console.log(`note events  ${level.notes.timeSamples.length}`);
console.log(`frames       ${level.frames.frameCount}`);
console.log(`leveldata    ${hash}`);
