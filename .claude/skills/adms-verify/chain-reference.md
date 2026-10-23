# The chain, command by command (the reference beside `adms-verify`)

> Moved here word for word from the skill's own page by ADR-594, so the skill loads small. **Read
> the section you need (`grep -n '^## '`), never the whole page**: what each command proves, what a
> pass looks like, the local stack, the installer, the schema, where tests live, each layer's
> tests, the scenario harness, the security checks, loosenings, done. Today's counts are
> `agent_store/CHAIN.md`'s, written by `pnpm chain record` (ADR-594), never by hand: where the text
> below says to replace a number there, record instead.

# PART 1 — THE CHAIN

Run everything from the repository root. An agent's shell doesn't load `~/.zshrc`, so a bare `node`
finds Homebrew's 25; **start every command with** `eval "$(fnm env --shell zsh)"` (then `node -v` →
v24.x) (ADR-233). The repo pins pnpm 11.27.1 in `packageManager`; the global pnpm switches to it by
itself (ADR-255).

**First, every time: `pnpm ready`** (ADR-445). It is `pnpm local:up`, then `pnpm installer:check`:
the stack up and healthy, the API's and the worker's containers running what is built now, and the
installation re-checked without changing anything (the `✓` count is CHAIN.md's; exit 0). **A `✗` or
exit 1 is fixed before anything else runs:** `✗ migrations` (a migration made in another session
is not applied here) is `pnpm installer` (a rerun: one confirm, `printf 'y\n' | pnpm installer`);
the whole test run fails by the hundred otherwise, and a run is lost (seen 2026-10-09: 176 failed).
If every `docker` call answers 500, quit and reopen Docker Desktop; if `up` then meets `RWLayer …
is unexpectedly nil` or `ECONNRESET`, `pnpm local:down` and `pnpm ready` once more.

**The whole chain is one command: `pnpm chain`** (ADR-533; `tools/chain`). It runs the steps below
in this order (`local:up` and `installer:check`, which are `pnpm ready`; the frozen install;
typecheck; test; scenarios; e2e, the field app's browser tests, ADR-564; security; lint; licences), keeps each one's whole output in
`.cache/adms/chain/NN-<step>.log` (emptied at each run, a run of some steps too), and prints one summary: each step's ✓ or ✗ and its time, its key
lines, what failed **by name** (a test from Vitest's report, a story's check, a security ✗, an ESLint
problem by file and place, a licence refused), then **the counts held against `agent_store/CHAIN.md`**
(`≠` differs, `+` not written there, `−` written there and not seen), then `The chain: N passed, N
failed, N not run, in …`. A failed `ready`, install or typecheck stops the run (the rest would fail
by the hundred). Exit 0 only when every step passed; a count that differs is printed, not failed:
it is a finding, or the count a task changed, and CHAIN.md is then replaced. `pnpm chain <step…>`
runs some (`pnpm chain ready test security`), `--fresh` is passed to `pnpm security`. **It takes
about ten minutes, past the Bash tool's ten-minute limit: run it in the background** and read its
summary when it ends; open a step's log only when the summary names a failure. It leaves the stack
up (the close-out stops it). Every command below still runs on its own, and this page still says
what each proves.

```bash
eval "$(fnm env --shell zsh)"
pnpm chain                       # all of what follows, one summary (above)
pnpm ready                       # the stack up, the installation at head and re-checked (above)
pnpm install --frozen-lockfile   # the committed lockfile, the supply-chain policy
pnpm typecheck                   # pnpm generate (the Prisma client), then tsc --build
pnpm test                        # tsc --build, then vitest run: one run, real counts
pnpm lint                        # ESLint (type-aware) + Prettier check
pnpm licences                    # every installed package's licence against ADR-171
pnpm openapi                     # after a changed endpoint: writes apps/api/openapi.json (§1.3b)
pnpm local:accounts --show       # the dev stack's accounts, to sign in by hand; without --show it writes them (ADR-412)
pnpm installer:admin             # on a firm's server: its first admin, or an admin's way back in (asks; ADR-415). Never run it against `adms` to try it: what it writes can't be deleted (its proof is the story `first-admin`)
pnpm scenarios                   # every story, each on its own database (§1.4)
pnpm e2e                         # the field app built, then its browser tests through Caddy (browser-tests.md)
pnpm security                    # audit, secrets scan, env files, grant tests (§1.5); after pnpm test
```

| Command | What it proves | A pass looks like (counts: `agent_store/CHAIN.md`) |
|---|---|---|
| `pnpm install --frozen-lockfile` | The lockfile matches every `package.json`; no version younger than 7 days; no install script ran (none is allowed); no git or tarball sub-dependency (ADR-255) | `✓ Lockfile passes supply-chain policies`, exit 0; with everything already installed, `Already up to date`, exit 0 |
| `pnpm typecheck` | Generates the Prisma client (`pnpm generate`, into the git-ignored `packages/db/src/generated/`; also run first by `test` and `lint`, ADR-273), then strict TypeScript across every workspace **and its tests**, through project references (ADR-256) | `✔ Generated Prisma Client (7.10.0)`, then exit 0 with no output after `tsc --build` |
| `pnpm test` | Typechecks, then Vitest runs every project in `vitest.config.js` (ADR-259); the database tests, the API's, the worker's container's and the map servers' need the local stack up and the installation at head (`pnpm ready`). **The stories are not run here** (ADR-446): `pnpm scenarios` runs them, once. It keeps its report in the git-ignored `.cache/adms/test-run.json` for `pnpm security` | `Test Files N passed (N)`, `Tests N passed (N)`, no file failed; the totals and each project's are CHAIN.md's |
| `pnpm lint` | ESLint's type-checked rules (floating promises, `any`, unsafe access…) on all code and tests; Prettier formatting (ADR-257) | `All matched files use Prettier code style!`, exit 0 |
| `pnpm licences` | No licence refused or undecided (ADR-258, 260) | `N packages: N allowed, 0 refused, 0 undecided.` The package count moves with dependencies (and is one less on Linux: the lockfile's Mac-only packages aren't installed there); **0 refused, 0 undecided** doesn't |
| `pnpm scenarios` | Every story passes on its own database, which is dropped afterwards (ADR-275; needs the local stack and the installation). **A run of several stories migrates and seeds once**, into a template each story's database is a copy of (ADR-447); the template is dropped at the end | `This run’s template, adms_story_template_…: N migrations applied; seed: …`, per story `passed: N checks, N passed, 0 failed` (each story's count is CHAIN.md's), then `Stories: N passed, 0 failed.`, exit 0 |
| `pnpm e2e` | The field app's browser build, built now, served at `https://field.adms.localhost` through Caddy and driven in Chromium as a phone: its door, its page's policy and headers, the API across origins, its words (ADR-564, 565; `browser-tests.md`; needs `pnpm ready`) | `N passed (…s)`, no `✘`, exit 0 (N is CHAIN.md's) |
| `pnpm security` | The dependency audit, the secrets scan (of what git would commit, and of the field app as built, AC-11-72), the env files, who reaches Postgres (REQ-205, ADR-508) and the grant tests, with real counts; never prints a secret (§1.5; needs the registry, the local stack and the installation) | `✓ 0 open advisories` (3 accepted by id), secretlint `0 found`, the installation's own secrets `0 found`, a password-like setting `0 found`, a whole slow hash, an authenticator's secret or a private key as a JWK `0 found`, env files `✓ every one ignored by git and untracked`, the built field app's three scans `0 found` (it builds the field app first), four `✓` under "Who reaches Postgres", the grant tests `N files, N tests: N passed, 0 failed` followed by where they were run (§1.5), ending **`Security checks: N passed, 0 failed.`** (N is CHAIN.md's), exit 0. `source-map-js` is forced to 1.2.2 by an override (ADR-356, 372); nothing is let past the seven-day rule (ADR-385). Any ✗ is a finding, never accepted to get green |

**The counts live in `agent_store/CHAIN.md`, and nowhere else** (ADR-445). A task that adds or
removes tests, a story's checks, a migration or a package replaces the numbers there in the same
response: today's only, never a "before it…" chain (the reason for a change is the task's ADR and
its session-log line). This page, `NEXT.md` and `SUMMARY.md` carry no count. **A count that differs
from CHAIN.md without a reason is a finding, not noise.**

**The local stack** (ADR-263; Docker running). Run it after a change to `infra/local`, and before any
work that needs the database or the object store:

```bash
pnpm local:up       # generates infra/local/.env on a first run; fetches the map extract if it isn't in
                    # infra/local/.cache/maps/ and checks its pinned SHA-256; makes the stack's root
                    # and each service's certificate into infra/local/.generated/ where one is missing
                    # or ending (ADR-517); waits until all eight are healthy (ADR-525); checks the health page
                    # and both map servers over HTTPS
curl --cacert infra/local/.generated/caddy-root.crt https://adms.localhost/health   # → ok
curl --cacert infra/local/.generated/caddy-root.crt https://routing.adms.localhost/status
curl --cacert infra/local/.generated/caddy-root.crt 'https://addresses.adms.localhost/status?format=json'
curl -sI http://adms.localhost/health                                               # → 308 to https
pnpm local:down     # containers and network removed; data volumes kept
```

| Command | What it proves | Expected today (2026-10-01, ADR-282) |
|---|---|---|
| `pnpm local:up` | Postgres, object store, mail catcher, the routing server (Valhalla), the address server (Nominatim) and Caddy healthy; the map extract matches its pinned hash; HTTPS verified against the stack's own root, which Caddy issues from; every hop inside the stack over TLS (ADR-517) | `Keeping the map extract delaware-260101.osm.pbf (SHA-256 matches its pin).`, `Keeping the stack’s root and every service’s certificate.`, eight `Healthy` lines (`routing-tls`, Valhalla's TLS, the seventh; `objectstore-tls`, the object store's, the eighth, ADR-525), then `https://adms.localhost/health → 200 ok`, `https://routing.adms.localhost/status → 200 {"version":"3.9.0",…` and `https://addresses.adms.localhost/status → 200 OK`; then, once the installer has run, the API is built, its container started afresh (`Starting the API’s container afresh on what was just built.`) and `https://api.adms.localhost/health → 200 {"status":"ok"}` (ADR-385, §1.3b), and the same for the worker: `the worker’s health answer → 200 {"status":"ok","jobsWaiting":0,"jobsSetAside":0,"oldestJobWaitingSeconds":0}` (ADR-419, 507, §1.3c). **A container that is the one `up` last started, still running, whose built code, mounted files and settings file are byte for byte what they were then, is kept** (`Keeping the API’s container: it runs what was just built, under the same settings.`; ADR-448): after a change to `apps/worker` alone only the worker's is made afresh, and after `pnpm local:down` both always are. A resume takes about 12 s; **a first run about two minutes** (it downloads the 20 MB extract, builds the road tiles and imports the addresses) |
| `pnpm local:down` | Nothing left running | 10 containers (8 before the installer has run; ADR-525) and the network `Removed`; `docker ps -a --filter label=com.docker.compose.project=open-adms-local` empty |
| `pnpm local:wipe` | The next `up` is a first run | volumes, `.env` and `.generated/` (the stack's root and certificates with it) removed; the downloaded map extract in `.cache/maps/` is kept (public data) |

**Docker's disk.** On this machine Docker Desktop's disk is 8 GB and the stack leaves under 1 GB
free. `No space left on device` in a container's log means it's full: stop, free space (the two map
servers' volumes, `open-adms-local_routing_data` and `_addresses_data`, are rebuilt from the extract
by the next `up`), never widen an import to "see if it fits". Every `docker` call answering 500 means
Docker Desktop's engine is stuck: quit and reopen it (ADR-282).

**Start it for the task, stop it at the end** (ADR-277): `pnpm local:up` when a task needs it (the
installer, the db tests, `pnpm scenarios` and `pnpm security` do), and `pnpm local:down` at
close-out (`adms-close-out` §0), unless a run goes on to the next milestone (`adms-work`). Expect it stopped
at the start of a session. One-off containers run with `--rm`.

Never print `infra/local/.env`, and never pass a key as a curl argument that could be echoed: load it
in a subshell (`set -a; . infra/local/.env`). If `up` says `.env` is missing but the volumes exist,
the old passwords are gone: `pnpm local:wipe`, then `up`.

**The installer** (ADR-266; brings the stack up itself). Run it after a change to `tools/setup`, and
before work that needs the database logins (0.3 on):

```bash
pnpm installer            # first run: four questions (the firm, what it calls its ADMS, email, the
                          # master passcode; answers may be piped, one per line);
                          # rerun: says what it knows, re-checks it, asks once to resume;
                          # a database that was lost: it asks for the master passcode again
pnpm installer:check      # re-checks only, changes nothing; exit 1 if anything is off
pnpm installer:teardown   # asks for the word `teardown` (or --yes); the next run is a first run
```

| Command | What it proves | Expected today (2026-10-01) |
|---|---|---|
| `pnpm installer` (first run) | Secrets made once into owner-only env files; four logins from SCRAM verifiers; database `adms` open only to them; the master passcode's slow hash handed to the seed in memory and kept in the database alone, never in a file (ADR-281) | `+ wrote` ×3, `+ created login` ×4, `+ created database adms`, `adms_shadow` and `adms_test` (migrated and seeded after `adms`), `✓ adms_owner, which runs the migrations, is under no statement timeout`, `+ set: a statement of … is stopped after 30000 ms (STATEMENT_TIMEOUT_MS)` ×3 (ADR-394, 396), `✓ … opens adms with its own password` ×4, `All migrations have been successfully applied.`, `+ created the system actor, Open ADMS (system)`, `+ kept the master passcode's slow hash in the database, version 1`, `+ wrote 94 values to the firm's lists (…)` (ADR-302), `Installed for …`; `packages/db/.env` holds only `DATABASE_URL` |
| `pnpm installer` (rerun) | Resume without new secrets; migrations at head (ninety-seven today; `packages/db/prisma/migrations/` is the list); the seed re-checks the system actor and stops if it was changed (ADR-273); the install stops if `guard_gaps()` lists an unguarded table; a migration whose SQL is still only comments is refused, not applied | 25 `✓` lines (`✓ adms_owner, which runs the migrations, is under no statement timeout`, ADR-396, and three `✓ a statement of adms_api / adms_worker / adms_readonly is stopped after 30000 ms (STATEMENT_TIMEOUT_MS)`, each read signed in as that login, ADR-394; a login with another value or none is `✗` there and `+ set:` on the resume; an owner's timeout or one kept for a login in one database is `- took off …` on the resume), ending `✓ migrations at head (Database schema is up to date!)`, `✓ every table is guarded` (ADR-271), `✓ the master passcode's slow hash is kept in the database alone (Argon2id, version 1)` (ADR-281) and `✓ the system actor is the seed's, alone, unchanged and guarded` (ADR-276); one confirm; `No pending migrations to apply.`; `✓ the system actor exists, Open ADMS (system)`; `✓ the master passcode's actor exists, Master passcode` (`+ created the master passcode's actor, Master passcode` on the first rerun after ADR-439's migrations); `✓ the device key's actor exists, Device key` (`+ created …` on the first rerun after ADR-440's); `✓ the master passcode's slow hash is kept, version 1`; `✓ the firm's lists are as the firm keeps them, each built-in value in place` (ADR-302); `shasum` of the three env files unchanged |
| `pnpm installer` (the database lost) | The logins and the database come back with the secrets it has; the master passcode, kept only in the database, is asked for again (ADR-281) | `The database holds no master passcode (it went with the database). Set it again:`, then `+ kept the master passcode's slow hash in the database, version 1`; with no answer it stops, exit 1; env files unchanged |
| `pnpm installer:teardown` | The next run is a first run | `adms`, `adms_shadow`, `adms_test` and four logins dropped, three env files and the record removed |

**The schema** (ADR-267, 268): after a change to `packages/db/prisma/schema/`, in `packages/db`, `./node_modules/.bin/prisma validate`, then `./node_modules/.bin/prisma migrate dev --create-only --name <what>`, reviewed, then `pnpm installer` to apply it. Never edit a generated or applied migration (ADR-113). **Everything else about a migration, a guard's stub, a backfill, and how each table's tests are written is `schema-and-migrations.md`: read it before the first of them.**

Never print the env files (`apps/api/.env`, `apps/worker/.env`, `packages/db/.env`); to prove
nothing was rotated, compare their `shasum`s, never their contents. To script a first run without
showing the passcode: `pc=$(openssl rand -base64 18)`, then pipe `"$pc"` twice.

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
migrations, read from the catalog exactly and tried as each login. **They need the local stack and
an installation at head** (`pnpm ready`); without them they fail and say so, never skip. Each
test's work is rolled back; the project's files run one at a time. A new table or guard adds its
expectations in the same response: the grant, trigger and policy lists are exact.
Only this project: `./node_modules/.bin/vitest run --project @open-adms/db`.
**How each table's tests are written, the example world's helpers, a throw-away copy of `adms`
and how a guard's loosening is tried: `database-tests.md`.**

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

`apps/api/test`, by scenario ID of `spec/acceptance/10-api-and-sync.md`; its files run one at a
time. Most **need `pnpm ready`**: a test that writes runs in one piece of work on the
installation's test database, `adms_test` (never `adms`, the firm's), undone afterwards. **After a change to an endpoint in
`packages/contracts`, `pnpm openapi`** (`boundary.test.ts` fails on a stale file). **The API's
container runs what was built when it started: after any change to `apps/api`, `pnpm local:up`
again** (`door.test.ts` asks the container). Several files hold **exact lists** an endpoint joins
on purpose (who may call what). Only this project: `./node_modules/.bin/vitest run --project
@open-adms/api`.
**Each file's helpers, the exact lists and which file a loosening is tried on: `api-tests.md`.**

## 1.3c The worker's tests (ADR-419)

`apps/worker/test`: the map servers' answers and the worker's container **need `pnpm ready`**;
`process.test.ts` needs nothing. **After any change to `apps/worker`, `pnpm local:up` again.** How
the worker takes jobs up, and what queues work, are proven by stories (`p1-queued`, `p1-reviewed`,
`p1-voided`, `p1-invoiced`, `p1-left-out`). Only this project: `./node_modules/.bin/vitest run
--project @open-adms/worker`. **The rest: `worker-tests.md`.**

## 1.4 The scenario harness (ADR-275)

`packages/scenarios`: `pnpm scenarios [name…] [--keep]`, `pnpm scenarios list`, `pnpm scenarios
clean`. Each story gets a new database `adms_story_…` on the local stack (made by its administrator,
owned by `adms_owner`, open only to the logins), migrated through `packages/db/prisma.test.config.js`
and seeded, and it's dropped afterwards, pass or fail; a story never touches `adms`. `--keep` leaves it
to look at; `clean` drops every leftover (only while no story runs; `installer:teardown` can't drop
`adms_owner` while one is left, C28). A story is a `Story` in `packages/scenarios/src/stories/`, listed
in its `index.ts`; **`pnpm scenarios` runs every listed story, and it is the only place they run**
(ADR-446: `pnpm test` ran each a second time until 2026-10-09), so a new story joins the chain by
itself. **A run of more than one story makes a template first** (`adms_story_template_…`: migrated
and seeded once, as a story's database always was) **and each story's database is a copy of it**,
made file by file (`STRATEGY FILE_COPY`), locked down and checked as before, since Postgres copies
no access list; the template is dropped when the run ends, and `clean` drops one a killed run left
(ADR-447). One story named alone is migrated and seeded by itself, as before.
**A story's phones reach the API's own process over HTTPS** (ADR-492): the runner starts it on
the story's database and clock at 127.0.0.1:3180, and the stack's proxy serves it as
`https://stories.adms.localhost` (502 while no story runs). So **`pnpm scenarios` needs the stack
up**, and only one run of the stories at a time (a second is told the port is held).
`packages/scenarios/test/story-api.test.ts` holds the way to it; a loosening of `story-api.ts` or
`over-https.ts` is tried there and on `sync`, `interrupted-upload` and `dispatch-monday`.
**Every request a story's phone makes goes there** (ADR-493): enrolment, a monitor created, a
sign-in, the passcode's session and choices, its lists, a sync, a file's part, the turn-in
(`StoryApi.requests`); the phone holds its monitor's session beside its token, and
`story.phonesOn(clock)` puts all of them on a clock of their own (field days told again). A
loosening of the runner's phone requests is tried on `story-api.test.ts` with
`under-the-passcode`, `p1-reconciled`, `p1-reviewed` and `dispatch-monday` (seven took about ten
minutes). **A story whose clock goes back before a phone's last proof stops at that phone's next
request**: tell it in time order.
**The back office and the viewers reach it at their browsers** (ADR-496): `story.backOffice.admin`
(the first admin's password set on the server), `.person(admin, person)` (a first password from
that admin at its endpoint) and `.signedOut`, each an `OfficeBrowser` (`office-browser.ts`):
email, password and authenticator code; the session only as cookies; CSRF past a GET; refreshed
or signed in again when the story's clock moves on. **A person needs the address they sign in
with** on their record, and an authenticator's code is good once a step: a person signed out
signs in again only thirty seconds of the story's clock later. A loosening of it is tried on
`story-api.test.ts`. **A P1 story's reviewer is `p1BackOffice(story, office)`** (ADR-497:
`danas()`, `luiss()`, `grantLuis(...)` at `setPermissions`), and a refusal is read by
`refusalOf` (`403 NOT_ALLOWED`, or `422 NOT_SAVED · CODE: words`); a loosening of either is
tried on `p1-voided`, `p1-left-out` and `p1-reconciled`. No story writes a correction or its job
by hand: the endpoint queues its own. **QC marks, locks, batches and unlocks are requests too**
(ADR-500: `p1-invoiced`, `golden-mission`, and `p1-priced`'s lock of 101004, which stays between
Luis's reprocess request and the run); a loosening of them, or of the worker's look for a lock, is
tried on those three. **`p1-reviewed`'s acts are requests too** (ADR-501: corrections, renumbers, a
photograph's marks, an item line, an ROE's scope, a quarantined record, a record made in the back
office, a certification's box, its QC mark, lock and unlock); an act's answer only counts what it
queued, so a story reads a job's tickets from its rows (`jobTickets`). Its AC-10-50 check alone
calls `Corrections` in process, on purpose (the job queue made to fail). A loosening of a review
controller is tried on `p1-reviewed`. The story `certification`'s measurement and revocation and
`p1-left-out`'s revocation are requests too (ADR-502: `correctCertificationBox`,
`revokeCertification`); a blank reason or a height of 0 is the schema's `400` before any rule. A
loosening of the certifications' controller is tried on those two. `first-admin` keeps its own
sign-in parts in process, by ADR-502 (d): it is the server's command.
**`apps/api`'s and `apps/worker`'s indexes export only what `packages/scenarios` and
`infra/local` read** (ADR-503; `packages/scenarios/test/app-exports.test.ts`, no database): a
story that stops calling a service takes it out of the index in the same task, and a new reader
of either app joins the test's folders on purpose.
**The story `burst` is the load test** (ADR-505): a thousand loads from 54 phones syncing at
once (`Promise.allSettled`, so a refusal stops it only once every phone is done), then the
worker's loop; about two minutes alone, most of a `pnpm scenarios` run. **A phone answered `429
LIMITED` is told to wait** (`ToldToWait`, thrown by `StoryApi` as `NoSignal` is by a story's
server): it waits on its clock until the instant it was told and sends the same again; ten in
a row stops the story. Its lines `It took …` are measurements, written down in the task's ADR,
never checked. A loosening of the phone's wait is tried on `sync-client.test.ts` (seconds);
one of `StoryApi`'s translation of a 429 on `burst` alone. **A story's API, once closed, refuses a
request still in flight** (it never starts again unseen, holding the port for the rest of the
run), and **one phone's requests at once share its one proof** (ADR-505; `story-api.test.ts`).
`packages/scenarios/test/stories.test.ts` holds a copy to what a database made by itself is (at
head, every table guarded, `adms_owner`'s, open to the logins alone) and the runner to its word. A story's context carries `policy`, the release's policy values read from
`packages/domain/policy.env` (`src/policy.ts`; held to the release's values, the worker's five among them (5 tries, 10 minutes, 5 s, 30 s, 10 connections; ADR-419) and a job's size (200 tickets, ADR-420), by `test/policy.test.ts`,
which needs no database), and `src/stories/p1.ts` sets up P1's client, declaration event and project
for both of today's stories (ADR-303), its prime and its contract with them (ADR-305). After a run, `adms_test` still holds only the seed (3 users, 1 master passcode version,
the lists' 94 values, 98 audit records). Every story's database is seeded with the same made-up master passcode's hash
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
  **Phase 2's kinds (ADR-508)**, which secretlint has no rule for: a whole Argon2 hash (salt of
  16 bytes or more, tag of 32 or more), an `otpauth://` address holding a secret, a private key
  as a JWK (`d`). A test's own vector of such a kind is marked on the line before with
  `secretlint-disable-next-line -- <why>`; without a reason it isn't honoured. **A test of the
  scan itself puts its values together** (a variable in a template literal), never writes one
  whole: the scan reads that file too, and ESLint refuses a template around a bare literal.
- **Env files**: every `.env` file on disk ignored by git and untracked.
- **Who reaches Postgres** (REQ-205, ADR-508; `tools/security/src/database-reach.ts`): of the
  product only `packages/db`, `apps/api` and `apps/worker`, three tools named by folder with
  their reasons (never by package name: AC-10-26 forbids naming the dev stack's package in what
  ships); found by `pnpm -r why` and the workspaces' own dependencies, and by every committed
  source file's imports; the product's SQL only Prisma's tagged templates, none changing the
  schema; `prisma migrate diff` from the migrations to the schema on the shadow database (needs
  the stack). A new tool that must reach Postgres joins `toolReaches` with its reason and an ADR.
  Its rules are loosened on `database-reach.test.ts` and `checks.test.ts`; what only a real run
  shows (a stray import, a table by hand in a copied migrations folder) by hand.
- **The grant tests**: the `@open-adms/db` project's tests, their counts reported. **Run `pnpm
  security` after `pnpm test`:** where the run `pnpm test` just made held every one of that
  project's files, each passed with nothing skipped, it began within the last thirty minutes, and
  no file of the code (`apps/`, `packages/`, `tools/`, `infra/`, `spec/`, the root's config) or an
  env file has changed since it began, its counts are reported and the tests are not run a second
  time (ADR-446); the line ends `(the run \`pnpm test\` made N min ago; nothing has changed
  since; …)`. Anything else and they are run here, the line ending `(run here: <why>)`.
  `pnpm security --fresh` always runs them (its own run's report goes where `ADMS_TEST_REPORT`
  says, ADR-460: after a change to `grants.ts` or the run's reporters, run it with `--fresh`
  once). A run on a throw-away copy (`ADMS_TEST_DATABASE`)
  keeps no report. The rule is `tools/security/src/grants.ts`'s, held by `checks.test.ts`.

## 1.5a Loosenings: one list, one command (ADR-445)

A rule or a guard is proven covered by loosening it and seeing a test fail. **Write the list
once and run it in one command**, never one edit, run and restore at a time:

```bash
node .claude/skills/adms-verify/loosen.mjs "<scratchpad>/loosen.json"
```

The plan names the command to run, a build where the tests read built code (`dist/`), and each
loosening as one string swapped in one file (the script's own header shows the shape). It checks
the tests pass first, swaps each string, runs, **puts the file back byte for byte whatever
happens**, and answers per loosening `caught`, `SLIPPED` or `not tried` (the string wasn't in the
file exactly once: it proves nothing, fix the plan). Each run's output is kept beside the plan.
Report its last line as seen.

- **What to list:** each branch of the rule this task added or changed, and each new check of a
  new guard. Not what an earlier task already proved.
- **What to run:** the one or two test files that hold the rule (the layer's page says which), or
  the story that proves a service (`["node", "packages/scenarios/src/cli.ts", "p1-voided"]` with
  `"build": ["./node_modules/.bin/tsc", "--build"]`).
- **A guard in the database** is loosened on a throw-away copy of `adms_test`, not by this script:
  `database-tests.md`.
- A `SLIPPED` is a finding: add the test, or say why the rule is doubled by construction.

## 1.6 Not in the chain yet

ARCHITECTURE §15's layers arrive with their milestones; each adds its command here when it lands.

| Layer | Arrives in |
|---|---|
| ~~The **golden mission** as a story (REQ-017)~~ | ✅ in the chain since ADR-368: `pnpm scenarios golden-mission` (its count is CHAIN.md's; reconciled by the worker's own job loop alone since ADR-494; its expected figures are `spec/golden/MISSION.md`'s and change only at the user's word) |
| **Unit** tests of real rules (the capacity math is in, ADR-320; number blocks, ADR-323; volume and apportionment, ADR-343; the checks between field events, on the certification and on time, ADR-344; the checks on place, ADR-346; the checks on quantity, the pay item's settings, unit rate work and ROEs, ADR-347) | Phase 1 |
| ~~API~~ (in: `apps/api/test`, ADR-385, §1.3b); ~~browser end-to-end~~ (in: `pnpm e2e`, ADR-564; the back office's in Phase 4); on device | Phases 3 (iPhone, Android: 3.8, 3.9) and 4 |

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

