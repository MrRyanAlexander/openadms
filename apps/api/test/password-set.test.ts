// Setting a password, against the database (ARCHITECTURE §6, Passwords, §7.0; acceptance file 10,
// AC-10-20, 24, 25 and AC-10-32's part; T-16, T-43; ADR-170, 402…405): an admin sets one, a person
// resets theirs by email where the firm has mail, and all that is kept is the slow hash. The
// service and the real process, in this test's own memory, on the installation's database as
// `adms_api`: it needs `pnpm local:up` after `pnpm installer`, and fails saying so. Each test's
// work is undone (support/database.ts). The last test sends through the local stack's mail
// catcher and reads the message back from it.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request as overHttps } from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorAnswerSchema } from '@open-adms/contracts';
import { systemActorId, type Database } from '@open-adms/db';
import { PasswordRules } from '@open-adms/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ApiModule } from '../src/process/api-module.ts';
import { ApiProcess } from '../src/process/api-process.ts';
import { Settings } from '../src/process/settings.ts';
import { shippedBreachedPasswords } from '../src/sign-in/breached-list.ts';
import { SmtpMail, type Mail, type Message } from '../src/sign-in/mail.ts';
import { PasswordHasher } from '../src/sign-in/password-hasher.ts';
import { Passwords } from '../src/sign-in/passwords.ts';
import { ResetCodes } from '../src/sign-in/reset-codes.ts';
import { installationSettings, openInstallation, undone, type Tx } from './support/database.ts';
import { madeUpSettings, ready, shippedPolicy } from './support/process.ts';

const long = 'marsh heron delphine ferry';
const longer = 'ferry delphine heron marsh';
const keptOut = '[kept out of the audit]';
const hasher = new PasswordHasher();
const secret = 'made-up-signing-secret-for-this-test-only';

// What the firm's mail server would have been handed.
class Outbox implements Mail {
  readonly available = true;
  readonly sent: Message[] = [];

  send(message: Message): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

class NoServer implements Mail {
  readonly available = false;

  send(): Promise<void> {
    return Promise.reject(new Error('no mail server'));
  }
}

// Monday 12 October 2026, 10:00 in Bayline County; a test moves it on.
class TestClock {
  at = new Date('2026-10-12T14:00:00Z');

  now(): Date {
    return this.at;
  }

  later(minutes: number): void {
    this.at = new Date(this.at.getTime() + minutes * 60_000);
  }
}

// The example world's people (CONVENTIONS §6): Gates Disaster Recovery's back office, Bayline
// County's debris manager, and a monitor.
interface People {
  readonly dana: string;
  readonly luis: string;
  readonly viewer: string;
  readonly kim: string;
}

async function people(tx: Tx, dana: string): Promise<People> {
  await tx.user.create({
    data: { id: dana, name: 'Dana Reyes', role: 'ADMIN', email: 'dana.reyes@gates.example' },
  });
  const luis = await tx.user.create({
    data: { name: 'Luis Ortega', role: 'MANAGER_ANALYST', email: 'Luis.Ortega@gates.example' },
  });
  const viewer = await tx.user.create({
    data: {
      name: 'Bayline County debris manager',
      role: 'READ_ONLY_VIEWER',
      viewerKind: 'CLIENT',
      seesPrivateCitizens: true,
      email: 'debris@baylinecounty.example',
    },
  });
  const kim = await tx.user.create({
    data: { name: 'Kim Nguyen', role: 'MONITOR', email: 'kim.nguyen@harbor.example' },
  });
  return { dana, luis: luis.id, viewer: viewer.id, kim: kim.id };
}

function passwordsOn(within: Database, mail: Mail, clock = new TestClock()): Passwords {
  return new Passwords(within, {
    rules: new PasswordRules(shippedPolicy, shippedBreachedPasswords()),
    hasher,
    resetCodes: new ResetCodes(secret, shippedPolicy.passwordResetMinutes),
    mail,
    clock,
    resetMinutes: shippedPolicy.passwordResetMinutes,
  });
}

const hashOf = async (tx: Tx, userId: string): Promise<string | null> =>
  (await tx.userCredential.findUnique({ where: { userId } }))?.passwordHash ?? null;

// The code a reset message carries: its own paragraph.
function codeIn(message: Message | undefined): string {
  const code = message?.text.split('\n\n')[2];
  if (code === undefined) throw new Error('The message carries no code.');
  return code;
}

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

// Each test's own piece of work, started as Dana and undone.
const world = (work: (within: Database, tx: Tx, who: People) => Promise<void>): Promise<void> => {
  const dana = randomUUID();
  return undone(db, dana, async (within, tx) => work(within, tx, await people(tx, dana)));
};

describe('an admin sets a password', () => {
  it('AC-10-20 the server keeps an Argon2id hash of it and nothing else, audited as the admin with the hash kept out', async () => {
    await world(async (within, tx, { dana, luis }) => {
      const set = await passwordsOn(within, new NoServer()).setByAdmin(dana, luis, long);
      expect(set).toEqual({ set: true, told: false });
      const kept = await tx.userCredential.findUniqueOrThrow({ where: { userId: luis } });
      expect(kept.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      expect(await hasher.verify(long, kept.passwordHash ?? '')).toBe(true);
      const audited = await tx.auditRecord.findMany({
        where: { tableName: 'user_credential', recordId: kept.id },
      });
      expect(audited).toHaveLength(1);
      expect(audited[0]).toMatchObject({
        actorId: dana,
        source: 'BACK_OFFICE',
        domain: 'SECURITY',
      });
      expect((audited[0]?.newValue as { password_hash?: string }).password_hash).toBe(keptOut);
      // Nothing the database holds of this work is the password, or the hash outside its column.
      const everything = JSON.stringify(
        [
          await tx.user.findMany({ where: { id: { in: [dana, luis] } } }),
          await tx.auditRecord.findMany({ where: { actorId: dana } }),
          { ...kept, passwordHash: undefined },
        ],
        (_key, value: unknown) => (typeof value === 'bigint' ? String(value) : value),
      );
      expect(everything).not.toContain(long);
      expect(everything).not.toContain(kept.passwordHash);
    });
  });

  it('AC-10-25 a firm with no mail server: Luis forgot his, Dana sets him a new one, and the old one is gone', async () => {
    await world(async (within, tx, { dana, luis }) => {
      const passwords = passwordsOn(within, new NoServer());
      await passwords.setByAdmin(dana, luis, long);
      const first = await hashOf(tx, luis);
      expect(await passwords.setByAdmin(dana, luis, longer)).toEqual({ set: true, told: false });
      const second = await hashOf(tx, luis);
      expect(second).not.toBe(first);
      expect(await hasher.verify(longer, second ?? '')).toBe(true);
      expect(await hasher.verify(long, second ?? '')).toBe(false);
      expect(await tx.userCredential.count({ where: { userId: luis } })).toBe(1);
    });
  });

  it('only an admin does, read from the database in the same piece of work: not a manager/analyst, a viewer, a monitor, an archived admin or nobody', async () => {
    await world(async (within, tx, { dana, luis, viewer, kim }) => {
      const passwords = passwordsOn(within, new NoServer());
      for (const notAnAdmin of [luis, viewer, kim, randomUUID(), systemActorId]) {
        expect(await passwords.setByAdmin(notAnAdmin, luis, long), notAnAdmin).toEqual({
          set: false,
          code: 'NOT_ALLOWED',
        });
      }
      await within.$write({ actorId: dana, source: 'BACK_OFFICE' }, (inner) =>
        inner.user.update({ where: { id: dana }, data: { archivedAt: new Date() } }),
      );
      expect((await passwords.setByAdmin(dana, luis, long)).set).toBe(false);
      expect(await hashOf(tx, luis)).toBeNull();
    });
  });

  it('for a person with a login: never the system actor, an archived person or nobody', async () => {
    await world(async (within, tx, { dana, luis }) => {
      const passwords = passwordsOn(within, new NoServer());
      await within.$write({ actorId: dana, source: 'BACK_OFFICE' }, (inner) =>
        inner.user.update({ where: { id: luis }, data: { archivedAt: new Date() } }),
      );
      for (const nobody of [systemActorId, luis, randomUUID()]) {
        expect(await passwords.setByAdmin(dana, nobody, long), nobody).toEqual({
          set: false,
          code: 'NOT_FOUND',
        });
      }
      expect(
        await tx.userCredential.count({ where: { userId: { in: [systemActorId, luis] } } }),
      ).toBe(0);
    });
  });

  it('AC-10-21, 24 by the domain’s rules, told why in plain words: long is enough, a breached one and one made of their own name are refused, and nothing is kept', async () => {
    await world(async (within, tx, { dana, luis }) => {
      const passwords = passwordsOn(within, new NoServer());
      expect(await passwords.setByAdmin(dana, luis, 'password1234')).toEqual({
        set: false,
        code: 'PASSWORD_TOO_SHORT',
        message: 'A password needs at least 15 characters.',
      });
      expect(await passwords.setByAdmin(dana, luis, '1q2w3e4r5t6y7u8i')).toMatchObject({
        set: false,
        code: 'PASSWORD_BREACHED',
      });
      for (const guessed of ['Luis Ortega 2026!!', 'luis.ortega@gates.example']) {
        expect(await passwords.setByAdmin(dana, luis, guessed), guessed).toMatchObject({
          set: false,
          code: 'PASSWORD_EASY_TO_GUESS',
        });
      }
      expect(await hashOf(tx, luis)).toBeNull();
      expect((await passwords.setByAdmin(dana, luis, long)).set).toBe(true);
    });
  });

  it('a monitor’s is the firm’s practice, their phone number without the area code (ADR-105): exempt from the rules, kept as the same slow hash', async () => {
    await world(async (within, tx, { dana, kim }) => {
      expect(await passwordsOn(within, new NoServer()).setByAdmin(dana, kim, '5550142')).toEqual({
        set: true,
        told: false,
      });
      expect(await hasher.verify('5550142', (await hashOf(tx, kim)) ?? '')).toBe(true);
    });
  });
});

describe('a person resets their password by email', () => {
  it('AC-10-25 a firm with mail: Luis asks, the message goes to the address the firm holds for him, and its code sets his new password, written as him', async () => {
    await world(async (within, tx, { dana, luis }) => {
      const outbox = new Outbox();
      const passwords = passwordsOn(within, outbox);
      await passwords.setByAdmin(dana, luis, long);
      outbox.sent.length = 0;

      // Typed in other capitals, with a space after it.
      expect(await passwords.requestReset('luis.ortega@GATES.example ')).toEqual({
        asked: true,
        sent: true,
      });
      expect(outbox.sent).toHaveLength(1);
      expect(outbox.sent[0]).toMatchObject({
        to: 'Luis.Ortega@gates.example',
        subject: 'Reset your Open ADMS password',
      });
      expect(outbox.sent[0]?.text).toContain('good once, for 60 minutes');
      // Asking wrote nothing.
      expect(await tx.auditRecord.count({ where: { actorId: luis } })).toBe(0);

      const code = codeIn(outbox.sent[0]);
      expect(await passwords.completeReset(code, longer)).toEqual({ set: true, told: true });
      const kept = await tx.userCredential.findUniqueOrThrow({ where: { userId: luis } });
      expect(await hasher.verify(longer, kept.passwordHash ?? '')).toBe(true);
      expect(await hasher.verify(long, kept.passwordHash ?? '')).toBe(false);
      const audited = await tx.auditRecord.findMany({
        where: { tableName: 'user_credential', recordId: kept.id },
        orderBy: { id: 'asc' },
      });
      expect(audited.map(({ actorId, operation }) => [actorId, operation])).toEqual([
        [dana, 'INSERT'],
        [luis, 'UPDATE'],
      ]);
      expect(audited[1]?.changedFields).toEqual(['password_hash']);
      // He is told it changed; the message carries no code and no password.
      expect(outbox.sent[1]).toMatchObject({
        to: 'Luis.Ortega@gates.example',
        subject: 'Your Open ADMS password was changed',
      });
      expect(JSON.stringify(outbox.sent)).not.toContain(longer);
    });
  });

  it('the code is good once: used again, or after the password changed any other way, it is refused', async () => {
    await world(async (within, tx, { dana, luis }) => {
      const outbox = new Outbox();
      const passwords = passwordsOn(within, outbox);
      await passwords.setByAdmin(dana, luis, long);
      outbox.sent.length = 0;
      await passwords.requestReset('luis.ortega@gates.example');
      await passwords.requestReset('luis.ortega@gates.example');
      const [first, second] = outbox.sent.map((message) => codeIn(message));
      expect((await passwords.completeReset(first ?? '', longer)).set).toBe(true);
      const kept = await hashOf(tx, luis);
      for (const spent of [first, second]) {
        expect(await passwords.completeReset(spent ?? '', long)).toEqual({
          set: false,
          code: 'RESET_REFUSED',
        });
      }
      expect(await hashOf(tx, luis)).toBe(kept);
    });
  });

  it('the code runs out after the policy’s 60 minutes, and a password the rules refuse leaves it good', async () => {
    await world(async (within, tx, { luis }) => {
      const outbox = new Outbox();
      const clock = new TestClock();
      const passwords = passwordsOn(within, outbox, clock);
      // Luis has no password yet: the code is good for his first one too.
      await passwords.requestReset('luis.ortega@gates.example');
      const code = codeIn(outbox.sent[0]);
      clock.later(59);
      expect(await passwords.completeReset(code, 'password1234')).toMatchObject({
        set: false,
        code: 'PASSWORD_TOO_SHORT',
      });
      expect(await hashOf(tx, luis)).toBeNull();
      clock.later(1);
      expect(await passwords.completeReset(code, long)).toEqual({
        set: false,
        code: 'RESET_REFUSED',
      });
      clock.later(-1);
      expect((await passwords.completeReset(code, long)).set).toBe(true);
    });
  });

  it('nothing is sent for an address nobody has, a monitor’s, an archived person’s, or one two people share; the answer is the same', async () => {
    await world(async (within, tx, { dana, viewer }) => {
      const outbox = new Outbox();
      const passwords = passwordsOn(within, outbox);
      await within.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (inner) => {
        await inner.user.update({ where: { id: viewer }, data: { archivedAt: new Date() } });
        await inner.user.create({
          data: { name: 'Dana Reyes', role: 'MANAGER_ANALYST', email: 'DANA.REYES@gates.example' },
        });
      });
      for (const address of [
        'nobody@gates.example',
        'kim.nguyen@harbor.example',
        'debris@baylinecounty.example',
        'dana.reyes@gates.example',
        '%',
        '%@gates.example',
        'luis_ortega@gates.example',
        // Each would be Luis alone, were the address matched as a pattern.
        'luis.ortega@%',
        'luis.ortega@gates.exampl_',
      ]) {
        expect(await passwords.requestReset(address), address).toEqual({
          asked: true,
          sent: false,
        });
      }
      expect(outbox.sent).toEqual([]);
      expect(await tx.userCredential.count({ where: { userId: viewer } })).toBe(0);
    });
  });

  it('a monitor never resets by email, and neither does an archived person holding a good code', async () => {
    await world(async (within, tx, { dana, luis, kim }) => {
      const clock = new TestClock();
      const passwords = passwordsOn(within, new Outbox(), clock);
      const codes = new ResetCodes(secret, shippedPolicy.passwordResetMinutes);
      const forKim = codes.make(kim, null, clock.now());
      const forLuis = codes.make(luis, null, clock.now());
      await within.$write({ actorId: dana, source: 'BACK_OFFICE' }, (inner) =>
        inner.user.update({ where: { id: luis }, data: { archivedAt: new Date() } }),
      );
      for (const code of [forKim, forLuis, codes.make(randomUUID(), null, clock.now())]) {
        expect(await passwords.completeReset(code, long)).toEqual({
          set: false,
          code: 'RESET_REFUSED',
        });
      }
      expect(await tx.userCredential.count({ where: { userId: { in: [kim, luis] } } })).toBe(0);
    });
  });

  it('a message that can’t be sent refuses nothing: email is never required', async () => {
    await world(async (within, _tx, { dana, luis }) => {
      const broken: Mail = { available: true, send: () => Promise.reject(new Error('refused')) };
      const passwords = passwordsOn(within, broken);
      expect(await passwords.setByAdmin(dana, luis, long)).toEqual({ set: true, told: false });
      expect(await passwords.requestReset('luis.ortega@gates.example')).toEqual({
        asked: true,
        sent: false,
      });
    });
  });
});

describe('the reset endpoints, through the process', () => {
  it('AC-10-25, 32 ask and set over HTTP: the same answer for an address nobody has, a plain code for a refused password, and a log that holds no password, code or address', async () => {
    await world(async (within, tx, { luis }) => {
      const outbox = new Outbox();
      const lines: string[] = [];
      const api = await ApiProcess.create(
        ApiModule,
        { ...madeUpSettings, tokenSigningSecret: secret },
        shippedPolicy,
        { stream: { write: (line) => lines.push(line) }, database: within, mail: outbox },
      );
      await ready(api);
      try {
        const post = (url: string, payload: object) =>
          api.app.inject({ method: 'POST', url, payload });
        const known = await post('/password-resets', { email: 'luis.ortega@gates.example' });
        const unknown = await post('/password-resets', { email: 'nobody@gates.example' });
        expect([known.statusCode, known.json()]).toEqual([200, { status: 'accepted' }]);
        expect([unknown.statusCode, unknown.json()]).toEqual([200, { status: 'accepted' }]);
        expect(outbox.sent).toHaveLength(1);

        const code = codeIn(outbox.sent[0]);
        const refused = await post('/password-resets/completions', {
          code,
          password: '1q2w3e4r5t6y7u8i',
        });
        expect(refused.statusCode).toBe(422);
        expect(errorAnswerSchema.parse(refused.json()).code).toBe('PASSWORD_BREACHED');
        expect(await hashOf(tx, luis)).toBeNull();

        const set = await post('/password-resets/completions', { code, password: long });
        expect([set.statusCode, set.json()]).toEqual([200, { status: 'ok' }]);
        expect(await hasher.verify(long, (await hashOf(tx, luis)) ?? '')).toBe(true);
        // The change carries its request's id into the audit log (AC-10-43).
        const audited = await tx.auditRecord.findFirstOrThrow({
          where: { tableName: 'user_credential', actorId: luis },
        });
        expect(audited.requestId).toBe(set.headers['x-request-id']);

        const again = await post('/password-resets/completions', { code, password: longer });
        expect(errorAnswerSchema.parse(again.json()).code).toBe('RESET_REFUSED');

        const log = lines.join('\n');
        expect(log).toContain('A password reset by email was asked for.');
        for (const sent of [
          long,
          longer,
          '1q2w3e4r5t6y7u8i',
          code,
          'luis.ortega',
          'gates.example',
        ]) {
          expect(log, sent).not.toContain(sent);
        }
      } finally {
        await api.close();
      }
    });
  });
});

describe('afterwards', () => {
  it('each test’s work was undone: the installation’s database holds none of these people', async () => {
    expect(await db.user.count({ where: { email: { endsWith: '@gates.example' } } })).toBe(0);
  });
});

describe('the local stack’s mail catcher', () => {
  const stack = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'infra', 'local');
  const hostname = 'mail.adms.localhost';

  // Mailpit's own API, through the stack's proxy, over HTTPS.
  function catcher(method: string, path: string, body?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = overHttps(
        {
          host: '127.0.0.1',
          port: Number(process.env['ADMS_HTTPS_PORT'] ?? '443'),
          servername: hostname,
          ca: readFileSync(join(stack, '.generated', 'caddy-root.crt')),
          path,
          method,
          headers: { host: hostname, 'content-type': 'application/json' },
        },
        (res) => {
          let answered = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => (answered += chunk));
          res.on('end', () => {
            resolve(answered);
          });
        },
      );
      req.on('error', reject);
      req.end(body);
    });
  }

  it('AC-10-25 takes a reset message sent as the API sends one, with its code whole', async () => {
    const to = `luis.ortega+${randomUUID()}@gates.example`;
    const code = new ResetCodes(secret, 60).make(randomUUID(), null, new Date());
    const mail = new SmtpMail({
      smtpUrl: `smtp://127.0.0.1:${process.env['ADMS_SMTP_PORT'] ?? '1025'}`,
      smtpAddress: undefined,
      mailFrom: Settings.defaultMailFrom,
    });
    await mail.send({
      to,
      subject: 'Reset your Open ADMS password',
      text: `Luis Ortega,\n\n${code}\n`,
    });

    const found = JSON.parse(
      await catcher('GET', `/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`),
    ) as { messages: { ID: string; Subject: string; From: { Address: string } }[] };
    expect(found.messages).toHaveLength(1);
    const [message] = found.messages;
    expect(message?.Subject).toBe('Reset your Open ADMS password');
    expect(message?.From.Address).toBe('open-adms@adms.localhost');
    const whole = JSON.parse(await catcher('GET', `/api/v1/message/${message?.ID ?? ''}`)) as {
      Text: string;
    };
    expect(whole.Text).toContain(code);
    // The catcher keeps what it is sent; this test takes its own message back out.
    await catcher('DELETE', '/api/v1/messages', JSON.stringify({ IDs: [message?.ID] }));
  });
});
