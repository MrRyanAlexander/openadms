import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { EnvFile, MigrationFolder } from '../src/files.ts';

describe('EnvFile', () => {
  const folders: string[] = [];
  const folder = (): string => {
    const made = mkdtempSync(join(tmpdir(), 'adms-setup-'));
    folders.push(made);
    return made;
  };
  afterEach(() => {
    for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true });
  });

  it('writes values that read back exactly, an Argon2 hash included', () => {
    const values: [string, string][] = [
      // secretlint-disable-next-line -- a made-up password, this test's own (ADR-276)
      ['DATABASE_URL', 'postgresql://adms_api:abc-_123@127.0.0.1:55432/adms'],
      ['ADMS_MASTER_PASSCODE_HASH', '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA'],
      ['SMTP_URL', ''],
    ];
    const text = EnvFile.render(['a header'], values);
    expect(text.startsWith('# a header\n')).toBe(true);
    expect(parseEnv(text)).toEqual(Object.fromEntries(values));
  });

  it('is created for its owner only, and never overwritten', () => {
    const file = new EnvFile(join(folder(), 'service', '.env'));
    file.create([], [['KEY', 'first']]);
    expect(statSync(file.path).mode & 0o777).toBe(0o600);
    expect(file.ownerOnly()).toBe(true);
    expect(() => {
      file.create([], [['KEY', 'second']]);
    }).toThrow(/EEXIST/);
    expect(file.read()).toEqual({ KEY: 'first' });
  });

  it("takes one value out and leaves every other line as it was, still its owner's only", () => {
    // The master passcode's hash left packages/db/.env for the database (ADR-281).
    const file = new EnvFile(join(folder(), 'db', '.env'));
    file.create(
      ['a header', 'ADMS_MASTER_PASSCODE_HASH= is named here too, in a comment'],
      [
        ['ADMS_FIRST', 'kept'],
        ['ADMS_MASTER_PASSCODE_HASH', '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA'],
        ['SMTP_URL', ''],
      ],
    );
    const before = readFileSync(file.path, 'utf8');
    file.remove('ADMS_MASTER_PASSCODE_HASH');
    const after = readFileSync(file.path, 'utf8');
    expect(after).toBe(before.replace(/^ADMS_MASTER_PASSCODE_HASH=.*\n/m, ''));
    expect(after).not.toContain('argon2id');
    expect(file.read()).toEqual({ ADMS_FIRST: 'kept', SMTP_URL: '' });
    expect(statSync(file.path).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(file.path, '..'))).toEqual(['.env']);
    // Taking out what isn't there changes nothing.
    file.remove('ADMS_MASTER_PASSCODE_HASH');
    expect(readFileSync(file.path, 'utf8')).toBe(after);
  });

  it('adds the keys the file does not state yet at its end, replaces no value and leaves every line as it was (ADR-419)', () => {
    const file = new EnvFile(join(folder(), 'worker', '.env'));
    file.create(['a header'], [['DATABASE_URL', 'kept-as-it-was']]);
    const before = readFileSync(file.path, 'utf8');
    expect(
      file.add([
        ['DATABASE_URL', 'never-written'],
        ['ADMS_ROUTING_URL', 'https://routing.adms.localhost'],
        ['ADMS_MAP_CA_FILE', '/a path/with a space.crt'],
      ]),
    ).toEqual(['ADMS_ROUTING_URL', 'ADMS_MAP_CA_FILE']);
    const after = readFileSync(file.path, 'utf8');
    expect(after.startsWith(before)).toBe(true);
    expect(after).not.toContain('never-written');
    expect(file.read()).toEqual({
      DATABASE_URL: 'kept-as-it-was',
      ADMS_ROUTING_URL: 'https://routing.adms.localhost',
      ADMS_MAP_CA_FILE: '/a path/with a space.crt',
    });
    expect(statSync(file.path).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(file.path, '..'))).toEqual(['.env']);
    // Nothing missing: nothing is written.
    expect(file.add([['ADMS_ROUTING_URL', 'another']])).toEqual([]);
    expect(readFileSync(file.path, 'utf8')).toBe(after);
  });

  it('changes one value only as it is told, its secret carried over and every other line as it was, still its owner’s only (ADR-517)', () => {
    const file = new EnvFile(join(folder(), '.env'));
    // Each login's URL is put together here, so that no file holds one.
    const urlOf = (role: string, password: string): string =>
      ['postgresql://', role, ':', password, '@127.0.0.1:55432/adms'].join('');
    const login = urlOf('adms_api', 'abc-_123');
    file.create(
      ['a header'],
      [
        ['DATABASE_URL', login],
        ['READONLY_DATABASE_URL', urlOf('adms_readonly', 'def-_456')],
      ],
    );
    const before = readFileSync(file.path, 'utf8').split('\n');
    const withTls = (url: string): string =>
      url.includes('?') ? url : `${url}?sslmode=verify-full&sslrootcert=%2Froot%2Fca.crt`;
    expect(file.amend('DATABASE_URL', withTls)).toBe(true);
    const after = readFileSync(file.path, 'utf8').split('\n');
    expect(file.read()['DATABASE_URL']).toBe(
      `${login}?sslmode=verify-full&sslrootcert=%2Froot%2Fca.crt`,
    );
    // Only its own line changed; the password is the one it had.
    expect(after.filter((line, at) => line !== before[at])).toHaveLength(1);
    expect(new URL(file.read()['DATABASE_URL'] ?? '').password).toBe('abc-_123');
    expect(statSync(file.path).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(file.path, '..'))).toEqual(['.env']);
    // Told nothing new, or of a key it doesn't state, nothing is written.
    expect(file.amend('DATABASE_URL', withTls)).toBe(false);
    expect(file.amend('ADMS_ROUTING_URL', () => 'never-written')).toBe(false);
    expect(readFileSync(file.path, 'utf8')).not.toContain('never-written');
  });
});

describe('MigrationFolder', () => {
  it('finds the migrations whose SQL is still only comments', () => {
    const root = mkdtempSync(join(tmpdir(), 'adms-migrations-'));
    try {
      const write = (name: string, sql: string): void => {
        mkdirSync(join(root, name));
        writeFileSync(join(root, name, 'migration.sql'), sql);
      };
      write('1_models', 'CREATE TABLE "project" ();\n');
      write('2_guard_stub', '-- This is an empty migration.');
      write('3_guard_written', '-- Guard\n\nALTER TABLE "project" ADD CHECK (true);\n');
      write('4_blank', '\n  \n');
      writeFileSync(join(root, 'migration_lock.toml'), 'provider = "postgresql"\n');
      expect(new MigrationFolder(root).unwritten()).toEqual(['2_guard_stub', '4_blank']);
      expect(new MigrationFolder(join(root, 'none')).unwritten()).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
