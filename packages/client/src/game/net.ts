// The leaderboard client (docs/PLAN.md, "Server"; the API is in docs/DEVELOPMENT.md,
// "Leaderboard server"). The player is an Ed25519 key pair made in this browser and kept in
// IndexedDB; the private key can't be read out, only used to sign. Finished runs go into a
// queue first and are sent from it, so a run finished offline is sent once the game is back
// online.

import { encodeReplay, type Replay } from '@game/core';
import type { PendingRun, StoredIdentity } from './library.ts';

/** What became of a run sent to the leaderboard. */
export type Outcome =
  | { status: 'accepted'; rank: number | null; players: number; score: number }
  | { status: 'rejected'; reason: string }
  /** Not sent yet: offline, or the server didn't answer. It stays queued. */
  | { status: 'queued' }
  /** The player has no name yet. It stays queued until they set one. */
  | { status: 'noName' }
  /** This browser can't sign (no Ed25519 in Web Crypto, no IndexedDB, or not HTTPS). */
  | { status: 'unavailable' };

export interface BoardEntry {
  rank: number;
  nickname: string;
  link: string | null;
  score: number;
  levels: number;
  finished: boolean;
}

export interface BoardView {
  top: BoardEntry[];
  you: BoardEntry | null;
  players: number;
}

export interface Profile {
  nickname: string;
  link: string | null;
}

/** Where the key and the queue are kept: the Library, or a stand-in in tests. */
export interface NetStore {
  identity(): Promise<StoredIdentity | null>;
  putIdentity(identity: StoredIdentity): Promise<void>;
  pendingRuns(): Promise<PendingRun[]>;
  addPending(run: PendingRun): Promise<number>;
  deletePending(id: number): Promise<void>;
}

/** A song file's bytes by its SHA-256, for the server to check a run on a song it lacks. */
export type SongBytes = (hash: string) => Promise<Uint8Array | null>;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Thrown when the server can't be reached; the run stays queued. */
export class Offline extends Error {}

const ED25519 = { name: 'Ed25519' } as const;

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * The device key, made the first time. Null where Web Crypto has no Ed25519 (Chrome before
 * 137, Firefox before 129, Safari before 17, per MDN) or no `crypto.subtle` (not HTTPS).
 */
export async function deviceKey(store: NetStore): Promise<StoredIdentity | null> {
  const stored = await store.identity();
  if (stored) return stored;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const pair = (await subtle.generateKey(ED25519, false, ['sign', 'verify'])) as CryptoKeyPair;
    const raw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
    const identity: StoredIdentity = { id: 'device', publicKey: base64url(raw), privateKey: pair.privateKey };
    await store.putIdentity(identity);
    return identity;
  } catch {
    return null;
  }
}

/** The leaderboard API, with each writing request signed by the device key. */
export class LeaderboardClient {
  readonly #base: string;
  readonly #key: StoredIdentity;
  readonly #fetch: Fetch;
  readonly #now: () => number;

  constructor(key: StoredIdentity, options: { base?: string; fetch?: Fetch; now?: () => number } = {}) {
    this.#key = key;
    this.#base = options.base ?? '';
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.#now = options.now ?? Date.now;
  }

  async #request(method: string, path: string, body?: Uint8Array, type = 'application/json'): Promise<Response> {
    const headers: Record<string, string> = { 'x-pb-key': this.#key.publicKey };
    if (method !== 'GET') {
      const at = String(this.#now());
      const head = new TextEncoder().encode(`${method} ${path}\n${at}\n`);
      const message = new Uint8Array(head.length + (body?.length ?? 0));
      message.set(head);
      if (body) message.set(body, head.length);
      const signature = new Uint8Array(await crypto.subtle.sign(ED25519, this.#key.privateKey, message));
      Object.assign(headers, { 'content-type': type, 'x-pb-at': at, 'x-pb-signature': base64url(signature) });
    }
    try {
      const init: RequestInit = { method, headers };
      if (body) init.body = body as Uint8Array<ArrayBuffer>;
      return await this.#fetch(`${this.#base}${path}`, init);
    } catch (error) {
      throw new Offline(String(error));
    }
  }

  async #json(method: string, path: string, value: unknown): Promise<Response> {
    return this.#request(method, path, new TextEncoder().encode(JSON.stringify(value)));
  }

  /** The player's nickname and link, or null before they set one. */
  async profile(): Promise<Profile | null> {
    const res = await this.#request('GET', '/api/players/me');
    if (!res.ok) throw new Offline(`players/me: ${res.status}`);
    const profile = (await res.json()) as { nickname: string | null; link: string | null };
    return profile.nickname === null ? null : { nickname: profile.nickname, link: profile.link };
  }

  /** Sets the nickname and link; resolves to null, or what was wrong ('nickname taken'). */
  async setProfile(profile: Profile): Promise<string | null> {
    const res = await this.#json('PUT', '/api/players/me', profile);
    if (res.ok) return null;
    if (res.status >= 500) throw new Offline(`players/me: ${res.status}`);
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return body.error ?? `error ${res.status}`;
  }

  /** Sends a run, uploading any song the server asks for once, then sending it again. */
  async submit(run: { kind: 'song' | 'arcade'; replays: Uint8Array[] }, songBytes: SongBytes): Promise<Outcome> {
    const body = { kind: run.kind, replays: run.replays.map(base64) };
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.#json('POST', '/api/runs', body);
      if (res.status === 403) return { status: 'noName' };
      if (res.status >= 500 || res.status === 429) throw new Offline(`runs: ${res.status}`);
      const answer = (await res.json().catch(() => ({}))) as {
        status?: string;
        hashes?: string[];
        reason?: string;
        error?: string;
        rank?: number | null;
        players?: number;
        score?: number;
      };
      if (answer.status === 'accepted') {
        return { status: 'accepted', rank: answer.rank ?? null, players: answer.players ?? 0, score: answer.score ?? 0 };
      }
      if (answer.status !== 'needModule' || attempt > 0) {
        return { status: 'rejected', reason: answer.reason ?? answer.error ?? `error ${res.status}` };
      }
      for (const hash of answer.hashes ?? []) {
        const bytes = await songBytes(hash);
        if (!bytes) return { status: 'rejected', reason: 'song missing' };
        const up = await this.#request('PUT', `/api/songs/${hash}`, bytes, 'application/octet-stream');
        if (up.status >= 500 || up.status === 429) throw new Offline(`songs: ${up.status}`);
        if (!up.ok) return { status: 'rejected', reason: 'upload refused' };
      }
    }
    return { status: 'rejected', reason: 'song missing' };
  }

  /** A board: 'arcade', or a song's hash. */
  async board(name: string, difficulty: string, limit = 10): Promise<BoardView> {
    const res = await this.#request('GET', `/api/leaderboards/${name}?difficulty=${difficulty}&limit=${limit}`);
    if (!res.ok) throw new Offline(`leaderboards: ${res.status}`);
    return (await res.json()) as BoardView;
  }
}

/**
 * The game's side of the leaderboards: the key, the name, the queue. Every finished run is
 * queued, then the queue is sent, oldest first; a run the server answers (accepted or
 * rejected) leaves the queue, and one it doesn't stays for next time.
 */
export class Leaderboards {
  readonly #store: NetStore;
  readonly #songBytes: SongBytes;
  readonly #options: { base?: string; fetch?: Fetch; now?: () => number };
  #ready: Promise<LeaderboardClient | null> | null = null;
  #flushing: Promise<void> | null = null;
  /** The name and link, once known: null before one is set, undefined before asking. */
  profile: Profile | null | undefined = undefined;

  constructor(store: NetStore, songBytes: SongBytes, options: { base?: string; fetch?: Fetch; now?: () => number } = {}) {
    this.#store = store;
    this.#songBytes = songBytes;
    this.#options = options;
  }

  /** The client, with the device key made on first use; null where the browser can't sign. */
  client(): Promise<LeaderboardClient | null> {
    this.#ready ??= deviceKey(this.#store).then((key) => (key ? new LeaderboardClient(key, this.#options) : null));
    return this.#ready;
  }

  /** Asks the server for the player's name; leaves it unknown when offline. */
  async loadProfile(): Promise<Profile | null | undefined> {
    const client = await this.client();
    if (!client) return undefined;
    try {
      this.profile = await client.profile();
    } catch {
      // Offline: still unknown.
    }
    return this.profile;
  }

  /** Sets the name and link; resolves to null, or what was wrong. */
  async setProfile(profile: Profile): Promise<string | null> {
    const client = await this.client();
    if (!client) return 'unavailable';
    try {
      const error = await client.setProfile(profile);
      if (error === null) this.profile = profile;
      return error;
    } catch {
      return 'offline';
    }
  }

  /** Queues a finished run and sends the queue; resolves to what became of this run. */
  async post(kind: 'song' | 'arcade', replays: readonly Replay[]): Promise<Outcome> {
    const client = await this.client();
    if (!client) return { status: 'unavailable' };
    const run: PendingRun = { kind, replays: replays.map((r) => encodeReplay(r).buffer), at: Date.now() };
    const id = await this.#store.addPending(run);
    let outcome: Outcome = { status: 'queued' };
    await this.flush((sent, result) => {
      if (sent === id) outcome = result;
    });
    return outcome;
  }

  /** Sends the queued runs, oldest first; `onSent` hears each answer. Stops at the first that can't be sent. */
  flush(onSent?: (id: number, outcome: Outcome) => void): Promise<void> {
    // One flush at a time; a second caller waits for it, then runs its own.
    const previous = this.#flushing ?? Promise.resolve();
    const next = previous.then(() => this.#flush(onSent));
    this.#flushing = next.finally(() => {
      if (this.#flushing === next) this.#flushing = null;
    });
    return next;
  }

  async #flush(onSent?: (id: number, outcome: Outcome) => void): Promise<void> {
    const client = await this.client();
    if (!client) return;
    for (const run of await this.#store.pendingRuns()) {
      let outcome: Outcome;
      try {
        outcome = await client.submit({ kind: run.kind, replays: run.replays.map((b) => new Uint8Array(b)) }, this.#songBytes);
      } catch {
        onSent?.(run.id!, { status: 'queued' });
        return;
      }
      if (outcome.status === 'noName') {
        this.profile = null;
        onSent?.(run.id!, outcome);
        return;
      }
      await this.#store.deletePending(run.id!);
      onSent?.(run.id!, outcome);
    }
  }
}

/** The results line for an outcome, arcade terse; null for none. */
export function outcomeLine(outcome: Outcome | null): string | null {
  if (!outcome) return null;
  switch (outcome.status) {
    case 'accepted':
      return outcome.rank === null ? 'Posted' : `Rank ${outcome.rank}/${outcome.players}`;
    case 'rejected':
      return `Not posted: ${outcome.reason}`;
    case 'queued':
      return 'Queued';
    case 'noName':
      return 'N Set name';
    case 'unavailable':
      return null;
  }
}
