// The ninth story (BACKLOG 1.5.9; ADR-352; spec/acceptance/06-reconciliation.md AC-06-01, 03, 04,
// 13, 14, 16, 18, 23, 42, 53, 56, 119, 124, 141, 147…154): the worker's run over P1's Monday and
// Tuesday, unpriced. The field days are the story `p1-field-days`' own, record for record, held
// on its six phones and sent here at the times that story's phones sync: Monday evening, Tuesday
// evening, and the Marsh Road tower's on Wednesday. Before them P1 gets what that story leaves
// out: its map (Thursday) and its five certifications (Saturday).
//
// After each sync the worker runs, as a sync's job would start it, and the story checks what it
// concluded: each ticket's status and flags, the completed loads and haul-outs with their
// quantities, zone and mileage, and the run's own record. Then the run's guarantees: a ticket
// whose writing fails part-way is left exactly as it was, flagged, and the run goes on; a run
// over unchanged input changes nothing; two runs never work one project at once; a mileage is
// asked for again only when one of its ends moves; a completed load is updated in place, and
// marked dissolved, never deleted, while its ticket isn't whole.
//
// Not here: the rules and the money (Milestone 1.6, 1.7). Accepting a flag, renumbering and
// correcting as a reviewer's actions, with their permissions and reasons (1.8.x): where this
// story needs a corrected record it writes the correction as the API's login may, to show what
// the worker does when the ticket comes back. The golden mission in full is 1.9.1.
import { Certifications, ProjectSetup, type BoxInput, type NewCertification } from '@open-adms/api';
import type { Database, Prisma } from '@open-adms/db';
import type { MileageEnds } from '@open-adms/domain';
import {
  MapServers,
  Mileages,
  Reconciliation,
  type MileageStep,
  type RunOutcome,
} from '@open-adms/worker';

import { createHash } from 'node:crypto';

import { projectTime, StoryClock, utcOffsetMinutes } from '../clock.ts';
import { SimulatedDevice, type PhoneRecord } from '../device.ts';
import { uuidv7 } from '../ids.ts';
import { localMapServers } from '../map-servers.ts';
import type { Story } from '../runner.ts';
import { p1FieldDays } from './p1-field-days.ts';
import { p1TimeZone as timeZone } from './p1.ts';
import { p1Boundary, p1Zones } from './setup.ts';

const on = (date: string, time: string): string => `2026-10-${date}T${time}:00-04:00`;

const primary = (length: number, width: number, height: number): BoxInput => ({
  shape: 'RECTANGLE',
  sign: 'ADD',
  length,
  width,
  height,
});

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
    'The worker’s run over P1’s Monday and Tuesday, unpriced: statuses, flags, quantities, zone and mileage; a failed ticket skipped; nothing changed twice; one run at a time',
  timeZone,
  start: on('08', '08:00'),

  async run(story) {
    const { api, worker, clock } = story;

    // ------------------------------------------------------------------------------------------
    // The two field days, exactly as the story `p1-field-days` records them, on a clock of their
    // own, with every phone's sync held back: each record is kept with the time its phone found
    // signal, and that story's own checks aren't asked again. It sets P1 up as it goes (its
    // sites, forms, pay items, people, phones and dispatch board); this story then tells what
    // came before the field days and sends each record at its phone's own sync.
    const held: { readonly sent: PhoneRecord; readonly syncedAt: Date }[] = [];
    const fieldClock = new StoryClock(p1FieldDays.start);
    await p1FieldDays.run({
      ...story,
      clock: fieldClock,
      intake: {
        receive: (sent: PhoneRecord) => {
          held.push({ sent, syncedAt: fieldClock.now() });
          return Promise.resolve({ answer: 'SAVED', id: '', notes: [] });
        },
        topUp: story.intake.topUp.bind(story.intake),
      } as unknown as typeof story.intake,
      at: (time) => {
        fieldClock.set(time);
      },
      check: () => undefined,
      phone: (setup) => new SimulatedDevice(setup, fieldClock),
    });

    const person = async (name: string): Promise<string> =>
      (await api.user.findFirstOrThrow({ where: { name } })).id;
    const dana = await person('Dana Reyes');
    const luis = await person('Luis Ortega');
    const sam = await person('Sam Grant');
    const lee = await person('Lee Morgan');
    const project = await api.project.findFirstOrThrow();
    const p1 = project.id;
    const coastline = (
      await api.contractor.findFirstOrThrow({ where: { name: 'Coastline Haulers LLC' } })
    ).id;
    const tdsr = await api.disposalSite.findFirstOrThrow({ where: { name: 'Marsh Road TDSR' } });
    const samPhone = (await api.device.findFirstOrThrow({ where: { name: 'P1-HO-TDSR' } })).id;
    const saved = async <T>(
      attempt: Promise<{ saved: true; record: T } | { saved: false; refusal: { message: string } }>,
    ): Promise<T> => {
      const outcome = await attempt;
      if (!outcome.saved) throw new Error(`Refused: ${outcome.refusal.message}`);
      return outcome.record;
    };

    // ------------------------------------------------------------------------------------------
    story.at(
      on('08', '08:40'),
      'Thursday, before the field days: Dana loads P1’s map, its boundary and three zones',
    );
    const projects = new ProjectSetup(api, clock, story.policy);
    await saved(
      projects.loadMap(dana, {
        projectId: p1,
        source: 'UPLOAD',
        sourceName: 'bayline-row-zones-v1.geojson',
        boundary: p1Boundary,
        zones: p1Zones,
        zoneNameField: 'ZONE_NAME',
      }),
    );

    story.at(
      on('10', '09:10'),
      'Saturday: Sam Grant certifies P1’s three containers and two crews on P1-HO-TDSR, Lee Morgan helping',
    );
    const certifying = await api.$write({ actorId: luis, source: 'BACK_OFFICE' }, (tx) =>
      tx.assignment.create({
        data: {
          workDate: new Date('2026-10-10'),
          projectId: p1,
          madeById: luis,
          personId: sam,
          certifying: true,
          deviceId: samPhone,
          origin: 'PLANNED',
        },
      }),
    );
    const certifications = new Certifications(api, clock);
    const feature = async (name: string): Promise<string> =>
      (await api.vehicleFeature.findFirstOrThrow({ where: { name } })).id;
    const certify = async (
      time: string,
      more: Partial<NewCertification> & Pick<NewCertification, 'certNumber' | 'boxes'>,
    ): Promise<void> => {
      clock.set(on('10', time));
      await saved(
        certifications.certify({
          projectId: p1,
          kind: 'CONTAINER',
          primeId: coastline,
          certifiedById: sam,
          deviceId: samPhone,
          assignmentId: certifying.id,
          helperIds: [lee],
          ...more,
          id: uuidv7(clock.now()),
          certifiedAt: clock.now(),
          deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, clock.now()),
        }),
      );
    };
    await certify('09:10', {
      certNumber: '730415',
      vehicleTypeId: (
        await api.vehicleType.findFirstOrThrow({ where: { name: 'Hydraulic Dump Trailer' } })
      ).id,
      boxes: [
        primary(360, 96, 72),
        { ...primary(360, 96, 16), featureId: await feature('Sideboards') },
      ],
    });
    await certify('09:40', {
      certNumber: '730416',
      firstTierSub: 'Rivera Trucking',
      vehicleTypeId: (
        await api.vehicleType.findFirstOrThrow({ where: { name: 'Self-Loading Truck' } })
      ).id,
      boxes: [
        primary(264, 92, 96),
        {
          shape: 'TRIANGLE',
          sign: 'SUBTRACT',
          length: 36,
          width: 92,
          height: 48,
          featureId: await feature('Dog Box'),
        },
      ],
    });
    for (const [time, certNumber, crewType] of [
      ['10:05', '730417', 'Bucket Truck'],
      ['10:15', '730418', 'Skid Steer'],
    ] as const) {
      await certify(time, {
        certNumber,
        kind: 'CREW',
        crewTypeId: (await api.crewType.findFirstOrThrow({ where: { name: crewType } })).id,
        boxes: [],
      });
    }
    await certify('10:50', {
      certNumber: '730419',
      vehicleTypeOther: 'Walking floor trailer',
      boxes: [
        primary(576, 96, 93),
        {
          shape: 'RADIUS_CORNER',
          sign: 'SUBTRACT',
          radius: 6,
          run: 576,
          corners: 2,
          featureId: await feature('Curved/Angled Sides/Floor'),
        },
      ],
    });
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
    const settings = { crewItemHoursLimit: story.policy.crewDayHours, longestRunMs: 600_000 };
    const reconciliation = new Reconciliation(worker, clock, settings, step);
    const sync = { projectId: p1, trigger: 'SYNC' } as const;

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
        where: { tableName: { notIn: ['reconciliation_run', 'reconciliation_decision'] } },
      }),
    });
    const show = (value: unknown): string =>
      JSON.stringify(value, (_key, item: unknown) =>
        typeof item === 'bigint' ? item.toString() : item,
      );

    // A phone's records reach the server: the ones it sent at that sync in `p1-field-days`.
    const arrive = async (syncedAt: Date): Promise<number> => {
      const arriving = held.filter((each) => each.syncedAt.getTime() === syncedAt.getTime());
      for (const { sent } of arriving) {
        const answer = await story.intake.receive(sent);
        if (answer.answer !== 'SAVED') throw new Error(`Not saved: ${answer.answer}`);
      }
      return arriving.length;
    };
    const syncs = [...new Set(held.map((each) => each.syncedAt.getTime()))]
      .sort((left, right) => left - right)
      .map((time) => new Date(time));
    const [mondayEvening, tuesdayEvening, wednesdayMorning] = syncs;
    if (
      mondayEvening === undefined ||
      tuesdayEvening === undefined ||
      wednesdayMorning === undefined
    ) {
      throw new Error('The field days synced fewer than three times.');
    }
    // Jo's crew photograph with each unit rate ticket (golden mission §2), taken as the ticket
    // was completed and sent after that sync's records. The story `p1-field-days` takes none,
    // so each photograph's record is made here as her phone would have sent it.
    const crewPhotographs = async (syncedAt: Date): Promise<number> => {
      let sent = 0;
      for (const { sent: record, syncedAt: at } of held) {
        if (at.getTime() !== syncedAt.getTime()) continue;
        if (record.record !== 'FIELD_EVENT' || record.fieldEvent.kind !== 'UNIT_RATE') continue;
        const event = record.fieldEvent;
        const file = `P1-UR-1/${event.endedAt.toISOString()}/crew`;
        const fingerprint = createHash('sha256').update(file).digest('hex');
        const answer = await story.intake.receive({
          record: 'PHOTO',
          photo: {
            id: uuidv7(event.endedAt),
            projectId: event.projectId,
            owner: { kind: 'FIELD_EVENT', id: event.id },
            takenById: event.monitorId,
            deviceId: event.deviceId,
            capturedAt: event.endedAt,
            deviceUtcOffsetMinutes: event.deviceUtcOffsetMinutes,
            latitude: null,
            longitude: null,
            originalSha256: fingerprint,
            uploadedSha256: fingerprint,
            objectKey: `photographs/${file}`,
          },
        });
        if (answer.answer !== 'SAVED') throw new Error(`Not saved: ${answer.answer}`);
        sent += 1;
      }
      return sent;
    };

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
      [await arrive(mondayEvening), await crewPhotographs(mondayEvening)],
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
    const first = await new Reconciliation(refusingAFlagOn('101003'), clock, settings, step).run(
      sync,
    );
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
      'the routing and address servers were asked for the two collections that have a fix, 14 Heron St and 101002’s; 101003’s has none',
      asked.map((ends) => `${ends.from.latitude}, ${ends.from.longitude}`),
      ['39.13850000, -75.55370000', '39.15000000, -75.52000000'],
    );

    // ------------------------------------------------------------------------------------------
    story.at(on('12', '19:00'), 'The worker runs again, with nothing in its way');
    asked = [];
    const second = await reconciliation.run(sync);
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
      second.ran ? second.pending.map((ticket) => [ticket.ticketNumber, ticket.flags]) : null,
      [['101004', []]],
    );
    story.check(
      'AC-06-18, 23, 42, 53 the three completed loads: capacity × load call to the digit of the golden mission (52.0, 36.0 and 62.4 CY), the flagged one worked out all the same; 101001 in Zone 2, 6.2050 road miles from Marsh Road TDSR; 101002 in Zone 3, 11.4419 from Bayline County Landfill; 101003’s collection has no fix, so no zone and no mileage',
      await completed(),
      [
        'CLT 101001 · LOAD_CALL · 65 CY × 80% = 52.00 CY | whole, share 1.0000, 52.00 CY, Zone 2, 6.2050 mi ROAD_ROUTE',
        'CLT 101002 · LOAD_CALL · 48 CY × 75% = 36.00 CY | whole, share 1.0000, 36.00 CY, Zone 3, 11.4419 mi ROAD_ROUTE',
        'CLT 101003 · LOAD_CALL · 65 CY × 96% = 62.40 CY | whole, share 1.0000, 62.40 CY, no zone, no mileage',
      ],
    );
    story.check(
      'no map server was asked again for the two mileages the first run kept',
      asked.length,
      0,
    );
    const flagsOnRecords = async (): Promise<Record<string, number>> => {
      const flags = await api.flag.findMany({ where: { ticketNumber: null, clearedAt: null } });
      const counted: Record<string, number> = {};
      for (const flag of flags) counted[flag.code] = (counted[flag.code] ?? 0) + 1;
      return counted;
    };
    story.check(
      'the run also checked what is no ticket: each of the five certifications is flagged for each of the five views it has no photograph of (the harness’s phone takes none); every site has its permit; no ticket’s status is touched by these',
      [
        await flagsOnRecords(),
        (
          await api.flag.findMany({
            where: { code: 'CERTIFICATION_PHOTO_MISSING' },
            orderBy: { id: 'asc' },
            take: 1,
          })
        ).map((flag) => flag.message),
      ],
      [
        { CERTIFICATION_PHOTO_MISSING: 25 },
        ['Certification 730415: no operator with placard photo.'],
      ],
    );
    const loadOf101001 = await api.completedLoad.findFirstOrThrow({
      where: { ticketNumber: '101001' },
    });

    // ------------------------------------------------------------------------------------------
    story.at(
      on('12', '19:10'),
      'The worker runs a third time over the same field events and setup',
    );
    const before = show(await concluded());
    asked = [];
    const third = await reconciliation.run(sync);
    story.check(
      'AC-06-151 nothing changes: every field event, completed load, row and flag is as it was to the last column, no audit record was written for any of them, and no map server was asked; only the run and its seven decisions are new',
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
      'A run on P1 is held part-way (the story holds its mileage step); a second run on P1 and a run on another project are started meanwhile',
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
    const underWay = reconciliation.run(sync);
    await isReached;
    const meanwhile = await reconciliation.run(sync);
    const elsewhere = await new Reconciliation(worker, clock, settings, mileages).run({
      projectId: p2.id,
      trigger: 'SYNC',
    });
    const runsSoFar = await api.reconciliationRun.count({ where: { projectId: p1 } });
    hold = null;
    release();
    const finished = await underWay;
    story.check(
      'AC-06-150 the second run on P1 works nothing and is told a run is under way (a database lock); the run on P2 isn’t held up; the first then finishes',
      [told(meanwhile), counts(elsewhere), runsSoFar, counts(finished)],
      [['A run on this project is under way.'], [0, 0], 4, [7, 0]],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      tuesdayEvening.toISOString(),
      'Tuesday evening: every phone syncs but the Marsh Road tower’s, which is flat',
    );
    story.check(
      'Tuesday’s records arrive: twelve field events, the scale receipt and the incident; and Jo’s four crew photographs',
      [await arrive(tuesdayEvening), await crewPhotographs(tuesdayEvening)],
      [14, 4],
    );
    story.at(
      on('13', '18:45'),
      'The worker runs; the routing server doesn’t answer when it is asked for haul-out 201001’s mileage (the story makes it so)',
    );
    asked = [];
    unanswered = (ends) => ends.to.latitude === '39.00000000';
    const fourth = await reconciliation.run(sync);
    unanswered = null;
    story.check(
      'AC-06-124 a map server that doesn’t answer is an error on that ticket alone, never a straight line: 201001 is flagged "could not be processed" and skipped; the rest are worked. 101004, 101005 and 101006 wait for their disposals, unflagged; 301005, a 20 in stump with no survey number, is in review',
      [counts(fourth), told(fourth)],
      [
        [14, 1],
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
      'AC-06-119 the incident and the drop-off log aren’t field events: the run decided on P1’s fifteen tickets and neither record has a status, a flag or a decision',
      [
        await api.incident.count(),
        await api.reconciliationDecision.count({
          where: { reconciliationRun: { id: fourth.ran ? fourth.runId : '' } },
        }),
        await api.flag.count({ where: { ticketNumber: null, certificationId: null } }),
      ],
      [1, 15, 0],
    );

    story.at(on('13', '19:00'), 'The routing server answers again; the worker runs');
    asked = [];
    const fifth = await reconciliation.run(sync);
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
    const duplicate = await story.intake.receive({
      ...again,
      fieldEvent: { ...again.fieldEvent, id: uuidv7(clock.now()) },
    });
    story.check(
      'the tower’s three disposals and the drop-off log arrive; the second disposal on 101005 is kept in quarantine',
      [arrived, duplicate.answer, await api.quarantinedRecord.count()],
      [4, 'QUARANTINED', 1],
    );
    story.at(on('14', '07:20'), 'The worker runs');
    const sixth = await reconciliation.run(sync);
    story.check(
      'AC-06-154, 16, 04 P1’s Monday and Tuesday reconciled, before any review: 101001, 101002, 101004 and 201001 whole and unflagged; 101003 in review for its 96% call; 101005 paired now its disposal is in, the one in quarantine never read; 101006 and 101060 each PENDING, 101060 showing its typed-number flag; 201004 one haul-out of three piles, unflagged; 301005 in review',
      [counts(sixth), told(sixth)],
      [
        [16, 0],
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
        'CLT 101003 · LOAD_CALL · 65 CY × 96% = 62.40 CY | whole, share 1.0000, 62.40 CY, no zone, no mileage',
        'CLT 101004 · LOAD_CALL · 48 CY × 50% = 24.00 CY | whole, share 1.0000, 24.00 CY, no zone, no mileage',
        'CLT 101005 · LOAD_CALL · 65 CY × 70% = 45.50 CY | whole, share 1.0000, 45.50 CY, no zone, no mileage',
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
      'AC-06-152 every run on P1 is recorded: what started it, when, how many tickets it worked and how many failed, with one decision for each ticket',
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
        'SYNC · Mon 12 Oct 18:45 · 6 worked · 1 failed · 7 decisions',
        'SYNC · Mon 12 Oct 19:00 · 7 worked · 0 failed · 7 decisions',
        'SYNC · Mon 12 Oct 19:10 · 7 worked · 0 failed · 7 decisions',
        'SYNC · Mon 12 Oct 19:20 · 7 worked · 0 failed · 7 decisions',
        'SYNC · Tue 13 Oct 18:45 · 14 worked · 1 failed · 15 decisions',
        'SYNC · Tue 13 Oct 19:00 · 15 worked · 0 failed · 15 decisions',
        'SYNC · Wed 14 Oct 07:20 · 16 worked · 0 failed · 16 decisions',
      ],
    );
    const decision = await api.reconciliationDecision.findFirstOrThrow({
      where: { reconciliationRunId: sixth.ran ? sixth.runId : '', ticketNumber: '101005' },
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
    const setupChange = { projectId: p1, trigger: 'SETUP_CHANGE' } as const;

    story.at(
      on('14', '09:00'),
      'Dana changes P1’s site circle from 200 m to 30 m; the worker runs',
    );
    await saved(projects.changeSettings(dana, p1, { siteCircleMeters: 30 }));
    asked = [];
    await reconciliation.run(setupChange);
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
    await reconciliation.run(setupChange);
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
      api.$write({ actorId: dana, source: 'BACK_OFFICE' }, (tx) =>
        tx.disposalSite.update({ where: { id: tdsr.id }, data: { latitude } }),
      );
    await moveTheTdsr('39.09010000');
    asked = [];
    await reconciliation.run(setupChange);
    story.check(
      'AC-06-56, 03 one end of 101001’s mileage moved, so it is asked for again, to the site’s corrected GPS: once, for the one load with a fix that was dumped there',
      [asked.map((ends) => ends.to.latitude), await mileageOf101001()],
      [['39.09010000'], '6.2112'],
    );
    story.at(on('14', '09:30'), 'She puts it back; the worker runs');
    await moveTheTdsr('39.09000000');
    asked = [];
    await reconciliation.run(setupChange);
    story.check(
      'asked once more, and 101001 is 6.2050 road miles from the TDSR again',
      [asked.length, await mileageOf101001()],
      [1, '6.2050'],
    );

    story.at(
      on('14', '10:00'),
      'Luis corrects 101003’s load call to 90% (the correction itself is Part 8’s); the worker runs, asked by him',
    );
    const correct = (
      where: Prisma.FieldEventWhereInput,
      data: { loadCall?: number; ticketNumber?: string },
    ) =>
      api.$write({ actorId: luis, source: 'BACK_OFFICE', reason: 'Correction' }, async (tx) => {
        const event = await tx.fieldEvent.findFirstOrThrow({ where });
        await tx.fieldEvent.update({ where: { id: event.id }, data });
      });
    const dis101003 = { ticketNumber: '101003', kind: 'DISPOSAL' } as const;
    const askedByLuis = { projectId: p1, trigger: 'CORRECTION', requestedById: luis } as const;
    await correct(dis101003, { loadCall: 90 });
    const corrected = await reconciliation.run(askedByLuis);
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
          'CLT 101003 · LOAD_CALL · 65 CY × 90% = 58.50 CY | whole, share 1.0000, 58.50 CY, no zone, no mileage',
        ],
      ],
    );
    const correctionRun = await api.reconciliationRun.findUniqueOrThrow({
      where: { id: corrected.ran ? corrected.runId : '' },
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
    await correct({ ...dis101003 }, { loadCall: 96 });
    await reconciliation.run(askedByLuis);
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
    await correct({ ticketNumber: '101005', kind: 'DISPOSAL' }, { ticketNumber: '101050' });
    await reconciliation.run(askedByLuis);
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
          'CLT 101005 · LOAD_CALL · 65 CY × 70% = 45.50 CY · dissolved | whole, share 1.0000, 45.50 CY, no zone, no mileage, dissolved',
        ],
      ],
    );
    story.at(on('14', '10:40'), 'It is put back; the worker runs');
    await correct({ ticketNumber: '101050', kind: 'DISPOSAL' }, { ticketNumber: '101005' });
    await reconciliation.run(askedByLuis);
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
    await correct({ ticketNumber: '101060', kind: 'DISPOSAL' }, { ticketNumber: '101006' });
    await reconciliation.run(askedByLuis);
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
          'CLT 101006 · LOAD_CALL · 48 CY × 60% = 28.80 CY | whole, share 1.0000, 28.80 CY, no zone, no mileage',
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
    await story.intake.receive({
      ...collection,
      fieldEvent: {
        ...collection.fieldEvent,
        id: uuidv7(new Date(on('14', '08:00'))),
        ticketNumber: '10A040',
        startedAt: new Date(on('14', '08:00')),
        endedAt: new Date(on('14', '08:20')),
      },
    });
    const seventeenth = await reconciliation.run(sync);
    story.check(
      'AC-06-160 it is in no ticket: flagged, PENDING, paired with nothing until a person renumbers it; the run still records a decision for it',
      [
        counts(seventeenth),
        told(seventeenth).filter((line) => line.startsWith('10A040')),
        await api.reconciliationDecision.count({ where: { ticketNumber: '10A040' } }),
      ],
      [
        [16, 0],
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
