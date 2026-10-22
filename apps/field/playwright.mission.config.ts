// The golden mission's browser end-to-end run (spec/golden/MISSION.md; PLAN item 3.10.1;
// ADR-564, 603): the field app's browser build against a world of the mission's own
// (e2e/mission-world.ts), which its one test file makes and closes. A run of its own, after the
// screens' run (playwright.config.ts) in `pnpm e2e`: the stories' address is served by one world
// at a time, and the mission's numbers, ledger and clock are its own. One worker, its tests in
// order (the mission's days). Each screen it reaches is checked as every run's are, and said in
// its own line; a screen it doesn't reach is the screens' run's to check.
import { defineConfig, devices } from '@playwright/test';

import { launched } from './e2e/browser.ts';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.mission.ts',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['./e2e/screens.ts', { run: 'the golden mission' }]],
  outputDir: '../../.cache/adms/e2e-mission',
  use: {
    ...devices['Pixel 7'],
    serviceWorkers: 'block',
    // The stack's certificates trusted by their keys; the fake camera allowed (e2e/browser.ts).
    launchOptions: await launched('allowed'),
  },
});
