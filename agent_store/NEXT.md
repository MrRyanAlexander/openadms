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

## Exit criteria for Phase 1 *(ADR-299)*

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

**Still live from the spec track:** `spec/acceptance/` is 2 of 9 files (`01-setup.md`: 82
scenarios, 64 passing and AC-01-27, 48, 55 and 80 in part, after 1.1.11; `02-people-and-devices.md`: 74
scenarios, 35 passing at the database and four in part after 1.1.10, ADR-315); each other file is the first task of the milestone that builds its part
(ADR-300).

---

## 🔁 Handoff — read this first in a new session (rewritten 2026-09-28, ADR-225; updated 2026-10-02)

Everything decided is in the files; nothing lives only in an old chat. This block says **where
things stand, where the product ends up, the road there, and what is still to be asked**. What is
true now, topic by topic, is `SUMMARY.md`; the round-by-round history is the session log at the end
of `DECISIONS.md`.

### Where things stand (2026-10-03: Phase 1 is open, twelve tasks done; Milestone 1.1 is done)
- **Phase 1 (data core and engine) is the active phase**, opened by the user on 2026-10-01
  (ADR-299). Its plan is `BACKLOG.md`'s ten milestones and 47 tasks (ADR-300): setup records →
  certifications and capacity → tickets and numbers → sync intake → reconciliation → the rule engine
  → the ledger and audit → review, QC and the lock → the golden mission as a story. **Done so far:**
  1.0.1 (the plan), 1.1.1 (`spec/acceptance/01-setup.md`, 82 scenarios today) and **1.1.2, the firm's
  lists (2026-10-02, ADR-302)**: eighteen list tables (one per list), the six built-in keys as one
  closed set in `packages/domain`, `guard_list` (one line guards a list: only a release writes a
  key, a value with a key is never archived), and the seed's 94 starting values, written once into
  an empty list; and **1.1.3, the client, the declaration event and the project in full
  (2026-10-02, ADR-303)**: `Client`, `DeclarationEvent`, the whole `Project`, `ProjectKindOfWork`;
  a new project's settings start in `packages/domain` (`NewProjectSettings`) from the **policy
  values**, whose built-in defaults are the committed env file `packages/domain/policy.env`; no
  setting has a default in the database; the example world and both stories are in the new shape;
  and **1.1.4, contractors on a project, and contracts (2026-10-02, ADR-305; contact details at
  the user's word the same day, ADR-306)**: a contractor's kind, contact details and merge link, `ProjectContractor` (one place per project: prime, tier 1 or tier 2 under one of
  the project's primes) and `Contract` (name, prime, optional link); **the database holds "the
  prime" to one of the project's primes** through `asPrimeId` on the prime's row and two-column
  foreign keys, with no trigger; and **1.1.5, forms, the debris types on them, field tags and the
  firm's own fields (2026-10-02, ADR-308)**: `Form` (one per document type on a project),
  `FormDebrisType` (only on a load or haul-out form), `FormDefinition` (per project form, only on an
  ROE, survey, incident or drop-off log form, never edited by anyone: `refuse_edit`),
  `Assignment.formDocumentTypes`; `DebrisTypeEntries` in `packages/domain`, `formDefinitionFields` in
  `packages/contracts`; KD-66 closed; and **1.1.6, pay items in full (2026-10-02, ADR-309)**:
  `PayItem`'s every field (payable type, Unit of Measure, kind of work, size band, capture settings,
  crew time's conversion and day length), `PayItemRate` (one per prime, held to the project's
  primes) and `PayItemCrewDayStep`; an assignment names only unit rate pay items (C42);
  `SizeBands` in `packages/domain` (an overlap refused, a gap warned) and the policy value
  `CREW_DAY_HOURS=12`; and **1.1.7, disposal sites in full, and the project map (2026-10-02,
  ADR-311)**: a site's type, facts, GPS, dates, labels, **several tipping fee pay items** (KD-67; confirmed by the user, ADR-312),
  own shapes; map versions and zones, never edited, a zone only with its version; the database
  refuses *Haul-outs leave here* off a TDSR/DMS site (C52); shapes as GeoJSON (C57 for reading
  them); and, **at the user's word, `btree_gist`** (ADR-310), so the database refuses overlapping
  size bands too; and **1.1.8, rules (2026-10-03, ADR-313)**: `Rule`, `RuleCriterion`,
  `RuleCriterionPick`, `RuleAction`, `RuleActionItem`; a rule held to a ticket form and a contract
  of its own project, a picked value to the rule's own project and form, an operator to its
  criterion's kind; in `packages/domain`, which criteria a form takes, "Is valid", the refusal of
  an exact copy, the overlap warning and the rules a pay item's "Pays when" writes; and **1.1.9,
  the acceptance scenarios for people and devices (2026-10-03, ADR-314)**: 74 scenarios, each
  saying whether it is built (28, by Phase 0), task 1.1.10's (seven, and two in part) or a later
  phase's; and **1.1.10, people's permissions and viewers (2026-10-03, ADR-315)**: `UserPermission`
  and `ViewerProject` (table `user_viewer_project`), each taken away by archiving; a viewer's kind
  and contractor held by checks; **the database reads what a viewer may see from their own record**
  (the API states only `adms.viewer_id`); `guard_viewer`, one line per table, gives 41 setup tables
  and lists their row-level security: a client user and an auditor see their projects' whole
  setup, a contractor user none, no viewer a contact or a person; `Device.keyRevokedAt`; and **1.1.11, the example world's setup as a story (2026-10-03,
  ADR-316)**: the first services in `apps/api` (`src/setup/`, one class per group of setup
  records, each call one `db.$write` as the person, answering saved or refused), `MapShapes` in
  `packages/domain`, and the story `setup` (P1 by Dana, P2 by Luis, 51 checks); the story found
  that no zone could be written through Prisma, fixed by the fortieth migration (KD-68).
  **Corrected by the user on
  2026-10-02 (ADR-301):** a pay item's code is unique on its project (ADR-147 had read their answer
  backwards), a pay item is its code and its description (no separate name, no "line number"), and
  an exact duplicate of a rule is refused before it is saved; the provisional `pay_item` table and
  its test follow (the twentieth migration). **The first product tables
  exist** (the lists, the client, the declaration event, the project, contractors on a project,
  contracts, forms, pay items, sites, the project map, rules, permissions and viewers; 55 models,
  39 migrations);
  the other models are still Phase 0's provisional ones, and `packages/domain` holds the built-in
  keys, the policy values and a new project's settings.
- **Phase 0 (Foundation) is done** (2026-10-01, ADR-281…288): the monorepo, the local HTTPS stack
  with the map servers, the installer, the hardened database, the scenario harness and the security
  checks. How it got there moved to `DECISIONS.md`'s scratchpad (ADR-307). **Every known later
  concern** is in `BACKLOG.md`'s **carry-forward register** (C1…C59) under the task that picks it
  up (ADR-274): read a task's items before starting it.
- **Product rules:** 26 rounds of questions, **ADR-001…231**. **Discovery is closed (ADR-230, the
  question shot-clock):** no questions are open; ask the user only when the answer changes money,
  evidence or the monitor's work, blocks the task, and nothing covers it (at most three, each with a
  recommendation). Otherwise record an **agent default** ADR and carry on.
- **The user's main worry** (2026-09-29): an agent building "a bunch of stuff that's going to break
  and not work", or that doesn't do what they intended. Answer it with small steps, each verified by
  real output; nothing built ahead of `BACKLOG.md`; behaviour proven by the scenario harness and the
  golden mission; no reshaping of decided rules (ADR-229 withdrew the agent's own "pay items" for
  that reason).
- **How today's rules got their shape (2026-09-29):** the naming pass (ADR-234, 235), field events
  and pay items (ADR-236…238), rules, phones and hours (ADR-239…241), the tower's context (ADR-243)
  and the docs truth-up (ADR-247…253). Each bullet moved to `DECISIONS.md`'s scratchpad (ADR-307);
  each rule is in `SUMMARY.md`. One lesson stays here: **when a new ADR reshapes a model, check it
  joins the earlier ADRs on the same topic and reaches ARCHITECTURE, the part pages, the REQs and
  every skill that touches it.** Trust in this order: the newest ADR → `SUMMARY.md` → a current
  skill's body → the approved spec pages.

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
| 6 | **Acceptance scenarios + golden mission** 🟡 the mission is approved (ADR-297); the scenarios are written part by part, each before its milestone's code (ADR-300): 1 of 9 files | `spec/acceptance/`, `spec/golden/` with the user's signed-off numbers | Steps 2, 5 |
| 7 | **Phase 1: data core + engine, rebuilt** 🟡 open since 2026-10-01 (ADR-299); `BACKLOG.md` has its 47 tasks | Setup records, certifications and capacity, tickets and numbers, sync intake with quarantine, reconciliation, the rule engine, the ledger and audit, review, QC, invoice lock and batches; KD-01, 04, 05, 10, 12, 13, 15, 55, 56 closed; the golden mission passing at the engine | Steps 3–6 |
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
  longer in the working folder** (seen 2026-10-01; they were never committed). Never restore them.
  The docs' "`database/` is historical, read-only" lines stand as the rule if it reappears.
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
  `AGENTS.md` (`CLAUDE.md` links to it) is 189 lines, over its ~150 target (ADR-092); the session hook prints ~2.4 KB (ADR-232).

## 📍 Next Atomic Task

**New session? Read the "🔁 Handoff" block in `agent_store/NEXT.md` first** (where things stand, the
road to done), then `agent_store/SUMMARY.md`. Product discovery is closed (ADR-230): don't open new
rounds of questions.

**Phase 1 is open (ADR-299).** Its plan is `BACKLOG.md`, "Active — Phase 1" (ADR-300): read its
"Brief for every Phase 1 task" first. **One task per response.** Done: 1.0.1, 1.1.1, 1.1.2 (the
firm's lists, ADR-302), 1.1.3 (the client, the declaration event and the project in full,
ADR-303), 1.1.4 (contractors on a project, and contracts, ADR-305, 306), 1.1.5 (forms, debris
types, field tags, the firm's own fields, ADR-308), 1.1.6 (pay items in full, ADR-309), 1.1.7
(disposal sites in full and the project map, ADR-311; `btree_gist`, ADR-310), 1.1.8 (rules,
ADR-313), 1.1.9 (the acceptance scenarios for people and devices, ADR-314), 1.1.10 (people's
permissions and viewers, ADR-315), **1.1.11 (the example world's setup as a story, ADR-316:
Milestone 1.1 is done)**; and the user's correction of 2026-10-02 (ADR-301: a pay item's code is unique, it has a
description and no name, a duplicate rule is refused).

👉 **Task 1.2.1, `spec/acceptance/03-certification.md`** (`BACKLOG.md`, Milestone 1.2): the
acceptance scenarios for certifications, from Part 3 (`spec/parts/03-certification.md`) and
`adms-certifications`, the capacity examples taken from §3A.3 and the paper form, never from
`development/`. Docs only: no code before the scenarios (the brief). **Read first:** the part page,
the skill, `spec/acceptance/README.md` (how a scenario is written), `02-people-and-devices.md` as
the newest model, and the register's C56 and C59 (task 1.2.3's parts) and C60. Then 1.2.2 (the
capacity math in `packages/domain`) and 1.2.3 (the certification's records).

**Services** (ADR-316): what a person or a phone writes is a plain class in
`apps/api/src/<part>/` (today `setup/`), given the API's database client, a clock and, where
needed, the policy values; one call is one `db.$write` as the person and answers `saved` (the
record, any warnings) or `refused` (the domain's code and message; nothing saved); every rule is
`packages/domain`'s, called before the save; no service reads permissions yet (Phase 2). A story
drives them (`packages/scenarios/src/stories/setup.ts` is the model). **Inside a transaction read
one query at a time** (no query with several included relations: Prisma runs them in parallel on
the one connection). **A column a guard compares with `now()` is `@default(dbgenerated(…))`**,
never `@default(now())`, which Prisma's client fills with the app's clock (KD-68).

**People and viewers** (ADR-315): the example world has three read-only viewers
(`world.clientViewer`, given P1; `world.auditor`, given P1 and P2; `world.coastlineViewer`, a
contractor user, given P1); a test issues another with `viewerLike(name, kind, contractor?)` and
`given(viewer, project)`, and states who is looking with `db.viewer(id)`
(`packages/db/test/support/`). **A new table a client user or an auditor should see** gets
`SELECT guard_viewer('<table>', '<PROJECT|PART_OF|NAMED_BY|FIRM>'[, relation, column][, hidden]);`
in its guard migration and a row in `test/support/viewers.ts`; one nobody should see goes in that
file's `unseenTables`; a viewed table that gains a column reruns `guard_viewer` (C59). A
permission or a viewer's project is taken away by archiving, never deleted.

**Rules** (ADR-313): the example world's P1 has the golden mission's first rule in full
(`world.rule`: its id, its two criteria, its action); a test writes more with `ruleLike`,
`criterionLike`, `pickLike` and `actionLike` (`packages/db/test/support/example-world.ts`). A rule
repeats its form's `document_type`; a criterion line its rule's project and form; a pick its line's
project, form and criterion; an action its rule's project. The domain's `ProjectRules.check(rule,
changedFrom)` is what a setup service calls before it saves a rule (1.1.11); `PaysWhen.rules(…)`
returns the rules a pay item keeps, and matching them to the ones already saved is that service's.

**Sites and the map** (ADR-310, 311): the example world's P1 has Marsh Road TDSR (`world.site`)
and Bayline County Landfill (`world.landfill`) in full, with `world.siteTypes`; a test writes
another with `siteLike(world, siteTypeId, …)`, a TDSR/DMS one stating `site_type_key: 'TDSR'`; both
stories write them through `setUpP1Sites` (`packages/scenarios/src/stories/p1.ts`). A site's
tipping fee pay items are `DisposalSiteTippingFee` rows. **`btree_gist` lives in the schema
`extensions`**, which no runtime login may use; Prisma's shadow database drops it before each
replay (`prisma.config.js`, `initShadowDb`), so `prisma migrate dev` works as before.

**Pay items** (ADR-309): the example world's P1 has six of the golden mission's pay items with
Coastline's rates (`world.payItems`, `world.rates`, `world.payableTypes`, `world.kindsOfWork`); a
test enters another with `payItemLike(world, …)` and `insertOf`, since no capture setting has a
database default. An assignment's pay item repeats its `kindOfWorkId`.

**Forms** (ADR-308): a row that belongs only on some kinds of form (`FormDebrisType` on a load or
haul-out form, `FormDefinition` on an ROE, survey, incident or drop-off log form) repeats its form's
`documentType`, held by a check and a two-column foreign key to `form (id, document_type)`. A
version that is never edited uses `refuse_edit()` (as map versions, zones and site shapes do since 1.1.7). The
example world's P1 has a load form (Vegetative, C&D), a haul-out form and an incident form
(`world.forms`, `world.formDebrisTypes`).

**"The prime" is one key** (ADR-305): a table that names a prime (`Contract` today; a pay item's
rate in 1.1.6, a certification in 1.2.3) holds it with a two-column foreign key (project, prime) to
`project_contractor (project_id, as_prime_id)`, so only one of the project's own primes can be
named. Whoever adds a prime to a project writes `asPrimeId` = its contractor; a database test uses
`primeOn(project, contractor)` and `subOn(project, contractor, prime, tier)`
(`packages/db/test/support/example-world.ts`). A contractor's kind has no default.

**A project is written whole** (ADR-303): no setting has a database default. A story or a service
starts from `new NewProjectSettings(policy).for(programType)` (`packages/domain`), the policy read
from `packages/domain/policy.env` (a story: `story.policy`); a database test uses
`projectLike(world, …)` and `insertOf` (`packages/db/test/support/example-world.ts`). **A new
threshold** is a name in the domain's `policyNames` and a line in `policy.env`, with an ADR; never a
literal, never a database default.

**A new list** (if a task needs one) is a model in `configuration.prisma` with the six list columns,
then `SELECT guard_list('<table>', '<domain>');` in its guard migration; a new built-in key goes in
`packages/domain`'s `builtInKeys` first, with an ADR (ADR-302).

Start every command with `eval "$(fnm env --shell zsh)"`; the checks are **`adms-verify`** (the chain
is 44 files, 867 tests; forty migrations; `pnpm scenarios` runs three stories, 16, 18 and 51 checks),
with **`pnpm security`** (7 passed, 0 failed, ADR-291). The database tests, the map servers' tests and
the stories need `pnpm local:up` first; stop it at close-out (ADR-277). A schema change goes through
Prisma (`prisma migrate dev --create-only`), a guard into its own empty stub (ADR-113); **try a guard
migration on a throw-away copy before `pnpm installer` applies it**, since an applied one is never
edited. **Loosened guards are tried two at a time on this machine**, each on its own copy
(`adms_mutation_0`, `_1`; `adms-verify` §1.3; four at once filled Docker's disk on 2026-10-03): run
nothing else against the database, and no `pnpm lint` or `pnpm test`, while they go.

**Words and examples everywhere:** `spec/CONVENTIONS.md` (ADR-234, 235). Field names:
`spec/DATA-MODEL.md`. Flag wording: `spec/FLAGS.md`.
