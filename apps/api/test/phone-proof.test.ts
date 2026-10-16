// A phone's device key and the challenge it signs (ARCHITECTURE §7.4; AC-02-18, AC-05-03,
// AC-10-44…46; T-02, T-11; ADR-437): NIST SP 800-63B-4 §3.1.6; ASVS 6.7.2, 11.2.3, 11.6.1. The
// phone here holds a software key, as the harness's does; a key in real secure hardware is the
// field app's (Phase 3). Nothing here needs the stack.
import {
  createHmac,
  createPrivateKey,
  ECDH,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';

import type { Database } from '@open-adms/db';
import { PhoneProofRules } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { DeviceKeys } from '../src/phone/device-keys.ts';
import type { MasterPasscodeCheck } from '../src/phone/master-passcode-check.ts';
import { PhoneChallenges } from '../src/phone/phone-challenges.ts';
import { PhoneProofs } from '../src/phone/phone-proofs.ts';
import { PhoneTokens } from '../src/phone/phone-tokens.ts';

const keys = new DeviceKeys();
const rules = new PhoneProofRules({ phoneChallengeSeconds: 120 });
const signingSecret = 'a signing secret of the test’s own, never a real one';
const challenges = new PhoneChallenges(signingSecret, rules);
const collection = '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d11';
const tower = '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d12';
const now = new Date('2026-10-12T16:05:00.000Z');
const later = (seconds: number): Date => new Date(now.getTime() + seconds * 1000);

// A phone as the server meets it: what it sends at enrolment, and how it answers a challenge.
class SoftwarePhone {
  readonly privateKey: KeyObject;
  readonly publicKey: string;

  constructor(curve = 'P-256') {
    const pair = generateKeyPairSync('ec', { namedCurve: curve });
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  }

  signs(text: string, dsaEncoding: 'der' | 'ieee-p1363' = 'der'): string {
    return sign('sha256', Buffer.from(text, 'utf8'), {
      key: this.privateKey,
      dsaEncoding,
    }).toString('base64');
  }

  answers(challenge: string): string {
    return this.signs(PhoneProofRules.signed(challenge));
  }

  // The same key with its point written short: another spelling of one key.
  get publicKeyCompressed(): string {
    const point = Buffer.from(this.publicKey, 'base64').subarray(-65);
    const short = ECDH.convertKey(point, 'prime256v1', undefined, undefined, 'compressed');
    const header = Buffer.from('3039301306072a8648ce3d020106082a8648ce3d030107032200', 'hex');
    return Buffer.concat([header, short as Buffer]).toString('base64');
  }
}

const phone = new SoftwarePhone();

describe('a phone’s device key', () => {
  it('AC-10-44 is taken as the public half of a P-256 key, and kept as that alone', () => {
    const kept = keys.kept(phone.publicKey);
    expect(kept).toBe(phone.publicKey);
    expect(Buffer.from(kept ?? '', 'base64')).toHaveLength(91);
    // What the server keeps is no private key: nothing it holds could sign as the phone.
    expect(() =>
      createPrivateKey({ key: Buffer.from(kept ?? '', 'base64'), format: 'der', type: 'pkcs8' }),
    ).toThrow();
    expect(() =>
      createPrivateKey({ key: Buffer.from(kept ?? '', 'base64'), format: 'der', type: 'sec1' }),
    ).toThrow();
  });

  it('AC-02-16 is kept written one way, so one key is one string', () => {
    expect(phone.publicKeyCompressed).not.toBe(phone.publicKey);
    expect(keys.kept(phone.publicKeyCompressed)).toBe(phone.publicKey);
  });

  it('is refused when it isn’t a public key of the kind', () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const edwards = generateKeyPairSync('ed25519');
    const refused: Record<string, string> = {
      'a P-384 key': new SoftwarePhone('P-384').publicKey,
      'a secp256k1 key': new SoftwarePhone('secp256k1').publicKey,
      'an RSA key': rsa.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      'an Ed25519 key': edwards.publicKey
        .export({ format: 'der', type: 'spki' })
        .toString('base64'),
      'a private key': phone.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
      'the bare point': Buffer.from(phone.publicKey, 'base64').subarray(-65).toString('base64'),
      'a key cut short': phone.publicKey.slice(0, 60),
      'text that is no base64': 'story-key-p1-col-1',
      nothing: '',
      'something far too long': 'A'.repeat(404),
    };
    for (const [what, sent] of Object.entries(refused)) {
      expect(keys.kept(sent), what).toBeUndefined();
    }
  });

  it('AC-02-18 checks what its phone signed, and nothing else', () => {
    const text = PhoneProofRules.signed('a challenge');
    const signature = phone.signs(text);
    expect(keys.signedBy(phone.publicKey, text, signature)).toBe(true);
    // Signed by another phone; another text; a signature written another way; none at all.
    expect(keys.signedBy(new SoftwarePhone().publicKey, text, signature)).toBe(false);
    expect(keys.signedBy(phone.publicKey, `${text} `, signature)).toBe(false);
    expect(keys.signedBy(phone.publicKey, text, phone.signs(text, 'ieee-p1363'))).toBe(false);
    expect(keys.signedBy(phone.publicKey, text, '')).toBe(false);
    expect(keys.signedBy(phone.publicKey, text, 'not a signature')).toBe(false);
    expect(keys.signedBy('story-key-p1-col-1', text, signature)).toBe(false);
  });

  it('never takes a challenge signed bare as a proof: the label is part of what is signed', () => {
    const challenge = challenges.make(collection, now);
    expect(
      keys.signedBy(phone.publicKey, PhoneProofRules.signed(challenge), phone.signs(challenge)),
    ).toBe(false);
  });
});

describe('the challenge the server makes a phone', () => {
  it('AC-05-03 names its phone and when it was made, and is answered with the device key', () => {
    const challenge = challenges.make(collection, now);
    expect(challenges.read(challenge, later(30))).toEqual({ deviceId: collection, madeAt: now });
    expect(
      keys.signedBy(phone.publicKey, PhoneProofRules.signed(challenge), phone.answers(challenge)),
    ).toBe(true);
  });

  it('AC-10-45 is new each time: 256 random bits, never the same twice', () => {
    const made = new Set<string>();
    for (let count = 0; count < 200; count += 1) made.add(challenges.make(collection, now));
    expect(made.size).toBe(200);
    const asked: number[] = [];
    new PhoneChallenges('secret', rules, (bytes) => {
      asked.push(bytes);
      return Buffer.alloc(bytes);
    }).make(collection, now);
    expect(asked).toEqual([32]);
  });

  it('AC-10-45 runs out by itself', () => {
    const challenge = challenges.make(collection, now);
    expect(challenges.read(challenge, later(119))).toBeDefined();
    expect(challenges.read(challenge, later(120))).toBeUndefined();
  });

  it('AC-10-46 is the server’s own: one anybody else made or changed is not read', () => {
    const challenge = challenges.make(collection, now);
    const [named = '', signature = ''] = challenge.split('.');
    const elsewhere = new PhoneChallenges('another installation’s secret', rules);
    expect(challenges.read(elsewhere.make(collection, now), now)).toBeUndefined();
    // The same challenge said to be for the tower's phone, under the old signature.
    const renamed = Buffer.from(
      Buffer.from(named, 'base64url').toString('utf8').replace(collection, tower),
    ).toString('base64url');
    expect(challenges.read(`${renamed}.${signature}`, now)).toBeUndefined();
    for (const altered of [named, `${named}.`, `${challenge}.more`, `.${signature}`, '', 'a.b']) {
      expect(challenges.read(altered, now), altered).toBeUndefined();
    }
  });

  it('is for one phone: another’s is read as the other’s', () => {
    expect(challenges.read(challenges.make(tower, now), now)?.deviceId).toBe(tower);
  });
});

describe('the token a proof gives', () => {
  const tokens = new PhoneTokens(signingSecret, 15);

  it('AC-05-03 names its phone, runs out by itself, and is new each time', () => {
    const token = tokens.make(collection, now);
    expect(tokens.seconds).toBe(900);
    expect(tokens.deviceOf(token, later(899))).toBe(collection);
    expect(tokens.deviceOf(token, later(900))).toBeUndefined();
    expect(tokens.make(collection, now)).not.toBe(token);
    // 128 random bits, as base64url: twice what NIST SP 800-63B-4 §5.1 asks.
    expect(token.split('.')[2]).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('AC-10-46 is the server’s own, for that purpose alone: one changed, one another installation made, a challenge, and one signed with the challenge’s key are nobody’s', () => {
    const token = tokens.make(collection, now);
    const [device = '', expires = '', random = '', signature = ''] = token.split('.');
    const elsewhere = new PhoneTokens('another installation’s secret', 15);
    // What the token would be had it been signed with the key that signs challenges.
    const challengeKey = createHmac('sha256', signingSecret)
      .update('open-adms/phone-challenge/v1')
      .digest();
    const crossed = createHmac('sha256', challengeKey)
      .update(`${device}\n${expires}\n${random}`)
      .digest('base64url');
    for (const never of [
      elsewhere.make(collection, now),
      challenges.make(collection, now),
      `${tower}.${expires}.${random}.${signature}`,
      `${device}.${String(Number(expires) + 1)}.${random}.${signature}`,
      `${device}.${expires}.${random}.${crossed}`,
      `${device}.${expires}.${random}`,
      `${token}.more`,
      '',
      undefined,
    ]) {
      expect(tokens.deviceOf(never, now), String(never)).toBeUndefined();
    }
    expect(tokens.deviceOf(token, now)).toBe(collection);
  });
});

describe('two answers to one challenge at once', () => {
  it('AC-10-45 both read the phone before either wrote: the one whose write changes nothing proves nothing, and is given no token', async () => {
    const phone = new SoftwarePhone();
    const stated: unknown[] = [];
    // The database as the second answer finds it: its read is the phone before the first
    // answer's write, and its own write, made under the row's lock, matches no row.
    const racing = {
      $read: () =>
        Promise.resolve({
          publicKey: phone.publicKey,
          keyRevokedBy: null,
          lastAnsweredChallengeMadeAt: null,
        }),
      $write: (actor: unknown) => {
        stated.push(actor);
        return Promise.resolve({ count: 0 });
      },
    } as unknown as Database;
    const proofs = new PhoneProofs(racing, {
      rules,
      challenges,
      keys,
      tokens: new PhoneTokens(signingSecret, 15),
      underPasscode: new PhoneTokens(signingSecret, 15, 'underPasscode'),
      // Never asked: the key stands.
      passcode: {} as MasterPasscodeCheck,
      clock: { now: () => now },
      challengeSeconds: 120,
    });
    const { challenge } = proofs.challenge(collection);
    const outcome = await proofs.prove(
      collection,
      challenge,
      phone.signs(PhoneProofRules.signed(challenge)),
    );
    expect(outcome).toEqual({ proven: false, why: 'SPENT' });
    // The write it tried was the phone's own, for that phone.
    expect(stated).toEqual([
      { actorId: '00000000-0000-7000-8000-000000000003', source: 'DEVICE', deviceId: collection },
    ]);
  });
});

// A phone whose key the firm's time revoked (REQ-214; ADR-520 (2), 530): its key and the master
// passcode together. The database stands in here, holding the phone as the worker left it; the
// whole way, through the real endpoints and the worker's own pass, is the story
// `lost-phone-key`.
describe('a phone whose key the firm’s time revoked', () => {
  const phone = new SoftwarePhone();
  const byKey = new PhoneTokens(signingSecret, 15);
  const underPasscode = new PhoneTokens(signingSecret, 15, 'underPasscode');
  const stated: unknown[] = [];
  const used: unknown[] = [];
  // The phone as the database holds it: its kind of revocation, as the test says.
  const holding = (keyRevokedBy: 'TURN_IN' | 'FIRM_TIME' | null) =>
    ({
      $read: () =>
        Promise.resolve({
          publicKey: phone.publicKey,
          keyRevokedBy,
          lastAnsweredChallengeMadeAt: null,
          name: 'P1-COL-2',
          status: 'LOST',
          outOfServiceAt: now,
          masterPasscodeVersion: 1,
        }),
      $write: async (actor: unknown, work: (tx: unknown) => Promise<unknown>) => {
        stated.push(actor);
        return work({ device: { updateMany: () => Promise.resolve({ count: 1 }) } });
      },
    }) as unknown as Database;
  // The master passcode's one check, standing in: `heron-marsh-delphine` is the firm's.
  const passcode = {
    check: (typed: string) =>
      Promise.resolve(
        typed === 'heron-marsh-delphine'
          ? { taken: true, version: 1, triedBefore: false }
          : { taken: false, why: 'WRONG' },
      ),
    used: (_tx: unknown, _taken: unknown, _at: Date, use: unknown) => {
      used.push(use);
      return Promise.resolve();
    },
  } as unknown as MasterPasscodeCheck;
  const proofsOn = (keyRevokedBy: 'TURN_IN' | 'FIRM_TIME' | null) =>
    new PhoneProofs(holding(keyRevokedBy), {
      rules,
      challenges,
      keys,
      tokens: byKey,
      underPasscode,
      passcode,
      clock: { now: () => now },
      challengeSeconds: 120,
    });
  const proof = (proofs: PhoneProofs, sent?: string) => {
    const { challenge } = proofs.challenge(collection);
    return proofs.prove(collection, challenge, phone.answers(challenge), sent);
  };

  it('AC-10-86 is told the passcode is needed when it sends none, and only once its signature is its own', async () => {
    const proofs = proofsOn('FIRM_TIME');
    expect(await proof(proofs)).toEqual({ proven: false, why: 'PASSCODE_NEEDED' });
    const { challenge } = proofs.challenge(collection);
    expect(
      await proofs.prove(collection, challenge, new SoftwarePhone().answers(challenge)),
    ).toEqual({ proven: false, why: 'NOT_SIGNED' });
  });

  it('AC-10-86 a passcode that isn’t taken proves nothing; the right one gives a token of the second kind, its use a security event of that phone', async () => {
    used.length = 0;
    const proofs = proofsOn('FIRM_TIME');
    expect(await proof(proofs, 'wrong-passcode-9f3c')).toEqual({
      proven: false,
      why: 'PASSCODE_REFUSED',
    });
    expect(used).toEqual([]);
    const outcome = await proof(proofs, 'heron-marsh-delphine');
    if (!outcome.proven) throw new Error(outcome.why);
    expect(used).toEqual([{ deviceId: collection }]);
    expect(underPasscode.deviceOf(outcome.token, now)).toBe(collection);
    expect(byKey.deviceOf(outcome.token, now)).toBeUndefined();
    // Read with the key still revoked by the firm's time: the phone, marked so.
    expect(await proofs.proven(outcome.token)).toMatchObject({
      deviceId: collection,
      keyRevoked: true,
    });
    // A token of a proof by the key alone names no such phone; nor, turned in, does either. A
    // key that stands takes a token of either kind (ADR-531: the master user at the phone).
    expect(await proofs.proven(byKey.make(collection, now))).toBeUndefined();
    expect(await proofsOn('TURN_IN').proven(outcome.token)).toBeUndefined();
    expect(await proofsOn(null).proven(outcome.token)).toMatchObject({
      keyRevoked: false,
      withPasscode: true,
    });
  });

  it('ADR-488, ADR-531 a key its turn-in revoked proves nothing, passcode or not; a key that stands is given the token of a proof by the key, or with the passcode beside it the token of the master user at the phone, its use a security event; a wrong passcode proves nothing', async () => {
    expect(await proof(proofsOn('TURN_IN'), 'heron-marsh-delphine')).toEqual({
      proven: false,
      why: 'KEY_REVOKED',
    });
    const byItsKey = await proof(proofsOn(null));
    if (!byItsKey.proven) throw new Error(byItsKey.why);
    expect(byKey.deviceOf(byItsKey.token, now)).toBe(collection);
    expect(await proofsOn(null).proven(byItsKey.token)).toMatchObject({
      keyRevoked: false,
      withPasscode: false,
    });
    used.length = 0;
    expect(await proof(proofsOn(null), 'wrong-passcode-9f3c')).toEqual({
      proven: false,
      why: 'PASSCODE_REFUSED',
    });
    const master = await proof(proofsOn(null), 'heron-marsh-delphine');
    if (!master.proven) throw new Error(master.why);
    expect(used).toEqual([{ deviceId: collection }]);
    expect([underPasscode.deviceOf(master.token, now), byKey.deviceOf(master.token, now)]).toEqual([
      collection,
      undefined,
    ]);
    expect(await proofsOn(null).proven(master.token)).toMatchObject({
      keyRevoked: false,
      withPasscode: true,
    });
  });
});

describe('the door for a phone whose key the firm’s time revoked', () => {
  // Which endpoints it reaches, held whole (ADR-530, 531): what gets its records onto the server
  // and the phone turned in, nothing a monitor signs in for, no list, no setup, no monitor made.
  // A phone taken out of service reaches the same, and any phone proven with the passcode beside
  // its key (`outOfServiceToo`).
  it('AC-10-86 reaches only the phone read, its sync, its photographs’ files, its two reports and its turn-in', async () => {
    const { endpoints } = await import('@open-adms/contracts');
    expect(
      endpoints.filter(({ outOfServiceToo }) => outOfServiceToo === true).map(({ name }) => name),
    ).toEqual([
      'provenPhone',
      'reportPasscodeUse',
      'reportUnplannedAssignment',
      'syncPhone',
      'turnInPhone',
      'photoFile',
      'sendPhotoFilePart',
    ]);
    const { Admission } = await import('../src/sign-in/admission.ts');
    const revoked = {
      deviceId: tower,
      name: 'P1-COL-2',
      status: 'LOST' as const,
      outOfServiceAt: now,
      masterPasscodeVersion: 1,
      keyRevoked: true,
      withPasscode: true,
    };
    const door = new Admission(
      {} as never,
      {} as never,
      { asked: () => undefined, phoneAsked: () => undefined },
      { proven: () => Promise.resolve(revoked) },
      { onPhone: () => Promise.resolve(undefined) },
    );
    const refusedAt: string[] = [];
    for (const endpoint of endpoints.filter(
      ({ access }) =>
        access === 'PROVEN_PHONE' || access === 'MONITOR_ON_PHONE' || access === 'PHONE_IN_USE',
    )) {
      const request = {
        headers: { authorization: 'Bearer a-token-of-the-second-kind' },
        log: { warn: () => undefined },
      };
      try {
        await door.admit(endpoint, request as never);
      } catch (refusal) {
        expect((refusal as { code?: string }).code, endpoint.name).toBe('PHONE_NOT_PROVEN');
        refusedAt.push(endpoint.name);
      }
    }
    expect(refusedAt).toEqual([
      'createMonitorOnPhone',
      'signInOnPhone',
      'openPasscodeSessionOnPhone',
      'takeOfflineSignInOnPhone',
      'signOutOnPhone',
      'phoneMonitor',
      'phoneLists',
      'phoneLoginList',
      'phoneAddressLookup',
      'phoneSetupChoices',
    ]);
  });
});

describe('the door decides a phone’s standing once a request (ADR-531)', () => {
  // The door as it stands for one phone, with or without a monitor's session beside it: which
  // endpoints refuse it, by which code.
  async function refusals(
    phone: { status: 'ACTIVE' | 'LOST' | 'RETIRED'; withPasscode: boolean },
    signedIn: boolean,
  ): Promise<Record<string, string[]>> {
    const { endpoints } = await import('@open-adms/contracts');
    const { Admission } = await import('../src/sign-in/admission.ts');
    const proven = {
      deviceId: collection,
      name: 'P1-COL-1',
      status: phone.status,
      outOfServiceAt: phone.status === 'ACTIVE' ? null : now,
      masterPasscodeVersion: 1,
      keyRevoked: false,
      withPasscode: phone.withPasscode,
    };
    const monitor = {
      sessionId: tower,
      deviceId: collection,
      userId: tower,
      monitorNumber: 'M000001',
      name: 'Lee Morgan',
      expiresAt: now,
      masterPasscodeSession: null,
    };
    const door = new Admission(
      {} as never,
      {} as never,
      { asked: () => undefined, phoneAsked: () => undefined },
      { proven: () => Promise.resolve(proven) },
      { onPhone: () => Promise.resolve(signedIn ? monitor : undefined) },
    );
    const refused: Record<string, string[]> = {};
    for (const endpoint of endpoints.filter(
      ({ access }) =>
        access === 'PROVEN_PHONE' || access === 'MONITOR_ON_PHONE' || access === 'PHONE_IN_USE',
    )) {
      const request = {
        headers: { authorization: 'Bearer a-token', 'x-adms-monitor-session': 'a-session' },
        log: { warn: () => undefined },
      };
      try {
        await door.admit(endpoint, request as never);
      } catch (refusal) {
        const told = refusal as { code: string; getStatus(): number };
        (refused[`${String(told.getStatus())} ${told.code}`] ??= []).push(endpoint.name);
      }
    }
    return refused;
  }

  const notWhatItSends = [
    'createMonitorOnPhone',
    'signInOnPhone',
    'openPasscodeSessionOnPhone',
    'takeOfflineSignInOnPhone',
    'signOutOnPhone',
    'phoneMonitor',
    'phoneLists',
    'phoneLoginList',
    'phoneAddressLookup',
    'phoneSetupChoices',
  ];

  it('a phone taken out of service only sends, whatever session it still holds: told so everywhere else', async () => {
    for (const status of ['LOST', 'RETIRED'] as const) {
      expect(await refusals({ status, withPasscode: false }, true), status).toEqual({
        '409 PHONE_OUT_OF_SERVICE': notWhatItSends,
      });
    }
  });

  it('what a phone sends needs somebody signed in on it: a monitor, or the master user by the passcode beside its proof', async () => {
    expect(await refusals({ status: 'ACTIVE', withPasscode: false }, false)).toEqual({
      '401 NOT_SIGNED_IN': [
        'reportPasscodeUse',
        'signOutOnPhone',
        'phoneMonitor',
        'phoneLists',
        'phoneLoginList',
        'phoneAddressLookup',
        'reportUnplannedAssignment',
        'syncPhone',
        'photoFile',
        'sendPhotoFilePart',
      ],
    });
    expect(await refusals({ status: 'ACTIVE', withPasscode: false }, true)).toEqual({});
    // The master user at the phone: the key's proof besides, so it sends with nobody else signed
    // in; what a monitor does still takes the monitor's session.
    expect(await refusals({ status: 'ACTIVE', withPasscode: true }, false)).toEqual({
      '401 NOT_SIGNED_IN': [
        'signOutOnPhone',
        'phoneMonitor',
        'phoneLists',
        'phoneLoginList',
        'phoneAddressLookup',
      ],
    });
  });
});
