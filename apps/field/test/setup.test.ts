// Setting the phone up under the master passcode when its monitor has no assignment
// (src/phone/setup.ts, reports.ts and their part of monitor.ts and lists.ts; BACKLOG 3.3.1,
// REQ-311, 311a, C122, C125; ADR-240, 456, 457, 463, 531, 576): online, what it picks from is the
// server's, a page of monitors at a time, and the master user sends the report at once; with no
// connection, only on the project whose lists the phone holds, against its own check of the
// passcode; the report kept until the server saves it, and sent before anything else of the
// monitor's; each use of the passcode the phone checked kept and reported, never the passcode.
// Here against a server of the test's own (phone-world.ts); against the real API, in a real
// browser, e2e/setup.e2e.ts.
import { describe, expect, it } from 'vitest';

import {
  ana,
  done,
  hangers,
  heldP1,
  jo,
  keptText,
  kim,
  kimsTowerDay,
  landfill,
  leaners,
  marshRoad,
  named,
  p1,
  p2,
  passcode,
  passwords,
  phone,
  towerDay,
  towerLists,
} from './phone-world.ts';

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
    expect(await setup.opened('not-the-passcode')).toEqual({ kind: 'wrong', waitUntil: null });
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
    await setup.made(
      {
        ...kimsTowerDay(),
        monitor: { monitorId: ana.id, monitorNumber: ana.number, name: ana.name },
      },
      null,
    );
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
