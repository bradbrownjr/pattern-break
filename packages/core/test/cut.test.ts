// The arcade's length cap (level-data/cut.ts): a long song is cut at the start of an
// order, its rows, notes and frames after that dropped; a short one is left alone.

import { describe, expect, it } from 'vitest';
import { cutLevelData, cutSample } from '../src/level-data/cut.ts';
import type { LevelData } from '../src/level-data/types.ts';

const HOP = 800;

/** A song of `orders` orders, each `rowsPerOrder` rows of `rowSamples`, a note on every row. */
function song(orders: number, rowsPerOrder: number, rowSamples: number): LevelData {
  const rows = orders * rowsPerOrder;
  const times = Uint32Array.from({ length: rows }, (_, r) => r * rowSamples);
  const total = rows * rowSamples;
  const frameCount = Math.floor(total / HOP);
  const u8 = (n: number) => new Uint8Array(n);
  return {
    formatVersion: 1,
    genVersion: 1,
    libopenmptVersion: 'test',
    params: { hopFrames: HOP, bandCount: 2 } as LevelData['params'],
    totalSamples: total,
    hitDurationCap: false,
    meta: { numChannels: 3 } as LevelData['meta'],
    orderPatterns: new Uint16Array(orders),
    rows: {
      timeSamples: times,
      order: Uint16Array.from({ length: rows }, (_, r) => Math.floor(r / rowsPerOrder)),
      pattern: new Uint16Array(rows),
      row: Uint16Array.from({ length: rows }, (_, r) => r % rowsPerOrder),
      speed: new Uint16Array(rows),
      tempo: new Uint16Array(rows),
    },
    notes: {
      timeSamples: times.slice(),
      channel: u8(rows),
      instrument: u8(rows),
      resolvedInstrument: u8(rows),
      note: u8(rows),
      volume: u8(rows),
      volumeEffect: u8(rows),
      effect: u8(rows),
      effectParam: u8(rows),
    },
    frames: { frameCount, spectrumLeft: u8(frameCount * 2), spectrumRight: u8(frameCount * 2), vuLeft: u8(frameCount * 3), vuRight: u8(frameCount * 3) },
  };
}

describe('cutLevelData', () => {
  it('leaves a song that ends by the cap alone', () => {
    const data = song(4, 4, 1000);
    expect(cutSample(data, 16_000)).toBe(16_000);
    expect(cutLevelData(data, 16_000)).toBe(data);
  });

  it('cuts at the last order that starts by the cap', () => {
    // Orders start at 0, 4000, 8000 and 12 000; a cap of 11 000 cuts at 8000.
    const cut = cutLevelData(song(4, 4, 1000), 11_000);
    expect(cut.totalSamples).toBe(8000);
    expect(cut.rows.timeSamples.length).toBe(8);
    expect(cut.notes.timeSamples.length).toBe(8);
    expect(cut.frames.frameCount).toBe(10);
    expect([cut.frames.spectrumLeft.length, cut.frames.vuRight.length]).toEqual([20, 30]);
  });

  it('cuts at the last row when no order starts by the cap', () => {
    expect(cutSample(song(2, 16, 1000), 11_500)).toBe(11_000);
  });
});
