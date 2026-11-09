// The power-up meter along the bottom of the playfield, drawn as a row of VU meter LEDs
// (docs/PLAN.md, "Simulation"): one cell per upgrade, lit from the left up to the
// highlighted one, which the buy button buys. A cell shows how many of its upgrade the
// ship has (boost level, options, shield hits), dims its label when it can't be bought,
// and the boost cell shows the fuel left. Text changes only when the state does.

import {
  BOOST_FUEL_PER_LEVEL,
  BOOST_MAX_LEVEL,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
  POWER_UP_COUNT,
  PowerUp,
  canBuy,
  type SimState,
} from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { BACKGROUND, CYAN, DIM_GREY, GREY, LED_DIM, LED_LIT } from './palette.ts';
import { PixelText } from './text.ts';

const LABELS = ['Boost', 'Double', 'Laser', 'Missile', 'Option', 'Shield'] as const;
const CELL_HEIGHT = 11;
const CELL_GAP = 1;
const MARGIN = 3;
const CELL_WIDTH = Math.floor((PLAYFIELD_WIDTH - 2 * MARGIN - (POWER_UP_COUNT - 1) * CELL_GAP) / POWER_UP_COUNT);
const TOP = PLAYFIELD_HEIGHT - CELL_HEIGHT - MARGIN;
/** The LED colour of each cell, green at the left to red at the right. */
const LIT = Array.from({ length: POWER_UP_COUNT }, (_, i) => LED_LIT[Math.round((i * (LED_LIT.length - 1)) / (POWER_UP_COUNT - 1))]!);
const DIM = Array.from({ length: POWER_UP_COUNT }, (_, i) => LED_DIM[Math.round((i * (LED_DIM.length - 1)) / (POWER_UP_COUNT - 1))]!);

/** How many of upgrade `slot` the ship has, shown after its label, or 0 for none shown. */
function count(state: SimState, slot: number): number {
  switch (slot) {
    case PowerUp.boost:
      return state.boostLevel;
    case PowerUp.option:
      return state.options;
    case PowerUp.shield:
      return state.shieldHits;
    default:
      return 0;
  }
}

export class MeterView {
  readonly container = new Container();
  #cells: Sprite[] = [];
  #labels: PixelText[] = [];
  #fuel = new Sprite(Texture.WHITE);
  /** What each cell shows now: lit or not, the label's colour, and the count. -1 forces a redraw. */
  #lit: number[] = [];
  #color: number[] = [];
  #count: number[] = [];

  constructor() {
    const backing = new Sprite(Texture.WHITE);
    backing.tint = BACKGROUND;
    backing.position.set(MARGIN - 1, TOP - 1);
    backing.width = POWER_UP_COUNT * (CELL_WIDTH + CELL_GAP) + 1;
    backing.height = CELL_HEIGHT + 2;
    this.container.addChild(backing);
    for (let i = 0; i < POWER_UP_COUNT; i++) {
      const cell = new Sprite(Texture.WHITE);
      cell.position.set(MARGIN + i * (CELL_WIDTH + CELL_GAP), TOP);
      cell.width = CELL_WIDTH;
      cell.height = CELL_HEIGHT;
      const label = new PixelText(LABELS[i]!, GREY);
      this.container.addChild(cell, label);
      this.#cells.push(cell);
      this.#labels.push(label);
      this.#lit.push(-1);
      this.#color.push(-1);
      this.#count.push(-1);
    }
    this.#fuel.tint = CYAN;
    this.#fuel.height = 1;
    this.#fuel.position.set(MARGIN + 2, TOP + CELL_HEIGHT - 2);
    this.container.addChild(this.#fuel);
  }

  draw(state: SimState): void {
    for (let i = 0; i < POWER_UP_COUNT; i++) {
      const lit = i <= state.meter ? 1 : 0;
      if (lit !== this.#lit[i]) {
        this.#lit[i] = lit;
        this.#cells[i]!.tint = lit ? LIT[i]! : DIM[i]!;
      }
      const label = this.#labels[i]!;
      const n = count(state, i);
      if (n !== this.#count[i]) {
        this.#count[i] = n;
        label.text = n > 0 ? `${LABELS[i]} ${n}` : LABELS[i]!;
        label.place(MARGIN + i * (CELL_WIDTH + CELL_GAP) + CELL_WIDTH / 2, TOP + 2, 'center');
      }
      // Dark on a lit cell; dim grey when it can't be bought.
      const color = lit ? BACKGROUND : canBuy(state, i) ? GREY : DIM_GREY;
      if (color !== this.#color[i]) {
        this.#color[i] = color;
        label.color = color;
      }
    }
    this.#fuel.visible = state.boostLevel > 0;
    this.#fuel.width = Math.floor(((CELL_WIDTH - 4) * state.boostFuel) / (BOOST_MAX_LEVEL * BOOST_FUEL_PER_LEVEL));
  }

  /** Forces every cell to redraw on the next draw. */
  reset(): void {
    this.#lit.fill(-1);
    this.#color.fill(-1);
    this.#count.fill(-1);
  }
}
