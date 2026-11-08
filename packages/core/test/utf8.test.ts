import { describe, expect, it } from 'vitest';
import { decodeUtf8, encodeUtf8 } from '../src/utf8.ts';

const cases: Array<[name: string, text: string, bytes: number[]]> = [
  ['empty', '', []],
  ['ASCII', 'PBLD 1.0~', [0x50, 0x42, 0x4c, 0x44, 0x20, 0x31, 0x2e, 0x30, 0x7e]],
  ['Latin-1', 'café ÿ', [0x63, 0x61, 0x66, 0xc3, 0xa9, 0x20, 0xc3, 0xbf]],
  ['3-byte', '€日', [0xe2, 0x82, 0xac, 0xe6, 0x97, 0xa5]],
  ['4-byte', '\u{1f3b5}', [0xf0, 0x9f, 0x8e, 0xb5]],
  ['U+10FFFF', '\u{10ffff}', [0xf4, 0x8f, 0xbf, 0xbf]],
];

describe('encodeUtf8', () => {
  it.each(cases)('encodes %s', (_name, text, bytes) => {
    expect([...encodeUtf8(text)]).toEqual(bytes);
  });

  it('encodes a lone surrogate as U+FFFD', () => {
    expect([...encodeUtf8('a\ud800b')]).toEqual([0x61, 0xef, 0xbf, 0xbd, 0x62]);
    expect([...encodeUtf8('\udc00')]).toEqual([0xef, 0xbf, 0xbd]);
  });
});

describe('decodeUtf8', () => {
  it.each(cases)('decodes %s', (_name, text, bytes) => {
    expect(decodeUtf8(Uint8Array.from(bytes))).toBe(text);
  });

  it('replaces invalid sequences with U+FFFD', () => {
    expect(decodeUtf8(Uint8Array.from([0x61, 0xff, 0x62]))).toBe('a�b');
    // Truncated 3-byte sequence, then a valid byte.
    expect(decodeUtf8(Uint8Array.from([0xe2, 0x82, 0x41]))).toBe('�A');
    // Overlong encoding of '/'.
    expect(decodeUtf8(Uint8Array.from([0xc0, 0xaf]))).toBe('��');
    // Encoded surrogate.
    expect(decodeUtf8(Uint8Array.from([0xed, 0xa0, 0x80]))).toBe('���');
  });

  it('agrees with TextDecoder on every code point class', () => {
    const text = 'x\u007f\u0080߿ࠀ￿\u{10000}\u{10ffff}';
    expect([...encodeUtf8(text)]).toEqual([...new TextEncoder().encode(text)]);
    expect(decodeUtf8(encodeUtf8(text))).toBe(text);
  });
});
