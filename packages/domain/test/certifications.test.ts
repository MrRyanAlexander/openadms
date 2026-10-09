// A sub typed in at certification, what a later change must say, and what a merge of two
// spellings moves, at the domain (spec/acceptance/03-certification.md AC-03-11, 12, 53, 55, 56;
// spec/acceptance/01-setup.md AC-01-17, 21; ADR-108, 321). The contractors are the example
// world's: Coastline Haulers LLC and Summit Debris Services, P1's primes; Rivera Trucking, under
// Coastline; Tidewater Hauling, under Rivera.
import { describe, expect, it } from 'vitest';

import {
  CertificationChanges,
  CertificationSubs,
  ContractorMerge,
  type ContractorPlace,
  type KnownContractor,
  type MergeParty,
} from '../src/index.ts';

const coastline = { id: 'coastline', name: 'Coastline Haulers LLC' };
const summit = { id: 'summit', name: 'Summit Debris Services' };
const underCoastline = new CertificationSubs(coastline.id, coastline.name);

const sub = (prime: typeof coastline, tier: 1 | 2, archived = false): ContractorPlace => ({
  tier,
  primeId: prime.id,
  primeName: prime.name,
  archived,
});
const rivera = (place: ContractorPlace | null): KnownContractor => ({
  id: 'rivera',
  name: 'Rivera Trucking',
  place,
});

describe('a sub typed in at certification', () => {
  it('AC-03-11 nobody has entered Rivera Trucking: it is a new contractor, placed under the prime, with no warning', () => {
    expect(underCoastline.place('Rivera Trucking', 1, [])).toEqual({
      action: 'ADD',
      name: 'Rivera Trucking',
      warning: null,
    });
  });

  it('AC-03-11 the firm knows Rivera Trucking from another project: the same record is placed on this one', () => {
    expect(underCoastline.place('Rivera Trucking', 1, [rivera(null)])).toEqual({
      action: 'PLACE',
      contractorId: 'rivera',
    });
  });

  it('AC-03-14 Rivera is already Coastline’s tier 1 sub here: the next certification names the same record, whatever its case or spacing', () => {
    const known = [rivera(sub(coastline, 1))];
    for (const typed of ['Rivera Trucking', 'rivera trucking', '  RIVERA   Trucking ']) {
      expect(underCoastline.place(typed, 1, known), typed).toEqual({
        action: 'USE',
        contractorId: 'rivera',
        putBack: false,
      });
    }
    expect(CertificationSubs.typed('  Rivera   Trucking ')).toBe('Rivera Trucking');
    expect(CertificationSubs.typed('   ')).toBeNull();
    expect(CertificationSubs.typed(undefined)).toBeNull();
  });

  it('a second spelling is a different name: it is saved as typed, for the back office to merge (AC-01-21)', () => {
    expect(underCoastline.place('Rivera Trucking Inc', 1, [rivera(sub(coastline, 1))])).toEqual({
      action: 'ADD',
      name: 'Rivera Trucking Inc',
      warning: null,
    });
  });

  it('its place had been taken off the project: it is put back', () => {
    expect(underCoastline.place('Rivera Trucking', 1, [rivera(sub(coastline, 1, true))])).toEqual({
      action: 'USE',
      contractorId: 'rivera',
      putBack: true,
    });
  });

  it('AC-01-17 Rivera is Summit’s sub on this project and is typed under Coastline: its place isn’t moved, the certification is saved under a separate contractor of that name, and the back office is warned', () => {
    expect(underCoastline.place('Rivera Trucking', 1, [rivera(sub(summit, 1))])).toEqual({
      action: 'ADD',
      name: 'Rivera Trucking',
      warning: {
        code: 'SUB_PLACED_ELSEWHERE',
        message:
          'Rivera Trucking is already on this project as Summit Debris Services’s tier 1 sub. A contractor has one place on a project, and a sub is never shared between primes, so the name typed into tier 1 under Coastline Haulers LLC was saved as a separate contractor. Check which is right.',
      },
    });
  });

  it('a name already placed in the other tier under the same prime, or as a prime, is warned of the same way', () => {
    const otherTier = underCoastline.place('Rivera Trucking', 2, [rivera(sub(coastline, 1))]);
    expect(otherTier).toMatchObject({ action: 'ADD', warning: { code: 'SUB_PLACED_ELSEWHERE' } });
    const aPrime = underCoastline.place('Summit Debris Services', 1, [
      {
        ...summit,
        place: { tier: null, primeId: null, primeName: null, archived: false },
      },
    ]);
    expect(aPrime).toMatchObject({
      action: 'ADD',
      warning: {
        message: expect.stringContaining(
          'Summit Debris Services is already on this project as one of its primes.',
        ) as string,
      },
    });
  });

  it('of two records of the name, the one placed as typed is named; else the one with no place here', () => {
    const second: KnownContractor = { id: 'rivera-2', name: 'Rivera Trucking', place: null };
    expect(underCoastline.place('Rivera Trucking', 1, [rivera(sub(summit, 1)), second])).toEqual({
      action: 'PLACE',
      contractorId: 'rivera-2',
    });
    expect(
      underCoastline.place('Rivera Trucking', 1, [
        rivera(sub(summit, 1)),
        { ...second, place: sub(coastline, 1) },
      ]),
    ).toEqual({ action: 'USE', contractorId: 'rivera-2', putBack: false });
  });

  it('AC-03-12 a second-tier sub is typed only under a first-tier one, and never the same name twice; there is no third tier', () => {
    expect(underCoastline.check(null, null)).toBeNull();
    expect(underCoastline.check('Rivera Trucking', null)).toBeNull();
    expect(underCoastline.check('Rivera Trucking', 'Tidewater Hauling')).toBeNull();
    expect(underCoastline.check(null, 'Tidewater Hauling')).toEqual({
      code: 'SECOND_TIER_WITHOUT_FIRST',
      message:
        'Not saved: Tidewater Hauling is typed into tier 2 with no tier 1 sub. A second-tier sub works under a first-tier sub of Coastline Haulers LLC.',
    });
    expect(underCoastline.check('Rivera Trucking', 'rivera  trucking')).toEqual({
      code: 'SUB_TYPED_TWICE',
      message: 'Not saved: Rivera Trucking is typed into both tiers. A sub is in tier 1 or tier 2.',
    });
  });

  it('a contractor first made at certification is a hauler where a container was certified, a crew where a crew was', () => {
    expect(CertificationSubs.kindOfNewSub('CONTAINER')).toBe('HAULER');
    expect(CertificationSubs.kindOfNewSub('CREW')).toBe('CREW');
  });
});

describe('a later change to a certification', () => {
  it('AC-03-53 a replacement says why', () => {
    expect(new CertificationChanges('730420').replacement('sideboards added')).toBeNull();
    expect(new CertificationChanges('730420').replacement('  ')).toEqual({
      code: 'REPLACEMENT_NEEDS_REASON',
      message:
        'Not saved: certification 730420 replaces another, so it says why (sideboards added, bed rebuilt…).',
    });
  });

  it('AC-03-55 a revocation has a reason: a date without one is refused', () => {
    expect(new CertificationChanges('730416').revocation('Truck sold')).toBeNull();
    expect(new CertificationChanges('730416').revocation('')).toEqual({
      code: 'REVOCATION_NEEDS_REASON',
      message: 'Not saved: certification 730416 is revoked from a date with a reason.',
    });
  });

  it('AC-03-55 only an admin revokes: a manager/analyst whatever they hold, a monitor, a read-only viewer, an archived admin and nobody are refused', () => {
    const changes = new CertificationChanges('730416');
    const person = (role: string, archived = false) => ({ name: 'Luis Ortega', role, archived });
    expect(changes.revoker({ name: 'Dana Reyes', role: 'ADMIN', archived: false })).toBeNull();
    for (const refused of [
      person('MANAGER_ANALYST'),
      person('MONITOR'),
      person('READ_ONLY_VIEWER'),
      person('SYSTEM'),
      person('ADMIN', true),
    ]) {
      expect(changes.revoker(refused)).toEqual({
        code: 'NOT_PERMITTED',
        message:
          'Luis Ortega may not revoke certification 730416: it takes an admin. Nothing was changed.',
      });
    }
    expect(changes.revoker(null)?.message).toBe(
      'Somebody the firm has no record of may not revoke certification 730416: it takes an admin. Nothing was changed.',
    );
  });

  it('a measuring mistake is corrected on a box the certification has', () => {
    expect(new CertificationChanges('730417').noBox(3)).toEqual({
      code: 'NO_SUCH_BOX',
      message: 'Not saved: certification 730417 has no box 3 to correct.',
    });
  });
});

describe('merging two spellings of a sub', () => {
  const on = (projectId: string, place: ContractorPlace) => ({
    ...place,
    projectId,
    projectName: projectId === 'p1' ? 'Bayline County ROW' : 'Bayline County PPDR',
  });
  const party = (id: string, name: string, places: MergeParty['places'] = []): MergeParty => ({
    id,
    name,
    archived: false,
    mergedIntoId: null,
    places,
  });
  const kept = party('rivera', 'Rivera Trucking', [on('p1', sub(coastline, 1))]);

  it('AC-01-21 "Rivera Trucking Inc" into "Rivera Trucking", both Coastline’s tier 1 subs on P1: the kept record keeps its own place', () => {
    const merge = new ContractorMerge(
      party('rivera-inc', 'Rivera Trucking Inc', [on('p1', sub(coastline, 1))]),
      kept,
    );
    expect(merge.check()).toBeNull();
    expect(merge.moves()).toEqual([
      { projectId: 'p1', tier: 1, primeId: 'coastline', keptPlace: 'ITS_OWN' },
    ]);
  });

  it('the duplicate is on a project the kept record isn’t on: the kept record takes its place there; one taken off is put back', () => {
    const duplicate = party('rivera-inc', 'Rivera Trucking Inc', [
      on('p1', sub(coastline, 1)),
      on('p2', sub(coastline, 2)),
    ]);
    expect(new ContractorMerge(duplicate, kept).moves()).toEqual([
      { projectId: 'p1', tier: 1, primeId: 'coastline', keptPlace: 'ITS_OWN' },
      { projectId: 'p2', tier: 2, primeId: 'coastline', keptPlace: 'NEW' },
    ]);
    const takenOff = party('rivera', 'Rivera Trucking', [on('p1', sub(coastline, 1, true))]);
    expect(new ContractorMerge(duplicate, takenOff).moves()[0]).toMatchObject({
      keptPlace: 'PUT_BACK',
    });
  });

  it('AC-01-17 the two are under different primes, or in different tiers, on one project: not merged, since a sub is never shared', () => {
    const underSummit = party('rivera-2', 'Rivera Trucking', [on('p1', sub(summit, 1))]);
    expect(new ContractorMerge(underSummit, kept).check()).toEqual({
      code: 'MERGE_PLACES_DIFFER',
      message:
        'Not merged: on Bayline County ROW, Rivera Trucking is Summit Debris Services’s tier 1 sub and Rivera Trucking is Coastline Haulers LLC’s tier 1 sub. A contractor has one place on a project, and a sub is never shared between primes.',
    });
    const tierTwo = party('rivera-2', 'Rivera Trucking', [on('p1', sub(coastline, 2))]);
    expect(new ContractorMerge(tierTwo, kept).check()).toMatchObject({
      code: 'MERGE_PLACES_DIFFER',
    });
  });

  it('never into itself, never a record already merged, never into an archived one, never a prime', () => {
    expect(new ContractorMerge(kept, kept).check()).toMatchObject({ code: 'MERGE_INTO_ITSELF' });
    const merged = {
      ...party('rivera-inc', 'Rivera Trucking Inc'),
      archived: true,
      mergedIntoId: 'rivera',
    };
    expect(new ContractorMerge(merged, kept).check()).toMatchObject({
      code: 'MERGE_ALREADY_MERGED',
    });
    expect(new ContractorMerge(party('rivera-3', 'Rivera Trkg'), merged).check()).toEqual({
      code: 'MERGE_INTO_ARCHIVED',
      message:
        'Not merged: Rivera Trucking Inc is archived (it was merged into another contractor). Merge into the contractor that is kept.',
    });
    const prime = party('summit', summit.name, [
      on('p1', { tier: null, primeId: null, primeName: null, archived: false }),
    ]);
    expect(new ContractorMerge(prime, kept).check()).toEqual({
      code: 'MERGE_OF_A_PRIME',
      message:
        'Not merged: Summit Debris Services is a prime on Bayline County ROW; its contracts, rates and rules name it. Only a sub typed in at certification is merged.',
    });
  });
});
