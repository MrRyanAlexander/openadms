# The worker's tests

> Part of the `adms-verify` skill, moved here word for word on 2026-10-09 (ADR-445) so the
> skill's own page stays short. **Read this page before you touch `apps/worker`, the job queue or what queues work.** Today's counts are
> `agent_store/CHAIN.md`'s, never this page's.

## 1.3c The worker's tests (ADR-419)

`apps/worker/test`. `mileages.test.ts` asks the map servers (**needs `pnpm local:up`**).
`process.test.ts` needs no stack: the settings (each missing or malformed key named, never
shown), the policy and an installation's own values, the log, the health answer, and three tests
that start the built `apps/worker/dist/main.js` with settings that are off. `container.test.ts`
asks the worker's own container (its health answer from inside, no port published, its log, both
map servers reached from in there): it **needs `pnpm local:up` after `pnpm installer`**, and
fails saying so. **The container runs what was built when it started: after any change to
`apps/worker`, `pnpm local:up` again.** Until the worker's env file names the map servers,
`local:up` says `The worker waits for pnpm installer` (a rerun of the installer adds the keys to
an older installation's file and changes no line that is there). By hand:

```bash
docker exec open-adms-local-worker-1 node -e "fetch('http://127.0.0.1:3001/health').then(async (r) => console.log(await r.text()))"
docker logs open-adms-local-worker-1    # one JSON object a line, service: worker
```

**How the worker takes jobs up is proven by the story `p1-queued`** (`pnpm scenarios p1-queued`,
about fifteen seconds once built; it needs the map servers): AC-10-52, 53, 54, the tries, a job
set aside, the process's own pass. **A loosening of `WaitingJobs`, `Reconciliation.waitingJobs`
or the job loop is tried on that story** (change the source, `./node_modules/.bin/tsc --build`,
run the story, put the source back from a copy kept in the scratchpad, build again; today
`loosen.mjs` does it, SKILL.md §1.5a). The story adds a job as the API's login with
`new ReconciliationJobs(tx).queue(…)`; a run the queue starts works only the named tickets.
**No story asks for a run any more (2.7.1 part 3, ADR-494): every story's queue is drained by the
worker's own `JobLoop`**, so `Reconciliation.run` (the whole project) is called by nothing (C144).
**What queues work (ADR-420)** is proven by the stories that run from the queue: `p1-reviewed`
(AC-10-50; the neighbours before a change), `p1-voided` (a void's neighbour; a void ticket on no
setup change's job), `p1-invoiced` (a rate through its service; a locked ticket on no job),
`p1-left-out` (a later certification; the neighbour read) and `p1-queued` (the cap on a run). A
story takes the waiting jobs up with `QueueRuns` (`p1-office.ts`), **the worker's own `JobLoop`
on the story's worker login, database and clock under the release's policy**: `settle(projectId)`
passes until no job waits anywhere (a pass that finishes none stops the story) and answers how
many runs the project took; `settled(projectId)` the same, and the project's one run's own answer
(none, or more than one, stops the story); `next(projectId)` is one pass and that project's run
in it; `pass()` one pass's own answer, project by project (`ProjectPassed`: the run's
`JobsOutcome`, or the error), for two workers at once (`p1-reconciled`, AC-06-150); `waiting`
lists the jobs; `standing(projectId)` reads every ticket as it stands from its records (a queued
run tells only the tickets it worked, so a check of the whole project reads this);
`asked(by, projectId, tickets, trigger?)` adds a job by hand as the API's login, for a reprocess a
person asks for with nothing changed or after a correction a story still writes by hand (part 4
moves those to their endpoint). **A loosening of `JobLoop`, `QueueRuns` or the queued run is tried
on `golden-mission`, `p1-reconciled` and `p1-priced`.** **Every service that queues is made with
`(db, clock, story.policy)`.** A loosening of `WorkQueue`, of a
service's queueing or of the domain's `TicketNeighbours` is tried on those stories; the rule
itself on `packages/domain/test/neighbours.test.ts`.
**The clock's difference at a sync (ADR-473)** is proven by `p1-queued`'s last step: Ana's phone
syncs through the story's own server (`story.server`, the API's `Sync` as `api-process.ts`
builds it; ADR-475), and the queued runs flag `DEVICE_CLOCK_OFF`. A loosening of
`project-read.ts`'s read of `synced_record` or of the limit handed to `TicketChecks` is tried
on that story (five took about four minutes). **Every story's phone syncs through `Sync` since
ADR-475, so every field event a sync brought queued a job of its own** (trigger `SYNC`, nobody
asking): a story calls `queue.settle` or `queue.settled` after a sync, where it says the worker
runs, or the next `queue.next` takes those jobs up with a person's. **The golden mission checks
that every run on its two projects finished jobs** (exit criterion 1): a run asked for directly
there is a failed check.
**The run of a number that is none raises only `NOT_A_TICKET_NUMBER`**: the limit handed to it
can't be seen to matter. **A new field of `WorkSettings` is stated by every story that builds
a `Reconciliation`** (nine today), and a worker's policy value joins `process.test.ts`.
Only this project: `./node_modules/.bin/vitest run --project @open-adms/worker`.
