// A service's own Prisma client, for the tests of the actor extension (BACKLOG 0.3.4; ADR-273).
// Unlike the guard tests' way in (database.ts), these connect as the login itself, with the URL
// the installer wrote into the service's env file, read in this process and never printed: the
// same file, login and extension the API and the worker will use. What they write can't be
// deleted, so every test's work runs inside $write and is then undone by throwing out of it.
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { parseEnv } from 'node:util';

import type { Actor } from '../../src/actor.ts';
import { openDatabase, type Database } from '../../src/database.ts';
import type { Prisma } from '../../src/generated/prisma/client.ts';

export type Service = 'api' | 'worker';

const root = new URL('../../../../', import.meta.url);

// Opens the service's client on the installation's database (or ADMS_TEST_DATABASE, as the guard
// tests do). The guard tests' GuardedDatabase.open() has already refused a stale database.
export function openService(
  service: Service,
  maxConnections = 2,
  requestNow?: () => string | undefined,
): Database {
  const envFile = new URL(`apps/${service}/.env`, root);
  if (!existsSync(envFile)) {
    throw new Error(`apps/${service}/.env is missing: run \`pnpm installer\`.`);
  }
  const written = parseEnv(readFileSync(envFile, 'utf8'))['DATABASE_URL'];
  if (written === undefined) throw new Error(`apps/${service}/.env has no DATABASE_URL.`);
  const url = new URL(written);
  const database = process.env['ADMS_TEST_DATABASE'];
  if (database !== undefined) url.pathname = `/${database}`;
  return openDatabase({
    url: url.toString(),
    maxConnections,
    ...(requestNow === undefined ? {} : { requestNow }),
  });
}

class Undone extends Error {}

// Runs the work through $write, as the actor, and then undoes all of it; returns what it returned.
export async function undone<T>(
  db: Database,
  actor: Actor,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const undo = new Undone('undone');
  let result: { value: T } | undefined;
  try {
    await db.$write(actor, async (tx) => {
      result = { value: await work(tx) };
      throw undo;
    });
  } catch (error) {
    if (error !== undo) throw error;
  }
  if (result === undefined) throw new Error('The work did not finish.');
  return result.value;
}

export const p1 = { name: 'Bayline County ROW, Hurricane Delphine', timeZone: 'America/New_York' };
export const bayline = { name: 'Bayline County' };

// P1 as it is written (the golden mission §1): under its client and declaration event, made in the
// same work, its program type and the declaration's reference type picked from the firm's lists.
export async function p1In(
  tx: Prisma.TransactionClient,
): Promise<Prisma.ProjectUncheckedCreateInput> {
  const client = await tx.client.create({ data: bayline });
  const referenceType = await tx.declarationReferenceType.findFirstOrThrow({
    where: { name: 'FEMA disaster (DR)' },
  });
  const declarationEvent = await tx.declarationEvent.create({
    data: {
      name: 'Hurricane Delphine',
      reference: 'DR-9001-FL',
      referenceTypeId: referenceType.id,
    },
  });
  const row = await tx.programType.findFirstOrThrow({ where: { name: 'ROW' } });
  return {
    ...p1,
    clientId: client.id,
    declarationEventId: declarationEvent.id,
    programTypeId: row.id,
    allowSplitLoads: true,
    activeFrom: new Date('2026-10-12'),
    activeTo: new Date('2027-01-31'),
    ticketNumberSource: 'GENERATED',
    workflows: ['LOAD', 'HAUL_OUT', 'UNIT_RATE'],
    loadCallLowLimit: 5,
    loadCallHighLimit: 95,
    stumpFillDepthInches: 31,
    stumpCheckRootBallWider: true,
    stumpCheckFillNeedsExposure: true,
    siteCircleMeters: 200,
    timeClockEnabled: false,
  };
}
