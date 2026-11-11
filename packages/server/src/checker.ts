// Checks submitted runs by running them again (docs/PLAN.md, "Server"). A song's level is
// built once per song, difficulty and GEN_VERSION: the LevelData from the song file is
// written to the cache folder, and the Level is kept in memory for the next check, so a
// check after the first re-runs only the sim. Runs in the check worker (check-worker.ts),
// off the request thread.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  Difficulty,
  GEN_VERSION,
  SIM_VERSION,
  createSimState,
  decodeReplay,
  deserializeLevelData,
  generateLevel,
  runInputLog,
  serializeLevelData,
  type DifficultyName,
  type Level,
  type LevelData,
  type Replay,
} from '@game/core';
import { analyze, loadOpenMpt, type OpenMpt } from '@game/analysis';

/** Why a run was turned down, in words a player can be shown. */
export type Rejection =
  | 'bad replay'
  | 'old version'
  | 'cheat'
  | 'score mismatch'
  | 'not ended'
  | 'wrong songs'
  | 'mixed difficulty'
  | 'level not cleared'
  | 'song unreadable';

export type LevelResult = { score: number; ticks: number; finished: boolean };

export type CheckResult =
  | { ok: true; difficulty: DifficultyName; levels: LevelResult[]; total: number; title: string; artist: string }
  | { ok: false; reason: Rejection; level: number };

export interface CheckJob {
  /** 'song' is one replay; 'arcade' is the run's level replays in order. */
  kind: 'song' | 'arcade';
  replays: Uint8Array[];
  /** The arcade's songs for each difficulty, by hash, from music/arcade.json. */
  arcade?: { levels: string[]; impossible: string[] };
}

/** Reads a song's bytes by its hash, or null when the server doesn't have it. */
export type SongReader = (hash: string) => Promise<Uint8Array | null>;

export interface CheckerOptions {
  readSong: SongReader;
  /** Folder for the LevelData cache. */
  cacheDir: string;
  /** Levels kept in memory, most recently used first. */
  memoryLevels?: number;
}

export class Checker {
  readonly #readSong: SongReader;
  readonly #cacheDir: string;
  readonly #memoryLevels: number;
  readonly #levels = new Map<string, { level: Level; data: LevelData }>();
  #openmpt: Promise<OpenMpt> | null = null;

  constructor(options: CheckerOptions) {
    this.#readSong = options.readSong;
    this.#cacheDir = options.cacheDir;
    this.#memoryLevels = options.memoryLevels ?? 32;
  }

  async check(job: CheckJob): Promise<CheckResult> {
    const replays: Replay[] = [];
    for (let i = 0; i < job.replays.length; i++) {
      try {
        replays.push(decodeReplay(job.replays[i]!));
      } catch {
        return { ok: false, reason: 'bad replay', level: i };
      }
    }
    if (replays.length === 0) return { ok: false, reason: 'bad replay', level: 0 };
    if (job.kind === 'song' && replays.length !== 1) return { ok: false, reason: 'bad replay', level: 1 };
    const difficulty = replays[0]!.difficulty;

    if (job.kind === 'arcade') {
      const order = difficulty === 'impossible' ? job.arcade?.impossible : job.arcade?.levels;
      if (!order || replays.length > order.length) return { ok: false, reason: 'wrong songs', level: 0 };
      for (let i = 0; i < replays.length; i++) {
        if (replays[i]!.difficulty !== difficulty) return { ok: false, reason: 'mixed difficulty', level: i };
        if (replays[i]!.moduleHash !== order[i]) return { ok: false, reason: 'wrong songs', level: i };
      }
    }

    const levels: LevelResult[] = [];
    let total = 0;
    let meta = { title: '', artist: '' };
    for (let i = 0; i < replays.length; i++) {
      const replay = replays[i]!;
      if (replay.genVersion !== GEN_VERSION || replay.simVersion !== SIM_VERSION) {
        return { ok: false, reason: 'old version', level: i };
      }
      if (replay.cheats !== 0) return { ok: false, reason: 'cheat', level: i };
      const built = await this.#level(replay.moduleHash, replay.difficulty);
      if (!built) return { ok: false, reason: 'song unreadable', level: i };
      if (i === 0) meta = { title: built.data.meta.title, artist: built.data.meta.artist };
      const state = runInputLog(built.level, replay.inputs, createSimState(replay.cheats));
      if (!state.dead && !state.finished) return { ok: false, reason: 'not ended', level: i };
      if (state.score !== replay.score) return { ok: false, reason: 'score mismatch', level: i };
      // Every arcade level but the last must have been cleared to reach the next.
      if (job.kind === 'arcade' && i < replays.length - 1 && !state.finished) {
        return { ok: false, reason: 'level not cleared', level: i };
      }
      levels.push({ score: state.score, ticks: replay.inputs.length, finished: state.finished });
      total += state.score;
    }
    return { ok: true, difficulty, levels, total, ...meta };
  }

  /** The song's level at a difficulty, built or cached; null when the song can't be read. */
  async #level(hash: string, difficulty: DifficultyName): Promise<{ level: Level; data: LevelData } | null> {
    const tempo = Difficulty[difficulty].tempoPermille;
    const key = `${hash}-${tempo}-${GEN_VERSION}`;
    const hit = this.#levels.get(key);
    if (hit) {
      this.#levels.delete(key);
      this.#levels.set(key, hit);
      return hit;
    }
    const file = join(this.#cacheDir, `${key}.level`);
    let data: LevelData | null = null;
    try {
      data = deserializeLevelData(new Uint8Array(await readFile(file)));
    } catch {
      data = null;
    }
    if (!data) {
      const bytes = await this.#readSong(hash);
      if (!bytes) return null;
      this.#openmpt ??= loadOpenMpt();
      try {
        data = analyze(await this.#openmpt, bytes, tempo);
      } catch {
        return null;
      }
      await mkdir(this.#cacheDir, { recursive: true });
      // Written whole, then renamed, so a crash never leaves half a file in the cache.
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, serializeLevelData(data));
      await rename(tmp, file);
    }
    const built = { level: generateLevel(data, difficulty), data };
    this.#levels.set(key, built);
    while (this.#levels.size > this.#memoryLevels) this.#levels.delete(this.#levels.keys().next().value!);
    return built;
  }
}
