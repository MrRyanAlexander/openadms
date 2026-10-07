// `pnpm local:accounts`: writes the dev stack's own accounts into this machine's installation
// (dev-accounts.ts; ADR-170, 412), or puts them back as they are written there, and shows what
// to sign in with. `pnpm local:accounts --show` only shows. It needs the installation
// (`pnpm local:up`, `pnpm installer`) and refuses a database that isn't on this machine.
//
// What it prints is in the repository for anybody to read: these are no firm's secrets. It
// never prints a setting of the installation.
import { PasswordHasher, Settings, TwoStepSecrets } from '@open-adms/api';
import { openDatabase } from '@open-adms/db';

import { DevAccounts } from './dev-accounts.ts';

async function main(show: boolean): Promise<number> {
  const out = (line: string): void => void process.stdout.write(`${line}\n`);
  if (show) {
    // Shown without the installation: nothing here depends on its settings.
    const accounts = new DevAccounts({
      hasher: new PasswordHasher(''),
      secrets: new TwoStepSecrets(''),
    });
    for (const line of accounts.shown()) out(line);
    return 0;
  }
  const settings = Settings.read({ ADMS_API_HOST: '127.0.0.1', ADMS_API_PORT: '3000' });
  if (!DevAccounts.allowed(settings.databaseUrl, process.env)) {
    out('Refused: the dev accounts are written only to a database on this machine.');
    return 1;
  }
  const accounts = new DevAccounts({
    hasher: new PasswordHasher(settings.tokenSigningSecret),
    secrets: new TwoStepSecrets(settings.tokenSigningSecret),
  });
  const db = openDatabase({ url: settings.databaseUrl, maxConnections: 1 });
  try {
    const actorId = await db.$read((tx) => accounts.actor(tx));
    await db.$write({ actorId, source: 'BACK_OFFICE' }, (tx) => accounts.writeIn(tx, actorId));
  } finally {
    await db.$disconnect();
  }
  out('The dev accounts are written. They are for this machine only:');
  for (const line of accounts.shown()) out(line);
  return 0;
}

process.exitCode = await main(process.argv.includes('--show'));
