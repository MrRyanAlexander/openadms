// The firm's people, a page at a time, changed, given another role and taken out of the archive,
// against the database (task 2.4.2, part 4 of 4; BACKLOG C92, C100; ARCHITECTURE §6,
// Authorization, §7.0; acceptance file 02, AC-02-06, 09, 12, 13, 72, 75, 83; file 10, AC-10-27 for
// these endpoints; T-14; ADR-415, 427). OWASP ASVS 5.0 V8, 6.3.7; API Security Top 10, API1, API3,
// API5. The real process, in this test's own memory, on the test database as
// `adms_api`: it needs `pnpm local:up` after `pnpm installer`, and fails saying so. Each test's
// work is undone (support/database.ts).
import {
  archivePersonEndpoint,
  changePersonEndpoint,
  createPersonEndpoint,
  listPeopleEndpoint,
  peoplePageAtMost,
  readPersonEndpoint,
  setPermissionsEndpoint,
  setPersonRoleEndpoint,
  unarchivePersonEndpoint,
  type PersonAnswer,
} from '@open-adms/contracts';
import {
  deviceKeyActorId,
  masterPasscodeActorId,
  systemActorId,
  type Database,
} from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { refusedAsTheLastAdmin } from '../src/people/people.ts';
import { testSettings, openTestDatabase, type Tx } from './support/database.ts';
import { danasEmail, long, longer, luissEmail, worldOn, type Served } from './support/served.ts';
import { ask, saved, told, viewerSignsIn, type Browser } from './support/setup.ts';
import { Outbox } from './support/sign-in.ts';

const nobody = '0199a3c0-0000-7000-8000-000000000042';
const morgan = {
  name: 'Morgan Ellis',
  role: 'MANAGER_ANALYST',
  email: 'morgan.ellis@gates.example',
};

let db: Database;

beforeAll(() => {
  db = openTestDatabase(testSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const change = (api: Served, signed: Browser, userId: string, payload: object) =>
  ask(api, signed, changePersonEndpoint, { ids: { userId }, payload });
const role = (api: Served, signed: Browser, userId: string, to: string) =>
  ask(api, signed, setPersonRoleEndpoint, { ids: { userId }, payload: { role: to } });
const archive = (api: Served, signed: Browser, userId: string) =>
  ask(api, signed, archivePersonEndpoint, { ids: { userId } });
const unarchive = (api: Served, signed: Browser, userId: string) =>
  ask(api, signed, unarchivePersonEndpoint, { ids: { userId } });
const read = async (api: Served, signed: Browser, userId: string): Promise<PersonAnswer> =>
  saved(readPersonEndpoint, await ask(api, signed, readPersonEndpoint, { ids: { userId } }));
const page = (api: Served, signed: Browser, query = '') =>
  ask(api, signed, listPeopleEndpoint, { query });
// What the audit log holds of a person's row for one request: who, and which fields.
const audited = async (tx: Tx, requestId: string) =>
  (await tx.auditRecord.findMany({ where: { requestId, tableName: 'user' } })).map(
    ({ actorId, operation, domain, changedFields }) => [actorId, operation, domain, changedFields],
  );

describe('who may ask', () => {
  it('AC-10-27 changing a person, their role and taking one out of the archive are refused to nobody, to a manager/analyst and to a read-only viewer before anything sent is read; a page of people is the back office’s', async () => {
    await world(async (served, tx, who, within) => {
      const luis = await served.signedIn(luissEmail, longer);
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      // A body no schema takes: who may call is asked first.
      const payload = { nobody: 'named this field' };
      for (const endpoint of [
        changePersonEndpoint,
        setPersonRoleEndpoint,
        unarchivePersonEndpoint,
      ]) {
        const more = { ids: { userId: who.kim }, payload };
        expect(told(await ask(served, undefined, endpoint, more)), endpoint.name).toEqual([
          401,
          'NOT_SIGNED_IN',
        ]);
        for (const signed of [luis, viewer]) {
          expect(told(await ask(served, signed, endpoint, more)), endpoint.name).toEqual([
            403,
            'NOT_ALLOWED',
          ]);
        }
      }
      expect(told(await page(served, viewer, '?nobody=named'))).toEqual([403, 'NOT_ALLOWED']);
      expect(told(await ask(served, undefined, listPeopleEndpoint))).toEqual([
        401,
        'NOT_SIGNED_IN',
      ]);
      expect(told(await page(served, luis))).toEqual([200, undefined]);
      const kim = await tx.user.findUniqueOrThrow({ where: { id: who.kim } });
      expect([kim.name, kim.role, kim.archivedAt]).toEqual(['Kim Nguyen', 'MONITOR', null]);
    });
  });
});

describe('a page of the firm’s people', () => {
  it('AC-02-72 Dana reads the firm’s people two at a time, in the order they were added, to the last page; never the system actor, the master passcode’s or the device key’s; Luis reads them too, without a monitor’s phone number', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const luis = await served.signedIn(luissEmail, longer);
      await tx.user.update({ where: { id: who.kim }, data: { phone: '555-0142' } });
      const inService = await tx.user.findMany({
        where: { role: { notIn: ['SYSTEM', 'MASTER_PASSCODE', 'DEVICE_KEY'] }, archivedAt: null },
        orderBy: { id: 'asc' },
      });
      expect(inService.length).toBeGreaterThanOrEqual(4);
      const seen: PersonAnswer[] = [];
      const two = async (after?: string) =>
        saved(
          listPeopleEndpoint,
          await page(served, dana, `?limit=2${after === undefined ? '' : `&after=${after}`}`),
        );
      let answer = await two();
      seen.push(...answer.people);
      // Never more pages than people: a `next` that led nowhere would fail here, not hang.
      while (answer.next !== null && seen.length <= inService.length) {
        expect(answer.people).toHaveLength(2);
        expect(answer.next).toBe(answer.people.at(-1)?.id);
        answer = await two(answer.next);
        seen.push(...answer.people);
      }
      expect(seen.map(({ id }) => id)).toEqual(inService.map(({ id }) => id));
      expect(seen.map(({ id }) => id)).not.toContain(systemActorId);
      expect(seen.map(({ id }) => id)).not.toContain(masterPasscodeActorId);
      expect(seen.map(({ id }) => id)).not.toContain(deviceKeyActorId);
      // With no limit said, one page holds them all here; Dana sees Kim's phone, Luis doesn't.
      const whole = saved(listPeopleEndpoint, await page(served, dana));
      expect(whole.people).toEqual(seen);
      expect(whole.next).toBeNull();
      expect(whole.people.find(({ id }) => id === who.kim)?.phone).toBe('555-0142');
      const luiss = await page(served, luis);
      const kim = saved(listPeopleEndpoint, luiss).people.find(({ id }) => id === who.kim);
      expect(kim).toMatchObject({ name: 'Kim Nguyen', role: 'MONITOR' });
      expect(Object.keys(kim ?? {})).not.toContain('phone');
      expect(luiss.text).not.toContain('555-0142');
    });
  });

  it('by role, and the archived ones apart: Luis, archived, is on the archived page and no longer among those in service', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const monitors = saved(listPeopleEndpoint, await page(served, dana, '?role=MONITOR'));
      expect(monitors.people.map(({ role }) => role)).toEqual(monitors.people.map(() => 'MONITOR'));
      expect(monitors.people.map(({ id }) => id)).toContain(who.kim);
      saved(archivePersonEndpoint, await archive(served, dana, who.luis));
      const ids = async (query: string) =>
        saved(listPeopleEndpoint, await page(served, dana, query)).people.map(({ id }) => id);
      expect(await ids('?archived=true&role=MANAGER_ANALYST')).toContain(who.luis);
      expect(await ids('?role=MANAGER_ANALYST')).not.toContain(who.luis);
      expect(await ids('?archived=false')).not.toContain(who.luis);
      const archived = await tx.user.count({
        where: { role: { not: 'SYSTEM' }, archivedAt: { not: null } },
      });
      expect(await ids('?archived=true')).toHaveLength(archived);
    });
  });

  it('a query no schema takes is refused: a page of none or of more than two hundred, a role nobody is listed by, a place that is no id, a field nobody named', async () => {
    await world(async (served) => {
      const dana = await served.signedIn(danasEmail, long);
      expect(peoplePageAtMost).toBe(200);
      for (const query of [
        '?limit=0',
        '?limit=201',
        '?limit=1000',
        '?limit=two',
        '?limit=-1',
        '?limit=2.5',
        '?role=SYSTEM',
        '?archived=yes',
        '?after=luis-ortega',
        '?search=Luis',
      ]) {
        expect(told(await page(served, dana, query)), query).toEqual([400, 'BAD_REQUEST']);
      }
      expect(told(await page(served, dana, '?limit=200'))).toEqual([200, undefined]);
      // After somebody nobody has: nothing is said about them, the page is what follows that id.
      expect(told(await page(served, dana, `?after=${nobody}`))).toEqual([200, undefined]);
    });
  });
});

describe('an admin changes a person', () => {
  it('AC-02-06 Dana changes Luis’s name and phone, and clears the phone: only what she states, each audited with her as the actor; stated again as it is, nothing is written; a monitor’s too', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const named = await change(served, dana, who.luis, {
        name: ' Luis A. Ortega ',
        phone: '555-0150',
      });
      expect(saved(changePersonEndpoint, named)).toMatchObject({
        id: who.luis,
        name: 'Luis A. Ortega',
        phone: '555-0150',
        role: 'MANAGER_ANALYST',
        email: 'Luis.Ortega@gates.example',
      });
      expect(await audited(tx, named.requestId)).toEqual([
        [who.dana, 'UPDATE', 'SECURITY', ['name', 'phone']],
      ]);
      const same = await change(served, dana, who.luis, { name: 'Luis A. Ortega' });
      expect(saved(changePersonEndpoint, same).name).toBe('Luis A. Ortega');
      expect(await tx.auditRecord.count({ where: { requestId: same.requestId } })).toBe(0);
      const cleared = await change(served, dana, who.luis, { phone: null });
      expect(saved(changePersonEndpoint, cleared).phone).toBeNull();
      expect(await audited(tx, cleared.requestId)).toEqual([
        [who.dana, 'UPDATE', 'SECURITY', ['phone']],
      ]);
      // Kim, a monitor: her Monitor ID is never this request's to change.
      const kim = saved(
        changePersonEndpoint,
        await change(served, dana, who.kim, { name: 'Kim T. Nguyen', phone: '555-0142' }),
      );
      expect(kim).toMatchObject({
        name: 'Kim T. Nguyen',
        phone: '555-0142',
        monitorId: who.kimsId,
      });
    });
  });

  it('a change half said or of what is nobody’s to change is refused by the schema, and one to nobody, to the system actor or to an archived person finds nobody', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      for (const payload of [
        {},
        { name: ' ' },
        { email: 'not an address' },
        { phone: '' },
        { employerId: 'harbor' },
        { employerNumber: '' },
        { role: 'ADMIN' },
        { monitorId: 'M004199' },
        { archived: true },
        { permissions: ['VOID'] },
        { viewerKind: 'OWNER' },
        { contractorId: 'coastline' },
      ]) {
        expect(
          told(await change(served, dana, who.luis, payload)),
          JSON.stringify(payload),
        ).toEqual([400, 'BAD_REQUEST']);
      }
      saved(archivePersonEndpoint, await archive(served, dana, who.luis));
      for (const userId of [nobody, systemActorId, who.luis]) {
        expect(told(await change(served, dana, userId, { name: 'Somebody Else' })), userId).toEqual(
          [404, 'NOT_FOUND'],
        );
      }
      expect((await tx.user.findUniqueOrThrow({ where: { id: who.luis } })).name).toBe(
        'Luis Ortega',
      );
      expect((await tx.user.findUniqueOrThrow({ where: { id: systemActorId } })).name).not.toBe(
        'Somebody Else',
      );
    });
  });

  it('AC-02-83 the address Luis signs in with is changed: he signs in with the new one and no longer the old, the old one is told and never the new; an address somebody in service signs in with is refused, whatever its capitals; a monitor’s address is no key', async () => {
    const outbox = new Outbox();
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const before = await tx.user.findUniqueOrThrow({ where: { id: who.luis } });
      for (const email of ['Dana.Reyes@Gates.Example', 'DEBRIS@baylinecounty.example']) {
        expect(told(await change(served, dana, who.luis, { email })), email).toEqual([
          409,
          'EMAIL_HELD',
        ]);
      }
      expect(await tx.user.findUniqueOrThrow({ where: { id: who.luis } })).toEqual(before);
      expect(outbox.sent).toEqual([]);
      // His own in other capitals is his own: kept as typed, and nobody is told.
      saved(changePersonEndpoint, await change(served, dana, who.luis, { email: luissEmail }));
      expect(outbox.sent).toEqual([]);
      const newEmail = 'l.ortega@gates.example';
      const moved = await change(served, dana, who.luis, { email: newEmail });
      expect(saved(changePersonEndpoint, moved).email).toBe(newEmail);
      expect(await audited(tx, moved.requestId)).toEqual([
        [who.dana, 'UPDATE', 'SECURITY', ['email']],
      ]);
      expect(outbox.sent.map(({ to, subject }) => [to, subject])).toEqual([
        [luissEmail, 'Your Open ADMS sign-in address was changed'],
      ]);
      expect(outbox.sent[0]?.text).toContain('Luis Ortega');
      expect(outbox.sent[0]?.text).not.toContain(newEmail);
      expect(told(await served.signIn(luissEmail, longer, served.codeOf(luissEmail)))).toEqual([
        401,
        'SIGN_IN_REFUSED',
      ]);
      expect(told(await served.signIn(newEmail, longer, served.codeOf(luissEmail)))).toEqual([
        200,
        undefined,
      ]);
      // Kim signs in with her Monitor ID: she may be given any address, and nobody is told.
      saved(changePersonEndpoint, await change(served, dana, who.kim, { email: danasEmail }));
      expect(outbox.sent).toHaveLength(1);
      // Never in the log: a name or an address.
      const log = served.lines.join('\n');
      for (const secret of ['Luis', luissEmail, newEmail]) expect(log).not.toContain(secret);
    }, outbox);
  });

  it('AC-02-75 a read-only viewer’s kind, contractor and sight of private citizens, then or later: a contractor user always names a contractor the firm has, nobody else names one, and none of it is anybody’s who is no viewer', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const coastline = await tx.contractor.create({
        data: { name: 'Coastline Haulers LLC', kind: 'HAULER' },
      });
      const rivera = await tx.contractor.create({
        data: { name: 'Rivera Trucking', kind: 'HAULER', archivedAt: new Date() },
      });
      const refused = async (payload: object) =>
        told(await change(served, dana, who.viewer, payload));
      expect(await refused({ viewerKind: 'CONTRACTOR' })).toEqual([422, 'UNKNOWN_CONTRACTOR']);
      expect(await refused({ contractorId: coastline.id })).toEqual([422, 'UNKNOWN_CONTRACTOR']);
      expect(await refused({ viewerKind: 'AUDITOR', contractorId: coastline.id })).toEqual([
        422,
        'UNKNOWN_CONTRACTOR',
      ]);
      for (const contractorId of [rivera.id, nobody]) {
        expect(await refused({ viewerKind: 'CONTRACTOR', contractorId })).toEqual([
          422,
          'UNKNOWN_CONTRACTOR',
        ]);
      }
      expect(await read(served, dana, who.viewer)).toMatchObject({
        viewerKind: 'CLIENT',
        contractorId: null,
        seesPrivateCitizens: true,
      });
      const made = await change(served, dana, who.viewer, {
        viewerKind: 'CONTRACTOR',
        contractorId: coastline.id,
        seesPrivateCitizens: false,
      });
      expect(saved(changePersonEndpoint, made)).toMatchObject({
        viewerKind: 'CONTRACTOR',
        contractorId: coastline.id,
        seesPrivateCitizens: false,
      });
      expect(await audited(tx, made.requestId)).toEqual([
        [
          who.dana,
          'UPDATE',
          'SECURITY',
          expect.arrayContaining(['viewer_kind', 'contractor_id', 'sees_private_citizens']),
        ],
      ]);
      // Made an auditor, they name no contractor any more; what wasn't stated stays.
      expect(
        saved(
          changePersonEndpoint,
          await change(served, dana, who.viewer, { viewerKind: 'AUDITOR' }),
        ),
      ).toMatchObject({ viewerKind: 'AUDITOR', contractorId: null, seesPrivateCitizens: false });
      for (const userId of [who.luis, who.dana, who.kim]) {
        for (const payload of [{ viewerKind: 'CLIENT' }, { seesPrivateCitizens: true }]) {
          expect(told(await change(served, dana, userId, payload)), userId).toEqual([
            422,
            'NOT_A_VIEWER',
          ]);
        }
      }
    });
  });
});

describe('an admin changes a role', () => {
  it('AC-02-12 Luis is made an admin: his very next request is an admin’s, with the session he had; made a manager/analyst again, it is refused, and what he was granted is his again', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const luis = await served.signedIn(luissEmail, longer);
      // A void takes "view review" beside it, and reading a person "view dispatch" (ADR-539).
      const held = ['VOID', 'QC', 'VIEW_REVIEW', 'VIEW_DISPATCH'];
      const grants = { ids: { userId: who.luis }, payload: { permissions: held } };
      saved(setPermissionsEndpoint, await ask(served, dana, setPermissionsEndpoint, grants));
      const create = (payload: object) => ask(served, luis, createPersonEndpoint, { payload });
      expect(told(await create(morgan))).toEqual([403, 'NOT_ALLOWED']);
      const made = await role(served, dana, who.luis, 'ADMIN');
      // What he was granted stays beside him: an admin needs none, and the answer says so.
      expect(saved(setPersonRoleEndpoint, made)).toMatchObject({
        id: who.luis,
        role: 'ADMIN',
        permissions: held,
      });
      expect(await audited(tx, made.requestId)).toEqual([
        [who.dana, 'UPDATE', 'SECURITY', ['role']],
      ]);
      expect(saved(createPersonEndpoint, await create(morgan)).role).toBe('MANAGER_ANALYST');
      // Stated again as it is: nothing is written.
      const same = await role(served, dana, who.luis, 'ADMIN');
      expect(saved(setPersonRoleEndpoint, same).role).toBe('ADMIN');
      expect(await tx.auditRecord.count({ where: { requestId: same.requestId } })).toBe(0);
      expect(
        saved(setPersonRoleEndpoint, await role(served, dana, who.luis, 'MANAGER_ANALYST')),
      ).toMatchObject({ role: 'MANAGER_ANALYST', permissions: held });
      expect(told(await create({ ...morgan, email: 'm.ellis@gates.example' }))).toEqual([
        403,
        'NOT_ALLOWED',
      ]);
      expect(
        told(await ask(served, luis, { ...readPersonEndpoint }, { ids: { userId: who.kim } })),
      ).toEqual([200, undefined]);
      expect(told(await served.ask('POST', '/test/granted-voids', luis))).toEqual([200, undefined]);
    });
  });

  it('a role is changed between admin and manager/analyst only: never a monitor’s or a read-only viewer’s, never to one of theirs, and nobody’s who isn’t in service', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      for (const userId of [who.kim, who.viewer]) {
        for (const to of ['ADMIN', 'MANAGER_ANALYST']) {
          expect(told(await role(served, dana, userId, to)), userId).toEqual([
            422,
            'NOT_BACK_OFFICE',
          ]);
        }
      }
      for (const to of ['MONITOR', 'READ_ONLY_VIEWER', 'SYSTEM', 'OWNER']) {
        expect(told(await role(served, dana, who.luis, to)), to).toEqual([400, 'BAD_REQUEST']);
      }
      saved(archivePersonEndpoint, await archive(served, dana, who.luis));
      for (const userId of [nobody, systemActorId, who.luis]) {
        expect(told(await role(served, dana, userId, 'ADMIN')), userId).toEqual([404, 'NOT_FOUND']);
      }
      const roles = await tx.user.findMany({
        where: { id: { in: [who.kim, who.viewer, who.luis] } },
        orderBy: { role: 'asc' },
        select: { role: true },
      });
      expect(roles.map((row) => row.role).sort()).toEqual([
        'MANAGER_ANALYST',
        'MONITOR',
        'READ_ONLY_VIEWER',
      ]);
    });
  });

  it('AC-02-13 the firm’s only admin is never made a manager/analyst, by herself or by the database; with a second admin she may be, and her very next admin’s call is refused', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      expect(told(await role(served, dana, who.dana, 'MANAGER_ANALYST'))).toEqual([
        409,
        'LAST_ADMIN',
      ]);
      expect((await read(served, dana, who.dana)).role).toBe('ADMIN');
      saved(setPersonRoleEndpoint, await role(served, dana, who.luis, 'ADMIN'));
      expect(
        saved(setPersonRoleEndpoint, await role(served, dana, who.dana, 'MANAGER_ANALYST')).role,
      ).toBe('MANAGER_ANALYST');
      expect(told(await role(served, dana, who.dana, 'ADMIN'))).toEqual([403, 'NOT_ALLOWED']);
      // Luis is the only admin now. Whatever the service says, the database refuses it too
      // (this ends the test's work; its own words are read in packages/db/test/people.test.ts),
      // and where its guard answers before the service's own asking, as when two admins each
      // take the other out at one moment, the service knows it for what it is.
      const refused: unknown = await tx.user
        .update({ where: { id: who.luis }, data: { role: 'MANAGER_ANALYST' } })
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(Error);
      expect((refused as Error).message).toContain('constraint');
      expect(refusedAsTheLastAdmin(refused)).toBe(true);
      expect(refusedAsTheLastAdmin(new Error("The firm's last admin"))).toBe(false);
    });
  });
});

describe('out of the archive', () => {
  it('AC-02-09 Luis, archived, comes back: in service with what he held and no session; he signs in again with his own password; a second time, or somebody in service, finds nobody', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const luis = await served.signedIn(luissEmail, longer);
      const grants = {
        ids: { userId: who.luis },
        payload: { permissions: ['VOID', 'VIEW_REVIEW'] },
      };
      saved(setPermissionsEndpoint, await ask(served, dana, setPermissionsEndpoint, grants));
      saved(archivePersonEndpoint, await archive(served, dana, who.luis));
      const back = await unarchive(served, dana, who.luis);
      expect(saved(unarchivePersonEndpoint, back)).toMatchObject({
        id: who.luis,
        archived: false,
        role: 'MANAGER_ANALYST',
        permissions: ['VOID', 'VIEW_REVIEW'],
      });
      expect(await audited(tx, back.requestId)).toEqual([
        [who.dana, 'UPDATE', 'SECURITY', ['archived_at']],
      ]);
      // The session he had ended when he was archived, and stays ended.
      expect(told(await served.current(luis.cookies))).toEqual([401, 'NOT_SIGNED_IN']);
      const again = await served.signedIn(luissEmail, longer);
      expect(told(await served.ask('POST', '/test/granted-voids', again))).toEqual([
        200,
        undefined,
      ]);
      for (const userId of [who.luis, who.dana, nobody, systemActorId]) {
        expect(told(await unarchive(served, dana, userId)), userId).toEqual([404, 'NOT_FOUND']);
      }
      // Kim, a monitor, the same way.
      saved(archivePersonEndpoint, await archive(served, dana, who.kim));
      expect(saved(unarchivePersonEndpoint, await unarchive(served, dana, who.kim))).toMatchObject({
        archived: false,
        monitorId: who.kimsId,
      });
    });
  });

  it('AC-02-83 Luis left and Lu Ortega was given his address: Luis comes back only once nobody in service signs in with it, by the service and by the database', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      saved(archivePersonEndpoint, await archive(served, dana, who.luis));
      const lu = saved(
        createPersonEndpoint,
        await ask(served, dana, createPersonEndpoint, {
          payload: { ...morgan, name: 'Lu Ortega', email: luissEmail },
        }),
      );
      expect(told(await unarchive(served, dana, who.luis))).toEqual([409, 'EMAIL_HELD']);
      expect((await read(served, dana, who.luis)).archived).toBe(true);
      saved(
        changePersonEndpoint,
        await change(served, dana, lu.id, { email: 'lu.ortega@gates.example' }),
      );
      expect(saved(unarchivePersonEndpoint, await unarchive(served, dana, who.luis)).archived).toBe(
        false,
      );
      // Whatever the service says, the database keeps one address a person in service (this
      // ends the test's work).
      await expect(
        tx.user.update({ where: { id: lu.id }, data: { email: luissEmail.toUpperCase() } }),
      ).rejects.toThrow('constraint');
    });
  });
});
