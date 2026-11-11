// The 120 Hz simulation (docs/PLAN.md, "Simulation"). Integer math only, plus Math.sqrt
// for aiming; tick() writes into a preallocated state. The enemy arrays are sized to the
// level on its first tick, the only time tick() allocates.

import { EnemyKind, EnemyTuning, ShipMotion, type Level } from '../levelgen/types.ts';
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
  BOOST_DIAGONAL_SPEED_Q8,
  BOOST_FUEL_PER_LEVEL,
  BOOST_MAX_LEVEL,
  BOOST_REFILL_TICKS,
  BOOST_SPEED_Q8,
  CAPSULE_SIZE,
  Cheat,
  CAPSULE_SLOTS,
  DOUBLE_SPEED_Q8,
  LASER_SPEED_Q8,
  LASER_WIDTH,
  MAX_DRONES,
  MISSILE_BLAST_PX,
  MISSILE_HEIGHT,
  MISSILE_RELOAD_TICKS,
  MISSILE_SPEED_Q8,
  MISSILE_WIDTH,
  DRONE_DELAY_TICKS,
  POWER_UP_COUNT,
  PowerUp,
  BOUNCE_SPEED_Q8,
  BOUNCE_TICKS,
  EXTRA_LIFE_POINTS,
  MAX_LIVES,
  SHIELD_BULLET_COST,
  SHIELD_MAX,
  SHIELD_RAM_COST,
  SHIELD_WALL_COST,
  BOMB_BLAST_PX,
  BOMB_RELOAD_TICKS,
  BOMB_GRAVITY_Q8,
  BOMB_MAX_VY_Q8,
  BOMB_SIZE,
  BOMB_VX_Q8,
  DRIFT_Q8,
  MAX_NUKES,
  NUKE_CHARGE_KILLS,
  KILL_POINTS,
  MAX_MULTIPLIER,
  ON_BEAT_TICKS,
  STREAK_STEP,
  SURVIVAL_POINTS_PER_LIFE,
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
  RESPAWN_FLY_TICKS,
  RESPAWN_FROM_X,
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
const BOMB_H = (BOMB_SIZE * Q8) / 2;
const LASER_HW = (LASER_WIDTH * Q8) / 2;
const MISSILE_HW = (MISSILE_WIDTH * Q8) / 2;
const MISSILE_HH = (MISSILE_HEIGHT * Q8) / 2;
const MISSILE_BLAST_H = MISSILE_BLAST_PX * Q8;
const CAPSULE_H = (CAPSULE_SIZE * Q8) / 2;
/** Ship positions kept for the drones to follow: a power of two over the longest delay. */
const TRAIL = 64;
const BLAST_H = BOMB_BLAST_PX * Q8;
/** Half sizes of each enemy kind's hitbox, indexed by EnemyKind. */
const ENEMY_HW = [(TURRET_WIDTH * Q8) / 2, (TANK_WIDTH * Q8) / 2, (ENEMY_SHIP_WIDTH * Q8) / 2] as const;
const ENEMY_HH = [(TURRET_HEIGHT * Q8) / 2, (TANK_HEIGHT * Q8) / 2, (ENEMY_SHIP_HEIGHT * Q8) / 2] as const;
/** Bullet slots; each difficulty caps how many are in flight (EnemyTuning.maxBullets). */
export const BULLET_SLOTS = 16;
/**
 * Shot slots: MAX_SHOTS straight and MAX_SHOTS angled (double) for the ship and each
 * drone. Each of those six groups is capped at MAX_SHOTS in flight.
 */
export const SHOT_SLOTS = MAX_SHOTS * 2 * (1 + MAX_DRONES);
/** Missile slots: the ship's, then one per drone. */
export const MISSILE_SLOTS = 1 + MAX_DRONES;

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
  /** The score at which the next extra life comes, and the tick the last one came (-1). */
  nextExtraLife: number;
  extraLifeTick: number;
  /** True once tick reaches level.tickCount. */
  finished: boolean;
  /** Enemies and bullets can't hit the ship before this tick (after losing a life). */
  safeUntil: number;
  /**
   * Until this tick the ship flies in after losing a life: the controls are ignored and the
   * walls don't count (RESPAWN_FLY_TICKS).
   */
  flyInUntil: number;
  /** Cheat flags, set before the run starts; resetSimState keeps them. */
  cheats: number;
  /** The tick the ship last lost a life, or -1. */
  hitTick: number;
  /** Enemies destroyed by shots or by ramming. */
  kills: number;
  score: number;
  /** Kills by shots since the ship last lost a life; sets the multiplier. */
  streak: number;
  /** Kills on the beat. */
  onBeatKills: number;
  /** The points for lives left, added when the song ends, or 0. */
  survivalBonus: number;
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
  /** False until tick() has set the per-enemy arrays up for the level: on the first tick, and after resetSimState. */
  enemiesReady: boolean;
  /** The tick each enemy was destroyed or left the screen, or 0. */
  enemyEndTick: Int32Array;
  /** Points each enemy scored when shot down (0 if rammed or not destroyed), and whether on the beat. */
  enemyPoints: Uint16Array;
  enemyOnBeat: Uint8Array;
  /** Enemies before this index are destroyed or gone; from it on, not yet spawned. */
  firstLive: number;
  nextSpawn: number;
  /** Player shots: screen centre and velocity per tick, Q8; who fired (0 the ship, 1 and 2 the drones); laser or not. */
  shotActive: Uint8Array;
  shotX: Int32Array;
  shotY: Int32Array;
  shotVX: Int32Array;
  shotVY: Int32Array;
  shotSource: Uint8Array;
  shotLaser: Uint8Array;
  /** Enemy bullets: screen centre and velocity per tick, Q8, and the EnemyKind that fired each. */
  bulletActive: Uint8Array;
  bulletKind: Uint8Array;
  bulletX: Int32Array;
  bulletY: Int32Array;
  bulletVX: Int32Array;
  bulletVY: Int32Array;
  bulletCount: number;
  /** The concussive bomb: in the air or not, screen centre and fall speed, Q8. */
  bombActive: boolean;
  bombX: number;
  bombY: number;
  bombVY: number;
  /** A bomb can't be dropped before this tick: BOMB_RELOAD_TICKS after the last burst. */
  bombReadyTick: number;
  /** The last bomb's burst: its tick (-1 before the first) and screen centre, Q8. */
  blastTick: number;
  blastX: number;
  blastY: number;
  /** Nukes held, kills on the beat towards the next, and the tick of the last one (-1). */
  nukes: number;
  nukeCharge: number;
  nukeTick: number;
  /** The previous tick's input, so a press of the nuke button acts once. */
  prevInput: number;
  /** The power-up meter's highlighted slot (a PowerUp), or -1; capsules picked up. */
  meter: number;
  capsules: number;
  /** Power-ups: boost level (0 to 3) and fuel left (ticks), double, laser, missile, drones, shield points left. */
  boostLevel: number;
  boostFuel: number;
  /** True if the ship boosted this tick. */
  boosting: boolean;
  double: boolean;
  laser: boolean;
  missile: boolean;
  drones: number;
  shield: number;
  /** The tick the shield last took a hit, or -1. */
  shieldHitTick: number;
  /** Knocked off a wall: until this tick, and +1 (down) or -1 (up). */
  bounceUntil: number;
  bounceDir: number;
  /** The ship's centre over the last TRAIL ticks (index tick % TRAIL), and the drones' positions, Q8. */
  trailX: Int32Array;
  trailY: Int32Array;
  droneX: Int32Array;
  droneY: Int32Array;
  /** Missiles by slot (0 the ship's), screen centre Q8; the tick the ship's next can launch. */
  missileActive: Uint8Array;
  missileX: Int32Array;
  missileY: Int32Array;
  missileReadyTick: number;
  /** Each missile slot's last burst: tick (-1 before the first) and screen centre, Q8. */
  missileBlastTick: Int32Array;
  missileBlastX: Int32Array;
  missileBlastY: Int32Array;
  /** Capsules: screen centre, Q8, the world x of the centre, and the fall speed. */
  capsuleActive: Uint8Array;
  capsuleX: Int32Array;
  capsuleY: Int32Array;
  capsuleWX: Int32Array;
  capsuleVY: Int32Array;
  /** Per formation: ships shot down, and 1 once one got away or was rammed (no capsule then). */
  formationShot: Uint8Array;
  formationSpoiled: Uint8Array;
}

/** A state at the start of the song, with `cheats` (Cheat flags) for the whole run. */
export function createSimState(cheats = 0): SimState {
  const state: SimState = {
    tick: 0,
    shipX: 0,
    shipY: 0,
    dead: false,
    deathTick: -1,
    lives: START_LIVES,
    nextExtraLife: EXTRA_LIFE_POINTS,
    extraLifeTick: -1,
    finished: false,
    safeUntil: 0,
    flyInUntil: 0,
    cheats,
    hitTick: -1,
    kills: 0,
    score: 0,
    streak: 0,
    onBeatKills: 0,
    survivalBonus: 0,
    shotCooldown: 0,
    enemyStatus: new Uint8Array(0),
    enemyHp: new Uint8Array(0),
    enemyX: new Int32Array(0),
    enemyY: new Int32Array(0),
    enemyFire: new Uint32Array(0),
    enemiesReady: false,
    enemyEndTick: new Int32Array(0),
    enemyPoints: new Uint16Array(0),
    enemyOnBeat: new Uint8Array(0),
    firstLive: 0,
    nextSpawn: 0,
    shotActive: new Uint8Array(SHOT_SLOTS),
    shotX: new Int32Array(SHOT_SLOTS),
    shotY: new Int32Array(SHOT_SLOTS),
    shotVX: new Int32Array(SHOT_SLOTS),
    shotVY: new Int32Array(SHOT_SLOTS),
    shotSource: new Uint8Array(SHOT_SLOTS),
    shotLaser: new Uint8Array(SHOT_SLOTS),
    bulletActive: new Uint8Array(BULLET_SLOTS),
    bulletKind: new Uint8Array(BULLET_SLOTS),
    bulletX: new Int32Array(BULLET_SLOTS),
    bulletY: new Int32Array(BULLET_SLOTS),
    bulletVX: new Int32Array(BULLET_SLOTS),
    bulletVY: new Int32Array(BULLET_SLOTS),
    bulletCount: 0,
    bombActive: false,
    bombX: 0,
    bombY: 0,
    bombVY: 0,
    bombReadyTick: 0,
    blastTick: -1,
    blastX: 0,
    blastY: 0,
    nukes: 0,
    nukeCharge: 0,
    nukeTick: -1,
    prevInput: 0,
    meter: -1,
    capsules: 0,
    boostLevel: 0,
    boostFuel: 0,
    boosting: false,
    double: false,
    laser: false,
    missile: false,
    drones: 0,
    shield: 0,
    shieldHitTick: -1,
    bounceUntil: 0,
    bounceDir: 0,
    trailX: new Int32Array(TRAIL),
    trailY: new Int32Array(TRAIL),
    droneX: new Int32Array(MAX_DRONES),
    droneY: new Int32Array(MAX_DRONES),
    missileActive: new Uint8Array(MISSILE_SLOTS),
    missileX: new Int32Array(MISSILE_SLOTS),
    missileY: new Int32Array(MISSILE_SLOTS),
    missileReadyTick: 0,
    missileBlastTick: new Int32Array(MISSILE_SLOTS),
    missileBlastX: new Int32Array(MISSILE_SLOTS),
    missileBlastY: new Int32Array(MISSILE_SLOTS),
    capsuleActive: new Uint8Array(CAPSULE_SLOTS),
    capsuleX: new Int32Array(CAPSULE_SLOTS),
    capsuleY: new Int32Array(CAPSULE_SLOTS),
    capsuleWX: new Int32Array(CAPSULE_SLOTS),
    capsuleVY: new Int32Array(CAPSULE_SLOTS),
    formationShot: new Uint8Array(0),
    formationSpoiled: new Uint8Array(0),
  };
  resetSimState(state);
  return state;
}

/** Puts `state` back at the start of the song, keeping its cheats. */
export function resetSimState(state: SimState): void {
  state.tick = 0;
  state.shipX = SHIP_START_X * Q8;
  state.shipY = SHIP_START_Y * Q8;
  state.dead = false;
  state.deathTick = -1;
  state.lives = START_LIVES;
  state.nextExtraLife = EXTRA_LIFE_POINTS;
  state.extraLifeTick = -1;
  state.finished = false;
  state.safeUntil = 0;
  state.flyInUntil = 0;
  state.hitTick = -1;
  state.kills = 0;
  state.score = 0;
  state.streak = 0;
  state.onBeatKills = 0;
  state.survivalBonus = 0;
  state.shotCooldown = 0;
  // The per-enemy arrays are set up from the level on the next tick (setUpEnemies).
  state.enemiesReady = false;
  state.firstLive = 0;
  state.nextSpawn = 0;
  state.shotActive.fill(0);
  state.bulletActive.fill(0);
  state.bulletCount = 0;
  state.bombActive = false;
  state.bombX = 0;
  state.bombY = 0;
  state.bombVY = 0;
  state.bombReadyTick = 0;
  state.blastTick = -1;
  state.blastX = 0;
  state.blastY = 0;
  state.nukes = 0;
  state.nukeCharge = 0;
  state.nukeTick = -1;
  state.prevInput = 0;
  state.capsules = 0;
  state.shieldHitTick = -1;
  state.bounceUntil = 0;
  state.bounceDir = 0;
  loseUpgrades(state);
  state.boosting = false;
  resetTrail(state, state.shipX, state.shipY);
  state.missileActive.fill(0);
  state.missileReadyTick = 0;
  state.missileBlastTick.fill(-1);
  state.capsuleActive.fill(0);
}

/**
 * Every power-up is lost and the unlock order starts again (a new run, or a life lost),
 * but the shield is full. With the god cheat the ship has every power-up instead.
 */
function loseUpgrades(state: SimState): void {
  state.meter = -1;
  state.shield = SHIELD_MAX;
  if ((state.cheats & Cheat.god) !== 0) {
    state.boostLevel = BOOST_MAX_LEVEL;
    state.boostFuel = BOOST_MAX_LEVEL * BOOST_FUEL_PER_LEVEL;
    state.double = true;
    state.laser = true;
    state.missile = true;
    state.drones = MAX_DRONES;
    return;
  }
  state.boostLevel = 0;
  state.boostFuel = 0;
  state.double = false;
  state.laser = false;
  state.missile = false;
  state.drones = 0;
}

/** Fills the trail with (x, y), so the drones start on the ship. */
function resetTrail(state: SimState, x: number, y: number): void {
  state.trailX.fill(x);
  state.trailY.fill(y);
  state.droneX.fill(x);
  state.droneY.fill(y);
}

/**
 * Sets the per-enemy and per-formation arrays up for `level`: sized to it (allocating only
 * when the size changed), cleared, and each enemy's next fire index at its first fire tick.
 */
function setUpEnemies(state: SimState, level: Level): void {
  const n = level.enemies.count;
  const f = level.enemies.formationSize.length;
  if (state.enemyStatus.length !== n) {
    state.enemyStatus = new Uint8Array(n);
    state.enemyHp = new Uint8Array(n);
    state.enemyX = new Int32Array(n);
    state.enemyY = new Int32Array(n);
    state.enemyFire = new Uint32Array(n);
    state.enemyEndTick = new Int32Array(n);
    state.enemyPoints = new Uint16Array(n);
    state.enemyOnBeat = new Uint8Array(n);
  } else {
    state.enemyStatus.fill(0);
    state.enemyHp.fill(0);
    state.enemyX.fill(0);
    state.enemyY.fill(0);
    state.enemyEndTick.fill(0);
    state.enemyPoints.fill(0);
    state.enemyOnBeat.fill(0);
  }
  for (let i = 0; i < n; i++) state.enemyFire[i] = level.enemies.fireStart[i]!;
  if (state.formationShot.length !== f) {
    state.formationShot = new Uint8Array(f);
    state.formationSpoiled = new Uint8Array(f);
  } else {
    state.formationShot.fill(0);
    state.formationSpoiled.fill(0);
  }
  state.enemiesReady = true;
}

/**
 * True if any lit segment overlaps the column of segments [top, bottom) (Q8, measured
 * from the side's edge), for a side with `level` lit segments.
 */
function sideHits(top: number, bottom: number, level: number): boolean {
  if (bottom <= 0) return false;
  const first = top <= 0 ? 0 : Math.floor(top / SEG_PITCH_Q8);
  const last = Math.floor((bottom - 1) / SEG_PITCH_Q8);
  for (let k = first; k <= last && k < level; k++) {
    const segTop = k * SEG_PITCH_Q8;
    if (top < segTop + SEG_LIT_Q8 && bottom > segTop) return true;
  }
  return false;
}

/**
 * True if the box with its centre at screen (x, y) and half sizes (hw, hh), all Q8, at sim
 * tick `t` overlaps a solid part of the terrain: a lit segment of any bar it overlaps
 * horizontally (bars are solid for BAR_LIT_WIDTH px from their left edge). The box is half-open: [x - hw, x + hw) x [y - hh, y + hh).
 */
export function boxHitsTerrain(level: Level, t: number, x: number, y: number, hw: number, hh: number): boolean {
  const wx0 = level.scroll[t]! + x - hw;
  const wx1 = wx0 + 2 * hw;
  const top = y - hh;
  const bottom = y + hh;
  let first = Math.floor(wx0 / BAR_PITCH_Q8);
  if (first < 0) first = 0;
  let last = Math.floor((wx1 - 1) / BAR_PITCH_Q8);
  if (last > level.barCount - 1) last = level.barCount - 1;
  for (let i = first; i <= last; i++) {
    const barX = i * BAR_PITCH_Q8;
    if (!(wx0 < barX + BAR_LIT_Q8 && wx1 > barX)) continue;
    if (sideHits(top, bottom, level.ceiling[i]!)) return true;
    // The floor is the ceiling mirrored: y measured up from the bottom edge.
    if (sideHits(HEIGHT_Q8 - bottom, HEIGHT_Q8 - top, level.floor[i]!)) {
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

/** The score multiplier for a streak of `streak` kills without losing a life. */
export function scoreMultiplier(streak: number): number {
  const m = 1 + Math.floor(streak / STREAK_STEP);
  return m < MAX_MULTIPLIER ? m : MAX_MULTIPLIER;
}

/** True if instrument `inst` has a note within ON_BEAT_TICKS of tick t. */
export function onBeat(level: Level, inst: number, t: number): boolean {
  // The first of the instrument's note ticks at or after t - ON_BEAT_TICKS.
  let lo = level.noteStart[inst]!;
  let hi = level.noteStart[inst + 1]!;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (level.noteTick[mid]! < t - ON_BEAT_TICKS) lo = mid + 1;
    else hi = mid;
  }
  return lo < level.noteStart[inst + 1]! && level.noteTick[lo]! <= t + ON_BEAT_TICKS;
}

/**
 * Destroys enemy i at tick t and scores it: its kind's points, doubled on the beat (unless
 * `nuked`), times the multiplier. A kill on the beat charges the nuke.
 */
function scoreKill(level: Level, state: SimState, i: number, t: number, nuked = false): void {
  endEnemy(state, i, t, EnemyStatus.destroyed);
  state.kills++;
  const beat = !nuked && onBeat(level, level.enemies.instrument[i]!, t);
  const points = KILL_POINTS[level.enemies.kind[i]!]! * (beat ? 2 : 1) * scoreMultiplier(state.streak);
  state.score += points;
  state.enemyPoints[i] = points;
  state.enemyOnBeat[i] = beat ? 1 : 0;
  state.streak++;
  const f = level.enemies.formation[i]!;
  if (f >= 0 && ++state.formationShot[f]! === level.enemies.formationSize[f]! && state.formationSpoiled[f] === 0) {
    spawnCapsule(level, state, state.enemyX[i]!, state.enemyY[i]!, t);
  }
  if (beat) {
    state.onBeatKills++;
    if (state.nukes < MAX_NUKES && ++state.nukeCharge >= NUKE_CHARGE_KILLS) {
      state.nukes++;
      state.nukeCharge = 0;
    }
  }
}

/** Enemy i got away or was rammed: its formation drops no capsule. */
function spoilFormation(level: Level, state: SimState, i: number): void {
  const f = level.enemies.formation[i]!;
  if (f >= 0) state.formationSpoiled[f] = 1;
}

function spawnCapsule(level: Level, state: SimState, x: number, y: number, t: number): void {
  for (let c = 0; c < CAPSULE_SLOTS; c++) {
    if (state.capsuleActive[c]) continue;
    state.capsuleActive[c] = 1;
    state.capsuleX[c] = x;
    state.capsuleY[c] = y;
    state.capsuleWX[c] = level.scroll[t]! + x;
    state.capsuleVY[c] = 0;
    return;
  }
}

/** The y (Q8) of a capsule's centre resting on the highest floor under world x `wx`. */
function capsuleRestY(level: Level, wx: number): number {
  const a = level.floor[barAt(level, wx - CAPSULE_H)]!;
  const b = level.floor[barAt(level, wx + CAPSULE_H - 1)]!;
  return HEIGHT_Q8 - SEG_PITCH_Q8 * (a > b ? a : b) - CAPSULE_H;
}

/**
 * Capsules scroll with the cave and fall with the bomb's gravity until they rest on the
 * floor, which they then ride; they go at the left edge.
 */
function moveCapsules(level: Level, state: SimState, t: number): void {
  for (let c = 0; c < CAPSULE_SLOTS; c++) {
    if (!state.capsuleActive[c]) continue;
    const wx = state.capsuleWX[c]!;
    const x = wx - level.scroll[t]!;
    state.capsuleX[c] = x;
    if (x < -CAPSULE_H) {
      state.capsuleActive[c] = 0;
      continue;
    }
    let vy = state.capsuleVY[c]! + BOMB_GRAVITY_Q8;
    if (vy > BOMB_MAX_VY_Q8) vy = BOMB_MAX_VY_Q8;
    let y = state.capsuleY[c]! + vy;
    const rest = capsuleRestY(level, wx);
    if (y >= rest) {
      y = rest;
      vy = 0;
    }
    state.capsuleY[c] = y;
    state.capsuleVY[c] = vy;
  }
}

/** True if power-up `slot` (a PowerUp) can be unlocked: it isn't at its most. */
export function canUnlock(state: SimState, slot: number): boolean {
  switch (slot) {
    case PowerUp.boost:
      return state.boostLevel < BOOST_MAX_LEVEL;
    case PowerUp.double:
      return !state.double;
    case PowerUp.laser:
      return !state.laser;
    case PowerUp.missile:
      return !state.missile;
    case PowerUp.drone:
      return state.drones < MAX_DRONES;
    case PowerUp.shield:
      return state.shield < SHIELD_MAX;
    default:
      return false;
  }
}

function unlock(state: SimState, slot: number): void {
  switch (slot) {
    case PowerUp.boost:
      state.boostLevel++;
      state.boostFuel = state.boostLevel * BOOST_FUEL_PER_LEVEL;
      break;
    case PowerUp.double:
      state.double = true;
      break;
    case PowerUp.laser:
      state.laser = true;
      break;
    case PowerUp.missile:
      state.missile = true;
      break;
    case PowerUp.drone:
      state.drones++;
      break;
    default:
      state.shield = SHIELD_MAX;
  }
}

/** Fires one shot from (x, y) Q8 for `source`, unless that source's group is full. */
function addShot(state: SimState, source: number, x: number, y: number, vx: number, vy: number, laser: boolean): boolean {
  let inGroup = 0;
  let free = -1;
  for (let s = 0; s < SHOT_SLOTS; s++) {
    if (!state.shotActive[s]) {
      if (free < 0) free = s;
    } else if (state.shotSource[s] === source && (state.shotVY[s] !== 0) === (vy !== 0)) {
      inGroup++;
    }
  }
  if (free < 0 || inGroup >= MAX_SHOTS) return false;
  state.shotActive[free] = 1;
  state.shotX[free] = x;
  state.shotY[free] = y;
  state.shotVX[free] = vx;
  state.shotVY[free] = vy;
  state.shotSource[free] = source;
  state.shotLaser[free] = laser ? 1 : 0;
  return true;
}

/**
 * The power-up the next capsule unlocks: the first after the last one unlocked
 * (state.meter) that isn't at its most, wrapping round; -1 if all are at their most.
 */
export function nextUnlock(state: SimState): number {
  let slot = state.meter;
  for (let n = 0; n < POWER_UP_COUNT; n++) {
    slot = slot + 1 >= POWER_UP_COUNT ? 0 : slot + 1;
    if (canUnlock(state, slot)) return slot;
  }
  return -1;
}

/** A capsule picked up unlocks nextUnlock(); with every power-up at its most it does nothing. */
function unlockNext(state: SimState): void {
  const slot = nextUnlock(state);
  if (slot < 0) return;
  unlock(state, slot);
  state.meter = slot;
}

/** A volley from the ship or a drone centred at (x, y): the straight shot or laser, plus the angled one with double. */
function fireVolley(state: SimState, source: number, x: number, y: number): boolean {
  const laser = state.laser;
  const hw = laser ? LASER_HW : SHOT_HW;
  let fired = addShot(state, source, x + HALF_W + hw, y, laser ? LASER_SPEED_Q8 : SHOT_SPEED_Q8, 0, laser);
  if (state.double) fired = addShot(state, source, x + HALF_W, y - HALF_H, DOUBLE_SPEED_Q8, -DOUBLE_SPEED_Q8, false) || fired;
  return fired;
}

/** Missile slot m bursts at tick t, destroying every live enemy within its blast. */
function burstMissile(level: Level, state: SimState, m: number, t: number): void {
  const e = level.enemies;
  const x = state.missileX[m]!;
  const y = state.missileY[m]!;
  state.missileActive[m] = 0;
  state.missileBlastTick[m] = t;
  state.missileBlastX[m] = x;
  state.missileBlastY[m] = y;
  if (m === 0) state.missileReadyTick = t + MISSILE_RELOAD_TICKS;
  for (let i = state.firstLive; i < state.nextSpawn; i++) {
    if (state.enemyStatus[i] !== EnemyStatus.alive) continue;
    const k = e.kind[i]!;
    if (overlaps(x, y, MISSILE_BLAST_H, MISSILE_BLAST_H, state.enemyX[i]!, state.enemyY[i]!, ENEMY_HW[k]!, ENEMY_HH[k]!)) {
      scoreKill(level, state, i, t);
    }
  }
}

/** The bomb bursts at (x, y) at tick t, destroying every live enemy its blast overlaps. */
function burstBomb(level: Level, state: SimState, x: number, y: number, t: number): void {
  const e = level.enemies;
  state.bombActive = false;
  state.bombReadyTick = t + BOMB_RELOAD_TICKS;
  state.blastTick = t;
  state.blastX = x;
  state.blastY = y;
  for (let i = state.firstLive; i < state.nextSpawn; i++) {
    if (state.enemyStatus[i] !== EnemyStatus.alive) continue;
    const k = e.kind[i]!;
    if (overlaps(x, y, BLAST_H, BLAST_H, state.enemyX[i]!, state.enemyY[i]!, ENEMY_HW[k]!, ENEMY_HH[k]!)) {
      scoreKill(level, state, i, t);
    }
  }
}

/** Moves the bomb one tick and bursts it if it reaches the terrain, an enemy, or the screen's edge. */
function moveBomb(level: Level, state: SimState, t: number): void {
  const e = level.enemies;
  let vy = state.bombVY + BOMB_GRAVITY_Q8;
  if (vy > BOMB_MAX_VY_Q8) vy = BOMB_MAX_VY_Q8;
  state.bombVY = vy;
  const x = state.bombX + BOMB_VX_Q8;
  const y = state.bombY + vy;
  state.bombX = x;
  state.bombY = y;
  let burst = x + BOMB_H >= WIDTH_Q8 || y + BOMB_H >= HEIGHT_Q8 || boxHitsTerrain(level, t, x, y, BOMB_H, BOMB_H);
  for (let i = state.firstLive; i < state.nextSpawn && !burst; i++) {
    if (state.enemyStatus[i] !== EnemyStatus.alive) continue;
    const k = e.kind[i]!;
    burst = overlaps(x, y, BOMB_H, BOMB_H, state.enemyX[i]!, state.enemyY[i]!, ENEMY_HW[k]!, ENEMY_HH[k]!);
  }
  if (burst) burstBomb(level, state, x, y, t);
}

/** The nuke at tick t: every live enemy on screen is destroyed and every enemy bullet cleared. */
function nuke(level: Level, state: SimState, t: number): void {
  state.nukes--;
  state.nukeTick = t;
  for (let i = state.firstLive; i < state.nextSpawn; i++) {
    if (state.enemyStatus[i] !== EnemyStatus.alive) continue;
    const x = state.enemyX[i]!;
    if (x >= 0 && x < WIDTH_Q8) scoreKill(level, state, i, t, true);
  }
  state.bulletActive.fill(0);
  state.bulletCount = 0;
}

/** Enemy i fires a bullet from where it is at the ship, if the difficulty's cap allows one more. */
function fireAtShip(level: Level, state: SimState, i: number): void {
  const x = state.enemyX[i]!;
  const y = state.enemyY[i]!;
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
  state.bulletKind[slot] = level.enemies.kind[i]!;
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
 * The ship loses a life at tick t, and every power-up. With lives left it flies in from the
 * left along the cave's centre (RESPAWN_FLY_TICKS), enemies and bullets can't hit it for
 * RESPAWN_SAFE_TICKS, and every enemy bullet is cleared. With none left the run is over.
 * With the infinite-lives cheat a life lost isn't counted.
 */
function loseLife(level: Level, state: SimState, t: number): void {
  if ((state.cheats & Cheat.infiniteLives) === 0) state.lives--;
  state.hitTick = t;
  state.streak = 0;
  loseUpgrades(state);
  if (state.lives <= 0) {
    state.dead = true;
    state.deathTick = t;
    return;
  }
  state.shipX = RESPAWN_FROM_X * Q8;
  state.shipY = caveCentre(level, barAt(level, level.scroll[t]! + state.shipX));
  state.flyInUntil = t + RESPAWN_FLY_TICKS;
  state.safeUntil = t + RESPAWN_SAFE_TICKS;
  state.bulletActive.fill(0);
  state.bulletCount = 0;
  state.bounceUntil = 0;
  resetTrail(state, state.shipX, state.shipY);
}

/**
 * The shield takes a hit costing `cost` points at tick t, if it has any left (with the god
 * cheat it loses none); false if it has none, and the hit costs a life.
 */
function shieldTakes(state: SimState, t: number, cost: number): boolean {
  if (state.shield <= 0) return false;
  if ((state.cheats & Cheat.god) === 0) state.shield = state.shield > cost ? state.shield - cost : 0;
  state.shieldHitTick = t;
  return true;
}

/**
 * Advances `state` by one tick with `rawInput` (InputBit flags), in this order:
 * 1. Move the ship (opposite directions cancel; diagonals use SHIP_DIAGONAL_SPEED_Q8 per
 *    axis; boost held with fuel left uses the boost speeds) and keep it in bounds, then
 *    advance the tick and move the drones along the ship's trail. While the ship flies in
 *    after losing a life the input counts as none, and the ship moves along its line in.
 * 2. Spawn enemies whose time has come, move every live one, and drop those off screen.
 * 3. A new press of the nuke button with a nuke held destroys every enemy on screen and clears the bullets. Fire if the fire
 *    bit is held and the gun is ready, from the ship and each drone; move shots, which
 *    stop on the first enemy they hit (a laser goes on, taking a hit off each enemy it
 *    overlaps), then on the LED walls (Brad, 2026-11-11). Move the bomb, or drop one on a
 *    new press once it has reloaded; it bursts on the terrain or an enemy, destroying all
 *    within its blast. Move missiles, or launch them on a new press once reloaded; they
 *    burst on the first enemy they touch or on the terrain.
 * 4. Enemies fire on their scheduled ticks; move enemy bullets, which stop on the terrain.
 * 5. Move capsules, which scroll with the cave and fall to its floor; the ship picks up
 *    those it touches, each unlocking the next power-up. A score past the next multiple of
 *    EXTRA_LIFE_POINTS gives a life. Unless the ship is flying in or bouncing, test it
 *    against the terrain; unless it is in its safe time after a respawn, against live
 *    enemies (which are destroyed too) and enemy bullets. While the shield has points it
 *    takes each hit for its SHIELD_* cost (none with the god cheat), and a wall knocks the
 *    ship towards the cave's middle; with none, a hit costs a life, the streak, and every
 *    power-up.
 * 6. At the song's end, add the survival bonus.
 * A shot that destroys an enemy scores KILL_POINTS for its kind, doubled on the beat (a
 * note of its instrument within ON_BEAT_TICKS), times scoreMultiplier(streak). Shooting
 * down every ship of a formation drops a capsule.
 * Does nothing once the ship is dead or the song is over.
 */
export function tick(level: Level, state: SimState, rawInput: number): void {
  if (state.dead || state.finished) return;
  // Flying in after losing a life, the controls are ignored.
  const flying = state.tick < state.flyInUntil;
  const input = flying ? 0 : rawInput;
  const e = level.enemies;
  if (!state.enemiesReady || state.enemyStatus.length !== e.count || state.formationShot.length !== e.formationSize.length) {
    setUpEnemies(state, level);
  }
  const pressed = input & ~state.prevInput;

  const dx = ((input & InputBit.right) !== 0 ? 1 : 0) - ((input & InputBit.left) !== 0 ? 1 : 0);
  const dy = ((input & InputBit.down) !== 0 ? 1 : 0) - ((input & InputBit.up) !== 0 ? 1 : 0);
  const boosting = (input & InputBit.boost) !== 0 && state.boostFuel > 0;
  state.boosting = boosting;
  if (boosting) state.boostFuel--;
  else if (state.boostFuel < state.boostLevel * BOOST_FUEL_PER_LEVEL && state.tick % BOOST_REFILL_TICKS === 0) state.boostFuel++;
  const diagonal = dx !== 0 && dy !== 0;
  const speed = boosting
    ? diagonal ? BOOST_DIAGONAL_SPEED_Q8 : BOOST_SPEED_Q8
    : diagonal ? SHIP_DIAGONAL_SPEED_Q8 : SHIP_SPEED_Q8;
  let x = state.shipX + dx * speed;
  let y = state.shipY + dy * speed;
  if (flying) {
    // In a straight line from RESPAWN_FROM_X to SHIP_START_X, on the cave's centre.
    const k = state.tick + 1 - (state.flyInUntil - RESPAWN_FLY_TICKS);
    x = RESPAWN_FROM_X * Q8 + Math.floor(((SHIP_START_X - RESPAWN_FROM_X) * Q8 * k) / RESPAWN_FLY_TICKS);
    y = caveCentre(level, barAt(level, level.scroll[state.tick + 1]! + x));
  } else {
    if (state.tick < state.bounceUntil) {
      // Knocked off a wall: towards the cave's middle, not past it, whatever the stick says.
      const mid = caveCentre(level, barAt(level, level.scroll[state.tick + 1]! + x));
      const gap = state.bounceDir * (mid - state.shipY);
      y = state.shipY + state.bounceDir * (gap <= 0 ? 0 : gap < BOUNCE_SPEED_Q8 ? gap : BOUNCE_SPEED_Q8);
    }
    if (x < MIN_X) x = MIN_X;
    if (x > MAX_X) x = MAX_X;
    if (y < MIN_Y) y = MIN_Y;
    if (y > MAX_Y) y = MAX_Y;
  }
  state.shipX = x;
  state.shipY = y;
  state.tick++;
  const t = state.tick;
  state.trailX[t & (TRAIL - 1)] = x;
  state.trailY[t & (TRAIL - 1)] = y;
  for (let k = 0; k < MAX_DRONES; k++) {
    const from = (t - DRONE_DELAY_TICKS * (k + 1)) & (TRAIL - 1);
    state.droneX[k] = state.trailX[from]!;
    state.droneY[k] = state.trailY[from]!;
  }

  // 2. Enemies.
  while (state.nextSpawn < e.count && e.spawnTick[state.nextSpawn]! <= t) {
    const i = state.nextSpawn++;
    state.enemyStatus[i] = EnemyStatus.alive;
    state.enemyHp[i] = ENEMY_HP[e.kind[i]!]!;
  }
  for (let i = state.firstLive; i < state.nextSpawn; i++) {
    if (state.enemyStatus[i] !== EnemyStatus.alive) continue;
    placeEnemy(level, state, i, t);
    if (state.enemyX[i]! < ENEMY_EXIT_X * Q8) {
      endEnemy(state, i, t, EnemyStatus.gone);
      spoilFormation(level, state, i);
    }
  }
  while (state.firstLive < state.nextSpawn && state.enemyStatus[state.firstLive]! >= EnemyStatus.destroyed) {
    state.firstLive++;
  }

  // 3. The nuke, shots, the bomb and missiles.
  if ((pressed & InputBit.nuke) !== 0 && state.nukes > 0) nuke(level, state, t);
  if (state.shotCooldown > 0) state.shotCooldown--;
  if ((input & InputBit.fire) !== 0 && state.shotCooldown === 0) {
    let fired = fireVolley(state, 0, x, y);
    for (let k = 0; k < state.drones; k++) fired = fireVolley(state, k + 1, state.droneX[k]!, state.droneY[k]!) || fired;
    if (fired) state.shotCooldown = SHOT_INTERVAL_TICKS;
  }
  for (let s = 0; s < SHOT_SLOTS; s++) {
    if (!state.shotActive[s]) continue;
    const sx = state.shotX[s]! + state.shotVX[s]!;
    const sy = state.shotY[s]! + state.shotVY[s]!;
    state.shotX[s] = sx;
    state.shotY[s] = sy;
    const laser = state.shotLaser[s] === 1;
    const hw = laser ? LASER_HW : SHOT_HW;
    if (sx - hw >= WIDTH_Q8 || sy + SHOT_HH <= 0) {
      state.shotActive[s] = 0;
      continue;
    }
    for (let i = state.firstLive; i < state.nextSpawn; i++) {
      if (state.enemyStatus[i] !== EnemyStatus.alive) continue;
      const k = e.kind[i]!;
      if (!overlaps(sx, sy, hw, SHOT_HH, state.enemyX[i]!, state.enemyY[i]!, ENEMY_HW[k]!, ENEMY_HH[k]!)) continue;
      state.enemyHp[i]!--;
      if (state.enemyHp[i] === 0) scoreKill(level, state, i, t);
      if (!laser) {
        state.shotActive[s] = 0;
        break;
      }
    }
    // Enemies first, so a turret on a bar's tip takes the shot that reaches it.
    if (state.shotActive[s] && boxHitsTerrain(level, t, sx, sy, hw, SHOT_HH)) state.shotActive[s] = 0;
  }
  if (state.bombActive) {
    moveBomb(level, state, t);
  } else if ((pressed & InputBit.bomb) !== 0 && t >= state.bombReadyTick) {
    state.bombActive = true;
    state.bombX = x;
    state.bombY = y + HALF_H + BOMB_H;
    state.bombVY = 0;
  }
  if (state.missile && (pressed & InputBit.missile) !== 0 && !state.missileActive[0] && t >= state.missileReadyTick) {
    for (let m = 0; m <= state.drones; m++) {
      if (state.missileActive[m]) continue;
      state.missileActive[m] = 1;
      state.missileX[m] = (m === 0 ? x : state.droneX[m - 1]!) + HALF_W + MISSILE_HW;
      state.missileY[m] = m === 0 ? y : state.droneY[m - 1]!;
    }
  }
  for (let m = 0; m < MISSILE_SLOTS; m++) {
    if (!state.missileActive[m]) continue;
    const mx = state.missileX[m]! + MISSILE_SPEED_Q8;
    state.missileX[m] = mx;
    if (mx - MISSILE_HW >= WIDTH_Q8) {
      state.missileActive[m] = 0;
      if (m === 0) state.missileReadyTick = t + MISSILE_RELOAD_TICKS;
      continue;
    }
    const my = state.missileY[m]!;
    for (let i = state.firstLive; i < state.nextSpawn; i++) {
      if (state.enemyStatus[i] !== EnemyStatus.alive) continue;
      const k = e.kind[i]!;
      if (overlaps(mx, my, MISSILE_HW, MISSILE_HH, state.enemyX[i]!, state.enemyY[i]!, ENEMY_HW[k]!, ENEMY_HH[k]!)) {
        burstMissile(level, state, m, t);
        break;
      }
    }
    // A wall bursts it too, its blast catching what's near (a turret on the bar's tip).
    if (state.missileActive[m] && boxHitsTerrain(level, t, mx, my, MISSILE_HW, MISSILE_HH)) burstMissile(level, state, m, t);
  }

  // 4. Enemy fire and bullets.
  for (let i = state.firstLive; i < state.nextSpawn; i++) {
    let f = state.enemyFire[i]!;
    const end = e.fireStart[i + 1]!;
    while (f < end && e.fireTick[f]! <= t) {
      if (e.fireTick[f] === t && state.enemyStatus[i] === EnemyStatus.alive) {
        fireAtShip(level, state, i);
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

  // 5. Capsules, then the ship.
  moveCapsules(level, state, t);
  for (let c = 0; c < CAPSULE_SLOTS; c++) {
    if (!state.capsuleActive[c]) continue;
    if (!overlaps(x, y, HALF_W, HALF_H, state.capsuleX[c]!, state.capsuleY[c]!, CAPSULE_H, CAPSULE_H)) continue;
    state.capsuleActive[c] = 0;
    state.capsules++;
    unlockNext(state);
  }
  while (state.score >= state.nextExtraLife) {
    if (state.lives < MAX_LIVES) state.lives++;
    state.nextExtraLife += EXTRA_LIFE_POINTS;
    state.extraLifeTick = t;
  }
  let hit = false;
  if (t >= state.flyInUntil && t >= state.bounceUntil && shipCollides(level, t, x, y)) {
    if (shieldTakes(state, t, SHIELD_WALL_COST)) {
      state.bounceUntil = t + BOUNCE_TICKS;
      state.bounceDir = caveCentre(level, barAt(level, level.scroll[t]! + x)) < y ? -1 : 1;
    } else hit = true;
  }
  if (t >= state.safeUntil) {
    for (let i = state.firstLive; i < state.nextSpawn && !hit; i++) {
      if (state.enemyStatus[i] !== EnemyStatus.alive) continue;
      const k = e.kind[i]!;
      if (overlaps(x, y, HALF_W, HALF_H, state.enemyX[i]!, state.enemyY[i]!, ENEMY_HW[k]!, ENEMY_HH[k]!)) {
        endEnemy(state, i, t, EnemyStatus.destroyed);
        spoilFormation(level, state, i);
        state.kills++;
        if (!shieldTakes(state, t, SHIELD_RAM_COST)) hit = true;
      }
    }
    for (let b = 0; b < BULLET_SLOTS && !hit; b++) {
      if (!state.bulletActive[b]) continue;
      if (overlaps(x, y, HALF_W, HALF_H, state.bulletX[b]!, state.bulletY[b]!, BULLET_H, BULLET_H)) {
        removeBullet(state, b);
        if (!shieldTakes(state, t, SHIELD_BULLET_COST[state.bulletKind[b]!]!)) hit = true;
      }
    }
  }
  if (hit) loseLife(level, state, t);
  state.prevInput = input;
  if (state.tick >= level.tickCount && !state.dead) {
    state.finished = true;
    state.survivalBonus = state.lives * SURVIVAL_POINTS_PER_LIFE;
    state.score += state.survivalBonus;
  }
}

/**
 * Runs `inputs` (one set of InputBit flags per tick) from the start of the song until the log
 * ends, the last life is lost, or the song ends, and returns the final state.
 */
export function runInputLog(level: Level, inputs: Uint16Array, state: SimState = createSimState()): SimState {
  for (let i = 0; i < inputs.length && !state.dead && !state.finished; i++) tick(level, state, inputs[i]!);
  return state;
}

/**
 * A deterministic byte form of the state, for golden hashes: 33 little-endian i32s (tick,
 * shipX, shipY, dead, deathTick, lives, nextExtraLife, extraLifeTick, finished, safeUntil,
 * flyInUntil, cheats, hitTick, kills, score, streak, onBeatKills, survivalBonus, nukes,
 * nukeCharge, blastTick, meter, capsules, boostLevel, boostFuel, double, laser, missile,
 * drones, shield, shieldHitTick, bounceUntil, bounceDir), then each enemy's status byte.
 */
export function serializeSimState(state: SimState): Uint8Array {
  const out = new Uint8Array(132 + state.enemyStatus.length);
  const view = new DataView(out.buffer);
  const fields = [
    state.tick,
    state.shipX,
    state.shipY,
    state.dead ? 1 : 0,
    state.deathTick,
    state.lives,
    state.nextExtraLife,
    state.extraLifeTick,
    state.finished ? 1 : 0,
    state.safeUntil,
    state.flyInUntil,
    state.cheats,
    state.hitTick,
    state.kills,
    state.score,
    state.streak,
    state.onBeatKills,
    state.survivalBonus,
    state.nukes,
    state.nukeCharge,
    state.blastTick,
    state.meter,
    state.capsules,
    state.boostLevel,
    state.boostFuel,
    state.double ? 1 : 0,
    state.laser ? 1 : 0,
    state.missile ? 1 : 0,
    state.drones,
    state.shield,
    state.shieldHitTick,
    state.bounceUntil,
    state.bounceDir,
  ];
  for (let i = 0; i < fields.length; i++) view.setInt32(i * 4, fields[i]!, true);
  out.set(state.enemyStatus, 132);
  return out;
}
