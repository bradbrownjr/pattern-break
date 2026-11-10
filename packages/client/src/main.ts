import { BRAND } from './config/brand.ts';
import { readCaptureParams } from './capture.ts';
import { runCapture } from './game/capture-scene.ts';
import { Game } from './game/game.ts';
import { PerfMeter, type PerfSummary } from './game/perf.ts';
import { SONGS, TITLE_SONG_ID, findSong, songById } from './game/songs.ts';
import { createGameRenderer } from './render/renderer.ts';

declare global {
  interface Window {
    /** With `?perf=1`: the per-frame cost summary since the run started. */
    __pbPerf?: () => PerfSummary;
  }
}

document.title = BRAND.name;

// The service worker that caches the game for offline play (src/sw.ts). Only production
// builds have one; browsers allow it only on HTTPS or localhost, so elsewhere the game runs
// online only.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
    console.warn('offline play unavailable:', err);
  });
}
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
  // `?song=<id>` starts Practice on that song; the test song is offered only when named.
  const named = query.get('song');
  const song = (named === null ? null : findSong(named)) ?? songById(TITLE_SONG_ID);
  const songs = SONGS.includes(song) ? SONGS : [song, ...SONGS];
  new Game(renderer, { songs, song, autopilot: query.get('autopilot') === '1', perf }).start();
}
