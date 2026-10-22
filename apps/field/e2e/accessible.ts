// The field app's accessibility check (BACKLOG 3.1.3; ADR-566; AC-11-51; item 3.10.2): the look's
// (@open-adms/look/testing), with the app's screens reporter and the hand review's instrument.
// Every browser test imports `test` from here.
import { accessibilityChecks } from '@open-adms/look/testing';

import { reviewScreen } from './review.ts';
import { reporterFile } from './screens.ts';

export const { test, checkScreen, expect } = accessibilityChecks({
  reporterFile,
  review: reviewScreen,
});
