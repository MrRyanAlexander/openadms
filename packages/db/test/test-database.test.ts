// Where the tests run (src/test-database.ts): the installation's test database, or another test's
// database ADMS_TEST_DATABASE names; never the installation's own database nor its shadow. Needs
// nothing: no database is opened.
import { describe, expect, it } from 'vitest';

import {
  atTestDatabase,
  isTestDatabase,
  testDatabase,
  testDatabaseName,
} from '../src/test-database.ts';

describe("a test's database", () => {
  it('is adms_test unless ADMS_TEST_DATABASE names another', () => {
    expect(testDatabaseName).toBe('adms_test');
    expect(testDatabase({})).toBe('adms_test');
    expect(testDatabase({ ADMS_TEST_DATABASE: 'adms_mutation_1' })).toBe('adms_mutation_1');
    expect(testDatabase({ ADMS_TEST_DATABASE: 'adms_story_p1_20261023_a1b2c3' })).toBe(
      'adms_story_p1_20261023_a1b2c3',
    );
  });

  // A login's URL as the installer writes one, built from its parts (a made-up password).
  const written = (): URL => {
    const url = new URL('postgresql://127.0.0.1:55432/adms');
    url.username = 'adms_api';
    url.password = 'made-up/word';
    url.search = '?sslmode=verify-full&sslrootcert=%2Froot.crt';
    return url;
  };

  it.each(['adms', 'adms_shadow', 'postgres', 'adms-test', 'adms_Test', 'adms_', 'adms_test;', ''])(
    'is never %j: the installation’s own, its shadow, or no Open ADMS database',
    (name) => {
      expect(isTestDatabase(name)).toBe(false);
      expect(() => testDatabase({ ADMS_TEST_DATABASE: name })).toThrow(
        `ADMS_TEST_DATABASE must name a test's database (adms_…), never the installation's own or its shadow, not ${name}.`,
      );
      expect(() => atTestDatabase(written().toString(), name)).toThrow(
        `${name} is no test's database.`,
      );
    },
  );

  it('is reached by the login the installer wrote, only the database’s name changed', () => {
    const at = new URL(atTestDatabase(written().toString(), 'adms_test'));
    const expected = written();
    expected.pathname = '/adms_test';
    expect(at.toString()).toBe(expected.toString());
    expect([at.username, decodeURIComponent(at.password), at.host, at.pathname]).toEqual([
      'adms_api',
      'made-up/word',
      '127.0.0.1:55432',
      '/adms_test',
    ]);
    expect(at.searchParams.get('sslmode')).toBe('verify-full');
    expect(at.searchParams.get('sslrootcert')).toBe('/root.crt');
  });
});
