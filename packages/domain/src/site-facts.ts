// What setup lets a disposal site hold among its facts (spec/parts/01-setup.md step 7; ADR-215,
// 298, 311). A haul-out is reduced debris leaving a TDSR for a different site, never a trip from
// one landfill to another or back to the site it left: so *Haul-outs leave here* can be ticked only
// on a site whose type is the built-in TDSR/DMS, known by its key, never its name (ADR-194). Setup
// refuses it anywhere else, and won't change a marked site's type away from TDSR/DMS while it's
// marked. The database refuses both too (the sites' guard migration); this says why, in plain
// words. Field work is never refused: a haul-out from an unmarked site is flagged (ADR-052).

import type { BuiltInKey } from './built-in-keys.ts';

// A site as setup holds the facts this rule reads.
export interface SiteSetting {
  // "Bayline County Landfill", as the messages say it.
  readonly name: string;
  // The site type's name as the firm has it ("Final Disposal"), and its built-in key, if any.
  readonly siteTypeName: string;
  readonly siteTypeKey: BuiltInKey<'siteType'> | null;
  readonly haulOutsLeaveHere: boolean;
}

// A setting setup won't save, and why (the only refusals setup makes are bad settings, AC-01-80).
export interface SiteRefusal {
  readonly code: 'HAUL_OUTS_ONLY_FROM_TDSR';
  readonly message: string;
}

export class SiteFacts {
  private readonly site: SiteSetting;

  constructor(site: SiteSetting) {
    this.site = site;
  }

  // What setup says as it saves the site: a new one (no `before`), or a change to the one it holds.
  // Null when the site may be saved as it is.
  check(before: SiteSetting | null = null): SiteRefusal | null {
    const { site } = this;
    if (!site.haulOutsLeaveHere || site.siteTypeKey === 'TDSR') return null;
    if (before !== null && before.haulOutsLeaveHere && before.siteTypeKey === 'TDSR') {
      return {
        code: 'HAUL_OUTS_ONLY_FROM_TDSR',
        message: `${before.name} is marked Haul-outs leave here, so it stays a ${before.siteTypeName} site. Untick Haul-outs leave here before changing its type.`,
      };
    }
    return {
      code: 'HAUL_OUTS_ONLY_FROM_TDSR',
      message: `${site.name} is a ${site.siteTypeName} site: only a TDSR/DMS site can be marked Haul-outs leave here. A haul-out is reduced debris leaving a TDSR.`,
    };
  }
}
