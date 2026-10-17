// A project's setup as it stands, asked two ways (spec/parts/01-setup.md, "The setup check" and
// "What each site's phones will ask for"; AC-01-69…77; BACKLOG 2.4.1, C74; ADR-229, 243, 357,
// 423): the setup check's list of what the setup leaves open, and what each site's phones ask
// for. Both rules are packages/domain's (SetupCheck, QuantityLookup); this reads the project's
// records into what they read, in one reading that writes nothing.
//
// It reads what the worker prices from, the same way: the rules through packages/db's RuleRows
// (ADR-359), every pay item with the rates and steps still on it, a prime's name as its
// contractor's record has it. The primes, contracts, forms, debris types and sites are the live
// ones; the pay items and the rules are all of them, each saying whether it is archived. No
// ticket is read, and nothing is kept: each answer is worked out from the setup as it is when
// asked (AC-01-77).
import { setupShownSchema } from '@open-adms/contracts';
import { RuleRows, type Database, type Prisma } from '@open-adms/db';
import {
  QuantityLookup,
  SetupCheck,
  type DumpedForm,
  type LookupSetup,
  type QuantityAsk,
  type SetupChecked,
  type SetupGap,
} from '@open-adms/domain';

const dumpedForms = ['LOAD', 'HAUL_OUT'] as const satisfies readonly DumpedForm[];

export class SetupStanding {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  // The setup check: everything the project's setup leaves open, none when it is whole. It
  // lists and never refuses (invariant 19).
  async gaps(projectId: string): Promise<SetupGap[]> {
    return new SetupCheck(await this.read(projectId)).gaps();
  }

  // What every site's phones ask for: a row for each live site, debris type of a load or
  // haul-out form, and prime.
  async quantityLookup(projectId: string): Promise<QuantityAsk[]> {
    return new QuantityLookup(await this.read(projectId)).entries();
  }

  // One site's rows: what its phones carry. A site taken off its project has none.
  quantityLookupAt(siteId: string): Promise<QuantityAsk[]> {
    return this.db.$read(async (tx) => {
      const site = await tx.disposalSite.findUniqueOrThrow({ where: { id: siteId } });
      return SetupStanding.quantityLookupIn(tx, site);
    });
  }

  // The same rows inside a piece of work that is already reading (a phone's lists).
  static async quantityLookupIn(
    tx: Prisma.TransactionClient,
    site: { readonly id: string; readonly projectId: string },
  ): Promise<QuantityAsk[]> {
    return new QuantityLookup(await SetupStanding.readIn(tx, site.projectId)).at(site.id);
  }

  // Every site's rows, inside a piece of work that is already reading (a setup version).
  static async quantityLookupOf(
    tx: Prisma.TransactionClient,
    projectId: string,
  ): Promise<QuantityAsk[]> {
    return new QuantityLookup(await SetupStanding.readIn(tx, projectId)).entries();
  }

  // One site's rows as its phones held them under a setup version of its project (ADR-453): what
  // a field event's version says its phone asked from, for the debris types phones are shown.
  // Read from the version as kept, never worked out again; null where the project has no such
  // version.
  quantityLookupUnder(siteId: string, setupVersion: number): Promise<QuantityAsk[] | null> {
    return this.db.$read(async (tx) => {
      const site = await tx.disposalSite.findUniqueOrThrow({ where: { id: siteId } });
      const kept = await tx.setupManifest.findUnique({
        where: { projectId_version: { projectId: site.projectId, version: setupVersion } },
        select: { content: true },
      });
      if (kept === null) return null;
      return setupShownSchema
        .parse(kept.content)
        .quantityLookup.filter((ask) => ask.siteId === site.id);
    });
  }

  // A project nobody has isn't read as one with nothing set up: the call throws.
  private read(projectId: string): Promise<SetupChecked & LookupSetup> {
    return this.db.$read(async (tx) => {
      await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true } });
      return SetupStanding.readIn(tx, projectId);
    });
  }

  // One query at a time: a piece of work has one connection. A client user's or an auditor's
  // read of the setup check and the lookup reads through it too, as the read-only login with the
  // viewer stated (ADR-535 (6)): only columns that login is granted.
  static async readIn(
    tx: Prisma.TransactionClient,
    projectId: string,
  ): Promise<SetupChecked & LookupSetup> {
    const live = { projectId, archivedAt: null };
    const rules = await new RuleRows(tx, projectId).entries();
    // A prime's name alone: a viewer's read is granted no contractor's contact details.
    const places = await tx.projectContractor.findMany({
      where: { ...live, asPrimeId: { not: null } },
      include: { contractor: { select: { name: true } } },
      orderBy: { id: 'asc' },
    });
    const contracts = await tx.contract.findMany({ where: live, orderBy: { id: 'asc' } });
    const forms = await tx.form.findMany({
      where: { ...live, documentType: { in: [...dumpedForms] } },
      include: {
        debrisTypes: {
          where: { archivedAt: null },
          include: { debrisType: true },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
    });
    const sites = await tx.disposalSite.findMany({
      where: live,
      include: { tippingFees: { where: { archivedAt: null }, orderBy: { id: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    const payItems = await tx.payItem.findMany({
      where: { projectId },
      include: {
        payableType: true,
        rates: { where: { archivedAt: null }, orderBy: { id: 'asc' } },
        crewDaySteps: { where: { archivedAt: null }, orderBy: { fromHours: 'asc' } },
      },
      orderBy: { code: 'asc' },
    });
    return {
      rules,
      primes: places.map((place) => ({ id: place.contractorId, name: place.contractor.name })),
      contracts: contracts.map((contract) => ({ id: contract.id, primeId: contract.primeId })),
      forms: forms.map((form) => ({
        id: form.id,
        form: form.documentType as DumpedForm,
        // A form's own entry, named as the firm's list names it: what a rule's Debris type
        // line picks.
        debrisTypes: form.debrisTypes.map((entry) => ({
          id: entry.id,
          name: entry.debrisType.name,
        })),
      })),
      sites: sites.map((site) => ({
        id: site.id,
        name: site.name,
        siteTypeId: site.siteTypeId,
        chargesTippingFee: site.chargesTippingFee,
        tippingFeePayItemIds: site.tippingFees.map((fee) => fee.payItemId),
      })),
      payItems: payItems.map((payItem) => ({
        id: payItem.id,
        code: payItem.code,
        unit: payItem.unit,
        countIsAlwaysOne: payItem.countIsAlwaysOne,
        quantityFromCarriedTickets: payItem.quantityFromCarriedTickets,
        crewTimeConversion: payItem.crewTimeConversion,
        crewDayHours: payItem.crewDayHours?.toString() ?? null,
        crewDaySteps: payItem.crewDaySteps.map((step) => ({
          fromHours: step.fromHours.toString(),
          toHours: step.toHours.toString(),
          quantity: step.quantity.toString(),
        })),
        rates: payItem.rates.map((rate) => ({ primeId: rate.primeId, rate: rate.rate.toFixed(4) })),
        payableType: { id: payItem.payableType.id, name: payItem.payableType.name },
        bandFrom: payItem.bandFrom?.toNumber() ?? null,
        bandTo: payItem.bandTo?.toNumber() ?? null,
        archived: payItem.archivedAt !== null,
      })),
    };
  }
}

// The setup check and the lookup, worked out from the setup a piece of work reads (a viewer's).
export function setupGapsOf(setup: SetupChecked & LookupSetup): SetupGap[] {
  return new SetupCheck(setup).gaps();
}

export function quantityAsksOf(setup: SetupChecked & LookupSetup): QuantityAsk[] {
  return new QuantityLookup(setup).entries();
}
