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
      // The API as a process (ADR-385): its settings and its error filter need nothing; the door
      // (HTTPS through Caddy, the log) needs the stack up and the installation, and says so.
      // Its files run one at a time (ADR-415): each test's work is one open piece of work on the
      // installation's database with the example world's people in it, and the database keeps
      // two who sign in from one email address, so a second file's Dana would wait for the first's.
      { test: { name: '@open-adms/api', root: 'apps/api', fileParallelism: false } },
      // The worker's questions to the map servers (ADR-349): they need the stack up too.
      'apps/worker',
      // The database tests (ADR-272) need the local stack and an installation at head. Their files
      // run one at a time: a refused truncate takes a table lock another file's open work could
      // deadlock on.
      { test: { name: '@open-adms/db', root: 'packages/db', fileParallelism: false } },
      // The scenario harness (ADR-275): its stories need the same, and each makes its own database.
      'packages/scenarios',
    ],
  },
});
