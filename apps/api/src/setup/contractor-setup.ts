// Setup step 4 (spec/parts/01-setup.md; ADR-108, 146, 305): a contractor record, firm-wide; a
// prime added to a project; a contract, which is a name, its prime and an optional link. Subs
// aren't entered here: they are typed in at certification, under their prime.
//
// This is the one place that adds a prime to a project, and it writes the row's `asPrimeId` with
// it: the key a contract's prime, a rate's prime and a sub's prime are held to (ADR-305; C56).
// Beside it, `SubPlaces` is the one place that gives a sub its place: when it is typed in at
// certification, inside the piece of work that saves the certification (ADR-108, 321). Two
// spellings of one sub are never merged: the worker flags the certifications that name them, and
// a person corrects the sub on the wrong one (ADR-529 (f)).
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
  type ContractorPlace,
  type KnownContractor,
  type SubTier,
} from '@open-adms/domain';

import {
  afterInNameOrder,
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
          archivedAt: null,
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
}
