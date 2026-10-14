// Passwords, the parts that need no database (ARCHITECTURE §6, Passwords; acceptance file 10,
// AC-10-20, 24, 25 and AC-10-32's part; T-16, T-43; ADR-402…405): the slow hash, the release's
// list of known breached passwords, the code a reset by email carries, where mail goes, and what
// the two reset endpoints refuse before anything is read. The real process, in this test's own
// memory; nothing here opens the database.
import { randomUUID } from 'node:crypto';
import {
  completePasswordResetEndpoint,
  endpoints,
  errorAnswerSchema,
  errorCodes,
  requestPasswordResetEndpoint,
} from '@open-adms/contracts';
import { PasswordRules } from '@open-adms/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ApiModule } from '../src/process/api-module.ts';
import { ApiProcess } from '../src/process/api-process.ts';
import { Settings } from '../src/process/settings.ts';
import { shippedBreachedPasswords } from '../src/sign-in/breached-list.ts';
import { mailFor, NoMail, SmtpMail } from '../src/sign-in/mail.ts';
import { PasswordHasher } from '../src/sign-in/password-hasher.ts';
import { ResetCodes } from '../src/sign-in/reset-codes.ts';
import { madeUpSettings, ready, shippedPolicy } from './support/process.ts';

const long = 'marsh heron delphine ferry';

describe('a password’s slow hash', () => {
  const hasher = new PasswordHasher('made-up-signing-secret-for-this-test-only');

  it('AC-10-20 is Argon2id at OWASP’s 19 MiB, 2 passes, 1 lane, as a PHC string with its own salt', async () => {
    const [first, second] = [await hasher.hash(long), await hasher.hash(long)];
    expect(PasswordHasher.cost).toEqual({ memory: 19456, passes: 2, parallelism: 1 });
    // A 16-byte salt and a 32-byte tag, in unpadded base64: 22 and 43 characters.
    expect(first).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1,keyid=djE\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    );
    expect(second).not.toBe(first);
    expect(first).not.toContain('marsh');
  });

  it('AC-10-20 accepts the password and nothing else: all of it, exactly as typed', async () => {
    const kept = await hasher.hash(long);
    expect(await hasher.verify(long, kept)).toBe(true);
    for (const other of [`${long} `, long.slice(0, -1), long.toUpperCase(), '']) {
      expect(await hasher.verify(other, kept), other).toBe(false);
    }
    expect(await hasher.verify(long, 'not-a-hash')).toBe(false);
    expect(await hasher.verify(long, kept.replace('argon2id', 'argon2i'))).toBe(false);
  });

  it('hashes Unicode’s composed form, so one password typed two ways is one password', async () => {
    const kept = await hasher.hash('caf\u00e9 au lait at the marsh');
    expect(await hasher.verify('cafe\u0301 au lait at the marsh', kept)).toBe(true);
  });

  it('is keyed with a secret that is never in the database: the same password under another secret, or with no key, is another hash (ADR-411)', async () => {
    const kept = await hasher.hash(long);
    expect(
      await new PasswordHasher('another-made-up-secret-for-this-test').verify(long, kept),
    ).toBe(false);
    // Whoever holds the string alone can't check a guess: with the key's name taken off, the
    // string is an ordinary Argon2id hash, and the password doesn't check against it.
    expect(await hasher.verify(long, kept.replace(',keyid=djE', ''))).toBe(false);
    // A key the process doesn't hold checks nothing.
    expect(await hasher.verify(long, kept.replace('keyid=djE', 'keyid=djI'))).toBe(false);
    expect(hasher.stale(kept)).toBe(false);
  });

  it('a hash with no key, or made under lower settings, still checks and is made again (stale)', async () => {
    const earlier =
      // secretlint-disable-next-line -- the stories' made-up master passcode's hash, no person's
      '$argon2id$v=19$m=19456,t=2,p=1$rLnL+hWkLjJHDKTBWGSsdw$tYeMf5WEtzZTIdv2JQR18zDWwcllaJjVO71qautLsGY';
    expect(hasher.stale(earlier)).toBe(true);
    const kept = await hasher.hash(long);
    expect(hasher.stale(kept.replace('m=19456', 'm=9728'))).toBe(true);
    expect(hasher.stale(kept.replace('t=2', 't=1'))).toBe(true);
    expect(hasher.stale('not-a-hash')).toBe(true);
  });

  it('still checks a hash made under other settings: the string carries its own', async () => {
    // Made by the installer's hasher for the stories' made-up master passcode (story-database.ts).
    const earlier =
      // secretlint-disable-next-line -- the stories' made-up master passcode's hash, no person's
      '$argon2id$v=19$m=19456,t=2,p=1$rLnL+hWkLjJHDKTBWGSsdw$tYeMf5WEtzZTIdv2JQR18zDWwcllaJjVO71qautLsGY';
    expect(await hasher.verify('heron-marsh-delphine', earlier)).toBe(true);
    expect(await hasher.verify('heron-marsh-delphin', earlier)).toBe(false);
  });
});

describe('the release’s list of known breached passwords', () => {
  const breached = shippedBreachedPasswords();
  const rules = new PasswordRules(shippedPolicy, breached);
  const dana = { monitor: false, words: ['Dana Reyes', 'dana.reyes@gates.example'] };

  it('AC-10-24 is a file of the release, read with no outside service: 46,483 passwords of 8 characters and more', () => {
    expect(breached.size).toBe(46483);
    for (const known of ['password1234', 'Password1234', 'qwertyuiop', '12345678']) {
      expect(breached.has(known), known).toBe(true);
    }
    expect(breached.has(long)).toBe(false);
  });

  it('AC-10-24 refuses password1234 wherever the firm lets a password be that short; AC-10-21 takes a long one', () => {
    const shorter = new PasswordRules(
      { passwordMinimumLength: 8, passwordMaximumLength: shippedPolicy.passwordMaximumLength },
      breached,
    );
    expect(shorter.problem('password1234', dana)?.code).toBe('PASSWORD_BREACHED');
    // As shipped, fifteen characters are asked first.
    expect(rules.problem('password1234', dana)?.code).toBe('PASSWORD_TOO_SHORT');
    expect(rules.problem('1q2w3e4r5t6y7u8i', dana)?.code).toBe('PASSWORD_BREACHED');
    expect(rules.problem(long, dana)).toBeUndefined();
  });
});

describe('the code a reset by email carries', () => {
  const secret = 'made-up-signing-secret-for-this-test-only';
  const codes = new ResetCodes(secret, 60);
  const luis = randomUUID();
  const monday = new Date('2026-10-12T14:00:00Z');
  const after = (minutes: number): Date => new Date(monday.getTime() + minutes * 60_000);
  const aHash = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';

  it('AC-10-25 names the person and when it runs out, and is good only over the hash they have now', () => {
    const code = codes.make(luis, aHash, monday);
    const named = codes.read(code, after(59));
    expect(named).toEqual({ userId: luis, expiresAt: after(60) });
    if (named === undefined) return;
    expect(codes.signedOver(code, named, aHash)).toBe(true);
    // Once the password has changed, by this code or any other way, it is spent.
    expect(codes.signedOver(code, named, `${aHash}Zm9v`)).toBe(false);
    expect(codes.signedOver(code, named, null)).toBe(false);
    expect(code).not.toContain(aHash);
  });

  it('runs out after the policy’s minutes', () => {
    const code = codes.make(luis, aHash, monday);
    expect(codes.read(code, after(60))).toBeUndefined();
    expect(codes.read(code, after(600))).toBeUndefined();
  });

  it('can’t be made or changed by anybody else: another person, a later end, another secret', () => {
    const code = codes.make(luis, aHash, monday);
    const [, signature] = code.split('.');
    const forged = (userId: string, expiresAt: Date): string =>
      `${Buffer.from(`${userId}.${String(expiresAt.getTime())}`).toString('base64url')}.${signature ?? ''}`;
    const dana = randomUUID();
    for (const [changed, userId, until] of [
      [forged(dana, after(60)), dana, after(60)],
      [forged(luis, after(6000)), luis, after(6000)],
    ] as const) {
      const named = codes.read(changed, monday);
      expect(named).toEqual({ userId, expiresAt: until });
      if (named !== undefined) expect(codes.signedOver(changed, named, aHash)).toBe(false);
    }
    const others = new ResetCodes('another-made-up-secret-for-this-test', 60);
    const named = codes.read(others.make(luis, aHash, monday), monday);
    if (named !== undefined) {
      expect(codes.signedOver(others.make(luis, aHash, monday), named, aHash)).toBe(false);
    }
  });

  it('reads nothing from what isn’t a code', () => {
    for (const junk of ['', 'a', 'a.b', 'a.b.c', '....', `${luis}.1`, 'sent-9f3c-never-logged']) {
      expect(codes.read(junk, monday), junk).toBeUndefined();
    }
  });
});

describe('the firm’s mail', () => {
  const settings = { smtpAddress: undefined, mailFrom: Settings.defaultMailFrom };

  it('AC-10-25 is never required: with no mail server nothing is sent and the API still starts', () => {
    expect(mailFor({ ...settings, smtpUrl: '' })).toBeInstanceOf(NoMail);
    expect(mailFor({ ...settings, smtpUrl: '' }).available).toBe(false);
    expect(mailFor({ ...settings, smtpUrl: 'smtp://127.0.0.1:1025' })).toBeInstanceOf(SmtpMail);
  });

  it('is told where its server is and who a message is from by the settings; a malformed one stops the start, by name', () => {
    const good = {
      // Put together in support/process.ts, so that no file holds a login's URL.
      DATABASE_URL: madeUpSettings.databaseUrl,
      READONLY_DATABASE_URL: madeUpSettings.databaseUrl,
      ADMS_TOKEN_SIGNING_SECRET: 'made-up-signing-secret-for-this-test-only',
      SMTP_URL: '',
      ADMS_API_HOST: '127.0.0.1',
      ADMS_API_PORT: '3000',
      ADMS_ADDRESSES_URL: 'https://addresses.adms.localhost',
      ADMS_MEDIA_URL: 'https://s3.adms.localhost',
      ADMS_MEDIA_BUCKET: 'adms-media',
      ADMS_MEDIA_REGION: 'us-east-1',
      ADMS_MEDIA_ACCESS_KEY: ['MADE', 'UP', 'FOR', 'THIS', 'TEST'].join(''),
      ADMS_MEDIA_SECRET_KEY: 'made-up-for-this-test-only',
    };
    expect(Settings.from(good).mailFrom).toBe('open-adms@adms.localhost');
    expect(Settings.from(good).smtpAddress).toBeUndefined();
    const own = Settings.from({
      ...good,
      ADMS_SMTP_ADDRESS: 'mail:1025',
      ADMS_MAIL_FROM: 'adms@gates.example',
    });
    expect([own.smtpAddress, own.mailFrom]).toEqual(['mail:1025', 'adms@gates.example']);
    for (const [key, written] of [
      ['ADMS_SMTP_ADDRESS', 'mail'],
      ['ADMS_MAIL_FROM', 'Gates <adms@gates.example>'],
      ['ADMS_MAIL_FROM', 'adms@gates.example\r\nBcc: sent-9f3c@evil.example'],
    ] as const) {
      const refused = (): Settings => Settings.from({ ...good, [key]: written });
      expect(refused, written).toThrow(`The API did not start: ${key} is malformed.`);
      expect(refused, written).not.toThrow(/9f3c|Gates </);
    }
  });
});

describe('the reset endpoints, before anything is read', () => {
  const lines: string[] = [];
  let api: ApiProcess;
  const post = (url: string, payload: unknown) =>
    api.app.inject({ method: 'POST', url, payload: payload as object });

  beforeAll(async () => {
    api = await ApiProcess.create(ApiModule, madeUpSettings, shippedPolicy, {
      stream: { write: (line) => lines.push(line) },
    });
    await ready(api);
  });
  afterAll(async () => {
    await api.close();
  });

  it('AC-10-36 are two endpoints of the contracts, each with a body its schema names whole', () => {
    expect(endpoints).toContain(requestPasswordResetEndpoint);
    expect(endpoints).toContain(completePasswordResetEndpoint);
    expect(
      [requestPasswordResetEndpoint, completePasswordResetEndpoint].map(
        ({ method, path }) => `${method} ${path}`,
      ),
    ).toEqual(['POST /password-resets', 'POST /password-resets/completions']);
    expect(errorCodes).toEqual(
      expect.arrayContaining([
        'PASSWORD_TOO_SHORT',
        'PASSWORD_TOO_LONG',
        'PASSWORD_BREACHED',
        'PASSWORD_EASY_TO_GUESS',
        'RESET_REFUSED',
        'NO_MAIL',
      ]),
    );
  });

  it('AC-10-25 a firm with no mail server: asking for a reset answers NO_MAIL, and an admin sets the password instead', async () => {
    const answer = await post('/password-resets', { email: 'luis.ortega@gates.example' });
    expect(answer.statusCode).toBe(409);
    expect(errorAnswerSchema.parse(answer.json()).code).toBe('NO_MAIL');
  });

  it('AC-10-34 a field the schema doesn’t name refuses the whole request', async () => {
    for (const [url, payload] of [
      ['/password-resets', { email: 'luis.ortega@gates.example', userId: randomUUID() }],
      ['/password-resets', {}],
      ['/password-resets', { email: '' }],
      ['/password-resets/completions', { code: 'a.b', password: long, role: 'ADMIN' }],
      ['/password-resets/completions', { code: 'a.b' }],
      ['/password-resets/completions', { password: long }],
    ] as const) {
      const answer = await post(url, payload);
      expect(answer.statusCode, JSON.stringify(payload)).toBe(400);
      expect(errorAnswerSchema.parse(answer.json()).code).toBe('BAD_REQUEST');
    }
  });

  it('a code the server never made is refused as any bad one, and nothing is read', async () => {
    for (const code of ['sent-9f3c-never-logged', 'a.b', `${'x'.repeat(80)}.${'y'.repeat(43)}`]) {
      const answer = await post('/password-resets/completions', { code, password: long });
      expect(answer.statusCode, code).toBe(400);
      expect(errorAnswerSchema.parse(answer.json()).code).toBe('RESET_REFUSED');
    }
  });

  it('AC-10-32 the log holds no password, no code and no address anybody sent', () => {
    const log = lines.join('\n');
    expect(lines.length).toBeGreaterThan(0);
    for (const sent of [long, 'sent-9f3c', 'luis.ortega', 'gates.example']) {
      expect(log, sent).not.toContain(sent);
    }
  });
});
