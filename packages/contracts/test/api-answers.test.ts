import { describe, expect, it } from 'vitest';

import { z } from 'zod';

import { errorAnswerSchema, healthAnswerSchema, phoneListsSchema } from '../src/index.ts';

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

// Every name a schema can send, however deep.
function keysOf(schema: z.ZodType): string[] {
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape as Record<string, z.ZodType>).flatMap(([key, inner]) => [
      key,
      ...keysOf(inner),
    ]);
  }
  if (schema instanceof z.ZodArray) return keysOf(schema.element as z.ZodType);
  if (schema instanceof z.ZodNullable) return keysOf(schema.unwrap() as z.ZodType);
  return [];
}

describe('the lists a phone takes', () => {
  it('AC-07-91: the lists’ shape has no place for a rate, a rule, a transaction, a price or a description, and it is strict, so nothing more can be sent', () => {
    const keys = keysOf(phoneListsSchema);
    expect(keys.length).toBeGreaterThan(20);
    expect(
      keys.filter((key) =>
        /rate|rule|transaction|price|amount|description|owner|driver/i.test(key),
      ),
    ).toEqual([]);
    // A prime is named only as whose truck or crew a certification is, and as whose trucks a
    // row of the site's lookup is for.
    expect(keys.filter((key) => /prime/i.test(key))).toEqual(['prime', 'primeId']);
    // The one code is a unit rate pay item's, which the phone prints (ADR-213, 301).
    expect(keys.filter((key) => /code/i.test(key))).toEqual(['code']);
    const whole = {
      blocks: [],
      controlRanges: [],
      debrisTypes: { LOAD: [], HAUL_OUT: [] },
      fieldTags: [],
      typedNumberReasons: [],
      certifications: [],
      sites: [],
      roes: [],
      payItems: [],
      itemNames: [],
      incidentTypes: [],
      incidentOffers: [],
      contractors: [],
      surveyWorkTypes: [],
      quantityLookup: [],
    };
    expect(phoneListsSchema.safeParse(whole).success).toBe(true);
    expect(phoneListsSchema.safeParse({ ...whole, rules: [] }).success).toBe(false);
    const tag = { id: '0199b6a0-0000-7000-8000-000000000001', name: 'Mixed' };
    expect(phoneListsSchema.safeParse({ ...whole, fieldTags: [tag] }).success).toBe(true);
    expect(
      phoneListsSchema.safeParse({ ...whole, fieldTags: [{ ...tag, rate: '7.50' }] }).success,
    ).toBe(false);
  });
});
