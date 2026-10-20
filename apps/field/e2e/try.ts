// The field app's current build, to try by hand (`pnpm field:try`; ADR-585): in a world of its
// own, the browser tests' (e2e/world-setup.ts; ADR-572, 574): P1 and P2 set up, the cast of
// monitors with made-up passwords, the made-up master passcode. Nothing goes into the
// installation's database; the world's database is dropped when this stops (Ctrl-C).
//
// It serves the world's build (`dist/world`) from this machine's loopback under the app's own
// policy, has the harness make the world, prints how to get in, and opens a Chrome of its own,
// phone-sized, in a profile of its own, told to take the stack's own certificates and nothing else,
// as the browser tests' Chromium is: the Mac's keychain and its own Chrome are never touched.
// `--no-browser` opens none. Needs the local stack up; never while `pnpm e2e` runs, which serves
// its own world at the same address.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { servedHeaders, servedPolicy } from '../page.ts';
import { servedFolder, trustedKeys } from './stack.ts';
import { worldApiOrigin, type CastMonitor } from './world.ts';

const harness = fileURLToPath(new URL('../../../packages/scenarios/src/cli.ts', import.meta.url));
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Each of the cast's work today, as the world's board has it.
const work: Readonly<Record<string, string>> = {
  kim: 'disposals and drop-off logs at Marsh Road TDSR, P1',
  ana: 'collections and incidents, P1',
  lee: 'two assignments, so none on a phone: set it up under the passcode',
  tariq: 'no assignment',
  jo: 'unit rate work and certifying, P1',
  sam: 'collections on the PARKS project, from control tickets 400001–405000',
};

const page = await servedFolder(fileURLToPath(new URL('../dist/world', import.meta.url)), {
  'content-security-policy': servedPolicy(worldApiOrigin),
  ...servedHeaders,
});
console.log('Making the world…');
const made = spawn(process.execPath, [harness, 'world', page.origin], {
  stdio: ['pipe', 'pipe', 'inherit'],
});
const stopped = once(made, 'exit');
const ready = await new Promise<{
  readonly masterPasscode: string;
  readonly cast: Readonly<Record<string, CastMonitor>>;
}>((resolve, reject) => {
  made.once('exit', (code) => {
    reject(new Error(`The world wasn't made (the harness ended with ${String(code)}).`));
  });
  createInterface({ input: made.stdout }).once('line', (line) => {
    resolve(JSON.parse(line) as { masterPasscode: string; cast: Record<string, CastMonitor> });
  });
});

console.log(`\nThe field app: ${page.origin}`);
console.log(`The master passcode (made up): ${ready.masterPasscode}`);
console.log('The monitors (Monitor ID, password, today’s work):');
for (const [key, monitor] of Object.entries(ready.cast)) {
  console.log(
    `  ${monitor.name.padEnd(12)} ${monitor.monitorNumber}  ${monitor.password}  ${work[key] ?? ''}`,
  );
}
console.log('\nEnrol the phone first (any name, the master passcode), then sign in as a monitor.');
console.log('Badges: trucks 730415 (65 CY) and 730416 (48 CY), crews 730417 and 730418.');

if (!process.argv.includes('--no-browser')) {
  const keys = await trustedKeys([
    new URL(worldApiOrigin).hostname,
    'field.adms.localhost',
    'api.adms.localhost',
  ]);
  spawn(
    chrome,
    [
      `--user-data-dir=${mkdtempSync(join(tmpdir(), 'open-adms-try-'))}`,
      `--ignore-certificate-errors-spki-list=${keys.join(',')}`,
      '--window-size=430,932',
      '--no-first-run',
      '--no-default-browser-check',
      `--app=${page.origin}`,
    ],
    { stdio: 'ignore', detached: true },
  ).unref();
  console.log('\nA Chrome window of its own opened on it.');
}
console.log('Ctrl-C here ends the world and drops its database.');

await new Promise<void>((done) => {
  process.once('SIGINT', done);
  process.once('SIGTERM', done);
});
made.stdin.end();
await stopped;
await page.close();
console.log('The world is gone.');
