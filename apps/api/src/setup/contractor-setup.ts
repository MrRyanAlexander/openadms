// Setup step 4 (spec/parts/01-setup.md; ADR-108, 146, 305): a contractor record, firm-wide; a
// prime added to a project; a contract, which is a name, its prime and an optional link. Subs
// aren't entered here: they are typed in at certification, under their prime.
//
// This is the one place that adds a prime to a project, and it writes the row's `asPrimeId` with
// it: the key a contract's prime, a rate's prime and a sub's prime are held to (ADR-305; C56).
// Beside it, `SubPlaces` is the one place that gives a sub its place: when it is typed in at
// certification, inside the piece of work that saves the certification (ADR-108, 321). Two
// spellings of one sub are merged here by the back office, and the merge queues the tickets of
// the certifications it moved (ADR-420, 426).
import type {
  Contract,
  Contractor,
  ContractorKind,
  ContractorPosition,
  Prisma,
  ProjectContractor,
} from '@open-adms/db';
import {
  type CertificationKind,
  CertificationSubs,
  ContractorMerge,
  FirmRecords,
  type ContractorPlace,
  type KnownContractor,
  type MergeParty,
  type SubTier,
} from '@open-adms/domain';

import {
  afterInNameOrder,
  archiveChange,
  type Found,
  type Outcome,
  paged,
  QueueingService,
  Refused,
  type Searched,
  type Warn,
} from './setup-service.ts';

const tierOf: Record<ContractorPosition, SubTier | null> = {
  PRIME: null,
  SUB_TIER_1: 1,
  SUB_TIER_2: 2,
};
const positionOf: Record<SubTier, ContractorPosition> = { 1: 'SUB_TIER_1', 2: 'SUB_TIER_2' };

// The subs a monitor types in at certification, under the prime they picked: each is matched to a
// contractor the firm already has, or made, and placed on the project in its tier under that prime
// (packages/domain's CertificationSubs says which). Runs inside the caller's piece of work.
export class SubPlaces {
  private readonly tx: Prisma.TransactionClient;
  private readonly projectId: string;
  private readonly prime: Pick<Contractor, 'id' | 'name'>;
  private readonly certifies: CertificationKind;
  private readonly warn: Warn;
  private readonly subs: CertificationSubs;

  constructor(
    tx: Prisma.TransactionClient,
    projectId: string,
    prime: Pick<Contractor, 'id' | 'name'>,
    certifies: CertificationKind,
    warn: Warn,
  ) {
    this.tx = tx;
    this.projectId = projectId;
    this.prime = prime;
    this.certifies = certifies;
    this.warn = warn;
    this.subs = new CertificationSubs(prime.id, prime.name);
  }

  // The contractors the two typed names are, each placed; null where nothing was typed.
  async named(
    firstTier: string | undefined,
    secondTier: string | undefined,
  ): Promise<{ firstTierSubId: string | null; secondTierSubId: string | null }> {
    const first = CertificationSubs.typed(firstTier);
    const second = CertificationSubs.typed(secondTier);
    const refusal = this.subs.check(first, second);
    if (refusal !== null) throw new Refused(refusal);
    return {
      firstTierSubId: first === null ? null : await this.placed(first, 1),
      secondTierSubId: second === null ? null : await this.placed(second, 2),
    };
  }

  private async placed(name: string, tier: SubTier): Promise<string> {
    const { tx, projectId, prime } = this;
    const decision = this.subs.place(name, tier, await this.known(name));
    const place = { projectId, position: positionOf[tier], primeId: prime.id };
    switch (decision.action) {
      case 'USE':
        if (decision.putBack) {
          await tx.projectContractor.update({
            where: { projectId_contractorId: { projectId, contractorId: decision.contractorId } },
            data: { archivedAt: null },
          });
        }
        return decision.contractorId;
      case 'PLACE':
        await tx.projectContractor.create({
          data: { ...place, contractorId: decision.contractorId },
        });
        return decision.contractorId;
      case 'ADD': {
        const contractor = await tx.contractor.create({
          data: { name: decision.name, kind: CertificationSubs.kindOfNewSub(this.certifies) },
        });
        await tx.projectContractor.create({ data: { ...place, contractorId: contractor.id } });
        if (decision.warning !== null) this.warn([decision.warning]);
        return contractor.id;
      }
    }
  }

  // The firm's contractors of that name, each with its place on this project.
  private async known(name: string): Promise<KnownContractor[]> {
    const { tx, projectId } = this;
    const named = await tx.contractor.findMany({
      where: { name: { equals: name, mode: 'insensitive' }, archivedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (named.length === 0) return [];
    const places = await tx.projectContractor.findMany({
      where: { projectId, contractorId: { in: named.map((contractor) => contractor.id) } },
    });
    const primes = await tx.contractor.findMany({
      where: {
        id: { in: places.flatMap((place) => (place.primeId === null ? [] : [place.primeId])) },
      },
    });
    return named.map((contractor) => {
      const place = places.find((candidate) => candidate.contractorId === contractor.id);
      return {
        id: contractor.id,
        name: contractor.name,
        place: place === undefined ? null : placeOf(place, primes),
      };
    });
  }
}

function placeOf(
  place: ProjectContractor,
  primes: readonly Pick<Contractor, 'id' | 'name'>[],
): ContractorPlace {
  return {
    tier: tierOf[place.position],
    primeId: place.primeId,
    primeName: primes.find((prime) => prime.id === place.primeId)?.name ?? null,
    archived: place.archivedAt !== null,
  };
}

export interface NewContractor {
  readonly name: string;
  // Whoever adds it says which: there is no default.
  readonly kind: ContractorKind;
  readonly contactName?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
}

// A contractor changed: only what is stated; a contact cleared with null.
export interface ContractorChanges {
  readonly name?: string;
  readonly kind?: ContractorKind;
  readonly contactName?: string | null;
  readonly contactEmail?: string | null;
  readonly contactPhone?: string | null;
}

export interface NewContract {
  readonly projectId: string;
  readonly name: string;
  // One of the project's primes, added to it first.
  readonly primeId: string;
  readonly signedCopyUrl?: string;
}

// A contract changed: its name and the link to its signed copy; its prime stays as entered
// (ADR-527 (2)).
export interface ContractChanges {
  readonly name?: string;
  readonly signedCopyUrl?: string | null;
}

export class ContractorSetup extends QueueingService {
  // A contractor the firm already has is picked, never entered again. A page at a time in name
  // order, those in service or the archived ones (ADR-527 (3)).
  findContractors(asked: Searched): Promise<Found<Contractor>> {
    return this.db.$read(async (tx) => {
      const last =
        asked.after === undefined
          ? null
          : await tx.contractor.findUnique({ where: { id: asked.after } });
      if (asked.after !== undefined && last === null) return { records: [], next: null };
      const rows = await tx.contractor.findMany({
        where: {
          name: { contains: asked.search, mode: 'insensitive' },
          archivedAt: asked.archived ? { not: null } : null,
          ...afterInNameOrder(last),
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: asked.limit + 1,
      });
      return paged(rows, asked.limit);
    });
  }

  contractor(person: string, input: NewContractor): Promise<Outcome<Contractor>> {
    return this.setup(person, (tx) =>
      tx.contractor.create({
        data: {
          name: input.name,
          kind: input.kind,
          contactName: input.contactName ?? null,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
        },
      }),
    );
  }

  // Its name, kind or contact, audited with the value before. A rule's pick shows a contractor by
  // its id, so nothing a ticket bills follows its name: nothing is queued.
  changeContractor(
    person: string,
    contractorId: string,
    changes: ContractorChanges,
  ): Promise<Outcome<Contractor>> {
    return this.setup(person, (tx) =>
      tx.contractor.update({ where: { id: contractorId }, data: changes }),
    );
  }

  // Off the searches and new picks; its places on projects stay (ADR-527 (1)). A rule that picks
  // it is gone while it is archived (ADR-357): each project whose rules pick it is queued. One
  // merged into another is never put back.
  archiveContractor(
    person: string,
    contractorId: string,
    archive: boolean,
  ): Promise<Outcome<Contractor>> {
    return this.setup(person, async (tx) => {
      const contractor = await tx.contractor.findUniqueOrThrow({ where: { id: contractorId } });
      if (!archive) {
        const refusal = new FirmRecords().putBackRefusal(contractor);
        if (refusal !== null) throw new Refused(refusal);
      }
      const change = archiveChange(contractor.archivedAt, archive, this.clock.now());
      if (change === null) return contractor;
      const changed = await tx.contractor.update({ where: { id: contractorId }, data: change });
      for (const projectId of await this.projectsPicking(tx, { contractorId })) {
        await this.setupChanged(tx, person, projectId);
      }
      return changed;
    });
  }

  addPrime(
    person: string,
    projectId: string,
    contractorId: string,
  ): Promise<Outcome<ProjectContractor>> {
    return this.setup(person, (tx) =>
      tx.projectContractor.create({
        data: { projectId, contractorId, position: 'PRIME', asPrimeId: contractorId },
      }),
    );
  }

  // Two spellings of one sub, typed at certification: `duplicateId` is merged into `keptId`. On
  // each project the duplicate is on, the kept contractor takes its place there (or keeps its
  // own), the certifications that named the duplicate name the kept one, and the duplicate's place
  // is taken off; then the duplicate is archived, pointing at the kept one. Nothing is deleted, and
  // every row changed is audited as the person (ADR-108, 321). A ticket's lines name the sub its
  // certification names, so on each project the tickets whose field events carry a certification
  // the merge moved are queued in the same piece of work, one locked as invoiced left as it is.
  merge(person: string, duplicateId: string, keptId: string): Promise<Outcome<Contractor>> {
    return this.setup(person, async (tx, warn) => {
      const merge = new ContractorMerge(
        await ContractorSetup.party(tx, duplicateId),
        await ContractorSetup.party(tx, keptId),
      );
      const refusal = merge.check();
      if (refusal !== null) throw new Refused(refusal);
      const now = this.clock.now();
      for (const move of merge.moves()) {
        const { projectId } = move;
        if (move.keptPlace === 'NEW') {
          await tx.projectContractor.create({
            data: {
              projectId,
              contractorId: keptId,
              position: positionOf[move.tier],
              primeId: move.primeId,
            },
          });
        } else if (move.keptPlace === 'PUT_BACK') {
          await tx.projectContractor.update({
            where: { projectId_contractorId: { projectId, contractorId: keptId } },
            data: { archivedAt: null },
          });
        }
        const moved = await tx.certification.findMany({
          where: {
            projectId,
            OR: [{ firstTierSubId: duplicateId }, { secondTierSubId: duplicateId }],
          },
          select: { id: true },
        });
        await tx.certification.updateMany({
          where: { projectId, firstTierSubId: duplicateId },
          data: { firstTierSubId: keptId },
        });
        await tx.certification.updateMany({
          where: { projectId, secondTierSubId: duplicateId },
          data: { secondTierSubId: keptId },
        });
        await tx.projectContractor.updateMany({
          where: { projectId, contractorId: duplicateId, archivedAt: null },
          data: { archivedAt: now },
        });
        if (moved.length > 0) {
          await this.setupChanged(tx, person, projectId, {
            certificationId: { in: moved.map((certification) => certification.id) },
          });
        }
      }
      const merged = await tx.contractor.update({
        where: { id: duplicateId },
        data: { mergedIntoId: keptId, archivedAt: now },
      });
      // What the merge doesn't move, said so (ADR-527 (11)).
      const kept = await tx.contractor.findUniqueOrThrow({ where: { id: keptId } });
      warn(
        new FirmRecords().mergeLeftNaming(merged.name, kept.name, {
          rulePicks: await tx.ruleCriterionPick.count({
            where: { contractorId: duplicateId, archivedAt: null, line: { archivedAt: null } },
          }),
          employees: await tx.user.count({ where: { employerId: duplicateId, archivedAt: null } }),
          viewers: await tx.user.count({ where: { contractorId: duplicateId, archivedAt: null } }),
        }),
      );
      return merged;
    });
  }

  contract(person: string, input: NewContract): Promise<Outcome<Contract>> {
    return this.setup(person, (tx) =>
      tx.contract.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          primeId: input.primeId,
          signedCopyUrl: input.signedCopyUrl ?? null,
        },
      }),
    );
  }

  // Its name and the link to its signed copy, audited with the value before. A rule's contract is
  // read by its id, so nothing a ticket bills follows its name: nothing is queued.
  changeContract(
    person: string,
    contractId: string,
    changes: ContractChanges,
  ): Promise<Outcome<Contract>> {
    return this.setup(person, (tx) =>
      tx.contract.update({ where: { id: contractId }, data: changes }),
    );
  }

  // Archived, the rules that name it are not valid and never run (spec/RULES.md §7); archived or
  // put back, the project's tickets are queued.
  archiveContract(
    person: string,
    contractId: string,
    archive: boolean,
  ): Promise<Outcome<Contract>> {
    return this.setup(person, async (tx) => {
      const contract = await tx.contract.findUniqueOrThrow({ where: { id: contractId } });
      const change = archiveChange(contract.archivedAt, archive, this.clock.now());
      if (change === null) return contract;
      const changed = await tx.contract.update({ where: { id: contractId }, data: change });
      await this.setupChanged(tx, person, contract.projectId);
      return changed;
    });
  }

  // A contractor as a merge reads it: the record, and its place on each project it is on.
  private static async party(tx: Prisma.TransactionClient, id: string): Promise<MergeParty> {
    const contractor = await tx.contractor.findUniqueOrThrow({ where: { id } });
    const places = await tx.projectContractor.findMany({ where: { contractorId: id } });
    const projects = await tx.project.findMany({
      where: { id: { in: places.map((place) => place.projectId) } },
    });
    const primes = await tx.contractor.findMany({
      where: {
        id: { in: places.flatMap((place) => (place.primeId === null ? [] : [place.primeId])) },
      },
    });
    return {
      id,
      name: contractor.name,
      archived: contractor.archivedAt !== null,
      mergedIntoId: contractor.mergedIntoId,
      places: places.map((place) => ({
        ...placeOf(place, primes),
        projectId: place.projectId,
        projectName: projects.find((project) => project.id === place.projectId)?.name ?? '',
      })),
    };
  }
}
