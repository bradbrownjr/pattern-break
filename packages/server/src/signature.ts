// Signed requests (docs/PLAN.md, "Server", "Players"). A player is an Ed25519 key pair made
// in the browser; the public key names them. A request that writes carries three headers:
//
//   X-PB-Key        the public key, 32 bytes as base64url
//   X-PB-At         the time it was signed, milliseconds since 1970 (UTC)
//   X-PB-Signature  the Ed25519 signature, 64 bytes as base64url, over the UTF-8 bytes of
//                   "<METHOD> <path>\n<at>\n" followed by the body's bytes
//
// The method and path stop a signature for one request being sent to another, and the time
// stops an old request being sent again later.

import { createPublicKey, verify } from 'node:crypto';

/** How far a request's time may be from the server's clock. */
export const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export type SignatureCheck = { ok: true; key: string } | { ok: false; reason: string };

export function signedMessage(method: string, path: string, at: string, body: Uint8Array): Uint8Array {
  const head = Buffer.from(`${method.toUpperCase()} ${path}\n${at}\n`, 'utf8');
  return Buffer.concat([head, body]);
}

export function checkSignature(
  headers: Record<string, string | string[] | undefined>,
  method: string,
  path: string,
  body: Uint8Array,
  now: number,
): SignatureCheck {
  const key = headers['x-pb-key'];
  const at = headers['x-pb-at'];
  const signature = headers['x-pb-signature'];
  if (typeof key !== 'string' || typeof at !== 'string' || typeof signature !== 'string') {
    return { ok: false, reason: 'unsigned' };
  }
  if (!BASE64URL.test(key) || Buffer.from(key, 'base64url').length !== 32) return { ok: false, reason: 'bad key' };
  if (!BASE64URL.test(signature) || Buffer.from(signature, 'base64url').length !== 64) {
    return { ok: false, reason: 'bad signature' };
  }
  if (!/^\d{1,15}$/.test(at) || Math.abs(Number(at) - now) > MAX_CLOCK_SKEW_MS) return { ok: false, reason: 'clock' };
  let good = false;
  try {
    const publicKey = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: key }, format: 'jwk' });
    good = verify(null, signedMessage(method, path, at, body), publicKey, Buffer.from(signature, 'base64url'));
  } catch {
    good = false;
  }
  return good ? { ok: true, key } : { ok: false, reason: 'bad signature' };
}
