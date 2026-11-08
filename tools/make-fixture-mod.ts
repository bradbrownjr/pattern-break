// Generates the test module packages/analysis/fixtures/pb-fixture-01.mod.
// Usage: node tools/make-fixture-mod.ts <out.mod>
//
// The module is a 4-channel ProTracker "M.K." file made with integer math only (no
// Math.random, no Math.sin), so the output is identical on every engine. Channel layout
// is the classic L R R L: channel 0 drums (left), channel 1 bass (right), channel 2 lead
// or pad (right), channel 3 hats or pad (left).

import { writeFileSync } from 'node:fs';

const ROWS = 64;
const CHANNELS = 4;
const SAMPLE_SLOTS = 31;

// ProTracker period table, finetune 0, C-1 to B-3.
const PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
] as const;

// Semitones within an octave.
const C = 0;
const D = 2;
const E = 4;
const F = 5;
const G = 7;
const A = 9;
const B = 11;
/** Index into PERIODS: C-1 is 0, C-2 is 12, C-3 is 24. */
const note = (semitone: number, octave: number): number => (octave - 1) * 12 + semitone;

// Sample numbers (1-based).
const KICK = 1;
const SNARE = 2;
const HAT = 3;
const BASS = 4;
const LEAD = 5;
const PAD = 6;

// Effect numbers.
const FX_ARP = 0x0;
const FX_PORTA_UP = 0x1;
const FX_PORTA_DOWN = 0x2;
const FX_TONE_PORTA = 0x3;
const FX_VIBRATO = 0x4;
const FX_VOLSLIDE = 0xa;
const FX_JUMP = 0xb;
const FX_VOLUME = 0xc;
const FX_BREAK = 0xd;
const FX_EXTENDED = 0xe;
const FX_SPEED = 0xf;

interface Sample {
  name: string;
  data: Int8Array;
  volume: number;
  /** Loop start and length in bytes; length 0 means no loop. */
  loopStart: number;
  loopLength: number;
}

// ---- sample synthesis (integers only) ----

const idiv = (a: number, b: number): number => Math.trunc(a / b);
const clamp8 = (v: number): number => (v > 127 ? 127 : v < -128 ? -128 : v);

/** Triangle wave from an 8-bit phase: -128 to 127. */
const tri = (phase: number): number => {
  const p = phase & 255;
  return p < 128 ? p * 2 - 128 : 383 - p * 2;
};

/** 16-bit Galois LFSR; each call returns a signed byte. */
const lfsr = (): (() => number) => {
  let state = 0xace1;
  return () => {
    const lsb = state & 1;
    state >>>= 1;
    if (lsb) state ^= 0xb400;
    return ((state >>> 3) & 0xff) - 128;
  };
};

const makeKick = (): Sample => {
  const n = 1600;
  const data = new Int8Array(n);
  // Phase increment in 1/16 phase units per sample, stepped down to fake a pitch drop.
  const steps = [88, 72, 60, 50, 42, 36, 32];
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const inc = steps[Math.min(steps.length - 1, idiv(i * steps.length, 700))] ?? 32;
    phase += inc;
    const env = idiv((n - i) * (n - i) * 256, n * n);
    data[i] = clamp8(idiv(tri(phase >> 4) * env, 256));
  }
  data[0] = 0;
  data[1] = 0;
  return { name: 'kick: tri, stepped pitch drop', data, volume: 64, loopStart: 0, loopLength: 0 };
};

const makeSnare = (): Sample => {
  const n = 2400;
  const data = new Int8Array(n);
  const noise = lfsr();
  let phase = 0;
  for (let i = 0; i < n; i++) {
    phase += 40;
    const env = idiv((n - i) * 256, n);
    const bodyEnv = i < 300 ? idiv((300 - i) * 256, 300) : 0;
    const v = idiv(idiv(noise() * env, 256) * 3, 4) + idiv(tri(phase >> 4) * bodyEnv, 512);
    data[i] = clamp8(v);
  }
  data[0] = 0;
  data[1] = 0;
  return { name: 'snare: noise burst', data, volume: 56, loopStart: 0, loopLength: 0 };
};

const makeHat = (): Sample => {
  const n = 480;
  const data = new Int8Array(n);
  const noise = lfsr();
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const cur = noise();
    const high = idiv(cur - prev, 2);
    prev = cur;
    const env = idiv((n - i) * (n - i) * 256, n * n);
    data[i] = clamp8(idiv(high * env, 256));
  }
  data[0] = 0;
  data[1] = 0;
  return { name: 'closed hat: short hi noise', data, volume: 40, loopStart: 0, loopLength: 0 };
};

const makeBass = (): Sample => {
  const n = 64;
  const data = new Int8Array(n);
  for (let i = 0; i < n; i++) data[i] = i < 32 ? 100 : -100;
  return { name: 'bass: looped square', data, volume: 56, loopStart: 0, loopLength: n };
};

const makeLead = (): Sample => {
  const n = 32;
  const data = new Int8Array(n);
  for (let i = 0; i < n; i++) data[i] = idiv((i * 8 - 128) * 3, 4);
  return { name: 'lead: looped saw', data, volume: 40, loopStart: 0, loopLength: n };
};

const makePad = (): Sample => {
  // Two ramp cycles (attack), then two full-level cycles that loop.
  const n = 256;
  const data = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    const env = i < 64 ? 96 : i < 128 ? 192 : 256;
    data[i] = clamp8(idiv(tri((i % 64) * 4) * env * 3, 1024));
  }
  return { name: 'pad: long looped triangle', data, volume: 40, loopStart: 128, loopLength: 128 };
};

// ---- pattern building ----

interface Cell {
  note: number | null;
  sample: number;
  effect: number;
  param: number;
}

type Pattern = Cell[][];

const newPattern = (): Pattern =>
  Array.from({ length: ROWS }, () =>
    Array.from({ length: CHANNELS }, (): Cell => ({ note: null, sample: 0, effect: 0, param: 0 })),
  );

const cellAt = (p: Pattern, row: number, ch: number): Cell => {
  const c = p[row]?.[ch];
  if (!c) throw new Error(`bad cell ${row},${ch}`);
  return c;
};

const put = (
  p: Pattern, row: number, ch: number, n: number, sample: number, effect = 0, param = 0,
): void => {
  const c = cellAt(p, row, ch);
  c.note = n;
  c.sample = sample;
  c.effect = effect;
  c.param = param;
};

/** Set an effect on a cell. On a cell with no note the channel keeps playing. */
const fx = (p: Pattern, row: number, ch: number, effect: number, param: number): void => {
  const c = cellAt(p, row, ch);
  c.effect = effect;
  c.param = param;
};

// Chord roots per bar: A minor, F, C, G.
const ROOTS = [A, F, C, G] as const;
const BASS_OCT = [1, 1, 2, 1] as const;
const ARP_MINOR = 0x37;
const ARP_MAJOR = 0x47;
const arpFor = (bar: number): number => (bar === 0 ? ARP_MINOR : ARP_MAJOR);
const bassNote = (bar: number, up = 0): number =>
  note(ROOTS[bar] ?? 0, BASS_OCT[bar] ?? 1) + up;

const kickAt = (p: Pattern, row: number): void => put(p, row, 0, note(C, 2), KICK);
const snareAt = (p: Pattern, row: number): void => put(p, row, 0, note(C, 2), SNARE);
const hats = (p: Pattern, step: number): void => {
  for (let r = 0; r < ROWS; r += step) {
    put(p, r, 3, note(C, 3), HAT, FX_VOLUME, r % (step * 2) === 0 ? 0x30 : 0x18);
  }
};

// P0: intro. Kick and hats, arpeggiated bass. Sets speed 6 and tempo 125.
const pattern0 = (): Pattern => {
  const p = newPattern();
  for (let bar = 0; bar < 4; bar++) {
    const b = bar * 16;
    kickAt(p, b);
    kickAt(p, b + 8);
    put(p, b, 1, bassNote(bar), BASS, FX_ARP, arpFor(bar));
    put(p, b + 8, 1, bassNote(bar), BASS);
  }
  hats(p, 2);
  fx(p, 0, 0, FX_SPEED, 0x06);
  put(p, 0, 3, note(C, 3), HAT, FX_SPEED, 0x7d);
  return p;
};

const MELODY: ReadonlyArray<ReadonlyArray<readonly [row: number, n: number]>> = [
  [[0, note(E, 3)], [4, note(G, 3)], [8, note(A, 3)], [12, note(G, 3)]],
  [[0, note(A, 3)], [4, note(F, 3)], [8, note(E, 3)], [12, note(D, 3)]],
  [[0, note(E, 3)], [4, note(G, 3)], [8, note(E, 3)], [12, note(C, 3)]],
  [[0, note(D, 3)], [4, note(G, 3)], [8, note(B, 3)], [12, note(A, 3)]],
];

const eighthBass = (p: Pattern): void => {
  for (let bar = 0; bar < 4; bar++) {
    const b = bar * 16;
    for (const [off, up] of [[0, 0], [3, 0], [6, 12], [8, 0], [11, 0], [14, 12]] as const) {
      put(p, b + off, 1, bassNote(bar, up), BASS);
    }
  }
};

const melody = (p: Pattern, vibratoOffset: number | null): void => {
  for (let bar = 0; bar < 4; bar++) {
    for (const [off, n] of MELODY[bar] ?? []) {
      const r = bar * 16 + off;
      if (off === vibratoOffset) put(p, r, 2, n, LEAD, FX_VIBRATO, 0x46);
      else put(p, r, 2, n, LEAD);
    }
  }
};

const backbeat = (p: Pattern): void => {
  for (let bar = 0; bar < 4; bar++) {
    const b = bar * 16;
    kickAt(p, b);
    snareAt(p, b + 4);
    kickAt(p, b + 8);
    kickAt(p, b + 10);
    snareAt(p, b + 12);
  }
};

// P1: verse. Full drums, eighth-note bass, lead with vibrato. Tempo 140 from row 32.
const pattern1 = (): Pattern => {
  const p = newPattern();
  backbeat(p);
  eighthBass(p);
  melody(p, 8);
  hats(p, 2);
  fx(p, 32, 0, FX_SPEED, 0x8c);
  return p;
};

// P2: bridge. Pad on channel 3, sparse kick, portamento and volume slides.
const pattern2 = (): Pattern => {
  const p = newPattern();
  for (const r of [0, 16, 32, 48]) kickAt(p, r);
  fx(p, 0, 0, FX_SPEED, 0x06);
  // Bass: tempo, tone portamento, slide up, slide down, volume slide.
  put(p, 0, 1, note(A, 1), BASS, FX_SPEED, 0x8c);
  put(p, 8, 1, note(C, 2), BASS, FX_TONE_PORTA, 0x10);
  for (let r = 9; r < 16; r++) fx(p, r, 1, FX_TONE_PORTA, 0x00);
  put(p, 16, 1, note(F, 1), BASS);
  for (let r = 20; r < 24; r++) fx(p, r, 1, FX_PORTA_UP, 0x06);
  put(p, 32, 1, note(C, 2), BASS);
  for (let r = 40; r < 44; r++) fx(p, r, 1, FX_PORTA_DOWN, 0x06);
  put(p, 48, 1, note(G, 1), BASS);
  for (let r = 56; r < 60; r++) fx(p, r, 1, FX_VOLSLIDE, 0x04);
  // Pad with arpeggio chords.
  put(p, 0, 3, note(A, 2), PAD, FX_ARP, ARP_MINOR);
  fx(p, 8, 3, FX_ARP, ARP_MINOR);
  put(p, 16, 3, note(F, 2), PAD, FX_ARP, ARP_MAJOR);
  put(p, 32, 3, note(C, 2), PAD, FX_ARP, ARP_MAJOR);
  put(p, 48, 3, note(G, 2), PAD, FX_ARP, ARP_MAJOR);
  fx(p, 56, 3, FX_ARP, ARP_MAJOR);
  // Lead: vibrato, portamento up and down, tone portamento, volume slide, set volume.
  put(p, 0, 2, note(E, 3), LEAD, FX_VIBRATO, 0x46);
  put(p, 16, 2, note(A, 3), LEAD);
  for (let r = 20; r < 24; r++) fx(p, r, 2, FX_PORTA_UP, 0x06);
  put(p, 32, 2, note(G, 3), LEAD);
  for (let r = 36; r < 40; r++) fx(p, r, 2, FX_PORTA_DOWN, 0x05);
  put(p, 48, 2, note(E, 3), LEAD);
  put(p, 52, 2, note(D, 3), LEAD, FX_TONE_PORTA, 0x08);
  for (let r = 53; r < 56; r++) fx(p, r, 2, FX_TONE_PORTA, 0x00);
  for (let r = 56; r < 60; r++) fx(p, r, 2, FX_VOLSLIDE, 0x04);
  fx(p, 62, 2, FX_VOLUME, 0x10);
  return p;
};

// P3: breakdown. Speed 4, E6x loop of rows 8 to 15 (three repeats), speed back to 6 at
// row 32, pattern break at row 47 to row 8 of the next order.
const pattern3 = (): Pattern => {
  const p = newPattern();
  backbeat(p);
  eighthBass(p);
  hats(p, 2);
  const chords = [[0, note(A, 3)], [16, note(F, 3)], [32, note(C, 3)], [48, note(G, 3)]] as const;
  for (const [r, n] of chords) put(p, r, 2, n, LEAD, FX_ARP, r === 0 ? ARP_MINOR : ARP_MAJOR);
  fx(p, 0, 0, FX_SPEED, 0x04);
  fx(p, 8, 3, FX_EXTENDED, 0x60);
  fx(p, 15, 3, FX_EXTENDED, 0x63);
  fx(p, 32, 0, FX_SPEED, 0x06);
  fx(p, 47, 2, FX_BREAK, 0x08);
  return p;
};

// P4: outro. Drums, bass, lead; position jump back to order 2 on the last row.
const pattern4 = (): Pattern => {
  const p = newPattern();
  backbeat(p);
  eighthBass(p);
  melody(p, null);
  hats(p, 4);
  for (const r of [56, 58, 60, 62]) snareAt(p, r);
  fx(p, 63, 2, FX_JUMP, 0x02);
  return p;
};

// ---- file assembly ----

const ORDER = [0, 1, 2, 1, 3, 2, 4] as const;

const asciiPadded = (s: string, len: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < len; i++) out.push(i < s.length ? s.charCodeAt(i) & 0x7f : 0);
  return out;
};

export function makeFixtureMod(): Uint8Array {
  const samples: Sample[] = [makeKick(), makeSnare(), makeHat(), makeBass(), makeLead(), makePad()];
  const patterns = [pattern0(), pattern1(), pattern2(), pattern3(), pattern4()];

  const out: number[] = [];
  out.push(...asciiPadded('pb fixture 01', 20));

  for (let i = 0; i < SAMPLE_SLOTS; i++) {
    const s = samples[i];
    if (!s) {
      out.push(...asciiPadded('', 22), 0, 0, 0, 0, 0, 0, 0, 1);
      continue;
    }
    const words = s.data.length >> 1;
    out.push(...asciiPadded(s.name, 22));
    out.push((words >> 8) & 0xff, words & 0xff);
    out.push(0, s.volume);
    if (s.loopLength > 0) {
      const ls = s.loopStart >> 1;
      const ll = s.loopLength >> 1;
      out.push((ls >> 8) & 0xff, ls & 0xff, (ll >> 8) & 0xff, ll & 0xff);
    } else {
      out.push(0, 0, 0, 1);
    }
  }

  out.push(ORDER.length, 127);
  for (let i = 0; i < 128; i++) out.push(ORDER[i] ?? 0);
  out.push(...asciiPadded('M.K.', 4));

  for (const p of patterns) {
    for (const row of p) {
      for (const c of row) {
        const period = c.note === null ? 0 : (PERIODS[c.note] ?? 0);
        out.push(
          (c.sample & 0xf0) | (period >> 8),
          period & 0xff,
          ((c.sample & 0x0f) << 4) | c.effect,
          c.param,
        );
      }
    }
  }

  for (const s of samples) for (const v of s.data) out.push(v & 0xff);
  return Uint8Array.from(out);
}

if (import.meta.main) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: node tools/make-fixture-mod.ts <out.mod>');
    process.exit(1);
  }
  writeFileSync(target, makeFixtureMod());
}
