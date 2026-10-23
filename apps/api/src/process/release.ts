// Which Open ADMS this is (the user, 2026-10-22): the repository's root package.json `version`,
// the one place the number is written. The API reads it as it starts and says it where an
// installation brands itself (the brand read, its mail, its daily report). From src and from dist
// alike, four folders up is the repository's root; the local stack mounts that file into the API's
// container for this (infra/local/compose.yaml).
import { readFileSync } from 'node:fs';

import { brandAnswerSchema } from '@open-adms/contracts';

const rootPackage = new URL('../../../../package.json', import.meta.url);

// The release's number, as a release number or the start stops: a number the brand read could not
// say is no number to run under.
export function releaseVersion(): string {
  const read = JSON.parse(readFileSync(rootPackage, 'utf8')) as { version?: unknown };
  const parsed = brandAnswerSchema.shape.version.safeParse(read.version);
  if (!parsed.success) {
    throw new Error('The root package.json holds no release number in its version.');
  }
  return parsed.data;
}
