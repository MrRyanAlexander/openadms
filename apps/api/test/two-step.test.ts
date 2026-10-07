// Two-step sign-in, against the database (ARCHITECTURE §6; acceptance file 02, AC-02-14, 74;
// file 10, AC-10-26 and AC-10-32's part; T-14, T-16, T-26; ADR-170, 412). NIST SP 800-63B-4
// §3.1.4, §3.2.2; ASVS 6.4.4, 6.5.1, 6.5.5. The real process, in this test's own memory, on the
// installation's database as `adms_api`: it needs `pnpm local:up` after `pnpm installer`, and
// fails saying so. Each test's work is undone (support/database.ts).
import { sessionAnswerSchema, twoStepSetupAnswerSchema } from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OneTimeCodes } from '../src/sign-in/one-time-codes.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import {
  danasEmail,
  danasSecret,
  long,
  longer,
  luissEmail,
  luissSecret,
  ran,
  worldOn,
  wrong,
  type Answer,
  type Served,
  type Signed,
} from './support/served.ts';
import { Outbox, signInOn } from './support/sign-in.ts';

const codes = new OneTimeCodes();
const keptOut = '[kept out of the audit]';
const viewersEmail = 'debris@baylinecounty.example';
const viewersPassword = 'delphine marsh ferry heron';

let db: Database;

// What the installation held of sign-in before these tests (a developer may have signed in on
// this machine, and nothing of that is ever deleted).
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

const kept = (tx: Tx, userId: string) =>
  tx.userCredential.findUniqueOrThrow({
    where: { userId },
    select: { twoStepSecret: true, twoStepLastStep: true, failedSignIns: true },
  });
const kindsOf = async (tx: Tx, userId: string) =>
  (await tx.securityEvent.findMany({ where: { userId }, orderBy: { id: 'asc' } })).map(
    ({ kind }) => kind,
  );
const told = (answer: Answer): [number, string | undefined] => [answer.status, answer.code];
const write = (served: Served, signed: Pick<Signed, 'cookies' | 'csrf'>) =>
  served.ask('POST', '/test/voids', { ...signed, payload: { status: 'ok' } });
// The person's authenticator is taken away, as if they never set one up.
const without = (tx: Tx, userId: string) =>
  tx.userCredential.update({
    where: { userId },
    data: { twoStepSecret: null, twoStepLastStep: null },
  });
// A person sets an authenticator up, as their page and their app would: the secret it now holds.
async function setUp(
  served: Served,
  signed: Pick<Signed, 'cookies' | 'csrf'>,
  email: string,
): Promise<Buffer> {
  const begun = await served.ask('POST', '/two-step/setups', signed);
  expect(told(begun)).toEqual([200, undefined]);
  const { secret, setup } = twoStepSetupAnswerSchema.parse(begun.body);
  const held = base32Read(secret);
  const confirmed = await served.ask('POST', '/two-step/setups/confirmations', {
    ...signed,
    payload: { setup, code: codes.codeAt(held, served.step()) },
  });
  expect(told(confirmed)).toEqual([200, undefined]);
  served.authenticators.set(email, held);
  served.gave(email);
  return held;
}
// What an app does with the text it is given (RFC 4648's base32, without padding).
function base32Read(text: string): Buffer {
  const bits = Array.from(text, (letter) =>
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(letter).toString(2).padStart(5, '0'),
  ).join('');
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
}

describe('the second step at sign-in', () => {
  it('AC-02-14 Dana and Luis get no session without their authenticator’s code: the right password alone opens nothing and writes nothing', async () => {
    await world(async (served, tx, who) => {
      for (const [email, password, userId] of [
        [danasEmail, long, who.dana],
        [luissEmail, longer, who.luis],
      ] as const) {
        const alone = await served.signIn(email, password);
        expect(told(alone)).toEqual([401, 'TWO_STEP_CODE_NEEDED']);
        expect(alone.setCookie).toEqual([]);
        expect(await kindsOf(tx, userId)).toEqual([]);
        expect(await kept(tx, userId)).toMatchObject({ failedSignIns: 0, twoStepLastStep: null });
        // With it, they are in, and nothing more is asked of them.
        const { answer, cookies, csrf } = await served.signedIn(email, password);
        expect(sessionAnswerSchema.parse(answer.body)).toMatchObject({
          twoStepSetUp: true,
          twoStepSetupRequired: false,
        });
        expect(told(await write(served, { cookies, csrf }))).toEqual([200, undefined]);
        expect(await kindsOf(tx, userId)).toEqual(['SIGN_IN']);
      }
      // A wrong password is told nothing of the second step, code or no code.
      expect(told(await served.signIn(danasEmail, wrong))).toEqual([401, 'SIGN_IN_REFUSED']);
    });
  });

  it('a wrong code is a wrong try at the login: refused as any failed sign-in, counted, and a security event', async () => {
    await world(async (served, tx, { dana }) => {
      const right = codes.codeAt(danasSecret, served.step());
      const not = right === '000000' ? '000001' : '000000';
      for (const code of [not, 'not a code', '12345', `${right}0`]) {
        const answer = await served.signIn(danasEmail, long, code);
        expect(told(answer), code).toEqual([401, 'SIGN_IN_REFUSED']);
        expect(answer.setCookie).toEqual([]);
      }
      expect(await kindsOf(tx, dana)).toEqual(Array(4).fill('SIGN_IN_FAILED'));
      expect(await kept(tx, dana)).toMatchObject({ failedSignIns: 4, twoStepLastStep: null });
      // Luis's code is not hers.
      expect(
        told(await served.signIn(danasEmail, long, codes.codeAt(luissSecret, served.step()))),
      ).toEqual([401, 'SIGN_IN_REFUSED']);
      expect((await kept(tx, dana)).failedSignIns).toBe(5);
    });
  });

  it('wrong codes lock the login as wrong passwords do: after the policy’s count the right code is refused too', async () => {
    await world(async (served, tx, { dana }) => {
      await tx.userCredential.update({ where: { userId: dana }, data: { failedSignIns: 9 } });
      const right = (): string => codes.codeAt(danasSecret, served.step());
      const not = right() === '000000' ? '000001' : '000000';
      expect(told(await served.signIn(danasEmail, long, not))).toEqual([401, 'SIGN_IN_REFUSED']);
      expect(await kindsOf(tx, dana)).toEqual(['SIGN_IN_FAILED', 'LOCKOUT']);
      expect(told(await served.signIn(danasEmail, long, right()))).toEqual([
        401,
        'SIGN_IN_REFUSED',
      ]);
      // Locked, a right password with no code is told nothing either.
      expect(told(await served.signIn(danasEmail, long))).toEqual([401, 'SIGN_IN_REFUSED']);
      expect(await kindsOf(tx, dana)).toEqual(['SIGN_IN_FAILED', 'LOCKOUT']);
    });
  });

  it('a code is good once: the same one again, or an older one, opens nothing and is a wrong try (ASVS 6.5.1)', async () => {
    await world(async (served, tx, { dana }) => {
      const first = codes.codeAt(danasSecret, served.step());
      expect(told(await served.signIn(danasEmail, long, first))).toEqual([200, undefined]);
      expect((await kept(tx, dana)).twoStepLastStep).toBe(served.step());
      // Whoever watched her type it tries it within the same thirty seconds.
      expect(told(await served.signIn(danasEmail, long, first))).toEqual([401, 'SIGN_IN_REFUSED']);
      expect(await kindsOf(tx, dana)).toEqual(['SIGN_IN', 'SIGN_IN_FAILED']);
      // Thirty seconds on she signs in with the next; the one before it stays spent, though its
      // step is still within what the server takes in.
      served.clock.later(0.5);
      const second = codes.codeAt(danasSecret, served.step());
      expect(told(await served.signIn(danasEmail, long, second))).toEqual([200, undefined]);
      expect(told(await served.signIn(danasEmail, long, first))).toEqual([401, 'SIGN_IN_REFUSED']);
      expect((await kept(tx, dana)).twoStepLastStep).toBe(served.step());
    });
  });

  it('takes in the code of one step either side of the server’s own, and none further off (ASVS 6.5.5)', async () => {
    await world(async (served) => {
      const at = served.step();
      for (const [away, taken] of [
        [-2, false],
        [2, false],
        [-1, true],
        // The step before was taken, so the server's own is the next that is.
        [0, true],
        [1, true],
      ] as const) {
        const answer = await served.signIn(danasEmail, long, codes.codeAt(danasSecret, at + away));
        expect(told(answer), String(away)).toEqual(
          taken ? [200, undefined] : [401, 'SIGN_IN_REFUSED'],
        );
      }
    });
  });

  it('AC-02-74 a read-only viewer signs in with a password alone unless they chose an authenticator; having chosen, they need its code', async () => {
    await world(async (served, tx, { viewer }, within) => {
      await tx.userCredential.create({
        data: {
          userId: viewer,
          passwordHash: await signInOn(within, new Outbox()).hasher.hash(viewersPassword),
        },
      });
      const signed = await served.signedIn(viewersEmail, viewersPassword);
      expect(sessionAnswerSchema.parse(signed.answer.body)).toMatchObject({
        user: { role: 'READ_ONLY_VIEWER' },
        twoStepSetUp: false,
        twoStepSetupRequired: false,
      });
      // Nothing is asked of them first.
      expect(told(await write(served, signed))).toEqual([200, undefined]);
      // They choose one.
      await setUp(served, signed, viewersEmail);
      expect(await kindsOf(tx, viewer)).toEqual(['SIGN_IN', 'TWO_STEP_SET_UP']);
      expect(told(await served.signIn(viewersEmail, viewersPassword))).toEqual([
        401,
        'TWO_STEP_CODE_NEEDED',
      ]);
      const again = await served.signedIn(viewersEmail, viewersPassword);
      expect(sessionAnswerSchema.parse(again.answer.body)).toMatchObject({
        twoStepSetUp: true,
        twoStepSetupRequired: false,
      });
    });
  });
});

describe('setting an authenticator up', () => {
  it('AC-02-14 an admin or a manager/analyst with none is made to set one up first: their session opens nothing else', async () => {
    await world(async (served, tx, { dana, luis }) => {
      for (const [email, password, userId] of [
        [danasEmail, long, dana],
        [luissEmail, longer, luis],
      ] as const) {
        await without(tx, userId);
        served.authenticators.delete(email);
        const signed = await served.signedIn(email, password);
        expect(sessionAnswerSchema.parse(signed.answer.body)).toMatchObject({
          twoStepSetUp: false,
          twoStepSetupRequired: true,
        });
        ran.length = 0;
        expect(told(await write(served, signed))).toEqual([403, 'TWO_STEP_SETUP_REQUIRED']);
        expect(ran).toEqual([]);
        // Clearing somebody else's is not open to them either.
        expect(
          told(await served.ask('POST', `/people/${luis}/two-step-clearings`, signed)),
        ).toEqual([403, 'TWO_STEP_SETUP_REQUIRED']);
        // Who they are is; and so is setting it up.
        expect(told(await served.current(signed.cookies))).toEqual([200, undefined]);
        await setUp(served, signed, email);
        expect(told(await write(served, signed))).toEqual([200, undefined]);
        expect(
          sessionAnswerSchema.parse((await served.current(signed.cookies)).body),
        ).toMatchObject({ twoStepSetUp: true, twoStepSetupRequired: false });
      }
    });
  });

  it('a person sets it up by proving a code: nothing is kept until then, and what is kept is sealed and out of the audit log', async () => {
    await world(async (served, tx, { luis }) => {
      await without(tx, luis);
      served.authenticators.delete(luissEmail);
      const signed = await served.signedIn(luissEmail, longer);
      const other = await served.signedIn(luissEmail, longer);
      const begun = await served.ask('POST', '/two-step/setups', signed);
      const { secret, uri, setup, expiresAt } = twoStepSetupAnswerSchema.parse(begun.body);
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(uri).toBe(
        `otpauth://totp/Open%20ADMS:Luis.Ortega%40gates.example?secret=${secret}&issuer=Open%20ADMS&algorithm=SHA1&digits=6&period=30`,
      );
      // Ten minutes to finish, the policy's.
      expect(new Date(expiresAt)).toEqual(new Date(served.clock.now().getTime() + 10 * 60_000));
      // Begun twice, it is another secret each time; nothing is kept of either.
      const again = twoStepSetupAnswerSchema.parse(
        (await served.ask('POST', '/two-step/setups', signed)).body,
      );
      expect(again.secret).not.toBe(secret);
      expect(await kept(tx, luis)).toMatchObject({ twoStepSecret: null, twoStepLastStep: null });

      const held = base32Read(secret);
      const right = codes.codeAt(held, served.step());
      const confirm = (payload: object) =>
        served.ask('POST', '/two-step/setups/confirmations', { ...signed, payload });
      // A code that doesn't prove the app has the secret: of another secret, or no code.
      for (const code of [codes.codeAt(luissSecret, served.step()), 'not a code']) {
        expect(told(await confirm({ setup, code })), code).toEqual([422, 'TWO_STEP_REFUSED']);
      }
      // A setup nobody began, and one without the header a page sends with a write.
      expect(told(await confirm({ setup: 'made.up.setup', code: right }))).toEqual([
        422,
        'TWO_STEP_REFUSED',
      ]);
      expect(
        told(
          await served.ask('POST', '/two-step/setups/confirmations', {
            cookies: signed.cookies,
            payload: { setup, code: right },
          }),
        ),
      ).toEqual([403, 'CSRF_REFUSED']);
      expect(await kept(tx, luis)).toMatchObject({ twoStepSecret: null, failedSignIns: 0 });
      expect(await kindsOf(tx, luis)).toEqual(['SIGN_IN', 'SIGN_IN']);

      const confirmed = await confirm({ setup, code: right });
      expect(told(confirmed)).toEqual([200, undefined]);
      expect(sessionAnswerSchema.parse(confirmed.body)).toMatchObject({
        user: { id: luis },
        twoStepSetUp: true,
        twoStepSetupRequired: false,
        csrf: signed.csrf,
      });
      const now = await kept(tx, luis);
      expect(now.twoStepSecret).toMatch(/^v1\./);
      expect(now.twoStepSecret).not.toContain(secret);
      expect(now.twoStepLastStep).toBe(served.step());
      expect(await kindsOf(tx, luis)).toEqual(['SIGN_IN', 'SIGN_IN', 'TWO_STEP_SET_UP']);
      const audited = await tx.auditRecord.findMany({
        where: { actorId: luis, requestId: confirmed.requestId },
        orderBy: { id: 'asc' },
      });
      expect(audited.map(({ tableName, domain }) => [tableName, domain]).sort()).toEqual([
        ['security_event', 'SECURITY'],
        ['session', 'SECURITY'],
        ['user_credential', 'SECURITY'],
      ]);
      const held2 = JSON.stringify(
        audited.map(({ priorValue, newValue }) => [priorValue, newValue]),
      );
      expect(held2).toContain(keptOut);
      for (const never of [secret, now.twoStepSecret ?? '', held.toString('hex'), setup]) {
        expect(held2).not.toContain(never);
      }
      // His other session is ended; the one he set it up in carries on.
      expect(told(await served.current(other.cookies))).toEqual([401, 'NOT_SIGNED_IN']);
      expect(told(await served.current(signed.cookies))).toEqual([200, undefined]);
      // The code that set it up is no sign-in, and the setup is spent.
      expect(told(await served.signIn(luissEmail, longer, right))).toEqual([
        401,
        'SIGN_IN_REFUSED',
      ]);
      expect(told(await confirm({ setup, code: right }))).toEqual([409, 'TWO_STEP_ALREADY_SET_UP']);
      expect(told(await served.ask('POST', '/two-step/setups', signed))).toEqual([
        409,
        'TWO_STEP_ALREADY_SET_UP',
      ]);
      // Thirty seconds on, his app's next code signs him in.
      served.clock.later(0.5);
      expect(
        told(await served.signIn(luissEmail, longer, codes.codeAt(held, served.step()))),
      ).toEqual([200, undefined]);
    });
  });

  it('a setup is good only for the person it was begun for, and only for the policy’s ten minutes', async () => {
    await world(async (served, tx, { dana, luis }) => {
      await without(tx, dana);
      await without(tx, luis);
      served.authenticators.clear();
      const danas = await served.signedIn(danasEmail, long);
      const luiss = await served.signedIn(luissEmail, longer);
      const { secret, setup } = twoStepSetupAnswerSchema.parse(
        (await served.ask('POST', '/two-step/setups', danas)).body,
      );
      const held = base32Read(secret);
      const confirm = (signed: Signed) =>
        served.ask('POST', '/two-step/setups/confirmations', {
          ...signed,
          payload: { setup, code: codes.codeAt(held, served.step()) },
        });
      // Luis sends Dana's setup with a right code for it.
      expect(told(await confirm(luiss))).toEqual([422, 'TWO_STEP_REFUSED']);
      expect((await kept(tx, luis)).twoStepSecret).toBeNull();
      // Ten minutes on, it has run out for her too. (Her session is kept going meanwhile.)
      served.clock.later(4);
      const kept4 = await served.refresh(danas);
      served.clock.later(4);
      const kept8 = await served.refresh({ cookies: kept4.cookies, csrf: danas.csrf });
      served.clock.later(2);
      const late = { ...danas, cookies: kept8.cookies };
      expect(told(await confirm(late))).toEqual([422, 'TWO_STEP_REFUSED']);
      expect((await kept(tx, dana)).twoStepSecret).toBeNull();
      // She begins again, and that one is taken.
      await setUp(served, late, danasEmail);
      expect((await kept(tx, dana)).twoStepSecret).toMatch(/^v1\./);
    });
  });

  it('a person who must first set their own password does that before setting an authenticator up (ADR-410)', async () => {
    await world(async (served, tx, { luis }) => {
      await without(tx, luis);
      served.authenticators.delete(luissEmail);
      await tx.userCredential.update({
        where: { userId: luis },
        data: { passwordChangeRequired: true },
      });
      const signed = await served.signedIn(luissEmail, longer);
      expect(told(await served.ask('POST', '/two-step/setups', signed))).toEqual([
        403,
        'PASSWORD_CHANGE_REQUIRED',
      ]);
      const changed = await served.ask('POST', '/password-changes', {
        ...signed,
        payload: { current: longer, password: viewersPassword },
      });
      expect(told(changed)).toEqual([200, undefined]);
      // His password is his own now; the authenticator is next, and nothing else is open yet.
      expect(told(await write(served, signed))).toEqual([403, 'TWO_STEP_SETUP_REQUIRED']);
      await setUp(served, signed, luissEmail);
      expect(told(await write(served, signed))).toEqual([200, undefined]);
    });
  });
});

describe('an admin clears somebody’s authenticator', () => {
  it('AC-10-26 Luis lost the phone that holds his: Dana clears it, he is signed out everywhere, it is a security event, and he sets it up again at his next sign-in', async () => {
    const outbox = new Outbox();
    await world(async (served, tx, { dana, luis }) => {
      const luiss = await served.signedIn(luissEmail, longer);
      const danas = await served.signedIn(danasEmail, long);
      const before = await kept(tx, luis);
      const cleared = await served.ask('POST', `/people/${luis}/two-step-clearings`, danas);
      expect([cleared.status, cleared.body]).toEqual([200, { status: 'cleared' }]);
      expect(await kept(tx, luis)).toMatchObject({ twoStepSecret: null, twoStepLastStep: null });
      // A security event about Luis, written by Dana in that request.
      expect(await kindsOf(tx, luis)).toEqual(['SIGN_IN', 'TWO_STEP_CLEARED']);
      const audited = await tx.auditRecord.findMany({
        where: { actorId: dana, requestId: cleared.requestId },
      });
      expect(audited.map(({ tableName, domain }) => [tableName, domain]).sort()).toEqual([
        ['security_event', 'SECURITY'],
        ['session', 'SECURITY'],
        ['user_credential', 'SECURITY'],
      ]);
      const held = JSON.stringify(
        audited.map(({ priorValue, newValue }) => [priorValue, newValue]),
      );
      expect(held).toContain(keptOut);
      expect(held).not.toContain(before.twoStepSecret ?? '');
      // He is signed out; she is not.
      expect(told(await served.current(luiss.cookies))).toEqual([401, 'NOT_SIGNED_IN']);
      expect(told(await served.current(danas.cookies))).toEqual([200, undefined]);
      // He is told, at the address the firm holds for him.
      expect(outbox.sent.map(({ to, subject }) => [to, subject])).toEqual([
        ['Luis.Ortega@gates.example', 'The authenticator of your Open ADMS login was cleared'],
      ]);
      // His next sign-in takes his password alone, and opens nothing but setting one up; the
      // lost phone's codes are worth nothing.
      served.authenticators.delete(luissEmail);
      const next = await served.signedIn(luissEmail, longer);
      expect(sessionAnswerSchema.parse(next.answer.body)).toMatchObject({
        twoStepSetUp: false,
        twoStepSetupRequired: true,
      });
      expect(told(await write(served, next))).toEqual([403, 'TWO_STEP_SETUP_REQUIRED']);
      const held2 = await setUp(served, next, luissEmail);
      expect(held2.equals(luissSecret)).toBe(false);
      expect(told(await write(served, next))).toEqual([200, undefined]);
      expect(await kindsOf(tx, luis)).toEqual([
        'SIGN_IN',
        'TWO_STEP_CLEARED',
        'SIGN_IN',
        'TWO_STEP_SET_UP',
      ]);
      expect(outbox.sent.map(({ subject }) => subject)).toEqual([
        'The authenticator of your Open ADMS login was cleared',
        'An authenticator was set up for your Open ADMS login',
      ]);
    }, outbox);
  });

  it('only an admin clears one, never their own, and only one that is there; each refusal changes nothing', async () => {
    await world(async (served, tx, { dana, luis, viewer, kim }) => {
      const danas = await served.signedIn(danasEmail, long);
      const luiss = await served.signedIn(luissEmail, longer);
      const clear = (who: string, signed: Pick<Signed, 'cookies' | 'csrf'>) =>
        served.ask('POST', `/people/${who}/two-step-clearings`, signed);
      // A manager/analyst is no admin.
      expect(told(await clear(dana, luiss))).toEqual([403, 'NOT_ALLOWED']);
      // Her own: she has her authenticator, or the server can't tell her from a stranger.
      expect(told(await clear(dana, danas))).toEqual([403, 'NOT_ALLOWED']);
      // Without what her page sends with a write.
      expect(told(await clear(luis, { cookies: danas.cookies, csrf: 'made-up' }))).toEqual([
        403,
        'CSRF_REFUSED',
      ]);
      // Nobody signed in.
      expect(told(await clear(luis, { cookies: {}, csrf: danas.csrf }))).toEqual([
        401,
        'NOT_SIGNED_IN',
      ]);
      // Somebody with none: a viewer who never chose one, a monitor.
      for (const none of [viewer, kim]) {
        expect(told(await clear(none, danas)), none).toEqual([409, 'TWO_STEP_NOT_SET_UP']);
      }
      // Nobody, and something that is no id.
      expect(told(await clear('0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d99', danas))).toEqual([
        404,
        'NOT_FOUND',
      ]);
      expect(told(await clear('luis', danas))).toEqual([400, 'BAD_REQUEST']);
      for (const userId of [dana, luis]) {
        expect((await kept(tx, userId)).twoStepSecret).toMatch(/^v1\./);
        expect(await kindsOf(tx, userId)).toEqual(['SIGN_IN']);
      }
      expect(told(await served.current(luiss.cookies))).toEqual([200, undefined]);
    });
  });

  it('an archived admin clears nothing, and nobody clears an archived person’s', async () => {
    await world(async (_served, tx, { dana, luis }, within) => {
      const { twoStep } = signInOn(within, new Outbox());
      await tx.user.update({ where: { id: luis }, data: { archivedAt: new Date() } });
      expect(await twoStep.clearByAdmin(dana, luis)).toEqual({ cleared: false, code: 'NOT_FOUND' });
      // The firm has another admin, or Dana, its last, couldn't be archived at all (ADR-415).
      await tx.user.create({ data: { name: 'Priya Shah', role: 'ADMIN' } });
      await tx.user.update({ where: { id: dana }, data: { archivedAt: new Date() } });
      expect(await twoStep.clearByAdmin(dana, luis)).toEqual({
        cleared: false,
        code: 'NOT_ALLOWED',
      });
      expect((await kept(tx, luis)).twoStepSecret).toMatch(/^v1\./);
    });
  });
});

describe('the log', () => {
  it('AC-10-32 Dana signed in with her password and an authenticator code, set one up and cleared one: no line holds a code, a secret or a setup', async () => {
    await world(async (served, tx, { dana, luis }) => {
      await without(tx, dana);
      served.authenticators.delete(danasEmail);
      const first = await served.signedIn(danasEmail, long);
      const begun = twoStepSetupAnswerSchema.parse(
        (await served.ask('POST', '/two-step/setups', first)).body,
      );
      const held = base32Read(begun.secret);
      const setupCode = codes.codeAt(held, served.step());
      await served.ask('POST', '/two-step/setups/confirmations', {
        ...first,
        payload: { setup: begun.setup, code: '000000' },
      });
      await served.ask('POST', '/two-step/setups/confirmations', {
        ...first,
        payload: { setup: begun.setup, code: setupCode },
      });
      served.clock.later(0.5);
      await served.signIn(danasEmail, long);
      const wrongCode = '999999';
      await served.signIn(danasEmail, long, wrongCode);
      const signInCode = codes.codeAt(held, served.step());
      const signedIn = await served.signIn(danasEmail, long, signInCode);
      expect(told(signedIn)).toEqual([200, undefined]);
      const second = {
        cookies: signedIn.cookies,
        csrf: sessionAnswerSchema.parse(signedIn.body).csrf,
      };
      const sealedBefore = (await kept(tx, luis)).twoStepSecret ?? '';
      await served.ask('POST', `/people/${luis}/two-step-clearings`, second);
      await served.ask('POST', `/people/${dana}/two-step-clearings`, second);

      const parsed = served.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
      // Each line about a sign-in or an authenticator carries its request's id.
      const about = parsed.filter((line) => /sign-in|authenticator/.test(String(line['msg'])));
      expect(about).toHaveLength(9);
      expect(about.every((line) => typeof line['requestId'] === 'string')).toBe(true);
      const said = (msg: string) =>
        parsed.filter((line) => line['msg'] === msg).map((line) => line['why']);
      expect(said('A sign-in was refused.')).toEqual(['CODE_NEEDED', 'WRONG_CODE']);
      expect(said('A sign-in worked.')).toHaveLength(2);
      expect(said('The setup of an authenticator was begun.')).toHaveLength(1);
      expect(said('The setup of an authenticator was refused.')).toEqual(['TWO_STEP_REFUSED']);
      expect(said('An authenticator was set up.')).toHaveLength(1);
      expect(said('An admin cleared a person’s authenticator.')).toHaveLength(1);
      expect(said('Clearing an authenticator was refused.')).toEqual(['NOT_ALLOWED']);
      const log = served.lines.join('\n');
      // Six digits may turn up by chance inside a time: a code is looked for as a value.
      for (const never of [
        `"${setupCode}"`,
        `"${signInCode}"`,
        `"${wrongCode}"`,
        begun.secret,
        begun.setup,
        ...begun.setup.split('.'),
        held.toString('hex'),
        held.toString('base64'),
        sealedBefore,
        (await kept(tx, dana)).twoStepSecret ?? '',
        'otpauth',
        '"code"',
        '"secret"',
        '"setup"',
        long,
        'gates.example',
        'Luis',
      ]) {
        expect(never).not.toBe('');
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
