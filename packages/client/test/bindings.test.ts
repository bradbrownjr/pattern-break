import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYS,
  DEFAULT_PAD,
  KEY_ACTIONS,
  SLOTS,
  STANDARD_PROFILE,
  assign,
  defaultBindings,
  directionWithoutKey,
  isLockedSlot,
  isReservedKey,
  keyLabel,
  loadBindings,
  padInputLabel,
  padLayout,
  saveBindings,
} from '../src/game/bindings.ts';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

describe('the default bindings', () => {
  it('give every action three slots and use no key twice', () => {
    const all = KEY_ACTIONS.flatMap((a) => DEFAULT_KEYS[a]).filter((k) => k !== null);
    expect(new Set(all).size).toBe(all.length);
    for (const a of KEY_ACTIONS) expect(DEFAULT_KEYS[a]).toHaveLength(SLOTS);
  });

  it('lock Esc in Pause\'s first slot', () => {
    expect(DEFAULT_KEYS.pause[0]).toBe('Escape');
    expect(isLockedSlot('pause', 0, 'keyboard')).toBe(true);
    expect(isLockedSlot('pause', 1, 'keyboard')).toBe(false);
    expect(isLockedSlot('pause', 0, 'pad')).toBe(false);
  });
});

describe('assign', () => {
  it('puts a new key in a slot', () => {
    const keys = assign(DEFAULT_KEYS, 'fire', 0, 'KeyF');
    expect(keys.fire).toEqual(['KeyF', 'KeyJ', 'Space']);
    expect(DEFAULT_KEYS.fire[0]).toBe('KeyZ');
  });

  it('swaps a key used elsewhere, so nothing is lost', () => {
    const keys = assign(DEFAULT_KEYS, 'fire', 0, 'KeyX');
    expect(keys.fire[0]).toBe('KeyX');
    expect(keys.bomb[0]).toBe('KeyZ');
  });

  it('swaps within one action', () => {
    expect(assign(DEFAULT_KEYS, 'up', 0, 'KeyW').up).toEqual(['KeyW', 'ArrowUp', null]);
  });

  it('empties a slot, and moving a key into an empty slot empties its old one', () => {
    expect(assign(DEFAULT_KEYS, 'bomb', 1, null).bomb).toEqual(['KeyX', null, null]);
    const keys = assign(DEFAULT_KEYS, 'pause', 1, 'KeyC');
    expect(keys.pause).toEqual(['Escape', 'KeyC', null]);
    expect(keys.missile).toEqual([null, 'KeyL', null]);
  });
});

describe('directionWithoutKey', () => {
  it('names a direction left with no key', () => {
    expect(directionWithoutKey(DEFAULT_KEYS)).toBeNull();
    const one = assign(DEFAULT_KEYS, 'up', 1, null);
    expect(directionWithoutKey(one)).toBeNull();
    expect(directionWithoutKey(assign(one, 'up', 0, null))).toBe('up');
    // A swap keeps the direction's key count; a move into an empty slot doesn't.
    const left = assign(DEFAULT_KEYS, 'left', 1, null);
    expect(directionWithoutKey(assign(left, 'fire', 2, 'ArrowLeft'))).toBeNull();
    expect(directionWithoutKey(assign(left, 'bomb', 2, 'ArrowLeft'))).toBe('left');
  });
});

describe('isReservedKey', () => {
  it('keeps Esc, Enter, Backspace, Delete, Tab, the system keys and F keys', () => {
    for (const code of ['Escape', 'Enter', 'NumpadEnter', 'Backspace', 'Delete', 'Tab', 'MetaLeft', 'F5', 'F12']) expect(isReservedKey(code)).toBe(true);
    for (const code of ['KeyF', 'Space', 'ShiftLeft', 'ControlLeft', 'Numpad8']) expect(isReservedKey(code)).toBe(false);
  });
});

describe('loadBindings and saveBindings', () => {
  it('round-trip', () => {
    const storage = memoryStorage();
    const b = defaultBindings();
    b.keys = assign(b.keys, 'fire', 0, 'KeyF');
    b.pads['id:Arcade stick'] = assign(padLayout(b, 'id:Arcade stick'), 'fire', 0, 'b3');
    saveBindings(storage, b);
    expect(loadBindings(storage)).toEqual(b);
  });

  it('give the defaults for missing, broken or blocked storage', () => {
    expect(loadBindings(null)).toEqual(defaultBindings());
    const storage = memoryStorage();
    storage.setItem('pattern-break.bindings', '{not json');
    expect(loadBindings(storage)).toEqual(defaultBindings());
  });

  it('drop invalid, reserved and repeated keys, and keep Esc locked', () => {
    const storage = memoryStorage();
    const keys = { ...DEFAULT_KEYS, fire: ['Enter', 'KeyJ', 42], bomb: ['KeyJ', 'KeyK', null], pause: ['KeyP', null, null] };
    storage.setItem('pattern-break.bindings', JSON.stringify({ keys, pads: { standard: { ...DEFAULT_PAD, fire: ['b0', 'x9', null] } } }));
    const b = loadBindings(storage);
    expect(b.keys.fire).toEqual([null, 'KeyJ', null]);
    expect(b.keys.bomb).toEqual([null, 'KeyK', null]);
    expect(b.keys.pause).toEqual(['Escape', null, null]);
    expect(b.pads[STANDARD_PROFILE]!.fire).toEqual(['b0', null, null]);
  });

  it('fall back to the default keys when a direction would have none', () => {
    const storage = memoryStorage();
    storage.setItem('pattern-break.bindings', JSON.stringify({ keys: { ...DEFAULT_KEYS, up: [null, null, null] } }));
    expect(loadBindings(storage).keys).toEqual(DEFAULT_KEYS);
  });
});

describe('padLayout', () => {
  it('defaults the standard profile and leaves any other empty', () => {
    const b = { keys: DEFAULT_KEYS, pads: {} };
    expect(padLayout(b, STANDARD_PROFILE)).toEqual(DEFAULT_PAD);
    expect(padLayout(b, 'id:x').fire).toEqual([null, null, null]);
  });
});

describe('labels', () => {
  it('names keys as a US keyboard prints them', () => {
    expect(['KeyZ', 'Digit4', 'Numpad8', 'ArrowUp', 'ShiftRight', 'Semicolon', 'Quote', 'Escape', 'IntlRo'].map(keyLabel)).toEqual([
      'Z', '4', 'Num 8', 'Up', 'R Shift', ';', "'", 'Esc', 'IntlRo',
    ]);
  });

  it('names pad inputs: an Xbox pad\'s names on a standard pad, numbers on any other', () => {
    expect(['b0', 'b7', 'b12', 'a1-', 'a2+'].map((i) => padInputLabel(i, true))).toEqual(['A', 'RT', 'D Up', 'LS Up', 'RS Right']);
    expect(['b0', 'a1-', 'h9@-1.000', 'h9@1.000', 'h9@-0.429'].map((i) => padInputLabel(i, false))).toEqual([
      'Btn 0', 'Axis 1-', 'H9 Up', 'H9 Up L', 'H9 Right',
    ]);
  });

  it('fit a Keys screen slot', () => {
    const labels = KEY_ACTIONS.flatMap((a) => DEFAULT_KEYS[a]).filter((k) => k !== null).map(keyLabel);
    for (const l of labels) expect(l.length).toBeLessThanOrEqual(11);
    expect(padInputLabel('h12@-0.143', false).length).toBeLessThanOrEqual(11);
  });
});
