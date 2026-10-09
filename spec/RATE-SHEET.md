# Open ADMS — Setting up a real rate sheet

✅ **Approved**

> **Approved by the user 2026-09-29 (ADR-269); agent-written (ADR-196), in today's rules (truth-up 2026-09-29, ADR-247).** It walks one
> real prime contractor rate sheet line by line, as a firm setting up a project would, and says for
> each line how Open ADMS handles it: the pay items, the field events it comes from, the rules.
> Nothing here is a new rule. **The firm's setup decides how things play out** (ADR-197): this page
> shows one firm's setup of one contract, not rules Open ADMS imposes. The rules are in
> `spec/RULES.md` and the skills (`adms-ledger-audit`, `adms-ticket-workflows`), which win on
> disagreement. Names follow `spec/CONVENTIONS.md`.

**The sheet:** a real county's agreement with its prime hauler, Exhibit 3, Rate Schedule (it was
filed as `development/Prime Contractor Rate Sheet Example.pdf`, since removed from the repository).
**Read here as the example world's contract** "Coastline, Bayline ROW 2026": Bayline County and its
prime, Coastline Haulers (`spec/CONVENTIONS.md` §6). **The prices are the real sheet's**; the golden
mission uses its own placeholder rates. The equipment rates that follow the sheet are billed by the
prime outside Open ADMS and aren't set up.

## How a firm reads any rate sheet into Open ADMS

1. **One project per funder or kind of work** (ADR-148). The sheet's curbside lines go on the ROW
   project (P1); its "Right of Entry personal property" lines on a separate PPDR project (P2) with
   ROEs.
2. **Each priced line becomes a pay item**: a code (the suggested convention gives `VEG-HAUL-CY-15`,
   `spec/CONVENTIONS.md` §5), a name, a **payable type** (the work), the line's number and words in
   the **description**, a **Unit of Measure**, and **Coastline's rate** (a second prime's rate goes on
   the same pay item, never a copy) (ADR-206, 207, 235).
3. **The monitor never sees a pay item on a load**: they pick the **debris type** (Vegetative, C&D,
   Mulch…) by name, and on unit rate work the **payable type** (Leaners, Stumps…) by name
   (ADR-207, 213).
4. **Rules** pick the pay item from what the ticket already knows: debris type, mileage, the site,
   the measurement, the items. One rule per band or class, each naming the contract, with *Add
   transaction #n*; the # is the slot: 1 hauling, 2 the site's fee, and so on (ADR-118, 131, 239).
   The pay item screen's "Pays when" writes most of them (ADR-229).
5. **A ticket no rule prices is flagged** ("Ticket 101010: no pricing rule on a Coastline contract
   matches."), so a gap in the contract's bands shows on the first ticket that falls in it (ADR-239).
6. **A mileage band in the contract isn't always a *Mileage* criterion.** **User (their own wording,
   written into this page):** "Ask what actually varies ticket to ticket when you are not
   100% clear about the breakdown. E.G., a haul-out collection load travels to diposal site:
   FDS-Endall which is outside the project boundary and county lines. A firm would know this in
   advance and setup a rule to match tickets to that site, and in the rule the firm would simply
   uncheck the mileage"

## The sheet, line by line

### Vegetative debris

| Lines | What it pays | How it's set up | Example |
|---|---|---|---|
| 1–5 | Curbside pickup, haul to the TDSR, by haul distance: 0–15, 16–30, 31–60, 61–90, 91–120 miles. $8.85–$14.00 per CY, or $88–$140 per ton | **Loads** (collection → disposal). Five pay items `VEG-HAUL-CY-15`…`VEG-HAUL-CY-120` (payable type Vegetative, `CY`); five rules: *Debris type = Vegetative* and a *Mileage* range → *Add transaction 1*. The per-ton prices are five more pay items (`VEG-HAUL-TN-15`…, `TN`), entered only if the firm will use them; **its rules pick** which one a load bills at, e.g. by *Disposal site* where a site weighs. Where every rule that could pay a load at a site is per ton, that site's tower asks for the **scale weight instead of a load call** (ADR-202, 223, 227) | Truck `730416`, 48 CY, called 75% = 36.0 CY, 12.3 road miles → `VEG-HAUL-CY-15` 36.0 × $8.85 = **$318.60**. The same load weighed at 3.6 tons: `VEG-HAUL-TN-15` 3.6 × $88 = **$316.80** |
| 6–10 | The same from ROE private property, $14–$24 per CY | The same five rules on the **PPDR project**, where every collection carries its ROE (ADR-148, 149) | |
| 11 | Chipping and grinding plus site management, "based on incoming yardage", $4.25 per CY | A fee on **each load dumped at the grinding TDSR**: *Disposal site = Marsh Road TDSR* → *Add transaction 2* `VEG-RDC-CY`, quantity the load's CY | The load above at the TDSR: 36.0 × $4.25 = **$153.00** |
| 12–14 | Loading and hauling **mulch** to a final site **inside** the county, by miles, "based on reduced material outgoing" | **Haul-outs** (TDSR → final site), load call at the TDSR (ADR-013). "Mulch" is a debris type on the haul-out form, marked *Reduced* (ADR-214). Rules: *Debris type = Mulch*, *Disposal site IS ONE OF* the in-county sites, a *Mileage* range → #1 | |
| 15 | Mulch to a site **outside** the county, flat $9.00 | *Debris type = Mulch*, *Disposal site IS NOT ONE OF* the in-county sites → #1 `MULCH-HO-CY-OUT`, no *Mileage* (step 6) | |
| 16 | Reduction by **incineration**, on incoming yardage, $3.50 | Like line 11, at the burn site: *Disposal site = the burn TDSR* → #2 | |
| 17–24 | Hauling **ash** in and out of the county | "Ash" is a debris type on the haul-out form (ADR-214). Unlike mulch, the sheet bands **both** in and out of the county **by miles**, out of county at the in-county prices, so the rules are *Debris type = Ash* and a *Mileage* range → #1, with no in/out split | |

### Clean C&D

| Lines | What it pays | How it's set up |
|---|---|---|
| 1–5 | Curbside C&D to the TDSR by miles, $8.85–$14.00 | Like vegetative 1–5, with *Debris type = C&D* (`CD-HAUL-CY-15`…) |
| 6 | Grinding C&D and site management, $4.50 | Like vegetative 11 |
| 7–10 | Ground C&D out to final disposal, in and out of the county | Like vegetative 12–15 |

The sheet's own slips don't matter to the setup: the C&D lines say "Miles" as the unit where the
price is per CY or ton, and line 3 reads "31-30 miles". The firm types each pay item's real Unit of
Measure.

### White goods

| Lines | What it pays | How it's set up |
|---|---|---|
| 1 | Pickup and transport to the TDSR, $40 each | **Unit rate**, kind of work White Goods: *Add transaction 1* `WG-RMV-EA`, quantity from **every white good removed** (ADR-126, 131) |
| 2–7 | Pickup and transport to the county **transfer station** ($40 each), or to a white goods site **outside the county** by miles ($50–$95 each) | **The white goods ride a load** (rare): the unit rate ticket at the curb (freon recovery when needed), then a **collection event** when they're loaded, with the white goods ticket added **by its number**; "White Goods" is a debris type the firm adds. The load's pay item takes its quantity **from the tickets it carries**, so the tower counts the items instead of calling the load; a rule by *Disposal site* and *Mileage* picks the band. The items are **paid once, on the load**: six fridges 40 miles away, `WG-HAUL-EA-60` 6 × $65 = **$390**, not $40 at the curb plus $65; the curb ticket's own lines (freon) are the firm's rules (ADR-204, 215, 243) |
| 8 | Refrigerant recovery, $40 per unit | Freon as its own pay item (`WG-FRN-EA`), from the item list or its own ticket, as the project is set up (ADR-126, 131) |

### Demolition

| Lines | What it pays | How it's set up |
|---|---|---|
| 1–5 | Demolish and secure, site only, **per square foot**, by one or two stories, frame or block, plus a rate per story from the third up | **Ordinary debris work** (ADR-200): the structure's debris is removed and billed **by the CY** like any loads, on a project the firm names to match the contract. No demolition kind of work, no square-foot unit |

### Tree and stump removal

| Lines | What it pays | How it's set up |
|---|---|---|
| A 1–4 … F 21–24 | Storm-damaged **tree removal** by diameter class (over 6 to 12 in, 12–23, 24–48, 48 and up), for six methods: A climbing, B mechanised, C uprooted in the open, D snapped with debris, E snapped with the crown gone and 10 ft of trunk, F with a crane. $150–$1,800 each | **Unit rate.** Each method is a **payable type** the firm adds ("Tree, climbing"…), so the monitor picks the method by name and measures; **the size band picks the pay item**, e.g. `TREE-CLIMB-EA-48` for 24–48 in, worked out by the phone and again by the engine. The monitor never picks a size class. The diameter is at chest height, measured or from the circumference (ADR-177, 213, 217) |
| G 25–28 | Trimming hanging limbs "no less than 2 in", by diameter class | The same, payable type Hangers |
| H 29–32 | **Stump removal** by diameter class: $90, $150, $300, $450 each | **Stump ticket**, one per stump: unit rate, kind of work **Stumps** (ADR-198): the diameter two feet up (the band picks the pay item, 1 each), the root ball's diameter and "half or more exposed" |
| I 33 | **Fill** after stump removal, $24 per CY | #2 on the same stump ticket, quantity from the **fill CY** = the root ball as a cylinder 31 in deep, half up to a tenth: 96 in → 4.8 CY × $24 = **$115.20**. The rule: *Pay item = the stump pay item* → #2 `STP-FILL-CY`; no root ball, no fill line. Two built-in checks, per project, on by default (ADR-198, 203) |
| — | **Hauling the stumps** to the TDSR (no line of its own) | A **load of stumps**, its pay item's quantity **from the tickets it carries** (each stump's CY to a tenth, added), priced by vegetative lines 1–5 by miles, since this contract pays hauling separately. Three stumps, 24.6 CY, 0–15 miles: 24.6 × $8.85 = **$217.71**. A contract whose per-stump price covers transport would use a $0 pay item (ADR-192, 199) |
| J 34 | Palm tree removal, $150 each | Unit rate, a payable type the firm adds ("Palms"), `EA` |
| K 35 | Fallen wooden light or utility poles, $600 each | Unit rate, a payable type the firm adds ("Poles"), `EA` |

**Notes on the tree lines.**
- **The contract's classes overlap and leave a gap**: 12 in sits in two classes, 48 in in two, and
  23.1–23.9 in in none. **Bands in one payable type can't overlap** (setup refuses) and **a gap
  warns** (ADR-217), so the firm writes them as half-open bands (over 6 to 12, over 12 to 24, over
  24 to 48, over 48). A tree measured at 74 in around, 74 ÷ 3.14 = **23.6 in**, then falls in the
  second band. A measurement in no band is saved with no pay item, flagged (ADR-213).
- **Stumps under 24 in.** Lines 29–30 pay for stumps from 6 in. FEMA pays per stump only from 24 in
  measured two feet up, so such a ticket is **flagged** "not an eligible stump (under 24 in)" and
  still **bills** by the contract; the firm accepts the flag or voids by rule (ADR-052, 060, 166, 187).

## What the sheet says about configuration

The whole sheet is covered by three things working together: **what the field events record**
(debris type, mileage, the site, a measurement, items), **pay items the firm names**, and **rules
that choose among them**. Mileage bands, site fees, in and out of county, size classes and each
prime's rates all come from setup, with no new setting.

**Read a rate sheet as the choices the contract allows** (ADR-202): per CY or per ton, in or out of
county, by miles. The firm enters the prices it will use as pay items and its rules pick among
them; Open ADMS never decides which price a contract means.

*Refs:* ADR-013, 052, 118, 131, 148, 177, 196…206, 213, 214, 217, 223, 227, 229, 239; `spec/RULES.md`
§4–§5.
