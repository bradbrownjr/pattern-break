// The controls screen, opened from the title menu or the pause menu (docs/DEVELOPMENT.md,
// "Playing it"). Three pages: the keyboard with the arrows and Z, X, C, V (right hand
// flies), the keyboard with WASD and J, K, L, ; (left hand flies), and a gamepad (Brad,
// 2026-11-10: one keyboard page showed too many keys). Each is drawn with its keys or
// buttons filled in their action's colour, over a legend of the actions. Built once;
// show() picks the page.

import { PLAYFIELD_WIDTH } from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { AMBER, BACKGROUND, CYAN, DIM_GREY, GREY, LED_LIT, MAGENTA, VIOLET, WHITE } from '../render/palette.ts';
import { mapTexture } from '../render/pixels.ts';
import { PixelText } from '../render/text.ts';
import { CONTROL_PAGES, type ControlPage } from './menu.ts';

const CENTER = PLAYFIELD_WIDTH / 2;
const RED = LED_LIT[LED_LIT.length - 1]!;
/** An unused key or button. */
const UNUSED = 0x161a28;

type Action = 'fly' | 'fire' | 'bomb' | 'missile' | 'nuke' | 'boost' | 'pause';
/** The two keyboard pages. */
type Layout = 'arrows' | 'wasd';

const ACTIONS: readonly { id: Action; label: string; color: number; legend: Record<ControlPage, string> }[] = [
  { id: 'fly', label: 'Fly', color: WHITE, legend: { arrows: 'Arrows', wasd: 'WASD', gamepad: 'Stick, D-pad' } },
  { id: 'fire', label: 'Fire', color: CYAN, legend: { arrows: 'Z, Space', wasd: 'J, Space', gamepad: 'A, RT' } },
  { id: 'bomb', label: 'Bomb', color: AMBER, legend: { arrows: 'X', wasd: 'K', gamepad: 'B' } },
  { id: 'missile', label: 'Missile', color: MAGENTA, legend: { arrows: 'C', wasd: 'L', gamepad: 'RB' } },
  { id: 'nuke', label: 'Nuke', color: RED, legend: { arrows: 'V', wasd: ';', gamepad: 'X' } },
  { id: 'boost', label: 'Boost', color: VIOLET, legend: { arrows: 'Shift', wasd: "'", gamepad: 'LB, LT' } },
  { id: 'pause', label: 'Pause', color: GREY, legend: { arrows: 'Esc', wasd: 'Esc', gamepad: 'Start' } },
];
/** Each page's tab. */
const TAB_LABELS: Record<ControlPage, string> = { arrows: 'Arrows', wasd: 'WASD', gamepad: 'Gamepad' };
const COLOR = Object.fromEntries(ACTIONS.map((a) => [a.id, a.color])) as Record<Action, number>;

// Keyboard ---------------------------------------------------------------------------------

/**
 * A key: its label, its width in key units, the action it does in play, and the page that
 * lights it (both pages if none).
 */
type Key = readonly [label: string, width: number, action?: Action, layout?: Layout];
const one = (labels: string): Key[] => [...labels].map((c): Key => [c, 1]);

/** A 60% keyboard: Esc, then five rows each 15 units wide. */
const KEY_ROWS: readonly (readonly Key[])[] = [
  [['Esc', 1.5, 'pause']],
  [...one('`1234567890-='), ['', 2]],
  [['Tab', 1.5], ['Q', 1], ['W', 1, 'fly', 'wasd'], ...one('ERTYUIOP[]'), ['', 1.5]],
  [
    ['', 1.75],
    ['A', 1, 'fly', 'wasd'],
    ['S', 1, 'fly', 'wasd'],
    ['D', 1, 'fly', 'wasd'],
    ['F', 1],
    ['G', 1],
    ['H', 1],
    ['J', 1, 'fire', 'wasd'],
    ['K', 1, 'bomb', 'wasd'],
    ['L', 1, 'missile', 'wasd'],
    [';', 1, 'nuke', 'wasd'],
    ["'", 1, 'boost', 'wasd'],
    ['Enter', 2.25],
  ],
  [
    ['Shift', 2.25, 'boost', 'arrows'],
    ['Z', 1, 'fire', 'arrows'],
    ['X', 1, 'bomb', 'arrows'],
    ['C', 1, 'missile', 'arrows'],
    ['V', 1, 'nuke', 'arrows'],
    ...one('BNM,./'),
    ['Shift', 2.75],
  ],
  [['', 1.25], ['', 1.25], ['', 1.25], ['Space', 6.25, 'fire'], ['', 1.25], ['', 1.25], ['', 1.25], ['', 1.25]],
];
/** The arrow keys, right of the main block: label, column and row in key units. */
const ARROW_KEYS: readonly [string, number, number][] = [
  ['^', 16.5, 4],
  ['<', 15.5, 5],
  ['v', 16.5, 5],
  ['>', 17.5, 5],
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

/** The keyboard with only `layout`'s keys lit. */
function buildKeyboard(layout: Layout): Container {
  const c = new Container();
  KEY_ROWS.forEach((row, r) => {
    let x = 0;
    for (const [label, width, action, only] of row) {
      keycap(c, label, x, x + width, rowY(r), only === undefined || only === layout ? action : undefined);
      x += width;
    }
  });
  for (const [label, col, row] of ARROW_KEYS) keycap(c, label, col, col + 1, rowY(row), layout === 'arrows' ? 'fly' : undefined);
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

function buildPad(): Container {
  const c = new Container();
  const tex = getPadTextures();
  // Shoulder buttons: triggers behind, bumpers in front.
  const shoulders: [string, number, number, Action][] = [
    ['LT', 30, 0, 'boost'],
    ['RT', PAD_WIDTH - 60, 0, 'fire'],
    ['LB', 30, 10, 'boost'],
    ['RB', PAD_WIDTH - 60, 10, 'missile'],
  ];
  for (const [label, x, y, action] of shoulders) {
    c.addChild(rect(PAD_LEFT + x, PAD_TOP + y, 30, 9, COLOR[action]));
    c.addChild(new PixelText(label, BACKGROUND).place(PAD_LEFT + x + 15, PAD_TOP + y + 1, 'center'));
  }
  const body = new Sprite(tex.body);
  body.position.set(PAD_LEFT, BODY_TOP);
  c.addChild(body);
  const at = (x: number, y: number): [number, number] => [PAD_LEFT + x, BODY_TOP + y];
  // D-pad.
  const [dx, dy] = at(50, 30);
  c.addChild(rect(dx - 10, dy - 3, 21, 7, COLOR.fly), rect(dx - 3, dy - 10, 7, 21, COLOR.fly));
  // Sticks: the left flies, the right does nothing.
  c.addChild(placed(tex.stick, ...at(78, 48), COLOR.fly), placed(tex.stick, ...at(122, 48), DIM_GREY));
  // Face buttons, in the standard mapping's places.
  // Y does nothing in play (it watches the replay on the end screens).
  const face: [string, number, number, Action | undefined][] = [
    ['Y', 150, 18, undefined],
    ['X', 138, 30, 'nuke'],
    ['B', 162, 30, 'bomb'],
    ['A', 150, 42, 'fire'],
  ];
  for (const [label, x, y, action] of face) {
    const [cx, cy] = at(x, y);
    c.addChild(placed(tex.button, cx, cy, action ? COLOR[action] : DIM_GREY));
    c.addChild(new PixelText(label, BACKGROUND).place(cx - 2, cy - 3));
  }
  // Select does nothing in play; Start pauses.
  const [sx, sy] = at(88, 24);
  const [tx, ty] = at(112, 24);
  c.addChild(rect(sx - 5, sy - 2, 11, 5, DIM_GREY), rect(tx - 5, ty - 2, 11, 5, COLOR.pause));
  c.addChild(new PixelText('Start', GREY).place(tx, ty + 6, 'center'));
  return c;
}

// The screen -------------------------------------------------------------------------------

const LEGEND_TOP = 140;
const LEGEND_ROW = 12;
const LEGEND_COLUMNS = [48, 204];
const LEGEND_KEYS_X = 60;
const TABS_Y = 196;

function buildLegend(page: ControlPage): Container {
  const c = new Container();
  ACTIONS.forEach((a, i) => {
    const x = LEGEND_COLUMNS[Math.floor(i / 4)]!;
    const y = LEGEND_TOP + (i % 4) * LEGEND_ROW;
    c.addChild(rect(x, y, 7, 7, a.color));
    c.addChild(new PixelText(a.label, GREY).place(x + 12, y));
    c.addChild(new PixelText(a.legend[page], WHITE).place(x + LEGEND_KEYS_X, y));
  });
  return c;
}

export class ControlsScreen {
  readonly container = new Container();
  #pages: Container[] = [];
  #tabs: PixelText[] = [];

  constructor() {
    const shadow = new PixelText('Controls', MAGENTA, 2).place(CENTER + 1, 12 + 1, 'center');
    const heading = new PixelText('Controls', CYAN, 2).place(CENTER, 12, 'center');
    this.container.addChild(shadow, heading);
    for (const page of CONTROL_PAGES) {
      const c = new Container();
      c.addChild(page === 'gamepad' ? buildPad() : buildKeyboard(page), buildLegend(page));
      this.#pages.push(c);
      this.container.addChild(c);
    }
    // Tabs: "< Arrows  WASD  Gamepad >", centred, the page shown in cyan.
    const tabs = CONTROL_PAGES.map((page) => new PixelText(TAB_LABELS[page]));
    const gap = 16;
    const width = tabs.reduce((sum, t) => sum + t.textWidth, 0) + gap * (tabs.length - 1);
    let x = Math.round(CENTER - width / 2);
    for (const t of tabs) {
      t.place(x, TABS_Y);
      x += t.textWidth + gap;
    }
    this.#tabs.push(...tabs);
    const first = tabs[0]!;
    const last = tabs[tabs.length - 1]!;
    this.container.addChild(
      new PixelText('<', DIM_GREY).place(first.x - 12, TABS_Y),
      ...tabs,
      new PixelText('>', DIM_GREY).place(last.x + last.textWidth + 6, TABS_Y),
    );
  }

  show(page: ControlPage): void {
    const index = CONTROL_PAGES.indexOf(page);
    this.#pages.forEach((p, i) => (p.visible = i === index));
    this.#tabs.forEach((t, i) => (t.color = i === index ? CYAN : DIM_GREY));
  }
}
