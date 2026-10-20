import { randomUUID } from 'node:crypto';

// Every setup record changed, archived and put back at the API (spec/parts/01-setup.md;
// spec/LISTS.md; spec/RULES.md §7; acceptance file 01, AC-01-02, 27, 58, 83; file 02, AC-02-03;
// BACKLOG 2.8.5, C62, C98…C101, C103, C113, C115, C140; REQ-213, REQ-105e; ADR-527). OWASP ASVS
// 5.0 V8, V16. The real process, in this test's own memory, on the installation's database as
// `adms_api`: it needs `pnpm local:up` after `pnpm installer`. Each test's work is undone. A
// refusal by the database ends the test's one piece of work, so it is the test's last request.
// Who may call each endpoint is setup-endpoints.test.ts's.
import {
  addFieldTagEndpoint,
  addFormDebrisTypeEndpoint,
  addListValueEndpoint,
  archiveListValueEndpoint,
  changeClientEndpoint,
  changeListValueSettingsEndpoint,
  changeContractEndpoint,
  changeContractorEndpoint,
  changeDeclarationEventEndpoint,
  changeFormDebrisTypeEndpoint,
  changeFormEndpoint,
  changePersonEndpoint,
  closeProjectEndpoint,
  createClientEndpoint,
  createContractorEndpoint,
  createFormEndpoint,
  createPayItemEndpoint,
  createSiteEndpoint,
  findClientsEndpoint,
  findContractorsEndpoint,
  giveSiteLabelEndpoint,
  linkTippingFeeEndpoint,
  reinstateAssignmentEndpoint,
  removeSiteLabelEndpoint,
  removeTippingFeeEndpoint,
  renameListValueEndpoint,
  setCrewDayStepsEndpoint,
  unarchiveListValueEndpoint,
  withdrawAssignmentEndpoint,
  writeAssignmentEndpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { danasEmail, long, worldOn, type Served } from './support/served.ts';
import {
  ask,
  notSaved,
  p1,
  p1Priced,
  plainly,
  saved,
  told,
  type Browser,
} from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

// What the audit log holds of one request: each row's table, operation, actor and the columns
// it changed.
const auditedBy = (tx: Tx, requestId: string) =>
  tx.auditRecord.findMany({
    where: { requestId },
    orderBy: { id: 'asc' },
    select: { tableName: true, operation: true, actorId: true, changedFields: true },
  });

const client = async (api: Served, dana: Browser, name: string, more: object = {}) =>
  saved(
    createClientEndpoint,
    await ask(api, dana, createClientEndpoint, { payload: { name, ...more } }),
  ).record;

// Marsh Road TDSR on P1, entered through the endpoint.
async function marshRoad(api: Served, dana: Browser, tx: Tx, projectId: string) {
  return saved(
    createSiteEndpoint,
    await ask(api, dana, createSiteEndpoint, {
      ids: { projectId },
      payload: {
        name: 'Marsh Road TDSR',
        siteTypeId: (await tx.siteType.findUniqueOrThrow({ where: { key: 'TDSR' } })).id,
        takesLoads: true,
        haulOutsLeaveHere: true,
        chargesTippingFee: false,
        ineligibleSite: false,
        permitNumber: null,
        latitude: '39.09000000',
        longitude: '-75.62000000',
        activationDate: '2026-10-12',
      },
    }),
  ).record;
}

describe('a client, a declaration event and a search', () => {
  it('AC-01-02 Bayline County’s contact phone changes: the record is kept, the new value saved, and the audit log holds one change with the phone before and Dana as actor; a contact is cleared with null; nothing is queued', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const bayline = await client(api, dana, 'Bayline County', {
        contactName: 'Pat Moreno',
        contactPhone: '555-0142',
      });
      const answer = await ask(api, dana, changeClientEndpoint, {
        ids: { clientId: bayline.id },
        payload: { contactPhone: '555-0199' },
      });
      expect(saved(changeClientEndpoint, answer)).toEqual({
        record: { ...bayline, contactPhone: '555-0199' },
        warnings: [],
      });
      expect(await auditedBy(tx, answer.requestId)).toEqual([
        {
          tableName: 'client',
          operation: 'UPDATE',
          actorId: who.dana,
          changedFields: ['contact_phone'],
        },
      ]);
      const audit = await tx.auditRecord.findFirstOrThrow({
        where: { requestId: answer.requestId },
      });
      expect((audit.priorValue as Record<string, unknown>)['contact_phone']).toBe('555-0142');
      const cleared = saved(
        changeClientEndpoint,
        await ask(api, dana, changeClientEndpoint, {
          ids: { clientId: bayline.id },
          payload: { contactName: null, notes: 'Debris manager changed after Delphine.' },
        }),
      ).record;
      expect([cleared.contactName, cleared.notes, await tx.client.count()]).toEqual([
        null,
        'Debris manager changed after Delphine.',
        1,
      ]);
      expect(
        told(
          await ask(api, dana, changeClientEndpoint, {
            ids: { clientId: bayline.id },
            payload: {},
          }),
        ),
      ).toEqual([400, 'BAD_REQUEST']);
    });
  });

  it('ADR-527 (1) a declaration event’s name, its reference and its type change, audited; nothing is queued', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const { declarationEvent } = await p1(api, dana, tx);
      const answer = await ask(api, dana, changeDeclarationEventEndpoint, {
        ids: { declarationEventId: declarationEvent.id },
        payload: { name: 'Hurricane Delphine (2026)' },
      });
      expect(saved(changeDeclarationEventEndpoint, answer)).toEqual({
        record: { ...declarationEvent, name: 'Hurricane Delphine (2026)' },
        warnings: [],
      });
      expect(await auditedBy(tx, answer.requestId)).toEqual([
        {
          tableName: 'declaration_event',
          operation: 'UPDATE',
          actorId: who.dana,
          changedFields: ['name'],
        },
      ]);
    });
  });
  it('ADR-527 (3) a search is a page at a time in name order: `limit`, `next` and `after`; nothing follows a record nobody has', async () => {
    await world(async (api) => {
      const dana = await api.signedIn(danasEmail, long);
      for (const name of ['Town of Egret Point', 'Bayline County', 'City of Marsh Harbor']) {
        await client(api, dana, name);
      }
      const page = (query: string) =>
        ask(api, dana, findClientsEndpoint, { query }).then((answer) =>
          saved(findClientsEndpoint, answer),
        );
      const first = await page('?limit=2');
      expect(first.records.map(({ name }) => name)).toEqual([
        'Bayline County',
        'City of Marsh Harbor',
      ]);
      expect(first.next).toBe(first.records[1]?.id);
      const second = await page(`?limit=2&after=${first.next ?? ''}`);
      expect([second.records.map(({ name }) => name), second.next]).toEqual([
        ['Town of Egret Point'],
        null,
      ]);
      // A page that holds the last record says no more follow.
      const whole = await page('?limit=3');
      expect([whole.records.length, whole.next]).toEqual([3, null]);
      expect((await page('?search=of&limit=1')).records.map(({ name }) => name)).toEqual([
        'City of Marsh Harbor',
      ]);
      expect(await page('?after=0199e000-0000-7000-8000-000000000000')).toEqual({
        records: [],
        next: null,
      });
      expect(told(await ask(api, dana, findClientsEndpoint, { query: '?limit=201' }))).toEqual([
        400,
        'BAD_REQUEST',
      ]);
    });
  });

  it('ADR-527 (1) a project closed twice keeps its first close, and nothing is written the second time', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project } = await p1(api, dana, tx);
      const ids = { projectId: project.id };
      const closed = saved(
        closeProjectEndpoint,
        await ask(api, dana, closeProjectEndpoint, { ids }),
      ).record;
      api.clock.later(1);
      const again = await ask(api, dana, closeProjectEndpoint, { ids });
      expect(saved(closeProjectEndpoint, again).record.closedAt).toBe(closed.closedAt);
      expect(await auditedBy(tx, again.requestId)).toEqual([]);
    });
  });
});

describe('a contractor and a contract', () => {
  it('ADR-527 (1), ADR-529 (c) a prime’s own name, kind and contact change on its contractor record; nothing it bills follows a name, so nothing is queued', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { coastline } = await p1Priced(api, dana, tx);
      const changed = saved(
        changeContractorEndpoint,
        await ask(api, dana, changeContractorEndpoint, {
          ids: { contractorId: coastline },
          payload: { name: 'Coastline Haulers, LLC', contactEmail: 'dispatch@coastline.example' },
        }),
      );
      expect([
        changed.record.name,
        changed.record.contactEmail,
        changed.record.kind,
        changed.queued,
      ]).toEqual(['Coastline Haulers, LLC', 'dispatch@coastline.example', 'HAULER', undefined]);
    });
  });
  it('ADR-527 (2) a contract’s name and link change, its prime stays as entered: a contract has one prime (ADR-529 (c), (j))', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { contract, coastline } = await p1Priced(api, dana, tx);
      const contractIds = { contractId: contract };
      const changed = saved(
        changeContractEndpoint,
        await ask(api, dana, changeContractEndpoint, {
          ids: contractIds,
          payload: {
            name: 'Coastline, Bayline ROW 2026 (amended)',
            signedCopyUrl: 'https://files.baylinecounty.example/contracts/row-2026.pdf',
          },
        }),
      ).record;
      expect([changed.name, changed.primeId]).toEqual([
        'Coastline, Bayline ROW 2026 (amended)',
        coastline,
      ]);
      expect(
        saved(
          changeContractEndpoint,
          await ask(api, dana, changeContractEndpoint, {
            ids: contractIds,
            payload: { signedCopyUrl: null },
          }),
        ).record.signedCopyUrl,
      ).toBeNull();
      for (const payload of [{ primeId: coastline }, { signedCopyUrl: 'http://files.example/a' }]) {
        expect(
          told(await ask(api, dana, changeContractEndpoint, { ids: contractIds, payload })),
        ).toEqual([400, 'BAD_REQUEST']);
      }
    });
  });
});

describe('a form and the debris types on it', () => {
  it('AC-01-83 the incident form’s offers are changed (the cert number taken off) and audited; the ROE form’s GPS required ticked; a form renamed; nothing is queued; GPS required on a load form is the database’s to refuse', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const { ids, form, forms } = await p1Priced(api, dana, tx);
      const incident = await form('INCIDENT', 'Incident', {
        incidentOffers: ['CONTRACTOR', 'CERT_NUMBER'],
      });
      const answer = await ask(api, dana, changeFormEndpoint, {
        ids: { formId: incident.id },
        payload: { incidentOffers: ['CONTRACTOR'], name: 'Incident report' },
      });
      const changed = saved(changeFormEndpoint, answer);
      expect(changed).toEqual({
        record: {
          ...incident,
          name: 'Incident report',
          incidentOffers: ['CONTRACTOR'],
        },
        warnings: [],
      });
      expect(await auditedBy(tx, answer.requestId)).toEqual([
        {
          tableName: 'form',
          operation: 'UPDATE',
          actorId: who.dana,
          changedFields: ['incident_offers', 'name'],
        },
      ]);
      const roe = await form('ROE', 'Right of entry', { gpsRequired: false });
      expect(
        saved(
          changeFormEndpoint,
          await ask(api, dana, changeFormEndpoint, {
            ids: { formId: roe.id },
            payload: { gpsRequired: true },
          }),
        ).record.gpsRequired,
      ).toBe(true);
      expect(ids.projectId).toBe(incident.projectId);
      const refused = await ask(api, dana, changeFormEndpoint, {
        ids: { formId: forms.load },
        payload: { gpsRequired: true },
      });
      expect(told(refused)).toEqual([422, 'REFUSED_BY_THE_DATABASE']);
      plainly(refused);
    });
  });

  it('ADR-527 (5), ADR-529 (g) a debris type’s entry is changed: hidden on phones takes it off their list, never archived; one not Reduced on the haul-out form is warned of; each queues its form’s tickets', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { forms, debrisType } = await p1Priced(api, dana, tx);
      const entry = async (formId: string, name: string, reduced: boolean) =>
        saved(
          addFormDebrisTypeEndpoint,
          await ask(api, dana, addFormDebrisTypeEndpoint, {
            ids: { formId },
            payload: { debrisTypeId: await debrisType(name), reduced, hiddenOnPhones: false },
          }),
        ).record;
      const cd = await entry(forms.load, 'C&D', false);
      const ids = { formDebrisTypeId: cd.id };
      expect(
        saved(
          changeFormDebrisTypeEndpoint,
          await ask(api, dana, changeFormDebrisTypeEndpoint, {
            ids,
            payload: { hiddenOnPhones: true },
          }),
        ).record,
      ).toEqual({ ...cd, hiddenOnPhones: true });
      const mulch = await entry(forms.haulOut, 'Vegetative', true);
      const unreduced = saved(
        changeFormDebrisTypeEndpoint,
        await ask(api, dana, changeFormDebrisTypeEndpoint, {
          ids: { formDebrisTypeId: mulch.id },
          payload: { reduced: false },
        }),
      );
      expect(unreduced.warnings.map(({ code }) => code)).toEqual(['UNREDUCED_ON_HAUL_OUT']);
    });
  });
});

describe('the firm’s lists', () => {
  it('ADR-527 (6) a value of the firm’s own is renamed, archived and put back; a built-in value is renamed, never archived; a project’s field tag likewise', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project } = await p1(api, dana, tx);
      const label = await tx.siteLabel.create({ data: { name: 'Burn site', position: 99 } });
      const ids = { list: 'site-labels', valueId: label.id };
      const renamed = saved(
        renameListValueEndpoint,
        await ask(api, dana, renameListValueEndpoint, { ids, payload: { name: 'Burn pit' } }),
      ).record;
      expect(renamed).toEqual({
        id: label.id,
        key: null,
        name: 'Burn pit',
        position: 99,
        archived: false,
      });
      const archived = await ask(api, dana, archiveListValueEndpoint, { ids });
      expect(saved(archiveListValueEndpoint, archived).record.archived).toBe(true);
      expect(await auditedBy(tx, archived.requestId)).toEqual([
        {
          tableName: 'site_label',
          operation: 'UPDATE',
          actorId: who.dana,
          changedFields: ['archived_at'],
        },
      ]);
      expect(
        saved(unarchiveListValueEndpoint, await ask(api, dana, unarchiveListValueEndpoint, { ids }))
          .record,
      ).toEqual(renamed);
      const tdsr = await tx.siteType.findUniqueOrThrow({ where: { key: 'TDSR' } });
      const builtIn = { list: 'site-types', valueId: tdsr.id };
      expect(
        saved(
          renameListValueEndpoint,
          await ask(api, dana, renameListValueEndpoint, {
            ids: builtIn,
            payload: { name: 'Staging and reduction site' },
          }),
        ).record,
      ).toMatchObject({ key: 'TDSR', name: 'Staging and reduction site', archived: false });
      expect(notSaved(await ask(api, dana, archiveListValueEndpoint, { ids: builtIn }))).toEqual([
        'BUILT_IN_KEPT',
        'Not archived: “Staging and reduction site” comes with Open ADMS and the system acts on it. It can be renamed, never archived.',
      ]);
      const mixed = saved(
        addFieldTagEndpoint,
        await ask(api, dana, addFieldTagEndpoint, {
          ids: { projectId: project.id },
          payload: { name: 'Mixed' },
        }),
      ).record;
      expect(
        saved(
          archiveListValueEndpoint,
          await ask(api, dana, archiveListValueEndpoint, {
            ids: { list: 'field-tags', valueId: mixed.id },
          }),
        ).record,
      ).toEqual({ id: mixed.id, key: null, name: 'Mixed', position: 1, archived: true });
      expect(
        told(
          await ask(api, dana, archiveListValueEndpoint, {
            ids: { list: 'colours', valueId: mixed.id },
          }),
        ),
      ).toEqual([400, 'BAD_REQUEST']);
      expect(
        told(await ask(api, dana, archiveListValueEndpoint, { ids: { ...ids, list: 'reasons' } })),
      ).toEqual([404, 'NOT_FOUND']);
    });
  });
});

describe('a value added to any of the firm’s lists', () => {
  it('ADR-527 (6) a value of the firm’s own is added at the end of its list with what its list asks beside its name; one missing it, or stating what another list asks, isn’t; a field tag is added on its project', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const add = (list: string, payload: object) =>
        ask(api, dana, addListValueEndpoint, { ids: { list }, payload });
      const last = await tx.kindOfWork.aggregate({ _max: { position: true } });
      const answer = await add('kinds-of-work', { name: 'Sand removal', countShape: 'NUMBER' });
      const added = saved(addListValueEndpoint, answer);
      expect(added).toEqual({
        record: {
          id: added.record.id,
          key: null,
          name: 'Sand removal',
          position: (last._max.position ?? 0) + 1,
          archived: false,
        },
        warnings: [],
      });
      expect(
        (await auditedBy(tx, answer.requestId)).map(({ tableName, operation, actorId }) => [
          tableName,
          operation,
          actorId,
        ]),
      ).toEqual([['kind_of_work', 'INSERT', who.dana]]);
      const ppdr = saved(
        addListValueEndpoint,
        await add('program-types', { name: 'Waterway (state)', requiresRoe: true }),
      ).record;
      expect((await tx.programType.findUniqueOrThrow({ where: { id: ppdr.id } })).requiresRoe).toBe(
        true,
      );
      saved(addListValueEndpoint, await add('site-labels', { name: 'Burn site' }));
      expect(notSaved(await add('kinds-of-work', { name: 'Sand removal, again' }))).toEqual([
        'LIST_VALUE_SETTINGS',
        'Not added: a value of this list states the shape of its count.',
      ]);
      expect(
        notSaved(await add('site-labels', { name: 'Ash pit', certifies: 'CONTAINER' })),
      ).toEqual([
        'LIST_VALUE_SETTINGS',
        'Not added: a value of this list takes no what it certifies.',
      ]);
      expect(notSaved(await add('field-tags', { name: 'Mixed' }))[0]).toBe('LIST_VALUE_SETTINGS');
      expect(told(await add('reasons', { name: 'Storm', uses: [] }))).toEqual([400, 'BAD_REQUEST']);
    });
  });

  it('AC-11-90 a kind of work the firm adds is photographed by stage where it says so and not otherwise; once added, Leaners is turned off and on again, audited, and nothing else changes that way', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const add = (payload: object) =>
        ask(api, dana, addListValueEndpoint, { ids: { list: 'kinds-of-work' }, payload });
      const staged = saved(
        addListValueEndpoint,
        await add({ name: 'Palms', countShape: 'NUMBER', photosByStage: true }),
      ).record;
      const plain = saved(
        addListValueEndpoint,
        await add({ name: 'Signs', countShape: 'NUMBER' }),
      ).record;
      const byStage = async (id: string) =>
        (await tx.kindOfWork.findUniqueOrThrow({ where: { id } })).photosByStage;
      expect([await byStage(staged.id), await byStage(plain.id)]).toEqual([true, false]);

      const leaners = await tx.kindOfWork.findFirstOrThrow({ where: { name: 'Leaners' } });
      expect(leaners.photosByStage).toBe(true);
      const change = (list: string, valueId: string, payload: object) =>
        ask(api, dana, changeListValueSettingsEndpoint, { ids: { list, valueId }, payload });
      const off = await change('kinds-of-work', leaners.id, { photosByStage: false });
      expect(saved(changeListValueSettingsEndpoint, off).record.name).toBe('Leaners');
      expect(await byStage(leaners.id)).toBe(false);
      expect(
        (await auditedBy(tx, off.requestId)).map(({ tableName, operation, actorId }) => [
          tableName,
          operation,
          actorId,
        ]),
      ).toEqual([['kind_of_work', 'UPDATE', who.dana]]);
      saved(
        changeListValueSettingsEndpoint,
        await change('kinds-of-work', leaners.id, { photosByStage: true }),
      );
      expect(await byStage(leaners.id)).toBe(true);
      expect(notSaved(await change('kinds-of-work', leaners.id, {}))).toEqual([
        'LIST_VALUE_SETTINGS',
        'Not changed: nothing to change was said.',
      ]);
      const ppdr = await tx.programType.findFirstOrThrow({ where: { name: 'PPDR' } });
      expect(notSaved(await change('program-types', ppdr.id, { photosByStage: true }))).toEqual([
        'LIST_VALUE_SETTINGS',
        'Not changed: a value of this list doesn’t change whether its photographs are taken by stage.',
      ]);
      expect(
        told(await change('kinds-of-work', leaners.id, { countShape: 'ITEM_COUNTS' })),
      ).toEqual([400, 'BAD_REQUEST']);
    });
  });
});

describe('pay items, rates, a crew day’s steps and rules', () => {
  it('ADR-527 (7) a crew day’s steps are stated whole, one first hour one row, two that share an hour refused, steps on a pay item not paid in them warned of', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { coastline, veg15, payItem, payableType } = await p1Priced(api, dana, tx);
      const veg = saved(createPayItemEndpoint, await veg15()).record;
      const crew = saved(
        createPayItemEndpoint,
        await payItem({
          code: 'CREW-DAY-STEPS',
          description: 'Crew day, paid in steps',
          payableTypeId: await payableType('Crew time'),
          unit: 'CREW_DAY',
          crewTimeConversion: 'PER_DAY_STEPS',
          rates: [{ primeId: coastline, rate: '1800.00' }],
        }),
      ).record;
      const ids = { payItemId: crew.id };
      const steps = [
        { fromHours: '1.5', toHours: '4.5', quantity: '0.25' },
        { fromHours: '4.75', toHours: '8.5', quantity: '0.5' },
        { fromHours: '8.75', toHours: '12', quantity: '1' },
      ];
      const stated = saved(
        setCrewDayStepsEndpoint,
        await ask(api, dana, setCrewDayStepsEndpoint, { ids, payload: { steps } }),
      );
      expect(
        stated.record.steps.map(({ fromHours, toHours, quantity }) => ({
          fromHours,
          toHours,
          quantity,
        })),
      ).toEqual(steps);
      expect(stated.queued?.tickets).toBe(0);
      const restated = saved(
        setCrewDayStepsEndpoint,
        await ask(api, dana, setCrewDayStepsEndpoint, {
          ids,
          payload: { steps: [{ ...steps[0], quantity: '0.3' }, steps[1]] },
        }),
      ).record.steps;
      expect(restated.map(({ id }) => id)).toEqual(
        stated.record.steps.slice(0, 2).map(({ id }) => id),
      );
      expect(
        await tx.payItemCrewDayStep.count({
          where: { payItemId: crew.id, archivedAt: { not: null } },
        }),
      ).toBe(1);
      expect(
        notSaved(
          await ask(api, dana, setCrewDayStepsEndpoint, {
            ids,
            payload: { steps: [steps[0], { fromHours: '4.5', toHours: '6', quantity: '0.5' }] },
          }),
        ),
      ).toEqual([
        'CREW_DAY_STEPS_OVERLAP',
        'Not saved: two steps of pay item CREW-DAY-STEPS share hours (1.5–4.5 h and 4.5–6 h). An hour is in one step at most.',
      ]);
      const unread = saved(
        setCrewDayStepsEndpoint,
        await ask(api, dana, setCrewDayStepsEndpoint, {
          ids: { payItemId: veg.id },
          payload: { steps },
        }),
      );
      expect(unread.warnings.map(({ code }) => code)).toEqual(['CREW_DAY_STEPS_UNREAD']);
    });
  });
});

describe('a site, its labels and its tipping fee link', () => {
  it('AC-01-58 the firm’s own label "burn site" is given, removed when given by mistake and given back on its one row, queueing nothing; a tipping fee link made by mistake is removed and linked again (ADR-529 (g))', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project, payItem, payableType, coastline } = await p1Priced(api, dana, tx);
      const site = await marshRoad(api, dana, tx, project.id);
      const ids = { siteId: site.id };
      const burn = await tx.siteLabel.create({ data: { name: 'Burn site', position: 99 } });
      const labelIds = { siteId: site.id, siteLabelId: burn.id };
      const given = saved(
        giveSiteLabelEndpoint,
        await ask(api, dana, giveSiteLabelEndpoint, { ids: labelIds }),
      );
      expect([given.record.archived, given.queued]).toEqual([false, undefined]);
      // Given again while it stands: the label it has, and nothing written.
      const again = await ask(api, dana, giveSiteLabelEndpoint, { ids: labelIds });
      expect(saved(giveSiteLabelEndpoint, again).record).toEqual(given.record);
      expect(await auditedBy(tx, again.requestId)).toEqual([]);
      expect(
        saved(
          removeSiteLabelEndpoint,
          await ask(api, dana, removeSiteLabelEndpoint, { ids: labelIds }),
        ).record,
      ).toEqual({ ...given.record, archived: true });
      expect(
        saved(giveSiteLabelEndpoint, await ask(api, dana, giveSiteLabelEndpoint, { ids: labelIds }))
          .record,
      ).toEqual(given.record);
      expect(await tx.disposalSiteLabel.count({ where: { siteId: site.id } })).toBe(1);

      const fee = saved(
        createPayItemEndpoint,
        await payItem({
          code: 'TIP-FEE-CY-MRT',
          description: 'Tipping fee, Marsh Road TDSR',
          payableTypeId: await payableType('Vegetative'),
          unit: 'CY',
          rates: [{ primeId: coastline, rate: '2.00' }],
        }),
      ).record;
      const link = saved(
        linkTippingFeeEndpoint,
        await ask(api, dana, linkTippingFeeEndpoint, { ids, payload: { payItemId: fee.id } }),
      ).record;
      const off = saved(
        removeTippingFeeEndpoint,
        await ask(api, dana, removeTippingFeeEndpoint, {
          ids: { siteId: site.id, payItemId: fee.id },
        }),
      );
      expect([off.record, off.queued?.tickets]).toEqual([{ ...link, archived: true }, 0]);
      expect(
        saved(
          linkTippingFeeEndpoint,
          await ask(api, dana, linkTippingFeeEndpoint, { ids, payload: { payItemId: fee.id } }),
        ).record,
      ).toEqual(link);
    });
  });
});

describe('people', () => {
  it('AC-02-03 Kim Nguyen’s employer, Harbor Staffing, and its own ID for her, HS-0417, are set by a request, and cleared; an employer the firm doesn’t hold is refused; her address cleared, a monitor’s; Luis’s, who signs in with his, is not; an ID with no employer is the database’s to refuse', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const harbor = saved(
        createContractorEndpoint,
        await ask(api, dana, createContractorEndpoint, {
          payload: { name: 'Harbor Staffing', kind: 'MONITORING' },
        }),
      ).record;
      const kim = { userId: who.kim };
      const employed = saved(
        changePersonEndpoint,
        await ask(api, dana, changePersonEndpoint, {
          ids: kim,
          payload: { employerId: harbor.id, employerNumber: 'HS-0417' },
        }),
      );
      expect([employed.employerId, employed.employerNumber]).toEqual([harbor.id, 'HS-0417']);
      const cleared = saved(
        changePersonEndpoint,
        await ask(api, dana, changePersonEndpoint, { ids: kim, payload: { email: null } }),
      );
      expect(cleared.email).toBeNull();
      const luis = await ask(api, dana, changePersonEndpoint, {
        ids: { userId: who.luis },
        payload: { email: null },
      });
      expect(told(luis)).toEqual([422, 'EMAIL_SIGNS_IN']);
      expect(
        told(
          await ask(api, dana, changePersonEndpoint, {
            ids: { userId: who.luis },
            payload: { employerId: randomUUID() },
          }),
        ),
      ).toEqual([422, 'UNKNOWN_CONTRACTOR']);
      const none = saved(
        changePersonEndpoint,
        await ask(api, dana, changePersonEndpoint, {
          ids: kim,
          payload: { employerId: null, employerNumber: null },
        }),
      );
      expect([none.employerId, none.employerNumber]).toEqual([null, null]);
      const refused = await ask(api, dana, changePersonEndpoint, {
        ids: kim,
        payload: { employerNumber: 'HS-0417' },
      });
      expect(told(refused)).toEqual([422, 'REFUSED_BY_THE_DATABASE']);
      expect(plainly(refused)).toBe(
        'Not saved: an employer’s ID for a person is kept only beside their employer.',
      );
    });
  });
});

describe('the dispatch board', () => {
  it('ADR-527 (13) an assignment is withdrawn with a note and put back, its note cleared and kept by the audit; one that stands has nothing to put back', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project } = await p1(api, dana, tx);
      const kims = saved(
        writeAssignmentEndpoint,
        await ask(api, dana, writeAssignmentEndpoint, {
          ids: { projectId: project.id },
          payload: {
            personId: who.kim,
            workDate: '2026-10-12',
            fieldEventKinds: ['COLLECTION'],
            certifying: false,
            formDocumentTypes: [],
            siteId: null,
            deviceId: null,
            payItemIds: [],
          },
        }),
      ).record;
      expect(kims.withdrawalNote).toBeNull();
      const ids = { assignmentId: kims.id };
      const withdrawn = saved(
        withdrawAssignmentEndpoint,
        await ask(api, dana, withdrawAssignmentEndpoint, {
          ids,
          payload: { note: 'Rain day: no collection on Monday' },
        }),
      ).record;
      expect([withdrawn.withdrawalNote, withdrawn.withdrawnAt === null]).toEqual([
        'Rain day: no collection on Monday',
        false,
      ]);
      const answer = await ask(api, dana, reinstateAssignmentEndpoint, { ids });
      expect(saved(reinstateAssignmentEndpoint, answer).record).toEqual(kims);
      const audit = await tx.auditRecord.findFirstOrThrow({
        where: { requestId: answer.requestId, tableName: 'assignment' },
      });
      expect((audit.priorValue as Record<string, unknown>)['withdrawal_note']).toBe(
        'Rain day: no collection on Monday',
      );
      expect(notSaved(await ask(api, dana, reinstateAssignmentEndpoint, { ids }))).toEqual([
        'NOT_WITHDRAWN',
        'Kim Nguyen’s assignment stands: there is nothing to put back. Nothing was changed.',
      ]);
      // Withdrawn with no note, as before.
      expect(
        saved(withdrawAssignmentEndpoint, await ask(api, dana, withdrawAssignmentEndpoint, { ids }))
          .record.withdrawalNote,
      ).toBeNull();
    });
  });
});

describe('the forms of a new project', () => {
  it('a form created as before is answered as before', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project } = await p1(api, dana, tx);
      expect(
        saved(
          createFormEndpoint,
          await ask(api, dana, createFormEndpoint, {
            ids: { projectId: project.id },
            payload: { documentType: 'SURVEY', name: 'Pre-work survey' },
          }),
        ).record.archived,
      ).toBe(false);
      expect(
        saved(findContractorsEndpoint, await ask(api, dana, findContractorsEndpoint)).next,
      ).toBeNull();
    });
  });
});
