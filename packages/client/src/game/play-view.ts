// Draws one frame of play: the starfield, the terrain and the ship at a song position.
// Shared by the game loop and capture mode, so a capture shows what play shows.

import { Q8, type Level, type SimState } from '@game/core';
import type { GameRenderer } from '../render/renderer.ts';
import { scrollPxAt } from '../render/terrain-layout.ts';

/** Song samples per flicker step of the engine flame: 30 ms. */
const FLAME_STEP_SAMPLES = 1440;

/**
 * Draws `level` at song sample `displaySamples` with the ship where `state` has it. The
 * ship is hidden once it has crashed.
 */
export function drawPlay(r: GameRenderer, level: Level, state: SimState, displaySamples: number): void {
  const scrollPx = scrollPxAt(level, displaySamples);
  r.starfield.draw(scrollPx);
  r.terrain.draw(scrollPx);
  r.ship.visible = !state.dead;
  if (!state.dead) {
    r.ship.draw(state.shipX / Q8, state.shipY / Q8, Math.floor(displaySamples / FLAME_STEP_SAMPLES));
  }
}
