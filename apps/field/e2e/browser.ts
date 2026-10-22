// How the tests' Chromium is launched (ARCHITECTURE §15; ADR-564, 586): the stack's certificates
// trusted by the keys Node checked against its root (`trustedKeys`), never by taking any
// certificate; and Chromium's own fake camera standing in for the phone's. The headless shell has
// no prompt to ask whether the page may use the camera, so Chromium answers for the monitor:
// "yes" for every test (playwright.config.ts), "no" for a test of the camera refused, which runs
// in a browser of its own (`test.use`).
import type { LaunchOptions } from '@playwright/test';

import { apiOrigin, fieldOrigin, trustedKeys } from './stack.ts';
import { officeOrigin } from './office-desk.ts';
import { worldApiOrigin } from './world.ts';

export async function launched(camera: 'allowed' | 'refused'): Promise<LaunchOptions> {
  const keys = await trustedKeys(
    [fieldOrigin, apiOrigin, worldApiOrigin, officeOrigin].map(
      (origin) => new URL(origin).hostname,
    ),
  );
  return {
    args: [
      `--ignore-certificate-errors-spki-list=${keys.join(',')}`,
      '--use-fake-device-for-media-stream',
      camera === 'allowed'
        ? '--use-fake-ui-for-media-stream'
        : '--use-fake-ui-for-media-stream=deny',
    ],
  };
}
