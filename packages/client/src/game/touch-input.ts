// The on-screen touch controls' logic, apart from the DOM so tests run in Node (the DOM
// side is touch.ts). A floating stick appears where the left thumb lands; how far it leans
// sets the ship's speed (stickLean, through InputSampler.setLean), and its 8 directions
// move the menus' cursor. Buttons on the right hold the same bits as a gamepad's
// (gamepad.ts), so the game reads touch and pads the same way, in play and in the menus
// (Brad, 2026-11-10).

import { InputBit } from '@game/core';
import { PadBit } from './gamepad.ts';
import { radialLean, type Lean } from './lean.ts';

export type { Lean } from './lean.ts';

export const TOUCH_BUTTONS = ['pause', 'nuke', 'boost', 'missile', 'bomb', 'fire'] as const;
export type TouchButton = (typeof TOUCH_BUTTONS)[number];

/**
 * What each button holds. Fire is also A (confirm) and bomb also B (back), as on a pad;
 * pause is Start, so holding it while pressing fire on Play starts in god mode.
 */
export const TOUCH_BITS: Record<TouchButton, number> = {
  pause: PadBit.start,
  nuke: InputBit.nuke,
  boost: InputBit.boost,
  missile: InputBit.missile,
  bomb: InputBit.bomb | PadBit.b,
  fire: InputBit.fire | PadBit.a,
};

/**
 * The stick's reach from its centre, and the dead zone in the middle, in CSS px (Brad,
 * 2026-11-12: 40 and 10 made the ship hard to steer). No platform guideline gives these;
 * game-dev write-ups suggest a stick 100 to 140 px across and a dead zone of 10 to 15% of
 * its reach (bugnet.io, "How to fix mobile virtual joystick feeling bad"; abratabia.com,
 * "Virtual joystick"). 112 px across, and 8 px is 14%.
 */
export const STICK_RADIUS = 56;
export const STICK_DEAD_ZONE = 8;
/** A touch on the stick's side that ends this soon without leaving the dead zone is a tap. */
export const TAP_MS = 300;
/** sin 22.5 degrees: an axis counts once it has this share of the lean, giving 8 equal sectors. */
const SECTOR = 0.3827;

/** The direction bits for the stick leaning (dx, dy) CSS px from its centre, y down. */
export function stickBits(dx: number, dy: number, deadZone = STICK_DEAD_ZONE): number {
  const length = Math.hypot(dx, dy);
  if (length < deadZone) return 0;
  const k = SECTOR * length;
  let bits = 0;
  if (dx > k) bits |= InputBit.right;
  else if (dx < -k) bits |= InputBit.left;
  if (dy > k) bits |= InputBit.down;
  else if (dy < -k) bits |= InputBit.up;
  return bits;
}

/**
 * How far the stick leans when the thumb is (dx, dy) CSS px from its centre: nothing in
 * the dead zone, then rising from 0 at its edge to 1 at STICK_RADIUS, along the thumb's
 * direction, so the ship goes as fast as the stick is pushed. The dead zone is round and
 * the lean is measured from its edge, as Microsoft's XInput guide does for a gamepad's
 * stick.
 */
export function stickLean(dx: number, dy: number, out: Lean = { x: 0, y: 0 }): Lean {
  return radialLean(dx / STICK_RADIUS, dy / STICK_RADIUS, STICK_DEAD_ZONE / STICK_RADIUS, out);
}

/**
 * A stick centred where the touch began. Dragged past STICK_RADIUS, the centre follows the
 * thumb, so turning back acts at once instead of first crossing the old centre.
 */
export class FloatingStick {
  baseX = 0;
  baseY = 0;
  knobX = 0;
  knobY = 0;
  /** True while the touch hasn't left the dead zone: it may still be a tap. */
  still = true;

  start(x: number, y: number): void {
    this.baseX = this.knobX = x;
    this.baseY = this.knobY = y;
    this.still = true;
  }

  move(x: number, y: number): void {
    let dx = x - this.baseX;
    let dy = y - this.baseY;
    const length = Math.hypot(dx, dy);
    if (length > STICK_RADIUS) {
      const over = (length - STICK_RADIUS) / length;
      this.baseX += dx * over;
      this.baseY += dy * over;
      dx = x - this.baseX;
      dy = y - this.baseY;
    }
    this.knobX = x;
    this.knobY = y;
    if (length >= STICK_DEAD_ZONE) this.still = false;
  }

  get bits(): number {
    return stickBits(this.knobX - this.baseX, this.knobY - this.baseY);
  }

  lean(out: Lean): Lean {
    return stickLean(this.knobX - this.baseX, this.knobY - this.baseY, out);
  }
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A key the menus show in place of the play buttons (Brad, 2026-11-12: the menus show only
 * what they use, as icons).
 */
export interface TouchKey {
  /** The square it takes, in TOUCH_BUTTONS order: SELECT_SLOT is fire's, at the bottom right. */
  slot: number;
  /** What it does, for screen readers and tests; the button shows `icon`. */
  label: string;
  /** Its pixel map (render/icons.ts). */
  icon: readonly string[];
  /** What it holds while pressed, as a pad's buttons would; 0 for one that only has `action`. */
  bits: number;
  /** Called on its lift, inside the touch's own event, so it can open the keyboard or save a file. */
  action?: () => void;
}

/** Where the menu keys go: Select on fire's square, Back on bomb's, the rest above them. */
export const SELECT_SLOT = 5;
export const BACK_SLOT = 4;
export const THIRD_SLOT = 3;
export const FOURTH_SLOT = 2;

export interface TouchLayout {
  /** Each button's square, in TOUCH_BUTTONS order. */
  buttons: Rect[];
  /** Where a touch starts the stick: the left part of the screen. */
  stick: Rect;
  /** Where the stick's ring rests between touches, as a hint. */
  restX: number;
  restY: number;
}

const GAP = 6;
/** WCAG 2.2's 2.5.5 Target Size (Enhanced): at least 44 by 44 CSS px. */
const MIN_BUTTON = 44;
const MAX_BUTTON = 72;
/** The stick's side reaches this far across the screen. */
const STICK_SHARE = 0.4;

/**
 * Lays the controls out for a `width` x `height` CSS px window with the picture at
 * `picture`. Held sideways, the buttons go in the bar right of the picture, in two columns
 * when it is wide enough and one when not; a bar too narrow for even one keeps them at the
 * right edge, over the picture. Upright (portraitPad), they go under the picture in the
 * same two columns, with the stick's side left of them. Fire is at the bottom right, under
 * the thumb.
 */
export function touchLayout(width: number, height: number, picture: Rect): TouchLayout {
  const below = picture.y + picture.height;
  if (height > width && height - below >= 3 * MIN_BUTTON + 4 * GAP) {
    return portraitLayout(width, height, below);
  }
  const bar = Math.max(0, width - (picture.x + picture.width));
  const tall = Math.floor((height - 4 * GAP) / 3);
  const twoColumns = Math.min(MAX_BUTTON, tall, Math.floor((bar - 3 * GAP) / 2));
  let cols: number;
  let size: number;
  if (twoColumns >= MIN_BUTTON) {
    cols = 2;
    size = twoColumns;
  } else {
    cols = 1;
    size = Math.max(MIN_BUTTON, Math.min(MAX_BUTTON, Math.floor((height - 7 * GAP) / 6), bar - 2 * GAP));
  }
  const rows = TOUCH_BUTTONS.length / cols;
  const blockW = cols * size + (cols - 1) * GAP;
  const blockH = rows * size + (rows - 1) * GAP;
  const left = bar >= blockW + 2 * GAP ? width - bar + Math.floor((bar - blockW) / 2) : width - GAP - blockW;
  const top = Math.max(GAP, height - GAP - blockH - Math.floor((height - blockH) / 6));
  const buttons = TOUCH_BUTTONS.map((_, i) => ({
    x: left + (i % cols) * (size + GAP),
    y: top + Math.floor(i / cols) * (size + GAP),
    width: size,
    height: size,
  }));
  const leftBar = Math.max(0, picture.x);
  const restX = leftBar >= 2 * STICK_RADIUS + 2 * GAP ? Math.round(leftBar / 2) : GAP + STICK_RADIUS;
  return {
    buttons,
    stick: { x: 0, y: 0, width: Math.floor(width * STICK_SHARE), height },
    restX,
    restY: Math.round(height - GAP - STICK_RADIUS - (height - 2 * STICK_RADIUS) / 6),
  };
}

/** The upright layout: everything in the part of the window under the picture, from `top` down. */
function portraitLayout(width: number, height: number, top: number): TouchLayout {
  const room = height - top;
  const size = Math.max(MIN_BUTTON, Math.min(MAX_BUTTON, Math.floor((room - 4 * GAP) / 3), Math.floor((width / 2 - 3 * GAP) / 2)));
  const blockW = 2 * size + GAP;
  const blockH = 3 * size + 2 * GAP;
  const left = width - GAP - blockW;
  const blockTop = height - GAP - blockH - Math.floor((room - blockH) / 6);
  const buttons = TOUCH_BUTTONS.map((_, i) => ({
    x: left + (i % 2) * (size + GAP),
    y: blockTop + Math.floor(i / 2) * (size + GAP),
    width: size,
    height: size,
  }));
  const stickWidth = left - GAP;
  return {
    buttons,
    stick: { x: 0, y: top, width: stickWidth, height: room },
    restX: Math.round(stickWidth / 2),
    restY: Math.round(blockTop + blockH / 2),
  };
}

/**
 * Whether the controls show: on a touch screen (one seen, or a coarse pointer), not while a
 * gamepad is connected, and not on the start screen, whose tap is what lets sound start.
 */
export function touchVisible(touchScreen: boolean, padConnected: boolean, startScreen: boolean): boolean {
  return touchScreen && !padConnected && !startScreen;
}
