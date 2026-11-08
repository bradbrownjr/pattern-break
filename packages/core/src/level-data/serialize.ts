// The LevelData binary format: little-endian, fixed field order, no padding. The layout
// is listed in docs/DEVELOPMENT.md, "LevelData"; keep the two in step.

import { decodeUtf8, encodeUtf8 } from '../utf8.ts';
import {
  LEVEL_DATA_FORMAT_VERSION,
  type LevelData,
  type LevelDataFrames,
  type LevelDataMeta,
  type LevelDataNotes,
  type LevelDataParams,
  type LevelDataRows,
} from './types.ts';

const MAGIC = [0x50, 0x42, 0x4c, 0x44]; // 'PBLD'

class Writer {
  private buf = new Uint8Array(1 << 16);
  private view = new DataView(this.buf.buffer);
  private len = 0;

  private reserve(n: number): void {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): void {
    this.reserve(1);
    this.view.setUint8(this.len, v);
    this.len += 1;
  }

  u16(v: number): void {
    this.reserve(2);
    this.view.setUint16(this.len, v, true);
    this.len += 2;
  }

  u32(v: number): void {
    this.reserve(4);
    this.view.setUint32(this.len, v, true);
    this.len += 4;
  }

  i32(v: number): void {
    this.reserve(4);
    this.view.setInt32(this.len, v, true);
    this.len += 4;
  }

  bytes(b: Uint8Array): void {
    this.reserve(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  }

  str(s: string): void {
    const b = encodeUtf8(s);
    this.u32(b.length);
    this.bytes(b);
  }

  u16Array(a: Uint16Array): void {
    this.reserve(a.length * 2);
    for (let i = 0; i < a.length; i++) {
      this.view.setUint16(this.len, a[i]!, true);
      this.len += 2;
    }
  }

  u32Array(a: Uint32Array): void {
    this.reserve(a.length * 4);
    for (let i = 0; i < a.length; i++) {
      this.view.setUint32(this.len, a[i]!, true);
      this.len += 4;
    }
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

class Reader {
  private readonly buf: Uint8Array;
  private readonly view: DataView;
  private pos = 0;

  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  private take(n: number): number {
    const at = this.pos;
    if (at + n > this.buf.length) throw new RangeError('LevelData: unexpected end of data');
    this.pos += n;
    return at;
  }

  u8(): number {
    return this.view.getUint8(this.take(1));
  }

  u16(): number {
    return this.view.getUint16(this.take(2), true);
  }

  u32(): number {
    return this.view.getUint32(this.take(4), true);
  }

  i32(): number {
    return this.view.getInt32(this.take(4), true);
  }

  bytes(n: number): Uint8Array {
    const at = this.take(n);
    return this.buf.slice(at, at + n);
  }

  str(): string {
    return decodeUtf8(this.bytes(this.u32()));
  }

  u16Array(n: number): Uint16Array {
    const at = this.take(n * 2);
    const out = new Uint16Array(n);
    for (let i = 0; i < n; i++) out[i] = this.view.getUint16(at + i * 2, true);
    return out;
  }

  u32Array(n: number): Uint32Array {
    const at = this.take(n * 4);
    const out = new Uint32Array(n);
    for (let i = 0; i < n; i++) out[i] = this.view.getUint32(at + i * 4, true);
    return out;
  }

  atEnd(): boolean {
    return this.pos === this.buf.length;
  }
}

function checkLength(name: string, actual: number, expected: number): void {
  if (actual !== expected) {
    throw new RangeError(`LevelData: ${name} has length ${actual}, expected ${expected}`);
  }
}

export function serializeLevelData(level: LevelData): Uint8Array {
  const w = new Writer();
  for (const b of MAGIC) w.u8(b);
  w.u32(level.formatVersion);
  w.u32(level.genVersion);
  w.str(level.libopenmptVersion);

  const p = level.params;
  w.u32(p.sampleRate);
  w.u32(p.chunkFrames);
  w.u32(p.hopFrames);
  w.u32(p.fftSize);
  w.u32(p.bandCount);
  w.u32(p.bandLowHz);
  w.u32(p.bandHighHz);
  w.u32(p.ledLevels);
  w.i32(p.ledBottomDb);
  w.u32(p.ledStepDb);
  w.u32(p.vuScale);
  w.u32(p.maxDurationSamples);

  w.u32(level.totalSamples);
  w.u8(level.hitDurationCap ? 1 : 0);

  const m = level.meta;
  w.str(m.title);
  w.str(m.artist);
  w.str(m.type);
  w.str(m.tracker);
  w.u32(m.numChannels);
  w.u32(m.numOrders);
  w.u32(m.numPatterns);
  w.u32(m.numInstruments);
  w.u32(m.numSamples);
  w.u32(m.instrumentNames.length);
  for (const s of m.instrumentNames) w.str(s);
  w.u32(m.sampleNames.length);
  for (const s of m.sampleNames) w.str(s);

  w.u32(level.orderPatterns.length);
  w.u16Array(level.orderPatterns);

  const r = level.rows;
  const rowCount = r.timeSamples.length;
  const rowFields = [r.order, r.pattern, r.row, r.speed, r.tempo];
  for (const a of rowFields) checkLength('a rows field', a.length, rowCount);
  w.u32(rowCount);
  w.u32Array(r.timeSamples);
  w.u16Array(r.order);
  w.u16Array(r.pattern);
  w.u16Array(r.row);
  w.u16Array(r.speed);
  w.u16Array(r.tempo);

  const n = level.notes;
  const noteCount = n.timeSamples.length;
  const noteFields = [
    n.channel,
    n.instrument,
    n.resolvedInstrument,
    n.note,
    n.volume,
    n.volumeEffect,
    n.effect,
    n.effectParam,
  ];
  for (const a of noteFields) checkLength('a notes field', a.length, noteCount);
  w.u32(noteCount);
  w.u32Array(n.timeSamples);
  w.bytes(n.channel);
  w.bytes(n.instrument);
  w.bytes(n.resolvedInstrument);
  w.bytes(n.note);
  w.bytes(n.volume);
  w.bytes(n.volumeEffect);
  w.bytes(n.effect);
  w.bytes(n.effectParam);

  const f = level.frames;
  checkLength('frames.spectrumLeft', f.spectrumLeft.length, f.frameCount * p.bandCount);
  checkLength('frames.spectrumRight', f.spectrumRight.length, f.frameCount * p.bandCount);
  checkLength('frames.vuLeft', f.vuLeft.length, f.frameCount * m.numChannels);
  checkLength('frames.vuRight', f.vuRight.length, f.frameCount * m.numChannels);
  w.u32(f.frameCount);
  w.bytes(f.spectrumLeft);
  w.bytes(f.spectrumRight);
  w.bytes(f.vuLeft);
  w.bytes(f.vuRight);

  return w.finish();
}

export function deserializeLevelData(bytes: Uint8Array): LevelData {
  const r = new Reader(bytes);
  for (const b of MAGIC) {
    if (r.u8() !== b) throw new Error('LevelData: bad magic, expected PBLD');
  }
  const formatVersion = r.u32();
  if (formatVersion !== LEVEL_DATA_FORMAT_VERSION) {
    throw new Error(`LevelData: format version ${formatVersion}, expected ${LEVEL_DATA_FORMAT_VERSION}`);
  }
  const genVersion = r.u32();
  const libopenmptVersion = r.str();

  const params: LevelDataParams = {
    sampleRate: r.u32(),
    chunkFrames: r.u32(),
    hopFrames: r.u32(),
    fftSize: r.u32(),
    bandCount: r.u32(),
    bandLowHz: r.u32(),
    bandHighHz: r.u32(),
    ledLevels: r.u32(),
    ledBottomDb: r.i32(),
    ledStepDb: r.u32(),
    vuScale: r.u32(),
    maxDurationSamples: r.u32(),
  };

  const totalSamples = r.u32();
  const hitDurationCap = r.u8() !== 0;

  const title = r.str();
  const artist = r.str();
  const type = r.str();
  const tracker = r.str();
  const numChannels = r.u32();
  const numOrders = r.u32();
  const numPatterns = r.u32();
  const numInstruments = r.u32();
  const numSamples = r.u32();
  const instrumentNames: string[] = [];
  for (let i = r.u32(); i > 0; i--) instrumentNames.push(r.str());
  const sampleNames: string[] = [];
  for (let i = r.u32(); i > 0; i--) sampleNames.push(r.str());
  const meta: LevelDataMeta = {
    title,
    artist,
    type,
    tracker,
    numChannels,
    numOrders,
    numPatterns,
    numInstruments,
    numSamples,
    instrumentNames,
    sampleNames,
  };

  const orderPatterns = r.u16Array(r.u32());

  const rowCount = r.u32();
  const rows: LevelDataRows = {
    timeSamples: r.u32Array(rowCount),
    order: r.u16Array(rowCount),
    pattern: r.u16Array(rowCount),
    row: r.u16Array(rowCount),
    speed: r.u16Array(rowCount),
    tempo: r.u16Array(rowCount),
  };

  const noteCount = r.u32();
  const notes: LevelDataNotes = {
    timeSamples: r.u32Array(noteCount),
    channel: r.bytes(noteCount),
    instrument: r.bytes(noteCount),
    resolvedInstrument: r.bytes(noteCount),
    note: r.bytes(noteCount),
    volume: r.bytes(noteCount),
    volumeEffect: r.bytes(noteCount),
    effect: r.bytes(noteCount),
    effectParam: r.bytes(noteCount),
  };

  const frameCount = r.u32();
  const spectrumSize = frameCount * params.bandCount;
  const vuSize = frameCount * numChannels;
  const frames: LevelDataFrames = {
    frameCount,
    spectrumLeft: r.bytes(spectrumSize),
    spectrumRight: r.bytes(spectrumSize),
    vuLeft: r.bytes(vuSize),
    vuRight: r.bytes(vuSize),
  };

  if (!r.atEnd()) throw new Error('LevelData: trailing bytes after the last field');

  return {
    formatVersion,
    genVersion,
    libopenmptVersion,
    params,
    totalSamples,
    hitDurationCap,
    meta,
    orderPatterns,
    rows,
    notes,
    frames,
  };
}
