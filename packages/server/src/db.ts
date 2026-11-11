// The leaderboard database, SQLite through node:sqlite (docs/PLAN.md, "Server"). Players,
// songs and checked runs live here; replay files live beside it in data/replays, named by
// their SHA-256. A board lists each player's best run, so a player holds one place on it.
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
  nickname: string;
  link: string | null;
}

export interface NewRun {
  player: number;
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
  link: string | null;
  score: number;
  levels: number;
  finished: boolean;
  replays: string[];
  /** Milliseconds since 1970, UTC. */
  at: number;
  /**
   * The first 32 bits of the SHA-256 of the player's public key: the same number for a
   * player everywhere, for the game to pick the row's colour from, without sending the key.
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
  nickname TEXT NOT NULL,
  nickname_key TEXT NOT NULL UNIQUE,
  link TEXT,
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
    this.#db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.#db.exec(SCHEMA);
  }

  close(): void {
    this.#db.close();
  }

  playerByKey(key: string): Player | null {
    const row = this.#db.prepare('SELECT id, key, nickname, link FROM players WHERE key = ?').get(key);
    return row ? (row as unknown as Player) : null;
  }

  /**
   * Creates the player or changes their nickname and link. Returns null when another
   * player has the nickname (compared without case).
   */
  setPlayer(key: string, nickname: string, link: string | null, now: number): Player | null {
    const nicknameKey = nickname.toLowerCase();
    const owner = this.#db.prepare('SELECT key FROM players WHERE nickname_key = ?').get(nicknameKey) as
      | { key: string }
      | undefined;
    if (owner && owner.key !== key) return null;
    this.#db
      .prepare(
        `INSERT INTO players (key, nickname, nickname_key, link, created) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET nickname = excluded.nickname,
           nickname_key = excluded.nickname_key, link = excluded.link`,
      )
      .run(key, nickname, nicknameKey, link, now);
    return this.playerByKey(key);
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
    const count = this.#db.prepare('SELECT COUNT(DISTINCT player) AS n FROM runs WHERE board = ?').get(hash) as {
      n: number;
    };
    return { hash: row.hash, title: row.title, author: row.author, bundled: row.bundled === 1, players: count.n };
  }

  /** Adds a checked run; returns its id, or the existing run's id when it was sent before. */
  addRun(run: NewRun, now: number): number {
    const replays = run.replays.join(',');
    const board = boardKey(run.board);
    this.#db
      .prepare(
        `INSERT INTO runs (player, board, difficulty, gen, sim, score, levels, finished, replays, created)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      )
      .run(run.player, board, run.board.difficulty, run.gen, run.sim, run.score, run.levels, run.finished ? 1 : 0, replays, now);
    const row = this.#db
      .prepare('SELECT id FROM runs WHERE player = ? AND board = ? AND difficulty = ? AND replays = ?')
      .get(run.player, board, run.board.difficulty, replays) as { id: number };
    return row.id;
  }

  /** The top `limit` players' best runs on a board, and the caller's place when given. */
  board(
    board: Board,
    gen: number,
    sim: number,
    limit: number,
    playerId: number | null,
  ): { top: BoardEntry[]; you: BoardEntry | null; players: number } {
    // Each player's best run: highest score, then the earliest.
    const best = `
      WITH best AS (
        SELECT r.*, ROW_NUMBER() OVER (PARTITION BY r.player ORDER BY r.score DESC, r.created ASC, r.id ASC) AS n
        FROM runs r WHERE r.board = ? AND r.difficulty = ? AND r.gen = ? AND r.sim = ?
      ),
      ranked AS (
        SELECT b.*, ROW_NUMBER() OVER (ORDER BY b.score DESC, b.created ASC, b.id ASC) AS rank
        FROM best b WHERE b.n = 1
      )
      SELECT ranked.rank, ranked.id AS runId, p.nickname, p.link, ranked.score, ranked.levels,
        ranked.finished, ranked.replays, ranked.created AS at, ranked.player, p.key
      FROM ranked JOIN players p ON p.id = ranked.player`;
    const args = [boardKey(board), board.difficulty, gen, sim] as const;
    const toEntry = (row: Record<string, unknown>): BoardEntry => ({
      rank: Number(row['rank']),
      runId: Number(row['runId']),
      nickname: String(row['nickname']),
      link: (row['link'] as string | null) ?? null,
      score: Number(row['score']),
      levels: Number(row['levels']),
      finished: row['finished'] === 1,
      replays: String(row['replays']).split(','),
      at: Number(row['at']),
      mark: playerMark(String(row['key'])),
    });
    const top = this.#db.prepare(`${best} ORDER BY ranked.rank LIMIT ?`).all(...args, limit).map(toEntry);
    const mine =
      playerId === null ? undefined : this.#db.prepare(`${best} WHERE ranked.player = ?`).get(...args, playerId);
    const count = this.#db
      .prepare(
        'SELECT COUNT(DISTINCT player) AS n FROM runs WHERE board = ? AND difficulty = ? AND gen = ? AND sim = ?',
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
