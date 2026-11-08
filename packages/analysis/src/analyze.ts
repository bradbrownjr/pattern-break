// The offline analysis pass: render a module once through libopenmpt and record rows,
// note events, spectrum frames and VU (volume unit) levels into LevelData (docs/PLAN.md,
// "Analysis pipeline"). Everything after libopenmpt's float PCM and float VU values goes
// through core's deterministic code, so the output is bit-identical in every engine.

import {
  BAND_COUNT,
  BAND_HIGH_HZ,
  BAND_LOW_HZ,
  CHUNK_FRAMES,
  FFT_SIZE,
  GEN_VERSION,
  HOP_FRAMES,
  LED_BOTTOM_DB,
  LED_LEVELS,
  LED_STEP_DB,
  LEVEL_DATA_FORMAT_VERSION,
  MAX_DURATION_SAMPLES,
  SAMPLE_RATE,
  SpectrumAnalyzer,
  VU_SCALE,
  quantizeVu,
  type LevelData,
} from '@game/core';
import { PatternCommand, RenderParam, type OpenMpt, type OpenMptModule } from './openmpt-types.ts';

/**
 * Render parameters, all set before the first read. Volume ramping strength 1 is set
 * instead of libopenmpt's -1 ("recommended default"), whose meaning can change between
 * libopenmpt releases. Ramping stays on because ramp-free volume steps click, and clicks
 * show up as broadband spikes in every spectrum band.
 */
export const RENDER_PARAMS: ReadonlyArray<readonly [RenderParam, number]> = [
  [RenderParam.masterGainMillibel, 0],
  [RenderParam.stereoSeparationPercent, 100],
  [RenderParam.interpolationFilterLength, 8],
  [RenderParam.volumeRampingStrength, 1],
];

/** Appends floor(v) to `out`; throws if that is outside 0..max, so a bad value never wraps. */
function pushInt(out: number[], v: number, max: number, name: string): void {
  const x = Math.floor(v);
  if (!(x >= 0 && x <= max)) throw new RangeError(`analyze: ${name} value ${v} is out of range 0..${max}`);
  out.push(x);
}

/** An append-only Uint8Array that doubles when full. */
class ByteColumn {
  private data = new Uint8Array(1 << 14);
  private length = 0;

  /** Appends `n` zeroed bytes and returns the offset of the first. */
  grow(n: number): number {
    if (this.length + n > this.data.length) {
      let size = this.data.length * 2;
      while (size < this.length + n) size *= 2;
      const next = new Uint8Array(size);
      next.set(this.data.subarray(0, this.length));
      this.data = next;
    }
    const at = this.length;
    this.length += n;
    return at;
  }

  /** The backing array; valid until the next `grow`. */
  get bytes(): Uint8Array {
    return this.data;
  }

  finish(): Uint8Array {
    return this.data.slice(0, this.length);
  }
}

/** Loads `bytes` with `openmpt`, analyzes the module, and frees it. */
export function analyze(openmpt: OpenMpt, bytes: Uint8Array): LevelData {
  const mod = openmpt.load(bytes);
  try {
    return analyzeModule(mod, openmpt.libraryVersion);
  } finally {
    mod.destroy();
  }
}

/**
 * Renders `mod` from its current position (a freshly loaded module starts at the
 * beginning) to the song's end or MAX_DURATION_SAMPLES, whichever comes first. The caller
 * keeps ownership of `mod`.
 */
export function analyzeModule(mod: OpenMptModule, libopenmptVersion: string): LevelData {
  for (const [param, value] of RENDER_PARAMS) mod.setRenderParam(param, value);
  mod.setRepeatCount(0);

  const numChannels = mod.numChannels;
  const numOrders = mod.numOrders;
  const numPatterns = mod.numPatterns;
  const numInstruments = mod.numInstruments;
  const numSamples = mod.numSamples;
  const instrumentNames: string[] = [];
  for (let i = 0; i < numInstruments; i++) instrumentNames.push(mod.instrumentName(i));
  const sampleNames: string[] = [];
  for (let i = 0; i < numSamples; i++) sampleNames.push(mod.sampleName(i));
  const orderPatterns: number[] = [];
  for (let o = 0; o < numOrders; o++) pushInt(orderPatterns, mod.orderPattern(o), 0xffff, 'orderPattern');

  const rowTime: number[] = [];
  const rowOrder: number[] = [];
  const rowPattern: number[] = [];
  const rowRow: number[] = [];
  const rowSpeed: number[] = [];
  const rowTempo: number[] = [];

  const noteTime: number[] = [];
  const noteChannel: number[] = [];
  const noteInstrument: number[] = [];
  const noteResolved: number[] = [];
  const noteNote: number[] = [];
  const noteVolume: number[] = [];
  const noteVolumeEffect: number[] = [];
  const noteEffect: number[] = [];
  const noteEffectParam: number[] = [];
  const lastInstrument: number[] = Array.from({ length: numChannels }, () => 0);

  const spectrumLeft = new ByteColumn();
  const spectrumRight = new ByteColumn();
  const vuLeft = new ByteColumn();
  const vuRight = new ByteColumn();
  let frameCount = 0;

  const analyzer = new SpectrumAnalyzer();
  const left = new Float32Array(CHUNK_FRAMES);
  const right = new Float32Array(CHUNK_FRAMES);
  let total = 0;
  let lastOrder = -1;
  let lastRow = -1;

  while (total < MAX_DURATION_SAMPLES) {
    // A chunk never crosses an analysis frame boundary or the cap. CHUNK_FRAMES divides
    // HOP_FRAMES, so `want` is CHUNK_FRAMES unless a read came back short.
    const want = Math.min(CHUNK_FRAMES, HOP_FRAMES - (total % HOP_FRAMES), MAX_DURATION_SAMPLES - total);
    const got = mod.readFloatStereo(SAMPLE_RATE, want, left, right);
    if (got === 0) break;
    if (!(got > 0 && got <= want && Math.floor(got) === got)) {
      throw new RangeError(`analyze: readFloatStereo returned ${got} for ${want} frames`);
    }
    const chunkStart = total;
    analyzer.push(left, right, got);
    total += got;

    const order = mod.currentOrder();
    const row = mod.currentRow();
    if (order !== lastOrder || row !== lastRow) {
      lastOrder = order;
      lastRow = row;
      const pattern = mod.currentPattern();
      pushInt(rowTime, chunkStart, 0xffffffff, 'row time');
      pushInt(rowOrder, order, 0xffff, 'order');
      pushInt(rowPattern, pattern, 0xffff, 'pattern');
      pushInt(rowRow, row, 0xffff, 'row');
      pushInt(rowSpeed, mod.currentSpeed(), 0xffff, 'speed');
      pushInt(rowTempo, mod.currentTempo(), 0xffff, 'tempo');

      if (pattern < numPatterns && row < mod.patternNumRows(pattern)) {
        for (let c = 0; c < numChannels; c++) {
          const cell = (command: PatternCommand): number => mod.patternCommand(pattern, row, c, command);
          const instrument = cell(PatternCommand.instrument);
          if (instrument !== 0) lastInstrument[c] = instrument;
          const note = cell(PatternCommand.note);
          if (!(note >= 1 && note <= 120)) continue;
          pushInt(noteTime, chunkStart, 0xffffffff, 'note time');
          pushInt(noteChannel, c, 0xff, 'channel');
          pushInt(noteInstrument, instrument, 0xff, 'instrument');
          pushInt(noteResolved, lastInstrument[c]!, 0xff, 'instrument');
          pushInt(noteNote, note, 0xff, 'note');
          pushInt(noteVolume, cell(PatternCommand.volume), 0xff, 'volume');
          pushInt(noteVolumeEffect, cell(PatternCommand.volumeEffect), 0xff, 'volume effect');
          pushInt(noteEffect, cell(PatternCommand.effect), 0xff, 'effect');
          pushInt(noteEffectParam, cell(PatternCommand.parameter), 0xff, 'effect parameter');
        }
      }
    }

    if (total % HOP_FRAMES === 0) {
      const s = spectrumLeft.grow(BAND_COUNT);
      spectrumRight.grow(BAND_COUNT);
      analyzer.analyze(spectrumLeft.bytes, spectrumRight.bytes, s);
      const v = vuLeft.grow(numChannels);
      vuRight.grow(numChannels);
      const vl = vuLeft.bytes;
      const vr = vuRight.bytes;
      for (let c = 0; c < numChannels; c++) {
        vl[v + c] = quantizeVu(mod.channelVuLeft(c));
        vr[v + c] = quantizeVu(mod.channelVuRight(c));
      }
      frameCount++;
    }
  }

  return {
    formatVersion: LEVEL_DATA_FORMAT_VERSION,
    genVersion: GEN_VERSION,
    libopenmptVersion,
    params: {
      sampleRate: SAMPLE_RATE,
      chunkFrames: CHUNK_FRAMES,
      hopFrames: HOP_FRAMES,
      fftSize: FFT_SIZE,
      bandCount: BAND_COUNT,
      bandLowHz: BAND_LOW_HZ,
      bandHighHz: BAND_HIGH_HZ,
      ledLevels: LED_LEVELS,
      ledBottomDb: LED_BOTTOM_DB,
      ledStepDb: LED_STEP_DB,
      vuScale: VU_SCALE,
      maxDurationSamples: MAX_DURATION_SAMPLES,
    },
    totalSamples: total,
    hitDurationCap: total >= MAX_DURATION_SAMPLES,
    meta: {
      title: mod.metadata('title'),
      artist: mod.metadata('artist'),
      type: mod.metadata('type'),
      tracker: mod.metadata('tracker'),
      numChannels,
      numOrders,
      numPatterns,
      numInstruments,
      numSamples,
      instrumentNames,
      sampleNames,
    },
    orderPatterns: Uint16Array.from(orderPatterns),
    rows: {
      timeSamples: Uint32Array.from(rowTime),
      order: Uint16Array.from(rowOrder),
      pattern: Uint16Array.from(rowPattern),
      row: Uint16Array.from(rowRow),
      speed: Uint16Array.from(rowSpeed),
      tempo: Uint16Array.from(rowTempo),
    },
    notes: {
      timeSamples: Uint32Array.from(noteTime),
      channel: Uint8Array.from(noteChannel),
      instrument: Uint8Array.from(noteInstrument),
      resolvedInstrument: Uint8Array.from(noteResolved),
      note: Uint8Array.from(noteNote),
      volume: Uint8Array.from(noteVolume),
      volumeEffect: Uint8Array.from(noteVolumeEffect),
      effect: Uint8Array.from(noteEffect),
      effectParam: Uint8Array.from(noteEffectParam),
    },
    frames: {
      frameCount,
      spectrumLeft: spectrumLeft.finish(),
      spectrumRight: spectrumRight.finish(),
      vuLeft: vuLeft.finish(),
      vuRight: vuRight.finish(),
    },
  };
}
