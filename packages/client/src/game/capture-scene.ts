// Capture mode (docs/DEVELOPMENT.md, "Screenshots"): no audio, the song clock pinned to
// `t`, and the ship flown by the autopilot's input log replayed through the sim up to `t`.
// Everything on screen is a function of the query parameters. Scenes: title, jukebox (the
// first song playing, its spectrum dark), controls-keyboard, controls-gamepad, settings (at
// the defaults), play, and paused (play with the pause menu over it).

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
import type { Container } from 'pixi.js';
import { markCaptureReady, type CaptureParams } from '../capture.ts';
import { seededRandom } from '../render/random.ts';
import type { GameRenderer } from '../render/renderer.ts';
import { analyzeInWorker } from './analysis.ts';
import { catchUp, targetTick } from './loop.ts';
import { drawPlay } from './play-view.ts';
import { ControlsScreen } from './controls.ts';
import { JukeboxScreen, PauseScreen, SPECTRUM_BARS, SettingsScreen, TitleScreen } from './screens.ts';
import { DEFAULT_SETTINGS } from './settings.ts';
import { SONGS, TITLE_SONG_ID, fetchSongBytes, findSong, songById } from './songs.ts';

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

  const menuScene = (container: Container): Promise<void> => {
    r.ui.addChild(container);
    r.world.visible = false;
    r.combat.hud.visible = false;
    r.starfield.draw(params.t * TITLE_DRIFT_PX_PER_S);
    r.render();
    return afterPresent().then(markCaptureReady);
  };
  switch (params.scene) {
    case 'title': {
      const title = new TitleScreen();
      title.update({ cursor: 0, practice: song, difficulty, music: songById(TITLE_SONG_ID) }, true);
      return menuScene(title.container);
    }
    case 'jukebox': {
      const jukebox = new JukeboxScreen(SONGS);
      const data = await analyzeInWorker(await fetchSongBytes(SONGS[0]!), 1000);
      const durationSeconds = data.totalSamples / SAMPLE_RATE;
      jukebox.update({ cursor: 0, playing: 0, seconds: params.t, durationSeconds, levels: new Uint8Array(SPECTRUM_BARS) });
      return menuScene(jukebox.container);
    }
    case 'controls-keyboard':
    case 'controls-gamepad': {
      const controls = new ControlsScreen();
      controls.show(params.scene === 'controls-keyboard' ? 'keyboard' : 'gamepad');
      return menuScene(controls.container);
    }
    case 'settings': {
      const settings = new SettingsScreen();
      settings.update(0, DEFAULT_SETTINGS);
      return menuScene(settings.container);
    }
    case 'play':
    case 'paused':
      break;
    default:
      throw new Error(`unknown scene ${params.scene}`);
  }
  if (params.scene === 'paused') {
    const pause = new PauseScreen();
    pause.update(0);
    r.ui.addChild(pause.container);
  }

  const level = generateLevel(await analyzeInWorker(await fetchSongBytes(song), Difficulty[difficulty].tempoPermille), difficulty);
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
