---
name: adms-verify
description: Run the Open ADMS verification chain and report real observed output. Covers Node 24 through fnm, targeted runs while building, `pnpm chain test scenarios` after shared code changes, the whole `pnpm chain` at a milestone's gate in the background (by the verifier agent), rerunning only what failed, `pnpm chain record` for the counts in CHAIN.md, loosenings, Docker trouble, and which page beside it to read for the layer you touch. Use after any code or config edit, before closing out a code task, or whenever asked to verify, test or confirm the build is green.
---
<!-- skill-status: current (the rebuild's chain, ADR-259; cut to the chain, ADR-445; `pnpm chain`, ADR-533; cut to the loop and its body moved word for word to `chain-reference.md`, the counts recorded by the chain, the verifier agent, ADR-594; the whole chain at a milestone's gate, ADR-599) -->

> **The rule never changes: report real observed output, never "should pass".** Never relax a
> threshold or a unique constraint, never skip, `.only` or delete a failing test to get green.

## The loop (ADR-594, 599): fast while building, whole at the milestone's gate

**When the whole chain runs (ADR-599):** each item is proven by its targeted runs (step 2); an item
that touched shared code (`packages/domain`, `contracts`, `db`, `scenarios`, a shared UI package)
also gets `pnpm chain test scenarios` (and `e2e` for a screen's package) before it is ticked; **the
whole chain (step 3) runs at a milestone's gate**, then `pnpm chain record`. Steps 4…7 apply to
every run.

1. **Every command starts with** `eval "$(fnm env --shell zsh)"` (an agent's shell finds Node 25
   otherwise; ADR-233). **First, `pnpm ready`** (the stack up, then `installer:check`): a `✗
   migrations` is `printf 'y\n' | pnpm installer` before anything else, or the run is lost.
2. **While building, run only what proves the part you touched**, in the foreground, seconds to a
   minute each: `./node_modules/.bin/vitest run <file>` (or `--project @open-adms/<ws>`),
   `pnpm scenarios <story>`, `ADMS_E2E_SOME=1 npx playwright test <name>` from `apps/field`,
   `./node_modules/.bin/tsc --build <workspace>`. After a change to `apps/api` or `apps/worker`,
   `pnpm local:up` again (the containers run what was built when they started). After an endpoint
   change, `pnpm openapi`.
3. **Then the whole chain, at the gate**: hand it to the **`verifier` agent** (Sonnet; `.claude/agents/`)
   in the background and carry on with the close-out while it runs (about eleven minutes:
   test 4¼ min, scenarios 3¼, e2e 1–2½, security 1½, lint 1¼). It runs `pnpm chain`, reads the
   logs of what failed and answers with a short report; it never edits. Without the agent, run
   `pnpm chain` with Bash in the background yourself and read only its summary.
4. **A failure: fix it, then rerun only the failed steps** (`pnpm chain e2e lint`). Rerun `test`,
   `scenarios` and `e2e` together only when the fix touched code they share (`packages/domain`,
   `contracts`, `db`, `scenarios`). The chain keeps the newest run of each step, so the steps
   that passed before still count.
5. **The counts:** the chain prints `≠`, `+` and `−` against `agent_store/CHAIN.md`. Read each:
   one your task explains (tests you added) is fine; one it doesn't is a finding. Then
   **`pnpm chain record`** writes them (nothing is run; never edit the table by hand). Say which
   counts moved and why in your report.
6. **Loosenings** (ADR-445): each branch of a rule or guard this item added, as one plan, in one
   command: `node .claude/skills/adms-verify/loosen.mjs <plan.json>` (shape in its header;
   `chain-reference.md` §1.5a). A `SLIPPED` is a finding. A database guard is loosened on a
   throw-away copy (`database-tests.md`). The verifier can run the plan you write.
7. **Done** is every step `✓` on the final code, seen, with its real lines quoted.

## Read the page for the layer you touch

Each is beside this file. They hold what earlier tasks learned the hard way (how a test is written
for that layer, its helpers, its exact lists, what a loosening is tried on). **Read the one you
need before you write a test or a migration there; skip the rest.**

| Touching | Read first |
|---|---|
| `packages/db/prisma/schema/`, a migration, a guard, a new table's tests | `schema-and-migrations.md` |
| `packages/db` or its tests; the tests' database `adms_test` and a throw-away copy of it; a guard's loosening | `database-tests.md` |
| `apps/api`, an endpoint in `packages/contracts`, an API test, a phone's or a monitor's requests | `api-tests.md` (its first section, then the one for your area) |
| `apps/worker`, the job queue, what queues work | `worker-tests.md` |
| `apps/field`, its browser end-to-end tests, the field app's page and its headers | `browser-tests.md` (ADR-564, 565) |
| What a command proves and what its pass looks like; the local stack, the installer, the schema's commands, where tests live, the stories, the security checks, the clean-copy check after a dependency change | `chain-reference.md`, by section (`grep -n '^## '`) |

## Environment and housekeeping

*(Moved here from `NEXT.md`'s Handoff, ADR-594.)*

- **To try the build by hand: `pnpm field:try`** (the stack up; never beside `pnpm e2e`): the
  tests' world, its monitors printed, a Chrome of its own; Ctrl-C drops it (ADR-585).
- **Every command starts with** `eval "$(fnm env --shell zsh)"`. **The chain is `pnpm chain`**, run in
  the background (ADR-533); its first step is `pnpm ready` (the stack up, then `installer:check`). **Leave nothing running** (ADR-277): stop the stack with
  `pnpm local:down` at close-out (`adms-close-out` §0); nothing needs to stay running today. Docker
  Desktop may be closed at a session's start: `open -a Docker`, and quit it at close-out if you
  opened it.
- **Docker's disk is 8 GB** (ADR-282): the stack's images take about 4.4 GB and its data about
  0.5 GB. It was full on 2026-10-03 (four throw-away copies of `adms` at once) and 2026-10-10 (after
  `pnpm test`, `pnpm scenarios` and two more database runs: Postgres restarted in a loop on its
  write-ahead log). **If `pnpm ready` or `local:up` fails for space, stop and ask the user to free
  some** (`docker builder prune`, about 0.9 GB, is theirs) or raise the limit; never work around
  it. **Try loosened guards two at a time**, each copy `STRATEGY FILE_COPY` then a `CHECKPOINT`
  after its drop (`adms-verify` §1.3). A first `local:up` downloads the map extract (20 MB, IPv4
  only) and takes about two minutes; a resume about 12 s.
- **When Docker misbehaves:** it hangs often on this machine and a restart always clears it (the
  user, ADR-551): a `docker` call or `local:up` that hangs, or every call answering 500 →
  `docker desktop restart` at once, never a long wait (quitting by `osascript` left its backend
  running); then `pnpm local:down` and `up`. **Volumes nobody recognises are an agent's one-off
  containers** (the stack's own are all named `open-adms-local_…`): run every one-off with `--rm`,
  and before close-out `docker volume ls -f dangling=true` must show none you made; `local:up` meeting `ECONNRESET` or a container
  whose layer is gone → `pnpm local:down` and `up` once more. **On a Linux host (a cloud session)**
  the containers run as uid 1000: after `pnpm installer` the two service env files, after each
  `local:up` the copied Caddy root, and each key under `infra/local/.generated/tls/` by its own
  container's user (Postgres 999, the mail catcher 65534, the address server's `nominatim`, the
  rest 1000) must be readable, or that service fails to start.
- **A guard's `--create-only` stub must come out empty** (KD-70): if it carries a line nobody asked
  for, find the `dbgenerated` default Prisma reads back differently; never write around the hook.
  `prisma migrate dev --create-only` applies earlier pending migrations to `adms` and wants a
  terminal when the new migration carries a warning (`adms-verify`, "The schema").
- **`pnpm lint` runs under a 4 GB heap** (ADR-465); if it stops with "heap out of memory", split it
  by workspace.
- **Never print an env file**; compare `shasum`s, load a key in a subshell (`set -a; . file`).
