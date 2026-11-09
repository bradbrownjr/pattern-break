// Enemy placement: the song's notes to a level's enemies (docs/PLAN.md, "Enemies").
// Integer math only, in note order, so every engine places the same enemies.

import type { LevelData } from '../level-data/types.ts';
import { BAR_LIT_WIDTH, BAR_PITCH, PLAYFIELD_HEIGHT, Q8, SAMPLES_PER_TICK, SEGMENT_PITCH } from '../playfield.ts';
import {
  ENEMY_ENTRY_X,
  FIRE_MAX_X,
  FIRE_MIN_X,
  SHIP_FIRE_DELAY_TICKS,
  TANK_SPEED_Q8,
  TURRET_HEIGHT,
} from '../sim/constants.ts';
import { barPathViolation } from './path-check.ts';
import { floorUnderTank, tankBars, tankExitTick } from './rules.ts';
import { Difficulty, EnemyKind, EnemyTuning, ShipMotion, type EnemyList, type Level } from './types.ts';

/** No enemy appears, and none fires, in the first 2 s of a song. */
export const ENEMY_GRACE_TICKS = 240;
/** The ships of a formation come on notes at least 12 ticks apart, within 1 s of the first. */
export const FOLLOW_MIN_TICKS = 12;
export const FORMATION_TICKS = 120;
/** A ship flies 2 px higher per semitone above its instrument's middle note, at most 24 px. */
export const SHIP_PX_PER_SEMITONE = 2;
export const SHIP_MAX_OFFSET_PX = 24;

/** libopenmpt's effect numbers (soundlib/modcommand.h, EffectCommand, libopenmpt 0.8.10). */
const CMD_ARPEGGIO = 1;
const CMD_PORTAMENTOUP = 2;
const CMD_PORTAMENTODOWN = 3;
const CMD_VIBRATO = 5;
const CMD_VIBRATOVOL = 7;
const CMD_FINEVIBRATO = 26;

const INSTRUMENTS = 256;
const NOTES = 121;
const BAR_PITCH_Q8 = BAR_PITCH * Q8;
const ENTRY_X_Q8 = ENEMY_ENTRY_X * Q8;
const FIRE_MIN_Q8 = FIRE_MIN_X * Q8;
const FIRE_MAX_Q8 = FIRE_MAX_X * Q8;

/** A level's terrain before enemies are placed. */
export type LevelTerrain = Omit<Level, 'enemies' | 'noteStart' | 'noteTick'>;

/**
 * Each instrument's note ticks in time order (Level.noteStart and noteTick): a counting
 * sort of the notes by instrument, keeping their order.
 */
export function instrumentNotes(levelData: LevelData): { noteStart: Uint32Array; noteTick: Uint32Array } {
  const { timeSamples, resolvedInstrument } = levelData.notes;
  const n = timeSamples.length;
  const noteStart = new Uint32Array(INSTRUMENTS + 1);
  for (let k = 0; k < n; k++) noteStart[resolvedInstrument[k]! + 1]!++;
  for (let i = 0; i < INSTRUMENTS; i++) noteStart[i + 1]! += noteStart[i]!;
  const noteTick = new Uint32Array(n);
  const cursor = noteStart.slice(0, INSTRUMENTS);
  for (let k = 0; k < n; k++) noteTick[cursor[resolvedInstrument[k]!]!++] = Math.floor(timeSamples[k]! / SAMPLES_PER_TICK);
  return { noteStart, noteTick };
}

/** A note table with no notes, for hand-made levels. */
export function noNotes(): { noteStart: Uint32Array; noteTick: Uint32Array } {
  return { noteStart: new Uint32Array(INSTRUMENTS + 1), noteTick: new Uint32Array(0) };
}

/** An enemy list with no enemies. */
export function emptyEnemyList(): EnemyList {
  return {
    count: 0,
    kind: new Uint8Array(0),
    instrument: new Uint8Array(0),
    spawnTick: new Uint32Array(0),
    x: new Int32Array(0),
    y: new Int32Array(0),
    side: new Uint8Array(0),
    motion: new Uint8Array(0),
    fireStart: new Uint32Array(1),
    fireTick: new Uint32Array(0),
  };
}

/** `level` with no enemies: for tests of the terrain alone, and practice without enemies. */
export function withoutEnemies(level: Level): Level {
  return { ...level, enemies: emptyEnemyList() };
}

/** How a ship moves for the effect on its note. */
function shipMotion(effect: number, param: number): number {
  switch (effect) {
    case CMD_VIBRATO:
    case CMD_VIBRATOVOL:
    case CMD_FINEVIBRATO:
      return ShipMotion.weave;
    case CMD_PORTAMENTOUP:
      return ShipMotion.climb;
    case CMD_PORTAMENTODOWN:
      return ShipMotion.dive;
    case CMD_ARPEGGIO:
      return param !== 0 ? ShipMotion.hop : ShipMotion.straight;
    default:
      return ShipMotion.straight;
  }
}

/**
 * Places the enemies of `terrain` from the notes in `levelData`. `drums` marks the drum
 * instruments (findDrums). Walking the notes in time order:
 * - A drum note places a turret on the tip of the bar it plays on, so the turret reaches
 *   the ship as the drum sounds: on the floor and the ceiling in turn, on whichever fits.
 * - A bass note (the non-drum instrument with the lowest middle note, when the song has
 *   at least two) sends a tank in from the right along the floor.
 * - Any other note starts a formation of ships, and the next notes of that instrument add
 *   to it. Each ship flies at a height from its note's pitch, moving by its note's effect.
 * Each kind keeps its difficulty's spacing. A turret or tank is placed only if the path
 * check still passes with it counted as wall (solidWalls()). Every enemy fires on its own
 * instrument's later notes, while it is ahead of the ship, no more often than the
 * difficulty allows.
 */
export function placeEnemies(
  levelData: LevelData,
  terrain: LevelTerrain,
  drums: Uint8Array,
  notes: { noteStart: Uint32Array; noteTick: Uint32Array },
): EnemyList {
  const tune = EnemyTuning[terrain.difficulty];
  const { solidPeaks } = Difficulty[terrain.difficulty];
  const { barCount, tickCount, scroll, barStartSample } = terrain;
  const { timeSamples, resolvedInstrument, note, effect, effectParam } = levelData.notes;
  const n = timeSamples.length;

  // Each instrument's middle note.
  const { noteStart, noteTick } = notes;
  const pitches = new Uint32Array(INSTRUMENTS * NOTES);
  for (let k = 0; k < n; k++) pitches[resolvedInstrument[k]! * NOTES + note[k]!]!++;
  const middle = new Uint8Array(INSTRUMENTS);
  let bass = -1;
  let melodic = 0;
  for (let i = 0; i < INSTRUMENTS; i++) {
    const total = noteStart[i + 1]! - noteStart[i]!;
    if (total === 0) continue;
    // The middle note: the lowest pitch at or below which half the notes fall.
    let p = 0;
    let seen = pitches[i * NOTES]!;
    while (seen * 2 < total) seen += pitches[i * NOTES + ++p]!;
    middle[i] = p;
    if (drums[i]) continue;
    melodic++;
    if (bass < 0 || p < middle[bass]!) bass = i;
  }
  if (melodic < 2) bass = -1;

  /** The ticks of instrument `inst`'s notes from `from` on that the enemy may fire at. */
  const fireTicks = (inst: number, from: number, until: number, max: number, screenX: (t: number) => number): number[] => {
    const out: number[] = [];
    let last = -tune.fireIntervalTicks;
    for (let j = noteStart[inst]!; j < noteStart[inst + 1]! && out.length < max; j++) {
      const t = noteTick[j]!;
      if (t < from || t < ENEMY_GRACE_TICKS) continue;
      if (t >= until) break;
      const x = screenX(t);
      if (x < FIRE_MIN_Q8) break;
      if (x > FIRE_MAX_Q8 || t - last < tune.fireIntervalTicks) continue;
      out.push(t);
      last = t;
    }
    return out;
  };

  const solidC = (solidPeaks ? terrain.ceilingPeak : terrain.ceiling).slice();
  const solidF = (solidPeaks ? terrain.floorPeak : terrain.floor).slice();
  const baseF = solidF.slice();
  const usedC = new Uint8Array(barCount);
  const usedF = new Uint8Array(barCount);
  const pathOk = (from: number, to: number): boolean => {
    for (let j = from; j <= to && j < barCount; j++) if (barPathViolation(terrain, solidC, solidF, j) !== '') return false;
    return true;
  };

  const kind: number[] = [];
  const instrument: number[] = [];
  const spawnTick: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const side: number[] = [];
  const motion: number[] = [];
  const fires: number[][] = [];
  const add = (k: number, inst: number, t: number, x: number, y: number, s: number, m: number, f: number[]): void => {
    kind.push(k);
    instrument.push(inst);
    spawnTick.push(t);
    xs.push(x);
    ys.push(y);
    side.push(s);
    motion.push(m);
    fires.push(f);
  };

  const tryTurret = (bar: number, inst: number, preferCeiling: boolean): number => {
    if (bar >= barCount) return -1;
    for (let attempt = 0; attempt < 2; attempt++) {
      const onCeiling = preferCeiling === (attempt === 0);
      const used = onCeiling ? usedC : usedF;
      const solid = onCeiling ? solidC : solidF;
      if (used[bar]) continue;
      const wall = onCeiling ? terrain.ceiling[bar]! : terrain.floor[bar]!;
      const before = solid[bar]!;
      if (before < wall + 1) solid[bar] = wall + 1;
      if (!pathOk(bar, bar + 2)) {
        solid[bar] = before;
        continue;
      }
      used[bar] = 1;
      const x = bar * BAR_PITCH_Q8 + (BAR_LIT_WIDTH * Q8) / 2;
      const slotTop = onCeiling ? SEGMENT_PITCH * wall : PLAYFIELD_HEIGHT - SEGMENT_PITCH * (wall + 1);
      const y = slotTop * Q8 + (TURRET_HEIGHT * Q8) / 2;
      let spawn = 0;
      while (spawn < tickCount && x - scroll[spawn]! > ENTRY_X_Q8) spawn++;
      add(EnemyKind.turret, inst, spawn, x, y, onCeiling ? 1 : 0, 0, fireTicks(inst, spawn, tickCount, 1 << 30, (t) => x - scroll[t]!));
      return onCeiling ? 1 : 0;
    }
    return -1;
  };

  const tryTank = (t: number, inst: number): boolean => {
    const x0 = scroll[t]! + ENTRY_X_Q8;
    const exit = tankExitTick(scroll, tickCount, x0, t);
    const [first, last] = tankBars(x0, x0 - TANK_SPEED_Q8 * (exit - t));
    if (first < 0 || last >= barCount) return false;
    for (let j = first; j <= last; j++) if (usedF[j]) return false;
    const before = solidF.slice(first, last + 1);
    for (let j = first; j <= last; j++) {
      const f = floorUnderTank(baseF, j);
      if (solidF[j]! < f) solidF[j] = f;
    }
    if (!pathOk(first, last + 2)) {
      solidF.set(before, first);
      return false;
    }
    usedF.fill(1, first, last + 1);
    add(EnemyKind.tank, inst, t, x0, 0, 0, 0, fireTicks(inst, t, exit, 1 << 30, (u) => x0 - TANK_SPEED_Q8 * (u - t) - scroll[u]!));
    return true;
  };

  const addShip = (t: number, k: number): void => {
    const inst = resolvedInstrument[k]!;
    let offset = (middle[inst]! - note[k]!) * SHIP_PX_PER_SEMITONE;
    if (offset > SHIP_MAX_OFFSET_PX) offset = SHIP_MAX_OFFSET_PX;
    if (offset < -SHIP_MAX_OFFSET_PX) offset = -SHIP_MAX_OFFSET_PX;
    const f = fireTicks(inst, t + SHIP_FIRE_DELAY_TICKS, tickCount, tune.shipShots, (u) => ENTRY_X_Q8 - tune.shipSpeedQ8 * (u - t));
    add(EnemyKind.ship, inst, t, scroll[t]! + ENTRY_X_Q8, offset * Q8, 0, shipMotion(effect[k]!, effectParam[k]!), f);
  };

  let row = 0;
  let lastTurret = -tune.turretSpacingTicks;
  let lastTank = -tune.tankSpacingTicks;
  let lastFormation = -tune.formationSpacingTicks;
  let nextTurretOnCeiling = false;
  let formationInstrument = -1;
  let formationLeft = 0;
  let formationStart = 0;
  let formationLast = 0;
  for (let k = 0; k < n; k++) {
    const time = timeSamples[k]!;
    const t = Math.floor(time / SAMPLES_PER_TICK);
    if (t < ENEMY_GRACE_TICKS || t >= tickCount) continue;
    while (row + 1 < barCount && barStartSample[row + 1]! <= time) row++;
    const inst = resolvedInstrument[k]!;
    if (drums[inst]) {
      if (t - lastTurret < tune.turretSpacingTicks) continue;
      const placed = tryTurret(row, inst, nextTurretOnCeiling);
      if (placed >= 0) {
        lastTurret = t;
        nextTurretOnCeiling = placed === 0;
      }
    } else if (inst === bass) {
      if (t - lastTank >= tune.tankSpacingTicks && tryTank(t, inst)) lastTank = t;
    } else if (
      inst === formationInstrument &&
      formationLeft > 0 &&
      t - formationLast >= FOLLOW_MIN_TICKS &&
      t - formationStart <= FORMATION_TICKS
    ) {
      addShip(t, k);
      formationLeft--;
      formationLast = t;
    } else if (t - lastFormation >= tune.formationSpacingTicks) {
      addShip(t, k);
      formationInstrument = inst;
      formationLeft = tune.formationSize - 1;
      formationStart = t;
      formationLast = t;
      lastFormation = t;
    }
  }

  // Spawn order: by spawn tick, then by placement order (a stable sort).
  const order = kind.map((_, i) => i).sort((a, b) => spawnTick[a]! - spawnTick[b]! || a - b);
  const count = order.length;
  const list: EnemyList = {
    count,
    kind: Uint8Array.from(order, (i) => kind[i]!),
    instrument: Uint8Array.from(order, (i) => instrument[i]!),
    spawnTick: Uint32Array.from(order, (i) => spawnTick[i]!),
    x: Int32Array.from(order, (i) => xs[i]!),
    y: Int32Array.from(order, (i) => ys[i]!),
    side: Uint8Array.from(order, (i) => side[i]!),
    motion: Uint8Array.from(order, (i) => motion[i]!),
    fireStart: new Uint32Array(count + 1),
    fireTick: new Uint32Array(order.reduce((sum, i) => sum + fires[i]!.length, 0)),
  };
  let p = 0;
  for (let j = 0; j < count; j++) {
    list.fireStart[j] = p;
    for (const t of fires[order[j]!]!) list.fireTick[p++] = t;
  }
  list.fireStart[count] = p;
  return list;
}
