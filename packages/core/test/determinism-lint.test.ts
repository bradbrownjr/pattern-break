import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Checks the checker: the lint config must keep rejecting non-deterministic code in core.
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const coreProbe = `${repoRoot}packages/core/src/__lint_probe__/`;
const clientProbe = `${repoRoot}packages/client/src/__lint_probe__/`;

const rejected: Array<[name: string, code: string, rule: string]> = [
  ['Math.random', 'export const x = Math.random();', 'no-restricted-properties'],
  ['Math.sin', 'export const x = Math.sin(1);', 'no-restricted-properties'],
  ['Math.pow', 'export const x = Math.pow(2, 3);', 'no-restricted-properties'],
  ['** operator', 'export const x = 2 ** 3;', 'no-pow-operator'],
  ['**= operator', 'let x = 2; x **= 3; export { x };', 'no-pow-operator'],
  ['computed Math', "export const x = Math['sin'](1);", 'no-computed-math'],
  ['Math alias', 'const M = Math; export const x = M.floor(1);', 'no-math-alias'],
  ['Math destructure', 'const { sin } = Math; export const x = sin(1);', 'no-math-alias'],
  ['Date', 'export const x = Date.now();', 'no-restricted-globals'],
  ['Temporal', 'export const x = Temporal.Now.instant();', 'no-restricted-globals'],
  ['performance', 'export const x = performance.now();', 'no-restricted-globals'],
  ['globalThis', 'export const x = globalThis;', 'no-restricted-globals'],
  ['npm import', "import 'pixi.js';", 'no-restricted-imports'],
  ['node import', "import 'node:crypto';", 'no-restricted-imports'],
  ['workspace import', "import '@game/analysis';", 'no-restricted-imports'],
  ['import two levels up', "import '../../../analysis/src/index.ts';", 'no-restricted-imports'],
];

const allowed = [
  "import { TICK_HZ } from '../version.ts';",
  "import { NESTED } from './sub/nested.ts';",
  'export const a = Math.sqrt(2) + Math.floor(1.5) + Math.imul(3, 5) + TICK_HZ + NESTED;',
  'export const b = (7 * 3) | 0;',
].join('\n');

type Diagnostic = { code: string; filename: string };
let byFile = new Map<string, string[]>();

beforeAll(() => {
  mkdirSync(`${coreProbe}sub/`, { recursive: true });
  mkdirSync(clientProbe, { recursive: true });
  const files = new Map<string, string>([
    ...rejected.map(([, code], i) => [`${coreProbe}case${i}.ts`, code] as const),
    [`${coreProbe}allowed.ts`, allowed],
    [`${coreProbe}sub/nested.ts`, 'export const NESTED = 1;'],
    [`${clientProbe}random.ts`, 'export const x = Math.random();'],
  ]);
  for (const [file, code] of files) writeFileSync(file, code);

  let out: string;
  try {
    // Pass files, not folders: oxlint skips git-ignored folders when it walks a directory.
    out = execFileSync('pnpm', ['exec', 'oxlint', '--format', 'json', ...files.keys()], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
  } catch (err) {
    // oxlint exits non-zero when it finds errors, which is the point here.
    out = (err as { stdout: string }).stdout;
  }
  const { diagnostics } = JSON.parse(out) as { diagnostics: Diagnostic[] };
  byFile = new Map();
  for (const d of diagnostics) {
    const file = d.filename.split('/').slice(-2).join('/');
    byFile.set(file, [...(byFile.get(file) ?? []), d.code]);
  }
});

afterAll(() => {
  rmSync(coreProbe, { recursive: true, force: true });
  rmSync(clientProbe, { recursive: true, force: true });
});

describe('core determinism lint', () => {
  it.each(rejected.map((c, i) => [...c, i] as const))('rejects %s', (_name, _code, rule, i) => {
    const codes = byFile.get(`__lint_probe__/case${i}.ts`) ?? [];
    expect(codes.some((c) => c.endsWith(`(${rule})`))).toBe(true);
  });

  it('allows the deterministic subset', () => {
    expect(byFile.get('__lint_probe__/allowed.ts') ?? []).toEqual([]);
  });

  it('does not apply core rules outside core', () => {
    expect(byFile.get('__lint_probe__/random.ts') ?? []).toEqual([]);
  });
});
