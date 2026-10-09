// The policy the worker runs with (invariant 16; ADR-303, 395, 419; BACKLOG C87): the release's
// values (packages/domain/policy.env), and over them the installation's own, stated under the
// same name in the worker's settings (its env file or its process's environment). One the
// domain refuses stops the start and names its key, never its value, as a setting does. A value
// left blank is not stated. The API reads its own the same way (apps/api/src/policy.ts): each
// service reads exactly one file of its own (ADR-395 (5)).
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { Policy, policyNames } from '@open-adms/domain';

import { SettingsProblem } from './settings.ts';

// From src and from dist alike: four folders up is the repository's root.
const policyFile = new URL('../../../../packages/domain/policy.env', import.meta.url);

export function builtInPolicy(): Policy {
  return Policy.from(parseEnv(readFileSync(policyFile, 'utf8')));
}

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
