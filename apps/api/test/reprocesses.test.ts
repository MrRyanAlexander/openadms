// A reprocess a person asks for with nothing changed, through its endpoint, against the database
// (spec/parts/08-review-and-corrections.md step 4; spec/acceptance/10 AC-10-27, 28, 33; BACKLOG
// 2.7.1 piece 4b2, C146; ADR-418, 420, 498). OWASP ASVS 5.0 V8. The real process, in this test's
// own memory, on the test database as `adms_api`: it needs `pnpm local:up` after `pnpm
// installer`, and fails saying so. Each test's work is undone (support/database.ts).
//
// The API's login writes no status, flag or completed load, and can't set a job aside (that is
// the worker's): so what is asked here is the request, its job, who may ask and every refusal. A
// set-aside job put back, a ticket locked as invoiced left off and the worker's run of the job
// are the stories' (`p1-queued`, `p1-priced`, `p1-reconciled`, `p1-voided`).
import { randomUUID } from 'node:crypto';

import { backOfficeRoles, reprocessTicketsEndpoint } from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Reprocesses } from '../src/review/reprocesses.ts';
import { testSettings, openTestDatabase, type Tx } from './support/database.ts';
import { shippedPolicy } from './support/process.ts';
import { audited, jobsFor, luisHolds, notTaken, p1WithTickets } from './support/review.ts';
import { worldOn } from './support/served.ts';
import { ask, notSaved, plainly, saved, told, viewerSignsIn } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openTestDatabase(testSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const load = { workflow: 'LOAD', ticketNumber: '101031' } as const;
const unitRate = { workflow: 'UNIT_RATE', ticketNumber: '301001' } as const;

// What a reprocess may write and must not: its jobs, and every record a ticket is drawn from.
const written = async (tx: Tx): Promise<number[]> => [
  await tx.reconciliationJob.count(),
  await tx.reconciliationJobTicket.count(),
  await tx.fieldEvent.count(),
  await tx.ticketVoid.count(),
  await tx.flagAcceptance.count(),
];

describe('who may ask', () => {
  it('AC-10-27 a reprocess is part of correcting: open to an admin and to a manager/analyst who holds correct; refused to nobody, to a read-only viewer and to Luis without correct, before anything sent is read', async () => {
    const { access, roles, permission } = reprocessTicketsEndpoint;
    expect([access, roles, permission]).toEqual(['SIGNED_IN', backOfficeRoles, 'CORRECT']);
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      const luis = await luisHolds(served, tx, who.luis, 'RENUMBER', 'VOID', 'ACCEPT_FLAG', 'QC');
      const before = await written(tx);
      const nonsense = { ids: p.ids, payload: { nonsense: true } };
      expect(told(await ask(served, undefined, reprocessTicketsEndpoint, nonsense))).toEqual([
        401,
        'NOT_SIGNED_IN',
      ]);
      for (const browser of [viewer, luis]) {
        expect(told(await ask(served, browser, reprocessTicketsEndpoint, nonsense))).toEqual([
          403,
          'NOT_ALLOWED',
        ]);
      }
      // Past the door, as if it had let him in: the service reads his grants itself.
      const made = [within, served.clock, shippedPolicy] as const;
      for (const person of [who.luis, who.viewer, who.kim]) {
        const refusals = [
          await new Reprocesses(...made).tickets(person, p.project.id, [load]),
          await new Reprocesses(...made).setAside(person, p.project.id, randomUUID()),
        ];
        expect(refusals.map((outcome) => (outcome.saved ? 'saved' : outcome.refusal.code))).toEqual(
          ['NOT_PERMITTED', 'NOT_PERMITTED'],
        );
      }
      expect(await written(tx)).toEqual(before);
      // Granted correct, he is let through to the schema, which refuses the nonsense.
      await tx.userPermission.create({ data: { userId: who.luis, permission: 'CORRECT' } });
      expect(told(await ask(served, luis, reprocessTicketsEndpoint, nonsense))).toEqual([
        400,
        'BAD_REQUEST',
      ]);
    });
  });
});

describe('tickets named', () => {
  it('ADR-498 Luis asks for 101031 and 301001 to be reprocessed, one named twice: one REPROCESS job naming the two, under him, his note beside it in the audit log; no record is changed', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const before = await written(tx);
      const note = 'The routing server is back';
      const answer = await ask(served, luis, reprocessTicketsEndpoint, {
        ids: p.ids,
        payload: { tickets: [load, unitRate, load], note },
      });
      const { record, warnings, queued } = saved(reprocessTicketsEndpoint, answer);
      expect(record).toEqual({
        projectId: p.project.id,
        setAsideJobId: null,
        tickets: [load, unitRate],
        lockedAsInvoiced: [],
        requestedById: who.luis,
      });
      expect(warnings).toEqual([]);
      expect(queued).toMatchObject({ tickets: 2, lockedAsInvoiced: 0 });
      expect(queued?.jobs).toHaveLength(1);
      expect(await jobsFor(tx, p.project.id, who.luis)).toEqual([
        ['REPROCESS', 'LOAD 101031', 'UNIT_RATE 301001'],
      ]);
      // Only the job and its two tickets are new: no field event, void or acceptance.
      const [jobs = 0, tickets = 0, ...rest] = before;
      expect(await written(tx)).toEqual([jobs + 1, tickets + 2, ...rest]);
      expect(await audited(tx, answer, 'reconciliation_job')).toEqual([
        {
          operation: 'INSERT',
          actorId: who.luis,
          source: 'BACK_OFFICE',
          reason: note,
          before: null,
        },
      ]);
      expect(await audited(tx, answer, 'field_event')).toEqual([]);
    });
  });

  it('ADR-498 a number no field event of the project is under, more tickets than one job names at the most (the policy’s JOB_TICKETS_AT_MOST) and a list that is empty, or that names a job as well, are refused; nothing is queued', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const before = await written(tx);
      const send = (payload: object, ids = p.ids) =>
        ask(served, luis, reprocessTicketsEndpoint, { ids, payload });
      expect(
        notSaved(await send({ tickets: [load, { ...load, ticketNumber: '109999' }] })),
      ).toEqual([
        'NOT_A_TICKET',
        'No field event of this project is under 109999: there is no such ticket to reprocess. Nothing was queued.',
      ]);
      // The same number in another workflow is another ticket; on another project, none.
      expect(notSaved(await send({ tickets: [{ ...load, workflow: 'HAUL_OUT' }] }))[0]).toBe(
        'NOT_A_TICKET',
      );
      expect(notSaved(await send({ tickets: [load] }, { projectId: randomUUID() }))[0]).toBe(
        'NOT_A_TICKET',
      );
      const atMost = shippedPolicy.jobTicketsAtMost;
      const many = Array.from({ length: atMost + 1 }, (_, n) => ({
        workflow: 'LOAD',
        ticketNumber: String(500_001 + n),
      }));
      expect(notSaved(await send({ tickets: many }))).toEqual([
        'TOO_MANY_TICKETS',
        `${String(atMost + 1)} tickets were named: a reprocess asks for ${String(atMost)} at the most. Ask for them in parts. Nothing was queued.`,
      ]);
      // Named twice, a ticket counts once.
      expect(notSaved(await send({ tickets: [...many.slice(1), many[1]] }))[0]).toBe(
        'NOT_A_TICKET',
      );
      notTaken(await send({ tickets: [] }));
      notTaken(await send({ tickets: [load], setAsideJobId: randomUUID() }));
      notTaken(await send({ tickets: [{ ...load, splitSuffix: 'A' }] }));
      expect(await written(tx)).toEqual(before);
    });
  });
});

describe('a job set aside, put back by its id', () => {
  it('ADR-498 only a job of this project the worker set aside is put back: a waiting job, another project’s and an id no job has are refused; nothing is queued', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const { queued } = saved(
        reprocessTicketsEndpoint,
        await ask(served, luis, reprocessTicketsEndpoint, {
          ids: p.ids,
          payload: { tickets: [load] },
        }),
      );
      const [waiting = ''] = queued?.jobs ?? [];
      const before = await written(tx);
      const send = (setAsideJobId: string, ids = p.ids) =>
        ask(served, luis, reprocessTicketsEndpoint, { ids, payload: { setAsideJobId } });
      expect(notSaved(await send(waiting))).toEqual([
        'NOT_SET_ASIDE',
        'That job isn’t set aside: it waits for the worker, or the worker has finished it. Nothing was queued.',
      ]);
      expect(notSaved(await send(waiting, { projectId: randomUUID() }))).toEqual([
        'NOT_ON_THIS_PROJECT',
        'That job is another project’s. Nothing was queued.',
      ]);
      const nobodys = await send(randomUUID());
      expect(told(nobodys)).toEqual([404, 'NOT_FOUND']);
      plainly(nobodys);
      notTaken(await send('job 1'));
      expect(await written(tx)).toEqual(before);
    });
  });
});
