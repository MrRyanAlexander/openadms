// The release's list of known breached passwords (ARCHITECTURE §6; AC-10-24; BACKLOG C35;
// ADR-403): the file beside the domain package, read here, by the server app, and handed to the
// domain's rules, as the policy values are. The check asks no outside service: the firm runs its
// own installation, and no password or part of one ever leaves it.
import { readFileSync } from 'node:fs';

import { BreachedPasswords } from '@open-adms/domain';

// From src and from dist alike: four folders up is the repository's root.
const listFile = new URL('../../../../packages/domain/breached-passwords.txt', import.meta.url);

export function shippedBreachedPasswords(): BreachedPasswords {
  return BreachedPasswords.from(readFileSync(listFile, 'utf8'));
}
