// Records packages/analysis/fixtures/replay-neon_techno-normal.pbreplay, the replay that
// test/replay.test.ts runs in Node and the browsers (docs/DEVELOPMENT.md, "Replays"). It
// builds the client, serves it, and in headless Chromium plays level 1 (Neon Techno on
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
const OUT = join(ROOT, 'packages/analysis/fixtures/replay-neon_techno-normal.pbreplay');
/** The longest a run may take before the script gives up: level 1 is at most 2:30 since the arcade length cap. */
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
  // The run's end shows the clear or game over screen (Game.#setMode writes the mode to
  // <html data-mode>). Once its key delay has passed, S saves the replay. A screen that
  // asks for a name first takes the S as a letter: then Esc skips posting and S saves.
  // (A cleared level the arcade's length cap cut asks for no name until the run ends.)
  await page.waitForSelector('html[data-mode="complete"], html[data-mode="gameover"]', {
    state: 'attached',
    timeout: RUN_LIMIT_MS,
  });
  await page.waitForTimeout(2000);
  const save = () =>
    Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.keyboard.press('KeyS')]).then(
      ([d]) => d,
      () => null,
    );
  let download = await save();
  if (!download) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    download = await save();
  }
  if (!download) throw new Error('the end screen gave no replay for S');
  await download.saveAs(OUT);
  console.log(`run ended after ${((Date.now() - start) / 1000).toFixed(0)} s: ${download.suggestedFilename()}`);
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
  server.close();
}
