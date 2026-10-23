// What the firm calls its ADMS and the release it is built on, as the API says them (the user,
// 2026-10-22): the public brand read, the firm's change of the name, and the name's one rule,
// the domain's, held by the contract too.
import { describe, expect, it } from 'vitest';

import {
  brandAnswerSchema,
  brandEndpoint,
  changeBrandNameEndpoint,
  firmSettingsAnswerSchema,
  notTaken,
  taken,
} from '../src/index.ts';

describe('the brand read', () => {
  it('is open to anybody, takes nothing, and answers the name and the release alone', () => {
    expect(brandEndpoint.access).toBe('ANYBODY');
    expect(brandEndpoint.method).toBe('GET');
    expect(brandEndpoint.path).toBe('/brand');
    expect(taken(brandEndpoint, { params: {}, query: {}, body: undefined })).toBeDefined();
    expect(taken(brandEndpoint, { params: {}, query: { verbose: '1' }, body: undefined })).toBe(
      undefined,
    );
    expect(brandAnswerSchema.parse({ name: 'Gates ADMS', version: '0.1.0' })).toEqual({
      name: 'Gates ADMS',
      version: '0.1.0',
    });
    expect(
      brandAnswerSchema.safeParse({ name: 'Gates ADMS', version: '0.1.0', firm: 'Gates' }).success,
    ).toBe(false);
  });

  it('is refused a name that is empty, over forty characters or not a release number', () => {
    for (const bad of [
      { name: '', version: '0.1.0' },
      { name: 'x'.repeat(41), version: '0.1.0' },
      { name: 'Gates ADMS', version: 'latest' },
      { name: 'Gates ADMS', version: '0.1' },
    ]) {
      expect(brandAnswerSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(brandAnswerSchema.safeParse({ name: 'G', version: '1.20.3-rc.1' }).success).toBe(true);
  });
});

describe('the change of what the firm calls its ADMS', () => {
  it('is for whoever holds Setup, and takes the name trimmed, with a note if they give one', () => {
    expect(changeBrandNameEndpoint.access).toBe('SIGNED_IN');
    expect(changeBrandNameEndpoint.permission).toBe('SETUP');
    const sent = (name: string) => ({ params: {}, query: {}, body: { name } });
    expect(taken(changeBrandNameEndpoint, sent('  Gates ADMS  '))?.body).toEqual({
      name: 'Gates ADMS',
    });
    expect(
      taken(changeBrandNameEndpoint, {
        params: {},
        query: {},
        body: { name: 'Gates ADMS', note: 'Renamed for the client' },
      }),
    ).toBeDefined();
  });

  it('refuses a name the domain refuses, and says so by its field', () => {
    for (const name of ['', '   ', 'x'.repeat(41), 'Gates\nADMS']) {
      const refusal = notTaken(changeBrandNameEndpoint, {
        params: {},
        query: {},
        body: { name },
      });
      expect(refusal, JSON.stringify(name)).toBeDefined();
    }
  });

  it('answers the firm’s settings, which now hold the name', () => {
    const settings = {
      phoneKeyRevokedAfterHours: 24,
      viewerTwoStepRequired: false,
      monitorSessionHours: 24,
      reportContactEmail: null,
      brandName: 'Gates ADMS',
    };
    expect(firmSettingsAnswerSchema.parse(settings)).toEqual(settings);
    expect(firmSettingsAnswerSchema.safeParse({ ...settings, brandName: undefined }).success).toBe(
      false,
    );
  });
});
