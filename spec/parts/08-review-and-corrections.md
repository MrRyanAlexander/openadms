# Part 8 — Review & correct

✅ **Approved**

← [Part 7 — Price, ledger & audit](07-pricing-ledger-audit.md) · [Index](../INDEX.md) · Next: [Part 9 — Invoice, deliver & close out](09-invoice-deliver-closeout.md)

> **Approved by the user 2026-09-29** (ADR-269), in today's rules (rewritten 2026-09-29, ADR-247). Sequence here; rules in the
> skills, which win on disagreement: `adms-exceptions` (duplicates, renumber vs void, corrections),
> `adms-validation` §5.4b (accepting a flag), `adms-ledger-audit` (QC).

## What it does

People clear what the worker won't decide. A back-office user reads the evidence the monitors
captured, fixes what's wrong **in the field events themselves**, and the worker draws its
conclusions again. People never force a pairing and never write a completed load or a transaction
(invariant 4). Every change is audited under the person's own ID, the prior value kept for ever.
The back office sees **everything** about a ticket, laid out to review, fix and QC many quickly
(ADR-224).

**Who:** an admin, or a manager/analyst with permission. **A monitor never edits a record after
submitting it on the phone** (ADR-477).

## One review queue (ADR-228)

One queue replaces the legacy's error report, queues and workflow screens: **flags grouped by
cause**, with bulk accept, fix and QC; photos reviewed inside the ticket. It holds:
- **flagged tickets**, each with its plain message ("Ticket 101008: debris type mismatch (collection
  Vegetative, disposal C&D). Flagged for review.");
- **quarantined records**: a second field event of one kind on a ticket, shown beside the one that
  holds the number (ADR-022);
- **pending tickets**, listed as pending, never flagged for waiting, never expired, with the flags of
  the event they have (ADR-053, 244).

## Step by step

1. **Open the ticket** and read every field event on it: the cert numbers, the collection's end and
   the disposal's start, the disposal's GPS and site, the address, the debris types, the photos of
   the pile and the empty bed.
2. **Work out what happened before touching anything** (`adms-exceptions` §4.3a):

   | The evidence says | Action |
   |---|---|
   | Real work under the wrong number (a barcode scanned twice at the tower) | **Renumber** it |
   | Real work, a detail keyed wrong | **Correct** the field: any captured field, GPS and times included |
   | A phantom: two open collections on one cert, overlapping windows, no disposal between | **Void** it, with a reason. **Never renumber a phantom**: that double-bills |
   | A split's collection, or an event whose partner simply hasn't synced | **Touch nothing** |
   | The flag is right as it is (a heaped load at 96%, photos confirm) | **Accept** it, with a reason |

3. **Make the change**, in place, with a reason where one is asked (picked from the firm's list,
   ADR-173): no replacement records, no correction events; the audit log keeps prior value → new
   value under your ID (ADR-051, 236).
4. **The ticket reprocesses**, `COMPLETED` ones included: the worker draws its conclusions again,
   updating the completed load in place and regenerating its transactions
   ([Part 6](06-reconciliation.md); ADR-086).
5. **An accepted flag** stays in the ticket's history and isn't raised again unless the facts it was
   about change; when every flag is fixed or accepted, the ticket is `COMPLETED` (ADR-166).
6. **A void** keeps the record, **stops all billing** (its lines removed, each copied to the audit
   log first) and needs a reason. Unvoiding is an audited override. **A rule's void always wins**: to
   keep a ticket a rule voids, correct the data or the rule (ADR-060, 118, 167). A ticket in review
   **keeps billing** until resolved (ADR-060).
7. **QC** (separate from flags and statuses): the back office sets **QC Review → QC Approved / QC
   Issues / QC Void** by hand on the **completed load or haul-out**, never on one field event, and on
   each unit rate ticket, form and certification on its own. QC changes nothing on the record and
   reruns nothing; only QC Approved tickets can be locked as invoiced (ADR-107, 117, 121, 168).
8. **An invoice-locked ticket** is unlocked first (audited), then corrected and reprocessed
   ([Part 9](09-invoice-deliver-closeout.md); ADR-057).
9. **A device failed?** The back office **creates the record**, marked with the person and a reason,
   flagged, and it pairs like any other (ADR-156).

Nothing technically stops a wrong choice (renumbering a phantom). The audit trail is the backstop.

## Rules it follows

- Duplicates, quarantine, renumber vs void, corrections, reprocessing, orphans and preloads,
  back-office-created records → `adms-exceptions`
- Statuses, flag wording, accepting a flag → `adms-validation` §5.4, §5.4b
- QC status, the invoice lock → `adms-ledger-audit`; people's marks are their own records →
  `adms-data-model` §3.1b (ADR-245)
- Permissions and roles → `adms-domain` §1.4 (ADR-050)

## Where it will live

The review queue and QC screens in `apps/back-office` (Phase 4, REQ-405); corrections, renumbering,
voids, accepts and QC marks through `apps/api`, each audited by the database; reprocessing as worker
jobs (ARCHITECTURE §13, §18). Not built yet: Phase 0 has only a provisional database schema (ADR-268).

## Open questions

None (ADR-230).
