# Part 6 — Reconcile

✅ **Approved**

← [Part 5 — Sync](05-sync.md) · [Index](../INDEX.md) · Next: [Part 7 — Price, ledger & audit](07-pricing-ledger-audit.md)

> **Approved by the user 2026-09-29** (ADR-269), in today's rules (rewritten 2026-09-29, ADR-247). Sequence here; rules in the
> skills, which win on disagreement: the run is `adms-ticket-workflows` §4.7, every check and
> status is `adms-validation`.

## What it does

The worker is the **only** thing that joins a ticket's field events. It groups them by ticket
number, checks them against each other and the setup, attaches the zone and mileage, works out the
quantity, runs the firm's rules and writes the completed load or haul-out and its transactions:
**conclusions drawn from the events**, drawn again on every reprocess (ADR-236). It never guesses and
never blocks: every problem is a **flag** with a plain message (ADR-052).

**What starts it: jobs, not requests.** A synced, back-office-created or corrected field event
queues its ticket; so do a renumber, a void or an accepted flag; a setup change (a rate, a rule, a
map version, a site's shape or GPS) queues every **un-invoiced** ticket it touches (ADR-090, 136,
141, 208, 236; ARCHITECTURE §13).

## Step by step, for each ticket

1. **Gather** the ticket's current field events: grouped on **project + workflow + bare number**,
   the split suffix stripped, ordered by field time. The event's kind is never used to *find* its
   partner, and each workflow has its own number series, so 101,001 can be a load and a haul-out
   (ADR-019, 033, 062). A duplicate never gets here: it was quarantined at sync ([Part 5](05-sync.md)).
2. **Read its shape:**

   | Events | Meaning | What happens |
   |---|---|---|
   | one of a pair | the other hasn't arrived (a preload is normal) | `PENDING`, listed, **never flagged for waiting, never expires**; the event it has is checked and its flags show (ADR-053, 244) |
   | a collection and a disposal (or a haul-out's two) | a load (a haul-out) | checked (step 3) |
   | collections `-A`, `-B`… and one disposal | a split | checked as one load; a bare collection beside suffixed ones, or a gap in the suffixes, is flagged (ADR-033, 173) |
   | one unit rate event | a unit rate ticket | checked alone; no pairing, no mileage |

3. **Check** (`adms-validation` §5.1–§5.2): between the events, the debris type (exact entry), the
   cert number (exactly), the order in time, the count against the carried tickets; on each event,
   the certification at work time, the project boundary and zone, the site's area, the active window
   and the site's dates, the times, where the debris went against the site's facts, the quantity (a
   0% call; the project's load-call limits), the pay item's settings and the unit rate bands, stumps,
   crew hours, ROEs and surveys. **Never flagged**: waiting, collection distance, GPS accuracy,
   estimates against the call, weight against a call (§5.2a). **A haul-out dumped at a TDSR** is
   flagged and priced no further (ADR-226).
4. **Attach** the **zone** from the collection's (or the unit rate event's) GPS, with the map version
   used, and the **mileage**: the shortest route on public roads from the collection's end GPS,
   snapped to the nearest road, to **the disposal site's own GPS**, from our own routing server; no
   route → the straight line, flagged (ADR-110, 135, 141, 163, 208). A split's mileage is per property.
5. **Work out the quantity** (`adms-validation` §5.5): capacity × load call; the scale weight (a
   tandem's split by certified capacity); the count of the tickets a load carries; per property on a
   split; for unit rate, the pay item again from the bands.
6. **Run the rules** of the ticket's form whose contract its prime holds, plus the form's rules with
   no contract; *Add transaction* in # order, then *Remove*, then *Void ticket*; per property on a
   split (`adms-validation` §5.3, [Part 7](07-pricing-ledger-audit.md), [`spec/RULES.md`](../RULES.md)).
7. **Write** the completed load or haul-out (`CLT` / `CHO`, updated in place, never duplicated), the
   regenerated transactions (each removed row copied in full to `AuditRecord` first) and the
   **status**: `COMPLETED` when nothing is open, `MANUAL_REVIEW` when a flag is; review **still bills**
   where an amount can be computed, and the message says "not billed" where it can't (ADR-060, 085,
   086).

**Guarantees** (ARCHITECTURE §13): steps 3–7 for one ticket **commit together or not at all**
(KD-55); **one run per project at a time**; a ticket that errors is flagged and skipped, never
stopping the rest; running again over unchanged input changes nothing; each run records what it
decided and why; every outcome is audited under the system actor. An invoice-locked ticket is
unlocked (audited) before it can change (ADR-057).

**Corrections come back** from [Part 8](08-review-and-corrections.md) as reprocesses, `COMPLETED`
tickets included: the worker draws its conclusions again from the corrected events (ADR-086).

## Rules it follows

- The run, its order and its guarantees → `adms-ticket-workflows` §4.7, ARCHITECTURE §13
- Every check, what is never flagged, statuses, flag wording, accepting a flag, quantity math →
  `adms-validation`
- How rules run and what they write → `adms-validation` §5.3, `adms-ledger-audit`
- Splits, duplicates, orphans and preloads → `adms-exceptions`
- The completed records are the worker's alone, with unique links → `adms-data-model` §3.1c
  (invariants 4, 17)

## Where it will live

The checks and formulas in `packages/domain` (plain classes, unit-tested alone); the run in
`apps/worker` on the Postgres job queue; routing and address lookup on our own Valhalla and
Nominatim servers (ARCHITECTURE §3, §13, §18). Not built yet: Phase 0 has only a provisional database schema (ADR-268).

## Open questions

None (ADR-230).
