// Gamepads through the Gamepad API (https://w3c.github.io/gamepad/), read once a frame:
// navigator.getGamepads() returns a snapshot, not live objects. Only pads that report the
// "standard" mapping are read, since the spec fixes their button and axis numbers; other
// pads report their own layouts.
//
// Standard mapping, from the spec's table: buttons 0 to 3 are the bottom, right, left and
// top of the right cluster (A, B, X, Y on an Xbox pad), 4 and 5 the top front buttons, 6
// and 7 the bottom front (the triggers), 8 and 9 the left and right of the centre cluster
// (Select or Back, and Start), 12 to 15 the D-pad's up, down, left and right. Axes 0 and 1
// are the left stick, negative left and up.

import { InputBit } from '@game/core';
import type { MenuAction } from './input.ts';

/** What a pad is pressing, as bits. Directions and fire share InputBit's values. */
export const PadBit = {
  up: InputBit.up,
  down: InputBit.down,
  left: InputBit.left,
  right: InputBit.right,
  fire: InputBit.fire,
  /** A: fire in play, confirm in menus. */
  a: 1 << 8,
  /** B: back in menus. Kept free in play for the bomb. */
  b: 1 << 9,
  select: 1 << 10,
  start: 1 << 11,
} as const;

/** How far the stick must lean on an axis to count as that direction. */
export const STICK_THRESHOLD = 0.5;
const FIRE_BUTTONS = [0, 2, 5, 7];
const DPAD: ReadonlyArray<[number, number]> = [
  [12, PadBit.up],
  [13, PadBit.down],
  [14, PadBit.left],
  [15, PadBit.right],
];

/** The parts of a Gamepad that padBits reads. */
export interface PadSnapshot {
  readonly mapping: string;
  readonly buttons: ReadonlyArray<{ readonly pressed: boolean }>;
  readonly axes: readonly number[];
}

/** The PadBits one pad is pressing; 0 for a pad without the standard mapping. */
export function padBits(pad: PadSnapshot): number {
  if (pad.mapping !== 'standard') return 0;
  const down = (i: number): boolean => pad.buttons[i]?.pressed === true;
  let bits = 0;
  for (const [button, bit] of DPAD) if (down(button)) bits |= bit;
  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;
  if (x <= -STICK_THRESHOLD) bits |= PadBit.left;
  if (x >= STICK_THRESHOLD) bits |= PadBit.right;
  if (y <= -STICK_THRESHOLD) bits |= PadBit.up;
  if (y >= STICK_THRESHOLD) bits |= PadBit.down;
  for (const button of FIRE_BUTTONS) if (down(button)) bits |= PadBit.fire;
  if (down(0)) bits |= PadBit.a;
  if (down(1)) bits |= PadBit.b;
  if (down(8)) bits |= PadBit.select;
  if (down(9)) bits |= PadBit.start;
  return bits;
}

/** The menu action for a newly pressed PadBit, or null. */
export function padMenuAction(bit: number): MenuAction | null {
  switch (bit) {
    case PadBit.up:
      return 'up';
    case PadBit.down:
      return 'down';
    case PadBit.left:
      return 'left';
    case PadBit.right:
      return 'right';
    case PadBit.a:
    case PadBit.start:
      return 'confirm';
    case PadBit.b:
    case PadBit.select:
      return 'back';
    default:
      return null;
  }
}

/** A held direction repeats after this long, then at this interval, like a held key. */
export const REPEAT_DELAY_MS = 400;
export const REPEAT_INTERVAL_MS = 100;
const DIRECTIONS = PadBit.up | PadBit.down | PadBit.left | PadBit.right;
/** Bits in the order presses are reported. */
const ORDER = [PadBit.up, PadBit.down, PadBit.left, PadBit.right, PadBit.a, PadBit.b, PadBit.select, PadBit.start];

/**
 * Turns per-frame pad bits into presses: each bit that went down since the last update,
 * plus repeats for a held direction. Kept apart from the browser so tests can drive it.
 */
export class PadTracker {
  #held = 0;
  #repeatBit = 0;
  #nextRepeat = 0;

  /** The bits held at the last update. */
  get held(): number {
    return this.#held;
  }

  /** Records `bits` at time `now` (ms) and returns the presses, in a fixed order. */
  update(bits: number, now: number): number[] {
    const pressed = bits & ~this.#held;
    this.#held = bits;
    const out: number[] = [];
    for (const bit of ORDER) if (pressed & bit) out.push(bit);
    // The newest direction repeats while it stays held.
    const newDirection = out.find((bit) => (bit & DIRECTIONS) !== 0);
    if (newDirection !== undefined) {
      this.#repeatBit = newDirection;
      this.#nextRepeat = now + REPEAT_DELAY_MS;
    } else if (this.#repeatBit !== 0 && (bits & this.#repeatBit) === 0) {
      this.#repeatBit = 0;
    } else if (this.#repeatBit !== 0 && now >= this.#nextRepeat) {
      out.push(this.#repeatBit);
      this.#nextRepeat = now + REPEAT_INTERVAL_MS;
    }
    return out;
  }

  /** Forgets what was held, so a held button counts as a new press. */
  reset(): void {
    this.#held = 0;
    this.#repeatBit = 0;
  }
}

/** The PadBits of every connected standard pad, OR'd together. 0 where the API is missing. */
export function readGamepads(): number {
  if (typeof navigator.getGamepads !== 'function') return 0;
  let pads: ReadonlyArray<Gamepad | null>;
  try {
    pads = navigator.getGamepads();
  } catch {
    // A permissions policy that blocks "gamepad" makes getGamepads() throw.
    return 0;
  }
  let bits = 0;
  for (const pad of pads) if (pad?.connected) bits |= padBits(pad);
  return bits;
}
