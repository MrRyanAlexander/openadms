# Open ADMS — The rule builder

✅ **Approved**

> **Status: approved by the user 2026-09-29** (ADR-269; written under ADR-043, ADR-123), in today's rules (truth-up 2026-09-29, ADR-247). Written
> 2026-09-25 from the user's explanation (Q-111, Q-117) and the legacy rule-editor screenshots;
> updated through ADR-246. ✅ marks what the user decided; *agent default* marks what the agent
> decided under the question shot-clock (ADR-230), which the user may overturn. This is the page to
> build the back office's rule builder, and the engine's pricing step, from. How the worker runs the
> rules: `adms-validation` §5.3; what the lines are worth: `adms-ledger-audit`. Names and examples:
> `spec/CONVENTIONS.md`.

---

## 1. Where rules fit ✅

Rules are **back-office setup**; monitors never see or touch them. **The rules are the firm's own
tool**: Open ADMS enables the options and never hardcodes a firm's rules (ADR-224). The firm sets up
a project in this order *(Q-117, ADR-122)*:

1. **The project** (client → declaration event → project).
2. **The contractor(s)** (primes; subs appear later, at certification, ADR-108).
3. **The contract(s)**: a name, its prime, an optional link (ADR-146).
4. **The pay items.** Each is added by hand from the contract's line items. A pay item is **the
   thing that denotes payable work**: there is no separate "work item" behind it (ADR-122). Each has:
   - a **code** the firm names itself (`VEG-HAUL-CY-15`, `HNG-RMV-EA`, `TIP-FEE-CY-BCL`…; a
     convention is suggested, never forced, ADR-235), **unique on its project** (ADR-301), and a
     **description**: what the work is, in the firm's own words ("ROW VEG haul 0–15 mi");
   - its **payable type** (the work it prices, from the firm's list);
   - its **Unit of Measure** (a billing unit; `TN` or `LB` means the load is weighed, ADR-221, 223)
     and a **size band** where the payable type has several (ADR-213);
   - its **capture settings** ("Count is always 1", "GPS required", "Measurement required",
     "Decimals allowed", photos required, "Monitor may mark ineligible", quantity "from the tickets
     it carries") and, for crew time, how hours become a quantity (ADR-087, 207, 210);
   - **a rate for each prime** that works under it, never a copy per prime (ADR-206).
5. **The rules**, built from all of the above. The builder's dropdowns only ever offer what already
   exists on the project. **The pay item screen's "Pays when"** writes and keeps a rule for each
   contract whose prime has a rate on the pay item, on each form it says the pay item pays on (a pay
   item names no form of its own, so a tipping fee can pay on loads and on haul-outs, ADR-292), marked "from pay item HNG-RMV-EA" and edited
   only there; free-standing rules stay for everything else (removes, voids, date ranges) (ADR-229).

## 2. What a rule is ✅

| Part | What it holds |
|---|---|
| **Project** | The project it belongs to |
| **Form** | The project's form for one ticket type: load, haul-out, unit rate (ADR-018, 211: the legacy "Document Format" is the form) |
| **Name** | Free text, the firm's own; usually named to match its pay item, e.g. `VEG-HAUL-CY-15 - ROW VEG haul 0–15 mi`. A rule "Pays when" writes is named from its pay item (ADR-301) |
| **Contract** | One of the project's contracts; the rule runs only on tickets whose prime holds it. Blank only on a rule with no *Add transaction* (ADR-239) |
| **Active** | On or off |
| **Is valid** | Computed by the system (§7), never typed |
| **Criteria** | The "ifs": a list of checks, **all of which must hold** |
| **Actions** | What happens to a ticket that meets every criterion (§5) |

## 3. Building a criterion ✅

Three controls in a row, then **Add**:

1. **Criterion**: a dropdown of the criteria **that apply to the rule's form** (§4). Nothing that
   can't apply is offered (Q-102).
2. **Operator**: depends on what kind of value the criterion holds (§4a).
3. **Value**: filled from the criterion's own options. *Debris type* fills the list with the form's
   debris types; *Pay item* with the project's pay items; *Disposal site* with the project's sites;
   *Ticket date* shows a date picker; *Mileage* takes a number.

Each added criterion shows as a line: `Debris type Equals Vegetative`, `Pay item Equals HNG-RMV-EA`.
Add as many as needed; a ticket must meet **every** line.

## 4. The criteria, by form ✅ (from the legacy editor, ADR-109/118; names per `spec/CONVENTIONS.md`)

**The value: picked or typed** ✅ *(ADR-135, Q-128)*. Some criteria take a value **picked** from a
list (only what already exists on the project); others take a value the admin **types** (a number,
a date, text): *Mileage BETWEEN 0 and 15* needs two typed numbers. **This table is the one place that
says which, for every criterion.** A new criterion isn't added without its row here. **Each criterion
reads a named field event** (agent default, ADR-239 (6), 244), given in its row.

| Criterion | What it reads | Value: **picked** or **typed** | Load | Haul-out | Unit rate |
|---|---|---|---|---|---|
| **Ticket date** | The load's time, **its collection's end**, in the project's time zone; a unit rate ticket's own end (ADR-100, 161) | **typed**: a date | ✓ | ✓ | ✓ |
| **Contractor** | The prime the truck or crew works for, from its **certification** ✅ *(ADR-081/108, 186)*. A pricing rule doesn't need it: its contract already names the prime (ADR-239); it's for a rule with no contract (remove or void only) | **picked**: the project's contractors | ✓ | ✓ | ✓ |
| **Debris type** | The debris type the monitor picked from the form's list: **the collection event's** (each property's own on a split; the haul-out collection's) *(ADR-207, 211; agent default ADR-244)*; matches only the exact entry *(ADR-226)* | **picked**: the form's debris types | ✓ | ✓ | |
| **Field tag** | The field tag the collecting (or unit rate) monitor picked, if any *(ADR-216, 218)* | **picked**: the project's field tags | ✓ | ✓ | ✓ |
| **Weight** | The scale weight: the disposal's, or the haul-out disposal's *(ADR-223)* | **typed**: a number | ✓ | ✓ | |
| **Volume** | The billed CY: capacity × the load call (the disposal's; a haul-out's collection's); on a split, **the property's share** (ADR-162) | **typed**: a number | ✓ | ✓ | |
| **Collection address** | The collection event's (or unit rate event's) **address** (ADR-118; renamed from *Load location*, ADR-234) | **typed**: text | ✓ | ✓ | ✓ |
| **Zone** | The zone the worker attached from the collection's (or unit rate event's) GPS (ADR-135, 141) | **picked**: the zone names on the project's map | ✓ | | ✓ |
| **Disposal site** | Where it was dumped: the disposal event's site; a haul-out's, the final site it went to (ADR-164) | **picked**: the project's sites | ✓ | ✓ | |
| **From site** ✅ *(ADR-164)* | The TDSR a haul-out **left**: the haul-out collection's site | **picked**: the project's sites | | ✓ | |
| **Disposal site type** | The dump site's type: TDSR/DMS, Final Disposal, Transfer Station, Other, or one the firm added ✅ *(ADR-190, 215)* | **picked**: the site types | ✓ | ✓ | |
| **Mileage** | The **road-route** miles from the collection's end to the site's own GPS (ADR-110, 208) | **typed**: a number, in tenths | ✓ | ✓ | |
| **Pay item** | The pay item a unit rate ticket carries: the one its band gives for the payable type the monitor picked, worked out again by the engine ✅ *(ADR-124, 207, 213)*. **A load or haul-out carries no pay item**, so it doesn't apply to them ✅ *(ADR-207, 221)* | **picked**: the project's pay items | | | ✓ |
| **Unit count** | The count (or hours, or pounds) | **typed**: a number | | | ✓ |
| **Measurement** | The measured size as a **diameter** in inches; a circumference the monitor recorded is converted (C ÷ 3.14, half up to a tenth) ✅ *(ADR-177)*; a stump is its diameter **two feet up**, never a circumference ✅ *(ADR-187, 189)*; the root ball's diameter is recorded too, for the fill, and is **not** this criterion; **no root-ball criteria** ✅ *(ADR-196, 198)* | **typed**: a number | | | ✓ |
| **Item** ✅ *(ADR-128)* | One item's count on an itemised ticket, e.g. *Fridge, freon recovered* | **picked**: the kind of work's item names (the count compared is **typed**) | | | ✓ |

For crew time, *Unit count* reads the **highest item's hours**; for white goods, the **total of the
items** (ADR-126).

✅ **Round 13 (user, 2026-09-27):**
- **No *Load call* criterion** (ADR-164): load-call limits are a project setting (flag ≤ 5% and
  ≥ 95% by default, changeable or off), so no rule has to test or ignore them.
- **Split loads** (ADR-162): rules run **once per property**, on its share: its own zone, address and
  mileage; the load's cert, disposal and load call; *Volume* = its share.
- **Split haul-outs** (ADR-295): rules run **once per pile**, on its share: its own debris type and
  field tag; the haul-out's cert, from site and disposal; *Volume* and *Weight* = its share.

### 4a. Operators — ✅ (ADR-125, Q-119)

The legacy editor showed **EQUALS, NOT EQUALS, BETWEEN**. The approved set, by kind of value:

| Kind of value | Criteria | Operators |
|---|---|---|
| **A pick from a list** | contractor, debris type, field tag, zone, disposal site, from site, disposal site type, pay item, item | EQUALS · NOT EQUALS · **IS ONE OF** · **IS NOT ONE OF** |
| **A number** | weight, volume, mileage, unit count, measurement, an item's count | EQUALS · NOT EQUALS · BETWEEN · **AT LEAST** (≥) · **AT MOST** (≤) · **MORE THAN** (>) · **LESS THAN** (<) |
| **A date** | ticket date | ON · NOT ON · BETWEEN · **ON OR BEFORE** · **ON OR AFTER** |
| **Text** | collection address | EQUALS · NOT EQUALS · **CONTAINS** · **STARTS WITH** |
| **Any** | all | **IS EMPTY** · **IS NOT EMPTY** |

*Item* is in two rows because its value is both: **one picked item, and a number compared with its
count** (*Item "Fridge, freon recovered" AT LEAST 1*). As built it takes the number operators, and
IS EMPTY / IS NOT EMPTY for "the ticket lists none / some of this item"; the list operators aren't
taken on *Item*, since one operator can't mean both "is this item" and "its count equals" *(agent
default, ADR-313; the user may overturn it)*.

"IS ONE OF" saves writing the same rule several times (e.g. *Disposal site IS ONE OF Marsh Road
TDSR, Bayline Transfer Station*).

- **BETWEEN includes both ends** (`Mileage BETWEEN 0 and 15` matches 15.0). When two rules' ranges
  overlap on the same transaction # (0–15 and 15–30 both creating #1), the builder **warns**; it
  never refuses the save. At run time a ticket caught by both is flagged (§6.4).
  *As built (agent default, ADR-313):* the warning is given when two rules of one form, naming the
  same contract, add the same # and nothing in their criteria keeps them apart; it names where a
  shared range overlaps ("their Mileage ranges overlap at 15.0"), or says "a ticket could meet
  both" where no range is involved.
- **An exact duplicate of a rule is refused before it is saved** ✅ *(user, 2026-10-02; ADR-301)*,
  with an error naming the rule it copies ("Not saved: this rule is the same as "VEG-HAUL-CY-15 -
  ROW VEG haul 0–15 mi"."), so nobody goes on building from it. Two rules are the same when they are
  on the same form, name the same contract (or both none) and have the same criteria and the same
  actions, in any order; **the rule's name and its Active tick are ignored**, and it is compared with
  every rule of the project that isn't archived, inactive ones included. An edit that would turn a
  rule into a copy of another is refused the same way. *(The details are an agent default.)*
- **A line that compares with something the ticket doesn't have never passes, however it is
  worded** ✅ *(user, 2026-10-05; ADR-354)*. On a collection with no GPS fix there is no mileage and
  no zone: neither *Mileage AT MOST 15.0* nor *Zone NOT EQUALS Zone 1* passes on it; only *IS EMPTY*
  does (and *IS NOT EMPTY* doesn't). Nothing is priced on a guess: with no rule adding a line the
  ticket is flagged "no pricing rule…" until it is corrected.
- *As built (agent defaults, ADR-354):* text is compared without regard to capitals or to spaces at
  either end; a number is compared by its exact value (*Volume EQUALS 14.4* meets 14.40), mileage
  alone rounded first; *Contractor* reads the prime, so a line that picks a sub finds no ticket;
  *Zone* reads the name the zone had on the map version the ticket was placed with; *Unit count* on
  any itemised ticket other than crew time is the total of its items; *Item* on a ticket that isn't
  itemised is empty.
- **Mileage is rounded half up to tenths of a mile** before any rule compares it (15.04 → 15.0,
  15.05 → 15.1). The unrounded distance is stored too. The rounding lives in one place (the shared
  domain package), so Show matches and the engine always agree.

## 5. Actions ✅ (ADR-118)

Each action is one line; a rule can carry several.

| Action | Fields | Example as shown |
|---|---|---|
| **Add transaction** | **#** (the slot: 1, 2, 3…), **pay item**; the contract is the rule's *(ADR-239; "Ticket Contract" was only the legacy label for that field, ADR-174)* | `Add transaction 1, pay item = HNG-RMV-EA` |
| **Remove transaction** | **#** | `Remove transaction 2` (e.g. no tipping fee on a load the contract exempts) |
| **Void ticket** | none; the rule is the reason | `Void ticket` |

The **#** is the transaction's slot on the ticket, so one load can carry transaction 1 (hauling), 2
(tipping fee), 3 (another line the contract pays). The slot, not a fee label, keeps them apart; the
payable type groups them in exports (ADR-118, 246).

✅ **No *Flag* action** (ADR-164): project-wide settings raise flags, not rules. **A rule's Void
ticket always wins** (ADR-167): a person's unvoid lasts until the next reprocess unless the data or
the rule is changed. **Contracts** are a name, a prime and a link (ADR-146); **a rule names one** and
runs only on tickets of its prime, so each prime still gets its own rules (ADR-239). **A pay item's
code is unique on its project** (ADR-301, correcting ADR-147); a dated rate change is the firm's own
setup, e.g. a second pay item with a code the firm chooses (say `VEG-HAUL-CY-15-B`) and *Ticket date
ON OR AFTER 15 Oct* on its rule, *ON OR BEFORE 14 Oct* on the old one; two creates of the same #
stay flagged.

✅ **A stump ticket's fill** (ADR-198, ADR-203) is an ordinary rule with no root-ball criteria:
*Pay item = the stump pay item* → `Add transaction 2`, the fill pay item (`STP-FILL-CY`), quantity
from **the fill CY**. A stump ticket with no root-ball diameter has no fill CY, so no line is
created. **A contract's per-CY and per-ton prices** are simply two pay items; the firm's rules pick
which one a load bills at (ADR-202).

✅ ***Quantity from*** *(ADR-128)* on *Add transaction* for itemised unit rate tickets: **all
items** (the default) or **chosen items**. The rules, never a setting on the item, say which items
count toward which pay item. Example, white goods with freon (ADR-126, 128): *Add transaction 1,
WG-RMV-EA*, from **every white good removed** (the hauler is paid per item removed, not by type,
ADR-131, 132); a fridge with freon left **staged** gets no `WG-RMV-EA`, only `WG-FRN-EA-STG`, and
gets `WG-RMV-EA` + `WG-FRN-EA` when it's removed later (not double billing); *Item "Fridge, freon
recovered" AT LEAST 1* → *Add transaction 2, WG-FRN-EA*, from that item; *Item "Fridge, freon
staged" AT LEAST 1* → *Add transaction 3, WG-FRN-EA-STG*, from that item.

✅ **A pay item with no rate is a $0 pay item** *(ADR-128)*: `WG-FRN-EA-STG` (freon staged) writes
"WG-FRN-EA-STG × 2 = $0.00", so staged items show in the ledger and can be traced. It is not TBN ("a
price is coming").

## 6. How the engine applies rules to a ticket ✅

When a ticket is reconciled or reprocessed (ADR-086, 090):

1. Take every **active, valid** rule of the ticket's form **whose contract's prime is the ticket's
   prime** (from its certification), plus the form's rules with no contract (ADR-239).
2. Keep those whose **every criterion** holds. Mileage, the zone and the quantity are already
   attached (ADR-110).
3. **Creates run in slot order** ✅ *(ADR-130, ADR-131)*: each matching rule's *Add transaction #n*
   fills slot #n, **#1 first, then #2…**. The same ticket and rules always give the same
   transactions, however many times it runs (no flip-flopping); the order rules were written in never
   matters. The engine finds **all** rules that pass on the ticket, creates in # order, then applies
   every **remove**, then any **void**. A rule's criteria read only the ticket, never another rule's
   transaction. The # order is also the line order, as on an invoice.
4. **Two rules creating the same #** on one ticket → neither is billed, and the ticket is flagged:
   "Ticket 301009: two rules create transaction 1 (LNR-RMV-EA-24, LNR-RMV-EA-99). Flagged for review."
5. **No rule creates anything** → flagged, naming the prime: "Ticket 101010: no pricing rule on a
   Summit contract matches. Flagged for review." (ADR-239)
6. Each created transaction: quantity from the pay item's Unit of Measure (`adms-validation` §5.5),
   × the pay item's rate for the rule's contract's prime (a $0 line, flagged, where that prime has
   none); it belongs to the rule's contract and records the prime and the operating sub (ADR-081,
   212).
7. The ticket's transactions are **regenerated**: old ones copied in full to the audit log first
   (ADR-085). Tickets **locked as invoiced** are never touched (ADR-090).
8. **Void ticket** voids the ticket, with the rule named as the reason; audited under the system
   (ADR-118). Unvoiding stays a person's audited action.
9. A split runs steps 2–7 **once per property**, on its share (ADR-162); a split haul-out **once per
   pile** (ADR-295). **A haul-out dumped at a
   TDSR** skips the rules until corrected (ADR-226).

**As built (task 1.6.3, ADR-355).** ✅ *The user, 2026-10-05:* **an amount is rounded to the cent a
half up** (9.75 h × $151.25 = $1,474.6875 → $1,474.69), and it is the quantity as the line keeps it
(four decimals) × the rate, so anyone can check a line by hand; **a crew day by exact division keeps
four decimals** (10.25 h ÷ 12 = 0.8542; × $1,800.00 = $1,537.56); **hours that fall in no step** of
a crew day paid in steps **bill nothing on that line, and the ticket is flagged** until the firm
fixes the steps or the hours. *Agent defaults the user may overturn:*
- A ticket under a flag that says "not billed" (a 0% call, no certification, no size band, piles
  that can't be shared out) gets no lines until it is corrected (`spec/FLAGS.md` §1), and no pricing
  flag joins the one it has; a rule's *Void ticket* still runs on it. A haul-out dumped at a TDSR
  skips every rule.
- Two creates of one # stop that # only: the ticket's other lines bill. Three are one flag.
- A *Remove transaction* of a # nothing added does nothing. A tipping fee a rule added and another
  removed is not "a missing rule"; a ticket whose only line was removed has no lines and no flag.
- A pay item with no rate for any prime is a $0 pay item and raises nothing; "no rate for Summit" is
  raised only where the pay item holds another prime's rate.
- A TBN pay item writes no line; its flag keeps the # and the pay item.
- *Quantity from* chosen items: their counts added up; on crew time, the highest of their hours.
- A rule's void voids the whole ticket, a split included, and names every rule whose void ran.

## 7. "Is valid" *(agent default, ADR-247)*

A rule is **valid** when:
- it has a form, a name, at least one criterion and at least one action;
- every criterion applies to that form and its value still exists (not archived);
- a rule with an *Add transaction* names a contract (ADR-239), and every *Add transaction* has a #
  and a pay item;
- every *Remove transaction* names a #;
- its form, its contract and every pay item it adds are still on the project (not archived): a rule
  left naming an archived one stops running until it is put back or the rule is changed (*agent
  default*, ADR-357).

An invalid rule can be saved but never runs; the builder says why, and **the setup check lists every
invalid active rule** before the field day, so none is silently inert (ADR-229; `adms-validation`
§5.3a). Only **Active + Valid** rules run.

## 8. Show matches and Reprocess ✅ (ADR-090, ADR-109)

- **Show matches**: how many tickets the rule matches now, and how many transactions would change
  on **un-invoiced** tickets if it were applied. Locked tickets are counted separately and never
  changed.
- **Reprocess**: runs the change, regenerating the affected un-invoiced tickets' transactions.
- Every rule change is audited (who, before, after), and every rule or pay item change shows what it
  would change first (ADR-229).

## 9. Worked examples

On project P1 (the golden mission, `spec/golden/MISSION.md` §1), every rule naming the contract
"Coastline, Bayline ROW 2026":

| # | Form | Criteria | Actions |
|---|---|---|---|
| 1 | Unit rate | Pay item EQUALS HNG-RMV-EA | Add transaction 1, pay item = HNG-RMV-EA *(the legacy screenshot's rule, without its now-redundant Contractor line, ADR-239)* |
| 2 | Load | Debris type EQUALS Vegetative · Mileage AT MOST 15.0 | Add transaction 1, pay item = VEG-HAUL-CY-15 |
| 3 | Load | Disposal site EQUALS Bayline County Landfill | Add transaction 2, pay item = TIP-FEE-CY-BCL (the site's tipping fee, ADR-222) |
| 4 | Load | Disposal site EQUALS Bayline County Landfill · Debris type EQUALS C&D · Ticket date ON OR AFTER 1 Dec | Remove transaction 2 (an illustration: a fee the contract stops paying from a date) |
| 5 | Unit rate | Pay item EQUALS WG-RMV-EA | Add transaction 1, pay item = WG-RMV-EA, *Quantity from* = chosen items: every item **except** "Fridge, freon staged" |
| 6 | Unit rate | Pay item EQUALS WG-RMV-EA · Item "Fridge, freon recovered" AT LEAST 1 | Add transaction 2, pay item = WG-FRN-EA, *Quantity from* = that item |
| 7 | Unit rate | Pay item EQUALS WG-RMV-EA · Item "Fridge, freon staged" AT LEAST 1 | Add transaction 3, pay item = WG-FRN-EA-STG ($0), *Quantity from* = that item |

(Codes follow the suggested convention, `spec/CONVENTIONS.md` §5; each firm may name its own.) With
a second prime (Summit), Summit gets its own rules naming "Summit, Bayline ROW 2026"; the contract
implies the prime, so no *Contractor* line is needed, and the pay items aren't copied: one pay item
holds each prime's rate (ADR-206, 239).

**Rules 5–7 on the white goods example** ✅ *(ADR-128, ADR-131, ADR-132)*, at the golden mission's
rates. The hauler is paid per white good removed; freon recovery is its own billing item; staged
freon is a $0 line.

| Ticket | Items recorded | #1 `WG-RMV-EA` $40 | #2 `WG-FRN-EA` $25 | #3 `WG-FRN-EA-STG` $0 | Total |
|---|---|---|---|---|---|
| A (the mission's 301006) | Washer 2 · Dryer 1 · Fridge, freon recovered 2 · Fridge, no freon 1 | × 6 = $240 | × 2 = $50 | — | $290 |
| B | Washer 2 · Dryer 1 · Fridge, no freon 1 · Fridge, freon staged 2 | × 4 = $160 | — | × 2 = $0 | $160 |

When B's two staged fridges are removed later, that later work bills `WG-RMV-EA × 2` and
`WG-FRN-EA × 2` (as extra transactions or its own ticket, per project, ADR-126): separate work, not
double billing (ADR-131).

## 10. Open

None (ADR-230). §7 was an agent default; it was approved with the page (ADR-269).
