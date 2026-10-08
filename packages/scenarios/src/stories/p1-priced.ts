// The tenth story (BACKLOG 1.7.2; ADR-359; spec/acceptance/07-pricing-ledger-audit.md AC-07-10,
// 44, 64, 66, 72, 84, 92…95, 98, 99, 101…103, 107, 110, 112; AC-01-68): the worker prices. P1's
// Monday and Tuesday are the story `p1-field-days`' own, sent at its phones' syncs; P1 has the
// golden mission's pay items and rules, and a second prime, Summit, with a contract of its own
// and, at first, no rule.
//
// After each sync the worker runs and the story reads the ledger: every line the golden mission
// §2 gives, to the cent. Then what the ledger promises: a run over unchanged input leaves every
// line as it is; a corrected load call removes the line, copied in full to the audit log first,
// and writes the new one, with no reversal; a failure part-way keeps the old lines; a rate or a
// rule that changes regenerates the tickets it touches and no other, and never one locked as
// invoiced; a pricing flag is cleared once the setup is fixed; a rule's Void ticket removes the
// ticket's lines, and the ticket stays void, out of every later run, until a person unvoids it.
//
// Not here: correcting, voiding and locking as a reviewer's actions, with their permissions and
// reasons (Milestone 1.8): where this story needs one it writes it as the API's login may, to
// show what the worker does when the ticket comes back. A person's void and unvoid (1.8.4).
// The golden mission in full, with P2, is 1.9.1.
import { ContractorSetup, PayItemSetup, RuleSetup, SiteSetup } from '@open-adms/api';
import { Prisma, systemActorId, type Database } from '@open-adms/db';
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
  primaryBox,
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

const dollars = (cents: number): string =>
  `$${Math.trunc(cents / 100).toLocaleString('en-US')}.${String(cents % 100).padStart(2, '0')}`;

export const p1Priced: Story = {
  name: 'p1-priced',
  title:
    'The worker prices P1’s Monday and Tuesday: the golden mission’s lines to the cent; lines regenerated, never reversed, each removed one copied to the audit log first; a rate, a rule and a void; two primes',
  timeZone,
  start: on('08', '08:00'),

  async run(story) {
    const { api, worker, clock } = story;
    const office = await p1FieldDaysHeld(story);
    const { held, dana, luis, p1, coastline } = office;

    // ------------------------------------------------------------------------------------------
    story.at(on('08', '08:40'), 'Thursday: Dana loads P1’s map, its boundary and three zones');
    await loadP1Map(story, office);

    story.at(
      on('08', '10:00'),
      'Dana enters P1’s load, haul-out, fee, fill and freon pay items with Coastline’s rate on each, links the Landfill to its tipping fee, and writes the rules, each naming "Coastline, Bayline ROW 2026" (golden mission §1)',
    );
    const pricing = await setUpP1Pricing(story, office);
    const rulesOf = async (): Promise<string[]> =>
      (
        await api.rule.findMany({
          where: { projectId: p1, archivedAt: null },
          include: { contract: true, form: true },
          orderBy: [{ documentType: 'asc' }, { name: 'asc' }],
        })
      ).map(
        (rule) =>
          `${rule.form.name} · ${rule.name} · ${rule.contract?.name ?? 'no contract'}${rule.active ? '' : ' · off'}`,
      );
    story.check(
      'P1 has the golden mission’s fifteen pay items and sixteen rules, every rule on Coastline’s contract',
      [
        await api.payItem.count({ where: { projectId: p1 } }),
        (await rulesOf()).length,
        [...new Set((await rulesOf()).map((rule) => rule.split(' · ')[2]))],
      ],
      [15, 16, ['Coastline, Bayline ROW 2026']],
    );

    story.at(
      on('09', '09:00'),
      'Friday: Summit Debris Services joins P1 as a second prime, with its own contract, "Summit, Bayline ROW 2026". Nobody has priced its work yet',
    );
    const contractors = new ContractorSetup(api, clock, story.policy);
    const summit = (
      await saved(contractors.contractor(dana, { name: 'Summit Debris Services', kind: 'HAULER' }))
    ).id;
    await saved(contractors.addPrime(dana, p1, summit));
    await saved(
      contractors.contract(dana, {
        projectId: p1,
        name: 'Summit, Bayline ROW 2026',
        primeId: summit,
      }),
    );

    story.at(
      on('10', '09:10'),
      'Saturday: Sam Grant certifies P1’s three containers and two crews, then Summit’s truck on the pre-printed sheet 88120, 28 CY',
    );
    const certify = await certifyP1(story, office);
    await certify('11:20', {
      certNumber: '88120',
      primeId: summit,
      vehicleTypeId: (
        await api.vehicleType.findFirstOrThrow({ where: { name: 'Hydraulic Dump Trailer' } })
      ).id,
      boxes: [primaryBox(240, 90, 60)],
    });

    // ------------------------------------------------------------------------------------------
    const settings = { crewItemHoursLimit: story.policy.crewDayHours, longestRunMs: 600_000 };
    const mileages = new Mileages(new MapServers(localMapServers()));
    const reconciliation = new Reconciliation(worker, clock, settings, mileages);
    const sync = { projectId: p1, trigger: 'SYNC' } as const;
    const setupChange = { projectId: p1, trigger: 'SETUP_CHANGE' } as const;
    const askedByLuis = { projectId: p1, trigger: 'CORRECTION', requestedById: luis } as const;

    // The ledger as it stands: every line with its ticket (and property or pile), its #, its
    // pay item, quantity × rate = amount, and whose work it is.
    const lines = async () => {
      const rows = await api.transaction.findMany({
        where: { projectId: p1 },
        include: {
          payItem: true,
          prime: true,
          operatingSub: true,
          completedLoad: true,
          completedLoadCollection: true,
          completedHaulOut: true,
          completedHaulOutCollection: true,
          fieldEvent: true,
        },
      });
      return rows
        .map((row) => {
          const suffix =
            row.completedLoadCollection?.splitSuffix ??
            row.completedHaulOutCollection?.splitSuffix ??
            '';
          const number =
            row.completedLoad?.ticketNumber ??
            row.completedHaulOut?.ticketNumber ??
            row.fieldEvent?.ticketNumber ??
            '';
          return {
            id: row.id,
            ticket: `${number}${suffix === '' ? '' : `-${suffix}`}`,
            cents: Number(row.amount.toFixed(2).replace('.', '')),
            runId: row.reconciliationRunId,
            line: `${number}${suffix === '' ? '' : `-${suffix}`} #${String(row.slot)} ${row.payItem.code} ${row.quantity.toString()} × $${row.rate.toFixed(2)} = $${row.amount.toFixed(2)}`,
            whose: `${row.prime.name}${row.operatingSub === null ? '' : ` + ${row.operatingSub.name}`}`,
          };
        })
        .sort((left, right) => (left.line < right.line ? -1 : 1));
    };
    const ledger = async (): Promise<string[]> => (await lines()).map((each) => each.line);
    const linesOf = async (ticketNumber: string): Promise<string[]> =>
      (await lines())
        .filter((each) => each.ticket.startsWith(ticketNumber))
        .map((each) => each.line);
    const total = async (): Promise<[number, string]> => {
      const all = await lines();
      return [all.length, dollars(all.reduce((sum, each) => sum + each.cents, 0))];
    };
    const statusOf = async (ticketNumber: string): Promise<string[]> => [
      ...new Set(
        (await api.fieldEvent.findMany({ where: { ticketNumber } })).map((event) => event.status),
      ),
    ];
    const flagsOn = async (ticketNumber: string): Promise<string[]> =>
      (await api.flag.findMany({ where: { ticketNumber }, orderBy: { id: 'asc' } })).map(
        (flag) => `${flag.message}${flag.clearedAt === null ? '' : ' (cleared)'}`,
      );
    // The audit log's record of each line removed: the whole row, as it stood.
    const removals = async () =>
      (
        await api.auditRecord.findMany({
          where: { tableName: 'transaction', operation: 'DELETE' },
          orderBy: { id: 'asc' },
        })
      ).map((record) => ({
        actor: record.actorId === systemActorId ? 'system' : record.actorId,
        source: record.source,
        row: record.priorValue as Record<string, unknown>,
      }));
    const ids = async (): Promise<string[]> => (await lines()).map((each) => each.id).sort();
    const audited = (tableName: string): Promise<number> =>
      api.auditRecord.count({ where: { tableName } });

    const phones = new P1Syncs(story, held);
    const [mondayEvening, tuesdayEvening, wednesdayMorning] = phones.times;
    if (
      mondayEvening === undefined ||
      tuesdayEvening === undefined ||
      wednesdayMorning === undefined
    ) {
      throw new Error('The field days synced fewer than three times.');
    }

    // ------------------------------------------------------------------------------------------
    story.at(mondayEvening.toISOString(), 'Monday evening at the yard: the phones find signal');
    await phones.arrive(mondayEvening);
    await phones.crewPhotographs(mondayEvening);
    story.at(on('12', '18:45'), 'The worker runs on P1');
    const monday = await reconciliation.run(sync);
    story.check(
      'Monday’s tickets: all whole but the preload 101004; 101003 in review for its 96% call',
      told(monday),
      [
        '101001 · COMPLETED',
        '101002 · COMPLETED',
        '101003 · MANUAL_REVIEW · Ticket 101003: load call 96%. Flagged for review.',
        '101004 · PENDING',
        '301001 · COMPLETED',
        '301002 · COMPLETED',
        '301003 · COMPLETED',
      ],
    );
    story.check(
      'AC-07-10, 72 Monday’s ledger, each line the golden mission’s: 101002 carries two, its hauling line and the Landfill’s tipping fee; 101003 bills while it is in review; 101004, still waiting for its disposal, has none',
      await ledger(),
      [
        '101001 #1 VEG-HAUL-CY-15 52 × $7.50 = $390.00',
        '101002 #1 CD-HAUL-CY-15 36 × $8.25 = $297.00',
        '101002 #2 TIP-FEE-CY-BCL 36 × $4.00 = $144.00',
        '101003 #1 VEG-HAUL-CY-15 62.4 × $7.50 = $468.00',
        '301001 #1 HNG-RMV-EA 1 × $68.00 = $68.00',
        '301002 #1 LNR-RMV-EA-24 1 × $95.00 = $95.00',
        '301003 #1 HNG-RMV-EA 1 × $68.00 = $68.00',
      ],
    );
    story.check(
      'every line records prime Coastline; 101002’s, hauled by Rivera’s self-loader, operating sub Rivera too, at Coastline’s rate',
      [...new Set((await lines()).map((each) => `${each.ticket.slice(0, 6)}: ${each.whose}`))],
      [
        '101001: Coastline Haulers LLC',
        '101002: Coastline Haulers LLC + Rivera Trucking',
        '101003: Coastline Haulers LLC',
        '301001: Coastline Haulers LLC',
        '301002: Coastline Haulers LLC',
        '301003: Coastline Haulers LLC',
      ],
    );
    const mondayRun = monday.ran ? monday.runId : '';
    story.check(
      'AC-07-92, 107 each ticket’s lines were written in the same run, and the same piece of work, as its completed record, flags and status: every line names Monday’s run, and each was audited as written by the system actor',
      [
        [...new Set((await lines()).map((each) => each.runId === mondayRun))],
        (await api.auditRecord.findMany({ where: { tableName: 'transaction' } })).map(
          (record) =>
            `${record.operation} ${record.source} ${String(record.actorId === systemActorId)}`,
        ),
        (
          await api.reconciliationDecision.findMany({
            where: { reconciliationRunId: mondayRun },
            orderBy: { ticketNumber: 'asc' },
          })
        ).map((decision) => {
          const summary = decision.summary as { linesWritten?: number };
          return `${decision.ticketNumber} ${String(summary.linesWritten)}`;
        }),
      ],
      [
        [true],
        Array.from({ length: 7 }, () => 'INSERT SYSTEM true'),
        ['101001 1', '101002 2', '101003 1', '101004 0', '301001 1', '301002 1', '301003 1'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      tuesdayEvening.toISOString(),
      'Tuesday evening: every phone but the Marsh Road tower’s finds signal',
    );
    await phones.arrive(tuesdayEvening);
    await phones.crewPhotographs(tuesdayEvening);
    story.at(on('13', '18:45'), 'The worker runs');
    const tuesday = await reconciliation.run(sync);
    story.check(
      'Tuesday night: 101004, 101005 and 101006 wait for the disposals on the tower’s dead phone; 301005, a 20 in stump no band fits, is in review',
      told(tuesday),
      [
        '101001 · COMPLETED',
        '101002 · COMPLETED',
        '101003 · MANUAL_REVIEW · Ticket 101003: load call 96%. Flagged for review.',
        '101004 · PENDING',
        '101005 · PENDING',
        '101006 · PENDING',
        '201001 · COMPLETED',
        '201004 · COMPLETED',
        '301001 · COMPLETED',
        '301002 · COMPLETED',
        '301003 · COMPLETED',
        '301004 · COMPLETED',
        '301005 · MANUAL_REVIEW · Ticket 301005: not an eligible stump (20 in, under 24 in). Flagged for review. · Ticket 301005: no survey. Flagged for review.',
        '301006 · COMPLETED',
        '301007 · COMPLETED',
      ],
    );
    story.check(
      'AC-07-66, 112 Tuesday night’s ledger, each line the golden mission’s: the haul-out to the Landfill by the CY with its tipping fee; the split haul-out to Cypress Creek by the ton, once per pile; the stump and its fill; the white goods’ six items and two freon recoveries; the crew’s highest hours, once. 301005 has no line',
      await ledger(),
      [
        '101001 #1 VEG-HAUL-CY-15 52 × $7.50 = $390.00',
        '101002 #1 CD-HAUL-CY-15 36 × $8.25 = $297.00',
        '101002 #2 TIP-FEE-CY-BCL 36 × $4.00 = $144.00',
        '101003 #1 VEG-HAUL-CY-15 62.4 × $7.50 = $468.00',
        '201001 #1 MULCH-HO-CY 99 × $5.10 = $504.90',
        '201001 #2 TIP-FEE-CY-BCL 99 × $4.00 = $396.00',
        '201004-A #1 MULCH-HO-TN 2.82 × $20.00 = $56.40',
        '201004-B #1 MULCH-HO-TN 7.06 × $20.00 = $141.20',
        '201004-C #1 MULCH-HO-TN 14.12 × $20.00 = $282.40',
        '301001 #1 HNG-RMV-EA 1 × $68.00 = $68.00',
        '301002 #1 LNR-RMV-EA-24 1 × $95.00 = $95.00',
        '301003 #1 HNG-RMV-EA 1 × $68.00 = $68.00',
        '301004 #1 STP-RMV-EA-36 1 × $110.00 = $110.00',
        '301004 #2 STP-FILL-CY 4.8 × $22.00 = $105.60',
        '301006 #1 WG-RMV-EA 6 × $40.00 = $240.00',
        '301006 #2 WG-FRN-EA 2 × $25.00 = $50.00',
        '301007 #1 CREW-TIME-HR 9.75 × $150.00 = $1462.50',
      ],
    );
    story.check('seventeen lines, $4,879.00', await total(), [17, '$4,879.00']);

    // ------------------------------------------------------------------------------------------
    story.at(
      wednesdayMorning.toISOString(),
      'Wednesday: P1-TWR-TDSR is charged and syncs Tuesday’s work',
    );
    await phones.arrive(wednesdayMorning);
    story.at(on('14', '07:20'), 'The worker runs');
    const beforeWednesday = await ids();
    await reconciliation.run(sync);
    const afterWednesday = await ids();
    story.check(
      'AC-07-112 P1’s Monday and Tuesday priced, before any review: the tower’s disposals pair 101004 (24.0 CY, $180.00) and 101005 (45.5 CY, $341.25); 101006 still waits for the disposal typed as 101060',
      [await linesOf('101004'), await linesOf('101005'), await linesOf('101006'), await total()],
      [
        ['101004 #1 VEG-HAUL-CY-15 24 × $7.50 = $180.00'],
        ['101005 #1 VEG-HAUL-CY-15 45.5 × $7.50 = $341.25'],
        [],
        [19, '$5,400.25'],
      ],
    );
    story.check(
      'the seventeen lines that stood are the same records: the run wrote two lines and removed none',
      [
        beforeWednesday.filter((id) => !afterWednesday.includes(id)).length,
        afterWednesday.filter((id) => !beforeWednesday.includes(id)).length,
        (await removals()).length,
      ],
      [0, 2, 0],
    );

    story.at(on('14', '07:30'), 'The worker runs again, with nothing changed');
    const standing = await ids();
    const auditedLines = await audited('transaction');
    await reconciliation.run({ projectId: p1, trigger: 'REPROCESS', requestedById: luis });
    story.check(
      'AC-07-101 the ledger shows the same lines, each the same record: nothing was removed, nothing written, and the audit log holds no new record of a line',
      [await ids(), await audited('transaction'), await total()],
      [standing, auditedLines, [19, '$5,400.25']],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '08:00'),
      'Luis corrects 101001’s load call from 80% to 70% (the correction itself is Part 8’s). The worker runs, and the database refuses the new line (the story makes it so)',
    );
    const correct = (where: Prisma.FieldEventWhereInput, data: { loadCall?: number }) =>
      api.$write({ actorId: luis, source: 'BACK_OFFICE', reason: 'Correction' }, async (tx) => {
        const event = await tx.fieldEvent.findFirstOrThrow({ where });
        await tx.fieldEvent.update({ where: { id: event.id }, data });
      });
    const dis101001 = { ticketNumber: '101001', kind: 'DISPOSAL' } as const;
    const lineOf101001 = (await lines()).find((each) => each.ticket === '101001');
    const loadOf101001 = await api.completedLoad.findFirstOrThrow({
      where: { ticketNumber: '101001' },
    });
    await correct(dis101001, { loadCall: 70 });
    // The worker's own client, but no line can be written: the old line was removed just before,
    // inside the same piece of work.
    const refusingALine: Database = new Proxy(worker, {
      get(target, property) {
        if (property !== '$write') return Reflect.get(target, property) as unknown;
        const write: Database['$write'] = (actor, work) =>
          target.$write(actor, (tx) =>
            work(
              new Proxy(tx, {
                get(inner, name) {
                  if (name !== 'transaction') return Reflect.get(inner, name) as unknown;
                  return new Proxy(inner.transaction, {
                    get(transactions, method) {
                      if (method !== 'create') return Reflect.get(transactions, method) as unknown;
                      return () => {
                        throw new Error('The database refused the line.');
                      };
                    },
                  });
                },
              }),
            ),
          );
        return write;
      },
    });
    const failed = await new Reconciliation(refusingALine, clock, settings, mileages).run(
      askedByLuis,
    );
    story.check(
      'AC-07-102 none of 101001’s work is kept: its $390.00 line is still there, the same record, no removal is in the audit log, and its completed load still says 52.0 CY; the ticket is flagged "could not be processed", and the flag says its lines are as of its last run (the user, ADR-360)',
      [
        told(failed).filter((line) => line.startsWith('101001')),
        await linesOf('101001'),
        (await lines()).find((each) => each.ticket === '101001')?.id === lineOf101001?.id,
        (await removals()).length,
        (
          await api.completedLoad.findUniqueOrThrow({ where: { id: loadOf101001.id } })
        ).volumeCy?.toFixed(1),
      ],
      [
        [
          '101001 · COMPLETED · error: The database refused the line. · Ticket 101001: could not be processed. Flagged for review; its lines are as of its last run.',
        ],
        ['101001 #1 VEG-HAUL-CY-15 52 × $7.50 = $390.00'],
        true,
        0,
        '52.0',
      ],
    );

    story.at(on('14', '08:10'), 'The worker runs again, with nothing in its way');
    await reconciliation.run(askedByLuis);
    const [removed390] = await removals();
    story.check(
      'AC-07-93, 94 101001 was COMPLETED and is reprocessed in place: one completed load, the same record, now 45.5 CY; one line, 45.5 × $7.50 = $341.25; no reversal row',
      [
        await statusOf('101001'),
        (await api.completedLoad.findMany({ where: { ticketNumber: '101001' } })).map((load) => [
          load.id === loadOf101001.id,
          load.volumeCy?.toFixed(1),
        ]),
        await linesOf('101001'),
        (await lines()).filter((each) => each.cents < 0).length,
        await total(),
      ],
      [
        ['COMPLETED'],
        [[true, '45.5']],
        ['101001 #1 VEG-HAUL-CY-15 45.5 × $7.50 = $341.25'],
        0,
        [19, '$5,351.50'],
      ],
    );
    story.check(
      'AC-07-93, 110 the $390.00 line is in the audit log alone, whole, as the database copied it before it went: its #, pay item, quantity, rate, amount, rule, contract, prime and the run that wrote it, removed by the system actor',
      [
        (await removals()).length,
        removed390?.actor,
        removed390?.source,
        removed390?.row['id'] === lineOf101001?.id,
        removed390?.row['slot'],
        removed390?.row['pay_item_id'] === pricing.payItems['VEG-HAUL-CY-15'],
        Number(removed390?.row['quantity']),
        Number(removed390?.row['rate']),
        Number(removed390?.row['amount']),
        removed390?.row['unit'],
        removed390?.row['prime_id'] === coastline,
        removed390?.row['contract_id'] === office.contract,
        typeof removed390?.row['rule_id'],
        removed390?.row['reconciliation_run_id'] === mondayRun,
        removed390?.row['completed_load_id'] === loadOf101001.id,
      ],
      [1, 'system', 'SYSTEM', true, 1, true, 52, 7.5, 390, 'CY', true, true, 'string', true, true],
    );
    story.check(
      'AC-07-110 the audit log also shows the load call as it stood, 80%, corrected by Luis Ortega',
      (
        await api.auditRecord.findMany({
          where: {
            tableName: 'field_event',
            operation: 'UPDATE',
            changedFields: { has: 'load_call' },
          },
        })
      ).map((record) => [
        record.actorId === luis,
        (record.priorValue as Record<string, unknown>)['load_call'],
        (record.newValue as Record<string, unknown>)['load_call'],
      ]),
      [[true, 80, 70]],
    );

    story.at(on('14', '08:30'), 'The call was right: Luis puts 80% back; the worker runs');
    await correct(dis101001, { loadCall: 80 });
    await reconciliation.run(askedByLuis);
    story.check(
      '101001 bills $390.00 again, a new line; the $341.25 one is in the audit log beside the first',
      [await linesOf('101001'), (await removals()).map((each) => Number(each.row['amount']))],
      [['101001 #1 VEG-HAUL-CY-15 52 × $7.50 = $390.00'], [390, 341.25]],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '09:00'),
      'Luis locks 101004 as invoiced (the lock itself is Part 9’s). Dana changes Coastline’s rate on VEG-HAUL-CY-15 from $7.50 to $7.75; the worker runs',
    );
    const loadOf101004 = await api.completedLoad.findFirstOrThrow({
      where: { ticketNumber: '101004' },
    });
    await api.$write({ actorId: luis, source: 'BACK_OFFICE' }, (tx) =>
      tx.invoiceLock.create({
        data: { projectId: p1, completedLoadId: loadOf101004.id, lockedById: luis },
      }),
    );
    const rateTo = (rate: string) =>
      saved(
        new PayItemSetup(api, clock, story.policy).rate(
          dana,
          pricing.payItems['VEG-HAUL-CY-15'] ?? '',
          coastline,
          rate,
        ),
      );
    const beforeRate = await lines();
    await rateTo('7.75');
    const rated = await reconciliation.run(setupChange);
    const afterRate = await lines();
    story.check(
      'AC-07-98 every un-invoiced ticket with a line on the pay item is regenerated: 101001 52.0 × $7.75 = $403.00, 101003 $483.60, 101005 $352.63 (45.5 × $7.75 = $352.625, a half up). 101004, locked, keeps its line at $7.50 and is left as it is',
      [
        afterRate.filter((each) => each.line.includes('VEG-HAUL-CY-15')).map((each) => each.line),
        (
          await api.reconciliationDecision.findMany({
            where: { reconciliationRunId: rated.ran ? rated.runId : '', ticketNumber: '101004' },
          })
        ).map((decision) => (decision.summary as { why?: string }).why),
      ],
      [
        [
          '101001 #1 VEG-HAUL-CY-15 52 × $7.75 = $403.00',
          '101003 #1 VEG-HAUL-CY-15 62.4 × $7.75 = $483.60',
          '101004 #1 VEG-HAUL-CY-15 24 × $7.50 = $180.00',
          '101005 #1 VEG-HAUL-CY-15 45.5 × $7.75 = $352.63',
        ],
        ['Locked as invoiced: left as it is.'],
      ],
    );
    story.check(
      'AC-07-98 only those three tickets were touched: each old line went through the same copy-then-remove path, and the sixteen other lines are the same records',
      [
        (await removals()).map((each) => Number(each.row['amount'])),
        afterRate.filter((each) => beforeRate.some((before) => before.id === each.id)).length,
        await total(),
      ],
      [[390, 341.25, 390, 468, 341.25], 16, [19, '$5,440.23']],
    );
    story.at(on('14', '09:20'), 'The rate was right: Dana puts $7.50 back; the worker runs');
    await rateTo('7.50');
    await reconciliation.run(setupChange);
    story.check('the ledger is Wednesday morning’s again', await total(), [19, '$5,400.25']);

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '09:40'),
      'Dana switches the stump hole fill’s rule off in the rule builder; the worker runs',
    );
    const rules = new RuleSetup(api, clock, story.policy);
    const fill = { ...pricing.fillRule.input, id: pricing.fillRule.id };
    const stumpLine = (await lines()).find((each) => each.line.startsWith('301004 #1'));
    await saved(rules.save(dana, { ...fill, active: false }));
    await reconciliation.run(setupChange);
    story.check(
      'AC-07-99 the one ticket the rule touched is regenerated: 301004 loses its fill line, copied to the audit log first, and keeps its stump line, the same record; nothing is flagged, since a rule still adds a line',
      [
        await linesOf('301004'),
        (await lines()).find((each) => each.line.startsWith('301004 #1'))?.id === stumpLine?.id,
        (await removals()).map((each) => Number(each.row['amount'])).at(-1),
        await flagsOn('301004'),
        await total(),
      ],
      [['301004 #1 STP-RMV-EA-36 1 × $110.00 = $110.00'], true, 105.6, [], [18, '$5,294.65']],
    );
    story.at(on('14', '09:50'), 'She switches it back on; the worker runs');
    await saved(rules.save(dana, { ...fill, active: true }));
    await reconciliation.run(setupChange);
    story.check(
      'the fill line is written again, 4.8 × $22.00 = $105.60',
      [await linesOf('301004'), await total()],
      [
        [
          '301004 #1 STP-RMV-EA-36 1 × $110.00 = $110.00',
          '301004 #2 STP-FILL-CY 4.8 × $22.00 = $105.60',
        ],
        [19, '$5,400.25'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '12:00'),
      'Wednesday morning’s two loads sync: 101044, Summit’s truck 88120 from Heron St to Marsh Road TDSR, called 50%; and 101009, the dump trailer 730415 from Heron St to Old Quarry Pit, an ineligible site Dana entered that morning, called 60%',
    );
    const other = await api.siteType.findFirstOrThrow({ where: { name: 'Other' } });
    const quarry = (
      await saved(
        new SiteSetup(api, clock, story.policy).site(dana, {
          projectId: p1,
          name: 'Old Quarry Pit',
          siteTypeId: other.id,
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
    // The story `p1-field-days` ends on Tuesday, so each record is made as the phone that
    // recorded Monday's 101001 (and the Landfill tower's 101002) would have sent it.
    const heldEvent = (ticketNumber: string, kind: 'COLLECTION' | 'DISPOSAL') => {
      const found = held.find(
        ({ sent }) =>
          sent.record === 'FIELD_EVENT' &&
          sent.fieldEvent.ticketNumber === ticketNumber &&
          sent.fieldEvent.kind === kind,
      )?.sent;
      if (found?.record !== 'FIELD_EVENT') throw new Error(`No ${kind} on ${ticketNumber}`);
      return found.fieldEvent;
    };
    const send = async (
      like: ReturnType<typeof heldEvent>,
      from: string,
      to: string,
      more: Partial<ReturnType<typeof heldEvent>>,
    ): Promise<void> => {
      const startedAt = new Date(on('14', from));
      const endedAt = new Date(on('14', to));
      const record: PhoneRecord = {
        record: 'FIELD_EVENT',
        fieldEvent: {
          ...like,
          id: uuidv7(startedAt),
          startedAt,
          endedAt,
          deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, endedAt),
          ...more,
        },
      };
      const answer = await story.intake.receive(record);
      if (answer.answer !== 'SAVED') throw new Error(`Not saved: ${answer.answer}`);
    };
    const collected = heldEvent('101001', 'COLLECTION');
    const fromHeronSt = { address: null, addressSource: null };
    await send(collected, '09:30', '09:50', {
      ...fromHeronSt,
      ticketNumber: '101044',
      certNumber: '88120',
    });
    await send(heldEvent('101001', 'DISPOSAL'), '10:20', '10:30', {
      ticketNumber: '101044',
      certNumber: '88120',
      loadCall: 50,
    });
    await send(collected, '10:00', '10:20', { ...fromHeronSt, ticketNumber: '101009' });
    await send(heldEvent('101002', 'DISPOSAL'), '10:55', '11:05', {
      ticketNumber: '101009',
      certNumber: '730415',
      formDebrisTypeId: collected.formDebrisTypeId,
      loadCall: 60,
      siteId: quarry,
      endLatitude: '39.20000000',
      endLongitude: '-75.65000000',
    });
    story.at(on('14', '12:10'), 'The worker runs');
    const noon = await reconciliation.run(sync);
    story.check(
      'AC-07-84 Summit’s 101044 has no line: no rule on a Summit contract adds one, and the flag names the ticket’s prime. No Coastline rule ran on it. 101009 is flagged for the ineligible site and bills',
      [
        told(noon).filter((line) => /^1010(44|09)/.test(line)),
        await linesOf('101044'),
        await linesOf('101009'),
      ],
      [
        [
          '101009 · MANUAL_REVIEW · Ticket 101009: dumped at Old Quarry Pit, an ineligible site. Flagged for review.',
          '101044 · MANUAL_REVIEW · Ticket 101044: no pricing rule on a Summit Debris Services contract matches. Flagged for review; not billed.',
        ],
        [],
        ['101009 #1 VEG-HAUL-CY-15 39 × $7.50 = $292.50'],
      ],
    );

    story.at(
      on('14', '12:30'),
      'Dana prices Summit’s work: she enters Summit’s rate, $7.80, on VEG-HAUL-CY-15 and saves its "Pays when" again; the worker runs',
    );
    const veg15 = pricing.payItems['VEG-HAUL-CY-15'] ?? '';
    const payItemsBefore = await api.payItem.count({ where: { projectId: p1 } });
    await saved(new PayItemSetup(api, clock, story.policy).rate(dana, veg15, summit, '7.80'));
    const kept = await saved(
      new PayItemSetup(api, clock, story.policy).paysWhen(dana, veg15, [
        {
          formId: pricing.forms.load,
          slot: 1,
          criteria: [
            { criterion: 'DEBRIS_TYPE', operator: 'EQUALS', picks: [pricing.vegetative] },
            { criterion: 'MILEAGE', operator: 'AT_MOST', numberFrom: 15 },
          ],
        },
      ]),
    );
    story.check(
      'AC-01-68 the pay item isn’t copied: it now keeps two rules, Coastline’s unchanged and Summit’s own, naming "Summit, Bayline ROW 2026"; neither has a Contractor criterion',
      [
        [kept.added.length, kept.unchanged.length, kept.changed.length],
        (await api.payItem.count({ where: { projectId: p1 } })) === payItemsBefore,
        (
          await api.rule.findMany({
            where: { fromPayItemId: veg15, archivedAt: null },
            include: { contract: true },
            orderBy: { id: 'asc' },
          })
        ).map((rule) => rule.contract?.name),
        await api.ruleCriterion.count({
          where: { rule: { fromPayItemId: veg15 }, criterion: 'CONTRACTOR' },
        }),
      ],
      [[1, 1, 0], true, ['Coastline, Bayline ROW 2026', 'Summit, Bayline ROW 2026'], 0],
    );
    const beforeSummit = await lines();
    await reconciliation.run(setupChange);
    const afterSummit = await lines();
    story.check(
      'AC-07-84, 64 the flag is cleared and stays in the ticket’s history; 101044 is COMPLETED and bills 14.0 × $7.80 = $109.20, prime Summit, while Coastline’s loads keep $7.50 on the same pay item, every one of their lines the same record',
      [
        await statusOf('101044'),
        await flagsOn('101044'),
        afterSummit
          .filter((each) => each.ticket === '101044')
          .map((each) => `${each.line} · ${each.whose}`),
        beforeSummit.every((before) => afterSummit.some((each) => each.id === before.id)),
        await total(),
      ],
      [
        ['COMPLETED'],
        [
          'Ticket 101044: no pricing rule on a Summit Debris Services contract matches. Flagged for review; not billed. (cleared)',
        ],
        ['101044 #1 VEG-HAUL-CY-15 14 × $7.80 = $109.20 · Summit Debris Services'],
        true,
        [21, '$5,801.95'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '13:00'),
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
    const voided = await reconciliation.run(setupChange);
    story.check(
      'AC-07-44, 95 the worker voids 101009: it is VOID, the run’s decision names the rule as the reason, and its line is gone, copied in full to the audit log first by the system actor. No other ticket is touched',
      [
        await statusOf('101009'),
        (
          await api.reconciliationDecision.findMany({
            where: { reconciliationRunId: voided.ran ? voided.runId : '', ticketNumber: '101009' },
          })
        ).map((decision) => {
          const summary = decision.summary as { why?: string; voidedBy?: { name: string }[] };
          return [decision.status, summary.voidedBy?.map((rule) => rule.name), summary.why];
        }),
        await linesOf('101009'),
        (await removals()).map((each) => [each.actor, Number(each.row['amount'])]).at(-1),
        (
          await api.auditRecord.findMany({
            where: {
              tableName: 'field_event',
              operation: 'UPDATE',
              changedFields: { has: 'status' },
            },
            orderBy: { id: 'desc' },
            take: 2,
          })
        ).map((record) => [
          record.actorId === systemActorId,
          (record.newValue as Record<string, unknown>)['status'],
        ]),
        await total(),
      ],
      [
        ['VOID'],
        [
          [
            'VOID',
            ['Old Quarry Pit: void'],
            'Grouped on its project, its workflow and the number 101009: one collection and its disposal. Voided by the rule "Old Quarry Pit: void".',
          ],
        ],
        [],
        ['system', 292.5],
        [
          [true, 'VOID'],
          [true, 'VOID'],
        ],
        [20, '$5,509.45'],
      ],
    );
    story.at(on('14', '13:10'), 'Dana switches the rule off; the worker runs');
    const auditedBefore = [await audited('transaction'), await audited('field_event')];
    await saved(rules.save(dana, { ...voidRule, id: quarryRule.id, active: false }));
    const afterVoid = await reconciliation.run(setupChange);
    story.check(
      'a voided ticket stays void until a person unvoids it (the user, ADR-360): 101009 is out of the run, which doesn’t work it or write anything for it, though the rule that voided it is off',
      [
        await statusOf('101009'),
        told(afterVoid).filter((line) => line.startsWith('101009')),
        [await audited('transaction'), await audited('field_event')],
        await linesOf('101009'),
        await total(),
      ],
      [['VOID'], [], auditedBefore, [], [20, '$5,509.45']],
    );

    // ------------------------------------------------------------------------------------------
    story.at(on('14', '14:00'), 'What the ledger and the audit log hold at the end');
    const everyLine = await api.auditRecord.findMany({ where: { tableName: 'transaction' } });
    story.check(
      'AC-07-103, 107 no rate history, no transaction history and no reversal anywhere: the installation has no such table, no line is below nought, a line is only ever written or removed (never updated), and every one of those was the system actor’s',
      [
        Object.keys(Prisma.ModelName).filter((model) => /history|reversal/i.test(model)),
        (await lines()).filter((each) => each.cents < 0).length,
        [...new Set(everyLine.map((record) => record.operation))].sort(),
        [
          ...new Set(
            everyLine.map(
              (record) => `${String(record.actorId === systemActorId)} ${record.source}`,
            ),
          ),
        ],
        everyLine.filter((record) => record.operation === 'DELETE').length ===
          (await removals()).length,
      ],
      [[], 0, ['DELETE', 'INSERT'], ['true SYSTEM'], true],
    );
    story.check(
      'the ledger at the end, 20 lines: P1’s Monday and Tuesday as on Wednesday morning ($5,400.25 on 19) and Summit’s 101044; the voided 101009 has none',
      await ledger(),
      [
        '101001 #1 VEG-HAUL-CY-15 52 × $7.50 = $390.00',
        '101002 #1 CD-HAUL-CY-15 36 × $8.25 = $297.00',
        '101002 #2 TIP-FEE-CY-BCL 36 × $4.00 = $144.00',
        '101003 #1 VEG-HAUL-CY-15 62.4 × $7.50 = $468.00',
        '101004 #1 VEG-HAUL-CY-15 24 × $7.50 = $180.00',
        '101005 #1 VEG-HAUL-CY-15 45.5 × $7.50 = $341.25',
        '101044 #1 VEG-HAUL-CY-15 14 × $7.80 = $109.20',
        '201001 #1 MULCH-HO-CY 99 × $5.10 = $504.90',
        '201001 #2 TIP-FEE-CY-BCL 99 × $4.00 = $396.00',
        '201004-A #1 MULCH-HO-TN 2.82 × $20.00 = $56.40',
        '201004-B #1 MULCH-HO-TN 7.06 × $20.00 = $141.20',
        '201004-C #1 MULCH-HO-TN 14.12 × $20.00 = $282.40',
        '301001 #1 HNG-RMV-EA 1 × $68.00 = $68.00',
        '301002 #1 LNR-RMV-EA-24 1 × $95.00 = $95.00',
        '301003 #1 HNG-RMV-EA 1 × $68.00 = $68.00',
        '301004 #1 STP-RMV-EA-36 1 × $110.00 = $110.00',
        '301004 #2 STP-FILL-CY 4.8 × $22.00 = $105.60',
        '301006 #1 WG-RMV-EA 6 × $40.00 = $240.00',
        '301006 #2 WG-FRN-EA 2 × $25.00 = $50.00',
        '301007 #1 CREW-TIME-HR 9.75 × $150.00 = $1462.50',
      ],
    );
  },
};
