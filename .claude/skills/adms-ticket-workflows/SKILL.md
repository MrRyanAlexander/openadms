---
name: adms-ticket-workflows
description: Open ADMS ticket workflows and the setup spine, in today's rules. Covers what must exist before any field event (client, declaration event, project, contracts, forms and debris types, pay items, sites, rules, certifications, ROEs), ticket numbers, a ticket's life and statuses, how every capture starts (badge first, number last), Workflow A loads (collection and disposal events to the completed load, split loads, loads that carry tickets), Workflow B haul-outs, Workflow C unit rate (hangers, leaners, stumps and fill, white goods, HHW, crew time), Workflow D forms (ROE, surveys, incidents, citizen drop-off logs), and the order of a reconciliation run. Use when creating, matching or reconciling tickets, or when setting up a project, contract, pay item, site or ROE. Checks and flags live in adms-validation, pricing in adms-ledger-audit, duplicates and corrections in adms-exceptions, phone screens in adms-field-app.
---
<!-- skill-status: current (ADR-138, rewritten 2026-09-29, ADR-242; the tower's lookup, ADR-243; an ROE's scope, ADR-293; split haul-outs, ADR-295; a pay item's unique code and description, a duplicate rule refused, ADR-301; a contractor's contact details, ADR-306) -->

> **This page states today's rules** (last changed by ADR-306, as its status line lists). Each rule cites its ADR; what changed is in
> the History list at the end. The user's own words are quoted and marked **User**. If this page and
> `agent_store/SUMMARY.md` disagree, SUMMARY wins: log a KD (`adms-decisions`). The worked example
> is `spec/golden/MISSION.md`; names and examples follow `spec/CONVENTIONS.md`. The words (field
> event, ticket, completed load, pay item, payable type, debris type) are defined once, in
> `adms-domain` Part 2.

# PART 4 — HOW WORK BECOMES RECORDS

A ticket is **its number and the field events recorded under it** (ADR-236). Four workflows exist;
know which one you are touching. The first three are fixed in code as their events:

| Workflow | Field events, in field order | Makes the number | Takes the quantity | The worker concludes |
|---|---|---|---|---|
| **A. Load** (§4.2) | collection `COL` → disposal `DIS` (a split: one `COL` per property) | the collection | the disposal: a load call, a scale weight, or a count of the tickets it carries | the completed load `CLT` |
| **B. Haul-out** (§4.4) | haul-out collection `HOC` at the TDSR → haul-out disposal `HOD` at the final site (a split: one `HOC` per pile, §4.4a) | the haul-out collection | the haul-out collection's load call (a scale weight at the disposal when it is paid by weight) | the completed haul-out `CHO` |
| **C. Unit rate** (§4.5) | one unit rate event `URT`, complete on its own | the unit rate event | its own count, measurement or hours | its transactions |
| **D. Forms** (§4.6) | none: ROEs, surveys, incidents and drop-off logs are records, not a ticket's events | their own number where they have one | nothing: never priced | nothing |

**The events are the evidence; everything else is drawn from them**, by the worker, again on every
reprocess (`adms-domain` §1.2, invariant 21). This page owns the setup spine, numbers, how each
capture starts and what each field event records. **Elsewhere:** every check and flag, statuses and the
quantity math (`adms-validation`); pricing, rules and the ledger (`adms-ledger-audit`,
`spec/RULES.md`); duplicates, renumber, void and corrections (`adms-exceptions`); phone screens,
enrolment and sign-in (`adms-field-app`); certifications (`adms-certifications`); scale receipts
(`adms-scale-receipts`).

## 4.0 Setup must happen before any field event

**User, 2026-09-28 (Q-193):** "Create a project, name things in ways the match the contract and
document the work. QC it up and done." The firm's setup decides how work plays out; before adding
anything new, check whether projects, names, pay items, rules and lists already express it
(ADR-197).

### The ordered spine: each step needs the one above

```
1. CLIENT             who is paying (Bayline County). Created once, reused across
                      disasters, edited freely, archived, never deleted (ADR-023)
2. DECLARATION EVENT  what happened (Hurricane Delphine, DR-9001-FL, or a state or
                      local declaration). One shared record; many clients' projects
                      point at it (ADR-023, 026)
3. PROJECT            one body of work for one client under one declaration event;
                      a separate project per funder or kind of work (ADR-148)
```

**A project holds** (ADR references in brackets):
- a **program type** from the firm's list (ROW, PARKS, PPDR, WATERWAY…), each with "requires ROE"
  [070]; **Allow split loads**, ticked by default where the program type requires ROEs [137];
- its **time zone** [100] and **active window**, judged by a load's time (its collection's end)
  [057, 161];
- its **ticket-number source**, control tickets or generated (§4.0a) [056];
- its **project map**: a boundary and optional zones, uploaded or linked as dated map versions [135,
  141]; the site circle size (default 200 m) in its GIS settings [136, 142];
- **project settings** the firm may change or switch off: the load-call limits (at or under 5%, at
  or over 95%; 0% is always flagged) [164, 181]; the stump fill depth (31 in) and the two stump
  checks [203];
- the **ticket types and kinds of unit rate work** it allows [041, 127].

### Then, in any order: all before the first field event, none needs the others

| Setup record | What it holds | ADRs |
|---|---|---|
| **Contractors → contracts** | Primes and their subs (at most two tiers; subs typed in at certification). A contractor holds its name, its kind and **contact details** (a contact name, email and phone, each optional; the user, ADR-306). A **contract** is a name, its prime and an optional link to the signed copy; the contractor is added to the project first | 081, 108, 146, 305, 306 |
| **Forms and debris types** | A form per document type (load, haul-out, unit rate ticket, truck certificate…). **Debris types are added to a form, named as the contract names the work** (Mulch and Ash are two debris types on the haul-out form), each with *Reduced*, a reduction method (firm list) and *Hidden on phones* (off the phone's list; tickets that have it keep it) | 211, 214 |
| **Field tags** | A project list the firm fills, starting empty (e.g. Mixed); read only by the *Field tag* criterion and exports | 216, 218 |
| **Payable types and pay items** | A **pay item** is a priced line: code (setup suggests one, `VEG-HAUL-CY-15`; **unique on its project**, ADR-301), description (what the work is, in the firm's own words), **payable type** (the work, from a firm list), Unit of Measure, size band, capture settings ("Count is always 1", "GPS required", "Measurement required", "Decimals allowed", photos required, "Monitor may mark ineligible", "quantity from the tickets it carries") and **a rate for each prime**. A unit rate pay item also names its **kind of work** (§4.5c). The only place a rate lives | 206, 207, 210, 213, 221, 223, 235 |
| **Disposal sites** | Entered on each project that uses it. A **site type** (TDSR/DMS · Final Disposal · Transfer Station · Other) plus facts: **Takes loads**, **Haul-outs leave here**, **Charges a tipping fee**, **Ineligible site**; the firm's own labels. A permit, its GPS, an area (the project's circle or its own shape), an activation date and an optional close date. Ticking *Charges a tipping fee* leads the firm to write the site's **tipping fee pay item** (rate per prime) and its rule (*Add transaction #2*); the site keeps the link | 111, 136, 145, 173, 194, 215, 222 |
| **Rules** | Per form. A rule **names one contract** and runs only on its prime's tickets; criteria read only the ticket; actions *Add transaction #n* (a pay item), *Remove transaction #n*, *Void ticket*. The pay item screen's "Pays when" writes and keeps most of them. **An exact copy of a rule** (same form, contract, criteria and actions, whatever its name) **is refused before it is saved**, with an error naming the rule it copies. Detail: `adms-ledger-audit`, `spec/RULES.md` | 109, 118, 130, 131, 229, 239, 301 |
| **Certifications** | A container or a crew, never a vehicle; cert number = placard = badge. Made on a phone set up for certifying (`adms-certifications`) | 015, 045, 151, 228 |
| **ROEs** | Where the program type requires them; made in the back office or on a phone (§4.6) | 149 |
| **Other lists** | Incident types and sub-types (sub-types start empty), reasons (void, typed number, accepting a flag, a back-office-created record), firm-added fields on surveys, ROE forms, incidents and drop-off logs | 137, 160, 173 |

**Reuse:** a firm **library** (debris types, pay items with payable types and units, incident types,
reasons) plus **"copy from a past project"** (ADR-228). **A setup check** lists gaps before the
field day (a tipping fee site with no fee pay item, a debris type no rule pays, a prime with no
rate, overlapping bands), and every rule or pay item change shows what it would change first
(ADR-229). Setup may refuse a bad setting (overlapping bands, ADR-217; a pay item code the project
already has, an exact copy of a rule, ADR-301); **after setup nothing refuses field work** (ADR-052).

**Then dispatch.** A phone is **enrolled** once; the back office's **dispatch board** gives each
person the day's **assignment**: one project, their work (ticket types, unit rate pay items,
certifying), one site where the work is at one. The phone takes it at sign-in, with the project's
lists; unassigned, the master passcode sets it up on the spot, recorded as an *unplanned assignment*
(ADR-240; the phone side is `adms-field-app` §4A.0). What a phone holds for the work: the unit rate
pay items and their settings for unit rate work (ADR-176, 213); **no pay items for a load's phones**
(ADR-223), only the lookup of what its assigned site asks for (§4.2, ADR-227, 243).

## 4.0a Ticket numbers

- **Bare numbers**, in a **per-project series per workflow** (load, haul-out, unit rate), from
  100,001 to 9,999,999; unique per project within a workflow, so a load and a haul-out may both be
  101,001 (ADR-046, 062). No prefix, no check digit, no meaning parsed from a number (ADR-114).
- **Labels are display only**: `COL` `DIS` `CLT` `HOC` `HOD` `CHO` `URT`, taken from the record,
  never stored in the number; the barcode encodes the bare number (ADR-062).
- **Control tickets**: pre-printed barcoded stock; the ranges are entered at setup and sent to the
  phones. **Generated**: each numbering phone takes a **1,000-number block** of the series, issues it
  in order offline, is topped up at sync; a reset reclaims the unused rest; a lost phone's block is
  retired. Disposal phones issue nothing. Gaps are normal (ADR-056, 065). Unit rate tickets are
  always generated (ADR-056). **Built (ADR-323):** a project has a series per workflow, one for its
  cert numbers once seeded and one for its ROEs (`ProjectNumberSeries`); the rest a reset phone
  hands back is cut again for the next phone, once, and the database refuses any block that would
  put one number on two phones; a control-ticket project has ranges for its loads and haul-outs
  (two of one series never share a number) and only a unit rate series; block sizes are policy
  values (1,000 ticket numbers, 100 cert numbers, 100 ROE numbers); a phone-made ROE's number is
  written `R-0007` (agent default).
- **The truck carries the number** from the field event that makes it to the one that closes it; the
  driver carries one barcode, the base number, even on a split (ADR-032).
- A number **typed instead of scanned** is flagged and needs a reason from the firm's list (ADR-111,
  173). A split's suffixes are `-A`, `-B`…; the first is `-A`, never bare (ADR-173). A tandem's truck
  and trailer carry unrelated numbers (ADR-114).

## 4.1 A ticket's life and its statuses

```
 field events sync, any order, any day
            │
            ▼
   ┌─────────────────────┐   a field event missing: stays here, listed as pending,
   │       PENDING       │   never flagged, never expires (a preload is normal)
   └──────────┬──────────┘
              │ the worker (§4.7): checks, zone, mileage, quantity, rules
     nothing open │              │ a flag open
              ▼                  ▼
        COMPLETED          MANUAL_REVIEW  ── still bills if an amount can be computed
              ▲                  │
              └── fixed or accepted (with a reason), then reprocessed ──┘

 VOID: a person, with a reason, or a rule's Void ticket action; bills nothing
 Any correction, renumber, accepted flag or setup change reprocesses the ticket,
 COMPLETED ones included: the worker draws its conclusions again
```

- The four statuses are `PENDING · COMPLETED · MANUAL_REVIEW · VOID` (ADR-060, 118); what moves a
  ticket between them is `adms-validation`. **No age limit**: an unpartnered field event never
  expires (ADR-053).
- A unit rate ticket is complete with its one field event, so it goes straight to the worker.
- **QC status is separate** (QC Review → QC Approved / QC Issues / QC Void), set only by people, on
  the **completed load or haul-out, never a single field event**; unit rate tickets, forms and
  certifications are QC'd on their own. Only QC Approved tickets lock as invoiced (ADR-107, 121, 168;
  `adms-ledger-audit`).

## 4.1a How every capture starts

**Badge first, number last** (ADR-209), on every phone, for every workflow:

1. **New**: scan the **badge** (the crew badge for unit rate). The phone loads the certification:
   the container or crew, its prime and sub, its capacity. **Whose work it is comes from the
   certification, never from a pick** (ADR-186, 239). The field event opens and waits in the phone's
   open list while the truck loads. One truck has one open load at a time (ADR-027).
2. **Complete**: the details the workflow asks for (§4.2–§4.5). The monitor **picks by name, never a
   code or a rate**: a load's or haul-out's **debris type** from the form's list; a unit rate
   **payable type** after the crew photo (ADR-207, 213).
3. **The number**: the control ticket scanned, or a generated number shown at that same point, then
   **re-entered by hand** to confirm, generated numbers too. **User, 2026-09-28 (round 22):** "We'd
   want manual re-entry still on generated to confirm the logged it down correct." *Agent default:*
   the re-entry must match before the field event saves: data entry, not an eligibility check (ADR-209).
4. **Receipt**: printed on every project (the barcode is the bare number); receipts are never
   records (ADR-102, 115).

Around that:
- **Every start** follows "start → pick from a list → maybe a sub-list → details" (ADR-127):
  incidents pick a type, then a sub-type; surveys and ROEs pick the work type (Pre-work · Post-work ·
  ROE). "Normal or split?" is asked only where the project allows split loads (ADR-137).
- **The site comes from the assignment**, never picked: no start list shows sites. A curb collection
  has no site (ADR-195, 240).
- **Every field event records** its monitor, phone, assignment and the **setup version** of the lists
  it was captured with (ADR-240); the device clock's time (ADR-100); whatever GPS fix the phone has
  (ADR-083); photos, at most 8 per ticket (ADR-157, 181).
- **Sealed for the monitor once submitted on the phone** (ADR-477, the user): never reopened or
  edited by them, synced or not; corrected only by permitted people (ADR-051). Until submitted it
  stays open and theirs to adjust, for days where the work takes days. A monitor's own cancellation stays on the phone, unsynced (ADR-056).
- Screens and their order: `adms-field-app` §4A.5.

## 4.2 WORKFLOW A — Loads (`COL` → `DIS` → `CLT`)

The bread-and-butter workflow. Every load has a monitor at both ends; there are no unmonitored
disposal sites (ADR-156).

**The collection event (`COL`), at the curb, makes the number.** It records:
- the certification, from the badge;
- the start and end of loading: times, GPS (**Capture GPS**) and the address (**Look up address**
  when online, else the street number and name typed) (ADR-111);
- the **debris type**, picked on Complete from the load form's list (ADR-207, 211), and optionally a
  **field tag** (ADR-218);
- on an ROE project, the **ROE** (ADR-149); on a split, the property's **estimate** in CY (ADR-055);
- on a load that carries tickets, **the tickets it carries**, by number (§4.2b);
- photos.

It records **no load call** (the truck isn't finished being judged), **no zone** (the worker attaches
it from the GPS, ADR-135), **no site and no destination**: the hauler takes the debris where it goes,
and the system checks where it went, never where it was headed (ADR-205). **User, 2026-09-28
(Q-197):** "Neither side needs to say where the debris head heading and the system doesn't try to
guess ahead. The system simply verifies that the debris was allowed to go where it went".

**In transit, nothing is recorded.**

**The disposal event (`DIS`), at the tower, takes the quantity.** It records:
- the **site**, from the tower phone's assignment (ADR-195);
- the certification, from its own badge scan, and the **debris type**, picked on its own: the two
  events are compared, never copied (a difference is flagged, `adms-validation`);
- **one quantity, never both** (ADR-223, 227):
  - the **load call**, typed as a whole number 0–100 (ADR-116), for most loads;
  - the **scale weight** from the scale receipt, instead of a load call, where the site's lookup
    says the load is paid by weight (`adms-scale-receipts`);
  - for a load that carries tickets, **no call and no weight**: the tower counts (§4.2b);
- at a Final Disposal tower, the scale receipt number as an optional field (agent default, ADR-227);
- the end GPS, checked against the site's area; times; photos of the bed left empty.

The tower phone holds **no ticket list** and trusts the scan (ADR-071). A load turned away isn't
recorded; a load dumps once and has **one** disposal event (ADR-155).

**The tower phone knows what to ask for from its assignment** (ADR-227, 240, 243). The day's
assignment names the tower's project, its work and its **one site**; the phone's lists for that
assignment carry **that site's quantity lookup**, worked out ahead by the back office. For each
debris type on the form and each prime, the system reads the rules that could match at the site
(the site's tipping fee pay items left out) and the paying pay items' settings:
- all per ton or pound (their **Unit of Measure**) → **the scale weight**, instead of a load call;
- all take their quantity **from the tickets the load carries** → **a count** of the stumps or
  items on the truck (agent default, ADR-243);
- anything else (per CY, a mix, no rule) → **the load call**.

It is rebuilt whenever the rules or pay items change, never when tickets are processed, and it is
shown on the site's page. The phone asks once the badge has told it the prime and the monitor has
picked the debris type. **User, 2026-09-29 (Q-213):** "Doesn't it make more sense to follow the
prime or otherwise expect to have disposal phones setup such that they have info about what they
are selecting like collection and unit rate work?" A phone that hasn't refreshed asks from the
lookup it holds; the event records its setup version (ADR-240). After sync, a line whose pay item
needs a quantity the load doesn't have is flagged, so the firm fixes its setup or operations
(ADR-223).

**The completed load (`CLT`)** is written by the worker alone (invariant 4), from the two events:
their bare number and a link to each (unique, so one load can't bill twice, invariant 17); **the
load's time is its collection's end**, so a preload counts on its collection's day (ADR-161); the
**quantity** (capacity × load call, the weight, or the count carried; `adms-validation`); the
**zone** from the collection's GPS (ADR-135); the **mileage** from the collection's end GPS, snapped
to the nearest road, to **the disposal site's own GPS** (ADR-208). It is updated in place on every
reprocess, never duplicated (ADR-086), and it is what QC approves and the invoice lock locks
(ADR-168).

**Demolition** is ordinary loads billed by the CY on a project named for it: no kind of work, no
square-foot unit (ADR-200).

### 4.2a Split loads

Where the project allows split loads (ADR-137), one truck gathers from several properties: **N
collection events, one disposal event** (ADR-032).
- Each property gets its own collection event, `-A`, `-B`…, with its own address, GPS, ROE and
  estimate; the disposal is on the base number. They are grouped on the base number, suffix stripped
  (ADR-033, 173).
- **Each property's share = its estimate ÷ the sum of the estimates**, applied to the load's
  quantity, derived and summing exactly (ADR-055). There is no check of estimates against the call
  (ADR-064).
- **Rules run once per property**, on its share, with its own zone, address and mileage and the
  load's certification, disposal and load call (ADR-162).
- Example (golden mission §3): 102001-A estimate 12 CY, 102001-B 18 CY; the disposal calls 75% of
  cert `730416`'s 48 CY = 36.0 CY → 14.4 CY and 21.6 CY.
- How the phone chains the suffixes: `adms-field-app` §4A.3; a suffix mix-up: `adms-exceptions`
  Scenario D.

### 4.2b Loads that carry tickets (stumps, white goods)

Some loads take their quantity **from the unit rate tickets they carry**, a setting on the pay item
("quantity from the tickets it carries") (ADR-192, 204, 215).
- **On the collection event** the loading monitor adds each carried ticket **by its number**: the
  stump ticket's number painted on each stump, or the white goods ticket's number. A number that
  matches no ticket, or one already on another load, is flagged, never refused (ADR-192).
- **At the tower:** no load call, no weight. The site's lookup (§4.2) tells the phone to ask for a
  **count of the tickets** the load carries, never of the items on them (the user, 2026-10-06,
  ADR-370: "the tower counts the tickets"; a white goods ticket of six items counts as one). The tower phone holds no ticket list (ADR-071) and
  needs none: **the worker compares the tower's count with the tickets the collection event lists,
  after sync**, and flags a difference (ADR-192, 243).
- **The quantity:** a load of stumps is **each stump's CY rounded to a tenth, then added** (4.8 +
  7.8 + 12.0 = 24.6 CY), so the load always equals its stump tickets (ADR-192). A load of white goods
  is the count of items on the tickets it carries, **paid once, on the load**, at the rate of its
  mileage band (ADR-204). "White Goods" is a debris type the firm adds (ADR-204).
- **Whether it bills is the firm's rules**: a hauling pay item where the contract pays hauling, a $0
  one where the per-item price covers transport; nothing checks for "paid twice" (ADR-199).

## 4.3 Special cases and duplicates

In **`adms-exceptions`**: §4.3 (special cases in Workflow A) and §4.3a (duplicate numbers,
quarantined at sync; renumber vs void; corrections). Scale receipts: **`adms-scale-receipts`**.

## 4.4 WORKFLOW B — Haul-outs (`HOC` → `HOD` → `CHO`)

Debris staged and reduced at a TDSR leaves it for final disposal. It mirrors a load **with one
inversion: the load call is taken at the loading end** (ADR-013).

**Why:** a haul-out is loaded from a staged pile under a monitor's eye and called full at the TDSR,
the moment the fill is observable and attestable; at the final site it is simply emptied. A load, by
contrast, is judged at the tower after settling on the drive in.

| | Haul-out collection event (`HOC`), at the TDSR | Haul-out disposal event (`HOD`), at the final site |
|---|---|---|
| Site | from the phone's assignment: the haul-out's **from site** (ADR-195) | from the phone's assignment (ADR-195) |
| Certification | badge scan | badge scan |
| Debris type | picked from the haul-out form (Mulch, Ash…) | picked on its own; compared |
| Field tag | optional (agent default, ADR-218) | none |
| Quantity | **the load call, always**: it can't know where the truck goes (ADR-013, 227) | none, or the **scale weight** where its site's lookup (§4.2, read from the haul-out form's rules) says the haul-out is paid by weight (ADR-223, 243) |
| Also | makes the number; prints (ADR-115); start and end GPS and times; photos of the load | end GPS against the site's area; times; photos of the empty bed: it dumped and left empty |

- **The completed haul-out (`CHO`)**: quantity = capacity × the haul-out collection's load call, or
  the weight where it is paid by weight; a weight-paid haul-out keeps its loading-end call, unbilled
  (ADR-227). Its time is its collection's end (ADR-161). Mileage runs from the TDSR collection's end
  GPS to the final site's own GPS, so it is the same for every haul-out between two sites (ADR-208).
- **Where it went** (checks in `adms-validation`): a haul-out leaving a site not marked *Haul-outs
  leave here* is flagged (ADR-205, 215); **a haul-out dumped at a TDSR is flagged and priced no
  further** until a reviewer corrects it. **User, 2026-09-29 (Q-212):** "A HAUL OUT SHOULD NEVER GO
  TO A TDSR, ONLY LEAVE ONE." (ADR-226). A tipping fee is checked on haul-outs **dumped** at a site
  that charges one (ADR-226). A haul-out from a prior date is not flagged (ADR-205).
- **A haul-out is reduced debris leaving a TDSR for a different site** (ADR-298). **User,
  2026-10-01:** "we never take derbsi from one site back to the same site, but we need to make sure we arent taking it from one "landfill" site to another "landfill" site as well. Haulout is reduced debris and it must have originated from some type of TDRS." So
  *Haul-outs leave here* can be ticked **only on a site whose type is the built-in TDSR/DMS**
  (setup, *agent default*): a haul-out leaving a landfill, or any other site, is then always
  flagged as leaving a site not marked for it, and one dumped back at the site it left is a
  haul-out dumped at a TDSR. Two final sites on a project are two destinations, never a leg
  between them.
- **Rules** on the haul-out form: *Disposal site* is the final site, and a criterion tests the TDSR
  it left (ADR-164).
- A citizen drop-off pile is billed only when it leaves as an ordinary haul-out (ADR-184).

### 4.4a Split haul-outs (ADR-295, 297)

Where the project **allows split loads** (ADR-137), a haul-out may be loaded from **several piles**:
debris at a TDSR is sometimes kept apart by the area or zone it came from, and is hauled out and
costed that way. It works like a split load's collections, with one difference in what the monitor
gives. **User, 2026-10-01:** "Each new pile or whatever you wanna call it, they start like a new property. But insteaf of just giving and estimate CY, they give an actual load call per pile estimating how much debris is in the trailer after each. So say the first pile is 10% loaded. Then the next is 35% loaded and finally they load a 3rd and mark 85% loaded. That then becomes the final load call, but we use the percentages from each and take the certified CY to know how much each zone/area costs once we get the scale ticket info from the haul out disposal monitor."

- **N haul-out collection events, one haul-out disposal event**: `-A`, `-B`, `-C`…, grouped on the
  base number; the first is `-A`, never bare; the driver carries the base number (as §4.2a).
- **Each pile's event** has its own times and GPS, its own debris type and, to tell the pile, its
  **field tag** from the project's list (*agent default:* the firm adds its areas there; no new
  list).
- **Each records a running load call**: how full the container is after that pile. **The last one
  is the haul-out's load call.** No estimate is taken.
- **A pile's part is what it added**: its call less the call before it. **Its share = that part ÷
  the last call**, applied to the CY, or to the scale weight where the haul-out is paid by weight;
  derived, summing exactly (`adms-validation` §5.5).
- **Rules run once per pile**, on its share, with its own debris type and field tag.
- A call that isn't higher than the one before it is flagged, and nothing bills until it's
  corrected; the load-call limits judge only the last call (`spec/FLAGS.md` §3.5).
- **Paid by the CY or by the scale's weight, as the firm's setup says** (ADR-297), exactly as a
  split load's shares are applied to its CY or its tonnage: the haul-out pay item's Unit of Measure
  decides, and the firm's rules pick the pay item (ADR-202, 223). A haul-out usually ends at a scale
  house, so the weight is the common case. **User, 2026-10-01 (as a firm):** "As for the haul out split load weight, aren't we able (thinking as a firm) to setup the project to handle either or? And with that in mind when it comes to haul out, because it is goint to a scale house most of the time we will often want to use that scales tonnage instead of the load call percentages). now if you think back to how we setup load collections with split tickets for private property and such... How we take those CY amounts the monitor gives us and calculate the split totals? And in some cases we would want to get a scale weight for those? Same with haul out... we want to model it like that." The load
  calls are taken either way: they set each pile's share, and the weight is what's billed.
- Example (golden mission §2, ticket 201004): cert `730419`, 110 CY, calls 10%, 35%, 85% → parts
  10, 25, 50. Dumped at Cypress Creek Landfill, where the mission's rules pay mulch by the ton, and
  weighed at 24.00 tons → 2.82, 7.06 and 14.12 tons, one `MULCH-HO-TN` line per pile. Its CY (93.5;
  the piles 11.0, 27.5 and 55.0) is kept, unbilled; dumped at Bayline County Landfill, where the
  rules pay by the CY, those would be the billed quantities.

## 4.5 WORKFLOW C — Unit rate (one field event, no pairing)

Some work isn't volumetric: a leaning tree felled, hangers cut from a canopy, a stump pulled,
appliances taken off the right of way, a crew's hours. It is billed per each, per pound or per hour.
There is no second place, so there is nothing to pair: **one monitor, one place, one field event,
one ticket.**

**The capture** (after §4.1a's badge scan of the **crew badge**; a crew is its certification,
ADR-228): the crew photo; the monitor picks the **payable type** by name (the list shows **each once**:
Hangers, Leaners, Stumps…); then counts, measures or lists items as the kind of work asks; the phone
**works out the pay item** in the background from the size bands and prints it on the receipt with
the work details (ADR-207, 213). **User, 2026-09-28 (Q-199):** "When a phone is setup for (LHS -
leaning trees, hangers, stumps), the monitor only sees what you know they see (Leaner, Hanger,
Stump) in a list of options. They measure it." Also on the field event: the GPS, times, photos, an
optional field tag (ADR-218), the ROE on an ROE project (ADR-149), the survey number on a stump
(§4.5d). Where the pay item allows it, the monitor may **mark the work ineligible**, and the ticket
is flagged (ADR-210).

**One ticket, one kind of work, one pay item**: itemised details (washer, dryer; skid steer, truck)
sit inside that one pay item and are never pay items themselves; kinds never mix on a ticket
(ADR-124, 126).

### 4.5a What each kind captures, and what it bills

**Capture shape and billing basis are independent** (ADR-040): the ticket records what was done;
the pay item and the rules decide what it's worth. An itemised list doesn't mean per-item billing.

| Kind of work | The monitor records | What it bills | ADRs |
|---|---|---|---|
| **Hangers** | one ticket per tree; the hangers removed; one measurement (limbs of 2 in or more count) | as the firm's pay items and rules say (the golden mission: 1 each) | 158 |
| **Leaners** | one tree; one measurement at chest height, before it's cut, **measured as circumference or diameter** (the monitor says which); an already-cut tree's diameter, with photos, is eligible | rules test the **diameter** (a circumference ÷ 3.14, `adms-validation` §5.5); the band picks the pay item | 177 |
| **Stumps** | §4.5d | the stump (1 each) and the fill CY | 198, 203 |
| **White Goods** | a flat item list (Washer, Dryer, Fridge freon recovered, Fridge freon staged…) | **every white good removed** counts toward the removal pay item; freon recovery either as extra lines from the item list or as its own ticket, as the project is set up. A fridge left with its freon **staged** gets only a $0 line (`WG-FRN-EA-STG`); when removed later it gets removal and recovery: two pieces of work, not double billing | 126, 128, 131, 132 |
| **HHW** | an itemised list, usually billed by the pound: the pounds entered as the count (`LB`) | per pound as the pay item says; the disposition trail is later work (KD-30) | 040, 054 |
| **Crew time** | items (Skid Steer, Truck…) with hours to the quarter hour; several tickets a day per crew allowed | **the highest item's hours, once**, through the pay item's conversion. Never the time clock (ADR-063, 241) | 084, 126, 159 |

Example (golden mission §2, ticket 301006): 2 washers, 1 dryer and 3 fridges removed, freon
recovered from 2 → `WG-RMV-EA` × 6 = $240.00 and `WG-FRN-EA` × 2 = $50.00 (the white goods rules:
`spec/RULES.md` §9). Item lists are contract-defined data that grow without a migration; closed
system lists (statuses, keys) never go in them (ADR-040).

### 4.5b Where a unit rate requirement is declared

**On the pay item**, as its settings, pushed to the phones that do that work (ADR-176, 213):
"Count is always 1", "Measurement required", "GPS required", "Decimals allowed", photos required,
"Monitor may mark ineligible", and the **size band** (from, to). A missing measurement or too few
photos is flagged, never blocked (ADR-157, 158).

**Size bands pick the pay item** within one payable type (ADR-213, 217):
- the phone works it out and prints it; the worker **works it out again** from the same bands, so a
  corrected measurement moves the ticket to another pay item on reprocess: **the phone's answer is
  what printed, the engine's is what bills**;
- a measurement in no band saves with **no pay item, flagged**;
- bands in one payable type **can't overlap** (setup refuses) and a gap warns;
- a payable type with **one** pay item keeps ADR-210: its band only flags work under or over it.

Example (golden mission, ticket 301002): Leaners measured as a circumference of 56.5 in → 18.0 in
diameter → band 6–24 in → `LNR-RMV-EA-24`.

### 4.5c Kinds of work belong to setup

**The kind of work** (Hangers, Leaners, Stumps, HHW, White Goods, Crew time; built in, the firm may
add its own) decides the capture screen and, for itemised kinds, the item names offered. **Each unit
rate pay item names its kind of work** and its **payable type** (what the monitor's list shows); the
assignment says which unit rate pay items a person does that day (ADR-127, 207, 240). The project
declares which kinds it allows (ADR-041). Rules still create every transaction.

| Kind | Count shape | The phone shows |
|---|---|---|
| Hangers | a number | a number, plus the measurement |
| Leaners | 1 | the measurement and whether it's a circumference or a diameter |
| Stumps | 1 | the stump screen (§4.5d) |
| HHW, White Goods | item → count | a pick list of the kind's items |
| Crew time | item → hours (quarter hours) | a pick list of equipment, hours each |

### 4.5d Stumps

A stump ticket is a unit rate ticket whose kind of work is the built-in **Stumps** (ADR-198). The
monitor records:
- the stump's **diameter two feet up**: the ticket's *Measurement* and FEMA's test. **Under 24 in is
  not an eligible stump**: flagged, never refused; a firm that wants it voided writes a rule. A
  smaller stump goes out as ordinary vegetative debris on a load (ADR-187, 189, 192);
- the **root ball's diameter**, for the fill; it never goes into the stump's CY as its diameter
  (ADR-196);
- whether **half or more of the root ball is exposed** (yes/no); **no hole depth**;
- the **survey number**, picked or typed at the start; none is flagged (ADR-198).

**How it's paid** is the firm's rules, **from the stump (1 each, by size band) or the fill CY, never
the stump's CY** (ADR-196, 198). The fill is an ordinary rule: *Pay item = the stump pay item* →
*Add transaction #2*, quantity from the fill CY; no root ball, no fill CY, no fill line. Two built-in
checks, on by default and switched per project: the root ball not wider than the stump; fill paid
but the root ball not half exposed; both still bill. The 31 in depth is a project setting (ADR-203).
**The stump's own CY** belongs only to a load of stumps (§4.2b). The stump and fill formulas are
`adms-validation` §5.5's.

Example (golden mission, ticket 301004): 30 in two feet up, root ball 96 in, half exposed → band
24–36 → `STP-RMV-EA-36` $110.00, and fill 4.8 CY × $22.00 = $105.60.

### 4.5e How a unit rate ticket is reconciled

No pairing: the worker takes the ticket alone (§4.7). It checks it (certification at work time, the
project boundary, the band and the pay item's settings, the crew-day hours), attaches the zone from
its GPS, works the pay item out again from the bands, runs the unit rate rules and writes the
transactions. No mileage. It ends `COMPLETED` or `MANUAL_REVIEW` like any ticket (`adms-validation`).

## 4.6 WORKFLOW D — Forms (evidence, never money)

**Forms are records, not a ticket's events** (agent default, ADR-236): they never pair, never reach
pricing and are each **QC'd on their own** (ADR-107, 168). Anything that bills has fixed fields;
surveys, ROE forms, incidents and drop-off logs may also carry **the firm's own fields** (text,
number, yes/no, list, photo), exported and never read by the engine or rules; everything takes
free-text notes (ADR-160). A phone makes the forms its assignment allows; the back office can make
any record too (ADR-156).

| Form | What it records | Rules around it | ADRs |
|---|---|---|---|
| **ROE** (Right of Entry) | number (from the phone's block, or typed from the paper ROE), parcel ID, address, owner, signed and the date, **scope** (picked from what the project already has: its load form's debris types and its unit rate payable types, each with an optional count, ADR-293; GPS, with "GPS required" set on the form; the firm's other ROE form fields), a photo of the signed form | made offline on a phone or in the back office; reaches other phones when they sync. **On an ROE project every collection, unit rate ticket and survey carries one**; missing, unsigned or out of scope is flagged | 055, 149, 181 |
| **Pre-work survey** | a property's condition before work, against false damage claims; its ROE | | 149 |
| **Post-work survey** | the condition after and the work done; **linked to its pre-work survey by ROE number** | the phone's lists hold the ROEs whose pre-work survey is done, so another monitor can pick one; none is flagged | 150 |
| **Incident** | type, then sub-type (the firm adds sub-types; none at install), parties, photos, description; and, each optional and only where the project's incident form offers it, the contractor involved, a cert number, an ROE number | **records only: never stops work**, whatever the incident | 052, 137, 328, 334 |
| **Citizen drop-off log** | at a site: the site, monitor, time, GPS, the resident's name and origin address (optional), up to 8 photos (optional), notes, the firm's fields | a reference log, not a ticket: **no quantity, number, receipt, pay item or cost**; searchable by site, dates, name, address; the pile is billed when it leaves on a haul-out. *Agent default:* not checked against the site's facts | 184, 188, 215 |

**User, 2026-09-27 (Q-178):** "They are like surveys more than tickets and kinda like incident
reports but the monitor needs to be able to mark simple details not quantity".

## 4.7 The reconciliation run

The worker is rebuilt from scratch (ADR-093); how it runs is approved in ARCHITECTURE §13.

**What starts it: jobs, not requests.** A synced field event queues its ticket; so does a
back-office-created or corrected event, a renumber, a void or an accepted flag; a setup change (a
rate, a rule, a map version, a site's shape or GPS) queues every **un-invoiced** ticket it touches
(ADR-090, 136, 141, 208, 236).

**Its load is bursty and never in field-time order.** Phones sync whenever there's signal, in any
order; a phone flat for two days sends old work behind new. Never infer anything from arrival
order, never treat a late arrival as suspicious, and size for the spike (ADR-030).

**For each ticket**, grouped on **project + workflow + bare number** (split suffix stripped; the
field event's kind is never used to *find* its partner, ADR-019, 062):
1. **Gather** the ticket's current field events, ordered by field time. An event still missing →
   `PENDING`, listed, not flagged (ADR-053). A second event of one kind never gets here: it was
   quarantined at sync (`adms-exceptions` §4.3a).
2. **Check** the events against each other and the setup: every problem is a flag, never a refusal
   (`adms-validation`).
3. **Attach** the zone (recording the map version) and the **mileage**, before pricing (ADR-135, 141,
   163, 208).
4. **Work out the quantity** (`adms-validation` §5.5), per property on a split; for unit rate, the
   pay item again from the bands (ADR-217).
5. **Run the rules** on the ticket's form: every passing rule that names a contract its prime holds,
   or no contract (remove or void only, ADR-239); *Add* in # order, then *Remove*, then *Void
   ticket*; per property on a split (`adms-ledger-audit`, `spec/RULES.md`).
6. **Write** the completed load or haul-out (updated in place), the regenerated transactions (each
   removed row copied in full to `AuditRecord` first, ADR-085) and the status.

**Guarantees** (ARCHITECTURE §13): steps 2–6 for one ticket **commit together or not at all**
(KD-55); **one run per project at a time**; a ticket that errors is flagged and skipped, never
stopping the rest; running it again over unchanged input changes nothing; each run records what it
decided and why. An invoice-locked ticket is unlocked (audited) before it can change (ADR-057).

---

## History

What this page used to say, and why it changed. Never build from the left-hand side.

- Statuses `MATCHED` / `FAILED`, and unit rate as pass/fail with no `MANUAL_REVIEW` → four statuses,
  review still bills (ADR-060, 118).
- Stage tables (`CollectionTicket`, `DisposalTicket`…), a system-written `LoadTicket` /
  `HaulOutTicket`, type-prefixed numbers (`COL-…`, `LDT-`) and pairing on a composite key (cert,
  zone, debris type, timing) → **field events** on one bare number, grouped by project + workflow +
  number; the completed load / haul-out drawn from them (ADR-019, 046, 062, 236). A load's "halves"
  → its field events (ADR-236).
- Every ticket started from a picked **service code** (the legacy "Service"): the badge's prime's
  codes "shown to monitors", by a name shown to monitors; a load code carrying its debris type; a
  split's code picked once on `-A`; a code copied per prime (ADR-182, 185, 191, 054/174) → the
  monitor picks a debris type (loads, haul-outs) or a payable type (unit rate) by name; a load
  carries no pay item; one pay item holds a rate per prime (ADR-206, 207, 213, 237).
- Number, badge and code at the start (ADR-056, 191) → badge at New, the number last, re-entered
  (ADR-209).
- A monitor-recorded zone, the pair's "zones differ" check, the 5 km collection route check and
  route drift (on haul-outs, a hard failure) → zone attached from the map; the project boundary
  check (ADR-135, 136, 141).
- Site options Disposal · Haul-out · Staging · Citizen drop-off · HHW, an HHW site type, "options
  flag nothing"; then the legacy boxes Allow Collection · Allow Disposal · Disposal Fee · Ineligible ·
  Critical → a site type plus Takes loads · Haul-outs leave here · Charges a tipping fee · Ineligible
  site (ADR-190, 193, 201, 205 → 215, 219, 222, 234).
- A "requires weight" box, asking for both a load call and a weight, a weight-vs-load-call check,
  service codes pushed to a load's phones (ADR-165, 175, 176) → one quantity from the paying pay
  item's Unit of Measure, worked out ahead per site and prime (ADR-221, 223, 227).
- Stumps: CY from the stump paying extraction, the stump measured by circumference, the root ball
  typed as D, a hole depth, a load of stumps billed at a load call, backfill from the stump CY
  (ADR-177, 178, 183, 187, 189, 192, 196) → the stump ticket of §4.5d (ADR-198, 199, 203).
- Citizen drop-off as a priced ticket type (ADR-180) → a reference log, a form (ADR-184, 188, 215).
- A 4-photo limit per phase → 8 per ticket (ADR-157); QC on each half → on the completed load only
  (ADR-168); "only a person voids" → a rule's *Void ticket* too (ADR-118).
- A rule's action naming "the ticket's own contract", or the contract on each action → one contract
  per rule, run only on its prime's tickets (ADR-109, 174 → 239).
- The tower recorded the site; "provisioned" phones set up each day and synced at the end of it →
  every phone at a site is set up for that site; phones enrolled once, the day's assignment, sync
  whenever there's signal (ADR-193, 195, 095 → 240). Ageing and grace periods → never expires
  (ADR-029, 030 → 053). Work orders and purchase orders → out (ADR-228).
- The historical code as "current implementation": `ticketService.ts` and `assertCertForProject()`
  (throwing, judged against "now"), `compute_volume`, `reconcile_haul_out_pair`,
  `run_project_reconciliation` on a ~15-minute sweep, FastAPI on port 8001, `PayItem.requireUnitCount`
  never enforced, rules silently skipped on the haul-out disposal, a "gaps vs what's built" table →
  the engine is rebuilt (ADR-093); flag at work time (ADR-048, 052); the gaps live in KD-12, 13, 14,
  27, 28, 29, 35.
- Round-by-round ⚠️ notes (rounds 13–22) on top of the historical body → absorbed; rewritten in the
  present tense, in field events and today's words (ADR-138, 234, 236, 242).
- A pay item with a name and a description of "the contract's words and line", codes that could
  repeat, and nothing said of a copied rule → a unique code and the firm's own description; an exact
  duplicate of a rule refused before it is saved (ADR-147 → 301).
