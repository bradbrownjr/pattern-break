// The 120 Hz simulation (docs/PLAN.md, "Simulation"). Integer math only; tick() writes
// into a preallocated state and allocates nothing.

import { Difficulty, type Level } from '../levelgen/types.ts';
import {
  BAR_LIT_WIDTH,
  BAR_PITCH,
  PLAYFIELD_HEIGHT,
  Q8,
  SEGMENT_LIT_HEIGHT,
  SEGMENT_PITCH,
} from '../playfield.ts';
import {
  InputBit,
  SHIP_DIAGONAL_SPEED_Q8,
  SHIP_HITBOX_HEIGHT,
  SHIP_HITBOX_WIDTH,
  SHIP_MAX_X,
  SHIP_MIN_X,
  SHIP_SPEED_Q8,
  SHIP_START_X,
  SHIP_START_Y,
} from './constants.ts';

const HALF_W = (SHIP_HITBOX_WIDTH * Q8) / 2;
const HALF_H = (SHIP_HITBOX_HEIGHT * Q8) / 2;
const MIN_X = SHIP_MIN_X * Q8;
const MAX_X = SHIP_MAX_X * Q8;
const MIN_Y = HALF_H;
const MAX_Y = PLAYFIELD_HEIGHT * Q8 - HALF_H;
const BAR_PITCH_Q8 = BAR_PITCH * Q8;
const BAR_LIT_Q8 = BAR_LIT_WIDTH * Q8;
const SEG_PITCH_Q8 = SEGMENT_PITCH * Q8;
const SEG_LIT_Q8 = SEGMENT_LIT_HEIGHT * Q8;
const HEIGHT_Q8 = PLAYFIELD_HEIGHT * Q8;

export interface SimState {
  /** Ticks run so far. The state shows the world at song sample tick * SAMPLES_PER_TICK. */
  tick: number;
  /** Ship sprite centre in screen coordinates, Q8. World x is level.scroll[tick] + shipX. */
  shipX: number;
  shipY: number;
  /** Set on the tick the ship hits something; tick() does nothing afterwards. */
  dead: boolean;
  /** The tick count at which the ship died (state.tick after that tick), or -1. */
  deathTick: number;
  /** Unused in M1, which restarts the song on death. */
  lives: number;
  /** True once tick reaches level.tickCount. */
  finished: boolean;
}

export function createSimState(): SimState {
  const state: SimState = {
    tick: 0,
    shipX: 0,
    shipY: 0,
    dead: false,
    deathTick: -1,
    lives: 1,
    finished: false,
  };
  resetSimState(state);
  return state;
}

/** Puts `state` back at the start of the song. */
export function resetSimState(state: SimState): void {
  state.tick = 0;
  state.shipX = SHIP_START_X * Q8;
  state.shipY = SHIP_START_Y * Q8;
  state.dead = false;
  state.deathTick = -1;
  state.lives = 1;
  state.finished = false;
}

/**
 * True if any lit segment overlaps the column of segments [top, bottom) (Q8, measured
 * from the side's edge), for a side with `level` lit segments and a peak at `peak`.
 */
function sideHits(top: number, bottom: number, level: number, peak: number, solidPeaks: boolean): boolean {
  if (bottom <= 0) return false;
  const first = top <= 0 ? 0 : Math.floor(top / SEG_PITCH_Q8);
  const last = Math.floor((bottom - 1) / SEG_PITCH_Q8);
  for (let k = first; k <= last; k++) {
    const solid = k < level || (solidPeaks && k === peak - 1 && peak > level);
    if (!solid) continue;
    const segTop = k * SEG_PITCH_Q8;
    if (top < segTop + SEG_LIT_Q8 && bottom > segTop) return true;
  }
  return false;
}

/**
 * True if the ship's hitbox, with its centre at screen (x, y) Q8 at sim tick `t`, overlaps
 * a solid part of the terrain: a lit segment of any bar it overlaps horizontally (bars are
 * solid for BAR_LIT_WIDTH px from their left edge), or a peak dot on difficulties with
 * solid peaks. The hitbox is the half-open box [x - 5, x + 5) x [y - 3, y + 3) px.
 */
export function shipCollides(level: Level, t: number, x: number, y: number): boolean {
  const wx0 = level.scroll[t]! + x - HALF_W;
  const wx1 = wx0 + 2 * HALF_W;
  const top = y - HALF_H;
  const bottom = y + HALF_H;
  const solidPeaks = Difficulty[level.difficulty].solidPeaks;
  let first = Math.floor(wx0 / BAR_PITCH_Q8);
  if (first < 0) first = 0;
  let last = Math.floor((wx1 - 1) / BAR_PITCH_Q8);
  if (last > level.barCount - 1) last = level.barCount - 1;
  for (let i = first; i <= last; i++) {
    const barX = i * BAR_PITCH_Q8;
    if (!(wx0 < barX + BAR_LIT_Q8 && wx1 > barX)) continue;
    if (sideHits(top, bottom, level.ceiling[i]!, level.ceilingPeak[i]!, solidPeaks)) return true;
    // The floor is the ceiling mirrored: y measured up from the bottom edge.
    if (sideHits(HEIGHT_Q8 - bottom, HEIGHT_Q8 - top, level.floor[i]!, level.floorPeak[i]!, solidPeaks)) {
      return true;
    }
  }
  return false;
}

/**
 * Advances `state` by one tick with `input` (InputBit flags): move the ship, keep it in
 * bounds, advance the tick, then test collision at the new tick. Opposite directions
 * cancel. Moving on both axes uses SHIP_DIAGONAL_SPEED_Q8 per axis. Does nothing once the
 * ship is dead or the song is over.
 */
export function tick(level: Level, state: SimState, input: number): void {
  if (state.dead || state.finished) return;

  const dx = ((input & InputBit.right) !== 0 ? 1 : 0) - ((input & InputBit.left) !== 0 ? 1 : 0);
  const dy = ((input & InputBit.down) !== 0 ? 1 : 0) - ((input & InputBit.up) !== 0 ? 1 : 0);
  const speed = dx !== 0 && dy !== 0 ? SHIP_DIAGONAL_SPEED_Q8 : SHIP_SPEED_Q8;
  let x = state.shipX + dx * speed;
  let y = state.shipY + dy * speed;
  if (x < MIN_X) x = MIN_X;
  if (x > MAX_X) x = MAX_X;
  if (y < MIN_Y) y = MIN_Y;
  if (y > MAX_Y) y = MAX_Y;
  state.shipX = x;
  state.shipY = y;
  state.tick++;

  if (shipCollides(level, state.tick, x, y)) {
    state.dead = true;
    state.deathTick = state.tick;
  }
  if (state.tick >= level.tickCount) state.finished = true;
}

/**
 * Runs `inputs` (one InputBit byte per tick) from the start of the song until the log
 * ends, the ship dies, or the song ends, and returns the final state.
 */
export function runInputLog(level: Level, inputs: Uint8Array, state: SimState = createSimState()): SimState {
  for (let i = 0; i < inputs.length && !state.dead && !state.finished; i++) tick(level, state, inputs[i]!);
  return state;
}

/** A deterministic byte form of the state, for golden hashes: 7 little-endian i32s. */
export function serializeSimState(state: SimState): Uint8Array {
  const out = new Uint8Array(28);
  const view = new DataView(out.buffer);
  const fields = [
    state.tick,
    state.shipX,
    state.shipY,
    state.dead ? 1 : 0,
    state.deathTick,
    state.lives,
    state.finished ? 1 : 0,
  ];
  for (let i = 0; i < fields.length; i++) view.setInt32(i * 4, fields[i]!, true);
  return out;
}
