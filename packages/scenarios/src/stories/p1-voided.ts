// The twelfth story (BACKLOG 1.8.4; ADR-365; spec/acceptance/08-review-and-corrections.md
// AC-08-05, 07, 31…52): a reviewer voids, unvoids and accepts. P1's Monday and Tuesday are the
// story `p1-field-days`' own, priced as the story `p1-priced` prices them; Wednesday adds the
// loads the scenarios need (`adms-exceptions`' Scenario B and its phantom, a load whose two
// ends disagree, a load called 0%, a load dumped at an ineligible site a rule voids).
//
// Every void, unvoid, acceptance and correction here is Luis Ortega's request at his browser,
// signed in, over HTTPS to the story's API (BACKLOG 2.7.1 part 4b; ADR-497), by the grants Dana
// gives him at hers. Each is a mark of its own beside the records, and queues its own job; the
// worker takes it up, and the story reads what the worker concluded; Luis reads what each run
// decided for a voided ticket at its endpoint (AC-10-106; ADR-536).
//
// Not here: QC, the lock, a batch and the unlock (1.8.5). The golden mission's whole review is
// 1.9.1.
import { RuleSetup, SiteSetup } from '@open-adms/api';
import {
  acceptFlagEndpoint,
  correctFieldEventEndpoint,
  readTicketDecisionsEndpoint,
  renumberFieldEventEndpoint,
  unvoidTicketEndpoint,
  voidTicketEndpoint,
  withdrawAcceptanceEndpoint,
  type AnswerOf,
  type Endpoint,
} from '@open-adms/contracts';
import { systemActorId, type FieldEventKind } from '@open-adms/db';
import { uuidv7 } from '@open-adms/domain';
import { MapServers, Mileages, Reconciliation, type RunOutcome } from '@open-adms/worker';

import { utcOffsetMinutes } from '../clock.ts';
import type { PhoneRecord } from '../device.ts';
import { localMapServers } from '../map-servers.ts';
import { refusalOf, type AskedWith } from '../over-https.ts';
import type { Story } from '../runner.ts';
import { sentAlone } from './board.ts';
import {
  certifyP1,
  loadP1Map,
  p1BackOffice,
  p1FieldDaysHeld,
  P1Syncs,
  QueueRuns,
  saved,
  setUpP1Pricing,
} from './p1-office.ts';
import { p1TimeZone as timeZone } from './p1.ts';

const on = (date: string, time: string): string => `2026-10-${date}T${time}:00-04:00`;

// What a run did with each ticket, as lines a person reads.
const told = (outcome: RunOutcome | null): string[] =>
  outcome === null
    ? ['No run yet.']
    : outcome.tickets.map((ticket) =>
        [
          ticket.ticketNumber,
          ticket.status,
          ...(ticket.error === null ? [] : [`error: ${ticket.error}`]),
          ...ticket.flags,
        ].join(' · '),
      );

const of = (outcome: RunOutcome | null, ...ticketNumbers: string[]): string[] =>
  told(outcome).filter((line) => ticketNumbers.some((number) => line.startsWith(number)));

export const p1Voided: Story = {
  name: 'p1-voided',
  title:
    'A reviewer voids, unvoids and accepts: a void with a reason stops all billing and stays until a person unvoids it; a rule’s void always wins; an accepted flag isn’t raised again unless its facts change; every flag fixed or accepted, the ticket is COMPLETED',
  timeZone,
  start: on('08', '08:00'),

  async run(story) {
    const { api, worker, clock } = story;
    const office = await p1FieldDaysHeld(story);
    const { held, dana, luis, p1, tdsr } = office;

    // ------------------------------------------------------------------------------------------
    story.at(on('08', '08:40'), 'Thursday: Dana loads P1’s map and enters its pay items and rules');
    await loadP1Map(story, office);
    const pricing = await setUpP1Pricing(story, office);
    story.at(
      on('10', '09:10'),
      'Saturday: Sam Grant certifies P1’s three containers and two crews',
    );
    await certifyP1(story, office);

    const settings = {
      crewItemHoursLimit: story.policy.crewDayHours,
      deviceClockOffLimitMinutes: story.policy.deviceClockOffLimitMinutes,
      longestRunMs: 600_000,
    };
    const reconciliation = new Reconciliation(
      worker,
      clock,
      settings,
      new Mileages(new MapServers(localMapServers())),
    );
    const rules = new RuleSetup(api, clock, story.policy);

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
          include: { acceptances: { include: { reason: true }, orderBy: { id: 'asc' } } },
        })
      ).map(
        (flag) =>
          `${flag.message}${flag.acceptances.map((each) => ` (accepted: ${each.reason.name}${each.withdrawnAt === null ? '' : ', taken back'})`).join('')}${flag.clearedAt === null ? '' : ' (cleared)'}`,
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
    const decisionOf = async (run: RunOutcome | null, ticketNumber: string) =>
      (
        await api.reconciliationDecision.findMany({
          where: { reconciliationRunId: run?.runId ?? '', ticketNumber },
        })
      ).map((decision) => [decision.status, (decision.summary as { why?: string }).why]);
    // What each run decided for a ticket, newest first, as Luis reads it at its endpoint
    // (ADR-536; C172): what started the run, the status it left, the person or rule that voided
    // it, and each line it priced by its rule.
    const decisionsOf = async (workflow: 'LOAD' | 'UNIT_RATE', ticketNumber: string) => {
      const { decisions } = await (
        await backOffice.luiss()
      ).answered(readTicketDecisionsEndpoint, { ids: { projectId: p1, workflow, ticketNumber } });
      const ruleNamed = async (id: string) =>
        (await api.rule.findUniqueOrThrow({ where: { id } })).name;
      return Promise.all(
        decisions.map(async (decision) =>
          [
            decision.run.trigger,
            decision.status,
            ...(decision.voidedByPerson === null
              ? []
              : [`voided by ${decision.voidedByPerson.name} (${decision.voidedByPerson.reason})`]),
            ...decision.voidedByRules.map((rule) => `voided by the rule "${rule.name}"`),
            ...(await Promise.all(
              decision.lines.map(
                async (line) =>
                  `#${String(line.slot)} "${await ruleNamed(line.ruleId)}" $${line.amount}`,
              ),
            )),
          ].join(' · '),
        ),
      );
    };

    // A reviewer's action, then the run it asks for.
    const last: { run: RunOutcome | null } = { run: null };
    // Nobody asks the worker: the action queued its job, and the worker takes it up.
    const queue = new QueueRuns(story, reconciliation);
    // Dana and Luis at their browsers. His act, saved, then the run its job asks of the worker:
    // every act here is on P1.
    const backOffice = p1BackOffice(story, office);
    const reviewed = async <E extends Endpoint>(
      served: E,
      more: AskedWith,
    ): Promise<AnswerOf<E>> => {
      const done = await (await backOffice.luiss()).answered(served, more);
      last.run = await queue.next(p1);
      return done;
    };
    // His act as it was answered: refused at the door, or by the endpoint's rule in its words.
    const refusal = async (served: Endpoint, more: AskedWith): Promise<string> =>
      refusalOf(await (await backOffice.luiss()).asked(served, more));
    // What each act sends.
    type Ticket = ReturnType<typeof load> | ReturnType<typeof unitRate>;
    const voiding = (ticket: Ticket, reasonId: string, note?: string): AskedWith => ({
      ids: { projectId: p1 },
      json: { ...ticket, reasonId, note },
    });
    const unvoiding = (ticket: Ticket, note?: string): AskedWith => ({
      ids: { projectId: p1 },
      json: { ...ticket, note },
    });
    const accepting = (flagId: string, reasonId: string, note?: string): AskedWith => ({
      ids: { flagId },
      json: { reasonId, note },
    });

    // ------------------------------------------------------------------------------------------
    const phones = new P1Syncs(story, office);
    const [mondayEvening, tuesdayEvening, wednesdayMorning] = phones.times;
    if (
      mondayEvening === undefined ||
      tuesdayEvening === undefined ||
      wednesdayMorning === undefined
    ) {
      throw new Error('The field days synced fewer than three times.');
    }
    story.at(
      mondayEvening.toISOString(),
      'Monday evening: the phones find signal; the worker runs',
    );
    await phones.arrive(mondayEvening);
    await queue.settle(p1);
    story.at(tuesdayEvening.toISOString(), 'Tuesday evening: the same');
    await phones.arrive(tuesdayEvening);
    await queue.settle(p1);
    story.at(
      wednesdayMorning.toISOString(),
      'Wednesday: the Marsh Road tower’s phone is charged and syncs Tuesday’s work',
    );
    await phones.arrive(wednesdayMorning);
    story.at(on('14', '07:20'), 'The worker runs');
    // Every job waiting is taken up: what setup queued before the field days (each
    // certification's own flags) and what each sync queued.
    await queue.settle(p1);
    const before = await queue.standing(p1);
    story.check(
      'P1 before any review: 101003 in review for its 96% call, the stump 301005 for its size and its missing survey, 101006 waiting for the disposal typed as 101060; the duplicate hanger 301003 is COMPLETED and bills $68.00',
      [
        of(before, '101003', '101006', '101060', '301003', '301005'),
        await linesOf('301003'),
        await linesOf('301005'),
      ],
      [
        [
          '101003 · MANUAL_REVIEW · Ticket 101003: load call 96%. Flagged for review.',
          '101006 · PENDING',
          '101060 · PENDING · Ticket 101060: typed ticket number (Barcode damaged). Flagged for review.',
          '301003 · COMPLETED',
          '301005 · MANUAL_REVIEW · Ticket 301005: not an eligible stump (20 in, under 24 in). Flagged for review. · Ticket 301005: no survey. Flagged for review.',
        ],
        ['301003 #1 HNG-RMV-EA 1 × $68.00 = $68.00'],
        [],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '07:40'),
      'Luis opens 101003 to accept its flag, and 301003 to void it. Dana has granted him nothing yet',
    );
    const high96 = await standingFlag('101003');
    const photosConfirm = await reasonId('Photos confirm');
    const duplicate = await reasonId('Duplicate ticket');
    const marks = async (): Promise<number[]> => [
      await api.flagAcceptance.count(),
      await api.ticketVoid.count(),
    ];
    story.check(
      'AC-08-05 a manager/analyst without the grant can’t void, unvoid or accept: each request is refused at the door, 403 with no words, before any service runs, and nothing is saved',
      [
        await refusal(voidTicketEndpoint, voiding(unitRate('301003'), duplicate)),
        await refusal(unvoidTicketEndpoint, unvoiding(unitRate('301003'))),
        await refusal(acceptFlagEndpoint, accepting(high96.id, photosConfirm)),
        await marks(),
      ],
      ['403 NOT_ALLOWED', '403 NOT_ALLOWED', '403 NOT_ALLOWED', [0, 0]],
    );
    story.at(on('14', '07:45'), 'Dana grants Luis correct and renumber');
    await backOffice.grantLuis('CORRECT', 'RENUMBER', 'VIEW_REVIEW');
    story.check(
      'AC-08-05 accept flags is a grant of its own: granted correct alone, Luis still can’t accept a flag (the user, 2026-10-06, KD-74)',
      [await refusal(acceptFlagEndpoint, accepting(high96.id, photosConfirm)), await marks()],
      ['403 NOT_ALLOWED', [0, 0]],
    );
    story.at(on('14', '07:50'), 'Dana grants Luis void and accept flags');
    await backOffice.grantLuis('VOID', 'ACCEPT_FLAG', 'VIEW_REVIEW');

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '08:00'),
      'Luis checks the tower’s photographs of 101003 and accepts its flag: Photos confirm, "Heaped; photos confirm"; the worker runs',
    );
    const lineBefore = await linesOf('101003');
    const lineAudits = await audited('transaction');
    const flagAudits = await audited('flag');
    story.check(
      'AC-08-48 an acceptance carries a reason the firm offers for accepting a flag: one from another list is refused and nothing is accepted',
      [await refusal(acceptFlagEndpoint, accepting(high96.id, duplicate)), await marks()],
      [
        '422 NOT_SAVED · REASON_NOT_OFFERED: "Duplicate ticket" isn’t a reason the firm offers for accepting a flag. Nothing was saved.',
        [0, 0],
      ],
    );
    const accepted = await reviewed(
      acceptFlagEndpoint,
      accepting(high96.id, photosConfirm, 'Heaped; photos confirm'),
    );
    story.check(
      'AC-08-43, AC-08-07 the acceptance is recorded (the flag, the reason, his note, Luis, when) and audited under him from the back office; the flag itself isn’t touched; it queued one job naming the ticket alone; the ticket is COMPLETED on the run, and its line is the same $468.00 row before and after',
      [
        [
          accepted.record.flagId === high96.id,
          accepted.record.reasonId === photosConfirm,
          accepted.record.note,
          names.get(accepted.record.acceptedById),
          accepted.record.acceptedAt,
        ],
        await auditOf('flag_acceptance', accepted.record.id),
        (await audited('flag')) === flagAudits,
        [accepted.queued?.jobs.length, accepted.queued?.tickets, accepted.queued?.lockedAsInvoiced],
        of(last.run, '101003'),
        [lineBefore, await linesOf('101003')],
        (await audited('transaction')) === lineAudits,
      ],
      [
        [true, true, 'Heaped; photos confirm', 'Luis', new Date(on('14', '08:00')).toISOString()],
        ['Luis · BACK_OFFICE · INSERT · Heaped; photos confirm'],
        true,
        [1, 1, 0],
        ['101003 · COMPLETED · Ticket 101003: load call 96%. Flagged for review.'],
        [
          ['101003 #1 VEG-HAUL-CY-15 62.4 × $7.50 = $468.00'],
          ['101003 #1 VEG-HAUL-CY-15 62.4 × $7.50 = $468.00'],
        ],
        true,
      ],
    );
    story.at(
      on('14', '08:05'),
      'Luis asks for the ticket to be reprocessed, its call and the limit unchanged',
    );
    await backOffice.reprocess([load('101003')]);
    const again = await queue.settled(p1);
    story.check(
      'AC-08-44 the flag isn’t raised again: the ticket has the one flag, accepted, and stays COMPLETED. AC-08-49 a flag is accepted once',
      [
        of(again, '101003'),
        await flagsOn('101003'),
        await refusal(acceptFlagEndpoint, accepting(high96.id, photosConfirm)),
      ],
      [
        ['101003 · COMPLETED · Ticket 101003: load call 96%. Flagged for review.'],
        ['Ticket 101003: load call 96%. Flagged for review. (accepted: Photos confirm)'],
        '422 NOT_SAVED · ALREADY_ACCEPTED: This flag is already accepted ("Ticket 101003: load call 96%. Flagged for review."). Nothing was saved.',
      ],
    );

    story.at(
      on('14', '08:06'),
      'The photographs were of another truck: Luis takes his acceptance back, "Photos were 101005’s"; the worker runs',
    );
    const takenBack = await reviewed(withdrawAcceptanceEndpoint, {
      ids: { flagAcceptanceId: accepted.record.id },
      json: { note: 'Photos were 101005’s' },
    });
    story.check(
      'AC-08-70 an acceptance taken back: who, when and why are kept on it, audited under Luis; the flag stands again on the run it queued and the ticket is MANUAL_REVIEW, still billing $468.00; taken back once',
      [
        [
          names.get(takenBack.record.withdrawnById),
          takenBack.record.withdrawnAt,
          takenBack.record.withdrawNote,
        ],
        await auditOf('flag_acceptance', accepted.record.id),
        [takenBack.queued?.jobs.length, takenBack.queued?.tickets],
        of(last.run, '101003'),
        await flagsOn('101003'),
        await linesOf('101003'),
        await refusal(withdrawAcceptanceEndpoint, {
          ids: { flagAcceptanceId: accepted.record.id },
          json: { note: 'Again' },
        }),
      ],
      [
        ['Luis', new Date(on('14', '08:06')).toISOString(), 'Photos were 101005’s'],
        [
          'Luis · BACK_OFFICE · INSERT · Heaped; photos confirm',
          'Luis · BACK_OFFICE · UPDATE · withdrawn_at, withdrawn_by_id, withdraw_note · Photos were 101005’s',
        ],
        [1, 1],
        ['101003 · MANUAL_REVIEW · Ticket 101003: load call 96%. Flagged for review.'],
        [
          'Ticket 101003: load call 96%. Flagged for review. (accepted: Photos confirm, taken back)',
        ],
        ['101003 #1 VEG-HAUL-CY-15 62.4 × $7.50 = $468.00'],
        '422 NOT_SAVED · ALREADY_WITHDRAWN: This acceptance was already taken back ("Ticket 101003: load call 96%. Flagged for review."). Nothing was changed.',
      ],
    );
    story.at(
      on('14', '08:07'),
      'Luis finds 101003’s own photographs and accepts the flag again; the worker runs',
    );
    const acceptedAgain = await reviewed(
      acceptFlagEndpoint,
      accepting(high96.id, photosConfirm, 'Heaped; its own photos confirm'),
    );
    story.check(
      'AC-08-70 accepted again, it is an acceptance of its own beside the one taken back, and the ticket is COMPLETED',
      [
        acceptedAgain.record.id === accepted.record.id,
        of(last.run, '101003'),
        await flagsOn('101003'),
      ],
      [
        false,
        ['101003 · COMPLETED · Ticket 101003: load call 96%. Flagged for review.'],
        [
          'Ticket 101003: load call 96%. Flagged for review. (accepted: Photos confirm, taken back) (accepted: Photos confirm)',
        ],
      ],
    );

    story.at(
      on('14', '08:10'),
      'The call was keyed wrong: Luis corrects it to 97%; the worker runs',
    );

    const dis101003 = await eventOf('101003', 'DISPOSAL');
    await reviewed(correctFieldEventEndpoint, {
      ids: { fieldEventId: dis101003.id },
      json: { changes: { loadCall: 97 } },
    });
    story.check(
      'AC-08-45 the facts have changed: the old flag is cleared, a new one is raised that nobody has accepted, and the ticket is MANUAL_REVIEW again, billing 65 × 97% = 63.05 CY × $7.50 = $472.88',
      [of(last.run, '101003'), await flagsOn('101003'), await linesOf('101003')],
      [
        ['101003 · MANUAL_REVIEW · Ticket 101003: load call 97%. Flagged for review.'],
        [
          'Ticket 101003: load call 96%. Flagged for review. (accepted: Photos confirm, taken back) (accepted: Photos confirm) (cleared)',
          'Ticket 101003: load call 97%. Flagged for review.',
        ],
        ['101003 #1 VEG-HAUL-CY-15 63.05 × $7.50 = $472.88'],
      ],
    );
    story.at(on('14', '08:15'), 'The monitor confirms 97%: Luis accepts the new flag');
    await reviewed(
      acceptFlagEndpoint,
      accepting((await standingFlag('101003')).id, await reasonId('Confirmed with the monitor')),
    );
    story.check(
      'AC-08-52 each of the ticket’s flags is still in its history with what happened to it: one accepted and then cleared by a correction, one accepted; none was deleted, and the first acceptance is still there',
      [of(last.run, '101003'), await flagsOn('101003'), await api.flagAcceptance.count()],
      [
        ['101003 · COMPLETED · Ticket 101003: load call 97%. Flagged for review.'],
        [
          'Ticket 101003: load call 96%. Flagged for review. (accepted: Photos confirm, taken back) (accepted: Photos confirm) (cleared)',
          'Ticket 101003: load call 97%. Flagged for review. (accepted: Confirmed with the monitor)',
        ],
        3,
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '08:30'),
      'Luis accepts the typed-number flag on the pending disposal 101060; the worker runs',
    );
    await reviewed(
      acceptFlagEndpoint,
      accepting((await standingFlag('101060')).id, await reasonId('Confirmed with the monitor')),
    );
    const pendingAccepted = of(last.run, '101060');
    story.at(
      on('14', '08:40'),
      'Then he renumbers it to 101006, where it belongs; the worker runs',
    );
    const dis101060 = await eventOf('101060', 'DISPOSAL');
    await reviewed(renumberFieldEventEndpoint, {
      ids: { fieldEventId: dis101060.id },
      json: { ticketNumber: '101006' },
    });
    const renumbered = of(last.run, '101006');
    story.at(on('14', '08:45'), 'He accepts the flag on 101006; the worker runs');
    await reviewed(
      acceptFlagEndpoint,
      accepting((await standingFlag('101006')).id, await reasonId('Confirmed with the monitor')),
    );
    story.check(
      'AC-08-50 a flag on a pending ticket may be accepted, and the ticket goes on waiting. An acceptance stays with the flag it was made on: renumbered, the field event’s flag is a new one on 101006, to be looked at again. Accepted, 101006 is COMPLETED, its $216.00 unchanged',
      [
        pendingAccepted,
        renumbered,
        of(last.run, '101006'),
        await flagsOn('101060'),
        await linesOf('101006'),
      ],
      [
        [
          '101060 · PENDING · Ticket 101060: typed ticket number (Barcode damaged). Flagged for review.',
        ],
        [
          '101006 · MANUAL_REVIEW · Ticket 101006: typed ticket number (Barcode damaged). Flagged for review.',
        ],
        [
          '101006 · COMPLETED · Ticket 101006: typed ticket number (Barcode damaged). Flagged for review.',
        ],
        [
          'Ticket 101060: typed ticket number (Barcode damaged). Flagged for review. (accepted: Confirmed with the monitor) (cleared)',
        ],
        ['101006 #1 VEG-HAUL-CY-15 28.8 × $7.50 = $216.00'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '08:50'),
      'Hanger ticket 301003 is the same tree as 301001. Luis voids it: Duplicate ticket, "Duplicate of 301001"; the worker runs',
    );
    const urt301003 = await eventOf('301003', 'UNIT_RATE');
    story.check(
      'AC-08-33 a void carries a reason the firm offers for voiding, and names a ticket: a reason from another list, and a number no field event is under, are refused, and nothing is voided',
      [
        await refusal(voidTicketEndpoint, voiding(unitRate('301003'), photosConfirm)),
        await refusal(voidTicketEndpoint, voiding(unitRate('301099'), duplicate)),
        await api.ticketVoid.count(),
      ],
      [
        '422 NOT_SAVED · REASON_NOT_OFFERED: "Photos confirm" isn’t a reason the firm offers for voiding a ticket. Nothing was saved.',
        '422 NOT_SAVED · NOT_A_TICKET: No field event of this project is under 301099: there is no such ticket to void. Nothing was saved.',
        0,
      ],
    );
    const voided = await reviewed(
      voidTicketEndpoint,
      voiding(unitRate('301003'), duplicate, 'Duplicate of 301001'),
    );
    story.check(
      'AC-08-31, AC-08-07 the ticket is VOID and bills nothing: its $68.00 line is copied in full to the audit log and removed, by the system; the void is its own record (the reason, his note, Luis, when), audited under him; the field event’s status, COMPLETED → VOID, is the worker’s writing, and its decision names Luis and his reason',
      [
        await statusOf('301003'),
        await linesOf('301003'),
        (await removed()).at(-1),
        [
          voided.record.reasonId === duplicate,
          voided.record.note,
          names.get(voided.record.voidedById),
          voided.record.voidedAt,
        ],
        await auditOf('ticket_void', voided.record.id),
        (
          await api.auditRecord.findMany({
            where: { tableName: 'field_event', recordId: urt301003.id, operation: 'UPDATE' },
            orderBy: { id: 'desc' },
            take: 1,
          })
        ).map((record) => [
          names.get(record.actorId),
          (record.priorValue as Record<string, unknown>)['status'],
          (record.newValue as Record<string, unknown>)['status'],
        ]),
        await decisionOf(last.run, '301003'),
        await refusal(voidTicketEndpoint, voiding(unitRate('301003'), duplicate)),
      ],
      [
        ['VOID'],
        [],
        ['system', 68],
        [true, 'Duplicate of 301001', 'Luis', new Date(on('14', '08:50')).toISOString()],
        ['Luis · BACK_OFFICE · INSERT · Duplicate of 301001'],
        [['system', 'COMPLETED', 'VOID']],
        [['VOID', 'Voided by Luis Ortega (Duplicate ticket).']],
        '422 NOT_SAVED · ALREADY_VOID: Ticket 301003 is already void. Nothing was saved.',
      ],
    );
    story.check(
      'AC-10-106 Luis reads at its endpoint what each run decided for 301003, newest first: the run his void asked for left it VOID, voided by him for his reason, with no line; the run before priced its line',
      await decisionsOf('UNIT_RATE', '301003'),
      [
        'CORRECTION · VOID · voided by Luis Ortega (Duplicate ticket)',
        'SETUP_CHANGE · COMPLETED · #1 "HNG-RMV-EA - Hanger removal" $68.00',
      ],
    );

    story.at(
      on('14', '09:00'),
      'Stump 301005 is 20 in: it goes out as vegetative debris. Luis voids it: Not eligible work; the worker runs',
    );
    const urt301005 = await eventOf('301005', 'UNIT_RATE');
    const photographsOn301005 = await api.photo.count({ where: { fieldEventId: urt301005.id } });
    await reviewed(
      voidTicketEndpoint,
      voiding(
        unitRate('301005'),
        await reasonId('Not eligible work'),
        'Under 24 in; goes out as vegetative debris',
      ),
    );
    story.check(
      'AC-08-32 it is VOID and bills nothing, as it billed nothing before; its two flags are cleared and stay in its history: a void ticket has no open flag',
      [of(last.run, '301005'), await linesOf('301005'), await flagsOn('301005')],
      [
        ['301005 · VOID'],
        [],
        [
          'Ticket 301005: not an eligible stump (20 in, under 24 in). Flagged for review. (cleared)',
          'Ticket 301005: no survey. Flagged for review. (cleared)',
        ],
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
      return (await sentAlone(story, timeZone, record)).answer;
    };

    story.at(
      on('14', '09:10'),
      'A phone syncs another hanger ticket made under 301003, the number the voided ticket holds',
    );
    const second = await send(made(heldEvent('301003', 'UNIT_RATE'), '08:00', '08:05', {}));
    story.check(
      'AC-08-36 it is quarantined: a voided ticket’s field event still holds its number',
      [
        second,
        await api.quarantinedRecord.count({ where: { projectId: p1, resolvedAt: null } }),
        await api.fieldEvent.count({ where: { projectId: p1, ticketNumber: '301003' } }),
      ],
      ['QUARANTINED', 1, 1],
    );

    story.at(
      on('14', '09:15'),
      'Luis asks for the two void tickets, 301003 and 301005, to be reprocessed by name; the worker takes the job up',
    );
    const written = [await audited('field_event'), await audited('transaction')];
    const askedVoid = await backOffice.reprocess([unitRate('301003'), unitRate('301005')]);
    const settled = await queue.settled(p1);
    story.check(
      'AC-08-35, AC-08-41 a voided ticket stays void and out of the run, even one a job names (his request queued one job naming the two, ADR-498), which writes nothing for it; its field event, its photographs and its audit records are all still there',
      [
        [
          askedVoid.queued?.jobs.length,
          askedVoid.queued?.tickets,
          askedVoid.record.lockedAsInvoiced,
        ],
        of(settled, '301003', '301005'),
        [await statusOf('301003'), await statusOf('301005')],
        [await audited('field_event'), await audited('transaction')],
        (await eventOf('301005', 'UNIT_RATE')).id === urt301005.id,
        (await api.photo.count({ where: { fieldEventId: urt301005.id } })) === photographsOn301005,
        (await api.auditRecord.count({ where: { recordId: urt301005.id } })) > 0,
      ],
      [[1, 2, []], [], [['VOID'], ['VOID']], written, true, true, true],
    );

    story.at(
      on('14', '09:20'),
      'The crew shows Luis a second hanger in the same tree: 301003 was real work. He unvoids it; the worker runs',
    );
    const lifted = await reviewed(
      unvoidTicketEndpoint,
      unvoiding(unitRate('301003'), 'Second hanger, same tree'),
    );
    story.check(
      'AC-08-37, AC-08-67, AC-08-07 the unvoid is a record of its own, audited under Luis; the void’s own record is kept and marked lifted, by whom and when; the run works the ticket again: COMPLETED, 1 × $68.00. A ticket that isn’t void has nothing to lift',
      [
        [names.get(lifted.record.unvoidedById), lifted.record.unvoidedAt, lifted.record.note],
        await auditOf('ticket_unvoid', lifted.record.id),
        (({ liftedById, liftedAt, liftNote }) => [
          names.get(liftedById),
          liftedAt?.toISOString(),
          liftNote,
        ])(await api.ticketVoid.findUniqueOrThrow({ where: { id: voided.record.id } })),
        await auditOf('ticket_void', voided.record.id),
        of(last.run, '301003'),
        await decisionOf(last.run, '301003'),
        await linesOf('301003'),
        await refusal(unvoidTicketEndpoint, unvoiding(unitRate('301003'))),
      ],
      [
        ['Luis', new Date(on('14', '09:20')).toISOString(), 'Second hanger, same tree'],
        ['Luis · BACK_OFFICE · INSERT · Second hanger, same tree'],
        ['Luis', new Date(on('14', '09:20')).toISOString(), 'Second hanger, same tree'],
        [
          'Luis · BACK_OFFICE · INSERT · Duplicate of 301001',
          'Luis · BACK_OFFICE · UPDATE · lifted_at, lifted_by_id, lift_note · Second hanger, same tree',
        ],
        ['301003 · COMPLETED'],
        [
          [
            'COMPLETED',
            'Unvoided: worked again. Grouped on its project, its workflow and the number 301003: one unit rate event, whole by itself.',
          ],
        ],
        ['301003 #1 HNG-RMV-EA 1 × $68.00 = $68.00'],
        '422 NOT_SAVED · NOT_VOID: Ticket 301003 isn’t void. Nothing was changed.',
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '12:00'),
      'Dana enters Old Quarry Pit, an ineligible site with no permit yet, where a truck was seen dumping',
    );
    const quarry = (
      await saved(
        new SiteSetup(api, clock, story.policy).site(dana, {
          projectId: p1,
          name: 'Old Quarry Pit',
          siteTypeId: (await api.siteType.findFirstOrThrow({ where: { name: 'Other' } })).id,
          takesLoads: true,
          haulOutsLeaveHere: false,
          chargesTippingFee: false,
          ineligibleSite: true,
          permitNumber: null,
          latitude: '39.20000000',
          longitude: '-75.65000000',
          activationDate: '2026-10-12',
        }),
      )
    ).id;
    story.at(
      on('14', '18:00'),
      'Wednesday evening: the day’s work syncs. 101008, whose two ends disagree; 101009, dumped at Old Quarry Pit; Scenario B’s 101030 and its phantom 101031; 101032, called 0%',
    );
    // The curb's and the towers' records to copy: Ana's 101001 (the dump trailer 730415, from
    // Heron St to Marsh Road TDSR) and 101002 (Rivera's self-loader 730416, C&D, to the Landfill).
    const curb = heldEvent('101001', 'COLLECTION');
    const tower = heldEvent('101001', 'DISPOSAL');
    const curbCd = heldEvent('101002', 'COLLECTION');
    const landfillTower = heldEvent('101002', 'DISPOSAL');
    const noAddress = { address: null, addressSource: null };
    await send(made(curb, '07:30', '07:50', { ...noAddress, ticketNumber: '101008' }));
    await send(
      made(tower, '08:20', '08:30', {
        ticketNumber: '101008',
        certNumber: '730416',
        formDebrisTypeId: curbCd.formDebrisTypeId,
        loadCall: 80,
      }),
    );
    await send(made(curb, '10:00', '10:20', { ...noAddress, ticketNumber: '101009' }));
    await send(
      made(landfillTower, '10:55', '11:05', {
        ticketNumber: '101009',
        certNumber: '730415',
        formDebrisTypeId: curb.formDebrisTypeId,
        loadCall: 60,
        siteId: quarry,
        endLatitude: '39.20000000',
        endLongitude: '-75.65000000',
      }),
    );
    await send(made(curb, '14:10', '14:40', { ...noAddress, ticketNumber: '101030' }));
    await send(made(curb, '14:10', '14:40', { ...noAddress, ticketNumber: '101031' }));
    await send(made(tower, '15:05', '15:15', { ticketNumber: '101030', loadCall: 70 }));
    await send(made(curb, '15:40', '16:00', { ...noAddress, ticketNumber: '101032' }));
    await send(made(tower, '16:30', '16:40', { ticketNumber: '101032', loadCall: 0 }));
    story.at(on('14', '18:45'), 'The worker runs');
    await queue.settle(p1);
    const evening = await queue.standing(p1);
    story.check(
      'Wednesday’s tickets before review; each flag is the catalogue’s, word for word. 101009 bills while it is in review',
      [of(evening, '101008', '101009', '10103'), await linesOf('101009')],
      [
        [
          "101008 · MANUAL_REVIEW · Ticket 101008: debris type mismatch (collection Vegetative, disposal C&D). Flagged for review. · Ticket 101008: truck number doesn't match (collection 730415, disposal 730416). Flagged for review.",
          '101009 · MANUAL_REVIEW · Ticket 101009: dumped at Old Quarry Pit, an ineligible site. Flagged for review.',
          '101030 · MANUAL_REVIEW · Ticket 101030: loading 14:10–14:40 overlaps ticket 101031 on truck 730415. Flagged for review.',
          '101031 · PENDING · Ticket 101031: loading 14:10–14:40 overlaps ticket 101030 on truck 730415. Flagged for review.',
          '101032 · MANUAL_REVIEW · Ticket 101032: load call 0%. Flagged for review; not billed.',
        ],
        ['101009 #1 VEG-HAUL-CY-15 39 × $7.50 = $292.50'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('15', '08:00'),
      'Thursday: 101031 is a phantom, a second number for the pile 101030 was dumped under. Luis voids it: Work never happened; the worker runs',
    );
    await reviewed(
      voidTicketEndpoint,
      voiding(load('101031'), await reasonId('Work never happened')),
    );
    story.check(
      'AC-08-34 the phantom is VOID, kept with its audit trail and never paired: it has no completed load. In the same run the flag on 101030 is cleared, the overlap being gone, and 101030 is COMPLETED',
      [
        of(last.run, '101030', '101031'),
        await flagsOn('101030'),
        await api.completedLoad.count({ where: { projectId: p1, ticketNumber: '101031' } }),
        (await api.auditRecord.count({
          where: { recordId: (await eventOf('101031', 'COLLECTION')).id },
        })) > 0,
        await linesOf('101030'),
      ],
      [
        ['101031 · VOID', '101030 · COMPLETED'],
        [
          'Ticket 101030: loading 14:10–14:40 overlaps ticket 101031 on truck 730415. Flagged for review. (cleared)',
        ],
        0,
        true,
        ['101030 #1 VEG-HAUL-CY-15 45.5 × $7.50 = $341.25'],
      ],
    );

    story.at(
      on('15', '08:10'),
      'The tower confirms 101008 was C&D on top of vegetative debris: Luis accepts the debris type flag; the worker runs',
    );
    await reviewed(
      acceptFlagEndpoint,
      accepting(
        (await standingFlag('101008', 'DEBRIS_TYPE_MISMATCH')).id,
        await reasonId('Confirmed with the monitor'),
      ),
    );
    const oneAccepted = of(last.run, '101008');
    story.at(on('15', '08:15'), 'And the badge: he accepts the truck number flag; the worker runs');
    await reviewed(
      acceptFlagEndpoint,
      accepting((await standingFlag('101008', 'CERT_NUMBER_MISMATCH')).id, photosConfirm),
    );
    story.check(
      'AC-08-46 with one of its two flags accepted the ticket is still MANUAL_REVIEW; with the other accepted too, the worker marks it COMPLETED',
      [
        oneAccepted.map((line) => line.split(' · ')[1]),
        of(last.run, '101008'),
        await flagsOn('101008'),
      ],
      [
        ['MANUAL_REVIEW'],
        [
          "101008 · COMPLETED · Ticket 101008: debris type mismatch (collection Vegetative, disposal C&D). Flagged for review. · Ticket 101008: truck number doesn't match (collection 730415, disposal 730416). Flagged for review.",
        ],
        [
          'Ticket 101008: debris type mismatch (collection Vegetative, disposal C&D). Flagged for review. (accepted: Confirmed with the monitor)',
          "Ticket 101008: truck number doesn't match (collection 730415, disposal 730416). Flagged for review. (accepted: Photos confirm)",
        ],
      ],
    );

    story.at(
      on('15', '08:20'),
      '101032 came in empty, as the photographs show: Luis accepts its 0% flag; the worker runs',
    );
    const linesOn101032 = await linesOf('101032');
    await reviewed(acceptFlagEndpoint, accepting((await standingFlag('101032')).id, photosConfirm));
    story.check(
      'AC-08-47 the ticket is COMPLETED and still bills nothing: accepting never changes what bills',
      [of(last.run, '101032'), linesOn101032, await linesOf('101032')],
      [
        ['101032 · COMPLETED · Ticket 101032: load call 0%. Flagged for review; not billed.'],
        [],
        [],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('15', '08:30'),
      'Dana writes a load rule that names no contract: Disposal site EQUALS Old Quarry Pit → Void ticket; the worker runs',
    );
    const voidRule = {
      projectId: p1,
      formId: pricing.forms.load,
      name: 'Old Quarry Pit: void',
      contractId: null,
      active: true,
      criteria: [{ criterion: 'DISPOSAL_SITE', operator: 'EQUALS', picks: [quarry] }],
      actions: [{ kind: 'VOID_TICKET' }],
    } as const;
    const quarryRule = await saved(rules.save(dana, voidRule));
    const ruleJobs = await queue.waiting(p1);
    const voidNow = (
      await api.fieldEvent.findMany({
        where: { projectId: p1, status: 'VOID' },
        select: { ticketNumber: true },
        distinct: ['ticketNumber'],
        orderBy: { ticketNumber: 'asc' },
      })
    ).map((event) => event.ticketNumber);
    story.check(
      'AC-10-51, AC-10-54 saving the rule queued its job in the same piece of work, as a setup change Dana asked for: it names the load tickets, the rule’s form’s, and no ticket that is void and settled',
      [
        ruleJobs.map((job) => [job.trigger, names.get(job.requestedById)]),
        ruleJobs.flatMap((job) => job.tickets).filter((number) => voidNow.includes(number)),
        ruleJobs.flatMap((job) => job.tickets).every((number) => number.startsWith('1')),
        ruleJobs.flatMap((job) => job.tickets).includes('101009'),
      ],
      [[['SETUP_CHANGE', 'Dana']], [], true, true],
    );
    const byRule = await queue.next(p1);
    const ineligible = await api.flag.findFirstOrThrow({
      where: { projectId: p1, ticketNumber: '101009', code: 'INELIGIBLE_SITE' },
    });
    story.check(
      'the rule voids 101009: VOID, its $292.50 line removed by the system, its flag cleared; no person’s void stands behind it',
      [
        of(byRule, '101009'),
        await linesOf('101009'),
        (await removed()).at(-1),
        await flagsOn('101009'),
        await api.ticketVoid.count({ where: { ticketNumber: '101009' } }),
      ],
      [
        ['101009 · VOID'],
        [],
        ['system', 292.5],
        [
          'Ticket 101009: dumped at Old Quarry Pit, an ineligible site. Flagged for review. (cleared)',
        ],
        0,
      ],
    );
    story.at(
      on('15', '08:40'),
      'Luis unvoids 101009, the load and the rule unchanged; the worker runs',
    );
    const liftedRules = await reviewed(
      unvoidTicketEndpoint,
      unvoiding(load('101009'), 'Asked by the prime'),
    );
    story.check(
      'AC-08-38, AC-08-67 a rule’s void always wins: the run works the ticket again and the rule voids it again, naming the rule. No void’s record stood behind it to lift, and the unvoid still left its own, audited under Luis (the user: unvoiding anything always leaves an audit record); the system’s decision says the ticket was unvoided and worked again',
      [
        [names.get(liftedRules.record.unvoidedById), liftedRules.record.note],
        await auditOf('ticket_unvoid', liftedRules.record.id),
        await api.ticketVoid.count({ where: { ticketNumber: '101009' } }),
        of(last.run, '101009'),
        await decisionOf(last.run, '101009'),
        last.run === null
          ? []
          : (({ trigger, requestedById }) => [trigger, names.get(requestedById)])(
              await api.reconciliationRun.findUniqueOrThrow({ where: { id: last.run.runId } }),
            ),
        await linesOf('101009'),
      ],
      [
        ['Luis', 'Asked by the prime'],
        ['Luis · BACK_OFFICE · INSERT · Asked by the prime'],
        0,
        ['101009 · VOID'],
        [
          [
            'VOID',
            'Unvoided: worked again. Grouped on its project, its workflow and the number 101009: one collection and its disposal. Voided by the rule "Old Quarry Pit: void".',
          ],
        ],
        ['CORRECTION', 'Luis'],
        [],
      ],
    );
    story.check(
      'AC-10-106 Luis reads at its endpoint what each run decided for 101009, newest first: the run his unvoid asked for and the run the rule’s save asked for each left it VOID, voided by the rule; the run before priced its line',
      await decisionsOf('LOAD', '101009'),
      [
        'CORRECTION · VOID · voided by the rule "Old Quarry Pit: void"',
        'SETUP_CHANGE · VOID · voided by the rule "Old Quarry Pit: void"',
        'SETUP_CHANGE · MANUAL_REVIEW · #1 "VEG-HAUL-CY-15 - ROW VEG haul 0–15 mi" $292.50',
      ],
    );
    story.check(
      'AC-08-40 there is no "accepted void": the voided ticket has no flag that stands, and its cleared one can’t be accepted. Nothing a person can mark makes an unvoid stick against the rule',
      [
        (await flagsOn('101009')).filter((flag) => !flag.endsWith('(cleared)')),
        await refusal(acceptFlagEndpoint, accepting(ineligible.id, photosConfirm)),
      ],
      [
        [],
        '422 NOT_SAVED · FLAG_CLEARED: This flag no longer stands ("Ticket 101009: dumped at Old Quarry Pit, an ineligible site. Flagged for review."): there is nothing to accept. Nothing was saved.',
      ],
    );

    story.at(on('15', '08:50'), 'Dana switches the rule off; the worker runs');
    await saved(rules.save(dana, { ...voidRule, id: quarryRule.id, active: false }));
    const offJobs = (await queue.waiting(p1)).flatMap((job) => job.tickets);
    const ruleOff = await queue.next(p1);
    const stillVoid = [of(ruleOff, '101009'), await statusOf('101009')];
    story.at(
      on('15', '08:55'),
      'Luis unvoids 101009. Nobody asks the worker: the unvoid queued its job, and the worker takes it up',
    );
    await reviewed(unvoidTicketEndpoint, unvoiding(load('101009')));
    story.check(
      'AC-08-39, AC-08-67, AC-10-54 switching the rule off brings nothing back by itself: its job doesn’t name the void ticket, settled until a person unvoids it. Unvoided with the rule off, the ticket is worked by the job the unvoid queued, since the unvoid is a record the worker reads; it stays un-voided and is priced: 65 × 60% = 39 CY × $7.50 = $292.50, in review for the ineligible site',
      [stillVoid, offJobs.includes('101009'), of(last.run, '101009'), await linesOf('101009')],
      [
        [[], ['VOID']],
        false,
        [
          '101009 · MANUAL_REVIEW · Ticket 101009: dumped at Old Quarry Pit, an ineligible site. Flagged for review.',
        ],
        ['101009 #1 VEG-HAUL-CY-15 39 × $7.50 = $292.50'],
      ],
    );

    story.at(on('15', '09:00'), 'Dana switches the rule back on; the worker runs');
    await saved(rules.save(dana, { ...voidRule, id: quarryRule.id, active: true }));
    const ruleOn = await queue.next(p1);
    story.at(
      on('15', '09:05'),
      'The tower’s photographs show 101009 was dumped at Marsh Road TDSR: Luis corrects its disposal’s site and GPS; the worker runs',
    );
    const dis101009 = await eventOf('101009', 'DISPOSAL');
    const correctedVoid = await reviewed(correctFieldEventEndpoint, {
      ids: { fieldEventId: dis101009.id },
      json: {
        changes: { siteId: tdsr, end: { latitude: '39.09030000', longitude: '-75.62020000' } },
      },
    });
    const correctedOnly = [of(last.run, '101009'), await statusOf('101009')];
    story.at(on('15', '09:10'), 'Then he unvoids it; the worker runs');
    await reviewed(unvoidTicketEndpoint, unvoiding(load('101009')));
    story.check(
      'AC-08-39 voided again by the rule, the ticket’s field event is corrected like any other, and that alone brings nothing back: a person’s unvoid does. Unvoided, the rule no longer passes and the ticket stays un-voided',
      [
        of(ruleOn, '101009'),
        correctedVoid.record.siteId === tdsr,
        correctedOnly,
        of(last.run, '101009'),
        await linesOf('101009'),
      ],
      [
        ['101009 · VOID'],
        true,
        [[], ['VOID']],
        ['101009 · COMPLETED'],
        ['101009 #1 VEG-HAUL-CY-15 39 × $7.50 = $292.50'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('15', '09:20'),
      'Old Quarry Pit’s permit is outstanding, and the county has it in hand: Luis accepts the site’s flag; the worker runs',
    );
    const permit = await api.flag.findFirstOrThrow({
      where: { projectId: p1, disposalSiteId: quarry, clearedAt: null },
    });
    const onTheSite = await reviewed(
      acceptFlagEndpoint,
      accepting(
        permit.id,
        await reasonId('Confirmed with the monitor'),
        'County has the application',
      ),
    );
    const siteFlags = async () =>
      (
        await api.flag.findMany({
          where: { projectId: p1, disposalSiteId: quarry },
          include: { acceptances: true },
        })
      ).map((flag) => [flag.message, flag.acceptances.length, flag.clearedAt]);
    story.check(
      'AC-08-51 a flag on a record that isn’t a ticket is accepted like any other, queues no ticket, and isn’t raised again while its facts stand',
      [onTheSite.queued?.tickets, await siteFlags()],
      [0, [['Old Quarry Pit: permit outstanding.', 1, null]]],
    );

    // ------------------------------------------------------------------------------------------
    story.at(on('15', '12:00'), 'What the records hold of the review');
    const voidTickets = [
      ...new Set(
        (await api.fieldEvent.findMany({ where: { projectId: p1, status: 'VOID' } })).map(
          (event) => event.ticketNumber,
        ),
      ),
    ].sort();
    story.check(
      'AC-08-42 a ticket is VOID only because a person voided it with a reason or a rule’s Void ticket ran: every ticket that stands void has a person’s void in force, and the worker voided nothing on its own',
      [
        voidTickets,
        (
          await api.ticketVoid.findMany({
            where: { projectId: p1, liftedAt: null },
            include: { reason: true },
            orderBy: { ticketNumber: 'asc' },
          })
        ).map((each) => [each.ticketNumber, each.reason.name, names.get(each.voidedById)]),
      ],
      [
        ['101031', '301005'],
        [
          ['101031', 'Work never happened', 'Luis'],
          ['301005', 'Not eligible work', 'Luis'],
        ],
      ],
    );
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
    const statusChanges = await api.auditRecord.findMany({
      where: { tableName: 'field_event', operation: 'UPDATE', changedFields: { has: 'status' } },
    });
    const marksAudited = await api.auditRecord.findMany({
      where: { tableName: { in: ['ticket_void', 'ticket_unvoid', 'flag_acceptance'] } },
    });
    story.check(
      'AC-08-07 every void, unvoid and acceptance is in the audit log under Luis, from the back office, never under the system; no person wrote a completed record, a line, a flag, a run or a decision, and none set a field event’s status',
      [
        [
          ...new Set(
            marksAudited.map((record) => `${names.get(record.actorId) ?? ''} · ${record.source}`),
          ),
        ],
        byPeople.length,
        statusChanges.every((record) => record.actorId === systemActorId),
      ],
      [['Luis · BACK_OFFICE'], 0, true],
    );
  },
};
