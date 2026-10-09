import { describe, expect, it } from 'vitest';

import { errorAnswerSchema, healthAnswerSchema } from '../src/index.ts';

describe('what the API says about itself and about a refusal', () => {
  it('the health answer says ok and nothing else', () => {
    expect(healthAnswerSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
    expect(healthAnswerSchema.safeParse({ status: 'ok', version: '1.0.0' }).success).toBe(false);
  });

  it('AC-10-33: an error is a plain code and the request id, with room for nothing else but the domain’s plain words to whoever typed something', () => {
    const answer = { code: 'INTERNAL_ERROR', requestId: '0199b6a0-0000-7000-8000-000000000001' };
    expect(errorAnswerSchema.parse(answer)).toEqual(answer);
    // Why a password wasn't taken (ADR-415); which refusals carry words is the error filter's.
    const said = {
      ...answer,
      code: 'PASSWORD_TOO_SHORT',
      message: 'A password needs at least 15 characters.',
    };
    expect(errorAnswerSchema.parse(said)).toEqual(said);
    expect(errorAnswerSchema.safeParse({ ...answer, message: '' }).success).toBe(false);
    expect(errorAnswerSchema.safeParse({ ...answer, message: { at: 'main' } }).success).toBe(false);
    expect(errorAnswerSchema.safeParse({ ...answer, stack: 'at main' }).success).toBe(false);
    expect(errorAnswerSchema.safeParse({ ...answer, code: 'Something broke' }).success).toBe(false);
  });
});
