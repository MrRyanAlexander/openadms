---
name: adms-data-model
description: Open ADMS data model, in today's rules. Covers the records and how they link (Client → DeclarationEvent → Project, contractors and contracts, forms and debris types, pay items with a rate per prime, rules naming one contract, sites, certifications, users, devices and assignments, time-clock entries, FieldEvent and the CompletedLoad / CompletedHaulOut drawn from it, transactions, flags, AuditRecord), why reference data is editable, evidence correctable only by permission and the derived records and audit never by a person, which lists are fixed in code and which the firm extends (built-in keys plus the firm's own values), identifiers, uniqueness, coordinates and time, and which package and database role may write what. Use when touching the Prisma schema, adding or changing a model, a list, a relation or a constraint, or deciding where a write belongs. Field names are spec/DATA-MODEL.md's; what each setup record and field event holds is adms-ticket-workflows.
---
<!-- skill-status: current (the derived records, ADR-340; a photograph's archive mark and label, ADR-337; ADR-138, rewritten 2026-09-29, ADR-245; ADR-246; the Phase 0 models built, ADR-281; the pay item's first shape and `spec/DATA-MODEL.md` drafted, ADR-284, 286; the page approved, ADR-289; a pay item's unique code and description, ADR-301; the firm's lists built, ADR-302; the client, the declaration event and the project built, ADR-303; contractors on a project and contracts built, ADR-305; a contractor's contact details, ADR-306; forms, the debris types on them and the firm's own fields built, ADR-308; pay items in full, ADR-309; sites and the project map built, a site keeping several tipping fee pay items, ADR-311; rules built, ADR-313; people's permissions and viewers, ADR-315; certifications, ADR-321; what every field event records, ADR-324; what each kind records, ADR-325; scale receipts and photographs, ADR-326; ROEs and forms, ADR-327; whether a viewer sees private citizens by name, ADR-336) -->

> **This page states today's rules** (last changed by ADR-340, as its status line lists). Each rule cites its ADR; what changed is in
> the History list at the end. The user's own words are quoted and marked **User**. If this page and
> `agent_store/SUMMARY.md` disagree, SUMMARY wins: log a KD (`adms-decisions`). The worked example
> is `spec/golden/MISSION.md`; names and examples follow `spec/CONVENTIONS.md` (§3 for code names).
> The words are defined once, in `adms-domain` Part 2.

# PART 3 — THE DATA MODEL

**The schema is being built in Phase 1's order** (`BACKLOG.md`): Phase 0's fifteen provisional
models in `packages/db/prisma/schema/` (ADR-268, 281, 286: only what the hardening tests and
REQ-019…021 need) and, built in full, the firm's eighteen lists (ADR-302; §3.2), `Client`,
`DeclarationEvent`, `Project` and `ProjectKindOfWork` (ADR-303; §3.1a), `Contractor`,
`ProjectContractor` and `Contract` (ADR-305; §3.1a), `Form`, `FormDebrisType` and `FormDefinition`
(ADR-308), and `PayItem`, `PayItemRate` and `PayItemCrewDayStep` (ADR-309), disposal sites and the project map
(ADR-311), and `Rule`, `RuleCriterion`, `RuleCriterionPick`, `RuleAction` and `RuleActionItem`
(ADR-313: a rule held to a ticket form and a contract of its own project, a picked value to the
rule's own project and form; "Is valid", the refusal of an exact copy and the overlap warning are
`packages/domain`'s `RuleValidity` and `ProjectRules`). The schema is a Prisma multi-file schema in `packages/db`
(ARCHITECTURE §18), written in Phase 0 and Phase 1; this page is the model it must follow. **Model names** below
are the agent defaults of `spec/CONVENTIONS.md` §3; **field names** are settled in
`spec/DATA-MODEL.md` (drafted 2026-10-01, ADR-284; **approved by the user 2026-10-01**, ADR-289; changed at their word by ADR-292…295; KD-65 is closed), which may
refine a model's shape but not a rule here. What
each setup record holds, field by field in plain words, is `adms-ticket-workflows` §4.0; what each
field event records is its §4.2–§4.5.

**The one idea that shapes everything** (ADR-236, invariant 21): **field events are the evidence;
every record the system writes is a conclusion drawn from them** and the firm's current setup, again
on every reprocess. Evidence is corrected in place by permission, never replaced; the prior value
lives in `AuditRecord`. The model is **event-driven, not event-sourced**: there are no correction
events and no state rebuilt by replaying a log (agent default, ADR-236).

## 3.1 Topology

```
 SHARED, FIRM-WIDE RECORDS (referenced, not contained)
   Client ──────────────┐        DeclarationEvent (DR-9001-FL)     Contractor (prime or sub)
   (Bayline County)     │               │                          User · Device
                        └──────┬────────┘                          the firm's lists (§3.2)
                               ▼
                 Project  (program type, time zone, settings)  ── the hub; all below is per project
                               │
   SETUP (configuration) ──────┼──────────────────────────────────────────────────────────────
     project's contractors → Contract (name, prime, link)
     Form (per document type) → its debris types (Reduced, reduction method, Hidden on phones)
     PayItem (code, payable type, Unit of Measure, band, capture settings) → a rate per prime
     Rule (one form, one Contract) → criteria → actions (Add #n: a PayItem · Remove #n · Void)
     DisposalSite (site type, facts, area) ── its tipping fee PayItems (several: per CY, per ton; ADR-311)
     project map: boundary, zones (dated map versions) · field tags · number series
     Certification (container or crew; prime, sub)
     Assignment (person, date, work, one site, phone) → ClockEntry, approved day
                               │
   EVIDENCE (what monitors saw) ┼──────────────────────────────────────────────────────────────
     FieldEvent  kind COLLECTION · DISPOSAL · HAUL_OUT_COLLECTION · HAUL_OUT_DISPOSAL · UNIT_RATE
       grouped as a ticket on project + workflow + bare number; each records its assignment,
       device, monitor, certification and setup version
     forms: surveys, incidents, drop-off logs (+ the firm's added fields) · photos · quarantine
     (an ROE is setup, with the certifications above: ADR-294)
                               │
   DERIVED (the worker only) ──┼──────────────────────────────────────────────────────────────
     CompletedLoad · CompletedHaulOut   (unique links to their field events)
     Transaction (pay item, quantity, rate, contract, prime + operating sub)
     flags · reconciliation runs · zone, mileage attached
                               │
   AUDIT ──────────────────────┴──  AuditRecord: written by database triggers only, append-only
```

## 3.1a The organisational hierarchy: three layers, three questions

Casual speech calls all three "the job"; they answer different questions and live for different
lengths of time (ADR-023).

- **`Client`: who is paying.** A county, a city, a state agency. **Reused across disasters**: a county
  hit in 2024 and again in 2026 is the same record, picked, not re-created. Its details are edited
  freely (audited) and it is archived, never deleted.
- **`DeclarationEvent`: what happened.** The disaster and the reference its work is authorised under:
  a FEMA declaration (`DR-9001-FL`), an emergency declaration, a state or local one, or an internal
  reference: a **reference string plus a reference type** from the firm's list. **A shared,
  firm-wide record**, created once, searchable, and **referenced** by any number of projects of any
  number of clients, so "everything under this declaration" is one query (ADR-023, 026). Client →
  declaration event → project is the order an operator works in, not containment. Always *declaration
  event*, never a bare "event" (`adms-domain` §1.2).
- **`Project`: one body of work for one client under one declaration event**, and the hub every
  other record hangs off. Its **program type** (ROW, PARKS, PPDR, WATERWAY, from the firm's list) is
  behaviour, not a label: its "requires ROE" setting decides whether every collection, unit rate
  ticket and survey needs an ROE (ADR-024, 070, 149). **A separate project per funder or kind of
  work**, and no funder field (ADR-148). **User, 2026-09-27 (Q-140):** "We create separate projects
  for each of those. If we comingle the data FEMA will regect it." Every project has a **time zone**
  (ADR-100); its settings, map and number series are listed in `adms-ticket-workflows` §4.0.
  **Built (ADR-303):** no setting has a default in the database. What a new project's settings
  start as is `packages/domain`'s `NewProjectSettings` (*Allow split loads* from the program type's
  "requires ROE"; both stump checks on; the time clock off, agent default), its numbers read from
  the **policy values**: `packages/domain/policy.env`, the release's built-in defaults
  (`LOAD_CALL_LOW_LIMIT` 5, `LOAD_CALL_HIGH_LIMIT` 95, `DISPOSAL_SITE_PROXIMITY_M` 200,
  `STUMP_FILL_DEPTH_INCHES` 31), handed to the domain's `Policy` by whoever creates the project
  (invariant 16). A project's kinds of unit rate work are `ProjectKindOfWork` rows, taken off by
  archiving.

**Contractors and contracts** (ADR-081, 108, 146, 239):
- A **`Contractor`** is a firm-wide record, added to each project it works on. It is a **prime** or a
  **sub**; monitoring subs and temp agencies are contractors of the monitoring kind (Q-97, ADR-102).
- **Several primes per project; each prime's subs are its own, at most two tiers, and are typed in at
  certification** under the prime the monitor picks; the phone suggests known subs and the back
  office merges duplicates, audited (ADR-108). **User, 2026-09-25 (Q-108):** "Projects can have more
  than one prime.. Build 1 was wrong. … But subs are never shared by Primes."
- A **`Contract`** belongs to a project and holds **a name, its prime, and an optional link** to the
  signed copy; no number, dates or amount. **User, 2026-09-27 (Q-138):** "A contract is simple object
  really. It doesn't do anything more than hold a little data."
- **A `Rule` names one contract** and runs only on tickets whose prime (from the certification)
  holds it; a rule with only *Remove transaction* / *Void ticket* may leave it blank (agent default).
  A `Transaction` records the contract, its prime and the operating sub (ADR-081, 212, 239).
- **Built (ADR-305):** a `Contractor` has a **kind** (`ContractorKind`: `HAULER` · `MONITORING` ·
  `CREW` · `OTHER`; no default, whoever adds it says which), **contact details** (a contact name,
  email and phone, each optional, edited freely and audited, as a client's; **User, 2026-10-02:** "A
  contractor should hold contact details", ADR-306) and a merge link (`mergedIntoId`: never
  itself, and a merged row is archived). Whether it is a prime or a sub is **its place on a
  project**, a `ProjectContractor` row (`ContractorPosition`: `PRIME` · `SUB_TIER_1` · `SUB_TIER_2`):
  one place per project, so a sub is never shared; a sub names its prime (tier 1 and tier 2 alike),
  a prime names none. **The database holds "the prime" to one of the project's primes** (agent
  default): a prime's row carries its own contractor again as `asPrimeId`, and a sub's `primeId` and
  a `Contract`'s are two-column foreign keys to it, so a sub under a sub, a contractor of another
  project and a contract written before its prime is on the project are all refused, and a prime
  that a sub or a contract names can't be made a sub. **Whoever adds a prime writes `asPrimeId` =
  its contractor**; a later table that names a prime (a rate, a certification) points at the same
  key. A place is taken off a project by archiving. What a merge moves (the duplicate's place, its
  certifications) is the certification task's (BACKLOG C56).

## 3.1b Four kinds of record, four ways to change

Agents wrongly block ordinary admin work, or wrongly allow a person to write what only the worker
may, when these are confused (ARCHITECTURE §2, "who writes what").

| | **Configuration** (reference data) | **Evidence** | **Derived** | **Audit** |
|---|---|---|---|---|
| Examples | `Client`, `DeclarationEvent`, `Project`, `Contractor`, `Contract`, `Form`, `PayItem`, `Rule`, `DisposalSite`, `Certification`, `Roe` (set up, then filled in by a monitor or the back office: ADR-294), `User`, `Device`, `Assignment`, the firm's lists | `FieldEvent`s, surveys, incidents, drop-off logs, photo metadata, time-clock entries, quarantined syncs | `CompletedLoad`, `CompletedHaulOut`, `Transaction`, flags, reconciliation runs | `AuditRecord` |
| Describes | a standing fact that may change | what a person saw, at a moment | the system's conclusion from the evidence and setup | every change, with its actor |
| Written by | the API (the back office; phones for certifications and new monitors), audited | the API: inserted at sync, or by the back office with a person and a reason (ADR-156); corrected in place | **the worker only**, never a person (invariant 4) | **database triggers only** |
| Edited? | **Yes**, routine, audited | **By permission**: any captured field, GPS and times included, prior value kept (ADR-051); never by the monitor after their shift ends (ADR-240); a ticket locked as invoiced is unlocked first (ADR-057) | never by hand: **drawn again** on every reprocess; transactions **regenerated**, each removed row copied in full to `AuditRecord` first (ADR-085) | **never**, by anyone |
| Removed? | never: **archived** (or a project **closed**) | never: **voided** with a reason for work that never happened | a transaction only by regeneration, refused on an invoice-locked ticket (ADR-090) | never |

**Nothing is lost in any of the four.** Because `AuditRecord` never changes, everything else can be
corrected or drawn again safely. Changing a client's phone number is routine; correcting a mistyped
load call is a permitted, audited act; editing an `AuditRecord` is impossible (ADR-097, invariants
1–5).

**Marks people set on derived and evidence records, without changing them.** Each is **its own
record, written by the API and keyed to the record it marks**, so the API never updates a derived
row (ARCHITECTURE §5.1 stands) and a reprocess that draws a completed load again can't lose one
(agent default, ADR-245; `spec/DATA-MODEL.md` settles the shape):
- **QC status** (QC Review → QC Approved / QC Issues / QC Void), set only by people and never read by
  the engine. It lives on the **`CompletedLoad` / `CompletedHaulOut`** (a split is one), on a unit
  rate ticket, and on each certification and form; **never on a load's or haul-out's single field
  event** (ADR-107, 168). **User, 2026-09-27 (Q-160):** "Why would we ever think to invoice half of a
  ticket? We wont ever do that. PERIOD!"
- **The invoice lock** (who, when), only on QC Approved records, optionally in a named
  **`InvoiceBatch`** (a name and its tickets, no amounts; ADR-121, 228). Unlocking is audited.

- A **flag** is the worker's; a reviewer's **acceptance** of it (reason from the firm's list, who,
when) is audited and keeps the inputs the flag was raised on, so the worker can tell when "the facts
changed" (ADR-166).

## 3.1c Field events and the records drawn from them

**`FieldEvent`: one model, five kinds** (ADR-236, agent default; `spec/DATA-MODEL.md` may refine):

| `kind` | Label | Workflow | Makes the number | Carries the quantity |
|---|---|---|---|---|
| `COLLECTION` | `COL` | load | ✅ (one per split suffix) | (lists the tickets a load carries) |
| `DISPOSAL` | `DIS` | load | | ✅ load call, scale weight, or count |
| `HAUL_OUT_COLLECTION` | `HOC` | haul-out | ✅ (one per split suffix: a pile, ADR-295) | ✅ load call (a running call on a split) |
| `HAUL_OUT_DISPOSAL` | `HOD` | haul-out | | (scale weight where paid by weight) |
| `UNIT_RATE` | `URT` | unit rate | ✅ | ✅ its count, measurement or hours |

- **Shared columns** hold what every field event records: project, workflow, **bare ticket number**,
  split suffix, monitor, device, **assignment**, **setup version** (the numbered lists the phone
  captured with, so a reviewer sees what it showed), certification, site where the work is at one,
  start and end times, GPS (ADR-236, 240; `spec/CONVENTIONS.md` §3). **Kind-specific columns** (a
  debris type, a field tag, a load call, a scale weight, carried ticket numbers, a unit rate pay item
  and its measurement, items, stump readings…) are **checked by the kind** with a database
  constraint, so a disposal can't hold a unit rate measurement. What each kind records:
  `adms-ticket-workflows` §4.2–§4.5.
- **Built (ADR-324): the shared columns in full** (`spec/DATA-MODEL.md` §4.1 (1)). `source`
  (`DEVICE` · `BACK_OFFICE`) and one check tell a phone's record (its phone, assignment and setup
  version) from one created in the back office (the person and the reason, no phone); the number
  typed and its reason (a reason only on a typed number); the cert number as scanned and the
  certification found, one of its own project's, empty until one has that number; keyed in by
  hand, with the typed capacity only then; the site, one of its own project's; GPS at both ends
  (a whole fix on the earth, or none); the address and whether it was looked up or typed; notes;
  the temporary session. **None of these has a database default**: a test writes a field event
  with `fieldEventLike` or `backOfficeEventLike` and `eventInsertOf`. A client user and an
  auditor see every column, and the monitor's name and Monitor ID through
  `viewer_field_event_monitor`.
- **Built (ADR-325): the kind-specific columns** (`spec/DATA-MODEL.md` §4.1 (2); the ROE found
  joined with its own table, ADR-327). **None is
  required**: a pick that didn't reach the server is a flag's. The database refuses a detail on
  a kind that doesn't record it; the same table is `packages/domain`'s `fieldEventDetails`
  (`FieldEventDetails` says what a kind records and why a record isn't one; `packages/contracts`'
  `fieldEventDetailsSchema` asks it), and a database test holds the two together. **A debris
  type** is the entry on the field event's own project's form for its workflow: the field event
  repeats the entry's `formId` and `formDocumentType` (all three or none), so a test writes one
  with `debrisTypePicked(world, entryId[, form])`. A field tag and a pay item are its own
  project's. **A split suffix** is capital letters, only on a collection or a haul-out
  collection; a collection has its suffix and its estimate both or neither; a pile gives a load
  call, never an estimate. A measurement comes with how it was read (`MeasuredAs`).
  **`FieldEventItem`** (an itemised unit rate event's lines, an item once) and
  **`CarriedTicket`** (the numbers a load's collection lists, as written, each once) repeat
  their field event's kind, so each sits only where it belongs; evidence, audited in the records
  domain, seen by a viewer with its field event.
- **Built (ADR-326): scale receipts and photographs** (`spec/DATA-MODEL.md` §4.2, §4.4).
  **`ScaleReceipt`** is its own evidence record: the site's number exactly as written, **never unique**
  (ADR-328, 331); its site its own project's; every weight what the paper says, each optional, none
  worked out (a net of nought or below is kept for a flag; a gross or tare below nought is
  refused). A field event's `scaleReceiptId` is taken only on a disposal and a haul-out
  disposal, for a receipt of its own project, a load call or a count beside it included; a
  tandem's one receipt is one row both disposals point at. **`Photo`** is the record only (the
  file is storage's): exactly one owner of its own project (a field event, a certification or a
  scale receipt; an ROE, a survey, an incident or a drop-off log since ADR-327; quarantine's
  joins with its table, 1.4.2); a
  `view` only on a certification's; two fingerprints and two unique places in storage, **written
  once** (a trigger refuses a change, by anyone); the database counts none ("at most 8" is the
  phone's); a certification is never copied (ADR-328), so each holds its own. Both are audited in the records domain; a client user and an auditor see
  them with their project, a photograph without `objectKey` and `depthObjectKey`. A test writes
  them with `scaleReceiptLike`, `photoLike` and `phoneInsertOf`.
- **Built (ADR-327): ROEs and forms** (`spec/DATA-MODEL.md` "ROEs", §4.3). **`Roe`** is
  configuration in the records domain: its number once per project, not blank; only the number,
  `signed`, `answers` and `source` required; a phone's with who made it, the phone, the
  assignment and its time, a back-office one with no phone; no setup version, no archive.
  **`RoeScopeItem`** repeats its ROE's project: exactly one of an entry of its own project's
  load form (with `formId` and `formDocumentType` `LOAD`) and a payable type, each once per ROE,
  a count of 1 or more. **`Survey`, `Incident`, `DropOffLog`** are evidence in the records
  domain, with no status and no worker column; "its time" is `madeAt`; one check tells a
  phone's (phone, assignment, setup version) from one created in the back office (person,
  reason), as on a field event. A survey's `roeId` and a drop-off log's `siteId` are its own
  project's; an incident may name the contractor involved (one on its own project), a cert
  number and an ROE number with the certification and ROE each found, all optional, and the
  project's incident form's `incidentOffers` says which a monitor is offered (the user,
  ADR-328 (3); built ADR-334). **Each record's `answers`** is an object, and
  `formDefinitionId` comes with `formId` and `formDocumentType` (the record's own kind), all
  three or none, of its own project's form; with no definition the answers are `{}`. The
  answers' schema is `packages/contracts`' `formAnswersSchema(fields)`, made from the version
  answered. **`FieldEvent.roeId`**: only on a collection and a unit rate event, its own
  project's. **`Photo`** has seven owners. Since ADR-337 it also holds the back office's two marks: `archivedAt` (removed from the record; a mark, nothing deleted, cleared to put it back) and `label` (free text, never blank), each corrected by the API and audited. A client user and an auditor see all five tables
  with their project. A test writes them with `roeLike`, `formLike` and `backOfficeFormLike`.
- **A ticket is its number and its events**: grouped on **project + workflow + bare number**, the
  split suffix stripped; never on a label, a type or any other field (ADR-019, 033, 062). **One
  event of each kind per ticket** (one collection per split suffix); a second is a duplicate, held in
  full in quarantine at sync for a person (ADR-022; `adms-exceptions`).
- **A load carries no pay item.** A unit rate event carries the one the phone worked out from the
  band, and the worker works it out again (ADR-207, 213). **Rates never sit on an event** (invariant 7).
- **The worker writes only the reconciliation columns on an event** (the ticket's status, run time,
  the zone and map version, a unit rate event's worked-out pay item: five columns, ADR-340),
  through a column grant; every other change to an event is a person's audited correction
  (ARCHITECTURE §2, §5.1).
- **Forms and certifications are records, not a ticket's events** (agent default, ADR-236): an ROE,
  a survey, an incident or a drop-off log never pairs and never bills. They have **fixed fields
  plus the firm's added fields** (surveys, ROE forms, incidents, drop-off logs): a form definition
  per record kind and stored answers, exported, never read by the engine or rules (ADR-160, 188).
  The answers are **one JSONB column per record, keyed by field ID, with the definition version
  answered**; the definition is versioned, never edited. Nothing the engine, a rule or a flag reads
  lives in JSONB: such a value is promoted to a real column (ADR-278; the details are
  `spec/DATA-MODEL.md`'s `FormDefinition` and §4.3, approved, ADR-289). **Built (ADR-308):** a
  definition belongs to one project's form (an ROE, survey, incident or drop-off log form, and no
  other: the database refuses the rest), numbered from 1, never edited or deleted; its fields' shape
  is `packages/contracts`' `formDefinitionFields`. A debris type sits only on a load or haul-out
  form; what a phone offers and the unreduced warning are `packages/domain`'s `DebrisTypeEntries`.

**Built (ADR-340): the derived records, all but `Transaction`** (`spec/DATA-MODEL.md` §5).
`CompletedLoad` is one per disposal event, for that event's life (a unique key, dissolved or
not), with its quantity (`quantitySource`, capacity, load call, volume, weight and whether it is
a share, carried count) and `dissolvedAt`; its collections are `CompletedLoadCollection` rows
(suffix, share, volume, weight, mileage with its source, road point and map data).
`CompletedHaulOut` and `CompletedHaulOutCollection` are the same shape, a pile's row with its
`pileLoadCall`. **A collection row has its own id and repeats its completed record's project**
(agent default), so the record, the row and the collection event are held to one project.
**Live once is an exclusion constraint `WHERE dissolved_at IS NULL`**, never a partial unique
index, which Prisma would drop in its next migration: a collection event among live rows, a
ticket number among a project's live completed loads (and among its live haul-outs), a suffix
among a record's live rows. `Flag` holds the ticket (workflow and number together) or the
record it is about, its `FlagCode` (the catalogue's 66 codes, held to `spec/FLAGS.md` by a
test), message, facts with their SHA-256, `FlagBilling`, a line's # and pay item, raised and
cleared times; `ReconciliationRun` and `ReconciliationDecision` record a run and one decision
for each ticket. A field event has the worker's `zoneId` (one of the map version used),
`mapVersionId` and `workedOutPayItemId` (a unit rate event's only), each its own project's.
All derived, the worker's login alone; a client user and an auditor see the completed records,
their rows and the flags, no viewer a run or its decisions. The database does not hold the kind
of field event a completed record names: that is the grouping's (`packages/domain`, 1.5.3). A
test writes them as the worker, with the helpers in `packages/db/test/derived-records.test.ts`.

**`CompletedLoad` and `CompletedHaulOut`** are what the worker concludes from a ticket's events: the
load's own number, its events (**unique links**, so one load can't bill twice, invariant 17), the
zone and mileage attached (with the map version and the map data's date, ADR-110, 141), QC status,
the invoice lock. A split's collections share one completed load, priced per property (ADR-055,
162); a split haul-out's collections, one per pile, share one completed haul-out the same way,
priced per pile (ADR-295). **Only the worker writes them**; no person and no API path can (invariant 4). A unit rate
ticket has no completed record: its one event is the ticket.

**`Transaction`** is one priced line: the ticket (and the split property), the rule and its #
slot, the pay item, the quantity, the rate (the pay item's rate for the rule's contract's prime),
the contract, the prime and the operating sub (ADR-081, 206, 212, 239). The current truth,
regenerated when its ticket changes; details in `adms-ledger-audit`.

**`Assignment`, `Device`, `ClockEntry`** (ADR-240, 241):
- A **`Device`** is **enrolled once** (its device key; no project, no monitor), holds number and
  cert-number blocks, and may be taken out of service at a time, after which its work arrives
  flagged (ADR-065, 134, 151).
- An **`Assignment`** is one person's work for a day: date, project, their work (ticket types, unit
  rate pay items, certifying), **one site** where the work is at one, optionally a phone; **planned**
  on the dispatch board or **unplanned** (made with the master passcode, marked). A phone holds one
  at a time, so one project (ADR-145). It never expires and never stops work.
- **`ClockEntry`** rows (in, break, out) and a **manager-approved day** belong to an assignment,
  **never linked to crew time**: no shared field, no cross-check (ADR-063, 241). No rates or pay are
  held (agent default).
- A **`User`** is an admin, a manager/analyst, a field monitor (with a system **Monitor ID**,
  `M004127`) or a read-only viewer: a client user, a contractor user or an auditor (ADR-050, 105, 169).
  Users are firm-wide, not project-scoped; a monitor's project comes from the assignment.
- **Built, provisional (0.4.3, ADR-281; `spec/DATA-MODEL.md` may refine each):** the database issues
  the Monitor ID (the default of `User.monitorNumber`; every monitor has one), and a worker's employer
  is `User.employerId` (a contractor) with `employerNumber`. `Device`: `name`, a unique `publicKey`,
  `status` (`ACTIVE · LOST · RETIRED`, with `outOfServiceAt`), `masterPasscodeVersion`; no details
  column. `NumberBlock`: device, project, series, first, last, last used, how it ended; cut only from a `ProjectNumberSeries` of its project, and two blocks of one series never hold the same number (a reclaimed block holds only what its phone used); `ControlRange` holds a control-ticket project's pre-printed ranges, loads and haul-outs only (built, ADR-323). `Assignment`:
  person, `workDate`, project, `fieldEventKinds`, `certifying`, an optional site (one of its own
  project's) and phone, `origin` (`PLANNED · UNPLANNED`), `madeById`; its unit rate pay items are
  `AssignmentPayItem` rows, each a `PayItem` of its own project (ADR-286) and a unit rate one: the
  row repeats the pay item's kind of work, held by a three-column foreign key (C42, ADR-309); the forms it names are
  `formDocumentTypes`, held to ROE, survey, incident and drop-off log (ADR-308). `MasterPasscode`: a version and its slow hash, never edited, read only by
  the API. A field event's `assignmentId` and `setupVersion` are captured columns, required on a phone's record and empty on one created in the back office (ADR-324).

## 3.2 Fixed in code, or the firm's to extend

**User, 2026-09-24 (Q-65):** "Fixed lists are too ridgid. These lists need to be able to be added
to at the global level." So a list is **the firm's** unless each value is a piece of engine code
(ADR-070). The catalogue is `spec/LISTS.md`.

**Fixed in code** (closed sets, a database check constraint each; a new value is a code change with
an ADR):

| Set | Values |
|---|---|
| Field event kinds | `COLLECTION` · `DISPOSAL` · `HAUL_OUT_COLLECTION` · `HAUL_OUT_DISPOSAL` · `UNIT_RATE` (ADR-236) |
| Workflows | load · haul-out · unit rate (each has its own number series, ADR-062) |
| Statuses | `PENDING` · `COMPLETED` · `MANUAL_REVIEW` · `VOID` (ADR-060) |
| QC statuses | QC Review · QC Approved · QC Issues · QC Void (ADR-107) |
| Billing units (a pay item's Unit of Measure) | `CY` · `TN` · `EA` · `LB` · `HR` · `CREW_DAY` · `TBN` (`spec/CONVENTIONS.md` §4); weight is `TN` or `LB` (ADR-221, 223) |
| User roles | admin · manager/analyst · monitor · read-only viewer (ADR-050) |
| Rule actions | *Add transaction #n* · *Remove transaction #n* · *Void ticket* (ADR-109, 118, 130) |
| Site facts | Takes loads · Haul-outs leave here · Charges a tipping fee · Ineligible site: yes/no on each site, each with engine behaviour (ADR-215, 222) |

**The firm's lists** (firm-wide, seeded at install, admin-managed, audited, archived never deleted;
**values are picked, never typed**, invariant 6), with the setting each value carries:

| List | Seeds and settings |
|---|---|
| Program types | ROW · PARKS · PPDR · WATERWAY; **requires ROE** (also ticks a new project's *Allow split loads*) (ADR-070, 137) |
| Declaration reference types | FEMA disaster · FEMA emergency · State · Local · Internal |
| Debris types | the firm's library, seeded from USACE's umbrella types; a project **adds them to its forms**, named as the contract names the work, each entry with *Reduced*, a reduction method and *Hidden on phones*; no USACE category setting (ADR-074, 081, 211, 214) |
| Reduction methods | Grinding · Incineration · Compaction (ADR-214) |
| Payable types | USACE's twelve umbrella types plus Crew time and Tipping fee; **every pay item has one**; exported as the type column (ADR-173, 221; CONVENTIONS §4) |
| Kinds of unit rate work | Hangers · Leaners · Stumps · HHW · White Goods · Crew time, each with its count shape; **Stumps is built in** (ADR-127, 198) |
| Itemised item names | per kind: white goods, HHW, crew-time items (ADR-040, 084) |
| Vehicle types, vehicle features, crew types | certification lists; features label measured boxes (ADR-070, 076; `adms-certifications`) |
| Site types | TDSR/DMS · Final Disposal · Transfer Station · Other (ADR-190, 215) |
| Site labels | the firm's own (a burn site, grinding), beside the fixed site facts; labels only (ADR-194, 215) |
| Incident types and sub-types | sub-types start empty (ADR-129, 137) |
| Survey / ROE work types | Pre-work · Post-work · ROE (ADR-129) |
| Reasons | per use: voiding, a typed number, accepting a flag, a back-office-created record (ADR-173) |
| Time-clock activities | what the app can't know: travel, standby, training (ADR-241) |
| Field tags | **a project list**, starting empty; read only by the *Field tag* criterion and exports (ADR-216, 218) |

- **"Other (typed)"** only on lists that describe something (a vehicle type), never on one that
  drives behaviour or billing; an admin can promote a typed value into the list (ADR-070).
- **Behaviour on a value is a setting on the value** (a program type's "requires ROE"), never code
  keyed on its name.
- **Built-in values plus the firm's own** (ADR-194): where the system acts on some values of a list,
  those are **built-in values with a fixed key** (the kind of work Stumps); the firm may rename them but never
  archive them; the firm's own values have no key and are labels to pick, search, filter and export
  by. **Code, rules and phones test the key, never the name**, and a test proves a rename changes no
  behaviour. New behaviour means a new built-in value in a release, with an ADR. How to code, keep
  and explain it: `spec/LISTS.md`.
- **Storage shape: one table per list, built** (ADR-302; `spec/DATA-MODEL.md` §2.3): each has a key,
  a name, a position and its own columns. **The built-in keys are one closed set in
  `packages/domain`** (`builtInKeys`: `STUMPS`; `TDSR`, `FINAL_DISPOSAL`; `PRE_WORK`, `POST_WORK`,
  `ROE`), and `packages/db` depends on `domain` for its types, so the seed can write no other key.
  **The database keeps two rules itself:** only a release (`adms_owner`: the migrations and the
  seed) writes a key, and a value with a key is never archived. **A new list** is a model in
  `configuration.prisma` and one line in a guard migration: `SELECT guard_list('site_type',
  'OPERATIONS');` (`guard_table` plus those two rules). **The seed** writes a list's starting values
  once, into an empty list (`packages/db/src/list-seeds.ts`; `spec/LISTS.md`, "What ships"); a list
  the firm has touched gets only a built-in value it lacks.
- **A pay item carries no fee label** (ADR-246): the transaction # slot keeps a load's lines apart,
  the site's link to its tipping fee pay items (a site may keep several, ADR-311) tells a fee line,
  and the payable type groups lines.

## 3.3 Model shapes

- **Field events: one model with a kind**, shared columns plus kind-checked ones (§3.1c). Reads of a
  ticket never join across stage tables, because there are none.
- **Built (ADR-321):** `Certification`, `CertificationBox`, `CertificationHelper`: one table with
  a `kind`; a box repeats that kind (always `CONTAINER`), so a crew holds none, and two deferred
  constraint triggers hold a container to its primary box; `firstTierSubId` and `secondTierSubId`
  point at `project_contractor (project_id, contractor_id, prime_id)`, so a sub is one placed
  under that prime on that project; audited in billing. A test writes one with
  `certificationLike`, `crewLike` and `boxLike`.
- **Certifications** share one base (number, project, prime and sub, photos, attestation, QC) with a
  container part (measured boxes, capacity) or a crew part (not measured, invariant 10); the shape is
  `adms-certifications` §3A.2. A crew **is** its certification: there is no crew list (ADR-228).
- **Forms** share their fixed fields per kind plus the firm's added fields as stored answers
  (ADR-160).
- **Setup that tickets are judged against is dated and kept**: each ticket records the map version
  it was checked with (ADR-141); a changed site circle or shape is dated and kept (ADR-144).

## 3.4 Identifiers, uniqueness, coordinates and time

- **Three kinds of identifier, never mixed** (`spec/CONVENTIONS.md` §3): the **internal ID** (UUIDv7,
  **made on the phone** for field records, so a retried sync is the same record, KD-56) is the key;
  a **business number** (ticket, cert, ROE number, Monitor ID) is what people read and scan and is
  never a key; a **display label** (`CLT`, `-A`) is never stored in a number (ADR-062).
- **Uniqueness the database enforces** (ARCHITECTURE §5.4, never relaxed to pass a test):
  one field event per project + workflow + bare number + split suffix + kind (ADR-062, 236);
  a cert number per project (ADR-045); unique event links on a completed record (invariant 17);
  a load call a whole number 0–100 (ADR-116); split fields both or neither;
  foreign keys everywhere; closed sets as check constraints.
- **Coordinates are exact decimals** (`Decimal(38, 8)`, WGS84), **never floats**; every distance is
  **geodesic**, in one TypeScript module in `packages/domain`, never Euclidean (ADR-005, 094;
  invariants 14, 15). Road mileage comes from our own routing server (`adms-validation` §5.5).
- **Time:** every time is stored as a **UTC instant plus the device's offset** at capture and the
  **server's received time**; "which day" questions use the project's IANA time zone (ADR-100,
  ARCHITECTURE §10). Say which end in a name: `collectionEndedAt`, never a bare `time`.

## 3.5 Which package and which role may write what

There are no service files to route through. **The boundary is the database role** (ARCHITECTURE §5,
§18; ADR-094, 097, 113):

| Package / app | Owns | Touches Postgres? |
|---|---|---|
| `packages/domain` | every rule as a plain class: capacity, quantities, checks, numbering, time; shared with the phone | **no** |
| `packages/contracts` | Zod schemas for every API and sync payload | no |
| `packages/db` | the Prisma schema folder, migrations, the guard migrations, seed data | yes (as `adms_owner`, migrations only) |
| `apps/api` (role `adms_api`) | inserts evidence at sync and quarantine; writes configuration; corrects evidence (audited); writes people's marks (QC status, invoice lock and batch, flag acceptances) as their own records | yes; **no `DELETE` anywhere**, `SELECT` only on derived tables |
| `apps/worker` (role `adms_worker`) | writes derived records and the reconciliation columns on events; deletes transactions only through regeneration | yes |
| read-only portal and reports (role `adms_readonly`) | views, row-level security by project and contractor (ADR-169) | `SELECT` only |
| `apps/field`, `apps/back-office` | screens | **never**: only through the API |

- **Every write transaction states its actor first** (one shared Prisma client extension); a write
  with no actor is refused; `AuditRecord` is written by triggers alone and refuses updates and
  deletes; a transaction delete copies the row to audit first and is refused on a locked ticket
  (ARCHITECTURE §5.3).
- **Built in 0.3.2 (ADR-270):** the grants are column-level on evidence (the API corrects the
  captured columns, never the worker's; the worker writes only its own: `status`,
  `reconciled_at` and, since ADR-340, `zone_id`, `map_version_id`, `worked_out_pay_item_id`), and
  nothing is granted by default. **A new table is guarded in one line** (ADR-271): after its
  model's migration, a guard migration `SELECT guard_table('pay_item', 'CONFIGURATION', 'BILLING');`
  (kinds: `CONFIGURATION`, `MARK`, `EVIDENCE` with the worker's columns, `DERIVED`), rerun when an
  evidence model gains a column; the installer stops while `guard_gaps()` lists a gap. The actor is stated as `adms.actor_id` + `adms.source`; the viewer as
  `adms.viewer_id`, who is looking: the database reads their kind, contractor and projects from their
  own record (`User.viewerKind`, `contractorId`, `ViewerProject`, table `user_viewer_project`;
  ADR-315, replacing ADR-270's two settings). **A table a client user or an auditor should see gets
  its row-level security in one line** in its guard migration: `SELECT guard_viewer('<table>',
  '<PROJECT|PART_OF|NAMED_BY|FIRM>'[, relation, column][, hidden][, citizen]);`; a contractor user sees no
  setup, and no viewer a contact detail or a person (ADR-315). **Whether a viewer sees private
  citizens by name is the firm's choice for each viewer** (the user, ADR-328 (4); built, ADR-336):
  `User.seesPrivateCitizens`, stated on every read-only viewer, starting at yes. The columns that
  name one (`citizen`: an ROE's `owner_name`; a drop-off log's `resident_name` and
  `origin_address`) are in no `viewer_<table>` view and granted to no viewer; `viewer_<table>_citizen`
  shows them only to a client user or an auditor the firm lets see them. **A secret column is kept out of the audit
  log** by naming it on its table's audit trigger (`audit_capture('SECURITY', 'hash')`): the record
  says it changed, never its value (ADR-281).
- **Ordinary modelling is Prisma, never hand-written SQL**; only the guards are SQL, each its own
  reviewed, tested migration written into Prisma's `--create-only` stub. **Never edit a generated or
  applied migration** (ADR-094, 113; invariants 12, 18).
- **No business logic in the database** (ARCHITECTURE §5.6): pricing, capacity, reconciliation and
  time rules live in `packages/domain`.

---

## History

What this page used to say, and why it changed. Never build from the left-hand side.

- "Source of truth: `database/prisma/schema.prisma`", its model names used verbatim, and the eight
  files of `database/src/services/` owning every mutation, "all SQL in `queries.py`" → nothing is
  built; the rebuild's schema in `packages/db`, names per CONVENTIONS §3, the write boundary by
  database role (ADR-093, 094, 097).
- Seven ticket tables (`TicketType` COLLECTION · DISPOSAL · LOAD · HAUL_OUT_COLLECTION ·
  HAUL_OUT_DISPOSAL · HAUL_OUT · UNIT_RATE), each inlining the base columns (ADR-009), and the
  reconciler writing `LoadTicket` / `HaulOutTicket` → one `FieldEvent` model with five kinds;
  `CompletedLoad` / `CompletedHaulOut` drawn from it (ADR-062, 236).
- `ReconciliationStatus` `PENDING · MATCHED · FAILED · MANUAL_REVIEW`, and `HARD_REVIEW` /
  `SOFT_REVIEW` in older prose → four statuses (ADR-060, 118).
- `DebrisType` as a closed 12-value enum (ADR-001) → a firm list added to each project's forms
  (ADR-074, 211, 214, 233, 234).
- `ProgramType`, `ContainerType`, `CrewType`, `DisposalSiteType` (`TDRS FDS DPTS HHW OTHER`),
  `IncidentType` as closed enums → firm lists (ADR-070, 091, 190, 215). `BillingUnit` `TON`/`EACH`
  → `TN`/`EA`, plus `LB` and `HR` (CONVENTIONS §4).
- The `Program` model (name + `requireRoe`, filled with funding programs, KD-16) → `DeclarationEvent`,
  the program type on `Project`, and no funder field (ADR-023, 024, 026, 148).
- A long list of candidate program types (CPDR, marine vessel, fire ash…) → the firm adds its own
  (ADR-070); the human-remains "stop work" protocol, withdrawn → ordinary unit rate tickets (ADR-052).
- `ProjectContract`, a contractor chain of unlimited depth, tiers set on the contract → several
  primes, their own subs at most two tiers, typed in at certification; a contract is name, prime,
  link (ADR-075, 081 → 108, 146).
- Service codes, one per contractor, then a "service code" with "requires weight", "shown to
  monitors", a debris type and a monitor-picked code on each load half; a contract on each rule
  action → the **pay item** (rate per prime, no weight box, Unit of Measure decides), no pay item on
  a load, one contract per rule (ADR-054, 174, 175, 182, 191 → 206, 207, 221, 223, 237, 239).
- Site options Disposal · Haul-out · Staging · Citizen drop-off · HHW and citizen drop-off as a ticket
  type → the site type plus four facts; drop-off logs are forms (ADR-180, 190, 194, 201, 205 → 184,
  215).
- QC status on every record a monitor makes, halves included → on the completed load, unit rate
  tickets, certifications and forms (ADR-107 → 168).
- Coordinates measured by `geopy` in `gps.py` → one TypeScript module (ADR-005 → 094).
- A fee kind on each pay item (Hauling, TDSR fee, Tipping fee), one line per kind → no fee kinds;
  the # slot, the site's tipping fee link and the payable type (ADR-089 → 118, 220, 222, 246).
- Round 13–22 ⚠️ notes and the ADR-236…243 note stacked on the historical body → absorbed:
  `FieldEvent`, `Assignment`, `ClockEntry`, the contract on the rule; rewritten in the present tense
  (ADR-138, 243, 245).
- The provisional `PayItem` as project, code and name, neither unique → project, code (unique on its
  project) and description (ADR-286 → 301).
- "Storage shape … is an ADR when the first list is built"; "only a provisional schema exists" → one
  table per list, built with its guards and starting values (ADR-302).
- The provisional `Project` as a name and a time zone → the project in full, under its client and
  declaration event, its settings' starting values in `packages/domain` from the policy values
  (ADR-303).
- The provisional `PayItem` (project, code, description) → every field of `spec/DATA-MODEL.md` §3, a
  rate per prime held to the project's primes, a crew day's steps; an assignment names only unit
  rate pay items; size bands checked in `packages/domain` (ADR-309).
- The provisional `Contractor` as a name → its kind and merge link, its place on each project
  (`ProjectContractor`) and the `Contract`, with "the prime" held to one of the project's primes by
  the database (ADR-305).
