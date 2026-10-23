// Rate limits (ARCHITECTURE §6, Abuse; acceptance file 10, AC-10-40 and its point 13; T-16, T-17;
// ADR-416): a caller over a limit is refused with a plain code and told when to try again; one
// address is counted apart from another, and a login's own count apart from both; the numbers
// are policy values an installation may state. The first tests need no stack; the ones of
// sign-in run against the test database (`pnpm local:up`), each in its own piece of
// work, undone.
import { errorAnswerSchema, healthAnswerSchema } from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { RateLimits } from '@open-adms/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installationPolicy } from '../src/policy.ts';
import { answerHeaders } from '../src/process/answer-headers.ts';
import { ApiModule } from '../src/process/api-module.ts';
import { ApiProcess, type ProcessPolicy } from '../src/process/api-process.ts';
import { Limited, Limits } from '../src/process/limits.ts';
import { testSettings, openTestDatabase } from './support/database.ts';
import { listedOrigin, madeUpSettings, ready, shippedPolicy } from './support/process.ts';
import {
  danasEmail,
  long,
  longer,
  luissEmail,
  worldOn,
  wrong,
  type Answer,
} from './support/served.ts';
import { enrolledPhone, proven } from './support/phones.ts';
import { Outbox, TestClock } from './support/sign-in.ts';

// What an installation states for itself, over the release's values (ADR-395).
const stating = (own: Record<string, string>): ProcessPolicy => installationPolicy(own);

const limited = (answer: Answer, seconds: number): void => {
  expect([answer.status, answer.code]).toEqual([429, 'LIMITED']);
  expect(answer.headers['retry-after']).toBe(String(seconds));
  expect(errorAnswerSchema.parse(answer.body).retryAfterSeconds).toBe(seconds);
};

describe('one address sending requests faster than the policy allows', () => {
  const lines: string[] = [];
  const clock = new TestClock();
  let api: ApiProcess;
  const health = (from: string, headers: Record<string, string> = {}) =>
    api.app.inject({ method: 'GET', url: '/health', remoteAddress: from, headers });

  beforeAll(async () => {
    api = await ApiProcess.create(
      ApiModule,
      { ...madeUpSettings, trustedProxies: ['10.0.0.2', '10.1.0.0/16'] },
      stating({ RATE_LIMIT_REQUESTS_PER_ADDRESS: '3', RATE_LIMIT_WINDOW_SECONDS: '20' }),
      { stream: { write: (line) => lines.push(line) }, clock },
    );
    await ready(api);
  });
  afterAll(async () => {
    await api.close();
  });

  it('AC-10-40 is limited by its address: refused with a plain code and told when to try again, in a header and in the body; another address is not', async () => {
    for (let sent = 0; sent < 3; sent += 1) {
      expect((await health('203.0.113.7')).statusCode).toBe(200);
    }
    clock.later(0.1);
    const fourth = await health('203.0.113.7');
    expect(fourth.statusCode).toBe(429);
    const told = errorAnswerSchema.parse(fourth.json());
    expect(told).toEqual({
      code: 'LIMITED',
      requestId: fourth.headers['x-request-id'],
      retryAfterSeconds: 14,
    });
    expect(fourth.headers['retry-after']).toBe('14');
    // It carries the API's own headers, as every answer does.
    for (const [name, value] of Object.entries(answerHeaders)) {
      expect(fourth.headers[name]).toBe(value);
    }
    // Somebody else, at that moment.
    expect(healthAnswerSchema.parse((await health('203.0.113.8')).json()).status).toBe('ok');
    // A refused request is not counted: when the stretch is over the address is let in again.
    clock.later(0.2);
    expect((await health('203.0.113.7')).statusCode).toBe(429);
    clock.later(0.05);
    expect((await health('203.0.113.7')).statusCode).toBe(200);
  });

  it('the brand read, open to anybody, is counted by its address like every other request: refused past the limit, with nothing of the firm in the refusal', async () => {
    const brand = (from: string) =>
      api.app.inject({ method: 'GET', url: '/brand', remoteAddress: from });
    // Whatever each answered (this process has no database of its own), three were let through.
    for (let sent = 0; sent < 3; sent += 1)
      expect((await brand('203.0.113.31')).statusCode).not.toBe(429);
    const refused = await brand('203.0.113.31');
    expect(refused.statusCode).toBe(429);
    expect(errorAnswerSchema.parse(refused.json()).code).toBe('LIMITED');
    expect(refused.body).not.toMatch(/ADMS|version/);
  });

  it('the log says that a caller was limited and by which limit, with the request’s id, and never the address', async () => {
    lines.length = 0;
    for (let sent = 0; sent < 4; sent += 1) await health('203.0.113.21');
    const said = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    const warned = said.filter((line) => line['msg'] === 'A caller was limited.');
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatchObject({ level: 40, limit: 'REQUESTS_BY_ADDRESS' });
    expect(typeof warned[0]?.['requestId']).toBe('string');
    expect(lines.join('\n')).not.toContain('203.0.113');
  });

  it('a page of a listed origin can read the refusal and when to try again; a browser’s asking-first is counted like any request', async () => {
    const asks = () =>
      api.app.inject({
        method: 'OPTIONS',
        url: '/sessions',
        remoteAddress: '203.0.113.30',
        headers: { origin: listedOrigin, 'access-control-request-method': 'POST' },
      });
    for (let sent = 0; sent < 3; sent += 1) expect((await asks()).statusCode).toBe(204);
    const fourth = await asks();
    expect(fourth.statusCode).toBe(429);
    expect(fourth.headers['access-control-allow-origin']).toBe(listedOrigin);
    expect(fourth.headers['access-control-expose-headers']).toBe(
      'x-request-id, retry-after, content-disposition',
    );
    expect(fourth.headers['access-control-allow-methods']).toBeUndefined();
  });

  it('a caller’s address is the one that connected, unless a listed proxy says whose request it carries: nobody else’s word is taken (C85)', async () => {
    const forwarded = (from: string, said: string) => health(from, { 'x-forwarded-for': said });
    // Through the proxy: each caller is counted as itself, not as the proxy.
    for (let sent = 0; sent < 3; sent += 1) {
      expect((await forwarded('10.0.0.2', '203.0.113.40')).statusCode).toBe(200);
    }
    expect((await forwarded('10.0.0.2', '203.0.113.40')).statusCode).toBe(429);
    expect((await forwarded('10.0.0.2', '203.0.113.41')).statusCode).toBe(200);
    // A second listed proxy in the chain, by its network.
    expect((await forwarded('10.0.0.2', '203.0.113.40, 10.1.9.9')).statusCode).toBe(429);
    // What a caller wrote in front of the proxy's own word changes nothing.
    expect((await forwarded('10.0.0.2', '198.51.100.99, 203.0.113.40')).statusCode).toBe(429);
    // A caller that is no listed proxy is not believed: it is counted by its own address,
    // whatever it says, and can't put its requests on somebody else's count.
    for (let sent = 0; sent < 3; sent += 1) {
      expect((await forwarded('203.0.113.50', `203.0.113.${String(60 + sent)}`)).statusCode).toBe(
        200,
      );
    }
    expect((await forwarded('203.0.113.50', '203.0.113.70')).statusCode).toBe(429);
    expect((await health('203.0.113.60')).statusCode).toBe(200);
  });

  it('AC-10-116 a request that came through a proxy the API doesn’t trust is answered as its own address, and the log says so once an hour, naming the setting and never an address; a trusted proxy’s says nothing (ADR-549)', async () => {
    const said = () => lines.filter((line) => line.includes('a proxy the API doesn’t trust'));
    // The test before sent through an untrusted proxy already: said once, however often since.
    await health('203.0.113.80', { 'x-forwarded-for': '198.51.100.81' });
    await health('203.0.113.80', { 'x-forwarded-for': '198.51.100.82' });
    expect(said()).toHaveLength(1);
    expect(said()[0]).toContain('ADMS_TRUSTED_PROXIES');
    for (const address of ['203.0.113', '198.51.100', '10.0.0.2']) {
      expect(said()[0]).not.toContain(address);
    }
    // An hour on, said again; a trusted proxy's word, never.
    clock.later(61);
    await health('10.0.0.2', { 'x-forwarded-for': '203.0.113.90' });
    expect(said()).toHaveLength(1);
    await health('203.0.113.80', { 'x-forwarded-for': '198.51.100.83' });
    expect(said()).toHaveLength(2);
  });

  it('an IPv6 caller is counted by its network, so a caller with a network of addresses is one caller', async () => {
    for (let sent = 0; sent < 3; sent += 1) {
      expect((await health(`2001:db8:5:6::${String(sent + 1)}`)).statusCode).toBe(200);
    }
    expect((await health('2001:db8:5:6:ffff::9')).statusCode).toBe(429);
    expect((await health('2001:db8:5:7::1')).statusCode).toBe(200);
  });
});

describe('the counts the server keeps', () => {
  it('are bounded by the policy: past its number the oldest goes, and the rest stand', () => {
    const clock = new TestClock();
    const limits = new Limits(new RateLimits(stating({ RATE_LIMIT_COUNTS_KEPT: '1000' })), clock);
    for (let caller = 0; caller < 1000; caller += 1) {
      expect(limits.arrived(`10.9.${String(caller >> 8)}.${String(caller & 255)}`)).toBeUndefined();
    }
    expect(limits.size).toBe(1000);
    limits.arrived('203.0.113.1');
    limits.arrived('203.0.113.2');
    expect(limits.size).toBe(1000);
    // A stretch that is over makes room for itself when its caller comes again.
    clock.later(2);
    limits.arrived('203.0.113.1');
    expect(limits.size).toBe(1000);
  });

  it('a refusal is a 429 that says which limit and how long', () => {
    const refusal = new Limited('REQUESTS_BY_ACCOUNT', 7);
    expect([refusal.getStatus(), refusal.code, refusal.limit, refusal.retryAfterSeconds]).toEqual([
      429,
      'LIMITED',
      'REQUESTS_BY_ACCOUNT',
      7,
    ]);
    expect(shippedPolicy.rateLimitRequestsPerAddress).toBe(3000);
  });
});

let db: Database;
beforeAll(() => {
  db = openTestDatabase(testSettings());
});
afterAll(async () => {
  await db.$disconnect();
});
const world = worldOn(() => db);

describe('tries at a login', () => {
  it('AC-10-40 one address is stopped before it has spent the login’s own tries: its fifth try never reaches the login, which neither waits nor counts it; from another address its owner signs in', async () => {
    await world(async (served, tx, { luis }) => {
      const home = served.from;
      served.from = '203.0.113.80';
      for (let tried = 0; tried < 4; tried += 1) {
        expect((await served.signIn(luissEmail, wrong)).code).toBe('SIGN_IN_REFUSED');
      }
      const written = await tx.auditRecord.count();
      limited(await served.signIn(luissEmail, wrong), 3600);
      // The right password from there is told the same: a limit says nothing of a password.
      served.clock.later(10);
      limited(await served.signIn(luissEmail, longer, served.codeOf(luissEmail)), 3000);
      limited(await served.signIn(' LUIS.Ortega@gates.example ', wrong), 3000);
      expect(await tx.auditRecord.count()).toBe(written);
      expect(await tx.userCredential.findUniqueOrThrow({ where: { userId: luis } })).toMatchObject({
        failedSignIns: 4,
        lockedUntil: null,
      });
      // That address may still try another login: the count is of one address at one login.
      expect((await served.signIn(danasEmail, wrong)).code).toBe('SIGN_IN_REFUSED');
      // Luis, from his own address, is not kept waiting by the stranger.
      served.from = home;
      await served.signedIn(luissEmail, longer);
      // When the stretch is over the address may try again.
      served.from = '203.0.113.80';
      served.clock.later(50);
      expect((await served.signIn(luissEmail, wrong)).code).toBe('SIGN_IN_REFUSED');
    });
  });

  it('AC-10-40 one login tried from many addresses is limited by the login’s own count: no address is over its limit, and the login waits', async () => {
    await world(async (served, tx, { luis }) => {
      for (let tried = 0; tried < 5; tried += 1) {
        served.from = `203.0.113.${String(90 + tried)}`;
        expect((await served.signIn(luissEmail, wrong)).code).toBe('SIGN_IN_REFUSED');
      }
      const kept = await tx.userCredential.findUniqueOrThrow({ where: { userId: luis } });
      expect(kept.failedSignIns).toBe(5);
      expect(kept.lockedUntil).toEqual(new Date(served.clock.now().getTime() + 30_000));
      served.from = '203.0.113.99';
      expect((await served.signIn(luissEmail, longer, served.codeOf(luissEmail))).code).toBe(
        'SIGN_IN_REFUSED',
      );
    });
  });

  it('a sign-in that works from an address starts its count at that login again; a first step answered “the code is needed” is no wrong try', async () => {
    await world(async (served) => {
      for (let round = 0; round < 2; round += 1) {
        for (let tried = 0; tried < 3; tried += 1) {
          expect((await served.signIn(luissEmail, wrong)).code).toBe('SIGN_IN_REFUSED');
        }
        for (let asked = 0; asked < 3; asked += 1) {
          expect((await served.signIn(luissEmail, longer)).code).toBe('TWO_STEP_CODE_NEEDED');
        }
        await served.signedIn(luissEmail, longer);
      }
    });
  });

  it('a password set anew starts every address’s count at that login again: its owner is not kept out by the tries that came before', async () => {
    const outbox = new Outbox();
    await world(async (served) => {
      for (let tried = 0; tried < 4; tried += 1) {
        expect((await served.signIn(luissEmail, wrong)).code).toBe('SIGN_IN_REFUSED');
      }
      limited(await served.signIn(luissEmail, longer, served.codeOf(luissEmail)), 3600);
      expect(
        (await served.ask('POST', '/password-resets', { payload: { email: luissEmail } })).status,
      ).toBe(200);
      const code = outbox.sent.at(-1)?.text.split('\n\n')[2] ?? '';
      expect(
        (
          await served.ask('POST', '/password-resets/completions', {
            payload: { code, password: long },
          })
        ).status,
      ).toBe(200);
      await served.signedIn(luissEmail, long);
    }, outbox);
  });

  it('one address refused too often is stopped whoever’s login it tries next, and at a reset’s code, a current password and an authenticator’s code too', async () => {
    await world(
      async (served) => {
        const dana = await served.signedIn(danasEmail, long);
        // A name nobody has, a reset's code nobody made, a wrong current password.
        expect((await served.signIn('nobody@gates.example', wrong)).code).toBe('SIGN_IN_REFUSED');
        expect(
          (
            await served.ask('POST', '/password-resets/completions', {
              payload: { code: 'a.b', password: longer },
            })
          ).code,
        ).toBe('RESET_REFUSED');
        const change = () =>
          served.ask('POST', '/password-changes', {
            ...dana,
            payload: { current: wrong, password: longer },
          });
        expect((await change()).code).toBe('PASSWORD_WRONG');
        // The fourth, whatever it is.
        limited(await change(), 3600);
        limited(await served.signIn(luissEmail, longer, served.codeOf(luissEmail)), 3600);
        limited(
          await served.ask('POST', '/password-resets/completions', {
            payload: { code: 'a.b', password: longer },
          }),
          3600,
        );
        limited(
          await served.ask('POST', '/two-step/setups/confirmations', {
            ...dana,
            payload: { setup: 'a', code: '000000' },
          }),
          3600,
        );
        // What is no try at a secret still answers her, and another address is not held up.
        expect((await served.current(dana.cookies)).status).toBe(200);
        served.from = '203.0.113.100';
        await served.signedIn(luissEmail, longer);
      },
      undefined,
      stating({ SIGN_IN_WRONG_TRIES_PER_ADDRESS: '3' }),
    );
  });
});

describe('a reset by email, asked for again and again', () => {
  const ask = (served: Parameters<Parameters<typeof world>[0]>[0], email: string) =>
    served.ask('POST', '/password-resets', { payload: { email } });

  it('is limited for the login asked for, whoever asks and whether or not anybody has it: the person gets three messages, not a flood (ADR-404 (9))', async () => {
    const outbox = new Outbox();
    await world(async (served) => {
      for (const email of [danasEmail, 'nobody@gates.example']) {
        for (let asked = 0; asked < 3; asked += 1) {
          served.from = `203.0.113.${String(110 + asked)}`;
          expect((await ask(served, email)).status).toBe(200);
        }
        served.from = '203.0.113.120';
        limited(await ask(served, ` ${email.toUpperCase()}`), 3600);
      }
      expect(outbox.sent.map(({ to }) => to)).toEqual([danasEmail, danasEmail, danasEmail]);
      // Luis's is his own count.
      expect((await ask(served, luissEmail)).status).toBe(200);
    }, outbox);
  });

  it('is limited for the address that asks, whoever it asks for', async () => {
    const outbox = new Outbox();
    await world(
      async (served) => {
        expect((await ask(served, danasEmail)).status).toBe(200);
        expect((await ask(served, luissEmail)).status).toBe(200);
        limited(await ask(served, 'debris@baylinecounty.example'), 3600);
        expect(outbox.sent).toHaveLength(2);
        served.from = '203.0.113.130';
        expect((await ask(served, 'debris@baylinecounty.example')).status).toBe(200);
      },
      outbox,
      stating({ PASSWORD_RESET_ASKS_PER_ADDRESS: '2' }),
    );
  });
});

describe('a signed-in person sending requests faster than the policy allows', () => {
  it('AC-10-40 is limited as that person, whatever address each request comes from and whichever session it is; nobody else is', async () => {
    await world(
      async (served) => {
        const dana = await served.signedIn(danasEmail, long);
        const second = await served.signedIn(danasEmail, long);
        const luis = await served.signedIn(luissEmail, longer);
        for (const [from, cookies] of [
          ['203.0.113.140', dana.cookies],
          ['203.0.113.141', second.cookies],
          ['203.0.113.142', dana.cookies],
        ] as const) {
          served.from = from;
          expect((await served.current(cookies)).status).toBe(200);
        }
        served.from = '203.0.113.143';
        limited(await served.current(second.cookies), 60);
        expect((await served.current(luis.cookies)).status).toBe(200);
        // A call that carries only the refresh token is counted for its session.
        for (let asked = 0; asked < 3; asked += 1) {
          expect((await served.ask('GET', '/sessions/csrf', luis)).status).toBe(200);
        }
        limited(await served.ask('GET', '/sessions/csrf', luis), 60);
        // No session, no count: a stranger's cookie is refused as it always was.
        expect((await served.current({ '__Host-adms-access': 'x' })).code).toBe('NOT_SIGNED_IN');
        served.clock.later(1);
        expect((await served.current(dana.cookies)).status).toBe(200);
      },
      undefined,
      stating({ RATE_LIMIT_REQUESTS_PER_ACCOUNT: '3' }),
    );
  });
});

describe('a proven phone sending requests faster than the policy allows', () => {
  it('ADR-490, AC-10-41, API4 is limited as that phone, whatever address each request comes from; another phone at the same address is not, and the phone’s token still stands once the stretch is over', async () => {
    await world(
      async (served, tx) => {
        const first = await enrolledPhone(served, tx, 'P1-COL-1');
        const second = await enrolledPhone(served, tx, 'P1-COL-2');
        const [one, other] = [await proven(served, first), await proven(served, second)];
        const current = (bearer: string) => served.ask('GET', '/phones/current', { bearer });
        for (const from of ['203.0.113.150', '203.0.113.151', '203.0.113.152']) {
          served.from = from;
          expect((await current(one)).status).toBe(200);
        }
        served.from = '203.0.113.153';
        limited(await current(one), 60);
        expect((await current(other)).status).toBe(200);
        served.clock.later(1);
        expect((await current(one)).status).toBe(200);
      },
      undefined,
      stating({ RATE_LIMIT_REQUESTS_PER_PHONE: '3' }),
    );
  });
});
