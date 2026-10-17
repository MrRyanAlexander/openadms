// Setup's endpoints, steps 1 to 4 and the firm's lists, against the database (spec/parts/01-setup.md;
// ARCHITECTURE §6; acceptance file 01, AC-01-80; file 10, AC-10-27, 33, 38; T-14, T-26; BACKLOG
// 2.4.2, C60, C86, C92; ADR-316, 364, 424). OWASP ASVS 5.0 V2, V8, V16; API Security Top 10, API1,
// API5. The real process, in this test's own memory, on the installation's database as
// `adms_api`: it needs `pnpm local:up` after `pnpm installer`, and fails saying so. Each test's
// work is undone (support/database.ts). A refusal by the database ends the test's one piece of
// work, so each such test makes its refused request last.
import { randomUUID } from 'node:crypto';

import {
  changePhoneKeyHoursEndpoint,
  firmSettingsEndpoint,
  addDebrisTypeEndpoint,
  addFieldTagEndpoint,
  addFormDebrisTypeEndpoint,
  addFormDefinitionEndpoint,
  addListValueEndpoint,
  addPayableTypeEndpoint,
  addPrimeEndpoint,
  addSiteShapeEndpoint,
  addSiteShapeFileEndpoint,
  addSiteShapeFromEsriEndpoint,
  archiveControlRangeEndpoint,
  archiveListValueEndpoint,
  backOfficeRoles,
  changeClientEndpoint,
  changeContractEndpoint,
  changeContractorEndpoint,
  changeDeclarationEventEndpoint,
  changeFormDebrisTypeEndpoint,
  changeFormEndpoint,
  changePayItemEndpoint,
  listPayItemRatesEndpoint,
  previewNewRuleEndpoint,
  previewPayItemChangeEndpoint,
  previewPayItemRateEndpoint,
  previewPaysWhenEndpoint,
  previewRuleChangeEndpoint,
  changeProjectSettingsEndpoint,
  changeProjectWindowEndpoint,
  changeRuleEndpoint,
  changeSiteEndpoint,
  closeProjectEndpoint,
  createClientEndpoint,
  createContractEndpoint,
  createContractorEndpoint,
  createDeclarationEventEndpoint,
  createFormEndpoint,
  createPayItemEndpoint,
  createProjectEndpoint,
  createRuleEndpoint,
  createSiteEndpoint,
  endpoints,
  enterControlRangeEndpoint,
  errorAnswerSchema,
  findClientsEndpoint,
  findContractorsEndpoint,
  findDeclarationEventsEndpoint,
  giveSiteLabelEndpoint,
  linkTippingFeeEndpoint,
  loadEsriMapEndpoint,
  loadMapEndpoint,
  loadMapFileEndpoint,
  refreshEsriMapEndpoint,
  removeSiteLabelEndpoint,
  removeTippingFeeEndpoint,
  renameListValueEndpoint,
  savePaysWhenEndpoint,
  sendMapFileEndpoint,
  setCrewDayStepsEndpoint,
  setPayItemRateEndpoint,
  startNumberSeriesEndpoint,
  unarchiveListValueEndpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ContractorSetup } from '../src/setup/contractor-setup.ts';
import { ListSetup } from '../src/setup/list-setup.ts';
import { ProjectSetup } from '../src/setup/project-setup.ts';
import { installationSettings, openInstallation } from './support/database.ts';
import { shippedPolicy } from './support/process.ts';
import { danasEmail, long, longer, luissEmail, worldOn } from './support/served.ts';
import {
  ask,
  p1,
  p1Through,
  picked,
  plainly,
  saved,
  told,
  viewerSignsIn,
} from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

// Every setup endpoint, in the order the contracts list them (tasks 2.4.2, 2.6.4, 2.8.5).
const setupEndpoints = [
  findClientsEndpoint,
  createClientEndpoint,
  changeClientEndpoint,
  findDeclarationEventsEndpoint,
  createDeclarationEventEndpoint,
  changeDeclarationEventEndpoint,
  createProjectEndpoint,
  changeProjectSettingsEndpoint,
  changeProjectWindowEndpoint,
  startNumberSeriesEndpoint,
  enterControlRangeEndpoint,
  archiveControlRangeEndpoint,
  addFieldTagEndpoint,
  findContractorsEndpoint,
  createContractorEndpoint,
  changeContractorEndpoint,
  addPrimeEndpoint,
  createContractEndpoint,
  changeContractEndpoint,
  addDebrisTypeEndpoint,
  addPayableTypeEndpoint,
  addListValueEndpoint,
  renameListValueEndpoint,
  archiveListValueEndpoint,
  unarchiveListValueEndpoint,
  createFormEndpoint,
  changeFormEndpoint,
  addFormDebrisTypeEndpoint,
  changeFormDebrisTypeEndpoint,
  addFormDefinitionEndpoint,
  createPayItemEndpoint,
  // A project's rates are read only by whoever may set one (ADR-535 (2)).
  listPayItemRatesEndpoint,
  changePayItemEndpoint,
  // What each save would change, before it is saved (ADR-229, 535 (3)).
  previewPayItemChangeEndpoint,
  setPayItemRateEndpoint,
  previewPayItemRateEndpoint,
  setCrewDayStepsEndpoint,
  savePaysWhenEndpoint,
  previewPaysWhenEndpoint,
  createRuleEndpoint,
  previewNewRuleEndpoint,
  changeRuleEndpoint,
  previewRuleChangeEndpoint,
  createSiteEndpoint,
  changeSiteEndpoint,
  giveSiteLabelEndpoint,
  removeSiteLabelEndpoint,
  addSiteShapeEndpoint,
  linkTippingFeeEndpoint,
  removeTippingFeeEndpoint,
  loadMapEndpoint,
  sendMapFileEndpoint,
  loadMapFileEndpoint,
  addSiteShapeFileEndpoint,
  loadEsriMapEndpoint,
  refreshEsriMapEndpoint,
  addSiteShapeFromEsriEndpoint,
  // The firm's own settings: read, and the hours a lost phone keeps its key (task 2.8.6).
  firmSettingsEndpoint,
  changePhoneKeyHoursEndpoint,
] as const;

describe('who may change the setup', () => {
  it('AC-10-27 every setup endpoint is open to the back office’s roles and takes the permission Setup; no other endpoint takes it', () => {
    const taking = endpoints.filter(({ permission }) => permission === 'SETUP');
    expect(taking.map(({ name }) => name)).toEqual(setupEndpoints.map(({ name }) => name));
    for (const { name, access, roles, permission } of taking) {
      expect([name, access, roles, permission]).toEqual([
        name,
        'SIGNED_IN',
        backOfficeRoles,
        'SETUP',
      ]);
    }
    expect(setupEndpoints.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /clients',
      'POST /clients',
      'PATCH /clients/:clientId',
      'GET /declaration-events',
      'POST /declaration-events',
      'PATCH /declaration-events/:declarationEventId',
      'POST /projects',
      'PATCH /projects/:projectId/settings',
      'PATCH /projects/:projectId/active-window',
      'POST /projects/:projectId/number-series',
      'POST /projects/:projectId/control-ranges',
      'POST /control-ranges/:controlRangeId/archivings',
      'POST /projects/:projectId/field-tags',
      'GET /contractors',
      'POST /contractors',
      'PATCH /contractors/:contractorId',
      'POST /projects/:projectId/primes',
      'POST /projects/:projectId/contracts',
      'PATCH /contracts/:contractId',
      'POST /debris-types',
      'POST /payable-types',
      'POST /lists/:list/values',
      'PATCH /lists/:list/values/:valueId',
      'POST /lists/:list/values/:valueId/archivings',
      'POST /lists/:list/values/:valueId/unarchivings',
      'POST /projects/:projectId/forms',
      'PATCH /forms/:formId',
      'POST /forms/:formId/debris-types',
      'PATCH /form-debris-types/:formDebrisTypeId',
      'POST /forms/:formId/definitions',
      'POST /projects/:projectId/pay-items',
      'GET /projects/:projectId/pay-item-rates',
      'PATCH /pay-items/:payItemId',
      'POST /pay-items/:payItemId/previews',
      'PUT /pay-items/:payItemId/rates/:primeId',
      'POST /pay-items/:payItemId/rates/:primeId/previews',
      'PUT /pay-items/:payItemId/crew-day-steps',
      'PUT /pay-items/:payItemId/pays-when',
      'POST /pay-items/:payItemId/pays-when/previews',
      'POST /projects/:projectId/rules',
      'POST /projects/:projectId/rules/previews',
      'PUT /rules/:ruleId',
      'POST /rules/:ruleId/previews',
      'POST /projects/:projectId/sites',
      'PATCH /sites/:siteId',
      'PUT /sites/:siteId/labels/:siteLabelId',
      'POST /sites/:siteId/labels/:siteLabelId/removals',
      'POST /sites/:siteId/shapes',
      'POST /sites/:siteId/tipping-fees',
      'POST /sites/:siteId/tipping-fees/:payItemId/removals',
      'POST /projects/:projectId/map-versions',
      'POST /projects/:projectId/map-files',
      'POST /projects/:projectId/map-files/:mapFileId/map-versions',
      'POST /sites/:siteId/map-files/:mapFileId/shapes',
      'POST /projects/:projectId/esri-map-versions',
      'POST /map-versions/:mapVersionId/esri-refreshes',
      'POST /sites/:siteId/esri-shapes',
      'GET /firm-settings',
      'PATCH /firm-settings/phone-key',
    ]);
  });

  it('AC-10-27 each is refused to nobody, to a manager/analyst without Setup and to a read-only viewer, before anything sent is read; nothing is written', async () => {
    await world(async (api, tx, who, within) => {
      const luis = await api.signedIn(luissEmail, longer);
      const viewer = await viewerSignsIn(api, tx, who.viewer, within);
      const counted = async () => [
        await tx.client.count(),
        await tx.declarationEvent.count(),
        await tx.project.count(),
        await tx.contractor.count(),
        await tx.debrisType.count(),
        await tx.payableType.count(),
        await tx.form.count(),
        await tx.payItem.count(),
        await tx.payItemRate.count(),
        await tx.rule.count(),
        await tx.disposalSite.count(),
        await tx.siteAreaVersion.count(),
        await tx.disposalSiteTippingFee.count(),
        await tx.mapVersion.count(),
      ];
      const before = await counted();
      for (const served of setupEndpoints) {
        // A body no schema takes: who may call is asked first.
        const more = served.method === 'GET' ? {} : { payload: { nobody: 'named this field' } };
        expect(told(await ask(api, undefined, served, more)), served.name).toEqual([
          401,
          'NOT_SIGNED_IN',
        ]);
        for (const signed of [luis, viewer]) {
          expect(told(await ask(api, signed, served, more)), served.name).toEqual([
            403,
            'NOT_ALLOWED',
          ]);
        }
      }
      expect(await counted()).toEqual(before);
    });
  });

  it('AC-02-12 a manager/analyst granted Setup changes the setup, audited as himself; the grant taken away, his very next change is refused with the session he had', async () => {
    await world(async (api, tx, who) => {
      const luis = await api.signedIn(luissEmail, longer);
      const grant = await tx.userPermission.create({
        data: { userId: who.luis, permission: 'SETUP' },
      });
      const answer = await ask(api, luis, createClientEndpoint, {
        payload: { name: 'Town of Egret Point' },
      });
      const { record } = saved(createClientEndpoint, answer);
      expect(
        await tx.auditRecord.findMany({
          where: { requestId: answer.requestId },
          select: { tableName: true, operation: true, actorId: true, recordId: true },
        }),
      ).toEqual([
        { tableName: 'client', operation: 'INSERT', actorId: who.luis, recordId: record.id },
      ]);
      expect(saved(findClientsEndpoint, await ask(api, luis, findClientsEndpoint)).records).toEqual(
        [record],
      );
      await tx.userPermission.update({
        where: { id: grant.id },
        data: { archivedAt: new Date() },
      });
      expect(
        told(await ask(api, luis, createClientEndpoint, { payload: { name: 'Bayline County' } })),
      ).toEqual([403, 'NOT_ALLOWED']);
      expect(told(await ask(api, luis, findClientsEndpoint))).toEqual([403, 'NOT_ALLOWED']);
      expect(await tx.client.count({ where: { name: 'Bayline County' } })).toBe(0);
    });
  });

  it('a setup service asks again inside its own piece of work (ADR-364): called as a manager/analyst without Setup, a read-only viewer, a monitor, an archived admin or nobody on record, it changes nothing; with Setup it saves', async () => {
    await world(async (_api, tx, who, within) => {
      const clock = { now: () => new Date('2026-10-12T14:00:00Z') };
      const projects = new ProjectSetup(within, clock, shippedPolicy);
      const contractors = new ContractorSetup(within, clock, shippedPolicy);
      const lists = new ListSetup(within, clock, shippedPolicy);
      const gone = await tx.user.create({ data: { name: 'Morgan Ellis', role: 'ADMIN' } });
      await tx.user.update({ where: { id: gone.id }, data: { archivedAt: new Date() } });
      // A grant written beside somebody who is no manager/analyst grants nothing.
      await tx.userPermission.create({ data: { userId: who.viewer, permission: 'SETUP' } });
      const refusedAs = async (caller: string) =>
        [
          await projects.client(caller, { name: 'Bayline County' }),
          await projects.fieldTag(caller, randomUUID(), 'Mixed'),
          await projects.close(caller, randomUUID()),
          await contractors.contractor(caller, { name: 'Coastline Haulers LLC', kind: 'HAULER' }),
          await lists.debrisType(caller, 'Mulch'),
        ].map((outcome) => (outcome.saved ? 'saved' : outcome.refusal.code));
      for (const caller of [who.luis, who.viewer, who.kim, gone.id, randomUUID()]) {
        expect(await refusedAs(caller), caller).toEqual(Array(5).fill('NOT_ALLOWED'));
      }
      const luis = await projects.client(who.luis, { name: 'Bayline County' });
      expect(luis.saved ? '' : luis.refusal.message).toBe(
        'Luis Ortega may not change the setup: it takes an admin, or a manager/analyst granted "setup" and "view setup". Nothing was changed.',
      );
      expect([await tx.client.count(), await tx.contractor.count()]).toEqual([0, 0]);
      await tx.userPermission.create({ data: { userId: who.luis, permission: 'SETUP' } });
      expect((await projects.client(who.luis, { name: 'Bayline County' })).saved).toBe(true);
      expect((await projects.client(who.dana, { name: 'Town of Egret Point' })).saved).toBe(true);
    });
  });
});

describe('Dana sets P1 up through the endpoints', () => {
  it('AC-01-01, 03 steps 1 and 2: she searches first; Bayline County and Hurricane Delphine, DR-9001-FL, are created once, each audited with her as the actor, and found again by any part of the name or the reference', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const none = await ask(api, dana, findClientsEndpoint, { query: '?search=bayline' });
      expect(saved(findClientsEndpoint, none).records).toEqual([]);
      const created = await ask(api, dana, createClientEndpoint, {
        payload: {
          name: '  Bayline County ',
          contactName: 'Pat Moreno',
          contactEmail: 'debris@baylinecounty.example',
          contactPhone: '555-0142',
        },
      });
      const client = saved(createClientEndpoint, created);
      expect(client).toEqual({
        record: {
          id: client.record.id,
          name: 'Bayline County',
          contactName: 'Pat Moreno',
          contactEmail: 'debris@baylinecounty.example',
          contactPhone: '555-0142',
          notes: null,
          archived: false,
        },
        warnings: [],
      });
      const audited = await tx.auditRecord.findMany({
        where: { requestId: created.requestId },
        select: { tableName: true, operation: true, actorId: true, source: true },
      });
      expect(audited).toEqual([
        { tableName: 'client', operation: 'INSERT', actorId: who.dana, source: 'BACK_OFFICE' },
      ]);
      for (const query of ['?search=bayline', '?search=COUNTY', '']) {
        const found = await ask(api, dana, findClientsEndpoint, { query });
        expect(saved(findClientsEndpoint, found).records, query).toEqual([client.record]);
      }
      const lists = await picked(tx);
      const event = saved(
        createDeclarationEventEndpoint,
        await ask(api, dana, createDeclarationEventEndpoint, {
          payload: {
            name: 'Hurricane Delphine',
            reference: 'DR-9001-FL',
            referenceTypeId: lists.fema,
          },
        }),
      ).record;
      expect(event).toMatchObject({ reference: 'DR-9001-FL', referenceTypeId: lists.fema });
      for (const query of ['?search=delphine', '?search=9001']) {
        const found = await ask(api, dana, findDeclarationEventsEndpoint, { query });
        expect(saved(findDeclarationEventsEndpoint, found).records, query).toEqual([event]);
      }
      expect(
        saved(
          findDeclarationEventsEndpoint,
          await ask(api, dana, findDeclarationEventsEndpoint, { query: '?search=idalia' }),
        ).records,
      ).toEqual([]);
    });
  });

  it('AC-01-07, 08, 09, 11, 13 step 3: P1 is created with its time zone, window, generated numbers and kinds of unit rate work; its settings start from the policy values, its three ticket series start at 100,001 and its ROE numbers at 1', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const { client, declarationEvent, lists, answer, project } = await p1(api, dana, tx);
      expect(project).toEqual({
        id: project.id,
        name: 'Bayline County ROW, Hurricane Delphine',
        clientId: client.id,
        declarationEventId: declarationEvent.id,
        programTypeId: lists.row,
        timeZone: 'America/New_York',
        activeFrom: '2026-10-12',
        activeTo: '2027-01-31',
        ticketNumberSource: 'GENERATED',
        workflows: ['LOAD', 'HAUL_OUT', 'UNIT_RATE'],
        // ROW doesn't require ROEs: split loads start unticked (AC-01-06).
        allowSplitLoads: false,
        loadCallLowLimit: shippedPolicy.loadCallLowLimit,
        loadCallHighLimit: shippedPolicy.loadCallHighLimit,
        stumpFillDepthInches: shippedPolicy.stumpFillDepthInches,
        stumpCheckRootBallWider: true,
        stumpCheckFillNeedsExposure: true,
        siteCircleMeters: shippedPolicy.siteCircleMeters,
        timeClockEnabled: false,
        closedAt: null,
      });
      expect([
        project.loadCallLowLimit,
        project.loadCallHighLimit,
        project.siteCircleMeters,
      ]).toEqual([5, 95, 200]);
      const series = await tx.projectNumberSeries.findMany({
        where: { projectId: project.id },
        orderBy: { series: 'asc' },
        select: { series: true, firstNumber: true, nextNumber: true },
      });
      expect(series).toEqual([
        ...['LOAD', 'HAUL_OUT', 'UNIT_RATE'].map((name) => ({
          series: name,
          firstNumber: 100001,
          nextNumber: 100001,
        })),
        // No cert-number series until the firm seeds one (Q-96).
        { series: 'ROE', firstNumber: 1, nextNumber: 1 },
      ]);
      expect(await tx.projectKindOfWork.count({ where: { projectId: project.id } })).toBe(
        lists.kindOfWorkIds.length,
      );
      // One request, one piece of work: every row it wrote carries its id and Dana.
      const audited = await tx.auditRecord.findMany({
        where: { requestId: answer.requestId },
        select: { tableName: true, actorId: true },
      });
      expect(new Set(audited.map((record) => record.actorId))).toEqual(new Set([who.dana]));
      expect(
        audited
          .map((record) => record.tableName)
          .filter((table, index, all) => all.indexOf(table) === index)
          .sort(),
      ).toEqual(['project', 'project_kind_of_work', 'project_number_series']);
    });
  });

  it('AC-01-08, 10, 12, 14 afterwards: the load-call limits go to 10 and 90 and then off; the window’s end is emptied; the cert numbers start at 730415; a field tag is added; the project is closed and nothing under it goes', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project } = await p1(api, dana, tx);
      const ids = { projectId: project.id };
      const limits = saved(
        changeProjectSettingsEndpoint,
        await ask(api, dana, changeProjectSettingsEndpoint, {
          ids,
          payload: { loadCallLowLimit: 10, loadCallHighLimit: 90, allowSplitLoads: true },
        }),
      );
      expect(limits.record).toEqual({
        ...project,
        loadCallLowLimit: 10,
        loadCallHighLimit: 90,
        allowSplitLoads: true,
      });
      // The project has no ticket yet: the change queued none, and passed no locked one by.
      expect([limits.queued?.tickets ?? 0, limits.queued?.lockedAsInvoiced ?? 0]).toEqual([0, 0]);
      const off = saved(
        changeProjectSettingsEndpoint,
        await ask(api, dana, changeProjectSettingsEndpoint, {
          ids,
          payload: { loadCallLowLimit: null, loadCallHighLimit: null },
        }),
      ).record;
      expect([off.loadCallLowLimit, off.loadCallHighLimit, off.siteCircleMeters]).toEqual([
        null,
        null,
        200,
      ]);
      const window = saved(
        changeProjectWindowEndpoint,
        await ask(api, dana, changeProjectWindowEndpoint, { ids, payload: { activeTo: null } }),
      ).record;
      expect([window.activeFrom, window.activeTo]).toEqual(['2026-10-12', null]);
      // A change that states nothing is refused by the schema, and so is a day that isn't one.
      for (const [served, payload] of [
        [changeProjectSettingsEndpoint, {}],
        [changeProjectWindowEndpoint, {}],
        [changeProjectWindowEndpoint, { activeFrom: '12 October 2026' }],
        [changeProjectSettingsEndpoint, { loadCallLowLimit: 5.5 }],
        [changeProjectSettingsEndpoint, { rate: '7.50' }],
        // AC-10-63: past what the column holds, refused here, never a failure at the database.
        [changeProjectSettingsEndpoint, { siteCircleMeters: 2 ** 31 }],
        [changeProjectSettingsEndpoint, { stumpFillDepthInches: 1e30 }],
        [changeProjectSettingsEndpoint, { loadCallHighLimit: -(2 ** 31) - 1 }],
      ] as const) {
        expect(told(await ask(api, dana, served, { ids, payload }))).toEqual([400, 'BAD_REQUEST']);
      }
      const certs = saved(
        startNumberSeriesEndpoint,
        await ask(api, dana, startNumberSeriesEndpoint, {
          ids,
          payload: { series: 'CERTIFICATION', firstNumber: 730415 },
        }),
      ).record;
      expect(certs).toMatchObject({
        series: 'CERTIFICATION',
        firstNumber: 730415,
        nextNumber: 730415,
      });
      const tag = saved(
        addFieldTagEndpoint,
        await ask(api, dana, addFieldTagEndpoint, { ids, payload: { name: 'Mixed' } }),
      ).record;
      expect(tag).toMatchObject({ projectId: project.id, name: 'Mixed', position: 1 });
      api.clock.later(1);
      const closed = saved(
        closeProjectEndpoint,
        await ask(api, dana, closeProjectEndpoint, { ids }),
      ).record;
      expect(closed.closedAt).toBe(api.clock.now().toISOString());
      expect(await tx.fieldTag.count({ where: { projectId: project.id } })).toBe(1);
      expect(await tx.projectNumberSeries.count({ where: { projectId: project.id } })).toBe(5);
    });
  });

  it('AC-01-09, AC-01-80 a setting the domain’s rules refuse is answered in the rule’s own words, with its code, and saves nothing: a control range on P1, which generates its numbers; on a control-ticket project a range is entered, one sharing a number with it is refused, and a range entered by mistake is archived', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project, payload } = await p1(api, dana, tx);
      const range = { series: 'LOAD', firstNumber: 5001, lastNumber: 5500 };
      const onGenerated = await ask(api, dana, enterControlRangeEndpoint, {
        ids: { projectId: project.id },
        payload: range,
      });
      expect(told(onGenerated)).toEqual([422, 'NOT_SAVED']);
      const refusal = errorAnswerSchema.parse(onGenerated.body);
      expect(refusal.reason).toBe('CONTROL_RANGE_GENERATED_PROJECT');
      expect(refusal.message).toMatch(/\S+ \S+/);
      expect(await tx.controlRange.count()).toBe(0);
      expect(api.lines.join('\n')).toContain('"why":"CONTROL_RANGE_GENERATED_PROJECT"');

      const p2 = saved(
        createProjectEndpoint,
        await ask(api, dana, createProjectEndpoint, {
          payload: {
            ...payload,
            name: 'Bayline County PPDR, Hurricane Delphine',
            ticketNumberSource: 'CONTROL',
          },
        }),
      ).record;
      const ids = { projectId: p2.id };
      const entered = saved(
        enterControlRangeEndpoint,
        await ask(api, dana, enterControlRangeEndpoint, { ids, payload: range }),
      ).record;
      expect(entered).toMatchObject({ ...range, projectId: p2.id, archived: false });
      const overlapping = await ask(api, dana, enterControlRangeEndpoint, {
        ids,
        payload: { series: 'LOAD', firstNumber: 5500, lastNumber: 6000 },
      });
      expect(told(overlapping)).toEqual([422, 'NOT_SAVED']);
      expect(errorAnswerSchema.parse(overlapping.body).reason).toBe('CONTROL_RANGE_OVERLAP');
      const archived = saved(
        archiveControlRangeEndpoint,
        await ask(api, dana, archiveControlRangeEndpoint, {
          ids: { controlRangeId: entered.id },
        }),
      ).record;
      expect(archived).toEqual({ ...entered, archived: true });
      // Archived, never deleted; and the numbers it held are free again.
      expect(await tx.controlRange.count({ where: { projectId: p2.id } })).toBe(1);
      expect(
        told(
          await ask(api, dana, enterControlRangeEndpoint, {
            ids,
            payload: { series: 'LOAD', firstNumber: 5500, lastNumber: 6000 },
          }),
        ),
      ).toEqual([200, undefined]);
    });
  });

  it('AC-01-15…17 step 4 and the lists: Coastline Haulers LLC is created once and found again, added to P1 as a prime, and given its contract with a link to the signed copy; Mulch joins the firm’s debris types and Stump fill its payable types, each at the end of its list with no key', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project } = await p1(api, dana, tx);
      const ids = { projectId: project.id };
      const coastline = saved(
        createContractorEndpoint,
        await ask(api, dana, createContractorEndpoint, {
          payload: { name: 'Coastline Haulers LLC', kind: 'HAULER' },
        }),
      ).record;
      expect(coastline).toMatchObject({ kind: 'HAULER', mergedIntoId: null, archived: false });
      expect(
        saved(
          findContractorsEndpoint,
          await ask(api, dana, findContractorsEndpoint, { query: '?search=coast' }),
        ).records,
      ).toEqual([coastline]);
      // A kind is said by whoever adds a contractor: there is no default.
      expect(
        told(
          await ask(api, dana, createContractorEndpoint, {
            payload: { name: 'Summit Debris Services' },
          }),
        ),
      ).toEqual([400, 'BAD_REQUEST']);
      const prime = saved(
        addPrimeEndpoint,
        await ask(api, dana, addPrimeEndpoint, { ids, payload: { contractorId: coastline.id } }),
      ).record;
      expect(prime).toMatchObject({
        projectId: project.id,
        contractorId: coastline.id,
        position: 'PRIME',
        primeId: null,
      });
      const contract = saved(
        createContractEndpoint,
        await ask(api, dana, createContractEndpoint, {
          ids,
          payload: {
            name: 'Coastline, Bayline ROW 2026',
            primeId: coastline.id,
            signedCopyUrl: 'https://files.gates.example/contracts/coastline-bayline-row-2026.pdf',
          },
        }),
      );
      expect(contract.record).toMatchObject({
        projectId: project.id,
        name: 'Coastline, Bayline ROW 2026',
        primeId: coastline.id,
        signedCopyUrl: 'https://files.gates.example/contracts/coastline-bayline-row-2026.pdf',
      });
      // The link is opened from a page: nothing but an https address is taken.
      for (const signedCopyUrl of [
        'javascript:alert(1)',
        'http://files.gates.example/a.pdf',
        'x',
      ]) {
        expect(
          told(
            await ask(api, dana, createContractEndpoint, {
              ids,
              payload: { name: 'Another', primeId: coastline.id, signedCopyUrl },
            }),
          ),
          signedCopyUrl,
        ).toEqual([400, 'BAD_REQUEST']);
      }
      expect(await tx.contract.count({ where: { projectId: project.id } })).toBe(1);

      const last = async (list: 'debrisType' | 'payableType') =>
        (list === 'debrisType'
          ? await tx.debrisType.aggregate({ _max: { position: true } })
          : await tx.payableType.aggregate({ _max: { position: true } })
        )._max.position ?? 0;
      const before = [await last('debrisType'), await last('payableType')];
      const mulchAnswer = await ask(api, dana, addDebrisTypeEndpoint, {
        payload: { name: 'Mulch' },
      });
      const mulch = saved(addDebrisTypeEndpoint, mulchAnswer).record;
      const fill = saved(
        addPayableTypeEndpoint,
        await ask(api, dana, addPayableTypeEndpoint, { payload: { name: 'Stump fill' } }),
      ).record;
      expect([mulch, fill]).toEqual([
        { id: mulch.id, key: null, name: 'Mulch', position: (before[0] ?? 0) + 1, archived: false },
        {
          id: fill.id,
          key: null,
          name: 'Stump fill',
          position: (before[1] ?? 0) + 1,
          archived: false,
        },
      ]);
      // A built-in key is a release's to write: the body takes none.
      expect(
        told(await ask(api, dana, addDebrisTypeEndpoint, { payload: { name: 'Ash', key: 'ASH' } })),
      ).toEqual([400, 'BAD_REQUEST']);
      expect(
        await tx.auditRecord.findMany({
          where: { requestId: mulchAnswer.requestId },
          select: { tableName: true, operation: true, actorId: true },
        }),
      ).toEqual([{ tableName: 'debris_type', operation: 'INSERT', actorId: who.dana }]);
    });
  });
});

describe('a refusal by the database’s own constraints is answered plainly, never as an internal error', () => {
  it('AC-01-07, AC-01-80 a time zone that isn’t an IANA name: EST', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { payload } = await p1Through(api, dana, tx, { timeZone: 'EST' });
      const answer = await ask(api, dana, createProjectEndpoint, { payload });
      expect(told(answer)).toEqual([422, 'REFUSED_BY_THE_DATABASE']);
      expect(plainly(answer)).toBe(
        'Not saved: the time zone must be an IANA name, such as America/New_York.',
      );
      // The log says which constraint, by its name; the caller is never told.
      expect(api.lines.join('\n')).toContain('"constraint":"project_time_zone_named_check"');
      expect(api.lines.join('\n')).not.toContain('"level":"error"');
    });
  });

  it('AC-10-38, AC-01-80 a second place for one contractor on a project: Coastline added to P1 as a prime twice', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project } = await p1(api, dana, tx);
      const coastline = saved(
        createContractorEndpoint,
        await ask(api, dana, createContractorEndpoint, {
          payload: { name: 'Coastline Haulers LLC', kind: 'HAULER' },
        }),
      ).record;
      const more = { ids: { projectId: project.id }, payload: { contractorId: coastline.id } };
      saved(addPrimeEndpoint, await ask(api, dana, addPrimeEndpoint, more));
      const answer = await ask(api, dana, addPrimeEndpoint, more);
      expect(told(answer)).toEqual([409, 'ALREADY_HELD']);
      expect(plainly(answer)).toBe(
        'Not saved: that contractor already has a place on the project.',
      );
    });
  });

  it('a record the request names that isn’t on record: a project under a client nobody entered', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { payload } = await p1Through(api, dana, tx, { clientId: randomUUID() });
      const answer = await ask(api, dana, createProjectEndpoint, { payload });
      expect(told(answer)).toEqual([422, 'UNKNOWN_RECORD']);
      expect(plainly(answer)).toBe('Not saved: something this names isn’t on record.');
    });
  });

  it('AC-01-08 an active window that ends before it starts, and a load-call limit past 100', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project } = await p1(api, dana, tx);
      const answer = await ask(api, dana, changeProjectWindowEndpoint, {
        ids: { projectId: project.id },
        payload: { activeTo: '2026-10-11' },
      });
      expect(told(answer)).toEqual([422, 'REFUSED_BY_THE_DATABASE']);
      expect(plainly(answer)).toBe('Not saved: the active window ends before it starts.');
    });
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project } = await p1(api, dana, tx);
      const answer = await ask(api, dana, changeProjectSettingsEndpoint, {
        ids: { projectId: project.id },
        payload: { loadCallHighLimit: 101 },
      });
      expect(told(answer)).toEqual([422, 'REFUSED_BY_THE_DATABASE']);
      expect(plainly(answer)).toBe(
        'Not saved: a load-call limit is a whole number from 0 to 100, or empty to switch it off.',
      );
    });
  });

  it('a project nobody has, named in the path, is not found: nothing is written and the piece of work carries on', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      for (const [served, payload] of [
        [closeProjectEndpoint, undefined],
        [changeProjectSettingsEndpoint, { siteCircleMeters: 150 }],
        [startNumberSeriesEndpoint, { series: 'CERTIFICATION', firstNumber: 730415 }],
        [archiveControlRangeEndpoint, undefined],
      ] as const) {
        const answer = await ask(api, dana, served, payload === undefined ? {} : { payload });
        expect(told(answer), served.name).toEqual([404, 'NOT_FOUND']);
        expect(plainly(answer)).toBe('Nothing with that id is on record.');
      }
      expect(await tx.project.count()).toBe(0);
    });
  });
});
