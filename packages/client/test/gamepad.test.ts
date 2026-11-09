import { InputBit } from '@game/core';
import { describe, expect, it } from 'vitest';
import {
  PadBit,
  PadTracker,
  REPEAT_DELAY_MS,
  REPEAT_INTERVAL_MS,
  padBits,
  padMenuAction,
  type PadSnapshot,
} from '../src/game/gamepad.ts';
import { InputSampler } from '../src/game/input.ts';

/** A standard pad with these buttons held and these axes. */
function pad(buttons: number[], axes: number[] = [0, 0, 0, 0], mapping = 'standard'): PadSnapshot {
  return {
    mapping,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i) })),
    axes,
  };
}

describe('padBits', () => {
  it('reads the D-pad and the left stick as directions', () => {
    expect(padBits(pad([12]))).toBe(PadBit.up);
    expect(padBits(pad([13]))).toBe(PadBit.down);
    expect(padBits(pad([14]))).toBe(PadBit.left);
    expect(padBits(pad([15]))).toBe(PadBit.right);
    // The spec's axes: negative is left and up.
    expect(padBits(pad([], [-1, -1]))).toBe(PadBit.left | PadBit.up);
    expect(padBits(pad([], [0.5, 0.5]))).toBe(PadBit.right | PadBit.down);
    // A stick resting slightly off centre is not a direction.
    expect(padBits(pad([], [0.49, -0.49]))).toBe(0);
  });

  it('fires on A and RT, bombs on B, nukes on X, buys on Y, missiles on RB, boosts on LB or LT; A also confirms', () => {
    expect(padBits(pad([0]))).toBe(PadBit.fire | PadBit.a);
    expect(padBits(pad([7]))).toBe(PadBit.fire);
    expect(padBits(pad([1]))).toBe(PadBit.b | InputBit.bomb);
    expect(padBits(pad([2]))).toBe(InputBit.nuke);
    expect(padBits(pad([3]))).toBe(InputBit.buy);
    expect(padBits(pad([5]))).toBe(InputBit.missile);
    expect([4, 6].map((b) => padBits(pad([b])))).toEqual([InputBit.boost, InputBit.boost]);
    expect(padBits(pad([8, 9]))).toBe(PadBit.select | PadBit.start);
  });

  it('shares the sim bits with InputBit, and ignores pads without the standard mapping', () => {
    expect([PadBit.up, PadBit.down, PadBit.left, PadBit.right, PadBit.fire]).toEqual([
      InputBit.up,
      InputBit.down,
      InputBit.left,
      InputBit.right,
      InputBit.fire,
    ]);
    expect(padBits(pad([0, 12], [-1, 0], ''))).toBe(0);
  });
});

describe('padMenuAction', () => {
  it('maps directions, A and Start to confirm, B and Select to back', () => {
    expect([PadBit.up, PadBit.down, PadBit.left, PadBit.right].map(padMenuAction)).toEqual(['up', 'down', 'left', 'right']);
    expect([PadBit.a, PadBit.start].map(padMenuAction)).toEqual(['confirm', 'confirm']);
    expect([PadBit.b, PadBit.select].map(padMenuAction)).toEqual(['back', 'back']);
    expect(padMenuAction(PadBit.fire)).toBeNull();
  });
});

describe('PadTracker', () => {
  it('reports each button once as it goes down', () => {
    const t = new PadTracker();
    expect(t.update(PadBit.a | PadBit.fire, 0)).toEqual([PadBit.a]);
    expect(t.update(PadBit.a | PadBit.fire, 16)).toEqual([]);
    expect(t.update(0, 32)).toEqual([]);
    expect(t.update(PadBit.a, 48)).toEqual([PadBit.a]);
  });

  it('repeats a held direction after a delay, then at an interval, and stops on release', () => {
    const t = new PadTracker();
    expect(t.update(PadBit.down, 0)).toEqual([PadBit.down]);
    expect(t.update(PadBit.down, REPEAT_DELAY_MS - 1)).toEqual([]);
    expect(t.update(PadBit.down, REPEAT_DELAY_MS)).toEqual([PadBit.down]);
    expect(t.update(PadBit.down, REPEAT_DELAY_MS + REPEAT_INTERVAL_MS - 1)).toEqual([]);
    expect(t.update(PadBit.down, REPEAT_DELAY_MS + REPEAT_INTERVAL_MS)).toEqual([PadBit.down]);
    expect(t.update(0, 1000)).toEqual([]);
    expect(t.update(0, 2000)).toEqual([]);
  });

  it('a newly pressed direction takes over the repeat', () => {
    const t = new PadTracker();
    t.update(PadBit.down, 0);
    expect(t.update(PadBit.down | PadBit.right, 100)).toEqual([PadBit.right]);
    expect(t.update(PadBit.down | PadBit.right, 100 + REPEAT_DELAY_MS)).toEqual([PadBit.right]);
  });
});

describe('InputSampler with a pad', () => {
  it('holds the pad bits and drops the menu-only ones', () => {
    const s = new InputSampler();
    s.setPad(PadBit.up | PadBit.fire | PadBit.a | PadBit.start);
    expect(s.sample()).toBe(InputBit.up | InputBit.fire);
    expect(s.sample()).toBe(InputBit.up | InputBit.fire);
  });

  it('a button pressed and released between two ticks still counts for one', () => {
    const s = new InputSampler();
    s.setPad(PadBit.fire);
    s.setPad(0);
    expect(s.sample()).toBe(InputBit.fire);
    expect(s.sample()).toBe(0);
  });

  it('combines with the keyboard', () => {
    const s = new InputSampler();
    s.keyDown('ArrowLeft');
    s.setPad(PadBit.fire);
    expect(s.sample()).toBe(InputBit.left | InputBit.fire);
  });
});
