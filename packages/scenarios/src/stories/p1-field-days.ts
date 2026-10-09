// The sixth story (BACKLOG 1.3.7; ADR-332): P1's Monday 12 and Tuesday 13 October 2026 as the
// phones record them (spec/golden/MISSION.md §2; spec/acceptance/04-field-capture.md AC-04-10, 11,
// 17, 42, 59, 70, 91, 92, 93). Six monitors on six phones, all offline: six loads, a haul-out, a
// haul-out loaded from three piles and weighed, seven unit rate tickets, an incident and a citizen
// drop-off log. Every capture is badge first, number last: the first field event of a ticket makes
// its number from its phone's block, the second scans it, and either is entered again by hand.
// Everything is picked by name; a unit rate pay item is worked out on the phone from the size
// bands, by the rule the server shares. The phones sync at the yard each evening, except the
// TDSR tower's on Tuesday (flat battery: Wednesday).
//
// It ends where this build does: every record on the server as recorded, every field event
// PENDING, nothing refused. Pairing, flags, zones, mileage and money are the engine's (Milestones
// 1.5…1.7); the certification a badge finds, duplicates and quarantine are the story `sync`'s.
//
// Not here: P1's load pay items, rules and map (the story `setup`) and its certifications (the
// story `certification`): a phone sends only the cert number it scanned. Photographs (the file's
// place in storage is Phase 2's). GPS fixes, apart from the collections' and the haul-outs',
// whose zone and mileage the worker's stories tell and the rules price by (spec/CONVENTIONS.md
// §6's stand-in points). The top-up of a block at a sync (the story `sync`). The golden mission's own
// story, with what happens at review, is 1.9.1.
import {
  FormSetup,
  ListSetup,
  type NewPayItem,
  NumberAllocator,
  type Outcome,
  PayItemSetup,
  ProjectSetup,
  SiteSetup,
  type NewAssignment,
} from '@open-adms/api';
import type { FieldEventKind, FormDocumentType, NumberSeries } from '@open-adms/db';

import { projectTime } from '../clock.ts';
import {
  chained,
  type Completed,
  made,
  type PhoneLists,
  type RecordedEvent,
  scanned,
  type SimulatedDevice,
  typed,
} from '../device.ts';
import { uuidv7, uuidv7Time } from '../ids.ts';
import { phoneLists } from '../phone-lists.ts';
import type { Story } from '../runner.ts';
import { assigned } from './board.ts';
import { p1TimeZone as timeZone, setUpP1, setUpP1Sites } from './p1.ts';

const on = (date: string, time: string): string => `2026-10-${date}T${time}:00-04:00`;
const monday = (time: string): string => on('12', time);
const tuesday = (time: string): string => on('13', time);

// A pay item's capture settings, none ticked.
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

// Every key anywhere in a phone's lists.
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
}

export const p1FieldDays: Story = {
  name: 'p1-field-days',
  title:
    'P1’s Monday and Tuesday: six phones record every kind of field event, an incident and a drop-off log, offline; each lands PENDING',
  timeZone,
  start: monday('05:30'),

  async run(story) {
    const { api, clock } = story;
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
      monday('05:30'),
      'Dana Reyes has set up P1: its three sites, its forms and debris types, its field tags, its unit rate pay items, its people and its six phones',
    );
    // Enrolled by now, on the story's clock, before any work they record: each under the master
    // passcode, with a key of its own (ADR-439, 440).
    const enrolledPhones: Record<string, string> = {};
    for (const name of [
      'P1-COL-1',
      'P1-TWR-TDSR',
      'P1-TWR-LF',
      'P1-HO-TDSR',
      'P1-TWR-CCL',
      'P1-UR-1',
    ]) {
      enrolledPhones[name] = (await story.enrolled(name)).id;
    }
    const dana = uuidv7(clock.now());
    const office = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
      const luis = await tx.user.create({ data: { name: 'Luis Ortega', role: 'MANAGER_ANALYST' } });
      // Luis writes each day's board: Dana grants him *dispatch* (ADR-428, 429).
      await tx.userPermission.create({ data: { userId: luis.id, permission: 'DISPATCH' } });
      const p1 = await setUpP1(tx, story.policy);
      const { tdsr, landfill } = await setUpP1Sites(tx, p1.project);
      const monitors: Record<string, string> = {};
      for (const [name, monitorNumber] of [
        ['Ana Brooks', 'M004127'],
        ['Kim Nguyen', 'M004128'],
        ['Tariq Patel', 'M004129'],
        ['Jo Kim', 'M004130'],
        ['Sam Grant', 'M004131'],
        ['Lee Morgan', 'M004132'],
      ] as const) {
        const monitor = await tx.user.create({ data: { name, role: 'MONITOR', monitorNumber } });
        monitors[name] = monitor.id;
      }
      // The firm's own sub-type of an incident (golden mission §2).
      const damage = await tx.incidentType.findFirstOrThrow({ where: { name: 'Property damage' } });
      await tx.incidentSubType.create({
        data: { name: 'Mailbox struck', position: 1, incidentTypeId: damage.id },
      });
      return {
        luis: luis.id,
        p1: p1.project,
        coastline: p1.prime,
        tdsr,
        landfill,
        monitors,
        phones: enrolledPhones,
      };
    });
    const { luis, p1, coastline, tdsr, landfill } = office;
    const person = (name: string): string => {
      const id = office.monitors[name];
      if (id === undefined) throw new Error(`No monitor ${name}`);
      return id;
    };
    const device = (name: string): string => {
      const id = office.phones[name];
      if (id === undefined) throw new Error(`No phone ${name}`);
      return id;
    };

    const sites = new SiteSetup(api, clock, story.policy);
    const forms = new FormSetup(api, clock);
    const lists = new ListSetup(api, clock);
    const projects = new ProjectSetup(api, clock, story.policy);
    const payItems = new PayItemSetup(api, clock, story.policy);
    const allocator = new NumberAllocator(api, clock, story.policy);

    const finalDisposal = await api.siteType.findUniqueOrThrow({
      where: { key: 'FINAL_DISPOSAL' },
    });
    const cypress = (
      await saved(
        sites.site(dana, {
          projectId: p1,
          name: 'Cypress Creek Landfill',
          shortCode: 'CCL',
          siteTypeId: finalDisposal.id,
          takesLoads: true,
          haulOutsLeaveHere: false,
          chargesTippingFee: false,
          ineligibleSite: false,
          permitNumber: 'FDEP-SW-0131',
          latitude: '39.24000000',
          longitude: '-75.60000000',
          activationDate: '2026-10-12',
        }),
      )
    ).id;
    const siteNames = new Map([
      [tdsr, 'Marsh Road TDSR'],
      [landfill, 'Bayline County Landfill'],
      [cypress, 'Cypress Creek Landfill'],
    ]);

    const form = async (documentType: FormDocumentType, name: string): Promise<string> =>
      (await saved(forms.form(dana, { projectId: p1, documentType, name, enabled: true }))).id;
    const loadForm = await form('LOAD', 'Load');
    const haulOutForm = await form('HAUL_OUT', 'Haul-out');
    await form('UNIT_RATE', 'Unit rate');
    // What an incident offers Jo: the contractor involved and a cert number (ADR-334).
    await saved(
      forms.form(dana, {
        projectId: p1,
        documentType: 'INCIDENT',
        name: 'Incident',
        enabled: true,
        incidentOffers: ['CONTRACTOR', 'CERT_NUMBER'],
      }),
    );
    await form('DROP_OFF_LOG', 'Drop-off log');
    const library = async (name: string): Promise<string> =>
      (await api.debrisType.findFirstOrThrow({ where: { name } })).id;
    for (const name of ['Vegetative', 'C&D']) {
      await saved(
        forms.debrisType(dana, {
          formId: loadForm,
          debrisTypeId: await library(name),
          reduced: false,
          hiddenOnPhones: false,
        }),
      );
    }
    const grinding = await api.reductionMethod.findFirstOrThrow({ where: { name: 'Grinding' } });
    await saved(
      forms.debrisType(dana, {
        formId: haulOutForm,
        debrisTypeId: (await saved(lists.debrisType(dana, 'Mulch'))).id,
        reduced: true,
        reductionMethodId: grinding.id,
        hiddenOnPhones: false,
      }),
    );
    for (const tag of ['Mixed', 'Zone 1 pile', 'Zone 2 pile', 'Zone 3 pile']) {
      await saved(projects.fieldTag(dana, p1, tag));
    }

    // The unit rate pay items a monitor's work falls to, with Coastline's rate on each (golden
    // mission §1). The fill and the freon are added by rules, never picked: not a phone's.
    const unitRatePayItem = async (
      code: string,
      description: string,
      work: string,
      unit: NewPayItem['unit'],
      rate: string,
      more: Partial<NewPayItem> = {},
    ) => {
      const kindOfWork = await api.kindOfWork.findFirstOrThrow({ where: { name: work } });
      const payableType = await api.payableType.findFirstOrThrow({ where: { name: work } });
      return saved(
        payItems.payItem(dana, {
          ...unticked,
          projectId: p1,
          code,
          description,
          payableTypeId: payableType.id,
          unit,
          kindOfWorkId: kindOfWork.id,
          photosRequired: true,
          rates: [{ primeId: coastline, rate }],
          ...more,
        }),
      );
    };
    const each = (
      code: string,
      description: string,
      work: string,
      rate: string,
      band?: { from: number; to: number },
    ) =>
      unitRatePayItem(code, description, work, 'EA', rate, {
        countIsAlwaysOne: true,
        measurementRequired: band !== undefined,
        bandFrom: band?.from ?? null,
        bandTo: band?.to ?? null,
      });
    const unitRateWork = [
      await each('HNG-RMV-EA', 'Hanger removal', 'Hangers', '68.00'),
      await each('LNR-RMV-EA-24', 'Leaner removal 6–24 in', 'Leaners', '95.00', {
        from: 6,
        to: 24,
      }),
      await each('LNR-RMV-EA-99', 'Leaner removal 24.1–99 in', 'Leaners', '185.00', {
        from: 24.1,
        to: 99,
      }),
      await each('STP-RMV-EA-36', 'Stump removal 24–36 in', 'Stumps', '110.00', {
        from: 24,
        to: 36,
      }),
      await each('STP-RMV-EA-48', 'Stump removal 36.1–48 in', 'Stumps', '175.00', {
        from: 36.1,
        to: 48,
      }),
      await unitRatePayItem('WG-RMV-EA', 'White good removed', 'White Goods', 'EA', '40.00'),
      await unitRatePayItem(
        'CREW-TIME-HR',
        'Crew time, skid steer crew',
        'Crew time',
        'HR',
        '150.00',
        {
          decimalsAllowed: true,
          crewTimeConversion: 'PER_HOUR',
        },
      ),
    ];

    // ------------------------------------------------------------------------------------------
    story.at(
      monday('06:00'),
      'Luis Ortega writes Monday’s dispatch board, then copies it to Tuesday',
    );
    interface Planned {
      readonly monitor: string;
      readonly phone: string;
      readonly kinds: readonly FieldEventKind[];
      readonly forms?: NewAssignment['formDocumentTypes'];
      readonly siteId?: string;
      readonly unitRate?: boolean;
      readonly tuesdayOnly?: boolean;
    }
    const plan: readonly Planned[] = [
      { monitor: 'Ana Brooks', phone: 'P1-COL-1', kinds: ['COLLECTION'] },
      {
        monitor: 'Kim Nguyen',
        phone: 'P1-TWR-TDSR',
        kinds: ['DISPOSAL'],
        forms: ['DROP_OFF_LOG'],
        siteId: tdsr,
      },
      {
        monitor: 'Tariq Patel',
        phone: 'P1-TWR-LF',
        kinds: ['DISPOSAL', 'HAUL_OUT_DISPOSAL'],
        siteId: landfill,
      },
      { monitor: 'Sam Grant', phone: 'P1-HO-TDSR', kinds: ['HAUL_OUT_COLLECTION'], siteId: tdsr },
      {
        monitor: 'Lee Morgan',
        phone: 'P1-TWR-CCL',
        kinds: ['HAUL_OUT_DISPOSAL'],
        siteId: cypress,
        tuesdayOnly: true,
      },
      {
        monitor: 'Jo Kim',
        phone: 'P1-UR-1',
        kinds: ['UNIT_RATE'],
        forms: ['INCIDENT'],
        unitRate: true,
      },
    ];
    const board = async (workDate: string, people: readonly Planned[]) => {
      const assignments: Record<string, string> = {};
      for (const planned of people) {
        assignments[planned.phone] = await assigned(api, clock, luis, {
          workDate,
          projectId: p1,
          personId: person(planned.monitor),
          fieldEventKinds: [...planned.kinds],
          formDocumentTypes: [...(planned.forms ?? [])],
          siteId: planned.siteId ?? null,
          deviceId: device(planned.phone),
          // Each named with its own kind of work by the service (C42).
          payItemIds: planned.unitRate === true ? unitRateWork.map(({ id }) => id) : [],
        });
      }
      return assignments;
    };
    const boards = {
      monday: await board(
        '2026-10-12',
        plan.filter((planned) => planned.tuesdayOnly !== true),
      ),
      tuesday: await board('2026-10-13', plan),
    };

    // ------------------------------------------------------------------------------------------
    story.at(
      monday('06:30'),
      'At the yard, online: each phone that makes numbers takes a block; each monitor signs in and the phone takes their assignment and its lists',
    );
    const blockFor = async (phone: string, monitor: string, series: NumberSeries) => {
      await saved(
        allocator.topUp(
          { person: person(monitor), deviceId: device(phone) },
          { projectId: p1, series, lastUsedNumber: null },
        ),
      );
    };
    await blockFor('P1-COL-1', 'Ana Brooks', 'LOAD');
    await blockFor('P1-HO-TDSR', 'Sam Grant', 'HAUL_OUT');
    await blockFor('P1-UR-1', 'Jo Kim', 'UNIT_RATE');

    const held: Record<string, PhoneLists> = {};
    const signedIn = async (day: 'monday' | 'tuesday', planned: Planned) => {
      const assignmentId = boards[day][planned.phone];
      if (assignmentId === undefined) throw new Error(`${planned.phone} has no assignment.`);
      const deviceId = device(planned.phone);
      const taken = await phoneLists(api, { assignmentId, deviceId });
      held[planned.phone] = taken;
      return {
        name: planned.phone,
        deviceId,
        monitorId: person(planned.monitor),
        assignmentId,
        projectId: p1,
        ...(planned.siteId === undefined ? {} : { siteId: planned.siteId }),
        setupVersion: 1,
        lists: taken,
        timeZone,
      };
    };
    const phones: Record<string, SimulatedDevice> = {};
    for (const planned of plan) {
      if (planned.tuesdayOnly === true) continue;
      phones[planned.phone] = story.phone(await signedIn('monday', planned));
    }
    const phone = (name: string): SimulatedDevice => {
      const found = phones[name];
      if (found === undefined) throw new Error(`No phone ${name} is set up.`);
      return found;
    };
    const ana = phone('P1-COL-1');
    const kim = phone('P1-TWR-TDSR');
    const tariq = phone('P1-TWR-LF');
    const sam = phone('P1-HO-TDSR');
    const jo = phone('P1-UR-1');

    const blocksHeld = (name: string): string[] =>
      (held[name]?.blocks ?? []).map(
        (block) => `${block.series} ${String(block.firstNumber)}–${String(block.lastNumber)}`,
      );
    story.check(
      'AC-04-10 the phones that make a ticket’s first field event hold a block of its series; a tower holds none',
      Object.fromEntries(Object.keys(phones).map((name) => [name, blocksHeld(name)])),
      {
        'P1-COL-1': ['LOAD 101001–102000'],
        'P1-TWR-TDSR': [],
        'P1-TWR-LF': [],
        'P1-HO-TDSR': ['HAUL_OUT 201001–202000'],
        'P1-UR-1': ['UNIT_RATE 301001–302000'],
      },
    );
    story.check(
      'AC-04-92 a load’s phone holds the load form’s debris types by name, and no pay item; the haul-out end holds Mulch and the firm’s field tags',
      [
        held['P1-COL-1']?.debrisTypes.LOAD?.map((entry) => entry.name),
        held['P1-COL-1']?.payItems,
        held['P1-TWR-TDSR']?.payItems,
        held['P1-HO-TDSR']?.debrisTypes.HAUL_OUT?.map((entry) => entry.name),
        held['P1-HO-TDSR']?.fieldTags.map((tag) => tag.name),
      ],
      [
        ['Vegetative', 'C&D'],
        [],
        [],
        ['Mulch'],
        ['Mixed', 'Zone 1 pile', 'Zone 2 pile', 'Zone 3 pile'],
      ],
    );
    story.check(
      'AC-04-92 Jo’s list shows each payable type once, though Leaners and Stumps have two pay items each; no phone’s lists hold a rate',
      [
        jo.payableTypes,
        held['P1-UR-1']?.payItems.length,
        Object.values(held)
          .flatMap(keysOf)
          .filter((key) => /rate/i.test(key)),
      ],
      [['Hangers', 'Leaners', 'Stumps', 'White Goods', 'Crew time'], 7, []],
    );

    // ------------------------------------------------------------------------------------------
    // Monday. Each `begin` is New, the badge scanned; each `complete` is Complete, the number last.
    const vegetative = { debrisType: 'Vegetative' } as const;
    const started: Record<string, string> = {};
    const ids: string[] = [];
    const begin = (
      who: SimulatedDevice,
      workflow: 'LOAD' | 'HAUL_OUT' | 'UNIT_RATE',
      kind: FieldEventKind,
      badge?: string,
    ): string => {
      const id = who.begin(workflow, kind, badge);
      ids.push(id);
      return id;
    };

    // Where the later loads are collected (the mission names no address for them): the dump
    // trailer goes back to Heron St, Rivera's self-loader works Elm St (spec/CONVENTIONS.md §6:
    // 6.2050 and 7.8200 road miles from Marsh Road TDSR, both in Zone 2). The phone records its
    // fix; no address is typed.
    const heronSt = { endLatitude: '39.13850000', endLongitude: '-75.55370000' };
    const elmSt = { endLatitude: '39.15000000', endLongitude: '-75.54000000' };

    story.at(monday('08:15'), 'Ana scans the dump trailer’s badge, 730415, at 14 Heron St');
    started['101001'] = begin(ana, 'LOAD', 'COLLECTION', '730415');
    story.check(
      'AC-04-91, AC-04-17 badge first: the field event is on her phone from the scan, with its id and the badge, and no number yet; her block is untouched',
      [
        ana.open.map((event) => [event.id === started['101001'], event.kind, event.certNumber]),
        uuidv7Time(started['101001']).getTime() === clock.now().getTime(),
        ana.lastUsedNumber('LOAD'),
        ana.waiting.length,
      ],
      [[[true, 'COLLECTION', '730415']], true, null, 0],
    );
    story.at(
      monday('08:40'),
      'The truck is loaded. Ana picks Vegetative; her phone shows 101001, the next of its block, and she enters it again',
    );
    const first = done(
      ana.complete(started['101001'], {
        number: made,
        ...vegetative,
        address: '14 Heron St',
        addressSource: 'TYPED',
        endLatitude: '39.13850000',
        endLongitude: '-75.55370000',
      }),
    );
    story.check(
      'AC-04-10 number last: 101001 was made by the collection; the id is the one made at the scan',
      [first.ticketNumber, first.id === started['101001'], ana.lastUsedNumber('LOAD'), ana.open],
      ['101001', true, 101001, []],
    );

    story.at(monday('09:05'), 'Kim scans the badge at the Marsh Road TDSR tower');
    started['dis101001'] = begin(kim, 'LOAD', 'DISPOSAL', '730415');
    story.at(
      monday('09:25'),
      'Kim picks Vegetative, calls 80%, and scans 101001 off the truck’s copy',
    );
    done(
      kim.complete(started['dis101001'], {
        number: scanned('101001'),
        ...vegetative,
        loadCall: 80,
        endLatitude: '39.09030000',
        endLongitude: '-75.62020000',
      }),
    );

    story.at(monday('09:40'), 'Jo scans the bucket truck crew’s badge, 730417');
    started['301001'] = begin(jo, 'UNIT_RATE', 'UNIT_RATE', '730417');
    story.at(monday('09:50'), 'Ana scans Rivera’s self-loader, 730416');
    started['101002'] = begin(ana, 'LOAD', 'COLLECTION', '730416');
    story.at(monday('09:55'), 'Jo picks Hangers: one tree, a 3 in limb');
    const hanger = {
      number: made,
      payableType: 'Hangers',
      count: 1,
      measurement: { inches: 3, measuredAs: 'DIAMETER' },
    } as const;
    done(jo.complete(started['301001'], hanger));
    story.at(monday('10:10'), 'Ana picks C&D; her phone shows 101002');
    done(
      ana.complete(started['101002'], {
        number: made,
        debrisType: 'C&D',
        endLatitude: '39.15000000',
        endLongitude: '-75.52000000',
      }),
    );
    story.at(monday('10:35'), 'Tariq scans 730416 at the Bayline County Landfill tower');
    started['dis101002'] = begin(tariq, 'LOAD', 'DISPOSAL', '730416');
    story.at(monday('10:50'), 'Tariq picks C&D, calls 75%, scans 101002');
    done(
      tariq.complete(started['dis101002'], {
        number: scanned('101002'),
        debrisType: 'C&D',
        loadCall: 75,
      }),
    );

    story.at(
      monday('10:55'),
      'Jo starts the next tree without a scan: 730417 is still her working crew',
    );
    started['301002'] = begin(jo, 'UNIT_RATE', 'UNIT_RATE');
    story.at(monday('11:10'), 'Jo picks Leaners and measures 56.5 in around');
    done(
      jo.complete(started['301002'], {
        number: made,
        payableType: 'Leaners',
        count: 1,
        measurement: { inches: 56.5, measuredAs: 'CIRCUMFERENCE' },
      }),
    );
    story.at(monday('11:12'), 'Ana scans 730415 again');
    started['101003'] = begin(ana, 'LOAD', 'COLLECTION', '730415');
    story.at(monday('11:30'), 'Ana’s phone shows 101003; she enters 101030 by mistake');
    story.check(
      'AC-04-11 the number entered again doesn’t match: nothing is saved, the field event stays open and 101003 isn’t used up',
      [
        ana.complete(started['101003'], { number: made, ...vegetative, reentered: '101030' }),
        ana.open.length,
        ana.waiting.length,
        ana.lastUsedNumber('LOAD'),
      ],
      [
        { saved: false, reason: 'NUMBER_MISMATCH', shown: '101003', reentered: '101030' },
        1,
        2,
        101002,
      ],
    );
    story.check(
      'AC-04-11 she enters 101003: the two match, and it is saved',
      done(
        ana.complete(started['101003'], {
          number: made,
          ...vegetative,
          ...heronSt,
          reentered: '101003',
        }),
      ).ticketNumber,
      '101003',
    );
    story.at(monday('11:50'), 'Kim scans 730415 at the tower');
    started['dis101003'] = begin(kim, 'LOAD', 'DISPOSAL', '730415');
    story.at(monday('12:05'), 'Kim calls it 96%, heaped, and scans 101003');
    done(
      kim.complete(started['dis101003'], {
        number: scanned('101003'),
        ...vegetative,
        loadCall: 96,
      }),
    );

    story.at(monday('13:00'), 'Jo starts a third ticket, still crew 730417');
    started['301003'] = begin(jo, 'UNIT_RATE', 'UNIT_RATE');
    story.at(monday('13:10'), 'Jo records Hangers again: the same tree as 301001');
    done(jo.complete(started['301003'], hanger));
    story.at(monday('13:20'), 'Jo starts a fourth by mistake and cancels it');
    const mistake = jo.begin('UNIT_RATE', 'UNIT_RATE');
    jo.cancel(mistake);
    story.check(
      'a cancelled field event stays on the phone, waits for no sync and took no number: 301004 is still next',
      [
        jo.cancelled.map((event) => event.id === mistake),
        jo.open,
        jo.waiting.length,
        jo.nextNumber('UNIT_RATE'),
      ],
      [[true], [], 3, 301004],
    );
    story.check(
      'AC-04-70 Jo scanned crew 730417 once: it stayed her working crew for 301002 and 301003',
      jo.waiting.map((event) => [event.ticketNumber, event.certNumber]),
      [
        ['301001', '730417'],
        ['301002', '730417'],
        ['301003', '730417'],
      ],
    );
    const codes = new Map(unitRateWork.map((payItem) => [payItem.id, payItem.code]));
    const workedOut = (events: readonly RecordedEvent[]) =>
      events.map((event) => [
        event.ticketNumber,
        event.payItemId === null ? null : (codes.get(event.payItemId) ?? event.payItemId),
      ]);
    story.check(
      'AC-04-59 her phone worked each pay item out: Hangers has one; 56.5 in around is 18.0 in across, in the 6–24 in band',
      workedOut(jo.waiting),
      [
        ['301001', 'HNG-RMV-EA'],
        ['301002', 'LNR-RMV-EA-24'],
        ['301003', 'HNG-RMV-EA'],
      ],
    );

    story.at(monday('17:30'), 'Ana scans 730416 for the day’s last load');
    started['101004'] = begin(ana, 'LOAD', 'COLLECTION', '730416');
    story.at(monday('17:50'), 'Ana completes 101004; the truck parks loaded for the night');
    done(ana.complete(started['101004'], { number: made, ...vegetative, ...elmSt }));
    story.check(
      'every record is still on its phone, and the server has none',
      [
        Object.fromEntries(
          Object.entries(phones).map(([name, each]) => [name, each.waitingRecords.length]),
        ),
        await api.fieldEvent.count(),
      ],
      [{ 'P1-COL-1': 4, 'P1-TWR-TDSR': 2, 'P1-TWR-LF': 1, 'P1-HO-TDSR': 0, 'P1-UR-1': 3 }, 0],
    );

    // ------------------------------------------------------------------------------------------
    const onServer = async (): Promise<string[]> => {
      const events = await api.fieldEvent.findMany({
        orderBy: [{ ticketNumber: 'asc' }, { splitSuffix: 'asc' }, { endedAt: 'asc' }],
      });
      return events.map(
        (event) =>
          `${event.ticketNumber}${event.splitSuffix === '' ? '' : `-${event.splitSuffix}`} ${event.kind} ${event.status}`,
      );
    };
    story.at(monday('18:30'), 'Back at the yard the phones find signal. The tower’s syncs first');
    story.check('Kim’s phone sends its two disposals', await kim.sync(story.intake), 2);
    story.check(
      'AC-04-42 each disposal is saved as it is and waits, PENDING, though no collection has reached the server',
      await onServer(),
      ['101001 DISPOSAL PENDING', '101003 DISPOSAL PENDING'],
    );
    story.check(
      'then Tariq’s, Jo’s and Ana’s: one, three and four',
      [await tariq.sync(story.intake), await jo.sync(story.intake), await ana.sync(story.intake)],
      [1, 3, 4],
    );
    story.check(
      'Monday’s ten field events are on the server, each PENDING; 101004 has only its collection: a preload',
      await onServer(),
      [
        '101001 COLLECTION PENDING',
        '101001 DISPOSAL PENDING',
        '101002 COLLECTION PENDING',
        '101002 DISPOSAL PENDING',
        '101003 COLLECTION PENDING',
        '101003 DISPOSAL PENDING',
        '101004 COLLECTION PENDING',
        '301001 UNIT_RATE PENDING',
        '301002 UNIT_RATE PENDING',
        '301003 UNIT_RATE PENDING',
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      tuesday('06:30'),
      'Tuesday at the yard: each monitor signs in and their phone takes Tuesday’s assignment; Lee Morgan takes P1-TWR-CCL to Cypress Creek Landfill',
    );
    for (const planned of plan) {
      const setup = await signedIn('tuesday', planned);
      const known = phones[planned.phone];
      if (known === undefined) phones[planned.phone] = story.phone(setup);
      else known.signIn(setup);
    }
    const lee = phone('P1-TWR-CCL');

    story.at(tuesday('06:45'), 'Yesterday’s loaded truck, 730416, reaches the TDSR tower');
    started['dis101004'] = begin(kim, 'LOAD', 'DISPOSAL', '730416');
    story.at(tuesday('07:15'), 'Kim calls it 50% and scans 101004');
    done(
      kim.complete(started['dis101004'], {
        number: scanned('101004'),
        ...vegetative,
        loadCall: 50,
      }),
    );

    story.at(tuesday('08:30'), 'Jo scans the skid steer crew’s badge, 730418');
    started['301004'] = begin(jo, 'UNIT_RATE', 'UNIT_RATE', '730418');
    story.at(
      tuesday('08:50'),
      'Jo picks Stumps: 30 in across two feet up, a 96 in root ball, half or more exposed, the survey number typed',
    );
    const stump = { number: made, payableType: 'Stumps', count: 1 } as const;
    done(
      jo.complete(started['301004'], {
        ...stump,
        measurement: { inches: 30, measuredAs: 'DIAMETER' },
        rootBallInches: 96,
        rootBallHalfExposed: true,
        surveyNumber: 'APN 14-0321-007',
      }),
    );
    story.at(tuesday('09:10'), 'Jo starts another stump, the same crew');
    started['301005'] = begin(jo, 'UNIT_RATE', 'UNIT_RATE');
    story.at(tuesday('09:20'), 'This one is 20 in across');
    done(
      jo.complete(started['301005'], {
        ...stump,
        measurement: { inches: 20, measuredAs: 'DIAMETER' },
      }),
    );
    story.check(
      'AC-04-59 30 in is in the 24–36 in band; 20 in is in no band, so 301005 is saved with no pay item, and nothing stops Jo',
      workedOut(jo.waiting),
      [
        ['301004', 'STP-RMV-EA-36'],
        ['301005', null],
      ],
    );

    story.at(tuesday('09:45'), 'Ana scans 730415');
    started['101005'] = begin(ana, 'LOAD', 'COLLECTION', '730415');
    story.at(tuesday('10:05'), 'Ana completes it: her phone carries on from yesterday, 101005');
    story.check(
      'the phone kept its own count of numbers through the sign-in',
      done(ana.complete(started['101005'], { number: made, ...vegetative, ...heronSt }))
        .ticketNumber,
      '101005',
    );
    story.at(tuesday('10:25'), 'Kim scans 730415 at the tower');
    started['dis101005'] = begin(kim, 'LOAD', 'DISPOSAL', '730415');
    story.at(tuesday('10:40'), 'Kim calls it 70% and scans 101005');
    done(
      kim.complete(started['dis101005'], {
        number: scanned('101005'),
        ...vegetative,
        loadCall: 70,
      }),
    );

    story.at(tuesday('10:50'), 'Jo scans crew 730417 at 40 Birch Ln');
    started['301006'] = begin(jo, 'UNIT_RATE', 'UNIT_RATE', '730417');
    story.at(tuesday('11:10'), 'Ana scans 730416');
    started['101006'] = begin(ana, 'LOAD', 'COLLECTION', '730416');
    story.at(
      tuesday('11:15'),
      'Jo picks White Goods: two washers, a dryer and three fridges, freon recovered from two',
    );
    done(
      jo.complete(started['301006'], {
        number: made,
        payableType: 'White Goods',
        address: '40 Birch Ln',
        addressSource: 'TYPED',
        items: [
          { name: 'Washer', quantity: 2 },
          { name: 'Dryer', quantity: 1 },
          { name: 'Fridge, freon recovered', quantity: 2 },
          { name: 'Fridge, no freon', quantity: 1 },
        ],
      }),
    );
    story.at(tuesday('11:30'), 'Ana completes 101006');
    done(ana.complete(started['101006'], { number: made, ...vegetative, ...elmSt }));
    story.at(
      tuesday('11:50'),
      'Jo records an incident at 22 Elm St: a mailbox struck by truck 730416',
    );
    const incident = jo.incident({
      type: 'Property damage',
      subType: 'Mailbox struck',
      address: '22 Elm St',
      certNumber: '730416',
    });
    story.at(tuesday('11:55'), 'Kim scans 730416 at the tower');
    started['dis101006'] = begin(kim, 'LOAD', 'DISPOSAL', '730416');
    story.at(
      tuesday('12:10'),
      'The barcode won’t scan. Kim types the number, 101060 by mistake, picks “Barcode damaged”, and calls 60%',
    );
    const typedDisposal = done(
      kim.complete(started['dis101006'], {
        number: typed('101060', 'Barcode damaged'),
        ...vegetative,
        loadCall: 60,
      }),
    );
    story.check(
      'the phone takes what was typed, marked typed with its reason: nothing on a tower can know it is wrong',
      [
        typedDisposal.ticketNumber,
        typedDisposal.numberTyped,
        typedDisposal.numberTypedReasonId !== null,
      ],
      ['101060', true, true],
    );

    story.at(tuesday('12:40'), 'Sam scans the walking floor, 730419, at Marsh Road TDSR');
    started['201001'] = begin(sam, 'HAUL_OUT', 'HAUL_OUT_COLLECTION', '730419');
    story.at(
      tuesday('13:00'),
      'Loaded with mulch: Sam picks Mulch and calls 90% at the loading end; his phone shows 201001',
    );
    // Where a haul-out is loaded at Marsh Road TDSR: by its tower.
    const atTheTdsr = { endLatitude: '39.09030000', endLongitude: '-75.62020000' } as const;
    done(
      sam.complete(started['201001'], {
        number: made,
        debrisType: 'Mulch',
        loadCall: 90,
        ...atTheTdsr,
      }),
    );
    story.at(tuesday('13:55'), 'Tariq scans 730419 at the Landfill');
    started['hod201001'] = begin(tariq, 'HAUL_OUT', 'HAUL_OUT_DISPOSAL', '730419');
    story.at(
      tuesday('14:10'),
      'Tariq picks Mulch and scans 201001: a haul-out’s disposal takes no load call',
    );
    done(tariq.complete(started['hod201001'], { number: scanned('201001'), debrisType: 'Mulch' }));

    story.at(
      tuesday('15:10'),
      'The walking floor is back for three piles. Sam answers “split” and scans 730419 for the first',
    );
    // 201002 and 201003 are the flag catalogue's examples, not tickets of this story (golden
    // mission §2: gaps in a series are normal). The harness moves Sam's phone past them.
    sam.passOver('HAUL_OUT', 201003);
    started['201004-A'] = begin(sam, 'HAUL_OUT', 'HAUL_OUT_COLLECTION', '730419');
    story.at(tuesday('15:20'), 'Kim logs a resident’s drop-off at Marsh Road TDSR');
    const dropOff = kim.dropOffLog({ residentName: 'Carl Jensen', originAddress: '14 Heron St' });
    const pile = (suffix: string, tag: string, loadCall: number, after?: string) =>
      done(
        sam.complete(started[`201004-${suffix}`] ?? '', {
          number: after === undefined ? made : chained(after),
          splitSuffix: suffix,
          debrisType: 'Mulch',
          fieldTag: tag,
          loadCall,
          ...atTheTdsr,
        }),
      );
    story.at(tuesday('15:30'), 'Zone 1 pile is on: Mulch, 10% so far; his phone shows 201004');
    pile('A', 'Zone 1 pile', 10);
    story.at(tuesday('15:35'), 'Sam taps split: the next pile, the same badge');
    started['201004-B'] = begin(sam, 'HAUL_OUT', 'HAUL_OUT_COLLECTION', '730419');
    story.at(tuesday('15:45'), 'Zone 2 pile: 35% so far');
    pile('B', 'Zone 2 pile', 35, started['201004-A']);
    story.at(tuesday('15:50'), 'Split again');
    started['201004-C'] = begin(sam, 'HAUL_OUT', 'HAUL_OUT_COLLECTION', '730419');
    story.at(tuesday('16:05'), 'Zone 3 pile: 85%, the haul-out’s call');
    pile('C', 'Zone 3 pile', 85, started['201004-B']);
    story.check(
      'AC-04-10 the first pile made the number and the chain carried it: one number, three piles, and 201005 is next',
      [
        sam.waiting.map(
          (event) => `${event.ticketNumber}-${event.splitSuffix} ${String(event.loadCall)}%`,
        ),
        sam.nextNumber('HAUL_OUT'),
      ],
      [['201001- 90%', '201004-A 10%', '201004-B 35%', '201004-C 85%'], 201005],
    );

    story.at(tuesday('16:50'), 'Jo scans the skid steer crew, 730418, at the end of its day');
    started['301007'] = begin(jo, 'UNIT_RATE', 'UNIT_RATE', '730418');
    story.at(
      tuesday('17:00'),
      'The walking floor has crossed the scale at Cypress Creek Landfill; Lee scans 730419',
    );
    started['hod201004'] = begin(lee, 'HAUL_OUT', 'HAUL_OUT_DISPOSAL', '730419');
    story.at(tuesday('17:05'), 'Jo picks Crew time: Skid Steer 9.75 h, Truck 8.50 h');
    done(
      jo.complete(started['301007'], {
        number: made,
        payableType: 'Crew time',
        items: [
          { name: 'Skid Steer', quantity: 9.75 },
          { name: 'Truck', quantity: 8.5 },
        ],
      }),
    );
    story.at(
      tuesday('17:15'),
      'Lee picks Mulch, copies scale receipt CCL-51207 by hand (79,600 lb gross, 31,600 tare, 48,000 net, 24.00 tons) and scans 201004',
    );
    done(
      lee.complete(started['hod201004'], {
        number: scanned('201004'),
        debrisType: 'Mulch',
        scaleReceipt: {
          receiptNumber: 'CCL-51207',
          grossWeightLb: 79600,
          tareWeightLb: 31600,
          netWeightLb: 48000,
          netWeightTons: 24,
        },
      }),
    );
    story.check(
      'the receipt is its own record on Lee’s phone, ahead of the disposal that points at it',
      lee.waitingRecords.map((sent) => sent.record),
      ['SCALE_RECEIPT', 'FIELD_EVENT'],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      tuesday('18:30'),
      'At the yard five phones sync. P1-TWR-TDSR’s battery is flat: its day stays on it',
    );
    story.check(
      'Ana’s two, Tariq’s one, Sam’s four, Lee’s receipt and disposal, Jo’s four tickets and her incident',
      [
        await ana.sync(story.intake),
        await tariq.sync(story.intake),
        await sam.sync(story.intake),
        await lee.sync(story.intake),
        await jo.sync(story.intake),
      ],
      [2, 1, 4, 2, 5],
    );
    story.check(
      'Tuesday night: 101004, 101005 and 101006 wait with their collection alone, PENDING; nothing is flagged or refused for it',
      (await onServer()).filter((line) => /^10100[456] /.test(line)),
      ['101004 COLLECTION PENDING', '101005 COLLECTION PENDING', '101006 COLLECTION PENDING'],
    );
    story.at(on('14', '07:10'), 'Wednesday: P1-TWR-TDSR is charged and syncs Tuesday’s work');
    story.check(
      'its three disposals and the drop-off log, in the order recorded',
      [kim.waitingRecords.map((sent) => sent.record), await kim.sync(story.intake)],
      [['FIELD_EVENT', 'FIELD_EVENT', 'FIELD_EVENT', 'DROP_OFF_LOG'], 4],
    );

    // ------------------------------------------------------------------------------------------
    const users = new Map((await api.user.findMany()).map((user) => [user.id, user.name]));
    const deviceNames = new Map((await api.device.findMany()).map((each) => [each.id, each.name]));
    const events = await api.fieldEvent.findMany({
      include: {
        formDebrisType: { include: { debrisType: true } },
        form: true,
        fieldTag: true,
        numberTypedReason: true,
        payableType: true,
        kindOfWork: true,
        payItem: true,
        scaleReceipt: true,
        items: { include: { itemName: true }, orderBy: { itemName: { position: 'asc' } } },
      },
      orderBy: [{ ticketNumber: 'asc' }, { splitSuffix: 'asc' }, { endedAt: 'asc' }],
    });
    const short: Record<FieldEventKind, string> = {
      COLLECTION: 'COL',
      DISPOSAL: 'DIS',
      HAUL_OUT_COLLECTION: 'HOC',
      HAUL_OUT_DISPOSAL: 'HOD',
      UNIT_RATE: 'URT',
    };
    const numberOf = (event: { ticketNumber: string; splitSuffix: string }): string =>
      event.splitSuffix === '' ? event.ticketNumber : `${event.ticketNumber}-${event.splitSuffix}`;
    const fieldDay = events.filter((event) => event.workflow !== 'UNIT_RATE');
    story.check(
      'AC-04-93 every load and haul-out field event is on the server as recorded: its kind, when it ended, who recorded it, the badge, the debris type picked, the site from the assignment, the load call',
      fieldDay.map((event) =>
        [
          numberOf(event),
          short[event.kind],
          projectTime(timeZone, event.endedAt),
          users.get(event.monitorId),
          event.certNumber,
          event.formDebrisType?.debrisType.name,
          event.siteId === null ? 'no site' : siteNames.get(event.siteId),
          event.loadCall === null ? 'no call' : `${String(event.loadCall)}%`,
        ].join(' · '),
      ),
      [
        '101001 · COL · Mon 12 Oct 08:40 · Ana Brooks · 730415 · Vegetative · no site · no call',
        '101001 · DIS · Mon 12 Oct 09:25 · Kim Nguyen · 730415 · Vegetative · Marsh Road TDSR · 80%',
        '101002 · COL · Mon 12 Oct 10:10 · Ana Brooks · 730416 · C&D · no site · no call',
        '101002 · DIS · Mon 12 Oct 10:50 · Tariq Patel · 730416 · C&D · Bayline County Landfill · 75%',
        '101003 · COL · Mon 12 Oct 11:30 · Ana Brooks · 730415 · Vegetative · no site · no call',
        '101003 · DIS · Mon 12 Oct 12:05 · Kim Nguyen · 730415 · Vegetative · Marsh Road TDSR · 96%',
        '101004 · COL · Mon 12 Oct 17:50 · Ana Brooks · 730416 · Vegetative · no site · no call',
        '101004 · DIS · Tue 13 Oct 07:15 · Kim Nguyen · 730416 · Vegetative · Marsh Road TDSR · 50%',
        '101005 · COL · Tue 13 Oct 10:05 · Ana Brooks · 730415 · Vegetative · no site · no call',
        '101005 · DIS · Tue 13 Oct 10:40 · Kim Nguyen · 730415 · Vegetative · Marsh Road TDSR · 70%',
        '101006 · COL · Tue 13 Oct 11:30 · Ana Brooks · 730416 · Vegetative · no site · no call',
        '101060 · DIS · Tue 13 Oct 12:10 · Kim Nguyen · 730416 · Vegetative · Marsh Road TDSR · 60%',
        '201001 · HOC · Tue 13 Oct 13:00 · Sam Grant · 730419 · Mulch · Marsh Road TDSR · 90%',
        '201001 · HOD · Tue 13 Oct 14:10 · Tariq Patel · 730419 · Mulch · Bayline County Landfill · no call',
        '201004 · HOD · Tue 13 Oct 17:15 · Lee Morgan · 730419 · Mulch · Cypress Creek Landfill · no call',
        '201004-A · HOC · Tue 13 Oct 15:30 · Sam Grant · 730419 · Mulch · Marsh Road TDSR · 10%',
        '201004-B · HOC · Tue 13 Oct 15:45 · Sam Grant · 730419 · Mulch · Marsh Road TDSR · 35%',
        '201004-C · HOC · Tue 13 Oct 16:05 · Sam Grant · 730419 · Mulch · Marsh Road TDSR · 85%',
      ],
    );
    story.check(
      'each debris type came with its form, read from the project and the workflow: a load’s from the load form, a haul-out’s from the haul-out form',
      [...new Set(fieldDay.map((event) => `${event.workflow}: ${event.form?.name ?? 'no form'}`))],
      ['LOAD: Load', 'HAUL_OUT: Haul-out'],
    );
    story.check(
      'each pile kept its field tag; the haul-out weighed at Cypress Creek points at receipt CCL-51207, with every figure as the paper has it and none on the field event',
      [
        fieldDay
          .filter((event) => event.fieldTag !== null)
          .map((event) => `${numberOf(event)} ${event.fieldTag?.name ?? ''}`),
        fieldDay
          .filter((event) => event.scaleReceipt !== null)
          .map((event) => [
            numberOf(event),
            short[event.kind],
            event.scaleReceipt?.receiptNumber,
            siteNames.get(event.scaleReceipt?.siteId ?? ''),
            event.scaleReceipt?.grossWeightLb?.toFixed(2),
            event.scaleReceipt?.tareWeightLb?.toFixed(2),
            event.scaleReceipt?.netWeightLb?.toFixed(2),
            event.scaleReceipt?.netWeightTons?.toFixed(4),
            users.get(event.scaleReceipt?.enteredById ?? ''),
          ]),
        await api.scaleReceipt.count(),
      ],
      [
        ['201004-A Zone 1 pile', '201004-B Zone 2 pile', '201004-C Zone 3 pile'],
        [
          [
            '201004',
            'HOD',
            'CCL-51207',
            'Cypress Creek Landfill',
            '79600.00',
            '31600.00',
            '48000.00',
            '24.0000',
            'Lee Morgan',
          ],
        ],
        1,
      ],
    );
    story.check(
      'the typed number is kept as typed, with its reason; every other number was scanned or shown',
      events
        .filter((event) => event.numberTyped)
        .map((event) => [numberOf(event), short[event.kind], event.numberTypedReason?.name]),
      [['101060', 'DIS', 'Barcode damaged']],
    );
    const unitRate = events.filter((event) => event.workflow === 'UNIT_RATE');
    story.check(
      'AC-04-93, AC-04-59, AC-04-70 every unit rate ticket is on the server as recorded: the crew, the payable type picked and its kind of work, the pay item the phone worked out, the count and what was measured',
      unitRate.map((event) =>
        [
          numberOf(event),
          projectTime(timeZone, event.endedAt),
          event.certNumber,
          event.payableType?.name,
          event.kindOfWork?.name,
          event.payItem?.code ?? 'no pay item',
          event.unitCount === null ? 'no count' : event.unitCount.toFixed(2),
          event.measurementInches === null
            ? 'not measured'
            : `${event.measurementInches.toFixed(1)} in ${String(event.measuredAs)}`,
        ].join(' · '),
      ),
      [
        '301001 · Mon 12 Oct 09:55 · 730417 · Hangers · Hangers · HNG-RMV-EA · 1.00 · 3.0 in DIAMETER',
        '301002 · Mon 12 Oct 11:10 · 730417 · Leaners · Leaners · LNR-RMV-EA-24 · 1.00 · 56.5 in CIRCUMFERENCE',
        '301003 · Mon 12 Oct 13:10 · 730417 · Hangers · Hangers · HNG-RMV-EA · 1.00 · 3.0 in DIAMETER',
        '301004 · Tue 13 Oct 08:50 · 730418 · Stumps · Stumps · STP-RMV-EA-36 · 1.00 · 30.0 in DIAMETER',
        '301005 · Tue 13 Oct 09:20 · 730418 · Stumps · Stumps · no pay item · 1.00 · 20.0 in DIAMETER',
        '301006 · Tue 13 Oct 11:15 · 730417 · White Goods · White Goods · WG-RMV-EA · no count · not measured',
        '301007 · Tue 13 Oct 17:05 · 730418 · Crew time · Crew time · CREW-TIME-HR · no count · not measured',
      ],
    );
    story.check(
      'the stump’s root ball, its exposure and its survey number; the white goods’ items and the crew’s hours, each a line of its ticket; the address typed at 40 Birch Ln',
      unitRate
        .filter((event) => event.items.length > 0 || event.rootBallInches !== null)
        .map((event) => [
          numberOf(event),
          event.rootBallInches?.toFixed(1) ?? null,
          event.rootBallHalfExposed,
          event.surveyNumber,
          event.address,
          event.items.map((item) => `${item.itemName.name} ${item.quantity.toFixed(2)}`),
        ]),
      [
        ['301004', '96.0', true, 'APN 14-0321-007', null, []],
        [
          '301006',
          null,
          null,
          null,
          '40 Birch Ln',
          ['Washer 2.00', 'Dryer 1.00', 'Fridge, freon recovered 2.00', 'Fridge, no freon 1.00'],
        ],
        ['301007', null, null, null, null, ['Skid Steer 9.75', 'Truck 8.50']],
      ],
    );
    story.check(
      'AC-04-17 each field event kept the id its phone made when the badge was scanned: the server holds exactly those twenty-five, none twice',
      [
        events.length,
        [...events.map((event) => event.id)].sort().join() === [...ids].sort().join(),
        events.every((event) => uuidv7Time(event.id).getTime() === event.startedAt.getTime()),
        events.every((event) => event.startedAt.getTime() < event.endedAt.getTime()),
      ],
      [25, true, true, true],
    );
    const assignmentDay = new Map([
      ...Object.values(boards.monday).map((id) => [id, 'Mon'] as const),
      ...Object.values(boards.tuesday).map((id) => [id, 'Tue'] as const),
    ]);
    story.check(
      'each came from its monitor’s phone, with the assignment that phone held that day and the version of its lists',
      [
        ...new Set(
          events.map((event) =>
            [
              deviceNames.get(event.deviceId ?? ''),
              users.get(event.monitorId),
              event.source,
              `${assignmentDay.get(event.assignmentId ?? '') ?? 'no'} assignment`,
              `v${String(event.setupVersion)}`,
              projectTime(timeZone, event.endedAt).slice(0, 3),
            ].join(' · '),
          ),
        ),
      ].sort(),
      [
        'P1-COL-1 · Ana Brooks · DEVICE · Mon assignment · v1 · Mon',
        'P1-COL-1 · Ana Brooks · DEVICE · Tue assignment · v1 · Tue',
        'P1-HO-TDSR · Sam Grant · DEVICE · Tue assignment · v1 · Tue',
        'P1-TWR-CCL · Lee Morgan · DEVICE · Tue assignment · v1 · Tue',
        'P1-TWR-LF · Tariq Patel · DEVICE · Mon assignment · v1 · Mon',
        'P1-TWR-LF · Tariq Patel · DEVICE · Tue assignment · v1 · Tue',
        'P1-TWR-TDSR · Kim Nguyen · DEVICE · Mon assignment · v1 · Mon',
        'P1-TWR-TDSR · Kim Nguyen · DEVICE · Tue assignment · v1 · Tue',
        'P1-UR-1 · Jo Kim · DEVICE · Mon assignment · v1 · Mon',
        'P1-UR-1 · Jo Kim · DEVICE · Tue assignment · v1 · Tue',
      ],
    );
    const incidents = await api.incident.findMany({
      include: { incidentType: true, incidentSubType: true },
    });
    const dropOffs = await api.dropOffLog.findMany();
    story.check(
      'AC-04-93 the incident and the drop-off log are on the server as recorded, each with the id its phone made; neither has a number, a quantity or a status',
      [
        incidents.map((row) => [
          row.id === incident.id,
          projectTime(timeZone, row.madeAt),
          users.get(row.monitorId),
          row.incidentType.name,
          row.incidentSubType?.name,
          row.address,
          row.parties,
          row.certNumber,
          row.contractorId,
          row.answers,
        ]),
        dropOffs.map((row) => [
          row.id === dropOff.id,
          projectTime(timeZone, row.madeAt),
          users.get(row.monitorId),
          siteNames.get(row.siteId),
          row.residentName,
          row.originAddress,
          row.answers,
        ]),
      ],
      [
        [
          [
            true,
            'Tue 13 Oct 11:50',
            'Jo Kim',
            'Property damage',
            'Mailbox struck',
            '22 Elm St',
            null,
            '730416',
            null,
            {},
          ],
        ],
        [
          [
            true,
            'Tue 13 Oct 15:20',
            'Kim Nguyen',
            'Marsh Road TDSR',
            'Carl Jensen',
            '14 Heron St',
            {},
          ],
        ],
      ],
    );
    story.check(
      'AC-04-93 every field event is PENDING and nothing is concluded: no completed load, no certification found (this story certifies no truck), no pay item on a load; pairing, flags and money are the engine’s',
      [
        [...new Set(events.map((event) => event.status))],
        await api.completedLoad.count(),
        events.filter((event) => event.certificationId !== null).length,
        fieldDay.filter((event) => event.payItemId !== null).length,
      ],
      [['PENDING'], 0, 0, 0],
    );
    story.check(
      'AC-04-10 the numbers each phone made are its block’s, in order, and it knows the last it used; the towers made none',
      Object.fromEntries(
        Object.entries(phones).map(([name, each]) => [
          name,
          (['LOAD', 'HAUL_OUT', 'UNIT_RATE'] as const)
            .map((series) => each.lastUsedNumber(series))
            .filter((used) => used !== null),
        ]),
      ),
      {
        'P1-COL-1': [101006],
        'P1-TWR-TDSR': [],
        'P1-TWR-LF': [],
        'P1-HO-TDSR': [201004],
        'P1-UR-1': [301007],
        'P1-TWR-CCL': [],
      },
    );
    const audit = await api.auditRecord.findMany({
      where: {
        tableName: {
          in: ['field_event', 'field_event_item', 'scale_receipt', 'incident', 'drop_off_log'],
        },
      },
      orderBy: { id: 'asc' },
    });
    const audited: Record<string, number> = {};
    for (const record of audit) {
      const key = [
        users.get(record.actorId ?? ''),
        deviceNames.get(record.deviceId ?? ''),
        record.source,
        record.tableName,
        record.operation,
      ].join(' · ');
      audited[key] = (audited[key] ?? 0) + 1;
    }
    story.check(
      'every record received is in the audit log once, as its monitor, from their phone; nothing was changed afterwards',
      audited,
      {
        'Kim Nguyen · P1-TWR-TDSR · DEVICE · field_event · INSERT': 5,
        'Tariq Patel · P1-TWR-LF · DEVICE · field_event · INSERT': 2,
        'Jo Kim · P1-UR-1 · DEVICE · field_event · INSERT': 7,
        'Jo Kim · P1-UR-1 · DEVICE · field_event_item · INSERT': 6,
        'Jo Kim · P1-UR-1 · DEVICE · incident · INSERT': 1,
        'Ana Brooks · P1-COL-1 · DEVICE · field_event · INSERT': 6,
        'Sam Grant · P1-HO-TDSR · DEVICE · field_event · INSERT': 4,
        'Lee Morgan · P1-TWR-CCL · DEVICE · scale_receipt · INSERT': 1,
        'Lee Morgan · P1-TWR-CCL · DEVICE · field_event · INSERT': 1,
        'Kim Nguyen · P1-TWR-TDSR · DEVICE · drop_off_log · INSERT': 1,
      },
    );
  },
};
