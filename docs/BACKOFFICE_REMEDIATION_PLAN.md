# Open ADMS Back Office Remediation Plan

Source: back-office walkthrough performed 09 Sep 2026, setting up STL-2026-ROW as a
data manager. Companion tracker artifact holds live per-step status.

Phases are dependency-ordered. Schema lands before the API that reads it; the API
lands before the screens that call it. Phase 1 blocks phases 2 through 7.

Decisions already made by Ryan:
- Contract intake: build line-item structure now, defer PDF extraction to the next pass.
- Documents: link registry pointing at Box/SharePoint. No files stored in the app.
- Estimates: captured per debris stream.
- Projects: a worked list at a level above any single project, clicked into like tickets.

---

## Phase 0 - Repairs that need no schema change

### 0.1 Reconcile worker write permissions
Problem: `Shell.jsx` gates the Workers nav on `worker.manage` (min_rank 20, Manager), but
`POST /users`, `PATCH /users/{id}` and `DELETE /users/{id}` in `routers/org.py` require
`user.manage` (min_rank 40, Admin). `require_permission` in `deps.py` reads the global role
only. A Manager sees the page and the button, then is refused on save.
Change: create/edit of monitor- and manager-rank workers moves to `worker.manage`.
Setting global_role to analyst or admin, and deactivation, stay on `user.manage`.
Refusal message names the permission, not the role.
Files: `backend/app/routers/org.py`, `backend/app/deps.py`, `database/seeds/001_reference.sql`, `frontend/src/pages/Records.jsx`
Done when: Manager creates and edits a monitor cleanly; Manager promoting to admin is
refused with a message naming user.manage; Admin does both.

### 0.2 Wire the service code edit path
Problem: `PATCH /service-codes/{id}` exists in `billing.py`, no screen calls it.
`Money.jsx` offers New service code and New rate only.
Change: add Edit to each service code, reusing the create modal in edit mode.
Files: `frontend/src/pages/Money.jsx`
Done when: name, description and FEMA category edits persist and the list reflects them.

### 0.3 Make the contract document link required
Problem: `contracts.document_url` nullable, marked optional in `Records.jsx`.
contract_type, status and effective_from also optional.
Change: required in the form and in a Pydantic validator rejecting non-http(s) URLs.
contract_type, status and effective_from become required. DB constraint follows in 1.9.
Files: `frontend/src/pages/Records.jsx`, `backend/app/routers/org.py`, `backend/app/crud.py`
Done when: no contract saves without a valid https URL; existing violators appear on a
remediation list.

### 0.4 Label instance-wide records as instance-wide
Problem: clients, contractors, contracts, sites, equipment and disasters have no
project_id, so behavior already matches expectation. But Organization sits below the
Active project switcher, so records read as project-scoped.
Change: interim scope marker and copy on Organization and Workers. Superseded by Phase 3.
Files: `frontend/src/pages/Records.jsx`
Done when: nothing on those screens implies project scope.

---

## Phase 1 - Schema (blocks phases 2-7)

DECIDED 09 Sep, during implementation: nothing on Railway needs preserving, so
there is no data to migrate around and no reason to carry remap archaeology in
the history. Corrections to tables that already existed are folded into the
baseline migration where the table is defined, and only genuinely new tables get
new files. The database is rebuilt from scratch rather than migrated forward.

  contractor taxonomy (1.2)     -> 0004_organization.sql
  contractor tier (1.3)         -> 0005_projects.sql
  worker identity (1.5)         -> 0003_identity_rbac.sql, employer FK in 0004
  contract constraints (1.9)    -> 0004_organization.sql
  documents (1.1)               -> 0014_documents.sql
  contacts (1.4)                -> 0015_contacts.sql
  program, scope, estimate (1.6)-> 0016_program_scope_estimate.sql
  site permits (1.7)            -> 0017_site_permits.sql
  line items and bridge (1.8)   -> 0018_contract_line_items.sql

Two further calls made while writing it:
- users.full_name is a STORED generated column over first, middle and last. It
  can no longer be written directly, so every write path splits a whole name
  through app/names.py, which is the same splitter the 2.6 importer uses.
- Estimates for counted streams use per_unit, not per_each. per_each always
  resolves to 1, which is right for a flat per-ticket fee and wrong for
  "1,200 appliances". debris_types.estimate_unit_type_code fixes the unit per
  stream so nobody is asked to choose one.

### 1.1 Document registry
New `database/migrations/0014_documents.sql`.
- `document_kinds` lookup: contract, contract_modification, rate_sheet, certificate_hhw,
  certificate_asbestos, certificate_other, permit, insurance, w9, other.
- `documents`: entity_type (clients|contractors|contracts|disposal_sites|projects),
  entity_id, project_id (nullable), kind_code, title, url, provider (box|sharepoint|gdrive|other),
  effective_from, expires_on, verification_status (verified|pending|expired|not_required),
  verified_by, verified_at, requested_from (client|pm|contractor), requested_on, notes,
  created_by, created_at, updated_at, deleted_at.
- Partial index on expires_on for the expiry sweep.
Link registry only. No file storage.
Done when: a contractor rate sheet and a site permit both round-trip and an
expiring-in-30-days query returns them.

### 1.2 Fix the contractor types
Problem: CHECK allows debris_removal, monitoring, hauling, processing, other.
Change: remap debris_removal and hauling -> hauler, processing -> other. New CHECK:
hauler, tree_removal, monitoring, other. Update select options.
Files: `database/migrations/0015_contractor_taxonomy.sql`, `frontend/src/pages/Records.jsx`, `backend/app/routers/org.py`
Done when: no nulls after remap; only the four choices offered.

### 1.3 Contractor tier on the project link
Problem: `project_contractors.role_on_project` allows prime|subcontractor|monitoring_firm.
No tier, no record of who a sub works under.
Change: CHECK becomes prime, sub_tier_1, sub_tier_2, monitoring_firm. Add
`parent_contractor_id` referencing contractors. Constraint: prime and monitoring_firm carry
no parent; a sub_tier_2's parent must itself be linked to the same project.
Tier lives on the project link, not the contractor: a firm can be prime on one project and
a sub on the next.
Files: `database/migrations/0015_contractor_taxonomy.sql`, `backend/app/routers/projects.py`, `frontend/src/pages/Setup.jsx`

### 1.4 Real contacts on clients
Problem: `clients.primary_contact` is one text column.
Change: ONE POLYMORPHIC `contacts` table keyed on entity_type + entity_id, carrying
first_name, last_name, title, email, phone, contact_role
(primary|finance|permits|operations|other), is_primary. Serves clients, contractors and
site operators from one table. Migrate existing `clients.primary_contact` values to one row
each; keep the old column trigger-populated for one release, then drop.
SETTLED 09 Sep: polymorphic, and this is now the house pattern for any child record that
attaches to more than one kind of parent. The convention already exists in `audit_events`
(entity_type + entity_id) and `documents` (1.1) follows it. Future attachment types inherit
the shape rather than adding a table.
Files: `database/migrations/0016_contacts.sql`, `backend/app/routers/org.py`, `frontend/src/pages/Records.jsx`

### 1.5 Worker identity worth searching
Problem: `users` holds one `full_name`, no employee ID, no employer.
`project_assignments.contractor_id` is per project and does not answer who pays the person.
Change: add first_name, middle_name, last_name, employee_id, employer_contractor_id
(nullable FK to contractors), employer_name (free text for staffing firms not on the
project). `full_name` becomes generated; existing values split on backfill. Unique index on
(employer_contractor_id, employee_id) where both present.
Files: `database/migrations/0017_worker_identity.sql`, `backend/app/routers/org.py`

### 1.6 Program, scope and debris estimate
Problem: `projects.program` is free text; nothing records confirmed debris streams; no
estimate field exists anywhere.
Change:
- `programs` lookup: row_collection, private_property_debris_removal, waterway_marine,
  demolition, disposal_only, unit_rate_tree, other. `projects.program_code` FK; existing
  free-text column kept as sub-label.
- `project_scopes` (project_id, debris_type_code, is_enabled, notes) driving ticket type
  enablement. Never assume scope; enable only what the client confirmed.
- `project_estimates` (project_id, debris_type_code, estimated_quantity, unit_type_code,
  source, confidence, as_of_date, notes). APPEND-ONLY by as_of_date, never updated in
  place, so the original client estimate and every revision survive. Current estimate is
  the latest row per stream.

ESTIMATE ENTRY, SETTLED 09 Sep. One numeric field per stream, unit fixed by the stream:
cubic yards for veg/C&D/mixed, each for hangers/leaners/stumps/white goods. NO RANGES.
A bucket like 100-500 cannot answer "are we at 60% of the hanger estimate", which is the
question asked by week three. Friction is handled instead with:
- quick-fill chips above the field stamping a round editable number (50, 250, 1000, 5000)
- a three-way confidence marker: rough | client_provided | surveyed
- permission to skip. A null estimate is honest; a bucket is fake precision.
The program flag PRE-SELECTS which streams appear and never gates them. It cannot be
depended on, so every stream stays addable.
Files: `database/migrations/0018_program_scope_estimate.sql`, `database/seeds/001_reference.sql`

### 1.7 Permit verification, per project
Problem: `disposal_sites` carries permit_number, permit_expires_on, permit_url with no
verification state. Permits are declaration-specific, so state belongs on the project link.
Change: add to `project_sites`: permit_status (verified|pending|not_required),
permit_document_id -> documents, permit_requested_from (client|pm|contractor),
permit_requested_on, permit_verified_by, permit_verified_on, permit_notes. Default pending.
SETTLED 09 Sep: a permit is treated EXACTLY like a contract. It cannot be marked verified
without a document record carrying a real URL into Box or SharePoint, enforced by
constraint rather than by the interface. Pending deliberately needs no document, which is
the point of the pending state. The document record is where future permit fields attach,
so the permit grows without another migration.
`disposal_sites.permit_*` stays as the site's standing permit metadata; the project link
carries per-declaration verification; the document carries the URL.
NOT A GATE. Ticket creation is never blocked on permit status. Readiness surfaces it and
the alerts feed nags. Operations do not stop because a PM is slow.
Files: `database/migrations/0019_site_permits.sql`

### 1.8 Contract line items and the service code bridge
Problem: the structural gap. `service_codes` carries project_id and contractor_id but no
contract_id. Rules carry contract_id, so the contract-to-billing link only appears at rule
time, one layer too late. Nothing holds contract line items at all.
Change:
- `contract_line_items`: contract_id, line_number, item_code, description, unit_type_code,
  unit_price, debris_type_code, service_category, effective_from, effective_to, source_page,
  source_text, extraction_confidence, status (draft|accepted|rejected),
  accepted_service_code_id.
- `service_codes.contract_id` and `service_codes.contract_line_item_id`, with a trigger
  enforcing that the line item's contract is linked to the service code's project.
- `contract_ingestions` staging table created now (contract_id, document_id, status,
  uploaded_by, parsed_at, parser_version, raw_payload jsonb, error) so Phase 6 needs no
  further migration.
Files: `database/migrations/0020_contract_line_items.sql`, `backend/app/routers/billing.py`

### 1.9 Contract constraints in the database
Change: NOT NULL + URL-shaped CHECK on document_url; NOT NULL on effective_from.
Data audit first: violators produce a remediation list and a NOT VALID constraint rather
than a failed migration.
Files: `database/migrations/0021_contract_constraints.sql`

---

## Phase 2 - API

### 2.1 Documents router
New `backend/app/routers/documents.py`. CRUD scoped by entity.
`GET /documents/expiring?days=`. `POST /documents/{id}/verify`.
`POST /documents/{id}/request` recording who and when, driving the pending clock.

### 2.2 Contract line items and code generation
Line item CRUD. `POST /contracts/{id}/line-items/import` accepting CSV or pasted TSV with a
dry-run preview reporting create/update/skip per row.
`POST /projects/{pid}/service-codes/from-line-items` creating a service code plus opening
rate per selected line item in one transaction, writing accepted_service_code_id back.
Done when: 20 pasted line items import in one call; selecting 8 produces 8 service codes
with correct rates and unit types, linked to their source lines.

### 2.3 Widen the project list
`GET /projects` already widens for role_rank >= 40 but returns only switcher data.
Add sort, client filter, program filter, readiness filter. Roll up open ticket count, CY to
date, billed to date and pending permit count from the existing `project_dashboard` and
`project_readiness_summary` views. Add `GET /projects/summary`.
`POST /projects` needs no change; only the interface is missing.

### 2.4 Programs, scopes and estimates
Endpoints for project scope and estimates. Add programs and document_kinds to
`GET /lookups` so clients keep their single boot call.

### 2.5 Permits and the alerts feed
Permit status endpoints on project sites.
`GET /projects/{pid}/alerts` returning pending permits with days since request, expiring
documents, and expiring equipment certifications in one payload with sortable severity.

### 2.6 Worker import and batch passwords
SETTLED 09 Sep: PASTE FIRST, and the importer asks the user to declare nothing. Assume the
user has never heard the word delimiter.

`POST /users/import` takes RAW PASTED TEXT and returns a parsed table.
Format sniffing order (never asked, always inferred):
1. lines contain tabs -> tab separated (this is what an Excel or Outlook table copy puts on
   the clipboard, and it is the most common real input)
2. consistent comma counts across lines -> comma separated
3. commas present but inconsistent -> plain list, split on commas AND newlines
4. otherwise -> one name per line
Header detection: match row 1 against known field words (name, first, last, employee, id,
email, phone, company, employer) and auto-map. Without a header, guess each column from
content: contains '@' -> email; matches a phone pattern -> phone; all digits -> employee_id;
two words -> name.
Name splitting: first token = first_name, last token = last_name, middle = whatever is
between. A comma in the cell means "Last, First". ALWAYS keep the original string in a
source column so a bad split is recoverable, and ALWAYS show the split in the preview table
rather than applying it silently.
Duplicate matching: employee_id + employer, then email, then exact name + employer. NEVER
name alone. Two Mike Johnsons at two firms is normal, and pasting the same list twice is
normal.
Dry run is the DEFAULT and reports in plain sentences, not row status codes.
Commit is ONE TRANSACTION. A half-imported crew list never happens.

`POST /users/bulk-password` applying one password to an explicit set of user ids with
must_reset true.
Search widened to employee_id and employer.

### 2.7 Create-and-link in one call
`POST /projects/{pid}/sites` accepts either site_id or a full new-site body, creating and
linking in one transaction. Same pattern for contractors, contracts and workers.
Removes the "create it under Organization first" detour.

---

## Phase 3 - The projects list and the two scopes

### 3.1 Teach the store about scope
`store.jsx` takes projects from `auth/me` only and every page short-circuits to "No project
in context" when projectId is null.
Change: projects come from `GET /projects`. Add `enterProject(id)` and `exitProject()`.
Null projectId becomes a legitimate state.
Files: `frontend/src/lib/store.jsx`

### 3.2 Build the projects list
New `frontend/src/pages/Projects.jsx` in the same idiom as `Tickets.jsx`: search, status
and client and program filters, sortable columns (code, name, client, program, status,
readiness, open tickets, CY to date, billed to date, permits pending), pagination, row
click enters the project. New project button lives here.
Files: `frontend/src/pages/Projects.jsx`, `frontend/src/App.jsx`

### 3.3 Split the sidebar by scope
Two nav sets in `Shell.jsx`.
No project in context: Projects, Clients, Contractors, Contracts, Disposal Sites,
Equipment, Workers, Disasters, Audit, Sharing, Settings.
Inside a project: the current project-scoped set, project name and code in the header, and
a persistent way back to all projects. Switcher gains a View all projects entry.

### 3.4 Cross-project contract view
Portfolio contracts list gains a project count column. Contract detail lists every project
it serves alongside its line items, documents and NTE burn.

---

## Phase 4 - Project creation

### 4.1 The wizard
`POST /projects` has always worked and needs only `project.create` at manager rank. There
is no interface calling it.
New `frontend/src/pages/NewProject.jsx`, stepped in the order the database enforces:
identity (name, code, client, declaration, program, dates, timezone, ticket prefix) ->
scope -> estimate -> contractors with tier -> contracts with line item review ->
disposal sites with permit status -> ticket types pre-selected from scope ->
service codes and rates generated from accepted line items -> workers -> review.
Done when: STL-2026-ROW goes from nothing to ready_for_field in one flow.

### 4.2 Inline create in every picker
`AddLink` in `Setup.jsx` currently tells the user to create the record under Organization
first. Every picker in the wizard and in Setup gets a create-new path using 2.7.

### 4.3 Contract line item review step
Line items on each selected contract render as a checklist. Accepting a set generates
service codes and opening rates through 2.2. This is the manual version of the automation
and also the review surface the parser will feed in Phase 6.

### 4.4 Resume and readiness handoff
Wizard writes the project first, links after, so a partial setup is resumable.
`Setup.jsx` becomes the resume surface. Review step reads its checklist from
`project_readiness_summary.missing` so wizard and database can never disagree.

---

## Phase 5 - Screens people actually work in

### 5.1 Rebuild Workers
Columns for employee ID, employer, role, projects, last login. Filters by employer and
project. Multi-select with set-password-for-selected. Single worker editor kept.
Bulk import opens as ONE PASTE BOX. Parsed rows appear immediately as an EDITABLE TABLE
where a wrong name split or a mis-guessed column is fixed in place before anything is
written. Dry-run summary sits above the table in plain language: how many are new, how many
already exist and will be updated, how many are unusable and why. Unusable rows stay
visible and fixable rather than merely counted.

### 5.2 Rebuild the rules list
`Rules.jsx` renders every rule as a card carrying its statement expression and billed
total. Technical view, shown first, to everyone.
Change: default to a compact list (name, ticket type, service code, rate, contract,
priority, active, matches) with an Edit button on every row and a chevron expanding into
the current statement view, dry run and totals.

### 5.3 Rebuild the service codes list
Same list-plus-expand treatment, edit action from 0.2 on every row, rate history in the
expansion.

### 5.4 Documents across the record screens
Documents tab on contractors, contracts, disposal sites and projects. Add by URL with kind,
provider and effective dates. Verify and request actions on the row. Expiry flags in place.

### 5.5 Permit tracker and alerts
Project view listing every linked site with permit status, days since request and who it
was requested from. Alerts tile on the dashboard fed by 2.5. Nagging only, never blocking.

---

## Phase 6 - Contract intake (structure now, parser next pass)

### 6.1 Upload slot and staging
Dropping a contract PDF creates a document record and a `contract_ingestions` row in a
clearly marked "parsing not enabled" state. The file stays behind the Box/SharePoint link.

### 6.2 The accept and reject review screen
Built against the staging shape: proposed line items with source page and confidence,
accept/reject/edit per row, and create service codes and rates from accepted (reusing 2.2).
Fully testable now with hand-seeded staging rows, so the parser later drops into a proven
surface.
Files: `frontend/src/pages/ContractIntake.jsx`

### 6.3 Parser and historical weighting
Deferred by decision. The extraction itself, then ranking proposals by what the team has
accepted before. 6.2 generates that accept/reject history, so this cannot start until 6.2
has run against real contracts.

---

## Phase 7 - Closeout packaging

### 7.1 Naming convention config
Per-project naming template over project code, client, document kind and date, so exports
and document filenames are generated rather than typed.

### 7.2 Manifest and export
Document registry plus data exports assembled into the closeout zip, with a manifest
listing every file, its source URL, its verification state and who verified it. That
manifest is the audit answer to what was collected and when.

---

## Decisions on record (all settled 09 Sep 2026)

Nothing below is open. A session picking this plan up treats these as given.

1. CONTRACT INTAKE (1.8, 6.1-6.3). Structure now: line items, manual entry, paste import,
   accept/reject review screen. Parser and historical weighting wait for the next pass,
   because the accept/reject history is what makes ranking possible and 6.2 produces it.
2. DOCUMENTS (1.1, 2.1, 5.4). Link registry with a required URL into Box or SharePoint.
   No files stored in the app. The system tracks and packages; it does not take custody.
3. ESTIMATES (1.6). Per debris stream, not a project total. "How far through the C&D
   estimate are we" is the question that gets asked.
4. PROJECTS (3.1-3.4). A worked list at a level where no single project is in context,
   operated like the tickets list and clicked into from there.
5. CONTACTS (1.4). One polymorphic table on entity_type + entity_id, and this is now the
   house pattern. `audit_events` already does it; `documents` follows it.
6. PERMITS (1.7). Treated exactly like contracts. Cannot be verified without a document
   record carrying a real URL, enforced by constraint. Pending needs no document.
7. ESTIMATE ENTRY (1.6, 4.1). Real numbers, never ranges. Quick-fill chips stamp a round
   editable number; confidence marker records how much to trust it; skipping allowed.
   Units fixed by the stream, so tree work counts each without anyone choosing.
8. WORKER IMPORT (2.6, 5.1). Paste-first, format sniffed, editable preview table, name
   splits shown not silent, dry run by default, atomic commit. Built for a user who has
   never heard the word delimiter.

---

## What was built, 09 Sep 2026

All 38 steps are implemented except 6.3, which stays deferred by decision. The
work is on the branch `remediation/backoffice` in seven commits, one per phase.

Verified on a database rebuilt from scratch:
- 18 migrations, all three seeds, 106 schema assertions
- 96 backend tests
- both front ends build
- a 28-step browser walk (`npm run test:ui`) that signs in, works the portfolio,
  opens a contract across projects, pastes a crew list and corrects a bad row,
  sets a password for a selected group, walks every project screen, registers a
  contract PDF, seeds and reviews line items, downloads the closeout zip, runs
  the new-project wizard end to end and comes back out to portfolio scope

Decisions taken during implementation, beyond the eight already on record:

1. SCHEMA SHAPE. Corrections to existing tables were folded into the baseline
   migrations rather than layered as remaps, and the database is rebuilt rather
   than migrated forward. Ryan's call: nothing on Railway needs preserving, and
   a clean schema is worth more than a migration history nobody will read.
2. users.full_name is a STORED generated column over the name parts. It can no
   longer be written directly, so every write path splits a whole name through
   `app/names.py`, which is the same splitter the paste importer uses.
3. Counted debris streams estimate in `per_unit`, not `per_each`. per_each
   always resolves to 1, which is right for a flat per-ticket fee and wrong for
   "1,200 appliances". `debris_types.estimate_unit_type_code` fixes the unit per
   stream so nobody is asked to choose one.
4. A new `document.manage` permission at Manager rank, rather than overloading
   contract.manage, because documents hang off six kinds of parent.
5. `contract_line_items.ingestion_id` was folded into 0018 rather than added as
   a new migration, keeping the promise that Phase 6 needs none.

Two pre-existing bugs surfaced and were fixed on the way: service_codes had a
plain unique constraint that let a soft-deleted code hold its name forever, and
the shared CRUD delete path assumed every table has an is_active column, which
contracts does not.

### Running the verification

    npm run db:setup            # migrate, seed, schema tests
    npm run test:api            # 96 backend tests
    npm run dev:api             # API on 8080
    cd frontend && VITE_API_URL=http://127.0.0.1:8080/api/v1 npm run build \
      && npx vite preview --port 4173
    npm run test:ui             # the browser walk
