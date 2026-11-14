// Gamepads through the Gamepad API (https://w3c.github.io/gamepad/), read once a frame:
// navigator.getGamepads() returns a snapshot, not live objects. Each pad is read through its
// layout (bindings.ts): pads with the "standard" mapping share one, which the spec's
// numbering makes safe to default; any other pad has its own, empty until its inputs are
// set on the Keys screen, since its numbers are the device's own ("Devices that are not
// recognized should still be exposed in their raw form", the spec's Remapping section).
//
// Standard mapping, from the spec's table: buttons 0 to 3 are the bottom, right, left and
// top of the right cluster (A, B, X, Y on an Xbox pad), 4 and 5 the top front buttons, 6
// and 7 the bottom front (the triggers), 8 and 9 the left and right of the centre cluster
// (Select or Back, and Start), 12 to 15 the D-pad's up, down, left and right. Axes 0 and 1
// are the left stick, negative left and up.
//
// Hat switches: the spec doesn't cover them. Some browsers report an eight-way hat as one
// axis, -1 at up and 2/7 more for each 45 degrees clockwise, reading above 1 when centred
// (https://3960.org/sandbox/gamepad-test.html; unverified on a real pad here). An axis that
// rests above 1 when an input is being set is taken as a hat.

import { InputBit } from '@game/core';
import { PAD_ACTIONS, STANDARD_PROFILE, padLayout, type Bindings, type PadAction, type PadBindings } from './bindings.ts';
import type { MenuAction } from './input.ts';
import { radialLean, type Lean } from './lean.ts';

/** What a pad is pressing, as bits. Directions and fire share InputBit's values. */
export const PadBit = {
  up: InputBit.up,
  down: InputBit.down,
  left: InputBit.left,
  right: InputBit.right,
  fire: InputBit.fire,
  /** Fire's inputs also confirm in menus. Menu-only bits sit above the sim's 16. */
  a: 1 << 16,
  /** Bomb's inputs also back out of menus. */
  b: 1 << 17,
  /** Cancel (Select): back in menus, quit from pause. */
  select: 1 << 18,
  /** Pause (Start): pauses, and confirms in menus. */
  start: 1 << 19,
  /** Replay (Y): watches the replay on the end screens. */
  y: 1 << 20,
  /** Nuke's inputs (X) also save the replay on the end screens. */
  x: 1 << 21,
} as const;

/** The bits each pad action sets. */
export const PAD_ACTION_BITS: Record<PadAction, number> = {
  up: PadBit.up,
  down: PadBit.down,
  left: PadBit.left,
  right: PadBit.right,
  fire: InputBit.fire | PadBit.a,
  bomb: InputBit.bomb | PadBit.b,
  missile: InputBit.missile,
  nuke: InputBit.nuke | PadBit.x,
  boost: InputBit.boost,
  pause: PadBit.start,
  cancel: PadBit.select,
  replay: PadBit.y,
};

/** How far the stick must lean on an axis to count as that direction. */
export const STICK_THRESHOLD = 0.5;
/** A hat axis's step between neighbouring positions, and the eight steps around. */
const HAT_STEP = 2 / 7;
const HAT_TURN = 8 * HAT_STEP;
/** Axis values beyond this are out of the spec's range: a hat at rest. */
const IN_RANGE = 1.05;

/** The parts of a Gamepad that padBits reads. */
export interface PadSnapshot {
  readonly mapping: string;
  readonly buttons: ReadonlyArray<{ readonly pressed: boolean }>;
  readonly axes: readonly number[];
}

/** The layout a pad uses: `standard`, or `id:` and its id. */
export function padProfile(pad: { readonly mapping: string; readonly id: string }): string {
  return pad.mapping === 'standard' ? STANDARD_PROFILE : `id:${pad.id}`;
}

/**
 * Whether one input (bindings.ts) is held. A hat position also counts when the hat is on a
 * diagonal next to it, so up-right is both up and right.
 */
export function inputHeld(pad: PadSnapshot, input: string): boolean {
  const kind = input[0];
  if (kind === 'b') return pad.buttons[Number(input.slice(1))]?.pressed === true;
  if (kind === 'a') {
    const v = pad.axes[Number(input.slice(1, -1))] ?? 0;
    if (Math.abs(v) > IN_RANGE) return false;
    return input.endsWith('-') ? v <= -STICK_THRESHOLD : v >= STICK_THRESHOLD;
  }
  if (kind === 'h') {
    const at = input.indexOf('@');
    const v = pad.axes[Number(input.slice(1, at))] ?? 2;
    if (Math.abs(v) > IN_RANGE) return false;
    const d = Math.abs(v - Number(input.slice(at + 1))) % HAT_TURN;
    return Math.min(d, HAT_TURN - d) <= HAT_STEP * 1.1;
  }
  return false;
}

/**
 * The stick's dead zone, as a share of full travel: XInput's
 * XINPUT_GAMEPAD_LEFT_THUMB_DEADZONE, 7849 of 32767 (Microsoft Learn, "Getting Started
 * With XInput", Dead Zone), which is round and measures the lean from its edge.
 */
export const PAD_DEAD_ZONE = 7849 / 32767;

const LEAN_DIRECTIONS = ['left', 'right', 'up', 'down'] as const;

/**
 * How far one pad steers, through `layout`, added to `out`: its axes for up, down, left
 * and right through a round dead zone (PAD_DEAD_ZONE), so the ship goes as fast as the
 * stick is pushed (Brad, 2026-11-12). A button or hat held for a direction is a full lean
 * on its axis.
 */
export function addPadLean(pad: PadSnapshot, layout: Readonly<PadBindings>, out: Lean, scratch: Lean = { x: 0, y: 0 }): void {
  const analog = { left: 0, right: 0, up: 0, down: 0 };
  const digital = { left: false, right: false, up: false, down: false };
  for (const dir of LEAN_DIRECTIONS) {
    for (const input of layout[dir]) {
      if (input === null) continue;
      if (input[0] === 'a') {
        const v = pad.axes[Number(input.slice(1, -1))] ?? 0;
        if (Math.abs(v) > IN_RANGE) continue;
        analog[dir] = Math.max(analog[dir], input.endsWith('-') ? -v : v);
      } else if (inputHeld(pad, input)) {
        digital[dir] = true;
      }
    }
  }
  const lean = radialLean(analog.right - analog.left, analog.down - analog.up, PAD_DEAD_ZONE, scratch);
  out.x += digital.left || digital.right ? Number(digital.right) - Number(digital.left) : lean.x;
  out.y += digital.up || digital.down ? Number(digital.down) - Number(digital.up) : lean.y;
}

/** How far the connected pads steer together, into `out`. */
export function readGamepadLean(pads: readonly Gamepad[], bindings: Bindings, out: Lean): Lean {
  out.x = out.y = 0;
  for (const pad of pads) addPadLean(pad, padLayout(bindings, padProfile(pad)), out);
  return out;
}

/** The PadBits one pad is pressing, through `layout`. */
export function padBits(pad: PadSnapshot, layout: Readonly<PadBindings>): number {
  let bits = 0;
  for (const action of PAD_ACTIONS) {
    for (const input of layout[action]) {
      if (input !== null && inputHeld(pad, input)) {
        bits |= PAD_ACTION_BITS[action];
        break;
      }
    }
  }
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
const ORDER = [PadBit.up, PadBit.down, PadBit.left, PadBit.right, PadBit.a, PadBit.b, PadBit.select, PadBit.start, PadBit.y, PadBit.x];

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

/** The connected pads, or none where the API is missing or blocked. */
export function connectedPads(): Gamepad[] {
  if (typeof navigator.getGamepads !== 'function') return [];
  try {
    return navigator.getGamepads().filter((pad): pad is Gamepad => pad?.connected === true);
  } catch {
    // A permissions policy that blocks "gamepad" makes getGamepads() throw.
    return [];
  }
}

/** The PadBits of every connected pad through its layout, OR'd together. */
export function readGamepads(pads: readonly Gamepad[], bindings: Bindings): number {
  let bits = 0;
  for (const pad of pads) bits |= padBits(pad, padLayout(bindings, padProfile(pad)));
  return bits;
}

/** A pad's held buttons and axes, to compare with the next frame. */
interface RawState {
  buttons: boolean[];
  axes: number[];
}

function rawState(pad: PadSnapshot): RawState {
  return { buttons: pad.buttons.map((b) => b.pressed), axes: [...pad.axes] };
}

/** An axis has moved from `from` to `to`: leaning past the threshold, or to a hat position. */
function axisMoved(from: number, to: number): boolean {
  if (Math.abs(to) > IN_RANGE) return false;
  if (Math.abs(from) > IN_RANGE) return true;
  return Math.abs(to) >= STICK_THRESHOLD && Math.abs(from) < STICK_THRESHOLD;
}

/**
 * Watches every pad's raw inputs, whatever its layout, for the one used last: the Keys
 * screen shows that pad's layout, even for a pad with nothing set yet.
 */
export class PadWatcher {
  readonly #last = new Map<number, RawState>();

  /** The last pad with a newly pressed button or newly moved axis this frame, or null. */
  update(pads: readonly (PadSnapshot & { readonly index: number })[]): number | null {
    let active: number | null = null;
    for (const pad of pads) {
      const prev = this.#last.get(pad.index);
      const now = rawState(pad);
      this.#last.set(pad.index, now);
      if (!prev) continue;
      const pressed = now.buttons.some((b, i) => b && !prev.buttons[i]);
      const moved = now.axes.some((v, i) => axisMoved(prev.axes[i] ?? 0, v));
      if (pressed || moved) active = pad.index;
    }
    return active;
  }
}

/**
 * Waits for one new input on a pad, for the Keys screen: a button pressed that wasn't held
 * at the start, or an axis moved from where it was. An axis resting out of range is a hat
 * and records its position; any other gives the direction it leans.
 */
export class PadCapture {
  #base: RawState;

  constructor(pad: PadSnapshot) {
    this.#base = rawState(pad);
  }

  /** The new input, or null. A button held from the start counts once it is let go and pressed again. */
  check(pad: PadSnapshot): string | null {
    const now = rawState(pad);
    for (let i = 0; i < now.buttons.length; i++) {
      if (now.buttons[i] && !this.#base.buttons[i]) return `b${i}`;
      if (!now.buttons[i]) this.#base.buttons[i] = false;
    }
    for (let i = 0; i < now.axes.length; i++) {
      const from = this.#base.axes[i] ?? 0;
      const v = now.axes[i]!;
      if (Math.abs(from) > IN_RANGE) {
        if (Math.abs(v) <= IN_RANGE) {
          // Snap to the nearest of the hat's eight positions.
          const step = Math.round((v + 1) / HAT_STEP);
          return `h${i}@${(step * HAT_STEP - 1).toFixed(3)}`;
        }
      } else if (Math.abs(v) >= STICK_THRESHOLD && Math.abs(v - from) >= STICK_THRESHOLD && Math.abs(v) <= IN_RANGE) {
        return `a${i}${v < 0 ? '-' : '+'}`;
      } else if (Math.abs(v) < STICK_THRESHOLD) {
        this.#base.axes[i] = v;
      }
    }
    return null;
  }
}
