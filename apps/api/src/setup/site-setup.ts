// Setup step 7 (spec/parts/01-setup.md; ADR-111, 145, 215, 222, 298, 311): a disposal site,
// entered on each project that uses it, with its site type, the four site facts, its GPS, a permit
// and its dates; and the link from a site that charges a tipping fee to its tipping fee pay item.
// Before it saves, setup asks packages/domain's SiteFacts: Haul-outs leave here can be ticked only
// on a TDSR/DMS site, and a marked site's type can't change away from it. A site states its
// type's built-in key again, which is how the database holds the same rule.
import type { DisposalSite, DisposalSiteTippingFee, Prisma } from '@open-adms/db';
import { type BuiltInKey, SiteFacts, type SiteSetting } from '@open-adms/domain';

import { day, type Outcome, Refused, SetupService } from './setup-service.ts';

// The four site facts: every one stated, none has a default (ADR-215).
export interface SiteFactSettings {
  readonly takesLoads: boolean;
  readonly haulOutsLeaveHere: boolean;
  readonly chargesTippingFee: boolean;
  readonly ineligibleSite: boolean;
}

export interface NewSite extends SiteFactSettings {
  readonly projectId: string;
  readonly name: string;
  readonly shortCode?: string;
  readonly siteTypeId: string;
  // Empty is "permit outstanding": saved, flagged later, never blocking (ADR-111).
  readonly permitNumber: string | null;
  // WGS84, exact decimals: "39.09000000".
  readonly latitude: string;
  readonly longitude: string;
  // Calendar days in the project's time zone.
  readonly activationDate: string;
  readonly closeDate?: string;
}

export type SiteChanges = Partial<
  SiteFactSettings & {
    readonly name: string;
    readonly shortCode: string | null;
    readonly siteTypeId: string;
    readonly permitNumber: string | null;
  }
>;

export class SiteSetup extends SetupService {
  site(person: string, input: NewSite): Promise<Outcome<DisposalSite>> {
    return this.write(person, async (tx) => {
      const type = await SiteSetup.typeOf(tx, input.siteTypeId);
      SiteSetup.checked({ ...type, name: input.name, haulOutsLeaveHere: input.haulOutsLeaveHere });
      return tx.disposalSite.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          shortCode: input.shortCode ?? null,
          siteTypeId: input.siteTypeId,
          siteTypeKey: type.siteTypeKey,
          takesLoads: input.takesLoads,
          haulOutsLeaveHere: input.haulOutsLeaveHere,
          chargesTippingFee: input.chargesTippingFee,
          ineligibleSite: input.ineligibleSite,
          permitNumber: input.permitNumber,
          latitude: input.latitude,
          longitude: input.longitude,
          activationDate: day(input.activationDate),
          closeDate: input.closeDate === undefined ? null : day(input.closeDate),
        },
      });
    });
  }

  // A change to a site the project holds, audited with the value before.
  change(person: string, siteId: string, changes: SiteChanges): Promise<Outcome<DisposalSite>> {
    return this.write(person, async (tx) => {
      const site = await tx.disposalSite.findUniqueOrThrow({ where: { id: siteId } });
      const before: SiteSetting = {
        ...(await SiteSetup.typeOf(tx, site.siteTypeId)),
        name: site.name,
        haulOutsLeaveHere: site.haulOutsLeaveHere,
      };
      const type = await SiteSetup.typeOf(tx, changes.siteTypeId ?? site.siteTypeId);
      SiteSetup.checked(
        {
          ...type,
          name: changes.name ?? site.name,
          haulOutsLeaveHere: changes.haulOutsLeaveHere ?? site.haulOutsLeaveHere,
        },
        before,
      );
      return tx.disposalSite.update({
        where: { id: siteId },
        data: { ...changes, siteTypeKey: type.siteTypeKey },
      });
    });
  }

  // The site keeps the link to a tipping fee pay item written from it: how a fee line is told from
  // a hauling line. A site may keep several (ADR-222, 311, 312).
  tippingFee(
    person: string,
    siteId: string,
    payItemId: string,
  ): Promise<Outcome<DisposalSiteTippingFee>> {
    return this.write(person, async (tx) => {
      const site = await tx.disposalSite.findUniqueOrThrow({ where: { id: siteId } });
      return tx.disposalSiteTippingFee.create({
        data: { projectId: site.projectId, siteId, payItemId },
      });
    });
  }

  private static async typeOf(
    tx: Prisma.TransactionClient,
    siteTypeId: string,
  ): Promise<Pick<SiteSetting, 'siteTypeName' | 'siteTypeKey'>> {
    const type = await tx.siteType.findUniqueOrThrow({ where: { id: siteTypeId } });
    // The key is one of the domain's closed set: only a release writes one (ADR-302).
    return { siteTypeName: type.name, siteTypeKey: type.key as BuiltInKey<'siteType'> | null };
  }

  private static checked(site: SiteSetting, before: SiteSetting | null = null): void {
    const refusal = new SiteFacts(site).check(before);
    if (refusal !== null) throw new Refused(refusal);
  }
}
