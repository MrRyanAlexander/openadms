import { workspace as domainWorkspace } from '@open-adms/domain';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

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

  // That it is told before any schema is made (index.ts's first import), so that Zod never tries,
  // is seen in the browser, whose policy reports every try (apps/field/e2e/door.e2e.ts); here,
  // that it is told so on a page alone.
  it('AC-11-61: on a page, Zod is told to make no code from a string; a server keeps its shortcut', async () => {
    expect(z.config().jitless).not.toBe(true);
    const page = globalThis as { document?: unknown };
    page.document = {};
    try {
      vi.resetModules();
      await import('../src/on-a-page.ts');
      expect(z.config().jitless).toBe(true);
      expect(wiringProbe.parse({ workspace: 'contracts', dependsOn: 'domain' })).toEqual({
        workspace: 'contracts',
        dependsOn: 'domain',
      });
    } finally {
      delete page.document;
      z.config({ jitless: false });
    }
  });
});
