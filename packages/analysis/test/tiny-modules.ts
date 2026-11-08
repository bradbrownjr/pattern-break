// Tiny tracker modules built in memory, for the libopenmpt binding tests. The golden
// fixtures for the analysis pipeline live in fixtures/; these only cover what the binding
// tests check.

interface Cell {
  period?: number;
  sample?: number;
  effect?: number;
  param?: number;
}

const ROWS = 64;

/**
 * A 4-channel ProTracker M.K. module: one looped square-wave sample and two patterns played
 * in order 0, 1. Speed 3 at 125 BPM makes a row 0.06 s. Pattern 0 ends at row 16 with a
 * pattern break (D00); pattern 1 ends at row 8 with a position jump back to order 0 (B00),
 * which libopenmpt treats as the song end. 17 + 9 rows make 1.56 s.
 */
export function buildMod(): Uint8Array {
  const channels = 4;
  const patterns: Cell[][][] = [0, 1].map(() =>
    Array.from({ length: ROWS }, () => Array.from({ length: channels }, () => ({}))),
  );
  const set = (pattern: number, row: number, channel: number, cell: Cell) => {
    patterns[pattern]![row]![channel] = cell;
  };
  set(0, 0, 0, { period: 428, sample: 1, effect: 0x0, param: 0x37 }); // arpeggio
  set(0, 0, 1, { period: 214, sample: 1, effect: 0x4, param: 0x46 }); // vibrato
  set(0, 0, 3, { effect: 0xf, param: 0x03 }); // speed 3
  set(0, 4, 2, { period: 320, sample: 1, effect: 0xa, param: 0x04 }); // volume slide down
  set(0, 8, 3, { period: 285, sample: 1 });
  set(0, 16, 0, { effect: 0xd, param: 0x00 }); // pattern break
  set(1, 0, 0, { period: 381, sample: 1 });
  set(1, 0, 1, { period: 285, sample: 1 });
  set(1, 0, 2, { period: 254, sample: 1 });
  set(1, 0, 3, { period: 214, sample: 1 });
  set(1, 8, 0, { effect: 0xb, param: 0x00 }); // position jump

  const sampleBytes = 32;
  const out = new Writer(20 + 31 * 30 + 2 + 128 + 4 + patterns.length * ROWS * channels * 4 + sampleBytes);
  out.ascii(0, 'pattern break test');
  for (let s = 0; s < 31; s++) {
    const h = 20 + s * 30;
    if (s === 0) {
      out.ascii(h, 'square');
      out.u16be(h + 22, sampleBytes / 2); // length in words
      out.u8(h + 25, 64); // volume
      out.u16be(h + 26, 0); // loop start
      out.u16be(h + 28, sampleBytes / 2); // loop length
    } else {
      out.u16be(h + 28, 1); // no loop
    }
  }
  let p = 20 + 31 * 30;
  out.u8(p, 2); // song length
  out.u8(p + 1, 127); // restart byte
  out.u8(p + 2, 0); // order list: 0, 1
  out.u8(p + 3, 1);
  p += 2 + 128;
  out.ascii(p, 'M.K.');
  p += 4;
  for (const pattern of patterns) {
    for (const row of pattern) {
      for (const { period = 0, sample = 0, effect = 0, param = 0 } of row) {
        out.u8(p++, (sample & 0xf0) | (period >> 8));
        out.u8(p++, period & 0xff);
        out.u8(p++, ((sample & 0x0f) << 4) | effect);
        out.u8(p++, param);
      }
    }
  }
  squareWave(out, p, sampleBytes);
  return out.bytes;
}

/**
 * A 1-channel Impulse Tracker module in sample mode: one pattern with one note, at speed 1,
 * on a looped sample whose auto-vibrato uses the random waveform. That waveform draws from
 * libopenmpt's playback PRNG on every tick, so the render shows whether the PRNG is seeded
 * the same way each time.
 */
export function buildRandomVibratoIt(): Uint8Array {
  const header = 192;
  const orders = 2;
  const sampleHeaderAt = header + orders + 4 + 4; // after the sample and pattern offsets
  const patternAt = sampleHeaderAt + 80;
  const packed = [0x81, 0x03, 60, 1, 0, ...Array<number>(ROWS - 1).fill(0)]; // C-5, sample 1
  const sampleAt = patternAt + 8 + packed.length;
  const sampleBytes = 32;
  const out = new Writer(sampleAt + sampleBytes);

  out.ascii(0, 'IMPM');
  out.ascii(4, 'random vibrato test');
  out.u16le(32, orders);
  out.u16le(34, 0); // instruments
  out.u16le(36, 1); // samples
  out.u16le(38, 1); // patterns
  out.u16le(40, 0x0214); // created with
  out.u16le(42, 0x0214); // compatible with
  out.u16le(44, 0x0001); // stereo, sample mode
  out.u8(48, 128); // global volume
  out.u8(49, 48); // mix volume
  out.u8(50, 1); // speed
  out.u8(51, 125); // tempo
  out.u8(52, 128); // stereo separation
  for (let c = 0; c < 64; c++) {
    out.u8(64 + c, c === 0 ? 32 : 0xa0); // channel 0 centre, the rest disabled
    out.u8(128 + c, 64);
  }
  out.u8(header, 0); // order list: 0, end
  out.u8(header + 1, 255);
  out.u32le(header + orders, sampleHeaderAt);
  out.u32le(header + orders + 4, patternAt);

  const s = sampleHeaderAt;
  out.ascii(s, 'IMPS');
  out.u8(s + 17, 64); // global volume
  out.u8(s + 18, 0x01 | 0x10); // has data, looped
  out.u8(s + 19, 64); // volume
  out.ascii(s + 20, 'square');
  out.u8(s + 46, 0x01); // signed
  out.u32le(s + 48, sampleBytes); // length
  out.u32le(s + 52, 0); // loop start
  out.u32le(s + 56, sampleBytes); // loop end
  out.u32le(s + 60, 8363); // C-5 speed
  out.u32le(s + 72, sampleAt);
  out.u8(s + 76, 32); // vibrato speed
  out.u8(s + 77, 32); // vibrato depth
  out.u8(s + 78, 255); // vibrato rate (sweep)
  out.u8(s + 79, 3); // vibrato waveform: random

  out.u16le(patternAt, packed.length);
  out.u16le(patternAt + 2, ROWS);
  packed.forEach((b, i) => out.u8(patternAt + 8 + i, b));
  squareWave(out, sampleAt, sampleBytes);
  return out.bytes;
}

function squareWave(out: Writer, at: number, length: number): void {
  for (let i = 0; i < length; i++) out.u8(at + i, i < length / 2 ? 64 : 0xc0); // +64, -64
}

class Writer {
  readonly bytes: Uint8Array;

  constructor(size: number) {
    this.bytes = new Uint8Array(size);
  }

  u8(at: number, value: number): void {
    this.bytes[at] = value;
  }

  u16be(at: number, value: number): void {
    this.u8(at, value >> 8);
    this.u8(at + 1, value & 0xff);
  }

  u16le(at: number, value: number): void {
    this.u8(at, value & 0xff);
    this.u8(at + 1, value >> 8);
  }

  u32le(at: number, value: number): void {
    for (let i = 0; i < 4; i++) this.u8(at + i, (value >>> (8 * i)) & 0xff);
  }

  ascii(at: number, text: string): void {
    for (let i = 0; i < text.length; i++) this.u8(at + i, text.charCodeAt(i));
  }
}
