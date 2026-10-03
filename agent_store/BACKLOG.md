# Open ADMS — Backlog

> Milestone detail for the active phase. Read when picking up new work; the single active task
> is in `agent_store/NEXT.md`. Tick boxes as you complete them.

## Active — Phase 1: Data core and engine, rebuilt *(opened by the user 2026-10-01, ADR-299; this plan is ADR-300)*

**What Phase 1 is.** The whole product without a screen or an endpoint: every setup record, the
certification and its capacity, field events and their numbers, sync intake with quarantine,
reconciliation, the rule engine, the ledger and audit, review, QC and the invoice lock. **Done when
the golden mission runs from a terminal and comes out with the statuses, review queue, ledger and
audit trail the user signed off** (`spec/golden/MISSION.md`: P1 $5,548.25 on 19 lines, P2 $324.00),
every Phase 1 scenario in `spec/acceptance/` passes at the engine, and all 98 Phase 1 REQs are
ticked from runs that were seen. Exit criteria: `NEXT.md`.

**The order** is `ROADMAP.md` §4's: setup records → certifications and capacity → tickets and
numbers → sync intake with quarantine → reconciliation → the rule engine → the ledger and audit →
review, QC, invoice lock and batches → the golden mission. Each milestone builds one part of
`spec/INDEX.md`'s book.

### Brief for every Phase 1 task (ADR-300)

- **One task per response.** Each ends with real observed output (`adms-verify`), the close-out
  (`adms-close-out`) and the user's git block with named paths. Don't tick a box on "should work".
- **Read first:** the task's part page and its acceptance file (`spec/acceptance/`); the records in
  **`spec/DATA-MODEL.md`** (every model, field and enum name comes from it, never from memory or
  prose); the owning skill; the flag wording in `spec/FLAGS.md`; the task's carried items in the
  register below. Examples, fixtures and seeds: `spec/CONVENTIONS.md` §6 and the golden mission.
- **Inside a milestone:** the part's acceptance scenarios first, then the schema, then the rules,
  then the story. **No milestone's code starts before its part's scenarios are written.**
- **A schema task:** the model in the right `.prisma` file (by kind of record) → Prisma writes the
  migration (`prisma migrate dev --create-only --name <what>` in `packages/db`; never hand-written
  SQL for a table, column, index or relation) → a guard migration in its own empty `--create-only`
  stub: `SELECT guard_table('<table>', '<CONFIGURATION|MARK|EVIDENCE|DERIVED>', '<domain>'[, …]);`
  and any check the model needs (ADR-113, 271) → applied by `pnpm installer` → the exact lists in
  `grants.test.ts` and `catalog.test.ts` extended → **a row-level-security decision** for each table
  a viewer sees (C18, C22; since ADR-315 one line, `SELECT guard_viewer(…)`, and a row in
  `test/support/viewers.ts`, C59) → the example world (`packages/db/test/support/example-world.ts`)
  extended → tests named by scenario ID → each new guard's removal shown caught on a throw-away
  copy (as ADR-272). `prisma migrate dev` wants a terminal when a migration carries a warning
  (`adms-verify`, "The schema").
- **A provisional model that changes shape** takes its tests and both stories with it in the same
  task. A test is rewritten for the new shape, never loosened; a threshold or a unique key is never
  relaxed to pass.
- **A rule task** (`packages/domain`): plain classes, no Postgres, no dependency; unit tests named
  by scenario ID, their numbers from the golden mission or a skill's worked example; thresholds from
  settings, never literals (invariant 16).
- **Where the code lives** (ARCHITECTURE §2, §18; settled for each kind of code by the ADR of the
  first task that writes it): every rule in `packages/domain`; the reconciliation run in
  `apps/worker`, as `adms_worker`; what a phone or a person writes (intake, setup, corrections,
  marks) as plain service classes in `apps/api`, as `adms_api`, with no HTTP until Phase 2 wraps
  them; all through `db.$write(actor, …)`. The scenario harness drives both.
- **Every dependency and every Postgres extension gets an ADR first** (exact version, licence,
  maintenance; `pnpm licences` and `pnpm security` after).
- **Not Phase 1's:** endpoints, sign-in columns and the sync contract (Phase 2); the phone (Phase
  3); screens, exports and the time clock's tables (Phases 3–4). Don't build ahead.
- **A REQ is ticked, and a scenario marked passing, only from a run you saw.**
- Docker's disk here is 8 GB (`NEXT.md`, Tools and housekeeping); stop the stack at close-out.

### Milestone 1.0 — Open the phase
- [x] **1.0.1** ✅ **done 2026-10-01 (ADR-299, 300):** the phase opened at the user's word; this
  plan; `spec/acceptance/README.md` (how a scenario is written and proven).

### Milestone 1.1 — Setup records (Part 1; DATA-MODEL §2, §3)

> **2026-10-02, the user's correction (ADR-301), done outside the task order because a Phase 0 test
> stated the old reading:** a pay item's code is unique on its project and it has a description, no
> name (one Prisma migration, the test now AC-01-41, the story `dispatch-monday`); every page and
> skill that said codes may repeat, or "the contract's words and line number", corrected; an exact
> duplicate of a rule is to be refused before save (built in 1.1.8).

Carried: C36, C42, C52, and C18's first part; C54 (1.1.10) and C53's first part (1.1.11), filed
by ADR-303 (named here by ADR-307). Closes the behaviour of KD-14, 16, 17, 18, 29, 39, 47.

- [x] **1.1.1** ✅ **done 2026-10-01 (ADR-300):** `spec/acceptance/01-setup.md`, 80 scenarios (81 since ADR-301, 82 since ADR-306) from
  Part 1, each naming its source, where Phase 1 proves it and the task that does; six points nothing
  settles are listed for the task that decides each.
- [x] **1.1.2** ✅ **done 2026-10-02 (ADR-302):** eighteen list models and three enums, two
  migrations (`the_firms_lists`, `guard_the_firms_lists`: 22 in all), `builtInKeys` in
  `packages/domain`, `guard_list` (one line per list), the seed's 94 starting values; AC-01-31, 32,
  34…38 pass at the database (and AC-01-78 for these tables); `guard_gaps()` empty; 29 loosenings
  each caught; chain 28 files, 485 tests. **The firm's lists.** The eighteen list tables of DATA-MODEL §2.3 (one table per
  list, §12 default 1, approved), each with its own columns and its three enums (`CountShape`,
  `ReasonUse`, and `VehicleType.certifies`); the built-in keys as one closed set in
  `packages/domain`; the seed values of `spec/LISTS.md` written by the installer's seed, so an
  upgrade can add a built-in value without touching the firm's own (the ADR settles the seeds
  LISTS.md leaves open: `01-setup.md`, point 6). A built-in value can't be archived. **Done when:**
  AC-01-31, 32, 34…38 pass as database tests; `guard_gaps()` is empty; the chain is green.
  *REQ-106c; REQ-101 (the library).*
- [x] **1.1.3** ✅ **done 2026-10-02 (ADR-303):** `Client`, `DeclarationEvent`, `TicketNumberSource`,
  the project's fifteen new columns and `ProjectKindOfWork`; two migrations
  (`client_declaration_event_project`, `guard_client_declaration_event_project`: 24 in all);
  `Policy` and `NewProjectSettings` in `packages/domain`, the release's built-in defaults in
  `packages/domain/policy.env`; no setting has a database default; a new project's time clock
  starts switched off, not offered to its workers until the firm switches it on (`01-setup.md`,
  point 2; confirmed by the user, ADR-304); AC-01-02…08 and 11…14 pass (06 and 11 at the domain, the
  rest at the database); `guard_gaps()` empty; 55 loosenings each caught; chain 31 files, 562 tests;
  stories 16 and 16 checks. REQ-105b, 105c, 105f, 124d ticked; **REQ-105d and 105j not ticked**
  (their checks and flag: 1.5.7, 1.5.5; C55). **Client, declaration event, and the project in full.** `Client`,
  `DeclarationEvent`; `Project` gains its client, declaration event, program type, *Allow split
  loads*, window, ticket-number source, workflows and settings; `ProjectKindOfWork`; the settings'
  defaults in `packages/domain`, read from policy values. The example world and both stories move to
  the new shape. **Done when:** AC-01-02…08 and 11…14 pass. *REQ-105b, 105c, 105d, 105f, 105j, 124d;
  REQ-105k's source (its series: 1.3.2).*
- [x] **1.1.4** ✅ **done 2026-10-02 (ADR-305):** `ContractorKind` and `ContractorPosition`,
  `Contractor.kind` (no default) and `mergedIntoId`, `ProjectContractor` (with `asPrimeId`, the key
  "the prime" points at) and `Contract`; two migrations (`contractors_on_a_project_and_contracts`,
  `guard_contractors_on_a_project_and_contracts`: 26 in all); `01-setup.md`'s point 1 settled: the
  database refuses a contract, or a sub, whose prime isn't one of the project's primes, by a
  two-column foreign key; AC-01-15…18, 20, 21 pass at the database (and AC-01-78 for these tables);
  `guard_gaps()` empty; 51 loosenings each caught; stories 16 and 17 checks. **At the user's word
  the same day (ADR-306): a contractor holds contact details** (`contactName`, `contactEmail`,
  `contactPhone`, as a client; the migration `contractor_contact`, 27 in all; AC-01-82 added and
  passing). Chain 32 files, 604 tests. **REQ-106e not ticked** (its subs at certification and what
  a merge moves: 1.2.3, C56).
  **Contractors on a project, and contracts.** `Contractor.kind` and its merge link,
  `ProjectContractor` (prime, tier 1, tier 2; one place per project), `Contract`. **Done when:**
  AC-01-15…18, 20, 21 pass. *REQ-106e's tiers (its subs at certification: 1.2.3).*
- [x] **1.1.5** ✅ **done 2026-10-02 (ADR-308):** `FormDocumentType`, `Form`, `FormDebrisType`,
  `FormDefinition` and `Assignment.formDocumentTypes`; two migrations
  (`forms_debris_types_definitions`, `guard_forms_debris_types_definitions`: 29 in all); KD-66's six
  points settled as agent defaults (a definition per project form; the database refuses a definition
  on any form but an ROE, survey, incident or drop-off log form, and a debris type on any form but a
  load or haul-out one, by a two-column foreign key to the form and its document type; versions from
  1, unique per form, never edited by anyone: `refuse_edit`; `Form.enabled` read only on the forms
  that aren't a workflow's; an assignment names only those four forms); `DebrisTypeEntries` in
  `packages/domain` (what a phone's list offers; the unreduced warning) and `formDefinitionFields`
  in `packages/contracts`. AC-01-22…26 and 28…30 pass (25 and 26 at the domain, the rest at the
  database), AC-01-27 in part (the field events still pointing at an archived entry: 1.3.4); AC-01-80
  gains the two new refusals; `guard_gaps()` empty; 28 loosenings each caught. REQ-105a ticked; REQ-101
  and REQ-107 not (a field event's pick, 1.3.4; the records, 1.3.6).
  **Forms, debris types, field tags, the firm's own fields.** `Form`,
  `FormDebrisType`, `FormDefinition` (a version never edited or deleted, guarded like
  `MasterPasscode`), `FieldTag`'s project list in use, `Assignment.formDocumentTypes` (C42). **Done
  when:** AC-01-22…30 pass. *REQ-101, 105a; C36's definition.*
- [x] **1.1.6** ✅ **done 2026-10-02 (ADR-309):** `BillingUnit` and `CrewTimeConversion`;
  `PayItem`'s every field, `PayItemRate` (one per prime, the prime held by ADR-305's key; `id`,
  `projectId`, `createdAt`, `archivedAt` besides §3's three) and `PayItemCrewDayStep`;
  `AssignmentPayItem.kindOfWorkId`, so an assignment names only unit rate pay items (C42's pay item
  done); two migrations (`pay_items_in_full`, `guard_pay_items_in_full`: 31 in all); `SizeBands`
  in `packages/domain` (an overlap refused, naming each band; a gap warned) and the policy value
  `CREW_DAY_HOURS=12`. AC-01-39…47 and 49…51 pass (45 and 46 at the domain, the rest at the
  database), AC-01-48 in part (the worker's checks: 1.5.7); `guard_gaps()` empty; 26 loosenings
  each caught; chain 37 files, 687 tests; stories 16 and 18 checks. REQ-102 and REQ-112d ticked;
  REQ-112e in part (billing the highest item's hours: 1.7.1).
  **Pay items in full.** `PayItem`'s every other field (its code, unique on its
  project, and its description are built, ADR-301; AC-01-41 passes), `PayItemRate` (one per prime),
  `PayItemCrewDayStep`; the size-band rule in `packages/domain` (bands of one payable type can't
  overlap; a gap warns). `AssignmentPayItem` and `dispatch-monday` follow. **Done when:**
  AC-01-39…51 pass. *REQ-102, 112d; C42's pay item.*
- [x] **1.1.7** ✅ **done 2026-10-02 (ADR-310, 311):** `DisposalSite` in full (type and the type's
  key, four facts, permit, GPS, dates, short code), `DisposalSiteLabel`, `DisposalSiteTippingFee`
  (several per site, in place of DATA-MODEL's one link: KD-67, confirmed by the user, ADR-312), `SiteAreaVersion`, `MapVersion`,
  `Zone` (never edited or deleted; a zone only with its version); `SiteAreaSource`, `MapSource`;
  the database refuses *Haul-outs leave here* off a TDSR/DMS site (C52 settled), and setup says so
  first (`SiteFacts` in `packages/domain`); shapes as GeoJSON (point 5 settled); and, at the user's
  word, `btree_gist` and the database's refusal of overlapping size bands (ADR-310). Four migrations
  (`disposal_sites_and_the_project_map`, its guard, `guard_size_bands_never_overlap`,
  `guard_map_shapes_hold_their_type`: 35 in all). AC-01-52, 53, 56…59 pass at the database, 54 at
  the domain and the database, 55 in part (its flag: 1.5.6); AC-01-45 at the database too.
  *REQ-104, 105q ticked; C42's site done.* **Disposal sites in full, and the project map.**
- [x] **1.1.8** ✅ **done 2026-10-03 (ADR-313):** the five models with their guards (two migrations, `rules` and `guard_rules`: 37 in all; 53 models); a rule held to a ticket form and a contract of its own project, a picked value to the rule's own project and form, an operator to its criterion's kind, by foreign keys and checks; in `packages/domain`, `RuleCriteria`, `RuleValidity`, `ProjectRules` (the copy refused, the overlap warned, a "Pays when" rule changed only from its pay item) and `PaysWhen`. AC-01-60 passes at the database, 61…67 and 81 at the domain, 64 at both, and AC-01-78 for every setup table; `guard_gaps()` empty; 35 loosenings each caught; chain 41 files, 834 tests. *REQ-125a ticked; REQ-131c's storage built (it stays open for its rates, 1.6.3).* **Rules.** `Rule`, `RuleCriterion`, `RuleCriterionPick`, `RuleAction`,
  `RuleActionItem` with `RuleCriterionKey`, `RuleOperator`, `RuleActionKind`, `QuantityFrom`; in
  `packages/domain`: which criteria and operators a form takes (`spec/RULES.md` §4, §4a), "Is valid"
  (§7), the overlap warning, **the refusal of an exact duplicate of a rule before it is saved**
  (ADR-301), and the rules a pay item's "Pays when" writes. **Done when:** AC-01-60…67 and 81 pass. *REQ-125a; REQ-131c's storage (its rates: 1.6.3).*
- [x] **1.1.9** ✅ **done 2026-10-03 (ADR-314):** 74 scenarios; 28 are what Phase 0 built (and ADR-286, 308, 309), each naming the test that proves it, seen passing that day (six test files, 136 tests; the story `dispatch-monday`, 18 checks), and AC-02-38 and 49 in part; seven (and two in part) are 1.1.10's; 28 are for Phases 2–4 only; ten points nothing settles are listed for the task that decides each. `spec/acceptance/02-people-and-devices.md`, from Part 2: what Phase 0 built is
  marked as built; what waits for Phases 2–4 names its phase.
- [x] **1.1.10** ✅ **done 2026-10-03 (ADR-315):** `UserPermission`, `ViewerProject` (table `user_viewer_project`), `User.viewerKind`, `email`, `phone`, `Device.keyRevokedAt` (two migrations, `permissions_and_viewers` and `guard_permissions_and_viewers`: 39 in all; 55 models); the viewer of a request read from their own record (`adms.viewer_id`); `guard_viewer`, one line per table, on 41 setup tables and lists, with `viewer_project_setup` for the project's settings; a contractor user sees no setup, no viewer a contact or a person. AC-02-05, 06, 09, 10, 11, 69 and 70 pass at the database, with the database's part of 61 and 71; the 28 Phase 0 scenarios carry their IDs; `guard_gaps()` empty; 35 loosenings each caught (one only after a test gained its case: a project written against a person who is no viewer); chain 43 files, 859 tests. *C54 done; C18's first part done; C47's column built.* **People's permissions and viewers.** `UserPermission`, `ViewerProject`,
  `User.viewerKind` and contact fields, `Device.keyRevokedAt` (its refusal is Phase 2's, C47);
  row-level security for every setup table a viewer sees (C18). **Done when:** the Part 2 scenarios
  marked for the database pass (AC-02-05, 06, 09, 10, 11, 69, 70, and the database's part of 61 and
  71), **and the 28 scenarios Phase 0 built carry their IDs in their tests' names** (ADR-314: the
  file names each test; a rename, never a loosening). It decides the file's points 1…6 (how a
  permission is taken away, what a contractor user sees of setup, contact details, a contractor
  user with no contractor, the audit domain, `ViewerProject`'s table name).
- [ ] **1.1.11** **The example world's setup as a story.** The golden mission's §1, P1 and P2,
  written in the spine's order through the API's setup services as the people who make it; every
  record asserted, one audit record per write. **Done when:** `pnpm scenarios` runs it (AC-01-01,
  78…80). *REQ-105e, 108; REQ-142's setup part; C30's first part.*

### Milestone 1.2 — Certifications and capacity (Part 3)

Carried: C56 (1.2.3), filed by ADR-305 (named here by ADR-307). Closes the behaviour of KD-10, 11,
45, 46, 48.

- [ ] **1.2.1** `spec/acceptance/03-certification.md`, from Part 3 and `adms-certifications`, the
  capacity examples taken from §3A.3 and the paper form, never from `development/`.
- [ ] **1.2.2** **Capacity math in `packages/domain`**, exactly `adms-certifications` §3A.3: whole
  inches, the primary box and boxes 1…N, each shape, add or subtract, hundredths at each step,
  ÷ 46,656, a whole CY half up; no override. **Done when:** every worked example of §3A.3
  passes as a unit test, and the example world's three containers are given measured boxes that work
  out to their 65, 48 and 110 CY (recorded in `spec/CONVENTIONS.md` §6; the mission states only the
  capacities); a crew has none. *REQ-106d; REQ-003's first rule.*
- [ ] **1.2.3** **The certification's records.** `Certification` (container or crew; unique per
  project by cert number; prime and subs; driver, tag; who certified; replaces, copied from, revoked
  from), `CertificationBox`, `CertificationHelper`; a sub typed in at certification becomes a
  `ProjectContractor` row under its prime (AC-01-19). **Done when:** Part 3's database scenarios
  pass. *REQ-106, 106b, 106e; REQ-106a's uniqueness; REQ-106f's records (its flags: 1.5.5).*

### Milestone 1.3 — Tickets and numbers (Part 4, the data)

Carried: C43, C44, C36's answers. Closes the behaviour of KD-13, 22, 23, 24, 27, 37, 41, 43, 44.

- [ ] **1.3.1** `spec/acceptance/04-field-capture.md`, from Part 4, `adms-ticket-workflows`
  §4.0a–§4.6 and `adms-field-app`: what each field event records; the phone's screens name Phase 3.
- [ ] **1.3.2** **Numbering.** `ProjectNumberSeries`, `ControlRange`, `NumberSeries` gains `ROE`;
  blocks of one series never overlap (an exclusion constraint needs the `btree_gist` extension: its
  ADR first, C43); the number rules in `packages/domain` (100,001 to 9,999,999, 1,000-number ticket
  blocks, 100-number cert blocks, issued in order, reclaimed, retired); the server's allocator.
  **Done when:** two phones can never hold the same number, proven as a database test. *REQ-105k,
  106a, 114.*
- [ ] **1.3.3** **`FieldEvent`, what every kind records.** The shared columns of DATA-MODEL §4.1
  (1): the source, a back-office-created record's person and reason with no phone, assignment or
  setup version (C44, with its check), the typed number and its reason, the certification as scanned
  and as found, the site, both GPS ends, the address. `guard_table` rerun; both stories follow.
  *REQ-105i, 115.*
- [ ] **1.3.4** **`FieldEvent`, what each kind records.** (AC-01-27's other half: a field event
  that points at a debris type's entry still does once the entry is archived, ADR-308.) The kind-specific columns of §4.1 (2),
  each empty on every other kind by a check; a split load's suffix and estimate both or neither; a
  haul-out collection's suffix with its running call; `FieldEventItem`, `CarriedTicket`; the same
  both-or-neither rule in `packages/contracts`. *REQ-103, 105o, 110, 111, 111a, 112, 112a, 112b;
  REQ-112e's capture.*
- [ ] **1.3.5** **Scale receipts and photos.** `ScaleReceipt` (unique per project by receipt
  number; never confusable with a ticket number), `Photo` (exactly one owner). *REQ-126a.*
- [ ] **1.3.6** **ROEs and forms.** `Roe`, `RoeScopeItem`, `Survey`, `Incident`, `DropOffLog`, each
  with its answers and the definition version answered; the answers' schema made from the definition
  in `packages/contracts` (C36). *REQ-107.*
- [ ] **1.3.7** **The harness's phones capture every kind.** Badge first, the number last and
  re-entered; a unit rate pay item worked out from the bands by the one rule the phone and the
  server share. Story: a day of P1's field events, every kind, landing `PENDING`. *REQ-112g, 120a;
  REQ-112f's phone part.*

### Milestone 1.4 — Sync intake with quarantine (Part 5)

Carried: C31's first part. Closes the behaviour of KD-56.

- [ ] **1.4.1** `spec/acceptance/05-sync.md`, from Part 5 and `adms-exceptions` §4.3a: what Phase
  1's intake does; the endpoint, the idempotency ledger and the manifest name Phase 2.
- [ ] **1.4.2** **Intake.** `QuarantinedRecord`; every field event received, in any order, in
  bursts; a second event of one kind on one ticket quarantined in full, never dropped, merged or
  acknowledged as saved; a retry of the same phone-made id is the same record; an out-of-service
  phone's work received. The harness's stand-in (`packages/scenarios/src/intake.ts`) gives way to
  it. *REQ-120b, 120h; REQ-124c's receiving part.*

### Milestone 1.5 — Reconciliation (Part 6)

Carried: C16, C20, C50, C52's scenarios; C53's second part (1.5.5) and C55 (1.5.5, 1.5.7), filed by
ADR-303 (named here by ADR-307). Closes the behaviour of KD-02, 04, 05, 06, 12, 19, 28, 35, 42, 50,
55.

- [ ] **1.5.1** `spec/acceptance/06-reconciliation.md`, from Part 6, `adms-validation` and
  `spec/FLAGS.md`: one scenario at least for each of the 67 flags and each thing never flagged.
- [ ] **1.5.2** **The derived records.** `CompletedLoad` and `CompletedLoadCollection`,
  `CompletedHaulOut` and `CompletedHaulOutCollection` (one disposal each; one live row per
  collection event, the partial unique key in a guard migration; `dissolvedAt`), `Flag` with
  `FlagCode` and `FlagBilling`, `ReconciliationRun`, `ReconciliationDecision`; the worker's columns
  on a field event (zone, map version, worked-out pay item). Today's `CompletedLoad`, its tests and
  `guard_transaction_delete` follow. *REQ-113, 116.*
- [ ] **1.5.3** **Grouping and status, in `packages/domain`.** A ticket's events grouped on project
  + workflow + bare number, ordered by field time, the kind never used to find a partner; the
  group's shape (a split's suffixes); an event missing → `PENDING`, listed, never flagged, never
  expiring. *REQ-120, 120b1, 120e, 120f, 127, 129.*
- [ ] **1.5.4** **Quantities, in `packages/domain`** (`adms-validation` §5.5). Capacity × load
  call; a split load's shares by estimate; a split haul-out's piles by what each added; a tandem's
  one weight by certified capacity; the carried tickets' count and a load of stumps' CY; a
  circumference to a diameter; the stump's fill; each summing exactly. **Done when:** the mission's
  quantities come out to the digit (52.0, 36.0, 62.4, 24.0, 45.5, 28.8, 99.0 CY; 14.4 and 21.6 CY;
  2.82, 7.06 and 14.12 tons; 18.0 in; 4.8 CY). *REQ-120i, 120j, 126, 126b, 126d, 126e.*
- [ ] **1.5.5** **Checks and flags, between events and on the certification.** The flag catalogue as
  one closed set with each message word for word from `spec/FLAGS.md`; `FLAGS.md` §3.1, §3.2 and the
  time flags of §3.3; the facts a flag keeps and their hash. *REQ-105j, 120d, 122, 122a, 129a;
  REQ-106f's flags; REQ-124c's flag.*
- [ ] **1.5.6** **Checks on place.** The one geodesic module; a point in a circle, a shape, the
  boundary, a zone; `FLAGS.md` §3.3's place flags and §3.4 (where the debris went; a haul-out that
  left a landfill, or was dumped at a TDSR: C52); a site's dates and permit. Any library needs its
  ADR. *REQ-123, 124b, 124e, 128; REQ-105n's flag.*
- [ ] **1.5.7** **Checks on quantity, the pay item's settings, unit rate work and forms.**
  `FLAGS.md` §3.5…§3.7: the load-call limits, the pay item worked out again from the bands, the
  stump checks, crew hours across a day, the ROE flags. A renamed built-in value changes nothing
  (AC-01-33). *REQ-112c; REQ-112f's engine part.*
- [ ] **1.5.8** **Mileage.** What the worker asks Valhalla and Nominatim (C50): the snap to the
  nearest road, the shortest route on public roads, the address of the snapped point; stored
  unrounded with the map data's date and hash; no route → the straight line, flagged; recomputed
  only when an end moves. The mission's GPS points are picked from the pinned extract here.
  *REQ-126f.*
- [ ] **1.5.9** **The worker's run.** One ticket, one database transaction; one run per project at
  a time, by a database lock; a ticket that errors flagged and skipped; unchanged input changes
  nothing; each decision recorded; whether the worker states a person for a reprocess they asked for
  (C20). Story: P1's loads and haul-outs reconciled, unpriced, with their statuses and flags.
  *REQ-015, 121, 132.*

### Milestone 1.6 — The rule engine (Part 7, the rules)

Closes the behaviour of KD-15, 36, 38, 54.

- [ ] **1.6.1** `spec/acceptance/07-pricing-ledger-audit.md`, from Part 7, `adms-ledger-audit`,
  `spec/RULES.md` and `spec/RATE-SHEET.md`.
- [ ] **1.6.2** **Criteria, in `packages/domain`.** Each criterion reading its named field event,
  each operator, BETWEEN with both ends, mileage in tenths half up; only the active, valid rules of
  the ticket's form whose contract's prime is the ticket's, or with no contract. *REQ-125, 125b.*
- [ ] **1.6.3** **Actions to lines, in `packages/domain`.** Every passing rule found; adds in #
  order, then removes, then voids; one line per add; two adds of one # and no line at all flagged;
  the quantity by the pay item's unit (crew time's highest item, an itemised ticket's chosen items,
  the fill CY, TBN); the rate of the rule's contract's prime, a $0 line where it has none; per
  property on a split, per pile on a split haul-out; the same answer every time, proven by running
  it twice. *REQ-112e, 112f, 131a, 131c, 131d.*
- [ ] **1.6.4** **The setup check, and what each site's phones ask for.** AC-01-69…77; the two
  points `01-setup.md` leaves to it. *REQ-124f, 125c.*

### Milestone 1.7 — The ledger and audit (Part 7, the money)

Carried: C16, C17, C18. Closes the behaviour of KD-01, 26, 49, 52, 53.

- [ ] **1.7.1** **`Transaction` in full.** Its three kinds of ticket (exactly one), the property or
  pile, slot, rule, pay item, contract, prime and operating sub, unit; a # once per ticket and
  property or pile; the delete guard following the invoice lock through all three; what a
  contractor viewer sees (its own prime's lines, its subs' included). *REQ-106g, 130, 133.*
- [ ] **1.7.2** **The worker prices.** A ticket's lines regenerated: each removed row copied in
  full to the audit log first, then the new ones written, in the ticket's one transaction; a void
  removes them; a rate or rule change queues every un-invoiced ticket it touches; a `COMPLETED`
  ticket reprocessed in place. Story: P1's Monday and Tuesday priced; two primes (AC-01-68).
  *REQ-105l, 131, 131b.*

### Milestone 1.8 — Review, QC, invoice lock and batches (Parts 8 and 9)

Carried: C17, C19. Closes the behaviour of KD-25, 40.

- [ ] **1.8.1** `spec/acceptance/08-review-and-corrections.md` and
  `09-invoice-deliver-closeout.md`, from Parts 8 and 9 and `adms-exceptions`.
- [ ] **1.8.2** **People's marks.** `QcMark`, `InvoiceLock` in full (the unlock kept on its row),
  `InvoiceBatch`, `FlagAcceptance`, `TicketVoid`; each written by the API, never touching a derived
  row. *REQ-105m's record; REQ-105h's lock.*
- [ ] **1.8.3** **Corrections and renumbering.** Any captured field corrected in place by
  permission, the prior value kept; a renumber of real work; a quarantined record resolved, keeping
  its phone-made id and its photos; each reprocessing the ticket. *REQ-105g, 120c.*
- [ ] **1.8.4** **Void, unvoid, accept.** A person's void with a reason; a rule's void, which wins
  on every reprocess; an unvoid; a flag accepted with a reason, not raised again unless its facts
  change; every flag fixed or accepted → `COMPLETED`. *REQ-105p, 120g, 129b.*
- [ ] **1.8.5** **QC, the lock and batches.** QC set by people only, on the completed load or
  haul-out, a unit rate ticket, a form, a certification; only QC Approved locks; a named batch; a
  locked ticket untouched by a reprocess until an audited unlock. *REQ-105h, 105m.*

### Milestone 1.9 — Prove it: the golden mission

Carried: C28, C29, C30, C51's two scenarios.

- [ ] **1.9.1** **The golden mission as a story**, whole: its setup, both days, the late sync, the
  renumber, the accepted flag, the two voids, the split load, the weighed split haul-out, QC, the
  lock and batch; the exact statuses, review queue, ledger and audit rows. A change to an approved
  number needs the user's word. *REQ-017, 142, 143.*
- [ ] **1.9.2** **The scenarios the mission leaves out, as stories**, and a count: how many
  scenario IDs have a passing test, by part. Among them the split haul-out paid by the CY (six
  lines, $850.85) and the pile whose call isn't higher (C51).
- [ ] **1.9.3** **Phase exit.** Every Phase 1 REQ ticked or re-filed with an ADR; REQ-003, 105,
  128, 140 and 141 from the final run; each KD named above closed in `DEVIATIONS.md`; `guard_gaps()`
  empty; `pnpm security` passing; the CIS items for the new tables; `REQUIREMENTS-LATER.md`'s Phase
  2 refreshed against `SUMMARY.md` before Phase 2 is offered to the user.

---

## Done — Phase 0: Foundation *(ADR-103)*

> **2026-10-01 (ADR-282…287): every Phase 0 task below is done**, and the user made the first commits
> the same day (REQ-002 ticked, ADR-288) and approved `spec/DATA-MODEL.md` and `spec/FLAGS.md`
> (ADR-289, 290). The data model's thirteen points were settled the same day (KD-65 closed, ADR-292…295).
> **The user opened Phase 1 on 2026-10-01 (ADR-299).**

### Milestone 0.1 — Approve the foundation (docs only) — ✅ done 2026-10-01
- [x] **0.1.1** ARCHITECTURE §1–§3 (principles, layers + write boundary, stack) approved 2026-09-26 (ADR-143); routing (ADR-119), project map (ADR-141). Only §3's site-area details wait (Q-136).
- [x] **0.1.2** ARCHITECTURE §4–§6 approved: §5 (ADR-113), §4 and §6 (ADR-139).
- [x] **0.1.3** ARCHITECTURE §7–§9 approved 2026-09-25 (ADR-104), with ADR-105/106. Follow-up **Q-115**.
- [x] **0.1.4** ARCHITECTURE §10–§13 approved 2026-09-25 (ADR-104). Q-94 closed; **Q-93** (check digit) still open.
- [x] **0.1.5** ARCHITECTURE §14–§16 and §18 approved 2026-09-25 (ADR-104); §17 approved 2026-09-26 (ADR-143).
- [x] **0.1.6** ✅ **done 2026-10-01 (ADR-283): the hook reviewed for the rebuilt layout and tightened (env files never read, written or printed; generated paths, the lockfile, the historical root compose file and README never hand-written; fails closed without `jq`; runs on `Read` too), with 57 tests in `tools/security/test/guard-hook.test.ts` and 14 loosenings each caught; `AGENTS.md`'s write boundaries list the same rules. REQ-023 ticked.** Guard hook and `AGENTS.md` updated together for the approved layout (ADR-043). The migration rule part is done (ADR-113); `AGENTS.md` opens `apps/`, `packages/`, `infra/`, `tools/` (ADR-143).

### Milestone 0.2 — Scaffold — ✅ done 2026-09-29 (ADR-143, 231, 255…266)

**Brief for the agent who starts it.** Read ARCHITECTURE §3 (stack), §4 (install), §15 (testing),
§16 (security standards) and §18 (layout) first. Nothing in 0.2 models the product: no tickets,
pay items or rules yet (their names are in `spec/CONVENTIONS.md`, ADR-234; placeholders and
examples follow it too). **One sub-task per response**,
each ending with real observed output and the user's git block. What "done" means for each is below;
don't tick a box on "should work".

**Before starting:**
- **Node 24 LTS through fnm** (ADR-231, ADR-233). The user installed **fnm**, default Node
  **24.21.0**. An agent's shell doesn't load `~/.zshrc`, so a bare `node` still finds an old Homebrew
  25.2.1 (kept on purpose: `mongosh` depends on it; don't suggest removing it): start every Node
  command with `eval "$(fnm env --shell zsh)"` (then `node -v` → 24.x), and
  pin 24 in `.nvmrc` so `fnm use` picks it (done, ADR-255). If fnm doesn't give 24.x, stop and ask.
  Don't pin a non-LTS runtime.
- Tools seen on 2026-09-29: npm 11.6, pnpm 10.24, Docker 28 with Compose, `psql`, `jq`. No Caddy
  binary (it runs in a container).
- Root files you may write (ADR-231): `package.json`, the lockfile, the workspace file, base
  `tsconfig`, `.nvmrc` / `.node-version`, `.editorconfig`, `LICENSE`, `.gitignore`. Not `README.md`.
  Never touch `database/`, `development/` or the historical root `docker-compose.yml` (KD-59).
- **Every dependency gets an ADR** before it's added: exact version, licence (compatible with
  **AGPL-3.0**: permissive, LGPL, GPL-3.0, AGPL-3.0; refuse source-available and non-commercial,
  ADR-171) and maintenance (recent release, active repository). Check current facts online; don't
  trust memory for versions. Group small tooling deps into one ADR where sensible.

- [x] **0.2.1** ✅ **done 2026-09-29 (ADR-255…258): pnpm 11.27.1, TypeScript 6.0.3, ESLint 10 + typescript-eslint + Prettier, `pnpm licences`; clean install, typecheck, lint and licences (100 of 100 allowed) pass from a clean copy.** **The monorepo skeleton.** Workspace per §18 (`apps/api`, `apps/worker`,
  `apps/back-office`, `apps/field`, `packages/db`, `packages/domain`, `packages/contracts`,
  `packages/scenarios`, `infra/local`, `tools/setup`), each with a minimal `package.json` and a
  placeholder source file that compiles. Choose the workspace tool (npm or pnpm workspaces) in
  an ADR. TypeScript strict, one base `tsconfig`, project references; a linter and formatter;
  `LICENSE` (AGPL-3.0 text); root `.gitignore` rewritten for the new layout (keep the `.env` rules);
  Node pinned in `.nvmrc` and `engines`. Screens translatable from the start is a web-app concern
  (ADR-172): record the i18n library choice when the web apps get real screens, not now.
  **Done when:** a clean install from the committed lockfile, `typecheck` and `lint` across every
  workspace, all pass, and a licence report lists every installed package's licence with none
  refused. Paste the real output.
- [x] **0.2.2** ✅ **done 2026-09-29 (ADR-259…261): Vitest 5.0.1 on Vite 8.3.0, Zod 4.6.5 in `contracts` → `domain`, tests in `<workspace>/test/`, `adms-verify` rewritten (KD-57 closed), MPL-2.0 allowed (agent default, ADR-260); from a clean copy `pnpm test` reports 2 files, 4 tests passed, and install, typecheck, lint and licences (135/135) pass.** **`packages/domain` and `packages/contracts` with the test runner wired.** Pick the
  runner in an ADR. `domain` depends on nothing; `contracts` (Zod) depends on `domain` only; a test
  in each proves the wiring (a trivial one is fine; the capacity math comes in Phase 1 with its
  paper-form examples, `adms-certifications` §3A.3). Rewrite `adms-verify` for the new chain (the
  commands, what each proves, expected counts), keeping the historical chain under a History heading.
  **Done when:** `test` runs from the root and reports real counts.
- [x] **0.2.3** ✅ **done 2026-09-29 (ADR-263, 264): Postgres 18.6, SeaweedFS 4.47, Caddy 2.11.4, Mailpit 1.31.2, pinned by digest; `pnpm local:up` brings all four healthy and checks `https://adms.localhost/health` → `200 ok`; curl with Caddy's root gives 200, plain HTTP gets 308 to HTTPS; `local:down` leaves 0 containers and 0 networks; resume and `local:wipe` shown.** **`infra/local`: one command up, HTTPS only.** docker compose with Postgres (major
  version pinned), an S3-compatible object store (check the candidate's licence **and** that its
  images are still published and maintained; don't assume MinIO), Caddy with its internal CA serving
  `*.adms.localhost`, and a mail catcher for dev (ADR-170). Nothing exposes plain HTTP outside
  (Postgres bound to localhost only). Dev passwords are generated into a git-ignored env file,
  never committed. Valhalla and Nominatim (REQ-022) are **not** in this step; they get their own
  step later (large map data). **Done when:** `up` brings every service healthy, `curl` over HTTPS to
  a Caddy-served health page succeeds, plain HTTP is refused or redirected, and `down` cleans up.
- [x] **0.2.4** ✅ **done 2026-09-29 (ADR-265, 266): `pnpm installer`, `installer:check`, `installer:teardown`; `pg` 8.23.0; first run, rerun (secrets byte-identical), resume after `local:wipe`, a lost secret refused, teardown then first run, each shown with output; no secret in any output.** **`tools/setup`: the installer** (§4, REQ-007): an interview that writes local
  config, generates secrets, creates the database roles, runs migrations and seeds; on a rerun it
  re-checks what it knows and offers to resume; teardown makes the next run a first run; never prints
  a secret or password; never rotates keys on a resume. Roles and migrations can be stubs until 0.3.
  **Done when:** first run, rerun (resume) and teardown-then-run are each shown working, with output.

### Milestone 0.2b — Spec pages before the schema (ADR-140, ADR-164) — ✅ done 2026-10-01: both pages approved by the user (ADR-289, 290); the data model changed at their word (ADR-292…295); KD-65 is closed
- [x] **0.2b.1** **Naming pass** (ADR-164, user 2026-09-27): a table of every record, field, rule
  criterion, status, type label and export column with a proposed plain name, for the user to
  approve before `spec/DATA-MODEL.md`; "plenty of details we're able to export for each type of thing
  the field is creating". ✅ **2026-09-29: `spec/CONVENTIONS.md`**, an agent default at the user's word
  (ADR-234, 235): the renames, code names, units, the pay item code convention, the example world and
  the retired examples. Export column names are settled with `DATA-MODEL.md` (0.2b.2), from it.
- [x] **0.2b.2** ✅ **drafted 2026-10-01 (ADR-284): `spec/DATA-MODEL.md`, 688 lines: every record and field, who writes it, what the database refuses, thirteen exports' column names, sixteen agent defaults listed for the user; answers C16–C19, C29, C36, C42–C44 on paper. Waits for the user's approval before Phase 1's schema.** ✅ **Approved by the user 2026-10-01 (ADR-289)**, all sixteen defaults; then laid out one way throughout and checked against the rest of the spec: thirteen points open (KD-65). `spec/DATA-MODEL.md` draft (after 0.2b.1; Q-176 answered, ADR-182; round 14–15's data-model
  answers are in, ADR-174…184; ADR-185 settles haul-out and split halves; ADR-191 the start list and a code's name shown to monitors; ADR-192 the load of stumps; ADR-195 one site per site-working phone; ADR-196 the stump ticket's root ball, its fields and fill: Q-189).
- [x] **0.2b.3** ✅ **drafted 2026-10-01 (ADR-285): `spec/FLAGS.md`, 67 flags in nine groups, one message shape, what each does to billing, the facts each keeps; four points for the user (which certification bills when the two cert numbers differ; no over-the-legal-limit weight test yet; six codes the agent worded; the date format). Waits for the user's approval of the wording.** ✅ **Approved by the user 2026-10-01 (ADR-290)**, its §5's four points included. `spec/FLAGS.md` draft: every flag's code, trigger, message, still-bills, accept
  behaviour (ADR-166), ADR.

### Milestone 0.2c — Rewrite the skills in the present tense (ADR-138, ADR-232, ADR-233) ✅ done 2026-09-29 (ADR-242…253)

**Why.** Agents load skills to learn the rules, and 8 domain skills still teach the old system in
their body with the current rule only in ⚠️ notes (KD-58, KD-62). A smaller model built a demo from
those bodies (`MATCHED`, prefixed numbers, a Service on a load, old site options). The user: "it
should use what is in the skills, so if the skills are outdated we need to update them", and keep it
lean ("especially as it relates to bloat"). **The model for a finished rewrite is
`.claude/skills/adms-domain/SKILL.md`**: read it first.

**Brief for the agent who does one.**
1. **One skill per response**, in this order, for the user to read before the next.
2. **Before writing:** read the whole skill, then `SUMMARY.md` §1 (every topic the skill touches)
   and §2 (superseded), then each ADR in the skill's start list below (`grep -n "ADR-1NN\*\*"
   agent_store/DECISIONS.md`). An ADR row quotes the user and names its Q-ID; the user's full words
   are in that entry's `> **User, date …:**` quotes in `spec/QUESTIONS.md`. The start lists are a
   floor, not a ceiling: grep SUMMARY for the skill's terms too.
3. **Write today's rules, in the present tense, about the rebuild**: what the system does and why,
   each rule with its ADR. No "as implemented", "current implementation" or "gaps vs what's built"
   sections: nothing is built yet; gaps live in KDs and the part pages. The user's own words only
   **verbatim**, short, marked **User, date (Q-xx)**, where the words are the rule.
4. **No rule changes.** Where ADRs disagree, the newest wins and SUMMARY breaks ties. If something is
   truly unsettled, use the shot-clock (ADR-230): record an agent default ADR, or ask (at most three
   questions) only if it changes money, evidence or what a monitor does.
5. **Lean.** One topic, one home (ownership table below): link to the owning skill instead of
   restating it. Don't repeat `adms-domain`'s glossary. Aim for **shorter than today**. Keep the old
   **section numbers** (other docs cite them, e.g. `adms-ticket-workflows` §4.5); new subsections
   are fine. Cross-references name their skill (`adms-exceptions` §4.3a), which closes KD-33.
6. **End with a History list** (≤ ~15 bullets): what the body used to say → what replaced it (ADR).
   Put `<!-- skill-status: current (ADR-138, rewritten <date>, ADR-NNN) -->` under the front matter;
   update the `description:` if the scope changed.
7. **Words and examples: `spec/CONVENTIONS.md`** (ADR-234, 235, 236, 237). Today's terms: **pay item**
   (`PayItem`; never "Service" or "service code"), **field event** (never "half"), its **code**, **payable type** (never "Classification"), **debris type** (never
   "debris class"), **site type** and the site facts **Takes loads · Haul-outs leave here · Charges a
   tipping fee · Ineligible site**, **field tag**, *Add / Remove transaction #n*, completed load `CLT` /
   `CHO`, set up, installation. The old words appear only in the History list. **Every example comes
   from the example world** (CONVENTIONS §6, the golden mission) with codes in the §5 convention:
   replace the skill's retired examples (`54A`, `90A`, TFR, Charlotte County Landfill…), and never
   quote a user answer just for its example.
8. **After writing:** check `spec/golden/MISSION.md` against the skill (fix the mission if it's
   wrong; it's a draft); note stale lines you saw in part pages, `RULES.md`, `LISTS.md` or
   `RATE-SHEET.md` in KD-62 (don't fix them in the same response); record the rewrite as an ADR
   (method is ADR-138, so one short row), update SUMMARY ("Agent tooling": which skills are done),
   KD-58/KD-33/KD-62, and this checklist; close out (`adms-close-out`).
9. **Write in field events (ADR-236; model: `adms-domain` §1.2).** What a monitor records under a
   ticket number is a **field event** (`COL`, `DIS`, `HOC`, `HOD`, `URT`); a ticket is its number and
   its events; the completed load / haul-out, statuses, flags, zone, mileage and transactions are
   **conclusions the worker draws from the events** and draws again on every reprocess. Describe each
   workflow as its events, the one that makes the number and the one that takes the quantity; a
   check compares events; a correction changes an event in place, audited (event-driven, not
   event-sourced); forms and certifications are records, not a ticket's events. Never a bare
   "event" for the disaster (*declaration event*). Say "unpartnered event", not "lone half".

**Superseded ideas that leak most** (each must appear only in the History list):
`MATCHED`/`FAILED` statuses; `LoadTicket`/`HaulOutTicket` and prefixed numbers (`COL-…`); a load's
"halves" and "service code" (now field events and pay items, ADR-236, 237); correction events or a
replayed event log; pairing on
a composite key; a monitor-recorded zone; the 5 km route check and route drift; mileage to the
disposal's end GPS; a monitor picking a pay item for a load, a Service on a load, codes copied per
prime, "shown to monitors" codes; the site options Disposal · Haul-out · Staging · Citizen drop-off ·
HHW and an HHW site type; a "requires weight" box, asking for both a load call and a weight, a
weight-vs-load-call check; paying a stump from its CY, or its root ball as 3.6 × D for the fill;
citizen drop-off as a ticket type; QC on a load's halves; "only a person voids"; the fee-kind
conflict check (now the # slot) and fee kinds at all (ADR-246); the "ticket's own contract"; a 4-photo limit; a GPS accuracy check;
a ticket list on disposal phones; ageing or grace periods; work orders and purchase orders; the
historical files (`database/src/services/`, `queries.py`, `validators.py`, `gps.py`,
`compute_volume`, `writeAudit`, FastAPI on port 8001, `pytest`).

**Who owns what** (so nothing is written twice):

| Skill | Owns | Points elsewhere for |
|---|---|---|
| `adms-domain` ✅ | what an ADMS is, who's who, a ticket's life in brief, glossary, invariants | everything in detail |
| `adms-ticket-workflows` ✅ | the setup spine and what each setup record holds; each workflow's field events (which makes the number, which takes the quantity); how every capture starts (badge first, number last); workflows A (loads, splits, loads carrying tickets), B (haul-outs), C (each unit rate kind: hangers, leaners, stumps, white goods, crew time, HHW), D (ROE, surveys, incidents, drop-off logs); numbers; the order of a reconciliation run | checks and flags (validation), pricing (ledger), duplicates (exceptions), phone screens (field-app) |
| `adms-validation` ✅ | statuses; every check and its flag and message style; accepting a flag; how rules run (criteria read only the ticket, # order, creates → deletes → voids, a rule's void wins); quantity math (capacity × call, split shares, diameter from circumference, stump and fill CY, crew hours) | the flag catalogue, later (`spec/FLAGS.md`) |
| `adms-data-model` | the records and their links (target model: `FieldEvent`, the completed records drawn from it), reference vs evidence vs ledger, fixed vs firm-extendable lists (`spec/LISTS.md`), which package touches what (ARCHITECTURE §18) | field names (naming pass, `spec/DATA-MODEL.md`) |
| `adms-exceptions` | duplicates and quarantine; renumber vs void; corrections and reprocessing; orphans and preloads; back-office-created records; an out-of-service phone | flags (validation) |
| `adms-ledger-audit` | Services and rates per prime; transactions and regeneration; rule actions and pricing (with `spec/RULES.md`); the audit log; QC status; the invoice lock and batches; the client package | the rule builder screens (`spec/RULES.md`) |
| `adms-certifications` | containers and crews, the one number, capacity math (§3A.3, user-confirmed, never changed), photos, attestation, lifecycle, copies, number blocks, a truck keyed by hand | |
| `adms-field-app` | enrolment and the day's assignment on the phone (ADR-240), setup when unassigned, sign-in, switching monitors, the time clock on the phone (ADR-241), encryption, turn-in and out of service; what a phone holds (lists, the site lookup); capture screens and order; printing; GPS and photos on the phone | workflows (ticket-workflows) |
| `adms-scale-receipts` | when a receipt exists, what it is, transcription, one quantity from the paying Service, a tandem's shared weight | |

**Start lists** (ADRs to read before writing; superseded ones only for the History list; 007, 016
and 030 are superseded in part, so read the row's ⚠️ note first):

| # | Skill (lines today) | Start from | History only |
|---|---|---|---|
| 0.2c.1 ✅ | `adms-ticket-workflows` (665 → 513, done 2026-09-29, ADR-242) | 006 013 019 027 030 032 040 041 046 053 055 056 062 063 065 088 124 126 127 128 131 132 137 145 146 148 149 150 158 159 160 161 162 173 176 177 178 183 184 186 187 188 189 192 195 196 198 199 200 203 204 205 207 208 209 211 213 214 215 216 217 218 219 220 221 222 223 226 227 228 229 | 010 047 180 182 185 191 193 201 |
| 0.2c.2 ✅ | `adms-validation` (323 → 358, done 2026-09-29, ADR-244) | 019 028 033 048 052 053 060 079 083 086 100 111 116 118 130 131 135 136 141 142 154 161 164 166 167 177 181 203 205 210 213 215 217 222 223 226 239 240 243 | 010 011 012 029 |
| 0.2c.3 ✅ | `adms-data-model` (438 → 343, done 2026-09-29, ADR-245) | 023 024 026 050 070 074 075 081 093 094 097 100 105 107 108 145 146 148 160 164 168 173 194 206 211 214 216 221 227 233 236 239 240 241 243; ARCHITECTURE §5, §18; `spec/LISTS.md` | 001 009 |
| 0.2c.4 ✅ | `adms-exceptions` (464 → 342, done 2026-09-29, ADR-248) | 022 028 033 039 051 052 053 055 086 134 155 156 166 167 236 240 | 020 025 029 |
| 0.2c.5 ✅ | `adms-ledger-audit` (210 → 211, done 2026-09-29, ADR-249) | 007 057 061 067 068 081 084 085 089 090 097 107 109 117 118 121 122 123 125 126 128 130 131 132 146 147 168 174 202 206 212 222 228 229 239; `spec/RULES.md` | 054 |
| 0.2c.6 ✅ | `adms-certifications` (320 → 264, done 2026-09-29, ADR-250) | 015 016 017 045 048 073 076 078 079 080 082 087 102 (Q-96) 108 151 152 153 154 157 179 228 240 | |
| 0.2c.7 ✅ | `adms-field-app` (321 → 252, done 2026-09-29, ADR-251) | 031 056 071 072 083 095 096 099 101 105 106 115 120 134 145 151 157 170 172 176 186 195 207 209 213 223 227 240 241 243; ARCHITECTURE §7–§11; `spec/FROM-BUILD-1.md` | 193 |
| 0.2c.8 ✅ | `adms-scale-receipts` (256 → 177, done 2026-09-29, ADR-252) | 034 035 036 037 038 069 165 175 202 221 223 227 243 | |

`adms-verify` is rewritten by the scaffold (0.2.2); `adms-decisions` and `adms-close-out` are process
skills, checked and marked when they next change.

**Done when** (each skill), shown with real output:
- `grep -c '^> ⚠️' SKILL.md` is **0** (every note absorbed into the body);
- the leak list above appears only below `## History`. This command must print **0** (it gave 25
  on the old `adms-ticket-workflows` and gives 0 on the rewritten `adms-domain`, `adms-ticket-workflows`, `adms-validation` and `adms-data-model`); read the rest of the
  leak list by eye, since some of it can't be grepped:
  ```bash
  leak='MATCHED|FAILED|LoadTicket|HaulOutTicket|\b(COL|DIS|LDT|HOT)-[0-9]|TDRS|ROUTE_DRIFT|route drift|requires weight|drop-off (ticket|ticket type)|database/src|queries\.py|validators\.py|gps\.py|compute_volume|writeAudit|FastAPI|pytest|port 8001|[Ss]ervice codes?|ServiceCode|\bhalves\b|ticket half|lone half|[Ff]ee.kinds?'
  awk '/^## History/{exit} {print}' .claude/skills/<skill>/SKILL.md | grep -c -E "$leak"
  ```
- the **retired examples and old names** appear only below `## History` too: both commands print
  **0** (`spec/CONVENTIONS.md` §7; the same checks for any spec page rewritten):
  ```bash
  retired='\b(1A|1B|2A|2B|2C|6A|7A|7B|8A|8B|8C|54A|56A|56B|90A|99A|P1A|V1)\b|`(3A|4A)`|(3A|4A)-|\bBobs\b|\bToms\b|\bTFR\b|Ceres|Alachua|Charlotte County|Hwy 20|Private pit|Don Pedro|Oak Ave|OPERATION OF TDMA|BDR Load|M00349[0-4]|61081[0-4]|104499|DR-4673|Greene County|Sweeps Away'
  old='\bServices\b|\bService( [^cC]|[^ a-zC]|$)|Classification|[Dd]ebris class|Location Type|Allow (Collection|Disposal)|Disposal Fee|Special Class|Create Transaction|Delete Transaction'
  awk '/^## History/{exit} {print}' .claude/skills/<skill>/SKILL.md | grep -c -E "$retired"
  awk '/^## History/{exit} {print}' .claude/skills/<skill>/SKILL.md | grep -v '^> \*\*User' | grep -c -E "$old"
  ```
  (a user quote keeps its own words; a line naming the legacy term to explain it, e.g. "the legacy
  'Service'", is fine: say so in the report);
- the marker is there, and the session hook lists the skill as current;
- line count before → after is reported (shorter, or say why not);
- SUMMARY, KD-58/33/62, this checklist and the golden mission are updated in the same response.

### Milestone 0.3 — The database enforces the rules ✅ done 2026-09-30 (ADR-267…273)

**Builds on the installer (ADR-266):** the four login roles and the database `adms` exist after `pnpm installer`, and each role's URL is in its service's env file (`packages/db/.env` holds `adms_owner`'s). Migrations run as `adms_owner`; the installer's `migrate()` and `seed()` stubs (`tools/setup/src/installer.ts`) are where `prisma migrate deploy` and the seed are called. Grants on tables, the guards and row-level security are migrations, not the installer's.
- [x] **0.3.1** ✅ **done 2026-09-29 (ADR-267, 268): Prisma 7.10.0; nine provisional models in `packages/db/prisma/schema/` (CompletedLoad, InvoiceLock, Contractor added for REQ-009/013/014); migration `20260930024320_hardening_models` applied by `pnpm installer` on a resume and a fresh install, at head on a rerun; the installer makes the shadow database `adms_shadow` and checks `prisma migrate status`.** Prisma multi-file schema: the minimum models to test hardening (project, a field event, `AuditRecord`, `Transaction`, device, user). Named per `spec/CONVENTIONS.md` §3; final until `spec/DATA-MODEL.md` (0.2b.2) says otherwise; the hardening, not the product model, is what 0.3 proves.
- [x] **0.3.2** ✅ **done 2026-09-30 (ADR-270): nine guard migrations (checks, grants, no delete, audit capture, append-only audit, transaction delete, row-level security, and two fixes forward), applied by `pnpm installer` on a re-created database and each shown in psql.** **How (ADR-113, 266, 268):** the four **login roles already exist** (the installer makes them with their passwords); the guard migrations **grant** to them, never create them. Make each stub with `prisma migrate dev --create-only --name <guard>` in `packages/db` (the hook lets SQL be written only into that empty stub), then apply with `pnpm installer`. Quote the tables named by SQL keywords: `"user"`, `"transaction"`. Ids default to `uuidv7()` in the database, so trigger-written rows need none. Guard migrations (ADR-113): roles, grants, delete refusal, audit trigger with required actor, `AuditRecord` insert-only, transaction-delete copy-to-audit and invoice-lock refusal, row-level security.
- [x] **0.3.3** ✅ **done 2026-09-30 (ADR-272): 94 database tests in `packages/db/test` (Vitest, `pg`, the local stack's administrator with `SET LOCAL ROLE`, each test rolled back); every grant and refusal, the catalog read exactly, `guard_table` and `guard_gaps()`; 26 guard mutations on a throw-away copy, each caught; `guard_gaps()` fixed forward (`guard_gaps_trigger_kinds`). Chain 12 files, 106 tests.** Tests asserting every grant and every refusal (REQ-009…014).
- [x] **0.3.4** ✅ **done 2026-09-30 (ADR-273): `db.$write(actor, work)` in `packages/db` (`@prisma/client` + `@prisma/adapter-pg` 7.10.0; the client generated by `pnpm generate`); the system actor (`User` role `SYSTEM`) seeded by the installer through `prisma db seed`; 9 tests as the services' own logins, each undone; three extension faults each caught. Chain 13 files, 115 tests.** A Prisma client extension that states the actor at the start of every write transaction.

### Milestone 0.4 — Prove it end to end ✅ done 2026-10-01 (ADR-275, 276, 281)
- [x] **0.4.1** ✅ **done 2026-09-30 (ADR-275): `packages/scenarios`, `pnpm scenarios` (`list`, `clean`, `--keep`); each story on its own `adms_story_…` database, locked down, migrated through `packages/db/prisma.story.config.js`, seeded, dropped afterwards; a story clock, simulated offline phones, a stand-in for the API's sync; story `ticket-101001` (14 checks). 12 tests; nine harness faults each caught. Chain 15 files, 127 tests.** Scenario harness: runner, a controllable clock, a simulated offline device, and one trivial story (REQ-017). Carry-forward C1–C3 done.
- [x] **0.4.2** ✅ **done 2026-09-30 (ADR-276): the system actor's guard (migration `guard_system_actor`: only the worker and the seed write as it or with source `SYSTEM`, no runtime login changes it, `SYSTEM` is one id and never a person; `installer:check` 20 ✓); `pnpm security` (`tools/security`): the dependency audit (3 Prisma-CLI advisories accepted by id), secretlint 13.0.5 plus the installation's own secrets and password-like settings, the env files, the grant tests; `migrations.test.ts`, `configuration.test.ts` (CIS), `system-actor.test.ts`. Twelve guard and five configuration loosenings each caught. Chain 19 files, 162 tests. `pnpm security` 6 passed, 1 failed: the historical root `docker-compose.yml` (KD-59), the user's to retire.** Security checks wired into the test run (REQ-018). **Before starting, read the carry-forward register below, items C4–C11; C4 (the system actor's guard) is in 0.4.2's scope at the user's word (ADR-274).**
- [x] **0.4.3** ✅ **done 2026-10-01 (ADR-281): three migrations (`monitor_number_issuer`, `dispatch_models`, `guard_dispatch_models`); `MasterPasscode`, `NumberBlock`, a provisional `DisposalSite`, `Assignment`; `Device` with its name, unique key, status and passcode version; `User` with an employer and a database-issued Monitor ID; `FieldEvent` with its assignment and setup version; `Project`'s time zone checked to be an IANA name; the master passcode's hash moved from `packages/db/.env` into the database, kept out of the audit log. Database tests 189 in 16 files; 39 loosenings each caught; story `dispatch-monday` (12 checks). Chain 23 files, 234 tests. C12–C15 and C37 done; C42–C47 filed.** Time zone, device, **assignment** and Monitor ID models (REQ-019…021; ADR-240).

### 📌 Carry-forward register: known later concerns (ADR-274)

Everything a Phase 0 ADR (255…273) left for later, filed under the task that picks it up. **Rule for
every agent:** at the start of a task, read its items and either do them, or say in the task's ADR why
each waits and move it to a later heading. At close-out, a new "later" in an ADR gets a line here in
the same response. An item leaves only when done (struck through, with its ADR) or re-filed; never
delete one.

**For 0.4.1, the scenario harness**
- ~~**C1. A database a story may leave rows in.** Nothing can be deleted, so a story can't run in the
  installation's own `adms` and clean up. ADR-272's mutation runs used a throw-away copy
  (`CREATE DATABASE <name> TEMPLATE adms OWNER adms_owner`; the owner must own it, or its owner's-rights
  triggers can't see the schema's types; no service may be connected to `adms` while it's copied).
  **Postgres doesn't copy a database's access list with its template** (seen 2026-09-30: a copy of
  `adms` had an empty list, the default, under which **anyone may connect**), so revoke `PUBLIC`'s
  connect and grant `CONNECT` to the logins on the copy, as the installer does for `adms` (its
  `publicCanConnect` check). Decide in the ADR who makes and drops the copy, and that a story never
  writes to `adms` itself. (ADR-272 (1), 273 (6))~~ **Done (ADR-275 (1)):** a new database per story from `template0`, locked down and checked, migrated and seeded, dropped afterwards; not a `TEMPLATE adms` copy.
- ~~**C2. Writes go through `@open-adms/db`**: `openDatabase` + `db.$write(actor, …)` as the services' own
  logins (URLs from `apps/*/.env`, never printed; the pattern and `ADMS_TEST_DATABASE` are in
  `packages/db/test/support/service.ts`), the worker as `systemActor`. Prisma's interactive
  transaction defaults to a **5 s timeout and 2 s wait**; `$write` passes no options yet. If a story or
  the worker needs more, add an options argument to `$write` in its own ADR, never a global raise.
  (ADR-273 (3))~~ **Done (ADR-275 (2)):** no story needed more than the default; the options argument still waits for the worker (C20).
- ~~**C3. Seed data for stories** (REQ-142) and the golden mission (`spec/golden/MISSION.md`) are Phase 1's;
  0.4.1's story stays trivial, from the example world (`spec/CONVENTIONS.md` §6).~~ **Done (ADR-275 (4)):** ticket 101001 only; the seed data and the golden mission stay Phase 1's (C30).

**For 0.4.2, the security checks (REQ-018; ARCHITECTURE §15, §16)**
- ~~**C4. The system actor can be claimed and changed by the API. User, 2026-09-30: make sure the API is
  unable to.** Today the database checks only that `adms.actor_id` is a `User` row (ADR-270 (4)), so:
  (a) `adms_api` can **state the system actor** (and source `SYSTEM`) on its own writes; (b) `adms_api`
  has UPDATE on `user`, so it can **rename it, change its role or archive it**; (c) nothing stops a
  **second `User` with role `SYSTEM`**; (d) the seed notices a change only on the next `pnpm installer`,
  and **`installer:check` doesn't look at the system actor at all**. Proposed, to be settled in 0.4.2's
  ADR and written as a guard migration in its `--create-only` stub (ADR-113), proven as ADR-272 did
  (each guard's removal caught on a throw-away copy):
  - the audit capture refuses `adms.actor_id` = the system actor's id
    (`00000000-0000-7000-8000-000000000001`) unless `current_user` is `adms_worker` or `adms_owner`
    (the seed), and refuses source `SYSTEM` from `adms_api`;
  - the system actor's `user` row can't be updated by any runtime login (a row trigger on `user`);
  - role `SYSTEM` only on that id (a check constraint: `role <> 'SYSTEM' OR id = '…0001'`);
  - `installer:check` gains a ✓ line for the system actor (the 20th); `adms-verify`'s counts follow;
  - **also decide:** may the worker state a person's id (a reprocess a person asked for), or only the
    system actor, with the person's request in `adms.reason` / `adms.request_id`? ARCHITECTURE §5.3 says
    "a real person, or the system actor for the worker"; don't restrict the worker without an ADR.
  - **A test to rewrite then:** `packages/db/test/actor.test.ts`, "the device it came from", states
    `systemActor` with source `DEVICE` through `adms_api`, only to prove the device id reaches the audit
    record. Under the new guard, write it as Ana Brooks on her phone: Dana creates Dana, Ana and the
    phone in one `$write`, the work then re-states the settings (a test-only `set_config`), then Ana's
    field event is written.~~ **Done (ADR-276 (1)):** the guard migration `guard_system_actor` (`writing_login()` in `audit_write`, the `user_system_actor` trigger, the `user_system_actor_check`); `installer:check`'s 20th ✓; `actor.test.ts` rewritten as asked. The worker may still state a person: Phase 1's worker decides (C20).
- ~~**C5. Migrations edited by a shell command.** The guard hook stops the Edit and Write tools from
  touching a migration unless it's still Prisma's empty stub, but **a `sed` or `python` edit isn't seen**
  (ADR-270 (8), flagged then). Add a test that each applied migration's `migration.sql` still matches
  its `_prisma_migrations.checksum` (the file's SHA-256; seen matching for `system_role`), so an edited applied migration fails
  the run.~~ **Done (ADR-276 (2)):** `packages/db/test/migrations.test.ts`.
- ~~**C6. Dependency audit** (`pnpm audit`, built in; the severity that fails the run is an ADR's call),
  beside `pnpm licences` (ADR-258: it "runs with the security checks"). Prisma Studio's `elkjs@0.11.1`
  and `@visx/vendor@4.0.0-alpha.0` are allowed by name and version (ADR-267): a Prisma upgrade makes
  them undecided again. Prisma 8 only when 8.x is stable, in its own ADR (ADR-267 (1)).~~ **Done (ADR-276 (3)):** every advisory fails unless accepted by id in `pnpm-workspace.yaml`; three accepted (C32).
- ~~**C7. Secrets scan**: its tool needs an ADR first (pinned, licence, at least 7 days old). It must
  **never print a secret it finds** (redacted output only). Expect it to find the historical root
  **`docker-compose.yml`** (KD-59: a plain-text password, Postgres on every interface at 5432).
  **Nothing is committed yet and that file is untracked**, so staging the whole folder would commit it;
  retiring it is the user's call: raise it. Check too that every `.env` file is ignored by git and
  untracked.~~ **Done (ADR-276 (4), (9)):** secretlint 13.0.5 in `tools/security`, with the installation's own secrets and password-like settings; the env files checked; `docker-compose.yml` raised with the user (KD-59, C27).
- ~~**C8. The grant tests** already run in `pnpm test` (ADR-272); REQ-018 wants them reported with the
  security checks, with real counts.~~ **Done (ADR-276 (5)):** inside `pnpm security`, counts reported.
- ~~**C9. CIS PostgreSQL Benchmark** for the database's configuration (ARCHITECTURE §16: "each phase's exit
  includes the checklist items for its layer"): pick the items that apply to the local stack's Postgres
  18.6 and the four logins, test what can be tested, list what waits for the cloud.~~ **Done (ADR-276 (6)):** `packages/db/test/configuration.test.ts`; the cloud's items filed as C33.
- ~~**C10. Connections (ARCHITECTURE §5.7)**: `openDatabase` sets only the pool size. **No statement
  timeout and no TLS yet.** TLS is required outside the local stack; the statement timeout (per login,
  `ALTER ROLE … SET statement_timeout`, or per connection) is a policy value in `.env`, never a literal.
  Decide in 0.4.2, or file it under the demo deploy (C25).~~ **Re-filed (ADR-276 (7)):** decided (a per-login statement timeout set by the installer from a policy value in `.env`; TLS outside the local stack) and moved to C34 (Phase 2) and C33 (the demo deploy).
- ~~**C11. The master passcode** is 8–128 characters with **no breached-list screening yet** (ADR-266;
  NIST SP 800-63B asks for it): Phase 2's sign-in at the latest; list it in 0.4.2's NIST/ASVS notes.~~ **Re-filed (ADR-276 (8)):** as C35 (Phase 2).

**For 0.4.3, the time zone, device, assignment and Monitor ID models (REQ-019…021)**
- ~~**C12. The master passcode's hash moves into the database** with the device model and its verifier
  version (REQ-020): the seed writes it (through `$write` as `systemActor`) and it leaves
  `packages/db/.env` (ADR-266, 273 (5)); the installer's re-check follows it.~~ **Done (ADR-281 (6)):** `master_passcode` (version, Argon2id hash; insert-only for the API, unreadable by the worker, kept out of the audit log); the installer hands the hash to the seed in memory; an earlier installation's copy is moved and the line removed; a lost database asks for the passcode again.
- ~~**C13. What already exists, provisional (ADR-268):** `Project.timeZone` (IANA); a field event's UTC
  instants, device offset and `receivedAt` (REQ-019 in part); `User.monitorNumber` (the Monitor ID);
  `Device` (public key, enrolled, out of service). Extend them; don't duplicate them.~~ **Done (ADR-281 (1)–(4)):** each extended in place.
- ~~**C14. Every new table**: its model in the right `.prisma` file by kind of record, a one-line
  `guard_table` guard migration (ADR-271), its grants added to the exact lists in `grants.test.ts` and
  `catalog.test.ts`, and **a deliberate row-level-security decision** (a table viewers see needs its own
  policy and view; `guard_table` doesn't do it). An evidence model that gains a column reruns
  `guard_table`.~~ **Done (ADR-281 (6), (10)):** three guarded in one line each, the master passcode with its own tighter guards, `field_event` rerun; no viewer sees any of the four, so no policy yet.
- ~~**C15. The system actor is never a person:** no assignment, device, Monitor ID or password for role
  `SYSTEM`; say so in the models (C4's guard may enforce it). *ADR-276 enforces the `user` part:
  `user_system_actor_check` (no Monitor ID, no contractor on role `SYSTEM`); the device and assignment
  models add theirs (no assignment or device for the system actor).*~~ **Done (ADR-281 (3), (4), (8), (9)):** checks on `assignment`, `field_event` and `user` (no employer); a device links to no person. The password is Phase 2's (C21).
- ~~**C37. Does `Device` carry a details column?** (ADR-278) The promo graphic claims "device
  metadata" as flexible data; `Device` holds only a public key and two dates today. Decide with the
  device model: what the phone reports about itself, if anything, and whether it's fixed columns or
  one JSONB details column. If JSONB, ADR-278 (1) holds: nothing the engine, a rule or a flag reads.
  Fields from `adms-field-app` and ARCHITECTURE §7; never invented.~~ **Done (ADR-281 (4)):** no details column; no rule has a phone report anything but its key and, at a sync, its clock.

**For `spec/DATA-MODEL.md` (0.2b.2) and Phase 1** — *2026-10-01: the draft (ADR-284) answers C16–C19, C29, C36 and C42–C44 on paper (its §12); each stays here until Phase 1 builds it.*
*2026-10-01 (ADR-300), Phase 1 open: the task that picks each up: C36 → 1.1.5 (the definition), 1.3.6 (the answers); C42 → 1.1.5, 1.1.6, 1.1.7; C52 → 1.1.7 (setup) ✅, 1.5.6 (the flags); C18 → 1.1.10, 1.7.1; C43 → 1.3.2; C44 → 1.3.3; C16 → 1.5.2, 1.7.1; C50 → 1.5.8; C20 → 1.5.9; C17 → 1.7.1, 1.8.2; C19 → 1.8.2; C29, C30 → 1.9.1; C51's two scenarios → 1.9.2; C28 → 1.9.3; C31's stand-in → 1.4.2. Filed since (ADR-303, 305; added here by ADR-307): C53 →
1.1.11, 1.5.5 (and Phase 2); C54 → 1.1.10; C55 → 1.5.5, 1.5.7; C56 → 1.2.3. Filed by ADR-311: C57 → 1.1.11, 1.5.6. Filed by ADR-313: C58 → 1.1.11, 1.6.1, 1.6.4. Filed by ADR-315: C59 → every schema task, 1.2.3, 1.3.3, 1.7.1, Phase 2.*
- **C36. The storage shape of the firm's added fields** (ADR-278, at the user's word): a versioned
  form definition per record kind, one JSONB answers column per record keyed by field ID plus the
  definition version, a schema generated from the definition in `packages/contracts`, Prisma's `Json`
  type, audited like any field; nothing the engine, a rule or a flag reads lives in JSONB. The draft
  settles the model and field names, the guard for the definition's versions (never edited or
  deleted) and how exports name the columns; it may overturn the details, with an ADR.
- **C16.** Every model and field is provisional (ADR-268). `CompletedLoad` links one collection (a split's
  several are DATA-MODEL's); `CompletedHaulOut` is still to come; `Transaction` lacks pay item, rule,
  contract and operating sub.
- **C17.** A transaction **insert** on an invoice-locked load isn't refused by the database (it's the
  worker's "regenerate only un-invoiced tickets", ADR-090); unlocking needs an unlock column, since an
  `InvoiceLock` can't be deleted (ADR-270 (6)).
- **C18.** Field events and completed loads carry no contractor yet, so **a contractor viewer sees none
  of them** (fail closed); a prime's view of its subs' transactions comes with the operating sub
  (ADR-270 (7)).
- **C19.** Where a person's **void** is recorded (the status column is the worker's today; ADR-270 (2)).
- **C29. Times the database stamps itself** (`audit_record.occurred_at`, `created_at`, `enrolled_at`) use its own clock, not the story's (ADR-275): a story asserts the audit log's order, not its times. If the golden mission must assert them, decide then (e.g. the API stating the time it writes).
- **C30. The golden mission as a story** (REQ-017 stays open until it runs; REQ-142, REQ-143): its setup, days, reviews, ledger and audit rows asserted exactly; the worker's writes through the `worker` client as `systemActor`; add stories to `packages/scenarios/src/stories/index.ts`.
- **C42. The assignment's forms; the real pay item and site** (ADR-281 (8)). **The site done
  (ADR-311)**; what is left is a field event's own site and a contractor's kind (below). ~~REQ-020's "work: … unit rate
  pay items"~~ **done (ADR-286): a provisional `PayItem` (project, code, name; since ADR-301 its code is unique on its project and it has a description, not a name) and `AssignmentPayItem`;
  REQ-020 ticked.** ~~The forms an assignment names~~ **done (ADR-308): `formDocumentTypes`, held to
  ROEs, surveys, incidents and drop-off logs.** ~~`PayItem`'s real fields and its rate per prime
  (REQ-102, DATA-MODEL §3); the check that a named pay item is a unit rate one~~ **done (ADR-309):
  every field, a rate per prime, and a three-column foreign key that names only a unit rate pay
  item.** ~~`DisposalSite` is
  provisional (project and name): its site type, facts, permit, GPS, area and dates are DATA-MODEL's~~
  **done (ADR-311).** Still to come: a field event's own site (each record keeps the site it was made at, ADR-195). A
  contractor's kind (hauler, monitoring, crew, other; Q-97) comes with `Contractor`'s real shape.
- **C43. Numbering** (ADR-281 (5)): `NumberBlock` holds only a block's range, last used number and
  how it ended. Still to come with tickets and numbers: the project's series and control ranges, the
  allocator (the server is the only one, ADR-065), **a database refusal of overlapping blocks** (an
  exclusion constraint; **`btree_gist` is in since ADR-310**, in the schema `extensions`, so no ADR
  of its own is needed: `pay_item_bands_never_overlap` is the idiom), which block an ROE's number comes
  from (ADR-181), and where a firm's Monitor ID series starts if it isn't `M000001`.
- **C44. Back-office-created field events** (ADR-156; ADR-281 (9)): they have no phone and no
  assignment, so `FieldEvent.deviceId`, `assignmentId` and `setupVersion` become optional for them (with
  a check that a phone's record still carries all three). The engine flags an event whose project
  differs from its assignment's (the database doesn't refuse it).
- **C50. What the worker asks the map servers, and where the answer is kept** (ADR-282 (11); REQ-126f):
  Valhalla's request for "the shortest route on public roads open to ordinary traffic" (`shortest`,
  and how private roads are left out, ADR-163), the snap to the nearest road (`locate`), Nominatim's
  reverse lookup of the snapped point; each mileage stored with the map data's date and the extract's
  hash (DATA-MODEL §5). The golden mission's GPS points come from the pinned extract (with C30): the
  example world's Bayline County is made up, and its roads stand in from Delaware's until the user
  names another region.
- ~~**C51. Split haul-outs have no requirement and no golden-mission ticket** (ADR-295). The rule is
  recorded (`adms-ticket-workflows` §4.4a, `adms-validation` §5.5, DATA-MODEL §5) with an example
  (ticket 201004), but `REQUIREMENTS.md` has no REQ for it and `spec/golden/MISSION.md` covers
  only an ordinary haul-out. With Phase 1's milestones: add the REQ beside the split-load ones, and
  propose a split haul-out for the mission (the user signs off its numbers; never invent coverage).~~
  **Done (ADR-296, 297):** REQ-111a and REQ-120j; golden mission ticket 201004, weighed at the
  user's word (three piles, 24.00 tons at Cypress Creek Landfill, three lines, $480.00; P1's ledger
  $5,548.25 on 19 lines); **the mission is approved, numbers included (ADR-297).** **Left for the
  tasks that pick them up:** **two acceptance scenarios** for `spec/acceptance/`, since neither is
  in the mission: a split haul-out paid by the CY (the same piles dumped at Bayline County Landfill:
  11.0, 27.5, 55.0 CY, six lines, $850.85) and a pile whose call isn't higher than the one before
  (`PILE_CALL_NOT_HIGHER`); as a story (C30), the haul-out phone's numbers run 201001 then 201004
  (201002 and 201003 are the flag catalogue's examples), which a story states itself, as today's
  stories do, and the story seeds the mission's second landfill, its per-ton pay item and its sixth
  monitor (`spec/CONVENTIONS.md` §6).
- **C52. *Haul-outs leave here* only on a TDSR/DMS site** (ADR-298). **Setup half done (ADR-311):**
  the database refuses it too, and refuses changing a marked site's type (`siteTypeKey`, a check);
  `SiteFacts` says so in setup. The two flags are 1.5.6's. With `DisposalSite`'s real
  model (C42): setup refuses the mark on any other site type and refuses changing a marked site's
  type; decide whether the database refuses it too (the type is a list row acted on by its fixed
  key, so a plain check constraint can't see it; a guard needs its own migration and test). An
  acceptance scenario: a haul-out that left a landfill is flagged `SITE_NOT_FOR_HAUL_OUTS`; one
  dumped back at the TDSR it left is flagged `HAUL_OUT_DUMPED_AT_TDSR` and not priced.
- **C53. Where a server app reads the policy values, and whether an installation may override one**
  (ADR-303 (3)). The release's built-in defaults are `packages/domain/policy.env`; today only the
  scenario harness reads it (`packages/scenarios/src/policy.ts`). **Task 1.1.11:** the API's setup
  service that creates a project takes the `Policy` (the harness hands it over; the loader moves
  beside the service). **Task 1.5.5:** the worker's own thresholds (ARCHITECTURE §10: the clock
  difference at a sync, and the time checks) join `policyNames` and `policy.env`, each with its ADR.
  **Phase 2, with the API's configuration:** decide whether a value of the same name in a service's
  own env overrides the built-in default for the installation, and have `installer:check` report
  the values in force.
- **C54. ✅ done (ADR-315): a client user and an auditor see the whole setup, a contractor user none; the table is `user_viewer_project`.** ~~A viewer and the project's setup~~ (ADR-303 (5)). Task 1.1.10: what a client user, a
  contractor user and an auditor see of `client`, `declaration_event`, `project_kind_of_work` and
  the project's new columns (the viewer view shows five columns today), each with its
  row-level-security decision. **The model `ViewerProject` can't take the table name
  `viewer_project`: that is already the project's viewer view** (the row-level security guard,
  ADR-270); 1.1.10 names its table otherwise (`@@map`) and says so in `spec/DATA-MODEL.md`.
- **C55. Two REQs this plan said 1.1.3 ticks, left open** (ADR-303 (8)): **REQ-105d** is ticked
  with task 1.5.7 (the ROE flags a program type's *Requires ROE* drives); **REQ-105j** with task
  1.5.5 (the "project not active" flag, which that task already names).
- **C56. What a contractor merge moves, and who names a prime next** (ADR-305 (2), (4)). **Task
  1.2.3:** a sub typed in at certification is written as a `ProjectContractor` row under its prime
  (`subOn`'s shape: tier 1 or 2, `primeId` the prime at either tier; which tier 1 a tier 2 works
  under is the certification's `firstTierSubId`); decide there what merging two spellings of a sub
  does to the duplicate's place on each project and to the certifications that name it (today only
  the link exists: `mergedIntoId`, never itself, the merged row archived), and whether a merge into
  an already-merged contractor is refused; **REQ-106e is ticked there**, not before. **Tasks 1.1.6
  and 1.2.3:** `PayItemRate.primeId` (✅ built, ADR-309) and `Certification.primeId` point at the same key as a
  contract's prime, a two-column foreign key to `project_contractor (project_id, as_prime_id)`, so
  a rate or a certification can't name a contractor that isn't one of the project's primes.
  **Task 1.1.11:** the API's setup service is the one place that adds a prime to a project and
  writes `asPrimeId` with it. **Task 1.1.10 (C18):** a prime's sight of its subs' tickets reads
  `project_contractor`; and whether any read-only viewer sees a contractor's contact details
  (ADR-306; ADR-169 keeps personal phone numbers from them).
- **C57. Reading a shape, its bounding box, and point-in-polygon** (ADR-311 (6)). The database
  keeps a GeoJSON `Polygon` or `MultiPolygon` and four bounding-box columns, and checks only that the
  shape holds its type and coordinates and that the box is on the earth; **whoever writes a shape
  works out its box**. **Task 1.1.11** (the setup story through the API's services, which load P1's
  map): a `packages/domain` reader that takes a GeoJSON geometry, Feature or FeatureCollection,
  refuses anything but closed polygon rings in WGS84 ranges, merges features of one zone name into a
  MultiPolygon, and gives the bounding box (no dependency, or one pinned by an ADR). **Task 1.5.x
  (the zone and site-area checks):** point-in-polygon in the same module, a point on an edge
  inside (ARCHITECTURE §3), the box as a quick first test. A shapefile, KML and an Esri layer link
  are REQ-124b's import in the back office (Phase 4), with their libraries' ADRs.
- **C58. What the rules' build left for later** (ADR-313 (8), (10)). **Task 1.1.11** (the setup
  story through the API's services): the service that saves a rule calls `ProjectRules.check` first
  and saves nothing on a refusal; the pay item service matches `PaysWhen.rules(…)` to the rules the
  pay item already keeps (change, add, archive), and gives each picked value its `gone` (archived,
  or a zone name the current map lacks). **Task 1.6.1** (the engine): an *Item* line compares the
  count of its one picked item, IS EMPTY / IS NOT EMPTY ask whether the ticket lists it; the same #
  added twice by one rule is flagged like two rules adding it. **Task 1.6.4** (the setup check):
  decide what an archived pay item, contract or form does to a rule that names it (`spec/RULES.md`
  §7 speaks only of a criterion's value), and list it.
- **C59. What the viewers' build left for later** (ADR-315 (1), (2), (3), (8)). **Every later
  schema task:** a new table a client user or an auditor should see gets `SELECT guard_viewer(…)`
  in its guard migration and a row in `packages/db/test/support/viewers.ts`; one nobody should see
  goes in that file's `unseenTables`; a viewed table that gains a column reruns `guard_viewer`.
  **Task 1.2.3** (certifications): a certification's viewer sight, without the driver's licence
  number (AC-02-71's other half). **Task 1.3.3** (field events in full): who recorded a ticket, by
  name and Monitor ID, for a client user and an auditor (no viewer reads `user` today), and the
  ticket's viewer view in its real shape. **Tasks 1.2.3 and 1.7.1** (C18): what a contractor user
  needs of setup to read its own tickets and transactions (a debris type's, a site's, a pay item's
  name), and a prime's sight of its subs' through `project_contractor`; it sees no setup today.
  **Phase 2:** the API states `adms.viewer_id` on every `adms_readonly` request (C22); it reads a
  manager/analyst's permissions that aren't archived, and only on a manager/analyst (the database
  doesn't tie a grant to a role); it never gives a viewer a project or a kind the admin didn't.
- **C20.** The worker's one transaction per group, one run per project, and flagged-and-skipped groups
  (REQ-015, KD-55) use one `$write` per group (ADR-273 (3)).

**For Phase 2 (API, worker, apps) and the demo deploy**
- **C21.** Sign-in refuses role `SYSTEM`; the system actor never gets a password (ADR-273 (4)). A
  password hash or an authenticator secret on `user` is named on its audit trigger, so it's kept out
  of the audit log as the master passcode's hash is (ADR-281 (7)).
- **C22. Nothing states the viewer yet.** `$write` states the actor; the read-only portal must state
  **`adms.viewer_id`, the viewer's own id** (since ADR-315; no longer their projects and contractor,
  which the database now reads from their record) on every `adms_readonly` request, from one
  shared place like `$write` (ADR-270 (7)). Unstated, a viewer sees nothing.
- **C31. The sync stand-in goes** (ADR-275 (3)): `packages/scenarios/src/intake.ts` writes straight through `$write`; once the API's sync endpoint exists, stories sync through it (duplicates, quarantine, the idempotency ledger). The UUIDv7 maker (`packages/scenarios/src/ids.ts`) moves to `packages/domain` when the field app needs it, so phone and harness share one.
- **C45. Who the API states for an act under the master passcode** (ADR-281 (11)): enrolment, creating
  a monitor, and an unplanned assignment are done by whoever holds the passcode, which isn't a user;
  `$write` needs a `User`. Decide with Phase 2's device endpoints (the stories state an admin for
  enrolment and the monitor for the unplanned assignment), and log every use as a security event
  (ARCHITECTURE §7.5).
- **C46. Times a phone makes besides a field event's** (ADR-281 (11); REQ-019): an unplanned
  assignment, a monitor switch, a site move, a clock entry carry the phone's instant, its offset and
  the server's received time, in the sync contract; the manifest's numbering behind
  `FieldEvent.setupVersion` is the sync's too.
- **C47. A device key's revocation** (ARCHITECTURE §7.4; ADR-281 (11)): once a lost or retired phone
  has synced, been confirmed and wiped, its key is revoked and the server refuses it; `Device` has no
  column for that yet (**built, ADR-315: `keyRevokedAt`, only on a phone out of service; the refusal is still Phase 2's**). The same goes for changing the master passcode from the back office (a new
  `master_passcode` version) and each phone's `masterPasscodeVersion` moving at its next sync.
- **C23.** `ADMS_TOKEN_SIGNING_SECRET`'s use is Phase 2's (ADR-266); OpenAPI from the Zod schemas comes
  with the API (ADR-261); the server apps add `@types/node` when they get real code (ADR-256).
- **C24.** Media: the object store's CORS allow-list widens when the web apps arrive; the API's S3
  identity never gets bucket-delete (ADR-263). The API and web apps get their own `*.adms.localhost`
  hostnames.
- **C48. The demo deploy's map servers** (ADR-282 (11), 287; REQ-517): Valhalla and Nominatim in the
  demo, each with the project region's extract, **private to the API and the worker** (neither has
  any sign-in of its own), TLS between them; Nominatim's own Postgres stays closed as the local
  wrapper leaves it. A machine sized for the region: the address import of a whole state needs far
  more disk and memory than the local Delaware one (about 350 MB).
- **C49. The rest of Q-166, map data for each region** (ADR-282 (11)): several regions in one
  installation (a firm with projects in Florida and Texas); how a firm names its region at install
  (today two settings, `ADMS_MAP_EXTRACT_URL` and `ADMS_MAP_EXTRACT_SHA256`); refreshing to a newer
  dated extract without changing a billed mileage; the back office's base map file (ARCHITECTURE §3,
  Phase 4). The local stack's Docker disk must fit the images (2.5 GB) and the import.
- **C33. CIS items for the cloud's Postgres** (ADR-276 (6)): TLS to the database required; connection and disconnection logging with a log line naming user and database; pgAudit; the server's file permissions and patch level (a managed Postgres's own). Tested in the demo deploy's own checks.
- **C34. A statement timeout per login** (ADR-276 (7), was C10): the installer sets `ALTER ROLE … SET statement_timeout` for `adms_api` and `adms_worker` from a policy value in `.env` (never a literal), when the services have their settings; `installer:check` checks it; `configuration.test.ts` asserts it.
- **C35. Breached-password screening** (ADR-276 (8), was C11; NIST SP 800-63B, OWASP ASVS 5 V6): the master passcode and every password a person sets, at Phase 2's sign-in at the latest.
- **C25.** The installer extends to the demo deploy (Railway), which runs `migrate deploy` and the seed,
  never `migrate dev` or the shadow database (ADR-266, 268).
- **C38. Operations monitoring** (ADR-279; the plan is silent). *Have:* structured logs with a
  request ID (ARCHITECTURE §6), security audit events for sign-ins and device setup (§6), the local
  health page (ADR-264). *Missing:* how a running installation tells its firm something is wrong:
  health checks for the API, the worker and the job queue; error reporting; alerts (e.g. the worker
  stalled, jobs backing up, sync failing, a backup failing, storage or the database filling); what's
  measured. *Raise:* with Phase 2's API and worker; proven in the demo deploy. It must work with a
  firm's own tools and need no outside service (the firm installs and runs it, ADR-197).
- **C39. Availability** (ADR-279; the plan is silent). *Have:* phones work offline and sync later, so
  field capture survives a server outage (ADR-030); server backups with point-in-time recovery and
  rehearsed restores, the object store versioned or replicated (ARCHITECTURE §4). *Missing:* what
  happens to the back office, sync and the worker when the database or the API goes down: a standby
  or failover, restarts, and the targets (how long down, how much lost), which are policy, never
  literals. *Raise:* with the demo deploy (C25) and the installer's cloud steps.
- **C40. Independent security testing** (ADR-279; the plan is silent). *Have:* the checklists each
  phase tests against (ARCHITECTURE §16), `pnpm security` (ADR-276). *Missing:* (a) a written threat
  model over the layers of ARCHITECTURE §2, before Phase 2's API is built; (b) a penetration test by
  someone outside the build, once the API, sync and web apps run in the demo deploy and before a
  firm's first live mission; (c) how a vulnerability is reported and a fix reaches installations (a
  root security policy file, the user's to approve like the README; ties to upgrades, Q-167), before
  the repository is public.

**For Phases 3–4 (the field app, the back office and the read-only portal)**
- **C41. Accessibility** (ADR-279; the plan is silent). *Have:* every screen translatable from day
  one (ADR-172). *Missing:* a named standard and level for the web apps and the field app, how it's
  checked (e.g. automated checks beside the browser end-to-end tests, ARCHITECTURE §15), and whether a
  conformance statement ships; public clients commonly ask for one in procurement. *Raise:* before the
  first screen is designed, so it's built in, not retrofitted; the standard is the user's to pick.

**Housekeeping, any time**
- **C26.** pnpm 12 when the global pnpm is 11+; Node 26 once it's LTS (ADR-255).
- **C27.** ~~KD-59: the historical root `docker-compose.yml`~~ **retired by the user, with its volume, 2026-10-01 (ADR-291; `pnpm security` 7 passed, 0 failed).** Left, harmless: the `.gitignore` section for `database/`, the user's to drop. *History:* the file and the `.gitignore` sections for `database/`
  and the placeholder folders were the user's to retire (see C7). **2026-09-30 (ADR-277):** its
  container is stopped (the user ran `compose down`); left: the file, its data volume
  `debrismonitor_kiro_postgres_data` (created 2026-09-23, the historical database's data), and an
  unattached anonymous volume (`428a2944…`, an empty object-store folder from a throw-away container
  an agent ran on 2026-09-30, 428 KB); removing volumes needs the user's go-ahead. **2026-10-01 (ADR-281):** that anonymous volume is gone and the stack was down at the start of the session (`docker volume ls`: only the local stack's four volumes and `debrismonitor_kiro_postgres_data`).
- **C32. The accepted audit advisories** (ADR-276 (3)): `GHSA-ggr8-5vv4-36mx` (`deepmerge-ts` 7.1.5), `GHSA-3f6p-5ww8-9rcr` and `GHSA-rgwj-5xj2-c3m3` (`mysql2` 3.15.3), all in the Prisma CLI 7.10.0. At every Prisma upgrade: run `pnpm audit`, drop each id the upgrade fixes from `pnpm-workspace.yaml`, and say so in that upgrade's ADR. Also secretlint's seven dev-tool licences, allowed by exact version (ADR-276 (10)): a secretlint upgrade makes them undecided again.
- **C28. `pnpm installer:teardown` doesn't know story databases** (ADR-275): one left behind (a killed
  run, or `--keep`) is owned by `adms_owner`, so teardown's `DROP ROLE adms_owner` fails. Teardown
  should drop `adms_story_…` databases first (or stop and name `pnpm scenarios clean`).

---

## Historical — Phase 1 closeout on `database/` *(superseded by ADR-093/103; kept as rebuild requirements)*

> Its milestones and tasks are numbered **H1.x** (relabelled 2026-10-01, ADR-300) so they are never
> taken for Phase 1's milestones 1.0…1.9 above. They belong to the historical code (ADR-093) and are
> kept as the list of behaviours and lessons the rebuild must satisfy, **not** as work to do.

### Milestone H1.1 — Baseline verification (do this first, every session on a fresh clone)
- [ ] **H1.1.1** `docker compose up -d`; confirm the Postgres healthcheck passes.
- [ ] **H1.1.2** `cd database && npm install && npm run db:migrate` — confirm all migrations apply clean.
- [ ] **H1.1.3** `cd database && npm run typecheck` — confirm zero errors.
- [ ] **H1.1.4** `cd database/python && python -m pytest tests/ -v` — confirm 71 pass. Record the
      real number; if it differs from 71, update this file and note why.
- [ ] **H1.1.5** `cd database && npm run db:seed`, then `curl http://localhost:8001/health` with the
      engine running — confirm end-to-end reconciliation produces both matched and failed tickets.

### Milestone H1.2 — Close the known deviations
Each of these is a real gap between the domain skills and the code, tracked in `agent_store/DEVIATIONS.md`.
Do **not** start one without reading its Known Deviation entry first.

- [ ] **H1.2.1** **KD-01 — reconciler writes no `Transaction`.** The engine sets tickets to
      `MATCHED` and writes `LoadTicket` / `HaulOutTicket`, but nothing ever writes the financial
      ledger row. `transactionService.createTransaction` exists and is never called from the
      reconciliation path. Decide and implement the write path (Python direct vs. Node callback),
      record the decision as an ADR, and cover it with a DB integration test.
- [ ] **H1.2.2** **KD-02 — `_validate_disposal` has an inconsistent return type.** It returns
      `list[ValidationError]` on its two early returns (`CERT_NOT_FOUND`, `SITE_NOT_FOUND`) but
      the tuple `(errors, cert)` on the normal path. `reconcile_load_pair` papers over this with an `isinstance` check. Normalise to
      a single return shape and delete the workaround.
- [ ] **H1.2.3** ⚠️ **Moot if the Q-13 status proposal is accepted** (every engine failure → review). **KD-03 — haul-out escalation set differs from the load workflow.**
      `ROUTE_DRIFT_EXCEEDED` softens to `MANUAL_REVIEW` in `reconcile_load_pair` but hard-`FAILED`s
      in `reconcile_haul_out_pair`. Confirm with the user whether this asymmetry is intended
      policy; either document it as intentional in domain-skill terms via an ADR, or unify it.
- [ ] **H1.2.4** **KD-04 — haul-out failures write no audit record.**
      `reconcile_load_pair` calls `_audit_recon_failure` for both halves; `reconcile_haul_out_pair`
      and `reconcile_unit_rate` do not. Invariant 3 says every mutation is audited. Fix.
- [ ] **H1.2.5** **KD-05 — `_audit_recon_failure` hard-codes `"FAILED"`** in its `newValue` payload
      even when the actual outcome was `MANUAL_REVIEW`, so the audit trail misreports the status.
      Pass the real status through.
- [ ] **H1.2.6** **KD-06 — orphan disposals are invisible.** The load cycle iterates collections
      only, so a `DisposalTicket` with no matching collection stays `PENDING` silently forever.
      Per the `adms-exceptions` skill §4.3 that is a fraud signal. Surface it in the `ReconcileResult` summary.

- [ ] **H1.2.7** **KD-10 — cert numbers.** ⚠️ **Reframed by ADR-045 (2026-09-24):** a supplied number
      from pre-printed certification paper is valid; uniqueness is `@@unique([projectId, certNumber])`;
      add a system issuer for when none is supplied, and don't reject supplied numbers. Text below
      predates that. Per ADR-016 the cert number
      *is* the placard number and must be issued by the system like a ticket number. Today
      `certificationService.ts` takes it as caller-supplied free text and `BaseCertification`
      has no `@unique` on it — so two certifications can share a number and the reconciler
      would happily pair tickets from two different containers. Add a `generateCertNumber()`
      in `database/src/lib/`, issue it inside both cert create paths, add the unique constraint
      via `npm run db:migrate`, and update `scripts/run_test.ts` (which currently hand-authors
      `"CERT-TRK-001"` style values). **Decide and record in an ADR:** the number format
      (short human-legible like `10090`, per the `adms-ledger-audit` skill §6.3) and whether uniqueness is
      global or per-project.
- [ ] **H1.2.8** **KD-11 — `ContainerType` cannot express real configurations.** `SELF_LOADER |
      TRAILER` does not cover a tandem dump truck, a pickup pulling a trailer, or an integral
      built-in bed (the `adms-certifications` skill §3A.1). **Blocked pending a user decision on the taxonomy** —
      do not guess at enum values. Resolve before Phase 3 builds a picker against it.

- [ ] **H1.2.9** **KD-13 → KD-12 — re-base pairing on the ticket number.** One change, in order:
      (a) make the generator emit a bare number (no `COL-`/`DIS-` prefix, no date — ADR-046) and call it **only** on the
      collection-side creates — `CollectionTicket`, `HaulOutCollectionTicket`, `UnitRateTicket`;
      (b) make `createDisposalTicket` / `createHaulOutDisposalTicket` **accept** the scanned
      number rather than generate one; (c) replace `_find_disposal_match` /
      `_find_haul_disposal_match` with grouping by `ticketNumber` over the queue; (d) keep cert /
      zone / debris / timing as **validation** on the grouped pair (§5.1), and add the explicit
      `TICKET_TYPE_MISMATCH` check that the composite match used to make implicit.
      ⚠️ **Revised by ADR-062:** the constraints change from global `@unique` to
      `@@unique([projectId, ticketNumber])` (KD-43) — still what rejects a duplicate at sync, now per
      project. Reconciled records carry the load's own number (no `LDT`/`HOT`); labels are display only.
- [ ] **H1.2.9a** **ADR-022 — quarantine rejected sync payloads.** A duplicate-number insert must
      persist the rejected record in full with its rejection reason and the id of the record
      holding the number, surface it in a review queue, and **never** acknowledge it to the device
      as saved. Silently dropping it destroys evidence of real work and permanently unbills a
      legitimate load. Needs a quarantine model — flag the schema addition before building it.
- [ ] **H1.2.10** **Duplicate and orphan shapes (the `adms-exceptions` skill §4.3a).** Cover the table at the
      end of §4.3a with tests: duplicate disposal (canonical), duplicate collection (escalate —
      an issuance defect, not a keying slip), ageing collection orphans, and disposal-with-no-
      collection (strongest fraud signal — never auto-resolve). A 3+ group in the queue should be
      unreachable under ADR-021; assert that, and if one is ever seen, route every member to
      `MANUAL_REVIEW` and bill nothing.
- [ ] **H1.2.11** ⚠️ **Widened by ADR-051:** any captured field is correctable, not only the number —
      see H1.2.21. **Reviewer ticket-number correction (ADR-020).** The one permitted post-submission
      field change. Service function, `MANUAL_REVIEW`-only, rejects `MATCHED`/billed tickets,
      writes an `AuditRecord` under the **reviewer's** user id retaining the prior number, and
      returns the affected records to `PENDING` for the next sweep. Must not be callable to edit
      any other field.
- [ ] **H1.2.12** **KD-15 — silent no-op rules.** Evaluate rules for `HAUL_OUT_DISPOSAL`. Then
      **decide** what `LOAD` / `HAUL_OUT`-targeted rules mean — run them post-pairing against the
      joined record, or reject the type at rule creation. Accepting a rule and never running it is
      not an option; add a test asserting every `TicketType` a rule may target is actually reached.
- [ ] **H1.2.13** **KD-14 — project-enabled ticket types.** Add the `Project → TicketType` relation
      per ADR-018 and the First Principles model, enforce it at ticket creation in
      `ticketService.ts`, and constrain rule authoring to the enabled set.

- [ ] **H1.2.14** **KD-16 — split the org model.** Per ADR-023/024: add `DeclarationEvent`
      (event name + flexible `declarationRef` like `DR-9001-FL` + reference type + incident
      dates), add `programType` to `Project` (`ROW | PARKS | PPDR | WATERWAY`), and derive
      `requireRoe` from `programType` instead of carrying it on `Program`. ⚠️ **This is a
      migration, not a rename** — `Project.programId` and `Transaction.programId` both reference
      `Program` today. Update `referenceDataService`, the seed, and any Python query touching
      `Program`. **Blocked on KD-17** (the enum value set). Event scoping is **settled** — per ADR-026
      `DeclarationEvent` is a shared global object, so today's FK shape (`Project.clientId` +
      `Project.programId`) is already right: `Program` becomes `DeclarationEvent`, `programType`
      moves onto `Project`.
- [ ] **H1.2.15** **KD-17 — confirm the `ProgramType` value set.** User-confirmed: `ROW`, `PARKS`,
      `PPDR`, `WATERWAY`. `CPDR` and `DEMOLITION` have reference-doc support. §3.1a now carries a
      fuller proposed set grouped by disaster context (hurricane, flood, wildfire, common,
      man-made/mass-casualty) — all still **proposals**. **Do not populate the enum unilaterally**;
      a wrong value set propagates into ROE logic, rule authoring and field-app project setup.
- [ ] ~~**H1.2.15a**~~ ⚫ **Dropped — ADR-052:** incidents never stop work; no holds. **KD-21 — stop-work holds.** ⚠️ **Do not build from the notes in §3.1a.** The
      human-remains protocol halts an *area*, not a record, and the requirements vary by
      jurisdiction, contract and event type. Get the governing protocol from the user first.
- [ ] **H1.2.16** **KD-18 — add reference-data update paths.** Per ADR-025 reference data is
      legitimately editable. `referenceDataService` has create/archive but no update, yet the
      primary flow is *select an existing client and update its contact details* (ADR-023). Add
      audited `update*` functions for `Client`, `Contractor`, `Contract`, `DisposalSite`. Keep
      soft-archive; add no delete path. Do **not** extend this to tickets or certifications.
- [ ] **H1.2.17** **Enforce ROE by program type.** ⚠️ **Revised by ADR-052/055: flag, never block.** Once
      `programType` exists, a ticket on a project that requires ROEs is **flagged for review** after
      reconcile when its ROE is missing, unsigned or out of scope. (Original: must block ticket creation against a parcel with no signed ROE.) Today
      `Program.requireRoe` is stored and never enforced anywhere in `ticketService.ts` — the same
      silent-no-op class as KD-15.

- [ ] **H1.2.18** **KD-19 (reframed) — group on the BASE ticket number.** Per ADR-032/033 splits
      are N collections → 1 disposal for PPDR/ROE work, each with a distinct suffixed number, so
      **there is no uniqueness conflict** — do not change any `@unique` constraint. The work is
      the grouping rule: strip any `-A`..`-Z` suffix to form the group key, accept N collections
      (N≥1) + exactly one disposal, require split members to share cert / debris type / zone, and
      route ambiguous shapes (two disposals on a base, suffix gaps, orphan chains) to
      `MANUAL_REVIEW`. Test a 5-member chain end to end.
- [ ] **H1.2.18a** **KD-22 / KD-23 — per-property attribution on splits.** Add
      `monitorEstimatedCy` and `roeId` to `CollectionTicket`. The estimate is an **observation**,
      so it is immutable after submission (invariant 5) — unlike apportioned tonnage. Make the
      field conditional on `programType` requiring ROEs (ADR-024) once KD-16/17 land. Then add the
      cross-check: `Σ estimates` vs `capacity × load call`, tolerance from `.env`, divergence to
      review.
- [ ] **H1.2.18b** **KD-24 — scale receipts.** ⚠️ Read §4.3a *When does a scale receipt exist at
      all?* first — most loads legitimately have none, and validating unconditionally would fail
      the majority of honest work.
      **(a) Conditionality (ADR-036):** a TDSR load never has one; an FDS load has one only if the
      contract asks. Add the scale-required flag to `PayItem` and the `SCALE_NUMBER` rule
      condition (ADR-037) — tested on a **grouped pair**, never blocking pairing, missing-when-
      required → `MANUAL_REVIEW` not `FAILED`.
      **(b) Model (ADR-034):** `ScaleReceipt` with the external number stored verbatim, unique per
      project, referenced by N disposal tickets. Name it **receipt**, not ticket — it must never
      be confusable with `ticketNumber`. Gross/tare/net optional, because many receipts carry only
      a number.
      **(c) Apportionment (ADR-035):** by load-called volume, server-side, deterministic, observed
      and derived stored separately, `Σ apportioned` equal to the net exactly. Only reachable when
      a weight actually exists.
      **(d) Cases:** cover the §4.3a table — net = 0 valid when optional and invalid when required,
      tare/gross configuration mismatch rejected rather than computed, two debris types on one
      receipt voided by default, duplicate receipt numbers (transcription, not scanning).
      Tons-per-CY factors are **configuration** — do not invent values.
- [ ] ~~**H1.2.19**~~ ⚫ **Dropped — ADR-053:** no grace period, no ageing. **KD-20 — age-based orphan detection, in field time.** Per ADR-029/030, add a
      configurable grace period computed from `loadEndTime` / `disposalStartTime` — **never from
      server `createdAt`**, which under EOD sync is an accident of which tablet found signal
      first. Surface only aged unpartnered tickets; `PENDING` is never alerted on directly.
      Threshold must tolerate a device dark for days. Keep it out of the reconciler's hot path.
- [ ] **H1.2.19a** **ADR-030 — make the reconciler safe for bursty, non-monotonic input.** EOD sync
      means the worker idles for hours then meets a full day's volume at once, and a device flat
      for two days injects old work behind newer work. Assert the engine never orders by arrival,
      never treats a late arrival as suspicious, and has no "already processed later work" reject
      path. Test with an out-of-order batch.
- [ ] **H1.2.20** **Void path for phantom tickets (ADR-028/051).** Needs a `VOID` state (status set
      pending Q-13) with a required reason, unlockable only by an audited override. Retains the record and its audit trail. Distinct from renumbering and from
      archiving. Service function, audited, reviewer-only, never reachable by the engine.

- [ ] **H1.2.21** **KD-25 / KD-26 — authorized corrections (ADR-039).** ⚠️ **KD-26 must be settled
      before any edit path ships.** (a) Add an edit-permission model to `User` — "sufficiently
      privileged" currently means nothing. (b) Add audited `update*` paths for tickets, certs,
      surveys and incidents, each capturing `priorValue` **before** the write, under the real
      human's id, never `SYSTEM`. (c) **Decide what happens when a ticket that already produced a
      `Transaction` is edited** — `Transaction` is append-only, so a compensating entry is the
      only mechanism, and nothing today links a correction to that reversal. Until (c) is
      answered, block edits on reconciled/billed tickets rather than letting ticket and ledger
      silently desynchronise. ⚠️ **ADR-051/057:** every captured field is editable; tickets lock as
      invoiced and unlock by audited action; mechanism proposal in Q-26.
- [ ] **H1.2.22** **KD-27 — itemized unit counts and unit rate sub-types (ADR-040/041).**
      (a) Add a JSONB item breakdown to `UnitRateTicket` alongside the integer `unitCount`, so
      `{paint_cans: 4, propane_tanks: 10}` is expressible. (b) Extend project enablement so
      `UNIT_RATE` carries a **sub-type set** (hangers, leaners, stumps, HHW, white goods), which
      determines the payload shape. Depends on KD-14. ⚠️ Keep `PayItem` decoupled from ticket
      types — it must **not** gain a `ticketType`; the `Rule` makes that link.
- [ ] **H1.2.23** **KD-28 — enforce `PayItem.requireUnitCount`.** The flag exists and defaults
      correctly but nothing reads it. Same silent-no-op class as KD-15 and `requireRoe` — a
      control an admin believes is active that is not. Enforce at the service boundary and in
      reconciliation; add a test asserting a count-requiring code rejects a countless ticket.
- [ ] **H1.2.24** **KD-29 — add a pound billing unit.** HHW is billed by the pound on most
      contracts and `BillingUnit` has no `LB`; `TON` is the wrong granularity for a box of paint
      cans. Small migration. Also decide whether `TBN` is doing real work or is dead weight.

### Milestone H1.3 — Documentation truth-up
- [ ] **H1.3.1** Confirm `README.md` reflects the `database/`-rooted paths and the real test count.
- [ ] **H1.3.2** Confirm every model name used in the domain skills still matches `schema.prisma`
      after any schema change made in this phase.

