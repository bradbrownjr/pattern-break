import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TABLES_PATH, generateSpectrumTables } from '../../../tools/gen-spectrum-tables.ts';

describe('tables.generated.ts', () => {
  it('matches what tools/gen-spectrum-tables.ts generates (run `pnpm gen:tables` if not)', () => {
    expect(readFileSync(TABLES_PATH, 'utf8')).toBe(generateSpectrumTables());
  });
});
