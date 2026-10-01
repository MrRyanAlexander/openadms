# Open ADMS — The data model

⚠️ **Draft, for the user's approval** *(BACKLOG 0.2b.2; ADR-284)*

← [Index](INDEX.md)

> **What this page is.** The schema on paper: every record Open ADMS keeps, its fields, who may
> write it, what the database itself refuses, and the columns each export carries. Phase 1's Prisma
> schema is written from it (ADR-140, 164). **It decides names and shapes, never rules**: what a
> record *means* stays with the newest ADR, `agent_store/SUMMARY.md` and the skills
> (`adms-data-model` is the model in prose; `adms-ticket-workflows` §4.0 and §4.2–§4.6 say what each
> record holds; `adms-certifications` §3A.2–§3A.3 the certification). Names follow
> `spec/CONVENTIONS.md` §3; examples come from its example world (`spec/golden/MISSION.md`).
>
> **How to read a table.** *Field* is the Prisma name (camelCase; its column is the snake_case of
> it). **Bold** = required. `→ Model` is a foreign key. *Agent default* marks a shape nothing settled
> before this page; each is listed in §12 for you to overturn. A field's rule is cited by its ADR.
>
> **What exists today.** Thirteen provisional models are built (ADR-268, 281), plus the pay item's
> first shape (ADR-286). §10 says, model by model, what Phase 1 changes.

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

**`Client`** (configuration): the jurisdiction paying. Reused across disasters (ADR-023).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **name** | text | "Bayline County" |
| contactName, contactEmail, contactPhone | text | Edited freely, audited |
| notes | text | |
| **createdAt**, archivedAt | instant | |

**`DeclarationEvent`** (configuration): the disaster and its reference; shared by every client's
projects under it (ADR-023, 026). Always "declaration event", never a bare "event".

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **name** | text | "Hurricane Delphine" |
| **reference** | text | `DR-9001-FL`, or a state, local or internal reference |
| **referenceTypeId** | → `DeclarationReferenceType` | The firm's list |
| **createdAt**, archivedAt | instant | |

**`Contractor`** (configuration, built): a hauling company, or an employer of monitors (Q-97).

| Field | Type | Notes |
|---|---|---|
| **id**, **name** | uuid, text | |
| **kind** | enum `ContractorKind` | `HAULER` · `MONITORING` · `CREW` · `OTHER` (Q-97, `FROM-BUILD-1.md`) |
| mergedIntoId | → `Contractor` | A sub typed twice at certification, merged by the back office, audited (ADR-108); the merged row is archived, never deleted |
| **createdAt**, archivedAt | instant | |

**`ProjectContractor`** (configuration): a contractor's place on one project. A project may have
several primes; a sub belongs to one prime, at most two tiers, never shared (ADR-108).

| Field | Type | Notes |
|---|---|---|
| **id**, **projectId**, **contractorId** | uuid, → `Project`, → `Contractor` | Unique together: a contractor has one place on a project |
| **position** | enum `ContractorPosition` | `PRIME` · `SUB_TIER_1` · `SUB_TIER_2` |
| primeId | → `Contractor` | The prime it works under; required for a sub, empty for a prime (check) |
| **createdAt**, archivedAt | instant | A sub's row is made when it's typed in at certification |

### 2.2 People, phones and the master passcode (built, ADR-281)

**`User`** (configuration): a person with a login; firm-wide, not project-scoped (ADR-050).

| Field | Type | Notes |
|---|---|---|
| **id**, **name** | uuid, text | |
| **role** | enum `UserRole` | `ADMIN` · `MANAGER_ANALYST` · `MONITOR` · `READ_ONLY_VIEWER` · `SYSTEM` (the worker's one actor, never a login, ADR-273) |
| monitorNumber | text, unique | The Monitor ID (`M004127`), issued by the database; every monitor has one (ADR-281) |
| employerId, employerNumber | → `Contractor`, text | Who employs them when it isn't the firm, and that employer's own ID for them (`HS-0417`) |
| contractorId | → `Contractor` | A contractor user's contractor: what they may see (ADR-169) |
| viewerKind | enum `ViewerKind` | `CLIENT` · `CONTRACTOR` · `AUDITOR`, on a read-only viewer only |
| email, phone | text | A monitor's phone is shown to admins only (ADR-169) |
| **createdAt**, archivedAt | instant | |
| *Phase 2:* passwordHash, twoStepSecret, lockedUntil… | | Sign-in's columns, each kept out of the audit log like the master passcode's hash (C21) |

**`UserPermission`** (configuration): what a manager/analyst is granted (ADR-050).
`userId` + `permission` (enum `Permission`: `CORRECT` · `RENUMBER` · `VOID` · `ACCEPT_FLAG` · `QC` ·
`LOCK_INVOICED` · `UNLOCK_INVOICED` · `APPROVE_HOURS` · `SETUP` · `DISPATCH`), unique together.
*Agent default:* the list is part 02's, with setup, dispatch and hours added because those pages
give them to "a manager/analyst with permission"; an admin needs none.

**`ViewerProject`** (configuration): the projects a read-only viewer may see: `userId` +
`projectId`, unique together. Row-level security reads it (ADR-169).

**`Device`**, **`MasterPasscode`**, **`NumberBlock`**: as built (ADR-281). `Device` gains
`keyRevokedAt` (its key refused once a lost or retired phone is wiped, C47). `MasterPasscode` is a
version and its slow hash, never edited, read only by the API.

**`Assignment`** (configuration, built): one person's work for a day (ADR-240).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | An unplanned one's comes from the phone |
| **personId**, **workDate**, **projectId** | → `User`, date, → `Project` | |
| **fieldEventKinds** | `FieldEventKind[]` | The kinds of field event they may record |
| **certifying** | bool | |
| **formDocumentTypes** | `FormDocumentType[]` | The forms they may make: ROEs, surveys, incidents, drop-off logs (C42) |
| siteId | → `DisposalSite` (same project) | One site, where the work is at one |
| deviceId | → `Device` | Named on the board, or the phone that took it |
| **origin**, madeById | enum, → `User` | `PLANNED` (with its author) or `UNPLANNED` (no author, always its phone) |
| **createdAt**, archivedAt | instant | Withdrawn by archiving; never expires |

**`AssignmentPayItem`** (configuration, built by ADR-286): the unit rate pay items a person does
that day (ADR-127, 240): `assignmentId` + `payItemId`, both of the assignment's own project,
`archivedAt` to take one off.

### 2.3 The firm's lists

One table per list (*agent default*; `spec/LISTS.md`'s build note leaves the storage to an ADR when
the first is built, and this is the proposal). Every list table has the same six columns, plus the
settings its values carry:

| Column | Type | Notes |
|---|---|---|
| **id** | uuid | |
| key | text, unique | Set only on a **built-in value** (`STUMPS`); code tests it, never the name; a built-in value is never archived (ADR-194) |
| **name** | text | What people pick; renamed freely, audited |
| **position** | int | The order shown |
| **createdAt**, archivedAt | instant | |

| Model | Its own columns | Built-in keys |
|---|---|---|
| `ProgramType` | **requiresRoe** bool | |
| `DeclarationReferenceType` | | |
| `DebrisType` | | |
| `ReductionMethod` | | |
| `PayableType` | | |
| `KindOfWork` | **countShape** enum (`NUMBER` · `ITEM_COUNTS` · `ITEM_HOURS`) | `STUMPS` (ADR-198) |
| `ItemName` | **kindOfWorkId** | |
| `VehicleType` | **certifies** enum (`CONTAINER` · `CREW`) | |
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

**`Project`** (built in part): the hub.

| Field | Type | Notes |
|---|---|---|
| **id**, **name** | uuid, text | "Bayline County ROW, Hurricane Delphine" |
| **clientId**, **declarationEventId** | → `Client`, → `DeclarationEvent` | |
| **programTypeId** | → `ProgramType` | Its *requires ROE* drives the ROE checks (ADR-149) |
| **allowSplitLoads** | bool | Ticked for a new project where the program type requires ROEs (ADR-137) |
| **timeZone** | text | An IANA name, checked by the database (ADR-281) |
| **activeFrom**, activeTo | date | The active window, judged by a load's time (ADR-161) |
| **ticketNumberSource** | enum | `CONTROL` · `GENERATED` (ADR-056) |
| **workflows** | `Workflow[]` | The ticket types it allows (ADR-041) |
| loadCallLowLimit, loadCallHighLimit | int | Flag at or under 5, at or over 95; empty = off; the defaults come from `.env` (ADR-164) |
| **stumpFillDepthInches** | int | Default 31 (ADR-203) |
| **stumpCheckRootBallWider**, **stumpCheckFillNeedsExposure** | bool | The two built-in stump checks, on by default (ADR-203) |
| **siteCircleMeters** | int | Default 200 (`DISPOSAL_SITE_PROXIMITY_M`), ADR-142 |
| **timeClockEnabled** | bool | ADR-241 |
| **createdAt**, closedAt | instant | |

**`ProjectKindOfWork`**: `projectId` + `kindOfWorkId`: the kinds of unit rate work it allows
(ADR-127).

**`Contract`**: **id**, **projectId**, **name** ("Coastline, Bayline ROW 2026"), **primeId** →
`Contractor`, signedCopyUrl, archivedAt. Nothing else: no number, dates or amount (ADR-146).

**`Form`**: a project's form for one document type (ADR-211).

| Field | Type | Notes |
|---|---|---|
| **id**, **projectId**, **name** | | Unique on project + document type |
| **documentType** | enum `FormDocumentType` | `LOAD` · `HAUL_OUT` · `UNIT_RATE` · `CERTIFICATION` · `ROE` · `SURVEY` · `INCIDENT` · `DROP_OFF_LOG` |
| **enabled** | bool | Incidents and drop-off logs are switched on per project (ADR-188) |
| gpsRequired | bool | On the ROE form (ADR-181) |

**`FormDebrisType`**: a debris type added to a load or haul-out form (ADR-211, 214): **formId**,
**debrisTypeId**, **reduced**, reductionMethodId, **hiddenOnPhones**, archivedAt; unique on form +
debris type. **A field event points at this entry**, so a rule's *Debris type* matches the exact
entry (ADR-226).

**`FormDefinition`**: the firm's added fields on a survey, ROE, incident or drop-off log form
(ADR-160, 278): **formId**, **version**, **fields** (JSONB: each field's stable id, label, type
`TEXT · NUMBER · YES_NO · PICK · PHOTO`, required, its choices), **createdById**, **createdAt**. A
change is a new version; a version is never edited (guarded like `MasterPasscode`).

**`PayItem`** (provisional shape built, ADR-286): a priced line; **the only place a rate lives**.

| Field | Type | Notes |
|---|---|---|
| **id**, **projectId** | | |
| **code** | text | The firm's string; setup suggests one (`VEG-HAUL-CY-15`); never unique: a dated rate change may be a second one (ADR-147, 235) |
| **name** | text | "ROW VEG haul 0–15 mi"; two may share a name |
| **payableTypeId** | → `PayableType` | The work it prices; every pay item has one (ADR-221) |
| description | text | The contract's words and line number |
| **unit** | enum `BillingUnit` | `CY` · `TN` · `EA` · `LB` · `HR` · `CREW_DAY` · `TBN`; `TN` or `LB` means the load is weighed (ADR-223) |
| **formId** | → `Form` | The form (so the ticket type) it prices |
| kindOfWorkId | → `KindOfWork` | Required on a unit rate pay item (ADR-127) |
| bandFrom, bandTo | decimal(8,1) | The size band, in inches; bands of one payable type never overlap (setup refuses, ADR-217) |
| **countIsAlwaysOne**, **gpsRequired**, **measurementRequired**, **decimalsAllowed**, **photosRequired**, **monitorMayMarkIneligible**, **quantityFromCarriedTickets** | bool | The capture settings (ADR-157, 192, 207, 210) |
| crewTimeConversion | enum | `PER_HOUR` · `PER_DAY_EXACT` · `PER_DAY_STEPS` (ADR-087) |
| crewDayHours | decimal(4,2) | Default 12 |
| **createdAt**, archivedAt | instant | |

**`PayItemCrewDayStep`**: `payItemId`, `fromHours`, `toHours`, `quantity` (1.5–4.5 h = 0.25…).
**`PayItemRate`**: **payItemId**, **primeId** → `Contractor`, **rate** decimal(14,4); unique on pay
item + prime: one rate for each prime, never a copy of the pay item (ADR-206). No row = no rate for
that prime (a $0 line, flagged, ADR-212). A rate's history is the audit log.

**`Rule`** (`spec/RULES.md` §2): **id**, **projectId**, **formId**, **name**, contractId →
`Contract` (empty only on a rule with no *Add transaction*, ADR-239), **active**, fromPayItemId →
`PayItem` (written by that pay item's "Pays when" and edited only there, ADR-229), archivedAt.
"Is valid" is computed, never stored.

**`RuleCriterion`**: **ruleId**, **position**, **criterion** (enum `RuleCriterionKey`, §9),
**operator** (enum `RuleOperator`), then the typed value: `numberFrom`, `numberTo` decimal(14,4);
`dateFrom`, `dateTo` date; `text`. **`RuleCriterionPick`**: one row per picked value:
**criterionId** and exactly one of `contractorId`, `formDebrisTypeId`, `fieldTagId`,
`disposalSiteId`, `siteTypeId`, `payItemId`, `itemNameId`, or `zoneName` (a zone is matched by name,
since map versions change). Real columns, never JSON: the engine reads them.

**`RuleAction`**: **ruleId**, **kind** (`ADD_TRANSACTION` · `REMOVE_TRANSACTION` · `VOID_TICKET`),
slot (int, on add and remove), payItemId (on add), quantityFrom (`ALL_ITEMS` · `CHOSEN_ITEMS`,
ADR-128). **`RuleActionItem`**: the chosen items: `actionId` + `itemNameId`.

**`DisposalSite`** (provisional shape built): entered on each project that uses it (ADR-145).

| Field | Type | Notes |
|---|---|---|
| **id**, **projectId**, **name** | | "Bayline County Landfill" |
| shortCode | text | `BCL`: what setup offers in a suggested pay item code (*agent default*) |
| **siteTypeId** | → `SiteType` | What *Disposal site type* tests |
| **takesLoads**, **haulOutsLeaveHere**, **chargesTippingFee**, **ineligibleSite** | bool | The four site facts (ADR-215) |
| permitNumber | text | Empty = "permit outstanding", flagged, never blocking (ADR-111) |
| **latitude**, **longitude** | decimal(38,8) | Entered with the site; where mileage ends (ADR-208) |
| **activationDate**, closeDate | date | ADR-173 |
| tippingFeePayItemId | → `PayItem` | The link that tells a fee line (ADR-222) |
| **createdAt**, archivedAt | instant | |

**`DisposalSiteLabel`**: `siteId` + `siteLabelId`. **`SiteAreaVersion`**: a site's own shape
(the advanced area): **siteId**, **geometry**, **boundingBox**, **source** (`DRAWN` · `UPLOAD`),
**createdById**, **effectiveFrom**; dated and kept. A site with none uses the project's circle
(ADR-142, 144).

**`MapVersion`**: **projectId**, **version**, **source** (`UPLOAD` · `ESRI_LAYER` · `DRAWN`),
sourceName, zoneNameField, **boundary** (geometry), **boundingBox**, uploadedFileKey,
**loadedById**, **loadedAt**. Never edited or deleted. **`Zone`**: **mapVersionId**, **name**,
**geometry**, **boundingBox** (ADR-135, 141).

**Numbering.** **`NumberSeries`**: **projectId**, **series** (`LOAD` · `HAUL_OUT` · `UNIT_RATE` ·
`CERTIFICATION` · `ROE`), **firstNumber**, **nextNumber**; unique on project + series. The server is
the only allocator (ADR-065). **`ControlRange`**: **projectId**, **series**, **firstNumber**,
**lastNumber**: pre-printed stock (ADR-056). **`NumberBlock`** as built, plus a database refusal of
overlapping blocks (C43).

**`Certification`** (`adms-certifications` §3A.2): a container or a crew, never a vehicle.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid (from the phone) | |
| **projectId**, **certNumber** | → `Project`, text | **Unique together**: cert = placard = badge (ADR-045) |
| **kind** | enum | `CONTAINER` · `CREW` |
| **primeId** | → `Contractor` | Whose work it is, on every ticket that scans its badge (ADR-186) |
| firstTierSubId, secondTierSubId | → `Contractor` | Typed in at certification under the prime (ADR-108); the operating sub is the lowest one filled |
| vehicleTypeId, vehicleTypeOther | → `VehicleType`, text | |
| crewTypeId | → `CrewType` | A crew only |
| capacityCy | int | A container only: whole CY, computed from its boxes exactly as §3A.3 says; **never typed**; a crew has none (check) |
| driverName, driverPhone, driverLicenceNumber, driverLicenceState, driverLicenceExpiry | text, date | Recorded, never checked (ADR-153) |
| tagNumber, tagState, tagExpiry | text, date | An expired tag flags later tickets (ADR-079) |
| **certifiedAt**, **deviceUtcOffsetMinutes**, **receivedAt** | instant, int, instant | |
| **certifiedById**, deviceId, assignmentId | → `User`, → `Device`, → `Assignment` | |
| helperMonitorNumbers | text[] | Typed IDs; one that matches no user is flagged (ADR-080) |
| clientRepresentativeName, contractorRepresentativeName | text | Names only |
| **signaturesOnFile** | bool | Set at QC |
| replacesId, replacedReason | → `Certification`, text | A modified truck's new certification (ADR-082) |
| copiedFromId | → `Certification` | The same truck on another project (ADR-152) |
| revokedFrom, revokedReason, revokedById | date, text, → `User` | By an admin, with a reason (ADR-079) |
| notes | text | |

**`CertificationBox`**: the measured boxes, stored so the capacity can always be recomputed:
**certificationId**, **position** (0 = the primary), featureId → `VehicleFeature`, featureOther,
**shape** (`RECTANGLE` · `TRIANGLE` · `TWO_LENGTH_HOIST` · `ROUND_BOTTOM` · `RADIUS_CORNER`),
**sign** (`ADD` · `SUBTRACT`; the primary adds, a radius corner subtracts), and whole inches:
`length`, `secondLength`, `width`, `height`, `diameter`, `radius`, `run`, `corners`.

**`Roe`** (a record like a ticket, ADR-149): **id** (from the phone or the database),
**projectId**, **roeNumber** (unique with the project), parcelId, address, ownerName, **signed**,
signedDate, latitude, longitude, **answers** + **formDefinitionId** (its scope: the firm's ROE form
fields, ADR-181), **source**, madeById, deviceId, assignmentId, madeAt with its offset and
`receivedAt`, notes.

**Time clock** (Phases 3–4; ADR-241). **`ClockEntry`** (evidence): **id** (from the phone),
**assignmentId**, **kind** (`IN` · `BREAK_START` · `BREAK_END` · `OUT`), **at** with its offset and
`receivedAt`, deviceId. **`ClockActivityLine`** (evidence): **assignmentId**, **startedAt**,
**endedAt**, activityId → `ClockActivity` (what the app can't know) or `fieldEventId` (pre-filled),
note. **`ApprovedDay`** (mark): **assignmentId** (unique), **approvedById**, **approvedAt**,
unlockedById, unlockedAt. **No field links any of it to crew time**, and no rate or pay is held.

---

## 4. Evidence: what monitors saw

### 4.1 `FieldEvent`: one model, five kinds (ADR-236)

**Every kind records:**

| Field | Type | Notes |
|---|---|---|
| **id** | uuid, from the phone | |
| **projectId**, **workflow**, **kind** | → `Project`, enum, enum | The workflow must fit the kind (check, built) |
| **ticketNumber** | text | The bare number, as scanned or shown |
| **splitSuffix** | text | `A`, `B`…; empty when not split, so the unique key holds |
| **numberTyped**, numberTypedReasonId | bool, → `Reason` | Typed instead of scanned: flagged, with its reason (ADR-111, 173) |
| **source** | enum `RecordSource` | `DEVICE` · `BACK_OFFICE` |
| **monitorId** | → `User` | Who witnessed it; never the system actor |
| deviceId, assignmentId, setupVersion | → `Device`, → `Assignment`, int | Required from a phone; empty on a back-office-created record (check; C44) |
| createdById, createdReasonId | → `User`, → `Reason` | The back-office person who created it and why (ADR-156); required when `source` is `BACK_OFFICE` |
| **temporarySession** | bool | Made under the master passcode's temporary session for this monitor (ADR-120) |
| **certNumber** | text | The number as scanned: a snapshot (ADR-017) |
| certificationId | → `Certification` | Empty while no certification on the project has that number (ADR-154) |
| **certKeyedByHand**, typedCapacityCy | bool, int | A truck keyed in by hand: only the monitor's claim (ADR-154) |
| siteId | → `DisposalSite` (same project) | From the assignment; empty on a curb collection and on unit rate work away from a site (ADR-195) |
| **startedAt**, **endedAt**, **deviceUtcOffsetMinutes**, **receivedAt** | instant, instant, int, instant | The device's clock (ADR-100) |
| startLatitude, startLongitude, endLatitude, endLongitude | decimal(38,8) | Whatever fix the phone had (ADR-083) |
| address, addressSource | text, enum | `LOOKED_UP` · `TYPED` (ADR-111) |
| notes | text | |

**Kind-specific columns**, each empty on every other kind (a database check per column):

| Field | Type | `COL` | `DIS` | `HOC` | `HOD` | `URT` | Notes |
|---|---|---|---|---|---|---|---|
| formDebrisTypeId | → `FormDebrisType` | ✓ | ✓ | ✓ | ✓ | | Picked at each end, on its own (ADR-207) |
| fieldTagId | → `FieldTag` | ✓ | | ✓ | | ✓ | Optional (ADR-218) |
| roeId | → `Roe` | ✓ | | | | ✓ | On an ROE project (ADR-149) |
| estimateCy | decimal(8,1) | ✓ | | | | | A split property's estimate; present exactly when `splitSuffix` is (check; ADR-055) |
| loadCall | int 0–100 | | ✓ | ✓ | | | A whole number; 0 accepted and flagged (ADR-116) |
| scaleReceiptId | → `ScaleReceipt` | | ✓ | | ✓ | | The weight instead of a load call, or an optional receipt at a Final Disposal tower (ADR-223, 227) |
| carriedCount | int | | ✓ | | | | The tower's count on a load that carries tickets (ADR-243) |
| payableTypeId | → `PayableType` | | | | | ✓ | What the monitor picked by name (ADR-207) |
| payItemId | → `PayItem` | | | | | ✓ | What the phone worked out and printed; empty when no band fits (ADR-213) |
| unitCount | decimal(10,2) | | | | | ✓ | The count, pounds or, itemised, nothing (the items hold it) |
| measurementInches, measuredAs | decimal(8,1), enum | | | | | ✓ | `CIRCUMFERENCE` · `DIAMETER`; a stump's is its diameter two feet up (ADR-177, 189) |
| rootBallInches, rootBallHalfExposed | decimal(8,1), bool | | | | | ✓ | Stumps (ADR-198) |
| surveyNumber | text | | | | | ✓ | Stumps: picked or typed; none is flagged (ADR-198) |
| markedIneligible | bool | | | | | ✓ | Where the pay item allows it (ADR-210) |

**The reconciliation columns**, the only ones the worker may write (column grants, ADR-270):
**status** (`PENDING` · `COMPLETED` · `MANUAL_REVIEW` · `VOID`), reconciledAt, zoneId → `Zone`,
mapVersionId → `MapVersion` (the zone attached from the GPS and the map version used, ARCHITECTURE
§3), and on a unit rate event `workedOutPayItemId` → `PayItem` (the engine's answer from the bands:
"the phone's answer printed, the engine's bills", ADR-217). Every event of a ticket carries the
ticket's status; **there is no ticket table**: a ticket is its number and its events (*agent
default*).

**`FieldEventItem`**: an itemised unit rate event's lines (ADR-040, 084): **fieldEventId**,
**itemNameId**, **quantity** decimal(10,2) (a count, or hours to the quarter hour); unique on event
+ item. **`CarriedTicket`**: the tickets a load carries (ADR-192): **fieldEventId** (the
collection), **carriedTicketNumber**; unique together.

### 4.2 Scale receipts (ADR-034, 038)

**`ScaleReceipt`**: its own record, pointed at by one or several disposal events, consumed once.
**id** (from the phone), **projectId**, **receiptNumber** (the site's own, transcribed verbatim;
**unique with the project**), **siteId**, grossWeightLb, tareWeightLb, netWeightLb (decimal(12,2)),
netWeightTons (decimal(12,4)), enteredById, deviceId, **enteredAt** with its offset and
`receivedAt`, notes. Every weight is what the paper says, never inferred; a tandem's shares are
derived, on the completed loads (§5).

### 4.3 Forms: records, never a ticket's events (ADR-236)

Each has **id** (from the phone or the database), **projectId**, **source**, **monitorId**,
deviceId, assignmentId, setupVersion, createdById and createdReasonId (as a field event), its time
with the offset and `receivedAt`, latitude and longitude, **answers** + **formDefinitionId**, notes.

| Model | Its own fields |
|---|---|
| **`Survey`** | **workTypeId** → `SurveyWorkType`, surveyNumber (what a stump ticket cites, ADR-198), roeId (a post-work survey finds its pre-work survey by ROE number, ADR-150) |
| **`Incident`** | **incidentTypeId**, incidentSubTypeId, description, parties, address. Records only: never stops work (ADR-052) |
| **`DropOffLog`** | **siteId**, residentName, originAddress. No quantity, number, pay item or cost (ADR-184, 188) |

### 4.4 Photos (ARCHITECTURE §11)

**`Photo`**: **id** (from the phone), **projectId**, exactly one owner (`fieldEventId`,
`certificationId`, `roeId`, `surveyId`, `incidentId`, `dropOffLogId` or `scaleReceiptId`; check),
`view` (a certification's five: `OPERATOR_WITH_PLACARD` · `INTERIOR_OR_BACK` · `RIGHT` · `LEFT` ·
`FRONT`, ADR-179), **capturedAt** with its offset, latitude, longitude, **originalSha256** (taken at
capture), **uploadedSha256**, **objectKey**, depthObjectKey, deviceId, uploadedAt. The database holds
only this; the file is one immutable object in storage, never overwritten, kept indefinitely
(ADR-101). At most 8 a ticket is the phone's rule; fewer than a pay item requires is a flag.

### 4.5 Sync (Phase 2 settles the detail; ARCHITECTURE §9)

**`Sync`**: one connection from a phone: **deviceId**, **startedAt**, **deviceClockAt**,
**clockDifferenceSeconds**, setupVersionSent. **`SyncedRecord`**: the idempotency ledger:
**recordId** (the phone-made id; the key), **recordKind**, **syncId**, **answer** (`SAVED` ·
`QUARANTINED`); a retry is answered "already saved" from here and never quarantined (KD-56).
**`QuarantinedRecord`**: a second field event of one kind on one ticket, **kept in full** (ADR-022):
**id** (the phone-made id), **projectId**, **deviceId**, **monitorId**, **payload** (JSONB: the
record exactly as sent, for a person to read), **reason**, **holdingEventId** → `FieldEvent`,
**receivedAt**, resolvedById, resolvedAt, resolution. A reviewer's renumber makes it a field event
with its own id and marks this row resolved; it is never dropped. **`FieldEventEdit`**: a phone's
edit log for an event reopened before the shift ended; the audit capture writes the change under the
monitor. **`SetupManifest`**: the numbered lists a phone was sent (**projectId**, **version**,
**content**, **builtAt**), kept so a reviewer sees what the phone showed (ADR-240).

---

## 5. Derived: the worker's conclusions

**`CompletedLoad`** (`CLT`): one per disposal event, for the life of that event (*agent default*:
it is "updated in place, never duplicated", ADR-086).

| Field | Type | Notes |
|---|---|---|
| **id**, **projectId** | | |
| **ticketNumber** | text | The load's bare number; unique with the project among live loads |
| **disposalEventId** | → `FieldEvent`, **unique** | A load dumps once (ADR-155; invariant 17) |
| **quantitySource** | enum | `LOAD_CALL` · `SCALE_WEIGHT` · `CARRIED_TICKETS` |
| capacityCy, loadCall | int | The certification's capacity and the call that gave the volume |
| volumeCy | decimal(10,2) | capacity × load call ÷ 100, or the carried stumps' CY summed |
| weightTons | decimal(12,4) | The load's weight: the receipt's net, or **this load's derived share** of a tandem's |
| **weightIsShare** | bool | True when the weight was apportioned, never weighed (ADR-175) |
| carriedCount | int | The items on the tickets it carries |
| dissolvedAt | instant | Set when a correction leaves the ticket no longer whole (its events renumbered away); cleared when it is whole again. Nothing is deleted |
| **createdAt**, **updatedAt** | instant | |

**`CompletedLoadCollection`**: one per collection event of the load: one on an ordinary load, one
per property on a split (ADR-055, 162).

| Field | Type | Notes |
|---|---|---|
| **completedLoadId** | → `CompletedLoad` | |
| **collectionEventId** | → `FieldEvent` | **Unique among live rows**: one collection can't bill twice (invariant 17) |
| **splitSuffix** | text | Empty on an ordinary load |
| **shareFraction** | decimal(9,8) | Its estimate ÷ the sum of the estimates; 1 on an ordinary load |
| volumeCy, weightTons | decimal | Its share; the shares sum exactly to the load's |
| mileage | decimal(10,4) | Road miles from its end GPS, snapped to the nearest road, to the site's own GPS; stored unrounded, compared in tenths (ADR-125, 208) |
| **mileageSource** | enum | `ROAD_ROUTE` · `STRAIGHT_LINE` (no route found: flagged, ADR-163) |
| snappedLatitude, snappedLongitude, snappedAddress | decimal, text | The road point routed from and its looked-up address |
| mapDataDate, mapDataSha256 | date, text | The map extract the mileage came from, so a map update never silently changes a billed mileage (ARCHITECTURE §3; ADR-282) |
| dissolvedAt | instant | As above |

**`CompletedHaulOut`** (`CHO`): **id**, **projectId**, **ticketNumber**, **collectionEventId** and
**disposalEventId** (each unique among live rows), **quantitySource** (`LOAD_CALL` · `SCALE_WEIGHT`), capacityCy, loadCall, volumeCy, weightTons,
mileage and its source, snapped point, map data date and hash, dissolvedAt. A weight-paid haul-out
keeps its loading-end call, unbilled (ADR-227).

**A load's or haul-out's time is its collection's end** (ADR-161), read from the collection event
itself (each property's own on a split); it isn't copied onto the completed record.

**`Transaction`** (built in part): one priced line; the current truth, regenerated when its ticket
changes, each removed row copied in full to `AuditRecord` first, the delete refused on an
invoice-locked ticket (ADR-085, 090).

| Field | Type | Notes |
|---|---|---|
| **id**, **projectId** | | |
| completedLoadId, completedLoadCollectionId | → | A load's line: the load, and the property it prices |
| completedHaulOutId | → | A haul-out's line |
| fieldEventId | → `FieldEvent` | A unit rate ticket's line. **Exactly one of the three** (check) |
| **slot** | int | The rule action's #; unique with its ticket (and property) |
| **ruleId**, **payItemId** | → `Rule`, → `PayItem` | The rule that made it and the pay item it pays |
| contractId | → `Contract` | The rule's contract |
| **primeId**, operatingSubId | → `Contractor` | Whose rate, and who did the work (ADR-081, 212) |
| **unit** | enum `BillingUnit` | The pay item's, as it was |
| **quantity**, **rate**, **amount** | decimal | amount = quantity × rate; a $0 line where the prime has no rate, or the pay item none |
| reconciliationRunId | → `ReconciliationRun` | |
| **createdAt** | instant | |

**`Flag`**: every problem, as a plain message (`spec/FLAGS.md` is the catalogue).

| Field | Type | Notes |
|---|---|---|
| **id**, **projectId** | | |
| workflow, ticketNumber | enum, text | The ticket it's on |
| fieldEventId, certificationId, disposalSiteId, surveyId | → | The record it's about, where it's about one |
| **code** | enum `FlagCode` | `spec/FLAGS.md` §3 |
| **message** | text | "Ticket 101008: debris type mismatch (collection Vegetative, disposal C&D). Flagged for review." |
| **facts**, **factsSha256** | JSONB, text | The inputs it was raised on, written and compared by the worker alone, so "have the facts changed?" can be answered (ADR-166) |
| **billable** | bool | False where no amount can be computed: the message says "not billed" |
| **raisedAt**, clearedAt | instant | Cleared when the facts no longer raise it; never deleted |
| reconciliationRunId | → | |

**`ReconciliationRun`**: **projectId**, **trigger** (`SYNC` · `CORRECTION` · `SETUP_CHANGE` ·
`REPROCESS`), requestedById, **startedAt**, finishedAt, ticketsDone, ticketsFailed.
**`ReconciliationDecision`**: what a run decided for one ticket and why (ARCHITECTURE §13):
**reconciliationRunId**, **workflow**, **ticketNumber**, **status**, **summary** (JSONB, for a
person: the events grouped, the rules that passed), error.

---

## 6. Marks: what people set, without changing the record (ADR-245)

| Model | Fields | Rule |
|---|---|---|
| **`QcMark`** | exactly one target (`completedLoadId`, `completedHaulOutId`, `fieldEventId` for a unit rate ticket, `certificationId`, `roeId`, `surveyId`, `incidentId`, `dropOffLogId`), unique; **status** (`QC_REVIEW` · `QC_APPROVED` · `QC_ISSUES` · `QC_VOID`), **setById**, **setAt**, note | Set only by people; never on a load's or haul-out's single event (ADR-107, 168). No row = QC Review. A certification's "checked by" is its mark's `setById` (ADR-080) |
| **`InvoiceLock`** (built) | one target (`completedLoadId`, `completedHaulOutId` or `fieldEventId`), unique among live locks; invoiceBatchId; **lockedById**, **lockedAt**; unlockedById, unlockedAt, unlockNote | Only on a QC Approved record (ADR-121). An unlock keeps the row and is audited; locking again is a new row (C17) |
| **`InvoiceBatch`** | **projectId**, **name** ("Bayline ROW, week of 12 Oct"), createdById, createdAt | A name and its tickets; no amounts (ADR-228) |
| **`FlagAcceptance`** | **flagId** (unique), **reasonId**, note, **acceptedById**, **acceptedAt** | The flag stays in the history and isn't raised again unless its facts change (ADR-166) |
| **`TicketVoid`** | **projectId**, **workflow**, **ticketNumber**, **reasonId**, note, **voidedById**, **voidedAt**; liftedById, liftedAt, liftNote | A person's void (C19): the worker reads it and sets `VOID`. An unvoid lifts it, audited. A rule's void is the worker's own: its reason is the rule, on the run's decision; it wins on every reprocess (ADR-167) |
| **`ApprovedDay`** | §3 | |

---

## 7. Audit

**`AuditRecord`** (built): written by database triggers alone, one per insert and update on every
table above, and one per removed `Transaction`; never updated or deleted by anyone (ADR-085, 097).
**id** (a database-numbered bigint), **occurredAt**, **tableName**, **recordId**, **operation**,
priorValue, newValue, **changedFields**, actorId, deviceId, **source** (`DEVICE` · `BACK_OFFICE` ·
`SYSTEM`), reason, requestId, **domain** (`SECURITY` · `BILLING` · `OPERATIONS` · `RECORDS`). A
secret column is named on its table's trigger and kept out (ADR-281). Sign-ins, lockouts, device
enrolment and master-passcode uses are security events in the same log (Phase 2, REQ-202b).

---

## 8. What the database refuses by itself

Never relaxed to pass a test (ARCHITECTURE §5.4). ✅ = built today.

| The rule | How |
|---|---|
| One field event per project + workflow + bare number + split suffix + kind | ✅ unique key |
| A kind fits its workflow; a load call is 0–100 and only on `DIS` and `HOC` | ✅ checks |
| Every kind-specific column is empty on the other kinds; a split's suffix and estimate are both there or neither | checks |
| A phone's record carries its device, assignment and setup version; a back-office one its person and reason | check |
| One disposal per completed load; one live completed record per collection event | unique keys (the second partial: `WHERE dissolved_at IS NULL`, in a guard migration) |
| A cert number once per project; a receipt number once per project; an ROE number once per project | unique keys |
| A transaction # once per ticket (and property) | unique key |
| A crew certification has no capacity and no boxes; a container has both | check |
| A project's time zone is an IANA name; no time without its zone | ✅ checks, a test |
| The Monitor ID is issued, well-formed, unique; the system actor is one fixed row and never a person | ✅ |
| An assignment's site, a field event's site and an assignment's pay items are their own project's | two-column foreign keys (✅ for the first and third) |
| Number blocks of one series never overlap | an exclusion constraint (needs `btree_gist`: its own ADR, C43) |
| Size bands of one payable type never overlap | the API at setup (ADR-217); the worker flags what slips through |
| Nothing is deleted; audit is append-only; every write states its actor; a transaction's delete is copied first and refused when locked; viewers see only their own projects | ✅ the guard migrations (ADR-270…276) |

---

## 9. The closed sets (Postgres enums)

`Workflow` · `FieldEventKind` · `TicketStatus` · `UserRole` · `DeviceStatus` · `NumberSeries` ·
`NumberBlockStatus` · `AssignmentOrigin` · the audit's three (all ✅ built) · `ContractorKind` ·
`ContractorPosition` · `ViewerKind` · `Permission` · `ReasonUse` · `FormDocumentType` ·
`BillingUnit` · `CrewTimeConversion` · `CountShape` · `CertificationKind` · `BoxShape` · `BoxSign` ·
`RecordSource` · `MeasuredAs` · `AddressSource` · `TicketNumberSource` · `QuantitySource` ·
`MileageSource` · `MapSource` · `QcStatus` · `FlagCode` · `RuleActionKind` · `QuantityFrom` ·
`RuleOperator` · `RuleCriterionKey`.

`RuleCriterionKey` (`spec/RULES.md` §4): `TICKET_DATE` · `CONTRACTOR` · `DEBRIS_TYPE` · `FIELD_TAG` ·
`WEIGHT` · `VOLUME` · `COLLECTION_ADDRESS` · `ZONE` · `DISPOSAL_SITE` · `FROM_SITE` ·
`DISPOSAL_SITE_TYPE` · `MILEAGE` · `PAY_ITEM` · `UNIT_COUNT` · `MEASUREMENT` · `ITEM`.
`RuleOperator` (its §4a): `EQUALS` · `NOT_EQUALS` · `IS_ONE_OF` · `IS_NOT_ONE_OF` · `BETWEEN` ·
`AT_LEAST` · `AT_MOST` · `MORE_THAN` · `LESS_THAN` · `ON` · `NOT_ON` · `ON_OR_BEFORE` ·
`ON_OR_AFTER` · `CONTAINS` · `STARTS_WITH` · `IS_EMPTY` · `IS_NOT_EMPTY`.

A new value in any of them is a code change with an ADR (`spec/LISTS.md` Group 2).

---

## 10. From today's schema to this page

| Model today | Phase 1 change |
|---|---|
| `Project` | Gains its client, declaration event, program type, window, number source and settings (§3) |
| `Contractor` | Gains its kind, contact and merge link; `ProjectContractor` is new |
| `User` | Gains viewer kind, contact, permissions and viewer projects; sign-in's columns in Phase 2 |
| `Device`, `MasterPasscode`, `NumberBlock` | As built; a key's revocation; the overlap refusal |
| `DisposalSite` | Gains its type, facts, permit, GPS, dates, labels, area versions, tipping fee link |
| `Assignment` | Gains `formDocumentTypes`; its pay items are built (ADR-286) |
| `PayItem` (code, name only) | Gains every field of §3, its rates and steps |
| `FieldEvent` | Gains the shared and kind-specific columns of §4.1; `deviceId`, `assignmentId`, `setupVersion` become optional for a back-office-created record |
| `CompletedLoad` | Its one collection link moves to `CompletedLoadCollection`; gains its quantity and `dissolvedAt` |
| `Transaction` | Gains its rule, pay item, contract, operating sub, unit, property and the two other ticket links; the delete guard follows the lock through them |
| `InvoiceLock` | Gains the unlock columns, the batch and the two other targets |
| `AuditRecord` | As built |
| *New* | Everything else on this page, in `BACKLOG.md`'s Phase 1 order; each table guarded in one line (ADR-271) |

---

## 11. Exports: the column names (ADR-164, 234)

Every export is one row per thing, the columns below in this order, named with the field's own
words in snake_case so a column means the same everywhere. Times are ISO 8601 with the project's
offset; a list value exports its **name**; codes and rates appear only in back-office exports, never
on a phone. The firm's added fields follow as `answer_<label>` columns (ADR-278).

| Export | One row per | Columns |
|---|---|---|
| **Loads** | a completed load's property (one row on an ordinary load, one per split property) | `project`, `ticket_number`, `split_suffix`, `status`, `qc_status`, `invoice_batch`, `locked_at`, `load_date`, `prime`, `operating_sub`, `cert_number`, `capacity_cy`, `driver_name`, `debris_type`, `disposal_debris_type`, `field_tag`, `roe_number`, `collection_monitor_id`, `collection_started_at`, `collection_ended_at`, `collection_address`, `collection_latitude`, `collection_longitude`, `zone`, `estimate_cy`, `share_fraction`, `disposal_site`, `disposal_site_type`, `disposal_monitor_id`, `disposal_started_at`, `disposal_ended_at`, `disposal_latitude`, `disposal_longitude`, `quantity_source`, `load_call`, `volume_cy`, `scale_receipt_number`, `weight_tons`, `weight_is_share`, `carried_count`, `mileage`, `mileage_source`, `map_data_date`, `open_flags`, `amount` |
| **Haul-outs** | a completed haul-out | `project`, `ticket_number`, `status`, `qc_status`, `invoice_batch`, `locked_at`, `haul_out_date`, `prime`, `operating_sub`, `cert_number`, `capacity_cy`, `debris_type`, `disposal_debris_type`, `reduced`, `reduction_method`, `field_tag`, `from_site`, `collection_monitor_id`, `collection_started_at`, `collection_ended_at`, `disposal_site`, `disposal_site_type`, `disposal_monitor_id`, `disposal_started_at`, `disposal_ended_at`, `quantity_source`, `load_call`, `volume_cy`, `scale_receipt_number`, `weight_tons`, `mileage`, `mileage_source`, `map_data_date`, `open_flags`, `amount` |
| **Unit rate tickets** | a unit rate event | `project`, `ticket_number`, `status`, `qc_status`, `invoice_batch`, `locked_at`, `work_date`, `prime`, `operating_sub`, `cert_number`, `crew_type`, `kind_of_work`, `payable_type`, `pay_item_code`, `pay_item_name`, `pay_item_description`, `printed_pay_item_code`, `unit_count`, `measurement_in`, `measured_as`, `diameter_in`, `root_ball_in`, `root_ball_half_exposed`, `fill_cy`, `survey_number`, `marked_ineligible`, `items`, `field_tag`, `roe_number`, `monitor_id`, `started_at`, `ended_at`, `address`, `latitude`, `longitude`, `zone`, `open_flags`, `amount` |
| **Transactions** (the ledger) | a transaction | `project`, `workflow`, `ticket_number`, `split_suffix`, `transaction_number`, `pay_item_code`, `pay_item_name`, `pay_item_description`, `payable_type`, `unit`, `quantity`, `rate`, `amount`, `contract`, `prime`, `operating_sub`, `rule`, `ticket_date`, `status`, `qc_status`, `invoice_batch`, `locked_at` |
| **Field events** (the evidence, as captured) | a field event | `project`, `workflow`, `kind`, `ticket_number`, `split_suffix`, `status`, `source`, `monitor_id`, `monitor_name`, `device`, `assignment_origin`, `setup_version`, `temporary_session`, `cert_number`, `cert_keyed_by_hand`, `site`, `started_at`, `ended_at`, `device_utc_offset`, `received_at`, `start_latitude`, `start_longitude`, `end_latitude`, `end_longitude`, `address`, `number_typed`, `number_typed_reason`, plus the kind's own columns, `photo_count`, `notes` |
| **Certifications** | a certification | `project`, `cert_number`, `kind`, `qc_status`, `checked_by`, `signatures_on_file`, `prime`, `first_tier_sub`, `second_tier_sub`, `vehicle_type`, `crew_type`, `capacity_cy`, `boxes`, `driver_name`, `tag_number`, `tag_state`, `tag_expiry`, `certified_at`, `certified_by`, `helpers`, `replaces`, `replaced_by`, `copied_from`, `revoked_from`, `revoked_reason`, `photo_count`, `notes` |
| **ROEs** | an ROE | `project`, `roe_number`, `qc_status`, `parcel_id`, `address`, `owner_name`, `signed`, `signed_date`, `latitude`, `longitude`, `made_by`, `made_at`, the firm's fields |
| **Surveys** | a survey | `project`, `work_type`, `survey_number`, `roe_number`, `qc_status`, `monitor_id`, `made_at`, `latitude`, `longitude`, the firm's fields |
| **Incidents** | an incident | `project`, `incident_type`, `incident_sub_type`, `qc_status`, `description`, `parties`, `address`, `monitor_id`, `made_at`, `latitude`, `longitude`, the firm's fields |
| **Drop-off logs** | a drop-off log | `project`, `site`, `qc_status`, `resident_name`, `origin_address`, `monitor_id`, `made_at`, `latitude`, `longitude`, `photo_count`, `notes`, the firm's fields |
| **Flags** | a flag | `project`, `workflow`, `ticket_number`, `code`, `message`, `billable`, `raised_at`, `cleared_at`, `accepted_by`, `accepted_at`, `accept_reason` |
| **Hours** | a person's day | `project`, `work_date`, `person`, `monitor_id`, `employer`, `clock_in`, `break_start`, `break_end`, `clock_out`, `hours`, `activity_lines`, `approved_by`, `approved_at` |
| **Audit log** | an audit record | `occurred_at`, `domain`, `table`, `record`, `operation`, `changed_fields`, `prior_value`, `new_value`, `actor`, `device`, `source`, `reason` |

A read-only viewer's export is the same, less what they may not see: no personal phone or licence
numbers for anyone, only its own tickets and transactions for a contractor, nobody's hours
(ADR-169, 241).

---

## 12. For your decision: the agent defaults on this page

Each is a shape nothing settled before; none changes money, evidence or what a monitor does. Say
which to change; the rest stand when you approve the page.

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

**Carried items this page answers:** C16 (a split's collections; `CompletedHaulOut`; the
transaction's pay item, rule, contract and operating sub), C17 (the unlock), C18 (a contractor
viewer follows `Transaction.primeId` and the certification's prime), C19 (a person's void), C29
(times the database stamps stay its own; a story asserts order, not those times), C36 (the firm's
added fields), C42 (the assignment's pay items and forms; the real `DisposalSite`; a contractor's
kind), C43 (the series, control ranges, the ROE series; the overlap refusal still needs its ADR),
C44 (back-office-created events). **Not on this page:** a rate history table (the audit log is the
only history, ADR-090); an invoice record (there is none, ADR-061); a driver list, a crew list,
a tandem, an expected destination, work orders (ADR-153, 228, 038, 205).
