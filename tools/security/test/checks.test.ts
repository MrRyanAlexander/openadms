// The security checks' own rules (ADR-276): what counts as a password-like setting, which values
// are the installation's secrets, which audit advisories are accepted, and when an env file could
// be committed. The scans themselves run in `pnpm security`.
import { describe, expect, it } from 'vitest';

import { acceptedAdvisories } from '../src/audit.ts';
import { LastTestRun, type VitestReport } from '../src/grants.ts';
import {
  configFile,
  EnvFilesCheck,
  exceptedBy,
  passwordLikeSetting,
  secretKindIn,
  secretsIn,
} from '../src/secrets.ts';

describe('a password-like setting with a literal value', () => {
  it.each([
    ['      POSTGRES_PASSWORD: hunter2-but-longer', 'POSTGRES_PASSWORD'],
    ['S3_SECRET_KEY=Zq8vPl2mXw9RtY4k', 'S3_SECRET_KEY'],
    ['aws_access_key: AKIAEXAMPLEEXAMPLE01', 'aws_access_key'],
    ['  "api_token": "abc123",', 'api_token'],
    ['smtp_password = "correct horse"', 'smtp_password'],
    ['  "password": { "default": "correct horse" },', 'password'],
    ['  "token": ["abc123"],', 'token'],
  ])('is found: %s', (line, key) => {
    expect(passwordLikeSetting(line)).toBe(key);
  });

  it.each([
    '      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password',
    '    environment: POSTGRES_PASSWORD',
    '  postgres_password:',
    'POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}',
    'SECRET=',
    '  "api_token": "",',
    'password: <your password>',
    'token: null',
    'private_key: |',
    // A schema's property, as apps/api/openapi.json names one: what it holds is on later lines.
    '                  "password": {',
    '  password: [',
  ])('is not a literal: %s', (line) => {
    expect(passwordLikeSetting(line)).toBeUndefined();
  });

  it('is looked for in config files only', () => {
    const files = [
      'docker-compose.yml',
      'infra/local/compose.yaml',
      'apps/api/.env.example',
      'package.json',
      'a.toml',
    ];
    expect(files.filter((file) => configFile.test(file))).toEqual(files);
    expect(
      ['src/index.ts', 'README.md', 'spec/ARCHITECTURE.md'].filter((file) => configFile.test(file)),
    ).toEqual([]);
  });
});

describe("the installation's own secrets", () => {
  it('are the secret-named values and every URL password, when long enough to be generated', () => {
    expect(
      secretsIn({
        POSTGRES_PASSWORD: 'Zq8vPl2mXw9RtY4kLm3N',
        S3_ACCESS_KEY: 'AKIAEXAMPLEEXAMPLE01',
        // secretlint-disable-next-line -- a made-up password, this test's own
        DATABASE_URL: 'postgresql://adms_api:Hk3%2FvQ9wLp7sRt2Y@127.0.0.1:55432/adms',
        SMTP_URL: 'smtp://127.0.0.1:1025',
        ADMS_PG_PORT: '55432',
        SHORT_SECRET: 'postgres',
      }),
    ).toEqual(['Zq8vPl2mXw9RtY4kLm3N', 'AKIAEXAMPLEEXAMPLE01', 'Hk3/vQ9wLp7sRt2Y']);
  });
});

// The kinds of secret Phase 2 brought (ADR-508). Each value is put together here, so that no
// line of this file is one: the scan reads this file too, and a value's text stands apart from
// what precedes it in the file.
describe('a secret of a kind Phase 2 brought', () => {
  const salt16 = 'rLnL+hWkLjJHDKTBWGSsdw';
  const tag32 = 'tYeMf5WEtzZTIdv2JQR18zDWwcllaJjVO71qautLsGY';
  const hash = (salt: string, tag: string, kind = 'id') =>
    ['', `argon2${kind}`, 'v=19', 'm=19456,t=2,p=1', salt, tag].join('$');
  const base32 = ['GEZDGNBVGY3T', 'QOJQGEZDGNBV'].join('');
  const otp = (secret: string) =>
    `otpauth://totp/Open%20ADMS:luis.ortega%40gates.example?secret=${secret}&issuer=Open%20ADMS`;
  const d43 = 'x'.repeat(21) + 'Q7_-' + 'y'.repeat(18);

  it.each([
    ['a whole Argon2id hash', `const kept = '${hash(salt16, tag32)}';`, 'whole-argon2-hash'],
    [
      'a whole Argon2i hash in a dump',
      `  "password_hash": "${hash(salt16, tag32, 'i')}",`,
      'whole-argon2-hash',
    ],
    ["an authenticator's secret", `  '${otp(base32)}',`, 'authenticator-secret'],
    ['one in lower case', `uri: ${otp(base32.toLowerCase())}`, 'authenticator-secret'],
    [
      "one after the address's other settings",
      `otpauth://totp/Open%20ADMS:luis.ortega%40gates.example?issuer=Open%20ADMS&secret=${base32}`,
      'authenticator-secret',
    ],
    ['a private key as a JWK', `{"kty":"EC","crv":"P-256","d":"${d43}"}`, 'private-key-jwk'],
    ['one written in code', `  d: '${d43}',`, 'private-key-jwk'],
  ])('is found: %s', (_what, line, rule) => {
    expect(d43).toHaveLength(43);
    expect(secretKindIn(line)).toBe(rule);
  });

  it.each([
    ['a hash too short to be one the API makes', `'${hash('c2FsdA', 'aGFzaA')}'`],
    ['a hash with a short tag', `'${hash(salt16, tag32.slice(0, 38))}'`],
    ['the shape a hash is checked against', "CHECK ((password_hash ~~ '$argon2id$%'::text))"],
    ['an address with no secret', 'otpauth://totp/Open%20ADMS:dana.reyes%40gates.example?issuer=x'],
    ['a secret too short to be one', otp('MZXW6YTBOI')],
    ['a public key as a JWK', `{"kty":"EC","crv":"P-256","x":"${d43}","y":"${d43}"}`],
    ['a value too short to be a P-256 private key', `  d: '${d43.slice(1)}',`],
    ['an id', `  id: '0192a3b4-c5d6-7e8f-9012-3456789abcde',`],
  ])('is not found: %s', (_what, line) => {
    expect(secretKindIn(line)).toBeUndefined();
  });

  it('is let stand only where the line before says why, as a secretlint exception', () => {
    const marked = '// secretlint-' + 'disable-next-line';
    expect(exceptedBy(`      ${marked} -- RFC 6238's test secret`)).toBe(true);
    expect(exceptedBy(`  # ${marked} -- a made-up hash`)).toBe(true);
    expect(exceptedBy(`      ${marked}`)).toBe(false);
    expect(exceptedBy(`      ${marked} --   `)).toBe(false);
    expect(exceptedBy('      // a made-up hash')).toBe(false);
  });
});

describe('the accepted audit advisories', () => {
  it('are the ids under auditConfig.ignoreGhsas, comments skipped', () => {
    const workspace = [
      'savePrefix: ""',
      'auditConfig:',
      '  ignoreGhsas:',
      '    # why the first one',
      '    - GHSA-ggr8-5vv4-36mx',
      '    - GHSA-3f6p-5ww8-9rcr',
      'other: 1',
      '    - GHSA-not-this-one',
    ].join('\n');
    expect(acceptedAdvisories(workspace)).toEqual(['GHSA-ggr8-5vv4-36mx', 'GHSA-3f6p-5ww8-9rcr']);
    expect(acceptedAdvisories('savePrefix: ""\n')).toEqual([]);
  });
});

describe('an env file', () => {
  const check = (ignored: string[], tracked: string[]) =>
    new EnvFilesCheck({
      envFiles: () => ['apps/api/.env', 'infra/local/.env'],
      ignored: () => ignored,
      tracked: () => tracked,
    }).run();

  it('passes when every one is ignored and untracked', () => {
    expect(check(['apps/api/.env', 'infra/local/.env'], [])).toMatchObject({
      ok: true,
      lines: ['✓ every one ignored by git and untracked'],
    });
  });

  it('fails when one is not ignored, or is tracked', () => {
    expect(check(['apps/api/.env'], ['apps/api/.env'])).toEqual({
      title: 'Env files (2 on disk)',
      ok: false,
      lines: [
        '✗ 2 could be committed',
        '  apps/api/.env: tracked by git',
        '  infra/local/.env: not ignored by git',
      ],
    });
  });
});

// When `pnpm security` may report the database tests from the run `pnpm test` made (ADR-446).
describe('an earlier run of the database tests', () => {
  const folder = '/repo/packages/db/test/';
  const began = Date.UTC(2026, 9, 9, 12, 0, 0);
  const file = (name: string, statuses: string[] = ['passed', 'passed']) => ({
    name,
    // As Vitest reports a file: failed only where a test in it failed; a skipped test fails none.
    status: statuses.includes('failed') ? 'failed' : 'passed',
    assertionResults: statuses.map((status) => ({ status })),
  });
  const report = (more: Partial<VitestReport> = {}): VitestReport => ({
    startTime: began,
    testResults: [
      file(`${folder}grants.test.ts`),
      file(`${folder}audit.test.ts`, ['passed', 'passed', 'passed']),
      file('/repo/packages/domain/test/money.test.ts', ['passed']),
    ],
    ...more,
  });
  const facts = {
    now: began + 10 * 60_000,
    files: [`${folder}audit.test.ts`, `${folder}grants.test.ts`],
    lastChange: began - 1,
  };
  const reusable = (kept: VitestReport | undefined, more: Partial<typeof facts> = {}) =>
    new LastTestRun(folder).reusable(kept, { ...facts, ...more });

  it('is reported again when it held every file, each passed, and nothing has changed since it began', () => {
    expect(reusable(report())).toEqual({ files: 2, tests: 5, passed: 5, failed: 0, notPassed: [] });
  });

  it('is not when there is none, or it says no start time', () => {
    expect(reusable(undefined)).toBe('no report of an earlier run');
    expect(reusable({ testResults: report().testResults })).toBe('the report says no start time');
    expect(reusable(report({ startTime: Number.NaN }))).toBe('the report says no start time');
    expect(reusable(report({ startTime: facts.now + 1 }))).toBe('the report is from the future');
  });

  it('is not once half an hour has passed', () => {
    expect(reusable(report(), { now: began + 30 * 60_000 })).toEqual(expect.any(Object));
    expect(reusable(report(), { now: began + 30 * 60_000 + 1 })).toBe(
      'the last run began more than 30 minutes ago',
    );
  });

  it('is not when a file changed at or after its start', () => {
    expect(reusable(report(), { lastChange: began })).toBe(
      'a file changed since the last run began',
    );
    expect(reusable(report(), { lastChange: Number.POSITIVE_INFINITY })).toBe(
      'a file changed since the last run began',
    );
  });

  it('is not when it left a test file out, held one that is gone, or none is on disk', () => {
    expect(reusable(report(), { files: [...facts.files, `${folder}new.test.ts`] })).toBe(
      'the last run did not hold every file',
    );
    expect(reusable(report(), { files: [`${folder}grants.test.ts`] })).toBe(
      'the last run held a file that is gone',
    );
    expect(reusable(report(), { files: [] })).toBe('no test file found');
  });

  it.each(['failed', 'skipped', 'pending', 'todo'])(
    'is not when one of its tests is %s',
    (status) => {
      const kept = report({
        testResults: [
          file(`${folder}grants.test.ts`, ['passed', status]),
          file(`${folder}audit.test.ts`),
        ],
      });
      expect(reusable(kept)).toBe('the last run did not pass every test');
    },
  );

  it('is not when a file failed with no test in it, or held none', () => {
    const stopped = { name: `${folder}grants.test.ts`, status: 'failed', assertionResults: [] };
    expect(reusable(report({ testResults: [stopped, file(`${folder}audit.test.ts`)] }))).toBe(
      'the last run did not pass every test',
    );
    const empty = (name: string) => ({ name: `${folder}${name}`, status: 'passed' });
    expect(
      reusable(report({ testResults: [empty('grants.test.ts'), empty('audit.test.ts')] })),
    ).toBe('the last run did not pass every test');
  });
});
