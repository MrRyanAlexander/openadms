// Signing in with no connection (src/phone/offline-check.ts, login-list.ts, signing-in.ts and the
// offline half of monitor.ts; BACKLOG 3.2.4, C120, C141; ADR-449, 454, 531, 575): the login list
// asked for, kept and dropped as the answers say; a password checked in two slow hashes against the
// monitor's entry, as the server makes one; the screen's own count of wrong tries, its waits and
// its lock until the master passcode; the sign-in kept with its proof and reported before anything
// else of the monitor's is asked. Here against a server of the test's own; against the real API,
// in a real browser, e2e/offline-sign-in.e2e.ts.
import { argon2Sync, createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import {
  challengePhoneEndpoint,
  enrolPhoneEndpoint,
  phoneListsEndpoint,
  phoneLoginListEndpoint,
  provePhoneEndpoint,
  signInOnPhoneEndpoint,
  signOutOnPhoneEndpoint,
  takeOfflineSignInOnPhoneEndpoint,
  type Endpoint,
  type OfflineCheckRecord,
  type PhoneAssignmentAnswer,
  type PhoneListsRecord,
  type PhoneLoginListAnswer,
} from '@open-adms/contracts';
import { OfflineSignInRules, Policy, SignInTries } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { PhoneIdentity } from '../src/phone/identity.ts';
import { PhoneLists } from '../src/phone/lists.ts';
import { LoginList } from '../src/phone/login-list.ts';
import { MonitorOnPhone } from '../src/phone/monitor.ts';
import { checkOpened, signInProof } from '../src/phone/offline-check.ts';
import { SigningIn } from '../src/phone/signing-in.ts';
import { Server, type Asking, type Reply } from '../src/server.ts';
import { HeldKeyring, HeldStore } from './held.ts';

const deviceId = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d11';
const ana = { id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d12', number: 'M004129', name: 'Ana Brooks' };
const kim = { id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d13', number: 'M004128', name: 'Kim Nguyen' };
const passwords = { [ana.id]: '5550103', [kim.id]: '5550102' };
const passcode = 'heron-marsh-delphine';

// The release's policy values, as the build hands them to the app.
const policy = Policy.from(
  parseEnv(readFileSync(new URL('../../../packages/domain/policy.env', import.meta.url), 'utf8')),
);

// Ana's Monday on collections in P1, as her sign-in answers it.
const collections: PhoneAssignmentAnswer = {
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d14',
  workDate: '2026-10-19',
  project: {
    id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d15',
    name: 'Bayline County ROW, Hurricane Delphine',
    timeZone: 'America/New_York',
  },
  fieldEventKinds: ['COLLECTION'],
  certifying: false,
  formDocumentTypes: ['INCIDENT'],
  site: null,
};

const noLists: PhoneListsRecord = {
  setupVersion: 3,
  blocks: [],
  controlRanges: [],
  debrisTypes: { LOAD: [], HAUL_OUT: [] },
  fieldTags: [],
  typedNumberReasons: [],
  certifications: [],
  sites: [],
  roes: [],
  payItems: [],
  itemNames: [],
  incidentTypes: [],
  incidentOffers: [],
  contractors: [],
  surveyWorkTypes: [],
  vehicleTypes: [],
  vehicleFeatures: [],
  crewTypes: [],
  primes: [],
  helpers: [],
  quantityLookup: [],
};

// The server's making of a check (apps/api's OfflineChecks): Argon2id of what is typed in NFC
// under a salt of its own, then Argon2id of those bytes under a salt for this phone. Cheap
// settings here but where a test says otherwise; the phone reads them from the check.
const cheap = { memory: 64, passes: 1, parallelism: 1 };
const unpadded = (bytes: Buffer) => bytes.toString('base64').replace(/=+$/, '');
function firstOf(typed: string, salt: Buffer, cost = cheap): Buffer {
  return argon2Sync('argon2id', {
    message: Buffer.from(typed.normalize('NFC')),
    nonce: salt,
    memory: cost.memory,
    passes: cost.passes,
    parallelism: cost.parallelism,
    tagLength: 32,
  });
}
function checkOf(typed: string, cost = cheap): { check: OfflineCheckRecord; first: Buffer } {
  const [firstSalt, secondSalt] = [randomBytes(16), randomBytes(16)];
  const first = firstOf(typed, firstSalt, cost);
  const second = argon2Sync('argon2id', {
    message: first,
    nonce: secondSalt,
    memory: cost.memory,
    passes: cost.passes,
    parallelism: cost.parallelism,
    tagLength: 32,
  });
  const settings = `m=${String(cost.memory)},t=${String(cost.passes)},p=${String(cost.parallelism)}`;
  return {
    first,
    check: {
      first: { salt: unpadded(firstSalt), ...cost, bytes: 32 },
      check: `$argon2id$v=19$${settings}$${unpadded(secondSalt)}$${unpadded(second)}`,
    },
  };
}

interface Sent {
  readonly endpoint: string;
  readonly json?: unknown;
  readonly session?: string | undefined;
}

// The API as these tests need it: a phone enrolled and proven; Ana signed in online on it with her
// assignment; a login list of Ana and Kim made as the server makes one, its marks the test's; and
// an offline sign-in taken where its proof is the one the right password makes.
class TestServer extends Server {
  readonly sent: Sent[] = [];
  signal = true;
  reportRefused = false;
  readonly firsts = new Map<string, Buffer>();
  marks: Record<string, string> = { [ana.id]: 'ana-1', [kim.id]: 'kim-1' };
  named = [ana, kim];
  // The most entries made in one call; the rest are said to be more.
  entriesPerCall = 50;
  noAssignment = false;
  passcodeCheck = checkOf(passcode);

  constructor() {
    super('https://api.adms.localhost');
  }

  // How many more login lists are answered before the signal goes: none for always.
  loginListsBeforeNoSignal: number | null = null;

  override ask<E extends Endpoint>(served: E, asking: Asking = {}): Promise<Reply<E>> {
    this.sent.push({ endpoint: served.name, json: asking.json, session: asking.session });
    if ((served as Endpoint) === phoneLoginListEndpoint && this.loginListsBeforeNoSignal !== null) {
      if (this.loginListsBeforeNoSignal === 0) this.signal = false;
      this.loginListsBeforeNoSignal -= 1;
    }
    if (!this.signal) return Promise.resolve({ kind: 'unreachable' });
    return Promise.resolve(this.answer(served, asking) as Reply<E>);
  }

  private answer(served: Endpoint, asking: Asking): Reply<Endpoint> {
    if (served === enrolPhoneEndpoint) {
      return { kind: 'answered', answer: { deviceId, masterPasscodeVersion: 1 } };
    }
    if (served === challengePhoneEndpoint) {
      return { kind: 'answered', answer: { challenge: 'challenge', expiresInSeconds: 120 } };
    }
    if (served === provePhoneEndpoint) {
      return { kind: 'answered', answer: { token: 'phone-token', expiresInSeconds: 900 } };
    }
    if (served === signInOnPhoneEndpoint) {
      const { monitorNumber, password } = asking.json as Record<string, string>;
      if (monitorNumber !== ana.number || password !== passwords[ana.id]) {
        return { kind: 'refused', code: 'SIGN_IN_REFUSED' };
      }
      return {
        kind: 'answered',
        answer: {
          token: 'online-1',
          userId: ana.id,
          monitorNumber: ana.number,
          name: ana.name,
          expiresInSeconds: 86_400,
          assignment: collections,
          noAssignment: null,
        },
      };
    }
    if (served === takeOfflineSignInOnPhoneEndpoint) {
      const report = asking.json as Record<string, string | number | null>;
      const signed = new OfflineSignInRules().signed({
        deviceId,
        id: String(report['id']),
        kind: 'OWN_PASSWORD',
        personId: String(report['personId']),
        signedInAt: new Date(String(report['signedInAt'])),
        masterPasscodeVersion: null,
      });
      const first = this.firsts.get(String(report['personId']));
      const proof =
        first === undefined ? '' : createHmac('sha256', first).update(signed).digest('base64url');
      if (this.reportRefused || report['proof'] !== proof) {
        return { kind: 'refused', code: 'SIGN_IN_REFUSED' };
      }
      return {
        kind: 'answered',
        answer: {
          token: 'taken-1',
          userId: ana.id,
          monitorNumber: ana.number,
          name: ana.name,
          expiresInSeconds: 3600,
          masterPasscodeSession: null,
        },
      };
    }
    if (asking.session === undefined) return { kind: 'refused', code: 'NOT_SIGNED_IN' };
    if (served === phoneListsEndpoint) {
      return {
        kind: 'answered',
        answer: { assignment: collections, noAssignment: null, lists: noLists },
      };
    }
    if (served === phoneLoginListEndpoint)
      return { kind: 'answered', answer: this.loginList(asking) };
    if (served === signOutOnPhoneEndpoint) {
      return { kind: 'answered', answer: { status: 'signed-out' } };
    }
    throw new Error(`The test's server doesn't serve ${served.name}.`);
  }

  private loginList(asking: Asking): PhoneLoginListAnswer {
    const held = asking.json as {
      masterPasscodeVersion: number | null;
      entries: { monitorId: string; mark: string }[];
    };
    const masterPasscode = {
      version: 1,
      check: held.masterPasscodeVersion === 1 ? null : this.passcodeCheck.check,
    };
    if (this.noAssignment) {
      return { masterPasscode, noAssignment: 'NONE_THAT_DAY', loginList: null };
    }
    let made = 0;
    let more = false;
    const monitors = this.named.map((person) => {
      const mark = this.marks[person.id] ?? '';
      const holds = held.entries.some((one) => one.monitorId === person.id && one.mark === mark);
      let check: OfflineCheckRecord | null = null;
      if (!holds && made < this.entriesPerCall) {
        const fresh = checkOf(passwords[person.id] ?? '');
        this.firsts.set(person.id, fresh.first);
        check = fresh.check;
        made += 1;
      } else if (!holds) {
        more = true;
      }
      return { monitorId: person.id, monitorNumber: person.number, name: person.name, mark, check };
    });
    return {
      masterPasscode,
      noAssignment: null,
      loginList: { projectId: collections.project.id, monitors, more },
    };
  }
}

async function phone(clock: { now: Date } = { now: new Date('2026-10-19T11:00:00Z') }) {
  const now = () => clock.now;
  const store = new HeldStore();
  const keyring = new HeldKeyring();
  const server = new TestServer();
  const identity = new PhoneIdentity(store, keyring, server, now);
  await identity.enrol('P1-COL-1', passcode);
  const monitor = new MonitorOnPhone(identity, keyring, now);
  const lists = new PhoneLists(store, monitor, now);
  const loginList = new LoginList(store, SignInTries.onPhone(policy), now);
  const signingIn = new SigningIn(monitor, lists, loginList, policy);
  return { clock, store, keyring, server, monitor, lists, loginList, signingIn };
}

// Ana signed in online on the phone, which read her lists and its login list, then signed out:
// what a phone holds at the end of the day before.
async function setUp(clock?: { now: Date }) {
  const held = await phone(clock);
  expect(await held.signingIn.signIn(ana.number, passwords[ana.id] ?? '')).toMatchObject({
    kind: 'signedIn',
  });
  await held.lists.read();
  expect(await held.loginList.read(held.monitor)).toEqual({ kind: 'read' });
  await held.monitor.signOut();
  held.server.sent.length = 0;
  return held;
}

const named = (sent: readonly Sent[]) => sent.map(({ endpoint }) => endpoint);

describe('the two slow hashes', () => {
  it('AC-11-19: a password opens a check the server made, in two steps at the server’s own settings, and gives the first hash; any other password opens nothing', async () => {
    const own = { memory: 19456, passes: 2, parallelism: 1 };
    const { check, first } = checkOf('5550103', own);
    expect(Buffer.from((await checkOpened('5550103', check)) ?? [])).toEqual(first);
    expect(await checkOpened('5550104', check)).toBeUndefined();
  });

  it('AC-11-19: what is typed is taken in Unicode’s composed form, as the server takes it', async () => {
    const { check } = checkOf('Anaé-5550103');
    expect(await checkOpened('Anaé-5550103', check)).toBeDefined();
  });

  it('a check no Argon2id can read opens nothing, and nothing is thrown', async () => {
    const { check } = checkOf('5550103');
    expect(await checkOpened('5550103', { ...check, check: 'not-a-check' })).toBe(undefined);
    expect(
      await checkOpened('5550103', { ...check, first: { ...check.first, memory: 1 } }),
    ).toBeUndefined();
  });

  it('AC-11-21: the proof is the HMAC-SHA256 keyed by the first hash over what the domain says a sign-in signs, as the server makes it', () => {
    const first = randomBytes(32);
    const signed = 'open-adms/offline-sign-in/v1\nwhat it signs';
    expect(signInProof(first, signed)).toBe(
      createHmac('sha256', first).update(signed).digest('base64url'),
    );
  });
});

describe('the login list the phone holds', () => {
  it('AC-02-41: read by the monitor signed in, saying what the phone holds: made only what it lacks, the passcode’s check with it, and asked again while there are more', async () => {
    const { server, monitor, signingIn, loginList } = await phone();
    server.entriesPerCall = 1;
    await signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    expect(await loginList.read(monitor)).toEqual({ kind: 'read' });
    const asked = server.sent.filter(({ endpoint }) => endpoint === 'phoneLoginList');
    expect(asked.map(({ json, session }) => [json, session])).toEqual([
      [{ masterPasscodeVersion: null, entries: [] }, 'online-1'],
      [{ masterPasscodeVersion: 1, entries: [{ monitorId: ana.id, mark: 'ana-1' }] }, 'online-1'],
    ]);
    expect((await loginList.entries()).map(({ name }) => name).sort()).toEqual([
      ana.name,
      kim.name,
    ]);
    expect((await loginList.passcode())?.version).toBe(1);

    // Read again: nothing to make, and nothing changes.
    server.sent.length = 0;
    await loginList.read(monitor);
    expect(server.sent.map(({ json }) => json)).toEqual([
      {
        masterPasscodeVersion: 1,
        entries: expect.arrayContaining([
          { monitorId: ana.id, mark: 'ana-1' },
          { monitorId: kim.id, mark: 'kim-1' },
        ]) as unknown,
      },
    ]);
  });

  it('AC-02-41: anybody the answer doesn’t name is dropped; a password set anew drops the old entry for a new one; told there is no assignment, the phone keeps what it holds', async () => {
    const { server, monitor, loginList, signingIn } = await phone();
    await signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    await loginList.read(monitor);
    const kimsFirst = (await loginList.entry(kim.number))?.check;

    server.marks = { ...server.marks, [kim.id]: 'kim-2' };
    await loginList.read(monitor);
    expect((await loginList.entry(kim.number))?.mark).toBe('kim-2');
    expect((await loginList.entry(kim.number))?.check).not.toEqual(kimsFirst);

    // Both passwords set anew; one entry made a call, and the signal goes after the first: the
    // entry the old password opened is gone all the same, never left to sign Kim in with it.
    server.marks = { [ana.id]: 'ana-3', [kim.id]: 'kim-3' };
    server.entriesPerCall = 1;
    server.loginListsBeforeNoSignal = 1;
    expect(await loginList.read(monitor)).toEqual({ kind: 'unreachable' });
    expect((await loginList.entries()).map(({ name, mark }) => [name, mark])).toEqual([
      [ana.name, 'ana-3'],
    ]);
    server.signal = true;
    server.loginListsBeforeNoSignal = null;
    server.entriesPerCall = 50;
    await loginList.read(monitor);

    server.noAssignment = true;
    expect(await loginList.read(monitor)).toEqual({ kind: 'none', why: 'NONE_THAT_DAY' });
    expect(await loginList.entries()).toHaveLength(2);

    server.noAssignment = false;
    server.named = [ana];
    await loginList.read(monitor);
    expect((await loginList.entries()).map(({ name }) => name)).toEqual([ana.name]);
    // The Monitor ID is read as the server reads it.
    expect((await loginList.entry(' m004129 '))?.name).toBe(ana.name);
  });
});

describe('signing in with no connection', () => {
  it('AC-02-39, AC-11-19: Ana signs in on P1-COL-1 with no signal: her password opens her entry, she takes the assignment whose lists the phone holds, and the phone keeps the sign-in with its proof in the keyring: never the password or the hash, never in the store', async () => {
    const { server, keyring, store, signingIn } = await setUp();
    server.signal = false;
    const outcome = await signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    expect(outcome).toMatchObject({
      kind: 'signedIn',
      signedIn: { userId: ana.id, name: ana.name, assignment: collections, offline: true },
    });
    // The server was tried first, and nothing else was asked.
    expect(named(server.sent)).toEqual(['signInOnPhone']);
    expect([...keyring.secrets.keys()]).not.toContain('monitorSession');
    const kept = JSON.parse(keyring.secrets.get('offlineSignIn') ?? '{}') as {
      report: Record<string, unknown>;
      until: string;
    };
    expect(kept.report).toMatchObject({
      kind: 'OWN_PASSWORD',
      personId: ana.id,
      signedInAt: '2026-10-19T11:00:00.000Z',
      masterPasscodeVersion: null,
    });
    // As long as her sign-in online lasted.
    expect(kept.until).toBe('2026-10-20T11:00:00.000Z');
    const everything = JSON.stringify([...keyring.secrets.values(), ...store.shelves.values()]);
    expect(everything).not.toContain(passwords[ana.id]);
    const first = server.firsts.get(ana.id)?.toString('base64url') ?? 'none';
    expect(everything).not.toContain(first);
  });

  it('AC-02-40: wrong tries against the list are counted on the phone: the first four only counted, from the fifth a wait twice as long each time in which nothing is checked, at the tenth the screen locked until the master passcode; the passcode starts it again', async () => {
    const clock = { now: new Date('2026-10-19T11:00:00Z') };
    const { server, signingIn, loginList } = await setUp(clock);
    server.signal = false;
    const costs: string[] = [];
    for (let nth = 1; nth <= 10; nth += 1) {
      const outcome = await signingIn.signIn(ana.number, `wrong-${String(nth)}`);
      if (outcome.kind !== 'wrong') throw new Error(`try ${String(nth)}: ${outcome.kind}`);
      costs.push(outcome.cost.kind);
      if (outcome.cost.kind === 'WAIT') {
        // Nothing is checked while it waits, not even the right password.
        expect(await signingIn.signIn(ana.number, passwords[ana.id] ?? '')).toMatchObject({
          kind: 'closed',
          tries: { wrongInARow: nth },
        });
        clock.now = outcome.cost.until;
      }
    }
    expect(costs).toEqual([
      ...['COUNTED', 'COUNTED', 'COUNTED', 'COUNTED'],
      ...['WAIT', 'WAIT', 'WAIT', 'WAIT', 'WAIT'],
      'LOCKED',
    ]);
    // Locked: the right password is checked against nothing, now or later, signal or not.
    clock.now = new Date(clock.now.getTime() + 86_400_000);
    server.signal = true;
    expect(await signingIn.signIn(ana.number, passwords[ana.id] ?? '')).toMatchObject({
      kind: 'closed',
      tries: { locked: true },
    });
    expect(await signingIn.unlock('not-the-passcode')).toBe('wrong');
    expect((await loginList.screen()).locked).toBe(true);
    expect(await signingIn.unlock(passcode)).toBe('unlocked');
    expect(await loginList.screen()).toEqual({ wrongInARow: 0, waitUntil: null, locked: false });
    expect(await signingIn.signIn(ana.number, passwords[ana.id] ?? '')).toMatchObject({
      kind: 'signedIn',
    });
  });

  it('AC-02-40: a Monitor ID not on the list is a wrong try too; a sign-in that works starts the count again; the server’s refusals online are the server’s to count', async () => {
    const { server, signingIn, loginList } = await setUp();
    server.signal = false;
    await signingIn.signIn('M999999', '5550103');
    await signingIn.signIn(ana.number, 'wrong');
    expect((await loginList.screen()).wrongInARow).toBe(2);
    await signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    expect((await loginList.screen()).wrongInARow).toBe(0);

    server.signal = true;
    expect(await signingIn.signIn(ana.number, 'wrong')).toMatchObject({
      kind: 'refused',
      reply: { code: 'SIGN_IN_REFUSED' },
    });
    expect((await loginList.screen()).wrongInARow).toBe(0);
  });

  it('ADR-120, ADR-575: Kim’s own password is right, but P1-COL-1 holds Ana’s work: with no signal it says so and signs nobody in; a phone that holds no login list can check nobody', async () => {
    const { server, signingIn, keyring } = await setUp();
    server.signal = false;
    expect(await signingIn.signIn(kim.number, passwords[kim.id] ?? '')).toEqual({
      kind: 'anotherMonitor',
      name: ana.name,
    });
    expect(keyring.secrets.has('offlineSignIn')).toBe(false);

    const bare = await phone();
    bare.server.signal = false;
    expect(await bare.signingIn.signIn(ana.number, passwords[ana.id] ?? '')).toEqual({
      kind: 'noList',
    });
  });
});

describe('a sign-in made with no connection, reported', () => {
  it('AC-11-21: at signal, it is reported before anything else of hers, once however many ask at once, its proof the server’s own making; taken, the session given is held and the proof dropped', async () => {
    const { server, keyring, monitor, lists, loginList, signingIn } = await setUp();
    server.signal = false;
    await signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    server.signal = true;
    server.sent.length = 0;
    const [read, again] = await Promise.all([lists.read(), loginList.read(monitor)]);
    expect(read.kind).toBe('taken');
    expect(again.kind).toBe('read');
    expect(named(server.sent)[0]).toBe('takeOfflineSignInOnPhone');
    expect(named(server.sent).slice(1).sort()).toEqual(['phoneLists', 'phoneLoginList']);
    expect(server.sent.slice(1).map(({ session }) => session)).toEqual(['taken-1', 'taken-1']);
    expect(keyring.secrets.has('offlineSignIn')).toBe(false);
    expect(await monitor.signedIn()).toMatchObject({ offline: false, assignment: collections });
  });

  it('AC-11-21: refused, the sign-in is dropped, the answer says so and nothing the phone holds goes with it; with no answer it is kept for the next time', async () => {
    const { server, keyring, store, monitor, lists, signingIn } = await setUp();
    server.signal = false;
    await signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    expect(await lists.read()).toEqual({ kind: 'unreachable' });
    expect(keyring.secrets.has('offlineSignIn')).toBe(true);

    server.signal = true;
    server.reportRefused = true;
    const before = [...store.shelves.keys()].sort();
    expect(await lists.read()).toEqual({ kind: 'refused', code: 'SIGN_IN_REFUSED' });
    expect(await monitor.signedIn()).toBeUndefined();
    expect(keyring.secrets.has('offlineSignIn')).toBe(false);
    expect([...store.shelves.keys()].sort()).toEqual(before);
  });

  it('AC-11-64: signed out before it was reported, the sign-in and its proof are dropped and never sent', async () => {
    const { server, keyring, monitor, signingIn } = await setUp();
    server.signal = false;
    await signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    server.signal = true;
    await monitor.signOut();
    expect(named(server.sent)).toEqual(['signInOnPhone']);
    expect(keyring.secrets.has('offlineSignIn')).toBe(false);
    expect(await monitor.signedIn()).toBeUndefined();
  });

  it('a sign-in made offline lasts by the phone’s clock until the server says: run out, it is dropped and nothing is sent', async () => {
    const clock = { now: new Date('2026-10-19T11:00:00Z') };
    const { server, monitor, lists, signingIn } = await setUp(clock);
    server.signal = false;
    await signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    clock.now = new Date('2026-10-20T11:00:00Z');
    server.signal = true;
    server.sent.length = 0;
    expect(await lists.read()).toEqual({ kind: 'refused', code: 'NOT_SIGNED_IN' });
    expect(server.sent).toEqual([]);
    expect(await monitor.signedIn()).toBeUndefined();
  });
});
