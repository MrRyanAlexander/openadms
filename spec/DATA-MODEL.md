# Open ADMS — The data model

✅ **Approved** With the user's approval of the wording - 10.01.2026-1345 *(BACKLOG 0.2b.2; ADR-284; the approval is ADR-289; changed since, at the user's word, by ADR-292…295 and ADR-301)*

← [Index](INDEX.md)

> **What this page is.** The schema on paper: every record Open ADMS keeps, its fields, who may
> write it, what the database itself refuses, and the columns each export carries. Phase 1's Prisma
> schema is written from it (ADR-140, 164). **It decides names and shapes, never rules**: what a
> record *means* stays with the newest ADR, `agent_store/SUMMARY.md` and the skills
> (`adms-data-model` is the model in prose; `adms-ticket-workflows` §4.0 and §4.2–§4.6 say what each
> record holds; `adms-certifications` §3A.2–§3A.3 the certification). Names follow
> `spec/CONVENTIONS.md` §3; examples come from its example world (`spec/golden/MISSION.md`).
>
> **What exists today.** Thirteen provisional models are built (ADR-268, 281), plus the pay item's
> first shape (ADR-286) and, in full, the firm's eighteen lists of §2.3 (ADR-302), the client,
> the declaration event and the project of §2.1 and §3 (ADR-303), and the contractor, its place
> on a project and the contract (ADR-305). §10 says, model by model, what Phase 1 changes.

**How to read a record.** Every record on this page is laid out the same way (ADR-289): its name,
one line saying what kind of record it is (§1) and what it is for, then one table of its fields.

| In a table | Means |
|---|---|
| *Field* | The Prisma name (camelCase); its column is the snake_case of it |
| **Bold** field | Required |
| `→ Model` | A foreign key to that model |
| `uuid` · `text` · `bool` · `int` · `date` · `decimal(p,s)` | The plain types; `instant` is a `timestamptz(3)` (§1, Time) |
| `enum` | A closed set: its values are in the Notes, and the named ones are listed in §9 |
| `JSONB` | Stored as written, read by people; never by the engine, a rule or a flag (§1) |
| `geometry` | A GeoJSON shape (§1, Shapes on a map) |
| *open* | The page names the field and leaves its type to the phase that builds it |
| *Agent default* | A shape nothing settled before this page; each is listed in §12 |
| (ADR-…) | The decision a field's rule comes from |

**On this page**

| § | What | The records |
|---|---|---|
| 1 | Conventions every model follows | |
| 2 | Shared, firm-wide records | `Client` · `DeclarationEvent` · `Contractor` · `ProjectContractor` · `User` · `UserPermission` · `ViewerProject` · `Device` · `MasterPasscode` · `Assignment` · `AssignmentPayItem` · the firm's lists |
| 3 | A project and its setup | `Project` · `ProjectKindOfWork` · `Contract` · `Form` · `FormDebrisType` · `FormDefinition` · `PayItem` · `PayItemCrewDayStep` · `PayItemRate` · `Rule` · `RuleCriterion` · `RuleCriterionPick` · `RuleAction` · `RuleActionItem` · `DisposalSite` · `DisposalSiteLabel` · `SiteAreaVersion` · `MapVersion` · `Zone` · `ProjectNumberSeries` · `ControlRange` · `NumberBlock` · `Certification` · `CertificationBox` · `CertificationHelper` · `Roe` · `RoeScopeItem` · `ClockEntry` · `ClockActivityLine` · `ApprovedDay` |
| 4 | Evidence: what monitors saw | `FieldEvent` · `FieldEventItem` · `CarriedTicket` · `ScaleReceipt` · `Survey` · `Incident` · `DropOffLog` · `Photo` · `Sync` · `SyncedRecord` · `QuarantinedRecord` · `FieldEventEdit` · `SetupManifest` |
| 5 | Derived: the worker's conclusions | `CompletedLoad` · `CompletedLoadCollection` · `CompletedHaulOut` · `CompletedHaulOutCollection` · `Transaction` · `Flag` · `ReconciliationRun` · `ReconciliationDecision` |
| 6 | Marks: what people set | `QcMark` · `InvoiceLock` · `InvoiceBatch` · `FlagAcceptance` · `TicketVoid` · `ApprovedDay` |
| 7 | Audit | `AuditRecord` |
| 8 | What the database refuses by itself | |
| 9 | The closed sets | |
| 10 | From today's schema to this page | |
| 11 | Exports: the column names | |
| 12 | The agent defaults on this page | |

---

## 1. Conventions every model follows

| Rule | What it means in the schema | From |
|---|---|---|
| **Names** | Models PascalCase and singular; fields camelCase; tables and columns snake_case through `@@map` / `@map` (`PayItem` → `pay_item`). A name says which end: `collectionEndedAt`, never `time` | CONVENTIONS §3 |
| **Keys** | `id` is a UUIDv7. **Made on the phone** for anything a phone makes (field events, ROEs, surveys, incidents, drop-off logs, clock entries, photos, certifications, scale receipts, an unplanned assignment), so a retried sync is the same record (KD-56); made by the database (`uuidv7()`) for everything else | ADR-268, 281 |
| **Business numbers** | A ticket number, cert number, ROE number or Monitor ID is `text` people read and scan. Never a key, never parsed for meaning; a label (`CLT`, `-A`) is never stored inside one | ADR-062 |
| **Relations** | Every foreign key is `ON DELETE RESTRICT ON UPDATE RESTRICT`: nothing is hard-deleted and an id never changes | ADR-268 |
| **Time** | Every time is `timestamptz(3)`: a UTC instant. Anything a phone captured also keeps `deviceUtcOffsetMinutes` and the server's `receivedAt`. A calendar day (`workDate`, `activeFrom`) is a `date` in the project's time zone | ADR-100, 281 |
| **Coordinates** | `decimal(38,8)` latitude and longitude, WGS84. Never a float | ADR-005 |
| **Money and quantities** | `decimal(14,4)` for a rate and a quantity, `decimal(14,2)` for an amount. Never a float | ADR-268 |
| **Measurements** | Whole inches are `int`; a measured diameter or circumference is `decimal(8,1)` | ADR-076, 177 |
| **Closed sets** | A Postgres enum per closed set (§9), the key in UPPER_SNAKE. Code tests the key, never a name | ADR-194 |
| **The firm's lists** | One table per list (§2.3): a real foreign key wherever a value is picked | *agent default* |
| **Leaving** | Configuration is archived (`archivedAt`), a project closed (`closedAt`), a ticket voided. No row is ever deleted, except a `Transaction` by regeneration (copied to the audit log first) | ADR-085 |
| **Free text** | Every record a person makes takes `notes` | ADR-160 |
| **The firm's own fields** | One `answers` JSONB column plus the `formDefinitionId` it answered (§4.5). **Nothing the engine, a rule or a flag reads is ever in JSONB** | ADR-278 |
| **Shapes on a map** | GeoJSON geometry in longitude and latitude, with its bounding box: fixed-shape data the engine reads, as ARCHITECTURE §3 approved | ADR-141 |

**Four kinds of record** (`adms-data-model` §3.1b), each guarded in the database by its kind
(`guard_table`, ADR-271), plus the marks people set:

| Kind | Written by | Changed how |
|---|---|---|
| **Configuration** | the API (`adms_api`), audited | edited freely; archived or closed, never deleted |
| **Evidence** | the API: inserted at sync, or by the back office with a person and a reason | corrected in place by permission, prior value kept in the audit log; the worker writes only the reconciliation columns |
| **Derived** | the worker (`adms_worker`) only | drawn again on every reprocess; never by a person |
| **Mark** | the API, for a person | its own record, keyed to what it marks, so a reprocess can't lose it (ADR-245) |
| **Audit** | database triggers only | never |

---

## 2. Shared, firm-wide records

### 2.1 Who is paying, what happened, who does the work

#### `Client`

*Configuration, built (ADR-303).* The jurisdiction paying. Reused across disasters (ADR-023).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **name** | text | "Bayline County" |
| contactName, contactEmail, contactPhone | text | Edited freely, audited |
| notes | text | |
| **createdAt** | instant | |
| archivedAt | instant | |

#### `DeclarationEvent`

*Configuration, built (ADR-303).* The disaster and its reference; shared by every client's
projects under it (ADR-023, 026). Always "declaration event", never a bare "event".

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **name** | text | "Hurricane Delphine" |
| **reference** | text | `DR-9001-FL`, or a state, local or internal reference |
| **referenceTypeId** | → `DeclarationReferenceType` | The firm's list |
| **createdAt** | instant | |
| archivedAt | instant | |

#### `Contractor`

*Configuration, built (ADR-305, 306).* A hauling company, or an employer of monitors (Q-97). Whether it
is a prime or a sub is its place on each project (`ProjectContractor`), never a fact of its own.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **name** | text | |
| **kind** | enum `ContractorKind` | `HAULER` · `MONITORING` · `CREW` · `OTHER` (Q-97, `FROM-BUILD-1.md`). No default: whoever adds it says which (ADR-305) |
| contactName, contactEmail, contactPhone | text | Edited freely, audited, as a client's; each optional (the user, ADR-306) |
| mergedIntoId | → `Contractor` | A sub typed twice at certification, merged by the back office, audited (ADR-108); the merged row is archived, never deleted. Never itself, and a merged row is archived for as long as it is merged (checks, ADR-305) |
| **createdAt** | instant | |
| archivedAt | instant | |

#### `ProjectContractor`

*Configuration, built (ADR-305).* A contractor's place on one project. A project may have several
primes; a sub belongs to one prime, at most two tiers, never shared (ADR-108).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | Unique with `contractorId`: a contractor has one place on a project |
| **contractorId** | → `Contractor` | |
| **position** | enum `ContractorPosition` | `PRIME` · `SUB_TIER_1` · `SUB_TIER_2` |
| primeId | → `Contractor` | The prime it works under, tier 1 and tier 2 alike; required for a sub, empty for a prime (check). **One of this project's primes**: with `projectId` it is a two-column foreign key to that prime's row (its `projectId`, `asPrimeId`), so a sub can't name a sub, a contractor of another project, or itself (ADR-305) |
| asPrimeId | uuid | On a prime's row, its own contractor again; empty on a sub's (check). Unique with `projectId`: the key that "the prime" points at, here and on `Contract`. A prime that a sub or a contract names can't be made a sub (*agent default*, ADR-305) |
| **createdAt** | instant | A sub's row is made when it's typed in at certification |
| archivedAt | instant | |

### 2.2 People, phones and the master passcode (built, ADR-281)

#### `User`

*Configuration.* A person with a login; firm-wide, not project-scoped (ADR-050).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **name** | text | |
| **role** | enum `UserRole` | `ADMIN` · `MANAGER_ANALYST` · `MONITOR` · `READ_ONLY_VIEWER` · `SYSTEM` (the worker's one actor, never a login, ADR-273) |
| monitorNumber | text, unique | The Monitor ID (`M004127`), issued by the database; every monitor has one (ADR-281) |
| employerId | → `Contractor` | Who employs them when it isn't the firm |
| employerNumber | text | That employer's own ID for them (`HS-0417`) |
| contractorId | → `Contractor` | A contractor user's contractor: what they may see (ADR-169) |
| viewerKind | enum `ViewerKind` | `CLIENT` · `CONTRACTOR` · `AUDITOR`, on a read-only viewer only |
| email, phone | text | A monitor's phone is shown to admins only (ADR-169) |
| **createdAt** | instant | |
| archivedAt | instant | |
| *Phase 2:* passwordHash, twoStepSecret, lockedUntil… | | Sign-in's columns, each kept out of the audit log like the master passcode's hash (C21) |

#### `UserPermission`

*Configuration.* What a manager/analyst is granted (ADR-050). *Agent default:* the list is part
02's, with setup, dispatch and hours added because those pages give them to "a manager/analyst with
permission"; an admin needs none.

| Field | Type | Notes |
|---|---|---|
| **userId** | → `User` | Unique with `permission` |
| **permission** | enum `Permission` | `CORRECT` · `RENUMBER` · `VOID` · `ACCEPT_FLAG` · `QC` · `LOCK_INVOICED` · `UNLOCK_INVOICED` · `APPROVE_HOURS` · `SETUP` · `DISPATCH` |

#### `ViewerProject`

*Configuration.* The projects a read-only viewer may see. Row-level security reads it (ADR-169).

| Field | Type | Notes |
|---|---|---|
| **userId** | → `User` | Unique with `projectId` |
| **projectId** | → `Project` | |

#### `Device`

*Configuration, as built (ADR-281).* A phone, enrolled once: no project, no monitor.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **name** | text | |
| **publicKey** | text, unique | The device key's public half |
| **status** | enum `DeviceStatus` | `ACTIVE` · `LOST` · `RETIRED` |
| **masterPasscodeVersion** | int → `MasterPasscode.version` | The passcode version the phone holds |
| **enrolledAt** | instant | |
| outOfServiceAt | instant | Work made after it arrives flagged (ADR-134) |
| keyRevokedAt | instant | *New in Phase 1:* its key refused once a lost or retired phone is wiped (C47) |

#### `MasterPasscode`

*Configuration, as built (ADR-281).* A version and its slow hash, never edited, read only by the API.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **version** | int, unique | |
| **hash** | text | Kept out of the audit log (§7) |
| **createdAt** | instant | |

`NumberBlock`, the third model built with these two, is under Numbering in §3.

#### `Assignment`

*Configuration, built.* One person's work for a day (ADR-240).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | An unplanned one's comes from the phone |
| **personId** | → `User` | |
| **workDate** | date | |
| **projectId** | → `Project` | |
| **fieldEventKinds** | `FieldEventKind[]` | The kinds of field event they may record |
| **certifying** | bool | |
| **formDocumentTypes** | `FormDocumentType[]` | The forms they may make: ROEs, surveys, incidents, drop-off logs (C42) |
| siteId | → `DisposalSite` (same project) | One site, where the work is at one |
| deviceId | → `Device` | Named on the board, or the phone that took it |
| **origin** | enum `AssignmentOrigin` | `PLANNED` (with its author) or `UNPLANNED` (no author, always its phone) |
| madeById | → `User` | The author of a planned one |
| **createdAt** | instant | |
| archivedAt | instant | Withdrawn by archiving; never expires |

#### `AssignmentPayItem`

*Configuration, built by ADR-286.* The unit rate pay items a person does that day (ADR-127, 240).

| Field | Type | Notes |
|---|---|---|
| **assignmentId** | → `Assignment` | Of the assignment's own project |
| **payItemId** | → `PayItem` | Of the assignment's own project |
| archivedAt | instant | Takes one off |

### 2.3 The firm's lists

One table per list (*agent default*; `spec/LISTS.md`'s build note leaves the storage to an ADR when
the first is built, and this is the proposal). **Built 2026-10-02 (ADR-302):** all eighteen, their
guards (`guard_list`, one line each) and what each starts with (`spec/LISTS.md`, "What ships"). Every
list table has the same six columns, plus the settings its values carry:

| Column | Type | Notes |
|---|---|---|
| **id** | uuid | |
| key | text, unique | Set only on a **built-in value** (`STUMPS`); code tests it, never the name; a built-in value is never archived (ADR-194). The keys are one closed set in `packages/domain`; the database lets only a release (the migrations and the seed) write one (ADR-302) |
| **name** | text | What people pick; renamed freely, audited |
| **position** | int | The order shown |
| **createdAt** | instant | |
| archivedAt | instant | |

The eighteen lists:

| Model | Its own columns | Built-in keys |
|---|---|---|
| `ProgramType` | **requiresRoe** bool | |
| `DeclarationReferenceType` | | |
| `DebrisType` | | |
| `ReductionMethod` | | |
| `PayableType` | | |
| `KindOfWork` | **countShape** enum (`NUMBER` · `ITEM_COUNTS` · `ITEM_HOURS`) | `STUMPS` (ADR-198) |
| `ItemName` | **kindOfWorkId** | |
| `VehicleType` | **certifies** enum `CertificationKind` (`CONTAINER` · `CREW`; the set a certification's `kind` uses, ADR-302) | |
| `VehicleFeature` | | |
| `CrewType` | | |
| `SiteType` | | `TDSR` (a haul-out dumped at one, ADR-226) · `FINAL_DISPOSAL` (the optional receipt number, ADR-227) |
| `SiteLabel` | | |
| `IncidentType` | | |
| `IncidentSubType` | **incidentTypeId** | |
| `Reason` | **uses** `ReasonUse[]` (`VOID` · `TYPED_NUMBER` · `ACCEPT_FLAG` · `BACK_OFFICE_RECORD`, ADR-173) | |
| `SurveyWorkType` | | `PRE_WORK` · `POST_WORK` · `ROE` (a post-work survey finds its pre-work survey, ADR-150) |
| `ClockActivity` | | |
| `FieldTag` | **projectId** (the one project list, ADR-216) | |

"Other (typed)" on a describing list (a vehicle type) is a text column beside the pick on the record
that uses it (`vehicleTypeOther`), which an admin can promote into the list (ADR-070).

---

## 3. A project and its setup (configuration)

### The project

#### `Project`

*Configuration, built (ADR-303).* The hub. **No setting has a default in the database**: what a
new project's settings start as is `packages/domain`'s (`NewProjectSettings`), its numbers read from
the policy values (`packages/domain/policy.env`, the release's built-in defaults), so whoever
creates a project says what it starts as (invariant 16, ADR-303).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **name** | text | "Bayline County ROW, Hurricane Delphine" |
| **clientId** | → `Client` | |
| **declarationEventId** | → `DeclarationEvent` | |
| **programTypeId** | → `ProgramType` | Its *requires ROE* drives the ROE checks (ADR-149) |
| **allowSplitLoads** | bool | Ticked for a new project where the program type requires ROEs (ADR-137) |
| **timeZone** | text | An IANA name, checked by the database (ADR-281) |
| **activeFrom** | date | The active window, judged by a load's time (ADR-161) |
| activeTo | date | Empty, or never before `activeFrom` (a check) |
| **ticketNumberSource** | enum `TicketNumberSource` | `CONTROL` · `GENERATED` (ADR-056) |
| **workflows** | `Workflow[]` | The ticket types it allows (ADR-041); may be empty, never missing (a check) |
| loadCallLowLimit, loadCallHighLimit | int | Flag at or under 5, at or over 95; empty = off; each 0–100 (a check); a new project starts with the policy values `LOAD_CALL_LOW_LIMIT`, `LOAD_CALL_HIGH_LIMIT` (ADR-164, 303) |
| **stumpFillDepthInches** | int | A new project starts with the policy value `STUMP_FILL_DEPTH_INCHES`, 31 (ADR-203, 303); at least 1 (a check) |
| **stumpCheckRootBallWider**, **stumpCheckFillNeedsExposure** | bool | The two built-in stump checks; a new project starts with both on (ADR-203) |
| **siteCircleMeters** | int | A new project starts with the policy value `DISPOSAL_SITE_PROXIMITY_M`, 200 (ADR-142, 303); at least 1 (a check) |
| **timeClockEnabled** | bool | Whether the project offers its workers the time clock (ADR-241). A new project starts with it switched off; the firm switches it on (ADR-303; confirmed by the user, ADR-304) |
| **createdAt** | instant | |
| closedAt | instant | |

#### `ProjectKindOfWork`

*Configuration, built (ADR-303).* The kinds of unit rate work the project allows (ADR-127).

| Field | Type | Notes |
|---|---|---|
| **projectId** | → `Project` | Unique with `kindOfWorkId` |
| **kindOfWorkId** | → `KindOfWork` | |
| archivedAt | instant | Takes one off the project; cleared, it's back (*agent default*, ADR-303, as `AssignmentPayItem`) |

### Contracts and forms

#### `Contract`

*Configuration, built (ADR-305).* A name, its prime and an optional link. Nothing else: no number,
dates or amount (ADR-146). A prime may hold one contract on a project or several.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | |
| **name** | text | "Coastline, Bayline ROW 2026" |
| **primeId** | → `Contractor` | **One of its own project's primes**: with `projectId`, a two-column foreign key to that prime's row on `ProjectContractor` (its `projectId`, `asPrimeId`), so the contractor is added to the project first and the database refuses a contract whose prime is a sub or isn't on the project (ADR-146, 305) |
| signedCopyUrl | text | As the firm wrote it |
| **createdAt** | instant | When the record was made; not a date of the contract |
| archivedAt | instant | |

#### `Form`

*Configuration.* A project's form for one document type (ADR-211).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | Unique with `documentType` |
| **name** | text | |
| **documentType** | enum `FormDocumentType` | `LOAD` · `HAUL_OUT` · `UNIT_RATE` · `CERTIFICATION` · `ROE` · `SURVEY` · `INCIDENT` · `DROP_OFF_LOG` |
| **enabled** | bool | Incidents and drop-off logs are switched on per project (ADR-188) |
| gpsRequired | bool | On the ROE form (ADR-181) |

#### `FormDebrisType`

*Configuration.* A debris type added to a load or haul-out form (ADR-211, 214). **A field event
points at this entry**, so a rule's *Debris type* matches the exact entry (ADR-226).

| Field | Type | Notes |
|---|---|---|
| **formId** | → `Form` | Unique with `debrisTypeId` |
| **debrisTypeId** | → `DebrisType` | The firm's library value |
| **reduced** | bool | |
| reductionMethodId | → `ReductionMethod` | |
| **hiddenOnPhones** | bool | |
| archivedAt | instant | |

#### `FormDefinition`

*Configuration.* The firm's added fields on a survey, ROE, incident or drop-off log form (ADR-160,
278). A change is a new version; a version is never edited (guarded like `MasterPasscode`).

| Field | Type | Notes |
|---|---|---|
| **formId** | → `Form` | |
| **version** | int | |
| **fields** | JSONB | Each field's stable id, label, type (`TEXT` · `NUMBER` · `YES_NO` · `PICK` · `PHOTO`), required, its choices |
| **createdById** | → `User` | |
| **createdAt** | instant | |

### Pay items and rates

#### `PayItem`

*Configuration, provisional shape built (ADR-286).* A priced line; **the only place a rate lives**.
**It names no form: a rule does** (`Rule.formId`), so one pay item, such as a site's tipping fee, can
be added by a Load rule and by a Haul-out rule. A unit rate pay item is known by its `kindOfWorkId`
(ADR-292).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | |
| **code** | text | The firm's string; setup suggests one (`VEG-HAUL-CY-15`) and forces none. **Unique with the project**, archived pay items included: a rate that changes from a date is a second pay item with a code of its own, the firm's choice (ADR-235, 301) |
| **description** | text | What the work is, in the firm's own words ("ROW VEG haul 0–15 mi"); shown with the code wherever a pay item is listed or exported; nothing reads it, and two may share one (ADR-301; there is no separate name) |
| **payableTypeId** | → `PayableType` | The work it prices; every pay item has one (ADR-221) |
| **unit** | enum `BillingUnit` | `CY` · `TN` · `EA` · `LB` · `HR` · `CREW_DAY` · `TBN`; `TN` or `LB` means the load is weighed (ADR-223) |
| kindOfWorkId | → `KindOfWork` | Required on a unit rate pay item (ADR-127) |
| bandFrom, bandTo | decimal(8,1) | The size band, in inches; bands of one payable type never overlap (setup refuses, ADR-217) |
| **countIsAlwaysOne**, **gpsRequired**, **measurementRequired**, **decimalsAllowed**, **photosRequired**, **monitorMayMarkIneligible**, **quantityFromCarriedTickets** | bool | The capture settings (ADR-157, 192, 207, 210) |
| crewTimeConversion | enum `CrewTimeConversion` | `PER_HOUR` · `PER_DAY_EXACT` · `PER_DAY_STEPS` (ADR-087) |
| crewDayHours | decimal(4,2) | Default 12 |
| **createdAt** | instant | |
| archivedAt | instant | |

#### `PayItemCrewDayStep`

*Configuration.* The steps of a crew day paid in steps (1.5–4.5 h = 0.25…).

| Field | Type | Notes |
|---|---|---|
| **payItemId** | → `PayItem` | |
| fromHours, toHours | *open* | |
| quantity | *open* | |

#### `PayItemRate`

*Configuration.* One rate for each prime, never a copy of the pay item (ADR-206). No row = no rate
for that prime (a $0 line, flagged, ADR-212). A rate's history is the audit log.

| Field | Type | Notes |
|---|---|---|
| **payItemId** | → `PayItem` | Unique with `primeId` |
| **primeId** | → `Contractor` | |
| **rate** | decimal(14,4) | |

### Rules (`spec/RULES.md`)

#### `Rule`

*Configuration.* `spec/RULES.md` §2. "Is valid" is computed, never stored.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | |
| **formId** | → `Form` | |
| **name** | text | |
| contractId | → `Contract` | Empty only on a rule with no *Add transaction* (ADR-239) |
| **active** | bool | |
| fromPayItemId | → `PayItem` | Written by that pay item's "Pays when" and edited only there (ADR-229) |
| archivedAt | instant | |

#### `RuleCriterion`

*Configuration.* One line of a rule's "ifs". Real columns, never JSON: the engine reads them.

| Field | Type | Notes |
|---|---|---|
| **ruleId** | → `Rule` | |
| **position** | int | |
| **criterion** | enum `RuleCriterionKey` | §9 |
| **operator** | enum `RuleOperator` | §9 |
| numberFrom, numberTo | decimal(14,4) | The typed value, where it is a number |
| dateFrom, dateTo | date | The typed value, where it is a date |
| text | text | The typed value, where it is text |

#### `RuleCriterionPick`

*Configuration.* One row per picked value of a criterion.

| Field | Type | Notes |
|---|---|---|
| **criterionId** | → `RuleCriterion` | |
| contractorId | → `Contractor` | **Exactly one** of these eight is filled |
| formDebrisTypeId | → `FormDebrisType` | |
| fieldTagId | → `FieldTag` | |
| disposalSiteId | → `DisposalSite` | |
| siteTypeId | → `SiteType` | |
| payItemId | → `PayItem` | |
| itemNameId | → `ItemName` | |
| zoneName | text | A zone is matched by name, since map versions change |

#### `RuleAction`

*Configuration.* What happens to a ticket that meets every criterion.

| Field | Type | Notes |
|---|---|---|
| **ruleId** | → `Rule` | |
| **kind** | enum `RuleActionKind` | `ADD_TRANSACTION` · `REMOVE_TRANSACTION` · `VOID_TICKET` |
| slot | int | On add and remove |
| payItemId | → `PayItem` | On add |
| quantityFrom | enum `QuantityFrom` | `ALL_ITEMS` · `CHOSEN_ITEMS` (ADR-128) |

#### `RuleActionItem`

*Configuration.* The chosen items of an action whose quantity is from chosen items.

| Field | Type | Notes |
|---|---|---|
| **actionId** | → `RuleAction` | |
| **itemNameId** | → `ItemName` | |

### Sites and the map

#### `DisposalSite`

*Configuration, provisional shape built.* Entered on each project that uses it (ADR-145).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | |
| **name** | text | "Bayline County Landfill" |
| shortCode | text | `BCL`: what setup offers in a suggested pay item code (*agent default*) |
| **siteTypeId** | → `SiteType` | What *Disposal site type* tests |
| **takesLoads**, **haulOutsLeaveHere**, **chargesTippingFee**, **ineligibleSite** | bool | The four site facts (ADR-215). `haulOutsLeaveHere` only on a site whose type is the built-in TDSR/DMS: setup refuses it elsewhere (ADR-298, *agent default*; whether the database refuses it too is settled with the site's real model, C52) |
| permitNumber | text | Empty = "permit outstanding", flagged, never blocking (ADR-111) |
| **latitude**, **longitude** | decimal(38,8) | Entered with the site; where mileage ends (ADR-208) |
| **activationDate** | date | ADR-173 |
| closeDate | date | |
| tippingFeePayItemId | → `PayItem` | The link that tells a fee line (ADR-222) |
| **createdAt** | instant | |
| archivedAt | instant | |

#### `DisposalSiteLabel`

*Configuration.* A site's own labels.

| Field | Type | Notes |
|---|---|---|
| **siteId** | → `DisposalSite` | |
| **siteLabelId** | → `SiteLabel` | |

#### `SiteAreaVersion`

*Configuration.* A site's own shape (the advanced area); dated and kept. A site with none uses the
project's circle (ADR-142, 144).

| Field | Type | Notes |
|---|---|---|
| **siteId** | → `DisposalSite` | |
| **geometry** | geometry | |
| **boundingBox** | *open* | The shape's bounding box (§1) |
| **source** | enum `SiteAreaSource` | `DRAWN` · `UPLOAD` |
| **createdById** | → `User` | |
| **effectiveFrom** | *open* | |

#### `MapVersion`

*Configuration.* A project's boundary and zones as loaded. Never edited or deleted (ADR-135, 141).

| Field | Type | Notes |
|---|---|---|
| **projectId** | → `Project` | |
| **version** | int | |
| **source** | enum `MapSource` | `UPLOAD` · `ESRI_LAYER` · `DRAWN` |
| sourceName | text | |
| zoneNameField | text | |
| **boundary** | geometry | |
| **boundingBox** | *open* | The shape's bounding box (§1) |
| uploadedFileKey | text | |
| **loadedById** | → `User` | |
| **loadedAt** | instant | |

#### `Zone`

*Configuration.* One zone of a map version (ADR-135, 141).

| Field | Type | Notes |
|---|---|---|
| **mapVersionId** | → `MapVersion` | |
| **name** | text | |
| **geometry** | geometry | |
| **boundingBox** | *open* | The shape's bounding box (§1) |

### Numbering

The server is the only allocator (ADR-065).

#### `ProjectNumberSeries`

*Configuration.* A project's series of numbers; unique on project + series. The model is not named
`NumberSeries`: that is the built enum its `series` field uses (ADR-292).

| Field | Type | Notes |
|---|---|---|
| **projectId** | → `Project` | |
| **series** | enum `NumberSeries` | `LOAD` · `HAUL_OUT` · `UNIT_RATE` · `CERTIFICATION` · `ROE` |
| **firstNumber** | int | |
| **nextNumber** | int | |

#### `ControlRange`

*Configuration.* Pre-printed stock (ADR-056).

| Field | Type | Notes |
|---|---|---|
| **projectId** | → `Project` | |
| **series** | enum `NumberSeries` | |
| **firstNumber** | int | |
| **lastNumber** | int | |

#### `NumberBlock`

*Configuration, as built (ADR-281)*, plus a database refusal of overlapping blocks (C43).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **deviceId** | → `Device` | |
| **projectId** | → `Project` | Unique with `series` and `firstNumber` |
| **series** | enum `NumberSeries` | |
| **firstNumber**, **lastNumber** | int | |
| lastUsedNumber | int | |
| **status** | enum `NumberBlockStatus` | `ISSUED` · `RECLAIMED` · `RETIRED`: how it ended |
| **issuedAt** | instant | |
| endedAt | instant | |

### Certifications

#### `Certification`

*Configuration.* `adms-certifications` §3A.2: a container or a crew, never a vehicle.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid (from the phone) | |
| **projectId** | → `Project` | **Unique with `certNumber`** |
| **certNumber** | text | Cert = placard = badge (ADR-045) |
| **kind** | enum `CertificationKind` | `CONTAINER` · `CREW` |
| **primeId** | → `Contractor` | Whose work it is, on every ticket that scans its badge (ADR-186) |
| firstTierSubId, secondTierSubId | → `Contractor` | Typed in at certification under the prime (ADR-108); the operating sub is the lowest one filled |
| vehicleTypeId | → `VehicleType` | |
| vehicleTypeOther | text | |
| crewTypeId | → `CrewType` | A crew only |
| capacityCy | int | A container only: whole CY, computed from its boxes exactly as §3A.3 says; **never typed**; a crew has none (check) |
| driverName, driverPhone, driverLicenceNumber, driverLicenceState | text | Recorded, never checked (ADR-153) |
| driverLicenceExpiry | date | |
| tagNumber, tagState | text | |
| tagExpiry | date | An expired tag flags later tickets (ADR-079) |
| **certifiedAt** | instant | |
| **deviceUtcOffsetMinutes** | int | |
| **receivedAt** | instant | |
| **certifiedById** | → `User` | The monitor who made it and measured it: one whose assignment includes certifying (ADR-151, 294) |
| deviceId | → `Device` | |
| assignmentId | → `Assignment` | |
| clientRepresentativeName, contractorRepresentativeName | text | Names only |
| **signaturesOnFile** | bool | Set at QC |
| replacesId | → `Certification` | A modified truck's new certification (ADR-082) |
| replacedReason | text | |
| copiedFromId | → `Certification` | The same truck on another project (ADR-152) |
| revokedFrom | date | By an admin, with a reason (ADR-079) |
| revokedReason | text | |
| revokedById | → `User` | |
| notes | text | |

**Who did what on a certification** (ADR-294): it is **made and measured** by the certifying monitor
(`certifiedById`); **helped** by whoever that monitor picks, or nobody (`CertificationHelper`);
**audited** by the back office at QC (its `QcMark.setById`, "checked by"). No other field says who.

#### `CertificationHelper`

*Configuration.* A helper on the measurement. **Picked, never typed**, from the people assigned to
the project with the certifying monitor; none is allowed (ADR-294). *Agent default:* a row each, so
one helper or several.

| Field | Type | Notes |
|---|---|---|
| **certificationId** | → `Certification` | Unique with `userId` |
| **userId** | → `User` | |

#### `CertificationBox`

*Configuration.* The measured boxes, stored so the capacity can always be recomputed.

| Field | Type | Notes |
|---|---|---|
| **certificationId** | → `Certification` | |
| **position** | int | 0 = the primary |
| featureId | → `VehicleFeature` | |
| featureOther | text | |
| **shape** | enum `BoxShape` | `RECTANGLE` · `TRIANGLE` · `TWO_LENGTH_HOIST` · `ROUND_BOTTOM` · `RADIUS_CORNER` |
| **sign** | enum `BoxSign` | `ADD` · `SUBTRACT`; the primary adds, a radius corner subtracts |
| length, secondLength, width, height, diameter, radius, run, corners | int | Whole inches |

### ROEs

#### `Roe`

*Configuration, like a certification (ADR-294).* A record like a ticket (ADR-149), and both setup
and field work: where the project requires ROEs it is set up for the project, then a monitor on a
phone or a back-office worker fills in its details (owner, address, signature). So it is edited as
configuration is (freely, audited, never deleted), not held to a field event's correction rules.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | From the phone or the database |
| **projectId** | → `Project` | |
| **roeNumber** | text | Unique with the project |
| parcelId | text | |
| address | text | |
| ownerName | text | |
| **signed** | bool | |
| signedDate | date | |
| latitude, longitude | decimal(38,8) | |
| **answers** | JSONB | The firm's own ROE form fields (ADR-160, 181). Its **scope** is not here: `RoeScopeItem`, below |
| **formDefinitionId** | → `FormDefinition` | The definition those answers answered |
| **source** | enum `RecordSource` | `DEVICE` · `BACK_OFFICE` |
| madeById | → `User` | |
| deviceId | → `Device` | |
| assignmentId | → `Assignment` | |
| madeAt | instant | With its offset and `receivedAt` |
| notes | text | |

#### `RoeScopeItem`

*As its `Roe`.* What the ROE allows, **picked from what the project already has** (ADR-293): a debris
type on the project's load form, or a payable type among the project's unit rate pay items. Nothing
is typed and nothing is pre-programmed. Real columns, never JSON: the engine reads them to raise
`ROE_OUT_OF_SCOPE`. **An ROE with no row here has no scope check.**

| Field | Type | Notes |
|---|---|---|
| **roeId** | → `Roe` | |
| formDebrisTypeId | → `FormDebrisType` (same project) | **Exactly one** of the two is filled (check); once per ROE |
| payableTypeId | → `PayableType` | |
| count | int | How many, where the ROE says (three trees); recorded and exported, never checked (*agent default*) |
| archivedAt | instant | Takes one off |

### The time clock (Phases 3–4; ADR-241)

**No field links any of it to crew time**, and no rate or pay is held.

#### `ClockEntry`

*Evidence.*

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | From the phone |
| **assignmentId** | → `Assignment` | |
| **kind** | enum `ClockEntryKind` | `IN` · `BREAK_START` · `BREAK_END` · `OUT` |
| **at** | instant | With its offset and `receivedAt` |
| deviceId | → `Device` | |

#### `ClockActivityLine`

*Evidence.*

| Field | Type | Notes |
|---|---|---|
| **assignmentId** | → `Assignment` | |
| **startedAt**, **endedAt** | instant | |
| activityId | → `ClockActivity` | What the app can't know; this, or `fieldEventId` |
| fieldEventId | → `FieldEvent` | Pre-filled from the day's field events |
| note | text | |

#### `ApprovedDay`

*Mark.*

| Field | Type | Notes |
|---|---|---|
| **assignmentId** | → `Assignment`, unique | |
| **approvedById** | → `User` | |
| **approvedAt** | instant | |
| unlockedById | → `User` | |
| unlockedAt | instant | |

---

## 4. Evidence: what monitors saw

### 4.1 `FieldEvent`: one model, five kinds (ADR-236)

#### `FieldEvent`

*Evidence, built in part.* **There is no ticket table**: a ticket is its number and its events
(*agent default*). Its columns come in three groups.

**1. Every kind records:**

| Field | Type | Notes |
|---|---|---|
| **id** | uuid, from the phone | |
| **projectId** | → `Project` | |
| **workflow** | enum `Workflow` | The workflow must fit the kind (check, built) |
| **kind** | enum `FieldEventKind` | |
| **ticketNumber** | text | The bare number, as scanned or shown |
| **splitSuffix** | text | `A`, `B`…; empty when not split, so the unique key holds. On a split load's collections (one per property) and a split haul-out's collections (one per pile, ADR-295) |
| **numberTyped** | bool | Typed instead of scanned: flagged, with its reason (ADR-111, 173) |
| numberTypedReasonId | → `Reason` | |
| **source** | enum `RecordSource` | `DEVICE` · `BACK_OFFICE` |
| **monitorId** | → `User` | Who witnessed it; never the system actor |
| deviceId | → `Device` | Required from a phone; empty on a back-office-created record (check; C44) |
| assignmentId | → `Assignment` | The same |
| setupVersion | int | The same |
| createdById | → `User` | The back-office person who created it (ADR-156); required when `source` is `BACK_OFFICE` |
| createdReasonId | → `Reason` | And why; required the same way |
| **temporarySession** | bool | Made under the master passcode's temporary session for this monitor (ADR-120) |
| **certNumber** | text | The number as scanned: a snapshot (ADR-017) |
| certificationId | → `Certification` | Empty while no certification on the project has that number (ADR-154) |
| **certKeyedByHand** | bool | A truck keyed in by hand: only the monitor's claim (ADR-154) |
| typedCapacityCy | int | The capacity they typed |
| siteId | → `DisposalSite` (same project) | From the assignment; empty on a curb collection and on unit rate work away from a site (ADR-195) |
| **startedAt**, **endedAt** | instant | The device's clock (ADR-100) |
| **deviceUtcOffsetMinutes** | int | |
| **receivedAt** | instant | |
| startLatitude, startLongitude, endLatitude, endLongitude | decimal(38,8) | Whatever fix the phone had (ADR-083) |
| address | text | |
| addressSource | enum `AddressSource` | `LOOKED_UP` · `TYPED` (ADR-111) |
| notes | text | |

**2. Kind-specific columns**, each empty on every other kind (a database check per column):

| Field | Type | `COL` | `DIS` | `HOC` | `HOD` | `URT` | Notes |
|---|---|---|---|---|---|---|---|
| formDebrisTypeId | → `FormDebrisType` | ✓ | ✓ | ✓ | ✓ | | Picked at each end, on its own (ADR-207) |
| fieldTagId | → `FieldTag` | ✓ | | ✓ | | ✓ | Optional (ADR-218) |
| roeNumber | text | ✓ | | | | ✓ | On an ROE project (ADR-149): the number as picked or typed, a snapshot like `certNumber` (Q-33; ADR-292) |
| roeId | → `Roe` | ✓ | | | | ✓ | Empty while no ROE on the project has that number (ADR-292) |
| estimateCy | decimal(8,1) | ✓ | | | | | A split load's property estimate; present exactly when a collection's `splitSuffix` is (check; ADR-055). A haul-out's piles give a load call instead (ADR-295) |
| loadCall | int 0–100 | | ✓ | ✓ | | | A whole number; 0 accepted and flagged (ADR-116). On a split haul-out each pile's is the **running** call: how full the container is after that pile; the last is the haul-out's (ADR-295) |
| scaleReceiptId | → `ScaleReceipt` | | ✓ | | ✓ | | The weight instead of a load call, or an optional receipt at a Final Disposal tower (ADR-223, 227) |
| carriedCount | int | | ✓ | | | | The tower's count on a load that carries tickets (ADR-243) |
| kindOfWorkId | → `KindOfWork` | | | | | ✓ | The kind of work captured (its screen: Stumps, Leaners…), kept on the event so it is known when no band fits and there is no pay item (ADR-292) |
| payableTypeId | → `PayableType` | | | | | ✓ | What the monitor picked by name (ADR-207) |
| payItemId | → `PayItem` | | | | | ✓ | What the phone worked out and printed; empty when no band fits (ADR-213) |
| unitCount | decimal(10,2) | | | | | ✓ | The count, pounds or, itemised, nothing (the items hold it) |
| measurementInches | decimal(8,1) | | | | | ✓ | A stump's is its diameter two feet up (ADR-177, 189) |
| measuredAs | enum `MeasuredAs` | | | | | ✓ | `CIRCUMFERENCE` · `DIAMETER` |
| rootBallInches | decimal(8,1) | | | | | ✓ | Stumps (ADR-198) |
| rootBallHalfExposed | bool | | | | | ✓ | Stumps (ADR-198) |
| surveyNumber | text | | | | | ✓ | Stumps: picked or typed; none is flagged (ADR-198). Matched to a survey by the number as written (ADR-294) |
| markedIneligible | bool | | | | | ✓ | Where the pay item allows it (ADR-210) |

**3. The reconciliation columns**, the only ones the worker may write (column grants, ADR-270).
Every event of a ticket carries the ticket's status.

| Field | Type | Notes |
|---|---|---|
| **status** | enum `TicketStatus` | `PENDING` · `COMPLETED` · `MANUAL_REVIEW` · `VOID` |
| reconciledAt | instant | |
| zoneId | → `Zone` | The zone attached from the GPS (ARCHITECTURE §3) |
| mapVersionId | → `MapVersion` | The map version used |
| workedOutPayItemId | → `PayItem` | On a unit rate event: the engine's answer from the bands. "The phone's answer printed, the engine's bills" (ADR-217) |

#### `FieldEventItem`

*Evidence.* An itemised unit rate event's lines (ADR-040, 084).

| Field | Type | Notes |
|---|---|---|
| **fieldEventId** | → `FieldEvent` | Unique with `itemNameId` |
| **itemNameId** | → `ItemName` | |
| **quantity** | decimal(10,2) | A count, or hours to the quarter hour |

#### `CarriedTicket`

*Evidence.* The tickets a load carries (ADR-192).

| Field | Type | Notes |
|---|---|---|
| **fieldEventId** | → `FieldEvent` | The collection; unique with `carriedTicketNumber` |
| **carriedTicketNumber** | text | |

### 4.2 Scale receipts (ADR-034, 038)

#### `ScaleReceipt`

*Evidence.* Its own record, pointed at by one or several disposal events, consumed once. Every
weight is what the paper says, never inferred; a tandem's shares are derived, on the completed
loads (§5).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | From the phone |
| **projectId** | → `Project` | **Unique with `receiptNumber`** |
| **receiptNumber** | text | The site's own, transcribed verbatim |
| **siteId** | → `DisposalSite` | |
| grossWeightLb, tareWeightLb, netWeightLb | decimal(12,2) | |
| netWeightTons | decimal(12,4) | |
| **enteredById** | → `User` | The monitor making the ticket at the disposal (ADR-294) |
| deviceId | → `Device` | |
| **enteredAt** | instant | With its offset and `receivedAt` |
| notes | text | |

### 4.3 Forms: records, never a ticket's events (ADR-236)

**Each form has these fields**, as a field event has them:

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | From the phone or the database |
| **projectId** | → `Project` | |
| **source** | enum `RecordSource` | |
| **monitorId** | → `User` | |
| deviceId | → `Device` | |
| assignmentId | → `Assignment` | |
| setupVersion | int | |
| createdById | → `User` | As a field event |
| createdReasonId | → `Reason` | As a field event |
| its time | instant | With the offset and `receivedAt` |
| latitude, longitude | decimal(38,8) | |
| **answers** | JSONB | The firm's own fields |
| **formDefinitionId** | → `FormDefinition` | |
| notes | text | |

**Plus its own:**

#### `Survey`

| Field | Type | Notes |
|---|---|---|
| **workTypeId** | → `SurveyWorkType` | |
| surveyNumber | text | What a stump ticket cites (ADR-198). **Typed as written, never issued by the system**: usually what identifies the property legally (an APN). No series; not unique (*agent default*), since a property's pre-work and post-work surveys carry the same one (ADR-294) |
| roeNumber | text | The number as picked or typed (ADR-292) |
| roeId | → `Roe` | Empty while no ROE on the project has that number. A post-work survey finds its pre-work survey by ROE number (ADR-150) |

#### `Incident`

Records only: never stops work (ADR-052).

| Field | Type | Notes |
|---|---|---|
| **incidentTypeId** | → `IncidentType` | |
| incidentSubTypeId | → `IncidentSubType` | |
| description | text | |
| parties | text | |
| address | text | |

#### `DropOffLog`

No quantity, number, pay item or cost (ADR-184, 188).

| Field | Type | Notes |
|---|---|---|
| **siteId** | → `DisposalSite` | |
| residentName | text | |
| originAddress | text | |

### 4.4 Photos (ARCHITECTURE §11)

#### `Photo`

*Evidence.* The database holds only this; the file is one immutable object in storage, never
overwritten, kept indefinitely (ADR-101). At most 8 a ticket is the phone's rule; fewer than a pay
item requires is a flag.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | From the phone |
| **projectId** | → `Project` | |
| fieldEventId, certificationId, roeId, surveyId, incidentId, dropOffLogId, scaleReceiptId, quarantinedRecordId | → each | **Exactly one owner** (check). `quarantinedRecordId` while its record waits in quarantine; the photo moves to the field event when a reviewer resolves it (ADR-292) |
| view | enum `PhotoView` | A certification's five: `OPERATOR_WITH_PLACARD` · `INTERIOR_OR_BACK` · `RIGHT` · `LEFT` · `FRONT` (ADR-179) |
| **capturedAt** | instant | With its offset |
| latitude, longitude | decimal(38,8) | |
| **originalSha256** | text | Taken at capture |
| **uploadedSha256** | text | |
| **objectKey** | text | |
| depthObjectKey | text | |
| deviceId | → `Device` | |
| uploadedAt | instant | |

### 4.5 Sync (Phase 2 settles the detail; ARCHITECTURE §9)

#### `Sync`

One connection from a phone.

| Field | Type | Notes |
|---|---|---|
| **deviceId** | → `Device` | |
| **startedAt** | instant | |
| **deviceClockAt** | instant | |
| **clockDifferenceSeconds** | int | |
| setupVersionSent | int | |

#### `SyncedRecord`

The idempotency ledger: a retry is answered "already saved" from here and never quarantined (KD-56).

| Field | Type | Notes |
|---|---|---|
| **recordId** | uuid | The phone-made id; the key |
| **recordKind** | *open* | |
| **syncId** | → `Sync` | |
| **answer** | enum `SyncAnswer` | `SAVED` · `QUARANTINED` |

#### `QuarantinedRecord`

A second field event of one kind on one ticket, **kept in full** (ADR-022). A reviewer's renumber
makes it a field event **that keeps the phone-made id**, moves its photos to it and marks this row
resolved; it is never dropped (ADR-292).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | The phone-made id |
| **projectId** | → `Project` | |
| **deviceId** | → `Device` | |
| **monitorId** | → `User` | |
| **payload** | JSONB | The record exactly as sent, for a person to read |
| **reason** | *open* | |
| **holdingEventId** | → `FieldEvent` | The record that holds the number |
| **receivedAt** | instant | |
| resolvedById | → `User` | |
| resolvedAt | instant | |
| resolution | *open* | |

#### `FieldEventEdit`

A phone's edit log for an event reopened before the shift ended; the audit capture writes the
change under the monitor. Its fields are Phase 2's.

#### `SetupManifest`

The numbered lists a phone was sent, kept so a reviewer sees what the phone showed (ADR-240).

| Field | Type | Notes |
|---|---|---|
| **projectId** | → `Project` | |
| **version** | int | |
| **content** | *open* | |
| **builtAt** | instant | |

---

## 5. Derived: the worker's conclusions

#### `CompletedLoad` (`CLT`)

*Derived, built in part.* One per disposal event, for the life of that event (*agent default*: it is
"updated in place, never duplicated", ADR-086).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | |
| **ticketNumber** | text | The load's bare number; unique with the project among live loads |
| **disposalEventId** | → `FieldEvent`, **unique** | A load dumps once (ADR-155; invariant 17) |
| **quantitySource** | enum `QuantitySource` | `LOAD_CALL` · `SCALE_WEIGHT` · `CARRIED_TICKETS` |
| capacityCy | int | The certification's capacity |
| loadCall | int | The call that gave the volume |
| volumeCy | decimal(10,2) | capacity × load call ÷ 100, or the carried stumps' CY summed |
| weightTons | decimal(12,4) | The load's weight: the receipt's net, or **this load's derived share** of a tandem's |
| **weightIsShare** | bool | True when the weight was apportioned, never weighed (ADR-175) |
| carriedCount | int | The items on the tickets it carries |
| dissolvedAt | instant | Set when a correction leaves the ticket no longer whole (its events renumbered away); cleared when it is whole again. Nothing is deleted |
| **createdAt**, **updatedAt** | instant | |

#### `CompletedLoadCollection`

*Derived.* One per collection event of the load: one on an ordinary load, one per property on a
split (ADR-055, 162).

| Field | Type | Notes |
|---|---|---|
| **completedLoadId** | → `CompletedLoad` | |
| **collectionEventId** | → `FieldEvent` | **Unique among live rows**: one collection can't bill twice (invariant 17) |
| **splitSuffix** | text | Empty on an ordinary load |
| **shareFraction** | decimal(9,8) | Its estimate ÷ the sum of the estimates; 1 on an ordinary load |
| volumeCy, weightTons | decimal | Its share; the shares sum exactly to the load's |
| mileage | decimal(10,4) | Road miles from its end GPS, snapped to the nearest road, to the site's own GPS; stored unrounded, compared in tenths (ADR-125, 208) |
| **mileageSource** | enum `MileageSource` | `ROAD_ROUTE` · `STRAIGHT_LINE` (no route found: flagged, ADR-163) |
| snappedLatitude, snappedLongitude | decimal | The road point routed from |
| snappedAddress | text | Its looked-up address |
| mapDataDate | date | The map extract the mileage came from, so a map update never silently changes a billed mileage (ARCHITECTURE §3; ADR-282) |
| mapDataSha256 | text | That extract's hash |
| dissolvedAt | instant | As on `CompletedLoad` |

#### `CompletedHaulOut` (`CHO`)

*Derived.* **The same shape as a completed load** (ADR-295): one per haul-out disposal event, with a
row beside it for each haul-out collection event (`CompletedHaulOutCollection`): one on an ordinary
haul-out, one per pile on a split. A weight-paid haul-out keeps its loading-end call, unbilled
(ADR-227).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | |
| **ticketNumber** | text | The haul-out's bare number; unique with the project among live haul-outs |
| **disposalEventId** | → `FieldEvent`, **unique** | A haul-out dumps once |
| **quantitySource** | enum `QuantitySource` | `LOAD_CALL` · `SCALE_WEIGHT` |
| capacityCy | int | The certification's capacity |
| loadCall | int | The loading end's call; on a split, **the last pile's**: how full it left |
| volumeCy | decimal(10,2) | capacity × load call ÷ 100 |
| weightTons | decimal(12,4) | The receipt's net, or **this haul-out's derived share** of a truck and trailer weighed once |
| **weightIsShare** | bool | True when that weight was apportioned, never weighed: the same mark a load carries (ADR-175, 295) |
| dissolvedAt | instant | As on `CompletedLoad` |
| **createdAt**, **updatedAt** | instant | |

#### `CompletedHaulOutCollection`

*Derived.* One per haul-out collection event: one on an ordinary haul-out, one per pile on a split
(ADR-295).

| Field | Type | Notes |
|---|---|---|
| **completedHaulOutId** | → `CompletedHaulOut` | |
| **collectionEventId** | → `FieldEvent` | **Unique among live rows**: one collection can't bill twice |
| **splitSuffix** | text | Empty on an ordinary haul-out |
| **pileLoadCall** | int | What this pile added: its running call less the call before it (10; then 35 − 10 = 25; then 85 − 35 = 50). The whole call on an ordinary haul-out |
| **shareFraction** | decimal(9,8) | `pileLoadCall` ÷ the haul-out's load call; 1 on an ordinary haul-out |
| volumeCy, weightTons | decimal | Its share: capacity × `pileLoadCall` ÷ 100, and its part of the weight. The shares sum exactly to the haul-out's |
| mileage, mileageSource, snappedLatitude, snappedLongitude, snappedAddress, mapDataDate, mapDataSha256 | | As on `CompletedLoadCollection` |
| dissolvedAt | instant | As on `CompletedLoad` |

**A load's or haul-out's time is its collection's end** (ADR-161), read from the collection event
itself (each property's or pile's own on a split); it isn't copied onto the completed record.

#### `Transaction`

*Derived, built in part.* One priced line; the current truth, regenerated when its ticket changes,
each removed row copied in full to `AuditRecord` first, the delete refused on an invoice-locked
ticket (ADR-085, 090).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | |
| completedLoadId | → `CompletedLoad` | A load's line: the load… |
| completedLoadCollectionId | → `CompletedLoadCollection` | …and the property it prices |
| completedHaulOutId | → `CompletedHaulOut` | A haul-out's line: the haul-out… |
| completedHaulOutCollectionId | → `CompletedHaulOutCollection` | …and the pile it prices (ADR-295) |
| fieldEventId | → `FieldEvent` | A unit rate ticket's line. **Exactly one of the three** (check) |
| **slot** | int | The rule action's #; unique with its ticket (and property or pile) |
| **ruleId** | → `Rule` | The rule that made it |
| **payItemId** | → `PayItem` | The pay item it pays |
| **contractId** | → `Contract` | The rule's contract: only *Add transaction* makes a line, and its rule names one (ADR-239, 292) |
| **primeId** | → `Contractor` | Whose rate (ADR-081, 212) |
| operatingSubId | → `Contractor` | Who did the work |
| **unit** | enum `BillingUnit` | The pay item's, as it was |
| **quantity**, **rate** | decimal(14,4) | |
| **amount** | decimal(14,2) | amount = quantity × rate; a $0 line where the prime has no rate, or the pay item none |
| reconciliationRunId | → `ReconciliationRun` | |
| **createdAt** | instant | |

#### `Flag`

*Derived.* Every problem, as a plain message (`spec/FLAGS.md` is the catalogue).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | |
| workflow | enum `Workflow` | The ticket it's on |
| ticketNumber | text | |
| fieldEventId, certificationId, disposalSiteId, surveyId | → each | The record it's about, where it's about one |
| **code** | enum `FlagCode` | `spec/FLAGS.md` §3 |
| **message** | text | "Ticket 101008: debris type mismatch (collection Vegetative, disposal C&D). Flagged for review." |
| **facts** | JSONB | The inputs it was raised on, written and compared by the worker alone, so "have the facts changed?" can be answered (ADR-166) |
| **factsSha256** | text | Their hash |
| **billing** | enum `FlagBilling` | What the flag does to the money, as `spec/FLAGS.md` §1's three outcomes: `BILLS` (the ticket bills as if the flag weren't there) · `LINE_NOT_BILLED` (one line bills nothing; the ticket's other lines bill) · `NOT_BILLED` (nothing can be computed). ADR-294 |
| slot | int | The transaction # the flag is about, where it is about one line |
| payItemId | → `PayItem` | That line's pay item; kept because the line itself may not exist (a per-ton pay item on a load with no weight) |
| **raisedAt** | instant | |
| clearedAt | instant | Cleared when the facts no longer raise it; never deleted |
| reconciliationRunId | → `ReconciliationRun` | |

#### `ReconciliationRun`

*Derived.* One run of the worker.

| Field | Type | Notes |
|---|---|---|
| **projectId** | → `Project` | |
| **trigger** | enum `ReconciliationTrigger` | `SYNC` · `CORRECTION` · `SETUP_CHANGE` · `REPROCESS` |
| requestedById | → `User` | |
| **startedAt** | instant | |
| finishedAt | instant | |
| ticketsDone, ticketsFailed | int | |

#### `ReconciliationDecision`

*Derived.* What a run decided for one ticket and why (ARCHITECTURE §13).

| Field | Type | Notes |
|---|---|---|
| **reconciliationRunId** | → `ReconciliationRun` | |
| **workflow** | enum `Workflow` | |
| **ticketNumber** | text | |
| **status** | enum `TicketStatus` | |
| **summary** | JSONB | For a person: the events grouped, the rules that passed |
| error | text | |

---

## 6. Marks: what people set, without changing the record (ADR-245)

#### `QcMark`

Set only by people; never on a load's or haul-out's single event (ADR-107, 168). No row = QC Review.
A certification's "checked by" is its mark's `setById` (ADR-080).

| Field | Type | Notes |
|---|---|---|
| completedLoadId, completedHaulOutId, fieldEventId, certificationId, roeId, surveyId, incidentId, dropOffLogId | → each | **Exactly one target**, unique; `fieldEventId` is for a unit rate ticket |
| **status** | enum `QcStatus` | `QC_REVIEW` · `QC_APPROVED` · `QC_ISSUES` · `QC_VOID` |
| **setById** | → `User` | |
| **setAt** | instant | |
| note | text | |

#### `InvoiceLock`

*Built in part.* Only on a QC Approved record (ADR-121). An unlock keeps the row and is audited;
locking again is a new row (C17).

| Field | Type | Notes |
|---|---|---|
| completedLoadId, completedHaulOutId, fieldEventId | → each | **One target**, unique among live locks |
| invoiceBatchId | → `InvoiceBatch` | |
| **lockedById** | → `User` | |
| **lockedAt** | instant | |
| unlockedById | → `User` | |
| unlockedAt | instant | |
| unlockNote | text | |

#### `InvoiceBatch`

A name and its tickets; no amounts (ADR-228).

| Field | Type | Notes |
|---|---|---|
| **projectId** | → `Project` | |
| **name** | text | "Bayline ROW, week of 12 Oct" |
| createdById | → `User` | |
| createdAt | instant | |

#### `FlagAcceptance`

The flag stays in the history and isn't raised again unless its facts change (ADR-166).

| Field | Type | Notes |
|---|---|---|
| **flagId** | → `Flag`, unique | |
| **reasonId** | → `Reason` | |
| note | text | |
| **acceptedById** | → `User` | |
| **acceptedAt** | instant | |

#### `TicketVoid`

A person's void (C19): the worker reads it and sets `VOID`. An unvoid lifts it, audited. A rule's
void is the worker's own: its reason is the rule, on the run's decision; it wins on every reprocess
(ADR-167).

| Field | Type | Notes |
|---|---|---|
| **projectId** | → `Project` | |
| **workflow** | enum `Workflow` | |
| **ticketNumber** | text | |
| **reasonId** | → `Reason` | |
| note | text | |
| **voidedById** | → `User` | |
| **voidedAt** | instant | |
| liftedById | → `User` | |
| liftedAt | instant | |
| liftNote | text | |

#### `ApprovedDay`

In §3, with the time clock.

---

## 7. Audit

#### `AuditRecord`

*Audit, built.* Written by database triggers alone, one per insert and update on every table above,
and one per removed `Transaction`; never updated or deleted by anyone (ADR-085, 097). A secret
column is named on its table's trigger and kept out (ADR-281). Sign-ins, lockouts, device enrolment
and master-passcode uses are security events in the same log (Phase 2, REQ-202b).

| Field | Type | Notes |
|---|---|---|
| **id** | bigint | Numbered by the database |
| **occurredAt** | instant | |
| **tableName** | text | |
| **recordId** | text | |
| **operation** | enum | `INSERT` · `UPDATE` · `DELETE` |
| priorValue, newValue | JSON | |
| **changedFields** | text[] | |
| actorId | → `User` | |
| deviceId | → `Device` | |
| **source** | enum | `DEVICE` · `BACK_OFFICE` · `SYSTEM` |
| reason | text | |
| requestId | text | |
| **domain** | enum | `SECURITY` · `BILLING` · `OPERATIONS` · `RECORDS` |

---

## 8. What the database refuses by itself

Never relaxed to pass a test (ARCHITECTURE §5.4). ✅ = built today.

| The rule | How |
|---|---|
| One field event per project + workflow + bare number + split suffix + kind | ✅ unique key |
| A kind fits its workflow; a load call is 0–100 and only on `DIS` and `HOC` | ✅ checks |
| Every kind-specific column is empty on the other kinds; a split load's collection has its suffix and estimate both, or neither; a haul-out collection may carry a suffix, with its load call (ADR-295) | checks |
| A phone's record carries its device, assignment and setup version; a back-office one its person and reason | check |
| One disposal per completed load or haul-out; one live completed record per collection event | unique keys (the second partial: `WHERE dissolved_at IS NULL`, in a guard migration) |
| A cert number once per project; a receipt number once per project; an ROE number once per project | unique keys |
| A pay item's code once per project (ADR-301) | ✅ unique key |
| A list value with a key (a built-in value) is never archived; a key appears once in its list (ADR-194, 302) | ✅ a check and a unique key on every list |
| Only a release writes a list value's key: no other login adds a row with one, or gives, changes or removes one (ADR-302) | ✅ a trigger on every list |
| A rule that is an exact copy of another (same form, contract, criteria and actions, whatever its name) | the API at setup, before it is saved (ADR-301) |
| A transaction # once per ticket (and property or pile) | unique key |
| A crew certification has no capacity and no boxes; a container has both | check |
| A project's time zone is an IANA name; no time without its zone | ✅ checks, a test |
| A project's active window never ends before it starts; its load-call limits are empty or 0–100; its stump fill depth and site circle are at least 1; its ticket types are never missing (ADR-303) | ✅ checks |
| A kind of unit rate work is on a project once | ✅ unique key |
| A contractor has one place on a project, so a sub is never shared by two primes (ADR-108) | ✅ unique key |
| The prime a sub names, and a contract's prime, is one of that project's primes; a prime that a sub or a contract names can't be made a sub (ADR-108, 146, 305) | ✅ two-column foreign keys to the prime's row |
| A sub names its prime and a prime names none; a prime's row, and only a prime's, carries its own contractor as `asPrimeId`; a merged contractor is merged into another record and is archived (ADR-305) | ✅ checks |
| The Monitor ID is issued, well-formed, unique; the system actor is one fixed row and never a person | ✅ |
| An assignment's site, a field event's site and an assignment's pay items are their own project's | two-column foreign keys (✅ for the first and third) |
| Number blocks of one series never overlap | an exclusion constraint (needs `btree_gist`: its own ADR, C43) |
| Size bands of one payable type never overlap | the API at setup (ADR-217); the worker flags what slips through |
| Nothing is deleted; audit is append-only; every write states its actor; a transaction's delete is copied first and refused when locked; viewers see only their own projects | ✅ the guard migrations (ADR-270…276) |

---

## 9. The closed sets (Postgres enums)

A new value in any of them is a code change with an ADR (`spec/LISTS.md` Group 2). ✅ = built today.

| Enum | Values | Used by |
|---|---|---|
| `Workflow` ✅ | `LOAD` · `HAUL_OUT` · `UNIT_RATE` | `FieldEvent`, `Project.workflows`, `Flag`, `TicketVoid` |
| `FieldEventKind` ✅ | `COLLECTION` · `DISPOSAL` · `HAUL_OUT_COLLECTION` · `HAUL_OUT_DISPOSAL` · `UNIT_RATE` | `FieldEvent`, `Assignment` |
| `TicketStatus` ✅ | `PENDING` · `COMPLETED` · `MANUAL_REVIEW` · `VOID` | `FieldEvent`, `ReconciliationDecision` |
| `UserRole` ✅ | `ADMIN` · `MANAGER_ANALYST` · `MONITOR` · `READ_ONLY_VIEWER` · `SYSTEM` | `User` |
| `DeviceStatus` ✅ | `ACTIVE` · `LOST` · `RETIRED` | `Device` |
| `NumberSeries` ✅ | `LOAD` · `HAUL_OUT` · `UNIT_RATE` · `CERTIFICATION`, and `ROE` (new in Phase 1) | `ProjectNumberSeries`, `ControlRange`, `NumberBlock` |
| `NumberBlockStatus` ✅ | `ISSUED` · `RECLAIMED` · `RETIRED` | `NumberBlock` |
| `AssignmentOrigin` ✅ | `PLANNED` · `UNPLANNED` | `Assignment` |
| The audit's three ✅ | operation `INSERT` · `UPDATE` · `DELETE`; source `DEVICE` · `BACK_OFFICE` · `SYSTEM`; domain `SECURITY` · `BILLING` · `OPERATIONS` · `RECORDS` | `AuditRecord` |
| `ContractorKind` ✅ | `HAULER` · `MONITORING` · `CREW` · `OTHER` | `Contractor` |
| `ContractorPosition` ✅ | `PRIME` · `SUB_TIER_1` · `SUB_TIER_2` | `ProjectContractor` |
| `ViewerKind` | `CLIENT` · `CONTRACTOR` · `AUDITOR` | `User` |
| `Permission` | `CORRECT` · `RENUMBER` · `VOID` · `ACCEPT_FLAG` · `QC` · `LOCK_INVOICED` · `UNLOCK_INVOICED` · `APPROVE_HOURS` · `SETUP` · `DISPATCH` | `UserPermission` |
| `ReasonUse` ✅ | `VOID` · `TYPED_NUMBER` · `ACCEPT_FLAG` · `BACK_OFFICE_RECORD` | `Reason` |
| `FormDocumentType` | `LOAD` · `HAUL_OUT` · `UNIT_RATE` · `CERTIFICATION` · `ROE` · `SURVEY` · `INCIDENT` · `DROP_OFF_LOG` | `Form`, `Assignment` |
| `BillingUnit` | `CY` · `TN` · `EA` · `LB` · `HR` · `CREW_DAY` · `TBN` | `PayItem`, `Transaction` |
| `CrewTimeConversion` | `PER_HOUR` · `PER_DAY_EXACT` · `PER_DAY_STEPS` | `PayItem` |
| `CountShape` ✅ | `NUMBER` · `ITEM_COUNTS` · `ITEM_HOURS` | `KindOfWork` |
| `CertificationKind` ✅ | `CONTAINER` · `CREW` | `Certification`, `VehicleType.certifies` (ADR-302) |
| `BoxShape` | `RECTANGLE` · `TRIANGLE` · `TWO_LENGTH_HOIST` · `ROUND_BOTTOM` · `RADIUS_CORNER` | `CertificationBox` |
| `BoxSign` | `ADD` · `SUBTRACT` | `CertificationBox` |
| `RecordSource` | `DEVICE` · `BACK_OFFICE` | `FieldEvent`, `Roe`, the forms |
| `MeasuredAs` | `CIRCUMFERENCE` · `DIAMETER` | `FieldEvent` |
| `AddressSource` | `LOOKED_UP` · `TYPED` | `FieldEvent` |
| `TicketNumberSource` ✅ | `CONTROL` · `GENERATED` | `Project` |
| `QuantitySource` | `LOAD_CALL` · `SCALE_WEIGHT` · `CARRIED_TICKETS` | `CompletedLoad`, `CompletedHaulOut` |
| `MileageSource` | `ROAD_ROUTE` · `STRAIGHT_LINE` | `CompletedLoadCollection`, `CompletedHaulOutCollection` |
| `MapSource` | `UPLOAD` · `ESRI_LAYER` · `DRAWN` | `MapVersion` |
| `QcStatus` | `QC_REVIEW` · `QC_APPROVED` · `QC_ISSUES` · `QC_VOID` | `QcMark` |
| `SiteAreaSource` | `DRAWN` · `UPLOAD` | `SiteAreaVersion` |
| `ClockEntryKind` | `IN` · `BREAK_START` · `BREAK_END` · `OUT` | `ClockEntry` |
| `PhotoView` | `OPERATOR_WITH_PLACARD` · `INTERIOR_OR_BACK` · `RIGHT` · `LEFT` · `FRONT` | `Photo` |
| `SyncAnswer` | `SAVED` · `QUARANTINED` | `SyncedRecord` |
| `ReconciliationTrigger` | `SYNC` · `CORRECTION` · `SETUP_CHANGE` · `REPROCESS` | `ReconciliationRun` |
| `FlagBilling` | `BILLS` · `LINE_NOT_BILLED` · `NOT_BILLED` | `Flag` |
| `FlagCode` | The codes of `spec/FLAGS.md` §3 | `Flag` |
| `RuleActionKind` | `ADD_TRANSACTION` · `REMOVE_TRANSACTION` · `VOID_TICKET` | `RuleAction` |
| `QuantityFrom` | `ALL_ITEMS` · `CHOSEN_ITEMS` | `RuleAction` |
| `RuleOperator` | `spec/RULES.md` §4a: `EQUALS` · `NOT_EQUALS` · `IS_ONE_OF` · `IS_NOT_ONE_OF` · `BETWEEN` · `AT_LEAST` · `AT_MOST` · `MORE_THAN` · `LESS_THAN` · `ON` · `NOT_ON` · `ON_OR_BEFORE` · `ON_OR_AFTER` · `CONTAINS` · `STARTS_WITH` · `IS_EMPTY` · `IS_NOT_EMPTY` | `RuleCriterion` |
| `RuleCriterionKey` | `spec/RULES.md` §4: `TICKET_DATE` · `CONTRACTOR` · `DEBRIS_TYPE` · `FIELD_TAG` · `WEIGHT` · `VOLUME` · `COLLECTION_ADDRESS` · `ZONE` · `DISPOSAL_SITE` · `FROM_SITE` · `DISPOSAL_SITE_TYPE` · `MILEAGE` · `PAY_ITEM` · `UNIT_COUNT` · `MEASUREMENT` · `ITEM` | `RuleCriterion` |

---

## 10. From today's schema to this page

| Model today | Phase 1 change |
|---|---|
| `Project` | ✅ built 2026-10-02 (ADR-303): its client, declaration event, program type, window, number source and settings (§3), with `Client`, `DeclarationEvent` and `ProjectKindOfWork` |
| `Contractor` | ✅ built 2026-10-02 (ADR-305, 306): its kind, contact and merge link, with `ProjectContractor` and `Contract` |
| `User` | Gains viewer kind, contact, permissions and viewer projects; sign-in's columns in Phase 2 |
| `Device`, `MasterPasscode`, `NumberBlock` | As built; a key's revocation; the overlap refusal |
| `DisposalSite` | Gains its type, facts, permit, GPS, dates, labels, area versions, tipping fee link |
| `Assignment` | Gains `formDocumentTypes`; its pay items are built (ADR-286) |
| `PayItem` (code and description only, the code unique on its project, ADR-301) | Gains every other field of §3, its rates and steps |
| `FieldEvent` | Gains the shared and kind-specific columns of §4.1; `deviceId`, `assignmentId`, `setupVersion` become optional for a back-office-created record |
| `CompletedLoad` | Its one collection link moves to `CompletedLoadCollection`; gains its quantity and `dissolvedAt` |
| `Transaction` | Gains its rule, pay item, contract, operating sub, unit, property and the two other ticket links; the delete guard follows the lock through them |
| `InvoiceLock` | Gains the unlock columns, the batch and the two other targets |
| `AuditRecord` | As built |
| The firm's eighteen lists (§2.3) | ✅ built 2026-10-02 as this page has them (ADR-302) |
| *New* | Everything else on this page, in `BACKLOG.md`'s Phase 1 order; each table guarded in one line (ADR-271) |

---

## 11. Exports: the column names (ADR-164, 234)

Every export is one row per thing, the columns below in this order, named with the field's own
words in snake_case so a column means the same everywhere. Times are ISO 8601 with the project's
offset; a list value exports its **name**; codes and rates appear only in back-office exports, never
on a phone. The firm's added fields follow as `answer_<label>` columns (ADR-278).

| Export | One row per |
|---|---|
| **Loads** | a completed load's property (one row on an ordinary load, one per split property) |
| **Haul-outs** | a completed haul-out's pile (one row on an ordinary haul-out, one per pile on a split) |
| **Unit rate tickets** | a unit rate event |
| **Transactions** (the ledger) | a transaction |
| **Field events** (the evidence, as captured) | a field event |
| **Certifications** | a certification |
| **ROEs** | an ROE |
| **Surveys** | a survey |
| **Incidents** | an incident |
| **Drop-off logs** | a drop-off log |
| **Flags** | a flag |
| **Hours** | a person's day |
| **Audit log** | an audit record |

**Loads**

```text
project, ticket_number, split_suffix, status, qc_status, invoice_batch, locked_at, load_date,
prime, operating_sub, cert_number, capacity_cy, driver_name, debris_type, disposal_debris_type,
field_tag, roe_number,
collection_monitor_id, collection_started_at, collection_ended_at, collection_address,
collection_latitude, collection_longitude, zone, estimate_cy, share_fraction,
disposal_site, disposal_site_type, disposal_monitor_id, disposal_started_at, disposal_ended_at,
disposal_latitude, disposal_longitude,
quantity_source, load_call, volume_cy, scale_receipt_number, weight_tons, weight_is_share,
carried_count, mileage, mileage_source, map_data_date, open_flags, amount
```

**Haul-outs**

```text
project, ticket_number, split_suffix, status, qc_status, invoice_batch, locked_at, haul_out_date,
prime, operating_sub, cert_number, capacity_cy, debris_type, disposal_debris_type, reduced,
reduction_method, field_tag,
from_site, collection_monitor_id, collection_started_at, collection_ended_at,
disposal_site, disposal_site_type, disposal_monitor_id, disposal_started_at, disposal_ended_at,
quantity_source, load_call, pile_load_call, share_fraction, volume_cy, scale_receipt_number,
weight_tons, weight_is_share,
mileage, mileage_source, map_data_date, open_flags, amount
```

**Unit rate tickets**

```text
project, ticket_number, status, qc_status, invoice_batch, locked_at, work_date,
prime, operating_sub, cert_number, crew_type,
kind_of_work, payable_type, pay_item_code, pay_item_description,
printed_pay_item_code,
unit_count, measurement_in, measured_as, diameter_in, root_ball_in, root_ball_half_exposed,
fill_cy, survey_number, marked_ineligible, items, field_tag, roe_number,
monitor_id, started_at, ended_at, address, latitude, longitude, zone, open_flags, amount
```

**Transactions** (the ledger)

```text
project, workflow, ticket_number, split_suffix, transaction_number,
pay_item_code, pay_item_description, payable_type, unit, quantity, rate, amount,
contract, prime, operating_sub, rule, ticket_date, status, qc_status, invoice_batch, locked_at
```

**Field events** (the evidence, as captured)

```text
project, workflow, kind, ticket_number, split_suffix, status, source,
monitor_id, monitor_name, device, assignment_origin, setup_version, temporary_session,
cert_number, cert_keyed_by_hand, site,
started_at, ended_at, device_utc_offset, received_at,
start_latitude, start_longitude, end_latitude, end_longitude, address,
number_typed, number_typed_reason,
plus the kind's own columns,
photo_count, notes
```

**Certifications**

```text
project, cert_number, kind, qc_status, checked_by, signatures_on_file,
prime, first_tier_sub, second_tier_sub, vehicle_type, crew_type, capacity_cy, boxes,
driver_name, tag_number, tag_state, tag_expiry, certified_at, certified_by, helpers,
replaces, replaced_by, copied_from, revoked_from, revoked_reason, photo_count, notes
```

**ROEs**

```text
project, roe_number, qc_status, parcel_id, address, owner_name, signed, signed_date,
latitude, longitude, made_by, made_at, scope,
the firm's fields
```

**Surveys**

```text
project, work_type, survey_number, roe_number, qc_status, monitor_id, made_at,
latitude, longitude,
the firm's fields
```

**Incidents**

```text
project, incident_type, incident_sub_type, qc_status, description, parties, address,
monitor_id, made_at, latitude, longitude,
the firm's fields
```

**Drop-off logs**

```text
project, site, qc_status, resident_name, origin_address, monitor_id, made_at,
latitude, longitude, photo_count, notes,
the firm's fields
```

**Flags**

```text
project, workflow, ticket_number, code, message, billing, transaction_number, pay_item_code,
raised_at, cleared_at,
accepted_by, accepted_at, accept_reason
```

**Hours**

```text
project, work_date, person, monitor_id, employer, clock_in, break_start, break_end, clock_out,
hours, activity_lines, approved_by, approved_at
```

**Audit log**

```text
occurred_at, domain, table, record, operation, changed_fields, prior_value, new_value,
actor, device, source, reason
```

A read-only viewer's export is the same, less what they may not see: no personal phone or licence
numbers for anyone, only its own tickets and transactions for a contractor, nobody's hours
(ADR-169, 241).

---

## 12. The agent defaults on this page (approved with it, ADR-289)

Each is a shape nothing settled before; none changes money, evidence or what a monitor does. The
user approved the page on 2026-10-01 without changing one, so all sixteen stand.

| # | Default | Why this one |
|---|---|---|
| 1 | **One table per list** (§2.3), not one shared list table | A picked value is then a real foreign key the database checks, and each list's setting is a typed column |
| 2 | **No ticket table.** A ticket is its number and its events; each event carries the ticket's status | It is ADR-236's own definition; a ticket row would outlive a renumber as an empty shell that can't be deleted |
| 3 | **A completed load is tied to its disposal event for life**, with one row per collection event beside it; a correction that un-pairs it sets `dissolvedAt` instead of deleting | Nothing is deleted, QC marks and locks keep their target, and a split is one load with a row per property (C16) |
| 4 | **The zone and map version sit on the field event** (worker-written columns); **mileage sits on the completed record's collection row**, with the map data's date and hash | ARCHITECTURE §3 puts the zone on the ticket's reconciliation fields; mileage needs both ends |
| 5 | **A person's void is its own record, `TicketVoid`**, keyed to project + workflow + number | The status column is the worker's; a void must survive a reprocess and be liftable (C19) |
| 6 | **QC status lives only in `QcMark`**, for every kind of record | One place to look; the API never touches a derived row (ADR-245) |
| 7 | **An unlock keeps the lock's row** (who unlocked, when, why); locking again makes a new one | An `InvoiceLock` can't be deleted (C17) |
| 8 | **A flag keeps the facts it was raised on as JSON and their hash**, written and compared only by the worker | "Have the facts changed?" must be answerable (ADR-166); nothing else reads it |
| 9 | **Sub-contractors are `Contractor` records placed on a project** (`ProjectContractor`: prime, tier 1, tier 2, under one prime), and a certification names up to one of each tier | The paper form has both tiers; "subs are never shared by primes" becomes a unique key |
| 10 | **A field event points at the form's own debris type entry**, not the firm's library value | A rule matches "only the exact entry" (ADR-226), and *Reduced* is the entry's |
| 11 | **Rule criteria values are typed columns and pick rows**, never JSON | The engine reads them (ADR-278) |
| 12 | **The driver is not copied onto field events**; a ticket shows and exports its certification's driver | One identity snapshot is the cert number (ADR-017); a second copy can drift |
| 13 | **ROE numbers get their own series** (`ROE`) for phone blocks; a typed paper number is kept as typed | ADR-181 says "from the phone's block"; a fifth series keeps ROE numbers out of the ticket series (C43) |
| 14 | **The permissions list** (§2.2) | Part 02's list, plus setup, dispatch and hours approval |
| 15 | **A site's `shortCode`** | So setup can suggest `TIP-FEE-CY-BCL` (CONVENTIONS §5) |
| 16 | **Export column names** (§11) | The field's own word, snake_case, the same in every export |

**Added after the approval, at the user's word; the details are an agent default to overturn:**

| # | Default | Why this one |
|---|---|---|
| 17 | **An ROE's scope is rows picked from the project's own setup** (`RoeScopeItem`): the load form's debris types and the unit rate pay items' payable types. No row means no scope check; a count is recorded, never checked | The user's direction (ADR-293): "selecting from what they've already added to the project". Real columns, so the flag can read them (ADR-278); a payable type because that is what a unit rate ticket records |
| 18 | **A certification's helpers are rows** (`CertificationHelper`), so none, one or several | The user: "a help (selected by ID based on who is on project assigned with them or blank)" (ADR-294); the paper form has room for more than one ID |
| 19 | **A flag names the line it is about** (`slot`, `payItemId`) beside its three-way `billing` | A ticket with several lines must show which one doesn't bill (ADR-294) |
| 20 | **A survey number is not unique** | It names the property, and a property has a pre-work and a post-work survey (ADR-294) |
| 21 | **A completed haul-out has a completed load's shape**: tied to its disposal event, a row per collection event (per pile on a split), mileage on that row. **A pile is told from another by its debris type and its field tag** | The user: haul-outs "follow that same format" (ADR-295). The field tag is the firm's own project list, so piles need no new list |
| 22 | **A prime's row on `ProjectContractor` carries its own contractor again as `asPrimeId`**, unique with the project, and "the prime" everywhere is a two-column foreign key to it (ADR-305) | The database then refuses a sub under a sub, a sub shared or borrowed from another project, and a contract whose prime isn't one of the project's primes, with no trigger and no hand-written rule; the tables that name a prime need no extra column |

**Carried items this page answers:**

| Item | What the page settles |
|---|---|
| C16 | A split's collections; `CompletedHaulOut`; the transaction's pay item, rule, contract and operating sub |
| C17 | The unlock |
| C18 | A contractor viewer follows `Transaction.primeId` and the certification's prime |
| C19 | A person's void |
| C29 | Times the database stamps stay its own; a story asserts order, not those times |
| C36 | The firm's added fields |
| C42 | The assignment's pay items and forms; the real `DisposalSite`; a contractor's kind |
| C43 | The series, control ranges, the ROE series; the overlap refusal still needs its ADR |
| C44 | Back-office-created events |

**Not on this page:** a rate history table (the audit log is the only history, ADR-090); an invoice
record (there is none, ADR-061); a driver list, a crew list, a tandem, an expected destination, work
orders (ADR-153, 228, 038, 205).
