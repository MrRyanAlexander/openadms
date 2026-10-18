// The third story (BACKLOG 1.1.11; ADR-316): the example world's setup, the golden mission's §1,
// written in the order of the setup spine (spec/parts/01-setup.md) through the API's setup
// services, as the people who make it. Dana Reyes, the admin, sets up P1 on the Thursday before
// the work starts; Luis Ortega, granted Setup, sets up P2 on the Friday. Every record is read back
// and asserted as the mission states it; the audit log holds one record for each row written, with
// the person who wrote it as its actor (AC-01-01, 79, 80).
//
// Along the way setup refuses what it must, and only that: a size band that overlaps, Haul-outs
// leave here off a TDSR, an exact copy of a rule, a change in the rule builder to a rule a pay item
// wrote, a map file it can't read; and the database's own constraints refuse the rest. A refusal
// saves nothing. What only looks wrong is saved with a warning.
//
// Not here: the people's own services (sign-in and permissions are Phase 2's), certifications
// (BACKLOG 1.2), ROEs, phones and the dispatch board (the story dispatch-monday), and the client
// and contractor users' logins (packages/db's viewers tests).
import {
  ContractorSetup,
  type CriterionInput,
  FormSetup,
  ListSetup,
  type NewPayItem,
  type Outcome,
  PayItemSetup,
  ProjectSetup,
  RuleSetup,
  SiteSetup,
} from '@open-adms/api';
import { IncidentOffers, RuleCriteria, uuidv7 } from '@open-adms/domain';

import type { Story } from '../runner.ts';

// A search as the setup screen asks it: what was typed, those in service, the first page.
const searchFor = (search: string) => ({ search, archived: false, limit: 50 });

const timeZone = 'America/New_York';
const thursday = (time: string): string => `2026-10-08T${time}:00-04:00`;
const friday = (time: string): string => `2026-10-09T${time}:00-04:00`;
const date = (value: Date | null): string | null =>
  value === null ? null : value.toISOString().slice(0, 10);

// P1's map as its file gives it (spec/CONVENTIONS.md §6): a boundary from 75.80° W to 75.40° W and
// 38.90° N to 39.30° N, in three zones west to east, each named in the field ZONE_NAME.
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
export const p1Boundary = rectangle(-75.8, 38.9, -75.4, 39.3);
export const p1Zones = {
  type: 'FeatureCollection',
  features: [
    ['Zone 1', -75.8, -75.67] as const,
    ['Zone 2', -75.67, -75.53] as const,
    ['Zone 3', -75.53, -75.4] as const,
  ].map(([name, west, east]) => ({
    type: 'Feature',
    properties: { ZONE_NAME: name },
    geometry: rectangle(west, 38.9, east, 39.3),
  })),
};

// A pay item's settings with nothing ticked: every one is stated, none has a default (ADR-309).
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

export const setup: Story = {
  name: 'setup',
  title:
    'Dana Reyes sets up P1 and Luis Ortega P2, in the spine’s order, through the API’s setup services',
  timeZone,
  start: thursday('08:00'),

  async run(story) {
    const { api, clock } = story;
    const projects = new ProjectSetup(api, clock, story.policy);
    const contractors = new ContractorSetup(api, clock, story.policy);
    const lists = new ListSetup(api, clock, story.policy);
    const forms = new FormSetup(api, clock, story.policy);
    const payItems = new PayItemSetup(api, clock, story.policy);
    const sites = new SiteSetup(api, clock, story.policy);
    const rules = new RuleSetup(api, clock, story.policy);

    // What was saved; a refusal here stops the story.
    const saved = async <T>(attempt: Promise<Outcome<T>>): Promise<T> => {
      const outcome = await attempt;
      if (!outcome.saved) throw new Error(`Setup refused: ${outcome.refusal.message}`);
      return outcome.record;
    };
    // Saved, with what setup warned of as it saved.
    const warned = async <T>(attempt: Promise<Outcome<T>>): Promise<string[]> => {
      const outcome = await attempt;
      if (!outcome.saved) throw new Error(`Setup refused: ${outcome.refusal.message}`);
      return outcome.warnings.map((warning) => warning.message);
    };
    // Everything refused in the story, in order: who tried, who refused it, and what.
    const refusals: string[][] = [];
    const refusedBySetup = async <T>(who: string, attempt: Promise<Outcome<T>>) => {
      const outcome = await attempt;
      if (outcome.saved) return 'saved';
      refusals.push([who, 'setup', outcome.refusal.code]);
      return outcome.refusal.message;
    };
    const refusedByTheDatabase = async (who: string, what: string, attempt: Promise<unknown>) => {
      try {
        await attempt;
        return 'saved';
      } catch (error) {
        refusals.push([who, 'the database', what]);
        return constraintOf(error);
      }
    };

    // The audit records written since this was last asked, counted by person, table and operation.
    const names = new Map<string, string>();
    let auditSeen = (await api.auditRecord.aggregate({ _max: { id: true } }))._max.id ?? 0n;
    const written = async (): Promise<Record<string, number>> => {
      const records = await api.auditRecord.findMany({
        where: { id: { gt: auditSeen } },
        orderBy: { id: 'asc' },
      });
      const counted: Record<string, number> = {};
      for (const record of records) {
        auditSeen = record.id;
        const who = names.get(record.actorId ?? '') ?? 'nobody';
        const key = `${who}: ${record.tableName} ${record.operation} (${record.source})`;
        counted[key] = (counted[key] ?? 0) + 1;
      }
      return counted;
    };
    const all: Record<string, number> = {};
    const audited = async (): Promise<Record<string, number>> => {
      const counted = await written();
      for (const [key, count] of Object.entries(counted)) all[key] = (all[key] ?? 0) + count;
      return counted;
    };

    // A picked value of one of the firm's lists, by its name.
    const picked = {
      programType: async (name: string) =>
        (await api.programType.findFirstOrThrow({ where: { name } })).id,
      kindOfWork: async (name: string) =>
        (await api.kindOfWork.findFirstOrThrow({ where: { name } })).id,
      debrisType: async (name: string) =>
        (await api.debrisType.findFirstOrThrow({ where: { name } })).id,
      payableType: async (name: string) =>
        (await api.payableType.findFirstOrThrow({ where: { name } })).id,
      siteType: async (name: string) =>
        (await api.siteType.findFirstOrThrow({ where: { name } })).id,
      itemName: async (name: string) =>
        (await api.itemName.findFirstOrThrow({ where: { name } })).id,
    };

    // A project's live rules as people read them, in the order written.
    const rulesOf = async (projectId: string): Promise<string[][]> => {
      const stored = await api.rule.findMany({
        where: { projectId, archivedAt: null },
        orderBy: { id: 'asc' },
        include: {
          form: true,
          contract: true,
          fromPayItem: true,
          criteria: {
            where: { archivedAt: null },
            orderBy: { position: 'asc' },
            include: {
              picks: {
                where: { archivedAt: null },
                orderBy: { id: 'asc' },
                include: {
                  formDebrisType: { include: { debrisType: true } },
                  disposalSite: true,
                  payItem: true,
                  itemName: true,
                },
              },
            },
          },
          actions: {
            where: { archivedAt: null },
            orderBy: { id: 'asc' },
            include: {
              payItem: true,
              items: {
                where: { archivedAt: null },
                orderBy: { id: 'asc' },
                include: { itemName: true },
              },
            },
          },
        },
      });
      return stored.map((rule) => [
        rule.form.name,
        rule.name,
        rule.contract?.name ?? 'no contract',
        rule.criteria
          .map((line) => {
            const picks = line.picks.map(
              (pick) =>
                pick.formDebrisType?.debrisType.name ??
                pick.disposalSite?.name ??
                pick.payItem?.code ??
                `"${pick.itemName?.name ?? ''}"`,
            );
            const numbers = [line.numberFrom, line.numberTo]
              .filter((number) => number !== null)
              .map((number) => number.toFixed(line.criterion === 'MILEAGE' ? 1 : 0));
            const label = RuleCriteria.labelOf(line.criterion);
            const operator = RuleCriteria.operatorLabelOf(line.operator);
            return line.criterion === 'ITEM'
              ? `${label} ${picks.join(', ')} ${operator} ${numbers.join(' and ')}`
              : `${label} ${operator} ${[...picks, ...numbers].join(numbers.length > 1 ? ' and ' : ', ')}`;
          })
          .join(' · '),
        rule.actions
          .map((action) =>
            action.kind === 'ADD_TRANSACTION'
              ? `Add #${String(action.slot)} ${action.payItem?.code ?? ''}` +
                (action.quantityFrom === 'CHOSEN_ITEMS'
                  ? ` from ${action.items.map((item) => item.itemName.name).join(', ')}`
                  : '')
              : action.kind,
          )
          .join('; '),
        rule.fromPayItem === null ? 'the rule builder' : `pay item ${rule.fromPayItem.code}`,
        rule.active ? 'active' : 'inactive',
      ]);
    };

    // ------------------------------------------------------------------------------------------
    story.at(
      thursday('08:00'),
      'Gates Disaster Recovery’s back office: Dana Reyes, the admin, and Luis Ortega, whom she grants Setup',
    );
    // The first user is written with itself as the actor (ADR-270 (4)); people's own services, and
    // reading a permission before a call, are Phase 2's.
    const dana = uuidv7(clock.now());
    const luis = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
      const person = await tx.user.create({
        data: { name: 'Luis Ortega', role: 'MANAGER_ANALYST' },
      });
      await tx.userPermission.create({ data: { userId: person.id, permission: 'SETUP' } });
      await tx.userPermission.create({ data: { userId: person.id, permission: 'VIEW_SETUP' } });
      return person.id;
    });
    names.set(dana, 'Dana').set(luis, 'Luis');
    // Setup takes "view setup" beside it (ADR-539).
    story.check('two people and two permissions, each written by Dana', await audited(), {
      'Dana: user INSERT (BACK_OFFICE)': 2,
      'Dana: user_permission INSERT (BACK_OFFICE)': 2,
    });

    // ------------------------------------------------------------------------------------------
    story.at(
      thursday('08:10'),
      'Step 1, the client: Dana searches for Bayline County, finds none and creates it',
    );
    story.check(
      'no client is called Bayline yet',
      (await projects.findClients(searchFor('bayline'))).records,
      [],
    );
    const client = await saved(projects.client(dana, { name: 'Bayline County' }));

    story.at(
      thursday('08:15'),
      'Step 2, the declaration event: Hurricane Delphine, DR-9001-FL, a FEMA disaster',
    );
    story.check(
      'no declaration event has that reference yet',
      (await projects.findDeclarationEvents(searchFor('DR-9001'))).records,
      [],
    );
    const fema = await api.declarationReferenceType.findFirstOrThrow({
      where: { name: 'FEMA disaster (DR)' },
    });
    const delphine = await saved(
      projects.declarationEvent(dana, {
        name: 'Hurricane Delphine',
        reference: 'DR-9001-FL',
        referenceTypeId: fema.id,
      }),
    );

    story.at(
      thursday('08:20'),
      'Step 3, the project: P1, a ROW project, with the kinds of unit rate work it allows',
    );
    const row = await picked.programType('ROW');
    const p1Kinds = ['Hangers', 'Leaners', 'Stumps', 'White Goods', 'Crew time'];
    const newP1 = {
      name: 'Bayline County ROW, Hurricane Delphine',
      clientId: client.id,
      declarationEventId: delphine.id,
      programTypeId: row,
      timeZone,
      activeFrom: '2026-10-12',
      activeTo: '2027-01-31',
      ticketNumberSource: 'GENERATED',
      workflows: ['LOAD', 'HAUL_OUT', 'UNIT_RATE'],
      kindOfWorkIds: await Promise.all(p1Kinds.map((kind) => picked.kindOfWork(kind))),
      // Where its numbers start, and the seed of its cert numbers (Q-96).
      numbersFrom: { LOAD: 101001, HAUL_OUT: 201001, UNIT_RATE: 301001, CERTIFICATION: 730415 },
    } as const;
    story.check(
      'AC-01-80 a time zone that isn’t an IANA name is refused by the database: EST',
      await refusedByTheDatabase(
        'Dana',
        'a time zone that isn’t an IANA name',
        projects.project(dana, { ...newP1, timeZone: 'EST' }),
      ),
      'project_time_zone_named_check',
    );
    const p1 = (await saved(projects.project(dana, newP1))).id;
    const p1Series = await api.projectNumberSeries.findMany({
      where: { projectId: p1 },
      orderBy: { firstNumber: 'asc' },
    });
    story.check(
      'AC-01-09, AC-04-01 P1 generates its numbers: a series for each workflow, its cert numbers from 730415, its ROEs from 1',
      p1Series.map((series) => `${series.series} from ${String(series.firstNumber)}`),
      [
        'ROE from 1',
        'LOAD from 101001',
        'HAUL_OUT from 201001',
        'UNIT_RATE from 301001',
        'CERTIFICATION from 730415',
      ],
    );
    const p1Read = async () =>
      api.project.findUniqueOrThrow({
        where: { id: p1 },
        include: {
          client: true,
          declarationEvent: { include: { referenceType: true } },
          programType: true,
          kindsOfWork: {
            include: { kindOfWork: true },
            orderBy: { kindOfWork: { position: 'asc' } },
          },
        },
      });
    const p1New = await p1Read();
    story.check(
      'P1 is one body of work for Bayline County under Hurricane Delphine, DR-9001-FL: ROW (no ROE), America/New_York, active 12 October 2026 to 31 January 2027, its numbers generated, with loads, haul-outs and unit rate tickets, and five kinds of unit rate work',
      [
        p1New.name,
        p1New.client.name,
        p1New.declarationEvent.name,
        p1New.declarationEvent.reference,
        p1New.declarationEvent.referenceType.name,
        p1New.programType.name,
        p1New.programType.requiresRoe,
        p1New.timeZone,
        date(p1New.activeFrom),
        date(p1New.activeTo),
        p1New.ticketNumberSource,
        p1New.workflows,
        p1New.kindsOfWork.map((allowed) => allowed.kindOfWork.name),
      ],
      [
        'Bayline County ROW, Hurricane Delphine',
        'Bayline County',
        'Hurricane Delphine',
        'DR-9001-FL',
        'FEMA disaster (DR)',
        'ROW',
        false,
        'America/New_York',
        '2026-10-12',
        '2027-01-31',
        'GENERATED',
        ['LOAD', 'HAUL_OUT', 'UNIT_RATE'],
        p1Kinds,
      ],
    );
    const settingsOf = (project: typeof p1New) => ({
      allowSplitLoads: project.allowSplitLoads,
      loadCallLowLimit: project.loadCallLowLimit,
      loadCallHighLimit: project.loadCallHighLimit,
      siteCircleMeters: project.siteCircleMeters,
      stumpFillDepthInches: project.stumpFillDepthInches,
      stumpCheckRootBallWider: project.stumpCheckRootBallWider,
      stumpCheckFillNeedsExposure: project.stumpCheckFillNeedsExposure,
      timeClockEnabled: project.timeClockEnabled,
    });
    const starts = {
      allowSplitLoads: false,
      loadCallLowLimit: 5,
      loadCallHighLimit: 95,
      siteCircleMeters: 200,
      stumpFillDepthInches: 31,
      stumpCheckRootBallWider: true,
      stumpCheckFillNeedsExposure: true,
      timeClockEnabled: false,
    };
    story.check(
      'AC-01-11 its settings start as the release’s policy values, which the service took from the API’s own reading of them; a ROW project starts without Allow split loads',
      settingsOf(p1New),
      starts,
    );
    await saved(projects.changeSettings(dana, p1, { allowSplitLoads: true }));
    const ticked = await api.auditRecord.findFirstOrThrow({
      where: { tableName: 'project', operation: 'UPDATE' },
    });
    story.check(
      'Dana ticks Allow split loads, for haul-outs loaded from more than one pile: saved, and audited with the value before',
      [
        settingsOf(await p1Read()),
        ticked.changedFields,
        (ticked.priorValue as { allow_split_loads: boolean }).allow_split_loads,
        ticked.actorId === dana,
      ],
      [{ ...starts, allowSplitLoads: true }, ['allow_split_loads'], false, true],
    );

    story.at(
      thursday('08:40'),
      'Step 3, the project map: the boundary and three zones from bayline-row-zones-v1.geojson',
    );
    const p1Map = {
      projectId: p1,
      source: 'UPLOAD',
      sourceName: 'bayline-row-zones-v1.geojson',
      boundary: p1Boundary,
      zones: p1Zones,
      zoneNameField: 'ZONE_NAME',
    } as const;
    story.check(
      'Dana picks the wrong field for the zones’ names: setup can’t read the zones and loads nothing',
      await refusedBySetup('Dana', projects.loadMap(dana, { ...p1Map, zoneNameField: 'NAME' })),
      'Not loaded: A zone has no name in the field NAME.',
    );
    await saved(projects.loadMap(dana, p1Map));
    const maps = await api.mapVersion.findMany({
      where: { projectId: p1 },
      include: { loadedBy: true, zones: { orderBy: { name: 'asc' } } },
    });
    story.check(
      'AC-01-59 it is map version 1, loaded by Dana: the boundary’s box, and Zone 1, Zone 2 and Zone 3 west to east, each with its own',
      maps.map((map) => [
        map.version,
        map.source,
        map.sourceName,
        map.zoneNameField,
        map.loadedBy.name,
        (map.boundary as { type: string }).type,
        [map.westLongitude, map.southLatitude, map.eastLongitude, map.northLatitude].join(' '),
        map.zones.map(
          (zone) =>
            `${zone.name}: ${zone.westLongitude.toFixed(2)} to ${zone.eastLongitude.toFixed(2)}`,
        ),
      ]),
      [
        [
          1,
          'UPLOAD',
          'bayline-row-zones-v1.geojson',
          'ZONE_NAME',
          'Dana Reyes',
          'Polygon',
          '-75.8 38.9 -75.4 39.3',
          ['Zone 1: -75.80 to -75.67', 'Zone 2: -75.67 to -75.53', 'Zone 3: -75.53 to -75.40'],
        ],
      ],
    );
    story.check(
      'AC-01-79 steps 1 to 3: one audit record for each row written, each Dana’s; the refused project and the unread map left none',
      await audited(),
      {
        'Dana: client INSERT (BACK_OFFICE)': 1,
        'Dana: declaration_event INSERT (BACK_OFFICE)': 1,
        'Dana: project INSERT (BACK_OFFICE)': 1,
        'Dana: project_kind_of_work INSERT (BACK_OFFICE)': 5,
        'Dana: project_number_series INSERT (BACK_OFFICE)': 5,
        'Dana: project UPDATE (BACK_OFFICE)': 1,
        'Dana: map_version INSERT (BACK_OFFICE)': 1,
        'Dana: zone INSERT (BACK_OFFICE)': 3,
      },
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      thursday('09:00'),
      'Step 4, contractors and contracts: Coastline Haulers LLC is added to P1 as a prime, then its contract',
    );
    const coastline = (
      await saved(contractors.contractor(dana, { name: 'Coastline Haulers LLC', kind: 'HAULER' }))
    ).id;
    await saved(contractors.addPrime(dana, p1, coastline));
    story.check(
      'AC-01-80 a second place for one contractor on a project is refused by the database',
      await refusedByTheDatabase(
        'Dana',
        'a second place for one contractor on a project',
        contractors.addPrime(dana, p1, coastline),
      ),
      'project_contractor_project_id_contractor_id_key',
    );
    const p1Contract = (
      await saved(
        contractors.contract(dana, {
          projectId: p1,
          name: 'Coastline, Bayline ROW 2026',
          primeId: coastline,
        }),
      )
    ).id;
    const placed = await api.projectContractor.findMany({
      where: { projectId: p1 },
      include: { contractor: true },
    });
    const p1Contracts = await api.contract.findMany({
      where: { projectId: p1 },
      include: { prime: true },
    });
    story.check(
      'AC-01-15 Coastline, a hauler, is P1’s prime, the key "the prime" points at written with it, and holds "Coastline, Bayline ROW 2026": a name, its prime, no link yet. No sub is set up (AC-01-19: Rivera appears at certification)',
      [
        placed.map((place) => [
          place.contractor.name,
          place.contractor.kind,
          place.position,
          place.asPrimeId === coastline,
          place.primeId,
        ]),
        p1Contracts.map((contract) => [contract.name, contract.prime.name, contract.signedCopyUrl]),
      ],
      [
        [['Coastline Haulers LLC', 'HAULER', 'PRIME', true, null]],
        [['Coastline, Bayline ROW 2026', 'Coastline Haulers LLC', null]],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      thursday('09:15'),
      'Step 5, forms and debris types: a form for each document type P1 uses; Mulch joins the firm’s library; field tags',
    );
    const p1Forms = {
      load: (await saved(forms.form(dana, { projectId: p1, documentType: 'LOAD', name: 'Load' })))
        .id,
      haulOut: (
        await saved(
          forms.form(dana, {
            projectId: p1,
            documentType: 'HAUL_OUT',
            name: 'Haul-out',
          }),
        )
      ).id,
      unitRate: (
        await saved(
          forms.form(dana, {
            projectId: p1,
            documentType: 'UNIT_RATE',
            name: 'Unit rate',
          }),
        )
      ).id,
      incident: (
        await saved(
          forms.form(dana, {
            projectId: p1,
            documentType: 'INCIDENT',
            name: 'Incident',
            // P1 is right-of-way work: the contractor involved and a cert number, no ROE number.
            incidentOffers: IncidentOffers.startingFor({ requiresRoe: false }).list(),
          }),
        )
      ).id,
      dropOffLog: (
        await saved(
          forms.form(dana, {
            projectId: p1,
            documentType: 'DROP_OFF_LOG',
            name: 'Drop-off log',
          }),
        )
      ).id,
    };
    story.check(
      'AC-01-80 a second form of one document type is refused by the database',
      await refusedByTheDatabase(
        'Dana',
        'a second form of one document type',
        forms.form(dana, {
          projectId: p1,
          documentType: 'LOAD',
          name: 'Load, again',
        }),
      ),
      'form_project_id_document_type_key',
    );
    const mulchType = (await saved(lists.debrisType(dana, 'Mulch'))).id;
    const grinding = await api.reductionMethod.findFirstOrThrow({ where: { name: 'Grinding' } });
    const entry = (formId: string, debrisTypeId: string, reduced = false) =>
      forms.debrisType(dana, {
        formId,
        debrisTypeId,
        reduced,
        ...(reduced ? { reductionMethodId: grinding.id } : {}),
        hiddenOnPhones: false,
      });
    const vegetativeType = await picked.debrisType('Vegetative');
    const p1Debris = {
      vegetative: (await saved(entry(p1Forms.load, vegetativeType))).id,
      cd: (await saved(entry(p1Forms.load, await picked.debrisType('C&D')))).id,
      mulch: '',
    };
    const mulchOutcome = await entry(p1Forms.haulOut, mulchType, true);
    if (!mulchOutcome.saved) throw new Error(mulchOutcome.refusal.message);
    p1Debris.mulch = mulchOutcome.record.id;
    story.check(
      'Mulch is marked Reduced, by grinding, so setup has no warning for it on the haul-out form',
      mulchOutcome.warnings,
      [],
    );
    story.check(
      'AC-01-80 a debris type on a form that isn’t a load or haul-out form is refused by the database',
      await refusedByTheDatabase(
        'Dana',
        'a debris type on a form that isn’t a load or haul-out form',
        entry(p1Forms.unitRate, vegetativeType),
      ),
      'form_debris_type_document_type_check',
    );
    const policeReport = [
      { id: 'police-report-number', label: 'Police report number', type: 'TEXT', required: false },
    ];
    await saved(forms.ownFields(dana, p1Forms.incident, policeReport));
    story.check(
      'AC-01-80 the firm’s own fields on a form that isn’t an ROE, survey, incident or drop-off log form are refused by the database',
      await refusedByTheDatabase(
        'Dana',
        'the firm’s own fields on a load form',
        forms.ownFields(dana, p1Forms.load, policeReport),
      ),
      'form_definition_document_type_check',
    );
    for (const tag of ['Mixed', 'Zone 1 pile', 'Zone 2 pile', 'Zone 3 pile']) {
      await saved(projects.fieldTag(dana, p1, tag));
    }
    const formsRead = await api.form.findMany({
      where: { projectId: p1 },
      orderBy: { id: 'asc' },
      include: {
        debrisTypes: {
          orderBy: { id: 'asc' },
          include: { debrisType: true, reductionMethod: true },
        },
        definitions: { include: { createdBy: true } },
      },
    });
    story.check(
      'P1’s forms: the load form with Vegetative and C&D; the haul-out form with Mulch (Reduced, Grinding); the unit rate form; incidents, with the firm’s own "Police report number" as version 1; drop-off logs',
      formsRead.map((form) => [
        form.documentType,
        form.name,
        form.debrisTypes.map((each) =>
          [
            each.debrisType.name,
            each.reduced ? `Reduced (${each.reductionMethod?.name ?? ''})` : null,
            each.hiddenOnPhones ? 'hidden' : null,
          ]
            .filter((part) => part !== null)
            .join(', '),
        ),
        form.definitions.map((definition) => [
          definition.version,
          definition.createdBy.name,
          (definition.fields as { label: string }[]).map((field) => field.label),
        ]),
      ]),
      [
        ['LOAD', 'Load', ['Vegetative', 'C&D'], []],
        ['HAUL_OUT', 'Haul-out', ['Mulch, Reduced (Grinding)'], []],
        ['UNIT_RATE', 'Unit rate', [], []],
        ['INCIDENT', 'Incident', [], [[1, 'Dana Reyes', ['Police report number']]]],
        ['DROP_OFF_LOG', 'Drop-off log', [], []],
      ],
    );
    const tags = await api.fieldTag.findMany({
      where: { projectId: p1 },
      orderBy: { position: 'asc' },
    });
    story.check(
      'P1’s field tags, the firm’s own list, in the order added, none with a key',
      tags.map((tag) => [tag.position, tag.name, tag.key]),
      [
        [1, 'Mixed', null],
        [2, 'Zone 1 pile', null],
        [3, 'Zone 2 pile', null],
        [4, 'Zone 3 pile', null],
      ],
    );
    story.check(
      'AC-01-79 steps 4 and 5: one audit record for each row written; the four refusals left none',
      await audited(),
      {
        'Dana: contractor INSERT (BACK_OFFICE)': 1,
        'Dana: project_contractor INSERT (BACK_OFFICE)': 1,
        'Dana: contract INSERT (BACK_OFFICE)': 1,
        'Dana: form INSERT (BACK_OFFICE)': 5,
        'Dana: debris_type INSERT (BACK_OFFICE)': 1,
        'Dana: form_debris_type INSERT (BACK_OFFICE)': 3,
        'Dana: form_definition INSERT (BACK_OFFICE)': 1,
        'Dana: field_tag INSERT (BACK_OFFICE)': 4,
      },
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      thursday('10:00'),
      'Step 6, pay items: Dana reads the line items off Coastline’s contract, each with Coastline’s rate',
    );
    const stumpFill = (await saved(lists.payableType(dana, 'Stump fill'))).id;
    const freonRecovery = (await saved(lists.payableType(dana, 'Freon recovery'))).id;
    const coastlineRate = (rate: string) => [{ primeId: coastline, rate }];
    const item = async (
      code: string,
      description: string,
      payableType: string,
      unit: NewPayItem['unit'],
      rate: string,
      more: Partial<NewPayItem> = {},
    ): Promise<NewPayItem> => ({
      ...unticked,
      projectId: p1,
      code,
      description,
      payableTypeId: await picked.payableType(payableType),
      unit,
      rates: coastlineRate(rate),
      ...more,
    });
    // A unit rate pay item, one a monitor picks by its payable type: its kind of work, a photo
    // required; by the each, one at a time, measured where a band tells it from another.
    const each = async (
      code: string,
      description: string,
      work: string,
      rate: string,
      band?: { from: number; to: number },
    ): Promise<NewPayItem> =>
      item(code, description, work, 'EA', rate, {
        kindOfWorkId: await picked.kindOfWork(work),
        countIsAlwaysOne: true,
        photosRequired: true,
        measurementRequired: band !== undefined,
        bandFrom: band?.from ?? null,
        bandTo: band?.to ?? null,
      });
    const enter = async (payItem: Promise<NewPayItem>) =>
      (await saved(payItems.payItem(dana, await payItem))).id;

    const ids = {
      veg15: await enter(
        item('VEG-HAUL-CY-15', 'ROW VEG haul 0–15 mi', 'Vegetative', 'CY', '7.50'),
      ),
      veg30: await enter(
        item('VEG-HAUL-CY-30', 'ROW VEG haul 15.1–30 mi', 'Vegetative', 'CY', '8.90'),
      ),
      cd15: '',
      mulchCy: await enter(
        item('MULCH-HO-CY', 'Mulch haul-out to FDS', 'Vegetative', 'CY', '5.10'),
      ),
      mulchTn: await enter(
        item('MULCH-HO-TN', 'Mulch haul-out to FDS, by weight', 'Vegetative', 'TN', '20.00'),
      ),
      hangers: await enter(each('HNG-RMV-EA', 'Hanger removal', 'Hangers', '68.00')),
      leaners24: await enter(
        each('LNR-RMV-EA-24', 'Leaner removal 6–24 in', 'Leaners', '95.00', { from: 6, to: 24 }),
      ),
      leaners99: '',
      stumps36: await enter(
        each('STP-RMV-EA-36', 'Stump removal 24–36 in', 'Stumps', '110.00', { from: 24, to: 36 }),
      ),
      stumps48: await enter(
        each('STP-RMV-EA-48', 'Stump removal 36.1–48 in', 'Stumps', '175.00', {
          from: 36.1,
          to: 48,
        }),
      ),
      // Added by a rule on a stump or a white goods ticket, never picked by a monitor: no kind of
      // work, and a payable type of its own (the golden mission §1).
      stumpFill: await enter(item('STP-FILL-CY', 'Stump hole fill', 'Stump fill', 'CY', '22.00')),
      whiteGoods: await enter(
        item('WG-RMV-EA', 'White good removed', 'White Goods', 'EA', '40.00', {
          kindOfWorkId: await picked.kindOfWork('White Goods'),
          photosRequired: true,
        }),
      ),
      freon: await enter(item('WG-FRN-EA', 'Freon recovered', 'Freon recovery', 'EA', '25.00')),
      crewTime: await enter(
        item('CREW-TIME-HR', 'Crew time, skid steer crew', 'Crew time', 'HR', '150.00', {
          kindOfWorkId: await picked.kindOfWork('Crew time'),
          decimalsAllowed: true,
          photosRequired: true,
          crewTimeConversion: 'PER_HOUR',
        }),
      ),
      tipFee: '',
    };
    story.check(
      'the two payable types the firm added are in its list, at the end, with no key',
      [stumpFill, freonRecovery].length,
      await api.payableType.count({
        where: { name: { in: ['Stump fill', 'Freon recovery'] }, key: null },
      }),
    );
    const leaners99 = each('LNR-RMV-EA-99', 'Leaner removal 24.1–99 in', 'Leaners', '185.00', {
      from: 24.1,
      to: 99,
    });
    story.check(
      'AC-01-45 Dana types the second leaner band as 24–99 in: it overlaps the first at 24 in, and setup refuses it, naming the pay item it overlaps',
      await refusedBySetup('Dana', payItems.payItem(dana, { ...(await leaners99), bandFrom: 24 })),
      "Leaners: 24–99 in overlaps LNR-RMV-EA-24 (6–24 in). Bands of one payable type can't overlap.",
    );
    ids.leaners99 = await enter(leaners99);
    const cd15 = item('CD-HAUL-CY-15', 'ROW C&D haul 0–15 mi', 'C&D', 'CY', '8.25');
    story.check(
      'AC-01-80 a second rate for one prime is refused by the database: nothing of the pay item is saved',
      await refusedByTheDatabase(
        'Dana',
        'a second rate for one prime',
        payItems.payItem(dana, {
          ...(await cd15),
          rates: [...coastlineRate('8.25'), ...coastlineRate('8.50')],
        }),
      ),
      'pay_item_rate_pay_item_id_prime_id_key',
    );
    ids.cd15 = await enter(cd15);
    story.check(
      'AC-01-80 a pay item code the project already has is refused by the database',
      await refusedByTheDatabase(
        'Dana',
        'a pay item code the project already has',
        payItems.payItem(
          dana,
          await item('VEG-HAUL-CY-15', 'ROW VEG haul, again', 'Vegetative', 'CY', '7.75'),
        ),
      ),
      'pay_item_project_id_code_key',
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      thursday('11:00'),
      'Step 7, disposal sites: Marsh Road TDSR, Bayline County Landfill and Cypress Creek Landfill, each entered on P1',
    );
    const facts = {
      takesLoads: true,
      haulOutsLeaveHere: false,
      chargesTippingFee: false,
      ineligibleSite: false,
    };
    const opened = { projectId: p1, activationDate: '2026-10-12' };
    const finalDisposal = await picked.siteType('Final Disposal');
    const tdsr = (
      await saved(
        sites.site(dana, {
          ...opened,
          ...facts,
          name: 'Marsh Road TDSR',
          siteTypeId: await picked.siteType('TDSR/DMS'),
          haulOutsLeaveHere: true,
          permitNumber: 'FDEP-DMS-2026-0117',
          latitude: '39.09000000',
          longitude: '-75.62000000',
        }),
      )
    ).id;
    const landfill = (
      await saved(
        sites.site(dana, {
          ...opened,
          ...facts,
          name: 'Bayline County Landfill',
          shortCode: 'BCL',
          siteTypeId: finalDisposal,
          permitNumber: 'FDEP-SW-0098',
          latitude: '39.00000000',
          longitude: '-75.58000000',
        }),
      )
    ).id;
    const cypress = (
      await saved(
        sites.site(dana, {
          ...opened,
          ...facts,
          name: 'Cypress Creek Landfill',
          shortCode: 'CCL',
          siteTypeId: finalDisposal,
          permitNumber: 'FDEP-SW-0131',
          latitude: '39.24000000',
          longitude: '-75.60000000',
        }),
      )
    ).id;
    story.check(
      'AC-01-54 Dana ticks Haul-outs leave here on Bayline County Landfill: setup refuses it, in plain words',
      await refusedBySetup('Dana', sites.change(dana, landfill, { haulOutsLeaveHere: true })),
      'Bayline County Landfill is a Final Disposal site: only a TDSR/DMS site can be marked Haul-outs leave here. A haul-out is reduced debris leaving a TDSR.',
    );
    story.at(
      thursday('11:20'),
      'Dana ticks Charges a tipping fee on Bayline County Landfill, and writes its tipping fee pay item and its rule there and then',
    );
    await saved(sites.change(dana, landfill, { chargesTippingFee: true }));
    ids.tipFee = await enter(
      item('TIP-FEE-CY-BCL', 'Tipping fee, Bayline County Landfill', 'Tipping fee', 'CY', '4.00'),
    );
    await saved(sites.tippingFee(dana, landfill, ids.tipFee));
    const at = (site: string): CriterionInput => ({
      criterion: 'DISPOSAL_SITE',
      operator: 'EQUALS',
      picks: [site],
    });
    const feeOnLoads = { formId: p1Forms.load, slot: 2, criteria: [at(landfill)] };
    story.check(
      'its "Pays when" on loads writes one rule, naming the one contract whose prime has a rate on it',
      (await saved(payItems.paysWhen(dana, ids.tipFee, [feeOnLoads]))).added.length,
      1,
    );
    const sitesRead = await api.disposalSite.findMany({
      where: { projectId: p1 },
      orderBy: { id: 'asc' },
      include: { siteType: true, tippingFees: { include: { payItem: true } } },
    });
    story.check(
      'AC-01-53, 57 P1’s sites as the mission states them: type, the four facts, short code, permit, GPS as exact decimals, active from 12 October, and the Landfill’s link to its tipping fee pay item',
      sitesRead.map((site) => [
        site.name,
        site.siteType.name,
        site.siteTypeKey,
        [
          site.takesLoads ? 'Takes loads' : null,
          site.haulOutsLeaveHere ? 'Haul-outs leave here' : null,
          site.chargesTippingFee ? 'Charges a tipping fee' : null,
          site.ineligibleSite ? 'Ineligible site' : null,
        ].filter((fact) => fact !== null),
        site.shortCode,
        site.permitNumber,
        `${site.latitude.toFixed(8)}, ${site.longitude.toFixed(8)}`,
        date(site.activationDate),
        date(site.closeDate),
        site.tippingFees.map((fee) => fee.payItem.code),
      ]),
      [
        [
          'Marsh Road TDSR',
          'TDSR/DMS',
          'TDSR',
          ['Takes loads', 'Haul-outs leave here'],
          null,
          'FDEP-DMS-2026-0117',
          '39.09000000, -75.62000000',
          '2026-10-12',
          null,
          [],
        ],
        [
          'Bayline County Landfill',
          'Final Disposal',
          'FINAL_DISPOSAL',
          ['Takes loads', 'Charges a tipping fee'],
          'BCL',
          'FDEP-SW-0098',
          '39.00000000, -75.58000000',
          '2026-10-12',
          null,
          ['TIP-FEE-CY-BCL'],
        ],
        [
          'Cypress Creek Landfill',
          'Final Disposal',
          'FINAL_DISPOSAL',
          ['Takes loads'],
          'CCL',
          'FDEP-SW-0131',
          '39.24000000, -75.60000000',
          '2026-10-12',
          null,
          [],
        ],
      ],
    );
    const payItemsRead = await api.payItem.findMany({
      where: { projectId: p1 },
      orderBy: { code: 'asc' },
      include: { payableType: true, kindOfWork: true, rates: { include: { prime: true } } },
    });
    story.check(
      'P1’s fifteen pay items as the mission’s table has them: code, description, payable type, Unit of Measure, size band, kind of work on a unit rate one, and Coastline’s rate, the only one',
      payItemsRead.map((payItem) => [
        payItem.code,
        payItem.description,
        payItem.payableType.name,
        payItem.unit,
        payItem.bandFrom === null
          ? null
          : `${String(payItem.bandFrom.toNumber())}–${String(payItem.bandTo?.toNumber())} in`,
        payItem.kindOfWork?.name ?? null,
        payItem.rates.map((rate) => `${rate.prime.name} $${rate.rate.toFixed(2)}`).join('; '),
      ]),
      [
        [
          'CD-HAUL-CY-15',
          'ROW C&D haul 0–15 mi',
          'C&D',
          'CY',
          null,
          null,
          'Coastline Haulers LLC $8.25',
        ],
        [
          'CREW-TIME-HR',
          'Crew time, skid steer crew',
          'Crew time',
          'HR',
          null,
          'Crew time',
          'Coastline Haulers LLC $150.00',
        ],
        [
          'HNG-RMV-EA',
          'Hanger removal',
          'Hangers',
          'EA',
          null,
          'Hangers',
          'Coastline Haulers LLC $68.00',
        ],
        [
          'LNR-RMV-EA-24',
          'Leaner removal 6–24 in',
          'Leaners',
          'EA',
          '6–24 in',
          'Leaners',
          'Coastline Haulers LLC $95.00',
        ],
        [
          'LNR-RMV-EA-99',
          'Leaner removal 24.1–99 in',
          'Leaners',
          'EA',
          '24.1–99 in',
          'Leaners',
          'Coastline Haulers LLC $185.00',
        ],
        [
          'MULCH-HO-CY',
          'Mulch haul-out to FDS',
          'Vegetative',
          'CY',
          null,
          null,
          'Coastline Haulers LLC $5.10',
        ],
        [
          'MULCH-HO-TN',
          'Mulch haul-out to FDS, by weight',
          'Vegetative',
          'TN',
          null,
          null,
          'Coastline Haulers LLC $20.00',
        ],
        [
          'STP-FILL-CY',
          'Stump hole fill',
          'Stump fill',
          'CY',
          null,
          null,
          'Coastline Haulers LLC $22.00',
        ],
        [
          'STP-RMV-EA-36',
          'Stump removal 24–36 in',
          'Stumps',
          'EA',
          '24–36 in',
          'Stumps',
          'Coastline Haulers LLC $110.00',
        ],
        [
          'STP-RMV-EA-48',
          'Stump removal 36.1–48 in',
          'Stumps',
          'EA',
          '36.1–48 in',
          'Stumps',
          'Coastline Haulers LLC $175.00',
        ],
        [
          'TIP-FEE-CY-BCL',
          'Tipping fee, Bayline County Landfill',
          'Tipping fee',
          'CY',
          null,
          null,
          'Coastline Haulers LLC $4.00',
        ],
        [
          'VEG-HAUL-CY-15',
          'ROW VEG haul 0–15 mi',
          'Vegetative',
          'CY',
          null,
          null,
          'Coastline Haulers LLC $7.50',
        ],
        [
          'VEG-HAUL-CY-30',
          'ROW VEG haul 15.1–30 mi',
          'Vegetative',
          'CY',
          null,
          null,
          'Coastline Haulers LLC $8.90',
        ],
        [
          'WG-FRN-EA',
          'Freon recovered',
          'Freon recovery',
          'EA',
          null,
          null,
          'Coastline Haulers LLC $25.00',
        ],
        [
          'WG-RMV-EA',
          'White good removed',
          'White Goods',
          'EA',
          null,
          'White Goods',
          'Coastline Haulers LLC $40.00',
        ],
      ],
    );
    story.check(
      'AC-01-79 steps 6 and 7: one audit record for each row written; the Landfill’s tick is an update; the four refusals left none. A site added or changed queued a job in the same piece of work, for the worker to check its permit (ADR-420)',
      await audited(),
      {
        'Dana: payable_type INSERT (BACK_OFFICE)': 2,
        'Dana: pay_item INSERT (BACK_OFFICE)': 15,
        'Dana: pay_item_rate INSERT (BACK_OFFICE)': 15,
        'Dana: disposal_site INSERT (BACK_OFFICE)': 3,
        'Dana: reconciliation_job INSERT (BACK_OFFICE)': 4,
        'Dana: disposal_site UPDATE (BACK_OFFICE)': 1,
        'Dana: disposal_site_tipping_fee INSERT (BACK_OFFICE)': 1,
        'Dana: rule INSERT (BACK_OFFICE)': 1,
        'Dana: rule_criterion INSERT (BACK_OFFICE)': 1,
        'Dana: rule_criterion_pick INSERT (BACK_OFFICE)': 1,
        'Dana: rule_action INSERT (BACK_OFFICE)': 1,
      },
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      thursday('13:00'),
      'Step 8, rules: each pay item’s "Pays when" writes its rule, naming "Coastline, Bayline ROW 2026"',
    );
    const debris = (entryId: string): CriterionInput => ({
      criterion: 'DEBRIS_TYPE',
      operator: 'EQUALS',
      picks: [entryId],
    });
    const within15: CriterionInput = { criterion: 'MILEAGE', operator: 'AT_MOST', numberFrom: 15 };
    const payItemIs = (...payItemIds: string[]): CriterionInput => ({
      criterion: 'PAY_ITEM',
      operator: payItemIds.length === 1 ? 'EQUALS' : 'IS_ONE_OF',
      picks: payItemIds,
    });
    const pays = (payItemId: string, formId: string, criteria: CriterionInput[], slot = 1) =>
      payItems.paysWhen(dana, payItemId, [{ formId, slot, criteria }]);
    const quiet: Record<string, string[]> = {
      'VEG-HAUL-CY-15': await warned(
        pays(ids.veg15, p1Forms.load, [debris(p1Debris.vegetative), within15]),
      ),
    };
    const veg30 = (from: number) =>
      pays(ids.veg30, p1Forms.load, [
        debris(p1Debris.vegetative),
        { criterion: 'MILEAGE', operator: 'BETWEEN', numberFrom: from, numberTo: 30 },
      ]);
    story.check(
      'AC-01-65 Dana types VEG-HAUL-CY-30’s mileage as 15.0 to 30.0: it is saved, with a warning that a load at exactly 15.0 mi meets both rules',
      await warned(veg30(15)),
      [
        '"VEG-HAUL-CY-30 - ROW VEG haul 15.1–30 mi" and "VEG-HAUL-CY-15 - ROW VEG haul 0–15 mi" both add transaction 1, and their Mileage ranges overlap at 15.0. A ticket that meets both is flagged, and neither bills. Saved as it is.',
      ],
    );
    await audited();
    const corrected = await payItems.paysWhen(dana, ids.veg30, [
      {
        formId: p1Forms.load,
        slot: 1,
        criteria: [
          debris(p1Debris.vegetative),
          { criterion: 'MILEAGE', operator: 'BETWEEN', numberFrom: 15.1, numberTo: 30 },
        ],
      },
    ]);
    story.check(
      'she corrects it to 15.1: the rule the pay item keeps is changed, not written again, and the warning is gone',
      corrected.saved
        ? [corrected.record.added.length, corrected.record.changed.length, corrected.warnings]
        : corrected.refusal,
      [0, 1, []],
    );
    story.check(
      'the change archived the lines the rule had and wrote the new ones after them: nothing was edited in place or deleted',
      await audited(),
      {
        'Dana: rule_criterion UPDATE (BACK_OFFICE)': 2,
        'Dana: rule_criterion_pick UPDATE (BACK_OFFICE)': 1,
        'Dana: rule_action UPDATE (BACK_OFFICE)': 1,
        'Dana: rule_criterion INSERT (BACK_OFFICE)': 2,
        'Dana: rule_criterion_pick INSERT (BACK_OFFICE)': 1,
        'Dana: rule_action INSERT (BACK_OFFICE)': 1,
      },
    );
    const again = await saved(veg30(15.1));
    story.check(
      'saving the same "Pays when" again changes nothing and writes nothing',
      [
        again.unchanged.length,
        again.added.length + again.changed.length + again.archived.length,
        await audited(),
      ],
      [1, 0, {}],
    );
    quiet['CD-HAUL-CY-15'] = await warned(
      pays(ids.cd15, p1Forms.load, [debris(p1Debris.cd), within15]),
    );
    quiet['MULCH-HO-CY'] = await warned(
      pays(ids.mulchCy, p1Forms.haulOut, [debris(p1Debris.mulch), at(landfill)]),
    );

    story.at(
      thursday('13:30'),
      'Dana puts MULCH-HO-TN’s "Pays when" on the load form by mistake, sees the warnings, and moves it to the haul-out form',
    );
    story.check(
      'on the load form it is saved, with a warning for each hauling rule a load dumped at Cypress Creek could also meet',
      await warned(pays(ids.mulchTn, p1Forms.load, [at(cypress)])),
      [
        'VEG-HAUL-CY-15 - ROW VEG haul 0–15 mi',
        'VEG-HAUL-CY-30 - ROW VEG haul 15.1–30 mi',
        'CD-HAUL-CY-15 - ROW C&D haul 0–15 mi',
      ].map(
        (other) =>
          `"MULCH-HO-TN - Mulch haul-out to FDS, by weight" and "${other}" both add transaction 1, and a ticket could meet both. A ticket that meets both is flagged, and neither bills. Saved as it is.`,
      ),
    );
    await audited();
    const moved = await payItems.paysWhen(dana, ids.mulchTn, [
      { formId: p1Forms.haulOut, slot: 1, criteria: [debris(p1Debris.mulch), at(cypress)] },
    ]);
    story.check(
      'moved to the haul-out form: the load rule is archived, never deleted, a haul-out rule is written, and nothing warns',
      moved.saved
        ? [moved.record.archived.length, moved.record.added.length, moved.warnings]
        : moved.refusal,
      [1, 1, []],
    );
    story.check(
      'the archive is an update of the rule; the new rule and its lines are inserts',
      await audited(),
      {
        'Dana: rule UPDATE (BACK_OFFICE)': 1,
        'Dana: rule INSERT (BACK_OFFICE)': 1,
        'Dana: rule_criterion INSERT (BACK_OFFICE)': 2,
        'Dana: rule_criterion_pick INSERT (BACK_OFFICE)': 2,
        'Dana: rule_action INSERT (BACK_OFFICE)': 1,
      },
    );

    story.at(
      thursday('13:50'),
      'The tipping fee pays on haul-outs dumped at the Landfill too: its "Pays when" gains the haul-out form',
    );
    const feeOnBoth = await saved(
      payItems.paysWhen(dana, ids.tipFee, [
        feeOnLoads,
        { formId: p1Forms.haulOut, slot: 2, criteria: [at(landfill)] },
      ]),
    );
    story.check(
      'the rule on loads is left alone and one on haul-outs is written: a rule belongs to one form',
      [feeOnBoth.unchanged.length, feeOnBoth.added.length, feeOnBoth.changed.length],
      [1, 1, 0],
    );

    story.at(
      thursday('14:00'),
      'The unit rate pay items: one rule each; white goods and freon count the items the rules say',
    );
    for (const [code, id] of [
      ['HNG-RMV-EA', ids.hangers],
      ['LNR-RMV-EA-24', ids.leaners24],
      ['LNR-RMV-EA-99', ids.leaners99],
      ['STP-RMV-EA-36', ids.stumps36],
      ['STP-RMV-EA-48', ids.stumps48],
      ['CREW-TIME-HR', ids.crewTime],
    ] as const) {
      quiet[code] = await warned(pays(id, p1Forms.unitRate, [payItemIs(id)]));
    }
    const removed = [
      'Washer',
      'Dryer',
      'Fridge, freon recovered',
      'Fridge, no freon',
      'Oven',
      'Microwave',
    ];
    const freonRecovered = await picked.itemName('Fridge, freon recovered');
    quiet['WG-RMV-EA'] = await warned(
      payItems.paysWhen(dana, ids.whiteGoods, [
        {
          formId: p1Forms.unitRate,
          slot: 1,
          criteria: [payItemIs(ids.whiteGoods)],
          quantityFrom: 'CHOSEN_ITEMS',
          itemNameIds: await Promise.all(removed.map((name) => picked.itemName(name))),
        },
      ]),
    );
    quiet['WG-FRN-EA'] = await warned(
      payItems.paysWhen(dana, ids.freon, [
        {
          formId: p1Forms.unitRate,
          slot: 2,
          criteria: [
            payItemIs(ids.whiteGoods),
            { criterion: 'ITEM', operator: 'AT_LEAST', picks: [freonRecovered], numberFrom: 1 },
          ],
          quantityFrom: 'CHOSEN_ITEMS',
          itemNameIds: [freonRecovered],
        },
      ]),
    );
    story.check(
      'none of these eleven "Pays when" warned: no two rules add the same transaction # on a ticket both could meet',
      quiet,
      Object.fromEntries(Object.keys(quiet).map((code) => [code, []])),
    );

    story.at(thursday('14:30'), 'The stump hole fill: Dana writes this one in the rule builder');
    const fill = {
      projectId: p1,
      formId: p1Forms.unitRate,
      name: 'STP-FILL-CY - Stump hole fill',
      contractId: p1Contract,
      active: true,
      criteria: [payItemIs(ids.stumps36, ids.stumps48)],
      actions: [{ kind: 'ADD_TRANSACTION', slot: 2, payItemId: ids.stumpFill }],
    } as const;
    const fillRule = await rules.save(dana, fill);
    story.check(
      'saved, valid, with no warning: the freon rule adds #2 as well, but no ticket carries both a stump pay item and the white goods one',
      fillRule.saved
        ? [fillRule.record.valid, fillRule.record.reasons, fillRule.warnings]
        : fillRule.refusal,
      [true, [], []],
    );
    story.check(
      'AC-01-81 the same rule under another name is refused before it is saved, naming the rule it copies',
      await refusedBySetup('Dana', rules.save(dana, { ...fill, name: 'Fill, stumps over 24 in' })),
      'Not saved: this rule is the same as "STP-FILL-CY - Stump hole fill".',
    );
    const hangerRule = await api.rule.findFirstOrThrow({
      where: { projectId: p1, fromPayItemId: ids.hangers },
    });
    story.check(
      'a rule a pay item wrote is changed only on its pay item: the rule builder refuses',
      await refusedBySetup(
        'Dana',
        rules.save(dana, {
          id: hangerRule.id,
          projectId: p1,
          formId: p1Forms.unitRate,
          name: 'Hangers',
          contractId: p1Contract,
          active: false,
          criteria: [payItemIs(ids.hangers)],
          actions: [{ kind: 'ADD_TRANSACTION', slot: 1, payItemId: ids.hangers }],
        }),
      ),
      'Not saved: this rule is from pay item HNG-RMV-EA. Change it on the pay item.',
    );
    const coastlineRow = 'Coastline, Bayline ROW 2026';
    story.check(
      'P1’s sixteen rules as the mission’s table has them, each naming the Coastline contract once, with no Contractor line; fifteen from their pay items, one from the rule builder',
      await rulesOf(p1),
      [
        [
          'Load',
          'TIP-FEE-CY-BCL - Tipping fee, Bayline County Landfill',
          coastlineRow,
          'Disposal site EQUALS Bayline County Landfill',
          'Add #2 TIP-FEE-CY-BCL',
          'pay item TIP-FEE-CY-BCL',
          'active',
        ],
        [
          'Load',
          'VEG-HAUL-CY-15 - ROW VEG haul 0–15 mi',
          coastlineRow,
          'Debris type EQUALS Vegetative · Mileage AT MOST 15.0',
          'Add #1 VEG-HAUL-CY-15',
          'pay item VEG-HAUL-CY-15',
          'active',
        ],
        [
          'Load',
          'VEG-HAUL-CY-30 - ROW VEG haul 15.1–30 mi',
          coastlineRow,
          'Debris type EQUALS Vegetative · Mileage BETWEEN 15.1 and 30.0',
          'Add #1 VEG-HAUL-CY-30',
          'pay item VEG-HAUL-CY-30',
          'active',
        ],
        [
          'Load',
          'CD-HAUL-CY-15 - ROW C&D haul 0–15 mi',
          coastlineRow,
          'Debris type EQUALS C&D · Mileage AT MOST 15.0',
          'Add #1 CD-HAUL-CY-15',
          'pay item CD-HAUL-CY-15',
          'active',
        ],
        [
          'Haul-out',
          'MULCH-HO-CY - Mulch haul-out to FDS',
          coastlineRow,
          'Debris type EQUALS Mulch · Disposal site EQUALS Bayline County Landfill',
          'Add #1 MULCH-HO-CY',
          'pay item MULCH-HO-CY',
          'active',
        ],
        [
          'Haul-out',
          'MULCH-HO-TN - Mulch haul-out to FDS, by weight',
          coastlineRow,
          'Debris type EQUALS Mulch · Disposal site EQUALS Cypress Creek Landfill',
          'Add #1 MULCH-HO-TN',
          'pay item MULCH-HO-TN',
          'active',
        ],
        [
          'Haul-out',
          'TIP-FEE-CY-BCL - Tipping fee, Bayline County Landfill',
          coastlineRow,
          'Disposal site EQUALS Bayline County Landfill',
          'Add #2 TIP-FEE-CY-BCL',
          'pay item TIP-FEE-CY-BCL',
          'active',
        ],
        [
          'Unit rate',
          'HNG-RMV-EA - Hanger removal',
          coastlineRow,
          'Pay item EQUALS HNG-RMV-EA',
          'Add #1 HNG-RMV-EA',
          'pay item HNG-RMV-EA',
          'active',
        ],
        [
          'Unit rate',
          'LNR-RMV-EA-24 - Leaner removal 6–24 in',
          coastlineRow,
          'Pay item EQUALS LNR-RMV-EA-24',
          'Add #1 LNR-RMV-EA-24',
          'pay item LNR-RMV-EA-24',
          'active',
        ],
        [
          'Unit rate',
          'LNR-RMV-EA-99 - Leaner removal 24.1–99 in',
          coastlineRow,
          'Pay item EQUALS LNR-RMV-EA-99',
          'Add #1 LNR-RMV-EA-99',
          'pay item LNR-RMV-EA-99',
          'active',
        ],
        [
          'Unit rate',
          'STP-RMV-EA-36 - Stump removal 24–36 in',
          coastlineRow,
          'Pay item EQUALS STP-RMV-EA-36',
          'Add #1 STP-RMV-EA-36',
          'pay item STP-RMV-EA-36',
          'active',
        ],
        [
          'Unit rate',
          'STP-RMV-EA-48 - Stump removal 36.1–48 in',
          coastlineRow,
          'Pay item EQUALS STP-RMV-EA-48',
          'Add #1 STP-RMV-EA-48',
          'pay item STP-RMV-EA-48',
          'active',
        ],
        [
          'Unit rate',
          'CREW-TIME-HR - Crew time, skid steer crew',
          coastlineRow,
          'Pay item EQUALS CREW-TIME-HR',
          'Add #1 CREW-TIME-HR',
          'pay item CREW-TIME-HR',
          'active',
        ],
        [
          'Unit rate',
          'WG-RMV-EA - White good removed',
          coastlineRow,
          'Pay item EQUALS WG-RMV-EA',
          'Add #1 WG-RMV-EA from Washer, Dryer, Fridge, freon recovered, Fridge, no freon, Oven, Microwave',
          'pay item WG-RMV-EA',
          'active',
        ],
        [
          'Unit rate',
          'WG-FRN-EA - Freon recovered',
          coastlineRow,
          'Pay item EQUALS WG-RMV-EA · Item "Fridge, freon recovered" AT LEAST 1',
          'Add #2 WG-FRN-EA from Fridge, freon recovered',
          'pay item WG-FRN-EA',
          'active',
        ],
        [
          'Unit rate',
          'STP-FILL-CY - Stump hole fill',
          coastlineRow,
          'Pay item IS ONE OF STP-RMV-EA-36, STP-RMV-EA-48',
          'Add #2 STP-FILL-CY',
          'the rule builder',
          'active',
        ],
      ],
    );
    const archivedRules = await api.rule.findMany({
      where: { projectId: p1, archivedAt: { not: null } },
      include: { form: true },
    });
    story.check(
      'the one rule taken off, MULCH-HO-TN’s on the load form, is still there, archived at the time Dana moved it',
      archivedRules.map((rule) => [rule.form.name, rule.name, rule.archivedAt?.toISOString()]),
      [
        [
          'Load',
          'MULCH-HO-TN - Mulch haul-out to FDS, by weight',
          new Date(thursday('13:30')).toISOString(),
        ],
      ],
    );
    await audited();

    // ------------------------------------------------------------------------------------------
    story.at(
      friday('09:00'),
      'Luis Ortega sets up P2: he searches for the client and the declaration event, finds each, and picks it',
    );
    const [found, ...otherClients] = (await projects.findClients(searchFor('bayline'))).records;
    const [declared, ...otherEvents] = (await projects.findDeclarationEvents(searchFor('delphine')))
      .records;
    if (found === undefined || declared === undefined)
      throw new Error('Luis found nothing to pick.');
    const ppdr = await picked.programType('PPDR');
    const p2 = (
      await saved(
        projects.project(luis, {
          name: 'Bayline County PPDR, Hurricane Delphine',
          clientId: found.id,
          declarationEventId: declared.id,
          programTypeId: ppdr,
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
    const both = await api.project.findMany({
      orderBy: { id: 'asc' },
      include: { programType: true },
    });
    story.check(
      'AC-01-01 both projects point at the one Bayline County record and the one Hurricane Delphine: none was created',
      [
        otherClients.length,
        otherEvents.length,
        await api.client.count(),
        await api.declarationEvent.count(),
        both.map((project) => [
          project.name,
          project.clientId === client.id,
          project.declarationEventId === delphine.id,
        ]),
      ],
      [
        0,
        0,
        1,
        1,
        [
          ['Bayline County ROW, Hurricane Delphine', true, true],
          ['Bayline County PPDR, Hurricane Delphine', true, true],
        ],
      ],
    );
    const p2Read = both[1];
    story.check(
      'AC-01-06 P2 is a PPDR project, which requires ROEs, so it starts with Allow split loads ticked; the same time zone and window; its numbers generated; loads only',
      p2Read === undefined
        ? null
        : [
            p2Read.programType.name,
            p2Read.programType.requiresRoe,
            p2Read.allowSplitLoads,
            p2Read.timeZone,
            date(p2Read.activeFrom),
            date(p2Read.activeTo),
            p2Read.ticketNumberSource,
            p2Read.workflows,
          ],
      ['PPDR', true, true, 'America/New_York', '2026-10-12', '2027-01-31', 'GENERATED', ['LOAD']],
    );

    story.at(friday('09:20'), 'P2’s contract, forms, pay item, site and rule');
    const p2ContractInput = {
      projectId: p2,
      name: 'Coastline, Bayline PPDR 2026',
      primeId: coastline,
    };
    story.check(
      'AC-01-80 Luis writes the contract before Coastline is on P2: a contract whose prime isn’t one of the project’s primes is refused by the database',
      await refusedByTheDatabase(
        'Luis',
        'a contract whose prime isn’t one of the project’s primes',
        contractors.contract(luis, p2ContractInput),
      ),
      'contract_project_id_prime_id_fkey',
    );
    const [known] = (await contractors.findContractors(searchFor('coastline'))).records;
    if (known === undefined) throw new Error('Luis found no Coastline to pick.');
    await saved(contractors.addPrime(luis, p2, known.id));
    await saved(contractors.contract(luis, p2ContractInput));
    const p2Load = (
      await saved(forms.form(luis, { projectId: p2, documentType: 'LOAD', name: 'Load' }))
    ).id;
    await saved(
      forms.form(luis, {
        projectId: p2,
        documentType: 'ROE',
        name: 'ROE',
        gpsRequired: true,
      }),
    );
    await saved(forms.form(luis, { projectId: p2, documentType: 'SURVEY', name: 'Survey' }));
    const p2Vegetative = (
      await saved(
        forms.debrisType(luis, {
          formId: p2Load,
          debrisTypeId: vegetativeType,
          reduced: false,
          hiddenOnPhones: false,
        }),
      )
    ).id;
    const p2Haul = (
      await saved(
        payItems.payItem(luis, {
          ...unticked,
          projectId: p2,
          code: 'VEG-HAUL-CY',
          description: 'PPDR VEG haul',
          payableTypeId: await picked.payableType('Vegetative'),
          unit: 'CY',
          rates: [{ primeId: known.id, rate: '9.00' }],
        }),
      )
    ).id;
    await saved(
      sites.site(luis, {
        projectId: p2,
        activationDate: '2026-10-12',
        ...facts,
        name: 'Marsh Road TDSR',
        siteTypeId: await picked.siteType('TDSR/DMS'),
        haulOutsLeaveHere: true,
        permitNumber: 'FDEP-DMS-2026-0117',
        latitude: '39.09000000',
        longitude: '-75.62000000',
      }),
    );
    await saved(
      payItems.paysWhen(luis, p2Haul, [
        { formId: p2Load, slot: 1, criteria: [debris(p2Vegetative)] },
      ]),
    );
    const p2Setup = await api.project.findUniqueOrThrow({
      where: { id: p2 },
      include: {
        contractors: { include: { contractor: true } },
        contracts: { include: { prime: true } },
        forms: {
          orderBy: { id: 'asc' },
          include: { debrisTypes: { include: { debrisType: true } } },
        },
        payItems: { include: { payableType: true, rates: { include: { prime: true } } } },
        disposalSites: true,
      },
    });
    story.check(
      'P2 as the mission states it: Coastline its prime, holding "Coastline, Bayline PPDR 2026"; a load form with Vegetative, an ROE form and a survey form; its own pay item VEG-HAUL-CY, "PPDR VEG haul", $9.00 for Coastline; one rule',
      [
        p2Setup.contractors.map((place) => [
          place.contractor.name,
          place.position,
          place.asPrimeId === coastline,
        ]),
        p2Setup.contracts.map((contract) => [contract.name, contract.prime.name]),
        p2Setup.forms.map((form) => [
          form.documentType,
          form.gpsRequired,
          form.debrisTypes.map((each) => each.debrisType.name),
        ]),
        p2Setup.payItems.map((payItem) => [
          payItem.code,
          payItem.description,
          payItem.payableType.name,
          payItem.unit,
          payItem.rates.map((rate) => `${rate.prime.name} $${rate.rate.toFixed(2)}`),
        ]),
        await rulesOf(p2),
      ],
      [
        [['Coastline Haulers LLC', 'PRIME', true]],
        [['Coastline, Bayline PPDR 2026', 'Coastline Haulers LLC']],
        [
          ['LOAD', null, ['Vegetative']],
          ['ROE', true, []],
          ['SURVEY', null, []],
        ],
        [['VEG-HAUL-CY', 'PPDR VEG haul', 'Vegetative', 'CY', ['Coastline Haulers LLC $9.00']]],
        [
          [
            'Load',
            'VEG-HAUL-CY - PPDR VEG haul',
            'Coastline, Bayline PPDR 2026',
            'Debris type EQUALS Vegetative',
            'Add #1 VEG-HAUL-CY',
            'pay item VEG-HAUL-CY',
            'active',
          ],
        ],
      ],
    );
    const marshRoads = await api.disposalSite.findMany({
      where: { name: 'Marsh Road TDSR' },
      orderBy: { id: 'asc' },
    });
    story.check(
      'AC-01-52 Marsh Road TDSR is entered again on P2: two records, one on each project, never shared',
      marshRoads.map((site) => [site.id === tdsr, site.projectId === p1, site.projectId === p2]),
      [
        [true, true, false],
        [false, false, true],
      ],
    );
    story.check(
      'AC-01-79 P2: one audit record for each row Luis wrote, each his, the job his site queued among them; the refused contract left none',
      await audited(),
      {
        'Luis: project INSERT (BACK_OFFICE)': 1,
        'Luis: project_number_series INSERT (BACK_OFFICE)': 5,
        'Luis: project_contractor INSERT (BACK_OFFICE)': 1,
        'Luis: contract INSERT (BACK_OFFICE)': 1,
        'Luis: form INSERT (BACK_OFFICE)': 3,
        'Luis: form_debris_type INSERT (BACK_OFFICE)': 1,
        'Luis: pay_item INSERT (BACK_OFFICE)': 1,
        'Luis: pay_item_rate INSERT (BACK_OFFICE)': 1,
        'Luis: disposal_site INSERT (BACK_OFFICE)': 1,
        'Luis: reconciliation_job INSERT (BACK_OFFICE)': 1,
        'Luis: rule INSERT (BACK_OFFICE)': 1,
        'Luis: rule_criterion INSERT (BACK_OFFICE)': 1,
        'Luis: rule_criterion_pick INSERT (BACK_OFFICE)': 1,
        'Luis: rule_action INSERT (BACK_OFFICE)': 1,
      },
    );

    // ------------------------------------------------------------------------------------------
    story.at(friday('10:00'), 'The setup is done');
    story.check(
      'AC-01-80 everything refused along the way, in order: by setup, only a bad setting; by the database, only what its own constraints hold',
      refusals,
      [
        ['Dana', 'the database', 'a time zone that isn’t an IANA name'],
        ['Dana', 'setup', 'MAP_NOT_READ'],
        ['Dana', 'the database', 'a second place for one contractor on a project'],
        ['Dana', 'the database', 'a second form of one document type'],
        ['Dana', 'the database', 'a debris type on a form that isn’t a load or haul-out form'],
        ['Dana', 'the database', 'the firm’s own fields on a load form'],
        ['Dana', 'setup', 'SIZE_BAND_OVERLAP'],
        ['Dana', 'the database', 'a second rate for one prime'],
        ['Dana', 'the database', 'a pay item code the project already has'],
        ['Dana', 'setup', 'HAUL_OUTS_ONLY_FROM_TDSR'],
        ['Dana', 'setup', 'RULE_DUPLICATE'],
        ['Dana', 'setup', 'RULE_FROM_PAY_ITEM'],
        ['Luis', 'the database', 'a contract whose prime isn’t one of the project’s primes'],
      ],
    );
    const rows = {
      client: await api.client.count(),
      declaration_event: await api.declarationEvent.count(),
      project: await api.project.count(),
      project_kind_of_work: await api.projectKindOfWork.count(),
      map_version: await api.mapVersion.count(),
      zone: await api.zone.count(),
      contractor: await api.contractor.count(),
      project_contractor: await api.projectContractor.count(),
      contract: await api.contract.count(),
      form: await api.form.count(),
      form_debris_type: await api.formDebrisType.count(),
      form_definition: await api.formDefinition.count(),
      field_tag: await api.fieldTag.count(),
      pay_item: await api.payItem.count(),
      pay_item_rate: await api.payItemRate.count(),
      disposal_site: await api.disposalSite.count(),
      disposal_site_tipping_fee: await api.disposalSiteTippingFee.count(),
      rule: await api.rule.count(),
      rule_criterion: await api.ruleCriterion.count(),
      rule_criterion_pick: await api.ruleCriterionPick.count(),
      rule_action: await api.ruleAction.count(),
      rule_action_item: await api.ruleActionItem.count(),
    };
    const inserted = (table: string): number =>
      Object.entries(all)
        .filter(([key]) => key.includes(`: ${table} INSERT `))
        .reduce((sum, [, count]) => sum + count, 0);
    story.check(
      'AC-01-79 every setup record of both projects has exactly one audit record of its writing, by Dana or by Luis: the audit log’s inserts, table by table, are the rows there are',
      Object.fromEntries(Object.keys(rows).map((table) => [table, inserted(table)])),
      rows,
    );
    story.check(
      'and nobody else wrote anything: every audit record of the two days names Dana or Luis, from the back office',
      Object.keys(all).filter(
        (key) => !/^(Dana|Luis): \w+ (INSERT|UPDATE) \(BACK_OFFICE\)$/.test(key),
      ),
      [],
    );
  },
};

// The database's constraint that refused a write, by its name, read off the driver's error.
function constraintOf(error: unknown): string {
  const text = `${JSON.stringify(error)} ${error instanceof Error ? error.message : String(error)}`;
  return /constraint \\*"(\w+)\\*"/.exec(text)?.[1] ?? text.slice(0, 600);
}
