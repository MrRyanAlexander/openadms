// The master passcode on the phone (src/phone/passcode.ts, passcode-sessions.ts, setup.ts and their
// part of signing-in.ts, monitor.ts and lists.ts; BACKLOG 3.3.2, REQ-312, C122…C124, C126, C171;
// ADR-458, 462, 464, 531, 576, 577): its wrong tries with no signal, a wait from the 5th and, at the
// 10th, the phone locked until the passcode is entered with signal (the user, ADR-577); a switch to
// another monitor, with their own assignment or set up here, the earlier monitor's session and
// proof dropped and their unsent work archived; a move to another site; and the sessions under the
// passcode, as the phone's monitor or temporary, marked and ending as the domain says, offline too.
// Here against the server of phone-world.ts; against the real API, in a real browser,
// e2e/switching.e2e.ts.
import { describe, expect, it } from 'vitest';

import type { SetupMonitor } from '../src/phone/setup.ts';
import {
  ana,
  done,
  hangers,
  heldP1,
  jo,
  kim,
  kimsTowerDay,
  landfill,
  leaners,
  marshRoad,
  named,
  passcode,
  passwords,
  phone,
  towerDay,
  towerLists,
} from './phone-world.ts';

const asMonitor = (person: typeof ana): SetupMonitor => ({
  monitorId: person.id,
  monitorNumber: person.number,
  name: person.name,
});

const later = (clock: { now: Date }, seconds: number) => {
  clock.now = new Date(clock.now.getTime() + seconds * 1000);
};

describe('wrong tries of the master passcode with no signal', () => {
  it('AC-11-83, AC-02-40: each is counted on the phone whatever it was typed for, and kept as a wrong try naming nobody; from the 5th a wait, during which nothing is checked; the passcode right starts the count again', async () => {
    const clock = { now: new Date('2026-10-19T11:00:00Z') };
    const { server, setup, signingIn, passcodeOnPhone, reports } = await heldP1(clock);
    server.signal = false;
    for (let at = 1; at <= 4; at += 1) {
      expect(await setup.opened('not-the-passcode')).toEqual({ kind: 'wrong', waitUntil: null });
    }
    // The fifth, at the sign-in screen's unlock: a wait of the policy's first 30 seconds.
    expect(await signingIn.unlock('not-the-passcode')).toEqual({
      kind: 'wrong',
      waitUntil: new Date('2026-10-19T11:00:30Z'),
    });
    // While it waits, even the passcode is not checked, and nothing more is kept.
    expect(await setup.opened(passcode)).toEqual({
      kind: 'waiting',
      until: new Date('2026-10-19T11:00:30Z'),
    });
    expect((await reports.held()).passcodeUses).toHaveLength(5);
    later(clock, 30);
    const opened = await setup.opened(passcode);
    expect(opened.kind).toBe('offline');
    expect(await passcodeOnPhone.tries()).toEqual({
      wrongInARow: 0,
      waitUntil: null,
      locked: false,
    });
    expect((await reports.held()).passcodeUses.map(({ use, personId }) => [use, personId])).toEqual(
      Array.from({ length: 5 }, () => ['WRONG_TRY', null]),
    );
  });

  it('AC-11-83: the 10th locks the phone: the monitor signed in is signed out, and nothing opens on it, no sign-in, no setup, no unlock of the screen, the passcode included, until it is entered with signal and the server takes it; then both counts start again and the ten wrong tries go at once, by the master user', async () => {
    const clock = { now: new Date('2026-10-19T11:00:00Z') };
    const { server, setup, signingIn, passcodeOnPhone, monitor, reports, keyring, loginList } =
      await heldP1(clock);
    server.signal = false;
    expect(await signingIn.signIn(ana.number, passwords[ana.id] ?? '')).toMatchObject({
      kind: 'signedIn',
    });
    // Three wrong at the screen's own count too, to see the unlock start it again.
    for (let at = 1; at <= 3; at += 1) await signingIn.signIn(ana.number, '0000000');
    for (let at = 1; at <= 9; at += 1) {
      const wrong = await setup.opened('not-the-passcode');
      expect(wrong.kind).toBe('wrong');
      // Each wait waited out (30 seconds doubled from the 5th, at most 15 minutes).
      later(clock, 15 * 60);
    }
    expect(await monitor.signedIn()).toMatchObject({ userId: ana.id });
    expect(await setup.opened('not-the-passcode')).toEqual({ kind: 'locked' });
    expect(await passcodeOnPhone.locked()).toBe(true);
    expect(await monitor.signedIn()).toBeUndefined();
    expect(keyring.secrets.has('offlineSignIn')).toBe(false);

    // Nothing opens on it with no signal, the right passcode and the right password included.
    expect(await signingIn.signIn(ana.number, passwords[ana.id] ?? '')).toEqual({
      kind: 'phoneLocked',
    });
    expect(await signingIn.unlock(passcode)).toEqual({ kind: 'locked' });
    expect(await setup.opened(passcode)).toEqual({ kind: 'locked' });
    expect(await passcodeOnPhone.unlocked(passcode)).toEqual({ kind: 'unreachable' });
    expect((await reports.held()).passcodeUses).toHaveLength(10);

    server.signal = true;
    server.sent.length = 0;
    // A passcode the server doesn't take is its own count's; the phone stays locked.
    expect(await passcodeOnPhone.unlocked('not-the-passcode')).toEqual({ kind: 'wrong' });
    expect(await passcodeOnPhone.locked()).toBe(true);
    server.sent.length = 0;
    expect(await passcodeOnPhone.unlocked(passcode)).toEqual({ kind: 'unlocked' });
    expect(await passcodeOnPhone.locked()).toBe(false);
    expect((await loginList.screen()).wrongInARow).toBe(0);
    expect(named(server.sent)).toEqual([
      'challengePhone',
      'provePhone',
      ...Array.from({ length: 10 }, () => 'reportPasscodeUse'),
    ]);
    expect(server.sent[1]?.json).toMatchObject({ passcode });
    expect(
      server.sent.slice(2).every(({ token, json }) => {
        return token === 'master-user-token' && !JSON.stringify(json).includes(passcode);
      }),
    ).toBe(true);
    expect((await reports.held()).passcodeUses).toEqual([]);
    expect(await signingIn.signIn(ana.number, passwords[ana.id] ?? '')).toMatchObject({
      kind: 'signedIn',
    });
  });

  it('AC-11-83: a phone with signal checks the passcode at the server, which counts it: the phone’s count is never moved by it', async () => {
    const { setup, passcodeOnPhone, reports } = await heldP1();
    expect(await setup.opened('not-the-passcode')).toEqual({
      kind: 'refused',
      code: 'MASTER_PASSCODE_REFUSED',
    });
    expect((await passcodeOnPhone.tries()).wrongInARow).toBe(0);
    expect((await reports.held()).passcodeUses).toEqual([]);
  });
});

describe('switching the phone to another monitor', () => {
  it('AC-02-46, AC-11-27, AC-11-64: with no signal, from Ana to Kim, who has her own assignment: Ana signed out, her session and her offline sign-in’s proof dropped, her unsent work archived under her id and gone from the records; no assignment made, the switch kept as a use naming Kim; Kim, the phone’s monitor now, signs in from the login list on no assignment, Ana no longer', async () => {
    const { server, store, keyring, setup, signingIn, monitor, lists, reports } = await heldP1();
    server.signal = false;
    await signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    expect(keyring.secrets.has('offlineSignIn')).toBe(true);
    await store.change([
      { shelf: 'records', id: 'collection-101001', value: { number: '101001' } },
    ]);

    expect(await setup.isSwitch(kim.id)).toBe(true);
    expect(await setup.isSwitch(ana.id)).toBe(false);
    expect(await setup.holdsAssignmentFor(kim.id)).toBe(false);
    expect(await setup.handedOver(asMonitor(kim), null)).toBe('held');

    expect(await monitor.signedIn()).toBeUndefined();
    expect(keyring.secrets.has('monitorSession')).toBe(false);
    expect(keyring.secrets.has('offlineSignIn')).toBe(false);
    expect(await store.readAll('records')).toEqual([]);
    expect(await store.readAll('archivedQueues')).toEqual([
      { id: `${ana.id}:collection-101001`, value: { number: '101001' } },
    ]);
    const { unplannedAssignments, passcodeUses } = await reports.held();
    expect(unplannedAssignments).toEqual([]);
    expect(passcodeUses).toMatchObject([{ use: 'MONITOR_SWITCH', personId: kim.id }]);
    expect(await lists.phonesMonitor()).toBe(kim.id);
    // The lists held are still Ana's, today's: a switch back to her would make none (AC-11-27).
    expect((await lists.held())?.assignment).toEqual(towerDay);
    expect(await setup.holdsAssignmentFor(ana.id)).toBe(true);

    expect(await signingIn.signIn(ana.number, passwords[ana.id] ?? '')).toEqual({
      kind: 'anotherMonitor',
      name: kim.name,
    });
    const signedIn = await signingIn.signIn(kim.number, passwords[kim.id] ?? '');
    if (signedIn.kind !== 'signedIn') throw new Error(signedIn.kind);
    expect(signedIn.signedIn).toMatchObject({ userId: kim.id, assignment: null, offline: true });

    // At signal: her sign-in first, then the switch, then her lists, which make her the lists'.
    server.signal = true;
    server.sent.length = 0;
    await lists.read();
    expect(done(server.sent)).toEqual([
      'takeOfflineSignInOnPhone',
      'reportPasscodeUse',
      'phoneLists',
    ]);
    expect(await lists.phonesMonitor()).toBe(kim.id);
    expect((await lists.held())?.monitorId).toBe(kim.id);
  });

  it('AC-11-27, AC-02-46: with signal, Ana signed in online is switched to Kim set up here: Ana signed out at the server, the unplanned assignment reported with `occasion: MONITOR_SWITCH` at once by the master user; a setup for the phone’s own monitor stays `SETUP`', async () => {
    const { server, setup, signingIn, monitor, reports } = await heldP1();
    await signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    server.sent.length = 0;
    const made = await setup.made(kimsTowerDay(), passcode);
    expect(made.report).toBe('saved');
    expect(done(server.sent)).toEqual(['signOutOnPhone', 'reportUnplannedAssignment']);
    expect(server.sent[0]?.session).toBe('ana-online');
    const report = server.sent.find(({ endpoint }) => endpoint === 'reportUnplannedAssignment');
    expect(report?.json).toMatchObject({ personId: kim.id, occasion: 'MONITOR_SWITCH' });
    expect(report?.token).toBe('master-user-token');
    expect(await monitor.signedIn()).toBeUndefined();

    // Kim's now; set up again for her, it is no switch.
    server.signal = false;
    await setup.made(kimsTowerDay(), null);
    expect((await reports.held()).unplannedAssignments).toMatchObject([
      { personId: kim.id, occasion: 'SETUP' },
    ]);
  });

  it('AC-11-27: with signal, handed over to Kim with her own assignment: the use goes at once by the master user, and nothing is kept; the phone is Kim’s until it is set up for another (Jo, a switch) or lists are read for another (Ana); the assignment it holds is today’s only on its own day', async () => {
    const clock = { now: new Date('2026-10-19T11:00:00Z') };
    const { server, setup, signingIn, lists, reports } = await heldP1(clock);
    expect(await setup.handedOver(asMonitor(kim), passcode)).toBe('saved');
    const use = server.sent.find(({ endpoint }) => endpoint === 'reportPasscodeUse');
    expect(use?.json).toMatchObject({ use: 'MONITOR_SWITCH', personId: kim.id });
    expect(use?.token).toBe('master-user-token');
    expect(await reports.held()).toEqual({ unplannedAssignments: [], passcodeUses: [] });
    expect(await lists.phonesMonitor()).toBe(kim.id);

    await setup.made({ ...kimsTowerDay(), monitor: asMonitor(jo) }, passcode);
    expect(await lists.phonesMonitor()).toBe(jo.id);
    await setup.handedOver(asMonitor(kim), passcode);
    await signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    await lists.read();
    expect(await lists.phonesMonitor()).toBe(ana.id);

    expect(await setup.holdsAssignmentFor(ana.id)).toBe(true);
    // Tuesday in Bayline County: Monday's assignment is no longer today's.
    clock.now = new Date('2026-10-20T04:00:00Z');
    expect(await setup.holdsAssignmentFor(ana.id)).toBe(false);
  });
});

describe('moving the phone to another site', () => {
  it('AC-02-47, AC-11-27: with no signal, Ana moves from the Landfill’s tower to Marsh Road TDSR: the sites the phone holds; a new unplanned assignment there with her work and unit rate pay items, `SETUP`, taken at once, the Landfill’s quantity lookup let go; at signal it goes after her sign-in and before her lists', async () => {
    const clock = { now: new Date('2026-10-19T15:00:00Z') };
    const { server, setup, signingIn, monitor, lists, reports } = await heldP1(clock);
    server.signal = false;
    expect(await setup.forMove(passcode)).toEqual({ kind: 'notSignedIn' });
    await signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    expect(await setup.forMove('not-the-passcode')).toEqual({ kind: 'wrong', waitUntil: null });
    expect(await setup.forMove(passcode)).toEqual({
      kind: 'offline',
      sites: [marshRoad, landfill],
    });
    const made = await setup.moved(marshRoad, null);
    if (made === undefined) throw new Error('not moved');
    expect(made.assignment).toMatchObject({
      workDate: '2026-10-19',
      project: towerDay.project,
      fieldEventKinds: towerDay.fieldEventKinds,
      site: { id: marshRoad.id, name: marshRoad.name },
    });
    expect(made.assignment.id).not.toBe(towerDay.id);
    expect(made.takenHere).toBe(true);
    expect((await monitor.signedIn())?.assignment).toEqual(made.assignment);
    const held = await lists.held();
    expect(held?.assignment).toEqual(made.assignment);
    expect(held?.monitorId).toBe(ana.id);
    expect(held?.lists.quantityLookup).toEqual([]);
    expect((await reports.held()).unplannedAssignments).toEqual([
      expect.objectContaining({
        id: made.assignment.id,
        personId: ana.id,
        siteId: marshRoad.id,
        occasion: 'SETUP',
        payItemIds: towerLists.payItems.map(({ id }) => id),
      }),
    ]);

    server.signal = true;
    server.sent.length = 0;
    server.taken = made.assignment;
    await lists.read();
    expect(done(server.sent)).toEqual([
      'takeOfflineSignInOnPhone',
      'reportUnplannedAssignment',
      'reportPasscodeUse',
      'phoneLists',
    ]);
  });

  it('AC-02-47: with signal, the sites are the server’s, the passcode checked there, and the move goes at once', async () => {
    const { server, setup, signingIn } = await heldP1();
    await signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    expect(await setup.forMove('not-the-passcode')).toEqual({
      kind: 'refused',
      code: 'MASTER_PASSCODE_REFUSED',
    });
    expect(await setup.forMove(passcode)).toEqual({ kind: 'online', sites: [marshRoad, landfill] });
    const made = await setup.moved(marshRoad, passcode);
    expect(made?.report).toBe('saved');
    const report = server.sent.find(({ endpoint }) => endpoint === 'reportUnplannedAssignment');
    expect(report?.json).toMatchObject({
      siteId: marshRoad.id,
      occasion: 'SETUP',
      payItemIds: [hangers.id, leaners.id, towerLists.payItems[2]?.id],
    });
  });
});

describe('sessions under the master passcode', () => {
  it('AC-11-26, AC-02-42: with no signal, as the phone’s monitor: Ana’s session marked `AS_MONITOR`, on her assignment, lasting her hours; kept as a use naming her; at signal reported first as a sign-in made under the passcode, proven by it, the server’s session marked too', async () => {
    const clock = { now: new Date('2026-10-19T11:00:00Z') };
    const { server, sessions, monitor, lists, reports } = await heldP1(clock);
    server.signal = false;
    expect(await sessions.kindFor(ana.id)).toBe('AS_MONITOR');
    const opened = await sessions.opened(asMonitor(ana), passcode, false);
    if (opened.kind !== 'signedIn') throw new Error(opened.kind);
    expect(opened.signedIn).toMatchObject({
      userId: ana.id,
      assignment: towerDay,
      offline: true,
      masterPasscodeSession: 'AS_MONITOR',
      until: new Date('2026-10-20T11:00:00Z'),
    });
    expect((await reports.held()).passcodeUses).toMatchObject([
      { use: 'SESSION_AS_MONITOR', personId: ana.id },
    ]);

    server.signal = true;
    server.sent.length = 0;
    await lists.read();
    expect(done(server.sent)).toEqual([
      'takeOfflineSignInOnPhone',
      'reportPasscodeUse',
      'phoneLists',
    ]);
    expect(server.offlineSignIns).toMatchObject([
      { kind: 'AS_MONITOR', personId: ana.id, masterPasscodeVersion: 1 },
    ]);
    expect(await monitor.signedIn()).toMatchObject({
      offline: false,
      masterPasscodeSession: 'AS_MONITOR',
    });
  });

  it('AC-11-26, AC-11-64: with no signal, the temporary session for Kim on Ana’s phone: marked `TEMPORARY`, on no assignment, ending at midnight in the project’s time zone by the phone’s clock; the phone passed on to Kim, Ana’s unsent work archived', async () => {
    const clock = { now: new Date('2026-10-19T11:00:00Z') };
    const { server, store, sessions, monitor, lists, reports } = await heldP1(clock);
    server.signal = false;
    await store.change([
      { shelf: 'records', id: 'collection-101002', value: { number: '101002' } },
    ]);
    expect(await sessions.kindFor(kim.id)).toBe('TEMPORARY');
    const opened = await sessions.opened(asMonitor(kim), passcode, false);
    if (opened.kind !== 'signedIn') throw new Error(opened.kind);
    // Midnight on Monday in Bayline County: 04:00 UTC, Eastern Daylight Time.
    expect(opened.signedIn).toMatchObject({
      userId: kim.id,
      assignment: null,
      masterPasscodeSession: 'TEMPORARY',
      until: new Date('2026-10-20T04:00:00Z'),
    });
    expect((await reports.held()).passcodeUses).toMatchObject([
      { use: 'TEMPORARY_SESSION', personId: kim.id },
    ]);
    expect(await lists.phonesMonitor()).toBe(kim.id);
    expect((await store.readAll('archivedQueues')).map(({ id }) => id)).toEqual([
      `${ana.id}:collection-101002`,
    ]);

    clock.now = new Date('2026-10-20T03:59:59Z');
    expect(await monitor.signedIn()).toMatchObject({ userId: kim.id });
    clock.now = new Date('2026-10-20T04:00:00Z');
    expect(await monitor.signedIn()).toBeUndefined();
  });

  it('AC-11-26, AC-02-42: with signal, the server opens it: the temporary session for Kim marked, its token on her requests, no use kept by the phone (the server logged it); a passcode it doesn’t take opens nothing and moves no count of the phone’s', async () => {
    const { server, sessions, monitor, lists, reports, passcodeOnPhone } = await phone();
    expect(await sessions.opened(asMonitor(kim), 'not-the-passcode', true)).toEqual({
      kind: 'refused',
      reply: { kind: 'refused', code: 'MASTER_PASSCODE_REFUSED' },
    });
    expect((await passcodeOnPhone.tries()).wrongInARow).toBe(0);
    const opened = await sessions.opened(asMonitor(kim), passcode, true);
    if (opened.kind !== 'signedIn') throw new Error(opened.kind);
    expect(opened.signedIn).toMatchObject({
      userId: kim.id,
      offline: false,
      masterPasscodeSession: 'TEMPORARY',
      noAssignment: 'NONE_THAT_DAY',
    });
    const asked = server.sent
      .filter(({ endpoint }) => endpoint === 'openPasscodeSessionOnPhone')
      .at(-1);
    expect(asked?.json).toEqual({ personId: kim.id, kind: 'TEMPORARY', passcode });
    server.sent.length = 0;
    await lists.read();
    expect(server.sent.find(({ endpoint }) => endpoint === 'phoneLists')?.session).toBe(
      'kim-temporary',
    );
    expect(await reports.held()).toEqual({ unplannedAssignments: [], passcodeUses: [] });
    expect((await monitor.signedIn())?.masterPasscodeSession).toBe('TEMPORARY');
  });

  it('AC-11-83: a wrong passcode for a session with no signal is one more on the same count, kept as a wrong try', async () => {
    const { server, sessions, passcodeOnPhone, reports } = await heldP1();
    server.signal = false;
    expect(await sessions.opened(asMonitor(ana), 'not-the-passcode', false)).toEqual({
      kind: 'wrong',
      waitUntil: null,
    });
    expect((await passcodeOnPhone.tries()).wrongInARow).toBe(1);
    expect((await reports.held()).passcodeUses).toMatchObject([{ use: 'WRONG_TRY' }]);
  });
});
