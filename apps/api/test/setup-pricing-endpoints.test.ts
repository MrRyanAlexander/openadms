// Setup's endpoints, steps 5, 6 and 8, against the database (spec/parts/01-setup.md;
// spec/RULES.md; ARCHITECTURE §6; acceptance file 01, sections C, E, G and AC-01-80; file 10,
// AC-10-27, 38; BACKLOG 2.4.2, C97, C98; ADR-364, 422, 424, 425): forms, the debris types on
// them and the firm's own fields; pay items, a prime's rate and "Pays when"; rules. OWASP ASVS
// 5.0 V2, V8, V16. The real process, in this test's own memory, on the installation's database
// as `adms_api`: it needs `pnpm local:up` after `pnpm installer`, and fails saying so. Each
// test's work is undone (support/database.ts). A refusal by the database ends the test's one
// piece of work, so each such test makes its refused request last. Who may call each endpoint
// at the door is setup-endpoints.test.ts's, which holds them all.
import { randomUUID } from 'node:crypto';

import {
  addFormDebrisTypeEndpoint,
  addFormDefinitionEndpoint,
  addPrimeEndpoint,
  changePayItemEndpoint,
  changeRuleEndpoint,
  createContractEndpoint,
  createContractorEndpoint,
  createFormEndpoint,
  createPayItemEndpoint,
  createRuleEndpoint,
  errorAnswerSchema,
  savePaysWhenEndpoint,
  setPayItemRateEndpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FormSetup } from '../src/setup/form-setup.ts';
import { PayItemSetup } from '../src/setup/pay-item-setup.ts';
import { RuleSetup } from '../src/setup/rule-setup.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { shippedPolicy } from './support/process.ts';
import { danasEmail, long, worldOn, type Answer, type Served } from './support/served.ts';
import { ask, p1, plainly, saved, told, type Browser } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

// A refusal by the domain's rules: `NOT_SAVED`, the rule's own code, and its plain words.
function notSaved(answer: Answer): [string | undefined, string | undefined] {
  expect(told(answer)).toEqual([422, 'NOT_SAVED']);
  const refusal = errorAnswerSchema.parse(answer.body);
  return [refusal.reason, refusal.message];
}

// No capture setting has a default: whoever enters a pay item states each (ADR-309).
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
};

// P1 with Coastline as its prime, Coastline's contract and the three forms that take rules, all
// through the endpoints; and what the firm's lists hold, picked by name (never typed).
async function p1Priced(api: Served, dana: Browser, tx: Tx) {
  const { project } = await p1(api, dana, tx);
  const ids = { projectId: project.id };
  const contractor = async (name: string) =>
    saved(
      createContractorEndpoint,
      await ask(api, dana, createContractorEndpoint, { payload: { name, kind: 'HAULER' } }),
    ).record.id;
  const coastline = await contractor('Coastline Haulers LLC');
  saved(
    addPrimeEndpoint,
    await ask(api, dana, addPrimeEndpoint, { ids, payload: { contractorId: coastline } }),
  );
  const contract = saved(
    createContractEndpoint,
    await ask(api, dana, createContractEndpoint, {
      ids,
      payload: { name: 'Coastline, Bayline ROW 2026', primeId: coastline },
    }),
  ).record.id;
  const form = async (documentType: string, name: string, more: object = {}) =>
    saved(
      createFormEndpoint,
      await ask(api, dana, createFormEndpoint, {
        ids,
        payload: { documentType, name, enabled: true, ...more },
      }),
    ).record;
  const forms = {
    load: (await form('LOAD', 'Load')).id,
    haulOut: (await form('HAUL_OUT', 'Haul-out')).id,
    unitRate: (await form('UNIT_RATE', 'Unit rate')).id,
  };
  const named = async (rows: Promise<{ id: string } | null>) => (await rows)?.id ?? '';
  const payableType = (name: string) => named(tx.payableType.findFirstOrThrow({ where: { name } }));
  const kindOfWork = (name: string) => named(tx.kindOfWork.findFirstOrThrow({ where: { name } }));
  const debrisType = (name: string) => named(tx.debrisType.findFirstOrThrow({ where: { name } }));
  const payItem = (payload: object) =>
    ask(api, dana, createPayItemEndpoint, { ids, payload: { ...unticked, ...payload } });
  // A unit rate pay item, one a monitor picks by its payable type: by the each, one at a time.
  const each = async (
    code: string,
    description: string,
    work: string,
    rate: string,
    band?: { from: number | null; to: number | null },
  ) =>
    payItem({
      code,
      description,
      payableTypeId: await payableType(work),
      unit: 'EA',
      kindOfWorkId: await kindOfWork(work),
      countIsAlwaysOne: true,
      photosRequired: true,
      measurementRequired: band !== undefined,
      bandFrom: band?.from ?? null,
      bandTo: band?.to ?? null,
      rates: [{ primeId: coastline, rate }],
    });
  const veg15 = async () =>
    payItem({
      code: 'VEG-HAUL-CY-15',
      description: 'ROW VEG haul 0–15 mi',
      payableTypeId: await payableType('Vegetative'),
      unit: 'CY',
      rates: [{ primeId: coastline, rate: '7.50' }],
    });
  return {
    project,
    ids,
    contractor,
    coastline,
    contract,
    form,
    forms,
    payableType,
    kindOfWork,
    debrisType,
    payItem,
    each,
    veg15,
  };
}

describe('step 5: Dana sets P1’s forms through the endpoints', () => {
  it('AC-01-22, 23, 25, 30, 83 a form for each document type P1 uses; "GPS required" on the ROE form and what an incident offers on the incident form; Vegetative on the load form; C&D, not marked Reduced, on the haul-out form is saved and she is warned', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project, forms, form, debrisType } = await p1Priced(api, dana, tx);
      const incident = await form('INCIDENT', 'Incident', {
        incidentOffers: ['CERT_NUMBER', 'CONTRACTOR'],
      });
      expect(incident).toEqual({
        id: incident.id,
        projectId: project.id,
        documentType: 'INCIDENT',
        name: 'Incident',
        enabled: true,
        gpsRequired: null,
        // As the form keeps it: each once, in the phone's order.
        incidentOffers: ['CONTRACTOR', 'CERT_NUMBER'],
        archived: false,
      });
      const roe = await form('ROE', 'Right of Entry', { gpsRequired: true });
      expect([roe.gpsRequired, roe.incidentOffers]).toEqual([true, []]);
      // An offer named twice, and a document type nobody has, are refused by the schema.
      for (const payload of [
        {
          documentType: 'INCIDENT',
          name: 'Incident',
          enabled: true,
          incidentOffers: ['CONTRACTOR', 'CONTRACTOR'],
        },
        { documentType: 'INVOICE', name: 'Invoice', enabled: true },
        { documentType: 'SURVEY', name: 'Survey' },
      ]) {
        expect(
          told(
            await ask(api, dana, createFormEndpoint, { ids: { projectId: project.id }, payload }),
          ),
        ).toEqual([400, 'BAD_REQUEST']);
      }

      const vegetativeAnswer = await ask(api, dana, addFormDebrisTypeEndpoint, {
        ids: { formId: forms.load },
        payload: {
          debrisTypeId: await debrisType('Vegetative'),
          reduced: false,
          hiddenOnPhones: false,
        },
      });
      const vegetative = saved(addFormDebrisTypeEndpoint, vegetativeAnswer);
      expect(vegetative).toEqual({
        record: {
          id: vegetative.record.id,
          formId: forms.load,
          debrisTypeId: await debrisType('Vegetative'),
          reduced: false,
          reductionMethodId: null,
          hiddenOnPhones: false,
          archived: false,
        },
        warnings: [],
      });
      expect(
        await tx.auditRecord.findMany({
          where: { requestId: vegetativeAnswer.requestId },
          select: { tableName: true, operation: true, actorId: true, source: true },
        }),
      ).toEqual([
        {
          tableName: 'form_debris_type',
          operation: 'INSERT',
          actorId: who.dana,
          source: 'BACK_OFFICE',
        },
      ]);
      const cd = saved(
        addFormDebrisTypeEndpoint,
        await ask(api, dana, addFormDebrisTypeEndpoint, {
          ids: { formId: forms.haulOut },
          payload: { debrisTypeId: await debrisType('C&D'), reduced: false, hiddenOnPhones: true },
        }),
      );
      expect(cd.record).toMatchObject({ formId: forms.haulOut, hiddenOnPhones: true });
      expect(cd.warnings).toHaveLength(1);
      expect(cd.warnings[0]?.message).toMatch(/C&D.*Reduced/);
      // A form nobody has is not found, and nothing is written.
      expect(
        told(
          await ask(api, dana, addFormDebrisTypeEndpoint, {
            payload: {
              debrisTypeId: await debrisType('Vegetative'),
              reduced: false,
              hiddenOnPhones: false,
            },
          }),
        ),
      ).toEqual([404, 'NOT_FOUND']);
      expect(await tx.formDebrisType.count()).toBe(2);
    });
  });

  it('AC-01-29 the firm’s own field "Police report number" on P1’s incident form is version 1; a second field is version 2, and version 1 is still there, unchanged', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const { form } = await p1Priced(api, dana, tx);
      const incident = await form('INCIDENT', 'Incident', { incidentOffers: [] });
      const ids = { formId: incident.id };
      const policeReport = {
        id: 'police-report-number',
        label: 'Police report number',
        type: 'TEXT',
        required: false,
      };
      const first = saved(
        addFormDefinitionEndpoint,
        await ask(api, dana, addFormDefinitionEndpoint, {
          ids,
          payload: { fields: [policeReport] },
        }),
      ).record;
      expect(first).toEqual({
        id: first.id,
        formId: incident.id,
        version: 1,
        fields: [policeReport],
      });
      const injured = {
        id: 'anyone-injured',
        label: 'Was anyone injured?',
        type: 'YES_NO',
        required: true,
      };
      const second = saved(
        addFormDefinitionEndpoint,
        await ask(api, dana, addFormDefinitionEndpoint, {
          ids,
          payload: { fields: [policeReport, injured] },
        }),
      ).record;
      expect([second.version, second.fields]).toEqual([2, [policeReport, injured]]);
      expect(
        await tx.formDefinition.findMany({
          where: { formId: incident.id },
          orderBy: { version: 'asc' },
          select: { version: true, fields: true, createdById: true },
        }),
      ).toEqual([
        { version: 1, fields: [policeReport], createdById: who.dana },
        { version: 2, fields: [policeReport, injured], createdById: who.dana },
      ]);
      // The fields' shape is the contracts': an id used twice, a pick with no choices and a field
      // nobody named are refused before the service runs.
      for (const fields of [
        [policeReport, policeReport],
        [{ id: 'damage', label: 'Damage', type: 'PICK', required: true }],
        [{ ...policeReport, hint: 'From the officer' }],
      ]) {
        expect(
          told(await ask(api, dana, addFormDefinitionEndpoint, { ids, payload: { fields } })),
        ).toEqual([400, 'BAD_REQUEST']);
      }
      expect(await tx.formDefinition.count({ where: { formId: incident.id } })).toBe(2);
    });
  });
});

describe('step 6: Dana reads the pay items off Coastline’s contract through the endpoints', () => {
  it('AC-01-39, 49, 51 VEG-HAUL-CY-15 holds its code, description, payable type, CY, its capture settings and Coastline’s $7.50; the freon-staged pay item is saved with no rate; the rate goes to $7.80, the one row changed and the audit log holding the $7.50 before; each answer says what it queued', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const { project, coastline, payableType, payItem, veg15 } = await p1Priced(api, dana, tx);
      const entered = await veg15();
      const veg = saved(createPayItemEndpoint, entered);
      expect(veg.record).toEqual({
        ...unticked,
        id: veg.record.id,
        projectId: project.id,
        code: 'VEG-HAUL-CY-15',
        description: 'ROW VEG haul 0–15 mi',
        payableTypeId: await payableType('Vegetative'),
        unit: 'CY',
        archived: false,
      });
      // P1 has no ticket yet: a job for none of them, and no locked ticket passed by (ADR-422).
      expect([veg.warnings, veg.queued?.tickets, veg.queued?.lockedAsInvoiced]).toEqual([[], 0, 0]);
      // One request, one piece of work: the pay item and its rate, each audited with Dana.
      const audited = await tx.auditRecord.findMany({
        where: { requestId: entered.requestId, tableName: { in: ['pay_item', 'pay_item_rate'] } },
        select: { tableName: true, operation: true, actorId: true },
        orderBy: { tableName: 'asc' },
      });
      expect(audited).toEqual([
        { tableName: 'pay_item', operation: 'INSERT', actorId: who.dana },
        { tableName: 'pay_item_rate', operation: 'INSERT', actorId: who.dana },
      ]);
      const staged = saved(
        createPayItemEndpoint,
        await payItem({
          code: 'WG-FRN-EA-STG',
          description: 'Freon staged',
          payableTypeId: await payableType('White Goods'),
          unit: 'EA',
          rates: [],
        }),
      ).record;
      expect(await tx.payItemRate.count({ where: { payItemId: staged.id } })).toBe(0);

      const ids = { payItemId: veg.record.id, primeId: coastline };
      const changed = await ask(api, dana, setPayItemRateEndpoint, {
        ids,
        payload: { rate: '7.80' },
      });
      const rate = saved(setPayItemRateEndpoint, changed);
      expect(rate.record).toEqual({
        id: rate.record.id,
        payItemId: veg.record.id,
        primeId: coastline,
        rate: '7.80',
        archived: false,
      });
      expect(rate.queued?.tickets).toBe(0);
      expect(await tx.payItemRate.count({ where: { payItemId: veg.record.id } })).toBe(1);
      const before = await tx.auditRecord.findFirstOrThrow({
        where: { requestId: changed.requestId, tableName: 'pay_item_rate' },
      });
      expect([before.operation, before.actorId, JSON.stringify(before.priorValue)]).toEqual([
        'UPDATE',
        who.dana,
        expect.stringMatching(/"rate":\s*"?7\.5/),
      ]);
      // A rate is an exact decimal, never a float, a sign, a comma or a fifth place.
      for (const bad of [7.8, '-7.80', '7,80', '7.80000', '', '$7.80']) {
        expect(
          told(await ask(api, dana, setPayItemRateEndpoint, { ids, payload: { rate: bad } })),
          String(bad),
        ).toEqual([400, 'BAD_REQUEST']);
      }
      expect(
        (
          await tx.payItemRate.findFirstOrThrow({ where: { payItemId: veg.record.id } })
        ).rate.toFixed(2),
      ).toBe('7.80');
    });
  });

  it('AC-01-45, 46, 47, AC-01-80 size bands: a third Leaners band of 20–30 in is refused in the domain’s words, naming the bands it overlaps, and saves nothing; a Stumps band of 40–48 in beside 24–36 in is saved, and she is warned that 36.1–39.9 in falls in no band', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { each, kindOfWork } = await p1Priced(api, dana, tx);
      const leaners24 = saved(
        createPayItemEndpoint,
        await each('LNR-RMV-EA-24', 'Leaner removal 6–24 in', 'Leaners', '95.00', {
          from: 6,
          to: 24,
        }),
      ).record;
      expect([leaners24.kindOfWorkId, leaners24.bandFrom, leaners24.bandTo]).toEqual([
        await kindOfWork('Leaners'),
        6,
        24,
      ]);
      saved(
        createPayItemEndpoint,
        await each('LNR-RMV-EA-99', 'Leaner removal 24.1–99 in', 'Leaners', '185.00', {
          from: 24.1,
          to: 99,
        }),
      );
      const third = await each('LNR-RMV-EA-30', 'Leaner removal 20–30 in', 'Leaners', '120.00', {
        from: 20,
        to: 30,
      });
      expect(notSaved(third)).toEqual([
        'SIZE_BAND_OVERLAP',
        "Leaners: 20–30 in overlaps LNR-RMV-EA-24 (6–24 in) and LNR-RMV-EA-99 (24.1–99 in). Bands of one payable type can't overlap.",
      ]);
      expect(await tx.payItem.count({ where: { code: 'LNR-RMV-EA-30' } })).toBe(0);
      expect(api.lines.join('\n')).toContain('"why":"SIZE_BAND_OVERLAP"');

      saved(
        createPayItemEndpoint,
        await each('STP-RMV-EA-36', 'Stump removal 24–36 in', 'Stumps', '110.00', {
          from: 24,
          to: 36,
        }),
      );
      const gap = saved(
        createPayItemEndpoint,
        await each('STP-RMV-EA-48', 'Stump removal 40–48 in', 'Stumps', '175.00', {
          from: 40,
          to: 48,
        }),
      );
      expect(gap.warnings).toEqual([
        {
          code: 'SIZE_BAND_GAP',
          message:
            'Stumps: 36.1–39.9 in falls in no band; a measurement there gets no pay item and is flagged. Saved as it is.',
        },
      ]);
    });
  });

  it('AC-01-48, 78 a pay item is changed (ADR-425): its description, its band and a capture setting, audited with the values before; a band moved onto another’s is refused in the domain’s words; its payable type and kind of work are no part of a change; a pay item nobody has is not found', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const { each, payableType } = await p1Priced(api, dana, tx);
      const leaners24 = saved(
        createPayItemEndpoint,
        await each('LNR-RMV-EA-24', 'Leaner removal 6–24 in', 'Leaners', '95.00', {
          from: 6,
          to: 24,
        }),
      ).record;
      const leaners99 = saved(
        createPayItemEndpoint,
        await each('LNR-RMV-EA-99', 'Leaner removal 24.1–99 in', 'Leaners', '185.00', {
          from: 24.1,
          to: 99,
        }),
      ).record;
      const ids = { payItemId: leaners24.id };
      const answer = await ask(api, dana, changePayItemEndpoint, {
        ids,
        payload: {
          description: 'Leaner removal 6–23.9 in',
          bandTo: 23.9,
          monitorMayMarkIneligible: true,
        },
      });
      const changed = saved(changePayItemEndpoint, answer);
      expect(changed.record).toEqual({
        ...leaners24,
        description: 'Leaner removal 6–23.9 in',
        bandTo: 23.9,
        monitorMayMarkIneligible: true,
      });
      // 24 in now falls between the two bands: saved, with the warning.
      expect(changed.warnings.map(({ code }) => code)).toEqual(['SIZE_BAND_GAP']);
      expect(changed.queued?.tickets).toBe(0);
      const audited = await tx.auditRecord.findFirstOrThrow({
        where: { requestId: answer.requestId, tableName: 'pay_item' },
      });
      expect([audited.operation, audited.actorId]).toEqual(['UPDATE', who.dana]);
      expect(JSON.stringify(audited.priorValue)).toContain('Leaner removal 6–24 in');

      const onto = await ask(api, dana, changePayItemEndpoint, { ids, payload: { bandTo: 30 } });
      expect(notSaved(onto)).toEqual([
        'SIZE_BAND_OVERLAP',
        "Leaners: 6–30 in overlaps LNR-RMV-EA-99 (24.1–99 in). Bands of one payable type can't overlap.",
      ]);
      const backwards = await ask(api, dana, changePayItemEndpoint, {
        ids: { payItemId: leaners99.id },
        payload: { bandFrom: 120 },
      });
      expect(notSaved(backwards)[0]).toBe('SIZE_BAND_INVALID');
      for (const payload of [
        {},
        { payableTypeId: await payableType('Stumps') },
        { kindOfWorkId: null },
        { rate: '99.00' },
        { code: '   ' },
      ]) {
        expect(told(await ask(api, dana, changePayItemEndpoint, { ids, payload }))).toEqual([
          400,
          'BAD_REQUEST',
        ]);
      }
      expect(
        told(await ask(api, dana, changePayItemEndpoint, { payload: { photosRequired: false } })),
      ).toEqual([404, 'NOT_FOUND']);
      expect(
        (await tx.payItem.findUniqueOrThrow({ where: { id: leaners24.id } })).bandTo?.toNumber(),
      ).toBe(23.9);
    });
  });
});

describe('step 8: "Pays when" and the rule builder through the endpoints', () => {
  it('AC-01-66 HNG-RMV-EA’s "Pays when" on the unit rate form writes one rule naming Coastline’s contract, named from the pay item and marked as its own; saved again unchanged it is left alone; the pay item’s description corrected, the rule is renamed with it; the rule builder may not change it; with no form named the rule is archived, never deleted', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { each, forms, contract } = await p1Priced(api, dana, tx);
      const hangers = saved(
        createPayItemEndpoint,
        await each('HNG-RMV-EA', 'Hanger removal', 'Hangers', '68.00'),
      ).record;
      const ids = { payItemId: hangers.id };
      const pays = [
        {
          formId: forms.unitRate,
          slot: 1,
          criteria: [{ criterion: 'PAY_ITEM', operator: 'EQUALS', picks: [hangers.id] }],
        },
      ];
      const first = saved(
        savePaysWhenEndpoint,
        await ask(api, dana, savePaysWhenEndpoint, { ids, payload: { pays } }),
      );
      expect([
        first.record.added.length,
        first.record.changed,
        first.record.archived,
        first.record.unchanged,
        first.warnings,
        first.queued?.tickets,
      ]).toEqual([1, [], [], [], [], 0]);
      const ruleId = first.record.added[0] ?? '';
      const written = () =>
        tx.rule.findUniqueOrThrow({
          where: { id: ruleId },
          select: {
            name: true,
            formId: true,
            contractId: true,
            active: true,
            fromPayItemId: true,
            archivedAt: true,
          },
        });
      expect(await written()).toEqual({
        name: 'HNG-RMV-EA - Hanger removal',
        formId: forms.unitRate,
        contractId: contract,
        active: true,
        fromPayItemId: hangers.id,
        archivedAt: null,
      });
      const again = saved(
        savePaysWhenEndpoint,
        await ask(api, dana, savePaysWhenEndpoint, { ids, payload: { pays } }),
      );
      // Nothing changed: nothing is queued, and the answer says so by saying nothing.
      expect([again.record, again.queued]).toEqual([
        { added: [], changed: [], archived: [], unchanged: [ruleId] },
        undefined,
      ]);
      saved(
        changePayItemEndpoint,
        await ask(api, dana, changePayItemEndpoint, {
          ids,
          payload: { description: 'Hanger removal, 2 in and over' },
        }),
      );
      expect((await written()).name).toBe('HNG-RMV-EA - Hanger removal, 2 in and over');

      const fromTheBuilder = await ask(api, dana, changeRuleEndpoint, {
        ids: { ruleId },
        payload: {
          formId: forms.unitRate,
          name: 'Hangers',
          contractId: contract,
          active: false,
          criteria: pays[0]?.criteria,
          actions: [{ kind: 'ADD_TRANSACTION', slot: 1, payItemId: hangers.id }],
        },
      });
      expect(notSaved(fromTheBuilder)).toEqual([
        'RULE_FROM_PAY_ITEM',
        'Not saved: this rule is from pay item HNG-RMV-EA. Change it on the pay item.',
      ]);
      expect((await written()).active).toBe(true);

      const none = saved(
        savePaysWhenEndpoint,
        await ask(api, dana, savePaysWhenEndpoint, { ids, payload: { pays: [] } }),
      ).record;
      expect(none).toEqual({ added: [], changed: [], archived: [ruleId], unchanged: [] });
      expect((await written()).archivedAt).not.toBeNull();
    });
  });

  it('AC-01-60, 61, 81 Dana writes "Debris type EQUALS Vegetative, Mileage AT MOST 15.0 → Add transaction 1, VEG-HAUL-CY-15" on P1’s load form, naming Coastline’s contract: saved, valid; the same rule under another name is refused, naming the rule it copies; with an Add transaction and no contract it is saved, is not valid and says why; stated anew with Active unticked it is changed, never written twice; a rule nobody has is not found', async () => {
    await world(async (api, tx, who) => {
      const dana = await api.signedIn(danasEmail, long);
      const { ids, forms, contract, debrisType, veg15 } = await p1Priced(api, dana, tx);
      const veg = saved(createPayItemEndpoint, await veg15()).record;
      const vegetative = saved(
        addFormDebrisTypeEndpoint,
        await ask(api, dana, addFormDebrisTypeEndpoint, {
          ids: { formId: forms.load },
          payload: {
            debrisTypeId: await debrisType('Vegetative'),
            reduced: false,
            hiddenOnPhones: false,
          },
        }),
      ).record;
      const rule = {
        formId: forms.load,
        name: 'VEG-HAUL-CY-15 - ROW VEG haul 0–15 mi',
        contractId: contract,
        active: true,
        criteria: [
          { criterion: 'DEBRIS_TYPE', operator: 'EQUALS', picks: [vegetative.id] },
          { criterion: 'MILEAGE', operator: 'AT_MOST', numberFrom: 15 },
        ],
        actions: [{ kind: 'ADD_TRANSACTION', slot: 1, payItemId: veg.id }],
      };
      const answer = await ask(api, dana, createRuleEndpoint, { ids, payload: rule });
      const written = saved(createRuleEndpoint, answer);
      expect(written).toMatchObject({
        record: { id: written.record.id, valid: true, reasons: [] },
        warnings: [],
        queued: { tickets: 0, lockedAsInvoiced: 0 },
      });
      const audited = await tx.auditRecord.findMany({
        where: { requestId: answer.requestId, tableName: { startsWith: 'rule' } },
        select: { tableName: true, actorId: true },
      });
      expect(new Set(audited.map((record) => record.actorId))).toEqual(new Set([who.dana]));
      expect(audited.map((record) => record.tableName).sort()).toEqual([
        'rule',
        'rule_action',
        'rule_criterion',
        'rule_criterion',
        'rule_criterion_pick',
      ]);
      expect(
        await tx.rule.findUniqueOrThrow({
          where: { id: written.record.id },
          select: { formId: true, contractId: true, fromPayItemId: true, documentType: true },
        }),
      ).toEqual({
        formId: forms.load,
        contractId: contract,
        fromPayItemId: null,
        documentType: 'LOAD',
      });

      // The same lines in another order, under another name, its Active unticked.
      const copy = await ask(api, dana, createRuleEndpoint, {
        ids,
        payload: {
          ...rule,
          name: 'Vegetative, near',
          active: false,
          criteria: [...rule.criteria].reverse(),
        },
      });
      expect(notSaved(copy)).toEqual([
        'RULE_DUPLICATE',
        'Not saved: this rule is the same as "VEG-HAUL-CY-15 - ROW VEG haul 0–15 mi".',
      ]);
      expect(await tx.rule.count()).toBe(1);

      const noContract = saved(
        createRuleEndpoint,
        await ask(api, dana, createRuleEndpoint, {
          ids,
          payload: { ...rule, name: 'Vegetative, any prime', contractId: null },
        }),
      ).record;
      expect(noContract.valid).toBe(false);
      expect(noContract.reasons.join(' ')).toMatch(/contract/i);

      const off = await ask(api, dana, changeRuleEndpoint, {
        ids: { ruleId: written.record.id },
        payload: { ...rule, active: false },
      });
      expect(saved(changeRuleEndpoint, off).record).toEqual({
        id: written.record.id,
        valid: true,
        reasons: [],
      });
      expect((await tx.rule.findUniqueOrThrow({ where: { id: written.record.id } })).active).toBe(
        false,
      );
      expect(await tx.rule.count()).toBe(2);

      // A body's own shape: an operator, a criterion or an action nobody has, a transaction #
      // under 1, a field nobody named.
      for (const payload of [
        { ...rule, criteria: [{ criterion: 'MILEAGE', operator: 'UNDER', numberFrom: 15 }] },
        { ...rule, criteria: [{ criterion: 'LOAD_CALL', operator: 'AT_MOST', numberFrom: 5 }] },
        { ...rule, actions: [{ kind: 'FLAG_TICKET' }] },
        { ...rule, actions: [{ kind: 'ADD_TRANSACTION', slot: 0, payItemId: veg.id }] },
        { ...rule, actions: [{ kind: 'ADD_TRANSACTION', slot: 1, payItemId: veg.id, rate: '9' }] },
        { ...rule, projectId: randomUUID() },
      ]) {
        expect(told(await ask(api, dana, createRuleEndpoint, { ids, payload }))).toEqual([
          400,
          'BAD_REQUEST',
        ]);
      }
      expect(
        told(await ask(api, dana, changeRuleEndpoint, { payload: { ...rule, name: 'Nobody’s' } })),
      ).toEqual([404, 'NOT_FOUND']);
      expect(await tx.rule.count()).toBe(2);
    });
  });

  it('AC-01-65 two load rules that both add transaction 1, Mileage BETWEEN 0 and 15 and BETWEEN 15 and 30: both are saved, and she is warned that the ranges overlap at 15.0', async () => {
    await world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const { ids, forms, contract, veg15 } = await p1Priced(api, dana, tx);
      const veg = saved(createPayItemEndpoint, await veg15()).record;
      const between = (name: string, numberFrom: number, numberTo: number) =>
        ask(api, dana, createRuleEndpoint, {
          ids,
          payload: {
            formId: forms.load,
            name,
            contractId: contract,
            active: true,
            criteria: [{ criterion: 'MILEAGE', operator: 'BETWEEN', numberFrom, numberTo }],
            actions: [{ kind: 'ADD_TRANSACTION', slot: 1, payItemId: veg.id }],
          },
        });
      expect(saved(createRuleEndpoint, await between('Near', 0, 15)).warnings).toEqual([]);
      const far = saved(createRuleEndpoint, await between('Far', 15, 30));
      expect(far.record.valid).toBe(true);
      expect(far.warnings).toEqual([
        {
          code: 'RULES_OVERLAP',
          message:
            '"Far" and "Near" both add transaction 1, and their Mileage ranges overlap at 15.0. A ticket that meets both is flagged, and neither bills. Saved as it is.',
        },
      ]);
      expect(await tx.rule.count()).toBe(2);
    });
  });
});

describe('each service asks again inside its own piece of work (ADR-364)', () => {
  it('called as a manager/analyst without Setup or as a read-only viewer, the form, pay item and rule services change nothing', async () => {
    await world(async (_api, tx, who, within) => {
      const clock = { now: () => new Date('2026-10-12T14:00:00Z') };
      const forms = new FormSetup(within, clock);
      const payItems = new PayItemSetup(within, clock, shippedPolicy);
      const rules = new RuleSetup(within, clock, shippedPolicy);
      const none = randomUUID();
      for (const caller of [who.luis, who.viewer, who.kim]) {
        const outcomes = [
          await forms.form(caller, {
            projectId: none,
            documentType: 'LOAD',
            name: 'Load',
            enabled: true,
          }),
          await forms.debrisType(caller, {
            formId: none,
            debrisTypeId: none,
            reduced: false,
            hiddenOnPhones: false,
          }),
          await forms.ownFields(caller, none, []),
          await payItems.change(caller, none, { photosRequired: true }),
          await payItems.rate(caller, none, none, '7.50'),
          await payItems.paysWhen(caller, none, []),
          await rules.change(caller, none, {
            formId: none,
            name: 'Nobody’s',
            contractId: null,
            active: true,
            criteria: [],
            actions: [],
          }),
        ];
        expect(
          outcomes.map((outcome) => (outcome.saved ? 'saved' : outcome.refusal.code)),
          caller,
        ).toEqual(Array(7).fill('NOT_ALLOWED'));
      }
      expect([await tx.form.count(), await tx.payItem.count(), await tx.rule.count()]).toEqual([
        0, 0, 0,
      ]);
    });
  });
});

describe('a refusal by the database’s own constraints is answered plainly, never as an internal error', () => {
  const refused = (
    said: [number, string, string],
    work: (api: Served, dana: Browser, p1: Awaited<ReturnType<typeof p1Priced>>) => Promise<Answer>,
  ) =>
    world(async (api, tx) => {
      const dana = await api.signedIn(danasEmail, long);
      const answer = await work(api, dana, await p1Priced(api, dana, tx));
      expect([answer.status, answer.code, plainly(answer)]).toEqual(said);
      expect(api.lines.join('\n')).not.toContain('"level":"error"');
    });

  it('AC-10-38, AC-01-80 a second rate for Coastline on VEG-HAUL-CY-15: the pay item entered with Coastline’s rate twice', async () => {
    await refused(
      [409, 'ALREADY_HELD', 'Not saved: that prime already has a rate on the pay item.'],
      async (_api, _dana, { payItem, payableType, coastline }) =>
        payItem({
          code: 'VEG-HAUL-CY-15',
          description: 'ROW VEG haul 0–15 mi',
          payableTypeId: await payableType('Vegetative'),
          unit: 'CY',
          rates: [
            { primeId: coastline, rate: '7.50' },
            { primeId: coastline, rate: '7.80' },
          ],
        }),
    );
  });

  it('AC-01-41, AC-01-80 a pay item code the project already has: a second VEG-HAUL-CY-15, whatever its description', async () => {
    await refused(
      [409, 'ALREADY_HELD', 'Not saved: the project already has a pay item with that code.'],
      async (_api, _dana, { payItem, payableType, veg15 }) => {
        saved(createPayItemEndpoint, await veg15());
        return payItem({
          code: 'VEG-HAUL-CY-15',
          description: 'ROW VEG haul, again',
          payableTypeId: await payableType('Vegetative'),
          unit: 'CY',
          rates: [],
        });
      },
    );
  });

  it('AC-01-22, AC-01-80 a second form of one document type: a second load form on P1', async () => {
    await refused(
      [409, 'ALREADY_HELD', 'Not saved: the project already has a form for that document type.'],
      (api, dana, { ids }) =>
        ask(api, dana, createFormEndpoint, {
          ids,
          payload: { documentType: 'LOAD', name: 'Load, again', enabled: true },
        }),
    );
  });

  it('AC-01-80 a debris type on a form that isn’t a load or haul-out form', async () => {
    await refused(
      [
        422,
        'REFUSED_BY_THE_DATABASE',
        'Not saved: a debris type goes on a load or a haul-out form.',
      ],
      async (api, dana, { forms, debrisType }) =>
        ask(api, dana, addFormDebrisTypeEndpoint, {
          ids: { formId: forms.unitRate },
          payload: {
            debrisTypeId: await debrisType('Vegetative'),
            reduced: false,
            hiddenOnPhones: false,
          },
        }),
    );
  });

  it('AC-01-80 the firm’s own fields on a load form', async () => {
    await refused(
      [
        422,
        'REFUSED_BY_THE_DATABASE',
        'Not saved: only an ROE, survey, incident or drop-off log form takes the firm’s own fields.',
      ],
      (api, dana, { forms }) =>
        ask(api, dana, addFormDefinitionEndpoint, {
          ids: { formId: forms.load },
          payload: {
            fields: [
              {
                id: 'police-report-number',
                label: 'Police report number',
                type: 'TEXT',
                required: false,
              },
            ],
          },
        }),
    );
  });

  it('AC-01-30 "GPS required" stated on a form that isn’t the ROE form', async () => {
    await refused(
      [
        422,
        'REFUSED_BY_THE_DATABASE',
        'Not saved: "GPS required" is stated on an ROE form, and on no other.',
      ],
      (api, dana, { ids }) =>
        ask(api, dana, createFormEndpoint, {
          ids,
          payload: { documentType: 'SURVEY', name: 'Survey', enabled: true, gpsRequired: true },
        }),
    );
  });

  it('AC-01-42 a rate for a contractor who isn’t one of the project’s primes: Summit, not yet added to P1', async () => {
    await refused(
      [422, 'UNKNOWN_RECORD', 'Not saved: a rate is for one of the project’s primes.'],
      async (api, dana, { contractor, veg15 }) => {
        const veg = saved(createPayItemEndpoint, await veg15()).record;
        return ask(api, dana, setPayItemRateEndpoint, {
          ids: { payItemId: veg.id, primeId: await contractor('Summit Debris Services') },
          payload: { rate: '7.80' },
        });
      },
    );
  });

  it('AC-01-50 a crew-time conversion on a pay item that isn’t by the hour or the crew day (BACKLOG C97)', async () => {
    await refused(
      [
        422,
        'REFUSED_BY_THE_DATABASE',
        'Not saved: a pay item by the hour converts crew time per hour, one by the crew day per day, and no other pay item has a conversion.',
      ],
      async (api, dana, { veg15 }) => {
        const veg = saved(createPayItemEndpoint, await veg15()).record;
        return ask(api, dana, changePayItemEndpoint, {
          ids: { payItemId: veg.id },
          payload: { crewTimeConversion: 'PER_HOUR' },
        });
      },
    );
  });

  it('AC-01-64 a criterion with an operator its kind of value doesn’t take: Mileage CONTAINS', async () => {
    await refused(
      [
        422,
        'REFUSED_BY_THE_DATABASE',
        'Not saved: a criterion has an operator its kind of value doesn’t take.',
      ],
      async (api, dana, { ids, forms, contract, veg15 }) => {
        const veg = saved(createPayItemEndpoint, await veg15()).record;
        return ask(api, dana, createRuleEndpoint, {
          ids,
          payload: {
            formId: forms.load,
            name: 'Near',
            contractId: contract,
            active: true,
            criteria: [{ criterion: 'MILEAGE', operator: 'CONTAINS', text: '15' }],
            actions: [{ kind: 'ADD_TRANSACTION', slot: 1, payItemId: veg.id }],
          },
        });
      },
    );
  });

  it('AC-01-64 a picked value that isn’t on the project: a debris type no form of P1 has', async () => {
    await refused(
      [422, 'UNKNOWN_RECORD', 'Not saved: a debris type a rule picks is one on the rule’s form.'],
      async (api, dana, { ids, forms, contract, veg15 }) => {
        const veg = saved(createPayItemEndpoint, await veg15()).record;
        return ask(api, dana, createRuleEndpoint, {
          ids,
          payload: {
            formId: forms.load,
            name: 'Near',
            contractId: contract,
            active: true,
            criteria: [{ criterion: 'DEBRIS_TYPE', operator: 'EQUALS', picks: [randomUUID()] }],
            actions: [{ kind: 'ADD_TRANSACTION', slot: 1, payItemId: veg.id }],
          },
        });
      },
    );
  });
});
