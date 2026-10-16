// The back office's changes to a certification, through their endpoints, against the database
// (spec/parts/03-certification.md steps 10…13; spec/acceptance/03 AC-03-38, 51, 52, 55; 10
// AC-10-27, 28, 33, 35, 37; BACKLOG 2.4.4; ADR-079, 080, 364, 433). OWASP ASVS 5.0 V2, V8. The
// real process, in this test's own memory, on the installation's database as `adms_api`: it
// needs `pnpm local:up` after `pnpm installer`, and fails saying so. Each test's work is undone
// (support/database.ts).
//
// The API's login writes no flag, status or completed load: those are the worker's. So what is
// asked here is the certification as changed, its audit record and the job queued; what the run
// then concludes (a ticket at the new capacity, one flagged on a revoked certification) is the
// stories' (`certification`, `p1-reviewed`, `p1-left-out`). What the database's own checks refuse
// ends a test's piece of work, so such a refusal is its test's last request.
import { randomUUID } from 'node:crypto';

import {
  addPrimeEndpoint,
  adminOnly,
  backOfficeRoles,
  addCertificationBoxEndpoint,
  correctCertificationBoxEndpoint,
  correctCertificationEndpoint,
  createCertificationEndpoint,
  createContractorEndpoint,
  endpoints,
  markSignaturesOnFileEndpoint,
  revokeCertificationEndpoint,
  syncedRecordSchema,
  unrevokeCertificationEndpoint,
  type Endpoint,
  type SyncedCertification,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { NotSaved } from '@open-adms/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Certifications } from '../src/certification/certifications.ts';
import { Intake } from '../src/sync/intake.ts';
import { Corrections } from '../src/review/corrections.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { shippedPolicy } from './support/process.ts';
import { enrolledPhone } from './support/phones.ts';
import {
  audited,
  jobsFor,
  luisHolds,
  notTaken,
  p1WithTickets,
  reasonNamed,
} from './support/review.ts';
import { danasEmail, long, worldOn, type People, type Served } from './support/served.ts';
import {
  ask,
  notSaved,
  plainly,
  saved,
  told,
  viewerSignsIn,
  type Browser,
} from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const requests = [
  createCertificationEndpoint,
  correctCertificationEndpoint,
  correctCertificationBoxEndpoint,
  addCertificationBoxEndpoint,
  markSignaturesOnFileEndpoint,
  revokeCertificationEndpoint,
  unrevokeCertificationEndpoint,
] as const;

// Those a permission opens, and those an admin's alone.
const permitted = [
  createCertificationEndpoint,
  correctCertificationEndpoint,
  correctCertificationBoxEndpoint,
  addCertificationBoxEndpoint,
  markSignaturesOnFileEndpoint,
] as const;
const adminsAlone = [revokeCertificationEndpoint, unrevokeCertificationEndpoint] as const;

const every = [
  'SETUP',
  'DISPATCH',
  'VOID',
  'ACCEPT_FLAG',
  'QC',
  'LOCK_INVOICED',
  'UNLOCK_INVOICED',
  'CORRECT',
  'RENUMBER',
];

// The changes made to certifications and their boxes so far, by anybody.
const changed = (tx: Tx): Promise<number> =>
  tx.auditRecord.count({
    where: { tableName: { in: ['certification', 'certification_box'] }, operation: 'UPDATE' },
  });

// P1 with Coastline as a prime, and two tickets that scanned 730415 before anybody had certified
// it: load 101031's collection and unit rate ticket 301001. Then Kim certifies Coastline's dump
// trailer as 730415, with AC-03-51's boxes: the sideboards' height typed 21 by mistake, so 36 CY
// where the truck holds 32. A bucket truck crew is 730417: no box, no capacity.
async function certified(api: Served, tx: Tx, within: Database, who: People) {
  const p = await p1WithTickets(api, tx, within, who);
  const coastline = saved(
    createContractorEndpoint,
    await ask(api, p.dana, createContractorEndpoint, {
      payload: { name: 'Coastline Haulers LLC', kind: 'HAULER' },
    }),
  ).record.id;
  saved(
    addPrimeEndpoint,
    await ask(api, p.dana, addPrimeEndpoint, { ids: p.ids, payload: { contractorId: coastline } }),
  );
  const feature = async (name: string) =>
    (await tx.vehicleFeature.findFirstOrThrow({ where: { name } })).id;
  const certifications = new Certifications(within, api.clock, shippedPolicy);
  const made = async (
    more: Pick<
      Parameters<Certifications['certify']>[0],
      'certNumber' | 'kind' | 'boxes' | 'crewTypeId'
    >,
  ) => {
    const outcome = await certifications.certify({
      projectId: p.project.id,
      primeId: coastline,
      certifiedById: who.kim,
      certifiedAt: new Date('2026-10-10T13:10:00Z'),
      deviceUtcOffsetMinutes: -240,
      ...more,
    });
    if (!outcome.saved) throw new Error(outcome.refusal.message);
    return outcome.record;
  };
  const trailer = await made({
    certNumber: '730415',
    kind: 'CONTAINER',
    boxes: [
      { shape: 'RECTANGLE', sign: 'ADD', length: 240, width: 90, height: 60 },
      {
        shape: 'RECTANGLE',
        sign: 'ADD',
        length: 240,
        width: 90,
        height: 21,
        featureId: await feature('Sideboards'),
      },
      {
        shape: 'TRIANGLE',
        sign: 'SUBTRACT',
        length: 30,
        width: 90,
        height: 40,
        featureId: await feature('Dog Box'),
      },
    ],
  });
  const crew = await made({
    certNumber: '730417',
    kind: 'CREW',
    crewTypeId: (await tx.crewType.findFirstOrThrow({ where: { name: 'Bucket Truck' } })).id,
    boxes: [],
  });
  return { ...p, coastline, trailer, crew };
}

const box = (certificationId: string, position: number) => ({
  certificationId,
  position: String(position),
});

describe('who may ask', () => {
  it('AC-10-27, AC-03-55, 61…64 a sheet entered from paper, a correction and a box are open to an admin and to a manager/analyst who holds correct, signatures on file to one who holds QC, and a revocation and its taking back to an admin alone: no permission opens them', () => {
    const asked = ({ access, roles, permission }: Endpoint) => [access, roles, permission];
    for (const served of [
      createCertificationEndpoint,
      correctCertificationEndpoint,
      correctCertificationBoxEndpoint,
      addCertificationBoxEndpoint,
    ]) {
      expect(asked(served), served.name).toEqual(['SIGNED_IN', backOfficeRoles, 'CORRECT']);
    }
    expect(asked(markSignaturesOnFileEndpoint)).toEqual(['SIGNED_IN', backOfficeRoles, 'QC']);
    for (const served of adminsAlone) {
      expect(asked(served), served.name).toEqual(['SIGNED_IN', adminOnly, undefined]);
    }
    // A certification is made on a phone and its sync brings it, or entered from its sheet where
    // the phone failed (ADR-521, 534 (1)). Its reads are review-reads.test.ts's (ADR-535).
    expect(
      endpoints
        .filter(({ path, method }) => path.includes('certification') && method !== 'GET')
        .map(({ name }) => name),
    ).toEqual(requests.map(({ name }) => name));
  });

  it('AC-10-27, AC-03-55 each is refused to nobody, to a read-only viewer and to a manager/analyst without its permission, before anything sent is read; a manager/analyst who holds every permission still revokes nothing; nothing is changed', async () => {
    await world(async (served, tx, who, within) => {
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      const before = await changed(tx);
      // A body no schema would take: the door answers first, and says nothing of it.
      const nonsense = { payload: { nonsense: true } };
      for (const endpoint of requests) {
        expect(told(await ask(served, undefined, endpoint, nonsense)), endpoint.name).toEqual([
          401,
          'NOT_SIGNED_IN',
        ]);
        const refused = await ask(served, viewer, endpoint, nonsense);
        expect(told(refused), endpoint.name).toEqual([403, 'NOT_ALLOWED']);
        expect(Object.keys(refused.body as object).sort()).toEqual(['code', 'requestId']);
      }
      const grants = new Map<string, string>();
      for (const permission of every) {
        const grant = await tx.userPermission.create({
          data: { userId: who.luis, permission: permission as 'VOID' },
        });
        grants.set(permission, grant.id);
      }
      const luis = await luisHolds(served, tx, who.luis);
      for (const endpoint of permitted) {
        const id = grants.get(endpoint.permission) ?? '';
        // Dana takes this one away: his very next request is refused, with the same session.
        await tx.userPermission.update({ where: { id }, data: { archivedAt: new Date() } });
        expect(told(await ask(served, luis, endpoint, nonsense)), endpoint.name).toEqual([
          403,
          'NOT_ALLOWED',
        ]);
        await tx.userPermission.update({ where: { id }, data: { archivedAt: null } });
        // Given back, the door lets him through to the schema, which refuses the nonsense.
        expect(told(await ask(served, luis, endpoint, nonsense)), endpoint.name).toEqual([
          400,
          'BAD_REQUEST',
        ]);
      }
      // Holding all nine, Luis is still no admin; Dana is let through to the schema.
      const dana = await served.signedIn(danasEmail, long);
      for (const endpoint of adminsAlone) {
        const refused = await ask(served, luis, endpoint, nonsense);
        expect(told(refused), endpoint.name).toEqual([403, 'NOT_ALLOWED']);
        expect(Object.keys(refused.body as object).sort()).toEqual(['code', 'requestId']);
        expect(told(await ask(served, dana, endpoint, nonsense)), endpoint.name).toEqual([
          400,
          'BAD_REQUEST',
        ]);
      }
      expect(await changed(tx)).toBe(before);
    });
  });

  it('AC-10-28, AC-03-55 each service refuses again inside its own piece of work: a manager/analyst without the grant, a read-only viewer and a monitor change nothing, and Luis holding every permission is told a revocation takes an admin', async () => {
    await world(async (served, tx, who, within) => {
      const c = await certified(served, tx, within, who);
      const before = await changed(tx);
      const corrections = new Corrections(within, served.clock, shippedPolicy);
      const certifications = new Certifications(within, served.clock, shippedPolicy);
      const tried = async (person: string) => {
        const outcomes = [
          await corrections.certification(person, c.trailer.id, 1, { height: 12 }),
          await certifications.signaturesOnFile(person, c.trailer.id, true),
          await certifications.revoke(person, c.trailer.id, '2026-10-14', 'Tailgate missing'),
        ];
        return outcomes.map((outcome) => (outcome.saved ? 'saved' : outcome.refusal.code));
      };
      for (const person of [who.luis, who.viewer, who.kim]) {
        expect(await tried(person)).toEqual(['NOT_PERMITTED', 'NOT_PERMITTED', 'NOT_PERMITTED']);
      }
      // Each asks for its own: QC opens no correction, correct no mark at QC.
      const held = await tx.userPermission.create({
        data: { userId: who.luis, permission: 'QC' },
      });
      expect(
        (await corrections.certification(who.luis, c.trailer.id, 1, { height: 12 })).saved,
      ).toBe(false);
      await tx.userPermission.update({ where: { id: held.id }, data: { permission: 'CORRECT' } });
      expect((await certifications.signaturesOnFile(who.luis, c.trailer.id, true)).saved).toBe(
        false,
      );
      for (const permission of every.filter((one) => one !== 'CORRECT')) {
        await tx.userPermission.create({
          data: { userId: who.luis, permission: permission as 'VOID' },
        });
      }
      expect(
        await certifications.revoke(who.luis, c.trailer.id, '2026-10-14', 'Tailgate missing'),
      ).toEqual({
        saved: false,
        refusal: {
          code: 'NOT_PERMITTED',
          message:
            'Luis Ortega may not revoke certification 730415: it takes an admin. Nothing was changed.',
        },
      });
      expect(await changed(tx)).toBe(before);
    });
  });
});

describe('a measuring mistake corrected', () => {
  it('AC-03-51, 52 Luis corrects the sideboards’ height on 730415 from 21 to 12 with his own note: the same certification, its capacity worked out again as 32 CY where it said 36, the box and the capacity before in the audit log under him, and both tickets that scanned it queued in the same request; a correction that leaves the capacity where it is queues nothing', async () => {
    await world(async (served, tx, who, within) => {
      const c = await certified(served, tx, within, who);
      expect(c.trailer.capacityCy).toBe(36);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const answer = await ask(served, luis, correctCertificationBoxEndpoint, {
        ids: box(c.trailer.id, 1),
        payload: { changes: { height: 12 }, note: 'Sideboards measured again: 12 inches' },
      });
      const { record, queued } = saved(correctCertificationBoxEndpoint, answer);
      expect(record).toMatchObject({
        id: c.trailer.id,
        certNumber: '730415',
        kind: 'CONTAINER',
        primeId: c.coastline,
        capacityCy: 32,
        certifiedById: who.kim,
        signaturesOnFile: false,
        revokedFrom: null,
      });
      expect(queued).toMatchObject({ tickets: 2, lockedAsInvoiced: 0 });
      const [boxChange] = await audited(tx, answer, 'certification_box');
      expect([
        boxChange?.operation,
        boxChange?.actorId,
        boxChange?.source,
        boxChange?.reason,
        boxChange?.before?.['height'],
      ]).toEqual(['UPDATE', who.luis, 'BACK_OFFICE', 'Sideboards measured again: 12 inches', 21]);
      const [capacityChange] = await audited(tx, answer, 'certification');
      expect([
        capacityChange?.operation,
        capacityChange?.actorId,
        capacityChange?.before?.['capacity_cy'],
      ]).toEqual(['UPDATE', who.luis, 36]);
      expect(await jobsFor(tx, c.project.id, who.luis)).toEqual([
        ['CORRECTION', 'LOAD 101031', 'UNIT_RATE 301001'],
      ]);
      // The primary's length was an inch short: 32.29 is still 32 CY, so no ticket moves.
      const quiet = await ask(served, luis, correctCertificationBoxEndpoint, {
        ids: box(c.trailer.id, 0),
        payload: { changes: { length: 241 } },
      });
      const same = saved(correctCertificationBoxEndpoint, quiet);
      expect([same.record.capacityCy, same.queued]).toEqual([32, undefined]);
      expect((await audited(tx, quiet, 'certification_box'))[0]?.before?.['length']).toBe(240);
      expect(await audited(tx, quiet, 'certification')).toEqual([]);
      expect(await jobsFor(tx, c.project.id, who.luis)).toHaveLength(1);
      // Neither wrote anything the worker concludes.
      expect(await tx.completedLoad.count({ where: { projectId: c.project.id } })).toBe(0);
    });
  });

  it('AC-10-35, 37 nobody sends a capacity, and what can’t be a measurement is refused by the schema, saying which field: a height of nought, a fraction of an inch, a box that isn’t a number, nothing stated; a box the certification doesn’t have and a crew’s are refused in plain words; nothing is changed', async () => {
    await world(async (served, tx, who, within) => {
      const c = await certified(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const before = await changed(tx);
      const sent = (changes: object, ids = box(c.trailer.id, 1)) =>
        ask(served, luis, correctCertificationBoxEndpoint, { ids, payload: { changes } });
      expect(notTaken(await sent({ height: 12, capacityCy: 70 }))).toBe(
        'Not taken: changes in the body has a field this request doesn’t take.',
      );
      expect(notTaken(await sent({ height: 0 }))).toBe(
        'Not taken: changes.height in the body can’t be less than 1.',
      );
      expect(notTaken(await sent({ height: 12.5 }))).toMatch(
        /^Not taken: changes\.height in the body /,
      );
      expect(notTaken(await sent({}))).toMatch(/^Not taken: changes in the body /);
      expect(
        notTaken(await sent({ height: 12 }, { certificationId: c.trailer.id, position: 'one' })),
      ).toMatch(/^Not taken: position in the path /);
      expect(notSaved(await sent({ height: 12 }, box(c.trailer.id, 7)))).toEqual([
        'NO_SUCH_BOX',
        'Not saved: certification 730415 has no box 7 to correct.',
      ]);
      // A crew is its certification, and has no box to measure (invariant 10).
      expect(notSaved(await sent({ height: 12 }, box(c.crew.id, 0)))).toEqual([
        'NO_SUCH_BOX',
        'Not saved: certification 730417 has no box 0 to correct.',
      ]);
      expect(told(await sent({ height: 12 }, box(randomUUID(), 0)))).toEqual([404, 'NOT_FOUND']);
      expect(await changed(tx)).toBe(before);
    });
  });

  it('AC-10-33 a diameter stated on a rectangle is the database’s own refusal, told plainly', async () => {
    await world(async (served, tx, who, within) => {
      const c = await certified(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const refused = await ask(served, luis, correctCertificationBoxEndpoint, {
        ids: box(c.trailer.id, 1),
        payload: { changes: { diameter: 30 } },
      });
      expect(told(refused)).toEqual([422, 'REFUSED_BY_THE_DATABASE']);
      expect(plainly(refused)).toBe(
        'Not saved: a box holds the measurements of its own shape and no other, each a whole number of inches of 1 or more.',
      );
    });
  });
});

describe('a certification sheet entered from paper', () => {
  it('AC-03-61 Sam’s phone failed while he certified a Coastline dump trailer on the pre-printed sheet 88120: Luis, who holds correct, enters it with the reason "Device failed", naming Sam as the certifier and the sheet’s number; its capacity is worked out from the boxes (28 CY), it names Luis and the reason, no phone and no assignment; the load already on 88120 is linked to it and queued; the same number again, and a reason the firm doesn’t offer for this, are refused in words', async () => {
    await world(async (served, tx, who, within) => {
      const c = await certified(served, tx, within, who);
      const earlier = await c.created('COLLECTION', '101044', { certNumber: '88120' });
      expect(earlier.certificationId).toBeNull();
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const reasonId = await reasonNamed(tx, 'Device failed');
      const dumpTrailer = await tx.vehicleType.findFirstOrThrow({
        where: { name: 'Hydraulic Dump Trailer' },
      });
      const sheet = {
        certNumber: '88120',
        kind: 'CONTAINER',
        primeId: c.coastline,
        firstTierSub: null,
        secondTierSub: null,
        vehicleTypeId: dumpTrailer.id,
        vehicleTypeOther: null,
        crewTypeId: null,
        boxes: [
          {
            featureId: null,
            featureOther: null,
            shape: 'RECTANGLE',
            sign: 'ADD',
            length: 240,
            secondLength: null,
            width: 90,
            height: 60,
            diameter: null,
            radius: null,
            run: null,
            corners: null,
          },
        ],
        driverName: 'Marco Rivera',
        driverPhone: null,
        driverLicenceNumber: null,
        driverLicenceState: 'FL',
        driverLicenceExpiry: '2028-03-31',
        tagNumber: 'RVT 4821',
        tagState: 'FL',
        tagExpiry: '2027-03-31',
        certifiedAt: '2026-10-10T14:10:00Z',
        deviceUtcOffsetMinutes: -240,
        certifiedById: who.kim,
        helperIds: [],
        clientRepresentativeName: null,
        contractorRepresentativeName: null,
        replaces: null,
        notes: 'Entered from the paper sheet',
        reasonId,
      };
      const entered = (payload: object) =>
        ask(served, luis, createCertificationEndpoint, { ids: c.ids, payload });
      const answer = await entered(sheet);
      const { record, queued } = saved(createCertificationEndpoint, answer);
      expect(record).toMatchObject({
        projectId: c.project.id,
        certNumber: '88120',
        kind: 'CONTAINER',
        primeId: c.coastline,
        capacityCy: 28,
        vehicleTypeId: dumpTrailer.id,
        driverName: 'Marco Rivera',
        tagExpiry: '2027-03-31',
        certifiedAt: '2026-10-10T14:10:00.000Z',
        certifiedById: who.kim,
        deviceId: null,
        createdById: who.luis,
        createdReasonId: reasonId,
        signaturesOnFile: false,
      });
      expect(queued).toMatchObject({ tickets: 1, lockedAsInvoiced: 0 });
      const kept = await tx.certification.findUniqueOrThrow({ where: { id: record.id } });
      expect([kept.assignmentId, kept.deviceId]).toEqual([null, null]);
      expect(
        (await tx.fieldEvent.findUniqueOrThrow({ where: { id: earlier.id } })).certificationId,
      ).toBe(record.id);
      const [made] = await audited(tx, answer, 'certification');
      expect([made?.operation, made?.actorId, made?.source]).toEqual([
        'INSERT',
        who.luis,
        'BACK_OFFICE',
      ]);
      expect((await jobsFor(tx, c.project.id, who.luis)).at(-1)).toEqual([
        'SETUP_CHANGE',
        'LOAD 101044',
      ]);
      expect(served.lines.join('')).not.toMatch(/Marco|RVT/);

      expect(notSaved(await entered(sheet))).toEqual([
        'CERT_NUMBER_HELD',
        'Not saved: this project already has a certification 88120. A cert number is used once on a project.',
      ]);
      // A reason the firm offers for a typed number, not for a record made in the back office.
      const typed = await reasonNamed(tx, 'Barcode damaged');
      expect(notSaved(await entered({ ...sheet, certNumber: '88121', reasonId: typed }))[0]).toBe(
        'REASON_NOT_OFFERED',
      );
      expect(notTaken(await entered({ ...sheet, certNumber: '88122', capacityCy: 28 }))).toBe(
        'Not taken: the body has a field this request doesn’t take.',
      );
    });
  });

  it('AC-03-61, AC-03-58 a modified truck certified again on paper names the certification it replaces, and why: the replaced one’s tickets are queued with its own', async () => {
    await world(async (served, tx, who, within) => {
      const c = await certified(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const answer = await ask(served, luis, createCertificationEndpoint, {
        ids: c.ids,
        payload: {
          certNumber: '730420',
          kind: 'CONTAINER',
          primeId: c.coastline,
          firstTierSub: null,
          secondTierSub: null,
          vehicleTypeId: null,
          vehicleTypeOther: 'Dump trailer, sideboards rebuilt',
          crewTypeId: null,
          boxes: [
            {
              featureId: null,
              featureOther: null,
              shape: 'RECTANGLE',
              sign: 'ADD',
              length: 240,
              secondLength: null,
              width: 90,
              height: 72,
              diameter: null,
              radius: null,
              run: null,
              corners: null,
            },
          ],
          driverName: null,
          driverPhone: null,
          driverLicenceNumber: null,
          driverLicenceState: null,
          driverLicenceExpiry: null,
          tagNumber: null,
          tagState: null,
          tagExpiry: null,
          certifiedAt: '2026-10-14T13:00:00Z',
          deviceUtcOffsetMinutes: -240,
          certifiedById: who.kim,
          helperIds: [],
          clientRepresentativeName: null,
          contractorRepresentativeName: null,
          replaces: { certificationId: c.trailer.id, reason: 'Sideboards rebuilt' },
          notes: null,
          reasonId: await reasonNamed(tx, 'Device failed'),
        },
      });
      const { record } = saved(createCertificationEndpoint, answer);
      expect([record.replacesId, record.replacedReason, record.capacityCy]).toEqual([
        c.trailer.id,
        'Sideboards rebuilt',
        33,
      ]);
      expect((await jobsFor(tx, c.project.id, who.luis)).at(-1)).toEqual([
        'SETUP_CHANGE',
        'LOAD 101031',
        'UNIT_RATE 301001',
      ]);
    });
  });
});

describe('a certification corrected', () => {
  it('AC-03-62 Luis corrects 730415’s driver, tag and what was certified, and types its sub "Rivera Trucking" (a new contractor, placed under Coastline): the same certification, each value before in the audit log under him, both tickets on it queued; then Dana makes Summit its prime, and the sub is placed again under Summit by name, saved as a separate contractor with a warning since Rivera Trucking is Coastline’s on this project', async () => {
    await world(async (served, tx, who, within) => {
      const c = await certified(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const corrected = (changes: object, by: Browser = luis) =>
        ask(served, by, correctCertificationEndpoint, {
          ids: { certificationId: c.trailer.id },
          payload: { changes, note: 'Copied again from the sheet' },
        });
      const answer = await corrected({
        driverName: 'Marco Rivera',
        driverLicenceExpiry: '2028-03-31',
        tagNumber: 'RVT 4821',
        tagState: 'FL',
        tagExpiry: '2027-03-31',
        vehicleTypeOther: 'Dump trailer',
        firstTierSub: ' Rivera  Trucking ',
      });
      const { record, queued, warnings } = saved(correctCertificationEndpoint, answer);
      const rivera = await tx.contractor.findFirstOrThrow({ where: { name: 'Rivera Trucking' } });
      expect(record).toMatchObject({
        id: c.trailer.id,
        primeId: c.coastline,
        firstTierSubId: rivera.id,
        secondTierSubId: null,
        driverName: 'Marco Rivera',
        driverLicenceExpiry: '2028-03-31',
        tagNumber: 'RVT 4821',
        tagExpiry: '2027-03-31',
        vehicleTypeOther: 'Dump trailer',
        capacityCy: 36,
      });
      expect(warnings).toEqual([]);
      expect(queued).toMatchObject({ tickets: 2, lockedAsInvoiced: 0 });
      const changes = await audited(tx, answer, 'certification');
      expect([
        changes.at(-1)?.actorId,
        changes.at(-1)?.reason,
        changes.at(-1)?.before?.['driver_name'],
        changes.at(-1)?.before?.['first_tier_sub_id'],
      ]).toEqual([who.luis, 'Copied again from the sheet', null, null]);
      expect((await jobsFor(tx, c.project.id, who.luis)).at(-1)).toEqual([
        'CORRECTION',
        'LOAD 101031',
        'UNIT_RATE 301001',
      ]);
      expect(served.lines.join('')).not.toMatch(/Marco|RVT|Rivera/);

      const summit = saved(
        createContractorEndpoint,
        await ask(served, c.dana, createContractorEndpoint, {
          payload: { name: 'Summit Debris Services', kind: 'HAULER' },
        }),
      ).record.id;
      saved(
        addPrimeEndpoint,
        await ask(served, c.dana, addPrimeEndpoint, {
          ids: c.ids,
          payload: { contractorId: summit },
        }),
      );
      const moved = saved(
        correctCertificationEndpoint,
        await corrected({ primeId: summit }, c.dana),
      );
      expect(moved.record.primeId).toBe(summit);
      expect(moved.record.firstTierSubId).not.toBe(rivera.id);
      expect(moved.warnings.map(({ code }) => code)).toEqual(['SUB_PLACED_ELSEWHERE']);
      const separate = await tx.contractor.findUniqueOrThrow({
        where: { id: moved.record.firstTierSubId ?? '' },
      });
      expect(separate.name).toBe('Rivera Trucking');
      // A sub taken off: null empties it.
      const off = saved(
        correctCertificationEndpoint,
        await corrected({ firstTierSub: null }, c.dana),
      );
      expect([off.record.firstTierSubId, off.record.secondTierSubId]).toEqual([null, null]);
      expect(notSaved(await corrected({ secondTierSub: 'Tidewater Hauling' }))[0]).toBe(
        'SECOND_TIER_WITHOUT_FIRST',
      );
    });
  });

  it('AC-10-33, 37 what can’t be a certification’s detail is refused by the schema saying which field, and a prime that isn’t one of the project’s by the database, told plainly', async () => {
    await world(async (served, tx, who, within) => {
      const c = await certified(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const corrected = (changes: object) =>
        ask(served, luis, correctCertificationEndpoint, {
          ids: { certificationId: c.trailer.id },
          payload: { changes },
        });
      expect(notTaken(await corrected({}))).toMatch(/^Not taken: changes in the body /);
      expect(notTaken(await corrected({ tagExpiry: 'March 2027' }))).toBe(
        'Not taken: changes.tagExpiry in the body isn’t written the way this request takes it.',
      );
      expect(notTaken(await corrected({ driverName: '  ' }))).toBe(
        'Not taken: changes.driverName in the body is blank.',
      );
      expect(notTaken(await corrected({ capacityCy: 40, notes: 'Seen' }))).toBe(
        'Not taken: changes in the body has a field this request doesn’t take.',
      );
      const stranger = await tx.contractor.create({
        data: { name: 'Pinewood Hauling', kind: 'HAULER' },
      });
      const refused = await corrected({ primeId: stranger.id });
      expect(told(refused)).toEqual([422, 'UNKNOWN_RECORD']);
      expect(plainly(refused)).toBe(
        'Not saved: a certification’s prime is one of its own project’s primes.',
      );
    });
  });
});

describe('a box corrected, added or taken off', () => {
  it('AC-03-63 Luis takes 730415’s dog box off (38 CY) and puts it back (36), makes it add (39), measures it again as a rectangle that subtracts (35), types its feature, and adds the sheet’s missing extension after its last box (38): one row a box all the while, each change in the audit log under him, both tickets queued wherever the capacity moved; the primary is never taken off, and a crew takes no box', async () => {
    await world(async (served, tx, who, within) => {
      const c = await certified(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const changed = async (position: number, changes: object) =>
        saved(
          correctCertificationBoxEndpoint,
          await ask(served, luis, correctCertificationBoxEndpoint, {
            ids: box(c.trailer.id, position),
            payload: { changes },
          }),
        );
      const capacities: (number | null)[] = [];
      const queuedEach: unknown[] = [];
      for (const changes of [
        { takenOff: true },
        { takenOff: false },
        { sign: 'ADD' },
        { shape: 'RECTANGLE', sign: 'SUBTRACT', length: 30, width: 90, height: 40 },
        { featureOther: 'Tailgate' },
      ]) {
        const { record, queued } = await changed(2, changes);
        capacities.push(record.capacityCy);
        queuedEach.push(queued?.tickets);
      }
      expect(capacities).toEqual([38, 36, 39, 35, 35]);
      expect(queuedEach).toEqual([2, 2, 2, 2, undefined]);
      const dogBox = await tx.certificationBox.findUniqueOrThrow({
        where: { certificationId_position: { certificationId: c.trailer.id, position: 2 } },
      });
      expect([
        dogBox.shape,
        dogBox.sign,
        dogBox.length,
        dogBox.height,
        dogBox.featureId,
        dogBox.featureOther,
        dogBox.archivedAt,
      ]).toEqual(['RECTANGLE', 'SUBTRACT', 30, 40, null, 'Tailgate', null]);

      const added = await ask(served, luis, addCertificationBoxEndpoint, {
        ids: { certificationId: c.trailer.id },
        payload: {
          box: {
            featureId: null,
            featureOther: 'Extension',
            shape: 'RECTANGLE',
            sign: 'ADD',
            length: 240,
            secondLength: null,
            width: 90,
            height: 6,
            diameter: null,
            radius: null,
            run: null,
            corners: null,
          },
          note: 'Missing from the first entry',
        },
      });
      expect(saved(addCertificationBoxEndpoint, added).record.capacityCy).toBe(38);
      const [inserted] = await audited(tx, added, 'certification_box');
      expect([inserted?.operation, inserted?.actorId, inserted?.reason]).toEqual([
        'INSERT',
        who.luis,
        'Missing from the first entry',
      ]);
      expect(
        (await tx.certificationBox.findMany({ where: { certificationId: c.trailer.id } })).map(
          ({ position }) => position,
        ),
      ).toEqual([0, 1, 2, 3]);
      expect(await tx.completedLoad.count({ where: { projectId: c.project.id } })).toBe(0);

      const refused = await ask(served, luis, correctCertificationBoxEndpoint, {
        ids: box(c.trailer.id, 0),
        payload: { changes: { takenOff: true } },
      });
      expect(notSaved(refused)).toEqual([
        'PRIMARY_STAYS',
        'Not saved: box 0 is certification 730415’s primary box, the main interior. It is corrected, never taken off.',
      ]);
      const onACrew = await ask(served, luis, addCertificationBoxEndpoint, {
        ids: { certificationId: c.crew.id },
        payload: {
          box: {
            featureId: null,
            featureOther: 'Bucket',
            shape: 'RECTANGLE',
            sign: 'ADD',
            length: 40,
            secondLength: null,
            width: 40,
            height: 40,
            diameter: null,
            radius: null,
            run: null,
            corners: null,
          },
        },
      });
      expect(notSaved(onACrew)).toEqual([
        'CREW_HAS_NO_BOX',
        'Not saved: certification 730417 is a crew’s, and a crew is never measured.',
      ]);
    });
  });
});

describe('signatures on file', () => {
  it('AC-03-38 Luis, who holds QC, marks that 730415’s signatures are on file, and later that they aren’t: the same certification, each mark in the audit log under him, nothing else on it changed and nothing queued; a certification nobody made is not found', async () => {
    await world(async (served, tx, who, within) => {
      const c = await certified(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'QC');
      const marked = (onFile: unknown, certificationId = c.trailer.id) =>
        ask(served, luis, markSignaturesOnFileEndpoint, {
          ids: { certificationId },
          payload: { onFile },
        });
      const answer = await marked(true);
      const { record, queued } = saved(markSignaturesOnFileEndpoint, answer);
      expect(record).toMatchObject({ id: c.trailer.id, signaturesOnFile: true, capacityCy: 36 });
      expect(queued).toBeUndefined();
      const [change] = await audited(tx, answer, 'certification');
      expect([
        change?.operation,
        change?.actorId,
        change?.source,
        change?.before?.['signatures_on_file'],
      ]).toEqual(['UPDATE', who.luis, 'BACK_OFFICE', false]);
      expect(saved(markSignaturesOnFileEndpoint, await marked(false)).record.signaturesOnFile).toBe(
        false,
      );
      expect(await jobsFor(tx, c.project.id, who.luis)).toEqual([]);
      expect(notTaken(await marked('yes'))).toMatch(/^Not taken: onFile in the body /);
      expect(told(await marked(true, randomUUID()))).toEqual([404, 'NOT_FOUND']);
    });
  });
});

describe('a certification revoked', () => {
  it('AC-03-55 Dana, an admin, revokes 730415 from 14 October 2026 with a reason: it keeps the day, the reason and Dana, nothing else on it changes, the change is in the audit log under her and both tickets that scanned it are queued, none refused; a day without a reason, a blank reason and a day that isn’t one are refused by the schema, and Luis by the door', async () => {
    await world(async (served, tx, who, within) => {
      const c = await certified(served, tx, within, who);
      const before = await changed(tx);
      const revoked = (payload: object, as: Browser = c.dana) =>
        ask(served, as, revokeCertificationEndpoint, {
          ids: { certificationId: c.trailer.id },
          payload,
        });
      expect(notTaken(await revoked({ from: '2026-10-14' }))).toBe(
        'Not taken: reason in the body is missing.',
      );
      expect(notTaken(await revoked({ from: '2026-10-14', reason: '  ' }))).toBe(
        'Not taken: reason in the body is blank.',
      );
      expect(notTaken(await revoked({ from: '14 October', reason: 'Tailgate missing' }))).toMatch(
        /^Not taken: from in the body /,
      );
      const luis = await luisHolds(served, tx, who.luis, ...every);
      expect(told(await revoked({ from: '2026-10-14', reason: 'Tailgate missing' }, luis))).toEqual(
        [403, 'NOT_ALLOWED'],
      );
      expect(await changed(tx)).toBe(before);

      const answer = await revoked({ from: '2026-10-14', reason: ' Tailgate missing ' });
      const { record, queued } = saved(revokeCertificationEndpoint, answer);
      expect(record).toEqual({
        id: c.trailer.id,
        projectId: c.project.id,
        certNumber: '730415',
        kind: 'CONTAINER',
        primeId: c.coastline,
        firstTierSubId: null,
        secondTierSubId: null,
        capacityCy: 36,
        vehicleTypeId: null,
        vehicleTypeOther: null,
        crewTypeId: null,
        driverName: null,
        driverLicenceState: null,
        driverLicenceExpiry: null,
        tagNumber: null,
        tagState: null,
        tagExpiry: null,
        certifiedAt: '2026-10-10T13:10:00.000Z',
        deviceUtcOffsetMinutes: -240,
        certifiedById: who.kim,
        deviceId: null,
        createdById: null,
        createdReasonId: null,
        clientRepresentativeName: null,
        contractorRepresentativeName: null,
        notes: null,
        signaturesOnFile: false,
        replacesId: null,
        replacedReason: null,
        revokedFrom: '2026-10-14',
        revokedReason: 'Tailgate missing',
        revokedById: who.dana,
      });
      expect(queued).toMatchObject({ tickets: 2, lockedAsInvoiced: 0 });
      const [change] = await audited(tx, answer, 'certification');
      expect([
        change?.operation,
        change?.actorId,
        change?.source,
        change?.before?.['revoked_from'],
      ]).toEqual(['UPDATE', who.dana, 'BACK_OFFICE', null]);
      expect((await jobsFor(tx, c.project.id, who.dana)).at(-1)).toEqual([
        'SETUP_CHANGE',
        'LOAD 101031',
        'UNIT_RATE 301001',
      ]);
      // Nothing is blocked: the field events that scanned it stand as they were.
      expect(await tx.fieldEvent.count({ where: { certificationId: c.trailer.id } })).toBe(2);

      // AC-03-64: the tailgate was there after all. Luis may not take the revocation back; Dana
      // does, with a reason the audit log keeps beside what it clears, and both tickets are
      // queued again. Once taken back there is nothing to take back.
      const unrevoked = (payload: object, by: Browser = c.dana) =>
        ask(served, by, unrevokeCertificationEndpoint, {
          ids: { certificationId: c.trailer.id },
          payload,
        });
      expect(told(await unrevoked({ reason: 'Tailgate found on the yard' }, luis))).toEqual([
        403,
        'NOT_ALLOWED',
      ]);
      expect(notTaken(await unrevoked({ reason: '  ' }))).toBe(
        'Not taken: reason in the body is blank.',
      );
      const back = await unrevoked({ reason: 'Tailgate found on the yard' });
      const taken = saved(unrevokeCertificationEndpoint, back);
      expect([
        taken.record.revokedFrom,
        taken.record.revokedReason,
        taken.record.revokedById,
      ]).toEqual([null, null, null]);
      expect(taken.queued).toMatchObject({ tickets: 2, lockedAsInvoiced: 0 });
      const [lifted] = await audited(tx, back, 'certification');
      expect([
        lifted?.actorId,
        lifted?.reason,
        lifted?.before?.['revoked_from'],
        lifted?.before?.['revoked_reason'],
      ]).toEqual([who.dana, 'Tailgate found on the yard', '2026-10-14', 'Tailgate missing']);
      expect((await jobsFor(tx, c.project.id, who.dana)).at(-1)).toEqual([
        'SETUP_CHANGE',
        'LOAD 101031',
        'UNIT_RATE 301001',
      ]);
      expect(served.lines.join('')).not.toMatch(/Tailgate/);
      expect(notSaved(await unrevoked({ reason: 'Again' }))).toEqual([
        'NOT_REVOKED',
        'Certification 730415 isn’t revoked. Nothing was changed.',
      ]);
    });
  });
});

// The sync contract's own shape is what `certify` takes (task 2.6.1 part 3, ADR-469): a
// certification read by the contracts' schema, given the phone the server knows it came from.
describe('a certification as a phone sends it', () => {
  it('AC-10-35, AC-03-34 Kim certifies Rivera’s self-loader as 730416 on a phone: sent as the sync contract says, with no capacity and no phone named, it is read by the schema and made by certify, 48 CY worked out; a photograph names it; one its rules refuse is told their words and nothing is written', async () => {
    await world(async (served, tx, who, within) => {
      const c = await certified(served, tx, within, who);
      const phone = await enrolledPhone(served, tx, 'P1-HO-TDSR');
      const assignment = await tx.assignment.create({
        data: {
          personId: who.kim,
          workDate: new Date('2026-10-10'),
          projectId: c.project.id,
          certifying: true,
          origin: 'PLANNED',
          madeById: who.dana,
        },
      });
      const unmeasured = {
        secondLength: null,
        diameter: null,
        radius: null,
        run: null,
        corners: null,
      };
      const sent: SyncedCertification = {
        id: randomUUID(),
        projectId: c.project.id,
        certNumber: '730416',
        kind: 'CONTAINER',
        primeId: c.coastline,
        firstTierSub: 'Rivera Trucking',
        secondTierSub: null,
        vehicleTypeId: null,
        vehicleTypeOther: 'Self-loader',
        crewTypeId: null,
        boxes: [
          {
            ...unmeasured,
            featureId: null,
            featureOther: null,
            shape: 'RECTANGLE',
            sign: 'ADD',
            length: 264,
            width: 92,
            height: 96,
          },
          {
            ...unmeasured,
            featureId: null,
            featureOther: 'Dog box',
            shape: 'TRIANGLE',
            sign: 'SUBTRACT',
            length: 36,
            width: 92,
            height: 48,
          },
        ],
        driverName: 'Marco Rivera',
        driverPhone: null,
        driverLicenceNumber: 'R160-542-80-112-0',
        driverLicenceState: 'FL',
        driverLicenceExpiry: '2028-03-31',
        // The tag wasn't read: left empty, and left out of what certify is handed.
        tagNumber: null,
        tagState: null,
        tagExpiry: null,
        certifiedAt: '2026-10-10T13:40:00.000Z',
        deviceUtcOffsetMinutes: -240,
        certifiedById: who.kim,
        assignmentId: assignment.id,
        helperIds: [],
        clientRepresentativeName: null,
        contractorRepresentativeName: null,
        replaces: null,
        notes: null,
      };
      // As it travels: text, a time as a UTC instant.
      const read = (certification: SyncedCertification) => {
        const record = syncedRecordSchema.parse(
          JSON.parse(JSON.stringify({ record: 'CERTIFICATION', certification })),
        );
        if (record.record !== 'CERTIFICATION') throw new Error('Not a certification.');
        return { ...record.certification, deviceId: phone.id };
      };
      const certifications = new Certifications(within, served.clock, shippedPolicy);
      const before = await changed(tx);

      // What its own rules refuse is told their words, and nothing is written: a modified
      // truck that doesn't say why, and a crew with a box.
      const refusals = [];
      for (const more of [
        { replaces: { replacedId: c.trailer.id, reason: ' ' } },
        { kind: 'CREW' as const, vehicleTypeOther: 'Bucket' },
      ]) {
        const outcome = await certifications.received(read({ ...sent, ...more }));
        if (outcome.saved) throw new Error('Saved.');
        const { reason, message } = NotSaved.certificationRefused(outcome.refusal.message);
        refusals.push({ reason, message });
      }
      expect(refusals).toEqual([
        {
          reason: 'CERTIFICATION_REFUSED',
          message:
            'Not saved: certification 730416 replaces another, so it says why (sideboards added, bed rebuilt…).',
        },
        {
          reason: 'CERTIFICATION_REFUSED',
          message: 'Not saved: A crew is not measured: it has no boxes and no capacity.',
        },
      ]);
      expect(await changed(tx)).toBe(before);

      const outcome = await certifications.received(read(sent));
      if (!outcome.saved) throw new Error(outcome.refusal.message);
      const made = await tx.certification.findUniqueOrThrow({
        where: { id: sent.id },
        include: { firstTierSub: true },
      });
      expect([
        made.certNumber,
        made.capacityCy,
        made.deviceId,
        made.assignmentId,
        made.certifiedById,
        made.firstTierSub?.name,
        made.vehicleTypeOther,
        made.driverLicenceExpiry,
        made.tagExpiry,
        made.signaturesOnFile,
        made.replacesId,
      ]).toEqual([
        '730416',
        48,
        phone.id,
        assignment.id,
        who.kim,
        'Rivera Trucking',
        'Self-loader',
        new Date('2028-03-31'),
        null,
        false,
        null,
      ]);
      expect(made.certifiedAt).toEqual(new Date('2026-10-10T13:40:00Z'));
      expect(
        (
          await tx.certificationBox.findMany({
            where: { certificationId: sent.id },
            orderBy: { position: 'asc' },
          })
        ).map((box) => [box.position, box.shape, box.sign, box.featureOther, box.secondLength]),
      ).toEqual([
        [0, 'RECTANGLE', 'ADD', null, null],
        [1, 'TRIANGLE', 'SUBTRACT', 'Dog box', null],
      ]);
      const [written] = await tx.auditRecord.findMany({
        where: { tableName: 'certification', recordId: sent.id },
      });
      expect([written?.operation, written?.actorId, written?.source, written?.deviceId]).toEqual([
        'INSERT',
        who.kim,
        'DEVICE',
        phone.id,
      ]);

      // Its left side, as a photograph's record: it names the certification and its view, and
      // the server makes where its file is kept (ADR-481).
      const photoId = randomUUID();
      const answer = await new Intake(within, served.clock, shippedPolicy).photo({
        id: photoId,
        projectId: c.project.id,
        owner: { kind: 'CERTIFICATION', id: sent.id },
        view: 'LEFT',
        takenById: who.kim,
        deviceId: phone.id,
        capturedAt: new Date('2026-10-10T13:42:00Z'),
        deviceUtcOffsetMinutes: -240,
        latitude: null,
        longitude: null,
        originalSha256: 'a'.repeat(64),
        uploadedSha256: 'a'.repeat(64),
        depthSha256: null,
      });
      expect(answer).toEqual({ answer: 'SAVED', id: photoId, notes: [] });
      const photo = await tx.photo.findUniqueOrThrow({ where: { id: photoId } });
      expect([
        photo.certificationId,
        photo.view,
        photo.fieldEventId,
        photo.objectKey,
        photo.depthObjectKey,
      ]).toEqual([sent.id, 'LEFT', null, `projects/${c.project.id}/photos/${photoId}`, null]);
    });
  });
});
