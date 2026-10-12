// An address as our own address server gives it for a GPS point (ARCHITECTURE §3 "Road distance
// and addresses"; spec/acceptance/04-field-capture.md AC-04-24; ADR-111, 119, 163, 455): street
// number and name ("25 The Green"), the form a field event's address has when the monitor types
// it. Read once here, for the API (a phone's "Look up address") and the worker (the address of
// the point on a road a mileage starts from), so the two never differ.
//
// Nothing here asks the address server: each service does, and hands what it was answered to
// this. The answer is another program's and is taken as such (OWASP API Security Top 10, API10):
// only a street's name and a house number are read from it, each plain text on one line, and
// nothing longer than a field event's address would hold.

// Why a lookup gave no address: the map has no street at the point, or the address server gave
// no answer in time or none that could be read. Either way the monitor types the street number
// and name, as with no connection (ADR-111).
export const noAddressReasons = ['NO_STREET_THERE', 'NOT_ANSWERED'] as const;
export type NoAddressReason = (typeof noAddressReasons)[number];

// The longest address taken, in characters.
export const lookedUpAddressLongest = 200;

// One line of plain text: no control character, and none that starts a new line.
const plain = (part: unknown): string | null => {
  if (typeof part !== 'string') return null;
  const text = part.trim();
  return text === '' || /[\p{Cc}\u2028\u2029]/u.test(text) ? null : text;
};

// The address in the address server's answer to a reverse lookup (Nominatim's `jsonv2`), or
// none: where it knows no street at the point, and where what it answered isn't an address.
export function lookedUpAddress(answer: unknown): string | null {
  if (typeof answer !== 'object' || answer === null) return null;
  const { address } = answer as { address?: unknown };
  if (typeof address !== 'object' || address === null) return null;
  const { house_number: number, road } = address as { house_number?: unknown; road?: unknown };
  const street = plain(road);
  if (street === null) return null;
  const whole = [plain(number), street].filter((part) => part !== null).join(' ');
  return whole.length > lookedUpAddressLongest ? null : whole;
}
