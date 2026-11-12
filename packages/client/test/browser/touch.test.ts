// The touch controls' DOM side in a real browser: a touch shows them, a button held holds
// its bits, the stick steers, and a connected gamepad hides them.

import { InputBit } from '@game/core';
import { afterEach, describe, expect, it } from 'vitest';
import { PadBit } from '../../src/game/gamepad.ts';
import { TouchControls } from '../../src/game/touch.ts';
import { BACK_SLOT, SELECT_SLOT, THIRD_SLOT } from '../../src/game/touch-input.ts';

const made: TouchControls[] = [];

function make(onTap: () => void = () => {}): TouchControls {
  const canvas = document.createElement('div');
  Object.assign(canvas.style, { position: 'fixed', left: '100px', top: '0', width: '384px', height: '216px' });
  document.body.appendChild(canvas);
  const t = new TouchControls(document.body, canvas, onTap);
  made.push(t);
  return t;
}

function pointer(target: EventTarget, type: string, x: number, y: number, pointerId = 1): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId, clientX: x, clientY: y }));
}

/** The first touch shows them; off the start screen. */
function shown(t: TouchControls): void {
  pointer(window, 'pointerdown', 0, 0, 99);
  t.setStartScreen(false);
}

afterEach(() => {
  for (const t of made.splice(0)) t.root.remove();
});

describe('touch controls', () => {
  it('show after a touch, off the start screen', () => {
    const t = make();
    t.setStartScreen(false);
    if (!matchMedia('(pointer: coarse)').matches) expect(t.visible).toBe(false);
    pointer(window, 'pointerdown', 0, 0, 99);
    expect(t.visible).toBe(true);
    expect(t.root.style.display).toBe('block');
    t.setStartScreen(true);
    expect(t.root.style.display).toBe('none');
  });

  it('a held button holds its bits until the finger lifts', () => {
    const t = make();
    shown(t);
    const fire = t.root.querySelector<HTMLElement>('[data-button="fire"]')!;
    const r = fire.getBoundingClientRect();
    pointer(fire, 'pointerdown', r.x + 5, r.y + 5, 2);
    expect(t.bits).toBe(InputBit.fire | PadBit.a);
    pointer(fire, 'pointerup', r.x + 5, r.y + 5, 2);
    // The press is kept until the frame reads it, so a tap shorter than a frame counts.
    expect(t.bits).toBe(InputBit.fire | PadBit.a);
    t.endFrame();
    expect(t.bits).toBe(0);
  });

  it('the stick steers where the thumb moves, and a still touch is a tap', () => {
    let taps = 0;
    const t = make(() => taps++);
    shown(t);
    const zone = t.root.firstElementChild!;
    pointer(zone, 'pointerdown', 60, 150, 3);
    pointer(zone, 'pointermove', 60, 110, 3);
    expect(t.bits).toBe(InputBit.up);
    pointer(zone, 'pointerup', 60, 110, 3);
    expect([t.bits, taps]).toEqual([0, 0]);
    pointer(zone, 'pointerdown', 60, 150, 4);
    pointer(zone, 'pointerup', 61, 150, 4);
    expect(taps).toBe(1);
  });

  it('hide, and let go of everything, when a gamepad connects', () => {
    const t = make();
    shown(t);
    const bomb = t.root.querySelector<HTMLElement>('[data-button="bomb"]')!;
    pointer(bomb, 'pointerdown', 0, 0, 5);
    expect(t.bits).not.toBe(0);
    t.setPadConnected(true);
    expect([t.visible, t.root.style.display, t.bits]).toEqual([false, 'none', 0]);
    t.setPadConnected(false);
    expect([t.visible, t.bits]).toEqual([true, 0]);
  });

  it('menus show only their labelled keys, which hold pad bits or act on the lift', () => {
    const t = make();
    shown(t);
    let saved = 0;
    t.setKeys([
      { slot: SELECT_SLOT, label: 'Retry', bits: PadBit.a },
      { slot: BACK_SLOT, label: 'Title', bits: PadBit.b },
      { slot: THIRD_SLOT, label: 'Save', bits: 0, action: () => saved++ },
    ]);
    const all = [...t.root.querySelectorAll<HTMLElement>('[data-button]')];
    expect(all.filter((b) => b.style.display !== 'none').map((b) => b.dataset['label'])).toEqual(['Save', 'Title', 'Retry']);
    const retry = t.root.querySelector<HTMLElement>('[data-label="Retry"]')!;
    pointer(retry, 'pointerdown', 0, 0, 6);
    expect(t.bits).toBe(PadBit.a);
    pointer(retry, 'pointerup', 0, 0, 6);
    t.endFrame();
    expect(t.bits).toBe(0);
    const save = t.root.querySelector<HTMLElement>('[data-label="Save"]')!;
    pointer(save, 'pointerdown', 0, 0, 7);
    expect([t.bits, saved]).toEqual([0, 0]);
    t.endFrame();
    pointer(save, 'pointerup', 0, 0, 7);
    expect(saved).toBe(1);
    // Back to play: all six, with their own bits.
    t.setKeys(null);
    expect(all.every((b) => b.style.display === '' && b.dataset['label'] === undefined)).toBe(true);
    const fire = t.root.querySelector<HTMLElement>('[data-button="fire"]')!;
    pointer(fire, 'pointerdown', 0, 0, 8);
    expect(t.bits).toBe(InputBit.fire | PadBit.a);
    pointer(fire, 'pointerup', 0, 0, 8);
  });

  it('a key that changed under the finger does not act on its lift', () => {
    const t = make();
    shown(t);
    let acted = 0;
    t.setKeys([{ slot: SELECT_SLOT, label: 'Save', bits: 0, action: () => acted++ }]);
    const b = t.root.querySelector<HTMLElement>('[data-label="Save"]')!;
    pointer(b, 'pointerdown', 0, 0, 9);
    t.setKeys([{ slot: SELECT_SLOT, label: 'Next', bits: PadBit.a, action: () => acted++ }]);
    pointer(b, 'pointerup', 0, 0, 9);
    expect(acted).toBe(0);
  });
});
