// Which screens the back office has, and which its browser tests reached: the look's screens
// reporter (@open-adms/look/testing) over the app's own source. A run of some tests alone (`-g`)
// says so with `ADMS_E2E_SOME=1`.
import { fileURLToPath } from 'node:url';

import { ScreensReached, type ScreensOptions } from '@open-adms/look/testing';

export const reporterFile = fileURLToPath(import.meta.url);
export const sources = [fileURLToPath(new URL('../src', import.meta.url))];

export default class OfficeScreens extends ScreensReached {
  constructor(options: ScreensOptions = {}) {
    super(sources, options);
  }
}
