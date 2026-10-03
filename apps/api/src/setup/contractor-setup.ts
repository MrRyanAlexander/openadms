// Setup step 4 (spec/parts/01-setup.md; ADR-108, 146, 305): a contractor record, firm-wide; a
// prime added to a project; a contract, which is a name, its prime and an optional link. Subs
// aren't entered here: they are typed in at certification, under their prime.
//
// This is the one place that adds a prime to a project, and it writes the row's `asPrimeId` with
// it: the key a contract's prime, a rate's prime and a sub's prime are held to (ADR-305; C56).
import type { Contract, Contractor, ContractorKind, ProjectContractor } from '@open-adms/db';

import { type Outcome, SetupService } from './setup-service.ts';

export interface NewContractor {
  readonly name: string;
  // Whoever adds it says which: there is no default.
  readonly kind: ContractorKind;
  readonly contactName?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
}

export interface NewContract {
  readonly projectId: string;
  readonly name: string;
  // One of the project's primes, added to it first.
  readonly primeId: string;
  readonly signedCopyUrl?: string;
}

export class ContractorSetup extends SetupService {
  // A contractor the firm already has is picked, never entered again.
  findContractors(search: string): Promise<Contractor[]> {
    return this.db.contractor.findMany({
      where: { name: { contains: search, mode: 'insensitive' }, archivedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  contractor(person: string, input: NewContractor): Promise<Outcome<Contractor>> {
    return this.write(person, (tx) =>
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

  addPrime(
    person: string,
    projectId: string,
    contractorId: string,
  ): Promise<Outcome<ProjectContractor>> {
    return this.write(person, (tx) =>
      tx.projectContractor.create({
        data: { projectId, contractorId, position: 'PRIME', asPrimeId: contractorId },
      }),
    );
  }

  contract(person: string, input: NewContract): Promise<Outcome<Contract>> {
    return this.write(person, (tx) =>
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
}
