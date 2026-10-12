# Acceptance scenarios — Part 5, Sync

✅ ** Approved**: agent-written (ADR-333); the user approves.

← [Acceptance scenarios](README.md) · The part page: [Part 5 — Sync](../parts/05-sync.md)

> Each scenario restates a recorded rule; **From** names it. Values are the example world's
> (`spec/CONVENTIONS.md` §6), the golden mission's (`spec/golden/MISSION.md` §2) and
> `adms-exceptions` Scenario A's (loads `101020` and `101021`). A flag's message is
> `spec/FLAGS.md`'s, word for word. How to read the columns: [README](README.md).
>
> **This file is about what arrives and what the server does with it on arrival**: every record
> received, each stored once, a duplicate kept whole in quarantine, the phone told the truth. What
> a field event records is Part 4's file (`04-field-capture.md`); who holds a phone and how it is
> taken out of service is Part 2's (`02-people-and-devices.md`, section H); what the worker
> concludes afterwards (pairing, statuses, flags) is Part 6's, written with task 1.5.1; what a
> reviewer does with a quarantined record is Part 8's, written with task 1.8.1. A flag is quoted
> here only to show that the record was **taken** and the problem left for later.

**Where each scenario is proven.** Phase 1 builds **intake**: the plain service in `apps/api` that
takes what a phone sends and writes it, with no endpoint in front of it. The scenario harness's
phones drive it (ADR-332). The endpoint, the phone's proof of itself, the idempotency ledger's own
tables (`Sync`, `SyncedRecord`), the photograph's file and the manifest are Phase 2's.

| Mark in **Proven at** | Meaning |
|---|---|
| **1.4.2** | Intake and `QuarantinedRecord`: **database** (the table, its guards and grants) and **story** (the harness's phones syncing through the real intake, in place of the stand-in `packages/scenarios/src/intake.ts`) |
| **built** | Already proven by an earlier task; the test or story is named |
| **1.5.x** · **1.8.x** · **1.9.1** | A later Phase 1 task: the worker's queue, grouping and flags; the reviewer's renumber; the golden mission |
| **API (Phase 2)** · **field app (Phase 3)** · **back office (Phase 4)** | The rule is recorded; nothing in Phase 1 builds it |

**Throughout:** every record intake writes is written as the monitor who made it, from the phone
that made it, and is audited by the database with that monitor as its actor (REQ-011); nothing is
deleted. **Sync refuses nothing over eligibility** (ADR-052): the one thing it turns away is a
second field event of one kind on one ticket, and that is kept whole, in quarantine (ADR-022).

---

## A. A phone connects, and what it sends (steps 1–3)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-05-01 | **Given** `P1-COL-1` has a data connection at 12:05 on Monday and again at the yard at 17:30, **then** it syncs both times: a phone syncs whenever it has a connection, not once at the end of the day, and it needn't be handed in for its work to arrive | ADR-099, 240; Part 5 step 1; AC-02-56 | story (1.4.2: a phone that syncs twice in a day); the connection itself: API (Phase 2), field app (Phase 3) | story `sync` (2026-10-04, ADR-338) |
| AC-05-02 | **Given** `P1-TWR-TDSR`'s battery is flat on Tuesday, **when** it syncs on Wednesday, **then** everything it holds is received whole, Tuesday's disposal on `101005` included: a phone can stay dark for days | ADR-030, 240; golden mission §2 (101005) | story (1.4.2); story (1.9.1) | story `sync` (2026-10-04, ADR-338); story (2026-10-06, ADR-368): `packages/scenarios/src/stories/golden-mission.ts` |
| AC-05-03 | **When** a phone syncs, **then** it first proves which phone it is by signing the server's challenge with the device key it made at enrolment, and reports its clock | ADR-100; ARCHITECTURE §7.4, §9 (1); AC-02-18 · REQ-203 | API (Phase 2) | in part, 2.5.1 part 3 (ADR-440): the phone proves which phone it is by signing the server's challenge with the key it made at enrolment (`apps/api/test/phone-proofs.test.ts`; the story `sync`); its clock reported with the sync: 2.6.2; **its clock reported with the sync, 2.6.2 part 2 (ADR-472):** `apps/api/test/sync.test.ts` (a sync is a proven phone's, and is kept with the phone's clock and the server's) |
| AC-05-04 | **Given** a phone whose clock was 2 hours 14 minutes off the server's when it synced, **then** every record of that sync is received, and its tickets are flagged: "Ticket 101008: device clock was 2 h 14 m off at sync." The threshold is a policy value, never a literal | ADR-100; `spec/FLAGS.md` `DEVICE_CLOCK_OFF`; invariant 16 · REQ-203 | the difference kept with the sync: API (Phase 2); the flag: domain (1.5.5) | in part: the flag, domain, as AC-06-58; counted (2026-10-06, ADR-369); the difference kept with the sync: Phase 2; **the difference kept with the sync, 2.6.2 part 2 (ADR-472):** `apps/api/test/sync.test.ts` (8,040 s for 2 h 14 m, every record received); the worker reading it: 2.6.2 part 3 |
| AC-05-05 | **When** a phone syncs, **then** its records go first and its photographs after: field events, ROEs, surveys, incidents and drop-off logs are small, and a slow photograph never holds up the records behind it | ADR-101; ARCHITECTURE §9 (2); Part 5 step 3 · REQ-203 | API (Phase 2) |  |
| AC-05-06 | **Given** `P1-COL-1` passed from Ana to Sam on Monday afternoon with Ana's morning collections still unsent, **when** it next syncs, **then** Ana's records arrive with Sam's and each is its own monitor's: Ana's are written as Ana, from that phone | ADR-095, 120; ARCHITECTURE §7.3; AC-02-46 | story (1.4.2: two monitors' records from one phone); the hidden queue on the phone: field app (Phase 3) | story `sync` (2026-10-04, ADR-338) |
| AC-05-07 | **Given** Ana started a field event by mistake and cancelled it, **then** it is not among what her phone sends: a cancelled field event stays on the phone and took no number | ADR-056, 332; AC-04-95 | built: harness tests (1.3.7, ADR-332); field app (Phase 3) | story `sync` (2026-10-04, ADR-338) |
| AC-05-08 | **Given** Ana finished her collection on `101001`, synced it, and reopened it before she ended her shift, **then** the change travels as the phone's edit log and is written to the audit log under Ana. After her shift ends she can change nothing | ADR-240 (agent default); ARCHITECTURE §9 (8); AC-02-45 | API (Phase 2); field app (Phase 3) |  |
| AC-05-09 | **Given** a photograph taken with Ana's collection, **when** its file is uploaded after the records, **then** an interrupted upload continues from where it stopped, and the server checks the file's fingerprint against the one the phone took at capture | ADR-101; ARCHITECTURE §9 (5), §11 · REQ-203 | the photograph's record, with its fingerprints, written by intake: story (1.4.2); the upload and its check: API (Phase 2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-10 | **Given** a tandem's two disposals at Bayline County Landfill share scale receipt `BCL-88241`, **when** the tower's phone syncs, **then** the receipt is one record, written before the disposals that point at it; the second disposal finds it already there under the same phone-made id and points at it too | ADR-326; `adms-scale-receipts`; BACKLOG C65 | story (1.4.2) | story `sync` (2026-10-04, ADR-338) |

## B. Stored once: a retry is the same record (step 4)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-05-11 | **Given** every record a phone sends carries an id the phone made when the record began, **then** the server keeps that id as the record's own: Ana's collection on `101001` has the same id on her phone and in the database | KD-56; `adms-data-model` §3.4; AC-04-17 | built: story `p1-field-days` (1.3.7, ADR-332); story (1.4.2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-12 | **Given** Ana's collection on `101001` was saved, **when** her phone sends the same record again (the connection dropped before the answer came back), **then** it is answered "already saved": one field event, never two, and nothing in quarantine. A retry is never taken for a duplicate ticket number | KD-56; ARCHITECTURE §9 (3); Part 5 step 4 · REQ-120b, 203 | story (1.4.2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-13 | **Given** a sync of 25 field events that dropped after the twelfth, **when** the phone sends all 25 again, **then** the twelve are answered "already saved", the other thirteen "saved", and the database holds 25 | KD-56; ARCHITECTURE §9 (3) · REQ-203 | story (1.4.2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-14 | **Given** an incident, a drop-off log, an ROE made on a phone and a scale receipt, **when** each is sent twice, **then** each is one record: the phone-made id is the same record whatever its kind | KD-56; `adms-data-model` §3.4; Part 5 step 3 | story (1.4.2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-15 | **Given** Kim's second disposal on `101020` is in quarantine (AC-05-17), **when** her phone sends that same record again, **then** it is still one quarantined record and the phone is still not told "saved" | ADR-022; ARCHITECTURE §9 (3), (4); `spec/DATA-MODEL.md` §4.5 (`SyncedRecord.answer`) · REQ-120b | story (1.4.2) | story `sync`, database `quarantined-records.test.ts` (2026-10-04, ADR-338); through the endpoint, 2.6.2 part 2 (ADR-472): `apps/api/test/sync.test.ts` |
| AC-05-16 | **Given** the server's idempotency ledger, **then** it is keyed on the phone-made id and keeps, for each record, the sync that brought it and the answer it was given (saved or quarantined) | ARCHITECTURE §9 (3); `spec/DATA-MODEL.md` §4.5 (`Sync`, `SyncedRecord`) · REQ-203 | API (Phase 2) | ✅ 2.6.2 parts 1, 2 (ADR-471, 472): `packages/db/test/syncs.test.ts`, `apps/api/test/sync.test.ts` (each stored record's row names the sync that brought it and `SAVED` or `QUARANTINED`; a retry answered from it) |

## C. A duplicate is quarantined in full (step 5)

Scenario A of `adms-exceptions` §4.3a: Rivera's self-loader, cert `730416`. Ana records collection
`101020` at 22 Elm St (loaded by 09:40) and `101021` at 40 Birch Ln (loaded by 11:05). At Marsh Road
TDSR Kim scans `101020` at 10:22, and at 11:40 scans `101020` again from a stale copy: it should
have been `101021`.

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-05-17 | **Given** Kim's 10:22 disposal on `101020` is saved, **when** her 11:40 disposal on `101020` arrives (a different record: its own phone-made id), **then** it is a second field event of one kind on one ticket and is **quarantined**: it is not saved as a field event | ADR-022, 236; `adms-exceptions` §4.3a, Scenario A; Part 5 step 5 · REQ-120b | story (1.4.2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-18 | **Given** that quarantined disposal, **then** it is kept in full: the record exactly as the phone sent it (its times, GPS, cert number, debris type, load call, the number as scanned), under its phone-made id, with its project, its phone, Kim as its monitor, the reason, the record that holds the number (the 10:22 disposal) and when the server received it | ADR-022, 292; `spec/DATA-MODEL.md` §4.5 (`QuarantinedRecord`) · REQ-120b | database and story (1.4.2) | database `quarantined-records.test.ts`, story `sync` (2026-10-04, ADR-338) |
| AC-05-19 | **Given** that quarantined disposal, **then** it is never dropped and never merged: the 10:22 disposal is unchanged, not one of its fields overwritten by the later record | ADR-022; `adms-exceptions` §4.3a ("it is not a wastebasket") · REQ-120b | story (1.4.2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-20 | **Given** that quarantined disposal, **then** the phone is answered "not saved (quarantined)", with the reason; it is never answered "saved" | ADR-022; ARCHITECTURE §9 (4); Part 5 step 7 · REQ-120b | the answer intake gives: story (1.4.2); the endpoint: API (Phase 2); what the monitor sees: field app (Phase 3) | story `sync`, domain `intake.test.ts` (2026-10-04, ADR-338); the endpoint, 2.6.2 part 2 (ADR-472): `apps/api/test/sync.test.ts` |
| AC-05-21 | **Given** that sync, **then** ticket `101020` is its collection and its 10:22 disposal, and `101021` is its collection alone, `PENDING`. The quarantined record is no ticket's field event: the worker never reads it, it has no status and it bills nothing | ADR-022; `adms-exceptions` Scenario A | story (1.4.2); the worker's part: story (1.5.3) | story `sync` (2026-10-04, ADR-338) |
| AC-05-22 | **Given** the quarantined disposal has photographs, **then** each photograph's record belongs to the quarantined record while it waits, and to nothing else | ADR-292 (5); `spec/DATA-MODEL.md` §4.4 (`Photo.quarantinedRecordId`); BACKLOG C65 | database (1.4.2) | database `quarantined-records.test.ts`, story `sync` (2026-10-04, ADR-338) |
| AC-05-23 | **Given** a quarantined record, **then** nobody can delete it, and what the phone sent can't be changed; only its resolution (who, when, what) is written later | ADR-022; invariant 1; `spec/DATA-MODEL.md` §4.5 | database (1.4.2) | database `quarantined-records.test.ts` (2026-10-04, ADR-338) |
| AC-05-24 | **Given** the rule is one field event of each kind per project, workflow, bare number and split suffix, **then** it holds for every kind: a second collection on `101020`, a second haul-out collection or haul-out disposal on `201001` and a second unit rate event on `301001`, each from a different record, are quarantined the same way | ADR-062, 236; ARCHITECTURE §5.4; `adms-exceptions` §4.3a · REQ-120b | story (1.4.2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-25 | **Given** P2's split load `102001-A`, `102001-B` with one disposal on `102001`, **when** a second, different collection `102001-A` arrives, **then** it is quarantined; and a second disposal on the base number `102001` is quarantined too: a load dumps once | ADR-022, 155; `adms-exceptions` §4.3a ("Other duplicate and orphan shapes") | story (1.4.2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-26 | **Given** the database's own key (AC-04-16), **then** a second field event of one kind on one ticket can't be written as a field event by any path, intake included: quarantine is where intake puts it, never a way round the key, and the key is never relaxed | ARCHITECTURE §5.4; invariant 17; AC-04-16 | built: `field-events.test.ts`, AC-04-16 (1.3.3); story (1.4.2) | database `quarantined-records.test.ts`, story `sync` (the key itself: AC-04-16) (2026-10-04, ADR-338) |
| AC-05-27 | **Given** the quarantined 11:40 disposal, **then** it waits for a person: nothing in sync or in the worker renumbers it, pairs it or guesses the number it should have had | ADR-022, 028; `adms-exceptions` §4.3a ("the worker can't deduce the right number") | story (1.4.2); the worker's part: story (1.5.3) | story `sync` (2026-10-04, ADR-338) |
| AC-05-28 | **Given** the quarantined 11:40 disposal, **when** Luis renumbers it to `101021`, **then** it becomes a field event that keeps its phone-made id, its photographs move to it, the quarantined record is marked resolved (by Luis, when, how) and is kept, and `101021` reprocesses | ADR-022, 051, 292 (5); `adms-exceptions` §4.3a ("Resolving a quarantine") | 1.8.x (in full: `08-review-and-corrections.md`) | story (2026-10-06, ADR-364): `packages/scenarios/src/stories/p1-reviewed.ts` (AC-08-25, 26) |
| AC-05-29 | **Given** a quarantined record, **then** it shows in the one review queue beside the record that holds its number | ADR-022, 228; Part 8 ("One review queue") | back office (Phase 4) |  |

## D. What is not a duplicate

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-05-30 | **Given** load `101020`, **then** its collection and its disposal are the two field events of one ticket, never duplicates of each other, whichever arrives first | ADR-236; `adms-domain` §1.2 | story (1.4.2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-31 | **Given** load `101001` on P1, **then** a haul-out collection numbered `101001` on P1, and a collection numbered `101001` on P2, are saved: a number is its project's and its workflow's | ADR-046, 062; AC-04-02 | story (1.4.2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-32 | **Given** P2's split load, **then** collections `102001-A` and `102001-B` are both saved: one collection per property, never duplicates of each other | ADR-032, 033; `adms-exceptions` Scenario D | story (1.4.2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-33 | **Given** a bare collection `102001` arrives beside `102001-A`, **then** it is saved, not quarantined (its suffix differs); the split's shape is flagged at reconciliation | ADR-033, 173; `adms-exceptions` §4.3; REQ-120b1 | story (1.4.2); the flag: domain (1.5.3) | story `sync` (2026-10-04, ADR-338) |
| AC-05-34 | **Given** two collections on cert `730415` with overlapping loading times, numbered `101030` and `101031` (one pile issued two numbers), **then** both are saved: they are two tickets, not a duplicate number. The overlap is flagged later and a person voids the phantom | ADR-027, 028; `adms-exceptions` Scenario B | story (1.4.2); the flag: domain (1.5.5) | story `sync` (2026-10-04, ADR-338) |
| AC-05-35 | **Given** two scale receipts numbered `CCL-51207` on P1 from different trips, **then** both are saved: a scale receipt's number is never unique and never quarantines anything | ADR-328 (2), 331; AC-04-72 | built: `scale-receipts-and-photos.test.ts`, AC-04-72 (ADR-331); story (1.4.2) | story `sync` (2026-10-04, ADR-338) |

## E. Nothing else is refused (step 6)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-05-36 | **Given** a field event on a certification whose tag expired, one dated outside P1's active window, and one whose work time is later than the time the server received it, **then** each is received like any other; each problem is a flag at reconciliation ("Ticket 101017: review certification 730416 (tag expired 30-Sep-2026)."; "Ticket 101023: project not active on 03-Feb-2027."; "Ticket 101008: work time 21:40 is after it was received at 20:15.") | ADR-052; Part 5 step 6; `spec/FLAGS.md` `TAG_EXPIRED`, `PROJECT_NOT_ACTIVE`, `WORK_TIME_AFTER_RECEIVED`; AC-04-94 · invariant 19 | story (1.4.2); the flags: domain (1.5.5) | story `sync` (2026-10-04, ADR-338) |
| AC-05-37 | **Given** a field event with cert number `730499`, which no certification on P1 has, **then** it is received with the number as scanned and no certification found | ADR-017, 154; AC-04-27, AC-03-41 | story (1.4.2); the flag: domain (1.5.5) | story `sync` (2026-10-04, ADR-338) |
| AC-05-38 | **Given** a field event that reaches the server without its debris type, its load call or its kind of work, or with a typed number and no reason, or that ends before it starts, **then** it is kept as sent and flagged later: the phone is what stops a monitor finishing a record with a gap | ADR-329 (1), (2), (6) | story (1.4.2); the flags: domain (1.5.5, 1.5.7; their wording: BACKLOG C67 (g)) | story `sync` (2026-10-04, ADR-338) |
| AC-05-39 | **Given** a field event whose GPS fix is impossible (half a fix, or a latitude past 90), **then** the field event is kept **without that fix** and flagged; the record is not lost for it, and the database's own check on a fix stays | ADR-329 (5) | story (1.4.2); the flag: domain (1.5.5; its wording: BACKLOG C67 (g)) | story `sync`, database `quarantined-records.test.ts`, domain `intake.test.ts` (2026-10-04, ADR-338) |
| AC-05-40 | **Given** Tariq worked Monday under an unplanned assignment set up on his phone with the master passcode, **when** the phone syncs, **then** his records are received as any are, marked and not flagged, and the assignment is on the dispatch board | ADR-240; AC-02-38 | the records, received and marked: story (1.4.2); the assignment's own arrival: API (Phase 2); the board: back office (Phase 4) | story `sync` (2026-10-04, ADR-338); **the assignment's own arrival ✅ at the API, 2.5.4 part 1 (ADR-457):** `apps/api/test/phone-unplanned-assignments.test.ts`, and the story `sync` now receives Tariq's through the API's `UnplannedAssignments`; the board's read at the API: `apps/api/test/assignments.test.ts`; its screen: Phase 4 |

## F. What intake fills in on arrival

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-05-41 | **Given** Ana's collection carries cert number `730415`, **then** intake finds P1's certification of that number and the field event points at it; the number as scanned stays on the field event. The phone sends only the number | ADR-017, 324; AC-03-40; BACKLOG C68 | story (1.4.2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-42 | **Given** a collection on P2 carries ROE number `R-0007`, **then** intake finds P2's ROE of that number and the field event points at it, keeping the number as picked or typed; **given** the collection arrives before its ROE does, **then** it is received pointing at none, and points at the ROE once the ROE arrives | ADR-149, 292 (3); BACKLOG C66 | story (1.4.2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-43 | **Given** any record received, **then** it keeps the time the server received it, beside the phone's own times and offset; the received time is the server's clock, never the phone's | ADR-100; ARCHITECTURE §10; AC-04-21 | built: story `p1-field-days` (the stand-in); story (1.4.2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-44 | **Given** a field event just received, **then** its status is `PENDING`: intake writes none of the worker's conclusions (no status but `PENDING`, no zone, no flag, no completed load, no transaction) | ADR-236, 270; invariants 4, 21; AC-04-29 | story (1.4.2) | story `sync` (2026-10-04, ADR-338) |

## G. What the phone is told and what it receives (steps 7–8)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-05-45 | **When** a phone syncs, **then** each record gets its own answer: saved, already saved, or not saved (quarantined, with the reason). One quarantined record doesn't stop the records sent with it from being saved | ADR-022; ARCHITECTURE §9 (4); Part 5 step 7 · REQ-203 | the answers intake gives: story (1.4.2); the endpoint: API (Phase 2) | story `sync` (2026-10-04, ADR-338); the endpoint, 2.6.2 part 2 (ADR-472): `apps/api/test/sync.test.ts` (a quarantined record, one that can't be read and one the database refuses each beside a record that is saved) |
| AC-05-46 | **Given** a record answered "not saved", **then** the phone shows it to the monitor as not saved; it is never swallowed | ADR-022; `adms-field-app` §4A.5 · REQ-308c | field app (Phase 3) |  |
| AC-05-47 | **Given** `P1-COL-1` used `101001`–`101006` of its block `101001`–`102000`, **when** it syncs and reports the last number it used, **then** it is topped up to a full block of 1,000 unused numbers, however few it used; a certifying phone's cert numbers the same, to 100 | ADR-065, 323; Part 5 step 8; AC-04-04; BACKLOG C64 | story (1.4.2) | ticket numbers: story `sync` (2026-10-04, ADR-338); a certifying phone's cert numbers topped up to 100: story `numbering` (2026-10-06, ADR-371) |
| AC-05-48 | **When** a phone syncs, **then** it receives its assignment's lists, numbered as a setup version (the certified trucks and crews, sites and its site's lookup, ROEs, the roster and login list, control ranges), and any new check of the master passcode; any phone with a connection can refresh its lists at any time | ADR-151, 227, 240; ARCHITECTURE §9 (6); AC-02-23 · REQ-203 | API (Phase 2: the manifest; `phone-lists.ts` is its stand-in, BACKLOG C68) | in part, API (2026-10-09, ADR-453): a phone's lists are numbered as a setup version, a new one only when what its project's phones are shown changed, and any phone with a connection refreshes them (`apps/api/test/phone-lists.test.ts`, `packages/db/test/setup-manifests.test.ts`); at a sync, the roster and login list and a new check of the master passcode: 2.5.3 part 4, 2.6.2 |

## H. Any order, in bursts, and what comes next (step 9; "What to expect")

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-05-49 | **Given** the tower's phone syncs at 12:05 and Ana's at 17:30, **then** the disposals on `101001`, `101002` and `101003` are saved hours before their collections: a disposal with no collection yet is received and waits, `PENDING`, never refused and never alerted on | ADR-030, 053; `adms-exceptions` Scenario C | built: story `ticket-101001` (synced out of order); story (1.4.2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-50 | **Given** P1's Monday and Tuesday (25 field events, one scale receipt, an incident and a drop-off log), **when** they are received in field order, in reverse, and with Monday's work behind Tuesday's, **then** what is saved is the same each time: arrival order changes nothing but each record's received time | ADR-030; `adms-exceptions` Scenario C (1), (3); golden mission §2 · REQ-120h | story (1.4.2) | stories `p1-field-days` (field order) and `p1-any-order` (newest first, Tuesday ahead of Monday) (2026-10-04, ADR-338) |
| AC-05-51 | **Given** a quiet afternoon and then every phone of the project syncing at once, **then** every record of the burst is received, each stored once, none lost | ADR-030; `adms-exceptions` Scenario C (4); Part 5 ("The load is bursty") · REQ-120h | story (1.4.2: every phone's day at once); the endpoint under load: API (Phase 2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-52 | **Given** a collection received on Tuesday night whose disposal is on a phone that is flat, **then** it stays `PENDING` with no flag, however long it waits: an unpartnered field event never expires and is never flagged for its age | ADR-053; golden mission §2 (101005) | story (1.4.2); the worker's part: story (1.5.3, 1.9.1) | story `sync` (2026-10-04, ADR-338); story (2026-10-06, ADR-368): `packages/scenarios/src/stories/golden-mission.ts` |
| AC-05-53 | **When** records are received, **then** reconciliation is queued for every ticket they touch, and the sync doesn't wait for it: the phone has its answers before any ticket is reconciled | ADR-030; ARCHITECTURE §9 (7), §13; Part 5 step 9 | the queue: 1.5.x (with the worker's run); story (1.9.1) | in part: a story runs the worker after each sync, and the sync has answered before it (every worker story); the queue itself: Phase 2 (BACKLOG C71, C82): built (ADR-418…420), and a sync's own job is task 2.6.2 |

## I. A phone taken out of service

`P1-TWR-LF` can't be found on Monday evening; Luis marks it lost at 6:10 pm (AC-02-59). It turns up
on Wednesday holding a disposal recorded at 5:40 pm on Monday and one at 6:30 pm.

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-05-54 | **Given** that phone syncs on Wednesday, **then** both disposals are received: a phone taken out of service is never refused its work | ADR-134; `adms-exceptions` §4.3; AC-02-60 · REQ-124c | story (1.4.2) | story `sync` (2026-10-04, ADR-338) |
| AC-05-55 | **Given** those two disposals, **then** the 5:40 pm one comes in as usual, and the 6:30 pm one's ticket is flagged, "Ticket 101008: made on a phone taken out of service.", and still bills. Before or after is judged by the record's work time against the removal time, never by when it arrived | ADR-134; `spec/FLAGS.md` `PHONE_OUT_OF_SERVICE`; AC-02-60 · REQ-124c | the flag: domain (1.5.5) | domain, as AC-06-62; counted (2026-10-06, ADR-369) |
| AC-05-56 | **Given** the server has confirmed every record from that phone, **then** its number block is retired and it is wiped; only then is its key revoked and the phone refused | ADR-065, 134; ARCHITECTURE §7.4; AC-02-61 · REQ-124c | the block retired: story (1.4.2; `NumberAllocator.retire`, built by 1.3.2); the wipe: field app (Phase 3); the refusal: API (Phase 2; C47) | **in part**: `retire` is called after the phone's last sync, story `sync`; that phone, a tower, held no block (a phone with blocks retired: story `numbering`) (2026-10-04, ADR-338) |

---

## Where each scenario is first proven

| Where it is first proven | Scenarios | How many |
|---|---|---|
| Built already (an earlier task's test or story) | AC-05-07, 11, 26, 35, 43, 49 | 6 |
| Task 1.4.2, intake and quarantine | AC-05-01, 02, 06, 09, 10, 12…15, 17…25, 27, 30…34, 36…42, 44, 45, 47, 50, 51, 52, 54, 56 | 39 |
| Later Phase 1 tasks only (1.5.x, 1.8.x) | AC-05-28, 53, 55 | 3 |
| Phases 2–4 only | AC-05-03, 04 (its flag: 1.5.5), 05, 08, 16, 29, 46, 48 | 8 |

**Passing after task 1.4.2 (2026-10-04, ADR-338): 43 of 56, and two in part** (AC-05-47: the
cert numbers' top-up isn't told; AC-05-56: the lost phone held no block). Of task 1.4.2's 39, 37
pass; the six built earlier are each named by this file's ID in the story `sync`. The other eleven
wait for the worker (AC-05-28, 53, 55) and for Phases 2–4.

56 scenarios. Many have a second part proven later (a flag in Milestone 1.5, the endpoint in Phase
2, a screen in Phase 3); each row says where. The six built already are marked passing here when
task 1.4.2 names a test by this file's ID, from a run that is seen.

## Left to the task that builds it

> **Decided by task 1.4.2 (ADR-338), each an agent default the user may overturn:** points 1…12
> and 14 below. In short: (1) a retry is known by the phone-made id already being a record of its
> kind or a quarantined record; `Sync` and `SyncedRecord` wait for Phase 2 whole. (2) A retry that
> differs is answered "already saved" and changes nothing. (3) The reason is one of two,
> `DUPLICATE_FIELD_EVENT` or `DUPLICATE_ROE_NUMBER`, with a plain message; the resolution is free
> text until 1.8.x. (4) The first received holds the number. (5) A voided ticket's field event
> still holds its number. (6) Item lines and carried tickets stay inside the record as sent; its
> scale receipt is saved as its own record. (7) Audited in the records domain; a client user and
> an auditor see that it waits, and the record as sent only if the firm lets them see private
> citizens; a contractor user nothing. (8) Quarantined, as a duplicate field event is. (9) Saved
> as sent, and the sender told. (10) `FieldEvent.unreadableGps` keeps the fix as sent; a number
> that isn't digits is kept in `ticketNumber` as sent. (11) Intake throws: nothing is saved and
> the record stays on the phone. (12) Every phone of the story's day at once, 28 records.
> (14) Asked again, up to three times; a reset phone's blocks are reclaimed by whoever resets it
> (`NumberAllocator.reclaim`, Phase 3). Points 13, 15 and 16 stay with the tasks named.

Nothing recorded settles these, so no scenario asserts them. Each is decided in the ADR of the task
named, as an agent default the user may overturn, unless that task finds it changes money, evidence
or a monitor's work (ADR-230).

| # | What isn't settled | Decided with |
|---|---|---|
| 1 | How Phase 1's intake knows a retry without Phase 2's ledger tables: by the phone-made id already being a field event, a form, a scale receipt or a quarantined record of the same kind (the likely default), and whether `Sync` and `SyncedRecord` wait for Phase 2 whole | 1.4.2 |
| 2 | What a retry is answered when the record sent the second time **differs** from the one saved under that id (a change to a finished field event travels by the edit log, which is Phase 2's) | 1.4.2 |
| 3 | The words of a quarantined record's reason (`reason` is open on `spec/DATA-MODEL.md`), and of its resolution | 1.4.2; the resolution: 1.8.x |
| 4 | Which of two records holds the number when both arrive in one sync, or the later-made one arrives first: the first received holds it (the likely default; the reviewer's renumber puts either right), or the earlier by field time | 1.4.2 |
| 5 | Whether a record is a duplicate when the field event holding its number is on a **voided** ticket | 1.4.2; 1.8.x |
| 6 | What becomes of a quarantined disposal's scale receipt, item lines and carried tickets: inside the record as sent, or the receipt saved as its own record | 1.4.2 |
| 7 | A quarantined record's audit domain, and what a client user, a contractor user and an auditor see of it (C18, C59): one `guard_viewer` decision | 1.4.2 |
| 8 | An ROE made on a phone whose number is already on the project under another id (an ROE's number is held once per project; the monitor's record must not be lost) (C66) | 1.4.2 |
| 9 | A form's answers that don't fit the definition version answered: intake runs `formAnswersSchema`; what it does when they fail (the monitor's record must not be lost) (C66, C68) | 1.4.2 |
| 10 | How intake keeps the fact that it dropped an impossible GPS fix, so the flag can be raised (C67 (f)); and how it keeps a ticket number that isn't digits (ADR-329 (6): kept, flagged, pairs with nothing) | 1.4.2; the flags' wording, with the user: 1.5.5 (C67 (g)) |
| 11 | A record whose project, phone, monitor or assignment the server doesn't know; a record from a phone on another project than the one it names (the phone's proof of itself is Phase 2's) | 1.4.2 for what the service is given; API (Phase 2) |
| 12 | How big the burst of AC-05-51 is in the story: no figure is recorded ("thousands of field events" is the part page's; "size for the spike") | 1.4.2; the load test: Phase 2 |
| 13 | How "reconciliation is queued" is kept before the worker exists: a queue's own record, or the worker reading every ticket with a field event received since its last run | 1.5.2, 1.5.3 |
| 14 | A top-up thrown because the series moved on is asked again; a reset phone's block reclaimed at its sync (C64) | 1.4.2 |
| 15 | Whether `DEVICE_CLOCK_OFF` can be raised in Phase 1 at all: the difference is kept on `Sync`, which is Phase 2's | 1.5.5 |
| 16 | Where the UUIDv7 maker lives once intake is real (`packages/scenarios/src/ids.ts` today; C31 moves it to `packages/domain` when the field app needs it) | Phase 3 |

**Carried into task 1.4.2** (`agent_store/BACKLOG.md`, the register): **C31's first part** (the
stand-in gives way to the real intake; the stories sync through it); **C63** (intake's part is the
points above; its point 14 fell away, ADR-331); **C64** (the last used number and the top-up; a lost
phone's blocks retired after its last sync); **C65** (`Photo.quarantinedRecordId`, the one-owner
check written again; a scale receipt before its disposals; a photograph's record with its
fingerprints and key); **C66** (the ROE a number finds, then and later; a form's answers against
its definition); **C68** (an ROE made on a phone is written; the certification and the ROE looked
up; each series' last used number). **C67 (c), (d) and (e)** are each their own task before 1.4.2
(an incident's optional contractor, cert number and ROE number; a viewer's sight of private
citizens' names; a photograph's archive mark and label), so intake takes forms in their final
shape; **C67 (f)** is point 10 above; **C67 (g)** is 1.5.5's and 1.5.7's.

**Not in Phase 1** (their rules are recorded): the sync endpoints, the phone's proof of itself, the
`Sync` and `SyncedRecord` tables, the edit log (`FieldEventEdit`), the photograph's upload, the
manifest (`SetupManifest`) and the shared sync contract with its test suite (Phase 2, REQ-203);
the phone's queue, its "not saved" display, sync and turn in, and the wipe (Phase 3); the review
queue's screen (Phase 4); time-clock entries (Phases 3–4, with the clock's tables).
