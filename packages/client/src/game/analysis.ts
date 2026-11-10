// The main-thread side of the analysis worker.

import { deserializeLevelData, type LevelData } from '@game/core';
import type { AnalysisReply, AnalysisRequest } from './analysis-worker.ts';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (d: Uint8Array) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./analysis-worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<AnalysisReply>) => {
    const reply = e.data;
    const waiter = pending.get(reply.id);
    if (!waiter) return;
    pending.delete(reply.id);
    if (reply.ok) waiter.resolve(new Uint8Array(reply.levelData));
    else waiter.reject(new Error(reply.message));
  };
  w.onerror = (e) => {
    for (const waiter of pending.values()) waiter.reject(new Error(e.message || 'analysis worker failed'));
    pending.clear();
  };
  worker = w;
  return w;
}

/** Analyzes a song file's bytes at `tempoPermille` in the worker and returns its LevelData. */
export async function analyzeInWorker(bytes: Uint8Array, tempoPermille: number): Promise<LevelData> {
  return deserializeLevelData(await analyzeSerializedInWorker(bytes, tempoPermille));
}

/** As analyzeInWorker(), but returns the serialized LevelData, as the level cache stores it. */
export function analyzeSerializedInWorker(bytes: Uint8Array, tempoPermille: number): Promise<Uint8Array> {
  const id = nextId++;
  const copy = bytes.slice().buffer;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const request: AnalysisRequest = { id, bytes: copy, tempoPermille };
    getWorker().postMessage(request, [copy]);
  });
}
