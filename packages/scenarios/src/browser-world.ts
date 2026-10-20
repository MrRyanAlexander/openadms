// A world of their own for the field app's browser tests (ARCHITECTURE §15; BACKLOG 3.2.2; ADR-572):
// a phone a browser test enrols, and a monitor it creates, are real records written by the real
// API, and they never go into the installation's own database, which holds no person but the
// seed's actors (ADR-396). So a run of the browser tests has a database of its own, made as a
// story's is (migrated, seeded, locked down, the stories' made-up master passcode), served by the
// API's own process at the stories' address (`https://stories.adms.localhost`, through the stack's
// proxy, over HTTPS), on the real clock, with the one page that tests it on its CORS list. It is
// dropped when the run ends; one left by a run stopped short is `pnpm scenarios clean`'s.
//
// **Its cast** (BACKLOG 3.2.3; ADR-574): before the page can call it, the world holds P1 and its
// two sites as the stories set them up, a yard phone enrolled at the API, monitors created on it
// at the API as any are, and Luis Ortega's board for the project's today and tomorrow (so a run
// across midnight still finds it): Kim Nguyen on disposals and the drop-off log at Marsh Road TDSR,
// Ana Brooks on collections and incidents, Lee Morgan on two assignments, Tariq Patel on none. A
// test signs them in on its own phone with the Monitor ID and the made-up password handed on.
// **And P2** (task 3.3.1, ADR-576), "Bayline County PPDR, Hurricane Delphine", with Marsh Road
// TDSR entered again on it and nobody's assignment: where the tests that set a phone up under the
// master passcode put the monitors they create, so that P1's login list, which other tests read
// whole, stays the cast's.
//
// **And what a collection picks from and scans** (task 3.5.1, ADR-581): P1's load form with
// Vegetative and C&D, its field tags, and two trucks certified the day before by Lee Morgan on the
// yard phone, the dump trailer 730415 (65 CY) and Rivera's self-loader 730416 (48 CY), as the
// golden mission §1 has them, through the setup and certification services as the stories write
// them. A badge of any other number is one the phone's lists don't hold. **And the PARKS project**
// (spec/CONVENTIONS.md §6, ADR-322): "Bayline County PARKS, Hurricane Delphine", its loads
// numbered from pre-printed control tickets, range 400001–405000, Vegetative on its load form, no
// truck certified, and Sam Grant on its collections today and tomorrow (made up, agent default;
// Jo Kim's until task 3.5.3 put her on P1's unit rate work, ADR-583).
//
// **And what a tower and a haul-out ask for** (task 3.5.2, ADR-582): Cypress Creek Landfill on P1
// as the story `setup` adds it; P1's haul-out form with Mulch; and four of P1's pay items, each
// with Coastline's rate and its rule naming "Coastline, Bayline ROW 2026", as the golden mission §1
// and the story `p1-left-out` set them up: Mulch hauled out to Bayline County Landfill by the CY
// (`MULCH-HO-CY`) and to Cypress Creek Landfill by the ton (`MULCH-HO-TN`); "Vegetative to FDS"
// on the load form paid by the ton (`VEG-HAUL-TN`) and "White Goods" by the each from the tickets
// the load carries (`WG-HAUL-EA-60`). So the sites' lookups ask: at Cypress Creek a load of
// Vegetative to FDS weighed and one of white goods counted, a haul-out of Mulch weighed; at
// Bayline County Landfill a haul-out of Mulch nothing more; anything else the load call. Nobody
// is assigned there: a test sets Lee up at a site under the master passcode.
//
// **And a lost tower phone whose key the firm's time revoked** (task 3.4.3, ADR-580): P1-TWR-LF,
// enrolled at the API with a key made here and marked lost by Luis with the firm's reason, both on
// the cast's clock set back the firm's 24 hours and a minute; then its key revoked by the worker's
// own pass as the system actor, on the real clock, which the database holds it to.
//
// **And what unit rate work picks from** (task 3.5.3, ADR-583): P1's unit rate pay items as the
// story `p1-field-days` enters them (golden mission §1), each with its payable type and kind of
// work and Coastline's rate, two settings made up so a test meets them: the hanger is measured
// (its limb), and the leaner of 24.1–99 in may be marked ineligible by the monitor. Its two crews
// certified the day before by Lee Morgan, the bucket truck crew 730417 and the skid steer crew
// 730418; and Jo Kim on P1's unit rate work today and tomorrow, every one of those pay items
// hers, as the golden mission has her.
//
// **And the forms that are no ticket's** (task 3.5.4, ADR-584): P1's incident form offering the
// contractor involved and a cert number with its "Police report number" (not required: a firm
// turns that on where it wants one, ADR-587), its drop-off log form with made-up fields of every type, and the firm's incident sub-type "Mailbox
// struck" under "Property damage" (golden mission §2); and P2's ROE form, asking for the GPS, and
// its survey form, where the golden mission makes its ROEs and surveys: an ROE made on P1 would
// be offered on every collection and unit rate ticket there, so the tests that capture those on
// P1 meet none.
//
// **And certifying** (task 3.5.5, ADR-585): Jo Kim's unit rate assignment on P1 certifies too, so
// her phone holds the truck lists and the helpers (Kim, Ana and Lee, on P1 with her) and asks for
// a block of P1's cert numbers in the same sync as her unit rate block; and the yard
// phone holds the block its four certifications' numbers came from (730415…730514), so a phone's
// block starts after it, as the series would have it had the yard phone certified them itself.
// Its key is handed to the test with the rest (a made-up world's, never an installation's), for
// the browser's keyring to hold as the phone's own: the browser can't otherwise hold a key made
// before the run, and nothing else of it is planted.
import { generateKeyPairSync } from 'node:crypto';

import {
  Certifications,
  FormSetup,
  ListSetup,
  NumberAllocator,
  PayItemSetup,
  Phones,
  ProjectSetup,
  type ApiProcess,
  type CriterionInput,
  type NewPayItem,
} from '@open-adms/api';
import type { Database, Prisma } from '@open-adms/db';
import { NewProjectSettings, uuidv7, type IncidentOffer, type Policy } from '@open-adms/domain';
import { PhoneKeyBackstop, WorkerLog } from '@open-adms/worker';

import { storiesHostname } from './over-https.ts';
import { builtInPolicy } from './policy.ts';
import { assigned } from './stories/board.ts';
import { primaryBox, saved } from './stories/p1-office.ts';
import { p1TimeZone, setUpP1, setUpP1Sites, startSeries, type P1 } from './stories/p1.ts';
import { listeningApi, StoryApi, type PhoneRequests } from './story-api.ts';
import { StoryDatabase, storyMasterPasscode } from './story-database.ts';
import { StoryMedia } from './story-media.ts';
import { SoftwareKey } from './software-key.ts';

// A monitor of the cast, as a test signs them in.
export interface CastMonitor {
  readonly name: string;
  readonly monitorNumber: string;
  readonly password: string;
}

export interface WorldCast {
  readonly kim: CastMonitor;
  readonly ana: CastMonitor;
  readonly lee: CastMonitor;
  readonly tariq: CastMonitor;
  // On P1's unit rate work (task 3.5.3).
  readonly jo: CastMonitor;
  // On the PARKS project's collections (task 3.5.1; ADR-583).
  readonly sam: CastMonitor;
}

// The lost tower phone, as a browser test plants it: its id and name as enrolled, the passcode
// version it was enrolled under, and its key's two halves in base64 DER (SubjectPublicKeyInfo,
// PKCS #8).
export interface LostPhone {
  readonly deviceId: string;
  readonly name: string;
  readonly masterPasscodeVersion: number;
  readonly publicKey: string;
  readonly privateKey: string;
}

// A day as the project's people name it: 2026-10-19.
function dayIn(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export class BrowserWorld {
  // Where the browser tests' page reaches the world's API.
  static readonly apiOrigin = `https://${storiesHostname}`;
  // The world's master passcode, which whoever holds it types on the phone: made up, no
  // installation's.
  static readonly masterPasscode = storyMasterPasscode;

  readonly database: string;
  readonly cast: WorldCast;
  readonly lostPhone: LostPhone;
  private readonly made: StoryDatabase;
  private readonly api: ApiProcess;
  // The API's error lines (a failure's kind and frames, never what was sent: ADR-385).
  readonly errors: string[];

  private constructor(
    made: StoryDatabase,
    { cast, lostPhone }: { readonly cast: WorldCast; readonly lostPhone: LostPhone },
    api: ApiProcess,
    errors: string[],
  ) {
    this.made = made;
    this.database = made.name;
    this.cast = cast;
    this.lostPhone = lostPhone;
    this.api = api;
    this.errors = errors;
  }

  // The world made and listening, for the one page origin given. The caller closes it.
  static async opened(pageOrigin: string): Promise<BrowserWorld> {
    const made = await StoryDatabase.create();
    const errors: string[] = [];
    try {
      made.migrate();
      await made.seed();
      const policy = builtInPolicy();
      const people = await BrowserWorld.cast(made, policy);
      const api = await listeningApi({
        database: made,
        policy,
        media: new StoryMedia(),
        clock: { now: () => new Date() },
        corsOrigins: [pageOrigin],
        log: (line) => {
          if (/"level":(50|60)\b/.test(line)) errors.push(line.trim());
        },
        // "Look up address" answered from the stack's own map, as an installation's is (ADR-593).
        asksAddresses: true,
      });
      return new BrowserWorld(made, people, api, errors);
    } catch (problem) {
      await made.drop();
      throw problem;
    }
  }

  // P2 as the example world names it (spec/CONVENTIONS.md §6): PPDR work for the same client under
  // the same declaration event, loads alone, its numbers from 102001, and Marsh Road TDSR entered
  // again with the same GPS and permit; its ROE and survey forms are `formsSetup`'s (ADR-584).
  // Nothing else of its setup: a phone set up on it picks no more than that.
  private static async setUpP2(
    tx: Prisma.TransactionClient,
    policy: Policy,
    p1: P1,
  ): Promise<string> {
    const ppdr = await tx.programType.findFirstOrThrow({ where: { name: 'PPDR' } });
    const project = await tx.project.create({
      data: {
        name: 'Bayline County PPDR, Hurricane Delphine',
        clientId: p1.client,
        declarationEventId: p1.declarationEvent,
        programTypeId: ppdr.id,
        timeZone: p1TimeZone,
        activeFrom: new Date('2026-10-12'),
        activeTo: new Date('2027-01-31'),
        ticketNumberSource: 'GENERATED',
        workflows: ['LOAD'],
        ...new NewProjectSettings(policy).for(ppdr),
      },
    });
    await startSeries(tx, project.id, { LOAD: 102001 });
    const tdsrType = await tx.siteType.findUniqueOrThrow({ where: { key: 'TDSR' } });
    await tx.disposalSite.create({
      data: {
        projectId: project.id,
        activationDate: new Date('2026-10-12'),
        takesLoads: true,
        name: 'Marsh Road TDSR',
        siteTypeId: tdsrType.id,
        siteTypeKey: tdsrType.key,
        haulOutsLeaveHere: true,
        chargesTippingFee: false,
        ineligibleSite: false,
        permitNumber: 'FDEP-DMS-2026-0117',
        latitude: '39.09000000',
        longitude: '-75.62000000',
      },
    });
    return project.id;
  }

  // The forms that are no ticket's (task 3.5.4, ADR-584), through the setup service a story writes
  // them with: P1's incident form offering the contractor involved and a cert number and no ROE
  // number (AC-04-101), with its "Police report number" (golden mission §2, AC-04-87), not
  // required, as no incident is by default (the user, ADR-587); P1's drop-off log form, its own
  // fields made up so a test meets every type and a required one; and P2's ROE form asking for the GPS and its survey form, with none.
  private static async formsSetup(
    forms: FormSetup,
    who: { readonly dana: string; readonly project: string; readonly p2: string },
  ): Promise<void> {
    const form = async (
      projectId: string,
      documentType: 'ROE' | 'SURVEY' | 'INCIDENT' | 'DROP_OFF_LOG',
      name: string,
      more: { readonly gpsRequired?: boolean; readonly incidentOffers?: IncidentOffer[] } = {},
    ) => saved(forms.form(who.dana, { projectId, documentType, name, ...more }));
    await form(who.p2, 'ROE', 'ROE', { gpsRequired: true });
    await form(who.p2, 'SURVEY', 'Survey');
    const incident = await form(who.project, 'INCIDENT', 'Incident', {
      incidentOffers: ['CONTRACTOR', 'CERT_NUMBER'],
    });
    await saved(
      forms.ownFields(who.dana, incident.id, [
        { id: 'police-report', label: 'Police report number', type: 'TEXT', required: false },
      ]),
    );
    const dropOff = await form(who.project, 'DROP_OFF_LOG', 'Drop-off log');
    await saved(
      forms.ownFields(who.dana, dropOff.id, [
        { id: 'bags', label: 'Bags of household trash', type: 'NUMBER', required: false },
        { id: 'id-shown', label: 'Resident showed ID?', type: 'YES_NO', required: true },
        {
          id: 'load-kind',
          label: 'What was dropped off',
          type: 'PICK',
          required: false,
          choices: ['Yard waste', 'Furniture'],
        },
        { id: 'pile-photo', label: 'Photo of the pile', type: 'PHOTO', required: true },
      ]),
    );
  }

  // P1's load form, debris types and field tags, and two trucks certified on the yard phone the
  // day before, each through the service a story writes it with.
  private static async collectionSetup(
    api: Database,
    clock: { now(): Date },
    policy: Policy,
    who: {
      readonly dana: string;
      readonly luis: string;
      readonly project: string;
      readonly prime: string;
      readonly lee: string;
      readonly yard: string;
      readonly parks: string;
      readonly landfill: string;
      readonly cypress: string;
      readonly p2: string;
    },
  ): Promise<void> {
    const forms = new FormSetup(api, clock, policy);
    const lists = new ListSetup(api, clock, policy);
    const library = async (name: string): Promise<string> =>
      (await api.debrisType.findFirst({ where: { name } }))?.id ??
      (await saved(lists.debrisType(who.dana, name))).id;
    // Each form's entries, by name, as the rules pick them.
    const entries = new Map<string, string>();
    for (const [projectId, documentType, name, names] of [
      [who.project, 'LOAD', 'Load', ['Vegetative', 'C&D', 'Vegetative to FDS', 'White Goods']],
      [who.project, 'HAUL_OUT', 'Haul-out', ['Mulch']],
      [who.parks, 'LOAD', 'Load', ['Vegetative']],
    ] as const) {
      const form = await saved(forms.form(who.dana, { projectId, documentType, name }));
      for (const debris of names) {
        const entry = await saved(
          forms.debrisType(who.dana, {
            formId: form.id,
            debrisTypeId: await library(debris),
            reduced: debris === 'Mulch',
            hiddenOnPhones: false,
          }),
        );
        if (projectId === who.project) entries.set(`${documentType} ${debris}`, entry.id);
      }
      if (projectId === who.project) entries.set(documentType, form.id);
    }
    const entry = (key: string): string => {
      const found = entries.get(key);
      if (found === undefined) throw new Error(`No ${key} on P1 in the world.`);
      return found;
    };
    const payItems = new PayItemSetup(api, clock, policy);
    const payableType = async (name: string): Promise<string> =>
      (await api.payableType.findFirstOrThrow({ where: { name } })).id;
    const debrisIs = (key: string): CriterionInput => ({
      criterion: 'DEBRIS_TYPE',
      operator: 'EQUALS',
      picks: [entry(key)],
    });
    const dumpedAt = (siteId: string): CriterionInput => ({
      criterion: 'DISPOSAL_SITE',
      operator: 'EQUALS',
      picks: [siteId],
    });
    for (const [code, description, type, unit, rate, carried, form, criteria] of [
      [
        'MULCH-HO-CY',
        'Mulch haul-out to FDS',
        'Vegetative',
        'CY',
        '5.10',
        false,
        'HAUL_OUT',
        [debrisIs('HAUL_OUT Mulch'), dumpedAt(who.landfill)],
      ],
      [
        'MULCH-HO-TN',
        'Mulch haul-out to FDS, by weight',
        'Vegetative',
        'TN',
        '20.00',
        false,
        'HAUL_OUT',
        [debrisIs('HAUL_OUT Mulch'), dumpedAt(who.cypress)],
      ],
      [
        'VEG-HAUL-TN',
        'ROW VEG haul to FDS, by weight',
        'Vegetative',
        'TN',
        '21.00',
        false,
        'LOAD',
        [debrisIs('LOAD Vegetative to FDS')],
      ],
      [
        'WG-HAUL-EA-60',
        'White goods haul 0–60 mi',
        'White Goods',
        'EA',
        '12.00',
        true,
        'LOAD',
        [debrisIs('LOAD White Goods')],
      ],
    ] as const satisfies readonly (readonly [
      string,
      string,
      string,
      NewPayItem['unit'],
      string,
      boolean,
      'LOAD' | 'HAUL_OUT',
      readonly CriterionInput[],
    ])[]) {
      const payItem = await saved(
        payItems.payItem(who.dana, {
          kindOfWorkId: null,
          bandFrom: null,
          bandTo: null,
          countIsAlwaysOne: false,
          gpsRequired: false,
          measurementRequired: false,
          decimalsAllowed: false,
          photosRequired: false,
          monitorMayMarkIneligible: false,
          quantityFromCarriedTickets: carried,
          crewTimeConversion: null,
          crewDayHours: null,
          projectId: who.project,
          code,
          description,
          payableTypeId: await payableType(type),
          unit,
          rates: [{ primeId: who.prime, rate }],
        }),
      );
      await saved(
        payItems.paysWhen(who.dana, payItem.id, [
          { formId: entry(form), slot: 1, criteria: [...criteria] },
        ]),
      );
    }
    const projects = new ProjectSetup(api, clock, policy);
    for (const tag of ['Mixed', 'Zone 1 pile']) {
      await saved(projects.fieldTag(who.dana, who.project, tag));
    }
    await BrowserWorld.formsSetup(forms, who);
    const yesterday = dayIn(p1TimeZone, new Date(clock.now().getTime() - 86_400_000));
    const certifying = await assigned(api, clock, who.luis, {
      workDate: yesterday,
      projectId: who.project,
      personId: who.lee,
      certifying: true,
      deviceId: who.yard,
    });
    // The yard phone's block of P1's cert numbers, which its four certifications below take their
    // numbers from (ADR-585).
    const yardBlock = await new NumberAllocator(api, clock, policy).topUp(
      { person: who.lee, deviceId: who.yard },
      { projectId: who.project, series: 'CERTIFICATION', lastUsedNumber: null },
    );
    if (!yardBlock.saved) throw new Error(yardBlock.refusal.message);
    const certifications = new Certifications(api, clock, policy);
    const vehicle = async (name: string) =>
      (await api.vehicleType.findFirstOrThrow({ where: { name } })).id;
    const feature = async (name: string) =>
      (await api.vehicleFeature.findFirstOrThrow({ where: { name } })).id;
    for (const truck of [
      {
        certNumber: '730415',
        vehicleTypeId: await vehicle('Hydraulic Dump Trailer'),
        boxes: [
          primaryBox(360, 96, 72),
          { ...primaryBox(360, 96, 16), featureId: await feature('Sideboards') },
        ],
      },
      {
        certNumber: '730416',
        firstTierSub: 'Rivera Trucking',
        vehicleTypeId: await vehicle('Self-Loading Truck'),
        boxes: [
          primaryBox(264, 92, 96),
          {
            shape: 'TRIANGLE',
            sign: 'SUBTRACT',
            length: 36,
            width: 92,
            height: 48,
            featureId: await feature('Dog Box'),
          } as const,
        ],
      },
    ]) {
      const at = clock.now();
      await saved(
        certifications.certify({
          ...truck,
          id: uuidv7(at),
          projectId: who.project,
          kind: 'CONTAINER',
          primeId: who.prime,
          certifiedById: who.lee,
          deviceId: who.yard,
          assignmentId: certifying,
          certifiedAt: at,
          deviceUtcOffsetMinutes: 0 - at.getTimezoneOffset(),
        }),
      );
    }
    // The two crews, as Sam Grant certifies them in the golden mission §1.
    for (const [certNumber, crewType] of [
      ['730417', 'Bucket Truck'],
      ['730418', 'Skid Steer'],
    ] as const) {
      const at = clock.now();
      await saved(
        certifications.certify({
          certNumber,
          crewTypeId: (await api.crewType.findFirstOrThrow({ where: { name: crewType } })).id,
          boxes: [],
          id: uuidv7(at),
          projectId: who.project,
          kind: 'CREW',
          primeId: who.prime,
          certifiedById: who.lee,
          deviceId: who.yard,
          assignmentId: certifying,
          certifiedAt: at,
          deviceUtcOffsetMinutes: 0 - at.getTimezoneOffset(),
        }),
      );
    }
  }

  // P1's unit rate pay items as the story `p1-field-days` enters them, each with Coastline's
  // rate: their ids, for Jo Kim's assignment. Made up for the browser tests: the hanger measured,
  // the larger leaner one the monitor may mark ineligible.
  private static async unitRatePayItems(
    api: Database,
    clock: { now: () => Date },
    policy: Policy,
    who: { readonly dana: string; readonly project: string; readonly prime: string },
  ): Promise<string[]> {
    const payItems = new PayItemSetup(api, clock, policy);
    const ids: string[] = [];
    for (const [code, description, work, unit, rate, more] of [
      ['HNG-RMV-EA', 'Hanger removal', 'Hangers', 'EA', '68.00', { measurementRequired: true }],
      [
        'LNR-RMV-EA-24',
        'Leaner removal 6–24 in',
        'Leaners',
        'EA',
        '95.00',
        { measurementRequired: true, bandFrom: 6, bandTo: 24 },
      ],
      [
        'LNR-RMV-EA-99',
        'Leaner removal 24.1–99 in',
        'Leaners',
        'EA',
        '185.00',
        { measurementRequired: true, bandFrom: 24.1, bandTo: 99, monitorMayMarkIneligible: true },
      ],
      [
        'STP-RMV-EA-36',
        'Stump removal 24–36 in',
        'Stumps',
        'EA',
        '110.00',
        { measurementRequired: true, bandFrom: 24, bandTo: 36 },
      ],
      [
        'STP-RMV-EA-48',
        'Stump removal 36.1–48 in',
        'Stumps',
        'EA',
        '175.00',
        { measurementRequired: true, bandFrom: 36.1, bandTo: 48 },
      ],
      [
        'WG-RMV-EA',
        'White good removed',
        'White Goods',
        'EA',
        '40.00',
        { countIsAlwaysOne: false },
      ],
      [
        'CREW-TIME-HR',
        'Crew time, skid steer crew',
        'Crew time',
        'HR',
        '150.00',
        { countIsAlwaysOne: false, decimalsAllowed: true, crewTimeConversion: 'PER_HOUR' },
      ],
    ] as const satisfies readonly (readonly [
      string,
      string,
      string,
      NewPayItem['unit'],
      string,
      Partial<NewPayItem>,
    ])[]) {
      const payItem = await saved(
        payItems.payItem(who.dana, {
          projectId: who.project,
          code,
          description,
          payableTypeId: (await api.payableType.findFirstOrThrow({ where: { name: work } })).id,
          kindOfWorkId: (await api.kindOfWork.findFirstOrThrow({ where: { name: work } })).id,
          unit,
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
          rates: [{ primeId: who.prime, rate }],
          ...more,
        }),
      );
      ids.push(payItem.id);
    }
    return ids;
  }

  // The PARKS project: its loads from control tickets, 400001–405000; its unit rate tickets from
  // 100001, as every project's are generated (ADR-056).
  private static async setUpParks(
    tx: Prisma.TransactionClient,
    policy: Policy,
    p1: P1,
  ): Promise<string> {
    const parks = await tx.programType.findFirstOrThrow({ where: { name: 'PARKS' } });
    const project = await tx.project.create({
      data: {
        name: 'Bayline County PARKS, Hurricane Delphine',
        clientId: p1.client,
        declarationEventId: p1.declarationEvent,
        programTypeId: parks.id,
        timeZone: p1TimeZone,
        activeFrom: new Date('2026-10-12'),
        activeTo: new Date('2027-01-31'),
        ticketNumberSource: 'CONTROL',
        workflows: ['LOAD'],
        ...new NewProjectSettings(policy).for(parks),
      },
    });
    await startSeries(tx, project.id, { UNIT_RATE: 100001 });
    await tx.controlRange.create({
      data: { projectId: project.id, series: 'LOAD', firstNumber: 400001, lastNumber: 405000 },
    });
    return project.id;
  }

  // The cast, written as the stories write theirs: setup by Dana Reyes through `$write`, the yard
  // phone and the monitors at the API's own endpoints (its process, on the real clock, stopped
  // before the world's own starts on the same port), the board through `Assignments`.
  private static async cast(
    made: StoryDatabase,
    policy: Policy,
  ): Promise<{ readonly cast: WorldCast; readonly lostPhone: LostPhone }> {
    // The cast's clock, set back only while the lost phone is enrolled and marked.
    let behindMs = 0;
    const clock = { now: () => new Date(Date.now() - behindMs) };
    const api = made.open('api');
    const served = new StoryApi({ database: made, clock, policy, media: new StoryMedia() });
    try {
      const dana = uuidv7(clock.now());
      const office = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
        await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
        const luis = await tx.user.create({
          data: { name: 'Luis Ortega', role: 'MANAGER_ANALYST' },
        });
        for (const permission of ['DISPATCH', 'VIEW_DISPATCH'] as const) {
          await tx.userPermission.create({ data: { userId: luis.id, permission } });
        }
        const p1 = await setUpP1(tx, policy);
        // The firm's own sub-type of an incident (golden mission §2).
        const damage = await tx.incidentType.findFirstOrThrow({
          where: { name: 'Property damage' },
        });
        await tx.incidentSubType.create({
          data: { name: 'Mailbox struck', position: 1, incidentTypeId: damage.id },
        });
        const p2 = await BrowserWorld.setUpP2(tx, policy, p1);
        const parks = await BrowserWorld.setUpParks(tx, policy, p1);
        const landfillType = await tx.siteType.findUniqueOrThrow({
          where: { key: 'FINAL_DISPOSAL' },
        });
        // Cypress Creek Landfill as the story `setup` adds it (spec/CONVENTIONS.md §6).
        const cypress = await tx.disposalSite.create({
          data: {
            projectId: p1.project,
            activationDate: new Date('2026-10-12'),
            takesLoads: true,
            name: 'Cypress Creek Landfill',
            siteTypeId: landfillType.id,
            siteTypeKey: landfillType.key,
            haulOutsLeaveHere: false,
            chargesTippingFee: false,
            ineligibleSite: false,
            permitNumber: 'FDEP-SW-0131',
            latitude: '39.24000000',
            longitude: '-75.60000000',
          },
        });
        return {
          parks,
          luis: luis.id,
          project: p1.project,
          prime: p1.prime,
          cypress: cypress.id,
          p2,
          ...(await setUpP1Sites(tx, p1.project)),
        };
      });
      const asked = served.requests(clock);
      const key = new SoftwareKey();
      const yard = await asked.enrol({
        name: 'P1-YARD',
        passcode: storyMasterPasscode,
        publicKey: key.publicKey,
      });
      served.enrolled(yard.deviceId, key);
      const people = [
        'Kim Nguyen',
        'Ana Brooks',
        'Lee Morgan',
        'Tariq Patel',
        'Jo Kim',
        'Sam Grant',
      ];
      const created = new Map<string, CastMonitor & { readonly id: string }>();
      for (const [place, name] of people.entries()) {
        // A made-up phone number without its area code, as the stories' monitors have.
        const password = `555${String(101 + place).padStart(4, '0')}`;
        const answer = await asked.monitorCreated(yard.deviceId, {
          name,
          password,
          passcode: storyMasterPasscode,
        });
        created.set(name, {
          id: answer.userId,
          name,
          monitorNumber: answer.monitorNumber,
          password,
        });
      }
      const of = (name: string) => {
        const monitor = created.get(name);
        if (monitor === undefined) throw new Error(`No monitor ${name} in the world.`);
        return monitor;
      };
      const unitRate = await BrowserWorld.unitRatePayItems(api, clock, policy, {
        dana,
        project: office.project,
        prime: office.prime,
      });
      const now = clock.now();
      for (const workDate of [now, new Date(now.getTime() + 86_400_000)].map((at) =>
        dayIn(p1TimeZone, at),
      )) {
        const planned = { workDate, projectId: office.project } as const;
        await assigned(api, clock, office.luis, {
          ...planned,
          personId: of('Kim Nguyen').id,
          fieldEventKinds: ['DISPOSAL'],
          formDocumentTypes: ['DROP_OFF_LOG'],
          siteId: office.tdsr,
        });
        await assigned(api, clock, office.luis, {
          ...planned,
          personId: of('Ana Brooks').id,
          fieldEventKinds: ['COLLECTION'],
          formDocumentTypes: ['INCIDENT'],
        });
        await assigned(api, clock, office.luis, {
          ...planned,
          personId: of('Jo Kim').id,
          fieldEventKinds: ['UNIT_RATE'],
          certifying: true,
          payItemIds: unitRate,
        });
        await assigned(api, clock, office.luis, {
          workDate,
          projectId: office.parks,
          personId: of('Sam Grant').id,
          fieldEventKinds: ['COLLECTION'],
        });
        for (const [kind, site] of [
          ['COLLECTION', null],
          ['DISPOSAL', office.landfill],
        ] as const) {
          await assigned(api, clock, office.luis, {
            ...planned,
            personId: of('Lee Morgan').id,
            fieldEventKinds: [kind],
            siteId: site,
          });
        }
      }
      await BrowserWorld.collectionSetup(api, clock, policy, {
        dana,
        luis: office.luis,
        project: office.project,
        prime: office.prime,
        lee: of('Lee Morgan').id,
        yard: yard.deviceId,
        parks: office.parks,
        landfill: office.landfill,
        cypress: office.cypress,
        p2: office.p2,
      });
      const handed = ({ name, monitorNumber, password }: CastMonitor): CastMonitor => ({
        name,
        monitorNumber,
        password,
      });
      return {
        cast: {
          kim: handed(of('Kim Nguyen')),
          ana: handed(of('Ana Brooks')),
          lee: handed(of('Lee Morgan')),
          tariq: handed(of('Tariq Patel')),
          jo: handed(of('Jo Kim')),
          sam: handed(of('Sam Grant')),
        },
        lostPhone: await BrowserWorld.lostPhone(made, asked, office.luis, (ms) => {
          behindMs = ms;
        }),
      };
    } finally {
      await served.close();
      await api.$disconnect();
    }
  }

  // P1-TWR-LF enrolled and marked lost by Luis the firm's hours and a minute ago (the cast's clock
  // set back that long, then put right), and its key revoked now by the worker's pass.
  private static async lostPhone(
    made: StoryDatabase,
    asked: PhoneRequests,
    luis: string,
    setBack: (ms: number) => void,
  ): Promise<LostPhone> {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    const name = 'P1-TWR-LF';
    const api = made.open('api');
    const worker = made.open('worker');
    try {
      const { phoneKeyRevokedAfterHours: hours } = await api.firmSettings.findUniqueOrThrow({
        where: { id: 1 },
      });
      if (hours === null) throw new Error('The firm keeps a lost phone’s key for good.');
      const reason = await api.reason.findFirstOrThrow({
        where: { name: 'Lost in the field', uses: { has: 'PHONE_REMOVAL' } },
      });
      const behindMs = (hours * 60 + 1) * 60_000;
      setBack(behindMs);
      let enrolled: Awaited<ReturnType<PhoneRequests['enrol']>>;
      try {
        enrolled = await asked.enrol({ name, passcode: storyMasterPasscode, publicKey });
        const removed = await new Phones(api, {
          now: () => new Date(Date.now() - behindMs),
        }).remove(luis, enrolled.deviceId, {
          status: 'LOST',
          reasonId: reason.id,
          note: 'Not handed in at the Landfill’s tower',
        });
        if (!removed.saved) throw new Error(removed.refusal.message);
      } finally {
        setBack(0);
      }
      const revoked = await new PhoneKeyBackstop(
        worker,
        new WorkerLog({ write: () => undefined }),
        { now: () => new Date() },
      ).pass();
      if (!revoked.revoked.includes(enrolled.deviceId)) {
        throw new Error('The worker’s pass didn’t revoke the lost phone’s key.');
      }
      return {
        deviceId: enrolled.deviceId,
        name,
        masterPasscodeVersion: enrolled.masterPasscodeVersion,
        publicKey,
        privateKey: pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
      };
    } finally {
      await api.$disconnect();
      await worker.$disconnect();
    }
  }

  async close(): Promise<void> {
    try {
      await this.api.close();
    } finally {
      await this.made.drop();
    }
  }
}
