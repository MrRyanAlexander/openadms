// The release's policy values, the built-in defaults (invariant 16; ADR-303; BACKLOG C53): the env
// file beside the domain package, read here, by the server app, and handed to the domain's Policy,
// which refuses a value that is missing or out of range. The setup service that creates a project
// takes the Policy; the firm then changes a project's own settings, audited. No secret is in that
// file. An installation may state its own value for one, under the same name, in the service's
// own settings (its env file or its process's environment): it wins over the release's, and is
// held to the same range (C53, ADR-395). A value left blank is not stated.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { Policy, policyNames } from '@open-adms/domain';

import { SettingsProblem } from './process/settings.ts';

// From src and from dist alike: three folders up is the repository's root.
const policyFile = new URL('../../../packages/domain/policy.env', import.meta.url);

export function builtInPolicy(): Policy {
  return Policy.from(parseEnv(readFileSync(policyFile, 'utf8')));
}

// The policy the API runs with: the release's values, and over them the installation's own. One
// the domain refuses stops the start and names its key, never its value, as a setting does.
export function installationPolicy(
  environment: Readonly<Record<string, string | undefined>>,
): Policy {
  const values = parseEnv(readFileSync(policyFile, 'utf8'));
  const problems: { key: string; what: string }[] = [];
  for (const name of Object.values(policyNames)) {
    const own = environment[name]?.trim();
    if (own === undefined || own === '') continue;
    try {
      Policy.from({ ...values, [name]: own });
      values[name] = own;
    } catch {
      problems.push({ key: name, what: 'malformed' });
    }
  }
  if (problems.length > 0) throw new SettingsProblem(problems);
  return Policy.from(values);
}
