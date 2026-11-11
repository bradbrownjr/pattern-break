// The Sync screen's clicks on a real audio engine: they start on the frames the session
// says they do, and presses taken against them give the offset (docs/PLAN.md, "Audio and
// timing").

import { SAMPLE_RATE } from '@game/core';
import { describe, expect, it } from 'vitest';
import { SYNC_PRESSES, SYNC_WARMUP, SyncSession } from '../../src/audio/sync.ts';

describe('sync session', () => {
  it('plays each click on its scheduled frame, and measures a late press', async () => {
    const context = new OfflineAudioContext(1, SAMPLE_RATE * 14, SAMPLE_RATE);
    // The latency the song clock would subtract; the player hears each click that much
    // after its context time and presses 50 ms after hearing it.
    const latency = 0.08;
    const session = new SyncSession(context, () => latency);
    session.start();
    const rendered = await context.startRendering();
    const data = rendered.getChannelData(0);

    const onsets: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]!) > 1e-4 && (onsets.length === 0 || i - onsets[onsets.length - 1]! > SAMPLE_RATE / 10)) onsets.push(i);
    }
    expect(onsets.length).toBe(session.clicks.length);
    onsets.forEach((frame, k) => expect(Math.abs(frame - session.clicks[k]! * SAMPLE_RATE)).toBeLessThanOrEqual(1));

    for (let k = 0; k < SYNC_WARMUP + SYNC_PRESSES; k++) session.press(session.clicks[k]! + latency + 0.05);
    expect(session.done).toBe(true);
    expect(session.result()?.offsetMs).toBe(-50);
    session.stop();
  });
});
