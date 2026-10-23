# Open ADMS — The data model

✅ **Approved** With the user's approval of the wording - 10.01.2026-1345 *(BACKLOG 0.2b.2; ADR-284; the approval is ADR-289; changed since, at the user's word, by ADR-292…295 and ADR-301; **§2.2's sign-in records added by ADR-397…399, agent defaults, not yet seen by the user**)*

← [Index](INDEX.md)

> **What this page is.** The schema on paper: every record Open ADMS keeps, its fields, who may
> write it, what the database itself refuses, and the columns each export carries. Phase 1's Prisma
> schema is written from it (ADR-140, 164). **It decides names and shapes, never rules**: what a
> record *means* stays with the newest ADR, `agent_store/SUMMARY.md` and the skills
> (`adms-data-model` is the model in prose; `adms-ticket-workflows` §4.0 and §4.2–§4.6 say what each
> record holds; `adms-certifications` §3A.2–§3A.3 the certification). Names follow
> `spec/CONVENTIONS.md` §3; examples come from its example world (`spec/golden/MISSION.md`).
>
> **What exists today.** Thirteen provisional models are built (ADR-268, 281), plus, in full, the
> firm's eighteen lists of §2.3 (ADR-302), the client, the declaration event and the project of
> §2.1 and §3 (ADR-303), the contractor, its place on a project and the contract (ADR-305), the
> forms and what sits on them (ADR-308), pay items with their rates and steps (ADR-309), and sites
> and the project map (ADR-311). §10 says, model by model, what Phase 1 changes.

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
| 2 | Shared, firm-wide records | `Client` · `DeclarationEvent` · `Contractor` · `ProjectContractor` · `User` · `UserCredential` · `Session` · `SecurityEvent` · `UserPermission` · `ViewerProject` · `Device` · `MasterPasscode` · `MasterPasscodeTries` · `Assignment` · `AssignmentPayItem` · the firm's lists |
| 3 | A project and its setup | `Project` · `ProjectKindOfWork` · `Contract` · `Form` · `FormDebrisType` · `FormDefinition` · `PayItem` · `PayItemCrewDayStep` · `PayItemRate` · `Rule` · `RuleCriterion` · `RuleCriterionPick` · `RuleAction` · `RuleActionItem` · `DisposalSite` · `DisposalSiteLabel` · `SiteAreaVersion` · `MapVersion` · `Zone` · `ProjectNumberSeries` · `ControlRange` · `NumberBlock` · `Certification` · `CertificationBox` · `CertificationHelper` · `Roe` · `RoeScopeItem` · `ClockEntry` · `ClockActivityLine` · `ApprovedDay` |
| 4 | Evidence: what monitors saw | `FieldEvent` · `FieldEventItem` · `CarriedTicket` · `FieldEventWaypoint` · `ScaleReceipt` · `Survey` · `Incident` · `DropOffLog` · `Photo` · `Sync` · `SyncedRecord` · `QuarantinedRecord` · `SetupManifest` |
| 5 | Derived: the worker's conclusions | `CompletedLoad` · `CompletedLoadCollection` · `CompletedHaulOut` · `CompletedHaulOutCollection` · `Transaction` · `Flag` · `ReconciliationRun` · `ReconciliationDecision` · the job queue: `ReconciliationJob` · `ReconciliationJobTicket` |
| 6 | Marks: what people set | `QcMark` · `InvoiceLock` · `InvoiceBatch` · `FlagAcceptance` · `TicketVoid` · `TicketUnvoid` · `ApprovedDay` |
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
| **The firm's own fields** | One `answers` JSONB column plus the `formDefinitionId` it answered (§4.3). **Nothing the engine, a rule or a flag reads is ever in JSONB** | ADR-278 |
| **Shapes on a map** | GeoJSON geometry in longitude and latitude, with its bounding box: fixed-shape data the engine reads, as ARCHITECTURE §3 approved. Built (ADR-311): a `Polygon` or `MultiPolygon` geometry kept as JSONB, checked to hold its type and coordinates; its bounding box four `decimal(38,8)` columns (`westLongitude`, `southLatitude`, `eastLongitude`, `northLatitude`). Phase 1 takes shapes in as GeoJSON; a shapefile, KML or Esri layer is REQ-124b's import (Phase 4) | ADR-141, 311 |

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
| mergedIntoId | → `Contractor` | ⚠️ **Written by nothing since ADR-529 (f)**, kept as history: two spellings of a sub are flagged (`SUB_NAME_ALIKE`) and a person corrects the sub, never merged. Was: a sub typed twice at certification, merged by the back office, audited (ADR-108); the merged row is archived, never deleted. Never itself, and a merged row is archived for as long as it is merged (checks, ADR-305) |
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
| **role** | enum `UserRole` | `ADMIN` · `MANAGER_ANALYST` · `MONITOR` · `READ_ONLY_VIEWER` · `SYSTEM` (the worker's one actor, never a login, ADR-273) · `MASTER_PASSCODE` (the one actor an act under the master passcode is written as, never a person or a login; only the API states it, for a phone; no record names it, ADR-438, 439) · `DEVICE_KEY` (the one actor a phone's own act is written as, done on the strength of its device key with nobody signed in; never a person or a login; only the API states it, for a phone, naming it; no record names it, ADR-440) |
| monitorNumber | text, unique | The Monitor ID (`M004127`), issued by the database; every monitor has one (ADR-281); a person an admin creates in the back office is issued none (ADR-415) |
| employerId | → `Contractor` | Who employs them when it isn't the firm |
| employerNumber | text | That employer's own ID for them (`HS-0417`) |
| contractorId | → `Contractor` | A contractor user's contractor: what they may see (ADR-169). **Built (ADR-315):** set on a contractor user and on nobody else (check) |
| viewerKind | enum `ViewerKind` | `CLIENT` · `CONTRACTOR` · `AUDITOR`, on a read-only viewer only. **Built (ADR-315):** every read-only viewer states it, nobody else does (check) |
| seesPrivateCitizens | boolean | Whether this viewer sees private citizens by name (an ROE's owner; a drop-off log's resident and origin address). On a read-only viewer only: every one states it, nobody else does (check). No database default: a new viewer starts at yes (`packages/domain`, `ViewerSettings.starting()`), and the firm changes it for that viewer at any time, audited (ADR-328 (4); **built, ADR-336**) |
| email, phone | text | Each optional. A monitor's phone is shown to admins only (ADR-169; **built at the API, ADR-415**). **The email address is what an admin, a manager/analyst and a read-only viewer sign in with (ADR-409): among those who aren't archived no two have one address, whatever its capitals (the exclusion `user_sign_in_email_once`, ADR-415); a monitor's is no key.** **Built (ADR-315):** no read-only viewer reads either: the read-only login has no grant on `user` at all |
| **createdAt** | instant | |
| archivedAt | instant | **The firm's last admin stays (ADR-415):** an admin in service is never archived, or made another role, while no other admin is in service (the trigger `user_last_admin`) |
| ~~*Phase 2:* passwordHash, twoStepSecret, lockedUntil…~~ | | **Built apart from the person (ADR-397):** sign-in's columns are `UserCredential`'s, below, so nothing that reads a person reads a secret with them |

#### `UserCredential`

*Configuration, with its own guards; built (task 2.2.1, ADR-397; agent default).* What sign-in
keeps of one person: one row a person, table `user_credential`. **Only the API reads it**: the
worker, which reads people, holds nothing on it, and no read-only viewer reads it.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **userId** | → `User`, unique | Whose it is; never changes. Never the system actor, which never signs in (check; ADR-273, C21) |
| passwordHash | text | Argon2id, as a PHC string, and nothing else (check); none until a password is set. Keyed with a secret of the API's that is never in the database: the string names the key, never holds it (ADR-411). **Kept out of the audit log** |
| twoStepSecret | text | The authenticator app's secret (ADR-170), **only as the API sealed it** (AES-256-GCM under a key drawn from the API's signing secret, bound to this person, written `v1.…`; a check refuses anything else, and a blank); none until the person has proved a code from it. **Kept out of the audit log** (task 2.2.4, ADR-412) |
| **twoStepLastStep** | whole number | The thirty-second step of the last authenticator code taken from this person: no code of that step or an earlier one is taken again, so a code is good once. Never below nought, and none without a secret (checks) (task 2.2.4, ADR-412) |
| lockedUntil | instant | Sign-in refuses the person until then: the wait that wrong tries put on the login, which is over by itself (ADR-409) |
| **failedSignIns** | whole number | Wrong tries in a row since the last sign-in that worked or the last password set; never below nought (check). At the policy's count (`SIGN_IN_TRIES_BEFORE_LOCK`) the login is locked until its password is set anew (task 2.2.3, ADR-409) |
| **passwordChangeRequired** | bool | Somebody else set this password: its owner sets their own at their next sign-in, before anything else (task 2.2.3, ADR-410). False unless set |
| offlineSeed | text | A monitor's **offline seed** (ADR-449 (5), 454; agent default): what a phone's login-list entry for them is made from, since no phone can compute the keyed hash above. Argon2id of the password under a salt of its own with no key, **only as the API sealed it** (AES-256-GCM, bound to this person, written `v1.…`; a check refuses anything else), and only beside a password (check). Made when a monitor's password is set and at an online sign-in where there is none; **never outlives its password** (a trigger refuses a password changed with the seed left as it was). Nobody but a monitor has one. **Kept out of the audit log** (task 2.5.3 part 4) |
| **createdAt** | instant | |

Audited in the security domain: a change of a secret column writes an audit record that names
the column and holds `[kept out of the audit]` in place of its value, before and after (AC-10-11).
Never deleted; a secret is taken away by clearing it.

#### `Session`

*Configuration, with its own guards; built (task 2.2.1, ADR-398; agent default).* One sign-in to
the back office or the portal, **or a monitor's on a phone** (⚠️ ADR-443, an agent default awaiting
approval: task 2.5.2). **Only the API reads it.** A phone's own proof of itself keeps no row
(ADR-440); the monitor signed in on it does.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **userId** | → `User` | Whose it is; never changes. Never the system actor (check) |
| **refreshTokenHash** | text, unique | The SHA-256, as 64 lower-case hexadecimal digits, of the refresh token in force, and nothing else (check): the server never holds the token (AC-10-10). Rotating the token writes the new hash over the old. On a monitor's session on a phone, the hash of its session token, which never rotates (ADR-443). **Kept out of the audit log** |
| deviceId | → `Device` | The phone a monitor signed in on (ADR-443). **A monitor's session always names one, and no other session does** (trigger): a monitor's ID and password open nothing but a phone (AC-02-39). Opened only for a monitor not archived, on a phone in service whose key stands, written as that monitor from that phone (trigger); never changes |
| masterPasscodeSession | enum `MasterPasscodeSession` | `AS_MONITOR` · `TEMPORARY`: opened under the master passcode, with a connection, as the phone's monitor or as the temporary session (⚠️ ADR-462, an agent default awaiting approval). Empty on a person's own sign-in. **Only a session on a phone has it** (check). **A marked one is written only as the master passcode's actor for that phone, and that actor writes no unmarked one** (trigger); never changes |
| **createdAt** | instant | When they signed in; never changes |
| **expiresAt** | instant | After `createdAt` (check). The policy's quiet minutes after its last use (`SESSION_INACTIVITY_MINUTES`), moved on by each refresh, and never later than the policy's hours after `createdAt` (`SESSION_OVERALL_HOURS`) (task 2.2.3, ADR-408). On a phone: `MONITOR_SESSION_HOURS` after `createdAt`, never moved, and quiet doesn't end it (ADR-443); a temporary session under the master passcode, the end of the project's day where that comes first (ADR-462) |
| revokedAt | instant | Signed out, or ended by the server: its refresh token was presented a second time, or the person's password was set anew (ADR-408, 410); on a phone, also another monitor signed in on it (ADR-443), a session opened on it under the master passcode, or a monitor switch the phone reported (ADR-462). **Once set, the row never changes again** (trigger): no rotation, no second life |

Audited in the security domain: the audit log shows a session opened, each rotation (that the
hash changed, never a hash) and the revocation, each with its actor and request.

#### `SecurityEvent`

*Its own record, added and never edited; built (task 2.2.1, ADR-399; agent default).* Something
sign-in or a phone's setup saw that changes no other record: a sign-in, a wrong try, a lockout,
a use of the master passcode (ARCHITECTURE §6; REQ-202b). **The database copies each into the
audit log's security domain** as it does every insert, so a security event is in the same log as
every other change (§7) and is never among a billing reviewer's entries (AC-10-19). **Only the
API reads the table**; who is shown them on a screen is the back office's (Phase 4).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **kind** | enum `SecurityEventKind` | `SIGN_IN` · `SIGN_IN_FAILED` · `LOCKOUT` · `TWO_STEP_SET_UP` · `TWO_STEP_CLEARED` (ADR-412) · `DEVICE_SETUP` · `DEVICE_SWITCH` · `MASTER_PASSCODE_USE` · `MASTER_PASSCODE_FAILED` · `MASTER_PASSCODE_LOCKOUT` (a wrong try at the master passcode and the lock, ADR-439) · `DEVICE_TURN_IN` (a phone turned in, its key revoked, ADR-488) · `DEVICE_KEY_REVOKED` (a lost phone's key revoked after the firm's time, by the worker, ADR-530) (REQ-202b's list; a task that needs another adds it) |
| userId | → `User` | Who it is about: the person a try named, when the firm has such a person. Never the name that was typed |
| deviceId | → `Device` | The phone, when it happened on one |
| requestId | text | The API request it happened in; never blank (check) |
| **occurredAt** | instant | When it happened (a phone's own time, for what a phone logged and synced) |
| deviceUtcOffsetMinutes | int | **Only where a phone reported it (ADR-457):** its clock's offset, so only with `deviceId` (check). `createdAt` is then when the server received it |
| masterPasscodeSession | enum `MasterPasscodeSession` | **Only on a `MASTER_PASSCODE_USE` a phone reported, for a monitor (ADR-464; check):** which way a session was opened on the phone with no connection, `AS_MONITOR` or `TEMPORARY`. One opened with a connection says it on its `Session` row |
| **createdAt** | instant | When the server wrote it |

**One a phone reported** (it carries an offset) is what was done on that phone under the master passcode: the database lets it be written only as the master passcode's actor, from a phone, naming that phone (trigger, ADR-464). The first event of a use a phone logged takes the id the phone gave it, so the same report sent again is kept once.

**Who wrote it** is the audit record's actor, as for every write: an event with nobody stated is
refused. **Who that is when nobody is signed in yet** (a wrong try, a use of the master
passcode) is decided with the endpoints that write them (tasks 2.2.3 and 2.5.1; REQ-209; BACKLOG
C88). No caller's address is kept (C85: task 2.2.6 decides whether one is).

#### `UserPermission`

*Configuration.* What a manager/analyst is granted (ADR-050). *Agent default:* the list is part
02's, with setup, dispatch and hours added because those pages give them to "a manager/analyst with
permission"; an admin needs none.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **userId** | → `User` | Unique with `permission`. Never the system actor (check) |
| **permission** | enum `Permission` | `CORRECT` · `RENUMBER` · `VOID` · `ACCEPT_FLAG` · `QC` · `LOCK_INVOICED` · `UNLOCK_INVOICED` · `APPROVE_HOURS` · `SETUP` · `DISPATCH` · `VIEW_REVIEW` · `VIEW_SETUP` · `VIEW_DISPATCH` (the three views, ADR-539: what the back office reads, granted apart; an act needs its area's view) |
| **createdAt** | instant | |
| archivedAt | instant | **Taken away by archiving, given back by clearing it**: never deleted, never a second row (*agent default*, ADR-315) |

**Built (ADR-315).** Who granted or took it away is the audit record's actor; audited in the
security domain. Whether the person is a manager/analyst is the API's to check (a row on anyone
else grants nothing): the database doesn't tie a grant to a role, so a role can change.

#### `ViewerProject`

*Configuration, built (ADR-315).* The projects a read-only viewer may see. Row-level security
reads it (ADR-169). **Its table is `user_viewer_project`**: `viewer_project` is the project's
viewer view (ADR-270; C54).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **userId** | → `User` | Unique with `projectId`. Never the system actor (check) |
| **projectId** | → `Project` | |
| **createdAt** | instant | |
| archivedAt | instant | A project is taken away by archiving (*agent default*, ADR-315) |

**How row-level security reads it (ADR-315).** The API states only **who is looking**
(`adms.viewer_id`, C22); the database reads the rest from that person's own record: they must be a
read-only viewer who isn't archived; their projects are their `ViewerProject` rows that aren't
archived; a client user or an auditor sees the whole of those projects; a contractor user only its
`contractorId`'s transactions and tickets (below). Anyone else stated, or nobody, sees nothing.

**What a contractor user sees of tickets (ADR-169, 358; built, ADR-361, task 1.7.3).** Whose work
a ticket is, is told in one place: **the certification its field events found**. A contractor user
sees, in the projects it is given: the certifications that name its contractor, as the prime (so a
prime sees its subs') or as either tier of sub, with their boxes and helpers, never the driver's
phone or licence number; the field events that found one of those, with their item lines and
carried tickets; a completed load or haul-out with its disposal event, and a property's or a
pile's row with its collection event; a scale receipt one of its field events points at; the
photographs' records of those field events, certifications and receipts; its own place on the
project and, a prime, its subs', and those contractors by name; and its own contractor's
transactions, as the prime or the operating sub. **A field event whose badge found no
certification is no contractor's** (fail closed). It sees **no flag, no monitor, no ROE, form or
quarantined record** (*agent defaults*). A table says which rows are a contractor user's own in
its one line, and every rerun of that line repeats it: `SELECT guard_viewer('field_event',
'PROJECT', own => 'EXISTS (SELECT 1 FROM public.certification WHERE certification."id" =
field_event."certification_id")');`. The question is asked as the viewer, so one that looks in
another viewed table is answered by that table's own policy.

**A line's money (the user, 2026-10-06; ADR-361).** A transaction's `rate` and `amount` are the
prime's price with the client. They are in no `viewer_transaction` view and the read-only login
holds no grant on them; `viewer_transaction_money` (the line's id, its project, its rate and
amount; the owner's rights, as a citizen view) shows them to a client user, an auditor and **the
contractor user of the line's own prime**. A sub's contractor user reads its lines' pay item and
quantity and no money.

**The names a ticket is read with (ADR-361, *agent default*).** Three views, the owner's, show
every viewer given a project, a contractor user included: `viewer_pay_item_name` (id, project,
code, description), `viewer_disposal_site_name` (id, project, name) and `viewer_debris_type_name`
(the form's entry's id, the project, the debris type's name). Nothing else of setup is a
contractor user's.

**What a viewer sees of setup (ADR-315; C54).** A client user and an auditor: their projects'
whole setup, through one viewer view per table (`viewer_<table>`), each with row-level security,
and the project with its settings through `viewer_project_setup`; the firm's lists; the client,
the declaration event and the contractors their projects name, **without any contact name, email
or phone**, a client's notes, or a map's uploaded file key. A contractor user: the project's name,
time zone and dates (`viewer_project`), and nothing else of its setup (*agent defaults*) but its
own place on the project and the three names above (ADR-361). A new
setup table is given its viewer sight in one line, `SELECT guard_viewer('<table>', '<PROJECT|
PART_OF|NAMED_BY|FIRM>'[, …]);`. No viewer reads a person, a permission, a phone, an assignment,
a number block, the master passcode, or any of sign-in's records (ADR-397…399).

**Private citizens by name (ADR-328 (4); built, ADR-336).** Whether a viewer reads the columns that
name a private citizen is the firm's choice for each viewer (`User.seesPrivateCitizens`). Today
those columns are an ROE's `ownerName` and a drop-off log's `residentName` and `originAddress`
(*agent default*). They are in no `viewer_<table>` view and the read-only login holds no grant on
them; each such table has a second view, `viewer_<table>_citizen` (the row's id, its project,
those columns), which runs with the owner's rights and shows a row only to a client user or an
auditor of its project whose record says they see private citizens
(`viewer_sees_private_citizens()`). A table says which columns they are in its one line:
`SELECT guard_viewer('roe', 'PROJECT', citizen => ARRAY['owner_name']);`. A contractor user sees
neither table (ADR-361, *agent default*: ROEs and forms stay unseen unless the user says otherwise).

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
| outOfServiceAt | instant | Work made after it arrives flagged (ADR-134); may be stated by hand, never after now nor before enrolment (ADR-530) |
| outOfServiceMarkedAt | instant | **Built (ADR-530):** when it was last marked lost or retired; the firm's time for its key runs from here. Set exactly while it is out of service (check) |
| outOfServiceReasonId | → `Reason` | **Built (ADR-530):** why, from the firm's reasons list (use `PHONE_REMOVAL`), where one was picked; only while out of service (check) |
| keyRevokedBy | enum `DeviceKeyRevocation` | **Built (ADR-530):** `TURN_IN` · `FIRM_TIME`, set exactly when `keyRevokedAt` is (check). `FIRM_TIME`: written by the worker as the system actor, only for a phone out of service, only once the firm's hours have passed since its mark by the database's clock and while the firm's record isn't off, with no block still issued; such a phone may then be turned in once (moved to `TURN_IN`, its time kept), nothing else of it changing, and still answers a challenge. `TURN_IN`: as below, final |
| keyRevokedAt | instant | **Built (ADR-315):** when its key was revoked, as a lost or retired phone is told to wipe at its turn-in (ADR-495); only on a phone out of service, never before its removal time (check). Refusing the key is the API's, built (ADR-440): a phone with one proves nothing and its token stops at once. **Set by the phone's turn-in alone (ADR-488):** as the master passcode's actor for that phone, once every record it holds is on the server and it holds no block still issued; never at enrolment, and never changed after, nor its status or removal time; a phone with one is issued no block (the guard migration). It is set as the phone is told to wipe, not after (the user kept that moment: KD-77 closed, ADR-495) |
| lastAnsweredChallengeMadeAt | instant | **Built (ADR-440):** when the server made the last challenge this phone proved itself with; a challenge is good once, so only one made later is taken. Written by that phone's own proof alone (the device key's actor, for that phone), only ever later, never once the key is revoked (the guard) |

#### `FirmSettings`

*Configuration, built (ADR-530; REQ-214, 215).* The firm's own settings for the whole installation: **one row**, `id` 1 (check). Written once by the seed from the release's policy values; changed by the API alone (never another row added), audited in the security domain; read by the worker.

| Field | Type | Notes |
|---|---|---|
| **id** | int | Always 1 |
| phoneKeyRevokedAfterHours | int | Hours a phone marked lost or retired keeps its key, from its last mark; 1…8,760, or null for off (check). Starts at `PHONE_KEY_REVOKED_AFTER_HOURS` (24; 0 starts it off). An admin or a manager/analyst holding Setup changes it |
| **viewerTwoStepRequired** | boolean | Whether a read-only viewer must use two-step sign-in (ASVS 6.3.3); false as shipped (ADR-170). An admin alone changes it |
| monitorSessionHours | int | **Built (ADR-531):** hours a monitor's sign-in on a phone lasts; 1…24 (check); 24 as shipped. An admin alone changes it |
| reportContactEmail | text | **Built (REQ-410):** the address printed on the daily report's last page for a reader who wants to be added to its list; none prints none. An admin or a manager/analyst holding Setup changes it |
| **brandName** | text | **Built (the user, 2026-10-22):** what the firm calls its ADMS, shown on every screen and in what the server writes for its people and clients (the daily report, its mail), beside "Built on Open ADMS <version>" (the licence attribution; the release is the root `package.json`'s). Trimmed, 1…40 characters, no control character (check); `Open ADMS` until the firm names it: the installer asks at the first run (default `<firm> ADMS`) and hands it to the seed. Read by anybody through the public brand read (`GET /brand`: this name and the release, nothing else). An admin or a manager/analyst holding Setup changes it |

#### `MasterPasscode`

*Configuration, as built (ADR-281, 542).* A version, its keyed slow hash and its sealed offline seed, read only by the API; never edited but to key the installer's verifier and write its seed, each once (ADR-542).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **version** | int, unique | |
| **hash** | text | Argon2id, keyed with the API's password key (the installer's first version keyed at its first right use). Kept out of the audit log (§7) |
| offlineSeed | text | The first slow hash of the passcode under its own salt, sealed with the API's sealing key and bound to the version: what a phone's check is made from and an offline sign-in under it proven against (ADR-542). None until the API first has the passcode in hand. Kept out of the audit log |
| **createdAt** | instant | |

#### `MasterPasscodeTries`

*Its own record, built (task 2.5.1 part 2, ADR-438, 439; agent default).* Wrong tries in a row at one
version of the master passcode, since a version is never edited. One row a version, written at its
first wrong try; a new version has none, so changing the passcode opens the lock. Read and written
only by the API; audited in the security domain; never deleted.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **version** | int, unique → `MasterPasscode.version` | Never changes |
| **failedTries** | int | Wrong tries in a row since the last right one; never below nought (check) |
| lockedUntil | instant | The passcode is refused until then |
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
| **formDocumentTypes** | `FormDocumentType[]` | The forms they may make: ROEs, surveys, incidents, drop-off logs (C42). **Built (ADR-308):** a check holds it to those four (a ticket's kinds are `fieldEventKinds`, certifying is `certifying`); none is an empty list |
| siteId | → `DisposalSite` (same project) | One site, where the work is at one |
| deviceId | → `Device` | Named on the board, or the phone that took it |
| **origin** | enum `AssignmentOrigin` | `PLANNED` (with its author) or `UNPLANNED` (no author, always its phone) |
| madeById | → `User` | The author of a planned one |
| madeAt | instant | **An unplanned one only (ADR-457):** when it was made, by the phone's clock |
| deviceUtcOffsetMinutes | int | An unplanned one only: that clock's offset, UTC−12:00 to UTC+14:00 (check) |
| receivedAt | instant | An unplanned one only: when the server received it; never changes |
| **createdAt** | instant | |
| archivedAt | instant | Withdrawn by archiving; never expires; put back by clearing it (ADR-527) |
| withdrawalNote | text | Why it was withdrawn, as the dispatcher wrote it, 500 characters at most; on a withdrawn one only, cleared when it is put back (check; ADR-527) |

**An unplanned one is what its phone reported (built, ADR-457; agent defaults).** The database
takes one only as the master passcode's actor, for a phone, naming that same phone; whether an
assignment was planned never changes; one written on the board has none of the three times. Its
`workDate` is the day its phone's clock said, in the project's time zone.

#### `AssignmentPayItem`

*Configuration, built by ADR-286.* The unit rate pay items a person does that day (ADR-127, 240).

| Field | Type | Notes |
|---|---|---|
| **assignmentId** | → `Assignment` | Of the assignment's own project |
| **payItemId** | → `PayItem` | Of the assignment's own project |
| **kindOfWorkId** | → `KindOfWork` | The pay item's, again, held to it by a three-column foreign key (project, pay item, kind of work): only a unit rate pay item can be named, and a named one keeps its kind of work (C42; *agent default*, ADR-309) |
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
| `KindOfWork` | **countShape** enum (`NUMBER` · `ITEM_COUNTS` · `ITEM_HOURS`); **photosByStage** boolean, false unless stated (whether its tickets' photographs are taken by stage, before, the measurement and after; on as shipped for Hangers, Leaners and Stumps; set when added and changed later; the user, ADR-590) | `STUMPS` (ADR-198) |
| `ItemName` | **kindOfWorkId** | |
| `VehicleType` | **certifies** enum `CertificationKind` (`CONTAINER` · `CREW`; the set a certification's `kind` uses, ADR-302) | |
| `VehicleFeature` | | |
| `CrewType` | | |
| `SiteType` | | `TDSR` (a haul-out dumped at one, ADR-226) · `FINAL_DISPOSAL` (the optional receipt number, ADR-227) |
| `SiteLabel` | | |
| `IncidentType` | | |
| `IncidentSubType` | **incidentTypeId** | |
| `Reason` | **uses** `ReasonUse[]` (`VOID` · `TYPED_NUMBER` · `ACCEPT_FLAG` · `BACK_OFFICE_RECORD`, ADR-173 · `PHONE_REMOVAL`, ADR-530) | |
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
| closedAt | instant | Set by an admin's close, by hand (ADR-529 (b)): the project is read-only after, held by the database (`project_open_guard()` on its tables and the records under them; a viewer's grant, a held record, a file set aside and a photograph kept with a held record still written); cleared only by an admin's reopening, with a reason (`adms.reason`), nothing else changing with it. A second close keeps the first |

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

*Configuration, built (ADR-308).* A project's form for one document type (ADR-211).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | Unique with `documentType`, archived forms included: at most one form of each on a project |
| **name** | text | |
| **documentType** | enum `FormDocumentType` | `LOAD` · `HAUL_OUT` · `UNIT_RATE` · `CERTIFICATION` · `ROE` · `SURVEY` · `INCIDENT` · `DROP_OFF_LOG`. Also unique with `id`: the key a debris type's entry and a definition point at, so neither sits on the wrong kind of form and the type can't change under them |
| gpsRequired | bool | The ROE form's setting (ADR-181): stated on it, and on no other form (a check, ADR-308) |
| incidentOffers | enum `IncidentOffer`[] | The incident form's setting (ADR-328, 334): which of the contractor involved, a cert number and an ROE number an incident offers the project's monitors. Stated on the incident form, an empty list for none, and on no other form (a check). A new one starts with `CONTRACTOR` and `CERT_NUMBER`, and `ROE_NUMBER` where the program type requires ROEs (`packages/domain`'s `IncidentOffers`, *agent default*) |
| **createdAt** | instant | As every configuration record (§1, *Leaving*) |
| archivedAt | instant | |

#### `FormDebrisType`

*Configuration, built (ADR-308).* A debris type added to a load or haul-out form (ADR-211, 214).
**A field event points at this entry** (built, ADR-325), so a rule's *Debris type* matches the
exact entry (ADR-226). What a phone's list offers (not archived, not hidden) and setup's warning for
an entry not marked *Reduced* on the haul-out form are `packages/domain`'s `DebrisTypeEntries`.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **formId** | → `Form` | Unique with `debrisTypeId` |
| **documentType** | enum `FormDocumentType` | Its form's, again: `LOAD` or `HAUL_OUT` (a check), held to the form's own by a two-column foreign key with `formId` (ADR-308) |
| **debrisTypeId** | → `DebrisType` | The firm's library value |
| **reduced** | bool | No default |
| reductionMethodId | → `ReductionMethod` | |
| **hiddenOnPhones** | bool | No default |
| **createdAt** | instant | |
| archivedAt | instant | Taken off the form; put back by clearing it |

#### `FormDefinition`

*Configuration, built (ADR-308).* The firm's added fields on a survey, ROE, incident or drop-off log
form (ADR-160, 278): **per project form** (reuse across projects is "copy from a past project",
ADR-228). A change is a new version; a version is never edited or deleted: the API may only add and
read one, and a trigger refuses an edit by anyone (`refuse_edit`).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **formId** | → `Form` | |
| **documentType** | enum `FormDocumentType` | Its form's, again: `ROE`, `SURVEY`, `INCIDENT` or `DROP_OFF_LOG` (a check: the four records with an `answers` column), held to the form's own by a two-column foreign key with `formId` (ADR-308) |
| **version** | int | From 1; unique with `formId` |
| **fields** | JSONB | A list (a check): each field's stable id, label, type (`TEXT` · `NUMBER` · `YES_NO` · `PICK` · `PHOTO`), required, and a pick's choices. The shape is `packages/contracts`' `formDefinitionFields` (ids once each; choices on a pick only) |
| **createdById** | → `User` | |
| **createdAt** | instant | |

### Pay items and rates

#### `PayItem`

*Configuration, built (ADR-309).* A priced line; **the only place a rate lives**.
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
| bandFrom, bandTo | decimal(8,1) | The size band, in inches, both ends included; either may be open ("24 in and up"). Never below nought, the from no more than the to (a check). Bands of one payable type never overlap: setup refuses, by the domain's `SizeBands`, and warns of a gap (ADR-217, 309); the database refuses an overlap too, by an exclusion constraint (ADR-310) |
| **countIsAlwaysOne**, **gpsRequired**, **measurementRequired**, **decimalsAllowed**, **photosRequired**, **monitorMayMarkIneligible**, **quantityFromCarriedTickets** | bool | The capture settings (ADR-157, 192, 207, 210); no default, so every writer states each (ADR-303, 309) |
| crewTimeConversion | enum `CrewTimeConversion` | `PER_HOUR` · `PER_DAY_EXACT` · `PER_DAY_STEPS` (ADR-087). Set on an `HR` pay item (`PER_HOUR`) or a `CREW_DAY` one (either day conversion), and on no other (a check, ADR-309) |
| crewDayHours | decimal(4,2) | The day length on a `PER_DAY_EXACT` pay item, and only there (a check): more than 0, at most 24. A new one starts at the policy value `CREW_DAY_HOURS`, 12 (ADR-087, 309) |
| **createdAt** | instant | |
| archivedAt | instant | |

#### `PayItemCrewDayStep`

*Configuration, built (ADR-309).* The steps of a crew day paid in steps (1.5–4.5 h = 0.25…). Read
only on a `PER_DAY_STEPS` pay item.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **payItemId** | → `PayItem` | A step's from hours once per pay item (unique) |
| **fromHours**, **toHours** | decimal(4,2) | Both included; 0 ≤ from ≤ to ≤ 24 (a check; *agent default*, ADR-309) |
| **quantity** | decimal(14,4) | What the step bills, nought or more (a check) |
| **createdAt** | instant | |
| archivedAt | instant | |

#### `PayItemRate`

*Configuration, built (ADR-309).* One rate for each prime, never a copy of the pay item (ADR-206).
No row = no rate for that prime (a $0 line, flagged, ADR-212). A rate's history is the audit log.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | The pay item's: both its relations name it (ADR-305, 309) |
| **payItemId** | → `PayItem` | Unique with `primeId`; of the same project (a two-column foreign key) |
| **primeId** | → `Contractor` | One of the project's primes, held by a two-column foreign key to `ProjectContractor (projectId, asPrimeId)` (ADR-305): never a sub, nor a contractor not on the project |
| **rate** | decimal(14,4) | Nought or more (a check) |
| **createdAt** | instant | |
| archivedAt | instant | Takes a prime's rate off; cleared, it's back (*agent default*, ADR-309) |

### Rules (`spec/RULES.md`)

#### `Rule`

*Configuration, built (ADR-313).* `spec/RULES.md` §2. "Is valid" is computed, never stored
(`packages/domain`'s `RuleValidity`): a rule that isn't valid is saved all the same and never runs.
An exact copy of another rule is refused by setup before it is saved, and two rules that add the
same # on a ticket both could meet are warned of (`ProjectRules`; ADR-125, 301).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | |
| **formId** | → `Form` | One of its own project's load, haul-out or unit rate forms: one three-column foreign key (project, form, document type) |
| **documentType** | enum `FormDocumentType` | Its form's, again: `LOAD` · `HAUL_OUT` · `UNIT_RATE` (a check; ADR-308's idiom, ADR-313) |
| **name** | text | The firm's free text; a blank one is saved and not valid |
| contractId | → `Contract` | One of its own project's contracts (a two-column foreign key). Empty only on a rule with no *Add transaction* (ADR-239); an *Add* with none is saved and not valid |
| **active** | bool | No database default |
| fromPayItemId | → `PayItem` | Written by that pay item's "Pays when" and edited only there (ADR-229): its own project's; setup refuses a change made in the rule builder |
| **createdAt** | instant | |
| archivedAt | instant | |

#### `RuleCriterion`

*Configuration, built (ADR-313).* One line of a rule's "ifs". Real columns, never JSON: the engine
reads them. Which criteria a form takes is `packages/domain`'s `RuleCriteria` (a line that doesn't
apply to its form is saved, and makes the rule not valid).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **ruleId** | → `Rule` | With `projectId` and `formId`, the rule's again (a three-column foreign key), so a pick is held to the rule's own project and form |
| **position** | int | From 1, once per rule |
| **criterion** | enum `RuleCriterionKey` | §9 |
| **operator** | enum `RuleOperator` | §9. Only one its criterion's kind of value takes (a check; `spec/RULES.md` §4a): an *Item* line compares the count of the one item picked, so it takes the number operators |
| numberFrom, numberTo | decimal(14,4) | The typed value, where it is a number; the "to" only on BETWEEN, never below the "from" (a check) |
| dateFrom, dateTo | date | The typed value, where it is a date; likewise |
| text | text | The typed value, where it is text; never blank |
| **createdAt** | instant | |
| archivedAt | instant | Takes the line off its rule (ADR-313) |

A value sits only in the columns of its criterion's kind; IS EMPTY and IS NOT EMPTY take none (a
check).

#### `RuleCriterionPick`

*Configuration, built (ADR-313).* One row per picked value of a criterion.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **criterionId** | → `RuleCriterion` | With `projectId`, `formId` and `criterion`, the line's again (a four-column foreign key): a line's criterion can't change under its picks |
| contractorId | → `Contractor` | **Exactly one** of these eight is filled, the one its criterion picks from (a check). A contractor on the rule's project (`ProjectContractor`) |
| formDebrisTypeId | → `FormDebrisType` | An entry of the rule's own form |
| fieldTagId | → `FieldTag` | The rule's project's |
| disposalSiteId | → `DisposalSite` | The rule's project's; a *Disposal site* or a *From site* line's |
| siteTypeId | → `SiteType` | |
| payItemId | → `PayItem` | The rule's project's |
| itemNameId | → `ItemName` | |
| zoneName | text | A zone is matched by name, since map versions change; never blank. That the name is on the project's current map is setup's to say (ADR-141 (6)) |
| **createdAt** | instant | |
| archivedAt | instant | |

#### `RuleAction`

*Configuration, built (ADR-313).* What happens to a ticket that meets every criterion.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **ruleId** | → `Rule` | With `projectId`, the rule's again (a two-column foreign key) |
| **kind** | enum `RuleActionKind` | `ADD_TRANSACTION` · `REMOVE_TRANSACTION` · `VOID_TICKET` |
| slot | int | On add and remove, 1 or more; never on void (a check). A missing one is saved and makes the rule not valid |
| payItemId | → `PayItem` | On add only (a check); the rule's project's |
| quantityFrom | enum `QuantityFrom` | `ALL_ITEMS` · `CHOSEN_ITEMS` (ADR-128). Stated on every add, and on nothing else (a check) |
| **createdAt** | instant | |
| archivedAt | instant | |

#### `RuleActionItem`

*Configuration, built (ADR-313).* The chosen items of an action whose quantity is from chosen items.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **actionId** | → `RuleAction` | |
| **itemNameId** | → `ItemName` | Once per action |
| **createdAt** | instant | |
| archivedAt | instant | |

### Sites and the map

#### `DisposalSite`

*Configuration, built (ADR-311).* Entered on each project that uses it (ADR-145).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | |
| **name** | text | "Bayline County Landfill" |
| shortCode | text | `BCL`: what setup offers in a suggested pay item code (*agent default*) |
| **siteTypeId** | → `SiteType` | What *Disposal site type* tests |
| siteTypeKey | text | The type's built-in key, again, where it has one (`TDSR`), held to the type's own by a two-column foreign key to `site_type (id, key)` (ADR-311, *agent default*) |
| **takesLoads**, **haulOutsLeaveHere**, **chargesTippingFee**, **ineligibleSite** | bool | The four site facts (ADR-215); no default. `haulOutsLeaveHere` only on a site whose type is the built-in TDSR/DMS: setup refuses it elsewhere, and so does the database, by a check on `siteTypeKey` (ADR-298; C52 settled by ADR-311) |
| permitNumber | text | Empty = "permit outstanding", flagged, never blocking (ADR-111) |
| **latitude**, **longitude** | decimal(38,8) | Entered with the site; where mileage ends (ADR-208); on the earth (a check) |
| **activationDate** | date | ADR-173 |
| closeDate | date | Never before the activation date (a check) |
| **createdAt** | instant | |
| archivedAt | instant | |

*Changed 2026-10-02 (ADR-311; KD-67), **confirmed by the user (ADR-312)**:* the single `tippingFeePayItemId` this page had is
`DisposalSiteTippingFee` below, so a site keeps every fee pay item written from it (ADR-222's
"Service(s)": per CY and per ton, ADR-202).

#### `DisposalSiteLabel`

*Configuration, built (ADR-311).* A site's own labels; once each, archived and put back.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **siteId** | → `DisposalSite` | |
| **siteLabelId** | → `SiteLabel` | |
| **createdAt** | instant | |
| archivedAt | instant | |

#### `DisposalSiteTippingFee`

*Configuration, built (ADR-311).* A tipping fee pay item written from a site that charges one: the
link that tells a fee line (ADR-222). Several per site; once per site and pay item; audited in
billing.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | Holds the site and the pay item to one project (two-column foreign keys) |
| **siteId** | → `DisposalSite` (same project) | |
| **payItemId** | → `PayItem` (same project) | |
| **createdAt** | instant | |
| archivedAt | instant | |

#### `SiteAreaVersion`

*Configuration, built (ADR-311).* A site's own shape (the advanced area); dated and kept, **never
edited or deleted**. A site with none uses the project's circle (ADR-142, 144).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **siteId** | → `DisposalSite` | |
| **version** | int | From 1; once per site |
| **geometry** | geometry | A Polygon or MultiPolygon (§1) |
| **westLongitude**, **southLatitude**, **eastLongitude**, **northLatitude** | decimal(38,8) | The shape's bounding box (§1) |
| **source** | enum `SiteAreaSource` | `DRAWN` · `UPLOAD` · `ESRI_LAYER` (ADR-527) |
| sourceName | text | The file's name, or the Esri layer's address; stated on an `ESRI_LAYER` one (check; ADR-527) |
| uploadedFileKey | text | Where the file it came from is kept; never shown to a viewer (ADR-527) |
| **createdById** | → `User` | |
| **effectiveFrom** | instant | When it was saved: the site's area until its next version |

#### `MapVersion`

*Configuration, built (ADR-311).* A project's boundary and zones as loaded. **Never edited or
deleted** (ADR-135, 141).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | |
| **version** | int | From 1; once per project |
| **source** | enum `MapSource` | `UPLOAD` · `ESRI_LAYER` · `DRAWN` |
| sourceName | text | The file's name, or the Esri layer's address |
| zoneNameField | text | |
| **boundary** | geometry | A Polygon or MultiPolygon (§1) |
| **westLongitude**, **southLatitude**, **eastLongitude**, **northLatitude** | decimal(38,8) | The shape's bounding box (§1) |
| uploadedFileKey | text | Where the file it came from (or the Esri boundary layer's copy) is kept; never shown to a viewer |
| zonesSourceName | text | The zones' Esri layer, on a map fetched from Esri with zones, named in `zoneNameField` (check; ADR-527) |
| zonesFileKey | text | Where that layer's copy is kept; only with `zonesSourceName` (check); never shown to a viewer (ADR-527) |
| **loadedById** | → `User` | |
| **loadedAt** | instant | When it was saved: **the database's own time**, never the client's (`dbgenerated`), since the guard that takes a zone only with its version compares it with the transaction's (ADR-316, KD-68) |

#### `Zone`

*Configuration, built (ADR-311).* One zone of a map version (ADR-135, 141). **Never edited or
deleted, and written only with its version**, in the same piece of work.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **mapVersionId** | → `MapVersion` | |
| **name** | text | Once per version: features of one name are one zone, a MultiPolygon |
| **geometry** | geometry | A Polygon or MultiPolygon (§1) |
| **westLongitude**, **southLatitude**, **eastLongitude**, **northLatitude** | decimal(38,8) | The shape's bounding box (§1) |

### Numbering

The server is the only allocator (ADR-065). **✅ Built 2026-10-03 (ADR-323)** as below.

#### `ProjectNumberSeries`

*Configuration.* A project's series of numbers; unique on project + series. The model is not named
`NumberSeries`: that is the built enum its `series` field uses (ADR-292). A project that generates
its ticket numbers has one per workflow; one numbered from control tickets has only `UNIT_RATE`
(ADR-056). A ticket series runs from 100,001 to 9,999,999 (a check); a cert-number or ROE series
starts where the firm says. Never archived: a series doesn't leave.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | |
| **series** | enum `NumberSeries` | `LOAD` · `HAUL_OUT` · `UNIT_RATE` · `CERTIFICATION` · `ROE` |
| **firstNumber** | int | |
| **nextNumber** | int | The next number never handed out; one past the end when a ticket series is used up |
| **createdAt** | instant | |

#### `ControlRange`

*Configuration.* Pre-printed stock (ADR-056), for loads and haul-outs only (a check). The stock's
numbers are the printer's own: not held to 100,001–9,999,999. Two ranges of one series on a
project, neither archived, never share a number (an exclusion constraint, ADR-323).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **projectId** | → `Project` | |
| **series** | enum `NumberSeries` | `LOAD` or `HAUL_OUT` |
| **firstNumber** | int | |
| **lastNumber** | int | |
| **createdAt** | instant | |
| archivedAt | instant | |

#### `NumberBlock`

*Configuration, as built (ADR-281)*, cut only from a series its project has (a foreign key to
`ProjectNumberSeries` on project + series), and **two blocks of one series never hold the same
number** (an exclusion constraint, C43, ADR-323). An issued block holds its whole run, and so does
a retired one, for good; a reclaimed block holds only what its phone used (first to last used), so
its unused rest is cut again for the next phone, once (ADR-065). Its start is therefore no longer
unique: a block handed back unused is cut again from the same number.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | |
| **deviceId** | → `Device` | |
| **projectId** | → `Project` | With `series`, → `ProjectNumberSeries` |
| **series** | enum `NumberSeries` | |
| **firstNumber**, **lastNumber** | int | A ticket series' block lies inside 100,001–9,999,999 (a check) |
| lastUsedNumber | int | |
| **status** | enum `NumberBlockStatus` | `ISSUED` · `RECLAIMED` · `RETIRED`: how it ended |
| **issuedAt** | instant | |
| endedAt | instant | |

### Certifications

#### `Certification`

*Configuration.* `adms-certifications` §3A.2: a container or a crew, never a vehicle.
**✅ Built 2026-10-03 (ADR-321)** as below. It has no `archivedAt`: replaced, revoked or QC Void, it
stays as it was made. Each sub is held to a contractor placed on the project under `primeId`
(a foreign key to `project_contractor`); "replaced on" is the new certification's `certifiedAt`,
as a day in the project's time zone; `replacesId` names a certification of the same project, once.
A helper and a box also carry `id`, `createdAt` and `archivedAt` (taken off by archiving, never the
primary box); a box repeats its certification's `kind`, so only a container holds one.

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
| createdById | → `User` | Entered in the back office from the paper sheet, its phone having failed: who entered it (ADR-521, 534). With `createdReasonId`, both or neither; never with a phone or an assignment; never changed |
| createdReasonId | → `Reason` | And why, from the firm's reasons for a record made in the back office |
| clientRepresentativeName, contractorRepresentativeName | text | Names only |
| **signaturesOnFile** | bool | Set at QC |
| replacesId | → `Certification` | A modified truck's new certification (ADR-082) |
| replacedReason | text | |
| ~~copiedFromId~~ | | Removed (ADR-328, 330): a certification is never copied; a truck on another project is certified there from scratch |
| revokedFrom | date | By an admin, with a reason (ADR-079) |
| revokedReason | text | |
| revokedById | → `User` | |
| notes | text | |

**Who did what on a certification** (ADR-294): it is **made and measured** by the certifying monitor
(`certifiedById`); **helped** by whoever that monitor picks, or nobody (`CertificationHelper`);
**audited** by the back office at QC (its `QcMark.setById`, "checked by"). One entered in the
back office from its sheet also says who entered it and why (`createdById`, `createdReasonId`;
ADR-534 (1)); its certifier is still the monitor named on the sheet. No other field says who.

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

**As built (ADR-327).** Both are configuration, audited in the records domain; the API edits an
ROE freely and nothing is deleted. An ROE's id is the phone's, or the database's for one the back
office makes; its number is kept as issued or as typed, not blank, once per project; only the
number, `signed`, `answers` and `source` are required, so an ROE can be set up with its number
alone and filled in later. **A phone's ROE** says who made it, on which phone, under which
assignment and when (with the phone's offset); **a back-office one** has no phone, assignment or
offset. It carries **no setup version** (it is setup, like a certification). A latitude and a
longitude together, on the earth, or neither. `formDefinitionId` comes with `formId` and
`formDocumentType` (`ROE`), all three or none, held by foreign keys to its own project's ROE form
and to that form's definition; **with no definition the answers are `{}`** (a form with no fields
of the firm's own has no definition to answer). A scope line repeats its ROE's `projectId`; its
debris type comes with `formId` and `formDocumentType` (`LOAD`), which hold it to its own
project's load form; a count is 1 or more; a debris type and a payable type are each once per
ROE. That a payable type is among the project's unit rate pay items is not held by the database.
**Viewers:** a client user and an auditor see their projects' ROEs and scope lines, every column but the owner's name (`viewer_roe`); the owner's name through `viewer_roe_citizen`, only where the firm lets that viewer see private citizens by name (§2.2; ADR-336).

### The time clock (Phases 3–4; ADR-241; built, task 3.7.1, ADR-598)

**No field links any of it to crew time**, and no rate or pay is held. No read-only viewer sees
any of it (ADR-241 (8)). While a day's approval is in force, nothing of its entries or lines is
changed; a phone's entry that arrives after is still taken (ADR-598).

#### `ClockEntry`

*Evidence.*

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | From the phone |
| **projectId**, **assignmentId**, **workerId** | → `Assignment` (project, id, person), and → `User` | The worker is the assignment's own person (ADR-598) |
| **deviceId** | → `Device` | The phone it was made on; written only as the worker from it |
| **kind** | enum `ClockEntryKind` | `IN` · `BREAK_START` · `BREAK_END` · `OUT` |
| **at** | instant | With its offset and `receivedAt` |

#### `ClockActivityLine`

*Evidence.*

| Field | Type | Notes |
|---|---|---|
| **clockEntryId**, **clockEntryKind** | → `ClockEntry` (id, kind) | The clock-out that carried it: kind `OUT` (ADR-598) |
| **position** | int | Its place among its clock-out's lines, from 1 |
| **startedAt**, **endedAt** | instant | The worker's, taken as sent |
| activityId | → `ClockActivity` | What the app can't know; this, or `fieldEventId` |
| fieldEventId | uuid | Pre-filled from the day's field events: **the id the phone made, no key**, kept whatever became of that field event (ADR-598) |
| note | text | Never blank |

#### `DayApproval`

*Mark.* A day has **one approval in force** (an exclusion among those not unlocked); approving
again after an unlock is a new row, so every approval is kept (as `InvoiceLock`, C17). Never the
worker's own day (ADR-598; this table was drafted as `ApprovedDay`, unique on its assignment).

| Field | Type | Notes |
|---|---|---|
| **projectId**, **assignmentId** | → `Assignment` | |
| **approvedById** | → `User` | A person, never the worker |
| **approvedAt** | instant | |
| unlockedById, unlockedAt, unlockNote | → `User`, instant, text | All three or none |

---

## 4. Evidence: what monitors saw

### 4.1 `FieldEvent`: one model, five kinds (ADR-236)

#### `FieldEvent`

*Evidence, built in part.* **There is no ticket table**: a ticket is its number and its events
(*agent default*). Its columns come in three groups. **Built: group 1 in full (ADR-324) and
group 2 (ADR-325)**, with their checks (below, and §8), `scaleReceiptId` and `roeId` with
their own tables (ADR-326, 327); and group 3 in full (ADR-340: the zone held to the map
version used, both and the worked-out pay item to the field event's own project).

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
| masterPasscodeSession | enum `MasterPasscodeSession` | Made in a session the master passcode opened, and which way: `AS_MONITOR` (signed in as the phone's monitor) or `TEMPORARY`; none in a monitor's own sign-in (ADR-462, 534 (11); AC-02-42). Only on a phone's record; `TEMPORARY` exactly when `temporarySession` |
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

**As built (ADR-324).** No new required column has a database default: whoever writes a field
event says its `source`, `temporarySession`, `numberTyped`, `certNumber` and `certKeyedByHand`.
The database refuses: a phone's record without its phone, assignment or setup version, or with a
back-office person or reason; a back-office record without its person or reason, or with a phone,
an assignment, a setup version or a temporary session; the system actor as creator; a reason on a
number that was scanned (a typed number with no reason is taken); a typed capacity on a truck not
keyed in by hand, or below nought (keyed in by hand with none is taken: a crew has none); a
certification or a site of another project; half a GPS fix, or one off the earth (no fix is
taken); an address with no source, or a source with no address. It does not check that a number
is digits, that times are in order, that the certification found has the number scanned, or that
a load is on a container's certification: those are flags, or nothing. **Viewers:** a client user
and an auditor see every column (`viewer_field_event`), and who recorded each through
`viewer_field_event_monitor` (id, name, Monitor ID; nothing else of a person).

**2. Kind-specific columns**, each empty on every other kind (a database check per column):

| Field | Type | `COL` | `DIS` | `HOC` | `HOD` | `URT` | Notes |
|---|---|---|---|---|---|---|---|
| formDebrisTypeId | → `FormDebrisType` | ✓ | ✓ | ✓ | ✓ | | Picked at each end, on its own (ADR-207) |
| formId, formDocumentType | → `Form`; enum `FormDocumentType` | ✓ | ✓ | ✓ | ✓ | | The entry's form and that form's document type, again: there exactly when the entry is. They hold the entry to the field event's own project and to its workflow's form by foreign keys (ADR-325) |
| fieldTagId | → `FieldTag` | ✓ | | ✓ | | ✓ | Optional (ADR-218) |
| roeNumber | text | ✓ | | | | ✓ | On an ROE project (ADR-149): the number as picked or typed, a snapshot like `certNumber` (Q-33; ADR-292) |
| roeId | → `Roe` | ✓ | | | | ✓ | Empty while no ROE on the project has that number (ADR-292). Built (ADR-327): one of its own project's ROEs, only on a collection and a unit rate event |
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

**As built (ADR-325).** No kind-specific column is required: a pick that didn't reach the server
is a flag's, never a refusal (as a typed number with no reason, ADR-324). The database refuses a
detail on a kind that doesn't record it (the table above, one check per group of kinds; the same
table is `packages/domain`'s `fieldEventDetails`, and a test holds the two together); a debris
type's entry that isn't on the field event's own project's form for its workflow (a load's from
the load form, a haul-out's from the haul-out form); a field tag or a pay item of another
project; **a split suffix on anything but a collection or a haul-out collection**, or one that
isn't capital letters (`A`, `B`… `AA`; kept without its hyphen); a collection with a suffix and
no estimate, or an estimate and no suffix; an estimate on any other kind, a haul-out's pile
included; a measurement without how it was read, or the reverse; a negative estimate, count,
measurement or root ball. It does not check: that a suffixed collection's project allows split
loads; that a pile's collection has its load call; that a disposal holds only one quantity (a
load call and a count together are taken); that a pay item is of the kind of work or the payable
type beside it, or that the kind of work is one the project allows; that an itemised event has no
count of its own; that a stump was measured as a diameter; that an ROE number or a survey number
is on the project. Those are flags, or nothing. **Viewers:** a client user and an auditor see the
new columns with the rest (`viewer_field_event`).

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

*Evidence, built (ADR-325).* An itemised unit rate event's lines (ADR-040, 084). Its id and
created time are the database's. Corrected in place by the API, audited in the records domain;
seen by a client user and an auditor with its field event. **A correction takes a line off by
marking it** (`archivedAt`, a time; cleared to put the line back): the row stays, and a line
taken off counts for nothing the worker reads. A carried ticket (`CarriedTicket`) has the same
mark (ADR-364, the seventy-seventh and seventy-eighth migrations; AC-08-66).

| Field | Type | Notes |
|---|---|---|
| **fieldEventId** | → `FieldEvent` | Unique with `itemNameId` |
| **fieldEventKind** | enum `FieldEventKind` | Its field event's kind, again: always `UNIT_RATE` (a check), held to the field event's own by the foreign key, so a line sits only on unit rate work (ADR-325) |
| **itemNameId** | → `ItemName` | Not held to the event's kind of work (a flag's) |
| **quantity** | decimal(10,2) | A count, or hours to the quarter hour; nought or more (a check). Quarter hours aren't held by the database |
| archivedAt | instant | Taken off by a correction; empty on a live line (ADR-364) |

#### `CarriedTicket`

*Evidence, built (ADR-325).* The tickets a load carries (ADR-192). As `FieldEventItem`: its own id
and created time, corrected in place, audited in the records domain, seen with its field event.

| Field | Type | Notes |
|---|---|---|
| **fieldEventId** | → `FieldEvent` | The collection; unique with `carriedTicketNumber` |
| **fieldEventKind** | enum `FieldEventKind` | Always `COLLECTION` (a check), held to the field event's own by the foreign key (ADR-325) |
| **carriedTicketNumber** | text | The number as written, never a link: one that matches no ticket is taken and flagged later |
| archivedAt | instant | Taken off by a correction; empty while the ticket is listed (ADR-364) |

#### `FieldEventWaypoint`

*Evidence, built (ADR-581; C180).* A waypoint a collection's monitor marked while it was open:
"Mark waypoint" records the phone's time and whatever fix it had (ADR-083, 571; Q-104), in the
order marked, at most the policy's number a collection (`FIELD_EVENT_WAYPOINTS_AT_MOST`, fifty
as shipped; the sync contract reads at most the policy's most, two hundred). As `CarriedTicket`:
its own id and created time, sent inside its field event, corrected in place by permission
(`PATCH /field-events/:fieldEventId/waypoints/:position`, *correct*: its time, its fix, taken off
and put back), audited in the records domain, seen by a client user and an auditor with its field
event, on a closed project and a ticket locked as invoiced unchanged as its field event is.
**Nothing in the engine reads a waypoint**: the zone and the mileage stay on the collection's end
GPS (ADR-135, 208), and a correction queues no ticket.

| Field | Type | Notes |
|---|---|---|
| **fieldEventId** | → `FieldEvent` | The collection; unique with `position` |
| **fieldEventKind** | enum `FieldEventKind` | Always `COLLECTION` (a check), held to the field event's own by the foreign key (ADR-325) |
| **position** | int | Its place in the order marked, from 1 (a check) |
| **markedAt** | instant | The phone's clock when it was marked; its field event's offset says how far that clock stood from UTC (ADR-100) |
| latitude, longitude | decimal(38,8) | Whatever fix the phone had: both or neither, on the earth (a check); none where it had none (ADR-083) |
| unreadableGps | json | A fix that reached the server and couldn't be one, kept as sent while the waypoint is kept without it (ADR-329 (5)); an object that holds something, or empty (a check) |
| archivedAt | instant | Taken off by a correction; empty while it stands (ADR-364) |

### 4.2 Scale receipts (ADR-034, 038)

#### `ScaleReceipt`

*Evidence.* Its own record, pointed at by one or several disposal events, consumed once. Every
weight is what the paper says, never inferred; a tandem's shares are derived, on the completed
loads (§5).

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | From the phone |
| **projectId** | → `Project` | |
| **receiptNumber** | text | The site's own, transcribed verbatim. **Never unique** (the user, ADR-328: a receipt book starts again at 001) |
| **siteId** | → `DisposalSite` | |
| grossWeightLb, tareWeightLb, netWeightLb | decimal(12,2) | |
| netWeightTons | decimal(12,4) | |
| **enteredById** | → `User` | The monitor making the ticket at the disposal (ADR-294) |
| deviceId | → `Device` | |
| **enteredAt** | instant | With its offset and `receivedAt` |
| notes | text | |

**As built (ADR-326).** Evidence, audited in the records domain; its id is the phone's. The
database refuses a blank number, a site of
another project, the system actor as the person who entered it, and a gross or a tare below
nought. **Every weight may be missing and none is worked out**: a net that isn't the gross less
the tare, a net of nought and a net below nought are kept as written, for a flag. A field event's
`scaleReceiptId` is taken only on a disposal and a haul-out disposal, for a receipt of its own
project; a load call or a count beside it is taken. A tandem's one receipt is one row both
disposals point at. Not checked (flags, or nothing): the receipt's site against the disposal's,
the site's type, one trip per receipt. **Viewers:** a client user and an auditor see their
projects' receipts (`viewer_scale_receipt`).

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
| contractorId | → `ProjectContractor` (its project's) | The contractor involved, a prime or a sub on the incident's own project (ADR-328) |
| certNumber | text | As scanned or typed, a snapshot as on a field event (ADR-328) |
| certificationId | → `Certification` | The one the number found, its own project's; empty while none has that number |
| roeNumber | text | As picked or typed (ADR-292, 328) |
| roeId | → `Roe` | The one the number found, its own project's; empty while none has that number |

All five are optional. Which of them a monitor is offered is the project's incident form's
`incidentOffers`; nothing here is refused for naming what the project doesn't offer (ADR-052).

#### `DropOffLog`

No quantity, number, pay item or cost (ADR-184, 188).

| Field | Type | Notes |
|---|---|---|
| **siteId** | → `DisposalSite` | |
| residentName | text | |
| originAddress | text | |

**As built (ADR-327).** `Survey`, `Incident` and `DropOffLog` are evidence, audited in the records
domain: the API inserts and corrects them, the worker reads them and writes none of their columns
(a form has no status). "Its time" is `madeAt`, with `deviceUtcOffsetMinutes` and `receivedAt`.
**One check tells a phone's form** (its phone, assignment and setup version; no back-office person
or reason) **from one created in the back office** (the person and the reason; no phone,
assignment or setup version), as on a field event; the system actor makes and creates none. A
latitude and a longitude together, on the earth, or neither. `formDefinitionId` comes with
`formId` and `formDocumentType`, all three or none, the document type the record's own (`SURVEY`,
`INCIDENT`, `DROP_OFF_LOG`), held by foreign keys to its own project's form and to that form's
definition; **with no definition the answers are `{}`**. Whether each answer fits its field is the
schema `packages/contracts` makes from the definition's version (`formAnswersSchema`: text that
isn't blank, a number, yes or no, one of a pick's choices, a photograph's id; a required field
answered; no field the version doesn't have). A survey's `roeId` and a drop-off log's `siteId` are
its own project's. An incident's sub-type is not held to its type by the database. **An incident
may name the contractor involved, a cert number and an ROE number** (ADR-328 (3), built ADR-334;
it named no certification before): the contractor is one placed on its own project (a foreign
key to `project_contractor (project_id, contractor_id)`), the certification and the ROE found are
its own project's, each there only with its number, and a number is never blank. A number that
finds nothing is taken; looking one up is intake's (1.4.2). A survey has no unique key: `surveyNumber` and
`roeNumber` may repeat. **Viewers:** a client user and an auditor see their projects' surveys,
incidents and drop-off logs, every column but a drop-off log's resident and origin address; those
through `viewer_drop_off_log_citizen`, only where the firm lets that viewer see private citizens
by name (§2.2; ADR-336).

### 4.4 Photos (ARCHITECTURE §11)

#### `Photo`

*Evidence.* The database holds only this; the file is one immutable object in storage, never
overwritten, kept indefinitely (ADR-101). At most 8 a ticket is the phone's rule; fewer than a pay
item requires is a flag.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | From the phone |
| **projectId** | → `Project` | |
| fieldEventId, certificationId, roeId, surveyId, incidentId, dropOffLogId, scaleReceiptId, quarantinedRecordId, heldRecordId | → each | **Exactly one owner** (check). `quarantinedRecordId` while its record waits in quarantine; the photo moves to the field event when a reviewer resolves it (ADR-292). `heldRecordId` while its record is held for a person; it moves to the record a person saves from it (ADR-526 (4)) |
| view | enum `PhotoView` | A certification's five: `OPERATOR_WITH_PLACARD` · `INTERIOR_OR_BACK` · `RIGHT` · `LEFT` · `FRONT` (ADR-179) |
| stage | enum `PhotoStage` | The stage of the work a unit rate ticket's photograph shows, where its kind of work is photographed by stage: `PRE_WORK` · `MEASUREMENT` · `POST_WORK`, one each (the user, ADR-590). **Only a field event's photograph** has one, or one kept with its record in quarantine or held (`photo_stage_check`); corrected as evidence is; viewers see it |
| **capturedAt** | instant | With its offset |
| latitude, longitude | decimal(38,8) | |
| **originalSha256** | text | Taken at capture; the phone's word |
| **uploadedSha256** | text | Of the file the phone uploads; the phone's word, sent with the record (ADR-481) |
| **objectKey** | text | Where the file is kept: **made by the server**, never sent by a phone: `projects/<project>/photos/<photograph>` (ADR-481) |
| depthObjectKey | text | The depth file's place, beside it with `.depth` after it, where the phone said one comes (ADR-481) |
| depthSha256 | text | The depth file's own fingerprint, the phone's word; there exactly where a depth file goes (ADR-482) |
| deviceId | → `Device` | None on a photograph added in the back office (ADR-534 (2)) |
| uploadedAt | instant | When the file reached storage, through the media endpoint: written once, by the phone that took it (ADR-482); on one added in the back office, by the person who sent it |
| depthUploadedAt | instant | The same for the depth file (ADR-482) |
| archivedAt | instant | The back office removed it from the record (ADR-329 (9), 337): a mark only, cleared to put it back. Nothing is deleted; who and when is the audit record |
| label | text | The back office's own words for what it shows; never blank; read by no check (ADR-337) |

**As built (ADR-326).** Evidence, audited in the records domain; its id is the phone's; it also
keeps `deviceUtcOffsetMinutes` and `receivedAt`. **Seven owners today**, each of the
photograph's own project (two-column foreign keys): `fieldEventId`, `certificationId`,
`scaleReceiptId`, and since ADR-327 `roeId`, `surveyId`, `incidentId` and `dropOffLogId`.
`quarantinedRecordId` joined with its table (ADR-338): **eight owners**, exactly one.
A `view` only on a certification's photograph, and not required. A fingerprint is 64 lower-case
hexadecimal digits; `objectKey` and `depthObjectKey` are each unique. **The two fingerprints and
the two keys are written once**: a trigger refuses any change to them, by anyone; the owner, the
time, the place and `uploadedAt` are corrected as evidence is. The database counts no
photographs: "at most 8" stays the phone's. A certification is never copied (ADR-328), so each holds its own
photographs. **Viewers:** a client user and an
auditor see their projects' photographs' records without `objectKey` and `depthObjectKey`
(`viewer_photo`). **Removed and labelled (ADR-337, built for C67 (e)):** `archivedAt` and
`label`, both empty on a photograph as a phone sends it, both set, changed and cleared by the API
like any correction (audited in the records domain, the worker only reads them); a removed
photograph keeps its record, its file, its fingerprints and its label, and a viewer's view shows
both columns. A label that is blank is refused (`photo_label_check`). Who may remove or label is
a permission the API reads (Phase 2); a removed photograph counts towards nothing a record must
have: not a certification's five views, not the photographs a pay item requires (the user, ADR-345).
**Its files (ADR-482).** The depth file's fingerprint, like the other two, is a SHA-256 written
once, and is there exactly where `depthObjectKey` is (`photo_depth_check`). **A record is kept
before its files reach storage** (no upload time on an insert); `uploadedAt` and
`depthUploadedAt` are each written once, and only with the source `DEVICE` and the photograph's own
phone stated (`photo_upload_guard`); the API writes them under the device key's actor when the
media endpoint has kept a file it checked. A viewer's view shows both new columns. **Added in
the back office (ADR-534 (2)):** a photograph with no phone, sent whole to a record made in the back
office; both fingerprints are the server's reading of its bytes; its upload time is written by a
person from the back office alone (`photo_upload_guard`).

#### `SetAsideFile` (`set_aside_file`)

*How the evidence arrived (ADR-482; BACKLOG C84 (12)).* A whole file the media endpoint received
for a photograph that isn't the file its phone fingerprinted: kept in storage at a place of its
own beside the photograph's (`<objectKey>.set-aside/<its SHA-256>`), for a person; never kept as
the photograph's, never thrown away.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | The database's |
| **photoId** | → `Photo` | |
| **file** | enum `PhotoFile` | `PHOTO` · `DEPTH`: which of the photograph's files it stood for |
| **deviceId** | → `Device` | The phone that sent it: the photograph's own |
| **receivedSha256** | text | Of what arrived, read by the server |
| **byteCount** | int | More than none |
| **contentType** | text | The kind of image its first bytes say |
| **objectKey** | text | Where it is kept; unique |
| **receivedAt** | instant | When the server received it whole |
| resolvedById | → `User` | Who closed it (ADR-526 (3)) |
| resolvedAt | instant | |
| resolution | text | What was decided: the photograph's own file won't come, this one stays beside it |

One row for one file: unique on `photoId`, `file` and `receivedSha256`. The API's alone to add and
read; what arrived is never changed, never deleted, audited in the records domain; written only
with the source `DEVICE` and the photograph's own phone stated (`set_aside_file_from_its_phone_guard`).
**Closed once, by a person at the back office who is named on it** (all three or none; never the
system actor, the master passcode's or the device key's; `resolved_once_guard`), the API's
`closeSetAsideFile` (ADR-526). No viewer reads it.

### 4.5 Sync (Phase 2 settles the detail; ARCHITECTURE §9)

**`FieldEvent.unreadableGps` (ADR-329 (5), 338; listed here because intake writes it).** JSON,
empty on almost every field event: a GPS fix that reached the server and couldn't be one (half a
fix, a latitude past 90, a longitude past 180, not a decimal), kept exactly as sent under `start`
or `end`, while the field event is saved without that fix. The worker reads it to raise "GPS
unreadable" (task 1.5.5); a reviewer who corrects the fix writes the real columns. A form's, an
ROE's and a photograph's impossible fix is dropped the same way and kept in that insert's audit
reason. *Agent default.*

#### `Sync`

One connection from a phone.

| Field | Type | Notes |
|---|---|---|
| **deviceId** | → `Device` | |
| **startedAt** | instant | |
| **deviceClockAt** | instant | |
| **clockDifferenceSeconds** | int | |
| setupVersionSent | int | |

**As built (ADR-471, task 2.6.2 part 1; agent defaults).** Table `sync`. `startedAt` is the
server's clock when the sync began; `deviceClockAt` is the phone's as it sent the sync, with
`deviceUtcOffsetMinutes` beside it (UTC−12:00 to UTC+14:00), as every time a phone reports has.
**`clockDifferenceSeconds` is the phone's clock less the server's, in whole seconds**: above
nought when the phone's is ahead. The database holds it to the two instants (within one second,
however the fraction was rounded), and it is kept wide (a phone may report any instant).
**Nothing of a sync is changed after it is written**, but `setupVersionSent`, written once
(from 1) when the answer carried lists. Written only for a phone, stated by name, and naming
that phone; never deleted; audited in the records domain. The API adds and reads one; **the
worker reads it** (the difference, for `DEVICE_CLOCK_OFF`); no read-only viewer does.
**Written since ADR-472 (task 2.6.2 part 2)** by `Sync` (`apps/api`), first in every call of
`POST /phones/current/syncs`, as the device key's actor on the phone that proved itself; the
difference is rounded to the nearest second. A call sent again is a sync of its own.
**`setupVersionSent` since ADR-473 (task 2.6.2 part 3):** written once by `Sync`, as the device
key's actor, where the phone said whose lists it holds and the answer told it that project's
setup version: the number, not the lists ("when the answer carried lists", above, is read so).
The worker reads `clockDifferenceSeconds` through `SyncedRecord` for each phone-made field
event and flags past the policy value `DEVICE_CLOCK_OFF_LIMIT_MINUTES`.

#### `SyncedRecord`

The idempotency ledger: a retry is answered "already saved" from here and never quarantined (KD-56).

| Field | Type | Notes |
|---|---|---|
| **recordId** | uuid | The phone-made id; the key |
| **recordKind** | *open* | |
| **syncId** | → `Sync` | |
| **answer** | enum `SyncAnswer` | `SAVED` · `QUARANTINED` |
| monitorId | → `User` | A field event saved: the person it named as its monitor (ADR-543) |
| monitorSignedIn | bool | And whether they held that phone over its field time when it arrived: what the worker flags `MONITOR_NOT_SIGNED_IN` from. Both or neither |

**As built (ADR-471, task 2.6.2 part 1; agent defaults).** Table `synced_record`; **the key's
column is `id`** (the phone-made id; the audit log names every row by a column of that name),
`recordId` in code. One row for each record the server **stored**: as a record of its kind
(`SAVED`) or in quarantine (`QUARANTINED`). **A record the server could not save is not in the
ledger: it is a `HeldRecord`** (below), so `SyncAnswer` stays these two (ADR-468 (3)'s last
sentence, amended). `recordKind` is the contract's word for the kind (`FIELD_EVENT`,
`SCALE_RECEIPT`, `ROE`, `CERTIFICATION`…), so a later kind needs no migration. A row also names
its phone (`deviceId`), held to its sync's by a two-column foreign key. **Written once, for the
phone it names; never changed, never deleted**; audited in the records domain. The API adds and
reads it; the worker reads it, to find the sync that brought a record; no read-only viewer does.
**Written since ADR-472** in the piece of work that stores the record, as the monitor from the
phone (`ledgerRow`): a retry is answered "already saved" from it where it holds the id as `SAVED`
under the same kind. A record stored with no sync named (before the ledger, or by a story's own
intake) has no row. A photograph's record has none yet (task 2.6.4).

#### `HeldRecord`

A record a phone sent that the server could not save, **held exactly as sent for a person**
(the user's decision, ADR-468; built by ADR-471, task 2.6.2 part 1; its fields are agent
defaults). Inert: never a field event, never paired, never billed, never read by the worker.

| Field | Type | Notes |
|---|---|---|
| **id** | uuid | Its own: what was sent may carry no id |
| **deviceId** | → `Device` | The phone, known for certain from its proof |
| syncId | → `Sync` | The sync that brought it, that phone's own; none only for a report made to its own endpoint (ADR-526 (5)) |
| sentId | uuid | The record's phone-made id, where one could be read |
| projectId | uuid | The project it named, **as sent: not a relation**, it may name nothing |
| sentMonitorId | uuid | The monitor it named, as sent: not a relation |
| **payload** | JSONB | What stood in the record's place, exactly as sent: any JSON value |
| **sentSha256** | text | The SHA-256 of what was sent |
| sentBytes | int | Its size as canonical JSON in UTF-8: what the phone's daily budget counts (ADR-546). Never changed |
| **reason** | enum `NotSavedReason` | `NOT_A_RECORD` · `NAMES_NO_RECORD` · `ASSIGNMENT_NOT_SAVED` · `CERTIFICATION_REFUSED` · `OWNER_NOT_SAVED` (a photograph whose record the server has nowhere, ADR-481, 526) · `REPORT_NOT_SAVED` (an unplanned assignment or a use of the passcode the server could not keep, ADR-526) · `PROJECT_CLOSED` (field work for a project closed before it arrived, ADR-529) (the domain's `heldReasons`) |
| **message** | text | What the phone was told |
| **receivedAt** | instant | |
| resolvedById | → `User` | |
| resolvedAt | instant | |
| resolution | *open* | |

Table `held_record`. **The same thing sent again by the same phone is the same held record**
(one row for a phone and a fingerprint), so a phone that keeps sending what can't be saved
adds nothing; the same record sent with anything changed is another thing sent, and is held
too. **What was sent is never changed, by anyone, and never deleted**; only the resolution is
written later (who, when and what, all three or none), **by a person**: never the system actor,
the master passcode's or the device key's. Written only for the phone it names, when that phone
syncs. Audited in the records domain, **the audit log saying that one was made and never
holding a second copy of what was sent**. The API alone adds, reads and resolves one; the
worker holds no right on it. **Viewers:** as a quarantined record's (ADR-336, 468 (5)): a
client user and an auditor see that a record naming their project is held, why and how it was
resolved (`viewer_held_record`); what was sent only by `viewer_held_record_citizen`, to a viewer
the firm lets see private citizens; one that names no project of theirs is seen by none; a
contractor user sees none. **Resolved once (ADR-526 (2), (7)), by a person at the back office who is
named on it** (`resolved_once_guard`): saved as corrected (the record saved under the id its phone
made, its photographs moved to it) or closed, never to be saved. **A photograph whose record is
held is kept with it** (`Photo.heldRecordId`, the ninth owner): one held from the photograph's own
phone, naming its project, still waiting; it leaves only for the record a person saved from it
(`photo_held_record_guard`). The review queue's screens are Phase 4's.
**Written since ADR-472** by `Sync` alone, as the device key's actor on the syncing phone.
**`sentSha256` is the SHA-256, in hex, of what was sent as canonical JSON in UTF-8** (object
keys sorted at every depth, no white space), so the order of a record's fields doesn't matter.
`sentId`, `projectId` and `sentMonitorId` are read loosely, each only where it is an id (the
monitor from `monitorId`, `enteredById`, `madeById` or `certifiedById`). `message` is the
domain's words with "Held on the server for review." A held record whose record is later sent
again and saved stays as it is, for a person. *Agent defaults.*

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

**As built (ADR-338, task 1.4.2).** Evidence, audited in the records domain; written by intake
(`apps/api`, `Intake`), never by the worker, which doesn't read it. `payload` is the record with
its kind, as the phone sent it (an object). `reason` is the closed set `QuarantineReason`:
`DUPLICATE_FIELD_EVENT` (a second field event of one kind on one project, workflow, bare number
and split suffix) or `DUPLICATE_ROE_NUMBER` (an ROE made on a phone whose number another ROE of
the project has: the monitor's record isn't lost and no ROE number is held twice). **There are
two holders, exactly the one the reason names:** `holdingEventId` → `FieldEvent`, or
`holdingRoeId` → `Roe`, each of the record's own project (two-column foreign keys). The first
record to reach the server holds the number, a voided ticket's included. **What the phone sent
is never changed, by anyone** (a trigger on the id, project, phone, monitor, payload, reason,
holders and received time) and never deleted; the resolution is `resolvedById`, `resolvedAt`
and `resolution`, all three or none, never the system actor's. **Its words are the domain's
`QuarantineResolution`** (ADR-364): "Renumbered to 101021: saved as a record of its own, with
its photographs." or "A second copy of the record that holds its number: nothing was made from
it."; a record is resolved once (`apps/api`'s `QuarantineReview`). **Viewers:** a client user and an auditor see every column but `payload`
(`viewer_quarantined_record`); the record as sent may name a private citizen, so it is shown by
`viewer_quarantined_record_citizen` only to a viewer the firm lets see them (ADR-336); a
contractor user sees none. A quarantined record's item lines and carried tickets are inside its
payload; a scale receipt sent with it is saved as its own record. *Agent defaults.*

#### `FieldEventEdit`

**Withdrawn 2026-10-12 at the user's word (ADR-477): never built.** A record a monitor submitted
is sealed for them, so no phone sends an edit and there is no edit log; the back office's
corrections are the audit log's (ADR-051).

#### `SetupManifest`

The numbered lists a phone was sent, kept so a reviewer sees what the phone showed (ADR-240).

| Field | Type | Notes |
|---|---|---|
| **projectId** | → `Project` | |
| **version** | int | |
| **content** | *open* | |
| **builtAt** | instant | |

**As built (ADR-453, task 2.5.3 part 3; agent defaults).** **A version numbers the project's
setup as its phones are shown it**, whole for the project: how it numbers its tickets and the
series it has, whether it allows split loads (ADR-581, task 3.5.1), the control ranges, the load and
haul-out forms' debris types without those *Hidden on phones*, the field tags, the reasons for a
typed number, the live sites, every unit rate pay item with its capture settings, the item
names, the incident and survey lists, and every live site's quantity lookup. `content` is that,
as sent (an object; the contracts' `setupShownSchema`). **Never a rate, a rule or a load's pay
item, and not the certifications, the ROEs or a phone's blocks of numbers**: those are records
with their own history, and a new one makes no version. A phone's lists are its assignment's
part of the version, so a field event's `assignmentId` and `setupVersion` together say what its
phone showed. **Made when a phone is first sent lists that differ from the newest version's**,
written by the API as the device key's actor on that phone, and at no other time. `version` is
1, 2, 3… per project with no gap and unique with `projectId`; the database refuses a number out
of turn, a version whose content is the newest's, one made other than as a phone's write naming
the phone, and any edit or delete; audited in the records domain. The worker and the read-only
viewers read none. A field event's `setupVersion` is not held to it by a foreign key: it is
what the phone said. `Sync.setupVersionSent` is task 2.6.2's.

---

## 5. Derived: the worker's conclusions

**Built 2026-10-05 (ADR-340), and `Transaction` on 2026-10-06 (ADR-358, below)**: the completed load and
haul-out, their collection rows, `Flag`, `ReconciliationRun`, `ReconciliationDecision`, and the
worker's three columns on a field event (§4.1 (3)). What the build added to this page, as agent
defaults: **a collection row has its own `id` and repeats its completed record's `projectId`**, so
the database holds the completed record and the collection event to one project (a transaction
points at the row by its id, 1.7.1); **a completed record's disposal, a flag's record and run, and a
field event's map version, zone and worked-out pay item are each held to its own project** by
two-column foreign keys; **`mileageSource` is there exactly when `mileage` is** (a collection with
no GPS has neither), and the road point and the map data's date and hash are each whole or
missing; **"unique among live rows" is an exclusion on equality** `WHERE dissolved_at IS NULL`,
which holds what a partial unique key would and which Prisma's next migration doesn't try to drop;
a suffix is once among a completed record's live rows; a `ReconciliationRun` and a
`ReconciliationDecision` have an `id`, and a run has one decision for a ticket. A client user and
an auditor see the completed records, their rows and the flags of their projects; no viewer reads
a run or its decisions. That a completed load's disposal is a `DISPOSAL` and its rows'
collections `COLLECTION`s is the worker's grouping (1.5.3): the database holds the project and the
uniqueness, not the kind.

#### `CompletedLoad` (`CLT`)

*Derived, built (ADR-340).* One per disposal event, for the life of that event (*agent default*: it is
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

*Derived, built (2026-10-06, ADR-358).* One priced line; the current truth, regenerated when its
ticket changes, each removed row copied in full to `AuditRecord` first, the delete refused on an
invoice-locked ticket (ADR-085, 090).

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

**As built (ADR-358; agent defaults).** A load's line always names the property it prices (an
ordinary load's one row), a haul-out's the pile: the load or haul-out and its row come together,
and the row is one of that load's or haul-out's own. **Everything a line names is its own
project's**, held by the database: the load, haul-out or field event, the rule, the pay item, the
contract and the run. **The prime is one of the project's primes, and the operating sub a
contractor placed on the project under that prime** (tier 1 or tier 2: the sub of the lowest tier
the certification names, AC-03-12; empty on the prime's own truck or crew). The database does not
hold the rule to its contract or the contract to its prime: either may be changed in setup while
lines stand, and the lines are then regenerated. **A # is once per property, per pile and per unit
rate ticket**, and is 1 or more; no quantity, rate or amount is below nought; the amount is the
worker's figure and the database doesn't work it out again. **A line keeps no mileage** (ADR-350):
it is read from the property's or pile's collection row. **A ticket locked as invoiced takes no
new line either** (C17): the database refuses the insert as it refuses the removal. Only the
worker's login inserts and deletes one; nobody updates one. **What a viewer sees:** a client user
and an auditor every line of their projects; a contractor user the lines of its own contractor in
the projects it is given, as the prime (its subs' work among them) or as the sub that did the
work; never another prime's. **The rate and the amount are read from `viewer_transaction_money`**,
by a client user, an auditor and the line's own prime's contractor user; a sub's reads its
lines without them (the user, 2026-10-06, ADR-361; §2.2).

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

### The job queue (built 2026-10-07, task 2.3.1, ADR-418; an agent default)

Not a conclusion and not evidence: **the work a change asks the worker for** (ARCHITECTURE §13,
"Jobs, not requests"). A sync, a correction, a void or a setup change adds a job **in its own
piece of work**, so the change and its job exist together or not at all (AC-10-50), and the
worker's run works the tickets its project's waiting jobs name and no other (the user, ADR-360).
Two tables of our own, written through Prisma; no queue library. **The API adds a job and its
tickets and changes neither; the worker writes only how a job went; nobody deletes; no read-only
viewer reads either;** both are audited in the operations domain.

#### `ReconciliationJob`

One ask for reconciliation. **Waiting** while it is neither finished nor set aside; once either,
nothing of it changes again. What was asked (its project, `trigger`, `requestedById`, `queuedAt`)
never changes.

| Field | Type | Notes |
|---|---|---|
| **projectId** | → `Project` | |
| **trigger** | enum `ReconciliationTrigger` | What asked for it: the run's own closed set |
| requestedById | → `User` | The person who asked; none on a job a sync queued |
| **queuedAt** | instant | The database's clock |
| **attempts** | int | The runs that took it up; from 0, never below |
| finishedAt | instant | When a run had worked its tickets |
| reconciliationRunId | → `ReconciliationRun` | That run, one of its own project's; a finished job names it |
| lastError | text | Why its last try failed whole; never blank |
| setAsideAt | instant | When it had failed too often to be taken up again (five tries, a policy value of task 2.3.2); it says why; never together with `finishedAt` |

#### `ReconciliationJobTicket`

A ticket a job names, as the worker groups one. Once a job; never edited. A job names the
tickets its change touched and their neighbours, the other tickets whose conclusions read them
(ADR-420), never a ticket locked as invoiced; a change larger than the policy value
`JOB_TICKETS_AT_MOST` is several jobs. **A job with no ticket** asks only for the records the run
flags by themselves (a certification, a site, a survey).

| Field | Type | Notes |
|---|---|---|
| **projectId** | → `Project` | Its job's own project (a two-column key) |
| **reconciliationJobId** | → `ReconciliationJob` | |
| **workflow** | enum `Workflow` | |
| **ticketNumber** | text | The bare number; never blank |

---

## 6. Marks: what people set, without changing the record (ADR-245)

**Built (task 1.8.2, ADR-363):** all five, in `packages/db/prisma/schema/marks.prisma`. Beside the
fields below, **every mark repeats its `projectId`**, which holds it and what it marks to one
project; and a mark on a field event repeats that event's kind as `fieldEventKind`, held to
`UNIT_RATE`. What a mark is on, who made it and when never change; a lock once unlocked, and a
void once lifted, is history, and locking or voiding again is a new row. Audited: a QC mark in
records; a lock, a batch and a void in billing; an acceptance in operations. A client user and an
auditor see every mark of their projects (never an unlock's note); a contractor user sees that
its own tickets are locked and in which batch, and no other mark.

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

*Built (ADR-358, 363).* Only on a QC Approved record (ADR-121; held by the service, task 1.8.5,
not by the database). An unlock keeps the row and is audited; locking again is a new row (C17).
Its three targets: a completed load, a completed haul-out or a unit rate ticket's field event,
exactly one. **A ticket has one lock in force at most** (not unlocked); a transaction's two
guards and the worker ask only about a lock in force.

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

A name and its tickets; no amounts (ADR-228). **A name is used once on a project** and is never
blank; a lock names a batch of its own project; a batch is renamed freely, audited, and is never
archived (agent defaults, ADR-363).

| Field | Type | Notes |
|---|---|---|
| **projectId** | → `Project` | |
| **name** | text | "Bayline ROW, week of 12 Oct" |
| createdById | → `User` | |
| createdAt | instant | |

#### `FlagAcceptance`

The flag stays in the history and isn't raised again unless its facts change (ADR-166). The flag
itself is never changed by an acceptance; the acceptance stays on its flag (ADR-363).

| Field | Type | Notes |
|---|---|---|
| **flagId** | → `Flag` | One acceptance in force a flag: unique among those not taken back (an exclusion, ADR-534 (8)) |
| **reasonId** | → `Reason` | |
| note | text | |
| **acceptedById** | → `User` | |
| **acceptedAt** | instant | |
| withdrawnById, withdrawnAt | → `User`, instant | Taken back: who and when, both or neither; a person (ADR-534 (8)). The flag stands again; accepting it again is a new row; one taken back is history |
| withdrawNote | text | Why, only with them; never blank |

#### `TicketVoid`

A person's void (C19): the worker reads it and sets `VOID` (task 1.8.4). An unvoid lifts it,
audited, on its own row; **a ticket has one void in force at most**, and voiding it again is a new
row (ADR-363). A rule's void is the worker's own: its reason is the rule, on the run's decision; it
stays until a person unvoids the ticket (ADR-360).

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

#### `TicketUnvoid`

An unvoid's own record (the user, 2026-10-06, ADR-366: "Unvoiding anything should always leave an
audit record, even if it's the system"). Written for every unvoid, whoever voided the ticket: a
person's void is also marked lifted on its `TicketVoid` row; a rule's void has no row, so this is
its only record. Never changed once written; a ticket may have several over its life. The worker
reads it: a void ticket whose newest unvoid is newer than its last decision is worked again (the
seventy-ninth and eightieth migrations).

| Field | Type | Notes |
|---|---|---|
| **projectId** | → `Project` | |
| **workflow** | enum `Workflow` | |
| **ticketNumber** | text | |
| note | text | The reviewer's own words; never blank |
| **unvoidedById** | → `User` | A person, never the system actor |
| **unvoidedAt** | instant | |

#### `ApprovedDay`

In §3, with the time clock.

---

## 7. Audit

#### `AuditRecord`

*Audit, built.* Written by database triggers alone, one per insert and update on every table above,
and one per removed `Transaction`; never updated or deleted by anyone (ADR-085, 097). A secret
column is named on its table's trigger and kept out (ADR-281). Sign-ins, lockouts, device enrolment
and master-passcode uses are security events in the same log (REQ-202b): each is a
`SecurityEvent` (§2.2), which the capture copies here in the security domain (built, ADR-399).

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
| An unplanned assignment is made only as the master passcode's actor, for a phone, naming that phone, with the phone's instant, its offset and the server's received time; a planned one has none of the three; whether one was planned, and when an unplanned one was received, never change; a security event carries an offset only with its phone (ADR-457) | ✅ checks and a trigger (`assignment_unplanned`) |
| A kind fits its workflow; a load call is 0–100 and only on `DIS` and `HOC` | ✅ checks |
| A completed record's disposal, a collection row's completed record and collection event, a flag's field event, certification, site, survey, pay item and run, and a field event's map version and worked-out pay item are each of its own project; a zone is one of the map version used, and comes with it; only a unit rate event has a worked-out pay item (ADR-340) | ✅ two-column foreign keys and checks |
| A completed record's load call is 0–100 and nothing on it or its rows is below nought; a weight is a share only where there is a weight; a haul-out never takes its quantity from carried tickets; a share is nought to one; a mileage with its source, a road point whole and on the earth, the map data's date with its hash; a flag is on a ticket or a record, says something, keeps its facts as an object with a SHA-256, and is never cleared before it was raised; a run never finishes before it starts; one decision for a ticket in a run (ADR-340) | ✅ checks and a unique key |
| Only the worker writes a derived record and the reconciliation columns on a field event; the API reads them; nobody deletes one (ADR-270, 340) | ✅ grants (`guard_table`, `DERIVED`; the field event's five worker columns) |
| Every kind-specific column is empty on the other kinds; a split load's collection has its suffix and estimate both, or neither; a haul-out collection may carry a suffix, with its load call (ADR-295); no other kind has a suffix, and a suffix is capital letters; a measurement with how it was read, both or neither; an estimate, a count, a measurement and a root ball nought or more (ADR-325) | ✅ checks |
| A field event's debris type is an entry of its own project's form for its workflow; its field tag and its pay item are its own project's; an item line sits only on a unit rate event, once per item, and a carried ticket only on a collection, once per number (ADR-325) | ✅ foreign keys (the field event repeats the entry's form and document type; a line repeats its field event's kind), checks and unique keys |
| A phone's record carries its device, assignment and setup version; a back-office one its person and reason, and neither the other's (ADR-324) | ✅ check |
| One disposal per completed load or haul-out; one live completed record per collection event; a ticket number once among a project's live completed loads, and among its live completed haul-outs; a suffix once among a completed record's live rows (ADR-340) | ✅ a unique key, and exclusions on equality `WHERE dissolved_at IS NULL` in the guard migration (what a partial unique key holds) |
| A cert number once per project (✅ ADR-321); an ROE number once per project. **A scale receipt's number is never unique** (ADR-328, 331: the key is gone) | unique keys |
| A pay item's code once per project (ADR-301) | ✅ unique key |
| One rate per prime on a pay item, and only for one of the pay item's own project's primes (ADR-206, 305, 309) | ✅ a unique key and two-column foreign keys |
| A size band is never below nought or backwards; crew time's conversion only on an `HR` or `CREW_DAY` pay item, its day length only on an exact one, at most 24 h; a crew day's step within a day; a rate and a step's quantity nought or more (ADR-087, 309) | ✅ checks |
| An assignment names only unit rate pay items (C42) | ✅ a three-column foreign key to the pay item's project, id and kind of work (ADR-309) |
| A list value with a key (a built-in value) is never archived; a key appears once in its list (ADR-194, 302) | ✅ a check and a unique key on every list |
| Only a release writes a list value's key: no other login adds a row with one, or gives, changes or removes one (ADR-302) | ✅ a trigger on every list |
| A rule that is an exact copy of another (same form, contract, criteria and actions, whatever its name) | the API at setup, before it is saved (ADR-301): ✅ the check is `packages/domain`'s `ProjectRules` (ADR-313) |
| A rule sits on a load, haul-out or unit rate form of its own project and names one of that project's contracts; a picked value is the rule's own project's (a debris type its own form's); a pick fills the one column its criterion picks from; a criterion takes only its kind's operators, and a value only its operator's; an action holds only what its kind takes (ADR-313) | ✅ composite foreign keys and checks |
| A transaction # once per ticket (and property or pile) | ✅ three unique keys: on the property's row, the pile's row and the unit rate ticket's field event (ADR-358) |
| A transaction is on exactly one kind of ticket, a load or a haul-out with the property or pile it prices; everything it names is its own project's, the property a row of its own load, the pile of its own haul-out; its prime one of the project's primes and its operating sub placed under that prime; its # 1 or more and its figures nought or more (ADR-358) | ✅ a check, two- and three-column foreign keys, a check |
| An invoice lock is on exactly one ticket of its own project, a field event only as a unit rate ticket; a ticket has one lock in force; a ticket locked as invoiced gives up no transaction and takes none, whichever of the three kinds it is, until it is unlocked (ADR-090, 358, 363; C17) | ✅ a check, two-column foreign keys, three exclusions `WHERE unlocked_at IS NULL`, the delete's trigger and an insert trigger |
| A QC mark is on exactly one record of its own project, a field event only as a unit rate ticket, and a record has one mark; a flag is accepted once; a batch's name is used once on its project, and a lock's batch is its own project's; a ticket has one person's void in force (ADR-363) | ✅ checks, two-column foreign keys, unique keys, an exclusion `WHERE lifted_at IS NULL` |
| What a mark is on, who made it and when never change; a lock once unlocked and a void once lifted are never changed again; an unlock and an unvoid are who and when together; no mark is the system actor's (ADR-363) | ✅ `refuse_edit()` on those columns and on the finished row, checks |
| Only the API writes a mark, for a person; the worker reads them; nobody deletes one (ADR-245, 363) | ✅ grants (`guard_table`, `MARK`) |
| A contractor user reads only the locks on its own tickets and the batches that hold one; no viewer an unlock's note (ADR-228, 363) | ✅ row-level security (`guard_viewer`'s `own`), no column grant |
| A contractor user reads only its own contractor's transactions in the projects it is given, as the prime or as the operating sub (ADR-169, 358) | ✅ row-level security |
| A contractor user reads only its own tickets: the certifications that name its contractor, and the field events, completed records, scale receipts and photographs that hang on them; a field event with no certification found is nobody's (ADR-361) | ✅ row-level security (`guard_viewer`'s `own`) |
| A sub's contractor user reads no rate and no amount (the user, 2026-10-06, ADR-361) | ✅ no column grant, and `viewer_transaction_money` |
| A crew certification has no capacity and no boxes; a container has both (ADR-321) | ✅ a check; a box repeats its certification's kind, held by a foreign key; two deferred constraint triggers hold a container to its primary box |
| A certification's prime is one of its project's primes, and each sub is placed on that project under that prime; a second tier only with a first; "replaces" names a certification of its own project, once, with a reason; a revocation has its date, reason and person; a box's shape holds its own whole-inch measurements, each 1 or more, a radius corner subtracts, a box after the primary has one label (ADR-321) | ✅ foreign keys, unique keys and checks |
| A project's time zone is an IANA name; no time without its zone | ✅ checks, a test |
| A project's active window never ends before it starts; its load-call limits are empty or 0–100; its stump fill depth and site circle are at least 1; its ticket types are never missing (ADR-303) | ✅ checks |
| A kind of unit rate work is on a project once | ✅ unique key |
| A contractor has one place on a project, so a sub is never shared by two primes (ADR-108) | ✅ unique key |
| The prime a sub names, and a contract's prime, is one of that project's primes; a prime that a sub or a contract names can't be made a sub (ADR-108, 146, 305) | ✅ two-column foreign keys to the prime's row |
| A sub names its prime and a prime names none; a prime's row, and only a prime's, carries its own contractor as `asPrimeId`; a merged contractor is merged into another record and is archived (ADR-305) | ✅ checks |
| The Monitor ID is issued, well-formed, unique; the system actor is one fixed row and never a person | ✅ |
| An assignment's site, a field event's site and an assignment's pay items are their own project's; a field event's certification too (ADR-324) | ✅ two-column foreign keys |
| A reason for a typed number only on a typed number; a typed capacity only on a truck keyed in by hand, nought or more; each GPS end a latitude and a longitude together, on the earth, or neither; an address with its source, and only an address (ADR-324) | ✅ checks |
| Number blocks of one series never hold the same number (✅ ADR-323: a reclaimed block holds only what its phone used); control ranges of one series never overlap (✅ ADR-323) | exclusion constraints (`btree_gist` is in since ADR-310; C43) |
| Size bands of one payable type never overlap | ✅ an exclusion constraint on the project, the payable type and the band, archived pay items left out (ADR-310); setup says so first, by `packages/domain`'s `SizeBands`, which also warns of a gap (ADR-217, 309) |
| A site's GPS is on the earth; it closes no earlier than it opens; *Haul-outs leave here* only on a TDSR/DMS site, whose type can't change while it's marked (ADR-298, 311) | ✅ checks, and a two-column foreign key to the type's key |
| A site's tipping fee pay item is its own project's; a label and a fee once per site (ADR-311) | ✅ two-column foreign keys, unique keys |
| A site's shape, a map version and its zones are never edited; a zone is written only with its version; versions count from 1, once each; every shape a Polygon or MultiPolygon with its bounding box on the earth (ADR-141, 144, 311) | ✅ no update grant and `refuse_edit()`, a trigger, unique keys, checks |
| Nothing is deleted; audit is append-only; every write states its actor; a transaction's delete is copied first and refused when locked; viewers see only their own projects | ✅ the guard migrations (ADR-270…276) |
| A permission once per person; a project once per viewer; neither for the system actor (ADR-315) | ✅ unique keys and checks |
| A read-only viewer states its kind and nobody else does; a contractor user names its contractor and nobody else does (ADR-315) | ✅ checks |
| Every read-only viewer says whether they see private citizens by name, and nobody else does; a viewer the firm marked reads no ROE owner and no drop-off log's resident or origin address (ADR-336) | ✅ a check; no column grant, and the `viewer_<table>_citizen` views (`guard_viewer`'s `citizen`) |
| A phone's key is revoked only once it is out of service, never before its removal time (ADR-315) | ✅ check |
| A client user and an auditor read only their own projects' setup; a contractor user none of it; no viewer a contact, a phone number or a person (ADR-315) | ✅ row-level security and column grants (`guard_viewer`) |
| A password is kept only as an Argon2id hash and a refresh token only as its SHA-256; an authenticator's secret is never blank; a person has one sign-in record; a refresh token's hash is on one session (ADR-397, 398) | ✅ checks and unique keys |
| A password hash, an authenticator's secret and a refresh token's hash never reach the audit log: it says the column changed, never what from or to (ADR-281, 397, 398; C21) | ✅ each named on its table's audit trigger |
| Whose a sign-in record or a session is, and when it began, never change; a session ends after it began, and once revoked never changes again; a security event is never edited; none of the three is deleted; none is the system actor's sign-in record or session (ADR-397…399) | ✅ `refuse_edit()` and `refuse_delete()` triggers, checks |
| Only the API reads or writes sign-in's records: not the worker, not a read-only viewer (ADR-397…399) | ✅ grants (each table's own, no view) |
| A monitor's session names the phone they signed in on and no other session names one; one on a phone is opened only for a monitor not archived, on a phone in service whose key stands, by that monitor from that phone; the phone it names never changes (ADR-443; AC-02-39) | ✅ triggers (`session_on_a_phone`, `session_refuse_device_edit`) |

---

## 9. The closed sets (Postgres enums)

A new value in any of them is a code change with an ADR (`spec/LISTS.md` Group 2). ✅ = built today.

| Enum | Values | Used by |
|---|---|---|
| `Workflow` ✅ | `LOAD` · `HAUL_OUT` · `UNIT_RATE` | `FieldEvent`, `Project.workflows`, `Flag`, `TicketVoid`, `TicketUnvoid` |
| `FieldEventKind` ✅ | `COLLECTION` · `DISPOSAL` · `HAUL_OUT_COLLECTION` · `HAUL_OUT_DISPOSAL` · `UNIT_RATE` | `FieldEvent`, `Assignment` |
| `TicketStatus` ✅ | `PENDING` · `COMPLETED` · `MANUAL_REVIEW` · `VOID` | `FieldEvent`, `ReconciliationDecision` |
| `UserRole` ✅ | `ADMIN` · `MANAGER_ANALYST` · `MONITOR` · `READ_ONLY_VIEWER` · `SYSTEM` · `MASTER_PASSCODE` (ADR-439) · `DEVICE_KEY` (ADR-440) | `User` |
| `DeviceStatus` ✅ | `ACTIVE` · `LOST` · `RETIRED` | `Device` |
| `SecurityEventKind` ✅ | `SIGN_IN` · `SIGN_IN_FAILED` · `LOCKOUT` · `TWO_STEP_SET_UP` · `TWO_STEP_CLEARED` (ADR-412) · `DEVICE_SETUP` · `DEVICE_SWITCH` · `MASTER_PASSCODE_USE` · `MASTER_PASSCODE_FAILED` · `MASTER_PASSCODE_LOCKOUT` (ADR-439) · `DEVICE_TURN_IN` (ADR-488) · `DEVICE_KEY_REVOKED` (ADR-530) | `SecurityEvent` (ADR-399) |
| `DeviceKeyRevocation` ✅ | `TURN_IN` · `FIRM_TIME` (ADR-530) | `Device.keyRevokedBy` |
| `NumberSeries` ✅ | `LOAD` · `HAUL_OUT` · `UNIT_RATE` · `CERTIFICATION` · `ROE` (✅ ADR-323) | `ProjectNumberSeries`, `ControlRange`, `NumberBlock` |
| `NumberBlockStatus` ✅ | `ISSUED` · `RECLAIMED` · `RETIRED` | `NumberBlock` |
| `AssignmentOrigin` ✅ | `PLANNED` · `UNPLANNED` | `Assignment` |
| The audit's three ✅ | operation `INSERT` · `UPDATE` · `DELETE`; source `DEVICE` · `BACK_OFFICE` · `SYSTEM`; domain `SECURITY` · `BILLING` · `OPERATIONS` · `RECORDS` | `AuditRecord` |
| `ContractorKind` ✅ | `HAULER` · `MONITORING` · `CREW` · `OTHER` | `Contractor` |
| `ContractorPosition` ✅ | `PRIME` · `SUB_TIER_1` · `SUB_TIER_2` | `ProjectContractor` |
| `ViewerKind` | `CLIENT` · `CONTRACTOR` · `AUDITOR` | `User` |
| `Permission` | `CORRECT` · `RENUMBER` · `VOID` · `ACCEPT_FLAG` · `QC` · `LOCK_INVOICED` · `UNLOCK_INVOICED` · `APPROVE_HOURS` · `SETUP` · `DISPATCH` · `VIEW_REVIEW` · `VIEW_SETUP` · `VIEW_DISPATCH` | `UserPermission` |
| `ReasonUse` ✅ | `VOID` · `TYPED_NUMBER` · `ACCEPT_FLAG` · `BACK_OFFICE_RECORD` · `PHONE_REMOVAL` (ADR-530) | `Reason` |
| `FormDocumentType` | `LOAD` · `HAUL_OUT` · `UNIT_RATE` · `CERTIFICATION` · `ROE` · `SURVEY` · `INCIDENT` · `DROP_OFF_LOG` | `Form`, `Assignment` |
| `IncidentOffer` ✅ | `CONTRACTOR` · `CERT_NUMBER` · `ROE_NUMBER` | `Form.incidentOffers` (ADR-334) |
| `BillingUnit` ✅ | `CY` · `TN` · `EA` · `LB` · `HR` · `CREW_DAY` · `TBN` | `PayItem`, `Transaction` |
| `CrewTimeConversion` ✅ | `PER_HOUR` · `PER_DAY_EXACT` · `PER_DAY_STEPS` | `PayItem` |
| `CountShape` ✅ | `NUMBER` · `ITEM_COUNTS` · `ITEM_HOURS` | `KindOfWork` |
| `CertificationKind` ✅ | `CONTAINER` · `CREW` | `Certification`, `VehicleType.certifies` (ADR-302) |
| `BoxShape` ✅ | `RECTANGLE` · `TRIANGLE` · `TWO_LENGTH_HOIST` · `ROUND_BOTTOM` · `RADIUS_CORNER` | `CertificationBox` |
| `BoxSign` ✅ | `ADD` · `SUBTRACT` | `CertificationBox` (ADR-321) |
| `RecordSource` ✅ | `DEVICE` · `BACK_OFFICE` | `FieldEvent`, `Roe`, the forms |
| `MeasuredAs` ✅ | `CIRCUMFERENCE` · `DIAMETER` | `FieldEvent` (ADR-325) |
| `AddressSource` ✅ | `LOOKED_UP` · `TYPED` | `FieldEvent` |
| `TicketNumberSource` ✅ | `CONTROL` · `GENERATED` | `Project` |
| `QuantitySource` ✅ | `LOAD_CALL` · `SCALE_WEIGHT` · `CARRIED_TICKETS` | `CompletedLoad`, `CompletedHaulOut` |
| `MileageSource` ✅ | `ROAD_ROUTE` · `STRAIGHT_LINE` | `CompletedLoadCollection`, `CompletedHaulOutCollection` |
| `MapSource` | `UPLOAD` · `ESRI_LAYER` · `DRAWN` | `MapVersion` |
| `QcStatus` ✅ | `QC_REVIEW` · `QC_APPROVED` · `QC_ISSUES` · `QC_VOID` | `QcMark` (ADR-363) |
| `SiteAreaSource` | `DRAWN` · `UPLOAD` · `ESRI_LAYER` | `SiteAreaVersion` |
| `ClockEntryKind` | `IN` · `BREAK_START` · `BREAK_END` · `OUT` | `ClockEntry` |
| `PhotoView` | `OPERATOR_WITH_PLACARD` · `INTERIOR_OR_BACK` · `RIGHT` · `LEFT` · `FRONT` | `Photo` |
| `PhotoStage` | `PRE_WORK` · `MEASUREMENT` · `POST_WORK` (ADR-590) | `Photo` |
| `SyncAnswer` | `SAVED` · `QUARANTINED` | `SyncedRecord` |
| `ReconciliationTrigger` ✅ | `SYNC` · `CORRECTION` · `SETUP_CHANGE` · `REPROCESS` | `ReconciliationRun` |
| `FlagBilling` ✅ | `BILLS` · `LINE_NOT_BILLED` · `NOT_BILLED` | `Flag` |
| `FlagCode` ✅ | The codes of `spec/FLAGS.md` §3: 79 today (nine added as §3.10, ADR-345; two more, ADR-348; `SUB_NAME_ALIKE`, ADR-529), in the page's order; a database test holds the enum to the page (ADR-340) | `Flag` |
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
| `User` | ✅ viewer kind, contact, permissions and viewer projects (ADR-315); whether a viewer sees private citizens by name (ADR-336); sign-in's columns in Phase 2 |
| `Device`, `MasterPasscode`, `NumberBlock` | As built; a key's revocation; the overlap refusal |
| `UserCredential`, `Session`, `SecurityEvent` | New in Phase 2 (task 2.2.1, ADR-397…399): sign-in's records, each with its own guards |
| `ReconciliationJob`, `ReconciliationJobTicket` | New in Phase 2 (task 2.3.1, ADR-418): the job queue, with its own guards |
| `DisposalSite` | ✅ built 2026-10-02 (ADR-311): its type (and the type's key), facts, permit, GPS, dates, with `DisposalSiteLabel`, `DisposalSiteTippingFee`, `SiteAreaVersion`, and the project map, `MapVersion` and `Zone` |
| `Assignment` | ✅ `formDocumentTypes` built (ADR-308); its pay items (ADR-286), held to unit rate ones (ADR-309) |
| `PayItem` | ✅ built 2026-10-02 (ADR-309): every field of §3, with `PayItemRate` and `PayItemCrewDayStep`; `AssignmentPayItem` gains the pay item's kind of work |
| `FieldEvent` | Gains the shared and kind-specific columns of §4.1; `deviceId`, `assignmentId`, `setupVersion` become optional for a back-office-created record |
| `CompletedLoad` | ✅ built 2026-10-05 (ADR-340): its one collection link moved to `CompletedLoadCollection`; its quantity and `dissolvedAt`; with `CompletedHaulOut`, `CompletedHaulOutCollection`, `Flag`, `ReconciliationRun`, `ReconciliationDecision` and the worker's zone, map version and worked-out pay item on `FieldEvent` |
| `Transaction` | ✅ built 2026-10-06 (ADR-358): its project, rule, pay item, contract, operating sub, unit, run, property and the two other ticket links; the delete guard follows the lock through them, and an insert guard beside it |
| `InvoiceLock` | ✅ the two other targets (ADR-358); gains the unlock columns and the batch (1.8.2) |
| `AuditRecord` | As built |
| The firm's eighteen lists (§2.3) | ✅ built 2026-10-02 as this page has them (ADR-302) |
| `ProjectContractor` | ✅ gains a unique key on (project, contractor, prime), which a certification's subs point at (ADR-321) |
| `Certification`, `CertificationBox`, `CertificationHelper` | ✅ built 2026-10-03 (ADR-321) |
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
contract, prime, operating_sub, rule, ticket_date, status, qc_status, invoice_batch, locked_at,
mileage, mileage_source, map_data_date
```

A load's or a haul-out's line shows the mileage of the property or pile it prices, read from its
collection row (the user, 2026-10-05, ADR-350 (4): "we want to make sure we are putting it on the
final transactions"); a unit rate line has none.

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
| 23 | **A pay item's rate has its own id, project, created and archived times**; a prime's rate is taken off by archiving and put back by clearing it, never a second row (ADR-309) | §1's *Keys* and *Leaving* for every configuration record; the project lets the prime be held by ADR-305's key |
| 24 | **A crew day's step is hours to the quarter (`decimal(4,2)`) within one day, its quantity `decimal(14,4)`, its from hours once per pay item** (ADR-309) | The hours are captured to the quarter (ADR-084); a quantity is §1's quantity |
| 25 | **An assignment's pay item repeats the pay item's kind of work** (ADR-309) | So the database itself refuses a pay item that isn't a unit rate one (C42), by a foreign key, no trigger (as ADR-305 and 308) |
| 26 | **A site repeats its type's built-in key** (`siteTypeKey`), so the database refuses *Haul-outs leave here* off a TDSR/DMS site (ADR-311) | C52 asked whether the database refuses it too; a foreign key and a check, no trigger (as ADR-305, 308, 309) |
| 27 | **A site's tipping fee pay items are a link table**, several per site (ADR-311; KD-67; **confirmed by the user, ADR-312**, so no longer a default to overturn) | ADR-222's "Service(s)", ADR-202's per CY and per ton; one link would miss a per-ton fee |
| 28 | **A bounding box is four `decimal(38,8)` columns**; a shape's version has its own number; a zone's name is once per version (ADR-311) | The box is read like coordinates (§1); the number tells versions apart in the review; a zone criterion picks by name |
| 29 | **A rule repeats its form's document type; a criterion line its rule's project and form; a pick its line's project, form and criterion; an action its rule's project** (ADR-313) | So the database itself holds a rule to a ticket form and a contract of its own project, and a picked value to the rule's own project and form, by foreign keys alone (the idiom of #22, #25, #26) |
| 30 | **Each line of a rule (criterion, pick, action, chosen item) has its own id, created and archived times**; a line is taken off by archiving. **`quantityFrom` is stated on every *Add transaction*.** **An *Item* line takes the number operators** on the count of the one item it picks, not the list operators (ADR-313) | Nothing is deleted; one way to say "every item" lets two rules be compared; one operator can't mean both "is this item" and "its count equals" |

| 31 | **A field event repeats its debris type's form and that form's document type; an item line and a carried ticket repeat their field event's kind** (ADR-325) | So the database itself holds a picked debris type to the field event's own project and workflow, and a line to the kind it belongs on, by foreign keys alone (the idiom of #22, #25, #26, #29) |
| 32 | **An item line and a carried ticket have their own id and created time**, made by the database (ADR-325) | Every audited row has them; a line travels inside its field event, whose phone-made id is what a retried sync repeats |

**Carried items this page answers:**

| Item | What the page settles |
|---|---|
| C16 | A split's collections; `CompletedHaulOut`; the transaction's pay item, rule, contract and operating sub |
| C17 | The unlock |
| C18 | A contractor viewer follows `Transaction.primeId` and the certification's prime and subs (built, ADR-358, 361) |
| C19 | A person's void |
| C29 | Times the database stamps stay its own; a story asserts order, not those times |
| C36 | The firm's added fields |
| C42 | The assignment's pay items and forms; the real `DisposalSite` (built, ADR-311); a contractor's kind |
| C43 | The series, control ranges, the ROE series; the overlap refusal (its extension is in, ADR-310) |
| C44 | Back-office-created events |

**Not on this page:** a rate history table (the audit log is the only history, ADR-090); an invoice
record (there is none, ADR-061); a driver list, a crew list, a tandem, an expected destination, work
orders (ADR-153, 228, 038, 205).
