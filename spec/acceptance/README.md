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
| 1 Set up | [01-setup.md](01-setup.md) | 81 | 2026-10-01; AC-01-39…41, 66, 80 corrected and AC-01-81 added 2026-10-02 (ADR-301) | 8, all at the database: AC-01-41 (ADR-301); AC-01-31, 32, 34…38, the firm's lists (2026-10-02, ADR-302) |
| 2 People and devices | `02-people-and-devices.md` | | with task 1.1.9 | |
| 3 Certify | `03-certification.md` | | with task 1.2.1 | |
| 4 Capture | `04-field-capture.md` | | with task 1.3.1 | |
| 5 Sync | `05-sync.md` | | with task 1.4.1 | |
| 6 Reconcile | `06-reconciliation.md` | | with task 1.5.1 | |
| 7 Price, ledger and audit | `07-pricing-ledger-audit.md` | | with task 1.6.1 | |
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
