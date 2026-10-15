// The eleventh story (BACKLOG 1.8.3; ADR-364; spec/acceptance/08-review-and-corrections.md
// AC-08-05, 07, 10…30, 66; spec/acceptance/09-invoice-deliver-closeout.md AC-09-16;
// spec/acceptance/03-certification.md AC-03-52): a reviewer corrects and renumbers. P1's Monday
// and Tuesday are the story `p1-field-days`' own, priced as the story `p1-priced` prices them;
// Wednesday adds the loads the scenarios need (`adms-exceptions`' Scenarios A and B, a load whose
// two ends disagree, a haul-out dumped at a TDSR, a tower whose phone failed), and P2, the PPDR
// project, a load on an ROE and a split load.
//
// Every change here is a request at its endpoint, at Luis Ortega's browser by the grants Dana
// gives him at hers (ADR-501): a captured field corrected in place, a renumber, a quarantined
// record resolved, a photograph and a white goods line taken off and put back, an ROE's scope, a
// record created in the back office, a certification's box, a QC mark and the lock; and the
// unlock at Dana's. Each queues its own job, and the worker takes it up; the story reads what the
// worker concluded. One correction alone is made in process, on purpose: the one whose job queue
// is made to fail (AC-10-50), which no request can do. Last, a sub typed twice at certification
// is flagged on the certifications that name either spelling, never merged (AC-01-21; ADR-529
// (f)).
//
// Not here: voiding the phantom, unvoiding and accepting a flag (the story `p1-voided`); QC, the
// lock and a batch for themselves (the story `p1-invoiced`). The golden mission's whole review is
// 1.9.1.
import {
  Certifications,
  ContractorSetup,
  Corrections,
  FormSetup,
  PayItemSetup,
  SiteSetup,
  type SentFieldEvent,
} from '@open-adms/api';
import {
  correctCertificationBoxEndpoint,
  correctFieldEventEndpoint,
  correctItemLineEndpoint,
  correctRoeScopeEndpoint,
  createFieldEventEndpoint,
  lockAsInvoicedEndpoint,
  markPhotographEndpoint,
  markSecondCopyEndpoint,
  renumberFieldEventEndpoint,
  renumberQuarantinedRecordEndpoint,
  setQcStatusEndpoint,
  unlockInvoicedEndpoint,
  type AnswerOf,
  type BodyOf,
  type Endpoint,
} from '@open-adms/contracts';
import { systemActorId, type FieldEventKind } from '@open-adms/db';
import { NewProjectSettings } from '@open-adms/domain';
import { MapServers, Mileages, Reconciliation, type RunOutcome } from '@open-adms/worker';

import { createHash } from 'node:crypto';

import { utcOffsetMinutes } from '../clock.ts';
import type { PhoneRecord } from '../device.ts';
import { uuidv7 } from '../ids.ts';
import { localMapServers } from '../map-servers.ts';
import type { OfficeBrowser } from '../office-browser.ts';
import { refusalOf, type AskedWith } from '../over-https.ts';
import type { Story } from '../runner.ts';
import {
  certifyP1,
  loadP1Map,
  p1BackOffice,
  p1FieldDaysHeld,
  P1Syncs,
  QueueRuns,
  primaryBox,
  saved,
  setUpP1Pricing,
} from './p1-office.ts';
import { assigned, photoSentAlone, sentAlone } from './board.ts';
import { p1TimeZone as timeZone, startSeries } from './p1.ts';

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

// A field event as a phone sends it, entered in the back office when the phone failed: what it
// recorded, less everything that says it came from a phone (the body of `createFieldEvent`).
function asEntered(
  event: SentFieldEvent,
): Omit<BodyOf<typeof createFieldEventEndpoint>, 'reasonId'> {
  const fix = (latitude: string | null | undefined, longitude: string | null | undefined) =>
    latitude === null || latitude === undefined || longitude === null || longitude === undefined
      ? null
      : { latitude, longitude };
  return {
    workflow: event.workflow,
    kind: event.kind,
    ticketNumber: event.ticketNumber,
    ...(event.splitSuffix === '' ? {} : { splitSuffix: event.splitSuffix }),
    monitorId: event.monitorId,
    startedAt: event.startedAt.toISOString(),
    endedAt: event.endedAt.toISOString(),
    deviceUtcOffsetMinutes: event.deviceUtcOffsetMinutes,
    start: fix(event.startLatitude, event.startLongitude),
    end: fix(event.endLatitude, event.endLongitude),
    address: event.address,
    addressSource: event.addressSource,
    notes: event.notes,
    certNumber: event.certNumber,
    siteId: event.siteId,
    formDebrisTypeId: event.formDebrisTypeId,
    fieldTagId: event.fieldTagId,
    roeNumber: event.roeNumber,
    estimateCy: event.estimateCy,
    loadCall: event.loadCall,
    scaleReceiptId: event.scaleReceiptId,
    carriedCount: event.carriedCount,
    kindOfWorkId: event.kindOfWorkId,
    payableTypeId: event.payableTypeId,
    payItemId: event.payItemId,
    unitCount: event.unitCount,
    measurementInches: event.measurementInches,
    measuredAs: event.measuredAs,
    rootBallInches: event.rootBallInches,
    rootBallHalfExposed: event.rootBallHalfExposed,
    surveyNumber: event.surveyNumber,
    markedIneligible: event.markedIneligible,
    items: event.items.map(({ itemNameId, quantity }) => ({ itemNameId, quantity })),
    carriedTickets: [...event.carriedTickets],
  };
}

const unticked = {
  kindOfWorkId: null,
  bandFrom: null,
  bandTo: null,
  countIsAlwaysOne: false,
  gpsRequired: false,
  measurementRequired: false,
  decimalsAllowed: false,
  photosRequired: false,
  monitorMayMarkIneligible: false,
  quantityFromCarriedTickets: false,
  crewTimeConversion: null,
  crewDayHours: null,
} as const;

export const p1Reviewed: Story = {
  name: 'p1-reviewed',
  title:
    'A reviewer corrects and renumbers: any captured field in place, by permission, the value before kept; a quarantined record resolved; a record created in the back office; each ticket reprocessed by the worker',
  timeZone,
  start: on('08', '08:00'),

  async run(story) {
    const { api, worker, clock } = story;
    const office = await p1FieldDaysHeld(story);
    const { held, dana, luis, sam, p1, coastline, tdsr, landfill } = office;

    // ------------------------------------------------------------------------------------------
    story.at(on('08', '08:40'), 'Thursday: Dana loads P1’s map and enters its pay items and rules');
    await loadP1Map(story, office);
    await setUpP1Pricing(story, office);

    story.at(
      on('09', '09:00'),
      'Friday: Dana grants Luis Ortega Setup, and he sets up P2, the PPDR project: Coastline its prime, a load form with Vegetative and C&D, an ROE form, VEG-HAUL-CY at $9.00, Marsh Road TDSR entered again',
    );
    // Dana and Luis at their browsers (ADR-497, 501). Her grants are her request at his record;
    // a setup service asks whether its caller holds Setup, inside its own piece of work (ADR-424).
    const backOffice = p1BackOffice(story, office);
    await backOffice.grantLuis('SETUP');
    const p2 = await api.$write({ actorId: luis, source: 'BACK_OFFICE' }, async (tx) => {
      const first = await tx.project.findUniqueOrThrow({ where: { id: p1 } });
      const ppdr = await tx.programType.findFirstOrThrow({ where: { name: 'PPDR' } });
      const project = await tx.project.create({
        data: {
          name: 'Bayline County PPDR, Hurricane Delphine',
          clientId: first.clientId,
          declarationEventId: first.declarationEventId,
          programTypeId: ppdr.id,
          timeZone,
          activeFrom: new Date('2026-10-12'),
          activeTo: new Date('2027-01-31'),
          ticketNumberSource: 'GENERATED',
          workflows: ['LOAD'],
          ...new NewProjectSettings(story.policy).for(ppdr),
        },
      });
      await startSeries(tx, project.id, { LOAD: 102001, CERTIFICATION: 730416 });
      return project.id;
    });
    const contractors = new ContractorSetup(api, clock, story.policy);
    const forms = new FormSetup(api, clock, story.policy);
    const payItems = new PayItemSetup(api, clock, story.policy);
    await saved(contractors.addPrime(luis, p2, coastline));
    await saved(
      contractors.contract(luis, {
        projectId: p2,
        name: 'Coastline, Bayline PPDR 2026',
        primeId: coastline,
      }),
    );
    const p2Load = (
      await saved(forms.form(luis, { projectId: p2, documentType: 'LOAD', name: 'Load' }))
    ).id;
    await saved(
      forms.form(luis, {
        projectId: p2,
        documentType: 'ROE',
        name: 'ROE',
        gpsRequired: true,
      }),
    );
    const p2Entry = async (name: string): Promise<string> =>
      (
        await saved(
          forms.debrisType(luis, {
            formId: p2Load,
            debrisTypeId: (await api.debrisType.findFirstOrThrow({ where: { name } })).id,
            reduced: false,
            hiddenOnPhones: false,
          }),
        )
      ).id;
    const p2Vegetative = await p2Entry('Vegetative');
    const p2Cd = await p2Entry('C&D');
    const p2Haul = (
      await saved(
        payItems.payItem(luis, {
          ...unticked,
          projectId: p2,
          code: 'VEG-HAUL-CY',
          description: 'PPDR VEG haul',
          payableTypeId: (await api.payableType.findFirstOrThrow({ where: { name: 'Vegetative' } }))
            .id,
          unit: 'CY',
          rates: [{ primeId: coastline, rate: '9.00' }],
        }),
      )
    ).id;
    await saved(
      payItems.paysWhen(luis, p2Haul, [
        {
          formId: p2Load,
          slot: 1,
          criteria: [{ criterion: 'DEBRIS_TYPE', operator: 'EQUALS', picks: [p2Vegetative] }],
        },
      ]),
    );
    const p2Tdsr = (
      await saved(
        new SiteSetup(api, clock, story.policy).site(luis, {
          projectId: p2,
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
      )
    ).id;

    story.at(
      on('10', '09:10'),
      'Saturday: Sam Grant certifies P1’s three containers and two crews, then Rivera’s self-loader again on P2, its own 730416, 48 CY',
    );
    await certifyP1(story, office);
    clock.set(on('10', '11:30'));
    const feature = async (name: string): Promise<string> =>
      (await api.vehicleFeature.findFirstOrThrow({ where: { name } })).id;
    await saved(
      new Certifications(api, clock, story.policy).certify({
        id: uuidv7(clock.now()),
        projectId: p2,
        kind: 'CONTAINER',
        certNumber: '730416',
        primeId: coastline,
        firstTierSub: 'Rivera Trucking',
        vehicleTypeId: (
          await api.vehicleType.findFirstOrThrow({ where: { name: 'Self-Loading Truck' } })
        ).id,
        boxes: [
          primaryBox(264, 92, 96),
          {
            shape: 'TRIANGLE',
            sign: 'SUBTRACT',
            length: 36,
            width: 92,
            height: 48,
            featureId: await feature('Dog Box'),
          },
        ],
        certifiedById: sam,
        certifiedAt: clock.now(),
        deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, clock.now()),
      }),
    );

    // ------------------------------------------------------------------------------------------
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

    const names = new Map<string | null, string>([
      [dana, 'Dana'],
      [luis, 'Luis'],
      [systemActorId, 'system'],
    ]);
    // The ledger of a project as it stands: every line with its ticket (and property), its #,
    // its pay item, quantity × rate = amount.
    const lines = async (projectId: string) => {
      const rows = await api.transaction.findMany({
        where: { projectId },
        include: {
          payItem: true,
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
          const ticket = `${number}${suffix === '' ? '' : `-${suffix}`}`;
          return {
            ticket,
            line: `${ticket} #${String(row.slot)} ${row.payItem.code} ${row.quantity.toString()} × $${row.rate.toFixed(2)} = $${row.amount.toFixed(2)}`,
          };
        })
        .sort((left, right) => (left.line < right.line ? -1 : 1));
    };
    const linesOf = async (ticketNumber: string, projectId = p1): Promise<string[]> =>
      (await lines(projectId))
        .filter((each) => each.ticket.startsWith(ticketNumber))
        .map((each) => each.line);
    const statusOf = async (ticketNumber: string, projectId = p1): Promise<string[]> => [
      ...new Set(
        (await api.fieldEvent.findMany({ where: { projectId, ticketNumber } })).map(
          (event) => event.status,
        ),
      ),
    ];
    const flagsOn = async (ticketNumber: string, projectId = p1): Promise<string[]> =>
      (await api.flag.findMany({ where: { projectId, ticketNumber }, orderBy: { id: 'asc' } })).map(
        (flag) => `${flag.message}${flag.clearedAt === null ? '' : ' (cleared)'}`,
      );
    // The amounts of the lines the audit log holds as removed, in the order they went.
    const removed = async (): Promise<number[]> =>
      (
        await api.auditRecord.findMany({
          where: { tableName: 'transaction', operation: 'DELETE' },
          orderBy: { id: 'asc' },
        })
      ).map((record) => Number((record.priorValue as Record<string, unknown>)['amount']));
    // What people changed on a record, as the audit log keeps it: who, from where, which
    // fields, the value before and after.
    const changesTo = async (recordId: string, tableName = 'field_event') =>
      (
        await api.auditRecord.findMany({
          where: { tableName, recordId, operation: 'UPDATE', actorId: { not: systemActorId } },
          orderBy: { id: 'asc' },
        })
      ).map((record) => {
        const before = record.priorValue as Record<string, unknown>;
        const after = record.newValue as Record<string, unknown>;
        return [
          names.get(record.actorId) ?? record.actorId,
          record.source,
          ...record.changedFields.map(
            (field) => `${field}: ${String(before[field])} → ${String(after[field])}`,
          ),
        ].join(' · ');
      });
    const eventOf = (ticketNumber: string, kind: FieldEventKind, projectId = p1) =>
      api.fieldEvent.findFirstOrThrow({ where: { projectId, ticketNumber, kind } });
    const loadOf = (ticketNumber: string, projectId = p1) =>
      api.completedLoad.findMany({ where: { projectId, ticketNumber } });
    const fieldEvents = (): Promise<number> => api.fieldEvent.count();

    // A reviewer's action, then the run it asks for.
    const last: { run: RunOutcome | null } = { run: null };
    // Nobody asks the worker: the action queued its job, and the worker takes it up.
    const queue = new QueueRuns(story, reconciliation);
    // An act, saved: its answer. One that queued a job is followed by the run the worker makes
    // of it, on the project it names (P1's unless told); one that left no ticket to work queued
    // none, and no run follows it.
    const act = async <E extends Endpoint>(
      by: () => Promise<OfficeBrowser>,
      served: E,
      more: AskedWith,
    ): Promise<AnswerOf<E>> => (await by()).answered(served, more);
    const byLuis = <E extends Endpoint>(served: E, more: AskedWith) =>
      act(() => backOffice.luiss(), served, more);
    const byDana = <E extends Endpoint>(served: E, more: AskedWith) =>
      act(() => backOffice.danas(), served, more);
    interface Queued {
      queued?: { jobs: string[] } | undefined;
    }
    const reviewed = async <A extends Queued>(done: Promise<A>, projectId = p1): Promise<A> => {
      const answer = await done;
      if ((answer.queued?.jobs.length ?? 0) > 0) last.run = await queue.next(projectId);
      return answer;
    };
    // Luis's act as it was answered: refused at the door, or by the endpoint's rule in its words.
    const refusal = async (served: Endpoint, more: AskedWith): Promise<string> =>
      refusalOf(await (await backOffice.luiss()).asked(served, more));
    // The tickets the job an act queued names, as the worker reads them: the act's answer only
    // counts them.
    const jobTickets = async (answer: Queued): Promise<string[]> =>
      (
        await api.reconciliationJobTicket.findMany({
          where: { reconciliationJobId: { in: answer.queued?.jobs ?? [] } },
          orderBy: { id: 'asc' },
        })
      ).map((ticket) => ticket.ticketNumber);
    // What each act sends.
    const correcting = (
      fieldEventId: string,
      changes: BodyOf<typeof correctFieldEventEndpoint>['changes'],
      note?: string,
    ): AskedWith => ({ ids: { fieldEventId }, json: { changes, note } });
    const renumbering = (
      fieldEventId: string,
      to: { ticketNumber: string; splitSuffix?: string },
    ): AskedWith => ({ ids: { fieldEventId }, json: to });

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
      'P1 before any review: 101003 in review for its 96% call, 101006 waiting for the disposal typed as 101060, and 19 lines',
      [of(before, '101003', '101006', '101060'), (await lines(p1)).length],
      [
        [
          '101003 · MANUAL_REVIEW · Ticket 101003: load call 96%. Flagged for review.',
          '101006 · PENDING',
          '101060 · PENDING · Ticket 101060: typed ticket number (Barcode damaged). Flagged for review.',
        ],
        19,
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '07:40'),
      'Luis opens 101001 to correct its load call. Dana has granted him nothing yet',
    );
    const dis101001 = await eventOf('101001', 'DISPOSAL');
    const [load101001] = await loadOf('101001');
    const audited = (): Promise<number> => api.auditRecord.count();
    // Signed in first: a sign-in writes its own rows.
    await backOffice.luiss();
    const auditedBefore = await audited();
    story.check(
      'AC-08-05 a manager/analyst without the grant can’t correct or renumber: each is refused at the door, nothing is changed and nothing is audited',
      [
        await refusal(correctFieldEventEndpoint, correcting(dis101001.id, { loadCall: 70 })),
        await refusal(
          renumberFieldEventEndpoint,
          renumbering(dis101001.id, { ticketNumber: '101099' }),
        ),
        (await eventOf('101001', 'DISPOSAL')).loadCall,
        (await audited()) === auditedBefore,
      ],
      ['403 NOT_ALLOWED', '403 NOT_ALLOWED', 80, true],
    );
    story.at(on('14', '07:45'), 'Dana grants Luis correct and renumber');
    await backOffice.grantLuis('CORRECT', 'RENUMBER');

    story.at(
      on('14', '07:55'),
      'Luis saves 101001’s load call as 70%, and the job queue can’t be written just then',
    );
    // The API's own client, with a job queue that fails: every other write goes through.
    const queueAway = new Proxy(api, {
      get(target, property) {
        if (property !== '$write') return Reflect.get(target, property) as unknown;
        const write: typeof api.$write = (actor, work) =>
          target.$write(actor, (tx) =>
            work(
              new Proxy(tx, {
                get(inWork, model) {
                  if (model !== 'reconciliationJob') return Reflect.get(inWork, model) as unknown;
                  return { create: () => Promise.reject(new Error('The job queue is away.')) };
                },
              }),
            ),
          );
        return write;
      },
    });
    const jobsOf101001 = () =>
      api.reconciliationJob.findMany({
        where: {
          projectId: p1,
          tickets: { some: { workflow: 'LOAD', ticketNumber: '101001' } },
          trigger: 'CORRECTION',
        },
        include: { tickets: true },
        orderBy: { id: 'asc' },
      });
    const undone = await new Corrections(queueAway, clock, story.policy)
      .fieldEvent(luis, dis101001.id, { loadCall: 70 }, 'Tower photo shows 70%')
      .then(
        () => 'saved',
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      );
    const refusedFix = await refusal(
      correctFieldEventEndpoint,
      correcting(dis101001.id, {
        loadCall: 70,
        end: { latitude: '139.09', longitude: '-81.66' },
      }),
    );
    story.check(
      'AC-10-50 the correction and its job are one piece of work: when the job can’t be written the correction is undone with it (the call is still 80%, and the audit log holds nothing of Luis’s on the field event), and a correction that is refused queues no job',
      [
        undone,
        (await eventOf('101001', 'DISPOSAL')).loadCall,
        await changesTo(dis101001.id),
        refusedFix,
        (await jobsOf101001()).length,
      ],
      [
        'The job queue is away.',
        80,
        [],
        '422 NOT_SAVED · GPS_UNREADABLE: The end GPS can’t be a fix: latitude "139.09", longitude "-81.66". Nothing was changed.',
        0,
      ],
    );

    story.at(
      on('14', '08:00'),
      'Luis corrects 101001’s load call from 80% to 70%; the worker takes its job up',
    );
    const eventsBefore = await fieldEvents();
    const corrected = await reviewed(
      byLuis(
        correctFieldEventEndpoint,
        correcting(dis101001.id, { loadCall: 70 }, 'Tower photo shows 70%'),
      ),
    );
    const [job101001] = await jobsOf101001();
    story.check(
      'AC-10-50, AC-10-51 the same correction, saved: its job was queued with it, in Luis’s own piece of work (the audit log holds the job under Luis from the back office with the correction’s note), naming 101001; nobody asked the worker, whose run finished the job',
      [
        (await jobsOf101001()).length,
        corrected.queued?.jobs.length === 1 && corrected.queued.jobs[0] === job101001?.id,
        [job101001?.trigger, names.get(job101001?.requestedById ?? null)],
        job101001?.tickets.map((ticket) => ticket.ticketNumber),
        (
          await api.auditRecord.findMany({
            where: { tableName: 'reconciliation_job', recordId: job101001?.id ?? '' },
            orderBy: { id: 'asc' },
          })
        ).map((record) =>
          [names.get(record.actorId), record.source, record.operation, record.reason].join(' · '),
        ),
        last.run !== null && job101001?.reconciliationRunId === last.run.runId,
      ],
      [
        1,
        true,
        ['CORRECTION', 'Luis'],
        ['101001'],
        [
          'Luis · BACK_OFFICE · INSERT · Tower photo shows 70%',
          'system · SYSTEM · UPDATE · ',
          'system · SYSTEM · UPDATE · ',
        ],
        true,
      ],
    );
    story.check(
      'AC-08-10 the field event is changed in place, the audit log keeps 80 → 70 under Luis from the back office with his note, and the ticket reprocesses: the same completed load, now 45.5 CY, and one line, 45.5 × $7.50 = $341.25, the $390.00 row copied to the audit log first',
      [
        corrected.record.id === dis101001.id,
        await changesTo(dis101001.id),
        (
          await api.auditRecord.findFirstOrThrow({
            where: { tableName: 'field_event', recordId: dis101001.id, actorId: luis },
          })
        ).reason,
        await jobTickets(corrected),
        (await loadOf('101001')).map((load) => [
          load.id === load101001?.id,
          load.volumeCy?.toFixed(1),
        ]),
        await statusOf('101001'),
        await linesOf('101001'),
        await removed(),
      ],
      [
        true,
        ['Luis · BACK_OFFICE · load_call: 80 → 70'],
        'Tower photo shows 70%',
        ['101001'],
        [[true, '45.5']],
        ['COMPLETED'],
        ['101001 #1 VEG-HAUL-CY-15 45.5 × $7.50 = $341.25'],
        [390],
      ],
    );
    story.check(
      'AC-08-12 no replacement record and no "correction event": the installation holds the same number of field events, and the corrected one keeps its id',
      [(await fieldEvents()) === eventsBefore, (await eventOf('101001', 'DISPOSAL')).id],
      [true, dis101001.id],
    );

    story.at(on('14', '08:10'), 'Luis corrects 101003’s call from 96% to 90%; the worker runs');
    const dis101003 = await eventOf('101003', 'DISPOSAL');
    await reviewed(byLuis(correctFieldEventEndpoint, correcting(dis101003.id, { loadCall: 90 })));
    story.check(
      'AC-08-13 the flag is cleared and stays in the ticket’s history; with no other flag open the ticket is COMPLETED, billing 65 × 90% = 58.5 CY × $7.50 = $438.75',
      [await statusOf('101003'), await flagsOn('101003'), await linesOf('101003')],
      [
        ['COMPLETED'],
        ['Ticket 101003: load call 96%. Flagged for review. (cleared)'],
        ['101003 #1 VEG-HAUL-CY-15 58.5 × $7.50 = $438.75'],
      ],
    );

    story.at(
      on('14', '08:20'),
      'Luis corrects 101004’s disposal: it ended a minute later than recorded, two metres from where the phone put it; the worker runs',
    );
    const dis101004 = await eventOf('101004', 'DISPOSAL');
    const later = new Date(dis101004.endedAt.getTime() + 60_000);
    await reviewed(
      byLuis(
        correctFieldEventEndpoint,
        correcting(dis101004.id, {
          endedAt: later.toISOString(),
          end: { latitude: '39.09032000', longitude: '-75.62020000' },
        }),
      ),
    );
    story.check(
      'AC-08-11 a time and a GPS end are corrected the same way: in place, the value before kept, the ticket reprocessed and still COMPLETED at $180.00. A fix that can’t be one is refused, since nobody is waiting at the curb for it',
      [
        (await changesTo(dis101004.id)).map((change) => change.replace(/: .*?( ·|$)/g, '$1')),
        (({ endedAt, endLatitude }) => [endedAt.toISOString(), endLatitude?.toFixed(8)])(
          await eventOf('101004', 'DISPOSAL'),
        ),
        await statusOf('101004'),
        await linesOf('101004'),
        await refusal(
          correctFieldEventEndpoint,
          correcting(dis101004.id, { end: { latitude: '139.09', longitude: '-75.62' } }),
        ),
      ],
      [
        ['Luis · BACK_OFFICE · ended_at · end_latitude · end_longitude'],
        [later.toISOString(), '39.09032000'],
        ['COMPLETED'],
        ['101004 #1 VEG-HAUL-CY-15 24 × $7.50 = $180.00'],
        '422 NOT_SAVED · GPS_UNREADABLE: The end GPS can’t be a fix: latitude "139.09", longitude "-75.62". Nothing was changed.',
      ],
    );

    story.at(on('14', '08:30'), 'Luis types the address on the pending collection 101006');
    const col101006 = await eventOf('101006', 'COLLECTION');
    await reviewed(
      byLuis(
        correctFieldEventEndpoint,
        correcting(col101006.id, { address: '22 Elm St', addressSource: 'TYPED' }),
      ),
    );
    story.check(
      'AC-08-17 the change is saved and audited, and the ticket goes on waiting: still PENDING, with no completed load and no line',
      [
        await changesTo(col101006.id),
        await statusOf('101006'),
        (await loadOf('101006')).length,
        await linesOf('101006'),
      ],
      [
        ['Luis · BACK_OFFICE · address: null → 22 Elm St · address_source: null → TYPED'],
        ['PENDING'],
        0,
        [],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '08:40'),
      'Luis matches cert, times and photos, and renumbers Kim’s disposal typed 101060 to 101006; the worker runs',
    );
    const dis101060 = await eventOf('101060', 'DISPOSAL');
    const completedLoads = (): Promise<number> =>
      api.auditRecord.count({ where: { tableName: 'completed_load', operation: 'INSERT' } });
    const loadsWritten = await completedLoads();
    // The audit log has its own clock, the database's: what came after is told by its order.
    const lastAudited = (await api.auditRecord.findFirstOrThrow({ orderBy: { id: 'desc' } })).id;
    const renumbered = await reviewed(
      byLuis(renumberFieldEventEndpoint, renumbering(dis101060.id, { ticketNumber: '101006' })),
    );
    story.check(
      'AC-08-22 the field event keeps its id, the audit log keeps 101060 → 101006 under Luis, and 101006 is whole: one completed load, 48 × 60% = 28.8 CY, $216.00, in review for its typed number',
      [
        renumbered.record.id === dis101060.id,
        await changesTo(dis101060.id),
        await jobTickets(renumbered),
        (await loadOf('101006')).map((load) => load.volumeCy?.toFixed(1)),
        of(last.run, '101006'),
        await linesOf('101006'),
      ],
      [
        true,
        ['Luis · BACK_OFFICE · ticket_number: 101060 → 101006'],
        ['101060', '101006'],
        ['28.8'],
        [
          '101006 · MANUAL_REVIEW · Ticket 101006: typed ticket number (Barcode damaged). Flagged for review.',
        ],
        ['101006 #1 VEG-HAUL-CY-15 28.8 × $7.50 = $216.00'],
      ],
    );
    story.check(
      'AC-08-23 nothing is left under 101060: the run lists no such ticket, and the flag raised on it is cleared',
      [
        of(last.run, '101060'),
        await api.fieldEvent.count({ where: { ticketNumber: '101060' } }),
        (await flagsOn('101060')).filter((flag) => !flag.endsWith('(cleared)')),
      ],
      [[], 0, []],
    );
    story.check(
      'AC-08-24, AC-08-07, AC-10-51 Luis changed one thing, the disposal’s number, and with it queued one job naming the two numbers: every other record of the pairing (the completed load, its collection row, the line) was written by the system actor in the worker’s own run, which names Luis only as who asked',
      [
        (
          await api.auditRecord.findMany({
            where: {
              actorId: luis,
              id: { gt: lastAudited },
              // His browser's own session, refreshed as the story's clock moved on, is his
              // sign-in's, not a change to a record (ADR-501).
              tableName: {
                notIn: ['reconciliation_job', 'reconciliation_job_ticket', 'session'],
              },
            },
          })
        ).map((record) => `${record.tableName} ${record.operation} ${record.changedFields.join()}`),
        (
          await api.auditRecord.findMany({
            where: {
              actorId: luis,
              id: { gt: lastAudited },
              tableName: { in: ['reconciliation_job', 'reconciliation_job_ticket'] },
            },
            orderBy: { id: 'asc' },
          })
        ).map((record) => `${record.tableName} ${record.operation}`),
        (await completedLoads()) - loadsWritten,
        (
          await api.auditRecord.findMany({
            where: {
              tableName: { in: ['completed_load', 'completed_load_collection', 'transaction'] },
              id: { gt: lastAudited },
            },
          })
        ).every((record) => record.actorId === systemActorId && record.source === 'SYSTEM'),
        last.run === null
          ? []
          : (({ trigger, requestedById }) => [trigger, names.get(requestedById)])(
              await api.reconciliationRun.findUniqueOrThrow({ where: { id: last.run.runId } }),
            ),
      ],
      [
        ['field_event UPDATE ticket_number'],
        [
          'reconciliation_job INSERT',
          'reconciliation_job_ticket INSERT',
          'reconciliation_job_ticket INSERT',
        ],
        1,
        true,
        ['CORRECTION', 'Luis'],
      ],
    );

    story.at(
      on('14', '08:50'),
      'A slip: 101005’s disposal is renumbered to 101050; the worker runs',
    );
    const dis101005 = await eventOf('101005', 'DISPOSAL');
    const [load101005] = await loadOf('101005');
    await reviewed(
      byLuis(renumberFieldEventEndpoint, renumbering(dis101005.id, { ticketNumber: '101050' })),
    );
    story.check(
      'AC-08-28 101005 is PENDING again, its completed load marked dissolved and never deleted, and its $341.25 line removed, copied in full to the audit log first',
      [
        await statusOf('101005'),
        (await loadOf('101005')).map((load) => [
          load.id === load101005?.id,
          load.dissolvedAt !== null,
        ]),
        await linesOf('101005'),
        (await removed()).at(-1),
      ],
      [['PENDING'], [[true, true]], [], 341.25],
    );
    story.at(on('14', '08:55'), 'Luis renumbers it back; the worker runs');
    await reviewed(
      byLuis(renumberFieldEventEndpoint, renumbering(dis101005.id, { ticketNumber: '101005' })),
    );
    story.check(
      'AC-08-28 the ticket is whole again: the same completed load with its mark cleared, and 45.5 × $7.50 = $341.25 written again',
      [
        await statusOf('101005'),
        (await loadOf('101005')).map((load) => [
          load.id === load101005?.id,
          load.dissolvedAt === null,
        ]),
        await linesOf('101005'),
      ],
      [['COMPLETED'], [[true, true]], ['101005 #1 VEG-HAUL-CY-15 45.5 × $7.50 = $341.25']],
    );
    const auditedAt0900 = await audited();
    story.check(
      'AC-08-27 a renumber onto a number another disposal holds is refused by the database’s own key, told in plain words, and nothing changes',
      [
        await refusal(
          renumberFieldEventEndpoint,
          renumbering(dis101005.id, { ticketNumber: '101004' }),
        ),
        (await eventOf('101005', 'DISPOSAL')).id === dis101005.id,
        (await audited()) === auditedAt0900,
      ],
      [
        '422 NOT_SAVED · NUMBER_HELD: Ticket 101004 already has a disposal: a ticket has one of each kind. Nothing was changed.',
        true,
        true,
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '09:10'),
      'Luis removes the only photograph of hanger ticket 301001 from the record; the worker runs',
    );
    const urt301001 = await eventOf('301001', 'UNIT_RATE');
    const photograph = await api.photo.findFirstOrThrow({ where: { fieldEventId: urt301001.id } });
    const marking = (marks: BodyOf<typeof markPhotographEndpoint>['marks']): AskedWith => ({
      ids: { photoId: photograph.id },
      json: { marks },
    });
    await reviewed(byLuis(markPhotographEndpoint, marking({ removed: true })));
    const flaggedForPhotos = of(last.run, '301001');
    story.at(on('14', '09:15'), 'He puts it back, labelled; the worker runs');
    await reviewed(
      byLuis(markPhotographEndpoint, marking({ removed: false, label: 'Hanger, before the cut' })),
    );
    const kept = await api.photo.findUniqueOrThrow({ where: { id: photograph.id } });
    story.check(
      'AC-08-20 with its photograph removed the ticket is flagged "no photos"; put back, the flag is cleared. The photograph’s row, file and fingerprints were there all the while',
      [
        flaggedForPhotos,
        of(last.run, '301001'),
        await flagsOn('301001'),
        [
          kept.archivedAt,
          kept.label,
          kept.objectKey === photograph.objectKey,
          kept.originalSha256 === photograph.originalSha256,
        ],
        await api.photo.count({ where: { fieldEventId: urt301001.id } }),
      ],
      [
        ['301001 · MANUAL_REVIEW · Ticket 301001: no photos. Flagged for review.'],
        ['301001 · COMPLETED'],
        ['Ticket 301001: no photos. Flagged for review. (cleared)'],
        [null, 'Hanger, before the cut', true, true],
        1,
      ],
    );

    story.at(
      on('14', '09:25'),
      'White goods ticket 301006 lists a dryer the crew never loaded: Luis takes the line off; the worker runs',
    );
    const urt301006 = await eventOf('301006', 'UNIT_RATE');
    const dryer = await api.itemName.findFirstOrThrow({ where: { name: 'Dryer' } });
    const linesOn301006 = await api.fieldEventItem.count({
      where: { fieldEventId: urt301006.id },
    });
    const lining = (quantity: number | 'TAKEN_OFF'): AskedWith => ({
      ids: { fieldEventId: urt301006.id, itemNameId: dryer.id },
      json: { quantity },
    });
    const takenOff = await reviewed(byLuis(correctItemLineEndpoint, lining('TAKEN_OFF')));
    const without = await linesOf('301006');
    story.at(on('14', '09:30'), 'The monitor confirms the dryer: Luis puts the line back');
    await reviewed(byLuis(correctItemLineEndpoint, lining(1)));
    story.check(
      'AC-08-66 a line taken off is marked, never deleted, and counts for nothing: the ticket bills 5 items; put back, it is the same row and the ticket bills 6 again',
      [
        takenOff.record.takenOffAt !== null,
        without,
        await linesOf('301006'),
        (await api.fieldEventItem.count({ where: { fieldEventId: urt301006.id } })) ===
          linesOn301006,
        (await changesTo(takenOff.record.id, 'field_event_item')).map((change) =>
          change.replace(/\d{4}-[^ ]+/, 'a time'),
        ),
      ],
      [
        true,
        ['301006 #1 WG-RMV-EA 5 × $40.00 = $200.00', '301006 #2 WG-FRN-EA 2 × $25.00 = $50.00'],
        ['301006 #1 WG-RMV-EA 6 × $40.00 = $240.00', '301006 #2 WG-FRN-EA 2 × $25.00 = $50.00'],
        true,
        [
          'Luis · BACK_OFFICE · archived_at: null → a time',
          'Luis · BACK_OFFICE · archived_at: a time → null',
        ],
      ],
    );

    // ------------------------------------------------------------------------------------------
    // Wednesday's own work. The story `p1-field-days` ends on Tuesday, so each record is made as
    // the phone that recorded a Monday or Tuesday one would have sent it, at Wednesday's times.
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
    // The curb's and the towers' records to copy: Ana's 101001 (the dump trailer 730415, from
    // Heron St to Marsh Road TDSR) and 101002 (Rivera's self-loader 730416, C&D, to the Landfill).
    const curb = heldEvent('101001', 'COLLECTION');
    const tower = heldEvent('101001', 'DISPOSAL');
    const curbCd = heldEvent('101002', 'COLLECTION');
    const landfillTower = heldEvent('101002', 'DISPOSAL');
    const noAddress = { address: null, addressSource: null };
    const elmSt = { ...noAddress, endLatitude: '39.15000000', endLongitude: '-75.54000000' };
    const birchLn = { ...noAddress, endLatitude: '39.17000000', endLongitude: '-75.69000000' };
    const selfLoader = { certNumber: '730416' };

    story.at(
      on('14', '18:00'),
      'Wednesday evening: the day’s work syncs. On P1: 101008, whose two ends disagree; Scenario A’s 101020 and 101021, the barcode 101020 scanned twice at the tower; 101029, whose tower phone failed; Scenario B’s 101030 and its phantom 101031; haul-out 201002, dumped back at Marsh Road TDSR',
    );
    // 101008: collected as Vegetative on 730415, dumped as C&D under 730416's badge.
    await send(made(curb, '07:30', '07:50', { ...noAddress, ticketNumber: '101008' }));
    await send(
      made(tower, '08:20', '08:30', {
        ticketNumber: '101008',
        ...selfLoader,
        formDebrisTypeId: curbCd.formDebrisTypeId,
        loadCall: 80,
      }),
    );
    // Scenario A.
    await send(made(curb, '09:14', '09:40', { ...elmSt, ...selfLoader, ticketNumber: '101020' }));
    await send(made(curb, '10:51', '11:05', { ...birchLn, ...selfLoader, ticketNumber: '101021' }));
    const first = { ticketNumber: '101020', ...selfLoader, loadCall: 50 };
    const sentFirst = await send(made(tower, '10:22', '10:30', first));
    const twice = made(tower, '11:40', '11:48', { ...first, loadCall: 75 });
    const sentTwice = await send(twice);
    const bedFile = `P1-TWR-TDSR/${twice.endedAt.toISOString()}/empty-bed`;
    const bedPhoto = await photoSentAlone(story, timeZone, twice.deviceId, {
      id: uuidv7(twice.endedAt),
      projectId: p1,
      owner: { kind: 'FIELD_EVENT', id: twice.id },
      view: null,
      takenById: twice.monitorId,
      capturedAt: twice.endedAt.toISOString(),
      deviceUtcOffsetMinutes: twice.deviceUtcOffsetMinutes,
      latitude: null,
      longitude: null,
      originalSha256: createHash('sha256').update(`${bedFile} as taken`).digest('hex'),
      uploadedSha256: createHash('sha256').update(`${bedFile} as uploaded`).digest('hex'),
      depthSha256: null,
    });
    if (bedPhoto.answer !== 'SAVED') throw new Error(`Not saved: ${JSON.stringify(bedPhoto)}`);
    // 101029: collected, and dumped at the Landfill, where the tower's phone had failed.
    await send(made(curbCd, '12:30', '12:50', { ticketNumber: '101029' }));
    // Scenario B: one pile, two numbers, the same loading times; the truck dumps under 101030.
    await send(made(curb, '14:10', '14:40', { ...noAddress, ticketNumber: '101030' }));
    await send(made(curb, '14:10', '14:40', { ...noAddress, ticketNumber: '101031' }));
    await send(made(tower, '15:05', '15:15', { ticketNumber: '101030', loadCall: 70 }));
    // 201002: loaded at Marsh Road TDSR like 201001, and recorded as dumped at the TDSR.
    await send(
      made(heldEvent('201001', 'HAUL_OUT_COLLECTION'), '13:00', '13:20', {
        ticketNumber: '201002',
      }),
    );
    await send(
      made(heldEvent('201001', 'HAUL_OUT_DISPOSAL'), '14:00', '14:10', {
        ticketNumber: '201002',
        siteId: tdsr,
      }),
    );
    story.at(on('14', '18:45'), 'The worker runs on P1');
    await queue.settle(p1);
    const evening = await queue.standing(p1);
    story.check(
      'Wednesday’s tickets before review: the second disposal scanned 101020 is in quarantine, not saved; each flag is the catalogue’s, word for word',
      [
        [sentFirst, sentTwice],
        of(evening, '101008', '10102', '10103', '201002'),
        await api.quarantinedRecord.count({ where: { projectId: p1, resolvedAt: null } }),
      ],
      [
        ['SAVED', 'QUARANTINED'],
        [
          "101008 · MANUAL_REVIEW · Ticket 101008: debris type mismatch (collection Vegetative, disposal C&D). Flagged for review. · Ticket 101008: truck number doesn't match (collection 730415, disposal 730416). Flagged for review.",
          '101020 · COMPLETED',
          '101021 · PENDING',
          '101029 · PENDING',
          '101030 · MANUAL_REVIEW · Ticket 101030: loading 14:10–14:40 overlaps ticket 101031 on truck 730415. Flagged for review.',
          '101031 · PENDING · Ticket 101031: loading 14:10–14:40 overlaps ticket 101030 on truck 730415. Flagged for review.',
          '201002 · MANUAL_REVIEW · Ticket 201002: a haul-out dumped at Marsh Road TDSR, a TDSR. Flagged for review; not priced.',
        ],
        1,
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('15', '08:00'),
      'Thursday: Luis reviews. 101008’s tower picked the wrong debris type: he corrects the disposal’s to Vegetative; the worker runs',
    );
    const dis101008 = await eventOf('101008', 'DISPOSAL');
    const col101008 = await eventOf('101008', 'COLLECTION');
    await reviewed(
      byLuis(
        correctFieldEventEndpoint,
        correcting(dis101008.id, { formDebrisTypeId: col101008.formDebrisTypeId }),
      ),
    );
    story.check(
      'AC-08-14 the debris type flag is cleared; the collection wasn’t touched: a person corrected the one field event that was wrong, and its form went with its debris type',
      [
        of(last.run, '101008'),
        (await changesTo(dis101008.id)).map((change) => change.replace(/: .*?( ·|$)/g, '$1')),
        await changesTo(col101008.id),
      ],
      [
        [
          "101008 · MANUAL_REVIEW · Ticket 101008: truck number doesn't match (collection 730415, disposal 730416). Flagged for review.",
        ],
        ['Luis · BACK_OFFICE · form_debris_type_id'],
        [],
      ],
    );
    story.at(on('15', '08:10'), 'And its badge: he corrects the disposal’s cert number to 730415');
    await reviewed(
      byLuis(correctFieldEventEndpoint, correcting(dis101008.id, { certNumber: '730415' })),
    );
    story.check(
      'AC-08-15 the flag is cleared and the ticket is priced from 730415, the certification the corrected number found: 65 × 80% = 52 CY, $390.00',
      [
        of(last.run, '101008'),
        (await changesTo(dis101008.id)).at(-1)?.replace(/certification_id: [^·]*( · |$)/, ''),
        (await eventOf('101008', 'DISPOSAL')).certificationId === col101008.certificationId,
        await linesOf('101008'),
      ],
      [
        ['101008 · COMPLETED'],
        'Luis · BACK_OFFICE · cert_number: 730416 → 730415',
        true,
        ['101008 #1 VEG-HAUL-CY-15 52 × $7.50 = $390.00'],
      ],
    );

    story.at(
      on('15', '08:20'),
      'Haul-out 201002 was dumped at the Landfill, where its GPS puts it: Luis corrects its disposal’s site; the worker runs',
    );
    const hod201002 = await eventOf('201002', 'HAUL_OUT_DISPOSAL');
    await reviewed(
      byLuis(correctFieldEventEndpoint, correcting(hod201002.id, { siteId: landfill })),
    );
    story.check(
      'AC-08-16, AC-08-11 the flag is cleared and the rules run on it: the haul-out by the CY and the Landfill’s tipping fee',
      [of(last.run, '201002'), await flagsOn('201002'), await linesOf('201002')],
      [
        ['201002 · COMPLETED'],
        [
          'Ticket 201002: a haul-out dumped at Marsh Road TDSR, a TDSR. Flagged for review; not priced. (cleared)',
        ],
        [
          '201002 #1 MULCH-HO-CY 99 × $5.10 = $504.90',
          '201002 #2 TIP-FEE-CY-BCL 99 × $4.00 = $396.00',
        ],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('15', '08:40'),
      'The quarantined disposal: one truck, two trips, the second after 101021 was loaded. Luis renumbers it to 101021; the worker runs',
    );
    const waiting = await api.quarantinedRecord.findFirstOrThrow({
      where: { projectId: p1, resolvedAt: null },
    });
    const [load101020] = await loadOf('101020');
    const auditedOn101020 = await api.auditRecord.count({
      where: { recordId: { in: [load101020?.id ?? '', load101020?.disposalEventId ?? ''] } },
    });
    const quarantined = { quarantinedRecordId: waiting.id };
    const resolved = await reviewed(
      byLuis(renumberQuarantinedRecordEndpoint, {
        ids: quarantined,
        json: { to: { ticketNumber: '101021' } },
      }),
    );
    const dis101021 = await eventOf('101021', 'DISPOSAL');
    story.check(
      'AC-08-25 it becomes a field event that keeps its phone-made id, its photograph now that field event’s, and 101021 pairs: 48 × 75% = 36 CY, $270.00. 101020, COMPLETED with its 10:22 disposal, is not touched',
      [
        dis101021.id === twice.id,
        [dis101021.source, dis101021.loadCall, dis101021.startedAt.toISOString()],
        (await api.photo.findMany({ where: { id: bedPhoto.id } })).map((photo) => [
          photo.fieldEventId === twice.id,
          photo.quarantinedRecordId,
        ]),
        of(last.run, '101020', '101021'),
        await linesOf('101021'),
        (await api.auditRecord.count({
          where: { recordId: { in: [load101020?.id ?? '', load101020?.disposalEventId ?? ''] } },
        })) === auditedOn101020,
      ],
      [
        true,
        ['DEVICE', 75, twice.startedAt.toISOString()],
        [[true, null]],
        ['101020 · COMPLETED', '101021 · COMPLETED'],
        ['101021 #1 VEG-HAUL-CY-15 36 × $7.50 = $270.00'],
        true,
      ],
    );
    const after = await api.quarantinedRecord.findUniqueOrThrow({ where: { id: waiting.id } });
    story.check(
      'AC-08-26, AC-08-07 the quarantined record is kept and marked resolved, by Luis, when and how; what the phone sent is still there exactly as sent, under 101020; the new field event’s audit record names Luis, from the back office. Resolved once: a second try is refused',
      [
        [names.get(after.resolvedById), after.resolvedAt?.toISOString(), after.resolution],
        JSON.stringify(after.payload) === JSON.stringify(waiting.payload),
        (after.payload as { fieldEvent: { ticketNumber: string } }).fieldEvent.ticketNumber,
        (
          await api.auditRecord.findMany({
            where: { tableName: 'field_event', recordId: twice.id, operation: 'INSERT' },
          })
        ).map((record) => [names.get(record.actorId), record.source]),
        await jobTickets(resolved),
        await refusal(markSecondCopyEndpoint, { ids: quarantined, json: {} }),
      ],
      [
        [
          'Luis',
          new Date(on('15', '08:40')).toISOString(),
          'Renumbered to 101021: saved as a record of its own, with its photographs.',
        ],
        true,
        '101020',
        [['Luis', 'BACK_OFFICE']],
        ['101020', '101021'],
        '422 NOT_SAVED · ALREADY_RESOLVED: This quarantined record is already resolved (Renumbered to 101021: saved as a record of its own, with its photographs.). Nothing was changed.',
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('15', '09:00'),
      'The Landfill tower’s phone failed on Wednesday. Luis creates Tariq Patel’s disposal on 101029 from Tariq’s account of it: Rivera’s self-loader, C&D, called 50%; the worker runs',
    );
    const tariq = (await api.user.findFirstOrThrow({ where: { name: 'Tariq Patel' } })).id;
    const reasonId = async (name: string): Promise<string> =>
      (await api.reason.findFirstOrThrow({ where: { name } })).id;
    // What Tariq would have recorded, less the phone itself.
    const asTariqSaw = asEntered(
      made(landfillTower, '13:30', '13:40', {
        ticketNumber: '101029',
        monitorId: tariq,
        loadCall: 50,
      }),
    );
    const entering = async (reason: string): Promise<AskedWith> => ({
      ids: { projectId: p1 },
      json: { ...asTariqSaw, reasonId: await reasonId(reason) },
    });
    const wrongList = await refusal(createFieldEventEndpoint, await entering('Photos confirm'));
    const created = await reviewed(
      byLuis(createFieldEventEndpoint, await entering('Device failed')),
    );
    // The field event as it was created, before the run: the answer says no more of who made it,
    // on which phone, or its status.
    const asCreated = (
      await api.auditRecord.findFirstOrThrow({
        where: { tableName: 'field_event', recordId: created.record.id, operation: 'INSERT' },
      })
    ).newValue as Record<string, unknown>;
    story.check(
      'AC-08-21 it is a field event like any other, marked with Luis and the reason, with no phone; it pairs with its collection, is flagged as created in the back office, and bills: 48 × 50% = 24 CY, the haul and the Landfill’s tipping fee. A reason from another list is refused',
      [
        wrongList,
        [
          created.record.source,
          names.get(asCreated['created_by_id'] as string),
          created.record.monitorId === tariq,
          asCreated['device_id'],
          asCreated['status'],
        ],
        of(last.run, '101029'),
        await linesOf('101029'),
        await refusal(createFieldEventEndpoint, await entering('Device failed')),
      ],
      [
        '422 NOT_SAVED · REASON_NOT_OFFERED: "Photos confirm" isn’t a reason the firm offers for a record created in the back office. Nothing was saved.',
        ['BACK_OFFICE', 'Luis', true, null, 'PENDING'],
        [
          '101029 · MANUAL_REVIEW · Ticket 101029: record created in the back office by Luis Ortega (Device failed). Flagged for review.',
        ],
        [
          '101029 #1 CD-HAUL-CY-15 24 × $8.25 = $198.00',
          '101029 #2 TIP-FEE-CY-BCL 24 × $4.00 = $96.00',
        ],
        '422 NOT_SAVED · NUMBER_HELD: Ticket 101029 already has a disposal: a ticket has one of each kind. Nothing was changed.',
      ],
    );

    story.at(
      on('15', '09:20'),
      'A wrong choice: someone renumbers the phantom 101031 to 101035 instead of voiding it; the worker runs',
    );
    const col101031 = await eventOf('101031', 'COLLECTION');
    await reviewed(
      byLuis(renumberFieldEventEndpoint, renumbering(col101031.id, { ticketNumber: '101035' })),
    );
    story.check(
      'AC-08-30 nothing refuses it: the renumber is saved and audited under that person, and the phantom now waits under 101035, both tickets still flagged for the overlap. The audit trail is the backstop',
      [await changesTo(col101031.id), of(last.run, '101030', '101031', '101035')],
      [
        ['Luis · BACK_OFFICE · ticket_number: 101031 → 101035'],
        [
          '101030 · MANUAL_REVIEW · Ticket 101030: loading 14:10–14:40 overlaps ticket 101035 on truck 730415. Flagged for review.',
          '101035 · PENDING · Ticket 101035: loading 14:10–14:40 overlaps ticket 101030 on truck 730415. Flagged for review.',
        ],
      ],
    );
    story.at(
      on('15', '09:30'),
      'The curb photographs put 101035’s loading at 15:30 to 16:00, after the truck had dumped 101030: Luis corrects its times; the worker takes the job up',
    );
    const eightyMinutesOn = (time: Date): Date => new Date(time.getTime() + 80 * 60_000);
    const retimed = await reviewed(
      byLuis(
        correctFieldEventEndpoint,
        correcting(col101031.id, {
          startedAt: eightyMinutesOn(col101031.startedAt).toISOString(),
          endedAt: eightyMinutesOn(col101031.endedAt).toISOString(),
        }),
      ),
    );
    story.check(
      'AC-10-54 the correction’s job names 101030 too, the ticket that read 101035 as it stood before the change: afterwards nothing says the two were neighbours, and only the change knew. In the one run the overlap is cleared on both, and 101030 is COMPLETED',
      [
        retimed.queued?.tickets,
        await jobTickets(retimed),
        of(last.run, '101030', '101035'),
        await flagsOn('101030'),
      ],
      [
        2,
        ['101035', '101030'],
        ['101030 · COMPLETED', '101035 · PENDING'],
        [
          'Ticket 101030: loading 14:10–14:40 overlaps ticket 101031 on truck 730415. Flagged for review. (cleared)',
          'Ticket 101030: loading 14:10–14:40 overlaps ticket 101035 on truck 730415. Flagged for review. (cleared)',
        ],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('15', '10:00'),
      'P2’s Wednesday reaches the office: ROEs R-0007 (412 Cedar Ct) and R-0008 (416 Cedar Ct), which Luis enters with a scope of C&D only; load 102005 from 416 Cedar Ct, Vegetative; and the split load 102001, whose second collection came in as -C',
    );
    const lee = (await api.user.findFirstOrThrow({ where: { name: 'Lee Morgan' } })).id;
    const kim = (await api.user.findFirstOrThrow({ where: { name: 'Kim Nguyen' } })).id;
    // The phone was enrolled on Tuesday evening, under the master passcode; its assignment is
    // the board's.
    const p2Assigned = async (
      name: string,
      personId: string,
      more: { fieldEventKinds: ('COLLECTION' | 'DISPOSAL')[]; siteId?: string },
    ) => {
      const phone = await story.enrolled(name, new Date(on('13', '17:00')));
      const assignmentId = await assigned(api, clock, luis, {
        workDate: '2026-10-14',
        projectId: p2,
        personId,
        deviceId: phone.id,
        ...more,
      });
      return { monitorId: personId, deviceId: phone.id, assignmentId };
    };
    const p2Phones = {
      lee: await p2Assigned('P2-COL-1', lee, { fieldEventKinds: ['COLLECTION'] }),
      kim: await p2Assigned('P2-TWR-TDSR', kim, { fieldEventKinds: ['DISPOSAL'], siteId: p2Tdsr }),
    };
    const roe = async (roeNumber: string, address: string, ownerName: string, at: string) => {
      const madeAt = new Date(on('14', at));
      const id = uuidv7(madeAt);
      await sentAlone(story, timeZone, {
        record: 'ROE',
        roe: {
          id,
          projectId: p2,
          roeNumber,
          parcelId: null,
          address,
          ownerName,
          signed: true,
          signedDate: '2026-10-09',
          source: 'DEVICE',
          madeById: lee,
          deviceId: p2Phones.lee.deviceId,
          assignmentId: p2Phones.lee.assignmentId,
          madeAt,
          deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, madeAt),
        },
      });
      return id;
    };
    await roe('R-0007', '412 Cedar Ct', 'Rosa Delgado', '07:00');
    const r0008 = await roe('R-0008', '416 Cedar Ct', 'Ben Whitaker', '07:10');
    const scoping = (formDebrisTypeId: string): AskedWith => ({
      ids: { roeId: r0008 },
      json: { pick: { formDebrisTypeId }, inScope: true },
    });
    await byLuis(correctRoeScopeEndpoint, scoping(p2Cd));
    const cedar412 = {
      address: '412 Cedar Ct',
      addressSource: 'TYPED',
      endLatitude: '39.12000000',
      endLongitude: '-75.56000000',
    } as const;
    const cedar416 = {
      address: '416 Cedar Ct',
      addressSource: 'TYPED',
      endLatitude: '39.12020000',
      endLongitude: '-75.56030000',
    } as const;
    const onP2 = { projectId: p2, ...selfLoader, formDebrisTypeId: p2Vegetative };
    const p2Curb = { ...onP2, ...p2Phones.lee };
    const p2Tower = { ...onP2, ...p2Phones.kim, siteId: p2Tdsr };
    await send(
      made(curb, '07:30', '07:50', {
        ...p2Curb,
        ...cedar416,
        ticketNumber: '102005',
        roeNumber: 'R-0008',
      }),
    );
    await send(made(tower, '08:10', '08:20', { ...p2Tower, ticketNumber: '102005', loadCall: 50 }));
    await send(
      made(curb, '08:20', '08:40', {
        ...p2Curb,
        ...cedar412,
        ticketNumber: '102001',
        splitSuffix: 'A',
        estimateCy: 12,
        roeNumber: 'R-0007',
      }),
    );
    const propertyC = made(curb, '08:55', '09:05', {
      ...p2Curb,
      ...cedar416,
      ticketNumber: '102001',
      splitSuffix: 'C',
      estimateCy: 18,
      roeNumber: 'R-0008',
    });
    await send(propertyC);
    await send(made(tower, '10:10', '10:20', { ...p2Tower, ticketNumber: '102001', loadCall: 75 }));
    story.at(on('15', '10:10'), 'The worker runs on P2');
    await queue.settle(p2);
    const p2Run = await queue.standing(p2);
    story.check(
      'P2 before review: 102005 and the split’s second property are outside R-0008’s scope, and the split has no -B',
      told(p2Run),
      [
        '102001 · MANUAL_REVIEW · Ticket 102001: collections -A and -C, no -B. Flagged for review. · Ticket 102001: outside the scope of ROE R-0008. Flagged for review.',
        '102005 · MANUAL_REVIEW · Ticket 102005: outside the scope of ROE R-0008. Flagged for review.',
      ],
    );

    story.at(
      on('15', '10:20'),
      'The ROE covers vegetative debris too: Luis adds Vegetative to R-0008’s scope; the worker runs',
    );
    const scoped = await reviewed(byLuis(correctRoeScopeEndpoint, scoping(p2Vegetative)), p2);
    story.check(
      'AC-08-19 the change is audited under Luis and the flag is cleared on every ticket that names the ROE: 102005 is COMPLETED, 48 × 50% = 24 CY × $9.00 = $216.00',
      [
        (
          await api.auditRecord.findMany({
            where: { tableName: 'roe_scope_item', recordId: scoped.record.id },
          })
        ).map((record) => [names.get(record.actorId), record.source, record.operation]),
        await jobTickets(scoped),
        told(last.run),
        await linesOf('102005', p2),
      ],
      [
        [['Luis', 'BACK_OFFICE', 'INSERT']],
        ['102001', '102005'],
        [
          '102001 · MANUAL_REVIEW · Ticket 102001: collections -A and -C, no -B. Flagged for review.',
          '102005 · COMPLETED',
        ],
        ['102005 #1 VEG-HAUL-CY 24 × $9.00 = $216.00'],
      ],
    );

    story.at(
      on('15', '10:30'),
      'The split’s second collection was keyed -C: Luis corrects its suffix to -B; the worker runs',
    );
    await reviewed(
      byLuis(
        renumberFieldEventEndpoint,
        renumbering(propertyC.id, { ticketNumber: '102001', splitSuffix: 'B' }),
      ),
      p2,
    );
    story.check(
      'AC-08-29 the flag is cleared; the collection stays on its base number, and each property bills its share of 48 × 75% = 36.0 CY: 12 ÷ 30 and 18 ÷ 30',
      [
        await changesTo(propertyC.id),
        told(last.run).filter((line) => line.startsWith('102001')),
        await linesOf('102001', p2),
      ],
      [
        ['Luis · BACK_OFFICE · split_suffix: C → B'],
        ['102001 · COMPLETED'],
        [
          '102001-A #1 VEG-HAUL-CY 14.4 × $9.00 = $129.60',
          '102001-B #1 VEG-HAUL-CY 21.6 × $9.00 = $194.40',
        ],
      ],
    );

    story.at(on('15', '10:40'), 'Luis corrects -A’s estimate from 12 CY to 18 CY; the worker runs');
    const propertyA = await api.fieldEvent.findFirstOrThrow({
      where: { projectId: p2, ticketNumber: '102001', splitSuffix: 'A' },
    });
    await reviewed(
      byLuis(correctFieldEventEndpoint, correcting(propertyA.id, { estimateCy: 18 })),
      p2,
    );
    story.check(
      'AC-08-18 the estimate is changed in place and the shares are worked out again, 18 ÷ 36 each: $162.00 and $162.00, still $324.00 in all, the $129.60 and $194.40 rows copied to the audit log first',
      [
        await changesTo(propertyA.id),
        await linesOf('102001', p2),
        (await removed()).slice(-2).sort((left, right) => left - right),
      ],
      [
        ['Luis · BACK_OFFICE · estimate_cy: 12 → 18'],
        [
          '102001-A #1 VEG-HAUL-CY 18 × $9.00 = $162.00',
          '102001-B #1 VEG-HAUL-CY 18 × $9.00 = $162.00',
        ],
        [129.6, 194.4],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('15', '11:00'),
      'Dana grants Luis QC and lock as invoiced; he QC Approves 101001 and locks it as invoiced (the lock itself is Part 9’s). Then a measuring mistake is found on certification 730415: its sideboards are 12 in, not 16. Luis corrects the box; the worker runs',
    );
    await backOffice.grantLuis('QC', 'LOCK_INVOICED');
    const ticket101001 = { completedLoadId: load101001?.id ?? '' };
    await byLuis(setQcStatusEndpoint, { json: { record: ticket101001, status: 'QC_APPROVED' } });
    await byLuis(lockAsInvoicedEndpoint, { json: { ticket: ticket101001 } });
    const dumpTrailer = await api.certification.findFirstOrThrow({
      where: { projectId: p1, certNumber: '730415' },
    });
    // Its sideboards are its second box, after the primary (0).
    const measured = await reviewed(
      byLuis(correctCertificationBoxEndpoint, {
        ids: { certificationId: dumpTrailer.id, position: '1' },
        json: { changes: { height: 12 } },
      }),
    );
    const on730415 = await jobTickets(measured);
    story.check(
      'AC-03-52, AC-09-16 the capacity is worked out again, 65 CY to 62 CY, and every un-invoiced ticket on the certification reprocesses at it: 101003 bills 62 × 90% = 55.8 CY. 101001, locked as invoiced, is left off the job, counted as waiting for its unlock, and is left exactly as it is',
      [
        [dumpTrailer.capacityCy, measured.record.capacityCy],
        on730415,
        measured.queued?.lockedAsInvoiced,
        await linesOf('101003'),
        await linesOf('101005'),
        await linesOf('101001'),
        (await loadOf('101001')).map((load) => load.capacityCy),
      ],
      [
        [65, 62],
        ['101003', '101005', '101008', '101030', '101035'],
        1,
        ['101003 #1 VEG-HAUL-CY-15 55.8 × $7.50 = $418.50'],
        ['101005 #1 VEG-HAUL-CY-15 43.4 × $7.50 = $325.50'],
        ['101001 #1 VEG-HAUL-CY-15 45.5 × $7.50 = $341.25'],
        [65],
      ],
    );
    story.at(on('15', '11:20'), 'Dana unlocks 101001 (Luis holds no unlock); the worker runs');
    await byDana(unlockInvoicedEndpoint, {
      json: { ticket: ticket101001, note: 'Capacity corrected' },
    });
    await queue.next(p1);
    story.check(
      'AC-09-16 unlocked first, the unlock audited under Dana, it reprocesses at the new capacity: 62 × 70% = 43.4 CY, $325.50',
      [
        (
          await api.auditRecord.findMany({
            where: { tableName: 'invoice_lock', operation: 'UPDATE' },
          })
        ).map((record) => [
          names.get(record.actorId),
          record.changedFields.includes('unlocked_at'),
        ]),
        (await loadOf('101001')).map((load) => [load.capacityCy, load.volumeCy?.toFixed(1)]),
        await linesOf('101001'),
      ],
      [[['Dana', true]], [[62, '43.4']], ['101001 #1 VEG-HAUL-CY-15 43.4 × $7.50 = $325.50']],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('15', '11:40'),
      'A second Rivera truck, 730421, is certified on P1 with its sub typed as its subcontract names it, "Rivera Trucking LLC"; the worker runs',
    );
    await saved(
      new Certifications(api, clock, story.policy).certify({
        id: uuidv7(clock.now()),
        projectId: p1,
        kind: 'CONTAINER',
        certNumber: '730421',
        primeId: coastline,
        firstTierSub: 'Rivera Trucking LLC',
        vehicleTypeId: (
          await api.vehicleType.findFirstOrThrow({ where: { name: 'Self-Loading Truck' } })
        ).id,
        boxes: [primaryBox(240, 90, 60)],
        certifiedById: sam,
        certifiedAt: clock.now(),
        deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, clock.now()),
      }),
    );
    await queue.settle(p1);
    // Every line that names an operating sub, by its ticket: whose work the ledger says it was.
    const subsOn = async (projectId: string): Promise<string[]> =>
      [
        ...new Set(
          (
            await api.transaction.findMany({
              where: { projectId, operatingSubId: { not: null } },
              include: { operatingSub: true, completedLoad: true },
            })
          ).map(
            (line) => `${line.completedLoad?.ticketNumber ?? ''} ${line.operatingSub?.name ?? ''}`,
          ),
        ),
      ].sort();
    const alike = async (projectId: string): Promise<string[]> =>
      (
        await api.flag.findMany({
          where: { projectId, code: 'SUB_NAME_ALIKE', clearedAt: null },
          include: { certification: true },
          orderBy: { message: 'asc' },
        })
      ).map((flag) => flag.message);
    story.check(
      'AC-01-21 (ADR-529 (f)) the worker flags both certifications on P1 that name either spelling, saying both names and never which is right; P2, which knows one spelling, has none',
      [await alike(p1), await alike(p2)],
      [
        [
          'Certification 730416: sub “Rivera Trucking” looks like “Rivera Trucking LLC” on this project.',
          'Certification 730421: sub “Rivera Trucking LLC” looks like “Rivera Trucking” on this project.',
        ],
        [],
      ],
    );
    story.check(
      'nothing is merged and no line moves: both records stand in service, and every Rivera line still names the spelling its certification names',
      [
        await api.contractor.count({
          where: { name: { in: ['Rivera Trucking', 'Rivera Trucking LLC'] }, archivedAt: null },
        }),
        await subsOn(p1),
        await subsOn(p2),
      ],
      [
        2,
        ['101002', '101004', '101006', '101020', '101021', '101029'].map(
          (ticket) => `${ticket} Rivera Trucking`,
        ),
        ['102001 Rivera Trucking', '102005 Rivera Trucking'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(on('15', '12:00'), 'What the audit log holds of the review');
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
    story.check(
      'AC-08-07, AC-08-24 no person wrote a completed record, a line, a flag, a run or a decision, and none set a field event’s status: every one was the system actor’s. Every change a person made to a field event came from the back office under their own name',
      [
        byPeople.length,
        statusChanges.every((record) => record.actorId === systemActorId),
        [
          ...new Set(
            (
              await api.auditRecord.findMany({
                where: { tableName: 'field_event', source: 'BACK_OFFICE' },
              })
            ).map((record) => names.get(record.actorId)),
          ),
        ],
      ],
      [0, true, ['Luis']],
    );
  },
};
