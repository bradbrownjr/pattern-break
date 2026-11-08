// Entry point: node packages/server/src/main.ts
// Environment: PORT (default 8080), CLIENT_DIST (default: packages/client/dist in the repo).

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './static.ts';

const port = Number(process.env['PORT'] ?? 8080);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`PORT must be a whole number from 0 to 65535, got "${process.env['PORT']}"`);
  process.exit(1);
}

const root =
  process.env['CLIENT_DIST'] ?? fileURLToPath(new URL('../../client/dist', import.meta.url));
if (!existsSync(`${root}/index.html`)) {
  console.error(`No index.html in ${root}. Build the client first (pnpm build) or set CLIENT_DIST.`);
  process.exit(1);
}

const server = createStaticServer({ root });
server.listen(port, () => {
  console.log(`pattern-break server listening on port ${port}, serving ${root}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
