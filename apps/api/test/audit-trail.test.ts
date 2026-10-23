// The audit log read, and the jobs set aside, through their endpoints, against the database
// (ARCHITECTURE §5.3, §13; spec/acceptance/10-api-and-sync.md AC-10-111, 112; REQ-407; ADR-097,
// 498, 544, 545; the Phase 2 audit's F5 and F6). OWASP API1, API3; ASVS V8, 16.2. The real
// process, in this test's own memory, on the test database as `adms_api`: it needs
// `pnpm local:up` after `pnpm installer`. Each test's work is undone (support/database.ts).
//
// The API's login writes no line, flag or completed load: a ticket here is a field event made in
// the back office and corrected; what the worker writes, and a job put back by a later run, are
// the stories'.
import {
  correctFieldEventEndpoint,
  listSetAsideJobsEndpoint,
  readRecordHistoryEndpoint,
  readTicketHistoryEndpoint,
  reviewQueueEndpoint,
  viewerTicketHistoryEndpoint,
} from '@open-adms/contracts';
import { type Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testSettings, openTestDatabase } from './support/database.ts';
import { luisHolds, p1WithTickets } from './support/review.ts';
import { danasEmail, long, worldOn } from './support/served.ts';
import { ask, saved, told, viewerSignsIn } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openTestDatabase(testSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);
const note = 'Gate was locked: loaded from the alley.';

describe('a ticket’s history (ADR-544)', () => {
  it('AC-10-111 Luis corrects 101031’s notes; its history, newest first, says what it was and what it is, who changed it and why, and that Dana made it in the back office; a page at a time; a ticket nobody has is not found, and a viewer is refused at the door', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const corrected = await ask(served, luis, correctFieldEventEndpoint, {
        ids: { fieldEventId: p.collection.id },
        payload: { changes: { notes: 'Loaded from the alley.' }, note },
      });
      expect(told(corrected)).toEqual([200, undefined]);
      const ids = { ...p.ids, workflow: 'LOAD', ticketNumber: '101031' };
      const history = saved(
        readTicketHistoryEndpoint,
        await ask(served, luis, readTicketHistoryEndpoint, { ids }),
      );
      const ofTheEvent = history.entries.filter(({ tableName }) => tableName === 'field_event');
      expect(
        ofTheEvent.map((entry) => [
          entry.operation,
          entry.actor?.name,
          entry.source,
          entry.recordId,
        ]),
      ).toEqual([
        ['UPDATE', 'Luis Ortega', 'BACK_OFFICE', p.collection.id],
        ['INSERT', 'Dana Reyes', 'BACK_OFFICE', p.collection.id],
      ]);
      const [change] = ofTheEvent;
      expect(change?.changedFields).toEqual(['notes']);
      expect([
        (change?.priorValue as Record<string, unknown>)['notes'],
        (change?.newValue as Record<string, unknown>)['notes'],
        change?.reason,
      ]).toEqual([null, 'Loaded from the alley.', note]);
      // Newest first by the log's own number, and a page at a time.
      const numbers = history.entries.map(({ id }) => BigInt(id));
      expect([...numbers].sort((a, b) => (a > b ? -1 : 1))).toEqual(numbers);
      const first = saved(
        readTicketHistoryEndpoint,
        await ask(served, luis, readTicketHistoryEndpoint, { ids, query: '?limit=1' }),
      );
      expect(first.entries.map(({ id }) => id)).toEqual([history.entries[0]?.id]);
      expect(first.next).toBe(history.entries[0]?.id);
      const rest = saved(
        readTicketHistoryEndpoint,
        await ask(served, luis, readTicketHistoryEndpoint, {
          ids,
          query: `?after=${first.next ?? ''}&limit=200`,
        }),
      );
      expect(rest.entries.map(({ id }) => id)).toEqual(
        history.entries.slice(1).map(({ id }) => id),
      );
      // A ticket nobody has; and a viewer at the back office's door.
      expect(
        told(
          await ask(served, luis, readTicketHistoryEndpoint, {
            ids: { ...ids, ticketNumber: '101099' },
          }),
        ),
      ).toEqual([404, 'NOT_FOUND']);
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      expect(told(await ask(served, viewer, readTicketHistoryEndpoint, { ids }))).toEqual([
        403,
        'NOT_ALLOWED',
      ]);
    });
  });

  it('AC-10-111 a viewer’s read of a ticket’s history states the viewer to the database (what it shows is the database’s: packages/db and the story p1-viewed); a ticket under which no field event is shown is not found', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      const ids = { ...p.ids, workflow: 'LOAD', ticketNumber: '101099' };
      expect(told(await ask(served, viewer, viewerTicketHistoryEndpoint, { ids }))).toEqual([
        404,
        'NOT_FOUND',
      ]);
      expect(served.viewerStated).toEqual([who.viewer]);
    });
  });
});

describe('a record’s history (ADR-544)', () => {
  it('AC-10-111 read by the area it belongs to: a field event with view review; a person and their sign-in, the log’s security domain, by an admin alone, never a hash', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis);
      const dana = await served.signedIn(danasEmail, long);
      const of = (tableName: string, recordId: string) => ({
        query: `?tableName=${tableName}&recordId=${recordId}`,
      });
      const event = saved(
        readRecordHistoryEndpoint,
        await ask(served, luis, readRecordHistoryEndpoint, of('field_event', p.collection.id)),
      );
      expect(event.entries.map(({ operation }) => operation)).toEqual(['INSERT']);
      // A person, their phone and their sign-in: the log's security domain, an admin's alone.
      for (const [tableName, recordId] of [
        ['user', who.kim],
        [
          'user_credential',
          (await tx.userCredential.findUniqueOrThrow({ where: { userId: who.luis } })).id,
        ],
      ] as const) {
        expect(
          told(await ask(served, luis, readRecordHistoryEndpoint, of(tableName, recordId))),
          tableName,
        ).toEqual([403, 'NOT_ALLOWED']);
      }
      expect(
        saved(
          readRecordHistoryEndpoint,
          await ask(served, dana, readRecordHistoryEndpoint, of('user', who.kim)),
        ).entries.map(({ operation }) => operation),
      ).toEqual(['INSERT']);
      const credential = await tx.userCredential.findUniqueOrThrow({ where: { userId: who.luis } });
      const kept = saved(
        readRecordHistoryEndpoint,
        await ask(served, dana, readRecordHistoryEndpoint, of('user_credential', credential.id)),
      );
      expect(kept.entries.length).toBeGreaterThan(0);
      expect(JSON.stringify(kept)).not.toMatch(/\$argon2id\$/);
    });
  });
});

describe('the jobs set aside (ADR-545)', () => {
  it('AC-10-112 a job that failed too often is listed with when it was set aside, what queued it, its tries and its tickets, each waiting on it; the review queue marks those tickets and counts them, whether or not a flag puts them there; never why it failed', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis);
      const failure = 'connect ECONNREFUSED 10.0.0.9:8002';
      const job = await tx.reconciliationJob.create({
        data: {
          projectId: p.project.id,
          trigger: 'SETUP_CHANGE',
          requestedById: who.dana,
          attempts: 5,
          setAsideAt: new Date('2026-10-15T14:00:00Z'),
          lastError: failure,
        },
      });
      await tx.reconciliationJobTicket.createMany({
        data: [
          { workflow: 'LOAD' as const, ticketNumber: '101031' },
          { workflow: 'UNIT_RATE' as const, ticketNumber: '301001' },
        ].map((ticket) => ({ ...ticket, projectId: p.project.id, reconciliationJobId: job.id })),
      });
      const listed = await ask(served, luis, listSetAsideJobsEndpoint, { ids: p.ids });
      expect(saved(listSetAsideJobsEndpoint, listed)).toEqual({
        jobs: [
          {
            id: job.id,
            trigger: 'SETUP_CHANGE',
            requestedById: who.dana,
            queuedAt: job.queuedAt.toISOString(),
            setAsideAt: '2026-10-15T14:00:00.000Z',
            tries: 5,
            tickets: [
              { workflow: 'LOAD', ticketNumber: '101031', waiting: true },
              { workflow: 'UNIT_RATE', ticketNumber: '301001', waiting: true },
            ],
          },
        ],
        next: null,
      });
      expect(listed.text).not.toContain('ECONNREFUSED');
      const queue = saved(
        reviewQueueEndpoint,
        await ask(served, luis, reviewQueueEndpoint, { ids: p.ids, query: '?workflow=LOAD' }),
      );
      expect([
        queue.waitingOnSetAsideJobs,
        queue.tickets.map(({ ticketNumber, waitingOnSetAsideJob }) => [
          ticketNumber,
          waitingOnSetAsideJob,
        ]),
      ]).toEqual([1, [['101031', true]]]);
    });
  });
});
