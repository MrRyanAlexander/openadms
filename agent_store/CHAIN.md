# Open ADMS — The chain's counts, today

> **The one place the chain's numbers are written** (ADR-445). What each command proves and what a
> pass looks like is the `adms-verify` skill's; this page is only what you should see **today**.
> **A task that adds or removes a test, a story's check, a migration or a package replaces the
> number here in the same response**: today's only, never a "before it…" chain (the reason is the
> task's ADR and its session-log line in `DECISIONS.md`). No other file carries these counts.
> **A count that differs from this page without a reason is a finding, not noise.**

**Seen whole:** 2026-10-14, after ADR-514, on the user's Mac, the installation at head (resumed by `pnpm installer` that day, its volumes found new) (memory last sampled after ADR-512: Docker's VM at 4 GB, the eight containers together under 1 GB through a full `pnpm test`, the object store highest at about 220 MiB; none restarted). In the full `pnpm scenarios` after ADR-513 `burst` stopped once on C155's 500 and passed alone three times after (C155); after ADR-514 the full run passed whole.

## `pnpm ready`

| What | Today |
|---|---|
| `pnpm local:up` | six `Healthy` services, `Keeping the object store’s bucket adms-media (it keeps every version).` (ADR-480), then the API's and the worker's containers: `https://api.adms.localhost/health → 200 {"status":"ok"}` and `the worker’s health answer → 200 {"status":"ok","jobsWaiting":0,"jobsSetAside":0,"oldestJobWaitingSeconds":0}` |
| `pnpm installer:check` | **32 `✓`**, no `✗`, exit 0 |
| Migrations at head | **114** (`packages/db/prisma/migrations/` is the list) |
| `pnpm local:down` (close-out) | 8 containers and the network: 9 `Removed` lines |

## `pnpm test`

**`Test Files 163 passed (163)`, `Tests 2923 passed (2923)`.**

| Project | Tests | Files | Needs |
|---|---|---|---|
| `packages/domain` | 795 | 43 | nothing |
| `packages/contracts` | 88 | 9 | nothing |
| `apps/api` | 612 | 47 | `pnpm ready` for most (the API's own page beside `adms-verify` says which need nothing) |
| `packages/db` | 1056 | 44 | `pnpm ready` |
| `packages/scenarios` | 153 | 7 | `pnpm ready` for `stories.test.ts` (the runner and a run's template, 5) and `story-api.test.ts` (a story's API over HTTPS through the proxy, every request of a story's phone, the back office and the viewers at their browsers, 14); the flag catalogue (78 flags), the harness, the phone held to the sync contract's suite and to what it sends and takes in at a sync, its photographs' files and its turn-in among it, and its wait when told to (24), the policy and the server apps' exports (2) need nothing. **The stories themselves are not here** (ADR-446) |
| `apps/worker` | 41 | 4 | `pnpm ready` for the map servers (13) and its container (3); the process (14) and the job loop (its set-aside lines and its health, 11) need nothing |
| `infra/local` | 22 | 3 | `pnpm ready` |
| `tools/security` | 141 | 3 | nothing (the scan's and the grant tests' rules 49, who reaches Postgres 35, the guard hook 57) |
| `tools/setup` | 15 | 3 | nothing |

## `pnpm lint`, `pnpm licences`

- Lint: `All matched files use Prettier code style!`, exit 0 (ESLint under a 4 GB heap, ADR-465).
- Licences: **`452 packages: 452 allowed, 0 refused, 0 undecided.`** on the Mac; one fewer on
  Linux (the lockfile's Mac-only packages aren't installed there; not seen there since ADR-479).

## `pnpm scenarios`

`This run’s template, adms_story_template_…: 114 migrations applied`, then **`Stories: 22 passed, 0
failed.`** Each story `passed: N checks, N passed, 0 failed`:

| Story | Checks | | Story | Checks |
|---|---|---|---|---|
| `ticket-101001` | 16 | | `p1-priced` | 28 |
| `dispatch-monday` | 22 | | `p1-reviewed` | 35 |
| `setup` | 52 | | `p1-voided` | 28 |
| `certification` | 30 | | `p1-invoiced` | 26 |
| `numbering` | 16 | | `golden-mission` | 28 |
| `p1-field-days` | 35 | | `p1-left-out` | 31 |
| `sync` | 51 | | `first-admin` | 32 |
| `p1-any-order` | 4 | | `p1-queued` | 19 |
| `p1-reconciled` | 39 | | `p1-viewed` | 15 |
| `under-the-passcode` | 9 | | `held-for-review` | 11 |
| `interrupted-upload` | 8 | | `burst` | 6 |

The golden mission's figures are `spec/golden/MISSION.md`'s and change only at the user's word:
P1 $5,548.25 on 19 lines, P2 $324.00. `p1-reconciled` through `p1-left-out`, `p1-queued` and
`p1-viewed` ask the map servers, and `burst` too (its lines `It took …`, the jobs' sizes, the take read again, the neighbour read, a setup change's read and a run by its size are measurements, ADR-505, 506, never checked).

## `pnpm security`

`✓ 0 open advisories` (3 accepted by id); secretlint `0 found`; the installation's own secrets
(10 values from 4 env files) `0 found`; a password-like setting `0 found`; a whole slow hash, an
authenticator's secret or a private key as a JWK `0 found` (8 inline exceptions named); env files
`✓ every one ignored by git and untracked`; who reaches Postgres: `of 13 workspaces, the
product's that reach it: apps/api, apps/worker, packages/db` (3 tools named), `471 source files
read`, `9 statements`, `prisma migrate diff: no difference`; the grant tests **`44 files, 1056
tests: 1056 passed, 0 failed`**; ending **`Security checks: 12 passed, 0 failed.`**

## What the installation holds after a run

Only the seed: 3 users (the system actor, the master passcode's actor, the device key's), 1 master
passcode version, the 94 values the firm's lists start with, 98 audit records. The Monitor ID
series on `adms` moves with every run (a sequence isn't rolled back); gaps are normal.

## How long it takes here (the user's Mac, seen 2026-10-09; for judging a hang, not a target)

`pnpm test` about 2 min 20 s; `pnpm scenarios` about 3 min, of which `burst` under 2 min (its drain about 38 s since ADR-506);
`pnpm security` a few seconds after `pnpm test` (the database tests run again otherwise);
`pnpm ready` on a stopped stack under a minute.
