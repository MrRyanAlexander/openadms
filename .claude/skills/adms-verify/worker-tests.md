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
run the story, put the source back from a copy kept in the scratchpad, build again). The story
adds a job as the API's login with `new ReconciliationJobs(tx).queue(…)`; **a run asked for with
`Reconciliation.run` works the whole project**, a run the queue starts only the named tickets.
**What queues work (ADR-420)** is proven by the stories that run from the queue: `p1-reviewed`
(AC-10-50; the neighbours before a change), `p1-voided` (a void's neighbour; a void ticket on no
setup change's job), `p1-invoiced` (a rate through its service; a locked ticket on no job),
`p1-left-out` (a later certification; the neighbour read) and `p1-queued` (the cap on a run). A
story takes the waiting jobs up with `QueueRuns` (`p1-office.ts`): `next(projectId)` is one run
and stops the story where no job waits, `settle` works them all, `waiting` lists them. **Every
service that queues is made with `(db, clock, story.policy)`.** A loosening of `WorkQueue`, of a
service's queueing or of the domain's `TicketNeighbours` is tried on those stories; the rule
itself on `packages/domain/test/neighbours.test.ts`.
Only this project: `./node_modules/.bin/vitest run --project @open-adms/worker`.
