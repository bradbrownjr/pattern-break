// The 120 Hz simulation (docs/PLAN.md, "Simulation"). Integer math only, plus Math.sqrt
// for aiming; tick() writes into a preallocated state. The enemy arrays are sized to the
// level on its first tick, the only time tick() allocates.

import { Difficulty, EnemyKind, EnemyTuning, ShipMotion, type Level } from '../levelgen/types.ts';
import {
  BAR_LIT_WIDTH,
  BAR_PITCH,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
  Q8,
  SEGMENT_LIT_HEIGHT,
  SEGMENT_PITCH,
} from '../playfield.ts';
import {
  DRIFT_Q8,
  ENEMY_BULLET_SIZE,
  ENEMY_ENTRY_X,
  ENEMY_EXIT_X,
  ENEMY_HP,
  ENEMY_SHIP_HEIGHT,
  ENEMY_SHIP_WIDTH,
  HOP_PX,
  HOP_TICKS,
  InputBit,
  MAX_SHOTS,
  RESPAWN_SAFE_TICKS,
  SHIP_DIAGONAL_SPEED_Q8,
  SHIP_HITBOX_HEIGHT,
  SHIP_HITBOX_WIDTH,
  SHIP_MAX_X,
  SHIP_MIN_X,
  SHIP_SPEED_Q8,
  SHIP_START_X,
  SHIP_START_Y,
  SHIP_STEER_Q8,
  SHOT_HEIGHT,
  SHOT_INTERVAL_TICKS,
  SHOT_SPEED_Q8,
  SHOT_WIDTH,
  START_LIVES,
  TANK_HEIGHT,
  TANK_SPEED_Q8,
  TANK_WIDTH,
  TURRET_HEIGHT,
  TURRET_WIDTH,
  WEAVE_AMPLITUDE,
  WEAVE_PERIOD_TICKS,
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
const WIDTH_Q8 = PLAYFIELD_WIDTH * Q8;
const SHOT_HW = (SHOT_WIDTH * Q8) / 2;
const SHOT_HH = (SHOT_HEIGHT * Q8) / 2;
const BULLET_H = (ENEMY_BULLET_SIZE * Q8) / 2;
/** Half sizes of each enemy kind's hitbox, indexed by EnemyKind. */
const ENEMY_HW = [(TURRET_WIDTH * Q8) / 2, (TANK_WIDTH * Q8) / 2, (ENEMY_SHIP_WIDTH * Q8) / 2] as const;
const ENEMY_HH = [(TURRET_HEIGHT * Q8) / 2, (TANK_HEIGHT * Q8) / 2, (ENEMY_SHIP_HEIGHT * Q8) / 2] as const;
/** Bullet slots; each difficulty caps how many are in flight (EnemyTuning.maxBullets). */
export const BULLET_SLOTS = 16;

/** Where each enemy is in its life. */
export const EnemyStatus = { waiting: 0, alive: 1, destroyed: 2, gone: 3 } as const;

export interface SimState {
  /** Ticks run so far. The state shows the world at song sample tick * SAMPLES_PER_TICK. */
  tick: number;
  /** Ship sprite centre in screen coordinates, Q8. World x is level.scroll[tick] + shipX. */
  shipX: number;
  shipY: number;
  /** Set when the last life is lost; tick() does nothing afterwards. */
  dead: boolean;
  /** The tick count at which the last life was lost (state.tick after that tick), or -1. */
  deathTick: number;
  lives: number;
  /** True once tick reaches level.tickCount. */
  finished: boolean;
  /** The ship can't be hit before this tick (after losing a life). */
  safeUntil: number;
  /** The tick the ship last lost a life, or -1. */
  hitTick: number;
  /** Enemies destroyed by shots or by ramming. */
  kills: number;
  /** Ticks until the ship can fire again. */
  shotCooldown: number;
  /** Per enemy of the level, by index: an EnemyStatus. */
  enemyStatus: Uint8Array;
  enemyHp: Uint8Array;
  /** Screen position of each live enemy's centre, Q8. */
  enemyX: Int32Array;
  enemyY: Int32Array;
  /** Index into level.enemies.fireTick of each enemy's next shot. */
  enemyFire: Uint32Array;
  /** The tick each enemy was destroyed or left the screen, or 0. */
  enemyEndTick: Int32Array;
  /** Enemies before this index are destroyed or gone; from it on, not yet spawned. */
  firstLive: number;
  nextSpawn: number;
  /** Player shots: screen centre, Q8. */
  shotActive: Uint8Array;
  shotX: Int32Array;
  shotY: Int32Array;
  /** Enemy bullets: screen centre and velocity per tick, Q8. */
  bulletActive: Uint8Array;
  bulletX: Int32Array;
  bulletY: Int32Array;
  bulletVX: Int32Array;
  bulletVY: Int32Array;
  bulletCount: number;
}

export function createSimState(): SimState {
  const state: SimState = {
    tick: 0,
    shipX: 0,
    shipY: 0,
    dead: false,
    deathTick: -1,
    lives: START_LIVES,
    finished: false,
    safeUntil: 0,
    hitTick: -1,
    kills: 0,
    shotCooldown: 0,
    enemyStatus: new Uint8Array(0),
    enemyHp: new Uint8Array(0),
    enemyX: new Int32Array(0),
    enemyY: new Int32Array(0),
    enemyFire: new Uint32Array(0),
    enemyEndTick: new Int32Array(0),
    firstLive: 0,
    nextSpawn: 0,
    shotActive: new Uint8Array(MAX_SHOTS),
    shotX: new Int32Array(MAX_SHOTS),
    shotY: new Int32Array(MAX_SHOTS),
    bulletActive: new Uint8Array(BULLET_SLOTS),
    bulletX: new Int32Array(BULLET_SLOTS),
    bulletY: new Int32Array(BULLET_SLOTS),
    bulletVX: new Int32Array(BULLET_SLOTS),
    bulletVY: new Int32Array(BULLET_SLOTS),
    bulletCount: 0,
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
  state.lives = START_LIVES;
  state.finished = false;
  state.safeUntil = 0;
  state.hitTick = -1;
  state.kills = 0;
  state.shotCooldown = 0;
  state.enemyStatus.fill(0);
  state.enemyHp.fill(0);
  state.enemyX.fill(0);
  state.enemyY.fill(0);
  state.enemyFire.fill(0);
  state.enemyEndTick.fill(0);
  state.firstLive = 0;
  state.nextSpawn = 0;
  state.shotActive.fill(0);
  state.bulletActive.fill(0);
  state.bulletCount = 0;
}

function sizeEnemies(state: SimState, level: Level): void {
  const n = level.enemies.count;
  state.enemyStatus = new Uint8Array(n);
  state.enemyHp = new Uint8Array(n);
  state.enemyX = new Int32Array(n);
  state.enemyY = new Int32Array(n);
  state.enemyFire = new Uint32Array(n);
  state.enemyEndTick = new Int32Array(n);
  for (let i = 0; i < n; i++) state.enemyFire[i] = level.enemies.fireStart[i]!;
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
 * True if the box with its centre at screen (x, y) and half sizes (hw, hh), all Q8, at sim
 * tick `t` overlaps a solid part of the terrain: a lit segment of any bar it overlaps
 * horizontally (bars are solid for BAR_LIT_WIDTH px from their left edge), or a peak dot on
 * difficulties with solid peaks. The box is half-open: [x - hw, x + hw) x [y - hh, y + hh).
 */
export function boxHitsTerrain(level: Level, t: number, x: number, y: number, hw: number, hh: number): boolean {
  const wx0 = level.scroll[t]! + x - hw;
  const wx1 = wx0 + 2 * hw;
  const top = y - hh;
  const bottom = y + hh;
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

/** True if the ship's hitbox, centred at screen (x, y) Q8 at tick `t`, overlaps the terrain. */
export function shipCollides(level: Level, t: number, x: number, y: number): boolean {
  return boxHitsTerrain(level, t, x, y, HALF_W, HALF_H);
}

/** True if two boxes, given by centre and half size (Q8), overlap. */
function overlaps(ax: number, ay: number, ahw: number, ahh: number, bx: number, by: number, bhw: number, bhh: number): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  return dx < ahw + bhw && -dx < ahw + bhw && dy < ahh + bhh && -dy < ahh + bhh;
}

/** The bar whose lit part or gap is under world x `wx` (Q8), within the level. */
function barAt(level: Level, wx: number): number {
  const i = Math.floor(wx / BAR_PITCH_Q8);
  return i < 0 ? 0 : i >= level.barCount ? level.barCount - 1 : i;
}

/** The y of the middle of bar i's open gap, Q8. */
function caveCentre(level: Level, i: number): number {
  return Math.floor(((SEGMENT_PITCH * level.ceiling[i]! + PLAYFIELD_HEIGHT - SEGMENT_PITCH * level.floor[i]!) * Q8) / 2);
}

/** A ship's offset from its line at `age` ticks, Q8, for its ShipMotion. */
function motionOffset(motion: number, age: number): number {
  switch (motion) {
    case ShipMotion.weave: {
      // Each half period is a parabola, 4q(h - q) / h^2: within 6% of a sine.
      const half = WEAVE_PERIOD_TICKS / 2;
      const p = age % WEAVE_PERIOD_TICKS;
      const q = p % half;
      const mag = Math.floor((WEAVE_AMPLITUDE * Q8 * 4 * q * (half - q)) / (half * half));
      return p < half ? -mag : mag;
    }
    case ShipMotion.climb:
      return -Math.min(DRIFT_Q8 * age, 48 * Q8);
    case ShipMotion.dive:
      return Math.min(DRIFT_Q8 * age, 48 * Q8);
    case ShipMotion.hop: {
      const k = Math.floor(age / HOP_TICKS) % 3;
      return k === 0 ? 0 : k === 1 ? -HOP_PX * Q8 : HOP_PX * Q8;
    }
    default:
      return 0;
  }
}

/** Moves enemy i to tick t: its screen x and y. */
function placeEnemy(level: Level, state: SimState, i: number, t: number): void {
  const e = level.enemies;
  const age = t - e.spawnTick[i]!;
  switch (e.kind[i]) {
    case EnemyKind.turret:
      state.enemyX[i] = e.x[i]! - level.scroll[t]!;
      state.enemyY[i] = e.y[i]!;
      return;
    case EnemyKind.tank: {
      const wx = e.x[i]! - TANK_SPEED_Q8 * age;
      state.enemyX[i] = wx - level.scroll[t]!;
      state.enemyY[i] = HEIGHT_Q8 - SEG_PITCH_Q8 * level.floor[barAt(level, wx)]! - (TANK_HEIGHT * Q8) / 2;
      return;
    }
    default: {
      const sx = ENEMY_ENTRY_X * Q8 - EnemyTuning[level.difficulty].shipSpeedQ8 * age;
      state.enemyX[i] = sx;
      const target = caveCentre(level, barAt(level, level.scroll[t]! + sx)) + e.y[i]! + motionOffset(e.motion[i]!, age);
      let y = target;
      if (age > 0) {
        y = state.enemyY[i]!;
        if (target > y + SHIP_STEER_Q8) y += SHIP_STEER_Q8;
        else if (target < y - SHIP_STEER_Q8) y -= SHIP_STEER_Q8;
        else y = target;
      }
      if (y < 4 * Q8) y = 4 * Q8;
      if (y > HEIGHT_Q8 - 4 * Q8) y = HEIGHT_Q8 - 4 * Q8;
      state.enemyY[i] = y;
    }
  }
}

/** Fires an enemy bullet from (x, y) at the ship, if the difficulty's cap allows one more. */
function fireAtShip(level: Level, state: SimState, x: number, y: number): void {
  const { bulletSpeedQ8, maxBullets } = EnemyTuning[level.difficulty];
  if (state.bulletCount >= maxBullets) return;
  let slot = 0;
  while (slot < BULLET_SLOTS && state.bulletActive[slot]) slot++;
  if (slot === BULLET_SLOTS) return;
  const dx = state.shipX - x;
  const dy = state.shipY - y;
  // sqrt is correctly rounded in IEEE 754, so every engine gets the same length.
  const length = Math.sqrt(dx * dx + dy * dy);
  state.bulletActive[slot] = 1;
  state.bulletX[slot] = x;
  state.bulletY[slot] = y;
  state.bulletVX[slot] = length < Q8 ? -bulletSpeedQ8 : Math.trunc((dx * bulletSpeedQ8) / length);
  state.bulletVY[slot] = length < Q8 ? 0 : Math.trunc((dy * bulletSpeedQ8) / length);
  state.bulletCount++;
}

function removeBullet(state: SimState, slot: number): void {
  state.bulletActive[slot] = 0;
  state.bulletCount--;
}

/** Ends enemy i's life at tick t with `status`. */
function endEnemy(state: SimState, i: number, t: number, status: number): void {
  state.enemyStatus[i] = status;
  state.enemyEndTick[i] = t;
}

/**
 * The ship loses a life at tick t. With lives left it comes back at the playhead, in the
 * middle of the cave there, can't be hit for RESPAWN_SAFE_TICKS, and every enemy bullet
 * is cleared. With none left the run is over.
 */
function loseLife(level: Level, state: SimState, t: number): void {
  state.lives--;
  state.hitTick = t;
  if (state.lives <= 0) {
    state.dead = true;
    state.deathTick = t;
    return;
  }
  state.shipX = SHIP_START_X * Q8;
  state.shipY = caveCentre(level, barAt(level, level.scroll[t]! + state.shipX));
  state.safeUntil = t + RESPAWN_SAFE_TICKS;
  state.bulletActive.fill(0);
  state.bulletCount = 0;
}

/**
 * Advances `state` by one tick with `input` (InputBit flags), in this order:
 * 1. Move the ship (opposite directions cancel; diagonals use SHIP_DIAGONAL_SPEED_Q8 per
 *    axis) and keep it in bounds, then advance the tick.
 * 2. Spawn enemies whose time has come, move every live one, and drop those off screen.
 * 3. Fire if the fire bit is held and the gun is ready; move shots, which pass through the
 *    LED walls (so turrets on the bar tips can be hit) and stop on the first enemy they hit.
 * 4. Enemies fire on their scheduled ticks; move enemy bullets, which stop on the terrain.
 * 5. Unless the ship is in its safe time after a respawn, test it against the terrain,
 *    live enemies (which are destroyed too) and enemy bullets; a hit costs a life.
 * Does nothing once the ship is dead or the song is over.
 */
export function tick(level: Level, state: SimState, input: number): void {
  if (state.dead || state.finished) return;
  const e = level.enemies;
  if (state.enemyStatus.length !== e.count) sizeEnemies(state, level);

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
  const t = state.tick;

  // 2. Enemies.
  while (state.nextSpawn < e.count && e.spawnTick[state.nextSpawn]! <= t) {
    const i = state.nextSpawn++;
    state.enemyStatus[i] = EnemyStatus.alive;
    state.enemyHp[i] = ENEMY_HP[e.kind[i]!]!;
  }
  for (let i = state.firstLive; i < state.nextSpawn; i++) {
    if (state.enemyStatus[i] !== EnemyStatus.alive) continue;
    placeEnemy(level, state, i, t);
    if (state.enemyX[i]! < ENEMY_EXIT_X * Q8) endEnemy(state, i, t, EnemyStatus.gone);
  }
  while (state.firstLive < state.nextSpawn && state.enemyStatus[state.firstLive]! >= EnemyStatus.destroyed) {
    state.firstLive++;
  }

  // 3. Shots.
  if (state.shotCooldown > 0) state.shotCooldown--;
  if ((input & InputBit.fire) !== 0 && state.shotCooldown === 0) {
    let slot = 0;
    while (slot < MAX_SHOTS && state.shotActive[slot]) slot++;
    if (slot < MAX_SHOTS) {
      state.shotActive[slot] = 1;
      state.shotX[slot] = x + HALF_W + SHOT_HW;
      state.shotY[slot] = y;
      state.shotCooldown = SHOT_INTERVAL_TICKS;
    }
  }
  for (let s = 0; s < MAX_SHOTS; s++) {
    if (!state.shotActive[s]) continue;
    const sx = state.shotX[s]! + SHOT_SPEED_Q8;
    const sy = state.shotY[s]!;
    state.shotX[s] = sx;
    if (sx - SHOT_HW >= WIDTH_Q8) {
      state.shotActive[s] = 0;
      continue;
    }
    for (let i = state.firstLive; i < state.nextSpawn; i++) {
      if (state.enemyStatus[i] !== EnemyStatus.alive) continue;
      const k = e.kind[i]!;
      if (!overlaps(sx, sy, SHOT_HW, SHOT_HH, state.enemyX[i]!, state.enemyY[i]!, ENEMY_HW[k]!, ENEMY_HH[k]!)) continue;
      state.shotActive[s] = 0;
      state.enemyHp[i]!--;
      if (state.enemyHp[i] === 0) {
        endEnemy(state, i, t, EnemyStatus.destroyed);
        state.kills++;
      }
      break;
    }
  }

  // 4. Enemy fire and bullets.
  for (let i = state.firstLive; i < state.nextSpawn; i++) {
    let f = state.enemyFire[i]!;
    const end = e.fireStart[i + 1]!;
    while (f < end && e.fireTick[f]! <= t) {
      if (e.fireTick[f] === t && state.enemyStatus[i] === EnemyStatus.alive) {
        fireAtShip(level, state, state.enemyX[i]!, state.enemyY[i]!);
      }
      f++;
    }
    state.enemyFire[i] = f;
  }
  for (let b = 0; b < BULLET_SLOTS; b++) {
    if (!state.bulletActive[b]) continue;
    const bx = state.bulletX[b]! + state.bulletVX[b]!;
    const by = state.bulletY[b]! + state.bulletVY[b]!;
    state.bulletX[b] = bx;
    state.bulletY[b] = by;
    const off = bx < -BULLET_H || bx >= WIDTH_Q8 + BULLET_H || by < -BULLET_H || by >= HEIGHT_Q8 + BULLET_H;
    if (off || boxHitsTerrain(level, t, bx, by, BULLET_H, BULLET_H)) removeBullet(state, b);
  }

  // 5. The ship.
  if (t >= state.safeUntil) {
    let hit = shipCollides(level, t, x, y);
    for (let i = state.firstLive; i < state.nextSpawn && !hit; i++) {
      if (state.enemyStatus[i] !== EnemyStatus.alive) continue;
      const k = e.kind[i]!;
      if (overlaps(x, y, HALF_W, HALF_H, state.enemyX[i]!, state.enemyY[i]!, ENEMY_HW[k]!, ENEMY_HH[k]!)) {
        endEnemy(state, i, t, EnemyStatus.destroyed);
        state.kills++;
        hit = true;
      }
    }
    for (let b = 0; b < BULLET_SLOTS && !hit; b++) {
      if (!state.bulletActive[b]) continue;
      if (overlaps(x, y, HALF_W, HALF_H, state.bulletX[b]!, state.bulletY[b]!, BULLET_H, BULLET_H)) {
        removeBullet(state, b);
        hit = true;
      }
    }
    if (hit) loseLife(level, state, t);
  }
  if (state.tick >= level.tickCount) state.finished = true;
}

/**
 * Runs `inputs` (one InputBit byte per tick) from the start of the song until the log
 * ends, the last life is lost, or the song ends, and returns the final state.
 */
export function runInputLog(level: Level, inputs: Uint8Array, state: SimState = createSimState()): SimState {
  for (let i = 0; i < inputs.length && !state.dead && !state.finished; i++) tick(level, state, inputs[i]!);
  return state;
}

/**
 * A deterministic byte form of the state, for golden hashes: 10 little-endian i32s (tick,
 * shipX, shipY, dead, deathTick, lives, finished, safeUntil, hitTick, kills), then each
 * enemy's status byte.
 */
export function serializeSimState(state: SimState): Uint8Array {
  const out = new Uint8Array(40 + state.enemyStatus.length);
  const view = new DataView(out.buffer);
  const fields = [
    state.tick,
    state.shipX,
    state.shipY,
    state.dead ? 1 : 0,
    state.deathTick,
    state.lives,
    state.finished ? 1 : 0,
    state.safeUntil,
    state.hitTick,
    state.kills,
  ];
  for (let i = 0; i < fields.length; i++) view.setInt32(i * 4, fields[i]!, true);
  out.set(state.enemyStatus, 40);
  return out;
}
