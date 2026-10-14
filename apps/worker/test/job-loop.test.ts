// What the worker's job loop logs of a job set aside (ARCHITECTURE §6, Logs; §13; BACKLOG 2.7.1
// piece 4b2, C146; ADR-419, 498): an error line a job, by the fixed code `JOB_SET_ASIDE` a filter
// on the log finds, saying what queued it, how many tickets it names, how many tries it had and
// the kind of failure; never the error's words, a ticket's number or a person. No stack: the
// loop is handed a queue and a run of the test's own (the story `p1-queued` runs it on the
// database).
import type { Database } from '@open-adms/db';
import { describe, expect, it } from 'vitest';

import type { JobsOutcome, Reconciliation } from '../src/index.ts';
import { JobLoop } from '../src/process/job-loop.ts';
import { WorkerLog } from '../src/process/logs.ts';

const project = '019a0000-0000-7000-8000-000000000001';
const doomed = '019a0000-0000-7000-8000-00000000000a';
const silent = '019a0000-0000-7000-8000-00000000000b';
const worked = '019a0000-0000-7000-8000-00000000000c';

// The jobs as the queue keeps them: what queued each, its tries and how many tickets it names.
const kept = new Map([
  [doomed, { id: doomed, trigger: 'CORRECTION', attempts: 5, _count: { tickets: 3 } }],
  // Taken up seven times: the policy's number was lowered since.
  [silent, { id: silent, trigger: 'SYNC', attempts: 7, _count: { tickets: 1 } }],
  [worked, { id: worked, trigger: 'SETUP_CHANGE', attempts: 1, _count: { tickets: 2 } }],
]);

// A queue with one project waiting, whose run answers `outcome`; and what the loop logged.
async function passed(outcome: JobsOutcome): Promise<Record<string, unknown>[]> {
  const queue = {
    reconciliationJob: {
      findMany: ({ where }: { where: { id?: { in: string[] } } }) =>
        Promise.resolve(
          where.id === undefined
            ? [{ projectId: project }]
            : // In id order, as the loop asks for them.
              where.id.in
                .flatMap((id) => kept.get(id) ?? [])
                .sort((a, b) => a.id.localeCompare(b.id)),
        ),
      count: () => Promise.resolve(0),
    },
  } as unknown as Database;
  const run = { waitingJobs: () => Promise.resolve(outcome) } as unknown as Reconciliation;
  const lines: string[] = [];
  const loop = new JobLoop(
    queue,
    run,
    { triesBeforeSetAside: 5, ticketsARun: 200, pollMs: 1_000 },
    new WorkerLog({ write: (line) => lines.push(line) }),
  );
  await loop.pass();
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

const setAsideLines = (lines: readonly Record<string, unknown>[]) =>
  lines
    .filter((line) => line['code'] === 'JOB_SET_ASIDE')
    .map(({ level, service, msg, time, ...fields }) => {
      expect([level, service, msg, typeof time]).toEqual([
        50,
        'worker',
        'A job was set aside after too many tries: it is kept, and waits for a person to put it back.',
        'number',
      ]);
      return fields;
    });

describe('a job set aside is an error a filter finds (ADR-498)', () => {
  it('a try that failed whole on its last try: the job’s line says what queued it, its tickets, its tries and the error’s kind and code, never its words', async () => {
    const lines = await passed({
      worked: false,
      reason: 'FAILED',
      error: 'Transaction already closed: ticket 101003 for Coastline Haulers LLC',
      failure: { kind: 'PrismaClientKnownRequestError', code: 'P2028' },
      jobs: [doomed],
      setAside: [doomed],
    });
    expect(setAsideLines(lines)).toEqual([
      {
        code: 'JOB_SET_ASIDE',
        projectId: project,
        jobId: doomed,
        trigger: 'CORRECTION',
        tickets: 3,
        tries: 5,
        failure: 'RUN_FAILED',
        failureKind: 'PrismaClientKnownRequestError',
        failureCode: 'P2028',
      },
    ]);
    // The try's own line is a warning still; neither holds the error's words.
    expect(lines.map((line) => line['level'])).toEqual([40, 50]);
    expect(JSON.stringify(lines)).not.toMatch(/Transaction already closed|101003|Coastline/);
  });

  it('a job found spent as the worker came for it (its last try never said how it went) and one set aside by a failed try, side by side: a line each, the spent one stopped without a word', async () => {
    const lines = await passed({
      worked: false,
      reason: 'FAILED',
      error: 'The clock stopped.',
      failure: { kind: 'Error' },
      jobs: [doomed],
      setAside: [silent, doomed],
    });
    expect(setAsideLines(lines)).toEqual([
      {
        code: 'JOB_SET_ASIDE',
        projectId: project,
        jobId: doomed,
        trigger: 'CORRECTION',
        tickets: 3,
        tries: 5,
        failure: 'RUN_FAILED',
        failureKind: 'Error',
      },
      {
        code: 'JOB_SET_ASIDE',
        projectId: project,
        jobId: silent,
        trigger: 'SYNC',
        tickets: 1,
        tries: 7,
        failure: 'STOPPED_WITHOUT_A_WORD',
      },
    ]);
  });

  it('a run that worked its jobs, or found nothing waiting, and set a spent job aside: that job’s line alone; a pass that set none aside logs no such line', async () => {
    const run = {
      runId: '019a0000-0000-7000-8000-0000000000ff',
      ticketsDone: 2,
      ticketsFailed: 0,
      tickets: [],
      pending: [],
    } as const;
    const spent = { failure: 'STOPPED_WITHOUT_A_WORD', tickets: 1, tries: 7, trigger: 'SYNC' };
    expect(
      setAsideLines(await passed({ worked: true, run, jobs: [worked], setAside: [silent] })),
    ).toEqual([{ code: 'JOB_SET_ASIDE', projectId: project, jobId: silent, ...spent }]);
    expect(
      setAsideLines(await passed({ worked: false, reason: 'NOTHING_WAITING', setAside: [silent] })),
    ).toEqual([{ code: 'JOB_SET_ASIDE', projectId: project, jobId: silent, ...spent }]);
    const quiet = await passed({ worked: true, run, jobs: [worked], setAside: [] });
    expect(quiet.map((line) => [line['level'], line['code']])).toEqual([[30, undefined]]);
  });
});
