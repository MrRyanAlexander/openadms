# Acceptance scenarios — Part 6, Reconcile

✅ ** Approved**: agent-written (ADR-339); the user approves.

← [Acceptance scenarios](README.md) · The part page: [Part 6 — Reconcile](../parts/06-reconciliation.md)

> Each scenario restates a recorded rule; **From** names it. Values are the example world's
> (`spec/CONVENTIONS.md` §6), the golden mission's (`spec/golden/MISSION.md` §2, §3) and the flag
> catalogue's own example tickets. A flag's message is `spec/FLAGS.md`'s, word for word. How to
> read the columns: [README](README.md).
>
> **This file is about what the worker concludes from a ticket's field events**: which events are
> one ticket, its status, its flags, its zone and mileage, its quantity, and the completed load or
> haul-out it writes. What a field event records is Part 4's file; what arrives and is stored is
> Part 5's; **which rules pass and what each line costs is Part 7's** (written with task 1.6.1): a
> pricing flag has one scenario here, so every flag of the catalogue is on this page, and its
> detail there. What a reviewer does with a flag (correct, renumber, void, accept) is Part 8's
> (task 1.8.1): here only what the worker does when the ticket comes back.

**Where each scenario is proven.** Milestone 1.5 builds the worker without prices: the derived
records, grouping, quantities, checks and flags, mileage, and the run.

| Mark in **Proven at** | Meaning |
|---|---|
| **1.5.2** | **database**: `CompletedLoad`, `CompletedHaulOut` and their collection rows, `Flag`, `ReconciliationRun`, `ReconciliationDecision`, their guards and grants |
| **1.5.3** · **1.5.4** · **1.5.5** · **1.5.6** · **1.5.7** | **domain** (`packages/domain`, no database): grouping and status · quantities · checks between events, on the certification and on time · checks on place · checks on quantity, the pay item's settings, unit rate work and forms |
| **1.5.8** | Mileage: what the worker asks the routing and address servers, and what it keeps |
| **1.5.9** | **story**: the worker's run, driven by the scenario harness |
| **1.6.x** · **1.8.x** · **1.9.1** | A later Phase 1 task: the rules and their lines; the reviewer's actions; the golden mission |
| **API (Phase 2)** · **back office (Phase 4)** | The rule is recorded; nothing in Phase 1 builds it |

**Throughout:** the worker never refuses and never guesses (ADR-052). Every problem is a flag; any
open flag makes the ticket `MANUAL_REVIEW`, and a ticket in review **still bills** wherever an
amount can be computed (ADR-060). Everything the worker writes is written as the system actor and
audited by the database (ADR-273); it changes nothing a monitor captured (invariant 21).

**The catalogue is 66 flags today** (67 when it was approved; `REVIEW_ORIGINAL_CERTIFICATION` was
withdrawn by ADR-328). Each has at least one scenario below; the table at the end lists which.

---

## A. What starts a run, and what the worker reads

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-06-01 | **Given** Ana's phone syncs her collection on `101001`, **then** reconciliation is queued for ticket `101001` and the sync doesn't wait for it; the worker works the ticket afterwards | ADR-030, 236; ARCHITECTURE §13; Part 6 ("What starts it"); AC-05-53 | story (1.5.9) | |
| AC-06-02 | **Given** a field event the back office created or corrected, a renumber, a void, an unvoid or an accepted flag, **then** each queues its ticket, a `COMPLETED` one included, and the worker draws its conclusions again from the ticket's current field events | ADR-086, 166, 236; Part 6 ("What starts it") · REQ-116 | the worker's part: story (1.5.9); each action: 1.8.x | |
| AC-06-03 | **Given** Dana changes P1's site circle, loads a new map version, or corrects Marsh Road TDSR's GPS or shape, **then** every **un-invoiced** ticket the change touches is queued and worked again; a ticket locked as invoiced is left as it is | ADR-090, 136, 141, 208; Part 6 ("What starts it") · REQ-124b | story (1.5.9); a rate or a rule changed: 1.6.x; the lock: 1.8.x | |
| AC-06-04 | **Given** Kim's second disposal on `101020` waits in quarantine, **then** the worker never reads it: ticket `101020` is its collection and its 10:22 disposal, and `101021` is its collection alone | ADR-022; `adms-exceptions` Scenario A; AC-05-21, 27 | story (1.5.9) | |
| AC-06-05 | **Given** P1's Monday and Tuesday, **when** the field events are received in field order, newest first, or with Tuesday's ahead of Monday's, **then** every ticket ends with the same status, flags and quantities: arrival order carries no information | ADR-030; `adms-exceptions` Scenario C (1), (3) · REQ-120h | story (1.5.9) | |
| AC-06-06 | **Given** a field event just received, **then** only the worker writes its status, its zone and map version and a unit rate event's worked-out pay item, and the worker changes nothing the monitor captured | ADR-270; invariant 21; AC-04-29 · REQ-116 | database (1.5.2) | database (2026-10-05, ADR-340): `packages/db/test/derived-records.test.ts` |

## B. Gather: which field events are one ticket (step 1)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-06-07 | **Given** Ana's collection and Kim's disposal on P1 both carry number `101001`, **then** they are one ticket: field events are grouped on project, workflow and bare number | ADR-019, 062; Part 6 step 1 · REQ-120 | domain (1.5.3) | domain (2026-10-05, ADR-341): `packages/domain/test/tickets.test.ts` |
| AC-06-08 | **Given** a haul-out collection numbered `101001` on P1, **then** it is never grouped with load `101001`'s field events: the workflow is part of the group, and each workflow has its own series | ADR-046, 062; `adms-validation` §5.1 · REQ-120 | domain (1.5.3) | domain (2026-10-05, ADR-341): `packages/domain/test/tickets.test.ts` |
| AC-06-09 | **Given** a collection numbered `101001` on P2, **then** it is never grouped with P1's `101001`: a number is its project's | ADR-046; AC-05-31 | domain (1.5.3) | domain (2026-10-05, ADR-341): `packages/domain/test/tickets.test.ts` |
| AC-06-10 | **Given** Ana's collection `101006` and Kim's disposal typed `101060` (the same truck `730416`, the same debris type, forty minutes apart), **then** the worker does not pair them: nothing but the number finds a partner, never the certification, the times, the debris type or the kind. Both wait, `PENDING`, until Luis renumbers the disposal | ADR-019, 028; golden mission §2 (101006); `adms-exceptions` ("the worker can't deduce the right number") · REQ-120 | domain (1.5.3); the renumber: 1.8.x; story (1.9.1) | in part: domain (2026-10-05, ADR-341), `packages/domain/test/tickets.test.ts`; the renumber: 1.8.x; the story: 1.9.1 |
| AC-06-11 | **Given** P2's collections `102001-A` and `102001-B` and the disposal on `102001`, **then** they are one ticket: the split suffix is stripped to find the group, and grouping on the number as written would leave three groups of one | ADR-032, 033; `adms-exceptions` Scenario D · REQ-120e | domain (1.5.3) | domain (2026-10-05, ADR-341): `packages/domain/test/tickets.test.ts` |
| AC-06-12 | **Given** a ticket's field events, **then** the worker orders them by field time (a collection's end, a disposal's start), never by when each reached the server | ADR-030, 100; Part 6 step 1; `adms-exceptions` Scenario C (1) | domain (1.5.3) | domain (2026-10-05, ADR-341): `packages/domain/test/tickets.test.ts` |

## C. Shape and status (step 2; `adms-validation` §5.4)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-06-13 | **Given** `101005`'s collection is in and its disposal is on a phone that is flat, **then** the ticket is `PENDING` with no flag, no completed load and no lines | ADR-053; golden mission §2 (101005) · REQ-127 | domain (1.5.3); story (1.5.9) | in part: domain (2026-10-05, ADR-341), `packages/domain/test/tickets.test.ts`; the story: 1.5.9 |
| AC-06-14 | **Given** the tower's phone synced at 12:05 and Ana's hasn't, **then** the disposals on `101001`, `101002` and `101003` are each `PENDING`, **listed as pending in the run's result**, not flagged and not alerted on | ADR-053; `adms-exceptions` Scenario C; KD-06 · REQ-129 | domain (1.5.3); story (1.5.9) | in part: domain (2026-10-05, ADR-341), `packages/domain/test/tickets.test.ts`; the run's result: 1.5.9 |
| AC-06-15 | **Given** that lone collection on `101005`, **when** the worker runs again the next day and a month later, **then** it is looked at again each time and is still `PENDING` with no flag: an unpartnered field event never expires, and nothing measures how long it has waited | ADR-053 (Q-18); `adms-validation` §5.4a · REQ-120f, 127 | domain (1.5.3) | domain (2026-10-05, ADR-341): `packages/domain/test/tickets.test.ts` |
| AC-06-16 | **Given** that lone collection, **when** the disposal syncs on Wednesday, **then** the two pair and the ticket leaves `PENDING` | ADR-053; golden mission §2 (101005) | story (1.5.9); story (1.9.1) | |
| AC-06-17 | **Given** Kim's lone disposal typed `101060`, **then** ticket `101060` is `PENDING` and shows that field event's flag, "Ticket 101060: typed ticket number (Barcode damaged). Flagged for review.", so the review queue can act on it; it stays `PENDING`, not `MANUAL_REVIEW`, until it is whole | ADR-244; `spec/FLAGS.md` §1; golden mission §2 (101006); AC-03-50 · REQ-129 | domain (1.5.3, 1.5.5) | domain (2026-10-05, ADR-341): `packages/domain/test/tickets.test.ts`; the flag and its words, domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-18 | **Given** `101001`'s collection and disposal are in and nothing is flagged, **then** the worker writes one completed load for it and the ticket is `COMPLETED` | ADR-060, 062; Part 6 step 7; golden mission §2 · REQ-116, 121 | story (1.5.9) | |
| AC-06-19 | **Given** P2's `102001-A`, `102001-B` and the disposal on `102001`, **then** it is one load with two properties: one completed load, one row for each collection | ADR-055, 162; `spec/DATA-MODEL.md` §5 (`CompletedLoadCollection`) · REQ-120e | domain (1.5.3); database (1.5.2) | database (2026-10-05, ADR-340): `packages/db/test/derived-records.test.ts`; domain (2026-10-05, ADR-341): `packages/domain/test/tickets.test.ts` |
| AC-06-20 | **Given** `102001-A` and `102001-B` are in and the disposal isn't, **then** the ticket is `PENDING`, as any ticket missing a field event is | ADR-053; Part 6 step 2 | domain (1.5.3) | domain (2026-10-05, ADR-341): `packages/domain/test/tickets.test.ts` |
| AC-06-21 | **Given** P1's `201004-A`, `-B`, `-C` and the haul-out disposal on `201004`, **then** it is one haul-out with three piles: one completed haul-out, one row for each haul-out collection | ADR-295; golden mission §2 (201004) · REQ-120j | domain (1.5.3); database (1.5.2) | database (2026-10-05, ADR-340): `packages/db/test/derived-records.test.ts`; domain (2026-10-05, ADR-341): `packages/domain/test/tickets.test.ts` |
| AC-06-22 | **Given** Jo's unit rate event `301001`, **then** it is a whole ticket by itself: checked alone, never paired, with no mileage and no completed load | `adms-ticket-workflows` §4.5e; Part 6 step 2 | domain (1.5.3) | domain (2026-10-05, ADR-341): `packages/domain/test/tickets.test.ts` |
| AC-06-23 | **Given** `101003`, whole and flagged for its 96% load call, **then** it is `MANUAL_REVIEW` and its quantity is worked out all the same: review never holds the money | ADR-060 (Q-13); golden mission §2 (101003) · REQ-121 | domain (1.5.3); story (1.5.9) | in part: domain (2026-10-05, ADR-341), `packages/domain/test/tickets.test.ts`; the quantity: domain (2026-10-05, ADR-343), `packages/domain/test/quantities.test.ts`; the flag and the story: 1.5.5, 1.5.9 |
| AC-06-24 | **Given** any ticket, **then** the worker sets only `PENDING`, `COMPLETED` or `MANUAL_REVIEW`; `VOID` comes only from a person with a reason or a rule's *Void ticket* action, and there is no other status | ADR-060, 118; `adms-validation` §5.4 · REQ-121 | domain (1.5.3); the void: 1.6.3, 1.8.x | in part: domain (2026-10-05, ADR-341), `packages/domain/test/tickets.test.ts`; the void: 1.6.3, 1.8.x |

## D. Checks between a ticket's field events (step 3; `spec/FLAGS.md` §3.1)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-06-25 | **Given** a load whose collection picked Vegetative and whose disposal picked C&D, **then** it is flagged "Ticket 101008: debris type mismatch (collection Vegetative, disposal C&D). Flagged for review." and still bills | ADR-207, 226, 244; `spec/FLAGS.md` `DEBRIS_TYPE_MISMATCH`; AC-04-36 · REQ-120d | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-26 | **Given** the collection picked Vegetative and the disposal picked the firm's own entry "Marine Vegetative", **then** it is the same flag: only the exact entry matches, never a like name | ADR-207, 213; `adms-validation` §5.1 · REQ-120d | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-27 | **Given** a split, **then** each property's debris type is compared with the disposal's; **given** a haul-out, its collection's (each pile's) with its disposal's, the same way | ADR-226, 295; `spec/FLAGS.md` `DEBRIS_TYPE_MISMATCH` · REQ-120d | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-28 | **Given** a load whose collection scanned `730415` and whose disposal scanned `730416`, **then** it is flagged "Ticket 101008: truck number doesn't match (collection 730415, disposal 730416). Flagged for review."; the numbers are compared exactly, never nearly; the pair still forms and bills from the certification on the field event that took the quantity (the disposal) | ADR-019, 033, 290; `spec/FLAGS.md` `CERT_NUMBER_MISMATCH`, §5 (1); AC-03-45 · REQ-120d | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-29 | **Given** a collection that ended at 09:40 and its disposal that started at 09:12, **then** it is flagged "Ticket 101008: disposal started 09:12, before its collection ended 09:40. Flagged for review." and still bills; the worker reorders nothing | ADR-053, 100; `spec/FLAGS.md` `DISPOSAL_BEFORE_COLLECTION_ENDED` · REQ-120d | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-30 | **Given** two collections on cert `730415`, `101030` and `101031`, both loading 09:10–09:40, with no disposal between, **then** both tickets are flagged; on `101031`: "Ticket 101031: loading 09:10–09:40 overlaps ticket 101030 on truck 730415. Flagged for review." Neither is voided or renumbered by the worker | ADR-027, 028, 053; `spec/FLAGS.md` `OVERLAPPING_LOADS` ("raised on both tickets"); `adms-exceptions` Scenario B; AC-05-34; the user, ADR-342 | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-31 | **Given** `730415`'s Monday loads `101001` (loaded by 08:40, dumped 09:25) and `101003` (collected 11:30), **then** nothing is flagged: a truck's loads one after another, each dumped before the next, don't overlap | ADR-027; golden mission §2 | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-32 | **Given** a split whose collections are `-A` and `-C`, **then** it is flagged "Ticket 102001: collections -A and -C, no -B. Flagged for review." and still bills | ADR-033, 173; `spec/FLAGS.md` `SPLIT_SUFFIX_GAP`; AC-04-49 · REQ-120b1 | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-33 | **Given** a bare collection `102001` beside `102001-A`, **then** the ticket is flagged `SPLIT_SUFFIX_GAP`: a split's first collection is `-A`, never bare. A split haul-out's piles are read the same way | ADR-173, 295; `spec/FLAGS.md` `SPLIT_SUFFIX_GAP`; AC-05-33 · REQ-120b1 | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-34 | **Given** load `101014` carries stump tickets, its collection lists four and the tower counted three, **then** it is flagged "Ticket 101014: tower counted 3 stumps, the collection lists 4. Flagged for review." and bills from the tickets carried. The worker makes the comparison; the tower's phone holds no list | ADR-192, 243; `spec/FLAGS.md` `CARRIED_COUNT_MISMATCH`; AC-04-41 · REQ-120d | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |

## E. The certification (step 3; `spec/FLAGS.md` §3.2)

Judged at the work time, never "now". The same behaviours are AC-03-41…50, from the
certification's side.

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-06-35 | **Given** a field event on P1 with cert number `730499`, which no certification on P1 has, **then** its ticket is flagged "Ticket 101015: no certification 730499 on this project. Flagged for review; not billed." and bills nothing. A number certified only on another project is the same: `730415` scanned on P2 | ADR-154; `spec/FLAGS.md` `NO_CERTIFICATION`; AC-03-41, 43 · REQ-122a | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-36 | **Given** that ticket, **when** certification `730499` is later made on P1 and the ticket is worked again, **then** the flag clears and the ticket bills: it was unbilled only until one exists | ADR-154; BACKLOG C62 · REQ-122 | story (1.5.9) | |
| AC-06-37 | **Given** the tower keyed in `730415` by hand with capacity 60, **then** the certification's 65 CY bills and the ticket is flagged "Ticket 101016: capacity typed 60, certified 65. Flagged for review." | ADR-154; `spec/FLAGS.md` `TYPED_CAPACITY_DIFFERS`; AC-03-44 | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-38 | **Given** `730416`'s tag expired on 30 September 2026, **then** a ticket worked on 12 October is flagged "Ticket 101017: review certification 730416 (tag expired 30-Sep-2026). Flagged for review." and still bills. **Given** a tag that expires on 31 October instead, **when** that ticket is reprocessed in November, **then** it isn't flagged: the tag was good at the work time | ADR-048, 079, 153; `spec/FLAGS.md` `TAG_EXPIRED`; AC-03-46 · REQ-122a | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-39 | **Given** `730416` is revoked from 14 October 2026, **then** a ticket worked on or after that date is flagged "Ticket 101018: review certification 730416 (revoked from 14-Oct-2026). Flagged for review." and still bills; Tuesday 13 October's tickets are not | ADR-048, 079; `spec/FLAGS.md` `CERTIFICATION_REVOKED`; AC-03-47 · REQ-122a | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-40 | **Given** `730416` was replaced by `730420` on 14 October 2026, **then** a ticket worked on the old number after that is flagged "Ticket 101019: review certification 730416 (replaced by 730420 on 14-Oct-2026). Flagged for review." and still bills; Monday's and Tuesday's tickets are not | ADR-048, 082; `spec/FLAGS.md` `CERTIFICATION_REPLACED`; AC-03-48 · REQ-122a | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-41 | **Given** any field event, **then** its certification is checked when it arrives, alone or paired, and again on every reprocess | ADR-048, 052; `adms-validation` §5.2 · REQ-122 | domain (1.5.5); story (1.5.9) | in part: domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts`; the run: 1.5.9 |

## F. Place and time (steps 3 and 4; `spec/FLAGS.md` §3.3)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-06-42 | **Given** `101001`'s collection ended at 14 Heron St, **then** the worker attaches the zone of P1's map that its end GPS lies in, with the map version used; no monitor recorded a zone. A unit rate event's zone comes from its own GPS | ADR-135, 141; Part 6 step 4 · REQ-124b | domain (1.5.6); story (1.5.9) | |
| AC-06-43 | **Given** a load, **then** its zone is its collection's and nothing compares zones between its field events; on a split each property keeps its own zone | ADR-141, 162; `adms-validation` §5.1 · REQ-120d | domain (1.5.6) | |
| AC-06-44 | **Given** a collection that ended at 27.75° N, 82.40° W, south of P1's boundary (27.80° N to 28.20° N), **then** it is flagged "Ticket 101020: collected outside the project boundary. Flagged for review." and still bills; a unit rate event outside it the same | ADR-135, 141; `spec/FLAGS.md` `OUTSIDE_PROJECT_BOUNDARY` · REQ-124b | domain (1.5.6) | |
| AC-06-45 | **Given** a map version whose zones leave a gap, and a collection that ended inside the boundary in that gap, **then** its zone is left empty and it is flagged "Ticket 101021: not inside any zone. Flagged for review." | ADR-141; `spec/FLAGS.md` `NO_ZONE` · REQ-124b | domain (1.5.6) | |
| AC-06-46 | **Given** P1's site circle of 200 m, **then** a disposal whose end GPS is 250 m from Marsh Road TDSR's own GPS is flagged "Ticket 101022: dumped outside Marsh Road TDSR's area. Flagged for review." and still bills, and one 150 m away is not. The distance is geodesic; either end of a haul-out is checked against its own site the same way | ADR-136, 142; `spec/FLAGS.md` `OUTSIDE_SITE_AREA`; invariant 14 · REQ-123 | domain (1.5.6) | |
| AC-06-47 | **Given** Marsh Road TDSR has a shape of its own, **then** a disposal is checked against the shape in place of the circle: inside it, not flagged, however far from the site's GPS | ADR-142, 144; `adms-validation` §5.2 · REQ-123 | domain (1.5.6) | |
| AC-06-48 | **Given** the 250 m disposal flagged above, **when** Dana changes P1's site circle to 300 m, **then** the ticket is worked again and the flag clears: the size is the project's setting, starting from the policy value `DISPOSAL_SITE_PROXIMITY_M`, never a number in code | ADR-136, 303; invariant 16 · REQ-123 | story (1.5.9) | |
| AC-06-49 | **Given** P1's active window, 12 October 2026 to 31 January 2027, and a load collected on 3 February 2027, **then** it is flagged "Ticket 101023: project not active on 03-Feb-2027. Flagged for review." and still bills | ADR-057, 161, 181; `spec/FLAGS.md` `PROJECT_NOT_ACTIVE`; AC-01-08 · REQ-105j | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-50 | **Given** a preload collected on 31 January 2027 and dumped on 1 February, **then** it is not flagged: the load's time is its collection's end, and the day is read in the project's time zone | ADR-100, 161; `adms-validation` §5.4a · REQ-105j | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-51 | **Given** Marsh Road TDSR is active from 12 October 2026, **then** a disposal there on 10 October is flagged "Ticket 101024: Marsh Road TDSR not yet active on 10-Oct-2026. Flagged for review." and still bills | ADR-181; `spec/FLAGS.md` `SITE_NOT_YET_ACTIVE` · REQ-124e | domain (1.5.6) | |
| AC-06-52 | **Given** Marsh Road TDSR's close date is set to 30 November 2026, **then** a disposal there on 1 December is flagged "Ticket 101025: Marsh Road TDSR closed on 01-Dec-2026. Flagged for review." and still bills; a site with no close date is never flagged closed | ADR-173; `spec/FLAGS.md` `SITE_CLOSED` · REQ-124e | domain (1.5.6) | |
| AC-06-53 | **Given** `101001`, **then** its mileage is the road distance of the shortest route on public roads from its collection's end GPS, snapped to the nearest road, to **Marsh Road TDSR's own GPS** (never the disposal's end GPS), worked out before any rule runs and kept unrounded with the snapped point, its address, and the map data's date and hash | ADR-110, 163, 208; `spec/DATA-MODEL.md` §5; golden mission §2 (6.2 mi) · REQ-126f | 1.5.8; the mission's figure: story (1.9.1) | |
| AC-06-54 | **Given** a split, **then** each property has its own mileage from its own end GPS; **given** haul-out `201001`, its mileage runs from its collection's end at Marsh Road TDSR to Bayline County Landfill's own GPS; a unit rate ticket has none | ADR-162, 208; Part 6 step 4; golden mission §2 (201001) · REQ-126f | 1.5.8 | |
| AC-06-55 | **Given** the routing server finds no road route, **then** the mileage is the straight line (geodesic), marked as such, and the ticket is flagged "Ticket 101026: no road route found; straight-line distance used. Flagged for review."; it bills at the straight-line miles | ADR-163; `spec/FLAGS.md` `NO_ROAD_ROUTE`; invariant 14 · REQ-126f | 1.5.8 | |
| AC-06-56 | **Given** a ticket's mileage is stored, **when** the ticket is reprocessed for any other reason, **then** the mileage isn't asked for again; it is worked out again only when the collection's end GPS or the site's GPS changes | ADR-208; ARCHITECTURE §3 · REQ-126f | 1.5.8 | |
| AC-06-57 | **Given** stored mileages of 10.04 and 10.05, **then** a rule compares them as 10.0 and 10.1: in tenths, half up; what is stored stays unrounded | ADR-125; `adms-validation` §5.5 | domain (1.6.2) | |
| AC-06-58 | **Given** a phone whose clock was 2 hours 14 minutes off the server's at its sync, **then** its tickets are flagged "Ticket 101008: device clock was 2 h 14 m off at sync. Flagged for review." and still bill; the threshold is a policy value | ADR-100; `spec/FLAGS.md` `DEVICE_CLOCK_OFF`; AC-05-04 | the difference kept with the sync: API (Phase 2); the flag: domain (1.5.5) | in part: the flag, its threshold handed in, domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts`; the difference kept with the sync and the threshold's policy value: API (Phase 2) |
| AC-06-59 | **Given** a field event whose work time is 21:40 and which the server received at 20:15 the same day, **then** its ticket is flagged "Ticket 101008: work time 21:40 is after it was received at 20:15. Flagged for review." | ADR-100; `spec/FLAGS.md` `WORK_TIME_AFTER_RECEIVED`; AC-05-36 | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-60 | **Given** a field event whose work time is before its phone was enrolled, **then** its ticket is flagged "Ticket 101027: work time 08:05 is before its phone was enrolled. Flagged for review." | ADR-100, 240; `spec/FLAGS.md` `WORK_TIME_BEFORE_ENROLMENT` | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-61 | **Given** P1 is on America/New_York (UTC−04:00 on 12 October 2026) and a field event recorded with the phone on UTC−05:00, **then** its ticket is flagged "Ticket 101028: phone was on UTC−05:00; the project is on UTC−04:00. Flagged for review." | ADR-100; `spec/FLAGS.md` `DEVICE_TIME_ZONE_DIFFERS` | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-62 | **Given** `P1-TWR-LF` was marked lost at 6:10 pm on Monday and held a disposal recorded at 5:40 pm and one at 6:30 pm, **then** the 6:30 pm one's ticket is flagged "Ticket 101008: made on a phone taken out of service. Flagged for review." and still bills; the 5:40 pm one is not. It is judged by the work time against the removal time, never by when it arrived | ADR-134; `spec/FLAGS.md` `PHONE_OUT_OF_SERVICE`; AC-05-55 · REQ-124c | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-63 | **Given** Kim typed her disposal's number and picked "Barcode damaged", **then** its ticket is flagged "Ticket 101060: typed ticket number (Barcode damaged). Flagged for review." and still bills | ADR-111, 173; `spec/FLAGS.md` `TYPED_TICKET_NUMBER`; AC-04-12 | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-64 | **Given** Luis created a disposal in the back office because a phone failed, **then** its ticket is flagged "Ticket 101029: record created in the back office by Luis Ortega (Phone failed). Flagged for review.", and the record pairs and bills like any other | ADR-156; `spec/FLAGS.md` `BACK_OFFICE_RECORD`; AC-04-19 | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |

## G. Where the debris went (step 3; `spec/FLAGS.md` §3.4)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-06-65 | **Given** a load dumped at Old Quarry Pit, which isn't marked *Takes loads*, **then** it is flagged "Ticket 101013: dumped at Old Quarry Pit, which isn't marked Takes loads. Flagged for review." and still bills | ADR-205, 215; `spec/FLAGS.md` `SITE_DOES_NOT_TAKE_LOADS` · REQ-124e | domain (1.5.6) | |
| AC-06-66 | **Given** a load dumped at Old Quarry Pit, an *Ineligible site*, **then** it is flagged "Ticket 101009: dumped at Old Quarry Pit, an ineligible site. Flagged for review." and still bills | ADR-215; `spec/FLAGS.md` `INELIGIBLE_SITE` · REQ-124e | domain (1.5.6) | |
| AC-06-67 | **Given** a haul-out whose collection was recorded at Bayline Transfer Station, **then** it is flagged "Ticket 201003: left Bayline Transfer Station, which isn't marked Haul-outs leave here. Flagged for review." and still bills. Only a TDSR/DMS site can carry the mark, so a haul-out that left a landfill is flagged the same way | ADR-205, 215, 298; `spec/FLAGS.md` `SITE_NOT_FOR_HAUL_OUTS`; BACKLOG C52 · REQ-124e | domain (1.5.6) | |
| AC-06-68 | **Given** a haul-out whose disposal was recorded at Marsh Road TDSR, **then** it is flagged "Ticket 201002: a haul-out dumped at Marsh Road TDSR, a TDSR. Flagged for review; not priced." and has no lines: the rules are skipped. It is told by the site type's built-in key, whatever the firm calls the type, and it holds when the TDSR is the one the haul-out left | ADR-226 (Q-212), 298; `spec/FLAGS.md` `HAUL_OUT_DUMPED_AT_TDSR`; AC-04-56; BACKLOG C52 · REQ-124e | domain (1.5.6); no lines: 1.6.3 | |
| AC-06-69 | **Given** that haul-out, **when** Luis corrects its disposal's site to Bayline County Landfill, **then** the flag clears and the ticket is priced | ADR-226; `spec/FLAGS.md` §4 | 1.8.x; story (1.9.1 or its side story) | |
| AC-06-70 | **Given** a load dumped at Bayline County Landfill, which *Charges a tipping fee*, and no rule that gives it a line for one of the site's tipping fee pay items, **then** it is flagged "Ticket 101011: dumped at Bayline County Landfill, which charges a tipping fee, but no rule on this project gives it one. Flagged for review."; its other lines bill. It is a missing rule, never a mismatch | ADR-222, 311; `spec/FLAGS.md` `TIPPING_FEE_RULE_MISSING` · REQ-124e | domain (1.6.3; in full: Part 7's file) | |
| AC-06-71 | **Given** a site that charges a tipping fee, **then** the check is made only on a load or haul-out **dumped** there: never on a haul-out leaving it, never on unit rate work there | ADR-222, 226; `adms-validation` §5.2 | domain (1.6.3) | |
| AC-06-72 | **Given** `101002`, dumped at Bayline County Landfill, and `201001`, which left Marsh Road TDSR for it, **then** none of this section's flags is raised: each site has the fact the trip needs. No ticket says where debris was headed and nothing is checked ahead | ADR-205 (Q-197); golden mission §2 | domain (1.5.6) | |

## H. Quantity (step 5; `adms-validation` §5.5; `spec/FLAGS.md` §3.5)

Every figure is worked out by the worker in exact decimals; what a phone printed is never what
bills (ADR-217).

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-06-73 | **Given** the mission's loads, **then** each volume is its certification's whole-CY capacity × its load call ÷ 100: `101001` 65 × 80 = **52.0 CY**; `101002` 48 × 75 = **36.0**; `101003` 65 × 96 = **62.4**; `101004` 48 × 50 = **24.0**; `101005` 65 × 70 = **45.5**; `101006` 48 × 60 = **28.8** | ADR-076; `adms-validation` §5.5; golden mission §2; AC-03-33 · REQ-126 | domain (1.5.4) | domain (2026-10-05, ADR-343): `packages/domain/test/quantities.test.ts` |
| AC-06-74 | **Given** haul-out `201001`, **then** its call is its collection's, taken at Marsh Road TDSR: 110 × 90 = **99.0 CY**; its disposal has no call | ADR-013, 027; golden mission §2 (201001) · REQ-126 | domain (1.5.4) | domain (2026-10-05, ADR-343): `packages/domain/test/quantities.test.ts` |
| AC-06-75 | **Given** split `102001`, 36.0 CY, estimates 12 and 18, **then** the shares are 12 ÷ 30 → **14.4 CY** and 18 ÷ 30 → **21.6 CY**, which add up to 36.0 exactly, kept apart from the estimates | ADR-055; golden mission §3; AC-04-48 · REQ-120i | domain (1.5.4) | domain (2026-10-05, ADR-343): `packages/domain/test/quantities.test.ts` |
| AC-06-76 | **Given** split haul-out `201004` on `730419` (110 CY), calls so far 10%, 35%, 85%, **then** the haul-out's call is the last, 85%; each pile's part is what it added, 10, 25 and 50; its volume is 110 × part ÷ 100: **11.0, 27.5 and 55.0 CY**, 93.5 CY in all | ADR-295; golden mission §2 (201004) · REQ-120j | domain (1.5.4) | domain (2026-10-05, ADR-343): `packages/domain/test/quantities.test.ts` |
| AC-06-77 | **Given** that haul-out was weighed at Cypress Creek Landfill, net 48,000 lb = 24.00 tons, **then** the tower took the weight in place of nothing else (one quantity), each pile's share is 24.00 × part ÷ 85 to two decimals, **2.82, 7.06 and 14.12 tons**, adding up to 24.00 exactly; the shares are kept apart from the weighed figure, and the CY figures are kept and not billed | ADR-223, 227, 295, 297; golden mission §2 (201004) · REQ-120j, 126d | domain (1.5.4) | domain (2026-10-05, ADR-343): `packages/domain/test/quantities.test.ts` |
| AC-06-78 | **Given** the same three piles dumped at Bayline County Landfill instead (no scale), **then** the quantities are the CY figures, 11.0, 27.5 and 55.0 (their six lines, $850.85, are Part 7's file) | ADR-295, 297; golden mission §2 ("Had it gone to Bayline County Landfill"); BACKLOG C51 · REQ-120j | domain (1.5.4); the lines: 1.6.3 | in part: domain (2026-10-05, ADR-343), `packages/domain/test/quantities.test.ts`; the lines: 1.6.3 |
| AC-06-79 | **Given** Coastline's tandem, `730421` (30 CY) on `101050` and `730422` (40 CY) on `101051`, weighed once on receipt `BCL-88241`, net 17.10 tons, **then** the weight is split by certified capacity: 17.10 × 30 ÷ 70 → **7.33 tons** and 17.10 × 40 ÷ 70 → **9.77 tons**, adding up to 17.10 exactly, each marked as a share, never weighed | ADR-175; `adms-scale-receipts`; AC-04-73 · REQ-126b | domain (1.5.4) | domain (2026-10-05, ADR-343): `packages/domain/test/quantities.test.ts` |
| AC-06-80 | **Given** that tandem, **then** both tickets are flagged; on `101050`: "Ticket 101050: one scale weight shared by two containers, split by certified capacity (7.33 of 17.10 tons). Flagged for review."; each bills at its share. Nothing in the data says "tandem": it is two disposals on one receipt | ADR-038, 114, 175; `spec/FLAGS.md` `SHARED_SCALE_WEIGHT` · REQ-126b | domain (1.5.7) | |
| AC-06-81 | **Given** a stump 30 in across two feet up, **then** its stump CY is [(30² × 0.7854) × 24 + ((3.6 × 30)² × 0.7854) × 31] ÷ 46,656 = 6.450 → **6.5 CY**, half up to a tenth. The USACE guide's 79-row table (6–84 in) is matched with no exception | ADR-178, 183, 187; `adms-validation` §5.5 · REQ-126 | domain (1.5.4) | domain (2026-10-05, ADR-343): `packages/domain/test/quantities.test.ts` |
| AC-06-82 | **Given** a load of stumps that carries three stump tickets of 4.8, 7.8 and 12.0 CY, **then** the load's quantity is each stump's CY, rounded, then added: **24.6 CY**, with no load call; **given** a load of white goods that carries ticket `301006`, its quantity is the count of items on it, **6** | ADR-192, 204; `adms-validation` §5.5 | domain (1.5.4) | domain (2026-10-05, ADR-343): `packages/domain/test/quantities.test.ts` |
| AC-06-83 | **Given** leaner `301002`, measured as a circumference of 56.5 in, **then** its diameter is 56.5 ÷ 3.14 = 17.99 → **18.0 in**, half up to a tenth; both numbers are kept; the worker works the pay item out again from the bands, `LNR-RMV-EA-24`, and its own answer, kept beside the phone's, is what bills | ADR-177, 213, 217; golden mission §2 (301002); AC-04-59 · REQ-112f | domain (1.5.4, 1.5.7) | in part: domain (2026-10-05, ADR-343), `packages/domain/test/quantities.test.ts`; the pay item worked out again by the worker and kept beside the phone's: 1.5.7 |
| AC-06-84 | **Given** stump `301004`, root ball 96 in, and P1's fill depth of 31 in, **then** the fill is 0.7854 × 96² × 31 ÷ 46,656 = 4.809 → **4.8 CY**. The depth is the project's setting; with no root ball measured there is no fill CY; a root-ball reading never goes into the stump CY | ADR-196, 198, 203; golden mission §2 (301004) | domain (1.5.4) | domain (2026-10-05, ADR-343): `packages/domain/test/quantities.test.ts` |
| AC-06-85 | **Given** a load call of 0%, **then** it is flagged, whatever the project's limits and with them switched off: "Ticket 101032: load call 0%. Flagged for review; not billed."; 0 CY, nothing billed | ADR-116, 181; `spec/FLAGS.md` `LOAD_CALL_ZERO` | domain (1.5.7) | |
| AC-06-86 | **Given** P1's low limit of 5, **then** a call of 4% is flagged "Ticket 101033: load call 4%. Flagged for review." and still bills; 5% is flagged too (at or under); 6% is not | ADR-164; `spec/FLAGS.md` `LOAD_CALL_LOW` | domain (1.5.7) | |
| AC-06-87 | **Given** P1's high limit of 95, **then** `101003`'s call of 96% is flagged "Ticket 101003: load call 96%. Flagged for review." and still bills 62.4 CY; 95% is flagged too (at or over); 94% is not | ADR-164; `spec/FLAGS.md` `LOAD_CALL_HIGH`; golden mission §2 (101003) | domain (1.5.7); story (1.9.1) | |
| AC-06-88 | **Given** Dana changes P1's high limit to 98, or switches the limits off, **then** a 96% call is no longer flagged on its next run. The limits are the project's settings, starting from the policy values, and are no rule's criterion | ADR-164, 303; invariant 16 | domain (1.5.7) | |
| AC-06-89 | **Given** split haul-out `201004`, calls 10%, 35%, 85%, **then** nothing is flagged; **given** a first pile called 4%, **then** it isn't flagged either: the limits judge only the last pile's call, which is the haul-out's | ADR-295; `spec/FLAGS.md` §3.5; golden mission §2 (201004) | domain (1.5.7) | |
| AC-06-90 | **Given** piles `-A` at 35% and `-B` at 30%, **then** the ticket is flagged "Ticket 201004: pile -B's load call 30% is not higher than pile -A's 35%. Flagged for review; not billed." and no pile is shared out until it is corrected | ADR-295; `spec/FLAGS.md` `PILE_CALL_NOT_HIGHER`; AC-04-55; BACKLOG C51 · REQ-120j | domain (1.5.4, 1.5.7) | in part: domain (2026-10-05, ADR-343), `packages/domain/test/quantities.test.ts`; the flag and its words: 1.5.7 |
| AC-06-91 | **Given** a rule that pays a load with `TIP-FEE-TN-BCL`, priced per ton, and the load has no scale weight (or a net of nought), **then** it is flagged "Ticket 101012: TIP-FEE-TN-BCL is priced per ton, but the load has no scale weight. Flagged for review."; that line bills nothing and the ticket's other lines bill | ADR-223; `spec/FLAGS.md` `QUANTITY_MISSING_FOR_PAY_ITEM` · REQ-126e | domain (1.6.3; in full: Part 7's file) | |
| AC-06-92 | **Given** the two tickets on one scale receipt carry Vegetative and C&D, **then** both are flagged; on one: "Ticket 101052: scale receipt BCL-88241 covers two debris types (Vegetative, C&D). Flagged for review; its weight is not used."; neither bills by weight until a person fixes the receipt or voids a ticket | ADR-069; `spec/FLAGS.md` `RECEIPT_TWO_DEBRIS_TYPES`; `adms-scale-receipts` | domain (1.5.7) | |
| AC-06-93 | **Given** a scale receipt whose net is below zero, or which has no net and no gross or tare to work one out from, **then** its ticket is flagged "Ticket 101053: scale receipt BCL-88250 has no usable net weight. Flagged for review; its weight is not used." There is no test against a vehicle's legal limit: none is recorded | ADR-038; `spec/FLAGS.md` `SCALE_WEIGHT_UNUSABLE`, §5 (2) | domain (1.5.7) | |
| AC-06-94 | **Given** load `101014`'s collection lists carried ticket `301099`, which matches no ticket, **then** it is flagged "Ticket 101014: carried ticket 301099 not found. Flagged for review." and bills from the tickets found | ADR-192; `spec/FLAGS.md` `CARRIED_TICKET_NOT_FOUND`; AC-04-40 | domain (1.5.7) | |
| AC-06-95 | **Given** load `101014` lists `301004`, which load `101007` already carries, **then** it is flagged "Ticket 101014: carried ticket 301004 is already on load 101007. Flagged for review." | ADR-192; `spec/FLAGS.md` `CARRIED_TICKET_ON_ANOTHER_LOAD` | domain (1.5.7) | |

## I. The pay item's settings, and unit rate work (step 3; `spec/FLAGS.md` §3.6)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-06-96 | **Given** a pay item with *Measurement required* and a ticket on it with none, **then** it is flagged "Ticket 301010: no measurement. Flagged for review." and still bills | ADR-158; `spec/FLAGS.md` `MEASUREMENT_MISSING`; AC-04-69 · REQ-112c | domain (1.5.7) | |
| AC-06-97 | **Given** a pay item with *GPS required* and a ticket with no GPS, **then** it is flagged "Ticket 301011: no GPS. Flagged for review." and still bills | ADR-157; `spec/FLAGS.md` `GPS_MISSING` · REQ-112c | domain (1.5.7) | |
| AC-06-98 | **Given** a pay item that requires photos and a ticket with none, **then** it is flagged "Ticket 301012: no photos. Flagged for review." and still bills; required means at least one | ADR-157, 181; `spec/FLAGS.md` `PHOTOS_MISSING`; AC-04-69, 79 · REQ-112c | domain (1.5.7) | |
| AC-06-99 | **Given** `HNG-RMV-EA` doesn't have *Decimals allowed* and a ticket with a count of 2.5, **then** it is flagged "Ticket 301013: count 2.5; HNG-RMV-EA takes whole counts. Flagged for review." and bills at the count entered | ADR-207; `spec/FLAGS.md` `DECIMAL_COUNT` · REQ-112c | domain (1.5.7) | |
| AC-06-100 | **Given** a leaner measured at 4.5 in, which no Leaners band holds (6–24 in, 24.1–99 in), **then** it has no pay item and is flagged "Ticket 301009: 4.5 in fits no Leaners pay item. Flagged for review; not billed." | ADR-213, 217; `spec/FLAGS.md` `NO_SIZE_BAND`; AC-04-60 · REQ-112f | domain (1.5.7) | |
| AC-06-101 | **Given** the firm gives `HNG-RMV-EA`, Hangers' only pay item, a band of 2–24 in, and a limb measured at 30.0 in, **then** the ticket keeps that pay item, is flagged "Ticket 301014: 30.0 in is over HNG-RMV-EA's band (2–24 in). Flagged for review." and still bills | ADR-210, 217; `spec/FLAGS.md` `OUTSIDE_SIZE_BAND` · REQ-112f | domain (1.5.7) | |
| AC-06-102 | **Given** a pay item with *Monitor may mark ineligible* and work the monitor marked so, **then** it is flagged "Ticket 301015: marked ineligible by the monitor. Flagged for review." and still bills | ADR-210; `spec/FLAGS.md` `MARKED_INELIGIBLE`; AC-04-68 | domain (1.5.7) | |
| AC-06-103 | **Given** stump `301005`, 20 in two feet up, **then** it is flagged "Ticket 301005: not an eligible stump (20 in, under 24 in). Flagged for review."; no Stumps band holds it, so it has no pay item and nothing to bill. The worker doesn't void it: a firm that wants that writes a rule, or a person voids it | ADR-187, 189; `spec/FLAGS.md` `STUMP_UNDER_24`; golden mission §2 (301005); AC-04-62 | domain (1.5.7); story (1.9.1) | |
| AC-06-104 | **Given** a stump 30 in across with a root ball of 20 in, **then** it is flagged "Ticket 301008: root ball (20 in) is not wider than the stump (30 in). Flagged for review." and still bills. `301004` (30 in, root ball 96 in, half or more exposed) passes both stump checks | ADR-203; `spec/FLAGS.md` `ROOT_BALL_NOT_WIDER`; golden mission §2 (301004) | domain (1.5.7) | |
| AC-06-105 | **Given** a stump whose rules pay a fill line and whose root ball is not half exposed, **then** it is flagged "Ticket 301016: fill paid, but the root ball is not half exposed. Flagged for review." and still bills | ADR-203; `spec/FLAGS.md` `FILL_WITHOUT_EXPOSED_ROOT_BALL` | domain (1.6.3, with the fill line) | |
| AC-06-106 | **Given** Dana switches either stump check off on P1, **then** that check flags nothing on P1 from the next run; both are on for a new project | ADR-203, 303; `adms-validation` §5.2 | domain (1.5.7) | |
| AC-06-107 | **Given** a stump's pay item requires the measurement and the root ball is blank, **then** it is flagged "Ticket 301017: no root ball measurement. Flagged for review."; the stump line bills and there is no fill line | ADR-203; `spec/FLAGS.md` `ROOT_BALL_MISSING` | domain (1.5.7) | |
| AC-06-108 | **Given** a stump ticket with no survey number, **then** it is flagged "Ticket 301018: no survey. Flagged for review." and still bills | ADR-198; `spec/FLAGS.md` `NO_SURVEY`; AC-04-62 | domain (1.5.7) | |
| AC-06-109 | **Given** crew `730418` on Tuesday 13 October: `301007` with Skid Steer 9.75 h, and `301019` with Skid Steer 3.50 h, **then** that item's hours are added across the crew's day in project time, 9.75 + 3.50 = 13.25 h, and it is flagged "Ticket 301019: Skid Steer 13.25 h on 13-Oct-2026 for crew 730418 (over 12 h). Flagged for review."; both still bill | ADR-068, 100, 159; `spec/FLAGS.md` `CREW_ITEM_OVER_12_HOURS` | domain (1.5.7) | |
| AC-06-110 | **Given** two crew-time tickets for crew `730418` whose times overlap, **then** it is flagged "Ticket 301020: crew time 07:00–11:00 overlaps ticket 301007 for crew 730418. Flagged for review." and still bills | ADR-159; `spec/FLAGS.md` `CREW_TIME_OVERLAP` | domain (1.5.7) | |
| AC-06-111 | **Given** every capture setting a firm can tick on a pay item, **then** each is checked on every ticket it applies to; none is stored and ignored. **Given** Dana renamed "Stumps" to "Stump removal", **then** the stump checks run as before: they hang on the built-in key | ADR-194; `adms-validation` §5.3a; KD-28; AC-01-33, 48 · REQ-112c | domain (1.5.7) | |

## J. Forms, certifications and sites (`spec/FLAGS.md` §3.7)

P2 requires ROEs. A flag on a certification, a site or a survey sits on that record and touches no
ticket's status.

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-06-112 | **Given** a collection on P2 with no ROE, **then** it is flagged "Ticket 102002: no ROE. Flagged for review." and still bills; nothing is looked up. A unit rate ticket or a survey on P2 with none is flagged the same way; on P1, which requires no ROE, nothing is | ADR-055, 149; `spec/FLAGS.md` `ROE_MISSING`; AC-04-82 · REQ-105d | domain (1.5.7) | |
| AC-06-113 | **Given** a collection on P2 naming `R-0099`, which P2 doesn't have, **then** it is flagged "Ticket 102003: ROE R-0099 is not on this project. Flagged for review." and still bills | ADR-149; `spec/FLAGS.md` `ROE_NOT_ON_PROJECT`; AC-04-82 | domain (1.5.7) | |
| AC-06-114 | **Given** a collection on `R-0008` while that ROE isn't signed, **then** it is flagged "Ticket 102004: ROE R-0008 is not signed. Flagged for review." and still bills | ADR-149; `spec/FLAGS.md` `ROE_UNSIGNED` | domain (1.5.7) | |
| AC-06-115 | **Given** `R-0008`'s scope picks are C&D only and a Vegetative collection on it, **then** it is flagged "Ticket 102005: outside the scope of ROE R-0008. Flagged for review." and still bills; a unit rate ticket is read by its payable type. **Given** an ROE with no scope picked, **then** nothing is flagged for scope | ADR-055, 149, 293; `spec/FLAGS.md` `ROE_OUT_OF_SCOPE` | domain (1.5.7) | |
| AC-06-116 | **Given** a post-work survey on `R-0008` with no pre-work survey on that ROE, **then** the survey is flagged "Survey on ROE R-0008: no pre-work survey." | ADR-150; `spec/FLAGS.md` `NO_PRE_WORK_SURVEY`; AC-04-85 | domain (1.5.7) | |
| AC-06-117 | **Given** `730416` has no left side view, **then** the certification is flagged "Certification 730416: no left side photo."; it stays usable and no ticket's status changes for it | ADR-179; `spec/FLAGS.md` `CERTIFICATION_PHOTO_MISSING`; AC-03-35 · REQ-106f | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-118 | **Given** Marsh Road TDSR has no permit number, **then** the site is flagged "Marsh Road TDSR: permit outstanding."; work there is never refused and no ticket is flagged for it | ADR-111; `spec/FLAGS.md` `PERMIT_OUTSTANDING`; AC-01-55 · REQ-105n | domain (1.5.6) | |
| AC-06-119 | **Given** Tuesday's incident and citizen drop-off log, **then** neither is a ticket's field event: the worker pairs neither, prices neither, and gives neither a status | ADR-184, 236; `adms-ticket-workflows` §4.6; golden mission §2 ("Forms") | story (1.5.9) | |

## K. Pricing flags and the engine's own (`spec/FLAGS.md` §3.8, §3.9)

One scenario each; the rules that raise them are Part 7's file.

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-06-120 | **Given** a Summit ticket and no rule on a Summit contract that adds a line, **then** it is flagged "Ticket 101010: no pricing rule on a Summit contract matches. Flagged for review; not billed." | ADR-239; `spec/FLAGS.md` `NO_PRICING_RULE` | domain (1.6.3) | |
| AC-06-121 | **Given** two passing rules that both add transaction #1, **then** neither line bills and the ticket is flagged "Ticket 301009: two rules create transaction 1 (LNR-RMV-EA-24, LNR-RMV-EA-99). Flagged for review; not billed." | ADR-118; `spec/FLAGS.md` `DUPLICATE_TRANSACTION_NUMBER` | domain (1.6.3) | |
| AC-06-122 | **Given** a rule adds `VEG-HAUL-CY-15` on a Summit ticket and the pay item has no rate for Summit, **then** the line is $0 and the ticket is flagged "Ticket 101034: pay item VEG-HAUL-CY-15 has no rate for Summit. Flagged for review." | ADR-212; `spec/FLAGS.md` `NO_RATE_FOR_PRIME` | domain (1.6.3) | |
| AC-06-123 | **Given** a rule adds a pay item whose unit is TBN, **then** that line bills nothing and the ticket is flagged "Ticket 301021: rate to be negotiated. Not billed yet." | ADR-068; `spec/FLAGS.md` `RATE_TO_BE_NEGOTIATED` | domain (1.6.3) | |
| AC-06-124 | **Given** the worker hits an error on one ticket of a run, **then** that ticket is flagged "Ticket 101035: could not be processed. Flagged for review; not billed.", nothing else about it is written, and the run goes on to the project's other tickets | ARCHITECTURE §13; `spec/FLAGS.md` `NOT_PROCESSED`; KD-55 · REQ-015 | story (1.5.9) | |

## L. Never flagged (`spec/FLAGS.md` §2; `adms-validation` §5.2a)

As important as the flags: the worker must not add these.

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-06-125 | **Given** preload `101004`, collected Monday 17:50 and dumped Tuesday 07:15, **then** nothing is flagged for the night between, and the load is Monday's: its time is its collection's end. A haul-out collected on one date and dumped on a later one is the same | ADR-053, 161, 205; golden mission §2 (101004); AC-04-43 | domain (1.5.3, 1.5.5); story (1.9.1) | in part: domain (2026-10-05, ADR-341), `packages/domain/test/tickets.test.ts`; the day in the project's time zone and the active window, domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts`; the story: 1.9.1 |
| AC-06-126 | **Given** a collection whose start and end GPS are 9 km apart, **then** nothing is flagged for the distance it covers: there is no route check; the project boundary is the check | ADR-136; `spec/FLAGS.md` §2 | domain (1.5.6) | |
| AC-06-127 | **Given** a field event whose GPS fix reports poor accuracy, **then** nothing is flagged for the accuracy: the phone sends the fix it has and the back office adjusts drift | ADR-083; `spec/FLAGS.md` §2 | domain (1.5.6) | |
| AC-06-128 | **Given** split `102001`, estimates 12 and 18 CY (30 in all) against a load of 36.0 CY, **then** nothing is flagged: estimates are only relative sizes | ADR-064; golden mission §3; AC-04-48 · REQ-120i | domain (1.5.4) | domain (2026-10-05, ADR-343): `packages/domain/test/quantities.test.ts` |
| AC-06-129 | **Given** weighed haul-out `201004`, 24.00 tons against a loading-end call of 85% (93.5 CY), **then** nothing compares the weight with the call | ADR-165, 223; `spec/FLAGS.md` §2; golden mission §2 (201004) | domain (1.5.7) | |
| AC-06-130 | **Given** the driver's licence on `730416` had expired, or somebody else was driving, **then** nothing is flagged; **given** the tandem's truck body `730421` arrives with a different trailer, **then** nothing is flagged for the swap | ADR-114, 153; `spec/FLAGS.md` §2; AC-03-07, 17 | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-131 | **Given** `730415` is still at QC Review, has no expired tag and was never revoked or replaced, **then** no amount of time flags its tickets: a certification is usable before QC and never ends on its own | ADR-079, 080; AC-03-39, 49 · REQ-106f | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-132 | **Given** a load of stumps whose stumps were each paid on a unit rate ticket, **then** nothing is flagged as "hauling paid twice": the firm's rules decide what the load pays | ADR-199; `spec/FLAGS.md` §2 | domain (1.5.7) | |
| AC-06-133 | **Given** Tariq's Monday tickets were made under an unplanned assignment, **then** they are marked and not flagged; and nothing on any ticket is flagged because what a person did differs from what the dispatch board planned | ADR-240; `spec/FLAGS.md` §2; AC-05-40 | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/checks.test.ts` |
| AC-06-134 | **Given** a citizen drop-off log at a site not marked *Takes loads*, **then** nothing is flagged: a drop-off log isn't checked against its site's facts | ADR-215 (agent default); `spec/FLAGS.md` §2 | domain (1.5.6) | |
| AC-06-135 | **Given** a monitor's own hours on an assignment run past 12, **then** nothing is flagged: the crew-hours checks read crew-time tickets only | ADR-100, 159, 241; `spec/FLAGS.md` §2 | domain (1.5.7) | |

## M. How a flag behaves (`spec/FLAGS.md` §1; `adms-validation` §5.4b)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-06-136 | **Given** any flag on a ticket, **then** its message is `Ticket <number>: <the facts>. Flagged for review.`, ending `Flagged for review; not billed.` where it stops a line or the ticket from billing (the two messages the catalogue words otherwise, `HAUL_OUT_DUMPED_AT_TDSR` and `RATE_TO_BE_NEGOTIATED`, as written there); it states the problem and never a cause or what to do. Dates and times read `03-Feb-2027` and `21:40`, in the project's time zone | ADR-052, 290; `spec/FLAGS.md` §1, §5 (4) · REQ-129a | domain (1.5.5) | domain (2026-10-05, ADR-344): `packages/domain/test/flags.test.ts`; every message against this page's catalogue: `packages/scenarios/test/flag-catalogue.test.ts` |
| AC-06-137 | **Given** the catalogue, **then** the worker's flag codes are that one closed set, each message word for word: a flag that isn't in `spec/FLAGS.md` can't be raised | ADR-285, 290; `spec/FLAGS.md` (head); `spec/DATA-MODEL.md` §9 (`FlagCode`) | domain (1.5.5); database (1.5.2) | database (2026-10-05, ADR-340): `packages/db/test/derived-records.test.ts`; the messages and the domain's closed set (2026-10-05, ADR-344): `packages/domain/test/flags.test.ts`, `packages/scenarios/test/flag-catalogue.test.ts` |
| AC-06-138 | **Given** `101003`'s flag, **then** it keeps its code, the facts it was raised on (the call, the limit) with their hash, and what it does to the money (bills · that line not billed · not billed) | ADR-166, 294; `spec/DATA-MODEL.md` §5 (`Flag`) · REQ-129a | database (1.5.2); domain (1.5.5) | database (2026-10-05, ADR-340): `packages/db/test/derived-records.test.ts`; its facts and their hash worked out, and kept or cleared on a reprocess, domain (2026-10-05, ADR-344): `packages/domain/test/flags.test.ts` (what raises a load-call flag: 1.5.7) |
| AC-06-139 | **Given** Luis accepted `101003`'s flag ("Heaped; photos confirm"), **when** the ticket is reprocessed with the same call and limit, **then** the flag isn't raised again and the ticket stays `COMPLETED` | ADR-166, 245; golden mission §2 (101003) | story (1.5.9); the acceptance: 1.8.x | |
| AC-06-140 | **Given** that accepted flag, **when** the call is corrected to 97%, **then** the old flag is cleared and a new one is raised that must be looked at again: the ticket is `MANUAL_REVIEW` | ADR-166; `spec/FLAGS.md` §1 | story (1.5.9); the correction: 1.8.x | |
| AC-06-141 | **Given** a flagged ticket, **when** the facts are corrected so the problem is gone (the 96% call corrected to 90%), **then** the flag is cleared on the next run and, with no other flag open, the ticket is `COMPLETED`. The cleared flag stays in the ticket's history: nothing is deleted | ADR-086, 166; `spec/FLAGS.md` §1, §4; invariant 1 | story (1.5.9); the correction: 1.8.x | |
| AC-06-142 | **Given** a ticket with two open flags, **when** one is accepted, **then** it is still `MANUAL_REVIEW`; when every flag is fixed or accepted the worker marks it `COMPLETED` | ADR-166; `adms-validation` §5.4b | domain (1.5.3) | domain (2026-10-05, ADR-341): `packages/domain/test/tickets.test.ts` |
| AC-06-143 | **Given** a flag whose billing is "not billed" (a 0% call), **when** it is accepted, **then** the ticket is `COMPLETED` and still bills nothing: accepting never changes what bills | ADR-166; `spec/FLAGS.md` §1 | domain (1.5.3); the acceptance: 1.8.x | in part: domain (2026-10-05, ADR-341), `packages/domain/test/tickets.test.ts`; the acceptance: 1.8.x |

## N. What the worker writes, and the run's guarantees (step 7; ARCHITECTURE §13)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-06-144 | **Given** a completed load or haul-out, its collection rows, a flag, a run and a run's decision, **then** only the worker's login can write them: the API's can't, and no person authors one by any path | ADR-097, 270; invariants 4, 21 · REQ-113 | database (1.5.2) | database (2026-10-05, ADR-340): `packages/db/test/derived-records.test.ts` |
| AC-06-145 | **Given** `101001`'s completed load, **then** it is one record for its disposal event, and no second completed load can name that disposal: a load dumps once | ADR-155; invariant 17; `spec/DATA-MODEL.md` §5 · REQ-113 | database (1.5.2) | database (2026-10-05, ADR-340): `packages/db/test/derived-records.test.ts` |
| AC-06-146 | **Given** a collection that is a live row of one completed load, **then** it can't be a live row of another: one collection never bills twice. A haul-out's collections are held the same way | invariant 17; `spec/DATA-MODEL.md` §5 (`CompletedLoadCollection`, `CompletedHaulOutCollection`) · REQ-113 | database (1.5.2) | database (2026-10-05, ADR-340): `packages/db/test/derived-records.test.ts` |
| AC-06-147 | **Given** `101001` is `COMPLETED`, **when** it is reprocessed, **then** the worker finds its completed load and updates it in place: there is still one, with the same id | ADR-086; ARCHITECTURE §13; KD-43 · REQ-116 | story (1.5.9) | |
| AC-06-148 | **Given** a completed load whose disposal is renumbered away, **then** the completed load is marked dissolved, never deleted, and its ticket is `PENDING` again; when the ticket is whole again the mark is cleared | ADR-086; `spec/DATA-MODEL.md` §5 (`dissolvedAt`); invariant 1 | database (1.5.2); story (1.5.9); the renumber: 1.8.x | in part: database (2026-10-05, ADR-340), `packages/db/test/derived-records.test.ts`; the worker dissolving one and the story: 1.5.9; the renumber: 1.8.x |
| AC-06-149 | **Given** the worker works one ticket, **then** its checks, its completed record, its flags, its status and their audit records commit together or not at all: a failure part-way leaves the ticket exactly as it was | ARCHITECTURE §13; KD-55; BACKLOG C20 · REQ-015 | story (1.5.9) | |
| AC-06-150 | **Given** a run on P1 is under way, **when** a second run on P1 is started, **then** the two never work P1's tickets at once (a database lock); a run on P2 isn't held up | ARCHITECTURE §13 · REQ-015 | story (1.5.9) | |
| AC-06-151 | **Given** a run has finished, **when** it is run again with nothing changed, **then** nothing changes: no new completed record, no new flag, no flag raised a second time, no status changed | ARCHITECTURE §13 · REQ-015 | story (1.5.9) | |
| AC-06-152 | **Given** a run, **then** it is recorded (its project, what started it, when, how many tickets it worked and how many failed), with one decision for each ticket: its status and, for a person to read, the field events grouped and why | ARCHITECTURE §13; `spec/DATA-MODEL.md` §5 (`ReconciliationRun`, `ReconciliationDecision`) | database (1.5.2); story (1.5.9) | in part: database (2026-10-05, ADR-340), `packages/db/test/derived-records.test.ts`; the worker writing them, as a story: 1.5.9 |
| AC-06-153 | **Given** any outcome of a run, on a load, a haul-out or a unit rate ticket, clean or flagged, **then** it is audited by the database under the system actor and shows the status the ticket really ended with | ADR-273, 276; KD-04, 05 · REQ-132 | story (1.5.9) | |
| AC-06-154 | **Given** P1's Monday and Tuesday reconciled before any review, **then**: `101001`, `101002`, `101004` and `201001` are whole and unflagged; `101003` is `MANUAL_REVIEW` for its 96% call; `101005` is `PENDING` until Wednesday; `101006` and `101060` are each `PENDING`, `101060` showing its typed-number flag; `201004` is one haul-out of three piles, unflagged; `301005` is `MANUAL_REVIEW` | golden mission §2 | story (1.5.9, unpriced); story (1.9.1, in full) | |

## O. Kept and flagged, with no flag in the catalogue yet (ADR-329)

The user's rule of 2026-10-04: the phone prevents a broken record, and one that reaches the server
anyway is **kept and flagged**. Intake keeps each (AC-05-38, 39). The flags have no code and no
words in `spec/FLAGS.md` yet: each is worded with the user by the task named (BACKLOG C67 (g)), as
a new code with its ADR, so these scenarios say only that the ticket is flagged.

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-06-155 | **Given** a field event received without its debris type, its load call or its kind of work, **then** its ticket is flagged | ADR-329 (1); AC-05-38 | domain (1.5.5, 1.5.7) | |
| AC-06-156 | **Given** a field event whose number was typed with no reason picked, **then** its ticket is flagged | ADR-329 (2); AC-05-38; BACKLOG C63 | domain (1.5.5) | |
| AC-06-157 | **Given** a load recorded on a crew's badge (`730417`), or unit rate work on a container's, **then** its ticket is flagged | ADR-329 (3); BACKLOG C63 | domain (1.5.5) | |
| AC-06-158 | **Given** a scale receipt whose net isn't its gross less its tare, **then** its ticket is flagged; the weights stay as typed, never corrected | ADR-329 (4); BACKLOG C65 | domain (1.5.7) | |
| AC-06-159 | **Given** a field event whose impossible GPS fix intake kept apart as sent, **then** its ticket is flagged "GPS unreadable" (the words to settle) | ADR-329 (5), 338 (10); AC-05-39; BACKLOG C69 | domain (1.5.5) | |
| AC-06-160 | **Given** a field event whose ticket number isn't digits, **then** it is flagged as not a valid ticket number and pairs with nothing until a person renumbers it | ADR-329 (6), 338; BACKLOG C69 | domain (1.5.3, 1.5.5) | in part: domain (2026-10-05, ADR-341), `packages/domain/test/tickets.test.ts`; the flag: 1.5.5 |
| AC-06-161 | **Given** a field event that ends before it starts, **then** its ticket is flagged | ADR-329 (6); AC-05-38 | domain (1.5.5) | |
| AC-06-162 | **Given** a disposal that holds two quantities (a load call beside a scale weight), **then** its ticket is flagged for holding both; which one bills is still read from the paying pay item, and the two are never compared | ADR-329 (7); `adms-validation` §5.2a | domain (1.5.4, 1.5.7) | in part: domain (2026-10-05, ADR-343), `packages/domain/test/quantities.test.ts`; the flag: 1.5.7 |

---

## Where each scenario is first proven

| Where it is first proven | Scenarios | How many |
|---|---|---|
| Milestone 1.5 (tasks 1.5.2…1.5.9) | every scenario not named below | 152 |
| Milestone 1.6 only (the rules) | AC-06-57, 70, 71, 91, 105, 120…123 | 9 |
| Task 1.8.x or 1.9.1 only (a reviewer's action as the story) | AC-06-69 | 1 |
| Phases 2–4 only | none (AC-06-58's difference at the sync is Phase 2's; its flag is 1.5.5's) | 0 |

162 scenarios. **Fifty-six pass and sixteen more in part** (after task 1.5.5, 2026-10-05, ADR-344, at the domain, `packages/domain/test/checks.test.ts` and `flags.test.ts`: AC-06-25…35, 37…40, 49, 50, 59…64, 117, 130, 131, 133, 136 whole; AC-06-17, 137 and 138 whole with their earlier halves; AC-06-41, 58 and 125 in part. Task 1.5.4, ADR-343: AC-06-73…77, 79, 81, 82, 84, 128 whole.) Task 1.5.2 (2026-10-05, ADR-340, at
the database): AC-06-06, 144, 145, 146 whole; AC-06-137, 138, 148, 152 the database's half. Task
1.5.3 (2026-10-05, ADR-341, at the domain, `packages/domain/test/tickets.test.ts`): AC-06-07, 08,
09, 11, 12, 15, 20, 22, 142 whole, and AC-06-19 and 21 whole with their database half; AC-06-10,
13, 14, 17, 23, 24, 125, 143, 160 the grouping's and the status's half. Each is under a test
named by its ID. Many have a second
part proven later (a reviewer's action in Milestone 1.8, the lines in 1.6, the whole mission in
1.9.1); each row says where.

## Every flag of the catalogue, and its scenario

| `spec/FLAGS.md` | Flags | Scenarios |
|---|---|---|
| §3.1 Between a ticket's field events (6) | `DEBRIS_TYPE_MISMATCH` · `CERT_NUMBER_MISMATCH` · `DISPOSAL_BEFORE_COLLECTION_ENDED` · `OVERLAPPING_LOADS` · `SPLIT_SUFFIX_GAP` · `CARRIED_COUNT_MISMATCH` | AC-06-25…27 · 28 · 29 · 30 · 32, 33 · 34 |
| §3.2 The certification (5) | `NO_CERTIFICATION` · `TYPED_CAPACITY_DIFFERS` · `TAG_EXPIRED` · `CERTIFICATION_REVOKED` · `CERTIFICATION_REPLACED` | AC-06-35, 36 · 37 · 38 · 39 · 40 |
| §3.3 Place and time (14) | `OUTSIDE_PROJECT_BOUNDARY` · `NO_ZONE` · `OUTSIDE_SITE_AREA` · `PROJECT_NOT_ACTIVE` · `SITE_NOT_YET_ACTIVE` · `SITE_CLOSED` · `NO_ROAD_ROUTE` · `DEVICE_CLOCK_OFF` · `WORK_TIME_AFTER_RECEIVED` · `WORK_TIME_BEFORE_ENROLMENT` · `DEVICE_TIME_ZONE_DIFFERS` · `PHONE_OUT_OF_SERVICE` · `TYPED_TICKET_NUMBER` · `BACK_OFFICE_RECORD` | AC-06-44 · 45 · 46…48 · 49, 50 · 51 · 52 · 55 · 58 · 59 · 60 · 61 · 62 · 17, 63 · 64 |
| §3.4 Where the debris went (5) | `SITE_DOES_NOT_TAKE_LOADS` · `SITE_NOT_FOR_HAUL_OUTS` · `INELIGIBLE_SITE` · `TIPPING_FEE_RULE_MISSING` · `HAUL_OUT_DUMPED_AT_TDSR` | AC-06-65 · 67 · 66 · 70, 71 · 68, 69 |
| §3.5 Quantity (10) | `LOAD_CALL_ZERO` · `LOAD_CALL_LOW` · `LOAD_CALL_HIGH` · `PILE_CALL_NOT_HIGHER` · `QUANTITY_MISSING_FOR_PAY_ITEM` · `SHARED_SCALE_WEIGHT` · `RECEIPT_TWO_DEBRIS_TYPES` · `SCALE_WEIGHT_UNUSABLE` · `CARRIED_TICKET_NOT_FOUND` · `CARRIED_TICKET_ON_ANOTHER_LOAD` | AC-06-85 · 86 · 87, 88 · 90 · 91 · 80 · 92 · 93 · 94 · 95 |
| §3.6 The pay item's settings, and unit rate work (14) | `MEASUREMENT_MISSING` · `GPS_MISSING` · `PHOTOS_MISSING` · `DECIMAL_COUNT` · `NO_SIZE_BAND` · `OUTSIDE_SIZE_BAND` · `MARKED_INELIGIBLE` · `STUMP_UNDER_24` · `ROOT_BALL_NOT_WIDER` · `FILL_WITHOUT_EXPOSED_ROOT_BALL` · `ROOT_BALL_MISSING` · `NO_SURVEY` · `CREW_ITEM_OVER_12_HOURS` · `CREW_TIME_OVERLAP` | AC-06-96 · 97 · 98 · 99 · 100 · 101 · 102 · 103 · 104 · 105 · 107 · 108 · 109 · 110 |
| §3.7 Forms, certifications and sites (7) | `ROE_MISSING` · `ROE_NOT_ON_PROJECT` · `ROE_UNSIGNED` · `ROE_OUT_OF_SCOPE` · `NO_PRE_WORK_SURVEY` · `CERTIFICATION_PHOTO_MISSING` · `PERMIT_OUTSTANDING` | AC-06-112 · 113 · 114 · 115 · 116 · 117 · 118 |
| §3.8 Pricing (4) | `NO_PRICING_RULE` · `DUPLICATE_TRANSACTION_NUMBER` · `NO_RATE_FOR_PRIME` · `RATE_TO_BE_NEGOTIATED` | AC-06-120 · 121 · 122 · 123 |
| §3.9 The engine (1) | `NOT_PROCESSED` | AC-06-124 |

**Never flagged** (`spec/FLAGS.md` §2): waiting, AC-06-13…15; a preload and a haul-out from a prior
date, 125; the distance a collection covers, 126; GPS accuracy, 127; split estimates against the
load call, 128; a scale weight against a load call, 129; a driver's licence and a trailer swap,
130; "hauling paid twice", 132; an unplanned assignment and planned against actual, 133; a drop-off
log against its site's facts, 134; a monitor's own hours, 135.

## Left to the task that builds it

Nothing recorded settles these, so no scenario asserts them. Each is decided in the ADR of the task
named, as an agent default the user may overturn, unless that task finds it changes money, evidence
or a monitor's work (ADR-230).

| # | What isn't settled | Decided with |
|---|---|---|
| 1 | How "reconciliation is queued" is kept: a queue's own record, or the worker reading every ticket with a field event received or changed since its last run (`05-sync.md` point 13) | 1.5.2, 1.5.9 |
| 2 | Who points a field event at a certification made after it arrived (intake looked once), and what queues the tickets that scanned its number (BACKLOG C62) | 1.5.2, 1.5.5 |
| 3 | Which of a field event's times is "the work time" for the certification, the site's dates, the phone's enrolment and removal, and a unit rate ticket's place in the active window; whether a tag is expired on its expiry date or from the day after; whether work on the day a certification was replaced is flagged (BACKLOG C61, C62) | 1.5.5 |
| 4 | Which checks run on the lone field event of a `PENDING` ticket (every check that needs only that event, the likely default), and whether a flag names the field event or the property it is about on a split | 1.5.5 |
| 5 | `OVERLAPPING_LOADS`: what "no disposal between" reads while a disposal hasn't synced; whether voiding the phantom clears the flag on the ticket the truck dumped under. (That both tickets are flagged is settled: the user, ADR-342, KD-71 (1)) | 1.5.5 |
| 6 | `SPLIT_SUFFIX_GAP`'s words for a bare collection beside suffixed ones (the catalogue words only a gap); whether a suffixed collection on a project that doesn't allow split loads is flagged (no flag exists) | 1.5.5 |
| 7 | The code and the words of each flag in section O (BACKLOG C67 (g)); how `TYPED_TICKET_NUMBER` reads with no reason | with the user: 1.5.5, 1.5.7 |
| 8 | What else has no flag: a control ticket scanned outside its ranges; a count of 2 where *Count is always 1*; an item that isn't its kind of work's; a pay item that isn't its payable type's; hours that aren't quarter hours; a stump read as a circumference; a payable type with several pay items, some with no band; a scale receipt whose site isn't the disposal's or isn't a Final Disposal site; one receipt on two trips (BACKLOG C63, C65, C68) | 1.5.5, 1.5.7 |
| 9 | Whether `DEVICE_CLOCK_OFF` can be raised in Phase 1 at all (the difference is kept on `Sync`, Phase 2's), and the worker's own thresholds joining the policy values (BACKLOG C53) | 1.5.5 |
| 10 | Whether a ticket's ROE flag puts the ticket in `MANUAL_REVIEW` (`spec/FLAGS.md` §3.7 says a flag there "never touches a ticket's status" and that a ticket's ROE flags still bill; §1 says any open flag does); an ROE with a signed date that isn't marked signed; a scope line's payable type no unit rate pay item has (BACKLOG C66) | 1.5.7 |
| 11 | Whether a photograph removed from the record counts towards the photographs a pay item requires, or a certification's five views (ADR-337 (5)) | 1.5.5, 1.5.7 |
| 12 | Whether `301005` carries `NO_SIZE_BAND` beside `STUMP_UNDER_24` (the mission says "under 24 in, and no band fits") | 1.5.7; 1.9.1 |
| 13 | Whether the crew-hours limit of 12 is the policy value `CREW_DAY_HOURS` or one of its own, and whether the flag is raised on every ticket of the day or the one that takes it over | 1.5.7 |
| 14 | Which pile, property or container takes the remainder when rounded shares don't add up; which quantity bills on a disposal that holds a load call and a count (BACKLOG C63) | 1.5.4: **decided (ADR-343, agent defaults):** the largest share takes it, the last of them where several are as large; the paying pay item says which quantity bills, and one marked *quantity from the tickets it carries* bills the carried tickets whatever call stands beside them |
| 15 | A project with no map (P2 has none): no boundary flag and no zone, the likely default; whether a haul-out's collection, at a TDSR, is given a zone or checked against the boundary | 1.5.6 |
| 16 | A site with no GPS: its area check and its mileage; a disposal on the close date itself, and that the date in `SITE_CLOSED`'s message is the disposal's day | 1.5.6, 1.5.8 |
| 17 | When a flag on a certification or a site is raised and cleared, since neither is a ticket the worker runs | 1.5.5, 1.5.6 |
| 18 | A ticket that errored (`NOT_PROCESSED`): its status, and what stays of its earlier conclusions; whether the worker states the person who asked for a reprocess (BACKLOG C20); how a pending ticket is listed in a run's result | 1.5.9 |

**Carried into Milestone 1.5** (`agent_store/BACKLOG.md`, the register): **C16** (the provisional
`CompletedLoad` gives way to §5's records), **C20** (one `$write` per ticket), **C50** (what the
worker asks the map servers), **C52** (the two haul-out flags: AC-06-67, 68), **C53** (the worker's
thresholds as policy values), **C55** (REQ-105d with the ROE flags, REQ-105j with "project not
active"), **C61…C63, C65, C66, C68** (the points above), **C67 (g)** (section O's words) and
**C69** (what intake left: the quarantine never read, the queue, a later certification,
`unreadableGps`).

**Not in Milestone 1.5** (their rules are recorded): which rules pass, their order and their lines
(Milestone 1.6, `07-pricing-ledger-audit.md`); transactions regenerated and copied to the audit
log, a contractor user's sight (1.7); correcting, renumbering, voiding, accepting, QC and the
invoice lock (1.8, `08-review-and-corrections.md`, `09-invoice-deliver-closeout.md`); the review
queue's screen (Phase 4).
