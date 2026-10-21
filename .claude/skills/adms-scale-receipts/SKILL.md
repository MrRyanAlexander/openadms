---
name: adms-scale-receipts
description: Open ADMS scale receipts, in today's rules. Covers when a scale receipt exists at all (destination decides, the contract decides whether it matters), what one actually is (a hand-transcribed third-party paper, a real weighing or only a lineage token), why it is its own record referenced by several field events and consumed once, one quantity never both (the tower takes the weight instead of a load call where the site's lookup says the paying pay items are by weight), one weight shared by a tandem split by certified capacity and flagged, why there is no weight-vs-load-call check, and the cases to handle rather than assume. Use when touching weights, tonnage, TN billing, scale receipt numbers, final disposal sites or tandems.
---
<!-- skill-status: current (ADR-138, rewritten 2026-09-29, ADR-252; haul-outs, ADR-295; the record built, ADR-326; the number never unique, ADR-328, 331) -->

> **This page states today's rules** (last changed by ADR-331, as its status line lists). Each rule cites its ADR; what changed is in
> the History list at the end. The user's own words are quoted and marked **User**. If this page and
> `agent_store/DECISIONS.md` (or `SUMMARY.md`, to ADR-598) disagree, the record wins: log a KD (`adms-decisions`). Names and examples
> follow `spec/CONVENTIONS.md`. The industry says "scale ticket"; **it is not a ticket** and never
> pairs, so this system says **scale receipt**.

# PART 4B — SCALE RECEIPTS

## When does a scale receipt exist at all? (ADR-036)

**Destination decides whether one can exist; the contract decides whether it matters.** Get this
straight before writing any check: "missing" is the normal case far more often than a fault.

| The load ends at | The paying pay items are | A scale receipt | Its weight |
|---|---|---|---|
| **a TDSR / DMS** | anything | **never**: there is no scale at a field staging site | — |
| **a final disposal site** | per CY (load call × certified capacity) | **optional**: a chain-of-custody token that the load arrived; a Final Disposal tower may offer its number as an optional field (agent default, ADR-227) | usually none, or **zero**, and that is legitimate |
| **a final disposal site** | **all per ton or pound** | **required** | **it is the billed quantity**, entered **instead of** a load call |

**Which contract line pays is the firm's setup, never the system's choice.** **User, 2026-09-28
(Q-191):** "Contracts alomst always have a per CY and per TON rate schedule like this which allows
options later for the Prime to work with various landfills." The firm enters the pay items it will use
(`VEG-HAUL-CY-15`, `VEG-HAUL-TN-15`, `TIP-FEE-TN-BCL`) and its rules pick (ADR-202).

## One quantity, never both (ADR-165, 223, 227, 243)

**A load asks for one quantity**: a load call, **or** the scale weight, **or** (for a load that
carries tickets) a count. **User, 2026-09-27 (Q-157):** "We do not want to check scale weights
against CY". So **there is no weight-vs-load-call check**, and no tons-per-CY conversion factor.

- **Whether a load is weighed comes from the Unit of Measure of the pay items the firm's rules pay it
  at** (`TN` or `LB`), never from the site, never from a box on the pay item: **a site doesn't own
  weighing**, and no separate weight box exists on the pay item (ADR-221, 223).
- **The back office works it out ahead**: for each site, debris type and prime, the system reads the
  rules that could match there (the site's tipping fee pay items left out) and their pay items' Units
  of Measure: **all per ton or pound → the scale weight** instead of a load call; anything else (per
  CY, a mix, no rule) → **the load call**. The lookup follows the truck's prime, is rebuilt whenever
  the rules change, is shown on the site's page, and travels with the tower phone's lists for its
  **assignment** (ADR-227, 240, 243). The tower asks once the badge gives the prime and the monitor
  picks the debris type.
- **After sync, a line whose pay item needs a weight the load doesn't have is flagged** ("Ticket
  101012: TIP-FEE-TN-BCL is priced per ton, but the load has no scale weight. Flagged for review."),
  and that line bills nothing, so the firm fixes its setup or its operations (ADR-223).
- **A haul-out** always takes its load call at the loading end (it can't know where the truck goes);
  its disposal takes the weight where its site's lookup, read from the haul-out form's rules, says the
  haul-out is paid by weight, and then the loading end's call is kept, unbilled (ADR-013, 227). A truck and
  trailer hauled out and weighed once are split by certified capacity, flagged and marked as shares
  exactly as loads are; a split haul-out's piles share the weight by what each pile added to the load
  call (ADR-295).
- **Fees never make a phone ask for anything** (ADR-224).

## What a scale receipt actually is (ADR-038)

**A paper document handed to the tower monitor by the final disposal site.** Its quality varies
enormously:

| Form | What it carries | Evidentiary weight |
|---|---|---|
| **A professional weighing**: an invoice-style printout | gross, tare, net, tonnage, usually the vehicle weighed | **strong**: an independent measurement off calibrated equipment run by neither the contractor nor the monitor |
| **A receipt-book slip**, filled in by hand | a receipt number, often nothing else | **a lineage token, not a measurement**: it proves the load arrived, nothing about how much |

The "scale house" may be a connex box in a field; weights may be worked up on a spreadsheet later, or
never. **A site won't produce a weight the contract doesn't ask for**, and that's not a failure.

> **When it is a real weighing, it is the only measurement here that nobody with a stake in the
> number produced.** A load call is a monitor's eye; a capacity is a monitor's tape measure; an
> estimate is testimony: all honest, all *ours*. A weight off a landfill's calibrated scale is
> independent in a way nothing else is. **But only when it is a real weighing**: never build logic
> that treats every receipt as an authoritative measurement.

## Why it is its own record (ADR-034)

1. **The number is captured, not ours.** The receipt number is issued by the disposal site: the
   one identifier we don't mint (unlike cert numbers and ticket numbers, which are our series or our
   own pre-printed stock). It is **transcribed by hand, never scanned**: stored verbatim, never
   normalised into our format, never regenerated, and never confused with a ticket number.
2. **One receipt can cover several field events.** A tandem's truck body and trailer are two
   certifications and two tickets (`adms-certifications` §3A.1), weighed in one pass on one receipt.
   Weight columns on each disposal event would duplicate one weighing across two rows and invite
   summing them: **billing 34.20 tons for a 17.10-ton load**. So a scale receipt is **its own record**
   that the disposal events point at (REQ-126a).
   **Built (ADR-326):** `ScaleReceipt`, with the number kept exactly as written and every weight
   optional and never worked out; a disposal or a haul-out disposal points at it
   (`scaleReceiptId`), and a tandem's two disposals at the one row.
3. **It is consumed once.** A receipt attached to a second, unrelated load is a direct double-billing
   vector: every field event on it must belong to the same physical trip.
4. **Its number is never unique** (ADR-328, 331). **User, 2026-10-04:** "The database should not
   care about scale ticket matches or mismatches. Think of these as arbitrary numbers. If there was
   a duplicate record then that would be an issue (cert, date, time, etc...). Happens all the time.
   Scale house uses store bought receipt book with 500 pages. Starts at 001 and goes to 500. Then
   restarts again." So no receipt is refused, at the database or at sync, for a number already on
   its project. What a duplicate *record* is (the same truck, day and time) and how it is flagged
   is the worker's (1.5.x), not settled here.

## One weight shared by a tandem (ADR-175)

```
 07:50  COL 101050  cert 730421  truck body, 30 CY   Vegetative
 07:52  COL 101051  cert 730422  trailer,    40 CY   Vegetative
          └─ loaded together; one vehicle leaves
 09:30  Bayline County Landfill (Final Disposal): the site's lookup says weight for
        Vegetative on a Coastline truck (every rule that could pay there is per ton)
          GROSS  the whole tandem ....... 62,400 lb
          TARE   the whole tandem ....... 28,200 lb
          NET    ........................ 34,200 lb = 17.10 tons
          ONE receipt: BCL-88241
 09:45  DIS 101050  weight from BCL-88241      09:47  DIS 101051  the same receipt
```

**Split by certified capacity**, and **both tickets are flagged** ("one scale weight shared by two
containers, split by certified capacity"):

```
  truck body  30 CY → 30 / 70 = 42.86% →  7.33 tons
  trailer     40 CY → 40 / 70 = 57.14% →  9.77 tons
              ─────                       ──────────
              70 CY                       17.10 tons ✓
```

**User, 2026-09-27 (Q-169):** "the better option is for the truck and trailer to be weight separate…
if tandem and weight, flag it for review since this is messy math." **Weighing each container
separately needs no split and no flag.**

The apportioned figure is **derived, never observed**: only 17.10 was weighed (ADR-035's safeguards
stand):
- computed **server-side, deterministically**, in `packages/domain`; never taken from a phone;
- **the observed weight and the derived shares stored apart**, and a derived share never shown or
  exported as though a scale produced it: "was this weighed, or inferred?" must be answerable years
  later;
- **rounding creates or destroys no tonnage**: shares to two decimals, the remainder given to one
  ticket deterministically, summing **exactly** to the net.

**A tandem is not a modelled concept and is never inferred** (ADR-038, 114). Nothing in the data says
truck body 730421 towed trailer 730422, and consecutive cert numbers prove nothing. **The receipt the
tower links both disposals to is the only place that pairing exists.** If the trailer has no ticket,
the system can't know it was there and must not guess.

## Cases to handle, not assume

Every problem is a **flag**, never a refusal (ADR-052); wording in `adms-validation` §5.2.

| Case | Handling |
|---|---|
| **A weight needed but missing** (a per-ton line, no weight on the load) | the line is flagged and bills nothing (ADR-223) |
| **Gross or tare missing** on a real weighing | the net is unverifiable; **never infer a missing weight** from the capacity or the other figure |
| **Tare taken in a different configuration from gross** (the trailer dropped before tare) | the subtraction silently overstates (62,400 lb coupled − 16,800 lb truck alone counts the trailer's empty weight as debris). Tare must match gross's configuration; where the record shows otherwise, the weight is flagged and unused |
| **Net = 0** | legitimate where no paying pay item is by weight (a lineage token); flagged where one is (ADR-036, 223) |
| **Net below zero, or beyond the vehicle's legal limit** | a transcription error or a tare taken loaded: flagged, the weight unused |
| **A receipt carrying two debris types** | **this doesn't happen**: a receipt covers one debris type. If seen, **both tickets are flagged** and the weight is **unused**, so neither bills by weight until a person fixes the receipt or voids a ticket (ADR-069). The system never voids on its own for this; only a person, or the firm's own rule (ADR-118) |
| **The same receipt number on a later trip** | normal: a receipt book starts again at 001. Both receipts are kept, and the number alone is no fault (ADR-328, 331). A duplicate *record* (the same truck, day and time) is the worker's to flag (1.5.x) |
| **A receipt at a TDSR** | can't exist: there is no scale there; a number typed there is only the monitor's note |

**Live scale-house integration** (IP or serial, gross/tare/net read automatically) is a later
candidate (REQ-508); the hand-transcribed receipt is Phase 1 and covers the common case: a connex box
and a receipt book.

---

## History

What this page used to say, and why it changed. Never build from the left-hand side.

- A combined weight apportioned **by load-called volume** (7.57 / 9.53) → by certified capacity, both
  tickets flagged (ADR-035 → 175).
- "The cross-check it unlocks": scale tons against Σ(capacity × call) × a contract tons-per-CY factor,
  the "single most useful fraud signal" → withdrawn; no check, no factors (ADR-165).
- A **"requires weight"** flag on the pay item, pushed to the tower phone at setup → the paying pay
  items' Unit of Measure; the site's lookup worked out ahead from the rules; no pay items on a load's
  phone (ADR-037, 175 → 221, 223, 227, 243).
- The requirement tested through a `SCALE_NUMBER` rule condition on a grouped pair, `MANUAL_REVIEW` not
  `FAILED` → a flag on a line missing its quantity; no such criterion (ADR-037 → 109, 223).
- Weight columns on `DisposalTicket` (`grossWeightLbs`, `netWeightTons`) considered and refused → a
  scale receipt record referenced by field events (ADR-034, 236).
- `DisposalSiteType` `TDRS` / `FDS` telling destinations apart → the site type TDSR/DMS or Final
  Disposal (ADR-091, 190, 215).
- "A receipt with two debris types is voided by default", "the engine never writes VOID" → both
  flagged, weight unused; a person voids, or a firm's rule (ADR-069, 118).
- "None of this is built" (KD-24) → nothing is built yet; the requirements are REQ-126a, 126b, 126d,
  126e (ADR-093) → the record is built (REQ-126a, ADR-326); the shares, the flags and the
  lookup are tasks 1.5.4, 1.5.x and 1.6.4.
- The worked example (tickets `10101`/`10102`, certs 4471/4472, "Rivera Landfill", receipt `SH-88241`)
  → the example world (ADR-235).
- A receipt's number **unique per project**, "the same receipt number on a later trip" flagged as a
  transcription error → never unique; only a duplicate record matters (the user, ADR-328; built,
  ADR-331).
- The ⚠️ notes of ADR-165, 175 and 223 stacked on the historical body → absorbed; rewritten in the
  present tense (ADR-138, 252).
