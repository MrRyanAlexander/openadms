// The Prisma client extension that states the actor (BACKLOG 0.3.4; ARCHITECTURE §5.3; ADR-273):
// a write through $write is audited with its actor, a write without one is refused, the actor ends
// with its transaction, and the worker writes as the seeded system actor. Each test connects as the
// service's own login and undoes its work (service.ts).
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '../src/actor.ts';
import type { Database } from '../src/database.ts';
import type { Prisma } from '../src/generated/prisma/client.ts';
import { systemActor, systemActorId, systemActorName } from '../src/system-actor.ts';
import { GuardedDatabase } from './support/database.ts';
import { bayline, openService, p1, p1In, undone } from './support/service.ts';
import { deviceKeyLike } from './support/device-keys.ts';

let api: Database;
let worker: Database;

beforeAll(async () => {
  // Refuses a database that isn't at head or hasn't been seeded.
  await (await GuardedDatabase.open()).close();
  api = openService('api');
  worker = openService('worker');
});

afterAll(async () => {
  await api.$disconnect();
  await worker.$disconnect();
});

interface Stated {
  user: string;
  actor: string;
  source: string;
  device: string;
  reason: string;
  request: string;
}

// Who the database sees writing, as the audit trigger reads it.
async function stated(tx: Prisma.TransactionClient): Promise<Stated> {
  const [row] = await tx.$queryRaw<Stated[]>`SELECT current_user AS "user",
    current_setting('adms.actor_id', true) AS actor, current_setting('adms.source', true) AS source,
    current_setting('adms.device_id', true) AS device, current_setting('adms.reason', true) AS reason,
    current_setting('adms.request_id', true) AS request`;
  if (row === undefined) throw new Error('No settings row.');
  return row;
}

async function refusal(write: Promise<unknown>): Promise<string> {
  try {
    await write;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('Expected the write to be refused, but it ran.');
}

describe('a write through $write is audited with its actor', () => {
  it('a person in the back office, with the reason and the request', async () => {
    // Dana Reyes, the first admin, written with herself as the actor (ADR-270 (4)).
    const dana = randomUUID();
    const actor: Actor = {
      actorId: dana,
      source: 'BACK_OFFICE',
      reason: 'Set up the Hurricane Delphine projects',
      requestId: 'req-0001',
    };
    const { project, records, seen } = await undone(api, actor, async (tx) => {
      await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
      const project = await tx.project.create({ data: await p1In(tx) });
      const records = await tx.auditRecord.findMany({
        where: { recordId: { in: [dana, project.id] } },
        orderBy: { id: 'asc' },
      });
      return { project, records, seen: await stated(tx) };
    });

    expect(seen).toEqual({
      user: 'adms_api',
      actor: dana,
      source: 'BACK_OFFICE',
      device: '',
      reason: 'Set up the Hurricane Delphine projects',
      request: 'req-0001',
    });
    const who = {
      operation: 'INSERT',
      actorId: dana,
      source: 'BACK_OFFICE',
      deviceId: null,
      reason: 'Set up the Hurricane Delphine projects',
      requestId: 'req-0001',
    };
    expect(records).toMatchObject([
      { ...who, tableName: 'user', recordId: dana, domain: 'SECURITY' },
      { ...who, tableName: 'project', recordId: project.id, domain: 'OPERATIONS' },
    ]);
    expect(records[1]?.newValue).toMatchObject({ name: p1.name, time_zone: p1.timeZone });
  });

  it('AC-10-43: the request the work is for, when the service says it and the actor names none', async () => {
    // The API's client is opened with its own answer to "which request is this for?" (ADR-390).
    let now: string | undefined = 'req-0002';
    const forRequests = openService('api', 1, () => now);
    const dana = randomUUID();
    const write = (actor: Actor) =>
      undone(forRequests, actor, async (tx) => {
        await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
        return (await tx.auditRecord.findFirstOrThrow({ where: { recordId: dana } })).requestId;
      });
    try {
      const actor: Actor = { actorId: dana, source: 'BACK_OFFICE' };
      expect(await write(actor)).toBe('req-0002');
      // An actor that states a request keeps its own; outside any request, none is recorded.
      expect(await write({ ...actor, requestId: 'req-0003' })).toBe('req-0003');
      now = undefined;
      expect(await write(actor)).toBeNull();
    } finally {
      await forRequests.$disconnect();
    }
  });

  it('the device it came from: Ana Brooks on her phone', async () => {
    // Dana sets up herself, Ana, the phone, P1 and Ana's assignment; then the same work states Ana
    // on her phone, as the API will for a sync (a test-only restatement: the phone and Ana must
    // exist to be named, and what a login writes can't be deleted, so it all happens in one undone
    // $write). Dana is written without a Monitor ID, so the database issues none here and Ana's
    // example one can't meet it.
    const dana = randomUUID();
    const ana = randomUUID();
    const phone = randomUUID();
    const collection = randomUUID();
    const setup: Actor = { actorId: dana, source: 'BACK_OFFICE' };
    const { records, seen } = await undone(api, setup, async (tx) => {
      await tx.user.create({
        data: { id: dana, name: 'Dana Reyes', role: 'ADMIN', monitorNumber: null },
      });
      await tx.user.create({
        data: { id: ana, name: 'Ana Brooks', role: 'MONITOR', monitorNumber: 'M004127' },
      });
      await tx.device.create({
        data: {
          id: phone,
          name: 'P1-COL-1',
          publicKey: deviceKeyLike('P1-COL-1'),
          masterPasscodeVersion: 1,
        },
      });
      const project = await tx.project.create({ data: await p1In(tx) });
      const assignment = await tx.assignment.create({
        data: {
          personId: ana,
          workDate: new Date('2026-10-12'),
          projectId: project.id,
          fieldEventKinds: ['COLLECTION'],
          deviceId: phone,
          origin: 'PLANNED',
          madeById: dana,
        },
      });
      await tx.$queryRaw`SELECT set_config('adms.actor_id', ${ana}, true),
        set_config('adms.source', 'DEVICE', true), set_config('adms.device_id', ${phone}, true)`;
      await tx.fieldEvent.create({
        data: {
          id: collection,
          projectId: project.id,
          workflow: 'LOAD',
          kind: 'COLLECTION',
          ticketNumber: '101001',
          monitorId: ana,
          source: 'DEVICE',
          deviceId: phone,
          assignmentId: assignment.id,
          setupVersion: 1,
          temporarySession: false,
          numberTyped: false,
          // No certification is in this small world: the number is kept as scanned (ADR-154).
          certNumber: '730415',
          certKeyedByHand: false,
          startedAt: new Date('2026-10-12T08:15:00-04:00'),
          endedAt: new Date('2026-10-12T08:40:00-04:00'),
          deviceUtcOffsetMinutes: -240,
        },
      });
      const records = await tx.auditRecord.findMany({
        where: { recordId: { in: [phone, collection] } },
        orderBy: { id: 'asc' },
      });
      return { records, seen: await stated(tx) };
    });
    expect(seen).toMatchObject({ user: 'adms_api', actor: ana, source: 'DEVICE', device: phone });
    expect(records).toMatchObject([
      {
        tableName: 'device',
        operation: 'INSERT',
        actorId: dana,
        source: 'BACK_OFFICE',
        deviceId: null,
        domain: 'SECURITY',
      },
      {
        tableName: 'field_event',
        operation: 'INSERT',
        actorId: ana,
        source: 'DEVICE',
        deviceId: phone,
        domain: 'RECORDS',
      },
    ]);
  });

  it('an update: the prior value, the new one and the field that changed', async () => {
    const dana = randomUUID();
    const actor: Actor = { actorId: dana, source: 'BACK_OFFICE', reason: 'Wrong time zone' };
    const records = await undone(api, actor, async (tx) => {
      await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
      const { id } = await tx.project.create({
        data: { ...(await p1In(tx)), timeZone: 'America/Chicago' },
      });
      await tx.project.update({ where: { id }, data: { timeZone: 'America/New_York' } });
      return tx.auditRecord.findMany({ where: { recordId: id }, orderBy: { id: 'asc' } });
    });
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({
      operation: 'UPDATE',
      changedFields: ['time_zone'],
      priorValue: { time_zone: 'America/Chicago' },
      newValue: { time_zone: 'America/New_York' },
      actorId: dana,
      reason: 'Wrong time zone',
    });
  });
});

describe('a write without an actor is refused', () => {
  it('outside $write, by the database', async () => {
    const name = `Unattributed ${randomUUID()}`;
    expect(await refusal(api.client.create({ data: { name } }))).toContain(
      'A write to client needs its actor: state adms.actor_id before writing',
    );
    expect(await api.client.count({ where: { name } })).toBe(0);
  });

  it('with an actor who is not a user', async () => {
    const actor: Actor = { actorId: randomUUID(), source: 'BACK_OFFICE' };
    expect(
      await refusal(undone(api, actor, (tx) => tx.client.create({ data: bayline }))),
    ).toContain('audit_record_actor_id_fkey');
  });

  it('the actor ends with its transaction, on the same connection', async () => {
    // One connection, so each step runs where the one before it ran.
    const single = openService('api', 1);
    try {
      // Committed, not undone: a rolled-back transaction would undo even a setting that outlives
      // it. It writes nothing, and its actor is no user, so a leftover could never write either.
      const nobody = randomUUID();
      const first = await single.$write(
        { actorId: nobody, source: 'BACK_OFFICE', reason: 'First', requestId: 'req-0002' },
        (tx) => stated(tx),
      );
      expect(first).toMatchObject({ actor: nobody, reason: 'First', request: 'req-0002' });

      // The next writer states only an actor and a source: nothing of the first one's is left.
      const someone = randomUUID();
      const second = await undone(single, { actorId: someone, source: 'DEVICE' }, (tx) =>
        stated(tx),
      );
      expect(second).toMatchObject({ actor: someone, source: 'DEVICE', device: '', reason: '' });
      expect(second.request).toBe('');

      const name = `Unattributed ${randomUUID()}`;
      expect(await refusal(single.client.create({ data: { name } }))).toContain('needs its actor');
    } finally {
      await single.$disconnect();
    }
  });
});

describe('the worker writes as the system actor', () => {
  it('seeded once by the installer, with itself as the actor', async () => {
    expect(await api.user.findUnique({ where: { id: systemActorId } })).toMatchObject({
      name: systemActorName,
      role: 'SYSTEM',
      monitorNumber: null,
      contractorId: null,
      archivedAt: null,
    });
    expect(await api.auditRecord.findMany({ where: { recordId: systemActorId } })).toMatchObject([
      {
        tableName: 'user',
        operation: 'INSERT',
        actorId: systemActorId,
        source: 'SYSTEM',
        domain: 'SECURITY',
      },
    ]);
  });

  it("the worker's login states it", async () => {
    expect(await undone(worker, systemActor, (tx) => stated(tx))).toEqual({
      user: 'adms_worker',
      actor: systemActorId,
      source: 'SYSTEM',
      device: '',
      reason: '',
      request: '',
    });
  });

  it("the API's own login may not: neither the system actor nor source SYSTEM (ADR-276)", async () => {
    expect(
      await refusal(undone(api, systemActor, (tx) => tx.client.create({ data: bayline }))),
    ).toContain(
      'Only the worker writes as the system actor: adms_api may not state it (a write to client)',
    );
    const dana = randomUUID();
    const claimed: Actor = { actorId: dana, source: 'SYSTEM' };
    expect(
      await refusal(
        undone(api, claimed, (tx) =>
          tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } }),
        ),
      ),
    ).toContain(
      'Only the worker writes with source SYSTEM: adms_api may not state it (a write to user)',
    );
  });

  it("and is still refused what the worker isn't granted", async () => {
    expect(
      await refusal(undone(worker, systemActor, (tx) => tx.client.create({ data: bayline }))),
    ).toContain('permission denied for table client');
  });
});

describe('a service’s own connection is under the statement timeout (ADR-394)', () => {
  it('AC-10-42 the API’s and the worker’s, each as its login finds it on signing in: the policy value', async () => {
    // As the release ships it (packages/domain/policy.env); no secret is in that file.
    const shipped = parseEnv(
      readFileSync(new URL('../../domain/policy.env', import.meta.url), 'utf8'),
    )['STATEMENT_TIMEOUT_MS'];
    for (const service of [api, worker]) {
      const [found] = await service.$read(
        (tx) =>
          tx.$queryRaw<{ login: string; ms: number }[]>`SELECT current_user AS login,
            setting::int AS ms FROM pg_settings WHERE name = 'statement_timeout'`,
      );
      expect(found).toEqual({
        login: service === api ? 'adms_api' : 'adms_worker',
        ms: Number(shipped),
      });
    }
  });
});

describe('$read runs reads in a transaction that can write nothing (ADR-359)', () => {
  it('reads as the service’s own login, with no actor stated', async () => {
    const seen = await worker.$read(async (tx) => ({
      ...(await stated(tx)),
      lists: await tx.siteType.count(),
    }));
    expect(seen.user).toBe('adms_worker');
    expect(seen.actor).toBe('');
    expect(seen.lists).toBeGreaterThan(0);
  });

  it('a write inside it is refused by the database, whoever states the actor', async () => {
    expect(await refusal(api.$read((tx) => tx.client.create({ data: bayline })))).toContain(
      'read-only transaction',
    );
    expect(
      await refusal(
        worker.$read(async (tx) => {
          await tx.$queryRaw`SELECT set_config('adms.actor_id', ${systemActorId}, true),
            set_config('adms.source', 'SYSTEM', true)`;
          await tx.reconciliationRun.create({
            data: { projectId: randomUUID(), trigger: 'SYNC', startedAt: new Date() },
          });
        }),
      ),
    ).toContain('read-only transaction');
    expect(await api.client.count({ where: bayline })).toBe(0);
  });
});
