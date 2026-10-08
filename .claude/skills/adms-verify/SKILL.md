---
name: adms-verify
description: Run the Open ADMS verification chain and report real observed output. Covers loading Node 24 through fnm, the frozen pnpm install, typecheck, the Vitest run with its expected counts, lint and format, the licence report, the clean-copy check after a dependency change, where tests live and how a workspace joins the run, and which ARCHITECTURE §15 layers are still to come. Use after any code or config edit, before closing out any code task, or whenever asked to verify, test, typecheck, or confirm the build is green.
---

<!-- skill-status: current (rewritten for the rebuild's chain 2026-09-29, ADR-259; cut to today's expected output 2026-10-06, ADR-375: the count history is in DECISIONS.md's scratchpad; the API's tests and container, 2026-10-07, ADR-385; the boundary's tests and `pnpm openapi`, ADR-387…392; the statement timeout, ADR-394…396; sign-in's records, ADR-397…399; passwords, ADR-402…406; sessions, ADR-407…411; two-step sign-in, ADR-412; permissions and people, the sixteenth story, the API's files one at a time, ADR-415; the job queue's tests, ADR-418; the worker's process, its container and the seventeenth story, ADR-419; what queues work, the stories on the queue, ADR-420; the setup services' story checks, ADR-423; setup's endpoints, part 1, ADR-424; part 2, ADR-425; part 3, ADR-426; part 4, the firm's people, ADR-427; phones and the master passcode, ADR-428) -->

> **This page states today's chain** (expected output as seen 2026-10-07, ADR-420). The rule never changes: **report real
> observed output, never "should pass".** The layers still to come are listed at the end of Part 1.

# PART 1 — THE CHAIN

Run everything from the repository root. An agent's shell doesn't load `~/.zshrc`, so a bare `node`
finds Homebrew's 25; **start every command with** `eval "$(fnm env --shell zsh)"` (then `node -v` →
v24.x) (ADR-233). The repo pins pnpm 11.27.1 in `packageManager`; the global pnpm switches to it by
itself (ADR-255).

```bash
eval "$(fnm env --shell zsh)"
pnpm install --frozen-lockfile   # the committed lockfile, the supply-chain policy
pnpm typecheck                   # pnpm generate (the Prisma client), then tsc --build
pnpm test                        # tsc --build, then vitest run: one run, real counts
pnpm lint                        # ESLint (type-aware) + Prettier check
pnpm licences                    # every installed package's licence against ADR-171
pnpm openapi                     # after a changed endpoint: writes apps/api/openapi.json (§1.3b)
pnpm local:accounts --show       # the dev stack's accounts, to sign in by hand; without --show it writes them (ADR-412)
pnpm installer:admin             # on a firm's server: its first admin, or an admin's way back in (asks; ADR-415). Never run it against `adms` to try it: what it writes can't be deleted (its proof is the story `first-admin`)
pnpm scenarios                   # every story, each on its own database (§1.4)
pnpm security                    # audit, secrets scan, env files, grant tests (§1.5)
```

| Command | What it proves | Expected today (seen 2026-10-07) |
|---|---|---|
| `pnpm install --frozen-lockfile` | The lockfile matches every `package.json`; no version younger than 7 days; no install script ran (none is allowed); no git or tarball sub-dependency (ADR-255) | `✓ Lockfile passes supply-chain policies`, exit 0; with everything already installed, `Already up to date`, exit 0 |
| `pnpm typecheck` | Generates the Prisma client (`pnpm generate`, into the git-ignored `packages/db/src/generated/`; also run first by `test` and `lint`, ADR-273), then strict TypeScript across every workspace **and its tests**, through project references (ADR-256) | `✔ Generated Prisma Client (7.10.0)`, then exit 0 with no output after `tsc --build` |
| `pnpm test` | Typechecks, then Vitest runs every project in `vitest.config.js` (ADR-259); the database tests and the map servers' tests need the local stack up and the installation at head (§1.3, §1.3a) | **`Test Files 115 passed (115)`, `Tests 2271 passed (2271)`** (seen 2026-10-08, ADR-428). By project: `packages/domain` 705 in 36 files and `packages/contracts` 27 in 6 (neither needs a database); `apps/api` 296 in 19, its files one at a time (the settings 43, the database's refusals 4, the error filter 7, the boundary 24, the passwords 19, the session tokens 16 and the one-time codes 13 need nothing; the door 15, the request id 2, setting a password 15, the sessions 22, two-step sign-in 15, permissions and people 20 with a page of people, a person changed, a role and out of the archive 13, setup's endpoints 14 with its forms, pay items and rules 19 and its sites, map, merge and standing 11, the phones and the master passcode 9, and the rate limits 15 (five of them need nothing) **need `pnpm local:up` after `pnpm installer`**, §1.3b); `packages/db` 969 in 39 files; `packages/scenarios` 127 in 4 (the flag catalogue against `spec/FLAGS.md`, 78 flags; the harness; every story once); `apps/worker` 30 in 3 (the map servers 13: **need `pnpm local:up`**; the process 14, which needs nothing, three of them starting the built `apps/worker/dist/main.js`; its container 3: **needs `pnpm local:up` after `pnpm installer`**, §1.3c) and `infra/local` 22 in 3 (the map servers: **need `pnpm local:up`**; the dev stack's accounts, 5, whose writing needs the installation too, ADR-412); `tools/security` 80 in 2 (the scan's rules 23, the guard hook 57); `tools/setup` 15 in 3 |
| `pnpm lint` | ESLint's type-checked rules (floating promises, `any`, unsafe access…) on all code and tests; Prettier formatting (ADR-257) | `All matched files use Prettier code style!`, exit 0 |
| `pnpm licences` | No licence refused or undecided (ADR-258, 260) | `421 packages: 421 allowed, 0 refused, 0 undecided.` (since `nodemailer`, ADR-405) The package count moves with dependencies; **0 refused, 0 undecided** doesn't |
| `pnpm scenarios` | Every story passes on its own database, which is dropped afterwards (ADR-275; needs the local stack and the installation) | per story `passed: N checks, N passed, 0 failed` (`ticket-101001`: 16; `dispatch-monday`: 18; `setup`: 52, ADR-316, 323; `certification`: 25, ADR-321, 323, 330; `numbering`: 16, ADR-323, 371; `p1-field-days`: 35, ADR-332; `sync`: 47 and `p1-any-order`: 4, ADR-338; `p1-reconciled`: 39, ADR-352, `p1-priced`: 28, ADR-359, 360, `p1-reviewed`: 35, ADR-364, 420, 426, `p1-voided`: 28, ADR-365, 420, `p1-invoiced`: 26, ADR-367, `golden-mission`: 27, ADR-368, and `p1-left-out`: 31, ADR-369, 420, 423, all seven of which ask the map servers; `first-admin`: 32, ADR-415; `p1-queued`: 14, ADR-419, 420, which asks the map servers too), then `Stories: 17 passed, 0 failed.`, exit 0 |
| `pnpm security` | The dependency audit, the secrets scan, the env files and the grant tests, with real counts; never prints a secret (§1.5; needs the registry, the local stack and the installation) | `✓ 0 open advisories` (3 accepted by id), secretlint `0 found`, the installation's own secrets `0 found`, a password-like setting `0 found`, env files `✓ every one ignored by git and untracked`, the grant tests `39 files, 969 tests: 969 passed, 0 failed`, ending **`Security checks: 7 passed, 0 failed.`**, exit 0 (seen 2026-10-07). `source-map-js` is forced to 1.2.2 by an override (ADR-356, 372); nothing is let past the seven-day rule (ADR-385). Any ✗ is a finding, never accepted to get green |

**The local stack** (ADR-263; Docker running). Run it after a change to `infra/local`, and before any
work that needs the database or the object store:

```bash
pnpm local:up       # generates infra/local/.env on a first run; fetches the map extract if it isn't in
                    # infra/local/.cache/maps/ and checks its pinned SHA-256; waits until all six are
                    # healthy; copies Caddy's root to infra/local/.generated/; checks the health page
                    # and both map servers over HTTPS
curl --cacert infra/local/.generated/caddy-root.crt https://adms.localhost/health   # → ok
curl --cacert infra/local/.generated/caddy-root.crt https://routing.adms.localhost/status
curl --cacert infra/local/.generated/caddy-root.crt 'https://addresses.adms.localhost/status?format=json'
curl -sI http://adms.localhost/health                                               # → 308 to https
pnpm local:down     # containers and network removed; data volumes kept
```

| Command | What it proves | Expected today (2026-10-01, ADR-282) |
|---|---|---|
| `pnpm local:up` | Postgres, object store, mail catcher, the routing server (Valhalla), the address server (Nominatim) and Caddy healthy; the map extract matches its pinned hash; HTTPS verified against Caddy's own root | `Keeping the map extract delaware-260101.osm.pbf (SHA-256 matches its pin).`, six `Healthy` lines, then `https://adms.localhost/health → 200 ok`, `https://routing.adms.localhost/status → 200 {"version":"3.9.0",…` and `https://addresses.adms.localhost/status → 200 OK`; then, once the installer has run, the API is built, its container made afresh and `https://api.adms.localhost/health → 200 {"status":"ok"}` (ADR-385, §1.3b), and the same for the worker: `the worker’s health answer → 200 {"status":"ok","jobsWaiting":0,"jobsSetAside":0}` (ADR-419, §1.3c). A resume takes about 12 s; **a first run about two minutes** (it downloads the 20 MB extract, builds the road tiles and imports the addresses) |
| `pnpm local:down` | Nothing left running | 8 containers (6 before the installer has run) and the network `Removed`; `docker ps -a --filter label=com.docker.compose.project=open-adms-local` empty |
| `pnpm local:wipe` | The next `up` is a first run | volumes, `.env` and `.generated/` removed; the downloaded map extract in `.cache/maps/` is kept (public data) |

**Docker's disk.** On this machine Docker Desktop's disk is 8 GB and the stack leaves under 1 GB
free. `No space left on device` in a container's log means it's full: stop, free space (the two map
servers' volumes, `open-adms-local_routing_data` and `_addresses_data`, are rebuilt from the extract
by the next `up`), never widen an import to "see if it fits". Every `docker` call answering 500 means
Docker Desktop's engine is stuck: quit and reopen it (ADR-282).

**Start it for the task, stop it at the end** (ADR-277): `pnpm local:up` when a task needs it (the
installer, the db tests, `pnpm scenarios` and `pnpm security` do), and `pnpm local:down` at
close-out (`adms-close-out` §0), unless `NEXT.md`'s Handoff says why it stays up. Expect it stopped
at the start of a session. One-off containers run with `--rm`.

Never print `infra/local/.env`, and never pass a key as a curl argument that could be echoed: load it
in a subshell (`set -a; . infra/local/.env`). If `up` says `.env` is missing but the volumes exist,
the old passwords are gone: `pnpm local:wipe`, then `up`.

**The installer** (ADR-266; brings the stack up itself). Run it after a change to `tools/setup`, and
before work that needs the database logins (0.3 on):

```bash
pnpm installer            # first run: three questions (answers may be piped, one per line);
                          # rerun: says what it knows, re-checks it, asks once to resume;
                          # a database that was lost: it asks for the master passcode again
pnpm installer:check      # re-checks only, changes nothing; exit 1 if anything is off
pnpm installer:teardown   # asks for the word `teardown` (or --yes); the next run is a first run
```

| Command | What it proves | Expected today (2026-10-01) |
|---|---|---|
| `pnpm installer` (first run) | Secrets made once into owner-only env files; four logins from SCRAM verifiers; database `adms` open only to them; the master passcode's slow hash handed to the seed in memory and kept in the database alone, never in a file (ADR-281) | `+ wrote` ×3, `+ created login` ×4, `+ created database adms` and `adms_shadow`, `✓ adms_owner, which runs the migrations, is under no statement timeout`, `+ set: a statement of … is stopped after 30000 ms (STATEMENT_TIMEOUT_MS)` ×3 (ADR-394, 396), `✓ … opens adms with its own password` ×4, `All migrations have been successfully applied.`, `+ created the system actor, Open ADMS (system)`, `+ kept the master passcode's slow hash in the database, version 1`, `+ wrote 94 values to the firm's lists (…)` (ADR-302), `Installed for …`; `packages/db/.env` holds only `DATABASE_URL` |
| `pnpm installer` (rerun) | Resume without new secrets; migrations at head (eighty-nine today; `packages/db/prisma/migrations/` is the list); the seed re-checks the system actor and stops if it was changed (ADR-273); the install stops if `guard_gaps()` lists an unguarded table; a migration whose SQL is still only comments is refused, not applied | 25 `✓` lines (`✓ adms_owner, which runs the migrations, is under no statement timeout`, ADR-396, and three `✓ a statement of adms_api / adms_worker / adms_readonly is stopped after 30000 ms (STATEMENT_TIMEOUT_MS)`, each read signed in as that login, ADR-394; a login with another value or none is `✗` there and `+ set:` on the resume; an owner's timeout or one kept for a login in one database is `- took off …` on the resume), ending `✓ migrations at head (Database schema is up to date!)`, `✓ every table is guarded` (ADR-271), `✓ the master passcode's slow hash is kept in the database alone (Argon2id, version 1)` (ADR-281) and `✓ the system actor is the seed's, alone, unchanged and guarded` (ADR-276); one confirm; `No pending migrations to apply.`; `✓ the system actor exists, Open ADMS (system)`; `✓ the master passcode's slow hash is kept, version 1`; `✓ the firm's lists are as the firm keeps them, each built-in value in place` (ADR-302); `shasum` of the three env files unchanged |
| `pnpm installer` (the database lost) | The logins and the database come back with the secrets it has; the master passcode, kept only in the database, is asked for again (ADR-281) | `The database holds no master passcode (it went with the database). Set it again:`, then `+ kept the master passcode's slow hash in the database, version 1`; with no answer it stops, exit 1; env files unchanged |
| `pnpm installer:teardown` | The next run is a first run | `adms`, `adms_shadow` and four logins dropped, three env files and the record removed |

**The schema** (ADR-267, 268), after a change to `packages/db/prisma/schema/`: in `packages/db`, `./node_modules/.bin/prisma validate` (→ `The schemas at prisma/schema are valid`), then `./node_modules/.bin/prisma migrate dev --create-only --name <what>` to generate a migration, reviewed, then `pnpm installer` to apply it. Call the CLI through `./node_modules/.bin/prisma`: `pnpm exec` re-runs the install first. Never edit a generated or applied migration (ADR-113). Two things seen (ADR-281): `migrate dev --create-only` **applies any earlier migration still pending to `adms` itself** before it makes the new one (as `adms_owner`, like the installer; so write a stub's SQL, and try it with its tests on a throw-away copy, before generating the next migration: ADR-311 (9)); and when the generated migration carries a warning it asks to confirm and needs a terminal: `(sleep 6; printf 'y\n'; sleep 8) | script -q /dev/null ./node_modules/.bin/prisma migrate dev --create-only --name <what>`. **A migration that writes a row** (a backfill) states its actor and writes inside one `DO` block: Prisma runs a migration's statements one by one, so `set_config(…, true)` in its own statement is gone by the next (seen on a throw-away copy, ADR-336). **The hook refuses a second write into a stub**: one never applied to `adms` is removed and made again with `--create-only`. **A guard's `--create-only` stub must come out empty** (`-- This is an empty migration.`): if it carries a line nobody asked for, Prisma is reading a `dbgenerated` default back differently from how the schema writes it (KD-70: `CURRENT_TIMESTAMP` comes back as `now()`; `transaction_timestamp()` comes back as written). Fix the schema, never write around the hook. **A deferred check** (a container's primary box, ADR-321) is asked at commit; a database test asks it with `SET CONSTRAINTS ALL IMMEDIATE`, and the example world does once it is built. **A field event's tests** (ADR-324): `field-events.test.ts`, one test per scenario ID of `spec/acceptance/04-field-capture.md`; a test writes one with `fieldEventLike` or `backOfficeEventLike` and `eventInsertOf`, since no column of where it came from has a default; a new column joins `captured` in `grants.test.ts` and AC-04-25's exact column list. **What each kind records** (ADR-325): `field-event-kinds.test.ts`, one test per scenario ID; a debris type is written with `debrisTypePicked(world, entryId[, form])` (the entry with its form and document type), a split collection with its estimate, a measurement with `measured_as`; a new kind-specific column also joins `packages/domain`'s `fieldEventDetails` and `packages/contracts`' `fieldEventDetailsSchema`, and the test "every detail on every kind" then tries it on all five kinds. **Scale receipts and photographs** (ADR-326): `scale-receipts-and-photos.test.ts`, one or more tests per scenario ID; a test writes a receipt with `scaleReceiptLike` and a photograph's record with `photoLike(world, owner)`, both through `phoneInsertOf` (the id a phone would make); a photograph's fingerprints and keys can't be updated, so a test that needs others writes another; a new owner of a photograph widens `photo_owner_check` and joins `correctable.photo` in `grants.test.ts` and AC-04-76's column list; a new latitude or longitude column joins the exact list in `sites.test.ts`. **ROEs and forms** (ADR-327): `roes-and-forms.test.ts`, one or more tests per scenario ID; a test writes an ROE with `roeLike` and a survey, an incident or a drop-off log from `formLike` or `backOfficeFormLike` plus its own columns, through `phoneInsertOf`; `answers` is always stated, and answers come with `form_definition_id`, `form_id` and `form_document_type` together; a new form table joins `formShared`'s users in `grants.test.ts`. **Intake and quarantine** (ADR-338): `quarantined-records.test.ts`, by scenario ID of `spec/acceptance/05-sync.md`; a test writes a quarantined record through `phoneInsertOf('quarantined_record', …)` with the field event or the ROE that holds its number, and what the phone sent can't be updated afterwards, so a test that needs other values writes another; the stories `sync` and `p1-any-order` drive `apps/api`'s `Intake`, and a record a phone never makes is a phone's record copied under a new id and handed to `story.intake.receive`. **The derived records** (ADR-340): `derived-records.test.ts`, by scenario ID of `spec/acceptance/06-reconciliation.md`; a test writes them as the worker (`db.as('adms_worker')`, `db.actor(world.worker, 'SYSTEM')`) with that file's `completedLoadLike`, `collectionRowLike`, `flagLike` and `runLike`; a rule that holds only among live rows is an exclusion `WHERE dissolved_at IS NULL` (refused as `refusedBy.exclusion`), never a partial unique index, and `./node_modules/.bin/prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema --exit-code` (→ `No difference detected.`) shows Prisma won't drop it; a cross-project refusal is tried with a record nothing else names yet, or another key answers first and the test proves nothing (seen: one of fifty loosenings slipped through that way). **A priced line** (ADR-358): `transactions.test.ts`, by scenario ID of `spec/acceptance/07-pricing-ledger-audit.md`; a test writes one as the worker with `transactionLike(world, more)`, and the tickets the example world doesn't hold with `new PricedTickets(tested)` (`test/support/priced-tickets.ts`); `transaction` has its own guards, so a new column means its viewer view and column grant written again by hand in the guard migration, `viewerColumns.transaction` in `grants.test.ts` and AC-07-89's column list; the two-column foreign keys to the completed load and to the completed haul-out are implied by the row's three-column key and the check, so loosening one alone is not caught, by construction. **People's marks** (ADR-363): `marks.test.ts`, by scenario ID of `spec/acceptance/08-review-and-corrections.md` and `09-invoice-deliver-closeout.md`; a test writes them as the API's login for the person (`actingAs`) with that file's `qcLike`, `lockLike`, `acceptanceLike` and `voidLike`; every mark states its `project_id`, and a mark on a field event `field_event_kind: 'UNIT_RATE'`; a second lock or void in force is `refusedBy.exclusion`; what a mark is on, who made it and when can't be updated, nor a lock once unlocked or a void once lifted, so a test that needs other values writes another. **A reviewer's services** (ADR-364, 365) have no test project of their own: their rules are `packages/domain/test/review.test.ts` and they are driven whole by the stories `p1-reviewed` (corrections and renumbering) and `p1-voided` (void, unvoid, accept; `pnpm scenarios p1-voided`, under ten seconds once built; both need the map servers); **a loosening of a service or of the worker's reading of a mark is tried on the story** (change the source, `./node_modules/.bin/tsc --build`, run the story, put the source back from a copy kept in the scratchpad, build again); the audit log's `occurred_at` is the database's clock, so a story tells "after" by the audit record's id. **Loosened guards may be tried on part of the tests** (ADR-363): the files that hold the table's guards (its own, `catalog`, `grants`, `transactions`, `transaction-delete`, `viewers`, `guard-table`, `audit`, `no-delete`; never `configuration`, which a bare copy fails by itself), since a loosening caught by part is caught by the whole; say that it was a part. **The tests ask the copy for the newest migration by name**, so a guard still in the scratchpad can't be tried as loose SQL unless the copy's `_prisma_migrations` is told the stub is applied (its file's SHA-256 as the checksum): do that on a throw-away copy only, then write the stub once and prove it again with `migrate deploy`. **A loop of loosened guards took about four minutes a pair here on 2026-10-05** (fifty took 110 minutes, with 873 tests a run; it was 75 seconds a copy at 500 tests)**; two at a time** (twenty took 25 minutes, ADR-323): run it in the background with no ten-minute limit, and give the script absolute paths.

Never print the env files (`apps/api/.env`, `apps/worker/.env`, `packages/db/.env`); to prove
nothing was rotated, compare their `shasum`s, never their contents. To script a first run without
showing the passcode: `pc=$(openssl rand -base64 18)`, then pipe `"$pc"` twice.

**Keep the expected column true, and only today's.** A task that adds or removes tests replaces
the counts here in the same response (never a "before it…" chain: the reason for a change is the
task's ADR and its session-log line); a count that differs from this table without a reason is a
finding, not noise.

## 1.1 After a dependency change: the clean-copy check

A new or changed dependency (a pin, a lockfile change, a new `allowBuilds` entry) is proven from a
clean copy, so nothing already on disk hides a missing piece. Copy the repo into the scratchpad
without `node_modules`, `dist`, `.git`, `development/`, `spec/`, `agent_store/` and `.claude/`, then run the whole chain there and paste its output. **Three test files fail in such a copy by its own making** (seen 2026-10-07, ADR-405): `guard-hook.test.ts` (35 tests; the hook is in `.claude/`) and the two that read `spec/FLAGS.md` (`derived-records.test.ts`, `flag-catalogue.test.ts`); anything else failing is a finding. The copy holds the env files: remove it when the run is read. Every dependency needs its ADR
first (exact version, licence, maintenance, at least 7 days old; `BACKLOG.md` Milestone 0.2).

## 1.2 Where tests live, and how a workspace joins the run

- Tests sit in **`<workspace>/test/*.test.ts`**, never in `src/`, so they never reach `dist/`.
- Each `test/` folder has its own **`tsconfig.json`**: it extends `tsconfig.base.json`, `noEmit`,
  `allowImportingTsExtensions`, and **references its workspace** (`"path": ".."`). The root
  `tsconfig.json` references it, so `pnpm typecheck` checks tests too; ESLint's project service
  finds it, so tests are linted with the same rules (ADR-259).
- A test imports its own workspace's source (`'../src/index.ts'`) and other workspaces by package
  name (`'@open-adms/domain'`), which resolves to their built `dist/`. That's why `pnpm test` builds
  first.
- **A workspace joins the run** when it gets its first test: add its path to `projects` in
  `vitest.config.js` and its `test` folder to the root `tsconfig.json` references. Vitest fails a
  listed project with no tests, so the list only ever names workspaces that have them.
- Import `describe`, `it`, `expect` from `'vitest'` explicitly; no globals.

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
`$write` may only read. After a run the database holds only the seed: 1 user, 1 master passcode
version, the 94 values the firm's lists start with, 96 audit records (ADR-302).

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
- A new table or guard adds its expectations to these tests in the same response: the grant, trigger
  and policy lists are exact, so an unexpected one fails.
- **A bare copy fails one test by itself** (`configuration.test.ts`, "nobody but the logins may
  connect": Postgres doesn't copy a database's access list with its template). Count a loosening as
  caught when it fails more than that one.

## 1.3a The map servers' tests and the guard hook's tests (ADR-282, 283)

- **`infra/local/test`**: `map-extract.test.ts` needs nothing (which extract, each refused setting, a
  download kept only when its hash matches). `map-services.test.ts` asks the routing and address
  servers over HTTPS through Caddy and **needs `pnpm local:up`**; without it, it fails and says so.
  Its expected values (a shortest route of 15.6 mi between two Delaware points; "25, The Green,
  Dover"; map data dated 2026-01-01) belong to the pinned extract and images, and change only when a
  pin changes. Only this project: `./node_modules/.bin/vitest run --project @open-adms/infra-local`.
- **`tools/security/test/guard-hook.test.ts`** feeds `.claude/hooks/guard.sh` each tool call as
  Claude Code does and asserts what's blocked and what isn't. **Change the hook and this test
  together.** To prove a rule's removal is caught, point the tests at a loosened copy:
  `ADMS_GUARD_HOOK=<copy> ./node_modules/.bin/vitest run --project @open-adms/security`. The hook
  blocks an agent from reading or printing an env file, so compare `shasum`s and load one in a
  subshell, as this page already says.

## 1.3b The API's tests (ADR-385)

`apps/api/test`, by scenario ID of `spec/acceptance/10-api-and-sync.md`. `settings.test.ts`,
`error-filter.test.ts` and `boundary.test.ts` need no stack (the last two run the real process in
memory, with one more controller of the test's own, started through `test/support/process.ts`;
two of the first start the built `apps/api/dist/main.js`). `request-id.test.ts` runs the process
in memory too but opens `adms` as the API's own login, and undoes its write by failing out of it.
**After a change to an endpoint in `packages/contracts`, `pnpm openapi`** (it writes
`apps/api/openapi.json`; `boundary.test.ts` fails on a stale file, and on a route the contracts
don't list). A test's own endpoint is made with `endpoint()` from schemas the contracts export:
`apps/api` has no Zod of its own (ADR-387).
`door.test.ts` asks the API's own container through Caddy over HTTPS and reads its log with
`docker compose logs`: it **needs `pnpm local:up` after `pnpm installer`**, and fails saying so.
**The container runs what was built when it started: after any change to `apps/api`, `pnpm
local:up` again** (it builds, makes the container afresh and prints `https://api.adms.localhost/health
→ 200 {"status":"ok"}`). Until the installer has run, `local:up` says `The API waits for pnpm
installer` and starts the six. By hand:

```bash
curl --cacert infra/local/.generated/caddy-root.crt https://api.adms.localhost/health   # → {"status":"ok"}
curl -sI http://api.adms.localhost/health                                               # → 308 to https
```

`passwords.test.ts` (ADR-402…405) needs no stack: the hash, the release's breached list, the
reset code, the mail settings and what the two reset endpoints refuse before anything is read.
`password-set.test.ts` writes: it opens `adms` as the API's login and **runs each test in one
piece of work that is undone** (`test/support/database.ts`, `undone`; the services are handed a
database whose `$write` and `$read` run inside it; a Prisma piece of work ends after five
seconds, so a test stays short), hands the process its own database, mail and clock
(`ProcessParts`), and sends one message through the stack's mail catcher, read back at
`https://mail.adms.localhost/api/v1/…` and deleted. **A loosening of the password rules, the
hash, the reset code or `Passwords` is tried on these files and on
`packages/domain/test/passwords.test.ts`** (change the source, run the file, put it back). The
secrets scan reads `apps/api/openapi.json` and every test: a made-up login URL is put together
in `support/process.ts`, never written whole.

`session-tokens.test.ts` (ADR-408) needs no stack: the access token, the refresh token, the
CSRF value, the cookies, and what an endpoint that asks for a session refuses on sight; **it
holds the list of endpoints nobody need be signed in for**, so a new `ANYBODY` endpoint is
added there on purpose. `sessions.test.ts` (ADR-408…411) writes, as `password-set.test.ts`
does: its `Served` starts the process on the test's own piece of work with a `TestClock` and
keeps a browser's side (cookies and the CSRF value, by hand); `test/support/sign-in.ts` puts
sign-in's services together for a test that calls one directly. **Every endpoint a test defines
states its `access`.** An audit record's id is a BigInt: never `JSON.stringify` one whole.
**A loosening of sessions, wrong tries, the cookies, admission or the hasher is tried on those
two files, `passwords.test.ts`, `password-set.test.ts`, `boundary.test.ts` and
`packages/domain/test/sign-in-tries.test.ts`**: fifty-seven took about ten minutes as a script
that swaps one string, runs the files and puts the source back (format first, or the strings
don't match; a loosening that isn't found in the source proves nothing: count it as not
tried). **To copy `adms` for a guard's loosening, stop the API's container first** (`docker
stop open-adms-local-api-1`: it holds a connection), and `pnpm local:up` again afterwards.

`limits.test.ts` (ADR-416): rate limits. **A test's requests come from `served.from`**
(`support/served.ts`): four wrong tries at one login from one address and the fifth is answered
429 before the login is touched, so a test that makes more moves `served.from`; a test that
needs other numbers hands `worldOn` (or `Served.on`) a policy from `installationPolicy({ … })`.
A new policy value is added to `policy.env`, the three whole maps in `packages/domain/test/`
(they have no Node types to read the file with), `project-settings.test.ts`'s list of names and
`packages/scenarios/test/policy.test.ts`.

`people.test.ts` (ADR-415) writes, as `sessions.test.ts` does: permissions on every request
and the firm's people, by scenario ID. **Every `SIGNED_IN` endpoint a test defines names its
`roles`**; `support/served.ts` has two endpoints of the tests' own that take a permission
(`/test/granted-voids`, `/test/unlocks`). **It holds the exact lists** of the endpoints that are
an admin's alone and of those that take a permission: a new one is added there on purpose.
**The project's files run one at a time** (`vitest.config.js`): the database keeps two who sign
in from one email address, and every test's world has Dana's, so a second file's world would
wait for the first's to be undone. **The database keeps the firm's last admin**: a test that
archives Dana, or makes her anything else, first gives the firm another admin; a refusal by the
database ends the test's piece of work, so it is a test's last step. **What needs a firm with
no admin can't be tested on the installation's database** (a developer may have run `pnpm
local:accounts`): it is the story `first-admin`, which drives `ServerAdmin` and `AdminCommand`
with typed answers. **A loosening of the door or of `People` is tried on `people.test.ts`**
(it imports the source); **one of `packages/domain/src/people.ts` on that package's
`people.test.ts`** (the API reads the domain's built code); **one of the server command on
its story** (`tsc --build`, then `node packages/scenarios/src/cli.ts first-admin`). A script
that swaps one string and reads the run must count `Failed Tests`, not the word "failed" in
lower case (seen 2026-10-07: a run read that way called every caught loosening slipped).

`people-changes.test.ts` (ADR-427) is a page of people, a person changed, a role changed and out of the archive; it starts from `test/support/setup.ts` and hands `worldOn` an `Outbox` where it reads the mail. **The contracts' `endpoints` list is in path order** (two methods of one path together): `packages/contracts/test/endpoints.test.ts` fails otherwise. A loosening of `People` is tried on it and on `people.test.ts`.

`phones.test.ts` (ADR-428) is the firm's phones and its master passcode; **it holds the exact list of the endpoints that take `DISPATCH`** (a new one is added there on purpose). A test that moves the clock sets `served.clock.at` **before** it signs in: an access token is good for five minutes. The installation's own master passcode is unknown to a test: it reads the version in force and changes it inside its undone piece of work. A loosening of `Phones` or `MasterPasscode` is tried on it (it imports the source); one of `packages/domain/src/phones.ts` or `DispatchRights` on that package's `phones.test.ts`.

`setup-endpoints.test.ts` (ADR-424) writes, as `people.test.ts` does: setup's requests by scenario ID, each tried as nobody, a manager/analyst without Setup and a read-only viewer; **it holds the exact list of the endpoints that take `SETUP`** (a new one is added there on purpose). **`setup-pricing-endpoints.test.ts` (ADR-425)** is forms, pay items, "Pays when" and rules; **`setup-sites-endpoints.test.ts` (ADR-426)** is sites, the map, the merge and the setup as it stands (it holds who may ask the setup check and the lookups); all three start from `test/support/setup.ts` (`ask`, `saved`, `told`, `plainly`, `notSaved`, `p1`, `p1Priced`), and a later part's file does too. **A merge's queueing is proven by the story `p1-reviewed`**, so a loosening of it is tried there (`tsc --build` first). **A refusal by the database ends the test's piece of work: it is the test's last request**, one refusal a test. `database-refusal.test.ts` needs no stack. **A loosening of a setup controller, `SetupService.setup`, the error filter or `database-refusal.ts` is tried on those three files** (they import the source); **one of an endpoint's definition or of `SetupRights` needs `./node_modules/.bin/tsc --build` first** (the API reads the contracts' and the domain's built code), and again once the source is back.

`pnpm installer:check` (27 `✓`) ends with `✓ apps/worker/.env names the map servers the worker asks`, `✓ the API answers over HTTPS at https://api.adms.localhost/health` and `✓ the worker answers its health check in the local stack`.
`pnpm local:down` removes eight containers and the network (9 `Removed` lines). Only this project:
`./node_modules/.bin/vitest run --project @open-adms/api`. **A loosening of the log, the error filter, the boundary, the headers or the CORS list is tried on
`error-filter.test.ts` and `boundary.test.ts`** (change the source, run the file, put the source back
from a copy kept in the scratchpad): it imports the source, so no build is needed.

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

## 1.4 The scenario harness (ADR-275)

`packages/scenarios`: `pnpm scenarios [name…] [--keep]`, `pnpm scenarios list`, `pnpm scenarios
clean`. Each story gets a new database `adms_story_…` on the local stack (made by its administrator,
owned by `adms_owner`, open only to the logins), migrated through `packages/db/prisma.story.config.js`
and seeded, and it's dropped afterwards, pass or fail; a story never touches `adms`. `--keep` leaves it
to look at; `clean` drops every leftover (only while no story runs; `installer:teardown` can't drop
`adms_owner` while one is left, C28). A story is a `Story` in `packages/scenarios/src/stories/`, listed
in its `index.ts`; the runner's test runs every listed story in `pnpm test`, so a new story joins the
chain by itself. A story's context carries `policy`, the release's policy values read from
`packages/domain/policy.env` (`src/policy.ts`; held to the release's values, the worker's five among them (5 tries, 10 minutes, 5 s, 30 s, 10 connections; ADR-419) and a job's size (200 tickets, ADR-420), by `test/policy.test.ts`,
which needs no database), and `src/stories/p1.ts` sets up P1's client, declaration event and project
for both of today's stories (ADR-303), its prime and its contract with them (ADR-305). After a run, `adms` still holds only the seed (1 user, 1 master passcode version,
the lists' 94 values, 96 audit records). Every story's database is seeded with the same made-up master passcode's hash
(`story-database.ts`); today's stories: `numbering` (ADR-323: blocks cut, topped up, reclaimed and retired through `apps/api`'s `NumberAllocator`; control ranges), `ticket-101001`, `dispatch-monday` (ADR-281; its unit rate
monitor's pay items, ADR-286) `certification` (ADR-321: P1's trucks and crews certified through `apps/api`'s `Certifications`) and `setup` (ADR-316: the example world's setup through `apps/api`'s
setup services; the policy values are read by `apps/api/src/policy.ts`, which the harness
re-exports). **If a workspace's `dist/` is stale** (a story stops on `Cannot find module …/dist/….ts`),
rebuild it with `./node_modules/.bin/tsc --build --force <workspace>`; never edit `dist/`.

## 1.5 The security checks (ADR-276)

`pnpm security` (`tools/security`), REQ-018. Exit 1 if any check fails.
- **Dependency audit**: `pnpm audit`. Every advisory, at any severity, fails, unless accepted by its
  GitHub advisory id in `pnpm-workspace.yaml` `auditConfig.ignoreGhsas`, each with an ADR saying why it
  can't be reached; the accepted ones are named on every run. Never add one to get green.
- **Secrets scan**, over exactly the files a commit of the whole folder would take (tracked, plus
  untracked and not ignored): secretlint's recommended rules; the installation's own secrets (every
  secret value in the four env files); a password-like setting with a literal value in a config file.
  A finding prints **file, line and rule only**; secretlint's own JSON carries every file's content,
  so never print it. An inline `secretlint-disable-next-line` needs its reason on the line; every one
  is listed on each run.
- **Env files**: every `.env` file on disk ignored by git and untracked.
- **The grant tests**: the `@open-adms/db` project again, its counts reported.

## 1.6 Not in the chain yet

ARCHITECTURE §15's layers arrive with their milestones; each adds its command here when it lands.

| Layer | Arrives in |
|---|---|
| ~~The **golden mission** as a story (REQ-017)~~ | ✅ in the chain since ADR-368: `pnpm scenarios golden-mission` (27 checks; its expected figures are `spec/golden/MISSION.md`'s and change only at the user's word) |
| **Unit** tests of real rules (the capacity math is in, ADR-320; number blocks, ADR-323; volume and apportionment, ADR-343; the checks between field events, on the certification and on time, ADR-344; the checks on place, ADR-346; the checks on quantity, the pay item's settings, unit rate work and ROEs, ADR-347) | Phase 1 |
| API (begun: `apps/api/test`, ADR-385, §1.3b), browser end-to-end, on device | Phases 2–4 |

## 1.7 Definition of done

Every command above exits 0, **with the actual output pasted**: the test counts, the licence line.
Not "should pass": observed to pass. If something fails, say so with the failure text. Never report
success you did not see.

**Never relax a threshold or a unique constraint to make a test pass**: thresholds are policy
(built-in defaults in `.env`, project settings the firm changes). Never skip, `.only` or delete a
failing test to get green; a failing test is reported.

---

## History

What this page used to say, and why it changed. Never run the left-hand side.

- **Until 2026-09-29 (ADR-259):** the chain verified the historical code in `database/` (ADR-093:
  read-only reference, never extended). It was, from `database/` and `database/python/`:
  `docker compose up -d` (the historical root compose file, KD-59); `npm install && npm run
  db:migrate`; `npm run typecheck`; `npm run db:seed`; `python -m pytest tests/ -v` (71 collected:
  58 pure in `test_gps.py` + `test_validators.py`, 13 DB integration in `test_reconciler_db.py`);
  the reconciliation engine `python -m reconciliation` with `curl http://localhost:8001/health`;
  Prisma Studio `npm run db:studio`. Done meant a clean typecheck and the full pytest suite green
  with counts. → Replaced by the rebuild's chain above (TypeScript end to end, ADR-094; pnpm, ADR-255;
  Vitest, ADR-259). The rule "report real output; never relax a threshold" is carried forward.
- ADR-231 (2026-09-29): during the scaffold, each sub-task was verified by its BACKLOG "Done when"
  instead of this page's commands, until 0.2.2 rewrote it. KD-57's last item; closed.
