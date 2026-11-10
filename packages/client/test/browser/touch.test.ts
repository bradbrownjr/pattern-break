// The touch controls' DOM side in a real browser: a touch shows them, a button held holds
// its bits, the stick steers, and a connected gamepad hides them.

import { InputBit } from '@game/core';
import { afterEach, describe, expect, it } from 'vitest';
import { PadBit } from '../../src/game/gamepad.ts';
import { TouchControls } from '../../src/game/touch.ts';

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
});
