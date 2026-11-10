import { InputBit } from '@game/core';
import { describe, expect, it } from 'vitest';
import { assign, DEFAULT_KEYS } from '../src/game/bindings.ts';
import { InputSampler, KeyMap } from '../src/game/input.ts';

const keys = new KeyMap();
const keyToBit = (code: string): number => keys.bit(code);
const keyToMenuAction = (code: string): string | null => keys.menuAction(code);

describe('KeyMap.bit with the default keys', () => {
  it('maps arrows and WASD to the movement bits', () => {
    expect(keyToBit('ArrowUp')).toBe(InputBit.up);
    expect(keyToBit('KeyW')).toBe(InputBit.up);
    expect(keyToBit('ArrowDown')).toBe(InputBit.down);
    expect(keyToBit('KeyS')).toBe(InputBit.down);
    expect(keyToBit('ArrowLeft')).toBe(InputBit.left);
    expect(keyToBit('KeyA')).toBe(InputBit.left);
    expect(keyToBit('ArrowRight')).toBe(InputBit.right);
    expect(keyToBit('KeyD')).toBe(InputBit.right);
  });

  it('maps Space, Z and J to fire', () => {
    expect(['Space', 'KeyZ', 'KeyJ'].map(keyToBit)).toEqual([InputBit.fire, InputBit.fire, InputBit.fire]);
  });

  it('maps X and K to the bomb, V and semicolon to the nuke, C and L to missiles, Shift and quote to boost, and not F', () => {
    expect(['KeyX', 'KeyK'].map(keyToBit)).toEqual([InputBit.bomb, InputBit.bomb]);
    expect(['KeyV', 'Semicolon'].map(keyToBit)).toEqual([InputBit.nuke, InputBit.nuke]);
    expect(['KeyC', 'KeyL'].map(keyToBit)).toEqual([InputBit.missile, InputBit.missile]);
    expect(keyToBit('KeyF')).toBe(0);
    expect(['ShiftLeft', 'ShiftRight', 'Quote'].map(keyToBit)).toEqual([InputBit.boost, InputBit.boost, InputBit.boost]);
  });

  it('ignores other keys; Esc pauses but sets no sim bit', () => {
    expect(keyToBit('Escape')).toBe(0);
    expect(keys.action('Escape')).toBe('pause');
    expect(keyToBit('KeyB')).toBe(0);
    expect(keyToBit('KeyQ')).toBe(0);
  });
});

describe('KeyMap.menuAction', () => {
  it('maps the directions, Fire to confirm, Bomb and Pause to back, and always Enter, Esc and Backspace', () => {
    expect(['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].map(keyToMenuAction)).toEqual([
      'up', 'up', 'down', 'down', 'left', 'left', 'right', 'right',
    ]);
    expect(['Enter', 'NumpadEnter', 'Space', 'KeyZ', 'KeyJ'].map(keyToMenuAction)).toEqual(['confirm', 'confirm', 'confirm', 'confirm', 'confirm']);
    expect(['Escape', 'Backspace', 'KeyX', 'KeyK'].map(keyToMenuAction)).toEqual(['back', 'back', 'back', 'back']);
  });

  it('ignores keys that do nothing in menus', () => {
    expect(keyToMenuAction('KeyQ')).toBeNull();
    expect(keyToMenuAction('ShiftLeft')).toBeNull();
    expect(keyToMenuAction('KeyV')).toBeNull();
  });

  it('follows remapped keys', () => {
    const remapped = new KeyMap(assign(DEFAULT_KEYS, 'up', 0, 'KeyI'));
    expect(remapped.menuAction('KeyI')).toBe('up');
    expect(remapped.bit('KeyI')).toBe(InputBit.up);
    expect(remapped.menuAction('ArrowUp')).toBeNull();
    expect(remapped.bit('ArrowUp')).toBe(0);
  });
});

describe('InputSampler', () => {
  it('reads keys through its KeyMap', () => {
    const s = new InputSampler();
    s.keys = new KeyMap(assign(DEFAULT_KEYS, 'fire', 0, 'KeyF'));
    s.keyDown('KeyF');
    s.keyDown('KeyZ');
    expect(s.sample()).toBe(InputBit.fire);
  });

  it('reports held keys on every sample until released', () => {
    const s = new InputSampler();
    s.keyDown('ArrowUp');
    s.keyDown('KeyD');
    expect(s.sample()).toBe(InputBit.up | InputBit.right);
    expect(s.sample()).toBe(InputBit.up | InputBit.right);
    s.keyUp('ArrowUp');
    expect(s.sample()).toBe(InputBit.right);
  });

  it('keeps a tap that starts and ends between two samples for one tick', () => {
    const s = new InputSampler();
    s.keyDown('ArrowDown');
    s.keyUp('ArrowDown');
    expect(s.sample()).toBe(InputBit.down);
    expect(s.sample()).toBe(0);
  });

  it('keeps a direction while either of its two keys is held', () => {
    const s = new InputSampler();
    s.keyDown('ArrowLeft');
    s.keyDown('KeyA');
    s.keyUp('ArrowLeft');
    s.sample();
    expect(s.sample()).toBe(InputBit.left);
    s.keyUp('KeyA');
    expect(s.sample()).toBe(0);
  });

  it('forgets everything on clear', () => {
    const s = new InputSampler();
    s.keyDown('ArrowUp');
    s.clear();
    expect(s.sample()).toBe(0);
  });
});
