// Keyboard to sim input bits, and to menu actions, through the player's key bindings
// (bindings.ts). By default two layouts work at once: arrows with Z, X, C, V and Shift, or
// WASD with J, K, L, ; and ' (quote), with Space firing and Esc pausing in both. A
// gamepad's bits (gamepad.ts) join in through setPad(). The sampler is read once per sim
// tick; a key pressed and released between two reads still counts for one tick, so a quick
// tap is never lost.

import { InputBit } from '@game/core';
import { DEFAULT_KEYS, KEY_ACTIONS, type KeyAction, type KeyBindings } from './bindings.ts';

/** The sim bit each action sets; Pause sets none. */
export const ACTION_SIM_BITS: Record<KeyAction, number> = {
  up: InputBit.up,
  down: InputBit.down,
  left: InputBit.left,
  right: InputBit.right,
  fire: InputBit.fire,
  bomb: InputBit.bomb,
  missile: InputBit.missile,
  nuke: InputBit.nuke,
  boost: InputBit.boost,
  pause: 0,
};

/**
 * What a menu does with one press. Menus take actions, not keys, so a gamepad's D-pad,
 * A, B and Start map to the same actions as the keyboard (gamepad.ts).
 */
export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';

/** Each key's action, from one set of key bindings. */
export class KeyMap {
  readonly #actions = new Map<string, KeyAction>();

  constructor(keys: Readonly<KeyBindings> = DEFAULT_KEYS) {
    for (const action of KEY_ACTIONS) for (const code of keys[action]) if (code !== null) this.#actions.set(code, action);
  }

  /** The action a key (KeyboardEvent.code) does, or null. */
  action(code: string): KeyAction | null {
    return this.#actions.get(code) ?? null;
  }

  /** The InputBit a key controls, or 0. */
  bit(code: string): number {
    const action = this.action(code);
    return action ? ACTION_SIM_BITS[action] : 0;
  }

  /**
   * The MenuAction a key gives, or null. Menus follow the bindings, as on a pad: the
   * directions move, Fire confirms, Bomb and Pause back out. Enter always confirms, and
   * Esc and Backspace always back out.
   */
  menuAction(code: string): MenuAction | null {
    const action = this.action(code);
    switch (action) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        return action;
      case 'fire':
        return 'confirm';
      case 'bomb':
      case 'pause':
        return 'back';
      default:
        break;
    }
    switch (code) {
      case 'Enter':
      case 'NumpadEnter':
        return 'confirm';
      case 'Escape':
      case 'Backspace':
        return 'back';
      default:
        return null;
    }
  }
}

export class InputSampler {
  keys = new KeyMap();
  /** Bits of the keys held now. Two keys can share a bit (ArrowUp and KeyW). */
  #held = new Map<string, number>();
  #heldBits = 0;
  /** Bits pressed since the last sample, held or not. */
  #latched = 0;
  /** Sim bits the gamepads hold, from the last setPad(). */
  #padBits = 0;
  /** The sticks' lean on x and y, from the last setLean(), and each axis's running total. */
  #lean = [0, 0];
  #sign = [0, 0];
  #total = [0, 0];

  keyDown(code: string): void {
    const bit = this.keys.bit(code);
    if (bit === 0) return;
    this.#held.set(code, bit);
    this.#recompute();
    this.#latched |= bit;
  }

  keyUp(code: string): void {
    if (!this.#held.delete(code)) return;
    this.#recompute();
  }

  /**
   * The gamepads' bits, read once a frame (readGamepads()); only the sim's low 16 bits are
   * kept. A bit that goes down latches like a key, so a press between two ticks still counts.
   */
  setPad(bits: number): void {
    const sim = bits & 0xffff;
    this.#latched |= sim & ~this.#padBits;
    this.#padBits = sim;
  }

  /**
   * The touch stick's and gamepads' lean, -1 to 1 on each axis (y down), read once a frame.
   * The sim only knows a direction held or not, at one speed, so a lean of a quarter holds
   * the direction on one tick in four (sample()): the ship goes as fast as the stick is
   * pushed (Brad, 2026-11-12). The input log records the bits, so replays don't change.
   */
  setLean(x: number, y: number): void {
    this.#lean[0] = Math.max(-1, Math.min(1, x));
    this.#lean[1] = Math.max(-1, Math.min(1, y));
  }

  /** Forgets every key, for when the window loses focus and key-up events go elsewhere. */
  clear(): void {
    this.#held.clear();
    this.#heldBits = 0;
    this.#latched = 0;
    this.#lean[0] = this.#lean[1] = 0;
  }

  /** The input byte for the next tick: keys and buttons held now, plus those tapped since the last sample. */
  sample(): number {
    const bits = this.#heldBits | this.#padBits | this.#latched | this.#axis(0, InputBit.left, InputBit.right) | this.#axis(1, InputBit.up, InputBit.down);
    this.#latched = 0;
    return bits;
  }

  /**
   * One axis's bit for this tick: its lean adds to a running total, and each whole one is a
   * tick held. A new push, or one the other way, starts the total a lean short of 1, so it
   * moves at once.
   */
  #axis(axis: number, minus: number, plus: number): number {
    const lean = this.#lean[axis]!;
    const sign = Math.sign(lean);
    if (sign !== this.#sign[axis]) {
      this.#sign[axis] = sign;
      this.#total[axis] = 1 - Math.abs(lean);
    }
    if (sign === 0) return 0;
    const total = this.#total[axis]! + Math.abs(lean);
    if (total < 1) {
      this.#total[axis] = total;
      return 0;
    }
    this.#total[axis] = total - 1;
    return sign < 0 ? minus : plus;
  }

  #recompute(): void {
    let bits = 0;
    for (const bit of this.#held.values()) bits |= bit;
    this.#heldBits = bits;
  }
}
