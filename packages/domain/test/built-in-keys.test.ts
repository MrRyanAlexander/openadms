import { describe, expect, it } from 'vitest';

import { builtInKeys } from '../src/index.ts';

describe('the built-in keys', () => {
  it('AC-01-32 are six: the kind of work Stumps, two site types, three survey work types', () => {
    expect(builtInKeys).toEqual({
      kindOfWork: ['STUMPS'],
      siteType: ['TDSR', 'FINAL_DISPOSAL'],
      surveyWorkType: ['PRE_WORK', 'POST_WORK', 'ROE'],
    });
  });

  it('are written as keys, never as names, and none twice in its list', () => {
    for (const [list, keys] of Object.entries(builtInKeys)) {
      for (const key of keys) expect(key, list).toMatch(/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/);
      expect(new Set(keys).size, list).toBe(keys.length);
    }
  });
});
