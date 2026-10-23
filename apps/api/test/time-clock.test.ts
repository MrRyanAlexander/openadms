// The time clock's records through the API (REQ-310; spec/acceptance/02-people-and-devices.md
// AC-02-50, 53…55; BACKLOG 3.7.1; ADR-063, 100, 241, 598): a worker's entries and the lines their
// clock-out carries, taken at sync as the worker's own word; a manager's approval of the day and
// its unlock, by the endpoint recipe; the read the export of hours makes. The real process, in
// this test's own memory, on the test database as `adms_api`: it needs `pnpm local:up`
// after `pnpm installer`, and fails saying so. Each test's work is undone (support/database.ts).
import { randomUUID } from 'node:crypto';

import {
  approveDayEndpoint,
  hoursAnswerSchema,
  listHoursEndpoint,
  syncAnswerRead,
  syncExamples,
  syncPhoneEndpoint,
  unlockDayEndpoint,
  type SyncedClockEntry,
  type SyncedFieldEvent,
  type SyncSent,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SetupVersions } from '../src/setup/setup-versions.ts';
import { Hours } from '../src/time-clock/hours.ts';
import { testSettings, openTestDatabase, type Tx } from './support/database.ts';
import { enrolledPhone, provenWithPasscode } from './support/phones.ts';
import {
  danasEmail,
  long,
  longer,
  luissEmail,
  worldOn,
  type People,
  type Served,
} from './support/served.ts';
import { ask, notSaved, p1Priced, saved, told, type Browser } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openTestDatabase(testSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

// 7:05 pm on Tuesday 13 October in Bayline County (UTC−4): Kim's phone finds signal.
const tuesdayEvening = new Date('2026-10-13T23:05:00Z');
// Kim's day on the phone's clock, Bayline County time.
const at = (time: string, date = '2026-10-13'): string =>
  new Date(`${date}T${time}:00-04:00`).toISOString();

// P1 as Dana prices it; the collection phone, enrolled and proven with the master user at it;
// Kim Nguyen's Tuesday on P1, planned by Dana.
async function kimsTuesday(served: Served, tx: Tx, who: People) {
  served.clock.at = tuesdayEvening;
  const dana = await served.signedIn(danasEmail, long);
  const priced = await p1Priced(served, dana, tx);
  const projectId = priced.project.id;
  const phone = await enrolledPhone(served, tx, 'P1-COL-1');
  const token = await provenWithPasscode(served, phone);
  const assigned = (personId: string) =>
    tx.assignment.create({
      data: {
        personId,
        workDate: new Date('2026-10-13'),
        projectId,
        fieldEventKinds: ['COLLECTION'],
        origin: 'PLANNED',
        madeById: who.dana,
      },
    });
  const assignment = await assigned(who.kim);
  const travel = await tx.clockActivity.findFirstOrThrow({ where: { name: 'Travel' } });
  const collection: SyncedFieldEvent = {
    ...syncExamples.collection,
    id: randomUUID(),
    projectId,
    monitorId: who.kim,
    assignmentId: assignment.id,
    setupVersion: 1,
    formDebrisTypeId: null,
  };
  const entry = (more: Partial<SyncedClockEntry> = {}): SyncedClockEntry => ({
    id: randomUUID(),
    projectId,
    assignmentId: assignment.id,
    workerId: who.kim,
    kind: 'IN',
    at: at('06:00'),
    deviceUtcOffsetMinutes: -240,
    activityLines: [],
    ...more,
  });
  // 06:00 in, a break 13:00–13:30, out at 18:50 with two lines: the collection, pre-filled, and
  // the drive back, picked from the firm's list.
  const day = (): SyncedClockEntry[] => [
    entry(),
    entry({ kind: 'BREAK_START', at: at('13:00') }),
    entry({ kind: 'BREAK_END', at: at('13:30') }),
    entry({
      kind: 'OUT',
      at: at('18:50'),
      activityLines: [
        {
          startedAt: at('09:05'),
          endedAt: at('09:40'),
          fieldEventId: collection.id,
          activityId: null,
          note: null,
        },
        {
          startedAt: at('18:20'),
          endedAt: at('18:50'),
          fieldEventId: null,
          activityId: travel.id,
          note: 'Back to the yard',
        },
      ],
    }),
  ];
  const sync = (records: SyncSent['records']): SyncSent => ({
    clockAt: served.clock.now().toISOString(),
    deviceUtcOffsetMinutes: -240,
    unplannedAssignments: [],
    passcodeUses: [],
    records,
    photos: [],
    lastUsed: [],
    holds: { masterPasscodeVersion: phone.masterPasscodeVersion, listsProjectId: null },
  });
  const synced = async (records: SyncSent['records']) => {
    const sent = sync(records);
    const answer = await served.ask('POST', syncPhoneEndpoint.path, {
      payload: sent,
      bearer: token,
    });
    expect(told(answer)).toEqual([200, undefined]);
    const read = syncAnswerRead(sent, answer.body);
    if (read === null) throw new Error('What came back is no answer to the sync sent.');
    return read.records;
  };
  const clockRecords = (entries: SyncedClockEntry[]): SyncSent['records'] =>
    entries.map((clockEntry) => ({ record: 'CLOCK_ENTRY', clockEntry }));
  return {
    dana,
    projectId,
    phone,
    assignment,
    assigned,
    travel,
    collection,
    entry,
    day,
    synced,
    clockRecords,
  };
}

const approve = (served: Served, signed: Browser, assignmentId: string) =>
  ask(served, signed, approveDayEndpoint, { ids: { assignmentId } });
const unlock = (served: Served, signed: Browser, assignmentId: string, note?: string) =>
  ask(served, signed, unlockDayEndpoint, {
    ids: { assignmentId },
    payload: note === undefined ? {} : { note },
  });
const hours = (served: Served, signed: Browser, projectId: string, query: string) =>
  ask(served, signed, listHoursEndpoint, { ids: { projectId }, query });

describe('a phone is told whether its project has the time clock on (AC-02-49, 50)', () => {
  it('P1 starts with it off, and its phones are offered no activity; switched on, they are told so, with the firm’s activities in their order', async () => {
    await world(async (served, tx, who) => {
      const k = await kimsTuesday(served, tx, who);
      expect((await SetupVersions.shownIn(tx, k.projectId)).timeClock).toEqual({
        enabled: false,
        activities: [],
      });
      await tx.project.update({ where: { id: k.projectId }, data: { timeClockEnabled: true } });
      const activities = await tx.clockActivity.findMany({ orderBy: { position: 'asc' } });
      expect((await SetupVersions.shownIn(tx, k.projectId)).timeClock).toEqual({
        enabled: true,
        activities: activities.map(({ id, name }) => ({ id, name })),
      });
      expect(activities.map(({ name }) => name)).toEqual(['Travel', 'Standby', 'Training']);
    });
  });
});

describe('a worker’s time clock, taken at sync (AC-02-50)', () => {
  it('Kim’s phone sends her clock-in, her break and her clock-out with the day’s two lines: each saved as hers from her phone, in the ledger, queueing nothing; sent again, already saved', async () => {
    await world(async (served, tx, who) => {
      const k = await kimsTuesday(served, tx, who);
      const entries = k.day();
      const answered = await k.synced([
        { record: 'FIELD_EVENT', fieldEvent: k.collection },
        ...k.clockRecords(entries),
      ]);
      expect(answered).toEqual([
        { answer: 'SAVED', id: k.collection.id, notes: [] },
        ...entries.map(({ id }) => ({ answer: 'SAVED', id, notes: [] })),
      ]);
      const kept = await tx.clockEntry.findMany({
        where: { assignmentId: k.assignment.id },
        orderBy: { at: 'asc' },
        include: { activityLines: { orderBy: { position: 'asc' } } },
      });
      expect(kept.map(({ kind, workerId, deviceId }) => [kind, workerId, deviceId])).toEqual(
        ['IN', 'BREAK_START', 'BREAK_END', 'OUT'].map((kind) => [kind, who.kim, k.phone.id]),
      );
      expect(
        kept[3]?.activityLines.map(({ position, fieldEventId, activityId, note }) => [
          position,
          fieldEventId,
          activityId,
          note,
        ]),
      ).toEqual([
        [1, k.collection.id, null, null],
        [2, null, k.travel.id, 'Back to the yard'],
      ]);
      // Written as Kim, from her phone; each in the ledger as a time-clock entry.
      const audited = await tx.auditRecord.findMany({
        where: { tableName: { in: ['clock_entry', 'clock_activity_line'] } },
        select: { actorId: true, deviceId: true, source: true },
      });
      expect(audited).toHaveLength(6);
      expect(
        new Set(
          audited.map(({ actorId, deviceId, source }) => [actorId, deviceId, source].join(' ')),
        ),
      ).toEqual(new Set([`${who.kim} ${k.phone.id} DEVICE`]));
      expect(
        await tx.syncedRecord.count({ where: { recordKind: 'CLOCK_ENTRY', answer: 'SAVED' } }),
      ).toBe(4);
      // Only the collection's ticket was queued: no ticket reads a worker's hours.
      const jobs = await tx.reconciliationJob.findMany({
        where: { projectId: k.projectId },
        select: { tickets: { select: { ticketNumber: true } } },
      });
      expect(jobs.flatMap(({ tickets }) => tickets.map((one) => one.ticketNumber))).toEqual([
        k.collection.ticketNumber,
      ]);
      expect(await k.synced(k.clockRecords(entries))).toEqual(
        entries.map(({ id }) => ({ answer: 'ALREADY_SAVED', id })),
      );
      expect(await tx.clockEntry.count({ where: { assignmentId: k.assignment.id } })).toBe(4);
    });
  });

  // An entry under another person's assignment is refused by the database's own key
  // (packages/db's time-clock.test.ts), and answered as any record naming what the server
  // doesn't have is (sync.test.ts): a refusal of the database's ends a test's piece of work.
  it('what isn’t one is held for a person, never saved: lines on a clock-in', async () => {
    await world(async (served, tx, who) => {
      const k = await kimsTuesday(served, tx, who);
      const [clockIn, , , out] = k.day();
      if (clockIn === undefined || out === undefined) throw new Error('Kim’s day.');
      const linesOnAClockIn = { ...clockIn, activityLines: out.activityLines };
      const answered = await k.synced(k.clockRecords([linesOnAClockIn]));
      expect(answered.map((one) => [one.answer, one.answer === 'NOT_SAVED' && one.reason])).toEqual(
        [['NOT_SAVED', 'NOT_A_RECORD']],
      );
      expect(await tx.heldRecord.count({ where: { deviceId: k.phone.id } })).toBe(1);
      expect(await tx.clockEntry.count({ where: { id: clockIn.id } })).toBe(0);
    });
  });
});

describe('a manager approves the day, and unlocks it (AC-02-53)', () => {
  it('approved by an admin, or a manager/analyst granted “approve hours” beside “view dispatch”; once while in force; never their own day; unlocked with a note, and approved again as a new approval', async () => {
    await world(async (served, tx, who, within) => {
      const k = await kimsTuesday(served, tx, who);
      await k.synced(k.clockRecords(k.day()));
      const luis = await served.signedIn(luissEmail, longer);
      // Luis sees dispatch, and may not approve hours yet: the door refuses him, and so does the
      // service, asked inside its own piece of work.
      expect(told(await approve(served, luis, k.assignment.id))).toEqual([403, 'NOT_ALLOWED']);
      const service = new Hours(within, served.clock);
      for (const outcome of [
        await service.approve(who.luis, k.assignment.id),
        await service.unlock(who.luis, k.assignment.id, 'Not his to unlock'),
      ]) {
        expect(outcome.saved ? null : outcome.refusal.code).toBe('NOT_ALLOWED');
      }
      expect(
        await service.list(who.viewer, k.projectId, {
          from: '2026-10-13',
          to: '2026-10-13',
          limit: 50,
        }),
      ).toEqual({ done: false, code: 'NOT_ALLOWED' });
      await tx.userPermission.create({ data: { userId: who.luis, permission: 'APPROVE_HOURS' } });
      const approved = saved(approveDayEndpoint, await approve(served, luis, k.assignment.id));
      expect(approved.record).toEqual({
        id: approved.record.id,
        assignmentId: k.assignment.id,
        approvedBy: { id: who.luis, name: 'Luis Ortega' },
        approvedAt: tuesdayEvening.toISOString(),
        unlockedBy: null,
        unlockedAt: null,
        unlockNote: null,
      });
      expect(notSaved(await approve(served, k.dana, k.assignment.id))).toEqual([
        'ALREADY_APPROVED',
        'Kim Nguyen’s day of 13-Oct-2026 is already approved. Unlock it to approve it again. Nothing was saved.',
      ]);
      // Luis's own Tuesday: Dana approves it, he never does.
      const hisDay = await k.assigned(who.luis);
      expect(notSaved(await approve(served, luis, hisDay.id))).toEqual([
        'OWN_DAY',
        'Nobody approves their own day: Luis Ortega’s hours of 13-Oct-2026 are approved by another manager or an admin. Nothing was saved.',
      ]);
      expect(told(await approve(served, k.dana, hisDay.id))).toEqual([200, undefined]);
      // An unlock says why.
      expect(told(await unlock(served, luis, k.assignment.id))).toEqual([400, 'BAD_REQUEST']);
      served.clock.at = new Date(tuesdayEvening.getTime() + 60_000);
      const unlocked = saved(
        unlockDayEndpoint,
        await unlock(served, luis, k.assignment.id, 'Clock-out was 19:50, not 18:50'),
      );
      expect([unlocked.record.id, unlocked.record.unlockedBy, unlocked.record.unlockNote]).toEqual([
        approved.record.id,
        { id: who.luis, name: 'Luis Ortega' },
        'Clock-out was 19:50, not 18:50',
      ]);
      const unlockAudited = await tx.auditRecord.findFirstOrThrow({
        where: { tableName: 'day_approval', recordId: approved.record.id, operation: 'UPDATE' },
      });
      expect([unlockAudited.actorId, unlockAudited.reason]).toEqual([
        who.luis,
        'Clock-out was 19:50, not 18:50',
      ]);
      expect(notSaved(await unlock(served, luis, k.assignment.id, 'Again'))).toEqual([
        'NOT_APPROVED',
        'Kim Nguyen’s day of 13-Oct-2026 isn’t approved, so there is nothing to unlock. Nothing was saved.',
      ]);
      const again = saved(approveDayEndpoint, await approve(served, k.dana, k.assignment.id));
      expect(again.record.id).not.toBe(approved.record.id);
      expect(await tx.dayApproval.count({ where: { assignmentId: k.assignment.id } })).toBe(2);
      // An assignment nobody has.
      expect(told(await approve(served, k.dana, randomUUID()))).toEqual([404, 'NOT_FOUND']);
    });
  });
});

describe('the read the export of hours makes (AC-02-50, 53, 55)', () => {
  it('Kim’s Tuesday: her entries and lines as sent, 12 h 20 min worked and 30 min on a break, the field event a line names, the approval in force, and an entry that arrived after it said so', async () => {
    await world(async (served, tx, who) => {
      const k = await kimsTuesday(served, tx, who);
      const entries = k.day();
      // The collection syncs; a second line's field event never reached the server.
      const [clockIn, breakStart, breakEnd, out] = entries;
      if (out === undefined) throw new Error('Kim’s day.');
      const never = randomUUID();
      const clockOut = {
        ...out,
        activityLines: [
          ...out.activityLines,
          {
            startedAt: at('17:00'),
            endedAt: at('17:30'),
            fieldEventId: never,
            activityId: null,
            note: null,
          },
        ],
      };
      await k.synced([
        { record: 'FIELD_EVENT', fieldEvent: k.collection },
        ...k.clockRecords([clockIn, breakStart, breakEnd, clockOut].flatMap((e) => e ?? [])),
      ]);
      // Nothing for a day with no entry, so Luis's is no day of hours.
      await k.assigned(who.luis);
      const first = hoursAnswerSchema.parse(
        (await hours(served, k.dana, k.projectId, '?from=2026-10-12&to=2026-10-14')).body,
      );
      expect(first.next).toBeNull();
      expect(first.days).toHaveLength(1);
      const [kims] = first.days;
      expect(kims?.person).toEqual({ id: who.kim, name: 'Kim Nguyen', monitorId: who.kimsId });
      expect([kims?.workDate, kims?.withdrawn]).toEqual(['2026-10-13', false]);
      expect(kims?.entries.map(({ kind, at: when, phone }) => [kind, when, phone.name])).toEqual([
        ['IN', '2026-10-13T10:00:00.000Z', 'P1-COL-1'],
        ['BREAK_START', '2026-10-13T17:00:00.000Z', 'P1-COL-1'],
        ['BREAK_END', '2026-10-13T17:30:00.000Z', 'P1-COL-1'],
        ['OUT', '2026-10-13T22:50:00.000Z', 'P1-COL-1'],
      ]);
      expect(
        kims?.activityLines.map(({ position, activity, fieldEvent, fieldEventId, note }) => [
          position,
          activity?.name ?? null,
          fieldEvent?.ticketNumber ?? null,
          fieldEventId,
          note,
        ]),
      ).toEqual([
        [1, null, k.collection.ticketNumber, k.collection.id, null],
        [2, 'Travel', null, null, 'Back to the yard'],
        // Kept as the phone named it; the server has nothing saved under it.
        [3, null, null, never, null],
      ]);
      expect(kims?.hours).toEqual({
        workedMinutes: 740,
        breakMinutes: 30,
        otherDays: [],
        stillClockedIn: false,
        unmatchedEntries: 0,
      });
      expect([kims?.approval, kims?.receivedAfterApproval]).toEqual([null, false]);

      // Dana approves; then the phone, offline at 19:30, clocked Kim in again for 20 minutes.
      const approved = saved(approveDayEndpoint, await approve(served, k.dana, k.assignment.id));
      served.clock.at = new Date(tuesdayEvening.getTime() + 60_000);
      await k.synced(
        k.clockRecords([k.entry({ at: at('19:30') }), k.entry({ kind: 'OUT', at: at('19:50') })]),
      );
      const later = hoursAnswerSchema.parse(
        (await hours(served, k.dana, k.projectId, '?from=2026-10-13&to=2026-10-13')).body,
      );
      expect(later.days[0]?.approval?.id).toBe(approved.record.id);
      expect([later.days[0]?.receivedAfterApproval, later.days[0]?.hours.workedMinutes]).toEqual([
        true,
        760,
      ]);
    });
  });

  it('a page at a time; 62 days at most; a project nobody has is not found; never a rate or a pay', async () => {
    await world(async (served, tx, who) => {
      const k = await kimsTuesday(served, tx, who);
      await k.synced(k.clockRecords(k.day()));
      const luisDay = await k.assigned(who.luis);
      // Luis clocks in on the same phone, under his own day.
      const luisIn = k.entry({ assignmentId: luisDay.id, workerId: who.luis });
      await k.synced(k.clockRecords([luisIn]));
      const page = hoursAnswerSchema.parse(
        (await hours(served, k.dana, k.projectId, '?from=2026-10-13&to=2026-10-13&limit=1')).body,
      );
      expect(page.days).toHaveLength(1);
      expect(page.next).toBe(page.days[0]?.assignmentId);
      const rest = hoursAnswerSchema.parse(
        (
          await hours(
            served,
            k.dana,
            k.projectId,
            `?from=2026-10-13&to=2026-10-13&limit=1&after=${String(page.next)}`,
          )
        ).body,
      );
      expect([rest.days.length, rest.next]).toEqual([1, null]);
      expect(new Set([...page.days, ...rest.days].map((one) => one.person.name))).toEqual(
        new Set(['Kim Nguyen', 'Luis Ortega']),
      );
      const luis = rest.days.find((one) => one.person.name === 'Luis Ortega') ?? page.days[0];
      expect(luis?.hours.stillClockedIn).toBe(true);
      expect(
        told(await hours(served, k.dana, k.projectId, '?from=2026-10-01&to=2026-12-31')),
      ).toEqual([400, 'BAD_REQUEST']);
      expect(
        told(await hours(served, k.dana, randomUUID(), '?from=2026-10-13&to=2026-10-13')),
      ).toEqual([404, 'NOT_FOUND']);
      const text = JSON.stringify(page) + JSON.stringify(rest);
      expect(text).not.toMatch(/rate|amount|pay/i);
    });
  });
});
