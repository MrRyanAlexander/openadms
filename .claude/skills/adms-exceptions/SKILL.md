---
name: adms-exceptions
description: Open ADMS failure cases and how people resolve them, in today's rules. Covers the special cases around a ticket's field events, why nothing can be validated in the field, duplicate field events quarantined at sync and resolved by a person, four worked scenarios (a barcode scanned twice at the tower, a phantom collection, sync in any order, a legitimate split load), renumber versus void versus accept, corrections in place by permission (a monitor's own reopen until the shift ends, the back office after), reprocessing completed tickets, back-office-created records, an out-of-service phone, and the other duplicate and orphan shapes. Use when handling duplicates, quarantine, unpartnered field events, preloads, corrections, voids, renumbering or split chains. Flags and their wording live in adms-validation; pricing in adms-ledger-audit.
---
<!-- skill-status: current (a change to a locked ticket refused by the review services, ADR-367; how void and unvoid are built, ADR-365; an unvoid's own record, ADR-366; ADR-138, rewritten 2026-09-29, ADR-248; an ROE's duplicate number quarantined, ADR-338) -->

> **This page states today's rules** (last changed by ADR-248, as its status line lists). Each rule cites its ADR; what changed is in
> the History list at the end. The user's own words are quoted and marked **User**. If this page and
> `agent_store/SUMMARY.md` disagree, SUMMARY wins: log a KD (`adms-decisions`). The worked example
> is `spec/golden/MISSION.md`; names and examples follow `spec/CONVENTIONS.md`. The words (field
> event, ticket, completed load, flag) are defined once, in `adms-domain` Part 2.

# PART 4 (cont.) — WHEN THINGS GO WRONG, AND HOW PEOPLE PUT THEM RIGHT

A ticket is **its number and the field events recorded under it**; the completed load, the status,
the flags and the transactions are **conclusions the worker draws from the events**, again on every
reprocess (`adms-domain` §1.2; ADR-236). So every fix on this page is one of three things: **a field
event is corrected in place** (audited), **a ticket is voided** (work that never happened), or **a
flag is accepted** (right as it is). Then the worker draws its conclusions again. **No person ever
writes a completed load or a transaction** (invariant 4). This page owns duplicates and quarantine,
renumber vs void, corrections and reprocessing, orphans and preloads, back-office-created records
and an out-of-service phone. Every check and its flag wording is `adms-validation`.

## 4.3 Special cases around a ticket's field events

Handle these explicitly. Each problem is a **flag**, never a refusal (ADR-052); the wording is
`adms-validation` §5.1–§5.2.

| Case | What happens | What an agent must NOT do |
|---|---|---|
| **A collection with no disposal yet** | `PENDING`, listed as pending, looked at again on every run. The truck may still be driving; it may be a **preload** (loaded today, dumped tomorrow), which is normal (ADR-053) | Flag it, fail it or expire it for its age |
| **A disposal with no collection yet** | `PENDING`. Usually just **sync order**: phones sync whenever they find signal, in any order (Scenario C). It never expires; the flags of the one event it has (a typed number, a certification) show with it (ADR-053, 240, 244) | Invent a collection; alert on arrival; flag it for waiting |
| **Two collections on one certification with overlapping times** | Flagged: a truck has one open load at a time (ADR-027), so this is a clock, a claim or a phantom (Scenario B) | Let one disposal pair with both |
| **A disposal that starts before its collection ended** | Flagged: a clock or a claim is wrong (ADR-053) | Reorder the times silently |
| **A disposal's end GPS outside its site's area** | Flagged: the project's circle (built-in 200 m) or the site's own shape (ADR-136, 142, 144) | Widen the threshold to pass a test (invariant 16) |
| **A collection outside the project boundary** | Flagged; inside it but in no zone, flagged too. There is no collection route check (ADR-135, 136, 141) | Bring back a route-distance check |
| **A certification expired, revoked or replaced at the work time** | Flagged for a certification review, judged at **work time**, never "now"; still bills. A driver's licence flags nothing (ADR-048, 079, 153) | Refuse the field event on the phone or at sync |
| **No certification with that number on the project** | Unbilled and flagged until one exists; a truck keyed in by hand bills the certification's capacity (ADR-154) | Guess the certification |
| **The two events disagree** (debris type, cert number) | Flagged, compared exactly; the ticket still bills where an amount can be computed. Grouping is on the number, so a disagreement never stops the pair forming (ADR-019, 060) | Fuzzy-match cert numbers; copy one event's value onto the other |
| **A load turned away at the tower** | **Not recorded**: nothing is written; the load's disposal is the one where it actually dumps (ADR-155). **User, 2026-09-27 (Q-146):** "the load can only dump once and will only ever get one dispoal ticket." | Invent a "refused" record |
| **A phone failed** | The **back office creates the record**, marked with the person and a reason from the firm's list; it's flagged and pairs like any other field event (ADR-156, 173). **User, 2026-09-27 (Q-147):** "All data must at some point move into the system and we do not record paper logs." | Accept paper as a record |
| **A phone taken out of service** | Still **received** at its next sync: work made before its removal time comes in normally, work made after it arrives flagged; then its number block is retired and it's wiped, and only then refused (ADR-134) | Refuse or drop its records |
| **Work under an unplanned assignment** | Marked, **not flagged**; it appears on the dispatch board at sync (ADR-240) | Flag it |
| **A split's shape** | A bare collection beside suffixed ones, or a gap in the suffixes (`-A`, `-C`), is flagged. The first collection of a split is `-A`, never bare (ADR-033, 173) | Treat `-A`…`-N` as duplicates, or renumber one off its base |

## 4.3a Duplicates: quarantined at sync, resolved by a person

**The rule the database enforces:** one field event per **project + workflow + bare number + split
suffix + kind** (ADR-062, 236; ARCHITECTURE §5.4). A second field event of one kind on one ticket,
from a *different* record, is a **duplicate**: it is **quarantined in full at sync**, with the reason
and the record that holds the number, and never reaches the worker (ADR-022). A **retry** of the
same record is not a duplicate: every record carries an ID made on the phone, and a retry is answered
"already saved" (KD-56).

The constraint protects the ledger. It doesn't make the problem go away: the quarantined record
usually describes **real work that really happened**, and a person must decide what it is.

### Nothing can be validated in the field

**Everything happens offline** (ADR-030). The tower phone can't check a scanned number against the
server: it can't confirm the ticket exists, is open, or wasn't used an hour ago by another phone. It
holds **no ticket list** and trusts the scan (ADR-071). Every server-side control on this page runs
**after the fact**, whenever the phone next finds signal (ADR-240). That is why a mis-scan reaches
the server at all, and why the quarantine is where the defence lives.

Worth building on the phone anyway, knowing their limits (ADR-031):
- **Its own duplicate check**: the phone checks its own records and catches the common case, the
  same monitor scanning the same barcode twice in a shift (Scenario A). Cheap, and it stops the error
  before it becomes a quarantine.
- **Its lists** (certified trucks and crews, ROEs, its site's lookup) are **stale by construction**:
  a mismatch is a **prompt**, never a block. Blocking on stale data strands legitimate work in the
  field.

> **`PENDING` is the normal state of much of the day's work.** A phone can be dark for hours or
> days. That is not a backlog or an outage; it is the system working as designed.

### Scenario A — a barcode scanned twice at the tower

**A truck has exactly one open load at a time** (ADR-027): it loads, drives, dumps, and only then
returns for the next load. A truck's collections and disposals interleave.

```
 09:14  COL 101020 at 22 Elm St                 (cert 730416)
          └─ truck loads, drives to Marsh Road TDSR
 10:22  DIS: the tower scans 101020             ✓
 10:51  COL 101021 at 40 Birch Ln               (cert 730416)
 11:40  DIS: the tower scans 101020             ✗ should have been 101021
          (a stale barcode, the wrong copy handed over: which one doesn't matter)

 later, at sync:
   DIS 101020 (10:22) → saved
   DIS 101020 (11:40) → a second disposal on ticket 101020 → QUARANTINED
```

```
   101020 → COL + DIS (10:22)   → pairs → COMPLETED ✓
   101021 → COL                 → PENDING
   DIS (11:40)                  → in quarantine, unbilled, in the review queue
```

What the constraint bought: 101020 reconciles **correctly**, because the 10:22 disposal really is
its partner; only the mis-scanned record waits. **Resolution:** the reviewer **renumbers** the
quarantined 11:40 disposal to 101021 (below), and 101021 pairs.

### Scenario B — two numbers for one load (a phantom)

The monitor completes a collection, the phone doesn't visibly confirm, and they complete another for
the same pile.

```
 09:14  COL 101030 at 14 Heron St   (cert 730415)  loading 09:10–09:40
 09:16  COL 101031 at 14 Heron St   (cert 730415)  loading 09:10–09:40
          └─ SAME pile, SAME truck, OVERLAPPING loading times
 10:05  DIS at Marsh Road TDSR: the driver hands over 101030  ✓

   101030 → COL + DIS  → MANUAL_REVIEW, flagged: overlapping loads on cert 730415; still bills
   101031 → COL only   → PENDING for ever, flagged: overlapping loads on cert 730415
```

**Both tickets are flagged** (ADR-342; `spec/FLAGS.md` `OVERLAPPING_LOADS`). **User, 2026-10-05:**
"The agent was correct to flag both but let the first flow to billing as it is likely making sense. However like all flags it'll be prevented from being invoiced until resolved."
So 101030, the ticket the truck dumped under, bills while in review and can't be locked as
invoiced until its flag is fixed or accepted. The same flag is raised when two loads that both
happened sit on one cert number (the monitor scanned the wrong badge for the next truck): the
worker can't tell which it is, and a person decides.

**How to recognise it:** two collections on one certification with **overlapping loading times and
no disposal between** can't be two loads (Scenario A's rule). The same address and debris type make
it a duplicate issue, full stop.

> ### The fix is NOT a renumber (ADR-028)
>
> 101031 is a **phantom**: it describes work that doesn't separately exist. Renumbering it
> manufactures a second load out of one pile and invites someone to find it a disposal partner:
> double billing by way of a data fix, the exact fraud the system exists to prevent. The phantom is
> **voided**, with a reason: kept with its audit trail, never deleted, never paired.

### Scenario C — offline, so arrival order means nothing

**Every phone works offline and syncs whenever it finds signal**, the tower's too: a TDSR is a
cleared field or a gravel lot, often with no signal and no mains power (ADR-030, 240).

```
 ── during the day, each phone syncs when it happens to find signal ──
 08:40  COL 101040   (phone A)          09:55  DIS 101040   (tower phone)
 10:20  COL 101041   (phone A)          11:30  DIS 101041   (tower phone)
 13:15  COL 101042   (phone C)          14:40  DIS 101042   (tower phone)

   12:05  the tower phone finds signal → three disposals arrive with no collections
   17:30  phone A syncs at the yard    → 101040, 101041 pair
   phone C is flat                     → 101042's disposal waits alone overnight: PENDING
```

Until phone A syncs, every one of those disposals is unpartnered. That is not a fraud wave; it is
the ordinary shape of the day. **Four consequences, all load-bearing:**
1. **Arrival order carries no information.** Order by **field time** (a collection's end, a
   disposal's start), never by when a record reached the server; never infer sequence, causality or
   suspicion from arrival (ADR-030).
2. **No grace period, no ageing.** An unpartnered field event never expires and is never flagged for
   its age; preloads are common on nearly every mission. What *is* flagged is timing that can't be
   true (ADR-053). **User, 2026-09-24 (Q-18):** "cut out this orphaned grace period all together."
3. **Old work arrives after new work.** Phone C's Monday events can land on Wednesday, behind
   Tuesday's. The worker never assumes the queue is in time order, never treats a late arrival as
   suspicious, and never rejects it because later work was already processed.
4. **The load is bursty.** Quiet for hours, then a crew's whole day at once. Size and test for the
   spike, not the average.

### Scenario D — a legitimate split load

**User (written into this skill):** "Trucks dont mix debris in this manner, per real world ops
despite USACE guidelines; however split tickets are still used for PPDR / ROE work".

Where the project **allows split loads** (ADR-137), a truck gathers from several properties under
one number: **N collection events, one disposal event**. At each property the monitor presses
**split**, which starts the next collection event in the chain with the next suffix and fresh time
and location; each has its own ROE and the monitor's **estimate** in CY (`adms-field-app` §4A.3).

```
 P2 (PPDR), cert 730416
 08:40  COL 102001-A  412 Cedar Ct  ROE R-0007  estimate 12 CY  Vegetative
 09:05  COL 102001-B  416 Cedar Ct  ROE R-0008  estimate 18 CY  Vegetative
 10:10  DIS 102001    Marsh Road TDSR, call 75% of 48 CY = 36.0 CY

   group 102001 (suffix stripped) → two collections + one disposal → one load
   shares: 12 ÷ 30 = 40% → 14.4 CY;  18 ÷ 30 = 60% → 21.6 CY
```

- **The shape is N collections → 1 disposal**, never 1 → N. Each collection carries a **distinct**
  suffix (`-A`, `-B`…), so nothing collides and nothing is quarantined. The **first is `-A`**, never
  bare (ADR-173).
- **The truck carries one barcode, the base number** (ADR-032): one physical load, however many
  properties fed it. The suffix is the collection side's; the tower never sees it.
- **Group on the base number** (ADR-033): grouping on the literal string gives groups of one and
  reconciles nothing. A bare collection beside suffixed ones, or a gap in the suffixes, is flagged.
- **Each property's share = its estimate ÷ the sum of the estimates**, applied to the load's CY or
  tonnage, derived and stored apart from the estimates, summing exactly; **rules run once per
  property**, with its own zone, address and mileage (ADR-055, 162). **No check of the estimates
  against the call**: they are relative sizes only (ADR-064).
- **The estimate is an observation**, correctable by permission and audited like any captured field
  (ADR-051); the share is computed.
- On an ROE project, an ROE missing, not on the project, unsigned or out of scope is **flagged**;
  nothing is looked up (ADR-055, 149).

### Resolving a quarantine: it is not a wastebasket

> **A quarantined record is never dropped, and the phone is never told "saved" for it** (ADR-022).
> It's a monitor's sworn observation of real work; discarding it destroys evidence and leaves a
> legitimate load unbilled for ever.

It is kept in full, with the reason and the record that holds the number, and it shows in the **one
review queue** beside that record (ADR-228). The worker can't deduce the right number; **a person
can**, because the record carries far more than its number:

| Evidence on the field events | What it settles |
|---|---|
| The cert number (730416 throughout) | One truck, so a keying error, not two trucks |
| The disposals' start times (10:22 and 11:40) | Two separate trips: real work done twice |
| Each collection's end time (09:40, 11:05) | Which collection each disposal follows |
| The disposals' end GPS and site | Both dumps real, at a registered site |
| Addresses, debris types, the zone attached | Which route the truck was running |
| Photos of the pile and the empty bed | Two distinct loads |

The reviewer concludes the quarantined 11:40 disposal belongs to 101021 and **renumbers it**
(101020 → 101021). The renumber:
1. **Writes an `AuditRecord`**: the prior number → the new one, under the **reviewer's** own ID,
   never the system's; the prior value kept for ever (ADR-051, 097).
2. **Lets the worker decide again.** The record enters as 101021's disposal and the ticket
   reprocesses; the reviewer never forces a pairing and never writes a completed load (invariant 4).

### Corrections: in place, by permission

**Records are correctable in place by permission; immutability lives in the audit log, not the
record** (ADR-039, 051). **Every captured field** (GPS, times, photos, the load call, estimates, the
number) can be corrected, because real errors happen in all of them. The guarantee isn't that
records never change; it's that **every change is written to `AuditRecord` with its prior value, by
the database itself, for ever** (ADR-097).

```
   NOT THIS                              THIS
   ────────                              ────
   the record is frozen                  the record is correctable, by permission
   a correction makes a new record       a correction edits in place
   history = a chain of replacements     history = the record + its audit trail
   (or a replayed log of events)         (event-driven, not event-sourced, ADR-236)
```

**Why this shape:** a replacement per correction fragments one real thing across many rows, and
every reader must walk the chain to find the truth. Editing in place keeps one row per real thing
and puts history in a log built for it.

**Who may change a field event, and when** (ADR-051, 240):
- **The monitor**, on the phone, **until they end their shift**: a finished field event can be
  reopened (agent default, ADR-240). An edit to one already sent travels as the phone's **edit
  log**, is written to `AuditRecord` under the monitor, and reprocesses the ticket.
- **After the shift, only permitted people** in the back office (those granted correct, renumber,
  void, accept). The monitor never edits again.
- **A ticket locked as invoiced is unlocked first** (audited), then corrected (ADR-057). **Built
  (ADR-367):** the review services refuse a correction, a renumber, a void or an acceptance on a
  locked ticket in plain words and save nothing; a certification, an ROE or a scale receipt that
  several tickets share is still corrected, and each locked ticket on it waits for its unlock.

**What a correction requires:** a permission for it (KD-25); every edit path audited (invariant 3;
the database refuses a write with no actor); the real person as the actor, never the system; the
prior value captured by the trigger before the write (ARCHITECTURE §5.3).

**What is never edited by a person:** `AuditRecord` (append-only, absolutely); `Transaction`
(regenerated by the worker when its ticket changes, each removed row copied in full to the audit log
first, ADR-085); the **completed load or haul-out** (drawn again by the worker).

**After any correction the ticket reprocesses, `COMPLETED` ones included** (ADR-086): the worker
looks for the ticket's existing completed load first and **updates it in place**, never making a
second one, then regenerates its transactions. A correction to one field event of an unpartnered
ticket simply waits with it.

### Correct, void or accept: three different tools

| The evidence says | Tool | Why |
|---|---|---|
| Real work under the wrong number (Scenario A) | **Correct** the number (renumber) | The work happened; only the identifier is wrong |
| Real work, a detail keyed wrong | **Correct** the field | The same |
| The work never happened (Scenario B's phantom) | **Void**, with a reason | Correcting can't fix a record that shouldn't exist; renumbering one double-bills |
| The flag is right as it is (a heaped load at 96%, photos confirm) | **Accept** the flag, with a reason | Nothing is wrong with the evidence |

- **Void** (ADR-028, 051, 060): a person with a reason from the firm's list, or a rule's *Void
  ticket* action naming the rule (ADR-118, 173). It keeps the record and its audit trail and **stops
  all billing**: its lines are removed, each copied to the audit log first (ADR-085). Unvoiding is an
  audited override. **A rule's void always wins** (ADR-167): a person's unvoid lasts only until the
  next reprocess, so to keep the ticket the reviewer corrects the data or the rule. **User,
  2026-09-27 (Q-159):** "the rule **always win**".
- **Accept** (ADR-166): the flag stays in the ticket's history and isn't raised again unless the
  facts it was about change; when every flag is fixed or accepted, the ticket is `COMPLETED`. There
  is no "accepted void".
- **How void and unvoid are built** (agent defaults, ADR-365): a person's void is a record of its
  own (the reason, a note, who, when), and the worker writes the rest in the run it asks for: the
  field events `VOID`, the lines removed, the flags cleared; the completed load is left as it is.
  **An unvoid always leaves a record of its own** (`TicketUnvoid`: a note, who, when), audited under
  the person, whoever voided the ticket; a person's void is also marked lifted on its own row. **User,
  2026-10-06 (ADR-366):** "Unvoiding anything should always leave an audit record, even if it's the
  system". The worker reads that record and works the ticket again; its decision says so. A field event of a void ticket is corrected like
  any other, and that alone brings nothing back. *Accept flags* is a grant of its own (the user,
  ADR-365).
- **A ticket in review keeps billing** until resolved, where an amount can be computed (ADR-060).
- **Nothing technically stops a wrong choice** (renumbering a phantom): the audit trail is the
  backstop (ADR-051).

### Other duplicate and orphan shapes

| Shape | Meaning | Handling |
|---|---|---|
| A second disposal on a taken number | **Scenario A**: a barcode scanned twice | Quarantined at sync → the reviewer **renumbers** it |
| Two collections, one certification, overlapping times, no disposal between | **Scenario B**: one load issued two numbers | Flagged; **void the phantom**, never renumber |
| A disposal whose collection hasn't synced | **Scenario C**: sync order | Normal: `PENDING`, listed, never alerted, never expired (ADR-053) |
| A collection whose disposal comes a day later | A **preload** | Normal; never flagged for the gap (ADR-053) |
| A field event that never gets a partner | A lost phone, a mis-scan, or worse: the system can't tell from age | Stays `PENDING`, visible in the pending list; a person decides (ADR-053; KD-06) |
| Times that can't be true (overlap on one certification, a disposal before its collection ended) | A clock or a claim is wrong | Flagged, in a plain message (ADR-052, 053) |
| `-A`…`-N` collections and one disposal on the base number | **Scenario D**: a split | Group on the base number; one load. Never renumber, never treat as duplicates |
| A bare collection beside suffixed ones, or a gap in the suffixes | A mis-keyed number | Flagged (ADR-033, 173); the reviewer corrects the number |
| A second disposal on a split's base number | A duplicate like any other: a load dumps once (ADR-155) | Quarantined at sync (ADR-022) |
| An ROE made on a phone whose number another ROE of the project already has | Not a ticket's field event, but the same problem: one number, two records | Quarantined at sync in full, beside the ROE that holds the number; never saved under a taken number, never lost (ADR-338, agent default) |

**Before renumbering anything, establish which scenario you're in** (ADR-028). Renumbering a
Scenario B phantom double-bills; renumbering a Scenario D collection breaks it off its base number;
renumbering a Scenario C event that was simply early corrupts a load that would have paired on its
own. **Only Scenario A, real work wearing the wrong number, is a renumber.**

---

## History

What this page used to say, and why it changed. Never build from the left-hand side.

- Scenario B's diagram showed 101030, the ticket the truck dumped under, as `COMPLETED ✓` with no
  flag → both tickets of an overlap are flagged; it is `MANUAL_REVIEW` and still bills (the user,
  ADR-342; KD-71 (1)).

- Ticket "halves", stage tickets (`CollectionTicket`, `DisposalTicket`) and a reconciled
  `LoadTicket` that a reviewer must never author → **field events** under a ticket number and the
  worker's completed load (ADR-236).
- Statuses `MATCHED` / `FAILED` in the scenarios, and outcome codes (`COLLECTION_NOT_CLOSED`,
  `TIMING_OVERLAP`, `DISPOSAL_GPS_TOO_FAR`, `CERT_WRONG_PROJECT` → `FAILED`, `DEBRIS_TYPE_MISMATCH` →
  `FAILED`) from `validate_ticket_timing` and friends → four statuses; every problem a flag
  (ADR-060; wording in `adms-validation`).
- "Unique per stage table", "a 3+ group in the queue", "two disposals on one base number" as an
  ambiguous group → one field event per kind per ticket, a second quarantined at sync (ADR-022, 236).
- A cert-number mismatch "prevents matching outright" (pairing on a composite key) → grouping on the
  number; a mismatch is a flag (ADR-010 → 019).
- "Only `ticketNumber` may be corrected" (ADR-020) and "editing a ticket's GPS is never permitted"
  (ADR-025) → every captured field, by permission (ADR-039, 051).
- Orphan detection by age in field time, a grace period, the ~15-minute interval → no ageing (ADR-029
  → 053); jobs, not an interval (ARCHITECTURE §13).
- Every phone syncing at the end of the day at the office → whenever there's signal (ADR-030 → 240);
  "a monitor never edits a submitted ticket" → reopenable until the shift ends, then only permitted
  people (ADR-072 → 240).
- A split's "suffixed collection with no unsuffixed sibling" flagged as ambiguous, members sharing a
  zone, splits only where the program type requires ROEs, "`roeId` / estimate don't exist yet"
  (KD-22, KD-23) → the first is `-A`; each property keeps its own zone; "Allow split loads" per
  project (ADR-137, 141, 173; KD-61).
- A split's estimates checked against the load call → no check (ADR-064).
- An expired certification refused at creation and compared to "now" → flagged at work time (ADR-048,
  052, KD-35).
- `isSplitTicket` / `splitIdentifier` columns, `loadEmptyPhotos[]`, `endDisposalLat/Lon` and other
  historical field names → named in `spec/DATA-MODEL.md` (ADR-093).
- The retired examples (tickets `10090`…, truck 4471, 412 Oak St, North TDSR, "Ticket 104499") → the
  example world (ADR-235).
- The scale receipt scenarios → moved to `adms-scale-receipts`; the ⚠️ notes of ADR-236/240 and
  round 13 → absorbed; rewritten in the present tense (ADR-138, 248).
