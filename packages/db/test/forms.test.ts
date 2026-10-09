// REQ-101, 105a: a project's forms, the debris types on them, its field tags and the firm's own
// fields (spec/DATA-MODEL.md §2.2 (Assignment), §3 "Contracts and forms"; ADR-160, 181, 188, 211,
// 214, 216, 218, 278, 308). Section C of spec/acceptance/01-setup.md, proven at the database:
// AC-01-22…24 and 27…30, and AC-01-78 for these tables. The unreduced warning (AC-01-25) and what a
// phone's lists leave out (AC-01-26) are packages/domain's (DebrisTypeEntries). That a field event
// still points at an archived entry needs a field event's debris type (BACKLOG 1.3.4).
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { insertOf, projectLike } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

async function asTheApi(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
}

// Adds a row as whoever the test is acting as; its id.
async function add(table: string, row: Record<string, unknown>): Promise<string> {
  return (await tested.db.one<{ id: string }>(...insertOf(table, row))).id;
}

interface Audited {
  operation: string;
  changed: string[];
  prior: Record<string, unknown> | null;
  actor: string;
  source: string;
  domain: string;
}

async function auditOf(recordId: string): Promise<Audited[]> {
  return tested.db.rows<Audited>(
    `SELECT "operation"::text, "changed_fields" AS changed, "prior_value" AS prior,
       "actor_id"::text AS actor, "source"::text, "domain"::text
     FROM "audit_record" WHERE "record_id" = $1 ORDER BY "id"`,
    [recordId],
  );
}

// A value of one of the firm's lists, by name: its id.
async function picked(list: string, name: string): Promise<string> {
  return (
    await tested.db.one<{ id: string }>(`SELECT "id"::text FROM "${list}" WHERE "name" = $1`, [
      name,
    ])
  ).id;
}

// What a form offers, as its entries read: each debris type's name and its three settings.
interface Entry {
  debris_type: string;
  reduced: boolean;
  reduction_method: string | null;
  hidden_on_phones: boolean;
  archived: boolean;
}

async function entriesOn(formId: string): Promise<Entry[]> {
  return tested.db.rows<Entry>(
    `SELECT d."name" AS debris_type, e."reduced", m."name" AS reduction_method,
       e."hidden_on_phones", e."archived_at" IS NOT NULL AS archived
     FROM "form_debris_type" e JOIN "debris_type" d ON d."id" = e."debris_type_id"
       LEFT JOIN "reduction_method" m ON m."id" = e."reduction_method_id"
     WHERE e."form_id" = $1 ORDER BY d."position", d."name"`,
    [formId],
  );
}

// A debris type's entry on a form of the given document type.
function entry(
  formId: string,
  documentType: string,
  debrisTypeId: string,
  more: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    form_id: formId,
    document_type: documentType,
    debris_type_id: debrisTypeId,
    reduced: false,
    hidden_on_phones: false,
    ...more,
  };
}

// A version of a form's added fields, written by Dana.
function definition(
  formId: string,
  documentType: string,
  version: number,
  fields: unknown[],
): Record<string, unknown> {
  return {
    form_id: formId,
    document_type: documentType,
    version,
    fields: JSON.stringify(fields),
    created_by_id: tested.world.admin,
  };
}

const policeReport = {
  id: 'police-report-number',
  label: 'Police report number',
  type: 'TEXT',
  required: false,
};
const towed = { id: 'vehicle-towed', label: 'Vehicle towed', type: 'YES_NO', required: true };

const documentTypes = [
  'LOAD',
  'HAUL_OUT',
  'UNIT_RATE',
  'CERTIFICATION',
  'ROE',
  'SURVEY',
  'INCIDENT',
  'DROP_OFF_LOG',
];

// A form of each document type, as written on a project: the ROE form alone states "GPS
// required", the incident form alone what an incident offers (here nothing).
const formOf = (projectId: string, documentType: string): Record<string, unknown> => ({
  project_id: projectId,
  name: `A ${documentType} form`,
  document_type: documentType,
  enabled: true,
  ...(documentType === 'ROE' ? { gps_required: true } : {}),
  ...(documentType === 'INCIDENT' ? { incident_offers: '{}' } : {}),
});

describe('a project’s forms', () => {
  it('AC-01-22 each form is for one document type, of these eight and no other', async () => {
    const { db } = tested;
    const rows = await db.rows<{ value: string }>(
      `SELECT e.enumlabel AS value FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'form_document_type' ORDER BY e.enumsortorder`,
    );
    expect(rows.map((row) => row.value)).toEqual(documentTypes);
    await asTheApi();
    const other = await db.refused(...insertOf('form', formOf(tested.world.p2, 'TOWER_LOG')));
    expect(other.code).toBe(refusedBy.badValue);
  });

  it('AC-01-22 P2 takes one form of each of the eight; a second load form on P1 is refused by the database', async () => {
    const { db, world } = tested;
    await asTheApi();
    for (const documentType of documentTypes) {
      await add('form', formOf(world.p2, documentType));
    }
    expect(
      await db.rows(
        `SELECT f."document_type"::text FROM "form" f WHERE f."project_id" = $1 ORDER BY f."document_type"`,
        [world.p2],
      ),
    ).toEqual(documentTypes.map((documentType) => ({ document_type: documentType })));
    const second = await db.refused(...insertOf('form', formOf(world.p1, 'LOAD')));
    expect(second.code).toBe(refusedBy.unique);
    expect(second.message).toContain('"form_project_id_document_type_key"');
    // Still refused once P1's load form is archived: a project has at most one, kept.
    await db.run(`UPDATE "form" SET "archived_at" = now() WHERE "id" = $1`, [world.forms.load]);
    expect((await db.refused(...insertOf('form', formOf(world.p1, 'LOAD')))).code).toBe(
      refusedBy.unique,
    );
  });

  it('AC-01-22 a form’s document type can’t change while a debris type or a definition sits on it', async () => {
    const { db, world } = tested;
    await asTheApi();
    const retype = `UPDATE "form" SET "document_type" = 'UNIT_RATE' WHERE "id" = $1`;
    const underEntries = await db.refused(retype, [world.forms.load]);
    expect(underEntries.code).toBe(refusedBy.restrict);
    expect(underEntries.message).toContain('"form_debris_type_form_id_document_type_fkey"');
    await add('form_definition', definition(world.forms.incident, 'INCIDENT', 1, [policeReport]));
    // An incident form made a survey form gives up what an incident offers with it (the incident
    // form's own setting), so it is the definition's foreign key that answers.
    const underDefinition = await db.refused(
      `UPDATE "form" SET "document_type" = 'SURVEY', "incident_offers" = NULL WHERE "id" = $1`,
      [world.forms.incident],
    );
    expect(underDefinition.code).toBe(refusedBy.restrict);
    expect(underDefinition.message).toContain('"form_definition_form_id_document_type_fkey"');
  });

  it('AC-01-30 Dana switches incidents and drop-off logs on for P1: each is on for that project only', async () => {
    const { db, world } = tested;
    await asTheApi();
    const dropOff = await add('form', { ...formOf(world.p1, 'DROP_OFF_LOG'), enabled: false });
    await db.run(`UPDATE "form" SET "enabled" = true WHERE "id" = $1`, [dropOff]);
    await add('form', { ...formOf(world.p2, 'INCIDENT'), enabled: false });
    expect(
      await db.rows(
        `SELECT p."name" AS project, f."document_type"::text, f."enabled" FROM "form" f
         JOIN "project" p ON p."id" = f."project_id"
         WHERE f."document_type" IN ('INCIDENT', 'DROP_OFF_LOG') ORDER BY p."name", f."document_type"`,
      ),
    ).toEqual([
      {
        project: 'Bayline County PPDR, Hurricane Delphine',
        document_type: 'INCIDENT',
        enabled: false,
      },
      {
        project: 'Bayline County ROW, Hurricane Delphine',
        document_type: 'INCIDENT',
        enabled: true,
      },
      {
        project: 'Bayline County ROW, Hurricane Delphine',
        document_type: 'DROP_OFF_LOG',
        enabled: true,
      },
    ]);
    expect((await auditOf(dropOff)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['enabled'],
      prior: { enabled: false },
      actor: world.admin,
      domain: 'OPERATIONS',
    });
    // Whoever writes a form says whether it's on: the database stands nothing in.
    const unsaid = await db.refused(
      ...insertOf('form', {
        project_id: world.p2,
        name: 'Drop-off log',
        document_type: 'DROP_OFF_LOG',
      }),
    );
    expect(unsaid.code).toBe(refusedBy.notNull);
  });

  it('AC-01-30 "GPS required" is a setting on the project’s ROE form, stated there and on no other form', async () => {
    const { db, world } = tested;
    await asTheApi();
    const roe = await add('form', formOf(world.p2, 'ROE'));
    await db.run(`UPDATE "form" SET "gps_required" = false WHERE "id" = $1`, [roe]);
    expect(await db.one(`SELECT "gps_required" FROM "form" WHERE "id" = $1`, [roe])).toEqual({
      gps_required: false,
    });
    const unstated = await db.refused(
      ...insertOf('form', { ...formOf(world.p1, 'ROE'), gps_required: null }),
    );
    expect(unstated.code).toBe(refusedBy.check);
    expect(unstated.message).toContain('"form_gps_required_check"');
    for (const documentType of documentTypes.filter((type) => type !== 'ROE')) {
      const elsewhere = await db.refused(
        ...insertOf('form', { ...formOf(world.p2, documentType), gps_required: true }),
      );
      expect(elsewhere.code, documentType).toBe(refusedBy.check);
    }
  });

  it('AC-01-83 what an incident offers is a setting on the project’s incident form, stated there and on no other form: P1 offers the contractor and a cert number, P2 all three, and either may offer none', async () => {
    const { db, world } = tested;
    await asTheApi();
    const offers = async (form: string): Promise<unknown> =>
      (
        await db.one<{ offers: string[] }>(
          `SELECT "incident_offers"::text[] AS offers FROM "form" WHERE "id" = $1`,
          [form],
        )
      ).offers;
    expect(await offers(world.forms.incident)).toEqual(['CONTRACTOR', 'CERT_NUMBER']);
    const p2 = await add('form', {
      ...formOf(world.p2, 'INCIDENT'),
      incident_offers: '{CONTRACTOR,CERT_NUMBER,ROE_NUMBER}',
    });
    expect(await offers(p2)).toEqual(['CONTRACTOR', 'CERT_NUMBER', 'ROE_NUMBER']);
    // Dana takes the cert number off P1's: one change, audited.
    await db.run(`UPDATE "form" SET "incident_offers" = '{CONTRACTOR}' WHERE "id" = $1`, [
      world.forms.incident,
    ]);
    expect(await offers(world.forms.incident)).toEqual(['CONTRACTOR']);
    expect((await auditOf(world.forms.incident)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['incident_offers'],
      actor: world.admin,
      domain: 'OPERATIONS',
    });
    await db.run(`UPDATE "form" SET "incident_offers" = '{}' WHERE "id" = $1`, [p2]);
    expect(await offers(p2)).toEqual([]);
    // Unstated on an incident form, stated on any other, a gap in the list, or a value that
    // isn't one of the three: each refused.
    const unstated = await db.refused(
      `UPDATE "form" SET "incident_offers" = NULL WHERE "id" = $1`,
      [p2],
    );
    expect(unstated.code).toBe(refusedBy.check);
    expect(unstated.message).toContain('"form_incident_offers_check"');
    for (const documentType of documentTypes.filter(
      (type) => !['INCIDENT', 'LOAD', 'HAUL_OUT'].includes(type),
    )) {
      const elsewhere = await db.refused(
        ...insertOf('form', { ...formOf(world.p1, documentType), incident_offers: '{}' }),
      );
      expect(elsewhere.code, documentType).toBe(refusedBy.check);
      expect(elsewhere.message, documentType).toContain('"form_incident_offers_check"');
    }
    const gap = await db.refused(
      `UPDATE "form" SET "incident_offers" = ARRAY['CONTRACTOR', NULL]::incident_offer[] WHERE "id" = $1`,
      [p2],
    );
    expect(gap.code).toBe(refusedBy.check);
    const other = await db.refused(
      `UPDATE "form" SET "incident_offers" = '{DRIVER}' WHERE "id" = $1`,
      [p2],
    );
    expect(other.code).toBe(refusedBy.badValue);
  });

  it.each(['project_id', 'name', 'document_type', 'enabled'])('needs its %s', async (column) => {
    const { db, world } = tested;
    await asTheApi();
    const none = await db.refused(
      ...insertOf('form', { ...formOf(world.p2, 'INCIDENT'), [column]: null }),
    );
    expect(none.code).toBe(refusedBy.notNull);
  });
});

describe('the debris types on a form', () => {
  it('AC-01-23 Vegetative and C&D are on P1’s load form; the library’s other debris types aren’t, and P2 has none', async () => {
    const { db, world } = tested;
    expect(await entriesOn(world.forms.load)).toEqual([
      {
        debris_type: 'C&D',
        reduced: false,
        reduction_method: null,
        hidden_on_phones: false,
        archived: false,
      },
      {
        debris_type: 'Vegetative',
        reduced: false,
        reduction_method: null,
        hidden_on_phones: false,
        archived: false,
      },
    ]);
    const library = await db.one<{ count: number }>(
      `SELECT count(*)::int AS count FROM "debris_type"`,
    );
    expect(library.count).toBeGreaterThan(2);
    expect(
      await db.rows(
        `SELECT 1 FROM "form_debris_type" e JOIN "form" f ON f."id" = e."form_id"
         WHERE f."project_id" = $1`,
        [world.p2],
      ),
    ).toEqual([]);
    expect(await auditOf(world.formDebrisTypes.vegetative)).toMatchObject([
      { operation: 'INSERT', actor: world.admin, source: 'BACK_OFFICE', domain: 'OPERATIONS' },
    ]);
  });

  it('AC-01-23 a debris type is on a form once: a second Vegetative on P1’s load form is refused', async () => {
    const { db, world } = tested;
    await asTheApi();
    const again = await db.refused(
      ...insertOf(
        'form_debris_type',
        entry(world.forms.load, 'LOAD', await picked('debris_type', 'Vegetative')),
      ),
    );
    expect(again.code).toBe(refusedBy.unique);
    expect(again.message).toContain('"form_debris_type_form_id_debris_type_id_key"');
  });

  it('AC-01-24 Dana adds Mulch and Ash to the library and to the haul-out form: two entries, each with its own settings; Mulch is Reduced, by Grinding', async () => {
    const { world } = tested;
    await asTheApi();
    const library = async (name: string, position: number): Promise<string> =>
      add('debris_type', { name, position });
    const mulch = await library('Mulch', 100);
    const ash = await library('Ash', 101);
    await add(
      'form_debris_type',
      entry(world.forms.haulOut, 'HAUL_OUT', mulch, {
        reduced: true,
        reduction_method_id: await picked('reduction_method', 'Grinding'),
      }),
    );
    await add(
      'form_debris_type',
      entry(world.forms.haulOut, 'HAUL_OUT', ash, {
        reduced: true,
        reduction_method_id: await picked('reduction_method', 'Incineration'),
        hidden_on_phones: true,
      }),
    );
    expect(await entriesOn(world.forms.haulOut)).toEqual([
      {
        debris_type: 'Mulch',
        reduced: true,
        reduction_method: 'Grinding',
        hidden_on_phones: false,
        archived: false,
      },
      {
        debris_type: 'Ash',
        reduced: true,
        reduction_method: 'Incineration',
        hidden_on_phones: true,
        archived: false,
      },
    ]);
  });

  it('AC-01-25 C&D, not marked Reduced, is saved on the haul-out form: never refused (the warning is the domain’s)', async () => {
    const { world } = tested;
    await asTheApi();
    await add(
      'form_debris_type',
      entry(world.forms.haulOut, 'HAUL_OUT', await picked('debris_type', 'C&D')),
    );
    expect(await entriesOn(world.forms.haulOut)).toEqual([
      {
        debris_type: 'C&D',
        reduced: false,
        reduction_method: null,
        hidden_on_phones: false,
        archived: false,
      },
    ]);
  });

  it('a debris type is added only to a load or a haul-out form, held to its form’s own document type', async () => {
    const { db, world } = tested;
    await asTheApi();
    const vegetative = await picked('debris_type', 'Vegetative');
    const onIncident = await db.refused(
      ...insertOf('form_debris_type', entry(world.forms.incident, 'INCIDENT', vegetative)),
    );
    expect(onIncident.code).toBe(refusedBy.check);
    expect(onIncident.message).toContain('"form_debris_type_document_type_check"');
    // The haul-out form, said to be a load form: refused by the relation to the form.
    const misnamed = await db.refused(
      ...insertOf('form_debris_type', entry(world.forms.haulOut, 'LOAD', vegetative)),
    );
    expect(misnamed.code).toBe(refusedBy.foreignKey);
    expect(misnamed.message).toContain('"form_debris_type_form_id_document_type_fkey"');
    const unitRate = await add('form', formOf(world.p1, 'UNIT_RATE'));
    expect(
      (await db.refused(...insertOf('form_debris_type', entry(unitRate, 'UNIT_RATE', vegetative))))
        .code,
    ).toBe(refusedBy.check);
  });

  it('AC-01-27 an entry no longer wanted is archived, audited, never deleted: the row and its id stay', async () => {
    const { db, world } = tested;
    await asTheApi();
    const cd = world.formDebrisTypes.cd;
    await db.run(`UPDATE "form_debris_type" SET "archived_at" = now() WHERE "id" = $1`, [cd]);
    expect(await entriesOn(world.forms.load)).toEqual([
      {
        debris_type: 'C&D',
        reduced: false,
        reduction_method: null,
        hidden_on_phones: false,
        archived: true,
      },
      {
        debris_type: 'Vegetative',
        reduced: false,
        reduction_method: null,
        hidden_on_phones: false,
        archived: false,
      },
    ]);
    expect((await auditOf(cd)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['archived_at'],
      prior: { archived_at: null },
      actor: world.admin,
    });
    expect((await db.refused(`DELETE FROM "form_debris_type" WHERE "id" = $1`, [cd])).code).toBe(
      refusedBy.grant,
    );
    await db.as('adms_owner');
    expect(await db.refused(`DELETE FROM "form_debris_type" WHERE "id" = $1`, [cd])).toEqual({
      code: refusedBy.trigger,
      message: 'Open ADMS never deletes a form_debris_type row: archive, close or void it instead',
    });
    // Put back by clearing the archive.
    await asTheApi();
    expect(
      await db.run(`UPDATE "form_debris_type" SET "archived_at" = NULL WHERE "id" = $1`, [cd]),
    ).toBe(1);
  });

  it.each(['form_id', 'document_type', 'debris_type_id', 'reduced', 'hidden_on_phones'])(
    'needs its %s',
    async (column) => {
      const { db, world } = tested;
      await asTheApi();
      const whole = entry(world.forms.haulOut, 'HAUL_OUT', await picked('debris_type', 'C&D'));
      const none = await db.refused(...insertOf('form_debris_type', { ...whole, [column]: null }));
      expect(none.code).toBe(refusedBy.notNull);
    },
  );
});

describe('a project’s field tags', () => {
  it('AC-01-28 a new project’s list is empty; Dana adds Mixed and the three zone piles to P1, and they are P1’s and no other project’s', async () => {
    const { db, world } = tested;
    await asTheApi();
    const parks = await add('project', projectLike(world));
    const tagsOf = async (projectId: string): Promise<string[]> =>
      (
        await db.rows<{ name: string }>(
          `SELECT "name" FROM "field_tag" WHERE "project_id" = $1 ORDER BY "position"`,
          [projectId],
        )
      ).map((row) => row.name);
    for (const project of [world.p1, world.p2, parks]) expect(await tagsOf(project)).toEqual([]);
    const tags = ['Mixed', 'Zone 1 pile', 'Zone 2 pile', 'Zone 3 pile'];
    for (const [position, name] of tags.entries()) {
      const id = await add('field_tag', { project_id: world.p1, name, position });
      expect(await auditOf(id)).toMatchObject([{ operation: 'INSERT', actor: world.admin }]);
    }
    expect(await tagsOf(world.p1)).toEqual(tags);
    expect(await tagsOf(world.p2)).toEqual([]);
    expect(await tagsOf(parks)).toEqual([]);
  });
});

describe('the firm’s own fields on a form', () => {
  it('AC-01-29 "Police report number" on P1’s incident form is version 1; a second field is version 2, and version 1 is still there, unchanged', async () => {
    const { db, world } = tested;
    await asTheApi();
    const first = await add(
      'form_definition',
      definition(world.forms.incident, 'INCIDENT', 1, [policeReport]),
    );
    const second = await add(
      'form_definition',
      definition(world.forms.incident, 'INCIDENT', 2, [policeReport, towed]),
    );
    expect(
      await db.rows(
        `SELECT "version", "fields", "created_by_id"::text AS by FROM "form_definition"
         WHERE "form_id" = $1 ORDER BY "version"`,
        [world.forms.incident],
      ),
    ).toEqual([
      { version: 1, fields: [policeReport], by: world.admin },
      { version: 2, fields: [policeReport, towed], by: world.admin },
    ]);
    for (const id of [first, second]) {
      expect(await auditOf(id)).toMatchObject([
        { operation: 'INSERT', actor: world.admin, source: 'BACK_OFFICE', domain: 'OPERATIONS' },
      ]);
    }
  });

  it('AC-01-29 the database refuses an edit or a delete of a definition version, by every login', async () => {
    const { db, world } = tested;
    await asTheApi();
    const first = await add(
      'form_definition',
      definition(world.forms.incident, 'INCIDENT', 1, [policeReport]),
    );
    const edit = `UPDATE "form_definition" SET "fields" = '[]' WHERE "id" = $1`;
    const remove = `DELETE FROM "form_definition" WHERE "id" = $1`;
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      await db.actor(world.admin, 'BACK_OFFICE');
      expect((await db.refused(edit, [first])).code, login).toBe(refusedBy.grant);
      expect((await db.refused(remove, [first])).code, login).toBe(refusedBy.grant);
    }
    for (const who of ['adms_owner', 'administrator'] as const) {
      if (who === 'administrator') await db.administer();
      else await db.as(who);
      expect(await db.refused(edit, [first]), who).toEqual({
        code: refusedBy.trigger,
        message: 'Open ADMS never edits a form_definition row: a change is a new version',
      });
      expect(await db.refused(remove, [first]), who).toEqual({
        code: refusedBy.trigger,
        message: 'Open ADMS never deletes a form_definition row: archive, close or void it instead',
      });
    }
    await asTheApi();
    expect(await db.one(`SELECT "fields" FROM "form_definition" WHERE "id" = $1`, [first])).toEqual(
      { fields: [policeReport] },
    );
    expect(await auditOf(first)).toHaveLength(1);
  });

  it('AC-01-29 a version is one form’s once, numbered from 1', async () => {
    const { db, world } = tested;
    await asTheApi();
    await add('form_definition', definition(world.forms.incident, 'INCIDENT', 1, [policeReport]));
    const again = await db.refused(
      ...insertOf('form_definition', definition(world.forms.incident, 'INCIDENT', 1, [towed])),
    );
    expect(again.code).toBe(refusedBy.unique);
    expect(again.message).toContain('"form_definition_form_id_version_key"');
    const zero = await db.refused(
      ...insertOf('form_definition', definition(world.forms.incident, 'INCIDENT', 0, [towed])),
    );
    expect(zero.code).toBe(refusedBy.check);
    expect(zero.message).toContain('"form_definition_version_check"');
    // Another form starts its own versions from 1.
    const roe = await add('form', formOf(world.p1, 'ROE'));
    await add('form_definition', definition(roe, 'ROE', 1, [towed]));
  });

  it('the firm’s own fields go only on an ROE, survey, incident or drop-off log form: a load, haul-out, unit rate or certification form has nowhere to keep the answers', async () => {
    const { db, world } = tested;
    await asTheApi();
    for (const documentType of ['ROE', 'SURVEY', 'DROP_OFF_LOG']) {
      const form = await add('form', formOf(world.p2, documentType));
      await add('form_definition', definition(form, documentType, 1, [policeReport]));
    }
    const forms: [string, string][] = [
      ['LOAD', world.forms.load],
      ['HAUL_OUT', world.forms.haulOut],
      ['UNIT_RATE', await add('form', formOf(world.p2, 'UNIT_RATE'))],
      ['CERTIFICATION', await add('form', formOf(world.p2, 'CERTIFICATION'))],
    ];
    for (const [documentType, form] of forms) {
      const refusal = await db.refused(
        ...insertOf('form_definition', definition(form, documentType, 1, [policeReport])),
      );
      expect(refusal.code, documentType).toBe(refusedBy.check);
      expect(refusal.message).toContain('"form_definition_document_type_check"');
    }
    // The load form, said to be an incident form: refused by the relation to the form.
    const misnamed = await db.refused(
      ...insertOf('form_definition', definition(world.forms.load, 'INCIDENT', 1, [policeReport])),
    );
    expect(misnamed.code).toBe(refusedBy.foreignKey);
  });

  it('its fields are a list; it needs its form, version, fields and author', async () => {
    const { db, world } = tested;
    await asTheApi();
    const notAList = await db.refused(
      ...insertOf('form_definition', {
        ...definition(world.forms.incident, 'INCIDENT', 1, []),
        fields: JSON.stringify(policeReport),
      }),
    );
    expect(notAList.code).toBe(refusedBy.check);
    expect(notAList.message).toContain('"form_definition_fields_check"');
    for (const column of ['form_id', 'document_type', 'version', 'fields', 'created_by_id']) {
      const none = await db.refused(
        ...insertOf('form_definition', {
          ...definition(world.forms.incident, 'INCIDENT', 1, [policeReport]),
          [column]: null,
        }),
      );
      expect(none.code, column).toBe(refusedBy.notNull);
    }
  });
});

describe('the forms an assignment names', () => {
  const formsOf = async (assignmentId: string): Promise<unknown> =>
    tested.db.one(
      `SELECT "form_document_types"::text[] AS forms FROM "assignment" WHERE "id" = $1`,
      [assignmentId],
    );

  it('AC-02-27 none until the board names some; Jo Kim’s incidents, Kim Nguyen’s drop-off logs, a crew’s ROEs and surveys', async () => {
    const { db, world } = tested;
    expect(await formsOf(world.assignments.p1)).toEqual({ forms: [] });
    await asTheApi();
    for (const named of ['{INCIDENT}', '{DROP_OFF_LOG}', '{ROE,SURVEY}', '{}']) {
      await db.run(`UPDATE "assignment" SET "form_document_types" = $2 WHERE "id" = $1`, [
        world.assignments.p1,
        named,
      ]);
    }
    expect((await auditOf(world.assignments.p1)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['form_document_types'],
      prior: { form_document_types: ['ROE', 'SURVEY'] },
      actor: world.admin,
    });
  });

  it('AC-02-27 only the four that aren’t a ticket’s: a load, haul-out or unit rate form is a field event kind, a certification is certifying; none at all is an empty list', async () => {
    const { db, world } = tested;
    await asTheApi();
    for (const named of ['{LOAD}', '{INCIDENT,HAUL_OUT}', '{UNIT_RATE}', '{CERTIFICATION}', null]) {
      const refusal = await db.refused(
        `UPDATE "assignment" SET "form_document_types" = $2 WHERE "id" = $1`,
        [world.assignments.p1, named],
      );
      expect(refusal.code, String(named)).toBe(refusedBy.check);
      expect(refusal.message).toContain('"assignment_form_document_types_check"');
    }
  });
});

// What an edit changes on each table, and the row of the example world to try it on.
const edited: [string, string, string, (world: typeof tested.world) => string][] = [
  ['form', 'name', 'Load ticket', (world) => world.forms.load],
  ['form_debris_type', 'hidden_on_phones', 'true', (world) => world.formDebrisTypes.cd],
];

describe('changing them', () => {
  it.each(edited)(
    'AC-01-78 a %s row: an edit is audited with the prior value and its actor; a delete or a truncate is refused',
    async (table, column, value, rowOf) => {
      const { db, world } = tested;
      const id = rowOf(world);
      await asTheApi();
      const before = await db.one<{ prior: unknown }>(
        `SELECT to_jsonb("${column}") AS prior FROM "${table}" WHERE "id" = $1`,
        [id],
      );
      await db.run(`UPDATE "${table}" SET "${column}" = $2 WHERE "id" = $1`, [id, value]);
      expect((await auditOf(id)).at(-1)).toMatchObject({
        operation: 'UPDATE',
        changed: [column],
        prior: { [column]: before.prior },
        actor: world.admin,
        source: 'BACK_OFFICE',
        domain: 'OPERATIONS',
      });
      for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
        await db.as(login);
        await db.actor(world.admin, 'BACK_OFFICE');
        expect((await db.refused(`DELETE FROM "${table}" WHERE "id" = $1`, [id])).code, login).toBe(
          refusedBy.grant,
        );
      }
      const never = `Open ADMS never deletes a ${table} row: archive, close or void it instead`;
      for (const who of ['adms_owner', 'administrator'] as const) {
        if (who === 'administrator') await db.administer();
        else await db.as(who);
        for (const sql of [
          `DELETE FROM "${table}" WHERE "id" = '${id}'`,
          `TRUNCATE "${table}" CASCADE`,
        ]) {
          expect(await db.refused(sql), `${who}: ${sql}`).toEqual({
            code: refusedBy.trigger,
            message: never,
          });
        }
      }
    },
  );

  it('AC-01-78 a form is archived, never deleted, and its debris types still point at it', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.run(`UPDATE "form" SET "archived_at" = now() WHERE "id" = $1`, [world.forms.load]);
    expect((await entriesOn(world.forms.load)).map((onForm) => onForm.debris_type)).toEqual([
      'C&D',
      'Vegetative',
    ]);
    expect((await auditOf(world.forms.load)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['archived_at'],
      actor: world.admin,
    });
  });

  it.each(['form', 'form_debris_type', 'form_definition'])(
    'the worker reads %s and may not write it',
    async (table) => {
      const { db, world } = tested;
      await db.as('adms_worker');
      await db.actor(world.worker, 'SYSTEM');
      await db.rows(`SELECT 1 FROM "${table}"`);
      expect((await db.refused(`UPDATE "${table}" SET "created_at" = now()`)).code).toBe(
        refusedBy.grant,
      );
      expect((await db.refused(`INSERT INTO "${table}" DEFAULT VALUES`)).code).toBe(
        refusedBy.grant,
      );
    },
  );

  it('every foreign key of the three tables, as written: each refuses a delete or a change of what it points at', async () => {
    const rows = await tested.db.rows<{ name: string; definition: string }>(
      `SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint
       WHERE contype = 'f' AND conrelid = ANY($1::regclass[]) ORDER BY conname`,
      [['form', 'form_debris_type', 'form_definition']],
    );
    const restrict = 'ON UPDATE RESTRICT ON DELETE RESTRICT';
    const itsForm = 'REFERENCES form(id, document_type)';
    expect(rows).toEqual([
      {
        name: 'form_debris_type_debris_type_id_fkey',
        definition: `FOREIGN KEY (debris_type_id) REFERENCES debris_type(id) ${restrict}`,
      },
      {
        name: 'form_debris_type_form_id_document_type_fkey',
        definition: `FOREIGN KEY (form_id, document_type) ${itsForm} ${restrict}`,
      },
      {
        name: 'form_debris_type_reduction_method_id_fkey',
        definition: `FOREIGN KEY (reduction_method_id) REFERENCES reduction_method(id) ${restrict}`,
      },
      {
        name: 'form_definition_created_by_id_fkey',
        definition: `FOREIGN KEY (created_by_id) REFERENCES "user"(id) ${restrict}`,
      },
      {
        name: 'form_definition_form_id_document_type_fkey',
        definition: `FOREIGN KEY (form_id, document_type) ${itsForm} ${restrict}`,
      },
      {
        name: 'form_project_id_fkey',
        definition: `FOREIGN KEY (project_id) REFERENCES project(id) ${restrict}`,
      },
    ]);
  });
});
