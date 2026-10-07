# Acceptance scenarios — Part 9, Invoice, deliver and close out

✅ ** Approved**: agent-written (ADR-362); the user approves.

← [Acceptance scenarios](README.md) · The part page: [Part 9 — Invoice, deliver & close out](../parts/09-invoice-deliver-closeout.md)

> Each scenario restates a recorded rule; **From** names it. Values are the example world's
> (`spec/CONVENTIONS.md` §6) and the golden mission's (`spec/golden/MISSION.md` §2…§4, its rates
> included). A flag's message is `spec/FLAGS.md`'s, word for word. How to read the columns:
> [README](README.md).
>
> **This file is about turning a project's tickets into what the client receives**: which tickets
> can be locked as invoiced, the lock and the named batch, what a locked ticket no longer does,
> the audited unlock, and closing a project out. Open ADMS moves no money and keeps no invoice
> record. Correcting, voiding, accepting and QC are Part 8's file
> (`08-review-and-corrections.md`); what the worker does to the ledger is Part 7's.

**Where each scenario is proven.**

| Mark in **Proven at** | Meaning |
|---|---|
| **database (1.8.2)** | `packages/db/test`: `InvoiceLock` in full (its unlock kept on its row) and `InvoiceBatch`, their constraints, grants and audit |
| **story (1.8.5)** | The scenario harness: locking, a batch, an unlock, each through `apps/api`'s service, and the worker's run around them |
| **built: AC-…** | An earlier task built the guard and that scenario's test proves it; restated here because Part 9 promises it |
| **story (1.9.1)** · **story (1.9.2)** | The golden mission, whole; the scenarios the mission leaves out |
| **API (Phase 2)** · **back office (Phase 4)** | The rule is recorded; nothing in Phase 1 builds that layer |

**Throughout:** "the ticket" a lock names is a **completed load**, a **completed haul-out** or a
**unit rate ticket**, never a single field event of a load (ADR-168). Luis Ortega holds *lock as
invoiced*; **nobody was granted *unlock* in the golden mission's setup**, so in these scenarios
Dana Reyes, the admin, unlocks (AC-02-10, 12). The batch is the mission's, **"Bayline ROW, week
of 12 Oct"**.

---

## A. What can be locked (Part 9, invoicing, step 1)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-09-01 | **Given** `101001`'s completed load, `COMPLETED` and QC Approved, **when** Luis locks it as invoiced, **then** the lock is recorded (the completed load, Luis, when) and audited under him. That is all "invoicing" is: there is no invoice record, the lock holds no amount, and no money moves | ADR-057, 061; Part 9 ("What it does"); `spec/DATA-MODEL.md` §6 (`InvoiceLock`); KD-40 · REQ-105h | database (1.8.2); story (1.8.5) | database (2026-10-06, ADR-363): `packages/db/test/marks.test.ts`; story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` |
| AC-09-02 | **Given** a completed load at QC Review (nobody has marked it), at QC Issues or at QC Void, **when** Luis tries to lock it, **then** it is not locked: only a QC Approved ticket can be | ADR-121 (the user, Q-116: "#3 all day"); Part 9 (step 1) · REQ-105h | story (1.8.5) | story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` |
| AC-09-03 | **Given** `101003`, QC Approved while its 96% flag is still open (`MANUAL_REVIEW`), **when** Luis tries to lock it, **then** it is not locked; **when** the flag is accepted (AC-08-43) and the ticket is `COMPLETED`, **then** it locks. A ticket in review is resolved first, by a fix, an acceptance or a void | ADR-067 (Q-62), 121, 166; `adms-ledger-audit` §6.1d | story (1.8.5) | story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` |
| AC-09-04 | **Given** Scenario B's `101030`, billing while flagged for overlapping `101031`, **then** it can't be locked as invoiced until that flag is fixed or accepted: review never holds the money, and it does hold the lock | ADR-060, 067, 342 (the user: "like all flags it'll be prevented from being invoiced until resolved"); AC-08-34 | story (1.8.5) | story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` |
| AC-09-05 | **Given** a load or a haul-out, **then** what is locked is its completed record, a split as one: P2's `102001` with both properties under one lock, P1's `201004` with its three piles under one. A lock on a load's collection event or disposal event is refused; an unpartnered field event has nothing to lock | ADR-168 (the user: "Why would we ever think to invoice half of a ticket?"); Part 9 (step 1); `spec/DATA-MODEL.md` §6 · REQ-105h | the three targets and "exactly one": built, AC-07-97; a split as one: story (1.8.5) | a split haul-out, `201004` with its three piles, QC'd and locked as one: story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts`; P2's `102001`: story (1.9.1); P2's `102001`, locked as one with both properties: story (2026-10-06, ADR-368): `packages/scenarios/src/stories/golden-mission.ts` |
| AC-09-06 | **Given** unit rate ticket `301001`, QC Approved, **then** it locks on its own, the lock naming its one field event | ADR-168; `spec/DATA-MODEL.md` §6 (`InvoiceLock.fieldEventId`) · REQ-105h | story (1.8.5) | story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` |
| AC-09-07 | **Given** `101001` is locked, **when** it is locked a second time, **then** the second lock is refused: a ticket has at most one lock in force | `spec/DATA-MODEL.md` §6 ("unique among live locks"), §8 (ADR-358) | database (1.8.2) | database (2026-10-06, ADR-363): `packages/db/test/marks.test.ts`; in plain words from the service: story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` |
| AC-09-08 | **Given** Luis picks a set of tickets to lock, some of them not QC Approved or still in review, **then** the screen lists the ones that can't be locked and why, so none is missed | ADR-067, 121; Part 9 (step 1) · REQ-406 | back office (Phase 4) |  |

## B. Invoice batches (Part 9, invoicing, step 2)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-09-09 | **Given** P1, **when** Luis locks tickets in the batch "Bayline ROW, week of 12 Oct", **then** the batch is a record of its own (its project, its name, who made it and when) and each lock names it. The batch holds a name and its tickets and no amounts | ADR-228; `spec/DATA-MODEL.md` §6 (`InvoiceBatch`) · REQ-105h | database (1.8.2); story (1.8.5) | database (2026-10-06, ADR-363): `packages/db/test/marks.test.ts`; story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` |
| AC-09-10 | **Given** a ticket Luis locks without naming a batch, **then** it is locked all the same: a batch is optional | ADR-057, 228; Part 9 ("optionally grouped") | database (1.8.2) | database (2026-10-06, ADR-363): `packages/db/test/marks.test.ts`; story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` |
| AC-09-11 | **Given** the mission's batch, **when** its tickets are read by its name, **then** they are P1's thirteen QC Approved tickets (completed loads `101001`…`101006`, completed haul-outs `201001` and `201004`, unit rate tickets `301001`, `301002`, `301004`, `301006`, `301007`), and their lines in the ledger come to **$5,548.25 on 19 lines**, a figure read from the ledger and stored nowhere on the batch. The voided `301003` and `301005`, at QC Void, are not in it | ADR-228 ("reportable by name"); golden mission §4 · REQ-142 | story (1.9.1); the report by name: back office (Phase 4) | story (2026-10-06, ADR-368): `packages/scenarios/src/stories/golden-mission.ts` |

## C. A locked ticket doesn't change (Part 9, invoicing, step 2)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-09-12 | **Given** `101001` locked as invoiced, **then** the database refuses to remove any of its transactions and refuses to add one, for every login, and nothing is audited; another ticket's lock changes nothing for it | ADR-057, 090; ARCHITECTURE §5.3; BACKLOG C17 · REQ-105h | built: AC-07-97 | database, as AC-07-97; counted (2026-10-06, ADR-369) |
| AC-09-13 | **Given** `101001` locked at $390.00 and `101003` not locked, **when** Dana changes Coastline's rate on `VEG-HAUL-CY-15` from $7.50 to $7.75, **then** `101003` is regenerated, 62.4 × $7.75 = **$483.60**, and `101001` is left exactly as it is, its line still 52.0 × $7.50 = **$390.00**; the run's decision on it says it was left because it is locked | ADR-090, 359; `adms-ledger-audit` §6.1c; golden mission §4; AC-07-98 · REQ-131b | built: AC-07-98 (story `p1-priced`, the lock written directly); with the lock made by the service: story (1.8.5) | with the lock made by the service: story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` |
| AC-09-14 | **Given** a rule is added, changed or switched off, or Dana changes P1's site circle, loads a new map version or corrects a site's GPS, **then** every un-invoiced ticket the change touches is worked again and every locked ticket is passed by | ADR-090; Part 9 (step 2); AC-06-03; AC-07-99 | built: AC-07-99; a setup change beside a lock: story (1.8.5) | a setting changed beside two locks (the high load call limit): story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` |
| AC-09-15 | **Given** `101001` locked, **when** Luis tries to correct its load call, renumber its disposal or void it, **then** nothing is changed and he is told the ticket is locked as invoiced: a locked ticket is unlocked first | ADR-057 ("can't be edited until it's unlocked"); Part 8 (step 8); `adms-exceptions` ("A ticket locked as invoiced is unlocked first") · REQ-105h | story (1.8.5; where it is refused: point 1 below) | story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` |
| AC-09-16 | **Given** certification `730415`'s capacity is corrected, **then** every un-invoiced ticket on it reprocesses at the new capacity, and one locked as invoiced is unlocked first, the unlock audited | ADR-057, 079; AC-03-52 · REQ-106f | story (1.8.3; AC-03-52) | story (2026-10-06, ADR-364): `packages/scenarios/src/stories/p1-reviewed.ts` (the unlock written as the API's login may; its service is 1.8.5's) |

## D. Unlock, fix, lock again (Part 9, invoicing, steps 3 and 4)

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-09-17 | **Given** `101001` locked by Luis, **when** Dana unlocks it, **then** the lock's own record is kept and now says who unlocked it and when (and her note, if she wrote one); nothing is deleted, and the unlock is audited under Dana | ADR-057, 270 (6); `spec/DATA-MODEL.md` §6 (`InvoiceLock`: "an unlock keeps the row"); BACKLOG C17 · REQ-105h | database (1.8.2); story (1.8.5) | database (2026-10-06, ADR-363): `packages/db/test/marks.test.ts`; story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` |
| AC-09-18 | **Given** Luis holds *lock as invoiced* and not *unlock*, **when** he tries to unlock `101001`, **then** he is refused: unlocking is a grant of its own | ADR-050; `spec/DATA-MODEL.md` §2.2 (`UNLOCK_INVOICED`); AC-02-11, 12 · REQ-202 | API (Phase 2; AC-02-12) | in part, at the API, 2.2.5 (ADR-415): a grant of its own, asked at the door on every request, `apps/api/test/people.test.ts` (an unlock of the test's own that takes *unlock*); the real unlock's endpoint: 2.4.4 |
| AC-09-19 | **Given** the rate change of AC-09-13 passed `101001` by while it was locked, **when** Dana unlocks it, **then** it is a ticket like any other again: the next run works it and its line is regenerated at the pay item's rate as it now stands, 52.0 × $7.75 = **$403.00**, the $390.00 row copied in full to the audit log first. The database's two guards and the worker read only locks still in force | ADR-085, 090 ("unlocked ones included"), 359; BACKLOG C16, C75 · REQ-105h, 131b | story (1.8.5) | story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` |
| AC-09-20 | **Given** the small fix before the package goes out: `101001` locked at $390.00, **when** Dana unlocks it, Luis corrects its load call from 80% to 70%, the ticket reprocesses (45.5 × $7.50 = **$341.25**, the old line kept in the audit log), Luis looks at it again and leaves it QC Approved, and locks it again in the same batch, **then** the second lock is a new record, and the first is still there with its unlock | ADR-057, 085; Part 9 (invoicing, step 3); `spec/DATA-MODEL.md` §6 ("locking again is a new row") · REQ-105h | story (1.8.5) | story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` |
| AC-09-21 | **Given** the batch "Bayline ROW, week of 12 Oct" with its thirteen tickets locked, **when** one of them is unlocked, **then** the other twelve are still locked: each ticket has its own lock | `spec/DATA-MODEL.md` §6 (`InvoiceLock`: one per ticket, naming its batch); ADR-228 | story (1.8.5) | story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` |
| AC-09-22 | **Given** P1 was closed out months ago, **when** someone with the grant unlocks a ticket, **then** nothing refuses it: people are trusted not to without good reason, and the audit log records who did and when | Part 9 (invoicing, step 4); ADR-051, 057 | story (1.8.5) | story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` |

## E. What viewers see (Part 9, "Who")

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-09-23 | **Given** Bayline County's client user, the auditor and Coastline's contractor user, **then** each sees their projects through their read-only login at any time, before a ticket is locked and after: a client user and an auditor the whole project, a contractor user its own tickets and transactions (a prime with its subs'). Locking shows them nothing more and hides nothing | ADR-169, 361; Part 9 ("Viewers"); golden mission §4 ("What each person sees") · REQ-014 | built: AC-02-63…66, 78…82 | database, as AC-02-63…66 and 78…82; counted (2026-10-06, ADR-369) |

## F. Closeout and delivery (Part 9, "Step by step: closeout and delivery")

| ID | Scenario | From | Proven at | Passing |
|---|---|---|---|---|
| AC-09-24 | **Given** P1's window ends on 31 January 2027, **when** a load collected on 3 February 2027 syncs, **then** nothing is refused: it is received, flagged "Ticket 101023: project not active on 03-Feb-2027. Flagged for review.", and still bills | ADR-052, 057, 161; `spec/FLAGS.md` `PROJECT_NOT_ACTIVE`; Part 9 (closeout, step 1); AC-06-49 · REQ-105j | built: AC-06-49 | domain, as AC-06-49; story (2026-10-06, ADR-369): `packages/scenarios/src/stories/p1-left-out.ts` |
| AC-09-25 | **Given** that flag, **when** Dana extends P1's window to 28 February 2027, **then** the change is an ordinary edit, audited under her with the date before, and on the next run the flag on `101023` is cleared; a ticket locked as invoiced would have been passed by | ADR-057, 090, 161; `spec/FLAGS.md` §4 ("The setup is wrong"); AC-01-08 · REQ-105j | the edit: built, AC-01-08; the flag cleared: story (1.9.2) | the edit: database, as AC-01-08; the flag cleared: story (2026-10-06, ADR-369): `packages/scenarios/src/stories/p1-left-out.ts` |
| AC-09-26 | **Given** P1 at closeout with a collection that never found its disposal, **then** it is still `PENDING`, still listed, and has not expired or been flagged for its age; a person decides it: a void with a reason if the work never happened (AC-08-34), or a renumber or a correction if it did (AC-08-22) | ADR-053; Part 9 (closeout, step 2); `adms-exceptions` ("A field event that never gets a partner") · REQ-121 | built: AC-06-15; the person's part: story (1.8.4) | domain, as AC-06-15; the person’s part: story `p1-voided` (AC-08-34); counted (2026-10-06, ADR-369) |
| AC-09-27 | **Given** P1's tickets are locked, **when** Dana builds the client package, **then** she does it by hand: she exports the batch's tickets with their photographs and receipts, the transactions, and the other records (surveys, incidents, certifications) and zips them. The system generates no package, keeps no record of one and sends nothing | ADR-057, 061, 088; Part 9 (closeout, step 3); golden mission §4 · REQ-406 | back office (Phase 4) |  |
| AC-09-28 | **Given** that package, **then** it lets the client match the hauler's invoice and the landfills' records: each line with its ticket, pay item, quantity, rate and amount, and each scale receipt with the tickets that point at it. Reports are the fixed exports plus saved filters | ADR-088, 228; Part 9 (closeout, step 3); `spec/DATA-MODEL.md` §11 | back office (Phase 4) |  |
| AC-09-29 | **Given** P1 is done, **when** Dana closes the project, **then** the project is marked closed with the time and the change is audited; nothing in it is deleted, and no login can delete the project or anything under it | ADR-025; invariant 1; Part 9 (closeout, step 5); `spec/DATA-MODEL.md` §3 (`Project.closedAt`) · REQ-010, 105e | the delete refused: built, AC-01-78; the close: story (1.8.5; point 6 below) | story (2026-10-06, ADR-367): `packages/scenarios/src/stories/p1-invoiced.ts` (`ProjectSetup.close`) |
| AC-09-30 | **Given** the closed project, years later, **then** any transaction can still be walked back: `101002`'s #1 ($297.00) to its rule and pay item, to its completed load, to the collection and disposal events with their GPS and times, to certification `730416` and its photographs, and to every audited change on the way | invariants 1…3; Part 9 (closeout, step 5); `adms-domain` §1.1 (the one sentence an ADMS serves) · REQ-133 | story (1.9.1) | story (2026-10-06, ADR-368): `packages/scenarios/src/stories/golden-mission.ts` |
| AC-09-31 | **Given** the mission's end, **then** P1's thirteen QC Approved tickets are locked in "Bayline ROW, week of 12 Oct" (AC-09-11); a rate change after that regenerates none of them, and P1's ledger stays **$5,548.25 on 19 lines** | golden mission §4 ("Invoice lock") · REQ-017, 142 | story (1.9.1) | story (2026-10-06, ADR-368): `packages/scenarios/src/stories/golden-mission.ts` |

---

## Where each scenario is first proven

| Where it is first proven | Scenarios | How many |
|---|---|---|
| Task 1.8.2 (the lock in full and the batch, at the database) | AC-09-01, 07, 09, 10, 17 | 5 |
| Task 1.8.3 (with AC-03-52) | AC-09-16 | 1 |
| Task 1.8.5 (the lock, batches and the unlock, as a story) | AC-09-02, 03, 04, 06, 15, 19, 20, 21, 22, 29 | 10 |
| Built already (an earlier task's test or story proves it; a later half named in the row) | AC-09-05, 12, 13, 14, 23, 24, 25, 26 | 8 |
| Tasks 1.9.1 and 1.9.2 (the golden mission and what it leaves out) | AC-09-11, 30, 31 | 3 |
| Phases 2–4 only | AC-09-08, 18, 27, 28 | 4 |

31 scenarios (AC-09-01…31). **Twenty-two pass after task 1.9.1 (2026-10-06, ADR-368):** AC-09-11, 30 and 31 in the story `golden-mission`, each under a check named by its ID, with the story half of AC-09-05 that was left (P2's `102001` locked as one). Before it, **nineteen passed after task 1.8.5 (2026-10-06, ADR-367):** AC-09-02, 03, 04, 06, 15, 19, 20, 21, 22 and 29 in the story `p1-invoiced`, each under a check named by its ID, with the story halves of AC-09-01, 09 and 17 and three of the eight built already now named by this file's IDs (AC-09-05, 13, 14). Before it, **AC-09-16 passes in the story `p1-reviewed` after task 1.8.3 (2026-10-06, ADR-364).** **Five pass at the database after task 1.8.2 (2026-10-06,
ADR-363):** AC-09-01, 07, 09, 10, 17, each under a test named by its ID in
`packages/db/test/marks.test.ts`; three of them (01, 09, 17) wait for their story. The file was
written before Milestone 1.8's code (ADR-300). The eight built already are marked when a test or a story names
this file's ID, from a run that is seen.

**The earlier files' scenarios that wait for the lock**, and the row here that finishes each:
AC-06-03's lock (AC-09-14) · AC-07-98's lock (AC-09-13) · AC-03-52's unlock (AC-09-16).

## Left to the task that builds it

Nothing recorded settles these, so no scenario asserts them. Each is decided in the ADR of the
task named, as an agent default the user may overturn, unless that task finds it changes money,
evidence or what a monitor must do, in which case it is put to the user first (ADR-230).

| # | What isn't settled | Decided with |
|---|---|---|
| 1 | **Where a change to a locked ticket is refused:** by `apps/api`'s services alone, or by the database too (a guard on a locked ticket's field events, as its transactions already have) | 1.8.5 ✅ (ADR-367: by the review services, for a change to the ticket's own records; a record several tickets share is still corrected and the locked ticket waits; the database holds its lines as before, and a guard on its field events is the user's to ask for) |
| 2 | **What else a lock holds still:** a QC mark changed on a locked ticket; a flag raised on it later by a run that passes it by (it is left as it is, ADR-359); a photograph removed from one of its field events | 1.8.5 ✅ (ADR-367: its QC mark isn't changed under the lock; no run raises a flag on it; a photograph of its field events isn't removed or labelled) |
| 3 | **A batch's own rules:** whether a name is used once per project; whether every ticket in it is its own project's (the mission's batch is P1's, and P2's `102001` isn't told as locked); adding tickets to a batch later; renaming one; what a batch shows once every ticket in it is unlocked | 1.8.2 ✅ (ADR-363: a name once per project, never blank; a lock names its own project's batch, now or later while it stands; renamed freely, audited; never archived; it stays as it is when its tickets are unlocked) |
| 4 | **Whether an unlock asks for a note or a reason** (`unlockNote` is optional on `spec/DATA-MODEL.md`; "audited" is all the rule says) | 1.8.2 ✅ (ADR-363: optional, as the data model has it; never blank, and only with the unlock) |
| 5 | **Locking a ticket that bills nothing:** a voided ticket (QC Void in the mission, so never QC Approved there), and a `COMPLETED` ticket whose accepted flag says "not billed" | 1.8.5 ✅ (ADR-367: a void ticket isn't locked; a `COMPLETED` ticket that bills nothing locks like any other) |
| 6 | **What closing a project does besides the mark:** `closedAt` is on the model and no page says what reads it (dispatch, sync, the lists); nothing may be refused over it (ADR-052). Whether a closed project is reopened by clearing the mark | 1.8.5 ✅ (ADR-367: the mark and its time, audited, and nothing else; nothing reads it or is refused over it in Phase 1); what the screens do with it and reopening: Phase 4 |
| 7 | **Who sees a lock and a batch:** whether a client user, an auditor and a contractor user see that a ticket is locked and in which batch (BACKLOG C76; ADR-228 says a contractor "pulls a report by its name") | 1.8.2 ✅ (ADR-363: a client user and an auditor every lock and batch of their projects; a contractor user the locks on its own tickets and the batches that hold one; no viewer an unlock's note) |
| 8 | **What starts the run after an unlock** in Phase 1, until Phase 2's job queue names the tickets a change touches (ADR-360) | 1.8.5 ✅ (ADR-367: the unlock answers the run to ask for, naming the ticket; its caller asks the worker) |

**Carried into Milestone 1.8** (`agent_store/BACKLOG.md`, the register): **C16, C17** (the
unlock's columns and the batch; the two guards and the worker reading only locks in force:
AC-09-17, 19), **C75** (the lock made by a service, where the story `p1-priced` writes it
directly: AC-09-13), **C76** (point 7). **Closes the behaviour of KD-40** (no invoice lock) when
sections A…D pass.

**Not in this file** (their rules are recorded): QC marks themselves (Part 8's file, section G);
the exports' columns (`spec/DATA-MODEL.md` §11, Phase 4); the read-only portal (Phase 4); the
time clock's approved day, which has a lock of its own (Phases 3–4, ADR-241).
