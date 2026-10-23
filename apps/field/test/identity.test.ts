// Which phone this is, to the server (src/phone/identity.ts; BACKLOG 3.2.2, C110, C111, C113;
// ADR-572): enrolled under the master passcode with a key it made, then proven by signing the
// server's challenge, the token held in the keyring and proven again on `PHONE_NOT_PROVEN`. Here
// against a server of the test's own that records what it was sent and checks each proof as the
// API does; against the real API, in a real browser, e2e/enrolment.e2e.ts.
import { createPublicKey, verify } from 'node:crypto';

import {
  challengePhoneEndpoint,
  createMonitorOnPhoneEndpoint,
  enrolPhoneEndpoint,
  provePhoneEndpoint,
  provenPhoneEndpoint,
  type Endpoint,
} from '@open-adms/contracts';
import { PhoneProofRules } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { PhoneIdentity } from '../src/phone/identity.ts';
import { Server, type Asking, type Reply } from '../src/server.ts';
import { HeldKeyring, HeldStore } from './held.ts';

const deviceId = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d01';
const passcode = 'heron-marsh-delphine';

interface Sent {
  readonly endpoint: string;
  readonly ids?: Readonly<Record<string, string>>;
  readonly json?: unknown;
  readonly token?: string;
}

// The API as these tests need it: it enrols, makes challenges, checks a proof against the public
// key it was sent (as `DeviceKeys` does, DER), hands out numbered tokens, and refuses a token it
// was told to stop taking.
class TestServer extends Server {
  readonly sent: Sent[] = [];
  publicKey: string | undefined;
  enrolment: 'TAKEN' | 'ENROLMENT_REFUSED' | 'UNREACHABLE' = 'TAKEN';
  // Tokens the server no longer takes, as one run out by its own clock.
  readonly stale = new Set<string>();
  // Proofs it refuses from now on, as for a key revoked.
  refusesProofs = false;
  // Tokens it refuses whatever they are, though it proves the phone.
  refusesTokens = false;
  private challenges = 0;
  private tokens = 0;

  constructor() {
    super('https://api.adms.localhost');
  }

  override ask<E extends Endpoint>(served: E, asking: Asking = {}): Promise<Reply<E>> {
    this.sent.push({ endpoint: served.name, ...asking });
    return Promise.resolve(this.answer(served, asking) as Reply<E>);
  }

  private answer(served: Endpoint, asking: Asking): Reply<Endpoint> {
    if (served === enrolPhoneEndpoint) {
      if (this.enrolment === 'UNREACHABLE') return { kind: 'unreachable' };
      if (this.enrolment !== 'TAKEN') return { kind: 'refused', code: this.enrolment };
      this.publicKey = (asking.json as { publicKey: string }).publicKey;
      return { kind: 'answered', answer: { deviceId, masterPasscodeVersion: 1 } };
    }
    if (served === challengePhoneEndpoint) {
      this.challenges += 1;
      return {
        kind: 'answered',
        answer: { challenge: `challenge-${String(this.challenges)}`, expiresInSeconds: 120 },
      };
    }
    if (served === provePhoneEndpoint) {
      const { challenge, signature } = asking.json as { challenge: string; signature: string };
      const proven =
        this.publicKey !== undefined &&
        verify(
          'sha256',
          Buffer.from(PhoneProofRules.signed(challenge)),
          {
            key: createPublicKey({
              key: Buffer.from(this.publicKey, 'base64'),
              format: 'der',
              type: 'spki',
            }),
            dsaEncoding: 'der',
          },
          Buffer.from(signature, 'base64'),
        );
      if (!proven || this.refusesProofs) return { kind: 'refused', code: 'PHONE_NOT_PROVEN' };
      this.tokens += 1;
      return {
        kind: 'answered',
        answer: { token: `token-${String(this.tokens)}`, expiresInSeconds: 900 },
      };
    }
    if (asking.token === undefined || this.stale.has(asking.token) || this.refusesTokens) {
      return { kind: 'refused', code: 'PHONE_NOT_PROVEN' };
    }
    if (served === provenPhoneEndpoint) {
      return {
        kind: 'answered',
        answer: {
          deviceId,
          name: 'P1-COL-1',
          status: 'ACTIVE',
          outOfServiceAt: null,
          keyRevoked: false,
          masterPasscodeVersion: 1,
          masterPasscodeVersionInForce: 1,
          brandName: 'Open ADMS',
        },
      };
    }
    if (served === createMonitorOnPhoneEndpoint) {
      return {
        kind: 'answered',
        answer: { userId: deviceId, monitorNumber: 'M004127', name: 'Ana Brooks' },
      };
    }
    throw new Error(`The test's server doesn't serve ${served.name}.`);
  }
}

function phone(now = () => new Date('2026-10-19T12:00:00Z')) {
  const store = new HeldStore();
  const keyring = new HeldKeyring();
  const server = new TestServer();
  return { store, keyring, server, identity: new PhoneIdentity(store, keyring, server, now) };
}

const named = (sent: readonly Sent[]) => sent.map(({ endpoint }) => endpoint);

describe('the phone’s enrolment', () => {
  it('AC-02-18, AC-11-11: a key made on the phone, its public half alone sent with the board’s name and the passcode, and the server’s answer kept in the store', async () => {
    const { store, keyring, server, identity } = phone();
    expect(await identity.enrolment()).toBeUndefined();
    const reply = await identity.enrol('  P1-COL-1 ', passcode);
    expect(reply).toEqual({ kind: 'answered', answer: { deviceId, masterPasscodeVersion: 1 } });
    expect(server.sent).toEqual([
      {
        endpoint: 'enrolPhone',
        json: { name: '  P1-COL-1 ', passcode, publicKey: keyring.key?.publicKey },
      },
    ]);
    expect(await identity.enrolment()).toEqual({
      deviceId,
      name: 'P1-COL-1',
      masterPasscodeVersion: 1,
    });
    // The store keeps the answer and the name: never the passcode, never the key.
    expect([...store.shelves.keys()]).toEqual(['keptAnswers/enrolment']);
    expect(JSON.stringify([...store.shelves.values()])).not.toContain(passcode);
    expect(JSON.stringify([...store.shelves.values()])).not.toContain(keyring.key?.publicKey);
  });

  it('AC-02-18: a try the server didn’t take, or that found no signal, keeps nothing, and the next makes a key of its own', async () => {
    const { store, keyring, server, identity } = phone();
    server.enrolment = 'ENROLMENT_REFUSED';
    expect(await identity.enrol('P1-COL-1', 'wrong')).toEqual({
      kind: 'refused',
      code: 'ENROLMENT_REFUSED',
    });
    const first = keyring.key?.publicKey;
    server.enrolment = 'UNREACHABLE';
    expect(await identity.enrol('P1-COL-1', passcode)).toEqual({ kind: 'unreachable' });
    expect(store.shelves.size).toBe(0);
    expect(await identity.enrolment()).toBeUndefined();
    server.enrolment = 'TAKEN';
    await identity.enrol('P1-COL-1', passcode);
    expect(keyring.key?.publicKey).not.toBe(first);
    expect(server.publicKey).toBe(keyring.key?.publicKey);
  });

  it('AC-02-18: what the form says is held to the endpoint’s own schema before anything is made or sent', () => {
    expect(PhoneIdentity.enrolmentReadable('P1-COL-1', passcode)).toBe(true);
    expect(PhoneIdentity.enrolmentReadable('   ', passcode)).toBe(false);
    expect(PhoneIdentity.enrolmentReadable('P1-COL-1', '')).toBe(false);
    expect(PhoneIdentity.enrolmentReadable('P'.repeat(81), passcode)).toBe(false);
  });
});

describe('the phone’s proof', () => {
  it('AC-02-18, AC-11-12: before its first request the phone proves itself, signing the domain’s text for the server’s challenge; the token goes as the request’s and is held in the keyring alone', async () => {
    const { store, keyring, server, identity } = phone();
    await identity.enrol('P1-COL-1', passcode);
    server.sent.length = 0;
    const reply = await identity.asPhone(provenPhoneEndpoint);
    expect(reply.kind).toBe('answered');
    expect(named(server.sent)).toEqual(['challengePhone', 'provePhone', 'provenPhone']);
    expect(server.sent[0]?.ids).toEqual({ deviceId });
    expect(server.sent[1]).toMatchObject({ ids: { deviceId }, json: { challenge: 'challenge-1' } });
    expect(server.sent[2]).toMatchObject({ token: 'token-1' });
    // Held where secrets are, until it runs out by the phone's clock; never in the store.
    expect(JSON.parse(keyring.secrets.get('phoneToken') ?? '')).toEqual({
      token: 'token-1',
      until: '2026-10-19T12:15:00.000Z',
    });
    expect(JSON.stringify([...store.shelves.values()])).not.toContain('token-1');
  });

  it('AC-11-12: the token is used again while it lasts by the phone’s clock, and a new proof made once it has run out', async () => {
    let now = new Date('2026-10-19T12:00:00Z');
    const { server, identity } = phone(() => now);
    await identity.enrol('P1-COL-1', passcode);
    server.sent.length = 0;
    await identity.asPhone(provenPhoneEndpoint);
    now = new Date('2026-10-19T12:14:59Z');
    await identity.asPhone(provenPhoneEndpoint);
    now = new Date('2026-10-19T12:15:00Z');
    await identity.asPhone(provenPhoneEndpoint);
    expect(named(server.sent)).toEqual([
      'challengePhone',
      'provePhone',
      'provenPhone',
      'provenPhone',
      'challengePhone',
      'provePhone',
      'provenPhone',
    ]);
    expect(
      server.sent.filter(({ token }) => token !== undefined).map(({ token }) => token),
    ).toEqual(['token-1', 'token-1', 'token-2']);
  });

  it('AC-11-12: answered PHONE_NOT_PROVEN, the phone drops its token, proves itself again and asks once more, asking nobody anything', async () => {
    const { server, keyring, identity } = phone();
    await identity.enrol('P1-COL-1', passcode);
    await identity.asPhone(provenPhoneEndpoint);
    server.stale.add('token-1');
    server.sent.length = 0;
    const reply = await identity.asPhone(provenPhoneEndpoint);
    expect(reply.kind).toBe('answered');
    expect(server.sent.map(({ endpoint, token }) => [endpoint, token])).toEqual([
      ['provenPhone', 'token-1'],
      ['challengePhone', undefined],
      ['provePhone', undefined],
      ['provenPhone', 'token-2'],
    ]);
    expect(keyring.secrets.get('phoneToken')).toContain('token-2');
  });

  it('AC-11-12: a proof the server refuses is the answer: the phone asks no more, and never goes round again', async () => {
    const { server, identity } = phone();
    await identity.enrol('P1-COL-1', passcode);
    await identity.asPhone(provenPhoneEndpoint);
    server.stale.add('token-1');
    server.refusesProofs = true;
    server.sent.length = 0;
    expect(await identity.asPhone(provenPhoneEndpoint)).toEqual({
      kind: 'refused',
      code: 'PHONE_NOT_PROVEN',
    });
    expect(named(server.sent)).toEqual(['provenPhone', 'challengePhone', 'provePhone']);
  });

  it('AC-11-12: proven afresh and still answered PHONE_NOT_PROVEN, the phone stops there: it proves itself again once a request, never round and round', async () => {
    const { server, identity } = phone();
    await identity.enrol('P1-COL-1', passcode);
    server.refusesTokens = true;
    server.sent.length = 0;
    expect(await identity.asPhone(provenPhoneEndpoint)).toEqual({
      kind: 'refused',
      code: 'PHONE_NOT_PROVEN',
    });
    expect(named(server.sent)).toEqual([
      'challengePhone',
      'provePhone',
      'provenPhone',
      'challengePhone',
      'provePhone',
      'provenPhone',
    ]);
  });

  it('AC-11-12: the phone’s requests at once wait on one proof, never each spending a challenge', async () => {
    const { server, identity } = phone();
    await identity.enrol('P1-COL-1', passcode);
    server.sent.length = 0;
    await Promise.all([
      identity.asPhone(provenPhoneEndpoint),
      identity.asPhone(provenPhoneEndpoint),
      identity.asPhone(provenPhoneEndpoint),
    ]);
    expect(named(server.sent).filter((name) => name === 'challengePhone')).toHaveLength(1);
    expect(named(server.sent).filter((name) => name === 'provenPhone')).toHaveLength(3);
  });

  it('AC-11-12: a phone with no enrolment, or no key, proves nothing and asks the server nothing', async () => {
    const { server, keyring, identity } = phone();
    expect(await identity.asPhone(provenPhoneEndpoint)).toEqual({
      kind: 'refused',
      code: 'PHONE_NOT_PROVEN',
    });
    await identity.enrol('P1-COL-1', passcode);
    await keyring.erase();
    server.sent.length = 0;
    expect((await identity.asPhone(provenPhoneEndpoint)).kind).toBe('refused');
    expect(server.sent).toEqual([]);
  });
});

describe('a monitor created on the phone', () => {
  it('AC-02-07: the phone proves itself first, and only then is the passcode sent, with the monitor’s name and password, by the phone’s token', async () => {
    const { server, identity } = phone();
    await identity.enrol('P1-COL-1', passcode);
    server.sent.length = 0;
    const sent = { name: 'Ana Brooks', password: '4127001', passcode };
    const reply = await identity.asPhone(createMonitorOnPhoneEndpoint, { json: sent });
    expect(reply).toEqual({
      kind: 'answered',
      answer: { userId: deviceId, monitorNumber: 'M004127', name: 'Ana Brooks' },
    });
    expect(named(server.sent)).toEqual(['challengePhone', 'provePhone', 'createMonitorOnPhone']);
    // Nothing before the proof carries the passcode.
    expect(JSON.stringify(server.sent.slice(0, 2))).not.toContain(passcode);
    expect(server.sent[2]).toEqual({
      endpoint: 'createMonitorOnPhone',
      json: sent,
      token: 'token-1',
    });
  });
});
