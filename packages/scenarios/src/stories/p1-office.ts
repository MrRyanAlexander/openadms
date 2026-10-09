// What the stories of the worker's run share (the stories `p1-reconciled` and `p1-priced`;
// BACKLOG 1.5.9, 1.7.2; ADR-352, 359): P1's two field days exactly as the story `p1-field-days`
// records them, held on its phones until each phone's own sync; and what that story leaves out
// and the worker reads: P1's map, its five certifications, and the golden mission's load,
// haul-out, fee, fill and freon pay items with every rule of its §1.
//
// Each step here is told by the story that calls it: it moves the clock and says what happens,
// then calls the step.
import {
  Certifications,
  ListSetup,
  PayItemSetup,
  ProjectSetup,
  RuleSetup,
  SiteSetup,
  type BoxInput,
  type CriterionInput,
  type NewCertification,
  type NewPayItem,
} from '@open-adms/api';

import { createHash } from 'node:crypto';

import { StoryClock, utcOffsetMinutes } from '../clock.ts';
import { SimulatedDevice, type PhoneRecord } from '../device.ts';
import { uuidv7 } from '../ids.ts';
import type { StoryContext } from '../runner.ts';
import { p1FieldDays } from './p1-field-days.ts';
import { p1TimeZone as timeZone } from './p1.ts';
import { p1Boundary, p1Zones } from './setup.ts';

const on = (date: string, time: string): string => `2026-10-${date}T${time}:00-04:00`;

export const primaryBox = (length: number, width: number, height: number): BoxInput => ({
  shape: 'RECTANGLE',
  sign: 'ADD',
  length,
  width,
  height,
});

type Saving<T> = Promise<
  { saved: true; record: T } | { saved: false; refusal: { message: string } }
>;

export async function saved<T>(attempt: Saving<T>): Promise<T> {
  const outcome = await attempt;
  if (!outcome.saved) throw new Error(`Refused: ${outcome.refusal.message}`);
  return outcome.record;
}

// A record a phone holds, with the time its phone found signal.
export interface HeldRecord {
  readonly sent: PhoneRecord;
  readonly syncedAt: Date;
}

export interface P1Office {
  readonly held: readonly HeldRecord[];
  readonly dana: string;
  readonly luis: string;
  readonly sam: string;
  readonly lee: string;
  readonly p1: string;
  readonly coastline: string;
  readonly contract: string;
  readonly tdsr: string;
  readonly landfill: string;
  readonly cypress: string;
  // P1-HO-TDSR, the phone Sam Grant certifies on.
  readonly samPhone: string;
}

// The two field days, exactly as the story `p1-field-days` records them, on a clock of their
// own, with every phone's sync held back: each record is kept with the time its phone found
// signal, and that story's own checks aren't asked again. It sets P1 up as it goes (its sites,
// forms, unit rate pay items, people, phones and dispatch board).
export async function p1FieldDaysHeld(story: StoryContext): Promise<P1Office> {
  const { api } = story;
  const held: HeldRecord[] = [];
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
  const site = async (name: string): Promise<string> =>
    (await api.disposalSite.findFirstOrThrow({ where: { name } })).id;
  const project = await api.project.findFirstOrThrow();
  return {
    held,
    dana: await person('Dana Reyes'),
    luis: await person('Luis Ortega'),
    sam: await person('Sam Grant'),
    lee: await person('Lee Morgan'),
    p1: project.id,
    coastline: (await api.contractor.findFirstOrThrow({ where: { name: 'Coastline Haulers LLC' } }))
      .id,
    contract: (
      await api.contract.findFirstOrThrow({ where: { name: 'Coastline, Bayline ROW 2026' } })
    ).id,
    tdsr: await site('Marsh Road TDSR'),
    landfill: await site('Bayline County Landfill'),
    cypress: await site('Cypress Creek Landfill'),
    samPhone: (await api.device.findFirstOrThrow({ where: { name: 'P1-HO-TDSR' } })).id,
  };
}

// Dana loads P1's map: its boundary and three zones.
export async function loadP1Map(story: StoryContext, office: P1Office): Promise<void> {
  await saved(
    new ProjectSetup(story.api, story.clock, story.policy).loadMap(office.dana, {
      projectId: office.p1,
      source: 'UPLOAD',
      sourceName: 'bayline-row-zones-v1.geojson',
      boundary: p1Boundary,
      zones: p1Zones,
      zoneNameField: 'ZONE_NAME',
    }),
  );
}

// A certification on Saturday 10 October, at a time of that day, as Sam Grant makes one on
// P1-HO-TDSR with Lee Morgan helping. Coastline's unless told.
export type P1Certify = (
  time: string,
  more: Partial<NewCertification> & Pick<NewCertification, 'certNumber' | 'boxes'>,
) => Promise<void>;

// Saturday: Sam Grant certifies P1's three containers and two crews (golden mission §1). The
// answer certifies another that day, for a story that needs one more.
export async function certifyP1(story: StoryContext, office: P1Office): Promise<P1Certify> {
  const { api, clock } = story;
  const { luis, sam, lee, p1, coastline, samPhone } = office;
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
  const certify: P1Certify = async (time, more) => {
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
      primaryBox(360, 96, 72),
      { ...primaryBox(360, 96, 16), featureId: await feature('Sideboards') },
    ],
  });
  await certify('09:40', {
    certNumber: '730416',
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
      primaryBox(576, 96, 93),
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
  return certify;
}

// The phones' syncs, in the order the story `p1-field-days` has them: Monday evening, Tuesday
// evening, and the Marsh Road tower's on Wednesday.
export class P1Syncs {
  readonly times: readonly Date[];
  private readonly story: StoryContext;
  private readonly held: readonly HeldRecord[];

  constructor(story: StoryContext, held: readonly HeldRecord[]) {
    this.story = story;
    this.held = held;
    this.times = [...new Set(held.map((each) => each.syncedAt.getTime()))]
      .sort((left, right) => left - right)
      .map((time) => new Date(time));
  }

  // A phone's records reach the server: the ones it sent at that sync in `p1-field-days`.
  async arrive(syncedAt: Date): Promise<number> {
    const arriving = this.held.filter((each) => each.syncedAt.getTime() === syncedAt.getTime());
    for (const { sent } of arriving) {
      const answer = await this.story.intake.receive(sent);
      if (answer.answer !== 'SAVED') throw new Error(`Not saved: ${answer.answer}`);
    }
    return arriving.length;
  }

  // Jo's crew photograph with each unit rate ticket (golden mission §2), taken as the ticket
  // was completed and sent after that sync's records. The story `p1-field-days` takes none,
  // so each photograph's record is made here as her phone would have sent it.
  async crewPhotographs(syncedAt: Date): Promise<number> {
    let sent = 0;
    for (const { sent: record, syncedAt: at } of this.held) {
      if (at.getTime() !== syncedAt.getTime()) continue;
      if (record.record !== 'FIELD_EVENT' || record.fieldEvent.kind !== 'UNIT_RATE') continue;
      const event = record.fieldEvent;
      const file = `P1-UR-1/${event.endedAt.toISOString()}/crew`;
      const fingerprint = createHash('sha256').update(file).digest('hex');
      const answer = await this.story.intake.receive({
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
  }
}

// The pay items a rule adds and no monitor picks, by their codes, and the fill's rule.
export interface P1Pricing {
  readonly payItems: Readonly<Record<string, string>>;
  readonly forms: { readonly load: string; readonly haulOut: string; readonly unitRate: string };
  readonly vegetative: string;
  // "STP-FILL-CY - Stump hole fill", the one rule Dana writes in the rule builder.
  readonly fillRule: {
    readonly id: string;
    readonly input: Parameters<RuleSetup['save']>[1];
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

// Dana enters what the story `p1-field-days` leaves out of P1's pricing (golden mission §1, as
// the story `setup` tells it step by step): the load, haul-out, fee, fill and freon pay items
// with Coastline's rate on each, the Landfill's link to its tipping fee pay item, and every
// rule, each naming "Coastline, Bayline ROW 2026". A pay item's "Pays when" writes its rule; the
// stump hole fill's is written in the rule builder.
export async function setUpP1Pricing(story: StoryContext, office: P1Office): Promise<P1Pricing> {
  const { api, clock } = story;
  const { dana, p1, coastline, contract, landfill, cypress } = office;
  const payItems = new PayItemSetup(api, clock);
  const lists = new ListSetup(api, clock);

  const payableType = async (name: string): Promise<string> =>
    (await api.payableType.findFirstOrThrow({ where: { name } })).id;
  await saved(lists.payableType(dana, 'Stump fill'));
  await saved(lists.payableType(dana, 'Freon recovery'));
  const enter = async (
    code: string,
    description: string,
    type: string,
    unit: NewPayItem['unit'],
    rate: string,
  ): Promise<void> => {
    await saved(
      payItems.payItem(dana, {
        ...unticked,
        projectId: p1,
        code,
        description,
        payableTypeId: await payableType(type),
        unit,
        rates: [{ primeId: coastline, rate }],
      }),
    );
  };
  await enter('VEG-HAUL-CY-15', 'ROW VEG haul 0–15 mi', 'Vegetative', 'CY', '7.50');
  await enter('VEG-HAUL-CY-30', 'ROW VEG haul 15.1–30 mi', 'Vegetative', 'CY', '8.90');
  await enter('CD-HAUL-CY-15', 'ROW C&D haul 0–15 mi', 'C&D', 'CY', '8.25');
  await enter('MULCH-HO-CY', 'Mulch haul-out to FDS', 'Vegetative', 'CY', '5.10');
  await enter('MULCH-HO-TN', 'Mulch haul-out to FDS, by weight', 'Vegetative', 'TN', '20.00');
  await enter(
    'TIP-FEE-CY-BCL',
    'Tipping fee, Bayline County Landfill',
    'Tipping fee',
    'CY',
    '4.00',
  );
  await enter('STP-FILL-CY', 'Stump hole fill', 'Stump fill', 'CY', '22.00');
  await enter('WG-FRN-EA', 'Freon recovered', 'Freon recovery', 'EA', '25.00');
  const ids = Object.fromEntries(
    (await api.payItem.findMany({ where: { projectId: p1 } })).map((each) => [each.code, each.id]),
  );
  const id = (code: string): string => {
    const found = ids[code];
    if (found === undefined) throw new Error(`No pay item ${code}`);
    return found;
  };
  await saved(new SiteSetup(api, clock).tippingFee(dana, landfill, id('TIP-FEE-CY-BCL')));

  const form = async (documentType: 'LOAD' | 'HAUL_OUT' | 'UNIT_RATE'): Promise<string> =>
    (await api.form.findFirstOrThrow({ where: { projectId: p1, documentType } })).id;
  const forms = {
    load: await form('LOAD'),
    haulOut: await form('HAUL_OUT'),
    unitRate: await form('UNIT_RATE'),
  };
  const entry = async (formId: string, name: string): Promise<string> =>
    (await api.formDebrisType.findFirstOrThrow({ where: { formId, debrisType: { name } } })).id;
  const itemName = async (name: string): Promise<string> =>
    (await api.itemName.findFirstOrThrow({ where: { name } })).id;
  const vegetative = await entry(forms.load, 'Vegetative');
  const debris = (entryId: string): CriterionInput => ({
    criterion: 'DEBRIS_TYPE',
    operator: 'EQUALS',
    picks: [entryId],
  });
  const within15: CriterionInput = { criterion: 'MILEAGE', operator: 'AT_MOST', numberFrom: 15 };
  const dumpedAt = (siteId: string): CriterionInput => ({
    criterion: 'DISPOSAL_SITE',
    operator: 'EQUALS',
    picks: [siteId],
  });
  const payItemIs = (...payItemIds: string[]): CriterionInput => ({
    criterion: 'PAY_ITEM',
    operator: payItemIds.length === 1 ? 'EQUALS' : 'IS_ONE_OF',
    picks: payItemIds,
  });
  const pays = async (
    code: string,
    formId: string,
    criteria: CriterionInput[],
    slot = 1,
  ): Promise<void> => {
    await saved(payItems.paysWhen(dana, id(code), [{ formId, slot, criteria }]));
  };

  await pays('VEG-HAUL-CY-15', forms.load, [debris(vegetative), within15]);
  await pays('VEG-HAUL-CY-30', forms.load, [
    debris(vegetative),
    { criterion: 'MILEAGE', operator: 'BETWEEN', numberFrom: 15.1, numberTo: 30 },
  ]);
  await pays('CD-HAUL-CY-15', forms.load, [debris(await entry(forms.load, 'C&D')), within15]);
  // The site's tipping fee: the same pay item on a load and on a haul-out dumped there, a rule
  // for each form (ADR-292).
  await saved(
    payItems.paysWhen(dana, id('TIP-FEE-CY-BCL'), [
      { formId: forms.load, slot: 2, criteria: [dumpedAt(landfill)] },
      { formId: forms.haulOut, slot: 2, criteria: [dumpedAt(landfill)] },
    ]),
  );
  const mulch = await entry(forms.haulOut, 'Mulch');
  await pays('MULCH-HO-CY', forms.haulOut, [debris(mulch), dumpedAt(landfill)]);
  await pays('MULCH-HO-TN', forms.haulOut, [debris(mulch), dumpedAt(cypress)]);
  for (const code of [
    'HNG-RMV-EA',
    'LNR-RMV-EA-24',
    'LNR-RMV-EA-99',
    'STP-RMV-EA-36',
    'STP-RMV-EA-48',
    'CREW-TIME-HR',
  ]) {
    await pays(code, forms.unitRate, [payItemIs(id(code))]);
  }
  // White goods: the rules, never a setting on the item, say which items count toward which pay
  // item (spec/RULES.md §9).
  const freonRecovered = await itemName('Fridge, freon recovered');
  const removed = await Promise.all(
    ['Washer', 'Dryer', 'Fridge, freon recovered', 'Fridge, no freon', 'Oven', 'Microwave'].map(
      itemName,
    ),
  );
  await saved(
    payItems.paysWhen(dana, id('WG-RMV-EA'), [
      {
        formId: forms.unitRate,
        slot: 1,
        criteria: [payItemIs(id('WG-RMV-EA'))],
        quantityFrom: 'CHOSEN_ITEMS',
        itemNameIds: removed,
      },
    ]),
  );
  await saved(
    payItems.paysWhen(dana, id('WG-FRN-EA'), [
      {
        formId: forms.unitRate,
        slot: 2,
        criteria: [
          payItemIs(id('WG-RMV-EA')),
          { criterion: 'ITEM', operator: 'AT_LEAST', picks: [freonRecovered], numberFrom: 1 },
        ],
        quantityFrom: 'CHOSEN_ITEMS',
        itemNameIds: [freonRecovered],
      },
    ]),
  );
  const fill = {
    projectId: p1,
    formId: forms.unitRate,
    name: 'STP-FILL-CY - Stump hole fill',
    contractId: contract,
    active: true,
    criteria: [payItemIs(id('STP-RMV-EA-36'), id('STP-RMV-EA-48'))],
    actions: [{ kind: 'ADD_TRANSACTION', slot: 2, payItemId: id('STP-FILL-CY') }],
  } as const;
  const fillRule = await saved(new RuleSetup(api, clock).save(dana, fill));
  return { payItems: ids, forms, vegetative, fillRule: { id: fillRule.id, input: fill } };
}
