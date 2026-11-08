import { InputBit } from '@game/core';
import { describe, expect, it } from 'vitest';
import { InputSampler, keyToBit } from '../src/game/input.ts';

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

  it('ignores other keys', () => {
    expect(keyToBit('Escape')).toBe(0);
    expect(keyToBit('Space')).toBe(0);
    expect(keyToBit('KeyQ')).toBe(0);
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
