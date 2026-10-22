// P1 as its field days find it (spec/golden/MISSION.md §1; ADR-332, 603): what the back office set
// up before Monday 12 October and who works where on it, shared by the story `p1-field-days`,
// which tells the two days on simulated phones, and the field app's browser world for the golden
// mission (`MissionWorld`), whose phones are the browser's. Nothing here moves the clock or says
// what happens: the caller tells it.
//
// - `setUpP1ForTheField`: Dana Reyes and Luis Ortega (he writes the board: Dana grants him
//   *dispatch*, ADR-428, 429), P1 and its three sites, the firm's sub-type of an incident, its
//   forms with their debris types, its field tags, and the unit rate pay items a monitor's work
//   falls to, each with Coastline's rate; and the six monitors, created as real ones are, on a
//   phone, online, under the master passcode (ADR-442).
// - `p1Plan` and `boardP1`: Luis's dispatch board for Monday, copied to Tuesday (ADR-240), each
//   assignment naming the phone its monitor takes it on.
import {
  FormSetup,
  ListSetup,
  type NewAssignment,
  type NewPayItem,
  PayItemSetup,
  ProjectSetup,
  SiteSetup,
} from '@open-adms/api';
import type { FieldEventKind, FormDocumentType } from '@open-adms/db';
import { uuidv7 } from '@open-adms/domain';

import type { StoryContext, StoryMonitor } from '../runner.ts';
import { assigned } from './board.ts';
import { saved, unticked } from './p1-office.ts';
import { danasEmail, luissEmail, setUpP1, setUpP1Sites } from './p1.ts';

// The six monitors of P1's field days (golden mission §1), in the order they are created.
export const p1Monitors = [
  'Ana Brooks',
  'Kim Nguyen',
  'Tariq Patel',
  'Jo Kim',
  'Sam Grant',
  'Lee Morgan',
] as const;
export type P1MonitorName = (typeof p1Monitors)[number];

// P1's field phones (golden mission §1), each enrolled once.
export const p1Phones = [
  'P1-COL-1',
  'P1-TWR-TDSR',
  'P1-TWR-LF',
  'P1-HO-TDSR',
  'P1-TWR-CCL',
  'P1-UR-1',
] as const;
export type P1PhoneName = (typeof p1Phones)[number];

export interface P1Field {
  readonly dana: string;
  readonly luis: string;
  readonly p1: string;
  readonly coastline: string;
  readonly tdsr: string;
  readonly landfill: string;
  readonly cypress: string;
  readonly loadForm: string;
  readonly haulOutForm: string;
  // Each monitor as created, by name.
  readonly monitors: Readonly<Record<P1MonitorName, StoryMonitor>>;
  // The unit rate pay items Jo Kim's work falls to, in the order entered.
  readonly unitRateWork: readonly { readonly id: string; readonly code: string }[];
}

// Dana's setup of P1 for its field days, now by the story's clock, and the six monitors created
// on the phone given (enrolled already).
export async function setUpP1ForTheField(
  story: StoryContext,
  monitorsOn: string,
): Promise<P1Field> {
  const { api, clock, policy } = story;
  const dana = uuidv7(clock.now());
  const office = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
    // Each with the address they sign in with at the back office (CONVENTIONS §6).
    await tx.user.create({
      data: { id: dana, name: 'Dana Reyes', role: 'ADMIN', email: danasEmail },
    });
    const luis = await tx.user.create({
      data: { name: 'Luis Ortega', role: 'MANAGER_ANALYST', email: luissEmail },
    });
    // Luis writes each day's board: Dana grants him *dispatch* (ADR-428, 429).
    await tx.userPermission.create({ data: { userId: luis.id, permission: 'DISPATCH' } });
    await tx.userPermission.create({ data: { userId: luis.id, permission: 'VIEW_DISPATCH' } });
    const p1 = await setUpP1(tx, policy);
    const { tdsr, landfill } = await setUpP1Sites(tx, p1.project);
    // The firm's own sub-type of an incident (golden mission §2).
    const damage = await tx.incidentType.findFirstOrThrow({ where: { name: 'Property damage' } });
    await tx.incidentSubType.create({
      data: { name: 'Mailbox struck', position: 1, incidentTypeId: damage.id },
    });
    return { luis: luis.id, p1: p1.project, coastline: p1.prime, tdsr, landfill };
  });
  const { p1, coastline } = office;

  // The six monitors, created as real ones are: on a phone, online, under the master passcode;
  // the database issues each their Monitor ID (ADR-442).
  const monitors: Partial<Record<P1MonitorName, StoryMonitor>> = {};
  for (const name of p1Monitors) monitors[name] = await story.monitor(name, monitorsOn);

  const sites = new SiteSetup(api, clock, policy);
  const forms = new FormSetup(api, clock, policy);
  const lists = new ListSetup(api, clock, policy);
  const projects = new ProjectSetup(api, clock, policy);
  const payItems = new PayItemSetup(api, clock, policy);

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

  const form = async (documentType: FormDocumentType, name: string): Promise<string> =>
    (await saved(forms.form(dana, { projectId: p1, documentType, name }))).id;
  const loadForm = await form('LOAD', 'Load');
  const haulOutForm = await form('HAUL_OUT', 'Haul-out');
  await form('UNIT_RATE', 'Unit rate');
  // What an incident offers Jo: the contractor involved and a cert number (ADR-334).
  await saved(
    forms.form(dana, {
      projectId: p1,
      documentType: 'INCIDENT',
      name: 'Incident',
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

  return {
    dana,
    ...office,
    cypress,
    loadForm,
    haulOutForm,
    monitors: monitors as Record<P1MonitorName, StoryMonitor>,
    unitRateWork: unitRateWork.map(({ id, code }) => ({ id, code })),
  };
}

// One monitor's work on the board, the phone they take it on and the one site it is at.
export interface PlannedWork {
  readonly monitor: P1MonitorName;
  readonly phone: P1PhoneName;
  readonly kinds: readonly FieldEventKind[];
  readonly forms?: NewAssignment['formDocumentTypes'];
  readonly site?: 'tdsr' | 'landfill' | 'cypress';
  readonly unitRate?: boolean;
  readonly tuesdayOnly?: boolean;
}

// The board of the golden mission §1: Ana on collections; Kim on disposals and drop-off logs at
// Marsh Road TDSR; Tariq on disposals and haul-out disposals at the Landfill; Sam on haul-out
// collections at Marsh Road TDSR; Lee on haul-out disposals at Cypress Creek Landfill, Tuesday
// alone; Jo on unit rate work and incidents.
export const p1Plan: readonly PlannedWork[] = [
  { monitor: 'Ana Brooks', phone: 'P1-COL-1', kinds: ['COLLECTION'] },
  {
    monitor: 'Kim Nguyen',
    phone: 'P1-TWR-TDSR',
    kinds: ['DISPOSAL'],
    forms: ['DROP_OFF_LOG'],
    site: 'tdsr',
  },
  {
    monitor: 'Tariq Patel',
    phone: 'P1-TWR-LF',
    kinds: ['DISPOSAL', 'HAUL_OUT_DISPOSAL'],
    site: 'landfill',
  },
  { monitor: 'Sam Grant', phone: 'P1-HO-TDSR', kinds: ['HAUL_OUT_COLLECTION'], site: 'tdsr' },
  {
    monitor: 'Lee Morgan',
    phone: 'P1-TWR-CCL',
    kinds: ['HAUL_OUT_DISPOSAL'],
    site: 'cypress',
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

// The site a planned work is at, by its id; undefined where it is at none.
export function siteOf(field: P1Field, planned: PlannedWork): string | undefined {
  return planned.site === undefined ? undefined : field[planned.site];
}

// Each day's assignments, by the phone they name.
export interface P1Boards {
  readonly monday: Readonly<Record<string, string>>;
  readonly tuesday: Readonly<Record<string, string>>;
}

// Luis writes Monday's board, then copies it to Tuesday, now by the story's clock: each
// assignment naming the phone given for it (each enrolled already).
export async function boardP1(
  story: StoryContext,
  field: P1Field,
  phones: Readonly<Record<P1PhoneName, string>>,
): Promise<P1Boards> {
  const board = async (workDate: string, people: readonly PlannedWork[]) => {
    const assignments: Record<string, string> = {};
    for (const planned of people) {
      assignments[planned.phone] = await assigned(story.api, story.clock, field.luis, {
        workDate,
        projectId: field.p1,
        personId: field.monitors[planned.monitor].id,
        fieldEventKinds: [...planned.kinds],
        formDocumentTypes: [...(planned.forms ?? [])],
        siteId: siteOf(field, planned) ?? null,
        deviceId: phones[planned.phone],
        // Each named with its own kind of work by the service (C42).
        payItemIds: planned.unitRate === true ? field.unitRateWork.map(({ id }) => id) : [],
      });
    }
    return assignments;
  };
  return {
    monday: await board(
      '2026-10-12',
      p1Plan.filter((planned) => planned.tuesdayOnly !== true),
    ),
    tuesday: await board('2026-10-13', p1Plan),
  };
}
