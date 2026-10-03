// The release's policy values, the built-in defaults (invariant 16; ADR-303; BACKLOG C53): the env
// file beside the domain package, read here, by the server app, and handed to the domain's Policy,
// which refuses a value that is missing or out of range. The setup service that creates a project
// takes the Policy; the firm then changes a project's own settings, audited. No secret is in that
// file. Whether an installation's own env may override a built-in default is Phase 2's (C53).
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { Policy } from '@open-adms/domain';

// From src and from dist alike: three folders up is the repository's root.
const policyFile = new URL('../../../packages/domain/policy.env', import.meta.url);

export function builtInPolicy(): Policy {
  return Policy.from(parseEnv(readFileSync(policyFile, 'utf8')));
}
