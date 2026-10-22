// US units on every screen (ADR-172): a site's circle kept in meters reads and is typed in feet.
import { describe, expect, it } from 'vitest';

import { UsUnits } from '../src/units.ts';

describe('US units', () => {
  it('reads meters as whole feet and whole feet as meters, the international foot', () => {
    expect(UsUnits.feetOf(150)).toBe(492);
    expect(UsUnits.metersOf(492)).toBe(150);
    expect(UsUnits.feetOf(0)).toBe(0);
    expect(UsUnits.metersOf(1000)).toBe(305);
  });
});
