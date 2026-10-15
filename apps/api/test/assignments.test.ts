// A day's assignments, written on the dispatch board, against the database (ARCHITECTURE §7;
// spec/acceptance/02-people-and-devices.md AC-02-24…32; spec/acceptance/10-api-and-sync.md
// AC-10-27, 33; BACKLOG 2.4.3, C102; ADR-240, 286, 308, 429). OWASP ASVS 5.0 V8. The real
// process, in this test's own memory, on the installation's database as `adms_api`: it needs
// `pnpm local:up` after `pnpm installer`, and fails saying so. Each test's work is undone
// (support/database.ts).
import { randomUUID } from 'node:crypto';

import {
  backOfficeRoles,
  changeAssignmentEndpoint,
  createPayItemEndpoint,
  createProjectEndpoint,
  createSiteEndpoint,
  endpoints,
  listAssignmentsEndpoint,
  reportUnplannedAssignmentEndpoint,
  withdrawAssignmentEndpoint,
  writeAssignmentEndpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Assignments } from '../src/dispatch/assignments.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { enrolledPhone, proven } from './support/phones.ts';
import { danasEmail, long, longer, luissEmail, worldOn, type Served } from './support/served.ts';
import {
  ask,
  notSaved,
  p1Priced,
  picked,
  plainly,
  saved,
  told,
  unticked,
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

const monday = '2026-10-12';

// P1 as Dana entered it, with Marsh Road TDSR, two unit rate pay items and a hauling one; three
// enrolled phones; and the monitors Ana Brooks and Jo Kim beside the world's Kim Nguyen.
async function p1Dispatched(api: Served, tx: Tx) {
  const dana = await api.signedIn(danasEmail, long);
  const priced = await p1Priced(api, dana, tx);
  const marshRoad = {
    name: 'Marsh Road TDSR',
    siteTypeId: (await tx.siteType.findUniqueOrThrow({ where: { key: 'TDSR' } })).id,
    takesLoads: true,
    haulOutsLeaveHere: true,
    chargesTippingFee: false,
    ineligibleSite: false,
    permitNumber: null,
    latitude: '39.09000000',
    longitude: '-75.62000000',
    activationDate: monday,
  };
  const tdsr = saved(
    createSiteEndpoint,
    await ask(api, dana, createSiteEndpoint, { ids: priced.ids, payload: marshRoad }),
  ).record;
  const entered = async (asked: Promise<Awaited<ReturnType<typeof ask>>>) =>
    saved(createPayItemEndpoint, await asked).record;
  const payItems = {
    hangers: await entered(priced.each('HNG-RMV-EA', 'Hanger removal', 'Hangers', '68.00')),
    leaners: await entered(
      priced.each('LNR-RMV-EA-24', 'Leaner removal 6–24 in', 'Leaners', '95.00', {
        from: 60,
        to: 240,
      }),
    ),
    vegHaul: await entered(priced.veg15()),
  };
  const enrol = async (name: string) =>
    tx.device.findUniqueOrThrow({ where: { id: (await enrolledPhone(api, tx, name)).id } });
  const phones = {
    collection: await enrol('P1-COL-1'),
    tdsrTower: await enrol('P1-TWR-TDSR'),
    landfillTower: await enrol('P1-TWR-LF'),
  };
  const monitor = (name: string) => tx.user.create({ data: { name, role: 'MONITOR' } });
  const ana = await monitor('Ana Brooks');
  const jo = await monitor('Jo Kim');
  return { dana, ...priced, marshRoad, tdsr, payItems, phones, ana, jo };
}

// Luis is granted Dispatch and signs in.
async function luisDispatches(api: Served, tx: Tx, luis: string): Promise<Browser> {
  await tx.userPermission.create({ data: { userId: luis, permission: 'DISPATCH' } });
  return api.signedIn(luissEmail, longer);
}

// Nothing of their work: what a request states beyond the person and the day.
const noWork = {
  fieldEventKinds: [],
  certifying: false,
  formDocumentTypes: [],
  siteId: null,
  deviceId: null,
  payItemIds: [],
};

const assignmentsOn = (tx: Tx, projectId: string) => tx.assignment.count({ where: { projectId } });

describe('who may ask', () => {
  it('AC-10-27 a day’s board is read by the back office; an assignment is written, changed and withdrawn by an admin or a manager/analyst who holds Dispatch', () => {
    const asked = (name: string) => {
      const { access, roles, permission } = endpoints.find((one) => one.name === name) ?? {};
      return [access, roles, permission];
    };
    expect(asked('listAssignments')).toEqual(['SIGNED_IN', backOfficeRoles, undefined]);
    for (const name of [
      'writeAssignment',
      'changeAssignment',
      'withdrawAssignment',
      'reinstateAssignment',
    ]) {
      expect(asked(name), name).toEqual(['SIGNED_IN', backOfficeRoles, 'DISPATCH']);
    }
    expect(
      endpoints.filter(({ permission }) => permission === 'DISPATCH').map(({ name }) => name),
    ).toEqual([
      'renamePhone',
      'removePhone',
      'returnPhone',
      'writeAssignment',
      'changeAssignment',
      'withdrawAssignment',
      'reinstateAssignment',
    ]);
  });

  it('AC-10-27 each is refused to nobody and to a read-only viewer; writing, changing and withdrawing to a manager/analyst without the grant, before anything sent is read; Setup opens nothing here; nothing is written', async () => {
    await world(async (served, tx, who, within) => {
      const p1 = await p1Dispatched(served, tx);
      const kims = await tx.assignment.create({
        data: {
          personId: who.kim,
          workDate: new Date(monday),
          projectId: p1.project.id,
          fieldEventKinds: ['DISPOSAL'],
          origin: 'PLANNED',
          madeById: who.dana,
        },
      });
      const luis = await served.signedIn(luissEmail, longer);
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      // A body no schema would take: the door answers first.
      const nonsense = { payload: { nonsense: true } };
      const ids = { ...p1.ids, assignmentId: kims.id };
      const changes = [
        [writeAssignmentEndpoint, { ids, ...nonsense }],
        [changeAssignmentEndpoint, { ids, ...nonsense }],
        [withdrawAssignmentEndpoint, { ids }],
      ] as const;
      for (const [endpoint, more] of [
        [listAssignmentsEndpoint, { ids, query: `?workDate=${monday}` }],
        ...changes,
      ] as const) {
        expect(told(await ask(served, undefined, endpoint, more)), endpoint.name).toEqual([
          401,
          'NOT_SIGNED_IN',
        ]);
        expect(told(await ask(served, viewer, endpoint, more)), endpoint.name).toEqual([
          403,
          'NOT_ALLOWED',
        ]);
      }
      await tx.userPermission.create({ data: { userId: who.luis, permission: 'SETUP' } });
      for (const [endpoint, more] of changes) {
        expect(told(await ask(served, luis, endpoint, more)), endpoint.name).toEqual([
          403,
          'NOT_ALLOWED',
        ]);
      }
      // The board is the whole back office's to read.
      expect(
        saved(
          listAssignmentsEndpoint,
          await ask(served, luis, listAssignmentsEndpoint, { ids, query: `?workDate=${monday}` }),
        ).assignments.map(({ id, withdrawnAt }) => [id, withdrawnAt]),
      ).toEqual([[kims.id, null]]);
      expect(await assignmentsOn(tx, p1.project.id)).toBe(1);
    });
  });

  it('the service asks again inside its own piece of work (ADR-364): called as a manager/analyst without Dispatch, a read-only viewer, a monitor, an archived admin or nobody on record, it changes nothing and says who may', async () => {
    await world(async (served, tx, who, within) => {
      const p1 = await p1Dispatched(served, tx);
      const service = new Assignments(within, served.clock);
      const kims = saved(
        writeAssignmentEndpoint,
        await ask(served, p1.dana, writeAssignmentEndpoint, {
          ids: p1.ids,
          payload: { ...noWork, personId: who.kim, workDate: monday },
        }),
      ).record;
      const gone = await tx.user.create({ data: { name: 'Morgan Ellis', role: 'ADMIN' } });
      await tx.user.update({ where: { id: gone.id }, data: { archivedAt: new Date() } });
      // A grant written beside somebody who is no manager/analyst grants nothing.
      await tx.userPermission.create({ data: { userId: who.viewer, permission: 'DISPATCH' } });
      for (const caller of [who.luis, who.viewer, who.kim, gone.id, randomUUID()]) {
        for (const outcome of [
          await service.assign(caller, {
            projectId: p1.project.id,
            personId: p1.ana.id,
            workDate: monday,
          }),
          await service.change(caller, kims.id, { certifying: true }),
          await service.withdraw(caller, kims.id),
        ]) {
          expect(outcome.saved ? 'saved' : outcome.refusal.code, caller).toBe('NOT_ALLOWED');
        }
        const page = await service.list(caller, p1.project.id, {
          workDate: monday,
          withdrawn: false,
          limit: 50,
        });
        if (caller !== who.luis) expect(page.done, caller).toBe(false);
      }
      const luis = await service.withdraw(who.luis, kims.id);
      expect(luis.saved ? '' : luis.refusal.message).toBe(
        'Luis Ortega may not dispatch: it takes an admin, or a manager/analyst granted "dispatch". Nothing was changed.',
      );
      const kept = await tx.assignment.findMany({ where: { projectId: p1.project.id } });
      expect(kept.map(({ id, certifying, archivedAt }) => [id, certifying, archivedAt])).toEqual([
        [kims.id, false, null],
      ]);
    });
  });
});

describe('Monday’s board', () => {
  it('AC-02-24, AC-02-26 Luis writes it: Kim Nguyen on P1, disposals, at Marsh Road TDSR, on P1-TWR-TDSR; Ana Brooks on collections, with no site; each planned and saying he wrote it, audited with him as the actor; the board is read a page at a time, in the order written', async () => {
    await world(async (served, tx, who) => {
      const p1 = await p1Dispatched(served, tx);
      const luis = await luisDispatches(served, tx, who.luis);
      const write = (payload: object) =>
        ask(served, luis, writeAssignmentEndpoint, { ids: p1.ids, payload });
      const answer = await write({
        ...noWork,
        personId: who.kim,
        workDate: monday,
        fieldEventKinds: ['DISPOSAL'],
        siteId: p1.tdsr.id,
        deviceId: p1.phones.tdsrTower.id,
      });
      const kims = saved(writeAssignmentEndpoint, answer);
      expect(kims).toEqual({
        record: {
          id: kims.record.id,
          projectId: p1.project.id,
          person: { id: who.kim, name: 'Kim Nguyen', monitorId: who.kimsId },
          workDate: monday,
          fieldEventKinds: ['DISPOSAL'],
          certifying: false,
          formDocumentTypes: [],
          site: { id: p1.tdsr.id, name: 'Marsh Road TDSR' },
          phone: { id: p1.phones.tdsrTower.id, name: 'P1-TWR-TDSR' },
          payItems: [],
          origin: 'PLANNED',
          madeBy: { id: who.luis, name: 'Luis Ortega' },
          withdrawnAt: null,
          withdrawalNote: null,
        },
        warnings: [],
      });
      expect(
        await tx.auditRecord.findMany({
          where: { requestId: answer.requestId },
          select: { tableName: true, operation: true, actorId: true, source: true, recordId: true },
        }),
      ).toEqual([
        {
          tableName: 'assignment',
          operation: 'INSERT',
          actorId: who.luis,
          source: 'BACK_OFFICE',
          recordId: kims.record.id,
        },
      ]);
      const anas = saved(
        writeAssignmentEndpoint,
        await write({
          ...noWork,
          personId: p1.ana.id,
          workDate: monday,
          fieldEventKinds: ['COLLECTION'],
          formDocumentTypes: ['ROE', 'SURVEY'],
          deviceId: p1.phones.collection.id,
        }),
      ).record;
      expect([anas.site, anas.phone?.name, anas.formDocumentTypes, anas.person.monitorId]).toEqual([
        null,
        'P1-COL-1',
        ['ROE', 'SURVEY'],
        p1.ana.monitorNumber,
      ]);

      const board = (query: string) =>
        ask(served, luis, listAssignmentsEndpoint, { ids: p1.ids, query });
      const first = saved(listAssignmentsEndpoint, await board(`?workDate=${monday}&limit=1`));
      expect([first.assignments, first.next]).toEqual([[kims.record], kims.record.id]);
      const rest = saved(
        listAssignmentsEndpoint,
        await board(`?workDate=${monday}&limit=1&after=${String(first.next)}`),
      );
      expect([rest.assignments, rest.next]).toEqual([[anas], null]);
      // Tuesday's board is its own, and so is another project's.
      for (const query of ['?workDate=2026-10-13', `?workDate=${monday}&withdrawn=true`]) {
        expect(saved(listAssignmentsEndpoint, await board(query)), query).toEqual({
          assignments: [],
          next: null,
        });
      }
      for (const query of [
        '',
        '?workDate=12/10/2026',
        '?workDate=2026-02-30',
        `?workDate=${monday}&limit=0`,
        `?workDate=${monday}&limit=201`,
        `?workDate=${monday}&after=first`,
        `?workDate=${monday}&personId=${who.kim}`,
      ]) {
        expect(told(await board(query)), query).toEqual([400, 'BAD_REQUEST']);
      }
      expect(
        told(await ask(served, luis, listAssignmentsEndpoint, { query: `?workDate=${monday}` })),
      ).toEqual([404, 'NOT_FOUND']);
    });
  });

  it('AC-02-29 never stops a second one: Ana on P1 twice in a day, and on the phone Kim’s names, are all saved; one of the firm’s back office is given one too', async () => {
    await world(async (served, tx, who) => {
      const p1 = await p1Dispatched(served, tx);
      const luis = await luisDispatches(served, tx, who.luis);
      const write = async (personId: string, deviceId: string | null) =>
        saved(
          writeAssignmentEndpoint,
          await ask(served, luis, writeAssignmentEndpoint, {
            ids: p1.ids,
            payload: {
              ...noWork,
              personId,
              workDate: monday,
              fieldEventKinds: ['COLLECTION'],
              deviceId,
            },
          }),
        ).record;
      const phone = p1.phones.collection.id;
      await write(p1.ana.id, phone);
      await write(p1.ana.id, phone);
      await write(who.kim, phone);
      // A supervisor from the back office.
      const dana = await write(who.dana, null);
      expect([dana.person.name, dana.phone, dana.madeBy?.name]).toEqual([
        'Dana Reyes',
        null,
        'Luis Ortega',
      ]);
      expect(await assignmentsOn(tx, p1.project.id)).toBe(4);
    });
  });

  it('is never for a read-only viewer or an archived person, never on a phone taken out of service: each refused in plain words, nothing saved; a person, a phone or a project nobody has isn’t found; what no schema names is refused by the schema', async () => {
    await world(async (served, tx, who) => {
      const p1 = await p1Dispatched(served, tx);
      const luis = await luisDispatches(served, tx, who.luis);
      const write = (payload: object, ids: Readonly<Record<string, string>> = p1.ids) =>
        ask(served, luis, writeAssignmentEndpoint, { ids, payload });
      const kims = { ...noWork, personId: who.kim, workDate: monday };
      await tx.user.update({ where: { id: p1.jo.id }, data: { archivedAt: new Date() } });
      await tx.device.update({
        where: { id: p1.phones.landfillTower.id },
        data: {
          status: 'LOST',
          outOfServiceAt: new Date('2026-10-12T22:10:00Z'),
          outOfServiceMarkedAt: new Date('2026-10-12T22:10:00Z'),
        },
      });
      expect(notSaved(await write({ ...kims, personId: who.viewer }))).toEqual([
        'PERSON_NOT_ASSIGNABLE',
        'Bayline County debris manager can’t be given an assignment: one is for a monitor or one of the firm’s back office. Nothing was saved.',
      ]);
      expect(notSaved(await write({ ...kims, personId: p1.jo.id }))).toEqual([
        'PERSON_ARCHIVED',
        'Jo Kim is archived, and can’t be given an assignment. Nothing was saved.',
      ]);
      expect(notSaved(await write({ ...kims, deviceId: p1.phones.landfillTower.id }))).toEqual([
        'PHONE_OUT_OF_SERVICE',
        'P1-TWR-LF was taken out of service. Name another phone, or none. Nothing was saved.',
      ]);
      for (const missing of [
        write({ ...kims, personId: randomUUID() }),
        write({ ...kims, deviceId: randomUUID() }),
        write({ ...kims, payItemIds: [randomUUID()] }),
        write(kims, {}),
      ]) {
        expect(told(await missing)).toEqual([404, 'NOT_FOUND']);
      }
      const { personId, ...nobody } = kims;
      for (const payload of [
        nobody,
        { ...kims, workDate: '10/12/2026' },
        { ...kims, fieldEventKinds: ['TOWER'] },
        { ...kims, fieldEventKinds: ['DISPOSAL', 'DISPOSAL'] },
        // AC-02-27: only the four forms that are no ticket's.
        { ...kims, formDocumentTypes: ['LOAD'] },
        { ...kims, formDocumentTypes: ['CERTIFICATION'] },
        { ...kims, origin: 'UNPLANNED' },
        { ...kims, madeById: who.dana },
        { ...kims, projectId: p1.project.id },
        { personId, workDate: monday },
      ]) {
        expect(told(await write(payload)), JSON.stringify(payload)).toEqual([400, 'BAD_REQUEST']);
      }
      expect(await assignmentsOn(tx, p1.project.id)).toBe(0);
    });
  });
});

describe('the unit rate pay items of a day', () => {
  it('AC-02-31, AC-02-32 Luis gives Jo Kim’s unit rate assignment HNG-RMV-EA and LNR-RMV-EA-24: both are kept, each with the pay item’s own kind of work; VEG-HAUL-CY-15, a hauling pay item, is refused by its code; a pay item named twice is refused by the schema; one taken off is archived and put back as the same row, never deleted, each step audited with Luis as its actor', async () => {
    await world(async (served, tx, who) => {
      const p1 = await p1Dispatched(served, tx);
      const luis = await luisDispatches(served, tx, who.luis);
      const { hangers, leaners, vegHaul } = p1.payItems;
      const jos = {
        ...noWork,
        personId: p1.jo.id,
        workDate: monday,
        fieldEventKinds: ['UNIT_RATE'],
        formDocumentTypes: ['INCIDENT'],
      };
      const write = (payItemIds: readonly string[]) =>
        ask(served, luis, writeAssignmentEndpoint, {
          ids: p1.ids,
          payload: { ...jos, payItemIds },
        });
      expect(notSaved(await write([hangers.id, vegHaul.id]))).toEqual([
        'NOT_A_UNIT_RATE_PAY_ITEM',
        'VEG-HAUL-CY-15 is no unit rate pay item: an assignment names only the unit rate pay items a person does that day. Nothing was saved.',
      ]);
      expect(told(await write([hangers.id, hangers.id]))).toEqual([400, 'BAD_REQUEST']);
      expect(await assignmentsOn(tx, p1.project.id)).toBe(0);

      const written = saved(writeAssignmentEndpoint, await write([leaners.id, hangers.id])).record;
      expect(written.payItems).toEqual([
        { id: hangers.id, code: 'HNG-RMV-EA', description: 'Hanger removal' },
        { id: leaners.id, code: 'LNR-RMV-EA-24', description: 'Leaner removal 6–24 in' },
      ]);
      const rows = () =>
        tx.assignmentPayItem.findMany({
          where: { assignmentId: written.id },
          orderBy: { payItem: { code: 'asc' } },
          select: {
            id: true,
            projectId: true,
            payItemId: true,
            kindOfWorkId: true,
            archivedAt: true,
          },
        });
      const named = await rows();
      expect(named).toEqual(
        [hangers, leaners].map((payItem, at) => ({
          id: named[at]?.id,
          projectId: p1.project.id,
          payItemId: payItem.id,
          kindOfWorkId: payItem.kindOfWorkId,
          archivedAt: null,
        })),
      );

      const change = (payItemIds: readonly string[]) =>
        ask(served, luis, changeAssignmentEndpoint, {
          ids: { assignmentId: written.id },
          payload: { payItemIds },
        });
      // Leaners are taken off Jo's day.
      served.clock.later(1);
      const off = await change([hangers.id]);
      expect(saved(changeAssignmentEndpoint, off).record.payItems.map(({ code }) => code)).toEqual([
        'HNG-RMV-EA',
      ]);
      expect((await rows()).map(({ id, archivedAt }) => [id, archivedAt])).toEqual([
        [named[0]?.id, null],
        [named[1]?.id, served.clock.now()],
      ]);
      // And put back: the same row, out of the archive.
      const back = await change([hangers.id, leaners.id]);
      expect(saved(changeAssignmentEndpoint, back).record.payItems).toEqual(written.payItems);
      expect((await rows()).map(({ id, archivedAt }) => [id, archivedAt])).toEqual(
        named.map(({ id }) => [id, null]),
      );
      // The hauling pay item is refused on a change too, and nothing of the change is kept.
      const refused = await ask(served, luis, changeAssignmentEndpoint, {
        ids: { assignmentId: written.id },
        payload: { certifying: true, payItemIds: [vegHaul.id] },
      });
      expect(notSaved(refused)[0]).toBe('NOT_A_UNIT_RATE_PAY_ITEM');
      const kept = await tx.assignment.findUniqueOrThrow({ where: { id: written.id } });
      expect([kept.certifying, (await rows()).map(({ archivedAt }) => archivedAt)]).toEqual([
        false,
        [null, null],
      ]);
      expect(
        (
          await tx.auditRecord.findMany({
            where: { requestId: { in: [off.requestId, back.requestId] } },
            orderBy: { id: 'asc' },
            select: {
              tableName: true,
              operation: true,
              actorId: true,
              recordId: true,
              changedFields: true,
            },
          })
        ).filter(({ tableName }) => tableName === 'assignment_pay_item'),
      ).toEqual(
        [off, back].map(() => ({
          tableName: 'assignment_pay_item',
          operation: 'UPDATE',
          actorId: who.luis,
          recordId: named[1]?.id,
          changedFields: ['archived_at'],
        })),
      );
    });
  });
});

describe('an assignment changed and withdrawn', () => {
  it('only what is stated changes, the prior value kept in the audit log: Kim moves to another phone and certifies too; her person, day and project are no part of a change; a phone taken out of service can’t be named', async () => {
    await world(async (served, tx, who) => {
      const p1 = await p1Dispatched(served, tx);
      const luis = await luisDispatches(served, tx, who.luis);
      const kims = saved(
        writeAssignmentEndpoint,
        await ask(served, luis, writeAssignmentEndpoint, {
          ids: p1.ids,
          payload: {
            ...noWork,
            personId: who.kim,
            workDate: monday,
            fieldEventKinds: ['DISPOSAL'],
            siteId: p1.tdsr.id,
            deviceId: p1.phones.tdsrTower.id,
          },
        }),
      ).record;
      const change = (payload: object) =>
        ask(served, luis, changeAssignmentEndpoint, { ids: { assignmentId: kims.id }, payload });
      const answer = await change({ deviceId: p1.phones.collection.id, certifying: true });
      expect(saved(changeAssignmentEndpoint, answer).record).toEqual({
        ...kims,
        phone: { id: p1.phones.collection.id, name: 'P1-COL-1' },
        certifying: true,
      });
      const [audited] = await tx.auditRecord.findMany({ where: { requestId: answer.requestId } });
      expect([
        audited?.tableName,
        audited?.operation,
        audited?.actorId,
        audited?.changedFields,
        (audited?.priorValue as { device_id: string }).device_id,
      ]).toEqual([
        'assignment',
        'UPDATE',
        who.luis,
        ['certifying', 'device_id'],
        p1.phones.tdsrTower.id,
      ]);
      // A curb collection instead, with no site and no phone named.
      const curb = saved(
        changeAssignmentEndpoint,
        await change({ fieldEventKinds: ['COLLECTION'], siteId: null, deviceId: null }),
      ).record;
      expect([curb.fieldEventKinds, curb.site, curb.phone, curb.certifying]).toEqual([
        ['COLLECTION'],
        null,
        null,
        true,
      ]);
      await tx.device.update({
        where: { id: p1.phones.landfillTower.id },
        data: {
          status: 'RETIRED',
          outOfServiceAt: new Date('2026-10-12T22:10:00Z'),
          outOfServiceMarkedAt: new Date('2026-10-12T22:10:00Z'),
        },
      });
      expect(notSaved(await change({ deviceId: p1.phones.landfillTower.id }))[0]).toBe(
        'PHONE_OUT_OF_SERVICE',
      );
      for (const payload of [
        {},
        { personId: p1.ana.id },
        { workDate: '2026-10-13' },
        { projectId: p1.project.id },
        { formDocumentTypes: ['HAUL_OUT'] },
        { archivedAt: null },
      ]) {
        expect(told(await change(payload)), JSON.stringify(payload)).toEqual([400, 'BAD_REQUEST']);
      }
      expect(
        told(await ask(served, luis, changeAssignmentEndpoint, { payload: { certifying: true } })),
      ).toEqual([404, 'NOT_FOUND']);
    });
  });

  it('AC-02-30 Luis withdraws Kim’s: it is archived from that moment, never deleted, and read among the withdrawn; once: a second withdrawal and a change are refused in plain words', async () => {
    await world(async (served, tx, who) => {
      const p1 = await p1Dispatched(served, tx);
      await tx.userPermission.create({ data: { userId: who.luis, permission: 'DISPATCH' } });
      // 6:05 am in Bayline County.
      served.clock.at = new Date('2026-10-12T10:05:00Z');
      const luis = await served.signedIn(luissEmail, longer);
      const kims = saved(
        writeAssignmentEndpoint,
        await ask(served, luis, writeAssignmentEndpoint, {
          ids: p1.ids,
          payload: {
            ...noWork,
            personId: who.kim,
            workDate: monday,
            fieldEventKinds: ['DISPOSAL'],
          },
        }),
      ).record;
      const ids = { assignmentId: kims.id };
      const answer = await ask(served, luis, withdrawAssignmentEndpoint, { ids });
      expect(saved(withdrawAssignmentEndpoint, answer).record).toEqual({
        ...kims,
        withdrawnAt: '2026-10-12T10:05:00.000Z',
        withdrawalNote: null,
      });
      expect(
        await tx.auditRecord.findMany({
          where: { requestId: answer.requestId },
          select: { tableName: true, operation: true, actorId: true, changedFields: true },
        }),
      ).toEqual([
        {
          tableName: 'assignment',
          operation: 'UPDATE',
          actorId: who.luis,
          changedFields: ['archived_at'],
        },
      ]);
      const board = async (query: string) =>
        saved(
          listAssignmentsEndpoint,
          await ask(served, luis, listAssignmentsEndpoint, { ids: p1.ids, query }),
        ).assignments.map(({ id }) => id);
      expect([
        await board(`?workDate=${monday}`),
        await board(`?workDate=${monday}&withdrawn=true`),
      ]).toEqual([[], [kims.id]]);

      served.clock.later(3);
      const words = 'Kim Nguyen’s assignment was already withdrawn. Nothing was changed.';
      expect(notSaved(await ask(served, luis, withdrawAssignmentEndpoint, { ids }))).toEqual([
        'ALREADY_WITHDRAWN',
        words,
      ]);
      expect(
        notSaved(
          await ask(served, luis, changeAssignmentEndpoint, { ids, payload: { certifying: true } }),
        ),
      ).toEqual(['ALREADY_WITHDRAWN', words]);
      const kept = await tx.assignment.findUniqueOrThrow({ where: { id: kims.id } });
      expect([kept.archivedAt?.toISOString(), kept.certifying]).toEqual([
        '2026-10-12T10:05:00.000Z',
        false,
      ]);
      expect(told(await ask(served, luis, withdrawAssignmentEndpoint, {}))).toEqual([
        404,
        'NOT_FOUND',
      ]);
    });
  });

  it('AC-02-26 one made on a phone under the master passcode is on the board, unplanned, with no author and always its phone; the board changes and withdraws nothing of it', async () => {
    await world(async (served, tx, who) => {
      const p1 = await p1Dispatched(served, tx);
      const luis = await luisDispatches(served, tx, who.luis);
      const tariq = await tx.user.create({ data: { name: 'Tariq Patel', role: 'MONITOR' } });
      // As the phone reports it (ADR-457): its id is the phone's own, its day its clock's.
      const tower = await enrolledPhone(served, tx, 'P1-TWR-LF');
      const unplanned = { id: randomUUID() };
      const reported = await served.ask('POST', reportUnplannedAssignmentEndpoint.path, {
        bearer: await proven(served, tower),
        payload: {
          id: unplanned.id,
          projectId: p1.project.id,
          personId: tariq.id,
          fieldEventKinds: ['DISPOSAL', 'HAUL_OUT_DISPOSAL'],
          certifying: false,
          formDocumentTypes: [],
          siteId: p1.tdsr.id,
          payItemIds: [],
          occasion: 'SETUP',
          madeAt: `${monday}T10:40:00.000Z`,
          deviceUtcOffsetMinutes: -240,
        },
      });
      expect(saved(reportUnplannedAssignmentEndpoint, reported).answer).toBe('SAVED');
      const board = saved(
        listAssignmentsEndpoint,
        await ask(served, luis, listAssignmentsEndpoint, {
          ids: p1.ids,
          query: `?workDate=${monday}`,
        }),
      );
      expect(
        board.assignments.map(({ id, origin, madeBy, phone }) => [id, origin, madeBy, phone?.name]),
      ).toEqual([[unplanned.id, 'UNPLANNED', null, 'P1-TWR-LF']]);
      const ids = { assignmentId: unplanned.id };
      const words =
        'Tariq Patel’s assignment was made on a phone under the master passcode: the board shows it and changes nothing of it. Nothing was changed.';
      expect(notSaved(await ask(served, luis, withdrawAssignmentEndpoint, { ids }))).toEqual([
        'MADE_ON_A_PHONE',
        words,
      ]);
      expect(
        notSaved(
          await ask(served, luis, changeAssignmentEndpoint, { ids, payload: { siteId: null } }),
        ),
      ).toEqual(['MADE_ON_A_PHONE', words]);
      const kept = await tx.assignment.findUniqueOrThrow({ where: { id: unplanned.id } });
      expect([kept.siteId, kept.archivedAt]).toEqual([p1.tdsr.id, null]);
    });
  });
});

describe('what the database refuses, said plainly (AC-10-33)', () => {
  // P2, the same client's PPDR work under the same declaration event, with a site and a unit
  // rate pay item of its own.
  async function p2Of(served: Served, tx: Tx, p1: Awaited<ReturnType<typeof p1Dispatched>>) {
    const { project } = p1;
    const p2 = saved(
      createProjectEndpoint,
      await ask(served, p1.dana, createProjectEndpoint, {
        payload: {
          name: 'Bayline County PPDR, Hurricane Delphine',
          clientId: project.clientId,
          declarationEventId: project.declarationEventId,
          programTypeId: project.programTypeId,
          timeZone: project.timeZone,
          activeFrom: project.activeFrom,
          activeTo: project.activeTo,
          ticketNumberSource: project.ticketNumberSource,
          workflows: project.workflows,
          kindOfWorkIds: (await picked(tx)).kindOfWorkIds,
        },
      }),
    ).record;
    return { ids: { projectId: p2.id } };
  }

  it('AC-02-25 an assignment on P1 at P2’s Marsh Road TDSR is refused: its site is one of its own project’s', async () => {
    await world(async (served, tx, who) => {
      const p1 = await p1Dispatched(served, tx);
      const p2 = await p2Of(served, tx, p1);
      const p2Site = saved(
        createSiteEndpoint,
        await ask(served, p1.dana, createSiteEndpoint, { ids: p2.ids, payload: p1.marshRoad }),
      ).record;
      const luis = await luisDispatches(served, tx, who.luis);
      const answer = await ask(served, luis, writeAssignmentEndpoint, {
        ids: p1.ids,
        payload: { ...noWork, personId: who.kim, workDate: monday, siteId: p2Site.id },
      });
      expect([told(answer), plainly(answer)]).toEqual([
        [422, 'UNKNOWN_RECORD'],
        'Not saved: an assignment’s site is one of its own project’s sites.',
      ]);
    });
  });

  it('AC-02-31 a pay item of another project is refused on P1’s assignment, unit rate or not', async () => {
    await world(async (served, tx, who) => {
      const p1 = await p1Dispatched(served, tx);
      const p2 = await p2Of(served, tx, p1);
      const p2Hangers = saved(
        createPayItemEndpoint,
        await ask(served, p1.dana, createPayItemEndpoint, {
          ids: p2.ids,
          payload: {
            ...unticked,
            code: 'HNG-RMV-EA',
            description: 'Hanger removal',
            payableTypeId: await p1.payableType('Hangers'),
            unit: 'EA',
            kindOfWorkId: await p1.kindOfWork('Hangers'),
            countIsAlwaysOne: true,
            photosRequired: true,
            rates: [],
          },
        }),
      ).record;
      const luis = await luisDispatches(served, tx, who.luis);
      const answer = await ask(served, luis, writeAssignmentEndpoint, {
        ids: p1.ids,
        payload: {
          ...noWork,
          personId: p1.jo.id,
          workDate: monday,
          fieldEventKinds: ['UNIT_RATE'],
          payItemIds: [p2Hangers.id],
        },
      });
      expect([told(answer), plainly(answer)]).toEqual([
        [422, 'UNKNOWN_RECORD'],
        'Not saved: an assignment names the unit rate pay items of its own project.',
      ]);
    });
  });
});
