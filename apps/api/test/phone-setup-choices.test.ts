// What a phone being set up under the master passcode picks from, with a connection, against
// the database (ARCHITECTURE §7.1 steps 1, 2; §7.5; spec/acceptance/02-people-and-devices.md
// AC-02-38; spec/acceptance/07-pricing-and-ledger.md AC-07-91; spec/acceptance/10-api-and-
// sync.md AC-10-19, 22, 32; BACKLOG 2.5.4, C113, C124; ADR-106, 240, 462 (4)(f), 463; REQ-202b,
// 209). OWASP ASVS 5.0 8.2.1, 8.2.2, 14.2.1, 14.2.6, 16.3.1; API Security Top 10 (2023)
// API1…API5. The real process, in this test's own memory, on the installation's database as
// `adms_api`: it needs `pnpm local:up` after `pnpm installer`, and fails saying so. Each test's
// work is undone (support/database.ts).
import { randomUUID } from 'node:crypto';

import {
  createPayItemEndpoint,
  createProjectEndpoint,
  createSiteEndpoint,
  endpoints,
  monitorCreatedAnswerSchema,
  phoneSetupChoicesAnswerSchema,
  phoneSetupChoicesEndpoint,
  setupChoicesMonitorsAtMost,
} from '@open-adms/contracts';
import { masterPasscodeActorId, type Database } from '@open-adms/db';
import { MasterPasscodeTries } from '@open-adms/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MasterPasscodeCheck } from '../src/phone/master-passcode-check.ts';
import { SetupChoices } from '../src/phone/setup-choices.ts';
import { OfflineChecks } from '../src/phone/offline-checks.ts';
import { PasswordHasher } from '../src/sign-in/password-hasher.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { enrolledPhone, passcode, proven } from './support/phones.ts';
import { shippedPolicy } from './support/process.ts';
import {
  danasEmail,
  long,
  worldOn,
  type Answer,
  type People,
  type Served,
} from './support/served.ts';
import { ask, p1Priced, picked, saved, told } from './support/setup.ts';
import { NoServer, passwordKey, sealingKey } from './support/sign-in.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const wrongPasscode = 'heron-landing-marsh';
const refused = [401, 'MASTER_PASSCODE_REFUSED'];
const monday = '2026-10-12';
// 6:30 am on Monday in Bayline County, at the staging area.
const mondayMorning = new Date('2026-10-12T10:30:00Z');

const read = (served: Served, bearer: string | undefined, payload: object): Promise<Answer> =>
  served.ask('POST', phoneSetupChoicesEndpoint.path, {
    payload,
    ...(bearer === undefined ? {} : { bearer }),
  });

// A read that must be answered: what the phone is shown.
async function shown(served: Served, bearer: string, more: object = {}) {
  const answer = await read(served, bearer, {
    passcode,
    projectId: null,
    monitorsAfter: null,
    ...more,
  });
  expect(told(answer)).toEqual([200, undefined]);
  return {
    ...phoneSetupChoicesAnswerSchema.parse(answer.body),
    requestId: answer.requestId,
    text: JSON.stringify(answer.body),
  };
}

// P1 as Dana prices it, with two sites and three pay items; the county's parks beside it; a
// phone at the staging area, enrolled and proven; Tariq Patel and Lee Morgan, created on it.
async function theStagingArea(served: Served, tx: Tx) {
  served.clock.at = mondayMorning;
  const dana = await served.signedIn(danasEmail, long);
  const priced = await p1Priced(served, dana, tx);
  const site = async (name: string, latitude: string) =>
    saved(
      createSiteEndpoint,
      await ask(served, dana, createSiteEndpoint, {
        ids: priced.ids,
        payload: {
          name,
          siteTypeId: (await tx.siteType.findUniqueOrThrow({ where: { key: 'FINAL_DISPOSAL' } }))
            .id,
          takesLoads: true,
          haulOutsLeaveHere: false,
          chargesTippingFee: false,
          ineligibleSite: false,
          permitNumber: null,
          latitude,
          longitude: '-75.62000000',
          activationDate: monday,
        },
      }),
    ).record;
  const landfill = await site('Bayline County Landfill', '39.09000000');
  const cypress = await site('Cypress Creek Landfill', '39.24000000');
  const entered = async (asked: Promise<Answer>) =>
    saved(createPayItemEndpoint, await asked).record;
  const hangers = await entered(priced.each('HNG-RMV-EA', 'Hanger removal', 'Hangers', '68.00'));
  const leaners = await entered(priced.each('LNR-RMV-EA', 'Leaner removal', 'Leaners', '95.00'));
  const vegHaul = await entered(priced.veg15());
  const p1 = await tx.project.findUniqueOrThrow({ where: { id: priced.project.id } });
  const another = async (name: string) =>
    saved(
      createProjectEndpoint,
      await ask(served, dana, createProjectEndpoint, {
        payload: {
          name,
          clientId: p1.clientId,
          declarationEventId: p1.declarationEventId,
          programTypeId: p1.programTypeId,
          timeZone: 'America/Chicago',
          activeFrom: monday,
          activeTo: '2027-01-31',
          ticketNumberSource: 'GENERATED',
          workflows: ['UNIT_RATE'],
          kindOfWorkIds: (await picked(tx)).kindOfWorkIds,
        },
      }),
    ).record;
  const parks = await another('Bayline County Parks, Hurricane Delphine');
  const phone = await enrolledPhone(served, tx, 'P1-UR-1');
  const token = await proven(served, phone);
  const created = async (name: string, password: string) => {
    const made = await served.ask('POST', '/phones/current/monitors', {
      bearer: token,
      payload: { name, password, passcode },
    });
    expect(told(made), name).toEqual([200, undefined]);
    return monitorCreatedAnswerSchema.parse(made.body);
  };
  const tariq = await created('Tariq Patel', '5550177');
  const lee = await created('Lee Morgan', '5550142');
  const asShown = (monitor: typeof tariq) => ({
    monitorId: monitor.userId,
    monitorNumber: monitor.monitorNumber,
    name: monitor.name,
  });
  return {
    dana,
    priced,
    p1,
    another,
    parks,
    landfill,
    cypress,
    hangers,
    leaners,
    vegHaul,
    phone,
    token,
    tariq,
    lee,
    asShown,
  };
}

const events = async (tx: Tx, requestId: string) =>
  (
    await tx.securityEvent.findMany({
      where: { requestId },
      orderBy: { id: 'asc' },
      select: { kind: true, userId: true, deviceId: true, occurredAt: true },
    })
  ).map((event) => [event.kind, event.userId, event.deviceId, event.occurredAt.toISOString()]);

const audited = async (tx: Tx, requestId: string) =>
  (
    await tx.auditRecord.findMany({
      where: { requestId },
      orderBy: { id: 'asc' },
      select: { tableName: true, operation: true, actorId: true, source: true, deviceId: true },
    })
  ).map((record) => Object.values(record));

const tries = (tx: Tx, version: number) =>
  tx.masterPasscodeTries.findUnique({
    where: { version },
    select: { failedTries: true, lockedUntil: true },
  });

// Kim Nguyen, a monitor of every test's world, created before any phone's.
const kim = (who: People) => ({
  monitorId: who.kim,
  monitorNumber: who.kimsId,
  name: 'Kim Nguyen',
});

const uses = (tx: Tx, deviceId: string) =>
  tx.securityEvent.count({ where: { deviceId, kind: 'MASTER_PASSCODE_USE' } });

describe('who may read what a phone is set up from', () => {
  it('ADR-463 it takes a phone that has proved itself and the master passcode, in the body of a POST: no token, a back-office session, a GET or a request that isn’t whole reads nothing, and no passcode is tried', async () => {
    const { access, roles, permission, method } =
      endpoints.find(({ name }) => name === 'phoneSetupChoices') ?? {};
    expect([access, roles, permission, method]).toEqual([
      'PROVEN_PHONE',
      undefined,
      undefined,
      'POST',
    ]);
    await world(async (served, tx) => {
      const { dana, phone, token, p1 } = await theStagingArea(served, tx);
      const before = await uses(tx, phone.id);
      const asked = { passcode, projectId: p1.id, monitorsAfter: null };
      const notProven = [401, 'PHONE_NOT_PROVEN'];
      expect(told(await read(served, undefined, asked))).toEqual(notProven);
      expect(told(await read(served, 'not-a-token', asked))).toEqual(notProven);
      const asDana = await served.ask('POST', phoneSetupChoicesEndpoint.path, {
        payload: asked,
        cookies: dana.cookies,
        csrf: dana.csrf,
      });
      expect(told(asDana)).toEqual(notProven);
      // The passcode is never in a path or a query (ASVS 14.2.1): there is no such read.
      const got = await served.ask(
        'GET',
        `${phoneSetupChoicesEndpoint.path}?passcode=${passcode}`,
        { bearer: token },
      );
      expect(got.status).toBe(404);
      for (const body of [
        { projectId: p1.id, monitorsAfter: null },
        { passcode, monitorsAfter: null },
        { passcode, projectId: p1.id },
        { ...asked, passcode: '' },
        { ...asked, projectId: p1.name },
        { ...asked, monitorsAfter: 'M004127' },
        { ...asked, monitorsAtMost: 5000 },
      ]) {
        expect(told(await read(served, token, body)), JSON.stringify(body)).toEqual([
          400,
          'BAD_REQUEST',
        ]);
      }
      expect(await uses(tx, phone.id)).toBe(before);
      expect(await tries(tx, phone.masterPasscodeVersion)).toBeNull();
    });
  });

  it('a phone taken out of service reads nothing, whatever passcode it sends, and its try is never a wrong try', async () => {
    await world(async (served, tx) => {
      const { phone } = await theStagingArea(served, tx);
      await tx.device.update({
        where: { id: phone.id },
        data: {
          status: 'LOST',
          outOfServiceAt: new Date('2026-10-12T22:10:00.000Z'),
          outOfServiceMarkedAt: new Date('2026-10-12T22:10:00.000Z'),
        },
      });
      served.clock.at = new Date('2026-10-13T12:00:00.000Z');
      const token = await proven(served, phone);
      for (const given of [passcode, wrongPasscode]) {
        const answer = await read(served, token, {
          passcode: given,
          projectId: null,
          monitorsAfter: null,
        });
        expect([told(answer), (answer.body as { message?: string }).message]).toEqual([
          [409, 'PHONE_OUT_OF_SERVICE'],
          // The door's, before the service is asked (ADR-531).
          'Not done: this phone was taken out of service. It only sends what it holds and is turned in.',
        ]);
        expect(Object.keys(answer.body as object).sort()).toEqual(['code', 'message', 'requestId']);
        expect(await audited(tx, answer.requestId)).toEqual([]);
      }
      expect(await tries(tx, phone.masterPasscodeVersion)).toBeNull();
    });
  });
});

describe('what a phone being set up picks from', () => {
  it('AC-02-38 the supervisor types the master passcode on a phone with a connection and nobody signed in: the phone is shown the firm’s open projects and its monitors in service by name and Monitor ID, and nothing of a project until one is picked; the read is a use of the master passcode, written as its actor, naming the phone and nobody', async () => {
    await world(async (served, tx, who) => {
      const { another, p1, parks, phone, token, tariq, lee, asShown } = await theStagingArea(
        served,
        tx,
      );
      // A project closed since, a monitor archived since: neither is picked from.
      const closed = await another('Bayline County Waterways, Hurricane Delphine');
      await tx.project.update({ where: { id: closed.id }, data: { closedAt: mondayMorning } });
      const made = await served.ask('POST', '/phones/current/monitors', {
        bearer: token,
        payload: { name: 'Sam Grant', password: '5550131', passcode },
      });
      const sam = monitorCreatedAnswerSchema.parse(made.body);
      await tx.user.update({ where: { id: sam.userId }, data: { archivedAt: mondayMorning } });
      const answer = await shown(served, token);
      const { requestId, text, ...choices } = answer;
      expect(choices).toEqual({
        // By name.
        projects: [
          {
            id: parks.id,
            name: 'Bayline County Parks, Hurricane Delphine',
            timeZone: 'America/Chicago',
          },
          {
            id: p1.id,
            name: 'Bayline County ROW, Hurricane Delphine',
            timeZone: 'America/New_York',
          },
        ],
        project: null,
        // In the order they were created; never somebody of the back office.
        monitors: [kim(who), asShown(tariq), asShown(lee)],
        moreMonitorsAfter: null,
      });
      expect(await events(tx, requestId)).toEqual([
        ['MASTER_PASSCODE_USE', null, phone.id, mondayMorning.toISOString()],
      ]);
      expect(await audited(tx, requestId)).toEqual([
        ['security_event', 'INSERT', masterPasscodeActorId, 'DEVICE', phone.id],
      ]);
      // Never a password, a phone number, a role or an email address (ASVS 14.2.6).
      for (const never of ['5550177', '5550142', 'MONITOR"', 'ADMIN', danasEmail, 'Sam Grant']) {
        expect(text.includes(never), never).toBe(false);
      }
    });
  });

  it('AC-02-38, AC-07-91 once a project is picked, its live sites and its unit rate pay items in service, as a phone’s lists show them: never a load’s pay item, an archived one, a rate or a description', async () => {
    await world(async (served, tx) => {
      const { p1, landfill, cypress, hangers, leaners, vegHaul, token } = await theStagingArea(
        served,
        tx,
      );
      await tx.disposalSite.update({
        where: { id: cypress.id },
        data: { archivedAt: mondayMorning },
      });
      await tx.payItem.update({ where: { id: leaners.id }, data: { archivedAt: mondayMorning } });
      const { project, projects, text } = await shown(served, token, { projectId: p1.id });
      expect(projects.length).toBe(2);
      expect(project?.id).toBe(p1.id);
      const finalDisposal = await tx.siteType.findUniqueOrThrow({
        where: { key: 'FINAL_DISPOSAL' },
        select: { id: true, name: true },
      });
      expect(project?.sites).toEqual([
        {
          id: landfill.id,
          name: 'Bayline County Landfill',
          siteType: finalDisposal,
          takesLoads: true,
          haulOutsLeaveHere: false,
          // Its place, as a phone's lists show it (ADR-552 (3)(d)).
          latitude: '39.09000000',
          longitude: '-75.62000000',
          area: { kind: 'CIRCLE', meters: p1.siteCircleMeters },
        },
      ]);
      const named = async (name: string) => ({
        id: (await tx.payableType.findFirstOrThrow({ where: { name } })).id,
        name,
      });
      const kind = await tx.kindOfWork.findFirstOrThrow({ where: { name: 'Hangers' } });
      expect(project?.payItems).toEqual([
        {
          id: hangers.id,
          code: 'HNG-RMV-EA',
          bandFrom: null,
          bandTo: null,
          archived: false,
          payableType: await named('Hangers'),
          kindOfWork: { id: kind.id, name: 'Hangers', key: null, countShape: 'NUMBER' },
          countIsAlwaysOne: true,
          gpsRequired: false,
          measurementRequired: false,
          decimalsAllowed: false,
          photosRequired: true,
          monitorMayMarkIneligible: false,
          quantityFromCarriedTickets: false,
        },
      ]);
      for (const never of [
        '68.00',
        '95.00',
        '7.50',
        'Hanger removal',
        'LNR-RMV-EA',
        'VEG-HAUL-CY-15',
        vegHaul.id,
        'Cypress Creek',
        'Coastline',
      ]) {
        expect(text.includes(never), never).toBe(false);
      }
    });
  });

  it('ADR-463 a project that is closed, or an id that is no project’s, is answered no lists and no refusal: the phone is shown the open ones again and picks from them, and the use is written all the same', async () => {
    await world(async (served, tx) => {
      const { p1, parks, phone, token } = await theStagingArea(served, tx);
      const before = await uses(tx, phone.id);
      await tx.project.update({ where: { id: p1.id }, data: { closedAt: mondayMorning } });
      for (const projectId of [p1.id, randomUUID(), phone.id]) {
        const answer = await shown(served, token, { projectId });
        expect([answer.project, answer.projects.map(({ id }) => id)], projectId).toEqual([
          null,
          [parks.id],
        ]);
        expect(answer.text.includes('Bayline County Landfill')).toBe(false);
      }
      expect(await uses(tx, phone.id)).toBe(before + 3);
    });
  });

  it('ADR-463 the monitors are a bounded number a call, in the order they were created: an answer that holds its share says where to ask on from, and the next begins after it', async () => {
    expect(setupChoicesMonitorsAtMost).toBe(1000);
    await world(async (served, tx, who, within) => {
      const { phone, token, tariq, lee, asShown } = await theStagingArea(served, tx);
      // Past the last: none, and nothing more.
      const past = await shown(served, token, { monitorsAfter: lee.userId });
      expect([past.monitors, past.moreMonitorsAfter]).toEqual([[], null]);
      const after = await shown(served, token, { monitorsAfter: tariq.userId });
      expect([after.monitors, after.moreMonitorsAfter]).toEqual([[asShown(lee)], null]);
      // The same service, holding one monitor an answer.
      const choices = new SetupChoices(within, {
        passcode: new MasterPasscodeCheck(within, {
          rules: new MasterPasscodeTries(shippedPolicy),
          hasher: new PasswordHasher(passwordKey),
          offline: new OfflineChecks(sealingKey),
          mail: new NoServer(),
          clock: served.clock,
          requestNow: () => undefined,
          here: { refusedLately: () => false, refused: () => undefined },
        }),
        clock: served.clock,
        monitorsAtMost: 1,
      });
      const proved = { deviceId: phone.id, status: 'ACTIVE' as const };
      const first = await choices.read(proved, { passcode, projectId: null, monitorsAfter: null });
      expect(first.read && [first.monitors, first.moreMonitorsAfter]).toEqual([
        [kim(who)],
        who.kim,
      ]);
      const second = await choices.read(proved, {
        passcode,
        projectId: null,
        monitorsAfter: who.kim,
      });
      expect(second.read && [second.monitors, second.moreMonitorsAfter]).toEqual([
        [asShown(tariq)],
        tariq.userId,
      ]);
      const next = await choices.read(proved, {
        passcode,
        projectId: null,
        monitorsAfter: tariq.userId,
      });
      expect(next.read && [next.monitors, next.moreMonitorsAfter]).toEqual([[asShown(lee)], null]);
    });
  });
});

describe('the passcode it is read under', () => {
  it('AC-10-22 a wrong passcode reads nothing and is refused by one code; it is a security event naming the phone, counted on the one record of the version in force; a right one starts the count again', async () => {
    await world(async (served, tx) => {
      const { phone, token, p1 } = await theStagingArea(served, tx);
      const version = phone.masterPasscodeVersion;
      const wrong = await read(served, token, {
        passcode: wrongPasscode,
        projectId: p1.id,
        monitorsAfter: null,
      });
      expect(told(wrong)).toEqual(refused);
      expect(Object.keys(wrong.body as object).sort()).toEqual(['code', 'requestId']);
      const written = [masterPasscodeActorId, 'DEVICE', phone.id];
      expect(await audited(tx, wrong.requestId)).toEqual([
        ['master_passcode_tries', 'INSERT', ...written],
        ['security_event', 'INSERT', ...written],
      ]);
      expect(await events(tx, wrong.requestId)).toEqual([
        ['MASTER_PASSCODE_FAILED', null, phone.id, mondayMorning.toISOString()],
      ]);
      expect(await tries(tx, version)).toEqual({ failedTries: 1, lockedUntil: null });
      await shown(served, token);
      expect(await tries(tx, version)).toEqual({ failedTries: 0, lockedUntil: null });
      // And the address's own count: four more wrong ones are each a wrong try, none stopped.
      for (let tried = 0; tried < 4; tried += 1) {
        const again = await read(served, token, {
          passcode: wrongPasscode,
          projectId: null,
          monitorsAfter: null,
        });
        expect(told(again), String(tried)).toEqual(refused);
      }
    });
  });

  it('AC-10-22, AC-10-108 while the passcode waits after wrong tries the right one reads nothing either from an address that tried it wrong, and nothing is written; one address is stopped at its own fourth', async () => {
    await world(async (served, tx) => {
      const { phone, token } = await theStagingArea(served, tx);
      const asked = { projectId: null, monitorsAfter: null };
      for (let tried = 0; tried < 4; tried += 1) {
        expect(told(await read(served, token, { ...asked, passcode: wrongPasscode }))).toEqual(
          refused,
        );
      }
      // The address's fifth is stopped before the passcode is touched.
      const limited = await read(served, token, { ...asked, passcode });
      expect(told(limited)).toEqual([429, 'LIMITED']);
      expect(await tries(tx, phone.masterPasscodeVersion)).toMatchObject({ failedTries: 4 });
      served.from = '198.51.100.11';
      expect(told(await read(served, token, { ...asked, passcode: wrongPasscode }))).toEqual(
        refused,
      );
      // The fifth wrong try in a row: the passcode waits for every address that tried it wrong
      // (ADR-541), this one among them.
      const waiting = await read(served, token, { ...asked, passcode });
      expect(told(waiting)).toEqual(refused);
      expect(Object.keys(waiting.body as object).sort()).toEqual(['code', 'requestId']);
      expect(await audited(tx, waiting.requestId)).toEqual([]);
    });
  });
});

describe('the log', () => {
  it('AC-10-32 says that what a phone is set up from was read under the master passcode, on which phone, of which project and how many, by id and count: never the passcode, the token, a project’s or a site’s name, a monitor’s name or their number; and why a read was refused, by code', async () => {
    await world(async (served, tx) => {
      const { phone, token, p1, tariq } = await theStagingArea(served, tx);
      const from = served.lines.length;
      await read(served, token, { passcode: wrongPasscode, projectId: null, monitorsAfter: null });
      await shown(served, token, { projectId: p1.id });
      const lines = served.lines.slice(from);
      const said = lines
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter((line) => String(line['msg']).includes('a phone is set up from'))
        .map((line) => [
          line['msg'],
          line['why'],
          line['deviceId'],
          line['projectId'],
          line['projects'],
          line['monitors'],
        ]);
      expect(said).toEqual([
        [
          'A read of what a phone is set up from was refused.',
          'WRONG',
          phone.id,
          undefined,
          undefined,
          undefined,
        ],
        [
          'What a phone is set up from was read under the master passcode.',
          undefined,
          phone.id,
          p1.id,
          2,
          3,
        ],
      ]);
      const text = lines.join('\n');
      for (const never of [
        passcode,
        wrongPasscode,
        token,
        'Tariq',
        tariq.monitorNumber,
        'Bayline',
        'HNG-RMV-EA',
      ]) {
        expect(text.includes(never), never).toBe(false);
      }
    });
  });
});
