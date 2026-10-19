// The browser tests' own world (ADR-572), made once for a run before any test and gone after it:
// the field app built for it (`dist/world`, the same source with the world's API as its one
// server) served from this machine's loopback under the app's own policy, and a database of the
// run's own served by the API's own process at `https://stories.adms.localhost`. The scenario
// harness makes the world in a process of its own (`cli.ts world`): the field app depends on
// nothing that reaches Postgres (`pnpm security`, "Who reaches Postgres"). A test reaches the
// world by `e2e/world.ts`; the installation's database is never written by a browser test.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { servedHeaders, servedPolicy } from '../page.ts';
import { servedFolder } from './stack.ts';
import { worldApiOrigin } from './world.ts';

const harness = fileURLToPath(new URL('../../../packages/scenarios/src/cli.ts', import.meta.url));

interface Ready {
  readonly ready: true;
  readonly database: string;
  readonly apiOrigin: string;
  readonly masterPasscode: string;
  readonly cast: unknown;
  readonly lostPhone: unknown;
}

export default async function worldSetup(): Promise<() => Promise<void>> {
  const page = await servedFolder(fileURLToPath(new URL('../dist/world', import.meta.url)), {
    'content-security-policy': servedPolicy(worldApiOrigin),
    ...servedHeaders,
  });
  const made = spawn(process.execPath, [harness, 'world', page.origin], {
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
    // Handed to every test's process: where the world's page is, its made-up master passcode, its
    // cast of monitors with their made-up passwords, and its lost tower phone with its key.
    process.env['ADMS_E2E_WORLD_ORIGIN'] = page.origin;
    process.env['ADMS_E2E_WORLD_PASSCODE'] = ready.masterPasscode;
    process.env['ADMS_E2E_WORLD_CAST'] = JSON.stringify(ready.cast);
    process.env['ADMS_E2E_WORLD_LOST_PHONE'] = JSON.stringify(ready.lostPhone);
  } catch (problem) {
    made.kill('SIGTERM');
    await stopped;
    await page.close();
    throw problem;
  }
  return async () => {
    try {
      made.stdin.end();
      await stopped;
    } finally {
      await page.close();
    }
  };
}
