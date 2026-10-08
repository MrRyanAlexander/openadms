// Setup step 7 (spec/parts/01-setup.md; ADR-111, 145, 215, 222, 298, 311): a disposal site,
// entered on each project that uses it, with its site type, the four site facts, its GPS, a permit
// and its dates; and the link from a site that charges a tipping fee to its tipping fee pay item.
// Before it saves, setup asks packages/domain's SiteFacts: Haul-outs leave here can be ticked only
// on a TDSR/DMS site, and a marked site's type can't change away from it. A site states its
// type's built-in key again, which is how the database holds the same rule.
import type {
  DisposalSite,
  DisposalSiteTippingFee,
  Prisma,
  SiteAreaSource,
  SiteAreaVersion,
} from '@open-adms/db';
import { type BuiltInKey, MapShapes, SiteFacts, type SiteSetting } from '@open-adms/domain';

import { day, type Outcome, QueueingService, Refused } from './setup-service.ts';

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
    // The site's GPS corrected: WGS84, exact decimals.
    readonly latitude: string;
    readonly longitude: string;
  }
>;

// A site's own shape, as drawn on the map or as a file gave it: GeoJSON, a geometry, a Feature
// or a FeatureCollection.
export interface NewSiteShape {
  readonly source: SiteAreaSource;
  readonly shape: unknown;
}

// A site added or changed is checked by the worker's next run (its permit; where its tickets'
// debris went, their area and their mileage): the job is queued in the same piece of work,
// naming the un-invoiced tickets with a field event at the site (ADR-090, 420; AC-06-03).
export class SiteSetup extends QueueingService {
  site(person: string, input: NewSite): Promise<Outcome<DisposalSite>> {
    return this.setup(person, async (tx) => {
      const type = await SiteSetup.typeOf(tx, input.siteTypeId);
      SiteSetup.checked({ ...type, name: input.name, haulOutsLeaveHere: input.haulOutsLeaveHere });
      const site = await tx.disposalSite.create({
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
      // No ticket is at a new site yet: the job is for its own flag, a permit outstanding.
      await this.setupChanged(tx, person, site.projectId, { siteId: site.id }, true);
      return site;
    });
  }

  // A change to a site the project holds, audited with the value before.
  change(person: string, siteId: string, changes: SiteChanges): Promise<Outcome<DisposalSite>> {
    return this.setup(person, async (tx) => {
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
      const changed = await tx.disposalSite.update({
        where: { id: siteId },
        data: { ...changes, siteTypeKey: type.siteTypeKey },
      });
      await this.setupChanged(tx, person, site.projectId, { siteId }, true);
      return changed;
    });
  }

  // The site's own shape, as its next version: from then on the site is checked against the
  // shape in place of the project's circle, and an earlier shape stays as it was (ADR-142, 144;
  // AC-01-56, AC-06-47). What isn't a shape isn't saved. The un-invoiced tickets with a field
  // event at the site are queued.
  shape(person: string, siteId: string, input: NewSiteShape): Promise<Outcome<SiteAreaVersion>> {
    return this.setup(person, async (tx) => {
      const site = await tx.disposalSite.findUniqueOrThrow({ where: { id: siteId } });
      const shape = new MapShapes(input.shape).shape();
      if (shape.read === null) {
        throw new Refused({ code: 'SITE_SHAPE_NOT_READ', message: `Not saved: ${shape.problem}` });
      }
      const last = await tx.siteAreaVersion.aggregate({
        where: { siteId },
        _max: { version: true },
      });
      const version = await tx.siteAreaVersion.create({
        data: {
          siteId,
          version: (last._max.version ?? 0) + 1,
          geometry: shape.read.geometry satisfies Prisma.InputJsonObject,
          ...shape.read.box,
          source: input.source,
          createdById: person,
          effectiveFrom: this.clock.now(),
        },
      });
      await this.setupChanged(tx, person, site.projectId, { siteId });
      return version;
    });
  }

  // The site keeps the link to a tipping fee pay item written from it: how a fee line is told from
  // a hauling line. A site may keep several (ADR-222, 311, 312).
  tippingFee(
    person: string,
    siteId: string,
    payItemId: string,
  ): Promise<Outcome<DisposalSiteTippingFee>> {
    return this.setup(person, async (tx) => {
      const site = await tx.disposalSite.findUniqueOrThrow({ where: { id: siteId } });
      const link = await tx.disposalSiteTippingFee.create({
        data: { projectId: site.projectId, siteId, payItemId },
      });
      await this.setupChanged(tx, person, site.projectId, { siteId });
      return link;
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
