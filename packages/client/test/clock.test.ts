import { describe, expect, it } from 'vitest';
import { SongClock } from '../src/audio/clock.ts';

describe('SongClock', () => {
  it('reads 0 while stopped', () => {
    const clock = new SongClock();
    expect(clock.seconds(12)).toBe(0);
    expect(clock.startTime).toBeNull();
  });

  it('holds -latency + offset until the worklet anchors it', () => {
    const clock = new SongClock();
    clock.userOffsetMs = 10;
    clock.starting(0.04);
    expect(clock.seconds(5)).toBeCloseTo(-0.03, 9);
    expect(clock.startTime).toBeNull();
  });

  it('follows (currentTime - startTime) - latency + offset', () => {
    const clock = new SongClock();
    clock.starting(0.02);
    clock.anchor(48_000 * 3, 0.02); // first frame rendered at context time 3 s
    expect(clock.startTime).toBe(3);
    expect(clock.seconds(3)).toBeCloseTo(-0.02, 9);
    expect(clock.seconds(4.52)).toBeCloseTo(1.5, 9);
    expect(clock.samples(4.52)).toBe(72_000);
    clock.userOffsetMs = -200;
    expect(clock.seconds(4.52)).toBeCloseTo(1.3, 9);
  });

  it('freezes while paused and continues without a jump', () => {
    const clock = new SongClock();
    clock.anchor(0, 0.01);
    clock.pause(2);
    const paused = clock.seconds(2);
    expect(clock.seconds(2)).toBe(paused);
    // A suspended context's currentTime stays at 2; it moves on again after resume.
    clock.resume();
    expect(clock.seconds(2)).toBe(paused);
    expect(clock.seconds(2.5) - paused).toBeCloseTo(0.5, 9);
  });

  it('takes the first nonzero latency, then keeps it', () => {
    const clock = new SongClock();
    clock.anchor(0, 0);
    clock.refineLatency(0.03);
    expect(clock.latency).toBe(0.03);
    clock.refineLatency(0.05);
    expect(clock.latency).toBe(0.03);
  });

  it('reads 0 again after stop', () => {
    const clock = new SongClock();
    clock.anchor(0, 0);
    clock.stop();
    expect(clock.seconds(10)).toBe(0);
  });
});
