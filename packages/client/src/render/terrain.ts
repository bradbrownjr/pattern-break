// The LED terrain: a ceiling and a floor bar per row of the song, drawn as segmented LED
// meters (docs/DEVELOPMENT.md, "Level and sim"). Every sprite is made once. The container
// is a Pixi render group that holds the bars at their world x, and scrolling moves the group
// alone; a column of sprites is repainted only when it takes the next bar coming on screen
// (column = bar mod MAX_VISIBLE_BARS). A segment that isn't drawn has alpha 0, not
// visible false: a visibility change makes Pixi rebuild the group's draw list
// (docs/DEVELOPMENT.md, "Performance").

import { BAR_LIT_WIDTH, BAR_PITCH, Difficulty, SEGMENT_LIT_HEIGHT, type Level } from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { LED_CIVIDIS, LED_LIT, LED_PEAK, LED_RED } from './palette.ts';
import {
  MAX_VISIBLE_BARS,
  SEGMENTS_PER_SIDE,
  SEGMENT_HIDDEN,
  SEGMENT_LIT,
  ceilingSegmentY,
  floorSegmentY,
  segmentColorIndex,
  segmentState,
  visibleBars,
  type BarRange,
} from './terrain-layout.ts';

class BarColumn {
  readonly ceiling: Sprite[] = [];
  readonly floor: Sprite[] = [];
  /** The bar this column shows, or -1 for none. */
  bar = -1;

  constructor(parent: Container) {
    for (let k = 0; k < SEGMENTS_PER_SIDE; k++) {
      this.ceiling.push(segment(parent, ceilingSegmentY(k)));
      this.floor.push(segment(parent, floorSegmentY(k)));
    }
  }

  clear(): void {
    this.bar = -1;
    for (let k = 0; k < SEGMENTS_PER_SIDE; k++) {
      this.ceiling[k]!.alpha = 0;
      this.floor[k]!.alpha = 0;
    }
  }
}

function segment(parent: Container, y: number): Sprite {
  const s = new Sprite(Texture.WHITE);
  s.width = BAR_LIT_WIDTH;
  s.height = SEGMENT_LIT_HEIGHT;
  s.y = y;
  s.alpha = 0;
  parent.addChild(s);
  return s;
}

/** Shows segment `s` (segment k of its side) at world x in `state`, lit from `lit`, or hides it. */
function place(s: Sprite, x: number, state: number, k: number, lit: readonly number[]): void {
  s.x = x;
  if (state === SEGMENT_HIDDEN) {
    s.alpha = 0;
    return;
  }
  s.alpha = 1;
  s.tint = state === SEGMENT_LIT ? lit[segmentColorIndex(k)]! : LED_PEAK;
}

export class TerrainView {
  readonly container = new Container({ isRenderGroup: true });
  #columns: BarColumn[] = [];
  #level: Level | null = null;
  #showPeaks = false;
  /**
   * The lit colours: the neon green to red, on Impossible all red (LED_RED), and with the
   * LED colours setting on Colour-blind, cividis (LED_CIVIDIS) everywhere.
   */
  #lit: readonly number[] = LED_LIT;
  #colourBlind = false;
  #range: BarRange = { first: 0, end: 0 };

  constructor() {
    for (let i = 0; i < MAX_VISIBLE_BARS; i++) this.#columns.push(new BarColumn(this.container));
    this.container.visible = false;
  }

  /** The lit colours in use, by segment colour index. */
  get lit(): readonly number[] {
    return this.#lit;
  }

  /** The LED colours setting: true for Colour-blind. */
  setColourBlind(on: boolean): void {
    this.#colourBlind = on;
    this.#pickLit();
  }

  #pickLit(): void {
    this.#lit = this.#colourBlind ? LED_CIVIDIS : this.#level?.difficulty === 'impossible' ? LED_RED : LED_LIT;
    for (const c of this.#columns) c.clear();
  }

  setLevel(level: Level | null): void {
    this.#level = level;
    // Peak dots are drawn only where they are solid: a dot the ship could fly through
    // would look like terrain.
    this.#showPeaks = level !== null && Difficulty[level.difficulty].solidPeaks;
    this.#pickLit();
    this.container.visible = level !== null;
  }

  /** Draws the bars on screen with the screen's left edge at world x `scrollPx`. */
  draw(scrollPx: number): void {
    const level = this.#level;
    if (!level) return;
    // One rounding for the whole frame, so bars never shift relative to each other.
    const offset = Math.round(scrollPx);
    this.container.x = -offset;
    const { first, end } = visibleBars(level, offset, this.#range);
    const columns = this.#columns;
    for (let i = first; i < end; i++) {
      const column = columns[i % columns.length]!;
      if (column.bar === i) continue;
      column.bar = i;
      const x = i * BAR_PITCH;
      const c = level.ceiling[i]!;
      const f = level.floor[i]!;
      // A peak equal to the level draws no dot.
      const cp = this.#showPeaks ? level.ceilingPeak[i]! : c;
      const fp = this.#showPeaks ? level.floorPeak[i]! : f;
      for (let k = 0; k < SEGMENTS_PER_SIDE; k++) {
        place(column.ceiling[k]!, x, segmentState(c, cp, k), k, this.#lit);
        place(column.floor[k]!, x, segmentState(f, fp, k), k, this.#lit);
      }
    }
  }
}
