// Permissions on every request, and the firm's people, against the database (ARCHITECTURE §6,
// Authorization, §7.0; acceptance file 02, AC-02-08, 12, 13, 72, 83; file 09, AC-09-18; file 10,
// AC-10-25's admin half and AC-10-27 for these endpoints; T-14; ADR-315, 364, 406, 415). OWASP
// ASVS 5.0 V8, 7.4.5; API Security Top 10, API1, API3, API5. The real process, in this test's own
// memory, on the installation's database as `adms_api`: it needs `pnpm local:up` after
// `pnpm installer`, and fails saying so. Each test's work is undone (support/database.ts).
import {
  adminOnly,
  archivePersonEndpoint,
  backOfficeRoles,
  clearTwoStepEndpoint,
  createPersonEndpoint,
  endPersonSessionsEndpoint,
  endpoints,
  errorAnswerSchema,
  personAnswerSchema,
  readPersonEndpoint,
  sessionAnswerSchema,
  sessionsEndedAnswerSchema,
  setPermissionsEndpoint,
  setPersonPasswordEndpoint,
  setViewerProjectsEndpoint,
  type PersonAnswer,
} from '@open-adms/contracts';
import { systemActorId, type Database } from '@open-adms/db';
import { NewProjectSettings } from '@open-adms/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { People } from '../src/people/people.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { shippedPolicy } from './support/process.ts';
import {
  danasEmail,
  long,
  longer,
  luissEmail,
  ran,
  worldOn,
  wrong,
  type Answer,
  type Served,
  type Signed,
} from './support/served.ts';
import { Outbox, signInOn } from './support/sign-in.ts';

const viewersEmail = 'debris@baylinecounty.example';
const viewersPassword = 'delphine marsh ferry heron';
const morgansEmail = 'morgan.ellis@gates.example';
const given = 'ferry heron marsh delphine';
// What the golden mission grants Luis: not *unlock*.
// (In the order the database keeps the permissions in.)
const luissGrants = ['CORRECT', 'RENUMBER', 'VOID', 'ACCEPT_FLAG', 'QC', 'LOCK_INVOICED'];

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

type Browser = Pick<Signed, 'cookies' | 'csrf'>;

const told = (answer: Answer): [number, string | undefined] => [answer.status, answer.code];
const person = (answer: Answer): PersonAnswer => {
  expect(told(answer)).toEqual([200, undefined]);
  return personAnswerSchema.parse(answer.body);
};
const post = (served: Served, signed: Browser, url: string, payload?: object) =>
  served.ask('POST', url, { ...signed, ...(payload === undefined ? {} : { payload }) });
const grants = (served: Served, signed: Browser, userId: string, permissions: readonly string[]) =>
  served.ask('PUT', `/people/${userId}/permissions`, { ...signed, payload: { permissions } });
const projects = (served: Served, signed: Browser, userId: string, projectIds: readonly string[]) =>
  served.ask('PUT', `/people/${userId}/viewer-projects`, { ...signed, payload: { projectIds } });
const read = (served: Served, signed: Browser, userId: string) =>
  served.ask('GET', `/people/${userId}`, { cookies: signed.cookies });
const morgan = { name: 'Morgan Ellis', role: 'MANAGER_ANALYST', email: morgansEmail };
const users = (tx: Tx) => tx.user.count();

// The read-only viewer is given a password, so that they can sign in.
async function viewerSignsIn(served: Served, tx: Tx, viewer: string, within: Database) {
  await tx.userCredential.create({
    data: {
      userId: viewer,
      passwordHash: await signInOn(within, new Outbox()).hasher.hash(viewersPassword),
    },
  });
  return served.signedIn(viewersEmail, viewersPassword);
}

// P1, as far as a viewer's project needs it (spec/CONVENTIONS.md §6).
async function p1(tx: Tx): Promise<string> {
  const client = await tx.client.create({ data: { name: 'Bayline County' } });
  const fema = await tx.declarationReferenceType.findFirstOrThrow({
    where: { name: 'FEMA disaster (DR)' },
  });
  const declarationEvent = await tx.declarationEvent.create({
    data: { name: 'Hurricane Delphine', reference: 'DR-9001-FL', referenceTypeId: fema.id },
  });
  const row = await tx.programType.findFirstOrThrow({ where: { name: 'ROW' } });
  const project = await tx.project.create({
    data: {
      name: 'Bayline County ROW, Hurricane Delphine',
      clientId: client.id,
      declarationEventId: declarationEvent.id,
      programTypeId: row.id,
      timeZone: 'America/New_York',
      activeFrom: new Date('2026-10-12'),
      activeTo: new Date('2027-01-31'),
      ticketNumberSource: 'GENERATED',
      workflows: ['LOAD', 'HAUL_OUT', 'UNIT_RATE'],
      ...new NewProjectSettings(shippedPolicy).for(row),
    },
  });
  return project.id;
}

describe('permissions, read from the database on every request', () => {
  it('AC-02-12, AC-09-18 Luis, not granted *unlock*, is refused an unlock; when Dana takes *void* from him his very next void is refused, with the session he had', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const luis = await served.signedIn(luissEmail, longer);
      ran.length = 0;
      // With no grant he may do neither.
      expect(told(await post(served, luis, '/test/granted-voids'))).toEqual([403, 'NOT_ALLOWED']);
      expect(person(await grants(served, dana, who.luis, luissGrants)).permissions).toEqual(
        luissGrants,
      );
      // Granted *void* and *lock as invoiced*, and not *unlock*: unlocking is a grant of its own.
      expect(told(await post(served, luis, '/test/granted-voids'))).toEqual([200, undefined]);
      expect(told(await post(served, luis, '/test/unlocks'))).toEqual([403, 'NOT_ALLOWED']);
      expect(ran).toEqual(['void']);
      // Dana takes *void* away. He doesn't sign in again; his next void is refused.
      const without = luissGrants.filter((held) => held !== 'VOID');
      expect(person(await grants(served, dana, who.luis, without)).permissions).not.toContain(
        'VOID',
      );
      expect(told(await post(served, luis, '/test/granted-voids'))).toEqual([403, 'NOT_ALLOWED']);
      expect(ran).toEqual(['void']);
      // What he still holds, he still does; and given back, the next one works.
      expect(told(await served.current(luis.cookies))).toEqual([200, undefined]);
      await grants(served, dana, who.luis, luissGrants);
      expect(told(await post(served, luis, '/test/granted-voids'))).toEqual([200, undefined]);
      // An admin needs none granted.
      expect(told(await post(served, dana, '/test/unlocks'))).toEqual([200, undefined]);
      expect(ran).toEqual(['void', 'void', 'unlock']);
      // One row a permission, taken away by its archive and given back by clearing it.
      expect(await tx.userPermission.count({ where: { userId: who.luis } })).toBe(6);
    });
  });

  it('AC-02-12 a role is read on every request too: made an admin, Luis’s next call is an admin’s; made a manager/analyst again, it is refused', async () => {
    await world(async (served, tx, who) => {
      const luis = await served.signedIn(luissEmail, longer);
      expect(told(await post(served, luis, '/people', morgan))).toEqual([403, 'NOT_ALLOWED']);
      await tx.user.update({ where: { id: who.luis }, data: { role: 'ADMIN' } });
      expect(person(await post(served, luis, '/people', morgan)).role).toBe('MANAGER_ANALYST');
      await tx.user.update({ where: { id: who.luis }, data: { role: 'MANAGER_ANALYST' } });
      expect(
        told(await post(served, luis, '/people', { ...morgan, email: 'm.ellis@gates.example' })),
      ).toEqual([403, 'NOT_ALLOWED']);
    });
  });

  it('a grant row on somebody who is no manager/analyst grants nothing: a read-only viewer with *void* written beside them voids nothing', async () => {
    await world(async (served, tx, who, within) => {
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      await tx.userPermission.create({ data: { userId: who.viewer, permission: 'VOID' } });
      ran.length = 0;
      expect(told(await post(served, viewer, '/test/granted-voids'))).toEqual([403, 'NOT_ALLOWED']);
      expect(ran).toEqual([]);
    });
  });

  it('AC-10-27 every signed-in endpoint names its roles; these are an admin’s alone, and one is the back office’s', () => {
    const signedIn = endpoints.filter(({ access }) => access === 'SIGNED_IN');
    expect(signedIn.every(({ roles }) => roles !== undefined && roles.length > 0)).toBe(true);
    expect(
      endpoints.filter(({ access }) => access !== 'SIGNED_IN').map(({ roles }) => roles),
    ).toEqual(endpoints.filter(({ access }) => access !== 'SIGNED_IN').map(() => undefined));
    const open = (to: readonly string[]) =>
      signedIn.filter(({ roles }) => roles?.join() === to.join()).map(({ name }) => name);
    expect(open(adminOnly)).toEqual([
      'clearTwoStep',
      'createPerson',
      // Changing a person, their role, and out of the archive: ADR-427.
      'changePerson',
      'setPermissions',
      'setViewerProjects',
      'setPersonPassword',
      'endPersonSessions',
      'archivePerson',
      'setPersonRole',
      'unarchivePerson',
      // The firm's master passcode: ADR-428.
      'changeMasterPasscode',
    ]);
    expect(
      signedIn
        .filter(({ roles, permission }) => roles?.join() === backOfficeRoles.join() && !permission)
        .map(({ name }) => name),
      // Reading a person or a page of them (ADR-427), and the setup as it stands (the setup
      // check and the lookups, ADR-426).
    ).toEqual([
      'listPeople',
      'readPerson',
      'setupCheck',
      'quantityLookup',
      'siteQuantityLookup',
      // The firm's phones (ADR-428).
      'listPhones',
    ]);
    // The permissions an endpoint takes yet are Setup (task 2.4.2; the list by name is
    // setup-endpoints.test.ts's) and Dispatch (task 2.4.3; phones.test.ts's): the reviewer's
    // are task 2.4.4's.
    expect([...new Set(endpoints.flatMap(({ permission }) => permission ?? []))]).toEqual([
      'SETUP',
      'DISPATCH',
    ]);
  });

  it('AC-10-27 each endpoint of the firm’s people is refused to nobody, to a manager/analyst and to a read-only viewer before anything sent is read; a person is read by the back office only', async () => {
    await world(async (served, tx, who, within) => {
      const luis = await served.signedIn(luissEmail, longer);
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      const before = await users(tx);
      for (const { method, path, name } of [
        createPersonEndpoint,
        setPermissionsEndpoint,
        setViewerProjectsEndpoint,
        setPersonPasswordEndpoint,
        endPersonSessionsEndpoint,
        archivePersonEndpoint,
        clearTwoStepEndpoint,
      ]) {
        const url = path.replace(':userId', who.dana);
        // A body no schema takes: who may call is asked first.
        const payload = { nobody: 'named this field' };
        expect(told(await served.ask(method, url, { payload })), name).toEqual([
          401,
          'NOT_SIGNED_IN',
        ]);
        for (const signed of [luis, viewer]) {
          expect(told(await served.ask(method, url, { ...signed, payload })), name).toEqual([
            403,
            'NOT_ALLOWED',
          ]);
        }
      }
      const url = readPersonEndpoint.path.replace(':userId', who.kim);
      expect(told(await served.ask('GET', url))).toEqual([401, 'NOT_SIGNED_IN']);
      expect(told(await read(served, viewer, who.kim))).toEqual([403, 'NOT_ALLOWED']);
      expect(told(await read(served, luis, who.kim))).toEqual([200, undefined]);
      expect(await users(tx)).toBe(before);
      expect((await tx.user.findUniqueOrThrow({ where: { id: who.dana } })).archivedAt).toBeNull();
    });
  });

  it('a service behind the door asks again inside its own piece of work: called as Luis, or as an archived admin, it changes nothing', async () => {
    await world(async (_served, tx, who, within) => {
      const people = new People(within, {
        clock: { now: () => new Date('2026-10-12T14:00:00Z') },
        sessions: signInOn(within, new Outbox()).sessions,
        mail: new Outbox(),
      });
      const other = await tx.user.create({ data: { name: 'Morgan Ellis', role: 'ADMIN' } });
      await tx.user.update({ where: { id: other.id }, data: { archivedAt: new Date() } });
      for (const caller of [who.luis, who.viewer, who.kim, other.id]) {
        const refused = { done: false, code: 'NOT_ALLOWED' };
        expect(await people.create(caller, { ...morgan, role: 'MANAGER_ANALYST' })).toEqual(
          refused,
        );
        expect(await people.setPermissions(caller, who.luis, ['VOID'])).toEqual(refused);
        expect(await people.setViewerProjects(caller, who.viewer, [])).toEqual(refused);
        expect(await people.archive(caller, who.kim)).toEqual(refused);
        expect(await people.endSessions(caller, who.luis)).toEqual(refused);
        expect(await people.change(caller, who.kim, { name: 'Kim N.' })).toEqual(refused);
        expect(await people.setRole(caller, who.luis, 'ADMIN')).toEqual(refused);
        expect(await people.unarchive(caller, other.id)).toEqual(refused);
      }
      expect((await tx.user.findUniqueOrThrow({ where: { id: who.kim } })).name).toBe('Kim Nguyen');
      expect((await tx.user.findUniqueOrThrow({ where: { id: who.luis } })).role).toBe(
        'MANAGER_ANALYST',
      );
      for (const caller of [who.viewer, who.kim, other.id]) {
        expect(await people.list(caller, { archived: false, limit: 50 })).toEqual({
          done: false,
          code: 'NOT_ALLOWED',
        });
      }
      expect(await tx.userPermission.count()).toBe(0);
      expect((await people.read(who.kim, who.luis)).done).toBe(false);
    });
  });
});

describe('an admin creates the firm’s people', () => {
  it('AC-02-08 Dana creates a manager/analyst, an admin, a client user, an auditor and a contractor user with its contractor; each is audited with her as the actor, and none has a Monitor ID', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const coastline = await tx.contractor.create({
        data: { name: 'Coastline Haulers LLC', kind: 'HAULER' },
      });
      const made = [];
      for (const body of [
        { ...morgan, phone: '555-0131' },
        { name: 'Priya Shah', role: 'ADMIN', email: 'priya.shah@gates.example' },
        {
          name: 'Bayline County finance',
          role: 'READ_ONLY_VIEWER',
          viewerKind: 'CLIENT',
          email: 'finance@baylinecounty.example',
        },
        {
          name: 'State auditor',
          role: 'READ_ONLY_VIEWER',
          viewerKind: 'AUDITOR',
          seesPrivateCitizens: false,
          email: 'auditor@state.example',
        },
        {
          name: 'Coastline Haulers office',
          role: 'READ_ONLY_VIEWER',
          viewerKind: 'CONTRACTOR',
          contractorId: coastline.id,
          email: 'office@coastline.example',
        },
      ]) {
        made.push(person(await post(served, dana, '/people', body)));
      }
      expect(
        made.map(({ role, viewerKind, contractorId, seesPrivateCitizens, phone }) => [
          role,
          viewerKind,
          contractorId,
          seesPrivateCitizens,
          phone,
        ]),
      ).toEqual([
        ['MANAGER_ANALYST', null, null, null, '555-0131'],
        ['ADMIN', null, null, null, null],
        // A new viewer sees private citizens by name unless Dana says otherwise (ADR-336).
        ['READ_ONLY_VIEWER', 'CLIENT', null, true, null],
        ['READ_ONLY_VIEWER', 'AUDITOR', null, false, null],
        ['READ_ONLY_VIEWER', 'CONTRACTOR', coastline.id, true, null],
      ]);
      for (const one of made) {
        expect(one).toMatchObject({ monitorId: null, archived: false, permissions: [] });
        expect(one.projectIds).toEqual([]);
      }
      const audited = await tx.auditRecord.findMany({
        where: { tableName: 'user', recordId: { in: made.map(({ id }) => id) } },
      });
      expect(audited.map(({ actorId, operation, domain }) => [actorId, operation, domain])).toEqual(
        made.map(() => [who.dana, 'INSERT', 'SECURITY']),
      );
      // Nobody created here can sign in yet: they have no password.
      expect(
        await tx.userCredential.count({ where: { userId: { in: made.map((m) => m.id) } } }),
      ).toBe(0);
      expect(told(await served.signIn(morgansEmail, given))).toEqual([401, 'SIGN_IN_REFUSED']);
    });
  });

  it('AC-02-08 a monitor is never created there, nor the system actor, nor a person half said: the body takes none of them and nothing is written', async () => {
    await world(async (served, tx) => {
      const dana = await served.signedIn(danasEmail, long);
      const before = await users(tx);
      const contractorId = (
        await tx.contractor.create({ data: { name: 'Coastline Haulers LLC', kind: 'HAULER' } })
      ).id;
      const viewer = { name: 'A viewer', role: 'READ_ONLY_VIEWER', email: 'viewer@state.example' };
      for (const body of [
        { name: 'Lee Morgan', role: 'MONITOR', email: 'lee.morgan@gates.example' },
        { name: 'Open ADMS (system)', role: 'SYSTEM', email: 'system@gates.example' },
        { ...morgan, monitorId: 'M004199' },
        { ...morgan, name: ' ' },
        { ...morgan, email: 'not an address' },
        { name: morgan.name, role: morgan.role },
        // A viewer says its kind; only a contractor user names a contractor, and always does.
        viewer,
        { ...viewer, viewerKind: 'CONTRACTOR' },
        { ...viewer, viewerKind: 'CLIENT', contractorId },
        { ...morgan, viewerKind: 'CLIENT' },
        { ...morgan, seesPrivateCitizens: true },
      ]) {
        expect(told(await post(served, dana, '/people', body)), JSON.stringify(body)).toEqual([
          400,
          'BAD_REQUEST',
        ]);
      }
      expect(
        told(
          await post(served, dana, '/people', {
            ...viewer,
            viewerKind: 'CONTRACTOR',
            contractorId: '0199a3c0-0000-7000-8000-000000000042',
          }),
        ),
      ).toEqual([422, 'UNKNOWN_CONTRACTOR']);
      expect(await users(tx)).toBe(before);
    });
  });

  it('AC-02-83 a second person who signs in is refused an email address somebody has, whatever its capitals; a monitor’s address and an archived person’s are free', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const before = await users(tx);
      for (const email of ['Dana.Reyes@Gates.Example', luissEmail, viewersEmail.toUpperCase()]) {
        expect(told(await post(served, dana, '/people', { ...morgan, email })), email).toEqual([
          409,
          'EMAIL_HELD',
        ]);
      }
      expect(await users(tx)).toBe(before);
      // Kim, a monitor, signs in with her Monitor ID: her address is no key.
      person(
        await post(served, dana, '/people', { ...morgan, email: 'kim.nguyen@harbor.example' }),
      );
      // Luis leaves; whoever takes his place may be given his address.
      person(await post(served, dana, `/people/${who.luis}/archivings`));
      person(
        await post(served, dana, '/people', { ...morgan, name: 'Lu Ortega', email: luissEmail }),
      );
    });
  });

  it('AC-10-25, AC-02-08 Dana sets a new person’s password; they sign in with it, set their own before anything else, then their authenticator', async () => {
    await world(async (served, _tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const made = person(await post(served, dana, '/people', morgan));
      expect(
        told(await post(served, dana, `/people/${made.id}/passwords`, { password: given })),
      ).toEqual([200, undefined]);
      const signed = await served.signedIn(morgansEmail, given);
      expect(sessionAnswerSchema.parse(signed.answer.body)).toMatchObject({
        user: { id: made.id, role: 'MANAGER_ANALYST' },
        passwordChangeRequired: true,
        twoStepSetUp: false,
      });
      expect(told(await read(served, signed, who.kim))).toEqual([403, 'PASSWORD_CHANGE_REQUIRED']);
      expect(
        told(await post(served, signed, '/password-changes', { current: given, password: wrong })),
      ).toEqual([200, undefined]);
      expect(told(await read(served, signed, who.kim))).toEqual([403, 'TWO_STEP_SETUP_REQUIRED']);
    });
  });

  it('AC-10-25 Luis forgot his password and the firm has no mail: Dana sets him a new one; he is signed out, the old one is dead, and he sets his own at his next sign-in', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const luis = await served.signedIn(luissEmail, longer);
      const set = await post(served, dana, `/people/${who.luis}/passwords`, { password: given });
      expect(told(set)).toEqual([200, undefined]);
      expect(told(await served.current(luis.cookies))).toEqual([401, 'NOT_SIGNED_IN']);
      expect(told(await served.signIn(luissEmail, longer, served.codeOf(luissEmail)))).toEqual([
        401,
        'SIGN_IN_REFUSED',
      ]);
      const again = await served.signedIn(luissEmail, given);
      expect(sessionAnswerSchema.parse(again.answer.body).passwordChangeRequired).toBe(true);
      // Written as Dana, in her request; the hash is never in the audit log.
      const audited = await tx.auditRecord.findMany({
        where: { actorId: who.dana, requestId: set.requestId, tableName: 'user_credential' },
      });
      expect(audited.map(({ operation, domain }) => [operation, domain])).toEqual([
        ['UPDATE', 'SECURITY'],
      ]);
      expect(JSON.stringify(audited.map(({ newValue }) => newValue))).toContain(
        '[kept out of the audit]',
      );
    });
  });

  it('AC-10-25 a password the rules refuse is told to Dana in plain words, and nothing changes; nobody but an admin sets another’s, and a person nobody has is not found', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const luis = await served.signedIn(luissEmail, longer);
      const before = await tx.userCredential.findUniqueOrThrow({ where: { userId: who.luis } });
      const short = await post(served, dana, `/people/${who.luis}/passwords`, {
        password: 'heron',
      });
      expect(told(short)).toEqual([422, 'PASSWORD_TOO_SHORT']);
      expect(errorAnswerSchema.parse(short.body).message).toBe(
        'A password needs at least 15 characters.',
      );
      expect(await tx.userCredential.findUniqueOrThrow({ where: { userId: who.luis } })).toEqual(
        before,
      );
      expect(told(await served.current(luis.cookies))).toEqual([200, undefined]);
      expect(
        told(await post(served, luis, `/people/${who.dana}/passwords`, { password: given })),
      ).toEqual([403, 'NOT_ALLOWED']);
      for (const nobody of ['0199a3c0-0000-7000-8000-000000000042', systemActorId]) {
        expect(
          told(await post(served, dana, `/people/${nobody}/passwords`, { password: given })),
        ).toEqual([404, 'NOT_FOUND']);
      }
      // Never in the log: a password, a name or an address.
      const log = served.lines.join('\n');
      for (const secret of [given, 'heron"', 'Luis', luissEmail]) expect(log).not.toContain(secret);
    });
  });
});

describe('an admin gives and takes', () => {
  it('AC-02-08, AC-02-13 a manager/analyst’s permissions: each given is its own grant audited with Dana as the actor; one taken away is archived, never deleted; and Luis can’t give even the ones he holds', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const luis = await served.signedIn(luissEmail, longer);
      const other = person(await post(served, dana, '/people', morgan));
      const given6 = await grants(served, dana, who.luis, luissGrants);
      expect(person(given6).permissions).toEqual(luissGrants);
      const audited = await tx.auditRecord.findMany({
        where: { requestId: given6.requestId, tableName: 'user_permission' },
      });
      expect(audited.map(({ actorId, operation, domain }) => [actorId, operation, domain])).toEqual(
        luissGrants.map(() => [who.dana, 'INSERT', 'SECURITY']),
      );
      // Nobody gives what they don't hold: only an admin gives, and an admin holds every one.
      for (const permissions of [['VOID'], ['UNLOCK_INVOICED'], []]) {
        expect(told(await grants(served, luis, other.id, permissions))).toEqual([
          403,
          'NOT_ALLOWED',
        ]);
        expect(
          told(await grants(served, luis, who.luis, [...luissGrants, 'UNLOCK_INVOICED'])),
        ).toEqual([403, 'NOT_ALLOWED']);
      }
      expect(await tx.userPermission.count({ where: { userId: other.id } })).toBe(0);
      // Two taken away: the rows stay, archived.
      const fewer = person(await grants(served, dana, who.luis, ['CORRECT', 'QC', 'QC']));
      expect(fewer.permissions).toEqual(['CORRECT', 'QC']);
      const rows = await tx.userPermission.findMany({ where: { userId: who.luis } });
      expect(rows).toHaveLength(6);
      expect(rows.filter(({ archivedAt }) => archivedAt !== null)).toHaveLength(4);
      // Stated again as they are: nothing is written.
      const same = await grants(served, dana, who.luis, ['QC', 'CORRECT']);
      expect(person(same).permissions).toEqual(['CORRECT', 'QC']);
      expect(await tx.auditRecord.count({ where: { requestId: same.requestId } })).toBe(0);
      // A permission nobody defined is refused by the schema.
      expect(told(await grants(served, dana, who.luis, ['EVERYTHING']))).toEqual([
        400,
        'BAD_REQUEST',
      ]);
    });
  });

  it('a permission is given to a manager/analyst only: not to an admin, a monitor, a read-only viewer, the system actor or an archived person; what somebody held can always be taken away', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      for (const userId of [who.dana, who.kim, who.viewer]) {
        expect(told(await grants(served, dana, userId, ['VOID'])), userId).toEqual([
          422,
          'NOT_A_MANAGER_ANALYST',
        ]);
      }
      expect(told(await grants(served, dana, systemActorId, ['VOID']))).toEqual([404, 'NOT_FOUND']);
      expect(await tx.userPermission.count()).toBe(0);
      // Luis is made an admin, holding what he held: it can still be cleared.
      await grants(served, dana, who.luis, ['VOID', 'QC']);
      await tx.user.update({ where: { id: who.luis }, data: { role: 'ADMIN' } });
      expect(person(await grants(served, dana, who.luis, [])).permissions).toEqual([]);
      await post(served, dana, `/people/${who.luis}/archivings`);
      expect(told(await grants(served, dana, who.luis, ['VOID']))).toEqual([404, 'NOT_FOUND']);
    });
  });

  it('AC-02-08 a read-only viewer’s projects: given, taken away by archiving, given back; never to somebody who is no viewer, and never a project the firm doesn’t hold', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const project = await p1(tx);
      const gave = await projects(served, dana, who.viewer, [project]);
      expect(person(gave).projectIds).toEqual([project]);
      const audited = await tx.auditRecord.findMany({
        where: { requestId: gave.requestId, tableName: 'user_viewer_project' },
      });
      expect(audited.map(({ actorId, operation, domain }) => [actorId, operation, domain])).toEqual(
        [[who.dana, 'INSERT', 'SECURITY']],
      );
      expect(person(await projects(served, dana, who.viewer, [])).projectIds).toEqual([]);
      const row = await tx.viewerProject.findFirstOrThrow({ where: { userId: who.viewer } });
      expect(row.archivedAt).not.toBeNull();
      expect(person(await projects(served, dana, who.viewer, [project])).projectIds).toEqual([
        project,
      ]);
      expect(await tx.viewerProject.count({ where: { userId: who.viewer } })).toBe(1);
      expect(
        told(
          await projects(served, dana, who.viewer, [
            project,
            '0199a3c0-0000-7000-8000-000000000042',
          ]),
        ),
      ).toEqual([422, 'UNKNOWN_PROJECT']);
      for (const userId of [who.luis, who.dana, who.kim]) {
        expect(told(await projects(served, dana, userId, [project])), userId).toEqual([
          422,
          'NOT_A_VIEWER',
        ]);
      }
      expect(await tx.viewerProject.count()).toBe(1);
    });
  });
});

describe('reading a person', () => {
  it('AC-02-72 Luis, a manager/analyst, looks at Ana Brooks and doesn’t see her phone number; Dana, an admin, does', async () => {
    await world(async (served, tx, who) => {
      const ana = await tx.user.create({
        data: { name: 'Ana Brooks', role: 'MONITOR', monitorNumber: 'M004127', phone: '555-0142' },
      });
      const dana = await served.signedIn(danasEmail, long);
      const luis = await served.signedIn(luissEmail, longer);
      const seenByLuis = await read(served, luis, ana.id);
      expect(person(seenByLuis)).toMatchObject({
        name: 'Ana Brooks',
        role: 'MONITOR',
        monitorId: 'M004127',
      });
      expect(Object.keys(person(seenByLuis))).not.toContain('phone');
      expect(seenByLuis.text).not.toContain('555-0142');
      expect(person(await read(served, dana, ana.id)).phone).toBe('555-0142');
      // Anybody who is no monitor, Luis reads whole; and nothing of sign-in is in any answer.
      await tx.user.update({ where: { id: who.viewer }, data: { phone: '555-0177' } });
      const viewer = await read(served, luis, who.viewer);
      expect(person(viewer).phone).toBe('555-0177');
      expect(Object.keys(person(await read(served, dana, who.dana))).sort()).toEqual([
        'archived',
        'contractorId',
        'email',
        'id',
        'monitorId',
        'name',
        'permissions',
        'phone',
        'projectIds',
        'role',
        'seesPrivateCitizens',
        'viewerKind',
      ]);
      // The system actor is nobody's to read; nor is somebody nobody has.
      for (const nobody of [systemActorId, '0199a3c0-0000-7000-8000-000000000042']) {
        expect(told(await read(served, dana, nobody))).toEqual([404, 'NOT_FOUND']);
      }
      expect(told(await served.ask('GET', '/people/ana-brooks', dana))).toEqual([
        400,
        'BAD_REQUEST',
      ]);
    });
  });
});

describe('archiving a person, and ending their sessions', () => {
  it('AC-02-09 Dana archives Luis, who left: he is signed out and refused at once, his record stays, and a second archiving finds nobody', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const luis = await served.signedIn(luissEmail, longer);
      await grants(served, dana, who.luis, ['VOID']);
      const archived = await post(served, dana, `/people/${who.luis}/archivings`);
      expect(person(archived)).toMatchObject({ id: who.luis, archived: true });
      expect(told(await served.current(luis.cookies))).toEqual([401, 'NOT_SIGNED_IN']);
      expect(told(await served.refresh(luis))).toEqual([401, 'NOT_SIGNED_IN']);
      expect(told(await served.signIn(luissEmail, longer, served.codeOf(luissEmail)))).toEqual([
        401,
        'SIGN_IN_REFUSED',
      ]);
      expect(await tx.session.count({ where: { userId: who.luis, revokedAt: null } })).toBe(0);
      const audited = await tx.auditRecord.findMany({
        where: { requestId: archived.requestId, tableName: 'user' },
      });
      expect(audited.map(({ actorId, changedFields }) => [actorId, changedFields])).toEqual([
        [who.dana, ['archived_at']],
      ]);
      expect(told(await post(served, dana, `/people/${who.luis}/archivings`))).toEqual([
        404,
        'NOT_FOUND',
      ]);
      // Dana still reads him, as archived, with what he held.
      expect(person(await read(served, dana, who.luis))).toMatchObject({
        archived: true,
        permissions: ['VOID'],
      });
    });
  });

  it('AC-02-13 the firm’s only admin can’t be archived, by herself or by the database; with a second admin, one may go', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      expect(told(await post(served, dana, `/people/${who.dana}/archivings`))).toEqual([
        409,
        'LAST_ADMIN',
      ]);
      expect(told(await served.current(dana.cookies))).toEqual([200, undefined]);
      const priya = person(
        await post(served, dana, '/people', {
          name: 'Priya Shah',
          role: 'ADMIN',
          email: 'priya.shah@gates.example',
        }),
      );
      expect(person(await post(served, dana, `/people/${priya.id}/archivings`)).archived).toBe(
        true,
      );
      expect(told(await post(served, dana, `/people/${who.dana}/archivings`))).toEqual([
        409,
        'LAST_ADMIN',
      ]);
      // The system actor is never anybody's to archive.
      expect(told(await post(served, dana, `/people/${systemActorId}/archivings`))).toEqual([
        404,
        'NOT_FOUND',
      ]);
      // Whatever the service says, the database refuses it too (this ends the test's work). Its
      // own words are read in packages/db/test/people.test.ts: the client says only that a
      // constraint refused.
      await expect(
        tx.user.update({ where: { id: who.dana }, data: { archivedAt: new Date() } }),
      ).rejects.toThrow('constraint');
    });
  });

  it('with two admins in service, either may archive the other or themselves, and is then signed out', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      await tx.user.create({ data: { name: 'Priya Shah', role: 'ADMIN' } });
      expect(person(await post(served, dana, `/people/${who.dana}/archivings`)).archived).toBe(
        true,
      );
      expect(told(await served.current(dana.cookies))).toEqual([401, 'NOT_SIGNED_IN']);
    });
  });

  it('an admin ends anybody’s sessions: both of Luis’s, at once; he signs in again when he likes; her own too', async () => {
    await world(async (served, tx, who) => {
      const dana = await served.signedIn(danasEmail, long);
      const first = await served.signedIn(luissEmail, longer);
      const second = await served.signedIn(luissEmail, longer);
      const ended = await post(served, dana, `/people/${who.luis}/session-endings`);
      expect(told(ended)).toEqual([200, undefined]);
      expect(sessionsEndedAnswerSchema.parse(ended.body)).toEqual({ status: 'ended', sessions: 2 });
      for (const signed of [first, second]) {
        expect(told(await served.current(signed.cookies))).toEqual([401, 'NOT_SIGNED_IN']);
        expect(told(await served.refresh(signed))).toEqual([401, 'NOT_SIGNED_IN']);
      }
      const audited = await tx.auditRecord.findMany({
        where: { requestId: ended.requestId, tableName: 'session' },
      });
      expect(audited.map(({ actorId, domain }) => [actorId, domain])).toEqual([
        [who.dana, 'SECURITY'],
        [who.dana, 'SECURITY'],
      ]);
      await served.signedIn(luissEmail, longer);
      // Nobody's sessions: none to end; somebody nobody has: not found.
      const none = await post(served, dana, `/people/${who.kim}/session-endings`);
      expect(sessionsEndedAnswerSchema.parse(none.body).sessions).toBe(0);
      expect(
        told(
          await post(served, dana, '/people/0199a3c0-0000-7000-8000-000000000042/session-endings'),
        ),
      ).toEqual([404, 'NOT_FOUND']);
      // Her own, the one she is calling on included.
      expect(told(await post(served, dana, `/people/${who.dana}/session-endings`))).toEqual([
        200,
        undefined,
      ]);
      expect(told(await served.current(dana.cookies))).toEqual([401, 'NOT_SIGNED_IN']);
    });
  });
});
