// The back office's accessibility check: the look's (@open-adms/look/testing), with the app's own
// screens reporter. Every browser test imports `test` from here.
import { accessibilityChecks } from '@open-adms/look/testing';

import { reporterFile } from './screens.ts';

export const { test, checkScreen, expect } = accessibilityChecks({ reporterFile });
