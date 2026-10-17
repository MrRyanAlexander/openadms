# The database tests

> Part of the `adms-verify` skill, moved here word for word on 2026-10-09 (ADR-445) so the
> skill's own page stays short. **Read this page before you touch `packages/db`, its guards or its tests.** Today's counts are
> `agent_store/CHAIN.md`'s, never this page's.

## 1.3 The database tests (ADR-272)

`packages/db/test/*.test.ts`, in the one `pnpm test` run: every grant and refusal of the guard
migrations, read from the catalog exactly and tried as each login, plus `guard_table` and
`guard_gaps()`. **They need the local stack and an installation at head** (`pnpm local:up`, then
`pnpm installer`); without them they fail and say so, never skip. They connect to the database `adms`
as the local stack's administrator (its password read from `infra/local/.env` in the test process,
never printed), reach each login with `SET LOCAL ROLE`, and roll each test's work back, so nothing is
left behind. The project runs its files one at a time (`fileParallelism: false`). They also refuse a
database whose seed hasn't run (the system actor, ADR-273). Beside the guards (ADR-276):
`system-actor.test.ts` (only the worker and the seed write as it; nobody changes it),
`migrations.test.ts` (each applied `migration.sql` still matches Prisma's recorded checksum, so an
edit by any means fails the run) and `configuration.test.ts` (the CIS PostgreSQL Benchmark items for
this layer: SCRAM, how clients authenticate, `PUBLIC`'s rights, row security, ownership). The Phase 0
models (ADR-281): `time.test.ts` (a project's IANA time zone; no time without its zone),
`monitor-id.test.ts` (the database issues it; the employer), `devices.test.ts` (the phone, the master
passcode and its place outside the audit log, number blocks) and `assignments.test.ts` (the
assignment and the unit rate pay items it names, each its own project's, ADR-286; a field event's
assignment and setup version). The firm's lists (ADR-302): `lists.test.ts`, section D of
`spec/acceptance/01-setup.md` by scenario ID, read from the lists the installer's seed wrote (so a
list changed by hand in `adms` fails it), with `test/support/lists.ts` naming the eighteen tables
for the exact grant, trigger and check lists. The client, the declaration event and the project
(ADR-303): `projects.test.ts`, section A by scenario ID; the example world
(`test/support/example-world.ts`) is Bayline County, Hurricane Delphine, P1 and P2 as the golden
mission sets them up, picking its program types and kinds of unit rate work from the seeded lists;
**a test that writes another project uses `projectLike(world, …)` with `insertOf`**, since a project
has no database default for any setting. Contractors on a project, and contracts (ADR-305):
`contractors.test.ts`, section B by scenario ID; the example world has Coastline and Summit as P1's
primes and Coastline as P2's, each with its contract, and Harbor Staffing on no project; **a test
that places a contractor uses `primeOn(project, contractor)` or `subOn(project, contractor, prime,
tier)`** with `insertOf`, since a prime's row carries its own contractor as `as_prime_id`.
Forms, debris types, field tags and the firm's own fields (ADR-308): `forms.test.ts`, section C by
scenario ID; the example world's P1 has a load form (Vegetative, C&D), a haul-out form and an
incident form (`world.forms`, `world.formDebrisTypes`); a debris type's entry and a definition
repeat their form's `document_type`. Disposal sites, their labels, tipping fees and own shapes, and
the project map (ADR-311): `sites.test.ts`, section F by scenario ID; the example world's P1 has
Marsh Road TDSR and Bayline County Landfill (`world.site`, `world.landfill`, `world.siteTypes`);
**a test that writes a site uses `siteLike(world, siteTypeId, …)`**, a TDSR/DMS one stating
`site_type_key`; a map version's zones are written in the same piece of work as the version. The
extension `btree_gist` and its schema `extensions` (ADR-310): `grants.test.ts`; the size bands'
exclusion: `catalog.test.ts`, `pay-items.test.ts`. Rules (ADR-313): `rules.test.ts`, section G by scenario ID
(AC-01-60, the database's half of 61, 62 and 64, and AC-01-78); the example world's P1 has the
golden mission's first rule in full (`world.rule`); **a test that writes a rule uses `ruleLike`,
`criterionLike`, `pickLike` and `actionLike`**, since each row repeats its parent's project (and
form, and criterion); the closed sets are checked against `packages/domain`'s lists. People and viewers (ADR-315): `people.test.ts` (Part 2's sections A and B by scenario ID) and
`viewers.test.ts` (section I; `guard_viewer`); the example world has three read-only viewers
(`world.clientViewer`, `world.auditor`, `world.coastlineViewer`); **a test states who is looking
with `db.viewer(id)`** and issues another viewer with `viewerLike` and `given`;
`test/support/viewers.ts` names every table a viewer sees, how, the columns hidden and the columns that name a private citizen (`citizen`, shown only by `viewer_<table>_citizen`, ADR-336), and the
tables no viewer reads, for the exact policy, view and grant lists: **a new table goes in one
list or the other**. **What a contractor user sees** (ADR-361): `contractor-users.test.ts`, AC-02-78…82; **Sign-in's records** (ADR-397…399): `sign-in.test.ts`, AC-10-10, 11 and the database's half of 19; the three tables have their own guards, so each is listed by hand in `grants.test.ts` (the API alone), `catalog.test.ts` (`domains`, `keptOut` for a secret column, the `refuse_edit` triggers, the checks) and `unseenTables` in `viewers.ts`; a later table of sign-in joins the same four lists; a made-up token's hash is `sha256(…)` in the test, never a literal. **The job queue** (ADR-418): `reconciliation-jobs.test.ts` (the two tables' own guards, tried as each login; a test writes a job with `jobLike`, `ticketLike` and `queued`, and finishes one as the worker under a run made by `runOn`; a job once finished or set aside can't be updated, so a test that needs another writes another) and `job-queue.test.ts` (AC-10-50: as the API's own login through `ReconciliationJobs`, undone; `p1In` in `support/service.ts` writes its project); the tables are listed by hand in `grants.test.ts`, `catalog.test.ts` (`domains`, the three `refuse_edit` triggers, the checks), `unseenTables` in `viewers.ts`, and `field-events.test.ts`'s list of tables named for a ticket. a table of which a contractor user sees its own rows is `projectOrOwn(question, hidden)` in `viewers.ts`, its question worded as the catalog words it, and **a rerun of `guard_viewer` on such a table repeats its `own`** (the exact policy list fails otherwise); a line's rate and amount are read from `viewer_transaction_money`, so a test that orders a viewer's lines orders by `quantity`. Pay items, their rates and a crew day's steps (ADR-309):
`pay-items.test.ts`, section E by scenario ID (AC-01-41 moved there); the example world's P1 has six
of the golden mission's pay items with Coastline's rates (`world.payItems`, `world.rates`); **a test
that enters a pay item uses `payItemLike(world, …)`** with `insertOf`, since no capture setting has
a database default, and an assignment's pay item repeats its `kind_of_work_id`. They also
refuse a database without the seed's master passcode. **The Monitor ID series on `adms` moves with every run** (a sequence isn't
rolled back); gaps are normal.

**The actor extension's tests** (`actor.test.ts`, ADR-273) connect instead **as the services' own
logins**, with the URL in `apps/api/.env` or `apps/worker/.env` read in the test process (never
printed), through `openDatabase` and `$write`. What a login writes can't be deleted, so each test's
work is undone by throwing out of `$write` (`test/support/service.ts`, `undone`); a committed
`$write` may only read. After a run the database holds only the seed: 3 users (the system actor, the master passcode's actor and the device key's, ADR-439, 440), 1 master passcode
version, the 94 values the firm's lists start with, 98 audit records (ADR-302).

- Only this project: `./node_modules/.bin/vitest run --project @open-adms/db`.
- **Trying a guard migration before it is applied:** make the copy, apply the stub's SQL to it as
  `adms_owner`, and **run the tests on it** (`ADMS_TEST_DATABASE=…`), not only `guard_gaps()`: a
  check that applied cleanly once let a shape with no coordinates through (ADR-311 (9)).
- **A loop over loosenings** that calls `docker exec -i` must close its stdin (`< /dev/null`), or
  the first `docker exec` swallows the rest of the list (seen 2026-10-02).
- **Proving a guard change is covered:** make a throw-away copy, change it, run the tests on it, drop
  it (no service may be connected to `adms` while it's copied):
  `CREATE DATABASE adms_mutation TEMPLATE adms OWNER adms_owner` (owned by `adms_owner`, or its
  owner's-rights triggers can't see the schema), then
  `ADMS_TEST_DATABASE=adms_mutation ./node_modules/.bin/vitest run --project @open-adms/db`, then
  `DROP DATABASE adms_mutation`. The admin commands go through
  `docker exec -i open-adms-local-postgres-1 psql -U postgres` (no password on the command line).
- **Several copies may be tried at once**, each under its own name (`adms_mutation_0`,
  `adms_mutation_1`…; `ADMS_TEST_DATABASE` takes any name starting `adms`): four at a time took 43
  loosenings a few minutes (ADR-305). **On this machine, two at a time** (ADR-313): a copy is
  about 85 MB and a plain `CREATE DATABASE` writes it all to the write-ahead log, and four at once
  filled Docker's 8 GB disk and stopped Postgres. Make each copy with `STRATEGY FILE_COPY`, and
  `CHECKPOINT` after each drop.
- **A guard stub is tried as a migration, not as loose SQL** (ADR-313): copy `adms` under a story's
  name (`CREATE DATABASE adms_story_try_<what> TEMPLATE adms OWNER adms_owner`), apply the stub with
  `ADMS_STORY_DATABASE=adms_story_try_<what> ./node_modules/.bin/prisma migrate deploy --config
  prisma.story.config.js` (in `packages/db`), run the tests on it, and use it as the template for
  the loosened copies; drop it before `pnpm installer`. While any is running, don't run `pnpm lint`, `pnpm test` or
  `pnpm generate`, and don't connect to `adms` (a copy can't be made while anyone is).
- **A trigger fires before a check** (seen 2026-10-10, ADR-457): where a guard's trigger asks who is
  writing, a check's own refusal is asked under the actor the trigger lets through, or the trigger
  answers first with another code. **Two refusals of one trigger are told apart by their words**
  in the test, or loosening one is hidden by the other. **An unplanned assignment** is written
  with `underThePasscode()` and the `unplanned` values of `assignments.test.ts`.
- **A refusal another guard would also make is given its own case** (seen 2026-10-10, ADR-462):
  the master passcode's actor stated from the back office is refused by a session's trigger
  first, in that trigger's words; without that case, loosening the trigger's own check of the
  source slipped.
- **A closed project is held by one trigger function on many tables** (ADR-529): `project_open_guard()`
  on each table that carries `project_id`, and, given the parent table and its column as arguments,
  on each record under one of them; `catalog.test.ts` holds both lists exactly (`closedProjectTables`,
  `closedProjectChildren`), and **a new table of a project's records joins one of them** (or is named
  exempt beside them, as `held_record`, `user_viewer_project` and `set_aside_file` are).
  `closed-projects.test.ts` holds the refusals. A plpgsql variable named as a column (`project`)
  is ambiguous only when the statement runs: the guard's checks are tried, never read.
- A new table or guard adds its expectations to these tests in the same response: the grant, trigger
  and policy lists are exact, so an unexpected one fails.
- **A bare copy fails one test by itself** (`configuration.test.ts`, "nobody but the logins may
  connect": Postgres doesn't copy a database's access list with its template). Count a loosening as
  caught when it fails more than that one.
