// The sample's setup (sample-projects.ts), as Dana Reyes (sample) makes it at her browser, each
// thing at the setup screen's own endpoint (ARCHITECTURE §6; spec/parts/01-setup.md): the golden
// mission's §1 (spec/golden/MISSION.md), in the order of the setup spine, with what the sample adds
// so that a firm finds every kind of record in it. Every value it picks is one the installation
// ships (sample-names.ts).
//
// **The ROW project** ("Sample: Bayline County ROW, Hurricane Delphine", P1): loads, haul-outs and
// unit rate work; split loads allowed (for the haul-out from three piles) and the time clock on;
// its map with three zones; a site of each shipped site type: Marsh Road TDSR (TDSR/DMS), Bayline
// County Landfill and Cypress Creek Landfill (Final Disposal), Bayline Transfer Station (Transfer
// Station) and Old Quarry Pit (Other, an ineligible site, its permit outstanding); the golden
// mission's pay items and rules, and HHW by the pound, so that each shipped kind of unit rate
// work has its pay item.
//
// **The PPDR project** ("Sample: Bayline County PPDR, Hurricane Delphine", P2): loads only, an ROE
// on every collection, its ROE and survey forms, Vegetative at $9.00, Marsh Road TDSR entered
// again.
import {
  addFieldTagEndpoint,
  addFormDebrisTypeEndpoint,
  addPrimeEndpoint,
  changeProjectSettingsEndpoint,
  createClientEndpoint,
  createContractEndpoint,
  createContractorEndpoint,
  createDeclarationEventEndpoint,
  createFormEndpoint,
  createPayItemEndpoint,
  createProjectEndpoint,
  createRuleEndpoint,
  createSiteEndpoint,
  linkTippingFeeEndpoint,
  loadMapEndpoint,
  savePaysWhenEndpoint,
  type Endpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';

import type { AskedWith } from '../over-https.ts';
import type { OfficeBrowser } from '../office-browser.ts';
import { p1Boundary, p1Zones } from '../stories/setup.ts';
import { sample } from './sample-names.ts';

// What the rest of the sample needs of its setup, by id.
export interface SampleSetUp {
  readonly p1: string;
  readonly p2: string;
  readonly prime: string;
  readonly contracts: { readonly row: string; readonly ppdr: string };
  readonly sites: {
    readonly tdsr: string;
    readonly landfill: string;
    readonly cypress: string;
    readonly transfer: string;
    readonly quarry: string;
    readonly p2Tdsr: string;
  };
  // The unit rate pay items a monitor's work falls to, each with its code.
  readonly unitRateWork: readonly { readonly id: string; readonly code: string }[];
}

// A pay item's capture settings, none ticked: whoever enters one states each (ADR-309).
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

interface Criterion {
  readonly criterion: string;
  readonly operator: string;
  readonly picks?: readonly string[];
  readonly numberFrom?: number;
  readonly numberTo?: number;
}

// The firm's lists the setup picks from, by name, as the setup screen's picks show them.
type List =
  | 'declarationReferenceType'
  | 'programType'
  | 'kindOfWork'
  | 'debrisType'
  | 'reductionMethod'
  | 'payableType'
  | 'itemName';

export class SampleSetup {
  private readonly dana: OfficeBrowser;
  private readonly api: Database;

  constructor(dana: OfficeBrowser, api: Database) {
    this.dana = dana;
    this.api = api;
  }

  // Dana's setup of both projects, Thursday and Friday.
  async done(): Promise<SampleSetUp> {
    const client = await this.saved(createClientEndpoint, {
      json: { name: sample.client, notes: 'The sample projects: see what a set-up project holds.' },
    });
    const declarationEvent = await this.saved(createDeclarationEventEndpoint, {
      json: {
        ...sample.declarationEvent,
        referenceTypeId: await this.listed('declarationReferenceType', 'FEMA disaster (DR)'),
      },
    });
    const prime = await this.saved(createContractorEndpoint, {
      json: { name: sample.prime, kind: 'HAULER' },
    });
    const row = await this.rowProject(client, declarationEvent, prime);
    const ppdr = await this.ppdrProject(client, declarationEvent, prime);
    return {
      p1: row.project,
      p2: ppdr.project,
      prime,
      contracts: { row: row.contract, ppdr: ppdr.contract },
      sites: { ...row.sites, p2Tdsr: ppdr.tdsr },
      unitRateWork: row.unitRateWork,
    };
  }

  private async rowProject(client: string, declarationEvent: string, prime: string) {
    const kindsOfWork = [];
    for (const name of ['Hangers', 'Leaners', 'Stumps', 'White Goods', 'HHW', 'Crew time']) {
      kindsOfWork.push(await this.listed('kindOfWork', name));
    }
    const project = await this.saved(createProjectEndpoint, {
      json: {
        name: sample.projects.row,
        clientId: client,
        declarationEventId: declarationEvent,
        programTypeId: await this.listed('programType', 'ROW'),
        timeZone: sample.timeZone,
        activeFrom: '2026-10-12',
        activeTo: '2027-01-31',
        ticketNumberSource: 'GENERATED',
        workflows: ['LOAD', 'HAUL_OUT', 'UNIT_RATE'],
        kindOfWorkIds: kindsOfWork,
        numbersFrom: { LOAD: 101001, HAUL_OUT: 201001, UNIT_RATE: 301001, CERTIFICATION: 730415 },
      },
    });
    const at = { ids: { projectId: project } };
    // Split loads, for the haul-out loaded from three piles; the time clock, for the hours.
    await this.saved(changeProjectSettingsEndpoint, {
      ...at,
      json: { allowSplitLoads: true, timeClockEnabled: true },
    });
    await this.saved(addPrimeEndpoint, { ...at, json: { contractorId: prime } });
    const contract = await this.saved(createContractEndpoint, {
      ...at,
      json: { name: sample.contracts.row, primeId: prime },
    });
    for (const tag of ['Mixed', 'Zone 1 pile', 'Zone 2 pile', 'Zone 3 pile']) {
      await this.saved(addFieldTagEndpoint, { ...at, json: { name: tag } });
    }

    // The forms: one for each document type it uses; the incident form offers the contractor
    // involved and a cert number (ADR-334).
    const form = (documentType: string, name: string, more: object = {}) =>
      this.saved(createFormEndpoint, { ...at, json: { documentType, name, ...more } });
    const forms = {
      load: await form('LOAD', 'Load'),
      haulOut: await form('HAUL_OUT', 'Haul-out'),
      unitRate: await form('UNIT_RATE', 'Unit rate'),
    };
    await form('INCIDENT', 'Incident', { incidentOffers: ['CONTRACTOR', 'CERT_NUMBER'] });
    await form('DROP_OFF_LOG', 'Drop-off log');
    const entry = async (formId: string, debrisType: string, reducedBy?: string) =>
      this.saved(addFormDebrisTypeEndpoint, {
        ids: { formId },
        json: {
          debrisTypeId: await this.listed('debrisType', debrisType),
          reduced: reducedBy !== undefined,
          ...(reducedBy === undefined
            ? {}
            : { reductionMethodId: await this.listed('reductionMethod', reducedBy) }),
          hiddenOnPhones: false,
        },
      });
    const loadVegetative = await entry(forms.load, 'Vegetative');
    const loadCd = await entry(forms.load, 'C&D');
    // The mission's Mulch is the firm's own debris type: the sample's haul-outs carry the
    // shipped Vegetative, reduced by grinding at the TDSR.
    const reduced = await entry(forms.haulOut, 'Vegetative', 'Grinding');

    const sites = await this.rowSites(project);
    await this.saved(loadMapEndpoint, {
      ...at,
      json: {
        source: 'UPLOAD',
        sourceName: 'bayline-row-zones-v1.geojson',
        boundary: p1Boundary,
        zones: p1Zones,
        zoneNameField: 'ZONE_NAME',
      },
    });

    // The pay items, read off the contract, Coastline's rate on each (golden mission §1).
    const payItem = async (
      code: string,
      description: string,
      payableType: string,
      unit: string,
      rate: string,
      more: object = {},
    ) =>
      this.saved(createPayItemEndpoint, {
        ...at,
        json: {
          ...unticked,
          code,
          description,
          payableTypeId: await this.listed('payableType', payableType),
          unit,
          rates: [{ primeId: prime, rate }],
          ...more,
        },
      });
    const ids: Record<string, string> = {};
    const enter = async (...args: Parameters<typeof payItem>) => {
      ids[args[0]] = await payItem(...args);
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
    // A rule adds these two; no monitor picks them, so they have no kind of work.
    await enter('STP-FILL-CY', 'Stump hole fill', 'Stumps', 'CY', '22.00');
    await enter('WG-FRN-EA', 'Freon recovered', 'White Goods', 'EA', '25.00');
    // The unit rate pay items a monitor's work falls to, photographs required on each.
    const work = async (
      code: string,
      description: string,
      kind: string,
      unit: string,
      rate: string,
      more: object = {},
    ) =>
      enter(code, description, kind, unit, rate, {
        kindOfWorkId: await this.listed('kindOfWork', kind),
        photosRequired: true,
        ...more,
      });
    const each = (code: string, description: string, kind: string, rate: string, band?: number[]) =>
      work(code, description, kind, 'EA', rate, {
        countIsAlwaysOne: true,
        measurementRequired: band !== undefined,
        bandFrom: band?.[0] ?? null,
        bandTo: band?.[1] ?? null,
      });
    await each('HNG-RMV-EA', 'Hanger removal', 'Hangers', '68.00');
    await each('LNR-RMV-EA-24', 'Leaner removal 6–24 in', 'Leaners', '95.00', [6, 24]);
    await each('LNR-RMV-EA-99', 'Leaner removal 24.1–99 in', 'Leaners', '185.00', [24.1, 99]);
    await each('STP-RMV-EA-36', 'Stump removal 24–36 in', 'Stumps', '110.00', [24, 36]);
    await each('STP-RMV-EA-48', 'Stump removal 36.1–48 in', 'Stumps', '175.00', [36.1, 48]);
    await work('WG-RMV-EA', 'White good removed', 'White Goods', 'EA', '40.00');
    await work('HHW-RMV-LB', 'HHW removal, by the pound', 'HHW', 'LB', '1.85');
    await work('CREW-TIME-HR', 'Crew time, skid steer crew', 'Crew time', 'HR', '150.00', {
      decimalsAllowed: true,
      crewTimeConversion: 'PER_HOUR',
    });
    const code = (named: string): string => {
      const id = ids[named];
      if (id === undefined) throw new Error(`The sample has no pay item ${named}.`);
      return id;
    };
    await this.saved(linkTippingFeeEndpoint, {
      ids: { siteId: sites.landfill },
      json: { payItemId: code('TIP-FEE-CY-BCL') },
    });

    // The rules, each pay item's "Pays when" (spec/RULES.md), naming the one contract.
    const debris = (entryId: string): Criterion => ({
      criterion: 'DEBRIS_TYPE',
      operator: 'EQUALS',
      picks: [entryId],
    });
    const within15: Criterion = { criterion: 'MILEAGE', operator: 'AT_MOST', numberFrom: 15 };
    const dumpedAt = (siteId: string): Criterion => ({
      criterion: 'DISPOSAL_SITE',
      operator: 'EQUALS',
      picks: [siteId],
    });
    const payItemIs = (...payItemIds: string[]): Criterion => ({
      criterion: 'PAY_ITEM',
      operator: payItemIds.length === 1 ? 'EQUALS' : 'IS_ONE_OF',
      picks: payItemIds,
    });
    const pays = (named: string, ...forms: object[]) =>
      this.saved(savePaysWhenEndpoint, { ids: { payItemId: code(named) }, json: { pays: forms } });
    await pays('VEG-HAUL-CY-15', {
      formId: forms.load,
      slot: 1,
      criteria: [debris(loadVegetative), within15],
    });
    await pays('VEG-HAUL-CY-30', {
      formId: forms.load,
      slot: 1,
      criteria: [
        debris(loadVegetative),
        { criterion: 'MILEAGE', operator: 'BETWEEN', numberFrom: 15.1, numberTo: 30 },
      ],
    });
    await pays('CD-HAUL-CY-15', {
      formId: forms.load,
      slot: 1,
      criteria: [debris(loadCd), within15],
    });
    // The Landfill's tipping fee on a load and on a haul-out dumped there: a rule for each form.
    await pays(
      'TIP-FEE-CY-BCL',
      { formId: forms.load, slot: 2, criteria: [dumpedAt(sites.landfill)] },
      { formId: forms.haulOut, slot: 2, criteria: [dumpedAt(sites.landfill)] },
    );
    await pays('MULCH-HO-CY', {
      formId: forms.haulOut,
      slot: 1,
      criteria: [debris(reduced), dumpedAt(sites.landfill)],
    });
    await pays('MULCH-HO-TN', {
      formId: forms.haulOut,
      slot: 1,
      criteria: [debris(reduced), dumpedAt(sites.cypress)],
    });
    for (const named of [
      'HNG-RMV-EA',
      'LNR-RMV-EA-24',
      'LNR-RMV-EA-99',
      'STP-RMV-EA-36',
      'STP-RMV-EA-48',
      'CREW-TIME-HR',
    ]) {
      await pays(named, { formId: forms.unitRate, slot: 1, criteria: [payItemIs(code(named))] });
    }
    // HHW by the pound: every item's pounds.
    await pays('HHW-RMV-LB', {
      formId: forms.unitRate,
      slot: 1,
      criteria: [payItemIs(code('HHW-RMV-LB'))],
      quantityFrom: 'ALL_ITEMS',
    });
    // White goods: the rules, never a setting on an item, say which items count (spec/RULES.md §9).
    const freonRecovered = await this.listed('itemName', 'Fridge, freon recovered');
    const removed = [];
    for (const name of [
      'Washer',
      'Dryer',
      'Fridge, freon recovered',
      'Fridge, no freon',
      'Oven',
      'Microwave',
    ]) {
      removed.push(await this.listed('itemName', name));
    }
    await pays('WG-RMV-EA', {
      formId: forms.unitRate,
      slot: 1,
      criteria: [payItemIs(code('WG-RMV-EA'))],
      quantityFrom: 'CHOSEN_ITEMS',
      itemNameIds: removed,
    });
    await pays('WG-FRN-EA', {
      formId: forms.unitRate,
      slot: 2,
      criteria: [
        payItemIs(code('WG-RMV-EA')),
        { criterion: 'ITEM', operator: 'AT_LEAST', picks: [freonRecovered], numberFrom: 1 },
      ],
      quantityFrom: 'CHOSEN_ITEMS',
      itemNameIds: [freonRecovered],
    });
    // The stump hole fill, written in the rule builder.
    await this.saved(createRuleEndpoint, {
      ...at,
      json: {
        formId: forms.unitRate,
        name: 'STP-FILL-CY - Stump hole fill',
        contractId: contract,
        active: true,
        criteria: [payItemIs(code('STP-RMV-EA-36'), code('STP-RMV-EA-48'))],
        actions: [{ kind: 'ADD_TRANSACTION', slot: 2, payItemId: code('STP-FILL-CY') }],
      },
    });
    const unitRateWork = [
      'HNG-RMV-EA',
      'LNR-RMV-EA-24',
      'LNR-RMV-EA-99',
      'STP-RMV-EA-36',
      'STP-RMV-EA-48',
      'WG-RMV-EA',
      'HHW-RMV-LB',
      'CREW-TIME-HR',
    ].map((named) => ({ id: code(named), code: named }));
    return { project, contract, sites, unitRateWork };
  }

  // P1's sites, one of each shipped site type, each active from the project's first day
  // (spec/CONVENTIONS.md §6: their GPS and permits).
  private async rowSites(projectId: string) {
    const site = async (
      name: string,
      siteType: string,
      facts: {
        takesLoads: boolean;
        haulOutsLeaveHere?: boolean;
        chargesTippingFee?: boolean;
        ineligibleSite?: boolean;
      },
      where: {
        latitude: string;
        longitude: string;
        permitNumber: string | null;
        shortCode?: string;
      },
    ) =>
      this.saved(createSiteEndpoint, {
        ids: { projectId },
        json: {
          name,
          siteTypeId: await this.siteType(siteType),
          haulOutsLeaveHere: false,
          chargesTippingFee: false,
          ineligibleSite: false,
          ...facts,
          ...where,
          activationDate: '2026-10-12',
        },
      });
    return {
      tdsr: await site(
        'Marsh Road TDSR',
        'TDSR',
        { takesLoads: true, haulOutsLeaveHere: true },
        { latitude: '39.09000000', longitude: '-75.62000000', permitNumber: 'FDEP-DMS-2026-0117' },
      ),
      landfill: await site(
        'Bayline County Landfill',
        'FINAL_DISPOSAL',
        { takesLoads: true, chargesTippingFee: true },
        {
          latitude: '39.00000000',
          longitude: '-75.58000000',
          permitNumber: 'FDEP-SW-0098',
          shortCode: 'BCL',
        },
      ),
      cypress: await site(
        'Cypress Creek Landfill',
        'FINAL_DISPOSAL',
        { takesLoads: true },
        {
          latitude: '39.24000000',
          longitude: '-75.60000000',
          permitNumber: 'FDEP-SW-0131',
          shortCode: 'CCL',
        },
      ),
      transfer: await site(
        'Bayline Transfer Station',
        'Transfer Station',
        { takesLoads: true },
        { latitude: '39.16000000', longitude: '-75.57000000', permitNumber: 'FDEP-TS-2026-0412' },
      ),
      // An ineligible site, its permit outstanding: a load dumped there is flagged, and bills.
      quarry: await site(
        'Old Quarry Pit',
        'Other',
        { takesLoads: true, ineligibleSite: true },
        { latitude: '39.20000000', longitude: '-75.65000000', permitNumber: null },
      ),
    };
  }

  private async ppdrProject(client: string, declarationEvent: string, prime: string) {
    const project = await this.saved(createProjectEndpoint, {
      json: {
        name: sample.projects.ppdr,
        clientId: client,
        declarationEventId: declarationEvent,
        programTypeId: await this.listed('programType', 'PPDR'),
        timeZone: sample.timeZone,
        activeFrom: '2026-10-12',
        activeTo: '2027-01-31',
        ticketNumberSource: 'GENERATED',
        workflows: ['LOAD'],
        kindOfWorkIds: [],
        numbersFrom: { LOAD: 102001, CERTIFICATION: 730416 },
      },
    });
    const at = { ids: { projectId: project } };
    await this.saved(addPrimeEndpoint, { ...at, json: { contractorId: prime } });
    const contract = await this.saved(createContractEndpoint, {
      ...at,
      json: { name: sample.contracts.ppdr, primeId: prime },
    });
    const load = await this.saved(createFormEndpoint, {
      ...at,
      json: { documentType: 'LOAD', name: 'Load' },
    });
    await this.saved(createFormEndpoint, {
      ...at,
      json: { documentType: 'ROE', name: 'ROE', gpsRequired: false },
    });
    await this.saved(createFormEndpoint, {
      ...at,
      json: { documentType: 'SURVEY', name: 'Survey' },
    });
    const vegetative = await this.saved(addFormDebrisTypeEndpoint, {
      ids: { formId: load },
      json: {
        debrisTypeId: await this.listed('debrisType', 'Vegetative'),
        reduced: false,
        hiddenOnPhones: false,
      },
    });
    const haul = await this.saved(createPayItemEndpoint, {
      ...at,
      json: {
        ...unticked,
        code: 'VEG-HAUL-CY',
        description: 'PPDR VEG haul',
        payableTypeId: await this.listed('payableType', 'Vegetative'),
        unit: 'CY',
        rates: [{ primeId: prime, rate: '9.00' }],
      },
    });
    await this.saved(savePaysWhenEndpoint, {
      ids: { payItemId: haul },
      json: {
        pays: [
          {
            formId: load,
            slot: 1,
            criteria: [{ criterion: 'DEBRIS_TYPE', operator: 'EQUALS', picks: [vegetative] }],
          },
        ],
      },
    });
    const tdsr = await this.saved(createSiteEndpoint, {
      ...at,
      json: {
        name: 'Marsh Road TDSR',
        siteTypeId: await this.siteType('TDSR'),
        takesLoads: true,
        haulOutsLeaveHere: true,
        chargesTippingFee: false,
        ineligibleSite: false,
        permitNumber: 'FDEP-DMS-2026-0117',
        latitude: '39.09000000',
        longitude: '-75.62000000',
        activationDate: '2026-10-12',
      },
    });
    return { project, contract, tdsr };
  }

  // Dana's act at its endpoint: the record it saved, by its id. A refusal stops the load.
  private async saved(served: Endpoint, more: AskedWith): Promise<string> {
    const answer = (await this.dana.answered(served, more)) as { record: { id: string } };
    return answer.record.id;
  }

  // A value of one of the firm's lists, by its name, as the setup screen's pick shows it.
  private async listed(list: List, name: string): Promise<string> {
    const { api } = this;
    const where = { where: { name, archivedAt: null }, select: { id: true } } as const;
    const finders: Record<List, () => Promise<{ id: string } | null>> = {
      declarationReferenceType: () => api.declarationReferenceType.findFirst(where),
      programType: () => api.programType.findFirst(where),
      kindOfWork: () => api.kindOfWork.findFirst(where),
      debrisType: () => api.debrisType.findFirst(where),
      reductionMethod: () => api.reductionMethod.findFirst(where),
      payableType: () => api.payableType.findFirst(where),
      itemName: () => api.itemName.findFirst(where),
    };
    const found = await finders[list]();
    if (found === null) {
      throw new Error(`The firm’s lists hold no ${name}: the sample picks only shipped values.`);
    }
    return found.id;
  }

  // A site type: a built-in one by its key, or one of the shipped list's by its name.
  private async siteType(keyOrName: string): Promise<string> {
    const found = await this.api.siteType.findFirst({
      where: { OR: [{ key: keyOrName }, { name: keyOrName, archivedAt: null }] },
      select: { id: true },
    });
    if (found === null) throw new Error(`The firm’s site types hold no ${keyOrName}.`);
    return found.id;
  }
}
