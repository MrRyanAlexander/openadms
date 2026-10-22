// Which screens the field app has, and which the browser tests reached (BACKLOG 3.1.3; ADR-566;
// AC-11-51): the look's screens reporter (@open-adms/look/testing) over the app's own source. A run
// of some tests alone (`-g`) says so with `ADMS_E2E_SOME=1`. The golden mission's run
// (playwright.mission.config.ts; ADR-603) says so in its own line.
import { fileURLToPath } from 'node:url';

import { ScreensReached, type ScreensOptions } from '@open-adms/look/testing';

export const reporterFile = fileURLToPath(import.meta.url);
export const sources = [fileURLToPath(new URL('../src', import.meta.url))];

export default class FieldScreens extends ScreensReached {
  constructor(options: ScreensOptions = {}) {
    super(sources, options);
  }
}
