// The browser end-to-end tests (ARCHITECTURE §15; ADR-564): the field app's browser build as the
// local stack serves it, over HTTPS through Caddy (`pnpm e2e`, after `pnpm ready`), in Chromium's
// headless shell, as a phone: a phone's screen, touch, a phone's browser. A test's name starts with
// the acceptance scenarios it proves.
import { defineConfig, devices } from '@playwright/test';

import { apiOrigin, fieldOrigin, trustedKeys } from './e2e/stack.ts';

const keys = await trustedKeys([new URL(fieldOrigin).hostname, new URL(apiOrigin).hostname]);

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  outputDir: '../../.cache/adms/e2e',
  use: {
    ...devices['Pixel 7'],
    baseURL: fieldOrigin,
    serviceWorkers: 'block',
    launchOptions: { args: [`--ignore-certificate-errors-spki-list=${keys.join(',')}`] },
  },
});
