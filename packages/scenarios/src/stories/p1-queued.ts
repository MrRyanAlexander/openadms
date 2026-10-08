// The seventeenth story (BACKLOG 2.3.2; ADR-418, 419; spec/acceptance/10-api-and-sync.md
// AC-10-52, 53, 54; spec/THREAT-MODEL.md T-30, T-34): the worker takes up its project's waiting
// jobs. P1's Monday and Tuesday are the story `p1-field-days`' own, priced as the story
// `p1-priced` prices them, and worked once whole, as a story's run does.
//
// Then every run here is one the queue starts: a job is added as the API's own login, inside a
// piece of work, by whoever asks (Luis Ortega, Dana Reyes); the worker takes the project's
// waiting jobs up under its lock, works the tickets they name and no other, and finishes each
// job under its run. A try that fails whole is counted, and a job is set aside after the
// policy's number of tries. The last step is the process's own pass over the queue.
//
// Not here: which change queues which tickets (2.3.3: here the story names them), a sync's own
// job (2.6.2), and the worker's container (the local stack's; `apps/worker/test`).
import { ReconciliationJobs, systemActorId, type ReconciliationTrigger } from '@open-adms/db';
import {
  JobLoop,
  MapServers,
  Mileages,
  Reconciliation,
  stoppedWithoutAWord,
  WaitingJobs,
  WorkerLog,
  type JobsOutcome,
} from '@open-adms/worker';

import { localMapServers } from '../map-servers.ts';
import type { Story } from '../runner.ts';
import { certifyP1, loadP1Map, p1FieldDaysHeld, P1Syncs, setUpP1Pricing } from './p1-office.ts';
import { p1TimeZone as timeZone } from './p1.ts';

const on = (date: string, time: string): string => `2026-10-${date}T${time}:00-04:00`;

export const p1Queued: Story = {
  name: 'p1-queued',
  title:
    'The worker takes up its project’s waiting jobs: one run at a time under the project’s lock; only the tickets the jobs name are worked, each once; each job is finished under its run; a second run over unchanged work writes nothing; a try that fails whole is counted and the job set aside after five',
  timeZone,
  start: on('08', '08:00'),

  async run(story) {
    const { api, worker, clock } = story;
    const office = await p1FieldDaysHeld(story);
    const { held, dana, luis, p1 } = office;

    story.at(on('08', '08:40'), 'Thursday: Dana loads P1’s map and enters its pay items and rules');
    await loadP1Map(story, office);
    await setUpP1Pricing(story, office);
    story.at(
      on('10', '09:10'),
      'Saturday: Sam Grant certifies P1’s three containers and two crews',
    );
    await certifyP1(story, office);

    const tries = story.policy.jobTriesBeforeSetAside;
    const settings = { crewItemHoursLimit: story.policy.crewDayHours, longestRunMs: 600_000 };
    const mileages = new Mileages(new MapServers(localMapServers()));
    const reconciliation = new Reconciliation(worker, clock, settings, mileages);

    const names = new Map<string | null, string>([
      [dana, 'Dana'],
      [luis, 'Luis'],
      [systemActorId, 'system'],
    ]);
    const load = (ticketNumber: string) => ({ workflow: 'LOAD', ticketNumber }) as const;
    // A job, added as the API's own login in a piece of work of the person who asks.
    const queued = (
      by: string,
      trigger: ReconciliationTrigger,
      ...ticketNumbers: string[]
    ): Promise<string> =>
      api.$write({ actorId: by, source: 'BACK_OFFICE' }, (tx) =>
        new ReconciliationJobs(tx).queue({
          projectId: p1,
          trigger,
          requestedById: by,
          tickets: ticketNumbers.map(load),
        }),
      );
    const jobOf = async (id: string) => {
      const job = await api.reconciliationJob.findUniqueOrThrow({ where: { id } });
      return {
        attempts: job.attempts,
        finished: job.finishedAt !== null,
        run: job.reconciliationRunId,
        lastError: job.lastError,
        setAside: job.setAsideAt !== null,
      };
    };
    const runOf = async (id: string) => {
      const run = await api.reconciliationRun.findUniqueOrThrow({
        where: { id },
        include: { decisions: { orderBy: { ticketNumber: 'asc' } } },
      });
      return {
        trigger: run.trigger,
        askedBy: names.get(run.requestedById) ?? null,
        finished: run.finishedAt !== null,
        decided: run.decisions.map((decision) => `${decision.ticketNumber} ${decision.status}`),
      };
    };
    // What the audit log holds of a job: who, from where, what was done to which columns.
    const auditOf = async (recordId: string): Promise<string[]> =>
      (
        await api.auditRecord.findMany({
          where: { tableName: 'reconciliation_job', recordId },
          orderBy: { id: 'asc' },
        })
      ).map((record) =>
        [
          names.get(record.actorId) ?? record.actorId,
          record.source,
          record.operation,
          ...(record.operation === 'UPDATE' ? [record.changedFields.join(', ')] : []),
        ].join(' · '),
      );
    // Everything the worker concludes and the audit log holds of it, the queue's and the runs'
    // own records apart: what must not move when unchanged work is run again.
    const concluded = async (): Promise<number[]> => [
      await api.transaction.count({ where: { projectId: p1 } }),
      await api.flag.count({ where: { projectId: p1 } }),
      await api.completedLoad.count({ where: { projectId: p1 } }),
      await api.auditRecord.count({
        where: {
          tableName: {
            notIn: [
              'reconciliation_run',
              'reconciliation_decision',
              'reconciliation_job',
              'reconciliation_job_ticket',
            ],
          },
        },
      }),
    ];
    const runs = (): Promise<number> => api.reconciliationRun.count({ where: { projectId: p1 } });
    const worked = (outcome: JobsOutcome): Extract<JobsOutcome, { worked: true }> => {
      if (!outcome.worked) throw new Error(`The jobs were not worked: ${outcome.reason}.`);
      return outcome;
    };
    const ticketsOf = (outcome: Extract<JobsOutcome, { worked: true }>): string[] =>
      outcome.run.tickets.map((ticket) => `${ticket.ticketNumber} ${ticket.status}`);

    // ------------------------------------------------------------------------------------------
    const phones = new P1Syncs(story, held);
    for (const syncedAt of phones.times) {
      story.at(syncedAt.toISOString(), 'The phones find signal');
      await phones.arrive(syncedAt);
    }
    story.at(on('14', '07:20'), 'Wednesday: a run works every ticket of P1, as a story’s run does');
    const whole = await reconciliation.run({ projectId: p1, trigger: 'SYNC' });
    if (!whole.ran) throw new Error(whole.message);
    story.check(
      'With no job waiting, the worker finds nothing to take up for P1: no run is recorded',
      [await reconciliation.waitingJobs(p1, tries), await runs()],
      [{ worked: false, reason: 'NOTHING_WAITING', setAside: [] }, 1],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '09:00'),
      'Luis asks for 101001 and 101003 to be reprocessed: one job, naming the two',
    );
    const before = await concluded();
    const first = await queued(luis, 'REPROCESS', '101001', '101003');
    story.check('The job waits: no try yet, not finished, not set aside', await jobOf(first), {
      attempts: 0,
      finished: false,
      run: null,
      lastError: null,
      setAside: false,
    });
    story.at(on('14', '09:01'), 'The worker takes P1’s waiting job up');
    const firstRun = worked(await reconciliation.waitingJobs(p1, tries));
    story.check(
      'AC-10-54 the run works the two tickets the job names and no other: P1’s other tickets get no decision from it',
      [ticketsOf(firstRun), await runOf(firstRun.run.runId), whole.tickets.length > 2],
      [
        ['101001 COMPLETED', '101003 MANUAL_REVIEW'],
        {
          trigger: 'REPROCESS',
          askedBy: 'Luis',
          finished: true,
          decided: ['101001 COMPLETED', '101003 MANUAL_REVIEW'],
        },
        true,
      ],
    );
    story.check(
      'The job is finished under that run, after one try; the audit log holds Luis adding it and the worker, as the system actor, counting its try and finishing it',
      [firstRun.jobs, await jobOf(first), await auditOf(first)],
      [
        [first],
        { attempts: 1, finished: true, run: firstRun.run.runId, lastError: null, setAside: false },
        [
          'Luis · BACK_OFFICE · INSERT',
          'system · SYSTEM · UPDATE · attempts',
          'system · SYSTEM · UPDATE · finished_at, reconciliation_run_id',
        ],
      ],
    );
    story.check(
      'AC-10-53 the tickets and the setup had not changed: the run wrote no line, no flag, no completed load and no audit record of any',
      await concluded(),
      before,
    );

    story.at(on('14', '09:10'), 'Luis asks for the same two again; nothing has changed since');
    const second = await queued(luis, 'REPROCESS', '101001', '101003');
    const secondRun = worked(await reconciliation.waitingJobs(p1, tries));
    story.check(
      'AC-10-53 worked a second time over unchanged field events and setup, nothing is written but the run, its two decisions and the job’s own record; the first job, finished, is not taken up again',
      [await concluded(), secondRun.jobs, ticketsOf(secondRun), (await jobOf(first)).run],
      [before, [second], ['101001 COMPLETED', '101003 MANUAL_REVIEW'], firstRun.run.runId],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '10:00'),
      'Two jobs wait for P1 at once: Luis’s names 101002 and 101004, Dana’s rule change 101004 and 101005. Two workers go for them in the same moment',
    );
    const luisJob = await queued(luis, 'REPROCESS', '101002', '101004');
    const danaJob = await queued(dana, 'SETUP_CHANGE', '101004', '101005');
    const runsBefore = await runs();
    const both = await Promise.all([
      reconciliation.waitingJobs(p1, tries),
      new Reconciliation(worker, clock, settings, mileages).waitingJobs(p1, tries),
    ]);
    const [one] = both.filter((outcome) => outcome.worked);
    const other = both.find((outcome) => !outcome.worked);
    if (one === undefined) throw new Error('Neither worker worked the jobs.');
    story.check(
      'AC-10-52 one run works both jobs under the project’s lock, and the other worker works nothing: each ticket once, 101004 named twice and worked once; both jobs finished under the one run',
      [
        both.filter((outcome) => outcome.worked).length,
        other?.reason === 'RUN_UNDER_WAY' || other?.reason === 'NOTHING_WAITING',
        (await runs()) - runsBefore,
        one.jobs,
        ticketsOf(one),
        [(await jobOf(luisJob)).run, (await jobOf(danaJob)).run],
        [(await jobOf(luisJob)).attempts, (await jobOf(danaJob)).attempts],
      ],
      [
        1,
        true,
        1,
        [luisJob, danaJob],
        ['101002 COMPLETED', '101004 COMPLETED', '101005 COMPLETED'],
        [one.run.runId, one.run.runId],
        [1, 1],
      ],
    );
    story.check(
      'The run is the oldest job’s (a reprocess); two people asked, so it names neither: each job keeps who asked for it',
      [
        await runOf(one.run.runId).then(({ trigger, askedBy }) => [trigger, askedBy]),
        (await auditOf(luisJob))[0],
        (await auditOf(danaJob))[0],
      ],
      [['REPROCESS', null], 'Luis · BACK_OFFICE · INSERT', 'Dana · BACK_OFFICE · INSERT'],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '11:00'),
      'A job whose every try fails whole: the worker’s clock stops as each run begins',
    );
    // What fails here fails the try whole, before any ticket is worked; once each time.
    const stops = { left: 0 };
    const failing = new Reconciliation(
      worker,
      {
        now: () => {
          if (stops.left > 0) {
            stops.left -= 1;
            throw new Error('The clock stopped.');
          }
          return clock.now();
        },
      },
      settings,
      mileages,
    );
    const doomed = await queued(luis, 'REPROCESS', '101005');
    const runsBeforeDoomed = await runs();
    const went: unknown[] = [];
    for (let attempt = 1; attempt <= tries; attempt += 1) {
      stops.left = 1;
      const outcome = await failing.waitingJobs(p1, tries);
      went.push([outcome.worked ? 'worked' : outcome.reason, outcome.setAside.length]);
      if (attempt === 1) {
        story.check(
          'A try that fails whole is counted and its reason kept; the job still waits, and no ticket was worked',
          [outcome, await jobOf(doomed)],
          [
            {
              worked: false,
              reason: 'FAILED',
              error: 'The clock stopped.',
              jobs: [doomed],
              setAside: [],
            },
            {
              attempts: 1,
              finished: false,
              run: null,
              lastError: 'The clock stopped.',
              setAside: false,
            },
          ],
        );
      }
    }
    story.check(
      'After five tries (JOB_TRIES_BEFORE_SET_ASIDE) the job is set aside: kept, with its reason, and never taken up again, even once the worker is well',
      [
        tries,
        went,
        await jobOf(doomed),
        await reconciliation.waitingJobs(p1, tries),
        (await runs()) - runsBeforeDoomed,
        (await auditOf(doomed)).at(-1),
      ],
      [
        5,
        [
          ['FAILED', 0],
          ['FAILED', 0],
          ['FAILED', 0],
          ['FAILED', 0],
          ['FAILED', 1],
        ],
        {
          attempts: 5,
          finished: false,
          run: null,
          lastError: 'The clock stopped.',
          setAside: true,
        },
        { worked: false, reason: 'NOTHING_WAITING', setAside: [] },
        0,
        // The reason is the fourth try's own words still: only the setting aside is new.
        'system · SYSTEM · UPDATE · set_aside_at',
      ],
    );

    story.at(
      on('14', '11:30'),
      'A job whose worker dies each time before it can say anything: its tries are counted as it is taken up',
    );
    const silent = await queued(luis, 'REPROCESS', '101002');
    const takes = new WaitingJobs(worker, clock, tries);
    for (let attempt = 1; attempt <= tries; attempt += 1) await takes.takeUp(p1);
    story.check(
      'Taken up five times with no word since, it is set aside the next time the worker comes for it, saying so',
      [await jobOf(silent), await reconciliation.waitingJobs(p1, tries), await jobOf(silent)],
      [
        { attempts: 5, finished: false, run: null, lastError: null, setAside: false },
        { worked: false, reason: 'NOTHING_WAITING', setAside: [silent] },
        { attempts: 5, finished: false, run: null, lastError: stoppedWithoutAWord, setAside: true },
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(on('14', '12:00'), 'The worker’s process looks at its queue: one job waits, for P1');
    const last = await queued(dana, 'SETUP_CHANGE', '101001');
    const lines: string[] = [];
    const loop = new JobLoop(
      worker,
      reconciliation,
      { triesBeforeSetAside: tries, pollMs: story.policy.jobQueuePollSeconds * 1_000 },
      new WorkerLog({ write: (line) => lines.push(line) }),
    );
    await loop.pass();
    const logged = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    story.check(
      'Its pass works the job and says so in its log by ids alone; its health answer’s figures are no job waiting and two set aside',
      [
        (await jobOf(last)).finished,
        logged.map((line) => [line['service'], line['msg'], line['projectId'], line['jobs']]),
        loop.standing,
        lines.some((line) => /101001|Dana|Luis/.test(line)),
      ],
      [
        true,
        [['worker', 'A run worked its project’s waiting jobs.', p1, [last]]],
        { jobsWaiting: 0, jobsSetAside: 2 },
        false,
      ],
    );
  },
};
