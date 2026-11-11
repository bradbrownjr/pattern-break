// The per-frame cost meter behind ?perf=1 and its on-screen readout.
import { describe, expect, it } from 'vitest';
import { PerfMeter, perfText } from '../src/game/perf.ts';

describe('PerfMeter', () => {
  it('summarizes every frame kept, or the last few', () => {
    const m = new PerfMeter(4);
    for (const ms of [9, 1, 2, 3, 4]) m.record(ms);
    expect(m.summary().frames).toBe(4);
    expect(m.summary().maxMs).toBe(4);
    expect(m.summary(2)).toMatchObject({ frames: 2, meanMs: 3.5, maxMs: 4 });
    expect(m.summary(10).frames).toBe(4);
    m.reset();
    expect(m.summary()).toMatchObject({ frames: 0, meanMs: 0, p95Ms: 0 });
  });

  it('reads as frames a second, the mean and the 95th percentile', () => {
    const m = new PerfMeter();
    for (let i = 1; i <= 21; i++) m.record(i / 10);
    expect(perfText(59.6, m.summary())).toBe('60 fps  1.1 ms  p95 2.0');
  });
});
