// An unplanned assignment reported by the phone it was made on, against the database
// (ARCHITECTURE §7's note, §7.5, §9 (3), (4), §10; spec/acceptance/02-people-and-devices.md
// AC-02-38; spec/acceptance/05-sync.md AC-05-40; spec/acceptance/10-api-and-sync.md AC-10-19,
// 27; BACKLOG 2.5.4, C46, C111, C115, C117; ADR-100, 240, 438, 456, 457; REQ-202b, 209). The
// real process, in this test's own memory, on the installation's database as `adms_api`: it
// needs `pnpm local:up` after `pnpm installer`, and fails saying so. Each test's work is undone
// (support/database.ts).
import { randomUUID } from 'node:crypto';

import {
  createPayItemEndpoint,
  createProjectEndpoint,
  createSiteEndpoint,
  endpoints,
  listAssignmentsEndpoint,
  monitorCreatedAnswerSchema,
  monitorSignedInAnswerSchema,
  phoneListsAnswerSchema,
  removePhoneEndpoint,
  reportUnplannedAssignmentEndpoint,
  unplannedAssignmentAnswerSchema,
  writeAssignmentEndpoint,
} from '@open-adms/contracts';
import { masterPasscodeActorId, type Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { enrolledPhone, passcode, proven, type TestPhone } from './support/phones.ts';
import { notTaken } from './support/review.ts';
import { danasEmail, long, worldOn, type Answer, type Served } from './support/served.ts';
import { ask, p1Priced, picked, saved, told } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const monday = '2026-10-12';
// 6:30 am on Monday in Bayline County, at the staging area.
const mondayMorning = new Date('2026-10-12T10:30:00Z');
// Bayline County's clock in October: UTC−04:00.
const offset = -240;

const report = (served: Served, bearer: string | undefined, payload: object): Promise<Answer> =>
  served.ask('POST', reportUnplannedAssignmentEndpoint.path, {
    payload,
    ...(bearer === undefined ? {} : { bearer }),
  });

// What a report was answered: `SAVED`, `ALREADY_SAVED`, or `NOT_SAVED` and why.
async function answered(served: Served, bearer: string, payload: { id: string }) {
  const answer = await report(served, bearer, payload);
  expect(told(answer)).toEqual([200, undefined]);
  const read = unplannedAssignmentAnswerSchema.parse(answer.body);
  expect(read.assignmentId).toBe(payload.id);
  return { said: [read.answer, read.reason], requestId: answer.requestId };
}

// P1 as Dana prices it, with the Landfill and three pay items; the Landfill tower's phone,
// enrolled and proven; and Tariq Patel, created on it, with no assignment.
async function tariqAtTheLandfill(served: Served, tx: Tx) {
  served.clock.at = mondayMorning;
  const dana = await served.signedIn(danasEmail, long);
  const priced = await p1Priced(served, dana, tx);
  const site = async (ids: { projectId: string }, name: string) =>
    saved(
      createSiteEndpoint,
      await ask(served, dana, createSiteEndpoint, {
        ids,
        payload: {
          name,
          siteTypeId: (await tx.siteType.findUniqueOrThrow({ where: { key: 'FINAL_DISPOSAL' } }))
            .id,
          takesLoads: true,
          haulOutsLeaveHere: false,
          chargesTippingFee: false,
          ineligibleSite: false,
          permitNumber: null,
          latitude: '39.09000000',
          longitude: '-75.62000000',
          activationDate: monday,
        },
      }),
    ).record;
  const landfill = await site(priced.ids, 'Bayline County Landfill');
  const entered = async (asked: Promise<Answer>) =>
    saved(createPayItemEndpoint, await asked).record;
  const hangers = await entered(priced.each('HNG-RMV-EA', 'Hanger removal', 'Hangers', '68.00'));
  const vegHaul = await entered(priced.veg15());
  const phone = await enrolledPhone(served, tx, 'P1-TWR-LF');
  const token = await proven(served, phone);
  const password = '5550177';
  const made = await served.ask('POST', '/phones/current/monitors', {
    bearer: token,
    payload: { name: 'Tariq Patel', password, passcode },
  });
  expect(told(made)).toEqual([200, undefined]);
  const tariq = { ...monitorCreatedAnswerSchema.parse(made.body), password };
  // The supervisor sets the phone up at 06:40 by its own clock: the Landfill tower, for Tariq.
  const setUp = (more: object = {}) => ({
    id: randomUUID(),
    projectId: priced.project.id,
    personId: tariq.userId,
    fieldEventKinds: ['DISPOSAL', 'HAUL_OUT_DISPOSAL'],
    certifying: false,
    formDocumentTypes: [],
    siteId: landfill.id,
    payItemIds: [],
    madeAt: '2026-10-12T10:40:00.000Z',
    deviceUtcOffsetMinutes: offset,
    ...more,
  });
  return { dana, priced, site, landfill, hangers, vegHaul, phone, token, tariq, setUp };
}

const kept = (tx: Tx, id: string) =>
  tx.assignment.findUnique({
    where: { id },
    select: {
      personId: true,
      workDate: true,
      projectId: true,
      fieldEventKinds: true,
      certifying: true,
      formDocumentTypes: true,
      siteId: true,
      deviceId: true,
      origin: true,
      madeById: true,
      madeAt: true,
      deviceUtcOffsetMinutes: true,
      receivedAt: true,
      archivedAt: true,
    },
  });

const events = async (tx: Tx, requestId: string) =>
  (
    await tx.securityEvent.findMany({
      where: { requestId },
      orderBy: { id: 'asc' },
      select: {
        kind: true,
        userId: true,
        deviceId: true,
        occurredAt: true,
        deviceUtcOffsetMinutes: true,
      },
    })
  ).map((event) => [
    event.kind,
    event.userId,
    event.deviceId,
    event.occurredAt.toISOString(),
    event.deviceUtcOffsetMinutes,
  ]);

const audited = async (tx: Tx, requestId: string) =>
  (
    await tx.auditRecord.findMany({
      where: { requestId },
      orderBy: { id: 'asc' },
      select: { tableName: true, operation: true, actorId: true, source: true, deviceId: true },
    })
  ).map((record) => Object.values(record));

// How many unplanned assignments the server holds, and how many security events that phone
// reported (one the server saw itself carries no offset).
const written = async (tx: Tx, phone: TestPhone) => [
  await tx.assignment.count({ where: { origin: 'UNPLANNED' } }),
  await tx.securityEvent.count({
    where: { deviceId: phone.id, deviceUtcOffsetMinutes: { not: null } },
  }),
];

const logged = (served: Served, msg: string) =>
  served.lines
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((line) => line['msg'] === msg);

describe('who may report one', () => {
  it('AC-10-27 it is a proven phone’s call, with nobody signed in and no passcode sent: no token, a back-office session and a body that isn’t whole are refused, and nothing is written', async () => {
    const { access, roles, permission } =
      endpoints.find(({ name }) => name === 'reportUnplannedAssignment') ?? {};
    expect([access, roles, permission]).toEqual(['PROVEN_PHONE', undefined, undefined]);
    await world(async (served, tx) => {
      const { dana, token, phone, setUp } = await tariqAtTheLandfill(served, tx);
      const notProven = [401, 'PHONE_NOT_PROVEN'];
      expect(told(await report(served, undefined, setUp()))).toEqual(notProven);
      expect(told(await report(served, 'not-a-token', setUp()))).toEqual(notProven);
      const asDana = await served.ask('POST', reportUnplannedAssignmentEndpoint.path, {
        payload: setUp(),
        cookies: dana.cookies,
        csrf: dana.csrf,
      });
      expect(told(asDana)).toEqual(notProven);
      const { madeAt, ...noTime } = setUp();
      expect(madeAt).toBe('2026-10-12T10:40:00.000Z');
      for (const [payload, words] of [
        [noTime, 'madeAt'],
        // The phone's instant is a UTC instant; its offset travels beside it.
        [setUp({ madeAt: '2026-10-12T06:40:00-04:00' }), 'madeAt'],
        [setUp({ madeAt: '12-Oct-2026 06:40' }), 'madeAt'],
        [setUp({ deviceUtcOffsetMinutes: 841 }), 'deviceUtcOffsetMinutes'],
        [setUp({ deviceUtcOffsetMinutes: -721 }), 'deviceUtcOffsetMinutes'],
        [setUp({ deviceUtcOffsetMinutes: -240.5 }), 'deviceUtcOffsetMinutes'],
        [setUp({ id: 'Tariq’s' }), 'id'],
        [setUp({ fieldEventKinds: ['DISPOSAL', 'DISPOSAL'] }), 'fieldEventKinds'],
        [setUp({ formDocumentTypes: ['LOAD'] }), 'formDocumentTypes'],
      ] as const) {
        const refused = await report(served, token, payload);
        expect(told(refused), words).toEqual([400, 'BAD_REQUEST']);
        expect(notTaken(refused), words).toContain(words);
      }
      // What a phone never says: the day, the phone, who wrote it, the passcode.
      for (const more of [
        { workDate: monday },
        { deviceId: phone.id },
        { origin: 'PLANNED' },
        { madeById: randomUUID() },
        { passcode },
        { receivedAt: '2026-10-12T10:40:00.000Z' },
      ]) {
        const refused = await report(served, token, setUp(more));
        expect(told(refused), JSON.stringify(more)).toEqual([400, 'BAD_REQUEST']);
      }
      expect(await written(tx, phone)).toEqual([0, 0]);
    });
  });
});

describe('an unplanned assignment arrives', () => {
  it('AC-02-38, AC-05-40 Tariq had no assignment and his supervisor set P1-TWR-LF up under the master passcode at 06:40: reported at 12:05, it is kept as the phone says, for Monday, with the phone’s instant, its offset and when the server received it; written as the master passcode’s actor on that phone, with two security events at the phone’s own time; the board shows it marked unplanned with no author; no wrong try is counted and no name is logged', async () => {
    await world(async (served, tx) => {
      const { priced, landfill, phone, tariq, setUp } = await tariqAtTheLandfill(served, tx);
      // The phone finds signal at 12:05 and proves itself again.
      served.clock.at = new Date('2026-10-12T16:05:00Z');
      const token = await proven(served, phone);
      served.lines.length = 0;
      const sent = setUp();
      const { said, requestId } = await answered(served, token, sent);
      expect(said).toEqual(['SAVED', null]);
      expect(await kept(tx, sent.id)).toEqual({
        personId: tariq.userId,
        workDate: new Date(monday),
        projectId: priced.project.id,
        fieldEventKinds: ['DISPOSAL', 'HAUL_OUT_DISPOSAL'],
        certifying: false,
        formDocumentTypes: [],
        siteId: landfill.id,
        deviceId: phone.id,
        origin: 'UNPLANNED',
        madeById: null,
        madeAt: new Date('2026-10-12T10:40:00Z'),
        deviceUtcOffsetMinutes: offset,
        receivedAt: new Date('2026-10-12T16:05:00Z'),
        archivedAt: null,
      });
      // REQ-202b: a phone set up, and a use of the master passcode, each about Tariq on that
      // phone, at the phone's own time with its offset.
      const at = '2026-10-12T10:40:00.000Z';
      expect(await events(tx, requestId)).toEqual([
        ['DEVICE_SETUP', tariq.userId, phone.id, at, offset],
        ['MASTER_PASSCODE_USE', tariq.userId, phone.id, at, offset],
      ]);
      // REQ-209: whoever held the passcode is not known. Never Tariq, never the device key.
      const byThePasscode = [masterPasscodeActorId, 'DEVICE', phone.id];
      expect(await audited(tx, requestId)).toEqual([
        ['assignment', 'INSERT', ...byThePasscode],
        ['security_event', 'INSERT', ...byThePasscode],
        ['security_event', 'INSERT', ...byThePasscode],
      ]);
      // The server checked no passcode: nothing counts for or against it.
      expect(await tx.masterPasscodeTries.count()).toBe(0);
      // The board, as the back office reads it that afternoon.
      const board = saved(
        listAssignmentsEndpoint,
        await ask(served, await served.signedIn(danasEmail, long), listAssignmentsEndpoint, {
          ids: priced.ids,
          query: `?workDate=${monday}`,
        }),
      );
      expect(
        board.assignments.map((row) => [
          row.id,
          row.person.name,
          row.origin,
          row.madeBy,
          row.phone?.name,
          row.site?.name,
        ]),
      ).toEqual([
        [sent.id, 'Tariq Patel', 'UNPLANNED', null, 'P1-TWR-LF', 'Bayline County Landfill'],
      ]);
      const [line] = logged(
        served,
        'A phone reported an unplanned assignment made under the master passcode.',
      );
      expect(line).toMatchObject({
        deviceId: phone.id,
        assignmentId: sent.id,
        answer: 'SAVED',
        workDate: monday,
      });
      const log = served.lines.join('\n');
      for (const never of ['Tariq', tariq.monitorNumber, 'Landfill', passcode, 'DISPOSAL']) {
        expect(log, never).not.toContain(never);
      }
    });
  });

  it('AC-02-38 once it has arrived, Tariq’s own sign-in on that phone takes it, and the phone reads its lists for it', async () => {
    await world(async (served, tx) => {
      const { token, tariq, setUp } = await tariqAtTheLandfill(served, tx);
      const signIn = async () => {
        const answer = await served.ask('POST', '/phones/current/sign-ins', {
          bearer: token,
          payload: { monitorNumber: tariq.monitorNumber, password: tariq.password },
        });
        expect(told(answer)).toEqual([200, undefined]);
        return monitorSignedInAnswerSchema.parse(answer.body);
      };
      expect((await signIn()).noAssignment).toBe('NONE_THAT_DAY');
      const sent = setUp();
      expect((await answered(served, token, sent)).said).toEqual(['SAVED', null]);
      const signedIn = await signIn();
      expect([signedIn.assignment?.id, signedIn.assignment?.site?.name]).toEqual([
        sent.id,
        'Bayline County Landfill',
      ]);
      const lists = await served.ask('GET', '/phones/current/lists', {
        bearer: token,
        monitorSession: signedIn.token,
      });
      expect(told(lists)).toEqual([200, undefined]);
      const read = phoneListsAnswerSchema.parse(lists.body);
      expect([read.assignment?.id, read.lists?.setupVersion]).toEqual([sent.id, 1]);
    });
  });

  it('ADR-100 its day is the day the phone’s clock said, in the project’s time zone, whenever it arrives: set up at 23:50 on Monday and reported on Wednesday, it is Monday’s', async () => {
    await world(async (served, tx) => {
      const { phone, setUp } = await tariqAtTheLandfill(served, tx);
      served.clock.at = new Date('2026-10-14T13:00:00Z');
      const token = await proven(served, phone);
      // 23:50 on Monday in Bayline County is already Tuesday by UTC.
      const late = setUp({ madeAt: '2026-10-13T03:50:00.000Z' });
      expect((await answered(served, token, late)).said).toEqual(['SAVED', null]);
      const row = await kept(tx, late.id);
      expect([row?.workDate, row?.madeAt, row?.receivedAt]).toEqual([
        new Date(monday),
        new Date('2026-10-13T03:50:00Z'),
        new Date('2026-10-14T13:00:00Z'),
      ]);
      // Ten minutes later by the phone's clock it is Tuesday's.
      const tuesdays = setUp({ madeAt: '2026-10-13T04:00:00.000Z' });
      expect((await answered(served, token, tuesdays)).said).toEqual(['SAVED', null]);
      expect((await kept(tx, tuesdays.id))?.workDate).toEqual(new Date('2026-10-13'));
    });
  });

  it('AC-05-40 reported again, it is already saved and nothing is written twice, whatever the second report says; its id sent by another phone, or the id of an assignment written on the board, is not saved', async () => {
    await world(async (served, tx) => {
      const { dana, priced, phone, token, tariq, setUp } = await tariqAtTheLandfill(served, tx);
      const sent = setUp();
      expect((await answered(served, token, sent)).said).toEqual(['SAVED', null]);
      const first = await kept(tx, sent.id);
      expect(await written(tx, phone)).toEqual([1, 2]);
      const again = await answered(served, token, sent);
      expect(again.said).toEqual(['ALREADY_SAVED', null]);
      expect(await audited(tx, again.requestId)).toEqual([]);
      // The first stands: a phone never changes one by reporting it anew.
      const changed = { ...sent, siteId: null, madeAt: '2026-10-12T11:00:00.000Z' };
      expect((await answered(served, token, changed)).said).toEqual(['ALREADY_SAVED', null]);
      expect(await kept(tx, sent.id)).toEqual(first);
      expect(await written(tx, phone)).toEqual([1, 2]);
      // Another phone can't claim it, or learn anything of it but that the id is held.
      const other = await enrolledPhone(served, tx, 'P1-COL-1');
      const others = await proven(served, other);
      const held = ['NOT_SAVED', 'ID_ALREADY_HELD'];
      expect((await answered(served, others, sent)).said).toEqual(held);
      // One Dana wrote on the board is no phone's to report.
      const planned = saved(
        writeAssignmentEndpoint,
        await ask(served, dana, writeAssignmentEndpoint, {
          ids: priced.ids,
          payload: {
            personId: tariq.userId,
            workDate: '2026-10-13',
            fieldEventKinds: ['DISPOSAL'],
            certifying: false,
            formDocumentTypes: [],
            siteId: null,
            deviceId: phone.id,
            payItemIds: [],
          },
        }),
      ).record;
      expect((await answered(served, token, setUp({ id: planned.id }))).said).toEqual(held);
      const stands = await kept(tx, planned.id);
      expect([stands?.origin, stands?.madeAt, stands?.receivedAt]).toEqual(['PLANNED', null, null]);
      expect(await written(tx, phone)).toEqual([1, 2]);
      expect(await written(tx, other)).toEqual([1, 0]);
    });
  });

  it('AC-02-38 it is kept as reported, never refused over eligibility: unit rate work with its pay item, each with the pay item’s own kind of work; for a monitor archived since; from a phone taken out of service', async () => {
    await world(async (served, tx) => {
      const { dana, hangers, phone, token, tariq, setUp } = await tariqAtTheLandfill(served, tx);
      const unitRate = setUp({
        fieldEventKinds: ['UNIT_RATE'],
        formDocumentTypes: ['INCIDENT'],
        certifying: true,
        siteId: null,
        payItemIds: [hangers.id],
      });
      const { said, requestId } = await answered(served, token, unitRate);
      expect(said).toEqual(['SAVED', null]);
      const row = await kept(tx, unitRate.id);
      expect([row?.fieldEventKinds, row?.formDocumentTypes, row?.certifying, row?.siteId]).toEqual([
        ['UNIT_RATE'],
        ['INCIDENT'],
        true,
        null,
      ]);
      const named = await tx.assignmentPayItem.findMany({
        where: { assignmentId: unitRate.id },
        select: { payItemId: true, kindOfWorkId: true, archivedAt: true },
      });
      const hangersWork = await tx.payItem.findUniqueOrThrow({ where: { id: hangers.id } });
      expect(named).toEqual([
        { payItemId: hangers.id, kindOfWorkId: hangersWork.kindOfWorkId, archivedAt: null },
      ]);
      expect((await audited(tx, requestId)).map(([table]) => table)).toEqual([
        'assignment',
        'assignment_pay_item',
        'security_event',
        'security_event',
      ]);
      // Tariq is archived on Tuesday; the phone is marked lost. Monday's work was still done.
      await tx.user.update({ where: { id: tariq.userId }, data: { archivedAt: new Date() } });
      saved(
        removePhoneEndpoint,
        await ask(served, dana, removePhoneEndpoint, {
          ids: { deviceId: phone.id },
          payload: { status: 'LOST' },
        }),
      );
      const afterwards = setUp();
      expect((await answered(served, token, afterwards)).said).toEqual(['SAVED', null]);
      expect((await kept(tx, afterwards.id))?.origin).toBe('UNPLANNED');
    });
  });

  it('it is not saved where something it names is no record of the kind it must be: a project nobody has, somebody who is no monitor, a site or a pay item that isn’t the project’s, a pay item that is no unit rate pay item; each is said, and nothing is written', async () => {
    await world(async (served, tx, who) => {
      const { dana, priced, site, hangers, vegHaul, phone, token, setUp } =
        await tariqAtTheLandfill(served, tx);
      // P2, the county's parks, with a site of its own.
      const p1 = await tx.project.findUniqueOrThrow({ where: { id: priced.project.id } });
      const p2 = saved(
        createProjectEndpoint,
        await ask(served, dana, createProjectEndpoint, {
          payload: {
            name: 'Bayline County Parks, Hurricane Delphine',
            clientId: p1.clientId,
            declarationEventId: p1.declarationEventId,
            programTypeId: p1.programTypeId,
            timeZone: p1.timeZone,
            activeFrom: monday,
            activeTo: '2027-01-31',
            ticketNumberSource: 'GENERATED',
            workflows: ['LOAD', 'HAUL_OUT', 'UNIT_RATE'],
            kindOfWorkIds: (await picked(tx)).kindOfWorkIds,
          },
        }),
      ).record;
      const p2Site = await site({ projectId: p2.id }, 'Bayline County Landfill');
      for (const [more, reason] of [
        [{ projectId: randomUUID() }, 'UNKNOWN_PROJECT'],
        [{ personId: randomUUID() }, 'NOT_A_MONITOR'],
        [{ personId: who.dana }, 'NOT_A_MONITOR'],
        [{ personId: who.luis }, 'NOT_A_MONITOR'],
        [{ personId: masterPasscodeActorId }, 'NOT_A_MONITOR'],
        [{ siteId: randomUUID() }, 'NOT_THE_PROJECTS_SITE'],
        [{ siteId: p2Site.id }, 'NOT_THE_PROJECTS_SITE'],
        [{ payItemIds: [randomUUID()] }, 'NOT_THE_PROJECTS_UNIT_RATE_PAY_ITEM'],
        [{ payItemIds: [hangers.id, vegHaul.id] }, 'NOT_THE_PROJECTS_UNIT_RATE_PAY_ITEM'],
        [
          { projectId: p2.id, siteId: null, payItemIds: [hangers.id] },
          'NOT_THE_PROJECTS_UNIT_RATE_PAY_ITEM',
        ],
      ] as const) {
        const { said, requestId } = await answered(served, token, setUp(more));
        expect(said, JSON.stringify(more)).toEqual(['NOT_SAVED', reason]);
        expect(await audited(tx, requestId), reason).toEqual([]);
      }
      expect(await written(tx, phone)).toEqual([0, 0]);
    });
  });
});
