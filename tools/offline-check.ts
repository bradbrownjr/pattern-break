// M4's acceptance check for install and offline play (docs/ROADMAP.md, docs/DEVELOPMENT.md,
// "Install and offline"), in headless Chromium against the built client:
//
// 1. Chromium finds nothing stopping the page from installing as an app.
// 2. The service worker installs and takes control.
// 3. The server stops, so there is no network at all, and the page reloads from the cache.
// 4. A song file is imported in the Jukebox, which analyzes it in the worker (libopenmpt's
//    WASM from the cache) and stores it.
// 5. Practice starts a run on the imported song.
//
// It follows the game's screens through <html data-mode>, which Game.#setMode keeps.
//
// Usage: pnpm build, then node tools/offline-check.ts. PB_CHROMIUM names a Chromium to use
// in place of Playwright's.

import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { createStaticServer } from '../packages/server/src/static.ts';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const DIST = join(ROOT, 'packages', 'client', 'dist');
const SONG = join(ROOT, 'packages', 'analysis', 'fixtures', 'pb-fixture-01.mod');

function fail(message: string): never {
  console.error(`offline check failed: ${message}`);
  process.exit(1);
}

function pass(message: string): void {
  console.log(`ok  ${message}`);
}

if (!existsSync(join(DIST, 'sw.js'))) fail('packages/client/dist/sw.js is missing; run pnpm build first');

const server = createStaticServer({ root: DIST });
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
// 127.0.0.1 is a secure context, as HTTPS is, so the service worker and WebCrypto work.
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const executablePath = process.env['PB_CHROMIUM'];
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 768, height: 432 } });
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
// Playwright turns on file chooser interception, an asynchronous call to the browser, when
// the first listener is added. Added just before the key press, a slow machine (CI) can
// open the picker before interception is on, and the event never comes.
const chooser = page.waitForEvent('filechooser', { timeout: 0 });

async function press(p: Page, key: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await p.keyboard.press(key);
    await p.waitForTimeout(120);
  }
}

// Code run in the page is passed as text: this tool is type-checked without the DOM's types.

/** The imported songs' file names, from the game's IndexedDB. */
function importedSongs(p: Page): Promise<string[]> {
  return p.evaluate(`new Promise((done, reject) => {
    const open = indexedDB.open('pattern-break');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const all = db.transaction('songs').objectStore('songs').getAll();
      all.onsuccess = () => {
        db.close();
        done(all.result.map((s) => s.fileName));
      };
    };
  })`);
}

/** Waits until the game shows one of `modes` (Game.#setMode writes it to <html data-mode>). */
async function screen(p: Page, ...modes: string[]): Promise<void> {
  await p.waitForSelector(modes.map((m) => `html[data-mode="${m}"]`).join(', '), { state: 'attached', timeout: 60_000 });
}

try {
  await page.goto(origin);

  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[];
  };
  if (installabilityErrors.length > 0) fail(`not installable: ${installabilityErrors.map((e) => e.errorId).join(', ')}`);
  pass('installable');

  await page.waitForFunction('navigator.serviceWorker.controller !== null', null, { timeout: 60_000 });
  const cached = await page.evaluate<number>(`(async () => {
    let n = 0;
    for (const name of await caches.keys()) n += (await (await caches.open(name)).keys()).length;
    return n;
  })()`);
  pass(`service worker in control, ${cached} files cached`);

  // No network: the server stops and the browser is told it is offline.
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await context.setOffline(true);
  await page.reload();
  await screen(page, 'start');
  pass('reloaded with no network');

  // The title, then the Jukebox (Play, Practice, Difficulty, Scores, Jukebox), then Import.
  await press(page, 'Space');
  await screen(page, 'title');
  await press(page, 'ArrowDown', 4);
  await press(page, 'Enter');
  await screen(page, 'jukebox');
  await press(page, 'ArrowUp', 2);
  await press(page, 'Enter');
  const picked = await Promise.race([chooser, page.waitForTimeout(10_000).then(() => null)]);
  if (!picked) fail('the file picker did not open');
  await picked.setFiles(SONG);
  const deadline = Date.now() + 60_000;
  while (!(await importedSongs(page)).includes('pb-fixture-01.mod')) {
    if (Date.now() > deadline) fail('the imported song was not stored');
    await page.waitForTimeout(500);
  }
  pass('imported a song offline');

  // Back to the title, up to Practice, left to the last song (the imported one), start.
  await press(page, 'Escape');
  await screen(page, 'title');
  await press(page, 'ArrowUp', 3);
  await press(page, 'ArrowLeft');
  await press(page, 'Enter');
  await screen(page, 'play', 'error');
  if ((await page.getAttribute('html', 'data-mode')) !== 'play') fail('the run did not start');
  pass('started a run on the imported song');

  if (errors.length > 0) fail(`page errors: ${errors.join('; ')}`);
  pass('no page errors');
} finally {
  await browser.close();
  if (server.listening) server.close();
}
