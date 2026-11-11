// The per-frame cost meter behind ?perf=1 and its on-screen readout.
import { describe, expect, it } from 'vitest';
import { PerfMeter, perfReport, perfText } from '../src/game/perf.ts';

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

  it('counts frames a second since the reset, past the frames it keeps', () => {
    const m = new PerfMeter(4, 1000);
    for (let i = 0; i < 6; i++) m.record(1);
    expect(m.fps(1100)).toBe(60);
    expect(m.summary().frames).toBe(4);
    m.reset(2000);
    expect(m.fps(2000)).toBe(0);
    m.record(1);
    expect(m.fps(2500)).toBe(2);
  });

  it("reports a run's level, song, difficulty, window and frames in three lines", () => {
    const m = new PerfMeter();
    for (let i = 1; i <= 21; i++) m.record(i / 10);
    const context = { where: 'Level 3', song: 'CHiP_OVERTURE', difficulty: 'Hard', width: 915, height: 412, pixelRatio: 2.625, crt: true };
    expect(perfReport(context, 119.84, m.summary())).toEqual([
      'Perf  Level 3  CHiP_OVERTURE  Hard',
      '119.8 fps  21 frames  915x412 x2.63  CRT on',
      'Work ms  mean 1.1  p95 2.0  p99 2.1  max 2.1',
    ]);
  });
});
