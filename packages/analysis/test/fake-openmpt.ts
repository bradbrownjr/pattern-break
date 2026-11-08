// A scripted stand-in for the libopenmpt binding, implementing the contract in
// src/openmpt-types.ts. It "plays" a fixed list of rows, renders a deterministic square
// wave, and reports scripted VU values, so analyze() can be tested without the WASM build.

import type { OpenMpt, OpenMptModule, PatternCommand, RenderParam } from '../src/openmpt-types.ts';

/** One cell, indexed by PatternCommand: [note, instrument, volumeEffect, effect, volume, parameter]. */
export type FakeCell = readonly [number, number, number, number, number, number];
export const EMPTY: FakeCell = [0, 0, 0, 0, 0, 0];

export interface FakeRow {
  order: number;
  pattern: number;
  row: number;
  /** How many samples this row lasts. */
  samples: number;
  speed: number;
  tempo: number;
}

export interface FakeSong {
  title: string;
  numChannels: number;
  orders: number[];
  /** patterns[p][row][channel] */
  patterns: FakeCell[][][];
  instrumentNames: string[];
  sampleNames: string[];
  /** The rows in play order. */
  play: FakeRow[];
  /** Repeat `play` forever instead of ending, as a module that loops would. */
  loopForever?: boolean;
}

export interface FakeCall {
  name: string;
  args: Array<number | string>;
}

/** VU for a channel at a sample position; values above 1 test the clamp. */
export function fakeVu(channel: number, position: number, side: 0 | 1): number {
  return ((position / 800 + channel * 3 + side * 5) % 11) / 9.5;
}

export class FakeModule implements OpenMptModule {
  readonly calls: FakeCall[] = [];
  destroyed = false;
  private position = 0;
  private readonly song: FakeSong;
  private readonly songLength: number;

  constructor(song: FakeSong) {
    this.song = song;
    this.songLength = song.play.reduce((sum, r) => sum + r.samples, 0);
  }

  get numChannels(): number {
    return this.song.numChannels;
  }
  get numOrders(): number {
    return this.song.orders.length;
  }
  get numPatterns(): number {
    return this.song.patterns.length;
  }
  get numInstruments(): number {
    return this.song.instrumentNames.length;
  }
  get numSamples(): number {
    return this.song.sampleNames.length;
  }

  metadata(key: string): string {
    const values: Record<string, string> = { title: this.song.title, type: 'mod', tracker: 'Fake Tracker' };
    return values[key] ?? '';
  }
  instrumentName(index: number): string {
    return this.song.instrumentNames[index] ?? '';
  }
  sampleName(index: number): string {
    return this.song.sampleNames[index] ?? '';
  }
  orderPattern(order: number): number {
    return this.song.orders[order] ?? 0xffff;
  }
  patternNumRows(pattern: number): number {
    return this.song.patterns[pattern]?.length ?? 0;
  }
  patternCommand(pattern: number, row: number, channel: number, command: PatternCommand): number {
    return (this.song.patterns[pattern]?.[row]?.[channel] ?? EMPTY)[command];
  }

  setRenderParam(param: RenderParam, value: number): void {
    this.calls.push({ name: 'setRenderParam', args: [param, value] });
  }
  ctlSet(key: string, value: string): void {
    this.calls.push({ name: 'ctlSet', args: [key, value] });
  }
  setRepeatCount(count: number): void {
    this.calls.push({ name: 'setRepeatCount', args: [count] });
  }

  readFloatStereo(sampleRate: number, frames: number, left: Float32Array, right: Float32Array): number {
    this.calls.push({ name: 'readFloatStereo', args: [sampleRate, frames] });
    const remaining = this.song.loopForever ? frames : this.songLength - this.position;
    const n = Math.max(0, Math.min(frames, remaining));
    for (let i = 0; i < n; i++) {
      const t = this.position + i;
      left[i] = Math.floor(t / 37) % 2 === 0 ? 0.5 : -0.5;
      right[i] = Math.floor(t / 11) % 2 === 0 ? 0.25 : -0.25;
    }
    this.position += n;
    return n;
  }

  /** The row that the last rendered sample belongs to. */
  private current(): FakeRow {
    const play = this.song.play;
    let t = this.position === 0 ? 0 : this.position - 1;
    if (this.song.loopForever) t %= this.songLength;
    for (const r of play) {
      if (t < r.samples) return r;
      t -= r.samples;
    }
    return play[play.length - 1]!;
  }

  currentOrder(): number {
    return this.current().order;
  }
  currentPattern(): number {
    return this.current().pattern;
  }
  currentRow(): number {
    return this.current().row;
  }
  currentSpeed(): number {
    return this.current().speed;
  }
  currentTempo(): number {
    return this.current().tempo;
  }
  channelVuLeft(channel: number): number {
    return fakeVu(channel, this.position, 0);
  }
  channelVuRight(channel: number): number {
    return fakeVu(channel, this.position, 1);
  }

  durationSeconds(): number {
    return this.songLength / 48_000;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

export class FakeOpenMpt implements OpenMpt {
  readonly libraryVersion = '0.0.0-fake';
  readonly modules: FakeModule[] = [];

  private readonly song: FakeSong;

  constructor(song: FakeSong) {
    this.song = song;
  }

  load(_bytes: Uint8Array): FakeModule {
    const mod = new FakeModule(this.song);
    this.modules.push(mod);
    return mod;
  }
}
