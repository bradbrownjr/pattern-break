// Regenerates every figure in tools/screenshots/shots.ts into docs/img/.
// Usage: node tools/screenshots/capture.ts [--only id,id] [--list] [--no-build]
// Set PB_CHROMIUM to a Chromium binary when Playwright's own download is not available.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { encodeGif } from './gif.ts';
import { decodePng, type Rgba } from './png.ts';
import { DEFAULT_CLIP_VIEWPORT, DEFAULT_VIEWPORT, shots, type Shot } from './shots.ts';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const DIST = join(ROOT, 'packages', 'client', 'dist');
const OUT = join(ROOT, 'docs', 'img');
const READY_TIMEOUT_MS = 15_000;
/** A clip over this size fails the run: the README loads it on every visit. */
const CLIP_MAX_BYTES = 5 * 1024 * 1024;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mod': 'application/octet-stream',
  '.xm': 'application/octet-stream',
  '.s3m': 'application/octet-stream',
  '.it': 'application/octet-stream',
};

function fail(message: string): never {
  console.error(`screenshots: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): { only: string[] | null; list: boolean; build: boolean } {
  let only: string[] | null = null;
  let list = false;
  let build = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') list = true;
    else if (a === '--no-build') build = false;
    else if (a === '--only') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) fail('--only needs a comma-separated list of shot ids');
      only = v.split(',').map((s) => s.trim()).filter(Boolean);
    } else fail(`unknown argument ${a}`);
  }
  return { only, list, build };
}

function validate(): void {
  const seen = new Set<string>();
  for (const s of shots) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)) fail(`bad shot id "${s.id}" (lowercase letters, digits, hyphens)`);
    if (seen.has(s.id)) fail(`duplicate shot id "${s.id}"`);
    seen.add(s.id);
    if (!s.alt.trim() || !s.caption.trim()) fail(`shot "${s.id}" needs alt text and a caption`);
    if (s.clip) {
      const { from, to, fps } = s.clip;
      if (!(to > from) || !Number.isInteger(fps) || fps <= 0 || 100 % fps !== 0) {
        fail(`shot "${s.id}": a clip needs to > from and a whole fps that divides 100`);
      }
      if ('t' in s.query) fail(`shot "${s.id}": a clip sets t itself; remove it from query`);
    }
  }
}

function startServer(): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    const file = normalize(join(DIST, path.endsWith('/') ? `${path}index.html` : path));
    if (!file.startsWith(DIST + sep) || !existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      done({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function shotUrl(origin: string, shot: Shot): string {
  const q = new URLSearchParams({ capture: '1', ...shot.query, ...(shot.clip ? { t: String(shot.clip.from) } : {}) });
  return `${origin}/?${q.toString()}`;
}

function shotFile(shot: Shot): string {
  return `docs/img/${shot.id}.${shot.clip ? 'gif' : 'png'}`;
}

/** The song time of each frame of a clip: from, from + 1/fps, ..., up to but not including to. */
function clipTimes(clip: NonNullable<Shot['clip']>): number[] {
  const count = Math.round((clip.to - clip.from) * clip.fps);
  const times: number[] = [];
  // Whole frames times a whole frame length, so each time is the same on every run.
  for (let i = 0; i < count; i++) times.push(clip.from + i / clip.fps);
  return times;
}

const SCREENSHOT = { type: 'png' as const, animations: 'disabled' as const, caret: 'hide' as const };

async function screenshot(page: Page, shot: Shot): Promise<Buffer> {
  return shot.element ? page.locator(shot.element).screenshot(SCREENSHOT) : page.screenshot(SCREENSHOT);
}

/**
 * Captures each frame of a clip at its own song time. The page is loaded at the first
 * time; later frames are drawn by window.__pbCaptureSeek, which resolves once the frame
 * is on screen.
 */
async function captureClip(page: Page, shot: Shot): Promise<{ bytes: Uint8Array; frames: number; colors: number; quantized: boolean }> {
  const clip = shot.clip!;
  const times = clipTimes(clip);
  const frames: Rgba[] = [];
  for (let i = 0; i < times.length; i++) {
    if (i > 0) {
      const t = JSON.stringify(times[i]);
      const ok = await page.evaluate(`window.__pbCaptureSeek ? window.__pbCaptureSeek(${t}).then(() => true) : false`);
      if (!ok) throw new Error('the page has no window.__pbCaptureSeek, which clips need');
    }
    frames.push(decodePng(await screenshot(page, shot)));
  }
  const gif = encodeGif(frames, clip.fps);
  return { bytes: gif.bytes, frames: frames.length, colors: gif.colors, quantized: gif.quantized };
}

/** Writes only when the bytes differ, so unchanged figures never show up as modified. */
function writeIfChanged(file: string, data: Buffer | string): boolean {
  if (existsSync(file) && readFileSync(file).equals(Buffer.from(data))) return false;
  writeFileSync(file, data);
  return true;
}

const args = parseArgs(process.argv.slice(2));
validate();

if (args.list) {
  for (const s of shots) console.log(`${s.id}\t${s.usedIn.join(',') || '(not used in docs)'}\t${s.caption}`);
  process.exit(0);
}

let selected = shots;
if (args.only) {
  const unknown = args.only.filter((id) => !shots.some((s) => s.id === id));
  if (unknown.length) fail(`unknown shot id(s): ${unknown.join(', ')} (see --list)`);
  selected = shots.filter((s) => args.only?.includes(s.id));
}

if (args.build) {
  console.log('Building the client...');
  execFileSync('pnpm', ['--filter', '@game/client', 'build'], { cwd: ROOT, stdio: 'inherit' });
}
if (!existsSync(join(DIST, 'index.html'))) fail('packages/client/dist is missing; run without --no-build');

mkdirSync(OUT, { recursive: true });
const server = await startServer();
const executablePath = process.env['PB_CHROMIUM'];
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  // Keep text rendering identical from run to run and machine to machine. WebGL always runs
  // on SwiftShader, Chromium's CPU renderer, so a machine's GPU never changes the pixels and
  // capture mode has WebGL even where Chromium would not fall back to SwiftShader itself.
  args: [
    '--font-render-hinting=none',
    '--disable-lcd-text',
    '--force-color-profile=srgb',
    '--hide-scrollbars',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});

let failed = false;
try {
  for (const shot of selected) {
    const context = await browser.newContext({
      viewport: shot.viewport ?? (shot.clip ? DEFAULT_CLIP_VIEWPORT : DEFAULT_VIEWPORT),
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    // The page's errors and warnings, so a broken shader or a throw shows up here.
    page.on('pageerror', (e) => console.error(`  ${shot.id}: page error: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') console.error(`  ${shot.id}: ${m.type()}: ${m.text()}`);
    });
    try {
      await page.goto(shotUrl(server.origin, shot));
      try {
        await page.waitForFunction('window.__pbCaptureReady === true', null, {
          timeout: READY_TIMEOUT_MS,
        });
      } catch {
        throw new Error(
          `window.__pbCaptureReady was not set within ${READY_TIMEOUT_MS / 1000} s. ` +
            'Does the page implement capture mode (docs/DEVELOPMENT.md, "Screenshots")?',
        );
      }
      if (shot.clip) {
        const clip = await captureClip(page, shot);
        if (clip.bytes.length > CLIP_MAX_BYTES) {
          throw new Error(`the clip is ${clip.bytes.length} bytes, over the ${CLIP_MAX_BYTES} limit; shorten it or lower fps`);
        }
        const changed = writeIfChanged(join(ROOT, shotFile(shot)), Buffer.from(clip.bytes));
        const colors = clip.quantized ? 'quantized to 256 colours' : `${clip.colors} colours`;
        const size = `${(clip.bytes.length / 1024 / 1024).toFixed(2)} MB`;
        console.log(`${changed ? 'wrote' : 'same '} ${shotFile(shot)} (${clip.frames} frames, ${colors}, ${size})`);
      } else {
        const changed = writeIfChanged(join(ROOT, shotFile(shot)), await screenshot(page, shot));
        console.log(`${changed ? 'wrote' : 'same '} ${shotFile(shot)}`);
      }
    } catch (e) {
      failed = true;
      console.error(`screenshots: shot "${shot.id}" failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
if (failed) process.exit(1);

// figures.json lists every shot in the manifest, not only the ones captured this run.
const figures: Record<string, { path: string; alt: string; caption: string; usedIn: string[] }> = {};
for (const s of shots) figures[s.id] = { path: shotFile(s), alt: s.alt, caption: s.caption, usedIn: s.usedIn };
writeIfChanged(join(OUT, 'figures.json'), `${JSON.stringify(figures, null, 2)}\n`);
