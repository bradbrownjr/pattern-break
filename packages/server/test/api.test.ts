// M5's acceptance check (docs/ROADMAP.md): a legitimate run appears on the board and a
// tampered one is rejected. The server runs for real, with the check worker, on the test
// song (an imported song to the server, so it goes through the upload) and on the arcade's
// first level.

import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Difficulty,
  GEN_VERSION,
  SIM_VERSION,
  autopilotInputs,
  createSimState,
  encodeReplay,
  generateLevel,
  runInputLog,
  withoutEnemies,
  type DifficultyName,
  type Replay,
} from '@game/core';
import { analyze, loadOpenMpt } from '@game/analysis';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { CheckQueue } from '../src/check-queue.ts';
import { signedMessage } from '../src/signature.ts';
import { openSongStore, type SongStore } from '../src/song-store.ts';

const MUSIC = fileURLToPath(new URL('../../../music', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../../analysis/fixtures/pb-fixture-01.mod', import.meta.url));

let dir: string;
let app: FastifyInstance;
let checks: CheckQueue;
let store: SongStore;
let clock = Date.now();

const fixtureBytes = new Uint8Array(readFileSync(FIXTURE));
const fixtureHash = createHash('sha256').update(fixtureBytes).digest('hex');

interface Player {
  key: string;
  privateKey: KeyObject;
}

function newPlayer(): Player {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { key: String(publicKey.export({ format: 'jwk' }).x), privateKey };
}

function signedHeaders(player: Player, method: string, url: string, body: Uint8Array, at = clock): Record<string, string> {
  const signature = sign(null, signedMessage(method, url, String(at), body), player.privateKey);
  return { 'x-pb-key': player.key, 'x-pb-at': String(at), 'x-pb-signature': signature.toString('base64url') };
}

async function send(player: Player, method: 'PUT' | 'POST', url: string, body: unknown) {
  const bytes = body instanceof Uint8Array ? body : Buffer.from(JSON.stringify(body));
  const type = body instanceof Uint8Array ? 'application/octet-stream' : 'application/json';
  return app.inject({
    method,
    url,
    payload: Buffer.from(bytes),
    headers: { 'content-type': type, ...signedHeaders(player, method, url, bytes) },
  });
}

/** An autopilot run on a song: real inputs, the score they make. */
async function autopilotReplay(bytes: Uint8Array, hash: string, difficulty: DifficultyName): Promise<Replay> {
  const level = generateLevel(analyze(await loadOpenMpt(), bytes, Difficulty[difficulty].tempoPermille), difficulty);
  const inputs = autopilotInputs(withoutEnemies(level));
  const state = runInputLog(level, inputs, createSimState());
  return { moduleHash: hash, difficulty, cheats: 0, genVersion: GEN_VERSION, simVersion: SIM_VERSION, score: state.score, inputs };
}

const b64 = (replay: Replay): string => Buffer.from(encodeReplay(replay)).toString('base64');

let alice: Player;
let fixtureRun: Replay;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pb-api-'));
  store = openSongStore(MUSIC, dir);
  checks = new CheckQueue({ store, cacheDir: join(dir, 'levels') });
  ({ app } = await buildApp({ store, dataDir: dir, checks, now: () => clock, rateLimits: false }));
  alice = newPlayer();
  fixtureRun = await autopilotReplay(fixtureBytes, fixtureHash, 'normal');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await checks?.close();
  await rm(dir, { recursive: true, force: true });
});

describe('players', () => {
  it('needs a signature', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/players/me', payload: { nickname: 'ALICE' } });
    expect(res.statusCode).toBe(401);
  });

  it('turns down a signature for another path or an old time', async () => {
    const body = Buffer.from(JSON.stringify({ nickname: 'ALICE' }));
    const wrongPath = signedHeaders(alice, 'PUT', '/api/songs/x', body);
    const stale = signedHeaders(alice, 'PUT', '/api/players/me', body, clock - 11 * 60 * 1000);
    for (const headers of [wrongPath, stale]) {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/players/me',
        payload: body,
        headers: { 'content-type': 'application/json', ...headers },
      });
      expect(res.statusCode).toBe(401);
    }
  });

  it('checks the nickname and link', async () => {
    expect((await send(alice, 'PUT', '/api/players/me', { nickname: '' })).statusCode).toBe(422);
    expect((await send(alice, 'PUT', '/api/players/me', { nickname: 'thirteen char' })).statusCode).toBe(422);
    expect((await send(alice, 'PUT', '/api/players/me', { nickname: 'ALICE', link: 'javascript:1' })).statusCode).toBe(422);
  });

  it('keeps a nickname to one player', async () => {
    const res = await send(alice, 'PUT', '/api/players/me', { nickname: 'ALICE', link: 'https://modarchive.org/' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ nickname: 'ALICE', link: 'https://modarchive.org/' });
    expect((await send(newPlayer(), 'PUT', '/api/players/me', { nickname: 'alice' })).statusCode).toBe(409);
  });

  it('turns down runs from a key with no nickname', async () => {
    const res = await send(newPlayer(), 'POST', '/api/runs', { kind: 'song', replays: [b64(fixtureRun)] });
    expect(res.statusCode).toBe(403);
  });
});

describe('a song run', () => {
  it('asks for a song the server lacks, and takes it only under its own hash', async () => {
    const first = await send(alice, 'POST', '/api/runs', { kind: 'song', replays: [b64(fixtureRun)] });
    expect(first.json()).toEqual({ status: 'needModule', hashes: [fixtureHash] });
    const wrong = await send(alice, 'PUT', `/api/songs/${'0'.repeat(64)}`, fixtureBytes);
    expect(wrong.statusCode).toBe(422);
    expect(wrong.json()).toEqual({ error: 'hash mismatch' });
    expect((await send(alice, 'PUT', `/api/songs/${fixtureHash}`, fixtureBytes)).statusCode).toBe(201);
  });

  it('accepts a real run and lists it on the board', async () => {
    const res = await send(alice, 'POST', '/api/runs', { kind: 'song', replays: [b64(fixtureRun)] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'accepted', score: fixtureRun.score, rank: 1, players: 1 });
    const board = await app.inject({ url: `/api/leaderboards/${fixtureHash}?difficulty=normal` });
    expect(board.json().top).toEqual([
      expect.objectContaining({ rank: 1, nickname: 'ALICE', score: fixtureRun.score, link: 'https://modarchive.org/' }),
    ]);
    expect(fixtureRun.score).toBeGreaterThan(0);
  }, 60_000);

  it('rejects a raised score', async () => {
    const res = await send(alice, 'POST', '/api/runs', {
      kind: 'song',
      replays: [b64({ ...fixtureRun, score: fixtureRun.score + 100 })],
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ status: 'rejected', reason: 'score mismatch', level: 0 });
  });

  it('rejects edited inputs that keep the score', async () => {
    const inputs = new Uint16Array(fixtureRun.inputs.length);
    const res = await send(alice, 'POST', '/api/runs', { kind: 'song', replays: [b64({ ...fixtureRun, inputs })] });
    expect(res.json()).toMatchObject({ status: 'rejected', reason: 'score mismatch' });
  });

  it('rejects a cheat or another version', async () => {
    const cheat = await send(alice, 'POST', '/api/runs', { kind: 'song', replays: [b64({ ...fixtureRun, cheats: 1 })] });
    expect(cheat.json()).toMatchObject({ status: 'rejected', reason: 'cheat' });
    const old = await send(alice, 'POST', '/api/runs', {
      kind: 'song',
      replays: [b64({ ...fixtureRun, simVersion: SIM_VERSION - 1 })],
    });
    expect(old.json()).toMatchObject({ status: 'rejected', reason: 'old version' });
  });

  it('keeps a run sent twice once, and serves its replay', async () => {
    const again = await send(alice, 'POST', '/api/runs', { kind: 'song', replays: [b64(fixtureRun)] });
    const board = (await app.inject({ url: `/api/leaderboards/${fixtureHash}?difficulty=normal` })).json();
    expect(again.json().runId).toBe(board.top[0].runId);
    expect(board.players).toBe(1);
    const replay = await app.inject({ url: `/api/replays/${board.top[0].replays[0]}` });
    expect(new Uint8Array(replay.rawPayload)).toEqual(encodeReplay(fixtureRun));
  });

  it("gives the caller's place", async () => {
    const board = await app.inject({
      url: `/api/leaderboards/${fixtureHash}?difficulty=normal`,
      headers: { 'x-pb-key': alice.key },
    });
    expect(board.json().you).toMatchObject({ rank: 1, nickname: 'ALICE' });
  });
});

describe('an arcade run', () => {
  let level1: Replay;

  beforeAll(async () => {
    const hash = store.arcade.levels[0]!;
    level1 = await autopilotReplay(new Uint8Array(readFileSync(join(MUSIC, store.bundled[hash]!.file))), hash, 'normal');
  }, 60_000);

  it('rejects levels out of the arcade order', async () => {
    const res = await send(alice, 'POST', '/api/runs', {
      kind: 'arcade',
      replays: [b64({ ...level1, moduleHash: store.arcade.levels[1]! })],
    });
    expect(res.json()).toMatchObject({ status: 'rejected', reason: 'wrong songs', level: 0 });
  });

  it('accepts a run that ends in a game over, on the arcade board and the song board', async () => {
    const res = await send(alice, 'POST', '/api/runs', { kind: 'arcade', replays: [b64(level1)] });
    expect(res.json()).toMatchObject({ status: 'accepted', score: level1.score, rank: 1 });
    const arcade = (await app.inject({ url: '/api/leaderboards/arcade?difficulty=normal' })).json();
    expect(arcade.top).toEqual([expect.objectContaining({ nickname: 'ALICE', score: level1.score, levels: 1 })]);
    const song = (await app.inject({ url: `/api/leaderboards/${level1.moduleHash}?difficulty=normal` })).json();
    expect(song.top).toEqual([expect.objectContaining({ nickname: 'ALICE', score: level1.score })]);
    const info = (await app.inject({ url: `/api/songs/${level1.moduleHash}` })).json();
    expect(info).toMatchObject({ title: 'Neon Techno', bundled: true, players: 1 });
  }, 60_000);
});

describe('requests', () => {
  it('answers unknown API paths and bad boards plainly', async () => {
    expect((await app.inject({ url: '/api/nope' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/leaderboards/arcade?difficulty=silly' })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/leaderboards/xyz?difficulty=normal' })).statusCode).toBe(400);
  });
});
