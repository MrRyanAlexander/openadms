// The eighteenth story (BACKLOG 2.4.5, 2.7.1 part 4; ADR-434, 435, 496;
// spec/acceptance/10-api-and-sync.md AC-10-29, 30; 02-people-and-devices.md AC-02-74, 78…80):
// what each read-only viewer reads of P1 at their browser, signed in, through the API's reads
// for a viewer (`/viewer/…`) over HTTPS, which the API makes as the database's read-only login
// itself, with the viewer stated. That login sees only what is committed, so this is a story on
// its own database and not a test on the installation's.
//
// P1's Monday and Tuesday are the story `p1-field-days`' own, sent at its phones' syncs; its
// map, pay items, rules and certifications are the shared steps of `p1-office.ts`; Summit, its
// truck 88120 and its load 101044 are told as the story `p1-priced` tells them. Each run of the
// worker is asked for directly, as in that story.
//
// Dana then signs in at the back office and issues five viewers at its endpoints, giving each P1:
// Bayline County's debris manager, an auditor the firm doesn't let see private citizens by
// name, and a contractor user each for Coastline, Rivera and Summit. She sets each one's first
// password; each signs in with it and sets their own. An ROE is written as the back office's by
// hand: no service creates one yet (ADR-432), and P1, a ROW project, asks for none; it is here
// for its owner's name alone.
//
// Not here: a viewer's refusals at the door one by one (`apps/api/test/viewer-reads.test.ts`,
// `sessions.test.ts`); the portal's pages and the exports (Phase 4).
import { ContractorSetup, PayItemSetup } from '@open-adms/api';
import {
  addPhotographEndpoint,
  createIncidentEndpoint,
  createPersonEndpoint,
  filePartMediaType,
  setViewerProjectsEndpoint,
  viewerCertificationsEndpoint,
  viewerDropOffLogsEndpoint,
  viewerIncidentsEndpoint,
  viewerPhotographFileEndpoint,
  viewerProjectsEndpoint,
  viewerQuantityLookupEndpoint,
  viewerRoesEndpoint,
  viewerSetupCheckEndpoint,
  viewerSetupEndpoint,
  viewerSurveysEndpoint,
  viewerTicketEndpoint,
  viewerTicketsEndpoint,
  type Endpoint,
  type ViewerTicketAnswer,
} from '@open-adms/contracts';
import { MapServers, Mileages, Reconciliation } from '@open-adms/worker';

import { utcOffsetMinutes } from '../clock.ts';
import type { PhoneRecord } from '../device.ts';
import { uuidv7 } from '../ids.ts';
import { localMapServers } from '../map-servers.ts';
import type { OfficeBrowser, OfficePerson } from '../office-browser.ts';
import { answered, codeOf, type AskedWith } from '../over-https.ts';
import type { Story } from '../runner.ts';
import { sentAlone } from './board.ts';
import {
  certifyP1,
  loadP1Map,
  p1FieldDaysHeld,
  P1Syncs,
  primaryBox,
  QueueRuns,
  saved,
  setUpP1Pricing,
} from './p1-office.ts';
import { danasEmail, p1TimeZone as timeZone } from './p1.ts';

const on = (date: string, time: string): string => `2026-10-${date}T${time}:00-04:00`;

type Ticket = ViewerTicketAnswer;
type Workflow = Ticket['workflow'];

// A ticket's lines as a person reads them: the money only where the viewer was shown it.
const linesOf = (ticket: Ticket | null): string[] =>
  (ticket?.lines ?? []).map((line) =>
    [
      `${ticket?.ticketNumber ?? ''}${line.splitSuffix === '' ? '' : `-${line.splitSuffix}`}`,
      `#${String(line.slot)}`,
      line.payItem?.code ?? 'no pay item shown',
      `${String(Number(line.quantity))} ${line.unit}`,
      line.rate === null || line.amount === null
        ? 'no money shown'
        : `× $${Number(line.rate).toFixed(2)} = $${line.amount}`,
      `· ${line.prime ?? 'prime not shown'}${line.operatingSub === null ? '' : ` + ${line.operatingSub}`}`,
    ].join(' '),
  );

// A ticket's field events as a person reads them, and who recorded each where that is shown.
const eventsOf = (ticket: Ticket | null): string[] =>
  (ticket?.fieldEvents ?? []).map((event) =>
    [
      `${event.kind}${event.splitSuffix === '' ? '' : `-${event.splitSuffix}`}`,
      event.status,
      `badge ${event.certNumber}`,
      event.debrisType ?? 'no debris type',
      event.site ?? 'no site',
      ...(event.loadCall === null ? [] : [`${String(event.loadCall)}%`]),
      event.recordedBy === null ? 'recorded by: not shown' : `recorded by ${event.recordedBy.name}`,
    ].join(' · '),
  );

export const p1Viewed: Story = {
  name: 'p1-viewed',
  title:
    'What each read-only viewer reads of P1 through the API, signed in at their browser, as the database’s read-only login: the client user and the auditor every ticket; a contractor user its own contractor’s, a prime its sub’s too; a sub’s no rate and no amount; an ROE’s owner only where the firm lets the viewer see private citizens; nobody, nothing',
  timeZone,
  start: on('08', '08:00'),

  async run(story) {
    const { api, worker, clock } = story;
    const office = await p1FieldDaysHeld(story);
    const { held, dana, p1 } = office;

    // ------------------------------------------------------------------------------------------
    story.at(
      on('08', '08:40'),
      'Thursday: Dana loads P1’s map and enters its pay items and rules, each rule naming "Coastline, Bayline ROW 2026" (golden mission §1)',
    );
    await loadP1Map(story, office);
    const pricing = await setUpP1Pricing(story, office);

    story.at(
      on('09', '09:00'),
      'Friday: Summit Debris Services joins P1 as a second prime, with its own contract, "Summit, Bayline ROW 2026"',
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
      'Saturday: Sam Grant certifies P1’s three containers and two crews, Rivera Trucking’s self-loader 730416 under Coastline among them, then Summit’s truck on the pre-printed sheet 88120, 28 CY',
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
    // The worker's own job loop: it takes up what each sync and setup change queued.
    const queue = new QueueRuns(story, reconciliation);
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
      'Wednesday: the Marsh Road tower’s phone is charged and syncs Tuesday’s work; the worker runs',
    );
    await phones.arrive(wednesdayMorning);
    await queue.settle(p1);

    story.at(
      on('14', '12:00'),
      'Wednesday morning’s load syncs: 101044, Summit’s truck 88120 from Heron St to Marsh Road TDSR, called 50%. Dana enters Summit’s rate, $7.80, on VEG-HAUL-CY-15 and saves its "Pays when" again; the worker runs',
    );
    // The story `p1-field-days` ends on Tuesday, so each record is made as the phone that
    // recorded Monday's 101001 would have sent it.
    const heldEvent = (kind: 'COLLECTION' | 'DISPOSAL') => {
      const found = held.find(
        ({ sent }) =>
          sent.record === 'FIELD_EVENT' &&
          sent.fieldEvent.ticketNumber === '101001' &&
          sent.fieldEvent.kind === kind,
      )?.sent;
      if (found?.record !== 'FIELD_EVENT') throw new Error(`No ${kind} on 101001`);
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
      const answer = await sentAlone(story, timeZone, record);
      if (answer.answer !== 'SAVED') throw new Error(`Not saved: ${answer.answer}`);
    };
    await send(heldEvent('COLLECTION'), '09:30', '09:50', {
      address: null,
      addressSource: null,
      ticketNumber: '101044',
      certNumber: '88120',
    });
    await send(heldEvent('DISPOSAL'), '10:20', '10:30', {
      ticketNumber: '101044',
      certNumber: '88120',
      loadCall: 50,
    });
    await queue.settle(p1);
    const veg15 = pricing.payItems['VEG-HAUL-CY-15'] ?? '';
    const payItems = new PayItemSetup(api, clock, story.policy);
    await saved(payItems.rate(dana, veg15, summit, '7.80'));
    await saved(
      payItems.paysWhen(dana, veg15, [
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
    await queue.settle(p1);
    const ledger = await api.transaction.findMany({ where: { projectId: p1 } });
    story.check(
      'what there is to read, as the back office holds it: P1’s Monday and Tuesday ($5,400.25 on 19 lines, the golden mission’s) and Summit’s 101044 ($109.20)',
      [
        ledger.length,
        ledger.reduce((cents, line) => cents + Number(line.amount.toFixed(2).replace('.', '')), 0),
      ],
      [20, 550945],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '14:00'),
      'Dana types Rosa Delgado’s paper ROE, R-0007, in the back office, then issues five read-only viewers and gives each P1: Bayline County’s debris manager, an auditor marked not to see private citizens by name, and a contractor user each for Coastline, Rivera and Summit',
    );
    await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, (tx) =>
      tx.roe.create({
        data: {
          projectId: p1,
          roeNumber: 'R-0007',
          parcelId: 'APN 14-0321-007',
          address: '412 Cedar Ct',
          ownerName: 'Rosa Delgado',
          signed: true,
          signedDate: new Date('2026-10-09'),
          answers: {},
          source: 'BACK_OFFICE',
          madeById: dana,
        },
      }),
    );
    const danas = await story.backOffice.admin({ id: dana, email: danasEmail });
    // Created at the people endpoint and given their projects at theirs, as Dana's browser asks.
    const issued = async (
      person: { readonly name: string; readonly email: string } & (
        | { readonly viewerKind: 'CLIENT' | 'AUDITOR'; readonly seesPrivateCitizens: boolean }
        | { readonly viewerKind: 'CONTRACTOR'; readonly contractorId: string }
      ),
      projects: readonly string[] = [p1],
    ): Promise<OfficePerson> => {
      const made = await danas.answered(createPersonEndpoint, {
        json: { ...person, role: 'READ_ONLY_VIEWER' },
      });
      await danas.answered(setViewerProjectsEndpoint, {
        ids: { userId: made.id },
        json: { projectIds: projects },
      });
      return { id: made.id, email: person.email };
    };
    const contractorNamed = async (name: string): Promise<string> =>
      (await api.contractor.findFirstOrThrow({ where: { name } })).id;
    const clientUser = await issued({
      name: 'Bayline County debris manager',
      email: 'debris@baylinecounty.example',
      viewerKind: 'CLIENT',
      seesPrivateCitizens: true,
    });
    const auditorUser = await issued({
      name: 'Auditor',
      email: 'auditor@stateaudit.example',
      viewerKind: 'AUDITOR',
      seesPrivateCitizens: false,
    });
    const coastlineUser = await issued({
      name: 'Coastline Haulers LLC viewer',
      email: 'office@coastlinehaulers.example',
      viewerKind: 'CONTRACTOR',
      contractorId: office.coastline,
    });
    const riveraUser = await issued({
      name: 'Rivera Trucking viewer',
      email: 'office@riveratrucking.example',
      viewerKind: 'CONTRACTOR',
      contractorId: await contractorNamed('Rivera Trucking'),
    });
    const summitUser = await issued({
      name: 'Summit Debris Services viewer',
      email: 'office@summitdebris.example',
      viewerKind: 'CONTRACTOR',
      contractorId: summit,
    });
    // A contractor user the firm issued and gave no project.
    const notGivenUser = await issued(
      {
        name: 'Coastline Haulers LLC second viewer',
        email: 'yard@coastlinehaulers.example',
        viewerKind: 'CONTRACTOR',
        contractorId: office.coastline,
      },
      [],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '14:30'),
      'Dana sets each one’s first password and tells them; each signs in at their browser, sets a password of their own, and reads P1 through the API’s reads for a viewer',
    );
    const client = await story.backOffice.person(danas, clientUser);
    const auditor = await story.backOffice.person(danas, auditorUser);
    const coastlines = await story.backOffice.person(danas, coastlineUser);
    const riveras = await story.backOffice.person(danas, riveraUser);
    const summits = await story.backOffice.person(danas, summitUser);
    const notGiven = await story.backOffice.person(danas, notGivenUser);
    const tickets = (viewer: OfficeBrowser, workflow: Workflow, more: AskedWith['query'] = {}) =>
      viewer.answered(viewerTicketsEndpoint, {
        ids: { projectId: p1 },
        query: { workflow, limit: '200', ...more },
      });
    const numbers = async (viewer: OfficeBrowser): Promise<Record<string, string[]>> => {
      const read: Record<string, string[]> = {};
      for (const workflow of ['LOAD', 'HAUL_OUT', 'UNIT_RATE'] as const) {
        read[workflow] = (await tickets(viewer, workflow)).tickets.map(
          (ticket) => ticket.ticketNumber,
        );
      }
      return read;
    };
    // One ticket; one the viewer isn't shown is answered 404, as one nobody has (AC-10-29).
    const ticketOf = async (
      viewer: OfficeBrowser,
      workflow: Workflow,
      ticketNumber: string,
    ): Promise<Ticket | null> => {
      const answer = await viewer.asked(viewerTicketEndpoint, {
        ids: { projectId: p1, workflow, ticketNumber },
      });
      if (answer.status === 404 && codeOf(answer) === 'NOT_FOUND') return null;
      return viewerTicketEndpoint.answer.parse(answered(viewerTicketEndpoint, answer));
    };
    const everyTicket = {
      // 101060 is the tower's mistyped disposal of 101006, which nobody has renumbered here.
      LOAD: ['101001', '101002', '101003', '101004', '101005', '101006', '101044', '101060'],
      HAUL_OUT: ['201001', '201004'],
      UNIT_RATE: ['301001', '301002', '301003', '301004', '301005', '301006', '301007'],
    };
    story.check(
      'AC-02-74 the client user and the auditor read every ticket of P1, by workflow and number, the disposal typed as 101060 by mistake among them',
      [await numbers(client), await numbers(auditor)],
      [everyTicket, everyTicket],
    );
    const coastlinesTickets = await numbers(coastlines);
    story.check(
      'AC-02-78 Coastline’s contractor user reads the tickets on Coastline’s certifications, Rivera’s truck 730416 under it included (101002), and not Summit’s 101044; Rivera’s reads only what its own truck worked; Summit’s reads 101044 alone',
      [
        coastlinesTickets['LOAD']?.includes('101001'),
        coastlinesTickets['LOAD']?.includes('101002'),
        coastlinesTickets['LOAD']?.includes('101044'),
        coastlinesTickets['HAUL_OUT'],
        (await numbers(riveras))['LOAD']?.includes('101002'),
        (await numbers(riveras))['LOAD']?.includes('101001'),
        await numbers(summits),
      ],
      [
        true,
        true,
        false,
        ['201001', '201004'],
        true,
        false,
        { LOAD: ['101044'], HAUL_OUT: [], UNIT_RATE: [] },
      ],
    );
    const page = await tickets(client, 'LOAD', { limit: '3' });
    const after = await tickets(client, 'LOAD', { after: page.next ?? '' });
    story.check(
      'a page of three loads says what follows it, and the page after starts there; each row holds its ticket’s status and how many field events it has',
      [page.tickets, page.next, after.tickets.map((ticket) => ticket.ticketNumber), after.next],
      [
        [
          { workflow: 'LOAD', ticketNumber: '101001', statuses: ['COMPLETED'], fieldEvents: 2 },
          { workflow: 'LOAD', ticketNumber: '101002', statuses: ['COMPLETED'], fieldEvents: 2 },
          {
            workflow: 'LOAD',
            ticketNumber: '101003',
            statuses: ['MANUAL_REVIEW'],
            fieldEvents: 2,
          },
        ],
        '101003',
        ['101004', '101005', '101006', '101044', '101060'],
        null,
      ],
    );

    const load = (viewer: OfficeBrowser, ticketNumber: string) =>
      ticketOf(viewer, 'LOAD', ticketNumber);
    story.check(
      'AC-10-29 Coastline’s contractor user, asking for Summit’s 101044 by its project, workflow and number, gets nothing of it: answered 404, the same answer as for a number nobody has. Asked for its own 101001, it gets it',
      [
        await load(coastlines, '101044'),
        await load(coastlines, '109999'),
        (await load(coastlines, '101001'))?.ticketNumber,
      ],
      [null, null, '101001'],
    );
    story.check(
      'and the other way about: Summit’s reads nothing of Coastline’s 101001 or of Rivera’s 101002; Rivera’s nothing of Coastline’s own 101001 or of the haul-out 201004',
      [
        await load(summits, '101001'),
        await load(summits, '101002'),
        await load(riveras, '101001'),
        await ticketOf(riveras, 'HAUL_OUT', '201004'),
      ],
      [null, null, null, null],
    );

    const clients101001 = await load(client, '101001');
    story.check(
      'AC-02-74 the client user reads 101001 whole: its two field events in the order of their field time, who recorded each, the completed load the system concluded (65 CY called 80% = 52.00 CY) and its line with the money',
      [
        eventsOf(clients101001),
        clients101001?.statuses,
        clients101001?.completed === null || clients101001 === null
          ? null
          : [
              clients101001.completed.quantitySource,
              clients101001.completed.capacityCy,
              clients101001.completed.loadCall,
              clients101001.completed.volumeCy,
              clients101001.completed.collections.map((row) => row.shareFraction),
            ],
        linesOf(clients101001),
      ],
      [
        [
          'COLLECTION · COMPLETED · badge 730415 · Vegetative · no site · recorded by Ana Brooks',
          'DISPOSAL · COMPLETED · badge 730415 · Vegetative · Marsh Road TDSR · 80% · recorded by Kim Nguyen',
        ],
        ['COMPLETED'],
        ['LOAD_CALL', 65, 80, '52.00', ['1.00000000']],
        ['101001 #1 VEG-HAUL-CY-15 52 CY × $7.50 = $390.00 · Coastline Haulers LLC'],
      ],
    );
    const coastlines101001 = await load(coastlines, '101001');
    story.check(
      'AC-02-78 Coastline’s contractor user reads the same ticket, its completed load and its money, and not who recorded it',
      [
        eventsOf(coastlines101001),
        coastlines101001?.completed?.volumeCy,
        linesOf(coastlines101001),
      ],
      [
        [
          'COLLECTION · COMPLETED · badge 730415 · Vegetative · no site · recorded by: not shown',
          'DISPOSAL · COMPLETED · badge 730415 · Vegetative · Marsh Road TDSR · 80% · recorded by: not shown',
        ],
        '52.00',
        ['101001 #1 VEG-HAUL-CY-15 52 CY × $7.50 = $390.00 · Coastline Haulers LLC'],
      ],
    );

    const lines101002 = [
      '101002 #1 CD-HAUL-CY-15 36 CY × $8.25 = $297.00 · Coastline Haulers LLC + Rivera Trucking',
      '101002 #2 TIP-FEE-CY-BCL 36 CY × $4.00 = $144.00 · Coastline Haulers LLC + Rivera Trucking',
    ];
    const riveras101002 = await load(riveras, '101002');
    story.check(
      'AC-02-80, AC-10-30 a sub’s reads no money: Rivera’s contractor user reads 101002’s two lines, each with its pay item and its 36 CY, and no rate and no amount; it reads its own name on them and not its prime’s. Coastline’s reads $8.25 and $297.00, and the tipping fee, at Coastline’s rates; the client user and the auditor the same',
      [
        linesOf(riveras101002),
        riveras101002?.lines.map((line) => [line.rate, line.amount]),
        riveras101002?.completed?.volumeCy,
        linesOf(await load(coastlines, '101002')),
        linesOf(await load(client, '101002')),
        linesOf(await load(auditor, '101002')),
      ],
      [
        [
          '101002 #1 CD-HAUL-CY-15 36 CY no money shown · prime not shown + Rivera Trucking',
          '101002 #2 TIP-FEE-CY-BCL 36 CY no money shown · prime not shown + Rivera Trucking',
        ],
        [
          [null, null],
          [null, null],
        ],
        '36.00',
        lines101002,
        lines101002,
        lines101002,
      ],
    );
    story.check(
      'AC-02-80 Summit’s contractor user reads the money on Summit’s own line, at Summit’s rate; the client user reads it too',
      [linesOf(await load(summits, '101044')), linesOf(await load(client, '101044'))],
      [
        ['101044 #1 VEG-HAUL-CY-15 14 CY × $7.80 = $109.20 · Summit Debris Services'],
        ['101044 #1 VEG-HAUL-CY-15 14 CY × $7.80 = $109.20 · Summit Debris Services'],
      ],
    );

    const haulOut = await ticketOf(coastlines, 'HAUL_OUT', '201004');
    story.check(
      'AC-02-78 the split haul-out 201004, Coastline’s walking floor loaded from three piles and weighed: its four field events, its completed haul-out with a row for each pile, and a line for each pile at $20.00 a ton',
      [
        haulOut?.fieldEvents.map((event) => `${event.kind} ${event.splitSuffix}`.trim()),
        haulOut?.completed === null || haulOut === null
          ? null
          : [
              haulOut.completed.quantitySource,
              haulOut.completed.weightTons,
              haulOut.completed.collections.map(
                (pile) =>
                  `${pile.splitSuffix} ${String(pile.pileLoadCall)}% ${String(pile.weightTons)}`,
              ),
            ],
        linesOf(haulOut),
      ],
      [
        [
          'HAUL_OUT_COLLECTION A',
          'HAUL_OUT_COLLECTION B',
          'HAUL_OUT_COLLECTION C',
          'HAUL_OUT_DISPOSAL',
        ],
        ['SCALE_WEIGHT', '24.0000', ['A 10% 2.8200', 'B 25% 7.0600', 'C 50% 14.1200']],
        [
          '201004-A #1 MULCH-HO-TN 2.82 TN × $20.00 = $56.40 · Coastline Haulers LLC',
          '201004-B #1 MULCH-HO-TN 7.06 TN × $20.00 = $141.20 · Coastline Haulers LLC',
          '201004-C #1 MULCH-HO-TN 14.12 TN × $20.00 = $282.40 · Coastline Haulers LLC',
        ],
      ],
    );
    const stump = await ticketOf(auditor, 'UNIT_RATE', '301004');
    story.check(
      'a unit rate ticket has no completed record: the auditor reads 301004’s one field event with the pay item the system worked out, and its two lines',
      [
        stump?.fieldEvents.map((event) => `${event.kind} ${event.payItem?.code ?? 'none'}`),
        stump?.completed,
        linesOf(stump),
      ],
      [
        ['UNIT_RATE STP-RMV-EA-36'],
        null,
        [
          '301004 #1 STP-RMV-EA-36 1 EA × $110.00 = $110.00 · Coastline Haulers LLC',
          '301004 #2 STP-FILL-CY 4.8 CY × $22.00 = $105.60 · Coastline Haulers LLC',
        ],
      ],
    );

    // ------------------------------------------------------------------------------------------
    const owners = async (viewer: OfficeBrowser): Promise<string[]> =>
      (
        await viewer.answered(viewerRoesEndpoint, {
          ids: { projectId: p1 },
          query: { limit: '200' },
        })
      ).roes.map(
        (roe) =>
          `${roe.roeNumber} · ${roe.signed ? `signed ${String(roe.signedDate)}` : 'unsigned'} · ${roe.ownerName ?? 'owner not shown'}`,
      );
    story.check(
      'AC-02-75…77 an ROE’s owner by the viewer’s own setting: the client user, let see private citizens, reads Rosa Delgado; the auditor, marked not to, reads the ROE and no owner; a contractor user reads no ROE at all',
      [await owners(client), await owners(auditor), await owners(coastlines)],
      [
        ['R-0007 · signed 2026-10-09 · Rosa Delgado'],
        ['R-0007 · signed 2026-10-09 · owner not shown'],
        [],
      ],
    );

    // ------------------------------------------------------------------------------------------
    // The same records the back office reads, as the database shows each viewer them (ADR-535
    // (6)): beside a ticket, its flags, photographs, scale receipts, items and lock; a project's
    // certifications, forms, setup, setup check and lookup; a photograph's file where shown.
    story.at(
      on('14', '15:00'),
      'Each viewer reads beside its tickets, and the project’s certifications, forms and setup',
    );
    const clients101003 = await load(client, '101003');
    const coastlines101003 = await load(coastlines, '101003');
    story.check(
      'AC-10-105 beside 101003 the client user reads its open flag, not accepted, and its QC status and lock (none yet); Coastline’s contractor user reads the same ticket and no flag',
      [
        clients101003?.flags.map((flag) => `${flag.message} · accepted: ${String(flag.accepted)}`),
        [clients101003?.qcStatus, clients101003?.lock],
        coastlines101003?.flags,
        coastlines101003?.ticketNumber,
      ],
      [
        ['Ticket 101003: load call 96%. Flagged for review. · accepted: false'],
        [null, null],
        [],
        '101003',
      ],
    );
    const weighed = await ticketOf(client, 'HAUL_OUT', '201004');
    story.check(
      'AC-10-105 the weighed haul-out 201004’s scale receipt is read beside it, by the client user and Coastline’s, with its site by name and its weights exact; Rivera’s reads no such ticket',
      [
        weighed?.scaleReceipts.map(
          (receipt) => `${receipt.site ?? 'no site'} · ${String(receipt.netWeightTons)} TN`,
        ),
        haulOut?.scaleReceipts.map((receipt) => receipt.netWeightTons),
        await ticketOf(riveras, 'HAUL_OUT', '201004'),
      ],
      [['Cypress Creek Landfill · 24.0000 TN'], ['24.0000'], null],
    );
    story.check(
      'AC-10-105 a haul-out weighed once has its one receipt, read with a site’s name',
      [
        weighed?.scaleReceipts.length,
        weighed?.scaleReceipts.every((receipt) => receipt.site !== null),
      ],
      [1, true],
    );
    const crew301001 = await ticketOf(client, 'UNIT_RATE', '301001');
    const photographed = crew301001?.photographs ?? [];
    const kept = photographed.find((photo) => photo.uploadedAt !== null);
    const fileOf = async (viewer: OfficeBrowser, photoId: string) => {
      const answer = await viewer.asked(viewerPhotographFileEndpoint, {
        ids: { photoId, file: 'photo' },
      });
      return `${String(answer.status)} ${codeOf(answer) ?? 'answered'}`;
    };
    story.check(
      'AC-10-105 Jo’s crew photograph of 301001 is beside it for the client user, never where its file is kept; its file is handed to the client user where it has arrived, and to Summit’s contractor user, who isn’t shown the photograph, as one nobody has',
      [
        photographed.length > 0,
        JSON.stringify(crew301001).includes('objectKey'),
        kept === undefined ? 'no file yet' : await fileOf(client, kept.id),
        photographed[0] === undefined ? '404 NOT_FOUND' : await fileOf(summits, photographed[0].id),
      ],
      // The story's phones send no photograph's file: the file read is the API's own test's.
      [true, false, 'no file yet', '404 NOT_FOUND'],
    );
    // A photograph whose file has arrived, on a record a contractor user isn't shown: Dana enters
    // the yard's incident from its paper report and adds its photograph (ADR-534 (2), (9)).
    const jos = await api.incident.findFirstOrThrow({ where: { projectId: p1 } });
    const yardIncident = await danas.answered(createIncidentEndpoint, {
      ids: { projectId: p1 },
      json: {
        monitorId: jos.monitorId,
        madeAt: '2026-10-13T16:05:00Z',
        deviceUtcOffsetMinutes: -240,
        fix: null,
        notes: null,
        answers: { answers: {} },
        reasonId: (await api.reason.findFirstOrThrow({ where: { name: 'Device failed' } })).id,
        incidentTypeId: jos.incidentTypeId,
        incidentSubTypeId: null,
        description: 'Gate post clipped at the yard',
        parties: null,
        address: null,
        contractorId: null,
        certNumber: null,
        roeNumber: null,
      },
    });
    const gatePost = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
      Buffer.from('the gate post at the yard, clipped'),
    ]);
    const { record: gatePhoto } = await danas.answered(addPhotographEndpoint, {
      query: {
        on: 'INCIDENT',
        recordId: yardIncident.record.id,
        capturedAt: '2026-10-13T16:06:00Z',
        utcOffsetMinutes: '-240',
      },
      bytes: { of: gatePost, contentType: filePartMediaType },
    });
    const handed = await client.asked(viewerPhotographFileEndpoint, {
      ids: { photoId: gatePhoto.id, file: 'photo' },
    });
    story.check(
      'AC-10-105 a photograph’s file is handed to a viewer the database shows its record: the incident’s, to the client user and the auditor, as it was kept; to Coastline’s and Summit’s contractor users, who see no incident, as one nobody has',
      [
        [handed.status, Buffer.compare(handed.bytes ?? Buffer.alloc(0), gatePost)],
        await fileOf(auditor, gatePhoto.id),
        await fileOf(coastlines, gatePhoto.id),
        await fileOf(summits, gatePhoto.id),
      ],
      [[200, 0], '200 answered', '404 NOT_FOUND', '404 NOT_FOUND'],
    );
    const certificationsOf = async (viewer: OfficeBrowser): Promise<string[]> =>
      (
        await viewer.answered(viewerCertificationsEndpoint, {
          ids: { projectId: p1 },
          query: { limit: '200' },
        })
      ).certifications.map(
        (each) =>
          `${each.certNumber} · ${each.kind} · ${each.prime ?? 'prime not shown'}${each.firstTierSub === null ? '' : ` + ${each.firstTierSub}`} · ${String(each.capacityCy ?? 'crew')} · ${String(each.boxes.length)} boxes`,
      );
    const clientsCertifications = await certificationsOf(client);
    story.check(
      'AC-10-105 the client user reads every certification of P1, by cert number, with its boxes; Rivera’s contractor user its own truck 730416 alone; Summit’s its 88120; none reads a driver’s phone or licence number',
      [
        clientsCertifications.length,
        clientsCertifications.filter(
          (line) => line.startsWith('730416') || line.startsWith('88120'),
        ),
        await certificationsOf(riveras),
        await certificationsOf(summits),
        /driverPhone|driverLicenceNumber/.exec(
          JSON.stringify(
            await client.answered(viewerCertificationsEndpoint, { ids: { projectId: p1 } }),
          ),
        ),
      ],
      [
        6,
        [
          '730416 · CONTAINER · Coastline Haulers LLC + Rivera Trucking · 48 · 2 boxes',
          '88120 · CONTAINER · Summit Debris Services · 28 · 1 boxes',
        ],
        ['730416 · CONTAINER · prime not shown + Rivera Trucking · 48 · 2 boxes'],
        ['88120 · CONTAINER · Summit Debris Services · 28 · 1 boxes'],
        null,
      ],
    );
    const logsOf = async (viewer: OfficeBrowser): Promise<string[]> =>
      (
        await viewer.answered(viewerDropOffLogsEndpoint, { ids: { projectId: p1 } })
      ).dropOffLogs.map(
        (log) =>
          `${log.site ?? 'no site'} · ${log.residentName ?? 'resident not shown'} · ${log.originAddress ?? 'from not shown'}`,
      );
    const incidentsOf = async (viewer: OfficeBrowser): Promise<number> =>
      (await viewer.answered(viewerIncidentsEndpoint, { ids: { projectId: p1 } })).incidents.length;
    story.check(
      'AC-10-105, AC-02-75…77 the drop-off log’s resident by the viewer’s own setting: the client user reads Carl Jensen and where his debris came from, the auditor neither; a contractor user reads no drop-off log, no incident and no survey; the client user and the auditor read Jo’s incident and the yard’s',
      [
        await logsOf(client),
        await logsOf(auditor),
        await logsOf(coastlines),
        [await incidentsOf(client), await incidentsOf(auditor), await incidentsOf(coastlines)],
        (await coastlines.answered(viewerSurveysEndpoint, { ids: { projectId: p1 } })).surveys,
      ],
      [
        ['Marsh Road TDSR · Carl Jensen · 14 Heron St'],
        ['Marsh Road TDSR · resident not shown · from not shown'],
        [],
        [2, 2, 0],
        [],
      ],
    );
    const setupOf = (viewer: OfficeBrowser) =>
      viewer.asked(viewerSetupEndpoint, { ids: { projectId: p1 } });
    const clientsSetup = viewerSetupEndpoint.answer.parse(
      answered(viewerSetupEndpoint, await setupOf(client)),
    );
    const told = async (viewer: OfficeBrowser, served: Endpoint) => {
      const answer = await viewer.asked(served, { ids: { projectId: p1 } });
      return `${String(answer.status)} ${codeOf(answer) ?? 'answered'}`;
    };
    story.check(
      'AC-10-105 a client user and an auditor read P1’s setup: its forms and debris types, its pay items by code and description and never a rate, its sites, its contracts with their primes, its rules; and the setup check and the lookup; a contractor user is answered each as one nobody has',
      [
        clientsSetup.forms.map((form) => form.documentType).sort(),
        clientsSetup.payItems.map((item) => item.code).includes('VEG-HAUL-CY-15'),
        /"rate"|7\.50|7\.80/.exec(JSON.stringify(clientsSetup)),
        clientsSetup.contracts.map((contract) => `${contract.name} · ${contract.prime ?? ''}`),
        clientsSetup.rules.length > 0,
        [
          await told(auditor, viewerSetupEndpoint),
          await told(client, viewerSetupCheckEndpoint),
          await told(auditor, viewerQuantityLookupEndpoint),
        ],
        [
          await told(coastlines, viewerSetupEndpoint),
          await told(coastlines, viewerSetupCheckEndpoint),
          await told(riveras, viewerQuantityLookupEndpoint),
        ],
      ],
      [
        ['DROP_OFF_LOG', 'HAUL_OUT', 'INCIDENT', 'LOAD', 'UNIT_RATE'],
        true,
        null,
        [
          'Coastline, Bayline ROW 2026 · Coastline Haulers LLC',
          'Summit, Bayline ROW 2026 · Summit Debris Services',
        ],
        true,
        ['200 answered', '200 answered', '200 answered'],
        ['404 NOT_FOUND', '404 NOT_FOUND', '404 NOT_FOUND'],
      ],
    );
    const lookup = await client.answered(viewerQuantityLookupEndpoint, { ids: { projectId: p1 } });
    story.check(
      'AC-10-105 the lookup the client user reads is the setup as it stands: a row for each live site, form debris type and prime, each asking what its phones ask',
      [lookup.asks.length > 0, lookup.asks.every((ask) => ask.siteId.length > 0)],
      [true, true],
    );
    const roesRead = (
      await client.answered(viewerRoesEndpoint, { ids: { projectId: p1 } })
    ).roes.map((roe) => [roe.parcelId, roe.address, roe.scope]);
    story.check(
      'AC-10-105 an ROE is read with its parcel and its address, and its scope (none on R-0007)',
      [roesRead],
      [[['APN 14-0321-007', '412 Cedar Ct', []]]],
    );

    // ------------------------------------------------------------------------------------------
    const nothing = { LOAD: [], HAUL_OUT: [], UNIT_RATE: [] };
    const projectsOf = async (viewer: OfficeBrowser): Promise<string[]> =>
      (await viewer.answered(viewerProjectsEndpoint, { query: { limit: '200' } })).projects.map(
        (project) => project.name,
      );
    // Each of the four reads, and what the door answered.
    const reads: readonly (readonly [Endpoint, AskedWith])[] = [
      [viewerProjectsEndpoint, {}],
      [viewerTicketsEndpoint, { ids: { projectId: p1 }, query: { workflow: 'LOAD' } }],
      [viewerTicketEndpoint, { ids: { projectId: p1, workflow: 'LOAD', ticketNumber: '101001' } }],
      [viewerRoesEndpoint, { ids: { projectId: p1 } }],
    ];
    const refused = async (who: Pick<OfficeBrowser, 'asked'>): Promise<string[]> => {
      const told: string[] = [];
      for (const [served, more] of reads) {
        const answer = await who.asked(served, more);
        told.push(`${String(answer.status)} ${codeOf(answer) ?? 'answered'}`);
      }
      return told;
    };
    story.check(
      'AC-10-30 nobody reads nothing: a browser nobody signed in at is refused every read at the door, and Dana herself is refused each (an admin is no viewer); a contractor user given no project is shown no project, no ticket, no line and no ROE',
      [
        await projectsOf(client),
        await refused(story.backOffice.signedOut),
        await refused(danas),
        await projectsOf(notGiven),
        await numbers(notGiven),
        await load(notGiven, '101001'),
        await owners(notGiven),
      ],
      [
        ['Bayline County ROW, Hurricane Delphine'],
        reads.map(() => '401 NOT_SIGNED_IN'),
        reads.map(() => '403 NOT_ALLOWED'),
        [],
        nothing,
        null,
        [],
      ],
    );
    await danas.answered(setViewerProjectsEndpoint, {
      ids: { userId: summits.userId },
      json: { projectIds: [] },
    });
    story.check(
      'a project taken away is gone from the very next read: Summit’s contractor user reads no ticket once Dana takes P1 from them',
      [await numbers(summits), await load(summits, '101044')],
      [nothing, null],
    );
  },
};
