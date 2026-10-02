// The release's policy values, the built-in defaults (invariant 16; ADR-303): the env file beside
// the domain package, read here as a server app reads it and handed to the domain's Policy, which
// refuses a value that is missing or out of range. A story's firm changes nothing in it, so every
// story's new project starts with what a release ships. No secret is in that file.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { Policy } from '@open-adms/domain';

const policyFile = new URL('../../domain/policy.env', import.meta.url);

export function builtInPolicy(): Policy {
  return Policy.from(parseEnv(readFileSync(policyFile, 'utf8')));
}
