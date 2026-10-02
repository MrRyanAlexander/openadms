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

## Phase 0: Foundation — ✅ done 2026-10-01 *(ADR-093, ADR-103; kept as the record)*

**Why this phase exists.** On 2026-09-25 the user decided:
- **security comes first**, at every layer;
- the plan (skills, spec, ADRs) is the core;
- the code in `database/` is **historical**: early scaffolding, not a base;
- the reconciliation engine is **rebuilt 100%**;
- the platform is **TypeScript end to end with Prisma** (ADR-094).

Build 1's first lesson was "we never designed" (`spec/FROM-BUILD-1.md` §14). Phase 0 designs the
foundation, proves the security-critical pieces, and only then opens the rebuild.

**Objective.** An approved `spec/ARCHITECTURE.md`, answered foundation questions, and a scaffolded
repository in which the database hardening and the scenario harness are proven by tests.

**Scope boundary.**
- **Until ARCHITECTURE sections are approved:** `spec/` and `agent_store/` only (docs).
- **After approval:** the approved layout (`apps/`, `packages/`, `infra/`, `tools/`,
  ARCHITECTURE §18) opens piece by piece, each recorded as an ADR.
- `database/` is **read-only history** (guard hook).
- `api/`, `field-webapp/`, `back-office-webapp/` are empty placeholders, replaced by the approved
  layout.

**Environment.** Decided when §3 is approved and pinned by ADR: Node LTS, Postgres, Prisma,
TypeScript. Docker for the local stack.

---

## Exit criteria for Phase 0

All observed and reported, not assumed:

1. `spec/ARCHITECTURE.md` approved section by section by the user; each approval recorded as an
   ADR; `SUMMARY.md` updated (REQ-001). ✅ Done 
2. Foundation questions answered. ✅ Done 2026-09-25 (Q-90…Q-94, Q-114, Q-115).
3. Repository scaffolded to the approved layout, dependencies pinned by ADR (REQ-002, REQ-005).
   ✅ Done (ADR-255…266; REQ-005 ticked, ADR-287). **REQ-002 ticked 2026-10-01 (ADR-288): the user
   made the first commits**, the lockfile among them. REQ-003 and REQ-004 (what the domain and
   contracts packages come to hold) moved to Phases 1 and 2 (ADR-287).
4. The local stack runs with one command over HTTPS; the installer resumes cleanly (REQ-007, 008).
   ✅ Done (ADR-263…266); the routing and address servers joined 2026-10-01 (REQ-022, ADR-282).
   REQ-006 (every service, so the API and the apps too) moved to Phase 2 (ADR-287).
5. Database hardening proven by tests: roles and grants (every grant and refusal), no deletes,
   trigger-written audit with a required actor, insert-only `AuditRecord`, transaction deletes
   copied to audit first, row-level security (REQ-009…014). ✅ Done 2026-09-30 (ADR-272: 94 tests;
   each guard's removal caught).
6. The scenario harness runs one trivial end-to-end story from a terminal, and the security checks
   run with the tests (REQ-018). (REQ-017, the golden mission as its story, moved to Phase 1, ADR-287.) ✅ The harness part done 2026-09-30 (ADR-275:
   `pnpm scenarios`, story `ticket-101001`, 14 checks); ✅ the security checks done 2026-09-30
   (ADR-276: `pnpm security`, REQ-018; **7 passed, 0 failed** since the user retired the historical
   root `docker-compose.yml`, 2026-10-01, ADR-291).
7. Time zone, device and Monitor ID foundations modelled (REQ-019…021). ✅ Done 2026-10-01 (ADR-281,
   286: all three ticked; an assignment names its unit rate pay items).

**All seven are met, and every Phase 0 task is done (2026-10-01, ADR-282…287):** all 17 of Phase 0's
REQs are ticked (REQ-002 with the user's first commits, ADR-288), and `spec/DATA-MODEL.md` and
`spec/FLAGS.md` are approved (ADR-289, 290). The data model's thirteen points are settled (KD-65 closed, ADR-292…295). **The user opened Phase 1
on 2026-10-01 (ADR-299)**; its exit criteria are above.

---

## 🧭 Parallel track — product spec (ADR-043)

Defines *what* is built; runs alongside. `[x]` = the agent's part is done; **✅ Approved** = the user
approved it.

- [x] `spec/VISION.md`, `spec/INDEX.md` + `spec/parts/01…09`, `spec/LISTS.md` drafted. **✅ Approved
      2026-09-29** (ADR-269), after a review against today's model; its updates are in ADR-269.
- [x] `spec/QUESTIONS.md` (complete; no approval needed): rounds 1–9 answered (ADR-050…091). **2026-09-25:** Q-84…Q-89 answered
      (ADR-095…101); Build 1 answers carried forward as Q-95…Q-103 (ADR-102).
- [x] `spec/ARCHITECTURE.md` drafted (ADR-093…101). **✅ Approved in full 2026-09-26** (ADR-104, 139,
      141, 143, 144).
- [x] 2026-09-25 second round: answers to Q-90, Q-91, Q-94, Q-99, Q-104…Q-108; the legacy rule
      editor screenshots and the Build 1 diagrams reviewed (ADR-104…112).
      Round 3: Q-92, Q-93, Q-109…Q-115 answered (ADR-113…120). Round 4: Q-116, Q-117
      (ADR-121…123). Round 5: Q-118, Q-119 (ADR-124, 125). Round 6: Q-120, Q-121 (ADR-126, 127). Round 7: Q-122, Q-123 (ADR-128, 129). Round 8: Q-124 (ADR-130). Round 9: Q-125 (ADR-131).
      Round 10: Q-126 (ADR-132) and a housekeeping pass over the agent docs (ADR-133).
      Round 11 (2026-09-26): Q-127…Q-133 answered (ADR-134…140). Round 12: Q-134, Q-135 (ADR-141,
      142), the rest of ARCHITECTURE (ADR-143) and Q-136 (ADR-144) approved.
      Round 13 (2026-09-27): Q-137…Q-165 answered (ADR-145…173). Round 14: Q-168…Q-175 answered
      (ADR-174…181). Round 15: Q-176…Q-178 answered (ADR-182…184). Round 16: Q-179…Q-181 (ADR-185…188). Round 17: Q-182…Q-184 (ADR-189…191). Round 18: Q-185, Q-186 (ADR-192…194). Round 19: Q-187, Q-188 (ADR-195, 196). Round 20: Q-189, Q-190, Q-192 (in part), Q-193 (ADR-197…201); Q-194 deleted. Round 21: Q-191, Q-195…Q-197 (ADR-202…205). Round 22: Q-198…Q-203 (ADR-206…216). Round 23: Q-204 (closed into Q-209), Q-205, Q-208 (ADR-217, 218). Rounds 23–24: Q-206, Q-207, Q-209 (ADR-219…221). Round 25: Q-210, Q-211 (ADR-222…224) and a whole-plan review (ADR-225). Round 26 (2026-09-29): Q-212…Q-214 (ADR-226…229). **Product discovery closed: the question shot-clock (ADR-230).**
- [x] `spec/RATE-SHEET.md`: a real prime contractor rate sheet set up line by line (ADR-196).
      **✅ Approved 2026-09-29** (ADR-269).
- [x] `spec/RULES.md`: the rule builder spec (ADR-123), extended through ADR-132 (white goods rules in §9), one
      contract per rule (ADR-239). **✅ Approved 2026-09-29** (ADR-269), §7 "Is valid" included.
- [x] `spec/FROM-BUILD-1.md` (complete; no approval needed): the user's Build 1 answers, verbatim (ADR-102).
- [x] `spec/DATA-MODEL.md` (ADR-284) and `spec/FLAGS.md` (ADR-285) drafted 2026-10-01. **✅ Approved
      by the user 2026-10-01** (ADR-289, 290): the sixteen defaults of the first and the four points
      of the second stand. DATA-MODEL was then laid out one way throughout, and checked against the
      rest of the spec: thirteen points (KD-65). **All settled the same day at the user's word
      (ADR-292…295).**
- [ ] `spec/acceptance/`: `AC-…` scenarios from approved part pages; they become scenario-harness
      stories (REQ-017). **1 of 9 written (2026-10-01, ADR-300):** `README.md` (how a scenario is
      written and proven) and `01-setup.md` (81 scenarios; corrected at the user's word, ADR-301;
      19 passing: 8 by ADR-302, 11 more by ADR-303). Each of the others is the first task of
      the milestone that builds its part (`BACKLOG.md`).
- [x] `spec/golden/`: the golden mission and its expected ledger. `spec/golden/MISSION.md` written
      (ADR-232): every kind of record and each one's life. A split haul-out, ticket 201004, added
      (ADR-296) and told as a weighed one at the user's word (ADR-297). **✅ Approved by the user
      2026-10-01, numbers included (ADR-297):** P1's ledger $5,548.25 on 19 lines, P2's $324.00.
      Its GPS points and word-for-word flag messages come when it becomes a story (C30, C50).

---

## 🔁 Handoff — read this first in a new session (rewritten 2026-09-28, ADR-225; updated 2026-09-29)

Everything decided is in the files; nothing lives only in an old chat. This block says **where
things stand, where the product ends up, the road there, and what is still to be asked**. What is
true now, topic by topic, is `SUMMARY.md`; the round-by-round history is the session log at the end
of `DECISIONS.md`.

### Where things stand (2026-10-02: Phase 1 is open, four tasks done)
- **Phase 1 (data core and engine) is the active phase**, opened by the user on 2026-10-01
  (ADR-299). Its plan is `BACKLOG.md`'s ten milestones and 47 tasks (ADR-300): setup records →
  certifications and capacity → tickets and numbers → sync intake → reconciliation → the rule engine
  → the ledger and audit → review, QC and the lock → the golden mission as a story. **Done so far:**
  1.0.1 (the plan), 1.1.1 (`spec/acceptance/01-setup.md`, 81 scenarios) and **1.1.2, the firm's
  lists (2026-10-02, ADR-302)**: eighteen list tables (one per list), the six built-in keys as one
  closed set in `packages/domain`, `guard_list` (one line guards a list: only a release writes a
  key, a value with a key is never archived), and the seed's 94 starting values, written once into
  an empty list; and **1.1.3, the client, the declaration event and the project in full
  (2026-10-02, ADR-303)**: `Client`, `DeclarationEvent`, the whole `Project`, `ProjectKindOfWork`;
  a new project's settings start in `packages/domain` (`NewProjectSettings`) from the **policy
  values**, whose built-in defaults are the committed env file `packages/domain/policy.env`; no
  setting has a default in the database; the example world and both stories are in the new shape.
  **Corrected by the user on
  2026-10-02 (ADR-301):** a pay item's code is unique on its project (ADR-147 had read their answer
  backwards), a pay item is its code and its description (no separate name, no "line number"), and
  an exact duplicate of a rule is refused before it is saved; the provisional `pay_item` table and
  its test follow (the twentieth migration). **The first product tables
  exist** (the lists, the client, the declaration event and the project; 36 models, 24 migrations);
  the other models are still Phase 0's provisional ones, and `packages/domain` holds the built-in
  keys, the policy values and a new project's settings. Everything
  below this bullet is how Phase 0 got here.
- **Phase 0 (Foundation).** The skeleton exists (placeholders only); no product code yet. `database/` is historical
  and read-only. `spec/ARCHITECTURE.md` is **approved in full**, so **Milestone 0.2 (scaffold) is
  open** (ADR-143), with a step-by-step brief in `BACKLOG.md` (ADR-231). **The skill rewrites
  are done** (Milestone 0.2c, ADR-232, 242, 244, 245, 248…253; every skill but `adms-verify` is
  current) and so is the docs truth-up (ADR-247). **The monorepo skeleton (0.2.1) is done** (ADR-255…258: pnpm 11 workspace, TypeScript 6.0.3, ESLint + Prettier, `pnpm licences`), **and so is 0.2.2** (ADR-259…261: Vitest 5.0.1 on Vite 8.3.0, Zod in `contracts` → `domain`, `adms-verify` rewritten), **and 0.2.3** (ADR-263, 264: the local stack in `infra/local`, Postgres 18.6, SeaweedFS, Caddy, Mailpit, HTTPS only, `pnpm local:up`), **and 0.2.4** (ADR-265, 266: `pnpm installer`, the four login roles and the database `adms`, one env file per service); **Milestone 0.2 is done.** **0.3.1 is done** (ADR-267, 268: Prisma 7.10.0, nine provisional models, the first migration applied by the installer), **and 0.3.2** (ADR-270: nine guard migrations, proven on a re-created database), **and 0.3.3** (ADR-272: 94 database tests; 26 loosened guards, each caught; `guard_gaps()` fixed forward), **and 0.3.4** (ADR-273: `db.$write(actor, work)`, the Prisma client extension that states the actor; the system actor, `User` role `SYSTEM`, seeded by the installer); **Milestone 0.3 is done**, **and 0.4.1** (ADR-275: the scenario harness, `pnpm scenarios`; each story on its own database, made, migrated, seeded and dropped; the first story, ticket 101001, synced out of order), **and 0.4.2** (ADR-276: the system actor's guard, so the API can't write as it or change it; `pnpm security`, the dependency audit, secrets scan, env files and grant tests with real counts; CIS items for the database), **and 0.4.3** (ADR-281: `MasterPasscode`, `NumberBlock`, a provisional `DisposalSite`, `Assignment`; the device's name, unique key, status and passcode version; a database-issued Monitor ID and an employer; every field event's assignment and setup version; the project's time zone checked; the master passcode's hash kept in the database alone and out of the audit log; a second story, `dispatch-monday`); **Milestone 0.4 is done and Phase 0's seven exit criteria are met.** **2026-10-01, closing Phase 0 out at the user's word (ADR-282…287):** the routing and address servers in the local stack (Valhalla 3.9.0, Nominatim 5.3.2, one pinned Delaware extract; REQ-022); the guard hook tightened and tested (0.1.6, REQ-023); `spec/DATA-MODEL.md` and `spec/FLAGS.md` drafted (0.2b.2, 0.2b.3); an assignment's unit rate pay items (REQ-020); the REQ list closed out (17 of 17 once the user made the first commits, ADR-288; six moved to the phase that finishes each). **Every Phase 0 task is done.** **Every known later concern** from ADR-255…274 is filed in
  `BACKLOG.md`'s **carry-forward register** (C1…C47) under the task that picks it up (ADR-274): read
  a task's items before starting it.
- **Product rules:** 26 rounds of questions, **ADR-001…231**. **Discovery is closed (ADR-230, the
  question shot-clock):** no questions are open; ask the user only when the answer changes money,
  evidence or the monitor's work, blocks the task, and nothing covers it (at most three, each with a
  recommendation). Otherwise record an **agent default** ADR and carry on.
- **The user's main worry** (2026-09-29): an agent building "a bunch of stuff that's going to break
  and not work", or that doesn't do what they intended. Answer it with small steps, each verified by
  real output; nothing built ahead of `BACKLOG.md`; behaviour proven by the scenario harness and the
  golden mission; no reshaping of decided rules (ADR-229 withdrew the agent's own "pay items" for
  that reason).
- **Names and examples (2026-09-29, ADR-234, 235):** `spec/CONVENTIONS.md` is the naming pass. The
  legacy screens' words are gone (Service → **pay item**, Classification → **payable type**, debris
  class → **debris type**, Location Type → **site type**, the site boxes → plain facts, Special Class →
  **field tag**), a **pay item code convention** (`VEG-HAUL-CY-15`) is offered, and every example comes
  from **the example world** (the golden mission). The user's examples (`1A Hanger`, `54A`, TFR, Hwy 20
  TDSR…) are **retired**: they stay in `QUESTIONS.md`, `DECISIONS.md` and `FROM-BUILD-1.md` only.
  Done now: CONVENTIONS, SUMMARY, `adms-domain`, the golden mission, `AGENTS.md`, `INDEX.md`; the
  other skills and spec pages carry a banner and drop their retired examples and old words when each
  is rewritten (the 0.2c brief and its done-when checks enforce it).
- **Field events and pay items (2026-09-29, ADR-236…238):** what each monitor records under a ticket
  number is a **field event** (`COL` `DIS` · `HOC` `HOD` · `URT`); a ticket is its number and its
  events; the completed load, statuses, flags and transactions are conclusions the worker draws from
  them (event-driven, not event-sourced). **Service code is now "pay item"** (`PayItem`, the user's
  pick; words only). An outside design review was weighed; nothing else is taken (ADR-238). Model:
  `adms-domain` §1.2; every skill rewrite writes in events (BACKLOG 0.2c brief, item 9).
- **Rules, phones and hours reshaped (2026-09-29, ADR-239…241):** a rule names one contract and runs
  only on its prime's tickets; phones are **enrolled once** and take the day's **assignment** from a
  **dispatch board**, syncing whenever there's signal; the **time clock** hangs on the assignment
  (manual, nudges, manager approval, export). `VISION.md` rewritten short, in field events. The
  Phase 0 device model (REQ-020, BACKLOG 0.4.3) now includes the assignment.
- **The tower's context, merged (2026-09-29, ADR-243):** a phone at a site knows its site from its
  **assignment**, and its lists carry **that site's quantity lookup** (load call, scale weight, or a
  count of the tickets a load carries), worked out ahead from the rules (ADR-227). ADR-223/227 had
  never reached ARCHITECTURE §7.1/§9, `adms-field-app`, part 04 or the REQs; now they have, and
  the rewritten `adms-data-model` and `adms-exceptions` state them in their bodies (ADR-245, 248). **When a
  new ADR reshapes a model, check it joins the earlier ADRs on the same topic and reaches
  ARCHITECTURE, the part pages, the REQs and every skill that touches it.**
- **The docs match the rules (2026-09-29, ADR-247…253).** Every domain skill, spec page and REQ is
  in today's rules, in field events and today's words; KD-33, 58, 61 and 62 are closed, and KD-57
  closed with the `adms-verify` rewrite (ADR-259). **Trust in this order: the newest
  ADR → `SUMMARY.md` → a current skill's body → spec drafts.** A completeness check after the
  session limit (ADR-254) found the content done and only the state files behind; they're fixed.

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
Done is proven, not ticked (`spec/VISION.md` §8, still ⚠️ proposed): approved part pages →
**acceptance scenarios** (`spec/acceptance/`, `AC-…`) → a **golden mission** (`spec/golden/`: several
messy field days, with the exact statuses, review queue and ledger **signed off by the user**) →
the same scenarios passing at each layer (engine, API, apps). The finished surfaces are `VISION.md` §7.

### The road to done
**The user's one-page view of this, with every phase's status: `agent_store/ROADMAP.md`** (ADR-280).
Update it at close-out when a task, milestone or phase closes.

| # | Step | What it produces | Needs first |
|---|---|---|---|
| 1 | **Phase 0 scaffold** (BACKLOG 0.2.1 → 0.2.4) ✅ done (ADR-255…266) | Monorepo with pinned dependencies (AGPL-3.0-compatible), domain and contracts packages with tests, local HTTPS stack, installer | Node 24 LTS on the machine |
| 2 | **Naming pass ✅ (`spec/CONVENTIONS.md`, ADR-234) → `DATA-MODEL.md` → `FLAGS.md`** (BACKLOG 0.2b) ✅ both drafted and **approved 2026-10-01** (ADR-284, 285, 289, 290); DATA-MODEL's open points are KD-65 | Every record, field, criterion, status and export column named; the schema on paper; every flag's code, trigger, message, still-bills and accept rule; the user may overturn any name | Can run beside step 1 |
| 3 | **Database hardening** (BACKLOG 0.3) ✅ done (ADR-267, 268, 270…273) | Roles, grants, no deletes, audit triggers, insert-only audit, transaction copy-to-audit, row-level security, each proven by tests | Step 1; minimal provisional models |
| 4 | **Prove it** (BACKLOG 0.4) ✅ done 2026-10-01 (ADR-275, 276, 281) | Scenario harness with one trivial story; security checks in the test run; time zone, device, Monitor ID models | Steps 1, 3 |
| 5 | **Truth-up the docs** ✅ done 2026-09-29 (ADR-247…253; KD-33, 58, 61, 62 closed) | `RATE-SHEET.md`, `RULES.md`, `LISTS.md`, parts 01/04/06/07 and the skills rewritten to today's rules, one per response (ADR-138) | Before step 7's engine work |
| 6 | **Acceptance scenarios + golden mission** 🟡 the mission is approved (ADR-297); the scenarios are written part by part, each before its milestone's code (ADR-300): 1 of 9 files | `spec/acceptance/`, `spec/golden/` with the user's signed-off numbers | Steps 2, 5 |
| 7 | **Phase 1: data core + engine, rebuilt** 🟡 open since 2026-10-01 (ADR-299); `BACKLOG.md` has its 47 tasks | Setup records, certifications and capacity, tickets and numbers, sync intake with quarantine, reconciliation, the rule engine, the ledger and audit, review, QC, invoice lock and batches; KD-01, 04, 05, 10, 12, 13, 15, 55, 56 closed; the golden mission passing at the engine | Steps 3–6; refresh `REQUIREMENTS.md` against `SUMMARY.md` first (KD-61) |
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
- Before asking how a contract line works, check whether projects, names, Services and rules already
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
- **The repository has a history since 2026-10-01 (ADR-288):** nine commits by the user on branch
  `phase0-foundation` (`a94cdb6`…`b5329fe`), each a slice of that day's files in Phase 0's build
  order, so only the newest is a state that was built and tested whole. There is no `main` and no
  remote yet (both the user's call). Agents still never write to git (ADR-008): end a file-changing
  response with the user's git block, **staging named paths, never `git add .`**.
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
  `AGENTS.md` is ~174 lines, over its ~150 target (ADR-092); the session hook prints ~2.4 KB (ADR-232).

## 📍 Next Atomic Task

**New session? Read the "🔁 Handoff" block in `agent_store/NEXT.md` first** (where things stand, the
road to done), then `agent_store/SUMMARY.md`. Product discovery is closed (ADR-230): don't open new
rounds of questions.

**Phase 1 is open (ADR-299).** Its plan is `BACKLOG.md`, "Active — Phase 1" (ADR-300): read its
"Brief for every Phase 1 task" first. **One task per response.** Done: 1.0.1, 1.1.1, 1.1.2 (the
firm's lists, ADR-302), **1.1.3 (the client, the declaration event and the project in full,
ADR-303)**; and the user's correction of 2026-10-02 (ADR-301: a pay item's code is unique, it has a
description and no name, a duplicate rule is refused).

👉 **Task 1.1.4, contractors on a project, and contracts** (`BACKLOG.md`, Milestone 1.1).
`Contractor.kind` (`ContractorKind`: `HAULER` · `MONITORING` · `CREW` · `OTHER`) and its merge link
(`mergedIntoId`); `ProjectContractor` (`ContractorPosition`: `PRIME` · `SUB_TIER_1` · `SUB_TIER_2`;
one place per project; a sub names its prime, a prime names none); `Contract` (a name, its prime,
an optional link; nothing else). **The example world and both stories move to the new shape in the
same task** (Coastline and Summit become P1's primes, Harbor Staffing a contractor of the monitoring
kind). **Read first:** `spec/DATA-MODEL.md` §2.1 (`Contractor`, `ProjectContractor`) and §3
"Contracts and forms" (`Contract`), `spec/parts/01-setup.md` step 4, `spec/acceptance/01-setup.md`
section B and its point 1 (whether the database, or only setup, refuses a contract whose prime isn't
one of the project's primes: settled in this task's ADR, as an agent default), `adms-data-model`
§3.1a. **Done when:** AC-01-15…18, 20, 21 pass, named by their IDs (AC-01-19 is a story's, task
1.2.3); `guard_gaps()` is empty; each new guard's removal is shown caught; the chain is green with
real counts. REQ-106e's tiers (its subs at certification: 1.2.3). Then 1.1.5: forms, debris types,
field tags, the firm's own fields.

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
is 31 files, 562 tests; twenty-four migrations; `pnpm scenarios` runs two stories, 16 checks each),
with **`pnpm security`** (7 passed, 0 failed, ADR-291). The database tests, the map servers' tests and
the stories need `pnpm local:up` first; stop it at close-out (ADR-277). A schema change goes through
Prisma (`prisma migrate dev --create-only`), a guard into its own empty stub (ADR-113); **try a guard
migration on a throw-away copy before `pnpm installer` applies it**, since an applied one is never
edited.

**Words and examples everywhere:** `spec/CONVENTIONS.md` (ADR-234, 235). Field names:
`spec/DATA-MODEL.md`. Flag wording: `spec/FLAGS.md`.
