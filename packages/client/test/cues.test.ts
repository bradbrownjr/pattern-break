import { autopilotInputs, createSimState, generateLevel, resetSimState, tick, type Level } from '@game/core';
import { describe, expect, it } from 'vitest';
import { lcg, randomSong, syntheticLevelData } from '../../core/test/level-fixtures.ts';
import { SoundCues, type Cue } from '../src/game/cues.ts';

const level = generateLevel(syntheticLevelData(randomSong(lcg(1), 600, 8), 'normal'), 'normal');
const inputs = autopilotInputs(level);

/** Runs the autopilot through `lv`, calling update every `every` ticks, and returns the cues. */
function run(lv: Level, every: number): { cues: Cue[]; blasts: Set<number> } {
  const state = createSimState();
  const cues = new SoundCues();
  const out: Cue[] = [];
  const blasts = new Set<number>();
  cues.update(lv, state, out);
  for (let t = 0; t < lv.tickCount && !state.finished && !state.dead; t++) {
    tick(lv, state, inputs[t]!);
    if (state.blastTick > 0) blasts.add(state.blastTick);
    if (t % every === 0) cues.update(lv, state, out);
  }
  cues.update(lv, state, out);
  return { cues: out, blasts };
}

const counts = (cues: Cue[]) => {
  const c: Record<string, number> = {};
  for (const q of cues) c[q.effect] = (c[q.effect] ?? 0) + 1;
  return c;
};

describe('sound cues', () => {
  const everyTick = run(level, 1);

  it('finds shots, kills and bombs in an autopilot run', () => {
    const c = counts(everyTick.cues);
    expect(c['shot']).toBeGreaterThan(10);
    expect((c['killShip'] ?? 0) + (c['killTurret'] ?? 0) + (c['killTank'] ?? 0)).toBeGreaterThan(0);
    // One bomb cue per burst.
    expect(c['bomb'] ?? 0).toBe(everyTick.blasts.size);
  });

  it('finds the same events however many ticks pass between frames', () => {
    // The game draws once a frame, two or three ticks at 60 Hz; a slow frame can be more.
    for (const every of [2, 3, 7]) {
      const c = counts(run(level, every).cues);
      const want = counts(everyTick.cues);
      // Volleys (shots and laser beams) from the same group can merge across a long frame,
      // and so can the blasts of the ship's and drones' missiles, cued once a look; everything
      // else matches.
      for (const volley of ['shot', 'laser', 'missileBlast']) {
        delete c[volley];
        delete want[volley];
      }
      expect(c, `every ${every}`).toEqual(want);
    }
  });

  it('cues nothing on the first look, after a retry, or for a new level', () => {
    const state = createSimState();
    const cues = new SoundCues();
    const out: Cue[] = [];
    for (let t = 0; t < 3000; t++) tick(level, state, inputs[t]!);
    cues.update(level, state, out);
    expect(out).toEqual([]);
    resetSimState(state);
    cues.update(level, state, out);
    expect(out).toEqual([]);
    for (let t = 0; t < 3000; t++) tick(level, state, inputs[t]!);
    cues.update(level, state, out);
    expect(out.length).toBeGreaterThan(0);
    out.length = 0;
    const other = generateLevel(syntheticLevelData(randomSong(lcg(2), 600, 8), 'normal'), 'normal');
    cues.update(other, state, out);
    expect(out).toEqual([]);
  });

  it('cues a crumble where a falling block shattered, once', () => {
    const state = createSimState();
    const cues = new SoundCues();
    const out: Cue[] = [];
    tick(level, state, 0);
    cues.update(level, state, out);
    // A block from bar 20 shatters on the next tick, as the sim would end it.
    tick(level, state, 0);
    state.blockBar[3] = 20;
    state.blockEndTick[3] = state.tick;
    cues.update(level, state, out);
    const crumbles = out.filter((c) => c.effect === 'crumble');
    expect(crumbles.length).toBe(1);
    expect(crumbles[0]!.x).toBe(20 * 10 + 4 - level.scroll[state.tick]! / 256);
    tick(level, state, 0);
    out.length = 0;
    cues.update(level, state, out);
    expect(out.filter((c) => c.effect === 'crumble')).toEqual([]);
  });

  it('gives a kill on the beat a chime pitched from the enemy instrument', () => {
    const beat = everyTick.cues.filter((c) => c.effect === 'beat');
    for (const b of beat) {
      expect(b.instrument).toBeGreaterThanOrEqual(0);
      // The chime comes right after its kill, at the same place and tick.
      const i = everyTick.cues.indexOf(b);
      expect(everyTick.cues[i - 1]!.effect).toMatch(/^kill/);
      expect([everyTick.cues[i - 1]!.x, everyTick.cues[i - 1]!.tick]).toEqual([b.x, b.tick]);
    }
  });
});
