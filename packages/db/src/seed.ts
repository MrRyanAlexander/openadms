// The seed (ARCHITECTURE §4, §18; ADR-273, 281): what every installation needs in its database
// before any service runs. `pnpm installer` runs it after the migrations, as adms_owner, through
// `prisma db seed` (prisma.config.js). Safe to repeat: it creates what's missing, and stops when
// what it finds isn't what it made. It never prints the connection URL or the passcode's hash.
//
// Today it holds the system actor, the master passcode's own actor, the device key's actor, the
// master passcode's slow hash, the firm's lists' starting values and the firm's settings, started
// from the release's policy values (ADR-530). The firm and the first admin join when their models do (spec/DATA-MODEL.md).
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { parseEnv } from 'node:util';

import {
  brandNameLength,
  PhoneKeyRules,
  Policy,
  readBrandName,
  startingBrandName,
} from '@open-adms/domain';

import { openDatabase, type Database } from './database.ts';
import { deviceKeyActorId, deviceKeyActorName } from './device-key-actor.ts';
import { startingValues } from './list-seeds.ts';
import { masterPasscodeActorId, masterPasscodeActorName } from './master-passcode-actor.ts';
import { systemActor, systemActorId, systemActorName } from './system-actor.ts';
import { atTestDatabase } from './test-database.ts';

export interface SeedOptions {
  // The master passcode's slow hash (Argon2id, a PHC string), for a database that holds none yet.
  // The installer makes it from what the firm typed and hands it over; it's never the passcode.
  readonly masterPasscodeHash?: string;
  // The release's policy values, for what a new installation's settings start as. Read from
  // packages/domain/policy.env when not given.
  readonly policy?: Pick<Policy, 'phoneKeyRevokedAfterHours' | 'monitorSessionHours'>;
  // What the firm calls its ADMS (the installer asks it; the user, 2026-10-22), for an installation
  // whose settings aren't written yet. Not a secret. Without one, the product's own name.
  readonly brandName?: string;
}

// The release's policy values, beside the domain package (the seed runs from src and from dist).
const releasePolicyFile = new URL('../../domain/policy.env', import.meta.url);

export class Seed {
  private readonly db: Database;
  private readonly options: SeedOptions;
  // What the firm calls its ADMS, trimmed (the option, or the product's own name).
  private readonly brandName: string;

  constructor(db: Database, options: SeedOptions = {}) {
    this.db = db;
    this.options = options;
    // A name the database would refuse stops the seed before it writes anything.
    const named = readBrandName(options.brandName ?? startingBrandName);
    if (named === undefined) {
      throw new Error(
        `The name the firm gave its ADMS isn't one: ${String(brandNameLength.shortest)} to ${String(brandNameLength.longest)} characters, no control character. Stopped.`,
      );
    }
    this.brandName = named;
  }

  // What it did, one line per thing, for the installer to show.
  async run(): Promise<string[]> {
    return [
      await this.ensureSystemActor(),
      await this.ensureMasterPasscodeActor(),
      await this.ensureDeviceKeyActor(),
      await this.ensureMasterPasscode(),
      await this.ensureLists(),
      await this.ensureFirmSettings(),
    ];
  }

  // The firm's settings (ADR-530, 531): written once, from the release's policy values, as the system
  // actor. Once there they are the firm's: the seed never changes them.
  private async ensureFirmSettings(): Promise<string> {
    const found = await this.db.firmSettings.findUnique({ where: { id: 1 }, select: { id: true } });
    if (found !== null) return "✓ the firm's settings are kept, as the firm has them";
    const policy =
      this.options.policy ?? Policy.from(parseEnv(readFileSync(releasePolicyFile, 'utf8')));
    const hours = PhoneKeyRules.startingHours(policy);
    const brandName = this.brandName;
    await this.db.$write(systemActor, (tx) =>
      tx.firmSettings.create({
        data: {
          id: 1,
          phoneKeyRevokedAfterHours: hours,
          viewerTwoStepRequired: false,
          monitorSessionHours: policy.monitorSessionHours,
          brandName,
        },
      }),
    );
    return `+ wrote the firm's settings: a lost phone's key revoked ${hours === null ? 'never (off)' : `${String(hours)} hours after its mark`}, two-step optional for read-only viewers, a monitor's sign-in on a phone lasting ${String(policy.monitorSessionHours)} hours, its ADMS called ${brandName}`;
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

  // The actor an act under the master passcode is written as (ADR-438): made by the system
  // actor, as every later row of the seed is. Never a person: no Monitor ID, said outright.
  private async ensureMasterPasscodeActor(): Promise<string> {
    const found = await this.db.user.findUnique({ where: { id: masterPasscodeActorId } });
    if (found === null) {
      await this.db.$write(systemActor, (tx) =>
        tx.user.create({
          data: {
            id: masterPasscodeActorId,
            name: masterPasscodeActorName,
            role: 'MASTER_PASSCODE',
            monitorNumber: null,
          },
        }),
      );
      return `+ created the master passcode's actor, ${masterPasscodeActorName}`;
    }
    if (found.role !== 'MASTER_PASSCODE' || found.name !== masterPasscodeActorName) {
      throw new Error(
        `The master passcode's actor (user ${masterPasscodeActorId}) has been changed: ` +
          `${found.name}, ${found.role}. Its audit records say who changed it. Stopped.`,
      );
    }
    return `✓ the master passcode's actor exists, ${masterPasscodeActorName}`;
  }

  // The actor a phone's own act is written as (ADR-440): made by the system actor, as the
  // master passcode's is. Never a person: no Monitor ID, said outright.
  private async ensureDeviceKeyActor(): Promise<string> {
    const found = await this.db.user.findUnique({ where: { id: deviceKeyActorId } });
    if (found === null) {
      await this.db.$write(systemActor, (tx) =>
        tx.user.create({
          data: {
            id: deviceKeyActorId,
            name: deviceKeyActorName,
            role: 'DEVICE_KEY',
            monitorNumber: null,
          },
        }),
      );
      return `+ created the device key's actor, ${deviceKeyActorName}`;
    }
    if (found.role !== 'DEVICE_KEY' || found.name !== deviceKeyActorName) {
      throw new Error(
        `The device key's actor (user ${deviceKeyActorId}) has been changed: ` +
          `${found.name}, ${found.role}. Its audit records say who changed it. Stopped.`,
      );
    }
    return `✓ the device key's actor exists, ${deviceKeyActorName}`;
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
// Run through prisma.test.config.js (`--test-database`), the same login on the test's database
// that ADMS_TEST_DATABASE names, as that config migrates it; never otherwise, so a name left in a
// shell can't send the installation's seed elsewhere.
function ownerUrl(): string {
  const envFile = new URL('../.env', import.meta.url);
  const installed = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
  const url = installed['DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (url === undefined) throw new Error('No DATABASE_URL: run `pnpm installer`.');
  return process.argv.includes('--test-database') ? atTestDatabase(url) : url;
}

if (import.meta.main) {
  const db = openDatabase({ url: ownerUrl(), maxConnections: 1 });
  try {
    // The installer hands the hash to this process in its environment, never through a file.
    const hash = process.env['ADMS_MASTER_PASSCODE_HASH'];
    // And the name the firm gave its ADMS, the same way: it is no secret, but it is not a file's.
    const brandName = process.env['ADMS_BRAND_NAME'];
    const options = {
      ...(hash === undefined ? {} : { masterPasscodeHash: hash }),
      ...(brandName === undefined ? {} : { brandName }),
    };
    for (const line of await new Seed(db, options).run()) console.log(line);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
