---
name: adms-verify
description: Run the Open ADMS verification chain and report real observed output. Covers loading Node 24 through fnm, the frozen pnpm install, typecheck, the Vitest run with its expected counts, lint and format, the licence report, the clean-copy check after a dependency change, where tests live and how a workspace joins the run, and which ARCHITECTURE §15 layers are still to come. Use after any code or config edit, before closing out any code task, or whenever asked to verify, test, typecheck, or confirm the build is green.
---

<!-- skill-status: current (rewritten 2026-09-29, ADR-259; the local stack added, ADR-263; the installer, ADR-266; migrations through it, ADR-268; the database tests, ADR-272; the actor extension and the seed, ADR-273; the scenario harness, ADR-275; the security checks, ADR-276; the Phase 0 models and the master passcode in the database, ADR-281; the map servers, the guard hook's tests and the assignment's pay items, ADR-282, 283, 286; the twentieth migration, ADR-301; the firm's lists, ADR-302; the client, the declaration event and the project, and the policy values, ADR-303; contractors on a project and contracts, ADR-305, 306; forms, debris types and the firm's own fields, ADR-308; pay items in full, ADR-309; disposal sites, the project map and `btree_gist`, ADR-310, 311; rules, ADR-313; people's permissions and viewers, ADR-315; the setup services and the story `setup`, ADR-316; the capacity math, ADR-320; certifications, the story `certification` and an empty guard stub, ADR-321; numbering and the story `numbering`, ADR-323; what every field event records, ADR-324; what each kind records, ADR-325; scale receipts and photographs, ADR-326; ROEs and forms, ADR-327; certification copying taken out, ADR-330; a scale receipt's number no longer unique, ADR-331; whether a viewer sees private citizens by name, ADR-336; a photograph's archive mark and label, ADR-337; intake, quarantine and two more stories, ADR-338; the derived records, ADR-340; grouping and status, ADR-341; quantities, ADR-343; checks and flags, ADR-344; nine more flags, ADR-345; checks on place and the geodesic library, ADR-346; the checks on quantity, unit rate work and ROEs, ADR-347; two more flags and the seventieth migration, ADR-348; mileage and the worker's first tests, ADR-349, 350; the historical chain is under History) -->

> **This page states today's chain** (last changed by ADR-343, as its status line lists). The rule never changes: **report real
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

| Command | What it proves | Expected today (2026-10-05, ADR-350) |
|---|---|---|
| `pnpm install --frozen-lockfile` | The lockfile matches every `package.json`; no version younger than 7 days; no install script ran (none is allowed); no git or tarball sub-dependency (ADR-255) | `✓ Lockfile passes supply-chain policies`, exit 0 |
| `pnpm typecheck` | Generates the Prisma client (`pnpm generate`, into the git-ignored `packages/db/src/generated/`; also run first by `test` and `lint`, ADR-273), then strict TypeScript across every workspace **and its tests**, through project references (ADR-256) | `✔ Generated Prisma Client (7.10.0)`, then exit 0 with no output after `tsc --build` |
| `pnpm test` | Typechecks, then Vitest runs every project in `vitest.config.js` (ADR-259); the database tests and the map servers' tests need the local stack up and the installation at head (§1.3, §1.3a) | **`Test Files 73 passed (73)`, `Tests 1534 passed (1534)`** (since ADR-352: the ninth story joins the stories' own test, one more; before it 1,533, since ADR-349, 350: what is kept of a mileage 9, `mileage.test.ts`, at the domain: needs no database; what the worker asks the map servers and the mileage it keeps 13, `apps/worker/test/mileages.test.ts`: **needs `pnpm local:up`**; before it 71 files and 1,511 tests since ADR-348: a scale receipt's net against its gross less its tare, and a disposal with two quantities, 5 more in `quantity-checks.test.ts`, and two more flags against the page; before it ADR-347: the checks on quantity 25, `quantity-checks.test.ts`, on unit rate work 29, `unit-rate-checks.test.ts`, and on ROEs and surveys 11, `roe-checks.test.ts`, at the domain: need no database; before it ADR-346: distance and a point in a shape 9, `geodesic.test.ts`, and the checks on place 29, `place.test.ts`, at the domain: need no database; before it ADR-345: a record that should not have been possible 10 more at the domain, and nine more flags against the page; before it ADR-344: the checks between a ticket's field events, on the certification and on its times 33, and the flag catalogue, its facts and their hash 11, at the domain; the catalogue against `spec/FLAGS.md` itself 67, in `packages/scenarios`; before it ADR-343: the quantities 25 at the domain; before it ADR-341: which field events are one ticket, its shape and its status 24 at the domain; before it ADR-340: the derived records by scenario ID 17 at the database, seven more in the grant file for the five new viewed tables and the two no viewer reads, and one fewer in `checks.test.ts`, whose completed-load test became AC-06-145 and 146's; before it ADR-338: what the server decides about an arriving record 8 at the domain, a record waiting in quarantine and a fix kept as sent 10 at the database and one more in the grant file for the new viewed table, the phone's answers, photographs, tandem receipt and surveys 3 and two more stories; before it ADR-337: a photograph removed from the record and labelled 2 at the database, AC-04-102 and 103; before it ADR-336: a new viewer's settings 1 at the domain, whether a viewer sees private citizens by name 5 at the database; before it ADR-334: what an incident offers 4 at the domain, 3 at the database; ADR-332: the pay item from the bands 8, the phone's capture 14, a sixth story): `domain` 411 in 25 files (what is kept of a mileage 9, ADR-349, 350; the checks on quantity 30, ADR-347, 348, on unit rate work 29 and on ROEs and surveys 11, ADR-347; distance and a point in a shape 9 and the checks on place 29, ADR-346; the checks 43, ADR-344, 345, `checks.test.ts`, and the flag catalogue, a flag's facts and their hash, and the project's clock 11, `flags.test.ts`, ADR-344: need no database; the quantities 25, `quantities.test.ts`, ADR-343: needs no database; grouping and status 24, `tickets.test.ts`, ADR-341; a GPS fix as sent and what a quarantined record's phone is told 8, ADR-338; a new viewer's settings 1, ADR-336; what an incident offers 4, ADR-334; what each kind of field event records 10, ADR-325, 326, 327; numbering: the series, the server's book, a phone's numbers, control ranges and a new project's series 27, and the three block-size policy values in the policy tests, ADR-323; a sub typed at certification, a certification's later changes and a merge of two spellings 16, ADR-321; the capacity math 24, ADR-320: needs no database; reading a map's shapes 7, ADR-316; rules: the criteria a form takes, "Is valid", the copy refused, the overlap warned, "Pays when" 36, ADR-313; its wiring 1; the built-in keys 2, ADR-302; the policy values and a new project's settings 20, ADR-303, 309; the debris types on a form 6, ADR-308; the size bands 10, ADR-309, and the pay item a measurement falls to 8, ADR-332; a site's facts 5, ADR-311), `contracts` 17 in 4 files (its wiring 3; a form definition's fields 4, ADR-308; a field event's kind-specific details 6, ADR-325, 326, 327; the answers to a form's own fields 4, ADR-327), `tools/setup` 9 (secrets 5, env files 3, the migration folder 1; ADR-270, 281), `tools/security` 76 in 2 files (the scan's rules 19, ADR-276; the agents' guard hook 57, ADR-283), `apps/worker` 13 in 1 file (the routing and address servers over HTTPS and the mileage step, ADR-349; its figures belong to the pinned extract, as `map-services.test.ts`'s do), `infra/local` 17 in 2 files (the map extract's rules 10; the routing and address servers over HTTPS 7; ADR-282), `packages/db` 873 in 33 files (the derived records, by scenario ID 17, `derived-records.test.ts`, ADR-340; a record waiting in quarantine, by scenario ID 10, and one more in the grant file, ADR-338; a photograph removed from the record and labelled 2, ADR-337; whether a viewer sees private citizens by name, the citizen views and `guard_viewer`'s `citizen` 5, ADR-336; what an incident names and what its project's incident form offers 3, ADR-334; ROEs and forms, by scenario ID 19, and five more in the viewer files, one for each new table a viewer sees, ADR-327; scale receipts and photographs, by scenario ID 16 (AC-04-72 now proves a number is never unique, ADR-331), and two more in the viewer files, one for each new table a viewer sees, ADR-326; what each kind of field event records, by scenario ID, with its item lines and carried tickets 38, ADR-325; what every field event records, by scenario ID 21, ADR-324; a project's number series, control ranges and number blocks that never hold the same number 27, ADR-323; certifications, their measured boxes and helpers 44, and the rest of the +47 in the contractor and viewer files, ADR-321; people and their permissions 8, read-only viewers, what they see of setup and `guard_viewer` 13, and the rest of the +25 in the grant, catalog, device and row-level security files, ADR-315; rules, their criteria, picked values and actions 74, ADR-313; disposal sites, their labels, tipping fees and own shapes, the project map and every coordinate column 23, ADR-311; pay items, their rates and a crew day's steps 23, ADR-309, 310; forms, debris types, field tags and the firm's own fields 35, ADR-308; contractors on a project and contracts 34, ADR-305, 306; the client, the declaration event and the project 45, ADR-303; the firm's lists 146, ADR-302; the guards 152, ADR-272, 281, 286, 302, 303, 305, 308, 309, 310, 311; the actor extension 10, ADR-273, 276; the system actor's guard 9, the migration history 1, the configuration against CIS 5, ADR-276; the time zone and times 21, the Monitor ID 15, devices, the master passcode and number blocks 20, assignments and their pay items 16, ADR-281, 286, 309), `packages/scenarios` 117 in 4 files (the flag catalogue against `spec/FLAGS.md`, one test for each of the 77 flags and one for the codes, 78, ADR-348, `flag-catalogue.test.ts`, ADR-344: needs no database; the clock, ids and phone 9, how the phone captures 14, ADR-332, and what it is told at a sync 3, ADR-338; the release's policy file 3, ADR-303; the eight stories and the runner 10, each on its own database; ADR-275, 281) |
| `pnpm lint` | ESLint's type-checked rules (floating promises, `any`, unsafe access…) on all code and tests; Prettier formatting (ADR-257) | `All matched files use Prettier code style!`, exit 0 |
| `pnpm licences` | No licence refused or undecided (ADR-258, 260) | `358 packages: 358 allowed, 0 refused, 0 undecided.` (since `geographiclib-geodesic`, ADR-346) The package count moves with dependencies; **0 refused, 0 undecided** doesn't |
| `pnpm scenarios` | Every story passes on its own database, which is dropped afterwards (ADR-275; needs the local stack and the installation) | per story `passed: N checks, N passed, 0 failed` (`ticket-101001`: 16; `dispatch-monday`: 18; `setup`: 52, ADR-316, 323; `certification`: 25, ADR-321, 323, 330; `numbering`: 15, ADR-323; `p1-field-days`: 35, ADR-332; `sync`: 47 and `p1-any-order`: 4, ADR-338; `p1-reconciled`: 39, ADR-352, which asks the map servers), then `Stories: 8 passed, 0 failed.`, exit 0 |
| `pnpm security` | The dependency audit, the secrets scan, the env files and the grant tests, with real counts; never prints a secret (§1.5; needs the registry, the local stack and the installation) | `✓ 0 open advisories` (3 accepted by id), secretlint `0 found`, the installation's own secrets `0 found`, env files `✓ every one ignored by git and untracked`, the grant tests `33 files, 873 tests: 873 passed, 0 failed` (after ADR-340). **It ends `Security checks: 7 passed, 0 failed.`, exit 0** (since the user retired the historical root `docker-compose.yml`, 2026-10-01; KD-59 closed, ADR-291). Any ✗ is a finding |

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
| `pnpm installer` (first run) | Secrets made once into owner-only env files; four logins from SCRAM verifiers; database `adms` open only to them; the master passcode's slow hash handed to the seed in memory and kept in the database alone, never in a file (ADR-281) | `+ wrote` ×3, `+ created login` ×4, `+ created database adms` and `adms_shadow`, `✓ … opens adms with its own password` ×4, `All migrations have been successfully applied.`, `+ created the system actor, Open ADMS (system)`, `+ kept the master passcode's slow hash in the database, version 1`, `+ wrote 94 values to the firm's lists (…)` (ADR-302), `Installed for …`; `packages/db/.env` holds only `DATABASE_URL` |
| `pnpm installer` (rerun) | Resume without new secrets; migrations at head (seventy today: two more flag codes, ADR-348; nine more flag codes, ADR-345; the derived records, between a guard that drops the completed load's viewer view and their own guard, ADR-340; a quarantined record, a photograph's eighth owner and a field event's unreadable fix, and their guard, ADR-338; a photograph's archive mark and label, and their guard, ADR-337; whether a viewer sees private citizens by name, and its guard, ADR-336; an incident's contractor, cert number and ROE number and the incident form's offers, and their guard, ADR-334; the unique key taken off a scale receipt's number, ADR-331; a certification's copied-from link taken off, between a guard that drops the viewers' view and one that writes it again, ADR-330; ROEs and their scope, surveys, incidents and drop-off logs, a field event's link to the ROE it found, a photograph's four new owners, and their guard, ADR-327; scale receipts, photographs and a field event's link to its receipt, and their guard, ADR-326; a field event's kind-specific columns, its item lines and carried tickets, and their guard, ADR-325; a field event's shared columns and their guard, ADR-324; numbering and its guard, ADR-323; certifications, their guard, and the map version's default written so Prisma reads it back, ADR-321; a map version's loaded time stamped by the database, ADR-316; people's permissions and viewers and their guard, ADR-315; rules and their guard, ADR-313; disposal sites and the project map, their guard, the size bands' exclusion with `btree_gist`, and the shape checks written again, ADR-310, 311; pay items in full and their guard, ADR-309; forms, the debris types on them, the firm's own fields and their guard, ADR-308; a contractor's contact details, ADR-306; contractors on a project, contracts and their guard, ADR-305; the client, the declaration event, the project and their guard, ADR-303; the firm's lists and their guard, ADR-302; the models, nine guards, the guard helper and its fix, the `SYSTEM` role, the system actor's guard, ADR-270…273, 276; the Monitor ID's issuer, the Phase 0 models and their guards, ADR-281; the pay item and an assignment's pay items, and their guard, ADR-286; the pay item's unique code and its description, ADR-301); the seed re-checks the system actor and stops if it was changed (ADR-273); the install stops if `guard_gaps()` lists an unguarded table; a migration whose SQL is still only comments is refused, not applied | 20 `✓` lines, ending `✓ migrations at head (Database schema is up to date!)`, `✓ every table is guarded` (ADR-271), `✓ the master passcode's slow hash is kept in the database alone (Argon2id, version 1)` (ADR-281) and `✓ the system actor is the seed's, alone, unchanged and guarded` (ADR-276); one confirm; `No pending migrations to apply.`; `✓ the system actor exists, Open ADMS (system)`; `✓ the master passcode's slow hash is kept, version 1`; `✓ the firm's lists are as the firm keeps them, each built-in value in place` (ADR-302); `shasum` of the three env files unchanged |
| `pnpm installer` (the database lost) | The logins and the database come back with the secrets it has; the master passcode, kept only in the database, is asked for again (ADR-281) | `The database holds no master passcode (it went with the database). Set it again:`, then `+ kept the master passcode's slow hash in the database, version 1`; with no answer it stops, exit 1; env files unchanged |
| `pnpm installer:teardown` | The next run is a first run | `adms`, `adms_shadow` and four logins dropped, three env files and the record removed |

**The schema** (ADR-267, 268), after a change to `packages/db/prisma/schema/`: in `packages/db`, `./node_modules/.bin/prisma validate` (→ `The schemas at prisma/schema are valid`), then `./node_modules/.bin/prisma migrate dev --create-only --name <what>` to generate a migration, reviewed, then `pnpm installer` to apply it. Call the CLI through `./node_modules/.bin/prisma`: `pnpm exec` re-runs the install first. Never edit a generated or applied migration (ADR-113). Two things seen (ADR-281): `migrate dev --create-only` **applies any earlier migration still pending to `adms` itself** before it makes the new one (as `adms_owner`, like the installer; so write a stub's SQL, and try it with its tests on a throw-away copy, before generating the next migration: ADR-311 (9)); and when the generated migration carries a warning it asks to confirm and needs a terminal: `(sleep 6; printf 'y\n'; sleep 8) | script -q /dev/null ./node_modules/.bin/prisma migrate dev --create-only --name <what>`. **A migration that writes a row** (a backfill) states its actor and writes inside one `DO` block: Prisma runs a migration's statements one by one, so `set_config(…, true)` in its own statement is gone by the next (seen on a throw-away copy, ADR-336). **The hook refuses a second write into a stub**: one never applied to `adms` is removed and made again with `--create-only`. **A guard's `--create-only` stub must come out empty** (`-- This is an empty migration.`): if it carries a line nobody asked for, Prisma is reading a `dbgenerated` default back differently from how the schema writes it (KD-70: `CURRENT_TIMESTAMP` comes back as `now()`; `transaction_timestamp()` comes back as written). Fix the schema, never write around the hook. **A deferred check** (a container's primary box, ADR-321) is asked at commit; a database test asks it with `SET CONSTRAINTS ALL IMMEDIATE`, and the example world does once it is built. **A field event's tests** (ADR-324): `field-events.test.ts`, one test per scenario ID of `spec/acceptance/04-field-capture.md`; a test writes one with `fieldEventLike` or `backOfficeEventLike` and `eventInsertOf`, since no column of where it came from has a default; a new column joins `captured` in `grants.test.ts` and AC-04-25's exact column list. **What each kind records** (ADR-325): `field-event-kinds.test.ts`, one test per scenario ID; a debris type is written with `debrisTypePicked(world, entryId[, form])` (the entry with its form and document type), a split collection with its estimate, a measurement with `measured_as`; a new kind-specific column also joins `packages/domain`'s `fieldEventDetails` and `packages/contracts`' `fieldEventDetailsSchema`, and the test "every detail on every kind" then tries it on all five kinds. **Scale receipts and photographs** (ADR-326): `scale-receipts-and-photos.test.ts`, one or more tests per scenario ID; a test writes a receipt with `scaleReceiptLike` and a photograph's record with `photoLike(world, owner)`, both through `phoneInsertOf` (the id a phone would make); a photograph's fingerprints and keys can't be updated, so a test that needs others writes another; a new owner of a photograph widens `photo_owner_check` and joins `correctable.photo` in `grants.test.ts` and AC-04-76's column list; a new latitude or longitude column joins the exact list in `sites.test.ts`. **ROEs and forms** (ADR-327): `roes-and-forms.test.ts`, one or more tests per scenario ID; a test writes an ROE with `roeLike` and a survey, an incident or a drop-off log from `formLike` or `backOfficeFormLike` plus its own columns, through `phoneInsertOf`; `answers` is always stated, and answers come with `form_definition_id`, `form_id` and `form_document_type` together; a new form table joins `formShared`'s users in `grants.test.ts`. **Intake and quarantine** (ADR-338): `quarantined-records.test.ts`, by scenario ID of `spec/acceptance/05-sync.md`; a test writes a quarantined record through `phoneInsertOf('quarantined_record', …)` with the field event or the ROE that holds its number, and what the phone sent can't be updated afterwards, so a test that needs other values writes another; the stories `sync` and `p1-any-order` drive `apps/api`'s `Intake`, and a record a phone never makes is a phone's record copied under a new id and handed to `story.intake.receive`. **The derived records** (ADR-340): `derived-records.test.ts`, by scenario ID of `spec/acceptance/06-reconciliation.md`; a test writes them as the worker (`db.as('adms_worker')`, `db.actor(world.worker, 'SYSTEM')`) with that file's `completedLoadLike`, `collectionRowLike`, `flagLike` and `runLike`; a rule that holds only among live rows is an exclusion `WHERE dissolved_at IS NULL` (refused as `refusedBy.exclusion`), never a partial unique index, and `./node_modules/.bin/prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema --exit-code` (→ `No difference detected.`) shows Prisma won't drop it; a cross-project refusal is tried with a record nothing else names yet, or another key answers first and the test proves nothing (seen: one of fifty loosenings slipped through that way). **A loop of loosened guards took about four minutes a pair here on 2026-10-05** (fifty took 110 minutes, with 873 tests a run; it was 75 seconds a copy at 500 tests)**; two at a time** (twenty took 25 minutes, ADR-323): run it in the background with no ten-minute limit, and give the script absolute paths.

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
list or the other**. Pay items, their rates and a crew day's steps (ADR-309):
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

## 1.4 The scenario harness (ADR-275)

`packages/scenarios`: `pnpm scenarios [name…] [--keep]`, `pnpm scenarios list`, `pnpm scenarios
clean`. Each story gets a new database `adms_story_…` on the local stack (made by its administrator,
owned by `adms_owner`, open only to the logins), migrated through `packages/db/prisma.story.config.js`
and seeded, and it's dropped afterwards, pass or fail; a story never touches `adms`. `--keep` leaves it
to look at; `clean` drops every leftover (only while no story runs; `installer:teardown` can't drop
`adms_owner` while one is left, C28). A story is a `Story` in `packages/scenarios/src/stories/`, listed
in its `index.ts`; the runner's test runs every listed story in `pnpm test`, so a new story joins the
chain by itself. A story's context carries `policy`, the release's policy values read from
`packages/domain/policy.env` (`src/policy.ts`; held to 5, 95, 200, 31, 12, 1000, 100, 100 by `test/policy.test.ts`,
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
| The **golden mission** as a story (REQ-017) | Phase 1 |
| **Unit** tests of real rules (the capacity math is in, ADR-320; number blocks, ADR-323; volume and apportionment, ADR-343; the checks between field events, on the certification and on time, ADR-344; the checks on place, ADR-346; the checks on quantity, the pay item's settings, unit rate work and ROEs, ADR-347) | Phase 1 |
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
