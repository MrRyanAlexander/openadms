// Corrections to an ROE and to the forms, a quarantined record resolved and a record created in
// the back office, through their endpoints, against the database (spec/parts/08 steps 2, 9, "One
// review queue"; spec/acceptance/08 AC-08-19, 21, 25, 26; 10 AC-10-27, 28, 33, 37; BACKLOG 2.4.4;
// ADR-022, 149, 156, 327, 338, 364, 432). OWASP ASVS 5.0 V2, V8. The real process, in this test's
// own memory, on the installation's database as `adms_api`: it needs `pnpm local:up` after `pnpm
// installer`, and fails saying so. Each test's work is undone (support/database.ts).
//
// The API's login writes no status, flag or completed load: those are the worker's. So what is
// asked here is the record as corrected, resolved or created, its audit record and the job
// queued; what the run then concludes is the stories' (`p1-reviewed`). What the database's own
// checks refuse ends a test's piece of work, so each such refusal is its test's last request.
import { createHash, randomUUID } from 'node:crypto';

import {
  addFormDefinitionEndpoint,
  backOfficeRoles,
  correctDropOffLogEndpoint,
  correctIncidentEndpoint,
  correctRoeEndpoint,
  correctRoeScopeEndpoint,
  correctSurveyEndpoint,
  createDropOffLogEndpoint,
  createFieldEventEndpoint,
  createFormEndpoint,
  createIncidentEndpoint,
  createRoeEndpoint,
  createSiteEndpoint,
  createSurveyEndpoint,
  markSecondCopyEndpoint,
  renumberQuarantinedRecordEndpoint,
  syncedFieldEventSchema,
  type Endpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BackOfficeRecords } from '../src/review/back-office-records.ts';
import { Corrections } from '../src/review/corrections.ts';
import { QuarantineReview } from '../src/review/quarantine-review.ts';
import { Intake } from '../src/sync/intake.ts';
import type { SentFieldEvent, SentRoe } from '../src/sync/sent.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { enrolledPhone } from './support/phones.ts';
import { shippedPolicy } from './support/process.ts';
import {
  audited,
  jobsFor,
  luisHolds,
  newId,
  notTaken,
  p1WithTickets,
  reasonNamed,
} from './support/review.ts';
import { worldOn, type People, type Served } from './support/served.ts';
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
  [correctRoeEndpoint, 'CORRECT'],
  [correctRoeScopeEndpoint, 'CORRECT'],
  [correctSurveyEndpoint, 'CORRECT'],
  [correctIncidentEndpoint, 'CORRECT'],
  [correctDropOffLogEndpoint, 'CORRECT'],
  [renumberQuarantinedRecordEndpoint, 'RENUMBER'],
  [markSecondCopyEndpoint, 'RENUMBER'],
  [createFieldEventEndpoint, 'CORRECT'],
  [createRoeEndpoint, 'CORRECT'],
  [createSurveyEndpoint, 'CORRECT'],
  [createIncidentEndpoint, 'CORRECT'],
  [createDropOffLogEndpoint, 'CORRECT'],
] as const;

const records = [
  'roe',
  'roe_scope_item',
  'survey',
  'incident',
  'drop_off_log',
  'quarantined_record',
  'field_event',
];

// What has been written to these records so far, by anybody.
const written = (tx: Tx): Promise<number> =>
  tx.auditRecord.count({ where: { tableName: { in: records } } });

const wednesday = new Date('2026-10-14T15:40:00Z');
// Another day's work on the same truck: no neighbour of Wednesday's tickets.
const thursday = {
  startedAt: new Date('2026-10-15T14:10:00Z'),
  endedAt: new Date('2026-10-15T14:40:00Z'),
};

// Rosa Delgado's ROE for 412 Cedar Ct, typed in the back office by Dana.
const r0007 = (tx: Tx, projectId: string, dana: string) =>
  tx.roe.create({
    data: {
      projectId,
      roeNumber: 'R-0007',
      parcelId: 'APN 14-0321-007',
      address: '412 Cedar Ct',
      ownerName: 'Rosa Delgado',
      signed: false,
      answers: {},
      source: 'BACK_OFFICE',
      madeById: dana,
    },
  });

// What every form created in the back office records (ADR-156).
const form = async (tx: Tx, projectId: string, who: People) => ({
  projectId,
  source: 'BACK_OFFICE' as const,
  monitorId: who.kim,
  createdById: who.dana,
  createdReasonId: await reasonNamed(tx, 'Device failed'),
  madeAt: wednesday,
  deviceUtcOffsetMinutes: -240,
  answers: {},
});

// A site of the project, entered through its own request.
async function site(
  api: Served,
  p: Awaited<ReturnType<typeof p1WithTickets>>,
  tx: Tx,
  name: string,
  shortCode: string,
) {
  const siteType = await tx.siteType.findUniqueOrThrow({ where: { key: 'FINAL_DISPOSAL' } });
  return saved(
    createSiteEndpoint,
    await ask(api, p.dana, createSiteEndpoint, {
      ids: p.ids,
      payload: {
        name,
        shortCode,
        siteTypeId: siteType.id,
        takesLoads: true,
        haulOutsLeaveHere: false,
        chargesTippingFee: false,
        ineligibleSite: false,
        permitNumber: null,
        latitude: '39.12',
        longitude: '-75.7',
        activationDate: '2026-10-12',
      },
    }),
  ).record;
}

// Kim's phone at the Landfill tower on Wednesday, with her assignment: what a record made on a
// phone names.
async function kimsPhone(served: Served, tx: Tx, projectId: string, who: People) {
  const device = await enrolledPhone(served, tx, 'P1-TWR-LF');
  const assignment = await tx.assignment.create({
    data: {
      personId: who.kim,
      workDate: new Date('2026-10-14'),
      projectId,
      fieldEventKinds: ['DISPOSAL'],
      origin: 'PLANNED',
      madeById: who.dana,
    },
  });
  return { deviceId: device.id, assignmentId: assignment.id };
}

// A disposal as Kim's phone sends it.
const disposal = async (
  tx: Tx,
  projectId: string,
  who: People,
  phone: { deviceId: string; assignmentId: string },
  ticketNumber: string,
  startedAt: string,
): Promise<SentFieldEvent> => ({
  id: await newId(tx),
  projectId,
  workflow: 'LOAD',
  kind: 'DISPOSAL',
  ticketNumber,
  splitSuffix: '',
  monitorId: who.kim,
  source: 'DEVICE',
  ...phone,
  setupVersion: 1,
  masterPasscodeSession: null,
  numberTyped: false,
  numberTypedReasonId: null,
  certNumber: '730415',
  certKeyedByHand: false,
  typedCapacityCy: null,
  siteId: null,
  startedAt: new Date(startedAt),
  endedAt: new Date(new Date(startedAt).getTime() + 4 * 60_000),
  deviceUtcOffsetMinutes: -240,
  endLatitude: null,
  endLongitude: null,
  address: null,
  addressSource: null,
  notes: null,
  formDebrisTypeId: null,
  fieldTagId: null,
  roeNumber: null,
  estimateCy: null,
  loadCall: 85,
  scaleReceiptId: null,
  carriedCount: null,
  kindOfWorkId: null,
  payableTypeId: null,
  payItemId: null,
  unitCount: null,
  measurementInches: null,
  measuredAs: null,
  rootBallInches: null,
  rootBallHalfExposed: null,
  surveyNumber: null,
  markedIneligible: null,
  items: [],
  carriedTickets: [],
});

describe('who may ask', () => {
  it('AC-10-27 a correction to an ROE or a form and a record created in the back office are open to an admin and to a manager/analyst who holds correct; resolving a quarantined record to one who holds renumber', () => {
    for (const [served, permission] of requests) {
      const { access, roles, permission: asked } = served as Endpoint;
      expect([access, roles, asked], served.name).toEqual([
        'SIGNED_IN',
        backOfficeRoles,
        permission,
      ]);
    }
  });

  it('AC-10-27 each is refused to nobody, to a read-only viewer and to a manager/analyst who holds every permission but its own, before anything sent is read; nothing is written', async () => {
    await world(async (served, tx, who, within) => {
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      const before = await written(tx);
      // A body no schema would take: the door answers first, and says nothing of it.
      const nonsense = { payload: { nonsense: true } };
      for (const [endpoint] of requests) {
        expect(told(await ask(served, undefined, endpoint, nonsense)), endpoint.name).toEqual([
          401,
          'NOT_SIGNED_IN',
        ]);
        const refused = await ask(served, viewer, endpoint, nonsense);
        expect(told(refused), endpoint.name).toEqual([403, 'NOT_ALLOWED']);
        expect(Object.keys(refused.body as object).sort()).toEqual(['code', 'requestId']);
      }
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
      const grants = new Map<string, string>();
      for (const permission of every) {
        const grant = await tx.userPermission.create({
          data: { userId: who.luis, permission: permission as 'VOID' },
        });
        grants.set(permission, grant.id);
      }
      const luis = await luisHolds(served, tx, who.luis);
      for (const [endpoint, permission] of requests) {
        // Dana takes this one away: his very next request is refused, with the same session.
        await tx.userPermission.update({
          where: { id: grants.get(permission) ?? '' },
          data: { archivedAt: new Date() },
        });
        expect(told(await ask(served, luis, endpoint, nonsense)), endpoint.name).toEqual([
          403,
          'NOT_ALLOWED',
        ]);
        await tx.userPermission.update({
          where: { id: grants.get(permission) ?? '' },
          data: { archivedAt: null },
        });
        // Given back, the door lets him through to the schema, which refuses the nonsense.
        expect(told(await ask(served, luis, endpoint, nonsense)), endpoint.name).toEqual([
          400,
          'BAD_REQUEST',
        ]);
      }
      expect(await written(tx)).toBe(before);
    });
  });

  it('AC-10-28 each service refuses again inside its own piece of work: called as a manager/analyst without the grant, a read-only viewer or a monitor, nothing is written', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const before = await written(tx);
      const corrections = new Corrections(within, served.clock, shippedPolicy);
      const quarantine = new QuarantineReview(within, served.clock, shippedPolicy);
      const backOffice = new BackOfficeRecords(within, served.clock, shippedPolicy);
      const id = randomUUID();
      const entered = await disposal(
        tx,
        p.project.id,
        who,
        { deviceId: id, assignmentId: id },
        '101029',
        '2026-10-14T15:22:00Z',
      );
      // Each asks for its own: correct opens no quarantined record, renumber no correction.
      const codes = async (asked: Promise<{ saved: boolean; refusal?: { code: string } }>[]) =>
        (await Promise.all(asked)).map((outcome) => outcome.refusal?.code ?? 'saved');
      const held = await tx.userPermission.create({
        data: { userId: who.luis, permission: 'CORRECT' },
      });
      expect(
        await codes([
          quarantine.renumber(who.luis, id, { ticketNumber: '101021' }),
          quarantine.secondCopy(who.luis, id),
        ]),
      ).toEqual(['NOT_PERMITTED', 'NOT_PERMITTED']);
      await tx.userPermission.update({ where: { id: held.id }, data: { permission: 'RENUMBER' } });
      expect(
        await codes([
          corrections.roe(who.luis, id, { notes: 'Seen' }),
          corrections.roeScope(who.luis, id, { payableTypeId: id }, true),
          corrections.survey(who.luis, id, { notes: 'Seen' }),
          corrections.incident(who.luis, id, { notes: 'Seen' }),
          corrections.dropOffLog(who.luis, id, { notes: 'Seen' }),
          backOffice.fieldEvent(who.luis, {
            ...entered,
            reasonId: await reasonNamed(tx, 'Device failed'),
          }),
        ]),
      ).toEqual([1, 2, 3, 4, 5, 6].map(() => 'NOT_PERMITTED'));
      await tx.userPermission.update({ where: { id: held.id }, data: { archivedAt: new Date() } });
      for (const person of [who.luis, who.viewer, who.kim]) {
        const refusals = [
          await corrections.roe(person, id, { notes: 'Seen' }),
          await corrections.roeScope(person, id, { payableTypeId: id }, true),
          await corrections.survey(person, id, { notes: 'Seen' }),
          await corrections.incident(person, id, { notes: 'Seen' }),
          await corrections.dropOffLog(person, id, { notes: 'Seen' }),
          await quarantine.renumber(person, id, { ticketNumber: '101021' }),
          await quarantine.secondCopy(person, id),
          await backOffice.fieldEvent(person, {
            ...entered,
            reasonId: await reasonNamed(tx, 'Device failed'),
          }),
        ];
        expect(refusals.map((outcome) => (outcome.saved ? 'saved' : outcome.refusal.code))).toEqual(
          refusals.map(() => 'NOT_PERMITTED'),
        );
      }
      expect(await written(tx)).toBe(before);
    });
  });
});

describe('an ROE corrected', () => {
  it('AC-08-19 Luis corrects ROE R-0007, signed on 9 October, and adds Vegetative to its scope: the same records, each change in the audit log under him with his note, and the ticket on the ROE queued each time; a pick is taken off and put back as one row; one its scope never had can’t be taken off', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const roe = await r0007(tx, p.project.id, who.dana);
      const collection = await p.created('COLLECTION', '101032', {
        roeNumber: 'R-0007',
        ...thursday,
      });
      expect(collection.roeId).toBe(roe.id);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const ids = { roeId: roe.id };
      const correct = (payload: object) => ask(served, luis, correctRoeEndpoint, { ids, payload });
      const scope = (payload: object, at = ids) =>
        ask(served, luis, correctRoeScopeEndpoint, { ids: at, payload });

      const note = 'Signed copy came in on Friday';
      const answer = await correct({
        changes: { signed: true, signedDate: '2026-10-09', ownerName: ' Rosa M. Delgado ' },
        note,
      });
      const { record, queued } = saved(correctRoeEndpoint, answer);
      expect(record).toEqual({
        id: roe.id,
        projectId: p.project.id,
        roeNumber: 'R-0007',
        parcelId: 'APN 14-0321-007',
        address: '412 Cedar Ct',
        ownerName: 'Rosa M. Delgado',
        signed: true,
        signedDate: '2026-10-09',
        fix: null,
        source: 'BACK_OFFICE',
        madeById: who.dana,
        madeAt: null,
        notes: null,
        answers: {},
        formDefinitionId: null,
      });
      expect(queued).toMatchObject({ tickets: 1, lockedAsInvoiced: 0 });
      const [change] = await audited(tx, answer, 'roe');
      expect([
        change?.operation,
        change?.actorId === who.luis,
        change?.source,
        change?.reason,
        change?.before?.['owner_name'],
        change?.before?.['signed'],
      ]).toEqual(['UPDATE', true, 'BACK_OFFICE', note, 'Rosa Delgado', false]);
      expect(served.lines.join('')).not.toMatch(/Delgado|Signed copy/);
      // A detail that may be empty is emptied by stating it empty.
      expect(
        saved(correctRoeEndpoint, await correct({ changes: { parcelId: null } })).record.parcelId,
      ).toBeNull();

      const vegetative = await tx.payableType.findFirstOrThrow({ where: { name: 'Vegetative' } });
      const pick = { payableTypeId: vegetative.id };
      const added = await scope({ pick: { ...pick, count: 3 }, inScope: true, note: 'Three oaks' });
      const inScope = saved(correctRoeScopeEndpoint, added);
      expect(inScope.record).toMatchObject({
        projectId: p.project.id,
        roeId: roe.id,
        formDebrisTypeId: null,
        payableTypeId: vegetative.id,
        count: 3,
        takenOffAt: null,
      });
      expect(inScope.queued).toMatchObject({ tickets: 1 });
      expect((await audited(tx, added, 'roe_scope_item')).map((one) => one.operation)).toEqual([
        'INSERT',
      ]);
      const off = saved(correctRoeScopeEndpoint, await scope({ pick, inScope: false })).record;
      expect([off.id, off.count, typeof off.takenOffAt]).toEqual([inScope.record.id, 3, 'string']);
      const back = await scope({ pick: { ...pick, count: null }, inScope: true });
      expect(saved(correctRoeScopeEndpoint, back).record).toMatchObject({
        id: inScope.record.id,
        count: null,
        takenOffAt: null,
      });
      expect((await audited(tx, back, 'roe_scope_item'))[0]?.actorId).toBe(who.luis);
      expect(await tx.roeScopeItem.count({ where: { roeId: roe.id } })).toBe(1);
      expect(await jobsFor(tx, p.project.id, who.luis)).toEqual(
        [1, 2, 3, 4, 5].map(() => ['CORRECTION', 'LOAD 101032']),
      );

      const leaners = await tx.payableType.findFirstOrThrow({ where: { name: 'Leaners' } });
      expect(told(await scope({ pick: { payableTypeId: leaners.id }, inScope: false }))).toEqual([
        404,
        'NOT_FOUND',
      ]);
      expect(told(await scope({ pick, inScope: true }, { roeId: randomUUID() }))).toEqual([
        404,
        'NOT_FOUND',
      ]);
      expect(told(await correct({ changes: { notes: 'Seen' } }))).toEqual([200, undefined]);
      expect(
        told(
          await ask(served, luis, correctRoeEndpoint, { payload: { changes: { notes: 'Seen' } } }),
        ),
      ).toEqual([404, 'NOT_FOUND']);
    });
  });

  it('AC-10-37 what can’t be an ROE’s detail is refused by the schema, saying which field: a day that isn’t one, a blank owner, a count of nought, two picks at once, a blank number', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const roe = await r0007(tx, p.project.id, who.dana);
      const before = await written(tx);
      const ids = { roeId: roe.id };
      const correct = (changes: object) =>
        ask(served, p.dana, correctRoeEndpoint, { ids, payload: { changes } });
      const scope = (payload: object) =>
        ask(served, p.dana, correctRoeScopeEndpoint, { ids, payload });

      expect(notTaken(await correct({ signedDate: '9 October' }))).toBe(
        'Not taken: changes.signedDate in the body isn’t written the way this request takes it.',
      );
      expect(notTaken(await correct({ ownerName: '  ' }))).toBe(
        'Not taken: changes.ownerName in the body is blank.',
      );
      expect(notTaken(await correct({}))).toBe(
        'Not taken: changes in the body isn’t taken as it stands.',
      );
      // Its number is corrected (AC-08-68), never to a blank.
      expect(notTaken(await correct({ roeNumber: '  ' }))).toBe(
        'Not taken: changes.roeNumber in the body is blank.',
      );
      const id = randomUUID();
      expect(
        notTaken(await scope({ pick: { payableTypeId: id, count: 0 }, inScope: true })),
      ).toMatch(/^Not taken: pick/);
      expect(
        notTaken(await scope({ pick: { payableTypeId: id, formDebrisTypeId: id }, inScope: true })),
      ).toMatch(/^Not taken: pick/);
      expect(notTaken(await scope({ pick: { payableTypeId: id } }))).toBe(
        'Not taken: inScope in the body is missing.',
      );
      expect(await written(tx)).toBe(before);
    });
  });
});

describe('a form corrected', () => {
  it('AC-08-19 Luis corrects a survey, an incident and a drop-off log the same way: each the same record, the value before in the audit log under him; a corrected ROE number finds its ROE; the survey’s change asks the run to check the project’s surveys, and the other two queue nothing', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const roe = await r0007(tx, p.project.id, who.dana);
      const made = await form(tx, p.project.id, who);
      const preWork = await tx.surveyWorkType.findUniqueOrThrow({ where: { key: 'PRE_WORK' } });
      const postWork = await tx.surveyWorkType.findUniqueOrThrow({ where: { key: 'POST_WORK' } });
      const survey = await tx.survey.create({
        data: { ...made, workTypeId: preWork.id, roeNumber: 'R-0070' },
      });
      const damage = await tx.incidentType.findFirstOrThrow({
        where: { name: 'Property damage' },
      });
      const nearMiss = await tx.incidentType.findFirstOrThrow({ where: { name: 'Near miss' } });
      const incident = await tx.incident.create({
        data: { ...made, incidentTypeId: damage.id, address: '22 Elm St' },
      });
      const landfill = await site(served, p, tx, 'Bayline County Landfill', 'BCL');
      const cypress = await site(served, p, tx, 'Cypress Creek Landfill', 'CCL');
      const log = await tx.dropOffLog.create({
        data: { ...made, siteId: landfill.id, residentName: 'Carl Jensen' },
      });
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');

      const surveyed = await ask(served, luis, correctSurveyEndpoint, {
        ids: { surveyId: survey.id },
        payload: {
          changes: {
            roeNumber: 'R-0007',
            workTypeId: postWork.id,
            surveyNumber: 'APN 14-0321-007',
          },
          note: 'Typed a 70 for a 7',
        },
      });
      expect(saved(correctSurveyEndpoint, surveyed).record).toEqual({
        id: survey.id,
        projectId: p.project.id,
        source: 'BACK_OFFICE',
        createdById: who.dana,
        createdReasonId: made.createdReasonId,
        monitorId: who.kim,
        madeAt: wednesday.toISOString(),
        deviceUtcOffsetMinutes: -240,
        fix: null,
        notes: null,
        answers: {},
        formDefinitionId: null,
        workTypeId: postWork.id,
        surveyNumber: 'APN 14-0321-007',
        roeNumber: 'R-0007',
        roeId: roe.id,
      });
      const [surveyChange] = await audited(tx, surveyed, 'survey');
      expect([
        surveyChange?.actorId === who.luis,
        surveyChange?.reason,
        surveyChange?.before?.['roe_number'],
      ]).toEqual([true, 'Typed a 70 for a 7', 'R-0070']);
      // It is on no ticket: its job names none, and the run checks the project's surveys.
      expect(await jobsFor(tx, p.project.id, who.luis)).toEqual([['CORRECTION']]);

      const corrected = await ask(served, luis, correctIncidentEndpoint, {
        ids: { incidentId: incident.id },
        payload: {
          changes: {
            incidentTypeId: nearMiss.id,
            description: 'Mailbox clipped by the trailer, not knocked down',
            certNumber: '730415',
            roeNumber: 'R-0007',
          },
          note: 'Kim’s photographs show it standing',
        },
      });
      const told2 = saved(correctIncidentEndpoint, corrected);
      expect(told2.record).toMatchObject({
        id: incident.id,
        incidentTypeId: nearMiss.id,
        incidentSubTypeId: null,
        description: 'Mailbox clipped by the trailer, not knocked down',
        address: '22 Elm St',
        certNumber: '730415',
        // No certification on the project has that number yet (ADR-154).
        certificationId: null,
        roeNumber: 'R-0007',
        roeId: roe.id,
      });
      expect(told2.queued).toMatchObject({ tickets: 0 });
      const [incidentChange] = await audited(tx, corrected, 'incident');
      expect([incidentChange?.actorId, incidentChange?.reason]).toEqual([
        who.luis,
        'Kim’s photographs show it standing',
      ]);

      const logged = await ask(served, luis, correctDropOffLogEndpoint, {
        ids: { dropOffLogId: log.id },
        payload: {
          changes: { siteId: cypress.id, originAddress: '14 Heron St' },
          note: 'Logged at the wrong gate',
        },
      });
      expect(saved(correctDropOffLogEndpoint, logged).record).toMatchObject({
        id: log.id,
        siteId: cypress.id,
        residentName: 'Carl Jensen',
        originAddress: '14 Heron St',
      });
      const [logChange] = await audited(tx, logged, 'drop_off_log');
      expect([logChange?.actorId, logChange?.reason, logChange?.before?.['site_id']]).toEqual([
        who.luis,
        'Logged at the wrong gate',
        landfill.id,
      ]);
      expect(await jobsFor(tx, p.project.id, who.luis)).toEqual([['CORRECTION']]);
      expect(served.lines.join('')).not.toMatch(/Jensen|Mailbox|Heron/);

      // A survey that answers no version of a form's own fields takes no answers (AC-08-69).
      expect(
        notSaved(
          await ask(served, luis, correctSurveyEndpoint, {
            ids: { surveyId: survey.id },
            payload: { changes: { answers: { answers: { fenceDamaged: true } } } },
          }),
        ),
      ).toEqual([
        'ANSWERS_DO_NOT_FIT',
        'This record answers no version of a form’s own fields, so it takes no answers: name the version they answer. Nothing was saved.',
      ]);
      expect(
        notTaken(
          await ask(served, luis, correctIncidentEndpoint, {
            ids: { incidentId: incident.id },
            payload: { changes: { description: '' } },
          }),
        ),
      ).toBe('Not taken: changes.description in the body is blank.');
      for (const endpoint of [
        correctSurveyEndpoint,
        correctIncidentEndpoint,
        correctDropOffLogEndpoint,
      ]) {
        expect(
          told(await ask(served, luis, endpoint, { payload: { changes: { notes: 'Seen' } } })),
          endpoint.name,
        ).toEqual([404, 'NOT_FOUND']);
      }
    });
  });

  it('AC-10-33 a drop-off log moved to a site that isn’t one of its project’s is the database’s own refusal, told plainly', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const landfill = await site(served, p, tx, 'Bayline County Landfill', 'BCL');
      const log = await tx.dropOffLog.create({
        data: { ...(await form(tx, p.project.id, who)), siteId: landfill.id },
      });
      const answer = await ask(served, p.dana, correctDropOffLogEndpoint, {
        ids: { dropOffLogId: log.id },
        payload: { changes: { siteId: randomUUID() } },
      });
      expect(told(answer)).toEqual([422, 'UNKNOWN_RECORD']);
      expect(plainly(answer)).toBe(
        'Not saved: a drop-off log’s site is one of its own project’s sites.',
      );
    });
  });
});

describe('a quarantined record resolved', () => {
  it('AC-08-25, 26 Kim’s second disposal scanned 101020 waits in quarantine; Luis renumbers it to 101021: it is a field event with the id its phone made and its photograph, written as Luis from the back office, both tickets queued; the quarantined record stays, marked resolved by him, when and how; resolved once; a manager/analyst needs renumber', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const phone = await kimsPhone(served, tx, p.project.id, who);
      const intake = new Intake(within, served.clock, shippedPolicy);
      const first = await disposal(tx, p.project.id, who, phone, '101020', '2026-10-14T14:22:00Z');
      const second = await disposal(tx, p.project.id, who, phone, '101020', '2026-10-14T15:40:00Z');
      const third = await disposal(tx, p.project.id, who, phone, '101020', '2026-10-14T15:41:00Z');
      expect((await intake.receive({ record: 'FIELD_EVENT', fieldEvent: first })).answer).toBe(
        'SAVED',
      );
      for (const sent of [second, third]) {
        expect((await intake.receive({ record: 'FIELD_EVENT', fieldEvent: sent })).answer).toBe(
          'QUARANTINED',
        );
      }
      const fingerprint = createHash('sha256').update(second.id).digest('hex');
      const photo = await tx.photo.create({
        data: {
          id: await newId(tx),
          projectId: p.project.id,
          quarantinedRecordId: second.id,
          capturedAt: second.endedAt,
          deviceUtcOffsetMinutes: -240,
          originalSha256: fingerprint,
          uploadedSha256: fingerprint,
          objectKey: `photographs/${second.id}/tower`,
        },
      });
      const sentAsKept = (
        await tx.quarantinedRecord.findUniqueOrThrow({ where: { id: second.id } })
      ).payload;
      const resolve = (signed: Browser, id: string, payload: object) =>
        ask(served, signed, renumberQuarantinedRecordEndpoint, {
          ids: { quarantinedRecordId: id },
          payload,
        });

      const corrector = await luisHolds(served, tx, who.luis, 'CORRECT', 'VOID');
      expect(told(await resolve(corrector, second.id, { to: { ticketNumber: '101021' } }))).toEqual(
        [403, 'NOT_ALLOWED'],
      );
      await tx.userPermission.create({ data: { userId: who.luis, permission: 'RENUMBER' } });
      const luis = corrector;

      const note = 'One truck, two trips: the second was 101021';
      const answer = await resolve(luis, second.id, { to: { ticketNumber: ' 101021 ' }, note });
      const { record, queued } = saved(renumberQuarantinedRecordEndpoint, answer);
      expect(record).toMatchObject({
        id: second.id,
        projectId: p.project.id,
        reason: 'DUPLICATE_FIELD_EVENT',
        holdingEventId: first.id,
        holdingRoeId: null,
        resolvedById: who.luis,
        resolution: 'Renumbered to 101021: saved as a record of its own, with its photographs.',
      });
      expect(typeof record.resolvedAt).toBe('string');
      // Never what the phone sent.
      expect(Object.keys(record)).not.toContain('payload');
      expect(queued).toMatchObject({ tickets: 2, lockedAsInvoiced: 0 });
      expect(await jobsFor(tx, p.project.id, who.luis)).toEqual([
        ['CORRECTION', 'LOAD 101020', 'LOAD 101021'],
      ]);
      const event = await tx.fieldEvent.findUniqueOrThrow({ where: { id: second.id } });
      expect([event.ticketNumber, event.kind, event.source, event.loadCall, event.status]).toEqual([
        '101021',
        'DISPOSAL',
        'DEVICE',
        85,
        'PENDING',
      ]);
      expect(event.startedAt.toISOString()).toBe('2026-10-14T15:40:00.000Z');
      const moved = await tx.photo.findUniqueOrThrow({ where: { id: photo.id } });
      expect([moved.fieldEventId, moved.quarantinedRecordId]).toEqual([second.id, null]);
      const [inserted] = await audited(tx, answer, 'field_event');
      expect([
        inserted?.operation,
        inserted?.actorId === who.luis,
        inserted?.source,
        inserted?.reason,
      ]).toEqual(['INSERT', true, 'BACK_OFFICE', note]);
      const kept = await tx.quarantinedRecord.findUniqueOrThrow({ where: { id: second.id } });
      expect(kept.payload).toEqual(sentAsKept);
      expect(
        (kept.payload as { fieldEvent: { ticketNumber: string } }).fieldEvent.ticketNumber,
      ).toBe('101020');
      // 101020's own disposal is not touched.
      expect(
        (await tx.fieldEvent.findUniqueOrThrow({ where: { id: first.id } })).ticketNumber,
      ).toBe('101020');

      expect(notSaved(await resolve(luis, second.id, { to: { ticketNumber: '101022' } }))).toEqual([
        'ALREADY_RESOLVED',
        'This quarantined record is already resolved (Renumbered to 101021: saved as a record of its own, with its photographs.). Nothing was changed.',
      ]);
      // The third: a number a disposal holds, the other kind of number, then a second copy.
      expect(notSaved(await resolve(luis, third.id, { to: { ticketNumber: '101021' } }))).toEqual([
        'NUMBER_HELD',
        'Ticket 101021 already has a disposal: a ticket has one of each kind. Nothing was changed.',
      ]);
      expect(notSaved(await resolve(luis, third.id, { to: { roeNumber: 'R-0009' } }))).toEqual([
        'NOT_THIS_KIND_OF_NUMBER',
        'This quarantined record is a field event: it is given a ticket number, not an ROE number. Nothing was changed.',
      ]);
      expect(notTaken(await resolve(luis, third.id, { to: { ticketNumber: ' ' } }))).toMatch(
        /^Not taken: to/,
      );
      expect(notTaken(await resolve(luis, third.id, {}))).toBe(
        'Not taken: to in the body is missing.',
      );
      const copy = await ask(served, luis, markSecondCopyEndpoint, {
        ids: { quarantinedRecordId: third.id },
        payload: { note: 'Sent twice from the same screen' },
      });
      const marked = saved(markSecondCopyEndpoint, copy);
      expect(marked.record).toMatchObject({
        id: third.id,
        resolvedById: who.luis,
        resolution: 'A second copy of the record that holds its number: nothing was made from it.',
      });
      expect(marked.queued).toMatchObject({ tickets: 0 });
      expect(await tx.fieldEvent.findUnique({ where: { id: third.id } })).toBeNull();
      const [resolved] = await audited(tx, copy, 'quarantined_record');
      expect([resolved?.operation, resolved?.actorId === who.luis, resolved?.reason]).toEqual([
        'UPDATE',
        true,
        'Sent twice from the same screen',
      ]);
      expect(
        notSaved(
          await ask(served, luis, markSecondCopyEndpoint, {
            ids: { quarantinedRecordId: third.id },
            payload: {},
          }),
        )[0],
      ).toBe('ALREADY_RESOLVED');
      expect(told(await resolve(luis, randomUUID(), { to: { ticketNumber: '101023' } }))).toEqual([
        404,
        'NOT_FOUND',
      ]);
      expect(await tx.quarantinedRecord.count({ where: { projectId: p.project.id } })).toBe(2);
      expect(served.lines.join('')).not.toMatch(/One truck|Sent twice/);
    });
  });

  it('a quarantined ROE is given a new number the same way: it becomes an ROE with the id its phone made, the collection that was waiting for an ROE of that number points at it and is queued; a number an ROE holds and a ticket number are refused in plain words', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const held = await r0007(tx, p.project.id, who.dana);
      const phone = await kimsPhone(served, tx, p.project.id, who);
      const waitingFor = await p.created('COLLECTION', '101032', {
        roeNumber: 'R-0009',
        ...thursday,
      });
      expect(waitingFor.roeId).toBeNull();
      const sent: SentRoe = {
        id: await newId(tx),
        projectId: p.project.id,
        roeNumber: 'R-0007',
        parcelId: 'APN 14-0321-008',
        address: '416 Cedar Ct',
        ownerName: 'Ben Whitaker',
        signed: true,
        signedDate: '2026-10-13',
        source: 'DEVICE',
        madeById: who.kim,
        ...phone,
        madeAt: wednesday,
        deviceUtcOffsetMinutes: -240,
      };
      const intake = new Intake(within, served.clock, shippedPolicy);
      expect((await intake.receive({ record: 'ROE', roe: sent })).answer).toBe('QUARANTINED');
      const luis = await luisHolds(served, tx, who.luis, 'RENUMBER');
      const resolve = (to: object) =>
        ask(served, luis, renumberQuarantinedRecordEndpoint, {
          ids: { quarantinedRecordId: sent.id },
          payload: { to },
        });

      expect(notSaved(await resolve({ roeNumber: 'R-0007' }))).toEqual([
        'ROE_NUMBER_HELD',
        'ROE R-0007: this project already has an ROE with that number. Nothing was changed.',
      ]);
      expect(notSaved(await resolve({ ticketNumber: '101033' }))).toEqual([
        'NOT_THIS_KIND_OF_NUMBER',
        'This quarantined record is an ROE: it is given an ROE number, not a ticket number. Nothing was changed.',
      ]);
      const answer = await resolve({ roeNumber: 'R-0009' });
      const { record, queued } = saved(renumberQuarantinedRecordEndpoint, answer);
      expect(record).toMatchObject({
        id: sent.id,
        reason: 'DUPLICATE_ROE_NUMBER',
        holdingEventId: null,
        holdingRoeId: held.id,
        resolvedById: who.luis,
        resolution: 'Renumbered to ROE R-0009: saved as a record of its own, with its photographs.',
      });
      expect(queued).toMatchObject({ tickets: 1 });
      const roe = await tx.roe.findUniqueOrThrow({ where: { id: sent.id } });
      expect([roe.roeNumber, roe.ownerName, roe.source, roe.madeById]).toEqual([
        'R-0009',
        'Ben Whitaker',
        'DEVICE',
        who.kim,
      ]);
      expect((await audited(tx, answer, 'roe')).map((one) => [one.operation, one.actorId])).toEqual(
        [['INSERT', who.luis]],
      );
      expect((await tx.fieldEvent.findUniqueOrThrow({ where: { id: waitingFor.id } })).roeId).toBe(
        sent.id,
      );
      expect(await jobsFor(tx, p.project.id, who.luis)).toEqual([['CORRECTION', 'LOAD 101032']]);
    });
  });
});

describe('a record created in the back office', () => {
  it('AC-08-21 the Landfill tower’s phone failed, and Luis creates Kim’s disposal on 101029 with the reason "Device failed": a field event like any other, PENDING, marked with Luis and the reason, with no phone or assignment, its ticket queued in the same request; a number its kind holds, a reason the firm doesn’t offer for this and a fix that can’t be one are refused in plain words', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const deviceFailed = await reasonNamed(tx, 'Device failed');
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const entered = {
        workflow: 'LOAD',
        kind: 'DISPOSAL',
        ticketNumber: '101029',
        monitorId: who.kim,
        startedAt: '2026-10-14T15:22:00.000Z',
        endedAt: '2026-10-14T15:26:00.000Z',
        deviceUtcOffsetMinutes: -240,
        certNumber: '730415',
        loadCall: 75,
        end: { latitude: '39.12', longitude: '-75.7' },
        notes: 'From the tower log sheet',
        reasonId: deviceFailed,
      };
      const create = (payload: object, ids = p.ids) =>
        ask(served, luis, createFieldEventEndpoint, { ids, payload });

      const answer = await create(entered);
      const { record, queued } = saved(createFieldEventEndpoint, answer);
      expect(record).toMatchObject({
        projectId: p.project.id,
        workflow: 'LOAD',
        kind: 'DISPOSAL',
        ticketNumber: '101029',
        splitSuffix: '',
        source: 'BACK_OFFICE',
        monitorId: who.kim,
        startedAt: entered.startedAt,
        endedAt: entered.endedAt,
        start: null,
        end: { latitude: '39.12000000', longitude: '-75.70000000' },
        certNumber: '730415',
        certKeyedByHand: false,
        numberTyped: false,
        loadCall: 75,
        notes: 'From the tower log sheet',
        siteId: null,
        scaleReceiptId: null,
      });
      expect(Object.keys(record)).not.toContain('status');
      expect(queued).toMatchObject({ tickets: 1, lockedAsInvoiced: 0 });
      expect(await jobsFor(tx, p.project.id, who.luis)).toEqual([['CORRECTION', 'LOAD 101029']]);
      const kept = await tx.fieldEvent.findUniqueOrThrow({ where: { id: record.id } });
      expect([
        kept.status,
        kept.createdById,
        kept.createdReasonId,
        kept.deviceId,
        kept.assignmentId,
        kept.setupVersion,
      ]).toEqual(['PENDING', who.luis, deviceFailed, null, null, null]);
      const [inserted] = await audited(tx, answer, 'field_event');
      expect([inserted?.operation, inserted?.actorId === who.luis, inserted?.source]).toEqual([
        'INSERT',
        true,
        'BACK_OFFICE',
      ]);
      expect(served.lines.join('')).not.toMatch(/tower log sheet|101029/);

      // An itemised unit rate ticket, with its lines, and a split's collection with its estimate.
      const dryer = await tx.itemName.findFirstOrThrow({ where: { name: 'Dryer' } });
      const whiteGoods = saved(
        createFieldEventEndpoint,
        await create({
          ...entered,
          workflow: 'UNIT_RATE',
          kind: 'UNIT_RATE',
          ticketNumber: '301002',
          loadCall: undefined,
          items: [{ itemNameId: dryer.id, quantity: 2 }],
        }),
      ).record;
      expect(
        (await tx.fieldEventItem.findMany({ where: { fieldEventId: whiteGoods.id } })).map((line) =>
          line.quantity.toNumber(),
        ),
      ).toEqual([2]);
      expect(
        saved(
          createFieldEventEndpoint,
          await create({
            ...entered,
            kind: 'COLLECTION',
            ticketNumber: '101034',
            splitSuffix: 'A',
            estimateCy: 12.5,
            loadCall: undefined,
            carriedTickets: ['301002'],
          }),
        ).record,
      ).toMatchObject({ ticketNumber: '101034', splitSuffix: 'A', estimateCy: 12.5 });

      expect(notSaved(await create(entered))).toEqual([
        'NUMBER_HELD',
        'Ticket 101029 already has a disposal: a ticket has one of each kind. Nothing was changed.',
      ]);
      const another = { ...entered, ticketNumber: '101030' };
      expect(
        notSaved(
          await create({ ...another, reasonId: await reasonNamed(tx, 'Duplicate ticket') }),
        )[0],
      ).toBe('REASON_NOT_OFFERED');
      expect(
        notSaved(await create({ ...another, end: { latitude: '95', longitude: '-75.7' } }))[0],
      ).toBe('GPS_UNREADABLE');
      expect(told(await create({ ...another, reasonId: randomUUID() }))).toEqual([
        404,
        'NOT_FOUND',
      ]);
      expect(await tx.fieldEvent.count({ where: { projectId: p.project.id } })).toBe(5);
      expect((await jobsFor(tx, p.project.id, who.luis)).length).toBe(3);
    });
  });

  it('AC-10-37 what can’t be a field event’s detail is refused by the schema before any service runs, saying which field: a load call of 140, no monitor, a time that isn’t one, and what only a phone or the worker says', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const before = await written(tx);
      const entered = {
        workflow: 'LOAD',
        kind: 'DISPOSAL',
        ticketNumber: '101029',
        monitorId: who.kim,
        startedAt: '2026-10-14T15:22:00.000Z',
        endedAt: '2026-10-14T15:26:00.000Z',
        deviceUtcOffsetMinutes: -240,
        certNumber: '730415',
        reasonId: await reasonNamed(tx, 'Device failed'),
      };
      const create = (payload: object) =>
        ask(served, p.dana, createFieldEventEndpoint, { ids: p.ids, payload });

      const tooFull = await create({ ...entered, loadCall: 140 });
      expect(notTaken(tooFull)).toBe('Not taken: loadCall in the body can’t be more than 100.');
      expect(tooFull.text).not.toContain('140');
      expect(notTaken(await create({ ...entered, monitorId: undefined }))).toBe(
        'Not taken: monitorId in the body is missing.',
      );
      expect(notTaken(await create({ ...entered, reasonId: undefined }))).toBe(
        'Not taken: reasonId in the body is missing.',
      );
      expect(notTaken(await create({ ...entered, startedAt: 'Wednesday at ten' }))).toBe(
        'Not taken: startedAt in the body isn’t written the way this request takes it.',
      );
      expect(notTaken(await create({ ...entered, kind: 'COMPLETED_LOAD' }))).toBe(
        'Not taken: kind in the body isn’t one of the values this request takes.',
      );
      expect(notTaken(await create({ ...entered, ticketNumber: '  ' }))).toBe(
        'Not taken: ticketNumber in the body is blank.',
      );
      for (const more of [
        { status: 'COMPLETED' },
        { deviceId: randomUUID() },
        { numberTyped: true },
        { certKeyedByHand: true, typedCapacityCy: 40 },
        { source: 'DEVICE' },
      ]) {
        expect(notTaken(await create({ ...entered, ...more })), Object.keys(more).join()).toBe(
          'Not taken: the body has a field this request doesn’t take.',
        );
      }
      expect(await written(tx)).toBe(before);
      expect(await jobsFor(tx, p.project.id, who.dana)).toHaveLength(2);
    });
  });

  it('AC-10-33 a unit rate event entered under a load is the database’s own refusal, told plainly', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const answer = await ask(served, p.dana, createFieldEventEndpoint, {
        ids: p.ids,
        payload: {
          workflow: 'LOAD',
          kind: 'UNIT_RATE',
          ticketNumber: '101029',
          monitorId: who.kim,
          startedAt: '2026-10-14T15:22:00.000Z',
          endedAt: '2026-10-14T15:26:00.000Z',
          deviceUtcOffsetMinutes: -240,
          certNumber: '730415',
          reasonId: await reasonNamed(tx, 'Device failed'),
        },
      });
      expect(told(answer)).toEqual([422, 'REFUSED_BY_THE_DATABASE']);
      expect(plainly(answer)).toBe(
        'Not saved: a collection and a disposal are a load’s, a haul-out collection and a haul-out disposal a haul-out’s, and a unit rate event unit rate work’s.',
      );
    });
  });
});

// The sync contract's own shape is what intake takes (task 2.6.1 part 1, ADR-466): a record
// read by the contracts' schema, given the phone the server knows it came from, is saved.
describe('an ROE’s number corrected', () => {
  it('AC-08-68 R-0007 was typed in as R-0070: Luis corrects its number, and what names R-0007 finds it (a collection and a survey that were waiting), while the collection that named R-0070 finds no ROE; what each says it named never changes, both tickets are queued; a number another ROE holds is refused in words', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const typo = await tx.roe.create({
        data: {
          projectId: p.project.id,
          roeNumber: 'R-0070',
          address: '412 Cedar Ct',
          signed: true,
          answers: {},
          source: 'BACK_OFFICE',
          madeById: who.dana,
        },
      });
      await tx.roe.create({
        data: {
          projectId: p.project.id,
          roeNumber: 'R-0009',
          signed: false,
          answers: {},
          source: 'BACK_OFFICE',
          madeById: who.dana,
        },
      });
      const waiting = await p.created('COLLECTION', '101032', { roeNumber: 'R-0007', ...thursday });
      const found = await p.created('COLLECTION', '101033', {
        roeNumber: 'R-0070',
        startedAt: new Date('2026-10-16T14:10:00Z'),
        endedAt: new Date('2026-10-16T14:40:00Z'),
      });
      expect([waiting.roeId, found.roeId]).toEqual([null, typo.id]);
      const preWork = await tx.surveyWorkType.findUniqueOrThrow({ where: { key: 'PRE_WORK' } });
      const survey = await tx.survey.create({
        data: {
          ...(await form(tx, p.project.id, who)),
          workTypeId: preWork.id,
          roeNumber: 'R-0007',
        },
      });
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const correct = (roeNumber: string) =>
        ask(served, luis, correctRoeEndpoint, {
          ids: { roeId: typo.id },
          payload: { changes: { roeNumber }, note: 'The paper says R-0007' },
        });
      expect(notSaved(await correct('R-0009'))).toEqual([
        'ROE_NUMBER_HELD',
        'ROE R-0009: this project already has an ROE with that number. Nothing was changed.',
      ]);
      const answer = await correct('R-0007');
      const { record, queued } = saved(correctRoeEndpoint, answer);
      expect([record.id, record.roeNumber]).toEqual([typo.id, 'R-0007']);
      expect(queued).toMatchObject({ tickets: 2, lockedAsInvoiced: 0 });
      const now = async (id: string) => tx.fieldEvent.findUniqueOrThrow({ where: { id } });
      expect([(await now(waiting.id)).roeId, (await now(waiting.id)).roeNumber]).toEqual([
        typo.id,
        'R-0007',
      ]);
      expect([(await now(found.id)).roeId, (await now(found.id)).roeNumber]).toEqual([
        null,
        'R-0070',
      ]);
      expect((await tx.survey.findUniqueOrThrow({ where: { id: survey.id } })).roeId).toBe(typo.id);
      const [change] = await audited(tx, answer, 'roe');
      expect([change?.actorId, change?.reason, change?.before?.['roe_number']]).toEqual([
        who.luis,
        'The paper says R-0007',
        'R-0070',
      ]);
      expect((await jobsFor(tx, p.project.id, who.luis)).at(-1)).toEqual([
        'CORRECTION',
        'LOAD 101032',
        'LOAD 101033',
      ]);
    });
  });
});

describe('the answers to a form’s own fields corrected', () => {
  it('AC-08-69 Kim’s survey answered version 1 of P1’s survey form ("Fence damaged?", required): Luis corrects the answer, and then gives the answers to version 2 ("Photos taken?" added); answers that don’t fit, a field the version doesn’t have and another form’s version are refused in words, nothing saved', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const surveyForm = saved(
        createFormEndpoint,
        await ask(served, p.dana, createFormEndpoint, {
          ids: p.ids,
          payload: { documentType: 'SURVEY', name: 'Survey' },
        }),
      ).record;
      const fence = {
        id: 'fence-damaged',
        label: 'Fence damaged?',
        type: 'YES_NO',
        required: true,
      };
      const photos = { id: 'photos-taken', label: 'Photos taken?', type: 'YES_NO', required: true };
      const version = async (fields: object[]) =>
        saved(
          addFormDefinitionEndpoint,
          await ask(served, p.dana, addFormDefinitionEndpoint, {
            ids: { formId: surveyForm.id },
            payload: { fields },
          }),
        ).record;
      const first = await version([fence]);
      const second = await version([fence, photos]);
      const preWork = await tx.surveyWorkType.findUniqueOrThrow({ where: { key: 'PRE_WORK' } });
      const survey = await tx.survey.create({
        data: {
          ...(await form(tx, p.project.id, who)),
          workTypeId: preWork.id,
          answers: { 'fence-damaged': false },
          formDefinitionId: first.id,
          formId: surveyForm.id,
          formDocumentType: 'SURVEY',
        },
      });
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const answered = (answers: object) =>
        ask(served, luis, correctSurveyEndpoint, {
          ids: { surveyId: survey.id },
          payload: { changes: { answers }, note: 'Kim called it in' },
        });
      const fixed = await answered({ answers: { 'fence-damaged': true } });
      expect(saved(correctSurveyEndpoint, fixed).record).toMatchObject({
        answers: { 'fence-damaged': true },
        formDefinitionId: first.id,
      });
      const [change] = await audited(tx, fixed, 'survey');
      expect([change?.actorId, change?.before?.['answers']]).toEqual([
        who.luis,
        { 'fence-damaged': false },
      ]);
      expect(
        saved(
          correctSurveyEndpoint,
          await answered({
            answers: { 'fence-damaged': true, 'photos-taken': true },
            formDefinitionId: second.id,
          }),
        ).record,
      ).toMatchObject({
        answers: { 'fence-damaged': true, 'photos-taken': true },
        formDefinitionId: second.id,
      });
      expect(notSaved(await answered({ answers: { 'fence-damaged': true } }))).toEqual([
        'ANSWERS_DO_NOT_FIT',
        'The answers don’t fit the form’s own fields as version 2 has them (Photos taken?). Nothing was saved.',
      ]);
      expect(
        notSaved(await answered({ answers: { 'fence-damaged': 'yes', 'photos-taken': true } })),
      ).toEqual([
        'ANSWERS_DO_NOT_FIT',
        'The answers don’t fit the form’s own fields as version 2 has them (Fence damaged?). Nothing was saved.',
      ]);
      expect(
        notSaved(
          await answered({
            answers: { 'fence-damaged': true, 'photos-taken': true, 'gate-open': true },
          }),
        ),
      ).toEqual([
        'ANSWERS_DO_NOT_FIT',
        'The answers don’t fit the form’s own fields as version 2 has them (gate-open). Nothing was saved.',
      ]);
      const incidentForm = saved(
        createFormEndpoint,
        await ask(served, p.dana, createFormEndpoint, {
          ids: p.ids,
          payload: { documentType: 'INCIDENT', name: 'Incident', incidentOffers: [] },
        }),
      ).record;
      const another = saved(
        addFormDefinitionEndpoint,
        await ask(served, p.dana, addFormDefinitionEndpoint, {
          ids: { formId: incidentForm.id },
          payload: { fields: [fence] },
        }),
      ).record;
      expect(
        notSaved(
          await answered({ answers: { 'fence-damaged': true }, formDefinitionId: another.id }),
        ),
      ).toEqual([
        'ANSWERS_DO_NOT_FIT',
        'The version of a form’s own fields named isn’t one of this project’s survey form’s. Nothing was saved.',
      ]);
      expect(
        (await tx.survey.findUniqueOrThrow({ where: { id: survey.id } })).formDefinitionId,
      ).toBe(second.id);
    });
  });
});

describe('a form made on paper, entered in the back office', () => {
  it('AC-08-71 Kim’s phone failed: Luis enters her ROE R-0011, a pre-work survey on it, an incident naming 730415 and R-0011, and a drop-off log, each with the reason "Device failed": each names Kim (the ROE, Luis) and the reason, no phone, assignment or lists’ version; what each number names is found; the collection that was waiting for R-0011 points at it and its ticket is queued, and the survey asks the run to check the project’s surveys; a number another ROE holds and a fix that can’t be one are refused', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const waiting = await p.created('COLLECTION', '101032', { roeNumber: 'R-0011', ...thursday });
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const reasonId = await reasonNamed(tx, 'Device failed');
      const entered = (endpoint: Endpoint, payload: object) =>
        ask(served, luis, endpoint, { ids: p.ids, payload });
      const roeAnswer = await entered(createRoeEndpoint, {
        roeNumber: 'R-0011',
        parcelId: 'APN 14-0321-011',
        address: '420 Cedar Ct',
        ownerName: 'Rosa Delgado',
        signed: true,
        signedDate: '2026-10-13',
        fix: { latitude: '39.0891', longitude: '-75.6012' },
        madeAt: null,
        notes: null,
        answers: { answers: {} },
      });
      const roe = saved(createRoeEndpoint, roeAnswer);
      expect(roe.record).toMatchObject({
        roeNumber: 'R-0011',
        source: 'BACK_OFFICE',
        madeById: who.luis,
        // Kept to the database's eight places (invariant 15).
        fix: { latitude: '39.08910000', longitude: '-75.60120000' },
        answers: {},
        formDefinitionId: null,
      });
      expect(roe.queued).toMatchObject({ tickets: 1 });
      expect((await tx.fieldEvent.findUniqueOrThrow({ where: { id: waiting.id } })).roeId).toBe(
        roe.record.id,
      );
      const [made] = await audited(tx, roeAnswer, 'roe');
      expect([made?.operation, made?.actorId, made?.source]).toEqual([
        'INSERT',
        who.luis,
        'BACK_OFFICE',
      ]);
      expect(served.lines.join('')).not.toMatch(/Delgado|Cedar/);

      const shared = {
        monitorId: who.kim,
        madeAt: '2026-10-14T13:30:00Z',
        deviceUtcOffsetMinutes: -240,
        fix: null,
        notes: null,
        answers: { answers: {} },
        reasonId,
      };
      const preWork = await tx.surveyWorkType.findUniqueOrThrow({ where: { key: 'PRE_WORK' } });
      const survey = saved(
        createSurveyEndpoint,
        await entered(createSurveyEndpoint, {
          ...shared,
          workTypeId: preWork.id,
          surveyNumber: 'APN 14-0321-011',
          roeNumber: 'R-0011',
        }),
      );
      expect(survey.record).toMatchObject({
        source: 'BACK_OFFICE',
        createdById: who.luis,
        createdReasonId: reasonId,
        monitorId: who.kim,
        madeAt: '2026-10-14T13:30:00.000Z',
        roeId: roe.record.id,
      });
      const damage = await tx.incidentType.findFirstOrThrow({ where: { name: 'Property damage' } });
      const incident = saved(
        createIncidentEndpoint,
        await entered(createIncidentEndpoint, {
          ...shared,
          incidentTypeId: damage.id,
          incidentSubTypeId: null,
          description: 'Mailbox clipped by the trailer',
          parties: null,
          address: '420 Cedar Ct',
          contractorId: null,
          certNumber: '730415',
          roeNumber: 'R-0011',
        }),
      );
      expect(incident.record).toMatchObject({
        createdById: who.luis,
        certNumber: '730415',
        certificationId: null,
        roeId: roe.record.id,
      });
      expect(incident.queued).toMatchObject({ jobs: [], tickets: 0 });
      const landfill = await site(served, p, tx, 'Bayline County Landfill', 'BCL');
      const log = saved(
        createDropOffLogEndpoint,
        await entered(createDropOffLogEndpoint, {
          ...shared,
          siteId: landfill.id,
          residentName: 'Carl Jensen',
          originAddress: '14 Heron St',
        }),
      );
      expect(log.record).toMatchObject({ siteId: landfill.id, createdById: who.luis });
      for (const [table, id] of [
        ['survey', survey.record.id],
        ['incident', incident.record.id],
        ['dropOffLog', log.record.id],
      ] as const) {
        const kept = await (
          tx[table] as unknown as {
            findUniqueOrThrow: (asked: object) => Promise<Record<string, unknown>>;
          }
        ).findUniqueOrThrow({ where: { id } });
        expect([kept['deviceId'], kept['assignmentId'], kept['setupVersion']], table).toEqual([
          null,
          null,
          null,
        ]);
      }
      expect((await jobsFor(tx, p.project.id, who.luis)).map(([trigger]) => trigger)).toEqual([
        'CORRECTION',
        'CORRECTION',
      ]);
      expect(served.lines.join('')).not.toMatch(/Jensen|Mailbox|Heron/);

      expect(
        notSaved(
          await entered(createRoeEndpoint, {
            roeNumber: 'R-0011',
            parcelId: null,
            address: null,
            ownerName: null,
            signed: false,
            signedDate: null,
            fix: null,
            madeAt: null,
            notes: null,
            answers: { answers: {} },
          }),
        ),
      ).toEqual([
        'ROE_NUMBER_HELD',
        'ROE R-0011: this project already has an ROE with that number. Nothing was changed.',
      ]);
      expect(
        notSaved(
          await entered(createDropOffLogEndpoint, {
            ...shared,
            fix: { latitude: '139.1', longitude: '-75.6' },
            siteId: landfill.id,
            residentName: null,
            originAddress: null,
          }),
        ),
      ).toEqual([
        'GPS_UNREADABLE',
        'The GPS can’t be a fix: latitude "139.1", longitude "-75.6". Nothing was changed.',
      ]);
    });
  });
});

describe('a record as a phone sends it', () => {
  it('AC-04-26, AC-10-36 Kim keys in 730415 and the capacity 60 read off the truck: sent as the sync contract says, with no phone named, it is read by the schema and saved with the 60 as her claim', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const phone = await kimsPhone(served, tx, p.project.id, who);
      const made = await disposal(tx, p.project.id, who, phone, '101026', '2026-10-14T14:22:00Z');
      const { source, deviceId, ...recorded } = made;
      expect([source, deviceId]).toEqual(['DEVICE', phone.deviceId]);
      // As it travels: text, a time as a UTC instant.
      const travelled: unknown = JSON.parse(
        JSON.stringify({ ...recorded, certKeyedByHand: true, typedCapacityCy: 60 }),
      );
      const read = syncedFieldEventSchema.parse(travelled);
      expect(read.startedAt).toEqual(made.startedAt);

      const intake = new Intake(within, served.clock, shippedPolicy);
      const answer = await intake.receive({
        record: 'FIELD_EVENT',
        fieldEvent: { ...read, source: 'DEVICE', deviceId: phone.deviceId },
      });
      expect(answer).toEqual({ answer: 'SAVED', id: made.id, notes: [] });
      const saved = await tx.fieldEvent.findUniqueOrThrow({ where: { id: made.id } });
      expect([saved.certKeyedByHand, saved.typedCapacityCy, saved.deviceId, saved.status]).toEqual([
        true,
        60,
        phone.deviceId,
        'PENDING',
      ]);
      expect(saved.startedAt).toEqual(made.startedAt);
    });
  });
});
