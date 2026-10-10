// The seventh story (BACKLOG 1.4.2; ADR-338): three days of phones syncing through the API's
// intake (spec/parts/05-sync.md; spec/acceptance/05-sync.md, by scenario ID; adms-exceptions
// §4.3a, Scenarios A, C and D). Every record is received, in whatever order it comes, and stored
// once; a second field event of one kind on one ticket is kept whole in quarantine and never
// answered "saved"; a retry of the same record is the same record; nothing else is refused.
//
// Monday 12 October 2026 on P1 is Scenario A: Rivera's self-loader, cert 730416, collected at 22
// Elm St as 101020 and at 40 Birch Ln as 101021; at Marsh Road TDSR Kim scans 101020 at 10:22 and
// again, from a stale copy, at 11:40. Tuesday is every other shape of duplicate, what is not a
// duplicate, the records that reach the server with a gap, and every phone syncing at once.
// Wednesday is P2's split load 102001 with its ROEs, and the phones that were dark.
//
// It ends where this build does: every field event PENDING. Pairing, flags, zones, mileage and
// money are the worker's (Milestones 1.5…1.7); what a reviewer does with a quarantined record is
// 1.8.x's. A sync begins with the phone's proof of itself, through the API's `PhoneProofs`
// (task 2.5.1, ADR-440). Not here: the endpoints, the ledger's own tables, the photograph's
// file (Phase 2); the phone's screens (Phase 3).
import {
  Certifications,
  FormSetup,
  ListSetup,
  type NewForm,
  NumberAllocator,
  type Outcome,
  PayItemSetup,
  Phones,
  ProjectSetup,
  type SyncAnswer,
  type NewAssignment,
} from '@open-adms/api';
import type { FieldEventKind, FormDocumentType, NumberSeries } from '@open-adms/db';
import { NewProjectSettings } from '@open-adms/domain';

import { projectTime, utcOffsetMinutes } from '../clock.ts';
import {
  chained,
  type Completed,
  type Completion,
  made,
  type PhoneRecord,
  type RecordedEvent,
  scanned,
  type SimulatedDevice,
} from '../device.ts';
import { uuidv7 } from '../ids.ts';
import type { EnrolledPhone } from '../software-key.ts';
import type { Story, StoryMonitor } from '../runner.ts';
import { assigned, taken, unplanned as unplannedOn } from './board.ts';
import { p1TimeZone as timeZone, setUpP1, setUpP1Sites, startSeries } from './p1.ts';

const on = (date: string, time: string): string => `2026-10-${date}T${time}:00-04:00`;
const saturday = (time: string): string => on('10', time);
const monday = (time: string): string => on('12', time);
const tuesday = (time: string): string => on('13', time);
const wednesday = (time: string): string => on('14', time);

const short: Record<FieldEventKind, string> = {
  COLLECTION: 'COL',
  DISPOSAL: 'DIS',
  HAUL_OUT_COLLECTION: 'HOC',
  HAUL_OUT_DISPOSAL: 'HOD',
  UNIT_RATE: 'URT',
};

// The id its phone made for a record, whatever its kind.
function idOf(sent: PhoneRecord): string {
  switch (sent.record) {
    case 'FIELD_EVENT':
      return sent.fieldEvent.id;
    case 'SCALE_RECEIPT':
      return sent.scaleReceipt.id;
    case 'INCIDENT':
      return sent.incident.id;
    case 'DROP_OFF_LOG':
      return sent.dropOffLog.id;
    case 'SURVEY':
      return sent.survey.id;
    case 'ROE':
      return sent.roe.id;
    case 'PHOTO':
      return sent.photo.id;
  }
}

const told = (answers: readonly SyncAnswer[]): string[] => answers.map((one) => one.answer);

export const sync: Story = {
  name: 'sync',
  title:
    'Three days of phones syncing through intake: every record received and stored once, a duplicate kept whole in quarantine, nothing else refused',
  timeZone,
  start: saturday('08:00'),

  async run(story) {
    const { api, clock, intake } = story;
    const saved = async <T>(attempt: Promise<Outcome<T>>): Promise<T> => {
      const outcome = await attempt;
      if (!outcome.saved) throw new Error(`Refused: ${outcome.refusal.message}`);
      return outcome.record;
    };
    const done = (completed: Completed): RecordedEvent => {
      if (!completed.saved) throw new Error(`Not saved: ${completed.reason}`);
      return completed.event;
    };

    // ------------------------------------------------------------------------------------------
    story.at(
      saturday('08:00'),
      'Dana Reyes has set up P1 and P2, their people and their phones; Sam Grant certifies the trucks',
    );
    // Each enrolled under the master passcode, with a key of its own (ADR-439, 440). The keys
    // are kept: a phone proves itself with its own before it syncs.
    const enrolled: Record<string, EnrolledPhone> = {};
    for (const name of [
      'P1-COL-1',
      'P1-TWR-TDSR',
      'P1-TWR-LF',
      'P1-TWR-LF-2',
      'P1-HO-TDSR',
      'P1-UR-1',
      'P2-COL-1',
      'P2-TWR-TDSR',
    ]) {
      enrolled[name] = await story.enrolled(name);
    }
    const phones = Object.fromEntries(
      Object.entries(enrolled).map(([name, phone]) => [name, phone.id]),
    );
    const dana = uuidv7(clock.now());
    const office = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
      const luis = await tx.user.create({ data: { name: 'Luis Ortega', role: 'MANAGER_ANALYST' } });
      // Luis writes the board and marks a phone lost: Dana grants him *dispatch* (ADR-428).
      await tx.userPermission.create({ data: { userId: luis.id, permission: 'DISPATCH' } });
      const p1 = await setUpP1(tx, story.policy);
      const { tdsr, landfill } = await setUpP1Sites(tx, p1.project);
      const ppdr = await tx.programType.findFirstOrThrow({ where: { name: 'PPDR' } });
      const p2 = await tx.project.create({
        data: {
          name: 'Bayline County PPDR, Hurricane Delphine',
          clientId: p1.client,
          declarationEventId: p1.declarationEvent,
          programTypeId: ppdr.id,
          timeZone,
          activeFrom: new Date('2026-10-12'),
          activeTo: new Date('2027-01-31'),
          ticketNumberSource: 'GENERATED',
          workflows: ['LOAD'],
          ...new NewProjectSettings(story.policy).for(ppdr),
        },
      });
      // P2's own series (spec/CONVENTIONS.md §6): loads from 102001, its own cert 730416.
      await startSeries(tx, p2.id, { LOAD: 102001, CERTIFICATION: 730416 });
      await tx.projectContractor.create({
        data: {
          projectId: p2.id,
          contractorId: p1.prime,
          position: 'PRIME',
          asPrimeId: p1.prime,
        },
      });
      // A site is entered on each project that uses it (ADR-145): Marsh Road TDSR again, on P2.
      const tdsrType = await tx.siteType.findUniqueOrThrow({ where: { key: 'TDSR' } });
      const p2Tdsr = await tx.disposalSite.create({
        data: {
          projectId: p2.id,
          name: 'Marsh Road TDSR',
          siteTypeId: tdsrType.id,
          siteTypeKey: tdsrType.key,
          takesLoads: true,
          haulOutsLeaveHere: true,
          chargesTippingFee: false,
          ineligibleSite: false,
          permitNumber: 'FDEP-DMS-2026-0117',
          latitude: '39.09000000',
          longitude: '-75.62000000',
          activationDate: new Date('2026-10-12'),
        },
      });
      return {
        luis: luis.id,
        p1: p1.project,
        p2: p2.id,
        coastline: p1.prime,
        tdsr,
        landfill,
        p2Tdsr: p2Tdsr.id,
        phones,
      };
    });
    const { luis, p1, p2, coastline, tdsr, landfill, p2Tdsr } = office;
    const device = (name: string): string => {
      const id = office.phones[name];
      if (id === undefined) throw new Error(`No phone ${name}`);
      return id;
    };
    // The six monitors, created as real ones are: on a phone, online, under the master passcode;
    // the database issues each their Monitor ID (ADR-442).
    const monitors: Record<string, StoryMonitor> = {};
    for (const name of [
      'Ana Brooks',
      'Kim Nguyen',
      'Tariq Patel',
      'Jo Kim',
      'Sam Grant',
      'Lee Morgan',
    ]) {
      monitors[name] = await story.monitor(name, device('P1-COL-1'));
    }
    const monitor = (name: string): StoryMonitor => {
      const found = monitors[name];
      if (found === undefined) throw new Error(`No monitor ${name}`);
      return found;
    };
    const person = (name: string): string => monitor(name).id;
    const projectNames = new Map([
      [p1, 'P1'],
      [p2, 'P2'],
    ]);

    const forms = new FormSetup(api, clock);
    const lists = new ListSetup(api, clock);
    const projects = new ProjectSetup(api, clock, story.policy);
    const payItems = new PayItemSetup(api, clock, story.policy);
    const certifications = new Certifications(api, clock, story.policy);
    const allocator = new NumberAllocator(api, clock, story.policy);

    const form = async (
      projectId: string,
      documentType: FormDocumentType,
      more: Partial<NewForm> = {},
    ) =>
      (
        await saved(
          forms.form(dana, {
            projectId,
            documentType,
            name: documentType,
            enabled: true,
            ...more,
          }),
        )
      ).id;
    const library = async (name: string): Promise<string> =>
      (await api.debrisType.findFirstOrThrow({ where: { name } })).id;
    const entry = async (formId: string, name: string, reduced = false) => {
      const grinding = await api.reductionMethod.findFirstOrThrow({ where: { name: 'Grinding' } });
      await saved(
        forms.debrisType(dana, {
          formId,
          debrisTypeId: await library(name),
          reduced,
          ...(reduced ? { reductionMethodId: grinding.id } : {}),
          hiddenOnPhones: false,
        }),
      );
    };
    const p1Load = await form(p1, 'LOAD');
    await entry(p1Load, 'Vegetative');
    await entry(p1Load, 'C&D');
    const p1HaulOut = await form(p1, 'HAUL_OUT');
    await saved(lists.debrisType(dana, 'Mulch'));
    await entry(p1HaulOut, 'Mulch', true);
    await form(p1, 'UNIT_RATE');
    await form(p1, 'DROP_OFF_LOG');
    const p1Incident = await form(p1, 'INCIDENT', { incidentOffers: ['CERT_NUMBER'] });
    // The firm's own field on P1's incident form: a police report number, required.
    const incidentFields = await saved(
      forms.ownFields(dana, p1Incident, [
        { id: 'police-report', label: 'Police report number', type: 'TEXT', required: true },
      ]),
    );
    const p2Load = await form(p2, 'LOAD');
    await entry(p2Load, 'Vegetative');
    await form(p2, 'ROE', { gpsRequired: false });
    await form(p2, 'SURVEY');
    await saved(projects.fieldTag(dana, p1, 'Mixed'));

    const hangers = await api.kindOfWork.findFirstOrThrow({ where: { name: 'Hangers' } });
    const hangerRemoval = await saved(
      payItems.payItem(dana, {
        projectId: p1,
        code: 'HNG-RMV-EA',
        description: 'Hanger removal',
        payableTypeId: (await api.payableType.findFirstOrThrow({ where: { name: 'Hangers' } })).id,
        unit: 'EA',
        kindOfWorkId: hangers.id,
        bandFrom: null,
        bandTo: null,
        countIsAlwaysOne: true,
        gpsRequired: false,
        measurementRequired: false,
        decimalsAllowed: false,
        photosRequired: true,
        monitorMayMarkIneligible: false,
        quantityFromCarriedTickets: false,
        crewTimeConversion: null,
        crewDayHours: null,
        rates: [{ primeId: coastline, rate: '68.00' }],
      }),
    );

    // Saturday's certifying, on Sam's phone: P1's dump trailer 730415 and Rivera's self-loader
    // 730416; a pup trailer whose tag ran out on 30 September, 730420; and P2's own 730416.
    const certifying: Record<string, string> = {};
    for (const projectId of [p1, p2]) {
      certifying[projectId] = await assigned(api, clock, luis, {
        workDate: '2026-10-10',
        projectId,
        personId: person('Sam Grant'),
        certifying: true,
        deviceId: device('P1-HO-TDSR'),
      });
    }
    const dumpTrailer = await api.vehicleType.findFirstOrThrow({
      where: { name: 'Hydraulic Dump Trailer' },
    });
    const certify = async (
      projectId: string,
      certNumber: string,
      more: { tagExpiry?: string } = {},
    ) => {
      clock.advance(20);
      return saved(
        certifications.certify({
          id: uuidv7(clock.now()),
          projectId,
          certNumber,
          kind: 'CONTAINER',
          primeId: coastline,
          vehicleTypeId: dumpTrailer.id,
          boxes: [{ shape: 'RECTANGLE', sign: 'ADD', length: 360, width: 96, height: 72 }],
          certifiedAt: clock.now(),
          deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, clock.now()),
          certifiedById: person('Sam Grant'),
          deviceId: device('P1-HO-TDSR'),
          ...(certifying[projectId] === undefined ? {} : { assignmentId: certifying[projectId] }),
          ...more,
        }),
      );
    };
    const certified = {
      c730415: (await certify(p1, '730415', { tagExpiry: '2027-06-30' })).id,
      c730416: (await certify(p1, '730416', { tagExpiry: '2027-03-31' })).id,
      c730420: (await certify(p1, '730420', { tagExpiry: '2026-09-30' })).id,
      p2c730416: (await certify(p2, '730416', { tagExpiry: '2027-03-31' })).id,
    };

    // ------------------------------------------------------------------------------------------
    // The dispatch board, a day at a time, and the phones that take it.
    interface Planned {
      readonly monitor: string;
      readonly phone: string;
      readonly projectId: string;
      readonly kinds: readonly FieldEventKind[];
      readonly forms?: NewAssignment['formDocumentTypes'];
      readonly siteId?: string;
      readonly unitRate?: boolean;
    }
    const board = async (workDate: string, people: readonly Planned[]) => {
      const assignments: Record<string, string> = {};
      for (const planned of people) {
        assignments[`${planned.phone} ${planned.monitor}`] = await assigned(api, clock, luis, {
          workDate,
          projectId: planned.projectId,
          personId: person(planned.monitor),
          fieldEventKinds: [...planned.kinds],
          formDocumentTypes: [...(planned.forms ?? [])],
          siteId: planned.siteId ?? null,
          deviceId: device(planned.phone),
          payItemIds: planned.unitRate === true ? [hangerRemoval.id] : [],
        });
      }
      return assignments;
    };
    const setupOf = async (planned: Planned, expected: string | undefined) => {
      const deviceId = device(planned.phone);
      // Monitor ID and password, online: the phone takes the day's assignment (ADR-444).
      const assignmentId = await taken(story, monitor(planned.monitor), deviceId);
      if (assignmentId !== expected) {
        throw new Error(`${planned.phone} took another assignment than the one expected.`);
      }
      return {
        name: planned.phone,
        deviceId,
        monitorId: person(planned.monitor),
        assignmentId,
        projectId: planned.projectId,
        ...(planned.siteId === undefined ? {} : { siteId: planned.siteId }),
        lists: await story.lists.held({ assignmentId, deviceId }),
        timeZone,
      };
    };
    const block = async (phone: string, monitor: string, projectId: string, series: NumberSeries) =>
      intake.topUp({ person: person(monitor), deviceId: device(phone) }, [
        { projectId, series, lastUsedNumber: null },
      ]);
    // The answers a phone was given at its latest sync, in the order sent.
    const sent = new Map<SimulatedDevice, number>();
    const syncing = async (phone: SimulatedDevice): Promise<SyncAnswer[]> => {
      await phone.sync(intake);
      const from = sent.get(phone) ?? 0;
      sent.set(phone, phone.answers.length);
      return phone.answers.slice(from).map((one) => one.answer);
    };
    const onServer = async (where: object = {}): Promise<string[]> => {
      const events = await api.fieldEvent.findMany({
        where,
        orderBy: [{ ticketNumber: 'asc' }, { splitSuffix: 'asc' }, { endedAt: 'asc' }],
      });
      return events.map(
        (event) =>
          `${event.ticketNumber}${event.splitSuffix === '' ? '' : `-${event.splitSuffix}`} ${short[event.kind]} ${event.status}`,
      );
    };
    const users = new Map((await api.user.findMany()).map((user) => [user.id, user.name]));
    const deviceNames = new Map((await api.device.findMany()).map((each) => [each.id, each.name]));

    // ------------------------------------------------------------------------------------------
    story.at(
      monday('06:30'),
      'Monday at the yard, online: Luis writes the board; each phone that makes numbers takes a block; each monitor signs in',
    );
    const mondayPlan: readonly Planned[] = [
      { monitor: 'Ana Brooks', phone: 'P1-COL-1', projectId: p1, kinds: ['COLLECTION'] },
      {
        monitor: 'Kim Nguyen',
        phone: 'P1-TWR-TDSR',
        projectId: p1,
        kinds: ['DISPOSAL'],
        forms: ['DROP_OFF_LOG'],
        siteId: tdsr,
      },
      {
        monitor: 'Jo Kim',
        phone: 'P1-UR-1',
        projectId: p1,
        kinds: ['UNIT_RATE'],
        forms: ['INCIDENT'],
        unitRate: true,
      },
    ];
    const samOnAnasPhone: Planned = {
      monitor: 'Sam Grant',
      phone: 'P1-COL-1',
      projectId: p1,
      kinds: ['COLLECTION'],
    };
    const mondays = await board('2026-10-12', [...mondayPlan, samOnAnasPhone]);
    await block('P1-COL-1', 'Ana Brooks', p1, 'LOAD');
    await block('P1-UR-1', 'Jo Kim', p1, 'UNIT_RATE');
    const [anaPlan, kimPlan, joPlan] = mondayPlan;
    if (anaPlan === undefined || kimPlan === undefined || joPlan === undefined) {
      throw new Error('Monday’s board is short.');
    }
    const ana = story.phone(await setupOf(anaPlan, mondays['P1-COL-1 Ana Brooks']));
    const kim = story.phone(await setupOf(kimPlan, mondays['P1-TWR-TDSR Kim Nguyen']));
    const jo = story.phone(await setupOf(joPlan, mondays['P1-UR-1 Jo Kim']));
    // Tariq has no assignment: his supervisor sets P1-TWR-LF up on the spot with the master
    // passcode, an unplanned assignment made on the phone (ADR-240), which the phone reports
    // and the API's `UnplannedAssignments` receives (ADR-457).
    const unplanned = await unplannedOn(api, clock, device('P1-TWR-LF'), timeZone, {
      projectId: p1,
      personId: person('Tariq Patel'),
      fieldEventKinds: ['DISPOSAL', 'HAUL_OUT_DISPOSAL'],
      siteId: landfill,
    });
    const tariqPlan: Planned = {
      monitor: 'Tariq Patel',
      phone: 'P1-TWR-LF',
      projectId: p1,
      kinds: ['DISPOSAL', 'HAUL_OUT_DISPOSAL'],
      siteId: landfill,
    };
    const lost = story.phone(await setupOf(tariqPlan, unplanned));
    // 101001…101019 are tickets this story doesn't tell: Scenario A's loads are 101020 and 101021.
    ana.passOver('LOAD', 101019);
    const vegetative = { debrisType: 'Vegetative' } as const;

    story.at(monday('09:14'), 'Ana scans Rivera’s self-loader, 730416, at 22 Elm St');
    const col101020 = ana.begin('LOAD', 'COLLECTION', '730416');
    story.at(monday('09:40'), 'Loaded: Ana picks Vegetative; her phone shows 101020');
    done(
      ana.complete(col101020, {
        number: made,
        ...vegetative,
        address: '22 Elm St',
        addressSource: 'TYPED',
      }),
    );
    const pile = ana.photograph({ of: { kind: 'FIELD_EVENT', id: col101020 } });
    story.at(monday('09:55'), 'Jo scans the bucket truck crew, 730417, and records a hanger');
    const hanger = { number: made, payableType: 'Hangers', count: 1 } as const;
    const urt301001 = jo.begin('UNIT_RATE', 'UNIT_RATE', '730417');
    clock.advance(5);
    done(jo.complete(urt301001, hanger));
    // She starts another by mistake and cancels it: it stays on her phone and took no number.
    const mistake = jo.begin('UNIT_RATE', 'UNIT_RATE');
    jo.cancel(mistake);
    story.at(monday('10:10'), 'Kim scans 730416 at the Marsh Road TDSR tower');
    const dis1022 = kim.begin('LOAD', 'DISPOSAL', '730416');
    story.at(monday('10:22'), 'Kim calls 70% and scans 101020 off the truck’s copy');
    const first = done(
      kim.complete(dis1022, {
        number: scanned('101020'),
        ...vegetative,
        loadCall: 70,
        endLatitude: '39.09000000',
        endLongitude: '-75.62000000',
      }),
    );
    story.at(monday('10:51'), 'Ana scans 730416 again, at 40 Birch Ln');
    const col101021 = ana.begin('LOAD', 'COLLECTION', '730416');
    story.at(monday('11:05'), 'Ana completes it: 101021');
    done(
      ana.complete(col101021, {
        number: made,
        ...vegetative,
        address: '40 Birch Ln',
        addressSource: 'TYPED',
      }),
    );
    story.at(monday('11:28'), 'The self-loader is back at the tower; Kim scans the badge');
    const dis1140 = kim.begin('LOAD', 'DISPOSAL', '730416');
    story.at(
      monday('11:40'),
      'The driver hands over a stale copy: Kim calls 65% and scans 101020 again. It should have been 101021',
    );
    const second = done(
      kim.complete(dis1140, {
        number: scanned('101020'),
        ...vegetative,
        loadCall: 65,
        endLatitude: '39.09000000',
        endLongitude: '-75.62000000',
      }),
    );
    const emptyBed = kim.photograph({ of: { kind: 'FIELD_EVENT', id: dis1140 } });

    // ------------------------------------------------------------------------------------------
    story.at(
      monday('12:05'),
      'The tower’s phone finds signal and syncs: its records first, its photograph after',
    );
    // A sync begins with the phone's proof of itself (ARCHITECTURE §9 (1)): it asks for a
    // challenge, signs it with the key only it holds, and sends both back. What comes of the
    // proof, and of the same signed answer sent a second time.
    const provesItself = async (name: string): Promise<[boolean, string]> => {
      const phone = enrolled[name];
      if (phone === undefined) throw new Error(`No phone ${name}`);
      const { challenge } = story.proofs.challenge(phone.id);
      const signature = phone.key.signed(challenge);
      const first = await story.proofs.prove(phone.id, challenge, signature);
      const again = await story.proofs.prove(phone.id, challenge, signature);
      return [first.proven, again.proven ? 'proven again' : again.why];
    };
    story.check(
      'AC-05-03, AC-10-45 the sync begins with the phone’s proof: P1-TWR-TDSR signs the challenge the server has just made with the key it made at enrolment; the same signed answer sent again proves nothing',
      await provesItself('P1-TWR-TDSR'),
      [true, 'SPENT'],
    );
    const noon = kim.waitingRecords;
    const atNoon = await syncing(kim);
    story.check(
      'AC-05-45, AC-05-17, AC-05-20 each record gets its own answer: the 10:22 disposal saved, the 11:40 one not saved (quarantined, with the reason), and its photograph’s record saved all the same',
      atNoon,
      [
        { answer: 'SAVED', id: first.id, notes: [] },
        {
          answer: 'QUARANTINED',
          id: second.id,
          reason: 'DUPLICATE_FIELD_EVENT',
          message:
            'Ticket 101020: this ticket already has a disposal. Not saved: kept in quarantine for review.',
          heldBy: first.id,
        },
        { answer: 'SAVED', id: emptyBed.id, notes: [] },
      ],
    );
    story.check(
      'AC-05-20 Kim’s phone shows the 11:40 disposal as not saved; it is never swallowed',
      kim.notSaved.map((one) => [idOf(one.sent), one.answer.answer]),
      [[second.id, 'QUARANTINED']],
    );
    const quarantine = () => api.quarantinedRecord.findMany({ orderBy: { receivedAt: 'asc' } });
    const [kept] = await quarantine();
    const payload = (kept?.payload ?? {}) as unknown as {
      record?: string;
      fieldEvent?: Record<string, unknown>;
    };
    story.check(
      'AC-05-18 it is kept in full: the record exactly as the phone sent it, under its phone-made id, with its project, its phone, Kim, the reason, the 10:22 disposal that holds the number, and when the server received it',
      [
        kept?.id === second.id,
        projectNames.get(kept?.projectId ?? ''),
        deviceNames.get(kept?.deviceId ?? ''),
        users.get(kept?.monitorId ?? ''),
        kept?.reason,
        kept?.holdingEventId === first.id,
        kept === undefined ? null : projectTime(timeZone, kept.receivedAt),
        payload.record,
        payload.fieldEvent,
      ],
      [
        true,
        'P1',
        'P1-TWR-TDSR',
        'Kim Nguyen',
        'DUPLICATE_FIELD_EVENT',
        true,
        'Mon 12 Oct 12:05',
        'FIELD_EVENT',
        JSON.parse(JSON.stringify(second)),
      ],
    );
    story.check(
      'AC-05-18 as sent: the 11:40 times, the tower’s GPS, cert 730416, Vegetative, 65%, the number as scanned',
      [
        payload.fieldEvent?.['startedAt'],
        payload.fieldEvent?.['endedAt'],
        payload.fieldEvent?.['endLatitude'],
        payload.fieldEvent?.['certNumber'],
        payload.fieldEvent?.['loadCall'],
        payload.fieldEvent?.['ticketNumber'],
        payload.fieldEvent?.['numberTyped'],
      ],
      [
        new Date(monday('11:28')).toISOString(),
        new Date(monday('11:40')).toISOString(),
        '39.09000000',
        '730416',
        65,
        '101020',
        false,
      ],
    );
    const holder = async () => {
      const event = await api.fieldEvent.findUniqueOrThrow({ where: { id: first.id } });
      return [projectTime(timeZone, event.endedAt), event.loadCall, event.status];
    };
    story.check(
      'AC-05-19, AC-05-26 never dropped and never merged: the 10:22 disposal is as it was, and the server holds one disposal on 101020, not two',
      [await holder(), await onServer()],
      [['Mon 12 Oct 10:22', 70, 'PENDING'], ['101020 DIS PENDING']],
    );
    const photosOf = async () =>
      (await api.photo.findMany({ orderBy: { capturedAt: 'asc' } })).map((photo) => [
        photo.id === pile.id ? 'the pile at 22 Elm St' : 'the empty bed at 11:40',
        photo.fieldEventId === null ? null : 'a field event',
        photo.quarantinedRecordId === null ? null : 'the quarantined record',
        photo.originalSha256 === (photo.id === pile.id ? pile : emptyBed).originalSha256,
        photo.label,
        photo.archivedAt,
      ]);
    story.check(
      'AC-05-22, AC-05-09 the quarantined disposal’s photograph belongs to the quarantined record while it waits, and to nothing else; its record carries the fingerprint taken at capture, and neither of the back office’s marks',
      await photosOf(),
      [['the empty bed at 11:40', null, 'the quarantined record', true, null, null]],
    );

    story.at(
      monday('12:07'),
      'The connection dropped before the answers came back: the phone sends the same three records again',
    );
    const again: SyncAnswer[] = [];
    for (const record of noon) again.push(await intake.receive(record));
    story.check(
      'AC-05-12, AC-05-15 a retry is the same record: the 10:22 disposal is answered "already saved", never taken for a duplicate; the 11:40 one is still one quarantined record and still not "saved"',
      [
        told(again),
        await api.fieldEvent.count(),
        (await quarantine()).length,
        await api.photo.count(),
      ],
      [['ALREADY_SAVED', 'QUARANTINED', 'ALREADY_SAVED'], 1, 1, 1],
    );
    story.check(
      'AC-05-43 each kept the time the server received it the first time, 12:05 by the server’s clock, beside the phone’s own times',
      (await api.fieldEvent.findMany()).map((event) => [
        projectTime(timeZone, event.endedAt),
        projectTime(timeZone, event.receivedAt),
        event.deviceUtcOffsetMinutes,
      ]),
      [['Mon 12 Oct 10:22', 'Mon 12 Oct 12:05', -240]],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      monday('13:00'),
      'P1-COL-1 passes from Ana to Sam, Ana’s morning still on it: Sam signs in and the phone takes his assignment',
    );
    ana.signIn(await setupOf(samOnAnasPhone, mondays['P1-COL-1 Sam Grant']));
    story.at(monday('13:20'), 'Sam scans the dump trailer, 730415');
    const col101022 = ana.begin('LOAD', 'COLLECTION', '730415');
    story.at(monday('13:45'), 'Sam completes it: the phone carries on, 101022');
    done(ana.complete(col101022, { number: made, ...vegetative }));
    story.at(monday('14:05'), 'Kim scans 730415 at the tower');
    const dis101022 = kim.begin('LOAD', 'DISPOSAL', '730415');
    story.at(monday('14:20'), 'Kim calls 80% and scans 101022');
    done(kim.complete(dis101022, { number: scanned('101022'), ...vegetative, loadCall: 80 }));

    story.at(monday('14:30'), 'Jo works down Heron St: twenty-four more hangers, a ticket each');
    for (let tree = 0; tree < 24; tree += 1) {
      const id = jo.begin('UNIT_RATE', 'UNIT_RATE');
      clock.advance(3);
      done(jo.complete(id, hanger));
      clock.advance(2);
    }

    story.at(monday('17:10'), 'At Bayline County Landfill Tariq scans 730416 on P1-TWR-LF');
    const lostEarly = lost.begin('LOAD', 'DISPOSAL', '730416');
    story.at(
      monday('17:40'),
      'Tariq calls 75% and scans 101021: the load collected at 40 Birch Ln',
    );
    done(lost.complete(lostEarly, { number: scanned('101021'), ...vegetative, loadCall: 75 }));

    story.at(monday('17:50'), 'At the yard the phones sync. P1-TWR-LF isn’t among them');
    const kimEvening = await syncing(kim);
    story.check(
      'AC-05-01 the tower’s phone synced at 12:05 and syncs again now: only what it recorded since goes, and it never had to be handed in',
      told(kimEvening),
      ['SAVED'],
    );
    story.check(
      'AC-05-49 the disposals on 101020 and 101022 are saved before either collection has reached the server: each waits, PENDING, never refused',
      await onServer(),
      ['101020 DIS PENDING', '101022 DIS PENDING'],
    );
    const collections = await syncing(ana);
    story.check(
      'AC-05-06, AC-05-30 P1-COL-1 sends Ana’s two collections, Sam’s one and Ana’s photograph: all saved; a collection is never a duplicate of its ticket’s disposal, whichever arrived first',
      told(collections),
      ['SAVED', 'SAVED', 'SAVED', 'SAVED'],
    );
    const whose = async (where: object) =>
      (
        await api.auditRecord.findMany({
          where: { tableName: 'field_event', ...where },
          orderBy: { id: 'asc' },
        })
      ).map((record) =>
        [
          users.get(record.actorId ?? ''),
          deviceNames.get(record.deviceId ?? ''),
          record.source,
          record.operation,
        ].join(' · '),
      );
    story.check(
      'AC-05-06 each is its own monitor’s: Ana’s are written as Ana and Sam’s as Sam, from that one phone, and the database audited them so',
      await whose({ recordId: { in: [col101020, col101021, col101022] } }),
      [
        'Ana Brooks · P1-COL-1 · DEVICE · INSERT',
        'Ana Brooks · P1-COL-1 · DEVICE · INSERT',
        'Sam Grant · P1-COL-1 · DEVICE · INSERT',
      ],
    );

    // Jo's twenty-five. The connection drops after the twelfth: the server has twelve, the phone
    // heard nothing and sends all twenty-five again.
    const jos = jo.waitingRecords;
    for (const record of jos.slice(0, 12)) await intake.receive(record);
    const josAnswers = await syncing(jo);
    const count = (answers: readonly SyncAnswer[], answer: SyncAnswer['answer']): number =>
      answers.filter((one) => one.answer === answer).length;
    story.check(
      'AC-05-13 a sync of 25 field events that dropped after the twelfth, sent again whole: twelve are "already saved", thirteen "saved", and the server holds 25',
      [
        jos.length,
        count(josAnswers, 'ALREADY_SAVED'),
        count(josAnswers, 'SAVED'),
        await api.fieldEvent.count({ where: { kind: 'UNIT_RATE' } }),
      ],
      [25, 12, 13, 25],
    );
    story.check(
      'AC-05-07 the field event Jo started by mistake and cancelled is not among what her phone sent: it is still on the phone, and the server never heard of it',
      [
        jo.cancelled.map((event) => event.id === mistake),
        jos.map(idOf).includes(mistake),
        await api.fieldEvent.findUnique({ where: { id: mistake } }),
      ],
      [[true], false, null],
    );
    story.check(
      'AC-05-11 every record kept the id its phone made: the server’s ids are exactly the phones’',
      [
        (await api.fieldEvent.findMany({ where: { kind: 'UNIT_RATE' }, orderBy: { id: 'asc' } }))
          .map((event) => event.id)
          .join() === [...jos.map(idOf)].sort().join(),
        (await api.fieldEvent.findUnique({ where: { id: col101020 } }))?.ticketNumber,
      ],
      [true, '101020'],
    );
    story.check(
      'AC-05-21, AC-05-27 that evening ticket 101020 is its collection and its 10:22 disposal; 101021 is its collection alone, PENDING. The quarantined record is no ticket’s field event: nothing renumbered it, paired it or guessed its number',
      [
        await onServer({ workflow: 'LOAD' }),
        (await quarantine()).map((row) => [row.id === second.id, row.resolvedAt, row.resolution]),
        await api.completedLoad.count(),
      ],
      [
        [
          '101020 COL PENDING',
          '101020 DIS PENDING',
          '101021 COL PENDING',
          '101022 COL PENDING',
          '101022 DIS PENDING',
        ],
        [[true, null, null]],
        0,
      ],
    );
    story.check(
      'AC-05-22 Ana’s photograph of the pile is her collection’s; the quarantined disposal’s is still the quarantined record’s',
      await photosOf(),
      [
        ['the pile at 22 Elm St', 'a field event', null, true, null, null],
        ['the empty bed at 11:40', null, 'the quarantined record', true, null, null],
      ],
    );
    const found = async (ids: readonly string[]) => {
      const events = await api.fieldEvent.findMany({
        where: { id: { in: [...ids] } },
        orderBy: { endedAt: 'asc' },
      });
      return events.map((event) => [
        `${event.ticketNumber} ${short[event.kind]}`,
        event.certNumber,
        event.certificationId === certified.c730415
          ? 'P1’s 730415'
          : event.certificationId === certified.c730416
            ? 'P1’s 730416'
            : event.certificationId,
      ]);
    };
    story.check(
      'AC-05-41 the phones sent only the cert number; intake found P1’s certification of that number, and the number as scanned stays on the field event',
      await found([col101020, first.id, col101022]),
      [
        ['101020 COL', '730416', 'P1’s 730416'],
        ['101020 DIS', '730416', 'P1’s 730416'],
        ['101022 COL', '730415', 'P1’s 730415'],
      ],
    );
    const blocks = await intake.topUp(
      { person: person('Sam Grant'), deviceId: device('P1-COL-1') },
      [{ projectId: p1, series: 'LOAD', lastUsedNumber: ana.lastUsedNumber('LOAD') }],
    );
    const unused = (held: typeof blocks): number =>
      held.reduce(
        (sum, each) =>
          sum + each.lastNumber - Math.max(each.firstNumber - 1, each.lastUsedNumber ?? 0),
        0,
      );
    story.check(
      'AC-05-47 P1-COL-1 reports the last number it used, 101022, and is topped up to a full block of 1,000 unused numbers: its first block’s 978, and 22 more',
      [
        blocks.map(
          (each) =>
            `${String(each.firstNumber)}–${String(each.lastNumber)}, last used ${String(each.lastUsedNumber)}`,
        ),
        unused(blocks),
      ],
      [['101001–102000, last used 101022', '102001–102022, last used null'], 1000],
    );

    story.at(
      monday('18:10'),
      'P1-TWR-LF can’t be found. Luis marks it lost; whatever it holds is still to come',
    );
    const removed = await new Phones(api, clock).remove(luis, device('P1-TWR-LF'), {
      status: 'LOST',
    });
    if (!removed.saved) throw new Error(removed.refusal.message);
    story.at(
      monday('18:20'),
      'It is in Tariq’s truck. A late load reaches the landfill: he scans 730415',
    );
    const lostLate = lost.begin('LOAD', 'DISPOSAL', '730415');
    story.at(monday('18:30'), 'Tariq calls 60% and scans 101024');
    done(lost.complete(lostLate, { number: scanned('101024'), ...vegetative, loadCall: 60 }));

    // ------------------------------------------------------------------------------------------
    story.at(
      tuesday('06:30'),
      'Tuesday at the yard: the board, the blocks, the sign-ins. Tariq takes a replacement phone, P1-TWR-LF-2',
    );
    const tuesdayPlan: readonly Planned[] = [
      { monitor: 'Ana Brooks', phone: 'P1-COL-1', projectId: p1, kinds: ['COLLECTION'] },
      {
        monitor: 'Kim Nguyen',
        phone: 'P1-TWR-TDSR',
        projectId: p1,
        kinds: ['DISPOSAL'],
        forms: ['DROP_OFF_LOG'],
        siteId: tdsr,
      },
      {
        monitor: 'Tariq Patel',
        phone: 'P1-TWR-LF-2',
        projectId: p1,
        kinds: ['DISPOSAL', 'HAUL_OUT_DISPOSAL'],
        siteId: landfill,
      },
      {
        monitor: 'Sam Grant',
        phone: 'P1-HO-TDSR',
        projectId: p1,
        kinds: ['HAUL_OUT_COLLECTION'],
        siteId: tdsr,
      },
      {
        monitor: 'Jo Kim',
        phone: 'P1-UR-1',
        projectId: p1,
        kinds: ['UNIT_RATE'],
        forms: ['INCIDENT'],
        unitRate: true,
      },
    ];
    const tuesdays = await board('2026-10-13', tuesdayPlan);
    await block('P1-HO-TDSR', 'Sam Grant', p1, 'HAUL_OUT');
    const [anaTue, kimTue, tariqTue, samTue, joTue] = tuesdayPlan;
    if (
      anaTue === undefined ||
      kimTue === undefined ||
      tariqTue === undefined ||
      samTue === undefined ||
      joTue === undefined
    ) {
      throw new Error('Tuesday’s board is short.');
    }
    ana.signIn(await setupOf(anaTue, tuesdays['P1-COL-1 Ana Brooks']));
    kim.signIn(await setupOf(kimTue, tuesdays['P1-TWR-TDSR Kim Nguyen']));
    jo.signIn(await setupOf(joTue, tuesdays['P1-UR-1 Jo Kim']));
    const tariq = story.phone(await setupOf(tariqTue, tuesdays['P1-TWR-LF-2 Tariq Patel']));
    const sam = story.phone(await setupOf(samTue, tuesdays['P1-HO-TDSR Sam Grant']));

    // What each Tuesday record should be answered, by its id, for the burst at the yard.
    const expected = new Map<string, SyncAnswer['answer']>();
    const expecting = <T extends { readonly id: string }>(
      record: T,
      answer: SyncAnswer['answer'] = 'SAVED',
    ): T => {
      expected.set(record.id, answer);
      return record;
    };
    const quick = (
      phone: SimulatedDevice,
      workflow: 'LOAD' | 'HAUL_OUT' | 'UNIT_RATE',
      kind: FieldEventKind,
      badge: string | undefined,
      completion: Completion,
      answer: SyncAnswer['answer'] = 'SAVED',
    ): RecordedEvent => {
      const id = phone.begin(workflow, kind, badge);
      clock.advance(10);
      const event = done(phone.complete(id, completion));
      clock.advance(2);
      return expecting(event, answer);
    };

    story.at(
      tuesday('07:30'),
      'Ana’s morning. A second collection is recorded on 101020; a pile is issued two numbers, 101030 and 101031, on overlapping loads of 730415',
    );
    const dupCollection = quick(
      ana,
      'LOAD',
      'COLLECTION',
      '730416',
      { number: scanned('101020'), ...vegetative },
      'QUARANTINED',
    );
    ana.passOver('LOAD', 101029);
    const phantomA = ana.begin('LOAD', 'COLLECTION', '730415');
    clock.advance(2);
    const phantomB = ana.begin('LOAD', 'COLLECTION', '730415');
    clock.advance(28);
    const c101030 = expecting(done(ana.complete(phantomA, { number: made, ...vegetative })));
    const c101031 = expecting(done(ana.complete(phantomB, { number: made, ...vegetative })));
    story.at(tuesday('08:30'), 'A tandem: Ana collects 101032 on 730415 and 101033 on 730416');
    quick(ana, 'LOAD', 'COLLECTION', '730415', { number: made, ...vegetative });
    quick(ana, 'LOAD', 'COLLECTION', '730416', { number: made, ...vegetative });
    story.at(
      tuesday('09:00'),
      'The pup trailer whose tag ran out on 30 September, 730420; then a badge nobody certified, 730499',
    );
    const expiredTag = quick(ana, 'LOAD', 'COLLECTION', '730420', { number: made, ...vegetative });
    const noCertification = quick(ana, 'LOAD', 'COLLECTION', '730499', {
      number: made,
      ...vegetative,
    });
    story.at(
      tuesday('09:30'),
      'Records with a gap: no debris type picked; half a GPS fix; a latitude past 90',
    );
    const noDebrisType = quick(ana, 'LOAD', 'COLLECTION', '730415', { number: made });
    const halfFix = quick(ana, 'LOAD', 'COLLECTION', '730415', {
      number: made,
      ...vegetative,
      endLatitude: '39.13850000',
    });
    const pastNinety = quick(ana, 'LOAD', 'COLLECTION', '730415', {
      number: made,
      ...vegetative,
      endLatitude: '91.20000000',
      endLongitude: '-75.55370000',
    });
    // A phone never lets these through; they reach the server broken anyway (ADR-329). Each is
    // its own record, told as Ana's phone would send it.
    const broken = (number: string, more: Partial<RecordedEvent>): RecordedEvent => {
      clock.advance(1);
      return expecting({
        ...noDebrisType,
        formDebrisTypeId: c101030.formDebrisTypeId,
        id: uuidv7(clock.now()),
        ticketNumber: number,
        ...more,
      });
    };
    const typedNoReason = broken('101090', { numberTyped: true, numberTypedReasonId: null });
    const endsBeforeItStarts = broken('101091', {
      startedAt: new Date(tuesday('09:50')),
      endedAt: new Date(tuesday('09:20')),
    });
    const outsideTheWindow = broken('101092', {
      startedAt: new Date('2027-02-03T09:00:00-05:00'),
      endedAt: new Date('2027-02-03T09:30:00-05:00'),
      deviceUtcOffsetMinutes: -300,
    });
    const notDigits = broken('1O1O93', {});
    const brokenRecords = [typedNoReason, endsBeforeItStarts, outsideTheWindow, notDigits];

    story.at(tuesday('10:30'), 'Sam, at the TDSR: a haul-out of mulch, 201001, on 730415');
    const mulch = { debrisType: 'Mulch' } as const;
    const hoc = quick(sam, 'HAUL_OUT', 'HAUL_OUT_COLLECTION', '730415', {
      number: made,
      ...mulch,
      loadCall: 90,
    });
    const dupHoc = quick(
      sam,
      'HAUL_OUT',
      'HAUL_OUT_COLLECTION',
      '730415',
      { number: scanned('201001'), ...mulch, loadCall: 85 },
      'QUARANTINED',
    );
    // A haul-out that carries a load's number: a number is its workflow's.
    quick(sam, 'HAUL_OUT', 'HAUL_OUT_COLLECTION', '730415', {
      number: scanned('101020'),
      ...mulch,
      loadCall: 40,
    });

    story.at(tuesday('11:10'), 'Tariq, at the landfill on the replacement phone');
    quick(tariq, 'LOAD', 'DISPOSAL', '730415', {
      number: scanned('101030'),
      ...vegetative,
      loadCall: 70,
    });
    const noLoadCall = quick(tariq, 'LOAD', 'DISPOSAL', '730415', {
      number: scanned('101031'),
      ...vegetative,
    });
    story.at(
      tuesday('11:40'),
      'The tandem crosses the scale once: receipt BCL-88241, copied by hand, for both its disposals',
    );
    const front = tariq.begin('LOAD', 'DISPOSAL', '730415');
    const rear = tariq.begin('LOAD', 'DISPOSAL', '730416');
    clock.advance(12);
    const frontDisposal = expecting(
      done(
        tariq.complete(front, {
          number: scanned('101032'),
          ...vegetative,
          scaleReceipt: {
            receiptNumber: 'BCL-88241',
            grossWeightLb: 62400,
            tareWeightLb: 28200,
            netWeightLb: 34200,
            netWeightTons: 17.1,
          },
        }),
      ),
    );
    const rearDisposal = expecting(
      done(
        tariq.complete(rear, {
          number: scanned('101033'),
          ...vegetative,
          sameScaleReceiptAs: front,
        }),
      ),
    );
    story.at(
      tuesday('12:30'),
      'The haul-out reaches the landfill: Tariq scans 201001 and copies receipt CCL-51207; an hour on the same barcode is scanned again, with another slip numbered CCL-51207',
    );
    const slip = { receiptNumber: 'CCL-51207', netWeightTons: 24 } as const;
    const hod = quick(tariq, 'HAUL_OUT', 'HAUL_OUT_DISPOSAL', '730415', {
      number: scanned('201001'),
      ...mulch,
      scaleReceipt: slip,
    });
    clock.advance(50);
    const dupHod = quick(
      tariq,
      'HAUL_OUT',
      'HAUL_OUT_DISPOSAL',
      '730415',
      { number: scanned('201001'), ...mulch, scaleReceipt: slip },
      'QUARANTINED',
    );
    for (const waiting of tariq.waitingRecords) {
      if (waiting.record === 'SCALE_RECEIPT') expecting(waiting.scaleReceipt);
    }

    story.at(tuesday('14:00'), 'Jo: a second ticket is recorded on 301001; then two incidents');
    const dupUnitRate = quick(
      jo,
      'UNIT_RATE',
      'UNIT_RATE',
      '730417',
      { number: scanned('301001'), payableType: 'Hangers', count: 1 },
      'QUARANTINED',
    );
    const incident = expecting(
      jo.incident({ type: 'Property damage', address: '22 Elm St', certNumber: '730416' }),
    );
    story.at(
      tuesday('15:20'),
      'Kim logs a resident’s drop-off at Marsh Road TDSR, then the pup trailer, 730420, reaches her tower',
    );
    const dropOff = kim.dropOffLog({ residentName: 'Carl Jensen', originAddress: '14 Heron St' });
    const kimTuesday = kim.begin('LOAD', 'DISPOSAL', '730420');
    clock.advance(15);
    const kimDisposal = done(
      kim.complete(kimTuesday, {
        number: scanned(expiredTag.ticketNumber),
        ...vegetative,
        loadCall: 55,
      }),
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      tuesday('18:30'),
      'A quiet afternoon, then every phone at the yard syncs at once. P1-TWR-TDSR’s battery is flat: its day stays on it',
    );
    const burst = await Promise.all([
      syncing(ana),
      syncing(tariq),
      syncing(sam),
      syncing(jo),
      // The records that reached the server broken, each on its own connection.
      Promise.all(
        brokenRecords.map((fieldEvent) => intake.receive({ record: 'FIELD_EVENT', fieldEvent })),
      ),
    ]);
    const everyAnswer = burst.flat();
    const [, , samsAnswers, josBurst] = burst;
    story.check(
      'AC-05-51 the burst: every record of every phone is answered, each as it should be, none lost and none stored twice',
      [
        everyAnswer.length,
        everyAnswer.filter((one) => expected.get(one.id) !== one.answer).map((one) => one.id),
        count(everyAnswer, 'SAVED'),
        count(everyAnswer, 'QUARANTINED'),
        count(everyAnswer, 'ALREADY_SAVED'),
      ],
      [expected.size, [], expected.size - 4, 4, 0],
    );
    const waitingRoom = async () => {
      const rows = await api.quarantinedRecord.findMany({ orderBy: { id: 'asc' } });
      const holders = await api.fieldEvent.findMany({
        where: {
          id: {
            in: rows.flatMap((row) => (row.holdingEventId === null ? [] : [row.holdingEventId])),
          },
        },
      });
      return rows
        .map((row) => {
          const sentRecord = row.payload as unknown as {
            fieldEvent?: { ticketNumber?: string; kind?: FieldEventKind; splitSuffix?: string };
            roe?: { roeNumber?: string };
          };
          const holding = holders.find((event) => event.id === row.holdingEventId);
          return sentRecord.fieldEvent === undefined
            ? `ROE ${String(sentRecord.roe?.roeNumber)} · ${row.reason} · ${String(projectNames.get(row.projectId))}`
            : [
                `${String(sentRecord.fieldEvent.ticketNumber)}${sentRecord.fieldEvent.splitSuffix ? `-${sentRecord.fieldEvent.splitSuffix}` : ''} ${short[sentRecord.fieldEvent.kind ?? 'COLLECTION']}`,
                row.reason,
                users.get(row.monitorId),
                `held by the ${holding === undefined ? '?' : short[holding.kind]} of ${projectTime(timeZone, holding?.endedAt ?? row.receivedAt).slice(-5)}`,
              ].join(' · ');
        })
        .sort();
    };
    story.check(
      'AC-05-24 the rule holds for every kind: a second collection on 101020, a second haul-out collection and a second haul-out disposal on 201001 and a second unit rate event on 301001, each a different record, wait in quarantine beside Monday’s disposal',
      await waitingRoom(),
      [
        '101020 COL · DUPLICATE_FIELD_EVENT · Ana Brooks · held by the COL of 09:40',
        '101020 DIS · DUPLICATE_FIELD_EVENT · Kim Nguyen · held by the DIS of 10:22',
        `201001 HOC · DUPLICATE_FIELD_EVENT · Sam Grant · held by the HOC of ${projectTime(timeZone, hoc.endedAt).slice(-5)}`,
        `201001 HOD · DUPLICATE_FIELD_EVENT · Tariq Patel · held by the HOD of ${projectTime(timeZone, hod.endedAt).slice(-5)}`,
        '301001 URT · DUPLICATE_FIELD_EVENT · Jo Kim · held by the URT of 10:00',
      ],
    );
    story.check(
      'AC-05-45 one quarantined record didn’t stop the records sent with it: Sam’s haul-out collections before and after the duplicate were saved, and Jo’s incident after hers',
      [told(samsAnswers), told(josBurst), [dupCollection, dupHoc, dupHod, dupUnitRate].length],
      [['SAVED', 'QUARANTINED', 'SAVED'], ['QUARANTINED', 'SAVED'], 4],
    );
    story.check(
      'AC-05-31 a haul-out collection numbered 101020 is saved beside load 101020: a number is its project’s and its workflow’s',
      await onServer({ ticketNumber: '101020' }),
      ['101020 COL PENDING', '101020 DIS PENDING', '101020 HOC PENDING'],
    );
    story.check(
      'AC-05-34 two collections on cert 730415 with overlapping loading times, 101030 and 101031, are both saved: two tickets, not a duplicate number. The overlap is the worker’s to flag',
      [
        await onServer({ ticketNumber: { in: ['101030', '101031'] }, kind: 'COLLECTION' }),
        c101031.startedAt.getTime() < c101030.endedAt.getTime(),
      ],
      [['101030 COL PENDING', '101031 COL PENDING'], true],
    );
    const receipts = await api.scaleReceipt.findMany({
      include: { fieldEvents: { orderBy: { ticketNumber: 'asc' } } },
      orderBy: [{ receiptNumber: 'asc' }, { enteredAt: 'asc' }],
    });
    story.check(
      'AC-05-10 the tandem’s receipt BCL-88241 is one record, written before the disposals that point at it; both point at it',
      receipts
        .filter((receipt) => receipt.receiptNumber === 'BCL-88241')
        .map((receipt) => [
          receipt.id === frontDisposal.scaleReceiptId,
          receipt.id === rearDisposal.scaleReceiptId,
          receipt.netWeightTons?.toFixed(4),
          receipt.fieldEvents.map((event) => `${event.ticketNumber} ${short[event.kind]}`),
        ]),
      [[true, true, '17.1000', ['101032 DIS', '101033 DIS']]],
    );
    story.check(
      'AC-05-35 two scale receipts numbered CCL-51207 are both saved: a receipt’s number is never unique and quarantines nothing. The quarantined disposal’s own receipt is saved as its own record, pointed at by no field event',
      receipts
        .filter((receipt) => receipt.receiptNumber === 'CCL-51207')
        .map((receipt) =>
          receipt.fieldEvents.map((event) => `${event.ticketNumber} ${short[event.kind]}`),
        ),
      [['201001 HOD'], []],
    );
    const asKept = async (id: string) => {
      const event = await api.fieldEvent.findUniqueOrThrow({ where: { id } });
      return {
        number: event.ticketNumber,
        status: event.status,
        certification:
          event.certificationId === null
            ? null
            : event.certificationId === certified.c730420
              ? '730420, tag expired 2026-09-30'
              : 'found',
        debrisType: event.formDebrisTypeId === null ? null : 'picked',
        loadCall: event.loadCall,
        typed: [event.numberTyped, event.numberTypedReasonId],
        fix: [event.endLatitude?.toFixed(8) ?? null, event.endLongitude?.toFixed(8) ?? null],
        unreadableGps: event.unreadableGps,
        worked: `${projectTime(timeZone, event.startedAt)} to ${projectTime(timeZone, event.endedAt)}`,
        received: projectTime(timeZone, event.receivedAt),
      };
    };
    const tuesdayNight = 'Tue 13 Oct 18:30';
    story.check(
      'AC-05-36 a collection on a certification whose tag expired, one dated outside P1’s active window and worked later than the server received it: each is received like any other, PENDING; each problem is a flag’s',
      [
        (({ number, status, certification }) => ({ number, status, certification }))(
          await asKept(expiredTag.id),
        ),
        (({ number, status, worked, received }) => ({ number, status, worked, received }))(
          await asKept(outsideTheWindow.id),
        ),
      ],
      [
        {
          number: expiredTag.ticketNumber,
          status: 'PENDING',
          certification: '730420, tag expired 2026-09-30',
        },
        {
          number: '101092',
          status: 'PENDING',
          worked: 'Wed 3 Feb 09:00 to Wed 3 Feb 09:30',
          received: tuesdayNight,
        },
      ],
    );
    story.check(
      'AC-05-37 cert number 730499, which no certification on P1 has: received with the number as scanned and no certification found',
      (({ status, certification }) => ({ status, certification }))(
        await asKept(noCertification.id),
      ),
      { status: 'PENDING', certification: null },
    );
    story.check(
      'AC-05-38 a collection without its debris type, a disposal without its load call, a typed number with no reason, one that ends before it starts and a number that isn’t digits: each kept as sent, PENDING',
      [
        (({ status, debrisType }) => ({ status, debrisType }))(await asKept(noDebrisType.id)),
        (({ status, loadCall }) => ({ status, loadCall }))(await asKept(noLoadCall.id)),
        (({ status, typed }) => ({ status, typed }))(await asKept(typedNoReason.id)),
        (({ status, worked }) => ({ status, worked }))(await asKept(endsBeforeItStarts.id)),
        (({ status, number }) => ({ status, number }))(await asKept(notDigits.id)),
      ],
      [
        { status: 'PENDING', debrisType: null },
        { status: 'PENDING', loadCall: null },
        { status: 'PENDING', typed: [true, null] },
        { status: 'PENDING', worked: 'Tue 13 Oct 09:50 to Tue 13 Oct 09:20' },
        { status: 'PENDING', number: '1O1O93' },
      ],
    );
    story.check(
      'AC-05-39 half a fix, and a latitude past 90: each field event is kept without that fix, with what the phone sent kept beside it for the flag; the phone is told',
      [
        (({ status, fix, unreadableGps }) => ({ status, fix, unreadableGps }))(
          await asKept(halfFix.id),
        ),
        (({ status, fix, unreadableGps }) => ({ status, fix, unreadableGps }))(
          await asKept(pastNinety.id),
        ),
        ana.answers
          .filter((one) => [halfFix.id, pastNinety.id].includes(one.answer.id))
          .map((one) => (one.answer.answer === 'SAVED' ? one.answer.notes : null)),
      ],
      [
        {
          status: 'PENDING',
          fix: [null, null],
          unreadableGps: { end: { latitude: '39.13850000', longitude: null } },
        },
        {
          status: 'PENDING',
          fix: [null, null],
          unreadableGps: { end: { latitude: '91.20000000', longitude: '-75.55370000' } },
        },
        [
          [
            {
              code: 'GPS_UNREADABLE',
              message:
                'GPS unreadable at the end: latitude "39.13850000", longitude none as sent. Kept without that fix.',
            },
          ],
          [
            {
              code: 'GPS_UNREADABLE',
              message:
                'GPS unreadable at the end: latitude "91.20000000", longitude "-75.55370000" as sent. Kept without that fix.',
            },
          ],
        ],
      ],
    );
    const incidentKept = await api.incident.findUniqueOrThrow({ where: { id: incident.id } });
    story.check(
      'the incident names cert 730416: intake found P1’s certification of that number, as it does for a field event',
      [incidentKept.certNumber, incidentKept.certificationId === certified.c730416],
      ['730416', true],
    );

    story.at(
      tuesday('18:40'),
      'Two more incidents arrive with the firm’s own field, a police report number: one answered, one left blank',
    );
    // The harness's phone holds no form definition (BACKLOG C68): the story sends the two as a
    // phone that showed version 1 would, each its own record.
    const another = (address: string, more: object) => {
      clock.advance(1);
      return {
        ...incident,
        id: uuidv7(clock.now()),
        madeAt: clock.now(),
        address,
        certNumber: null,
        formDefinitionId: incidentFields.id,
        ...more,
      };
    };
    const answered = another('40 Birch Ln', { answers: { 'police-report': 'BC-2026-1187' } });
    const blank = another('14 Heron St', { answers: {}, latitude: '39.13850000' });
    const fits = await intake.receive({ record: 'INCIDENT', incident: answered });
    const doesNot = await intake.receive({ record: 'INCIDENT', incident: blank });
    const incidents = await api.incident.findMany({
      where: { id: { in: [answered.id, blank.id] } },
      orderBy: { madeAt: 'asc' },
    });
    const blankAudit = await api.auditRecord.findFirstOrThrow({
      where: { tableName: 'incident', recordId: blank.id },
    });
    story.check(
      'answers are run against the version of the form answered: ones that fit are saved; ones that don’t are the monitor’s record still, saved as sent, and the sender told. A form’s fix that couldn’t be one is dropped, and kept in the audit record’s reason',
      [
        fits,
        doesNot.answer === 'SAVED' ? doesNot.notes.map((note) => note.code) : doesNot.answer,
        incidents.map((row) => [
          row.answers,
          row.formDefinitionId === incidentFields.id,
          row.latitude,
        ]),
        blankAudit.reason,
      ],
      [
        { answer: 'SAVED', id: answered.id, notes: [] },
        ['GPS_UNREADABLE', 'ANSWERS_DO_NOT_FIT'],
        [
          [{ 'police-report': 'BC-2026-1187' }, true, null],
          [{}, true, null],
        ],
        'GPS unreadable: latitude "39.13850000", longitude none as sent. Kept without that fix.',
      ],
    );
    story.check(
      'AC-05-52 Tuesday night the collection on the expired tag’s truck waits with no disposal: its disposal is on the flat phone. It stays PENDING, flagged for nothing, however long it waits',
      await onServer({ ticketNumber: expiredTag.ticketNumber }),
      [`${expiredTag.ticketNumber} COL PENDING`],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      wednesday('06:30'),
      'Wednesday: Lee Morgan and Kim Nguyen work P2. Lee’s phone takes a block of P2’s loads and of its ROE numbers',
    );
    const wednesdayPlan: readonly Planned[] = [
      {
        monitor: 'Lee Morgan',
        phone: 'P2-COL-1',
        projectId: p2,
        kinds: ['COLLECTION'],
        forms: ['ROE', 'SURVEY'],
      },
      {
        monitor: 'Kim Nguyen',
        phone: 'P2-TWR-TDSR',
        projectId: p2,
        kinds: ['DISPOSAL'],
        siteId: p2Tdsr,
      },
    ];
    const wednesdays = await board('2026-10-14', wednesdayPlan);
    await block('P2-COL-1', 'Lee Morgan', p2, 'LOAD');
    await block('P2-COL-1', 'Lee Morgan', p2, 'ROE');
    const [leePlan, kimP2Plan] = wednesdayPlan;
    if (leePlan === undefined || kimP2Plan === undefined)
      throw new Error('Wednesday’s board is short.');
    const lee = story.phone(await setupOf(leePlan, wednesdays['P2-COL-1 Lee Morgan']));
    const kimP2 = story.phone(await setupOf(kimP2Plan, wednesdays['P2-TWR-TDSR Kim Nguyen']));
    // R-0001…R-0006 are ROEs this story doesn't tell: the golden mission's are R-0007 and R-0008.
    lee.passOver('ROE', 6);

    story.at(wednesday('07:10'), 'P1-TWR-TDSR is charged and syncs Tuesday’s work');
    story.check(
      'AC-05-02 a phone can stay dark for days: everything it holds is received whole, Tuesday’s disposal and the drop-off log',
      [
        told(await syncing(kim)),
        await onServer({ ticketNumber: expiredTag.ticketNumber }),
        (
          await api.fieldEvent.findUniqueOrThrow({ where: { id: kimDisposal.id } })
        ).receivedAt.toISOString() === new Date(wednesday('07:10')).toISOString(),
        (await api.dropOffLog.findUniqueOrThrow({ where: { id: dropOff.id } })).residentName,
      ],
      [
        ['SAVED', 'SAVED'],
        [`${expiredTag.ticketNumber} COL PENDING`, `${expiredTag.ticketNumber} DIS PENDING`],
        true,
        'Carl Jensen',
      ],
    );

    story.at(
      wednesday('08:20'),
      'Lee scans Rivera’s self-loader, P2’s own 730416, at 412 Cedar Ct, and answers "split"',
    );
    const propertyA = lee.begin('LOAD', 'COLLECTION', '730416');
    story.at(
      wednesday('08:40'),
      '412 Cedar Ct: Vegetative, 12 CY by eye, ROE R-0007 typed from the paper; the phone shows 102001',
    );
    const collectionA = done(
      lee.complete(propertyA, {
        number: made,
        splitSuffix: 'A',
        ...vegetative,
        estimateCy: 12,
        roeNumber: 'R-0007',
        address: '412 Cedar Ct',
        addressSource: 'TYPED',
      }),
    );
    story.at(
      wednesday('08:45'),
      'Lee’s phone finds signal for a moment and syncs: the collection arrives before its ROE does',
    );
    story.check(
      'AC-05-42 the collection is received pointing at no ROE, its number kept as typed: nothing is refused for an ROE that hasn’t arrived',
      [
        told(await syncing(lee)),
        (({ roeNumber, roeId }) => [roeNumber, roeId])(
          await api.fieldEvent.findUniqueOrThrow({ where: { id: collectionA.id } }),
        ),
      ],
      [['SAVED'], ['R-0007', null]],
    );
    story.at(
      wednesday('08:50'),
      'Lee records the pre-work survey of 412 Cedar Ct, then the ROE itself, R-0007, and 416 Cedar Ct’s, R-0008',
    );
    const survey = lee.survey({
      workType: 'Pre-work survey',
      surveyNumber: 'APN 14-0321-007',
      roeNumber: 'R-0007',
    });
    const r0007 = lee.roe({
      parcelId: 'APN 14-0321-007',
      address: '412 Cedar Ct',
      ownerName: 'Rosa Delgado',
      signed: true,
      signedDate: '2026-10-09',
    });
    const r0008 = lee.roe({
      parcelId: 'APN 14-0321-008',
      address: '416 Cedar Ct',
      ownerName: 'Ben Whitaker',
      signed: true,
      signedDate: '2026-10-09',
    });
    story.at(wednesday('08:55'), 'Split: the next property, the same badge');
    const propertyB = lee.begin('LOAD', 'COLLECTION', '730416');
    story.at(wednesday('09:05'), '416 Cedar Ct: 18 CY by eye, ROE R-0008');
    const collectionB = done(
      lee.complete(propertyB, {
        number: chained(propertyA),
        splitSuffix: 'B',
        ...vegetative,
        estimateCy: 18,
        roeNumber: 'R-0008',
      }),
    );
    story.at(
      wednesday('09:20'),
      'Mistakes on Lee’s phone: 412 Cedar Ct recorded again as 102001-A; a collection on the bare number 102001; another numbered 101020; and a paper ROE typed in as R-0007',
    );
    const again102001A = lee.begin('LOAD', 'COLLECTION', '730416');
    clock.advance(5);
    const dupProperty = done(
      lee.complete(again102001A, {
        number: scanned('102001'),
        splitSuffix: 'A',
        ...vegetative,
        estimateCy: 10,
      }),
    );
    const bareId = lee.begin('LOAD', 'COLLECTION', '730416');
    clock.advance(5);
    const bare = done(lee.complete(bareId, { number: scanned('102001'), ...vegetative }));
    const p2s101020 = lee.begin('LOAD', 'COLLECTION', '730416');
    clock.advance(5);
    done(lee.complete(p2s101020, { number: scanned('101020'), ...vegetative }));
    const paperRoe = lee.roe({
      paperNumber: 'R-0007',
      address: '420 Cedar Ct',
      ownerName: 'Ida Voss',
      signed: false,
    });
    story.at(wednesday('10:00'), 'At P2’s Marsh Road TDSR tower Kim scans P2’s 730416');
    const dis102001 = kimP2.begin('LOAD', 'DISPOSAL', '730416');
    story.at(
      wednesday('10:10'),
      'Kim calls 75% and scans 102001; ten minutes on the barcode is scanned a second time',
    );
    const dumped = done(
      kimP2.complete(dis102001, { number: scanned('102001'), ...vegetative, loadCall: 75 }),
    );
    const twice = kimP2.begin('LOAD', 'DISPOSAL', '730416');
    clock.advance(10);
    done(kimP2.complete(twice, { number: scanned('102001'), ...vegetative, loadCall: 75 }));

    story.at(wednesday('17:30'), 'At the yard P2’s two phones sync, the tower’s first');
    const towerAnswers = await syncing(kimP2);
    const leeRecords = lee.waitingRecords;
    const leeAnswers = await syncing(lee);
    story.check(
      'AC-05-25 a load dumps once: the second disposal on the base number 102001 is quarantined; so is the second, different collection 102001-A',
      [told(towerAnswers), leeAnswers.find((one) => one.id === dupProperty.id)],
      [
        ['SAVED', 'QUARANTINED'],
        {
          answer: 'QUARANTINED',
          id: dupProperty.id,
          reason: 'DUPLICATE_FIELD_EVENT',
          message:
            'Ticket 102001-A: this ticket already has a collection. Not saved: kept in quarantine for review.',
          heldBy: collectionA.id,
        },
      ],
    );
    story.check(
      'AC-05-32, AC-05-33, AC-05-31 collections 102001-A and 102001-B are both saved, one per property; a bare collection 102001 beside them is saved too (its suffix differs: the split’s shape is the worker’s to flag); and a collection numbered 101020 on P2 is its own project’s',
      await onServer({ projectId: p2 }),
      [
        '101020 COL PENDING',
        '102001 COL PENDING',
        '102001 DIS PENDING',
        '102001-A COL PENDING',
        '102001-B COL PENDING',
      ],
    );
    const pointsAt = async () => {
      const a = await api.fieldEvent.findUniqueOrThrow({ where: { id: collectionA.id } });
      const b = await api.fieldEvent.findUniqueOrThrow({ where: { id: collectionB.id } });
      const pre = await api.survey.findUniqueOrThrow({ where: { id: survey.id } });
      const p2Disposal = await api.fieldEvent.findUniqueOrThrow({ where: { id: dumped.id } });
      return [
        [a.roeNumber, a.roeId === r0007.id],
        [b.roeNumber, b.roeId === r0008.id],
        [pre.roeNumber, pre.roeId === r0007.id],
        [p2Disposal.certNumber, p2Disposal.certificationId === certified.p2c730416],
        [
          bare.roeNumber,
          (await api.fieldEvent.findUniqueOrThrow({ where: { id: bare.id } })).roeId,
        ],
      ];
    };
    story.check(
      'AC-05-42, AC-05-41 once ROE R-0007 arrived, the collection and the survey that came before it point at it; 102001-B found R-0008 already there; the number as typed stays on each. The disposal’s 730416 found P2’s own certification, not P1’s',
      await pointsAt(),
      [
        ['R-0007', true],
        ['R-0008', true],
        ['R-0007', true],
        ['730416', true],
        [null, null],
      ],
    );
    const paperAnswer = leeAnswers.find((one) => one.id === paperRoe.id);
    story.check(
      'an ROE’s number is held once on its project: the paper ROE typed in as R-0007 is not saved and not lost. It waits in quarantine, whole, beside the ROE that holds the number',
      [
        paperAnswer,
        (await api.roe.findMany({ where: { projectId: p2 }, orderBy: { roeNumber: 'asc' } })).map(
          (roe) => [roe.roeNumber, roe.ownerName, roe.signedDate?.toISOString().slice(0, 10)],
        ),
        (await waitingRoom()).filter((line) => line.startsWith('ROE')),
      ],
      [
        {
          answer: 'QUARANTINED',
          id: paperRoe.id,
          reason: 'DUPLICATE_ROE_NUMBER',
          message:
            'ROE R-0007: this project already has an ROE with that number. Not saved: kept in quarantine for review.',
          heldBy: r0007.id,
        },
        [
          ['R-0007', 'Rosa Delgado', '2026-10-09'],
          ['R-0008', 'Ben Whitaker', '2026-10-09'],
        ],
        ['ROE R-0007 · DUPLICATE_ROE_NUMBER · P2'],
      ],
    );
    const sentTwice: PhoneRecord[] = [
      { record: 'INCIDENT', incident },
      { record: 'DROP_OFF_LOG', dropOffLog: dropOff },
      { record: 'ROE', roe: r0007 },
      { record: 'SURVEY', survey },
      ...leeRecords.filter((record) => record.record === 'ROE' && record.roe.id === paperRoe.id),
      ...tariq.answers.flatMap((one) => (one.sent.record === 'SCALE_RECEIPT' ? [one.sent] : [])),
    ];
    const secondTime: SyncAnswer[] = [];
    for (const record of sentTwice) secondTime.push(await intake.receive(record));
    story.check(
      'AC-05-14 an incident, a drop-off log, an ROE made on a phone, a survey and three scale receipts, each sent a second time, are each one record still; the quarantined ROE is still one quarantined record',
      [
        told(secondTime),
        await api.incident.count(),
        await api.dropOffLog.count(),
        await api.roe.count(),
        await api.survey.count(),
        await api.scaleReceipt.count(),
        await api.quarantinedRecord.count(),
      ],
      [
        [
          'ALREADY_SAVED',
          'ALREADY_SAVED',
          'ALREADY_SAVED',
          'ALREADY_SAVED',
          'QUARANTINED',
          'ALREADY_SAVED',
          'ALREADY_SAVED',
          'ALREADY_SAVED',
        ],
        3,
        1,
        2,
        1,
        3,
        8,
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      wednesday('18:00'),
      'P1-TWR-LF turns up in Tariq’s truck and syncs, two days after Luis marked it lost',
    );
    story.check(
      'AC-10-46, AC-02-60 marked lost two days ago, P1-TWR-LF still proves itself: its key stands until the phone is wiped',
      await provesItself('P1-TWR-LF'),
      [true, 'SPENT'],
    );
    const lostAnswers = await syncing(lost);
    const lostEvents = await api.fieldEvent.findMany({
      where: { deviceId: device('P1-TWR-LF') },
      include: { assignment: true },
      orderBy: { endedAt: 'asc' },
    });
    story.check(
      'AC-05-54 a phone taken out of service is never refused its work: the disposal recorded at 5:40 pm on Monday, before it was marked lost at 6:10 pm, and the one at 6:30 pm, after, are both received. Which side of 6:10 pm each falls is the worker’s flag, by its work time',
      [
        told(lostAnswers),
        lostEvents.map((event) => [
          `${event.ticketNumber} ${short[event.kind]} ${event.status}`,
          projectTime(timeZone, event.endedAt),
          projectTime(timeZone, event.receivedAt),
        ]),
        (({ status, outOfServiceAt }) => [
          status,
          outOfServiceAt === null ? null : projectTime(timeZone, outOfServiceAt),
        ])(await api.device.findUniqueOrThrow({ where: { id: device('P1-TWR-LF') } })),
      ],
      [
        ['SAVED', 'SAVED'],
        [
          ['101021 DIS PENDING', 'Mon 12 Oct 17:40', 'Wed 14 Oct 18:00'],
          ['101024 DIS PENDING', 'Mon 12 Oct 18:30', 'Wed 14 Oct 18:00'],
        ],
        ['LOST', 'Mon 12 Oct 18:10'],
      ],
    );
    story.check(
      'AC-05-40 Tariq worked Monday under an unplanned assignment, set up on his phone: his records are received as any are, and carry it. Marked, never flagged',
      lostEvents.map((event) => [
        event.assignmentId === unplanned,
        event.assignment?.origin,
        event.status,
      ]),
      [
        [true, 'UNPLANNED', 'PENDING'],
        [true, 'UNPLANNED', 'PENDING'],
      ],
    );
    story.check(
      'AC-05-21 with Monday’s lost disposal in, ticket 101021 has its collection and its disposal; Kim’s 11:40 disposal still waits in quarantine for a person, unresolved',
      [
        await onServer({ ticketNumber: '101021' }),
        (await api.quarantinedRecord.findUniqueOrThrow({ where: { id: second.id } })).resolvedAt,
      ],
      [['101021 COL PENDING', '101021 DIS PENDING'], null],
    );
    story.at(
      wednesday('18:05'),
      'Every record of P1-TWR-LF is confirmed. Luis retires what it held',
    );
    const retired = await saved(
      allocator.retire(luis, device('P1-TWR-LF'), 'Lost on Monday 12 October'),
    );
    story.check(
      'AC-05-56 after its last sync the lost phone’s number blocks are retired. A tower makes no numbers, so it held none (the story `numbering` retires a phone that did); the wipe and the key’s refusal are Phases 3 and 2',
      [retired.length, await api.numberBlock.count({ where: { deviceId: device('P1-TWR-LF') } })],
      [0, 0],
    );

    // ------------------------------------------------------------------------------------------
    const everything = await api.fieldEvent.findMany();
    story.check(
      'AC-05-44 every field event received is PENDING, and intake wrote none of the worker’s conclusions: no reconciled time, no completed load, no transaction',
      [
        everything.length,
        [...new Set(everything.map((event) => event.status))],
        everything.filter((event) => event.reconciledAt !== null).length,
        await api.completedLoad.count(),
        await api.transaction.count(),
      ],
      [everything.length, ['PENDING'], 0, 0, 0],
    );
    const numbers = new Map<string, number>();
    for (const event of everything) {
      const key = [
        event.projectId,
        event.workflow,
        event.ticketNumber,
        event.splitSuffix,
        event.kind,
      ].join();
      numbers.set(key, (numbers.get(key) ?? 0) + 1);
    }
    story.check(
      'AC-05-26 after three days of duplicates no ticket has two field events of one kind: the database’s own key was never relaxed, and quarantine was never a way round it',
      [[...numbers.values()].filter((held) => held > 1), await api.quarantinedRecord.count()],
      [[], 8],
    );
    const audit = await api.auditRecord.findMany({
      where: {
        tableName: {
          in: [
            'field_event',
            'quarantined_record',
            'scale_receipt',
            'incident',
            'drop_off_log',
            'survey',
            'roe',
            'photo',
          ],
        },
      },
    });
    const makers = new Map<string, string>([
      ...everything.map((event) => [event.id, event.monitorId] as const),
      ...(await api.quarantinedRecord.findMany()).map((row) => [row.id, row.monitorId] as const),
    ]);
    const inserts = audit.filter((record) => record.operation === 'INSERT');
    story.check(
      'every record intake wrote is audited once as an insert, by the monitor who made it, from a phone; nothing was deleted, and the only changes afterwards are the two records that came to point at ROE R-0007',
      [
        inserts.every((record) => record.source === 'DEVICE' && record.deviceId !== null),
        inserts.filter(
          (record) => makers.has(record.recordId) && makers.get(record.recordId) !== record.actorId,
        ).length,
        new Set(inserts.map((record) => record.recordId)).size === inserts.length,
        audit
          .filter((record) => record.operation !== 'INSERT')
          .map((record) => [
            record.tableName,
            record.operation,
            record.changedFields,
            users.get(record.actorId ?? ''),
          ])
          .sort(),
      ],
      [
        true,
        0,
        true,
        [
          ['field_event', 'UPDATE', ['roe_id'], 'Lee Morgan'],
          ['survey', 'UPDATE', ['roe_id'], 'Lee Morgan'],
        ],
      ],
    );
  },
};
