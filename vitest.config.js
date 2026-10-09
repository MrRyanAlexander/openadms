// Open ADMS test runner (ADR-259): one run from the root, one project per tested workspace.
// A workspace joins this list when it gets its first test.
// @ts-check
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/domain',
      'packages/contracts',
      'tools/setup',
      'tools/security',
      // The local stack's map servers (ADR-282): they need the stack up, like the database tests.
      'infra/local',
      // The database tests (ADR-272) need the local stack and an installation at head. Their files
      // run one at a time: a refused truncate takes a table lock another file's open work could
      // deadlock on.
      { test: { name: '@open-adms/db', root: 'packages/db', fileParallelism: false } },
      // The scenario harness (ADR-275): its stories need the same, and each makes its own database.
      'packages/scenarios',
    ],
  },
});
