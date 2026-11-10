import { InputBit } from '@game/core';
import { describe, expect, it } from 'vitest';
import { PadBit } from '../src/game/gamepad.ts';
import {
  FloatingStick,
  STICK_DEAD_ZONE,
  STICK_RADIUS,
  TOUCH_BITS,
  TOUCH_BUTTONS,
  stickBits,
  touchLayout,
  touchVisible,
  type Rect,
} from '../src/game/touch-input.ts';
import { integerScale } from '../src/render/renderer.ts';

const { up, down, left, right } = InputBit;

describe('stick', () => {
  it('steers in 8 equal sectors, with nothing in the dead zone', () => {
    const at = (deg: number) => stickBits(30 * Math.cos((deg * Math.PI) / 180), 30 * Math.sin((deg * Math.PI) / 180));
    // Screen y is down, so 90 degrees is down.
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(at)).toEqual([
      right,
      right | down,
      down,
      down | left,
      left,
      left | up,
      up,
      up | right,
    ]);
    // 20 degrees off an axis is still that axis alone; 25 is the diagonal.
    expect(at(20)).toBe(right);
    expect(at(25)).toBe(right | down);
    expect(stickBits(STICK_DEAD_ZONE - 1, 0)).toBe(0);
  });

  it('floats: its centre follows a thumb dragged past its reach, so turning back acts at once', () => {
    const s = new FloatingStick();
    s.start(100, 100);
    expect(s.bits).toBe(0);
    s.move(100 + 3 * STICK_RADIUS, 100);
    expect(s.bits).toBe(right);
    expect(s.baseX).toBeCloseTo(100 + 2 * STICK_RADIUS);
    // Back a little past the dead zone from the far point: left already.
    s.move(100 + 3 * STICK_RADIUS - STICK_RADIUS - STICK_DEAD_ZONE, 100);
    expect(s.bits).toBe(left);
    expect(s.still).toBe(false);
  });

  it('a touch that stays in the dead zone is still a tap', () => {
    const s = new FloatingStick();
    s.start(50, 50);
    s.move(53, 52);
    expect([s.still, s.bits]).toEqual([true, 0]);
  });
});

describe('buttons', () => {
  it('hold what a gamepad would: fire is also A, bomb also B, pause is Start', () => {
    expect(TOUCH_BITS.fire).toBe(InputBit.fire | PadBit.a);
    expect(TOUCH_BITS.bomb).toBe(InputBit.bomb | PadBit.b);
    expect(TOUCH_BITS.pause).toBe(PadBit.start);
    expect([TOUCH_BITS.missile, TOUCH_BITS.nuke, TOUCH_BITS.boost]).toEqual([InputBit.missile, InputBit.nuke, InputBit.boost]);
  });
});

/** The picture centred in the window at the scale the renderer picks. */
function picture(width: number, height: number, dpr: number): Rect {
  const k = integerScale(width, height, dpr);
  const w = (384 * k) / dpr;
  const h = (216 * k) / dpr;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

const inside = (r: Rect, width: number, height: number) => r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= height;
const apart = (a: Rect, b: Rect) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

describe('layout', () => {
  it('scales the picture by whole device pixels', () => {
    // A phone held sideways, 844 x 390 CSS px at 3x: 5 device px per game pixel.
    expect(integerScale(844, 390, 3)).toBe(5);
    expect(integerScale(844, 390)).toBe(1);
    expect(integerScale(1920, 1080)).toBe(5);
    expect(integerScale(100, 100, 1)).toBe(1);
  });

  it.each([
    [844, 390, 3],
    [915, 412, 2.625],
    [740, 360, 4],
    [1024, 768, 2],
    [390, 844, 3],
  ])('%i x %i at %f: every button on screen, apart, at least 44 px, in the bar when it fits', (width, height, dpr) => {
    const pic = picture(width, height, dpr);
    const l = touchLayout(width, height, pic);
    expect(l.buttons.length).toBe(TOUCH_BUTTONS.length);
    for (const b of l.buttons) {
      expect(inside(b, width, height)).toBe(true);
      expect(b.width).toBeGreaterThanOrEqual(44);
    }
    for (let i = 0; i < l.buttons.length; i++) for (let j = i + 1; j < l.buttons.length; j++) expect(apart(l.buttons[i]!, l.buttons[j]!)).toBe(true);
    const bar = width - (pic.x + pic.width);
    const size = l.buttons[0]!.width;
    if (bar >= size + 12) for (const b of l.buttons) expect(b.x).toBeGreaterThanOrEqual(pic.x + pic.width);
    // Fire is the last and lowest, at the right.
    const fire = l.buttons[TOUCH_BUTTONS.indexOf('fire')]!;
    expect(Math.max(...l.buttons.map((b) => b.y))).toBe(fire.y);
    // The stick's side doesn't reach the buttons.
    for (const b of l.buttons) expect(apart(l.stick, b)).toBe(true);
  });

  it('a phone at 844 x 390 gets one column of 58 px buttons in the bar', () => {
    const l = touchLayout(844, 390, picture(844, 390, 3));
    expect(new Set(l.buttons.map((b) => b.x)).size).toBe(1);
    expect(l.buttons[0]!.width).toBe(58);
  });
});

describe('visibility', () => {
  it('shows on a touch screen, but not with a gamepad connected or on the start screen', () => {
    expect(touchVisible(true, false, false)).toBe(true);
    expect(touchVisible(true, true, false)).toBe(false);
    expect(touchVisible(true, false, true)).toBe(false);
    expect(touchVisible(false, false, false)).toBe(false);
  });
});
