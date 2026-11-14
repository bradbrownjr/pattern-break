// The server: the leaderboard API under /api and the built client for every other path
// (docs/PLAN.md, "Server"; the API is in docs/DEVELOPMENT.md, "Leaderboard server").

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { Difficulty, GEN_VERSION, SIM_VERSION, decodeReplay, nameProblem, type DifficultyName } from '@game/core';
import type { CheckJob, CheckResult } from './checker.ts';
import { Database, type Board } from './db.ts';
import { checkSignature } from './signature.ts';
import { HASH, hasSong, storeSong, type SongStore } from './song-store.ts';
import { createStaticHandler } from './static.ts';

/** Largest song file a player may upload (docs/PLAN.md, "Server"). */
export const MAX_SONG_BYTES = 4 * 1024 * 1024;
/** Largest replay: a 15-minute song is about 108 000 ticks, a few kilobytes as runs. */
export const MAX_REPLAY_BYTES = 256 * 1024;
export const MAX_BOARD_LIMIT = 100;

export interface Checks {
  check(job: CheckJob): Promise<CheckResult>;
}

export interface AppOptions {
  store: SongStore;
  dataDir: string;
  checks: Checks;
  /** The built client; omitted, /api is all the server answers. */
  clientDist?: string;
  /** Fastify's trustProxy: the reverse proxy's address, so rate limits see players' IPs. */
  trustProxy?: boolean | string;
  /** The clock, for tests. */
  now?: () => number;
  /** Logs warnings and errors (Fastify's pino logger) when true. */
  logger?: boolean;
  /** Turns the rate limits off, for tests that send many requests. */
  rateLimits?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
    playerKey?: string;
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function difficultyParam(value: unknown): DifficultyName | null {
  return typeof value === 'string' && value in Difficulty ? (value as DifficultyName) : null;
}

export async function buildApp(options: AppOptions): Promise<{ app: FastifyInstance; db: Database }> {
  const now = options.now ?? Date.now;
  await mkdir(join(options.dataDir, 'replays'), { recursive: true });
  const db = new Database(join(options.dataDir, 'pattern-break.sqlite'));
  const replayDir = join(options.dataDir, 'replays');
  const app = Fastify({
    trustProxy: options.trustProxy ?? false,
    bodyLimit: MAX_SONG_BYTES,
    logger: options.logger ? { level: 'warn' } : false,
  });
  app.addHook('onClose', () => db.close());

  // Bodies are kept as bytes too, since the signature covers the bytes as sent.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    request.rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')));
    } catch {
      done(Object.assign(new Error('Body is not JSON'), { statusCode: 400 }), undefined);
    }
  });
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (request, body, done) => {
    request.rawBody = body as Buffer;
    done(null, body);
  });

  // With rateLimits off (tests), every limit is too high to reach.
  const scale = (options.rateLimits ?? true) ? 1 : 1_000_000;
  await app.register(rateLimit, { global: false });
  const perIp = (max: number, timeWindow: string) => ({ rateLimit: { max: max * scale, timeWindow } });
  // A second limit per player, keyed by the signed public key, after the signature check.
  const perPlayer = (max: number, timeWindow: string) => [
    app.rateLimit({ max: max * scale, timeWindow, keyGenerator: (request) => `player:${request.playerKey ?? request.ip}` }),
  ];

  /** preValidation hook: the request must be signed by a key. */
  async function signed(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const check = checkSignature(request.headers, request.method, request.url, request.rawBody ?? Buffer.alloc(0), now());
    if (!check.ok) {
      await reply.code(401).send({ error: check.reason });
      return;
    }
    request.playerKey = check.key;
  }

  // Songs.
  app.put(
    '/api/songs/:hash',
    { config: perIp(20, '1 hour'), preValidation: signed, preHandler: perPlayer(10, '1 hour') },
    async (request, reply) => {
      const { hash } = request.params as { hash: string };
      if (!HASH.test(hash)) return reply.code(400).send({ error: 'bad hash' });
      if (!db.playerByKey(request.playerKey!)) return reply.code(403).send({ error: 'unknown player' });
      const bytes = request.rawBody;
      if (!bytes || !String(request.headers['content-type']).startsWith('application/octet-stream')) {
        return reply.code(415).send({ error: 'send the song as application/octet-stream' });
      }
      if (sha256(bytes) !== hash) return reply.code(422).send({ error: 'hash mismatch' });
      if (await hasSong(options.store, hash)) return { stored: true };
      await storeSong(options.store, hash, bytes);
      return reply.code(201).send({ stored: true });
    },
  );

  app.get('/api/songs/:hash', { config: perIp(120, '1 minute') }, async (request, reply) => {
    const { hash } = request.params as { hash: string };
    if (!HASH.test(hash)) return reply.code(400).send({ error: 'bad hash' });
    const row = db.song(hash);
    const bundled = options.store.bundled[hash];
    if (!row && !bundled) return reply.code(404).send({ error: 'unknown song' });
    return {
      hash,
      title: bundled?.title ?? row!.title,
      author: bundled?.author ?? row!.author,
      bundled: Boolean(bundled),
      license: bundled?.license ?? null,
      sourceUrl: bundled?.sourceUrl ?? null,
      players: row?.players ?? 0,
    };
  });

  // Runs. Each is sent with the name it's posted under; the first run from a key makes its
  // player, so a song upload (which needs one) can follow a needModule answer.
  app.post(
    '/api/runs',
    {
      bodyLimit: 3 * 1024 * 1024,
      config: perIp(30, '1 minute'),
      preValidation: signed,
      preHandler: perPlayer(20, '1 minute'),
    },
    async (request, reply) => {
      const body = request.body as { kind?: unknown; name?: unknown; replays?: unknown } | null;
      const kind = body?.kind;
      const encoded = body?.replays;
      if ((kind !== 'song' && kind !== 'arcade' && kind !== 'level') || !Array.isArray(encoded) || encoded.length === 0) {
        return reply.code(400).send({ error: 'send kind, name and replays' });
      }
      const nickname = typeof body?.name === 'string' ? body.name : '';
      const problem = nameProblem(nickname);
      if (problem) return reply.code(422).send({ status: 'rejected', reason: problem === 'vulgar' ? 'name refused' : 'bad name' });
      const player = db.ensurePlayer(request.playerKey!, now());
      const maxLevels = Math.max(options.store.arcade.levels.length, options.store.arcade.impossible.length);
      if (encoded.length > (kind === 'arcade' ? maxLevels : 1)) return reply.code(400).send({ error: 'too many replays' });
      const replays: Uint8Array[] = [];
      const hashes: string[] = [];
      for (const item of encoded) {
        if (typeof item !== 'string' || item.length > (MAX_REPLAY_BYTES * 4) / 3 + 4) {
          return reply.code(400).send({ error: 'bad replay' });
        }
        const bytes = new Uint8Array(Buffer.from(item, 'base64'));
        try {
          hashes.push(decodeReplay(bytes).moduleHash);
        } catch {
          return reply.code(422).send({ status: 'rejected', reason: 'bad replay', level: replays.length });
        }
        replays.push(bytes);
      }
      // Songs the server lacks: the client uploads them and sends the run again.
      const missing: string[] = [];
      for (const hash of new Set(hashes)) if (!(await hasSong(options.store, hash))) missing.push(hash);
      if (missing.length > 0) return { status: 'needModule', hashes: missing };

      const result = await options.checks.check({ kind, replays, arcade: options.store.arcade });
      if (!result.ok) return reply.code(422).send({ status: 'rejected', reason: result.reason, level: result.level });

      const at = now();
      const shas: string[] = [];
      for (const bytes of replays) {
        const sha = sha256(bytes);
        shas.push(sha);
        const file = join(replayDir, sha);
        const tmp = `${file}.${process.pid}.tmp`;
        await writeFile(tmp, bytes);
        await rename(tmp, file);
      }
      for (let i = 0; i < hashes.length; i++) {
        const bundled = options.store.bundled[hashes[i]!];
        db.noteSong(
          bundled
            ? { hash: hashes[i]!, title: bundled.title, author: bundled.author, bundled: true }
            : { hash: hashes[i]!, title: i === 0 ? result.title : '', author: i === 0 ? result.artist : '', bundled: false },
          at,
        );
      }
      // Each level goes on a board of its own: a song's from Levels, an arcade level's
      // (as the arcade cuts it) from the arcade.
      const levelBoard = (i: number): Board => {
        const position = result.levels[i]!.position;
        return position < 0
          ? { kind: 'song', song: hashes[i]!, difficulty: result.difficulty }
          : { kind: 'level', level: position + 1, difficulty: result.difficulty };
      };
      const levelRuns = result.levels.map((level, i) =>
        db.addRun(
          {
            player: player.id,
            nickname,
            board: levelBoard(i),
            gen: GEN_VERSION,
            sim: SIM_VERSION,
            score: level.score,
            levels: 1,
            finished: level.finished,
            replays: [shas[i]!],
          },
          at,
        ),
      );
      const board: Board = kind === 'arcade' ? { kind: 'arcade', difficulty: result.difficulty } : levelBoard(0);
      const runId =
        kind === 'arcade'
          ? db.addRun(
              {
                player: player.id,
                nickname,
                board,
                gen: GEN_VERSION,
                sim: SIM_VERSION,
                score: result.total,
                levels: result.levels.length,
                finished: result.levels[result.levels.length - 1]!.finished,
                replays: shas,
              },
              at,
            )
          : levelRuns[0]!;
      const placed = db.board(board, GEN_VERSION, SIM_VERSION, 0, { player: player.id, nickname });
      return { status: 'accepted', runId, score: result.total, rank: placed.you?.rank ?? null, players: placed.players };
    },
  );

  // Boards. 'arcade' is the arcade run's board, 'level-1' to 'level-8' its levels' boards,
  // and any other name is a song's hash.
  app.get('/api/leaderboards/:board', { config: perIp(120, '1 minute') }, async (request, reply) => {
    const { board: name } = request.params as { board: string };
    const query = request.query as { difficulty?: string; limit?: string; name?: string };
    const difficulty = difficultyParam(query.difficulty);
    if (!difficulty) return reply.code(400).send({ error: 'difficulty must be one of ' + Object.keys(Difficulty).join(', ') });
    const level = /^level-([1-9][0-9]?)$/.exec(name);
    const levelNumber = level ? Number(level[1]) : 0;
    const maxLevels = Math.max(options.store.arcade.levels.length, options.store.arcade.impossible.length);
    if (name !== 'arcade' && !HASH.test(name) && !(levelNumber >= 1 && levelNumber <= maxLevels)) {
      return reply.code(400).send({ error: 'bad board' });
    }
    const limit = Math.min(MAX_BOARD_LIMIT, Math.max(1, Number(query.limit ?? 10) | 0));
    const key = request.headers['x-pb-key'];
    const player = typeof key === 'string' ? db.playerByKey(key) : null;
    const board: Board =
      name === 'arcade'
        ? { kind: 'arcade', difficulty }
        : levelNumber > 0
          ? { kind: 'level', level: levelNumber, difficulty }
          : { kind: 'song', song: name, difficulty };
    const you = player ? { player: player.id, nickname: typeof query.name === 'string' && query.name ? query.name : null } : null;
    return { genVersion: GEN_VERSION, simVersion: SIM_VERSION, ...db.board(board, GEN_VERSION, SIM_VERSION, limit, you) };
  });

  // Replays of listed runs, by the SHA-256 the boards name, so top runs can be watched.
  app.get('/api/replays/:sha', { config: perIp(120, '1 minute') }, async (request, reply) => {
    const { sha } = request.params as { sha: string };
    if (!HASH.test(sha) || !db.hasReplay(sha)) return reply.code(404).send({ error: 'unknown replay' });
    const bytes = await readFile(join(replayDir, sha));
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(bytes);
  });

  app.get('/api', async () => ({ genVersion: GEN_VERSION, simVersion: SIM_VERSION }));
  app.all('/api/*', async (_request, reply) => reply.code(404).send({ error: 'not found' }));

  // Everything else is the built client, from the static server (static.ts).
  if (options.clientDist) {
    const serveStatic = createStaticHandler({ root: options.clientDist });
    app.setNotFoundHandler((request, reply) => {
      reply.hijack();
      serveStatic(request.raw, reply.raw);
    });
  }
  return { app, db };
}
