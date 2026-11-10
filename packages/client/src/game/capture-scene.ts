// Capture mode (docs/DEVELOPMENT.md, "Screenshots"): no audio, the song clock pinned to
// `t`, and the ship flown by the autopilot's input log replayed through the sim up to `t`.
// Everything on screen is a function of the query parameters. Scenes: title, jukebox (the
// first song playing, its spectrum dark), controls-arrows, controls-wasd and
// controls-gamepad, settings (at the defaults), keys (the Keys screen at the defaults, on
// Fire's first slot), help and help-end (scrolled to the top and to the end), credits (at its
// top), hangar (the intro,
// `t` seconds from its start, for `song` as level 1), play (with `boom`, the ship blowing
// up), run-start (play from the
// hangar: the canopy closing and the colour flooding in), paused (play with the pause
// menu over it), and results (play with the results over it, as if the song ended at `t`,
// the score a new best).

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
import { songLook } from '../render/copper.ts';
import { LIME } from '../render/palette.ts';
import { seededRandom } from '../render/random.ts';
import type { GameRenderer } from '../render/renderer.ts';
import { analyzeInWorker } from './analysis.ts';
import { catchUp, targetTick } from './loop.ts';
import { drawPlay } from './play-view.ts';
import { defaultBindings } from './bindings.ts';
import { ControlsScreen } from './controls.ts';
import { KeysScreen } from './keys-screen.ts';
import { JukeboxScreen, MessageScreen, PauseScreen, SPECTRUM_BARS, SettingsScreen, TitleScreen } from './screens.ts';
import { REPLAY_HINT, resultRows, scoreBreakdown } from './results.ts';
import { DEFAULT_SETTINGS } from './settings.ts';
import { ColourFlood, HangarIntro, WIPE_MS, loadHangarArt } from './hangar.ts';
import { CreditsScreen, creditRows } from './credits.ts';
import { HelpScreen } from './help.ts';
import { DIFFICULTY_LABELS, type ControlPage } from './menu.ts';
import { FOLDER_PICKER, SONGS, TITLE_SONG_ID, fetchSongBytes, findSong, songById } from './songs.ts';

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
  r.crt = params.crt;
  r.terrain.setColourBlind(params.colourBlind);

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
      title.update({ cursor: 0, practice: song, difficulty, music: songById(TITLE_SONG_ID), secret: '' }, true);
      return menuScene(title.container);
    }
    case 'jukebox': {
      const jukebox = new JukeboxScreen(SONGS, FOLDER_PICKER);
      const data = await analyzeInWorker(await fetchSongBytes(SONGS[0]!), 1000);
      const durationSeconds = data.totalSamples / SAMPLE_RATE;
      jukebox.update({ cursor: 0, playing: 0, seconds: params.t, durationSeconds, levels: new Uint8Array(SPECTRUM_BARS), note: '', warn: false, removeHint: '', removeArmed: false, importFolder: false });
      return menuScene(jukebox.container);
    }
    case 'controls-arrows':
    case 'controls-wasd':
    case 'controls-gamepad': {
      const controls = new ControlsScreen();
      controls.show(params.scene.slice('controls-'.length) as ControlPage, defaultBindings());
      return menuScene(controls.container);
    }
    case 'help':
    case 'help-end': {
      const help = new HelpScreen();
      if (params.scene === 'help-end') help.scroller.top = help.scroller.maxTop;
      help.update();
      return menuScene(help.container);
    }
    case 'credits': {
      const rows = creditRows(SONGS);
      const credits = new CreditsScreen(rows);
      credits.update(rows.findIndex((r) => 'url' in r));
      return menuScene(credits.container);
    }
    case 'settings': {
      const settings = new SettingsScreen();
      settings.update(0, DEFAULT_SETTINGS);
      return menuScene(settings.container);
    }
    case 'keys': {
      const keys = new KeysScreen();
      keys.update({
        device: 'keyboard',
        row: 5,
        slot: 0,
        layout: defaultBindings().keys,
        standard: true,
        padName: '',
        waiting: false,
        blink: true,
        hint: 'Enter Set  Del Clear  Esc Back',
        warn: false,
      });
      return menuScene(keys.container);
    }
    case 'hangar': {
      const hangar = new HangarIntro(await loadHangarArt());
      hangar.setSong('Level 1', song.title, song.credit, DIFFICULTY_LABELS[difficulty]);
      hangar.setAlarm(difficulty === 'impossible');
      r.ui.addChild(hangar.container);
      r.world.visible = false;
      r.combat.hud.visible = false;
      const drawHangar = (t: number) => {
        hangar.draw(t * 1000);
        r.render();
      };
      window.__pbCaptureSeek = async (t: number) => {
        drawHangar(t);
        await afterPresent();
      };
      drawHangar(params.t);
      await afterPresent();
      markCaptureReady();
      return;
    }
    case 'play':
    case 'paused':
    case 'run-start':
    case 'results':
      break;
    default:
      throw new Error(`unknown scene ${params.scene}`);
  }
  // The results as if the song ended at `t`, the score a new best.
  const results = params.scene === 'results' ? new MessageScreen() : null;
  if (results) r.ui.addChild(results.container);
  if (params.scene === 'paused') {
    const pause = new PauseScreen();
    pause.update(0);
    r.ui.addChild(pause.container);
  }

  const data = await analyzeInWorker(await fetchSongBytes(song), Difficulty[difficulty].tempoPermille);
  const level = generateLevel(data, difficulty);
  const look = songLook(data);
  r.copper.setSong(look);
  r.sparks.setSong(level, look);
  const inputs = autopilotInputs(level);
  const state = createSimState();
  r.terrain.setLevel(level);
  const runStart =
    params.scene === 'run-start' ? { hangar: new HangarIntro(await loadHangarArt()), flood: new ColourFlood() } : null;
  if (runStart) {
    runStart.hangar.setSong('Level 1', song.title, song.credit, DIFFICULTY_LABELS[difficulty]);
    r.ui.addChild(runStart.hangar.container);
  }

  const draw = (t: number) => {
    const samples = Math.round(t * SAMPLE_RATE);
    const target = targetTick(samples, level.tickCount);
    if (target < state.tick) resetSimState(state);
    catchUp(level, state, target, (tick) => inputs[tick] ?? 0, null);
    // The sim stops at a crash; the picture shows the crash at the tick it happened.
    const shown = state.dead ? state.deathTick * SAMPLES_PER_TICK : samples;
    // With `boom`, the ship is gone: draw it with no shield (a copy; the sim keeps its own).
    const view = params.boom === null ? state : { ...state, shield: 0 };
    drawPlay(r, level, view, Math.max(0, Math.min(shown, level.tickCount * SAMPLES_PER_TICK)));
    drawCrash(r, state, samples, params.seed);
    if (results) {
      const rows = resultRows(scoreBreakdown(state), { previous: null, isNew: true });
      const lines = [`${song.title}, ${DIFFICULTY_LABELS[difficulty]}`, ...rows, REPLAY_HINT, 'Any key Title'];
      results.show('Song clear', LIME, lines, rows.length);
    }
    if (params.boom !== null) {
      r.ship.visible = false;
      r.explosion.start(state.shipX / Q8, state.shipY / Q8, seededRandom(params.seed));
      r.explosion.draw(params.boom);
      r.shake(params.boom, params.seed);
    }
    if (runStart) {
      const ms = (samples * 1000) / SAMPLE_RATE;
      runStart.hangar.container.visible = ms < WIPE_MS;
      if (ms < WIPE_MS) runStart.hangar.drawWipe(ms);
      const amount = ColourFlood.amount(level, samples);
      runStart.flood.set(amount);
      r.stage.filters = amount < 1 ? [runStart.flood.filter] : null;
    }
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
  r.flash.start((state.deathTick * SAMPLES_PER_TICK * 1000) / SAMPLE_RATE);
  r.flash.draw(elapsedMs);
  r.shake(elapsedMs, state.hitTick);
}
