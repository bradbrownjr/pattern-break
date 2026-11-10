// The on-screen touch controls (logic in touch-input.ts): DOM elements over the canvas, so
// they sit in the bars beside the picture at the screen's own resolution. Pointer Events
// (https://www.w3.org/TR/pointerevents3/) track each finger by pointerId, so the stick and
// any number of buttons work at once. Each finger is captured by the element it landed on,
// and a button stays held until that finger lifts.

import {
  BOMB_ICON_MAP,
  BOOST_ICON_MAP,
  FIRE_ICON_MAP,
  MISSILE_ICON_MAP,
  NUKE_MAP,
  PAUSE_ICON_MAP,
  iconSvg,
} from '../render/icons.ts';
import {
  FloatingStick,
  STICK_RADIUS,
  TAP_MS,
  TOUCH_BITS,
  TOUCH_BUTTONS,
  touchLayout,
  touchVisible,
  type TouchButton,
} from './touch-input.ts';

const ICONS: Record<TouchButton, readonly string[]> = {
  pause: PAUSE_ICON_MAP,
  nuke: NUKE_MAP,
  boost: BOOST_ICON_MAP,
  missile: MISSILE_ICON_MAP,
  bomb: BOMB_ICON_MAP,
  fire: FIRE_ICON_MAP,
};

const RING = 'rgba(45, 226, 230, 0.55)';
const FACE = 'rgba(7, 8, 15, 0.55)';
const FACE_HELD = 'rgba(45, 226, 230, 0.35)';

function div(style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, style);
  return el;
}

/** Keeps `pointerId` going to `el` until it lifts; a pointer that is no longer down can't be captured. */
function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // The spec's NotFoundError: the pointer already lifted.
  }
}

/** Stops a touch on the controls from also counting as a tap on the game behind them. */
function swallow(e: PointerEvent): void {
  e.preventDefault();
  e.stopPropagation();
}

export class TouchControls {
  readonly root = div({ position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '10', touchAction: 'none' });
  #zone = div({ position: 'absolute', pointerEvents: 'auto', touchAction: 'none' });
  #base = div({ position: 'absolute', borderRadius: '50%', border: `2px solid ${RING}`, boxSizing: 'border-box' });
  #knob = div({ position: 'absolute', borderRadius: '50%', background: RING });
  #buttons: HTMLDivElement[] = [];
  #stick = new FloatingStick();
  #stickPointer: number | null = null;
  #stickSince = 0;
  #held = 0;
  #buttonPointers = new Map<number, number>();
  #touchScreen: boolean;
  #padConnected = false;
  #startScreen = true;
  #restX = 0;
  #restY = 0;
  readonly #canvas: HTMLElement;
  readonly #onTap: () => void;

  /**
   * `canvas` is the game's picture, for the layout; `onTap` runs for a quick touch on the
   * stick's side that didn't steer, from its pointerup, so it can start sound.
   */
  constructor(parent: HTMLElement, canvas: HTMLElement, onTap: () => void) {
    this.#canvas = canvas;
    this.#onTap = onTap;
    this.#touchScreen = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.root.dataset['touchControls'] = '';
    this.#base.style.width = this.#base.style.height = `${2 * STICK_RADIUS}px`;
    const knob = Math.round(STICK_RADIUS * 0.9);
    this.#knob.style.width = this.#knob.style.height = `${knob}px`;
    this.root.append(this.#zone, this.#base, this.#knob);
    for (const id of TOUCH_BUTTONS) {
      const b = div({
        position: 'absolute',
        pointerEvents: 'auto',
        touchAction: 'none',
        boxSizing: 'border-box',
        border: `2px solid ${RING}`,
        borderRadius: '10px',
        backgroundColor: FACE,
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(iconSvg(ICONS[id]))}")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: '58%',
        imageRendering: 'pixelated',
      });
      b.dataset['button'] = id;
      b.setAttribute('aria-label', id);
      b.addEventListener('pointerdown', (e) => this.#press(e, id, b));
      const lift = (e: PointerEvent) => this.#lift(e, b);
      b.addEventListener('pointerup', lift);
      b.addEventListener('pointercancel', lift);
      b.addEventListener('lostpointercapture', lift);
      this.#buttons.push(b);
      this.root.append(b);
    }
    this.#zone.addEventListener('pointerdown', (e) => this.#stickDown(e));
    this.#zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.#stickPointer) return;
      this.#stick.move(e.clientX, e.clientY);
      this.#drawStick();
    });
    this.#zone.addEventListener('pointerup', (e) => this.#stickUp(e, true));
    this.#zone.addEventListener('pointercancel', (e) => this.#stickUp(e, false));
    // The first touch anywhere shows the controls on a screen that didn't say it was one.
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch' && !this.#touchScreen) {
          this.#touchScreen = true;
          this.#update();
        }
      },
      { capture: true },
    );
    parent.append(this.root);
    this.layout();
    this.#update();
  }

  /** The bits the controls hold now: the stick's direction and each button held. */
  get bits(): number {
    return this.visible ? this.#held | (this.#stickPointer === null ? 0 : this.#stick.bits) : 0;
  }

  get visible(): boolean {
    return touchVisible(this.#touchScreen, this.#padConnected, this.#startScreen);
  }

  setPadConnected(connected: boolean): void {
    if (connected === this.#padConnected) return;
    this.#padConnected = connected;
    this.#update();
  }

  /** True on the start screen, where the controls stay hidden. */
  setStartScreen(start: boolean): void {
    if (start === this.#startScreen) return;
    this.#startScreen = start;
    this.#update();
  }

  /** Places everything for the window's size and the picture's place in it. */
  layout(): void {
    const r = this.#canvas.getBoundingClientRect();
    const l = touchLayout(window.innerWidth, window.innerHeight, { x: r.left, y: r.top, width: r.width, height: r.height });
    l.buttons.forEach((rect, i) => {
      const s = this.#buttons[i]!.style;
      s.left = `${rect.x}px`;
      s.top = `${rect.y}px`;
      s.width = `${rect.width}px`;
      s.height = `${rect.height}px`;
    });
    Object.assign(this.#zone.style, {
      left: `${l.stick.x}px`,
      top: `${l.stick.y}px`,
      width: `${l.stick.width}px`,
      height: `${l.stick.height}px`,
    });
    this.#restX = l.restX;
    this.#restY = l.restY;
    this.#drawStick();
  }

  #update(): void {
    const visible = this.visible;
    this.root.style.display = visible ? 'block' : 'none';
    if (!visible) this.#releaseAll();
  }

  #releaseAll(): void {
    this.#held = 0;
    this.#buttonPointers.clear();
    this.#stickPointer = null;
    for (const b of this.#buttons) b.style.backgroundColor = FACE;
    this.#drawStick();
  }

  #press(e: PointerEvent, id: TouchButton, b: HTMLDivElement): void {
    swallow(e);
    capture(b, e.pointerId);
    this.#buttonPointers.set(e.pointerId, TOUCH_BITS[id]);
    this.#held |= TOUCH_BITS[id];
    b.style.backgroundColor = FACE_HELD;
  }

  #lift(e: PointerEvent, b: HTMLDivElement): void {
    if (!this.#buttonPointers.has(e.pointerId)) return;
    swallow(e);
    this.#buttonPointers.delete(e.pointerId);
    let held = 0;
    for (const bits of this.#buttonPointers.values()) held |= bits;
    this.#held = held;
    b.style.backgroundColor = FACE;
  }

  #stickDown(e: PointerEvent): void {
    swallow(e);
    if (this.#stickPointer !== null) return;
    capture(this.#zone, e.pointerId);
    this.#stickPointer = e.pointerId;
    this.#stickSince = e.timeStamp;
    this.#stick.start(e.clientX, e.clientY);
    this.#drawStick();
  }

  #stickUp(e: PointerEvent, up: boolean): void {
    if (e.pointerId !== this.#stickPointer) return;
    swallow(e);
    const tap = up && this.#stick.still && e.timeStamp - this.#stickSince < TAP_MS;
    this.#stickPointer = null;
    this.#drawStick();
    if (tap) this.#onTap();
  }

  /** The ring and knob under the thumb while it steers; a faint ring at rest otherwise. */
  #drawStick(): void {
    const active = this.#stickPointer !== null;
    const bx = active ? this.#stick.baseX : this.#restX;
    const by = active ? this.#stick.baseY : this.#restY;
    const kx = active ? this.#stick.knobX : bx;
    const ky = active ? this.#stick.knobY : by;
    this.#base.style.left = `${bx - STICK_RADIUS}px`;
    this.#base.style.top = `${by - STICK_RADIUS}px`;
    this.#base.style.opacity = active ? '1' : '0.35';
    const half = Math.round(STICK_RADIUS * 0.45);
    this.#knob.style.left = `${kx - half}px`;
    this.#knob.style.top = `${ky - half}px`;
    this.#knob.style.opacity = active ? '1' : '0.35';
  }
}
