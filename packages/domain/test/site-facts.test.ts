// Haul-outs leave only from a TDSR/DMS site, at the domain (spec/acceptance/01-setup.md AC-01-54;
// ADR-298, 311). The sites are P1's as the golden mission §1 sets them up: Marsh Road TDSR
// (TDSR/DMS) and Bayline County Landfill (Final Disposal). The database refuses the same two
// settings (packages/db's sites.test.ts); this is what setup says first.
import { describe, expect, it } from 'vitest';

import { type SiteSetting, SiteFacts } from '../src/index.ts';

const marshRoad: SiteSetting = {
  name: 'Marsh Road TDSR',
  siteTypeName: 'TDSR/DMS',
  siteTypeKey: 'TDSR',
  haulOutsLeaveHere: true,
};
const landfill: SiteSetting = {
  name: 'Bayline County Landfill',
  siteTypeName: 'Final Disposal',
  siteTypeKey: 'FINAL_DISPOSAL',
  haulOutsLeaveHere: false,
};

describe('Haul-outs leave here', () => {
  it('AC-01-54 ticked on Bayline County Landfill (Final Disposal), setup refuses it', () => {
    expect(new SiteFacts({ ...landfill, haulOutsLeaveHere: true }).check(landfill)).toEqual({
      code: 'HAUL_OUTS_ONLY_FROM_TDSR',
      message:
        'Bayline County Landfill is a Final Disposal site: only a TDSR/DMS site can be marked Haul-outs leave here. A haul-out is reduced debris leaving a TDSR.',
    });
  });

  it('AC-01-54 ticked on Marsh Road TDSR (TDSR/DMS), it is saved, new or changed', () => {
    expect(new SiteFacts(marshRoad).check()).toBeNull();
    expect(new SiteFacts(marshRoad).check({ ...marshRoad, haulOutsLeaveHere: false })).toBeNull();
  });

  it('AC-01-54 Marsh Road’s type changed away from TDSR/DMS while it is ticked, setup refuses that too', () => {
    const asTransferStation: SiteSetting = {
      ...marshRoad,
      siteTypeName: 'Transfer Station',
      siteTypeKey: null,
    };
    expect(new SiteFacts(asTransferStation).check(marshRoad)).toEqual({
      code: 'HAUL_OUTS_ONLY_FROM_TDSR',
      message:
        'Marsh Road TDSR is marked Haul-outs leave here, so it stays a TDSR/DMS site. Untick Haul-outs leave here before changing its type.',
    });
    // Unticked first, the type may change.
    expect(
      new SiteFacts({ ...asTransferStation, haulOutsLeaveHere: false }).check({
        ...marshRoad,
        haulOutsLeaveHere: false,
      }),
    ).toBeNull();
  });

  it('a site of the firm’s own type, with no key, can’t be marked, whatever the firm calls it', () => {
    const staging: SiteSetting = {
      name: 'Old Quarry Pit',
      siteTypeName: 'TDSR',
      siteTypeKey: null,
      haulOutsLeaveHere: true,
    };
    expect(new SiteFacts(staging).check()?.code).toBe('HAUL_OUTS_ONLY_FROM_TDSR');
  });

  it('a site not marked is saved, whatever its type', () => {
    expect(new SiteFacts(landfill).check()).toBeNull();
    expect(new SiteFacts({ ...marshRoad, haulOutsLeaveHere: false }).check()).toBeNull();
  });
});
