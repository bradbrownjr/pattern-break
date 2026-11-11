// A deterministic bot that flies a level and records its input log. Tests use it to check
// that generated levels are passable and to pin sim results, and the attract demo flies
// it. It holds x, steers y through the cave (turrets and tank tracks count as wall), holds
// fire, bombs tanks and floor turrets ahead, dodges the enemy bullets and ships it can see
// coming without flying into the walls ahead, and nukes when it can't. It steers for
// capsules it can reach (each unlocks a power-up) and fires missiles at ships ahead.

import { solidWalls } from '../levelgen/path-check.ts';
import { EnemyKind, EnemyTuning, type Level } from '../levelgen/types.ts';
import { BAR_LIT_WIDTH, BAR_PITCH, PLAYFIELD_HEIGHT, Q8, SEGMENT_PITCH } from '../playfield.ts';
import {
  ENEMY_BULLET_SIZE,
  ENEMY_SHIP_HEIGHT,
  ENEMY_SHIP_WIDTH,
  InputBit,
  SHIP_HITBOX_HEIGHT,
  SHIP_HITBOX_WIDTH,
  SHIP_SPEED_Q8,
} from './constants.ts';
import { CAPSULE_SLOTS } from './constants.ts';
import { BULLET_SLOTS, EnemyStatus, createSimState, tick, type SimState } from './sim.ts';

const HALF_W = (SHIP_HITBOX_WIDTH * Q8) / 2;
const HALF_H = (SHIP_HITBOX_HEIGHT * Q8) / 2;

/** How many ticks ahead the bot looks for the middle of the cave. */
const LOOKAHEAD = 24;
/**
 * How many ticks ahead each plan is checked against bullets, ships and walls. 16 let it dodge
 * into a floor that rose beyond the window: it died on two Hard levels (2026-11-11).
 */
const DODGE_TICKS = 32;
/** Bullets closer than this to the hitbox, in Q8, count as a hit. */
const DODGE_MARGIN = 3 * Q8;
/** The autopilot nukes when the best move is hit this soon. */
const NUKE_TICKS = 2;
const BULLET_HALF = (ENEMY_BULLET_SIZE * Q8) / 2;

/** An enemy ship this far ahead (Q8) and this close in height is worth a missile. */
const MISSILE_AHEAD_MAX = 240 * Q8;
const MISSILE_HEIGHT_MAX = 12 * Q8;

/** A capsule this far ahead of the ship (Q8) or nearer is worth steering for. */
const CAPSULE_AHEAD_MAX = 160 * Q8;
/** The autopilot steers for a capsule only with no enemy bullet this near (Q8, either axis). */
const CAPSULE_CALM = 64 * Q8;

/**
 * The y (Q8) of the nearest capsule ahead within CAPSULE_AHEAD_MAX, held inside the
 * cave's clear range [lo, hi] ahead, or null if there is none or an enemy bullet is
 * within CAPSULE_CALM: near the floor, where capsules rest, the ship has little room to
 * dodge.
 */
function capsuleTarget(state: SimState, lo: number, hi: number): number | null {
  for (let b = 0; b < BULLET_SLOTS; b++) {
    if (!state.bulletActive[b]) continue;
    if (Math.abs(state.bulletX[b]! - state.shipX) < CAPSULE_CALM && Math.abs(state.bulletY[b]! - state.shipY) < CAPSULE_CALM) return null;
  }
  let best = -1;
  for (let c = 0; c < CAPSULE_SLOTS; c++) {
    if (!state.capsuleActive[c]) continue;
    const ahead = state.capsuleX[c]! - state.shipX;
    if (ahead < 0 || ahead > CAPSULE_AHEAD_MAX) continue;
    if (best < 0 || state.capsuleX[c]! < state.capsuleX[best]!) best = c;
  }
  if (best < 0) return null;
  const y = state.capsuleY[best]!;
  return y < lo ? lo : y > hi ? hi : y;
}

/** True if a live enemy ship is ahead within MISSILE_AHEAD_MAX, near the ship's height. */
function shipAhead(level: Level, state: SimState): boolean {
  const e = level.enemies;
  for (let i = state.firstLive; i < state.nextSpawn; i++) {
    if (state.enemyStatus[i] !== EnemyStatus.alive || e.kind[i] !== EnemyKind.ship) continue;
    const ahead = state.enemyX[i]! - state.shipX;
    const dy = state.enemyY[i]! - state.shipY;
    if (ahead > 0 && ahead <= MISSILE_AHEAD_MAX && dy < MISSILE_HEIGHT_MAX && -dy < MISSILE_HEIGHT_MAX) return true;
  }
  return false;
}

/** Screen x range ahead of the ship, Q8, where a floor target is worth a bomb. */
const BOMB_AHEAD_MIN = 60 * Q8;
const BOMB_AHEAD_MAX = 140 * Q8;

/** True if a live tank or floor turret is between BOMB_AHEAD_MIN and BOMB_AHEAD_MAX ahead. */
function floorTargetAhead(level: Level, state: SimState): boolean {
  const e = level.enemies;
  for (let i = state.firstLive; i < state.nextSpawn; i++) {
    if (state.enemyStatus[i] !== EnemyStatus.alive) continue;
    const floor = e.kind[i] === EnemyKind.tank || (e.kind[i] === EnemyKind.turret && e.side[i] === 0);
    const ahead = state.enemyX[i]! - state.shipX;
    if (floor && ahead >= BOMB_AHEAD_MIN && ahead <= BOMB_AHEAD_MAX) return true;
  }
  return false;
}

/** How many ticks a plan keeps moving before the ship holds still; holding has one plan. */
const PLAN_MOVE_TICKS = [1, 4, 8, 16, DODGE_TICKS];
const HOLD = [0];
/** Set by firstHit(): its hit is a wall, not an enemy bullet or ship (a nuke won't help). */
let hitIsWall = false;

/**
 * The first tick within DODGE_TICKS at which the ship, moving in vertical direction `dy`
 * from (x, y) for `move` ticks and then holding still, would meet an enemy bullet or ship,
 * or leave `room` (the clear range of each tick ahead, lo and hi at 2k and 2k + 1); or
 * DODGE_TICKS + 1 if neither happens. Sets hitIsWall. Bullets fly straight; ships are taken
 * to keep their height.
 */
function firstHit(level: Level, state: SimState, x: number, y: number, dy: number, move: number, room: Int32Array): number {
  const e = level.enemies;
  const shipSpeed = EnemyTuning[level.difficulty].shipSpeedQ8;
  const shipReachX = HALF_W + (ENEMY_SHIP_WIDTH * Q8) / 2 + DODGE_MARGIN;
  const shipReachY = HALF_H + (ENEMY_SHIP_HEIGHT * Q8) / 2 + DODGE_MARGIN;
  const reachX = HALF_W + BULLET_HALF + DODGE_MARGIN;
  const reachY = HALF_H + BULLET_HALF + DODGE_MARGIN;
  for (let k = 1; k <= DODGE_TICKS; k++) {
    let sy = y + dy * SHIP_SPEED_Q8 * (k < move ? k : move);
    if (sy < HALF_H) sy = HALF_H;
    if (sy > PLAYFIELD_HEIGHT * Q8 - HALF_H) sy = PLAYFIELD_HEIGHT * Q8 - HALF_H;
    hitIsWall = true;
    if (sy < room[2 * k]! || sy > room[2 * k + 1]!) return k;
    hitIsWall = false;
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
export function autopilotInputs(level: Level): Uint16Array {
  const inputs = new Uint16Array(level.tickCount);
  const state = createSimState();
  const walls = solidWalls(level);
  const next = [0, 0];
  const ahead = [0, 0];
  const range = [0, 0];
  const order = [0, 0, 0];
  const room = new Int32Array(2 * DODGE_TICKS + 2);
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
    const target = capsuleTarget(state, lo, hi) ?? Math.floor((lo + hi) / 2);
    for (let k = 1; k <= DODGE_TICKS; k++) {
      range[0] = HALF_H;
      range[1] = PLAYFIELD_HEIGHT * Q8 - HALF_H;
      if (t + k <= level.tickCount) clearRange(level, walls, t + k, state.shipX, range);
      room[2 * k] = range[0]!;
      room[2 * k + 1] = range[1]!;
    }
    // Of the plans (a direction held for a few ticks, then still), take the one that meets
    // nothing for longest, then the one whose first move ends nearest the target; the first
    // move of that plan is this tick's.
    let best = 0;
    let bestHit = -1;
    let bestWall = false;
    // Nearest the target first, so the first plan that meets nothing wins outright.
    const toward = target <= state.shipY ? -1 : 1;
    const nearer = Math.abs(target - (state.shipY + toward * SHIP_SPEED_Q8)) < Math.abs(target - state.shipY);
    order[0] = nearer ? toward : 0;
    order[1] = nearer ? 0 : toward;
    order[2] = -toward;
    plans: for (const dy of order) {
      for (const move of dy === 0 ? HOLD : PLAN_MOVE_TICKS) {
        const hit = firstHit(level, state, state.shipX, state.shipY, dy, move, room);
        if (hit > bestHit) {
          bestHit = hit;
          bestWall = hitIsWall;
          best = dy;
          if (hit > DODGE_TICKS) break plans;
        }
      }
    }
    // Fire all the time, bomb a floor target ahead, and nuke when every move is hit within
    // NUKE_TICKS.
    let input = (best < 0 ? InputBit.up : best > 0 ? InputBit.down : 0) | InputBit.fire;
    if (!state.bombActive && t + 1 >= state.bombReadyTick && (state.prevInput & InputBit.bomb) === 0 && floorTargetAhead(level, state)) {
      input |= InputBit.bomb;
    }
    if (bestHit <= NUKE_TICKS && !bestWall && state.nukes > 0) input |= InputBit.nuke;
    if (
      state.missile &&
      !state.missileActive[0] &&
      t + 1 >= state.missileReadyTick &&
      (state.prevInput & InputBit.missile) === 0 &&
      shipAhead(level, state)
    ) {
      input |= InputBit.missile;
    }
    inputs[t] = input;
    tick(level, state, input);
  }
  return inputs;
}
