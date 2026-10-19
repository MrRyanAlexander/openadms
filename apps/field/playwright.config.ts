// The browser end-to-end tests (ARCHITECTURE §15; ADR-564): the field app's browser build as the
// local stack serves it, over HTTPS through Caddy (`pnpm e2e`, after `pnpm ready`), in Chromium's
// headless shell, as a phone: a phone's screen, touch, a phone's browser. A test's name starts with
// the acceptance scenarios it proves. A test that writes (a phone enrolled, a monitor created) does
// so in the run's own world (e2e/world-setup.ts; ADR-572), never the installation's database.
import { defineConfig, devices } from '@playwright/test';

import { apiOrigin, fieldOrigin, trustedKeys } from './e2e/stack.ts';
import { worldApiOrigin } from './e2e/world.ts';

const keys = await trustedKeys(
  [fieldOrigin, apiOrigin, worldApiOrigin].map((origin) => new URL(origin).hostname),
);

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  globalSetup: './e2e/world-setup.ts',
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['./e2e/screens.ts']],
  outputDir: '../../.cache/adms/e2e',
  use: {
    ...devices['Pixel 7'],
    baseURL: fieldOrigin,
    serviceWorkers: 'block',
    launchOptions: { args: [`--ignore-certificate-errors-spki-list=${keys.join(',')}`] },
  },
});
