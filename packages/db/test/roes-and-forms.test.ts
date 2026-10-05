// ROEs and forms (spec/acceptance/04-field-capture.md section H, by scenario ID, and the ROE's
// half of AC-04-82; spec/DATA-MODEL.md §3 "ROEs", §4.1 (2), §4.3, §4.4, §8; ADR-047, 052, 149,
// 150, 156, 160, 181, 184, 188, 236, 278, 292, 293, 294, 327; REQ-105i, 107). An ROE is edited as
// setup is; a survey, an incident and a drop-off log are evidence. None is a ticket's field
// event: none pairs, bills or has a status. Nothing here refuses work over eligibility (ADR-052):
// each refusal is of a record that isn't one. The values are the golden mission's
// (spec/golden/MISSION.md §2, §3); the example world's Ana Brooks and her phone stand in for
// whoever made each record.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import {
  backOfficeFormLike,
  eventInsertOf,
  fieldEventLike,
  formLike,
  insertOf,
  phoneInsertOf,
  photoLike,
  roeLike,
} from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

type Row = Record<string, unknown>;

const systemActor = '00000000-0000-7000-8000-000000000001';

// As the API's login, for Ana's phone at sync.
async function asThePhone(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
}

// As the API's login, for Dana in the back office.
async function asTheBackOffice(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
}

// A record a phone made the id of, as it is received; its id.
async function received(table: string, row: Row): Promise<string> {
  return (await tested.db.one<{ id: string }>(...phoneInsertOf(table, row))).id;
}

// A row the database makes the id of; its id.
async function entered(table: string, row: Row): Promise<string> {
  return (await tested.db.one<{ id: string }>(...insertOf(table, row))).id;
}

// How the database refuses that record: the code, and the constraint it names.
async function refusal(table: string, row: Row): Promise<string> {
  const { code, message } = await tested.db.refused(...phoneInsertOf(table, row));
  const named = /constraint "([^"]+)"/.exec(message);
  return code === refusedBy.check && named ? `${code} ${String(named[1])}` : code;
}

const check = (name: string): string => `${refusedBy.check} ${name}`;

async function columnsOf(table: string): Promise<string[]> {
  return (
    await tested.db.rows<{ name: string }>(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY column_name`,
      [table],
    )
  ).map((column) => column.name);
}

// A value of one of the firm's lists, by its name or its built-in key.
async function listed(table: string, by: 'name' | 'key', value: string): Promise<string> {
  return (
    await tested.db.one<{ id: string }>(
      `SELECT "id"::text AS id FROM "${table}" WHERE "${by}" = $1`,
      [value],
    )
  ).id;
}

// A form on a project, as Dana writes it: the ROE form alone states "GPS required", the incident
// form alone what an incident offers (all three, as on an ROE project).
async function formOn(projectId: string, documentType: string): Promise<string> {
  return entered('form', {
    project_id: projectId,
    name: `A ${documentType} form`,
    document_type: documentType,
    enabled: true,
    ...(documentType === 'ROE' ? { gps_required: true } : {}),
    ...(documentType === 'INCIDENT'
      ? { incident_offers: '{CONTRACTOR,CERT_NUMBER,ROE_NUMBER}' }
      : {}),
  });
}

// P2's load form with Vegetative on it, as Luis sets P2 up (the example world's P2 has no form).
async function p2LoadForm(): Promise<{ form: string; vegetative: string }> {
  const form = await formOn(tested.world.p2, 'LOAD');
  const vegetative = await entered('form_debris_type', {
    form_id: form,
    document_type: 'LOAD',
    debris_type_id: await listed('debris_type', 'name', 'Vegetative'),
    reduced: false,
    hidden_on_phones: false,
  });
  return { form, vegetative };
}

const policeReport = {
  id: 'police-report-number',
  label: 'Police report number',
  type: 'TEXT',
  required: false,
};

// A version of a form's definition, as Dana adds it.
async function definition(
  formId: string,
  documentType: string,
  version: number,
  fields: unknown[],
): Promise<string> {
  return entered('form_definition', {
    form_id: formId,
    document_type: documentType,
    version,
    fields: JSON.stringify(fields),
    created_by_id: tested.world.admin,
  });
}

// The firm's own fields answered on a record: the answers, the definition's version, and that
// version's form and document type again.
const answered = (
  formId: string,
  documentType: string,
  definitionId: string,
  answers: Row,
): Row => ({
  answers: JSON.stringify(answers),
  form_definition_id: definitionId,
  form_id: formId,
  form_document_type: documentType,
});

// What Ana's phone sends from P2, where she works under her other assignment.
const onP2 = (more: Row = {}): Row => ({
  project_id: tested.world.p2,
  assignment_id: tested.world.assignments.p2,
  ...more,
});

// ROE `R-0008`, 416 Cedar Ct, made on the same phone a quarter of an hour after `R-0007`.
const r0008: Row = {
  roe_number: 'R-0008',
  parcel_id: 'APN 14-0321-008',
  address: '416 Cedar Ct',
  owner_name: 'Ben Whitaker',
  made_at: '2026-10-09T14:30:00Z',
};

async function roe(more: Row = {}): Promise<string> {
  return received('roe', roeLike(tested.world, more));
}

// A survey of 412 Cedar Ct on P2, on ROE `R-0007`.
async function survey(workType: 'PRE_WORK' | 'POST_WORK', more: Row = {}): Promise<Row> {
  return formLike(
    tested.world,
    onP2({
      work_type_id: await listed('survey_work_type', 'key', workType),
      survey_number: 'APN 14-0321-007',
      roe_number: 'R-0007',
      made_at: workType === 'PRE_WORK' ? '2026-10-09T14:40:00Z' : '2026-10-12T18:10:00Z',
      ...more,
    }),
  );
}

// The incident of Tuesday 13 October 2026 at 11:50: Property damage, 22 Elm St.
async function incident(more: Row = {}): Promise<Row> {
  return formLike(tested.world, {
    incident_type_id: await listed('incident_type', 'name', 'Property damage'),
    address: '22 Elm St',
    parties: 'Coastline Haulers LLC, truck 730416; the owner of 22 Elm St',
    description: 'The truck struck the mailbox while backing out.',
    ...more,
  });
}

// A resident's drop-off at Marsh Road TDSR on Tuesday at 15:20.
const dropOff = (more: Row = {}): Row =>
  formLike(tested.world, {
    site_id: tested.world.site,
    made_at: '2026-10-13T19:20:00Z',
    ...more,
  });

describe('an ROE', () => {
  it('AC-04-80 is a record of its project with its number, once: its parcel, owner and signed date, a photograph of the signed form, and whether a phone or the back office made it', async () => {
    const { db, world } = tested;
    await asThePhone();
    const id = await roe();
    expect(
      await db.one(
        `SELECT "project_id"::text AS project, "roe_number", "parcel_id", "address", "owner_name",
           "signed", "signed_date"::text AS signed_date, "source"::text AS source,
           "made_by_id"::text AS made_by, "device_id"::text AS device,
           "assignment_id"::text AS assignment, "made_at", "device_utc_offset_minutes",
           "received_at" IS NOT NULL AS received
         FROM "roe" WHERE "id" = $1`,
        [id],
      ),
    ).toEqual({
      project: world.p2,
      roe_number: 'R-0007',
      parcel_id: 'APN 14-0321-007',
      address: '412 Cedar Ct',
      owner_name: 'Rosa Delgado',
      signed: true,
      signed_date: '2026-10-09',
      source: 'DEVICE',
      made_by: world.monitor,
      device: world.device,
      assignment: world.assignments.p2,
      made_at: new Date('2026-10-09T14:15:00Z'),
      device_utc_offset_minutes: -240,
      received: true,
    });
    await received('photo', photoLike(world, { project_id: world.p2, roe_id: id }));
    // A second R-0007 on P2 is refused; the same number on P1 is P1's own.
    expect(await refusal('roe', roeLike(world, { address: '416 Cedar Ct' }))).toBe(
      refusedBy.unique,
    );
    await roe({ project_id: world.p1, assignment_id: world.assignments.p1 });
    // The back office makes one too, typed off the paper, and the record says which.
    await asTheBackOffice();
    const typed = await entered(
      'roe',
      roeLike(world, {
        roe_number: 'ROE 2026-0412',
        source: 'BACK_OFFICE',
        made_by_id: world.admin,
        device_id: null,
        assignment_id: null,
        device_utc_offset_minutes: null,
      }),
    );
    expect(
      await db.one(`SELECT "roe_number", "source"::text AS source FROM "roe" WHERE "id" = $1`, [
        typed,
      ]),
    ).toEqual({ roe_number: 'ROE 2026-0412', source: 'BACK_OFFICE' });
    // Set up for the project with its number alone, its details filled in later (ADR-294).
    const bare = await entered('roe', {
      project_id: world.p2,
      roe_number: 'R-0009',
      signed: false,
      answers: '{}',
      source: 'BACK_OFFICE',
    });
    await asThePhone();
    expect(
      await db.run(
        `UPDATE "roe" SET "owner_name" = 'Ben Whitaker', "signed" = true, "signed_date" = '2026-10-09'
         WHERE "id" = $1`,
        [bare],
      ),
    ).toBe(1);
  });

  it('AC-04-80 an ROE that isn’t one is refused: no number, a phone’s with no phone, a back-office one with a phone, half a fix, the system actor as its maker', async () => {
    const { world } = tested;
    await asThePhone();
    const like = (more: Row): Row => roeLike(world, { roe_number: 'R-0010', ...more });
    expect(await refusal('roe', like({ roe_number: '  ' }))).toBe(check('roe_number_check'));
    for (const missing of ['made_by_id', 'device_id', 'assignment_id', 'made_at']) {
      expect(await refusal('roe', like({ [missing]: null })), missing).toBe(
        check('roe_source_check'),
      );
    }
    expect(await refusal('roe', like({ source: 'BACK_OFFICE' }))).toBe(check('roe_source_check'));
    expect(await refusal('roe', like({ made_by_id: systemActor }))).toBe(
      check('roe_made_by_check'),
    );
    expect(await refusal('roe', like({ longitude: null }))).toBe(check('roe_gps_check'));
    expect(await refusal('roe', like({ latitude: '91.00000000' }))).toBe(check('roe_gps_check'));
    // No fix at all, and an ROE nobody signed, are taken: each is a flag's or the phone's to ask.
    await roe({ roe_number: 'R-0010', latitude: null, longitude: null });
    await roe({ roe_number: 'R-0011', signed: false, signed_date: null });
  });

  it('AC-04-81 its scope is picked from what the project already has: a debris type on its load form or a payable type, each once, with an optional count; nothing typed', async () => {
    const { db, world } = tested;
    await asTheBackOffice();
    const { form, vegetative } = await p2LoadForm();
    await asThePhone();
    const r0007 = await roe();
    const line = (more: Row): Row => ({ project_id: world.p2, roe_id: r0007, ...more });
    const debrisType = {
      form_debris_type_id: vegetative,
      form_id: form,
      form_document_type: 'LOAD',
    };
    await entered('roe_scope_item', line(debrisType));
    const leaners = await entered(
      'roe_scope_item',
      line({ payable_type_id: world.payableTypes.leaners, count: 3 }),
    );
    expect(
      await db.rows(
        `SELECT "form_debris_type_id"::text AS debris_type, "payable_type_id"::text AS payable_type,
           "count" FROM "roe_scope_item" WHERE "roe_id" = $1 ORDER BY "count" NULLS FIRST`,
        [r0007],
      ),
    ).toEqual([
      { debris_type: vegetative, payable_type: null, count: null },
      { debris_type: null, payable_type: world.payableTypes.leaners, count: 3 },
    ]);
    // Each once per ROE.
    expect(await db.refused(...insertOf('roe_scope_item', line(debrisType)))).toMatchObject({
      code: refusedBy.unique,
    });
    expect(
      await db.refused(
        ...insertOf('roe_scope_item', line({ payable_type_id: world.payableTypes.leaners })),
      ),
    ).toMatchObject({ code: refusedBy.unique });
    const refused = async (more: Row): Promise<string> => {
      const { code, message } = await db.refused(...insertOf('roe_scope_item', line(more)));
      const named = /constraint "([^"]+)"/.exec(message);
      return code === refusedBy.check && named ? `${code} ${String(named[1])}` : code;
    };
    const pick = check('roe_scope_item_pick_check');
    // Exactly one of the two; no column takes typed words.
    expect(await refused({})).toBe(pick);
    expect(await refused({ ...debrisType, payable_type_id: world.payableTypes.hangers })).toBe(
      pick,
    );
    expect(await refused({ form_debris_type_id: vegetative })).toBe(pick);
    expect(await columnsOf('roe_scope_item')).toEqual([
      'archived_at',
      'count',
      'created_at',
      'form_debris_type_id',
      'form_document_type',
      'form_id',
      'id',
      'payable_type_id',
      'project_id',
      'roe_id',
    ]);
    // P1's entry said to be on P2's form.
    expect(
      await refused({ ...debrisType, form_debris_type_id: world.formDebrisTypes.vegetative }),
    ).toBe(refusedBy.foreignKey);
    // A debris type of P1's load form isn't P2's to pick; nor is one on a haul-out form.
    expect(
      await refused({
        form_debris_type_id: world.formDebrisTypes.vegetative,
        form_id: world.forms.load,
        form_document_type: 'LOAD',
      }),
    ).toBe(refusedBy.foreignKey);
    expect(await refused({ ...debrisType, form_document_type: 'HAUL_OUT' })).toBe(pick);
    // A scope line belongs to an ROE of its own project.
    expect(
      (
        await db.refused(
          ...insertOf('roe_scope_item', {
            project_id: world.p1,
            roe_id: r0007,
            payable_type_id: world.payableTypes.hangers,
          }),
        )
      ).code,
    ).toBe(refusedBy.foreignKey);
    expect(await refused({ payable_type_id: world.payableTypes.hangers, count: 0 })).toBe(
      check('roe_scope_item_count_check'),
    );
    // A line is taken off by archiving, never deleted; an ROE with no line is taken as it is.
    expect(
      await db.run(`UPDATE "roe_scope_item" SET "archived_at" = now() WHERE "id" = $1`, [leaners]),
    ).toBe(1);
    expect((await db.refused(`DELETE FROM "roe_scope_item" WHERE "id" = $1`, [leaners])).code).toBe(
      refusedBy.grant,
    );
    const r0008Id = await roe(r0008);
    expect(
      (
        await db.one<{ lines: number }>(
          `SELECT count(*)::int AS lines FROM "roe_scope_item" WHERE "roe_id" = $1`,
          [r0008Id],
        )
      ).lines,
    ).toBe(0);
  });

  it('AC-04-82 a collection keeps the ROE number as picked and the ROE it found; a number P2 doesn’t have, and no ROE at all, are taken', async () => {
    const { db, world } = tested;
    await asThePhone();
    const r0007 = await roe();
    const collection = (more: Row): Row =>
      fieldEventLike(
        world,
        onP2({
          cert_number: '730416',
          certification_id: world.certifications.p2c730416,
          ...more,
        }),
      );
    const collected = await db.one<{ id: string }>(
      ...eventInsertOf(
        collection({
          ticket_number: '102001',
          split_suffix: 'A',
          estimate_cy: 12,
          roe_number: 'R-0007',
          roe_id: r0007,
        }),
      ),
    );
    expect(
      await db.one(
        `SELECT "roe_number", "roe_id"::text AS roe FROM "field_event" WHERE "id" = $1`,
        [collected.id],
      ),
    ).toEqual({ roe_number: 'R-0007', roe: r0007 });
    // R-0099 isn't on P2: the number is kept, no ROE is found. And one with no ROE at all.
    await db.run(...eventInsertOf(collection({ ticket_number: '102003', roe_number: 'R-0099' })));
    await db.run(...eventInsertOf(collection({ ticket_number: '102002' })));
    // The ROE found is one of the field event's own project's, on a kind that carries one.
    expect(
      (
        await db.refused(
          ...eventInsertOf(
            fieldEventLike(world, { ticket_number: '101030', roe_number: 'R-0007', roe_id: r0007 }),
          ),
        )
      ).code,
    ).toBe(refusedBy.foreignKey);
    const onADisposal = await db.refused(
      ...eventInsertOf(collection({ kind: 'DISPOSAL', ticket_number: '102004', roe_id: r0007 })),
    );
    expect(onADisposal.code).toBe(refusedBy.check);
    expect(onADisposal.message).toContain('"field_event_roe_check"');
  });
});

describe('a survey', () => {
  it('AC-04-83 records its work type, its ROE as picked and as found, its survey number as typed, who made it, when and where; the post-work survey is its own record and finds the pre-work one by the ROE number', async () => {
    const { db, world } = tested;
    await asThePhone();
    const r0007 = await roe();
    const before = await received('survey', await survey('PRE_WORK', { roe_id: r0007 }));
    const after = await received('survey', await survey('POST_WORK', { roe_id: r0007 }));
    expect(
      await db.one(
        `SELECT t."key" AS work_type, s."survey_number", s."roe_number", s."roe_id"::text AS roe,
           s."monitor_id"::text AS monitor, s."made_at", s."device_utc_offset_minutes",
           s."latitude", s."longitude"
         FROM "survey" s JOIN "survey_work_type" t ON t."id" = s."work_type_id"
         WHERE s."id" = $1`,
        [before],
      ),
    ).toEqual({
      work_type: 'PRE_WORK',
      survey_number: 'APN 14-0321-007',
      roe_number: 'R-0007',
      roe: r0007,
      monitor: world.monitor,
      made_at: new Date('2026-10-09T14:40:00Z'),
      device_utc_offset_minutes: -240,
      latitude: '27.95010000',
      longitude: '-82.44730000',
    });
    expect(after).not.toBe(before);
    expect(
      await db.rows(
        `SELECT pre."id"::text AS id FROM "survey" post
         JOIN "survey" pre ON pre."project_id" = post."project_id"
           AND pre."roe_number" = post."roe_number"
         JOIN "survey_work_type" t ON t."id" = pre."work_type_id" AND t."key" = 'PRE_WORK'
         WHERE post."id" = $1`,
        [after],
      ),
    ).toEqual([{ id: before }]);
    // The ROE found is one of the survey's own project's; a survey with no work type isn't one.
    expect(
      await refusal(
        'survey',
        await survey('PRE_WORK', {
          project_id: world.p1,
          assignment_id: world.assignments.p1,
          roe_id: r0007,
        }),
      ),
    ).toBe(refusedBy.foreignKey);
    expect(await refusal('survey', await survey('PRE_WORK', { work_type_id: null }))).toBe(
      refusedBy.notNull,
    );
  });

  it('AC-04-84 a property’s pre-work and post-work surveys may carry the same survey number: typed as written, from no series, not unique', async () => {
    const { db } = tested;
    await asThePhone();
    await received('survey', await survey('PRE_WORK'));
    await received('survey', await survey('POST_WORK'));
    // A second pre-work survey under the number is taken too: nothing about it is unique.
    await received('survey', await survey('PRE_WORK', { made_at: '2026-10-09T15:00:00Z' }));
    expect(
      (
        await db.one<{ surveys: number }>(
          `SELECT count(*)::int AS surveys FROM "survey" WHERE "survey_number" = 'APN 14-0321-007'`,
        )
      ).surveys,
    ).toBe(3);
    await received('survey', await survey('PRE_WORK', { survey_number: null }));
  });

  it('AC-04-85 a post-work survey on R-0008 with no pre-work survey is taken, and so is one whose ROE number finds no ROE', async () => {
    const { db } = tested;
    await asThePhone();
    const r0008Id = await roe(r0008);
    const after = await received(
      'survey',
      await survey('POST_WORK', {
        roe_number: 'R-0008',
        roe_id: r0008Id,
        survey_number: 'APN 14-0321-008',
      }),
    );
    expect(
      (
        await db.one<{ before: number }>(
          `SELECT count(*)::int AS before FROM "survey" s
           JOIN "survey_work_type" t ON t."id" = s."work_type_id" AND t."key" = 'PRE_WORK'
           WHERE s."roe_number" = 'R-0008'`,
        )
      ).before,
    ).toBe(0);
    const unfound = await received('survey', await survey('POST_WORK', { roe_number: 'R-0099' }));
    expect(
      await db.rows(`SELECT "roe_id" FROM "survey" WHERE "id" = ANY($1)`, [[after, unfound]]),
    ).toHaveLength(2);
  });
});

describe('an incident', () => {
  it('AC-04-86 is kept as a record with its monitor: type, sub-type, address, parties, description, photographs; no ticket number, nothing priced', async () => {
    const { db, world } = tested;
    await asTheBackOffice();
    const propertyDamage = await listed('incident_type', 'name', 'Property damage');
    const mailboxStruck = await entered('incident_sub_type', {
      name: 'Mailbox struck',
      position: 1,
      incident_type_id: propertyDamage,
    });
    await asThePhone();
    const id = await received('incident', await incident({ incident_sub_type_id: mailboxStruck }));
    await received('photo', photoLike(world, { incident_id: id }));
    await received('photo', photoLike(world, { incident_id: id }));
    expect(
      await db.one(
        `SELECT "incident_type_id"::text AS type, "incident_sub_type_id"::text AS sub_type,
           "address", "parties", "description", "monitor_id"::text AS monitor, "made_at",
           (SELECT count(*)::int FROM "photo" WHERE "incident_id" = "incident"."id") AS photographs
         FROM "incident" WHERE "id" = $1`,
        [id],
      ),
    ).toEqual({
      type: propertyDamage,
      sub_type: mailboxStruck,
      address: '22 Elm St',
      parties: 'Coastline Haulers LLC, truck 730416; the owner of 22 Elm St',
      description: 'The truck struck the mailbox while backing out.',
      monitor: world.monitor,
      made_at: new Date('2026-10-13T15:50:00Z'),
      photographs: 2,
    });
    // The record holds no ticket number, status or price. What it may name (the contractor
    // involved, a cert number, an ROE number: ADR-328) is AC-04-99's.
    expect(await columnsOf('incident')).toEqual([
      'address',
      'answers',
      'assignment_id',
      'cert_number',
      'certification_id',
      'contractor_id',
      'created_by_id',
      'created_reason_id',
      'description',
      'device_id',
      'device_utc_offset_minutes',
      'form_definition_id',
      'form_document_type',
      'form_id',
      'id',
      'incident_sub_type_id',
      'incident_type_id',
      'latitude',
      'longitude',
      'made_at',
      'monitor_id',
      'notes',
      'parties',
      'project_id',
      'received_at',
      'roe_id',
      'roe_number',
      'setup_version',
      'source',
    ]);
    // With a type alone it is taken; with none it isn't an incident.
    await received('incident', await incident({ address: null, parties: null, description: null }));
    expect(await refusal('incident', await incident({ incident_type_id: null }))).toBe(
      refusedBy.notNull,
    );
  });

  it('AC-04-87 the answer to the firm’s own field is kept under that field, with the version of the definition answered; a later version changes nothing on it', async () => {
    const { db, world } = tested;
    await asTheBackOffice();
    const versionOne = await definition(world.forms.incident, 'INCIDENT', 1, [policeReport]);
    await asThePhone();
    const answers = { 'police-report-number': 'BCSO-26-104417' };
    const id = await received(
      'incident',
      await incident(answered(world.forms.incident, 'INCIDENT', versionOne, answers)),
    );
    await asTheBackOffice();
    await definition(world.forms.incident, 'INCIDENT', 2, [
      policeReport,
      { id: 'vehicle-towed', label: 'Vehicle towed', type: 'YES_NO', required: true },
    ]);
    expect(
      await db.one(
        `SELECT i."answers", d."version", d."fields" FROM "incident" i
         JOIN "form_definition" d ON d."id" = i."form_definition_id" WHERE i."id" = $1`,
        [id],
      ),
    ).toEqual({ answers, version: 1, fields: [policeReport] });
  });

  it('AC-04-87 answers come with the definition they answered, one of its own project’s form of its kind; with no definition there is nothing to answer', async () => {
    const { world } = tested;
    await asTheBackOffice();
    const versionOne = await definition(world.forms.incident, 'INCIDENT', 1, [policeReport]);
    const surveyForm = await formOn(world.p1, 'SURVEY');
    const surveyFields = await definition(surveyForm, 'SURVEY', 1, [policeReport]);
    const p2Incidents = await formOn(world.p2, 'INCIDENT');
    const p2Fields = await definition(p2Incidents, 'INCIDENT', 1, [policeReport]);
    await asThePhone();
    const answers = { 'police-report-number': 'BCSO-26-104417' };
    const wrong = check('incident_answers_check');
    const tried = async (more: Row): Promise<string> => refusal('incident', await incident(more));
    expect(await tried({ answers: JSON.stringify(answers) })).toBe(wrong);
    expect(await tried({ answers: JSON.stringify([answers]) })).toBe(wrong);
    expect(await tried({ answers: JSON.stringify('BCSO-26-104417') })).toBe(wrong);
    expect(await tried({ answers: JSON.stringify(answers), form_definition_id: versionOne })).toBe(
      wrong,
    );
    // A survey form's definition, said to be the incident form's, and as it is.
    expect(await tried(answered(world.forms.incident, 'INCIDENT', surveyFields, answers))).toBe(
      refusedBy.foreignKey,
    );
    expect(await tried(answered(surveyForm, 'SURVEY', surveyFields, answers))).toBe(wrong);
    // P2's incident form's definition on an incident of P1.
    expect(await tried(answered(p2Incidents, 'INCIDENT', p2Fields, answers))).toBe(
      refusedBy.foreignKey,
    );
    // A definition answered with nothing is taken: its one field isn't required.
    await received(
      'incident',
      await incident(answered(world.forms.incident, 'INCIDENT', versionOne, {})),
    );
    // The same holds on each record with answers, each on its own kind of form.
    const roeForm = await formOnAs(world.p2, 'ROE');
    const roeFields = await definitionAs(roeForm, 'ROE', [policeReport]);
    await received(
      'roe',
      roeLike(world, answered(roeForm, 'ROE', roeFields, { 'police-report-number': 'n/a' })),
    );
    expect(
      await refusal(
        'roe',
        roeLike(world, {
          roe_number: 'R-0012',
          ...answered(p2Incidents, 'INCIDENT', p2Fields, {}),
        }),
      ),
    ).toBe(check('roe_answers_check'));
    expect(
      await refusal('survey', await survey('PRE_WORK', { answers: JSON.stringify(answers) })),
    ).toBe(check('survey_answers_check'));
    expect(await refusal('drop_off_log', dropOff({ answers: JSON.stringify(answers) }))).toBe(
      check('drop_off_log_answers_check'),
    );
  });

  it('AC-04-99 may name the contractor involved, a certification by its cert number and an ROE by its number, each on its own or none: Jo’s names Coastline and truck 730416; one on P2 names all three', async () => {
    const { db, world } = tested;
    await asThePhone();
    const named = (id: string): Promise<unknown> =>
      db.one(
        `SELECT "contractor_id"::text AS contractor, "cert_number",
           "certification_id"::text AS certification, "roe_number", "roe_id"::text AS roe
         FROM "incident" WHERE "id" = $1`,
        [id],
      );
    const none = {
      contractor: null,
      cert_number: null,
      certification: null,
      roe_number: null,
      roe: null,
    };
    // None of the three: the incident as it was before (AC-04-86).
    expect(await named(await received('incident', await incident()))).toEqual(none);
    // The mailbox: Coastline's truck 730416, the cert number as scanned and the certification found.
    const mailbox = await received(
      'incident',
      await incident({
        contractor_id: world.coastline,
        cert_number: '730416',
        certification_id: world.certifications.c730416,
      }),
    );
    expect(await named(mailbox)).toEqual({
      ...none,
      contractor: world.coastline,
      cert_number: '730416',
      certification: world.certifications.c730416,
    });
    // Each on its own: a sub is a contractor on the project too.
    expect(
      await named(await received('incident', await incident({ contractor_id: world.rivera }))),
    ).toEqual({ ...none, contractor: world.rivera });
    expect(
      await named(await received('incident', await incident({ cert_number: '730417' }))),
    ).toEqual({ ...none, cert_number: '730417' });
    // On P2, an ROE project: a fence damaged at 412 Cedar Ct, on ROE R-0007, by P2's own 730416.
    const r0007 = await roe();
    const fence = await received(
      'incident',
      await incident(
        onP2({
          address: '412 Cedar Ct',
          contractor_id: world.coastline,
          cert_number: '730416',
          certification_id: world.certifications.p2c730416,
          roe_number: 'R-0007',
          roe_id: r0007,
        }),
      ),
    );
    expect(await named(fence)).toEqual({
      contractor: world.coastline,
      cert_number: '730416',
      certification: world.certifications.p2c730416,
      roe_number: 'R-0007',
      roe: r0007,
    });
    // P1's incident form offers no ROE number, and an incident of P1 that names one is still
    // taken: what is offered is what a phone shows, never a refusal (ADR-052).
    expect(
      await db.one(`SELECT "incident_offers"::text[] AS offers FROM "form" WHERE "id" = $1`, [
        world.forms.incident,
      ]),
    ).toEqual({ offers: ['CONTRACTOR', 'CERT_NUMBER'] });
    expect(
      await named(await received('incident', await incident({ roe_number: 'R-0031' }))),
    ).toEqual({ ...none, roe_number: 'R-0031' });
    // The back office adds what the monitor left out: a correction.
    await asTheBackOffice();
    await db.run(`UPDATE "incident" SET "contractor_id" = $2 WHERE "id" = $1`, [
      mailbox,
      world.rivera,
    ]);
    expect(await named(mailbox)).toMatchObject({ contractor: world.rivera });
  });

  it('AC-04-100 a number that finds nothing is taken as written; a contractor off the project, or a certification or an ROE of another project, is refused, and so is a found record without its number', async () => {
    const { world } = tested;
    await asThePhone();
    const r0007 = await roe();
    const tried = async (more: Row): Promise<string> => refusal('incident', await incident(more));
    // No certification on P1 has 999999 and no ROE has R-0099: kept, to be looked at later.
    await received('incident', await incident({ cert_number: '999999', roe_number: 'R-0099' }));
    // Harbor Staffing is on no project; Summit is on P1 and not on P2.
    expect(await tried({ contractor_id: world.harbor })).toBe(refusedBy.foreignKey);
    expect(await tried(onP2({ contractor_id: world.summit }))).toBe(refusedBy.foreignKey);
    // P2's own 730416 and P2's R-0007, on an incident of P1.
    expect(
      await tried({ cert_number: '730416', certification_id: world.certifications.p2c730416 }),
    ).toBe(refusedBy.foreignKey);
    expect(await tried({ roe_number: 'R-0007', roe_id: r0007 })).toBe(refusedBy.foreignKey);
    // A found record without the number that found it, and a blank number.
    expect(await tried({ certification_id: world.certifications.c730416 })).toBe(
      check('incident_cert_number_check'),
    );
    expect(await tried(onP2({ roe_id: r0007 }))).toBe(check('incident_roe_number_check'));
    expect(await tried({ cert_number: ' ' })).toBe(check('incident_cert_number_check'));
    expect(await tried({ roe_number: '' })).toBe(check('incident_roe_number_check'));
  });
});

// Dana's setup in the middle of a phone's test: as the back office, then the phone again.
async function formOnAs(projectId: string, documentType: string): Promise<string> {
  await asTheBackOffice();
  const form = await formOn(projectId, documentType);
  await asThePhone();
  return form;
}

async function definitionAs(
  formId: string,
  documentType: string,
  fields: unknown[],
): Promise<string> {
  await asTheBackOffice();
  const id = await definition(formId, documentType, 1, fields);
  await asThePhone();
  return id;
}

describe('a citizen drop-off log', () => {
  it('AC-04-88 records the site, who logged it, the time and GPS and, only if given, the resident’s name and origin address, photographs and notes; no quantity, number, pay item or cost', async () => {
    const { db, world } = tested;
    await asThePhone();
    const id = await received(
      'drop_off_log',
      dropOff({
        resident_name: 'Carl Jensen',
        origin_address: '14 Heron St',
        notes: 'Two pickup loads of limbs.',
      }),
    );
    await received('photo', photoLike(world, { drop_off_log_id: id }));
    expect(
      await db.one(
        `SELECT "site_id"::text AS site, "monitor_id"::text AS monitor, "made_at", "latitude",
           "longitude", "resident_name", "origin_address", "notes"
         FROM "drop_off_log" WHERE "id" = $1`,
        [id],
      ),
    ).toEqual({
      site: world.site,
      monitor: world.monitor,
      made_at: new Date('2026-10-13T19:20:00Z'),
      latitude: '27.95010000',
      longitude: '-82.44730000',
      resident_name: 'Carl Jensen',
      origin_address: '14 Heron St',
      notes: 'Two pickup loads of limbs.',
    });
    // With nothing optional given it is taken.
    await received('drop_off_log', dropOff({ latitude: null, longitude: null }));
    expect(await columnsOf('drop_off_log')).toEqual([
      'answers',
      'assignment_id',
      'created_by_id',
      'created_reason_id',
      'device_id',
      'device_utc_offset_minutes',
      'form_definition_id',
      'form_document_type',
      'form_id',
      'id',
      'latitude',
      'longitude',
      'made_at',
      'monitor_id',
      'notes',
      'origin_address',
      'project_id',
      'received_at',
      'resident_name',
      'setup_version',
      'site_id',
      'source',
    ]);
    // Not checked against the site's facts: one at Bayline County Landfill is taken. The site is
    // one of the log's own project's, and a log names one.
    await received('drop_off_log', dropOff({ site_id: world.landfill }));
    expect(
      await refusal(
        'drop_off_log',
        dropOff({ project_id: world.p2, assignment_id: world.assignments.p2 }),
      ),
    ).toBe(refusedBy.foreignKey);
    expect(await refusal('drop_off_log', dropOff({ site_id: null }))).toBe(refusedBy.notNull);
  });
});

describe('every form', () => {
  const forms: [string, (more: Row) => Promise<Row>][] = [
    ['survey', async (more) => survey('PRE_WORK', more)],
    ['incident', incident],
    ['drop_off_log', (more) => Promise.resolve(dropOff(more))],
  ];
  // The same form as Dana creates it in the back office because the phone failed.
  const fromTheBackOffice = async (
    like: (more: Row) => Promise<Row>,
    more: Row = {},
  ): Promise<Row> => {
    const { world } = tested;
    const own = await like({});
    return {
      ...own,
      ...backOfficeFormLike(world, { project_id: own['project_id'] }),
      ...more,
    };
  };

  it('AC-04-89 says where it came from as a field event does: a phone’s with its monitor, phone, assignment and setup version; one created in the back office with the person and the reason', async () => {
    const { db, world } = tested;
    for (const [table, like] of forms) {
      await asThePhone();
      const fromThePhone = await received(table, await like({}));
      await asTheBackOffice();
      const created = await entered(table, await fromTheBackOffice(like));
      expect(
        await db.rows(
          `SELECT "source"::text AS source, "monitor_id"::text AS monitor,
             "device_id"::text AS device, "assignment_id" IS NOT NULL AS assigned, "setup_version",
             "created_by_id"::text AS created_by, "created_reason_id"::text AS reason
           FROM "${table}" WHERE "id" = ANY($1) ORDER BY "device_id" NULLS LAST`,
          [[fromThePhone, created]],
        ),
        table,
      ).toEqual([
        {
          source: 'DEVICE',
          monitor: world.monitor,
          device: world.device,
          assigned: true,
          setup_version: 1,
          created_by: null,
          reason: null,
        },
        {
          source: 'BACK_OFFICE',
          monitor: world.monitor,
          device: null,
          assigned: false,
          setup_version: null,
          created_by: world.admin,
          reason: world.reasons.deviceFailed,
        },
      ]);
    }
  });

  it('AC-04-89 a form that says neither, or both, isn’t one; nor is one the system actor made or created, or one with half a fix', async () => {
    const { world } = tested;
    for (const [table, like] of forms) {
      await asThePhone();
      const source = check(`${table}_source_check`);
      for (const missing of ['device_id', 'assignment_id', 'setup_version']) {
        expect(await refusal(table, await like({ [missing]: null })), `${table} ${missing}`).toBe(
          source,
        );
      }
      expect(
        await refusal(
          table,
          await like({ created_by_id: world.admin, created_reason_id: world.reasons.deviceFailed }),
        ),
        table,
      ).toBe(source);
      expect(await refusal(table, await like({ monitor_id: systemActor })), table).toBe(
        check(`${table}_monitor_check`),
      );
      expect(await refusal(table, await like({ longitude: null })), table).toBe(
        check(`${table}_gps_check`),
      );
      expect(await refusal(table, await like({ source: null })), table).toBe(refusedBy.notNull);
      await asTheBackOffice();
      for (const more of [
        { created_reason_id: null },
        { created_by_id: null },
        { device_id: world.device },
        { setup_version: 1 },
      ]) {
        expect(
          await refusal(table, await fromTheBackOffice(like, more)),
          `${table} ${Object.keys(more).join()}`,
        ).toBe(source);
      }
      expect(
        await refusal(table, await fromTheBackOffice(like, { created_by_id: systemActor })),
        table,
      ).toBe(check(`${table}_created_by_check`));
    }
  });

  it('AC-04-90 is a record and never a ticket’s field event: no status, no workflow, no ticket number and no price on any of the five', async () => {
    const { db } = tested;
    const never = [
      'status',
      'reconciled_at',
      'workflow',
      'kind',
      'ticket_number',
      'split_suffix',
      'load_call',
      'pay_item_id',
      'quantity',
      'rate',
      'amount',
    ];
    for (const table of ['roe', 'roe_scope_item', 'survey', 'incident', 'drop_off_log']) {
      const columns = await columnsOf(table);
      expect(
        columns.filter((column) => never.includes(column)),
        table,
      ).toEqual([]);
    }
    expect(await columnsOf('survey')).toEqual([
      'answers',
      'assignment_id',
      'created_by_id',
      'created_reason_id',
      'device_id',
      'device_utc_offset_minutes',
      'form_definition_id',
      'form_document_type',
      'form_id',
      'id',
      'latitude',
      'longitude',
      'made_at',
      'monitor_id',
      'notes',
      'project_id',
      'received_at',
      'roe_id',
      'roe_number',
      'setup_version',
      'source',
      'survey_number',
      'work_type_id',
    ]);
    expect(await columnsOf('roe')).toEqual([
      'address',
      'answers',
      'assignment_id',
      'device_id',
      'device_utc_offset_minutes',
      'form_definition_id',
      'form_document_type',
      'form_id',
      'id',
      'latitude',
      'longitude',
      'made_at',
      'made_by_id',
      'notes',
      'owner_name',
      'parcel_id',
      'project_id',
      'received_at',
      'roe_number',
      'signed',
      'signed_date',
      'source',
    ]);
    // No completed record and no transaction points at one of them.
    expect(
      await db.rows(
        `SELECT conrelid::regclass::text AS "table" FROM pg_constraint
         WHERE contype = 'f'
           AND confrelid = ANY (ARRAY['roe', 'survey', 'incident', 'drop_off_log']::regclass[])
           AND conrelid = ANY (ARRAY['completed_load', 'transaction', 'invoice_lock']::regclass[])`,
      ),
    ).toEqual([]);
  });

  it('is corrected by the API and never deleted; the worker reads it and writes none of it; an ROE is edited as setup is', async () => {
    const { db } = tested;
    await asThePhone();
    const r0007 = await roe();
    const logged = await received('drop_off_log', dropOff());
    await asTheBackOffice();
    expect(
      await db.run(`UPDATE "drop_off_log" SET "resident_name" = 'Carl Jensen' WHERE "id" = $1`, [
        logged,
      ]),
    ).toBe(1);
    expect(
      await db.run(`UPDATE "roe" SET "owner_name" = 'Rosa M. Delgado' WHERE "id" = $1`, [r0007]),
    ).toBe(1);
    for (const sql of [
      `DELETE FROM "roe" WHERE "id" = '${r0007}'`,
      `DELETE FROM "drop_off_log" WHERE "id" = '${logged}'`,
      `UPDATE "drop_off_log" SET "received_at" = now()`,
      `UPDATE "drop_off_log" SET "id" = uuidv7()`,
    ]) {
      expect((await db.refused(sql)).code, sql).toBe(refusedBy.grant);
    }
    await db.administer();
    await db.as('adms_worker');
    await db.actor(tested.world.worker, 'SYSTEM');
    expect(await db.rows(`SELECT "id" FROM "roe"`)).toHaveLength(1);
    for (const sql of [
      `UPDATE "roe" SET "signed" = false`,
      `UPDATE "drop_off_log" SET "notes" = 'x'`,
      `UPDATE "survey" SET "notes" = 'x'`,
      `UPDATE "incident" SET "notes" = 'x'`,
      `UPDATE "roe_scope_item" SET "count" = 1`,
    ]) {
      expect((await db.refused(sql)).code, sql).toBe(refusedBy.grant);
    }
  });
});

describe('a form’s photographs (AC-04-76)', () => {
  it('a photograph belongs to an ROE, a survey, an incident or a drop-off log of its own project, and still to exactly one thing', async () => {
    const { db, world } = tested;
    await asThePhone();
    const r0007 = await roe();
    const surveyed = await received('survey', await survey('PRE_WORK', { roe_id: r0007 }));
    const happened = await received('incident', await incident());
    const logged = await received('drop_off_log', dropOff());
    const p2 = { project_id: world.p2 };
    const photographs = [
      await received('photo', photoLike(world, { ...p2, roe_id: r0007 })),
      await received('photo', photoLike(world, { ...p2, survey_id: surveyed })),
      await received('photo', photoLike(world, { incident_id: happened })),
      await received('photo', photoLike(world, { drop_off_log_id: logged })),
    ];
    expect(
      await db.rows(
        `SELECT num_nonnulls("field_event_id", "certification_id", "scale_receipt_id", "roe_id",
           "survey_id", "incident_id", "drop_off_log_id") AS owners
         FROM "photo" WHERE "id" = ANY($1)`,
        [photographs],
      ),
    ).toEqual([{ owners: 1 }, { owners: 1 }, { owners: 1 }, { owners: 1 }]);
    for (const [what, owner] of [
      ['an incident and a drop-off log', { incident_id: happened, drop_off_log_id: logged }],
      ['an ROE and its survey', { ...p2, roe_id: r0007, survey_id: surveyed }],
      [
        'an incident and a certification',
        { incident_id: happened, certification_id: world.certifications.c730415 },
      ],
    ] as const) {
      expect(await refusal('photo', photoLike(world, owner)), what).toBe(
        check('photo_owner_check'),
      );
    }
    for (const [what, owner] of [
      ['an ROE of another project', { roe_id: r0007 }],
      ['a survey of another project', { survey_id: surveyed }],
      ['an incident of another project', { ...p2, incident_id: happened }],
      ['a drop-off log of another project', { ...p2, drop_off_log_id: logged }],
    ] as const) {
      expect(await refusal('photo', photoLike(world, owner)), what).toBe(refusedBy.foreignKey);
    }
    // A view is a certification's photograph's alone.
    expect(await refusal('photo', photoLike(world, { incident_id: happened, view: 'FRONT' }))).toBe(
      check('photo_view_check'),
    );
  });
});

describe('what a viewer sees of ROEs and forms', () => {
  const views = [
    'viewer_roe',
    'viewer_roe_scope_item',
    'viewer_survey',
    'viewer_incident',
    'viewer_drop_off_log',
  ] as const;

  // One of each on P1, as Ana's phone sends them; its ids by view.
  async function written(): Promise<Record<(typeof views)[number], string>> {
    const { world } = tested;
    await asThePhone();
    const onP1 = { project_id: world.p1, assignment_id: world.assignments.p1 };
    const r0007 = await roe(onP1);
    const ids = {
      viewer_roe: r0007,
      viewer_roe_scope_item: await entered('roe_scope_item', {
        project_id: world.p1,
        roe_id: r0007,
        payable_type_id: world.payableTypes.leaners,
      }),
      viewer_survey: await received('survey', await survey('PRE_WORK', { ...onP1, roe_id: r0007 })),
      viewer_incident: await received('incident', await incident()),
      viewer_drop_off_log: await received('drop_off_log', dropOff()),
    };
    await tested.db.administer();
    return ids;
  }

  async function sees(viewerId: string, view: string): Promise<string[]> {
    const { db } = tested;
    await db.viewer(viewerId);
    await db.as('adms_readonly');
    const rows = await db.rows<{ id: string }>(`SELECT "id"::text AS id FROM "${view}" ORDER BY 1`);
    await db.administer();
    return rows.map((row) => row.id);
  }

  it('a client user and an auditor see their projects’ ROEs, scope lines, surveys, incidents and drop-off logs; a contractor user, and a viewer of another project, none', async () => {
    const { db, world } = tested;
    const ids = await written();
    for (const view of views) {
      expect(await sees(world.clientViewer, view), view).toEqual([ids[view]]);
      expect(await sees(world.auditor, view), view).toEqual([ids[view]]);
      expect(await sees(world.coastlineViewer, view), view).toEqual([]);
    }
    // The client user is given P1 only: P2's ROE isn't theirs.
    await asThePhone();
    const onP2Too = await roe(r0008);
    await db.administer();
    expect(await sees(world.clientViewer, 'viewer_roe')).toEqual([ids.viewer_roe]);
    expect(await sees(world.auditor, 'viewer_roe')).toEqual([ids.viewer_roe, onP2Too].sort());
  });

  it('no viewer writes one, or reads a table past its view', async () => {
    const { db, world } = tested;
    await written();
    await db.viewer(world.auditor);
    await db.as('adms_readonly');
    for (const sql of [
      `UPDATE "roe" SET "signed" = false`,
      `UPDATE "survey" SET "notes" = 'x'`,
      `UPDATE "incident" SET "description" = 'x'`,
      `UPDATE "drop_off_log" SET "resident_name" = 'x'`,
      `UPDATE "roe_scope_item" SET "count" = 9`,
    ]) {
      expect((await db.refused(sql)).code, sql).toBe(refusedBy.grant);
    }
  });
});

describe('the definition a record answered', () => {
  it('AC-04-87 is its own project’s form’s, on an ROE, a survey and a drop-off log as on an incident', async () => {
    const { world } = tested;
    const answers = { 'police-report-number': 'BCSO-26-104417' };
    // Each ROE tried has a number of its own, so only its definition is in question.
    let numbered = 12;
    const records: [string, string, string, string, (more: Row) => Promise<Row>][] = [
      [
        'roe',
        'ROE',
        world.p2,
        world.p1,
        (more) =>
          Promise.resolve(
            roeLike(world, { roe_number: `R-00${String((numbered += 1))}`, ...more }),
          ),
      ],
      ['survey', 'SURVEY', world.p2, world.p1, async (more) => survey('PRE_WORK', more)],
      [
        'drop_off_log',
        'DROP_OFF_LOG',
        world.p1,
        world.p2,
        (more) => Promise.resolve(dropOff(more)),
      ],
    ];
    for (const [table, documentType, ownProject, otherProject, like] of records) {
      await asTheBackOffice();
      const own = await formOn(ownProject, documentType);
      const ownFields = await definition(own, documentType, 1, [policeReport]);
      const other = await formOn(otherProject, documentType);
      const otherFields = await definition(other, documentType, 1, [policeReport]);
      await asThePhone();
      await received(table, await like(answered(own, documentType, ownFields, answers)));
      expect(
        await refusal(table, await like(answered(other, documentType, otherFields, answers))),
        `${table}: another project's form`,
      ).toBe(refusedBy.foreignKey);
      expect(
        await refusal(table, await like(answered(own, documentType, otherFields, answers))),
        `${table}: another form's definition`,
      ).toBe(refusedBy.foreignKey);
    }
  });
});
