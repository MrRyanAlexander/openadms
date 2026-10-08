// The dev stack's own accounts (ARCHITECTURE §6; AC-10-26; ADR-170, 412): what they are, that
// they are written only to a database on this machine, and that nothing a firm is shipped holds
// one. The writing itself is tried on the installation's database as the API's login, in a
// piece of work that is undone: it needs `pnpm local:up` after `pnpm installer`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OneTimeCodes, PasswordHasher, Settings, TwoStepSecrets } from '@open-adms/api';
import { openDatabase } from '@open-adms/db';
import { describe, expect, it } from 'vitest';

import { devAccounts, DevAccounts } from '../src/dev-accounts.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const codes = new OneTimeCodes();

// Every file of the folders a firm is shipped: the apps, the packages and the tools, without
// what is installed or built into them.
function shipped(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    if (['node_modules', 'dist', 'generated', '.cache', '.state'].includes(name)) return [];
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return shipped(path);
    return name.startsWith('.env') ? [] : [path];
  });
}

describe('the dev stack’s accounts', () => {
  it('are an admin and a manager/analyst with an authenticator each, and a read-only viewer with none', () => {
    expect(devAccounts.map(({ role, authenticator }) => [role, authenticator?.length])).toEqual([
      ['ADMIN', 20],
      ['MANAGER_ANALYST', 20],
      ['READ_ONLY_VIEWER', undefined],
    ]);
    // Each signs in with an address of its own, and no test's people have these.
    expect(new Set(devAccounts.map(({ email }) => email.toLowerCase())).size).toBe(3);
    expect(devAccounts.every(({ email }) => /@dev\.[a-z.]+\.example$/.test(email))).toBe(true);
  });

  it('are written only to a database on this machine, never by a process that says it is production', () => {
    const at = (host: string): string => ['postgresql://adms_api:x@', host, '/adms'].join('');
    for (const here of ['127.0.0.1:55432', 'localhost:5432', '[::1]:5432']) {
      expect(DevAccounts.allowed(at(here), {}), here).toBe(true);
      expect(DevAccounts.allowed(at(here), { NODE_ENV: 'production' }), here).toBe(false);
    }
    for (const elsewhere of ['db.gates.example:5432', 'postgres:5432', '10.0.0.5:5432']) {
      expect(DevAccounts.allowed(at(elsewhere), {}), elsewhere).toBe(false);
    }
    expect(DevAccounts.allowed('not a url', {})).toBe(false);
  });

  it('AC-10-26 a shipped build holds no seeded account and no known authenticator secret: those are the dev stack’s only', () => {
    const folders = ['apps', 'packages', 'tools'].map((name) => join(repository, name));
    const files = folders.flatMap(shipped);
    expect(files.length).toBeGreaterThan(300);
    const known = devAccounts.flatMap(({ email, password, authenticator }) => [
      email,
      password,
      ...(authenticator === undefined
        ? []
        : [authenticator, codes.base32(Buffer.from(authenticator))]),
    ]);
    const holding: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      // Nothing shipped reads the dev stack's helper either.
      for (const never of [...known, '@open-adms/infra-local', 'dev-accounts']) {
        if (text.includes(never)) holding.push(`${file.slice(repository.length)}: ${never}`);
      }
    }
    expect(holding).toEqual([]);
  });

  it('are written with their password as the API’s own keyed hash and their authenticator sealed; written again, they are put back as they were', async () => {
    const settings = Settings.read({ ADMS_API_HOST: '127.0.0.1', ADMS_API_PORT: '3000' });
    const hasher = new PasswordHasher(settings.tokenSigningSecret);
    const secrets = new TwoStepSecrets(settings.tokenSigningSecret);
    const accounts = new DevAccounts({ hasher, secrets });
    const db = openDatabase({ url: settings.databaseUrl, maxConnections: 1 });
    const undo = new Error('undone');
    try {
      const actorId = await db.$read((tx) => accounts.actor(tx));
      await db.$write({ actorId, source: 'BACK_OFFICE' }, async (tx) => {
        await accounts.writeIn(tx, actorId);
        // A login somebody locked and whose authenticator was used is put back by a second run.
        const dana = await tx.user.findFirstOrThrow({
          where: { email: devAccounts[0]?.email ?? '' },
        });
        await tx.userCredential.update({
          where: { userId: dana.id },
          data: { failedSignIns: 50, twoStepLastStep: 58677600, passwordChangeRequired: true },
        });
        await accounts.writeIn(tx, actorId);
        for (const account of devAccounts) {
          const people = await tx.user.findMany({
            where: { email: account.email },
            include: { credential: true },
          });
          expect(people).toHaveLength(1);
          const [person] = people;
          expect(person).toMatchObject({
            name: account.name,
            role: account.role,
            archivedAt: null,
          });
          expect(person?.credential).toMatchObject({
            failedSignIns: 0,
            lockedUntil: null,
            twoStepLastStep: null,
            passwordChangeRequired: false,
          });
          const { passwordHash, twoStepSecret } = person?.credential ?? {};
          expect(await hasher.verify(account.password, passwordHash ?? '')).toBe(true);
          expect(hasher.stale(passwordHash ?? '')).toBe(false);
          if (account.authenticator === undefined) {
            expect(twoStepSecret).toBeNull();
          } else {
            expect(twoStepSecret).not.toContain(account.authenticator);
            expect(secrets.open(person?.id ?? '', twoStepSecret ?? '')?.toString()).toBe(
              account.authenticator,
            );
          }
        }
        expect(dana.id).toBe(actorId);
        throw undo;
      });
    } catch (error) {
      if (error !== undo) throw error;
    } finally {
      await db.$disconnect();
    }
  });

  it('shows what to sign in with, and the code an authenticator would show', () => {
    const accounts = new DevAccounts({
      hasher: new PasswordHasher(''),
      secrets: new TwoStepSecrets(''),
    });
    const shown = accounts.shown().join('\n');
    for (const { email, password } of devAccounts) {
      expect(shown).toContain(email);
      expect(shown).toContain(password);
    }
    expect(shown.match(/otpauth:\/\/totp\//g)).toHaveLength(2);
    const [dana, , viewer] = devAccounts;
    if (dana === undefined || viewer === undefined) throw new Error('no accounts');
    const now = new Date('2026-10-12T14:00:00Z');
    expect(accounts.codeAt(dana, now)).toBe(
      codes.codeAt(Buffer.from(dana.authenticator ?? ''), Math.floor(now.getTime() / 30_000)),
    );
    expect(accounts.codeAt(viewer, now)).toBeUndefined();
  });
});
