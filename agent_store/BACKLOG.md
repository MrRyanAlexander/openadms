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
- [x] **1.1.11** ✅ **done 2026-10-03 (ADR-316):** seven setup services in `apps/api/src/setup/` and the policy loader; `MapShapes` in `packages/domain`; the story `setup` (51 checks: P1 by Dana, P2 by Luis, every record as the mission's §1, one audit record per row, thirteen refusals); a map version's loaded time stamped by the database (the fortieth migration; KD-68 closed); AC-01-01 and 79 pass, AC-01-80 in part; REQ-105e, 108 ticked; chain 44 files, 867 tests; stories 16, 18, 51. **The example world's setup as a story.** The golden mission's §1, P1 and P2,
  written in the spine's order through the API's setup services as the people who make it; every
  record asserted, one audit record per write. **Done when:** `pnpm scenarios` runs it (AC-01-01,
  78…80). *REQ-105e, 108; REQ-142's setup part; C30's first part.*

### Milestone 1.2 — Certifications and capacity (Part 3)

Carried: C56 (1.2.3), filed by ADR-305 (named here by ADR-307). Closes the behaviour of KD-10, 11,
45, 46, 48.

- [x] **1.2.1** ✅ **done 2026-10-03 (ADR-317):** `spec/acceptance/03-certification.md`, from Part 3 and `adms-certifications`, the
  capacity examples taken from §3A.3 and the paper form, never from `development/`. 60 scenarios;
  fourteen points nothing settles listed for the task that decides each (1.2.2: two; 1.2.3: most);
  KD-69 raised (the mission's 102001 scans `730416` on P2; a copy gets a new number) and closed
  by the user the same day (ADR-318: the mission stands; a cert number is unique per project only).
- [x] **1.2.2** ✅ **done 2026-10-03 (ADR-320):** `Capacity` in `packages/domain/src/capacity.ts`, exact
  hundredths, 24 tests (AC-03-21…29, 31, 32 by ID); the three containers' boxes in
  `spec/CONVENTIONS.md` §6; C61's two points decided as agent defaults. **Capacity math in `packages/domain`**, exactly `adms-certifications` §3A.3: whole
  inches, the primary box and boxes 1…N, each shape, add or subtract, hundredths at each step,
  ÷ 46,656, a whole CY half up; no override. **Done when:** every worked example of §3A.3
  passes as a unit test, and the example world's three containers are given measured boxes that work
  out to their 65, 48 and 110 CY (recorded in `spec/CONVENTIONS.md` §6; the mission states only the
  capacities); a crew has none. *REQ-106d; REQ-003's first rule.*
- [x] **1.2.3** ✅ **done 2026-10-03 (ADR-321):** `Certification`, `CertificationBox`,
  `CertificationHelper`, `BoxShape`, `BoxSign`; three migrations (`certifications`, its guard, and
  `map_version_loaded_at_default_prisma_reads_back`, KD-70: 43 in all); a box repeats its
  certification's kind, so only a container holds one, and two deferred constraint triggers hold a
  container to its primary box; a sub held to its own prime's place by a three-column foreign key;
  `guard_viewer` on all three, the driver's phone and licence number hidden; `CertificationSubs`,
  `CertificationChanges` and `ContractorMerge` in `packages/domain` (17 tests); the service
  `Certifications` (`apps/api/src/certification/`), `SubPlaces` and `ContractorSetup.merge`; the
  story `certification` (27 checks). 25 scenarios pass, and AC-03-22, 26, 29 in full (36 of 60);
  AC-01-19 passes; `guard_gaps()` empty; 41 loosenings each caught; chain 47 files, 956 tests.
  REQ-106, 106b, 106d, 106e ticked; REQ-106a and 106f in part (blocks: 1.3.2; flags: 1.5.5).
  **The certification's records.** `Certification` (container or crew; unique per
  project by cert number; prime and subs; driver, tag; who certified; replaces, copied from, revoked
  from), `CertificationBox`, `CertificationHelper`; a sub typed in at certification becomes a
  `ProjectContractor` row under its prime (AC-01-19). **Done when:** Part 3's database scenarios
  pass. *REQ-106, 106b, 106e; REQ-106a's uniqueness; REQ-106f's records (its flags: 1.5.5).*

### Milestone 1.3 — Tickets and numbers (Part 4, the data)

Carried: C43, C44, C36's answers. Closes the behaviour of KD-13, 22, 23, 24, 27, 37, 41, 43, 44.

- [x] **1.3.1** ✅ **done 2026-10-03 (ADR-322):** 98 scenarios of what is recorded; none marked
  passing (nothing was run; seven restate a guard Phase 0 built and are marked when 1.3.3 names the
  test by its ID); eighteen points nothing settles listed for the task that decides each (C63).
  `spec/acceptance/04-field-capture.md`, from Part 4, `adms-ticket-workflows`
  §4.0a–§4.6 and `adms-field-app`: what each field event records; the phone's screens name Phase 3.
- [x] **1.3.2** ✅ **done 2026-10-03 (ADR-323):** the two records, `ROE`, a block cut only from a series its project has; `number_blocks_never_overlap` (a reclaimed block holds only what its phone used) and `control_ranges_never_overlap`; `packages/domain`'s `numbers.ts`; `apps/api`'s `NumberAllocator`, and `Certifications.copy` numbered by it; the story `numbering` (15 checks). 20 loosenings each caught; chain 49 files, 1,018 tests; AC-04-01, 04…09, 13, 14, AC-03-06, AC-01-09 pass; REQ-105k, 106a, 114 ticked. **Numbering.** `ProjectNumberSeries`, `ControlRange`, `NumberSeries` gains `ROE`;
  blocks of one series never overlap (an exclusion constraint needs the `btree_gist` extension: its
  ADR first, C43); the number rules in `packages/domain` (100,001 to 9,999,999, 1,000-number ticket
  blocks, 100-number cert blocks, issued in order, reclaimed, retired); the server's allocator.
  **Done when:** two phones can never hold the same number, proven as a database test. *REQ-105k,
  106a, 114.*
- [x] **1.3.3** ✅ **done 2026-10-03 (ADR-324):** the shared columns of §4.1 (1), none with a database default; one check tells a phone's record from a back-office one (C44); a reason only on a typed number, a typed capacity only on a truck keyed in by hand, a GPS end whole and on the earth, an address with its source; the certification found and the site held to the field event's own project; `guard_table` rerun; `guard_viewer('field_event', 'PROJECT')` and `viewer_field_event_monitor` (who recorded it: name and Monitor ID); `packages/db/test/field-events.test.ts`, 21 tests by scenario ID; 16 loosenings each caught; the example world, the harness's phone and both early stories follow. AC-04-02, 03, 12, 15, 16, 18…31, 44, 94 and AC-03-40 pass. REQ-105i and REQ-115 stay open for 1.3.6 and 1.3.4. **`FieldEvent`, what every kind records.** The shared columns of DATA-MODEL §4.1
  (1): the source, a back-office-created record's person and reason with no phone, assignment or
  setup version (C44, with its check), the typed number and its reason, the certification as scanned
  and as found, the site, both GPS ends, the address. `guard_table` rerun; both stories follow.
  *REQ-105i, 115.*
- [x] **1.3.4** ✅ **done 2026-10-03 (ADR-325):** the columns of §4.1 (2) but the scale receipt and the ROE found (1.3.5, 1.3.6), none required; each held to its kinds by a check; a debris type held to its own project's form for its workflow, a field tag and a pay item to its project; a suffix only on a collection or a haul-out collection, capital letters; a split's suffix and estimate both or neither; `FieldEventItem` and `CarriedTicket`, each on its kind only; `guard_table` and `guard_viewer` rerun, the two tables seen with their field event; `packages/domain`'s `FieldEventDetails`, `packages/contracts`' `fieldEventDetailsSchema`; `packages/db/test/field-event-kinds.test.ts`, 38 tests by scenario ID, one trying every detail on every kind against the domain's table; 31 loosenings each caught; chain 53 files, 1,089 tests. AC-04-32…37, 40, 41, 43, 45…51, 53…58, 60…69 and AC-01-27 pass; AC-04-38, 52, 82 in part. REQ-103 and 112a ticked; REQ-105o, 110, 111, 111a, 112, 112b, 112e and 115 stay open for the worker, the phone and the two links. **`FieldEvent`, what each kind records.** (AC-01-27's other half: a field event
  that points at a debris type's entry still does once the entry is archived, ADR-308.) The kind-specific columns of §4.1 (2),
  each empty on every other kind by a check; a split load's suffix and estimate both or neither; a
  haul-out collection's suffix with its running call; `FieldEventItem`, `CarriedTicket`; the same
  both-or-neither rule in `packages/contracts`. *REQ-103, 105o, 110, 111, 111a, 112, 112a, 112b;
  REQ-112e's capture.*
- [x] **1.3.5** ✅ **done 2026-10-04 (ADR-326):** `ScaleReceipt` (the site's number as written, once per project, **never unique since ADR-331**; its site its own project's; every weight optional and none worked out; a gross or tare below nought refused) and `Photo` (exactly one owner of its own project: a field event, a certification or a scale receipt today, the other five joining with their tables in 1.3.6 and 1.4.2; a view only on a certification's; two fingerprints and two unique places in storage, written once); `FieldEvent.scaleReceiptId`, only on a disposal and a haul-out disposal, its own project's; `guard_table` and `guard_viewer` rerun on `field_event`, both new tables guarded and seen with their project (a photograph without where its file is kept); `packages/domain`'s `fieldEventDetails` and `packages/contracts`' schema gain the link; `packages/db/test/scale-receipts-and-photos.test.ts`, 16 tests by scenario ID; 31 loosenings tried. AC-04-71…78, 38, 39, 52 and AC-03-34 pass. REQ-126a ticked. **Scale receipts and photos.** `ScaleReceipt` (unique per project by receipt
  number; never confusable with a ticket number), `Photo` (exactly one owner). *REQ-126a.*
- [x] **1.3.6** ✅ **done 2026-10-04 (ADR-327):** `Roe` and `RoeScopeItem` (configuration, records domain: a number once per project; a phone's or the back office's; scope picked from its own project's load form or the payable types, each once) and `Survey`, `Incident`, `DropOffLog` (evidence: where each came from held by one check, as a field event's; a survey's ROE and a drop-off log's site its own project's); each record's answers with the definition answered, of its own project's form of its kind, or `{}` with none; `packages/contracts`' `formAnswersSchema` made from a definition's version (C36); `FieldEvent.roeId`, only on a collection and a unit rate event, its own project's; `Photo`'s four new owners; `guard_table` and `guard_viewer` rerun on `field_event` and `photo`, the five new tables guarded and seen with their project; `packages/db/test/roes-and-forms.test.ts`, 19 tests by scenario ID; 59 loosenings each caught; chain 56 files, 1,139 tests. AC-04-80…90 pass (82 now whole). REQ-105i ticked; REQ-107 stays open for the QC mark (1.8.2). **ROEs and forms.** `Roe`, `RoeScopeItem`, `Survey`, `Incident`, `DropOffLog`, each
  with its answers and the definition version answered; the answers' schema made from the definition
  in `packages/contracts` (C36). *REQ-107.*
- [x] **1.3.7** ✅ **done 2026-10-04 (ADR-332: Milestone 1.3 is done):** the one rule that works a unit rate pay item out from the size bands, `SizeBands.payItemFor` and `SizeBands.diameter` in `packages/domain` (a circumference ÷ 3.14, half up to a tenth; one pay item on the payable type is that pay item; several, the band that holds the diameter, else none); the harness's phone (`packages/scenarios/src/device.ts`) holds its assignment's lists (`phone-lists.ts`, read from the server: never a rate, a rule or a load's pay item), scans the badge at New, picks by name, makes the number last from its own block (`PhoneNumbers`), scans it at the second end, has it entered again (a mismatch saves nothing), types one with a reason, chains a split's number, keeps the working crew, cancels, and records a scale receipt, an incident, a drop-off log and an ROE; the stand-in intake writes each kind's details, its item lines and carried tickets, the receipt and the two forms, reading a debris type's form from the project and workflow; the story `p1-field-days` (35 checks): P1's Monday and Tuesday, 25 field events, one scale receipt, an incident and a drop-off log, every field event `PENDING`; `ticket-101001` and `dispatch-monday` moved to the new phone; chain 56 files, 1,160 tests; six stories. AC-04-10, 11, 17, 42, 59, 70, 91, 92, 93 pass (93 of 98). REQ-112g and 120a ticked; REQ-112f's phone part proven. **The harness's phones capture every kind.** Badge first, the number last and
  re-entered; a unit rate pay item worked out from the bands by the one rule the phone and the
  server share. Story: a day of P1's field events, every kind, landing `PENDING`. *REQ-112g, 120a;
  REQ-112f's phone part.*

### Milestone 1.4 — Sync intake with quarantine (Part 5)

Carried: C31's first part. Closes the behaviour of KD-56.

- [x] **1.4.1** ✅ **done 2026-10-04 (ADR-333):** 56 scenarios, AC-05-01…56: what a phone sends, a retry stored once, a duplicate quarantined in full, what is not a duplicate, nothing else refused, what intake fills in, what the phone is told and receives, any order and bursts, a phone taken out of service; 39 are 1.4.2's, 6 built already, 3 later Phase 1 tasks', 8 for Phases 2–4; sixteen points left to the task that builds them, with C31, C63…C68's parts for 1.4.2 listed in the file. `spec/acceptance/05-sync.md`, from Part 5 and `adms-exceptions` §4.3a: what Phase
  1's intake does; the endpoint, the idempotency ledger and the manifest name Phase 2.
- [x] **1.4.2** ✅ **done 2026-10-04 (ADR-338):** `Intake` in `apps/api` (`src/sync/`): each record answered saved, already saved or not saved; `QuarantinedRecord` (a duplicate field event, and an ROE whose number is taken, kept whole; what the phone sent never changed or deleted; its resolution written later); `Photo.quarantinedRecordId`; `FieldEvent.unreadableGps` (C67 (f)); the domain's `GpsFix` and `Quarantine`; the certification and the ROE a number finds; a retry known by its phone-made id; the stand-in deleted and the harness's phone on the API's record types; stories `sync` (47 checks) and `p1-any-order` (4); `quarantined-records.test.ts` (10), twelve loosenings caught. 43 of the 56 sync scenarios pass, two in part. REQ-120b ticked; REQ-120h and 124c's intake halves seen. **Milestone 1.4 is done.** **Intake.** `QuarantinedRecord`; every field event received, in any order, in
  bursts; a second event of one kind on one ticket quarantined in full, never dropped, merged or
  acknowledged as saved; a retry of the same phone-made id is the same record; an out-of-service
  phone's work received. The harness's stand-in (`packages/scenarios/src/intake.ts`) gives way to
  it. *REQ-120b, 120h; REQ-124c's receiving part.*

### Milestone 1.5 — Reconciliation (Part 6)

Carried: C16, C20, C50, C52's scenarios; C53's second part (1.5.5) and C55 (1.5.5, 1.5.7), filed by
ADR-303 (named here by ADR-307). Closes the behaviour of KD-02, 04, 05, 06, 12, 19, 28, 35, 42, 50,
55.

- [x] **1.5.1** ✅ **done 2026-10-05 (ADR-339):** 162 scenarios, AC-06-01…162: what starts a run, grouping, shape and status, every flag of the catalogue (66 today: 67 less the one ADR-328 withdrew) word for word, each thing never flagged, the quantities to the digit, how a flag behaves, what the worker writes and the run's guarantees, and the eight things ADR-329 keeps and flags that have no words yet; 152 are Milestone 1.5's, nine wait for the rules, one for a correction; eighteen points left to the tasks that build them (C70); KD-71 opened. `spec/acceptance/06-reconciliation.md`, from Part 6, `adms-validation` and
  `spec/FLAGS.md`: one scenario at least for each of the 67 flags and each thing never flagged.
- [x] **1.5.2** ✅ **done 2026-10-05 (ADR-340):** the seven tables and five closed sets below, built as `spec/DATA-MODEL.md` §5 has them, in three migrations (the sixty-sixth to sixty-eighth); only the worker's login writes them; a disposal has one completed record, a collection is a live row of one, a number is one live record's (six exclusions `WHERE dissolved_at IS NULL`, which Prisma doesn't try to drop, where a partial unique index would be); each thing a derived record names is its own project's; `FlagCode` is the catalogue's 66 codes, held to `spec/FLAGS.md` by a test; a client user and an auditor see the completed records, their rows and the flags, nobody a run; `packages/db/test/derived-records.test.ts`, 17 tests by scenario ID (AC-06-06, 144, 145, 146 whole; 19, 21, 137, 138, 148, 152 the database's half); fifty loosened guards each caught. `Transaction`, `InvoiceLock` and `guard_transaction_delete` are unchanged (1.7.1, 1.8.2). REQ-113 ticked; REQ-116 waits for the worker. Was:
  **The derived records.** `CompletedLoad` and `CompletedLoadCollection`,
  `CompletedHaulOut` and `CompletedHaulOutCollection` (one disposal each; one live row per
  collection event, the partial unique key in a guard migration; `dissolvedAt`), `Flag` with
  `FlagCode` and `FlagBilling`, `ReconciliationRun`, `ReconciliationDecision`; the worker's columns
  on a field event (zone, map version, worked-out pay item). Today's `CompletedLoad`, its tests and
  `guard_transaction_delete` follow. *REQ-113, 116.*
- [x] **1.5.3** ✅ **done 2026-10-05 (ADR-341):** `packages/domain/src/tickets.ts` (`Tickets`, `Ticket`, `workerStatuses`), 24 tests; AC-06-07, 08, 09, 11, 12, 15, 19, 20, 21, 22, 142 pass and nine more in part; REQ-120, 120e, 120f ticked (120b1, 127, 129 wait for the flag, 1.5.5, and the run, 1.5.9); chain 62 files, 1,246 tests. **Grouping and status, in `packages/domain`.** A ticket's events grouped on project
  + workflow + bare number, ordered by field time, the kind never used to find a partner; the
  group's shape (a split's suffixes); an event missing → `PENDING`, listed, never flagged, never
  expiring. *REQ-120, 120b1, 120e, 120f, 127, 129.*
- [x] **1.5.4** ✅ **done 2026-10-05 (ADR-343):** `packages/domain/src/quantities.ts` (`LoadQuantities`, `HaulOutQuantities`, `ScaleWeight`, `StumpQuantities`, `CarriedTickets`, `quantityFor`), 25 tests; AC-06-73…77, 79, 81, 82, 84, 128 pass and 78, 83, 90, 162 in part; the mission's quantities come out to the digit; REQ-126 ticked (120i, 120j, 126b in part; 126d, 126e wait for the lookup and the flag); chain 63 files, 1,271 tests. **Quantities, in `packages/domain`** (`adms-validation` §5.5). Capacity × load
  call; a split load's shares by estimate; a split haul-out's piles by what each added; a tandem's
  one weight by certified capacity; the carried tickets' count and a load of stumps' CY; a
  circumference to a diameter; the stump's fill; each summing exactly. **Done when:** the mission's
  quantities come out to the digit (52.0, 36.0, 62.4, 24.0, 45.5, 28.8, 99.0 CY; 14.4 and 21.6 CY;
  2.82, 7.06 and 14.12 tons; 18.0 in; 4.8 CY). *REQ-120i, 120j, 126, 126b, 126d, 126e.*
- [x] **1.5.5** ✅ **done 2026-10-05 (ADR-344):** `packages/domain/src/flags.ts` (`Flags`, `flagCodes`, the 66 messages, the facts' hash, `Flags.compared`), `checks.ts` (`TicketChecks`, `CertificationChecks`), `project-clock.ts`, `sha256.ts`; 44 tests at the domain and 67 in `packages/scenarios/test/flag-catalogue.test.ts`, which holds every message to `spec/FLAGS.md`; AC-06-25…35, 37…40, 49, 50, 59…64, 117, 130, 131, 133, 136 pass, AC-06-17, 137, 138 are whole, 41 and 58 in part; REQ-105j, 120d, 122a, 129a ticked (106f, 120b1, 122, 124c in part); chain 66 files, 1,382 tests. **Section O's flags and three backup catches: built 2026-10-05 at the user's word (ADR-345): `spec/FLAGS.md` §3.10, nine `FlagCode` values (the sixty-ninth migration), 75 flags; AC-06-155…157, 159…161, 163…165; chain 66 files, 1,401 tests.** **Checks and flags, between events and on the certification.** The flag catalogue as
  one closed set with each message word for word from `spec/FLAGS.md`; `FLAGS.md` §3.1, §3.2 and the
  time flags of §3.3; the facts a flag keeps and their hash. *REQ-105j, 120d, 122, 122a, 129a;
  REQ-106f's flags; REQ-124c's flag.*
- [x] **1.5.6** ✅ **done 2026-10-05 (ADR-346):** `packages/domain/src/geodesic.ts` (`Distance`; `geographiclib-geodesic` 2.2.0, the package's first dependency), `ShapeArea` in `map-shapes.ts`, `place.ts` (`PlaceChecks`, `SiteChecks`); 38 tests; AC-06-43…47, 51, 52, 65…67, 72, 118, 126, 127, 134 pass, 42 and 68 in part; REQ-123, 105n ticked (124b, 124e, 128 in part); chain 68 files, 1,439 tests. **Checks on place.** The one geodesic module; a point in a circle, a shape, the
  boundary, a zone; `FLAGS.md` §3.3's place flags and §3.4 (where the debris went; a haul-out that
  left a landfill, or was dumped at a TDSR: C52); a site's dates and permit. Any library needs its
  ADR. *REQ-123, 124b, 124e, 128; REQ-105n's flag.*
- [x] **1.5.7** ✅ **done 2026-10-05 (ADR-347):** `packages/domain/src/quantity-checks.ts` (`QuantityChecks`), `unit-rate-checks.ts` (`UnitRateChecks`, with the worker's own pay item), `roe-checks.ts` (`RoeChecks`); 65 tests; AC-06-80, 83, 85…90, 92…104, 107…116, 129, 132, 135 pass, 106 in part; AC-01-33, 48 and AC-04-59 whole; REQ-105d and 126b ticked (112c, 112f, 120j in part); chain 71 files, 1,504 tests. **AC-06-158 and 162's two flags were approved by the user and built the same day (ADR-348): `SCALE_NET_DISAGREES`, `TWO_QUANTITIES`, the seventieth migration, 77 flags; chain 71 files, 1,511 tests.** **Checks on quantity, the pay item's settings, unit rate work and forms.**
  `FLAGS.md` §3.5…§3.7: the load-call limits, the pay item worked out again from the bands, the
  stump checks, crew hours across a day, the ROE flags. A renamed built-in value changes nothing
  (AC-01-33). *REQ-112c; REQ-112f's engine part.*
- [x] **1.5.8** ✅ **done 2026-10-05 (ADR-349):** `packages/domain/src/mileage.ts` (`Mileage`: what is kept, the straight line, when a kept mileage stands, the flag) and the worker's first code, `apps/worker/src/mileage/` (`MapServers`, `Mileages`); 11 tests at the domain and 12 at the worker against the local stack's map servers; AC-06-54, 55 pass, 53 and 56 in part; the example world's stand-in points on the pinned extract are in `spec/CONVENTIONS.md` §6 (14 Heron St: 6.2050 road miles from Marsh Road TDSR); REQ-126f waits for the run; chain 73 files, 1,534 tests. **Mileage.** What the worker asks Valhalla and Nominatim (C50): the snap to the
  nearest road, the shortest route on public roads, the address of the snapped point; stored
  unrounded with the map data's date and hash; no route → the straight line, flagged; recomputed
  only when an end moves. The mission's GPS points are picked from the pinned extract here.
  *REQ-126f.*
- [x] **1.5.8a** ✅ *(done 2026-10-05, ADR-351: the picked points are in `spec/CONVENTIONS.md` §6; chain 73 files, 1,533 tests, eight stories)* **The example world on the pinned map extract** *(the user, 2026-10-05, ADR-350 (1))*. Every fixture that holds the made-up GPS points of ADR-311 (round 27.98° N, 82.40° W: the sites, 14 Heron St and the other addresses, P1's boundary and three zones, the site shapes, the points 250 m and 150 m from Marsh Road TDSR and every figure worked from them) moves to the stand-ins of `spec/CONVENTIONS.md` §6 on Delaware's roads: `packages/db/test/support/example-world.ts` and the database tests, `packages/domain`'s tests, the stories and `p1.ts`, the acceptance files' and `spec/CONVENTIONS.md` §6's rows. The remaining addresses (40 Birch Ln, 22 Elm St, 412 and 416 Cedar Ct), Bayline Transfer Station and P1's boundary and zones are picked here, each P1 load within 15.0 road miles of its site, as the mission's ledger needs. A test is rewritten for the new points, never loosened. **Done when:** no fixture holds a point off the extract (a grep), and the chain is green with the same counts.
- [x] **1.5.9** ✅ **done 2026-10-05 (ADR-352): Milestone 1.5 is done.** `apps/worker/src/reconciliation/` (`Reconciliation`, `ProjectRead`, `TicketWork`, `TicketWrite`, `MileageStanding`) and the ninth story, `p1-reconciled` (39 checks): P1's Monday and Tuesday reconciled, unpriced; AC-06-01, 04, 13, 14, 16, 18, 23, 41, 42, 48, 56, 119, 124, 147, 149…153 pass, 02, 03, 53, 141, 148, 154 in part; REQ-015, 126f, 127, 129, 132 ticked; chain 73 files, 1,534 tests, nine stories; no migration. Left: C71. Was: **The worker's run.** One ticket, one database transaction; one run per project at
  a time, by a database lock; a ticket that errors flagged and skipped; unchanged input changes
  nothing; each decision recorded; whether the worker states a person for a reprocess they asked for
  (C20). Story: P1's loads and haul-outs reconciled, unpriced, with their statuses and flags.
  *REQ-015, 121, 132.*

### Milestone 1.6 — The rule engine (Part 7, the rules)

Closes the behaviour of KD-15, 36, 38, 54.

- [x] **1.6.1** ✅ **done 2026-10-05 (ADR-353):** `spec/acceptance/07-pricing-ledger-audit.md`, 114 scenarios (AC-07-01…114) from Part 7, `adms-ledger-audit`,
  `spec/RULES.md` and `spec/RATE-SHEET.md`: 35 are task 1.6.2's, 48 task 1.6.3's, 4 task 1.7.1's, 12 task 1.7.2's, 10 restate guards Phase 0 built, 3 the golden mission's, 2 later phases'; none passing yet. Eighteen points nothing settles: C72.
- [x] **1.6.2** ✅ **done 2026-10-05 (ADR-354):** `packages/domain/src/ticket-rules.ts` (`TicketReadings`, `CriterionCheck`, `TicketRules`), `Mileage.inTenths`, `CheckedSite.siteTypeId`; 41 tests; AC-07-01…09, 12…37 and AC-06-57 pass; the user's answer on an empty reading (it never passes); chain 74 files, 1,575 tests. REQ-125 and 125b wait for 1.6.3 and 1.6.4. Was: **Criteria, in `packages/domain`.** Each criterion reading its named field event,
  each operator, BETWEEN with both ends, mileage in tenths half up; only the active, valid rules of
  the ticket's form whose contract's prime is the ticket's, or with no contract. *REQ-125, 125b.*
- [x] **1.6.3** ✅ **done 2026-10-05 (ADR-355):** `packages/domain/src/ticket-pricing.ts` (`TicketPricing`); 56 tests; AC-07-10, 11, 38…83 and AC-06-70, 71, 91, 105, 120…123 pass at the domain; the user's three answers on money (cents a half up; a crew day to four decimals; hours in no step bill nothing, flagged); chain 75 files, 1,631 tests. REQ-112e, 112f, 124e, 125, 126e, 131a, 131c, 131d ticked. Was: **Actions to lines, in `packages/domain`.** Every passing rule found; adds in #
  order, then removes, then voids; one line per add; two adds of one # and no line at all flagged;
  the quantity by the pay item's unit (crew time's highest item, an itemised ticket's chosen items,
  the fill CY, TBN); the rate of the rule's contract's prime, a $0 line where it has none; per
  property on a split, per pile on a split haul-out; the same answer every time, proven by running
  it twice. *REQ-112e, 112f, 131a, 131c, 131d.*
- [x] **1.6.4** ✅ **done 2026-10-05 (ADR-357): `packages/domain/src/setup-check.ts` (`SetupCheck`, seven kinds of gap) and `quantity-lookup.ts` (`QuantityLookup`: load call, scale weight, a count, or nothing more), `RuleReach`, `SizeBands.standing()`; a rule naming an archived form, contract or pay item is not valid and is listed; 31 tests; AC-01-69…77 pass; REQ-125b ticked, REQ-124f and 125c in part; chain 76 files, 1,662 tests. Milestone 1.6 is done.** Was: **The setup check, and what each site's phones ask for.** AC-01-69…77; the two
  points `01-setup.md` leaves to it. *REQ-124f, 125c.*

### Milestone 1.7 — The ledger and audit (Part 7, the money)

Carried: C16, C17, C18. Closes the behaviour of KD-01, 26, 49, 52, 53.

- [x] **1.7.1** ✅ **done 2026-10-06 (ADR-358): `Transaction` in full**, as `spec/DATA-MODEL.md` §5
  has it, in two migrations (the seventy-first and seventy-second): a line on exactly one kind of
  ticket, a load or a haul-out always with the property or pile it prices; its project, #, rule,
  pay item, contract, prime, operating sub, unit and run, each held to its own project, the prime
  to the project's primes and the operating sub to a place under that prime; a # once per
  property, pile and unit rate ticket; `InvoiceLock`'s two other targets (exactly one), and the
  lock followed through all three by the delete's guard and by a new insert guard (C17); a
  contractor user sees its own contractor's lines, as the prime or as the sub that did the work.
  In `packages/domain`, `TicketRead.operatingSubId` (the lowest tier of sub the certification
  names). The example world keeps one priced line, 101001's $390.00; its 101002 is on Rivera's
  self-loader at the Landfill, as the mission has it. `packages/db/test/transactions.test.ts`, 12
  tests by scenario ID; `test/support/priced-tickets.ts`. AC-07-85…90, 96, 97, 104…109 and
  AC-03-15 pass; AC-02-66 in part. REQ-106g, 130, 133 ticked. Was: **`Transaction` in full.** Its
  three kinds of ticket (exactly one), the property or pile, slot, rule, pay item, contract, prime
  and operating sub, unit; a # once per ticket and property or pile; the delete guard following
  the invoice lock through all three; what a contractor viewer sees (its own prime's lines, its
  subs' included). *REQ-106g, 130, 133.*
- [x] **1.7.2** ✅ **done 2026-10-06 (ADR-359): the worker prices.** `apps/worker` runs the
  firm's rules inside each ticket's one piece of work and writes its lines with its completed
  record, flags and status; only what differs is written, each removed line copied to the audit
  log by the database first; a ticket that is pending again, voided or "not billed" loses its
  lines; a ticket locked as invoiced is left as it is; a rate or rule change is a run of the
  whole project; a rule's void stays until a person unvoids it and the ticket is out of the run
  (the user, ADR-360, who also closed KD-73: the flag `NOT_PROCESSED_LINES_STAND`). `packages/db`'s `RuleRows` (the one
  reading of the rules) and `$read`. The story `p1-priced` (28 checks): 17 lines, $4,879.00 on
  Tuesday night; 19 lines, $5,400.25 after Wednesday's sync (AC-07-112 corrected); two primes.
  AC-07-84, 92…94, 98, 99, 101…103, 110, 112 and AC-01-68 pass; AC-07-95 in part. REQ-105l, 131,
  131b ticked. KD-73 opened. Was: **The worker prices.** A ticket's lines regenerated: each removed row copied in
  full to the audit log first, then the new ones written, in the ticket's one transaction; a void
  removes them; a rate or rule change queues every un-invoiced ticket it touches; a `COMPLETED`
  ticket reprocessed in place. Story: P1's Monday and Tuesday priced; two primes (AC-01-68).
  *REQ-105l, 131, 131b.*
- [x] **1.7.3** ✅ **done 2026-10-06 (ADR-361): Milestone 1.7 is done.** The user's answer first:
  a sub's contractor user sees no rate and no amount. The seventy-fourth migration, a guard, no
  model changed: `guard_viewer`'s `own` (the question that makes a row a contractor user's own);
  a contractor user's sight of the certifications that name its contractor, the field events that
  found them, the completed loads and haul-outs with their rows, scale receipts, photographs, and
  its own and its subs' places on the project; `viewer_transaction_money` (rate and amount: a
  client user, an auditor, the line's own prime); `viewer_pay_item_name`,
  `viewer_disposal_site_name`, `viewer_debris_type_name`. Tests: `contractor-users.test.ts`
  (AC-02-78…82), and the viewer, catalog, grant and row-level-security files in the new shape;
  sixteen loosenings each caught. AC-02-66 passes whole. Left: C76. Was: *(filed 2026-10-06, ADR-358)* **What a contractor user sees of its own tickets.**
  Task 1.7.1 gave a contractor user its own lines, and those hold ids: it still reads no field
  event, completed load or haul-out, collection row, flag, certification, scale receipt or
  photograph, and none of setup (C18, C59, C62, C65, C66, C70; AC-02-66's other half, AC-04-31).
  This task: its own tickets, told by the certification's prime and subs (a prime its subs' too),
  through the owner's-rights questions the viewers' guard uses; the names it needs of setup to
  read them (a debris type's, a site's, a pay item's code and description), and nothing more of
  setup; ROEs and forms stay unseen unless the user says otherwise. A schema task with no new
  model: guard migrations, `test/support/viewers.ts`, tests by scenario ID. **Put to the user
  first:** whether a sub's contractor user sees the rate and amount on its lines (it does today,
  as AC-02-66 reads; they are the prime's rate with the client).

### Milestone 1.8 — Review, QC, invoice lock and batches (Parts 8 and 9)

Carried: C17, C19, C75, C76, C77 (filed by ADR-362), C78 (filed by ADR-363), C79 (filed by ADR-364), C80 (filed by ADR-365), C81 (filed by ADR-367). Closes the behaviour of KD-25, 40.

- [x] **1.8.1** ✅ **done 2026-10-06 (ADR-362):** `spec/acceptance/08-review-and-corrections.md`
  (65 scenarios, AC-08-01…65) and `09-invoice-deliver-closeout.md` (31, AC-09-01…31), from Parts 8
  and 9 and `adms-exceptions`; each row names the task of this milestone that first proves it; none
  passing; twenty-two points nothing settles are C77's; KD-74 found (docs, the user's).
- [x] **1.8.2** ✅ **done 2026-10-06 (ADR-363):** the five mark tables in `packages/db/prisma/schema/marks.prisma` and the closed set `QcStatus`, the seventy-fifth migration (Prisma's) and the seventy-sixth (the guard); each mark its own record with its project, written by the API (`guard_table`, `MARK`), read by the worker; a QC mark on one of eight things, a field event only as a unit rate ticket; the lock's unlock on its own row, one lock in force for a ticket (three exclusions), the two guards on a transaction and the worker asking only about a lock in force; a batch's name once per project; a flag accepted once; a person's void keyed as a ticket is, one in force; what a mark is on, who made it and when never changed (`refuse_edit()`); a client user and an auditor see every mark, a contractor user its own tickets' locks and their batches; `packages/db/test/marks.test.ts`, 19 tests by scenario ID; 109 loosened guards written, each tried on its own throw-away copy against the nine test files that hold these tables' guards: 108 applied and 105 were caught (two of them, the haul-out's own-project key on a QC mark and on a lock, only after a refusal was added to the tests for each); three are not caught by construction (the bare project foreign key on a QC mark, a lock and an acceptance, which the two-column key to what the mark is on already implies); one could not be applied (a lock's viewer view written again with the unlock's note in it: Postgres won't add a column mid-view), and the grant of that column alone was caught; chain 79 files, 1,710 tests. AC-08-09, 33, 48, 49, 53, 55…59 and AC-09-01, 07, 09, 10, 17 pass at the database; AC-03-38 whole. REQ-107 ticked; REQ-105h and 105m wait for the services (1.8.5). Was: **People's marks.** `QcMark`, `InvoiceLock` in full (the unlock kept on its row),
  `InvoiceBatch`, `FlagAcceptance`, `TicketVoid`; each written by the API, never touching a derived
  row. *REQ-105m's record; REQ-105h's lock.*
- [x] **1.8.3** ✅ **done 2026-10-06 (ADR-364):** the review services in `apps/api/src/review/` (`Corrections`, `QuarantineReview`, `BackOfficeRecords`, on `ReviewService`) and their rules in `packages/domain/src/review.ts`; a person's grant read by the service itself; each call answering the run to ask the worker for; a line and a carried ticket taken off by a mark (`archivedAt`, the seventy-seventh and seventy-eighth migrations); intake's row-writing shared as `RecordWrite`; the story `p1-reviewed`, 30 checks: AC-08-05 and 07 (the *correct* and *renumber* halves), 10…30, 66, AC-09-16, AC-03-52; four loosened guards, each caught; chain 80 files, 1,727 tests. REQ-105g, 120c ticked. Was: **Corrections and renumbering.** Any captured field corrected in place by
  permission, the prior value kept; a renumber of real work; a quarantined record resolved, keeping
  its phone-made id and its photos; each reprocessing the ticket. *REQ-105g, 120c.*
- [x] **1.8.4** ✅ **done 2026-10-06 (ADR-365):** KD-74 answered by the user (two separate grants) and closed; `apps/api/src/review/voids.ts` and `acceptances.ts` on `ReviewService`, their rules in `packages/domain/src/review.ts` (`TicketVoiding`, `FlagAccepting`) and `flags.ts` (`Flags.accepted`); the worker reads `TicketVoid` and `FlagAcceptance` (a person's void written as void, its lines removed, its flags cleared, read by no other ticket's checks; an unvoided ticket read back in; the status from the accepted flags); the story `p1-voided`, 27 checks: AC-08-31, 32, 34…47, 50…52, the story halves of 33 and 48, the *void* and *accept flags* halves of 05 and 07; six loosenings, each caught by the story; no migration; chain 80 files, 1,737 tests, twelve stories. REQ-105p, 120g, 129b ticked. **The user approved its defaults and added one rule the same day (ADR-366): every unvoid writes a `TicketUnvoid`, audited under the person, read by the worker; the seventy-ninth and eightieth migrations; AC-08-67; fifteen loosened guards each caught; chain 80 files, 1,739 tests, 80 migrations.** Was: **Void, unvoid, accept.** A person's void with a reason; a rule's void, which wins
  on every reprocess; an unvoid; a flag accepted with a reason, not raised again unless its facts
  change; every flag fixed or accepted → `COMPLETED`. *REQ-105p, 120g, 129b.*
- [x] **1.8.5** ✅ **done 2026-10-06 (ADR-367): Milestone 1.8 is done.** `apps/api/src/review/qc-marks.ts` and `invoice-locks.ts` on `ReviewService`, their rules in `packages/domain/src/review.ts` (`InvoiceLocking`, `LockedTicket`, `TicketOnItsOwn`, `BatchName`); only a whole, `COMPLETED`, QC Approved ticket locks; a change to a locked ticket's own records refused by every review service until its unlock; the unlock answers its run; `ProjectSetup.close`; the story `p1-invoiced`, 26 checks: AC-08-54, 60…62, AC-09-02…04, 06, 15, 19…22, 29, the story halves of AC-08-57, 58 and AC-09-01, 09, 17, AC-09-05, 13, 14 by the service, the *QC* halves of AC-08-05 and 07; ten loosenings, each caught by the story; no migration; chain 80 files, 1,750 tests, thirteen stories. REQ-105h, 105m ticked. Was: **QC, the lock and batches.** QC set by people only, on the completed load or
  haul-out, a unit rate ticket, a form, a certification; only QC Approved locks; a named batch; a
  locked ticket untouched by a reprocess until an audited unlock. *REQ-105h, 105m.*

### Milestone 1.9 — Prove it: the golden mission

Carried: C28, C29, C30 (✅), C51's two scenarios (✅ ADR-369), C82 (filed by ADR-368), C83 (filed by ADR-369).

- [x] **1.9.1** ✅ **done 2026-10-06 (ADR-368):** the fourteenth story, `golden-mission` (`packages/scenarios/src/stories/golden-mission.ts`), 27 checks: both projects set up, P1's two field days and the late sync, P2's split load on real harness phones with its ROEs and surveys, the accepted flag, the renumber, the two voids, the weighed split haul-out, QC (30 marks), the lock and the batch of thirteen, a rate change that regenerates nothing, and a line walked back years after closeout; P1 $5,548.25 on 19 lines, P2 $324.00, every status and audit row; AC-07-111, 113, 114, AC-08-01, 02, 63…65, AC-09-11, 30, 31 and the story halves of twenty-four earlier rows; no production code changed, no figure of the mission changed; REQ-017, 142, 143 ticked; what it leaves: C82. Was: **The golden mission as a story**, whole: its setup, both days, the late sync, the
  renumber, the accepted flag, the two voids, the split load, the weighed split haul-out, QC, the
  lock and batch; the exact statuses, review queue, ledger and audit rows. A change to an approved
  number needs the user's word. *REQ-017, 142, 143.*
- [x] **1.9.2** ✅ **done 2026-10-06 (ADR-369):** the fifteenth story, `p1-left-out` (`packages/scenarios/src/stories/p1-left-out.ts`), 25 checks: any arrival order (AC-06-05), the split haul-out paid by the CY, six lines, $850.85, and the pile whose call isn't higher (C51), a certification made later, revoked and replaced, a tandem's one weight, a load that carries a ticket, three flags cleared by setup, a new map version, a site's own shape, a load after the window; **the count: 760 scenarios, 691 proven whole, 17 in part, 52 for Phases 2–4** (`spec/acceptance/README.md`); no production code changed; REQ-111a, 120h, 120j ticked; what it leaves: C83. Was: **The scenarios the mission leaves out, as stories**, and a count: how many
  scenario IDs have a passing test, by part. Among them the split haul-out paid by the CY (six
  lines, $850.85) and the pile whose call isn't higher (C51).
- [x] **1.9.3** ✅ **done 2026-10-06 (ADR-371, 372): `pnpm security` `7 passed, 0 failed` after the `source-map-js` 1.2.2 override, let past the seven-day rule by name at the user's word (ADR-372); Phase 1's seven exit criteria are met; Phase 2 is the user's to open. Before that line:** all but one line done 2026-10-06 (ADR-371): 98 REQs = 93 ticked + 5 moved to the phase that finishes them (REQ-112b, 124c, 124f, 125c → Phase 3; 124b → Phase 4); REQ-003, 105, 128, 140, 141 ticked from the final run (80 files, 1,753 tests, fifteen stories, typecheck and lint clean, 358 licences allowed); 44 rebuild-lesson KDs closed with their scenarios, KD-30 re-filed to REQ-518; `guard_gaps()` empty over 82 tables; the CIS tests cover every table by reading the catalog (`configuration.test.ts`, in the 921 database tests); AC-03-50 and AC-05-47 given their own test (693 of 708 whole, 15 in part); `REQUIREMENTS-LATER.md`'s Phase 2 refreshed (REQ-207…209 new). **Left, and why the box is open: `pnpm security` reads `6 passed, 1 failed` until ADR-356's override (C74), due from 2026-10-07 14:08 UTC. Then: the override, `pnpm security` → `7 passed, 0 failed`, tick this box, and offer Phase 2 to the user.** Was: **Phase exit.** Every Phase 1 REQ ticked or re-filed with an ADR; REQ-003, 105,
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
1.1.11, 1.5.5 (and Phase 2); C54 → 1.1.10; C55 → 1.5.5, 1.5.7; C56 → 1.2.3. Filed by ADR-311: C57 → 1.1.11, 1.5.6. Filed by ADR-313: C58 → 1.1.11, 1.6.1, 1.6.4. Filed by ADR-353: C72 → 1.6.2, 1.6.3, 1.6.4, 1.7.1, 1.7.2. Filed by ADR-355: C73 → 1.6.4, 1.7.1, 1.7.2. Filed by ADR-361: C76 → Phases 2 and 4, every later schema task. Filed by ADR-358: C18, C59, C62, C65, C66, C70's contractor-sight points → 1.7.3 (✅ done, ADR-361); C16 → 1.7.2, 1.8.2. Filed by ADR-356, 357: C74 → the first session from 2026-10-07, 1.7.2, 1.9.1, Phases 2…4. Filed by ADR-359: C75 → 1.8.2, 1.8.3, 1.8.4, 1.9.1, 1.9.2, Phases 2 and 4. Filed by ADR-315: C59 → every schema task, 1.2.3, 1.3.3, 1.7.1, Phase 2. Filed by ADR-317: C61 → 1.2.2, 1.2.3, 1.5.5, 1.8.2, 1.9.1. Filed by ADR-321: C62 → 1.3.2, 1.3.3, Milestone 1.3, 1.5.5, 1.7.1, 1.8.2, 1.8.3, Phase 2. Filed by ADR-322: C63 → 1.3.2…1.3.7, 1.4.2, 1.5.5, 1.5.7. Filed by ADR-323: C64 → 1.3.6, 1.3.7, 1.4.2, 1.5.5, Phases 2 and 4. Filed by ADR-325 (under C63): → 1.3.5, 1.3.6, 1.3.7, 1.5.4, 1.5.5, 1.5.7, 1.8.3. Filed by ADR-326: C65 → 1.3.6, 1.4.2, 1.5.4, 1.5.5, 1.5.7, 1.7.1, 1.8.3, Phases 2 and 4. Filed by ADR-327: C66 → 1.3.7, 1.4.2, 1.5.7, 1.6.4, 1.7.1, 1.8.2, 1.8.3, Phases 2, 3 and 4. Filed by ADR-332: C68 → 1.4.2, 1.5.7, 1.9.1, Phases 2 and 3.*
- **C36. The storage shape of the firm's added fields** (ADR-278, at the user's word): a versioned
  form definition per record kind, one JSONB answers column per record keyed by field ID plus the
  definition version, a schema generated from the definition in `packages/contracts`, Prisma's `Json`
  type, audited like any field; nothing the engine, a rule or a flag reads lives in JSONB. The draft
  settles the model and field names, the guard for the definition's versions (never edited or
  deleted) and how exports name the columns; it may overturn the details, with an ADR.
- **C16.** Every model and field is provisional (ADR-268). ~~`CompletedLoad` links one collection (a split's
  several are DATA-MODEL's); `CompletedHaulOut` is still to come;~~ ✅ built, ADR-340 (1.5.2). ~~**Task 1.7.1:** `Transaction` lacks pay item, rule,
  contract and operating sub, and its links to a property (`completedLoadCollectionId`), a haul-out and its pile, and a unit rate ticket; its viewer policy still finds its project through `viewer_sees_load_project`.~~ ✅ built, ADR-358 (the function is gone: a line carries its project). ~~**Left by 1.7.1 for 1.7.2:** the worker writes each line with its project, the property's or pile's row id, the rule's contract, `TicketRead.operatingSubId` and the run; it removes and writes a ticket's lines in the ticket's one piece of work and never on a locked ticket (the database refuses both).~~ ✅ ADR-359. ~~**For 1.8.2:** the lock's unlock columns and batch, and the two guards then asking only about live locks; `InvoiceLock` holds no project and doesn't hold its field event to a unit rate one.~~ ✅ built, ADR-363.
- **C17.** ~~A transaction **insert** on an invoice-locked load isn't refused by the database (it's the
  worker's "regenerate only un-invoiced tickets", ADR-090);~~ ✅ refused since ADR-358, on a load, a haul-out and a unit rate ticket (`transaction_refuse_on_locked_ticket`). ~~**Task 1.8.2:** unlocking needs an unlock column, since an
  `InvoiceLock` can't be deleted (ADR-270 (6)); both guards then read only locks not unlocked.~~ ✅ built, ADR-363.
- **C18.** ✅ **done (ADR-361): a contractor user sees its own tickets, told by the certification.** ~~Field events and completed loads carry no contractor yet, so **a contractor viewer sees none
  of them** (fail closed): **task 1.7.3** (ADR-358).~~ ~~a prime's view of its subs' transactions comes with the operating sub
  (ADR-270 (7)).~~ ✅ built, ADR-358: a line carries its prime and its operating sub, and a contractor user sees its own contractor's lines as either.
- **C19.** ~~Where a person's **void** is recorded (the status column is the worker's today; ADR-270 (2)).~~ ✅ `TicketVoid`, its own record (ADR-363); the worker reading it is task 1.8.4's (C78).
- **C29. Times the database stamps itself** (`audit_record.occurred_at`; **not** `created_at` or `enrolled_at`, which Prisma's client fills with the app's clock, KD-68) use its own clock, not the story's (ADR-275): a story asserts the audit log's order, not its times. If the golden mission must assert them, decide then (e.g. the API stating the time it writes).
- ~~**C30. The golden mission as a story**~~ ✅ done, ADR-368 (REQ-017 stays open until it runs; REQ-142, REQ-143): its setup, days, reviews, ledger and audit rows asserted exactly; the worker's writes through the `worker` client as `systemActor`; add stories to `packages/scenarios/src/stories/index.ts`.
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
- **C43. Numbering** (ADR-281 (5)) — **done by task 1.3.2 (ADR-323)** but for where a firm's Monitor ID series starts if it isn't `M000001` (no task needs it yet; Phase 4's setup screens): `NumberBlock` holds only a block's range, last used number and
  how it ended. Still to come with tickets and numbers: the project's series and control ranges, the
  allocator (the server is the only one, ADR-065), **a database refusal of overlapping blocks** (an
  exclusion constraint; **`btree_gist` is in since ADR-310**, in the schema `extensions`, so no ADR
  of its own is needed: `pay_item_bands_never_overlap` is the idiom), which block an ROE's number comes
  from (ADR-181), and where a firm's Monitor ID series starts if it isn't `M000001`.
- **C44. Back-office-created field events** — **built by task 1.3.3 (ADR-324)**: `field_event_source_check`. **Flagged since ADR-345, at the user's word: `ASSIGNMENT_ON_ANOTHER_PROJECT`.** Was: (ADR-156; ADR-281 (9)): they have no phone and no
  assignment, so `FieldEvent.deviceId`, `assignmentId` and `setupVersion` become optional for them (with
  a check that a phone's record still carries all three). The engine flags an event whose project
  differs from its assignment's (the database doesn't refuse it).
- ~~**C50.**~~ **Done (ADR-349, task 1.5.8): the three questions are `apps/worker`'s `MapServers`; left: private roads under `shortest` (for the user), and where a mileage's two ends are kept (1.5.9).** Was: **What the worker asks the map servers, and where the answer is kept** (ADR-282 (11); REQ-126f):
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
  `SiteFacts` says so in setup. ~~The two flags are 1.5.6's.~~ **The two flags are built (ADR-346: AC-06-67, 68); C52 is done but for 1.6.3's "no lines".** With `DisposalSite`'s real
  model (C42): setup refuses the mark on any other site type and refuses changing a marked site's
  type; decide whether the database refuses it too (the type is a list row acted on by its fixed
  key, so a plain check constraint can't see it; a guard needs its own migration and test). An
  acceptance scenario: a haul-out that left a landfill is flagged `SITE_NOT_FOR_HAUL_OUTS`; one
  dumped back at the TDSR it left is flagged `HAUL_OUT_DUMPED_AT_TDSR` and not priced.
- **C53 (first part ✅ done, ADR-316: `apps/api/src/policy.ts`, handed to `ProjectSetup`). Where a server app reads the policy values, and whether an installation may override one**
  (ADR-303 (3)). The release's built-in defaults are `packages/domain/policy.env`; today only the
  scenario harness reads it (`packages/scenarios/src/policy.ts`). **Task 1.1.11:** the API's setup
  service that creates a project takes the `Policy` (the harness hands it over; the loader moves
  beside the service). **Task 1.5.5: none added (ADR-344 (13)): the clock threshold has no recorded number and nothing to read until Phase 2's sync record, and the other time checks have no tolerance. Phase 2:** the worker's own thresholds (ARCHITECTURE §10: the clock
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
- **C56 (✅ done, ADR-321: a typed sub's place, `SubPlaces`; the merge, `ContractorSetup.merge`; a certification's prime and subs held by foreign keys). What a contractor merge moves, and who names a prime next** (ADR-305 (2), (4)). **Task
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
- **C57 (✅ done: the reader, ADR-316, `MapShapes`; point-in-polygon, ADR-346, `ShapeArea`). Reading a shape, its bounding box, and point-in-polygon** (ADR-311 (6)). The database
  keeps a GeoJSON `Polygon` or `MultiPolygon` and four bounding-box columns, and checks only that the
  shape holds its type and coordinates and that the box is on the earth; **whoever writes a shape
  works out its box**. **Task 1.1.11** (the setup story through the API's services, which load P1's
  map): a `packages/domain` reader that takes a GeoJSON geometry, Feature or FeatureCollection,
  refuses anything but closed polygon rings in WGS84 ranges, merges features of one zone name into a
  MultiPolygon, and gives the bounding box (no dependency, or one pinned by an ADR). **Task 1.5.x
  (the zone and site-area checks):** point-in-polygon in the same module, a point on an edge
  inside (ARCHITECTURE §3), the box as a quick first test. A shapefile, KML and an Esri layer link
  are REQ-124b's import in the back office (Phase 4), with their libraries' ADRs.
- **C58 (task 1.1.11's part ✅ done, ADR-316). What the rules' build left for later** (ADR-313 (8), (10)). **Task 1.1.11** (the setup
  story through the API's services): the service that saves a rule calls `ProjectRules.check` first
  and saves nothing on a refusal; the pay item service matches `PaysWhen.rules(…)` to the rules the
  pay item already keeps (change, add, archive), and gives each picked value its `gone` (archived,
  or a zone name the current map lacks). ~~**Task 1.6.1** (the engine): an *Item* line compares the
  count of its one picked item, IS EMPTY / IS NOT EMPTY ask whether the ticket lists it; the same #
  added twice by one rule is flagged like two rules adding it.~~ ✅ written as AC-07-36 and AC-07-78 (ADR-353); built by 1.6.2 and 1.6.3. ~~**Task 1.6.4** (the setup check):
  decide what an archived pay item, contract or form does to a rule that names it (`spec/RULES.md`
  §7 speaks only of a criterion's value), and list it.~~ ✅ ADR-357 (2): the rule is not valid, never runs, and is listed.
- **C59. What the viewers' build left for later** (ADR-315 (1), (2), (3), (8)). **Every later
  schema task:** a new table a client user or an auditor should see gets `SELECT guard_viewer(…)`
  in its guard migration and a row in `packages/db/test/support/viewers.ts`; one nobody should see
  goes in that file's `unseenTables`; a viewed table that gains a column reruns `guard_viewer`.
  ~~**Task 1.2.3** (certifications): a certification's viewer sight, without the driver's licence
  number (AC-02-71's other half).~~ ✅ done, ADR-321 (a contractor user's sight of its own
  certifications: 1.7.3). ~~**Task 1.3.3** (field events in full): who recorded a ticket, by
  name and Monitor ID, for a client user and an auditor (no viewer reads `user` today), and the
  ticket's viewer view in its real shape.~~ ✅ done, ADR-324 (`viewer_field_event_monitor`; a back-office creator's name for a viewer is left to the task that gives viewers the back office's records). **Tasks 1.2.3 and 1.7.3** (C18; moved from 1.7.1 by ADR-358): what a contractor user
  needs of setup to read its own tickets and transactions (a debris type's, a site's, a pay item's
  name), and a prime's sight of its subs' through `project_contractor`; it sees no setup today.
  **Phase 2:** the API states `adms.viewer_id` on every `adms_readonly` request (C22); it reads a
  manager/analyst's permissions that aren't archived, and only on a manager/analyst (the database
  doesn't tie a grant to a role); it never gives a viewer a project or a kind the admin didn't.
- **C60. What the setup services left for later** (ADR-316 (2), (9)). **Phase 2:** the endpoints
  read who may do setup (an admin, or a manager/analyst granted Setup) before a call, map a
  refusal by the database's constraints to an answer, and add people's own services. **The task
  that first sets up a crew-day pay item:** its day length starts at the policy value
  `CREW_DAY_HOURS` in `PayItemSetup` (today the caller states it). **Each later list a firm adds
  to** gets its method on `ListSetup` with the task that needs it. ~~**Task 1.2.3:** a sub typed in
  at certification is written by a service beside `ContractorSetup.addPrime`.~~ ✅ done, ADR-321
  (`SubPlaces`). **Task 1.9.x (the
  golden mission):** whether P2 has a map (102001's zone), and the phones, people and viewers of
  §1, written through services. **Any guard that tells "the same piece of work" by a time**
  needs that column stamped by the database (`dbgenerated`), never `@default(now())` (KD-68).
- **C61. What the certification scenarios left for the tasks that build them** (ADR-317;
  `spec/acceptance/03-certification.md`, "Left to the task that builds it", fourteen points).
  ~~**Task 1.2.2:** a zero or missing measurement, boxes that subtract more than the primary holds;
  which roundings are "a step" inside one shape's formula; and the measured boxes of `730415`,
  `730416` and `730419` recorded in `spec/CONVENTIONS.md` §6.~~ ✅ done, ADR-320 (no capacity and a
  plain reason; every operation a step). **Task 1.2.3 ✅ done, ADR-321** (and from ADR-320: what its service does
  with measurements that give no capacity, whether the database takes a 0 CY container, and the
  example world's boxes written into `example-world.ts` from CONVENTIONS §6): **also** how the database
  holds "a container has boxes"; a certification's subs held to its own prime's; a typed sub that
  is another prime's; what a merge moves (C56); a vehicle type's *certifies* against the kind;
  whether a certifying assignment or a helper's assignment is checked; the date "replaced on" is;
  a contractor user's sight (C59); the audit domain; a copy's photographs; and the example world's
  certifying assignment (Sam Grant, Saturday 10 October 2026, with Lee Morgan), Tidewater Hauling
  and `730420`. **Task 1.5.5:** whether a tag is expired on its expiry date or the day after, and
  which of a field event's times is the work time. **Task 1.8.2:** what QC Void on a certification
  does to its tickets. ~~**Task 1.9.1 (KD-69):** ticket 102001's cert number on P2 needs the user's
  word~~ **answered (ADR-318):** P2 has its own certification `730416` (Rivera's self-loader, 48
  CY), which task 1.2.3 writes into the example world.
- **C62. What the certification's records left for later** (ADR-321). ~~**Task 1.3.2** (numbering)~~ **done (ADR-323): `copy` takes the other project's next number from the allocator; `certify`'s is the phone's, from its block.** Was:
  the cert number is the caller's today; the allocator issues it from the project's series, in
  100-number blocks per certifying phone (REQ-106a), and `Certifications.copy` takes the other
  project's next number from it. ~~**Task 1.3.3** (field events in full): a field event's
  `certificationId` and its own copy of the number (AC-03-40); no driver column on it (AC-03-16's
  other half).~~ ✅ done, ADR-324. **Tasks 1.4.2 and 1.5.2:** who fills `certificationId` (intake looks the scanned number up on the project; the worker again when the certification arrives later); the harness's phones send the number only. ~~**Milestone 1.3, with `Photo`:** a certification's five views, and whether a copy
  points at the original's photographs or holds its own (C61 point 14).~~ **Done (ADR-326):** `PhotoView` on a certification's photograph; a copy's photographs are the original's, through `copiedFromId`. **Task 1.5.5** (the
  flags): tag expired, revoked, replaced ("replaced on" is the new certification's certified time
  as a day in the project's time zone; whether work on that same day is flagged is decided there),
  no certification, typed capacity, a missing photograph; nothing flags a certification made
  without a certifying assignment. ~~**Task 1.7.1:** a transaction's prime and operating sub from the
  certification (the lowest tier filled)~~ ✅ ADR-358 (`TicketRead.operatingSubId`; the worker hands it to pricing in 1.7.2); **task 1.7.3:** a contractor user's sight of its own certifications
  (C18). **Task 1.8.2:** the QC mark; `signaturesOnFile` is set by `Certifications.signaturesOnFile`
  today. **Task 1.8.3:** after `Certifications.measure`, every ticket on the certification
  reprocesses, an invoiced one unlocked first (AC-03-52); a corrected copy flags its original
  (AC-03-57). **Phase 2:** only an admin revokes; the sync endpoint wraps `certify`; a merge that
  finds rule picks, employers or viewers naming the duplicate says so (today they are left as they
  are). **Any later migration:** `prisma migrate dev --create-only` must give an empty stub; if it
  carries a line nobody asked for, a `dbgenerated` default is being read back differently (KD-70).
- **C63. What the capture scenarios left for the tasks that build them** (ADR-322;
  `spec/acceptance/04-field-capture.md`, "Left to the task that builds it", eighteen points).
  ~~**Task 1.3.2:** what a reclaimed block's unused numbers become; the ROE series' block size and
  the look of an issued ROE number; whether control ranges may overlap.~~ **Decided (ADR-323).** ~~**Task 1.3.3:** whether
  the database requires a typed number's reason; "keyed in by hand" and the typed capacity both or
  neither; a load on a crew's certification (or a unit rate event on a container's).~~ **Decided (ADR-324):** a reason only on a typed number, and a typed number without one taken; a typed capacity only when keyed in by hand; either kind of certification taken. **Task 1.5.5:** how `TYPED_TICKET_NUMBER` reads with no reason; whether a load on a crew's certification is flagged. **Each of
  1.3.3…1.3.6:** a client user's and an auditor's sight of each new evidence table, and its audit
  domain (C59). ~~**Task 1.3.4:** whether a picked debris type, field tag, ROE, payable type and pay
  item are held to the event's own project (a debris type to its workflow's form); a suffix off a
  collection, and what a suffix may be; a suffixed collection on a project that doesn't allow
  split loads; a disposal with two quantities; an itemised event's own count, quarter hours, a
  stump "as a circumference".~~ **Decided (ADR-325):** a debris type held to its own project's form for its workflow, a field tag and a pay item to its project; a suffix only on a collection or a haul-out collection, capital letters; the rest taken, for a flag. ~~**Task 1.3.5:** `FieldEvent.scaleReceiptId` joins with `ScaleReceipt` (only on a disposal and a haul-out disposal; `guard_table` and `guard_viewer` rerun; AC-04-38, 39, 52, 75), and whether a count and a scale receipt together are taken.~~ **Done (ADR-326): joined; a count, or a load call, beside a scale receipt is taken.** ~~**Task 1.3.6:** `FieldEvent.roeId` joins with `Roe` (AC-04-82's other half).~~ **Done (ADR-327).** ~~**Task 1.3.7:** the harness's phone sends the kind-specific details (`RecordedEvent` has none yet), and its intake reads the debris type's form from the project and workflow.~~ **Done (ADR-332).** **Tasks 1.5.5 and 1.5.7:** no flag exists for a unit rate ticket with no kind of work, payable type or count, a pile with no load call, an item that isn't its kind of work's, a pay item that isn't its payable type's, hours that aren't quarter hours, or a stump read as a circumference; each is decided there. **Task 1.5.4:** which quantity bills on a disposal that holds both a load call and a count. **Task 1.8.3:** how a correction takes an item line or a carried ticket off (nothing is deleted), and that a field event with lines can't change kind. ~~**Task 1.3.5:** a ticket's photographs (each event's own; where
  eight is counted), a copied certification's (C61 point 14), and how a tandem's two disposals send
  one receipt.~~ **Decided (ADR-326):** each field event's own, the database counts none; a copy holds none of its own; one receipt whose id both disposals carry. **Task 1.4.2:** a disposal
  whose scale receipt's number is already on the project (the receipt is refused; the monitor's record must not be lost). ~~**Task 1.3.6:** where an incident keeps the truck it concerns; an ROE's setup
  version and what a monitor may change on one after their shift.~~ **Decided (ADR-327):** in its parties and description, no certification named; no setup version, edited freely and audited (what a phone offers after the shift: Phase 3). ~~**Task 1.3.7:** the harness's
  cancelled field event and a re-entered number that doesn't match.~~ **Decided (ADR-332):** a mismatch saves nothing and uses no number; a cancelled field event stays on the phone, unsent, with no number. **Tasks 1.5.5 and 1.5.7:**
  the catalogue has no flag for a control ticket scanned outside its ranges, a certification of
  the wrong kind, a split on a project that doesn't allow one, or a count of 2 where *Count is
  always 1*: each is decided there, a new flag needing its ADR.
- ~~**C20.**~~ **Done (ADR-352): one `$write` per ticket; the worker never states a person, who asked is on the run.** Was: The worker's one transaction per group, one run per project, and flagged-and-skipped groups
  (REQ-015, KD-55) use one `$write` per group (ADR-273 (3)).
- **C65. What scale receipts and photographs left for later** (ADR-326). ✅ **Task 1.3.6's part done (ADR-327).** ~~**Task 1.3.6** (ROEs and
  forms):~~ `Photo` gains `roeId`, `surveyId`, `incidentId` and `dropOffLogId`, each held to the
  photograph's own project; `photo_owner_check` is dropped and written again with them, and
  `guard_table('photo', 'EVIDENCE', 'RECORDS')` and `guard_viewer('photo', 'PROJECT', hidden =>
  ARRAY['object_key', 'depth_object_key'])` are rerun; the exact lists follow (`correctable` in
  `grants.test.ts`, the check in `catalog.test.ts`, AC-04-76's column list). **Task 1.4.2**
  (intake): `quarantinedRecordId` the same way; intake writes a scale receipt before the
  disposals that point at it, takes a tandem's second disposal with the receipt already there (the
  same id); ~~and decides what it does with a disposal whose receipt's number is already on the
  project under another id (C63 point 14)~~ (falls away, ADR-331: a number is never unique, so
  both receipts are kept); it writes a photograph's record with its fingerprints
  and key. **Tasks 1.5.4, 1.5.5 and 1.5.7** (quantities and flags): a tandem's shares; a weight
  needed but missing; a net that isn't its gross less its tare, a net of nought or below; a
  receipt whose site isn't the disposal's, or isn't a Final Disposal site; a receipt on two
  trips; a certification's missing view (`CERTIFICATION_PHOTO_MISSING`); fewer photographs than
  a pay item requires. **Task 1.7.3** (moved from 1.7.1, ADR-358): a contractor user's sight of its own tickets' scale
  receipts and photographs (C18). **Task 1.8.3:** a correction that moves a photograph to another
  owner; nothing corrects a fingerprint or a key. **Phase 2:** who makes `objectKey`, the upload
  that sets `uploadedAt`, and the check of the uploaded file against `uploadedSha256`. **Phase
  4:** a copied certification shows its original's photographs (through `copiedFromId`) to a
  viewer given only the copy's project; the review of photographs inside a ticket.
- **C66. What ROEs and forms left for later** (ADR-327). ~~**Task 1.3.7** (the harness's phones): a
  phone makes an ROE with the next number of its ROE block and sends a collection's `roeNumber`.~~ **Done on the phone (ADR-332); writing the ROE is intake's (C68).**
  **Task 1.4.2** (intake): it looks the ROE up by number on the field event's and the survey's
  project and writes `roeId` (and again when a later ROE arrives with that number); it runs
  `formAnswersSchema` on a form's answers against the version answered, and decides what it does
  with answers that don't fit (the monitor's record must not be lost); an ROE whose number is
  already on the project. **Task 1.5.7** (flags): `ROE_MISSING`, `ROE_NOT_ON_PROJECT`, an unsigned
  ROE, `ROE_OUT_OF_SCOPE` from the scope lines, `NO_PRE_WORK_SURVEY`; whether an ROE with a signed
  date but not marked signed, or a scope line's payable type that no unit rate pay item of the
  project has, is flagged. **Task 1.6.4** (the setup check) or the ROE's setup service: offering
  only the project's unit rate payable types as scope. **Task 1.7.3** (moved from 1.7.1, ADR-358): a contractor user's sight
  (none today). **Task 1.8.2:** the QC mark on an ROE and on each form (REQ-107's last part).
  **Task 1.8.3:** a correction to a form; taking a scope line off. **Phase 2:** the endpoints
  that make and edit an ROE and take a form in. **Phase 3:** what a phone lets a monitor change
  on an ROE after their shift; "GPS required" asked by the phone; a photo field's capture.
  **Phase 4:** the exports' columns for the firm's fields; whether an incident should name the
  certification it concerns as a real column (today its parties and description).
- **C67. What the user's replies of 2026-10-04 changed** (ADR-328). Each is built as its own
  task, before the task that would otherwise build on the old shape: ✅ **(a) done 2026-10-04
  (ADR-330)**, certifications are never copied: take out `Certifications.copy`, `CertificationChanges`' copy rule, the
  allocator's use in it, `copiedFromId` (a new migration, never an edit), the story
  `certification`'s copy, AC-03's copy scenarios, `adms-certifications`' copy lines,
  DATA-MODEL and C65's copied-photographs point; ✅ **(b) done 2026-10-04 (ADR-331)**, a scale receipt's number isn't unique:
  drop `@@unique([projectId, receiptNumber])` by a new migration, its test, AC-04's scenario,
  DATA-MODEL §8, `adms-scale-receipts` ("unique per project", "the same receipt number on a
  later trip"); C63 point 14 falls away; ✅ **(c) done 2026-10-04 (ADR-334)**, an incident's optional contractor, cert number
  and ROE number, and the project's setting of which are offered (on its incident form:
  `Form.incidentOffers`; **left for 1.4.2:** intake looks up the certification and the ROE an
  incident's numbers find; **Phase 3:** the phone's incident screen shows only what is offered;
  **Phase 4:** the setting on the form's setup screen, and the back office adding any of the
  three to an incident); ✅ **(d) done 2026-10-04 (ADR-336)**, a viewer's sight of
  private citizens' names, set per viewer (`User.seesPrivateCitizens`; an ROE's owner and a
  drop-off log's resident and address are shown only by `viewer_roe_citizen` and
  `viewer_drop_off_log_citizen`; **left for Phase 2:** the API states the setting from
  `ViewerSettings.starting()` when a viewer is added, and the portal reads the citizen views;
  **Phase 4:** the box on the viewer's screen, and the exports' columns for a marked viewer;
  **1.7.3** (moved from 1.7.1, ADR-358): a contractor user's sight of either table; **for the user to say:** whether free
  text, the firm's own form fields, a signed ROE form's photograph and an ROE's address count as
  naming a private citizen: none is hidden today). (a) and (b) came before
  1.3.7's story and 1.4.2's intake; (c) and (d) before 1.4.2 takes forms in.
  **From ADR-329:** ✅ **(e) done 2026-10-04 (ADR-337)**, a photograph's archive mark and label
  (`Photo.archivedAt`, `Photo.label`; two migrations; corrected by the API, audited; AC-04-102,
  103; **left for 1.4.2:** intake writes neither from a phone; **decided by the user (ADR-345): a removed photograph counts for nothing a record must have** (a certification's views built, ADR-344; a pay item's photographs: 1.5.7); **1.8.3:** the corrections' service removes, puts back and labels; **Phase 2:**
  which permission may; **Phase 4:** the screen, and what a viewer's screen and the exports do
  with a removed photograph); **(f) task 1.4.2's intake** keeps a
  field event whose GPS fix is impossible, without the fix, and flags it; **(g) new flags to
  word with the user** (1.5.5, 1.5.7): two quantities on one disposal, GPS unreadable, not a
  valid ticket number, the wrong kind of badge, a detail the phone should have required.
- **C68. What the harness's phones left for later** (ADR-332). **Task 1.4.2** (intake): the stand-in (`packages/scenarios/src/intake.ts`) gives way to the real intake, which also writes an ROE a phone made (the stand-in throws on one), looks up the certification and the ROE a number finds, runs a form's answers against its definition (the harness's phone sends `{}`: its lists hold no form definition yet), and takes each series' last used number (`SimulatedDevice.lastUsedNumber`) for the top-up. **Task 1.5.7** (the worker's own answer): `SizeBands.payItemFor` again, from the project's pay items of the payable type, kept beside the phone's (AC-04-59's second half); whether a payable type with several pay items, some with no band, needs a flag of its own (today: no band holds it, no pay item). **Task 1.9.1** (the golden mission's story): **201004 follows 201001 on one phone**; the harness passes Sam's phone over 201002 and 201003 (`passOver`, the harness's own), since the mission says they are the flag catalogue's examples: the golden story either keeps that or tells what took them; the mission's GPS fixes (only 101001 has one today), its certifications looked up, its photographs (Phase 2 for the file). **Phase 2:** the lists a phone takes become the sync contract's manifest (`phone-lists.ts` is its stand-in). **Phase 3:** the phone's screens, its own duplicate check, what a cancelled field event shows, whether a typed number is entered twice, and whether hand re-entry stays (ADR-209).
- **C64. What numbering left for later** (ADR-323). **Task 1.3.6** (ROEs): a phone-made ROE's number is the next of its phone's ROE block, written by `NumberSeriesRules('ROE').written` (`R-0007`); a typed paper number kept as typed. *(ADR-327: `roe.roe_number` keeps either as written; the phone that takes the next of its block is the harness's, 1.3.7, and intake's, 1.4.2.)* ~~**Task 1.3.7** (the harness's phones): a phone gives its field event the next number of its block (`PhoneNumbers.next`), and a certifying phone its cert number.~~ **Done (ADR-332: `SimulatedDevice.complete` with `made`, `takeCertNumber`).** **Task 1.4.2 / Phase 2** (sync): the sync carries each series' last used number and calls `NumberAllocator.topUp`; a top-up thrown because the series moved on is asked again; a lost phone's blocks are retired after its last sync and wipe (ADR-134), a reset phone's reclaimed. **Task 1.5.5:** whether a control ticket scanned outside the entered ranges is flagged after sync (no such flag in the catalogue). **Phase 4:** setup's screen suggests a cert-number seed "that doesn't look made up" (Q-96); today the firm states it, and a project without one types its cert numbers. **Not guarded, on purpose:** a series' next number going back (the exclusion constraint then refuses the block).

**For Phase 2 (API, worker, apps) and the demo deploy**
- **C21.** Sign-in refuses role `SYSTEM`; the system actor never gets a password (ADR-273 (4)). A
  password hash or an authenticator secret on `user` is named on its audit trigger, so it's kept out
  of the audit log as the master passcode's hash is (ADR-281 (7)).
- **C22. Nothing states the viewer yet.** `$write` states the actor; the read-only portal must state
  **`adms.viewer_id`, the viewer's own id** (since ADR-315; no longer their projects and contractor,
  which the database now reads from their record) on every `adms_readonly` request, from one
  shared place like `$write` (ADR-270 (7)). Unstated, a viewer sees nothing.
- **C69. What intake left for later** (ADR-338). **Task 1.5.2, 1.5.3** (the worker): it never reads `quarantined_record`; how reconciliation is queued (05-sync.md point 13); a certification that arrives after the field events that scanned its number (C62). **Task 1.5.5, 1.5.7** (the flags, their wording with the user, C67 (g)): `FieldEvent.unreadableGps` raises "GPS unreadable"; a ticket number that isn't digits pairs with nothing; whether a form's dropped fix (kept only in its insert's audit reason) needs anything more; a form whose answers don't fit its definition (saved as sent today, told only to the sender); `DEVICE_CLOCK_OFF` without `Sync` (point 15). **Task 1.8.x** (review): resolving a quarantined record (it becomes a field event, or an ROE, that keeps its phone-made id; its photographs move; `resolvedById`, `resolvedAt`, `resolution` written, the resolution's words decided then); a quarantined disposal's scale receipt, saved and pointed at by nothing until then; a quarantined ROE (renumber it, or void it). **Phase 2** (the API): the endpoint, the phone's proof of itself, `Sync` and `SyncedRecord`, the edit log; **what a record the database's constraints refuse is answered** (today intake throws and it stays on the phone: an unknown project, phone, monitor or assignment, a pick that isn't the project's, a detail on the wrong kind, a photograph before its owner); the photograph's upload, its real place in storage and uploaded fingerprint (the phone states them today); a survey's, an ROE's and a certification's photographs; an unplanned assignment's own arrival; the cert numbers' top-up at a sync told as a story (AC-05-47's other half); a lost phone that held blocks, retired after its last sync (AC-05-56's other half; `numbering` retires one without the sync); the burst under load. **Phase 3:** the phone shows a record "not saved"; a reset phone's blocks reclaimed (`NumberAllocator.reclaim`); the phone's form definitions (the harness's phone holds none: the story sends answers by hand). **For the user, when they read ADR-338:** the quarantine of an ROE; first received holds the number; the wording; a viewer's sight of a quarantined record.
- **C31. The sync stand-in goes** (ADR-275 (3)): ~~first part~~ **done (ADR-338: the stories sync through `apps/api`'s `Intake`; the endpoint in front of it is Phase 2's).** `packages/scenarios/src/intake.ts` writes straight through `$write`; once the API's sync endpoint exists, stories sync through it (duplicates, quarantine, the idempotency ledger). The UUIDv7 maker (`packages/scenarios/src/ids.ts`) moves to `packages/domain` when the field app needs it, so phone and harness share one.
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

- **C70. What the reconciliation scenarios left for the tasks that build them** (ADR-339;
  `spec/acceptance/06-reconciliation.md`, "Left to the task that builds it", eighteen points).
  ~~**Task 1.5.2:** how reconciliation is queued (with 1.5.9); who points a field event at a
  certification made later.~~ **1.5.2's half is decided (ADR-340): it added no queue record, and the worker has no right to write `certification_id`. Task 1.5.9:** how the worker finds the tickets to work (a record of its own, or what was received or changed since its last run). **Task 1.5.5:** who points a field event at a certification made later (the API, which writes that column), and what queues its tickets. **Left by 1.5.2 (ADR-340): task 1.5.3**, the kind of field event a completed record names is the grouping's to keep (the database holds the project and the uniqueness); **tasks 1.5.4, 1.5.5**, which figures a completed record carries when a check fails (nothing ties them to `quantitySource`; `pileLoadCall` has no range); **task 1.7.3** (moved from 1.7.1, ADR-358), a contractor user's sight of completed records and flags (C18); **task 1.8.x**, a flag's acceptance as a mark, and whether a viewer is ever shown a run. **Left by 1.5.3 (ADR-341): task 1.5.5**, `SPLIT_SUFFIX_GAP` from `Ticket.splitShape` (its words for a bare collection, point 6); the flag, the status and the billing of a field event whose number isn't digits (`Tickets.notTicketNumbers`: in no ticket today, a unit rate event included; with the user, C67 (g)); a unit rate ticket's time and the day in the project's time zone; **task 1.5.9**, reading a ticket's field events and its raised flags from the database, the run's list from `Tickets.pending`, a `Ticket` that throws on a second field event of one kind (`NOT_PROCESSED`); **tasks 1.6.3, 1.8.x**, how a voided ticket is kept from the worker's three statuses. ~~**Task 1.5.4:** who takes the remainder of rounded shares; which
  quantity bills beside a count.~~ **Decided (ADR-343): the largest share, the last of equals; the paying pay item says which quantity bills. Left by 1.5.4: task 1.5.5**, a flag's words for a split load whose shares can't be worked out (an estimate missing, every estimate nought: `LoadQuantitiesWorked.sharesNotWorkedOut`; none in the catalogue), and a net read from one figure that disagrees with another on the receipt (`ScaleWeight.net` takes tons as written first); **task 1.5.7**, `PILE_CALL_NOT_HIGHER` from `pileCallNotHigher`, a pile with no call (`pileCallMissing`), `SHARED_SCALE_WEIGHT` and `SCALE_WEIGHT_UNUSABLE` from `ScaleWeight`, a shared weight where a container has no capacity (no share is given to either); **task 1.5.9**, finding the disposals that share one receipt and handing each its share, reading a carried ticket's stump diameter and item count, writing the figures (a pile row's `pile_load_call` is nought when no pile is shared out); **task 1.6.3**, `quantityFor` for each line, a unit rate ticket's count, pounds and crew time, `QUANTITY_MISSING_FOR_PAY_ITEM` when it answers none; **task 1.6.4**, the site's lookup of what a tower asks for (not read by `quantitySource`, which says what the tower took). **Task 1.5.5: decided (ADR-344, agent defaults), all but section O's words, which were put to the user. Left by 1.5.5:** ~~with the user (C67 (g)), the codes and words of six flags~~ **answered and built (ADR-345), with three backup catches. Left by ADR-345: task 1.5.7**, `PHOTOS_MISSING` counts only photographs not removed (the user's rule), and a scale receipt's net that isn't its gross less its tare and two quantities on one disposal are still to word with the user (AC-06-158, 162); **task 1.5.9**, the worker hands `TicketChecks` the project's *Allow split loads*, its live control ranges, each certification's kind, and a field event's load call, scale receipt, kind of work, unreadable fix and assignment's project, and raises `notATicketNumber` for each of `Tickets.notTicketNumbers`; **task 1.8.3**, removing a photograph or putting it back, and taking an item line or a carried ticket off, queues its ticket's (or its certification's) reprocess, a locked ticket unlocked first; **for the user**, whether a pay item's *photos required* should take a number; **task 1.5.6, 1.5.7**, every new check raises through `Flags.raise`, saying told and facts apart, and takes its dates from `ProjectClock`; **task 1.5.9**, reading what `TicketChecks` is handed (the project's certifications with what replaced each, a field event's phone, reason and person by name, the collections of the project's other loads that aren't void, how many tickets a collection lists and the word for what the tower counted), writing a `FlagRaised` as a `Flag` (a ticket's subject as its workflow and number), `Flags.compared` against the flags standing, checking the project's certifications' views in a run, and queueing the tickets that scanned a certification made later; **Phase 2**, the sync's record with the clock difference, and the threshold's policy value (`DEVICE_CLOCK_OFF`; C53). **What 1.5.5 was left:** the work time; a tag's last day; work on the day
  a certification was replaced; the checks on a lone field event; `OVERLAPPING_LOADS` while a
  disposal hasn't synced and after the phantom is voided (both tickets flagged is settled, ADR-342; the agent recommends the flag clears once the phantom is voided); a bare collection's words; the
  flags of ADR-329 (section O) and the gaps with no flag, worded with the user (C67 (g));
  `DEVICE_CLOCK_OFF` in Phase 1; the worker's thresholds as policy values (C53); when a flag on
  a certification is raised. ~~**Task 1.5.6:** a project with no map; a haul-out collection's zone; a site with no GPS; a disposal on the close date; when a site's flag is raised.~~ **Decided (ADR-346, agent defaults). Left by 1.5.6: task 1.5.8**, the flagged straight-line mileage from `Distance`; **task 1.5.9**, handing `PlaceChecks` the newest map version (zones in the version's order), each site with its current shape version and the project's circle, writing each `ZoneAttached`, checking the sites' permits in a run, and a new map version, circle or site shape reprocessing un-invoiced tickets; **task 1.6.3**, `TIPPING_FEE_RULE_MISSING` and no lines after `HAUL_OUT_DUMPED_AT_TDSR`; **for the user**, the four points in ADR-346 (5), (7), (10) and (1). **What 1.5.6 was left:** a project with no map; a haul-out collection's zone;
  a site with no GPS; a disposal on the close date; when a site's flag is raised. ~~**Task 1.5.7:**
  whether a ticket's ROE flag puts it in review; a removed photograph against the required ones;
  `301005`'s second flag; the crew-hours limit as a policy value and the tickets it is raised on.~~ **Decided (ADR-347, agent defaults). Left by 1.5.7:** ~~with the user, the code and words of two flags (AC-06-158, 162)~~ **approved and built (ADR-348); task 1.5.9**, the worker hands `QuantityChecks` the project's limits, each receipt with every disposal that points at it (their capacities and debris types) and the carried tickets as found, `UnitRateChecks` the unit rate pay items, the stump switch, the policy value `CREW_DAY_HOURS` and the project's other crew-time field events, `RoeChecks` the program type's *requires ROE*, each ROE found with its live scope, and the project's surveys; writes `workedOutPayItemId`; counts a ticket's ROE flags in its status; **task 1.6.3**, `QUANTITY_MISSING_FOR_PAY_ITEM`, `FILL_WITHOUT_EXPOSED_ROOT_BALL` (the second stump switch), *Count is always 1* making the count 1; **for the user**, the points in ADR-347 marked raised (24 in as FEMA's fixed test; the crew's day; which ticket carries the crew-hours flag; both loads flagged for one carried ticket; a blank receipt not "unusable").
  **Left by 1.5.8 (ADR-349): task 1.5.9**, the worker's map settings read from its env file and written by the installer (both servers' addresses, the certificate authority, the map extract's SHA-256); handing `Mileages.between` each collection's end GPS and its site's GPS (a load's disposal site, a haul-out's), with the mileage the row already holds; **how the run knows an end moved since a mileage was written, with no new column** (the user, ADR-350 (3): the correction that queued the ticket, or the audit records of the collection's end GPS and the site's GPS), handing `Mileages.between` the row's mileage as `standing` only while neither has; a collection with no fix (no mileage, the row's columns empty); writing the mileage and `Mileage.noRoadRoute`'s flag; a map server that doesn't answer as an errored ticket; the stories that reconcile on the stand-in points of `spec/CONVENTIONS.md` §6; ~~**for the user**, private roads under `shortest`, and whether every fixture and P1's map move to the pinned extract~~ **answered (ADR-350): built, and task 1.5.8a; task 1.7.1** ✅ (ADR-358, AC-07-89), a transaction names its property's or pile's collection row, so its mileage is read beside it; **Phase 4**, the Transactions export's `mileage, mileage_source, map_data_date`.
  ~~**Task 1.5.9:** an errored ticket's status; the person stated for a reprocess (C20); how a
  pending ticket is listed.~~ **Decided and built (ADR-352), with every "task 1.5.9" point above but those in C71.** **For the user:** the file's approval (KD-71 (1) answered, ADR-342).
- **C71. What the worker's run left** (ADR-352). **Phase 2 (the job queue and the worker's process):** what starts a run and for which project; working only the tickets a job names instead of the whole project (the run reads every field event of the project each time); the worker's map settings in its env file, written by the installer (both servers' addresses, the certificate authority, the map extract's SHA-256: C70 left it to 1.5.9, and nothing reads them until the worker has a process), and the longest a run may hold its lock as a setting; the queueing of tickets that scanned a certification made later (AC-06-36). **Task 1.6.3:** the rules run inside the ticket's one piece of work, after the quantity; no lines after `HAUL_OUT_DUMPED_AT_TDSR`; what an errored ticket's `NOT_PROCESSED` ("not billed") does to lines it already has. **Tasks 1.6.3, 1.8.x:** a voided ticket (the run leaves void field events out today); a ticket locked as invoiced left as it is (AC-06-03). **Task 1.8.x:** a flag's acceptance read by the run (`TicketWork` takes none as accepted), and kept when its field event is renumbered (the run clears the flag under the old number and raises it anew, ADR-352 (9)); AC-06-139, 140. **Tasks 1.9.1, 1.9.2:** stories for what the run reads and no story tells yet: a load that carries tickets, a tandem's shared weight, P2's split load, control ranges, a site's own shape, a new map version, a replaced or revoked certification, surveys; AC-06-05 (any arrival order, the worker's half) and AC-06-36.
- **C72. What the pricing scenarios left for the tasks that build them** (ADR-353; `spec/acceptance/07-pricing-ledger-audit.md`, "Left to the task that builds it", eighteen points). **Put to the user first if the task can't settle it from a record, because it could change money:** how an amount is rounded to the cent (point 1, task 1.6.3); a crew day's decimals and hours that fall in no step (2, 1.6.3); ~~what a criterion does when what it reads is empty (3, 1.6.2)~~ ✅ the user, 2026-10-05: it never passes (ADR-354); which lines stay under a flag that says "not billed" (4, 1.6.3). ~~**Task 1.6.2:** *Contractor* with a sub picked, text and case, a typed number against a figure of more decimals (11); *Zone* by name across map versions, an archived rule (12); *Unit count* and *Item* on other itemised tickets (13).~~ ✅ agent defaults, ADR-354. **Left by 1.6.2 for 1.6.3:** the worker reads the rules (as `RuleEntry`s), the contracts with their primes, each certification's prime, every zone of every map version by name, and a field event's `fieldTag` and `address`, and calls `TicketReadings` and `TicketRules.passing` inside the ticket's piece of work; a ticket whose prime isn't known is run on only by rules with no contract (which pricing flag it gets is point 5); a rule whose contract is archived or missing runs on nothing (1.6.4 lists it). **Task 1.6.3:** which pricing flags join a ticket whose rules don't run (5); a removed tipping fee line, a ticket whose only line was removed, a *Remove* of nothing (6); a $0 pay item and `NO_RATE_FOR_PRIME` (7); a TBN line and its ticket's status (8); `QUANTITY_MISSING_FOR_PAY_ITEM` on a fill line and on a load that carries nothing (9); the other slots when one # is added twice (10); *Quantity from* off white goods (13); white goods as `spec/RULES.md` §9's rules (14); a voided ticket and where a rule's void is kept (18). ~~**Task 1.6.4:** an archived pay item, contract or form under a rule (12; C58).~~ ✅ ADR-357 (2). ~~**Task 1.7.1:** the operating sub on a second-tier sub's truck and on mismatched cert numbers; a transaction held to its own project (15); the ten Phase 0 tests take their AC-07 IDs (AC-07-88, 90, 96, 97, 104…109).~~ ✅ ADR-358. ~~**Task 1.7.2:** whether an unchanged reprocess rewrites the lines, and a ticket that is pending again (16); finding the tickets a rate or rule change affects, and Show matches' count (17); its story's figure, $5,059.00 on 18 lines (AC-07-112).~~ ✅ ADR-359 (the figure corrected: 17 lines, $4,879.00, then 19 lines, $5,400.25). **For the user:** the file's approval.
- **C74. What ADR-356 and task 1.6.4 left** (ADR-356, 357). **✅ The override is in since 2026-10-06 (ADR-372, the user: the one version let past the seven-day rule by name). Still owed, the first session on or after 2026-10-07 14:08 UTC: delete the `minimumReleaseAgeExclude` entry in `pnpm-workspace.yaml` (the override stays), `pnpm install --frozen-lockfile` → the lockfile passes the policy.** Was: **The first session on or after 2026-10-07 14:08 UTC, before its task:** the `source-map-js` fix: `overrides:` → `source-map-js: 1.2.2` in `pnpm-workspace.yaml` (a comment naming ADR-356), `pnpm install`, the clean-copy check (`adms-verify` §1.1), `pnpm licences`, `pnpm security` → `7 passed, 0 failed`; then `adms-verify`'s security row and `NEXT.md` say so. ~~**Task 1.7.2 (the worker prices):** read the rules with their archive marks (as `RuleBook.entries()` does: `formArchived`, `contract.archived`, an action's `payItem.archived`), so a rule naming something archived doesn't run; hand pricing every pay item, archived ones too.~~ ✅ ADR-359 (`packages/db`'s `RuleRows`, the one reading). **Task 1.9.1 (the golden mission's story) or Phase 2:** a service in `apps/api` that reads a project's setup into `SetupChecked` and `LookupSetup` (live primes, contracts, forms, debris types and sites; every pay item and rule) and answers the check and a site's lookup; the harness's tower phone asking from its site's lookup instead of being told. **Phase 2/3:** the lookup with a phone's lists, by setup version. **Phase 4:** the check's screen and the lookup on the site's page. **For the user:** ADR-357 (2) (an archived pay item, contract or form stops its rule); whether the check should also list "two debris types that look alike" (ADR-229 named it; no approved page does) and a prime with a contract and no rule for a debris type.
- **C75. What task 1.7.2 left** (ADR-359). ~~**Task 1.8.2 (the lock in full):** the worker's `lockedAsInvoiced` counts any `InvoiceLock` row; once a lock can be lifted it asks only about live locks, like the two database guards (C16); an unlocked ticket is then worked by the next run with no more done.~~ ✅ ADR-363. ~~**Task 1.8.3 (corrections):** the story `p1-priced` writes a correction, a rate change and a lock as the API's login may; the services take them over.~~ ✅ ADR-364: a correction goes through `Corrections` in the story `p1-reviewed`; `p1-priced` keeps its direct write, which shows only what the worker does; a rate change is setup's, a lock 1.8.5's. ~~**Task 1.8.4 (voids; the user, ADR-360):** a void stays until a person unvoids it, whoever voided it: the run leaves every `VOID` field event out. The unvoid must lift a rule's void too (no `TicketVoid` row stands behind one: the worker set the status), put the ticket back in the run, and the rule voids it again if it still passes; a person's void needs its lines removed when it is made; whether a voided ticket's check flags are cleared or kept out of the review queue; AC-07-95's person's half and AC-07-45's unvoid.~~ ✅ ADR-365: `Voids.lift` lifts a person's void and puts a rule-voided ticket back in the run; the lines go in the run the void asks for; a void ticket's flags are cleared. **Tasks 1.9.1, 1.9.2:** AC-07-63's reprocess (a TBN pay item's rate agreed), a split load priced by the worker (P2's 102001), a load that carries tickets, a `NO_RATE_FOR_PRIME` and a `TIPPING_FEE_RULE_MISSING` cleared by setup, each as a story. **Phase 2 (the user's rule, ADR-360):** the queue holds only what is active or was changed; a settled ticket (voided, or worked and unchanged) stays off it until it or its setup is edited. The job queue names the tickets a sync, a correction or a setup change touches, and the run works only those: today a run still works out every ticket that isn't void. **Phase 4:** *Show matches*' counts. ~~**For the user:** KD-73; ADR-359 (5), (2), (8), (9); the corrected AC-07-112.~~ ✅ answered 2026-10-06 (ADR-360).
- **C76. What task 1.7.3 left** (ADR-361). **Every later schema task:** a rerun of `guard_viewer`
  on `certification`, `project_contractor`, `field_event`, a completed table, `scale_receipt` or
  `photo` repeats its `own` (copy the line from the seventy-fourth migration; `catalog.test.ts`
  fails otherwise); a new table that is part of a ticket says whether a contractor user sees its
  own rows (`own`, and `projectOrOwn` in `test/support/viewers.ts`); a new money column on
  `transaction` joins `viewer_transaction_money`, never `viewer_transaction`. ~~**Task 1.8.2 (QC
  marks, the lock in full):** whether a contractor user sees its tickets' QC status and lock.~~ ✅ ADR-363: the lock and its batch, never the QC status.
  **Phase 2:** the portal's reads join `viewer_transaction` with `viewer_transaction_money` and
  the three name views. **Phase 4 (the read-only portal):** which more names a contractor's
  screen needs (a vehicle type, a field tag, a zone, a payable type, a kind of work are ids to
  it today); the exports' columns for a sub's login, with no rate or amount. **For the user, any
  time:** whether a contractor user sees its tickets' flags; whether a first-tier sub above a
  second-tier sub sees that ticket's lines.
- **C77. What the review and closeout scenarios left for the tasks that build them** (ADR-362; `spec/acceptance/08-review-and-corrections.md` and `09-invoice-deliver-closeout.md`, "Left to the task that builds it", fourteen and eight points). ~~**Task 1.8.2 (people's marks):** each mark's audit domain and what a client user, an auditor and a contractor user see of a QC status, an acceptance, a void's reason, a lock and a batch (08 point 13, 09 point 7; C76); a QC mark on a record that is dissolved or voided under it, and QC Void on a certification (08 point 12); a batch's own rules (09 point 3); whether an unlock asks for a note (09 point 4).~~ ✅ each an agent default of ADR-363. ~~**Task 1.8.3 (corrections and renumbering):** where a permission is checked in Phase 1, which is how KD-25 closes at the engine (08 point 1); which corrections ask for a reason (4); the service that creates a record in the back office, which no task names (9); resolving a quarantined record any way but a renumber, a quarantined ROE, and the resolution's words (10); a renumber of a split's collection and of a whole ticket (11); what starts the reprocess after a reviewer's action (14); AC-03-52 and AC-09-16.~~ ✅ each an agent default of ADR-364. ~~**Task 1.8.4 (void, unvoid, accept):** KD-74, whether *correct* carries *accept flags* (08 point 2; the user's); the mission's words against the firm's list of reasons (3; also 1.9.1); what a person's void does to a whole load's completed record, flags and lines (5; C75); a correction to a void ticket (6); an acceptance through a renumber and on a pending ticket (7); taking an acceptance back (8).~~ ✅ each settled by ADR-365 (point 2 by the user). **Task 1.8.5 (QC, the lock and batches), ✅ done, ADR-367; it was:** where a change to a locked ticket is refused (09 point 1); what else a lock holds still (2); locking a ticket that bills nothing (5); what closing a project does besides the mark (6); what starts the run after an unlock (8). **Each task:** name its tests and story steps by AC-08 and AC-09 ID, and fill the earlier files' waiting rows the two files list. **For the user:** the two files' approval; KD-74.
- **C78. What task 1.8.2 left** (ADR-363). ~~**Task 1.8.3 (corrections and renumbering):** the service that puts a photograph back or removes it (C67 (e)).~~ ✅ `Corrections.photograph` (ADR-364). ~~**Carried to 1.8.4 (C79):** a renumber leaves a person's void on the number it was written for (a void names a number, not a field event): say what a renumber of a voided ticket does. **Task 1.8.4 (void, unvoid, accept):** the services `void`, `unvoid` and `accept` in `apps/api`; **the worker reads `TicketVoid`** (a void in force: `liftedAt` empty) and sets `VOID`; the unvoid lifts a rule's void too, which has no row (C75); the API checks that a reason is one offered for its use (`Reason.uses` holds `VOID` or `ACCEPT_FLAG`; the database can't, the uses are a list) and that a void's number is a ticket's; an acceptance of a flag already cleared, or taken back (08 points 7, 8: `FlagAcceptance` has no column for either), and how the worker reads an acceptance when a flag's facts change (a new flag row has no acceptance, by the unique key on the old one's).~~ ✅ ADR-365 (9), and its services and worker. **Task 1.8.5 (QC, the lock and batches), ✅ done, ADR-367; it was:** the services that set a QC mark (an upsert of the one row), lock (only a QC Approved record, ADR-121: the service's check, nothing in the database holds it), put a lock in a batch and unlock; what a QC mark changed after its ticket is locked means; the story's halves of AC-08-57, 58 and AC-09-01, 09, 17. **Task 1.9.1:** the mission's lock and batch through those services; `lockedAt` is stamped by the database's default unless stated (C29). **Phase 2:** each permission (`QC`, `LOCK_INVOICED`, `UNLOCK_INVOICED`, `VOID`, `ACCEPT_FLAG`) checked where its service is called. **Phase 4:** the report a contractor pulls by a batch's name (it reads `viewer_invoice_batch` and `viewer_invoice_lock` today); the QC columns of the exports. **For the user, any time:** ADR-363's agent defaults (`SUMMARY.md` §4), first a batch's name used once on a project and what a contractor's login sees of the marks.
- **C79. What task 1.8.3 left** (ADR-364). ~~**Task 1.8.4 (void, unvoid, accept):** the services `void`, `unvoid` and `accept` go on `ReviewService` (`VOID`, `ACCEPT_FLAG`; `PickedReason.refusal` for the reason's use); **a field event of a voided ticket that is corrected or renumbered** (08 point 6; C78): today the service changes it and answers its ticket for a run that leaves `VOID` field events out, so say what happens to it; whether an acceptance follows a field event through a renumber (08 point 7).~~ ✅ ADR-365. **Task 1.8.5 (QC, the lock and batches), ✅ done, ADR-367; it was:** whether a correction to a ticket locked as invoiced is refused by the service (09 point 1): today it is saved and the run leaves the ticket as it is, named in `reprocess.lockedAsInvoiced`; the unlock as a service (the story `p1-reviewed` writes it as the API's login may). **Task 1.9.1:** the mission's review through these services; its back-office reason and the catalogue's example say "Phone failed", which the shipped list doesn't hold ("Device failed" does): the firm adds it, or the page changes (08 point 3). **Phase 2:** each review call behind a request that checks the grant again and states the request id; the job queue takes a call's `reprocess` (today its caller asks the worker); a monitor's own reopen as the phone's edit log (`FieldEventEdit`); request schemas that refuse a load call past 100 or a blank label in plain words (today the database's check throws). **Phase 4:** the review queue reads a quarantined record's `resolution`; a line taken off shown as taken off. **No task yet:** an ROE's number corrected (its records re-pointed); the answers to a form's own fields corrected; a survey, an incident, a drop-off log or an ROE created in the back office (only a field event is built); a field event's kind or workflow changed (not offered: made again and the wrong one voided). **For the user, any time:** ADR-364's agent defaults (`SUMMARY.md` §4), first that a grant is checked in the service itself and the two ways a quarantined record is resolved.
- **C80. What task 1.8.4 left** (ADR-365). **Task 1.8.5 (QC, the lock and batches), ✅ done, ADR-367; it was:** a void or an acceptance on a ticket locked as invoiced is saved today and the run leaves the ticket as it is (named in `reprocess.lockedAsInvoiced`), like a correction (09 point 1 decides for all three); whether a voided ticket may be locked, and what QC Void on one means (the mission sets it by hand). **Task 1.9.1:** the mission's voids and acceptances through `Voids` and `Acceptances`, with its words as notes; AC-08-51 on Marsh Road TDSR itself if the mission leaves its permit outstanding (the story used Old Quarry Pit). ~~**Phase 2:** the job queue carries `reprocess.unvoided` with the job, so the unvoid of a rule's void can't be lost between the service and the run~~ ✅ ADR-366: the unvoid is a record the worker reads. **Phase 2:** each call behind a request that checks the grant again. **Phase 4:** the review queue shows an accepted flag as accepted and leaves a void ticket's cleared flags out; bulk accept. ~~**No task yet:** a record of its own for the unvoid of a rule's void~~ ✅ `TicketUnvoid` (the user, ADR-366). **No task yet:** taking an acceptance back. ~~**For the user:** ADR-365's agent defaults~~ ✅ approved 2026-10-06, with the rule of ADR-366.
- **C81. What task 1.8.5 left** (ADR-367). **Task 1.9.1:** the mission's QC, lock and batch through `QcMarks` and `InvoiceLocks` (thirteen tickets in "Bayline ROW, week of 12 Oct", AC-09-11, 31; QC Void by hand on `301003` and `301005`, AC-08-63); P2's split load `102001` QC'd and locked as one, and ROEs `R-0007`, `R-0008` and their surveys QC'd on their own (the story halves of AC-08-57, 58 and AC-09-05 that `p1-invoiced` leaves). **Phase 2:** each call behind a request that checks the grant again; the job queue takes an unlock's `reprocess`. **Phase 4:** for a set of tickets, the list of those that can't be locked and why (AC-09-08: the service refuses one at a time, in the same words); the report by a batch's name; what the screens do with a closed project, and reopening one. **No task yet:** a guard at the database on a locked ticket's field events (today the review services refuse the change and the database holds the lines); a batch renamed through a service (the database allows it, ADR-363). **For the user, any time:** ADR-367's agent defaults (`SUMMARY.md` §4).
- **C82. What task 1.9.1 left** (ADR-368). **Done by it, of what earlier items gave it:** C30; C68's (the story keeps `passOver` for `201002` and `201003`; the fixes and the certifications looked up are there; a photograph with each unit rate ticket, each ROE and each certification, none on the incident, the drop-off log or the towers' loads); C75's split load priced by the worker; C78…C81's review, QC, lock and batch through the services, and AC-09-05's P2 half. **Task 1.9.2 (✅ ADR-369, but control ranges and AC-08-51 on Marsh Road TDSR itself, C83):** C75's others (AC-07-63's reprocess, a load that carries tickets, a `NO_RATE_FOR_PRIME` and a `TIPPING_FEE_RULE_MISSING` cleared by setup), C71's (a tandem's shared weight, control ranges, a site's own shape, a new map version, a replaced or revoked certification, AC-06-05, AC-06-36), C51's two, AC-08-51 on Marsh Road TDSR itself (the mission's permit is not outstanding: `p1-voided` keeps Old Quarry Pit), and the count of scenario IDs with a passing test, by part. **Phase 2 or 3 (the certifying screen and the sync contract):** a service that takes a certification's five photographs with it (the story writes them as Sam's phone would; every other story leaves `CERTIFICATION_PHOTO_MISSING` standing on each certification); the setup check and a site's lookup as a service in `apps/api` (C74); AC-05-53's queue. **Phase 4:** what each viewer sees of the mission, as a browser test; the client package. **For the user, any time:** ADR-368 (5): the mission's audit excerpt puts `301003`'s `COMPLETED` → `VOID` on Luis's row; the engine keeps Luis's void as his record and the status change under the system (ADR-365). Say if the page should read that way.
- **C83. What task 1.9.2 left** (ADR-369). **Phase 2 (the job queue; with C71's AC-06-36):** when a certification is made after a field event scanned its number, **find the field event's `certificationId` again** (intake writes it only on arrival; the worker reads certifications by number, so the ticket bills, but a contractor user's sight hangs on the link, ADR-361), and queue the tickets that scanned it. **Phase 2 or 4 (setup services):** a rate added or changed, a pay item's unit, a project's window and a site's own shape each as a service (the story writes them as the person through the API's login). **Phase 3 (the tower's screen):** it asks for the number of **tickets** the load carries (the user, ADR-370: "the tower counts the tickets"), as the worker compares. **For the user:** `CARRIED_COUNT_MISMATCH`'s approved words name the kind of work ("tower counted 2 white goods, the collection lists 1"); say if it should read "tickets". **Not told by any story:** a project numbered from control tickets (AC-06-164, proven at the domain); ~~an expired tag on a lone collection (AC-03-50) and a certifying phone's cert numbers topped up to 100 (AC-05-47), each without a test of its own~~ (✅ each has one, ADR-371). ~~**Task 1.9.3:** count the scenarios again (`spec/acceptance/README.md`) after anything it proves.~~ ✅ ADR-371: AC-03-50 and AC-05-47 have their own test now; 693 whole, 15 in part, 52 later.
- **C73. What task 1.6.3 left** (ADR-355). ~~**Task 1.7.2 (the worker prices):** read the rules as `RuleEntry`s, the contracts with their primes, each pay item with its rates, crew conversion and steps, each certification's prime and operating sub, every zone by name, a field event's `fieldTag`, `address`, items and `rootBallHalfExposed`, each site's *Charges a tipping fee* and its fee pay items, the project's `stumpCheckFillNeedsExposure`; build each piece from `TicketReadings` and hand `TicketPricing` the checks' flags; write a `PricingFlagRaised`'s `slot` and `payItemId` to the flag's columns; count the pricing flags in the status; `voidedBy` as the ticket's void, its reason the rule (point 18; 1.8.4); a throw from pricing as `NOT_PROCESSED`, and what that does to lines the ticket already has (point 4's last part); **the name a message gives a prime** (the catalogue says "Summit", the contractor's record "Summit Debris Services": which one is handed to `primes`).~~ ✅ ADR-359 (the name is the contractor's as recorded; an errored ticket keeps its lines: KD-73). ~~**Task 1.6.4:** an archived pay item under a rule (pricing prices it today if it is handed; throws if it isn't); the setup check's warning for crew-day steps that leave gaps.~~ ✅ ADR-357: the rule is not valid and never runs; the gaps are listed. ~~**Task 1.7.1:** the operating sub on a second-tier sub's truck (point 15).~~ ✅ ADR-358: the lowest tier the certification names. **For the user:** KD-72 (a TBN ticket: in the review queue, or complete); the agent defaults of ADR-355 (6)…(14); **`pnpm security` fails on a new advisory**, GHSA-68fv-2mgg-jv7q (high, `source-map-js@1.2.1`, reached only through the test runner: `vitest` → `vite` → `postcss`): seen 2026-10-05 with no dependency changed; a fixed version to pin, or an acceptance by id with its ADR, is a dependency decision and wasn't made in a rule task. **Decided 2026-10-05 (ADR-356): the fixed 1.2.2, by an override, once it is seven days old (2026-10-07 14:08 UTC); C74.**

## Historical — Phase 1 closeout on `database/`: struck 2026-10-06 (ADR-375)

Milestones H1.1…H1.3 were the task list for the historical code (ADR-093), kept as the lessons the
rebuild must satisfy. The rebuild satisfied them: every KD they name is closed with its scenarios
(ADR-371), and the folder itself is gone. The section moved word for word to `DECISIONS.md`'s
scratchpad, "Moved 2026-10-06 (ADR-375)". Nothing in it is work to do.
