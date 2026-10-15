// What the database's own constraints refused, as the API tells it (ARCHITECTURE §6, Output;
// AC-10-33, 38; T-26; ADR-424): read from what Prisma throws, with no database here. The same
// refusals through the real endpoints, on the real database, are setup-endpoints.test.ts's.
import { describe, expect, it } from 'vitest';

import { databaseRefusalOf } from '../src/process/database-refusal.ts';

// What Prisma throws, as seen on the installation's database (2026-10-08).
const thrown = (code: string, cause?: object) => ({
  name: 'PrismaClientKnownRequestError',
  code,
  message: 'Invalid `tx.project.create()` invocation in /srv/apps/api/src/setup/project-setup.ts',
  meta: { modelName: 'Project', ...(cause === undefined ? {} : { driverAdapterError: { cause } }) },
});
const postgres = (originalCode: string, originalMessage: string) =>
  thrown('P2039', { originalCode, originalMessage, kind: 'postgres' });

describe('a refusal by the database’s own constraints', () => {
  it('AC-10-38 a key the database keeps once is answered 409 in plain words for that key, and by its kind where the API has no words for it', () => {
    const second = thrown('P2002', {
      originalCode: '23505',
      originalMessage:
        'duplicate key value violates unique constraint "project_contractor_project_id_contractor_id_key"',
      kind: 'UniqueConstraintViolation',
      constraint: { index: 'project_contractor_project_id_contractor_id_key' },
    });
    expect(databaseRefusalOf(second)).toEqual({
      code: 'ALREADY_HELD',
      status: 409,
      said: 'Not saved: that contractor already has a place on the project.',
      sqlState: '23505',
      constraint: 'project_contractor_project_id_contractor_id_key',
    });
    const unnamed = thrown('P2002', {
      originalCode: '23505',
      constraint: { index: 'a_key_nobody_wrote_words_for' },
    });
    expect(databaseRefusalOf(unnamed)).toMatchObject({
      code: 'ALREADY_HELD',
      status: 409,
      said: 'Not saved: there is already one of these.',
    });
  });

  it('a record the request names that isn’t on record is 422; a check, an exclusion, a blank or a value of the wrong kind is 422 too; a record a call needed by its id is 404', () => {
    const unknown = thrown('P2003', {
      originalCode: '23503',
      constraint: { index: 'project_client_id_fkey' },
    });
    expect(databaseRefusalOf(unknown)).toMatchObject({
      code: 'UNKNOWN_RECORD',
      status: 422,
      said: 'Not saved: something this names isn’t on record.',
    });
    const check = postgres(
      '23514',
      'new row for relation "project" violates check constraint "project_time_zone_named_check"',
    );
    expect(databaseRefusalOf(check)).toMatchObject({
      code: 'REFUSED_BY_THE_DATABASE',
      status: 422,
      said: 'Not saved: the time zone must be an IANA name, such as America/New_York.',
      constraint: 'project_time_zone_named_check',
    });
    for (const sqlState of ['23P01', '23502', '22P02', '22023']) {
      expect(databaseRefusalOf(postgres(sqlState, 'whatever it said')), sqlState).toMatchObject({
        code: 'REFUSED_BY_THE_DATABASE',
        status: 422,
        said: 'Not saved: a value isn’t one that can be kept.',
      });
    }
    expect(databaseRefusalOf(thrown('P2025'))).toEqual({
      code: 'NOT_FOUND',
      status: 404,
      said: 'Nothing with that id is on record.',
    });
  });

  it('what is the server’s own failure stays one: no grant, a delete refused, an error that isn’t the database’s; nor is a statement stopped by its time limit a refusal (the database was busy, database-busy.test.ts)', () => {
    for (const sqlState of ['42501', '23001', '57014', '40001']) {
      expect(databaseRefusalOf(postgres(sqlState, 'whatever it said')), sqlState).toBeUndefined();
    }
    expect(databaseRefusalOf(thrown('P2010'))).toBeUndefined();
    expect(databaseRefusalOf(new Error('violates unique constraint "x"'))).toBeUndefined();
    expect(databaseRefusalOf({ code: 'P2002' })).toBeUndefined();
    expect(databaseRefusalOf(undefined)).toBeUndefined();
  });

  it('AC-10-33 nothing told to the caller names a constraint, a table or a file', () => {
    const told = [
      databaseRefusalOf(postgres('23514', 'violates check constraint "project_site_circle_check"')),
      databaseRefusalOf(thrown('P2002', { originalCode: '23505', constraint: { index: 'x_key' } })),
      databaseRefusalOf(thrown('P2025')),
    ].map((refusal) => refusal?.said ?? '');
    for (const said of told) {
      expect(said).not.toMatch(/constraint|_check|_key|project_|\.ts|Invalid|prisma/i);
    }
  });
});
