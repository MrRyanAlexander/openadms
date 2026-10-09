// A made-up device key for a test: written as the database keeps a P-256 public key (the
// base64 of its SubjectPublicKeyInfo, ADR-437, 440), one a name. Its point is on no curve and
// nobody holds its private half: the database holds a key to its shape, the API to the rest.
import { createHash } from 'node:crypto';

const header = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE';

export function deviceKeyLike(name: string): string {
  return `${header}${createHash('sha512').update(name).digest('base64')}`;
}
