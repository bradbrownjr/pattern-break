// Oxlint JS plugin: the determinism checks for packages/core that Oxlint has no
// built-in rule for. The built-in half (globals, Math properties) is in
// .oxlintrc.json. See docs/PLAN.md "Determinism rules".

import { dirname, resolve, sep } from 'node:path';

/**
 * @param {string} message
 * @param {Record<string, (node: any) => boolean>} visitors node type -> test
 */
function rule(message, visitors) {
  return {
    meta: { type: 'problem' },
    create(/** @type {any} */ context) {
      /** @type {Record<string, (node: any) => void>} */
      const handlers = {};
      for (const [type, test] of Object.entries(visitors)) {
        handlers[type] = (node) => {
          if (test(node)) context.report({ node, message });
        };
      }
      return handlers;
    },
  };
}

const isMath = (/** @type {any} */ n) => n?.type === 'Identifier' && n.name === 'Math';

const CORE_SRC = `${sep}packages${sep}core${sep}src${sep}`;

/** Every import must be relative and must resolve to a file inside packages/core/src. */
const importsStayInCore = {
  meta: { type: 'problem' },
  create(/** @type {any} */ context) {
    const file = resolve(context.filename);
    const at = file.indexOf(CORE_SRC);
    const root = at === -1 ? null : file.slice(0, at + CORE_SRC.length);
    /** @param {any} node */
    const check = (node) => {
      const spec = node.source?.value;
      if (typeof spec !== 'string' || root === null) return;
      const relative = spec.startsWith('./') || spec.startsWith('../');
      if (!relative) {
        context.report({ node, message: `"${spec}": packages/core may only use relative imports (no npm, node:, or other workspace packages).` });
      } else if (!resolve(dirname(file), spec).startsWith(root)) {
        context.report({ node, message: `"${spec}" resolves outside packages/core/src.` });
      }
    };
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

export default {
  meta: { name: 'determinism' },
  rules: {
    'imports-stay-in-core': importsStayInCore,
    'no-pow-operator': rule(
      'The ** operator is Math.pow. Use integer multiplication or a lookup table in core.',
      {
        BinaryExpression: (n) => n.operator === '**',
        AssignmentExpression: (n) => n.operator === '**=',
      },
    ),
    'no-computed-math': rule(
      'Computed Math access gets around the banned-function list. Call Math methods by name.',
      { MemberExpression: (n) => n.computed && isMath(n.object) },
    ),
    'no-math-alias': rule(
      'Aliasing or destructuring Math gets around the banned-function list. Call Math methods directly.',
      { VariableDeclarator: (n) => isMath(n.init) },
    ),
  },
};
