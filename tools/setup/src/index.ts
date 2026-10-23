// The installer's command line (ARCHITECTURE §4; ADR-266). Run from the root:
//   pnpm installer            first run: the questions, the secrets, the database; a rerun re-checks
//                             what it knows, asks to confirm and resume, and never remakes a secret
//   pnpm installer:check      re-check what it knows, change nothing (exit 1 if something is off)
//   pnpm installer:teardown   drop the database and its logins, remove the env files and the record
//   pnpm start | stop | logs   the test install (test-install.ts): fresh every time, then checked
//   server prepare|install|site|check
//                             a firm's server (server.ts), inside the setup image, run by `./adms`
// A first run also loads the two sample projects (a few minutes) so a fresh installation already
// holds them; add --no-sample to skip that (`pnpm sample` loads them later).
// Add --yes to answer yes to confirmations (a first run still needs its answers, one per line).
// Node 24 runs this file as-is (type stripping), so it uses erasable TypeScript only.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Installer } from './installer.ts';
import { ServerInstall } from './server.ts';
import { TestInstall } from './test-install.ts';

// src/ or dist/: the repository root is three up.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const [command, ...flags] = process.argv.slice(2);
const installer = new Installer(root, flags.includes('--yes'), !flags.includes('--no-sample'));

try {
  if (command === 'install') await installer.install();
  else if (command === 'check') process.exitCode = (await installer.check()) ? 0 : 1;
  else if (command === 'teardown') await installer.teardown();
  else if (command === 'start')
    process.exitCode = (await new TestInstall(root, installer).start(flags)) ? 0 : 1;
  else if (command === 'stop') new TestInstall(root, installer).stop();
  else if (command === 'logs') new TestInstall(root, installer).logs();
  else if (command === 'server') process.exitCode = await new ServerInstall(root).run(flags[0]);
  else {
    console.error(
      'Usage: node tools/setup/src/index.ts install|check|teardown|start|stop|logs [--yes] [--no-sample] [--keep]',
    );
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
