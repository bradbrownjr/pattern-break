// Enemies, shots, bullets and the bomb drawn from the sim state, plus their cosmetics: a
// burst and the points scored when an enemy is destroyed, the bomb's blast, the nuke's
// flash, an explosion when the ship loses a life, and the HUD: lives left, the streak
// multiplier, nukes held and the score (docs/PLAN.md, "Enemies" and "Scoring"). Turrets and tanks are placed against the terrain as drawn, so
// they stay on their bars. Effect timing comes from song time, so capture mode reproduces
// it. Sprites are pooled; drawing allocates nothing.

import {
  BULLET_SLOTS,
  EnemyKind,
  EnemyStatus,
  MAX_SHOTS,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
  Q8,
  SAMPLES_PER_TICK,
  SAMPLE_RATE,
  SHOT_HEIGHT,
  SHOT_WIDTH,
  TANK_SPEED_Q8,
  scoreMultiplier,
  type Level,
  type SimState,
} from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { Explosion, SHIP_EXPLOSION, type ExplosionStyle } from './effects.ts';
import { flashAlpha } from './flash.ts';
import { AMBER, BACKGROUND, CYAN, LIME, MAGENTA, WHITE } from './palette.ts';
import { flipRows, mapTexture } from './pixels.ts';
import { seededRandom } from './random.ts';
import { PixelText } from './text.ts';
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

const BOMB_MAP = ['.aa.', 'awwa', 'aaaa', '.aa.'];

/** The bomb in the HUD. */
const BOMB_ICON_MAP = [
  '....ww.',
  '...w...',
  '..aaa..',
  '.aaaaa.',
  '.aawaa.',
  '.aaaaa.',
  '..aaa..',
];
/** The HUD bomb's opacity while a bomb falls or reloads. */
const BOMB_ICON_DIM = 0.3;

/** A nuke held, in the HUD. */
const NUKE_MAP = [
  '..aaa..',
  '.a...a.',
  'a.w.w.a',
  'a..w..a',
  'a.w.w.a',
  '.a...a.',
  '..aaa..',
];

const COLORS: Record<string, number> = { m: MAGENTA, w: WHITE, a: AMBER, l: LIME, g: 0x3c7a1a };

/** Enemy sprites on screen at once; enemies beyond this are not drawn. */
const ENEMY_SPRITES = 64;
/** Enemy bursts that can play at once; the oldest is reused. */
const BURSTS = 8;
const ENEMY_BURST: ExplosionStyle = { particles: 16, ms: 450, colors: [WHITE, MAGENTA, AMBER, LIME], speed: 70 };
const BLAST: ExplosionStyle = { particles: 40, ms: 600, colors: [WHITE, AMBER, AMBER, MAGENTA], speed: 130 };
const NUKE_ICONS = 3;
/** The ship blinks every 6 ticks (20 ms on, 20 ms off) while it can't be hit. */
const BLINK_TICKS = 6;
const LIFE_ICON_GAP = 2;
const MAX_LIFE_ICONS = 9;
/** Point popups that can show at once; the oldest is reused. */
const POPUPS = 8;
const POPUP_MS = 600;
const POPUP_RISE_PX = 8;
const SCORE_DIGITS = 7;
const HUD_PAD = 2;

interface Textures {
  turret: Texture;
  turretCeiling: Texture;
  tank: Texture;
  ship: Texture;
  bullet: Texture;
  bomb: Texture;
  bombIcon: Texture;
  nuke: Texture;
}

let textures: Textures | null = null;

function getTextures(): Textures {
  textures ??= {
    turret: mapTexture(TURRET_MAP, COLORS, 'turret'),
    turretCeiling: mapTexture(flipRows(TURRET_MAP), COLORS, 'turret-ceiling'),
    tank: mapTexture(TANK_MAP, COLORS, 'tank'),
    ship: mapTexture(ENEMY_SHIP_MAP, COLORS, 'enemy-ship'),
    bullet: mapTexture(BULLET_MAP, COLORS, 'bullet'),
    bomb: mapTexture(BOMB_MAP, COLORS, 'bomb'),
    bombIcon: mapTexture(BOMB_ICON_MAP, COLORS, 'bomb-icon'),
    nuke: mapTexture(NUKE_MAP, COLORS, 'nuke'),
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
  #popups: PixelText[] = [];
  #popupSample: number[] = [];
  #popupX: number[] = [];
  #popupY: number[] = [];
  #nextPopup = 0;
  #multiplier = new PixelText('', AMBER);
  #score = new PixelText('', WHITE);
  #scoreBacking = new Sprite(Texture.WHITE);
  #shownScore = -1;
  #bomb = new Sprite();
  #blast = new Explosion(BLAST);
  #blastSample = -1;
  #seenBlast = -1;
  /** The nuke's flash over the playfield, under the HUD. */
  #nukeFlash = new Sprite(Texture.WHITE);
  #nukeSample = -1;
  #seenNuke = -1;
  #nukes: Sprite[] = [];
  #bombIcon = new Sprite();
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
    this.#bomb.texture = getTextures().bomb;
    this.#add(this.#bomb);
    this.container.addChild(this.#blast.container, this.#lifeLost.container);
    this.#nukeFlash.width = PLAYFIELD_WIDTH;
    this.#nukeFlash.height = PLAYFIELD_HEIGHT;
    this.#nukeFlash.visible = false;
    this.hud.addChild(this.#nukeFlash);
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
    this.#bombIcon.texture = getTextures().bombIcon;
    this.hud.addChild(this.#multiplier, this.#bombIcon);
    for (let i = 0; i < NUKE_ICONS; i++) {
      const icon = new Sprite(getTextures().nuke);
      icon.visible = false;
      this.hud.addChild(icon);
      this.#nukes.push(icon);
    }
    this.#scoreBacking.tint = BACKGROUND;
    this.#scoreBacking.alpha = 0.85;
    this.#scoreBacking.height = SHIP_SPRITE_HEIGHT + 4;
    this.hud.addChild(this.#scoreBacking, this.#score);
    for (let i = 0; i < POPUPS; i++) {
      const popup = new PixelText('', WHITE);
      popup.visible = false;
      this.container.addChild(popup);
      this.#popups.push(popup);
      this.#popupSample.push(-1);
      this.#popupX.push(0);
      this.#popupY.push(0);
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
    this.#blastSample = -1;
    this.#seenBlast = -1;
    this.#blast.hide();
    this.#nukeSample = -1;
    this.#seenNuke = -1;
    this.#nukeFlash.visible = false;
    for (let i = 0; i < BURSTS; i++) {
      this.#burstSample[i] = -1;
      this.#bursts[i]!.hide();
    }
    for (let i = 0; i < POPUPS; i++) {
      this.#popupSample[i] = -1;
      this.#popups[i]!.visible = false;
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

    // The bomb, its blast, and the nuke's flash.
    this.#bomb.visible = state.bombActive;
    if (state.bombActive) placeCentred(this.#bomb, state.bombX / Q8, state.bombY / Q8);
    if (state.blastTick !== this.#seenBlast && state.blastTick > 0) {
      this.#blast.start(state.blastX / Q8, state.blastY / Q8, seededRandom(state.blastTick));
      this.#blastSample = state.blastTick * SAMPLES_PER_TICK;
    }
    this.#seenBlast = state.blastTick;
    if (this.#blastSample >= 0) this.#blast.draw(Math.max(0, samplesToMs(displaySamples - this.#blastSample)));
    if (state.nukeTick !== this.#seenNuke && state.nukeTick > 0) this.#nukeSample = state.nukeTick * SAMPLES_PER_TICK;
    this.#seenNuke = state.nukeTick;
    const nukeAlpha = this.#nukeSample < 0 ? 0 : flashAlpha(samplesToMs(displaySamples - this.#nukeSample));
    this.#nukeFlash.visible = nukeAlpha > 0;
    this.#nukeFlash.alpha = nukeAlpha;

    // Bursts for enemies destroyed since the last draw. They sit at or after the first
    // live enemy of the last draw.
    for (let i = this.#scanFrom; i < state.nextSpawn; i++) {
      if (state.enemyStatus[i] !== EnemyStatus.destroyed || state.enemyEndTick[i]! <= this.#seenTick) continue;
      const k = this.#nextBurst;
      this.#nextBurst = (k + 1) % BURSTS;
      this.#bursts[k]!.start(state.enemyX[i]! / Q8, state.enemyY[i]! / Q8, seededRandom(i + 1));
      this.#burstSample[k] = state.enemyEndTick[i]! * SAMPLES_PER_TICK;
      // Shot down, not rammed: show the points, amber when on the beat.
      if (state.enemyPoints[i]! > 0) {
        const p = this.#nextPopup;
        this.#nextPopup = (p + 1) % POPUPS;
        this.#popups[p]!.text = String(state.enemyPoints[i]);
        this.#popups[p]!.color = state.enemyOnBeat[i] === 1 ? AMBER : WHITE;
        this.#popupX[p] = state.enemyX[i]! / Q8;
        this.#popupY[p] = state.enemyY[i]! / Q8 - 10;
        this.#popupSample[p] = state.enemyEndTick[i]! * SAMPLES_PER_TICK;
      }
    }
    for (let p = 0; p < POPUPS; p++) {
      const popup = this.#popups[p]!;
      const ms = this.#popupSample[p]! < 0 ? -1 : samplesToMs(displaySamples - this.#popupSample[p]!);
      popup.visible = ms >= 0 && ms < POPUP_MS;
      if (popup.visible) popup.place(this.#popupX[p]!, this.#popupY[p]! - Math.floor((ms * POPUP_RISE_PX) / POPUP_MS), 'center');
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
    const iconsWidth = lives * (SHIP_SPRITE_WIDTH + LIFE_ICON_GAP) + LIFE_ICON_GAP;
    // The bomb: bright when one can drop, dim while one falls or reloads.
    const bombX = 2 + iconsWidth + HUD_PAD;
    this.#bombIcon.position.set(bombX, 4 + Math.floor((SHIP_SPRITE_HEIGHT - BOMB_ICON_MAP.length) / 2));
    this.#bombIcon.alpha = !state.bombActive && state.tick + 1 >= state.bombReadyTick ? 1 : BOMB_ICON_DIM;
    const afterBomb = bombX + BOMB_ICON_MAP[0]!.length + LIFE_ICON_GAP;
    const multiplier = scoreMultiplier(state.streak);
    this.#multiplier.visible = multiplier > 1;
    this.#multiplier.text = `x${multiplier}`;
    this.#multiplier.place(afterBomb + HUD_PAD, 4 + Math.floor((SHIP_SPRITE_HEIGHT - 7) / 2));
    let right = afterBomb + (multiplier > 1 ? this.#multiplier.textWidth + 2 * HUD_PAD : 0);
    const nukes = state.nukes < NUKE_ICONS ? state.nukes : NUKE_ICONS;
    for (let i = 0; i < NUKE_ICONS; i++) {
      const icon = this.#nukes[i]!;
      icon.visible = i < nukes;
      if (!icon.visible) continue;
      icon.position.set(right + (i === 0 ? HUD_PAD : 0), 4 + Math.floor((SHIP_SPRITE_HEIGHT - NUKE_MAP.length) / 2));
      right = icon.x + NUKE_MAP.length + LIFE_ICON_GAP;
    }
    this.#livesBacking.width = right - 2;

    // Score, in the top right corner.
    if (state.score !== this.#shownScore) {
      this.#shownScore = state.score;
      this.#score.text = String(state.score).padStart(SCORE_DIGITS, '0');
      const right = PLAYFIELD_WIDTH - 4;
      this.#score.place(right, 4 + Math.floor((SHIP_SPRITE_HEIGHT - 7) / 2), 'right');
      this.#scoreBacking.width = this.#score.textWidth + 2 * HUD_PAD + 1;
      this.#scoreBacking.position.set(right - this.#score.textWidth - HUD_PAD, 2);
    }

    this.#seenTick = state.tick;
    this.#scanFrom = state.firstLive;
    this.#shipX = state.shipX / Q8;
    this.#shipY = state.shipY / Q8;
    return state.tick >= state.safeUntil || Math.floor(state.tick / BLINK_TICKS) % 2 === 0;
  }
}
