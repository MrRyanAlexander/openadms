---
name: adms-verify
description: Run the Open ADMS verification chain and report real observed output. Covers loading Node 24 through fnm, the frozen pnpm install, typecheck, the Vitest run with its expected counts, lint and format, the licence report, the clean-copy check after a dependency change, where tests live and how a workspace joins the run, and which ARCHITECTURE §15 layers are still to come. Use after any code or config edit, before closing out any code task, or whenever asked to verify, test, typecheck, or confirm the build is green.
---

<!-- skill-status: current (rewritten 2026-09-29, ADR-259; the local stack added, ADR-263; the installer, ADR-266; migrations through it, ADR-268; the database tests, ADR-272; the actor extension and the seed, ADR-273; the scenario harness, ADR-275; the security checks, ADR-276; the Phase 0 models and the master passcode in the database, ADR-281; the map servers, the guard hook's tests and the assignment's pay items, ADR-282, 283, 286; the historical chain is under History) -->

> **This page states today's chain** (through ADR-287). The rule never changes: **report real
> observed output, never "should pass".** The layers still to come are listed at the end of Part 1;
> the historical chain for `database/` is under History and is never run.

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
pnpm scenarios                   # every story, each on its own database (§1.4)
pnpm security                    # audit, secrets scan, env files, grant tests (§1.5)
```

| Command | What it proves | Expected today (2026-10-01, ADR-287) |
|---|---|---|
| `pnpm install --frozen-lockfile` | The lockfile matches every `package.json`; no version younger than 7 days; no install script ran (none is allowed); no git or tarball sub-dependency (ADR-255) | `✓ Lockfile passes supply-chain policies`, exit 0 |
| `pnpm typecheck` | Generates the Prisma client (`pnpm generate`, into the git-ignored `packages/db/src/generated/`; also run first by `test` and `lint`, ADR-273), then strict TypeScript across every workspace **and its tests**, through project references (ADR-256) | `✔ Generated Prisma Client (7.10.0)`, then exit 0 with no output after `tsc --build` |
| `pnpm test` | Typechecks, then Vitest runs every project in `vitest.config.js` (ADR-259); the database tests and the map servers' tests need the local stack up and the installation at head (§1.3, §1.3a) | **`Test Files 26 passed (26)`, `Tests 317 passed (317)`**: `domain` 1, `contracts` 3, `tools/setup` 9 (secrets 5, env files 3, the migration folder 1; ADR-270, 281), `tools/security` 76 in 2 files (the scan's rules 19, ADR-276; the agents' guard hook 57, ADR-283), `infra/local` 17 in 2 files (the map extract's rules 10; the routing and address servers over HTTPS 7; ADR-282), `packages/db` 198 in 16 files (the guards 100, ADR-272, 281, 286; the actor extension 10, ADR-273, 276; the system actor's guard 9, the migration history 1, the configuration against CIS 5, ADR-276; the time zone and times 21, the Monitor ID 15, devices, the master passcode and number blocks 20, assignments and their pay items 17, ADR-281, 286), `packages/scenarios` 13 in 2 files (the clock, ids and phone 9; the two stories and the runner 4, each on its own database; ADR-275, 281) |
| `pnpm lint` | ESLint's type-checked rules (floating promises, `any`, unsafe access…) on all code and tests; Prettier formatting (ADR-257) | `All matched files use Prettier code style!`, exit 0 |
| `pnpm licences` | No licence refused or undecided (ADR-258, 260) | `357 packages: 357 allowed, 0 refused, 0 undecided.` The package count moves with dependencies; **0 refused, 0 undecided** doesn't |
| `pnpm scenarios` | Every story passes on its own database, which is dropped afterwards (ADR-275; needs the local stack and the installation) | per story `passed: N checks, N passed, 0 failed` (`ticket-101001`: 15; `dispatch-monday`: 13), then `Stories: 2 passed, 0 failed.`, exit 0 |
| `pnpm security` | The dependency audit, the secrets scan, the env files and the grant tests, with real counts; never prints a secret (§1.5; needs the registry, the local stack and the installation) | `✓ 0 open advisories` (3 accepted by id), secretlint `0 found`, the installation's own secrets `0 found`, env files `✓ every one ignored by git and untracked`, the grant tests `16 files, 198 tests: 198 passed` (186 files scanned for secrets today). **Today it ends `6 passed, 1 failed`, exit 1:** the one finding is `docker-compose.yml:7 password-like-setting POSTGRES_PASSWORD`, the historical root file (KD-59) the user is to retire. Any other ✗ is a finding |

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
| `pnpm local:up` | Postgres, object store, mail catcher, the routing server (Valhalla), the address server (Nominatim) and Caddy healthy; the map extract matches its pinned hash; HTTPS verified against Caddy's own root | `Keeping the map extract delaware-260101.osm.pbf (SHA-256 matches its pin).`, six `Healthy` lines, then `https://adms.localhost/health → 200 ok`, `https://routing.adms.localhost/status → 200 {"version":"3.9.0",…` and `https://addresses.adms.localhost/status → 200 OK`. A resume takes about 12 s; **a first run about two minutes** (it downloads the 20 MB extract, builds the road tiles and imports the addresses) |
| `pnpm local:down` | Nothing left running | 6 containers and the network `Removed`; `docker ps -a --filter label=com.docker.compose.project=open-adms-local` empty |
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
| `pnpm installer` (first run) | Secrets made once into owner-only env files; four logins from SCRAM verifiers; database `adms` open only to them; the master passcode's slow hash handed to the seed in memory and kept in the database alone, never in a file (ADR-281) | `+ wrote` ×3, `+ created login` ×4, `+ created database adms` and `adms_shadow`, `✓ … opens adms with its own password` ×4, `All migrations have been successfully applied.`, `+ created the system actor, Open ADMS (system)`, `+ kept the master passcode's slow hash in the database, version 1`, `Installed for …`; `packages/db/.env` holds only `DATABASE_URL` |
| `pnpm installer` (rerun) | Resume without new secrets; migrations at head (nineteen today: the models, nine guards, the guard helper and its fix, the `SYSTEM` role, the system actor's guard, ADR-270…273, 276; the Monitor ID's issuer, the Phase 0 models and their guards, ADR-281; the pay item and an assignment's pay items, and their guard, ADR-286); the seed re-checks the system actor and stops if it was changed (ADR-273); the install stops if `guard_gaps()` lists an unguarded table; a migration whose SQL is still only comments is refused, not applied | 20 `✓` lines, ending `✓ migrations at head (Database schema is up to date!)`, `✓ every table is guarded` (ADR-271), `✓ the master passcode's slow hash is kept in the database alone (Argon2id, version 1)` (ADR-281) and `✓ the system actor is the seed's, alone, unchanged and guarded` (ADR-276); one confirm; `No pending migrations to apply.`; `✓ the system actor exists, Open ADMS (system)`; `✓ the master passcode's slow hash is kept, version 1`; `shasum` of the three env files unchanged |
| `pnpm installer` (the database lost) | The logins and the database come back with the secrets it has; the master passcode, kept only in the database, is asked for again (ADR-281) | `The database holds no master passcode (it went with the database). Set it again:`, then `+ kept the master passcode's slow hash in the database, version 1`; with no answer it stops, exit 1; env files unchanged |
| `pnpm installer:teardown` | The next run is a first run | `adms`, `adms_shadow` and four logins dropped, three env files and the record removed |

**The schema** (ADR-267, 268), after a change to `packages/db/prisma/schema/`: in `packages/db`, `./node_modules/.bin/prisma validate` (→ `The schemas at prisma/schema are valid`), then `./node_modules/.bin/prisma migrate dev --create-only --name <what>` to generate a migration, reviewed, then `pnpm installer` to apply it. Call the CLI through `./node_modules/.bin/prisma`: `pnpm exec` re-runs the install first. Never edit a generated or applied migration (ADR-113). Two things seen (ADR-281): `migrate dev --create-only` **applies any earlier migration still pending to `adms` itself** before it makes the new one (as `adms_owner`, like the installer; so write a stub's SQL before generating the next migration); and when the generated migration carries a warning it asks to confirm and needs a terminal: `(sleep 6; printf 'y\n'; sleep 8) | script -q /dev/null ./node_modules/.bin/prisma migrate dev --create-only --name <what>`.

Never print the env files (`apps/api/.env`, `apps/worker/.env`, `packages/db/.env`); to prove
nothing was rotated, compare their `shasum`s, never their contents. To script a first run without
showing the passcode: `pc=$(openssl rand -base64 18)`, then pipe `"$pc"` twice.

**Keep the expected column true.** A task that adds or removes tests updates the counts here in the
same response; a count that differs from this table without a reason is a finding, not noise.

## 1.1 After a dependency change: the clean-copy check

A new or changed dependency (a pin, a lockfile change, a new `allowBuilds` entry) is proven from a
clean copy, so nothing already on disk hides a missing piece. Copy the repo into the scratchpad
without `node_modules`, `dist`, `.git`, `database/`, `development/`, `spec/`, `agent_store/` and
`.claude/`, then run the whole chain there and paste its output. Every dependency needs its ADR
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
assignment and setup version). They also refuse a database without the
seed's master passcode. **The Monitor ID series on `adms` moves with every run** (a sequence isn't
rolled back); gaps are normal.

**The actor extension's tests** (`actor.test.ts`, ADR-273) connect instead **as the services' own
logins**, with the URL in `apps/api/.env` or `apps/worker/.env` read in the test process (never
printed), through `openDatabase` and `$write`. What a login writes can't be deleted, so each test's
work is undone by throwing out of `$write` (`test/support/service.ts`, `undone`); a committed
`$write` may only read. After a run the database holds only the seed: 1 user, 1 master passcode
version, 2 audit records.

- Only this project: `./node_modules/.bin/vitest run --project @open-adms/db`.
- **Proving a guard change is covered:** make a throw-away copy, change it, run the tests on it, drop
  it (no service may be connected to `adms` while it's copied):
  `CREATE DATABASE adms_mutation TEMPLATE adms OWNER adms_owner` (owned by `adms_owner`, or its
  owner's-rights triggers can't see the schema), then
  `ADMS_TEST_DATABASE=adms_mutation ./node_modules/.bin/vitest run --project @open-adms/db`, then
  `DROP DATABASE adms_mutation`. The admin commands go through
  `docker exec -i open-adms-local-postgres-1 psql -U postgres` (no password on the command line).
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

## 1.4 The scenario harness (ADR-275)

`packages/scenarios`: `pnpm scenarios [name…] [--keep]`, `pnpm scenarios list`, `pnpm scenarios
clean`. Each story gets a new database `adms_story_…` on the local stack (made by its administrator,
owned by `adms_owner`, open only to the logins), migrated through `packages/db/prisma.story.config.js`
and seeded, and it's dropped afterwards, pass or fail; a story never touches `adms`. `--keep` leaves it
to look at; `clean` drops every leftover (only while no story runs; `installer:teardown` can't drop
`adms_owner` while one is left, C28). A story is a `Story` in `packages/scenarios/src/stories/`, listed
in its `index.ts`; the runner's test runs every listed story in `pnpm test`, so a new story joins the
chain by itself. After a run, `adms` still holds only the seed (1 user, 1 master passcode version, 2
audit records). Every story's database is seeded with the same made-up master passcode's hash
(`story-database.ts`); today's stories: `ticket-101001`, `dispatch-monday` (ADR-281; its unit rate
monitor's pay items, ADR-286).

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
| The **golden mission** as a story (REQ-017) | Phase 1 |
| **Unit** tests of real rules (capacity math against the paper-form examples, `adms-certifications` §3A.3; volume, apportionment, time, number blocks) | Phase 1 |
| API, browser end-to-end, on device | Phases 2–4 |

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
