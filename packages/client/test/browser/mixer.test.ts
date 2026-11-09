// The effects mixer in real browsers: buffers, panning, the echo's feedback loop and the
// generated reverb, rendered offline.

import { SAMPLE_RATE } from '@game/core';
import { describe, expect, it } from 'vitest';
import { EFFECTS, effectLayers } from '../../src/audio/effects.ts';
import { duration } from '@game/chipfx';
import { EffectsMixer, MAX_VOICES } from '../../src/audio/mixer.ts';

function level(data: Float32Array, from: number, to: number): number {
  let peak = 0;
  for (let i = Math.floor(from * SAMPLE_RATE); i < Math.min(data.length, to * SAMPLE_RATE); i++) {
    peak = Math.max(peak, Math.abs(data[i]!));
  }
  return peak;
}

describe('effects mixer', () => {
  it('plays a boom with an echo and reverb tail past its own end', async () => {
    const context = new OfflineAudioContext(2, SAMPLE_RATE * 3, SAMPLE_RATE);
    const mixer = new EffectsMixer(context);
    mixer.volume = 1;
    expect(mixer.play('bomb', -0.5)).toBe(true);
    const out = await context.startRendering();
    const left = out.getChannelData(0);
    const right = out.getChannelData(1);
    expect(left.every((v) => Number.isFinite(v))).toBe(true);
    const dry = Math.max(...effectLayers('bomb').map(duration));
    expect(level(left, 0, 0.2)).toBeGreaterThan(0.2);
    // Panned left, so louder on the left.
    expect(level(left, 0, 0.2)).toBeGreaterThan(level(right, 0, 0.2));
    // The reverb and echo carry on after the dry sound has ended.
    expect(level(left, dry + 0.05, dry + 0.5)).toBeGreaterThan(0.002);
    expect(level(left, 0, 3)).toBeLessThanOrEqual(1);
  });

  it('is silent at volume 0 and keeps to MAX_VOICES', async () => {
    const context = new OfflineAudioContext(2, SAMPLE_RATE, SAMPLE_RATE);
    const mixer = new EffectsMixer(context);
    mixer.volume = 0;
    expect(mixer.play('shot')).toBe(false);
    mixer.volume = 1;
    let played = 0;
    for (let i = 0; i < MAX_VOICES + 5; i++) if (mixer.play('killShip')) played++;
    expect(played).toBe(MAX_VOICES);
    // A more important sound still gets a voice.
    expect(EFFECTS.nuke.priority).toBeGreaterThan(EFFECTS.killShip.priority);
    expect(mixer.play('nuke')).toBe(true);
    await context.startRendering();
  });
});
