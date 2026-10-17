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
      aggregate: () => Promise.resolve({ _min: { queuedAt: null } }),
    },
  } as unknown as Database;
  const run = { waitingJobs: () => Promise.resolve(outcome) } as unknown as Reconciliation;
  const lines: string[] = [];
  const loop = new JobLoop(
    queue,
    run,
    { triesBeforeSetAside: 5, ticketsARun: 200, pollMs: 1_000, stalledAfterMs: 60_000 },
    new WorkerLog({ write: (line) => lines.push(line) }),
    { now: () => new Date() },
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

// The health answer as the loop keeps it (BACKLOG 2.7.2 part 4, C38; ADR-507): read as it is
// asked, on the test's own clock, over a queue of the test's own that may be away.
describe('what the worker’s health answer says (ADR-507)', () => {
  const at = (iso: string) => new Date(`2026-10-13T${iso}Z`);

  function world() {
    const clock = { time: at('12:00:00'), now: () => clock.time };
    const queue = {
      away: false,
      waiting: 0,
      setAside: 0,
      oldest: null as Date | null,
      projects: [project],
      // Each run taken up, until the test lets it end.
      held: false,
      ends: [] as (() => void)[],
    };
    const ask = <T>(answer: () => T) =>
      queue.away ? Promise.reject(new Error('connect ECONNREFUSED')) : Promise.resolve(answer());
    const db = {
      reconciliationJob: {
        findMany: () =>
          ask(() => (queue.waiting > 0 ? queue.projects.map((projectId) => ({ projectId })) : [])),
        count: ({ where }: { where: { setAsideAt: unknown } }) =>
          ask(() => (where.setAsideAt === null ? queue.waiting : queue.setAside)),
        aggregate: () => ask(() => ({ _min: { queuedAt: queue.oldest } })),
      },
    } as unknown as Database;
    const run = {
      waitingJobs: async (): Promise<JobsOutcome> => {
        if (queue.held) await new Promise<void>((resolve) => queue.ends.push(resolve));
        return { worked: false, reason: 'NOTHING_WAITING', setAside: [] };
      },
    } as unknown as Reconciliation;
    const loop = new JobLoop(
      db,
      run,
      {
        triesBeforeSetAside: 5,
        ticketsARun: 200,
        pollMs: 5_000,
        stalledAfterMs: JobLoop.stalledAfterMs({
          reconciliationRunLongestMinutes: 10,
          mapServerAnswerSeconds: 30,
          jobQueuePollSeconds: 5,
        }),
      },
      new WorkerLog({ write: () => undefined }),
      clock,
    );
    return { clock, queue, loop };
  }

  const settled = () => new Promise((resolve) => setImmediate(resolve));

  it('the stall bound is twice a run’s longest, a map server’s answer and one wait: 20 min 35 s under the release’s values', () => {
    expect(
      JobLoop.stalledAfterMs({
        reconciliationRunLongestMinutes: 10,
        mapServerAnswerSeconds: 30,
        jobQueuePollSeconds: 5,
      }),
    ).toBe((20 * 60 + 35) * 1_000);
  });

  it('before its first look it is unavailable and says so, with no figures', () => {
    const { loop } = world();
    expect(loop.standing).toEqual({
      status: 'unavailable',
      problem: 'NOT_YET_LOOKED',
      jobsWaiting: null,
      jobsSetAside: null,
      oldestJobWaitingSeconds: null,
    });
  });

  it('after a look it is ok with the queue’s figures; how long the oldest job has waited grows as it is asked, and is 0 with none waiting', async () => {
    const { clock, queue, loop } = world();
    Object.assign(queue, { waiting: 3, setAside: 1, oldest: at('11:58:30') });
    await loop.pass();
    expect(loop.standing).toEqual({
      status: 'ok',
      jobsWaiting: 3,
      jobsSetAside: 1,
      oldestJobWaitingSeconds: 90,
    });
    clock.time = at('12:05:00');
    expect(loop.standing.oldestJobWaitingSeconds).toBe(390);
    Object.assign(queue, { waiting: 0, oldest: null });
    await loop.pass();
    expect(loop.standing).toEqual({
      status: 'ok',
      jobsWaiting: 0,
      jobsSetAside: 1,
      oldestJobWaitingSeconds: 0,
    });
  });

  it('a look that can’t be read (the database away) makes it unavailable, keeping the last figures read; the next look read makes it ok again', async () => {
    const { queue, loop } = world();
    Object.assign(queue, { waiting: 2, oldest: at('12:00:00') });
    await loop.pass();
    queue.away = true;
    await expect(loop.pass()).rejects.toThrow('ECONNREFUSED');
    expect(loop.standing).toEqual({
      status: 'unavailable',
      problem: 'QUEUE_NOT_READ',
      jobsWaiting: 2,
      jobsSetAside: 0,
      oldestJobWaitingSeconds: 0,
    });
    queue.away = false;
    await loop.pass();
    expect(loop.standing.status).toBe('ok');
  });

  it('a database away from the start: unavailable, the queue not read', async () => {
    const { queue, loop } = world();
    queue.away = true;
    await expect(loop.pass()).rejects.toThrow();
    expect(loop.standing).toMatchObject({ status: 'unavailable', problem: 'QUEUE_NOT_READ' });
  });

  it('a run that holds the loop past the bound is a stall; a sign of life a second inside it is not; the run’s end is', async () => {
    const { clock, queue, loop } = world();
    Object.assign(queue, { waiting: 1, held: true });
    const passing = loop.pass();
    await settled();
    clock.time = new Date(at('12:00:00').getTime() + (20 * 60 + 34) * 1_000);
    expect(loop.standing.status).toBe('ok');
    clock.time = new Date(at('12:00:00').getTime() + (20 * 60 + 36) * 1_000);
    expect(loop.standing).toMatchObject({ status: 'unavailable', problem: 'STALLED' });
    queue.ends[0]?.();
    await passing;
    expect(loop.standing.status).toBe('ok');
  });

  it('a pass of two projects whose runs take 15 minutes each: each run begun is a sign, so neither is a stall', async () => {
    const { clock, queue, loop } = world();
    Object.assign(queue, {
      waiting: 2,
      held: true,
      projects: [project, '019a0000-0000-7000-8000-000000000002'],
    });
    const passing = loop.pass();
    await settled();
    clock.time = at('12:15:00');
    queue.ends[0]?.();
    await settled();
    expect(queue.ends).toHaveLength(2);
    clock.time = at('12:30:00');
    expect(loop.standing.status).toBe('ok');
    clock.time = at('12:35:36');
    expect(loop.standing).toMatchObject({ status: 'unavailable', problem: 'STALLED' });
    queue.ends[1]?.();
    await passing;
    expect(loop.standing.status).toBe('ok');
  });

  it('a loop that has never looked and gives no sign past the bound is a stall, whatever else', () => {
    const { clock, loop } = world();
    clock.time = at('12:30:00');
    expect(loop.standing).toMatchObject({ status: 'unavailable', problem: 'STALLED' });
  });
});
