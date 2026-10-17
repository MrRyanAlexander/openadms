// The fifteenth story (BACKLOG 1.9.2; ADR-369): what the golden mission leaves out, on P1's own
// two field days (spec/acceptance: AC-06-05, 36, 39, 40, 78…80, 90; AC-07-51, 54, 63, 67, 74;
// AC-03-42, 47, 48; AC-04-55; AC-09-24, 25; and the worker's half of AC-06-03, 34, 47, 70, 122).
//
// The mission is one clean-enough mission; these are the cases it can't hold. P1's Monday and
// Tuesday reach the server newest first and end as they do in field order. Then, each as its
// own short story with the worker's run after it: the split haul-out paid by the CY; a pile
// whose call isn't higher; a truck whose certification is made after its load; a certification
// revoked and one replaced; a truck and trailer weighed once; a load paid from the ticket it
// carries; a prime with a rule and no rate; a site that charges a fee no rule gives; a rate to
// be negotiated, then agreed; a new map version and a site's own shape; and a load collected
// after the project's window, which is then extended.
//
// Not here: a project numbered from control tickets (P1 generates its numbers; its flag is
// proven at the domain, AC-06-164). Every setup change is made through its service (a rate, a
// pay item's unit, a project's window, a site's shape: BACKLOG 2.4.1, ADR-423), and the setup
// check and the sites' quantity lookup are asked of the API's own service as the setup moves
// (AC-01-69…77).
import {
  Certifications,
  ContractorSetup,
  FormSetup,
  ListSetup,
  PayItemSetup,
  ProjectSetup,
  RuleSetup,
  SetupStanding,
  SiteSetup,
  WorkQueue,
  type NewCertification,
  type Outcome,
} from '@open-adms/api';
import { correctFieldEventEndpoint, revokeCertificationEndpoint } from '@open-adms/contracts';
import { MapServers, Mileages, Reconciliation, type RunOutcome } from '@open-adms/worker';

import { utcOffsetMinutes } from '../clock.ts';
import type { PhoneRecord } from '../device.ts';
import { uuidv7 } from '../ids.ts';
import { localMapServers } from '../map-servers.ts';
import type { Story } from '../runner.ts';
import {
  certifyP1,
  loadP1Map,
  p1BackOffice,
  p1FieldDaysHeld,
  P1Syncs,
  primaryBox,
  QueueRuns,
  saved,
  setUpP1Pricing,
} from './p1-office.ts';
import { assigned, sentAlone } from './board.ts';
import { p1TimeZone as timeZone } from './p1.ts';
import { p1Boundary } from './setup.ts';

const on = (date: string, time: string): string => `2026-10-${date}T${time}:00-04:00`;

// What a run did with each ticket, as lines a person reads. A flag raised on each of a ticket's
// field events (a badge both monitors scanned, a site each pile was dumped at) reads once.
const told = (outcome: RunOutcome): string[] =>
  outcome.tickets.map((ticket) =>
    [
      ticket.ticketNumber,
      ticket.status,
      ...(ticket.error === null ? [] : [`error: ${ticket.error}`]),
      ...new Set(ticket.flags),
    ].join(' · '),
  );

const of = (outcome: RunOutcome, ...ticketNumbers: string[]): string[] =>
  told(outcome).filter((line) => ticketNumbers.some((number) => line.startsWith(number)));

const dollars = (cents: number): string =>
  `$${Math.trunc(cents / 100).toLocaleString('en-US')}.${String(cents % 100).padStart(2, '0')}`;

const rectangle = (west: number, south: number, east: number, north: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ],
});

export const p1LeftOut: Story = {
  name: 'p1-left-out',
  title:
    'What the golden mission leaves out: any arrival order; a split haul-out paid by the CY; a pile whose call isn’t higher; a certification made later, revoked, replaced; a truck and trailer weighed once; a load that carries a ticket; setup fixed and the flag cleared',
  timeZone,
  start: on('08', '08:00'),

  async run(story) {
    const { api, worker, clock } = story;
    const office = await p1FieldDaysHeld(story);
    const { held, dana, luis, sam, lee, p1, coastline, tdsr, cypress, samPhone } = office;

    // ------------------------------------------------------------------------------------------
    story.at(on('08', '08:40'), 'Thursday: Dana loads P1’s map and enters its pay items and rules');
    await loadP1Map(story, office);
    const pricing = await setUpP1Pricing(story, office);
    const payItems = new PayItemSetup(api, clock, story.policy);
    const rules = new RuleSetup(api, clock, story.policy);
    const sites = new SiteSetup(api, clock, story.policy);
    const forms = new FormSetup(api, clock, story.policy);
    const lists = new ListSetup(api, clock, story.policy);
    const projects = new ProjectSetup(api, clock, story.policy);
    const certifications = new Certifications(api, clock, story.policy);

    // The setup check and the sites' lookup, asked of the API's service, as lines a person
    // reads.
    const setupStanding = new SetupStanding(api);
    const gaps = async (): Promise<string[]> =>
      (await setupStanding.gaps(p1)).map((gap) => gap.message);
    const phonesAsk = async (...sitesAsked: string[]): Promise<string[]> => {
      const nameOf = new Map<string, string>();
      for (const each of await api.disposalSite.findMany({ where: { projectId: p1 } })) {
        nameOf.set(each.id, each.name);
      }
      for (const each of await api.contractor.findMany()) nameOf.set(each.id, each.name);
      for (const each of await api.formDebrisType.findMany({
        where: { form: { projectId: p1 } },
        include: { debrisType: true },
      })) {
        nameOf.set(each.id, each.debrisType.name);
      }
      const said = (id: string): string => nameOf.get(id) ?? id;
      return (await setupStanding.quantityLookup(p1))
        .map(
          (row) =>
            `${said(row.siteId)} · ${row.form} · ${said(row.debrisTypeId)} · ${said(row.primeId)} → ${row.asks}`,
        )
        .filter(
          (line) => sitesAsked.length === 0 || sitesAsked.some((name) => line.startsWith(name)),
        );
    };
    story.check(
      'AC-01-69, 74 the setup check lists nothing on P1 as set up, and each site’s phones ask for one quantity, worked out from the rules: the load call for a load, tipping fee or not; nothing more for a haul-out paid by the CY; the scale weight where the only rule that could pay it is by the ton',
      [await gaps(), await phonesAsk()],
      [
        [],
        [
          'Bayline County Landfill · LOAD · Vegetative · Coastline Haulers LLC → LOAD_CALL',
          'Bayline County Landfill · LOAD · C&D · Coastline Haulers LLC → LOAD_CALL',
          'Bayline County Landfill · HAUL_OUT · Mulch · Coastline Haulers LLC → NOTHING_MORE',
          'Cypress Creek Landfill · LOAD · Vegetative · Coastline Haulers LLC → LOAD_CALL',
          'Cypress Creek Landfill · LOAD · C&D · Coastline Haulers LLC → LOAD_CALL',
          'Cypress Creek Landfill · HAUL_OUT · Mulch · Coastline Haulers LLC → SCALE_WEIGHT',
          'Marsh Road TDSR · LOAD · Vegetative · Coastline Haulers LLC → LOAD_CALL',
          'Marsh Road TDSR · LOAD · C&D · Coastline Haulers LLC → LOAD_CALL',
          'Marsh Road TDSR · HAUL_OUT · Mulch · Coastline Haulers LLC → NOTHING_MORE',
        ],
      ],
    );

    story.at(
      on('09', '09:00'),
      'Friday: Summit Debris Services joins P1 as a second prime, with its own contract, "Summit, Bayline ROW 2026"',
    );
    const contractors = new ContractorSetup(api, clock, story.policy);
    const summit = (
      await saved(contractors.contractor(dana, { name: 'Summit Debris Services', kind: 'HAULER' }))
    ).id;
    await saved(contractors.addPrime(dana, p1, summit));
    const summitContract = (
      await saved(
        contractors.contract(dana, {
          projectId: p1,
          name: 'Summit, Bayline ROW 2026',
          primeId: summit,
        }),
      )
    ).id;

    story.at(
      on('10', '09:10'),
      'Saturday: Sam Grant certifies P1’s three containers and two crews, Summit’s truck on the pre-printed sheet 88120 (28 CY), and Coastline’s tandem: its truck body 730421 (30 CY) and its trailer 730422 (40 CY)',
    );
    const certify = await certifyP1(story, office);
    const dumpTrailer = (
      await api.vehicleType.findFirstOrThrow({ where: { name: 'Hydraulic Dump Trailer' } })
    ).id;
    await certify('11:20', {
      certNumber: '88120',
      primeId: summit,
      vehicleTypeId: dumpTrailer,
      boxes: [primaryBox(240, 90, 60)],
    });
    await certify('11:50', {
      certNumber: '730421',
      vehicleTypeId: dumpTrailer,
      boxes: [primaryBox(240, 90, 65)],
    });
    await certify('12:10', {
      certNumber: '730422',
      vehicleTypeId: dumpTrailer,
      boxes: [primaryBox(240, 96, 81)],
    });
    const capacityOf = async (certNumber: string): Promise<number | null> =>
      (await api.certification.findFirstOrThrow({ where: { projectId: p1, certNumber } }))
        .capacityCy;
    story.check(
      'the three certifications work out to 28, 30 and 40 CY',
      [await capacityOf('88120'), await capacityOf('730421'), await capacityOf('730422')],
      [28, 30, 40],
    );

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
    // The worker's own job loop: it takes up what each sync, review and setup change queued.
    const queue = new QueueRuns(story, reconciliation);

    // The ledger as it stands: every line with its ticket (and property or pile), its #, its
    // pay item, quantity × rate = amount.
    const lines = async () => {
      const rows = await api.transaction.findMany({
        where: { projectId: p1 },
        include: {
          payItem: true,
          prime: true,
          completedLoad: true,
          completedHaulOut: true,
          completedHaulOutCollection: true,
          fieldEvent: true,
        },
      });
      return rows
        .map((row) => {
          const suffix = row.completedHaulOutCollection?.splitSuffix ?? '';
          const number =
            row.completedLoad?.ticketNumber ??
            row.completedHaulOut?.ticketNumber ??
            row.fieldEvent?.ticketNumber ??
            '';
          return {
            id: row.id,
            ticket: number,
            cents: Number(row.amount.toFixed(2).replace('.', '')),
            prime: row.prime.name,
            line: `${number}${suffix === '' ? '' : `-${suffix}`} #${String(row.slot)} ${row.payItem.code} ${row.quantity.toString()} × $${row.rate.toFixed(2)} = $${row.amount.toFixed(2)}`,
          };
        })
        .sort((left, right) => (left.line < right.line ? -1 : 1));
    };
    const ledger = async (): Promise<string[]> => (await lines()).map((each) => each.line);
    const linesOf = async (ticketNumber: string): Promise<string[]> =>
      (await lines()).filter((each) => each.ticket === ticketNumber).map((each) => each.line);
    const totalOf = async (...ticketNumbers: string[]): Promise<[number, string]> => {
      const all = (await lines()).filter(
        (each) => ticketNumbers.length === 0 || ticketNumbers.includes(each.ticket),
      );
      return [all.length, dollars(all.reduce((sum, each) => sum + each.cents, 0))];
    };
    // A ticket's flags over its life, each with what happened to it.
    const flagsOn = async (ticketNumber: string): Promise<string[]> =>
      (
        await api.flag.findMany({
          where: { projectId: p1, ticketNumber },
          orderBy: { id: 'asc' },
        })
      )
        .map((flag) => `${flag.message}${flag.clearedAt === null ? '' : ' (cleared)'}`)
        .filter((message, at, all) => all.indexOf(message) === at);
    const openFlags = async (): Promise<string[]> =>
      (
        await api.flag.findMany({
          where: { projectId: p1, clearedAt: null, ticketNumber: { not: null } },
          orderBy: [{ ticketNumber: 'asc' }, { id: 'asc' }],
        })
      )
        .map((flag) => flag.message)
        .filter((message, at, all) => all.indexOf(message) === at);

    // ------------------------------------------------------------------------------------------
    const phones = new P1Syncs(story, office);
    const wednesdayMorning = phones.times.at(-1);
    if (wednesdayMorning === undefined) throw new Error('The field days never synced.');
    story.at(
      wednesdayMorning.toISOString(),
      'Wednesday: no phone found signal on Monday or Tuesday evening. All of them sync now, and the records reach the server newest first: Tuesday’s ahead of Monday’s, a disposal ahead of its collection',
    );
    const newestFirst = [...held].sort((left, right) => {
      const fieldTime = (each: (typeof held)[number]): number =>
        each.sent.record === 'FIELD_EVENT' ? each.sent.fieldEvent.endedAt.getTime() : Infinity;
      return fieldTime(right) - fieldTime(left);
    });
    const arrived: string[] = [];
    for (const { sent } of newestFirst) {
      const answer = await sentAlone(story, timeZone, sent);
      if (answer.answer !== 'SAVED') throw new Error(`Not saved: ${answer.answer}`);
      if (sent.record === 'FIELD_EVENT') arrived.push(sent.fieldEvent.ticketNumber);
    }
    for (const time of phones.times) await phones.photosArrive(time);
    story.check(
      'every record is saved; the first field event to arrive is Tuesday’s last, the last Monday’s first',
      [arrived.length, arrived.at(0), arrived.at(-1)],
      [25, '201004', '101001'],
    );
    story.at(on('14', '07:20'), 'The worker runs on P1');
    const first = await queue.settled(p1);
    story.check(
      'AC-06-05 every ticket ends with the status and flags it has when the phones sync in field order (the story `p1-priced` on Wednesday morning): arrival order carries no information',
      told(first),
      [
        '101001 · COMPLETED',
        '101002 · COMPLETED',
        '101003 · MANUAL_REVIEW · Ticket 101003: load call 96%. Flagged for review.',
        '101004 · COMPLETED',
        '101005 · COMPLETED',
        '101006 · PENDING',
        '101060 · PENDING · Ticket 101060: typed ticket number (Barcode damaged). Flagged for review.',
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
      'AC-06-05 and with the same quantities: the ledger is the one field order gives, 19 lines, $5,400.25',
      [await ledger(), await totalOf()],
      [
        [
          '101001 #1 VEG-HAUL-CY-15 52 × $7.50 = $390.00',
          '101002 #1 CD-HAUL-CY-15 36 × $8.25 = $297.00',
          '101002 #2 TIP-FEE-CY-BCL 36 × $4.00 = $144.00',
          '101003 #1 VEG-HAUL-CY-15 62.4 × $7.50 = $468.00',
          '101004 #1 VEG-HAUL-CY-15 24 × $7.50 = $180.00',
          '101005 #1 VEG-HAUL-CY-15 45.5 × $7.50 = $341.25',
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
        [19, '$5,400.25'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    // The story `p1-field-days` ends on Tuesday, so each later record is made as the phone that
    // recorded a Monday or Tuesday one would have sent it, at its own day's times.
    const heldEvent = (ticketNumber: string, kind: string, splitSuffix = '') => {
      const found = held.find(
        ({ sent }) =>
          sent.record === 'FIELD_EVENT' &&
          sent.fieldEvent.ticketNumber === ticketNumber &&
          sent.fieldEvent.kind === kind &&
          sent.fieldEvent.splitSuffix === splitSuffix,
      )?.sent;
      if (found?.record !== 'FIELD_EVENT') throw new Error(`No ${kind} on ${ticketNumber}`);
      return found.fieldEvent;
    };
    type Sent = ReturnType<typeof heldEvent>;
    const made = (like: Sent, from: string, to: string, more: Partial<Sent>): Sent => {
      const startedAt = new Date(from);
      const endedAt = new Date(to);
      return {
        ...like,
        id: uuidv7(startedAt),
        startedAt,
        endedAt,
        deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, endedAt),
        ...more,
      };
    };
    const send = async (fieldEvent: Sent): Promise<void> => {
      const record: PhoneRecord = { record: 'FIELD_EVENT', fieldEvent };
      const answer = await sentAlone(story, timeZone, record);
      if (answer.answer !== 'SAVED') throw new Error(`Not saved: ${answer.answer}`);
    };
    const fromHeronSt = { address: null, addressSource: null };
    const atTheLandfill = heldEvent('201001', 'HAUL_OUT_DISPOSAL');
    // A haul-out loaded pile by pile at Marsh Road TDSR on the walking floor 730419, each pile
    // with the call so far, and dumped at Bayline County Landfill, which has no scale.
    const splitHaulOut = async (
      date: string,
      ticketNumber: string,
      piles: readonly (readonly [suffix: string, from: string, to: string, call: number])[],
      dumped: readonly [from: string, to: string],
    ): Promise<void> => {
      for (const [suffix, from, to, loadCall] of piles) {
        await send(
          made(heldEvent('201004', 'HAUL_OUT_COLLECTION', suffix), on(date, from), on(date, to), {
            ticketNumber,
            loadCall,
          }),
        );
      }
      await send(made(atTheLandfill, on(date, dumped[0]), on(date, dumped[1]), { ticketNumber }));
    };

    story.at(
      on('14', '12:00'),
      'Wednesday’s work syncs. Haul-out 201005: the walking floor 730419 loaded from three piles at Marsh Road TDSR, called 10%, 35% and 85% so far, as 201004 was, and dumped at Bayline County Landfill, which has no scale. Haul-out 201006: two piles, called 35% and then 30%. Load 101015: a truck with badge 730499, which nobody has certified, from Heron St to Marsh Road TDSR, called 50%. Load 101044: Summit’s 88120, the same trip, called 50%',
    );
    await splitHaulOut(
      '14',
      '201005',
      [
        ['A', '08:00', '08:10', 10],
        ['B', '08:10', '08:20', 35],
        ['C', '08:20', '08:30', 85],
      ],
      ['09:10', '09:20'],
    );
    await splitHaulOut(
      '14',
      '201006',
      [
        ['A', '10:00', '10:10', 35],
        ['B', '10:10', '10:20', 30],
      ],
      ['11:00', '11:10'],
    );
    const collected = heldEvent('101001', 'COLLECTION');
    const dumped = heldEvent('101001', 'DISPOSAL');
    const load = async (
      date: string,
      ticketNumber: string,
      certNumber: string,
      times: readonly [string, string, string, string],
      collection: Partial<Sent> = {},
      disposal: Partial<Sent> = {},
    ): Promise<void> => {
      await send(
        made(collected, on(date, times[0]), on(date, times[1]), {
          ...fromHeronSt,
          ticketNumber,
          certNumber,
          ...collection,
        }),
      );
      await send(
        made(dumped, on(date, times[2]), on(date, times[3]), {
          ticketNumber,
          certNumber,
          loadCall: 50,
          ...disposal,
        }),
      );
    };
    await load('14', '101015', '730499', ['08:30', '08:50', '09:20', '09:30']);
    await load('14', '101044', '88120', ['09:30', '09:50', '10:20', '10:30']);
    story.at(on('14', '12:10'), 'The worker runs');
    const noon = await queue.settled(p1);

    story.check(
      'AC-07-67, AC-06-78 the same three piles, dumped at Bayline County Landfill instead, are paid by the CY with the tipping fee: 11.0, 27.5 and 55.0 CY, six lines, $850.85',
      [of(noon, '201005'), await linesOf('201005'), await totalOf('201005')],
      [
        ['201005 · COMPLETED'],
        [
          '201005-A #1 MULCH-HO-CY 11 × $5.10 = $56.10',
          '201005-A #2 TIP-FEE-CY-BCL 11 × $4.00 = $44.00',
          '201005-B #1 MULCH-HO-CY 27.5 × $5.10 = $140.25',
          '201005-B #2 TIP-FEE-CY-BCL 27.5 × $4.00 = $110.00',
          '201005-C #1 MULCH-HO-CY 55 × $5.10 = $280.50',
          '201005-C #2 TIP-FEE-CY-BCL 55 × $4.00 = $220.00',
        ],
        [6, '$850.85'],
      ],
    );
    const pilesOf = async (ticketNumber: string) =>
      (
        await api.completedHaulOutCollection.findMany({
          where: { completedHaulOut: { projectId: p1, ticketNumber } },
          orderBy: { splitSuffix: 'asc' },
        })
      ).map((pile) => [pile.splitSuffix, pile.pileLoadCall, pile.volumeCy?.toFixed(1) ?? null]);
    story.check(
      'AC-04-55, AC-06-90, AC-07-74 both piles of 201006 are taken as called; the ticket is flagged, no pile is shared out and nothing is billed until it is corrected',
      [of(noon, '201006'), await pilesOf('201006'), await linesOf('201006')],
      [
        [
          "201006 · MANUAL_REVIEW · Ticket 201006: pile -B's load call 30% is not higher than pile -A's 35%. Flagged for review; not billed.",
        ],
        [
          ['A', 0, null],
          ['B', 0, null],
        ],
        [],
      ],
    );
    story.check(
      'AC-06-35 101015 scanned a badge no certification on P1 has: it is received, flagged and bills nothing. Summit’s 101044 has no line either: no rule names a Summit contract yet',
      [of(noon, '101015', '101044'), await linesOf('101015'), await linesOf('101044')],
      [
        [
          '101015 · MANUAL_REVIEW · Ticket 101015: no certification 730499 on this project. Flagged for review; not billed.',
          '101044 · MANUAL_REVIEW · Ticket 101044: no pricing rule on a Summit Debris Services contract matches. Flagged for review; not billed.',
        ],
        [],
        [],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '12:30'),
      'Dana gives Luis the grant to correct. Sam Grant says the second pile was 60% so far, not 30: Luis corrects pile -B’s call at his browser, which queues its job; the worker runs',
    );
    const backOffice = p1BackOffice(story, office);
    await backOffice.grantLuis('CORRECT', 'VIEW_REVIEW');
    const pileB = await api.fieldEvent.findFirstOrThrow({
      where: { projectId: p1, ticketNumber: '201006', splitSuffix: 'B' },
    });
    await (
      await backOffice.luiss()
    ).answered(correctFieldEventEndpoint, {
      ids: { fieldEventId: pileB.id },
      json: { changes: { loadCall: 60 }, note: 'Sam Grant: 60% so far' },
    });
    const corrected = await queue.settled(p1);
    story.check(
      'AC-06-90 corrected, the flag is cleared and the piles are shared out: 35 and 25 points of 110 CY, 38.5 and 27.5 CY, each paid by the CY with the tipping fee, $600.60',
      [
        of(corrected, '201006'),
        await flagsOn('201006'),
        await pilesOf('201006'),
        await linesOf('201006'),
        await totalOf('201006'),
      ],
      [
        ['201006 · COMPLETED'],
        [
          "Ticket 201006: pile -B's load call 30% is not higher than pile -A's 35%. Flagged for review; not billed. (cleared)",
        ],
        [
          ['A', 35, '38.5'],
          ['B', 25, '27.5'],
        ],
        [
          '201006-A #1 MULCH-HO-CY 38.5 × $5.10 = $196.35',
          '201006-A #2 TIP-FEE-CY-BCL 38.5 × $4.00 = $154.00',
          '201006-B #1 MULCH-HO-CY 27.5 × $5.10 = $140.25',
          '201006-B #2 TIP-FEE-CY-BCL 27.5 × $4.00 = $110.00',
        ],
        [4, '$600.60'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '13:00'),
      'Sam Grant certifies the truck that hauled 101015: badge 730499, Coastline’s, 28 CY. The worker runs',
    );
    const certifyingOn = (date: string): Promise<string> =>
      assigned(api, clock, luis, {
        workDate: `2026-10-${date}`,
        projectId: p1,
        personId: sam,
        certifying: true,
        deviceId: samPhone,
      });
    const wednesdayCertifying = await certifyingOn('14');
    const certifyNow = (
      assignmentId: string,
      more: Partial<NewCertification> & Pick<NewCertification, 'certNumber' | 'boxes'>,
    ) =>
      saved(
        certifications.certify({
          projectId: p1,
          kind: 'CONTAINER',
          primeId: coastline,
          certifiedById: sam,
          deviceId: samPhone,
          assignmentId,
          helperIds: [lee],
          ...more,
          id: uuidv7(clock.now()),
          certifiedAt: clock.now(),
          deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, clock.now()),
        }),
      );
    const late = await certifyNow(wednesdayCertifying, {
      certNumber: '730499',
      vehicleTypeId: dumpTrailer,
      boxes: [primaryBox(240, 90, 60)],
    });
    // Certifying queued the job itself: the tickets that scanned the number before it existed.
    const lateJobs = (await queue.waiting(p1)).filter((job) => job.tickets.includes('101015'));
    const certified = await queue.next(p1);
    story.check(
      'AC-06-36, AC-03-42 certifying 730499 queued 101015, which had scanned the number before it existed, as a job a sync brought and no person asked for; the flag clears and 101015 bills at that certification’s capacity, 28 CY × 50% = 14.0 CY: it was unbilled only until one existed. Its field events, which found no certification when they arrived, are linked to it now (BACKLOG C83)',
      [
        lateJobs.slice(-1).map((job) => [job.trigger, job.requestedById]),
        of(certified, '101015'),
        await flagsOn('101015'),
        await linesOf('101015'),
        (await api.fieldEvent.findMany({ where: { projectId: p1, ticketNumber: '101015' } })).map(
          (event) => event.certificationId === late.id,
        ),
      ],
      [
        [['SYNC', null]],
        ['101015 · COMPLETED'],
        [
          'Ticket 101015: no certification 730499 on this project. Flagged for review; not billed. (cleared)',
        ],
        ['101015 #1 VEG-HAUL-CY-15 14 × $7.50 = $105.00'],
        [true, true],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '13:30'),
      'Dana writes Summit’s hauling rule in the rule builder, on "Summit, Bayline ROW 2026": Debris type EQUALS Vegetative, Mileage AT MOST 15 → Add transaction 1, VEG-HAUL-CY-15. She hasn’t entered Summit’s rate on it. The worker runs',
    );
    const veg15 = pricing.payItems['VEG-HAUL-CY-15'] ?? '';
    await saved(
      rules.save(dana, {
        projectId: p1,
        formId: pricing.forms.load,
        name: 'Summit VEG haul 0–15 mi',
        contractId: summitContract,
        active: true,
        criteria: [
          { criterion: 'DEBRIS_TYPE', operator: 'EQUALS', picks: [pricing.vegetative] },
          { criterion: 'MILEAGE', operator: 'AT_MOST', numberFrom: 15 },
        ],
        actions: [{ kind: 'ADD_TRANSACTION', slot: 1, payItemId: veg15 }],
      }),
    );
    const noRateListed = await gaps();
    const noRate = await queue.settled(p1);
    story.check(
      'AC-06-122 a rule passes and its pay item has no rate for Summit: the line is written at $0 and the ticket is flagged; no Coastline line changed',
      [of(noRate, '101044'), await linesOf('101044'), await totalOf('101001')],
      [
        [
          '101044 · MANUAL_REVIEW · Ticket 101044: pay item VEG-HAUL-CY-15 has no rate for Summit Debris Services. Flagged for review.',
        ],
        ['101044 #1 VEG-HAUL-CY-15 14 × $0.00 = $0.00'],
        [1, '$390.00'],
      ],
    );
    story.at(on('14', '13:40'), 'Dana enters Summit’s rate, $7.80; the worker runs');
    await saved(payItems.rate(dana, veg15, summit, '7.80'));
    story.check(
      'AC-01-72 the setup check listed the pay item and the prime before any ticket was worked, and lists neither once the rate is in',
      [noRateListed, await gaps()],
      [
        [
          'Pay item VEG-HAUL-CY-15 has no rate for Summit Debris Services, and "Summit VEG haul 0–15 mi" adds it on a Summit Debris Services contract.',
        ],
        [],
      ],
    );
    const rated = await queue.settled(p1);
    story.check(
      'the setup is fixed and the flag is cleared: 101044 bills 14.0 × $7.80 = $109.20 to Summit, and both flags stay in its history',
      [
        of(rated, '101044'),
        (await lines())
          .filter((each) => each.ticket === '101044')
          .map((each) => `${each.line} · ${each.prime}`),
        await flagsOn('101044'),
      ],
      [
        ['101044 · COMPLETED'],
        ['101044 #1 VEG-HAUL-CY-15 14 × $7.80 = $109.20 · Summit Debris Services'],
        [
          'Ticket 101044: no pricing rule on a Summit Debris Services contract matches. Flagged for review; not billed. (cleared)',
          'Ticket 101044: pay item VEG-HAUL-CY-15 has no rate for Summit Debris Services. Flagged for review. (cleared)',
        ],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '14:00'),
      'Dana ticks Charges a tipping fee on Cypress Creek Landfill by mistake: it charges none, and no rule gives its loads a fee. The worker runs',
    );
    await saved(sites.change(dana, cypress, { chargesTippingFee: true }));
    const feeListed = await gaps();
    const feeMissing = await queue.settled(p1);
    story.check(
      'AC-06-70 the haul-out dumped there is flagged, and its three lines bill as before; a haul-out that only left a site, a load dumped elsewhere and unit rate work are not flagged for it',
      [told(feeMissing).filter((line) => line.includes('tipping fee')), await totalOf('201004')],
      [
        [
          '201004 · MANUAL_REVIEW · Ticket 201004: dumped at Cypress Creek Landfill, which charges a tipping fee, but no rule on this project gives it one. Flagged for review.',
        ],
        [3, '$480.00'],
      ],
    );
    story.at(on('14', '14:10'), 'She unticks it; the worker runs');
    await saved(sites.change(dana, cypress, { chargesTippingFee: false }));
    story.check(
      'AC-01-70 the setup check listed the site while it was ticked, and no longer does',
      [feeListed, await gaps()],
      [
        [
          'Cypress Creek Landfill charges a tipping fee, but no tipping fee pay item is linked to it.',
        ],
        [],
      ],
    );
    const feeFixed = await queue.settled(p1);
    story.check(
      'the setup is fixed and the flag is cleared: 201004 is COMPLETED again, its lines the same',
      [of(feeFixed, '201004'), await flagsOn('201004'), await totalOf('201004')],
      [
        ['201004 · COMPLETED'],
        [
          'Ticket 201004: dumped at Cypress Creek Landfill, which charges a tipping fee, but no rule on this project gives it one. Flagged for review. (cleared)',
        ],
        [3, '$480.00'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '14:30'),
      'The contract has a line for hangers over a road, its price still to be negotiated. Dana enters HNG-SPECIAL-TBN, unit TBN, and a unit rate rule that adds it as transaction 2 to every hanger ticket. The worker runs',
    );
    const hangers = await api.payItem.findUniqueOrThrow({
      where: { id: pricing.payItems['HNG-RMV-EA'] ?? '' },
    });
    const special = await saved(
      payItems.payItem(dana, {
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
        projectId: p1,
        code: 'HNG-SPECIAL-TBN',
        description: 'Hanger over a road, special handling',
        payableTypeId: hangers.payableTypeId,
        unit: 'TBN',
        rates: [],
      }),
    );
    await saved(
      rules.save(dana, {
        projectId: p1,
        formId: pricing.forms.unitRate,
        name: 'HNG-SPECIAL-TBN - Hanger over a road',
        contractId: office.contract,
        active: true,
        criteria: [{ criterion: 'PAY_ITEM', operator: 'EQUALS', picks: [hangers.id] }],
        actions: [{ kind: 'ADD_TRANSACTION', slot: 2, payItemId: special.id }],
      }),
    );
    const toBeNegotiated = await queue.settled(p1);
    story.check(
      'AC-07-63 that line bills nothing and each hanger ticket is flagged; its other line bills',
      [of(toBeNegotiated, '301001', '301003'), await linesOf('301001')],
      [
        [
          '301001 · MANUAL_REVIEW · Ticket 301001: rate to be negotiated. Not billed yet.',
          '301003 · MANUAL_REVIEW · Ticket 301003: rate to be negotiated. Not billed yet.',
        ],
        ['301001 #1 HNG-RMV-EA 1 × $68.00 = $68.00'],
      ],
    );
    story.at(
      on('14', '14:50'),
      'The price is agreed: $85.00 each. Dana changes the pay item’s unit to EA and enters Coastline’s rate; the worker runs',
    );
    const unitChanged = await payItems.change(dana, special.id, { unit: 'EA' });
    await saved(payItems.rate(dana, special.id, coastline, '85.00'));
    const agreed = await queue.settled(p1);
    story.check(
      'AC-07-63 the pay item’s un-invoiced tickets are reprocessed and bill: each hanger ticket gains its #2, 1 × $85.00, and the flag is cleared',
      [
        of(agreed, '301001', '301003'),
        await linesOf('301001'),
        await linesOf('301003'),
        await flagsOn('301001'),
      ],
      [
        ['301001 · COMPLETED', '301003 · COMPLETED'],
        [
          '301001 #1 HNG-RMV-EA 1 × $68.00 = $68.00',
          '301001 #2 HNG-SPECIAL-TBN 1 × $85.00 = $85.00',
        ],
        [
          '301003 #1 HNG-RMV-EA 1 × $68.00 = $68.00',
          '301003 #2 HNG-SPECIAL-TBN 1 × $85.00 = $85.00',
        ],
        ['Ticket 301001: rate to be negotiated. Not billed yet. (cleared)'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '15:30'),
      'Rivera’s self-loader comes back with sideboards added: Sam Grant measures it again as 730420, which replaces 730416. And the truck 730499 has lost its tailgate: Dana revokes its certification from tomorrow, 15 October',
    );
    const selfLoader = await api.certification.findFirstOrThrow({
      where: { projectId: p1, certNumber: '730416' },
    });
    const sideboards = await api.vehicleFeature.findFirstOrThrow({ where: { name: 'Sideboards' } });
    const dogBox = await api.vehicleFeature.findFirstOrThrow({ where: { name: 'Dog Box' } });
    await certifyNow(wednesdayCertifying, {
      certNumber: '730420',
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
          featureId: dogBox.id,
        },
        { ...primaryBox(264, 92, 12), featureId: sideboards.id },
      ],
      replaces: { certificationId: selfLoader.id, reason: 'Sideboards added' },
    });
    // An admin's alone: Dana's request at her browser (ADR-079).
    await (
      await backOffice.danas()
    ).answered(revokeCertificationEndpoint, {
      ids: { certificationId: late.id },
      json: { from: '2026-10-15', reason: 'Tailgate missing' },
    });

    story.at(
      on('15', '07:30'),
      'Thursday: Dana sets up two more kinds of load. "Vegetative to FDS" on the load form, hauled straight to a final disposal site and paid by the ton: VEG-HAUL-TN, $21.00. "White Goods" on the load form, paid by the each from the tickets the load carries: WG-HAUL-EA-60, $12.00',
    );
    const library = async (name: string): Promise<string> =>
      (await api.debrisType.findFirst({ where: { name } }))?.id ??
      (await saved(lists.debrisType(dana, name))).id;
    const entry = async (name: string): Promise<string> =>
      (
        await saved(
          forms.debrisType(dana, {
            formId: pricing.forms.load,
            debrisTypeId: await library(name),
            reduced: false,
            hiddenOnPhones: false,
          }),
        )
      ).id;
    const toFds = await entry('Vegetative to FDS');
    const whiteGoods = await entry('White Goods');
    const whiteGoodsRemoved = await api.payItem.findUniqueOrThrow({
      where: { id: pricing.payItems['WG-RMV-EA'] ?? '' },
    });
    const vegetativeType = await api.payableType.findFirstOrThrow({
      where: { name: 'Vegetative' },
    });
    const plain = {
      kindOfWorkId: null,
      bandFrom: null,
      bandTo: null,
      countIsAlwaysOne: false,
      gpsRequired: false,
      measurementRequired: false,
      decimalsAllowed: false,
      photosRequired: false,
      monitorMayMarkIneligible: false,
      crewTimeConversion: null,
      crewDayHours: null,
      projectId: p1,
    } as const;
    const perTon = await saved(
      payItems.payItem(dana, {
        ...plain,
        quantityFromCarriedTickets: false,
        code: 'VEG-HAUL-TN',
        description: 'ROW VEG haul to FDS, by weight',
        payableTypeId: vegetativeType.id,
        unit: 'TN',
        rates: [{ primeId: coastline, rate: '21.00' }],
      }),
    );
    const carried = await saved(
      payItems.payItem(dana, {
        ...plain,
        quantityFromCarriedTickets: true,
        code: 'WG-HAUL-EA-60',
        description: 'White goods haul 0–60 mi',
        payableTypeId: whiteGoodsRemoved.payableTypeId,
        unit: 'EA',
        rates: [{ primeId: coastline, rate: '12.00' }],
      }),
    );
    for (const [payItemId, debris] of [
      [perTon.id, toFds],
      [carried.id, whiteGoods],
    ] as const) {
      await saved(
        payItems.paysWhen(dana, payItemId, [
          {
            formId: pricing.forms.load,
            slot: 1,
            criteria: [{ criterion: 'DEBRIS_TYPE', operator: 'EQUALS', picks: [debris] }],
          },
        ]),
      );
    }

    story.check(
      'AC-01-75, 76, 77 the lookup is worked out again from the setup as it stands: a load of Vegetative to FDS on a Coastline truck is weighed, a load of white goods is counted from the tickets it carries, and a Summit truck, whose contract has no such rule, is asked for the load call',
      [
        await gaps(),
        (await phonesAsk('Cypress Creek Landfill')).filter(
          (line) => line.includes('Vegetative to FDS') || line.includes('White Goods'),
        ),
      ],
      [
        [],
        [
          'Cypress Creek Landfill · LOAD · Vegetative to FDS · Coastline Haulers LLC → SCALE_WEIGHT',
          'Cypress Creek Landfill · LOAD · Vegetative to FDS · Summit Debris Services → LOAD_CALL',
          'Cypress Creek Landfill · LOAD · White Goods · Coastline Haulers LLC → CARRIED_COUNT',
          'Cypress Creek Landfill · LOAD · White Goods · Summit Debris Services → LOAD_CALL',
        ],
      ],
    );

    story.at(
      on('15', '13:00'),
      'Thursday’s work syncs. 101018 on truck 730499 and 101019 on the self-loader’s old badge 730416, each called 50% at Marsh Road TDSR. Coastline’s tandem, weighed once at Cypress Creek Landfill, receipt CCL-51310, 62,800 lb gross, 28,600 tare, 34,200 net, 17.10 tons: 101050 on the truck body 730421 and 101051 on its trailer 730422, both Vegetative to FDS. And 101014, the dump trailer 730415 with white goods: its collection lists ticket 301006, and the tower counted the one ticket',
    );
    await load('15', '101018', '730499', ['08:00', '08:20', '08:50', '09:00']);
    await load('15', '101019', '730416', ['08:10', '08:30', '09:10', '09:20']);
    const heldReceipt = held.find(({ sent }) => sent.record === 'SCALE_RECEIPT')?.sent;
    if (heldReceipt?.record !== 'SCALE_RECEIPT') throw new Error('No scale receipt was held.');
    const weighedAt = new Date(on('15', '10:25'));
    const receiptId = uuidv7(weighedAt);
    const receiptAnswer = await sentAlone(story, timeZone, {
      record: 'SCALE_RECEIPT',
      scaleReceipt: {
        ...heldReceipt.scaleReceipt,
        id: receiptId,
        receiptNumber: 'CCL-51310',
        grossWeightLb: 62800,
        tareWeightLb: 28600,
        netWeightLb: 34200,
        netWeightTons: 17.1,
        enteredAt: weighedAt,
        deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, weighedAt),
      },
    });
    if (receiptAnswer.answer !== 'SAVED') throw new Error(`Not saved: ${receiptAnswer.answer}`);
    const atCypress = heldEvent('201004', 'HAUL_OUT_DISPOSAL');
    const weighed = {
      formDebrisTypeId: toFds,
      loadCall: null,
      scaleReceiptId: receiptId,
      siteId: cypress,
      monitorId: atCypress.monitorId,
      deviceId: atCypress.deviceId,
      assignmentId: atCypress.assignmentId,
      endLatitude: atCypress.endLatitude,
      endLongitude: atCypress.endLongitude,
      startLatitude: atCypress.startLatitude ?? null,
      startLongitude: atCypress.startLongitude ?? null,
    };
    await load(
      '15',
      '101050',
      '730421',
      ['09:00', '09:20', '10:30', '10:40'],
      { formDebrisTypeId: toFds },
      weighed,
    );
    await load(
      '15',
      '101051',
      '730422',
      ['09:20', '09:40', '10:40', '10:50'],
      { formDebrisTypeId: toFds },
      weighed,
    );
    await load(
      '15',
      '101014',
      '730415',
      ['11:00', '11:20', '11:50', '12:00'],
      { formDebrisTypeId: whiteGoods, carriedTickets: ['301006'] },
      { formDebrisTypeId: whiteGoods, loadCall: null, carriedCount: 1 },
    );
    story.at(on('15', '13:10'), 'The worker runs');
    const thursday = await queue.settled(p1);

    story.check(
      'AC-06-39, AC-03-47 a ticket worked on or after the day a certification is revoked from is flagged and still bills; 101015, worked on it the day before, is not',
      [of(thursday, '101018', '101015'), await linesOf('101018')],
      [
        [
          '101015 · COMPLETED',
          '101018 · MANUAL_REVIEW · Ticket 101018: review certification 730499 (revoked from 15-Oct-2026). Flagged for review.',
        ],
        ['101018 #1 VEG-HAUL-CY-15 14 × $7.50 = $105.00'],
      ],
    );
    story.check(
      'AC-06-40, AC-03-48 a ticket worked on the old number after it was replaced is flagged and still bills at the old certification’s 48 CY; Monday’s and Tuesday’s tickets on 730416 are not flagged',
      [
        of(thursday, '101019', '101002', '101004'),
        await linesOf('101019'),
        await capacityOf('730420'),
      ],
      [
        [
          '101002 · COMPLETED',
          '101004 · COMPLETED',
          '101019 · MANUAL_REVIEW · Ticket 101019: review certification 730416 (replaced by 730420 on 14-Oct-2026). Flagged for review.',
        ],
        ['101019 #1 VEG-HAUL-CY-15 24 × $7.50 = $180.00'],
        55,
      ],
    );
    const weightOf = async (ticketNumber: string) => {
      const completed = await api.completedLoad.findFirstOrThrow({
        where: { projectId: p1, ticketNumber },
      });
      return [completed.weightTons?.toFixed(2) ?? null, completed.volumeCy?.toFixed(1) ?? null];
    };
    story.check(
      'AC-06-79, 80, AC-07-51 one weight on two containers is split by certified capacity, 17.10 × 30 ÷ 70 and 17.10 × 40 ÷ 70: 7.33 and 9.77 tons, adding up to 17.10. Both tickets are flagged and each bills its share by the ton. Nothing in the data says "tandem": it is two disposals on one receipt',
      [
        of(thursday, '101050', '101051'),
        await weightOf('101050'),
        await weightOf('101051'),
        await linesOf('101050'),
        await linesOf('101051'),
      ],
      [
        [
          '101050 · MANUAL_REVIEW · Ticket 101050: one scale weight shared by two containers, split by certified capacity (7.33 of 17.10 tons). Flagged for review.',
          '101051 · MANUAL_REVIEW · Ticket 101051: one scale weight shared by two containers, split by certified capacity (9.77 of 17.10 tons). Flagged for review.',
        ],
        ['7.33', null],
        ['9.77', null],
        ['101050 #1 VEG-HAUL-TN 7.33 × $21.00 = $153.93'],
        ['101051 #1 VEG-HAUL-TN 9.77 × $21.00 = $205.17'],
      ],
    );
    story.check(
      'AC-07-54, AC-06-82 a load that carries a ticket bills from it, with no load call: the six items on 301006, 6 × $12.00. The tower’s count, one ticket, is the collection’s list, so nothing is flagged',
      [of(thursday, '101014'), await linesOf('101014')],
      [['101014 · COMPLETED'], ['101014 #1 WG-HAUL-EA-60 6 × $12.00 = $72.00']],
    );
    // What a change to one of these would queue besides the ticket itself (ADR-420).
    const neighboursOf = (workflow: 'LOAD' | 'UNIT_RATE', ticketNumber: string) =>
      api.$read(async (tx) =>
        (
          await new WorkQueue(tx, story.policy.jobTicketsAtMost).neighbours(p1, [
            { workflow, ticketNumber },
          ])
        ).map((ticket) => `${ticket.workflow} ${ticket.ticketNumber}`),
      );
    story.check(
      'AC-10-54 a job names the tickets a change can move, not only the one changed: a change to the truck body’s 101050 queues the trailer’s 101051, whose share of the one weight moves with it; a change to the white goods ticket 301006 queues the load that carries it, 101014; a change to that load queues no other ticket, since the carried ticket reads nothing of the load',
      [
        await neighboursOf('LOAD', '101050'),
        await neighboursOf('UNIT_RATE', '301006'),
        await neighboursOf('LOAD', '101014'),
      ],
      [['LOAD 101051'], ['LOAD 101014'], []],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('15', '14:00'),
      'Dana loads a new version of P1’s map: the county moved the line between Zone 2 and Zone 3 west, to 75.56° W, so 14 Heron St is now in Zone 3. The worker runs',
    );
    const zoneOf = async (ticketNumber: string): Promise<string | undefined> =>
      (
        await api.fieldEvent.findFirstOrThrow({
          where: { projectId: p1, ticketNumber, kind: 'COLLECTION' },
          include: { zone: true },
        })
      ).zone?.name;
    const zoneBefore = await zoneOf('101001');
    const standing = (await lines()).map((each) => each.id).sort();
    await saved(
      projects.loadMap(dana, {
        projectId: p1,
        source: 'UPLOAD',
        sourceName: 'bayline-row-zones-v2.geojson',
        boundary: p1Boundary,
        zones: {
          type: 'FeatureCollection',
          features: [
            ['Zone 1', -75.8, -75.67] as const,
            ['Zone 2', -75.67, -75.56] as const,
            ['Zone 3', -75.56, -75.4] as const,
          ].map(([name, west, east]) => ({
            type: 'Feature',
            properties: { ZONE_NAME: name },
            geometry: rectangle(west, 38.9, east, 39.3),
          })),
        },
        zoneNameField: 'ZONE_NAME',
      }),
    );
    await queue.settle(p1);
    story.check(
      'AC-06-03 every ticket the change touches is worked again: 101001, collected at 14 Heron St, was in Zone 2 and is now in Zone 3, read from map version 2; no rule reads a zone here, so every line is the same record',
      [
        zoneBefore,
        await zoneOf('101001'),
        (
          await api.fieldEvent.findFirstOrThrow({
            where: { projectId: p1, ticketNumber: '101001', kind: 'COLLECTION' },
            include: { mapVersion: true },
          })
        ).mapVersion?.version,
        (await lines())
          .map((each) => each.id)
          .sort()
          .join() === standing.join(),
      ],
      ['Zone 2', 'Zone 3', 2, true],
    );

    story.at(
      on('15', '14:30'),
      'Dana draws Marsh Road TDSR its own shape, but leaves the tower out of it: the yard east of the gate only. The worker runs',
    );
    const drawShape = (west: number, east: number) =>
      sites.shape(dana, tdsr, { source: 'DRAWN', shape: rectangle(west, 39.085, east, 39.095) });
    const flaggedForPlace = async (): Promise<string[]> =>
      (await openFlags()).filter((message) => message.includes('Marsh Road TDSR'));
    const before = await flaggedForPlace();
    const notAShape = await sites.shape(dana, tdsr, {
      source: 'UPLOAD',
      shape: { type: 'Point', coordinates: [-75.615, 39.09] },
    });
    const shapeDrawn = await drawShape(-75.62, -75.61);
    await queue.settle(p1);
    const outside = await flaggedForPlace();
    story.check(
      'AC-06-47, AC-06-03 a site with a shape of its own is checked against the shape in place of the circle: the tower, 38 m from the site’s GPS and inside the 200 m circle, is outside this shape, so every disposal and haul-out collection made there with a fix is flagged, and still bills',
      [
        before,
        outside.map((message) => message.slice(7, 13)),
        outside.at(0),
        await totalOf('101001'),
      ],
      [
        [],
        [
          '101001',
          '101014',
          '101015',
          '101018',
          '101019',
          '101044',
          '201001',
          '201004',
          '201005',
          '201006',
        ],
        "Ticket 101001: dumped outside Marsh Road TDSR's area. Flagged for review.",
        [1, '$390.00'],
      ],
    );
    story.at(
      on('15', '14:40'),
      'She draws it again, a kilometre and a half wide with the tower inside; the worker runs',
    );
    await saved(drawShape(-75.63, -75.61));
    await queue.settle(p1);
    story.check(
      'AC-06-47 inside the shape nothing is flagged, however far from the site’s GPS; the first shape is still there as version 1',
      [
        await flaggedForPlace(),
        (await api.siteAreaVersion.findMany({ where: { siteId: tdsr } })).length,
      ],
      [[], 2],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      '2027-02-04T09:00:00-05:00',
      'February 2027. P1’s window ended on 31 January. A phone syncs load 101023, collected at Heron St on 3 February on the dump trailer 730415 and called 50% at Marsh Road TDSR. The worker runs',
    );
    const february = (time: string): string => `2027-02-03T${time}:00-05:00`;
    await send(
      made(collected, february('09:00'), february('09:20'), {
        ...fromHeronSt,
        ticketNumber: '101023',
      }),
    );
    await send(
      made(dumped, february('09:50'), february('10:00'), { ticketNumber: '101023', loadCall: 50 }),
    );
    const afterTheWindow = await queue.settled(p1);
    story.check(
      'AC-09-24 nothing is refused: it is received, flagged and still bills, 65 CY × 50% = 32.5 CY',
      [of(afterTheWindow, '101023'), await linesOf('101023')],
      [
        [
          '101023 · MANUAL_REVIEW · Ticket 101023: project not active on 03-Feb-2027. Flagged for review.',
        ],
        ['101023 #1 VEG-HAUL-CY-15 32.5 × $7.50 = $243.75'],
      ],
    );
    story.at(
      '2027-02-04T09:30:00-05:00',
      'Dana extends P1’s window to 28 February 2027; the worker runs',
    );
    const windowChanged = await projects.changeWindow(dana, p1, { activeTo: '2027-02-28' });
    const extended = await queue.settled(p1);
    story.check(
      'AC-09-25 the change is an ordinary edit, audited under Dana with the date before; on the next run the flag on 101023 is cleared and the ticket is COMPLETED, its line the same',
      [
        (
          await api.auditRecord.findMany({
            where: {
              tableName: 'project',
              operation: 'UPDATE',
              changedFields: { has: 'active_to' },
            },
          })
        ).map((record) => [
          record.actorId === dana,
          (record.priorValue as Record<string, unknown>)['active_to'],
          (record.newValue as Record<string, unknown>)['active_to'],
        ]),
        of(extended, '101023'),
        await flagsOn('101023'),
        await linesOf('101023'),
      ],
      [
        [[true, '2027-01-31', '2027-02-28']],
        ['101023 · COMPLETED'],
        ['Ticket 101023: project not active on 03-Feb-2027. Flagged for review. (cleared)'],
        ['101023 #1 VEG-HAUL-CY-15 32.5 × $7.50 = $243.75'],
      ],
    );

    // ------------------------------------------------------------------------------------------
    const queuedBy = (outcome: Outcome<unknown>): unknown =>
      outcome.saved
        ? [
            outcome.queued?.jobs.length ?? 0,
            outcome.queued?.tickets ?? 0,
            outcome.queued?.lockedAsInvoiced ?? 0,
          ]
        : outcome.refusal;
    story.check(
      'BACKLOG 2.4.1 each of these changes was saved by its service, which queued the tickets it moves in the same piece of work: the pay item’s unit and the project’s window every ticket of P1 that isn’t void, the site’s shape the tickets with a field event at the site. What isn’t a shape isn’t saved, and queues nothing',
      [queuedBy(unitChanged), queuedBy(shapeDrawn), queuedBy(windowChanged), queuedBy(notAShape)],
      [
        [1, 20, 0],
        [1, 14, 0],
        [1, 26, 0],
        {
          code: 'SITE_SHAPE_NOT_READ',
          message: "Not saved: A shape is a Polygon or a MultiPolygon: Point can't be kept.",
        },
      ],
    );

    story.check(
      'what is still open at the end is what a person must look at, and nothing else: the 96% call, the stump no band fits, the typed number, the revoked and the replaced certification, and the shared weight',
      await openFlags(),
      [
        'Ticket 101003: load call 96%. Flagged for review.',
        'Ticket 101018: review certification 730499 (revoked from 15-Oct-2026). Flagged for review.',
        'Ticket 101019: review certification 730416 (replaced by 730420 on 14-Oct-2026). Flagged for review.',
        'Ticket 101050: one scale weight shared by two containers, split by certified capacity (7.33 of 17.10 tons). Flagged for review.',
        'Ticket 101051: one scale weight shared by two containers, split by certified capacity (9.77 of 17.10 tons). Flagged for review.',
        'Ticket 101060: typed ticket number (Barcode damaged). Flagged for review.',
        'Ticket 301005: not an eligible stump (20 in, under 24 in). Flagged for review.',
        'Ticket 301005: no survey. Flagged for review.',
      ],
    );
  },
};
