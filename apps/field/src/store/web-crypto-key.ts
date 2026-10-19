// The browser build's device key (ARCHITECTURE §7.4; BACKLOG 3.2.2, C110; ADR-572; AC-11-11;
// MASWE-0010): an ECDSA P-256 key pair WebCrypto makes with its private half not extractable, so no
// script, the app's own included, can read it out; the browser can only sign with it. Its public
// half goes to the server as SubjectPublicKeyInfo, the one thing of the key that is ever exported.
// WebCrypto writes an ECDSA signature as r and s side by side (IEEE P1363), and the server reads
// DER, as an iPhone's Secure Enclave and an Android's Keystore write it: so it is written again as
// DER here. The native builds sign in DER themselves (3.8.1, 3.9.1).
import { phoneKeyKind } from '@open-adms/domain';

import type { DeviceKey } from './keyring.ts';

const text = new TextEncoder();

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// One of the signature's two numbers as a DER INTEGER: unsigned, so a leading zero byte where its
// first bit is set, and no other leading zero.
function derInteger(value: Uint8Array): Uint8Array {
  let from = 0;
  while (from < value.length - 1 && value[from] === 0) from += 1;
  const digits = value.subarray(from);
  const padded = ((digits[0] ?? 0) & 0x80) === 0 ? digits : Uint8Array.of(0, ...digits);
  return Uint8Array.of(0x02, padded.length, ...padded);
}

// A P-256 signature as WebCrypto writes it (r then s, 32 bytes each) written as DER's
// SEQUENCE { INTEGER r, INTEGER s }: at most 72 bytes, so every length is one byte.
export function derSignature(rs: Uint8Array): Uint8Array {
  if (rs.length !== 64) throw new Error('A P-256 signature is 64 bytes as WebCrypto writes it.');
  const r = derInteger(rs.subarray(0, 32));
  const s = derInteger(rs.subarray(32));
  return Uint8Array.of(0x30, r.length + s.length, ...r, ...s);
}

export class WebCryptoDeviceKey implements DeviceKey {
  readonly publicKey: string;
  private readonly privateKey: CryptoKey;

  private constructor(publicKey: string, privateKey: CryptoKey) {
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  // A key pair made anew, its private half never extractable.
  static async madeAnew(): Promise<{ pair: CryptoKeyPair; key: WebCryptoDeviceKey }> {
    const pair = await crypto.subtle.generateKey(
      { name: phoneKeyKind.algorithm, namedCurve: phoneKeyKind.curve },
      false,
      ['sign', 'verify'],
    );
    return { pair, key: await WebCryptoDeviceKey.of(pair) };
  }

  // The key a pair kept by the keyring is, held to what madeAnew makes.
  static async of(pair: unknown): Promise<WebCryptoDeviceKey> {
    const { privateKey, publicKey } = (pair ?? {}) as Partial<Record<keyof CryptoKeyPair, unknown>>;
    const isKey = (key: unknown, type: KeyType): key is CryptoKey =>
      key instanceof CryptoKey &&
      key.type === type &&
      key.algorithm.name === phoneKeyKind.algorithm &&
      (key.algorithm as EcKeyAlgorithm).namedCurve === phoneKeyKind.curve;
    if (!isKey(privateKey, 'private') || privateKey.extractable || !isKey(publicKey, 'public')) {
      throw new Error('The phone’s keyring holds a device key it didn’t make.');
    }
    // The public half alone: WebCrypto always lets a public key out, and never this private one.
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', publicKey));
    return new WebCryptoDeviceKey(base64(spki), privateKey);
  }

  async signed(signing: string): Promise<string> {
    const rs = await crypto.subtle.sign(
      { name: phoneKeyKind.algorithm, hash: phoneKeyKind.hash },
      this.privateKey,
      text.encode(signing),
    );
    return base64(derSignature(new Uint8Array(rs)));
  }
}
