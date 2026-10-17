import { describe, expect, it } from 'vitest';

import { z } from 'zod';

import {
  endpoints,
  errorAnswerSchema,
  healthAnswerSchema,
  phoneListsSchema,
  phoneSetupChoicesAnswerSchema,
  setupChoicesMonitorsAtMost,
  setupShownSchema,
} from '../src/index.ts';

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

// Every property name an answer's JSON Schema holds, however deep: through unions, records and
// arrays as well as objects (what `keysOf` doesn't walk).
function propertyNames(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(propertyNames);
  if (typeof node !== 'object' || node === null) return [];
  const properties = (node as { properties?: unknown }).properties;
  const named =
    typeof properties === 'object' && properties !== null ? Object.keys(properties) : [];
  return [...named, ...Object.values(node).flatMap(propertyNames)];
}

describe('the lists a phone takes', () => {
  it('AC-07-91, the phase exit (task 2.7.4): no answer to anything a phone calls has a place for a rate, a rule, a transaction, a price or an amount, the login list and a sync’s answer included', () => {
    // A phone's calls: those open to a proven phone or a monitor on one, and every path under
    // `/phones`, which holds the three it makes before it is proven (enrolment, a challenge, a
    // proof); the back office's own reads of phones there are held to it too.
    const phones = endpoints.filter(
      (defined) =>
        defined.access === 'PROVEN_PHONE' ||
        defined.access === 'MONITOR_ON_PHONE' ||
        defined.path.startsWith('/phones'),
    );
    expect(phones.length).toBeGreaterThan(15);
    expect(phones.map((defined) => defined.name)).toContain('phoneLoginList');
    expect(phones.map((defined) => defined.name)).toContain('syncPhone');
    expect(phones.map((defined) => defined.name)).toContain('enrolPhone');
    const words = phones.flatMap((defined) =>
      propertyNames(z.toJSONSchema(defined.answer, { io: 'output' })).flatMap((key) =>
        key.split(/(?=[A-Z])|_/).map((word) => `${defined.name}.${key}:${word.toLowerCase()}`),
      ),
    );
    expect(words.length).toBeGreaterThan(100);
    expect(
      words.filter((said) => /:(rates?|rules?|transactions?|prices?|amounts?)$/.test(said)),
    ).toEqual([]);
  });

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
      setupVersion: 1,
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

  it('AC-07-91, ADR-453: a setup version, kept as a project’s phones were shown it, has no place for one either, nor for a certification, an ROE or a phone’s numbers; a phone’s lists say which version they are, from 1', () => {
    const keys = keysOf(setupShownSchema);
    expect(
      keys.filter((key) =>
        /rate|rule|transaction|price|amount|description|owner|driver|cert|roe|block/i.test(key),
      ),
    ).toEqual([]);
    expect(keys.filter((key) => /prime|code/i.test(key))).toEqual(['code', 'primeId']);
    const shown = {
      controlRanges: [],
      debrisTypes: { LOAD: [], HAUL_OUT: [] },
      fieldTags: [],
      typedNumberReasons: [],
      sites: [],
      payItems: [],
      itemNames: [],
      incidentTypes: [],
      incidentOffers: [],
      contractors: [],
      surveyWorkTypes: [],
      quantityLookup: [],
    };
    expect(setupShownSchema.safeParse(shown).success).toBe(true);
    expect(setupShownSchema.safeParse({ ...shown, rules: [] }).success).toBe(false);
    const lists = { ...shown, setupVersion: 1, blocks: [], certifications: [], roes: [] };
    expect(phoneListsSchema.safeParse(lists).success).toBe(true);
    expect(phoneListsSchema.safeParse({ ...lists, setupVersion: 0 }).success).toBe(false);
    expect(
      phoneListsSchema.safeParse({ ...shown, blocks: [], certifications: [], roes: [] }).success,
    ).toBe(false);
  });

  it('AC-07-91, ADR-463: what a phone being set up picks from has no place for a rate, a rule, a price or a description, nor for a password, a phone number, a role or an email address; it is strict, and its monitors are a bounded number', () => {
    const keys = keysOf(phoneSetupChoicesAnswerSchema);
    expect(
      keys.filter((key) =>
        /rate|rule|transaction|price|amount|description|owner|driver|password|phone|role|email|prime/i.test(
          key,
        ),
      ),
    ).toEqual([]);
    // The one code is a unit rate pay item's, which the phone prints (ADR-213, 301).
    expect(keys.filter((key) => /code/i.test(key))).toEqual(['code']);
    const id = '00000000-0000-7000-8000-00000000000a';
    const monitor = { monitorId: id, monitorNumber: 'M004127', name: 'Kim Nguyen' };
    const whole = {
      projects: [
        { id, name: 'Bayline County ROW, Hurricane Delphine', timeZone: 'America/New_York' },
      ],
      project: { id, sites: [], payItems: [] },
      monitors: [monitor],
      moreMonitorsAfter: null,
    };
    const taken = (answer: object) => phoneSetupChoicesAnswerSchema.safeParse(answer).success;
    expect(taken(whole)).toBe(true);
    expect(taken({ ...whole, project: null, moreMonitorsAfter: id })).toBe(true);
    expect(taken({ ...whole, rules: [] })).toBe(false);
    expect(taken({ ...whole, monitors: [{ ...monitor, phoneNumber: '5550177' }] })).toBe(false);
    expect(taken({ ...whole, project: { id, sites: [], payItems: [], rates: [] } })).toBe(false);
    expect(taken({ ...whole, monitors: [{ ...monitor, monitorNumber: '4127' }] })).toBe(false);
    const full = Array.from({ length: setupChoicesMonitorsAtMost }, () => monitor);
    expect(taken({ ...whole, monitors: full })).toBe(true);
    expect(taken({ ...whole, monitors: [...full, monitor] })).toBe(false);
  });
});
