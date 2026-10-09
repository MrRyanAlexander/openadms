import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { describe, expect, it } from 'vitest';

import { StatementTimeout, statementTimeoutName } from '../src/policy.ts';

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
