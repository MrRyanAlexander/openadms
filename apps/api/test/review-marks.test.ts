// Review's marks through their endpoints, against the database (spec/parts/08 steps 5…7;
// spec/parts/09, invoicing; spec/acceptance/02 AC-02-12; 08 AC-08-05; 09 AC-09-18; 10 AC-10-27,
// 28, 33; BACKLOG 2.4.4; ADR-364…367, 430). OWASP ASVS 5.0 V8. The real process, in this test's
// own memory, on the installation's database as `adms_api`: it needs `pnpm local:up` after `pnpm
// installer`, and fails saying so. Each test's work is undone (support/database.ts).
//
// The API's login writes no status, flag or completed load: those are the worker's. So what is
// asked here is what a ticket whose field events are still PENDING can show: a void and its
// unvoid whole, a QC status on a unit rate ticket whole, and every refusal. A flag accepted, a
// completed load locked as invoiced, put in a batch and unlocked are the same services after the
// worker's run, in the stories `p1-reviewed`, `p1-voided` and `p1-invoiced`.
import { randomUUID } from 'node:crypto';

import {
  acceptFlagEndpoint,
  backOfficeRoles,
  createInvoiceBatchEndpoint,
  endpoints,
  flagAcceptanceRecordSchema,
  invoiceLockRecordSchema,
  lockAsInvoicedEndpoint,
  setLockBatchEndpoint,
  setQcStatusEndpoint,
  unlockInvoicedEndpoint,
  unvoidTicketEndpoint,
  voidTicketEndpoint,
  withdrawAcceptanceEndpoint,
  type Endpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Acceptances } from '../src/review/acceptances.ts';
import { InvoiceLocks } from '../src/review/invoice-locks.ts';
import { QcMarks } from '../src/review/qc-marks.ts';
import { Refusal } from '../src/process/refusal.ts';
import {
  flagAcceptanceRecord,
  invoiceLockRecord,
  reviewed,
} from '../src/review/review-answered.ts';
import { Voids } from '../src/review/voids.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { shippedPolicy } from './support/process.ts';
import { jobsFor, luisHolds, p1WithTickets, reasonNamed } from './support/review.ts';
import { danasEmail, long, longer, luissEmail, worldOn } from './support/served.ts';
import { ask, notSaved, plainly, saved, told, viewerSignsIn } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const marks = [
  [voidTicketEndpoint, 'VOID'],
  [unvoidTicketEndpoint, 'VOID'],
  [acceptFlagEndpoint, 'ACCEPT_FLAG'],
  [withdrawAcceptanceEndpoint, 'ACCEPT_FLAG'],
  [setQcStatusEndpoint, 'QC'],
  [createInvoiceBatchEndpoint, 'LOCK_INVOICED'],
  [lockAsInvoicedEndpoint, 'LOCK_INVOICED'],
  [setLockBatchEndpoint, 'LOCK_INVOICED'],
  [unlockInvoicedEndpoint, 'UNLOCK_INVOICED'],
] as const;

const marksWritten = async (tx: Tx): Promise<number[]> => [
  await tx.ticketVoid.count(),
  await tx.ticketUnvoid.count(),
  await tx.flagAcceptance.count(),
  await tx.qcMark.count(),
  await tx.invoiceBatch.count(),
  await tx.invoiceLock.count(),
];

const voided = { workflow: 'LOAD', ticketNumber: '101031' };

describe('who may ask', () => {
  it('AC-10-27 each of review’s marks is open to an admin and to a manager/analyst who holds its own permission: void, accept flags, QC, lock as invoiced, unlock', () => {
    for (const [served, permission] of marks) {
      const { access, roles, permission: asked } = served as Endpoint;
      expect([access, roles, asked], served.name).toEqual([
        'SIGNED_IN',
        backOfficeRoles,
        permission,
      ]);
    }
    const taking = (permission: string) =>
      endpoints.filter((one) => one.permission === permission).map(({ name }) => name);
    // A held record, and a file set aside, closed as never to be saved (held.test.ts; ADR-526).
    expect(taking('VOID')).toEqual([
      'voidTicket',
      'unvoidTicket',
      'closeHeldRecord',
      'closeSetAsideFile',
    ]);
    // An acceptance taken back (ADR-534 (8)).
    expect(taking('ACCEPT_FLAG')).toEqual(['acceptFlag', 'withdrawAcceptance']);
    // Signatures on file are marked at QC (certifications.test.ts; ADR-433).
    // Many at once, each its own act (ADR-535 (4)).
    expect(taking('QC')).toEqual(['setQcStatus', 'setQcStatuses', 'markSignaturesOnFile']);
    // A batch renamed, and many locked at once (ADR-535 (4)).
    expect(taking('LOCK_INVOICED')).toEqual([
      'createInvoiceBatch',
      'renameInvoiceBatch',
      'lockAsInvoiced',
      'lockSeveralAsInvoiced',
      'setLockBatch',
    ]);
    expect(taking('UNLOCK_INVOICED')).toEqual(['unlockInvoiced']);
  });

  it('AC-10-27 each is refused to nobody, to a read-only viewer and to a manager/analyst who holds every permission but its own, before anything sent is read; nothing is written', async () => {
    await world(async (served, tx, who, within) => {
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      const before = await marksWritten(tx);
      // A body no schema would take: the door answers first.
      const nonsense = { payload: { nonsense: true } };
      for (const [endpoint] of marks) {
        expect(told(await ask(served, undefined, endpoint, nonsense)), endpoint.name).toEqual([
          401,
          'NOT_SIGNED_IN',
        ]);
        expect(told(await ask(served, viewer, endpoint, nonsense)), endpoint.name).toEqual([
          403,
          'NOT_ALLOWED',
        ]);
      }
      const every = [
        'SETUP',
        'DISPATCH',
        'CORRECT',
        'RENUMBER',
        ...new Set(marks.map(([, p]) => p)),
      ];
      const grants = new Map<string, string>();
      for (const permission of every) {
        const grant = await tx.userPermission.create({
          data: { userId: who.luis, permission: permission as 'VOID' },
        });
        grants.set(permission, grant.id);
      }
      const luis = await served.signedIn(luissEmail, longer);
      for (const [endpoint, permission] of marks) {
        // Dana takes this one away: his very next request is refused, with the same session.
        await tx.userPermission.update({
          where: { id: grants.get(permission) ?? '' },
          data: { archivedAt: new Date() },
        });
        expect(told(await ask(served, luis, endpoint, nonsense)), endpoint.name).toEqual([
          403,
          'NOT_ALLOWED',
        ]);
        await tx.userPermission.update({
          where: { id: grants.get(permission) ?? '' },
          data: { archivedAt: null },
        });
        // Given back, the door lets him through to the schema, which refuses the nonsense.
        expect(told(await ask(served, luis, endpoint, nonsense)), endpoint.name).toEqual([
          400,
          'BAD_REQUEST',
        ]);
      }
      expect(await marksWritten(tx)).toEqual(before);
    });
  });

  it('AC-10-28, AC-02-12 Luis holds correct and not void: his void of 101031 is refused at the door, and the service refuses him again inside its own piece of work; granted void, it is saved; the grant taken away, his next void is refused', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const payload = { ...voided, reasonId: await reasonNamed(tx, 'Work never happened') };
      const refused = await ask(served, luis, voidTicketEndpoint, { ids: p.ids, payload });
      expect(told(refused)).toEqual([403, 'NOT_ALLOWED']);
      // The door says a code and the request's id, and nothing of who holds what.
      expect(Object.keys(refused.body as object).sort()).toEqual(['code', 'requestId']);
      // Past the door, as if it had let him in: the service reads his grants itself.
      const service = await new Voids(within, served.clock, shippedPolicy).ticket(
        who.luis,
        p.project.id,
        { workflow: 'LOAD', ticketNumber: '101031' },
        payload.reasonId,
      );
      expect(service).toEqual({
        saved: false,
        refusal: {
          code: 'NOT_PERMITTED',
          message:
            'Luis Ortega may not void or unvoid a ticket: it takes an admin, or a manager/analyst granted "void". Nothing was changed.',
        },
      });
      expect(await tx.ticketVoid.count()).toBe(0);

      const grant = await tx.userPermission.create({
        data: { userId: who.luis, permission: 'VOID' },
      });
      saved(
        voidTicketEndpoint,
        await ask(served, luis, voidTicketEndpoint, { ids: p.ids, payload }),
      );
      await tx.userPermission.update({ where: { id: grant.id }, data: { archivedAt: new Date() } });
      expect(
        told(await ask(served, luis, unvoidTicketEndpoint, { ids: p.ids, payload: { ...voided } })),
      ).toEqual([403, 'NOT_ALLOWED']);
      expect(await marksWritten(tx)).toEqual([1, 0, 0, 0, 0, 0]);
    });
  });

  it('AC-09-18 unlocking is a grant of its own: Luis holds lock as invoiced and not unlock, and is refused at the door and again by the service', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'LOCK_INVOICED');
      const ticket = { unitRateTicketId: p.unitRate.id };
      expect(
        told(await ask(served, luis, unlockInvoicedEndpoint, { payload: { ticket } })),
      ).toEqual([403, 'NOT_ALLOWED']);
      const service = await new InvoiceLocks(within, served.clock, shippedPolicy).unlock(
        who.luis,
        ticket,
      );
      expect(service).toMatchObject({ saved: false, refusal: { code: 'NOT_PERMITTED' } });
      // What he does hold lets him through to the rule, which says the ticket isn't locked.
      expect(
        notSaved(
          await ask(served, luis, setLockBatchEndpoint, {
            payload: { ticket, invoiceBatchId: null },
          }),
        ),
      ).toEqual(['NOT_LOCKED', 'Ticket 301001 isn’t locked as invoiced. Nothing was changed.']);
    });
  });

  it('every service asks again inside its own piece of work (ADR-364): called as a manager/analyst without the grant, a read-only viewer or a monitor, it writes nothing and says who may', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const made = [within, served.clock, shippedPolicy] as const;
      const reasonId = await reasonNamed(tx, 'Photos confirm');
      const ticket = { unitRateTicketId: p.unitRate.id };
      const before = await marksWritten(tx);
      for (const person of [who.luis, who.viewer, who.kim]) {
        const refusals = [
          await new Voids(...made).lift(person, p.project.id, { ...p.unitRate }),
          await new Acceptances(...made).flag(person, randomUUID(), reasonId),
          await new QcMarks(...made).set(person, ticket, 'QC_APPROVED'),
          await new InvoiceLocks(...made).batch(
            person,
            p.project.id,
            'Bayline ROW, week of 12 Oct',
          ),
          await new InvoiceLocks(...made).lock(person, ticket),
          await new InvoiceLocks(...made).intoBatch(person, ticket, null),
        ];
        expect(refusals.map((outcome) => (outcome.saved ? 'saved' : outcome.refusal.code))).toEqual(
          refusals.map(() => 'NOT_PERMITTED'),
        );
      }
      expect(await marksWritten(tx)).toEqual(before);
    });
  });
});

describe('what a refusal by the service is answered', () => {
  // A request as the answer reads one: its log.
  const logged: object[] = [];
  const request = { log: { info: (said: object) => logged.push(said) } } as never;
  const refusedWith = (code: string, message: string): Refusal | undefined => {
    try {
      reviewed(request, { saved: false, refusal: { code, message } }, () => ({}), 'Done.');
    } catch (thrown) {
      if (thrown instanceof Refusal) return thrown;
    }
    return undefined;
  };

  it('AC-10-28 a grant taken away between the door and the service is answered as the door would have: 403 NOT_ALLOWED, with no name; a rule’s refusal is 422 NOT_SAVED with the rule’s code and words; the log holds the code alone', () => {
    const notPermitted = refusedWith(
      'NOT_PERMITTED',
      'Luis Ortega may not void or unvoid a ticket.',
    );
    expect([
      notPermitted?.code,
      notPermitted?.getStatus(),
      notPermitted?.said,
      notPermitted?.reason,
    ]).toEqual(['NOT_ALLOWED', 403, undefined, undefined]);
    const rule = refusedWith('ALREADY_VOID', 'Ticket 101031 is already void. Nothing was saved.');
    expect([rule?.code, rule?.getStatus(), rule?.said, rule?.reason]).toEqual([
      'NOT_SAVED',
      422,
      'Ticket 101031 is already void. Nothing was saved.',
      'ALREADY_VOID',
    ]);
    expect(logged).toEqual([{ why: 'NOT_PERMITTED' }, { why: 'ALREADY_VOID' }]);
  });
});

describe('a void and its unvoid', () => {
  it('Luis voids 101031 with a reason from the firm’s list and his own note: the void is a record of its own under him, the job that works the ticket again is queued in the same request, and no field event is touched; voided twice, a number nobody has and a reason from another list are refused in plain words', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'VOID');
      const reasonId = await reasonNamed(tx, 'Work never happened');
      const send = (payload: object) =>
        ask(served, luis, voidTicketEndpoint, { ids: p.ids, payload });

      expect(
        notSaved(await send({ ...voided, reasonId: await reasonNamed(tx, 'Photos confirm') })),
      ).toEqual([
        'REASON_NOT_OFFERED',
        '"Photos confirm" isn’t a reason the firm offers for voiding a ticket. Nothing was saved.',
      ]);
      expect(notSaved(await send({ workflow: 'LOAD', ticketNumber: '109999', reasonId }))).toEqual([
        'NOT_A_TICKET',
        'No field event of this project is under 109999: there is no such ticket to void. Nothing was saved.',
      ]);
      // The same number in another workflow is another ticket.
      expect(
        notSaved(await send({ workflow: 'HAUL_OUT', ticketNumber: '101031', reasonId }))[0],
      ).toBe('NOT_A_TICKET');
      expect(told(await send({ ...voided, ticketNumber: ' ', reasonId }))).toEqual([
        400,
        'BAD_REQUEST',
      ]);
      expect(told(await send({ ...voided, reasonId, splitSuffix: 'A' }))).toEqual([
        400,
        'BAD_REQUEST',
      ]);
      const noReason = await send({ ...voided, reasonId: randomUUID() });
      expect(told(noReason)).toEqual([404, 'NOT_FOUND']);
      plainly(noReason);
      expect(await tx.ticketVoid.count()).toBe(0);

      const note = 'No truck at 14 Elm St at 14:10';
      const answer = await send({ ...voided, reasonId, note });
      const { record, queued } = saved(voidTicketEndpoint, answer);
      expect(record).toMatchObject({
        projectId: p.project.id,
        ...voided,
        reasonId,
        note,
        voidedById: who.luis,
        liftedAt: null,
      });
      expect(queued).toMatchObject({ tickets: 1, lockedAsInvoiced: 0 });
      expect(await jobsFor(tx, p.project.id, who.luis)).toEqual([['CORRECTION', 'LOAD 101031']]);
      const audited = await tx.auditRecord.findMany({
        where: { requestId: answer.requestId },
        orderBy: { id: 'asc' },
      });
      expect(
        audited.map(({ tableName, operation, actorId, source, reason }) => [
          tableName,
          operation,
          actorId === who.luis,
          source,
          reason,
        ]),
      ).toEqual([
        ['ticket_void', 'INSERT', true, 'BACK_OFFICE', note],
        ['reconciliation_job', 'INSERT', true, 'BACK_OFFICE', note],
        ['reconciliation_job_ticket', 'INSERT', true, 'BACK_OFFICE', note],
      ]);
      // The status is the worker's to write, in the run of that job.
      expect(
        (await tx.fieldEvent.findUniqueOrThrow({ where: { id: p.collection.id } })).status,
      ).toBe('PENDING');
      expect(served.lines.join('')).not.toContain(note);

      expect(notSaved(await send({ ...voided, reasonId }))).toEqual([
        'ALREADY_VOID',
        'Ticket 101031 is already void. Nothing was saved.',
      ]);
      expect(await tx.ticketVoid.count()).toBe(1);
    });
  });

  it('Luis unvoids it: the unvoid is a record of its own, the void is kept and marked lifted under him, and the ticket is queued again; a ticket that isn’t void is refused', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'VOID');
      const send = (payload: object) =>
        ask(served, luis, unvoidTicketEndpoint, { ids: p.ids, payload });
      expect(notSaved(await send({ ...voided }))).toEqual([
        'NOT_VOID',
        'Ticket 101031 isn’t void. Nothing was changed.',
      ]);
      const made = saved(
        voidTicketEndpoint,
        await ask(served, luis, voidTicketEndpoint, {
          ids: p.ids,
          payload: { ...voided, reasonId: await reasonNamed(tx, 'Duplicate ticket') },
        }),
      ).record;
      const note = 'The driver’s receipt shows the load';
      const { record, queued } = saved(unvoidTicketEndpoint, await send({ ...voided, note }));
      expect(record).toMatchObject({
        projectId: p.project.id,
        ...voided,
        note,
        unvoidedById: who.luis,
      });
      expect(queued).toMatchObject({ tickets: 1 });
      expect(await tx.ticketVoid.findUniqueOrThrow({ where: { id: made.id } })).toMatchObject({
        liftedById: who.luis,
        liftNote: note,
        reasonId: made.reasonId,
      });
      expect(await jobsFor(tx, p.project.id, who.luis)).toEqual([
        ['CORRECTION', 'LOAD 101031'],
        ['CORRECTION', 'LOAD 101031'],
      ]);
      expect(notSaved(await send({ ...voided }))[0]).toBe('NOT_VOID');
      expect(await marksWritten(tx)).toEqual([1, 1, 0, 0, 0, 0]);
    });
  });
});

describe('a flag’s acceptance', () => {
  it('a reason the firm doesn’t offer for accepting a flag is refused in plain words, and a flag nobody raised is not found; nothing is written', async () => {
    await world(async (served, tx, who) => {
      const luis = await luisHolds(served, tx, who.luis, 'ACCEPT_FLAG');
      const send = (payload: object) =>
        ask(served, luis, acceptFlagEndpoint, { ids: { flagId: randomUUID() }, payload });
      expect(notSaved(await send({ reasonId: await reasonNamed(tx, 'Device lost') }))).toEqual([
        'REASON_NOT_OFFERED',
        '"Device lost" isn’t a reason the firm offers for accepting a flag. Nothing was saved.',
      ]);
      expect(told(await send({}))).toEqual([400, 'BAD_REQUEST']);
      const none = await send({ reasonId: await reasonNamed(tx, 'Photos confirm'), note: 'Seen' });
      expect(told(none)).toEqual([404, 'NOT_FOUND']);
      expect(plainly(none)).toBe('Nothing with that id is on record.');
      expect(await tx.flagAcceptance.count()).toBe(0);
    });
  });

  it('AC-08-70 an acceptance is taken back with a note, which is required and never blank; one nobody made is not found; nothing is written (the flag standing again on the next run is the story p1-voided’s)', async () => {
    await world(async (served, tx, who) => {
      const luis = await luisHolds(served, tx, who.luis, 'ACCEPT_FLAG');
      const send = (payload: object) =>
        ask(served, luis, withdrawAcceptanceEndpoint, {
          ids: { flagAcceptanceId: randomUUID() },
          payload,
        });
      expect(told(await send({}))).toEqual([400, 'BAD_REQUEST']);
      expect(plainly(await send({ note: '  ' }))).toBe('Not taken: note in the body is blank.');
      const none = await send({ note: 'The photos show a 90% load after all' });
      expect(told(none)).toEqual([404, 'NOT_FOUND']);
      expect(plainly(none)).toBe('Nothing with that id is on record.');
      expect(await tx.flagAcceptance.count({ where: { withdrawnAt: { not: null } } })).toBe(0);
    });
  });

  it('an acceptance and a lock are answered as the contracts say them: a unit rate ticket by its field event, times as text, no amount', () => {
    const at = new Date('2026-10-16T14:05:00Z');
    const [projectId, flagId, reasonId, luis, fieldEventId, lockId] = [1, 2, 3, 4, 5, 6].map(() =>
      randomUUID(),
    );
    expect(
      flagAcceptanceRecordSchema.parse(
        flagAcceptanceRecord({
          id: lockId ?? '',
          projectId: projectId ?? '',
          flagId: flagId ?? '',
          reasonId: reasonId ?? '',
          note: null,
          acceptedById: luis ?? '',
          acceptedAt: at,
          withdrawnById: null,
          withdrawnAt: null,
          withdrawNote: null,
        }),
      ),
    ).toMatchObject({ flagId, acceptedAt: '2026-10-16T14:05:00.000Z', withdrawnAt: null });
    expect(
      invoiceLockRecordSchema.parse(
        invoiceLockRecord({
          id: lockId ?? '',
          projectId: projectId ?? '',
          completedLoadId: null,
          completedHaulOutId: null,
          fieldEventId: fieldEventId ?? '',
          fieldEventKind: 'UNIT_RATE',
          invoiceBatchId: null,
          lockedById: luis ?? '',
          lockedAt: at,
          unlockedById: luis ?? '',
          unlockedAt: at,
          unlockNote: 'Rate corrected',
        }),
      ),
    ).toEqual({
      id: lockId,
      projectId,
      completedLoadId: null,
      completedHaulOutId: null,
      unitRateTicketId: fieldEventId,
      invoiceBatchId: null,
      lockedById: luis,
      lockedAt: '2026-10-16T14:05:00.000Z',
      unlockedById: luis,
      unlockedAt: '2026-10-16T14:05:00.000Z',
      unlockNote: 'Rate corrected',
    });
  });
});

describe('a QC status', () => {
  it('Luis sets unit rate ticket 301001 to QC Issues and then QC Approved: one mark, changed, the status before in the audit log under him; nothing on the ticket changes and nothing is queued; a load’s single field event is refused in plain words', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'QC');
      const send = (payload: object) => ask(served, luis, setQcStatusEndpoint, { payload });
      const record = { unitRateTicketId: p.unitRate.id };

      expect(
        notSaved(
          await send({ record: { unitRateTicketId: p.collection.id }, status: 'QC_APPROVED' }),
        ),
      ).toEqual([
        'NOT_QCD_ALONE',
        'A collection is never QC’d or locked on its own: its completed load or haul-out is, once the ticket is whole. Nothing was saved.',
      ]);
      for (const refused of [
        { record, status: 'APPROVED' },
        { record: { ...record, roeId: randomUUID() }, status: 'QC_APPROVED' },
        { record: { fieldEventId: p.unitRate.id }, status: 'QC_APPROVED' },
        { status: 'QC_APPROVED' },
      ]) {
        expect(told(await send(refused)), JSON.stringify(refused)).toEqual([400, 'BAD_REQUEST']);
      }
      expect(
        told(await send({ record: { completedLoadId: randomUUID() }, status: 'QC_APPROVED' })),
      ).toEqual([404, 'NOT_FOUND']);
      expect(await tx.qcMark.count()).toBe(0);

      const issues = saved(
        setQcStatusEndpoint,
        await send({ record, status: 'QC_ISSUES', note: 'Photo is of another tree' }),
      );
      expect(issues.record).toMatchObject({
        projectId: p.project.id,
        unitRateTicketId: p.unitRate.id,
        completedLoadId: null,
        certificationId: null,
        status: 'QC_ISSUES',
        setById: who.luis,
        note: 'Photo is of another tree',
      });
      expect(issues.queued).toBeUndefined();
      const approved = await send({ record, status: 'QC_APPROVED' });
      expect(saved(setQcStatusEndpoint, approved).record).toMatchObject({
        id: issues.record.id,
        status: 'QC_APPROVED',
        note: null,
      });
      const [change] = await tx.auditRecord.findMany({
        where: { requestId: approved.requestId, tableName: 'qc_mark' },
      });
      expect([
        change?.operation,
        change?.actorId === who.luis,
        (change?.priorValue as { status?: string } | null)?.status,
      ]).toEqual(['UPDATE', true, 'QC_ISSUES']);
      expect(await jobsFor(tx, p.project.id, who.luis)).toEqual([]);
      expect((await tx.fieldEvent.findUniqueOrThrow({ where: { id: p.unitRate.id } })).status).toBe(
        'PENDING',
      );
      expect(await marksWritten(tx)).toEqual([0, 0, 0, 1, 0, 0]);
    });
  });
});

describe('locking as invoiced', () => {
  it('a ticket that is QC Approved and not yet COMPLETED isn’t locked; one that isn’t locked is neither put in a batch nor unlocked: each said in plain words', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'QC', 'LOCK_INVOICED', 'UNLOCK_INVOICED');
      const ticket = { unitRateTicketId: p.unitRate.id };
      saved(
        setQcStatusEndpoint,
        await ask(served, luis, setQcStatusEndpoint, {
          payload: { record: ticket, status: 'QC_APPROVED' },
        }),
      );
      const batch = saved(
        createInvoiceBatchEndpoint,
        await ask(served, luis, createInvoiceBatchEndpoint, {
          ids: p.ids,
          payload: { name: '  Bayline ROW, week of 12 Oct ' },
        }),
      ).record;
      expect(batch).toMatchObject({
        projectId: p.project.id,
        name: 'Bayline ROW, week of 12 Oct',
        createdById: who.luis,
      });
      expect(
        notSaved(
          await ask(served, luis, lockAsInvoicedEndpoint, {
            payload: { ticket, invoiceBatchId: batch.id },
          }),
        ),
      ).toEqual(['NOT_COMPLETED', 'Ticket 301001 isn’t completed yet. Nothing was locked.']);
      expect(
        notSaved(
          await ask(served, luis, lockAsInvoicedEndpoint, {
            payload: { ticket: { unitRateTicketId: p.collection.id } },
          }),
        )[0],
      ).toBe('NOT_QCD_ALONE');
      expect(
        notSaved(
          await ask(served, luis, setLockBatchEndpoint, {
            payload: { ticket, invoiceBatchId: batch.id },
          }),
        ),
      ).toEqual(['NOT_LOCKED', 'Ticket 301001 isn’t locked as invoiced. Nothing was changed.']);
      expect(
        notSaved(
          await ask(served, luis, unlockInvoicedEndpoint, {
            payload: { ticket, note: 'Rate corrected' },
          }),
        ),
      ).toEqual(['NOT_LOCKED', 'Ticket 301001 isn’t locked as invoiced. Nothing was changed.']);
      for (const [endpoint, payload] of [
        [lockAsInvoicedEndpoint, { ticket: { ...ticket, completedLoadId: randomUUID() } }],
        [lockAsInvoicedEndpoint, { ticket: { certificationId: randomUUID() } }],
        [setLockBatchEndpoint, { ticket }],
        [unlockInvoicedEndpoint, { ticket, note: '' }],
        [createInvoiceBatchEndpoint, { name: ' ' }],
      ] as const) {
        expect(
          told(await ask(served, luis, endpoint, { ids: p.ids, payload })),
          endpoint.name,
        ).toEqual([400, 'BAD_REQUEST']);
      }
      expect(await marksWritten(tx)).toEqual([0, 0, 0, 1, 1, 0]);
      expect(await jobsFor(tx, p.project.id, who.luis)).toEqual([]);
    });
  });

  it('AC-10-33 a batch’s name is used once on a project: the second is refused in plain words', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const send = () =>
        ask(served, p.dana, createInvoiceBatchEndpoint, {
          ids: p.ids,
          payload: { name: 'Bayline ROW, week of 12 Oct' },
        });
      saved(createInvoiceBatchEndpoint, await send());
      // The database's own key answers: this test's last request.
      const second = await send();
      expect(notSaved(second)).toEqual([
        'BATCH_NAME_USED',
        'This project already has an invoice batch named "Bayline ROW, week of 12 Oct". Nothing was saved.',
      ]);
      expect(second.text).not.toMatch(/constraint|prisma|violates|_key/i);
    });
  });

  it('AC-10-33 a batch for a project that isn’t on record is the database’s refusal, told plainly', async () => {
    await world(async (served) => {
      const dana = await served.signedIn(danasEmail, long);
      const answer = await ask(served, dana, createInvoiceBatchEndpoint, {
        payload: { name: 'Bayline ROW, week of 12 Oct' },
      });
      expect(told(answer)).toEqual([422, 'UNKNOWN_RECORD']);
      expect(plainly(answer)).toBe(
        'Not saved: the project an invoice batch is for isn’t on record.',
      );
    });
  });
});
