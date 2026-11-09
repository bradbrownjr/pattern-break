import { SAMPLES_PER_TICK } from '@game/core';
import { describe, expect, it } from 'vitest';
import { syntheticLevelData } from '../../core/test/level-fixtures.ts';
import { SongNotes, pitchClassOf } from '../src/audio/song-notes.ts';

const T = SAMPLES_PER_TICK;

describe('pitchClassOf', () => {
  it('counts from C-0 = 1, so C-5 (OpenMPT NOTE_MIDDLEC, 61) is C', () => {
    expect(pitchClassOf(1)).toBe(0);
    expect(pitchClassOf(61)).toBe(0);
    expect(pitchClassOf(62)).toBe(1);
    expect(pitchClassOf(60)).toBe(11);
  });
});

describe('SongNotes', () => {
  // Instrument 1 plays a tune; instrument 2 is a drum (one pitch over and over).
  const notes = [
    { time: 10 * T, instrument: 1, note: 61 }, // C
    { time: 10 * T, instrument: 2, note: 50, channel: 1 },
    { time: 50 * T, instrument: 1, note: 68 }, // G
    { time: 50 * T, instrument: 3, note: 66, channel: 2 }, // F, lower than G
    { time: 90 * T, instrument: 2, note: 50, channel: 1 },
    { time: 120 * T, instrument: 3, note: 76, channel: 2 }, // D#, the highest at its tick
  ];
  for (let k = 0; k < 40; k++) notes.push({ time: (130 + k) * T, instrument: 2, note: 50, channel: 1 });
  // Late in the song, 1 and 3 play eight different notes each, so findDrums sees tunes
  // (a drum's three commonest pitches are 95% of its notes).
  for (let k = 0; k < 8; k++) {
    notes.push({ time: (180 + k) * T, instrument: 1, note: 30 + k });
    notes.push({ time: (190 + k) * T, instrument: 3, note: 20 + k, channel: 2 });
  }
  notes.sort((a, b) => a.time - b.time);
  const songNotes = new SongNotes(syntheticLevelData({ rowLengths: Array(200).fill(T), notes }));

  it("gives an instrument's latest note at or before the tick", () => {
    expect(songNotes.pitchAt(1, 10)).toBe(0);
    expect(songNotes.pitchAt(1, 49)).toBe(0);
    expect(songNotes.pitchAt(1, 50)).toBe(7);
    expect(songNotes.pitchAt(3, 150)).toBe(3);
  });

  it('follows the melody for a drum, or before an instrument has played', () => {
    expect(songNotes.pitchAt(2, 60)).toBe(7);
    expect(songNotes.pitchAt(3, 20)).toBe(0);
    expect(songNotes.melodyAt(5)).toBe(0);
    expect(songNotes.melodyAt(119)).toBe(7);
    expect(songNotes.melodyAt(120)).toBe(3);
  });
});
