// Golden LevelData hashes for the fixture modules. This file runs in Node (the `node`
// project) and in real browsers (the `browser` project), and every environment must
// produce the committed hash. That is S1's acceptance check. Change a hash only together
// with a GEN_VERSION bump.

import { GEN_VERSION } from '@game/core';
import { describe, expect, it } from 'vitest';
import golden from '../fixtures/golden.json' with { type: 'json' };
import { analyze, hashLevelData, loadOpenMpt } from '../src/index.ts';

async function readFixture(name: string): Promise<Uint8Array> {
  const url = new URL(`../fixtures/${name}`, import.meta.url);
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return new Uint8Array(await readFile(url));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch ${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

describe('golden LevelData', () => {
  it('is pinned for this GEN_VERSION and libopenmpt build', async () => {
    const openmpt = await loadOpenMpt();
    expect(golden.genVersion).toBe(GEN_VERSION);
    expect(golden.libopenmpt).toBe(openmpt.libraryVersion);
  });

  for (const [name, expected] of Object.entries(golden.levelData)) {
    it(`${name} hashes to the committed value`, async () => {
      const openmpt = await loadOpenMpt();
      const level = analyze(openmpt, await readFixture(name));
      expect(await hashLevelData(level)).toBe(expected);
    }, 60_000);
  }
});
