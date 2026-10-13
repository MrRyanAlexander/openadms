# Open ADMS — The chain's counts, today

> **The one place the chain's numbers are written** (ADR-445). What each command proves and what a
> pass looks like is the `adms-verify` skill's; this page is only what you should see **today**.
> **A task that adds or removes a test, a story's check, a migration or a package replaces the
> number here in the same response**: today's only, never a "before it…" chain (the reason is the
> task's ADR and its session-log line in `DECISIONS.md`). No other file carries these counts.
> **A count that differs from this page without a reason is a finding, not noise.**

**Seen whole:** 2026-10-12, after ADR-483, on the user's Mac, the installation at head.

## `pnpm ready`

| What | Today |
|---|---|
| `pnpm local:up` | six `Healthy` services, `Keeping the object store’s bucket adms-media (it keeps every version).` (ADR-480), then the API's and the worker's containers: `https://api.adms.localhost/health → 200 {"status":"ok"}` and `the worker’s health answer → 200 {"status":"ok","jobsWaiting":0,"jobsSetAside":0}` |
| `pnpm installer:check` | **31 `✓`**, no `✗`, exit 0 |
| Migrations at head | **112** (`packages/db/prisma/migrations/` is the list) |
| `pnpm local:down` (close-out) | 8 containers and the network: 9 `Removed` lines |

## `pnpm test`

**`Test Files 152 passed (152)`, `Tests 2750 passed (2750)`.**

| Project | Tests | Files | Needs |
|---|---|---|---|
| `packages/domain` | 777 | 42 | nothing |
| `packages/contracts` | 74 | 9 | nothing |
| `apps/api` | 558 | 41 | `pnpm ready` for most (the API's own page beside `adms-verify` says which need nothing) |
| `packages/db` | 1053 | 44 | `pnpm ready` |
| `packages/scenarios` | 131 | 5 | `pnpm ready` for `stories.test.ts` (the runner and a run's template, 5); the flag catalogue (78 flags), the harness, the phone held to the sync contract's suite and to what it sends and takes in at a sync, its photographs' files among it (18) and the policy need nothing. **The stories themselves are not here** (ADR-446) |
| `apps/worker` | 30 | 3 | `pnpm ready` for the map servers (13) and its container (3); the process (14) needs nothing |
| `infra/local` | 22 | 3 | `pnpm ready` |
| `tools/security` | 90 | 2 | nothing (the scan's and the grant tests' rules 33, the guard hook 57) |
| `tools/setup` | 15 | 3 | nothing |

## `pnpm lint`, `pnpm licences`

- Lint: `All matched files use Prettier code style!`, exit 0 (ESLint under a 4 GB heap, ADR-465).
- Licences: **`446 packages: 446 allowed, 0 refused, 0 undecided.`** on the Mac; one fewer on
  Linux (the lockfile's Mac-only packages aren't installed there; not seen there since ADR-479).

## `pnpm scenarios`

`This run’s template, adms_story_template_…: 112 migrations applied`, then **`Stories: 21 passed, 0
failed.`** Each story `passed: N checks, N passed, 0 failed`:

| Story | Checks | | Story | Checks |
|---|---|---|---|---|
| `ticket-101001` | 16 | | `p1-priced` | 28 |
| `dispatch-monday` | 22 | | `p1-reviewed` | 35 |
| `setup` | 52 | | `p1-voided` | 28 |
| `certification` | 30 | | `p1-invoiced` | 26 |
| `numbering` | 16 | | `golden-mission` | 27 |
| `p1-field-days` | 35 | | `p1-left-out` | 31 |
| `sync` | 49 | | `first-admin` | 32 |
| `p1-any-order` | 4 | | `p1-queued` | 16 |
| `p1-reconciled` | 39 | | `p1-viewed` | 15 |
| `under-the-passcode` | 9 | | `held-for-review` | 11 |
| `interrupted-upload` | 8 | | | |

The golden mission's figures are `spec/golden/MISSION.md`'s and change only at the user's word:
P1 $5,548.25 on 19 lines, P2 $324.00. `p1-reconciled` through `p1-left-out`, `p1-queued` and
`p1-viewed` ask the map servers.

## `pnpm security`

`✓ 0 open advisories` (3 accepted by id); secretlint `0 found`; the installation's own secrets
(10 values from 4 env files) `0 found`; a password-like setting `0 found`; env files `✓ every one
ignored by git and untracked`; the grant tests **`44 files, 1053 tests: 1053 passed, 0 failed`**;
ending **`Security checks: 7 passed, 0 failed.`**

## What the installation holds after a run

Only the seed: 3 users (the system actor, the master passcode's actor, the device key's), 1 master
passcode version, the 94 values the firm's lists start with, 98 audit records. The Monitor ID
series on `adms` moves with every run (a sequence isn't rolled back); gaps are normal.

## How long it takes here (the user's Mac, seen 2026-10-09; for judging a hang, not a target)

`pnpm test` about 2 min 20 s; `pnpm scenarios` about 45 s (66 s before a run's template);
`pnpm security` a few seconds after `pnpm test` (the database tests run again otherwise);
`pnpm ready` on a stopped stack under a minute.
