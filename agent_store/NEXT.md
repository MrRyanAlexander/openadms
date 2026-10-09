# Open ADMS — Next

> **This file defines the immediate scope of work.** If asked for something outside this phase,
> say which phase it belongs to and ask before proceeding. Keep the Next Atomic Task pointer at
> the bottom accurate. Milestone detail lives in `agent_store/BACKLOG.md`.


## Active Phase — `PHASE 1: DATA CORE AND ENGINE, REBUILT` *(opened by the user 2026-10-01, ADR-299)*

**User, 2026-10-01:** "phase 1 is open, begin working on the next task".

**What it is.** The whole product without a screen or an endpoint: setup records, certifications and
capacity, field events and their numbers, sync intake with quarantine, reconciliation, the rule
engine, the ledger and audit, review, QC and the invoice lock, rebuilt in TypeScript with Prisma on
Phase 0's foundation (ADR-093, 094).

**Objective.** The golden mission runs from a terminal and comes out with the statuses, review
queue, ledger and audit trail the user approved (`spec/golden/MISSION.md`, ADR-297).

**The plan.** `BACKLOG.md`, "Active — Phase 1": ten milestones, 47 tasks, **one task per response**
(ADR-300). Each milestone opens with its part's acceptance scenarios (`spec/acceptance/`), then the
schema from `spec/DATA-MODEL.md`, then the rules, then its story.

**Scope boundary.**
- **In:** `packages/db` (schema, guard migrations, tests), `packages/domain` (every rule),
  `packages/contracts`, `packages/scenarios` (stories), `apps/worker` (the reconciliation run),
  `apps/api` (service classes only: no HTTP, no sign-in), `tools/`, `spec/acceptance/`.
- **Not Phase 1's:** endpoints, sign-in and the sync contract (Phase 2); the phone (Phase 3);
  screens, exports and the time clock's tables (Phases 3–4). Say which phase and ask; never widen
  silently.
- `database/` and `development/` stay read-only history and reference.

**Environment.** Node 24 through fnm (`eval "$(fnm env --shell zsh)"` first), pnpm 11, TypeScript
6.0.3, Prisma 7.10.0, Postgres 18.6 in the local stack (`pnpm local:up`; stopped at every close-out).

---

## Exit criteria for Phase 1 *(ADR-299)*: all seven met 2026-10-06 (ADR-371, 372)

All observed and reported, not assumed:

1. **The golden mission runs as a story** with the exact statuses, review queue, ledger (P1
   $5,548.25 on 19 lines; P2 $324.00) and audit rows the user approved (REQ-017, 142, 143).
2. **Every Phase 1 acceptance scenario passes at the engine**, reported as N of M (VISION §8).
3. **All 98 Phase 1 REQs** ticked from runs that were seen, or re-filed with an ADR.
4. **The rebuild lessons hold:** the behaviour of KD-01, 04, 05, 10, 12, 13, 15, 55 and 56 right and
   verified; every other rebuild-lesson KD closed or re-filed.
5. **The database still enforces the rules:** every new table guarded, every grant and refusal
   tested, a row-level-security decision for each table a viewer sees, `guard_gaps()` empty,
   `pnpm security` passing.
6. **The chain is green** with real counts: typecheck, lint, licences, tests, stories.
7. **Rules live once:** none outside `packages/domain`, and nothing in it touches Postgres
   (REQ-003, 128).

Only then is **Phase 2 (API and sync)** offered to the user to open.

---

## Phase 0 and the spec track: done *(the record moved 2026-10-02, ADR-307)*

**Phase 0 (Foundation) closed on 2026-10-01** with its seven exit criteria met and all 17 of its
REQs ticked (ADR-281…288); the user opened Phase 1 the same day (ADR-299). **Every spec page is
approved:** `ARCHITECTURE.md` (ADR-104…144), `VISION.md`, `INDEX.md`, the part pages, `LISTS.md`,
`RATE-SHEET.md` and `RULES.md` (ADR-269), `DATA-MODEL.md` and `FLAGS.md` (ADR-289, 290; KD-65's
thirteen points settled, ADR-292…295), the golden mission and its numbers (ADR-297). Their full
record (why Phase 0 existed, its exit criteria and how each was met, the spec track and the 26
question rounds) moved word for word to `DECISIONS.md`'s scratchpad, "Moved from NEXT.md,
2026-10-02"; `ROADMAP.md` §3a keeps the table.

**Still live from the spec track:** nothing. All nine acceptance files are approved by the user
(01…05 by ADR-335; 06…09 on 2026-10-06, ADR-374). Their count is `spec/acceptance/README.md`'s
table: 760 scenarios, 693 proven whole at the engine, 15 in part, 52 for Phases 2–4.

---

## 🔁 Handoff — read this first in a new session (rewritten 2026-09-28, ADR-225; updated 2026-10-02)

Everything decided is in the files; nothing lives only in an old chat. This block says **where
things stand, where the product ends up, the road there, and what is still to be asked**. What is
true now, topic by topic, is `SUMMARY.md`; the round-by-round history is the session log at the end
of `DECISIONS.md`.

### Where things stand (2026-10-06, through ADR-375)
- **Phase 1 (data core and engine) has met all seven exit criteria (ADR-371, 372).** Its 49 tasks
  are ticked in `BACKLOG.md`; 93 of its 98 REQs are ticked and 5 moved to the phase that finishes
  them (REQ-112b, 124c, 124f, 125c to Phase 3; REQ-124b to Phase 4); every rebuild-lesson KD is
  closed; 693 of the 708 scenarios with a Phase 1 part are proven whole, the other 15 in part.
- **Phase 2 (API and sync) is the user's to open.** Offer it; never open it. When they do, its plan
  is written into `BACKLOG.md` first, from `REQUIREMENTS-LATER.md`'s Phase 2 (14 REQs) and the
  carry-forward register (C71, C83 and the items marked Phase 2).
- **The chain, seen whole on 2026-10-06:** 80 test files, 1,753 tests; lint clean; 358 licences
  allowed; fifteen stories; `pnpm security` 7 passed, 0 failed; eighty migrations. The expected
  output of each command is `adms-verify`'s.
- **What exists:** `packages/db` (schema, guards, tests), `packages/domain` (every rule; one
  dependency, no database), `packages/contracts`, `packages/scenarios` (the harness and stories,
  the golden mission among them), `apps/worker/src/reconciliation/` (the run: group, check,
  price, write), `apps/api/src/` (service classes only: setup, certifications, numbering, intake,
  review; no HTTP, no sign-in), `tools/`, `infra/local`.
- **Open deviations:** KD-63 only (the conventions draft in `development/`; the user, 2026-10-06:
  "not approved yet; but mostly seems good"). KD-30 is re-filed to Phase 5 (REQ-518).
- **The task-by-task record of Phase 1** (what each task built, found and left) moved word for word
  to `DECISIONS.md`'s scratchpad, "Moved 2026-10-06 (ADR-375)". Read it there when a later task
  needs how something was built; the rules themselves are `SUMMARY.md`'s and the skills'.

### The model as it stands now (today's words; `SUMMARY.md` has each rule and its ADR)
The firm's setup decides how things play out (ADR-197), and there are **two sides** (ADR-224): the
monitor enters only the main ticket, the system and the back office do the rest.
- **Setup:** client → declaration event → project; contractors and **contracts** (name, prime,
  link); **forms** with their **debris types**, named as the contract names the work (ADR-211, 214);
  **pay items** (a code unique on the project, a description, **payable type** = the work, Unit of
  Measure, size band, capture settings, **a rate per prime**; ADR-206, 207, 221, 237, 301); **sites** (site type + Takes loads ·
  Haul-outs leave here · Charges a tipping fee · Ineligible site; ADR-215, 222); field tags; the
  project map; **rules** per form, **naming one contract** and running only on its prime's tickets:
  criteria → *Add / Remove transaction #n*, *Void ticket* (ADR-109, 130, 239).
- **Phones and people:** a phone is **enrolled** once; the back office's **dispatch board** gives
  each person a daily **assignment** (project, work, one site where the work is at one); the phone
  takes it at sign-in; setup by master passcode is the fallback; phones sync whenever there's signal
  (ADR-240). The optional **time clock** hangs on the assignment (ADR-241).
- **Field:** each monitor records a **field event** (`COL` `DIS` · `HOC` `HOD` · `URT`; ADR-236).
  **Badge first, number last** (ADR-209). Picks **by name, never a code**: a load's debris type at
  both ends; a unit rate payable type, and the phone works out the pay item from its band (ADR-207,
  213, 217). One quantity: a load call, or a scale weight when the paying pay item is by weight
  (ADR-223).
- **Engine:** groups field events on project + workflow + bare number; flags, never blocks;
  attaches zone and mileage; runs every passing rule in # order (creates, deletes, voids); writes the
  completed load and the transactions (regenerated, each removed row copied to audit first); checks
  where debris went against the site's facts.
- **Back office:** sees everything, corrects in place (audited), accepts flags, voids with a reason,
  reprocesses; QC status is separate; only QC Approved records lock as invoiced, optionally in a named
  **invoice batch**; the client package is assembled by hand from exports; one review queue; a setup
  check; the pay item screen writes its own rules (ADR-228, 229).

### Where it ends up
Done is proven, not ticked (`spec/VISION.md` §8, approved, ADR-269): approved part pages →
**acceptance scenarios** (`spec/acceptance/`, `AC-…`) → a **golden mission** (`spec/golden/`: several
messy field days, with the exact statuses, review queue and ledger **signed off by the user**) →
the same scenarios passing at each layer (engine, API, apps). The finished surfaces are `VISION.md` §7.

### The road to done
**The user's one-page view of this, with every phase's status: `agent_store/ROADMAP.md`** (ADR-280).
Update it at close-out when a task, milestone or phase closes.

| # | Step | What it produces | Needs first |
|---|---|---|---|
| 1 | **Phase 0 scaffold** (BACKLOG 0.2.1 → 0.2.4) ✅ done (ADR-255…266) | Monorepo with pinned dependencies (AGPL-3.0-compatible), domain and contracts packages with tests, local HTTPS stack, installer | Node 24 LTS on the machine |
| 2 | **Naming pass ✅ (`spec/CONVENTIONS.md`, ADR-234) → `DATA-MODEL.md` → `FLAGS.md`** (BACKLOG 0.2b) ✅ both drafted and **approved 2026-10-01** (ADR-284, 285, 289, 290); DATA-MODEL's thirteen points settled (KD-65 closed, ADR-292…295) | Every record, field, criterion, status and export column named; the schema on paper; every flag's code, trigger, message, still-bills and accept rule; the user may overturn any name | Can run beside step 1 |
| 3 | **Database hardening** (BACKLOG 0.3) ✅ done (ADR-267, 268, 270…273) | Roles, grants, no deletes, audit triggers, insert-only audit, transaction copy-to-audit, row-level security, each proven by tests | Step 1; minimal provisional models |
| 4 | **Prove it** (BACKLOG 0.4) ✅ done 2026-10-01 (ADR-275, 276, 281) | Scenario harness with one trivial story; security checks in the test run; time zone, device, Monitor ID models | Steps 1, 3 |
| 5 | **Truth-up the docs** ✅ done 2026-09-29 (ADR-247…253; KD-33, 58, 61, 62 closed) | `RATE-SHEET.md`, `RULES.md`, `LISTS.md`, parts 01/04/06/07 and the skills rewritten to today's rules, one per response (ADR-138) | Before step 7's engine work |
| 6 | **Acceptance scenarios + golden mission** ✅ the mission is approved (ADR-297) and runs as a story (ADR-368); the nine scenario files are written and approved (ADR-335, 374) | `spec/acceptance/`, `spec/golden/` with the user's signed-off numbers | Steps 2, 5 |
| 7 | **Phase 1: data core + engine, rebuilt** ✅ exit met 2026-10-06 (ADR-371, 372); opened 2026-10-01 (ADR-299); its tasks are ticked in `BACKLOG.md` | Setup records, certifications and capacity, tickets and numbers, sync intake with quarantine, reconciliation, the rule engine, the ledger and audit, review, QC, invoice lock and batches; KD-01, 04, 05, 10, 12, 13, 15, 55, 56 closed; the golden mission passing at the engine | Steps 3–6 |
| 8 | **Phases 2–5** | API and sync → field app (browser, iPhone, Android) → back office (setup screens with the setup check, rule builder, review queue, exports, viewers) → later features and the demo deploy | Each phase's REQs refreshed before it opens |

### What is still to be asked (so nothing is guessed later)
- **Nothing is open** (ADR-230). New questions only under the shot-clock rule above.
- **Agent defaults the user may overturn:** listed in `SUMMARY.md` §4.
- **Later phases, not asked now:** the HHW trail (KD-30, REQ-518); the time clock's screens
  (rules settled, ADR-241); which phase the read-only portal lands in (`VISION.md` §7); each Phase 5
  candidate; `RULES.md` §7 "Is valid"; whether to keep hand re-entry of the ticket number (ADR-209)
  when the field app is built.
- **Approvals as part of later steps:** none left for the spec pages (`DATA-MODEL.md` and
  `FLAGS.md` are approved, ADR-289, 290; the golden mission and its numbers, ADR-297). The names in `spec/CONVENTIONS.md` are agent defaults the user may overturn.
- **Ours, not the user's:** design tasks Q-166 (regional map data) and Q-167 (upgrading an
  installation).

### How the user works
- The user is the domain expert and the authority on field reality; the `development/` specs are
  not (their truck-capacity section is wrong). The legacy screenshots in `development/legacy_app(…)/`
  are the best evidence of what a firm needs; when told "think harder", look there first.
- They answer **inline** in the docs (usually `spec/QUESTIONS.md`), sometimes inside tables, as
  corrections above earlier quotes, or numbered oddly; they write "APPROVED" under sections. Read the
  changed section in full; move each answer into a dated `> **User, …:**` quote, verbatim; record an
  ADR in the same response; update `SUMMARY.md`, the owning skill, `spec/RULES.md` and the part pages.
- They answer wearing **different hats**: a firm setting up, a monitor in the field, the back office
  (ADR-224). Note which, and design each side for its own user.
- **A "yes" to an either-or question is read back before it is recorded.** Q-139 asked "may two
  share the name, or should the second be named `3A-2`?"; the answer began "Yes", an agent took it
  for the first half, and the wrong rule stood for five days until an acceptance scenario showed it
  to the user (ADR-147 → 301). Say which half you understood, in one line, and never ask two
  things in one question. A scenario in `spec/acceptance/` is where the user catches such a
  misreading: write them plainly.
- Write questions that stand alone: plain words, **a story told as a table of what happens to each
  ticket**, then the question, refs at the end. No paraphrase ("TOO MUCH PARAPHRASING"). Give ticket
  numbers that make sense (a haul-out has its own number). When their numbers don't add up, show the
  arithmetic and ask once. Never guess money.
- Before asking how a contract line works, check whether projects, names, pay items and rules already
  express it (ADR-197, 200). Never relabel a status mark yourself (ADR-133, 139).
- Never mention data sharing between installations; say "installation", never "instance" (ADR-112).
  Say "set up", never "provision".

### Tools and housekeeping
- **A guard's `--create-only` stub must come out empty (KD-70, seen 2026-10-03).** Prisma read
  `MapVersion.loadedAt`'s default `CURRENT_TIMESTAMP` back as its own `now()` and wrote the default
  again into every later migration, the guard's stub included; the hook then rightly refused
  writing into it. The default is now `transaction_timestamp()`. If a stub ever carries a line
  nobody asked for, find the `dbgenerated` default Prisma is reading back differently and fix
  that; never write around the hook.
- **Docker on this machine (seen 2026-10-01, ADR-282).** Docker Desktop's disk is **8 GB**; the local
  stack's six images take about 4.4 GB and its data about 0.5 GB, leaving under 1 GB. If a `local:up`
  fails with "No space left on device", free space before retrying (the user's build cache, about
  0.9 GB, and the historical volume are theirs to clear), or the user raises the limit in Docker
  Desktop's settings. A first `local:up` downloads the map extract (20 MB; the download site answers
  only over IPv4 here, which Node handles) and takes about two minutes; a resume takes about 12 s.
  If every `docker` call answers 500, Docker Desktop's engine is stuck: quit and reopen it.
  **Seen 2026-10-03 (ADR-313):** four throw-away copies of `adms` made at once filled the disk and
  stopped Postgres (each copy is about 85 MB, and `CREATE DATABASE` writes the whole copy to the
  write-ahead log, which grew to 0.5 GB). It came back by itself once space was freed (the routing
  server's volume, rebuilt by the next `up`, removed while its container was stopped), with nothing
  lost. **Try loosened guards two at a time here, not four,** each copy made with `STRATEGY
  FILE_COPY` and followed by a `CHECKPOINT` after its drop (`adms-verify` §1.3).
- **The repository has a history since 2026-10-01 (ADR-288):** nine commits by the user on branch
  `phase0-foundation` (`a94cdb6`…`b5329fe`), each a slice of that day's files in Phase 0's build
  order, so only the newest is a state that was built and tested whole; Phase 1's on
  `phase1-data-coreh` (26 commits in all, seen 2026-10-02). There is no `main` and no remote yet
  (both the user's call). Agents still never write to git (ADR-008): end a file-changing response
  with the user's git block, **staging named paths, never `git add .`**.
- **`database/` and the placeholder folders (`api/`, `field-webapp/`, `back-office-webapp/`) are no
  longer in the working folder** (seen 2026-10-01; they were never committed). Never recreate them
  (`AGENTS.md` write boundaries; the guard hook still refuses a write under `database/`).
- **Leave nothing running (ADR-277, the user, 2026-09-30).** Start the local stack with `pnpm
  local:up` when a task needs it; stop it with `pnpm local:down` at close-out (`adms-close-out` §0),
  with throw-away databases, containers and volumes gone. Something stays up only with a line here
  saying what, why and who stops it. **Nothing needs to stay running today.** The historical root
  stack is gone: the user retired its file and volume on 2026-10-01 (KD-59 closed, ADR-291).
- **The local installation was re-made on 2026-10-01** (ADR-281: teardown, then a first run, to
  prove the installer's new paths). Its master passcode is a throw-away random value; the user sets
  their own with `pnpm installer:teardown`, then `pnpm installer`. `prisma migrate dev --create-only`
  applies earlier pending migrations to `adms` itself and wants a terminal when the new migration
  carries a warning (`adms-verify`, "The schema").
- In the round 19 session the auto-mode safety check sometimes returned no verdict for Bash and web
  search; reads and edits kept working. If it happens, carry on with the file tools.
- `pdftoppm` isn't installed, so the legacy field-app PDFs can't be read by the agent here; they
  were reviewed in round 22 (incident, collection and unit rate flows).
- The Build 1 copy is gone (removed by the user); `README.md` is missing (intentional).
  `AGENTS.md` (`CLAUDE.md` links to it) is 189 lines, over its ~150 target (ADR-092); the session hook prints about 3 KB since the Next Atomic Task section was cut (ADR-375; it had grown to 74 KB).

## 📍 Next Atomic Task

**New session? Read the "🔁 Handoff" block above first**, then `agent_store/SUMMARY.md`'s header
and the topic you are touching. Product discovery is closed (ADR-230): don't open new rounds of
questions.

**There is no Phase 1 task left: its exit is met (ADR-371, 372). Phase 2 (API and sync) is the
user's to open. Offer it; never open it.**

1. **Owed, on or after 2026-10-07 14:08 UTC (ADR-372):** in `pnpm-workspace.yaml` delete the
   `minimumReleaseAgeExclude` entry for `source-map-js@1.2.2` and its three comment lines; keep the
   override. Then `pnpm install --frozen-lockfile` (nothing else should change), `pnpm security`
   (expect `7 passed, 0 failed`), and strike BACKLOG C74's last line. The user said "skipped for
   now, will do later" on 2026-10-06: do it when asked, or as the first step of the next task.
2. **When the user opens Phase 2:** record the opening as an ADR, then write its plan into
   `BACKLOG.md` (milestones and tasks, as ADR-300 did for Phase 1) before any code: read
   `REQUIREMENTS-LATER.md`'s Phase 2, `spec/ARCHITECTURE.md` §6…§9 and §16, BACKLOG C71 and C83,
   and the scenarios marked "API (Phase 2)" in `spec/acceptance/`. One task per response.

**Every command starts with** `eval "$(fnm env --shell zsh)"`. The checks are `adms-verify`'s; the
database tests, the map servers' tests, the stories and `pnpm security` need `pnpm local:up` first,
and the stack is stopped at close-out (ADR-277). Names and examples: `spec/CONVENTIONS.md`. Field
names: `spec/DATA-MODEL.md`. Flag wording: `spec/FLAGS.md`.

**Keep this section short (ADR-375):** the session hook prints all of it into every session. It
holds the next task and what that task needs, never a list of finished ones; what a finished task
leaves for a later one goes in BACKLOG's carry-forward register.
