// What each kind of field event records (spec/acceptance/04-field-capture.md, sections C–F and H,
// by scenario ID; spec/DATA-MODEL.md §4.1 (2), §8; ADR-236, 325; REQ-103, 105o, 110, 111, 111a,
// 112, 112a, 112b, 115): a load's collection and disposal, a split's properties, a haul-out's two
// ends and its piles, unit rate work with its item lines, the tickets a load carries. Nothing here
// refuses work over eligibility (ADR-052): each refusal is of a record that isn't one. The values
// are the golden mission's (spec/golden/MISSION.md §2, §3).
import {
  FieldEventDetails,
  fieldEventDetailNames,
  fieldEventKinds,
  measuredAs,
  type FieldEventDetail,
  type FieldEventKindName,
} from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import {
  debrisTypePicked,
  eventInsertOf,
  fieldEventLike,
  insertOf,
  payItemLike,
} from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

type Row = Record<string, unknown>;

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

// A field event as a phone sends it, changed as the test says; its id.
async function received(more: Row = {}): Promise<string> {
  const { db, world } = tested;
  return (await db.one<{ id: string }>(...eventInsertOf(fieldEventLike(world, more)))).id;
}

// How the database refuses that field event.
async function refusedEvent(more: Row): Promise<string> {
  const { db, world } = tested;
  return (await db.refused(...eventInsertOf(fieldEventLike(world, more)))).code;
}

async function kept(id: string, columns: string): Promise<Row> {
  return tested.db.one(`SELECT ${columns} FROM "field_event" WHERE "id" = $1`, [id]);
}

async function add(table: string, row: Row): Promise<string> {
  return (await tested.db.one<{ id: string }>(...insertOf(table, row))).id;
}

async function refusedRow(table: string, row: Row): Promise<string> {
  return (await tested.db.refused(...insertOf(table, row))).code;
}

// A value of one of the firm's lists, by the name it ships with.
async function listed(list: string, name: string): Promise<string> {
  return (
    await tested.db.one<{ id: string }>(`SELECT "id"::text FROM "${list}" WHERE "name" = $1`, [
      name,
    ])
  ).id;
}

async function columnsOf(table: string): Promise<string[]> {
  return (
    await tested.db.rows<{ name: string }>(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY column_name`,
      [table],
    )
  ).map((column) => column.name);
}

// The debris type a field event picked, by its name in the firm's library, and its form.
async function debrisTypeOf(id: string): Promise<Row> {
  return tested.db.one(
    `SELECT d."name" AS debris_type, f."name" AS form, e."form_document_type"::text AS document_type
     FROM "field_event" e
     JOIN "form_debris_type" t ON t."id" = e."form_debris_type_id" AND t."form_id" = e."form_id"
     JOIN "debris_type" d ON d."id" = t."debris_type_id"
     JOIN "form" f ON f."id" = e."form_id"
     WHERE e."id" = $1`,
    [id],
  );
}

// Mulch, as Dana adds it to the library and to P1's haul-out form (the golden mission §1): what a
// haul-out's monitor picks.
async function mulch(): Promise<Row> {
  const { world } = tested;
  await asTheBackOffice();
  const library = await add('debris_type', { name: 'Mulch', position: 100 });
  const entry = await add('form_debris_type', {
    form_id: world.forms.haulOut,
    document_type: 'HAUL_OUT',
    debris_type_id: library,
    reduced: true,
    hidden_on_phones: false,
  });
  return debrisTypePicked(world, entry, { id: world.forms.haulOut, documentType: 'HAUL_OUT' });
}

// A field tag as Dana adds it to a project's list.
async function fieldTag(name: string, projectId = tested.world.p1): Promise<string> {
  await asTheBackOffice();
  return add('field_tag', { project_id: projectId, name, position: 1 });
}

const vegetative = (): Row =>
  debrisTypePicked(tested.world, tested.world.formDebrisTypes.vegetative);
const cd = (): Row => debrisTypePicked(tested.world, tested.world.formDebrisTypes.cd);

// A disposal at Marsh Road TDSR, as the tower's phone sends one.
const atTheTower = (ticketNumber: string, more: Row = {}): Row => ({
  kind: 'DISPOSAL',
  ticket_number: ticketNumber,
  site_id: tested.world.site,
  ...more,
});

// A haul-out's two ends, on Coastline's walking floor `730419`: loaded at Marsh Road TDSR, dumped
// at Bayline County Landfill.
const haulOut = (kind: 'HAUL_OUT_COLLECTION' | 'HAUL_OUT_DISPOSAL', more: Row = {}): Row => ({
  workflow: 'HAUL_OUT',
  kind,
  ticket_number: '201001',
  cert_number: '730419',
  certification_id: tested.world.certifications.c730419,
  site_id: kind === 'HAUL_OUT_COLLECTION' ? tested.world.site : tested.world.landfill,
  ...more,
});

// Unit rate work by the bucket truck crew `730417`.
const unitRate = (ticketNumber: string, more: Row = {}): Row => ({
  workflow: 'UNIT_RATE',
  kind: 'UNIT_RATE',
  ticket_number: ticketNumber,
  cert_number: '730417',
  certification_id: tested.world.certifications.c730417,
  ...more,
});

// A collection on P2, which requires ROEs, on its own `730416`.
const onP2 = (more: Row = {}): Row => ({
  project_id: tested.world.p2,
  assignment_id: tested.world.assignments.p2,
  cert_number: '730416',
  certification_id: tested.world.certifications.p2c730416,
  ...more,
});

describe('a load', () => {
  it('AC-04-32 its collection records the debris type picked, as that entry on its own project’s load form, and no load call', async () => {
    const { db, world } = tested;
    await asThePhone();
    const collection = await received(vegetative());
    expect(await debrisTypeOf(collection)).toEqual({
      debris_type: 'Vegetative',
      form: 'Load',
      document_type: 'LOAD',
    });
    expect(await kept(collection, `"load_call"`)).toEqual({ load_call: null });
    expect(await refusedEvent({ ticket_number: '101021', load_call: 50 })).toBe(refusedBy.check);
    // The entry comes with its form and that form's document type, all three or none.
    for (const missing of ['form_id', 'form_document_type', 'form_debris_type_id']) {
      expect(
        await refusedEvent({ ticket_number: '101021', ...vegetative(), [missing]: null }),
        missing,
      ).toBe(refusedBy.check);
    }
    // A load picks from the load form: an entry of the haul-out form is refused on it, as is an
    // entry said to be on a form it isn't on.
    const onHaulOutForm = await mulch();
    await asThePhone();
    expect(await refusedEvent({ ticket_number: '101021', ...onHaulOutForm })).toBe(refusedBy.check);
    expect(
      await refusedEvent({
        ticket_number: '101021',
        ...vegetative(),
        form_debris_type_id: onHaulOutForm['form_debris_type_id'],
      }),
    ).toBe(refusedBy.foreignKey);
    // And from its own project's form: P2's load form isn't P1's.
    await asTheBackOffice();
    const p2Form = await add('form', {
      project_id: world.p2,
      name: 'Load',
      document_type: 'LOAD',
      enabled: true,
    });
    const p2Entry = await add('form_debris_type', {
      form_id: p2Form,
      document_type: 'LOAD',
      debris_type_id: await listed('debris_type', 'Vegetative'),
      reduced: false,
      hidden_on_phones: false,
    });
    const p2Vegetative = debrisTypePicked(world, p2Entry, { id: p2Form, documentType: 'LOAD' });
    await asThePhone();
    expect(await refusedEvent({ ticket_number: '101021', ...p2Vegetative })).toBe(
      refusedBy.foreignKey,
    );
    await received(onP2({ ticket_number: '102002', ...p2Vegetative }));
    expect(
      await db.rows(`SELECT 1 FROM "field_event" WHERE "form_id" = $1`, [p2Form]),
    ).toHaveLength(1);
  });

  it('AC-04-33 AC-01-27 its field events still point at a debris type’s entry once the entry is taken off the form', async () => {
    const { db, world } = tested;
    await asTheBackOffice();
    expect(
      await db.run(`UPDATE "form_debris_type" SET "archived_at" = now() WHERE "id" = $1`, [
        world.formDebrisTypes.cd,
      ]),
    ).toBe(1);
    const load = world.loads.l101002;
    for (const event of [load.collection, load.disposal]) {
      expect(await debrisTypeOf(event)).toEqual({
        debris_type: 'C&D',
        form: 'Load',
        document_type: 'LOAD',
      });
    }
    // An entry is never deleted, least of all from under the field events that picked it.
    await db.administer();
    await db.actor(world.admin, 'BACK_OFFICE');
    await db.refused(`DELETE FROM "form_debris_type" WHERE "id" = $1`, [world.formDebrisTypes.cd]);
  });

  it('AC-04-34 its collection may carry a field tag, one of its own project’s; a disposal takes none', async () => {
    const { world } = tested;
    const mixed = await fieldTag('Mixed');
    const p2Tag = await fieldTag('Mixed', world.p2);
    await asThePhone();
    const tagged = await received({ field_tag_id: mixed });
    expect(await kept(tagged, `"field_tag_id"::text AS tag`)).toEqual({ tag: mixed });
    const untagged = await received({ ticket_number: '101021' });
    expect(await kept(untagged, `"field_tag_id"`)).toEqual({ field_tag_id: null });
    expect(await refusedEvent(atTheTower('101021', { field_tag_id: mixed }))).toBe(refusedBy.check);
    expect(await refusedEvent(haulOut('HAUL_OUT_DISPOSAL', { field_tag_id: mixed }))).toBe(
      refusedBy.check,
    );
    expect(await refusedEvent({ ticket_number: '101022', field_tag_id: p2Tag })).toBe(
      refusedBy.foreignKey,
    );
  });

  it('AC-04-35 its disposal records the debris type its own monitor picked and the load call; nothing copies the collection’s', async () => {
    const { world } = tested;
    const disposal = world.loads.l101001.disposal;
    expect(await debrisTypeOf(disposal)).toEqual({
      debris_type: 'Vegetative',
      form: 'Load',
      document_type: 'LOAD',
    });
    expect(await kept(disposal, `"load_call"`)).toEqual({ load_call: 80 });
    // A disposal that picked none, on a load whose collection picked Vegetative, stays without.
    await asThePhone();
    await received({ ...vegetative(), ticket_number: '101021' });
    const unpicked = await received(atTheTower('101021', { load_call: 60 }));
    expect(await kept(unpicked, `"form_debris_type_id"`)).toEqual({ form_debris_type_id: null });
    // No trigger fills anything in: the field event's only triggers are the guards every table has.
    expect(
      (
        await tested.db.rows<{ name: string }>(
          `SELECT tgname AS name FROM pg_trigger
           WHERE tgrelid = 'field_event'::regclass AND NOT tgisinternal ORDER BY tgname`,
        )
      ).map((trigger) => trigger.name),
    ).toEqual(['field_event_audit', 'field_event_refuse_delete', 'field_event_refuse_truncate']);
  });

  it('AC-04-36 whose collection picked Vegetative and whose disposal picked C&D keeps both as picked', async () => {
    await asThePhone();
    const collection = await received({ ticket_number: '101008', ...vegetative() });
    const disposal = await received(atTheTower('101008', { load_call: 70, ...cd() }));
    expect((await debrisTypeOf(collection))['debris_type']).toBe('Vegetative');
    expect((await debrisTypeOf(disposal))['debris_type']).toBe('C&D');
    expect(await kept(disposal, `"status"::text`)).toEqual({ status: 'PENDING' });
  });

  it('AC-04-37 its disposal’s load call is a whole number from 0 to 100: 0 and none at all are taken; 101, −1 and 80.5 are refused', async () => {
    await asThePhone();
    const zero = await received(atTheTower('101032', { load_call: 0 }));
    expect(await kept(zero, `"load_call"`)).toEqual({ load_call: 0 });
    const none = await received(atTheTower('101033'));
    expect(await kept(none, `"load_call"`)).toEqual({ load_call: null });
    await received(atTheTower('101034', { load_call: 100 }));
    expect(await refusedEvent(atTheTower('101035', { load_call: 101 }))).toBe(refusedBy.check);
    expect(await refusedEvent(atTheTower('101035', { load_call: -1 }))).toBe(refusedBy.check);
    expect(await refusedEvent(atTheTower('101035', { load_call: '80.5' }))).toBe(
      refusedBy.badValue,
    );
  });

  it('AC-04-40 that carries stump tickets lists each on its collection by its number, once; a number that matches no ticket is taken', async () => {
    const { db } = tested;
    await asThePhone();
    const collection = await received({ ticket_number: '101014' });
    const carried = (number: string, eventId = collection, kind = 'COLLECTION'): Row => ({
      field_event_id: eventId,
      field_event_kind: kind,
      carried_ticket_number: number,
    });
    // 301099 is no ticket on P1: taken, for a flag later.
    for (const number of ['301004', '301005', '301099']) {
      await add('carried_ticket', carried(number));
    }
    expect(
      (
        await db.rows<{ number: string }>(
          `SELECT "carried_ticket_number" AS number FROM "carried_ticket"
           WHERE "field_event_id" = $1 ORDER BY 1`,
          [collection],
        )
      ).map((row) => row.number),
    ).toEqual(['301004', '301005', '301099']);
    expect(await refusedRow('carried_ticket', carried('301004'))).toBe(refusedBy.unique);
    // The number as written and the collection it is on, nothing else: no link to a ticket.
    expect(await columnsOf('carried_ticket')).toEqual([
      'carried_ticket_number',
      'created_at',
      'field_event_id',
      'field_event_kind',
      'id',
    ]);
    // A collection that lists what it carries can't be made another kind.
    await asTheBackOffice();
    expect(
      (
        await db.refused(`UPDATE "field_event" SET "kind" = 'DISPOSAL' WHERE "id" = $1`, [
          collection,
        ])
      ).code,
    ).toBe(refusedBy.restrict);
    // Only a collection lists what it carries: the tower holds no list.
    await asThePhone();
    const disposal = await received(atTheTower('101014'));
    expect(await refusedRow('carried_ticket', carried('301004', disposal, 'DISPOSAL'))).toBe(
      refusedBy.check,
    );
    expect(await refusedRow('carried_ticket', carried('301004', disposal))).toBe(
      refusedBy.foreignKey,
    );
  });

  it('AC-04-41 that carries tickets has a count on its disposal, and no load call; a count is kept on a disposal only', async () => {
    await asThePhone();
    const disposal = await received(atTheTower('101014', { carried_count: 3 }));
    expect(await kept(disposal, `"carried_count", "load_call"`)).toEqual({
      carried_count: 3,
      load_call: null,
    });
    expect(await refusedEvent({ ticket_number: '101014', carried_count: 3 })).toBe(refusedBy.check);
    expect(await refusedEvent(haulOut('HAUL_OUT_DISPOSAL', { carried_count: 3 }))).toBe(
      refusedBy.check,
    );
    expect(await refusedEvent(atTheTower('101015', { carried_count: -1 }))).toBe(refusedBy.check);
    // The phone asks for one quantity; a disposal that reached the server with a count and a load
    // call is taken, and which one bills is the worker's to read from the pay item (ADR-325).
    await received(atTheTower('101015', { carried_count: 3, load_call: 40 }));
  });

  it('AC-04-43 collected on Monday evening and dumped on Tuesday morning keeps both field events as recorded; nothing says "preload"', async () => {
    const { db } = tested;
    await asThePhone();
    await received({
      ticket_number: '101004',
      started_at: '2026-10-12T17:30:00-04:00',
      ended_at: '2026-10-12T17:50:00-04:00',
    });
    const disposal = await received(
      atTheTower('101004', {
        load_call: 85,
        started_at: '2026-10-13T07:05:00-04:00',
        ended_at: '2026-10-13T07:15:00-04:00',
      }),
    );
    expect(await kept(disposal, `"status"::text`)).toEqual({ status: 'PENDING' });
    expect(
      await db.rows(
        `SELECT table_name || '.' || column_name AS found FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name LIKE '%preload%'`,
      ),
    ).toEqual([]);
  });
});

describe('a split load', () => {
  // The example world's 102001 is written unsplit, so the split is told on 102004.
  const property = (suffix: string, more: Row): Row =>
    onP2({ ticket_number: '102004', split_suffix: suffix, ...more });

  it('AC-04-45 has a collection for each property, the first -A, each with its ROE, its estimate, its own times, GPS and address', async () => {
    const { db, world } = tested;
    await asThePhone();
    await received(
      property('A', {
        roe_number: 'R-0007',
        estimate_cy: '12.0',
        started_at: '2026-10-13T09:00:00-04:00',
        ended_at: '2026-10-13T09:20:00-04:00',
        end_latitude: '27.96110000',
        end_longitude: '-82.41020000',
        address: '412 Cedar Ct',
        address_source: 'TYPED',
      }),
    );
    await received(
      property('B', {
        roe_number: 'R-0008',
        estimate_cy: '18.0',
        started_at: '2026-10-13T09:25:00-04:00',
        ended_at: '2026-10-13T09:50:00-04:00',
        end_latitude: '27.96130000',
        end_longitude: '-82.41050000',
        address: '416 Cedar Ct',
        address_source: 'TYPED',
      }),
    );
    expect(
      await db.rows(
        `SELECT "split_suffix", "roe_number", "estimate_cy"::text, "address",
           to_char("ended_at" AT TIME ZONE 'America/New_York', 'HH24:MI') AS ended,
           "end_latitude"::text
         FROM "field_event" WHERE "project_id" = $1 AND "ticket_number" = '102004'
         ORDER BY "split_suffix"`,
        [world.p2],
      ),
    ).toEqual([
      {
        split_suffix: 'A',
        roe_number: 'R-0007',
        estimate_cy: '12.0',
        address: '412 Cedar Ct',
        ended: '09:20',
        end_latitude: '27.96110000',
      },
      {
        split_suffix: 'B',
        roe_number: 'R-0008',
        estimate_cy: '18.0',
        address: '416 Cedar Ct',
        ended: '09:50',
        end_latitude: '27.96130000',
      },
    ]);
    // A suffix is capital letters, kept without its hyphen: one property is one row.
    for (const suffix of ['a', '-C', 'C1', ' C']) {
      expect(await refusedEvent(property(suffix, { estimate_cy: 5 })), suffix).toBe(
        refusedBy.check,
      );
    }
    // A 27th property.
    await received(property('AA', { estimate_cy: 5 }));
  });

  it('AC-04-46 has its suffix and its estimate both or neither on a collection; an estimate on any other kind is refused', async () => {
    await asThePhone();
    expect(await refusedEvent(property('A', {}))).toBe(refusedBy.check);
    expect(await refusedEvent(onP2({ ticket_number: '102004', estimate_cy: 12 }))).toBe(
      refusedBy.check,
    );
    expect(await refusedEvent(property('A', { estimate_cy: -1 }))).toBe(refusedBy.check);
    // Nought is an estimate; a collection with neither is an ordinary load's.
    await received(property('A', { estimate_cy: 0 }));
    await received(onP2({ ticket_number: '102005' }));
    for (const other of [
      atTheTower('101021', { estimate_cy: 12 }),
      haulOut('HAUL_OUT_COLLECTION', { estimate_cy: 12 }),
      haulOut('HAUL_OUT_DISPOSAL', { estimate_cy: 12 }),
      { ...unitRate('301020'), estimate_cy: 12 },
    ]) {
      expect(await refusedEvent(other), String(other['kind'])).toBe(refusedBy.check);
    }
  });

  it('AC-04-47 has one disposal, on the base number with no suffix: a suffix on a disposal is refused', async () => {
    await asThePhone();
    await received(property('A', { estimate_cy: 12 }));
    await received(property('B', { estimate_cy: 18 }));
    const disposal = await received(
      onP2({ kind: 'DISPOSAL', ticket_number: '102004', load_call: 75 }),
    );
    expect(await kept(disposal, `"split_suffix", "load_call"`)).toEqual({
      split_suffix: '',
      load_call: 75,
    });
    expect(
      await refusedEvent(
        onP2({ kind: 'DISPOSAL', ticket_number: '102004', split_suffix: 'A', load_call: 75 }),
      ),
    ).toBe(refusedBy.check);
    // Nor on a haul-out's disposal, nor on unit rate work.
    expect(await refusedEvent(haulOut('HAUL_OUT_DISPOSAL', { split_suffix: 'A' }))).toBe(
      refusedBy.check,
    );
    expect(await refusedEvent({ ...unitRate('301020'), split_suffix: 'A' })).toBe(refusedBy.check);
  });

  it('AC-04-48 keeps each property’s estimate and no share: a share is the worker’s to work out', async () => {
    const { db } = tested;
    expect(
      await db.rows(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'field_event'
           AND (column_name LIKE '%share%' OR column_name LIKE '%portion%')`,
      ),
    ).toEqual([]);
    // Estimates of 12 and 18 CY under a call that makes 36.0 CY: nothing checks one against the
    // other.
    await asThePhone();
    await received(property('A', { estimate_cy: 12 }));
    await received(property('B', { estimate_cy: 18 }));
    await received(onP2({ kind: 'DISPOSAL', ticket_number: '102004', load_call: 5 }));
  });

  it('AC-04-49 whose collections are -A and -C, with no -B, has both taken', async () => {
    await asThePhone();
    await received(property('A', { estimate_cy: 12 }));
    const third = await received(property('C', { estimate_cy: 9 }));
    expect(await kept(third, `"split_suffix", "status"::text`)).toEqual({
      split_suffix: 'C',
      status: 'PENDING',
    });
  });
});

describe('a haul-out', () => {
  it('AC-04-50 its collection records the site, the debris type picked off the haul-out form, and the load call', async () => {
    const { world } = tested;
    const picked = await mulch();
    await asThePhone();
    const collection = await received(haulOut('HAUL_OUT_COLLECTION', { ...picked, load_call: 90 }));
    expect(await debrisTypeOf(collection)).toEqual({
      debris_type: 'Mulch',
      form: 'Haul-out',
      document_type: 'HAUL_OUT',
    });
    expect(await kept(collection, `"site_id"::text AS site, "load_call"`)).toEqual({
      site: world.site,
      load_call: 90,
    });
    // A haul-out picks from the haul-out form: the load form's Vegetative is refused on it.
    expect(
      await refusedEvent(
        haulOut('HAUL_OUT_COLLECTION', { ticket_number: '201005', ...vegetative() }),
      ),
    ).toBe(refusedBy.check);
  });

  it('AC-04-51 its disposal records its site and the debris type picked on its own, and no load call', async () => {
    const { world } = tested;
    const picked = await mulch();
    await asThePhone();
    const disposal = await received(haulOut('HAUL_OUT_DISPOSAL', picked));
    expect((await debrisTypeOf(disposal))['debris_type']).toBe('Mulch');
    expect(await kept(disposal, `"site_id"::text AS site, "load_call"`)).toEqual({
      site: world.landfill,
      load_call: null,
    });
    expect(
      await refusedEvent(haulOut('HAUL_OUT_DISPOSAL', { ticket_number: '201005', load_call: 90 })),
    ).toBe(refusedBy.check);
  });

  it('AC-04-53 loaded from three piles has three collections, -A, -B and -C, each with its field tag and the load call so far, and one disposal with no suffix', async () => {
    const { db, world } = tested;
    const picked = await mulch();
    const piles = [
      ['A', 'Zone 1 pile', 10, '15:30'],
      ['B', 'Zone 2 pile', 35, '15:45'],
      ['C', 'Zone 3 pile', 85, '16:05'],
    ] as const;
    const tags = new Map<string, string>();
    for (const [, name] of piles) tags.set(name, await fieldTag(name));
    await asThePhone();
    for (const [suffix, tag, call, ended] of piles) {
      await received(
        haulOut('HAUL_OUT_COLLECTION', {
          ...picked,
          ticket_number: '201004',
          split_suffix: suffix,
          field_tag_id: tags.get(tag),
          load_call: call,
          started_at: `2026-10-13T15:20:00-04:00`,
          ended_at: `2026-10-13T${ended}:00-04:00`,
        }),
      );
    }
    await received(haulOut('HAUL_OUT_DISPOSAL', { ...picked, ticket_number: '201004' }));
    expect(
      await db.rows(
        `SELECT e."kind"::text, e."split_suffix", t."name" AS field_tag, e."load_call",
           to_char(e."ended_at" AT TIME ZONE 'America/New_York', 'HH24:MI') AS ended
         FROM "field_event" e LEFT JOIN "field_tag" t ON t."id" = e."field_tag_id"
         WHERE e."project_id" = $1 AND e."workflow" = 'HAUL_OUT' AND e."ticket_number" = '201004'
         ORDER BY e."kind", e."split_suffix"`,
        [world.p1],
      ),
    ).toEqual([
      ...piles.map(([suffix, tag, call, ended]) => ({
        kind: 'HAUL_OUT_COLLECTION',
        split_suffix: suffix,
        field_tag: tag,
        load_call: call,
        ended,
      })),
      {
        kind: 'HAUL_OUT_DISPOSAL',
        split_suffix: '',
        field_tag: null,
        load_call: null,
        ended: '09:25',
      },
    ]);
  });

  it('AC-04-54 a pile’s collection carries a load call and never an estimate', async () => {
    await asThePhone();
    const pile = (more: Row): Row =>
      haulOut('HAUL_OUT_COLLECTION', { ticket_number: '201004', split_suffix: 'A', ...more });
    expect(await refusedEvent(pile({ estimate_cy: 11 }))).toBe(refusedBy.check);
    expect(await refusedEvent(pile({ estimate_cy: 11, load_call: 10 }))).toBe(refusedBy.check);
    await received(pile({ load_call: 10 }));
  });

  it('AC-04-55 whose pile -B is called at 30 after pile -A at 35 has both taken as called', async () => {
    await asThePhone();
    for (const [suffix, call] of [
      ['A', 35],
      ['B', 30],
    ] as const) {
      const pile = await received(
        haulOut('HAUL_OUT_COLLECTION', {
          ticket_number: '201004',
          split_suffix: suffix,
          load_call: call,
        }),
      );
      expect(await kept(pile, `"load_call", "status"::text`)).toEqual({
        load_call: call,
        status: 'PENDING',
      });
    }
  });

  it('AC-04-56 dumped at Marsh Road TDSR, by a phone assigned there, is taken', async () => {
    const { world } = tested;
    await asThePhone();
    const disposal = await received(
      haulOut('HAUL_OUT_DISPOSAL', { ticket_number: '201002', site_id: world.site }),
    );
    expect(await kept(disposal, `"site_id"::text AS site, "status"::text`)).toEqual({
      site: world.site,
      status: 'PENDING',
    });
  });
});

describe('unit rate work', () => {
  it('AC-04-57 is one field event: the kind of work, the payable type picked, the pay item the phone worked out, a count and the measurement', async () => {
    const { db, world } = tested;
    await asThePhone();
    const hanger = await received(
      unitRate('301001', {
        kind_of_work_id: world.kindsOfWork.hangers,
        payable_type_id: world.payableTypes.hangers,
        pay_item_id: world.payItems.hangers,
        unit_count: 1,
        measurement_inches: '3.0',
        measured_as: 'DIAMETER',
      }),
    );
    expect(
      await db.one(
        `SELECT k."name" AS kind_of_work, t."name" AS payable_type, p."code" AS pay_item,
           e."unit_count"::text, e."measurement_inches"::text, e."measured_as"::text
         FROM "field_event" e
         JOIN "kind_of_work" k ON k."id" = e."kind_of_work_id"
         JOIN "payable_type" t ON t."id" = e."payable_type_id"
         JOIN "pay_item" p ON p."id" = e."pay_item_id"
         WHERE e."id" = $1`,
        [hanger],
      ),
    ).toEqual({
      kind_of_work: 'Hangers',
      payable_type: 'Hangers',
      pay_item: 'HNG-RMV-EA',
      unit_count: '1.00',
      measurement_inches: '3.0',
      measured_as: 'DIAMETER',
    });
    // The pay item is one of the field event's own project's.
    await asTheBackOffice();
    const p2PayItem = await add(
      'pay_item',
      payItemLike(world, {
        project_id: world.p2,
        code: 'HNG-RMV-EA',
        description: 'Hanger removal',
        payable_type_id: world.payableTypes.hangers,
        kind_of_work_id: world.kindsOfWork.hangers,
        unit: 'EA',
      }),
    );
    await asThePhone();
    expect(await refusedEvent(unitRate('301020', { pay_item_id: p2PayItem }))).toBe(
      refusedBy.foreignKey,
    );
    // A kind of work, a payable type and a pay item are picked from what exists.
    for (const pick of ['kind_of_work_id', 'payable_type_id', 'pay_item_id']) {
      expect(
        await refusedEvent(unitRate('301020', { [pick]: '019a0000-0000-7000-8000-00000000dead' })),
        pick,
      ).toBe(refusedBy.foreignKey);
    }
  });

  it('AC-04-58 keeps what the monitor read and how: a leaner’s 56.5 in as a circumference, never a conversion', async () => {
    const { db, world } = tested;
    await asThePhone();
    const leaner = (more: Row): Row =>
      unitRate('301002', {
        kind_of_work_id: world.kindsOfWork.leaners,
        payable_type_id: world.payableTypes.leaners,
        pay_item_id: world.payItems.leaners24,
        unit_count: 1,
        ...more,
      });
    const event = await received(
      leaner({ measurement_inches: '56.5', measured_as: 'CIRCUMFERENCE' }),
    );
    expect(await kept(event, `"measurement_inches"::text, "measured_as"::text`)).toEqual({
      measurement_inches: '56.5',
      measured_as: 'CIRCUMFERENCE',
    });
    expect(
      (
        await db.rows<{ value: string }>(
          `SELECT enumlabel AS value FROM pg_enum WHERE enumtypid = 'measured_as'::regtype
           ORDER BY enumsortorder`,
        )
      ).map((row) => row.value),
    ).toEqual([...measuredAs]);
    // A measurement says how it was read, and only a measurement does.
    expect(
      await refusedEvent(leaner({ ticket_number: '301020', measurement_inches: '56.5' })),
    ).toBe(refusedBy.check);
    expect(await refusedEvent(leaner({ ticket_number: '301020', measured_as: 'DIAMETER' }))).toBe(
      refusedBy.check,
    );
    expect(
      await refusedEvent(
        leaner({ ticket_number: '301020', measurement_inches: -1, measured_as: 'DIAMETER' }),
      ),
    ).toBe(refusedBy.check);
  });

  it('AC-04-60 that fits no band is saved with its kind of work and payable type and no pay item', async () => {
    const { world } = tested;
    await asThePhone();
    const leaner = await received(
      unitRate('301009', {
        kind_of_work_id: world.kindsOfWork.leaners,
        payable_type_id: world.payableTypes.leaners,
        unit_count: 1,
        measurement_inches: '4.5',
        measured_as: 'DIAMETER',
      }),
    );
    expect(
      await kept(
        leaner,
        `"kind_of_work_id"::text AS kind, "payable_type_id"::text AS payable, "pay_item_id",
         "status"::text`,
      ),
    ).toEqual({
      kind: world.kindsOfWork.leaners,
      payable: world.payableTypes.leaners,
      pay_item_id: null,
      status: 'PENDING',
    });
  });

  it('AC-04-61 on a stump records its diameter two feet up, the root ball’s diameter, whether half or more is exposed and the survey number as typed; no hole depth and no fill', async () => {
    const { world } = tested;
    await asThePhone();
    const stump = await received(
      unitRate('301004', {
        kind_of_work_id: world.kindsOfWork.stumps,
        payable_type_id: world.payableTypes.stumps,
        pay_item_id: world.payItems.stumps36,
        unit_count: 1,
        measurement_inches: 30,
        measured_as: 'DIAMETER',
        root_ball_inches: 96,
        root_ball_half_exposed: true,
        survey_number: 'APN 14-0321-007',
      }),
    );
    expect(
      await kept(
        stump,
        `"measurement_inches"::text, "root_ball_inches"::text, "root_ball_half_exposed",
         "survey_number"`,
      ),
    ).toEqual({
      measurement_inches: '30.0',
      root_ball_inches: '96.0',
      root_ball_half_exposed: true,
      survey_number: 'APN 14-0321-007',
    });
    expect(
      (await columnsOf('field_event')).filter((column) =>
        /depth|fill|hole|cubic|volume/.test(column),
      ),
    ).toEqual([]);
    expect(await refusedEvent(unitRate('301020', { root_ball_inches: -1 }))).toBe(refusedBy.check);
  });

  it('AC-04-62 on a stump of 20 in is taken as measured, with no pay item; one with no survey number is taken too', async () => {
    const { world } = tested;
    await asThePhone();
    const stump = (ticketNumber: string, more: Row): Row =>
      unitRate(ticketNumber, {
        kind_of_work_id: world.kindsOfWork.stumps,
        payable_type_id: world.payableTypes.stumps,
        unit_count: 1,
        measured_as: 'DIAMETER',
        ...more,
      });
    const small = await received(
      stump('301005', { measurement_inches: 20, survey_number: 'APN 14-0321-007' }),
    );
    expect(await kept(small, `"measurement_inches"::text, "pay_item_id"`)).toEqual({
      measurement_inches: '20.0',
      pay_item_id: null,
    });
    const unsurveyed = await received(
      stump('301018', { measurement_inches: 30, pay_item_id: world.payItems.stumps36 }),
    );
    expect(await kept(unsurveyed, `"survey_number"`)).toEqual({ survey_number: null });
  });

  // The lines of an itemised unit rate event, by the item's name.
  async function linesOf(eventId: string): Promise<Row[]> {
    return tested.db.rows(
      `SELECT n."name" AS item, l."quantity"::text FROM "field_event_item" l
       JOIN "item_name" n ON n."id" = l."item_name_id"
       WHERE l."field_event_id" = $1 ORDER BY n."position"`,
      [eventId],
    );
  }

  async function itemised(
    ticket: Row,
    kindOfWork: string,
    lines: readonly (readonly [string, string])[],
  ): Promise<string> {
    const event = await received({
      ...ticket,
      kind_of_work_id: await listed('kind_of_work', kindOfWork),
    });
    for (const [item, quantity] of lines) {
      await add('field_event_item', {
        field_event_id: event,
        field_event_kind: 'UNIT_RATE',
        item_name_id: await listed('item_name', item),
        quantity,
      });
    }
    return event;
  }

  it('AC-04-63 on white goods keeps its items as lines of the one field event, each an item of the firm’s list with its count, once; no line has a price', async () => {
    await asThePhone();
    const ticket = await itemised(
      unitRate('301006', { address: '40 Birch Ln', address_source: 'TYPED' }),
      'White Goods',
      [
        ['Washer', '2'],
        ['Dryer', '1'],
        ['Fridge, freon recovered', '2'],
        ['Fridge, no freon', '1'],
      ],
    );
    expect(await linesOf(ticket)).toEqual([
      { item: 'Washer', quantity: '2.00' },
      { item: 'Dryer', quantity: '1.00' },
      { item: 'Fridge, freon recovered', quantity: '2.00' },
      { item: 'Fridge, no freon', quantity: '1.00' },
    ]);
    const line = async (more: Row): Promise<Row> => ({
      field_event_id: ticket,
      field_event_kind: 'UNIT_RATE',
      item_name_id: await listed('item_name', 'Oven'),
      quantity: 1,
      ...more,
    });
    expect(
      await refusedRow(
        'field_event_item',
        await line({ item_name_id: await listed('item_name', 'Washer') }),
      ),
    ).toBe(refusedBy.unique);
    expect(
      await refusedRow(
        'field_event_item',
        await line({ item_name_id: '019a0000-0000-7000-8000-00000000dead' }),
      ),
    ).toBe(refusedBy.foreignKey);
    expect(await refusedRow('field_event_item', await line({ quantity: -1 }))).toBe(
      refusedBy.check,
    );
    // An item and how many: no pay item, no rate, no amount.
    expect(await columnsOf('field_event_item')).toEqual([
      'created_at',
      'field_event_id',
      'field_event_kind',
      'id',
      'item_name_id',
      'quantity',
    ]);
  });

  it('AC-04-64 on crew time keeps its items with hours to the quarter hour, and nothing of anybody’s time clock', async () => {
    const { db, world } = tested;
    await asThePhone();
    const ticket = await itemised(
      unitRate('301007', {
        cert_number: '730418',
        certification_id: world.certifications.c730418,
        payable_type_id: world.payableTypes.crewTime,
        pay_item_id: world.payItems.crewTime,
      }),
      'Crew time',
      [
        ['Skid Steer', '9.75'],
        ['Truck', '8.50'],
      ],
    );
    expect(await linesOf(ticket)).toEqual([
      { item: 'Skid Steer', quantity: '9.75' },
      { item: 'Truck', quantity: '8.50' },
    ]);
    expect(
      await db.rows(
        `SELECT table_name || '.' || column_name AS found FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name IN ('field_event', 'field_event_item')
           AND column_name LIKE '%clock%'`,
      ),
    ).toEqual([]);
  });

  it('AC-04-65 on HHW by the pound keeps the pounds as each item’s count', async () => {
    await asThePhone();
    const ticket = await itemised(unitRate('301016'), 'HHW', [
      ['Paint cans', '40'],
      ['Propane tanks', '15'],
    ]);
    expect(await linesOf(ticket)).toEqual([
      { item: 'Paint cans', quantity: '40.00' },
      { item: 'Propane tanks', quantity: '15.00' },
    ]);
  });

  it('AC-04-66 has one kind of work and at most one pay item; only unit rate work has item lines', async () => {
    const { db, world } = tested;
    expect(
      await db.rows(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'field_event'
           AND column_name IN ('kind_of_work_id', 'pay_item_id', 'payable_type_id')
         ORDER BY column_name`,
      ),
    ).toEqual([
      { column_name: 'kind_of_work_id', data_type: 'uuid' },
      { column_name: 'pay_item_id', data_type: 'uuid' },
      { column_name: 'payable_type_id', data_type: 'uuid' },
    ]);
    await asThePhone();
    const washer = await listed('item_name', 'Washer');
    const onALoad = (kind: string): Row => ({
      field_event_id: world.loads.l101001.collection,
      field_event_kind: kind,
      item_name_id: washer,
      quantity: 1,
    });
    expect(await refusedRow('field_event_item', onALoad('COLLECTION'))).toBe(refusedBy.check);
    expect(await refusedRow('field_event_item', onALoad('UNIT_RATE'))).toBe(refusedBy.foreignKey);
  });

  it('AC-04-67 may carry a field tag and an ROE; it holds no debris type, load call or estimate, and a load holds no measurement, root ball, count, payable type or pay item', async () => {
    const { world } = tested;
    const mixed = await fieldTag('Mixed');
    await asThePhone();
    const tagged = await received(
      unitRate('301001', { field_tag_id: mixed, roe_number: 'R-0007' }),
    );
    expect(await kept(tagged, `"field_tag_id"::text AS tag, "roe_number"`)).toEqual({
      tag: mixed,
      roe_number: 'R-0007',
    });
    for (const [what, more] of [
      ['a debris type', vegetative()],
      ['a load call', { load_call: 80 }],
      ['an estimate', { estimate_cy: 12 }],
      ['a count of what a load carries', { carried_count: 3 }],
    ] as const) {
      expect(await refusedEvent(unitRate('301020', more)), what).toBe(refusedBy.check);
    }
    const unitRateOnly: Row = {
      kind_of_work_id: world.kindsOfWork.leaners,
      payable_type_id: world.payableTypes.leaners,
      pay_item_id: world.payItems.leaners24,
      unit_count: 1,
      root_ball_inches: 96,
      root_ball_half_exposed: true,
      survey_number: 'APN 14-0321-007',
      marked_ineligible: false,
    };
    for (const [column, value] of Object.entries(unitRateOnly)) {
      expect(await refusedEvent({ ticket_number: '101021', [column]: value }), column).toBe(
        refusedBy.check,
      );
      expect(await refusedEvent(atTheTower('101021', { [column]: value })), column).toBe(
        refusedBy.check,
      );
    }
    expect(
      await refusedEvent({
        ticket_number: '101021',
        measurement_inches: 18,
        measured_as: 'DIAMETER',
      }),
    ).toBe(refusedBy.check);
  });

  it('AC-04-67 every detail on every kind: the database takes it exactly where packages/domain says that kind records it', async () => {
    const { world } = tested;
    const onHaulOutForm = await mulch();
    const mixed = await fieldTag('Mixed');
    await asThePhone();
    const column = (detail: string): string =>
      detail.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const isHaulOut = (kind: FieldEventKindName): boolean => kind.startsWith('HAUL_OUT');
    // Each detail, as a phone would send it on that kind.
    const sent = (detail: FieldEventDetail, kind: FieldEventKindName): Row => {
      switch (detail) {
        case 'formDebrisTypeId':
          return isHaulOut(kind) ? onHaulOutForm : vegetative();
        case 'fieldTagId':
          return { field_tag_id: mixed };
        case 'roeNumber':
          return { roe_number: 'R-0007' };
        case 'estimateCy':
          return { estimate_cy: 12, ...(kind === 'COLLECTION' ? { split_suffix: 'A' } : {}) };
        case 'loadCall':
          return { load_call: 80 };
        case 'carriedCount':
          return { carried_count: 3 };
        case 'kindOfWorkId':
          return { kind_of_work_id: world.kindsOfWork.leaners };
        case 'payableTypeId':
          return { payable_type_id: world.payableTypes.leaners };
        case 'payItemId':
          return { pay_item_id: world.payItems.leaners24 };
        case 'measurementInches':
        case 'measuredAs':
          return { measurement_inches: 18, measured_as: 'DIAMETER' };
        case 'rootBallInches':
          return { root_ball_inches: 96 };
        case 'rootBallHalfExposed':
          return { root_ball_half_exposed: true };
        case 'surveyNumber':
          return { survey_number: 'APN 14-0321-007' };
        case 'markedIneligible':
          return { marked_ineligible: false };
        case 'unitCount':
          return { unit_count: 1 };
      }
    };
    let ticket = 500000;
    const outcomes: string[] = [];
    const expected: string[] = [];
    for (const kind of fieldEventKinds) {
      const workflow = kind === 'UNIT_RATE' ? 'UNIT_RATE' : isHaulOut(kind) ? 'HAUL_OUT' : 'LOAD';
      for (const detail of fieldEventDetailNames) {
        ticket += 1;
        const event = fieldEventLike(world, {
          workflow,
          kind,
          ticket_number: String(ticket),
          ...sent(detail, kind),
        });
        expect(Object.keys(event)).toContain(column(detail));
        const takes = new FieldEventDetails(kind).takes(detail);
        expected.push(`${kind} ${detail}: ${takes ? 'taken' : refusedBy.check}`);
        if (takes) {
          await tested.db.run(...eventInsertOf(event));
          outcomes.push(`${kind} ${detail}: taken`);
        } else {
          const { code } = await tested.db.refused(...eventInsertOf(event));
          outcomes.push(`${kind} ${detail}: ${code}`);
        }
      }
    }
    expect(outcomes).toEqual(expected);
    expect(outcomes).toHaveLength(5 * 16);
  });

  it('AC-04-68 the monitor marked ineligible says so, and is taken', async () => {
    const { world } = tested;
    await asThePhone();
    const marked = await received(
      unitRate('301015', {
        kind_of_work_id: world.kindsOfWork.hangers,
        payable_type_id: world.payableTypes.hangers,
        pay_item_id: world.payItems.hangers,
        unit_count: 1,
        marked_ineligible: true,
      }),
    );
    expect(await kept(marked, `"marked_ineligible", "status"::text`)).toEqual({
      marked_ineligible: true,
      status: 'PENDING',
    });
  });

  it('AC-04-69 that syncs with no measurement, where its pay item requires one, is taken', async () => {
    const { world } = tested;
    await asThePhone();
    const hanger = await received(
      unitRate('301010', {
        kind_of_work_id: world.kindsOfWork.hangers,
        payable_type_id: world.payableTypes.hangers,
        pay_item_id: world.payItems.hangers,
        unit_count: 1,
      }),
    );
    expect(await kept(hanger, `"measurement_inches", "measured_as", "status"::text`)).toEqual({
      measurement_inches: null,
      measured_as: null,
      status: 'PENDING',
    });
    // Nor is the kind of work, the payable type or the count required: a pick that didn't reach
    // the server is a flag's (ADR-325).
    await received(unitRate('301011'));
  });
});

describe('an ROE on a field event', () => {
  it('AC-04-82 is kept as the number picked or typed; one P2 doesn’t have, and none at all, are taken; a disposal carries none', async () => {
    await asThePhone();
    const collected = await received(
      onP2({ ticket_number: '102004', split_suffix: 'A', estimate_cy: 12, roe_number: 'R-0007' }),
    );
    expect(await kept(collected, `"roe_number"`)).toEqual({ roe_number: 'R-0007' });
    const unknown = await received(onP2({ ticket_number: '102003', roe_number: 'R-0099' }));
    expect(await kept(unknown, `"roe_number", "status"::text`)).toEqual({
      roe_number: 'R-0099',
      status: 'PENDING',
    });
    const none = await received(onP2({ ticket_number: '102002' }));
    expect(await kept(none, `"roe_number"`)).toEqual({ roe_number: null });
    expect(
      await refusedEvent(onP2({ kind: 'DISPOSAL', ticket_number: '102004', roe_number: 'R-0007' })),
    ).toBe(refusedBy.check);
    expect(await refusedEvent(haulOut('HAUL_OUT_COLLECTION', { roe_number: 'R-0007' }))).toBe(
      refusedBy.check,
    );
  });
});

describe('an item line and a carried ticket', () => {
  // White goods ticket 301006 with one line, and load 101014 carrying one ticket.
  async function written(): Promise<{ line: string; carried: string }> {
    await asThePhone();
    const ticket = await received(
      unitRate('301006', { kind_of_work_id: await listed('kind_of_work', 'White Goods') }),
    );
    const line = await add('field_event_item', {
      field_event_id: ticket,
      field_event_kind: 'UNIT_RATE',
      item_name_id: await listed('item_name', 'Washer'),
      quantity: 2,
    });
    const collection = await received({ ticket_number: '101014' });
    const carried = await add('carried_ticket', {
      field_event_id: collection,
      field_event_kind: 'COLLECTION',
      carried_ticket_number: '301004',
    });
    return { line, carried };
  }

  it('AC-04-30 are corrected in place by the API’s login, the prior value kept in the audit log under the person; the worker writes neither and no login deletes one', async () => {
    const { db, world } = tested;
    const { line, carried } = await written();
    await asTheBackOffice();
    expect(
      await db.run(`UPDATE "field_event_item" SET "quantity" = 3 WHERE "id" = $1`, [line]),
    ).toBe(1);
    expect(
      await db.run(
        `UPDATE "carried_ticket" SET "carried_ticket_number" = '301005' WHERE "id" = $1`,
        [carried],
      ),
    ).toBe(1);
    expect(
      await db.rows(
        `SELECT "table_name", "domain"::text, "actor_id"::text AS actor, "changed_fields",
           "prior_value" ->> "changed_fields"[1] AS prior
         FROM "audit_record" WHERE "record_id" = ANY($1) AND "operation" = 'UPDATE'
         ORDER BY "table_name"`,
        [[line, carried]],
      ),
    ).toEqual([
      {
        table_name: 'carried_ticket',
        domain: 'RECORDS',
        actor: world.admin,
        changed_fields: ['carried_ticket_number'],
        prior: '301004',
      },
      {
        table_name: 'field_event_item',
        domain: 'RECORDS',
        actor: world.admin,
        changed_fields: ['quantity'],
        prior: '2.00',
      },
    ]);
    // Neither its id nor when it was written is corrected.
    expect(
      (
        await db.refused(`UPDATE "field_event_item" SET "created_at" = now() WHERE "id" = $1`, [
          line,
        ])
      ).code,
    ).toBe(refusedBy.grant);
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(await db.rows(`SELECT 1 FROM "field_event_item" WHERE "id" = $1`, [line])).toHaveLength(
      1,
    );
    for (const statement of [
      `UPDATE "field_event_item" SET "quantity" = 4 WHERE "id" = '${line}'`,
      `UPDATE "carried_ticket" SET "carried_ticket_number" = '301006' WHERE "id" = '${carried}'`,
      `INSERT INTO "carried_ticket" ("field_event_id", "field_event_kind", "carried_ticket_number")
       SELECT "field_event_id", "field_event_kind", '301007' FROM "carried_ticket"`,
    ]) {
      expect((await db.refused(statement)).code, statement).toBe(refusedBy.grant);
    }
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly', 'adms_owner'] as const) {
      await db.as(login);
      await db.actor(world.admin, 'BACK_OFFICE');
      await db.refused(`DELETE FROM "field_event_item" WHERE "id" = $1`, [line]);
      await db.refused(`DELETE FROM "carried_ticket" WHERE "id" = $1`, [carried]);
    }
  });

  it('AC-04-31 are seen by a client user and an auditor with the field events of their projects, the new columns included; a contractor user sees none', async () => {
    const { db, world } = tested;
    await written();
    // A line on P2's unit rate work, which the client user isn't given.
    await asThePhone();
    const p2Ticket = await received(
      onP2({ ...unitRate('302001'), cert_number: '730416', certification_id: null }),
    );
    await add('field_event_item', {
      field_event_id: p2Ticket,
      field_event_kind: 'UNIT_RATE',
      item_name_id: await listed('item_name', 'Dryer'),
      quantity: 1,
    });
    const seenBy = async (viewer: string): Promise<Row> => {
      await db.administer();
      await db.viewer(viewer);
      await db.as('adms_readonly');
      const seen = await db.one(
        `SELECT (SELECT count(*)::int FROM "viewer_field_event_item") AS lines,
           (SELECT count(*)::int FROM "viewer_carried_ticket") AS carried,
           (SELECT count(*)::int FROM "viewer_field_event"
            WHERE "form_debris_type_id" IS NOT NULL) AS picked`,
      );
      await db.administer();
      return seen;
    };
    // The client user, given P1: its one line, its one carried ticket, and the four field events
    // of loads 101001 and 101002 with the debris type each picked.
    expect(await seenBy(world.clientViewer)).toEqual({ lines: 1, carried: 1, picked: 4 });
    expect(await seenBy(world.auditor)).toEqual({ lines: 2, carried: 1, picked: 4 });
    expect(await seenBy(world.coastlineViewer)).toEqual({ lines: 0, carried: 0, picked: 0 });
    // The view shows every column of the field event, as it is kept.
    expect(await columnsOf('viewer_field_event')).toEqual(await columnsOf('field_event'));
  });
});
