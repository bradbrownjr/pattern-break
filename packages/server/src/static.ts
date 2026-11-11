// Static file server for the built client. app.ts hands it every request that isn't for
// the API. Only node:http and node:fs are used.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';

export const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  // Tracker modules (song files made in a music tracker).
  '.mod': 'application/octet-stream',
  '.xm': 'application/octet-stream',
  '.s3m': 'application/octet-stream',
  '.it': 'application/octet-stream',
};

const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

export interface StaticServerOptions {
  /** Folder to serve, normally packages/client/dist. */
  root: string;
}

function send(
  res: ServerResponse,
  status: number,
  body: string,
  extra: Record<string, string> = {},
): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  });
  res.end(body);
}

/** Returns the decoded URL path, or null when it cannot be a safe file path. */
function decodePath(url: string | undefined): string | null {
  if (url === undefined) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0') || pathname.includes('\\')) return null;
  return pathname;
}

/** A request handler that serves the folder; it answers every request itself. */
export function createStaticHandler({ root }: StaticServerOptions): (req: IncomingMessage, res: ServerResponse) => void {
  const absRoot = resolve(root);
  // Resolved at the first file request, so the folder can appear after the server is made.
  let realRoot: string | undefined;

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, 'Method not allowed\n', { Allow: 'GET, HEAD' });
      return;
    }
    const pathname = decodePath(req.url);
    if (pathname === null) {
      send(res, 400, 'Bad request\n');
      return;
    }
    if (pathname === '/healthz') {
      send(res, 200, 'ok\n');
      return;
    }

    const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const candidate = resolve(absRoot, `.${relative}`);
    if (candidate !== absRoot && !candidate.startsWith(absRoot + sep)) {
      send(res, 403, 'Forbidden\n');
      return;
    }

    let file: string;
    try {
      realRoot ??= await realpath(absRoot);
      file = await realpath(candidate);
    } catch {
      send(res, 404, 'Not found\n');
      return;
    }
    // A symlink inside the folder must not lead out of it.
    if (!file.startsWith(realRoot + sep)) {
      send(res, 403, 'Forbidden\n');
      return;
    }
    const info = await stat(file).catch(() => null);
    if (info === null || !info.isFile()) {
      send(res, 404, 'Not found\n');
      return;
    }

    const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': pathname.startsWith('/assets/') ? IMMUTABLE : REVALIDATE,
      ETag: etag,
      'Last-Modified': info.mtime.toUTCString(),
      'X-Content-Type-Options': 'nosniff',
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': info.size });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    await pipeline(createReadStream(file), res);
  }

  return (req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      console.error('request failed:', error);
      send(res, 500, 'Internal server error\n');
    });
  };
}

export function createStaticServer(options: StaticServerOptions): Server {
  return createServer(createStaticHandler(options));
}
