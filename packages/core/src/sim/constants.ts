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

/** Input bits, one byte per tick. Only movement does anything in M1. */
export const InputBit = {
  up: 1,
  down: 2,
  left: 4,
  right: 8,
  fire: 16,
  bomb: 32,
  buy: 64,
} as const;
export type InputBit = (typeof InputBit)[keyof typeof InputBit];
