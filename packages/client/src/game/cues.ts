// Sound cues: what happened in the sim since the last frame, found by comparing the state
// with what the last call saw, the way the combat layer finds kills and blasts to draw.
// Reading only: the sim never knows about sound. Holds no audio objects, so tests run in
// Node.

import {
  BLOCK_SLOTS,
  BAR_LIT_WIDTH,
  BAR_PITCH,
  EnemyKind,
  EnemyStatus,
  MISSILE_SLOTS,
  SHOT_SLOTS,
  Q8,
  type Level,
  type SimState,
} from '@game/core';
import type { Effect } from '../audio/effects.ts';

export interface Cue {
  effect: Effect;
  /** Where it happened, in playfield px, for panning. */
  x: number;
  /** The instrument whose note a pitched effect takes, or -1 for the melody. */
  instrument: number;
  tick: number;
}

/** Kill sounds per frame at most; a nuke's own boom covers the rest. */
export const MAX_KILL_CUES = 3;

const KILL_EFFECT: Record<number, Effect> = {
  [EnemyKind.turret]: 'killTurret',
  [EnemyKind.tank]: 'killTank',
};

export class SoundCues {
  #seenTick = -1;
  #level: Level | null = null;
  #scanFrom = 0;
  #shots = new Uint8Array(SHOT_SLOTS);
  #missiles = new Uint8Array(MISSILE_SLOTS);
  #missileBlasts = new Int32Array(MISSILE_SLOTS);
  #blockEnds = new Int32Array(BLOCK_SLOTS);
  #hp = new Uint8Array(0);
  #bombActive = false;
  #blastTick = -1;
  #nukeTick = -1;
  #nukes = 0;
  #hitTick = -1;
  #shieldHitTick = -1;
  #extraLifeTick = -1;
  #capsules = 0;
  #meter = -1;
  #boostFuel = 0;
  #boosting = false;

  /** Forgets what was seen: the next update takes the state as it is, with no cues. */
  reset(): void {
    this.#seenTick = -1;
  }

  /** Appends to `out` the cues for what happened since the last call. */
  update(level: Level, state: SimState, out: Cue[]): void {
    if (level !== this.#level || state.tick < this.#seenTick) this.#seenTick = -1;
    const first = this.#seenTick < 0;
    if (first) {
      this.#level = level;
      if (this.#hp.length !== level.enemies.count) this.#hp = new Uint8Array(level.enemies.count);
      else this.#hp.fill(0);
      this.#scanFrom = state.firstLive;
    } else if (state.tick !== this.#seenTick) {
      this.#find(level, state, out);
    }
    this.#remember(state);
  }

  #find(level: Level, state: SimState, out: Cue[]): void {
    const t = state.tick;
    const shipX = state.shipX / Q8;
    const cue = (effect: Effect, x: number, instrument = -1): void => {
      out.push({ effect, x, instrument, tick: t });
    };

    // The ship's volley: a new shot from source 0 (drones stay quiet).
    for (let s = 0; s < SHOT_SLOTS; s++) {
      if (state.shotActive[s] === 1 && this.#shots[s] === 0 && state.shotSource[s] === 0) {
        cue(state.shotLaser[s] === 1 ? 'laser' : 'shot', shipX);
        break;
      }
    }

    // Tanks hit but still standing, and enemies destroyed since the last call.
    const e = level.enemies;
    let kills = 0;
    for (let i = this.#scanFrom; i < state.nextSpawn; i++) {
      const status = state.enemyStatus[i];
      if (status === EnemyStatus.alive) {
        const hp = state.enemyHp[i]!;
        if (this.#hp[i]! > hp) cue('tankHit', state.enemyX[i]! / Q8);
        this.#hp[i] = hp;
      } else if (status === EnemyStatus.destroyed && state.enemyEndTick[i]! > this.#seenTick) {
        // Rammed enemies score nothing; the ship's own explosion covers them.
        if (state.enemyPoints[i]! > 0 && kills < MAX_KILL_CUES) {
          kills++;
          const x = state.enemyX[i]! / Q8;
          cue(KILL_EFFECT[e.kind[i]!] ?? 'killShip', x);
          if (state.enemyOnBeat[i] === 1) cue('beat', x, e.instrument[i]!);
        }
      }
    }

    if (state.bombActive && !this.#bombActive) cue('bombDrop', shipX);
    if (state.blastTick !== this.#blastTick && state.blastTick > 0) cue('bomb', state.blastX / Q8);
    // A missile fired into a wall can launch and burst between two looks: its blast is new
    // and it wasn't in flight at the last look.
    const launched =
      this.#missiles[0] === 0 && (state.missileActive[0] === 1 || (state.missileBlastTick[0] !== this.#missileBlasts[0] && state.missileBlastTick[0]! > 0));
    if (launched) cue('missile', shipX);
    for (let m = 0; m < MISSILE_SLOTS; m++) {
      const b = state.missileBlastTick[m]!;
      if (b !== this.#missileBlasts[m] && b > 0) {
        cue('missileBlast', state.missileBlastX[m]! / Q8);
        break;
      }
    }
    // Falling blocks that shattered: one crumble a look, like the missiles' blasts.
    for (let b = 0; b < BLOCK_SLOTS; b++) {
      const end = state.blockEndTick[b]!;
      if (end !== this.#blockEnds[b] && end > 0) {
        cue('crumble', state.blockBar[b]! * BAR_PITCH + BAR_LIT_WIDTH / 2 - level.scroll[end]! / Q8);
        break;
      }
    }
    if (state.nukeTick !== this.#nukeTick && state.nukeTick > 0) cue('nuke', shipX);
    if (state.nukes > this.#nukes) cue('nukeReady', shipX);

    const hit = state.hitTick !== this.#hitTick && state.hitTick > 0;
    if (hit) cue('lifeLost', shipX);
    else {
      if (state.shieldHitTick !== this.#shieldHitTick && state.shieldHitTick > 0) cue('shield', shipX);
      if (state.meter !== this.#meter && state.meter >= 0) cue('unlock', shipX);
    }
    if (state.capsules > this.#capsules) cue('pickup', shipX);
    if (state.extraLifeTick !== this.#extraLifeTick && state.extraLifeTick > 0) cue('extraLife', shipX);
    const boosting = state.boostFuel < this.#boostFuel;
    if (boosting && !this.#boosting) cue('boost', shipX);
    this.#boosting = boosting;
  }

  #remember(state: SimState): void {
    this.#seenTick = state.tick;
    this.#scanFrom = state.firstLive;
    this.#shots.set(state.shotActive);
    this.#missiles.set(state.missileActive);
    this.#missileBlasts.set(state.missileBlastTick);
    this.#blockEnds.set(state.blockEndTick);
    for (let i = state.firstLive; i < state.nextSpawn; i++) {
      if (state.enemyStatus[i] === EnemyStatus.alive) this.#hp[i] = state.enemyHp[i]!;
    }
    this.#bombActive = state.bombActive;
    this.#blastTick = state.blastTick;
    this.#nukeTick = state.nukeTick;
    this.#nukes = state.nukes;
    this.#hitTick = state.hitTick;
    this.#shieldHitTick = state.shieldHitTick;
    this.#extraLifeTick = state.extraLifeTick;
    this.#capsules = state.capsules;
    this.#meter = state.meter;
    this.#boostFuel = state.boostFuel;
  }
}
