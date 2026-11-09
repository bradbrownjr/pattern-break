import { describe, expect, it } from 'vitest';
import { withoutEnemies } from '../src/levelgen/enemies.ts';
import { generateLevel } from '../src/levelgen/generate.ts';
import { Difficulty, EnemyKind, EnemyTuning, ShipMotion, type DifficultyName, type Level } from '../src/levelgen/types.ts';
import { autopilotInputs } from '../src/sim/autopilot.ts';
import {
  BOMB_RELOAD_TICKS,
  ENEMY_HP,
  InputBit,
  MAX_SHOTS,
  RESPAWN_SAFE_TICKS,
  SHIP_DIAGONAL_SPEED_Q8,
  SHIP_MAX_X,
  SHIP_MIN_X,
  SHIP_SPEED_Q8,
  SHIP_START_X,
  SHIP_START_Y,
} from '../src/sim/constants.ts';
import {
  EnemyStatus,
  createSimState,
  scoreMultiplier,
  resetSimState,
  runInputLog,
  serializeSimState,
  shipCollides,
  tick,
} from '../src/sim/sim.ts';
import { enemyLevel, enemyList, handLevel, lcg, randomSong, syntheticLevelData, type HandEnemy } from './level-fixtures.ts';

const Q = 256;

function activeShots(s: ReturnType<typeof createSimState>): number {
  return s.shotActive.reduce((a, b) => a + b, 0);
}

describe('ship movement', () => {
  const open = handLevel('easy', []);

  it('moves 1.5 px per tick straight and 272/256 px per axis diagonally', () => {
    const s = createSimState();
    expect([s.shipX, s.shipY]).toEqual([SHIP_START_X * Q, SHIP_START_Y * Q]);
    tick(open, s, InputBit.up);
    expect([s.shipX, s.shipY]).toEqual([SHIP_START_X * Q, SHIP_START_Y * Q - SHIP_SPEED_Q8]);
    tick(open, s, InputBit.right | InputBit.down);
    expect([s.shipX, s.shipY]).toEqual([
      SHIP_START_X * Q + SHIP_DIAGONAL_SPEED_Q8,
      SHIP_START_Y * Q - SHIP_SPEED_Q8 + SHIP_DIAGONAL_SPEED_Q8,
    ]);
    expect(SHIP_SPEED_Q8).toBe(384);
  });

  it('cancels opposite directions and ignores bomb and buy', () => {
    const s = createSimState();
    tick(open, s, InputBit.up | InputBit.down | InputBit.left | InputBit.right | InputBit.bomb | InputBit.buy);
    expect([s.shipX, s.shipY]).toEqual([SHIP_START_X * Q, SHIP_START_Y * Q]);
    expect(s.tick).toBe(1);
  });

  it('keeps the ship on screen and inside its horizontal band', () => {
    const s = createSimState();
    for (let i = 0; i < 99; i++) tick(open, s, InputBit.up | InputBit.left);
    expect([s.shipX, s.shipY]).toEqual([SHIP_MIN_X * Q, 3 * Q]);
    resetSimState(s);
    for (let i = 0; i < 99; i++) tick(open, s, InputBit.down | InputBit.right);
    expect([s.shipX, s.shipY]).toEqual([SHIP_MAX_X * Q, 213 * Q]);
  });
});

describe('collision', () => {
  // One bar at world x 0..8 with 3 ceiling segments (lit y 0..6, 7..13, 14..20) and 2 floor
  // segments (lit y 210..216 and 203..209). Scroll 0, so screen x = world x.
  const level = handLevel('easy', [[3, 2]]);

  it('hits lit segments and misses the 1 px gaps and the bar edges', () => {
    // Hitbox is [x - 5, x + 5) x [y - 3, y + 3).
    const x = 4 * Q;
    expect(shipCollides(level, 0, x, 23 * Q)).toBe(false); // top at 20 px: just below segment 2
    expect(shipCollides(level, 0, x, 23 * Q - 1)).toBe(true);
    expect(shipCollides(level, 0, x, 200 * Q)).toBe(false); // bottom at 203 px: just above
    expect(shipCollides(level, 0, x, 200 * Q + 1)).toBe(true);
    // Horizontal: the bar is solid for x in [0, 8); hitbox left edge at 8 px misses.
    expect(shipCollides(level, 0, 13 * Q, 10 * Q)).toBe(false);
    expect(shipCollides(level, 0, 13 * Q - 1, 10 * Q)).toBe(true);
    // Left of the bar: the hitbox right edge at 0 px misses.
    expect(shipCollides(level, 0, -5 * Q, 10 * Q)).toBe(false);
  });

  it('a 1 px segment gap is open but too thin for the hitbox', () => {
    // A box that only touched the gap between segments 0 and 1 (y 6..7) would miss, but the
    // hitbox is 6 px tall, so any position near it overlaps a lit segment.
    for (let y = 3 * Q; y <= 20 * Q; y += 64) expect(shipCollides(level, 0, 4 * Q, y)).toBe(true);
  });

  it('uses the scroll table for world x', () => {
    const scrolled = handLevel('easy', [[3, 2]], -100);
    // World x = scroll + screen x, so the bar is at screen x 100..108.
    expect(shipCollides(scrolled, 0, 104 * Q, 10 * Q)).toBe(true);
    expect(shipCollides(scrolled, 0, 4 * Q, 10 * Q)).toBe(false);
  });

  it('peak dots are not solid on any difficulty', () => {
    // Ceiling level 1, peak 5: the dot would be segment 4, lit y 28..34.
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const l = handLevel(d, [[1, 0, 5, 0]]);
      expect(shipCollides(l, 0, 4 * Q, 31 * Q), d).toBe(false);
      expect(shipCollides(l, 0, 4 * Q, 17 * Q), d).toBe(false);
      // The level itself is still solid.
      expect(shipCollides(l, 0, 4 * Q, 6 * Q), d).toBe(true);
      expect(Difficulty[d].solidPeaks).toBe(false);
    }
  });
});

describe('tick', () => {
  // Scroll 0; the bar at world 60..68 is under the ship's start x (64), with a tall floor.
  const wall = (): Level =>
    handLevel('easy', Array.from({ length: 7 }, (_, i) => (i === 6 ? [0, 12] : [0, 0])), 0, 1000);

  it('a hit costs a life: the ship comes back mid-cave at the playhead, safe for 2 s', () => {
    const level = wall();
    const s = createSimState();
    expect(s.lives).toBe(3);
    while (s.lives === 3) tick(level, s, InputBit.down);
    // The floor's top segment starts at y 133, so the hitbox (bottom y + 3) hits once
    // y > 130. From y 108 at 1.5 px per tick that is tick 15 (y 130.5).
    expect([s.hitTick, s.lives, s.dead]).toEqual([15, 2, false]);
    // Bar 6's gap is y 0 to 132, so its middle is 66.
    expect([s.shipX, s.shipY]).toEqual([SHIP_START_X * Q, 66 * Q]);
    expect(s.safeUntil).toBe(15 + RESPAWN_SAFE_TICKS);
    // Flying into the floor while safe costs nothing; the first tick after does.
    while (s.lives === 2) tick(level, s, InputBit.down);
    expect(s.hitTick).toBe(15 + RESPAWN_SAFE_TICKS);
  });

  it('the last life ends the run, and then tick does nothing', () => {
    const level = wall();
    const s = createSimState();
    while (!s.dead) tick(level, s, InputBit.down);
    expect([s.lives, s.deathTick]).toEqual([0, 15 + 2 * RESPAWN_SAFE_TICKS]);
    const before = serializeSimState(s);
    tick(level, s, InputBit.up);
    expect(serializeSimState(s)).toEqual(before);
  });

  it('finishes at the end of the song', () => {
    const level = handLevel('easy', [], 0, 50);
    const s = runInputLog(level, new Uint16Array(80));
    expect(s.finished).toBe(true);
    expect(s.tick).toBe(50);
    expect(s.dead).toBe(false);
  });

  it('runInputLog uses the given state in place', () => {
    const level = handLevel('easy', [], 0, 50);
    const s = createSimState();
    expect(runInputLog(level, Uint16Array.from([InputBit.up, InputBit.up]), s)).toBe(s);
    expect(s.tick).toBe(2);
    expect(s.shipY).toBe(SHIP_START_Y * Q - 2 * SHIP_SPEED_Q8);
  });
});

describe('shots', () => {
  it('fires from the nose every 8 ticks, 4 px per tick, at most 6 in flight', () => {
    const level = enemyLevel([]);
    const s = createSimState();
    tick(level, s, InputBit.fire);
    // Spawned at the nose (64 + 5 + 3) and moved once.
    expect([activeShots(s), s.shotX[0], s.shotY[0]]).toEqual([1, 76 * Q, SHIP_START_Y * Q]);
    for (let i = 1; i < 8; i++) tick(level, s, InputBit.fire);
    expect(activeShots(s)).toBe(1);
    tick(level, s, InputBit.fire);
    expect(activeShots(s)).toBe(2);
    for (let i = 0; i < 60; i++) tick(level, s, InputBit.fire);
    expect(activeShots(s)).toBe(MAX_SHOTS);
    expect(MAX_SHOTS).toBe(6);
  });

  it('pass through the walls, and destroy a turret with one hit', () => {
    // A wall of bars from world x 100 to 200, and a turret behind it at the ship's height.
    const bars = Array.from({ length: 30 }, (_, i): [number, number] => (i >= 10 && i < 20 ? [14, 14] : [0, 0]));
    const level = handLevel('easy', bars, 0, 400, enemyList([{ kind: EnemyKind.turret, spawnTick: 0, x: 250 * Q, y: 108 * Q }]));
    const s = createSimState();
    while (s.kills === 0 && s.tick < 200) tick(level, s, InputBit.fire);
    expect(s.enemyStatus[0]).toBe(EnemyStatus.destroyed);
    expect(s.enemyEndTick[0]).toBe(s.tick);
    expect(ENEMY_HP[EnemyKind.turret]).toBe(1);
  });

  it('a tank takes three hits', () => {
    // The tank rides the empty floor: centre y 216 - 3.5. Move the ship down to it first.
    const level = enemyLevel([{ kind: EnemyKind.tank, spawnTick: 80, x: 200 * Q }]);
    const s = createSimState();
    for (let i = 0; i < 80; i++) tick(level, s, InputBit.down);
    const hp: number[] = [];
    while (s.kills === 0 && s.tick < 400) {
      tick(level, s, InputBit.fire);
      if (s.enemyHp[0] !== hp.at(-1)) hp.push(s.enemyHp[0]!);
    }
    expect(hp).toEqual([3, 2, 1, 0]);
    expect(s.enemyY[0]).toBe(216 * Q - (7 * Q) / 2);
  });
});

describe('enemies', () => {
  it('fire on their scheduled ticks, aimed at the ship at the difficulty speed', () => {
    const level = enemyLevel([{ kind: EnemyKind.turret, spawnTick: 0, x: 300 * Q, y: 100 * Q, fire: [10] }]);
    const s = createSimState();
    for (let i = 0; i < 9; i++) tick(level, s, 0);
    expect(s.bulletCount).toBe(0);
    tick(level, s, 0);
    expect(s.bulletCount).toBe(1);
    // From (300, 100) at the ship at (64, 108): (-236, 8) scaled to 224, rounded towards 0.
    const length = Math.sqrt(236 * 236 + 8 * 8);
    expect([s.bulletVX[0], s.bulletVY[0]]).toEqual([Math.trunc((-236 * 224) / length), Math.trunc((8 * 224) / length)]);
    expect(EnemyTuning.easy.bulletSpeedQ8).toBe(224);
    // Fired at the enemy's centre, then moved once in the same tick.
    expect(s.bulletX[0]).toBe(300 * Q + s.bulletVX[0]!);
  });

  it('keep to the difficulty bullet cap', () => {
    const fire = [10, 11, 12, 13, 14, 15];
    const level = enemyLevel([{ kind: EnemyKind.turret, spawnTick: 0, x: 300 * Q, y: 100 * Q, fire }]);
    const s = createSimState();
    for (let i = 0; i < 15; i++) tick(level, s, 0);
    expect(s.bulletCount).toBe(EnemyTuning.easy.maxBullets);
  });

  it('bullets stop on the walls', () => {
    const bars = Array.from({ length: 40 }, (_, i): [number, number] => (i === 20 ? [16, 16] : [0, 0]));
    const level = handLevel('easy', bars, 0, 400, enemyList([{ kind: EnemyKind.turret, spawnTick: 0, x: 300 * Q, y: 108 * Q, fire: [10] }]));
    const s = createSimState();
    for (let i = 0; i < 10; i++) tick(level, s, 0);
    expect(s.bulletCount).toBe(1);
    // The wall at world x 200 is about 100 px away at 224/256 px per tick.
    for (let i = 0; i < 130; i++) tick(level, s, 0);
    expect([s.bulletCount, s.lives]).toEqual([0, 3]);
  });

  it('a bullet costs a life and clears the others', () => {
    const level = enemyLevel([{ kind: EnemyKind.turret, spawnTick: 0, x: 300 * Q, y: 108 * Q, fire: [10, 80] }]);
    const s = createSimState();
    while (s.lives === 3 && s.tick < 400) tick(level, s, 0);
    expect(s.lives).toBe(2);
    expect(s.bulletCount).toBe(0);
  });

  it('ramming one destroys it and costs a life', () => {
    // A ship on the cave's centre line, which is the ship's height in an open cave.
    const level = enemyLevel([{ kind: EnemyKind.ship, spawnTick: 1, x: 392 * Q }]);
    const s = createSimState();
    while (s.lives === 3 && s.tick < 600) tick(level, s, 0);
    expect([s.lives, s.kills, s.enemyStatus[0]]).toEqual([2, 1, EnemyStatus.destroyed]);
  });

  it('are gone once off the left of the screen', () => {
    // Scroll 1 px per tick: a turret at world x 100 is at screen x 100 - t.
    const level = enemyLevel([{ kind: EnemyKind.turret, spawnTick: 0, x: 100 * Q, y: 20 * Q }], 400, (t) => t);
    const s = createSimState();
    for (let i = 0; i < 116; i++) tick(level, s, 0);
    expect(s.enemyStatus[0]).toBe(EnemyStatus.alive);
    tick(level, s, 0);
    expect([s.enemyStatus[0], s.enemyEndTick[0], s.firstLive]).toEqual([EnemyStatus.gone, 117, 1]);
  });

  it('weaving ships follow a 12 px wave around the cave line', () => {
    const level = enemyLevel([{ kind: EnemyKind.ship, spawnTick: 1, x: 392 * Q, y: -20 * Q, motion: ShipMotion.weave }]);
    const s = createSimState();
    const ys: number[] = [];
    for (let i = 0; i < 1 + 72; i++) {
      tick(level, s, 0);
      ys.push(s.enemyY[0]!);
    }
    // Age 0 at tick 1: the line (108 - 20); a quarter period later 12 px above it, three
    // quarters later 12 px below.
    expect([ys[0], ys[24], ys[72]]).toEqual([88 * Q, 76 * Q, 100 * Q]);
  });

  it('tanks ride the floor of the bar under their centre', () => {
    const bars = Array.from({ length: 60 }, (_, i): [number, number] => [0, i % 3]);
    const level = handLevel('easy', bars, 0, 1000, enemyList([{ kind: EnemyKind.tank, spawnTick: 1, x: 255 * Q }]));
    const s = createSimState();
    for (let i = 0; i < 200; i++) {
      tick(level, s, 0);
      const bar = Math.floor((255 * Q - 64 * (s.tick - 1)) / (10 * Q));
      expect(s.enemyY[0]).toBe(216 * Q - 7 * Q * (bar % 3) - (7 * Q) / 2);
    }
  });
});

describe('score', () => {
  /** Holds fire until the turret in front of the ship is shot down; returns the tick. */
  function shootTurret(notes: Record<number, number[]> = {}): ReturnType<typeof createSimState> {
    const level = enemyLevel([{ kind: EnemyKind.turret, spawnTick: 0, x: 200 * Q, y: 108 * Q, instrument: 1 }], 1000, 0, 60, notes);
    const s = createSimState();
    while (s.kills === 0) tick(level, s, InputBit.fire);
    return s;
  }

  it('a shot-down turret scores 200, double on a note of its instrument', () => {
    const off = shootTurret();
    expect([off.score, off.enemyPoints[0], off.enemyOnBeat[0]]).toEqual([200, 200, 0]);
    const t = off.tick;
    // Notes 3 ticks either side count; 4 do not.
    expect(shootTurret({ 1: [t + 3] }).score).toBe(400);
    expect(shootTurret({ 1: [t - 3] }).score).toBe(400);
    expect(shootTurret({ 1: [t - 4, t + 4] }).score).toBe(200);
    // Another instrument's note doesn't count.
    expect(shootTurret({ 2: [t] }).score).toBe(200);
    expect(shootTurret({ 1: [t] }).onBeatKills).toBe(1);
  });

  it('the multiplier goes up by 1 every 10 kills, to 4', () => {
    expect([0, 9, 10, 19, 20, 30, 1000].map(scoreMultiplier)).toEqual([1, 1, 2, 2, 3, 4, 4]);
  });

  it('losing a life resets the streak; ramming scores nothing', () => {
    const level = enemyLevel([{ kind: EnemyKind.ship, spawnTick: 1, x: 392 * Q }]);
    const s = createSimState();
    s.streak = 15;
    while (s.lives === 3) tick(level, s, 0);
    expect([s.streak, s.score, s.enemyPoints[0]]).toEqual([0, 0, 0]);
  });

  it('the end of the song adds 1000 per life left', () => {
    const s = runInputLog(enemyLevel([], 50), new Uint16Array(50));
    expect([s.finished, s.survivalBonus, s.score]).toEqual([true, 3000, 3000]);
  });
});

describe('bomb', () => {
  it('falls from the ship in an arc and bursts on the floor', () => {
    const level = enemyLevel([], 400);
    const s = createSimState();
    tick(level, s, InputBit.bomb);
    // Dropped from the ship's underside: (64, 108 + 3 + 2).
    expect([s.bombActive, s.bombX, s.bombY]).toEqual([true, 64 * Q, 113 * Q]);
    let moves = 0;
    while (s.blastTick < 0) {
      tick(level, s, 0);
      moves++;
    }
    // After n moves y is 113 px + 8 n (n + 1) / 2 Q8; the bomb's bottom reaches 216 px on the 80th.
    expect(moves).toBe(80);
    expect([s.blastX, s.blastY, s.bombActive]).toEqual([144 * Q, 113 * Q + 4 * 80 * 81, false]);
  });

  it('drops one per press, never while one is in the air, and reloads for 1 s after a burst', () => {
    const level = enemyLevel([], 600);
    const held = createSimState();
    let drops = 0;
    for (let t = 0; t < 500; t++) {
      const was = held.bombActive;
      tick(level, held, InputBit.bomb);
      if (!was && held.bombActive) drops++;
    }
    // Holding the button drops only the first.
    expect(drops).toBe(1);

    // Pressing every other tick: the next drops on the first press 120 ticks after the burst.
    const mashed = createSimState();
    const dropTicks: number[] = [];
    for (let t = 0; t < 500; t++) {
      const was = mashed.bombActive;
      tick(level, mashed, t % 2 === 0 ? InputBit.bomb : 0);
      if (!was && mashed.bombActive) dropTicks.push(mashed.tick);
      if (dropTicks.length === 2) break;
    }
    expect(BOMB_RELOAD_TICKS).toBe(120);
    // Dropped on tick 1, burst on tick 81, ready on tick 201; tick 201 is a press.
    expect(dropTicks).toEqual([1, 201]);
  });

  it('destroys a tank in one blast, and scores it like a shot', () => {
    const level = enemyLevel([{ kind: EnemyKind.tank, spawnTick: 0, x: 170 * Q, instrument: 1 }], 400);
    const s = createSimState();
    tick(level, s, InputBit.bomb);
    while (s.blastTick < 0) tick(level, s, 0);
    expect([s.enemyStatus[0], s.kills, s.score, s.enemyPoints[0]]).toEqual([EnemyStatus.destroyed, 1, 300, 300]);
  });

  it('leaves enemies outside the blast alone', () => {
    const level = enemyLevel([{ kind: EnemyKind.turret, spawnTick: 0, x: 250 * Q, y: 205 * Q }], 400);
    const s = createSimState();
    tick(level, s, InputBit.bomb);
    while (s.blastTick < 0) tick(level, s, 0);
    // The burst is at x 144; the turret's centre is 106 px away.
    expect(s.enemyStatus[0]).toBe(EnemyStatus.alive);
  });
});

describe('nuke', () => {
  const onScreen: HandEnemy[] = [
    { kind: EnemyKind.turret, spawnTick: 0, x: 300 * Q, y: 30 * Q, instrument: 1, fire: [5] },
    { kind: EnemyKind.tank, spawnTick: 0, x: 200 * Q, instrument: 1 },
    // Off the right edge: not hit.
    { kind: EnemyKind.turret, spawnTick: 0, x: 390 * Q, y: 30 * Q, instrument: 1 },
  ];

  it('a press destroys every enemy on screen, clears bullets, and never doubles on the beat', () => {
    // Notes on every tick, so a shot kill would be on the beat.
    const notes = { 1: Array.from({ length: 200 }, (_, t) => t) };
    const level = enemyLevel(onScreen, 400, 0, 60, notes);
    const s = createSimState();
    s.nukes = 2;
    for (let t = 0; t < 8; t++) tick(level, s, 0);
    expect(s.bulletCount).toBe(1);
    tick(level, s, InputBit.nuke);
    expect(Array.from(s.enemyStatus)).toEqual([EnemyStatus.destroyed, EnemyStatus.destroyed, EnemyStatus.alive]);
    expect([s.nukes, s.bulletCount, s.score, s.onBeatKills, s.nukeTick]).toEqual([1, 0, 500, 0, 9]);
    // Held, it doesn't go off again.
    tick(level, s, InputBit.nuke);
    expect(s.nukes).toBe(1);
  });

  it('does nothing with none held; a level starts with none', () => {
    const s = createSimState();
    expect(s.nukes).toBe(0);
    tick(enemyLevel(onScreen), s, InputBit.nuke);
    expect([s.kills, s.nukeTick]).toEqual([0, -1]);
  });

  it('charges one per 10 kills on the beat, up to 3, and is kept when a life is lost', () => {
    const level = enemyLevel([{ kind: EnemyKind.turret, spawnTick: 0, x: 200 * Q, y: 108 * Q, instrument: 1 }], 1000, 0, 60, {
      1: Array.from({ length: 1000 }, (_, t) => t),
    });
    const s = createSimState();
    s.nukeCharge = 9;
    while (s.kills === 0) tick(level, s, InputBit.fire);
    expect([s.nukes, s.nukeCharge]).toEqual([1, 0]);
    const full = createSimState();
    full.nukes = 3;
    while (full.kills === 0) tick(level, full, InputBit.fire);
    expect([full.nukes, full.nukeCharge]).toEqual([3, 0]);
    const rammed = createSimState();
    rammed.nukes = 2;
    const ram = enemyLevel([{ kind: EnemyKind.ship, spawnTick: 1, x: 392 * Q }]);
    while (rammed.lives === 3) tick(ram, rammed, 0);
    expect(rammed.nukes).toBe(2);
  });
});

describe('autopilot', () => {
  it.each(Object.keys(Difficulty) as DifficultyName[])('flies the terrain of random loud songs (%s)', (d) => {
    for (let seed = 1; seed <= 10; seed++) {
      // The terrain alone: the bot doesn't dodge everything enemies throw at it.
      const level = withoutEnemies(generateLevel(syntheticLevelData(randomSong(lcg(seed * 31), 250, 8), d), d));
      const s = runInputLog(level, autopilotInputs(level));
      expect(s.dead, `seed ${seed} died at tick ${s.deathTick}`).toBe(false);
      expect(s.finished).toBe(true);
    }
  });
});
