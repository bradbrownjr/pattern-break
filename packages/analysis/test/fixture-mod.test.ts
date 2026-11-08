import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { makeFixtureMod } from '../../../tools/make-fixture-mod.ts';

const fixturePath = fileURLToPath(new URL('../fixtures/pb-fixture-01.mod', import.meta.url));

const ascii = (bytes: Uint8Array, start: number, len: number): string =>
  String.fromCharCode(...bytes.subarray(start, start + len)).replace(/\0+$/, '');

describe('pb-fixture-01.mod', () => {
  const committed = new Uint8Array(readFileSync(fixturePath));

  it('matches what tools/make-fixture-mod.ts generates', () => {
    const generated = makeFixtureMod();
    expect(generated.length).toBe(committed.length);
    expect(Buffer.from(generated).equals(Buffer.from(committed))).toBe(true);
  });

  it('has a valid ProTracker M.K. header', () => {
    expect(ascii(committed, 0, 20)).toBe('pb fixture 01');
    expect(ascii(committed, 1080, 4)).toBe('M.K.');
    const songLength = committed[950] ?? 0;
    expect(songLength).toBeGreaterThan(0);
    expect(songLength).toBeLessThanOrEqual(128);
    expect(committed[951]).toBe(127);
  });

  it('references only existing patterns', () => {
    const songLength = committed[950] ?? 0;
    const orders = Array.from(committed.subarray(952, 952 + 128));
    const patternCount = Math.max(...orders) + 1;
    for (const o of orders.slice(0, songLength)) expect(o).toBeLessThan(patternCount);
    expect(new Set(orders.slice(0, songLength)).size).toBeLessThan(songLength);
  });

  it('has sample lengths that match the data size', () => {
    const orders = Array.from(committed.subarray(952, 952 + 128));
    const patternCount = Math.max(...orders) + 1;
    let sampleBytes = 0;
    for (let i = 0; i < 31; i++) {
      const at = 20 + i * 30;
      sampleBytes += (((committed[at + 22] ?? 0) << 8) | (committed[at + 23] ?? 0)) * 2;
    }
    const dataStart = 1084 + patternCount * 64 * 4 * 4;
    expect(committed.length - dataStart).toBe(sampleBytes);
  });
});
