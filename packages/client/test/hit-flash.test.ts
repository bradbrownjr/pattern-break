// A tank that takes a hit and survives shows white for HIT_FLASH_SAMPLES (render/combat.ts).

import { EnemyKind, EnemyStatus, Q8, createSimState, emptyEnemyList } from '@game/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { CombatView, HIT_FLASH_SAMPLES, getTextures } from '../src/render/combat.ts';
import { makeLevel } from './make-level.ts';

describe('hit flash', () => {
  it('shows a tank white for a moment after a hit it survives, and not when it appears', () => {
    const enemies = {
      ...emptyEnemyList(),
      count: 1,
      kind: Uint8Array.of(EnemyKind.tank),
      instrument: Uint8Array.of(0),
      spawnTick: Uint32Array.of(0),
      x: Int32Array.of(200 * Q8),
      y: Int32Array.of(190 * Q8),
      side: Uint8Array.of(0),
      motion: Uint8Array.of(0),
      fireStart: Uint32Array.of(0, 0),
      formation: Int32Array.of(-1),
    };
    const level = makeLevel({ ceiling: Array(60).fill(2), floor: Array(60).fill(2), enemies });
    const state = createSimState();
    state.enemyStatus = Uint8Array.of(EnemyStatus.alive);
    state.enemyHp = Uint8Array.of(3);
    state.enemyX = Int32Array.of(200 * Q8);
    state.enemyY = Int32Array.of(190 * Q8);
    state.firstLive = 0;
    state.nextSpawn = 1;
    state.tick = 1;
    const view = new CombatView();
    const tank = view.container.children[0] as Sprite;
    const tex = getTextures();

    view.draw(level, state, 0, 1000);
    expect(tank.texture).toBe(tex.tank);
    state.enemyHp[0] = 2;
    view.draw(level, state, 0, 2000);
    expect(tank.texture).toBe(tex.tankHit);
    view.draw(level, state, 0, 2000 + HIT_FLASH_SAMPLES - 1);
    expect(tank.texture).toBe(tex.tankHit);
    view.draw(level, state, 0, 2000 + HIT_FLASH_SAMPLES);
    expect(tank.texture).toBe(tex.tank);
  });
});
