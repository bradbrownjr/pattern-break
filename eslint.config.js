// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * Determinism guard for packages/core (PLAN.md §4, §5).
 * core must produce bit-identical output in every engine, so it may not touch
 * clocks, randomness, transcendental Math, host/DOM globals, or external modules.
 */
const BANNED_MATH = [
  'random',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'exp', 'expm1', 'log', 'log1p', 'log2', 'log10',
  'pow', 'cbrt', 'hypot',
];

const BANNED_GLOBALS = [
  'Date', 'performance', 'Intl', 'crypto', 'process',
  'globalThis', 'window', 'self', 'document', 'navigator', 'location',
  'setTimeout', 'setInterval', 'requestAnimationFrame', 'queueMicrotask',
  'fetch', 'WebAssembly', 'SharedArrayBuffer', 'Atomics',
];

const coreDeterminism = {
  files: ['packages/core/src/**/*.ts'],
  languageOptions: {
    // ES builtins only; no browser or Node globals.
    globals: { ...globals.es2022 },
  },
  rules: {
    'no-restricted-properties': [
      'error',
      ...BANNED_MATH.map((property) => ({
        object: 'Math',
        property,
        message: `Math.${property} is non-deterministic across engines or banned in core. Use a precomputed table from /tools or integer math.`,
      })),
    ],
    'no-restricted-globals': [
      'error',
      ...BANNED_GLOBALS.map((name) => ({
        name,
        message: `${name} is not allowed in packages/core (determinism). Pass values in from the caller.`,
      })),
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector: "BinaryExpression[operator='**']",
        message: '`**` is Math.pow. Use integer multiplication or a lookup table in core.',
      },
      {
        selector: "AssignmentExpression[operator='**=']",
        message: '`**=` is Math.pow. Use integer multiplication or a lookup table in core.',
      },
      {
        selector: "MemberExpression[object.name='Math'][computed=true]",
        message: 'Computed Math access bypasses the determinism lint. Call Math methods by name.',
      },
      {
        selector: "VariableDeclarator[init.name='Math']",
        message: 'Aliasing Math bypasses the determinism lint. Call Math methods directly.',
      },
    ],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            regex: '^(?!\\.)',
            message: 'packages/core may only use relative imports (no npm, node:, or other workspace packages).',
          },
        ],
      },
    ],
  },
};

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.wasm', '**/vendor/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
  },
  {
    // Tooling, tests, server, analysis: Node globals. core/src gets none (see below).
    ignores: ['packages/core/src/**', 'packages/client/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['packages/client/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  coreDeterminism,
);
