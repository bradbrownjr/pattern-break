// Power-ups (sim.ts): capsules from whole formations, which fall to the cave's floor, each
// unlocking the next power-up in order, and each power-up: double, missile, shield, drone,
// laser, boost. Losing a life loses them all; the god cheat keeps them.

import { describe, expect, it } from 'vitest';
import { EnemyKind } from '../src/levelgen/types.ts';
import {
  BOOST_FUEL_PER_LEVEL,
  BOOST_SPEED_Q8,
  Cheat,
  DOUBLE_SPEED_Q8,
  InputBit,
  MISSILE_RELOAD_TICKS,
  POWER_UP_COUNT,
  PowerUp,
  SHIELD_HITS,
  SHIP_SPEED_Q8,
} from '../src/sim/constants.ts';
import { EnemyStatus, createSimState, tick, type SimState } from '../src/sim/sim.ts';
import { enemyLevel, handLevel } from './level-fixtures.ts';

const Q = 256;
const open = enemyLevel([], 2000);

/** Puts a capsule on the ship, so the next tick picks it up (`open` doesn't scroll). */
function capsuleOnShip(s: SimState): void {
  s.capsuleActive[0] = 1;
  s.capsuleX[0] = s.shipX;
  s.capsuleWX[0] = s.shipX;
  s.capsuleY[0] = s.shipY;
  s.capsuleVY[0] = 0;
}

/** Puts an enemy bullet on the ship. */
function bulletOnShip(s: SimState): void {
  s.bulletActive[0] = 1;
  s.bulletX[0] = s.shipX;
  s.bulletY[0] = s.shipY;
  s.bulletVX[0] = 0;
  s.bulletVY[0] = 0;
  s.bulletCount = 1;
}

describe('capsules', () => {
  it('drop when every ship of a formation is shot down, scroll with the cave, and fall to its floor', () => {
    // The cave scrolls 1 px a tick, and has no floor: capsules rest on the bottom edge.
    const level = enemyLevel(
      [
        { kind: EnemyKind.ship, spawnTick: 1, x: 392 * Q, formation: 0 },
        { kind: EnemyKind.ship, spawnTick: 30, x: 392 * Q, formation: 0 },
      ],
      2000,
      (t) => t,
    );
    const s = createSimState();
    while (s.kills < 2 && s.tick < 1500) tick(level, s, InputBit.fire);
    expect(s.capsuleActive[0]).toBe(1);
    const x = s.capsuleX[0]!;
    const y = s.capsuleY[0]!;
    tick(level, s, 0);
    tick(level, s, 0);
    // 1 px left a tick, and falling 8 Q8 a tick faster each tick (it fell 8 on its first).
    expect([s.capsuleX[0], s.capsuleY[0]]).toEqual([x - 2 * Q, y + 16 + 24]);
    while (s.capsuleVY[0] !== 0 && s.tick < 1500) tick(level, s, 0);
    expect(s.capsuleY[0]).toBe((216 - 4) * Q);
    // The ship, held still in the middle, misses it; flying down to the floor picks it up.
    expect(s.capsules).toBe(0);
    while (s.capsules === 0 && s.capsuleActive[0] === 1) tick(level, s, InputBit.down);
    expect([s.capsules, s.meter, s.double, s.lives]).toEqual([1, PowerUp.double, true, 3]);
  });

  it("don't drop when a ship of the formation gets away", () => {
    const level = enemyLevel(
      [
        { kind: EnemyKind.ship, spawnTick: 1, x: 392 * Q, formation: 0 },
        // 40 px below the centre line: the shots miss it and it flies past.
        { kind: EnemyKind.ship, spawnTick: 30, x: 392 * Q, y: 40 * Q, formation: 0 },
      ],
      2000,
    );
    const s = createSimState();
    for (let t = 0; t < 1200; t++) tick(level, s, InputBit.fire);
    expect([s.enemyStatus[0], s.enemyStatus[1]]).toEqual([EnemyStatus.destroyed, EnemyStatus.gone]);
    expect([s.capsules, s.formationSpoiled[0], s.capsuleActive.every((a) => a === 0)]).toEqual([0, 1, true]);
  });

  it('each one picked up unlocks the next power-up in order, skipping those at their most', () => {
    const s = createSimState();
    const seen: number[] = [];
    for (let k = 0; k <= POWER_UP_COUNT; k++) {
      capsuleOnShip(s);
      tick(open, s, 0);
      seen.push(s.meter);
    }
    // Double, missile, shield, drone, laser, boost; then double, missile and the shield are
    // at their most, so the seventh gives the second drone.
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 3]);
    expect([s.double, s.missile, s.shieldHits, s.drones, s.laser, s.boostLevel]).toEqual([true, true, SHIELD_HITS, 2, true, 1]);
  });
});

describe('unlocking', () => {
  it('with every power-up at its most, a capsule does nothing', () => {
    const s = createSimState();
    Object.assign(s, { double: true, laser: true, missile: true, drones: 2, boostLevel: 3, shieldHits: SHIELD_HITS, meter: 2 });
    capsuleOnShip(s);
    tick(open, s, 0);
    expect([s.capsules, s.meter, s.boostLevel, s.drones]).toEqual([1, 2, 3, 2]);
  });

  it('losing a life loses every power-up and starts the order again', () => {
    const s = createSimState();
    Object.assign(s, { double: true, missile: true, drones: 2, boostLevel: 2, boostFuel: 50, meter: PowerUp.drone });
    bulletOnShip(s);
    tick(open, s, 0);
    expect([s.lives, s.double, s.missile, s.drones, s.boostLevel, s.boostFuel, s.meter]).toEqual([2, false, false, 0, 0, 0, -1]);
  });

  it('the god cheat starts with every power-up, keeps them after a life, and the shield never breaks', () => {
    const s = createSimState(Cheat.god);
    expect([s.double, s.laser, s.missile, s.drones, s.boostLevel, s.shieldHits]).toEqual([true, true, true, 2, 3, SHIELD_HITS]);
    for (let k = 0; k < 10; k++) {
      bulletOnShip(s);
      tick(open, s, 0);
    }
    expect([s.lives, s.shieldHits]).toEqual([3, SHIELD_HITS]);
    // A wall still costs a life, but not the power-ups.
    const level = handLevel('easy', Array.from({ length: 20 }, (_, i): [number, number] => (i >= 5 && i <= 8 ? [0, 20] : [0, 0])), 0, 100);
    const g = createSimState(Cheat.god);
    tick(level, g, 0);
    expect([g.lives, g.double, g.laser, g.missile, g.drones, g.shieldHits]).toEqual([2, true, true, true, 2, SHIELD_HITS]);
  });
});

describe('boost', () => {
  it('each unlock adds 1 s of fuel, burnt while held for 1.67 times the speed, refilled every 3 ticks', () => {
    const s = createSimState();
    tick(open, s, InputBit.down | InputBit.boost);
    // Not unlocked yet: the normal speed.
    expect(s.shipY).toBe(108 * Q + SHIP_SPEED_Q8);
    // Boost comes after the laser.
    s.meter = PowerUp.laser;
    s.laser = true;
    capsuleOnShip(s);
    tick(open, s, 0);
    expect([s.boostLevel, s.boostFuel]).toEqual([1, BOOST_FUEL_PER_LEVEL]);
    const y = s.shipY;
    tick(open, s, InputBit.up | InputBit.boost);
    expect([s.shipY, s.boosting, s.boostFuel]).toEqual([y - BOOST_SPEED_Q8, true, BOOST_FUEL_PER_LEVEL - 1]);
    for (let k = 1; k < BOOST_FUEL_PER_LEVEL; k++) tick(open, s, InputBit.boost);
    expect(s.boostFuel).toBe(0);
    const y2 = s.shipY;
    tick(open, s, InputBit.down | InputBit.boost);
    expect([s.shipY, s.boosting]).toEqual([y2 + SHIP_SPEED_Q8, false]);
    for (let k = 0; k < 30; k++) tick(open, s, 0);
    expect(s.boostFuel).toBe(10);
  });
});

describe('double and laser', () => {
  it('double adds a shot angled 45 degrees up', () => {
    const s = createSimState();
    s.double = true;
    tick(open, s, InputBit.fire);
    const shots = [0, 1].map((k) => [s.shotX[k], s.shotY[k], s.shotVX[k], s.shotVY[k]]);
    expect(shots).toEqual([
      [(64 + 5 + 3) * Q + 1024, 108 * Q, 1024, 0],
      [(64 + 5) * Q + DOUBLE_SPEED_Q8, (108 - 3) * Q - DOUBLE_SPEED_Q8, DOUBLE_SPEED_Q8, -DOUBLE_SPEED_Q8],
    ]);
  });

  it('a laser goes through every enemy in line; a shot stops on the first', () => {
    const turrets = [150, 175].map((x) => ({ kind: EnemyKind.turret, spawnTick: 0, x: x * Q, y: 108 * Q }));
    const once = (laser: boolean): number[] => {
      const s = createSimState();
      s.laser = laser;
      const level = enemyLevel(turrets, 400);
      tick(level, s, InputBit.fire);
      for (let k = 0; k < 100; k++) tick(level, s, 0);
      return Array.from(s.enemyStatus);
    };
    expect(once(true)).toEqual([EnemyStatus.destroyed, EnemyStatus.destroyed]);
    expect(once(false)).toEqual([EnemyStatus.destroyed, EnemyStatus.alive]);
  });
});

describe('missile', () => {
  const targets = [
    { kind: EnemyKind.turret, spawnTick: 0, x: 200 * Q, y: 108 * Q },
    // 15 px right and 12 px down: within the 20 px blast.
    { kind: EnemyKind.turret, spawnTick: 0, x: 215 * Q, y: 120 * Q },
    // 60 px right: outside it.
    { kind: EnemyKind.turret, spawnTick: 0, x: 260 * Q, y: 108 * Q },
  ];

  it('needs the power-up', () => {
    const s = createSimState();
    tick(enemyLevel(targets, 400), s, InputBit.missile);
    expect(s.missileActive[0]).toBe(0);
  });

  it('bursts on the first enemy it touches, destroying all within 20 px, then reloads for 1 s', () => {
    const level = enemyLevel(targets, 600);
    const s = createSimState();
    s.missile = true;
    tick(level, s, InputBit.missile);
    expect(s.missileActive[0]).toBe(1);
    let t = 0;
    while (s.missileActive[0] === 1 && t++ < 200) tick(level, s, InputBit.missile);
    expect(Array.from(s.enemyStatus)).toEqual([EnemyStatus.destroyed, EnemyStatus.destroyed, EnemyStatus.alive]);
    const burst = s.missileBlastTick[0]!;
    expect(s.missileReadyTick).toBe(burst + MISSILE_RELOAD_TICKS);
    // Held, and pressed again before the reload is done: nothing.
    tick(level, s, InputBit.missile);
    tick(level, s, 0);
    tick(level, s, InputBit.missile);
    expect(s.missileActive[0]).toBe(0);
  });
});

describe('drones', () => {
  it('follow the ship 16 ticks behind and fire with it', () => {
    const s = createSimState();
    s.drones = 1;
    for (let k = 0; k < 20; k++) tick(open, s, InputBit.down);
    // At tick 20 the drone is where the ship was at tick 4.
    expect([s.droneX[0], s.droneY[0]]).toEqual([64 * Q, 108 * Q + 4 * SHIP_SPEED_Q8]);
    tick(open, s, InputBit.fire);
    const sources = Array.from(s.shotSource.filter((_, k) => s.shotActive[k] === 1)).sort();
    expect(sources).toEqual([0, 1]);
  });
});

describe('shield', () => {
  it('takes 3 hits from bullets; the next costs a life', () => {
    const s = createSimState();
    // The shield comes after the missile.
    s.meter = PowerUp.missile;
    s.missile = true;
    capsuleOnShip(s);
    tick(open, s, 0);
    expect(s.shieldHits).toBe(SHIELD_HITS);
    for (let k = 0; k < SHIELD_HITS; k++) {
      bulletOnShip(s);
      tick(open, s, 0);
    }
    expect([s.shieldHits, s.lives]).toEqual([0, 3]);
    bulletOnShip(s);
    tick(open, s, 0);
    expect(s.lives).toBe(2);
  });

  it('a wall still costs a life', () => {
    // Bars 5 to 8 (world x 50 to 88) fill the floor up to the ship.
    const level = handLevel('easy', Array.from({ length: 20 }, (_, i): [number, number] => (i >= 5 && i <= 8 ? [0, 20] : [0, 0])), 0, 100);
    const s = createSimState();
    s.shieldHits = SHIELD_HITS;
    tick(level, s, 0);
    expect([s.lives, s.shieldHits]).toEqual([2, 0]);
  });

  it('ramming an enemy with the shield destroys it and costs a shield hit', () => {
    const level = enemyLevel([{ kind: EnemyKind.ship, spawnTick: 1, x: 392 * Q }]);
    const s = createSimState();
    s.shieldHits = SHIELD_HITS;
    while (s.enemyStatus[0] !== EnemyStatus.destroyed && s.tick < 900) tick(level, s, 0);
    expect([s.lives, s.shieldHits, s.score]).toEqual([3, SHIELD_HITS - 1, 0]);
  });
});
