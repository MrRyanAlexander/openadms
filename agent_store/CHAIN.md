# Open ADMS — The chain's counts, today

> **The one place the chain's numbers are written** (ADR-445). What each command proves and what a
> pass looks like is the `adms-verify` skill's; this page is only what you should see **today**.
> **A task that adds or removes a test, a story's check, a migration or a package replaces the
> number here in the same response**: today's only, never a "before it…" chain (the reason is the
> task's ADR and its session-log line in `DECISIONS.md`). No other file carries these counts.
> **A count that differs from this page without a reason is a finding, not noise.**

**Seen whole:** 2026-10-18, task 3.2.4 (ADR-575), on the user's Mac, the installation at head: `pnpm chain` 9 of 10 in 12 min 17 s, its one lint error fixed and `pnpm chain lint licences` then 2 of 2; every count below as seen.

## `pnpm ready`

| What | Today |
|---|---|
| `pnpm local:up` | eight `Healthy` services (`pnpm chain` says `10 containers Healthy`: these eight, the API's and the worker's) (`routing-tls` the seventh, ADR-517; `objectstore-tls` the eighth, ADR-525), `Keeping the stack’s root and every service’s certificate.`, `Keeping the object store’s bucket adms-media (it keeps every version).` (ADR-480), the field app built first (ADR-565) and `https://field.adms.localhost/ → 200 <!doctype html> <html lang="en"> …`, then the API's and the worker's containers: `https://api.adms.localhost/health → 200 {"status":"ok"}` and `the worker’s health answer → 200 {"status":"ok","jobsWaiting":0,"jobsSetAside":0,"oldestJobWaitingSeconds":0}` |
| `pnpm installer:check` | **38 `✓`**, no `✗`, exit 0 (the two since ADR-530: each service's policy values in force; one since ADR-542: the API's three secrets there and apart) |
| Migrations at head | **145** (`packages/db/prisma/migrations/` is the list) |
| `pnpm local:down` (close-out) | 10 containers and the network: 11 `Removed` lines |

## `pnpm test`

**`Test Files 198 passed (198)`, `Tests 3391 passed (3391)`.**

| Project | Tests | Files | Needs |
|---|---|---|---|
| `packages/domain` | 879 | 46 | nothing |
| `packages/contracts` | 93 | 9 | nothing |
| `apps/api` | 761 | 58 | `pnpm ready` for most (the API's own page beside `adms-verify` says which need nothing) |
| `packages/db` | 1090 | 49 | `pnpm ready` |
| `packages/scenarios` | 158 | 7 | `pnpm ready` for `stories.test.ts` (the runner and a run's template, 5) and `story-api.test.ts` (a story's API over HTTPS through the proxy, every request of a story's phone, the back office and the viewers at their browsers, and a turn-in meeting another request of its phone in the database, 16); the flag catalogue (81 flags), the harness, the phone held to the sync contract's suite and to what it sends and takes in at a sync, its photographs' files and its turn-in among it, and its wait when told to (26), the policy and the server apps' exports (2) need nothing. **The stories themselves are not here** (ADR-446) |
| `apps/worker` | 51 | 6 | `pnpm ready` for the map servers (13), their answers on an HTTPS server of the stack's certificate (6) and its container (3); the process (14), the job loop (its set-aside lines and its health, 11) and the lost phones' backstop (4) need nothing |
| `infra/local` | 77 | 6 | `pnpm ready` for the map services and every hop's TLS, the object store's thirteen ports refused among it (`hops.test.ts`, 25); Docker alone for `compose.test.ts` (18); nothing for the certificates (12) and the extract |
| `tools/security` | 143 | 3 | nothing (the scan's and the grant tests' rules 51, who reaches Postgres 35, the guard hook 57) |
| `tools/setup` | 20 | 3 | nothing |
| `tools/chain` | 16 | 1 | nothing (how `pnpm chain` reads each step's output and this page) |
| `apps/field` | 103 | 10 | nothing (signing in offline, the login list and the screen's own tries 14, ADR-575; the device key 4 and the phone's identity 11, ADR-572; the monitor signed in and the lists held 8, ADR-574; what the field app holds 11, ADR-565, 570, 572: no web-layer storage, no key from a secret but the device key's public half read out, no attestation, no console; the store's sealing 4, ADR-570; its words 30 (each screen of the app's and the prototype's, both words files), its page's policy and the API it names 10, ADR-565, 568; the accessibility check's screens, rules and reporter 6, ADR-566; the look's tokens 5, ADR-568) |

## `pnpm lint`, `pnpm licences`

- Lint: `All matched files use Prettier code style!`, exit 0 (ESLint under a 4 GB heap, ADR-465).
- Licences: **`472 packages: 472 allowed, 0 refused, 0 undecided.`** on the Mac; one fewer on
  Linux (the lockfile's Mac-only packages aren't installed there; not seen there since ADR-479).

## `pnpm scenarios`

`This run’s template, adms_story_template_…: 145 migrations applied`, then **`Stories: 24 passed, 0
failed.`** Each story `passed: N checks, N passed, 0 failed`:

| Story | Checks | | Story | Checks |
|---|---|---|---|---|
| `ticket-101001` | 16 | | `p1-priced` | 29 |
| `dispatch-monday` | 22 | | `p1-reviewed` | 36 |
| `setup` | 52 | | `p1-voided` | 32 |
| `certification` | 29 | | `p1-invoiced` | 27 |
| `numbering` | 16 | | `golden-mission` | 32 |
| `p1-field-days` | 35 | | `p1-left-out` | 31 |
| `sync` | 51 | | `first-admin` | 32 |
| `p1-any-order` | 4 | | `p1-queued` | 20 |
| `p1-reconciled` | 39 | | `p1-viewed` | 26 |
| `under-the-passcode` | 9 | | `held-for-review` | 16 |
| `interrupted-upload` | 8 | | `burst` | 8 |
| `lost-phone-key` | 14 | | `offline-sign-in` | 5 |

The golden mission's figures are `spec/golden/MISSION.md`'s and change only at the user's word:
P1 $5,548.25 on 19 lines, P2 $324.00. `p1-reconciled` through `p1-left-out`, `p1-queued` and
`p1-viewed` ask the map servers, and `burst` too (its lines `It took …`, the jobs' sizes, the take read again, the neighbour read, a setup change's read and a run by its size are measurements, ADR-505, 506, never checked).

## `pnpm e2e`

**30 browser tests**, `30 passed (2.2m)` in the chain (about 30 s run alone): the door's 7 (`apps/field/e2e/door.e2e.ts`; ADR-564, 565), the prototype's 9 (`e2e/prototype.e2e.ts`, ADR-568: four walks in each theme and one at 320 px with 200% text), the phone's store's 4 (`e2e/store.e2e.ts`, ADR-570) enrolment's 3 (`e2e/enrolment.e2e.ts`, ADR-572, in the run's own world, a `adms_story_…` database the harness makes and drops) signing in's 3 (`e2e/sign-in.e2e.ts`, ADR-574, against the world's cast) and signing in offline's 4 (`e2e/offline-sign-in.e2e.ts`, ADR-575). The field app built first (`dist/web/assets/index-….js` about 636 kB, its stylesheet about 9 kB), then the same for the world (`dist/world`), then the prototype (`dist/prototype/`, about 400 kB, and `prototype.html` in one file), then Chromium's headless shell fetched if missing; needs `pnpm ready`. Then the accessibility check's line (ADR-566): `Accessibility: 13 of 13 screens checked, in 100 checks; 0 found.`, **13 screens of the app**, its prototype's among them: the app's `create-monitor`, `enrol`, `home`, `monitor-created`, `phone`, `no-assignment`, `sync` and `settings`, the prototype's `prototype-collection`, `-stop`, `-sync`, `-tower`, `-unit-rate`.

## `pnpm security`

`✓ 0 open advisories` (3 accepted by id; 495 packages); secretlint `0 found`; the installation's own secrets
(13 values from 4 env files; the eleventh the API's key file's path, ADR-517; the twelfth and thirteenth the password and sealing keys, ADR-542) `0 found`; a password-like setting `0 found`; a whole slow hash, an
authenticator's secret or a private key as a JWK `0 found` (8 inline exceptions named); **the built field app's four scans `0 found`** (`Secrets scan of the built field app (3 files in apps/field/dist/web)`, ADR-565: the page, its script and its stylesheet); env files
`✓ every one ignored by git and untracked`; who reaches Postgres: `of 14 workspaces, the
product's that reach it: apps/api, apps/worker, packages/db` (3 tools named), `596 source files
read`, `15 statements` (a turn-in's and a top-up's lock on the phone's row, ADR-524; a phone's back-office change and the worker's revocation, each locking the phone's row, ADR-530; who signs in with an address, ADR-547), `prisma migrate diff: no difference`; the grant tests **`49 files, 1090
tests: 1090 passed, 0 failed`**; ending **`Security checks: 16 passed, 0 failed.`**

## What the installation holds after a run

Only the seed: 3 users (the system actor, the master passcode's actor, the device key's), 1 master
passcode version, the firm's lists' values (98 on a new installation since ADR-530; an installation made before keeps its own), the firm's settings record (ADR-530), and their audit records. The Monitor ID
series on `adms` moves with every run (a sequence isn't rolled back); gaps are normal.

## How long it takes here (the user's Mac, seen 2026-10-09; for judging a hang, not a target)

`pnpm chain`, the whole chain, 12 min 41 s (seen 2026-10-18; `pnpm test` 4 min 15 s of it, `pnpm scenarios` 5 min 24 s, `pnpm e2e` 27 s).
`pnpm test` about 2 min 20 s; `pnpm scenarios` about 3 min, of which `burst` under 2 min (its drain about 38 s since ADR-506);
`pnpm security` a few seconds after `pnpm test` (the database tests run again otherwise);
`pnpm ready` on a stopped stack under a minute.
