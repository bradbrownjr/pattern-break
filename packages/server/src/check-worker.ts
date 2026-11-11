// The check worker: a worker thread that runs Checker on jobs from check-queue.ts, so a
// song's first analysis (seconds) never blocks the request thread.

import { parentPort, workerData } from 'node:worker_threads';
import { Checker, type CheckJob } from './checker.ts';
import { songReader, type SongStore } from './song-store.ts';

export interface WorkerData {
  store: SongStore;
  cacheDir: string;
}

const data = workerData as WorkerData;
const checker = new Checker({ readSong: songReader(data.store), cacheDir: data.cacheDir });

parentPort!.on('message', (message: { id: number; job: CheckJob }) => {
  checker.check(message.job).then(
    (result) => parentPort!.postMessage({ id: message.id, result }),
    (error: unknown) => parentPort!.postMessage({ id: message.id, error: String(error) }),
  );
});
