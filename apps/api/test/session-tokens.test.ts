// What a browser holds of a session, before anything is read from the database (ARCHITECTURE §6,
// Back-office sessions; acceptance file 10, AC-10-09, 12, 16, 27; T-14, T-15; ADR-408): the
// access token, the refresh token, the CSRF value, the two cookies, and what an endpoint that
// asks for a session refuses on sight. Needs no stack: nothing here opens the database.
import { randomUUID } from 'node:crypto';

import {
  beginTwoStepSetupEndpoint,
  clearTwoStepEndpoint,
  confirmTwoStepSetupEndpoint,
  currentSessionEndpoint,
  endpoints,
  errorAnswerSchema,
  refreshSessionEndpoint,
  sessionCsrfEndpoint,
  signOutEndpoint,
} from '@open-adms/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ApiModule } from '../src/process/api-module.ts';
import { ApiProcess } from '../src/process/api-process.ts';
import {
  accessCookie,
  cookieSet,
  cookiesCleared,
  cookiesOf,
  refreshCookie,
} from '../src/sign-in/session-cookies.ts';
import { SessionTokens } from '../src/sign-in/session-tokens.ts';
import { madeUpSettings, ready, shippedPolicy } from './support/process.ts';
import { signingSecret } from './support/sign-in.ts';

// Monday 12 October 2026, 10:00 in Bayline County.
const now = new Date('2026-10-12T14:00:00Z');
const later = (minutes: number): Date => new Date(now.getTime() + minutes * 60_000);

describe('an access token', () => {
  const tokens = new SessionTokens(signingSecret, 5);
  const session = randomUUID();

  it('AC-10-12 names its session until it runs out, five minutes on, and not a moment after', () => {
    const token = tokens.access(session, now);
    expect(tokens.sessionOfAccess(token, now)).toBe(session);
    expect(tokens.sessionOfAccess(token, later(4.99))).toBe(session);
    expect(tokens.sessionOfAccess(token, later(5))).toBeUndefined();
    expect(tokens.accessSeconds).toBe(300);
  });

  it('can’t be made or changed by anybody else: another session, a later end, another secret, another purpose’s signature', () => {
    const token = tokens.access(session, now);
    const [, expires, signature] = token.split('.');
    const forged = [
      `${randomUUID()}.${expires ?? ''}.${signature ?? ''}`,
      `${session}.${String(later(600).getTime())}.${signature ?? ''}`,
      new SessionTokens('another-made-up-secret-for-this-test', 5).access(session, now),
      // The session's CSRF value is signed with another key: it is no access token's signature.
      `${session}.${expires ?? ''}.${tokens.csrf(session)}`,
      `${session}.${expires ?? ''}`,
      `${token}.more`,
      '',
      undefined,
    ];
    for (const made of forged) expect(tokens.sessionOfAccess(made, now), made).toBeUndefined();
  });
});

describe('a refresh token', () => {
  const tokens = new SessionTokens(signingSecret, 5);
  const session = randomUUID();

  it('AC-10-10 is its session and 32 random bytes; the server keeps only the SHA-256 of those', () => {
    const [first, second] = [tokens.newRefresh(), tokens.newRefresh()];
    expect(first.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.secret).not.toBe(first.secret);
    expect(first.hash).not.toContain(first.secret);
    const token = tokens.refresh(session, first.secret);
    expect(tokens.readRefresh(token)).toEqual({ sessionId: session, hash: first.hash });
    expect(tokens.sameHash(first.hash, first.hash)).toBe(true);
    expect(tokens.sameHash(first.hash, second.hash)).toBe(false);
  });

  it('reads nothing from what isn’t shaped like one', () => {
    const { secret } = tokens.newRefresh();
    for (const made of [
      undefined,
      '',
      session,
      `${session}.`,
      `${session}.${secret}.more`,
      `not-a-session.${secret}`,
      `${session}.${secret.slice(1)}`,
      `${session}.${secret}=`,
    ]) {
      expect(tokens.readRefresh(made), made).toBeUndefined();
    }
  });
});

describe('a session’s CSRF value', () => {
  const tokens = new SessionTokens(signingSecret, 5);

  it('AC-10-16 is the session’s own: another session’s, another secret’s, a blank or a list is not it', () => {
    const [mine, theirs] = [randomUUID(), randomUUID()];
    const value = tokens.csrf(mine);
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokens.csrf(mine)).toBe(value);
    expect(tokens.csrfMatches(mine, value)).toBe(true);
    for (const given of [
      tokens.csrf(theirs),
      new SessionTokens('another-made-up-secret-for-this-test', 5).csrf(mine),
      '',
      '1',
      undefined,
      [value, value],
      `${value} `,
    ]) {
      expect(tokens.csrfMatches(mine, given)).toBe(false);
    }
  });
});

describe('the session’s cookies', () => {
  it('AC-10-09 are HttpOnly, Secure and SameSite=Strict, of the API’s own host alone (`__Host-`, Path=/, no Domain)', () => {
    expect([accessCookie, refreshCookie]).toEqual(['__Host-adms-access', '__Host-adms-refresh']);
    expect(cookieSet(accessCookie, 'value', 300)).toBe(
      '__Host-adms-access=value; Max-Age=300; Path=/; HttpOnly; Secure; SameSite=Strict',
    );
    expect(cookiesCleared).toEqual([
      '__Host-adms-access=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict',
      '__Host-adms-refresh=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict',
    ]);
  });

  it('are read by name from what a browser sends; one sent twice is taken as not sent', () => {
    expect([...cookiesOf('a=1; __Host-adms-access=x.y.z ;b=2')]).toEqual([
      ['a', '1'],
      ['__Host-adms-access', 'x.y.z'],
      ['b', '2'],
    ]);
    expect(cookiesOf('__Host-adms-access=one; __Host-adms-access=two').has(accessCookie)).toBe(
      false,
    );
    expect([...cookiesOf(undefined)]).toEqual([]);
    expect([...cookiesOf('nothing; =blank')]).toEqual([]);
  });
});

describe('an endpoint that asks for a session, before anything is read', () => {
  let api: ApiProcess;
  beforeAll(async () => {
    api = await ApiProcess.create(ApiModule, madeUpSettings, shippedPolicy, {
      stream: { write: () => undefined },
    });
    await ready(api);
  });
  afterAll(async () => {
    await api.close();
  });

  it('AC-10-27 every endpoint says who may call it; only these need nobody signed in', () => {
    expect(endpoints.filter(({ access }) => access === 'ANYBODY').map(({ name }) => name)).toEqual([
      'health',
      'requestPasswordReset',
      'completePasswordReset',
      'signIn',
    ]);
    // A person who must first set their own password is served only what that takes (ADR-410).
    expect(
      endpoints
        .filter(({ beforePasswordChange }) => beforePasswordChange === true)
        .map(({ name }) => name),
    ).toEqual(['currentSession', 'changePassword']);
    // And one who must first set an authenticator up, only what that takes (ADR-412).
    expect(
      endpoints
        .filter(({ beforeTwoStepSetup }) => beforeTwoStepSetup === true)
        .map(({ name }) => name),
    ).toEqual(['currentSession', 'changePassword', 'beginTwoStepSetup', 'confirmTwoStepSetup']);
  });

  it.each([
    currentSessionEndpoint,
    refreshSessionEndpoint,
    signOutEndpoint,
    sessionCsrfEndpoint,
    beginTwoStepSetupEndpoint,
    confirmTwoStepSetupEndpoint,
    clearTwoStepEndpoint,
  ])(
    'AC-10-27 $name with no cookie, or one the server never made, is refused as not signed in',
    async ({ method, path }) => {
      for (const cookie of [
        undefined,
        `${accessCookie}=made-up; ${refreshCookie}=made-up`,
        `${accessCookie}=${randomUUID()}.9999999999999.made-up`,
      ]) {
        const answer = await api.app.inject({
          method,
          url: path,
          headers: cookie === undefined ? {} : { cookie },
        });
        expect(answer.statusCode).toBe(401);
        expect(errorAnswerSchema.parse(answer.json()).code).toBe('NOT_SIGNED_IN');
        expect(answer.headers['set-cookie']).toBeUndefined();
      }
    },
  );

  it('AC-10-27 who may call is asked before what was sent is read: a body no schema takes is still "not signed in"', async () => {
    const answer = await api.app.inject({
      method: 'POST',
      url: '/password-changes',
      payload: { nobody: 'named this field' },
    });
    expect(answer.statusCode).toBe(401);
    expect(errorAnswerSchema.parse(answer.json()).code).toBe('NOT_SIGNED_IN');
  });
});
