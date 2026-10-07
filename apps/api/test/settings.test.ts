// The API's settings (ARCHITECTURE §4, Secrets; acceptance file 10, AC-10-55; ADR-385): read once
// and checked; a missing or malformed one stops the start and names its key, never its value.
// These need no stack; the last two start the built process itself (apps/api/dist/main.js).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { Settings, SettingsProblem } from '../src/process/settings.ts';

// Made-up values, this test's own; a login's URL is put together here so that no file holds one.
const word = ['made', 'up', 'for', 'this', 'test'].join('-');
const urlOf = (login: string) => `postgresql://${login}:${word}@127.0.0.1:55432/adms`;
const good: Record<string, string> = {
  DATABASE_URL: urlOf('adms_api'),
  READONLY_DATABASE_URL: urlOf('adms_readonly'),
  ADMS_TOKEN_SIGNING_SECRET: `${word}-${word}`,
  SMTP_URL: '',
  ADMS_API_HOST: '127.0.0.1',
  ADMS_API_PORT: '3000',
};
const without = (key: string): Record<string, string> =>
  Object.fromEntries(Object.entries(good).filter(([name]) => name !== key));

function problemOf(environment: Record<string, string>): SettingsProblem {
  try {
    Settings.from(environment);
  } catch (problem) {
    if (problem instanceof SettingsProblem) return problem;
    throw problem;
  }
  throw new Error('The settings were taken.');
}

describe('the settings the API starts with', () => {
  it('are taken when every one is there and well formed', () => {
    const settings = Settings.from(good);
    expect(settings.databaseUrl).toBe(good['DATABASE_URL']);
    expect(settings.readOnlyDatabaseUrl).toBe(good['READONLY_DATABASE_URL']);
    expect(settings.smtpUrl).toBe('');
    expect(settings.host).toBe('127.0.0.1');
    expect(settings.port).toBe(3000);
  });

  it('take a mail server, or none', () => {
    expect(Settings.from({ ...good, SMTP_URL: 'smtp://127.0.0.1:1025' }).smtpUrl).toBe(
      'smtp://127.0.0.1:1025',
    );
    expect(problemOf({ ...good, SMTP_URL: 'http://127.0.0.1:1025' }).keys).toEqual(['SMTP_URL']);
  });

  it.each(Object.keys(good))('AC-10-55: without %s the API does not start, and says so', (key) => {
    const problem = problemOf(without(key));
    expect(problem.keys).toEqual([key]);
    expect(problem.message).toBe(`The API did not start: ${key} is missing.`);
  });

  it.each([
    ['DATABASE_URL', 'not-a-url-9f3c'],
    ['DATABASE_URL', 'https://adms.localhost/9f3c'],
    ['DATABASE_URL', 'postgresql://adms_api@127.0.0.1:55432/adms-9f3c'],
    ['READONLY_DATABASE_URL', urlOf('adms_readonly-9f3c').replace('/adms', '')],
    ['ADMS_TOKEN_SIGNING_SECRET', 'short-9f3c'],
    ['SMTP_URL', 'mail-9f3c'],
    ['ADMS_API_HOST', 'api-9f3c.adms.localhost'],
    ['ADMS_API_PORT', '9f3c'],
    ['ADMS_API_PORT', '0'],
    ['ADMS_API_PORT', '65536'],
    ['ADMS_DATABASE_ADDRESS', 'postgres-9f3c'],
    ['ADMS_DATABASE_ADDRESS', 'postgres:9f3c'],
  ])('AC-10-55: a malformed %s is named, and its value never said', (key, value) => {
    const problem = problemOf({ ...good, [key]: value });
    expect(problem.keys).toEqual([key]);
    expect(problem.message).toBe(`The API did not start: ${key} is malformed.`);
    expect(problem.message).not.toContain('9f3c');
  });

  it('AC-10-55: every key that is off is named at once', () => {
    const problem = problemOf({ ...without('SMTP_URL'), ADMS_API_PORT: 'x', DATABASE_URL: 'y' });
    expect(problem.keys).toEqual(['DATABASE_URL', 'SMTP_URL', 'ADMS_API_PORT']);
  });

  it('reach the database where the stack says it is, with the same login', () => {
    const settings = Settings.from({ ...good, ADMS_DATABASE_ADDRESS: 'postgres:5432' });
    expect(settings.databaseUrl).toBe(`postgresql://adms_api:${word}@postgres:5432/adms`);
    expect(settings.readOnlyDatabaseUrl).toBe(
      `postgresql://adms_readonly:${word}@postgres:5432/adms`,
    );
  });
});

describe('the API as a process, started with settings that are off', () => {
  const main = fileURLToPath(new URL('../dist/main.js', import.meta.url));
  const folders: string[] = [];
  afterEach(() => {
    for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true });
  });

  function startWith(lines: string[], environment: Record<string, string> = {}) {
    const folder = mkdtempSync(join(tmpdir(), 'adms-api-'));
    folders.push(folder);
    const file = join(folder, 'api.env');
    writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
    return spawnSync(process.execPath, [main], {
      encoding: 'utf8',
      timeout: 20_000,
      // Nothing of this machine's own environment reaches it.
      env: { ADMS_ENV_FILE: file, ...environment },
    });
  }

  it('AC-10-55: it stops, names each key and says no value', () => {
    const started = startWith([
      'DATABASE_URL=not-a-url-9f3c',
      `READONLY_DATABASE_URL=${urlOf('adms_readonly')}`,
      'ADMS_TOKEN_SIGNING_SECRET=short-9f3c',
      'ADMS_API_HOST=127.0.0.1',
      'ADMS_API_PORT=3000',
    ]);
    expect(started.status).toBe(1);
    expect(started.stdout).toBe('');
    const said = JSON.parse(started.stderr) as { msg: string };
    expect(said.msg).toBe(
      'The API did not start: DATABASE_URL is malformed; ADMS_TOKEN_SIGNING_SECRET is malformed; SMTP_URL is missing.',
    );
    expect(started.stderr).not.toContain('9f3c');
    expect(started.stderr).not.toContain(word);
  });

  it('AC-10-55: a key set in its environment wins over its file, and is checked the same', () => {
    const started = startWith(
      Object.entries(good).map(([key, value]) => `${key}=${value}`),
      { ADMS_API_PORT: 'port-9f3c' },
    );
    expect(started.status).toBe(1);
    expect((JSON.parse(started.stderr) as { msg: string }).msg).toBe(
      'The API did not start: ADMS_API_PORT is malformed.',
    );
    expect(started.stderr).not.toContain('9f3c');
  });
});
