// A phone's device key and the challenge it signs (ARCHITECTURE §7.4; AC-02-18, AC-05-03,
// AC-10-44…46; T-02, T-11; ADR-437): NIST SP 800-63B-4 §3.1.6; ASVS 6.7.2, 11.2.3, 11.6.1. The
// phone here holds a software key, as the harness's does; a key in real secure hardware is the
// field app's (Phase 3). Nothing here needs the stack.
import { createPrivateKey, ECDH, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

import { PhoneProofRules } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { DeviceKeys } from '../src/phone/device-keys.ts';
import { PhoneChallenges } from '../src/phone/phone-challenges.ts';

const keys = new DeviceKeys();
const rules = new PhoneProofRules({ phoneChallengeSeconds: 120 });
const challenges = new PhoneChallenges(
  'a signing secret of the test’s own, never a real one',
  rules,
);
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
