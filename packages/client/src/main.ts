import { BRAND } from './config/brand.ts';
import { readCaptureParams } from './capture.ts';
import { runCapture } from './game/capture-scene.ts';
import { Game } from './game/game.ts';
import { PerfMeter, type PerfSummary } from './game/perf.ts';
import { SONGS } from './game/songs.ts';
import { createGameRenderer } from './render/renderer.ts';

declare global {
  interface Window {
    /** With `?perf=1`: the per-frame cost summary since the run started. */
    __pbPerf?: () => PerfSummary;
  }
}

document.title = BRAND.name;
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app is missing');

const capture = readCaptureParams();
const query = new URLSearchParams(window.location.search);
const renderer = await createGameRenderer({
  parent: app,
  seed: capture?.seed ?? 1,
  preserveDrawingBuffer: capture !== null,
});

if (capture) {
  runCapture(renderer, capture).catch((err: unknown) => {
    console.error('capture failed:', err);
  });
} else {
  const perf = query.get('perf') === '1' ? new PerfMeter() : null;
  if (perf) window.__pbPerf = () => perf.summary();
  new Game(renderer, { song: SONGS[0]!, autopilot: query.get('autopilot') === '1', perf }).start();
}
