// M6's performance check (docs/DEVELOPMENT.md, "Performance"): each bundled song's level
// flown by the autopilot in headless Chromium, with Chrome's CPU throttling on, and the
// per-frame work of the sim and renderer (the client's ?perf=1 meter) reported per song.
// Infinite lives (the Konami code on the title) keep the run going whatever the autopilot
// hits. Runs on the built client.
//
// Usage: pnpm build, then
//   node tools/perf-check.ts [--rate 4] [--seconds 45] [--difficulty hard] [--dist dir] [song id ...]
// --rate is Chrome's CPU slowdown (1 for none); --dist serves another build of the client. Prints one row per song, then the worst
// 95th percentile; exits 1 if it is --limit ms (default 8) or over. PB_CHROMIUM names a
// Chromium to use in place of Playwright's.

import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright';
import { createStaticServer } from '../packages/server/src/static.ts';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    rate: { type: 'string', default: '4' },
    seconds: { type: 'string', default: '45' },
    difficulty: { type: 'string', default: 'hard' },
    limit: { type: 'string', default: '8' },
    dist: { type: 'string', default: join(ROOT, 'packages', 'client', 'dist') },
  },
});
const rate = Number(values.rate);
const seconds = Number(values.seconds);
const limit = Number(values.limit);
const difficultySteps: Record<string, number> = { easy: -1, normal: 0, hard: 1 };
const chosen = difficultySteps[values.difficulty];
if (chosen === undefined) throw new Error('--difficulty is easy, normal or hard');
const steps: number = chosen;

const manifest = JSON.parse(readFileSync(join(ROOT, 'music', 'manifest.json'), 'utf8')) as { file: string }[];
const songs = positionals.length > 0 ? positionals : manifest.map((m) => m.file.replace(/\.[^.]+$/, ''));

const server = createStaticServer({ root: resolve(values.dist) });
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const executablePath = process.env['PB_CHROMIUM'];
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Page-side code goes as strings: this file is type-checked without the DOM's types.
const mode = (page: Page) => page.evaluate<string | undefined>('document.documentElement.dataset.mode');
const inMode = (m: string) => `document.documentElement.dataset.mode === '${m}'`;

async function keys(page: Page, ...codes: string[]): Promise<void> {
  for (const code of codes) await page.keyboard.press(code);
}

interface PerfSummary {
  frames: number;
  meanMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

interface Row {
  song: string;
  frames: number;
  fps: number;
  meanMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

async function measure(song: string): Promise<Row> {
  const context = await browser.newContext({ viewport: { width: 1152, height: 648 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(`${origin}/?song=${encodeURIComponent(song)}&autopilot=1&perf=1`);
    await page.waitForFunction(inMode('start'), null, { timeout: 30_000 });
    await keys(page, 'Space');
    await page.waitForFunction(inMode('title'));
    await keys(page, 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA');
    // Difficulty, then Levels, which plays the song named in the URL.
    await keys(page, 'ArrowDown', 'ArrowDown');
    for (let i = 0; i < Math.abs(steps); i++) await keys(page, steps > 0 ? 'ArrowRight' : 'ArrowLeft');
    await keys(page, 'ArrowUp', 'Enter');
    await page.waitForFunction(inMode('play'), null, { timeout: 180_000 });
    if (rate > 1) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    }
    await page.evaluate('window.__pbPerfReset?.()');
    const startedAt = Date.now();
    await sleep(seconds * 1000);
    const elapsed = (Date.now() - startedAt) / 1000;
    const m = await mode(page);
    const s = await page.evaluate<PerfSummary>('window.__pbPerf()');
    if (m !== 'play') errors.push(`ended in ${m}`);
    if (errors.length > 0) console.error(`${song}: ${errors.join('; ')}`);
    return { song, frames: s.frames, fps: s.frames / elapsed, meanMs: s.meanMs, p95Ms: s.p95Ms, p99Ms: s.p99Ms, maxMs: s.maxMs };
  } finally {
    await context.close();
  }
}

console.log(`CPU ${rate}x, ${values.difficulty}, ${seconds} s of each level; work per frame in ms`);
console.log('song'.padEnd(26) + 'frames   fps   mean    p95    p99    max');
const rows: Row[] = [];
for (const song of songs) {
  const r = await measure(song);
  rows.push(r);
  console.log(
    r.song.padEnd(26) +
      String(r.frames).padStart(6) +
      r.fps.toFixed(0).padStart(6) +
      [r.meanMs, r.p95Ms, r.p99Ms, r.maxMs].map((v) => v.toFixed(1).padStart(7)).join(''),
  );
}
await browser.close();
server.close();
const worst = rows.reduce((a, b) => (b.p95Ms > a.p95Ms ? b : a));
console.log(`worst p95: ${worst.p95Ms.toFixed(1)} ms (${worst.song}), limit ${limit} ms`);
process.exit(worst.p95Ms < limit ? 0 : 1);
