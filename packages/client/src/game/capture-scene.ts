// Capture mode (docs/DEVELOPMENT.md, "Screenshots"): no audio, the song clock pinned to
// `t`, and the ship flown by the autopilot's input log replayed through the sim up to `t`.
// Everything on screen is a function of the query parameters.

import {
  Difficulty,
  Q8,
  SAMPLES_PER_TICK,
  SAMPLE_RATE,
  autopilotInputs,
  createSimState,
  generateLevel,
  resetSimState,
  type DifficultyName,
  type SimState,
} from '@game/core';
import { markCaptureReady, type CaptureParams } from '../capture.ts';
import { seededRandom } from '../render/random.ts';
import type { GameRenderer } from '../render/renderer.ts';
import { analyzeInWorker } from './analysis.ts';
import { catchUp, targetTick } from './loop.ts';
import { drawPlay } from './play-view.ts';
import { TitleScreen } from './screens.ts';
import { fetchSongBytes, findSong } from './songs.ts';

declare global {
  interface Window {
    /**
     * Capture mode, play scene: redraws the frame at song time `t` seconds and resolves once
     * it is on screen. The clip pipeline calls it for each frame after the first.
     */
    __pbCaptureSeek?: (t: number) => Promise<void>;
  }
}

/** Title screen stars drift by this many px per second of `t`. */
const TITLE_DRIFT_PX_PER_S = 40;

/** Resolves after the browser has presented the last frame drawn. */
function afterPresent(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export async function runCapture(r: GameRenderer, params: CaptureParams): Promise<void> {
  if (r.renderer.name !== 'webgl') throw new Error(`capture mode needs WebGL; got ${r.renderer.name}`);
  const song = findSong(params.song);
  if (!song) throw new Error(`unknown song ${params.song ?? ''}`);
  const difficulty: DifficultyName = params.difficulty in Difficulty ? (params.difficulty as DifficultyName) : 'normal';

  if (params.scene === 'title') {
    const title = new TitleScreen();
    r.ui.addChild(title.container);
    r.world.visible = false;
    title.update({ cursor: 0, song, difficulty }, true);
    r.starfield.draw(params.t * TITLE_DRIFT_PX_PER_S);
    r.render();
    await afterPresent();
    markCaptureReady();
    return;
  }
  if (params.scene !== 'play') throw new Error(`unknown scene ${params.scene}`);

  const level = generateLevel(await analyzeInWorker(await fetchSongBytes(song)), difficulty);
  const inputs = autopilotInputs(level);
  const state = createSimState();
  r.terrain.setLevel(level);

  const draw = (t: number) => {
    const samples = Math.round(t * SAMPLE_RATE);
    const target = targetTick(samples, level.tickCount);
    if (target < state.tick) resetSimState(state);
    catchUp(level, state, target, (tick) => inputs[tick] ?? 0, null);
    // The sim stops at a crash; the picture shows the crash at the tick it happened.
    const shown = state.dead ? state.deathTick * SAMPLES_PER_TICK : samples;
    drawPlay(r, level, state, Math.max(0, Math.min(shown, level.tickCount * SAMPLES_PER_TICK)));
    drawCrash(r, state, samples, params.seed);
    r.render();
  };

  window.__pbCaptureSeek = async (t: number) => {
    draw(t);
    await afterPresent();
  };
  draw(params.t);
  await afterPresent();
  markCaptureReady();
}

/** The explosion and flash, timed from the crash in song time, when the autopilot crashed before `samples`. */
function drawCrash(r: GameRenderer, state: SimState, samples: number, seed: number): void {
  if (!state.dead) {
    r.explosion.hide();
    r.flash.hide();
    return;
  }
  const elapsedMs = ((samples - state.deathTick * SAMPLES_PER_TICK) * 1000) / SAMPLE_RATE;
  r.explosion.start(state.shipX / Q8, state.shipY / Q8, seededRandom(seed));
  r.explosion.draw(elapsedMs);
  r.flash.draw(elapsedMs);
}
