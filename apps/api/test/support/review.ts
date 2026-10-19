// What the tests of a reviewer's endpoints share (task 2.4.4; ADR-430, 431): P1 with field events
// a test can make without a phone, a manager/analyst given the permissions a test names, and the
// jobs a request queued.
import type { Database } from '@open-adms/db';
import { expect } from 'vitest';

import {
  BackOfficeRecords,
  type NewBackOfficeFieldEvent,
} from '../../src/review/back-office-records.ts';
import type { Tx } from './database.ts';
import { shippedPolicy } from './process.ts';
import { danasEmail, long, longer, luissEmail, type Answer, type Served } from './served.ts';
import { p1, plainly, told, type Browser } from './setup.ts';

export const reasonNamed = async (tx: Tx, name: string): Promise<string> =>
  (await tx.reason.findFirstOrThrow({ where: { name } })).id;

type Kind = NewBackOfficeFieldEvent['kind'];

const workflowOf = (kind: Kind) =>
  kind === 'UNIT_RATE' ? 'UNIT_RATE' : kind.startsWith('HAUL_OUT') ? 'HAUL_OUT' : 'LOAD';

// P1 as Dana entered it, with two field events she created in the back office because a phone
// failed (ADR-156): the collection of load 101031 and the unit rate ticket 301001. Neither has
// been worked: both are PENDING. `created` makes another the same way.
export async function p1WithTickets(api: Served, tx: Tx, within: Database, who: { dana: string }) {
  const dana = await api.signedIn(danasEmail, long);
  const { project } = await p1(api, dana, tx);
  const records = new BackOfficeRecords(within, api.clock, shippedPolicy);
  const created = async (
    kind: Kind,
    ticketNumber: string,
    more: Partial<NewBackOfficeFieldEvent> = {},
  ) => {
    const outcome = await records.fieldEvent(who.dana, {
      projectId: project.id,
      workflow: workflowOf(kind),
      kind,
      ticketNumber,
      splitSuffix: '',
      monitorId: who.dana,
      certNumber: '730415',
      certKeyedByHand: false,
      siteId: null,
      startedAt: new Date('2026-10-14T18:10:00Z'),
      endedAt: new Date('2026-10-14T18:40:00Z'),
      deviceUtcOffsetMinutes: -240,
      endLatitude: null,
      endLongitude: null,
      address: null,
      addressSource: null,
      notes: null,
      formDebrisTypeId: null,
      fieldTagId: null,
      roeNumber: null,
      estimateCy: null,
      loadCall: null,
      scaleReceiptId: null,
      carriedCount: null,
      kindOfWorkId: null,
      payableTypeId: null,
      payItemId: null,
      unitCount: null,
      measurementInches: null,
      measuredAs: null,
      rootBallInches: null,
      rootBallHalfExposed: null,
      surveyNumber: null,
      markedIneligible: null,
      items: [],
      carriedTickets: [],
      waypoints: [],
      reasonId: await reasonNamed(tx, 'Device failed'),
      ...more,
    });
    if (!outcome.saved) throw new Error(outcome.refusal.message);
    return outcome.record.record;
  };
  return {
    dana,
    project,
    ids: { projectId: project.id },
    created,
    collection: await created('COLLECTION', '101031'),
    unitRate: await created('UNIT_RATE', '301001'),
  };
}

export async function luisHolds(
  api: Served,
  tx: Tx,
  luis: string,
  ...held: string[]
): Promise<Browser> {
  for (const permission of held) {
    await tx.userPermission.create({ data: { userId: luis, permission: permission as 'VOID' } });
  }
  return api.signedIn(luissEmail, longer);
}

// The jobs a person's requests queued on a project, oldest first: each its trigger and tickets.
export const jobsFor = async (tx: Tx, projectId: string, requestedById: string) =>
  (
    await tx.reconciliationJob.findMany({
      where: { projectId, requestedById },
      orderBy: { id: 'asc' },
      select: { trigger: true, tickets: { select: { workflow: true, ticketNumber: true } } },
    })
  ).map(({ trigger, tickets }) => [
    trigger,
    ...tickets.map(({ workflow, ticketNumber }) => `${workflow} ${ticketNumber}`).sort(),
  ]);

// An id as the database makes one, for a record a phone would have made.
export const newId = async (tx: Tx): Promise<string> => {
  const [made] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS id`;
  return made?.id ?? '';
};

// A refusal by the request's schema: a plain code, the request's id and which field, in words.
export function notTaken(answer: Answer): string {
  expect(told(answer)).toEqual([400, 'BAD_REQUEST']);
  return plainly(answer);
}

// What a request changed in one table, as the audit log keeps it.
export const audited = async (tx: Tx, answer: Answer, tableName: string) =>
  (
    await tx.auditRecord.findMany({
      where: { requestId: answer.requestId, tableName },
      orderBy: { id: 'asc' },
    })
  ).map(({ operation, actorId, source, reason, priorValue }) => ({
    operation,
    actorId,
    source,
    reason,
    before: priorValue as Record<string, unknown> | null,
  }));
