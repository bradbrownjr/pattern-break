// The Keys screen, opened from Settings (docs/DEVELOPMENT.md, "Keys"): the device, a row
// per action with its three slots, Reset and Back, and a hint line at the foot. State is in
// KeysMenu (menu.ts) and the bindings (bindings.ts); this draws a view of them.

import { PLAYFIELD_WIDTH } from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { AMBER, CYAN, DIM_GREY, GREY, MAGENTA, WHITE } from '../render/palette.ts';
import { PixelText } from '../render/text.ts';
import { PAD_ACTIONS, SLOTS, isLockedSlot, keyLabel, padInputLabel, type PadAction, type Slots } from './bindings.ts';
import { keysRows, type KeysDevice, type KeysRow } from './menu.ts';

const CENTER = PLAYFIELD_WIDTH / 2;
const TOP = 30;
const ROW = 11;
/** The action rows start a little below the device row. */
const ACTIONS_TOP = TOP + 14;
const LABEL_X = 48;
const SLOT_X = 124;
const SLOT_W = 70;
const PAD_NAME_X = 214;
const PAD_NAME_CHARS = 27;
const HINT_Y = 203;

const ROW_LABELS: Record<KeysRow, string> = {
  device: 'Device',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  fire: 'Fire',
  bomb: 'Bomb',
  missile: 'Missile',
  nuke: 'Nuke',
  boost: 'Boost',
  pause: 'Pause',
  cancel: 'Cancel',
  replay: 'Replay',
  reset: 'Reset',
  back: 'Back',
};

export interface KeysView {
  device: KeysDevice;
  row: number;
  slot: number;
  /** The device's layout: the keys, or the shown pad's. */
  layout: Readonly<Record<string, Slots>>;
  /** The shown pad has the standard mapping, so its inputs have an Xbox pad's names. */
  standard: boolean;
  /** The shown pad's name, on the Pad page. */
  padName: string;
  /** Waiting for a key or button for the slot under the cursor; `blink` turns its "?" on and off. */
  waiting: boolean;
  blink: boolean;
  /** The hint line, and whether it's a warning. */
  hint: string;
  warn: boolean;
}

/** The y of row `i` (0 is the device). */
function rowY(rows: readonly KeysRow[], i: number): number {
  if (i === 0) return TOP;
  const item = rows[i]!;
  // Reset and Back sit a half row below the actions.
  const gap = item === 'reset' || item === 'back' ? 5 : 0;
  return ACTIONS_TOP + (i - 1) * ROW + gap;
}

export class KeysScreen {
  readonly container = new Container();
  #marker = new PixelText('>', AMBER);
  #labels: PixelText[] = [];
  #slots: PixelText[][] = [];
  #device = new PixelText('');
  #padName = new PixelText('', GREY);
  #highlight = new Sprite(Texture.WHITE);
  #hint = new PixelText('');

  constructor() {
    const shadow = new PixelText('Keys', MAGENTA, 2).place(CENTER + 1, 6 + 1, 'center');
    const heading = new PixelText('Keys', CYAN, 2).place(CENTER, 6, 'center');
    this.#highlight.tint = DIM_GREY;
    this.#highlight.width = SLOT_W - 4;
    this.#highlight.height = ROW;
    this.container.addChild(shadow, heading, this.#highlight, this.#marker, this.#device, this.#padName, this.#hint);
    // Enough rows for the longer page: the device, every pad action, Reset and Back.
    for (let i = 0; i < PAD_ACTIONS.length + 3; i++) {
      const label = new PixelText('');
      this.#labels.push(label);
      const slots = Array.from({ length: SLOTS }, () => new PixelText(''));
      this.#slots.push(slots);
      this.container.addChild(label, ...slots);
    }
  }

  update(view: KeysView): void {
    const rows = keysRows(view.device);
    this.#labels.forEach((label, i) => {
      const item = rows[i];
      label.visible = item !== undefined;
      for (const s of this.#slots[i]!) s.visible = false;
      if (item === undefined) return;
      const y = rowY(rows, i);
      const selected = i === view.row;
      label.text = ROW_LABELS[item];
      label.color = selected ? AMBER : GREY;
      label.place(LABEL_X, y);
      if (item === 'device' || item === 'reset' || item === 'back') return;
      this.#slots[i]!.forEach((text, slot) => this.#drawSlot(text, view, item, slot, y, selected && slot === view.slot));
    });
    const y = rowY(rows, view.row);
    this.#marker.place(LABEL_X - 10, y);
    const onSlot = view.row > 0 && rows[view.row] !== 'reset' && rows[view.row] !== 'back';
    this.#highlight.visible = onSlot;
    this.#highlight.position.set(SLOT_X + view.slot * SLOT_W - 3, y - 1);
    this.#device.text = `< ${view.device === 'keyboard' ? 'Keyboard' : 'Pad'} >`;
    this.#device.color = view.row === 0 ? WHITE : GREY;
    this.#device.place(SLOT_X - 12, TOP);
    this.#padName.visible = view.device === 'pad';
    this.#padName.text = view.padName.slice(0, PAD_NAME_CHARS);
    this.#padName.place(PAD_NAME_X, TOP);
    this.#hint.text = view.hint;
    this.#hint.color = view.warn ? MAGENTA : GREY;
    this.#hint.place(CENTER, HINT_Y, 'center');
  }

  #drawSlot(text: PixelText, view: KeysView, action: PadAction, slot: number, y: number, current: boolean): void {
    text.visible = true;
    text.place(SLOT_X + slot * SLOT_W, y);
    if (current && view.waiting) {
      text.text = view.blink ? '?' : '';
      text.color = AMBER;
      return;
    }
    const input = view.layout[action]?.[slot] ?? null;
    if (input === null) {
      text.text = '-';
      text.color = DIM_GREY;
      return;
    }
    text.text = view.device === 'keyboard' ? keyLabel(input) : padInputLabel(input, view.standard);
    text.color = isLockedSlot(action, slot, view.device) ? DIM_GREY : current ? WHITE : GREY;
  }
}
