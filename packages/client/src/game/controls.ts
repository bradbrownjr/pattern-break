// The controls screen, opened from the title menu or the pause menu (docs/DEVELOPMENT.md,
// "Playing it"). Three pages: the keyboard with each action's first key and its third
// (the arrows and Z, X, C, V by default: right hand flies), the keyboard with each second
// key and third (WASD and J, K, L, ;: left hand flies), and a standard gamepad (Brad,
// 2026-11-10: one keyboard page showed too many keys). Each is drawn from the bindings
// (bindings.ts) with its keys or buttons filled in their action's colour, over a legend of
// the actions. show() draws the page.

import { PLAYFIELD_WIDTH } from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { AMBER, BACKGROUND, CYAN, DIM_GREY, GREY, LED_LIT, MAGENTA, VIOLET, WHITE } from '../render/palette.ts';
import { mapTexture } from '../render/pixels.ts';
import { PixelText } from '../render/text.ts';
import {
  STANDARD_PROFILE,
  isLockedSlot,
  keyLabel,
  padInputLabel,
  padLayout,
  type Bindings,
  type KeyAction,
  type KeyBindings,
  type PadAction,
  type PadBindings,
} from './bindings.ts';
import { CONTROL_PAGES, type ControlPage } from './menu.ts';

const CENTER = PLAYFIELD_WIDTH / 2;
const RED = LED_LIT[LED_LIT.length - 1]!;
/** An unused key or button. */
const UNUSED = 0x161a28;

type Action = 'fly' | 'fire' | 'bomb' | 'missile' | 'nuke' | 'boost' | 'pause';
const DIRECTION_ACTIONS: readonly KeyAction[] = ['up', 'left', 'down', 'right'];

const ACTIONS: readonly { id: Action; label: string; color: number }[] = [
  { id: 'fly', label: 'Fly', color: WHITE },
  { id: 'fire', label: 'Fire', color: CYAN },
  { id: 'bomb', label: 'Bomb', color: AMBER },
  { id: 'missile', label: 'Missile', color: MAGENTA },
  { id: 'nuke', label: 'Nuke', color: RED },
  { id: 'boost', label: 'Boost', color: VIOLET },
  { id: 'pause', label: 'Pause', color: GREY },
];
const COLOR = Object.fromEntries(ACTIONS.map((a) => [a.id, a.color])) as Record<Action, number>;

/** The legend's action for a bound action; the directions are Fly. Pad-only actions have none. */
function legendAction(action: PadAction): Action | null {
  if (action === 'up' || action === 'down' || action === 'left' || action === 'right') return 'fly';
  if (action === 'cancel' || action === 'replay') return null;
  return action;
}

/** The slots a keyboard page shows: its own, and the third, which both pages share. */
function pageSlots(page: ControlPage): number[] {
  return page === 'wasd' ? [1, 2] : [0, 2];
}

/** The inputs of `actions` in `slots`, without repeats. */
function inputsOf<T extends string>(layout: Readonly<Record<T, (string | null)[]>>, actions: readonly T[], slots: readonly number[]): string[] {
  const out: string[] = [];
  for (const slot of slots) for (const a of actions) {
    const input = layout[a][slot];
    if (input && !out.includes(input)) out.push(input);
  }
  return out;
}

/**
 * Fly's keys on a keyboard page, short: "Arrows" for the four arrow keys, the four letters
 * run together ("WASD") when each is one character, else each key's name.
 */
function flyLegend(keys: Readonly<KeyBindings>, slot: number): string {
  const codes = DIRECTION_ACTIONS.map((a) => keys[a][slot] ?? null);
  if (codes.every((c, i) => c === `Arrow${['Up', 'Left', 'Down', 'Right'][i]!}`)) return 'Arrows';
  const labels = codes.map((c) => (c === null ? '-' : keyLabel(c)));
  return labels.every((l) => l.length === 1) ? labels.join('') : labels.join(' ');
}

/** A keyboard page's tab: Fly's keys when they read as a name, else the page's number. */
function keyboardTab(keys: Readonly<KeyBindings>, page: ControlPage): string {
  const fly = flyLegend(keys, pageSlots(page)[0]!);
  return fly.length <= 8 && !fly.includes('-') ? fly : page === 'arrows' ? 'Keys 1' : 'Keys 2';
}

/** Each action's keys on a keyboard page. */
function keyboardLegend(keys: Readonly<KeyBindings>, page: ControlPage): Record<Action, string> {
  const slots = pageSlots(page);
  const names = (actions: readonly KeyAction[]): string => inputsOf(keys, actions, slots).map(keyLabel).join(', ') || '-';
  const fly = [flyLegend(keys, slots[0]!), ...inputsOf(keys, DIRECTION_ACTIONS, [2]).map(keyLabel)].join(', ');
  return {
    fly,
    fire: names(['fire']),
    bomb: names(['bomb']),
    missile: names(['missile']),
    nuke: names(['nuke']),
    boost: names(['boost']),
    // Esc, in the locked first slot, pauses on both pages.
    pause: inputsOf(keys, ['pause'], [0, ...slots]).map(keyLabel).join(', '),
  };
}

/** Each action's inputs on a standard pad; the stick's four ways and the D-pad's are one name each. */
function padLegend(layout: Readonly<PadBindings>): Record<Action, string> {
  const name = (input: string): string => {
    if (/^b1[2-5]$/.test(input)) return 'D-pad';
    if (/^a[01][+-]$/.test(input)) return 'Stick';
    if (/^a[23][+-]$/.test(input)) return 'R stick';
    return padInputLabel(input, true);
  };
  const names = (actions: readonly PadAction[]): string =>
    [...new Set(inputsOf(layout, actions, [0, 1, 2]).map(name))].join(', ') || '-';
  return {
    fly: names(DIRECTION_ACTIONS),
    fire: names(['fire']),
    bomb: names(['bomb']),
    missile: names(['missile']),
    nuke: names(['nuke']),
    boost: names(['boost']),
    pause: names(['pause']),
  };
}

/** The legend colour of whatever `input` does in `layout`, or undefined. */
function inputAction<T extends PadAction>(layout: Readonly<Record<T, (string | null)[]>>, matches: (input: string) => boolean, slots: readonly number[] = [0, 1, 2]): Action | undefined {
  for (const a of Object.keys(layout) as T[]) {
    for (const slot of slots) {
      const input = layout[a][slot];
      if (input && matches(input)) return legendAction(a) ?? undefined;
    }
  }
  return undefined;
}

// Keyboard ---------------------------------------------------------------------------------

/** A key: its label, its width in key units, and its KeyboardEvent.code. */
type Key = readonly [label: string, width: number, code?: string];
const PUNCTUATION: Record<string, string> = {
  '`': 'Backquote',
  '-': 'Minus',
  '=': 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
};
const one = (labels: string): Key[] =>
  [...labels].map((c): Key => [c, 1, /[A-Z]/.test(c) ? `Key${c}` : /\d/.test(c) ? `Digit${c}` : PUNCTUATION[c]]);

/** A 60% keyboard: Esc, then five rows each 15 units wide. */
const KEY_ROWS: readonly (readonly Key[])[] = [
  [['Esc', 1.5, 'Escape']],
  [...one('`1234567890-='), ['', 2, 'Backspace']],
  [['Tab', 1.5, 'Tab'], ...one('QWERTYUIOP[]'), ['', 1.5, 'Backslash']],
  [['', 1.75, 'CapsLock'], ...one("ASDFGHJKL;'"), ['Enter', 2.25, 'Enter']],
  [['Shift', 2.25, 'ShiftLeft'], ...one('ZXCVBNM,./'), ['Shift', 2.75, 'ShiftRight']],
  [
    ['', 1.25, 'ControlLeft'],
    ['', 1.25, 'MetaLeft'],
    ['', 1.25, 'AltLeft'],
    ['Space', 6.25, 'Space'],
    ['', 1.25, 'AltRight'],
    ['', 1.25, 'MetaRight'],
    ['', 1.25, 'ContextMenu'],
    ['', 1.25, 'ControlRight'],
  ],
];
/** The arrow keys, right of the main block: label, column, row in key units, and code. */
const ARROW_KEYS: readonly [string, number, number, string][] = [
  ['^', 16.5, 4, 'ArrowUp'],
  ['<', 15.5, 5, 'ArrowLeft'],
  ['v', 16.5, 5, 'ArrowDown'],
  ['>', 17.5, 5, 'ArrowRight'],
];
const UNIT = 14;
const KEYBOARD_UNITS = 18.5;
const KEYBOARD_LEFT = Math.round(CENTER - (KEYBOARD_UNITS * UNIT) / 2);
const KEYBOARD_TOP = 36;
/** The Esc row stands apart from the rest, like a function row. */
const ESC_GAP = 4;

function rowY(row: number): number {
  return KEYBOARD_TOP + row * UNIT + (row > 0 ? ESC_GAP : 0);
}

function keycap(parent: Container, label: string, x0: number, x1: number, y: number, action: Action | undefined): void {
  const left = KEYBOARD_LEFT + Math.round(x0 * UNIT);
  const right = KEYBOARD_LEFT + Math.round(x1 * UNIT) - 1;
  const cap = new Sprite(Texture.WHITE);
  cap.tint = action ? COLOR[action] : UNUSED;
  cap.position.set(left, y);
  cap.width = right - left;
  cap.height = UNIT - 1;
  parent.addChild(cap);
  if (label) parent.addChild(new PixelText(label, action ? BACKGROUND : DIM_GREY).place(Math.round((left + right) / 2), y + 3, 'center'));
}

/** The keyboard with the keys in `page`'s slots lit, and Esc. */
function buildKeyboard(keys: Readonly<KeyBindings>, page: ControlPage): Container {
  const c = new Container();
  const slots = pageSlots(page);
  const actionOf = (code: string | undefined): Action | undefined =>
    code === undefined
      ? undefined
      : inputAction(keys, (k) => k === code, slots) ?? (code === keys.pause[0] && isLockedSlot('pause', 0, 'keyboard') ? 'pause' : undefined);
  KEY_ROWS.forEach((row, r) => {
    let x = 0;
    for (const [label, width, code] of row) {
      keycap(c, label, x, x + width, rowY(r), actionOf(code));
      x += width;
    }
  });
  for (const [label, col, row, code] of ARROW_KEYS) keycap(c, label, col, col + 1, rowY(row), actionOf(code));
  return c;
}

// Gamepad ----------------------------------------------------------------------------------

const PAD_WIDTH = 200;
const PAD_LEFT = Math.round(CENTER - PAD_WIDTH / 2);
const PAD_TOP = 34;
/** The body starts under the shoulder buttons. */
const BODY_TOP = PAD_TOP + 20;
const BODY_HEIGHT = 80;

/** A character map of `w` x `h` pixels: 'o' where `inside` is true at the edge, 'f' within. */
function shapeMap(w: number, h: number, inside: (x: number, y: number) => boolean): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) row += '.';
      else row += inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1) ? 'f' : 'o';
    }
    rows.push(row);
  }
  return rows;
}

function inCircle(x: number, y: number, cx: number, cy: number, r: number): boolean {
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - cy;
  return dx * dx + dy * dy <= r * r;
}

/** The pad's body: a rounded bar with a grip under each end. */
function inBody(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= PAD_WIDTH || y >= BODY_HEIGHT) return false;
  if (inCircle(x, y, 46, 54, 26) || inCircle(x, y, 154, 54, 26)) return true;
  const r = 18;
  const h = 64;
  if (y >= h) return false;
  const cx = x < r ? r : x >= PAD_WIDTH - r ? PAD_WIDTH - r : x + 0.5;
  const cy = y < r ? r : y >= h - r ? h - r : y + 0.5;
  return inCircle(x, y, cx, cy, r);
}

const disc = (d: number): string[] => shapeMap(d, d, (x, y) => inCircle(x, y, d / 2, d / 2, d / 2)).map((row) => row.replace(/o/g, 'f'));
const ring = (d: number): string[] => shapeMap(d, d, (x, y) => inCircle(x, y, d / 2, d / 2, d / 2)).map((row) => row.replace(/f/g, '.'));

let padTextures: { body: Texture; button: Texture; stick: Texture } | null = null;

function getPadTextures(): { body: Texture; button: Texture; stick: Texture } {
  padTextures ??= {
    body: mapTexture(shapeMap(PAD_WIDTH, BODY_HEIGHT, inBody), { o: DIM_GREY, f: UNUSED }, 'pad-body'),
    button: mapTexture(disc(11), { f: WHITE }, 'pad-button'),
    stick: mapTexture(ring(15), { o: WHITE }, 'pad-stick'),
  };
  return padTextures;
}

function placed(texture: Texture, cx: number, cy: number, tint: number): Sprite {
  const s = new Sprite(texture);
  s.tint = tint;
  s.position.set(Math.round(cx - texture.width / 2), Math.round(cy - texture.height / 2));
  return s;
}

function rect(x: number, y: number, w: number, h: number, tint: number): Sprite {
  const s = new Sprite(Texture.WHITE);
  s.tint = tint;
  s.position.set(x, y);
  s.width = w;
  s.height = h;
  return s;
}

/** A standard pad, each button in the colour of what it does in `layout`. */
function buildPad(layout: Readonly<PadBindings>): Container {
  const c = new Container();
  const tex = getPadTextures();
  const button = (i: number): Action | undefined => inputAction(layout, (input) => input === `b${i}`);
  const tint = (action: Action | undefined): number => (action ? COLOR[action] : DIM_GREY);
  // Shoulder buttons: triggers behind, bumpers in front.
  const shoulders: [string, number, number, number][] = [
    ['LT', 30, 0, 6],
    ['RT', PAD_WIDTH - 60, 0, 7],
    ['LB', 30, 10, 4],
    ['RB', PAD_WIDTH - 60, 10, 5],
  ];
  for (const [label, x, y, i] of shoulders) {
    c.addChild(rect(PAD_LEFT + x, PAD_TOP + y, 30, 9, tint(button(i))));
    c.addChild(new PixelText(label, BACKGROUND).place(PAD_LEFT + x + 15, PAD_TOP + y + 1, 'center'));
  }
  const body = new Sprite(tex.body);
  body.position.set(PAD_LEFT, BODY_TOP);
  c.addChild(body);
  const at = (x: number, y: number): [number, number] => [PAD_LEFT + x, BODY_TOP + y];
  // D-pad: each arm in its own button's colour.
  const [dx, dy] = at(50, 30);
  c.addChild(
    rect(dx - 3, dy - 10, 7, 8, tint(button(12))),
    rect(dx - 3, dy + 3, 7, 8, tint(button(13))),
    rect(dx - 10, dy - 3, 8, 7, tint(button(14))),
    rect(dx + 3, dy - 3, 8, 7, tint(button(15))),
    rect(dx - 2, dy - 2, 5, 5, tint(button(12) ?? button(13) ?? button(14) ?? button(15))),
  );
  // Sticks, in the colour of what their axes do (by default the left flies, the right does nothing).
  const stick = (axes: RegExp): number => tint(inputAction(layout, (input) => axes.test(input)));
  c.addChild(placed(tex.stick, ...at(78, 48), stick(/^a[01][+-]$/)), placed(tex.stick, ...at(122, 48), stick(/^a[23][+-]$/)));
  // Face buttons, in the standard mapping's places. Y does nothing in play by default (it
  // watches the replay on the end screens).
  const face: [string, number, number, number][] = [
    ['Y', 150, 18, 3],
    ['X', 138, 30, 2],
    ['B', 162, 30, 1],
    ['A', 150, 42, 0],
  ];
  for (const [label, x, y, i] of face) {
    const [cx, cy] = at(x, y);
    c.addChild(placed(tex.button, cx, cy, tint(button(i))));
    c.addChild(new PixelText(label, BACKGROUND).place(cx - 2, cy - 3));
  }
  // Select does nothing in play by default; Start pauses.
  const [sx, sy] = at(88, 24);
  const [tx, ty] = at(112, 24);
  c.addChild(rect(sx - 5, sy - 2, 11, 5, tint(button(8))), rect(tx - 5, ty - 2, 11, 5, tint(button(9))));
  c.addChild(new PixelText('Start', GREY).place(tx, ty + 6, 'center'));
  return c;
}

// The screen -------------------------------------------------------------------------------

const LEGEND_TOP = 140;
const LEGEND_ROW = 12;
const LEGEND_COLUMNS = [48, 204];
const LEGEND_KEYS_X = 60;
const TABS_Y = 196;

/** The legend's keys stop short of the next column. */
const LEGEND_CHARS = 16;

function buildLegend(legend: Record<Action, string>): Container {
  const c = new Container();
  ACTIONS.forEach((a, i) => {
    const x = LEGEND_COLUMNS[Math.floor(i / 4)]!;
    const y = LEGEND_TOP + (i % 4) * LEGEND_ROW;
    c.addChild(rect(x, y, 7, 7, a.color));
    c.addChild(new PixelText(a.label, GREY).place(x + 12, y));
    c.addChild(new PixelText(legend[a.id].slice(0, LEGEND_CHARS), WHITE).place(x + LEGEND_KEYS_X, y));
  });
  return c;
}

export class ControlsScreen {
  readonly container = new Container();
  #page = new Container();
  #tabs = new Container();

  constructor() {
    const shadow = new PixelText('Controls', MAGENTA, 2).place(CENTER + 1, 12 + 1, 'center');
    const heading = new PixelText('Controls', CYAN, 2).place(CENTER, 12, 'center');
    this.container.addChild(shadow, heading, this.#page, this.#tabs);
  }

  /** Draws `page` from `bindings`; the gamepad page shows the standard pads' layout. */
  show(page: ControlPage, bindings: Bindings): void {
    for (const child of this.#page.removeChildren()) child.destroy({ children: true });
    for (const child of this.#tabs.removeChildren()) child.destroy({ children: true });
    if (page === 'gamepad') {
      const layout = padLayout(bindings, STANDARD_PROFILE);
      this.#page.addChild(buildPad(layout), buildLegend(padLegend(layout)));
    } else {
      this.#page.addChild(buildKeyboard(bindings.keys, page), buildLegend(keyboardLegend(bindings.keys, page)));
    }
    // Tabs: "< Arrows  WASD  Gamepad >", centred, the page shown in cyan.
    const tabs = CONTROL_PAGES.map(
      (p) => new PixelText(p === 'gamepad' ? 'Gamepad' : keyboardTab(bindings.keys, p), p === page ? CYAN : DIM_GREY),
    );
    const gap = 16;
    const width = tabs.reduce((sum, t) => sum + t.textWidth, 0) + gap * (tabs.length - 1);
    let x = Math.round(CENTER - width / 2);
    for (const t of tabs) {
      t.place(x, TABS_Y);
      x += t.textWidth + gap;
    }
    const first = tabs[0]!;
    const last = tabs[tabs.length - 1]!;
    this.#tabs.addChild(
      new PixelText('<', DIM_GREY).place(first.x - 12, TABS_Y),
      ...tabs,
      new PixelText('>', DIM_GREY).place(last.x + last.textWidth + 6, TABS_Y),
    );
  }
}
