// The ninth story (BACKLOG 1.5.9; ADR-352; spec/acceptance/06-reconciliation.md AC-06-01, 03, 04,
// 13, 14, 16, 18, 23, 42, 53, 56, 119, 124, 141, 147…154): the worker's run over P1's Monday and
// Tuesday, told without its money. The field days are the story `p1-field-days`' own, record for
// record, held on its six phones and sent here at the times that story's phones sync: Monday
// evening, Tuesday evening, and the Marsh Road tower's on Wednesday. Before them P1 gets what
// that story leaves out: its map (Thursday), the rest of its pay items and its rules, and its
// five certifications (Saturday).
//
// After each sync the worker's own job loop takes up the jobs it queued (BACKLOG 2.7.1 part 3,
// ADR-494), and the story checks what it concluded: each ticket's status and flags, the completed loads and haul-outs with their
// quantities, zone and mileage, and the run's own record. Then the run's guarantees: a ticket
// whose writing fails part-way is left exactly as it was, flagged, and the run goes on; a run
// over unchanged input changes nothing; two runs never work one project at once; a mileage is
// asked for again only when one of its ends moves; a completed load is updated in place, and
// marked dissolved, never deleted, while its ticket isn't whole.
//
// Not here: the money. P1 has its pay items and rules, so the run prices as it goes; the lines
// and the pricing flags are the story `p1-priced`'s (BACKLOG 1.7.2). Accepting a flag,
// renumbering and correcting as a reviewer's actions, with their permissions and reasons
// (1.8.x): where this story needs a corrected record it writes the correction as the API's login
// may, to show what the worker does when the ticket comes back. The golden mission in full is 1.9.1.
import { ProjectSetup, SiteSetup } from '@open-adms/api';
import { correctFieldEventEndpoint, renumberFieldEventEndpoint } from '@open-adms/contracts';
import type { Database, Prisma } from '@open-adms/db';
import type { MileageEnds } from '@open-adms/domain';
import {
  MapServers,
  Mileages,
  Reconciliation,
  type MileageStep,
  type ProjectPassed,
  type RunOutcome,
} from '@open-adms/worker';

import { projectTime } from '../clock.ts';
import { uuidv7 } from '../ids.ts';
import { localMapServers } from '../map-servers.ts';
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

const short = {
  COLLECTION: 'COL',
  DISPOSAL: 'DIS',
  HAUL_OUT_COLLECTION: 'HOC',
  HAUL_OUT_DISPOSAL: 'HOD',
  UNIT_RATE: 'URT',
} as const;

// What a run did, as lines a person reads: each ticket's status, what it waits for, why it
// could not be processed, and the flags that stand on it.
const told = (outcome: RunOutcome): string[] =>
  outcome.ran
    ? outcome.tickets.map((ticket) =>
        [
          ticket.ticketNumber,
          ticket.status,
          ...(ticket.waitingFor.length === 0
            ? []
            : [`waits for its ${ticket.waitingFor.map((kind) => short[kind]).join(', ')}`]),
          ...(ticket.error === null ? [] : [`error: ${ticket.error}`]),
          ...ticket.flags,
        ].join(' · '),
      )
    : [outcome.message];

const counts = (outcome: RunOutcome): unknown =>
  outcome.ran ? [outcome.ticketsDone, outcome.ticketsFailed] : outcome.reason;

export const p1Reconciled: Story = {
  name: 'p1-reconciled',
  title:
    'The worker’s run over P1’s Monday and Tuesday: statuses, flags, quantities, zone and mileage; a failed ticket skipped; nothing changed twice; one run at a time',
  timeZone,
  start: on('08', '08:00'),

  async run(story) {
    const { api, worker, clock } = story;

    // ------------------------------------------------------------------------------------------
    // The two field days, exactly as the story `p1-field-days` records them, held on its phones
    // (the stories' shared steps: p1-office.ts); this story then tells what came before the
    // field days and sends each record at its phone's own sync.
    const office = await p1FieldDaysHeld(story);
    const { held, dana, luis, p1 } = office;
    const tdsr = await api.disposalSite.findUniqueOrThrow({ where: { id: office.tdsr } });
    const project = await api.project.findUniqueOrThrow({ where: { id: p1 } });
    const projects = new ProjectSetup(api, clock, story.policy);

    // ------------------------------------------------------------------------------------------
    story.at(
      on('08', '08:40'),
      'Thursday, before the field days: Dana loads P1’s map, its boundary and three zones',
    );
    await loadP1Map(story, office);

    story.at(
      on('08', '10:00'),
      'Dana enters the pay items and rules the field days’ story leaves out (golden mission §1): what the worker prices with, told by the story p1-priced',
    );
    await setUpP1Pricing(story, office);

    story.at(
      on('10', '09:10'),
      'Saturday: Sam Grant certifies P1’s three containers and two crews on P1-HO-TDSR, Lee Morgan helping',
    );
    await certifyP1(story, office);
    story.check(
      'P1 has its five certifications, each capacity worked out from its measured boxes (golden mission §1)',
      (await api.certification.findMany({ orderBy: { certNumber: 'asc' } })).map(
        (each) =>
          `${each.certNumber} ${each.kind === 'CREW' ? 'crew' : `${String(each.capacityCy)} CY`}`,
      ),
      ['730415 65 CY', '730416 48 CY', '730417 crew', '730418 crew', '730419 110 CY'],
    );

    // ------------------------------------------------------------------------------------------
    // The worker, on its own login. Its mileage step is the worker's own, asking the local
    // stack's map servers; the story counts what it asks, and can hold it or fail it.
    const mileages = new Mileages(new MapServers(localMapServers()));
    let asked: MileageEnds[] = [];
    let unanswered: ((ends: MileageEnds) => boolean) | null = null;
    let hold: { readonly reached: () => void; readonly until: Promise<void> } | null = null;
    const step: MileageStep = {
      async between(ends, standing = null) {
        if (hold !== null) {
          hold.reached();
          await hold.until;
        }
        if (standing === null) {
          asked.push(ends);
          if (unanswered?.(ends) === true) throw new Error('The routing server did not answer.');
        }
        return mileages.between(ends, standing);
      },
    };
    const settings = {
      crewItemHoursLimit: story.policy.crewDayHours,
      deviceClockOffLimitMinutes: story.policy.deviceClockOffLimitMinutes,
      longestRunMs: 600_000,
    };
    const reconciliation = new Reconciliation(worker, clock, settings, step);
    // The worker's own job loop: it takes up what each sync queued, each reprocess Luis asks
    // for and the job each of his corrections queues (BACKLOG 2.7.1 part 3; ADR-494, 497).
    const queue = new QueueRuns(story, reconciliation);
    // Every ticket of P1 as it stands, for a reprocess Luis asks for.
    const everyTicket = async () =>
      (await queue.standing(p1)).tickets.map(({ workflow, ticketNumber }) => ({
        workflow,
        ticketNumber,
      }));

    // Each ticket as the server holds it: its field events' kinds and the status on them.
    const tickets = async (): Promise<string[]> => {
      const events = await api.fieldEvent.findMany({
        where: { projectId: p1 },
        orderBy: [{ ticketNumber: 'asc' }, { endedAt: 'asc' }],
      });
      const lines = new Map<string, { kinds: string[]; statuses: Set<string> }>();
      for (const event of events) {
        const line = lines.get(event.ticketNumber) ?? { kinds: [], statuses: new Set<string>() };
        line.kinds.push(
          `${short[event.kind]}${event.splitSuffix === '' ? '' : `-${event.splitSuffix}`}`,
        );
        line.statuses.add(event.status);
        lines.set(event.ticketNumber, line);
      }
      return [...lines].map(
        ([number, line]) => `${number} ${line.kinds.join(' ')} ${[...line.statuses].join('/')}`,
      );
    };
    const zoneNames = new Map((await api.zone.findMany()).map((zone) => [zone.id, zone.name]));
    // A completed load or haul-out as it stands: its quantity, then a row for each collection.
    const completed = async (): Promise<string[]> => {
      const zoneOf = new Map(
        (await api.fieldEvent.findMany({ where: { projectId: p1 } })).map((event) => [
          event.id,
          event.zoneId === null ? 'no zone' : (zoneNames.get(event.zoneId) ?? event.zoneId),
        ]),
      );
      const row = (each: {
        collectionEventId: string;
        splitSuffix: string;
        shareFraction: Prisma.Decimal;
        volumeCy: Prisma.Decimal | null;
        weightTons: Prisma.Decimal | null;
        mileage: Prisma.Decimal | null;
        mileageSource: string | null;
        dissolvedAt: Date | null;
      }): string =>
        [
          each.splitSuffix === '' ? 'whole' : `-${each.splitSuffix}`,
          `share ${each.shareFraction.toFixed(4)}`,
          each.volumeCy === null ? 'no CY' : `${each.volumeCy.toFixed(2)} CY`,
          ...(each.weightTons === null ? [] : [`${each.weightTons.toFixed(2)} t`]),
          zoneOf.get(each.collectionEventId) ?? '',
          each.mileage === null
            ? 'no mileage'
            : `${each.mileage.toFixed(4)} mi ${String(each.mileageSource)}`,
          ...(each.dissolvedAt === null ? [] : ['dissolved']),
        ].join(', ');
      const head = (
        label: string,
        each: {
          ticketNumber: string;
          quantitySource: string;
          capacityCy: number | null;
          loadCall: number | null;
          volumeCy: Prisma.Decimal | null;
          weightTons: Prisma.Decimal | null;
          dissolvedAt: Date | null;
        },
      ): string =>
        [
          `${label} ${each.ticketNumber}`,
          each.quantitySource,
          `${String(each.capacityCy)} CY × ${String(each.loadCall)}% = ${each.volumeCy?.toFixed(2) ?? 'no'} CY`,
          ...(each.weightTons === null ? [] : [`${each.weightTons.toFixed(2)} t`]),
          ...(each.dissolvedAt === null ? [] : ['dissolved']),
        ].join(' · ');
      const loads = await api.completedLoad.findMany({
        where: { projectId: p1 },
        include: { collections: { orderBy: { splitSuffix: 'asc' } } },
        orderBy: { ticketNumber: 'asc' },
      });
      const haulOuts = await api.completedHaulOut.findMany({
        where: { projectId: p1 },
        include: { collections: { orderBy: { splitSuffix: 'asc' } } },
        orderBy: { ticketNumber: 'asc' },
      });
      return [
        ...loads.map((each) => `${head('CLT', each)} | ${each.collections.map(row).join(' | ')}`),
        ...haulOuts.map(
          (each) =>
            `${head('CHO', each)} | ${each.collections
              .map((pile) => `${row(pile)}, added ${String(pile.pileLoadCall)}`)
              .join(' | ')}`,
        ),
      ];
    };
    // Everything the worker has concluded, to the last column: to show a run changed nothing.
    const concluded = async (): Promise<unknown> => ({
      fieldEvents: (
        await api.fieldEvent.findMany({ where: { projectId: p1 }, orderBy: { id: 'asc' } })
      ).map((event) => [
        event.id,
        event.status,
        event.reconciledAt?.toISOString() ?? null,
        event.zoneId,
        event.mapVersionId,
        event.workedOutPayItemId,
      ]),
      loads: await api.completedLoad.findMany({ orderBy: { id: 'asc' } }),
      loadRows: await api.completedLoadCollection.findMany({ orderBy: { id: 'asc' } }),
      haulOuts: await api.completedHaulOut.findMany({ orderBy: { id: 'asc' } }),
      haulOutRows: await api.completedHaulOutCollection.findMany({ orderBy: { id: 'asc' } }),
      flags: await api.flag.findMany({ orderBy: { id: 'asc' } }),
      audited: await api.auditRecord.count({
        where: {
          tableName: {
            notIn: [
              'reconciliation_job',
              'reconciliation_job_ticket',
              'reconciliation_run',
              'reconciliation_decision',
            ],
          },
        },
      }),
    });
    const show = (value: unknown): string =>
      JSON.stringify(value, (_key, item: unknown) =>
        typeof item === 'bigint' ? item.toString() : item,
      );

    const phones = new P1Syncs(story, office);
    const syncs = phones.times;
    const arrive = (syncedAt: Date): Promise<number> => phones.arrive(syncedAt);
    const [mondayEvening, tuesdayEvening, wednesdayMorning] = syncs;
    if (
      mondayEvening === undefined ||
      tuesdayEvening === undefined ||
      wednesdayMorning === undefined
    ) {
      throw new Error('The field days synced fewer than three times.');
    }

    // ------------------------------------------------------------------------------------------
    story.at(
      mondayEvening.toISOString(),
      'Monday evening at the yard: the phones find signal, the tower’s first',
    );
    story.check(
      'the three syncs are the story p1-field-days’ own: Monday evening, Tuesday evening, and the Marsh Road tower’s on Wednesday',
      syncs.map((time) => projectTime(timeZone, time)),
      ['Mon 12 Oct 18:30', 'Tue 13 Oct 18:30', 'Wed 14 Oct 07:10'],
    );
    story.check(
      'Monday’s ten field events arrive, and Jo’s three crew photographs after them',
      [await arrive(mondayEvening), phones.photosAt(mondayEvening)],
      [10, 3],
    );
    story.check(
      'AC-06-01 the sync didn’t wait for the worker: every field event is saved and PENDING, none reconciled, nothing concluded, no run yet',
      [
        [...new Set((await api.fieldEvent.findMany()).map((event) => event.status))],
        await api.fieldEvent.count({ where: { reconciledAt: { not: null } } }),
        await api.completedLoad.count(),
        await api.flag.count(),
        await api.reconciliationRun.count(),
      ],
      [['PENDING'], 0, 0, 0, 0],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('12', '18:45'),
      'The worker runs on P1. Part-way through writing ticket 101003 the database refuses a flag (the story makes it so)',
    );
    // The worker's own client, but a flag on 101003 can't be written: its field events' status
    // and its completed load were written just before it, inside the same piece of work.
    const refusingAFlagOn = (ticketNumber: string): Database =>
      new Proxy(worker, {
        get(target, property) {
          if (property !== '$write') return Reflect.get(target, property) as unknown;
          const write: Database['$write'] = (actor, work) =>
            target.$write(actor, (tx) =>
              work(
                new Proxy(tx, {
                  get(inner, name) {
                    if (name !== 'flag') return Reflect.get(inner, name) as unknown;
                    return new Proxy(inner.flag, {
                      get(flags, method) {
                        if (method !== 'create') return Reflect.get(flags, method) as unknown;
                        return (args: Prisma.FlagCreateArgs) => {
                          if (
                            args.data.ticketNumber === ticketNumber &&
                            args.data.code !== 'NOT_PROCESSED'
                          ) {
                            throw new Error('The database refused the flag.');
                          }
                          return flags.create(args);
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
    const first = await new QueueRuns(
      story,
      new Reconciliation(refusingAFlagOn('101003'), clock, settings, step),
    ).settled(p1);
    story.check(
      'AC-06-124 the run goes on past it: six tickets worked, one failed, and 101003 is flagged "could not be processed"',
      [counts(first), told(first)],
      [
        [6, 1],
        [
          '101001 · COMPLETED',
          '101002 · COMPLETED',
          '101003 · PENDING · error: The database refused the flag. · Ticket 101003: could not be processed. Flagged for review; not billed.',
          '101004 · PENDING · waits for its DIS',
          '301001 · COMPLETED',
          '301002 · COMPLETED',
          '301003 · COMPLETED',
        ],
      ],
    );
    story.check(
      'AC-06-149 nothing else about 101003 was written: its two field events are as they were, PENDING and never reconciled, and it has no completed load, though both were written before the flag failed',
      [
        (
          await api.fieldEvent.findMany({
            where: { ticketNumber: '101003' },
            orderBy: { endedAt: 'asc' },
          })
        ).map((event) => [short[event.kind], event.status, event.reconciledAt]),
        await api.completedLoad.count({ where: { ticketNumber: '101003' } }),
        (await api.flag.findMany({ where: { ticketNumber: '101003' } })).map((flag) => flag.code),
        (await api.reconciliationDecision.findMany({ where: { ticketNumber: '101003' } })).map(
          (decision) => [decision.status, decision.error],
        ),
      ],
      [
        [
          ['COL', 'PENDING', null],
          ['DIS', 'PENDING', null],
        ],
        0,
        ['NOT_PROCESSED'],
        [['PENDING', 'The database refused the flag.']],
      ],
    );
    story.check(
      'the routing and address servers were asked for the three collections: 14 Heron St, 101002’s, and 101003’s on Heron St again, worked out before its flag failed',
      asked.map((ends) => `${ends.from.latitude}, ${ends.from.longitude}`),
      ['39.13850000, -75.55370000', '39.15000000, -75.52000000', '39.13850000, -75.55370000'],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('12', '19:00'),
      'Luis asks for P1’s tickets to be reprocessed; the worker runs again, with nothing in its way',
    );
    asked = [];
    await queue.asked(luis, p1, await everyTicket());
    const second = await queue.settled(p1);
    story.check(
      'AC-06-18, 23, 13 Monday’s tickets: 101001 and 101002 COMPLETED; 101003 in review for its 96% call, and "could not be processed" is gone; 101004, a preload, waits for its disposal with no flag; Jo’s three unit rate tickets each whole by itself',
      [counts(second), told(second)],
      [
        [7, 0],
        [
          '101001 · COMPLETED',
          '101002 · COMPLETED',
          '101003 · MANUAL_REVIEW · Ticket 101003: load call 96%. Flagged for review.',
          '101004 · PENDING · waits for its DIS',
          '301001 · COMPLETED',
          '301002 · COMPLETED',
          '301003 · COMPLETED',
        ],
      ],
    );
    story.check(
      'AC-06-14 the run lists what is pending: 101004, waiting for its disposal, not flagged',
      second.pending.map((ticket) => [ticket.ticketNumber, ticket.flags]),
      [['101004', []]],
    );
    story.check(
      'AC-06-18, 23, 42, 53 the three completed loads: capacity × load call to the digit of the golden mission (52.0, 36.0 and 62.4 CY), the flagged one worked out all the same; 101001 in Zone 2, 6.2050 road miles from Marsh Road TDSR; 101002 in Zone 3, 11.4419 from Bayline County Landfill; 101003 from Heron St again',
      await completed(),
      [
        'CLT 101001 · LOAD_CALL · 65 CY × 80% = 52.00 CY | whole, share 1.0000, 52.00 CY, Zone 2, 6.2050 mi ROAD_ROUTE',
        'CLT 101002 · LOAD_CALL · 48 CY × 75% = 36.00 CY | whole, share 1.0000, 36.00 CY, Zone 3, 11.4419 mi ROAD_ROUTE',
        'CLT 101003 · LOAD_CALL · 65 CY × 96% = 62.40 CY | whole, share 1.0000, 62.40 CY, Zone 2, 6.2050 mi ROAD_ROUTE',
      ],
    );
    story.check(
      'no map server was asked again for the two mileages the first run kept; 101003’s, of which nothing was kept, is asked for again',
      asked.map((ends) => `${ends.from.latitude}, ${ends.from.longitude}`),
      ['39.13850000, -75.55370000'],
    );
    const flagsOnRecords = async (): Promise<Record<string, number>> => {
      const flags = await api.flag.findMany({ where: { ticketNumber: null, clearedAt: null } });
      const counted: Record<string, number> = {};
      for (const flag of flags) counted[flag.code] = (counted[flag.code] ?? 0) + 1;
      return counted;
    };
    story.check(
      'C82, AC-04-77 the run also checked what is no ticket: each of the five certifications has the five photographs Sam’s phone sent after it, one of each view, so none is flagged; every site has its permit; no ticket’s status is touched by these',
      [
        await flagsOnRecords(),
        await api.photo.count({ where: { certificationId: { not: null }, view: { not: null } } }),
      ],
      [{}, 25],
    );
    const loadOf101001 = await api.completedLoad.findFirstOrThrow({
      where: { ticketNumber: '101001' },
    });

    // ------------------------------------------------------------------------------------------
    story.at(
      on('12', '19:10'),
      'Luis asks for them again: the worker runs a third time over the same field events and setup',
    );
    const before = show(await concluded());
    asked = [];
    await queue.asked(luis, p1, await everyTicket());
    const third = await queue.settled(p1);
    story.check(
      'AC-06-151 nothing changes: every field event, completed load, row and flag is as it was to the last column, no audit record was written for any of them, and no map server was asked; only Luis’s job, the run and its seven decisions are new',
      [
        show(await concluded()) === before,
        asked.length,
        counts(third),
        await api.reconciliationRun.count(),
        await api.reconciliationDecision.count(),
      ],
      [true, 0, [7, 0], 3, 21],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('12', '19:20'),
      'Luis asks for P1’s tickets once more, and Dana enters Marsh Road TDSR on a second project, P2, which queues the check of its permit. The worker’s pass is held part-way through P1 (the story holds its mileage step); a second worker’s pass goes meanwhile',
    );
    const ppdr = await api.programType.findFirstOrThrow({ where: { name: 'PPDR' } });
    const p2 = await saved(
      projects.project(dana, {
        name: 'Bayline County PPDR, Hurricane Delphine',
        clientId: project.clientId,
        declarationEventId: project.declarationEventId,
        programTypeId: ppdr.id,
        timeZone,
        activeFrom: '2026-10-12',
        activeTo: '2027-01-31',
        ticketNumberSource: 'GENERATED',
        workflows: ['LOAD'],
        kindOfWorkIds: [],
      }),
    );
    await saved(
      new SiteSetup(api, clock, story.policy).site(dana, {
        projectId: p2.id,
        name: 'Marsh Road TDSR',
        siteTypeId: (await api.siteType.findUniqueOrThrow({ where: { key: 'TDSR' } })).id,
        takesLoads: true,
        haulOutsLeaveHere: true,
        chargesTippingFee: false,
        ineligibleSite: false,
        permitNumber: 'FDEP-DMS-2026-0117',
        latitude: '39.09000000',
        longitude: '-75.62000000',
        activationDate: '2026-10-12',
      }),
    );
    await queue.asked(luis, p1, await everyTicket());
    let reached: () => void = () => undefined;
    let release: () => void = () => undefined;
    const isReached = new Promise<void>((resolve) => {
      reached = resolve;
    });
    hold = {
      reached,
      until: new Promise<void>((resolve) => {
        release = resolve;
      }),
    };
    // What a pass did with each project, P1 first.
    const did = (passed: readonly ProjectPassed[]): string[] =>
      passed.map((each) => {
        const project = each.projectId === p1 ? 'P1' : 'P2';
        if ('error' in each) return `${project}: error`;
        return each.outcome.worked
          ? `${project}: ${String(counts(each.outcome.run))}`
          : `${project}: ${each.outcome.reason}`;
      });
    const underWay = queue.pass();
    await isReached;
    const meanwhile = await new QueueRuns(
      story,
      new Reconciliation(worker, clock, settings, mileages),
    ).pass();
    const runsSoFar = await api.reconciliationRun.count({ where: { projectId: p1 } });
    hold = null;
    release();
    const finished = await underWay;
    story.check(
      'AC-06-150 the second worker’s pass works nothing on P1 and is told a run is under way (a database lock), and P1’s job waits on; its run on P2 isn’t held up; the first pass then finishes P1, and finds P2’s job already taken',
      [did(meanwhile), runsSoFar, did(finished), (await queue.waiting(p1)).length],
      [['P1: RUN_UNDER_WAY', 'P2: 0,0'], 4, ['P1: 7,0', 'P2: NOTHING_WAITING'], 0],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      tuesdayEvening.toISOString(),
      'Tuesday evening: every phone syncs but the Marsh Road tower’s, which is flat',
    );
    story.check(
      'Tuesday’s records arrive: twelve field events, the scale receipt and the incident; and Jo’s four crew photographs',
      [await arrive(tuesdayEvening), phones.photosAt(tuesdayEvening)],
      [14, 4],
    );
    story.at(
      on('13', '18:45'),
      'The worker runs; the routing server doesn’t answer when it is asked for haul-out 201001’s mileage (the story makes it so)',
    );
    asked = [];
    unanswered = (ends) => ends.to.latitude === '39.00000000';
    const fourth = await queue.settled(p1);
    unanswered = null;
    story.check(
      'AC-06-124 a map server that doesn’t answer is an error on that ticket alone, never a straight line: 201001 is flagged "could not be processed" and skipped; the other seven tickets Tuesday’s syncs queued are worked. P1 as it stands: 101004, 101005 and 101006 wait for their disposals, unflagged; 301005, a 20 in stump with no survey number, is in review',
      [counts(fourth), told(await queue.standing(p1))],
      [
        [7, 1],
        [
          '101001 · COMPLETED',
          '101002 · COMPLETED',
          '101003 · MANUAL_REVIEW · Ticket 101003: load call 96%. Flagged for review.',
          '101004 · PENDING · waits for its DIS',
          '101005 · PENDING · waits for its DIS',
          '101006 · PENDING · waits for its DIS',
          '201001 · PENDING · error: The routing server did not answer. · Ticket 201001: could not be processed. Flagged for review; not billed.',
          '201004 · COMPLETED',
          '301001 · COMPLETED',
          '301002 · COMPLETED',
          '301003 · COMPLETED',
          '301004 · COMPLETED',
          '301005 · MANUAL_REVIEW · Ticket 301005: not an eligible stump (20 in, under 24 in). Flagged for review. · Ticket 301005: no survey. Flagged for review.',
          '301006 · COMPLETED',
          '301007 · COMPLETED',
        ],
      ],
    );
    story.check(
      'AC-06-119 the incident and the drop-off log aren’t field events: the run decided on the eight tickets Tuesday’s field events queued, and neither record has a status, a flag or a decision',
      [
        await api.incident.count(),
        await api.reconciliationDecision.count({
          where: { reconciliationRun: { id: fourth.runId } },
        }),
        await api.flag.count({ where: { ticketNumber: null, certificationId: null } }),
      ],
      [1, 8, 0],
    );

    story.at(
      on('13', '19:00'),
      'The routing server answers again; Luis asks for P1’s tickets to be reprocessed and the worker runs',
    );
    asked = [];
    await queue.asked(luis, p1, await everyTicket());
    const fifth = await queue.settled(p1);
    story.check(
      '201001 is worked now and its flag cleared; only its mileage was asked for',
      [
        counts(fifth),
        told(fifth).filter((line) => line.startsWith('201')),
        asked.length,
        (await api.flag.findMany({ where: { ticketNumber: '201001' } })).map((flag) => [
          flag.code,
          flag.clearedAt !== null,
        ]),
      ],
      [[15, 0], ['201001 · COMPLETED', '201004 · COMPLETED'], 1, [['NOT_PROCESSED', true]]],
    );
    story.check(
      'the two completed haul-outs: 201001, 110 CY × 90% = 99.0 CY, by the load call taken at the TDSR; 201004, one haul-out of three piles, by the scale’s 24.00 tons shared out by what each pile added to the call (10, 25, 50 of 85): 2.82, 7.06 and 14.12 tons, with each pile’s CY kept (11.0, 27.5, 55.0); a haul-out’s collection takes no zone',
      (await completed()).filter((line) => line.startsWith('CHO')),
      [
        'CHO 201001 · LOAD_CALL · 110 CY × 90% = 99.00 CY | whole, share 1.0000, 99.00 CY, no zone, 8.1397 mi ROAD_ROUTE, added 90',
        'CHO 201004 · SCALE_WEIGHT · 110 CY × 85% = 93.50 CY · 24.00 t | -A, share 0.1176, 11.00 CY, 2.82 t, no zone, 13.9516 mi ROAD_ROUTE, added 10 | -B, share 0.2941, 27.50 CY, 7.06 t, no zone, 13.9516 mi ROAD_ROUTE, added 25 | -C, share 0.5882, 55.00 CY, 14.12 t, no zone, 13.9516 mi ROAD_ROUTE, added 50',
      ],
    );
    story.check(
      'each unit rate ticket has the pay item the worker worked out again from the bands; 301005, a 20 in stump, has none',
      (
        await api.fieldEvent.findMany({
          where: { kind: 'UNIT_RATE' },
          include: { workedOutPayItem: true, payItem: true },
          orderBy: { ticketNumber: 'asc' },
        })
      ).map((event) => [
        event.ticketNumber,
        event.workedOutPayItem?.code ?? null,
        event.workedOutPayItem?.code === event.payItem?.code,
      ]),
      [
        ['301001', 'HNG-RMV-EA', true],
        ['301002', 'LNR-RMV-EA-24', true],
        ['301003', 'HNG-RMV-EA', true],
        ['301004', 'STP-RMV-EA-36', true],
        ['301005', null, true],
        ['301006', 'WG-RMV-EA', true],
        ['301007', 'CREW-TIME-HR', true],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      wednesdayMorning.toISOString(),
      'Wednesday: P1-TWR-TDSR is charged and syncs Tuesday’s work. Its disposal on 101005 is sent a second time under another id',
    );
    const arrived = await arrive(wednesdayMorning);
    const again = held.find(
      (each) =>
        each.sent.record === 'FIELD_EVENT' &&
        each.sent.fieldEvent.kind === 'DISPOSAL' &&
        each.sent.fieldEvent.ticketNumber === '101005',
    )?.sent;
    if (again?.record !== 'FIELD_EVENT') throw new Error('No disposal on 101005 was held.');
    const duplicate = await sentAlone(story, timeZone, {
      ...again,
      fieldEvent: { ...again.fieldEvent, id: uuidv7(clock.now()) },
    });
    story.check(
      'the tower’s three disposals and the drop-off log arrive; the second disposal on 101005 is kept in quarantine',
      [arrived, duplicate.answer, await api.quarantinedRecord.count()],
      [4, 'QUARANTINED', 1],
    );
    story.at(on('14', '07:20'), 'The worker runs');
    const sixth = await queue.settled(p1);
    story.check(
      'AC-06-154, 16, 04 P1’s Monday and Tuesday reconciled, before any review: the run works the three tickets the tower’s disposals queued; 101001, 101002, 101004 and 201001 whole and unflagged; 101003 in review for its 96% call; 101005 paired now its disposal is in, the one in quarantine never read; 101006 and 101060 each PENDING, 101060 showing its typed-number flag; 201004 one haul-out of three piles, unflagged; 301005 in review',
      [told(sixth), counts(sixth), told(await queue.standing(p1))],
      [
        [
          '101004 · COMPLETED',
          '101005 · COMPLETED',
          '101060 · PENDING · waits for its COL · Ticket 101060: typed ticket number (Barcode damaged). Flagged for review.',
        ],
        [3, 0],
        [
          '101001 · COMPLETED',
          '101002 · COMPLETED',
          '101003 · MANUAL_REVIEW · Ticket 101003: load call 96%. Flagged for review.',
          '101004 · COMPLETED',
          '101005 · COMPLETED',
          '101006 · PENDING · waits for its DIS',
          '101060 · PENDING · waits for its COL · Ticket 101060: typed ticket number (Barcode damaged). Flagged for review.',
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
      ],
    );
    story.check(
      'the five completed loads and two completed haul-outs, each quantity the golden mission’s: 52.0, 36.0, 62.4, 24.0 and 45.5 CY; 99.0 CY; 24.00 tons',
      await completed(),
      [
        'CLT 101001 · LOAD_CALL · 65 CY × 80% = 52.00 CY | whole, share 1.0000, 52.00 CY, Zone 2, 6.2050 mi ROAD_ROUTE',
        'CLT 101002 · LOAD_CALL · 48 CY × 75% = 36.00 CY | whole, share 1.0000, 36.00 CY, Zone 3, 11.4419 mi ROAD_ROUTE',
        'CLT 101003 · LOAD_CALL · 65 CY × 96% = 62.40 CY | whole, share 1.0000, 62.40 CY, Zone 2, 6.2050 mi ROAD_ROUTE',
        'CLT 101004 · LOAD_CALL · 48 CY × 50% = 24.00 CY | whole, share 1.0000, 24.00 CY, Zone 2, 7.8200 mi ROAD_ROUTE',
        'CLT 101005 · LOAD_CALL · 65 CY × 70% = 45.50 CY | whole, share 1.0000, 45.50 CY, Zone 2, 6.2050 mi ROAD_ROUTE',
        'CHO 201001 · LOAD_CALL · 110 CY × 90% = 99.00 CY | whole, share 1.0000, 99.00 CY, no zone, 8.1397 mi ROAD_ROUTE, added 90',
        'CHO 201004 · SCALE_WEIGHT · 110 CY × 85% = 93.50 CY · 24.00 t | -A, share 0.1176, 11.00 CY, 2.82 t, no zone, 13.9516 mi ROAD_ROUTE, added 10 | -B, share 0.2941, 27.50 CY, 7.06 t, no zone, 13.9516 mi ROAD_ROUTE, added 25 | -C, share 0.5882, 55.00 CY, 14.12 t, no zone, 13.9516 mi ROAD_ROUTE, added 50',
      ],
    );
    const loadNow = await api.completedLoad.findFirstOrThrow({ where: { ticketNumber: '101001' } });
    story.check(
      'AC-06-147 101001 has been worked in every run since Monday: it is still one completed load, the same record, written once and never again',
      [
        loadNow.id === loadOf101001.id,
        await api.completedLoad.count({ where: { ticketNumber: '101001' } }),
        await api.auditRecord.count({
          where: { tableName: 'completed_load', recordId: loadNow.id },
        }),
      ],
      [true, 1, 1],
    );
    const runs = await api.reconciliationRun.findMany({
      where: { projectId: p1 },
      include: { decisions: true },
      orderBy: { id: 'asc' },
    });
    story.check(
      'AC-06-152 every run on P1 is recorded: what started it (its oldest job’s: setup’s, before the first sync’s; then Luis’s reprocesses and the syncs), when, how many tickets it worked and how many failed, with one decision for each ticket',
      runs.map((run) =>
        [
          run.trigger,
          projectTime(timeZone, run.startedAt),
          `${String(run.ticketsDone)} worked`,
          `${String(run.ticketsFailed)} failed`,
          `${String(run.decisions.length)} decisions`,
        ].join(' · '),
      ),
      [
        'SETUP_CHANGE · Mon 12 Oct 18:45 · 6 worked · 1 failed · 7 decisions',
        'REPROCESS · Mon 12 Oct 19:00 · 7 worked · 0 failed · 7 decisions',
        'REPROCESS · Mon 12 Oct 19:10 · 7 worked · 0 failed · 7 decisions',
        'REPROCESS · Mon 12 Oct 19:20 · 7 worked · 0 failed · 7 decisions',
        'SYNC · Tue 13 Oct 18:45 · 7 worked · 1 failed · 8 decisions',
        'REPROCESS · Tue 13 Oct 19:00 · 15 worked · 0 failed · 15 decisions',
        'SYNC · Wed 14 Oct 07:20 · 3 worked · 0 failed · 3 decisions',
      ],
    );
    const decision = await api.reconciliationDecision.findFirstOrThrow({
      where: { reconciliationRunId: sixth.runId, ticketNumber: '101005' },
    });
    story.check(
      'AC-06-152 a decision says, for a person to read, the field events grouped and why',
      [
        decision.status,
        (decision.summary as { why: string; fieldEvents: { kind: string }[] }).why,
        (decision.summary as { fieldEvents: { kind: string }[] }).fieldEvents.map(
          (event) => event.kind,
        ),
      ],
      [
        'COMPLETED',
        'Grouped on its project, its workflow and the number 101005: one collection and its disposal.',
        ['COLLECTION', 'DISPOSAL'],
      ],
    );
    const systemActor = await api.user.findFirstOrThrow({ where: { role: 'SYSTEM' } });
    const derived = [
      'completed_load',
      'completed_load_collection',
      'completed_haul_out',
      'completed_haul_out_collection',
      'flag',
      'reconciliation_run',
      'reconciliation_decision',
    ];
    const workersAudit = await api.auditRecord.findMany({
      where: {
        OR: [{ tableName: { in: derived } }, { tableName: 'field_event', operation: 'UPDATE' }],
      },
    });
    story.check(
      'AC-06-153 every outcome is audited by the database under the system actor, from the system; on a field event the worker changed only its own columns',
      [
        [
          ...new Set(
            workersAudit.map(
              (record) => `${String(record.actorId === systemActor.id)} ${record.source}`,
            ),
          ),
        ],
        [...new Set(workersAudit.map((record) => record.tableName))].sort(),
        [
          ...new Set(
            workersAudit
              .filter((record) => record.tableName === 'field_event')
              .flatMap((record) => record.changedFields),
          ),
        ].sort(),
      ],
      [
        ['true SYSTEM'],
        [...derived, 'field_event'].sort(),
        ['map_version_id', 'reconciled_at', 'status', 'worked_out_pay_item_id', 'zone_id'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    // What the worker does when a setup change or a correction sends tickets back.
    const flagsOn = async (ticketNumber: string): Promise<string[]> =>
      (await api.flag.findMany({ where: { ticketNumber }, orderBy: { id: 'asc' } })).map(
        (flag) => `${flag.message}${flag.clearedAt === null ? '' : ' (cleared)'}`,
      );
    const statusOf = async (ticketNumber: string): Promise<string[]> => [
      ...new Set(
        (await api.fieldEvent.findMany({ where: { ticketNumber } })).map((event) => event.status),
      ),
    ];

    story.at(
      on('14', '09:00'),
      'Dana changes P1’s site circle from 200 m to 30 m; the worker runs',
    );
    await saved(projects.changeSettings(dana, p1, { siteCircleMeters: 30 }));
    asked = [];
    await queue.settle(p1);
    story.check(
      'AC-06-03, 56 101001’s disposal ended 38 m from Marsh Road TDSR’s GPS: the ticket is worked again and flagged, in review; its mileage is not asked for again',
      [await statusOf('101001'), await flagsOn('101001'), asked.length],
      [
        ['MANUAL_REVIEW'],
        ["Ticket 101001: dumped outside Marsh Road TDSR's area. Flagged for review."],
        0,
      ],
    );
    story.at(on('14', '09:10'), 'She changes it back to 200 m; the worker runs');
    await saved(projects.changeSettings(dana, p1, { siteCircleMeters: 200 }));
    await queue.settle(p1);
    story.check(
      'AC-06-141 the facts no longer raise the flag: it is cleared, kept in the ticket’s history, and with nothing else open the ticket is COMPLETED',
      [await statusOf('101001'), await flagsOn('101001')],
      [
        ['COMPLETED'],
        ["Ticket 101001: dumped outside Marsh Road TDSR's area. Flagged for review. (cleared)"],
      ],
    );

    story.at(on('14', '09:20'), 'Dana corrects Marsh Road TDSR’s GPS, 11 m north; the worker runs');
    const mileageOf101001 = async (): Promise<string | undefined> =>
      (
        await api.completedLoadCollection.findFirstOrThrow({
          where: { completedLoad: { ticketNumber: '101001' } },
        })
      ).mileage?.toFixed(4);
    const moveTheTdsr = (latitude: string) =>
      saved(new SiteSetup(api, clock, story.policy).change(dana, tdsr.id, { latitude }));
    await moveTheTdsr('39.09010000');
    asked = [];
    await queue.settle(p1);
    story.check(
      'AC-06-56, 03 one end of 101001’s mileage moved, so it is asked for again, to the site’s corrected GPS: once for each of the four loads dumped there',
      [asked.map((ends) => ends.to.latitude), await mileageOf101001()],
      [['39.09010000', '39.09010000', '39.09010000', '39.09010000'], '6.2112'],
    );
    story.at(on('14', '09:30'), 'She puts it back; the worker runs');
    await moveTheTdsr('39.09000000');
    asked = [];
    await queue.settle(p1);
    story.check(
      'asked once more for each of the four, and 101001 is 6.2050 road miles from the TDSR again',
      [asked.length, await mileageOf101001()],
      [4, '6.2050'],
    );

    story.at(
      on('14', '10:00'),
      'Dana grants Luis correct and renumber; at his browser he corrects 101003’s load call to 90% (the correction itself is Part 8’s), which queues its job; the worker runs, asked by him',
    );
    // Luis at his browser (ADR-497): a correction of a disposal's load call and a renumber of
    // one, each queuing its own job (its tickets and their neighbours) at its endpoint.
    const backOffice = p1BackOffice(story, office);
    await backOffice.grantLuis('CORRECT', 'RENUMBER');
    const luiss = await backOffice.luiss();
    const disposalOf = (ticketNumber: string) =>
      api.fieldEvent.findFirstOrThrow({ where: { projectId: p1, ticketNumber, kind: 'DISPOSAL' } });
    const correctCall = async (ticketNumber: string, loadCall: number): Promise<void> => {
      const { id } = await disposalOf(ticketNumber);
      await luiss.answered(correctFieldEventEndpoint, {
        ids: { fieldEventId: id },
        json: { changes: { loadCall } },
      });
    };
    const renumber = async (ticketNumber: string, to: string): Promise<void> => {
      const { id } = await disposalOf(ticketNumber);
      await luiss.answered(renumberFieldEventEndpoint, {
        ids: { fieldEventId: id },
        json: { ticketNumber: to },
      });
    };
    await correctCall('101003', 90);
    const corrected = await queue.settled(p1);
    story.check(
      'AC-06-141 the 96% flag is cleared and 101003 is COMPLETED, its completed load updated in place to 58.5 CY',
      [
        await statusOf('101003'),
        await flagsOn('101003'),
        (await completed()).filter((line) => line.includes('101003')),
      ],
      [
        ['COMPLETED'],
        [
          'Ticket 101003: could not be processed. Flagged for review; not billed. (cleared)',
          'Ticket 101003: load call 96%. Flagged for review. (cleared)',
        ],
        [
          'CLT 101003 · LOAD_CALL · 65 CY × 90% = 58.50 CY | whole, share 1.0000, 58.50 CY, Zone 2, 6.2050 mi ROAD_ROUTE',
        ],
      ],
    );
    const correctionRun = await api.reconciliationRun.findUniqueOrThrow({
      where: { id: corrected.runId },
    });
    story.check(
      'BACKLOG C20 the run records that Luis asked for it; what the worker wrote in it is still the system actor’s',
      [
        correctionRun.trigger,
        correctionRun.requestedById === luis,
        [
          ...new Set(
            (
              await api.auditRecord.findMany({
                where: { tableName: 'flag', operation: 'UPDATE' },
                orderBy: { id: 'desc' },
                take: 1,
              })
            ).map((record) => record.actorId === systemActor.id),
          ),
        ],
      ],
      ['CORRECTION', true, [true]],
    );
    story.at(on('14', '10:10'), 'The call was right: Luis puts 96% back; the worker runs');
    await correctCall('101003', 96);
    await queue.settle(p1);
    story.check(
      'the problem is back, so a new flag is raised to be looked at; the cleared one stays in the history',
      [await statusOf('101003'), await flagsOn('101003')],
      [
        ['MANUAL_REVIEW'],
        [
          'Ticket 101003: could not be processed. Flagged for review; not billed. (cleared)',
          'Ticket 101003: load call 96%. Flagged for review. (cleared)',
          'Ticket 101003: load call 96%. Flagged for review.',
        ],
      ],
    );

    story.at(
      on('14', '10:30'),
      'By mistake, 101005’s disposal is renumbered 101050; the worker runs',
    );
    const loadOf101005 = await api.completedLoad.findFirstOrThrow({
      where: { ticketNumber: '101005' },
    });
    await renumber('101005', '101050');
    await queue.settle(p1);
    story.check(
      'AC-06-148 101005 is its collection alone again, PENDING; its completed load is marked dissolved, with its row, never deleted; 101050 is a disposal waiting for a collection',
      [
        await statusOf('101005'),
        await statusOf('101050'),
        (await completed()).filter((line) => line.includes('101005')),
      ],
      [
        ['PENDING'],
        ['PENDING'],
        [
          'CLT 101005 · LOAD_CALL · 65 CY × 70% = 45.50 CY · dissolved | whole, share 1.0000, 45.50 CY, Zone 2, 6.2050 mi ROAD_ROUTE, dissolved',
        ],
      ],
    );
    story.at(on('14', '10:40'), 'It is put back; the worker runs');
    await renumber('101050', '101005');
    await queue.settle(p1);
    story.check(
      'AC-06-148 the ticket is whole again: the mark is cleared on the same completed load, and it is COMPLETED',
      [
        await statusOf('101005'),
        (await api.completedLoad.findMany({ where: { ticketNumber: '101005' } })).map((load) => [
          load.id === loadOf101005.id,
          load.dissolvedAt,
        ]),
        await api.completedLoad.count(),
      ],
      [['COMPLETED'], [[true, null]], 5],
    );

    story.at(
      on('14', '11:00'),
      'Luis renumbers the tower’s typed 101060 to 101006, the load it was (golden mission §2); the worker runs',
    );
    await renumber('101060', '101006');
    await queue.settle(p1);
    story.check(
      'the collection and the disposal pair on 101006: 48 CY × 60% = 28.8 CY. The typed-number flag is the ticket’s now, still to be accepted (Part 8), so it is in review; nothing is left on 101060, whose flag is cleared',
      [
        await statusOf('101006'),
        await flagsOn('101006'),
        await flagsOn('101060'),
        (await completed()).filter((line) => line.includes('101006')),
      ],
      [
        ['MANUAL_REVIEW'],
        ['Ticket 101006: typed ticket number (Barcode damaged). Flagged for review.'],
        ['Ticket 101060: typed ticket number (Barcode damaged). Flagged for review. (cleared)'],
        [
          'CLT 101006 · LOAD_CALL · 48 CY × 60% = 28.80 CY | whole, share 1.0000, 28.80 CY, Zone 2, 7.8200 mi ROAD_ROUTE',
        ],
      ],
    );
    story.at(
      on('14', '11:30'),
      'A collection reaches the server numbered 10A040, which no phone should send (the story sends it); the worker runs',
    );
    const collection = held.find(
      (each) =>
        each.sent.record === 'FIELD_EVENT' &&
        each.sent.fieldEvent.kind === 'COLLECTION' &&
        each.sent.fieldEvent.ticketNumber === '101006',
    )?.sent;
    if (collection?.record !== 'FIELD_EVENT') throw new Error('No collection on 101006 was held.');
    await sentAlone(story, timeZone, {
      ...collection,
      fieldEvent: {
        ...collection.fieldEvent,
        id: uuidv7(new Date(on('14', '08:00'))),
        ticketNumber: '10A040',
        startedAt: new Date(on('14', '08:00')),
        endedAt: new Date(on('14', '08:20')),
      },
    });
    const seventeenth = await queue.settled(p1);
    story.check(
      'AC-06-160 it is in no ticket: flagged, PENDING, paired with nothing until a person renumbers it; the run still records a decision for it',
      [
        counts(seventeenth),
        told(seventeenth).filter((line) => line.startsWith('10A040')),
        await api.reconciliationDecision.count({ where: { ticketNumber: '10A040' } }),
      ],
      [
        [1, 0],
        [
          '10A040 · PENDING · Ticket 10A040: not a valid ticket number. Flagged for review; not billed.',
        ],
        1,
      ],
    );
    story.check(
      'at the end: six completed loads and two completed haul-outs, none dissolved; every ticket of P1 with its status',
      [
        await api.completedLoad.count({ where: { dissolvedAt: null } }),
        await api.completedHaulOut.count({ where: { dissolvedAt: null } }),
        await tickets(),
      ],
      [
        6,
        2,
        [
          '101001 COL DIS COMPLETED',
          '101002 COL DIS COMPLETED',
          '101003 COL DIS MANUAL_REVIEW',
          '101004 COL DIS COMPLETED',
          '101005 COL DIS COMPLETED',
          '101006 COL DIS MANUAL_REVIEW',
          '10A040 COL PENDING',
          '201001 HOC HOD COMPLETED',
          '201004 HOC-A HOC-B HOC-C HOD COMPLETED',
          '301001 URT COMPLETED',
          '301002 URT COMPLETED',
          '301003 URT COMPLETED',
          '301004 URT COMPLETED',
          '301005 URT MANUAL_REVIEW',
          '301006 URT COMPLETED',
          '301007 URT COMPLETED',
        ],
      ],
    );
  },
};
