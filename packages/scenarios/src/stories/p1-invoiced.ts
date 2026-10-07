// The thirteenth story (BACKLOG 1.8.5; ADR-367; spec/acceptance/08-review-and-corrections.md
// AC-08-05, 07, 54, 57, 58, 60…62; spec/acceptance/09-invoice-deliver-closeout.md AC-09-01…07,
// 09, 10, 13…15, 17, 19…22, 29): QC, the lock as invoiced, a named batch, the unlock, and a
// project closed. P1's Monday and Tuesday are the story `p1-field-days`' own, priced as the
// story `p1-priced` prices them; Wednesday adds `adms-exceptions`' Scenario B.
//
// Every QC mark, lock, batch and unlock here is made through `apps/api`'s review services, as
// Luis Ortega by his grants, and the unlock as Dana Reyes, the admin (the mission grants Luis no
// unlock). A QC mark and a lock ask for no run; an unlock answers the run to ask the worker
// for, and the story asks it.
//
// Not here: P2's split load 102001 and its ROEs and surveys under QC, and the mission's batch
// of thirteen (1.9.1).
import {
  Acceptances,
  Corrections,
  InvoiceLocks,
  ProjectSetup,
  QcMarks,
  Voids,
  type Outcome,
  type Reviewed,
} from '@open-adms/api';
import { systemActorId, type FieldEventKind } from '@open-adms/db';
import { MapServers, Mileages, Reconciliation, type RunOutcome } from '@open-adms/worker';

import { utcOffsetMinutes } from '../clock.ts';
import type { PhoneRecord } from '../device.ts';
import { uuidv7 } from '../ids.ts';
import { localMapServers } from '../map-servers.ts';
import type { Story } from '../runner.ts';
import {
  certifyP1,
  loadP1Map,
  p1FieldDaysHeld,
  P1Syncs,
  saved,
  setUpP1Pricing,
} from './p1-office.ts';
import { p1TimeZone as timeZone } from './p1.ts';

const on = (date: string, time: string): string => `2026-10-${date}T${time}:00-04:00`;

// What a run did with each ticket, as lines a person reads.
const told = (outcome: RunOutcome): string[] =>
  outcome.ran
    ? outcome.tickets.map((ticket) =>
        [
          ticket.ticketNumber,
          ticket.status,
          ...(ticket.error === null ? [] : [`error: ${ticket.error}`]),
          ...ticket.flags,
        ].join(' · '),
      )
    : [outcome.message];

const of = (outcome: RunOutcome, ...ticketNumbers: string[]): string[] =>
  told(outcome).filter((line) => ticketNumbers.some((number) => line.startsWith(number)));

const isSame = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export const p1Invoiced: Story = {
  name: 'p1-invoiced',
  title:
    'QC, the lock and batches: QC is a person’s mark that changes nothing and reruns nothing; only a QC Approved, COMPLETED ticket locks as invoiced, optionally in a named batch; a locked ticket doesn’t change until an audited unlock; a closed project loses nothing',
  timeZone,
  start: on('08', '08:00'),

  async run(story) {
    const { api, worker, clock } = story;
    const office = await p1FieldDaysHeld(story);
    const { held, dana, luis, p1, coastline } = office;

    // ------------------------------------------------------------------------------------------
    story.at(on('08', '08:40'), 'Thursday: Dana loads P1’s map and enters its pay items and rules');
    await loadP1Map(story, office);
    const pricing = await setUpP1Pricing(story, office);
    story.at(
      on('10', '09:10'),
      'Saturday: Sam Grant certifies P1’s three containers and two crews',
    );
    await certifyP1(story, office);

    const settings = { crewItemHoursLimit: story.policy.crewDayHours, longestRunMs: 600_000 };
    const reconciliation = new Reconciliation(
      worker,
      clock,
      settings,
      new Mileages(new MapServers(localMapServers())),
    );
    const qc = new QcMarks(api, clock);
    const locks = new InvoiceLocks(api, clock);
    const voids = new Voids(api, clock);
    const acceptances = new Acceptances(api, clock);
    const corrections = new Corrections(api, clock);
    const projects = new ProjectSetup(api, clock, story.policy);

    const names = new Map<string | null, string>([
      [dana, 'Dana'],
      [luis, 'Luis'],
      [systemActorId, 'system'],
    ]);
    const load = (ticketNumber: string) => ({ workflow: 'LOAD', ticketNumber }) as const;
    const unitRate = (ticketNumber: string) => ({ workflow: 'UNIT_RATE', ticketNumber }) as const;
    // The ledger as it stands: every line with its ticket, its #, its pay item, quantity × rate
    // = amount.
    const lines = async () => {
      const rows = await api.transaction.findMany({
        where: { projectId: p1 },
        include: { payItem: true, completedLoad: true, completedHaulOut: true, fieldEvent: true },
      });
      return rows
        .map((row) => {
          const ticket =
            row.completedLoad?.ticketNumber ??
            row.completedHaulOut?.ticketNumber ??
            row.fieldEvent?.ticketNumber ??
            '';
          return {
            ticket,
            line: `${ticket} #${String(row.slot)} ${row.payItem.code} ${row.quantity.toString()} × $${row.rate.toFixed(2)} = $${row.amount.toFixed(2)}`,
          };
        })
        .sort((left, right) => (left.line < right.line ? -1 : 1));
    };
    const linesOf = async (ticketNumber: string): Promise<string[]> =>
      (await lines()).filter((each) => each.ticket === ticketNumber).map((each) => each.line);
    const statusOf = async (ticketNumber: string): Promise<string[]> => [
      ...new Set(
        (await api.fieldEvent.findMany({ where: { projectId: p1, ticketNumber } })).map(
          (event) => event.status,
        ),
      ),
    ];
    // A ticket's flags over its life, each with what happened to it.
    const flagsOn = async (ticketNumber: string): Promise<string[]> =>
      (
        await api.flag.findMany({
          where: { projectId: p1, ticketNumber },
          orderBy: { id: 'asc' },
          include: { acceptances: { include: { reason: true } } },
        })
      ).map(
        (flag) =>
          `${flag.message}${flag.acceptances.map((each) => ` (accepted: ${each.reason.name})`).join('')}${flag.clearedAt === null ? '' : ' (cleared)'}`,
      );
    const standingFlag = (ticketNumber: string, code?: string) =>
      api.flag.findFirstOrThrow({
        where: { projectId: p1, ticketNumber, clearedAt: null, ...(code ? { code } : {}) } as never,
        orderBy: { id: 'asc' },
      });
    // The lines the audit log holds as removed, in the order they went: who removed each, and
    // its amount.
    const removed = async (): Promise<[string | undefined, number][]> =>
      (
        await api.auditRecord.findMany({
          where: { tableName: 'transaction', operation: 'DELETE' },
          orderBy: { id: 'asc' },
        })
      ).map((record) => [
        names.get(record.actorId),
        Number((record.priorValue as Record<string, unknown>)['amount']),
      ]);
    // What the audit log holds of a table's rows: who, from where, what was done, with which
    // note.
    const auditOf = async (tableName: string, recordId?: string) =>
      (
        await api.auditRecord.findMany({
          where: { tableName, ...(recordId === undefined ? {} : { recordId }) },
          orderBy: { id: 'asc' },
        })
      ).map((record) =>
        [
          names.get(record.actorId) ?? record.actorId,
          record.source,
          record.operation,
          ...(record.operation === 'UPDATE' ? [record.changedFields.join(', ')] : []),
          ...(record.reason === null ? [] : [record.reason]),
        ].join(' · '),
      );
    const audited = (tableName: string): Promise<number> =>
      api.auditRecord.count({ where: { tableName } });
    const eventOf = (ticketNumber: string, kind: FieldEventKind) =>
      api.fieldEvent.findFirstOrThrow({ where: { projectId: p1, ticketNumber, kind } });
    const reasonId = async (name: string): Promise<string> =>
      (await api.reason.findFirstOrThrow({ where: { name } })).id;
    const decisionOf = async (run: RunOutcome, ticketNumber: string) =>
      (
        await api.reconciliationDecision.findMany({
          where: { reconciliationRunId: run.ran ? run.runId : '', ticketNumber },
        })
      ).map((decision) => [decision.status, (decision.summary as { why?: string }).why]);

    // A reviewer's action, then the run it asks for.
    const last: { run: RunOutcome } = {
      run: { ran: false, reason: 'RUN_UNDER_WAY', message: 'No run yet.' },
    };
    const reviewed = async <T>(attempt: Promise<Outcome<Reviewed<T>>>): Promise<Reviewed<T>> => {
      const done = await saved(attempt);
      last.run = await reconciliation.run(done.reprocess);
      return done;
    };
    const refusal = async <T>(attempt: Promise<Outcome<T>>): Promise<string> => {
      const outcome = await attempt;
      return outcome.saved ? 'saved' : `${outcome.refusal.code}: ${outcome.refusal.message}`;
    };
    const grant = (
      ...permissions: ('CORRECT' | 'RENUMBER' | 'VOID' | 'ACCEPT_FLAG' | 'QC' | 'LOCK_INVOICED')[]
    ) =>
      api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
        for (const permission of permissions) {
          await tx.userPermission.create({ data: { userId: luis, permission } });
        }
      });
    const loadOf = async (ticketNumber: string) => ({
      completedLoadId: (
        await api.completedLoad.findFirstOrThrow({
          where: { projectId: p1, ticketNumber, dissolvedAt: null },
        })
      ).id,
    });
    const haulOutOf = async (ticketNumber: string) => ({
      completedHaulOutId: (
        await api.completedHaulOut.findFirstOrThrow({
          where: { projectId: p1, ticketNumber, dissolvedAt: null },
        })
      ).id,
    });
    const unitRateOf = async (ticketNumber: string) => ({
      unitRateTicketId: (await eventOf(ticketNumber, 'UNIT_RATE')).id,
    });
    // Every QC mark, lock and batch there is, counted.
    const marks = async (): Promise<number[]> => [
      await api.qcMark.count(),
      await api.invoiceLock.count(),
      await api.invoiceBatch.count(),
    ];
    // What the worker has written, counted in the audit log: a mark must add to none of it.
    const concluded = async (): Promise<number[]> => [
      await audited('field_event'),
      await audited('completed_load'),
      await audited('completed_haul_out'),
      await audited('flag'),
      await audited('transaction'),
      await api.reconciliationRun.count(),
    ];
    // A ticket's locks over its life, oldest first: who locked it, in which batch, who unlocked
    // it and why.
    const locksOf = async (marked: {
      completedLoadId?: string;
      completedHaulOutId?: string;
      unitRateTicketId?: string;
    }): Promise<string[]> =>
      (
        await api.invoiceLock.findMany({
          where:
            marked.unitRateTicketId === undefined
              ? marked
              : { fieldEventId: marked.unitRateTicketId },
          orderBy: { id: 'asc' },
          include: { invoiceBatch: true },
        })
      ).map((lock) =>
        [
          `locked by ${names.get(lock.lockedById) ?? ''}`,
          lock.invoiceBatch === null ? 'no batch' : lock.invoiceBatch.name,
          lock.unlockedAt === null
            ? 'in force'
            : `unlocked by ${names.get(lock.unlockedById) ?? ''}${lock.unlockNote === null ? '' : ` (${lock.unlockNote})`}`,
        ].join(' · '),
      );
    // The tickets a batch holds locked, read by its name.
    const lockedIn = async (name: string): Promise<string[]> =>
      (
        await api.invoiceLock.findMany({
          where: { projectId: p1, unlockedAt: null, invoiceBatch: { name } },
          include: { completedLoad: true, completedHaulOut: true, fieldEvent: true },
        })
      )
        .map(
          (lock) =>
            lock.completedLoad?.ticketNumber ??
            lock.completedHaulOut?.ticketNumber ??
            lock.fieldEvent?.ticketNumber ??
            '',
        )
        .sort();
    const rateTo = (rate: string) =>
      api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
        const standing = await tx.payItemRate.findFirstOrThrow({
          where: { payItemId: pricing.payItems['VEG-HAUL-CY-15'] ?? '', primeId: coastline },
        });
        await tx.payItemRate.update({ where: { id: standing.id }, data: { rate } });
      });
    const hauling = async (): Promise<string[]> =>
      (await lines())
        .filter((each) => each.line.includes('VEG-HAUL-CY-15'))
        .map((each) => each.line);

    // ------------------------------------------------------------------------------------------
    const phones = new P1Syncs(story, held);
    const [mondayEvening, tuesdayEvening, wednesdayMorning] = phones.times;
    if (
      mondayEvening === undefined ||
      tuesdayEvening === undefined ||
      wednesdayMorning === undefined
    ) {
      throw new Error('The field days synced fewer than three times.');
    }
    const sync = { projectId: p1, trigger: 'SYNC' } as const;
    const setupChange = { projectId: p1, trigger: 'SETUP_CHANGE' } as const;
    story.at(
      mondayEvening.toISOString(),
      'Monday evening: the phones find signal; the worker runs',
    );
    await phones.arrive(mondayEvening);
    await phones.crewPhotographs(mondayEvening);
    await reconciliation.run(sync);
    story.at(tuesdayEvening.toISOString(), 'Tuesday evening: the same');
    await phones.arrive(tuesdayEvening);
    await phones.crewPhotographs(tuesdayEvening);
    await reconciliation.run(sync);
    story.at(
      wednesdayMorning.toISOString(),
      'Wednesday: the Marsh Road tower’s phone is charged and syncs Tuesday’s work',
    );
    await phones.arrive(wednesdayMorning);
    story.at(on('14', '07:20'), 'The worker runs');
    const before = await reconciliation.run(sync);
    story.check(
      'P1 before any QC: 101001, 101002, 101004 and 101005 are COMPLETED, 101003 in review for its 96% call, 101006 waiting for its disposal; nobody has marked anything',
      [of(before, '10100'), await marks()],
      [
        [
          '101001 · COMPLETED',
          '101002 · COMPLETED',
          '101003 · MANUAL_REVIEW · Ticket 101003: load call 96%. Flagged for review.',
          '101004 · COMPLETED',
          '101005 · COMPLETED',
          '101006 · PENDING',
        ],
        [0, 0, 0],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(on('14', '07:40'), 'Luis opens 101001 to QC it. Dana has granted him nothing yet');
    const l101001 = await loadOf('101001');
    story.check(
      'AC-08-05 a manager/analyst without the grant can’t set a QC status, lock a ticket or make a batch: each is refused in plain words and nothing is saved',
      [
        await refusal(qc.set(luis, l101001, 'QC_APPROVED')),
        await refusal(locks.lock(luis, l101001)),
        await refusal(locks.batch(luis, p1, 'Bayline ROW, week of 12 Oct')),
        await marks(),
      ],
      [
        'NOT_PERMITTED: Luis Ortega may not set a QC status: it takes an admin, or a manager/analyst granted "QC". Nothing was changed.',
        'NOT_PERMITTED: Luis Ortega may not lock a ticket as invoiced: it takes an admin, or a manager/analyst granted "lock as invoiced". Nothing was changed.',
        'NOT_PERMITTED: Luis Ortega may not lock a ticket as invoiced: it takes an admin, or a manager/analyst granted "lock as invoiced". Nothing was changed.',
        [0, 0, 0],
      ],
    );
    story.at(
      on('14', '07:45'),
      'Dana grants Luis correct, renumber, void, accept flags, QC and lock as invoiced; nobody is granted unlock',
    );
    await grant('CORRECT', 'RENUMBER', 'VOID', 'ACCEPT_FLAG', 'QC', 'LOCK_INVOICED');

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '08:00'),
      'Luis looks through 101001, its photographs and its line, and sets it QC Approved: "Photos checked"',
    );
    const lineOf101001 = await linesOf('101001');
    const beforeMark = await concluded();
    const approved = await saved(qc.set(luis, l101001, 'QC_APPROVED', 'Photos checked'));
    story.check(
      'AC-08-54, AC-08-07 the mark holds the status, Luis, the time and his note, and is audited under him from the back office; nothing else changes (the ticket’s status, its completed load, its flags, its $390.00 line) and no run is asked for or started',
      [
        [
          approved.completedLoadId === l101001.completedLoadId,
          approved.status,
          names.get(approved.setById),
          approved.setAt.toISOString(),
          approved.note,
        ],
        await auditOf('qc_mark', approved.id),
        'reprocess' in approved,
        await statusOf('101001'),
        [lineOf101001, await linesOf('101001')],
        isSame(await concluded(), beforeMark),
      ],
      [
        [true, 'QC_APPROVED', 'Luis', new Date(on('14', '08:00')).toISOString(), 'Photos checked'],
        ['Luis · BACK_OFFICE · INSERT · Photos checked'],
        false,
        ['COMPLETED'],
        [
          ['101001 #1 VEG-HAUL-CY-15 52 × $7.50 = $390.00'],
          ['101001 #1 VEG-HAUL-CY-15 52 × $7.50 = $390.00'],
        ],
        true,
      ],
    );

    story.at(on('14', '08:05'), 'He isn’t sure of the pile’s photograph: QC Issues');
    await saved(qc.set(luis, l101001, 'QC_ISSUES', 'Pile photograph is dark'));
    const atIssues = await refusal(locks.lock(luis, l101001));
    story.at(on('14', '08:07'), 'QC Void');
    await saved(qc.set(luis, l101001, 'QC_VOID'));
    story.check(
      'AC-08-60 QC Issues and QC Void void nothing: 101001 stays COMPLETED and its $390.00 line stands; it is the same mark changed, the status before kept in the audit log; no run was started',
      [
        await statusOf('101001'),
        await linesOf('101001'),
        await api.qcMark.count(),
        await auditOf('qc_mark', approved.id),
        isSame(await concluded(), beforeMark),
      ],
      [
        ['COMPLETED'],
        ['101001 #1 VEG-HAUL-CY-15 52 × $7.50 = $390.00'],
        1,
        [
          'Luis · BACK_OFFICE · INSERT · Photos checked',
          'Luis · BACK_OFFICE · UPDATE · note, set_at, status · Pile photograph is dark',
          'Luis · BACK_OFFICE · UPDATE · note, set_at, status',
        ],
        true,
      ],
    );
    story.check(
      'AC-09-02 only a QC Approved ticket can be locked: 101001 at QC Issues and at QC Void, and 101002, which nobody has marked (QC Review), are each refused and nothing is locked',
      [
        atIssues,
        await refusal(locks.lock(luis, l101001)),
        await refusal(locks.lock(luis, await loadOf('101002'))),
        await api.invoiceLock.count(),
      ],
      [
        'NOT_QC_APPROVED: Ticket 101001 is at QC Issues: only a QC Approved ticket can be locked as invoiced. Nothing was locked.',
        'NOT_QC_APPROVED: Ticket 101001 is at QC Void: only a QC Approved ticket can be locked as invoiced. Nothing was locked.',
        'NOT_QC_APPROVED: Ticket 101002 is at QC Review: only a QC Approved ticket can be locked as invoiced. Nothing was locked.',
        0,
      ],
    );
    story.at(on('14', '08:10'), 'The second photograph shows the pile: QC Approved again');
    await saved(qc.set(luis, l101001, 'QC_APPROVED', 'Photos checked'));

    const col101006 = await eventOf('101006', 'COLLECTION');
    story.check(
      'AC-08-62 the pending collection 101006 has nothing to QC or lock: its ticket has no completed load until it is whole, and a load’s single field event is never QC’d or locked on its own',
      [
        await api.completedLoad.count({ where: { projectId: p1, ticketNumber: '101006' } }),
        await refusal(qc.set(luis, { unitRateTicketId: col101006.id }, 'QC_APPROVED')),
        await refusal(locks.lock(luis, { unitRateTicketId: col101006.id })),
        await marks(),
      ],
      [
        0,
        'NOT_QCD_ALONE: A collection is never QC’d or locked on its own: its completed load or haul-out is, once the ticket is whole. Nothing was saved.',
        'NOT_QCD_ALONE: A collection is never QC’d or locked on its own: its completed load or haul-out is, once the ticket is whole. Nothing was saved.',
        [1, 0, 0],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '08:20'),
      'Luis sets 101003 QC Approved while its 96% flag is still open, and tries to lock it',
    );
    const l101003 = await loadOf('101003');
    await saved(qc.set(luis, l101003, 'QC_APPROVED'));
    const inReview = await refusal(locks.lock(luis, l101003));
    story.at(
      on('14', '08:25'),
      'He accepts the flag: Photos confirm, "Heaped; photos confirm"; the worker runs; he locks it',
    );
    await reviewed(
      acceptances.flag(
        luis,
        (await standingFlag('101003')).id,
        await reasonId('Photos confirm'),
        'Heaped; photos confirm',
      ),
    );
    const locked101003 = await saved(locks.lock(luis, l101003));
    story.check(
      'AC-09-03 a ticket in review is resolved first: QC Approved with its flag open, 101003 isn’t locked; its flag accepted and the ticket COMPLETED, it locks. AC-09-10 no batch is named, and it is locked all the same',
      [
        inReview,
        of(last.run, '101003'),
        [names.get(locked101003.lockedById), locked101003.invoiceBatchId],
        await locksOf(l101003),
      ],
      [
        'NOT_COMPLETED: Ticket 101003 is in review: every flag on it is fixed or accepted before it is locked as invoiced. Nothing was locked.',
        ['101003 · COMPLETED · Ticket 101003: load call 96%. Flagged for review.'],
        ['Luis', null],
        ['locked by Luis · no batch · in force'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(on('14', '08:30'), 'Luis locks 101001 as invoiced');
    const beforeLock = await concluded();
    const locked101001 = await saved(locks.lock(luis, l101001));
    story.check(
      'AC-09-01, AC-08-07 the lock is recorded (the completed load, Luis, when) and audited under him from the back office. That is all invoicing is: the lock holds no amount, nothing the worker wrote changes, and no run is asked for or started',
      [
        [
          locked101001.completedLoadId === l101001.completedLoadId,
          names.get(locked101001.lockedById),
          locked101001.lockedAt.toISOString(),
          Object.keys(locked101001).filter((key) => /amount|rate|quantity|total/i.test(key)),
        ],
        await auditOf('invoice_lock', locked101001.id),
        'reprocess' in locked101001,
        await linesOf('101001'),
        isSame(await concluded(), beforeLock),
      ],
      [
        [true, 'Luis', new Date(on('14', '08:30')).toISOString(), []],
        ['Luis · BACK_OFFICE · INSERT'],
        false,
        ['101001 #1 VEG-HAUL-CY-15 52 × $7.50 = $390.00'],
        true,
      ],
    );
    story.check(
      'AC-09-07 a ticket has one lock in force: locking 101001 a second time is refused in plain words',
      [await refusal(locks.lock(luis, l101001)), await locksOf(l101001)],
      [
        'ALREADY_LOCKED: Ticket 101001 is already locked as invoiced. Nothing was changed.',
        ['locked by Luis · no batch · in force'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '08:40'),
      'Luis makes the batch "Bayline ROW, week of 12 Oct" and puts the two locks in it; he QCs the haul-out 201004 and the hanger ticket 301001 and locks each in the batch',
    );
    const batchName = 'Bayline ROW, week of 12 Oct';
    const batch = await saved(locks.batch(luis, p1, batchName));
    const sameName = await refusal(locks.batch(luis, p1, ` ${batchName} `));
    await saved(locks.intoBatch(luis, l101001, batch.id));
    await saved(locks.intoBatch(luis, l101003, batch.id));
    const h201004 = await haulOutOf('201004');
    const u301001 = await unitRateOf('301001');
    const pileOf201004 = await api.fieldEvent.findFirstOrThrow({
      where: { projectId: p1, ticketNumber: '201004', kind: 'HAUL_OUT_COLLECTION' },
    });
    const onePile = await refusal(
      qc.set(luis, { unitRateTicketId: pileOf201004.id }, 'QC_APPROVED'),
    );
    await saved(qc.set(luis, h201004, 'QC_APPROVED'));
    await saved(qc.set(luis, u301001, 'QC_APPROVED'));
    const lockedHaulOut = await saved(locks.lock(luis, h201004, batch.id));
    const lockedHanger = await saved(locks.lock(luis, u301001, batch.id));
    story.check(
      'AC-09-09 the batch is a record of its own (its project, its name, Luis, when), with no amount, and each lock names it; a second batch of that name on P1 is refused. Read by its name, it holds the four tickets',
      [
        [
          batch.projectId === p1,
          batch.name,
          names.get(batch.createdById),
          batch.createdAt.toISOString(),
          Object.keys(batch).filter((key) => /amount|rate|quantity|total/i.test(key)),
        ],
        await auditOf('invoice_batch', batch.id),
        sameName,
        await lockedIn(batchName),
        await locksOf(l101001),
      ],
      [
        [true, batchName, 'Luis', new Date(on('14', '08:40')).toISOString(), []],
        ['Luis · BACK_OFFICE · INSERT'],
        'BATCH_NAME_USED: This project already has an invoice batch named "Bayline ROW, week of 12 Oct". Nothing was saved.',
        ['101001', '101003', '201004', '301001'],
        ['locked by Luis · Bayline ROW, week of 12 Oct · in force'],
      ],
    );
    story.check(
      'AC-08-57, AC-09-05 the split haul-out 201004 is QC’d once and locked once, as one completed record with its three piles; one pile’s own field event takes no mark',
      [
        onePile,
        await api.completedHaulOutCollection.count({
          where: { completedHaulOutId: h201004.completedHaulOutId, dissolvedAt: null },
        }),
        await api.qcMark.count({ where: h201004 }),
        lockedHaulOut.completedHaulOutId === h201004.completedHaulOutId,
        await locksOf(h201004),
      ],
      [
        'NOT_QCD_ALONE: A haul-out collection is never QC’d or locked on its own: its completed load or haul-out is, once the ticket is whole. Nothing was saved.',
        3,
        1,
        true,
        ['locked by Luis · Bayline ROW, week of 12 Oct · in force'],
      ],
    );
    story.check(
      'AC-09-06 the unit rate ticket 301001, QC Approved, locks on its own: the lock names its one field event',
      [
        [lockedHanger.fieldEventId === u301001.unitRateTicketId, lockedHanger.fieldEventKind],
        [lockedHanger.completedLoadId, lockedHanger.completedHaulOutId],
      ],
      [
        [true, 'UNIT_RATE'],
        [null, null],
      ],
    );

    story.at(
      on('14', '08:50'),
      'He QCs Jo Kim’s incident, the citizen drop-off log and certification 730415, each on its own',
    );
    const incident = await api.incident.findFirstOrThrow({ where: { projectId: p1 } });
    const dropOff = await api.dropOffLog.findFirstOrThrow({ where: { projectId: p1 } });
    const cert730415 = await api.certification.findFirstOrThrow({
      where: { projectId: p1, certNumber: '730415' },
    });
    const beforeOthers = await concluded();
    const onIncident = await saved(qc.set(luis, { incidentId: incident.id }, 'QC_APPROVED'));
    const onDropOff = await saved(qc.set(luis, { dropOffLogId: dropOff.id }, 'QC_APPROVED'));
    const onCert = await saved(qc.set(luis, { certificationId: cert730415.id }, 'QC_APPROVED'));
    story.check(
      'AC-08-58 an incident, a drop-off log and a certification are each QC’d on their own, never with a ticket; on the certification, whoever set the mark is its "checked by"; none of it reruns anything, and the tickets on truck 730415 are as they were',
      [
        [onIncident, onDropOff, onCert].map((mark) => [
          mark.status,
          mark.completedLoadId,
          mark.completedHaulOutId,
          mark.fieldEventId,
        ]),
        names.get(onCert.setById),
        isSame(await concluded(), beforeOthers),
      ],
      [
        [
          ['QC_APPROVED', null, null, null],
          ['QC_APPROVED', null, null, null],
          ['QC_APPROVED', null, null, null],
        ],
        'Luis',
        true,
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '09:00'),
      'Luis tries to correct 101001’s load call, to renumber its disposal, to void it and to change its QC status',
    );
    const dis101001 = await eventOf('101001', 'DISPOSAL');
    const beforeTries = [await concluded(), await api.ticketVoid.count()];
    story.check(
      'AC-09-15 101001 is locked as invoiced: each is refused in plain words and nothing is changed; a locked ticket is unlocked first',
      [
        await refusal(corrections.fieldEvent(luis, dis101001.id, { loadCall: 70 })),
        await refusal(corrections.renumber(luis, dis101001.id, { ticketNumber: '101090' })),
        await refusal(voids.ticket(luis, p1, load('101001'), await reasonId('Duplicate ticket'))),
        await refusal(qc.set(luis, l101001, 'QC_ISSUES')),
        [
          (await eventOf('101001', 'DISPOSAL')).loadCall,
          (await api.qcMark.findFirstOrThrow({ where: l101001 })).status,
        ],
        isSame([await concluded(), await api.ticketVoid.count()], beforeTries),
      ],
      [
        'LOCKED_AS_INVOICED: Ticket 101001 is locked as invoiced: unlock it first. Nothing was changed.',
        'LOCKED_AS_INVOICED: Ticket 101001 is locked as invoiced: unlock it first. Nothing was changed.',
        'LOCKED_AS_INVOICED: Ticket 101001 is locked as invoiced: unlock it first. Nothing was changed.',
        'LOCKED_AS_INVOICED: Ticket 101001 is locked as invoiced: unlock it first. Nothing was changed.',
        [80, 'QC_APPROVED'],
        true,
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '09:20'),
      'Dana changes Coastline’s rate on VEG-HAUL-CY-15 from $7.50 to $7.75; the worker runs',
    );
    await rateTo('7.75');
    const rated = await reconciliation.run(setupChange);
    story.check(
      'AC-09-13 the un-invoiced 101004 and 101005 are regenerated at $7.75; 101001 and 101003, locked by the service, are left exactly as they are at $7.50, and the run’s decision on each says why',
      [await hauling(), await decisionOf(rated, '101001'), await decisionOf(rated, '101003')],
      [
        [
          '101001 #1 VEG-HAUL-CY-15 52 × $7.50 = $390.00',
          '101003 #1 VEG-HAUL-CY-15 62.4 × $7.50 = $468.00',
          '101004 #1 VEG-HAUL-CY-15 24 × $7.75 = $186.00',
          '101005 #1 VEG-HAUL-CY-15 45.5 × $7.75 = $352.63',
        ],
        [['COMPLETED', 'Locked as invoiced: left as it is.']],
        [['COMPLETED', 'Locked as invoiced: left as it is.']],
      ],
    );
    story.at(
      on('14', '09:30'),
      'Dana lowers P1’s high load call limit from 95% to 70%; the worker runs',
    );
    await saved(projects.changeSettings(dana, p1, { loadCallHighLimit: 70 }));
    const lowered = await reconciliation.run(setupChange);
    const loweredTold = of(lowered, '10100');
    story.at(on('14', '09:35'), 'She puts 95% back; the worker runs');
    await saved(projects.changeSettings(dana, p1, { loadCallHighLimit: 95 }));
    const raised = await reconciliation.run(setupChange);
    story.check(
      'AC-09-14 a setup change works every un-invoiced ticket it touches again and passes every locked one by: 101002 (75%) and 101005 (70%) are flagged for a high load call and cleared again; 101001, called 80% and locked, is never flagged, and 101003 keeps the one flag it was locked with',
      [loweredTold, of(raised, '10100'), await flagsOn('101001')],
      [
        [
          '101001 · COMPLETED',
          '101002 · MANUAL_REVIEW · Ticket 101002: load call 75%. Flagged for review.',
          '101003 · COMPLETED · Ticket 101003: load call 96%. Flagged for review.',
          '101004 · COMPLETED',
          '101005 · MANUAL_REVIEW · Ticket 101005: load call 70%. Flagged for review.',
          '101006 · PENDING',
        ],
        [
          '101001 · COMPLETED',
          '101002 · COMPLETED',
          '101003 · COMPLETED · Ticket 101003: load call 96%. Flagged for review.',
          '101004 · COMPLETED',
          '101005 · COMPLETED',
          '101006 · PENDING',
        ],
        [],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(on('14', '09:50'), 'The new rate is agreed. Luis tries to unlock 101001');
    const unlockRefused = await refusal(locks.unlock(luis, l101001, 'Rate agreed'));
    story.at(on('14', '09:55'), 'Dana, the admin, unlocks it: "Rate agreed"; the worker runs');
    const removedBefore = (await removed()).length;
    const unlocked = await reviewed(locks.unlock(dana, l101001, 'Rate agreed'));
    story.check(
      'AC-09-17, AC-08-07 unlocking is a grant of its own, which Luis doesn’t hold; Dana’s unlock is kept on the lock’s own record (who, when, her note), nothing is deleted, and it is audited under her from the back office',
      [
        unlockRefused,
        [
          unlocked.record.id === locked101001.id,
          names.get(unlocked.record.lockedById),
          names.get(unlocked.record.unlockedById),
          unlocked.record.unlockedAt?.toISOString(),
          unlocked.record.unlockNote,
        ],
        await auditOf('invoice_lock', locked101001.id),
        [
          unlocked.reprocess.trigger,
          unlocked.reprocess.tickets,
          unlocked.reprocess.lockedAsInvoiced,
        ],
      ],
      [
        'NOT_PERMITTED: Luis Ortega may not unlock an invoiced ticket: it takes an admin, or a manager/analyst granted "unlock". Nothing was changed.',
        [true, 'Luis', 'Dana', new Date(on('14', '09:55')).toISOString(), 'Rate agreed'],
        [
          'Luis · BACK_OFFICE · INSERT',
          'Luis · BACK_OFFICE · UPDATE · invoice_batch_id',
          'Dana · BACK_OFFICE · UPDATE · unlocked_at, unlocked_by_id, unlock_note · Rate agreed',
        ],
        ['REPROCESS', [{ workflow: 'LOAD', ticketNumber: '101001' }], []],
      ],
    );
    story.check(
      'AC-09-19 unlocked, 101001 is a ticket like any other again: the run the unlock asks for regenerates its line at the rate as it now stands, 52 × $7.75 = $403.00, the $390.00 row copied in full to the audit log first, under the system',
      [of(last.run, '101001'), await linesOf('101001'), (await removed()).slice(removedBefore)],
      [
        ['101001 · COMPLETED'],
        ['101001 #1 VEG-HAUL-CY-15 52 × $7.75 = $403.00'],
        [['system', 390]],
      ],
    );
    story.check(
      'AC-09-21 each ticket has its own lock: 101001 unlocked, the batch’s other three are still locked, and 101003 still bills at $7.50',
      [await lockedIn(batchName), await linesOf('101003'), await locksOf(l101001)],
      [
        ['101003', '201004', '301001'],
        ['101003 #1 VEG-HAUL-CY-15 62.4 × $7.50 = $468.00'],
        ['locked by Luis · Bayline ROW, week of 12 Oct · unlocked by Dana (Rate agreed)'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '10:10'),
      'The agreed rate starts next month after all: Dana puts $7.50 back; the worker runs; Luis locks 101001 in the batch again',
    );
    await rateTo('7.50');
    await reconciliation.run(setupChange);
    const relocked = await saved(locks.lock(luis, l101001, batch.id));
    const stoodAt = await linesOf('101001');
    story.at(
      on('14', '10:30'),
      'A small fix before the package goes out: the tower keyed 80% for 70%. Dana unlocks 101001; Luis corrects the load call; the worker runs',
    );
    await reviewed(locks.unlock(dana, l101001, 'Load call keyed wrong'));
    const markBefore = await api.qcMark.findFirstOrThrow({ where: l101001 });
    const fixRemoved = (await removed()).length;
    await reviewed(corrections.fieldEvent(luis, dis101001.id, { loadCall: 70 }, 'Keyed 80 for 70'));
    const markAfter = await api.qcMark.findFirstOrThrow({ where: l101001 });
    story.check(
      'AC-08-61 the reprocess draws the completed load again and loses no mark: 101001 is still QC Approved, still Luis’s, set when he set it; looking at it again is a person’s step',
      [
        of(last.run, '101001'),
        (await loadOf('101001')).completedLoadId === l101001.completedLoadId,
        [markAfter.id === markBefore.id, markAfter.status, names.get(markAfter.setById)],
        markAfter.setAt.toISOString() === markBefore.setAt.toISOString(),
      ],
      [['101001 · COMPLETED'], true, [true, 'QC_APPROVED', 'Luis'], true],
    );
    story.at(
      on('14', '10:40'),
      'Luis looks at 101001 again, leaves it QC Approved and locks it in the same batch',
    );
    await saved(qc.set(luis, l101001, 'QC_APPROVED', 'Checked after the correction'));
    const lockedAgain = await saved(locks.lock(luis, l101001, batch.id));
    story.check(
      'AC-09-20 unlock, fix, lock again: locked at $390.00, unlocked, corrected from 80% to 70%, 101001 reprocesses at 45.5 × $7.50 = $341.25, the old line kept in the audit log; the new lock is a new record, and each earlier lock is still there with its unlock',
      [
        stoodAt,
        await linesOf('101001'),
        (await removed()).slice(fixRemoved),
        [lockedAgain.id !== relocked.id, relocked.id !== locked101001.id],
        await locksOf(l101001),
        await lockedIn(batchName),
      ],
      [
        ['101001 #1 VEG-HAUL-CY-15 52 × $7.50 = $390.00'],
        ['101001 #1 VEG-HAUL-CY-15 45.5 × $7.50 = $341.25'],
        [['system', 390]],
        [true, true],
        [
          'locked by Luis · Bayline ROW, week of 12 Oct · unlocked by Dana (Rate agreed)',
          'locked by Luis · Bayline ROW, week of 12 Oct · unlocked by Dana (Load call keyed wrong)',
          'locked by Luis · Bayline ROW, week of 12 Oct · in force',
        ],
        ['101001', '101003', '201004', '301001'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    // The story `p1-field-days` ends on Tuesday, so each later record is made as the phone that
    // recorded a Monday or Tuesday one would have sent it, at Wednesday's times.
    const heldEvent = (ticketNumber: string, kind: string) => {
      const found = held.find(
        ({ sent }) =>
          sent.record === 'FIELD_EVENT' &&
          sent.fieldEvent.ticketNumber === ticketNumber &&
          sent.fieldEvent.kind === kind,
      )?.sent;
      if (found?.record !== 'FIELD_EVENT') throw new Error(`No ${kind} on ${ticketNumber}`);
      return found.fieldEvent;
    };
    type Sent = ReturnType<typeof heldEvent>;
    const made = (like: Sent, from: string, to: string, more: Partial<Sent>): Sent => {
      const startedAt = new Date(on('14', from));
      const endedAt = new Date(on('14', to));
      return {
        ...like,
        id: uuidv7(startedAt),
        startedAt,
        endedAt,
        deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, endedAt),
        ...more,
      };
    };
    const send = async (fieldEvent: Sent): Promise<string> => {
      const record: PhoneRecord = { record: 'FIELD_EVENT', fieldEvent };
      return (await story.intake.receive(record)).answer;
    };

    story.at(
      on('14', '18:00'),
      'Wednesday evening: Scenario B syncs. 101030, loaded 14:10–14:40 on truck 730415 and dumped at 70%, and its phantom 101031, the same truck at the same time with no disposal; the worker runs',
    );
    const curb = heldEvent('101001', 'COLLECTION');
    const tower = heldEvent('101001', 'DISPOSAL');
    const noAddress = { address: null, addressSource: null };
    await send(made(curb, '14:10', '14:40', { ...noAddress, ticketNumber: '101030' }));
    await send(made(curb, '14:10', '14:40', { ...noAddress, ticketNumber: '101031' }));
    await send(made(tower, '15:05', '15:15', { ticketNumber: '101030', loadCall: 70 }));
    const evening = await reconciliation.run(sync);
    story.at(on('15', '08:00'), 'Thursday: Luis sets 101030 QC Approved and tries to lock it');
    const l101030 = await loadOf('101030');
    await saved(qc.set(luis, l101030, 'QC_APPROVED'));
    const flaggedLock = await refusal(locks.lock(luis, l101030, batch.id));
    story.at(
      on('15', '08:10'),
      'The second number was a mis-scan at the curb: he voids the phantom 101031; the worker runs; he locks 101030',
    );
    await reviewed(voids.ticket(luis, p1, load('101031'), await reasonId('Work never happened')));
    const afterVoid = of(last.run, '10103');
    const lockAfterVoid = await refusal(locks.lock(luis, l101030, batch.id));
    story.check(
      'AC-09-04 review never holds the money, and it does hold the lock: 101030 bills $341.25 while flagged for overlapping 101031 and can’t be locked until that flag is fixed or accepted; the phantom voided, it locks',
      [
        of(evening, '10103'),
        await linesOf('101030'),
        flaggedLock,
        afterVoid,
        lockAfterVoid,
        await lockedIn(batchName),
      ],
      [
        [
          '101030 · MANUAL_REVIEW · Ticket 101030: loading 14:10–14:40 overlaps ticket 101031 on truck 730415. Flagged for review.',
          '101031 · PENDING · Ticket 101031: loading 14:10–14:40 overlaps ticket 101030 on truck 730415. Flagged for review.',
        ],
        ['101030 #1 VEG-HAUL-CY-15 45.5 × $7.50 = $341.25'],
        'NOT_COMPLETED: Ticket 101030 is in review: every flag on it is fixed or accepted before it is locked as invoiced. Nothing was locked.',
        ['101031 · VOID', '101030 · COMPLETED'],
        'saved',
        ['101001', '101003', '101030', '201004', '301001'],
      ],
    );

    story.at(
      on('15', '08:30'),
      'The hanger ticket 301003 is a duplicate of 301001: Luis voids it; the worker runs; he sets it QC Void by hand',
    );
    const u301003 = await unitRateOf('301003');
    await reviewed(voids.ticket(luis, p1, unitRate('301003'), await reasonId('Duplicate ticket')));
    const voidedMark = await saved(qc.set(luis, u301003, 'QC_VOID'));
    const voidAtQcVoid = await refusal(locks.lock(luis, u301003, batch.id));
    await saved(qc.set(luis, u301003, 'QC_APPROVED'));
    story.check(
      'A void ticket isn’t locked as invoiced, whatever its QC status: it bills nothing. Its QC Void is Luis’s own mark, set by hand: the void didn’t set it, and the mark voids nothing',
      [
        await statusOf('301003'),
        await linesOf('301003'),
        [voidedMark.status, names.get(voidedMark.setById)],
        voidAtQcVoid,
        await refusal(locks.lock(luis, u301003, batch.id)),
      ],
      [
        ['VOID'],
        [],
        ['QC_VOID', 'Luis'],
        'NOT_COMPLETED: Ticket 301003 is void: it bills nothing and isn’t locked as invoiced. Nothing was locked.',
        'NOT_COMPLETED: Ticket 301003 is void: it bills nothing and isn’t locked as invoiced. Nothing was locked.',
      ],
    );
    await saved(qc.set(luis, u301003, 'QC_VOID'));

    // ------------------------------------------------------------------------------------------
    story.at('2027-03-02T09:00:00-05:00', '2 March 2027: P1 is done. Dana closes the project');
    const kept = async (): Promise<number[]> => [
      await api.fieldEvent.count({ where: { projectId: p1 } }),
      await api.completedLoad.count({ where: { projectId: p1 } }),
      await api.completedHaulOut.count({ where: { projectId: p1 } }),
      await api.transaction.count({ where: { projectId: p1 } }),
      await api.photo.count({ where: { projectId: p1 } }),
      await api.invoiceLock.count({ where: { projectId: p1 } }),
      await api.qcMark.count({ where: { projectId: p1 } }),
      await api.auditRecord.count({ where: { tableName: 'transaction' } }),
    ];
    const keptBefore = await kept();
    const closed = await saved(projects.close(dana, p1));
    story.check(
      'AC-09-29 the project is marked closed with the time and the change is audited under Dana; nothing in it is deleted: every field event, completed record, line, photograph, lock, mark and audit record is still there',
      [
        closed.closedAt?.toISOString(),
        (await auditOf('project', p1)).at(-1),
        isSame(await kept(), keptBefore),
      ],
      ['2027-03-02T14:00:00.000Z', 'Dana · BACK_OFFICE · UPDATE · closed_at', true],
    );
    story.at(
      '2027-06-01T09:00:00-04:00',
      '1 June 2027, months after closeout: Dana unlocks the hanger ticket 301001: "Client’s auditor asked"; the worker runs',
    );
    const lineOf301001 = (await lines()).filter((each) => each.ticket === '301001');
    const late = await reviewed(locks.unlock(dana, u301001, 'Client’s auditor asked'));
    story.check(
      'AC-09-22 nothing refuses an unlock on a closed project: people are trusted not to without good reason, and the audit log records who did and when. The ticket is worked again and, nothing having changed, its line is the same $68.00',
      [
        [names.get(late.record.unlockedById), late.record.unlockedAt?.toISOString()],
        (await auditOf('invoice_lock', late.record.id)).at(-1),
        of(last.run, '301001'),
        (await lines()).filter((each) => each.ticket === '301001').map((each) => each.line),
        lineOf301001.map((each) => each.line),
        await lockedIn(batchName),
      ],
      [
        ['Dana', '2027-06-01T13:00:00.000Z'],
        'Dana · BACK_OFFICE · UPDATE · unlocked_at, unlocked_by_id, unlock_note · Client’s auditor asked',
        ['301001 · COMPLETED'],
        ['301001 #1 HNG-RMV-EA 1 × $68.00 = $68.00'],
        ['301001 #1 HNG-RMV-EA 1 × $68.00 = $68.00'],
        ['101001', '101003', '101030', '201004'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at('2027-06-01T12:00:00-04:00', 'What the records hold of the QC and the invoicing');
    const byPeople = await api.auditRecord.findMany({
      where: {
        tableName: {
          in: [
            'completed_load',
            'completed_load_collection',
            'completed_haul_out',
            'completed_haul_out_collection',
            'transaction',
            'flag',
            'reconciliation_run',
            'reconciliation_decision',
          ],
        },
        actorId: { not: systemActorId },
      },
    });
    const who = async (...tableNames: string[]): Promise<string[]> =>
      [
        ...new Set(
          (await api.auditRecord.findMany({ where: { tableName: { in: tableNames } } })).map(
            (record) => `${names.get(record.actorId) ?? ''} · ${record.source}`,
          ),
        ),
      ].sort();
    story.check(
      'AC-08-07 every QC mark, lock and batch is in the audit log under Luis, and every unlock under Dana, from the back office, never under the system: no run set or changed a QC mark, and no person wrote a completed record, a line, a flag, a run or a decision',
      [
        await who('qc_mark'),
        await who('invoice_batch'),
        await who('invoice_lock'),
        byPeople.length,
      ],
      [
        ['Luis · BACK_OFFICE'],
        ['Luis · BACK_OFFICE'],
        ['Dana · BACK_OFFICE', 'Luis · BACK_OFFICE'],
        0,
      ],
    );
  },
};
