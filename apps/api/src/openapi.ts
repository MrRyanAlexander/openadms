// `pnpm openapi` (REQ-004; BACKLOG C23; AC-10-36; ADR-388): writes the OpenAPI description, made
// from the contracts' endpoints, to apps/api/openapi.json. The API's tests fail when the file
// isn't what the contracts make, so a changed endpoint is committed with its description.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { openApiDocument } from '@open-adms/contracts';

const file = fileURLToPath(new URL('../openapi.json', import.meta.url));
writeFileSync(file, `${JSON.stringify(openApiDocument(), null, 2)}\n`);
console.log(`Wrote ${file}.`);
