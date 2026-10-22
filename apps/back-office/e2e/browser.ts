// How the back office's tests launch Chromium (ADR-564): the stack's certificates trusted by the
// keys Node checked against its root (`trustedKeys`), never by taking any certificate.
import type { LaunchOptions } from '@playwright/test';
import { trustedKeys } from '@open-adms/look/testing';

import { worldApiOrigin, worldPageOrigin } from './world.ts';

export async function launched(): Promise<LaunchOptions> {
  const keys = await trustedKeys(
    [worldPageOrigin, worldApiOrigin].map((origin) => new URL(origin).hostname),
  );
  return { args: [`--ignore-certificate-errors-spki-list=${keys.join(',')}`] };
}
