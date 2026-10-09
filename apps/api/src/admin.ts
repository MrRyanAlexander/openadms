// `pnpm installer:admin` (ARCHITECTURE §4, §6; AC-02-13; ADR-413 (2), 414 (2), 415): run on the
// firm's own server, beside the installer. It makes the firm's first admin, or lets an admin back
// in who has no other admin to ask (people/server-admin.ts). It reads the API's own settings, as
// the API does, and prints none of them; a missing one stops it and names its key.
//
// Answers come from the terminal or, for a scripted run, one per line on standard input. A
// password's typing is never echoed.
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

import { openDatabase } from '@open-adms/db';
import { PasswordRules } from '@open-adms/domain';

import { AdminCommand, type Questions } from './people/admin-command.ts';
import { ServerAdmin } from './people/server-admin.ts';
import { installationPolicy } from './policy.ts';
import { Settings } from './process/settings.ts';
import { shippedBreachedPasswords } from './sign-in/breached-list.ts';
import { PasswordHasher } from './sign-in/password-hasher.ts';

class Terminal implements Questions {
  private muted = false;
  private readonly readline = createInterface({
    input: process.stdin,
    output: new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        if (!this.muted) process.stdout.write(chunk);
        done();
      },
    }),
    terminal: process.stdin.isTTY,
  });
  private readonly lines = this.readline[Symbol.asyncIterator]();

  async ask(question: string): Promise<string> {
    process.stdout.write(`${question}: `);
    const answer = await this.next();
    if (!process.stdin.isTTY) process.stdout.write('\n');
    return answer;
  }

  async askSecret(question: string): Promise<string> {
    process.stdout.write(`${question} (not shown): `);
    this.muted = true;
    try {
      return await this.next();
    } finally {
      this.muted = false;
      process.stdout.write('\n');
    }
  }

  async confirm(question: string): Promise<boolean> {
    return ['y', 'yes'].includes((await this.ask(`${question} (y/N)`)).trim().toLowerCase());
  }

  close(): void {
    this.readline.close();
  }

  private async next(): Promise<string> {
    const line = await this.lines.next();
    if (line.done === true) throw new Error('The questions ran out of answers.');
    return line.value;
  }
}

async function main(): Promise<number> {
  // The command listens nowhere: the API's address is asked of its settings only so that they
  // read whole.
  const environment = Settings.environment({
    ADMS_API_HOST: '127.0.0.1',
    ADMS_API_PORT: '3000',
    ...process.env,
  });
  const settings = Settings.from(environment);
  const policy = installationPolicy(environment);
  const db = openDatabase({ url: settings.databaseUrl, maxConnections: 1 });
  const terminal = new Terminal();
  const clock = { now: () => new Date() };
  const admin = new ServerAdmin(db, {
    rules: new PasswordRules(policy, shippedBreachedPasswords()),
    hasher: new PasswordHasher(settings.tokenSigningSecret),
    // Ending a person's sessions, as sign-in's own service does it.
    sessions: {
      endAll: async (tx, userId) =>
        (
          await tx.session.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: clock.now() },
          })
        ).count,
    },
    clock,
  });
  try {
    return await new AdminCommand(admin, terminal, (line) => {
      process.stdout.write(`${line}\n`);
    }).run();
  } finally {
    terminal.close();
    await db.$disconnect();
  }
}

try {
  process.exitCode = await main();
} catch (problem) {
  // A setting's problem names its key, never its value.
  const what = problem instanceof Error ? problem.message : 'The command failed.';
  process.stderr.write(`${what} Nothing more was done.\n`);
  process.exitCode = 1;
}
