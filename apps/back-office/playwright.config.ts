// The back office's browser end-to-end tests (ARCHITECTURE §14, §15): its build for its own world
// (dist/world, served by the stack's proxy at office-world.adms.localhost) against the world the
// scenario harness makes for the run (e2e/world-setup.ts), over HTTPS, in Chromium's headless
// shell at a desk's size. A test's name starts with what it proves. Every screen a test reaches is
// checked against WCAG 2.2 A and AA in both themes, at 320 CSS px and 200% text (e2e/accessible.ts),
// and a screen no test reaches fails the run (e2e/screens.ts). The installation's database is
// never written by a browser test.
import { defineConfig, devices } from '@playwright/test';

import { launched } from './e2e/browser.ts';
import { worldPageOrigin } from './e2e/world.ts';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  globalSetup: './e2e/world-setup.ts',
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['./e2e/screens.ts']],
  outputDir: '../../.cache/adms/e2e-office',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: worldPageOrigin,
    serviceWorkers: 'block',
    launchOptions: await launched(),
  },
});
