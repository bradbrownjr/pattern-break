import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guards the guard: the ESLint config must keep rejecting non-deterministic code in core.
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });
const coreFile = `${repoRoot}packages/core/src/__lint_probe__.ts`;
const clientFile = `${repoRoot}packages/client/src/__lint_probe__.ts`;

async function ruleIds(code: string, filePath = coreFile): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

describe('core determinism lint', () => {
  it.each([
    ['Math.random', 'export const x = Math.random();', 'no-restricted-properties'],
    ['Math.sin', 'export const x = Math.sin(1);', 'no-restricted-properties'],
    ['Math.pow', 'export const x = Math.pow(2, 3);', 'no-restricted-properties'],
    ['** operator', 'export const x = 2 ** 3;', 'no-restricted-syntax'],
    ['computed Math', "export const x = Math['sin'](1);", 'no-restricted-syntax'],
    ['Math alias', 'const M = Math; export const x = M.floor(1);', 'no-restricted-syntax'],
    ['Date', 'export const x = Date.now();', 'no-restricted-globals'],
    ['performance', 'export const x = performance.now();', 'no-restricted-globals'],
    ['globalThis', 'export const x = globalThis;', 'no-restricted-globals'],
    ['npm import', "import 'pixi.js';", 'no-restricted-imports'],
    ['node import', "import 'node:crypto';", 'no-restricted-imports'],
    ['workspace import', "import '@game/analysis';", 'no-restricted-imports'],
  ])('rejects %s', async (_name, code, rule) => {
    expect(await ruleIds(code)).toContain(rule);
  });

  it('allows the deterministic subset', async () => {
    const code = [
      "import { TICK_HZ } from './version.ts';",
      'export const a = Math.sqrt(2) + Math.floor(1.5) + Math.imul(3, 5) + TICK_HZ;',
      'export const b = (7 * 3) | 0;',
    ].join('\n');
    expect(await ruleIds(code)).toEqual([]);
  });

  it('does not apply core rules outside core', async () => {
    expect(await ruleIds('export const x = Math.random();', clientFile)).toEqual([]);
  });
});
