// Synthetic LevelData for levelgen and sim tests.

import { LEVEL_DATA_FORMAT_VERSION, type LevelData } from '../src/level-data/types.ts';
import { Difficulty, type DifficultyName } from '../src/levelgen/types.ts';

export interface SyntheticNote {
  /** Song sample of the note-on. */
  time: number;
  instrument: number;
  /** 1..120. */
  note: number;
  channel?: number;
}

export interface SyntheticSong {
  /** Row lengths in samples. */
  rowLengths: number[];
  /** Spectrum level for (frame, band), left and right. Default 0. */
  left?: (frame: number, band: number) => number;
  right?: (frame: number, band: number) => number;
  /** Channels for the VU meters. Default 4. */
  channels?: number;
  /** VU level 0..255 for (frame, channel), the same on both sides. Default 0. */
  vu?: (frame: number, channel: number) => number;
  /** Note-ons, in time order. */
  notes?: SyntheticNote[];
}

/** LevelData for `song`, as if analyzed at `difficulty`'s tempo (normal by default). */
export function syntheticLevelData(song: SyntheticSong, difficulty: DifficultyName = 'normal'): LevelData {
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
      spectrumLeft[f * 16 + b] = song.left?.(f, b) ?? 0;
      spectrumRight[f * 16 + b] = song.right?.(f, b) ?? 0;
    }
  }
  const channels = song.channels ?? 4;
  const vuLeft = new Uint8Array(frameCount * channels);
  for (let f = 0; f < frameCount; f++) {
    for (let c = 0; c < channels; c++) vuLeft[f * channels + c] = song.vu?.(f, c) ?? 0;
  }
  const notes = song.notes ?? [];
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
      tempoPermille: Difficulty[difficulty].tempoPermille,
    },
    totalSamples,
    hitDurationCap: false,
    meta: {
      title: '',
      artist: '',
      type: 'mod',
      tracker: '',
      numChannels: channels,
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
      timeSamples: Uint32Array.from(notes, (x) => x.time),
      channel: Uint8Array.from(notes, (x) => x.channel ?? 0),
      instrument: Uint8Array.from(notes, (x) => x.instrument),
      resolvedInstrument: Uint8Array.from(notes, (x) => x.instrument),
      note: Uint8Array.from(notes, (x) => x.note),
      volume: new Uint8Array(notes.length),
      volumeEffect: new Uint8Array(notes.length),
      effect: new Uint8Array(notes.length),
      effectParam: new Uint8Array(notes.length),
    },
    frames: { frameCount, spectrumLeft, spectrumRight, vuLeft, vuRight: vuLeft.slice() },
  };
}

/**
 * A random loud song for path tests: rows of random length, channel meters that jump at
 * random, and random notes from a melodic instrument (1) and a drum (2, one pitch).
 */
export function randomSong(rand: () => number, rows: number, maxRowFrames: number): SyntheticSong {
  const rowLengths = Array.from({ length: rows }, () => 160 * (1 + Math.floor(rand() * maxRowFrames * 5)));
  const total = rowLengths.reduce((a, b) => a + b, 0);
  const frames = Math.floor(total / 800);
  const vuTable = Array.from({ length: frames * 4 }, () => (rand() < 0.3 ? Math.floor(rand() * 256) : 0));
  const notes: SyntheticNote[] = [];
  for (let t = 0; t < total; t += 400 + Math.floor(rand() * 8000)) {
    notes.push(rand() < 0.3 ? { time: t, instrument: 2, note: 61 } : { time: t, instrument: 1, note: 30 + Math.floor(rand() * 80) });
  }
  return { rowLengths, channels: 4, vu: (f, c) => vuTable[f * 4 + c] ?? 0, notes };
}

/** A small seeded LCG, so random songs are repeatable. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
