// Entry point: node packages/server/src/main.ts
// Environment (docs/SELF-HOSTING.md):
//   PORT         default 8080
//   CLIENT_DIST  the built client, default packages/client/dist in the repo
//   DATA_DIR     the database, replays, uploaded songs and level cache, default
//                packages/server/data in the repo (/data in the image)
//   MUSIC_DIR    the bundled songs and manifest.json, default music/ in the repo
//   TRUST_PROXY  the reverse proxy's address (or "true"), so rate limits see players' IPs

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { CheckQueue } from './check-queue.ts';
import { openSongStore } from './song-store.ts';

const port = Number(process.env['PORT'] ?? 8080);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`PORT must be a whole number from 0 to 65535, got "${process.env['PORT']}"`);
  process.exit(1);
}

const root = process.env['CLIENT_DIST'] ?? fileURLToPath(new URL('../../client/dist', import.meta.url));
if (!existsSync(`${root}/index.html`)) {
  console.error(`No index.html in ${root}. Build the client first (pnpm build) or set CLIENT_DIST.`);
  process.exit(1);
}
const dataDir = process.env['DATA_DIR'] ?? fileURLToPath(new URL('../data', import.meta.url));
const musicDir = process.env['MUSIC_DIR'] ?? fileURLToPath(new URL('../../../music', import.meta.url));
const proxy = process.env['TRUST_PROXY'];
const trustProxy = proxy === undefined || proxy === '' ? false : proxy === 'true' ? true : proxy;

const store = openSongStore(musicDir, dataDir);
const checks = new CheckQueue({ store, cacheDir: join(dataDir, 'levels') });
const { app } = await buildApp({ store, dataDir, checks, clientDist: root, trustProxy, logger: true });
await app.listen({ port, host: '0.0.0.0' });
console.log(`pattern-break server listening on port ${port}, serving ${root}, data in ${dataDir}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app
      .close()
      .then(() => checks.close())
      .then(() => process.exit(0));
  });
}
