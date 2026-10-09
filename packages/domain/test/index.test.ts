import { describe, expect, it } from 'vitest';

import { workspace } from '../src/index.ts';

describe('domain', () => {
  it('is wired to the test runner', () => {
    expect(workspace).toBe('domain');
  });
});
