import { describe, expect, it } from 'vitest';
import { barBinEdges, barLevels } from '../src/render/spectrum.ts';

describe('barBinEdges', () => {
  it('rises on a log scale, with at least one bin per bar, inside the bin range', () => {
    const edges = barBinEdges(24, 1024, 48_000, 60, 14_000);
    expect(edges.length).toBe(25);
    // 46.875 Hz per bin: 60 Hz is bin 1, 14 kHz is bin 299.
    expect(edges[0]).toBe(1);
    expect(edges[24]).toBe(299);
    for (let b = 0; b < 24; b++) expect(edges[b + 1]!).toBeGreaterThan(edges[b]!);
    // Low bars are narrow and high bars wide.
    expect(edges[12]! - edges[11]!).toBeLessThan(edges[24]! - edges[23]!);
  });

  it('never goes past the last bin', () => {
    const edges = barBinEdges(8, 64, 48_000, 20, 30_000);
    expect(Math.max(...edges)).toBe(32);
  });
});

describe('barLevels', () => {
  it('lights each bar from the loudest bin in its range', () => {
    const bins = new Uint8Array([0, 255, 10, 128, 0, 0]);
    const out = new Uint8Array(3);
    barLevels(bins, Uint16Array.from([1, 2, 4, 6]), 12, out);
    expect([...out]).toEqual([12, 6, 0]);
  });
});
