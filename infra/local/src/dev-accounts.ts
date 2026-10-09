// The dev stack's own accounts (ARCHITECTURE §6; spec/acceptance/10-api-and-sync.md AC-10-26;
// ADR-170, 412): three people a developer signs in as on this machine, each with a password
// and, where the role needs a second step, an authenticator secret that are written here for
// anybody to read. They exist so that sign-in can be tried by hand without setting a firm up.
//
// **They are the dev stack's only, never a shipped build's.** This file is in `infra/local`,
// which no app, package or tool depends on (a test holds that, and that nothing they ship holds
// one of these values). The installer seeds no person who can sign in. `pnpm local:accounts`
// writes them, and refuses a database that isn't on this machine.
//
// The people are the example world's (spec/CONVENTIONS.md §6), at an address of their own so
// that no test's people are mistaken for them.
import { randomUUID } from 'node:crypto';

import { OneTimeCodes, type PasswordHasher, type TwoStepSecrets } from '@open-adms/api';
import type { Prisma } from '@open-adms/db';

export interface DevAccount {
  readonly name: string;
  readonly role: 'ADMIN' | 'MANAGER_ANALYST' | 'READ_ONLY_VIEWER';
  readonly email: string;
  // Known to everybody who reads this file: good for nothing but this machine's stack.
  readonly password: string;
  // What their authenticator app holds, twenty characters; none for a viewer, who may choose.
  readonly authenticator?: string;
}

export const devAccounts: readonly DevAccount[] = [
  {
    name: 'Dana Reyes',
    role: 'ADMIN',
    email: 'dana.reyes@dev.gates.example',
    password: 'dev stack only: dana',
    authenticator: 'dev-stack-only-dana!',
  },
  {
    name: 'Luis Ortega',
    role: 'MANAGER_ANALYST',
    email: 'luis.ortega@dev.gates.example',
    password: 'dev stack only: luis',
    authenticator: 'dev-stack-only-luis!',
  },
  {
    name: 'Bayline County debris manager',
    role: 'READ_ONLY_VIEWER',
    email: 'debris@dev.baylinecounty.example',
    password: 'dev stack only: bayline',
  },
];

export interface DevAccountParts {
  readonly hasher: PasswordHasher;
  readonly secrets: TwoStepSecrets;
}

export class DevAccounts {
  private readonly codes = new OneTimeCodes();
  private readonly parts: DevAccountParts;

  constructor(parts: DevAccountParts) {
    this.parts = parts;
  }

  // Whether these accounts may be written to that database: only one on this machine, and never
  // by a process that says it is production.
  static allowed(databaseUrl: string, environment: Readonly<Record<string, string | undefined>>) {
    if (environment['NODE_ENV'] === 'production') return false;
    try {
      return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(databaseUrl).hostname);
    } catch {
      return false;
    }
  }

  // What a developer needs to sign in as each: the password, and for an authenticator app the
  // secret as text and as the address a QR code holds.
  shown(): readonly string[] {
    return devAccounts.flatMap((account) => {
      const secret = this.secretOf(account);
      return [
        `${account.name} (${account.role})`,
        `  email:         ${account.email}`,
        `  password:      ${account.password}`,
        ...(secret === undefined
          ? ['  authenticator: none (a read-only viewer may choose one)']
          : [
              `  authenticator: ${this.codes.base32(secret)}`,
              `                 ${this.codes.uri(secret, account.email)}`,
            ]),
      ];
    });
  }

  // The id the first account is written under where it isn't there yet: every write names a
  // real person, and the dev admin is the one who stands for this.
  async actor(tx: Prisma.TransactionClient): Promise<string> {
    const [admin] = devAccounts;
    const held = await tx.user.findFirst({ where: { email: admin?.email ?? '' } });
    return held?.id ?? randomUUID();
  }

  // Writes each account, or puts it back as it is written here: the password, the authenticator
  // with no code yet taken, no wrong tries, nothing to change first. Inside the caller's piece
  // of work, whose actor is `actorId`.
  async writeIn(tx: Prisma.TransactionClient, actorId: string): Promise<void> {
    for (const account of devAccounts) {
      const held = await tx.user.findFirst({ where: { email: account.email } });
      const person =
        held ??
        (await tx.user.create({
          data: {
            ...(account.role === 'ADMIN' ? { id: actorId } : {}),
            name: account.name,
            role: account.role,
            email: account.email,
            ...(account.role === 'READ_ONLY_VIEWER'
              ? { viewerKind: 'CLIENT', seesPrivateCitizens: true }
              : {}),
          },
        }));
      const secret = this.secretOf(account);
      const kept = {
        passwordHash: await this.parts.hasher.hash(account.password),
        twoStepSecret: secret === undefined ? null : this.parts.secrets.seal(person.id, secret),
        twoStepLastStep: null,
        failedSignIns: 0,
        lockedUntil: null,
        passwordChangeRequired: false,
      };
      await tx.userCredential.upsert({
        where: { userId: person.id },
        create: { userId: person.id, ...kept },
        update: kept,
      });
    }
  }

  // The code an account's authenticator shows at a moment, for a script that signs in.
  codeAt(account: DevAccount, now: Date): string | undefined {
    const secret = this.secretOf(account);
    return secret === undefined
      ? undefined
      : this.codes.codeAt(secret, Math.floor(now.getTime() / 30_000));
  }

  private secretOf(account: DevAccount): Buffer | undefined {
    return account.authenticator === undefined ? undefined : Buffer.from(account.authenticator);
  }
}
