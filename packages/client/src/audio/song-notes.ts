// The song's notes by tick, so a sound effect can take its pitch from the music
// (docs/SOUND-EFFECTS.md, "Pitched to the song"). Cosmetic: built in the client from the
// LevelData the level came from, never part of the sim.

import { SAMPLES_PER_TICK, findDrums, type LevelData } from '@game/core';

/** Pitch classes, C = 0 to B = 11. */
export type PitchClass = number;

/**
 * Pattern notes are 1 to 120 with 1 = C-0 (OpenMPT's NOTE_MIN; NOTE_MIDDLEC = 61 = C-5).
 * The sample's own tuning can move the pitch that sounds, so this is the written note.
 */
export function pitchClassOf(note: number): PitchClass {
  return (note - 1) % 12;
}

interface Track {
  ticks: number[];
  pitches: number[];
}

/** The last index in `ticks` (sorted) at or before `tick`, or -1. */
function lastAtOrBefore(ticks: readonly number[], tick: number): number {
  let lo = 0;
  let hi = ticks.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ticks[mid]! <= tick) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export class SongNotes {
  #instruments = new Map<number, Track>();
  /** The highest note of any instrument that isn't a drum, by tick: what the cave winds with. */
  #melody: Track = { ticks: [], pitches: [] };
  /** The melody's last note, 1 to 120, while building. */
  #melodyNote = 0;
  #drums: Uint8Array;

  constructor(levelData: LevelData) {
    const { timeSamples, resolvedInstrument, note } = levelData.notes;
    const drums = findDrums(levelData);
    for (let k = 0; k < note.length; k++) {
      const tick = Math.floor(timeSamples[k]! / SAMPLES_PER_TICK);
      const inst = resolvedInstrument[k]!;
      const pitch = pitchClassOf(note[k]!);
      let track = this.#instruments.get(inst);
      if (!track) this.#instruments.set(inst, (track = { ticks: [], pitches: [] }));
      track.ticks.push(tick);
      track.pitches.push(pitch);
      if (drums[inst]) continue;
      // Notes come in row order, so a tick's notes are together; keep the highest.
      const m = this.#melody;
      const last = m.ticks.length - 1;
      if (last >= 0 && m.ticks[last] === tick) {
        if (note[k]! > this.#melodyNote) {
          m.pitches[last] = pitch;
          this.#melodyNote = note[k]!;
        }
      } else {
        m.ticks.push(tick);
        m.pitches.push(pitch);
        this.#melodyNote = note[k]!;
      }
    }
    this.#drums = drums;
  }

  /**
   * The pitch class of the latest note of `instrument` at or before `tick`; for a drum, or
   * before the instrument's first note, the melody's. C (0) before any melody.
   */
  pitchAt(instrument: number, tick: number): PitchClass {
    if (!this.#drums[instrument]) {
      const track = this.#instruments.get(instrument);
      const i = track ? lastAtOrBefore(track.ticks, tick) : -1;
      if (track && i >= 0) return track.pitches[i]!;
    }
    return this.melodyAt(tick);
  }

  /** The melody's pitch class at `tick`, or C before it starts. */
  melodyAt(tick: number): PitchClass {
    const i = lastAtOrBefore(this.#melody.ticks, tick);
    return i >= 0 ? this.#melody.pitches[i]! : 0;
  }
}
