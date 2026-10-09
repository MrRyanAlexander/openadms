// The seed (ARCHITECTURE §4, §18; ADR-273, 281): what every installation needs in its database
// before any service runs. `pnpm installer` runs it after the migrations, as adms_owner, through
// `prisma db seed` (prisma.config.js). Safe to repeat: it creates what's missing, and stops when
// what it finds isn't what it made. It never prints the connection URL or the passcode's hash.
//
// Today it holds the system actor, the master passcode's slow hash and the firm's lists' starting
// values. The firm and the first admin join when their models do (spec/DATA-MODEL.md).
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { parseEnv } from 'node:util';

import { openDatabase, type Database } from './database.ts';
import { startingValues } from './list-seeds.ts';
import { systemActor, systemActorId, systemActorName } from './system-actor.ts';

export interface SeedOptions {
  // The master passcode's slow hash (Argon2id, a PHC string), for a database that holds none yet.
  // The installer makes it from what the firm typed and hands it over; it's never the passcode.
  readonly masterPasscodeHash?: string;
}

export class Seed {
  private readonly db: Database;
  private readonly options: SeedOptions;

  constructor(db: Database, options: SeedOptions = {}) {
    this.db = db;
    this.options = options;
  }

  // What it did, one line per thing, for the installer to show.
  async run(): Promise<string[]> {
    return [
      await this.ensureSystemActor(),
      await this.ensureMasterPasscode(),
      await this.ensureLists(),
    ];
  }

  // Written with itself as the actor, as the first user is (ADR-270 (4)). Never a person: no
  // Monitor ID, said outright so the database doesn't issue one (ADR-281).
  private async ensureSystemActor(): Promise<string> {
    const found = await this.db.user.findUnique({ where: { id: systemActorId } });
    if (found === null) {
      await this.db.$write(systemActor, (tx) =>
        tx.user.create({
          data: { id: systemActorId, name: systemActorName, role: 'SYSTEM', monitorNumber: null },
        }),
      );
      return `+ created the system actor, ${systemActorName}`;
    }
    if (found.role !== 'SYSTEM' || found.name !== systemActorName || found.archivedAt !== null) {
      throw new Error(
        `The system actor (user ${systemActorId}) has been changed: ${found.name}, ${found.role}` +
          `${found.archivedAt === null ? '' : ', archived'}. Its audit records say who changed it. Stopped.`,
      );
    }
    return `✓ the system actor exists, ${systemActorName}`;
  }

  // The firm's one master passcode (ADR-106), kept in the database as its slow hash, version 1
  // (ARCHITECTURE §7.5; C12). Later versions are the firm's own changes; the seed never adds one.
  private async ensureMasterPasscode(): Promise<string> {
    const current = await this.db.masterPasscode.findFirst({
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    if (current !== null) {
      return `✓ the master passcode's slow hash is kept, version ${String(current.version)}`;
    }
    const hash = this.options.masterPasscodeHash;
    if (hash === undefined) {
      throw new Error(
        'The database holds no master passcode, and the seed was given none. ' +
          'Run `pnpm installer`: it asks for the passcode and hands over its slow hash. Stopped.',
      );
    }
    try {
      await this.db.$write(systemActor, (tx) =>
        tx.masterPasscode.create({ data: { version: 1, hash } }),
      );
    } catch {
      // The database's own words could quote the row, so they aren't passed on.
      throw new Error(
        "The database refused the master passcode's slow hash (it takes only an Argon2id hash). Stopped.",
      );
    }
    return "+ kept the master passcode's slow hash in the database, version 1";
  }

  // The firm's lists (spec/LISTS.md; ADR-194, 302), all in one piece of work, as the system actor.
  // An empty list gets its starting values. A list that holds anything is the firm's by now: its
  // names, order and archived values are left exactly as they are, and it gets only a built-in
  // value it lacks, which is how a release adds one to an installation already in use.
  private async ensureLists(): Promise<string> {
    const held = { key: true, position: true } as const;
    const added = await this.db.$write(systemActor, async (tx) => {
      let itemNamesAdded = 0;
      const lists = [
        await this.start(
          startingValues.programTypes,
          await tx.programType.findMany({ select: held }),
          (data) => tx.programType.createMany({ data }),
        ),
        await this.start(
          startingValues.declarationReferenceTypes,
          await tx.declarationReferenceType.findMany({ select: held }),
          (data) => tx.declarationReferenceType.createMany({ data }),
        ),
        await this.start(
          startingValues.debrisTypes,
          await tx.debrisType.findMany({ select: held }),
          (data) => tx.debrisType.createMany({ data }),
        ),
        await this.start(
          startingValues.reductionMethods,
          await tx.reductionMethod.findMany({ select: held }),
          (data) => tx.reductionMethod.createMany({ data }),
        ),
        await this.start(
          startingValues.payableTypes,
          await tx.payableType.findMany({ select: held }),
          (data) => tx.payableType.createMany({ data }),
        ),
        // A kind of work is written with its item names, so one at a time.
        await this.start(
          startingValues.kindsOfWork,
          await tx.kindOfWork.findMany({ select: held }),
          async (data) => {
            for (const { items, ...kind } of data) {
              const itemNames = items.map((name, index) => ({ name, position: index + 1 }));
              await tx.kindOfWork.create({ data: { ...kind, itemNames: { create: itemNames } } });
              itemNamesAdded += itemNames.length;
            }
          },
        ),
        await this.start(
          startingValues.vehicleTypes,
          await tx.vehicleType.findMany({ select: held }),
          (data) => tx.vehicleType.createMany({ data }),
        ),
        await this.start(
          startingValues.vehicleFeatures,
          await tx.vehicleFeature.findMany({ select: held }),
          (data) => tx.vehicleFeature.createMany({ data }),
        ),
        await this.start(
          startingValues.crewTypes,
          await tx.crewType.findMany({ select: held }),
          (data) => tx.crewType.createMany({ data }),
        ),
        await this.start(
          startingValues.siteTypes,
          await tx.siteType.findMany({ select: held }),
          (data) => tx.siteType.createMany({ data }),
        ),
        await this.start(
          startingValues.incidentTypes,
          await tx.incidentType.findMany({ select: held }),
          (data) => tx.incidentType.createMany({ data }),
        ),
        await this.start(
          startingValues.reasons,
          await tx.reason.findMany({ select: held }),
          (data) =>
            tx.reason.createMany({ data: data.map((row) => ({ ...row, uses: [...row.uses] })) }),
        ),
        await this.start(
          startingValues.surveyWorkTypes,
          await tx.surveyWorkType.findMany({ select: held }),
          (data) => tx.surveyWorkType.createMany({ data }),
        ),
        await this.start(
          startingValues.clockActivities,
          await tx.clockActivity.findMany({ select: held }),
          (data) => tx.clockActivity.createMany({ data }),
        ),
      ];
      return lists.reduce((sum, count) => sum + count, itemNamesAdded);
    });
    return added === 0
      ? "✓ the firm's lists are as the firm keeps them, each built-in value in place"
      : `+ wrote ${String(added)} values to the firm's lists (an empty list's starting values; a built-in value a list lacked)`;
  }

  // Writes what one list is owed, after the values it holds, and says how many that was.
  private async start<Value extends { readonly name: string; readonly key?: string }>(
    values: readonly Value[],
    held: readonly { key: string | null; position: number }[],
    add: (rows: (Value & { position: number })[]) => Promise<unknown>,
  ): Promise<number> {
    const keys = new Set(held.map((row) => row.key));
    const owed =
      held.length === 0
        ? values
        : values.filter((value) => value.key !== undefined && !keys.has(value.key));
    if (owed.length === 0) return 0;
    const last = Math.max(0, ...held.map((row) => row.position));
    await add(owed.map((value, index) => ({ ...value, position: last + index + 1 })));
    return owed.length;
  }
}

// adms_owner's URL, from the .env beside the package (the installer writes it), as prisma.config.js.
function ownerUrl(): string {
  const envFile = new URL('../.env', import.meta.url);
  const installed = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
  const url = installed['DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (url === undefined) throw new Error('No DATABASE_URL: run `pnpm installer`.');
  return url;
}

if (import.meta.main) {
  const db = openDatabase({ url: ownerUrl(), maxConnections: 1 });
  try {
    // The installer hands the hash to this process in its environment, never through a file.
    const hash = process.env['ADMS_MASTER_PASSCODE_HASH'];
    const options = hash === undefined ? {} : { masterPasscodeHash: hash };
    for (const line of await new Seed(db, options).run()) console.log(line);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
