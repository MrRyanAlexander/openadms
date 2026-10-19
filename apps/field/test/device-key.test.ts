// The browser build's device key (src/store/web-crypto-key.ts; BACKLOG 3.2.2, C110; ADR-572), run
// on Node's WebCrypto, the same interface the browser's is, and checked as the server checks a
// proof: by Node's own crypto, the signature read as DER. The keyring around it, in IndexedDB in a
// real browser, and the server taking its proofs, are e2e/enrolment.e2e.ts's.
import { createPublicKey, verify } from 'node:crypto';

import { PhoneProofRules } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { derSignature, WebCryptoDeviceKey } from '../src/store/web-crypto-key.ts';

const challenge = 'a-challenge-the-server-made';

function checked(publicKey: string, text: string, signature: string, as: 'der' | 'ieee-p1363') {
  return verify(
    'sha256',
    Buffer.from(text),
    {
      key: createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' }),
      dsaEncoding: as,
    },
    Buffer.from(signature, 'base64'),
  );
}

describe('the browser build’s device key', () => {
  it('AC-11-11, AC-02-18: is ECDSA P-256, made with its private half not extractable; only its public half is ever read out', async () => {
    const { pair, key } = await WebCryptoDeviceKey.madeAnew();
    expect(pair.privateKey.extractable).toBe(false);
    expect(pair.privateKey.algorithm).toEqual({ name: 'ECDSA', namedCurve: 'P-256' });
    expect(pair.privateKey.usages).toEqual(['sign']);
    await expect(crypto.subtle.exportKey('pkcs8', pair.privateKey)).rejects.toThrow();
    await expect(crypto.subtle.exportKey('jwk', pair.privateKey)).rejects.toThrow();
    // The public half as the server takes it: SubjectPublicKeyInfo, a P-256 point and nothing more.
    const read = createPublicKey({
      key: Buffer.from(key.publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });
    expect(read.asymmetricKeyType).toBe('ec');
    expect(read.asymmetricKeyDetails).toEqual({ namedCurve: 'prime256v1' });
    expect(Buffer.from(key.publicKey, 'base64')).toHaveLength(91);
    // Each key its own: made from nothing given.
    const other = await WebCryptoDeviceKey.madeAnew();
    expect(other.key.publicKey).not.toBe(key.publicKey);
  });

  it('AC-11-11: signs the domain’s text for a challenge in DER, as the server reads a proof, and never as WebCrypto writes it', async () => {
    const { key } = await WebCryptoDeviceKey.madeAnew();
    const text = PhoneProofRules.signed(challenge);
    for (let time = 0; time < 20; time += 1) {
      const signature = await key.signed(text);
      expect(checked(key.publicKey, text, signature, 'der')).toBe(true);
      expect(checked(key.publicKey, `${text}x`, signature, 'der')).toBe(false);
      expect(Buffer.from(signature, 'base64')[0]).toBe(0x30);
    }
  });

  it('AC-11-11: writes r and s as DER’s unsigned integers: a zero byte before a first bit set, none before a zero byte', () => {
    const r = new Uint8Array(32).fill(0x11);
    const s = new Uint8Array(32).fill(0x22);
    expect([...derSignature(Uint8Array.of(...r, ...s))]).toEqual([
      0x30,
      68,
      0x02,
      32,
      ...r,
      0x02,
      32,
      ...s,
    ]);
    const high = new Uint8Array(32).fill(0x80);
    const low = Uint8Array.of(0, 0, 0x7f, ...new Uint8Array(29).fill(0x01));
    expect([...derSignature(Uint8Array.of(...high, ...low))]).toEqual([
      0x30,
      67,
      0x02,
      33,
      0,
      ...high,
      0x02,
      30,
      0x7f,
      ...new Uint8Array(29).fill(0x01),
    ]);
    const zero = new Uint8Array(32);
    expect([...derSignature(Uint8Array.of(...zero, ...zero))]).toEqual([
      0x30, 6, 0x02, 1, 0, 0x02, 1, 0,
    ]);
    expect(() => derSignature(new Uint8Array(63))).toThrow('64 bytes');
  });

  it('AC-11-11: a key the keyring holds that it didn’t make, one whose private half can be read out, is refused', async () => {
    const readable = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    await expect(WebCryptoDeviceKey.of(readable)).rejects.toThrow(
      'The phone’s keyring holds a device key it didn’t make.',
    );
    await expect(WebCryptoDeviceKey.of(undefined)).rejects.toThrow('didn’t make');
    const otherCurve = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-384' },
      false,
      ['sign', 'verify'],
    );
    await expect(WebCryptoDeviceKey.of(otherCurve)).rejects.toThrow('didn’t make');
    const { pair, key } = await WebCryptoDeviceKey.madeAnew();
    expect((await WebCryptoDeviceKey.of(pair)).publicKey).toBe(key.publicKey);
  });
});
