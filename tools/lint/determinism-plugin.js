// Oxlint JS plugin: the determinism checks for packages/core that Oxlint has no
// built-in rule for. The built-in half (globals, Math properties, imports) is in
// .oxlintrc.json. See docs/PLAN.md "Determinism rules".

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

export default {
  meta: { name: 'determinism' },
  rules: {
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
