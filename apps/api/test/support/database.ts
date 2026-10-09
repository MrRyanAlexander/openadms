// The installation's database as the API's own login, for a test that must write (ADR-390, 402):
// the settings the installer wrote are read here, never printed, and a test that finds none says
// what to run. What the login writes can't be deleted, so a test's whole work runs inside one
// piece of work that is then undone: the services under test are handed a database whose
// `$write` and `$read` run in that same piece of work, each `$write` stating its own actor and
// the request it is for, as the real one does.
import {
  openDatabase,
  type Actor,
  type Database,
  type Prisma,
  type ViewerDatabase,
} from '@open-adms/db';

import { requestNow } from '../../src/process/boundary.ts';
import { Settings, SettingsProblem } from '../../src/process/settings.ts';

export type Tx = Prisma.TransactionClient;

export function installationSettings(): Settings {
  try {
    return Settings.read({ ADMS_API_HOST: '127.0.0.1', ADMS_API_PORT: '3000' });
  } catch (problem) {
    if (!(problem instanceof SettingsProblem)) throw problem;
    throw new Error('The API has no settings: run `pnpm installer` (after `pnpm local:up`).', {
      cause: problem,
    });
  }
}

export function openInstallation(settings: Pick<Settings, 'databaseUrl'>): Database {
  return openDatabase({ url: settings.databaseUrl, maxConnections: 2 });
}

class Undone extends Error {}

// Runs the test's work in one piece of work, as `starter` (whoever the test's own rows are
// written by), and undoes all of it. `within` is the database to hand the services.
export async function undone(
  db: Database,
  starter: string,
  work: (within: Database, tx: Tx) => Promise<void>,
): Promise<void> {
  const undo = new Undone('undone');
  try {
    await db.$write({ actorId: starter, source: 'BACK_OFFICE' }, async (tx) => {
      const state = async (actor: Actor): Promise<void> => {
        await tx.$queryRaw`SELECT
          set_config('adms.actor_id', ${actor.actorId}, true),
          set_config('adms.source', ${actor.source}, true),
          set_config('adms.device_id', ${actor.deviceId ?? ''}, true),
          set_config('adms.reason', ${actor.reason ?? ''}, true),
          set_config('adms.request_id', ${actor.requestId ?? requestNow() ?? ''}, true)`;
      };
      const within = {
        $write: async <T>(actor: Actor, inner: (tx: Tx) => Promise<T>): Promise<T> => {
          await state(actor);
          return inner(tx);
        },
        $read: <T>(inner: (tx: Tx) => Promise<T>): Promise<T> => inner(tx),
        $disconnect: (): Promise<void> => Promise.resolve(),
      } as unknown as Database;
      await work(within, tx);
      throw undo;
    });
  } catch (error) {
    if (error !== undo) throw error;
  }
}

// A read-only viewer's reads in a test's piece of work (ADR-434). The read-only login can't see
// what a test hasn't committed, so the process is handed this in its place: it keeps who each
// read was stated as, and runs the read in the test's own piece of work, **as the API's login,
// which is shown every row**. A test on it proves who was stated and what the answer holds;
// what the database shows each viewer is proven as the read-only login itself
// (`packages/db/test/viewer.test.ts`, `viewers.test.ts`, `contractor-users.test.ts`).
export class ViewedWithin {
  readonly stated: string[] = [];
  private readonly within: Database;

  constructor(within: Database) {
    this.within = within;
  }

  $viewed<T>(viewerId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    this.stated.push(viewerId);
    return this.within.$read(work);
  }

  $disconnect(): Promise<void> {
    return Promise.resolve();
  }

  asTheProcessHoldsIt(): ViewerDatabase {
    return this as unknown as ViewerDatabase;
  }
}
