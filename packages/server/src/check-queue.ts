// Sends run checks to the check worker one at a time and hands back each result. One worker
// is enough: a check after a song's first is a sim run of milliseconds (docs/DEVELOPMENT.md,
// "Leaderboard server"). A worker that dies is started again for the next job.

import { Worker } from 'node:worker_threads';
import type { CheckJob, CheckResult } from './checker.ts';
import type { WorkerData } from './check-worker.ts';

type Pending = { resolve: (result: CheckResult) => void; reject: (error: Error) => void };

export class CheckQueue {
  readonly #data: WorkerData;
  #worker: Worker | null = null;
  #nextId = 1;
  readonly #pending = new Map<number, Pending>();

  constructor(data: WorkerData) {
    this.#data = data;
  }

  check(job: CheckJob): Promise<CheckResult> {
    const worker = this.#start();
    const id = this.#nextId++;
    return new Promise<CheckResult>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      // Held while a check is pending, so the process waits for it.
      worker.ref();
      worker.postMessage({ id, job });
    });
  }

  async close(): Promise<void> {
    const worker = this.#worker;
    this.#worker = null;
    if (worker) await worker.terminate();
  }

  #start(): Worker {
    if (this.#worker) return this.#worker;
    const worker = new Worker(new URL('./check-worker.ts', import.meta.url), { workerData: this.#data });
    worker.on('message', (message: { id: number; result?: CheckResult; error?: string }) => {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (this.#pending.size === 0) worker.unref();
      if (message.result) pending.resolve(message.result);
      else pending.reject(new Error(message.error ?? 'check failed'));
    });
    const fail = (error: Error): void => {
      if (this.#worker === worker) this.#worker = null;
      for (const pending of this.#pending.values()) pending.reject(error);
      this.#pending.clear();
    };
    worker.on('error', fail);
    worker.on('exit', (code) => {
      if (this.#worker === worker) fail(new Error(`check worker exited with code ${code}`));
    });
    // An idle worker doesn't keep the process alive.
    worker.unref();
    this.#worker = worker;
    return worker;
  }
}
