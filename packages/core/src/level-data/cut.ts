// The arcade run's length cap (docs/PLAN.md, "Level length"): a long song's arcade level
// ends at a pattern boundary instead of at the song's end.

import { ANALYSIS_SAMPLE_RATE } from '../version.ts';
import type { LevelData } from './types.ts';

/** An arcade level ends by 2:30 of play, at its difficulty's tempo (Brad, 2026-11-14). */
export const ARCADE_MAX_SAMPLES = 150 * ANALYSIS_SAMPLE_RATE;

/**
 * Where `data` would be cut to end by `maxSamples`: the start of the last order (a step in
 * the song's pattern list) that begins after the song's start and by `maxSamples`, or the
 * last row by then when no order does. `data.totalSamples` when the song already ends by
 * then.
 */
export function cutSample(data: LevelData, maxSamples: number): number {
  if (data.totalSamples <= maxSamples) return data.totalSamples;
  const { timeSamples, order } = data.rows;
  let boundary = 0;
  let lastRow = 0;
  for (let r = 1; r < timeSamples.length; r++) {
    const t = timeSamples[r]!;
    if (t > maxSamples) break;
    if (t === 0) continue;
    lastRow = t;
    if (order[r] !== order[r - 1]) boundary = t;
  }
  if (boundary > 0) return boundary;
  return lastRow > 0 ? lastRow : maxSamples;
}

/**
 * `data` ending at cutSample(data, maxSamples): the rows and notes from then on dropped, and
 * the analysis frames taken after it. Returns `data` itself when nothing is cut. The arrays
 * are views of `data`'s.
 */
export function cutLevelData(data: LevelData, maxSamples: number): LevelData {
  const end = cutSample(data, maxSamples);
  if (end >= data.totalSamples) return data;
  const before = (times: Uint32Array) => {
    let n = 0;
    while (n < times.length && times[n]! < end) n++;
    return n;
  };
  const r = before(data.rows.timeSamples);
  const n = before(data.notes.timeSamples);
  const rows = data.rows;
  const notes = data.notes;
  const frames = data.frames;
  let frameCount = Math.floor(end / data.params.hopFrames);
  if (frameCount > frames.frameCount) frameCount = frames.frameCount;
  const bands = frameCount * data.params.bandCount;
  const vu = frameCount * data.meta.numChannels;
  return {
    ...data,
    totalSamples: end,
    rows: {
      timeSamples: rows.timeSamples.subarray(0, r),
      order: rows.order.subarray(0, r),
      pattern: rows.pattern.subarray(0, r),
      row: rows.row.subarray(0, r),
      speed: rows.speed.subarray(0, r),
      tempo: rows.tempo.subarray(0, r),
    },
    notes: {
      timeSamples: notes.timeSamples.subarray(0, n),
      channel: notes.channel.subarray(0, n),
      instrument: notes.instrument.subarray(0, n),
      resolvedInstrument: notes.resolvedInstrument.subarray(0, n),
      note: notes.note.subarray(0, n),
      volume: notes.volume.subarray(0, n),
      volumeEffect: notes.volumeEffect.subarray(0, n),
      effect: notes.effect.subarray(0, n),
      effectParam: notes.effectParam.subarray(0, n),
    },
    frames: {
      frameCount,
      spectrumLeft: frames.spectrumLeft.subarray(0, bands),
      spectrumRight: frames.spectrumRight.subarray(0, bands),
      vuLeft: frames.vuLeft.subarray(0, vu),
      vuRight: frames.vuRight.subarray(0, vu),
    },
  };
}
