// Records packages/analysis/fixtures/replay-numenchip-normal.pbreplay, the replay that
// test/replay.test.ts runs in Node and the browsers (docs/DEVELOPMENT.md, "Replays"). It
// builds the client, serves it, and in headless Chromium plays level 1 (Numen in Da Chip on
// normal) with ?autopilot=1 through the game's own loop, and saves the replay with S when
// the run ends. Run it after a GEN_VERSION or SIM_VERSION bump, then run
// `pnpm --filter @game/analysis test test/replay.test.ts` to check it.
// Usage: node tools/record-replay.ts [--no-build]
// Set PB_CHROMIUM to a Chromium binary when Playwright's own download is not available.

import { execFileSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createStaticServer } from '../packages/server/src/static.ts';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const OUT = join(ROOT, 'packages/analysis/fixtures/replay-numenchip-normal.pbreplay');
/** The longest a run may take before the script gives up: the song is about 4 minutes. */
const RUN_LIMIT_MS = 300_000;

if (!process.argv.includes('--no-build')) {
  execFileSync('pnpm', ['--filter', '@game/client', 'build'], { cwd: ROOT, stdio: 'inherit' });
}
const server = createStaticServer({ root: join(ROOT, 'packages/client/dist') });
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const executablePath = process.env['PB_CHROMIUM'];
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await (await browser.newContext({ viewport: { width: 768, height: 432 }, acceptDownloads: true })).newPage();
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  await page.goto(`${origin}/?autopilot=1`);
  await page.waitForTimeout(800);
  await page.keyboard.press('Space'); // leaves the start screen
  await page.waitForTimeout(1500);
  await page.keyboard.press('Enter'); // Play: level 1 on normal
  const start = Date.now();
  // S saves the replay only once the run has ended, so press it until a download comes.
  let download = null;
  while (!download && Date.now() - start < RUN_LIMIT_MS) {
    await page.waitForTimeout(5000);
    download = await Promise.all([page.waitForEvent('download', { timeout: 1500 }), page.keyboard.press('KeyS')]).then(
      ([d]) => d,
      () => null,
    );
  }
  if (!download) throw new Error(`no replay after ${RUN_LIMIT_MS / 1000} s`);
  await download.saveAs(OUT);
  console.log(`run ended after ${((Date.now() - start) / 1000).toFixed(0)} s: ${download.suggestedFilename()}`);
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
  server.close();
}
