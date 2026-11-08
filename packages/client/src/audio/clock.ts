// The song clock (docs/PLAN.md, "Audio and timing"):
//
//   songTime = (audioContext.currentTime - startTime) - outputLatency + userOffset
//
// startTime is the context time of the song's first frame: the start of the render quantum
// in which the worklet rendered it, reported by the worklet as a context frame. It is not
// the moment start() was called; the worklet starts at the next quantum after the message
// arrives. That frame comes out of the speakers outputLatency seconds later, so the formula
// gives the song position being heard now. userOffset is the user's correction for latency
// the browser doesn't report (Bluetooth headphones, for example).
//
// The arithmetic is done in whole 48 kHz frames, so the result doesn't depend on float
// rounding: currentTime becomes a context frame (it advances in whole frames), and the
// latency and offset are rounded to frames. player.ts feeds the class the context's numbers.

import { SAMPLE_RATE } from '@game/core';

export type ClockState = 'stopped' | 'starting' | 'running' | 'paused';

const toFrames = (seconds: number): number => Math.round(seconds * SAMPLE_RATE);

export class SongClock {
  /** The user's offset in milliseconds, added to song time. Negative delays the clock. */
  userOffsetMs = 0;

  #state: ClockState = 'stopped';
  #startFrame = 0;
  #latency = 0;
  #pausedFrame = 0;

  get state(): ClockState {
    return this.#state;
  }

  /** Context seconds of the song's first frame, or null before the worklet reports it. */
  get startTime(): number | null {
    return this.#state === 'running' || this.#state === 'paused' ? this.#startFrame / SAMPLE_RATE : null;
  }

  /** The output latency in seconds the clock subtracts. */
  get latency(): number {
    return this.#latency;
  }

  /** start() was called; the worklet hasn't rendered the first frame yet. */
  starting(latency: number): void {
    this.#state = 'starting';
    this.#latency = latency;
  }

  /** The worklet rendered the song's first frame into the quantum at `contextFrame`. */
  anchor(contextFrame: number, latency: number): void {
    this.#startFrame = contextFrame;
    this.#latency = latency;
    this.#state = 'running';
  }

  /**
   * Replaces the latency while it is still unknown (0). Browsers can report 0 until the
   * output device has started; after a nonzero value the latency stays fixed until the next
   * start, so the clock never jumps while playing.
   */
  refineLatency(latency: number): void {
    if (this.#latency === 0 && latency > 0) this.#latency = latency;
  }

  /** The context is suspended at `currentTime`; song time stays at its value there. */
  pause(currentTime: number): void {
    if (this.#state !== 'running') return;
    this.#pausedFrame = toFrames(currentTime);
    this.#state = 'paused';
  }

  /**
   * The context runs again. A suspended context's currentTime doesn't advance and the
   * worklet renders nothing, so the song and the context time stopped together and the
   * formula carries on from the paused value with the same startTime.
   */
  resume(): void {
    if (this.#state !== 'paused') return;
    this.#state = 'running';
  }

  stop(): void {
    this.#state = 'stopped';
  }

  /**
   * Song time in 48 kHz frames at context time `currentTime`. 0 while stopped. While
   * starting, the value the clock will have at the song's first frame: -latency + userOffset.
   * Negative values are real: the first frame hasn't reached the speakers yet.
   */
  samples(currentTime: number): number {
    const correction = toFrames(this.userOffsetMs / 1000) - toFrames(this.#latency);
    switch (this.#state) {
      case 'stopped':
        return 0;
      case 'starting':
        return correction;
      case 'running':
        return toFrames(currentTime) - this.#startFrame + correction;
      case 'paused':
        return this.#pausedFrame - this.#startFrame + correction;
    }
  }

  /** samples(currentTime) in seconds. */
  seconds(currentTime: number): number {
    return this.samples(currentTime) / SAMPLE_RATE;
  }
}
