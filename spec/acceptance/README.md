# Open ADMS — Acceptance scenarios

✅ ** Approved**: agent-written (ADR-300); the user approves.

← [Index](../INDEX.md)

> **What this folder is.** The answer key beside the golden mission (`spec/VISION.md` §8): every
> behaviour the part pages promise, written as a scenario a test can pass or fail. A part is done at
> a layer when its scenarios pass there. Progress is "N of M scenarios passing", never boxes ticked.
>
> **It decides nothing.** Each scenario restates a recorded rule and names where it comes from. If a
> scenario and its source disagree, the source wins (the newest ADR, then `agent_store/SUMMARY.md`,
> then the skill): fix the scenario and log a KD (`adms-decisions`).

## The files

One file per part page, written **before the code of the milestone that builds that part**
(`agent_store/BACKLOG.md`, Phase 1; ADR-300).

| Part | File | Scenarios | Written | Passing at the engine |
|---|---|---|---|---|
| 1 Set up | [01-setup.md](01-setup.md) | 83 | 2026-10-01; AC-01-39…41, 66, 80 corrected and AC-01-81 added 2026-10-02 (ADR-301); AC-01-82 added (ADR-306); AC-01-80 extended (ADR-308); AC-01-83 added (ADR-334); **approved by the user (ADR-335; AC-01-83 added after)** | 35 (AC-01-83, what an incident offers, at the database and the domain, 2026-10-04, ADR-334). Before it: 34, and AC-01-27 in part: AC-01-41 (ADR-301); AC-01-31, 32, 34…38, the firm's lists (2026-10-02, ADR-302); AC-01-02…08 and 11…14, the client, the declaration event and the project (2026-10-02, ADR-303: AC-01-06 and 11 at the domain, the others at the database); AC-01-15…18, 20, 21 and 82, contractors and contracts (ADR-305, 306); AC-01-22…26 and 28…30, forms, debris types, field tags and the firm's own fields (ADR-308: 25 and 26 at the domain, the others at the database; AC-01-27's field events: 1.3.4); **AC-01-01 and 79 by the story `setup`, AC-01-80 in part (2026-10-03, ADR-316): 64 of 82, and four in part**; AC-01-19 with the certification's records (ADR-321) and **AC-01-09, the ticket-number source's series and ranges (ADR-323): 66 of 82**; **AC-01-27 whole, its field events still pointing at an archived entry (ADR-325): 67 of 82, and three in part** |
| 2 People and devices | [02-people-and-devices.md](02-people-and-devices.md) | 77 (84 today: AC-02-78…82, ADR-361; AC-02-83, 84, ADR-415) | 2026-10-03 (ADR-314); AC-02-75…77 added (ADR-336); **approved by the user (ADR-335; AC-02-75…77 added after)** | **At the API since task 2.2.5 (2026-10-07, ADR-415): AC-02-08, 12, 13, 72, 83, and AC-02-84 as a story; AC-02-14 since 2.2.4.** At the engine, 38: AC-02-75, 76, 77, whether a viewer sees private citizens by name (2026-10-04, ADR-336).** Before them, 35 at the database, each under a test named by its ID: the 28 Phase 0 built, and AC-02-05, 06, 09, 10, 11, 69, 70 (2026-10-03, ADR-315); AC-02-38, 49, 61 and 71 in part. 28 of the 77 are for Phases 2–4 only |
| 3 Certify | [03-certification.md](03-certification.md) | 59 (60 written; AC-03-57 withdrawn, ADR-328) | 2026-10-03 (ADR-317); **approved by the user (ADR-335)** | 8 at the domain, each under a test named by its ID: AC-03-21, 23, 24, 25, 27, 28, 31, 32, the capacity math (2026-10-03, ADR-320); AC-03-22, 26 and 29 in part (the database's half with 1.2.3). 25 are task 1.2.3's (the records), 20 later Phase 1 tasks', one split between 1.2.3 and 1.8.2, 3 for Phases 2–4 only. **37 pass after 1.2.3 (ADR-321) and AC-03-06 with numbering (ADR-323); 38 with AC-03-40, what a field event records (ADR-324); 39 with AC-03-34, a certification's five views (2026-10-04, ADR-326); 40 with AC-03-15 (ADR-358); 41 with AC-03-38's QC mark, whole (2026-10-06, ADR-363)** |
| 4 Capture | [04-field-capture.md](04-field-capture.md) | 103 | 2026-10-03 (ADR-322); AC-04-99…101 added (ADR-334); AC-04-102, 103 added (ADR-337); **approved by the user (ADR-335; AC-04-99…103 added after)** | **98 of 103 (the file's own count): AC-04-102 and 103, a photograph removed from the record and labelled (2026-10-04, ADR-337), at the database (`packages/db/test/scale-receipts-and-photos.test.ts`). Before them: AC-04-99, 100, 101, what an incident names and what its project offers (2026-10-04, ADR-334). Before them, 84: task 1.3.6's eleven, ROEs and forms (2026-10-04, ADR-327): AC-04-80, 81, 83…90, and AC-04-82 whole with the ROE it found**, at the database (`packages/db/test/roes-and-forms.test.ts`), AC-04-87's schema in `packages/contracts`; **task 1.3.5's eleven, scale receipts and photographs (2026-10-04, ADR-326): AC-04-71…78, and AC-04-38, 39, 52 whole with their scale receipt**, at the database (`packages/db/test/scale-receipts-and-photos.test.ts`), AC-04-75 in `packages/domain` and `packages/contracts` too; **task 1.3.4's thirty-two, what each kind records (2026-10-03, ADR-325): AC-04-32…37, 40, 41, 43, 45…51, 53…58, 60…69**, at the database (`packages/db/test/field-event-kinds.test.ts`), AC-04-37 and 46 in `packages/contracts` and AC-04-34, 46, 54, 58, 67 in `packages/domain` too; **task 1.3.3's twenty-one, what every field event records (2026-10-03, ADR-324): AC-04-02, 03, 12, 15, 16, 18…31, 44, 94**, at the database (`packages/db/test/field-events.test.ts`), the seven that restate a Phase 0 guard included; **and task 1.3.2's nine, numbering (2026-10-03, ADR-323): AC-04-01, 04…09, 13, 14**, at the database (`packages/db/test/numbering.test.ts`) and the domain (`packages/domain/test/numbers.test.ts`), each under a test named by its ID. 9 are task 1.3.7's (the day's story), 5 for Phases 2–4 only |
| 5 Sync | [05-sync.md](05-sync.md) | 56 | 2026-10-04 (ADR-333); **approved by the user (ADR-335)** | **43 of 56, two more in part** (task 1.4.2, ADR-338: 37 of its 39 by the story `sync`, the story `p1-any-order` and `quarantined-records.test.ts`, and the six built earlier now named by this file's IDs; AC-05-47 and 56 in part). Three wait for the worker and the reviewer (AC-05-28, 53, 55), eight for Phases 2–4 |
| 6 Reconcile | [06-reconciliation.md](06-reconciliation.md) | 165 | 2026-10-05 (ADR-339); AC-06-163…165 added (ADR-345); **approved by the user 2026-10-06 (ADR-374)** | **146 of 165, fourteen more in part, after task 1.6.3 (ADR-355: AC-06-70, 71, 91, 105, 120…123, the flags pricing raises); 138 after task 1.6.2 (ADR-354: AC-06-57); 137 after task 1.5.9 (ADR-352; the file's own count).** Before it: 65 of 165, fifteen more in part (after ADR-345, 2026-10-05; before it: 56 of 162 after task 1.5.5, ADR-344; 25 after 1.5.4, ADR-343; 15 after 1.5.3: task 1.5.2, 2026-10-05, ADR-340, at the database, `packages/db/test/derived-records.test.ts`: AC-06-06, 144, 145, 146; in part AC-06-137, 138, 148, 152. Task 1.5.3, 2026-10-05, ADR-341, at the domain, `packages/domain/test/tickets.test.ts`: AC-06-07, 08, 09, 11, 12, 15, 19, 20, 21, 22, 142; in part AC-06-10, 13, 14, 17, 23, 24, 125, 143, 160). 152 are Milestone 1.5's (tasks 1.5.2…1.5.9), nine wait for the rules (Milestone 1.6), one for a reviewer's correction (1.8.x) |
| 7 Price, ledger and audit | [07-pricing-ledger-audit.md](07-pricing-ledger-audit.md) | 114 | 2026-10-05 (ADR-353); **approved by the user 2026-10-06 (ADR-374)** | **111 of 114 after task 1.9.1 (2026-10-06, ADR-368; the file's own count): AC-07-111, 113, 114 in the story `golden-mission`; 108 after task 1.7.2 (ADR-359, 360).** Before them, **97 of 114 after task 1.7.1 (2026-10-06, ADR-358): AC-07-85…87 and 89 at the database (`Transaction` in full), and the ten Phase 0 restatements, AC-07-88, 90, 96, 97, 104…109, whose tests now carry these IDs.** Before it, 83 of 114 at the domain after task 1.6.3 (ADR-355): AC-07-10, 11, 38…83, with 1.6.2's AC-07-01…09, 12…37 (ADR-354). 35 are task 1.6.2's (criteria), 48 task 1.6.3's (lines and flags), 4 task 1.7.1's, 12 task 1.7.2's, 10 restate guards Phase 0 built (their tests take the IDs with 1.7.1), 3 the golden mission's (1.9.1), 2 for Phases 2–4 only |
| 8 Review and correct | [08-review-and-corrections.md](08-review-and-corrections.md) | 67 (65 written by ADR-362; AC-08-66 added by ADR-364, AC-08-67 by ADR-366) | 2026-10-06 (ADR-362); **approved by the user 2026-10-06 (ADR-374)** | **61 of 67 after task 1.9.1 (2026-10-06, ADR-368):** AC-08-01, 02, 63, 64, 65 in the story `golden-mission`. Before it, **56 of 67 after task 1.8.5 (2026-10-06, ADR-367):** AC-08-54, 60, 61, 62 in the story `p1-invoiced`. Before it, **52 of 67 after task 1.8.4 (2026-10-06, ADR-365, 366):** AC-08-31, 32, 34…47, 50…52 and 67 in the story `p1-voided` (67 also at the database). Before it, **32 of 66 after task 1.8.3 (2026-10-06, ADR-364):** AC-08-10…30 and 66 in the story `p1-reviewed`. Before it, **10 of 65 at the database after task 1.8.2 (2026-10-06, ADR-363):** AC-08-09, 33, 48, 49, 53, 55…59, `packages/db/test/marks.test.ts`. 10 are task 1.8.2's (people's marks, at the database), 21 task 1.8.3's (corrections, renumbering, a quarantined record resolved), 19 task 1.8.4's (void, unvoid, accept), 4 task 1.8.5's (QC), 2 restate guards built already, 5 the golden mission's (1.9.1), 1 Milestone 1.8's or Phase 2's (where a permission is checked), 3 for Phases 2–4 only |
| 9 Invoice, deliver and close out | [09-invoice-deliver-closeout.md](09-invoice-deliver-closeout.md) | 31 | 2026-10-06 (ADR-362); **approved by the user 2026-10-06 (ADR-374)** | **22 of 31 after task 1.9.1 (2026-10-06, ADR-368):** AC-09-11, 30, 31 in the story `golden-mission`. Before it, **19 of 31 after task 1.8.5 (2026-10-06, ADR-367):** AC-09-02, 03, 04, 06, 15, 19…22, 29 in the story `p1-invoiced`, and AC-09-05, 13, 14 named there. Before it, **6 of 31 after task 1.8.3 (2026-10-06, ADR-364):** AC-09-16 in the story `p1-reviewed`. Before it, **5 of 31 at the database after task 1.8.2 (2026-10-06, ADR-363):** AC-09-01, 07, 09, 10, 17, `packages/db/test/marks.test.ts`. 5 are task 1.8.2's (the lock in full and the batch), 1 task 1.8.3's, 10 task 1.8.5's (the lock, batches, the unlock), 8 restate what is built already (marked when a test or story names this file's ID), 3 the golden mission's and its side stories' (1.9.1, 1.9.2), 4 for Phases 2–4 only |
| The API and sync, as a server (no part page) | [10-api-and-sync.md](10-api-and-sync.md) | 56 | 2026-10-07 (ADR-379); **approved by the user** (their mark at the file's head, ADR-386) | **41 of 56** (AC-10-31; task 2.4.5 part 1, ADR-434; AC-10-28 and 37; task 2.4.4, ADR-430, 431, which this line had not yet counted; AC-10-38; task 2.4.2 part 2, ADR-425; AC-10-50 and 54 whole, with AC-10-51 in part; task 2.3.3, ADR-420; AC-10-52, 53; task 2.3.2, ADR-419, with AC-10-55's worker half; AC-10-40; task 2.2.6, ADR-416; AC-10-25; task 2.2.5, ADR-415; AC-10-26; task 2.2.4, ADR-412; AC-10-09, 12…19; task 2.2.3, ADR-408, 409; AC-10-20, 21, 23, 24; task 2.2.2, ADR-402, 403; AC-10-10, 11 at the database; task 2.2.1, ADR-397, 398; AC-10-42 at the database; task 2.1.4, ADR-394; AC-10-04…08, 34, 36, 39, 43; task 2.1.3, ADR-387…392; AC-10-01, 02, 03, 33, 55; task 2.1.2, ADR-385), and AC-10-25 and 32 in part: none is the engine's. Each is proven at the API in Phase 2, by the task its row names. The file also lists, by ID, the 48 scenarios of files 01…09 with a Phase 2 part and the task that proves each, and has one more column, **Answers** (the security checklist item, ARCHITECTURE §16) |

**The golden mission stands beside these files.** `spec/golden/MISSION.md` (approved, ADR-297) is one whole
mission with its exact statuses, flags and ledger. These files cover what it doesn't: the cases a
single clean-enough mission can't hold (a refused setting, a second prime, a split haul-out paid by
the CY, a pile whose call isn't higher).

## The count, by part (task 1.9.2, 2026-10-06, ADR-369; counted again at the phase exit, task 1.9.3, ADR-371)

How many scenario IDs have a passing test, read from each file's **Passing** column and from the
tests themselves after a whole run of the chain (`pnpm test`, 80 files; `pnpm scenarios`, fifteen
stories). **This table is the count; the "Passing at the engine" column above is each file's
history.**

| Part | Scenarios | Proven whole | of those, under a test or story check that names the ID | of those, under the test of the scenario it restates ("as AC-…") | In part: the rest is a later phase's, or has no test of its own | Not in Phase 1 (Phases 2–4 only) |
|---|---|---|---|---|---|---|
| 1 Set up | 83 | **82** | 81 | 1 | 1 (AC-01-80) | 0 |
| 2 People and devices | 84 | **48** | 47 | 1 | 8 (AC-02-34, 38, 42, 47, 49, 60, 61, 71) | 28 |
| 3 Certify | 59 (AC-03-57 withdrawn) | **56** | 47 | 9 | 0 | 3 |
| 4 Capture | 103 | **98** | 98 | 0 | 0 | 5 |
| 5 Sync | 56 | **46** | 44 | 2 | 3 (AC-05-04, 53, 56) | 7 |
| 6 Reconcile | 165 | **162** | 157 | 5 | 3 (AC-06-02, 03, 58: what queues a run, and the clock difference kept with a sync, are Phase 2's) | 0 |
| 7 Price, ledger and audit | 114 | **112** | 110 | 2 | 0 | 2 |
| 8 Review and correct | 67 | **64** | 63 | 1 | 0 | 3 |
| 9 Invoice, deliver and close out | 31 | **27** | 24 | 3 | 0 | 4 |
| **All nine** | **762** | **695** | 671 | 24 | 15 | 52 |

- **AC-02-83 and 84 were added by task 2.2.5** (2026-10-07, ADR-415; agent-written, for the user's approval): one email address a person who signs in (the database and the API), and the server command for a firm's first admin and an admin's way back in (the story `first-admin`). They are the two added to Part 2's row and to the totals; the 693 of Phase 1's exit (ADR-371) are unchanged among them.
- **File 10 is not in this table** (2026-10-07, ADR-379): its 56 scenarios are Phase 2's whole
  and are counted in the file itself, 21 of 56 passing on 2026-10-07 (ADR-402).
- **Proven whole** is the engine's: the database, the domain and the stories. A scenario that also
  names a later layer (the API, the phone, the back office) is proven there in its phase.
- **A restated scenario** says a rule another file's scenario already proves (a certification's
  flags in Part 3 and Part 6): its Passing cell reads "as AC-…", and it is counted, not tested twice.
- **The 15 in part and the 52 for Phases 2–4 are every scenario without a whole proof**: none is a
  Phase 1 behaviour nobody has tested. The two that had no test of their own on 2026-10-06
  (ADR-369) have one since the phase exit (ADR-371): an expired tag on a lone collection
  (AC-03-50, `packages/domain/test/checks.test.ts`) and a certifying phone's cert numbers topped
  up to 100 (AC-05-47, the story `numbering`). **Of the 708 scenarios with a Phase 1 part, 693 are
  proven whole and the Phase 1 part of the other 15 is proven; what is left of each is a later
  phase's.**
- **How it was counted:** a row is whole when its Passing cell is filled and doesn't begin "in
  part"; "names the ID" is a search for the ID in `packages/*/test`, `packages/scenarios/src`,
  `apps/` and `tools/`. Count again the same way after any task that proves one.

## How a scenario is written

| Column | What it holds |
|---|---|
| **ID** | `AC-<part>-<number>`, e.g. `AC-01-07`. Never renumbered; a withdrawn one is struck through and keeps its number |
| **Scenario** | Given, when, then, in plain words, with values from the example world (`spec/CONVENTIONS.md` §6). One behaviour each |
| **From** | The decision or page it restates (ADR, skill section, spec page) and the requirement it serves |
| **Proven at** | Where Phase 1 proves it, and the task that does: **database** (a test in `packages/db/test`: a constraint, a grant, a guard), **domain** (a unit test of a rule in `packages/domain`), **story** (the scenario harness, `pnpm scenarios`). A part that needs a later phase names it: **API** (Phase 2), **field app** (Phase 3), **back office** (Phase 4) |
| **Passing** | Empty until a test proves it, then the layer it passes at. Filled only from a real run |

**Rules for whoever writes one.**
- **Never invent a rule to write a scenario.** No source, no scenario: list it under the file's
  "Left to the task that builds it" instead.
- **Money and quantities** come from the golden mission, or are worked out on the page with the
  arithmetic shown. Never a guessed rate.
- **Names and examples** come from the example world; a new one is added to `spec/CONVENTIONS.md`
  §6 in the same response.
- **A flag's message** is quoted word for word from `spec/FLAGS.md`.
- **Never a bare "event"** for the disaster; a monitor's record is a *field event*.

**Rules for whoever proves one.** The test's name starts with the scenario's ID
(`it('AC-01-33 size bands of one payable type cannot overlap', …)`), so a search for the ID finds
its proof, and the count of passing IDs is the progress. A scenario proven at two layers has a test
at each. Mark **Passing** only from a run you saw.
