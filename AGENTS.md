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

The system of record for a debris mission, from declaration to audit: the **back office** sets up
a project (client → declaration event → project, then pay items and rules read off the contract,
certifications, sites and ROEs) and **dispatches** each day (an **assignment** says who works
where, on what); **field monitors** capture collections, disposals, haul-outs, unit-rate work and
forms on enrolled phones that take their assignment (never "provisioned"), offline, syncing
whenever there's signal; **the engine** joins each ticket's field events by ticket number,
validates them, writes the completed record and its transactions as conclusions from the events,
and flags anything wrong; **reviewers** correct, renumber or void (audited) and reprocess; **the
ledger** always shows the current truth, and the back office assembles the client package from it
by hand.

**Security first, at every layer.** The platform is rebuilt, TypeScript end to end with Prisma
(ADR-093/094); the old code is gone and is never a source. The spec pages are approved (ADR-269).
The plan is the build order; the spec is the target.

**Done right, not convenient (ADR-599).** We want developers to read the code and see it was done
right: no shortcut that bends a design to save work; shared code shared properly (a package with
its own tests, never copied between apps or reached into across them); every screen tested,
accessible and translatable.

## Where each kind of fact lives

| To… | Read |
|---|---|
| Know the next item | the session hook (it prints `agent_store/PLAN.md`'s first unticked box and its milestone); read **only that milestone's section** and the plan's "Every item" |
| Know what's decided **now**, and which ADRs to cite | `agent_store/DECISIONS.md` (ADR-599 on, short), then `agent_store/SUMMARY.md` (frozen at ADR-598): its header's topic index, then only the topics your work touches, never whole |
| Understand the system, find the part you touch | `spec/INDEX.md`, then that part's page |
| How a layer is built and secured | `spec/ARCHITECTURE.md`: that layer's sections (`grep -n '^## '`), never whole |
| How code is written here (endpoints, tables, tests, stories, screens) | the `adms-build` skill; how it is proven: `adms-verify` and the page beside it for your layer |
| The rules for a topic, and why | the skill whose description names it (they are all current); `spec/QUESTIONS.md` (✅ answers it) |
| Explain, demo or test the domain | `spec/golden/MISSION.md`. Never invent coverage |
| Name anything, write an example, a fixture or a seed | `spec/CONVENTIONS.md`; field names `spec/DATA-MODEL.md`; flag wording `spec/FLAGS.md`; lists `spec/LISTS.md` |
| The user's Build 1 answers | `spec/FROM-BUILD-1.md` (verbatim); Build 1 code is never a source (ADR-102) |
| Anything older | `agent_store/history/` (grep only, never read whole): ADR-001…598, the old backlog and register, requirements, roadmap, archive. A page naming `agent_store/BACKLOG.md`, `NEXT.md`, `ROADMAP.md`, `REQUIREMENTS*.md` or `ARCHIVE.md` means the copy there |

**Load `adms-domain` before your first task in a conversation** (and before explaining the
domain), then the skill for what you touch. **What to trust, in order:** the newest ADR
(`DECISIONS.md`) → `SUMMARY.md` → the skill → spec drafts. A term, status or field you can't find
in `SUMMARY.md` is probably superseded (`SUMMARY.md` §2 lists what replaced it).

## The working loop

The user says **"work on it"** (or "keep going", `/adms-work`): the `adms-work` skill runs
`PLAN.md`'s items in order, milestone by milestone, each to its gate. Alone, one item is:

1. **ORIENT** — the item, its milestone's section in `PLAN.md` (goal, carried lines, gate) and its
   "Every item"; `adms-domain`; the skill, the `adms-build` recipe and the acceptance rows it
   touches. Nothing more until you need it.
2. **SCOPE** — the item and its milestone. Never build ahead of the plan or silently widen it;
   what an item leaves becomes a `- [ ]` line under the milestone that takes it.
3. **GROUND** — read the actual files before editing. Never infer a field name, enum value or model
   name from prose; the schema is the source of truth.
4. **EXECUTE** — the whole item, done right; every dependency pinned by an ADR. Prove each part with
   targeted runs as you go (`adms-verify`).
5. **VERIFY** — targeted runs for the item; `pnpm chain test scenarios` (by the `verifier`, in the
   background) when it touched shared code (`packages/domain`, `contracts`, `db`, `scenarios`);
   **the whole chain at the milestone's gate**, then `pnpm chain record`. Report real observed
   output, never "should pass".
6. **CLOSE** — `adms-close-out`: tick the item with one line, an ADR only for a real decision, the
   skill or spec page where a rule changed, the git block.

## Working fast and cheap

Cost is turns × context, and the last turns carry the most context. So:
- **Batch.** Independent reads and searches go in one message; several `grep`s in one command; a
  file under about 40 KB read whole, once; all of one file's changes in one edit or one patch script.
- **Delegate by the thinking it needs.** *Where* is something → **`scout`** (Haiku). Running the
  chain and reading its logs → **`verifier`** (Sonnet). An item's build in a clean context →
  **`builder`** (Opus). Decisions, domain reasoning, and anything the user reads → you. A cheaper
  agent never decides a domain fact and never edits product code; check what it cites.
- **Overlap the waits.** The chain (about eleven minutes) runs in the background; never sit idle on
  it, never edit code under it.
- **Don't reread.** What you read this session is still in context; what an agent reported is in
  its answer.

## Working with the user

- The user is the domain expert and the authority on field reality; the `development/` specs are
  not (their truck-capacity section is wrong). The legacy screenshots in `development/legacy_app(…)/`
  are the best evidence of what a firm needs; when told "think harder", look there first.
- **When the user reviews finished work with questions, answer in plain words first and change no
  code until they say go** (ADR-531). Their answers inline in the docs, a "yes" read back before
  it is recorded, and how to write a question: `adms-decisions`, "The user's answers".
- **Product discovery is closed (ADR-230):** ask only when the answer changes money, evidence or
  what a monitor must do, it blocks your work, and nothing recorded covers it (at most three
  questions, each standing alone, with your recommendation). Otherwise pick the option that keeps
  the firm's choice open, record an ADR marked "agent default", and carry on. Before asking how a
  contract line works, check whether projects, names, pay items and rules already express it
  (ADR-197, 200). Never relabel a status mark yourself (ADR-133, 139).
- Say "installation", never "instance", and never mention data sharing between installations
  (ADR-112); "set up", never "provision". Security directions: say what NIST SP 800-63B and ASVS
  Level 2 ask before building (ADR-401).

## State files — `agent_store/`

All yours to edit. `PLAN.md` (the milestones and items; the next is the first `- [ ]`) ·
`DECISIONS.md` (ADR-599 on, append-only, never renumbered) · `SUMMARY.md` (the rules by topic,
frozen at ADR-598; §2 superseded, §4 defaults) · `DEVIATIONS.md` (KDs, append-only) · `CHAIN.md`
(the counts, written by `pnpm chain record`) · `history/` (everything older, grep only; a finished
milestone's words go to `history/PLAN-DONE.md`). Which fact goes where: `adms-close-out`.

## Write boundaries

| Path | Access |
|---|---|
| `agent_store/` | ✅ all files; `history/` is append-only (a finished milestone's words added, nothing rewritten) |
| `.claude/skills/` | ⚠️ domain content came from the user — record their decisions (marked with the ADR), never "correct" it; log a KD instead. The process skills (`adms-work`, `adms-close-out`, `adms-decisions`, `adms-verify`, `adms-build`) are ours to keep current |
| `.claude/agents/` | ✅ the agents' roles (ADR-594, 599); a change that widens what a cheaper agent may write needs an ADR |
| `spec/` | ⚠️ agent drafts, user approves; approved content is treated like a skill (ADR-043) |
| `.claude/settings.json`, `.claude/hooks/` | ⚠️ enforcement — never weaken without the user asking; the hook's rules are tested (`tools/security/test/guard-hook.test.ts`): change hook, test and this table together (ADR-283) |
| `development/` | ❌ read-only reference. Its truck-capacity section is **wrong**; never use it |
| `apps/`, `packages/`, `infra/`, `tools/` (ARCHITECTURE §18) | ✅ built in `PLAN.md` order; every dependency pinned by an ADR, lockfiles committed |
| Root monorepo files: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json` + `tsconfig.base.json`, `eslint.config.js`, `vitest.config.js`, `.nvmrc`, `.editorconfig`, `LICENSE`, `.gitignore` | ✅ (ADR-231, 255, 259) |
| `pnpm-lock.yaml`; `README.md`; the root `docker-compose.yml` | ❌ by hand: pnpm writes the lockfile; the README is the user's; never recreate a root compose file (KD-59): the local stack is `infra/local/compose.yaml` |
| `database/`, `api/`, `field-webapp/`, `back-office-webapp/` | 🔒 the old code, gone (ADR-093): never recreate or port from a copy. The layout is ARCHITECTURE §18 |
| `**/node_modules/`, `**/.venv/`, `**/.pytest_cache/`, `**/__pycache__/`, `.git/`; generated: `**/dist/`, `**/src/generated/`, `**/.generated/`, `**/.cache/`, `**/.state/` | ❌ never (change the source, rerun the tool) |
| `**/prisma/migrations/*.sql` | ❌ never edit a generated or applied migration; a guard migration is written only into Prisma's empty `--create-only` stub, reviewed and tested (ADR-113, enforced by the hook) |
| `**/.env*`, secrets | ❌ never read, write or print an env file (the hook blocks it; `.env.example` is fine): reference keys by name, load one in a subshell, compare `shasum`s; never echo, log or commit a secret |

## Git — the agent does not write to git

**Never run a git command that mutates state** (`init` `add` `commit` `push` `checkout` `switch`
`merge` `rebase` `restore` `reset` `stash` `clean` `rm`). Read-only inspection is expected:
`status`, `diff`, `log --oneline`, `branch --show-current`. Enforced by `.claude/hooks/guard.sh`;
a block is the rule working (ADR-008). A missing file is intentional: report it, never restore
it. End any file-changing response with a copy-paste git block for the user, staging named paths
(never `git add .`); the hook also refuses a Bash command whose text names a git write, a heredoc
included: write such a file with the Write tool. Never commit to `main`.

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

A real decision (product, money, evidence, what a monitor must do, security, a dependency, the
architecture, the user's answer, an agent default) gets a short ADR row in `DECISIONS.md` **in the
same work**; code *or docs* that disagree with a skill get a KD, never a silent fix
(`adms-decisions`). Ordinary engineering inside an approved design is said in the code and the
commit message. Each fact has one home (`adms-close-out`); never a build log restated in another
file.
