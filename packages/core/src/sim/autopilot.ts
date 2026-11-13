// A deterministic bot that flies a level and records its input log. Tests use it to check
// that generated levels are passable and to pin sim results, and the attract demo flies
// it. It plays as a person would (Brad, 2026-11-11): it steers through the cave (turrets
// and tank tracks count as wall), lines up shots on the nearest enemy ahead it has a clear
// line of fire to, keeps fire held down, bombs tanks and floor turrets ahead, and fires missiles at
// what it's lined up with. It dodges the enemy bullets and ships it can see coming, up and
// down and by braking and backing up, without flying into the walls, then drifts back to
// its home x; when a hit can't be avoided it takes the cheapest, and nukes when it can't
// take one. It steers for capsules it can reach (each unlocks a power-up). Walls that
// blasts break open up for it, and it dodges falling blocks as it dodges bullets, braking
// and backing up out from under them.
//
// Its dodging is perfect, so it says little about how a person fares. Given a miss share,
// it fails to see that share of the enemy bullets, a stand-in for a person's lapses of
// attention (2026-11-13): `pnpm check:difficulty` flies every level that way too.

import { solidWalls } from '../levelgen/path-check.ts';
import { EnemyKind, EnemyTuning, type Level } from '../levelgen/types.ts';
import { BAR_LIT_WIDTH, BAR_PITCH, PLAYFIELD_HEIGHT, Q8, SEGMENT_LIT_HEIGHT, SEGMENT_PITCH } from '../playfield.ts';
import {
  ENEMY_BULLET_SIZE,
  ENEMY_SHIP_HEIGHT,
  ENEMY_SHIP_WIDTH,
  BOMB_GRAVITY_Q8,
  BOMB_MAX_VY_Q8,
  InputBit,
  SHIELD_BULLET_COST,
  SHIELD_RAM_COST,
  SHIELD_WALL_COST,
  SHIP_DIAGONAL_SPEED_Q8,
  SHIP_HITBOX_HEIGHT,
  SHIP_HITBOX_WIDTH,
  SHIP_MAX_X,
  SHIP_MIN_X,
  SHIP_SPEED_Q8,
  SHIP_START_X,
  SHOT_HEIGHT,
  SHOT_SPEED_Q8,
  SHOT_WIDTH,
  TANK_HEIGHT,
  TURRET_HEIGHT,
} from './constants.ts';
import { CAPSULE_SLOTS } from './constants.ts';
import { BLOCK_SLOTS, BULLET_SLOTS, EnemyStatus, boxHitsTerrain, createSimState, tick, type SimState } from './sim.ts';

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

/** True if a live enemy is ahead within MISSILE_AHEAD_MAX, near the ship's height. */
function enemyLinedUp(state: SimState): boolean {
  for (let i = state.firstLive; i < state.nextSpawn; i++) {
    if (state.enemyStatus[i] !== EnemyStatus.alive) continue;
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

/** How far ahead (Q8) the bot looks for an enemy to line up a shot on. */
const AIM_AHEAD_MAX = 200 * Q8;
/** A shot's half size, Q8, for its path against the walls. */
const SHOT_HH = (SHOT_HEIGHT * Q8) / 2;
const SHOT_HW = (SHOT_WIDTH * Q8) / 2;
/** Steps along a shot's path checked against the walls, Q8. */
const AIM_STEP = 8 * Q8;
/** Lining up order: ships first (they fly at the ship), then turrets (a hit costs half the shield), then tanks. */
const AIM_RANK = [1, 2, 0];

/**
 * True if a shot fired now from (x, y) would reach world-screen x `toX` without meeting a
 * wall: each step along its path is checked at the tick the shot would get there.
 */
function lineOfFire(level: Level, state: SimState, t: number, x: number, y: number, toX: number): boolean {
  // The walls as they stand (whole before the first tick sets them up).
  const ceiling = state.ceiling.length > 0 ? state.ceiling : level.ceiling;
  const floor = state.floor.length > 0 ? state.floor : level.floor;
  for (let px = x + AIM_STEP; px < toX; px += AIM_STEP) {
    const at = t + Math.floor((px - x) / SHOT_SPEED_Q8);
    if (at > level.tickCount) return true;
    if (boxHitsTerrain(level, at, px, y, SHOT_HW, SHOT_HH, ceiling, floor)) return false;
  }
  return true;
}

/**
 * The y (Q8) to line up a shot on the enemy ahead most worth shooting, within [lo, hi] and
 * with a clear line of fire from there, or null. Ships come first, then turrets, then tanks;
 * the nearest of a kind first.
 */
function aimTarget(level: Level, state: SimState, t: number, lo: number, hi: number): number | null {
  const e = level.enemies;
  let best = -1;
  let bestY = 0;
  for (let i = state.firstLive; i < state.nextSpawn; i++) {
    if (state.enemyStatus[i] !== EnemyStatus.alive) continue;
    const ahead = state.enemyX[i]! - state.shipX;
    if (ahead <= HALF_W || ahead > AIM_AHEAD_MAX) continue;
    let y = state.enemyY[i]!;
    if (y < lo || y > hi) {
      // A turret or tank sits on a wall: the nearest clear height that still hits it.
      const k = e.kind[i]!;
      const reach = ((k === EnemyKind.tank ? TANK_HEIGHT : k === EnemyKind.turret ? TURRET_HEIGHT : ENEMY_SHIP_HEIGHT) * Q8) / 2 - Q8;
      const clamped = y < lo ? lo : hi;
      if (clamped - y > reach || y - clamped > reach) continue;
      y = clamped;
    }
    if (best >= 0) {
      const r = AIM_RANK[e.kind[i]!]!;
      const rb = AIM_RANK[e.kind[best]!]!;
      if (r > rb || (r === rb && state.enemyX[i]! >= state.enemyX[best]!)) continue;
    }
    if (!lineOfFire(level, state, t, state.shipX + HALF_W, y, state.enemyX[i]!)) continue;
    best = i;
    bestY = y;
  }
  return best < 0 ? null : bestY;
}

/** How many ticks a plan keeps moving before the ship holds still; holding has one plan. */
const PLAN_MOVE_TICKS = [1, 4, 8, 16, DODGE_TICKS];
const HOLD = [0];
/** Where the ship rests, Q8, and how far from it counts as there. */
const HOME_X = SHIP_START_X * Q8;
const HOME_SLACK = 2 * Q8;
const MIN_X = SHIP_MIN_X * Q8;
const MAX_X = SHIP_MAX_X * Q8;
/** Set by firstHit(): the shield points its hit would cost (a wall's can't be nuked away). */
let hitCost = 0;
let hitIsWall = false;
const range2 = [0, 0];
/** How many ticks of firstHit()'s `room` are filled this tick. */
let roomFilled = 0;
/**
 * The falling blocks this tick: their slots, and each one's top y (Q8) for the ticks ahead
 * (at j * (DODGE_TICKS + 1) + k), or -1 once it has shattered on the floor.
 */
const blockSlots = new Int32Array(BLOCK_SLOTS);
let blockCount = 0;
const blockTops = new Int32Array(BLOCK_SLOTS * (DODGE_TICKS + 1));
const LIT_HW = (BAR_LIT_WIDTH * Q8) / 2;
const blockReachX = HALF_W + LIT_HW + DODGE_MARGIN;

/** Lists the falling blocks and works out where each will be for DODGE_TICKS ticks. */
function predictBlocks(state: SimState): void {
  blockCount = 0;
  for (let b = 0; b < BLOCK_SLOTS; b++) {
    if (!state.blockActive[b]) continue;
    const j = blockCount++;
    blockSlots[j] = b;
    const height = state.blockSegments[b]! * SEGMENT_PITCH * Q8 - (SEGMENT_PITCH - SEGMENT_LIT_HEIGHT) * Q8;
    const f = state.floor[state.blockBar[b]!]!;
    const floorTop = f === 0 ? PLAYFIELD_HEIGHT * Q8 : (PLAYFIELD_HEIGHT - SEGMENT_PITCH * (f - 1) - SEGMENT_LIT_HEIGHT) * Q8;
    let vy = state.blockVY[b]!;
    let top = state.blockY[b]!;
    for (let k = 1; k <= DODGE_TICKS; k++) {
      if (top >= 0) {
        vy += BOMB_GRAVITY_Q8;
        if (vy > BOMB_MAX_VY_Q8) vy = BOMB_MAX_VY_Q8;
        top += vy;
        if (top + height >= floorTop) top = -1;
      }
      blockTops[j * (DODGE_TICKS + 1) + k] = top;
    }
  }
}

/**
 * The first tick within DODGE_TICKS at which the ship, moving in direction (dx, dy) from
 * (x, y) for `move` ticks and then holding still, would meet an enemy bullet or ship or a
 * wall, or DODGE_TICKS + 1 if none. Sets hitCost and hitIsWall. Bullets fly straight;
 * ships are taken to keep their height. `room` caches the clear range of each tick ahead at
 * x (lo and hi at 2k and 2k + 1), filled as plans that stay at x first need it; `live`
 * lists the active bullets (then -1 - i for each live enemy ship), found once per tick.
 */
function firstHit(
  level: Level,
  walls: { ceiling: Uint8Array; floor: Uint8Array },
  state: SimState,
  t: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  move: number,
  room: Int32Array,
  live: Int32Array,
  liveCount: number,
): number {
  const shipSpeed = EnemyTuning[level.difficulty].shipSpeedQ8;
  const shipReachX = HALF_W + (ENEMY_SHIP_WIDTH * Q8) / 2 + DODGE_MARGIN;
  const shipReachY = HALF_H + (ENEMY_SHIP_HEIGHT * Q8) / 2 + DODGE_MARGIN;
  const reachX = HALF_W + BULLET_HALF + DODGE_MARGIN;
  const reachY = HALF_H + BULLET_HALF + DODGE_MARGIN;
  const speed = dx !== 0 && dy !== 0 ? SHIP_DIAGONAL_SPEED_Q8 : SHIP_SPEED_Q8;
  hitIsWall = false;
  hitCost = 0;
  for (let k = 1; k <= DODGE_TICKS; k++) {
    const steps = k < move ? k : move;
    let sx = x + dx * speed * steps;
    let sy = y + dy * speed * steps;
    if (sx < MIN_X) sx = MIN_X;
    if (sx > MAX_X) sx = MAX_X;
    if (sy < HALF_H) sy = HALF_H;
    if (sy > PLAYFIELD_HEIGHT * Q8 - HALF_H) sy = PLAYFIELD_HEIGHT * Q8 - HALF_H;
    if (t + k <= level.tickCount) {
      if (dx === 0) {
        if (k > roomFilled) {
          range2[0] = HALF_H;
          range2[1] = PLAYFIELD_HEIGHT * Q8 - HALF_H;
          clearRange(level, walls, t + k, x, range2);
          room[2 * k] = range2[0]!;
          room[2 * k + 1] = range2[1]!;
          roomFilled = k;
        }
        range2[0] = room[2 * k]!;
        range2[1] = room[2 * k + 1]!;
      } else {
        range2[0] = HALF_H;
        range2[1] = PLAYFIELD_HEIGHT * Q8 - HALF_H;
        clearRange(level, walls, t + k, sx, range2);
      }
      if (sy < range2[0]! || sy > range2[1]!) {
        hitIsWall = true;
        hitCost = SHIELD_WALL_COST;
        return k;
      }
    }
    for (let j = 0; j < blockCount; j++) {
      const top = blockTops[j * (DODGE_TICKS + 1) + k]!;
      if (top < 0) continue;
      const b = blockSlots[j]!;
      const bx = state.blockBar[b]! * BAR_PITCH * Q8 + LIT_HW - level.scroll[t + k > level.tickCount ? level.tickCount : t + k]! - sx;
      const height = state.blockSegments[b]! * SEGMENT_PITCH * Q8 - (SEGMENT_PITCH - SEGMENT_LIT_HEIGHT) * Q8;
      if (bx < blockReachX && -bx < blockReachX && sy + HALF_H + DODGE_MARGIN > top && sy - HALF_H - DODGE_MARGIN < top + height) {
        // A block can't be nuked away.
        hitIsWall = true;
        hitCost = SHIELD_WALL_COST;
        return k;
      }
    }
    for (let j = 0; j < liveCount; j++) {
      const b = live[j]!;
      if (b >= 0) {
        const bx = state.bulletX[b]! + state.bulletVX[b]! * k - sx;
        const by = state.bulletY[b]! + state.bulletVY[b]! * k - sy;
        if (bx < reachX && -bx < reachX && by < reachY && -by < reachY) {
          hitCost = SHIELD_BULLET_COST[state.bulletKind[b]!]!;
          return k;
        }
      } else {
        const i = -1 - b;
        const ex = state.enemyX[i]! - shipSpeed * k - sx;
        const ey = state.enemyY[i]! - sy;
        if (ex < shipReachX && -ex < shipReachX && ey < shipReachY && -ey < shipReachY) {
          hitCost = SHIELD_RAM_COST;
          return k;
        }
      }
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

/**
 * Whether the autopilot misses the bullet fired into `slot` at tick `t`, given it misses
 * `missPercent` in 100: an integer hash of the two, so the choice is fixed per level and
 * doesn't fall into step with a regular beat.
 */
function missesBullet(t: number, slot: number, missPercent: number): boolean {
  let h = Math.imul(t, BULLET_SLOTS) + slot;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) % 100 < missPercent;
}

/**
 * Flies `level` from the start and returns the input log, one byte per tick. With
 * `missPercent` above 0, that share of the enemy bullets (out of 100) goes unseen for its
 * whole flight; 0 sees every one.
 */
export function autopilotInputs(level: Level, missPercent = 0): Uint16Array {
  const inputs = new Uint16Array(level.tickCount);
  /** Per bullet slot: 1 while it holds a bullet the bot has seen fired, 2 one it missed. */
  const seen = new Uint8Array(BULLET_SLOTS);
  const state = createSimState();
  const walls = solidWalls(level);
  let seenBreaks = 0;
  const next = [0, 0];
  const ahead = [0, 0];
  const order = [0, 0, 0];
  const across = [0, 0, 0];
  const room = new Int32Array(2 * DODGE_TICKS + 2);
  const e = level.enemies;
  const live = new Int32Array(BULLET_SLOTS + e.kind.length);
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
    const target = capsuleTarget(state, lo, hi) ?? aimTarget(level, state, t, lo, hi) ?? Math.floor((lo + hi) / 2);
    roomFilled = 0;
    predictBlocks(state);
    let liveCount = 0;
    for (let b = 0; b < BULLET_SLOTS; b++) {
      if (!state.bulletActive[b]) {
        seen[b] = 0;
        continue;
      }
      if (seen[b] === 0) seen[b] = missesBullet(t, b, missPercent) ? 2 : 1;
      if (seen[b] === 1) live[liveCount++] = b;
    }
    for (let i = state.firstLive; i < state.nextSpawn; i++) {
      if (state.enemyStatus[i] === EnemyStatus.alive && e.kind[i] === EnemyKind.ship) live[liveCount++] = -1 - i;
    }
    // Of the plans (a direction held for a few ticks, then still), take the first that
    // meets nothing, trying them nearest the target first: up or down towards it, and
    // across towards home before holding x, braking or pressing on. With every plan hit,
    // take the latest hit, then the cheapest; the first move of that plan is this tick's.
    let bestDx = 0;
    let bestDy = 0;
    let bestHit = -1;
    let bestCost = 0;
    let bestWall = false;
    const toward = target <= state.shipY ? -1 : 1;
    const nearer = Math.abs(target - (state.shipY + toward * SHIP_SPEED_Q8)) < Math.abs(target - state.shipY);
    order[0] = nearer ? toward : 0;
    order[1] = nearer ? 0 : toward;
    order[2] = -toward;
    const home = state.shipX < HOME_X - HOME_SLACK ? 1 : state.shipX > HOME_X + HOME_SLACK ? -1 : 0;
    across[0] = home;
    across[1] = home === 0 ? -1 : 0;
    across[2] = home === 0 ? 1 : -home;
    plans: for (const dy of order) {
      for (const dx of across) {
        for (const move of dy === 0 && dx === 0 ? HOLD : PLAN_MOVE_TICKS) {
          const hit = firstHit(level, walls, state, t, state.shipX, state.shipY, dx, dy, move, room, live, liveCount);
          if (hit > bestHit || (hit === bestHit && hitCost < bestCost)) {
            bestHit = hit;
            bestCost = hitCost;
            bestWall = hitIsWall;
            bestDx = dx;
            bestDy = dy;
            if (hit > DODGE_TICKS) break plans;
          }
        }
      }
    }
    // Fire all the time, bomb a floor target ahead, and nuke when every move is hit within
    // NUKE_TICKS.
    let input =
      (bestDy < 0 ? InputBit.up : bestDy > 0 ? InputBit.down : 0) |
      (bestDx < 0 ? InputBit.left : bestDx > 0 ? InputBit.right : 0) |
      InputBit.fire;
    if (!state.bombActive && t + 1 >= state.bombReadyTick && (state.prevInput & InputBit.bomb) === 0 && floorTargetAhead(level, state)) {
      input |= InputBit.bomb;
    }
    if (bestHit <= NUKE_TICKS && !bestWall && state.nukes > 0) input |= InputBit.nuke;
    if (
      state.missile &&
      !state.missileActive[0] &&
      t + 1 >= state.missileReadyTick &&
      (state.prevInput & InputBit.missile) === 0 &&
      enemyLinedUp(state)
    ) {
      input |= InputBit.missile;
    }
    inputs[t] = input;
    tick(level, state, input);
    // Walls a blast broke are open now (turrets and tank tracks on them are gone too).
    if (state.terrainBreaks !== seenBreaks) {
      seenBreaks = state.terrainBreaks;
      for (let i = 0; i < level.barCount; i++) {
        if (state.ceiling[i]! < level.ceiling[i]!) walls.ceiling[i] = state.ceiling[i]!;
        if (state.floor[i]! < level.floor[i]!) walls.floor[i] = state.floor[i]!;
      }
    }
  }
  return inputs;
}
