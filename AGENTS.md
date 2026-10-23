# Open ADMS — Agent Operating System

Offline-capable debris management and field reconciliation for disaster recovery. A truckload is
recorded as **two field events by two monitors who cannot see each other** (a collection event at
the curb, a disposal event at the dump) under one ticket number; only the server joins them, and
flags what disagrees.

**Nothing about this domain is guessable. Never infer a domain fact: load the skill that owns it.**
Confidently wrong code is the default failure mode here.

## The work now: one task

**`agent_store/BUILD.md` is the task, its parts, the questions already settled and the progress
note.** The user, 2026-10-22: finish the web platform in one run (the field app's browser build,
the back office, the viewer portal, one command to bring it all up, the golden mission through the
screens), iOS and Android skipped. Build it as you know it should be; decide and keep going. No
plan items, no gates, no ADRs or KDs, no close-out ceremony. Tick a part in `BUILD.md` when it
lands; the list never grows.

**Don't stop to ask.** A question is settled in `BUILD.md`, answered by a skill or the spec, or
decided by you: take the option that keeps the firm's choice open. One that touches money,
evidence or what a monitor must do gets one line under "Defaults taken" in `BUILD.md`. Stop only
for something you physically can't do (hardware, an account, Docker out of disk).

## What we're building

**Who's who:** a **firm** (usually a monitoring firm) installs Open ADMS and runs its own
**installation**; its **users** are its back office (admins, managers/analysts) and field monitors,
plus read-only viewers it issues. A **client** (the jurisdiction paying), contractors and property
owners are **records**; a **client user** is a viewer login. Detail: `adms-domain` §1.4.

The system of record for a debris mission, from declaration to audit: the **back office** sets up
a project (client → declaration event → project, then pay items and rules read off the contract,
certifications, sites and ROEs) and **dispatches** each day (an **assignment** says who works
where, on what); **field monitors** capture collections, disposals, haul-outs, unit-rate work and
forms on enrolled phones that take their assignment, offline, syncing whenever there's signal;
**the engine** joins each ticket's field events by ticket number, validates them, writes the
completed record and its transactions as conclusions from the events, and flags anything wrong;
**reviewers** correct, renumber or void (audited) and reprocess; **the ledger** always shows the
current truth, and the back office assembles the client package from it by hand.

TypeScript end to end with Prisma; the old code is gone and is never a source. Done right: shared
code shared properly (a workspace package with its own tests, never copied between apps or reached
into across them); a rule once in `packages/domain`, a payload once in `packages/contracts`; an app
reaches the server only through the API, over HTTPS; every screen tested, accessible (WCAG 2.2 AA)
and translatable.

## Where each kind of fact lives

| To… | Read |
|---|---|
| The task and what's settled | `agent_store/BUILD.md` |
| The rules for a topic, and why | the domain skill whose description names it (`adms-domain` first, once per conversation) |
| What's decided | `agent_store/SUMMARY.md` by topic (its header's index; never whole), then `agent_store/history/DECISIONS-599-606.md` |
| Understand the system, find the part you touch | `spec/INDEX.md`, then that part's page; `spec/ARCHITECTURE.md` by section (`grep -n '^## '`) |
| How code is written and tested here | `adms-build` and `adms-verify` (and the page beside it for your layer): how-to references; ignore their ADR, plan and gate steps |
| Names, examples, fixtures, seeds | `spec/CONVENTIONS.md`; field names `spec/DATA-MODEL.md`; flag wording `spec/FLAGS.md`; lists `spec/LISTS.md` |
| The golden mission (demo, tests) | `spec/golden/MISSION.md`; its numbers `packages/scenarios/src/stories/golden-outcomes.ts` |
| What the old app did | the legacy screenshots in `development/legacy_app(…)/` (the best evidence of what a firm needs) |
| Anything older | `agent_store/history/` (grep only, never read whole) |

**What to trust, in order:** the user → `BUILD.md` → `SUMMARY.md` and the decisions → the skill →
spec drafts. The schema is the source of truth for every field, enum and model name.

## Working fast

- **Batch.** Independent reads and searches in one message; a file under about 40 KB read whole,
  once; all of one file's changes in one edit.
- **Prove as you go:** targeted runs (`vitest run <file>`, `pnpm scenarios <story>`, one Playwright
  test); the whole `pnpm chain` once at the end (about eleven minutes, in the background).
- **Every command starts with** `eval "$(fnm env --shell zsh)"` (Node 24).

### When the user says go: a team, run by the lead

The main session is the **lead** (Opus). It doesn't work the task alone, one step after another:
it splits what's left into slices that don't touch the same files, starts them **at the same
time**, and gives each agent the model and effort its work needs (the Agent call's `model` and
`effort`):

| Work | Agent | Model · effort |
|---|---|---|
| Find where something is | `scout` | Haiku · low |
| Run tests or the chain, read the logs | `verifier`, in the background | Sonnet · medium |
| Mechanical: words, a fix whose cause is known, a test brought up to date, an a11y finding with its fix named | `builder` | Sonnet · medium |
| A slice that needs design or domain judgment | `builder` | Opus · high |
| Domain facts, splitting the work, briefs, reviewing what comes back, `BUILD.md` | the lead | Opus |

- **Parallel, safely:** two builders never change the same files; a shared package
  (`packages/contracts`, `domain`, `db`, a migration) has one builder at a time; each stages only
  its own paths. **One heavy run at a time** on this machine (a browser suite, the mission, the
  chain): they share the stack.
- **The lead keeps working** while agents run (the next brief, a review, its own small slice), and
  checks what each one cites before ticking `BUILD.md`. No worktrees: merging is the user's.

### Runs: once per change, never again for nothing

The biggest waste so far was repeating runs (2026-10-22: the mission run 25 times, a whole browser
suite 47 times).

- **Before a run, name what changed since its last one.** Nothing changed: don't run it. A pass
  stands until the code it covers changes.
- **The smallest run that proves the change:** one test (`vitest run <file> -t <name>`,
  `playwright test <file> -g <name>`), not the file, not the app's suite, not the config.
- **After a fix, rerun only what failed** (the failed test, `pnpm chain <failed step>`), never
  the suite "to be sure": the chain at the end catches the rest.
- **Long runs** (the mission, about 25 minutes; the chain, about 11) go to a `verifier` in the
  background, once per round: gather every failure from one run, fix them all, then run once more.
- **A failure only under load** (passes alone) is a real bug in the test or the app: fix the
  cause; never rerun until it happens to pass.

## Working with the user

- The user is the domain expert and the authority on field reality; the `development/` specs are
  not (their truck-capacity section is wrong).
- Plain words. Say "installation", never "instance"; "set up", never "provision"; never mention
  data sharing between installations.

## Git

Commit your own work on the work branch as each part lands (`git add <paths>`, `git commit`;
`git checkout -b <name>` to start a branch). **One branch per phase:** finishing the field app
stays on `phase3-field-app`; the back office, the portal and bringing it all up start
`phase4-back-office` from it (`git checkout -b phase4-back-office`). The user merges. **Never commit on `main`; never push, pull, merge,
rebase, reset, restore, stash, clean, `rm` or delete a branch**: those are the user's. Enforced by
`.claude/hooks/guard.sh` (tested in `tools/security/test/guard-hook.test.ts`; change both together).
End each commit message with the attribution lines the session gives. Stage named paths or check
`git status` before `git add -A`; never stage a secret.

## Write boundaries

| Path | Access |
|---|---|
| `apps/`, `packages/`, `infra/`, `tools/`, root monorepo files, `agent_store/`, `spec/`, `.claude/agents/`, the process skills (`adms-build`, `adms-verify`) | ✅ |
| The domain skills (`.claude/skills/adms-*` but the two above) | ⚠️ the user's domain content: record what the user decides; never "correct" it |
| `.claude/settings.json`, `.claude/hooks/` | ⚠️ enforcement: never weaken without the user asking |
| `development/` | ❌ read-only reference |
| `pnpm-lock.yaml`; a root `docker-compose.yml` | ❌ by hand: pnpm writes the lockfile; the local stack is `infra/local/compose.yaml` |
| `**/node_modules/`, `.git/`; generated: `**/dist/`, `**/src/generated/`, `**/.generated/`, `**/.cache/`, `**/.state/` | ❌ never (change the source, rerun the tool) |
| `**/prisma/migrations/*.sql` | ❌ never edit a generated or applied migration; a guard migration is written only into Prisma's empty `--create-only` stub |
| `**/.env*`, secrets | ❌ never read, write or print an env file (`.env.example` is fine): reference keys by name, load one in a subshell, compare `shasum`s; never echo, log or commit a secret |

A new dependency: an exact version at least seven days old, licence compatible with Apache-2.0 (no GPL, LGPL or AGPL in what ships),
maintained; `pnpm licences` and `pnpm security` after. Say why in the commit message.

## Non-negotiables (the product)

These are what the product is; speed never trades them away. Details: the skill named.

- **The firm's setup decides; hardcode as little as possible.** Defaults tailored to debris work
  that the firm can change. Before a new ticket type, unit, criterion or behaviour, check whether
  projects, names, codes, rules and lists already express it. Which price a contract means is the
  firm's call.
- **Two sides.** The monitor enters only the main ticket, fast; fees, pricing, zones, mileage and
  checks are the system's work. The back office sees everything, laid out to review, fix and QC many
  tickets quickly.
- **Flag, never block.** After setup nothing refuses field work or a record over eligibility.
  Problems get a plain message: "Ticket 101008: debris type mismatch. Flagged for review." *`adms-validation`*
- **Security first.** Best practice at every layer (ARCHITECTURE §16; NIST SP 800-63B, ASVS Level
  2); HTTPS between services, locally too; CORS by exact allow-list; never log or print a secret.
- **The database enforces the rules itself**: roles, grants, constraints, triggers, not only the code.
- **Nothing is lost.** No hard deletes (archive, close, void). **`AuditRecord` is append-only**, one
  per change, with a real actor. Transactions are **regenerated, never reversed**; each removed row
  is first copied in full to `AuditRecord`. *`adms-ledger-audit`*
- **Records are correctable by permission** (any captured field, audited, prior value kept), then
  reprocessed, completed tickets included. Monitors never edit in the field. *`adms-exceptions`*
- **Renumber real work; void what never happened.** Renumbering a phantom double-bills. *`adms-exceptions`*
- **Statuses: `PENDING | COMPLETED | MANUAL_REVIEW | VOID`.** Review still bills; a person (with a
  reason) or a rule's *Void ticket* action voids. *`adms-validation`*
- **Field events are the evidence; everything the system writes is drawn from them.** A ticket is its
  number and its events (`COL` `DIS` · `HOC` `HOD` · `URT`); the completed load and haul-out (`CLT` /
  `CHO`) are system-written only. Never a bare "event" for the disaster (the *declaration event*).
- **Pairs group on the bare ticket number** (per project and workflow; split suffix stripped).
  Never parse meaning from a number. *`adms-validation`*
- **Offline is normal.** Arrival order means nothing; order by field time; an unpartnered event
  never expires. *`adms-exceptions`*
- **A phone is enrolled once and set up**: its work comes from the day's **assignment**; one project
  at a time; master passcode (one per firm) for enrolment and the offline fallback; offline sign-in
  from a login list; data encrypted, never backed up. *`adms-field-app`*
- **Every project has a time zone**; the device clock is the recorded time; odd times are flagged.
- **A certification certifies a container or a crew, never a vehicle.** Cert number = placard =
  badge. Capacity follows `adms-certifications` §3A.3 **exactly**.
- **Monitors never see a rate or a code**; they pick by name. Rules match tickets on criteria; their
  **actions** add numbered transactions (a pay item); a rule names one contract and runs only on its
  prime's tickets. *`adms-ledger-audit`*
- **QC status is separate** (QC Review / Approved / Issues / Void), set only by people.
- **Pick-lists a firm uses are extendable, not hard-coded** (`spec/LISTS.md`); values are picked,
  never typed.
- **Scale receipts are conditional** (FDS only, contract decides), hand-transcribed, never inferred.
  **There is no USACE mode.**
- **Names and examples follow `spec/CONVENTIONS.md`**: the industry's keyword or plain English;
  examples from its example world, never the retired ones.
- **Never relax a threshold or a unique constraint to pass a test.** Thresholds are policy (`.env`).
