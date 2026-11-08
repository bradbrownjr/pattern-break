// Loads the vendored libopenmpt build in Node and plays tiny modules built in memory
// (tiny-modules.ts).

import { ANALYSIS_SAMPLE_RATE } from '@game/core';
import { describe, expect, it } from 'vitest';
import { EffectCommand } from '../src/effects.ts';
import { loadOpenMpt } from '../src/openmpt.ts';
import { PatternCommand, RenderParam, type OpenMpt, type OpenMptModule } from '../src/openmpt-types.ts';
import { buildMod, buildRandomVibratoIt } from './tiny-modules.ts';

interface Render {
  left: Float32Array;
  right: Float32Array;
  orders: Set<number>;
  rows: Set<number>;
  peak: number;
  vuPeakLeft: number;
  vuPeakRight: number;
}

const CHUNK = 256;
const MAX_FRAMES = ANALYSIS_SAMPLE_RATE * 10;

function configure(mod: OpenMptModule, volumeRamping = -1): void {
  mod.setRepeatCount(0);
  mod.setRenderParam(RenderParam.masterGainMillibel, 0);
  mod.setRenderParam(RenderParam.stereoSeparationPercent, 100);
  mod.setRenderParam(RenderParam.interpolationFilterLength, 8);
  mod.setRenderParam(RenderParam.volumeRampingStrength, volumeRamping);
  mod.ctlSet('render.resampler.emulate_amiga', '0');
}

/** Renders to the song end in chunks of the given sizes, used in turn. */
function render(mod: OpenMptModule, chunks: readonly number[] = [CHUNK]): Render {
  const left = new Float32Array(MAX_FRAMES);
  const right = new Float32Array(MAX_FRAMES);
  const longest = Math.max(...chunks);
  const chunkLeft = new Float32Array(longest);
  const chunkRight = new Float32Array(longest);
  const out: Render = { left, right, orders: new Set(), rows: new Set(), peak: 0, vuPeakLeft: 0, vuPeakRight: 0 };
  let frames = 0;
  for (let i = 0; ; i++) {
    const n = mod.readFloatStereo(ANALYSIS_SAMPLE_RATE, chunks[i % chunks.length]!, chunkLeft, chunkRight);
    if (n === 0) break;
    if (frames + n > MAX_FRAMES) throw new Error('song did not end');
    left.set(chunkLeft.subarray(0, n), frames);
    right.set(chunkRight.subarray(0, n), frames);
    frames += n;
    for (let k = 0; k < n; k++) out.peak = Math.max(out.peak, Math.abs(chunkLeft[k]!), Math.abs(chunkRight[k]!));
    out.orders.add(mod.currentOrder());
    out.rows.add(mod.currentRow());
    for (let c = 0; c < mod.numChannels; c++) {
      out.vuPeakLeft = Math.max(out.vuPeakLeft, mod.channelVuLeft(c));
      out.vuPeakRight = Math.max(out.vuPeakRight, mod.channelVuRight(c));
    }
  }
  out.left = left.subarray(0, frames);
  out.right = right.subarray(0, frames);
  return out;
}

/** Byte offset of the first difference between two renders' PCM, or -1. */
function firstDifference(a: Render, b: Render): number {
  const bytes = (x: Float32Array) => new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  const pairs = [
    [bytes(a.left), bytes(b.left)],
    [bytes(a.right), bytes(b.right)],
  ] as const;
  for (const [x, y] of pairs) {
    if (x.length !== y.length) return Math.min(x.length, y.length);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return i;
  }
  return -1;
}

function play(openmpt: OpenMpt, bytes: Uint8Array, chunks?: readonly number[], volumeRamping?: number): Render {
  const mod = openmpt.load(bytes);
  try {
    configure(mod, volumeRamping);
    return render(mod, chunks);
  } finally {
    mod.destroy();
  }
}

describe('libopenmpt binding', () => {
  it('reports the pinned library version', async () => {
    const openmpt = await loadOpenMpt();
    expect(openmpt.libraryVersion).toBe('0.8.10');
  });

  it('reads metadata and pattern data', async () => {
    const openmpt = await loadOpenMpt();
    const mod = openmpt.load(buildMod());
    expect(mod.metadata('type')).toBe('mod');
    expect(mod.metadata('title')).toBe('pattern break test');
    expect(mod.metadata('no such key')).toBe('');
    expect(mod.numChannels).toBe(4);
    expect(mod.numOrders).toBe(2);
    expect(mod.numPatterns).toBe(2);
    expect(mod.numInstruments).toBe(0);
    expect(mod.numSamples).toBeGreaterThanOrEqual(1);
    expect(mod.sampleName(0)).toBe('square');
    expect(mod.orderPattern(1)).toBe(1);
    expect(mod.patternNumRows(0)).toBe(64);
    expect(mod.durationSeconds()).toBeCloseTo(1.56, 2);

    const cmd = (pattern: number, row: number, channel: number, command: PatternCommand) =>
      mod.patternCommand(pattern, row, channel, command);
    // libopenmpt numbers ProTracker period 428 as C-5 (note 61) and 214 as C-6 (73).
    expect(cmd(0, 0, 0, PatternCommand.note)).toBe(61);
    expect(cmd(0, 0, 1, PatternCommand.note)).toBe(73);
    expect(cmd(0, 1, 0, PatternCommand.note)).toBe(0);
    expect(cmd(0, 0, 0, PatternCommand.instrument)).toBe(1);
    expect(cmd(0, 0, 0, PatternCommand.effect)).toBe(EffectCommand.arpeggio);
    expect(cmd(0, 0, 0, PatternCommand.parameter)).toBe(0x37);
    expect(cmd(0, 0, 1, PatternCommand.effect)).toBe(EffectCommand.vibrato);
    expect(cmd(0, 0, 3, PatternCommand.effect)).toBe(EffectCommand.speed);
    expect(cmd(0, 4, 2, PatternCommand.effect)).toBe(EffectCommand.volumeSlide);
    expect(cmd(0, 16, 0, PatternCommand.effect)).toBe(EffectCommand.patternBreak);
    expect(cmd(1, 8, 0, PatternCommand.effect)).toBe(EffectCommand.positionJump);
    mod.destroy();
  });

  it('renders until the song ends, with non-zero output and VU', async () => {
    const r = play(await loadOpenMpt(), buildMod());
    expect(r.left.length).toBeGreaterThan(ANALYSIS_SAMPLE_RATE * 1.5);
    expect(r.left.length).toBeLessThan(ANALYSIS_SAMPLE_RATE * 1.7);
    expect(r.peak).toBeGreaterThan(0);
    expect(r.vuPeakLeft).toBeGreaterThan(0);
    expect(r.vuPeakRight).toBeGreaterThan(0);
    expect([...r.orders].sort()).toEqual([0, 1]);
    expect(Math.max(...r.rows)).toBe(16);
  });

  it('renders bit-identical PCM on every run', async () => {
    const first = await loadOpenMpt();
    const a = play(first, buildMod());
    // A second module in the same instance, then a fresh instance.
    const b = play(first, buildMod());
    const c = play(await loadOpenMpt(), buildMod());
    expect(firstDifference(a, b)).toBe(-1);
    expect(firstDifference(a, c)).toBe(-1);
  });

  it('seeds the playback PRNG the same way every time', async () => {
    // Upstream libopenmpt renders this module differently on each load; the build patches
    // the seeding (tools/libopenmpt/deterministic-prng.patch).
    const first = await loadOpenMpt();
    const a = play(first, buildRandomVibratoIt());
    const b = play(first, buildRandomVibratoIt());
    const c = play(await loadOpenMpt(), buildRandomVibratoIt());
    expect(a.peak).toBeGreaterThan(0);
    expect(firstDifference(a, b)).toBe(-1);
    expect(firstDifference(a, c)).toBe(-1);
  });

  it('gives output that does not depend on chunk size when volume ramping is off', async () => {
    // With volume ramping on, a ramp can be cut short at a read boundary, so output depends
    // on the chunk sizes (by less than 1e-6 here). Analysis uses one fixed size.
    const openmpt = await loadOpenMpt();
    const reference = play(openmpt, buildMod(), [CHUNK], 0);
    // Odd sizes, and sizes larger than the heap buffers allocated so far.
    const mixed = play(openmpt, buildMod(), [1, 7, 300, 4096, 50, 128], 0);
    expect(mixed.left.length).toBe(reference.left.length);
    expect(firstDifference(reference, mixed)).toBe(-1);
  });

  it('throws on bad input and after destroy', async () => {
    const openmpt = await loadOpenMpt();
    expect(() => openmpt.load(new Uint8Array([1, 2, 3, 4]))).toThrow(/can't open/);
    const mod = openmpt.load(buildMod());
    expect(() => mod.ctlSet('no.such.ctl', '1')).toThrow(/ctl_set/);
    const short = new Float32Array(5);
    expect(() => mod.readFloatStereo(ANALYSIS_SAMPLE_RATE, 10, short, new Float32Array(10))).toThrow(RangeError);
    mod.destroy();
    mod.destroy();
    expect(() => mod.currentRow()).toThrow(/destroyed/);
  });
});
