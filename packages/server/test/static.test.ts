import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaticServer } from '../src/static.ts';

let base: string;
let port: number;
let server: Server;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pb-static-'));
  const root = join(dir, 'dist');
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><title>t</title>');
  await writeFile(join(root, 'assets', 'app-abc123.js'), 'export {};');
  await writeFile(join(root, 'assets', 'lib-abc123.wasm'), Buffer.from([0, 0x61, 0x73, 0x6d]));
  await writeFile(join(root, 'assets', 'song-abc123.mod'), Buffer.from([1, 2, 3]));
  await writeFile(join(root, 'sw.js'), 'self;');
  await writeFile(join(root, 'manifest.webmanifest'), '{}');
  await writeFile(join(dir, 'secret.txt'), 'secret');
  await symlink(join(dir, 'secret.txt'), join(root, 'link.txt'));
  server = createStaticServer({ root });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(dir, { recursive: true, force: true });
});

// fetch() normalizes ".." out of URLs, so traversal attempts go through node:http raw.
function raw(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString()));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('static server', () => {
  it('serves index.html at / with no-cache', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(await res.text()).toContain('<title>t</title>');
  });

  it('serves wasm as application/wasm with long cache headers', async () => {
    const res = await fetch(`${base}/assets/lib-abc123.wasm`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/wasm');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0, 0x61, 0x73, 0x6d]));
  });

  it('serves javascript and module files with the right types', async () => {
    const js = await fetch(`${base}/assets/app-abc123.js`);
    expect(js.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    const mod = await fetch(`${base}/assets/song-abc123.mod`);
    expect(mod.headers.get('content-type')).toBe('application/octet-stream');
  });

  it('serves the service worker and web app manifest for revalidation, with their types', async () => {
    // The service worker must not be cached for long, or a new build's worker would go
    // unseen (src/sw.ts in the client).
    const sw = await fetch(`${base}/sw.js`);
    expect(sw.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(sw.headers.get('cache-control')).toBe('no-cache');
    const manifest = await fetch(`${base}/manifest.webmanifest`);
    expect(manifest.headers.get('content-type')).toBe('application/manifest+json; charset=utf-8');
    expect(manifest.headers.get('cache-control')).toBe('no-cache');
  });

  it('answers 304 when the ETag matches', async () => {
    const first = await fetch(`${base}/assets/app-abc123.js`);
    const etag = first.headers.get('etag') ?? '';
    const again = await fetch(`${base}/assets/app-abc123.js`, {
      headers: { 'If-None-Match': etag },
    });
    expect(again.status).toBe(304);
  });

  it('answers HEAD without a body', async () => {
    const res = await fetch(`${base}/assets/app-abc123.js`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('10');
    expect(await res.text()).toBe('');
  });

  it('answers /healthz with 200', async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok\n');
  });

  it('answers 404 for a missing file and for a folder', async () => {
    expect((await fetch(`${base}/nope.js`)).status).toBe(404);
    expect((await fetch(`${base}/assets`)).status).toBe(404);
  });

  it('refuses methods other than GET and HEAD', async () => {
    const res = await fetch(`${base}/`, { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, HEAD');
  });

  it('refuses path traversal, plain and encoded', async () => {
    for (const path of [
      '/../secret.txt',
      '/assets/../../secret.txt',
      '/%2e%2e/secret.txt',
      '/%2e%2e%2fsecret.txt',
      '/assets/%2e%2e/%2e%2e/secret.txt',
      '/..%5csecret.txt',
      '/%00',
    ]) {
      const { status, body } = await raw(path);
      expect(status, path).toBeGreaterThanOrEqual(400);
      expect(body, path).not.toContain('secret');
    }
  });

  it('refuses a symlink that leads out of the folder', async () => {
    const { status, body } = await raw('/link.txt');
    expect(status).toBe(403);
    expect(body).not.toContain('secret');
  });

  it('answers 400 for a malformed percent escape', async () => {
    expect((await raw('/%zz')).status).toBe(400);
  });
});
