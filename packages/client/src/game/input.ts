// Keyboard to sim input bits, and to menu actions. Arrows and WASD move. The sampler is
// read once per sim tick; a key pressed and released between two reads still counts for one
// tick, so a quick tap is never lost.

import { InputBit } from '@game/core';

/** The InputBit a key (KeyboardEvent.code) controls, or 0. */
export function keyToBit(code: string): number {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      return InputBit.up;
    case 'ArrowDown':
    case 'KeyS':
      return InputBit.down;
    case 'ArrowLeft':
    case 'KeyA':
      return InputBit.left;
    case 'ArrowRight':
    case 'KeyD':
      return InputBit.right;
    default:
      return 0;
  }
}

/**
 * What a menu does with one press. Menus take actions, not keys, so a gamepad's D-pad,
 * A, B and Start (M2) can map to the same actions as the keyboard.
 */
export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';

/** The MenuAction a key (KeyboardEvent.code) gives, or null. */
export function keyToMenuAction(code: string): MenuAction | null {
  switch (keyToBit(code)) {
    case InputBit.up:
      return 'up';
    case InputBit.down:
      return 'down';
    case InputBit.left:
      return 'left';
    case InputBit.right:
      return 'right';
  }
  switch (code) {
    case 'Enter':
    case 'NumpadEnter':
    case 'Space':
      return 'confirm';
    case 'Escape':
    case 'Backspace':
      return 'back';
    default:
      return null;
  }
}

export class InputSampler {
  /** Bits of the keys held now. Two keys can share a bit (ArrowUp and KeyW). */
  #held = new Map<string, number>();
  #heldBits = 0;
  /** Bits pressed since the last sample, held or not. */
  #latched = 0;

  keyDown(code: string): void {
    const bit = keyToBit(code);
    if (bit === 0) return;
    this.#held.set(code, bit);
    this.#recompute();
    this.#latched |= bit;
  }

  keyUp(code: string): void {
    if (!this.#held.delete(code)) return;
    this.#recompute();
  }

  /** Forgets every key, for when the window loses focus and key-up events go elsewhere. */
  clear(): void {
    this.#held.clear();
    this.#heldBits = 0;
    this.#latched = 0;
  }

  /** The input byte for the next tick: keys held now, plus keys tapped since the last sample. */
  sample(): number {
    const bits = this.#heldBits | this.#latched;
    this.#latched = 0;
    return bits;
  }

  #recompute(): void {
    let bits = 0;
    for (const bit of this.#held.values()) bits |= bit;
    this.#heldBits = bits;
  }
}
