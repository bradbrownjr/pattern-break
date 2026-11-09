import { InputBit } from '@game/core';
import { describe, expect, it } from 'vitest';
import { InputSampler, keyToBit, keyToMenuAction } from '../src/game/input.ts';

describe('keyToBit', () => {
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

  it('ignores other keys', () => {
    expect(keyToBit('Escape')).toBe(0);
    expect(keyToBit('KeyX')).toBe(0);
    expect(keyToBit('KeyQ')).toBe(0);
  });
});

describe('keyToMenuAction', () => {
  it('maps arrows and WASD to directions, Enter and Space to confirm, Esc and Backspace to back', () => {
    expect(['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].map(keyToMenuAction)).toEqual([
      'up', 'up', 'down', 'down', 'left', 'left', 'right', 'right',
    ]);
    expect(['Enter', 'NumpadEnter', 'Space'].map(keyToMenuAction)).toEqual(['confirm', 'confirm', 'confirm']);
    expect(['Escape', 'Backspace'].map(keyToMenuAction)).toEqual(['back', 'back']);
  });

  it('ignores other keys, the fire keys Z and J among them', () => {
    expect(keyToMenuAction('KeyZ')).toBeNull();
    expect(keyToMenuAction('KeyJ')).toBeNull();
    expect(keyToMenuAction('KeyQ')).toBeNull();
    expect(keyToMenuAction('ShiftLeft')).toBeNull();
  });
});

describe('InputSampler', () => {
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
