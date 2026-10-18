// A UUIDv7 made from a given clock (RFC 9562 §5.7): 48 bits of Unix milliseconds, then random
// bits. A phone makes its record's id itself, from its own clock, so a retried sync is the same
// record (ARCHITECTURE §9; KD-56); the database makes every other id with uuidv7(). It lives here
// so that the field app and the scenario harness make the same id the same way (C31; ADR-565).
// The random bits are the platform's cryptographic source, Web Crypto, which Node, a browser and
// a phone's WebView each have (OWASP MASWE-0012).

interface RandomSource {
  getRandomValues(array: Uint8Array): Uint8Array;
}

const { crypto } = globalThis as unknown as { readonly crypto: RandomSource };

// The latest instant 48 bits of milliseconds hold.
const latest = 2 ** 48 - 1;

export function uuidv7(at: Date): string {
  const milliseconds = at.getTime();
  if (!Number.isInteger(milliseconds) || milliseconds < 0 || milliseconds > latest) {
    throw new RangeError('A UUIDv7 holds a time from 1970 for 48 bits of milliseconds.');
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  for (let index = 0; index < 6; index += 1) {
    bytes[index] = Math.floor(milliseconds / 2 ** (8 * (5 - index))) % 256;
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // version 7
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// When a UUIDv7 was made.
export function uuidv7Time(id: string): Date {
  return new Date(Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16));
}
