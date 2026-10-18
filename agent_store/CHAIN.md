# Open ADMS — The chain's counts, today

> **The one place the chain's numbers are written** (ADR-445). What each command proves and what a
> pass looks like is the `adms-verify` skill's; this page is only what you should see **today**.
> **A task that adds or removes a test, a story's check, a migration or a package replaces the
> number here in the same response**: today's only, never a "before it…" chain (the reason is the
> task's ADR and its session-log line in `DECISIONS.md`). No other file carries these counts.
> **A count that differs from this page without a reason is a finding, not noise.**

**Seen whole:** 2026-10-17, task 2.9.1 (ADR-553), on the user's Mac, the installation at head: `pnpm chain` 9 of 9 in 12 min 21 s; every count below as seen (what moved: the API's two tests of AC-10-117…119, the sync suite's check 19 in `packages/contracts` and `packages/scenarios`, a check in `certification`).

## `pnpm ready`

| What | Today |
|---|---|
| `pnpm local:up` | eight `Healthy` services (`pnpm chain` says `10 containers Healthy`: these eight, the API's and the worker's) (`routing-tls` the seventh, ADR-517; `objectstore-tls` the eighth, ADR-525), `Keeping the stack’s root and every service’s certificate.`, `Keeping the object store’s bucket adms-media (it keeps every version).` (ADR-480), then the API's and the worker's containers: `https://api.adms.localhost/health → 200 {"status":"ok"}` and `the worker’s health answer → 200 {"status":"ok","jobsWaiting":0,"jobsSetAside":0,"oldestJobWaitingSeconds":0}` |
| `pnpm installer:check` | **38 `✓`**, no `✗`, exit 0 (the two since ADR-530: each service's policy values in force; one since ADR-542: the API's three secrets there and apart) |
| Migrations at head | **145** (`packages/db/prisma/migrations/` is the list) |
| `pnpm local:down` (close-out) | 10 containers and the network: 11 `Removed` lines |

## `pnpm test`

**`Test Files 187 passed (187)`, `Tests 3257 passed (3257)`.**

| Project | Tests | Files | Needs |
|---|---|---|---|
| `packages/domain` | 859 | 45 | nothing |
| `packages/contracts` | 92 | 9 | nothing |
| `apps/api` | 752 | 58 | `pnpm ready` for most (the API's own page beside `adms-verify` says which need nothing) |
| `packages/db` | 1090 | 49 | `pnpm ready` |
| `packages/scenarios` | 160 | 7 | `pnpm ready` for `stories.test.ts` (the runner and a run's template, 5) and `story-api.test.ts` (a story's API over HTTPS through the proxy, every request of a story's phone, the back office and the viewers at their browsers, and a turn-in meeting another request of its phone in the database, 16); the flag catalogue (81 flags), the harness, the phone held to the sync contract's suite and to what it sends and takes in at a sync, its photographs' files and its turn-in among it, and its wait when told to (26), the policy and the server apps' exports (2) need nothing. **The stories themselves are not here** (ADR-446) |
| `apps/worker` | 51 | 6 | `pnpm ready` for the map servers (13), their answers on an HTTPS server of the stack's certificate (6) and its container (3); the process (14), the job loop (its set-aside lines and its health, 11) and the lost phones' backstop (4) need nothing |
| `infra/local` | 77 | 6 | `pnpm ready` for the map services and every hop's TLS, the object store's thirteen ports refused among it (`hops.test.ts`, 25); Docker alone for `compose.test.ts` (18); nothing for the certificates (12) and the extract |
| `tools/security` | 141 | 3 | nothing (the scan's and the grant tests' rules 49, who reaches Postgres 35, the guard hook 57) |
| `tools/setup` | 20 | 3 | nothing |
| `tools/chain` | 15 | 1 | nothing (how `pnpm chain` reads each step's output and this page) |

## `pnpm lint`, `pnpm licences`

- Lint: `All matched files use Prettier code style!`, exit 0 (ESLint under a 4 GB heap, ADR-465).
- Licences: **`454 packages: 454 allowed, 0 refused, 0 undecided.`** on the Mac; one fewer on
  Linux (the lockfile's Mac-only packages aren't installed there; not seen there since ADR-479).

## `pnpm scenarios`

`This run’s template, adms_story_template_…: 145 migrations applied`, then **`Stories: 23 passed, 0
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
| `lost-phone-key` | 14 | | | |

The golden mission's figures are `spec/golden/MISSION.md`'s and change only at the user's word:
P1 $5,548.25 on 19 lines, P2 $324.00. `p1-reconciled` through `p1-left-out`, `p1-queued` and
`p1-viewed` ask the map servers, and `burst` too (its lines `It took …`, the jobs' sizes, the take read again, the neighbour read, a setup change's read and a run by its size are measurements, ADR-505, 506, never checked).

## `pnpm security`

`✓ 0 open advisories` (3 accepted by id); secretlint `0 found`; the installation's own secrets
(13 values from 4 env files; the eleventh the API's key file's path, ADR-517; the twelfth and thirteenth the password and sealing keys, ADR-542) `0 found`; a password-like setting `0 found`; a whole slow hash, an
authenticator's secret or a private key as a JWK `0 found` (8 inline exceptions named); env files
`✓ every one ignored by git and untracked`; who reaches Postgres: `of 14 workspaces, the
product's that reach it: apps/api, apps/worker, packages/db` (3 tools named), `533 source files
read`, `15 statements` (a turn-in's and a top-up's lock on the phone's row, ADR-524; a phone's back-office change and the worker's revocation, each locking the phone's row, ADR-530; who signs in with an address, ADR-547), `prisma migrate diff: no difference`; the grant tests **`49 files, 1090
tests: 1090 passed, 0 failed`**; ending **`Security checks: 12 passed, 0 failed.`**

## What the installation holds after a run

Only the seed: 3 users (the system actor, the master passcode's actor, the device key's), 1 master
passcode version, the firm's lists' values (98 on a new installation since ADR-530; an installation made before keeps its own), the firm's settings record (ADR-530), and their audit records. The Monitor ID
series on `adms` moves with every run (a sequence isn't rolled back); gaps are normal.

## How long it takes here (the user's Mac, seen 2026-10-09; for judging a hang, not a target)

`pnpm chain`, the whole chain, 8 min 12 s (seen 2026-10-15; `pnpm test` 3 min 41 s of it).
`pnpm test` about 2 min 20 s; `pnpm scenarios` about 3 min, of which `burst` under 2 min (its drain about 38 s since ADR-506);
`pnpm security` a few seconds after `pnpm test` (the database tests run again otherwise);
`pnpm ready` on a stopped stack under a minute.
