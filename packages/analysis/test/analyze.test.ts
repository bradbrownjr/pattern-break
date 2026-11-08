import {
  BAND_COUNT,
  GEN_VERSION,
  LED_LEVELS,
  MAX_DURATION_SAMPLES,
  deserializeLevelData,
  quantizeVu,
  serializeLevelData,
} from '@game/core';
import { describe, expect, it } from 'vitest';
import { RENDER_PARAMS, analyze } from '../src/analyze.ts';
import { hashLevelData, sha256Hex } from '../src/hash.ts';
import { RenderParam } from '../src/openmpt-types.ts';
import { EMPTY, FakeOpenMpt, fakeVu, type FakeCell, type FakeSong } from './fake-openmpt.ts';

const cell = (note: number, instrument: number, effect = 0, param = 0, volume = 0, volumeEffect = 0): FakeCell => [
  note,
  instrument,
  volumeEffect,
  effect,
  volume,
  param,
];

// Two channels. Pattern 0 row 2 is never played, so its note must not appear.
const song: FakeSong = {
  title: 'Fake café',
  numChannels: 2,
  orders: [0, 1, 0, 1],
  patterns: [
    [
      [cell(49, 1, 0x0c, 0x20, 64, 1), cell(0, 2)], // instrument without a note: no event
      [cell(51, 0, 0x04, 0x37), cell(37, 0)],
      [cell(60, 3), EMPTY],
      [cell(254, 0), cell(120, 3)], // note cut: no event
    ],
    [
      [cell(1, 0), cell(121, 1)], // 121 is not a note
      [cell(255, 0), cell(50, 0)], // key off: no event
    ],
  ],
  instrumentNames: [],
  sampleNames: ['kick', 'snare', 'lead'],
  play: [
    { order: 0, pattern: 0, row: 0, samples: 1000, speed: 6, tempo: 125 },
    { order: 0, pattern: 0, row: 1, samples: 960, speed: 6, tempo: 125 },
    { order: 1, pattern: 1, row: 0, samples: 1440, speed: 3, tempo: 140 },
    { order: 2, pattern: 0, row: 3, samples: 600, speed: 3, tempo: 140 },
    { order: 3, pattern: 1, row: 1, samples: 100, speed: 3, tempo: 140 },
  ],
};

const run = (s: FakeSong = song) => {
  const openmpt = new FakeOpenMpt(s);
  const level = analyze(openmpt, new Uint8Array(4));
  return { level, mod: openmpt.modules[0]! };
};

describe('analyze', () => {
  it('sets every render parameter and the repeat count before the first read', () => {
    const { mod } = run();
    const firstRead = mod.calls.findIndex((c) => c.name === 'readFloatStereo');
    const before = mod.calls.slice(0, firstRead);
    expect(before.filter((c) => c.name === 'setRenderParam').map((c) => c.args)).toEqual(
      RENDER_PARAMS.map(([p, v]) => [p, v]),
    );
    expect(new Set(RENDER_PARAMS.map(([p]) => p))).toEqual(new Set(Object.values(RenderParam)));
    expect(before.filter((c) => c.name === 'setRepeatCount').map((c) => c.args)).toEqual([[0]]);
    expect(mod.calls.slice(firstRead).every((c) => c.name !== 'setRenderParam')).toBe(true);
  });

  it('reads at 48 kHz in chunks of at most 160 frames and frees the module', () => {
    const { mod } = run();
    const reads = mod.calls.filter((c) => c.name === 'readFloatStereo');
    expect(reads.length).toBe(Math.ceil(4100 / 160) + 1); // the last read returns 0
    for (const r of reads) {
      expect(r.args[0]).toBe(48_000);
      expect(r.args[1]).toBe(160);
    }
    expect(mod.destroyed).toBe(true);
  });

  it('records each played row at the start of the chunk it was first seen in', () => {
    const { level } = run();
    expect(level.totalSamples).toBe(4100);
    expect(level.hitDurationCap).toBe(false);
    expect([...level.rows.timeSamples]).toEqual([0, 960, 1920, 3360, 4000]);
    expect([...level.rows.order]).toEqual([0, 0, 1, 2, 3]);
    expect([...level.rows.pattern]).toEqual([0, 0, 1, 0, 1]);
    expect([...level.rows.row]).toEqual([0, 1, 0, 3, 1]);
    expect([...level.rows.speed]).toEqual([6, 6, 3, 3, 3]);
    expect([...level.rows.tempo]).toEqual([125, 125, 140, 140, 140]);
    // Each row's true start lies in [timeSamples, timeSamples + chunkFrames).
    const starts = [0, 1000, 1960, 3400, 4000];
    starts.forEach((s, i) => {
      const t = level.rows.timeSamples[i]!;
      expect(s >= t && s < t + level.params.chunkFrames).toBe(true);
    });
  });

  it('emits note-ons for played rows only, with raw values and the resolved instrument', () => {
    const { level } = run();
    const n = level.notes;
    const events = [...n.timeSamples].map((t, i) => [
      t,
      n.channel[i],
      n.instrument[i],
      n.resolvedInstrument[i],
      n.note[i],
      n.volume[i],
      n.volumeEffect[i],
      n.effect[i],
      n.effectParam[i],
    ]);
    expect(events).toEqual([
      [0, 0, 1, 1, 49, 64, 1, 0x0c, 0x20],
      [960, 0, 0, 1, 51, 0, 0, 0x04, 0x37],
      [960, 1, 0, 2, 37, 0, 0, 0, 0],
      [1920, 0, 0, 1, 1, 0, 0, 0, 0],
      [3360, 1, 3, 3, 120, 0, 0, 0, 0],
      [4000, 1, 0, 3, 50, 0, 0, 0, 0],
    ]);
  });

  it('takes one analysis frame per 800 samples, with spectrum and quantized VU', () => {
    const { level } = run();
    const f = level.frames;
    expect(f.frameCount).toBe(5); // floor(4100 / 800)
    expect(f.spectrumLeft.length).toBe(5 * BAND_COUNT);
    expect(f.spectrumRight.length).toBe(5 * BAND_COUNT);
    expect(Math.max(...f.spectrumLeft)).toBeLessThanOrEqual(LED_LEVELS);
    // The square waves are loud, so some band reads high on both sides.
    expect(Math.max(...f.spectrumLeft)).toBeGreaterThan(6);
    expect(Math.max(...f.spectrumRight)).toBeGreaterThan(6);
    const vuLeft: number[] = [];
    const vuRight: number[] = [];
    for (let frame = 0; frame < 5; frame++) {
      for (let c = 0; c < 2; c++) {
        vuLeft.push(quantizeVu(fakeVu(c, (frame + 1) * 800, 0)));
        vuRight.push(quantizeVu(fakeVu(c, (frame + 1) * 800, 1)));
      }
    }
    expect([...f.vuLeft]).toEqual(vuLeft);
    expect([...f.vuRight]).toEqual(vuRight);
    expect(vuRight).toContain(255); // fakeVu goes above 1 there
  });

  it('records structure, metadata, and versions', () => {
    const { level } = run();
    expect(level.formatVersion).toBe(1);
    expect(level.genVersion).toBe(GEN_VERSION);
    expect(level.libopenmptVersion).toBe('0.0.0-fake');
    expect([...level.orderPatterns]).toEqual([0, 1, 0, 1]);
    expect(level.meta).toEqual({
      title: 'Fake café',
      artist: '',
      type: 'mod',
      tracker: 'Fake Tracker',
      numChannels: 2,
      numOrders: 4,
      numPatterns: 2,
      numInstruments: 0,
      numSamples: 3,
      instrumentNames: [],
      sampleNames: ['kick', 'snare', 'lead'],
    });
    expect(level.params).toEqual({
      sampleRate: 48_000,
      chunkFrames: 160,
      hopFrames: 800,
      fftSize: 2048,
      bandCount: 16,
      bandLowHz: 40,
      bandHighHz: 16_000,
      ledLevels: 12,
      ledBottomDb: -60,
      ledStepDb: 5,
      vuScale: 255,
      maxDurationSamples: MAX_DURATION_SAMPLES,
    });
  });

  it('gives identical bytes and hash on two runs, and the bytes round-trip', async () => {
    const a = serializeLevelData(run().level);
    const b = serializeLevelData(run().level);
    expect(b).toEqual(a);
    expect(await sha256Hex(b)).toBe(await sha256Hex(a));
    expect(await hashLevelData(run().level)).toBe(await sha256Hex(a));
    expect(serializeLevelData(deserializeLevelData(a))).toEqual(a);
  });

  it('matches the golden hash for the fake song', async () => {
    // Update only together with a GEN_VERSION bump (or before the first release).
    expect(await hashLevelData(run().level)).toBe(
      'e0c252c08a8ee10a9f703761dcf207d575e43ce74f0265fd6613bf151b1a6911',
    );
  });

  it('frees the module when analysis throws', () => {
    const bad: FakeSong = { ...song, play: [{ ...song.play[0]!, speed: -1 }] };
    const openmpt = new FakeOpenMpt(bad);
    expect(() => analyze(openmpt, new Uint8Array(4))).toThrow(RangeError);
    expect(openmpt.modules[0]!.destroyed).toBe(true);
  });

  it('stops at the 15-minute cap when the song never ends', () => {
    const { level } = run({ ...song, loopForever: true });
    expect(level.totalSamples).toBe(MAX_DURATION_SAMPLES);
    expect(level.hitDurationCap).toBe(true);
    expect(level.frames.frameCount).toBe(MAX_DURATION_SAMPLES / 800);
    expect(level.frames.spectrumLeft.length).toBe((MAX_DURATION_SAMPLES / 800) * BAND_COUNT);
    // The 4100-sample loop repeats until the cap. Its 100-sample last row is shorter than a
    // chunk, so it is missed when it starts and ends inside one chunk; the other four never are.
    const loops = Math.floor(MAX_DURATION_SAMPLES / 4100);
    expect(level.rows.timeSamples.length).toBeGreaterThanOrEqual(4 * loops);
    expect(level.rows.timeSamples.length).toBeLessThanOrEqual(5 * (loops + 1));
    expect(level.rows.timeSamples[level.rows.timeSamples.length - 1]!).toBeLessThan(MAX_DURATION_SAMPLES);
  }, 120_000);
});
