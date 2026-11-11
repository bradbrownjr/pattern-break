// Enemies, shots, bullets, the bomb, missiles, drones, capsules and the shield drawn from
// the sim state, plus their cosmetics: a burst and the points scored when an enemy is
// destroyed, "1UP" for an extra life, the bomb's and missiles' blasts, the nuke's flash, the
// shield flickering when it takes a hit, an explosion when the ship loses a life, and the
// HUD (docs/PLAN.md, "HUD"): the arsenal in the top left (bomb and missile reloading,
// power-ups held, nukes held), the multiplier and score in the top right, lives in the
// bottom left and shield points in the bottom right. Turrets and tanks are placed against
// the terrain as drawn, so they stay on their bars. Effect timing comes from song time, so
// capture mode reproduces it. Sprites are pooled; drawing allocates nothing.

import {
  BOMB_RELOAD_TICKS,
  BOOST_FUEL_PER_LEVEL,
  BOOST_MAX_LEVEL,
  BULLET_SLOTS,
  EnemyKind,
  CAPSULE_SLOTS,
  EnemyStatus,
  LASER_WIDTH,
  MAX_DRONES,
  MISSILE_RELOAD_TICKS,
  MISSILE_SLOTS,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
  Q8,
  SAMPLES_PER_TICK,
  SAMPLE_RATE,
  SHIELD_MAX,
  SHOT_HEIGHT,
  SHOT_SLOTS,
  SHOT_WIDTH,
  TANK_SPEED_Q8,
  nextUnlock,
  scoreMultiplier,
  type Level,
  type SimState,
} from '@game/core';
import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { Explosion, ShipBreakup, type ExplosionStyle } from './effects.ts';
import { FlashGate, flashAlpha } from './flash.ts';
import { AMBER, BACKGROUND, CYAN, LIME, MAGENTA, WHITE } from './palette.ts';
import { flipRows, mapTexture } from './pixels.ts';
import {
  BOMB_ICON_MAP,
  BOOST_ICON_MAP,
  DOUBLE_ICON_MAP,
  DRONE_ICON_MAP,
  ICON_COLORS,
  LASER_ICON_MAP,
  MISSILE_ICON_MAP,
  NUKE_MAP,
  POWER_UP_ICON_MAPS,
  capsuleMap,
} from './icons.ts';
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

/**
 * Enemy bullets by the kind that fired them, indexed by EnemyKind. All have the same 4 px
 * hitbox; a tank's shell is a lime block, a turret's (which empties the shield) an amber
 * pellet with a 1 px glow around the hitbox.
 */
const BULLET_MAPS = [
  ['..aa..', '.awwa.', 'awwwwa', 'awwwwa', '.awwa.', '..aa..'],
  ['llll', 'lwwl', 'lwwl', 'llll'],
  ['.mm.', 'mwwm', 'mwwm', '.mm.'],
];

const BOMB_MAP = ['.aa.', 'awwa', 'aaaa', '.aa.'];

/** The HUD bomb's and missile's empty part: they fill from the bottom as they reload. */
const BOMB_ICON_DIM = 0.3;
/** An arsenal icon for something the ship doesn't have: a power-up not unlocked, a nuke not held. */
const NOT_HELD_ALPHA = 0.2;
const ICON_ROWS = BOMB_ICON_MAP.length;

/** The double's angled shot. */
const SHOT_UP_MAP = ['...c', '..c.', '.c..', 'c...'];
const MISSILE_MAP = ['..cc....', 'mcccccww', 'mcccccww', '..cc....'];
const DRONE_MAP = ['.cccc.', 'ccwwcc', 'cwwwwc', 'cwwwwc', 'ccwwcc', '.cccc.'];
/** A capsule when every power-up is at its most, so it unlocks nothing: an amber pill marked P. */
const CAPSULE_MAP = [
  '.aaaaaa.',
  'aawwwwaa',
  'aawaawaa',
  'aawwwwaa',
  'aawaaaaa',
  'aawaaaaa',
  'aaaaaaaa',
  '.aaaaaa.',
];

/** An ellipse outline `w` x `h` px around the ship, for the shield. */
function ringMap(w: number, h: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2);
      const dy = (y + 0.5 - h / 2) / (h / 2);
      const d = dx * dx + dy * dy;
      row += d <= 1 && d >= 0.6 ? 'c' : '.';
    }
    rows.push(row);
  }
  return rows;
}
const SHIELD_MAP = ringMap(22, 14);
/** The shield's opacity with 0 to SHIELD_MAX points left. */
const SHIELD_ALPHA = [0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
/** After a hit the shield flickers for 0.25 s, on and off every 3 ticks, at full strength. */
const SHIELD_FLICKER_TICKS = 30;
const SHIELD_FLICKER_STEP = 3;



const COLORS = ICON_COLORS;

/** Enemy sprites on screen at once; enemies beyond this are not drawn. */
const ENEMY_SPRITES = 64;
/** Enemy bursts that can play at once; the oldest is reused. */
const BURSTS = 8;
/**
 * How long an enemy that takes a hit and survives shows white: tanks, the only enemy with
 * more than one hit (ENEMY_HP). A sprite-sized change, far under WCAG's area for a flash,
 * so it doesn't go through the FlashGate.
 */
export const HIT_FLASH_SAMPLES = Math.round(SAMPLE_RATE * 0.07);
const ENEMY_BURST: ExplosionStyle = { particles: 16, ms: 450, colors: [WHITE, MAGENTA, AMBER, LIME], speed: 70 };
const BLAST: ExplosionStyle = { particles: 40, ms: 600, colors: [WHITE, AMBER, AMBER, MAGENTA], speed: 130 };
const MISSILE_BLAST: ExplosionStyle = { particles: 28, ms: 500, colors: [WHITE, CYAN, CYAN, MAGENTA], speed: 110 };
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
/** The HUD's panels: as tall as a life icon plus a 2 px margin each side. */
const PANEL_HEIGHT = SHIP_SPRITE_HEIGHT + 4;
/** The top row's icons, 7 px square, centred in its panel. */
const ICON_SIZE = BOMB_ICON_MAP.length;
const ICON_Y = 4 + Math.floor((SHIP_SPRITE_HEIGHT - ICON_SIZE) / 2);
/**
 * The arsenal's slots, left to right; each keeps its place whether held or not, so it can
 * be read without looking: bomb, missile, double, laser, two drones, boost, three nukes.
 */
const Slot = { bomb: 0, missile: 1, double: 2, laser: 3, drone: 4, boost: 6, nuke: 7 } as const;
const SLOTS = Slot.nuke + NUKE_ICONS;
/** Slot `i`'s x: icons 2 px apart, with a further gap before the nukes. */
function slotX(i: number): number {
  return 4 + i * (ICON_SIZE + LIFE_ICON_GAP) + (i >= Slot.nuke ? HUD_PAD : 0);
}
/** The bottom panels' top edge. */
const BOTTOM_Y = PLAYFIELD_HEIGHT - 2 - PANEL_HEIGHT;
/** Shield pips, one per point, in the bottom right corner. */
const PIP_WIDTH = 6;
const PIP_GAP = 2;
const PIP_DIM_ALPHA = 0.2;
const PIPS_WIDTH = SHIELD_MAX * PIP_WIDTH + (SHIELD_MAX - 1) * PIP_GAP;

export interface Textures {
  turret: Texture;
  turretCeiling: Texture;
  tank: Texture;
  /** The tank in white, for the moment after it takes a hit and survives. */
  tankHit: Texture;
  ship: Texture;
  /** Enemy bullets, indexed by EnemyKind. */
  bullets: Texture[];
  bomb: Texture;
  bombIcon: Texture;
  /** The bomb icon's bottom k rows, for k = 0 to ICON_ROWS. */
  bombFill: Texture[];
  missileIcon: Texture;
  missileFill: Texture[];
  nuke: Texture;
  shotUp: Texture;
  missile: Texture;
  drone: Texture;
  /** The capsule marked P, for when no power-up is left to unlock. */
  capsule: Texture;
  /** A capsule showing each power-up, in PowerUp order. */
  capsules: Texture[];
  /** The HUD's power-up icons. */
  doubleIcon: Texture;
  laserIcon: Texture;
  droneIcon: Texture;
  boostIcon: Texture;
  shield: Texture;
  /** The shield in white, for its flicker. */
  shieldFlash: Texture;
}

/** A texture's bottom k rows, for k = 0 to its height. */
function bottomRows(texture: Texture, width: number, height: number): Texture[] {
  const out: Texture[] = [];
  for (let k = 0; k <= height; k++) {
    out.push(k === 0 ? Texture.EMPTY : new Texture({ source: texture.source, frame: new Rectangle(0, height - k, width, k) }));
  }
  return out;
}

let textures: Textures | null = null;

/** The combat sprites' textures, made once. The help screen draws its key with them. */
export function getTextures(): Textures {
  textures ??= {
    turret: mapTexture(TURRET_MAP, COLORS, 'turret'),
    turretCeiling: mapTexture(flipRows(TURRET_MAP), COLORS, 'turret-ceiling'),
    tank: mapTexture(TANK_MAP, COLORS, 'tank'),
    tankHit: mapTexture(TANK_MAP, Object.fromEntries(Object.keys(COLORS).map((k) => [k, WHITE])), 'tank-hit'),
    ship: mapTexture(ENEMY_SHIP_MAP, COLORS, 'enemy-ship'),
    bullets: BULLET_MAPS.map((map, k) => mapTexture(map, COLORS, `bullet-${k}`)),
    bomb: mapTexture(BOMB_MAP, COLORS, 'bomb'),
    bombIcon: mapTexture(BOMB_ICON_MAP, COLORS, 'bomb-icon'),
    bombFill: [],
    missileIcon: mapTexture(MISSILE_ICON_MAP, COLORS, 'missile-icon'),
    missileFill: [],
    nuke: mapTexture(NUKE_MAP, COLORS, 'nuke'),
    shotUp: mapTexture(SHOT_UP_MAP, COLORS, 'shot-up'),
    missile: mapTexture(MISSILE_MAP, COLORS, 'missile'),
    drone: mapTexture(DRONE_MAP, COLORS, 'drone'),
    capsule: mapTexture(CAPSULE_MAP, COLORS, 'capsule'),
    capsules: POWER_UP_ICON_MAPS.map((icon, i) => mapTexture(capsuleMap(icon), COLORS, `capsule-${i}`)),
    doubleIcon: mapTexture(DOUBLE_ICON_MAP, COLORS, 'double-icon'),
    laserIcon: mapTexture(LASER_ICON_MAP, COLORS, 'laser-icon'),
    droneIcon: mapTexture(DRONE_ICON_MAP, COLORS, 'drone-icon'),
    boostIcon: mapTexture(BOOST_ICON_MAP, COLORS, 'boost-icon'),
    shield: mapTexture(SHIELD_MAP, COLORS, 'shield'),
    shieldFlash: mapTexture(SHIELD_MAP, { c: WHITE }, 'shield-flash'),
  };
  if (textures.bombFill.length === 0) {
    textures.bombFill = bottomRows(textures.bombIcon, BOMB_ICON_MAP[0]!.length, ICON_ROWS);
    textures.missileFill = bottomRows(textures.missileIcon, MISSILE_ICON_MAP[0]!.length, ICON_ROWS);
  }
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
  // A render group of its own: its sprites come and go every frame, and a visibility change
  // rebuilds only this group's draw list, not the whole scene's (docs/DEVELOPMENT.md,
  // "Performance").
  readonly container = new Container({ isRenderGroup: true });
  /**
   * The HUD, drawn over the playfield. Its own render group too: icons, the multiplier and
   * popups come and go.
   */
  readonly hud = new Container({ isRenderGroup: true });
  #enemies: Sprite[] = [];
  #shots: Sprite[] = [];
  #bullets: Sprite[] = [];
  #lives: Sprite[] = [];
  /** Dark panels behind the HUD's groups, so they read over the walls' LEDs. */
  #livesBacking = new Sprite(Texture.WHITE);
  #arsenalBacking = new Sprite(Texture.WHITE);
  #shieldBacking = new Sprite(Texture.WHITE);
  #doubleIcon = new Sprite();
  #laserIcon = new Sprite();
  #droneIcons: Sprite[] = [];
  #boostIcon = new Sprite();
  /** Boost's fuel, a line under its icon. */
  #fuel = new Sprite(Texture.WHITE);
  #pips: Sprite[] = [];
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
  /** "Cheat" left of the score when the run has a cheat: its score can't go on a board. */
  #cheat = new PixelText('Cheat', MAGENTA);
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
  #bombFill = new Sprite();
  #missileIcon = new Sprite();
  #missileFill = new Sprite();
  #missiles: Sprite[] = [];
  #missileBlasts: Explosion[] = [];
  #missileBlastSample: number[] = [];
  #seenMissileBlast: number[] = [];
  #drones: Sprite[] = [];
  #capsules: Sprite[] = [];
  #shield = new Sprite();
  #seenExtraLife = -1;
  #shownMultiplier = -1;

  #lifeLost: ShipBreakup;
  #lifeLostSample = -1;
  /** Sim tick and first possibly live enemy at the last draw, to find what changed since. */
  #seenTick = 0;
  #scanFrom = 0;
  #seenHit = -1;
  #shipX = 0;
  #shipY = 0;
  #flashes: FlashGate;
  /** Each enemy's hits left at the last draw, and the song sample it last took a hit. */
  #lastHp = new Uint8Array(0);
  #hitSample = new Float64Array(0);

  /** `flashes` decides whether the nuke's flash is shown, and how strong it is. */
  constructor(flashes: FlashGate = new FlashGate()) {
    this.#flashes = flashes;
    this.#lifeLost = new ShipBreakup(flashes);
    for (let i = 0; i < ENEMY_SPRITES; i++) this.#enemies.push(this.#add(new Sprite()));
    const tex = getTextures();
    for (let i = 0; i < CAPSULE_SLOTS; i++) this.#capsules.push(this.#add(new Sprite(tex.capsule)));
    for (let i = 0; i < SHOT_SLOTS; i++) this.#shots.push(this.#add(new Sprite(Texture.WHITE)));
    for (let i = 0; i < MISSILE_SLOTS; i++) {
      this.#missiles.push(this.#add(new Sprite(tex.missile)));
      const blast = new Explosion(MISSILE_BLAST);
      this.container.addChild(blast.container);
      this.#missileBlasts.push(blast);
      this.#missileBlastSample.push(-1);
      this.#seenMissileBlast.push(-1);
    }
    for (let i = 0; i < MAX_DRONES; i++) this.#drones.push(this.#add(new Sprite(tex.drone)));
    this.#shield.texture = tex.shield;
    this.#add(this.#shield);
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
    for (const backing of [this.#livesBacking, this.#arsenalBacking, this.#shieldBacking]) {
      backing.tint = BACKGROUND;
      backing.alpha = 0.85;
      backing.height = PANEL_HEIGHT;
      this.hud.addChild(backing);
    }
    // Lives, in the bottom left corner: they grow to MAX_LIFE_ICONS with a good run.
    this.#livesBacking.position.set(2, BOTTOM_Y);
    for (let i = 0; i < MAX_LIFE_ICONS; i++) {
      const icon = new Sprite(shipTexture());
      icon.position.set(4 + i * (SHIP_SPRITE_WIDTH + LIFE_ICON_GAP), BOTTOM_Y + 2);
      icon.visible = false;
      this.hud.addChild(icon);
      this.#lives.push(icon);
    }
    // The arsenal, in the top left corner.
    this.#arsenalBacking.position.set(2, 2);
    this.#arsenalBacking.width = slotX(SLOTS - 1) + ICON_SIZE + HUD_PAD - 2;
    this.#bombIcon.texture = tex.bombIcon;
    this.#bombIcon.alpha = BOMB_ICON_DIM;
    this.#bombIcon.position.set(slotX(Slot.bomb), ICON_Y);
    this.#missileIcon.texture = tex.missileIcon;
    this.#missileIcon.position.set(slotX(Slot.missile), ICON_Y);
    const icons: [Sprite, Texture, number][] = [
      [this.#doubleIcon, tex.doubleIcon, Slot.double],
      [this.#laserIcon, tex.laserIcon, Slot.laser],
      [this.#boostIcon, tex.boostIcon, Slot.boost],
    ];
    for (let i = 0; i < MAX_DRONES; i++) {
      const drone = new Sprite();
      this.#droneIcons.push(drone);
      icons.push([drone, tex.droneIcon, Slot.drone + i]);
    }
    for (const [sprite, texture, slot] of icons) {
      sprite.texture = texture;
      sprite.position.set(slotX(slot), ICON_Y);
    }
    this.#fuel.tint = CYAN;
    this.#fuel.height = 1;
    this.#fuel.position.set(slotX(Slot.boost), ICON_Y + ICON_SIZE + 1);
    this.hud.addChild(this.#bombIcon, this.#bombFill, this.#missileIcon, this.#missileFill, ...icons.map(([sprite]) => sprite), this.#fuel);
    for (let i = 0; i < NUKE_ICONS; i++) {
      const icon = new Sprite(tex.nuke);
      icon.position.set(slotX(Slot.nuke + i), ICON_Y);
      this.hud.addChild(icon);
      this.#nukes.push(icon);
    }
    // Shield points, in the bottom right corner.
    this.#shieldBacking.width = PIPS_WIDTH + 2 * HUD_PAD;
    this.#shieldBacking.position.set(PLAYFIELD_WIDTH - 2 - this.#shieldBacking.width, BOTTOM_Y);
    for (let i = 0; i < SHIELD_MAX; i++) {
      const pip = new Sprite(Texture.WHITE);
      pip.tint = CYAN;
      pip.width = PIP_WIDTH;
      pip.height = SHIP_SPRITE_HEIGHT;
      pip.position.set(this.#shieldBacking.x + HUD_PAD + i * (PIP_WIDTH + PIP_GAP), BOTTOM_Y + 2);
      this.hud.addChild(pip);
      this.#pips.push(pip);
    }
    this.#scoreBacking.tint = BACKGROUND;
    this.#scoreBacking.alpha = 0.85;
    this.#scoreBacking.height = SHIP_SPRITE_HEIGHT + 4;
    this.#cheat.visible = false;
    this.hud.addChild(this.#scoreBacking, this.#multiplier, this.#score, this.#cheat);
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
    this.#lastHp = new Uint8Array(0);
    this.#scanFrom = 0;
    this.#seenHit = -1;
    this.#seenExtraLife = -1;
    this.#lifeLostSample = -1;
    this.#lifeLost.hide();
    this.#blastSample = -1;
    this.#seenBlast = -1;
    this.#blast.hide();
    this.#nukeSample = -1;
    this.#seenNuke = -1;
    this.#nukeFlash.visible = false;
    for (let m = 0; m < MISSILE_SLOTS; m++) {
      this.#missileBlastSample[m] = -1;
      this.#seenMissileBlast[m] = -1;
      this.#missileBlasts[m]!.hide();
    }
    this.#shownScore = -1;
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

    // Enemies. A hit that leaves hits to spare shows the enemy white for a moment.
    const hp = state.enemyHp;
    if (this.#lastHp.length !== hp.length) {
      this.#lastHp = hp.slice();
      this.#hitSample = new Float64Array(hp.length).fill(-Infinity);
    }
    for (let i = state.firstLive; i < state.nextSpawn; i++) {
      if (hp[i]! > 0 && hp[i]! < this.#lastHp[i]!) this.#hitSample[i] = displaySamples;
      this.#lastHp[i] = hp[i]!;
    }
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
          const since = displaySamples - this.#hitSample[i]!;
          sprite.texture = since >= 0 && since < HIT_FLASH_SAMPLES ? tex.tankHit : tex.tank;
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

    // Shots (straight, angled, or laser) and bullets.
    for (let s = 0; s < SHOT_SLOTS; s++) {
      const sprite = this.#shots[s]!;
      sprite.visible = state.shotActive[s] === 1;
      if (!sprite.visible) continue;
      if (state.shotVY[s] !== 0) {
        sprite.texture = tex.shotUp;
        sprite.scale.set(1);
        sprite.tint = WHITE;
      } else {
        sprite.texture = Texture.WHITE;
        sprite.width = state.shotLaser[s] === 1 ? LASER_WIDTH : SHOT_WIDTH;
        sprite.height = SHOT_HEIGHT;
        sprite.tint = state.shotLaser[s] === 1 ? WHITE : CYAN;
      }
      placeCentred(sprite, state.shotX[s]! / Q8, state.shotY[s]! / Q8);
    }
    for (let b = 0; b < BULLET_SLOTS; b++) {
      const sprite = this.#bullets[b]!;
      sprite.visible = state.bulletActive[b] === 1;
      if (!sprite.visible) continue;
      sprite.texture = tex.bullets[state.bulletKind[b]!]!;
      placeCentred(sprite, state.bulletX[b]! / Q8, state.bulletY[b]! / Q8);
    }

    // Missiles and their blasts, drones, capsules, and the shield.
    for (let m = 0; m < MISSILE_SLOTS; m++) {
      const sprite = this.#missiles[m]!;
      sprite.visible = state.missileActive[m] === 1;
      if (sprite.visible) placeCentred(sprite, state.missileX[m]! / Q8, state.missileY[m]! / Q8);
      const blastTick = state.missileBlastTick[m]!;
      if (blastTick !== this.#seenMissileBlast[m] && blastTick > 0) {
        this.#missileBlasts[m]!.start(state.missileBlastX[m]! / Q8, state.missileBlastY[m]! / Q8, seededRandom(blastTick * 3 + m));
        this.#missileBlastSample[m] = blastTick * SAMPLES_PER_TICK;
      }
      this.#seenMissileBlast[m] = blastTick;
      if (this.#missileBlastSample[m]! >= 0) {
        this.#missileBlasts[m]!.draw(Math.max(0, samplesToMs(displaySamples - this.#missileBlastSample[m]!)));
      }
    }
    for (let k = 0; k < MAX_DRONES; k++) {
      const sprite = this.#drones[k]!;
      sprite.visible = k < state.drones && !state.dead;
      if (sprite.visible) placeCentred(sprite, state.droneX[k]! / Q8, state.droneY[k]! / Q8);
    }
    for (let c = 0; c < CAPSULE_SLOTS; c++) {
      const sprite = this.#capsules[c]!;
      sprite.visible = state.capsuleActive[c] === 1;
      if (sprite.visible) {
        // Every capsule shows what the next one picked up unlocks.
        const next = nextUnlock(state);
        sprite.texture = next < 0 ? tex.capsule : tex.capsules[next]!;
        placeCentred(sprite, state.capsuleX[c]! / Q8, state.capsuleY[c]! / Q8);
      }
    }
    const shipVisible = state.tick >= state.safeUntil || Math.floor(state.tick / BLINK_TICKS) % 2 === 0;
    const points = state.shield < SHIELD_MAX ? state.shield : SHIELD_MAX;
    const sinceHit = state.shieldHitTick < 0 ? SHIELD_FLICKER_TICKS : state.tick - state.shieldHitTick;
    const flicker = sinceHit < SHIELD_FLICKER_TICKS;
    // Flickering, it shows even with no points left, so the hit that emptied it reads.
    const shieldOn = flicker ? Math.floor(sinceHit / SHIELD_FLICKER_STEP) % 2 === 0 : points > 0;
    this.#shield.visible = shieldOn && shipVisible && !state.dead;
    if (this.#shield.visible) {
      this.#shield.alpha = flicker ? 1 : SHIELD_ALPHA[points]!;
      this.#shield.texture = flicker ? tex.shieldFlash : tex.shield;
      placeCentred(this.#shield, state.shipX / Q8, state.shipY / Q8);
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
    if (state.nukeTick !== this.#seenNuke && state.nukeTick > 0) {
      const at = state.nukeTick * SAMPLES_PER_TICK;
      this.#nukeSample = this.#flashes.admit(samplesToMs(at)) ? at : -1;
    }
    this.#seenNuke = state.nukeTick;
    const nukeAlpha = this.#nukeSample < 0 ? 0 : flashAlpha(samplesToMs(displaySamples - this.#nukeSample), this.#flashes.peak);
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
    // An extra life: "1UP" in lime, rising from the ship.
    if (state.extraLifeTick !== this.#seenExtraLife && state.extraLifeTick > 0) {
      const p = this.#nextPopup;
      this.#nextPopup = (p + 1) % POPUPS;
      this.#popups[p]!.text = '1UP';
      this.#popups[p]!.color = LIME;
      this.#popupX[p] = state.shipX / Q8;
      this.#popupY[p] = state.shipY / Q8 - 12;
      this.#popupSample[p] = state.extraLifeTick * SAMPLES_PER_TICK;
    }
    this.#seenExtraLife = state.extraLifeTick;
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

    // Lives, in the bottom left corner.
    const lives = state.lives < MAX_LIFE_ICONS ? state.lives : MAX_LIFE_ICONS;
    for (let i = 0; i < MAX_LIFE_ICONS; i++) this.#lives[i]!.visible = i < lives;
    this.#livesBacking.visible = lives > 0;
    this.#livesBacking.width = lives * (SHIP_SPRITE_WIDTH + LIFE_ICON_GAP) + LIFE_ICON_GAP;

    // The arsenal. The bomb: bright when one can drop, filling from the bottom while one
    // falls or reloads.
    // The sim drops a bomb on tick state.tick + 1 if that is at least bombReadyTick.
    const reloadLeft = state.bombReadyTick - (state.tick + 1);
    const bombRows = state.bombActive
      ? 0
      : reloadLeft <= 0
        ? ICON_ROWS
        : Math.floor(((BOMB_RELOAD_TICKS - reloadLeft) * ICON_ROWS) / BOMB_RELOAD_TICKS);
    this.#bombFill.texture = tex.bombFill[bombRows]!;
    this.#bombFill.position.set(slotX(Slot.bomb), ICON_Y + ICON_ROWS - bombRows);
    // The missile the same way once unlocked; faint until then, like every power-up.
    this.#missileIcon.alpha = state.missile ? BOMB_ICON_DIM : NOT_HELD_ALPHA;
    this.#missileFill.visible = state.missile;
    if (state.missile) {
      const left = state.missileReadyTick - (state.tick + 1);
      const rows = state.missileActive[0]
        ? 0
        : left <= 0
          ? ICON_ROWS
          : Math.floor(((MISSILE_RELOAD_TICKS - left) * ICON_ROWS) / MISSILE_RELOAD_TICKS);
      this.#missileFill.texture = tex.missileFill[rows]!;
      this.#missileFill.position.set(slotX(Slot.missile), ICON_Y + ICON_ROWS - rows);
    }
    this.#doubleIcon.alpha = state.double ? 1 : NOT_HELD_ALPHA;
    this.#laserIcon.alpha = state.laser ? 1 : NOT_HELD_ALPHA;
    for (let i = 0; i < MAX_DRONES; i++) this.#droneIcons[i]!.alpha = i < state.drones ? 1 : NOT_HELD_ALPHA;
    this.#boostIcon.alpha = state.boostLevel > 0 ? 1 : NOT_HELD_ALPHA;
    this.#fuel.visible = state.boostLevel > 0;
    this.#fuel.width = Math.max(1, Math.floor((ICON_SIZE * state.boostFuel) / (BOOST_MAX_LEVEL * BOOST_FUEL_PER_LEVEL)));
    for (let i = 0; i < NUKE_ICONS; i++) this.#nukes[i]!.alpha = i < state.nukes ? 1 : NOT_HELD_ALPHA;

    // Shield points, in the bottom right corner.
    for (let i = 0; i < SHIELD_MAX; i++) this.#pips[i]!.alpha = i < points ? 1 : PIP_DIM_ALPHA;

    // The score in the top right corner, with the streak multiplier left of it.
    const multiplier = scoreMultiplier(state.streak);
    if (state.score !== this.#shownScore || multiplier !== this.#shownMultiplier) {
      this.#shownScore = state.score;
      this.#shownMultiplier = multiplier;
      this.#score.text = String(state.score).padStart(SCORE_DIGITS, '0');
      const right = PLAYFIELD_WIDTH - 4;
      const y = 4 + Math.floor((SHIP_SPRITE_HEIGHT - 7) / 2);
      this.#score.place(right, y, 'right');
      let left = right - this.#score.textWidth;
      this.#multiplier.visible = multiplier > 1;
      if (multiplier > 1) {
        this.#multiplier.text = `x${multiplier}`;
        this.#multiplier.place(left - 2 * HUD_PAD, y, 'right');
        left = this.#multiplier.x;
      }
      this.#scoreBacking.width = right - left + 2 * HUD_PAD + 1;
      this.#scoreBacking.position.set(left - HUD_PAD, 2);
      this.#cheat.place(this.#scoreBacking.x - 4, this.#score.y, 'right');
    }
    this.#cheat.visible = state.cheats !== 0;

    this.#seenTick = state.tick;
    this.#scanFrom = state.firstLive;
    this.#shipX = state.shipX / Q8;
    this.#shipY = state.shipY / Q8;
    return shipVisible;
  }
}
