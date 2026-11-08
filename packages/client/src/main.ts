import { BRAND } from './config/brand.ts';
import { readCaptureParams } from './capture.ts';
import { runCapture } from './game/capture-scene.ts';
import { Game } from './game/game.ts';
import { PerfMeter, type PerfSummary } from './game/perf.ts';
import { SONGS, findSong } from './game/songs.ts';
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
  // `?song=<id>` starts the menu on that song; the test song is offered only when named.
  const song = findSong(query.get('song')) ?? SONGS[0]!;
  const songs = SONGS.includes(song) ? SONGS : [song, ...SONGS];
  new Game(renderer, { songs, song, autopilot: query.get('autopilot') === '1', perf }).start();
}
