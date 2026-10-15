// An unplanned assignment reported by the phone it was made on, against the database
// (ARCHITECTURE §7's note, §7.5, §9 (3), (4), §10; spec/acceptance/02-people-and-devices.md
// AC-02-38, 46, 47; spec/acceptance/05-sync.md AC-05-40; spec/acceptance/10-api-and-sync.md
// AC-10-19, 27; BACKLOG 2.5.4, C46, C111, C115, C117, C122; ADR-100, 240, 438, 456, 457, 458;
// REQ-202b, 209). A site move and a monitor switch are reported the same way (ADR-458). The
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
import { deviceKeyActorId, masterPasscodeActorId, type Database } from '@open-adms/db';
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
    occasion: 'SETUP',
    madeAt: '2026-10-12T10:40:00.000Z',
    deviceUtcOffsetMinutes: offset,
    ...more,
  });
  return { dana, priced, site, landfill, hangers, vegHaul, phone, token, tariq, setUp };
}

type Monitor = Awaited<ReturnType<typeof tariqAtTheLandfill>>['tariq'];

// The monitor signs in on the phone, online: what the sign-in answered.
async function signedIn(served: Served, token: string, monitor: Monitor) {
  const answer = await served.ask('POST', '/phones/current/sign-ins', {
    bearer: token,
    payload: { monitorNumber: monitor.monitorNumber, password: monitor.password },
  });
  expect(told(answer)).toEqual([200, undefined]);
  return monitorSignedInAnswerSchema.parse(answer.body);
}

// The assignment the phone took at that sign-in and where it is, or why it took none.
const tookAt = (answer: Awaited<ReturnType<typeof signedIn>>) => [
  answer.assignment?.id ?? answer.noAssignment,
  answer.assignment?.site?.name,
];

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

// What a report answered "not saved" writes: the held record a person resolves, as the device
// key's actor on the phone that sent it (ADR-526 (5)).
const heldFor = (phone: TestPhone) => [
  ['held_record', 'INSERT', deviceKeyActorId, 'DEVICE', phone.id],
];

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
      const { occasion, ...noOccasion } = setUp();
      expect(occasion).toBe('SETUP');
      for (const [payload, words] of [
        [noTime, 'madeAt'],
        // What it was made at is said, and is one of the two a phone reports this way.
        [noOccasion, 'occasion'],
        [setUp({ occasion: 'SITE_MOVE' }), 'occasion'],
        [setUp({ occasion: 'DEVICE_SWITCH' }), 'occasion'],
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

  it('it is not saved where something it names is no record of the kind it must be: a project nobody has, somebody who is no monitor, a site or a pay item that isn’t the project’s, a pay item that is no unit rate pay item; each is said, nothing of it is kept as an assignment, and it is held for a person exactly as sent', async () => {
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
        const report = setUp(more);
        const { said, requestId } = await answered(served, token, report);
        expect(said, JSON.stringify(more)).toEqual(['NOT_SAVED', reason]);
        expect(await audited(tx, requestId), reason).toEqual(heldFor(phone));
        const held = await tx.heldRecord.findFirstOrThrow({ where: { sentId: report.id } });
        expect([held.syncId, held.reason, held.payload], reason).toEqual([
          null,
          'REPORT_NOT_SAVED',
          JSON.parse(JSON.stringify(report)),
        ]);
      }
      expect(await written(tx, phone)).toEqual([0, 0]);
      expect(await tx.heldRecord.count({ where: { deviceId: phone.id } })).toBe(10);
    });
  });
});

describe('a site move and a monitor switch, reported', () => {
  it('AC-02-47 Tariq’s phone, set up at the Landfill at 06:40, is moved to Marsh Road TDSR under the master passcode at 13:10: a new unplanned assignment at the new site, a phone set up and a use of the passcode at the phone’s own time; the earlier one stands as it was; his sign-in on that phone takes the one made last, and the phone reads its lists for it', async () => {
    await world(async (served, tx) => {
      const { priced, site, landfill, phone, token, tariq, setUp } = await tariqAtTheLandfill(
        served,
        tx,
      );
      const tdsr = await site(priced.ids, 'Marsh Road TDSR');
      const morning = setUp();
      expect((await answered(served, token, morning)).said).toEqual(['SAVED', null]);
      const first = await kept(tx, morning.id);
      expect(tookAt(await signedIn(served, token, tariq))).toEqual([
        morning.id,
        'Bayline County Landfill',
      ]);
      // 13:15: the phone has signal at the TDSR, proves itself and reports the move of 13:10.
      served.clock.at = new Date('2026-10-12T17:15:00Z');
      const afternoon = await proven(served, phone);
      const at = '2026-10-12T17:10:00.000Z';
      const moved = setUp({ siteId: tdsr.id, madeAt: at });
      const { said, requestId } = await answered(served, afternoon, moved);
      expect(said).toEqual(['SAVED', null]);
      const second = await kept(tx, moved.id);
      expect([second?.personId, second?.siteId, second?.deviceId, second?.origin]).toEqual([
        tariq.userId,
        tdsr.id,
        phone.id,
        'UNPLANNED',
      ]);
      expect([second?.workDate, second?.madeAt, second?.receivedAt]).toEqual([
        new Date(monday),
        new Date(at),
        new Date('2026-10-12T17:15:00Z'),
      ]);
      expect(await events(tx, requestId)).toEqual([
        ['DEVICE_SETUP', tariq.userId, phone.id, at, offset],
        ['MASTER_PASSCODE_USE', tariq.userId, phone.id, at, offset],
      ]);
      // Nothing of the morning's is changed: what was recorded under it keeps its site.
      expect(await kept(tx, morning.id)).toEqual(first);
      expect(first?.siteId).toBe(landfill.id);
      expect(await written(tx, phone)).toEqual([2, 4]);
      const tariqAgain = await signedIn(served, afternoon, tariq);
      expect(tookAt(tariqAgain)).toEqual([moved.id, 'Marsh Road TDSR']);
      const lists = await served.ask('GET', '/phones/current/lists', {
        bearer: afternoon,
        monitorSession: tariqAgain.token,
      });
      expect(told(lists)).toEqual([200, undefined]);
      expect(phoneListsAnswerSchema.parse(lists.body).assignment?.id).toBe(moved.id);
      // Moved back at 15:00 by the phone's clock, reported late: the last made is taken,
      // whenever each arrived.
      const back = setUp({ madeAt: '2026-10-12T19:00:00.000Z' });
      expect((await answered(served, afternoon, back)).said).toEqual(['SAVED', null]);
      expect(tookAt(await signedIn(served, afternoon, tariq))).toEqual([
        back.id,
        'Bayline County Landfill',
      ]);
    });
  });

  it('AC-02-47 nothing the dispatcher planned is changed from a phone: Dana’s assignment for Tariq names the phone and the Landfill; the phone is moved to Marsh Road TDSR, and his sign-in takes the one made on it, where until now it took none', async () => {
    await world(async (served, tx) => {
      const { dana, priced, site, landfill, phone, token, tariq, setUp } = await tariqAtTheLandfill(
        served,
        tx,
      );
      const tdsr = await site(priced.ids, 'Marsh Road TDSR');
      const planned = saved(
        writeAssignmentEndpoint,
        await ask(served, dana, writeAssignmentEndpoint, {
          ids: priced.ids,
          payload: {
            personId: tariq.userId,
            workDate: monday,
            fieldEventKinds: ['DISPOSAL'],
            certifying: false,
            formDocumentTypes: [],
            siteId: landfill.id,
            deviceId: phone.id,
            payItemIds: [],
          },
        }),
      ).record;
      const plan = await kept(tx, planned.id);
      expect(tookAt(await signedIn(served, token, tariq))).toEqual([
        planned.id,
        'Bayline County Landfill',
      ]);
      const moved = setUp({ siteId: tdsr.id, madeAt: '2026-10-12T17:10:00.000Z' });
      expect((await answered(served, token, moved)).said).toEqual(['SAVED', null]);
      expect(tookAt(await signedIn(served, token, tariq))).toEqual([moved.id, 'Marsh Road TDSR']);
      expect(await kept(tx, planned.id)).toEqual(plan);
      expect([plan?.origin, plan?.siteId, plan?.archivedAt]).toEqual([
        'PLANNED',
        landfill.id,
        null,
      ]);
    });
  });

  it('AC-02-46 the phone passes from Tariq to Sam under the master passcode at 13:00, and Sam has no assignment: a new unplanned assignment for Sam, a phone switched and a use of the passcode naming Sam at the phone’s own time, written as the master passcode’s actor; Sam’s sign-in takes it, and Tariq’s stays his; no wrong try is counted and no name is logged', async () => {
    await world(async (served, tx) => {
      const { landfill, phone, token, tariq, setUp } = await tariqAtTheLandfill(served, tx);
      const password = '5550142';
      const made = await served.ask('POST', '/phones/current/monitors', {
        bearer: token,
        payload: { name: 'Sam Grant', password, passcode },
      });
      expect(told(made)).toEqual([200, undefined]);
      const sam = { ...monitorCreatedAnswerSchema.parse(made.body), password };
      const tariqs = setUp();
      expect((await answered(served, token, tariqs)).said).toEqual(['SAVED', null]);
      const first = await kept(tx, tariqs.id);
      expect(tookAt(await signedIn(served, token, sam))).toEqual(['NONE_THAT_DAY', undefined]);
      served.clock.at = new Date('2026-10-12T17:05:00Z');
      const afternoon = await proven(served, phone);
      served.lines.length = 0;
      const at = '2026-10-12T17:00:00.000Z';
      const sams = setUp({ personId: sam.userId, occasion: 'MONITOR_SWITCH', madeAt: at });
      const { said, requestId } = await answered(served, afternoon, sams);
      expect(said).toEqual(['SAVED', null]);
      const second = await kept(tx, sams.id);
      expect([second?.personId, second?.siteId, second?.deviceId, second?.origin]).toEqual([
        sam.userId,
        landfill.id,
        phone.id,
        'UNPLANNED',
      ]);
      expect([second?.madeById, second?.madeAt, second?.deviceUtcOffsetMinutes]).toEqual([
        null,
        new Date(at),
        offset,
      ]);
      // REQ-202b: a device switch, about the monitor the phone was switched to.
      expect(await events(tx, requestId)).toEqual([
        ['DEVICE_SWITCH', sam.userId, phone.id, at, offset],
        ['MASTER_PASSCODE_USE', sam.userId, phone.id, at, offset],
      ]);
      const byThePasscode = [masterPasscodeActorId, 'DEVICE', phone.id];
      expect(await audited(tx, requestId)).toEqual([
        ['assignment', 'INSERT', ...byThePasscode],
        ['security_event', 'INSERT', ...byThePasscode],
        ['security_event', 'INSERT', ...byThePasscode],
      ]);
      expect(await tx.masterPasscodeTries.count()).toBe(0);
      const [line] = logged(
        served,
        'A phone reported an unplanned assignment made under the master passcode.',
      );
      expect(line).toMatchObject({
        deviceId: phone.id,
        assignmentId: sams.id,
        occasion: 'MONITOR_SWITCH',
        answer: 'SAVED',
      });
      const log = served.lines.join('\n');
      for (const never of ['Sam', sam.monitorNumber, 'Tariq', 'Landfill', passcode]) {
        expect(log, never).not.toContain(never);
      }
      // Each monitor's is their own: Sam's sign-in takes his, and Tariq's stands unchanged.
      expect(tookAt(await signedIn(served, afternoon, sam))).toEqual([
        sams.id,
        'Bayline County Landfill',
      ]);
      expect(await kept(tx, tariqs.id)).toEqual(first);
      expect(tookAt(await signedIn(served, afternoon, tariq))).toEqual([
        tariqs.id,
        'Bayline County Landfill',
      ]);
      // Sent again, it is kept once, its two events too.
      expect((await answered(served, afternoon, sams)).said).toEqual(['ALREADY_SAVED', null]);
      expect(await written(tx, phone)).toEqual([2, 4]);
    });
  });

  it('ADR-462 one monitor at a time: a switch saved ends the session of whoever was signed in on the phone before it, by the phone’s clock; it ends neither the session of the monitor switched to nor one opened since the switch, and a setup or a move ends none', async () => {
    await world(async (served, tx) => {
      const { phone, token, tariq, setUp } = await tariqAtTheLandfill(served, tx);
      const password = '5550142';
      const made = await served.ask('POST', '/phones/current/monitors', {
        bearer: token,
        payload: { name: 'Sam Grant', password, passcode },
      });
      expect(told(made)).toEqual([200, undefined]);
      const sam = { ...monitorCreatedAnswerSchema.parse(made.body), password };
      const on = (bearer: string, monitorSession: string) =>
        served.ask('GET', '/phones/current/monitor', { bearer, monitorSession });
      const stillOn = [200, undefined];
      const signedOut = [401, 'NOT_SIGNED_IN'];
      // Tariq signs in at 06:30. A setup and a move reported end nothing.
      const tariqs = (await signedIn(served, token, tariq)).token;
      expect((await answered(served, token, setUp())).said).toEqual(['SAVED', null]);
      // Nor does the phone set up for Sam at 06:40, at the Landfill or moved: only a switch.
      const forSam = setUp({ personId: sam.userId });
      expect((await answered(served, token, forSam)).said).toEqual(['SAVED', null]);
      expect(told(await on(token, tariqs))).toEqual(stillOn);
      // A switch to Sam the phone says was made at 06:20, before Tariq signed in: his session
      // came after it, and stands.
      const early = setUp({
        personId: sam.userId,
        occasion: 'MONITOR_SWITCH',
        madeAt: '2026-10-12T10:20:00.000Z',
      });
      expect((await answered(served, token, early)).said).toEqual(['SAVED', null]);
      expect(told(await on(token, tariqs))).toEqual(stillOn);
      // The phone passes to Sam at 13:00 with no connection, and reports it at 13:05.
      served.clock.at = new Date('2026-10-12T17:05:00Z');
      const afternoon = await proven(served, phone);
      const switched = setUp({
        personId: sam.userId,
        occasion: 'MONITOR_SWITCH',
        madeAt: '2026-10-12T17:00:00.000Z',
      });
      const { said, requestId } = await answered(served, afternoon, switched);
      expect(said).toEqual(['SAVED', null]);
      expect(told(await on(afternoon, tariqs))).toEqual(signedOut);
      const written = [masterPasscodeActorId, 'DEVICE', phone.id];
      expect(await audited(tx, requestId)).toEqual([
        ['assignment', 'INSERT', ...written],
        ['security_event', 'INSERT', ...written],
        ['security_event', 'INSERT', ...written],
        ['session', 'UPDATE', ...written],
      ]);
      // Sam signs in; a switch to Sam reported after that, made later still by the phone's
      // clock, is Sam's own and ends nothing of his. Sent again, it writes nothing.
      const sams = (await signedIn(served, afternoon, sam)).token;
      const again = setUp({
        personId: sam.userId,
        occasion: 'MONITOR_SWITCH',
        madeAt: '2026-10-12T17:30:00.000Z',
      });
      expect((await answered(served, afternoon, again)).said).toEqual(['SAVED', null]);
      expect(told(await on(afternoon, sams))).toEqual(stillOn);
      const repeated = await answered(served, afternoon, again);
      expect(repeated.said).toEqual(['ALREADY_SAVED', null]);
      expect(await audited(tx, repeated.requestId)).toEqual([]);
    });
  });
});
