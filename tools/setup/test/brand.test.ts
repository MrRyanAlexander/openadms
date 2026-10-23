// What the firm is asked to call its ADMS at the first run (the user, 2026-10-22): scripted
// answers, the way the interview gets them piped; and the rule it asks by, held to the domain's.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  askBrandName,
  brandNameLength,
  brandProblem,
  readBrandName,
  suggestedBrandName,
} from '../src/brand.ts';

const domainSource = readFileSync(
  new URL('../../../packages/domain/src/brand.ts', import.meta.url),
  'utf8',
);

// The interview, answering from a script: an empty answer takes the question's fallback, as
// Interview.ask does.
function scripted(answers: readonly string[]) {
  const asked: { question: string; fallback: string }[] = [];
  const left = [...answers];
  return {
    asked,
    ask: (question: string, fallback: string): Promise<string> => {
      asked.push({ question, fallback });
      const answer = (left.shift() ?? '').trim();
      return Promise.resolve(answer === '' ? fallback : answer);
    },
  };
}

describe('the question "What do you call your ADMS?"', () => {
  it('offers "<firm> ADMS" and takes it when the answer is empty', async () => {
    const interview = scripted(['']);
    const told: string[] = [];
    const name = await askBrandName(interview.ask, 'Gates Disaster Recovery', (line) =>
      told.push(line),
    );
    expect(name).toBe('Gates Disaster Recovery ADMS');
    expect(interview.asked).toEqual([
      {
        question: '2. What do you call your ADMS? (what your people and clients see)',
        fallback: 'Gates Disaster Recovery ADMS',
      },
    ]);
    expect(told).toEqual([]);
  });

  it('takes what the firm types, trimmed', async () => {
    const name = await askBrandName(scripted(['  Gates Recovery Desk ']).ask, 'Gates', () => {
      // Nothing to say: the answer was taken.
    });
    expect(name).toBe('Gates Recovery Desk');
  });

  it('asks again, saying why, while the answer is over forty characters or has a control character', async () => {
    const interview = scripted(['x'.repeat(41), 'Gates\u0007ADMS', 'Gates ADMS']);
    const told: string[] = [];
    const name = await askBrandName(interview.ask, 'Gates', (line) => told.push(line));
    expect(name).toBe('Gates ADMS');
    expect(interview.asked).toHaveLength(3);
    expect(told).toEqual([`   ${brandProblem}`, `   ${brandProblem}`]);
    expect(brandProblem).toBe('A name is 1 to 40 characters, with no control character in it.');
  });

  it('falls back to the product’s own name when the firm’s is too long to take "ADMS" after it', () => {
    expect(suggestedBrandName('x'.repeat(40))).toBe('Open ADMS');
    expect(readBrandName('   ')).toBeUndefined();
  });

  it('holds the same two numbers as the domain’s rule, which the seed, the contracts and the database check again', () => {
    const read = /brandNameLength = \{ shortest: (\d+), longest: (\d+) \}/.exec(domainSource);
    expect([Number(read?.[1]), Number(read?.[2])]).toEqual([
      brandNameLength.shortest,
      brandNameLength.longest,
    ]);
  });
});
