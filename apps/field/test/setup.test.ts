// Setting the phone up under the master passcode when its monitor has no assignment
// (src/phone/setup.ts, reports.ts and their part of monitor.ts and lists.ts; BACKLOG 3.3.1,
// REQ-311, 311a, C122, C125; ADR-240, 456, 457, 463, 531, 576): online, what it picks from is the
// server's, a page of monitors at a time, and the master user sends the report at once; with no
// connection, only on the project whose lists the phone holds, against its own check of the
// passcode; the report kept until the server saves it, and sent before anything else of the
// monitor's; each use of the passcode the phone checked kept and reported, never the passcode.
// Here against a server of the test's own; against the real API, in a real browser,
// e2e/setup.e2e.ts.
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import {
  challengePhoneEndpoint,
  enrolPhoneEndpoint,
  phoneListsEndpoint,
  phoneLoginListEndpoint,
  phoneSetupChoicesEndpoint,
  provePhoneEndpoint,
  reportPasscodeUseEndpoint,
  reportUnplannedAssignmentEndpoint,
  signInOnPhoneEndpoint,
  signOutOnPhoneEndpoint,
  takeOfflineSignInOnPhoneEndpoint,
  type Endpoint,
  type PhoneAssignmentAnswer,
  type PhoneListsRecord,
  type PhoneSetupChoicesAnswer,
} from '@open-adms/contracts';
import { OfflineSignInRules, Policy, SignInTries } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { PhoneIdentity } from '../src/phone/identity.ts';
import { PhoneLists } from '../src/phone/lists.ts';
import { LoginList } from '../src/phone/login-list.ts';
import { MonitorOnPhone } from '../src/phone/monitor.ts';
import { PhoneReports } from '../src/phone/reports.ts';
import { PhoneSetup, type SetupPicked } from '../src/phone/setup.ts';
import { SigningIn } from '../src/phone/signing-in.ts';
import { Server, type Asking, type Reply } from '../src/server.ts';
import { checkOf, noLists } from './checks.ts';
import { HeldKeyring, HeldStore } from './held.ts';

const deviceId = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d21';
const ana = { id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d22', number: 'M004127', name: 'Ana Brooks' };
const kim = { id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d23', number: 'M004128', name: 'Kim Nguyen' };
const jo = { id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d24', number: 'M004130', name: 'Jo Kim' };
const passwords = { [ana.id]: '5550101', [kim.id]: '5550102' };
const passcode = 'heron-marsh-delphine';

const policy = Policy.from(
  parseEnv(readFileSync(new URL('../../../packages/domain/policy.env', import.meta.url), 'utf8')),
);

const p1 = {
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d25',
  name: 'Bayline County ROW, Hurricane Delphine',
  timeZone: 'America/New_York',
};
const p2 = {
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d26',
  name: 'Bayline County Parks, Hurricane Delphine',
  timeZone: 'America/New_York',
};
const area = { kind: 'CIRCLE', meters: 150 } as const;
const marshRoad = {
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d27',
  name: 'Marsh Road TDSR',
  siteType: { id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d28', name: 'TDSR/DMS' },
  takesLoads: true,
  haulOutsLeaveHere: true,
  latitude: '39.20000000',
  longitude: '-75.50000000',
  area,
};
const landfill = {
  ...marshRoad,
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d29',
  name: 'Bayline County Landfill',
  haulOutsLeaveHere: false,
};
const payItem = (id: string, name: string, archived = false) => ({
  id,
  code: `${name.toUpperCase()}-RMV-EA`,
  bandFrom: null,
  bandTo: null,
  archived,
  payableType: { id: `${id.slice(0, -2)}aa`, name },
  kindOfWork: { id: `${id.slice(0, -2)}bb`, name },
  countIsAlwaysOne: true,
  gpsRequired: false,
  measurementRequired: false,
  decimalsAllowed: false,
  photosRequired: true,
  monitorMayMarkIneligible: false,
  quantityFromCarriedTickets: false,
});
const hangers = payItem('0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d31', 'Hangers');
const leaners = payItem('0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d32', 'Leaners');
const retired = payItem('0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d33', 'Stumps', true);

// Ana's Monday at the Landfill's tower, as her sign-in answers it: the lists the phone holds.
const towerDay: PhoneAssignmentAnswer = {
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d34',
  workDate: '2026-10-19',
  project: p1,
  fieldEventKinds: ['DISPOSAL'],
  certifying: false,
  formDocumentTypes: [],
  site: { id: landfill.id, name: landfill.name },
};
const towerLists: PhoneListsRecord = {
  ...noLists,
  sites: [marshRoad, landfill],
  payItems: [hangers, leaners, retired],
  quantityLookup: [
    {
      form: 'LOAD',
      debrisTypeId: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d35',
      primeId: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d36',
      asks: 'LOAD_CALL',
    },
  ],
};

interface Sent {
  readonly endpoint: string;
  readonly json?: unknown;
  readonly token?: string | undefined;
  readonly session?: string | undefined;
}

// The API as these tests need it: a phone enrolled and proven, by its key or with the master
// passcode beside it; Ana signed in online with her tower day; the login list of Ana and Kim;
// what a setup picks from, two monitors a page; and the reports, each saved once.
class TestServer extends Server {
  readonly sent: Sent[] = [];
  signal = true;
  readonly firsts = new Map<string, Buffer>();
  passcodeCheck = checkOf(passcode);
  // The reports the server holds, by id, and what a report is answered where it is said.
  readonly saved = new Set<string>();
  notSaved: string | null = null;
  // What the lists answer: Ana's tower day, or once an unplanned assignment is saved, that one.
  taken: PhoneAssignmentAnswer = towerDay;
  monitors = [ana, kim, jo];

  constructor() {
    super('https://api.adms.localhost');
  }

  override ask<E extends Endpoint>(served: E, asking: Asking = {}): Promise<Reply<E>> {
    this.sent.push({
      endpoint: served.name,
      json: asking.json,
      token: asking.token,
      session: asking.session,
    });
    if (!this.signal) return Promise.resolve({ kind: 'unreachable' });
    return Promise.resolve(this.answer(served, asking) as Reply<E>);
  }

  private answer(served: Endpoint, asking: Asking): Reply<Endpoint> {
    const json = (asking.json ?? {}) as Record<string, unknown>;
    if (served === enrolPhoneEndpoint) {
      return { kind: 'answered', answer: { deviceId, masterPasscodeVersion: 1 } };
    }
    if (served === challengePhoneEndpoint) {
      return { kind: 'answered', answer: { challenge: 'challenge', expiresInSeconds: 120 } };
    }
    if (served === provePhoneEndpoint) {
      if (json['passcode'] !== undefined && json['passcode'] !== passcode) {
        return { kind: 'refused', code: 'PHONE_NOT_PROVEN' };
      }
      const token = json['passcode'] === undefined ? 'phone-token' : 'master-user-token';
      return { kind: 'answered', answer: { token, expiresInSeconds: 900 } };
    }
    if (served === phoneSetupChoicesEndpoint) return this.choices(json);
    if (served === signInOnPhoneEndpoint) {
      if (json['monitorNumber'] !== ana.number || json['password'] !== passwords[ana.id]) {
        return { kind: 'refused', code: 'SIGN_IN_REFUSED' };
      }
      return {
        kind: 'answered',
        answer: {
          token: 'ana-online',
          userId: ana.id,
          monitorNumber: ana.number,
          name: ana.name,
          expiresInSeconds: 86_400,
          assignment: towerDay,
          noAssignment: null,
        },
      };
    }
    if (served === takeOfflineSignInOnPhoneEndpoint) {
      const signed = new OfflineSignInRules().signed({
        deviceId,
        id: String(json['id']),
        kind: 'OWN_PASSWORD',
        personId: String(json['personId']),
        signedInAt: new Date(String(json['signedInAt'])),
        masterPasscodeVersion: null,
      });
      const first = this.firsts.get(String(json['personId']));
      const proof =
        first === undefined ? '' : createHmac('sha256', first).update(signed).digest('base64url');
      if (json['proof'] !== proof) return { kind: 'refused', code: 'SIGN_IN_REFUSED' };
      return {
        kind: 'answered',
        answer: {
          token: 'kim-taken',
          userId: kim.id,
          monitorNumber: kim.number,
          name: kim.name,
          expiresInSeconds: 3600,
          masterPasscodeSession: null,
        },
      };
    }
    // What a phone sends goes with somebody signed in on it (ADR-531).
    const inUse = asking.session !== undefined || asking.token === 'master-user-token';
    if (served === reportUnplannedAssignmentEndpoint || served === reportPasscodeUseEndpoint) {
      if (!inUse) return { kind: 'refused', code: 'NOT_SIGNED_IN' };
      const id = String(json['id']);
      const reason = this.notSaved;
      const answer = reason !== null ? 'NOT_SAVED' : this.saved.has(id) ? 'ALREADY_SAVED' : 'SAVED';
      if (reason === null) this.saved.add(id);
      return {
        kind: 'answered',
        answer:
          served === reportPasscodeUseEndpoint
            ? { useId: id, answer, reason: reason as null }
            : { assignmentId: id, answer, reason: reason as null },
      };
    }
    if (asking.session === undefined) return { kind: 'refused', code: 'NOT_SIGNED_IN' };
    if (served === phoneListsEndpoint) {
      return {
        kind: 'answered',
        answer: { assignment: this.taken, noAssignment: null, lists: towerLists },
      };
    }
    if (served === phoneLoginListEndpoint) {
      const held = json as { masterPasscodeVersion: number | null };
      const monitors = [ana, kim].map((person) => {
        const fresh = checkOf(passwords[person.id] ?? '');
        this.firsts.set(person.id, fresh.first);
        return {
          monitorId: person.id,
          monitorNumber: person.number,
          name: person.name,
          mark: `${person.number}-1`,
          check: fresh.check,
        };
      });
      return {
        kind: 'answered',
        answer: {
          masterPasscode: {
            version: 1,
            check: held.masterPasscodeVersion === 1 ? null : this.passcodeCheck.check,
          },
          noAssignment: null,
          loginList: { projectId: p1.id, monitors, more: false },
        },
      };
    }
    if (served === signOutOnPhoneEndpoint) {
      return { kind: 'answered', answer: { status: 'signed-out' } };
    }
    throw new Error(`The test's server doesn't serve ${served.name}.`);
  }

  // Two monitors a page, in the order the server holds them; a picked project's sites and pay
  // items, P2 being closed.
  private choices(json: Record<string, unknown>): Reply<Endpoint> {
    if (json['passcode'] !== passcode) return { kind: 'refused', code: 'MASTER_PASSCODE_REFUSED' };
    const after = json['monitorsAfter'];
    const from = after === null ? 0 : this.monitors.findIndex(({ id }) => id === after) + 1;
    const page = this.monitors.slice(from, from + 2);
    const answer: PhoneSetupChoicesAnswer = {
      projects: [p1, p2],
      project:
        json['projectId'] === p1.id
          ? { id: p1.id, sites: [marshRoad, landfill], payItems: [hangers, leaners] }
          : null,
      monitors: page.map(({ id, number, name }) => ({
        monitorId: id,
        monitorNumber: number,
        name,
      })),
      moreMonitorsAfter: from + 2 < this.monitors.length ? (page.at(-1)?.id ?? null) : null,
    };
    return { kind: 'answered', answer };
  }
}

async function phone(clock = { now: new Date('2026-10-19T11:00:00Z') }) {
  const now = () => clock.now;
  const store = new HeldStore();
  const keyring = new HeldKeyring();
  const server = new TestServer();
  const identity = new PhoneIdentity(store, keyring, server, now);
  await identity.enrol('P1-TWR-LF', passcode);
  const reports = new PhoneReports(store, now);
  const monitor = new MonitorOnPhone(identity, keyring, reports, now);
  const lists = new PhoneLists(store, monitor, now);
  const loginList = new LoginList(store, SignInTries.onPhone(policy), now);
  const signingIn = new SigningIn(monitor, lists, loginList, reports, policy);
  const setup = new PhoneSetup(identity, monitor, lists, loginList, reports, now);
  server.sent.length = 0;
  return { clock, store, keyring, server, reports, monitor, lists, loginList, signingIn, setup };
}

// Ana's tower day read on the phone, with the login list and the passcode's check, then signed
// out: the phone holds P1's lists.
async function heldP1(clock?: { now: Date }) {
  const held = await phone(clock);
  expect(await held.signingIn.signIn(ana.number, passwords[ana.id] ?? '')).toMatchObject({
    kind: 'signedIn',
  });
  await held.lists.read();
  await held.loginList.read(held.monitor);
  await held.monitor.signOut();
  held.server.sent.length = 0;
  return held;
}

const named = (sent: readonly Sent[]) => sent.map(({ endpoint }) => endpoint);
// What was asked, but the phone's own proofs.
const done = (sent: readonly Sent[]) =>
  named(sent).filter((name) => name !== 'challengePhone' && name !== 'provePhone');

// Everything the phone keeps, in its store and its keyring, as text.
const keptText = (store: HeldStore, keyring: HeldKeyring) =>
  JSON.stringify([...store.shelves.values(), ...keyring.secrets.values()]);

const kimsTowerDay = (project = p1): SetupPicked => ({
  project,
  work: { fieldEventKinds: ['DISPOSAL'], certifying: false, formDocumentTypes: ['DROP_OFF_LOG'] },
  site: marshRoad,
  payItemIds: [],
  monitor: { monitorId: kim.id, monitorNumber: kim.number, name: kim.name },
});

describe('setting the phone up online', () => {
  it('AC-11-24, AC-02-38: the passcode typed, the server answers the open projects and the monitors a page at a time; the project picked, its live sites and unit rate pay items in service; each read carries the passcode in its body and nothing else does', async () => {
    const { server, setup } = await phone();
    const opened = await setup.opened(passcode);
    if (opened.kind !== 'online') throw new Error(opened.kind);
    expect(opened.projects).toEqual([p1, p2]);
    expect(opened.monitors.map(({ name }) => name)).toEqual([ana.name, kim.name]);
    expect(opened.moreMonitorsAfter).toBe(kim.id);
    const more = await setup.moreMonitors(passcode, kim.id);
    expect(more).toEqual({
      kind: 'monitors',
      monitors: [{ monitorId: jo.id, monitorNumber: jo.number, name: jo.name }],
      moreMonitorsAfter: null,
    });
    expect(await setup.project(passcode, p1.id)).toEqual({
      kind: 'project',
      choices: { sites: [marshRoad, landfill], payItems: [hangers, leaners] },
    });
    // P2 closed since: none, and the supervisor picks again.
    expect(await setup.project(passcode, p2.id)).toEqual({ kind: 'closed' });
    const asked = server.sent.filter(({ endpoint }) => endpoint === 'phoneSetupChoices');
    expect(asked.map(({ json }) => json)).toEqual([
      { passcode, projectId: null, monitorsAfter: null },
      { passcode, projectId: null, monitorsAfter: kim.id },
      { passcode, projectId: p1.id, monitorsAfter: null },
      { passcode, projectId: p2.id, monitorsAfter: null },
    ]);
    expect(asked.every(({ token }) => token === 'phone-token')).toBe(true);
  });

  it('AC-11-23: a passcode the server doesn’t take is its refusal, its own to count; the phone keeps nothing of it and logs no use of its own', async () => {
    const { store, keyring, setup, reports } = await phone();
    expect(await setup.opened('not-the-passcode')).toEqual({
      kind: 'refused',
      code: 'MASTER_PASSCODE_REFUSED',
    });
    expect(await reports.held()).toEqual({ unplannedAssignments: [], passcodeUses: [] });
    expect(keptText(store, keyring)).not.toContain('not-the-passcode');
  });

  it('AC-02-38, AC-11-25, REQ-311a: Jo, just created, set up on P1 for unit rate work: the unplanned assignment made with the phone’s own id, day and clock, kept, and sent at once by the master user, the passcode beside the phone’s proof and never in the report; saved, the phone holds it no longer', async () => {
    const clock = { now: new Date('2026-10-20T02:30:00Z') };
    const { server, store, keyring, setup, reports } = await phone(clock);
    const made = await setup.made(
      {
        project: p1,
        work: { fieldEventKinds: ['UNIT_RATE'], certifying: false, formDocumentTypes: [] },
        site: null,
        payItemIds: [hangers.id],
        monitor: { monitorId: jo.id, monitorNumber: jo.number, name: jo.name },
      },
      passcode,
    );
    // 22:30 on Monday in Bayline County: Monday's assignment, by the phone's clock.
    expect(made.assignment).toMatchObject({
      workDate: '2026-10-19',
      project: p1,
      fieldEventKinds: ['UNIT_RATE'],
      site: null,
    });
    // The phone holds no lists: it takes nothing here; Jo signs in with signal and takes it.
    expect(made.takenHere).toBe(false);
    expect(made.report).toBe('saved');
    expect(named(server.sent)).toEqual([
      'challengePhone',
      'provePhone',
      'reportUnplannedAssignment',
    ]);
    const [, proof, report] = server.sent;
    expect(proof?.json).toMatchObject({ passcode });
    expect(report?.token).toBe('master-user-token');
    expect(report?.session).toBeUndefined();
    expect(report?.json).toEqual({
      id: made.assignment.id,
      projectId: p1.id,
      personId: jo.id,
      fieldEventKinds: ['UNIT_RATE'],
      certifying: false,
      formDocumentTypes: [],
      siteId: null,
      payItemIds: [hangers.id],
      occasion: 'SETUP',
      madeAt: clock.now.toISOString(),
      deviceUtcOffsetMinutes: 0 - clock.now.getTimezoneOffset(),
    });
    expect(JSON.stringify(report?.json)).not.toContain(passcode);
    expect(await reports.held()).toEqual({ unplannedAssignments: [], passcodeUses: [] });
    // The master user's token is the act's alone: never kept.
    expect(keptText(store, keyring)).not.toContain('master-user-token');
    expect(keptText(store, keyring)).not.toContain(passcode);
  });

  it('AC-11-25: with no signal at the end, the report is kept on the phone, and goes before anything else asked once somebody signs in with signal', async () => {
    const { server, setup, reports, signingIn, lists } = await phone();
    server.signal = false;
    const made = await setup.made(kimsTowerDay(), passcode);
    expect(made.report).toBe('held');
    expect((await reports.held()).unplannedAssignments.map(({ id }) => id)).toEqual([
      made.assignment.id,
    ]);
    server.signal = true;
    server.sent.length = 0;
    expect(await signingIn.signIn(ana.number, passwords[ana.id] ?? '')).toMatchObject({
      kind: 'signedIn',
    });
    await lists.read();
    expect(done(server.sent)).toEqual(['signInOnPhone', 'reportUnplannedAssignment', 'phoneLists']);
    expect(
      server.sent.find(({ endpoint }) => endpoint === 'reportUnplannedAssignment')?.session,
    ).toBe('ana-online');
    expect(await reports.standing(made.assignment.id)).toBe('saved');
  });
});

describe('setting the phone up with no connection', () => {
  it('AC-11-24: only on the project whose lists the phone holds: none held, it says so; held, the passcode is checked against the phone’s own check, a wrong try kept as a use naming nobody', async () => {
    const empty = await phone();
    empty.server.signal = false;
    expect(await empty.setup.opened(passcode)).toEqual({ kind: 'noLists' });

    const { server, setup, reports, store, keyring } = await heldP1();
    server.signal = false;
    expect(await setup.opened('not-the-passcode')).toEqual({ kind: 'wrong' });
    const opened = await setup.opened(passcode);
    if (opened.kind !== 'offline') throw new Error(opened.kind);
    expect(opened.project).toEqual(p1);
    // Its sites and the unit rate pay items in service it holds; the monitors of its login list.
    expect(opened.choices).toEqual({ sites: [marshRoad, landfill], payItems: [hangers, leaners] });
    expect(opened.monitors.map(({ name }) => name)).toEqual([ana.name, kim.name]);
    expect((await reports.held()).passcodeUses).toEqual([
      expect.objectContaining({ use: 'WRONG_TRY', personId: null }),
    ]);
    expect(keptText(store, keyring)).not.toContain('not-the-passcode');
    expect(keptText(store, keyring)).not.toContain(passcode);
  });

  it('AC-02-38, AC-11-25, ADR-575: Kim set up on the tower at Marsh Road with no signal: the phone takes it now, Kim its monitor, who signs in from the login list on it; at signal her sign-in goes first, then the unplanned assignment, then the wrong try, then her lists, which take it', async () => {
    const { server, setup, reports, lists, signingIn, monitor } = await heldP1();
    server.signal = false;
    await setup.opened('not-the-passcode');
    const made = await setup.made(kimsTowerDay(), null);
    expect(made.takenHere).toBe(true);
    expect(made.report).toBe('held');
    const held = await lists.held();
    expect(held?.assignment).toEqual(made.assignment);
    expect(held?.monitorId).toBe(kim.id);
    // The unit rate pay items it names (none), and no quantity lookup from the Landfill's tower.
    expect(held?.lists.payItems).toEqual([]);
    expect(held?.lists.quantityLookup).toEqual([]);
    expect(held?.lists.sites).toEqual(towerLists.sites);

    const signedIn = await signingIn.signIn(kim.number, passwords[kim.id] ?? '');
    if (signedIn.kind !== 'signedIn') throw new Error(signedIn.kind);
    expect(signedIn.signedIn.assignment).toEqual(made.assignment);
    expect(signedIn.signedIn.offline).toBe(true);

    server.signal = true;
    server.taken = made.assignment;
    server.sent.length = 0;
    expect(await lists.read()).toMatchObject({ kind: 'taken' });
    expect(done(server.sent)).toEqual([
      'takeOfflineSignInOnPhone',
      'reportUnplannedAssignment',
      'reportPasscodeUse',
      'phoneLists',
    ]);
    expect(
      server.sent
        .filter(({ endpoint }) => endpoint.startsWith('report'))
        .map(({ session }) => session),
    ).toEqual(['kim-taken', 'kim-taken']);
    expect(await reports.held()).toEqual({ unplannedAssignments: [], passcodeUses: [] });
    expect((await monitor.signedIn())?.assignment?.id).toBe(made.assignment.id);
  });

  it('AC-11-25: a report answered not saved is kept, marked with the server’s reason, and not sent again before every request; one with no signal stops what was asked', async () => {
    const { server, setup, reports, lists, signingIn } = await heldP1();
    server.signal = false;
    const made = await setup.made(kimsTowerDay(), null);
    server.signal = true;
    const use = await reports.keepUse('WRONG_TRY', null);
    server.notSaved = 'NOT_THE_PROJECTS_SITE';
    await signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    server.sent.length = 0;
    await lists.read();
    expect(await reports.standing(made.assignment.id)).toBe('notSaved');
    expect(await reports.standing(use.id)).toBe('notSaved');
    expect(await reports.held()).toMatchObject({
      unplannedAssignments: [{ id: made.assignment.id }],
      passcodeUses: [{ id: use.id }],
    });
    server.sent.length = 0;
    await lists.read();
    expect(named(server.sent)).toEqual(['phoneLists']);

    // Another assignment and another use kept, and no signal for the first of them: nothing more
    // is asked, the use not even tried.
    server.notSaved = null;
    server.signal = false;
    await setup.made(kimsTowerDay(), null);
    await reports.keepUse('WRONG_TRY', null);
    server.sent.length = 0;
    expect(await lists.read()).toEqual({ kind: 'unreachable' });
    expect(named(server.sent)).toEqual(['reportUnplannedAssignment']);
  });

  it('AC-11-15, AC-02-38: set up with no signal for the monitor signed in, on the project whose lists the phone holds, their session takes the assignment at once, before any signal', async () => {
    const { server, setup, signingIn, monitor } = await heldP1();
    await signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    server.signal = false;
    const made = await setup.made(
      {
        ...kimsTowerDay(),
        monitor: { monitorId: ana.id, monitorNumber: ana.number, name: ana.name },
      },
      null,
    );
    expect(made.takenHere).toBe(true);
    expect((await monitor.signedIn())?.assignment).toEqual(made.assignment);
  });

  it('AC-02-38: set up for another project than the lists it holds, the phone takes nothing here; the monitor signed in keeps their own', async () => {
    const { server, setup, lists, signingIn, monitor } = await heldP1();
    await signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    const made = await setup.made(
      {
        ...kimsTowerDay(p2),
        monitor: { monitorId: ana.id, monitorNumber: ana.number, name: ana.name },
      },
      passcode,
    );
    expect(made.takenHere).toBe(false);
    expect(made.report).toBe('saved');
    expect((await lists.held())?.assignment).toEqual(towerDay);
    expect((await monitor.signedIn())?.assignment).toEqual(towerDay);
    expect(server.saved.has(made.assignment.id)).toBe(true);
  });
});
