// A lost phone's key revoked after the firm's time, as the worker's pass does it (REQ-214;
// ARCHITECTURE §7.4, §13; spec/acceptance/10-api-and-sync.md AC-10-83; ADR-520, 530). No stack:
// the backstop is handed a database of the test's own. The whole way, on the worker's own login
// and the database's guard, is the story `lost-phone-key`.
import type { Database } from '@open-adms/db';
import { describe, expect, it } from 'vitest';

import type { Reconciliation } from '../src/index.ts';
import { PhoneKeyBackstop } from '../src/phones/phone-keys.ts';
import { JobLoop } from '../src/process/job-loop.ts';
import { WorkerLog } from '../src/process/logs.ts';

const lost = '019a0000-0000-7000-8000-0000000000a1';
const broken = '019a0000-0000-7000-8000-0000000000a2';
const retired = '019a0000-0000-7000-8000-0000000000a3';
// Tuesday 13 October 2026, 6:10 pm in Bayline County.
const now = new Date('2026-10-13T22:10:00Z');

interface Asked {
  readonly hours: number | null;
  readonly due: readonly string[];
  // A phone whose own piece of work fails.
  readonly failing?: string;
  // How the phone is found once its row is locked: as it was read, or changed since.
  readonly found?: { readonly status: string; readonly keyRevokedAt: Date | null };
}

// The firm's settings and its phones as the test says; what each piece of work wrote, by phone.
function heldBy(asked: Asked) {
  const wrote: string[] = [];
  const read: unknown[] = [];
  const db = {
    firmSettings: {
      findUnique: () => Promise.resolve({ phoneKeyRevokedAfterHours: asked.hours }),
    },
    device: {
      findMany: (query: unknown) => {
        read.push(query);
        return Promise.resolve(asked.due.map((id) => ({ id })));
      },
    },
    $write: async (_actor: unknown, work: (tx: unknown) => Promise<boolean>) => {
      let deviceId = '';
      const tx = {
        $queryRaw: (_parts: unknown, id: string) => {
          deviceId = id;
          if (id === asked.failing) return Promise.reject(new Error('the database went away'));
          return Promise.resolve([]);
        },
        device: {
          findUnique: () =>
            Promise.resolve({
              status: 'LOST',
              keyRevokedAt: null,
              ...asked.found,
              outOfServiceMarkedAt: new Date('2026-10-12T22:10:00Z'),
            }),
          updateMany: () => {
            wrote.push(`${deviceId} key`);
            return Promise.resolve({ count: 1 });
          },
        },
        firmSettings: {
          findUnique: () => Promise.resolve({ phoneKeyRevokedAfterHours: asked.hours }),
        },
        numberBlock: {
          updateMany: () => {
            wrote.push(`${deviceId} blocks`);
            return Promise.resolve({ count: 1 });
          },
        },
        securityEvent: {
          createMany: () => {
            wrote.push(`${deviceId} event`);
            return Promise.resolve({ count: 1 });
          },
        },
      };
      return work(tx);
    },
  } as unknown as Database;
  return { db, wrote, read };
}

describe('the backstop', () => {
  it('AC-10-83 revokes each phone due, each in its own piece of work: blocks retired, key revoked, a security event; one that fails never stops the others', async () => {
    const lines: string[] = [];
    const { db, wrote, read } = heldBy({
      hours: 24,
      due: [lost, broken, retired],
      failing: broken,
    });
    const backstop = new PhoneKeyBackstop(
      db,
      new WorkerLog({ write: (line) => lines.push(line) }),
      { now: () => now },
    );
    expect(await backstop.pass()).toEqual({ revoked: [lost, retired], failed: [broken] });
    expect(wrote).toEqual([
      `${lost} blocks`,
      `${lost} key`,
      `${lost} event`,
      `${retired} blocks`,
      `${retired} key`,
      `${retired} event`,
    ]);
    // Due: out of service, key standing, marked the firm's hours ago or earlier.
    expect(read[0]).toMatchObject({
      where: {
        status: { not: 'ACTIVE' },
        keyRevokedAt: null,
        outOfServiceMarkedAt: { lte: new Date('2026-10-12T22:10:00Z') },
      },
    });
    // The log says what happened by the phone's id alone; the failure by its kind, never words.
    const logged = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(logged.map(({ msg, deviceId }) => [msg, deviceId])).toEqual([
      ['A lost phone’s key was revoked after the firm’s time.', lost],
      ['A lost phone’s key could not be revoked; it is tried again.', broken],
      ['A lost phone’s key was revoked after the firm’s time.', retired],
    ]);
    expect(lines.join('\n')).not.toContain('the database went away');
  });

  it('AC-10-83 reads each phone again under its row’s lock: one turned in or put back in service since it was read is left as it is', async () => {
    for (const found of [
      { status: 'LOST', keyRevokedAt: new Date('2026-10-13T22:09:00Z') },
      { status: 'ACTIVE', keyRevokedAt: null },
    ]) {
      const { db, wrote } = heldBy({ hours: 24, due: [lost], found });
      const backstop = new PhoneKeyBackstop(db, new WorkerLog({ write: () => undefined }), {
        now: () => now,
      });
      expect(await backstop.pass(), found.status).toEqual({ revoked: [], failed: [] });
      expect(wrote).toEqual([]);
    }
  });

  it('AC-10-83 off, it reads no phone and revokes nothing', async () => {
    const { db, wrote, read } = heldBy({ hours: null, due: [lost] });
    const backstop = new PhoneKeyBackstop(db, new WorkerLog({ write: () => undefined }), {
      now: () => now,
    });
    expect(await backstop.pass()).toEqual({ revoked: [], failed: [] });
    expect([wrote, read]).toEqual([[], []]);
  });

  it('AC-10-83 runs at each pass of the loop before the projects, and a failure of it never stops them', async () => {
    const order: string[] = [];
    const lines: string[] = [];
    const queue = {
      reconciliationJob: {
        findMany: () => {
          order.push('projects');
          return Promise.resolve([]);
        },
        count: () => Promise.resolve(0),
        aggregate: () => Promise.resolve({ _min: { queuedAt: null } }),
      },
    } as unknown as Database;
    const loop = new JobLoop(
      queue,
      {} as Reconciliation,
      { triesBeforeSetAside: 5, ticketsARun: 200, pollMs: 1_000, stalledAfterMs: 60_000 },
      new WorkerLog({ write: (line) => lines.push(line) }),
      { now: () => now },
      {
        pass: () => {
          order.push('phones');
          return Promise.reject(new Error('the database went away'));
        },
      },
    );
    expect(await loop.pass()).toEqual([]);
    expect(order).toEqual(['phones', 'projects']);
    expect(lines.map((line) => (JSON.parse(line) as { msg: string }).msg)).toEqual([
      'The phones past the firm’s time could not be read.',
    ]);
  });
});
