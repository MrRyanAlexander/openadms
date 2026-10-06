# Open ADMS — Acceptance scenarios

**Draft**: agent-written (ADR-300); the user approves.

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
| 2 People and devices | [02-people-and-devices.md](02-people-and-devices.md) | 77 | 2026-10-03 (ADR-314); AC-02-75…77 added (ADR-336); **approved by the user (ADR-335; AC-02-75…77 added after)** | **38: AC-02-75, 76, 77, whether a viewer sees private citizens by name (2026-10-04, ADR-336).** Before them, 35 at the database, each under a test named by its ID: the 28 Phase 0 built, and AC-02-05, 06, 09, 10, 11, 69, 70 (2026-10-03, ADR-315); AC-02-38, 49, 61 and 71 in part. 28 of the 77 are for Phases 2–4 only |
| 3 Certify | [03-certification.md](03-certification.md) | 59 (60 written; AC-03-57 withdrawn, ADR-328) | 2026-10-03 (ADR-317); **approved by the user (ADR-335)** | 8 at the domain, each under a test named by its ID: AC-03-21, 23, 24, 25, 27, 28, 31, 32, the capacity math (2026-10-03, ADR-320); AC-03-22, 26 and 29 in part (the database's half with 1.2.3). 25 are task 1.2.3's (the records), 20 later Phase 1 tasks', one split between 1.2.3 and 1.8.2, 3 for Phases 2–4 only. **37 pass after 1.2.3 (ADR-321) and AC-03-06 with numbering (ADR-323); 38 with AC-03-40, what a field event records (ADR-324); 39 with AC-03-34, a certification's five views (2026-10-04, ADR-326)** |
| 4 Capture | [04-field-capture.md](04-field-capture.md) | 103 | 2026-10-03 (ADR-322); AC-04-99…101 added (ADR-334); AC-04-102, 103 added (ADR-337); **approved by the user (ADR-335; AC-04-99…103 added after)** | **98 of 103 (the file's own count): AC-04-102 and 103, a photograph removed from the record and labelled (2026-10-04, ADR-337), at the database (`packages/db/test/scale-receipts-and-photos.test.ts`). Before them: AC-04-99, 100, 101, what an incident names and what its project offers (2026-10-04, ADR-334). Before them, 84: task 1.3.6's eleven, ROEs and forms (2026-10-04, ADR-327): AC-04-80, 81, 83…90, and AC-04-82 whole with the ROE it found**, at the database (`packages/db/test/roes-and-forms.test.ts`), AC-04-87's schema in `packages/contracts`; **task 1.3.5's eleven, scale receipts and photographs (2026-10-04, ADR-326): AC-04-71…78, and AC-04-38, 39, 52 whole with their scale receipt**, at the database (`packages/db/test/scale-receipts-and-photos.test.ts`), AC-04-75 in `packages/domain` and `packages/contracts` too; **task 1.3.4's thirty-two, what each kind records (2026-10-03, ADR-325): AC-04-32…37, 40, 41, 43, 45…51, 53…58, 60…69**, at the database (`packages/db/test/field-event-kinds.test.ts`), AC-04-37 and 46 in `packages/contracts` and AC-04-34, 46, 54, 58, 67 in `packages/domain` too; **task 1.3.3's twenty-one, what every field event records (2026-10-03, ADR-324): AC-04-02, 03, 12, 15, 16, 18…31, 44, 94**, at the database (`packages/db/test/field-events.test.ts`), the seven that restate a Phase 0 guard included; **and task 1.3.2's nine, numbering (2026-10-03, ADR-323): AC-04-01, 04…09, 13, 14**, at the database (`packages/db/test/numbering.test.ts`) and the domain (`packages/domain/test/numbers.test.ts`), each under a test named by its ID. 9 are task 1.3.7's (the day's story), 5 for Phases 2–4 only |
| 5 Sync | [05-sync.md](05-sync.md) | 56 | 2026-10-04 (ADR-333); **approved by the user (ADR-335)** | **43 of 56, two more in part** (task 1.4.2, ADR-338: 37 of its 39 by the story `sync`, the story `p1-any-order` and `quarantined-records.test.ts`, and the six built earlier now named by this file's IDs; AC-05-47 and 56 in part). Three wait for the worker and the reviewer (AC-05-28, 53, 55), eight for Phases 2–4 |
| 6 Reconcile | [06-reconciliation.md](06-reconciliation.md) | 165 | 2026-10-05 (ADR-339); AC-06-163…165 added (ADR-345); a draft for the user to approve | **146 of 165, fourteen more in part, after task 1.6.3 (ADR-355: AC-06-70, 71, 91, 105, 120…123, the flags pricing raises); 138 after task 1.6.2 (ADR-354: AC-06-57); 137 after task 1.5.9 (ADR-352; the file's own count).** Before it: 65 of 165, fifteen more in part (after ADR-345, 2026-10-05; before it: 56 of 162 after task 1.5.5, ADR-344; 25 after 1.5.4, ADR-343; 15 after 1.5.3: task 1.5.2, 2026-10-05, ADR-340, at the database, `packages/db/test/derived-records.test.ts`: AC-06-06, 144, 145, 146; in part AC-06-137, 138, 148, 152. Task 1.5.3, 2026-10-05, ADR-341, at the domain, `packages/domain/test/tickets.test.ts`: AC-06-07, 08, 09, 11, 12, 15, 19, 20, 21, 22, 142; in part AC-06-10, 13, 14, 17, 23, 24, 125, 143, 160). 152 are Milestone 1.5's (tasks 1.5.2…1.5.9), nine wait for the rules (Milestone 1.6), one for a reviewer's correction (1.8.x) |
| 7 Price, ledger and audit | [07-pricing-ledger-audit.md](07-pricing-ledger-audit.md) | 114 | 2026-10-05 (ADR-353); a draft for the user to approve | **97 of 114 after task 1.7.1 (2026-10-06, ADR-358): AC-07-85…87 and 89 at the database (`Transaction` in full), and the ten Phase 0 restatements, AC-07-88, 90, 96, 97, 104…109, whose tests now carry these IDs.** Before it, 83 of 114 at the domain after task 1.6.3 (ADR-355): AC-07-10, 11, 38…83, with 1.6.2's AC-07-01…09, 12…37 (ADR-354). 35 are task 1.6.2's (criteria), 48 task 1.6.3's (lines and flags), 4 task 1.7.1's, 12 task 1.7.2's, 10 restate guards Phase 0 built (their tests take the IDs with 1.7.1), 3 the golden mission's (1.9.1), 2 for Phases 2–4 only |
| 8 Review and correct | `08-review-and-corrections.md` | | with task 1.8.1 | |
| 9 Invoice, deliver and close out | `09-invoice-deliver-closeout.md` | | with task 1.8.1 | |

**The golden mission is the tenth piece.** `spec/golden/MISSION.md` (approved, ADR-297) is one whole
mission with its exact statuses, flags and ledger. These files cover what it doesn't: the cases a
single clean-enough mission can't hold (a refused setting, a second prime, a split haul-out paid by
the CY, a pile whose call isn't higher).

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
