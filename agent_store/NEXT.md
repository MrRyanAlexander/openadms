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

**Still live from the spec track:** `spec/acceptance/` is 7 of 9 files (`07-pricing-ledger-audit.md`: 114 scenarios, written 2026-10-05, ADR-353, **83 passing at the domain after task 1.6.3, ADR-355**; `06-reconciliation.md`: 162 scenarios, written 2026-10-05, ADR-339; **165 scenarios since ADR-345; 146 passing and 14 more in part after task 1.6.3, ADR-355**; `05-sync.md`: 56 scenarios, written 2026-10-04, ADR-333; **43 passing and two in part after task 1.4.2, ADR-338**; `04-field-capture.md`: 103 scenarios, 98 passing after C67 (e), ADR-337; `01-setup.md`: 82
scenarios, 69 passing (AC-01-19 since 1.2.3, AC-01-09 since 1.3.2, AC-01-27 whole since 1.3.4, AC-01-33 and 48 since 1.5.7) and AC-01-55 and 80 in part; `02-people-and-devices.md`: 74
scenarios, 35 passing at the database and four in part after 1.1.10, ADR-315; `03-certification.md`: 60 scenarios, 39 passing and 1 in part after 1.3.5, ADR-326); each other file is the first task of the milestone that builds its part
(ADR-300).

---

## 🔁 Handoff — read this first in a new session (rewritten 2026-09-28, ADR-225; updated 2026-10-02)

Everything decided is in the files; nothing lives only in an old chat. This block says **where
things stand, where the product ends up, the road there, and what is still to be asked**. What is
true now, topic by topic, is `SUMMARY.md`; the round-by-round history is the session log at the end
of `DECISIONS.md`.

### Where things stand (2026-10-05: Phase 1 is open, thirty-seven tasks done (the newest: 1.6.3, actions to lines, ADR-355; before it 1.6.2, criteria, ADR-354); Milestones 1.1, 1.2, 1.3, 1.4 and 1.5 are done; C67 (a)…(f) built)
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
  that no zone could be written through Prisma, fixed by the fortieth migration (KD-68); and
  **1.2.1, the acceptance scenarios for certifications (2026-10-03, ADR-317)**: 60 scenarios, each
  naming the task that proves it; fourteen points nothing settles listed (C61); **KD-69, closed by
  the user (ADR-318):** the golden mission's 102001 scanning `730416` on P2 stands; a cert number
  is unique per project only, so P2 has its own `730416`; and **1.2.2, the capacity math
  (2026-10-03, ADR-320)**: `Capacity` in `packages/domain`, the paper form's method in exact
  hundredths, every operation a step; a zero, missing or fractional measurement, or boxes that
  subtract it all, give no capacity and a plain reason; the three containers' boxes are in
  `spec/CONVENTIONS.md` §6; and **1.2.3, the certification's records (2026-10-03, ADR-321:
  Milestone 1.2 is done)**: `Certification`, `CertificationBox`, `CertificationHelper`; only a
  container holds boxes, and it always has its primary one; a sub is held to its own prime's place
  on the project; the service `Certifications` (`apps/api/src/certification/`) certifies as the
  monitor from their phone, works the capacity out and never takes one typed, places a typed sub,
  and corrects, revokes and copies; `ContractorSetup.merge` merges two spellings of a sub; the
  story `certification` (27 checks). Found and closed on the way: KD-70 (below, under Tools);
  and **1.3.1, the acceptance scenarios for tickets and numbers (2026-10-03, ADR-322)**: 98
  scenarios of what is recorded (numbers, what every field event and each kind records, scale
  receipts, photographs, forms), each naming the task that proves it; eighteen points nothing
  settles listed (C63); and **1.3.2, numbering (2026-10-03, ADR-323)**: `ProjectNumberSeries`
  and `ControlRange`, `ROE` as a fifth series, a block cut only from a series its project has;
  **the database refuses any block that would put one number on two phones**
  (`number_blocks_never_overlap`: a reclaimed block holds only what its phone used, so its rest
  is cut again for the next phone, once); the number rules in `packages/domain` (`numbers.ts`),
  block sizes as policy values; the allocator `NumberAllocator` in `apps/api`
  (`src/numbering/`); the story `numbering` (15
  checks); and **1.3.3, what every field event records (2026-10-03, ADR-324)**: `FieldEvent`'s
  shared columns of `spec/DATA-MODEL.md` §4.1 (1), none with a database default; one check
  tells a phone's record (phone, assignment, setup version) from one created in the back office
  (person, reason); a reason only on a typed number, a typed capacity only on a truck keyed in
  by hand, each GPS end whole and on the earth or missing, an address with its source; the
  certification found and the site held to the field event's own project; a client user and an
  auditor see every column, and who recorded it through `viewer_field_event_monitor`; and
  **1.3.4, what each kind records (2026-10-03, ADR-325)**: the kind-specific columns of
  `spec/DATA-MODEL.md` §4.1 (2), none required, each refused on a kind that doesn't record it;
  a debris type held to its own project's form for its workflow (the field event repeats the
  entry's form and document type), a field tag and a pay item to its project; a split suffix
  only on a collection or a haul-out collection, capital letters; a split's suffix and
  estimate both or neither; `FieldEventItem` and `CarriedTicket`, each only on its kind; the
  one rule in `packages/domain` (`FieldEventDetails`), asked by `packages/contracts`
  (`fieldEventDetailsSchema`). The ROE found joins with its table (1.3.6); and **1.3.5, scale
  receipts and photographs (2026-10-04, ADR-326)**: `ScaleReceipt` (the site's number as
  written, never unique since ADR-331; every weight optional, none worked out) and `Photo` (exactly one
  owner of its own project: a field event, a certification or a scale receipt today; two
  fingerprints and two unique places in storage, written once; a view only on a
  certification's); `FieldEvent.scaleReceiptId`, only on a disposal and a haul-out disposal,
  its own project's; both tables seen by a client user and an auditor with their project, a
  photograph without where its file is kept. A certification is never copied (ADR-328, 330), and a scale receipt's number is never unique (ADR-328, 331); and **1.3.6, ROEs and forms (2026-10-04, ADR-327)**: `Roe` and `RoeScopeItem`
  (configuration: a number once per project, a phone's or the back office's, its scope picked
  from its own project's load form or the payable types) and `Survey`, `Incident`, `DropOffLog`
  (evidence, each saying where it came from as a field event does); each record's answers with
  the definition answered, of its own project's form of its kind, or `{}` with none;
  `formAnswersSchema` in `packages/contracts`; `FieldEvent.roeId`; `Photo`'s four new owners; and **1.3.7, the harness's phones capture every kind (2026-10-04, ADR-332: Milestone 1.3 is done)**: the one rule that works a unit rate pay item out from the size bands (`SizeBands.payItemFor`, `packages/domain`); the harness's phone holds its assignment's lists, scans the badge at New, picks by name and takes the number last (its own block's next, or scanned; entered again); the story `p1-field-days`: P1's Monday and Tuesday, 25 field events, a scale receipt, an incident and a drop-off log, every field event `PENDING`; and **1.4.2, intake (2026-10-04, ADR-338: Milestone 1.4 is done)**: `apps/api`'s `Intake` (`src/sync/`) answers each record a phone sends saved, already saved or not saved; `QuarantinedRecord` keeps a duplicate field event, and an ROE whose number is taken, whole, never changed or deleted; `Photo.quarantinedRecordId`; an impossible GPS fix kept as sent in `FieldEvent.unreadableGps`; `GpsFix` and `Quarantine` in `packages/domain`; the stand-in intake gone; the stories `sync` and `p1-any-order`; and **1.5.2, the derived records (2026-10-05, ADR-340)**: `CompletedLoad` reshaped (one per disposal event, its quantity, `dissolvedAt`), `CompletedLoadCollection`, `CompletedHaulOut` and `CompletedHaulOutCollection` (a row for each collection: each property, each pile), `Flag` with the catalogue's 66 codes as `FlagCode` and `FlagBilling`, `ReconciliationRun`, `ReconciliationDecision`, and the worker's `zoneId`, `mapVersionId` and `workedOutPayItemId` on a field event; only the worker's login writes them; a load can't be concluded twice (a unique key on the disposal, exclusions over the live rows); whatever a derived record names is its own project's; a client user and an auditor see the completed records, their rows and the flags; and **1.5.3, grouping and status (2026-10-05, ADR-341)**: `packages/domain`'s `Tickets` and `Ticket` (`tickets.ts`): field events gathered on project, workflow and number and nothing else, in field order; what a ticket has and waits for, a split's lettering, a load's time; the worker's three statuses from whether it is whole and the flags raised on it; and **1.5.4, quantities (2026-10-05, ADR-343)**: `packages/domain`'s `quantities.ts`: capacity × load call, a split's shares, a split haul-out's piles, one weight on a truck and trailer, the carried tickets, the stump's CY and fill, in exact decimals, each to the digit of the golden mission; and **1.5.5, checks and flags between events and on the certification (2026-10-05, ADR-344)**: `packages/domain`'s `flags.ts` (the catalogue's 66 flags as one closed set, each message held word for word to `spec/FLAGS.md` by a test, the facts a flag keeps and their SHA-256, the same flag kept or cleared on a reprocess) and `checks.ts` (debris type, cert number, order in time, overlapping loads, a split's lettering, the tower's count; no certification, a typed capacity, an expired tag, revoked, replaced; the active window, the times that can't be true, a phone out of service, a typed number, a back-office record; a certification's missing views). ADR-329's six flags that fell to it, and three backup catches for what should be impossible, were built the same day at the user's word (ADR-345: 75 flags). And **1.5.6, checks on place (2026-10-05, ADR-346)**: `packages/domain`'s `geodesic.ts` (the one home of distance, Karney's algorithm through `geographiclib-geodesic` 2.2.0, the package's first dependency), `ShapeArea` (a point in a shape, an edge inside) and `place.ts` (a collection and a unit rate event against the boundary and the zones, with the zone the worker attaches; a disposal and both haul-out ends against their site's circle or shape; a site's dates; where the debris went; a site's permit).
 And **1.5.7, checks on quantity, the pay item's settings, unit rate work and forms (2026-10-05, ADR-347)**: `packages/domain`'s `quantity-checks.ts` (the load-call limits, a split haul-out's piles, a scale receipt's weight, the carried tickets), `unit-rate-checks.ts` (the pay item worked out again, the pay item's settings, the stump checks, a crew's hours) and `roe-checks.ts` (a ticket's ROE, a survey's).
 And **1.5.8, mileage (2026-10-05, ADR-349)**: `packages/domain`'s `mileage.ts` (what is kept of a mileage, the flagged straight line, when a kept one stands) and the worker's first code, `apps/worker/src/mileage/` (what it asks the routing and address servers).
 And **1.5.9, the worker's run (2026-10-05, ADR-352: Milestone 1.5 is done)**: `apps/worker/src/reconciliation/`: every ticket of a project drawn again from its field events and setup, one ticket in one piece of work as the system actor, one run per project at a time by a database lock, an errored ticket flagged and skipped, unchanged input changing nothing, each run and decision recorded; the story `p1-reconciled`, P1's Monday and Tuesday reconciled without prices.
 And **1.6.1, the acceptance scenarios for pricing, the ledger and audit (2026-10-05, ADR-353)**: `spec/acceptance/07-pricing-ledger-audit.md`, 114 scenarios, the answer key for Milestones 1.6 and 1.7.
 And **1.6.2, criteria (2026-10-05, ADR-354)**: `packages/domain`'s `ticket-rules.ts`: which of a project's rules may run on a ticket and which pass. And **1.6.3, actions to lines (2026-10-05, ADR-355)**: `packages/domain`'s `ticket-pricing.ts`: every passing rule's adds in # order, then removes, then voids; each line's quantity by its pay item's unit, its rate for the rule's contract's prime and its amount to the cent; the seven pricing flags; nothing is written as a transaction yet.
  **Corrected by the user on
  2026-10-02 (ADR-301):** a pay item's code is unique on its project (ADR-147 had read their answer
  backwards), a pay item is its code and its description (no separate name, no "line number"), and
  an exact duplicate of a rule is refused before it is saved; the provisional `pay_item` table and
  its test follow (the twentieth migration). **The first product tables
  exist** (the lists, the client, the declaration event, the project, contractors on a project,
  contracts, forms, pay items, sites, the project map, rules, permissions and viewers,
  certifications, numbering, the field event in full, its item lines and carried tickets, scale
  receipts and photographs, ROEs and their scope, surveys, incidents and drop-off logs, quarantined records, the completed load and haul-out with their collection rows, flags, the worker's runs and decisions; 76
  models, 70 migrations);
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
Milestone 1.1 is done)**, **1.2.1 (the acceptance scenarios for certifications, ADR-317: 60)**,
**1.2.2 (the capacity math, ADR-320: `Capacity` in `packages/domain`)**, **1.2.3 (the
certification's records, ADR-321: Milestone 1.2 is done)**, **1.3.1 (the acceptance scenarios for
tickets and numbers, ADR-322: 98)**, **1.3.2 (numbering, ADR-323)**, **1.3.3 (what every field event records, ADR-324)**, **1.3.4 (what each kind records, ADR-325)**, **1.3.5 (scale receipts and photographs, ADR-326)**, **1.3.6 (ROEs and forms, ADR-327)**, **1.3.7 (the harness's phones capture every kind, ADR-332: Milestone 1.3 is done)**, **1.4.1 (the acceptance scenarios for sync, ADR-333: 56)**, **1.4.2 (intake, ADR-338: Milestone 1.4 is done)**, **1.5.1 (the acceptance scenarios for reconciliation, ADR-339: 162)**, **1.5.2 (the derived records, ADR-340)**, **1.5.3 (grouping and status, ADR-341)**, **1.5.4 (quantities, ADR-343)**, **1.5.5 (checks and flags between events and on the certification, ADR-344)**, **1.5.6 (checks on place, ADR-346)**, **1.5.7 (checks on quantity, the pay item's settings, unit rate work and forms, ADR-347)**, **1.5.8 (mileage, ADR-349)**, **1.5.8a (the example world on the pinned map extract, ADR-351)**, **1.5.9 (the worker's run, ADR-352: Milestone 1.5 is done)**, **1.6.1 (the acceptance scenarios for pricing, the ledger and audit, ADR-353: 114)**, **1.6.2 (criteria, ADR-354)**, **1.6.3 (actions to lines, ADR-355)**; and the user's correction of
2026-10-02 (ADR-301: a pay item's code is unique, it has a description and no name, a duplicate
rule is refused).

**C67 (a) and (b) are done** (the user, 2026-10-04, ADR-328…331): certification copying is
taken out (ADR-330) and **a scale receipt's number is no longer unique** (ADR-331: the key
dropped by the fifty-seventh migration; two receipts of one number on a project are both kept;
AC-04-72 rewritten). **C67 (d) and (e) come before 1.4.2.**
**A column taken off a table viewers see** goes in three migrations (ADR-330): a guard stub that
drops the `viewer_<table>` view, made while the schema is unchanged; the generated drop; a guard
stub that runs `guard_viewer` again.
**Task 1.4.1 is done (ADR-333):** `spec/acceptance/05-sync.md`, 56 scenarios (AC-05-01…56), 39 of
them task 1.4.2's; its "Left to the task that builds it" table has sixteen points, and the
paragraph under it lists what C31, C63…C68 carry into 1.4.2.
**C67 (c) is done (ADR-334):** an incident may name the contractor involved (`contractorId`, one
on its own project), a cert number (`certNumber`, `certificationId`) and an ROE number
(`roeNumber`, `roeId`), each optional; the project's incident form's `incidentOffers` says which a
phone shows, and nothing is refused on a record for naming what isn't offered. **An incident form
is written with its `incidentOffers`** (an empty list for none; no other form has one): the
example world's P1 offers `CONTRACTOR` and `CERT_NUMBER`, and `FormSetup.form` takes
`incidentOffers` (a new one starts from the domain's `IncidentOffers.startingFor(programType)`).
**A configuration table that gains a column needs no `guard_table` rerun** (tried: nothing
changes); an evidence table does, and a viewed table reruns `guard_viewer`. **The user approved
acceptance files 01…05 (ADR-335);** AC-01-83 and AC-04-99…101 were added after and wait for them.
**C67 (d) is done (ADR-336):** every read-only viewer's record says whether they see private
citizens by name (`User.seesPrivateCitizens`; no database default, a new viewer starts at yes:
`packages/domain`'s `ViewerSettings.starting()`). An ROE's `owner_name` and a drop-off log's
`resident_name` and `origin_address` are in no `viewer_<table>` view and granted to no viewer;
`viewer_roe_citizen` and `viewer_drop_off_log_citizen` (id, project, those columns; the owner's
rights) show them to a client user or an auditor the firm lets see them. **A column that names a
private citizen** is told to `guard_viewer` as `citizen => ARRAY[…]` (every rerun of that table's
line repeats it) and to `test/support/viewers.ts` as the sight's `citizen`; if the view showed
the column before, `DROP VIEW` it first in the same stub. **A test's viewer states
`sees_private_citizens`** (`viewerLike` says `true`). **A migration that writes a row** states
its actor and writes in one `DO` block: Prisma runs a migration's statements one by one, so a
`set_config(…, true)` in its own statement is gone by the next. **A stub written once can't be
written again** (the hook): if it was never applied to `adms`, remove it and make a fresh one.
**C67 (e) is done (ADR-337):** a photograph's record holds the back office's two marks,
`archivedAt` (removed from the record: a mark with its time, cleared to put it back; the row, the
file and its fingerprints stay) and `label` (free text, never blank: `photo_label_check`); both
are empty as a phone sends a photograph, corrected by the API and audited, and shown by
`viewer_photo`. Intake writes neither from a phone; the service call is 1.8.3's; whether a
removed photograph counts as a required one is 1.5.5's and 1.5.7's. **C67 (a)…(e) are all
built; (f) came with 1.4.2 (ADR-338); (g) is 1.5.5's and 1.5.7's.**
**Task 1.4.2, intake, is done (ADR-338): Milestone 1.4 is done.** `Intake` (`apps/api/src/sync/`)
is what a story's phones sync to (`story.intake`): `receive(record)` answers `SAVED` (with
notes), `ALREADY_SAVED` or `QUARANTINED`; `topUp(phone, reports)` fills a phone's number blocks.
A phone keeps what it was told (`phone.answers`, `phone.notSaved`), sends its records first and
its photographs after, and has `photograph`, `survey` and a tandem's `sameScaleReceiptAs`. **A
record a phone never makes** (a gap, a broken fix, answers to the firm's own fields) is told by
copying a phone's record under a new id and handing it to `story.intake.receive` (the story
`sync` is the model). **A record the database's own constraints refuse makes intake throw**: the
record stays on the phone (Phase 2's contract answers it). **A quarantined record** is written
with what holds its number (`holding_event_id`, or `holding_roe_id` with reason
`DUPLICATE_ROE_NUMBER`), and what the phone sent can't be updated: a test that needs other
values writes another (`packages/db/test/quarantined-records.test.ts`). **A field event's new
column** `unreadable_gps` joined `captured`, the catalog's checks and AC-04-25's list; a
photograph's `quarantined_record_id` joined `correctable.photo`, `photo_owner_check` and
AC-04-76's list. What is left: BACKLOG C69.
**Task 1.5.1 is done (ADR-339):** `spec/acceptance/06-reconciliation.md`, 162 scenarios
(AC-06-01…162), none passing yet; 152 are Milestone 1.5's, each row naming its task. **The flag
catalogue is 66 flags** (not the 67 its last line says). Section O's eight scenarios (what ADR-329
keeps and flags) say only "flagged": **their codes and words are put to the user by 1.5.5 and
1.5.7** (C67 (g)), each a new `FlagCode` with its ADR. Its "Left to the task that builds it" table
has eighteen points (BACKLOG C70). **KD-71 (1) is answered by the user (ADR-342): both tickets of an overlap are flagged, and the one the truck dumped under still bills in review; `adms-exceptions` Scenario B is corrected. Whether voiding the phantom clears the other's flag is 1.5.5's. What KD-71 said before:** the catalogue raises
`OVERLAPPING_LOADS` on both tickets, `adms-exceptions` Scenario B pictures the real one clean; the
scenarios follow the catalogue (AC-06-30).
**Task 1.5.2, the derived records, is done (ADR-340).** `derived.prisma` holds `CompletedLoad`
(one per disposal event: `quantitySource`, capacity, load call, volume, weight, `weightIsShare`,
carried count, `dissolvedAt`), `CompletedLoadCollection`, `CompletedHaulOut`,
`CompletedHaulOutCollection` (`pileLoadCall`), `Flag` (`FlagCode`: the catalogue's 66 codes,
held to `spec/FLAGS.md` by a test; `FlagBilling`; facts and their SHA-256), `ReconciliationRun`
and `ReconciliationDecision` (one for a ticket in a run); a field event has the worker's
`zoneId`, `mapVersionId` and `workedOutPayItemId`. **A collection row has its own id and
repeats its completed record's `project_id`.** **Live once is an exclusion** (`EXCLUDE USING
btree (… WITH =) WHERE (dissolved_at IS NULL)`, six of them): Prisma doesn't see one, so the
next migration doesn't drop it; never write a partial unique index in a guard. A refusal by one
is `refusedBy.exclusion`. **A test writes derived records as the worker** (`db.as('adms_worker')`,
`db.actor(world.worker, 'SYSTEM')`) with the helpers in `packages/db/test/derived-records.test.ts`
(`completedLoadLike`, `collectionRowLike`, `flagLike`, `runLike`, `ticket101003`, `ticket201004`,
`syncedOnP2`); the example world's three loads each have their collection row
(`world.loads.l101001.completedLoadCollection`), and its P2 `102001` is still an ordinary load
(the mission's split is told under `102002` there, and as itself by 1.5.9's story). **A new
derived table:** `SELECT guard_table('<table>', 'DERIVED', '<BILLING|OPERATIONS>');`, its checks,
then `guard_viewer('<table>', 'PROJECT')` and a row in `test/support/viewers.ts`, or its name in
that file's `unseenTables` (a run and its decisions are there); `domains` in `catalog.test.ts`,
`tableGrants` in `grants.test.ts`. **A field event that gains a worker's column** names it in
`guard_table('field_event', 'EVIDENCE', 'RECORDS', ARRAY['status', 'reconciled_at', 'zone_id',
'map_version_id', 'worked_out_pay_item_id'])` and joins `columnGrants` and `viewerColumns.field_event`
in `grants.test.ts` and AC-04-25's list. **Unchanged, for 1.7.1 and 1.8.2:** `Transaction` and
`InvoiceLock` still hang on `completed_load_id` alone. **Left open on purpose** (BACKLOG C70):
no queue record exists (1.5.9 decides how the worker finds its tickets); the worker can't write
`certification_id` (1.5.5); the database doesn't hold the kind of field event a completed record
names (1.5.3's grouping does); nothing ties the quantity columns to `quantity_source` (1.5.4,
1.5.5).
**Task 1.5.3, grouping and status, is done (ADR-341).** `packages/domain/src/tickets.ts`:
`new Tickets(fieldEvents)` takes any records that hold `id`, `projectId`, `workflow`, `kind`,
`ticketNumber`, `splitSuffix`, `startedAt`, `endedAt` (as `Date`s) and gives `tickets` (each a
`Ticket`, generic over the caller's record, so the worker's rows keep their other columns),
`pending` and `notTicketNumbers` (a number that isn't digits: in no ticket). A `Ticket` has
`events` in field order, `collections`, `disposal`, `unitRate`, `missing`, `isWhole`, `isSplit`,
`splitShape`, `timeOf(suffix)` and `status(raised)`, where `raised` is the flags raised now, each
`{ accepted }` (a cleared flag isn't passed). **A `Ticket` throws** on a second field event of
one kind and suffix: 1.5.9's run catches it as an errored ticket. **Nothing in it takes a clock.**
The tests' helpers (`collection`, `disposal`, `pile`, `at('Mon', '08:40')`) are in
`packages/domain/test/tickets.test.ts`. What it leaves: BACKLOG C70 ("Left by 1.5.3").
**Task 1.5.4, quantities, is done (ADR-343).** `packages/domain/src/quantities.ts`, every figure
text at its column's scale ("52.00" CY, "7.3300" tons, "0.40000000" a share's fraction, "4.8" a
stump's CY or fill), worked in exact decimals. `new LoadQuantities({ capacityCy, loadCall,
weightTons, weightIsShare, collections: [{ splitSuffix, estimateCy }], carried }).work()` gives
`quantitySource`, `volumeCy`, `weightTons`, `carriedCount`, `carriedStumpCy`, a row for each
collection and `sharesNotWorkedOut`; `new HaulOutQuantities({ capacityCy, piles: [{ splitSuffix,
loadCall }], weightTons, weightIsShare }).work()` gives the last call, each pile's `pileLoadCall`,
share, CY and tons, `pileCallNotHigher` (the facts `PILE_CALL_NOT_HIGHER` words) and
`pileCallMissing`. **The weight handed to either is the container's own**: `new
ScaleWeight(receipt).net().usableTons` on one disposal, or its row of `.sharedBy([{ key,
capacityCy }])` where the receipt is on several disposals (the worker finds those, 1.5.9).
`new StumpQuantities(diameter, rootBall).stumpCy()` / `.fillCy(project's fill depth)`;
`new CarriedTickets(found).quantities()`; `quantityFor({ unit, quantityFromCarriedTickets },
figures)` is the one figure a pay item bills (1.6.3 calls it; none means the line bills nothing).
**It raises no flag**: the flags read its results (1.5.5, 1.5.7). The tests' helpers (`load`,
`haulOut`, `piles201004`, the guide's 79 rows) are in `packages/domain/test/quantities.test.ts`.
What it leaves: BACKLOG C70 ("Left by 1.5.4").
**Task 1.5.5, checks and flags between events and on the certification, is done (ADR-344).**
`packages/domain/src/flags.ts`: **every flag is raised through `new Flags(timeZone).raise(code,
subject, told, facts[, fieldEventId])`**, which gives a `FlagRaised` (code, subject, field event,
the catalogue's message, billing, facts, `factsSha256`). *Told* is what the message says (names,
`Date`s, days as `2026-10-12`); *facts* are what is kept and hashed (ids, numbers, days, ISO
instants): keep them apart, so a renamed site changes no flag. `Flags.compared(standing, now)`
says which standing flags are kept, which cleared and which are new (the same code, field event
and hash is the same flag). `ProjectClock` (`project-clock.ts`) answers `day`, `date`, `time` and
`offsetMinutes` in the project's time zone: never format a date another way. `checks.ts`: `new
TicketChecks({ timeZone, activeFrom, activeTo, certifications, deviceClockOffLimitMinutes
}).of(ticket, { otherLoads, carried })` for `FLAGS.md` §3.1, §3.2 and §3.3's time rows; `new
CertificationChecks(timeZone).views(certNumber, photographs)`. **The work time is the field
event's end** (`workTimeOf`). **`packages/scenarios/test/flag-catalogue.test.ts` holds every
message to `spec/FLAGS.md`**: a new flag is a row on the page, a code in `flagCodes` and in
`FlagCode` (a migration), an entry and its told type in `flags.ts`, and an example in that test.
The tests' helpers (`recorded`, `collection`, `disposal`, `certified`, `p1Setup`, `flagsOf`) are
in `packages/domain/test/checks.test.ts`. **The user answered on 2026-10-05 (ADR-345):** the catalogue is **75 flags**; `spec/FLAGS.md`
§3.10, "A record that should not have been possible", holds the six flags of ADR-329 ("Yes to
all") and three backup catches ("make them flag"): `DETAIL_MISSING`, `TYPED_NUMBER_NO_REASON`,
`WRONG_KIND_OF_BADGE`, `GPS_UNREADABLE`, `NOT_A_TICKET_NUMBER` (`TicketChecks.notATicketNumber`,
for each of `Tickets.notTicketNumbers`), `ENDED_BEFORE_STARTED`, `SPLIT_NOT_ALLOWED`,
`OUTSIDE_CONTROL_RANGES`, `ASSIGNMENT_ON_ANOTHER_PROJECT`; all built (the sixty-ninth
migration added the codes). **The user's rule: whatever a record must have is counted from
what is on it now; a photograph the back office removed counts for nothing** (a
certification's views: built; `PHOTOS_MISSING`: 1.5.7; removing one reprocesses its ticket or
certification: 1.8.3). AC-06-158 and 162 (a net that isn't gross less tare; two quantities)
are 1.5.7's to word with the user. What it leaves: BACKLOG C70 ("Left by 1.5.5").
**Task 1.5.6, checks on place, is done (ADR-346).** `packages/domain/src/geodesic.ts`: `new
Distance(from, to).meters()` / `.isWithin(limitMeters)`, the geodesic on WGS84, **the one home of
distance**, through `geographiclib-geodesic` 2.2.0 (the package's first dependency); a `GpsPoint`
is `{ latitude, longitude }` as exact decimal text. `map-shapes.ts`: `new ShapeArea(shape).holds(point)`
(a point on an edge is inside; a hole is outside). `place.ts`: `new PlaceChecks({ timeZone,
siteCircleMeters, map }).of(ticket)` gives `flags` (`OUTSIDE_PROJECT_BOUNDARY`, `NO_ZONE`,
`OUTSIDE_SITE_AREA`, `SITE_NOT_YET_ACTIVE`, `SITE_CLOSED`, `SITE_DOES_NOT_TAKE_LOADS`,
`INELIGIBLE_SITE`, `SITE_NOT_FOR_HAUL_OUTS`, `HAUL_OUT_DUMPED_AT_TDSR`) and `zones` (for each
collection and unit rate event, the zone and map version the worker writes); a field event is
handed with its `endGps` and its `site` (a `CheckedSite`, with its own shape version where it has
one). `new SiteChecks(timeZone).permit(site)` is `PERMIT_OUTSTANDING`. **A field event with no
fix, and a project with no map, raise nothing here.** The tests' helpers (`recorded`, `site`,
`p1Map`, `shapeOf`, `placeOf`, the points 250 m and 150 m north of Marsh Road TDSR) are in
`packages/domain/test/place.test.ts`. What it leaves: BACKLOG C70 ("Left by 1.5.6"); four points
for the user, none blocking (`SUMMARY.md` §4).
**Task 1.5.7, checks on quantity, the pay item's settings, unit rate work and forms, is done (ADR-347).**
`quantity-checks.ts`: `new QuantityChecks({ timeZone, loadCallLowLimit, loadCallHighLimit }).of(ticket,
{ carried })` gives `LOAD_CALL_ZERO`, `LOAD_CALL_LOW`, `LOAD_CALL_HIGH`, `PILE_CALL_NOT_HIGHER`,
`SCALE_WEIGHT_UNUSABLE`, `RECEIPT_TWO_DEBRIS_TYPES`, `SHARED_SCALE_WEIGHT`, `CARRIED_TICKET_NOT_FOUND`
and `CARRIED_TICKET_ON_ANOTHER_LOAD`; a field event is handed with its `loadCall` and its
`scaleReceipt` (a `CheckedReceipt`: its weights and **every disposal that points at it**, each with
its capacity and debris type). `unit-rate-checks.ts`: `new UnitRateChecks({ timeZone, payItems,
stumpCheckRootBallWider, crewItemHoursLimit }).of(ticket, { otherCrewTime })` gives `flags` (§3.6,
all but `FILL_WITHOUT_EXPOSED_ROOT_BALL`) and `workedOut` (the pay item the worker writes as
`workedOutPayItemId`, and the diameter); `crewItemHoursLimit` is the policy value `CREW_DAY_HOURS`.
`roe-checks.ts`: `new RoeChecks({ timeZone, requiresRoe }).of(ticket)` (a field event with its
`roeNumber`, the `roe` found, its `debrisType` or `payableType`) and `.survey(survey, others)`.
**A ticket's ROE flag counts in its status.** The stump checks hang on the key `STUMPS`; crew time
is a kind of work whose `countShape` is `ITEM_HOURS`. The tests' helpers (`recorded`, `called`,
`pile`, `tandem`; `hanger`, `leaner`, `stump`, `crew`, `withChanged`; `roe`, `on`, `survey`) are in
`packages/domain/test/quantity-checks.test.ts`, `unit-rate-checks.test.ts` and `roe-checks.test.ts`.
**The user approved the last two flags' words on 2026-10-05 (ADR-348): the catalogue is 77
flags.** `SCALE_NET_DISAGREES` (a receipt's net isn't its gross less its tare: pounds to the
pound, tons to the hundredth; `ScaleWeight.netAgainstGrossLessTare`) and `TWO_QUANTITIES` (a
load's disposal with a load call and a usable scale weight), both in `spec/FLAGS.md` §3.10, both
raised by `QuantityChecks`, both still bill; the seventieth migration added the codes. C67 (g)
is closed. What 1.5.7 leaves: BACKLOG C70 ("Left by 1.5.7").
**Task 1.5.8, mileage, is done (ADR-349; the user's answers, ADR-350).** `packages/domain/src/mileage.ts`: `new Mileage({ from, to }, mapData)` (the collection's end GPS, the site's own GPS; the extract's date and SHA-256) gives `.byRoad(roadPoint, routeMiles)` and `.straightLine(roadPoint | null)`, each a `MileageMeasured` (`miles` as text at four places, `source`, `ends`, `snapped`, `snappedAddress`, `mapData`); `Mileage.noRoadRoute(flags, subject, collectionEventId, measured)` is the `NO_ROAD_ROUTE` flag, or none. **The asking is the worker's** (`apps/worker/src/mileage/`, its first code): `new MapServers({ routing, addresses, caFile, mapDataSha256, timeoutMs })` has `nearestRoad`, `shortestRouteMiles`, `addressOf` and `mapData`; `new Mileages(servers).between(ends, standing?)` is the step for one collection: `standing` is the row's mileage, handed in only while neither end has been corrected since, and then no server is asked. **The route is asked by distance as a car drives it, never the server's plain `shortest`, so it crosses no private road and no farm track (the user, ADR-350).** **Nothing keeps a mileage's two ends** (ADR-350): they are the collection's end GPS and the site's GPS on the records. **A map server that doesn't answer throws; only "no road" and "no path" are the straight line.** The tests (`packages/domain/test/mileage.test.ts`; `apps/worker/test/mileages.test.ts`, which needs `pnpm local:up`) use **the example world's stand-in points on the pinned extract** (`spec/CONVENTIONS.md` §6: Marsh Road TDSR 39.09000000, −75.62000000; 14 Heron St 39.13850000, −75.55370000, 6.2050 road miles away); What it leaves: BACKLOG C70 ("Left by 1.5.8").
**Task 1.5.8a, the example world on the pinned map extract, is done (ADR-351).** Every fixture, test, story and spec row stands on the Delaware stand-ins of `spec/CONVENTIONS.md` §6; the made-up points round 27.98° N, 82.40° W are retired (its §7) and in no file. P1's boundary is 75.80° W to 75.40° W and 38.90° N to 39.30° N, Zone 1 to 75.67° W, Zone 2 to 75.53° W. **A story's points:** a disposal at Marsh Road TDSR ends at the tower, 39.09030000, −75.62020000 (38 m from the site's GPS, inside the 200 m circle); 14 Heron St 39.13850000, −75.55370000 (Zone 2, 6.2050 mi); **ticket 101002's collection ends at 39.15000000, −75.52000000** (Zone 3, 11.4419 road miles from Bayline County Landfill: the mission's 11.4); 22 Elm St, 40 Birch Ln, 412 and 416 Cedar Ct and Bayline Transfer Station are in §6 with their road miles. A new point is picked against the local stack with `apps/worker`'s `Mileages` and added to §6.
**Task 1.5.9, the worker's run, is done (ADR-352): Milestone 1.5 is done.** `apps/worker/src/reconciliation/`: `new Reconciliation(db, clock, { crewItemHoursLimit, longestRunMs }, mileages).run({ projectId, trigger, requestedById? })` answers `{ ran: true, runId, ticketsDone, ticketsFailed, tickets, pending }`, or `{ ran: false, reason: 'RUN_UNDER_WAY' }` while another run holds the project's advisory lock. `ProjectRead` reads the whole project once (every field event that isn't void, the setup, what was concluded before); `TicketWork.of(ticket)` concludes (flags, status, zones, the worked-out pay item, the completed record with a row and a mileage for each collection); `TicketWrite` writes it inside the ticket's one `db.$write` as the system actor, **only what differs**; `MileageStanding` reads the audit log to say whether a kept mileage stands. **A story runs the worker** as `p1-reconciled` does (`packages/scenarios/src/stories/`): `new Mileages(new MapServers(localMapServers()))`, or a step of its own that counts, holds or fails the asking. **A story that needs P1's field days on the server** runs `p1FieldDays.run` on a `StoryClock` of its own with the intake held, then sends each record at its phone's sync time (the story clock can't go back). **`p1-field-days` now records a fix** on 101002's collection and the haul-outs' collections, and enrols its phones on the story's clock. A story's worker client has four connections (a run holds one for its lock). **The rules join the ticket's piece of work in 1.6.3**: `TicketWork` has the ticket, its quantities and its mileages; `quantityFor` is the domain's. What it leaves: BACKLOG C71.
**Task 1.6.1, the acceptance scenarios for pricing, the ledger and audit, is done (ADR-353).** `spec/acceptance/07-pricing-ledger-audit.md`, 114 scenarios (AC-07-01…114), none passing yet: sections A and B are task 1.6.2's (35: the rules that may run, each criterion), C…F and two of A task 1.6.3's (48: actions, quantities, rates, the pricing flags), G task 1.7.1's, H…J task 1.7.2's and the golden mission's. **Ten restate guards Phase 0 built** and name today's test, which takes its AC-07 ID with 1.7.1. Its "Left to the task that builds it" table has eighteen points (BACKLOG C72); **four could change money (💲): the task that meets one settles it from a record or puts it to the user first.** The example world gained Summit's truck `88120` on load `101044`, Summit's $7.80 on `VEG-HAUL-CY-15` and crew-day steps (`spec/CONVENTIONS.md` §6).
**Task 1.6.2, criteria, is done (ADR-354).** `packages/domain/src/ticket-rules.ts`: `new TicketReadings({ timeZone, certifications: [{ certNumber, primeId }], zones: [{ id, name }] }).of(ticket, { zones, workedOut, shares })` gives `{ primeId, readings }` (one `RuleReading` for a load, each property, each pile, or a unit rate ticket; none while the ticket isn't whole; `shares` are the completed record's collection rows: `collectionEventId`, `volumeCy`, `weightTons`, `mileage`); `new TicketRules(rules, contracts).mayRunOn(form, primeId)` / `.passing(form, primeId, reading)` take the project's `RuleEntry`s (as `apps/api`'s `rule-book.ts` reads them: a zone pick's value is its name) and `[{ id, primeId }]`; `new CriterionCheck(line).holds(reading)`. **A line that compares with something the ticket doesn't have never passes, "not" wordings included; only IS EMPTY does (the user, 2026-10-05).** `Mileage.inTenths(miles)` is the one rounding; `CheckedSite` has `siteTypeId`. A field event read for the rules is a `RuleFieldEvent` (adds `fieldTag` and `address` to what the worker reads today). The tests' helpers (`load`, `haulOut`, `unitRate`, `only`, `piece`, `line`, `picked`, `number`, `date`, `address`, `item`, `rule`) are in `packages/domain/test/ticket-rules.test.ts`.
**Task 1.6.3, actions to lines, is done (ADR-355).** `packages/domain/src/ticket-pricing.ts`: `new TicketPricing({ timeZone, rules, contracts, primes, payItems, stumpCheckFillNeedsExposure }).of({ ticketNumber, form, primeId, operatingSubId, pieces, dumpedAt, raised })` answers `{ voidedBy, lines, flags }`: `pieces` are `TicketReadings`' readings, each with its `fieldEventId`, `carriedCount` and `carriedStumpCy`, `countShape` and a stump's `{ fillCy, rootBallHalfExposed }`; `raised` the checks' flags; a `PricedPayItem` holds its unit, *Count is always 1*, *quantity from the tickets it carries*, crew conversion, day length, steps and a rate for each prime; `dumpedAt` the disposal site with *Charges a tipping fee* and its fee pay items. A line's `quantity` and `rate` are text at four decimals, its `amount` at two. **The user, 2026-10-05: an amount to the cent a half up; a crew day by exact division to four decimals; hours in no step bill nothing on that line, flagged.** A ticket under a check's `NOT_BILLED` flag gets no lines (a rule's void still runs); a haul-out dumped at a TDSR skips every rule; a rule naming a pay item pricing wasn't handed throws. `QUANTITY_MISSING_FOR_PAY_ITEM` is told `{ payItem, pricedPer, lacking }`, `lacking` a whole phrase. **A message names a prime as `primes` hands it** (the tests hand "Coastline" and "Summit"). The tests' helpers (`payItem`, `rule`, `paysItself`, `add`, `remove`, `piece`, `load`, `haulOut`, `unitRate`, `whiteGoods`, `crewTime`, `stump`, `told`) are in `packages/domain/test/ticket-pricing.test.ts`. **The worker reads and writes none of it yet: BACKLOG C73.** **`pnpm security` fails today on one new advisory** (GHSA-68fv-2mgg-jv7q, `source-map-js@1.2.1`, under the test runner): the user's to pin or accept (C73); until then expect `6 passed, 1 failed`.
👉 **1.6.4, the setup check, and what each site's phones ask for** (BACKLOG Milestone 1.6; AC-01-69…77 and the two points `spec/acceptance/01-setup.md` leaves to it; REQ-124f, 125c; read `adms-validation` §5.3a, `spec/parts/01-setup.md`, ADR-229, 227, 223, and BACKLOG C58, C72 (point 12) and C73's "Task 1.6.4": an archived pay item, contract or form under a rule; crew-day steps that leave gaps.)

**The harness's phones** (ADR-332): a story signs a phone in with `story.phone({ …, lists: await
phoneLists(api, { assignmentId, deviceId }) })` after its blocks are cut (`NumberAllocator.topUp`),
and the next day with `phone.signIn(…)` (the phone keeps its own count of numbers). `begin(workflow,
kind, badge?)` is New (a unit rate event with no badge is the working crew's); `complete(id, { number:
made | scanned('101001') | typed('101060', 'Barcode damaged') | chained(idBefore), … })` takes
every pick **by name** and answers `{ saved, event }` or a `NUMBER_MISMATCH` (`reentered`).
`incident`, `dropOffLog`, `roe`, `survey`, `photograph`, `takeCertNumber`, `cancel`,
`lastUsedNumber(series)`. It syncs to the API's intake (ADR-338; the stand-in is gone).
`passOver(series, upTo)` is the harness's own, for numbers a story doesn't tell (201002,
201003). The worker works the pay item out again with `SizeBands.payItemFor` (1.5.7). The story
`p1-field-days` (`packages/scenarios/src/stories/`) is the model for a day of field events; it
writes no certification, rule or load pay item.

**ROEs and forms** (ADR-327): a test writes an ROE with `roeLike(world, …)` (Ana's `R-0007` on
P2: 412 Cedar Ct, signed 9 October; state `project_id` and `assignment_id` for one on P1) and a
survey, an incident or a drop-off log from `formLike(world, …)` (what every form records, from
Ana's phone on P1) or `backOfficeFormLike(world, …)` (created by Dana, "Device failed"), adding
its own columns (`work_type_id`; `incident_type_id`; `site_id`), all through `phoneInsertOf`
(`packages/db/test/support/example-world.ts`). **No column of where a form came from has a
default**, and `answers` is always stated (`'{}'` with no definition). **Answers come with their
definition**: `form_definition_id`, `form_id` and `form_document_type` together, the document
type the record's own (`ROE`, `SURVEY`, `INCIDENT`, `DROP_OFF_LOG`). The example world holds no
ROE and no form record, P2 has no form, and P1's incident form has no definition: a test writes
its own (`roes-and-forms.test.ts` has `formOn`, `definition`, `answered` and `p2LoadForm`). A
scope line repeats its ROE's `project_id`, and a debris type on it comes with `form_id` and
`form_document_type: 'LOAD'`. **A new form table** takes the same shared columns and the same
five checks (`<table>_source_check`, `_monitor_check`, `_created_by_check`, `_gps_check`,
`_answers_check`), `guard_table('<table>', 'EVIDENCE', 'RECORDS')` and `guard_viewer('<table>',
'PROJECT')`, and joins `formShared`'s users in `grants.test.ts`. **The answers' schema** is
`formAnswersSchema(fields)` in `packages/contracts`, made from the version answered; the
database doesn't run it: intake does (1.4.2). The scenario tests are
`packages/db/test/roes-and-forms.test.ts`.

**Scale receipts and photographs** (ADR-326): a test writes a receipt with `scaleReceiptLike(world,
…)` (the tandem's `BCL-88241` at Bayline County Landfill, entered by Ana) and a photograph's record
with `photoLike(world, owner, …)` (its owner one of `field_event_id`, `certification_id`,
`scale_receipt_id`; each call names a new file, since `object_key` is unique), both through
`phoneInsertOf(table, row)`, which asks the database for the id a phone would make;
`fingerprintOf(text)` gives a SHA-256 as the check wants it (`packages/db/test/support/example-world.ts`).
The example world holds no receipt and no photograph: a test writes its own. **A new owner of a
photograph** adds its column with a two-column foreign key to `(project_id, id)` of its table,
then in its guard migration drops `photo_owner_check` and writes it again with the new column
(eight owners since ADR-338: `quarantinedRecordId`),
and reruns `guard_table('photo', 'EVIDENCE', 'RECORDS')` and `guard_viewer('photo', 'PROJECT',
hidden => ARRAY['object_key', 'depth_object_key'])`; `correctable.photo` in `grants.test.ts`, the
check in `catalog.test.ts` and AC-04-76's column list follow. **A photograph's fingerprints and
keys can't be updated** (`photo_refuse_file_edit`): a test that needs other values writes
another photograph. A new latitude or longitude column joins the exact list in `sites.test.ts`.
The scenario tests are `packages/db/test/scale-receipts-and-photos.test.ts`.

**What each kind records** (ADR-325): a test writes a load's or a haul-out's debris type with
`debrisTypePicked(world, entryId[, form])`, which gives the entry with its form and that form's
document type (all three or none; P1's load form unless told); the example world's 101001
picked Vegetative and 101002 C&D at both ends, P2 has no form. **A split collection is written
with its estimate** (`split_suffix: 'A', estimate_cy: 12`), and a suffix only on a collection or
a haul-out collection. A measurement comes with `measured_as`. An item line and a carried
ticket repeat their field event's kind (`field_event_kind: 'UNIT_RATE'` / `'COLLECTION'`).
Mulch isn't in the seeded library and P1's field tags start empty: a test adds them as Dana
would (`packages/db/test/field-event-kinds.test.ts` has `mulch()` and `fieldTag()`). **Which
kind records which detail is `packages/domain`'s `fieldEventDetails`**: a new kind-specific
column joins it, `packages/contracts`' `fieldEventDetailsSchema`, the test "every detail on
every kind" and the two exact lists below. The scenario tests are
`packages/db/test/field-event-kinds.test.ts`, one per ID.

**Field events** (ADR-324): a test writes one with `fieldEventLike(world, …)` (Ana's collection
from her phone on P1, badge `730415` found) or `backOfficeEventLike(world, …)` (created by Dana,
"Device failed"), through `eventInsertOf(row)`, which asks the database for the id a phone would
make (`packages/db/test/support/example-world.ts`); **no column of where it came from has a
default**, so every insert states `source`, `temporary_session`, `number_typed`, `cert_number` and
`cert_keyed_by_hand`. `world.reasons` has "Barcode damaged" and "Device failed". The harness's
phone scans the badge at `begin(workflow, kind, certNumber)` and names its assignment's site
(`PhoneSetup.siteId`); it sends the cert number only: looking the certification up is intake's
(1.4.2). **A field event that gains a column** reruns both `guard_table('field_event', 'EVIDENCE',
'RECORDS', ARRAY['status', 'reconciled_at'])` and `guard_viewer('field_event', 'PROJECT')` in its
guard migration (`guard_viewer` replaces the view in place when columns are only added at the
end), and the exact lists follow: `captured` in `grants.test.ts`, the checks in `catalog.test.ts`,
the column list of AC-04-25 in `field-events.test.ts`. The scenario tests are
`packages/db/test/field-events.test.ts`, one per ID.

**Numbering** (ADR-323): every project of the example world and of every story has its series
(`project_number_series`: P1's loads from 101001, haul-outs 201001, unit rate 301001, cert numbers
730415, ROEs 1; `packages/scenarios/src/stories/p1.ts` has `p1NumbersFrom` and `startSeries`). **A
number block needs its project's series** (a foreign key), and two blocks of one series can't hold
the same number (`number_blocks_never_overlap`): a test or story that writes a block picks a free
run, or asks `apps/api`'s `NumberAllocator.topUp` (the story `numbering` is the model). A new
project made through `ProjectSetup.project` gets its series; pass `numbersFrom` to say where they
start and to seed the cert numbers. The domain's `PhoneNumbers(blocks).next()` is the next number
a phone gives out (1.3.7); `NumberSeriesRules('ROE').written(7)` is `R-0007` (1.3.6). A new policy
value is added in four places: `policy.ts`, `policy.env`, and the `shipped` lists of
`packages/domain/test/project-settings.test.ts` and `numbers.test.ts`
(`packages/scenarios/test/policy.test.ts` holds the file to the names).

**Certifications** (ADR-321): the example world has Sam Grant (`world.certifier`), Lee Morgan
(`world.helper`), the phone `P1-HO-TDSR` (`world.certifyingDevice`), their assignments
(`world.certifyingAssignments`), Rivera Trucking (`world.rivera`) under Coastline on P1 and P2,
P1's five certifications with their boxes and P2's own `730416` (`world.certifications`). A test
writes another with `certificationLike(world, …)`, `crewLike` and `boxLike(id, position, …)`
(`packages/db/test/support/example-world.ts`); **a container is written with its primary box**:
the check is deferred to the end of the piece of work, and a test asks it with `SET CONSTRAINTS
ALL IMMEDIATE` (the world does, once built, so a `TRUNCATE` in a test isn't met by pending trigger
events). A box repeats its certification's `kind` (`CONTAINER`). **A later table that names a sub**
points at `project_contractor (project_id, contractor_id, prime_id)`. The service is
`Certifications` (`apps/api/src/certification/certifications.ts`): `certify` is written as the
certifying monitor, source `DEVICE`, through `SetupService.writeAs`; the story `certification`
is the model for a story that needs certified trucks. `certify`'s cert number is the phone's (its
block's next, or the sheet's); `copy` takes the other project's next from the allocator (ADR-323).

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
is 75 files, 1,631 tests; seventy migrations; `pnpm scenarios` runs nine stories, 16, 18, 52, 25, 15, 35, 47, 4 and 39 checks),
with **`pnpm security`** (7 passed, 0 failed, ADR-291; **6 passed, 1 failed since 2026-10-05**, one new advisory on the test runner's `source-map-js`, BACKLOG C73). The database tests, the map servers' tests and
the stories need `pnpm local:up` first; stop it at close-out (ADR-277). A schema change goes through
Prisma (`prisma migrate dev --create-only`), a guard into its own empty stub (ADR-113); **try a guard
migration on a throw-away copy before `pnpm installer` applies it**, since an applied one is never
edited. **Loosened guards are tried two at a time on this machine**, each on its own copy
(`adms_mutation_0`, `_1`; `adms-verify` §1.3; four at once filled Docker's disk on 2026-10-03): run
nothing else against the database, and no `pnpm lint` or `pnpm test`, while they go.

**Words and examples everywhere:** `spec/CONVENTIONS.md` (ADR-234, 235). Field names:
`spec/DATA-MODEL.md`. Flag wording: `spec/FLAGS.md`.
