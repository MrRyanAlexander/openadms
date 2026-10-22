// The golden mission's review through the back office's screens (spec/golden/MISSION.md §2, §4;
// ADR-603): its build for its own world against the mission's world (e2e/mission-world-setup.ts),
// told to Wednesday morning with nothing reviewed. A run of its own, after the screens' run
// (playwright.config.ts) in `pnpm e2e`: the stories' address is served by one world at a time,
// and the mission's tickets, ledger and clock are its own. One worker, its tests in order. Each
// screen it reaches is checked as every run's are, and said in its own line; a screen it doesn't
// reach is the screens' run's to check.
import { defineConfig, devices } from '@playwright/test';

import { launched } from './e2e/browser.ts';
import { worldPageOrigin } from './e2e/world.ts';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.mission.ts',
  globalSetup: './e2e/mission-world-setup.ts',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['./e2e/screens.ts', { run: 'the golden mission' }]],
  outputDir: '../../.cache/adms/e2e-office-mission',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: worldPageOrigin,
    serviceWorkers: 'block',
    launchOptions: await launched(),
  },
});
