// Synthetic LevelData for levelgen and sim tests.

import { LEVEL_DATA_FORMAT_VERSION, type LevelData } from '../src/level-data/types.ts';

export interface SyntheticSong {
  /** Row lengths in samples. */
  rowLengths: number[];
  /** Spectrum level for (frame, band), left and right. */
  left: (frame: number, band: number) => number;
  right: (frame: number, band: number) => number;
}

export function syntheticLevelData(song: SyntheticSong): LevelData {
  const starts: number[] = [];
  let t = 0;
  for (const len of song.rowLengths) {
    starts.push(t);
    t += len;
  }
  const totalSamples = t;
  const frameCount = Math.floor(totalSamples / 800);
  const spectrumLeft = new Uint8Array(frameCount * 16);
  const spectrumRight = new Uint8Array(frameCount * 16);
  for (let f = 0; f < frameCount; f++) {
    for (let b = 0; b < 16; b++) {
      spectrumLeft[f * 16 + b] = song.left(f, b);
      spectrumRight[f * 16 + b] = song.right(f, b);
    }
  }
  const n = starts.length;
  return {
    formatVersion: LEVEL_DATA_FORMAT_VERSION,
    genVersion: 0,
    libopenmptVersion: 'synthetic',
    params: {
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
      maxDurationSamples: 43_200_000,
    },
    totalSamples,
    hitDurationCap: false,
    meta: {
      title: '',
      artist: '',
      type: 'mod',
      tracker: '',
      numChannels: 0,
      numOrders: 0,
      numPatterns: 0,
      numInstruments: 0,
      numSamples: 0,
      instrumentNames: [],
      sampleNames: [],
    },
    orderPatterns: new Uint16Array(0),
    rows: {
      timeSamples: Uint32Array.from(starts),
      order: new Uint16Array(n),
      pattern: new Uint16Array(n),
      row: new Uint16Array(n),
      speed: new Uint16Array(n),
      tempo: new Uint16Array(n),
    },
    notes: {
      timeSamples: new Uint32Array(0),
      channel: new Uint8Array(0),
      instrument: new Uint8Array(0),
      resolvedInstrument: new Uint8Array(0),
      note: new Uint8Array(0),
      volume: new Uint8Array(0),
      volumeEffect: new Uint8Array(0),
      effect: new Uint8Array(0),
      effectParam: new Uint8Array(0),
    },
    frames: { frameCount, spectrumLeft, spectrumRight, vuLeft: new Uint8Array(0), vuRight: new Uint8Array(0) },
  };
}

/** A small seeded LCG, so random songs are repeatable. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
