// How the browser build seals what it keeps (ARCHITECTURE §8; ADR-570; MASWE-0001, 0007, 0013,
// 0014): two random keys WebCrypto makes and never lets out (`extractable: false`), made from no
// password or passcode (AC-11-08): an AES-256-GCM key seals each value, with a fresh random
// 96-bit nonce every time, and an HMAC-SHA-256 key names it, so neither what a value holds nor
// what it is called (a Monitor ID, a ticket's id) is kept in the clear (AC-11-07). The name and
// shelf are bound into the seal, and the id sealed inside it, so a value moved, changed or put
// under another name is refused, never read as another's. The native builds don't use this: their
// SQLCipher store encrypts the whole database itself (3.8.1, 3.9.1).
import type { Held, Shelf } from './phone-store.ts';

export interface SealingKeys {
  readonly sealing: CryptoKey;
  readonly naming: CryptoKey;
}

const context = 'open-adms/phone-store/v1';
const nonceBytes = 12;
const text = new TextEncoder();
const fromText = new TextDecoder('utf-8', { fatal: true });

// What a sealed value holds before sealing: its form (0 JSON's text, 1 a file's bytes), its id's
// length (four bytes, big-endian), its id, then the value.
const asJson = 0;
const asBytes = 1;

function joined(...parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const whole = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    whole.set(part, at);
    at += part.length;
  }
  return whole;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

// A refusal says which shelf, never which id or what it held (AC-11-10).
export class UnreadableValue extends Error {
  constructor(shelf: Shelf) {
    super(
      `A value kept on the ${shelf} shelf can't be read: it was changed, moved or sealed under another key.`,
    );
    this.name = 'UnreadableValue';
  }
}

export class Sealing {
  private readonly keys: SealingKeys;

  constructor(keys: SealingKeys) {
    this.keys = keys;
  }

  // Two keys, random, that no script can read back.
  static async madeAnew(): Promise<SealingKeys> {
    const [sealing, naming] = await Promise.all([
      crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
      crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']),
    ]);
    return { sealing, naming };
  }

  // Keys as the store read them back, held to what madeAnew makes.
  static held(found: unknown): SealingKeys | undefined {
    if (typeof found !== 'object' || found === null) return undefined;
    const { sealing, naming } = found as Partial<Record<keyof SealingKeys, unknown>>;
    const isKey = (key: unknown, algorithm: string): key is CryptoKey =>
      key instanceof CryptoKey && !key.extractable && key.algorithm.name === algorithm;
    return isKey(sealing, 'AES-GCM') && isKey(naming, 'HMAC') ? { sealing, naming } : undefined;
  }

  // The name a value is kept under: the same for the same shelf and id on this phone, and nothing
  // of the id to anyone without the key.
  async nameOf(shelf: Shelf, id: string): Promise<string> {
    const signed = await crypto.subtle.sign(
      'HMAC',
      this.keys.naming,
      text.encode(`${context}\n${shelf}\n${id}`),
    );
    return base64url(new Uint8Array(signed));
  }

  // The value sealed: its nonce, then what AES-GCM made (the sealed bytes and their tag).
  async sealed(shelf: Shelf, name: string, id: string, value: Held): Promise<Uint8Array> {
    const idBytes = text.encode(id);
    const idLength = new Uint8Array(4);
    new DataView(idLength.buffer).setUint32(0, idBytes.length);
    const body =
      value instanceof Uint8Array
        ? joined(Uint8Array.of(asBytes), idLength, idBytes, value)
        : joined(Uint8Array.of(asJson), idLength, idBytes, text.encode(JSON.stringify(value)));
    const nonce = crypto.getRandomValues(new Uint8Array(nonceBytes));
    const made = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: this.boundTo(shelf, name) },
      this.keys.sealing,
      body,
    );
    return joined(nonce, new Uint8Array(made));
  }

  // The id and value a sealed value holds, refused unless it was sealed by this phone's key
  // under this shelf and name, unchanged.
  async opened(shelf: Shelf, name: string, sealed: unknown): Promise<{ id: string; value: Held }> {
    if (!(sealed instanceof Uint8Array) || sealed.length <= nonceBytes) {
      throw new UnreadableValue(shelf);
    }
    let body: Uint8Array;
    try {
      body = new Uint8Array(
        await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: sealed.slice(0, nonceBytes),
            additionalData: this.boundTo(shelf, name),
          },
          this.keys.sealing,
          sealed.slice(nonceBytes),
        ),
      );
    } catch {
      throw new UnreadableValue(shelf);
    }
    if (body.length < 5) throw new UnreadableValue(shelf);
    const idLength = new DataView(body.buffer, body.byteOffset).getUint32(1);
    const id = fromText.decode(body.subarray(5, 5 + idLength));
    const rest = body.slice(5 + idLength);
    // The id sealed inside is the one the name was made from.
    if ((await this.nameOf(shelf, id)) !== name) throw new UnreadableValue(shelf);
    const form = body[0];
    if (form === asBytes) return { id, value: rest };
    if (form === asJson) return { id, value: JSON.parse(fromText.decode(rest)) as Held };
    throw new UnreadableValue(shelf);
  }

  private boundTo(shelf: Shelf, name: string): Uint8Array<ArrayBuffer> {
    return text.encode(`${context}\n${shelf}\n${name}`);
  }
}
