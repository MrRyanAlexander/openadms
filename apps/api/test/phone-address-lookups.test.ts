// An address looked up for a phone's GPS, through the API (ARCHITECTURE §3 "Road distance and
// addresses", §6; spec/acceptance/04-field-capture.md AC-04-24; acceptance file 10's row for it,
// OWASP API Security Top 10 API7 and API10; BACKLOG 2.5.3, C117, C120; ADR-111, 119, 455). Part
// 5 of the task. The real process, in this test's own memory, on the test database as
// `adms_api`, asking the local stack's own address server (Delaware's roads stand in for
// Bayline County's): it needs `pnpm local:up` after `pnpm installer`, and fails saying so. Each
// test's work is undone (support/database.ts).
import {
  endpoints,
  monitorCreatedAnswerSchema,
  monitorSignedInAnswerSchema,
  phoneAddressLookupAnswerSchema,
  phoneAddressLookupEndpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import type { GpsPoint } from '@open-adms/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AddressServer, type Addresses } from '../src/phone/address-server.ts';
import { testSettings, openTestDatabase, type Tx } from './support/database.ts';
import { enrolledPhone, passcode, proven } from './support/phones.ts';
import { shippedPolicy } from './support/process.ts';
import { danasEmail, long, worldOn, type Served } from './support/served.ts';
import { NoServer } from './support/sign-in.ts';
import { StackHttpsServer, stackRootCert } from './support/stack-https.ts';
import { told } from './support/setup.ts';

let db: Database;
// The installation's own address server, as the API's process is told of it.
let stacks: AddressServer;
const serverWith = (more: { url?: string; timeoutMs?: number; answerBytesAtMost?: number }) => {
  const settings = testSettings();
  return new AddressServer({
    url: settings.addressesUrl,
    caFile: settings.mapCaFile,
    timeoutMs: shippedPolicy.addressLookupAnswerSeconds * 1000,
    at: settings.mapServersAt,
    ...more,
  });
};

beforeAll(() => {
  db = openTestDatabase(testSettings());
  stacks = serverWith({});
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);
const asking = (addresses: Addresses) => [new NoServer(), shippedPolicy, { addresses }] as const;

// The Green in Dover, a street with no house numbers on the map, and a point out at sea.
const onTheGreen = { latitude: '39.15650000', longitude: '-75.52330000' };
const onMillRoad = { latitude: '39.13844300', longitude: '-75.55388800' };
const atSea = { latitude: '38.50000000', longitude: '-73.00000000' };

// An address server of the test's own: it keeps what it was asked and answers as told.
class Told implements Addresses {
  readonly asked: GpsPoint[] = [];
  private readonly answer: () => Promise<string | null>;

  constructor(answer: () => Promise<string | null>) {
    this.answer = answer;
  }

  addressOf(point: GpsPoint): Promise<string | null> {
    this.asked.push(point);
    return this.answer();
  }
}

const lookedUp = (served: Served, payload: object, bearer?: string, monitorSession?: string) =>
  served.ask('POST', phoneAddressLookupEndpoint.path, {
    payload,
    ...(bearer === undefined ? {} : { bearer }),
    ...(monitorSession === undefined ? {} : { monitorSession }),
  });

// A phone, and Lee Morgan created on it and signed in. A lookup needs no assignment.
async function leeSignedIn(served: Served, tx: Tx) {
  const phone = await enrolledPhone(served, tx, 'P1-COL-1');
  const token = await proven(served, phone);
  const made = await served.ask('POST', '/phones/current/monitors', {
    bearer: token,
    payload: { name: 'Lee Morgan', password: '5550142', passcode },
  });
  expect(told(made)).toEqual([200, undefined]);
  const lee = monitorCreatedAnswerSchema.parse(made.body);
  const signedIn = await served.ask('POST', '/phones/current/sign-ins', {
    bearer: token,
    payload: { monitorNumber: lee.monitorNumber, password: '5550142' },
  });
  expect(told(signedIn)).toEqual([200, undefined]);
  const session = monitorSignedInAnswerSchema.parse(signedIn.body).token;
  return { phone, token, lee, session };
}

const logged = (served: Served, msg: string) =>
  served.lines
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((line) => line['msg'] === msg);

describe('an address looked up for a phone’s GPS', () => {
  it('AC-04-24 Lee Morgan’s phone sends a GPS point and is answered the street number and name our own address server finds there; where the map has a street and no number, the street; out at sea, none, and why; nothing is written, and neither the point nor the address is logged', async () => {
    await world(
      async (served, tx) => {
        const { phone, token, lee, session } = await leeSignedIn(served, tx);
        const [audited, events] = [await tx.auditRecord.count(), await tx.securityEvent.count()];
        served.lines.length = 0;

        const green = await lookedUp(served, onTheGreen, token, session);
        expect(told(green)).toEqual([200, undefined]);
        expect(green.body).toEqual({ address: '25 The Green', noAddress: null });
        const mill = await lookedUp(served, onMillRoad, token, session);
        expect(mill.body).toEqual({ address: 'Wyoming Mill Road', noAddress: null });
        const sea = await lookedUp(served, atSea, token, session);
        expect(told(sea)).toEqual([200, undefined]);
        expect(sea.body).toEqual({ address: null, noAddress: 'NO_STREET_THERE' });
        for (const answer of [green, mill, sea]) {
          expect(phoneAddressLookupAnswerSchema.safeParse(answer.body).success).toBe(true);
        }

        // A lookup is no record: nothing written, by anybody.
        expect([await tx.auditRecord.count(), await tx.securityEvent.count()]).toEqual([
          audited,
          events,
        ]);
        // The log says who asked and what came of it, and holds no point and no address.
        const said = logged(served, 'A phone looked up an address.');
        expect(
          said.map(({ deviceId, userId, found, noAddress }) => [
            deviceId,
            userId,
            found,
            noAddress,
          ]),
        ).toEqual([
          [phone.id, lee.userId, true, undefined],
          [phone.id, lee.userId, true, undefined],
          [phone.id, lee.userId, false, 'NO_STREET_THERE'],
        ]);
        expect(said.every((line) => typeof line['addressServerMs'] === 'number')).toBe(true);
        const log = served.lines.join('\n');
        for (const never of [
          '39.1565',
          '75.5233',
          '39.1384',
          '75.5538',
          '38.5',
          '73.0',
          'Green',
          'Wyoming',
          'latitude',
          'reverse',
        ]) {
          expect(log, never).not.toContain(never);
        }
      },
      ...asking(stacks),
    );
  });

  it('AC-04-24 the address server is asked the point the phone sent and nothing else of the request; where it gives no answer the phone is told so, never refused, and the monitor types the address; the log says why by the error’s kind, never its words', async () => {
    const answers: (() => Promise<string | null>)[] = [
      () => Promise.resolve('14 Heron St'),
      () => Promise.reject(new Error('no answer for 39.15650000,-75.52330000 on Heron St')),
    ];
    const told_ = new Told(() => (answers.shift() ?? (() => Promise.resolve(null)))());
    await world(
      async (served, tx) => {
        const { phone, token, lee, session } = await leeSignedIn(served, tx);
        served.lines.length = 0;
        const first = await lookedUp(served, onTheGreen, token, session);
        expect(first.body).toEqual({ address: '14 Heron St', noAddress: null });
        const second = await lookedUp(served, onTheGreen, token, session);
        expect(told(second)).toEqual([200, undefined]);
        expect(second.body).toEqual({ address: null, noAddress: 'NOT_ANSWERED' });
        expect(told_.asked).toEqual([onTheGreen, onTheGreen]);

        const [warned] = logged(served, 'The address server gave a phone’s lookup no answer.');
        expect([warned?.['level'], warned?.['deviceId'], warned?.['userId']]).toEqual([
          40,
          phone.id,
          lee.userId,
        ]);
        expect([warned?.['found'], warned?.['noAddress']]).toEqual([false, 'NOT_ANSWERED']);
        expect((warned?.['error'] as { kind: string }).kind).toBe('Error');
        const log = served.lines.join('\n');
        for (const never of ['39.1565', '75.5233', 'Heron', 'no answer for']) {
          expect(log, never).not.toContain(never);
        }
        expect(second.text).not.toContain('Heron');
      },
      ...asking(told_),
    );
  });

  it('AC-04-24, API7 a point is two exact decimals on the earth and nothing more: anything else is refused before the address server is asked, so nothing a phone sends can change the question', async () => {
    const told_ = new Told(() => Promise.resolve('14 Heron St'));
    await world(
      async (served, tx) => {
        const { token, session } = await leeSignedIn(served, tx);
        for (const payload of [
          {},
          { latitude: onTheGreen.latitude },
          { ...onTheGreen, zoom: '3' },
          { ...onTheGreen, format: 'xml' },
          { ...onTheGreen, url: 'https://elsewhere.example/reverse' },
          { latitude: 39.1565, longitude: -75.5233 },
          { ...onTheGreen, latitude: '39.1565&format=xml' },
          { ...onTheGreen, latitude: '39.1565#' },
          { ...onTheGreen, latitude: '39.1565/../search' },
          { ...onTheGreen, latitude: ' 39.1565' },
          { ...onTheGreen, latitude: '+39.1565' },
          { ...onTheGreen, latitude: '3.91565e1' },
          { ...onTheGreen, latitude: '39.156500001' },
          { ...onTheGreen, latitude: '39,1565' },
          { ...onTheGreen, latitude: '' },
          { ...onTheGreen, latitude: '90.00000001' },
          { ...onTheGreen, latitude: '-91' },
          { ...onTheGreen, longitude: '180.00000001' },
          { ...onTheGreen, longitude: '-181' },
          { ...onTheGreen, longitude: ['-75.5233'] },
          { ...onTheGreen, longitude: null },
        ]) {
          const answer = await lookedUp(served, payload, token, session);
          expect(told(answer), JSON.stringify(payload)).toEqual([400, 'BAD_REQUEST']);
        }
        expect(told_.asked).toEqual([]);
        // The ends of the earth are on it.
        for (const payload of [
          { latitude: '90', longitude: '180' },
          { latitude: '-90.00000000', longitude: '-180.00000000' },
          { latitude: '0', longitude: '0' },
        ]) {
          expect(told(await lookedUp(served, payload, token, session))).toEqual([200, undefined]);
        }
        expect(told_.asked).toHaveLength(3);
        // And the point is never in the address of the request: there is no GET of it.
        expect(
          told(
            await served.ask(
              'GET',
              `${phoneAddressLookupEndpoint.path}?latitude=39.1565&longitude=-75.5233`,
              { bearer: token, monitorSession: session },
            ),
          ),
        ).toEqual([404, 'NOT_FOUND']);
      },
      ...asking(told_),
    );
  });

  it('AC-04-24, AC-02-39 a lookup is a signed-in monitor’s on a proven phone, nobody else’s: not a phone with nobody signed in, not a session with no proven phone, not another phone with that session, not the back office; none of them reaches the address server', async () => {
    // Every endpoint that asks the address server, by name: a new one is added here on purpose.
    expect(
      endpoints.filter(({ path }) => path.includes('address')).map(({ name }) => name),
    ).toEqual(['phoneAddressLookup']);
    expect([phoneAddressLookupEndpoint.access, phoneAddressLookupEndpoint.method]).toEqual([
      'MONITOR_ON_PHONE',
      'POST',
    ]);
    const told_ = new Told(() => Promise.resolve('14 Heron St'));
    await world(
      async (served, tx) => {
        const { token, session } = await leeSignedIn(served, tx);
        expect(told(await lookedUp(served, onTheGreen))).toEqual([401, 'PHONE_NOT_PROVEN']);
        expect(told(await lookedUp(served, onTheGreen, token))).toEqual([401, 'NOT_SIGNED_IN']);
        expect(told(await lookedUp(served, onTheGreen, undefined, session))).toEqual([
          401,
          'PHONE_NOT_PROVEN',
        ]);
        const other = await proven(served, await enrolledPhone(served, tx, 'P1-COL-2'));
        expect(told(await lookedUp(served, onTheGreen, other, session))).toEqual([
          401,
          'NOT_SIGNED_IN',
        ]);
        const dana = await served.signedIn(danasEmail, long);
        const asDana = await served.ask('POST', phoneAddressLookupEndpoint.path, {
          cookies: dana.cookies,
          csrf: dana.csrf,
          payload: onTheGreen,
        });
        expect(told(asDana)).toEqual([401, 'PHONE_NOT_PROVEN']);
        expect(told_.asked).toEqual([]);
        expect(told(await lookedUp(served, onTheGreen, token, session))).toEqual([200, undefined]);
        expect(told_.asked).toEqual([onTheGreen]);
      },
      ...asking(told_),
    );
  });
});

describe('what the API asks the address server, and takes from it (API7, API10)', () => {
  const words = async (asked: Promise<unknown>): Promise<string> => {
    try {
      await asked;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error('The address server answered.');
  };

  it('is asked over HTTPS only, at the address the settings name', () => {
    const settings = { caFile: null, timeoutMs: 5000 };
    expect(
      () => new AddressServer({ ...settings, url: 'http://addresses.adms.localhost' }),
    ).toThrow('The address server is asked over HTTPS only.');
    expect(
      () =>
        new AddressServer({
          ...settings,
          url: 'https://addresses.adms.localhost',
          at: { host: 'caddy', port: 443 },
        }),
    ).toThrow('Where the address server is is an IP address and a port.');
  });

  it('is asked a point of two exact decimals and nothing else: one that isn’t is never sent', async () => {
    for (const point of [
      { latitude: '39.1565&format=xml', longitude: '-75.5233' },
      { latitude: '39.1565', longitude: '-75.5233&zoom=3' },
      { latitude: '39.1565 ', longitude: '-75.5233' },
      { latitude: '', longitude: '-75.5233' },
    ]) {
      expect(await words(stacks.addressOf(point))).toBe('A point is two exact decimals.');
    }
  });

  it('has so long to answer, whole, and may answer so much: past either there is no address, and the error never holds the point', async () => {
    expect(await stacks.addressOf(onTheGreen)).toBe('25 The Green');
    const late = await words(serverWith({ timeoutMs: 1 }).addressOf(onTheGreen));
    expect(late).toBe("The address server didn't answer /reverse in time.");
    const large = await words(serverWith({ answerBytesAtMost: 64 }).addressOf(onTheGreen));
    expect(large).toBe('The address server answered more than an address is.');
    // A server that isn't there, and one that is some other program's.
    const away = await words(
      serverWith({ url: 'https://addresses.adms.localhost:1' }).addressOf(onTheGreen),
    );
    expect(away).toBe('The address server could not be asked (Error).');
    const routing = testSettings().addressesUrl.replace('addresses.', 'routing.');
    const other = await words(serverWith({ url: routing }).addressOf(onTheGreen));
    expect(other).toMatch(/^The address server (answered \d{3} to|didn't answer) \/reverse/);
    for (const said of [late, large, away, other]) {
      expect(said).not.toMatch(/39\.1565|75\.5233|lat=|lon=/);
    }
  });

  it('AC-10-69, OWASP ASVS 5.0 15.3.2 follows no redirect: an answer that sends it elsewhere is no address, and where it points is never asked', async () => {
    const elsewhere = await StackHttpsServer.on((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ address: { house_number: '25', road: 'The Green' } }));
    });
    try {
      for (const status of [301, 302, 303, 307, 308]) {
        const redirecting = await StackHttpsServer.on((_request, response) => {
          response.writeHead(status, {
            location: `https://localhost:${String(elsewhere.port)}/reverse`,
          });
          response.end();
        });
        try {
          // The test's own server, checked against the stack's root as the stack's server is.
          const asked = new AddressServer({
            url: 'https://localhost',
            caFile: stackRootCert,
            timeoutMs: 5000,
            at: { host: '127.0.0.1', port: redirecting.port },
          });
          expect(await words(asked.addressOf(onTheGreen))).toBe(
            `The address server answered ${String(status)} to /reverse.`,
          );
          expect(redirecting.heard).toHaveLength(1);
        } finally {
          await redirecting.close();
        }
      }
      expect(elsewhere.heard).toEqual([]);
    } finally {
      await elsewhere.close();
    }
  });
});
