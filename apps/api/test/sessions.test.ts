// A back-office or outside user's session, against the database (ARCHITECTURE §6, Back-office
// sessions, Abuse; acceptance file 10, AC-10-09, 12…19 and AC-10-32's part, with AC-02-39's web
// half; T-14, T-15, T-16, T-24; ADR-398, 401, 408…411). The real process, in this test's own
// memory, on the installation's database as `adms_api`: it needs `pnpm local:up` after `pnpm
// installer`, and fails saying so. Each test's work is undone (support/database.ts), so a test
// stays short: a piece of work ends after five seconds.
import { createHash } from 'node:crypto';

import { sessionAnswerSchema } from '@open-adms/contracts';
import { systemActorId, type Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { accessCookie, refreshCookie } from '../src/sign-in/session-cookies.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import {
  danasEmail,
  long,
  longer,
  luissEmail,
  ran,
  worldOn,
  wrong,
  type Answer,
} from './support/served.ts';
import { NoServer, Outbox, signInOn } from './support/sign-in.ts';

const keptOut = '[kept out of the audit]';
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
// What audit records hold of the rows they copy, as text.
const heldBy = (audited: readonly { priorValue: unknown; newValue: unknown }[]): string =>
  JSON.stringify(audited.map(({ priorValue, newValue }) => [priorValue, newValue]));

let db: Database;

// What the installation held of sign-in before these tests: a developer may have signed in on
// this machine (the dev stack's accounts, ADR-412), and nothing of that is ever deleted.
let before: readonly number[];
const heldNow = (): Promise<number[]> =>
  Promise.all([db.session.count(), db.securityEvent.count(), db.userCredential.count()]);

beforeAll(async () => {
  db = openInstallation(installationSettings());
  before = await heldNow();
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const events = (tx: Tx, userId: string) =>
  tx.securityEvent.findMany({ where: { userId }, orderBy: { id: 'asc' } });
const kindsOf = async (tx: Tx, userId: string) =>
  (await events(tx, userId)).map(({ kind }) => kind);
const refused401 = (answer: Answer, code = 'NOT_SIGNED_IN'): void => {
  expect([answer.status, answer.code]).toEqual([401, code]);
};

describe('signing in', () => {
  it('AC-10-09 Dana’s access token and refresh token arrive only as cookies marked HttpOnly, Secure and SameSite; no token is in the body', async () => {
    await world(async (served, tx, { dana }) => {
      // Typed in other capitals, with a space after it.
      const { answer, cookies, csrf } = await served.signedIn(' Dana.Reyes@GATES.example ', long);
      expect(answer.body).toEqual({
        user: { id: dana, name: 'Dana Reyes', role: 'ADMIN' },
        passwordChangeRequired: false,
        twoStepSetUp: true,
        twoStepSetupRequired: false,
        csrf,
      });
      expect(answer.setCookie).toHaveLength(2);
      expect(answer.setCookie[0]).toMatch(
        /^__Host-adms-access=[^;]+; Max-Age=300; Path=\/; HttpOnly; Secure; SameSite=Strict$/,
      );
      expect(answer.setCookie[1]).toMatch(
        /^__Host-adms-refresh=[^;]+; Max-Age=1800; Path=\/; HttpOnly; Secure; SameSite=Strict$/,
      );
      const [access = '', refresh = ''] = [cookies[accessCookie], cookies[refreshCookie]];
      expect(access.length).toBeGreaterThan(40);
      expect(refresh.length).toBeGreaterThan(40);
      // Nothing of either token is in the body: the CSRF value is neither, and opens nothing.
      for (const part of [
        access,
        refresh,
        ...access.split('.').slice(2),
        ...refresh.split('.').slice(1),
      ]) {
        expect(answer.text).not.toContain(part);
      }
      refused401(await served.current({ [accessCookie]: csrf }));
      expect((await served.current(cookies)).body).toEqual(answer.body);
    });
  });

  it('AC-10-10 the server holds her refresh token only as a hash, kept out of the audit log; AC-10-19 the sign-in is a security event with who, when and from which request', async () => {
    await world(async (served, tx, { dana }) => {
      const { answer, cookies } = await served.signedIn(danasEmail, long);
      const [sessionId = '', secret = ''] = (cookies[refreshCookie] ?? '').split('.');
      const session = await tx.session.findUniqueOrThrow({ where: { id: sessionId } });
      expect(session).toMatchObject({
        userId: dana,
        refreshTokenHash: sha256(secret),
        createdAt: served.clock.now(),
        // Thirty quiet minutes from now, the policy's.
        expiresAt: new Date(served.clock.now().getTime() + 30 * 60_000),
        revokedAt: null,
      });
      expect(JSON.stringify(session)).not.toContain(secret);
      const audited = await tx.auditRecord.findMany({
        where: { actorId: dana, requestId: answer.requestId },
      });
      // The third is her sign-in record: the step of the code she signed in with (ADR-412).
      expect(audited.map(({ tableName, domain }) => [tableName, domain]).sort()).toEqual([
        ['security_event', 'SECURITY'],
        ['session', 'SECURITY'],
        ['user_credential', 'SECURITY'],
      ]);
      expect(heldBy(audited)).not.toContain(secret);
      expect(heldBy(audited)).not.toContain(sha256(secret));
      expect(heldBy(audited)).toContain(keptOut);
      expect(await events(tx, dana)).toMatchObject([
        {
          kind: 'SIGN_IN',
          userId: dana,
          requestId: answer.requestId,
          occurredAt: served.clock.now(),
        },
      ]);
      // A billing reviewer reading the audit log by domain reads none of it.
      expect(await tx.auditRecord.count({ where: { actorId: dana, domain: 'BILLING' } })).toBe(0);
    });
  });

  it('a read-only viewer signs in the same way (AC-02-74); a person may hold two sessions at once', async () => {
    await world(async (served, tx, { dana, viewer }, within) => {
      await signInOn(within, new NoServer()).passwords.setByAdmin(dana, viewer, long);
      const signed = await served.signedIn('debris@baylinecounty.example', long);
      expect(sessionAnswerSchema.parse(signed.answer.body).user.role).toBe('READ_ONLY_VIEWER');
      const [first, second] = [
        await served.signedIn(danasEmail, long),
        await served.signedIn(danasEmail, long),
      ];
      expect(first.cookies[refreshCookie]).not.toBe(second.cookies[refreshCookie]);
      expect(first.csrf).not.toBe(second.csrf);
      expect((await served.current(first.cookies)).status).toBe(200);
      expect((await served.current(second.cookies)).status).toBe(200);
    });
  });

  it('AC-10-17 nobody signs in as the system actor: it has no password and is no login', async () => {
    await world(async (served, tx) => {
      for (const name of [systemActorId, 'Open ADMS (system)', 'system', 'SYSTEM']) {
        refused401(await served.signIn(name, long), 'SIGN_IN_REFUSED');
      }
      expect(await tx.session.count({ where: { userId: systemActorId } })).toBe(0);
      expect(await tx.securityEvent.count({ where: { userId: systemActorId } })).toBe(0);
      expect(await tx.userCredential.count({ where: { userId: systemActorId } })).toBe(0);
    });
  });

  it('AC-02-39 a monitor’s ID and password open nothing here: refused as any wrong sign-in, with nothing written', async () => {
    await world(async (served, tx, { dana, kim, kimsId }, within) => {
      expect(kimsId).toMatch(/^M\d{6}$/);
      await signInOn(within, new NoServer()).passwords.setByAdmin(dana, kim, '5550142');
      const before = await tx.auditRecord.count();
      for (const name of [kimsId, 'kim.nguyen@harbor.example', 'Kim Nguyen']) {
        refused401(await served.signIn(name, '5550142'), 'SIGN_IN_REFUSED');
      }
      expect(await tx.session.count({ where: { userId: kim } })).toBe(0);
      expect(await tx.securityEvent.count({ where: { userId: kim } })).toBe(0);
      expect(await tx.auditRecord.count()).toBe(before);
    });
  });

  it('a failed sign-in is told the same thing whatever was wrong, and a try at a name nobody has writes nothing (ADR-401)', async () => {
    await world(async (served, tx, { dana, luis }) => {
      const before = await tx.auditRecord.count();
      // (Two who sign in can no longer share an address: the database refuses the second,
      // AC-02-83, ADR-415.)
      const answers = [
        await served.signIn('nobody@gates.example', long),
        await served.signIn('', long).then((answer) => answer),
      ];
      expect(answers.map(({ status, code }) => [status, code])).toEqual([
        [401, 'SIGN_IN_REFUSED'],
        [400, 'BAD_REQUEST'],
      ]);
      expect(await tx.auditRecord.count()).toBe(before);
      expect(await tx.securityEvent.count()).toBe(0);
      // A wrong password for a real login is told exactly the same.
      const wrongOne = await served.signIn(danasEmail, wrong);
      expect(Object.keys(wrongOne.body as object).sort()).toEqual(
        Object.keys(answers[0]?.body as object).sort(),
      );
      refused401(wrongOne, 'SIGN_IN_REFUSED');
      expect(wrongOne.setCookie).toEqual([]);
      expect(await kindsOf(tx, dana)).toEqual(['SIGN_IN_FAILED']);
      expect(await kindsOf(tx, luis)).toEqual([]);
    });
  });

  it('a hash with no key is made again at its owner’s next sign-in (ADR-411)', async () => {
    await world(async (served, tx, { luis }, within) => {
      // Made with no key, by the installer's hasher, for the stories' made-up master passcode.
      const earlier =
        '$argon2id$v=19$m=19456,t=2,p=1$rLnL+hWkLjJHDKTBWGSsdw$tYeMf5WEtzZTIdv2JQR18zDWwcllaJjVO71qautLsGY';
      await tx.userCredential.update({ where: { userId: luis }, data: { passwordHash: earlier } });
      await served.signedIn(luissEmail, 'heron-marsh-delphine');
      const kept = await tx.userCredential.findUniqueOrThrow({ where: { userId: luis } });
      expect(kept.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1,keyid=djE\$/);
      const { hasher } = signInOn(within, new NoServer());
      expect(await hasher.verify('heron-marsh-delphine', kept.passwordHash ?? '')).toBe(true);
    });
  });
});

describe('a session', () => {
  it('AC-10-12 an access token past its lifetime is refused; the page gets a new one with its refresh token and carries on', async () => {
    await world(async (served) => {
      const signed = await served.signedIn(danasEmail, long);
      served.clock.later(4);
      expect((await served.current(signed.cookies)).status).toBe(200);
      served.clock.later(1);
      refused401(await served.current(signed.cookies));
      const refreshed = await served.refresh(signed);
      expect(refreshed.status).toBe(200);
      expect(refreshed.body).toEqual(signed.answer.body);
      expect((await served.current(refreshed.cookies)).status).toBe(200);
      // The old access token stays run out.
      refused401(await served.current(signed.cookies));
    });
  });

  it('AC-10-13 a refresh token is used once: she is given a new one, and the server keeps the new one’s hash over the old', async () => {
    await world(async (served, tx) => {
      const signed = await served.signedIn(danasEmail, long);
      const [sessionId = '', first = ''] = (signed.cookies[refreshCookie] ?? '').split('.');
      served.clock.later(10);
      const refreshed = await served.refresh(signed);
      const [sameSession, second = ''] = (refreshed.cookies[refreshCookie] ?? '').split('.');
      expect(sameSession).toBe(sessionId);
      expect(second).not.toBe(first);
      expect(await tx.session.findUniqueOrThrow({ where: { id: sessionId } })).toMatchObject({
        refreshTokenHash: sha256(second),
        // Thirty quiet minutes from this use.
        expiresAt: new Date(served.clock.now().getTime() + 30 * 60_000),
        revokedAt: null,
      });
      expect(await tx.session.count()).toBe(1);
    });
  });

  it('AC-10-14 a refresh token presented a second time ends the session: every token that came from that sign-in stops working', async () => {
    await world(async (served, tx, { dana }) => {
      const signed = await served.signedIn(danasEmail, long);
      const refreshed = await served.refresh(signed);
      expect(refreshed.status).toBe(200);
      const now = { cookies: refreshed.cookies, csrf: signed.csrf };
      // Whoever copied the first token presents it again.
      const again = await served.refresh(signed);
      refused401(again);
      expect(again.cookies).toEqual({ [accessCookie]: '', [refreshCookie]: '' });
      // Dana's own, newer tokens are dead too, and she signs in again.
      refused401(await served.refresh(now));
      refused401(await served.current(refreshed.cookies));
      refused401(await served.ask('GET', '/sessions/csrf', now));
      const [sessionId = ''] = (signed.cookies[refreshCookie] ?? '').split('.');
      const session = await tx.session.findUniqueOrThrow({ where: { id: sessionId } });
      expect(session.revokedAt).toEqual(served.clock.now());
      const ended = await tx.auditRecord.findFirstOrThrow({
        where: { tableName: 'session', recordId: sessionId, requestId: again.requestId },
      });
      expect(ended).toMatchObject({
        actorId: dana,
        domain: 'SECURITY',
        reason: 'A refresh token was presented a second time.',
        changedFields: ['revoked_at'],
      });
      expect(served.lines.join('\n')).toContain('A refresh token was presented a second time');
      expect((await served.signedIn(danasEmail, long)).answer.status).toBe(200);
    });
  });

  it('AC-10-15 signing out revokes it on the server: her cookies, sent again afterwards, are refused', async () => {
    await world(async (served, tx) => {
      const first = await served.signedIn(danasEmail, long);
      const signed = { ...first, cookies: (await served.refresh(first)).cookies };
      // A spent refresh token signs nobody out: only the one in force ends its session.
      expect((await served.ask('POST', '/sessions/sign-outs', first)).status).toBe(200);
      expect((await served.current(signed.cookies)).status).toBe(200);
      const out = await served.ask('POST', '/sessions/sign-outs', signed);
      expect([out.status, out.body]).toEqual([200, { status: 'signed-out' }]);
      expect(out.setCookie).toEqual([
        '__Host-adms-access=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict',
        '__Host-adms-refresh=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict',
      ]);
      // The access token had minutes left: it is refused all the same.
      refused401(await served.current(signed.cookies));
      refused401(await served.refresh(signed));
      const [sessionId = ''] = (signed.cookies[refreshCookie] ?? '').split('.');
      expect((await tx.session.findUniqueOrThrow({ where: { id: sessionId } })).revokedAt).toEqual(
        served.clock.now(),
      );
      // Signing out again changes nothing and says the same.
      expect((await served.ask('POST', '/sessions/sign-outs', signed)).status).toBe(200);
    });
  });

  it('ends after thirty minutes with nothing asked of it, and twelve hours after its sign-in whatever was asked (ADR-408)', async () => {
    await world(async (served) => {
      const quiet = await served.signedIn(danasEmail, long);
      served.clock.later(30);
      refused401(await served.refresh(quiet));

      let held = await served.signedIn(danasEmail, long);
      const { csrf } = held;
      // Used every twenty minutes for eleven hours and forty minutes.
      for (let use = 0; use < 35; use += 1) {
        served.clock.later(20);
        const refreshed = await served.refresh(held);
        expect(refreshed.status).toBe(200);
        held = { ...held, cookies: refreshed.cookies };
      }
      // The last refresh token's cookie lives only to the twelfth hour: twenty minutes, not thirty.
      served.clock.later(19);
      const last = await served.refresh(held);
      expect(last.setCookie[1]).toContain('Max-Age=60;');
      served.clock.later(1);
      refused401(await served.refresh({ cookies: last.cookies, csrf }));
      refused401(await served.current(last.cookies));
    });
  });

  it('ends at once for a person who is archived: read from the database on every request', async () => {
    await world(async (served, tx, { dana, luis }, within) => {
      const signed = await served.signedIn(luissEmail, longer);
      expect((await served.current(signed.cookies)).status).toBe(200);
      await within.$write({ actorId: dana, source: 'BACK_OFFICE' }, (write) =>
        write.user.update({ where: { id: luis }, data: { archivedAt: served.clock.now() } }),
      );
      refused401(await served.current(signed.cookies));
      refused401(await served.refresh(signed));
      refused401(await served.signIn(luissEmail, longer), 'SIGN_IN_REFUSED');
    });
  });

  it('gives a page loaded anew its CSRF value by its refresh token, and only the token in force', async () => {
    await world(async (served) => {
      const signed = await served.signedIn(danasEmail, long);
      const asked = await served.ask('GET', '/sessions/csrf', { cookies: signed.cookies });
      expect([asked.status, asked.body]).toEqual([200, { csrf: signed.csrf }]);
      const refreshed = await served.refresh(signed);
      refused401(await served.ask('GET', '/sessions/csrf', { cookies: signed.cookies }));
      // Asking with a spent token ends nothing: only a spent token used to refresh does.
      expect((await served.current(refreshed.cookies)).status).toBe(200);
    });
  });
});

describe('a write made on the strength of a cookie', () => {
  it('AC-10-16 without what the back office’s own page sends with a write, it is refused and nothing changes', async () => {
    await world(async (served, tx, { dana }) => {
      const signed = await served.signedIn(danasEmail, long);
      const other = await served.signedIn(luissEmail, longer);
      const { cookies } = signed;
      const payload = { status: 'ok' };
      ran.length = 0;
      // What another site's page can make her browser send: the cookies, and no more.
      for (const csrf of [undefined, '', '1', other.csrf, `${signed.csrf}x`]) {
        const forged = await served.ask('POST', '/test/voids', {
          cookies,
          payload,
          ...(csrf === undefined ? {} : { csrf }),
        });
        expect([forged.status, forged.code]).toEqual([403, 'CSRF_REFUSED']);
      }
      expect(ran).toEqual([]);
      const before = await tx.userCredential.findUniqueOrThrow({ where: { userId: dana } });
      const change = await served.ask('POST', '/password-changes', {
        cookies,
        payload: { current: long, password: wrong },
      });
      expect([change.status, change.code]).toEqual([403, 'CSRF_REFUSED']);
      expect(await tx.userCredential.findUniqueOrThrow({ where: { userId: dana } })).toEqual(
        before,
      );
      // Nor may it sign her out or spend her refresh token.
      for (const path of ['/sessions/refreshes', '/sessions/sign-outs']) {
        const forged = await served.ask('POST', path, { cookies });
        expect([forged.status, forged.code]).toEqual([403, 'CSRF_REFUSED']);
      }
      expect((await served.current(cookies)).status).toBe(200);
      // Her own page sends the value, and the write runs.
      const own = await served.ask('POST', '/test/voids', { cookies, csrf: signed.csrf, payload });
      expect([own.status, own.body]).toEqual([200, { status: 'ok' }]);
      expect(ran).toEqual(['ok']);
    });
  });

  it('AC-10-27 with no session it is refused, whatever it sends; the session is asked for before the body is read', async () => {
    await world(async (served) => {
      ran.length = 0;
      refused401(await served.ask('POST', '/test/voids', { payload: { status: 'ok' } }));
      refused401(await served.ask('POST', '/test/voids', { payload: { nobody: 'named this' } }));
      const signed = await served.signedIn(danasEmail, long);
      const bad = await served.ask('POST', '/test/voids', {
        ...signed,
        payload: { nobody: 'named this' },
      });
      expect([bad.status, bad.code]).toEqual([400, 'BAD_REQUEST']);
      expect(ran).toEqual([]);
    });
  });
});

describe('wrong tries at a login', () => {
  it('AC-10-18 tries are made to wait longer and longer: while a login waits the right password is refused too, and nothing more is written', async () => {
    await world(async (served, tx, { luis }) => {
      for (let tried = 0; tried < 4; tried += 1) {
        refused401(await served.signIn(luissEmail, wrong), 'SIGN_IN_REFUSED');
      }
      expect(await tx.userCredential.findUniqueOrThrow({ where: { userId: luis } })).toMatchObject({
        failedSignIns: 4,
        lockedUntil: null,
      });
      const fifth = await served.signIn(luissEmail, wrong);
      refused401(fifth, 'SIGN_IN_REFUSED');
      const at = served.clock.now().getTime();
      expect(await tx.userCredential.findUniqueOrThrow({ where: { userId: luis } })).toMatchObject({
        failedSignIns: 5,
        lockedUntil: new Date(at + 30_000),
      });
      // Luis himself, with the right password, while it waits.
      const written = await tx.auditRecord.count();
      refused401(await served.signIn(luissEmail, longer), 'SIGN_IN_REFUSED');
      refused401(await served.signIn(luissEmail, wrong), 'SIGN_IN_REFUSED');
      expect(await tx.auditRecord.count()).toBe(written);
      expect(await kindsOf(tx, luis)).toEqual(Array(5).fill('SIGN_IN_FAILED'));
      // The next wrong try, once the wait is over, doubles it.
      served.clock.later(0.5);
      refused401(await served.signIn(luissEmail, wrong), 'SIGN_IN_REFUSED');
      expect(await tx.userCredential.findUniqueOrThrow({ where: { userId: luis } })).toMatchObject({
        failedSignIns: 6,
        lockedUntil: new Date(served.clock.now().getTime() + 60_000),
      });
      // Once that wait is over the right password signs him in, and the count starts again.
      served.clock.later(1);
      await served.signedIn(luissEmail, longer);
      expect(await tx.userCredential.findUniqueOrThrow({ where: { userId: luis } })).toMatchObject({
        failedSignIns: 0,
        lockedUntil: null,
      });
      expect((await kindsOf(tx, luis)).at(-1)).toBe('SIGN_IN');
    });
  });

  it('AC-10-18 after the policy’s count the login is locked, the right password refused too, until his password is set anew; AC-10-19 each failure and the lockout is a security event', async () => {
    const outbox = new Outbox();
    await world(async (served, tx, { dana, luis }, within) => {
      // Nine wrong tries in a row already, the last wait over.
      await tx.userCredential.update({ where: { userId: luis }, data: { failedSignIns: 9 } });
      const tenth = await served.signIn(luissEmail, wrong);
      refused401(tenth, 'SIGN_IN_REFUSED');
      expect(await events(tx, luis)).toMatchObject([
        {
          kind: 'SIGN_IN_FAILED',
          userId: luis,
          requestId: tenth.requestId,
          occurredAt: served.clock.now(),
        },
        {
          kind: 'LOCKOUT',
          userId: luis,
          requestId: tenth.requestId,
          occurredAt: served.clock.now(),
        },
      ]);
      const audited = await tx.auditRecord.findMany({
        where: { tableName: 'security_event', requestId: tenth.requestId },
      });
      // Written for the login that was tried: nobody was signed in (ADR-409).
      expect(audited.map(({ actorId, domain, source }) => [actorId, domain, source])).toEqual([
        [luis, 'SECURITY', 'BACK_OFFICE'],
        [luis, 'SECURITY', 'BACK_OFFICE'],
      ]);
      // He is told by email, since the sign-in page tells everybody the same.
      expect(outbox.sent).toMatchObject([
        { to: 'Luis.Ortega@gates.example', subject: 'Your Open ADMS login is locked' },
      ]);
      // Days later it is still locked, and tries at it add nothing.
      served.clock.later(3 * 24 * 60);
      const written = await tx.auditRecord.count();
      refused401(await served.signIn(luissEmail, longer), 'SIGN_IN_REFUSED');
      refused401(await served.signIn(luissEmail, wrong), 'SIGN_IN_REFUSED');
      expect(await tx.auditRecord.count()).toBe(written);
      // Dana sets him a new one: the lock opens, and he signs in.
      await signInOn(within, outbox, served.clock).passwords.setByAdmin(dana, luis, long);
      expect(await tx.userCredential.findUniqueOrThrow({ where: { userId: luis } })).toMatchObject({
        failedSignIns: 0,
        lockedUntil: null,
      });
      await served.signedIn(luissEmail, long);
    }, outbox);
  });
});

describe('a password somebody else set', () => {
  it('is changed by its owner at their next sign-in, before anything else; their own keeps nobody waiting (ADR-410)', async () => {
    await world(async (served, tx, { dana, luis }, within) => {
      const { passwords, hasher } = signInOn(within, new NoServer(), served.clock);
      // Dana's own, set by herself, is not marked; Luis's, set by Dana, is.
      await passwords.setByAdmin(dana, dana, long);
      await passwords.setByAdmin(dana, luis, long);
      const marked = async (userId: string) =>
        (await tx.userCredential.findUniqueOrThrow({ where: { userId } })).passwordChangeRequired;
      expect([await marked(dana), await marked(luis)]).toEqual([false, true]);

      const signed = await served.signedIn(luissEmail, long);
      expect(sessionAnswerSchema.parse(signed.answer.body).passwordChangeRequired).toBe(true);
      const elsewhere = await served.signedIn(luissEmail, long);
      ran.length = 0;
      const early = await served.ask('POST', '/test/voids', {
        ...signed,
        payload: { status: 'ok' },
      });
      expect([early.status, early.code]).toEqual([403, 'PASSWORD_CHANGE_REQUIRED']);
      expect(ran).toEqual([]);
      expect((await served.current(signed.cookies)).status).toBe(200);

      const change = (current: string, password: string) =>
        served.ask('POST', '/password-changes', { ...signed, payload: { current, password } });
      expect((await change(wrong, longer)).code).toBe('PASSWORD_WRONG');
      expect((await kindsOf(tx, luis)).at(-1)).toBe('SIGN_IN_FAILED');
      // The one Dana knows is not his own; nor is one the rules refuse.
      expect((await change(long, long)).code).toBe('PASSWORD_UNCHANGED');
      expect((await change(long, '1q2w3e4r5t6y7u8i')).code).toBe('PASSWORD_BREACHED');
      expect(await marked(luis)).toBe(true);

      const changed = await change(long, longer);
      expect([changed.status, changed.body]).toEqual([200, { status: 'ok' }]);
      const kept = await tx.userCredential.findUniqueOrThrow({ where: { userId: luis } });
      expect(kept).toMatchObject({ passwordChangeRequired: false, failedSignIns: 0 });
      expect(await hasher.verify(longer, kept.passwordHash ?? '')).toBe(true);
      // Written as Luis, in that request, the hash kept out.
      const audited = await tx.auditRecord.findFirstOrThrow({
        where: { tableName: 'user_credential', requestId: changed.requestId },
      });
      expect(audited.actorId).toBe(luis);
      expect(heldBy([audited])).not.toContain(kept.passwordHash);
      expect(heldBy([audited])).toContain(keptOut);

      // The session he changed it in carries on; his other one is ended.
      const now = await served.ask('POST', '/test/voids', { ...signed, payload: { status: 'ok' } });
      expect(now.status).toBe(200);
      expect(sessionAnswerSchema.parse((await served.current(signed.cookies)).body)).toMatchObject({
        passwordChangeRequired: false,
      });
      refused401(await served.current(elsewhere.cookies));
      refused401(await served.signIn(luissEmail, long), 'SIGN_IN_REFUSED');
    });
  });

  it('a password set anew by an admin or by a reset ends the person’s sessions', async () => {
    const outbox = new Outbox();
    await world(async (served, tx, { dana, luis }, within) => {
      const { passwords } = signInOn(within, outbox, served.clock);
      const first = await served.signedIn(luissEmail, longer);
      await passwords.setByAdmin(dana, luis, long);
      refused401(await served.current(first.cookies));
      refused401(await served.refresh(first));

      const second = await served.signedIn(luissEmail, long);
      outbox.sent.length = 0;
      await passwords.requestReset(luissEmail);
      const code = outbox.sent[0]?.text.split('\n\n')[2] ?? '';
      expect(await passwords.completeReset(code, longer)).toMatchObject({ set: true });
      refused401(await served.current(second.cookies));
      // His own reset is his own password: nothing left to change.
      const third = await served.signedIn(luissEmail, longer);
      expect(sessionAnswerSchema.parse(third.answer.body).passwordChangeRequired).toBe(false);
      expect(await tx.session.count({ where: { userId: luis, revokedAt: null } })).toBe(1);
    }, outbox);
  });
});

describe('the log', () => {
  it('AC-10-32 says that a sign-in worked or was refused, each line with its request’s id, and holds no password, address, token, cookie or CSRF value', async () => {
    await world(async (served) => {
      const signed = await served.signedIn(danasEmail, long);
      const failed = await served.signIn(danasEmail, wrong);
      await served.signIn('nobody@gates.example', wrong);
      const refreshed = await served.refresh(signed);
      await served.ask('POST', '/password-changes', {
        cookies: refreshed.cookies,
        csrf: signed.csrf,
        payload: { current: long, password: longer },
      });
      await served.ask('POST', '/sessions/sign-outs', {
        cookies: refreshed.cookies,
        csrf: signed.csrf,
      });

      const parsed = served.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
      const said = (msg: string) => parsed.filter((line) => line['msg'] === msg);
      expect(said('A sign-in worked.').map((line) => line['requestId'])).toEqual([
        signed.answer.requestId,
      ]);
      expect(
        said('A sign-in was refused.').map((line) => [line['requestId'], line['why']]),
      ).toEqual([
        [failed.requestId, 'WRONG'],
        [expect.any(String), 'NOBODY'],
      ]);
      const log = served.lines.join('\n');
      const tokens = [...Object.values(signed.cookies), ...Object.values(refreshed.cookies)];
      for (const never of [
        long,
        longer,
        wrong,
        'gates.example',
        'dana.reyes',
        'Dana Reyes',
        signed.csrf,
        ...tokens,
        ...tokens.flatMap((token) => token.split('.').slice(1)),
        '__Host-',
        '"password"',
        '"email"',
        '"cookie"',
      ]) {
        expect(log, never).not.toContain(never);
      }
    });
  });
});

describe('afterwards', () => {
  it('each test’s work was undone: the installation’s database holds none of these people, and no session, security event or sign-in record more than before', async () => {
    expect(await db.user.count({ where: { email: { endsWith: '@gates.example' } } })).toBe(0);
    expect(await heldNow()).toEqual(before);
  });
});
