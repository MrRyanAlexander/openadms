// The fourteenth story (BACKLOG 1.9.1; ADR-368; spec/golden/MISSION.md, whole;
// spec/acceptance/07-pricing-ledger-audit.md AC-07-113; 08-review-and-corrections.md
// AC-08-63…65; 09-invoice-deliver-closeout.md AC-09-05, 11, 30, 31): the golden mission from
// setup to the locked batch, with the statuses, review queue, ledger and audit rows it must
// come out with. Every figure asserted here is the approved page's: a change to one needs the
// user's word.
//
// P1's Monday and Tuesday are the story `p1-field-days`' own, held on its phones until each
// phone's sync; P1's map, pay items, rules and certifications are the shared steps of
// `p1-office.ts`. P2 is set up through the setup services and worked on Monday by Ana Brooks and
// Kim Nguyen on a second phone each (one project per phone). Every reviewer's step goes through
// `apps/api`'s review services, as Luis Ortega by his grants, each followed by the run it asks
// the worker for.
//
// A certification's five photographs are written here as Sam Grant's phone would send them: no
// service takes them yet (the phone's certifying screen is Phase 3's, the file Phase 2's), and
// without them every certification stands flagged for its missing views.
//
// Not here: what each viewer sees (the database's own tests, AC-02-66, 78…82); the client
// package, which Dana zips by hand from the exports (Phase 4); 201002 and 201003, the flag
// catalogue's examples, which Sam's phone passes over.
import {
  Acceptances,
  Certifications,
  ContractorSetup,
  Corrections,
  FormSetup,
  InvoiceLocks,
  NumberAllocator,
  PayItemSetup,
  ProjectSetup,
  QcMarks,
  SiteSetup,
  Voids,
  type Outcome,
  type QcMarked,
  type Reviewed,
} from '@open-adms/api';
import { systemActorId, type FieldEventKind, type NumberSeries } from '@open-adms/db';
import { MapServers, Mileages, Reconciliation, type RunOutcome } from '@open-adms/worker';

import { createHash } from 'node:crypto';

import { projectTime, utcOffsetMinutes } from '../clock.ts';
import { chained, type Completed, made, scanned } from '../device.ts';
import { uuidv7 } from '../ids.ts';
import { localMapServers } from '../map-servers.ts';
import { phoneLists } from '../phone-lists.ts';
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

const of = (outcome: RunOutcome, ...ticketNumbers: string[]): string[] =>
  told(outcome).filter((line) => ticketNumbers.some((number) => line.startsWith(number)));

const dollars = (cents: number): string =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The five views of a certification's photographs (`adms-certifications`).
const views = ['OPERATOR_WITH_PLACARD', 'INTERIOR_OR_BACK', 'RIGHT', 'LEFT', 'FRONT'] as const;

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

// P1's ledger at the mission's end (golden mission §2, §4): nineteen lines.
const p1Ledger = [
  '101001 #1 VEG-HAUL-CY-15 52 × $7.50 = $390.00',
  '101002 #1 CD-HAUL-CY-15 36 × $8.25 = $297.00',
  '101002 #2 TIP-FEE-CY-BCL 36 × $4.00 = $144.00',
  '101003 #1 VEG-HAUL-CY-15 62.4 × $7.50 = $468.00',
  '101004 #1 VEG-HAUL-CY-15 24 × $7.50 = $180.00',
  '101005 #1 VEG-HAUL-CY-15 45.5 × $7.50 = $341.25',
  '101006 #1 VEG-HAUL-CY-15 28.8 × $7.50 = $216.00',
  '201001 #1 MULCH-HO-CY 99 × $5.10 = $504.90',
  '201001 #2 TIP-FEE-CY-BCL 99 × $4.00 = $396.00',
  '201004-A #1 MULCH-HO-TN 2.82 × $20.00 = $56.40',
  '201004-B #1 MULCH-HO-TN 7.06 × $20.00 = $141.20',
  '201004-C #1 MULCH-HO-TN 14.12 × $20.00 = $282.40',
  '301001 #1 HNG-RMV-EA 1 × $68.00 = $68.00',
  '301002 #1 LNR-RMV-EA-24 1 × $95.00 = $95.00',
  '301004 #1 STP-RMV-EA-36 1 × $110.00 = $110.00',
  '301004 #2 STP-FILL-CY 4.8 × $22.00 = $105.60',
  '301006 #1 WG-RMV-EA 6 × $40.00 = $240.00',
  '301006 #2 WG-FRN-EA 2 × $25.00 = $50.00',
  '301007 #1 CREW-TIME-HR 9.75 × $150.00 = $1462.50',
];
const p2Ledger = [
  '102001-A #1 VEG-HAUL-CY 14.4 × $9.00 = $129.60',
  '102001-B #1 VEG-HAUL-CY 21.6 × $9.00 = $194.40',
];

const p1Loads = ['101001', '101002', '101003', '101004', '101005', '101006'];
const p1HaulOuts = ['201001', '201004'];
const p1LiveUnitRate = ['301001', '301002', '301004', '301006', '301007'];
const p1Voided = ['301003', '301005'];
const batchName = 'Bayline ROW, week of 12 Oct';

export const goldenMission: Story = {
  name: 'golden-mission',
  title:
    'The golden mission, whole: two projects set up, two field days and a late sync, a flag accepted, a typed number renumbered, two tickets voided, a split load and a weighed split haul-out, QC, the lock and the batch; P1 $5,548.25 on 19 lines, P2 $324.00',
  timeZone,
  start: on('08', '08:00'),

  async run(story) {
    const { api, worker, clock } = story;
    const office = await p1FieldDaysHeld(story);
    const { held, dana, luis, sam, p1, coastline, samPhone } = office;
    const done = (completed: Completed) => {
      if (!completed.saved) throw new Error(`Not saved: ${completed.reason}`);
      return completed.event;
    };
    const person = async (name: string): Promise<string> =>
      (await api.user.findFirstOrThrow({ where: { name } })).id;
    const ana = await person('Ana Brooks');
    const kim = await person('Kim Nguyen');
    const tariq = await person('Tariq Patel');
    const names = new Map<string | null, string>([
      [dana, 'Dana'],
      [luis, 'Luis'],
      [sam, 'Sam'],
      [ana, 'Ana'],
      [kim, 'Kim'],
      [tariq, 'Tariq'],
      [await person('Jo Kim'), 'Jo'],
      [office.lee, 'Lee'],
      [systemActorId, 'system'],
    ]);

    // ------------------------------------------------------------------------------------------
    story.at(
      on('08', '08:40'),
      'Thursday: Dana Reyes loads P1’s map and enters its pay items and rules, and grants Luis Ortega correct, renumber, void, accept flags, QC and lock as invoiced',
    );
    await loadP1Map(story, office);
    await setUpP1Pricing(story, office);
    await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      for (const permission of [
        'CORRECT',
        'RENUMBER',
        'VOID',
        'ACCEPT_FLAG',
        'QC',
        'LOCK_INVOICED',
      ] as const) {
        await tx.userPermission.create({ data: { userId: luis, permission } });
      }
    });

    story.at(
      on('09', '09:00'),
      'Friday: Dana sets up P2, the PPDR project, under the same client and declaration event: Coastline its prime, its contract, a load form with Vegetative, an ROE form and a survey form, VEG-HAUL-CY at $9.00, Marsh Road TDSR entered again, and two phones',
    );
    const projects = new ProjectSetup(api, clock, story.policy);
    const contractors = new ContractorSetup(api, clock);
    const forms = new FormSetup(api, clock);
    const payItems = new PayItemSetup(api, clock, story.policy);
    const first = await api.project.findUniqueOrThrow({ where: { id: p1 } });
    const p2 = (
      await saved(
        projects.project(dana, {
          name: 'Bayline County PPDR, Hurricane Delphine',
          clientId: first.clientId,
          declarationEventId: first.declarationEventId,
          programTypeId: (await api.programType.findFirstOrThrow({ where: { name: 'PPDR' } })).id,
          timeZone,
          activeFrom: '2026-10-12',
          activeTo: '2027-01-31',
          ticketNumberSource: 'GENERATED',
          workflows: ['LOAD'],
          kindOfWorkIds: [],
          numbersFrom: { LOAD: 102001, CERTIFICATION: 730416 },
        }),
      )
    ).id;
    await saved(contractors.addPrime(dana, p2, coastline));
    await saved(
      contractors.contract(dana, {
        projectId: p2,
        name: 'Coastline, Bayline PPDR 2026',
        primeId: coastline,
      }),
    );
    const p2Load = (
      await saved(
        forms.form(dana, { projectId: p2, documentType: 'LOAD', name: 'Load', enabled: true }),
      )
    ).id;
    await saved(
      forms.form(dana, {
        projectId: p2,
        documentType: 'ROE',
        name: 'ROE',
        enabled: true,
        gpsRequired: false,
      }),
    );
    await saved(
      forms.form(dana, { projectId: p2, documentType: 'SURVEY', name: 'Survey', enabled: true }),
    );
    const p2Vegetative = (
      await saved(
        forms.debrisType(dana, {
          formId: p2Load,
          debrisTypeId: (await api.debrisType.findFirstOrThrow({ where: { name: 'Vegetative' } }))
            .id,
          reduced: false,
          hiddenOnPhones: false,
        }),
      )
    ).id;
    const p2Haul = (
      await saved(
        payItems.payItem(dana, {
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
      payItems.paysWhen(dana, p2Haul, [
        {
          formId: p2Load,
          slot: 1,
          criteria: [{ criterion: 'DEBRIS_TYPE', operator: 'EQUALS', picks: [p2Vegetative] }],
        },
      ]),
    );
    const p2Tdsr = (
      await saved(
        new SiteSetup(api, clock, story.policy).site(dana, {
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
    const p2Devices = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      const enrolled: Record<string, string> = {};
      for (const name of ['P2-COL-1', 'P2-TWR-TDSR']) {
        const phone = await tx.device.create({
          data: {
            name,
            publicKey: `story-key-${name.toLowerCase()}`,
            masterPasscodeVersion: 1,
            enrolledAt: clock.now(),
          },
        });
        enrolled[name] = phone.id;
      }
      return enrolled;
    });
    const p2Phone = (name: string): string => {
      const id = p2Devices[name];
      if (id === undefined) throw new Error(`No phone ${name}`);
      return id;
    };

    story.at(
      on('10', '09:10'),
      'Saturday: Sam Grant certifies P1’s three containers and two crews, then Rivera’s self-loader again on P2, its own 730416; five photographs of each',
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
    const certified = await api.certification.findMany({
      orderBy: [{ projectId: 'asc' }, { certNumber: 'asc' }],
    });
    await api.$write({ actorId: sam, source: 'DEVICE', deviceId: samPhone }, async (tx) => {
      for (const certification of certified) {
        for (const view of views) {
          const file = `P1-HO-TDSR/${certification.projectId}/${certification.certNumber}/${view}`;
          const fingerprint = createHash('sha256').update(file).digest('hex');
          await tx.photo.create({
            data: {
              id: uuidv7(certification.certifiedAt),
              projectId: certification.projectId,
              certificationId: certification.id,
              view,
              capturedAt: certification.certifiedAt,
              deviceUtcOffsetMinutes: certification.deviceUtcOffsetMinutes,
              receivedAt: clock.now(),
              originalSha256: fingerprint,
              uploadedSha256: fingerprint,
              objectKey: `photographs/${file}`,
              deviceId: samPhone,
            },
          });
        }
      }
    });
    const projectName = new Map([
      [p1, 'P1'],
      [p2, 'P2'],
    ]);
    story.check(
      'the certifications of the mission’s §1: on P1 the dump trailer 730415 at 65 CY, Rivera’s self-loader 730416 at 48 CY under Coastline, the bucket truck and skid steer crews 730417 and 730418 with no measurement, the walking floor 730419 at 110 CY; on P2 its own 730416 at 48 CY; five photographs each',
      await Promise.all(
        certified.map(async (certification) =>
          [
            projectName.get(certification.projectId),
            certification.certNumber,
            certification.kind,
            certification.capacityCy === null
              ? 'no capacity'
              : `${String(certification.capacityCy)} CY`,
            certification.firstTierSubId === null ? 'Coastline' : 'Coastline + Rivera',
            await api.photo.count({ where: { certificationId: certification.id } }),
          ].join(' · '),
        ),
      ),
      [
        'P1 · 730415 · CONTAINER · 65 CY · Coastline · 5',
        'P1 · 730416 · CONTAINER · 48 CY · Coastline + Rivera · 5',
        'P1 · 730417 · CREW · no capacity · Coastline · 5',
        'P1 · 730418 · CREW · no capacity · Coastline · 5',
        'P1 · 730419 · CONTAINER · 110 CY · Coastline · 5',
        'P2 · 730416 · CONTAINER · 48 CY · Coastline + Rivera · 5',
      ],
    );
    const rateOf = async (projectId: string): Promise<string[]> =>
      (
        await api.payItemRate.findMany({
          where: { payItem: { projectId }, primeId: coastline },
          include: { payItem: true },
        })
      )
        .map((rate) => `${rate.payItem.code} ${rate.payItem.unit} $${rate.rate.toFixed(2)}`)
        .sort();
    story.check(
      'the pay items of the mission’s §1, each with Coastline’s rate, and the rules that pay them: fifteen pay items and sixteen rules on P1, each rule naming "Coastline, Bayline ROW 2026"; one pay item and one rule on P2',
      [
        await rateOf(p1),
        await api.rule.count({ where: { projectId: p1, contractId: office.contract } }),
        await api.rule.count({ where: { projectId: p1 } }),
        await rateOf(p2),
        await api.rule.count({ where: { projectId: p2 } }),
      ],
      [
        [
          'CD-HAUL-CY-15 CY $8.25',
          'CREW-TIME-HR HR $150.00',
          'HNG-RMV-EA EA $68.00',
          'LNR-RMV-EA-24 EA $95.00',
          'LNR-RMV-EA-99 EA $185.00',
          'MULCH-HO-CY CY $5.10',
          'MULCH-HO-TN TN $20.00',
          'STP-FILL-CY CY $22.00',
          'STP-RMV-EA-36 EA $110.00',
          'STP-RMV-EA-48 EA $175.00',
          'TIP-FEE-CY-BCL CY $4.00',
          'VEG-HAUL-CY-15 CY $7.50',
          'VEG-HAUL-CY-30 CY $8.90',
          'WG-FRN-EA EA $25.00',
          'WG-RMV-EA EA $40.00',
        ],
        16,
        16,
        ['VEG-HAUL-CY CY $9.00'],
        1,
      ],
    );

    // ------------------------------------------------------------------------------------------
    const settings = { crewItemHoursLimit: story.policy.crewDayHours, longestRunMs: 600_000 };
    const reconciliation = new Reconciliation(
      worker,
      clock,
      settings,
      new Mileages(new MapServers(localMapServers())),
    );
    const corrections = new Corrections(api, clock, story.policy);
    const acceptances = new Acceptances(api, clock, story.policy);
    const voids = new Voids(api, clock, story.policy);
    const qc = new QcMarks(api, clock, story.policy);
    const locks = new InvoiceLocks(api, clock, story.policy);

    // The ledger of a project as it stands: every line with its ticket (and property or pile),
    // its #, its pay item, quantity × rate = amount.
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
          return {
            number,
            cents: Math.round(row.amount.toNumber() * 100),
            line: `${number}${suffix === '' ? '' : `-${suffix}`} #${String(row.slot)} ${row.payItem.code} ${row.quantity.toString()} × $${row.rate.toFixed(2)} = $${row.amount.toFixed(2)}`,
          };
        })
        .sort((left, right) => (left.line < right.line ? -1 : 1));
    };
    const ledger = async (projectId: string): Promise<string[]> =>
      (await lines(projectId)).map((each) => each.line);
    const total = async (projectId: string, ofTickets?: readonly string[]) => {
      const counted = (await lines(projectId)).filter(
        (each) => ofTickets === undefined || ofTickets.includes(each.number),
      );
      return [counted.length, dollars(counted.reduce((sum, each) => sum + each.cents, 0))];
    };
    // Every ticket of a project with its status, as its field events hold it.
    const statuses = async (projectId: string): Promise<string[]> =>
      [
        ...new Set(
          (await api.fieldEvent.findMany({ where: { projectId } })).map(
            (event) => `${event.ticketNumber} ${event.status}`,
          ),
        ),
      ].sort();
    // The review queue: every flag that stands and nobody has accepted, on a ticket or on a
    // record that is no ticket.
    const reviewQueue = async (projectId: string): Promise<string[]> =>
      (
        await api.flag.findMany({
          where: { projectId, clearedAt: null, acceptances: { none: {} } },
          orderBy: [{ ticketNumber: 'asc' }, { id: 'asc' }],
        })
      ).map((flag) => flag.message);
    // The tickets waiting for a field event, each with the flags of the one it has.
    const pending = async (projectId: string): Promise<string[]> => {
      const waiting = await api.fieldEvent.findMany({
        where: { projectId, status: 'PENDING' },
        orderBy: { ticketNumber: 'asc' },
      });
      const open = await api.flag.findMany({ where: { projectId, clearedAt: null } });
      return waiting.map((event) =>
        [
          `${event.ticketNumber} ${event.kind === 'COLLECTION' ? 'COL' : 'DIS'}`,
          ...open
            .filter((flag) => flag.ticketNumber === event.ticketNumber)
            .map((flag) => flag.message),
        ].join(' · '),
      );
    };
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
    const standingFlag = (ticketNumber: string) =>
      api.flag.findFirstOrThrow({
        where: { projectId: p1, ticketNumber, clearedAt: null },
        orderBy: { id: 'asc' },
      });
    const eventOf = (ticketNumber: string, kind: FieldEventKind, projectId = p1) =>
      api.fieldEvent.findFirstOrThrow({ where: { projectId, ticketNumber, kind } });
    const reasonId = async (name: string): Promise<string> =>
      (await api.reason.findFirstOrThrow({ where: { name } })).id;
    // What the audit log holds of a record: who, from where, what was done, with which note.
    const auditOf = async (tableName: string, recordId: string) =>
      (
        await api.auditRecord.findMany({
          where: { tableName, recordId },
          orderBy: { id: 'asc' },
        })
      ).map((record) => {
        const before = (record.priorValue ?? {}) as Record<string, unknown>;
        const after = (record.newValue ?? {}) as Record<string, unknown>;
        return [
          names.get(record.actorId) ?? record.actorId,
          record.source,
          record.operation,
          ...(record.operation === 'UPDATE'
            ? record.changedFields.map(
                (field) => `${field}: ${String(before[field])} → ${String(after[field])}`,
              )
            : []),
          ...(record.reason === null ? [] : [record.reason]),
        ].join(' · ');
      });
    // A reviewer's action, then the run it asks for.
    const last: { run: RunOutcome } = {
      run: { ran: false, reason: 'RUN_UNDER_WAY', message: 'No run yet.' },
    };
    const reviewed = async <T>(attempt: Promise<Outcome<Reviewed<T>>>): Promise<Reviewed<T>> => {
      const outcome = await saved(attempt);
      last.run = await reconciliation.run(outcome.reprocess);
      return outcome;
    };
    const loadOf = async (ticketNumber: string, projectId = p1) => ({
      completedLoadId: (
        await api.completedLoad.findFirstOrThrow({
          where: { projectId, ticketNumber, dissolvedAt: null },
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
    const sync = (projectId: string) => ({ projectId, trigger: 'SYNC' }) as const;

    // ------------------------------------------------------------------------------------------
    story.at(
      on('12', '06:35'),
      'Monday at the yard: Luis has written P2’s board too. Ana Brooks signs in on P2-COL-1, which takes a block of P2’s loads and of its ROE numbers, and Kim Nguyen on P2-TWR-TDSR: a second assignment and phone each, one project per phone',
    );
    const p2Board = await api.$write({ actorId: luis, source: 'BACK_OFFICE' }, async (tx) => {
      const assigned = async (phone: string, personId: string, more: object) =>
        (
          await tx.assignment.create({
            data: {
              workDate: new Date('2026-10-12'),
              projectId: p2,
              madeById: luis,
              personId,
              deviceId: p2Phone(phone),
              origin: 'PLANNED',
              ...more,
            },
          })
        ).id;
      return {
        ana: await assigned('P2-COL-1', ana, {
          fieldEventKinds: ['COLLECTION'],
          formDocumentTypes: ['ROE', 'SURVEY'],
        }),
        kim: await assigned('P2-TWR-TDSR', kim, { fieldEventKinds: ['DISPOSAL'], siteId: p2Tdsr }),
      };
    });
    const allocator = new NumberAllocator(api, clock, story.policy);
    for (const series of ['LOAD', 'ROE'] as const satisfies readonly NumberSeries[]) {
      await saved(
        allocator.topUp(
          { person: ana, deviceId: p2Phone('P2-COL-1') },
          { projectId: p2, series, lastUsedNumber: null },
        ),
      );
    }
    const anaP2 = story.phone({
      name: 'P2-COL-1',
      deviceId: p2Phone('P2-COL-1'),
      monitorId: ana,
      assignmentId: p2Board.ana,
      projectId: p2,
      setupVersion: 1,
      lists: await phoneLists(api, { assignmentId: p2Board.ana, deviceId: p2Phone('P2-COL-1') }),
      timeZone,
    });
    const kimP2 = story.phone({
      name: 'P2-TWR-TDSR',
      deviceId: p2Phone('P2-TWR-TDSR'),
      monitorId: kim,
      assignmentId: p2Board.kim,
      projectId: p2,
      siteId: p2Tdsr,
      setupVersion: 1,
      lists: await phoneLists(api, { assignmentId: p2Board.kim, deviceId: p2Phone('P2-TWR-TDSR') }),
      timeZone,
    });
    // R-0001…R-0006 are ROEs the mission doesn't tell: its two are R-0007 and R-0008.
    anaP2.passOver('ROE', 6);

    // P1's Monday is on its own phones meanwhile (the story `p1-field-days`): Ana is back on
    // P1-COL-1 for 101004 at 17:30, and Kim's P1 tower takes nothing between 12:05 and Tuesday.
    const vegetative = { debrisType: 'Vegetative' } as const;
    story.at(
      on('12', '13:05'),
      'P2, 412 Cedar Ct: Ana makes ROE R-0007 from the signed paper, photographs the form and records the pre-work survey',
    );
    const r0007 = anaP2.roe({
      parcelId: 'APN 14-0321-007',
      address: '412 Cedar Ct',
      ownerName: 'Rosa Delgado',
      signed: true,
      signedDate: '2026-10-09',
    });
    anaP2.photograph({ of: { kind: 'ROE', id: r0007.id } });
    const pre412 = anaP2.survey({ workType: 'Pre-work survey', roeNumber: r0007.roeNumber });
    story.at(
      on('12', '13:15'),
      'She scans Rivera’s self-loader, P2’s own 730416, and answers "split"',
    );
    const propertyA = anaP2.begin('LOAD', 'COLLECTION', '730416');
    story.at(
      on('12', '13:35'),
      '412 Cedar Ct is loaded: Vegetative, 12 CY by eye, ROE R-0007; her phone shows 102001',
    );
    done(
      anaP2.complete(propertyA, {
        number: made,
        splitSuffix: 'A',
        ...vegetative,
        estimateCy: 12,
        roeNumber: r0007.roeNumber,
        address: '412 Cedar Ct',
        addressSource: 'TYPED',
        endLatitude: '39.12000000',
        endLongitude: '-75.56000000',
      }),
    );
    story.at(on('12', '13:40'), 'The post-work survey of 412 Cedar Ct');
    const post412 = anaP2.survey({ workType: 'Post-work survey', roeNumber: r0007.roeNumber });
    story.at(
      on('12', '13:45'),
      '416 Cedar Ct: ROE R-0008, its photograph and its pre-work survey; split, the same badge',
    );
    const r0008 = anaP2.roe({
      parcelId: 'APN 14-0321-008',
      address: '416 Cedar Ct',
      ownerName: 'Ben Whitaker',
      signed: true,
      signedDate: '2026-10-09',
    });
    anaP2.photograph({ of: { kind: 'ROE', id: r0008.id } });
    const pre416 = anaP2.survey({ workType: 'Pre-work survey', roeNumber: r0008.roeNumber });
    const propertyB = anaP2.begin('LOAD', 'COLLECTION', '730416');
    story.at(on('12', '14:05'), '416 Cedar Ct is loaded: 18 CY by eye, ROE R-0008');
    done(
      anaP2.complete(propertyB, {
        number: chained(propertyA),
        splitSuffix: 'B',
        ...vegetative,
        estimateCy: 18,
        roeNumber: r0008.roeNumber,
        address: '416 Cedar Ct',
        addressSource: 'TYPED',
        endLatitude: '39.12020000',
        endLongitude: '-75.56030000',
      }),
    );
    story.at(on('12', '14:10'), 'The post-work survey of 416 Cedar Ct');
    const post416 = anaP2.survey({ workType: 'Post-work survey', roeNumber: r0008.roeNumber });
    story.at(on('12', '14:40'), 'Kim scans 730416 at P2’s Marsh Road TDSR tower');
    const tower = kimP2.begin('LOAD', 'DISPOSAL', '730416');
    story.at(on('12', '14:55'), 'Kim picks Vegetative, calls 75% and scans 102001');
    done(
      kimP2.complete(tower, {
        number: scanned('102001'),
        ...vegetative,
        loadCall: 75,
        endLatitude: '39.09030000',
        endLongitude: '-75.62020000',
      }),
    );
    story.check(
      'the ROEs took the next numbers of Ana’s block, and the split’s two properties one ticket number',
      [
        [r0007.roeNumber, r0008.roeNumber],
        anaP2.waiting.map((event) => `${event.ticketNumber}-${event.splitSuffix}`),
      ],
      [
        ['R-0007', 'R-0008'],
        ['102001-A', '102001-B'],
      ],
    );

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
    story.at(
      mondayEvening.toISOString(),
      'Monday evening at the yard: every phone finds signal and syncs; the worker runs on each project',
    );
    await phones.arrive(mondayEvening);
    await phones.crewPhotographs(mondayEvening);
    const p2Sent = [await anaP2.sync(story.intake), await kimP2.sync(story.intake)];
    const monday = await reconciliation.run(sync(p1));
    const mondayP2 = await reconciliation.run(sync(p2));
    story.check(
      'AC-06-87 Monday night on P1: 101001 and 101002 are COMPLETED, 101003 is in review for its 96% call and still bills, the preload 101004 waits for its disposal with no flag, and the three unit rate tickets are COMPLETED, the duplicate hanger among them: 7 lines, $1,530.00',
      [told(monday), await total(p1)],
      [
        [
          '101001 · COMPLETED',
          '101002 · COMPLETED',
          '101003 · MANUAL_REVIEW · Ticket 101003: load call 96%. Flagged for review.',
          '101004 · PENDING',
          '301001 · COMPLETED',
          '301002 · COMPLETED',
          '301003 · COMPLETED',
        ],
        [7, '$1,530.00'],
      ],
    );
    const first101001 = await api.completedLoad.findFirstOrThrow({
      where: { projectId: p1, ticketNumber: '101001' },
      include: { collections: { include: { collectionEvent: { include: { zone: true } } } } },
    });
    story.check(
      'AC-03-33, AC-06-53 101001 (golden mission §2): the collection and the disposal pair; 65 CY × 80% = 52.0 CY; the zone and the mileage, 6.2 mi by road, are attached by the worker; no flag',
      [
        [first101001.capacityCy, first101001.loadCall, first101001.volumeCy?.toString()],
        first101001.collections.map((row) => [
          row.collectionEvent.zone?.name,
          row.mileage?.toFixed(1),
          row.mileageSource,
        ]),
        await flagsOn('101001'),
      ],
      [[65, 80, '52'], [['Zone 2', '6.2', 'ROAD_ROUTE']], []],
    );
    const split = await api.completedLoad.findFirstOrThrow({
      where: { projectId: p2, ticketNumber: '102001' },
      include: { collections: { orderBy: { splitSuffix: 'asc' } } },
    });
    story.check(
      'AC-04-47, AC-07-68 P2, the split load 102001 (golden mission §3): the two collections and the disposal are grouped on the one number; 48 CY × 75% = 36.0 CY, shared by estimate, 12 ÷ 30 → 14.4 CY and 18 ÷ 30 → 21.6 CY; the rules run per property; COMPLETED, $324.00 on two lines, no flag on the ticket, an ROE or a survey',
      [
        p2Sent,
        told(mondayP2),
        [split.capacityCy, split.loadCall, split.volumeCy?.toString()],
        split.collections.map((row) => `${row.splitSuffix} ${row.volumeCy?.toString() ?? ''} CY`),
        await ledger(p2),
        await total(p2),
        await reviewQueue(p2),
      ],
      [
        [10, 1],
        ['102001 · COMPLETED'],
        [48, 75, '36'],
        ['A 14.4 CY', 'B 21.6 CY'],
        p2Ledger,
        [2, '$324.00'],
        [],
      ],
    );
    const surveyed = await api.survey.findMany({
      where: { projectId: p2 },
      orderBy: { madeAt: 'asc' },
      include: { workType: true, roe: true },
    });
    story.check(
      'each ROE is a record with its parcel, owner, signed date and a photograph of the signed form, and each survey points at its ROE: a pre-work and a post-work survey for each, linked by the ROE’s number',
      [
        (
          await api.roe.findMany({
            where: { projectId: p2 },
            orderBy: { roeNumber: 'asc' },
            include: { photos: true },
          })
        ).map((roe) =>
          [
            roe.roeNumber,
            roe.address,
            roe.parcelId,
            roe.ownerName,
            roe.signedDate?.toISOString().slice(0, 10),
            names.get(roe.madeById),
            `${String(roe.photos.length)} photograph`,
          ].join(' · '),
        ),
        surveyed.map((survey) => `${survey.workType.name} · ${survey.roe?.roeNumber ?? 'no ROE'}`),
      ],
      [
        [
          'R-0007 · 412 Cedar Ct · APN 14-0321-007 · Rosa Delgado · 2026-10-09 · Ana · 1 photograph',
          'R-0008 · 416 Cedar Ct · APN 14-0321-008 · Ben Whitaker · 2026-10-09 · Ana · 1 photograph',
        ],
        [
          'Pre-work survey · R-0007',
          'Post-work survey · R-0007',
          'Pre-work survey · R-0008',
          'Post-work survey · R-0008',
        ],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      tuesdayEvening.toISOString(),
      'Tuesday evening: the phones sync, all but the Marsh Road tower’s, whose battery is flat; the worker runs',
    );
    await phones.arrive(tuesdayEvening);
    await phones.crewPhotographs(tuesdayEvening);
    const tuesday = await reconciliation.run(sync(p1));
    story.check(
      'AC-05-52, AC-06-103, AC-06-154 Tuesday night: the collections 101004, 101005 and 101006 wait alone, PENDING and not flagged (an unpartnered field event never expires); the haul-out 201001 and the split haul-out 201004 are COMPLETED; the under-size stump 301005 is in review with no pay item; 17 lines, $4,879.00',
      [told(tuesday), await total(p1)],
      [
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
        [17, '$4,879.00'],
      ],
    );
    const haulOut = await api.completedHaulOut.findFirstOrThrow({
      where: { projectId: p1, ticketNumber: '201004' },
      include: { collections: { orderBy: { splitSuffix: 'asc' } } },
    });
    story.check(
      'AC-04-52, AC-04-53 the split haul-out 201004 (golden mission §2): Sam’s three haul-out collections at 15:30, 15:45 and 16:05, each Mulch with its pile’s field tag and the load call so far, and Lee’s one disposal with scale receipt CCL-51207; one completed haul-out with three piles; the last call, 85%, is the haul-out’s; the scale’s 24.00 tons shared by what each pile added, 10, 25 and 50 of 85: 2.82, 7.06 and 14.12 tons, adding up to the 24.00 weighed; each pile’s CY kept and not billed; one line per pile, $480.00',
      [
        (
          await api.fieldEvent.findMany({
            where: { projectId: p1, ticketNumber: '201004' },
            orderBy: { endedAt: 'asc' },
            include: { fieldTag: true, site: true, scaleReceipt: true },
          })
        ).map((event) =>
          [
            `${event.kind === 'HAUL_OUT_COLLECTION' ? 'HOC' : 'HOD'} 201004${event.splitSuffix === '' ? '' : `-${event.splitSuffix}`}`,
            names.get(event.monitorId),
            projectTime(timeZone, event.endedAt),
            event.site?.name,
            ...(event.kind === 'HAUL_OUT_COLLECTION'
              ? [event.fieldTag?.name, `${String(event.loadCall)}% so far`]
              : [
                  `no call: ${String(event.loadCall)}`,
                  `receipt ${event.scaleReceipt?.receiptNumber ?? ''}`,
                  `${String(event.scaleReceipt?.grossWeightLb)} − ${String(event.scaleReceipt?.tareWeightLb)} = ${String(event.scaleReceipt?.netWeightLb)} lb`,
                ]),
          ].join(' · '),
        ),
        [haulOut.capacityCy, haulOut.loadCall, haulOut.weightTons?.toString()],
        haulOut.collections.map(
          (pile) =>
            `${pile.splitSuffix} · added ${String(pile.pileLoadCall)} · ${pile.weightTons?.toString() ?? ''} tons · ${pile.volumeCy?.toString() ?? ''} CY`,
        ),
        await total(p1, ['201004']),
      ],
      [
        [
          'HOC 201004-A · Sam · Tue 13 Oct 15:30 · Marsh Road TDSR · Zone 1 pile · 10% so far',
          'HOC 201004-B · Sam · Tue 13 Oct 15:45 · Marsh Road TDSR · Zone 2 pile · 35% so far',
          'HOC 201004-C · Sam · Tue 13 Oct 16:05 · Marsh Road TDSR · Zone 3 pile · 85% so far',
          'HOD 201004 · Lee · Tue 13 Oct 17:15 · Cypress Creek Landfill · no call: null · receipt CCL-51207 · 79600 − 31600 = 48000 lb',
        ],
        [110, 85, '24'],
        [
          'A · added 10 · 2.82 tons · 11 CY',
          'B · added 25 · 7.06 tons · 27.5 CY',
          'C · added 50 · 14.12 tons · 55 CY',
        ],
        [3, '$480.00'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      wednesdayMorning.toISOString(),
      'Wednesday: the Marsh Road tower’s phone is charged and syncs Tuesday’s three disposals and the drop-off log',
    );
    const fromTheTower = await phones.arrive(wednesdayMorning);
    story.at(on('14', '07:20'), 'The worker runs');
    const wednesday = await reconciliation.run(sync(p1));
    story.check(
      'AC-02-56, AC-05-02, AC-06-16, AC-06-125 everything on the tower’s phone is received, three disposals and the drop-off log; the late sync pairs the preload 101004 (not flagged: its time is Monday, its collection’s end) and 101005; 101006 still waits, its disposal typed as 101060 and flagged for the typed number: 19 lines, $5,400.25',
      [
        fromTheTower,
        await api.dropOffLog.count({ where: { projectId: p1 } }),
        await flagsOn('101004'),
        of(wednesday, '10100', '101060'),
        await total(p1),
      ],
      [
        4,
        1,
        [],
        [
          '101001 · COMPLETED',
          '101002 · COMPLETED',
          '101003 · MANUAL_REVIEW · Ticket 101003: load call 96%. Flagged for review.',
          '101004 · COMPLETED',
          '101005 · COMPLETED',
          '101006 · PENDING',
          '101060 · PENDING · Ticket 101060: typed ticket number (Barcode damaged). Flagged for review.',
        ],
        [19, '$5,400.25'],
      ],
    );
    story.check(
      'AC-04-12, AC-08-01, AC-08-02 the review queue on Wednesday before any review holds three kinds of thing: the flagged tickets, each with its plain message (101003; 301005, for its size and its missing survey); the pending tickets, the collection 101006 with no flag and the disposal typed 101060 with its typed-number flag; and the quarantined records, of which there are none. Nothing is flagged on a certification, a site or a survey, and the duplicate hanger 301003 is COMPLETED and not in it: Luis finds it at QC',
      [
        await reviewQueue(p1),
        await pending(p1),
        await api.quarantinedRecord.count(),
        (await statuses(p1)).filter((line) => line.startsWith('301003')),
      ],
      [
        [
          'Ticket 101003: load call 96%. Flagged for review.',
          'Ticket 101060: typed ticket number (Barcode damaged). Flagged for review.',
          'Ticket 301005: not an eligible stump (20 in, under 24 in). Flagged for review.',
          'Ticket 301005: no survey. Flagged for review.',
        ],
        [
          '101006 COL',
          '101060 DIS · Ticket 101060: typed ticket number (Barcode damaged). Flagged for review.',
        ],
        0,
        ['301003 COMPLETED'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '08:00'),
      'Luis checks 101003’s tower photographs and accepts its flag: Photos confirm, "Heaped; photos confirm"; the worker runs',
    );
    const flag101003 = await standingFlag('101003');
    const accepted = await reviewed(
      acceptances.flag(
        luis,
        flag101003.id,
        await reasonId('Photos confirm'),
        'Heaped; photos confirm',
      ),
    );
    story.check(
      'AC-08-43 101003: MANUAL_REVIEW → COMPLETED, its flag accepted and kept, its line as it was: 62.4 × $7.50 = $468.00',
      [of(last.run, '101003'), await flagsOn('101003'), await total(p1, ['101003'])],
      [
        ['101003 · COMPLETED · Ticket 101003: load call 96%. Flagged for review.'],
        ['Ticket 101003: load call 96%. Flagged for review. (accepted: Photos confirm)'],
        [1, '$468.00'],
      ],
    );

    story.at(
      on('14', '08:15'),
      'Luis matches cert, times and photos and renumbers Kim’s disposal from 101060 to 101006: real work is renumbered, never voided; the worker runs',
    );
    const dis101060 = await eventOf('101060', 'DISPOSAL');
    await reviewed(corrections.renumber(luis, dis101060.id, { ticketNumber: '101006' }));
    const renumbered = of(last.run, '101006', '101060');
    story.at(
      on('14', '08:20'),
      'He accepts the typed-number flag: Photos confirm; the worker runs',
    );
    await reviewed(
      acceptances.flag(
        luis,
        (await standingFlag('101006')).id,
        await reasonId('Photos confirm'),
        'Cert, times and photos match 101006',
      ),
    );
    story.check(
      'AC-06-10, AC-08-22, AC-08-50 101006: the renumber pairs it, 48 CY × 60% = 28.8 CY, $216.00, in review for its typed number until Luis accepts that flag; nothing is left under 101060',
      [
        renumbered,
        of(last.run, '101006', '101060'),
        await total(p1, ['101006']),
        await api.fieldEvent.count({ where: { projectId: p1, ticketNumber: '101060' } }),
      ],
      [
        [
          '101006 · MANUAL_REVIEW · Ticket 101006: typed ticket number (Barcode damaged). Flagged for review.',
        ],
        [
          '101006 · COMPLETED · Ticket 101006: typed ticket number (Barcode damaged). Flagged for review.',
        ],
        [1, '$216.00'],
        0,
      ],
    );

    story.at(
      on('14', '08:40'),
      'At QC Luis sees 301003 is the same tree as 301001, the same photographs: he voids it, Duplicate ticket, "Duplicate of 301001"; the worker runs',
    );
    const urt301003 = await eventOf('301003', 'UNIT_RATE');
    const lineOf301003 = await api.transaction.findFirstOrThrow({
      where: { fieldEventId: urt301003.id },
    });
    const void301003 = await reviewed(
      voids.ticket(
        luis,
        p1,
        { workflow: 'UNIT_RATE', ticketNumber: '301003' },
        await reasonId('Duplicate ticket'),
        'Duplicate of 301001',
      ),
    );
    const after301003 = of(last.run, '301003');
    story.at(
      on('14', '08:50'),
      'The stump 301005 is 20 in across: he voids it, Not eligible work, "Under 24 in; goes out as vegetative debris"; the worker runs',
    );
    await reviewed(
      voids.ticket(
        luis,
        p1,
        { workflow: 'UNIT_RATE', ticketNumber: '301005' },
        await reasonId('Not eligible work'),
        'Under 24 in; goes out as vegetative debris',
      ),
    );
    story.check(
      'AC-07-95, AC-08-31, AC-08-32 the two voids: 301003, COMPLETED → VOID, its $68.00 line removed; 301005, MANUAL_REVIEW → VOID, which never had a pay item or a line; a void ticket has no open flag',
      [after301003, of(last.run, '301005'), await total(p1, p1Voided), await flagsOn('301005')],
      [
        ['301003 · VOID'],
        ['301005 · VOID'],
        [0, '$0.00'],
        [
          'Ticket 301005: not an eligible stump (20 in, under 24 in). Flagged for review. (cleared)',
          'Ticket 301005: no survey. Flagged for review. (cleared)',
        ],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(on('14', '09:00'), 'The mission’s review is done');
    story.check(
      'AC-08-64 the thirteen live tickets are COMPLETED and 301003 and 301005 are VOID; no flag is open, no ticket is pending and nothing is quarantined on P1',
      [
        await statuses(p1),
        await reviewQueue(p1),
        await api.fieldEvent.count({ where: { projectId: p1, status: 'PENDING' } }),
        await api.quarantinedRecord.count({ where: { projectId: p1 } }),
      ],
      [
        [
          ...[...p1Loads, ...p1HaulOuts, ...p1LiveUnitRate].map((number) => `${number} COMPLETED`),
          ...p1Voided.map((number) => `${number} VOID`),
        ].sort(),
        [],
        0,
        0,
      ],
    );
    story.check(
      'AC-07-113, AC-08-64 P1’s ledger at the mission’s end, line for line: $5,548.25 on 19 lines, $5,068.25 on 16 before the split haul-out plus 201004’s $480.00 on three; 301003 and 301005 bill nothing',
      [
        await ledger(p1),
        await total(p1),
        await total(p1, [...p1Loads, '201001', ...p1LiveUnitRate]),
        await total(p1, ['201004']),
        await total(p1, p1Voided),
      ],
      [p1Ledger, [19, '$5,548.25'], [16, '$5,068.25'], [3, '$480.00'], [0, '$0.00']],
    );
    const everyLine = await api.transaction.findMany({
      include: { prime: true, operatingSub: true, completedLoad: true },
    });
    story.check(
      'AC-03-15, AC-07-114 no monitor picked a contractor: the certification each badge found says whose work it is. All twenty-one lines of the mission record prime Coastline; the lines of Rivera’s truck 730416, 101002’s two, 101004’s, 101006’s and both of P2’s 102001, record Rivera as the operating sub, and no other line names a sub',
      [
        [...new Set(everyLine.map((each) => each.prime.name))],
        everyLine.length,
        everyLine
          .filter((each) => each.operatingSub !== null)
          .map(
            (each) =>
              `${each.completedLoad?.ticketNumber ?? ''} #${String(each.slot)} ${each.operatingSub?.name ?? ''}`,
          )
          .sort(),
      ],
      [
        ['Coastline Haulers LLC'],
        21,
        [
          '101002 #1 Rivera Trucking',
          '101002 #2 Rivera Trucking',
          '101004 #1 Rivera Trucking',
          '101006 #1 Rivera Trucking',
          '102001 #1 Rivera Trucking',
          '102001 #1 Rivera Trucking',
        ],
      ],
    );
    story.check(
      'AC-07-113 P2’s ledger: $324.00 on two lines',
      [await ledger(p2), await total(p2), await statuses(p2)],
      [p2Ledger, [2, '$324.00'], ['102001 COMPLETED']],
    );

    // ------------------------------------------------------------------------------------------
    const removal = await api.auditRecord.findMany({
      where: { tableName: 'transaction', operation: 'DELETE' },
      orderBy: { id: 'asc' },
    });
    const removedRow = (removal[0]?.priorValue ?? {}) as Record<string, unknown>;
    const voidedStatus = await auditOf('field_event', urt301003.id);
    const typedAs = (
      await api.auditRecord.findFirstOrThrow({
        where: { tableName: 'field_event', recordId: dis101060.id, operation: 'INSERT' },
      })
    ).newValue as Record<string, unknown>;
    story.check(
      'AC-07-111, AC-08-65 the audit log (golden mission §4): Kim’s disposal created on her phone under the typed 101060, with the reason Barcode damaged; Luis’s renumber 101060 → 101006; his acceptance on 101003 with his words; his void of 301003 with his words, and 301003’s status COMPLETED → VOID written by the worker in the run his void asked for',
      [
        (await auditOf('field_event', dis101060.id)).filter((row) => !row.startsWith('system')),
        [
          typedAs['ticket_number'],
          typedAs['number_typed'],
          typedAs['number_typed_reason_id'] === (await reasonId('Barcode damaged')),
        ],
        await auditOf('flag_acceptance', accepted.record.id),
        await auditOf('ticket_void', void301003.record.id),
        voidedStatus
          .filter((row) => row.includes('→ VOID'))
          .map((row) =>
            row
              .split(' · ')
              .filter((part) => !part.startsWith('reconciled_at'))
              .join(' · '),
          ),
      ],
      [
        ['Kim · DEVICE · INSERT', 'Luis · BACK_OFFICE · UPDATE · ticket_number: 101060 → 101006'],
        ['101060', true, true],
        ['Luis · BACK_OFFICE · INSERT · Heaped; photos confirm'],
        ['Luis · BACK_OFFICE · INSERT · Duplicate of 301001'],
        ['system · SYSTEM · UPDATE · status: COMPLETED → VOID'],
      ],
    );
    story.check(
      'AC-07-111, AC-08-65 the one line the mission removes is 301003’s HNG-RMV-EA $68.00: gone from the ledger, and the whole row copied to the audit log first, under the system',
      [
        removal.map((record) => [names.get(record.actorId), record.source]),
        removedRow['id'] === lineOf301003.id,
        [removedRow['field_event_id'] === urt301003.id, Number(removedRow['amount'])],
        Object.keys(removedRow).length === Object.keys(lineOf301003).length,
        await api.transaction.count({ where: { id: lineOf301003.id } }),
      ],
      [[['system', 'SYSTEM']], true, [true, 68], true, 0],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '10:00'),
      'QC: Luis sets QC Approved on each completed load and haul-out, the live unit rate tickets, the forms and the certifications, and QC Void, by hand, on the two voided tickets',
    );
    const incident = await api.incident.findFirstOrThrow({ where: { projectId: p1 } });
    const dropOff = await api.dropOffLog.findFirstOrThrow({ where: { projectId: p1 } });
    const approve: [string, QcMarked][] = [];
    for (const number of p1Loads) approve.push([`CLT ${number}`, await loadOf(number)]);
    for (const number of p1HaulOuts) approve.push([`CHO ${number}`, await haulOutOf(number)]);
    const l102001 = await loadOf('102001', p2);
    approve.push(['CLT 102001', l102001]);
    for (const number of p1LiveUnitRate) approve.push([`URT ${number}`, await unitRateOf(number)]);
    approve.push(['incident', { incidentId: incident.id }]);
    approve.push(['drop-off log', { dropOffLogId: dropOff.id }]);
    for (const roe of [r0007, r0008]) approve.push([`ROE ${roe.roeNumber}`, { roeId: roe.id }]);
    for (const survey of [pre412, post412, pre416, post416]) {
      approve.push(['survey', { surveyId: survey.id }]);
    }
    for (const certification of certified) {
      approve.push([
        `certification ${projectName.get(certification.projectId) ?? ''} ${certification.certNumber}`,
        { certificationId: certification.id },
      ]);
    }
    const workerWrote = async (): Promise<number[]> => [
      await api.reconciliationRun.count(),
      await api.auditRecord.count({ where: { actorId: systemActorId } }),
    ];
    const beforeQc = await workerWrote();
    const marked: string[] = [];
    for (const [what, target] of approve) {
      const mark = await saved(qc.set(luis, target, 'QC_APPROVED'));
      marked.push(`${what} ${mark.status} ${names.get(mark.setById) ?? ''}`);
    }
    for (const number of p1Voided) {
      const mark = await saved(qc.set(luis, await unitRateOf(number), 'QC_VOID'));
      marked.push(`URT ${number} ${mark.status} ${names.get(mark.setById) ?? ''}`);
    }
    story.check(
      'AC-08-63 QC Approved stands on completed loads 101001…101006, completed haul-outs 201001 and 201004, P2’s 102001, the five live unit rate tickets, the incident, the drop-off log, ROEs R-0007 and R-0008 with their four surveys, and the six certifications; 301003 and 301005 are QC Void; each mark is Luis’s, set by hand: the worker ran nothing and wrote nothing',
      [marked, [await workerWrote(), beforeQc]],
      [
        [
          ...p1Loads.map((number) => `CLT ${number} QC_APPROVED Luis`),
          ...p1HaulOuts.map((number) => `CHO ${number} QC_APPROVED Luis`),
          'CLT 102001 QC_APPROVED Luis',
          ...p1LiveUnitRate.map((number) => `URT ${number} QC_APPROVED Luis`),
          'incident QC_APPROVED Luis',
          'drop-off log QC_APPROVED Luis',
          'ROE R-0007 QC_APPROVED Luis',
          'ROE R-0008 QC_APPROVED Luis',
          ...Array.from({ length: 4 }, () => 'survey QC_APPROVED Luis'),
          ...['730415', '730416', '730417', '730418', '730419'].map(
            (number) => `certification P1 ${number} QC_APPROVED Luis`,
          ),
          'certification P2 730416 QC_APPROVED Luis',
          ...p1Voided.map((number) => `URT ${number} QC_VOID Luis`),
        ],
        [beforeQc, beforeQc],
      ],
    );
    story.check(
      'a QC mark is never on a single field event of a load or a haul-out, and never on one pile: 30 marks, none on a collection, a disposal or a haul-out’s field event',
      [
        await api.qcMark.count(),
        await api.qcMark.count({
          where: { fieldEventId: { not: null }, NOT: { fieldEventKind: 'UNIT_RATE' } },
        }),
        await api.qcMark.count({ where: { fieldEventKind: 'UNIT_RATE' } }),
      ],
      [30, 0, 7],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '11:00'),
      `The invoice lock: Luis makes the batch "${batchName}" and locks P1’s thirteen QC Approved tickets in it; he locks P2’s split load 102001 on its own`,
    );
    const batch = await saved(locks.batch(luis, p1, batchName));
    for (const number of p1Loads) await saved(locks.lock(luis, await loadOf(number), batch.id));
    for (const number of p1HaulOuts)
      await saved(locks.lock(luis, await haulOutOf(number), batch.id));
    for (const number of p1LiveUnitRate) {
      await saved(locks.lock(luis, await unitRateOf(number), batch.id));
    }
    const lockedIn = (
      await api.invoiceLock.findMany({
        where: { projectId: p1, unlockedAt: null, invoiceBatch: { name: batchName } },
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
    const voidLock = await locks.lock(luis, await unitRateOf('301003'), batch.id);
    story.check(
      'AC-09-11 read by its name, the batch holds P1’s thirteen QC Approved tickets, and their lines in the ledger come to $5,548.25 on 19 lines, a figure read from the ledger and stored nowhere on the batch; the voided 301003 and 301005, at QC Void, are not in it and can’t be locked',
      [
        lockedIn,
        await total(p1, lockedIn),
        Object.keys(batch).filter((key) => /amount|rate|quantity|total/i.test(key)),
        voidLock.saved ? 'saved' : voidLock.refusal.code,
        await api.invoiceLock.count({ where: { projectId: p1 } }),
      ],
      [
        [...p1Loads, ...p1HaulOuts, ...p1LiveUnitRate].sort(),
        [19, '$5,548.25'],
        [],
        'NOT_COMPLETED',
        13,
      ],
    );
    const lock102001 = await saved(locks.lock(luis, l102001));
    const onOneProperty = await locks.lock(luis, {
      unitRateTicketId: (await eventOf('102001', 'COLLECTION', p2)).id,
    });
    story.check(
      'AC-09-05 P2’s split load is locked as one: the lock names the completed load 102001, with both properties under it, and no single collection takes a lock',
      [
        lock102001.completedLoadId === l102001.completedLoadId,
        lock102001.invoiceBatchId,
        await api.completedLoadCollection.count({
          where: { completedLoadId: l102001.completedLoadId, dissolvedAt: null },
        }),
        await api.invoiceLock.count({ where: { projectId: p2 } }),
        onOneProperty.saved ? 'saved' : onOneProperty.refusal.code,
      ],
      [true, null, 2, 1, 'NOT_QCD_ALONE'],
    );

    story.at(
      on('21', '09:00'),
      'A week later Dana changes Coastline’s rate on VEG-HAUL-CY-15 from $7.50 to $7.75; the worker runs',
    );
    const rateTo = async (rate: string) => {
      const veg15 = await api.payItem.findFirstOrThrow({
        where: { projectId: p1, code: 'VEG-HAUL-CY-15' },
      });
      return saved(payItems.rate(dana, veg15.id, coastline, rate));
    };
    await rateTo('7.75');
    const rated = await reconciliation.run({ projectId: p1, trigger: 'SETUP_CHANGE' });
    const passedBy = (
      await api.reconciliationDecision.findMany({
        where: { reconciliationRunId: rated.ran ? rated.runId : '' },
        orderBy: { ticketNumber: 'asc' },
      })
    ).map(
      (decision) => `${decision.ticketNumber}: ${(decision.summary as { why?: string }).why ?? ''}`,
    );
    story.check(
      'AC-09-31 every ticket of P1 that bills is locked as invoiced: the rate change regenerates none of them, each is left exactly as it is, and P1’s ledger stays $5,548.25 on 19 lines, line for line; no line was removed but 301003’s',
      [
        passedBy,
        await ledger(p1),
        await total(p1),
        await api.auditRecord.count({ where: { tableName: 'transaction', operation: 'DELETE' } }),
      ],
      [
        [...p1Loads, ...p1HaulOuts, ...p1LiveUnitRate].map(
          (number) => `${number}: Locked as invoiced: left as it is.`,
        ),
        p1Ledger,
        [19, '$5,548.25'],
        1,
      ],
    );
    story.at(on('21', '09:10'), 'The change was a slip: she puts $7.50 back; the worker runs');
    await rateTo('7.50');
    await reconciliation.run({ projectId: p1, trigger: 'SETUP_CHANGE' });

    // ------------------------------------------------------------------------------------------
    story.at('2027-03-02T09:00:00-05:00', '2 March 2027: the work is done. Dana closes P1 and P2');
    await saved(projects.close(dana, p1));
    await saved(projects.close(dana, p2));
    story.at(
      '2029-05-14T10:00:00-04:00',
      '14 May 2029: an auditor asks what stands behind $297.00 on ticket 101002',
    );
    const line = await api.transaction.findFirstOrThrow({
      where: { projectId: p1, slot: 1, completedLoad: { ticketNumber: '101002' } },
      include: {
        rule: true,
        payItem: true,
        contract: true,
        prime: true,
        operatingSub: true,
        completedLoad: { include: { disposalEvent: { include: { site: true } } } },
        completedLoadCollection: { include: { collectionEvent: true } },
      },
    });
    const curb = line.completedLoadCollection?.collectionEvent;
    const dumped = line.completedLoad?.disposalEvent;
    const truck = await api.certification.findUniqueOrThrow({
      where: { id: curb?.certificationId ?? '' },
    });
    const firstAudit = async (tableName: string, recordId: string | undefined) =>
      (await auditOf(tableName, recordId ?? ''))[0];
    story.check(
      'AC-09-30 years after closeout the line walks back whole: to its rule, pay item and contract; to its completed load, 48 CY × 75% = 36 CY, 11.4 mi; to the collection and disposal events with their monitors, times and GPS; to certification 730416, Rivera’s truck under Coastline, and its five photographs; and to the audit record of each',
      [
        [
          `#${String(line.slot)} ${line.payItem.code} ${line.quantity.toString()} × $${line.rate.toFixed(2)} = $${line.amount.toFixed(2)}`,
          line.rule.name,
          line.contract.name,
          `${line.prime.name} + ${line.operatingSub?.name ?? ''}`,
        ],
        [
          line.completedLoad?.ticketNumber,
          line.completedLoad?.capacityCy,
          line.completedLoad?.loadCall,
          line.completedLoad?.volumeCy?.toString(),
          line.completedLoadCollection?.mileage?.toFixed(1),
          line.completedLoadCollection?.mileageSource,
        ],
        [
          curb?.kind,
          names.get(curb?.monitorId ?? null),
          curb?.endedAt.toISOString(),
          curb?.endLatitude?.toString(),
          curb?.endLongitude?.toString(),
          curb?.certNumber,
        ],
        [
          dumped?.kind,
          names.get(dumped?.monitorId ?? null),
          dumped?.endedAt.toISOString(),
          dumped?.site?.name,
          dumped?.certNumber,
        ],
        [
          truck.certNumber,
          truck.capacityCy,
          names.get(truck.certifiedById),
          await api.photo.count({ where: { certificationId: truck.id } }),
        ],
        [
          await firstAudit('transaction', line.id),
          await firstAudit('completed_load', line.completedLoadId ?? undefined),
          await firstAudit('field_event', curb?.id),
          await firstAudit('field_event', dumped?.id),
          await firstAudit('certification', truck.id),
        ],
        (await api.project.findUniqueOrThrow({ where: { id: p1 } })).closedAt?.toISOString(),
      ],
      [
        [
          '#1 CD-HAUL-CY-15 36 × $8.25 = $297.00',
          'CD-HAUL-CY-15 - ROW C&D haul 0–15 mi',
          'Coastline, Bayline ROW 2026',
          'Coastline Haulers LLC + Rivera Trucking',
        ],
        ['101002', 48, 75, '36', '11.4', 'ROAD_ROUTE'],
        [
          'COLLECTION',
          'Ana',
          new Date(on('12', '10:10')).toISOString(),
          '39.15',
          '-75.52',
          '730416',
        ],
        [
          'DISPOSAL',
          'Tariq',
          new Date(on('12', '10:50')).toISOString(),
          'Bayline County Landfill',
          '730416',
        ],
        ['730416', 48, 'Sam', 5],
        [
          'system · SYSTEM · INSERT',
          'system · SYSTEM · INSERT',
          'Ana · DEVICE · INSERT',
          'Tariq · DEVICE · INSERT',
          'Sam · DEVICE · INSERT',
        ],
        '2027-03-02T14:00:00.000Z',
      ],
    );

    const byPeople = await api.auditRecord.count({
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
      'every step wrote its audit record under its own actor: the monitors’ records from their phones, Luis’s review, QC and locks from the back office, and every completed record, line, flag, run and decision under the system alone; nothing was deleted but the one regenerated line',
      [
        await who('field_event', 'roe', 'survey', 'incident', 'drop_off_log', 'scale_receipt'),
        await who('flag_acceptance', 'ticket_void', 'qc_mark', 'invoice_batch', 'invoice_lock'),
        byPeople,
        [
          ...new Set(
            (await api.auditRecord.findMany({ where: { operation: 'DELETE' } })).map(
              (record) => record.tableName,
            ),
          ),
        ],
      ],
      [
        [
          'Ana · DEVICE',
          'Jo · DEVICE',
          'Kim · DEVICE',
          'Lee · DEVICE',
          'Luis · BACK_OFFICE',
          'Sam · DEVICE',
          'Tariq · DEVICE',
          'system · SYSTEM',
        ],
        ['Luis · BACK_OFFICE'],
        0,
        ['transaction'],
      ],
    );
  },
};
