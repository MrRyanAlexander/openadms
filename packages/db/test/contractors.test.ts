// REQ-106e's tiers: contractors on a project, and contracts (spec/DATA-MODEL.md §2.1, §3 "Contracts
// and forms"; ADR-102 (Q-97), 108, 146, 239, 305, 306). Section B of spec/acceptance/01-setup.md,
// proven at the database: AC-01-15…18, 20, 21, 82, and AC-01-78 for these tables. That no step of setup asks
// for subs (AC-01-19) is a story's, with the certification that types one in (the story
// `certification`, ADR-321). The example world has Rivera Trucking under Coastline on P1 and on P2,
// as the certifications of its self-loader left it; a test that needs another sub places one as a
// certification would.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { insertOf, primeOn, projectLike, subOn } from './support/example-world.ts';
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

const hauler = (name: string): Promise<string> => add('contractor', { name, kind: 'HAULER' });

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

// A closed set's values, in the order the database holds them.
async function valuesOf(set: string): Promise<string[]> {
  const rows = await tested.db.rows<{ value: string }>(
    `SELECT e.enumlabel AS value FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = $1 ORDER BY e.enumsortorder`,
    [set],
  );
  return rows.map((row) => row.value);
}

async function columnsOf(table: string): Promise<string[]> {
  const rows = await tested.db.rows<{ column: string }>(
    `SELECT column_name AS column FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((row) => row.column);
}

interface Place {
  contractor: string;
  position: string;
  under: string | null;
}

// Who is on a project and where: each contractor, its position and the prime it works under.
// Primes first, then each tier.
async function placesOn(projectId: string, where = 'TRUE'): Promise<Place[]> {
  return tested.db.rows<Place>(
    `SELECT c."name" AS contractor, p."position"::text, prime."name" AS under
     FROM "project_contractor" p JOIN "contractor" c ON c."id" = p."contractor_id"
       LEFT JOIN "contractor" prime ON prime."id" = p."prime_id"
     WHERE p."project_id" = $1 AND ${where} ORDER BY p."position", c."name"`,
    [projectId],
  );
}

interface Held {
  name: string;
  prime: string;
  link: string | null;
}

async function contractsOn(projectId: string): Promise<Held[]> {
  return tested.db.rows<Held>(
    `SELECT k."name", c."name" AS prime, k."signed_copy_url" AS link
     FROM "contract" k JOIN "contractor" c ON c."id" = k."prime_id"
     WHERE k."project_id" = $1 ORDER BY k."name"`,
    [projectId],
  );
}

const coastline = 'Coastline Haulers LLC';
const summit = 'Summit Debris Services';

describe('a contractor', () => {
  it('AC-01-20 Harbor Staffing, a temp agency that employs monitors, is a contractor of the monitoring kind', async () => {
    const { db, world } = tested;
    expect(
      await db.one(`SELECT "name", "kind"::text FROM "contractor" WHERE "id" = $1`, [world.harbor]),
    ).toEqual({ name: 'Harbor Staffing', kind: 'MONITORING' });
    await asTheApi();
    await db.run(`UPDATE "user" SET "employer_id" = $2 WHERE "id" = $1`, [
      world.monitor,
      world.harbor,
    ]);
    // It is on no project: employing monitors needs no place on one.
    expect(
      await db.rows(`SELECT 1 FROM "project_contractor" WHERE "contractor_id" = $1`, [
        world.harbor,
      ]),
    ).toEqual([]);
  });

  it('AC-01-20 its kind is one of hauler, monitoring, crew, other, and no other', async () => {
    const { db } = tested;
    expect(await valuesOf('contractor_kind')).toEqual(['HAULER', 'MONITORING', 'CREW', 'OTHER']);
    await asTheApi();
    for (const kind of ['HAULER', 'MONITORING', 'CREW', 'OTHER']) {
      const id = await add('contractor', { name: `A ${kind} contractor`, kind });
      expect(
        await db.one(`SELECT "kind"::text FROM "contractor" WHERE "id" = $1`, [id]),
        kind,
      ).toEqual({ kind });
    }
    const other = await db.refused(
      ...insertOf('contractor', { name: 'Harbor Staffing', kind: 'TEMP_AGENCY' }),
    );
    expect(other.code).toBe(refusedBy.badValue);
  });

  it('AC-01-20 whoever adds it says its kind: none is refused, and the database stands none in', async () => {
    const { db } = tested;
    await asTheApi();
    const none = await db.refused(...insertOf('contractor', { name: 'Pinewood Hauling' }));
    expect(none.code).toBe(refusedBy.notNull);
    expect(none.message).toContain('"kind"');
    const defaults = await db.rows<{ column: string }>(
      `SELECT column_name AS column FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'contractor' AND column_default IS NOT NULL
       ORDER BY column_name`,
    );
    expect(defaults.map((row) => row.column)).toEqual(['created_at', 'id']);
  });

  it('needs its name; it is prime or sub only by its place on a project, never by itself', async () => {
    const { db } = tested;
    await asTheApi();
    const noName = await db.refused(...insertOf('contractor', { name: null, kind: 'HAULER' }));
    expect(noName.code).toBe(refusedBy.notNull);
    expect((await columnsOf('contractor')).sort()).toEqual(
      [
        'id',
        'name',
        'kind',
        'contact_name',
        'contact_email',
        'contact_phone',
        'merged_into_id',
        'created_at',
        'archived_at',
      ].sort(),
    );
  });

  it('AC-01-82 holds contact details, as a client does: when Coastline’s contact phone changes it keeps its record, the new value saved, one audit record with the prior value and Dana as actor', async () => {
    const { db, world } = tested;
    await asTheApi();
    expect(
      await db.run(`UPDATE "contractor" SET "contact_phone" = '555-0143' WHERE "id" = $1`, [
        world.coastline,
      ]),
    ).toBe(1);
    expect(
      await db.rows(
        `SELECT "id"::text, "contact_name", "contact_email", "contact_phone" FROM "contractor"
         WHERE "name" = 'Coastline Haulers LLC'`,
      ),
    ).toEqual([
      {
        id: world.coastline,
        contact_name: 'Coastline Haulers dispatch',
        contact_email: null,
        contact_phone: '555-0143',
      },
    ]);
    const records = await auditOf(world.coastline);
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({
      operation: 'UPDATE',
      changed: ['contact_phone'],
      prior: { name: 'Coastline Haulers LLC', contact_phone: '555-0110' },
      actor: world.admin,
      source: 'BACK_OFFICE',
      domain: 'OPERATIONS',
    });
  });

  it('AC-01-82 its contact is optional, each part on its own: Summit has none, and a sub typed in at certification needs none', async () => {
    const { db, world } = tested;
    const none = { contact_name: null, contact_email: null, contact_phone: null };
    const contact = `SELECT "contact_name", "contact_email", "contact_phone" FROM "contractor" WHERE "id" = $1`;
    expect(await db.one(contact, [world.summit])).toEqual(none);
    await asTheApi();
    expect(await db.one(contact, [await hauler('Rivera Trucking')])).toEqual(none);
    const pinewood = await add('contractor', {
      name: 'Pinewood Hauling',
      kind: 'HAULER',
      contact_email: 'office@pinewoodhauling.example',
    });
    expect(await db.one(contact, [pinewood])).toEqual({
      ...none,
      contact_email: 'office@pinewoodhauling.example',
    });
  });

  it('AC-01-21 the same sub typed twice under two spellings is merged: one marked as merged into the other and archived, audited, neither deleted', async () => {
    const { db, world } = tested;
    await asTheApi();
    const kept = await hauler('Rivera Trucking');
    const typedAgain = await hauler('Rivera Trucking Inc');
    expect(
      await db.run(
        `UPDATE "contractor" SET "merged_into_id" = $2, "archived_at" = '2026-10-14T16:00:00Z'
         WHERE "id" = $1`,
        [typedAgain, kept],
      ),
    ).toBe(1);
    expect(
      await db.rows(
        `SELECT c."name", into_."name" AS merged_into, c."archived_at" IS NOT NULL AS archived
         FROM "contractor" c LEFT JOIN "contractor" into_ ON into_."id" = c."merged_into_id"
         WHERE c."id" = ANY($1) ORDER BY c."name"`,
        [[kept, typedAgain]],
      ),
    ).toEqual([
      { name: 'Rivera Trucking', merged_into: null, archived: false },
      { name: 'Rivera Trucking Inc', merged_into: 'Rivera Trucking', archived: true },
    ]);
    const dana = { actor: world.admin, source: 'BACK_OFFICE', domain: 'OPERATIONS' };
    expect(await auditOf(typedAgain)).toMatchObject([
      { operation: 'INSERT', ...dana },
      {
        operation: 'UPDATE',
        changed: ['archived_at', 'merged_into_id'],
        prior: { name: 'Rivera Trucking Inc', merged_into_id: null, archived_at: null },
        ...dana,
      },
    ]);
    // The one kept is untouched by the merge.
    expect(await auditOf(kept)).toHaveLength(1);
    for (const id of [kept, typedAgain]) {
      expect((await db.refused(`DELETE FROM "contractor" WHERE "id" = $1`, [id])).code).toBe(
        refusedBy.grant,
      );
    }
    await db.as('adms_owner');
    for (const id of [kept, typedAgain]) {
      expect(await db.refused(`DELETE FROM "contractor" WHERE "id" = $1`, [id])).toEqual({
        code: refusedBy.trigger,
        message: 'Open ADMS never deletes a contractor row: archive, close or void it instead',
      });
    }
  });

  it('AC-01-21 a merged contractor is merged into another record, one that exists, and is archived for as long as it is merged', async () => {
    const { db, world } = tested;
    await asTheApi();
    const kept = await hauler('Rivera Trucking');
    const typedAgain = await hauler('Rivera Trucking Inc');
    const merge = `UPDATE "contractor" SET "merged_into_id" = $2, "archived_at" = $3 WHERE "id" = $1`;
    const itself = await db.refused(merge, [typedAgain, typedAgain, '2026-10-14T16:00:00Z']);
    expect(itself.code).toBe(refusedBy.check);
    expect(itself.message).toContain('"contractor_merged_into_another_check"');
    const notArchived = await db.refused(merge, [typedAgain, kept, null]);
    expect(notArchived.code).toBe(refusedBy.check);
    expect(notArchived.message).toContain('"contractor_merged_is_archived_check"');
    const nobody = await db.refused(merge, [typedAgain, world.p1, '2026-10-14T16:00:00Z']);
    expect(nobody.code).toBe(refusedBy.foreignKey);

    await db.run(merge, [typedAgain, kept, '2026-10-14T16:00:00Z']);
    const backOnOffer = await db.refused(
      `UPDATE "contractor" SET "archived_at" = NULL WHERE "id" = $1`,
      [typedAgain],
    );
    expect(backOnOffer.code).toBe(refusedBy.check);
    // A merge made by mistake is undone whole, audited like any edit.
    expect(
      await db.run(
        `UPDATE "contractor" SET "merged_into_id" = NULL, "archived_at" = NULL WHERE "id" = $1`,
        [typedAgain],
      ),
    ).toBe(1);
    expect((await auditOf(typedAgain)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['archived_at', 'merged_into_id'],
      prior: { merged_into_id: kept },
      actor: world.admin,
    });
  });
});

describe('a contractor’s place on a project', () => {
  it('AC-01-16 P1 has two primes, Coastline and Summit, each with its own contract; a second prime is added to P2 the same way', async () => {
    const { world } = tested;
    expect(await placesOn(world.p1)).toEqual([
      { contractor: coastline, position: 'PRIME', under: null },
      { contractor: summit, position: 'PRIME', under: null },
      { contractor: 'Rivera Trucking', position: 'SUB_TIER_1', under: coastline },
    ]);
    expect(await contractsOn(world.p1)).toEqual([
      { name: 'Coastline, Bayline ROW 2026', prime: coastline, link: null },
      { name: 'Summit, Bayline ROW 2026', prime: summit, link: null },
    ]);

    await asTheApi();
    const place = await add('project_contractor', primeOn(world.p2, world.summit));
    const contract = await add('contract', {
      project_id: world.p2,
      name: 'Summit, Bayline PPDR 2026',
      prime_id: world.summit,
    });
    expect(await placesOn(world.p2, `p."position" = 'PRIME'`)).toEqual([
      { contractor: coastline, position: 'PRIME', under: null },
      { contractor: summit, position: 'PRIME', under: null },
    ]);
    expect(await contractsOn(world.p2)).toEqual([
      { name: 'Coastline, Bayline PPDR 2026', prime: coastline, link: null },
      { name: 'Summit, Bayline PPDR 2026', prime: summit, link: null },
    ]);
    const dana = { operation: 'INSERT', actor: world.admin, source: 'BACK_OFFICE' };
    expect(await auditOf(place)).toMatchObject([{ ...dana, domain: 'OPERATIONS' }]);
    expect(await auditOf(contract)).toMatchObject([{ ...dana, domain: 'BILLING' }]);
  });

  it('AC-01-17 Rivera Trucking, a sub under Coastline on P1, can’t be placed under Summit on P1 as well: a contractor has one place on a project', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { rivera } = world;
    for (const again of [
      subOn(world.p1, rivera, world.summit),
      subOn(world.p1, rivera, world.summit, 2),
      subOn(world.p1, rivera, world.coastline, 2),
      primeOn(world.p1, rivera),
    ]) {
      const refusal = await db.refused(...insertOf('project_contractor', again));
      expect(refusal.code, JSON.stringify(again)).toBe(refusedBy.unique);
      expect(refusal.message).toContain('"project_contractor_project_id_contractor_id_key"');
    }
    // Still refused once its place is archived: taken off the project, its place is kept.
    await db.run(
      `UPDATE "project_contractor" SET "archived_at" = now()
       WHERE "project_id" = $1 AND "contractor_id" = $2`,
      [world.p1, rivera],
    );
    expect(
      (await db.refused(...insertOf('project_contractor', subOn(world.p1, rivera, world.summit))))
        .code,
    ).toBe(refusedBy.unique);
    expect(await placesOn(world.p1)).toEqual([
      { contractor: coastline, position: 'PRIME', under: null },
      { contractor: summit, position: 'PRIME', under: null },
      { contractor: 'Rivera Trucking', position: 'SUB_TIER_1', under: coastline },
    ]);
    // One place per project: on P2 it has its own, and a tier 2 sub may sit beside it there.
    expect(await placesOn(world.p2, `c."name" = 'Rivera Trucking'`)).toEqual([
      { contractor: 'Rivera Trucking', position: 'SUB_TIER_1', under: coastline },
    ]);
    const pinewood = await hauler('Pinewood Hauling');
    await add('project_contractor', subOn(world.p2, pinewood, world.coastline, 2));
    expect(await placesOn(world.p2, `c."name" = 'Pinewood Hauling'`)).toEqual([
      { contractor: 'Pinewood Hauling', position: 'SUB_TIER_2', under: coastline },
    ]);
  });

  it('AC-01-18 a sub is tier 1 or tier 2 and names the prime it works under; a third tier doesn’t exist', async () => {
    const { db, world } = tested;
    expect(await valuesOf('contractor_position')).toEqual(['PRIME', 'SUB_TIER_1', 'SUB_TIER_2']);
    await asTheApi();
    const { rivera } = world;
    const pinewood = await hauler('Pinewood Hauling');
    await add('project_contractor', subOn(world.p1, pinewood, world.coastline, 2));
    expect(await placesOn(world.p1, `p."position" <> 'PRIME'`)).toEqual([
      { contractor: 'Rivera Trucking', position: 'SUB_TIER_1', under: coastline },
      { contractor: 'Pinewood Hauling', position: 'SUB_TIER_2', under: coastline },
    ]);
    const third = await db.refused(
      ...insertOf('project_contractor', {
        ...subOn(world.p2, rivera, world.coastline),
        position: 'SUB_TIER_3',
      }),
    );
    expect(third.code).toBe(refusedBy.badValue);
  });

  it.each([1, 2] as const)(
    'AC-01-18 a tier %i sub that names no prime is refused; a prime names none',
    async (tier) => {
      const { db, world } = tested;
      await asTheApi();
      const rivera = await hauler('Rivera Trucking');
      const noPrime = await db.refused(
        ...insertOf('project_contractor', {
          ...subOn(world.p1, rivera, world.coastline, tier),
          prime_id: null,
        }),
      );
      expect(noPrime.code).toBe(refusedBy.check);
      expect(noPrime.message).toContain('"project_contractor_prime_check"');
      const primeUnderPrime = await db.refused(
        ...insertOf('project_contractor', {
          ...primeOn(world.p1, rivera),
          prime_id: world.coastline,
        }),
      );
      expect(primeUnderPrime.code).toBe(refusedBy.check);
      expect(primeUnderPrime.message).toContain('"project_contractor_prime_check"');
    },
  );

  it('AC-01-18 the prime a sub names is one of its own project’s primes: a sub, a contractor that isn’t on the project, another project’s prime and the sub itself are each refused', async () => {
    const { db, world } = tested;
    await asTheApi();
    const rivera = await hauler('Rivera Trucking');
    const pinewood = await hauler('Pinewood Hauling');
    const elsewhere = await hauler('Gulfside Hauling');
    await add('project_contractor', subOn(world.p1, rivera, world.coastline));
    await add('project_contractor', primeOn(world.p2, elsewhere));
    const named: [string, string][] = [
      ['Rivera, a sub: there is no tier under a sub', rivera],
      ['Harbor Staffing, on no project', world.harbor],
      ['a prime of P2 only', elsewhere],
      ['itself', pinewood],
      ['no contractor at all', world.p1],
    ];
    for (const [who, primeId] of named) {
      const refusal = await db.refused(
        ...insertOf('project_contractor', subOn(world.p1, pinewood, primeId, 2)),
      );
      expect(refusal.code, who).toBe(refusedBy.foreignKey);
      expect(refusal.message, who).toContain('"project_contractor_project_id_prime_id_fkey"');
    }
    // Summit is P1's prime too, so it may be named.
    await add('project_contractor', subOn(world.p1, pinewood, world.summit, 2));
  });

  it('a prime’s row carries its own contractor as the key the others point at; a sub’s row carries none', async () => {
    const { db, world } = tested;
    await asTheApi();
    const rivera = await hauler('Rivera Trucking');
    const rows: Record<string, unknown>[] = [
      { ...primeOn(world.p2, rivera), as_prime_id: null },
      { ...primeOn(world.p2, rivera), as_prime_id: world.summit },
      { ...subOn(world.p2, rivera, world.coastline), as_prime_id: rivera },
    ];
    for (const row of rows) {
      const refusal = await db.refused(...insertOf('project_contractor', row));
      expect(refusal.code, JSON.stringify(row)).toBe(refusedBy.check);
      expect(refusal.message).toContain('"project_contractor_as_prime_check"');
    }
    expect(
      await db.rows(
        `SELECT "position"::text, "as_prime_id" = "contractor_id" AS own FROM "project_contractor"
         WHERE "project_id" = $1 ORDER BY "created_at"`,
        [world.p1],
      ),
    ).toEqual([
      { position: 'PRIME', own: true },
      { position: 'PRIME', own: true },
      { position: 'SUB_TIER_1', own: null },
    ]);
  });

  it('a prime can’t be made a sub while a sub or a contract names it; one that nothing names can', async () => {
    const { db, world } = tested;
    await asTheApi();
    const rivera = await hauler('Rivera Trucking');
    const gulfside = await hauler('Gulfside Hauling');
    const pinewood = await hauler('Pinewood Hauling');
    const demote = `UPDATE "project_contractor"
      SET "position" = 'SUB_TIER_1', "prime_id" = $3, "as_prime_id" = NULL
      WHERE "project_id" = $1 AND "contractor_id" = $2`;
    // Gulfside, a second prime on P2: Rivera works under it, and it holds no contract.
    await add('project_contractor', primeOn(world.p2, gulfside));
    await add('project_contractor', subOn(world.p2, rivera, gulfside));
    const named = await db.refused(demote, [world.p2, gulfside, world.coastline]);
    expect(named.code).toBe(refusedBy.restrict);
    expect(named.message).toContain('"project_contractor_project_id_prime_id_fkey"');
    // Summit on P1 holds a contract and has no subs.
    const holds = await db.refused(demote, [world.p1, world.summit, world.coastline]);
    expect(holds.code).toBe(refusedBy.restrict);
    expect(holds.message).toContain('"contract_project_id_prime_id_fkey"');
    // Pinewood, a third prime on P2: nothing names it yet.
    await add('project_contractor', primeOn(world.p2, pinewood));
    expect(await db.run(demote, [world.p2, pinewood, world.coastline])).toBe(1);
    expect(await placesOn(world.p2, `c."name" = 'Pinewood Hauling'`)).toEqual([
      { contractor: 'Pinewood Hauling', position: 'SUB_TIER_1', under: coastline },
    ]);
  });

  it('is taken off the project by archiving, audited; its subs and its contracts still point at it', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id } = await db.one<{ id: string }>(
      `UPDATE "project_contractor" SET "archived_at" = now()
       WHERE "project_id" = $1 AND "contractor_id" = $2 RETURNING "id"::text`,
      [world.p1, world.coastline],
    );
    expect((await auditOf(id)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['archived_at'],
      prior: { archived_at: null },
      actor: world.admin,
      domain: 'OPERATIONS',
    });
    expect(await placesOn(world.p1, 'p."archived_at" IS NULL')).toEqual([
      { contractor: summit, position: 'PRIME', under: null },
      { contractor: 'Rivera Trucking', position: 'SUB_TIER_1', under: coastline },
    ]);
    expect((await contractsOn(world.p1)).map((held) => held.prime)).toEqual([coastline, summit]);
  });

  it.each(['project_id', 'contractor_id', 'position'])(
    'needs its %s, and names records that exist',
    async (column) => {
      const { db, world } = tested;
      await asTheApi();
      const rivera = await hauler('Rivera Trucking');
      const whole = subOn(world.p1, rivera, world.coastline);
      const none = await db.refused(
        ...insertOf('project_contractor', { ...whole, [column]: null }),
      );
      expect(none.code).toBe(refusedBy.notNull);
      if (column === 'position') return;
      const unknown = await db.refused(
        ...insertOf('project_contractor', { ...whole, [column]: world.monitor }),
      );
      expect(unknown.code).toBe(refusedBy.foreignKey);
    },
  );
});

describe('a contract', () => {
  it('AC-01-15 "Coastline, Bayline ROW 2026" holds a name, its prime and an optional link to the signed copy, and nothing else: no number, dates or amount', async () => {
    const { db, world } = tested;
    expect(
      await db.one(
        `SELECT k."name", c."name" AS prime, p."name" AS project, k."signed_copy_url",
           k."archived_at"
         FROM "contract" k JOIN "contractor" c ON c."id" = k."prime_id"
           JOIN "project" p ON p."id" = k."project_id"
         WHERE k."id" = $1`,
        [world.contracts.coastlineP1],
      ),
    ).toEqual({
      name: 'Coastline, Bayline ROW 2026',
      prime: coastline,
      project: 'Bayline County ROW, Hurricane Delphine',
      signed_copy_url: null,
      archived_at: null,
    });
    // Beside those three: the record's own id, its project, and when it was made and archived.
    expect((await columnsOf('contract')).sort()).toEqual(
      [
        'id',
        'project_id',
        'name',
        'prime_id',
        'signed_copy_url',
        'created_at',
        'archived_at',
      ].sort(),
    );
    expect(await auditOf(world.contracts.coastlineP1)).toMatchObject([
      { operation: 'INSERT', actor: world.admin, source: 'BACK_OFFICE', domain: 'BILLING' },
    ]);

    await asTheApi();
    const link = 'https://files.gatesdr.example/contracts/coastline-bayline-row-2026.pdf';
    await db.run(`UPDATE "contract" SET "signed_copy_url" = $2 WHERE "id" = $1`, [
      world.contracts.coastlineP1,
      link,
    ]);
    expect((await contractsOn(world.p1))[0]).toEqual({
      name: 'Coastline, Bayline ROW 2026',
      prime: coastline,
      link,
    });
    expect((await auditOf(world.contracts.coastlineP1)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['signed_copy_url'],
      prior: { signed_copy_url: null },
      actor: world.admin,
      domain: 'BILLING',
    });
  });

  it('AC-01-15 the contractor is added to the project first: on a new project Coastline’s contract is refused until Coastline is one of its primes', async () => {
    const { db, world } = tested;
    await asTheApi();
    const parks = await add('project', projectLike(world));
    const contract = {
      project_id: parks,
      name: 'Coastline, Bayline PARKS 2026',
      prime_id: world.coastline,
    };
    const early = await db.refused(...insertOf('contract', contract));
    expect(early.code).toBe(refusedBy.foreignKey);
    expect(early.message).toContain('"contract_project_id_prime_id_fkey"');
    await add('project_contractor', primeOn(parks, world.coastline));
    await add('contract', contract);
    expect(await contractsOn(parks)).toEqual([
      { name: 'Coastline, Bayline PARKS 2026', prime: coastline, link: null },
    ]);
  });

  it('its prime is one of its own project’s primes: a sub, a contractor on no project, another project’s prime and no contractor at all are each refused', async () => {
    const { db, world } = tested;
    await asTheApi();
    const rivera = await hauler('Rivera Trucking');
    const elsewhere = await hauler('Gulfside Hauling');
    await add('project_contractor', subOn(world.p1, rivera, world.coastline));
    await add('project_contractor', primeOn(world.p2, elsewhere));
    const named: [string, string][] = [
      ['Rivera, a sub on P1', rivera],
      ['Harbor Staffing, on no project', world.harbor],
      ['a prime of P2 only', elsewhere],
      ['no contractor at all', world.p1],
    ];
    for (const [who, primeId] of named) {
      const refusal = await db.refused(
        ...insertOf('contract', { project_id: world.p1, name: 'A contract', prime_id: primeId }),
      );
      expect(refusal.code, who).toBe(refusedBy.foreignKey);
    }
    // And it can't be moved to one afterwards.
    const moved = await db.refused(`UPDATE "contract" SET "prime_id" = $2 WHERE "id" = $1`, [
      world.contracts.coastlineP1,
      rivera,
    ]);
    expect(moved.code).toBe(refusedBy.foreignKey);
    const toP2 = await db.refused(`UPDATE "contract" SET "project_id" = $2 WHERE "id" = $1`, [
      world.contracts.summitP1,
      world.p2,
    ]);
    expect(toP2.code).toBe(refusedBy.foreignKey);
  });

  it('a prime may hold one contract on a project or several', async () => {
    const { world } = tested;
    await asTheApi();
    await add('contract', {
      project_id: world.p1,
      name: 'Coastline, Bayline ROW 2026, amendment 1',
      prime_id: world.coastline,
    });
    expect((await contractsOn(world.p1)).map((held) => [held.name, held.prime])).toEqual([
      ['Coastline, Bayline ROW 2026', coastline],
      ['Coastline, Bayline ROW 2026, amendment 1', coastline],
      ['Summit, Bayline ROW 2026', summit],
    ]);
  });

  it.each(['project_id', 'name', 'prime_id'])('needs its %s', async (column) => {
    const { db, world } = tested;
    await asTheApi();
    const whole = { project_id: world.p1, name: 'A contract', prime_id: world.coastline };
    const none = await db.refused(...insertOf('contract', { ...whole, [column]: null }));
    expect(none.code).toBe(refusedBy.notNull);
  });
});

// What an edit changes on each table, its audit domain, and the row of the example world to try it
// on.
const edited: [
  string,
  string,
  string,
  string,
  (world: typeof tested.world) => string | undefined,
][] = [
  ['contractor', 'name', 'Coastline Haulers', 'OPERATIONS', (world) => world.coastline],
  [
    'project_contractor',
    'archived_at',
    '2026-11-01T12:00:00Z',
    'OPERATIONS',
    (world) => world.written['project_contractor']?.[0],
  ],
  [
    'contract',
    'name',
    'Coastline, Bayline County ROW 2026',
    'BILLING',
    (world) => world.contracts.coastlineP1,
  ],
];

describe('their relations', () => {
  it('every foreign key of the three tables, as written: each refuses a delete or a change of what it points at', async () => {
    const rows = await tested.db.rows<{ name: string; definition: string }>(
      `SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint
       WHERE contype = 'f' AND conrelid = ANY($1::regclass[]) ORDER BY conname`,
      [['contractor', 'project_contractor', 'contract']],
    );
    const restrict = 'ON UPDATE RESTRICT ON DELETE RESTRICT';
    const aPrimesPlace = 'project_contractor(project_id, as_prime_id)';
    expect(rows).toEqual([
      {
        name: 'contract_prime_id_fkey',
        definition: `FOREIGN KEY (prime_id) REFERENCES contractor(id) ${restrict}`,
      },
      {
        name: 'contract_project_id_fkey',
        definition: `FOREIGN KEY (project_id) REFERENCES project(id) ${restrict}`,
      },
      {
        name: 'contract_project_id_prime_id_fkey',
        definition: `FOREIGN KEY (project_id, prime_id) REFERENCES ${aPrimesPlace} ${restrict}`,
      },
      {
        name: 'contractor_merged_into_id_fkey',
        definition: `FOREIGN KEY (merged_into_id) REFERENCES contractor(id) ${restrict}`,
      },
      {
        name: 'project_contractor_contractor_id_fkey',
        definition: `FOREIGN KEY (contractor_id) REFERENCES contractor(id) ${restrict}`,
      },
      {
        name: 'project_contractor_project_id_fkey',
        definition: `FOREIGN KEY (project_id) REFERENCES project(id) ${restrict}`,
      },
      {
        name: 'project_contractor_project_id_prime_id_fkey',
        definition: `FOREIGN KEY (project_id, prime_id) REFERENCES ${aPrimesPlace} ${restrict}`,
      },
    ]);
  });
});

describe('changing them', () => {
  it.each(edited)(
    'AC-01-78 a %s row: an edit is audited with the prior value and its actor; a delete or a truncate is refused',
    async (table, column, value, domain, rowOf) => {
      const { db, world } = tested;
      const id = rowOf(world);
      if (id === undefined) throw new Error(`The example world wrote no ${table} row.`);
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
        domain,
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

  it('AC-01-78 a contract is archived, never deleted; a contractor archived stays on its projects and its contracts', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.run(`UPDATE "contract" SET "archived_at" = now() WHERE "id" = $1`, [
      world.contracts.summitP1,
    ]);
    await db.run(`UPDATE "contractor" SET "archived_at" = now() WHERE "id" = $1`, [world.summit]);
    expect(
      await db.one(
        `SELECT k."name", k."archived_at" IS NOT NULL AS archived, c."name" AS prime,
           c."archived_at" IS NOT NULL AS prime_archived
         FROM "contract" k JOIN "contractor" c ON c."id" = k."prime_id" WHERE k."id" = $1`,
        [world.contracts.summitP1],
      ),
    ).toEqual({
      name: 'Summit, Bayline ROW 2026',
      archived: true,
      prime: summit,
      prime_archived: true,
    });
    expect(await placesOn(world.p1)).toHaveLength(3);
    expect((await auditOf(world.contracts.summitP1)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['archived_at'],
      actor: world.admin,
    });
  });

  // Three primes' places and Rivera's two; three contracts.
  it.each([
    ['project_contractor', 5],
    ['contract', 3],
  ] as const)('the worker reads %s and may not write it', async (table, held) => {
    const { db, world } = tested;
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(await db.rows(`SELECT 1 FROM "${table}"`)).toHaveLength(held);
    expect((await db.refused(`UPDATE "${table}" SET "created_at" = now()`)).code).toBe(
      refusedBy.grant,
    );
    expect((await db.refused(`INSERT INTO "${table}" DEFAULT VALUES`)).code).toBe(refusedBy.grant);
  });
});
