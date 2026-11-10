// The Konami code (Brad, 2026-11-10): up, up, down, down, left, right, left, right, B, A
// on the title screen, from the arrow keys and the B and A keys, or a pad's D-pad or
// stick and its B and A buttons. It turns infinite lives on or off. Holds no display
// objects, so tests run in Node.

import { PadBit } from './gamepad.ts';

export type CodeToken = 'up' | 'down' | 'left' | 'right' | 'b' | 'a';

export const KONAMI_CODE: readonly CodeToken[] = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a'];

/** The token a key gives, or null for a key that isn't part of the code. */
export function keyToken(code: string): CodeToken | null {
  switch (code) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'KeyB':
      return 'b';
    case 'KeyA':
      return 'a';
    default:
      return null;
  }
}

/** The token a new pad press gives (one PadBit), or null. */
export function padToken(bit: number): CodeToken | null {
  switch (bit) {
    case PadBit.up:
      return 'up';
    case PadBit.down:
      return 'down';
    case PadBit.left:
      return 'left';
    case PadBit.right:
      return 'right';
    case PadBit.b:
      return 'b';
    case PadBit.a:
      return 'a';
    default:
      return null;
  }
}

/** Watches presses for one code. */
export class CodeListener {
  readonly #code: readonly CodeToken[];
  /** Presses of the code matched so far. */
  #at = 0;

  constructor(code: readonly CodeToken[] = KONAMI_CODE) {
    this.#code = code;
  }

  /**
   * Takes one press (null for a key outside the code, which starts it over); true when it
   * completes the code. A wrong press keeps the longest run of recent presses that still
   * starts the code, so a third up after two still counts as the first two.
   */
  push(token: CodeToken | null): boolean {
    if (token === null) {
      this.#at = 0;
      return false;
    }
    if (this.#code[this.#at] === token) {
      this.#at++;
      if (this.#at === this.#code.length) {
        this.#at = 0;
        return true;
      }
      return false;
    }
    // The matched presses plus this one; find the longest suffix that starts the code.
    const seen = [...this.#code.slice(0, this.#at), token];
    for (let k = seen.length - 1; k > 0; k--) {
      const suffix = seen.slice(seen.length - k);
      if (suffix.every((t, i) => this.#code[i] === t)) {
        this.#at = k;
        return false;
      }
    }
    this.#at = 0;
    return false;
  }
}
