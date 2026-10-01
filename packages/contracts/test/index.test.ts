import { workspace as domainWorkspace } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { wiringProbe } from '../src/index.ts';

describe('contracts', () => {
  it('reads domain through the workspace dependency', () => {
    expect(domainWorkspace).toBe('domain');
  });

  it('accepts a payload that matches its schema', () => {
    expect(wiringProbe.parse({ workspace: 'contracts', dependsOn: 'domain' })).toEqual({
      workspace: 'contracts',
      dependsOn: 'domain',
    });
  });

  it('refuses a payload that does not', () => {
    const result = wiringProbe.safeParse({ workspace: 'contracts', dependsOn: 'db' });
    expect(result.success).toBe(false);
  });
});
