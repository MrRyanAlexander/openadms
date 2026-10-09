// What a new read-only viewer starts with (spec/acceptance/02-people-and-devices.md AC-02-75;
// ADR-328, 336).
import { describe, expect, it } from 'vitest';

import { ViewerSettings } from '../src/index.ts';

describe('a new read-only viewer', () => {
  it('AC-02-75 sees private citizens by name until the firm says otherwise', () => {
    expect(ViewerSettings.starting().seesPrivateCitizens).toBe(true);
    expect(new ViewerSettings(false).seesPrivateCitizens).toBe(false);
  });
});
