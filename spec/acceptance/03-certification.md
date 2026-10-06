# Acceptance scenarios — Part 3, Certify containers and crews

✅ ** Approved**: agent-written (ADR-317; KD-69 settled by the user, ADR-318); the user approves.

← [Acceptance scenarios](README.md) · The part page: [Part 3 — Certify containers and crews](../parts/03-certification.md)

> Each scenario restates a recorded rule; **From** names it. Values are the example world's
> (`spec/CONVENTIONS.md` §6; the golden mission §1): P1's certifications `730415` (Coastline dump
> trailer, 65 CY), `730416` (Rivera self-loader, 48 CY), `730419` (Coastline walking floor, 110 CY),
> `730417` (Coastline bucket truck crew) and `730418` (Coastline skid steer crew); the tandem
> `730421` and `730422`. How to read the columns: [README](README.md).
>
> **The capacity examples** are `adms-certifications` §3A.3's own, or are worked out on this page
> from §3A.3's formulas with every step shown. None comes from `development/`, whose truck-capacity
> section is wrong (the user, 2026-09-24).

**Where each scenario is proven.** A certification is a record, not a ticket's field event, so this
part is spread over several tasks:

| Mark in **Proven at** | Meaning |
|---|---|
| **domain (1.2.2)** | The capacity math, a unit test in `packages/domain` |
| **database (1.2.3)** · **story (1.2.3)** | The certification's records, their guards and the service that writes them |
| **1.3.x** · **1.5.x** · **1.7.1** · **1.8.x** · **1.9.1** | A later Phase 1 task: numbering (1.3.2), what a field event records (1.3.3), photos (Milestone 1.3), quantities (1.5.4), the flags (1.5.5), a transaction's prime and sub (1.7.1), QC marks and corrections (1.8.2, 1.8.3), the golden mission (1.9.1) |
| **API (Phase 2)** · **field app (Phase 3)** · **back office (Phase 4)** | The rule is recorded; nothing in Phase 1 builds it |

**Throughout:** every write below is made by a named person and is audited by the database with
that person as its actor (REQ-011); nothing is deleted. **Nothing here refuses field work:** a
problem with a certification is a flag on the ticket or on the certification (ADR-052).

---

## A. What is certified, and its one number (steps 1, 6, 11)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-03-01 | **Given** P1's five certifications, **then** each is a container or a crew, said on the record, and never a vehicle: `730415`, `730416` and `730419` are containers with a capacity (65, 48 and 110 CY); `730417` and `730418` are crews | ADR-009, 015; `spec/DATA-MODEL.md` §3 · REQ-106 | database (1.2.3) | database (2026-10-03, ADR-321); story `certification` (2026-10-03, ADR-321) |
| AC-03-02 | **Given** crew `730417`, **then** it has no capacity and no measured box, and the database refuses either on a crew. **Given** container `730415`, **then** it has both, and the database refuses a container without them | invariant 10; `spec/DATA-MODEL.md` §8 · REQ-106 | database (1.2.3) | database (2026-10-03, ADR-321) |
| AC-03-03 | **Given** `730415` on P1, **when** a second certification numbered `730415` is written on P1, **then** the database refuses it. The same number on P2 is not refused or flagged: a cert number is unique within its project and nowhere else, and the golden mission's P2 has its own `730416` | ADR-045, 318; golden mission §3 · REQ-106a | database (1.2.3) | database (2026-10-03, ADR-321); story `certification` (2026-10-03, ADR-321) |
| AC-03-04 | **Given** any certification, **then** it holds one number: the cert number is the placard number is the badge number. No record holds a placard number or a badge number beside it | ADR-016, 045; invariant 9 · REQ-106a | database (1.2.3) | database (2026-10-03, ADR-321) |
| AC-03-05 | **Given** a pre-printed certification sheet numbered `88120`, **when** the monitor types that number in, **then** it is the certification's number, kept as written; no length is enforced. The sheet's own barcode isn't used | ADR-045, 080 · REQ-106a | database (1.2.3) | database (2026-10-03, ADR-321); story `certification` (2026-10-03, ADR-321) |
| AC-03-06 | **Given** P1's cert-number series starts at `730415`, **then** the system issues `730415`, `730416`, `730417`… counting up by one; a certifying phone holds a block of 100 of them, topped up at sync and reclaimed when the phone is reset | ADR-045, 151, 181; Q-96 (ADR-102) · REQ-106a, 114 | database and domain (1.3.2; C43) | database and domain (2026-10-03, ADR-323) |
| AC-03-07 | **Given** Coastline's tandem, **then** its truck body `730421` (30 CY) and its trailer `730422` (40 CY) are two certifications, each with its own number. The numbers are consecutive here but needn't be, and a trailer swap is never flagged | ADR-015, 114; Q-96 | two records: database (1.2.3); never flagged: domain (1.5.5) | database (2026-10-03, ADR-321) (two records; never flagged waits for 1.5.5) |
| AC-03-08 | **When** Sam Grant, whose assignment on P1 for Saturday 10 October 2026 includes certifying, certifies `730415` on `P1-HO-TDSR`, **then** the record says who made and measured it (Sam), the phone, his assignment, the phone's time with its offset, and when the server received it; its id is the one the phone made | ADR-151, 240, 294; `spec/DATA-MODEL.md` §1, §3 · REQ-106b | database (1.2.3) | database (2026-10-03, ADR-321) |
| AC-03-09 | **Given** certifying is done where there is signal, **then** the project knows a new certification exists before its truck works, and any phone with a connection can refresh its lists to pick it up, at any time | ADR-151 (Q-142) | API (Phase 2); field app (Phase 3) | |

## B. Whose truck: the prime and its subs (step 3)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-03-10 | **When** a certification on P1 names its prime, **then** it is one of P1's own primes (Coastline Haulers or Summit Debris Services). A sub (Rivera Trucking), or a contractor that isn't on P1, is refused as the prime by the database | ADR-108, 305 (C56) · REQ-106e | database (1.2.3) | database (2026-10-03, ADR-321) |
| AC-03-11 | **Given** nobody entered Rivera Trucking at P1's setup, **when** Sam certifies `730416`, picks Coastline and types "Rivera Trucking" into tier 1, **then** Rivera is a contractor placed on P1 as a tier 1 sub under Coastline from that moment, and `730416` names prime Coastline and first-tier sub Rivera | ADR-108; AC-01-19; C56, C60 · REQ-106e | story (1.2.3); the place on the project: database (1.2.3) | story `certification` (2026-10-03, ADR-321); the place: database (2026-10-03, ADR-321) |
| AC-03-12 | **Given** Tidewater Hauling works under Rivera, **when** its truck is certified with Coastline picked, Rivera in tier 1 and "Tidewater Hauling" typed into tier 2, **then** Tidewater is placed on P1 as a tier 2 sub under prime Coastline, the certification names all three, and its operating sub is Tidewater, the lowest tier filled. There is no third tier | ADR-108; `spec/DATA-MODEL.md` §3 · REQ-106e | database (1.2.3) | database (2026-10-03, ADR-321); story `certification` (2026-10-03, ADR-321) |
| AC-03-13 | **Given** `730415`, Coastline's own dump trailer, **then** it names its prime and no sub, and it has no operating sub | ADR-108; `spec/DATA-MODEL.md` §3 | database (1.2.3) | database (2026-10-03, ADR-321) |
| AC-03-14 | **Given** Rivera is already known under Coastline on P1, **when** the next monitor certifying a Coastline truck starts typing a sub, **then** the phone suggests Rivera. A second spelling typed anyway is merged later by the back office (AC-01-21) | ADR-108 | field app (Phase 3) | |
| AC-03-15 | **Given** ticket 101002 scanned badge `730416`, **then** the certification says whose work it is: its two transactions are recorded as prime Coastline and operating sub Rivera, at Coastline's rate. No monitor picked a contractor | ADR-186, 212; golden mission §2 · REQ-106g | database (1.7.1); story (1.9.1) |database (2026-10-06, ADR-358): `packages/db/test/transactions.test.ts`, with AC-07-85; the story: 1.9.1 |

## C. Driver, tag, vehicle type and features (steps 2, 4, 5)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-03-16 | **Given** `730415` was certified with its driver's name, phone, licence number, state and expiry, **then** they are kept on the certification only: there is no driver list, a ticket shows and exports its certification's driver, and no field event stores a copy | ADR-153, 289; `spec/DATA-MODEL.md` §12 (12) · REQ-106 | database (1.2.3); no copy on a field event: database (1.3.3) | database (2026-10-03, ADR-321) (and no driver column on a field event in its full shape: AC-04-25, ADR-324) |
| AC-03-17 | **Given** the driver's licence on `730416` expired on 30 September 2026, **when** its tickets of 12 October are reconciled, **then** nothing is flagged for the licence, and nothing is flagged because somebody else was driving | ADR-153; `spec/FLAGS.md` §2 · REQ-106 | domain (1.5.5) | |
| AC-03-18 | **When** a truck is certified, **then** its tag (plate) number, state and expiry are kept | ADR-079, 153 · REQ-106b | database (1.2.3) | database (2026-10-03, ADR-321) |
| AC-03-19 | **When** `730416` is certified, **then** its vehicle type is picked from the firm's list (Self-Loading Truck), with a typed description beside it only where "Other" applies; each measured box after the primary is labelled with a feature picked from the firm's list (Sideboards, Dog Box…), or a typed one; a crew type (Bucket Truck, Skid Steer) is picked on a crew only | ADR-070, 076, 228; `spec/LISTS.md` · REQ-106b | database (1.2.3) | database (2026-10-03, ADR-321) |
| AC-03-20 | **Given** any certification, **then** it records no truck number, VIN, make, year, colour or tare weight; its client and declaration event are its project's, not fields of its own | Q-76; ADR-073, 080 | database (1.2.3) | database (2026-10-03, ADR-321) |

## D. Capacity (steps 7–8)

All measurements are whole inches; π is 3.14; every step is rounded to hundredths, a half up; the
total is divided by 46,656 (36³); the capacity is that to the nearest whole cubic yard, .5 up
(`adms-certifications` §3A.3, user-confirmed). Each row shows its arithmetic.

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-03-21 | **Given** a primary box 240 × 90 × 60 = 1,296,000; sideboards 240 × 90 × 12 = 259,200, **added**; a dog box 30 × 90 × 40 = 108,000, **÷2** = 54,000, **subtracted**, **then** the total is 1,501,200 cu in, ÷ 46,656 = 32.18, and the capacity is **32 CY** | §3A.3's worked example; ADR-076 · REQ-106d | domain (1.2.2) | domain (2026-10-03, ADR-320) |
| AC-03-22 | **When** a measurement is given with a fraction of an inch (59.5), **then** it isn't taken: every measurement is a whole number of inches | §3A.3; ADR-076 · REQ-106d | domain (1.2.2); the columns: database (1.2.3) | domain (2026-10-03, ADR-320); database (2026-10-03, ADR-321) |
| AC-03-23 | **Given** a box marked ÷2 (a triangle) of 30 × 90 × 40, **then** it is 108,000 ÷ 2 = **54,000.00 cu in**; unmarked (a rectangle) it is 108,000.00 | §3A.3; ADR-076 · REQ-106d | domain (1.2.2) | domain (2026-10-03, ADR-320) |
| AC-03-24 | **Given** a hoist box with two lengths, 30 and 21, 20 wide and 36 high, **then** its length is (30 + 21) ÷ 2 = 25.50 and it is 25.50 × 20 × 36 = **18,360.00 cu in**; the monitor enters both lengths | §3A.3; ADR-082, 087 · REQ-106d | domain (1.2.2) | domain (2026-10-03, ADR-320) |
| AC-03-25 | **Given** a round bottom of diameter 90 and length 240, **then** it is a half cylinder with π as 3.14: 90 ÷ 2 = 45; 45² = 2,025; × 3.14 = 6,358.50; × 240 = 1,526,040.00; ÷ 2 = **763,020.00 cu in** (never 763,407, which is what a longer π gives) | §3A.3; Q-68 (ADR-076, 078) · REQ-106d | domain (1.2.2) | domain (2026-10-03, ADR-320) |
| AC-03-26 | **Given** radius corners of R 12 with a run of 60, two of them, **then** they are (12 × 12 − 3.14 × 12 × 12 ÷ 4) = 144 − 113.04 = 30.96; × 60 = 1,857.60; × 2 = **3,715.20 cu in**, and a radius corner is always subtracted: one marked "add" is refused | §3A.3's example; ADR-087 (Q-78) · REQ-106d | domain (1.2.2); the sign: database (1.2.3) | domain (2026-10-03, ADR-320); database (2026-10-03, ADR-321) |
| AC-03-27 | **Given** radius corners of R 5 with a run of 48, four of them, **then** each step is rounded to hundredths before the next: 5 × 5 = 25; 3.14 × 25 ÷ 4 = 19.625 → 19.63; 25 − 19.63 = 5.37; × 48 = 257.76; × 4 = **1,031.04 cu in** (never 1,032.00, which is what rounding only at the end gives) | §3A.3 ("round to hundredths after each step"); ADR-078, 082 · REQ-106d | domain (1.2.2) | domain (2026-10-03, ADR-320) |
| AC-03-28 | **Given** a primary box 240 × 90 × 70 = 1,512,000 and a box 21 × 20 × 10 = 4,200 added, **then** 1,516,200 ÷ 46,656 = 32.4974… → 32.50 → **33 CY**: hundredths first, then a whole CY with .5 up. **Given** the primary box alone, **then** 1,512,000 ÷ 46,656 = 32.4074… → 32.41 → **32 CY** | §3A.3; Q-79 (ADR-082) · REQ-106d | domain (1.2.2) | domain (2026-10-03, ADR-320) |
| AC-03-29 | **Given** a container with a primary box and seven more, **then** all are taken (there is no limit on their number) and each is kept, in order, with its feature, its shape (rectangle, triangle, two-length hoist, round bottom, radius corner), add or subtract, and its measurements, so the capacity can be worked out again from the record | §3A.3 ("store the boxes"); `spec/DATA-MODEL.md` §3 · REQ-106d | domain (1.2.2); database (1.2.3) | domain (2026-10-03, ADR-320); database (2026-10-03, ADR-321) |
| AC-03-30 | **Given** any container, **then** nobody types its capacity: the certification's capacity is what its boxes work out to, and a wrong capacity is fixed only by fixing a measurement | ADR-076; Q-68 · REQ-106d | story (1.2.3) | story `certification` (2026-10-03, ADR-321) |
| AC-03-31 | **Given** the measured boxes of `730415`, `730416` and `730419` (recorded in `spec/CONVENTIONS.md` §6 by task 1.2.2), **then** they work out to **65**, **48** and **110 CY**, the capacities the golden mission bills on | golden mission §1; `BACKLOG.md` 1.2.2 · REQ-106d | domain (1.2.2) | domain (2026-10-03, ADR-320) |
| AC-03-32 | **Given** crew `730417`, **then** the capacity math has nothing to measure and gives no capacity: not zero, none | invariant 10; ADR-076 · REQ-126 | domain (1.2.2) | domain (2026-10-03, ADR-320) |
| AC-03-33 | **Given** ticket 101001 on `730415` with a load call of 80%, **then** it bills 65 × 80 ÷ 100 = **52.0 CY**: the whole-CY capacity times the load call | `adms-validation` §5.5; golden mission §2 · REQ-126 | domain (1.5.4); story (1.9.1) | |

## E. Photographs, attestation and QC (steps 9, 10, 12)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-03-34 | **When** a truck is certified, **then** it takes five photographs, each marked with its view: operator with the placard; interior or back; right side; left side; front | ADR-179 (Q-173) · REQ-106f | database (Milestone 1.3, with `Photo`) | database (2026-10-04, ADR-326: each photograph's record says its view; AC-04-78) |
| AC-03-35 | **Given** `730416` synced without its left side view, **then** the certification is saved and usable, and it is flagged on the certification itself, "Certification 730416: no left side photo.", which touches no ticket's status | ADR-179; `spec/FLAGS.md` `CERTIFICATION_PHOTO_MISSING` · REQ-106f | domain (1.5.5) | |
| AC-03-36 | **Given** Sam Grant certifies `730415` with Lee Morgan, who is assigned to P1 with him that day, **then** Sam is recorded automatically as the monitor who made and measured it, and Lee as the helper he picked. A helper is picked, never typed; none at all is allowed; the same helper twice on one certification is refused | ADR-080, 294; `spec/DATA-MODEL.md` §3, §12 (18) · REQ-106b | database (1.2.3); the pick list: field app (Phase 3) | database (2026-10-03, ADR-321) |
| AC-03-37 | **When** the client's and the contractor's representatives are named on a certification, **then** each is a typed name and nothing more: no ID, no signature | ADR-080 · REQ-106b | database (1.2.3) | database (2026-10-03, ADR-321) |
| AC-03-38 | **Given** `730415` was just certified, **then** its QC status is QC Review. **When** Luis sets it QC Approved (or QC Issues, or QC Void), **then** he is recorded as "checked by", and he marks whether signatures are on file. It is QC'd on its own, never with a ticket | ADR-080, 107, 168; `spec/DATA-MODEL.md` §6 · REQ-106f | signatures on file: database (1.2.3); the mark: database (1.8.2); the screen: back office (Phase 4) | signatures on file: database (2026-10-03, ADR-321); the mark: database (2026-10-06, ADR-363), `packages/db/test/marks.test.ts` (AC-08-58) |
| AC-03-39 | **Given** `730415` is still at QC Review on Monday, **when** ticket 101001 scans its badge, **then** nothing is flagged for it: a certification is usable before QC | ADR-052, 080 | domain (1.5.5) | |

## F. At reconciliation: judged at work time, flagged, never blocked (steps 13, 15)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-03-40 | **Given** a monitor scans badge `730415` at New, **then** the field event records the certification it found and its own copy of the number as scanned. **When** the certification is later corrected, **then** the number on the field event doesn't change | ADR-017; `spec/DATA-MODEL.md` §4.1 | database (1.3.3) | database (2026-10-03, ADR-324): `field-events.test.ts`, with AC-04-27 |
| AC-03-41 | **Given** a field event on P1 with cert number `730499`, which no certification on P1 has, **then** it is received, and its ticket is flagged "Ticket 101015: no certification 730499 on this project. Flagged for review; not billed." | ADR-052, 154; `spec/FLAGS.md` `NO_CERTIFICATION` | domain (1.5.5) | |
| AC-03-42 | **Given** that ticket, **when** a certification numbered `730499` is made on P1 and the ticket is reprocessed, **then** the flag clears and the ticket bills at that certification's capacity: unbilled only until one exists | ADR-154 (Q-145) | story (Milestone 1.5) | |
| AC-03-43 | **Given** a field event on P2 with cert number `730415`, and `730415` is certified only on P1, **then** it is flagged as AC-03-41 is, never refused: a certification belongs to one project | ADR-052, 154; `adms-certifications` §3A.6 (6) | domain (1.5.5) | |
| AC-03-44 | **Given** the tower monitor has no badge to scan and keys in `730415` with the capacity 60 read off the truck, **then** the certification's 65 CY bills, and the ticket is flagged "Ticket 101016: capacity typed 60, certified 65. Flagged for review." | ADR-154 (Q-145); `spec/FLAGS.md` `TYPED_CAPACITY_DIFFERS` | what is keyed in: database (1.3.3); the flag: domain (1.5.5) | |
| AC-03-45 | **Given** a load whose collection scanned `730415` and whose disposal scanned `730416`, **then** the numbers are compared exactly and the ticket is flagged "Ticket 101008: truck number doesn't match (collection 730415, disposal 730416). Flagged for review."; it bills from the certification on the field event that took the quantity (the disposal) | ADR-017, 019, 290; `spec/FLAGS.md` `CERT_NUMBER_MISMATCH`, §5 (1) | domain (1.5.5) | |
| AC-03-46 | **Given** `730416`'s tag expired on 30 September 2026, **when** a ticket worked on 12 October is reconciled, **then** it is flagged "Ticket 101017: review certification 730416 (tag expired 30-Sep-2026). Flagged for review." and still bills. **Given** a tag that expires on 31 October instead, **when** that same ticket is reprocessed in November, **then** it isn't flagged: the tag is judged at the work time, never "now" | ADR-048, 079, 153 (Q-144); `spec/FLAGS.md` `TAG_EXPIRED` · REQ-106f | domain (1.5.5) | |
| AC-03-47 | **Given** `730416` is revoked from 14 October 2026, **then** a ticket worked on or after that date is flagged "Ticket 101018: review certification 730416 (revoked from 14-Oct-2026). Flagged for review." and still bills; Tuesday 13 October's tickets are not flagged | ADR-048, 079; `spec/FLAGS.md` `CERTIFICATION_REVOKED` · REQ-106f | domain (1.5.5) | |
| AC-03-48 | **Given** `730416` was replaced by `730420` on 14 October 2026, **then** a ticket worked on the old number after that is flagged "Ticket 101019: review certification 730416 (replaced by 730420 on 14-Oct-2026). Flagged for review." and still bills; Monday's and Tuesday's tickets on `730416` are not flagged | ADR-048, 082; `spec/FLAGS.md` `CERTIFICATION_REPLACED` · REQ-106f | domain (1.5.5) | |
| AC-03-49 | **Given** `730415` has no expired tag, was never revoked and never replaced, **then** no amount of time flags its tickets: a certification never ends on its own | ADR-079 (Q-69, Q-74) · REQ-106f | domain (1.5.5) | |
| AC-03-50 | **Given** a collection waiting alone for its disposal, **when** its certification's tag had expired at its work time, **then** the ticket stays `PENDING` and shows that flag, so the review queue can act on it | ADR-244; `spec/FLAGS.md` §1 | domain (1.5.5) | |

## G. Later changes (step 14)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-03-51 | **Given** a container certified with AC-03-21's boxes, but with the sideboards' height typed 21 by mistake (240 × 90 × 21 = 453,600; total 1,695,600; ÷ 46,656 = 36.34; **36 CY**), **when** a permitted person corrects the height to 12, **then** the certification is corrected in place, its capacity becomes **32 CY**, and the audit log keeps the prior values with that person as actor. The capacity itself is never typed | ADR-051, 079 (Q-74) · REQ-106f | story (1.2.3) | story `certification` (2026-10-03, ADR-321) |
| AC-03-52 | **Given** that correction, **then** every ticket on the certification reprocesses at the new capacity; one already locked as invoiced is unlocked first, and the unlock is audited | ADR-057, 079 · REQ-106f | story (1.8.3) | |
| AC-03-53 | **Given** sideboards were added to Rivera's self-loader on 14 October, **when** it is certified again, **then** that is a new certification with a new number, `730420`, holding a "replaces" link to `730416` and the reason; `730416` is kept unchanged, and each shows the other ("replaces 730416 (sideboards added, 14 Oct)", "replaced by 730420 on 14 Oct") | ADR-079, 082 (Q-77) · REQ-106f | database (1.2.3); the wording shown: back office (Phase 4) | database (2026-10-03, ADR-321); story `certification` (2026-10-03, ADR-321) |
| AC-03-54 | **Given** `730420`, **then** its number is `730420` and nothing else: a MOD label may be shown beside it, display only, never a prefix | ADR-082 (Q-77) | back office (Phase 4) | |
| AC-03-55 | **When** Dana, an admin, revokes `730416` from 14 October 2026 with a reason, **then** the certification keeps the date, the reason and who revoked it; a date without a reason is refused. Nothing else on the certification changes and nothing is blocked | ADR-079 (Q-74) · REQ-106f | database (1.2.3); only an admin: API (Phase 2) | database (2026-10-03, ADR-321); story `certification` (2026-10-03, ADR-321) |
| AC-03-56 | **Given** Rivera's self-loader `730416` on P1, unmodified, starts work on P2 as well, **then** it is certified on P2 from scratch: measured and photographed again, with a number of P2's own. A certification is never copied, and nothing on one names a certification of another project (rewritten 2026-10-04: the user, ADR-328, 329, superseding ADR-152's copy) | ADR-328, 329 · REQ-106f | database (1.2.3) | database (2026-10-04, ADR-330): `certifications.test.ts` |
| AC-03-57 | ~~**Given** that copy, `880112` on P2, **when** a measuring mistake is corrected in it, **then** the original is flagged for review~~ **Withdrawn 2026-10-04 (the user, ADR-328): a certification is never copied, so there is no copy to correct and no `REVIEW_ORIGINAL_CERTIFICATION`** | ADR-328 | withdrawn | |
| AC-03-58 | **Given** any certification, replaced, revoked or QC Void, **then** it is never deleted: it is the evidence that a measurement was taken, and the database refuses a delete for every login | invariant 1; ADR-007 · REQ-010 | database (1.2.3) | database (2026-10-03, ADR-321) |

## H. Who writes it, and who sees it

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-03-59 | **Given** a certification, its boxes and its helpers, **then** every write is audited by the database with a real actor, the API's login writes them, and the worker reads them and writes none | ADR-097, 271; `spec/DATA-MODEL.md` §3 (*Configuration*) · REQ-011 | database (1.2.3) | database (2026-10-03, ADR-321); story `certification` (2026-10-03, ADR-321) |
| AC-03-60 | **Given** Bayline County's client user, or an auditor given P1, **then** they see P1's certifications, boxes and helpers, without the driver's licence number or the driver's phone number, and none of another project's | ADR-169; AC-02-71; C59 · REQ-014 | database (1.2.3) | database (2026-10-03, ADR-321) |

---

## The count

**59 scenarios** (60 written; AC-03-57 withdrawn, ADR-328), **41 passing** (2026-10-06). Task 1.8.2 (ADR-363, people's marks): AC-03-38's QC mark, so it passes whole, at the database. Task 1.7.1 (ADR-358, `Transaction` in full): AC-03-15, 101002's lines recorded as prime Coastline and operating sub Rivera, from the certification its tower scanned, at the database. Task C67 (a) (ADR-330): AC-03-56 rewritten, a truck on a second project is certified there from scratch, at the database. Task 1.3.5 (ADR-326, photographs): AC-03-34, a certification's five views, at the database. Task 1.3.3 (ADR-324, what every field event records): AC-03-40, the cert number as scanned and the certification found, at the database. Task 1.3.2 (ADR-323, numbering): AC-03-06, the cert-number series and its blocks of 100, at the database and the domain. Task 1.2.2 (ADR-320, the capacity
math, `packages/domain`'s `Capacity`): AC-03-21…29, 31 and 32 at the domain. Task 1.2.3 (ADR-321,
the certification's records): AC-03-01…05, 07, 08, 10…13, 16, 18…20, 30, 36, 37, 51, 53, 55, 56
and 58…60 at the database (`packages/db/test/certifications.test.ts`, each under a test named by
its ID) or in the story `certification`, and the database's part of AC-03-22, 26 and 29;
AC-03-38's "signatures on file" passes, and its QC mark since task 1.8.2 (ADR-363): it passes whole at the database.

| Where it is first proven | Scenarios | How many |
|---|---|---|
| Task 1.2.2, the capacity math (domain) | AC-03-21…29, 31, 32 | 11 |
| Task 1.2.3, the certification's records (database or story) ✅ | AC-03-01…05, 07, 08, 10…13, 16, 18…20, 30, 36, 37, 51, 53, 55, 56, 58…60 | 25 |
| Later Phase 1 tasks | AC-03-06 (1.3.2 ✅); 40 (1.3.3 ✅); 34 (Milestone 1.3); 33 (1.5.4); 17, 35, 39, 41…50 (Milestone 1.5); 15 (1.7.1 ✅); 52 (1.8.3) | 19 |
| Phases 2–4 only | AC-03-09, 14, 54 | 3 |
| In two places | AC-03-38: signatures on file with 1.2.3, the QC mark with 1.8.2 | 1 |

AC-03-07, 16, 22, 26, 29, 44 and 53 also have a second part proven later; each row says where.

## Left to the task that builds it

Nothing recorded settles these, so no scenario asserts them. Each is decided in the ADR of the task
named, as an agent default the user may overturn, unless that task finds it changes money, evidence
or a monitor's work (ADR-230).

| # | What isn't settled | Decided with |
|---|---|---|
| 1 | ~~What the capacity math does with a measurement of zero, a box with a measurement missing, or boxes that subtract more than the primary holds~~ **Decided (ADR-320, agent default):** none of them gives a capacity. A zero, missing or fractional measurement is named ("Box 1 (two-length hoist): its second length is missing. Every measurement is a whole number of inches, 1 or more."); boxes that subtract as much as the primary holds, or more, show their lines and total and give none. The math never guesses; whether such a certification is saved is 1.2.3's | 1.2.2 ✅ |
| 2 | ~~Which roundings of §3A.3 are "a step" inside one shape's formula, beyond the cases worked above (AC-03-24…27), and that the hundredths rounding is half up everywhere as Q-79's is~~ **Decided (ADR-320, agent default):** every single operation, in the order §3A.3 writes the formula, is a step, rounded half up. With whole inches only a round bottom (after × 3.14 and after ÷ 2), a radius corner (after ÷ 4) and the ÷ 46,656 can round at all | 1.2.2 ✅ |
| 3 | ~~How the database holds "a container has boxes" (a check on one row can't see another table), and that position 0 is the one primary~~ **Decided (ADR-321):** a box repeats its certification's kind, held by a foreign key, so only a container holds one; two deferred constraint triggers ask for the primary box when the piece of work ends; position 0 is a rectangle that adds, never archived | 1.2.3 ✅ |
| 4 | ~~Whether the database, or only the service, holds a certification's subs to subs placed under its own prime on its own project, and refuses a tier 2 with no tier 1~~ **Decided (ADR-321):** the database holds both (a three-column foreign key to the sub's place under that prime; a check); which tier a place is, the service | 1.2.3 ✅ |
| 5 | ~~What happens when a monitor types a sub that is already another prime's sub on the project~~ **Decided (ADR-321):** its place isn't moved; the certification is saved under a separate contractor record of that name, placed as typed, with a warning for the back office | 1.2.3 ✅ |
| 6 | ~~What merging two spellings of a sub moves; whether a merge into an already-merged contractor is refused~~ **Decided (ADR-321):** the kept record takes the duplicate's place on each project, the certifications that named the duplicate name the kept one, the duplicate and its places are archived; a merge into an archived or merged record, of a prime, or of two records placed differently on one project, is refused | 1.2.3 ✅ |
| 7 | ~~Whether a vehicle type's *certifies* is held to the certification's kind, and whether a container must have a vehicle type~~ **Decided (ADR-321):** neither; a type is picked or typed, never both | 1.2.3 ✅ |
| 8 | ~~Whether the database refuses a certification made by someone whose assignment doesn't include certifying, or a helper who isn't assigned to the project that day~~ **Decided (ADR-321):** neither is refused, by the database or the service | 1.2.3 ✅ |
| 9 | ~~Which date "replaced on" is, and whether "replaces" must point within the project and "copied from" outside it~~ **Decided (ADR-321):** the new certification's certified time, as a day in the project's time zone; "replaces" names a certification of its own project, once; a copy onto the original's own project is refused by the service. **Still open:** whether work on that same day is flagged | 1.2.3 ✅; the flag: 1.5.5 |
| 10 | Whether a tag is expired on its expiry date or from the day after, and which of a field event's times is "the work time" for a certification | 1.5.5 |
| 11 | ~~What a contractor user sees of certifications~~ **Decided (ADR-321):** none yet; its own come with a transaction's prime and operating sub. **Built (ADR-361):** the certifications that name its contractor, as the prime or as either tier of sub, with their boxes and helpers, without the driver's phone or licence number (AC-02-78, 79; `certifications.test.ts`) | 1.2.3 ✅; 1.7.3 ✅ (ADR-361) |
| 12 | ~~Which audit domain a certification belongs to~~ **Decided (ADR-321):** billing, with its boxes; its helpers operations | 1.2.3 ✅ |
| 13 | What QC Void on a certification does to tickets on it (nothing recorded says it flags them) | 1.8.2 ✅ (ADR-363: nothing at the database; no flag exists for it; the user's to say if one should) |
| 14 | ~~A copy's photographs: whether the copy points at the original's or holds its own~~ **Falls away (ADR-328): a certification is never copied** | ✅ |

**Settled by the user, 2026-10-03 (KD-69 closed, ADR-318):** the golden mission's P2 ticket 102001
scans cert `730416`, the number Rivera's self-loader also has on P1, and that stands. **User:**
> KD-69 (b) because a placeard number (the number on the side of the truck and what is scanned by the bardcord or manually entered) is unique per project only. Multiple projects could in theory contain the same placeard numbers. The only thing the system cares about it that no single placeard number appears on a project more than once.

So P2 has its own certification `730416` (AC-03-03). **Since 2026-10-04 (the user, ADR-328, 329)
a certification is never copied:** the truck is certified on P2 from scratch (AC-03-56).

**Not in Phase 1** (their rules are recorded): certifying on the phone, its sub suggestions and its
itemised receipt (Phase 3, `adms-field-app`); the certification screens, the "replaces" wording and
QC (Phase 4, REQ-403). No placard or badge is printed by Open ADMS (ADR-088).
