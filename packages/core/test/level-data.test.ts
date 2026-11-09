import { describe, expect, it } from 'vitest';
import { deserializeLevelData, serializeLevelData } from '../src/level-data/serialize.ts';
import { LEVEL_DATA_FORMAT_VERSION, type LevelData } from '../src/level-data/types.ts';

function sample(): LevelData {
  const frameCount = 3;
  const channels = 2;
  const bands = 16;
  return {
    formatVersion: LEVEL_DATA_FORMAT_VERSION,
    genVersion: 0,
    libopenmptVersion: '0.8.10',
    params: {
      sampleRate: 48_000,
      chunkFrames: 160,
      hopFrames: 800,
      fftSize: 2048,
      bandCount: bands,
      bandLowHz: 40,
      bandHighHz: 16_000,
      ledLevels: 12,
      ledBottomDb: -60,
      ledStepDb: 5,
      vuScale: 255,
      maxDurationSamples: 43_200_000,
      tempoPermille: 1150,
    },
    totalSamples: 2_500,
    hitDurationCap: false,
    meta: {
      title: 'café \u{1f3b5}',
      artist: '',
      type: 'mod',
      tracker: 'ProTracker',
      numChannels: channels,
      numOrders: 3,
      numPatterns: 2,
      numInstruments: 0,
      numSamples: 2,
      instrumentNames: [],
      sampleNames: ['kick', 'snäre'],
    },
    orderPatterns: Uint16Array.from([0, 1, 0xffff]),
    rows: {
      timeSamples: Uint32Array.from([0, 960, 43_199_840]),
      order: Uint16Array.from([0, 0, 65_535]),
      pattern: Uint16Array.from([0, 0, 1]),
      row: Uint16Array.from([0, 1, 63]),
      speed: Uint16Array.from([6, 6, 3]),
      tempo: Uint16Array.from([125, 125, 999]),
    },
    notes: {
      timeSamples: Uint32Array.from([0, 960]),
      channel: Uint8Array.from([0, 1]),
      instrument: Uint8Array.from([1, 0]),
      resolvedInstrument: Uint8Array.from([1, 2]),
      note: Uint8Array.from([49, 120]),
      volume: Uint8Array.from([64, 0]),
      volumeEffect: Uint8Array.from([1, 0]),
      effect: Uint8Array.from([0x0c, 0x0f]),
      effectParam: Uint8Array.from([0x40, 0xff]),
    },
    frames: {
      frameCount,
      spectrumLeft: Uint8Array.from({ length: frameCount * bands }, (_, i) => i % 13),
      spectrumRight: Uint8Array.from({ length: frameCount * bands }, (_, i) => (i * 7) % 13),
      vuLeft: Uint8Array.from({ length: frameCount * channels }, (_, i) => i * 40),
      vuRight: Uint8Array.from({ length: frameCount * channels }, (_, i) => 255 - i),
    },
  };
}

describe('LevelData serialization', () => {
  it('round-trips exactly', () => {
    const level = sample();
    const bytes = serializeLevelData(level);
    const back = deserializeLevelData(bytes);
    expect(back).toEqual(level);
    expect(serializeLevelData(back)).toEqual(bytes);
  });

  it('starts with the magic and the format version, little-endian', () => {
    const bytes = serializeLevelData(sample());
    expect([...bytes.subarray(0, 8)]).toEqual([0x50, 0x42, 0x4c, 0x44, 2, 0, 0, 0]);
  });

  it('reads from a view with a byte offset', () => {
    const bytes = serializeLevelData(sample());
    const padded = new Uint8Array(bytes.length + 3);
    padded.set(bytes, 3);
    expect(deserializeLevelData(padded.subarray(3))).toEqual(sample());
  });

  it('rejects bad magic, an unknown version, truncation, and trailing bytes', () => {
    const bytes = serializeLevelData(sample());
    const badMagic = bytes.slice();
    badMagic[0] = 0;
    expect(() => deserializeLevelData(badMagic)).toThrow(/magic/);
    const badVersion = bytes.slice();
    badVersion[4] = 99;
    expect(() => deserializeLevelData(badVersion)).toThrow(/version/);
    expect(() => deserializeLevelData(bytes.subarray(0, bytes.length - 1))).toThrow(RangeError);
    const trailing = new Uint8Array(bytes.length + 1);
    trailing.set(bytes);
    expect(() => deserializeLevelData(trailing)).toThrow(/trailing/);
  });

  it('rejects arrays whose lengths disagree', () => {
    const level = sample();
    level.notes.effect = new Uint8Array(1);
    expect(() => serializeLevelData(level)).toThrow(RangeError);
    const level2 = sample();
    level2.frames.vuLeft = new Uint8Array(1);
    expect(() => serializeLevelData(level2)).toThrow(RangeError);
  });
});
