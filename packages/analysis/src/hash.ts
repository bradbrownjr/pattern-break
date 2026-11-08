import { serializeLevelData, type LevelData } from '@game/core';

// The package compiles without the DOM lib, so the part of Web Crypto used here is
// declared by hand. Node 26 and every target browser have globalThis.crypto.subtle.
interface SubtleDigest {
  digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer>;
}

function subtle(): SubtleDigest {
  const c = (globalThis as { crypto?: { subtle?: SubtleDigest } }).crypto;
  if (!c?.subtle) throw new Error('globalThis.crypto.subtle is not available');
  return c.subtle;
}

/** SHA-256 of `bytes` as 64 lowercase hex digits. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await subtle().digest('SHA-256', bytes));
  let hex = '';
  for (const b of digest) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/** SHA-256 of `serializeLevelData(level)`. */
export function hashLevelData(level: LevelData): Promise<string> {
  return sha256Hex(serializeLevelData(level));
}
