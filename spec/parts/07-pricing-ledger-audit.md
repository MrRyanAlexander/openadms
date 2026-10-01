# Part 7 — Price, ledger & audit

✅ **Approved**

← [Part 6 — Reconcile](06-reconciliation.md) · [Index](../INDEX.md) · Next: [Part 8 — Review & correct](08-review-and-corrections.md)

> **Approved by the user 2026-09-29** (ADR-269), in today's rules (rewritten 2026-09-29, ADR-247). Sequence here; rules in the
> skills, which win on disagreement: `adms-ledger-audit`; the rule builder is
> [`spec/RULES.md`](../RULES.md); a real rate sheet set up line by line is
> [`spec/RATE-SHEET.md`](../RATE-SHEET.md).

## What it does

Turns each reconciled ticket into money, deterministically, on the server, and keeps two trails.
The **`Transaction` ledger** is what each ticket is worth **now**: when a ticket changes, its lines
are **regenerated**, each removed row first copied in full to the audit log; there are no reversal
rows (ADR-085). The **`AuditRecord` log** is every change to anything, with who made it and the value
before; it is **append-only, absolutely**, and written by the database itself (ADR-097). **The firm's
setup decides which price a contract means**; Open ADMS never chooses (ADR-197, 202).

## Step by step: pricing a ticket

1. **The rules that may run**: the active rules of the ticket's **form** whose **contract** is held by
   the ticket's prime (the prime comes from the certification), plus the form's rules with no
   contract, which only remove or void (ADR-186, 239). Subs work under their prime's rate (ADR-081).
2. **The rules that pass**: every rule whose criteria all hold. Criteria read only the ticket (its
   field events, and the zone, mileage, quantity and unit rate pay item the worker attached), never
   another transaction; each criterion names the field event it reads; mileage is compared in
   tenths, half up; BETWEEN includes both ends (ADR-125, 131, 239, 244; `spec/RULES.md` §4).
3. **Apply the actions**: every *Add transaction #n* **in # order** (#1, #2…), then every *Remove
   transaction #n*, then any *Void ticket* (naming the rule). The # is the line's slot: a load can
   carry #1 hauling and #2 its tipping fee. The same ticket and rules always give the same lines
   (ADR-118, 130, 131). A rule's void always wins (ADR-167).
4. **The quantity** comes from the pay item's **Unit of Measure** (`adms-validation` §5.5):
   `CY` capacity × load call (a haul-out: its collection's call), a split property's share, or a load
   of stumps' summed CY; `TN` the scale weight (a tandem's split by certified capacity, both flagged);
   `EA` the count (white goods: every item removed, or the items a rule's *Quantity from* chooses);
   `LB` the pounds entered; `HR` / `CREW_DAY` the **highest item's hours**, once, through the pay
   item's conversion; `TBN` bills nothing until a rate is agreed (ADR-068, 087, 126, 128, 131, 175,
   192).
5. **The rate** is the pay item's rate **for the rule's contract's prime**; a pay item with no rate
   for that prime writes a **$0 line, flagged**; a pay item with no rate at all is a $0 line that
   still writes (staged freon, `WG-FRN-EA-STG`) (ADR-128, 206, 212). **Cost = quantity × rate.**
   Rates live nowhere else (invariant 7).
6. **Write each `Transaction`**: the ticket (and the split property), the rule and its #, the pay
   item, the quantity, the rate, the cost, the contract, **the prime and the operating sub**
   (ADR-081, 212). **`COMPLETED` and `MANUAL_REVIEW` tickets both bill** where an amount can be
   computed (ADR-060). A split writes its lines **per property** (ADR-162).
7. **Flags from pricing**: no rule of the ticket's prime creates a line ("Ticket 101010: no pricing
   rule on a Summit contract matches. Flagged for review."); two creates of the same # (neither
   bills); a line whose pay item needs a quantity the load doesn't have; a tipping fee site with no
   fee line (a **missing rule**); a haul-out dumped at a TDSR is priced no further (ADR-118, 222, 223,
   226, 239).
8. **On every reprocess** (a correction, a renumber, an accepted flag, a void, a rate or rule
   change): each current line is copied in full to `AuditRecord`, removed, and the lines are written
   again. A **void** removes them. **Invoice-locked tickets are never touched**: a rate or rule change
   regenerates only un-invoiced tickets, shown first as a count ("Show matches"), then run
   ("Reprocess") (ADR-085, 086, 090, 109).

## Step by step: the audit trail

1. **Every insert and update** on a tracked table writes an `AuditRecord`, **captured by a database
   trigger**: the prior and new values and the fields that changed, **who** (a real person, or the
   system actor for the worker), which device, the source, the reason and the request (ADR-097;
   ARCHITECTURE §5.3).
2. **Every write states its actor first**; a write with no actor is refused.
3. `AuditRecord` refuses every update and delete; a transaction delete copies the whole row to it
   first and is refused on an invoice-locked ticket.
4. The entries show any record as it stood at any moment. Corrections change records **in place**;
   the audit log keeps every prior value (event-driven, not event-sourced, ADR-236).

## Rules it follows

- Pay items and rates per prime, transactions and regeneration, rule actions, the audit log, QC,
  the invoice lock and batches, the client package → `adms-ledger-audit`
- How rules run and the pricing flags → `adms-validation` §5.2–§5.3
- The builder, every criterion and operator, worked examples → [`spec/RULES.md`](../RULES.md)
- Quantity math → `adms-validation` §5.5; a tandem's weight → `adms-scale-receipts`
- The database guards → ARCHITECTURE §5

## Where it will live

Pricing in `packages/domain`, run by `apps/worker`; the ledger and audit tables and their guard
migrations in `packages/db` (ARCHITECTURE §5, §18). Not built yet: Phase 0 has only a provisional database schema (ADR-268); **KD-01** (no
transaction is ever written, in the historical code) is a Phase 1 exit item for the rebuild.

## Open questions

None (ADR-230).
