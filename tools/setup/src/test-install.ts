// The test install, on a developer's machine with Docker Desktop (the user, 2026-10-23; BUILD.md,
// Settled 11): `pnpm start` is a fresh installation every time, as if Open ADMS had never been
// installed here; `pnpm stop` stops it. A firm's server is the production install (`./adms`).
//
//   pnpm start               the local stack's data cleared (its database, its files, the dev
//                            passwords; the map servers' data and the certificates kept), the
//                            installer's first run (its five questions, a new master passcode, the
//                            first admin), everything built and started, the sample loaded, every
//                            part checked line by line, then where each part answers, how to sign
//                            in, and an offer to follow the logs
//   pnpm start --keep        no clearing: the installer's rerun (it re-checks and resumes), the
//                            stack brought up again on what was just built, the same checks
//   pnpm start --no-sample   (pnpm start:blank) the same, without the sample projects
//   pnpm stop                the stack stopped, its data kept for `pnpm start --keep`
//   pnpm logs                the installation's logs, followed
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

import type { Installer } from './installer.ts';
import { backOfficeSignIn } from './sign-in.ts';

export class TestInstall {
  private readonly root: string;
  private readonly installer: Installer;

  constructor(root: string, installer: Installer) {
    this.root = root;
    this.installer = installer;
  }

  async start(flags: readonly string[]): Promise<boolean> {
    const keep = flags.includes('--keep');
    if (keep) {
      console.log('Carrying on with the test installation already here (--keep).');
    } else {
      console.log(
        'A fresh test installation: the one already here (its database, files and settings) is cleared first.',
      );
      this.helper(['fresh']);
      this.installer.forget();
    }
    await this.installer.install();
    if (keep) this.helper(['up']);

    console.log('\nChecking every part:');
    const allWell = await this.installer.check();
    if (!flags.includes('--no-sample')) this.sampleChecked();
    this.helper(['report']);
    const { port, email } = this.installer.backOfficeSignIn();
    if (email !== undefined) {
      for (const line of backOfficeSignIn(port, email)) console.log(line);
    }
    console.log(
      allWell
        ? '\nEvery check passed.'
        : '\nSome checks failed (✗ above): their lines say what to do.',
    );
    console.log(
      'Commands: `pnpm stop` stops it, `pnpm start --keep` brings it back as it was, `pnpm logs` follows its logs, `pnpm start` starts afresh.',
    );
    if (process.stdin.isTTY && (await this.yes('Follow the logs now? Ctrl-C stops following'))) {
      this.helper(['logs']);
    }
    return allWell;
  }

  stop(): void {
    this.helper(['down']);
    console.log(
      'Stopped. Its data is kept: `pnpm start --keep` brings it back, `pnpm start` starts afresh.',
    );
  }

  logs(): void {
    this.helper(['logs']);
  }

  // Whether the sample is there whole: its own status, read through the API's login.
  private sampleChecked(): void {
    const said = spawnSync(
      process.execPath,
      [join(this.root, 'packages/scenarios/src/sample-cli.ts'), '--status'],
      { cwd: this.root, encoding: 'utf8' },
    );
    const line = said.stdout.trim();
    const loaded = line === 'The sample projects are loaded.';
    console.log(`${loaded ? '✓' : '✗'} ${line === '' ? 'the sample’s status was not read' : line}`);
    if (loaded) {
      console.log(
        '✓ each sample monitor signed in on a phone and took the day’s work (proven at the load)',
      );
    }
  }

  private helper(args: string[]): void {
    const result = spawnSync(
      process.execPath,
      [join(this.root, 'infra/local/src/index.ts'), ...args],
      {
        stdio: 'inherit',
      },
    );
    if (result.status !== 0 && args[0] !== 'logs') {
      throw new Error(`The local stack’s ${args[0] ?? ''} did not finish. Stopped.`);
    }
  }

  private async yes(question: string): Promise<boolean> {
    const lines = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await new Promise<string>((resolve) => {
        lines.question(`${question} (y/N): `, resolve);
      });
      return /^y(es)?$/i.test(answer.trim());
    } finally {
      lines.close();
    }
  }
}
