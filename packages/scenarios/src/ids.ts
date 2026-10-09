// A UUIDv7 made from a given clock (RFC 9562 §5.7): 48 bits of Unix milliseconds, then random
// bits. A phone makes its field event's id itself, from its own clock, so a retried sync is the
// same record (ARCHITECTURE §9; KD-56); the database makes every other id with uuidv7().
import { randomBytes } from 'node:crypto';

export function uuidv7(at: Date): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(at.getTime(), 0, 6);
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x70, 6); // version 7
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8); // variant 10
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// When a UUIDv7 was made.
export function uuidv7Time(id: string): Date {
  return new Date(Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16));
}
