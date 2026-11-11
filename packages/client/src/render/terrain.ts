// The LED terrain: a ceiling and a floor bar per row of the song, drawn as segmented LED
// meters (docs/DEVELOPMENT.md, "Level and sim"). Every sprite is made once. The container
// is a Pixi render group that holds the bars at their world x, and scrolling moves the group
// alone; a column of sprites is repainted only when it takes the next bar coming on screen
// (column = bar mod MAX_VISIBLE_BARS). A segment that isn't drawn has alpha 0, not
// visible false: a visibility change makes Pixi rebuild the group's draw list
// (docs/DEVELOPMENT.md, "Performance"). Walls that blasts broke are drawn as the run has
// them, with rubble where segments went, and falling blocks of ceiling drop in the same
// group (Brad, 2026-11-11).

import {
  BAR_LIT_WIDTH,
  BAR_PITCH,
  BLOCK_SLOTS,
  Q8,
  SAMPLE_RATE,
  SAMPLES_PER_TICK,
  SEGMENT_LIT_HEIGHT,
  SEGMENT_PITCH,
  type Level,
  type SimState,
} from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { Explosion, type ExplosionStyle } from './effects.ts';
import { LED_CIVIDIS, LED_LIT, LED_RED, WHITE } from './palette.ts';
import { seededRandom } from './random.ts';
import {
  MAX_VISIBLE_BARS,
  SEGMENTS_PER_SIDE,
  SEGMENT_HIDDEN,
  ceilingSegmentY,
  floorSegmentY,
  segmentColorIndex,
  segmentState,
  visibleBars,
  type BarRange,
} from './terrain-layout.ts';

/** Rubble bursts that can show at once; the oldest is reused. */
const RUBBLE = 8;
const RUBBLE_STYLE: ExplosionStyle = { particles: 14, ms: 450, colors: [WHITE], speed: 90 };

class BarColumn {
  readonly ceiling: Sprite[] = [];
  readonly floor: Sprite[] = [];
  /** The bar this column shows, or -1 for none, and the lit segments it shows a side. */
  bar = -1;
  c = 0;
  f = 0;

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
  s.tint = lit[segmentColorIndex(k)]!;
}

export class TerrainView {
  readonly container = new Container({ isRenderGroup: true });
  /**
   * Rubble, in world space like the bars but a render group of its own: its particles come
   * and go, and the bars' group would rebuild its draw list on each change.
   */
  readonly rubbleLayer = new Container({ isRenderGroup: true });
  /**
   * Falling blocks: a render group of its own with a container per slot, shown only while
   * its block falls. A sprite at alpha 0 stays in its group's draw list (see "Performance"),
   * so hidden blocks in the bars' group would cost every frame.
   */
  readonly blockLayer = new Container({ isRenderGroup: true });
  #columns: BarColumn[] = [];
  #level: Level | null = null;
  /**
   * The lit colours: the neon green to red, on Impossible all red (LED_RED), and with the
   * LED colours setting on Colour-blind, cividis (LED_CIVIDIS) everywhere.
   */
  #lit: readonly number[] = LED_LIT;
  #colourBlind = false;
  #range: BarRange = { first: 0, end: 0 };
  /** Falling blocks: a container per slot of SEGMENTS_PER_SIDE sprites, and what each shows (bar * 64 + first, or -1). */
  #blockSlots: Container[] = [];
  #blocks: Sprite[] = [];
  #blockShown = new Int32Array(BLOCK_SLOTS).fill(-1);
  /** Each block slot's end tick last seen, so a new one shatters into rubble once. */
  #blockEnds = new Int32Array(BLOCK_SLOTS);
  #rubble: Explosion[] = [];
  #rubbleSample: number[] = [];
  #nextRubble = 0;

  constructor() {
    for (let i = 0; i < MAX_VISIBLE_BARS; i++) this.#columns.push(new BarColumn(this.container));
    for (let b = 0; b < BLOCK_SLOTS; b++) {
      const slot = new Container();
      slot.visible = false;
      for (let j = 0; j < SEGMENTS_PER_SIDE; j++) {
        const s = segment(slot, j * SEGMENT_PITCH);
        s.alpha = 1;
        this.#blocks.push(s);
      }
      this.#blockSlots.push(slot);
      this.blockLayer.addChild(slot);
    }
    for (let i = 0; i < RUBBLE; i++) {
      const burst = new Explosion(RUBBLE_STYLE);
      this.#rubble.push(burst);
      burst.hide();
      this.#rubbleSample.push(-1);
      this.rubbleLayer.addChild(burst.container);
    }
    this.container.visible = false;
    this.rubbleLayer.visible = false;
    this.blockLayer.visible = false;
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
    // Blocks take the new colours when next drawn.
    this.#blockShown.fill(-1);
  }

  setLevel(level: Level | null): void {
    this.#level = level;
    this.#pickLit();
    this.container.visible = level !== null;
    this.rubbleLayer.visible = level !== null;
    this.blockLayer.visible = level !== null;
    this.#blockEnds.fill(0);
    this.#blockShown.fill(-1);
    for (const slot of this.#blockSlots) slot.visible = false;
    for (let r = 0; r < RUBBLE; r++) {
      this.#rubble[r]!.hide();
      this.#rubbleSample[r] = -1;
    }
  }

  /**
   * Draws the bars on screen with the screen's left edge at world x `scrollPx`: the walls
   * as `state` has them (the level's without one), its falling blocks, and rubble where
   * walls broke or blocks shattered, at song sample `displaySamples`.
   */
  draw(scrollPx: number, state: SimState | null = null, displaySamples = 0): void {
    const level = this.#level;
    if (!level) return;
    // One rounding for the whole frame, so bars never shift relative to each other.
    const offset = Math.round(scrollPx);
    this.container.x = -offset;
    this.rubbleLayer.x = -offset;
    this.blockLayer.x = -offset;
    const { first, end } = visibleBars(level, offset, this.#range);
    const columns = this.#columns;
    const walls = state !== null && state.ceiling.length === level.barCount ? state : level;
    for (let i = first; i < end; i++) {
      const column = columns[i % columns.length]!;
      const c = walls.ceiling[i]!;
      const f = walls.floor[i]!;
      if (column.bar === i && column.c === c && column.f === f) continue;
      const x = i * BAR_PITCH;
      if (column.bar === i) {
        // Broken: rubble where the segments were.
        if (c < column.c) this.#breakRubble(x, ceilingSegmentY(c), ceilingSegmentY(column.c - 1) + SEGMENT_LIT_HEIGHT, c, displaySamples);
        if (f < column.f) this.#breakRubble(x, floorSegmentY(column.f - 1), floorSegmentY(f) + SEGMENT_LIT_HEIGHT, f, displaySamples);
      }
      column.bar = i;
      column.c = c;
      column.f = f;
      for (let k = 0; k < SEGMENTS_PER_SIDE; k++) {
        place(column.ceiling[k]!, x, segmentState(c, k), k, this.#lit);
        place(column.floor[k]!, x, segmentState(f, k), k, this.#lit);
      }
    }
    if (state) this.#drawBlocks(state);
    for (let r = 0; r < RUBBLE; r++) {
      const at = this.#rubbleSample[r]!;
      if (at < 0) continue;
      const ms = ((displaySamples - at) * 1000) / SAMPLE_RATE;
      if (ms > RUBBLE_STYLE.ms) {
        this.#rubble[r]!.hide();
        this.#rubbleSample[r] = -1;
      } else this.#rubble[r]!.draw(Math.max(0, ms));
    }
  }

  /** Rubble between y0 and y1 (world px) at bar x `x`, in the colour of segment k. */
  #breakRubble(x: number, y0: number, y1: number, k: number, atSample: number): void {
    const r = this.#nextRubble;
    this.#nextRubble = (r + 1) % RUBBLE;
    const lit = this.#lit[segmentColorIndex(k)]!;
    this.#rubble[r]!.start(x + BAR_LIT_WIDTH / 2, (y0 + y1) / 2, seededRandom(x * 31 + y0), [lit, lit, WHITE]);
    this.#rubbleSample[r] = atSample;
  }

  #drawBlocks(state: SimState): void {
    for (let b = 0; b < BLOCK_SLOTS; b++) {
      const slot = this.#blockSlots[b]!;
      const x = state.blockBar[b]! * BAR_PITCH;
      const top = Math.round(state.blockY[b]! / Q8);
      // Set up once per block: which segments show, and their colours.
      const shows = state.blockActive[b] ? state.blockBar[b]! * 64 + state.blockFirst[b]! : -1;
      if (shows !== this.#blockShown[b]) {
        this.#blockShown[b] = shows;
        slot.visible = shows >= 0;
        if (shows >= 0) {
          const base = b * SEGMENTS_PER_SIDE;
          for (let j = 0; j < SEGMENTS_PER_SIDE; j++) {
            const s = this.#blocks[base + j]!;
            s.visible = j < state.blockSegments[b]!;
            if (s.visible) s.tint = this.#lit[segmentColorIndex(state.blockFirst[b]! + j)]!;
          }
        }
      }
      if (shows >= 0) slot.position.set(x, top);
      // A block that shattered since the last look: rubble at its foot.
      const ended = state.blockEndTick[b]!;
      if (ended !== this.#blockEnds[b] && ended > 0) {
        const height = state.blockSegments[b]! * SEGMENT_PITCH;
        this.#breakRubble(x, top + height - SEGMENT_PITCH, top + height, state.blockFirst[b]!, ended * SAMPLES_PER_TICK);
      }
      this.#blockEnds[b] = ended;
    }
  }
}
