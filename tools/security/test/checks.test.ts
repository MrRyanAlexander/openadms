// The security checks' own rules (ADR-276): what counts as a password-like setting, which values
// are the installation's secrets, which audit advisories are accepted, and when an env file could
// be committed. The scans themselves run in `pnpm security`.
import { describe, expect, it } from 'vitest';

import { acceptedAdvisories } from '../src/audit.ts';
import { configFile, EnvFilesCheck, passwordLikeSetting, secretsIn } from '../src/secrets.ts';

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
