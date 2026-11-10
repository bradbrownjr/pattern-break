// Draws one frame of play: the copper bars, the starfield, the terrain and its sparks, enemies and bullets, and the ship at
// a song position. Shared by the game loop and capture mode, so a capture shows what play
// shows.

import { Q8, SAMPLE_RATE, SAMPLES_PER_TICK, type Level, type SimState } from '@game/core';
import type { GameRenderer } from '../render/renderer.ts';
import { scrollPxAt } from '../render/terrain-layout.ts';

/** Song samples per flicker step of the engine flame: 30 ms. */
const FLAME_STEP_SAMPLES = 1440;

/**
 * Draws `level` at song sample `displaySamples` with the ship, enemies and bullets where
 * `state` has them. The ship is hidden once the last life is lost, and blinks while it
 * can't be hit after losing one.
 */
export function drawPlay(r: GameRenderer, level: Level, state: SimState, displaySamples: number): void {
  const scrollPx = scrollPxAt(level, displaySamples);
  // Every crash shakes the picture, the last one included (hitTick is set on each).
  const sinceHit = state.hitTick < 0 ? -1 : ((displaySamples - state.hitTick * SAMPLES_PER_TICK) * 1000) / SAMPLE_RATE;
  r.shake(sinceHit, state.hitTick);
  r.copper.draw(displaySamples);
  r.starfield.draw(scrollPx);
  r.terrain.draw(scrollPx);
  r.sparks.draw(displaySamples, scrollPx, r.terrain.lit);
  const visible = !state.dead && r.combat.draw(level, state, scrollPx, displaySamples);
  r.ship.visible = visible;
  if (visible) {
    r.ship.draw(state.shipX / Q8, state.shipY / Q8, Math.floor(displaySamples / FLAME_STEP_SAMPLES), state.boosting);
  }
}
