// Whose truck, and what later happens to a certification (adms-certifications §3A.6;
// spec/parts/03-certification.md steps 3, 14; ADR-079, 082, 108, 152, 321).
//
// The monitor picks the prime and types a sub into tier 1 or tier 2, never deeper; a sub is its
// prime's own, never shared between primes, and a contractor has one place on a project. So a typed
// name is matched to a contractor the firm already has before a new one is made, and a name that is
// already placed somewhere else on the project is never moved: the certification is still saved,
// under a separate contractor record of the same name, with a warning for the back office.
// Nothing here refuses field work over who a sub is.
//
// Two spellings of one sub are never merged (ADR-529 (f)): the certifications that name subs whose
// names are alike (`SubNames`) are flagged, and a person corrects the sub on the wrong one.

import type { CertificationKind } from './capacity.ts';
import type { SetupWarning } from './form-debris-types.ts';

export type SubTier = 1 | 2;

// A contractor's place on one project, as these rules read it: a prime (no tier, no prime of its
// own) or a sub in a tier under a prime. Archived: taken off the project, its place kept.
export interface ContractorPlace {
  readonly tier: SubTier | null;
  readonly primeId: string | null;
  // The prime's name, as the messages say it; null on a prime's own place.
  readonly primeName: string | null;
  readonly archived: boolean;
}

// A contractor the firm already has whose name is the one typed, with its place on the
// certification's project, if it has one.
export interface KnownContractor {
  readonly id: string;
  readonly name: string;
  readonly place: ContractorPlace | null;
}

// What the service does with a typed sub.
export type SubPlacement =
  // Already placed as typed: named as it is (its place put back if it had been taken off).
  | { readonly action: 'USE'; readonly contractorId: string; readonly putBack: boolean }
  // Known to the firm, on this project nowhere yet: placed under the prime in that tier.
  | { readonly action: 'PLACE'; readonly contractorId: string }
  // A new contractor record of that name, placed under the prime in that tier.
  | { readonly action: 'ADD'; readonly name: string; readonly warning: SetupWarning | null };

export interface CertificationRefusal {
  readonly code:
    | 'SECOND_TIER_WITHOUT_FIRST'
    | 'SUB_TYPED_TWICE'
    | 'REPLACEMENT_NEEDS_REASON'
    | 'REVOCATION_NEEDS_REASON'
    | 'NOT_PERMITTED'
    | 'NO_SUCH_BOX'
    | 'NOT_REVOKED'
    | 'UNREVOCATION_NEEDS_REASON'
    | 'PRIMARY_STAYS'
    | 'CREW_HAS_NO_BOX'
    | 'CERT_NUMBER_HELD';
  readonly message: string;
}

// Whoever asks to revoke, as the database has them now.
export interface Revoker {
  readonly name: string;
  readonly role: string;
  readonly archived: boolean;
}

export class CertificationSubs {
  private readonly primeId: string;
  private readonly primeName: string;

  // The prime the monitor picked, one of the project's own.
  constructor(primeId: string, primeName: string) {
    this.primeId = primeId;
    this.primeName = primeName;
  }

  // A name as typed, without its stray spaces; null when nothing was typed.
  static typed(name: string | null | undefined): string | null {
    const tidy = (name ?? '').trim().replace(/\s+/g, ' ');
    return tidy === '' ? null : tidy;
  }

  // Two names are one when only their case and spacing differ. A different spelling ("Rivera
  // Trucking Inc") is a different name: the back office merges those.
  static sameName(one: string, other: string): boolean {
    const plain = (name: string): string => (CertificationSubs.typed(name) ?? '').toLowerCase();
    return plain(one) === plain(other);
  }

  // What a contractor first made at certification is, until the back office says otherwise: a
  // hauler where a container was certified, a crew where a crew was (Q-97).
  static kindOfNewSub(certifies: CertificationKind): 'HAULER' | 'CREW' {
    return certifies === 'CREW' ? 'CREW' : 'HAULER';
  }

  // The two tiers as typed: a second tier only under a first, and never the same name twice.
  check(firstTier: string | null, secondTier: string | null): CertificationRefusal | null {
    if (secondTier !== null && firstTier === null) {
      return {
        code: 'SECOND_TIER_WITHOUT_FIRST',
        message: `Not saved: ${secondTier} is typed into tier 2 with no tier 1 sub. A second-tier sub works under a first-tier sub of ${this.primeName}.`,
      };
    }
    if (
      firstTier !== null &&
      secondTier !== null &&
      CertificationSubs.sameName(firstTier, secondTier)
    ) {
      return {
        code: 'SUB_TYPED_TWICE',
        message: `Not saved: ${firstTier} is typed into both tiers. A sub is in tier 1 or tier 2.`,
      };
    }
    return null;
  }

  // Who the typed name is: `known` are the firm's contractors of that name (not archived), each
  // with its place on this project.
  place(name: string, tier: SubTier, known: readonly KnownContractor[]): SubPlacement {
    const named = known.filter((contractor) => CertificationSubs.sameName(contractor.name, name));
    const here = named.find(
      ({ place }) => place !== null && place.tier === tier && place.primeId === this.primeId,
    );
    if (here?.place !== undefined && here.place !== null) {
      return { action: 'USE', contractorId: here.id, putBack: here.place.archived };
    }
    const unplaced = named.find(({ place }) => place === null);
    if (unplaced !== undefined) return { action: 'PLACE', contractorId: unplaced.id };
    const elsewhere = named.find(({ place }) => place !== null);
    if (elsewhere?.place === undefined || elsewhere.place === null) {
      return { action: 'ADD', name, warning: null };
    }
    const where =
      elsewhere.place.tier === null
        ? 'one of its primes'
        : `${elsewhere.place.primeName ?? 'another prime'}’s tier ${String(elsewhere.place.tier)} sub`;
    return {
      action: 'ADD',
      name,
      warning: {
        code: 'SUB_PLACED_ELSEWHERE',
        message: `${elsewhere.name} is already on this project as ${where}. A contractor has one place on a project, and a sub is never shared between primes, so the name typed into tier ${String(tier)} under ${this.primeName} was saved as a separate contractor. Check which is right.`,
      },
    };
  }
}

// What a later change to a certification must say (ADR-079, 082, 152).
export class CertificationChanges {
  // The cert number the messages name.
  private readonly certNumber: string;

  constructor(certNumber: string) {
    this.certNumber = certNumber;
  }

  // A modified truck's new certification names the one it replaces, and why.
  replacement(reason: string): CertificationRefusal | null {
    if (reason.trim() !== '') return null;
    return {
      code: 'REPLACEMENT_NEEDS_REASON',
      message: `Not saved: certification ${this.certNumber} replaces another, so it says why (sideboards added, bed rebuilt…).`,
    };
  }

  // Revoked from a date, with a reason.
  revocation(reason: string): CertificationRefusal | null {
    if (reason.trim() !== '') return null;
    return {
      code: 'REVOCATION_NEEDS_REASON',
      message: `Not saved: certification ${this.certNumber} is revoked from a date with a reason.`,
    };
  }

  // Only an admin revokes (ADR-079; AC-03-55), and only an admin takes a revocation back
  // (ADR-534 (7)): no permission opens either to anybody else. `person` is null where the
  // database has nobody of that id.
  revoker(
    person: Revoker | null,
    act: 'revoke' | 'un-revoke' = 'revoke',
  ): CertificationRefusal | null {
    if (person !== null && person.role === 'ADMIN' && !person.archived) return null;
    return {
      code: 'NOT_PERMITTED',
      message: `${person?.name ?? 'Somebody the firm has no record of'} may not ${act} certification ${this.certNumber}: it takes an admin. Nothing was changed.`,
    };
  }

  // A revocation taken back (ADR-534 (7)): only one that stands, and with a reason.
  unrevocation(revoked: boolean, reason: string): CertificationRefusal | null {
    if (!revoked) {
      return {
        code: 'NOT_REVOKED',
        message: `Certification ${this.certNumber} isn’t revoked. Nothing was changed.`,
      };
    }
    if (reason.trim() !== '') return null;
    return {
      code: 'UNREVOCATION_NEEDS_REASON',
      message: `Not saved: certification ${this.certNumber}’s revocation is taken back with a reason.`,
    };
  }

  // Box 0 is the primary, the main interior: corrected, never taken off (ADR-076).
  primaryStays(): CertificationRefusal {
    return {
      code: 'PRIMARY_STAYS',
      message: `Not saved: box 0 is certification ${this.certNumber}’s primary box, the main interior. It is corrected, never taken off.`,
    };
  }

  // A crew is never measured (invariant 10): it takes no box.
  crewHasNoBox(): CertificationRefusal {
    return {
      code: 'CREW_HAS_NO_BOX',
      message: `Not saved: certification ${this.certNumber} is a crew’s, and a crew is never measured.`,
    };
  }

  // A cert number once per project (ADR-045, 318): a sheet entered in the back office whose
  // number another certification of the project already has.
  numberHeld(): CertificationRefusal {
    return {
      code: 'CERT_NUMBER_HELD',
      message: `Not saved: this project already has a certification ${this.certNumber}. A cert number is used once on a project.`,
    };
  }

  // A measuring mistake is corrected on a box the certification has: the primary is box 0, and
  // a crew has none.
  noBox(position: number): CertificationRefusal {
    return {
      code: 'NO_SUCH_BOX',
      message: `Not saved: certification ${this.certNumber} has no box ${String(position)} to correct.`,
    };
  }
}

// Whether two subs' names are one company's spelled two ways (ADR-529 (f)): alike once case,
// spaces and punctuation, an "&" said as "and", a leading "The" and a company ending (LLC, Inc,
// Co, Corp, Company, Corporation, Ltd, LP, LLP, PLLC) are set aside. It never says which spelling
// is right: the certifications that name either are flagged for a person.
const companyEndings = new Set([
  'llc',
  'inc',
  'incorporated',
  'co',
  'company',
  'corp',
  'corporation',
  'ltd',
  'limited',
  'lp',
  'llp',
  'pllc',
]);

export const SubNames = {
  // The name with what doesn't tell two companies apart set aside: "Rivera Trucking, LLC." →
  // "rivera trucking".
  key(name: string): string {
    const words = name
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .split(' ')
      .filter((word) => word !== '');
    if (words[0] === 'the' && words.length > 1) words.shift();
    while (words.length > 1 && companyEndings.has(words.at(-1) ?? '')) words.pop();
    return words.join(' ');
  },

  alike(one: string, other: string): boolean {
    return one !== other && SubNames.key(one) === SubNames.key(other);
  },
} as const;
