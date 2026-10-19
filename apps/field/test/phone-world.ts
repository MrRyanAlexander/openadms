// The phone and the server its tests of the master passcode share (src/phone/setup.ts,
// passcode.ts, passcode-sessions.ts and their part of signing-in.ts, monitor.ts and lists.ts;
// BACKLOG 3.3.1, 3.3.2; ADR-576, 577): a phone enrolled against a server of the test's own, its
// cast (Ana on the Landfill's tower on P1, Kim, Jo), the lists Ana's sign-in brings, and what the
// server answers each call the phone makes under the passcode. Against the real API, in a real
// browser: e2e/setup.e2e.ts, e2e/switching.e2e.ts.
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import {
  challengePhoneEndpoint,
  enrolPhoneEndpoint,
  openPasscodeSessionOnPhoneEndpoint,
  phoneListsEndpoint,
  phoneLoginListEndpoint,
  phoneSetupChoicesEndpoint,
  provePhoneEndpoint,
  reportPasscodeUseEndpoint,
  reportUnplannedAssignmentEndpoint,
  signInOnPhoneEndpoint,
  signOutOnPhoneEndpoint,
  syncedRecordId,
  syncPhoneEndpoint,
  takeOfflineSignInOnPhoneEndpoint,
  type Endpoint,
  type ErrorCode,
  type RecordAnswer,
  type SeriesHeld,
  type SyncedRecord,
  type SyncSent,
  type OfflineSignInReport,
  type PhoneAssignmentAnswer,
  type PhoneListsRecord,
  type PhoneSetupChoicesAnswer,
} from '@open-adms/contracts';
import { OfflineSignInRules, Policy, SignInTries } from '@open-adms/domain';
import { expect } from 'vitest';

import { PhoneIdentity } from '../src/phone/identity.ts';
import { PhoneLists } from '../src/phone/lists.ts';
import { LoginList } from '../src/phone/login-list.ts';
import { MonitorOnPhone } from '../src/phone/monitor.ts';
import { PhoneOutbox } from '../src/phone/outbox.ts';
import { PasscodeSessions } from '../src/phone/passcode-sessions.ts';
import { PasscodeOnPhone } from '../src/phone/passcode.ts';
import { PhoneReports } from '../src/phone/reports.ts';
import { PhoneSetup, type SetupPicked } from '../src/phone/setup.ts';
import { SigningIn } from '../src/phone/signing-in.ts';
import { PhoneSync } from '../src/phone/sync.ts';
import { Server, type Asking, type Reply } from '../src/server.ts';
import { checkOf, noLists } from './checks.ts';
import { HeldKeyring, HeldStore } from './held.ts';

export const deviceId = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d21';
export const ana = {
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d22',
  number: 'M004127',
  name: 'Ana Brooks',
};
export const kim = {
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d23',
  number: 'M004128',
  name: 'Kim Nguyen',
};
export const jo = { id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d24', number: 'M004130', name: 'Jo Kim' };
export const passwords = { [ana.id]: '5550101', [kim.id]: '5550102' };
export const passcode = 'heron-marsh-delphine';

export const policy = Policy.from(
  parseEnv(readFileSync(new URL('../../../packages/domain/policy.env', import.meta.url), 'utf8')),
);

export const p1 = {
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d25',
  name: 'Bayline County ROW, Hurricane Delphine',
  timeZone: 'America/New_York',
};
export const p2 = {
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d26',
  name: 'Bayline County Parks, Hurricane Delphine',
  timeZone: 'America/New_York',
};
export const area = { kind: 'CIRCLE', meters: 150 } as const;
export const marshRoad = {
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d27',
  name: 'Marsh Road TDSR',
  siteType: { id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d28', name: 'TDSR/DMS' },
  takesLoads: true,
  haulOutsLeaveHere: true,
  latitude: '39.20000000',
  longitude: '-75.50000000',
  area,
};
export const landfill = {
  ...marshRoad,
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d29',
  name: 'Bayline County Landfill',
  haulOutsLeaveHere: false,
};
export const payItem = (id: string, name: string, archived = false) => ({
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
export const hangers = payItem('0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d31', 'Hangers');
export const leaners = payItem('0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d32', 'Leaners');
export const retired = payItem('0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d33', 'Stumps', true);

// Ana's Monday at the Landfill's tower, as her sign-in answers it: the lists the phone holds.
export const towerDay: PhoneAssignmentAnswer = {
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d34',
  workDate: '2026-10-19',
  project: p1,
  fieldEventKinds: ['DISPOSAL'],
  certifying: false,
  formDocumentTypes: [],
  site: { id: landfill.id, name: landfill.name },
};
export const towerLists: PhoneListsRecord = {
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

export interface Sent {
  readonly endpoint: string;
  readonly json?: unknown;
  readonly token?: string | undefined;
  readonly session?: string | undefined;
}

// The API as these tests need it: a phone enrolled and proven, by its key or with the master
// passcode beside it; Ana signed in online with her tower day; the login list of Ana and Kim;
// what a setup picks from, two monitors a page; and the reports, each saved once.
export class TestServer extends Server {
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
  // The sign-ins made offline it has taken, as reported.
  readonly offlineSignIns: OfflineSignInReport[] = [];
  // Each sync sent, as it went; how each record is answered (saved where it says nothing); the
  // waits it tells first, each a code and seconds; the numbers it answers; the setup version of
  // P1 it brings.
  readonly syncs: SyncSent[] = [];
  recordAnswer: (record: SyncedRecord) => RecordAnswer | undefined = () => undefined;
  readonly waits: { readonly code: ErrorCode; readonly seconds: number }[] = [];
  numbers: (sync: SyncSent) => SeriesHeld[] = () => [];
  setupVersion = towerLists.setupVersion;

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
    // A sign-in made offline, checked as the API checks one (ADR-531): its own password's first
    // hash, or the passcode's where it was made under it, keys the proof of what it says.
    if (served === takeOfflineSignInOnPhoneEndpoint) {
      const reported = json as unknown as OfflineSignInReport;
      const rules = new OfflineSignInRules();
      const signed = rules.signed({
        ...reported,
        deviceId,
        signedInAt: new Date(reported.signedInAt),
      });
      const underPasscode = rules.underPasscode(reported.kind);
      const first =
        underPasscode === null ? this.firsts.get(reported.personId) : this.passcodeCheck.first;
      const proof =
        first === undefined ? '' : createHmac('sha256', first).update(signed).digest('base64url');
      const person = this.monitors.find(({ id }) => id === reported.personId);
      if (reported.proof !== proof || person === undefined) {
        return { kind: 'refused', code: 'SIGN_IN_REFUSED' };
      }
      this.offlineSignIns.push(reported);
      return {
        kind: 'answered',
        answer: {
          token: `${person.name.split(' ')[0]?.toLowerCase() ?? ''}-taken`,
          userId: person.id,
          monitorNumber: person.number,
          name: person.name,
          expiresInSeconds: 3600,
          masterPasscodeSession: underPasscode,
        },
      };
    }
    // A session under the passcode, with signal (ADR-462): for a monitor the server knows.
    if (served === openPasscodeSessionOnPhoneEndpoint) {
      if (json['passcode'] !== passcode) {
        return { kind: 'refused', code: 'MASTER_PASSCODE_REFUSED' };
      }
      const person = this.monitors.find(({ id }) => id === json['personId']);
      if (person === undefined) return { kind: 'refused', code: 'NOT_A_MONITOR' };
      const kind = json['kind'] === 'TEMPORARY' ? 'TEMPORARY' : 'AS_MONITOR';
      return {
        kind: 'answered',
        answer: {
          token: `${person.name.split(' ')[0]?.toLowerCase() ?? ''}-${kind.toLowerCase()}`,
          userId: person.id,
          monitorNumber: person.number,
          name: person.name,
          expiresInSeconds: kind === 'TEMPORARY' ? 3600 : 86_400,
          assignment: person.id === ana.id ? towerDay : null,
          noAssignment: person.id === ana.id ? null : 'NONE_THAT_DAY',
          masterPasscodeSession: kind,
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
    if (served === syncPhoneEndpoint) {
      if (!inUse) return { kind: 'refused', code: 'NOT_SIGNED_IN' };
      return this.synced(json as unknown as SyncSent);
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

  // A sync answered as the API answers one (ADR-472, 473): each report as its own endpoint answers
  // it, each record as the test says, the numbers, the passcode's check where the phone holds
  // another, and P1's setup version where its lists are P1's. A wait first, where one is left.
  private synced(sync: SyncSent): Reply<Endpoint> {
    this.syncs.push(JSON.parse(JSON.stringify(sync)) as SyncSent);
    const wait = this.waits.shift();
    if (wait !== undefined) {
      return { kind: 'refused', code: wait.code, waitSeconds: wait.seconds };
    }
    const reported = (id: string) => {
      const reason = this.notSaved;
      const answer = reason !== null ? 'NOT_SAVED' : this.saved.has(id) ? 'ALREADY_SAVED' : 'SAVED';
      if (reason === null) this.saved.add(id);
      return { answer, reason };
    };
    return {
      kind: 'answered',
      answer: {
        unplannedAssignments: sync.unplannedAssignments.map(({ id }) => ({
          assignmentId: id,
          ...reported(id),
        })),
        passcodeUses: sync.passcodeUses.map(({ id }) => ({ useId: id, ...reported(id) })),
        records: sync.records.map((record) => {
          const id = syncedRecordId(record);
          return this.recordAnswer(record) ?? { answer: 'SAVED' as const, id, notes: [] };
        }),
        photos: sync.photos.map(({ id }) => ({ answer: 'SAVED' as const, id, notes: [] })),
        numbers: this.numbers(sync),
        masterPasscode: {
          version: 1,
          check: sync.holds.masterPasscodeVersion === 1 ? null : this.passcodeCheck.check,
        },
        setupVersion:
          sync.holds.listsProjectId === p1.id
            ? { projectId: p1.id, version: this.setupVersion }
            : null,
      },
    };
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

export async function phone(clock = { now: new Date('2026-10-19T11:00:00Z') }) {
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
  const passcodeOnPhone = new PasscodeOnPhone(identity, monitor, loginList, reports);
  const signingIn = new SigningIn(monitor, lists, loginList, passcodeOnPhone, reports, policy);
  const setup = new PhoneSetup(
    store,
    identity,
    monitor,
    lists,
    loginList,
    passcodeOnPhone,
    reports,
    now,
  );
  const sessions = new PasscodeSessions(
    monitor,
    lists,
    loginList,
    passcodeOnPhone,
    setup,
    reports,
    policy,
  );
  const outbox = await PhoneOutbox.opened(store, {
    holding: async () => {
      const [check, held, lastUsed] = await Promise.all([
        loginList.passcode(),
        lists.held(),
        lists.lastUsed(),
      ]);
      return {
        holds: {
          masterPasscodeVersion: check?.version ?? null,
          listsProjectId: held?.assignment.project.id ?? null,
        },
        lastUsed,
      };
    },
    filePartBytesAtMost: 65_536,
    wipe: () => store.erase(),
    now,
  });
  // How long the phone was told to wait each time, as it waited.
  const slept: number[] = [];
  const sync = new PhoneSync(
    { store, outbox, monitor, lists, loginList },
    {
      now,
      sleep: (milliseconds) => {
        slept.push(milliseconds);
        return Promise.resolve();
      },
      random: () => 0.5,
    },
  );
  server.sent.length = 0;
  return {
    clock,
    store,
    keyring,
    server,
    reports,
    monitor,
    lists,
    loginList,
    outbox,
    sync,
    slept,
    passcodeOnPhone,
    signingIn,
    setup,
    sessions,
  };
}

// Ana's tower day read on the phone, with the login list and the passcode's check, then signed
// out: the phone holds P1's lists.
export async function heldP1(clock?: { now: Date }) {
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

export const named = (sent: readonly Sent[]) => sent.map(({ endpoint }) => endpoint);
// What was asked, but the phone's own proofs.
export const done = (sent: readonly Sent[]) =>
  named(sent).filter((name) => name !== 'challengePhone' && name !== 'provePhone');

// Everything the phone keeps, in its store and its keyring, as text.
export const keptText = (store: HeldStore, keyring: HeldKeyring) =>
  JSON.stringify([...store.shelves.values(), ...keyring.secrets.values()]);

export const kimsTowerDay = (project = p1): SetupPicked => ({
  project,
  work: { fieldEventKinds: ['DISPOSAL'], certifying: false, formDocumentTypes: ['DROP_OFF_LOG'] },
  site: marshRoad,
  payItemIds: [],
  monitor: { monitorId: kim.id, monitorNumber: kim.number, name: kim.name },
});
