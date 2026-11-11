// The database (db.ts): a board's places are per key and name, and a database from before
// names moved to runs is brought up to date with its runs and names kept.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Database, playerMark, type NewRun } from '../src/db.ts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pb-db-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const SONG = 'a'.repeat(64);

function run(player: number, nickname: string, score: number, replay: string): NewRun {
  return {
    player,
    nickname,
    board: { kind: 'song', song: SONG, difficulty: 'normal' },
    gen: 1,
    sim: 1,
    score,
    levels: 1,
    finished: true,
    replays: [replay],
  };
}

describe('boards', () => {
  it('give each name on a key its own place, best run first', () => {
    const db = new Database(join(dir, 'pb.sqlite'));
    const amy = db.ensurePlayer('key-amy', 0);
    const other = db.ensurePlayer('key-other', 0);
    expect(db.ensurePlayer('key-amy', 5).id).toBe(amy.id);
    db.addRun(run(amy.id, 'AMY', 100, 'r1'), 1);
    db.addRun(run(amy.id, 'AMY', 300, 'r2'), 2);
    db.addRun(run(amy.id, 'JORDAN', 200, 'r3'), 3);
    db.addRun(run(other.id, 'AMY', 250, 'r4'), 4);
    const board = db.board({ kind: 'song', song: SONG, difficulty: 'normal' }, 1, 1, 10, { player: amy.id, nickname: 'JORDAN' });
    expect(board.top.map((e) => [e.nickname, e.score])).toEqual([
      ['AMY', 300],
      ['AMY', 250],
      ['JORDAN', 200],
    ]);
    expect(board.top.map((e) => e.mark)).toEqual([playerMark('key-amy'), playerMark('key-other'), playerMark('key-amy')]);
    expect(board.you).toMatchObject({ rank: 3, nickname: 'JORDAN' });
    expect(board.players).toBe(3);
    const anyName = db.board({ kind: 'song', song: SONG, difficulty: 'normal' }, 1, 1, 10, { player: amy.id, nickname: null });
    expect(anyName.you).toMatchObject({ rank: 1, nickname: 'AMY' });
    expect(db.song(SONG)).toBeNull();
    db.close();
  });
});

describe('an old database', () => {
  it('moves each player name onto their runs and drops the name and link', () => {
    const path = join(dir, 'old.sqlite');
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE players (id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL,
        nickname_key TEXT NOT NULL UNIQUE, link TEXT, created INTEGER NOT NULL);
      CREATE TABLE songs (hash TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL,
        bundled INTEGER NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE runs (id INTEGER PRIMARY KEY, player INTEGER NOT NULL REFERENCES players(id),
        board TEXT NOT NULL, difficulty TEXT NOT NULL, gen INTEGER NOT NULL, sim INTEGER NOT NULL,
        score INTEGER NOT NULL, levels INTEGER NOT NULL, finished INTEGER NOT NULL, replays TEXT NOT NULL,
        created INTEGER NOT NULL, UNIQUE (player, board, difficulty, replays));
      INSERT INTO players VALUES (1, 'key-kc1', 'KC1JMH', 'kc1jmh', 'https://example.org/', 0);
      INSERT INTO players VALUES (2, 'key-ace', 'Ace', 'ace', NULL, 0);
      INSERT INTO runs VALUES (1, 1, '${SONG}', 'normal', 1, 1, 500, 1, 1, 'r1', 1);
      INSERT INTO runs VALUES (2, 2, '${SONG}', 'normal', 1, 1, 400, 1, 1, 'r2', 2);`);
    old.close();

    const db = new Database(path);
    const board = db.board({ kind: 'song', song: SONG, difficulty: 'normal' }, 1, 1, 10, null);
    expect(board.top.map((e) => [e.nickname, e.score, e.mark])).toEqual([
      ['KC1JMH', 500, playerMark('key-kc1')],
      ['Ace', 400, playerMark('key-ace')],
    ]);
    expect(db.playerByKey('key-kc1')).toEqual({ id: 1, key: 'key-kc1' });
    db.close();

    const check = new DatabaseSync(path);
    const columns = (check.prepare('PRAGMA table_info(players)').all() as { name: string }[]).map((c) => c.name);
    expect(columns).toEqual(['id', 'key', 'created']);
    check.close();
    // Opening it again changes nothing.
    const again = new Database(path);
    expect(again.board({ kind: 'song', song: SONG, difficulty: 'normal' }, 1, 1, 10, null).top).toHaveLength(2);
    again.close();
  });
});
