// The sim side of the frame loop: from the song clock to sim ticks. Pure, so Node tests
// cover it. docs/DEVELOPMENT.md, "Renderer and game loop", describes how it is used.

import { SAMPLES_PER_TICK, tick, type Level, type SimState } from '@game/core';

/** The tick the sim should have reached at song sample `samples`: floor(samples / 400), within [0, tickCount]. */
export function targetTick(samples: number, tickCount: number): number {
  if (!(samples > 0)) return 0;
  const t = Math.floor(samples / SAMPLES_PER_TICK);
  return t > tickCount ? tickCount : t;
}

/** The input bytes of one run, one per tick, in a buffer sized for the whole song. */
export class InputLog {
  readonly inputs: Uint16Array;
  length = 0;

  constructor(tickCount: number) {
    this.inputs = new Uint16Array(tickCount);
  }

  reset(): void {
    this.length = 0;
  }

  push(input: number): void {
    if (this.length < this.inputs.length) this.inputs[this.length++] = input;
  }

  /** A copy of the recorded ticks. */
  toArray(): Uint16Array {
    return this.inputs.slice(0, this.length);
  }
}

/**
 * Runs ticks until `state` reaches `target`, the ship dies, or the song ends, never
 * skipping one. `nextInput` is called once per tick, in order, and each input is recorded
 * in `log`. Returns the number of ticks run.
 */
export function catchUp(
  level: Level,
  state: SimState,
  target: number,
  nextInput: (tick: number) => number,
  log: InputLog | null,
): number {
  let ran = 0;
  while (state.tick < target && !state.dead && !state.finished) {
    const input = nextInput(state.tick);
    log?.push(input);
    tick(level, state, input);
    ran++;
  }
  return ran;
}

/**
 * The song position the renderer draws, in samples. AudioContext.currentTime moves in
 * steps of one audio callback (8 to 11 ms in Chromium), so a frame can see the clock jump or
 * stand still. This follows the clock by predicting from the frame time and easing towards
 * each new reading, and snaps when they are far apart (a start, a pause, a hitch). The
 * result stays within LEAD_TICKS ahead of and LAG_TICKS behind the tick the sim is at, so
 * the terrain is never drawn more than 25 ms from where the sim tests collision. Cosmetic
 * only.
 */
export class DisplayClock {
  #samples = 0;
  #lastMs = Number.NaN;
  /** Fraction of the gap to the clock closed per frame. */
  static readonly EASE = 0.15;
  /** Snap when prediction and clock differ by more than this: 50 ms of song. */
  static readonly SNAP_SAMPLES = 2400;
  static readonly LEAD_TICKS = 3;
  static readonly LAG_TICKS = 2;

  reset(): void {
    this.#lastMs = Number.NaN;
    this.#samples = 0;
  }

  /**
   * `nowMs` is the frame time, `clockSamples` the song clock read this frame, and
   * `simTick` the tick the sim reached. Returns the samples to draw.
   */
  update(nowMs: number, clockSamples: number, simTick: number, sampleRate = 48_000): number {
    let predicted = clockSamples;
    if (!Number.isNaN(this.#lastMs)) {
      predicted = this.#samples + ((nowMs - this.#lastMs) * sampleRate) / 1000;
      const gap = clockSamples - predicted;
      if (gap > DisplayClock.SNAP_SAMPLES || gap < -DisplayClock.SNAP_SAMPLES) predicted = clockSamples;
      else predicted += gap * DisplayClock.EASE;
    }
    this.#lastMs = nowMs;
    const lo = (simTick - DisplayClock.LAG_TICKS) * SAMPLES_PER_TICK;
    const hi = (simTick + DisplayClock.LEAD_TICKS) * SAMPLES_PER_TICK;
    this.#samples = predicted < lo ? lo : predicted > hi ? hi : predicted;
    return this.#samples;
  }
}
