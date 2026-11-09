// Ship tuning. Speeds are Q8 (1/256 px) per tick at 120 Hz.

/** Speed along one axis when moving straight: 1.5 px per tick, 180 px per second. */
export const SHIP_SPEED_Q8 = 384;
/**
 * Per-axis speed when moving diagonally: 384 / sqrt(2) = 271.5, rounded to 272. The
 * diagonal speed is then 1.503 px per tick, about the same as straight movement.
 */
export const SHIP_DIAGONAL_SPEED_Q8 = 272;

/** The ship's horizontal range (sprite centre, screen px). */
export const SHIP_MIN_X = 16;
export const SHIP_MAX_X = 160;

/** Where the ship starts (sprite centre, screen px). */
export const SHIP_START_X = 64;
export const SHIP_START_Y = 108;

/** Hitbox size, centred on the sprite position. */
export const SHIP_HITBOX_WIDTH = 10;
export const SHIP_HITBOX_HEIGHT = 6;

/** Input bits, 16 per tick (input logs are Uint16Arrays); bits 10 to 15 are unused. */
export const InputBit = {
  up: 1,
  down: 2,
  left: 4,
  right: 8,
  fire: 16,
  bomb: 32,
  buy: 64,
  nuke: 128,
  boost: 256,
  missile: 512,
} as const;
export type InputBit = (typeof InputBit)[keyof typeof InputBit];

/** Lives at the start of a run. */
export const START_LIVES = 3;
/** After losing a life the ship is back at the playhead and can't be hit for 2 s. */
export const RESPAWN_SAFE_TICKS = 240;

/**
 * Holding fire shoots every 8 ticks (15 a second), with at most 6 shots in flight. The gun
 * is the standard weapon and sprays freely; the bomb and the missile power-up are the ones
 * with a reload (Brad, 2026-11-09; 3 for one build).
 */
export const SHOT_INTERVAL_TICKS = 8;
export const MAX_SHOTS = 6;
/** Player shots fly right at 4 px per tick. */
export const SHOT_SPEED_Q8 = 1024;
export const SHOT_WIDTH = 6;
export const SHOT_HEIGHT = 2;

/** Enemy hitboxes, centred on the enemy, in px. A turret fills one segment slot. */
export const TURRET_WIDTH = 8;
export const TURRET_HEIGHT = 6;
export const TANK_WIDTH = 12;
export const TANK_HEIGHT = 7;
export const ENEMY_SHIP_WIDTH = 10;
export const ENEMY_SHIP_HEIGHT = 8;
export const ENEMY_BULLET_SIZE = 4;

/** Hits each kind takes, indexed by EnemyKind. */
export const ENEMY_HP = [1, 3, 1] as const;

/** Tanks drive left along the floor at 0.25 px per tick, on top of the scroll. */
export const TANK_SPEED_Q8 = 64;
/** Tanks and ships appear with their centre this far right of the screen's left edge. */
export const ENEMY_ENTRY_X = 392;
/** An enemy whose centre is left of this screen x has gone. */
export const ENEMY_EXIT_X = -16;
/** Enemies fire only from this part of the screen, ahead of the ship. */
export const FIRE_MIN_X = 104;
export const FIRE_MAX_X = 376;
/** A ship waits this long after it appears before it fires. */
export const SHIP_FIRE_DELAY_TICKS = 30;
/** Ships steer towards their place in the cave at up to 1 px per tick. */
export const SHIP_STEER_Q8 = 256;
/** Weave and hop sizes (px) and periods (ticks). */
export const WEAVE_AMPLITUDE = 12;
export const WEAVE_PERIOD_TICKS = 96;
export const HOP_PX = 10;
export const HOP_TICKS = 16;
/** Climbing and diving ships drift 0.5 px per tick from their line. */
export const DRIFT_Q8 = 128;

/**
 * Points for destroying each kind with a shot, indexed by EnemyKind: turrets are harder to
 * hit than ships and easier than moving tanks (Brad, 2026-11-09). Ramming scores nothing.
 */
export const KILL_POINTS = [200, 300, 100] as const;
/**
 * A kill within 3 ticks (25 ms) of a note of the enemy's instrument is on the beat: double
 * points. At 6 ticks, busy instruments made nearly every kill count; at 3, an autopilot that
 * ignores the beat lands 10 to 65% of its kills on it.
 */
export const ON_BEAT_TICKS = 3;
/** Every 10 kills without losing a life raise the multiplier by 1, up to 4. */
export const STREAK_STEP = 10;
export const MAX_MULTIPLIER = 4;
/** Reaching the end of the song scores this much per life left. */
export const SURVIVAL_POINTS_PER_LIFE = 1000;

/**
 * The concussive bomb (Brad, 2026-11-09): each press of the bomb button drops one, if none
 * is in the air and BOMB_RELOAD_TICKS have passed since the last burst; holding does not
 * drop more. It leaves the ship's underside carrying forward 1 px per tick, falls with
 * gravity, and bursts on the terrain, on an enemy, or off screen. The blast destroys every
 * enemy within 24 px of the burst, tanks included, whatever their hits left. Never more
 * than one tank is on screen at once, so one bomb at a time is enough.
 */
export const BOMB_RELOAD_TICKS = 120;
export const BOMB_SIZE = 4;
export const BOMB_VX_Q8 = 256;
/** Added to the bomb's fall speed each tick, up to BOMB_MAX_VY_Q8 (3 px per tick). */
export const BOMB_GRAVITY_Q8 = 8;
export const BOMB_MAX_VY_Q8 = 768;
/** Half the side of the blast's square. */
export const BOMB_BLAST_PX = 24;

/**
 * The nuke (Brad, 2026-11-09): a press destroys every enemy on screen and clears the enemy
 * bullets. One charges per 10 kills on the beat, up to 3 held; a level starts with none.
 * Nuke kills score their kind's points times the multiplier, never the on-beat double.
 */
export const NUKE_CHARGE_KILLS = 10;
export const MAX_NUKES = 3;

/**
 * Power-ups (Brad, 2026-11-09). Shooting down every ship of a formation drops a capsule,
 * which drifts left along the cave. Each capsule picked up moves the meter's highlight one
 * slot, wrapping from the last to the first; the buy button buys the highlighted upgrade
 * and clears the highlight. Losing a life loses every upgrade bought; the highlight stays.
 * The meter's slots, in order:
 */
export const PowerUp = { boost: 0, double: 1, laser: 2, missile: 3, option: 4, shield: 5 } as const;
export const POWER_UP_COUNT = 6;
export const CAPSULE_SLOTS = 4;
export const CAPSULE_SIZE = 8;
/*
 * A capsule stays at its world x, so it scrolls with the cave, and falls with the bomb's
 * gravity (BOMB_GRAVITY_Q8, up to BOMB_MAX_VY_Q8) until it rests on the floor, which it
 * then rides (Brad, 2026-11-09: so collecting one means flying low).
 */

/**
 * Boost: an afterburner on its own button. The first buy unlocks it, each of up to 3 buys
 * adds 1 s of fuel. Held with fuel left, the ship moves 640 Q8 per tick (1.67 times its
 * speed); otherwise the fuel refills one tick's worth every 3 ticks.
 */
export const BOOST_MAX_LEVEL = 3;
export const BOOST_FUEL_PER_LEVEL = 120;
export const BOOST_REFILL_TICKS = 3;
export const BOOST_SPEED_Q8 = 640;
/** 640 / sqrt 2, rounded. */
export const BOOST_DIAGONAL_SPEED_Q8 = 453;

/** Double: each volley adds a shot angled 45 degrees up, 4 px per tick (1024 / sqrt 2 per axis). */
export const DOUBLE_SPEED_Q8 = 724;
/**
 * Laser: replaces the straight shot with a 16x2 px beam at 6 px per tick that goes through
 * enemies, taking a hit off each one it overlaps every tick. Double and laser replace each
 * other.
 */
export const LASER_WIDTH = 16;
export const LASER_SPEED_Q8 = 1536;

/**
 * Missile: its own button, one per press. It flies straight ahead at 3 px per tick through
 * the walls and bursts on the first enemy it touches, destroying every enemy within 20 px.
 * The next can't launch until 1 s after the last one bursts or leaves the screen.
 */
export const MISSILE_WIDTH = 8;
export const MISSILE_HEIGHT = 4;
export const MISSILE_SPEED_Q8 = 768;
export const MISSILE_BLAST_PX = 20;
export const MISSILE_RELOAD_TICKS = 120;

/**
 * Option: a drone that follows the ship's path 16 ticks behind (the second 32), can't be
 * hit, and fires the ship's shots and missiles. Up to 2.
 */
export const MAX_OPTIONS = 2;
export const OPTION_DELAY_TICKS = 16;

/** Shield: takes 3 hits from bullets or enemies. The walls still cost a life. */
export const SHIELD_HITS = 3;
