// The leaderboard client against the real server (packages/server), in Node: Node's Web
// Crypto signs with Ed25519 like the browsers' does, and fetch goes to Fastify's inject, so
// the signatures, the song upload and the queue are checked end to end.

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
  generateLevel,
  runInputLog,
  withoutEnemies,
  encodeReplay,
  type Replay,
} from '@game/core';
import { analyze, loadOpenMpt, sha256Hex } from '@game/analysis';
import { CheckQueue, buildApp, openSongStore } from '@game/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PendingRun, StoredIdentity } from '../src/game/library.ts';
import { Leaderboards, outcomeLine, type NetStore } from '../src/game/net.ts';

const MUSIC = fileURLToPath(new URL('../../../music', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../../analysis/fixtures/pb-fixture-01.mod', import.meta.url));

class MemoryStore implements NetStore {
  key: StoredIdentity | null = null;
  runs = new Map<number, PendingRun>();
  #next = 1;
  async identity() {
    return this.key;
  }
  async putIdentity(identity: StoredIdentity) {
    this.key = identity;
  }
  async pendingRuns() {
    return [...this.runs.values()];
  }
  async addPending(run: PendingRun) {
    const id = this.#next++;
    this.runs.set(id, { ...run, id });
    return id;
  }
  async deletePending(id: number) {
    this.runs.delete(id);
  }
}

let dir: string;
let app: Awaited<ReturnType<typeof buildApp>>['app'];
let checks: CheckQueue;
let online = true;
const bytes = new Uint8Array(readFileSync(FIXTURE));
let hash: string;
let run: Replay;

/** fetch, answered by the server in this process; it throws while `online` is false. */
async function serverFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!online) throw new TypeError('Failed to fetch');
  const res = await app.inject({
    method: (init?.method ?? 'GET') as 'GET',
    url: input,
    headers: init?.headers as Record<string, string>,
    ...(init?.body ? { payload: Buffer.from(init.body as Uint8Array) } : {}),
  });
  return new Response(res.statusCode === 204 ? null : new Uint8Array(res.rawPayload), {
    status: res.statusCode,
    headers: res.headers as Record<string, string>,
  });
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pb-net-'));
  const store = openSongStore(MUSIC, dir);
  checks = new CheckQueue({ store, cacheDir: join(dir, 'levels') });
  ({ app } = await buildApp({ store, dataDir: dir, checks, rateLimits: false }));
  hash = (await sha256Hex(bytes))!;
  const level = generateLevel(analyze(await loadOpenMpt(), bytes, Difficulty.normal.tempoPermille), 'normal');
  const inputs = autopilotInputs(withoutEnemies(level));
  const score = runInputLog(level, inputs, createSimState()).score;
  run = { moduleHash: hash, difficulty: 'normal', cheats: 0, cut: false, genVersion: GEN_VERSION, simVersion: SIM_VERSION, score, inputs };
}, 60_000);

afterAll(async () => {
  await app?.close();
  await checks?.close();
  await rm(dir, { recursive: true, force: true });
});

describe('Leaderboards', () => {
  const store = new MemoryStore();
  const boards = new Leaderboards(store, async (h) => (h === hash ? bytes : null), { fetch: serverFetch });

  it('makes one device key and keeps it', async () => {
    const client = await boards.client();
    expect(client).not.toBeNull();
    expect(boards.available).toBe(true);
    expect(store.key?.publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('posts a run under its name, uploading the song the server lacks', async () => {
    expect(await boards.post('song', 'KC1', [run])).toEqual({ status: 'accepted', rank: 1, players: 1, score: run.score });
    expect(store.runs.size).toBe(0);
    const client = (await boards.client())!;
    const board = await client.board(hash, 'normal', 10, 'KC1');
    expect(board.top[0]).toMatchObject({ nickname: 'KC1', score: run.score });
    expect(board.you).toMatchObject({ rank: 1, nickname: 'KC1' });
  }, 60_000);

  it('keeps a run finished offline and sends it later', async () => {
    online = false;
    expect(await boards.post('song', 'KC1', [{ ...run, score: run.score + 1 }])).toEqual({ status: 'queued' });
    expect(store.runs.size).toBe(1);
    online = true;
    const outcomes: unknown[] = [];
    await boards.flush((_id, outcome) => outcomes.push(outcome));
    expect(outcomes).toEqual([{ status: 'rejected', reason: 'score mismatch' }]);
    expect(store.runs.size).toBe(0);
  });

  it('sends a run queued with no name under the next name posted, and sends what follows it', async () => {
    // A run queued before names went with runs, then a newer one with a name.
    await store.addPending({ kind: 'song', replays: [encodeReplay({ ...run, score: run.score + 2 }).buffer], at: 1 });
    await store.addPending({ kind: 'song', name: 'KC1', replays: [encodeReplay({ ...run, score: run.score + 3 }).buffer], at: 2 });
    // With no name to give it, the nameless run waits and the one after it is still sent.
    const first: unknown[] = [];
    await boards.flush((_id, outcome) => first.push(outcome));
    expect(first).toEqual([{ status: 'rejected', reason: 'score mismatch' }]);
    expect([...store.runs.values()].map((r) => r.name)).toEqual([undefined]);
    const later: unknown[] = [];
    await boards.flush((_id, outcome) => later.push(outcome), 'AMY');
    expect(later).toEqual([{ status: 'rejected', reason: 'score mismatch' }]);
    expect(store.runs.size).toBe(0);
  });

  it('says when a run is queued, and sends it ahead of older runs', async () => {
    await store.addPending({ kind: 'song', replays: [encodeReplay({ ...run, score: run.score + 4 }).buffer], at: 1 });
    const order: number[] = [];
    let queued = false;
    const flush = boards.flush.bind(boards);
    boards.flush = (onSent, name, first) =>
      flush((id, outcome) => {
        order.push(id);
        onSent?.(id, outcome);
      }, name, first);
    const outcome = await boards.post('song', 'AMY', [{ ...run, score: run.score + 5 }], () => (queued = true));
    boards.flush = flush;
    expect(queued).toBe(true);
    expect(outcome).toEqual({ status: 'rejected', reason: 'score mismatch' });
    // The run just posted went first, then the older nameless one under its name.
    expect(order).toHaveLength(2);
    expect(order[0]).toBeGreaterThan(order[1]!);
    expect(store.runs.size).toBe(0);
  });

  it('gives the server\'s answer to a refused name', async () => {
    expect(await boards.post('song', 'A55', [run])).toEqual({ status: 'rejected', reason: 'name refused' });
  });
});

describe('outcomeLine', () => {
  it('is arcade terse', () => {
    expect(outcomeLine({ status: 'accepted', rank: 3, players: 12, score: 100 })).toBe('Rank 3/12');
    expect(outcomeLine({ status: 'rejected', reason: 'score mismatch' })).toBe('Not posted: score mismatch');
    expect(outcomeLine({ status: 'queued' })).toBe('Queued');
    expect(outcomeLine({ status: 'unavailable' })).toBeNull();
    expect(outcomeLine(null)).toBeNull();
  });
});
