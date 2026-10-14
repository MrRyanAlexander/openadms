# Open ADMS — Agent Operating System

Offline-capable debris management and field reconciliation for disaster recovery. A truckload is
recorded as **two field events by two monitors who cannot see each other** (a collection event at
the curb, a disposal event at the dump) under one ticket number; only the server joins them, and
flags what disagrees.

**Nothing about this domain is guessable. Never infer a domain fact — load the skill that owns
it, or ask.** Confidently wrong code is the default failure mode here.

## What we're building

**Who's who:** a **firm** (usually a monitoring firm) installs Open ADMS and runs its own
**installation**; its **users** are its back office (admins, managers/analysts) and field monitors,
plus read-only viewers it issues. A **client** (the jurisdiction paying), contractors and property
owners are **records**; a **client user** is a viewer login. Detail: `adms-domain` §1.4.

The system of record for a debris mission, from declaration to audit:
- The **back office** sets up a project: client → declaration event → project, then pay items
  and rules read off the contract, certifications, sites and ROEs.
- The back office **dispatches** each day: an **assignment** says who works where, on what.
- **Field monitors** capture collections, disposals, haul-outs, unit-rate work and forms on
  enrolled phones that take their assignment (never "provisioned"), offline, syncing whenever
  there's signal.
- **The engine** joins each ticket's field events by ticket number, validates them, writes the
  completed record and its transactions as conclusions from the events, and flags anything wrong.
- **Reviewers** correct, renumber or void (audited) and reprocess.
- **The ledger** always shows the current truth. The back office assembles the client package
  from it by hand.

## Start here

| To… | Read |
|---|---|
| Understand the system, then find the part you're touching | **`spec/INDEX.md`**, the book: what it is, nine parts, a step-by-step page each |
| Know what's decided **now**, and which ADRs to cite | **`agent_store/SUMMARY.md`**: its header, then the `###` topics you touch (grep them; never read it whole, ADR-445) |
| Know the next task, where the product ends up, and the road there | `agent_store/NEXT.md` (the Handoff, then the Next Atomic Task) |
| Know how a layer is built and secured (install, database, API, devices, sync, storage, tests) | **`spec/ARCHITECTURE.md`** |
| Know the rules for a topic, and why | the skill (table below) |
| Answer "how does it behave?" | `SUMMARY.md`, then the skill, then `spec/QUESTIONS.md` |
| Explain, demo or test the domain | **`spec/golden/MISSION.md`**: one mission, every kind of record, each one's life. Never invent coverage |
| Name anything, or write an example, a test fixture or a seed | **`spec/CONVENTIONS.md`**: today's words, code names, the pay item code convention, the example world, the retired examples |

**Security first, at every layer.** The platform is rebuilt, TypeScript end to end with Prisma
(ADR-093/094); the old code is gone and is never a source. `spec/VISION.md` and the
other spec pages are approved (ADR-269). Phases are the build order; the spec is the target.

## Load the right skill before you work

| About to touch — or answer a question about | Load |
|---|---|
| Anything — first task of the conversation; what an ADMS is, glossary, invariants | `adms-domain` |
| Schema, models, enums and lists, org hierarchy, which service owns what | `adms-data-model` |
| Certifications, cert numbers, capacity math, containers, crews | `adms-certifications` |
| Creating/matching tickets, the four workflows, the project setup spine | `adms-ticket-workflows` |
| Duplicates, quarantine, renumber vs void, corrections, splits | `adms-exceptions` |
| Weights, tonnage, scale receipts, apportionment, FDS loads | `adms-scale-receipts` |
| Validators, rules engine, statuses, flag messages, volume math | `adms-validation` |
| Pricing, `Transaction`, `AuditRecord`, the ledger | `adms-ledger-audit`; the rule builder: `spec/RULES.md` |
| Phone setup, sign-in, devices (Phase 0); field capture screens (later phases) | `adms-field-app` |
| An architectural call, or code/docs that disagree with a skill | `adms-decisions` |
| Any code, config, install, auth, device, sync or storage work | read **`spec/ARCHITECTURE.md`** first (not a skill) |
| Running the checks | `adms-verify` |
| Closing out a response that changed files | `adms-close-out` |

**What to trust, in order — for every answer, explanation or demo, not only code:** the newest ADR
→ `SUMMARY.md` → a skill marked current (`<!-- skill-status: current -->`; the session hook lists
them) → in any other skill, **only its ⚠️ notes: its body describes the old system** (KD-58) →
spec drafts. A term, status or field you can't find in `SUMMARY.md` is probably superseded
(`SUMMARY.md` §2 lists what replaced it). The user's Build 1 answers are verbatim in
`spec/FROM-BUILD-1.md`; Build 1 code is never a source (ADR-102).

**Unknown behaviour?** Load the owning skill, then check `spec/QUESTIONS.md` (✅: answer from it).
**Product discovery is closed (ADR-230):** ask only when the answer changes money, evidence or what
a monitor must do, it blocks your task, and nothing recorded covers it: at most three questions,
each standing alone (plain words, a story, refs at the end) with your recommendation. Otherwise pick
the option that keeps the firm's choice open, record an ADR marked "agent default", and carry on.

## State files — `agent_store/`

| File | What | Yours to edit? |
|---|---|---|
| `SUMMARY.md` | Current rules by topic, superseded ADRs, open gaps. **Keep it current** | ✅ update |
| `NEXT.md` | Active phase, exit criteria, next atomic task | ✅ tick |
| `CHAIN.md` | The chain's counts today, the only place they are written (ADR-445) | ✅ replace |
| `BACKLOG.md` | Milestone detail for the active phase | ✅ tick |
| `DECISIONS.md` | Full ADR log + session log. Append-only, never renumber | ✅ append |
| `DEVIATIONS.md` | Full code-vs-skill gap log | ✅ append |
| `REQUIREMENTS.md` / `-LATER.md` | The active and finished phases' checklist (Phase 2 is active) / the gated phases, 3–5 | ✅ tick |
| `ROADMAP.md` | The user's one-page roadmap, start to finish, in tables (ADR-280). Summarises the files above | ✅ update at close-out |

## Working loop

1. **ORIENT** — read `NEXT.md`, and `SUMMARY.md`'s header and the topics your task touches (never
   the whole page); load `adms-domain` on the first task; find your part in `spec/INDEX.md`. No
   task given? `NEXT.md`'s Next Atomic Task is it.
2. **SCOPE** — does this belong to the active phase and a permitted directory? If not, say which
   phase it belongs to and ask. Never silently widen scope.
3. **GROUND** — read the actual files before editing. Never infer a field name, enum value or
   model name from prose; the schema is the source of truth.
4. **EXECUTE** — minimal edits. No adjacent refactors, no building ahead. Every dependency is
   pinned; a new one needs an ADR. Answer in the form asked for (chat text, a file, an artifact).
   Do the whole task: never cut it into parts ahead of time (ADR-516).
5. **VERIFY** — load `adms-verify` (`pnpm ready` first; counts against `CHAIN.md`). Report real
   observed output, never "should pass".
6. **CLOSE** — load `adms-close-out`.

## Write boundaries

| Path | Access |
|---|---|
| `agent_store/` | ✅ all files |
| `.claude/skills/` | ⚠️ domain content came from the user — record their decisions (marked with the ADR), never "correct" it; log a KD instead |
| `spec/` | ⚠️ agent drafts, user approves; approved content is treated like a skill (ADR-043) |
| `.claude/settings.json`, `.claude/hooks/` | ⚠️ enforcement — never weaken without the user asking; the hook's rules are tested (`tools/security/test/guard-hook.test.ts`): change hook, test and this table together (ADR-283) |
| `development/` | ❌ read-only reference. Its truck-capacity section is **wrong**; never use it |
| `apps/`, `packages/`, `infra/`, `tools/` (ARCHITECTURE §18) | ✅ open for the scaffold (ADR-143), built in `BACKLOG.md` order; every dependency pinned by an ADR, lockfiles committed |
| Root monorepo files: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json` + `tsconfig.base.json`, `eslint.config.js`, `vitest.config.js`, `.nvmrc`, `.editorconfig`, `LICENSE`, `.gitignore` | ✅ for the scaffold (ADR-231, 255, 259) |
| `pnpm-lock.yaml`; `README.md`; the root `docker-compose.yml` | ❌ by hand: pnpm writes the lockfile; the README is the user's; a root compose file was the historical stack, retired by the user (KD-59, closed): never recreate one, the local stack is `infra/local/compose.yaml` |
| `database/`, `api/`, `field-webapp/`, `back-office-webapp/` | 🔒 the old code and its placeholders, gone from the working folder (ADR-093): never recreate them or port from a copy; the hook refuses a write under `database/`. The layout is ARCHITECTURE §18 |
| `**/node_modules/`, `**/.venv/`, `**/.pytest_cache/`, `**/__pycache__/`, `.git/`; generated: `**/dist/`, `**/src/generated/`, `**/.generated/`, `**/.cache/`, `**/.state/` | ❌ never (change the source, rerun the tool) |
| `**/prisma/migrations/*.sql` | ❌ never edit a generated or applied migration; a guard migration is written only into Prisma's empty `--create-only` stub, reviewed and tested (ADR-113, enforced by the hook) |
| `**/.env*`, secrets | ❌ never read, write or print an env file (the hook blocks it; `.env.example` is fine): reference keys by name, load one in a subshell, compare `shasum`s; never echo, log or commit a secret |

## Git — the agent does not write to git

**Never run a git command that mutates state** (`init` `add` `commit` `push` `checkout` `switch`
`merge` `rebase` `restore` `reset` `stash` `clean` `rm`). Read-only inspection is expected:
`status`, `diff`, `log --oneline`, `branch --show-current`. Enforced by `.claude/hooks/guard.sh`;
a block is the rule working (ADR-008). A missing file is intentional: report it, never restore
it. End any file-changing response with a copy-paste git block for the user. Never commit to `main`.

## Non-negotiables

One line each. Details and the ADRs to cite: `agent_store/SUMMARY.md`. Reasons: the skill named.

- **The firm's setup decides; hardcode as little as possible.** Ship defaults tailored to debris work
  that the firm can change. Before proposing a new ticket type, unit, criterion or behaviour, or
  asking how a contract line works, check whether projects, names, codes, rules and lists already
  express it. Which price a contract means is the firm's call, never ours. *(ADR-197)*
- **Two sides.** The monitor enters only the main ticket, fast; fees, pricing, zones, mileage and
  checks are the system's work. The back office sees everything, laid out to review, fix and QC many
  tickets quickly. The rules are the firm's own tool: enable options, never hardcode its rules. The
  user answers as a firm, a monitor or the back office: note which hat. *(ADR-224)*
- **Flag, never block.** After setup nothing refuses field work or a record over eligibility.
  Problems get a plain message: "Ticket 101008: debris type mismatch. Flagged for review." *`adms-validation`*
- **Security first.** Best practice at every layer (ARCHITECTURE §16); HTTPS between services, locally
  too; CORS by exact allow-list, never disabled; never log or print a secret. *(ADR-093/098)*
- **The database enforces the rules itself** — roles, grants, constraints, triggers — not only the
  code. *(ADR-097, ARCHITECTURE §5)*
- **Nothing is lost.** No hard deletes (archive, close, void). **`AuditRecord` is append-only**, one
  per change, with a real actor. Transactions are **regenerated, never reversed**; each removed row
  is first copied in full to `AuditRecord`. *`adms-ledger-audit`*
- **Records are correctable by permission** (any captured field, audited, prior value kept), then
  reprocessed, completed tickets included. Monitors never edit in the field. *`adms-exceptions`*
- **Renumber real work; void what never happened.** Renumbering a phantom double-bills. *`adms-exceptions`*
- **Statuses: `PENDING | COMPLETED | MANUAL_REVIEW | VOID`.** Review still bills; a person (with a
  reason) or a rule's *Void ticket* action voids. `FAILED` is gone. *`adms-validation`*
- **Field events are the evidence; everything the system writes is drawn from them.** A ticket is its
  number and its events (`COL` `DIS` · `HOC` `HOD` · `URT`); the completed load and haul-out (`CLT` /
  `CHO`) are not events and are system-written only. Never a bare "event" for the disaster (the
  *declaration event*). *`adms-domain` §1.2 (ADR-236)*
- **Pairs group on the bare ticket number** (per project and workflow; split suffix stripped).
  Never parse meaning from a number; type labels are display only. *`adms-validation`*
- **Offline is normal.** Arrival order means nothing; order by field time; an unpartnered event
  never expires. *`adms-exceptions`*
- **A phone is enrolled once and "set up", never "provisioned"**: its work comes from the day's
  **assignment** (dispatch board); one project at a time; master passcode (one per firm) for
  enrolment and the offline fallback; offline sign-in from a login list; syncs whenever there's
  signal; data encrypted, never backed up. *(ADR-095/096/105/106/240)*
- **Every project has a time zone**; the device clock is the recorded time; odd times are flagged. *(ADR-100)*
- **A certification certifies a container or a crew, never a vehicle.** Cert number = placard =
  badge. Capacity follows `adms-certifications` §3A.3 **exactly**. *`adms-certifications`*
- **Monitors never see a rate or a code**; they pick by name. Rules match tickets on criteria; their
  **actions** add numbered transactions (a pay item); a rule names one contract and runs only on
  its prime's tickets. *`adms-ledger-audit` (ADR-239)*
- **Names and examples follow `spec/CONVENTIONS.md`**: the industry's keyword or plain English, never
  a legacy screen label; examples from its example world, never the retired ones (`1A`, `54A`, TFR,
  Hwy 20 TDSR…), which live only in the history files. *(ADR-234/235)*
- **QC status is separate** (QC Review / Approved / Issues / Void), set only by people. *(ADR-107)*
- **Pick-lists a firm uses are extendable, not hard-coded** (`spec/LISTS.md`); values are picked,
  never typed. *`adms-data-model`*
- **Scale receipts are conditional** (FDS only, contract decides), hand-transcribed, never
  inferred. *`adms-scale-receipts`* **There is no USACE mode.** *`adms-domain`*
- **Never relax a threshold or a unique constraint to pass a test.** Thresholds are policy (`.env`).

## Recording decisions

Made a judgment call? Append an ADR to `DECISIONS.md` **in the same response**, update
`SUMMARY.md`, and update the `spec/parts/` page if a step changed. Found code *or docs* that
disagree with a skill? Don't silently reconcile: append a KD to `DEVIATIONS.md`, update
`SUMMARY.md`, and raise it. *`adms-decisions`*
