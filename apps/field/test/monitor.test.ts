// The monitor signed in on the phone and the lists it holds (src/phone/monitor.ts, lists.ts;
// BACKLOG 3.2.3, C114, C115, C117, C133; ADR-441…444, 450, 453, 574): signed in online, their
// session held in the keyring beside the phone's token and sent beside it, dropped on
// `NOT_SIGNED_IN`; the assignment taken from the answer; the lists kept with when they were read,
// kept as they are when there is no assignment, and read again for another setup version. Here
// against a server of the test's own; against the real API, in a real browser,
// e2e/sign-in.e2e.ts.
import {
  challengePhoneEndpoint,
  enrolPhoneEndpoint,
  phoneListsEndpoint,
  provePhoneEndpoint,
  signInOnPhoneEndpoint,
  signOutOnPhoneEndpoint,
  type Endpoint,
  type PhoneAssignmentAnswer,
  type PhoneListsAnswer,
  type PhoneListsRecord,
} from '@open-adms/contracts';
import { describe, expect, it } from 'vitest';

import { PhoneIdentity } from '../src/phone/identity.ts';
import { PhoneLists } from '../src/phone/lists.ts';
import { MonitorOnPhone } from '../src/phone/monitor.ts';
import { Server, type Asking, type Reply } from '../src/server.ts';
import { worksOf } from '../src/phone/works.ts';
import { lastSynced } from '../src/words.ts';
import english from '../src/words/en.json' with { type: 'json' };
import { HeldKeyring, HeldStore } from './held.ts';

const deviceId = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d01';
const kim = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d02';

// Kim Nguyen's Monday at the Marsh Road TDSR tower, as the sign-in answers it.
const towerMonday: PhoneAssignmentAnswer = {
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d03',
  workDate: '2026-10-19',
  project: {
    id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d04',
    name: 'Bayline County ROW, Hurricane Delphine',
    timeZone: 'America/New_York',
  },
  fieldEventKinds: ['DISPOSAL'],
  certifying: false,
  formDocumentTypes: ['DROP_OFF_LOG'],
  site: { id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d05', name: 'Marsh Road TDSR' },
};

const listsOf = (setupVersion: number): PhoneListsRecord => ({
  setupVersion,
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
});

interface Sent {
  readonly endpoint: string;
  readonly json?: unknown;
  readonly token?: string | undefined;
  readonly session?: string | undefined;
}

// The API as these tests need it: it enrols and proves any phone, signs a monitor in with the
// answer it is given, answers the lists it is given, and refuses a session it was told to stop
// taking.
class TestServer extends Server {
  readonly sent: Sent[] = [];
  signIn: Reply<typeof signInOnPhoneEndpoint> = {
    kind: 'answered',
    answer: {
      token: 'session-1',
      userId: kim,
      monitorNumber: 'M004128',
      name: 'Kim Nguyen',
      expiresInSeconds: 86_400,
      assignment: towerMonday,
      noAssignment: null,
    },
  };
  lists: PhoneListsAnswer | 'UNREACHABLE' = {
    assignment: towerMonday,
    noAssignment: null,
    lists: listsOf(3),
  };
  readonly ended = new Set<string>();

  constructor() {
    super('https://api.adms.localhost');
  }

  override ask<E extends Endpoint>(served: E, asking: Asking = {}): Promise<Reply<E>> {
    const { json, token, session } = asking;
    this.sent.push({ endpoint: served.name, json, token, session });
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
    if (asking.token !== 'phone-token') return { kind: 'refused', code: 'PHONE_NOT_PROVEN' };
    if (served === signInOnPhoneEndpoint) return this.signIn;
    if (asking.session === undefined || this.ended.has(asking.session)) {
      return { kind: 'refused', code: 'NOT_SIGNED_IN' };
    }
    if (served === phoneListsEndpoint) {
      return this.lists === 'UNREACHABLE'
        ? { kind: 'unreachable' }
        : { kind: 'answered', answer: this.lists };
    }
    if (served === signOutOnPhoneEndpoint) {
      this.ended.add(asking.session);
      return { kind: 'answered', answer: { status: 'signed-out' } };
    }
    throw new Error(`The test's server doesn't serve ${served.name}.`);
  }
}

async function phone(now = () => new Date('2026-10-19T12:00:00Z')) {
  const store = new HeldStore();
  const keyring = new HeldKeyring();
  const server = new TestServer();
  const identity = new PhoneIdentity(store, keyring, server, now);
  await identity.enrol('P1-TWR-TDSR', 'heron-marsh-delphine');
  const monitor = new MonitorOnPhone(identity, keyring, now);
  server.sent.length = 0;
  return { store, keyring, server, monitor, lists: new PhoneLists(store, monitor, now) };
}

const named = (sent: readonly Sent[]) => sent.map(({ endpoint }) => endpoint);

describe('signing in on the phone', () => {
  it('AC-11-14, AC-02-35: signed in online, the phone proves itself and sends the Monitor ID and password; the session is held in the keyring beside the phone’s token, never the store, and goes beside it on every request of hers', async () => {
    const { store, keyring, server, monitor, lists } = await phone();
    const reply = await monitor.signIn('M004128', '5550102');
    expect(reply.kind).toBe('answered');
    expect(named(server.sent)).toEqual(['challengePhone', 'provePhone', 'signInOnPhone']);
    expect(server.sent[2]).toEqual({
      endpoint: 'signInOnPhone',
      json: { monitorNumber: 'M004128', password: '5550102' },
      token: 'phone-token',
      session: undefined,
    });
    expect([...keyring.secrets.keys()].sort()).toEqual(['monitorSession', 'phoneToken']);
    expect(JSON.parse(keyring.secrets.get('monitorSession') ?? '')).toMatchObject({
      answer: { token: 'session-1' },
      until: '2026-10-20T12:00:00.000Z',
    });
    expect(await monitor.signedIn()).toEqual({
      userId: kim,
      monitorNumber: 'M004128',
      name: 'Kim Nguyen',
      until: new Date('2026-10-20T12:00:00Z'),
      assignment: towerMonday,
      noAssignment: null,
      offline: false,
    });
    await lists.read();
    expect(server.sent.at(-1)).toMatchObject({
      endpoint: 'phoneLists',
      token: 'phone-token',
      session: 'session-1',
    });
    // Neither the session nor the password is ever in the store.
    const kept = JSON.stringify([...store.shelves.values()]);
    expect(kept).not.toContain('session-1');
    expect(kept).not.toContain('5550102');
  });

  it('AC-11-14: answered NOT_SIGNED_IN, the session is dropped and nothing the phone holds goes with it; a session run out by the phone’s clock sends nothing at all', async () => {
    let now = new Date('2026-10-19T12:00:00Z');
    const { store, server, monitor, lists } = await phone(() => now);
    await monitor.signIn('M004128', '5550102');
    await lists.read();
    await store.change([{ shelf: 'records', id: 'collection-101001', value: { number: 101001 } }]);
    const before = [...store.shelves.keys()].sort();
    server.ended.add('session-1');
    expect(await lists.read()).toEqual({ kind: 'refused', code: 'NOT_SIGNED_IN' });
    expect(await monitor.signedIn()).toBeUndefined();
    expect([...store.shelves.keys()].sort()).toEqual(before);
    expect((await lists.held())?.lists.setupVersion).toBe(3);

    server.ended.clear();
    await monitor.signIn('M004128', '5550102');
    now = new Date('2026-10-20T12:00:00Z');
    server.sent.length = 0;
    expect(await lists.read()).toEqual({ kind: 'refused', code: 'NOT_SIGNED_IN' });
    expect(server.sent).toEqual([]);
    expect(await monitor.signedIn()).toBeUndefined();
  });

  it('AC-02-36, AC-11-15: with no assignment, or several, the monitor is signed in all the same and the phone says why; a sign-in refused keeps whoever was signed in', async () => {
    const { server, monitor } = await phone();
    for (const why of ['NONE_THAT_DAY', 'SEVERAL_THAT_DAY'] as const) {
      server.signIn = {
        kind: 'answered',
        answer: {
          token: `session-${why}`,
          userId: kim,
          monitorNumber: 'M004131',
          name: 'Tariq Patel',
          expiresInSeconds: 86_400,
          assignment: null,
          noAssignment: why,
        },
      };
      await monitor.signIn('M004131', '5550105');
      expect(await monitor.signedIn()).toMatchObject({ assignment: null, noAssignment: why });
    }
    expect(english.work.noAssignment).toEqual({
      NONE_THAT_DAY: 'No assignment today: ask your supervisor.',
      SEVERAL_THAT_DAY: 'More than one assignment today: ask your supervisor.',
    });
    server.signIn = { kind: 'refused', code: 'SIGN_IN_REFUSED' };
    expect(await monitor.signIn('M004131', 'wrong')).toEqual({
      kind: 'refused',
      code: 'SIGN_IN_REFUSED',
    });
    expect(await monitor.signedIn()).toMatchObject({ name: 'Tariq Patel' });
    expect(MonitorOnPhone.signInReadable('M004131', '5550105')).toBe(true);
    expect(MonitorOnPhone.signInReadable('  ', '5550105')).toBe(false);
    expect(MonitorOnPhone.signInReadable('M004131', '')).toBe(false);
  });

  it('AC-11-14: signed out, the server is told and the session dropped; with no signal it is dropped all the same', async () => {
    const { keyring, server, monitor } = await phone();
    await monitor.signIn('M004128', '5550102');
    await monitor.signOut();
    expect(server.sent.at(-1)).toMatchObject({
      endpoint: 'signOutOnPhone',
      session: 'session-1',
    });
    expect(keyring.secrets.has('monitorSession')).toBe(false);
    expect(server.ended.has('session-1')).toBe(true);
  });
});

describe('the lists the phone holds', () => {
  it('AC-11-16: read with the assignment, they are kept with when they were read; told there is none, the phone keeps them as they are and says how stale they are', async () => {
    let now = new Date('2026-10-17T13:00:00Z');
    const { server, monitor, lists } = await phone(() => now);
    await monitor.signIn('M004128', '5550102');
    expect(await lists.held()).toBeUndefined();
    const read = await lists.read();
    expect(read).toEqual({
      kind: 'taken',
      held: { assignment: towerMonday, lists: listsOf(3), monitorId: kim, readAt: now },
    });
    const saturday = now;

    // Monday: she signs in again, and the server says she has no assignment.
    now = new Date('2026-10-19T13:00:00Z');
    await monitor.signIn('M004128', '5550102');
    server.lists = { assignment: null, noAssignment: 'NONE_THAT_DAY', lists: null };
    expect(await lists.read()).toEqual({ kind: 'none', why: 'NONE_THAT_DAY' });
    expect(await lists.held()).toEqual({
      assignment: towerMonday,
      lists: listsOf(3),
      monitorId: kim,
      readAt: saturday,
    });
    // The session keeps the assignment taken now: none.
    expect(await monitor.signedIn()).toMatchObject({
      assignment: null,
      noAssignment: 'NONE_THAT_DAY',
    });
    expect(lastSynced((await lists.held())?.readAt, now)).toBe('Last synced: 2 days ago');

    server.lists = 'UNREACHABLE';
    expect(await lists.read()).toEqual({ kind: 'unreachable' });
    expect((await lists.held())?.readAt).toEqual(saturday);
  });

  it('AC-11-16: how stale the lists are is said in the largest whole unit passed', () => {
    const read = new Date('2026-10-19T12:00:00Z');
    const after = (minutes: number) =>
      lastSynced(read, new Date(read.getTime() + minutes * 60_000));
    expect(lastSynced(undefined, read)).toBe('Never synced');
    expect([0, 1, 59, 60, 61 * 23, 24 * 60, 49 * 60].map(after)).toEqual([
      'Last synced: just now',
      'Last synced: 1 minute ago',
      'Last synced: 59 minutes ago',
      'Last synced: 1 hour ago',
      'Last synced: 23 hours ago',
      'Last synced: 1 day ago',
      'Last synced: 2 days ago',
    ]);
  });

  it('AC-11-17: told of a setup version other than the lists’, the phone reads them again; told of the same, it asks nothing', async () => {
    const { server, monitor, lists } = await phone();
    await monitor.signIn('M004128', '5550102');
    expect(await lists.readUnless(3)).toMatchObject({ kind: 'taken' });
    server.sent.length = 0;
    expect(await lists.readUnless(3)).toBe('same');
    expect(server.sent).toEqual([]);
    server.lists = { assignment: towerMonday, noAssignment: null, lists: listsOf(4) };
    expect(await lists.readUnless(4)).toMatchObject({
      kind: 'taken',
      held: { lists: { setupVersion: 4 } },
    });
    expect(named(server.sent)).toEqual(['phoneLists']);
  });

  it('AC-11-18: Kim’s disposals at Marsh Road TDSR offer a disposal and the drop-off log, nothing else', () => {
    expect(worksOf(towerMonday)).toEqual(['disposal', 'dropOff']);
    expect(
      worksOf({
        ...towerMonday,
        fieldEventKinds: ['COLLECTION', 'UNIT_RATE'],
        certifying: true,
        formDocumentTypes: ['INCIDENT', 'SURVEY', 'ROE'],
        site: null,
      }),
    ).toEqual(['collection', 'unitRate', 'certification', 'incident', 'survey', 'roe']);
  });
});
