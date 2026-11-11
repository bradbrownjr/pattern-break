// The Sync screen's arithmetic (docs/PLAN.md, "Audio and timing"): presses against clicks
// give the offset that puts the presses on the beat.
import { describe, expect, it } from 'vitest';
import { SYNC_INTERVAL_S, SYNC_PRESSES, SYNC_WARMUP, clampOffset, pressGaps, syncResult } from '../src/audio/sync.ts';
import { syncProgress } from '../src/game/sync-screen.ts';
import { syncText } from '../src/game/screens.ts';

const COUNT = SYNC_WARMUP + SYNC_PRESSES;
const clicks = Array.from({ length: COUNT + 4 }, (_, k) => 1 + k * SYNC_INTERVAL_S);

/** Presses `lateMs` after each click, with a fixed wobble of up to ±`jitterMs`. */
function presses(lateMs: number, jitterMs = 0): number[] {
  return clicks.slice(0, COUNT).map((c, k) => c + (lateMs + jitterMs * Math.sin(k * 2.4)) / 1000);
}

describe('sync', () => {
  it('measures each press against the nearest click, late positive', () => {
    const gaps = pressGaps([1, 1.5, 2], [1.08, 1.47, 2.2]);
    expect(gaps.map((g) => Math.round(g))).toEqual([80, -30, 200]);
  });

  it('gives the negated median gap, in 5 ms steps', () => {
    expect(syncResult(pressGaps(clicks, presses(80)))?.offsetMs).toBe(-80);
    expect(syncResult(pressGaps(clicks, presses(122, 15)))?.offsetMs).toBe(-120);
    expect(syncResult(pressGaps(clicks, presses(-40)))?.offsetMs).toBe(40);
  });

  it('drops the warm-up presses and the slips', () => {
    const p = presses(60);
    // The warm-up is wild, and two presses later on slip by 180 ms.
    p[0] = p[0]! + 0.2;
    p[1] = p[1]! - 0.15;
    p[SYNC_WARMUP + 3] = p[SYNC_WARMUP + 3]! + 0.18;
    p[SYNC_WARMUP + 9] = p[SYNC_WARMUP + 9]! + 0.18;
    const r = syncResult(pressGaps(clicks, p));
    expect(r?.offsetMs).toBe(-60);
    expect(r?.used).toBe(SYNC_PRESSES - 2);
    expect(r?.spreadMs).toBe(0);
  });

  it('gives no result when the presses are too uneven or too few', () => {
    // Presses spread evenly across the whole beat: no centre for half of them to sit near.
    const scattered = clicks.slice(0, COUNT).map((c, k) => c + ((k * 7) % 10) * 0.05 - 0.25);
    expect(syncResult(pressGaps(clicks, scattered))).toBeNull();
    expect(syncResult(pressGaps(clicks, presses(50).slice(0, SYNC_WARMUP + 7)))).toBeNull();
  });

  it('keeps the offset within -300 to +100 ms', () => {
    expect(clampOffset(-420)).toBe(-300);
    expect(clampOffset(160)).toBe(100);
    expect(clampOffset(-2)).toBe(0);
    expect(Object.is(clampOffset(-2), -0)).toBe(false);
    expect(clampOffset(-87.6)).toBe(-90);
  });

  it('shows the progress and the offset as terse text', () => {
    expect(syncProgress(0)).toBe('Warm-up');
    expect(syncProgress(SYNC_WARMUP)).toBe(`0/${SYNC_PRESSES}`);
    expect(syncProgress(COUNT)).toBe(`${SYNC_PRESSES}/${SYNC_PRESSES}`);
    expect([syncText(-120), syncText(0), syncText(25)]).toEqual(['-120 ms', '0 ms', '+25 ms']);
  });
});
