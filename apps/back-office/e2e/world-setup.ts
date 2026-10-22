// The back office's browser tests' own world, made once for a run before any test and gone after
// it: the scenario harness's `OfficeWorld` in a process of its own (`cli.ts office`), for the page
// the stack serves at office-world.adms.localhost. The back office depends on nothing that reaches
// Postgres; a test reaches the world through `e2e/world.ts`.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { worldApiOrigin, worldPageOrigin } from './world.ts';

const harness = fileURLToPath(new URL('../../../packages/scenarios/src/cli.ts', import.meta.url));

interface Ready {
  readonly ready: true;
  readonly database: string;
  readonly apiOrigin: string;
  readonly control: string;
}

export default async function worldSetup(): Promise<() => Promise<void>> {
  const made = spawn(process.execPath, [harness, 'office', worldPageOrigin], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const stopped = once(made, 'exit');
  try {
    const ready = await new Promise<Ready>((resolve, reject) => {
      made.once('exit', (code) => {
        reject(new Error(`The world wasn't made (the harness ended with ${String(code)}).`));
      });
      createInterface({ input: made.stdout }).once('line', (line) => {
        const read = JSON.parse(line) as Partial<Ready>;
        if (read.ready === true && read.apiOrigin === worldApiOrigin) resolve(read as Ready);
        else reject(new Error('The harness said something other than that the world was ready.'));
      });
    });
    process.env['ADMS_E2E_OFFICE_CONTROL'] = ready.control;
  } catch (problem) {
    made.kill('SIGTERM');
    await stopped;
    throw problem;
  }
  return async () => {
    made.stdin.end();
    await stopped;
  };
}
