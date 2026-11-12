// The on-screen touch controls (logic in touch-input.ts): DOM elements over the canvas, so
// they sit in the bars beside the picture at the screen's own resolution. Pointer Events
// (https://www.w3.org/TR/pointerevents3/) track each finger by pointerId, so the stick and
// any number of buttons work at once. Each finger is captured by the element it landed on,
// and a button stays held until that finger lifts. Off play the menus swap the buttons for
// keys with their own icons (setKeys).

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
  type Lean,
  type TouchButton,
  type TouchKey,
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

function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const ICON_URLS = TOUCH_BUTTONS.map((id) => svgUrl(iconSvg(ICONS[id])));

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
  /** What each square holds and does now: the play buttons', or a menu key's. */
  #slotBits: number[] = TOUCH_BUTTONS.map((id) => TOUCH_BITS[id]);
  #slotAction: ((() => void) | null)[] = TOUCH_BUTTONS.map(() => null);
  /** The keys on show, as a string to compare: 'play' for the play buttons. */
  #keys = 'play';
  #stick = new FloatingStick();
  #stickPointer: number | null = null;
  #stickSince = 0;
  #held = 0;
  /** Bits pressed since the last frame read them, so a tap shorter than a frame still counts. */
  #latched = 0;
  #lean: Lean = { x: 0, y: 0 };
  /** Each finger on a button: the square, its bits, and the keys on show when it landed. */
  #buttonPointers = new Map<number, { slot: number; bits: number; keys: string }>();
  #touchScreen: boolean;
  #padConnected = false;
  #startScreen = true;
  #restX = 0;
  #restY = 0;
  readonly #canvas: HTMLElement;
  readonly #onTap: () => void;
  /** Called when the picture's place may change: a touch first seen, a gamepad in or out. */
  onPlacement: (() => void) | null = null;

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
        backgroundImage: ICON_URLS[TOUCH_BUTTONS.indexOf(id)]!,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: '58%',
        imageRendering: 'pixelated',
      });
      b.dataset['button'] = id;
      b.setAttribute('aria-label', id);
      const slot = this.#buttons.length;
      b.addEventListener('pointerdown', (e) => this.#press(e, slot, b));
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
          this.onPlacement?.();
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
    return this.visible ? this.#held | this.#latched | (this.#stickPointer === null ? 0 : this.#stick.bits) : 0;
  }

  /** Adds the stick's lean to `out`: how fast it steers the ship, while a thumb is on it. */
  addLean(out: Lean): void {
    if (!this.visible || this.#stickPointer === null) return;
    this.#stick.lean(this.#lean);
    out.x += this.#lean.x;
    out.y += this.#lean.y;
  }

  /** Called once a frame after its input is read: a tap that has lifted lets go now. */
  endFrame(): void {
    this.#latched = 0;
  }

  /**
   * True when the picture should sit at the top with the pad under it: a touch screen held
   * upright with no gamepad. Not tied to the start screen, so the picture doesn't jump.
   */
  get pictureTop(): boolean {
    return this.#touchScreen && !this.#padConnected && window.innerHeight > window.innerWidth;
  }

  /**
   * The buttons to show: null for the six play buttons, or labelled menu keys, each on its
   * square, with the other squares hidden. Called every frame; only a change touches the DOM.
   */
  setKeys(keys: readonly TouchKey[] | null): void {
    const sig = keys === null ? 'play' : keys.map((k) => `${k.slot}:${k.label}:${k.bits}`).join('|');
    if (keys) for (const k of keys) this.#slotAction[k.slot] = k.action ?? null;
    if (sig === this.#keys) return;
    this.#keys = sig;
    this.#buttons.forEach((b, i) => {
      const key = keys?.find((k) => k.slot === i);
      const s = b.style;
      if (keys === null) {
        this.#slotBits[i] = TOUCH_BITS[TOUCH_BUTTONS[i]!];
        this.#slotAction[i] = null;
        s.display = '';
        s.backgroundImage = ICON_URLS[i]!;
        b.setAttribute('aria-label', TOUCH_BUTTONS[i]!);
        delete b.dataset['label'];
      } else if (key) {
        this.#slotBits[i] = key.bits;
        s.display = '';
        s.backgroundImage = svgUrl(iconSvg(key.icon));
        b.setAttribute('aria-label', key.label);
        b.dataset['label'] = key.label;
      } else {
        this.#slotBits[i] = 0;
        this.#slotAction[i] = null;
        s.display = 'none';
      }
    });
  }

  get visible(): boolean {
    return touchVisible(this.#touchScreen, this.#padConnected, this.#startScreen);
  }

  setPadConnected(connected: boolean): void {
    if (connected === this.#padConnected) return;
    this.#padConnected = connected;
    this.#update();
    this.onPlacement?.();
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
    this.#latched = 0;
    this.#buttonPointers.clear();
    this.#stickPointer = null;
    for (const b of this.#buttons) b.style.backgroundColor = FACE;
    this.#drawStick();
  }

  #press(e: PointerEvent, slot: number, b: HTMLDivElement): void {
    swallow(e);
    capture(b, e.pointerId);
    const bits = this.#slotBits[slot]!;
    this.#buttonPointers.set(e.pointerId, { slot, bits, keys: this.#keys });
    this.#held |= bits;
    this.#latched |= bits;
    b.style.backgroundColor = FACE_HELD;
  }

  #lift(e: PointerEvent, b: HTMLDivElement): void {
    const press = this.#buttonPointers.get(e.pointerId);
    if (!press) return;
    swallow(e);
    this.#buttonPointers.delete(e.pointerId);
    let held = 0;
    for (const p of this.#buttonPointers.values()) held |= p.bits;
    this.#held = held;
    b.style.backgroundColor = FACE;
    // A key's action runs on a lift over the same keys it landed on, not a cancel.
    if (e.type === 'pointerup' && press.keys === this.#keys) this.#slotAction[press.slot]?.();
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
