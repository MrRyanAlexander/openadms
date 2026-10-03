// The example world (spec/CONVENTIONS.md §6), as the rows the guards are tested on. Built by the
// server's administrator inside the test's rolled-back work, with Dana Reyes stated as the actor,
// so its own inserts are audited like any other. New ids every time, so it never meets real rows.
//
// The client Bayline County and the declaration event Hurricane Delphine, DR-9001-FL, with its two
// projects as the golden mission §1 sets them up (ADR-303):
//   P1 "Bayline County ROW, Hurricane Delphine": loads 101001 (Coastline) and 101002 (Summit)
//   P2 "Bayline County PPDR, Hurricane Delphine": load 102001 (Coastline)
// Their program types, and P1's kinds of unit rate work, are picked from the firm's lists as the
// installer's seed wrote them.
// Coastline Haulers LLC and Summit Debris Services are P1's two primes, each with its contract;
// Coastline is P2's prime, with its own contract there. Harbor Staffing, a temp agency, is a
// contractor of the monitoring kind, on no project (spec/CONVENTIONS.md §6; ADR-305). Subs aren't
// set up: Rivera Trucking is on P1 and on P2 as a tier 1 sub under Coastline because its
// self-loader was certified there (ADR-108, 321).
// P1's five certifications, as the golden mission §1 has them (ADR-321): `730415` Coastline's dump
// trailer (65 CY), `730416` Rivera's self-loader (48 CY), `730417` and `730418` Coastline's bucket
// truck crew and skid steer crew, `730419` Coastline's walking floor (110 CY); each container with
// its measured boxes (spec/CONVENTIONS.md §6). Sam Grant certified them on Saturday 10 October 2026
// on the phone P1-HO-TDSR, under his certifying assignment, with Lee Morgan, assigned to P1 with him
// that day, as his helper on `730415`. P2 has its own `730416`, the same self-loader certified
// there in its own right on the Sunday (ADR-318). The tandem, a replacement and a copy a test
// writes, with `certificationLike` and `boxLike`.
// P1 has a load form with Vegetative and C&D on it (the golden mission §1), a haul-out form and an
// incident form, switched on (ADR-308). Mulch isn't in the firm's library as the seed writes it, and
// P1's field tags start empty, so a test adds those as Dana would.
// P1's pay items are six of the golden mission's §1, each with Coastline's rate and none with
// Summit's: VEG-HAUL-CY-15 ($7.50), HNG-RMV-EA ($68.00), LNR-RMV-EA-24 and -99 (6–24 and 24.1–99
// in; $95.00, $185.00), STP-RMV-EA-36 (24–36 in; $110.00) and CREW-TIME-HR ($150.00, per hour)
// (ADR-206, 309). The rest of the table a test adds as Dana would; P2 has none.
// P1 has the first of the golden mission's rules, written in full (ADR-313): on its load form,
// naming "Coastline, Bayline ROW 2026", "VEG-HAUL-CY-15 - ROW VEG haul 0–15 mi": Debris type EQUALS
// Vegetative, Mileage AT MOST 15.0 → Add transaction 1, VEG-HAUL-CY-15. The rest a test writes as
// Dana would, with `ruleLike`, `criterionLike`, `pickLike` and `actionLike`.
// Each load is a collection and a disposal event (load call at the tower), its completed load and
// one transaction for its prime. Nothing is locked as invoiced; a test locks what it needs.
// P1's sites are two of the golden mission's §1, entered in full (ADR-215, 311): Marsh Road TDSR
// (TDSR/DMS: takes loads, haul-outs leave here) and Bayline County Landfill (Final Disposal, `BCL`:
// takes loads, charges a tipping fee), each with its GPS (spec/CONVENTIONS.md §6) and a permit,
// active from 12 October 2026. Its tipping fee pay item, P1's map and the other sites a test adds as
// Dana would; P2 has no site.
// Ana Brooks records every event here, on the one phone, under her assignment on each project
// (Monday 12 October 2026, written on the board by Dana). The phone holds version 1 of the master
// passcode, which the installer's seed keeps (ADR-281).
// Three read-only viewers, issued by Dana (ADR-169, 315): Bayline County's client user, given P1;
// an auditor, given P1 and P2; and Coastline Haulers' contractor user, given P1. A test issues
// another with `viewerLike` and `given`.
import { systemActorId } from '../../src/system-actor.ts';
import type { GuardedDatabase } from './database.ts';

export interface Load {
  collection: string;
  disposal: string;
  completedLoad: string;
  transaction: string;
}

export interface PayItems {
  vegHaul15: string;
  hangers: string;
  leaners24: string;
  leaners99: string;
  stumps36: string;
  crewTime: string;
}

export interface Certifications {
  c730415: string;
  c730416: string;
  c730417: string;
  c730418: string;
  c730419: string;
  // P2's own 730416.
  p2c730416: string;
}

export interface World {
  // Dana Reyes, admin: the actor the world is written by.
  admin: string;
  // Sam Grant, the monitor who certifies, on the phone P1-HO-TDSR, under his certifying assignment
  // on each project; Lee Morgan, assigned to P1 with him, the helper he picks.
  certifier: string;
  helper: string;
  certifyingDevice: string;
  certifyingAssignments: { p1: string; p2: string };
  // Rivera Trucking, a tier 1 sub under Coastline on P1 and on P2.
  rivera: string;
  certifications: Certifications;
  // What the certifications pick from the firm's lists.
  vehicleTypes: { dumpTrailer: string; selfLoader: string };
  vehicleFeatures: { sideboards: string; dogBox: string; curvedSides: string };
  crewTypes: { bucketTruck: string; skidSteer: string };
  // Ana Brooks, a monitor, and the phone she records on, P1-COL-1.
  monitor: string;
  device: string;
  // Her assignments for the day, one on each project.
  assignments: { p1: string; p2: string };
  // P1's Marsh Road TDSR, and its Bayline County Landfill.
  site: string;
  landfill: string;
  // The two built-in site types, from the firm's list.
  siteTypes: { tdsr: string; finalDisposal: string };
  // The worker's system actor, made by the installer's seed (ADR-273).
  worker: string;
  coastline: string;
  summit: string;
  // Harbor Staffing, a temp agency that employs monitors.
  harbor: string;
  // "Coastline, Bayline ROW 2026" and "Summit, Bayline ROW 2026" on P1; "Coastline, Bayline PPDR
  // 2026" on P2.
  contracts: { coastlineP1: string; summitP1: string; coastlineP2: string };
  // P1's forms, and the debris types on its load form.
  forms: { load: string; haulOut: string; incident: string };
  formDebrisTypes: { vegetative: string; cd: string };
  // The payable types and kinds of unit rate work P1's pay items pick, from the firm's lists.
  payableTypes: {
    vegetative: string;
    hangers: string;
    leaners: string;
    stumps: string;
    crewTime: string;
  };
  kindsOfWork: { hangers: string; leaners: string; stumps: string; crewTime: string };
  // P1's pay items, and Coastline's rate on each.
  payItems: PayItems;
  rates: PayItems;
  // P1's rule VEG-HAUL-CY-15: the rule, its two criteria and its action.
  rule: { id: string; debrisType: string; mileage: string; add: string };
  // Coastline Haulers LLC's contractor user, given P1.
  coastlineViewer: string;
  // Bayline County's client user, given P1; an auditor, given P1 and P2.
  clientViewer: string;
  auditor: string;
  // Bayline County; Hurricane Delphine, DR-9001-FL.
  client: string;
  declarationEvent: string;
  // The two program types the projects pick, from the firm's list: ROW (P1), PPDR (P2).
  programTypes: { row: string; ppdr: string };
  p1: string;
  p2: string;
  loads: { l101001: Load; l101002: Load; l102001: Load };
  // Every row the world wrote, by table, for tests that look at its audit records.
  written: Record<string, string[]>;
}

// What a project holds besides its name, as P1 has it (the golden mission §1): under the world's
// client and declaration event, a ROW project on generated numbers, active from 12 October 2026 to
// 31 January 2027, its settings as a new project starts with them. For a test that writes another
// project, or changes one column of this one (`more`).
export function projectLike(
  world: Pick<World, 'client' | 'declarationEvent' | 'programTypes'>,
  more: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: 'Bayline County PARKS, Hurricane Delphine',
    client_id: world.client,
    declaration_event_id: world.declarationEvent,
    program_type_id: world.programTypes.row,
    allow_split_loads: false,
    time_zone: 'America/New_York',
    active_from: '2026-10-12',
    active_to: '2027-01-31',
    ticket_number_source: 'GENERATED',
    workflows: '{LOAD,HAUL_OUT,UNIT_RATE}',
    load_call_low_limit: 5,
    load_call_high_limit: 95,
    stump_fill_depth_inches: 31,
    stump_check_root_ball_wider: true,
    stump_check_fill_needs_exposure: true,
    site_circle_meters: 200,
    time_clock_enabled: false,
    ...more,
  };
}

// A pay item as Dana enters one off the contract: P1's VEG-HAUL-CY-30, "ROW VEG haul 15.1–30 mi",
// payable type Vegetative, by the CY, no band, every capture setting stated and none ticked (no
// setting has a database default, ADR-303, 309). For a test that writes another pay item, or
// changes one column of this one (`more`).
export function payItemLike(
  world: Pick<World, 'p1' | 'payableTypes'>,
  more: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    project_id: world.p1,
    code: 'VEG-HAUL-CY-30',
    description: 'ROW VEG haul 15.1–30 mi',
    payable_type_id: world.payableTypes.vegetative,
    unit: 'CY',
    count_is_always_one: false,
    gps_required: false,
    measurement_required: false,
    decimals_allowed: false,
    photos_required: false,
    monitor_may_mark_ineligible: false,
    quantity_from_carried_tickets: false,
    ...more,
  };
}

// A disposal site as Dana enters one on P1: Bayline Transfer Station (Transfer Station, a type of
// the firm's list with no built-in key), takes loads, its GPS, a permit, active from 12 October 2026;
// every fact stated, none has a database default (ADR-215, 311). For a test that writes another
// site, or changes one column of this one (`more`). A TDSR/DMS site states its type's key too.
export function siteLike(
  world: Pick<World, 'p1'>,
  siteTypeId: string,
  more: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    project_id: world.p1,
    name: 'Bayline Transfer Station',
    site_type_id: siteTypeId,
    takes_loads: true,
    haul_outs_leave_here: false,
    charges_tipping_fee: false,
    ineligible_site: false,
    permit_number: 'FDEP-TS-2026-0412',
    latitude: '27.95010000',
    longitude: '-82.44730000',
    activation_date: '2026-10-12',
    ...more,
  };
}

// A rule as Dana writes one on P1's load form, naming Coastline's contract: active, and with no
// lines yet. A rule repeats its form's document type (ADR-313). For a test that writes another
// rule, or changes one column of this one (`more`).
export function ruleLike(
  world: Pick<World, 'p1' | 'forms' | 'contracts'>,
  more: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    project_id: world.p1,
    form_id: world.forms.load,
    document_type: 'LOAD',
    name: 'VEG-HAUL-CY-30 - ROW VEG haul 15.1–30 mi',
    contract_id: world.contracts.coastlineP1,
    active: true,
    ...more,
  };
}

// One line of a rule's "ifs": it repeats its rule's project and form, P1 and its load form unless
// `more` says otherwise.
export function criterionLike(
  world: Pick<World, 'p1' | 'forms'>,
  ruleId: string,
  position: number,
  criterion: string,
  operator: string,
  more: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    rule_id: ruleId,
    project_id: world.p1,
    form_id: world.forms.load,
    position,
    criterion,
    operator,
    ...more,
  };
}

// One picked value of a criterion line: it repeats its line's project, form and criterion, and
// fills the one column that criterion picks from (`value`).
export function pickLike(
  world: Pick<World, 'p1' | 'forms'>,
  criterionId: string,
  criterion: string,
  value: Record<string, unknown>,
  more: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    criterion_id: criterionId,
    project_id: world.p1,
    form_id: world.forms.load,
    criterion,
    ...value,
    ...more,
  };
}

// An action of a rule on P1: Add transaction #slot with a pay item, its quantity from every item,
// unless `more` says otherwise.
export function actionLike(
  world: Pick<World, 'p1'>,
  ruleId: string,
  slot: number | null,
  payItemId: string | null,
  more: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    rule_id: ruleId,
    project_id: world.p1,
    kind: 'ADD_TRANSACTION',
    slot,
    pay_item_id: payItemId,
    quantity_from: 'ALL_ITEMS',
    ...more,
  };
}

// A read-only viewer as Dana issues one: a client user or an auditor, or a contractor user with
// its contractor (ADR-169, 315).
export function viewerLike(
  name: string,
  kind: 'CLIENT' | 'AUDITOR' | 'CONTRACTOR',
  contractorId?: string,
): Record<string, unknown> {
  return {
    name,
    role: 'READ_ONLY_VIEWER',
    viewer_kind: kind,
    ...(contractorId === undefined ? {} : { contractor_id: contractorId }),
  };
}

// One project a viewer is given.
export function given(viewerId: string, projectId: string): Record<string, unknown> {
  return { user_id: viewerId, project_id: projectId };
}

// A prime's place on a project: it names no prime, and carries its own contractor again as the key
// a sub's prime and a contract's prime are held to (ADR-305).
export function primeOn(projectId: string, contractorId: string): Record<string, unknown> {
  return {
    project_id: projectId,
    contractor_id: contractorId,
    position: 'PRIME',
    as_prime_id: contractorId,
  };
}

// A sub's place on a project, as typed in at certification: tier 1 or 2, under one of the project's
// primes.
export function subOn(
  projectId: string,
  contractorId: string,
  primeId: string,
  tier: 1 | 2 = 1,
): Record<string, unknown> {
  return {
    project_id: projectId,
    contractor_id: contractorId,
    position: `SUB_TIER_${String(tier)}`,
    prime_id: primeId,
  };
}

// A certification as Sam Grant makes one on P1, on his phone, under his certifying assignment:
// Coastline's tandem truck body `730421` (30 CY), no sub, certified on Saturday 10 October 2026 at
// 11:30 and received a minute later. For a test that writes another certification, or changes one
// column of this one (`more`). A container is written with its primary box (`boxLike`).
export function certificationLike(
  world: Pick<
    World,
    'p1' | 'coastline' | 'certifier' | 'certifyingDevice' | 'certifyingAssignments'
  >,
  more: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    project_id: world.p1,
    cert_number: '730421',
    kind: 'CONTAINER',
    prime_id: world.coastline,
    capacity_cy: 30,
    certified_at: '2026-10-10T15:30:00Z',
    device_utc_offset_minutes: -240,
    received_at: '2026-10-10T15:31:00Z',
    certified_by_id: world.certifier,
    device_id: world.certifyingDevice,
    assignment_id: world.certifyingAssignments.p1,
    signatures_on_file: false,
    ...more,
  };
}

// A crew certification as Sam makes one: no capacity, nothing measured.
export function crewLike(
  world: Parameters<typeof certificationLike>[0],
  more: Record<string, unknown> = {},
): Record<string, unknown> {
  return without(
    certificationLike(world, { kind: 'CREW', cert_number: '730423', ...more }),
    'capacity_cy',
  );
}

// A measured box of a container. Position 0 is its primary, a rectangle that adds: 240 × 90 × 60
// unless `more` says otherwise. A box after the primary states its feature, shape and sign.
export function boxLike(
  certificationId: string,
  position: number,
  more: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    certification_id: certificationId,
    kind: 'CONTAINER',
    position,
    shape: 'RECTANGLE',
    sign: 'ADD',
    length: 240,
    width: 90,
    height: 60,
    ...more,
  };
}

// A row without one of its columns, for a test of what the database does when it's left out.
export function without(row: Record<string, unknown>, column: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([name]) => name !== column));
}

// The insert of one row, returning its id: the statement and its values, for run(), one() or
// refused().
export function insertOf(table: string, row: Record<string, unknown>): [string, unknown[]] {
  const columns = Object.keys(row);
  return [
    `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')})
     VALUES (${columns.map((_, index) => `$${String(index + 1)}`).join(', ')})
     RETURNING id::text`,
    Object.values(row),
  ];
}

export class ExampleWorld {
  private readonly db: GuardedDatabase;
  private readonly written: Record<string, string[]> = {};

  private constructor(db: GuardedDatabase) {
    this.db = db;
  }

  static async build(db: GuardedDatabase): Promise<World> {
    return new ExampleWorld(db).build();
  }

  private async build(): Promise<World> {
    await this.db.administer();
    // The first user is written with itself as the actor (ADR-270 (4)).
    const admin = (await this.db.one<{ id: string }>('SELECT uuidv7()::text AS id')).id;
    await this.db.actor(admin, 'BACK_OFFICE');
    await this.insert('user', { id: admin, name: 'Dana Reyes', role: 'ADMIN' });

    const coastline = await this.insert('contractor', {
      name: 'Coastline Haulers LLC',
      kind: 'HAULER',
      contact_name: 'Coastline Haulers dispatch',
      contact_phone: '555-0110',
    });
    const summit = await this.insert('contractor', {
      name: 'Summit Debris Services',
      kind: 'HAULER',
    });
    const harbor = await this.insert('contractor', { name: 'Harbor Staffing', kind: 'MONITORING' });
    const monitor = await this.insert('user', { name: 'Ana Brooks', role: 'MONITOR' });
    const coastlineViewer = await this.insert(
      'user',
      viewerLike('Coastline Haulers LLC viewer', 'CONTRACTOR', coastline),
    );
    const clientViewer = await this.insert(
      'user',
      viewerLike('Bayline County debris manager', 'CLIENT'),
    );
    const auditor = await this.insert('user', viewerLike('Auditor', 'AUDITOR'));
    const device = await this.insert('device', {
      name: 'P1-COL-1',
      public_key: 'test-public-key-ana-brooks',
      master_passcode_version: 1,
    });
    const client = await this.insert('client', {
      name: 'Bayline County',
      contact_name: 'Bayline County debris manager',
      contact_phone: '555-0100',
    });
    const declarationEvent = await this.insert('declaration_event', {
      name: 'Hurricane Delphine',
      reference: 'DR-9001-FL',
      reference_type_id: await this.picked('declaration_reference_type', 'FEMA disaster (DR)'),
    });
    const programTypes = {
      row: await this.picked('program_type', 'ROW'),
      ppdr: await this.picked('program_type', 'PPDR'),
    };
    const hub = { client, declarationEvent, programTypes };
    // P1 is a ROW project; the firm ticked Allow split loads, for haul-outs loaded from more than
    // one pile. P2 is PPDR, where it starts ticked; only loads are made on it.
    const p1 = await this.insert(
      'project',
      projectLike(hub, { name: 'Bayline County ROW, Hurricane Delphine', allow_split_loads: true }),
    );
    const p2 = await this.insert(
      'project',
      projectLike(hub, {
        name: 'Bayline County PPDR, Hurricane Delphine',
        program_type_id: programTypes.ppdr,
        allow_split_loads: true,
        workflows: '{LOAD}',
      }),
    );
    for (const kind of ['Hangers', 'Leaners', 'Stumps', 'White Goods', 'Crew time']) {
      await this.insert('project_kind_of_work', {
        project_id: p1,
        kind_of_work_id: await this.picked('kind_of_work', kind),
      });
    }
    const kindsOfWork = {
      hangers: await this.picked('kind_of_work', 'Hangers'),
      leaners: await this.picked('kind_of_work', 'Leaners'),
      stumps: await this.picked('kind_of_work', 'Stumps'),
      crewTime: await this.picked('kind_of_work', 'Crew time'),
    };
    const payableTypes = {
      vegetative: await this.picked('payable_type', 'Vegetative'),
      hangers: await this.picked('payable_type', 'Hangers'),
      leaners: await this.picked('payable_type', 'Leaners'),
      stumps: await this.picked('payable_type', 'Stumps'),
      crewTime: await this.picked('payable_type', 'Crew time'),
    };

    // Each prime is added to the project, then its contract (ADR-146).
    const contract = async (projectId: string, primeId: string, name: string): Promise<string> => {
      await this.insert('project_contractor', primeOn(projectId, primeId));
      return this.insert('contract', { project_id: projectId, name, prime_id: primeId });
    };
    const contracts = {
      coastlineP1: await contract(p1, coastline, 'Coastline, Bayline ROW 2026'),
      summitP1: await contract(p1, summit, 'Summit, Bayline ROW 2026'),
      coastlineP2: await contract(p2, coastline, 'Coastline, Bayline PPDR 2026'),
    };

    // P1's forms: one per document type it uses (ADR-211). The load form's debris types, from the
    // firm's library, none reduced or hidden (the golden mission §1).
    const form = (documentType: string, name: string): Promise<string> =>
      this.insert('form', { project_id: p1, name, document_type: documentType, enabled: true });
    const forms = {
      load: await form('LOAD', 'Load'),
      haulOut: await form('HAUL_OUT', 'Haul-out'),
      incident: await form('INCIDENT', 'Incident'),
    };
    const onLoadForm = async (debrisType: string): Promise<string> =>
      this.insert('form_debris_type', {
        form_id: forms.load,
        document_type: 'LOAD',
        debris_type_id: await this.picked('debris_type', debrisType),
        reduced: false,
        hidden_on_phones: false,
      });
    const formDebrisTypes = {
      vegetative: await onLoadForm('Vegetative'),
      cd: await onLoadForm('C&D'),
    };

    // P1's pay items, as the golden mission §1 has them, each with Coastline's rate.
    const enter = (code: string, more: Record<string, unknown>): Promise<string> =>
      this.insert('pay_item', payItemLike({ p1, payableTypes }, { code, ...more }));
    const unitRate = (kind: keyof typeof kindsOfWork): Record<string, unknown> => ({
      payable_type_id: payableTypes[kind],
      kind_of_work_id: kindsOfWork[kind],
      unit: 'EA',
      count_is_always_one: true,
      photos_required: true,
    });
    const payItems: PayItems = {
      vegHaul15: await enter('VEG-HAUL-CY-15', { description: 'ROW VEG haul 0–15 mi' }),
      hangers: await enter('HNG-RMV-EA', { ...unitRate('hangers'), description: 'Hanger removal' }),
      leaners24: await enter('LNR-RMV-EA-24', {
        ...unitRate('leaners'),
        description: 'Leaner removal 6–24 in',
        band_from: '6.0',
        band_to: '24.0',
        measurement_required: true,
      }),
      leaners99: await enter('LNR-RMV-EA-99', {
        ...unitRate('leaners'),
        description: 'Leaner removal 24.1–99 in',
        band_from: '24.1',
        band_to: '99.0',
        measurement_required: true,
      }),
      stumps36: await enter('STP-RMV-EA-36', {
        ...unitRate('stumps'),
        description: 'Stump removal 24–36 in',
        band_from: '24.0',
        band_to: '36.0',
        measurement_required: true,
      }),
      crewTime: await enter('CREW-TIME-HR', {
        ...unitRate('crewTime'),
        description: 'Crew time, skid steer crew',
        unit: 'HR',
        count_is_always_one: false,
        decimals_allowed: true,
        crew_time_conversion: 'PER_HOUR',
      }),
    };
    const rateOf = (payItemId: string, rate: string): Promise<string> =>
      this.insert('pay_item_rate', {
        project_id: p1,
        pay_item_id: payItemId,
        prime_id: coastline,
        rate,
      });
    const rates: PayItems = {
      vegHaul15: await rateOf(payItems.vegHaul15, '7.5000'),
      hangers: await rateOf(payItems.hangers, '68.0000'),
      leaners24: await rateOf(payItems.leaners24, '95.0000'),
      leaners99: await rateOf(payItems.leaners99, '185.0000'),
      stumps36: await rateOf(payItems.stumps36, '110.0000'),
      crewTime: await rateOf(payItems.crewTime, '150.0000'),
    };

    // P1's sites, as the golden mission §1 has them (ADR-215).
    const siteTypes = {
      tdsr: await this.picked('site_type', 'TDSR/DMS'),
      finalDisposal: await this.picked('site_type', 'Final Disposal'),
    };
    const site = await this.insert(
      'disposal_site',
      siteLike({ p1 }, siteTypes.tdsr, {
        name: 'Marsh Road TDSR',
        site_type_key: 'TDSR',
        haul_outs_leave_here: true,
        permit_number: 'FDEP-DMS-2026-0117',
        latitude: '27.98150000',
        longitude: '-82.39720000',
      }),
    );
    const landfill = await this.insert(
      'disposal_site',
      siteLike({ p1 }, siteTypes.finalDisposal, {
        name: 'Bayline County Landfill',
        short_code: 'BCL',
        site_type_key: 'FINAL_DISPOSAL',
        charges_tipping_fee: true,
        permit_number: 'FDEP-SW-0098',
        latitude: '27.89340000',
        longitude: '-82.32160000',
      }),
    );
    // P1's first rule, as the golden mission §1 has it (ADR-239, 313).
    const setup = { p1, forms, contracts };
    const ruleId = await this.insert(
      'rule',
      ruleLike(setup, { name: 'VEG-HAUL-CY-15 - ROW VEG haul 0–15 mi' }),
    );
    const debrisType = await this.insert(
      'rule_criterion',
      criterionLike(setup, ruleId, 1, 'DEBRIS_TYPE', 'EQUALS'),
    );
    await this.insert(
      'rule_criterion_pick',
      pickLike(setup, debrisType, 'DEBRIS_TYPE', {
        form_debris_type_id: formDebrisTypes.vegetative,
      }),
    );
    const rule = {
      id: ruleId,
      debrisType,
      mileage: await this.insert(
        'rule_criterion',
        criterionLike(setup, ruleId, 2, 'MILEAGE', 'AT_MOST', { number_from: '15.0000' }),
      ),
      add: await this.insert('rule_action', actionLike(setup, ruleId, 1, payItems.vegHaul15)),
    };
    const assignment = (projectId: string): Promise<string> =>
      this.insert('assignment', {
        person_id: monitor,
        work_date: '2026-10-12',
        project_id: projectId,
        field_event_kinds: '{COLLECTION,DISPOSAL}',
        device_id: device,
        origin: 'PLANNED',
        made_by_id: admin,
      });
    const assignments = { p1: await assignment(p1), p2: await assignment(p2) };
    // Who certifies, where and when (spec/CONVENTIONS.md §6; ADR-151, 240, 294).
    const certifier = await this.insert('user', { name: 'Sam Grant', role: 'MONITOR' });
    const helper = await this.insert('user', { name: 'Lee Morgan', role: 'MONITOR' });
    const certifyingDevice = await this.insert('device', {
      name: 'P1-HO-TDSR',
      public_key: 'test-public-key-sam-grant',
      master_passcode_version: 1,
    });
    const certifying = (projectId: string, workDate: string): Promise<string> =>
      this.insert('assignment', {
        person_id: certifier,
        work_date: workDate,
        project_id: projectId,
        certifying: true,
        device_id: certifyingDevice,
        origin: 'PLANNED',
        made_by_id: admin,
      });
    const certifyingAssignments = {
      p1: await certifying(p1, '2026-10-10'),
      p2: await certifying(p2, '2026-10-11'),
    };
    await this.insert('assignment', {
      person_id: helper,
      work_date: '2026-10-10',
      project_id: p1,
      origin: 'PLANNED',
      made_by_id: admin,
    });
    // Rivera Trucking, typed in when its self-loader was certified: placed under Coastline on each
    // project it was certified on (ADR-108).
    const rivera = await this.insert('contractor', { name: 'Rivera Trucking', kind: 'HAULER' });
    await this.insert('project_contractor', subOn(p1, rivera, coastline));
    await this.insert('project_contractor', subOn(p2, rivera, coastline));
    const vehicleTypes = {
      dumpTrailer: await this.picked('vehicle_type', 'Hydraulic Dump Trailer'),
      selfLoader: await this.picked('vehicle_type', 'Self-Loading Truck'),
    };
    const vehicleFeatures = {
      sideboards: await this.picked('vehicle_feature', 'Sideboards'),
      dogBox: await this.picked('vehicle_feature', 'Dog Box'),
      curvedSides: await this.picked('vehicle_feature', 'Curved/Angled Sides/Floor'),
    };
    const crewTypes = {
      bucketTruck: await this.picked('crew_type', 'Bucket Truck'),
      skidSteer: await this.picked('crew_type', 'Skid Steer'),
    };
    const certifies = { p1, coastline, certifier, certifyingDevice, certifyingAssignments };
    // A container: the certification, its primary box, then its one box after it.
    const container = async (
      more: Record<string, unknown>,
      primary: [number, number, number],
      box: Record<string, unknown>,
    ): Promise<string> => {
      const id = await this.insert('certification', certificationLike(certifies, more));
      const [length, width, height] = primary;
      await this.insert('certification_box', boxLike(id, 0, { length, width, height }));
      await this.insert('certification_box', boxLike(id, 1, box));
      return id;
    };
    const selfLoader = {
      cert_number: '730416',
      capacity_cy: 48,
      first_tier_sub_id: rivera,
      vehicle_type_id: vehicleTypes.selfLoader,
      driver_name: 'Marco Rivera',
      driver_phone: '555-0142',
      driver_licence_number: 'R160-542-80-112-0',
      driver_licence_state: 'FL',
      driver_licence_expiry: '2028-03-31',
      tag_number: 'RVT 4821',
      tag_state: 'FL',
      tag_expiry: '2027-03-31',
    };
    const dogBox = {
      feature_id: vehicleFeatures.dogBox,
      shape: 'TRIANGLE',
      sign: 'SUBTRACT',
      length: 36,
      width: 92,
      height: 48,
    };
    const certifications: Certifications = {
      c730415: await container(
        {
          cert_number: '730415',
          capacity_cy: 65,
          vehicle_type_id: vehicleTypes.dumpTrailer,
          certified_at: '2026-10-10T13:10:00Z',
          received_at: '2026-10-10T13:11:00Z',
          client_representative_name: 'Bayline County debris manager',
          contractor_representative_name: 'Coastline Haulers dispatch',
        },
        [360, 96, 72],
        { feature_id: vehicleFeatures.sideboards, length: 360, width: 96, height: 16 },
      ),
      c730416: await container(
        {
          ...selfLoader,
          certified_at: '2026-10-10T13:40:00Z',
          received_at: '2026-10-10T13:41:00Z',
        },
        [264, 92, 96],
        dogBox,
      ),
      c730417: await this.insert(
        'certification',
        crewLike(certifies, {
          cert_number: '730417',
          crew_type_id: crewTypes.bucketTruck,
          certified_at: '2026-10-10T14:05:00Z',
          received_at: '2026-10-10T14:06:00Z',
        }),
      ),
      c730418: await this.insert(
        'certification',
        crewLike(certifies, {
          cert_number: '730418',
          crew_type_id: crewTypes.skidSteer,
          certified_at: '2026-10-10T14:20:00Z',
          received_at: '2026-10-10T14:21:00Z',
        }),
      ),
      c730419: await container(
        {
          cert_number: '730419',
          capacity_cy: 110,
          vehicle_type_other: 'Walking floor trailer',
          certified_at: '2026-10-10T14:50:00Z',
          received_at: '2026-10-10T14:51:00Z',
        },
        [576, 96, 93],
        {
          feature_id: vehicleFeatures.curvedSides,
          shape: 'RADIUS_CORNER',
          sign: 'SUBTRACT',
          length: null,
          width: null,
          height: null,
          radius: 6,
          run: 576,
          corners: 2,
        },
      ),
      p2c730416: await container(
        {
          ...selfLoader,
          project_id: p2,
          assignment_id: certifyingAssignments.p2,
          certified_at: '2026-10-11T13:15:00Z',
          received_at: '2026-10-11T13:16:00Z',
        },
        [264, 92, 96],
        dogBox,
      ),
    };
    await this.insert('certification_helper', {
      certification_id: certifications.c730415,
      user_id: helper,
    });
    // A container's primary box is asked for when the piece of work that wrote it ends (a deferred
    // constraint trigger). The world is never committed, so it is asked here, as a commit would:
    // every container above has its primary box.
    await this.db.run('SET CONSTRAINTS ALL IMMEDIATE');
    await this.db.run('SET CONSTRAINTS ALL DEFERRED');
    await this.insert('user_viewer_project', given(coastlineViewer, p1));
    await this.insert('user_viewer_project', given(clientViewer, p1));
    await this.insert('user_viewer_project', given(auditor, p1));
    await this.insert('user_viewer_project', given(auditor, p2));

    const place = { monitor, device };
    return {
      admin,
      certifier,
      helper,
      certifyingDevice,
      certifyingAssignments,
      rivera,
      certifications,
      vehicleTypes,
      vehicleFeatures,
      crewTypes,
      monitor,
      device,
      assignments,
      site,
      landfill,
      siteTypes,
      worker: systemActorId,
      coastline,
      summit,
      harbor,
      contracts,
      forms,
      formDebrisTypes,
      payableTypes,
      kindsOfWork,
      payItems,
      rates,
      rule,
      coastlineViewer,
      clientViewer,
      auditor,
      ...hub,
      p1,
      p2,
      loads: {
        l101001: await this.load(
          { ...place, assignment: assignments.p1 },
          p1,
          '101001',
          80,
          coastline,
          ['52.0000', '4.9000', '254.80'],
        ),
        l101002: await this.load(
          { ...place, assignment: assignments.p1 },
          p1,
          '101002',
          75,
          summit,
          ['36.0000', '5.2500', '189.00'],
        ),
        l102001: await this.load(
          { ...place, assignment: assignments.p2 },
          p2,
          '102001',
          90,
          coastline,
          ['43.2000', '4.9000', '211.68'],
        ),
      },
      written: this.written,
    };
  }

  // A load: its collection and disposal events, the completed load and one transaction.
  private async load(
    place: { monitor: string; device: string; assignment: string },
    projectId: string,
    ticketNumber: string,
    loadCall: number,
    primeId: string,
    [quantity, rate, amount]: [string, string, string],
  ): Promise<Load> {
    const event = (kind: string, ended: string, call: number | null): Promise<string> =>
      this.insert('field_event', {
        id: null,
        project_id: projectId,
        workflow: 'LOAD',
        kind,
        ticket_number: ticketNumber,
        monitor_id: place.monitor,
        device_id: place.device,
        assignment_id: place.assignment,
        setup_version: 1,
        started_at: '2026-10-12T13:40:00Z',
        ended_at: ended,
        device_utc_offset_minutes: -240,
        end_latitude: '27.94620000',
        end_longitude: '-82.45870000',
        load_call: call,
      });
    const collection = await event('COLLECTION', '2026-10-12T14:05:00Z', null);
    const disposal = await event('DISPOSAL', '2026-10-12T14:35:00Z', loadCall);
    const completedLoad = await this.insert('completed_load', {
      project_id: projectId,
      ticket_number: ticketNumber,
      collection_event_id: collection,
      disposal_event_id: disposal,
      updated_at: '2026-10-12T20:00:00Z',
    });
    const transaction = await this.insert('transaction', {
      completed_load_id: completedLoad,
      slot: 1,
      quantity,
      rate,
      amount,
      prime_id: primeId,
    });
    return { collection, disposal, completedLoad, transaction };
  }

  // A value of one of the firm's lists, by the name it ships with: its id.
  private async picked(list: string, name: string): Promise<string> {
    return (
      await this.db.one<{ id: string }>(`SELECT "id"::text FROM "${list}" WHERE "name" = $1`, [
        name,
      ])
    ).id;
  }

  // Inserts one row and returns its id. An id of null asks the database for a UUIDv7 up front, as
  // a phone makes a field event's own.
  private async insert(table: string, values: Record<string, unknown>): Promise<string> {
    const row = { ...values };
    if (row['id'] === null)
      row['id'] = (await this.db.one<{ id: string }>('SELECT uuidv7()::text AS id')).id;
    const { id } = await this.db.one<{ id: string }>(...insertOf(table, row));
    (this.written[table] ??= []).push(id);
    return id;
  }
}
