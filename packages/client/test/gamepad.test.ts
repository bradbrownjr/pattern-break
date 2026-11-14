import { InputBit } from '@game/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PAD, assign, emptyPad } from '../src/game/bindings.ts';
import {
  PAD_DEAD_ZONE,
  PadBit,
  PadCapture,
  addPadLean,
  PadTracker,
  PadWatcher,
  REPEAT_DELAY_MS,
  REPEAT_INTERVAL_MS,
  inputHeld,
  padBits as layoutBits,
  padMenuAction,
  padProfile,
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

/** A pad's bits through the standard layout. */
const padBits = (p: PadSnapshot): number => layoutBits(p, DEFAULT_PAD);

describe('padBits with the standard layout', () => {
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

  it('fires on A and RT, bombs on B, nukes on X, missiles on RB, boosts on LB or LT; Fire also confirms; Nuke also saves; Y is for menus', () => {
    expect(padBits(pad([0]))).toBe(PadBit.fire | PadBit.a);
    expect(padBits(pad([7]))).toBe(PadBit.fire | PadBit.a);
    expect(padBits(pad([1]))).toBe(PadBit.b | InputBit.bomb);
    expect(padBits(pad([2]))).toBe(InputBit.nuke | PadBit.x);
    expect(padBits(pad([3]))).toBe(PadBit.y);
    expect(padBits(pad([5]))).toBe(InputBit.missile);
    expect([4, 6].map((b) => padBits(pad([b])))).toEqual([InputBit.boost, InputBit.boost]);
    expect(padBits(pad([8, 9]))).toBe(PadBit.select | PadBit.start);
  });

  it('shares the sim bits with InputBit', () => {
    expect([PadBit.up, PadBit.down, PadBit.left, PadBit.right, PadBit.fire]).toEqual([
      InputBit.up,
      InputBit.down,
      InputBit.left,
      InputBit.right,
      InputBit.fire,
    ]);
  });
});

describe('pad layouts', () => {
  it('gives a pad without the standard mapping its own layout, empty until set', () => {
    expect(padProfile({ mapping: 'standard', id: 'x' })).toBe('standard');
    expect(padProfile({ mapping: '', id: 'Arcade stick' })).toBe('id:Arcade stick');
    expect(layoutBits(pad([0, 12], [-1, 0], ''), emptyPad())).toBe(0);
  });

  it('reads a remapped layout', () => {
    const layout = assign(assign(emptyPad(), 'fire', 0, 'b4'), 'up', 0, 'a7-');
    expect(layoutBits(pad([4], [0, 0, 0, 0, 0, 0, 0, -1], ''), layout)).toBe(PadBit.fire | PadBit.a | PadBit.up);
    expect(layoutBits(pad([0], [0, 0, 0, 0, 0, 0, 0, 1], ''), layout)).toBe(0);
  });

  it('reads a hat position, and the diagonals either side of it', () => {
    const at = (v: number): PadSnapshot => pad([], [0, 0, 0, 0, 0, 0, 0, 0, 0, v], '');
    const up = 'h9@-1.000';
    expect(inputHeld(at(-1), up)).toBe(true);
    // Up-right (-1 + 2/7) and up-left (+1, the step before -1 around the circle).
    expect(inputHeld(at(-1 + 2 / 7), up)).toBe(true);
    expect(inputHeld(at(1), up)).toBe(true);
    // Right, and the hat at rest above 1.
    expect(inputHeld(at(-1 + 4 / 7), up)).toBe(false);
    expect(inputHeld(at(9 / 7), up)).toBe(false);
  });

  it('never reads a hat at rest as an axis leaning positive', () => {
    expect(inputHeld(pad([], [9 / 7], ''), 'a0+')).toBe(false);
  });
});

describe('PadCapture', () => {
  it('takes the first button pressed after it starts, not one already held', () => {
    const c = new PadCapture(pad([0]));
    expect(c.check(pad([0]))).toBeNull();
    expect(c.check(pad([0, 5]))).toBe('b5');
  });

  it('takes a held button once it is let go and pressed again', () => {
    const c = new PadCapture(pad([0]));
    expect(c.check(pad([]))).toBeNull();
    expect(c.check(pad([0]))).toBe('b0');
  });

  it('takes an axis leaning past the threshold, with its direction', () => {
    const c = new PadCapture(pad([], [0, 0.1]));
    expect(c.check(pad([], [0, 0.4]))).toBeNull();
    expect(c.check(pad([], [0, -0.8]))).toBe('a1-');
  });

  it('ignores an axis resting off centre, such as a trigger at -1', () => {
    const c = new PadCapture(pad([], [0, 0, -1]));
    expect(c.check(pad([], [0, 0, -1]))).toBeNull();
    expect(c.check(pad([], [0, 0, 1]))).toBe('a2+');
  });

  it('takes an axis resting out of range as a hat, at the nearest of its eight positions', () => {
    const c = new PadCapture(pad([], [9 / 7]));
    expect(c.check(pad([], [-0.43]))).toBe('h0@-0.429');
  });
});

describe('PadWatcher', () => {
  it('reports the pad with a new press or a newly moved axis', () => {
    const w = new PadWatcher();
    const a = { ...pad([]), index: 0 };
    const b = { ...pad([], [0, 0], ''), index: 1 };
    expect(w.update([a, b])).toBeNull();
    expect(w.update([a, { ...pad([3], [0, 0], ''), index: 1 }])).toBe(1);
    expect(w.update([{ ...pad([], [0.9, 0]), index: 0 }, { ...pad([3], [0, 0], ''), index: 1 }])).toBe(0);
    expect(w.update([{ ...pad([], [0.9, 0]), index: 0 }, { ...pad([3], [0, 0], ''), index: 1 }])).toBeNull();
  });
});

describe('padMenuAction', () => {
  it('maps directions, A (Fire) and Start to confirm, B (Bomb) and Select to back', () => {
    expect([PadBit.up, PadBit.down, PadBit.left, PadBit.right].map(padMenuAction)).toEqual(['up', 'down', 'left', 'right']);
    expect([PadBit.a, PadBit.start].map(padMenuAction)).toEqual(['confirm', 'confirm']);
    expect([PadBit.b, PadBit.select].map(padMenuAction)).toEqual(['back', 'back']);
    expect(padMenuAction(PadBit.fire)).toBeNull();
  });
});

describe('PadTracker', () => {
  it('reports Y and X, to watch and save the replay on the end screens', () => {
    expect(new PadTracker().update(PadBit.y, 0)).toEqual([PadBit.y]);
    expect(new PadTracker().update(PadBit.x | InputBit.nuke, 0)).toEqual([PadBit.x]);
  });

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

describe('addPadLean', () => {
  const lean = (p: PadSnapshot) => {
    const out = { x: 0, y: 0 };
    addPadLean(p, DEFAULT_PAD, out);
    return out;
  };

  it('is nothing in the round dead zone, then rises from its edge to a full push', () => {
    expect(lean(pad([], [0.2, 0.1]))).toEqual({ x: 0, y: 0 });
    expect(lean(pad([], [PAD_DEAD_ZONE, 0])).x).toBe(0);
    expect(lean(pad([], [1, 0])).x).toBeCloseTo(1);
    expect(lean(pad([], [-1, 0])).x).toBeCloseTo(-1);
    // Halfway between the dead zone's edge and full travel is half speed.
    expect(lean(pad([], [0, -(PAD_DEAD_ZONE + 1) / 2])).y).toBeCloseTo(-0.5);
    // A diagonal keeps its direction.
    const d = lean(pad([], [0.7, 0.7]));
    expect(d.x).toBeCloseTo(d.y);
  });

  it('takes the D-pad as a full push on its axis', () => {
    expect(lean(pad([15]))).toEqual({ x: 1, y: 0 });
    expect(lean(pad([12, 14], [0, 0.6]))).toEqual({ x: -1, y: -1 });
  });
});
