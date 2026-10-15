import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  passcodeLengthNames,
  passcodeLengths,
  policyInForce,
  StatementTimeout,
  statementTimeoutName,
} from '../src/policy.ts';

const shipped = parseEnv(
  readFileSync(new URL('../../../packages/domain/policy.env', import.meta.url), 'utf8'),
);

describe('StatementTimeout', () => {
  it('AC-10-42 is the release’s policy value, thirty seconds, when the service’s own file states none', () => {
    expect(statementTimeoutName).toBe('STATEMENT_TIMEOUT_MS');
    expect(new StatementTimeout(shipped).for({}, 'apps/api/.env')).toBe(30000);
    expect(
      new StatementTimeout(shipped).for({ [statementTimeoutName]: ' ' }, 'apps/api/.env'),
    ).toBe(30000);
  });

  it('is the service’s own when its env file states one (ADR-395)', () => {
    expect(
      new StatementTimeout(shipped).for({ [statementTimeoutName]: '120000' }, 'apps/worker/.env'),
    ).toBe(120000);
  });

  it('is never off, never a fraction or a word, never more than the database takes; the refusal says where, never what', () => {
    for (const written of ['0', '-1', '1.5', '30s', 'off-9f3c', '2147483648']) {
      const refused = () =>
        new StatementTimeout(shipped).for({ [statementTimeoutName]: written }, 'apps/worker/.env');
      expect(refused, written).toThrow(
        'STATEMENT_TIMEOUT_MS in apps/worker/.env must be a whole number of milliseconds, from 1 to 2147483647.',
      );
      expect(refused, written).not.toThrow(/9f3c/);
    }
    for (const written of ['1', '2147483647']) {
      expect(
        new StatementTimeout(shipped).for({ [statementTimeoutName]: written }, 'apps/api/.env'),
      ).toBe(Number(written));
    }
  });

  it('stops when the release’s own file has none, or one that is off', () => {
    expect(() => new StatementTimeout({}).for({}, 'apps/api/.env')).toThrow(
      'The policy value STATEMENT_TIMEOUT_MS is missing from the release.',
    );
    expect(() =>
      new StatementTimeout({ [statementTimeoutName]: '0' }).for({}, 'apps/api/.env'),
    ).toThrow('STATEMENT_TIMEOUT_MS in packages/domain/policy.env must be');
  });
});

describe('the master passcode’s lengths (ADR-530)', () => {
  it('AC-10-24 are the release’s 8 and 128, under the domain’s names', () => {
    expect(passcodeLengthNames).toEqual({
      shortest: 'MASTER_PASSCODE_MINIMUM_LENGTH',
      longest: 'MASTER_PASSCODE_MAXIMUM_LENGTH',
    });
    expect(passcodeLengths(shipped)).toEqual({ shortest: 8, longest: 128 });
  });

  it('stop the installer by name when missing, not whole, or the shortest is over the longest', () => {
    for (const written of [undefined, '', '0', '8.5', 'eight']) {
      expect(() =>
        passcodeLengths({ ...shipped, MASTER_PASSCODE_MINIMUM_LENGTH: written }),
      ).toThrow(
        'The policy value MASTER_PASSCODE_MINIMUM_LENGTH in packages/domain/policy.env must be a whole number of characters.',
      );
    }
    expect(() => passcodeLengths({ ...shipped, MASTER_PASSCODE_MINIMUM_LENGTH: '200' })).toThrow(
      'The policy value MASTER_PASSCODE_MINIMUM_LENGTH must be at most MASTER_PASSCODE_MAXIMUM_LENGTH.',
    );
  });
});

describe('the policy values a service runs under (C53; ADR-530)', () => {
  it('counts the release’s, names each its own file states instead with its value, and reads nothing else of the file', () => {
    const all = Object.keys(shipped).length;
    expect(policyInForce(shipped, {})).toEqual({ fromRelease: all, own: [] });
    expect(
      policyInForce(shipped, {
        // Any other setting of the service's own file is never read out.
        TOKEN_SIGNING_SECRET: 'not-a-policy-value-9f3c',
        STATEMENT_TIMEOUT_MS: '20000',
        DATABASE_POOL_CONNECTIONS: ' ',
        JOB_QUEUE_POLL_SECONDS: '5s',
      }),
    ).toEqual({
      fromRelease: all - 2,
      own: [
        { name: 'JOB_QUEUE_POLL_SECONDS', value: '5s', whole: false },
        { name: 'STATEMENT_TIMEOUT_MS', value: '20000', whole: true },
      ],
    });
  });
});
