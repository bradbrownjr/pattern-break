// A deterministic bot that flies a level and records its input log. Tests use it to check
// that generated levels are passable and to pin sim results, and the attract demo flies
// it. It holds x, steers y through the cave (turrets and tank tracks count as wall), holds
// fire, and dodges enemy bullets it can see coming. It doesn't dodge ships.

import { solidWalls } from '../levelgen/path-check.ts';
import { EnemyKind, EnemyTuning, type Level } from '../levelgen/types.ts';
import { BAR_LIT_WIDTH, BAR_PITCH, PLAYFIELD_HEIGHT, Q8, SEGMENT_PITCH } from '../playfield.ts';
import {
  ENEMY_BULLET_SIZE,
  ENEMY_SHIP_HEIGHT,
  ENEMY_SHIP_WIDTH,
  InputBit,   SHIP_HITBOX_HEIGHT,
  SHIP_HITBOX_WIDTH,
  SHIP_SPEED_Q8,
} from './constants.ts';
import { BULLET_SLOTS, EnemyStatus, createSimState, tick, type SimState } from './sim.ts';

const HALF_W = (SHIP_HITBOX_WIDTH * Q8) / 2;
const HALF_H = (SHIP_HITBOX_HEIGHT * Q8) / 2;

/** How many ticks ahead the bot looks for the cave, and for bullets. */
const LOOKAHEAD = 24;
const DODGE_TICKS = 16;
/** Bullets closer than this to the hitbox, in Q8, count as a hit. */
const DODGE_MARGIN = 3 * Q8;
/** The autopilot nukes when the best move is hit this soon. */
const NUKE_TICKS = 2;
const BULLET_HALF = (ENEMY_BULLET_SIZE * Q8) / 2;

/**
 * The first tick within DODGE_TICKS at which an enemy bullet or ship would hit the ship if
 * it held vertical direction `dy` from (x, y), or DODGE_TICKS + 1 if none would. Bullets
 * fly straight; ships are taken to keep their height.
 */
function firstHit(level: Level, state: SimState, x: number, y: number, dy: number, lo: number, hi: number): number {
  const e = level.enemies;
  const shipSpeed = EnemyTuning[level.difficulty].shipSpeedQ8;
  const shipReachX = HALF_W + (ENEMY_SHIP_WIDTH * Q8) / 2 + DODGE_MARGIN;
  const shipReachY = HALF_H + (ENEMY_SHIP_HEIGHT * Q8) / 2 + DODGE_MARGIN;
  const reachX = HALF_W + BULLET_HALF + DODGE_MARGIN;
  const reachY = HALF_H + BULLET_HALF + DODGE_MARGIN;
  for (let k = 1; k <= DODGE_TICKS; k++) {
    let sy = y + dy * SHIP_SPEED_Q8 * k;
    if (sy < lo) sy = lo;
    if (sy > hi) sy = hi;
    for (let b = 0; b < BULLET_SLOTS; b++) {
      if (!state.bulletActive[b]) continue;
      const bx = state.bulletX[b]! + state.bulletVX[b]! * k - x;
      const by = state.bulletY[b]! + state.bulletVY[b]! * k - sy;
      if (bx < reachX && -bx < reachX && by < reachY && -by < reachY) return k;
    }
    for (let i = state.firstLive; i < state.nextSpawn; i++) {
      if (state.enemyStatus[i] !== EnemyStatus.alive || e.kind[i] !== EnemyKind.ship) continue;
      const ex = state.enemyX[i]! - shipSpeed * k - x;
      const ey = state.enemyY[i]! - sy;
      if (ex < shipReachX && -ex < shipReachX && ey < shipReachY && -ey < shipReachY) return k;
    }
  }
  return DODGE_TICKS + 1;
}

/**
 * Narrows [range[0], range[1]] (ship centre y, Q8) to the positions that are clear of every
 * bar the hitbox overlaps at tick `t` with centre x `x`, with `walls` from solidWalls().
 */
function clearRange(level: Level, walls: { ceiling: Uint8Array; floor: Uint8Array }, t: number, x: number, range: number[]): void {
  const wx0 = level.scroll[t]! + x - HALF_W;
  const wx1 = wx0 + 2 * HALF_W;
  const pitch = BAR_PITCH * Q8;
  const first = Math.max(0, Math.floor(wx0 / pitch));
  const last = Math.min(level.barCount - 1, Math.floor((wx1 - 1) / pitch));
  for (let i = first; i <= last; i++) {
    const barX = i * pitch;
    if (!(wx0 < barX + BAR_LIT_WIDTH * Q8 && wx1 > barX)) continue;
    const c = walls.ceiling[i]!;
    const f = walls.floor[i]!;
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
  const walls = solidWalls(level);
  const next = [0, 0];
  const ahead = [0, 0];
  for (let t = 0; t < level.tickCount && !state.dead; t++) {
    next[0] = HALF_H;
    next[1] = PLAYFIELD_HEIGHT * Q8 - HALF_H;
    clearRange(level, walls, t + 1, state.shipX, next);
    // Aim for the middle of the widest window of ticks that has a common clear range.
    ahead[0] = next[0]!;
    ahead[1] = next[1]!;
    let lo = ahead[0];
    let hi = ahead[1];
    for (let u = t + 2; u <= Math.min(level.tickCount, t + LOOKAHEAD); u++) {
      clearRange(level, walls, u, state.shipX, ahead);
      if (ahead[0]! > ahead[1]!) break;
      lo = ahead[0]!;
      hi = ahead[1]!;
    }
    const target = Math.floor((lo + hi) / 2);
    // Prefer the move that no bullet reaches soonest, then the one nearest the target.
    let best = 0;
    let bestHit = -1;
    let bestDistance = Number.MAX_SAFE_INTEGER;
    for (const dy of [0, -1, 1]) {
      const y = state.shipY + dy * SHIP_SPEED_Q8;
      if (y < next[0]! || y > next[1]!) continue;
      const hit = firstHit(level, state, state.shipX, state.shipY, dy, next[0]!, next[1]!);
      const distance = Math.abs(target - y);
      if (hit > bestHit || (hit === bestHit && distance < bestDistance)) {
        bestHit = hit;
        bestDistance = distance;
        best = dy;
      }
    }
    // Fire and drop bombs all the time; nuke when every move is hit within NUKE_TICKS.
    let input = (best < 0 ? InputBit.up : best > 0 ? InputBit.down : 0) | InputBit.fire | InputBit.bomb;
    if (bestHit <= NUKE_TICKS && state.nukes > 0) input |= InputBit.nuke;
    inputs[t] = input;
    tick(level, state, input);
  }
  return inputs;
}
