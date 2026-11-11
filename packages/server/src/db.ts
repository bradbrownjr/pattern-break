// The leaderboard database, SQLite through node:sqlite (docs/PLAN.md, "Server"). Players,
// songs and checked runs live here; replay files live beside it in data/replays, named by
// their SHA-256. A player is a device key; each run carries the name it was posted under,
// so players taking turns on one device post under their own names. A board lists the best
// run of each key and name, so each holds one place on it.
//
// Boards are per (song, difficulty) and, for arcade runs, per difficulty. Only runs from
// the server's own GEN_VERSION and SIM_VERSION are listed: a version bump starts the
// boards over, and the old runs stay in the table.

import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export type Board = { kind: 'song'; song: string; difficulty: string } | { kind: 'arcade'; difficulty: string };

export interface Player {
  id: number;
  key: string;
}

export interface NewRun {
  player: number;
  /** The name it was posted under (packages/core/src/name.ts). */
  nickname: string;
  board: Board;
  gen: number;
  sim: number;
  score: number;
  /** Levels played: 1 for a song run, up to the arcade's length for an arcade run. */
  levels: number;
  finished: boolean;
  /** SHA-256 of each level's replay file, in order. */
  replays: string[];
}

export interface BoardEntry {
  rank: number;
  runId: number;
  nickname: string;
  score: number;
  levels: number;
  finished: boolean;
  replays: string[];
  /** Milliseconds since 1970, UTC. */
  at: number;
  /**
   * The first 32 bits of the SHA-256 of the player's public key: the same number for a
   * device everywhere, for the game to pick the row's colour from, without sending the key.
   * Two players with one name on different devices show in different colours.
   */
  mark: number;
}

/** A player's mark (BoardEntry.mark) from their public key. */
export function playerMark(key: string): number {
  return createHash('sha256').update(key).digest().readUInt32BE(0);
}

export interface SongRow {
  hash: string;
  title: string;
  author: string;
  bundled: boolean;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS songs (
  hash TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  bundled INTEGER NOT NULL,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY,
  player INTEGER NOT NULL REFERENCES players(id),
  nickname TEXT NOT NULL,
  board TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  gen INTEGER NOT NULL,
  sim INTEGER NOT NULL,
  score INTEGER NOT NULL,
  levels INTEGER NOT NULL,
  finished INTEGER NOT NULL,
  replays TEXT NOT NULL,
  created INTEGER NOT NULL,
  UNIQUE (player, board, difficulty, replays)
);
CREATE INDEX IF NOT EXISTS runs_board ON runs (board, difficulty, gen, sim, score DESC);
`;

/** The board column: the song's hash, or 'arcade'. */
function boardKey(board: Board): string {
  return board.kind === 'arcade' ? 'arcade' : board.song;
}

export class Database {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    this.#db = new DatabaseSync(path);
    // node:sqlite opens with foreign keys on; they stay off until the migration is done.
    this.#db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
    this.#db.exec(SCHEMA);
    this.#migrate();
    this.#db.exec('PRAGMA foreign_keys = ON;');
  }

  /**
   * Brings a database from before names moved to runs (2026-11-11) up to date: each run
   * takes its player's name, and the players table is rebuilt without the name and the
   * link. SQLite can't drop a UNIQUE column, so the table is copied, the way the SQLite
   * docs give for other schema changes (https://www.sqlite.org/lang_altertable.html, "Making
   * Other Kinds Of Table Schema Changes"), with foreign keys off until it's done.
   */
  #migrate(): void {
    const columns = (table: string) =>
      (this.#db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    const playerColumns = columns('players');
    const runColumns = columns('runs');
    if (!playerColumns.includes('nickname') && runColumns.includes('nickname')) return;
    this.#db.exec('BEGIN');
    try {
      if (!runColumns.includes('nickname')) {
        this.#db.exec("ALTER TABLE runs ADD COLUMN nickname TEXT NOT NULL DEFAULT ''");
      }
      if (playerColumns.includes('nickname')) {
        this.#db.exec(`
          UPDATE runs SET nickname = (SELECT p.nickname FROM players p WHERE p.id = runs.player);
          CREATE TABLE players_new (id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, created INTEGER NOT NULL);
          INSERT INTO players_new (id, key, created) SELECT id, key, created FROM players;
          DROP TABLE players;
          ALTER TABLE players_new RENAME TO players;`);
      }
      const broken = this.#db.prepare('PRAGMA foreign_key_check').all();
      if (broken.length > 0) throw new Error(`foreign key check failed: ${JSON.stringify(broken)}`);
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.#db.close();
  }

  playerByKey(key: string): Player | null {
    const row = this.#db.prepare('SELECT id, key FROM players WHERE key = ?').get(key);
    return row ? (row as unknown as Player) : null;
  }

  /** The player with this key, made on its first run. */
  ensurePlayer(key: string, now: number): Player {
    this.#db.prepare('INSERT INTO players (key, created) VALUES (?, ?) ON CONFLICT (key) DO NOTHING').run(key, now);
    return this.playerByKey(key)!;
  }

  /** Records a song the first time a run on it is accepted. */
  noteSong(song: SongRow, now: number): void {
    this.#db
      .prepare('INSERT INTO songs (hash, title, author, bundled, created) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING')
      .run(song.hash, song.title, song.author, song.bundled ? 1 : 0, now);
  }

  song(hash: string): (SongRow & { players: number }) | null {
    const row = this.#db.prepare('SELECT hash, title, author, bundled FROM songs WHERE hash = ?').get(hash) as
      | { hash: string; title: string; author: string; bundled: number }
      | undefined;
    if (!row) return null;
    const count = this.#db
      .prepare('SELECT COUNT(*) AS n FROM (SELECT DISTINCT player, nickname FROM runs WHERE board = ?)')
      .get(hash) as { n: number };
    return { hash: row.hash, title: row.title, author: row.author, bundled: row.bundled === 1, players: count.n };
  }

  /**
   * Adds a checked run; returns its id, or the existing run's id when it was sent before.
   * A replay sent again keeps the name it was first sent under.
   */
  addRun(run: NewRun, now: number): number {
    const replays = run.replays.join(',');
    const board = boardKey(run.board);
    this.#db
      .prepare(
        `INSERT INTO runs (player, nickname, board, difficulty, gen, sim, score, levels, finished, replays, created)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      )
      .run(run.player, run.nickname, board, run.board.difficulty, run.gen, run.sim, run.score, run.levels, run.finished ? 1 : 0, replays, now);
    const row = this.#db
      .prepare('SELECT id FROM runs WHERE player = ? AND board = ? AND difficulty = ? AND replays = ?')
      .get(run.player, board, run.board.difficulty, replays) as { id: number };
    return row.id;
  }

  /**
   * The top `limit` places on a board, and the caller's place when given: the best place of
   * the caller's key under `you.nickname`, or under any name when that is null.
   */
  board(
    board: Board,
    gen: number,
    sim: number,
    limit: number,
    you: { player: number; nickname: string | null } | null,
  ): { top: BoardEntry[]; you: BoardEntry | null; players: number } {
    // The best run of each key and name: highest score, then the earliest.
    const best = `
      WITH best AS (
        SELECT r.*, ROW_NUMBER() OVER (
          PARTITION BY r.player, r.nickname ORDER BY r.score DESC, r.created ASC, r.id ASC
        ) AS n
        FROM runs r WHERE r.board = ? AND r.difficulty = ? AND r.gen = ? AND r.sim = ?
      ),
      ranked AS (
        SELECT b.*, ROW_NUMBER() OVER (ORDER BY b.score DESC, b.created ASC, b.id ASC) AS rank
        FROM best b WHERE b.n = 1
      )
      SELECT ranked.rank, ranked.id AS runId, ranked.nickname, ranked.score, ranked.levels,
        ranked.finished, ranked.replays, ranked.created AS at, ranked.player, p.key
      FROM ranked JOIN players p ON p.id = ranked.player`;
    const args = [boardKey(board), board.difficulty, gen, sim] as const;
    const toEntry = (row: Record<string, unknown>): BoardEntry => ({
      rank: Number(row['rank']),
      runId: Number(row['runId']),
      nickname: String(row['nickname']),
      score: Number(row['score']),
      levels: Number(row['levels']),
      finished: row['finished'] === 1,
      replays: String(row['replays']).split(','),
      at: Number(row['at']),
      mark: playerMark(String(row['key'])),
    });
    const top = this.#db.prepare(`${best} ORDER BY ranked.rank LIMIT ?`).all(...args, limit).map(toEntry);
    const mine =
      you === null
        ? undefined
        : you.nickname === null
          ? this.#db.prepare(`${best} WHERE ranked.player = ? ORDER BY ranked.rank LIMIT 1`).get(...args, you.player)
          : this.#db
              .prepare(`${best} WHERE ranked.player = ? AND ranked.nickname = ?`)
              .get(...args, you.player, you.nickname);
    const count = this.#db
      .prepare(
        `SELECT COUNT(*) AS n FROM (SELECT DISTINCT player, nickname FROM runs
         WHERE board = ? AND difficulty = ? AND gen = ? AND sim = ?)`,
      )
      .get(...args) as { n: number };
    return { top, you: mine ? toEntry(mine) : null, players: count.n };
  }

  /** Whether any stored run uses this replay file. */
  hasReplay(sha: string): boolean {
    return (
      this.#db.prepare("SELECT 1 FROM runs WHERE ',' || replays || ',' LIKE ? LIMIT 1").get(`%,${sha},%`) !==
      undefined
    );
  }
}
