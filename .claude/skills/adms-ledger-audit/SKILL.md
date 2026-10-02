---
name: adms-ledger-audit
description: Open ADMS money and the permanent record, in today's rules. Covers pay items (the only place a rate lives, one rate per prime), how a ticket is priced (the rules of its form that name its prime's contract, Add transaction in # order, Remove, Void ticket), quantity and rate, the Transaction ledger (the current truth, regenerated per ticket, each removed row copied to the audit log first), rate and rule changes, the append-only AuditRecord written by the database, QC status, the invoice lock and invoice batches, and the client package. Use when touching pay items, rates, transactions, pricing, the audit trail, QC, invoicing or anything that must leave an immutable trail. The rule builder's screens and every criterion are spec/RULES.md; how the worker runs rules and the pricing flags are adms-validation §5.3.
---
<!-- skill-status: current (ADR-138, rewritten 2026-09-29, ADR-249; a pay item names no form, ADR-292; a unique code and a description, a duplicate rule refused, ADR-301) -->

> **This page states today's rules** (last changed by ADR-301, as its status line lists). Each rule cites its ADR; what changed is in
> the History list at the end. The user's own words are quoted and marked **User**. If this page and
> `agent_store/SUMMARY.md` disagree, SUMMARY wins: log a KD (`adms-decisions`). The worked example
> is `spec/golden/MISSION.md` §1 and §4; names and examples follow `spec/CONVENTIONS.md` (the pay
> item code convention is its §5). The words (pay item, payable type, transaction, completed load)
> are defined once, in `adms-domain` Part 2.

# PART 6 — MONEY, THE LEDGER AND THE AUDIT TRAIL

**Transactions are conclusions, like everything the worker writes**: drawn from a ticket's current
field events and the firm's current setup, and drawn again on every reprocess (`adms-domain` §1.2;
ADR-236). **The firm's setup decides which price a contract means**; Open ADMS never chooses
(ADR-197, 202). **The rules are the firm's own tool**: the system enables the options and hardcodes
none of a firm's rules (ADR-224). **Monitors never see a rate or a code** (invariant 20).

## 6.0 Pay items: the only place a rate lives

A **pay item** is a priced line of the contract as the firm sets it up, **the thing that denotes
payable work**: there is no separate "work item" behind it (ADR-122, 237). The firm types each line
of the paper contract in by hand (ADR-089, 109). Each pay item holds:

| Field | What it is | ADRs |
|---|---|---|
| **Code** | The firm's own string; setup **suggests** one from the convention (`VEG-HAUL-CY-15`, `TIP-FEE-CY-BCL`), never forces it. **Unique on its project**, archived pay items included: a rate that changes from a date is a second pay item with a code of its own, whatever the firm calls it, with *Ticket date* criteria on the two rules. **User, 2026-10-02:** "The "code" is the number+chars you assign it. This must be unique per project." | 109, 235, 301 |
| **Description** | What the work is, in the firm's own words ("ROW VEG haul 0–15 mi"), shown with the code wherever a pay item is listed or exported. Nothing reads it; two may share one. There is no separate name. **User, 2026-10-02:** "The code should be unique, but the decription should be whatever the firm wants to make it." | 207, 301 |
| **Payable type** | **The work** it prices, from the firm's list; each pay item is a priced line of it (the same work at two rates by distance is two pay items of one payable type). Every pay item has one, loads, haul-outs and fees included; exported as the type column | 173, 207, 221, 239 |
| **Unit of Measure** | A billing unit (`CY` `TN` `EA` `LB` `HR` `CREW_DAY` `TBN`); `TN` or `LB` means the load is weighed | 221, 223 |
| **Size band** | From, to: its place among the pay items of one payable type (the phone and the engine pick the pay item by it) | 210, 213, 217 |
| **Capture settings** | "Count is always 1", "GPS required", "Measurement required", "Decimals allowed", photos required, "Monitor may mark ineligible", quantity "from the tickets it carries"; for crew time, how hours become a quantity | 087, 157, 192, 210 |
| **Rates** | **A rate for each prime** that works under it, never a copy per prime. No rate at all → a **$0 pay item** that still writes a line (staged freon); `TBN` bills nothing until a rate is agreed | 068, 128, 206 |

**User, 2026-09-28 (round 22, as recorded in ADR-206):** "A service can have multiple primes with
rates on the same service." ("Service" was the legacy word for a pay item, ADR-237.)

**A load carries no pay item**: the monitor picks its debris type; the rules choose what it's paid at,
after sync. A unit rate ticket carries the one its band gives (ADR-207, 213, 221). **There is no fee
label on a pay item** (ADR-246): the # slot keeps a load's lines apart, the site's link to its
tipping fee pay item tells a fee line (ADR-222), and the payable type groups lines.

**Setup made easier, model unchanged** (ADR-229): the pay item screen has a **"Pays when"** part;
saving it **writes and keeps its own rule**, one per contract whose prime has a rate on the pay item
and per form it pays on (a pay item names no form: a site's tipping fee is added by a Load rule and
a Haul-out rule, ADR-292),
marked "from pay item HNG-RMV-EA" and edited only there; free-standing rules stay for everything else
(removes, voids, date ranges). A **setup check** lists gaps before the field day, and every rule or
pay item change shows **what it would change** first. A firm **library** and **copy from a past
project** make setup reusable (ADR-228).

## 6.1 Transaction: the current truth, regenerated per ticket (ADR-085)

A **transaction** is one priced line: the ticket (and, on a split, the property), the rule and its #
slot, the pay item, the quantity, the rate, the cost, the rule's contract, **the prime and the
operating sub** (ADR-081, 212). A ticket may carry **several** on purpose: a load's hauling line and
its tipping fee line (ADR-085). Subs work under their prime's rate; the prime pays its subs outside
the system (ADR-081).

**The ledger shows the current truth.** When a ticket changes, its transactions are **removed and
written again**; there are **no reversal rows**. **User, 2026-09-24 (round 8):** "If we have to update
a rule or maybe change like 10 tickets for some reason, we'd end up creating a bloat load of
transaction reversals and end up having to equery that to infinity." **The rule that keeps this
safe:** before a transaction is removed, **its entire row is copied to `AuditRecord`** (who, why,
which reprocess); the database does it itself, and refuses the delete on a ticket locked as invoiced
(ADR-085, 090, 097; ARCHITECTURE §5.3). Regeneration is idempotent by construction: the same ticket
and setup always give the same lines (ADR-130).

**Only the worker writes transactions** (ARCHITECTURE §2, §5.1); no person edits one.

### 6.1a Pricing a ticket

How the worker runs the rules is `adms-validation` §5.3; the builder and every criterion are
`spec/RULES.md`. In short:
1. **The rules that may run** are the active, valid rules of the ticket's **form** whose **contract**
   is held by the ticket's prime, plus the form's rules with no contract (remove or void only). The
   prime comes from the certification, never a monitor's pick (ADR-186, 239).
2. **Every rule whose criteria all hold** runs; criteria read only the ticket (ADR-131).
3. ***Add transaction #n*** actions run **in # order** (#1, #2…), then every ***Remove transaction
   #n***, then any ***Void ticket*** (naming the rule). The # is the line's **slot** (ADR-118, 130,
   131).
4. **A split is priced once per property**, on its share (ADR-162); a split haul-out once per pile,
   on its share (ADR-295). **A haul-out dumped at a TDSR** is
   priced no further until corrected (ADR-226).

**The pricing flags** (wording in `adms-validation` §5.2): no rule of the ticket's prime creates a
line ("Ticket 101010: no pricing rule on a Summit contract matches. Flagged for review."); two
creates of the same # (neither bills); a pay item with no rate for the prime (a **$0 line**,
flagged: "Pay item VEG-HAUL-CY-15 has no rate for Summit."); a line whose pay item needs a quantity the
load lacks (that line bills nothing); a site that charges a tipping fee with no line for it (a
**missing rule**) (ADR-118, 212, 222, 223, 239).

### 6.1b Quantity and rate

**Cost = quantity × rate.** The **rate** is the pay item's rate **for the rule's contract's prime**
(ADR-212). The **quantity** comes from the pay item's Unit of Measure; the formulas are
`adms-validation` §5.5:

| Unit | Quantity | ADRs |
|---|---|---|
| `CY` | capacity × load call (a haul-out: its collection's call); a split property's share; a load of stumps' summed CY; the fill CY on a stump ticket; never the stump's own CY on a stump ticket | 055, 192, 198 |
| `TN` | the scale weight (a tandem's split by certified capacity, both flagged) | 175, `adms-scale-receipts` |
| `EA` | the count: white goods, **every item removed** (or the items a rule's *Quantity from* chooses) | 126, 128, 131 |
| `LB` | the pounds the monitor entered as the count (HHW) | 054 |
| `HR`, `CREW_DAY` | **the highest item's hours, once**, through the pay item's conversion (per hour, ÷ the day length, or steps) | 084, 087, 126 |
| `TBN` | nothing: the ticket completes and writes no money until the rate is agreed; then its tickets reprocess | 068 |

**Who bills** (ADR-060): `COMPLETED` **and `MANUAL_REVIEW`** tickets bill wherever an amount can be
computed; review means "resolve this", not "hold the money". **User, 2026-09-24 (Q-13):** "Things
that need manual review are not blocked in billing, but they need to be resolved. Voided items stop
all billing." A `VOID` removes the ticket's lines, each copied to the audit log first.

Worked example (golden mission 101002): C&D, 75% of 48 CY = 36.0 CY, 11.4 road miles, dumped at
Bayline County Landfill → #1 `CD-HAUL-CY-15` 36.0 × $8.25 = **$297.00**; #2 `TIP-FEE-CY-BCL` 36.0 ×
$4.00 = **$144.00**. White goods (301006): `WG-RMV-EA` × 6 = $240.00, `WG-FRN-EA` × 2 = $50.00
(`spec/RULES.md` §9).

### 6.1c Rate and rule changes

**A rate or rule change regenerates the transactions of every affected ticket not locked as
invoiced**, unlocked ones included, through the same copy-then-remove path; **invoice-locked tickets
are never touched** (ADR-090). Before saving, the admin sees how many tickets and lines it would
change ("Show matches"), then runs it ("Reprocess") (ADR-109, 229). There is no separate history
table: the audit log is the only history.

## 6.1d QC, the invoice lock, batches and the client package

- **QC status** (QC Review → QC Approved / QC Issues / QC Void) is the back office's own review mark,
  set **only by people**: on the **completed load or haul-out** (a split is one), never a single
  field event; on each unit rate ticket, form and certification on its own. **It never changes the
  record or reruns anything** (ADR-107, 117, 168). **User, 2026-09-27 (Q-160):** "Why would we ever
  think to invoice half of a ticket? We wont ever do that. PERIOD!"
- **There is no invoice record** (ADR-061). "Invoicing" means the back office checked a set of tickets
  and **locked them as invoiced** (who, when). **Only QC Approved tickets can be locked**: QC Review,
  QC Issues and QC Void all block (ADR-121; **User, 2026-09-25 (Q-116):** "#3 all day."), and a
  ticket in review is resolved first (ADR-067). A locked ticket can't change until it's unlocked; the
  lock and the unlock are audited (ADR-057).
- **Invoice batches** (ADR-228): locked tickets may be grouped in a **named batch** ("Bayline ROW,
  week of 12 Oct"): a name and its tickets, no amounts, reportable by name.
- **QC marks, locks, batch membership and flag acceptances are people's records**, each its own
  record written by the API and keyed to what it marks, so the API never writes a derived row and a
  reprocess never loses one (agent default, ADR-245; `adms-data-model` §3.1b).
- **The client package** is the deliverable: the project's final tickets with photos and receipts,
  its transactions and its other records, **assembled by hand** by the back office from the exports
  and zipped. The system doesn't generate it and moves no money (ADR-057, 061, 088).
- **Read-only viewers** see money only for their own work: a contractor its own tickets and
  transactions (a prime with its subs'), never another prime's (ADR-169).

## 6.2 AuditRecord: append-only, absolutely

**Every insert and update** on a tracked table writes an `AuditRecord`: the prior and new values and
the fields that changed, who (a real person, or the system actor for the worker), which device, the
source, the reason and the request. **The database writes it itself, by trigger**; every write
transaction states its actor first, and **a write with no actor is refused**. No role may update or
delete an `AuditRecord`. Entries carry a domain (security · billing · operations · records) (ADR-007,
085, 097, 113; ARCHITECTURE §5.3).

**It is the only history, and it is why everything else can change safely**: records are corrected in
place and transactions regenerated because every prior value is kept here for ever (ADR-039, 085).
Corrections are made in place, never as correction events (event-driven, not event-sourced,
ADR-236).

**A write path whose change isn't captured is a defect, however well it typechecks.** The capture is
proven by the database tests, every grant and every refusal (REQ-009…013).

## 6.3 Identifiers the system issues

Owned elsewhere, listed here because the ledger depends on them:
- **Ticket numbers**: bare, a per-project series per workflow, made by the first field event and
  carried to the second; one field event per kind per ticket (`adms-ticket-workflows` §4.0a,
  `adms-data-model` §3.4; ADR-046, 062, 236).
- **Cert numbers**: cert = placard = badge, unique per project, system-issued or pre-printed
  (`adms-certifications`; ADR-045).
- **Internal IDs** are UUIDv7, made on the phone for field records; a business number is never a key
  (`spec/CONVENTIONS.md` §3).

---

## History

What this page used to say, and why it changed. Never build from the left-hand side.

- `Transaction` and `AuditRecord` both append-only; reversal rows for a change → transactions
  regenerated, each removed row copied to the audit log first (ADR-007 → 085).
- `writeAudit()` in `database/src/lib/audit.ts`, `write_audit()` in `queries.py`, `transactionService`
  as the only write path → audit written by database triggers with a required actor; transactions by
  the worker (ADR-093, 097, 113).
- A separate service code per contractor (`Bobs 1A Hanger`, `Toms 1A Hanger`) → one pay item, a rate
  per prime (ADR-054 → 206, 237).
- A rule with match and require conditions, one rule per fee kind, a fee kind on each code → criteria
  only; the # slot; no fee kinds (ADR-089 → 109, 118, 246).
- "Ticket Contract", a contract on each action, each rule testing *Contractor* → one contract per
  rule, which runs only on its prime's tickets (ADR-109, 174, 206 → 239).
- Pay items entered "with a rate and a contractor" → a rate per prime on one pay item (ADR-122,
  146 → 206).
- Itemised unit rate tickets priced line by line; crew hours ÷ 12 → one pay item per ticket; the
  highest item's hours through the pay item's conversion (ADR-084 → 124, 126, 087).
- Tonnage apportioned by load-called volume → by certified capacity, flagged (ADR-035 → 175).
- QC status on every record a monitor makes; open QC issues shown at lock → on the completed load;
  only QC Approved locks (ADR-107, 117 → 121, 168). No invoice record, then invoice batches (ADR-061
  → 228).
- §6.3 on the historical generator (`<PREFIX>-<YYYYMMDD>-<6hex>`, `ticketNumber.ts`, unique per stage
  table, `LoadTicket` / `HaulOutTicket`) → bare numbers, one field event per kind, completed loads
  (ADR-046, 062, 236; KD-13).
- The white goods example `WG-HAUL-EA-30` for a 40-mile load → `WG-HAUL-EA-60`, the convention's band
  (ADR-235, 247).
- The legacy's "Service" (`service_code`), retired examples (`1A`, TFR, Ceres, "Ticket 104499") →
  pay item, the example world (ADR-234, 235, 237).
- Round 13–22 and ADR-239 ⚠️ notes stacked on the historical body → absorbed; rewritten in the present
  tense (ADR-138, 249).
- "Codes and names may repeat" (a dated rate change as a second pay item with the same code), a pay
  item's separate name, and a description holding "the contract's words and line number" → the code
  is unique on its project; a pay item's texts are its code and its description, the firm's own
  words; "line number" was never the user's. ADR-147 had read the user's "Yes" to an either-or
  question the wrong way round (ADR-147, 207, 235 → 301).
