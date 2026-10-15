// Setup step 7 (spec/parts/01-setup.md; ADR-111, 145, 215, 222, 298, 311): a disposal site,
// entered on each project that uses it, with its site type, the four site facts, its GPS, a permit
// and its dates; and the link from a site that charges a tipping fee to its tipping fee pay item.
// Before it saves, setup asks packages/domain's SiteFacts: Haul-outs leave here can be ticked only
// on a TDSR/DMS site, and a marked site's type can't change away from it. A site states its
// type's built-in key again, which is how the database holds the same rule.
import type {
  DisposalSite,
  DisposalSiteLabel,
  DisposalSiteTippingFee,
  Prisma,
  SiteAreaSource,
  SiteAreaVersion,
} from '@open-adms/db';
import { type BuiltInKey, MapShapes, SiteFacts, type SiteSetting } from '@open-adms/domain';

import { archiveChange, day, type Outcome, QueueingService, Refused } from './setup-service.ts';

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
    // Calendar days in the project's time zone; the close date may be emptied.
    readonly activationDate: string;
    readonly closeDate: string | null;
  }
>;

// A site's own shape, as drawn on the map or as a file gave it: GeoJSON, a geometry, a Feature
// or a FeatureCollection.
export interface NewSiteShape {
  readonly source: SiteAreaSource;
  readonly shape: unknown;
  // The file's name, or the Esri layer's address; and where the file it came from is kept
  // (ADR-527 (10)).
  readonly sourceName?: string | null;
  readonly uploadedFileKey?: string;
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

  // A change to a site the project holds, audited with the value before. A close date before
  // the activation date is the database's to refuse: the call throws, and nothing is saved.
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
      const { activationDate, closeDate, ...others } = changes;
      const changed = await tx.disposalSite.update({
        where: { id: siteId },
        data: {
          ...others,
          ...(activationDate === undefined ? {} : { activationDate: day(activationDate) }),
          ...(closeDate === undefined
            ? {}
            : { closeDate: closeDate === null ? null : day(closeDate) }),
          siteTypeKey: type.siteTypeKey,
        },
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
          sourceName: input.sourceName ?? null,
          uploadedFileKey: input.uploadedFileKey ?? null,
          createdById: person,
          effectiveFrom: this.clock.now(),
        },
      });
      await this.setupChanged(tx, person, site.projectId, { siteId });
      return version;
    });
  }

  // The site keeps the link to a tipping fee pay item written from it: how a fee line is told from
  // a hauling line. A site may keep several (ADR-222, 311, 312). A link taken off is given back
  // on its own row (ADR-527 (9)); one that stands is answered as it is.
  tippingFee(
    person: string,
    siteId: string,
    payItemId: string,
  ): Promise<Outcome<DisposalSiteTippingFee>> {
    return this.setup(person, async (tx) => {
      const site = await tx.disposalSite.findUniqueOrThrow({ where: { id: siteId } });
      const held = await tx.disposalSiteTippingFee.findUnique({
        where: { siteId_payItemId: { siteId, payItemId } },
      });
      if (held?.archivedAt === null) return held;
      const link =
        held === null
          ? await tx.disposalSiteTippingFee.create({
              data: { projectId: site.projectId, siteId, payItemId },
            })
          : await tx.disposalSiteTippingFee.update({
              where: { id: held.id },
              data: { archivedAt: null },
            });
      await this.setupChanged(tx, person, site.projectId, { siteId });
      return link;
    });
  }

  // The link taken off: the site's fee lines are told from its hauling lines without it.
  archiveTippingFee(
    person: string,
    siteId: string,
    payItemId: string,
  ): Promise<Outcome<DisposalSiteTippingFee>> {
    return this.setup(person, async (tx) => {
      const held = await tx.disposalSiteTippingFee.findUniqueOrThrow({
        where: { siteId_payItemId: { siteId, payItemId } },
      });
      const change = archiveChange(held.archivedAt, true, this.clock.now());
      if (change === null) return held;
      const link = await tx.disposalSiteTippingFee.update({ where: { id: held.id }, data: change });
      await this.setupChanged(tx, person, held.projectId, { siteId });
      return link;
    });
  }

  // Archived: off new picks; its field events still point at it, and a rule that picks it is not
  // valid while it is (ADR-357). Put back as it was. Its tickets are queued, and the project's
  // where a rule picks it (ADR-527 (9)). Twice writes nothing.
  archive(person: string, siteId: string, archive: boolean): Promise<Outcome<DisposalSite>> {
    return this.setup(person, async (tx) => {
      const site = await tx.disposalSite.findUniqueOrThrow({ where: { id: siteId } });
      const change = archiveChange(site.archivedAt, archive, this.clock.now());
      if (change === null) return site;
      const changed = await tx.disposalSite.update({ where: { id: siteId }, data: change });
      const picked = await this.projectsPicking(tx, { disposalSiteId: siteId });
      await this.setupChanged(
        tx,
        person,
        site.projectId,
        picked.length === 0 ? { siteId } : {},
        true,
      );
      return changed;
    });
  }

  // One of the firm's own labels on the site (AC-01-58): given, or given back on its own row.
  // It changes nothing the system does, so nothing is queued.
  label(person: string, siteId: string, siteLabelId: string): Promise<Outcome<DisposalSiteLabel>> {
    return this.setup(person, async (tx) => {
      const held = await tx.disposalSiteLabel.findUnique({
        where: { siteId_siteLabelId: { siteId, siteLabelId } },
      });
      if (held === null) return tx.disposalSiteLabel.create({ data: { siteId, siteLabelId } });
      if (held.archivedAt === null) return held;
      return tx.disposalSiteLabel.update({ where: { id: held.id }, data: { archivedAt: null } });
    });
  }

  archiveLabel(
    person: string,
    siteId: string,
    siteLabelId: string,
  ): Promise<Outcome<DisposalSiteLabel>> {
    return this.setup(person, async (tx) => {
      const held = await tx.disposalSiteLabel.findUniqueOrThrow({
        where: { siteId_siteLabelId: { siteId, siteLabelId } },
      });
      const change = archiveChange(held.archivedAt, true, this.clock.now());
      return change === null
        ? held
        : tx.disposalSiteLabel.update({ where: { id: held.id }, data: change });
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
