// A deterministic bot that flies a level and records its input log. Tests use it to check
// that generated levels are passable and to pin sim results; it holds x and steers y.

import { Difficulty, type Level } from '../levelgen/types.ts';
import { BAR_OPEN_WIDTH, PLAYFIELD_HEIGHT, Q8, SEGMENT_PITCH } from '../playfield.ts';
import { InputBit, SHIP_HITBOX_HEIGHT, SHIP_HITBOX_WIDTH, SHIP_SPEED_Q8 } from './constants.ts';
import { createSimState, tick } from './sim.ts';

const HALF_W = (SHIP_HITBOX_WIDTH * Q8) / 2;
const HALF_H = (SHIP_HITBOX_HEIGHT * Q8) / 2;

/** How many ticks ahead the bot looks. */
const LOOKAHEAD = 24;

/**
 * Narrows [range[0], range[1]] (ship centre y, Q8) to the positions that are clear of every
 * bar the hitbox overlaps at tick `t` with centre x `x`. Treats everything up to a solid
 * peak as solid.
 */
function clearRange(level: Level, t: number, x: number, range: number[]): void {
  const solidPeaks = Difficulty[level.difficulty].solidPeaks;
  const wx0 = level.scroll[t]! + x - HALF_W;
  const wx1 = wx0 + 2 * HALF_W;
  const pitch = level.barPitch * Q8;
  const lit = (level.barPitch - BAR_OPEN_WIDTH) * Q8;
  const first = Math.max(0, Math.floor(wx0 / pitch));
  const last = Math.min(level.barCount - 1, Math.floor((wx1 - 1) / pitch));
  for (let i = first; i <= last; i++) {
    const barX = i * pitch;
    if (!(wx0 < barX + lit && wx1 > barX)) continue;
    const c = solidPeaks ? level.ceilingPeak[i]! : level.ceiling[i]!;
    const f = solidPeaks ? level.floorPeak[i]! : level.floor[i]!;
    // The last lit segment of a side with s segments ends SEGMENT_PITCH * s - 1 px in.
    const lo = c === 0 ? HALF_H : (SEGMENT_PITCH * c - 1) * Q8 + HALF_H;
    const hi = f === 0 ? PLAYFIELD_HEIGHT * Q8 - HALF_H : (PLAYFIELD_HEIGHT - SEGMENT_PITCH * f + 1) * Q8 - HALF_H;
    if (lo > range[0]!) range[0] = lo;
    if (hi < range[1]!) range[1] = hi;
  }
}

/** Flies `level` from the start and returns the input log, one byte per tick. */
export function autopilotInputs(level: Level): Uint8Array {
  const inputs = new Uint8Array(level.tickCount);
  const state = createSimState();
  const next = [0, 0];
  const ahead = [0, 0];
  for (let t = 0; t < level.tickCount && !state.dead; t++) {
    next[0] = HALF_H;
    next[1] = PLAYFIELD_HEIGHT * Q8 - HALF_H;
    clearRange(level, t + 1, state.shipX, next);
    // Aim for the middle of the widest window of ticks that has a common clear range.
    ahead[0] = next[0]!;
    ahead[1] = next[1]!;
    let lo = ahead[0];
    let hi = ahead[1];
    for (let u = t + 2; u <= Math.min(level.tickCount, t + LOOKAHEAD); u++) {
      clearRange(level, u, state.shipX, ahead);
      if (ahead[0]! > ahead[1]!) break;
      lo = ahead[0]!;
      hi = ahead[1]!;
    }
    const target = Math.floor((lo + hi) / 2);
    let best = 0;
    let bestDistance = Number.MAX_SAFE_INTEGER;
    for (const dy of [0, -1, 1]) {
      const y = state.shipY + dy * SHIP_SPEED_Q8;
      if (y < next[0]! || y > next[1]!) continue;
      const distance = Math.abs(target - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = dy;
      }
    }
    const input = best < 0 ? InputBit.up : best > 0 ? InputBit.down : 0;
    inputs[t] = input;
    tick(level, state, input);
  }
  return inputs;
}
