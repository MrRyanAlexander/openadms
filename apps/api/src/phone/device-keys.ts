// A phone's device key, as the server holds and checks it (ARCHITECTURE §7.4; AC-02-16, 18;
// AC-10-44, 46; T-02; ADR-437): NIST SP 800-63B-4 §3.1.6.2, OWASP ASVS 5.0 11.2.3, 11.6.1. The
// kind is the domain's (`phoneKeyKind`): ECDSA on P-256, signing with SHA-256, checked by Node's
// own `node:crypto`.
//
// The server is sent, and keeps, the public half only: nothing it holds could sign as a phone.
// A key travels as the base64 of its SubjectPublicKeyInfo (what an Android's Keystore hands
// over as it is, and an iPhone's 65-byte point with a fixed 26-byte header before it). It is
// kept written one way, so that one key is one string and the database's "one key, one phone"
// (AC-02-16) holds however a phone wrote it. A signature travels as the base64 of its DER form,
// which is what both phones' own signing gives.
import { createPublicKey, verify, type KeyObject } from 'node:crypto';

import { phoneKeyKind } from '@open-adms/domain';

export class DeviceKeys {
  // P-256 as OpenSSL names it, and so as Node says it.
  private static readonly curve = 'prime256v1';
  private static readonly base64 = /^[A-Za-z0-9+/]+={0,2}$/;
  // A P-256 key's SubjectPublicKeyInfo is 91 bytes and its signature 72 at most: anything far
  // longer is never read.
  private static readonly longest = 400;

  // The key as it is kept, or undefined when what was sent isn't a public key of the kind.
  kept(sent: string): string | undefined {
    const read = this.read(sent);
    if (read === undefined) return undefined;
    // Read again from its two coordinates: a key sent with its point written short would
    // otherwise be written back short, a second spelling of the same key.
    const whole = createPublicKey({ key: read.export({ format: 'jwk' }), format: 'jwk' });
    return whole.export({ format: 'der', type: 'spki' }).toString('base64');
  }

  // Whether the phone that holds this key's private half signed the text.
  signedBy(key: string, text: string, signature: string): boolean {
    const read = this.read(key);
    if (read === undefined || !DeviceKeys.sendable(signature)) return false;
    try {
      return verify(
        phoneKeyKind.hash,
        Buffer.from(text, 'utf8'),
        { key: read, dsaEncoding: 'der' },
        Buffer.from(signature, 'base64'),
      );
    } catch {
      return false;
    }
  }

  private read(sent: string): KeyObject | undefined {
    if (!DeviceKeys.sendable(sent)) return undefined;
    let key: KeyObject;
    try {
      key = createPublicKey({ key: Buffer.from(sent, 'base64'), format: 'der', type: 'spki' });
    } catch {
      return undefined;
    }
    const named = key.asymmetricKeyDetails?.namedCurve;
    return key.asymmetricKeyType === 'ec' && named === DeviceKeys.curve ? key : undefined;
  }

  private static sendable(sent: string): boolean {
    return sent.length <= DeviceKeys.longest && DeviceKeys.base64.test(sent);
  }
}
