// Enemies, shots and bullets drawn from the sim state, plus their cosmetics: a burst when
// an enemy is destroyed, an explosion when the ship loses a life, and the lives left
// (docs/PLAN.md, "Enemies"). Turrets and tanks are placed against the terrain as drawn, so
// they stay on their bars. Effect timing comes from song time, so capture mode reproduces
// it. Sprites are pooled; drawing allocates nothing.

import {
  BULLET_SLOTS,
  EnemyKind,
  EnemyStatus,
  MAX_SHOTS,
  Q8,
  SAMPLES_PER_TICK,
  SAMPLE_RATE,
  SHOT_HEIGHT,
  SHOT_WIDTH,
  TANK_SPEED_Q8,
  type Level,
  type SimState,
} from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { Explosion, SHIP_EXPLOSION, type ExplosionStyle } from './effects.ts';
import { AMBER, BACKGROUND, CYAN, LIME, MAGENTA, WHITE } from './palette.ts';
import { flipRows, mapTexture } from './pixels.ts';
import { seededRandom } from './random.ts';
import { SHIP_SPRITE_HEIGHT, SHIP_SPRITE_WIDTH, shipTexture } from './ship.ts';

const TURRET_MAP = [
  '..mmmm..',
  '.mwwmmm.',
  'mmmmmmmm',
  'aaaaaaaa',
  'a.aa.a.a',
  'aaaaaaaa',
];

const TANK_MAP = [
  '.....lll....',
  'lllllllll...',
  '..llllllll..',
  '.llllwwllll.',
  'gggggggggggg',
  'g.gg.gg.gg.g',
  '.gggggggggg.',
];

const ENEMY_SHIP_MAP = [
  '......mm..',
  '....mmmm..',
  '..mmmmmmaa',
  'wmmmmmmmaa',
  'wmmmmmmmaa',
  '..mmmmmmaa',
  '....mmmm..',
  '......mm..',
];

const BULLET_MAP = ['.mm.', 'mwwm', 'mwwm', '.mm.'];

const COLORS: Record<string, number> = { m: MAGENTA, w: WHITE, a: AMBER, l: LIME, g: 0x3c7a1a };

/** Enemy sprites on screen at once; enemies beyond this are not drawn. */
const ENEMY_SPRITES = 64;
/** Enemy bursts that can play at once; the oldest is reused. */
const BURSTS = 8;
const ENEMY_BURST: ExplosionStyle = { particles: 16, ms: 450, colors: [WHITE, MAGENTA, AMBER, LIME], speed: 70 };
/** The ship blinks every 6 ticks (20 ms on, 20 ms off) while it can't be hit. */
const BLINK_TICKS = 6;
const LIFE_ICON_GAP = 2;
const MAX_LIFE_ICONS = 9;

interface Textures {
  turret: Texture;
  turretCeiling: Texture;
  tank: Texture;
  ship: Texture;
  bullet: Texture;
}

let textures: Textures | null = null;

function getTextures(): Textures {
  textures ??= {
    turret: mapTexture(TURRET_MAP, COLORS, 'turret'),
    turretCeiling: mapTexture(flipRows(TURRET_MAP), COLORS, 'turret-ceiling'),
    tank: mapTexture(TANK_MAP, COLORS, 'tank'),
    ship: mapTexture(ENEMY_SHIP_MAP, COLORS, 'enemy-ship'),
    bullet: mapTexture(BULLET_MAP, COLORS, 'bullet'),
  };
  return textures;
}

/** Song samples to milliseconds. */
function samplesToMs(samples: number): number {
  return (samples * 1000) / SAMPLE_RATE;
}

function placeCentred(sprite: Sprite, x: number, y: number): void {
  sprite.position.set(Math.round(x - sprite.width / 2), Math.round(y - sprite.height / 2));
}

export class CombatView {
  readonly container = new Container();
  /** The lives left, drawn over the playfield in the top left corner. */
  readonly hud = new Container();
  #enemies: Sprite[] = [];
  #shots: Sprite[] = [];
  #bullets: Sprite[] = [];
  #lives: Sprite[] = [];
  /** A dark panel behind the life icons, so they read over the ceiling's LEDs. */
  #livesBacking = new Sprite(Texture.WHITE);
  #bursts: Explosion[] = [];
  #burstSample: number[] = [];
  #nextBurst = 0;
  #lifeLost = new Explosion(SHIP_EXPLOSION);
  #lifeLostSample = -1;
  /** Sim tick and first possibly live enemy at the last draw, to find what changed since. */
  #seenTick = 0;
  #scanFrom = 0;
  #seenHit = -1;
  #shipX = 0;
  #shipY = 0;

  constructor() {
    for (let i = 0; i < ENEMY_SPRITES; i++) this.#enemies.push(this.#add(new Sprite()));
    for (let i = 0; i < MAX_SHOTS; i++) {
      const shot = this.#add(new Sprite(Texture.WHITE));
      shot.width = SHOT_WIDTH;
      shot.height = SHOT_HEIGHT;
      shot.tint = CYAN;
      this.#shots.push(shot);
    }
    for (let i = 0; i < BULLET_SLOTS; i++) this.#bullets.push(this.#add(new Sprite()));
    for (let i = 0; i < BURSTS; i++) {
      const b = new Explosion(ENEMY_BURST);
      this.container.addChild(b.container);
      this.#bursts.push(b);
      this.#burstSample.push(-1);
    }
    this.container.addChild(this.#lifeLost.container);
    this.#livesBacking.tint = BACKGROUND;
    this.#livesBacking.alpha = 0.85;
    this.#livesBacking.position.set(2, 2);
    this.#livesBacking.height = SHIP_SPRITE_HEIGHT + 4;
    this.hud.addChild(this.#livesBacking);
    for (let i = 0; i < MAX_LIFE_ICONS; i++) {
      const icon = new Sprite(shipTexture());
      icon.position.set(4 + i * (SHIP_SPRITE_WIDTH + LIFE_ICON_GAP), 4);
      icon.visible = false;
      this.hud.addChild(icon);
      this.#lives.push(icon);
    }
  }

  #add(sprite: Sprite): Sprite {
    sprite.visible = false;
    this.container.addChild(sprite);
    return sprite;
  }

  /** Forgets the bursts and explosions, for a new run or when the song starts over. */
  reset(): void {
    this.#seenTick = 0;
    this.#scanFrom = 0;
    this.#seenHit = -1;
    this.#lifeLostSample = -1;
    this.#lifeLost.hide();
    for (let i = 0; i < BURSTS; i++) {
      this.#burstSample[i] = -1;
      this.#bursts[i]!.hide();
    }
  }

  /**
   * Draws `state` over the terrain scrolled to `scrollPx`, at song sample `displaySamples`.
   * Returns whether the ship should be drawn this frame: not while it blinks after losing
   * a life.
   */
  draw(level: Level, state: SimState, scrollPx: number, displaySamples: number): boolean {
    if (state.tick < this.#seenTick) this.reset();
    const tex = getTextures();
    const e = level.enemies;

    // Enemies.
    let used = 0;
    for (let i = state.firstLive; i < state.nextSpawn && used < ENEMY_SPRITES; i++) {
      if (state.enemyStatus[i] !== EnemyStatus.alive) continue;
      const sprite = this.#enemies[used++]!;
      sprite.visible = true;
      const y = state.enemyY[i]! / Q8;
      switch (e.kind[i]) {
        case EnemyKind.turret:
          sprite.texture = e.side[i] === 1 ? tex.turretCeiling : tex.turret;
          placeCentred(sprite, e.x[i]! / Q8 - scrollPx, y);
          break;
        case EnemyKind.tank: {
          sprite.texture = tex.tank;
          const wx = e.x[i]! - TANK_SPEED_Q8 * (state.tick - e.spawnTick[i]!);
          placeCentred(sprite, wx / Q8 - scrollPx, y);
          break;
        }
        default:
          sprite.texture = tex.ship;
          placeCentred(sprite, state.enemyX[i]! / Q8, y);
      }
    }
    for (let i = used; i < ENEMY_SPRITES; i++) this.#enemies[i]!.visible = false;

    // Shots and bullets.
    for (let s = 0; s < MAX_SHOTS; s++) {
      const sprite = this.#shots[s]!;
      sprite.visible = state.shotActive[s] === 1;
      if (sprite.visible) placeCentred(sprite, state.shotX[s]! / Q8, state.shotY[s]! / Q8);
    }
    for (let b = 0; b < BULLET_SLOTS; b++) {
      const sprite = this.#bullets[b]!;
      sprite.visible = state.bulletActive[b] === 1;
      if (!sprite.visible) continue;
      sprite.texture = tex.bullet;
      placeCentred(sprite, state.bulletX[b]! / Q8, state.bulletY[b]! / Q8);
    }

    // Bursts for enemies destroyed since the last draw. They sit at or after the first
    // live enemy of the last draw.
    for (let i = this.#scanFrom; i < state.nextSpawn; i++) {
      if (state.enemyStatus[i] !== EnemyStatus.destroyed || state.enemyEndTick[i]! <= this.#seenTick) continue;
      const k = this.#nextBurst;
      this.#nextBurst = (k + 1) % BURSTS;
      this.#bursts[k]!.start(state.enemyX[i]! / Q8, state.enemyY[i]! / Q8, seededRandom(i + 1));
      this.#burstSample[k] = state.enemyEndTick[i]! * SAMPLES_PER_TICK;
    }
    for (let k = 0; k < BURSTS; k++) {
      if (this.#burstSample[k]! < 0) continue;
      this.#bursts[k]!.draw(Math.max(0, samplesToMs(displaySamples - this.#burstSample[k]!)));
    }

    // Losing a life, short of the last: an explosion where the ship was drawn last.
    if (state.hitTick !== this.#seenHit && state.hitTick > 0 && !state.dead) {
      this.#lifeLost.start(this.#shipX, this.#shipY, seededRandom(state.hitTick));
      this.#lifeLostSample = state.hitTick * SAMPLES_PER_TICK;
    }
    this.#seenHit = state.hitTick;
    if (this.#lifeLostSample >= 0) this.#lifeLost.draw(Math.max(0, samplesToMs(displaySamples - this.#lifeLostSample)));

    // Lives.
    const lives = state.lives < MAX_LIFE_ICONS ? state.lives : MAX_LIFE_ICONS;
    for (let i = 0; i < MAX_LIFE_ICONS; i++) this.#lives[i]!.visible = i < lives;
    this.#livesBacking.visible = lives > 0;
    this.#livesBacking.width = lives * (SHIP_SPRITE_WIDTH + LIFE_ICON_GAP) + LIFE_ICON_GAP;

    this.#seenTick = state.tick;
    this.#scanFrom = state.firstLive;
    this.#shipX = state.shipX / Q8;
    this.#shipY = state.shipY / Q8;
    return state.tick >= state.safeUntil || Math.floor(state.tick / BLINK_TICKS) % 2 === 0;
  }
}
