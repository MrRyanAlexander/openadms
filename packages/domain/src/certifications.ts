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
// Two spellings of one sub are merged later by the back office (ContractorMerge): one record is
// kept, the other is archived and points at it, and the certifications that named the duplicate
// name the kept one.

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
    | 'REVOCATION_NEEDS_REASON';
  readonly message: string;
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
}

// One of the two contractor records in a merge, with its place on each project it is on.
export interface MergeParty {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
  readonly mergedIntoId: string | null;
  readonly places: readonly (ContractorPlace & {
    readonly projectId: string;
    readonly projectName: string;
  })[];
}

export interface MergeRefusal {
  readonly code:
    | 'MERGE_INTO_ITSELF'
    | 'MERGE_ALREADY_MERGED'
    | 'MERGE_INTO_ARCHIVED'
    | 'MERGE_OF_A_PRIME'
    | 'MERGE_PLACES_DIFFER';
  readonly message: string;
}

// What a merge does on one project the duplicate is on: the kept contractor takes the duplicate's
// place there (a new place, or its own, put back if it had been taken off), the certifications
// that named the duplicate name the kept one, and the duplicate's place is taken off.
export interface MergeMove {
  readonly projectId: string;
  readonly tier: SubTier;
  readonly primeId: string;
  readonly keptPlace: 'NEW' | 'ITS_OWN' | 'PUT_BACK';
}

// Two spellings of one sub, merged by the back office (ADR-108, 321): `duplicate` into `kept`.
export class ContractorMerge {
  private readonly duplicate: MergeParty;
  private readonly kept: MergeParty;

  constructor(duplicate: MergeParty, kept: MergeParty) {
    this.duplicate = duplicate;
    this.kept = kept;
  }

  check(): MergeRefusal | null {
    const { duplicate, kept } = this;
    if (duplicate.id === kept.id) {
      return {
        code: 'MERGE_INTO_ITSELF',
        message: `Not merged: ${duplicate.name} can’t be merged into itself.`,
      };
    }
    if (duplicate.mergedIntoId !== null) {
      return {
        code: 'MERGE_ALREADY_MERGED',
        message: `Not merged: ${duplicate.name} was already merged into another contractor.`,
      };
    }
    if (kept.archived || kept.mergedIntoId !== null) {
      return {
        code: 'MERGE_INTO_ARCHIVED',
        message: `Not merged: ${kept.name} is archived${kept.mergedIntoId === null ? '' : ' (it was merged into another contractor)'}. Merge into the contractor that is kept.`,
      };
    }
    const asPrime = duplicate.places.find((place) => place.tier === null);
    if (asPrime !== undefined) {
      return {
        code: 'MERGE_OF_A_PRIME',
        message: `Not merged: ${duplicate.name} is a prime on ${asPrime.projectName}; its contracts, rates and rules name it. Only a sub typed in at certification is merged.`,
      };
    }
    for (const place of duplicate.places) {
      const other = kept.places.find((candidate) => candidate.projectId === place.projectId);
      if (other === undefined) continue;
      if (other.tier !== place.tier || other.primeId !== place.primeId) {
        return {
          code: 'MERGE_PLACES_DIFFER',
          message: `Not merged: on ${place.projectName}, ${duplicate.name} is ${ContractorMerge.said(place)} and ${kept.name} is ${ContractorMerge.said(other)}. A contractor has one place on a project, and a sub is never shared between primes.`,
        };
      }
    }
    return null;
  }

  // Project by project, once check() has passed.
  moves(): MergeMove[] {
    const moves: MergeMove[] = [];
    for (const place of this.duplicate.places) {
      if (place.tier === null || place.primeId === null) continue;
      const other = this.kept.places.find((candidate) => candidate.projectId === place.projectId);
      let keptPlace: MergeMove['keptPlace'] = 'NEW';
      if (other !== undefined)
        keptPlace = other.archived && !place.archived ? 'PUT_BACK' : 'ITS_OWN';
      moves.push({
        projectId: place.projectId,
        tier: place.tier,
        primeId: place.primeId,
        keptPlace,
      });
    }
    return moves;
  }

  private static said(place: ContractorPlace): string {
    return place.tier === null
      ? 'a prime'
      : `${place.primeName ?? 'a prime'}’s tier ${String(place.tier)} sub`;
  }
}
