---
name: adms-validation
description: Open ADMS checks, flags, statuses, how rules run, and the quantity math, in today's rules. Covers the checks between a ticket's field events and on each event against the setup (certification, place and time, where debris went, quantity, pay item settings, forms, pricing), what is never flagged, how the worker runs a form's rules (one contract per rule, criteria read only the ticket, Add in # order then Remove then Void ticket, a rule's void wins), why no rule or setting may be silently inert, the four statuses and what sets them, timing contradictions, how a flag reads and how a reviewer accepts one, and every quantity formula (capacity × load call, scale weight and a tandem's split, split shares, circumference to diameter, stump CY, fill CY, carried tickets, white goods, crew hours, mileage rounding). Use when writing a check or a flag, the rule engine, a threshold or project setting, status changes, or any quantity math. Setup and workflows live in adms-ticket-workflows, pricing and the ledger in adms-ledger-audit, duplicates and corrections in adms-exceptions.
---
<!-- skill-status: current (accept flags a grant of its own, and how void, unvoid and accept are built, ADR-365; ADR-138, rewritten 2026-09-29, ADR-244; the flag catalogue approved, ADR-290; split haul-outs, ADR-295; a split haul-out's pile weights, ADR-297; *Haul-outs leave here* only on a TDSR, ADR-298; a duplicate rule refused, ADR-301; the flags for a record that should not have been possible and what a removed photograph counts for, ADR-345; how the place checks are built, ADR-346; how the quantity, unit rate and ROE checks are built, ADR-347; two more flags, ADR-348; the setup check built, ADR-357) -->

> **This page states today's rules** (last changed by ADR-301, as its status line lists). Each rule cites its ADR; what changed is in
> the History list at the end. The user's own words are quoted and marked **User**. If this page and
> `agent_store/SUMMARY.md` disagree, SUMMARY wins: log a KD (`adms-decisions`). The worked example
> is `spec/golden/MISSION.md`; names and examples follow `spec/CONVENTIONS.md`. The words (field
> event, ticket, completed load, pay item, payable type, debris type, flag) are defined once, in
> `adms-domain` Part 2.

# PART 5 — CHECKS, FLAGS, RULES AND QUANTITIES

**The field events are the evidence; checks, flags, statuses, quantities and transactions are
conclusions the worker draws from them** and the firm's current setup, again on every reprocess
(`adms-domain` §1.2, invariant 21; ADR-236). A check compares a ticket's events with each other or
with the setup; it never changes an event. A correction changes an event in place, audited, and the
worker draws everything again (`adms-exceptions`).

**Flag, never block** (ADR-052, invariant 19). After setup nothing refuses field work or a record
over eligibility: every problem is a **flag**, a plain message on the ticket, and the ticket goes to
review. The only rejection at sync is a duplicate number, quarantined in full (ADR-022,
`adms-exceptions` §4.3a). Setup itself may refuse a bad setting: overlapping size bands (ADR-217), a pay item code the
project already has, an exact copy of a rule (ADR-301).

**Where it lives.** Every check and formula lives **once, in `packages/domain`**, as plain classes
that take a ticket's field events and the setup and return flags or quantities. The package touches
no database, so each is unit-tested alone; the worker (`apps/worker`) runs them in the order of
`adms-ticket-workflows` §4.7, and the phone runs the same band pick and diameter formula for its
receipt (ARCHITECTURE §18, invariants 11 and 14). **Thresholds are policy**: built-in defaults in
`.env`, project settings where the firm may change them, never literals, never relaxed to pass a
test (invariant 16). The flag catalogue (each flag's code, trigger, wording, still-bills and accept
rule) is `spec/FLAGS.md` (approved 2026-10-01, ADR-290): its codes and wording are the ones to build; the
messages below show the style.

## 5.1 Checks between a ticket's field events

The worker groups field events on **project + workflow + bare number** (a split's suffix stripped),
then **tests** the group; nothing here is used to *find* a partner (ADR-019, 033, 062). A flag here
means two monitors who couldn't see each other disagree about one load.

| Check | Compares | The flag reads (style) | ADRs |
|---|---|---|---|
| **Debris type** | Each collection's debris type (every property's on a split) with the disposal's; a haul-out's two the same way. **Exact entry only**: "Veg" is not "Marine based – Veg/Woody" | "Ticket 101008: debris type mismatch (collection Vegetative, disposal C&D). Flagged for review." | 207, 213, 226 |
| **Certification** | The cert number on each event: the physical proof of one truck, compared **exactly**, never fuzzy | "Ticket 101008: truck number doesn't match (collection 730415, disposal 730416). Flagged for review." | 019, 033 |
| **Order in time** | The disposal must start after its collection ended (§5.4a) | "Ticket 101008: disposal started before its collection ended. Flagged for review." | 053, 100 |
| **The group's shape** | N collections and one disposal: a bare collection beside suffixed ones, or a gap in the suffixes, is flagged. A second event of one kind never gets here: it was quarantined at sync | "Ticket 102001: collections -A and -C, no -B. Flagged for review." | 033, 173 |
| **A load that carries tickets** | The tower's **count** with the tickets the collection event lists, after sync (the tower phone holds no ticket list) | "Ticket 101014: tower counted 3 stumps, the collection lists 4. Flagged for review." | 192, 243 |

The workflow is part of the group, so a haul-out event can't pair with a load's (ADR-062). There is
**no zone check** between events: a load's zone is its collection's (ADR-141).

## 5.2 Checks on one field event, against the setup

Run on each field event as it arrives, and again on every reprocess. **Every flag still bills** where an
amount can be computed (§5.4), except where the table says it doesn't.

**Certification** (`adms-certifications`):
| Check | The flag | ADRs |
|---|---|---|
| No certification with that number on this project | the load is **unbilled** and flagged until one exists | 154 |
| A truck keyed in by hand, capacity typed unlike the cert's | flagged ("capacity typed 60, certified 65"); the **cert's** capacity bills | 154 |
| Judged at the **work time**, never "now": an expired **tag**, a cert revoked from a date, a cert replaced by a new one | flagged "review the certification" | 048, 079, 153 |
| A driver's licence | **flags nothing** | 153 |

**Place and time:**
| Check | The flag | ADRs |
|---|---|---|
| A collection's end GPS or a unit rate event's GPS **outside the project boundary** | "collected outside the project boundary" | 135, 141 |
| Inside the boundary but in no zone | "not inside any zone" (the zone is left empty) | 141 |
| A disposal's (or either haul-out end's) end GPS outside its **site's area**: the project's circle (built-in 200 m, `DISPOSAL_SITE_PROXIMITY_M`, changed in its GIS settings) or the site's own shape | "dumped outside Marsh Road TDSR's area" | 136, 142 |
| The load's time (its collection's end) outside the project's **active window** | "project not active on 03-Feb-2027" | 057, 161, 181 |
| A disposal before the site's activation date, or after its set close date | "site not yet active" / "site closed" | 173, 181 |
| No road route for the mileage | "no road route found; straight-line distance used" | 163 |
| The times don't make sense: device clock off at sync beyond a threshold, a work time after the server received it, before the phone was set up, a device time zone unlike the project's | a plain message about the time ("device clock was 2 h 14 m off at sync") | 100 |
| Made on a phone after it was taken out of service | "made on a phone taken out of service" | 134 |
| A ticket number **typed** instead of scanned (a reason picked) | "typed ticket number" | 111, 173 |
| A record the back office created (person and reason kept) | flagged, then pairs like any other | 156 |

**How the place checks are built** (agent defaults, ADR-346; `packages/domain`'s `place.ts`): a project with no map raises nothing and gives no zone; a map with no zones never says "not inside any zone"; outside the boundary is one flag and no zone is looked for; a haul-out's collection takes no zone; a field event with no GPS fix, or a disposal naming no site, isn't placed and nothing is raised for it here; a site is open on its activation date and its close date themselves, the day being the disposal's in the project's time zone; a point on a circle or on a shape's edge is inside.

**How the quantity, unit rate and ROE checks are built** (agent defaults, ADR-347; `packages/domain`'s `quantity-checks.ts`, `unit-rate-checks.ts`, `roe-checks.ts`): a 0% call is said once, never as a low call too; a split haul-out's piles and its last call are read once the ticket is whole; a receipt with no weight at all isn't "unusable" (a lineage token), one with only a gross or only a tare is; a carried ticket on two loads flags both; several pay items and nothing measured is "no measurement" with no pay item; a stump under 24 in that no band holds carries that one flag; "marked ineligible" is flagged wherever the record says so; *Count is always 1* raises nothing (it makes the count 1 at pricing); crew time is a kind of work counted in items by hours, its day the project's calendar day, its limit handed in (the policy value `CREW_DAY_HOURS`), flagged on the ticket that takes an item over and each later one that day; the ROE flags are raised only where the program type requires ROEs, and **a ticket's ROE flag puts the ticket in review like any other** (§3.7's "never touches a ticket's status" is about a survey's, a certification's or a site's flag).

**Where the debris went** (the site's facts; the system checks where debris went, never where it
was headed). **User, 2026-09-28 (Q-197):** "The system simply verifies that the debris was allowed
to go where it went" (ADR-205, 215):
| Check | The flag | ADRs |
|---|---|---|
| A load dumped at a site not marked **Takes loads** | "dumped at Old Quarry Pit, which isn't marked Takes loads" | 205, 215 |
| A haul-out leaving a site not marked **Haul-outs leave here**. Only a TDSR/DMS site can be marked (setup, ADR-298), so this catches every haul-out that didn't leave a TDSR, a landfill-to-landfill one included | "left Bayline Transfer Station, which isn't marked Haul-outs leave here" | 205, 215, 298 |
| A load dumped at an **Ineligible site** | "dumped at Old Quarry Pit, an ineligible site"; still bills | 215 |
| A load or haul-out **dumped** at a site that **Charges a tipping fee**, with no line for that site's tipping fee pay item: a **missing rule**, never a mismatch. Never checked on a haul-out leaving the site or unit rate work there | "dumped at Bayline County Landfill, which charges a tipping fee, but no rule on this project gives it one" | 222, 226 |
| A **haul-out dumped at a TDSR** (its site type's built-in key). **User, 2026-09-29 (Q-212):** "A HAUL OUT SHOULD NEVER GO TO A TDSR, ONLY LEAVE ONE. SHOULD BE FLAGGED AND NOT PROCESSED MORE." | "a haul-out dumped at Marsh Road TDSR, a TDSR. Flagged for review; not priced." **Priced no further** (no lines) until corrected | 226 |

**Quantity** (§5.5):
| Check | The flag | ADRs |
|---|---|---|
| A load call of **0%** | always, whatever the limits; bills nothing | 116, 181 |
| A load call at or under **5%** or at or over **95%**: a **project setting** (defaults in `.env`), changed or turned off; never a rule criterion | "load call 96%" | 164 |
| A line whose pay item needs a quantity the load doesn't have (per ton, no scale weight) | "TIP-FEE-TN-BCL is priced per ton, but the load has no scale weight"; that line bills nothing | 223 |
| One scale weight shared by a tandem, split by certified capacity | **both** tickets: "one scale weight shared by two containers, split by certified capacity" | 175 |
| A scale receipt carrying two debris types | **both** tickets flagged; its weight unused until a person fixes the receipt or voids a ticket (`adms-scale-receipts`) | 069 |
| A carried ticket number (stump or white goods) that matches no ticket, or one already on another load | flagged on the load | 192 |

**The pay item's settings, and unit rate work** (settings ticked on a pay item are checked here for
every ticket they apply to):
| Check | The flag | ADRs |
|---|---|---|
| "Measurement required", "GPS required" or photos required, and the ticket lacks it (at most 8 photos a ticket; required means at least 1) | "no measurement" / "no GPS" / "no photos" | 157, 158, 181 |
| A measurement in **no size band** of its payable type | saved with **no pay item**, flagged: "Ticket 301009: 4.5 in fits no Leaners pay item"; nothing to bill | 213, 217 |
| A payable type's **only** pay item, measured under or over its band | flagged; still bills | 210, 217 |
| Work the monitor **marked ineligible** (where the pay item allows it) | flagged | 210 |
| A stump under **24 in** two feet up | "not an eligible stump (under 24 in)"; a firm that wants it voided writes a rule | 187, 189 |
| A stump's root ball not wider than the stump; fill paid but the root ball not half exposed: **two built-in checks, on by default, switched per project** | "Ticket 301008: root ball (20 in) is not wider than the stump (30 in)." / "fill paid, but the root ball is not half exposed"; both still bill | 203 |
| A blank root ball where the stump's pay item requires the measurement | flagged | 203 |
| A stump ticket with no survey number | "no survey" | 198 |
| One crew item over **12 hours** in the crew's day, adding that item's hours across the day's tickets (01:00–24:00, project time); two crew-time tickets for one crew that overlap | flagged; still bills. Never applied to monitors' own hours | 068, 100, 159 |

**Forms** (records, never priced; `adms-ticket-workflows` §4.6):
| Check | The flag | ADRs |
|---|---|---|
| On an ROE project, a collection, unit rate ticket or survey with no ROE, an ROE not on the project, unsigned, or out of scope (the ticket's debris type or payable type isn't among the ROE's scope picks; an ROE with no picks has no scope check, ADR-293) | flagged; nothing is looked up | 055, 149, 293 |
| A post-work survey with no pre-work survey on its ROE | flagged | 150 |
| A certification missing one of its five views | flagged (`adms-certifications`) | 179 |
| A disposal site with no permit | "permit outstanding", on the site | 111 |

**Pricing** (from the rules, §5.3):
| Check | The flag | ADRs |
|---|---|---|
| No rule of the ticket's prime creates a line | "Ticket 101010: no pricing rule on a Summit contract matches. Flagged for review." | 239 |
| Two rules create the **same #** | neither line bills: "two rules create transaction 1 (LNR-RMV-EA-24, LNR-RMV-EA-99)" | 118 |
| The pay item has no rate for the prime | a **$0 line**, flagged: "Pay item VEG-HAUL-CY-15 has no rate for Summit." | 212 |
| A pay item still to be negotiated (TBN) | "rate to be negotiated. Not billed yet." | 068 |

**A record that should not have been possible** (`spec/FLAGS.md` §3.10; ADR-329, 345). The phone
and setup stop each of these; one that reaches the server anyway is kept and flagged. **User,
2026-10-05:** "If there is even a chance those could be created make them flag, but it really
should be impossible if we build things the right way."
| Check | The flag | ADRs |
|---|---|---|
| A field event with no debris type; a haul-out collection with no load call; a unit rate event with no kind of work; a load's disposal that took no load call, no scale weight and no count | "Ticket 101036: collection has no debris type." | 329, 345 |
| A ticket number typed with no reason picked | "typed ticket number (no reason picked)" | 329, 345 |
| A load or a haul-out on a crew's badge, or unit rate work on a container's | "a load recorded on crew certification 730417" | 329, 345 |
| A GPS fix that can't be one, kept apart at intake | "GPS unreadable" | 329, 338, 345 |
| A ticket number that isn't digits: in no ticket, pairs with nothing until renumbered | "not a valid ticket number. Flagged for review; not billed." | 329, 345 |
| A field event that ends before it starts | "collection ended 09:10, before it started 09:40" | 329, 345 |
| A scale receipt with a gross, a tare and a net, the net not the gross less the tare (pounds to the pound, tons to the hundredth); the weights stay as typed and it still bills from the net as written | "scale receipt BCL-88251's net (17.60 tons) is not its gross less its tare (17.10 tons)" | 329, 348 |
| A load's disposal with a load call and a scale weight; which bills is the paying pay item's to say, and the two are never compared | "disposal has both a load call and a scale weight" | 329, 348 |
| A lettered collection where *Allow split loads* is off; a control ticket number in none of the ranges entered for its series; a field event under another project's assignment | the three backup catches, each still bills | 345 |

**What a record must have is counted from what is on it now** (the user, ADR-345). **User,
2026-10-05:** "if say a ticket requires 4 photos and it has 4 but the back office were to delete 1
leaving only 3 remaining... That ticket would then flag for not having enough photos". A
photograph the back office removed from the record counts for nothing: not one of a
certification's five views, not a photograph a pay item requires. (*Photos required* is yes or no
today, meaning at least one.)

### 5.2a Never flagged

As important as the checks: an agent must not add these.
- An event **waiting for its partner**, however long: `PENDING`, listed, never flagged, never
  expired (ADR-053). A **preload** or a haul-out from a prior date (ADR-205).
- The **distance a collection covers**: no route check; the boundary replaces it (ADR-136).
- **GPS accuracy**: the phone sends whatever fix it has; the back office adjusts drift (ADR-083).
- **Split estimates against the load call**: estimates are only relative sizes (ADR-064).
- **A scale weight against a load call**: one quantity is taken, never both (ADR-165, 223).
- A driver's licence (ADR-153); a tandem's trailer swap (ADR-114).
- "Hauling paid twice" on a load of stumps: the firm's rules decide (ADR-199).
- Work under an **unplanned assignment** (marked, not flagged), and planned-against-actual on the
  dispatch board (views, never ticket flags) (ADR-240).
- A citizen drop-off log against its site's facts (agent default, ADR-215).

## 5.3 How the rules run

Rules are the firm's own tool (ADR-224); what each action writes and how it's priced is
`adms-ledger-audit`, and the builder, every criterion and every operator are `spec/RULES.md`. This
section is how the worker runs them, after the checks, the zone and mileage, and the quantity
(`adms-ticket-workflows` §4.7).

1. **A rule belongs to a form** (load, haul-out, unit rate), never to one field event, and **names
   one contract**. It runs only on tickets **whose prime holds that contract**; the prime comes from
   the certification, never from a monitor's pick (ADR-186, 239). A rule with only *Remove
   transaction* or *Void ticket* may leave the contract blank and runs on every ticket of its form
   (agent default, ADR-239).
2. **Criteria read only the ticket**: its field events and what the worker attached to it (zone,
   mileage, quantity, the unit rate pay item from the bands), never another rule's transaction
   (ADR-131). **Each criterion names the field event it reads** (agent default, ADR-239): *Ticket
   date* the collection's end (ADR-161); *Volume* and *Weight* the field event that took the quantity
   (§5.5); *Mileage* collection to site; *Disposal site* the disposal or haul-out
   disposal; the TDSR a haul-out left, its collection; *Debris type* **the collection's** (each
   property's own on a split; a haul-out's collection), since a mismatch is flagged anyway (agent
   default, ADR-244). *Mileage* is compared in tenths, half up (ADR-125).
3. **Find every active rule of the form whose criteria all hold**, then run every *Add transaction*
   **in # order** (#1, #2…), then every *Remove transaction*, then any *Void ticket*. The order the
   rules were written never matters, and the same ticket and rules always give the same
   transactions (ADR-118, 130, 131). **User, 2026-09-25 (Q-125):** deletes and voids "extend what we
   can do with the results of rules".
4. **A split runs once per property**, on its share, with its own zone, address and mileage and the
   load's certification, disposal and load call (ADR-162). **A split haul-out runs once per pile**, on
   its share, with its own debris type and field tag (ADR-295). A unit rate ticket's pay item is worked
   out again from the bands first (ADR-217).
5. **A rule's void always wins** (ADR-167): it names the rule as its reason; a person's unvoid lasts
   only until the next reprocess, so the reviewer corrects the data or the rule to keep it. **User,
   2026-09-27 (Q-159):** "the rule **always win**".
   **A void stays until a person unvoids it, whoever voided it, and a voided ticket is out of
   the run** (ADR-360): switching the rule off or changing it doesn't bring a voided ticket back; a
   person's unvoid does, and the rule then voids it again if it still passes. **User, 2026-10-06:**
   "A void that was voided should be voided unless unvoided manually. why would the system
   re-check things like this? The processing que should only consist of active work ticketed
   stuff that is being processed or changes that were made and so on. What I mean is for example,
   say we have a project with 300k tickets and 40 were voided along the way for various reasons.
   Those 40 shouldn't be getting reprocessed unless they were changed. So once they are changed
   and cleared they drop off the que and until they are edited they remain out of the que. This
   is how all such things should happen". So **only what is active or was changed is worked**:
   a settled ticket stays off the queue until it, or the setup it is priced by, is edited (the
   queue itself is Phase 2's).
6. **No *Flag* action and no *Load call* criterion**: project settings raise those flags, the same
   over the whole project (ADR-164).
7. The flags rules raise are §5.2's "Pricing" table. **A haul-out dumped at a TDSR skips the rules**
   until corrected (ADR-226).

## 5.3a No rule or setting is silently inert

A control the firm believes is in force but never runs is worse than a missing one: it manufactures
false confidence in a billing control. The rebuild closes the whole class (KD-15, KD-28):
- **Every active rule of a ticket's form runs** on it; there is no rule for a field event the worker
  never runs rules on, because rules belong to forms (§5.3).
- **The builder offers only the criteria the form's field events carry** (Q-102, ADR-109), and each
  criterion names the event it reads (ADR-239).
- **Every pay item setting the firm can tick is checked** at reconciliation (§5.2), never stored and
  ignored.
- **Show matches** says what a rule matches now, and the **setup check** lists gaps before the field
  day: a tipping fee site with no fee pay item, a debris type no rule pays, a prime with no rate,
  overlapping bands (ADR-229). Built at the domain (`SetupCheck`, ADR-357): it also lists a stretch
  between two bands or two crew-day steps that falls in neither, and every active rule that isn't
  valid, with why. **A rule that names an archived form, contract or pay item is not valid and
  never runs** (agent default, ADR-357). Whether the builder also marks a rule "valid" is a proposal
  (`spec/RULES.md` §7).

## 5.4 Statuses, and what sets them

Four statuses, and only these: **`PENDING · COMPLETED · MANUAL_REVIEW · VOID`** (ADR-060, 118). The
worker sets them on every run; a person sets only `VOID` (and unvoids).

| Status | When | Bills? |
|---|---|---|
| `PENDING` | a field event is still missing. Listed as pending, never flagged for waiting, never expires. The event it has is checked on arrival, and its flags (a typed number, a certification) show with it so the review queue can act on them (agent default, ADR-244); the status stays `PENDING` until the ticket is whole | no lines yet |
| `COMPLETED` | all its events are in and no flag is open (every flag fixed or accepted) | yes |
| `MANUAL_REVIEW` | any flag is open | **yes, where an amount can be computed**; where none can (no rule, two creates of one #, no quantity), the message says "not billed" |
| `VOID` | a person with a reason from the firm's list, or a rule's *Void ticket* naming the rule | nothing; its lines are removed, each copied in full to `AuditRecord` first (ADR-085) |

- **Every problem is one kind of thing, a flag**; none is "harder" than another, and review never
  holds the money. **User, 2026-09-24 (Q-13):** "Things that need manual review are not blocked in
  billing, but they need to be resolved. Voided items stop all billing." (ADR-060)
- **Reprocessing** (a correction, a renumber, an accepted flag, a void or unvoid, a setup change)
  runs the ticket again, `COMPLETED` ones included; the completed load is updated in place, never
  duplicated (ADR-086). An invoice-locked ticket is unlocked (audited) first (ADR-057).
- **QC status is separate** (QC Review · QC Approved · QC Issues · QC Void), set only by people, on
  the completed load, never a single event; it never changes the status or reruns anything. Only QC
  Approved tickets lock as invoiced (ADR-107, 121, 168; `adms-ledger-audit`).

## 5.4a Timing: contradictions only, never duration

Timing checks compare field times for things that **can't be true**: a disposal that starts before
its collection ended; overlapping loads on one certification; overlapping crew-time tickets for one
crew (ADR-053, 159). They **never** measure how long an event has waited: no grace period, no
expiry, no age threshold anywhere. **User, 2026-09-24 (Q-18):** "cut out this orphaned grace period
all together. we dont want to assume just because a ticket was collected a while ago and just now
dumped that its expired."
- **Times:** the device clock is the recorded time, stored as a UTC instant with the device's offset
  and the server's received time; "which day" is the project's time zone (ADR-100, ARCHITECTURE
  §10).
- **A load's time is its collection's end** (a haul-out's too); a disposal's time is its own end.
  The active window, *Ticket date* and daily counts use the load's time, so a Monday preload dumped
  Tuesday is Monday's, at Monday's rate (ADR-161, 181).
- Arrival order means nothing (ADR-030).

## 5.4b How a flag reads, and accepting one

**A flag states the ticket and the problem, plainly, and nothing else** (ADR-052):
- ✅ "Ticket 101008: debris type mismatch (collection Vegetative, disposal C&D). Flagged for review."
- ✅ "Ticket 101009: dumped at Old Quarry Pit, an ineligible site. Flagged for review."
- ✅ "Ticket 101003: load call 96%. Flagged for review."
- ❌ "Ticket 101008 has a mismatch, which probably means the monitor…": never diagnose, never guess
  a cause.

**Each flag keeps its code and the inputs it was raised on**, so "have the facts changed?" can be
answered (ADR-166).

**Accepting a flag** (ADR-166): a reviewer granted *accept flags* may **accept** a flag that's right
as it is, with a reason picked from the firm's list (ADR-173), audited. **It is a grant of its own:
*correct* doesn't carry it** (ADR-365). **User, 2026-10-06**, asked whether Luis, granted *correct*
but not *accept flags*, may accept a flag: "No, two separate grants". An accepted flag stays in the
ticket's history and **isn't raised again on reprocess unless the facts it was about change** (the GPS
is corrected, the site's shape changes). When every flag is fixed or accepted, the worker marks the
ticket `COMPLETED`. There is no "accepted void": a rule's void wins (ADR-167). Example (golden
mission, 101003): a 96% call, accepted "Heaped; photos confirm" → `COMPLETED`, billed throughout.

**How it is built** (agent defaults, ADR-365; `apps/api`'s `Acceptances` and `Voids`, the worker's
run): an acceptance belongs to one flag and is made once; a flag is on a ticket by its number, so a
renumbered field event's flag is a new one, accepted again; a flag on a `PENDING` ticket may be
accepted; an acceptance isn't taken back (correct the record instead); a flag the worker cleared
can't be accepted. **A void ticket has no open flag**: its flags are cleared when a person or a
rule voids it, kept in its history, and raised fresh if it is unvoided. A voided ticket's field
events are read by no other ticket's checks from the moment the void is made.

## 5.5 Quantity math

Every quantity is computed by the worker from the events and the setup, in **exact decimals**,
rounded only where stated, and **never taken from a client**: the phone's figures are what printed,
the engine's are what bill (ADR-217). A **derived** figure (a split share, a tandem's apportioned
weight) is stored apart from what was observed, and the parts **sum exactly** to the whole (ADR-035,
055). The billing unit keys are `CY` `TN` `EA` `LB` `HR` `CREW_DAY` `TBN` (`spec/CONVENTIONS.md` §4).

**Loads and haul-outs**
- **Capacity** is the certification's, in whole CY, computed exactly as `adms-certifications` §3A.3
  says; never typed, and a truck keyed in by hand still bills the cert's capacity (ADR-076, 154).
- **Volume (CY) = capacity × load call ÷ 100.** A whole CY times a whole percent never needs more
  than two decimals: `730415` 65 CY × 80% = **52.0 CY** (golden mission, 101001). A 0% call is 0 CY
  (ADR-116). A haul-out's call is its collection's, at the TDSR (ADR-013).
- **Weight (TN):** the scale weight the tower entered instead of a load call, where the site's lookup
  said the load is paid by weight (ADR-165, 223, 227). **One weight shared by a tandem** is split by
  **certified capacity**: 17.10 t over 30 CY + 40 CY → **7.33 t** and **9.77 t**, both flagged
  (ADR-175). A weight-paid haul-out keeps its loading-end call, unbilled (ADR-227). Receipts:
  `adms-scale-receipts`.
- **Split shares:** each property's share = its estimate ÷ the sum of the estimates, applied to the
  load's CY or tons. Golden mission 102001: 36.0 CY, estimates 12 and 18 → **14.4 CY** and **21.6 CY**
  (ADR-055, 064). Rules then run per property (§5.3).
- **Split haul-out shares** (ADR-295): each pile records a **running** load call, how full the
  container is after it; the last is the haul-out's call. A pile's part = its call − the call before
  it; its CY = capacity × that part ÷ 100; its share of a scale weight = that part ÷ the last call,
  to two decimals, the remainder given to one pile (the largest, the last of equals: agent default, ADR-343) so the shares sum exactly. Golden mission 201004: `730419`, 110 CY,
  calls 10%, 35%, 85% → parts 10, 25, 50 → **11.0, 27.5 and 55.0 CY** (93.5 CY); the mission pays it
  by weight (ADR-297), and its 24.00-ton scale weight → **2.82, 7.06 and 14.12 t**, the billed quantities. A call not higher than the one before it is flagged and the piles
  aren't shared out until it's corrected. The load-call limits judge only the last call.
- **A load that carries tickets:** a load of stumps is **each carried stump's CY, rounded half up to
  a tenth, then added** (4.8 + 7.8 + 12.0 = **24.6 CY**), so the load always equals its stump
  tickets; a load of white goods is **the count of items** on the tickets it carries (ADR-192, 204).
- **Mileage** is stored unrounded and **compared in tenths, half up** (10.04 → 10.0, 10.05 → 10.1);
  how it's measured is `adms-ticket-workflows` §4.2 (ADR-125, 163, 208).

**Unit rate**
- **Circumference → diameter:** rules and bands read a **diameter**; a circumference is converted as
  **C ÷ 3.14, rounded half up to a tenth**, and both numbers are kept. Golden mission 301002: 56.5 in
  → **18.0 in** → band 6–24 in → `LNR-RMV-EA-24` (ADR-177, 213, 217). A stump is always a diameter.
- **Stump CY** (only for a load of stumps; **never pays a stump ticket**, ADR-196, 198), from the
  USACE Stump Conversion Guide, with D = the diameter two feet up, in inches:
  ```
  stump CY = [ (D² × 0.7854) × 24  +  ((3.6 × D)² × 0.7854) × 31 ] ÷ 46,656
  ```
  24 in is the stump height solved from the guide's table; the root ball is 3.6 × D across and 31 in
  deep, fixed by the guide. **Rounded half up to one decimal**: 30 in → 6.450 → **6.5 CY**. The
  guide's 79-row table (6–84 in) matches with no exceptions and is the unit-test fixture (ADR-178,
  183). One formula at every size; no maximum (ADR-187).
- **Fill CY** (the stump hole, from the **root ball's measured diameter** RB):
  ```
  fill CY = 0.7854 × RB² × depth ÷ 46,656      depth = the project's fill depth, default 31 in
  ```
  **Rounded half up to a tenth**: 96 in → 4.809 → **4.8 CY** (golden mission 301004). No root ball,
  no fill CY, so no fill line. The depth is a project setting (the USACE root-ball height by
  default); a root-ball reading never goes into the stump CY as D (ADR-196, 198, 203).
- **Counts (EA):** the count the monitor entered ("Count is always 1" makes it 1). For itemised work
  the rule's *Quantity from* picks **all items** or **chosen items**: white goods pay per item
  removed, not by type, so 2 washers + 1 dryer + 3 fridges removed = **6** (ADR-126, 128, 131, 132).
- **Pounds (LB):** HHW's pounds, entered as the count (ADR-040, 054).
- **Crew time:** the **highest item's hours, once** (Skid Steer 9.75 h, Truck 8.50 h → **9.75 h**,
  golden mission 301007), then the pay item's conversion: **per hour**; **per day, exact** (hours ÷
  the day length, default 12); or **per day in steps** the admin sets. These three are the only ones;
  a contract that fits none is a new ADR (ADR-084, 087, 126). By exact division the quantity keeps
  **four decimals, a half up** (10.25 h ÷ 12 = 0.8542); hours that fall in no step **bill nothing on
  that line and the ticket is flagged** (the user, 2026-10-05, ADR-355).
- **TBN** bills nothing until the rate is agreed; entering it reprocesses the un-invoiced tickets
  (ADR-068, 090).

---

## History

What this page used to say, and why it changed. Never build from the left-hand side.

- "A reviewer who may correct may also accept" a flag (ADR-166) → *accept flags* is a grant of its
  own; *correct* doesn't carry it (the user, 2026-10-06, ADR-365; KD-74).

- Titled "as implemented": validators as Python pure functions in `validators.py`, `evaluate_rules`
  with JSON condition keys and error codes (`RULE_DEBRIS_TYPE`, `RULE_DISTANCE_EXCEEDED`…), unit
  tests in `pytest` → the engine is rebuilt in TypeScript; checks and formulas live once in
  `packages/domain`; flag codes and wording go to `spec/FLAGS.md` (ADR-093, 094).
- Statuses `MATCHED` / `FAILED`, and a "soft codes" escalation (`DISPOSAL_GPS_TOO_FAR`,
  `TIMING_OVERLAP`, `ROUTE_DRIFT_EXCEEDED` → review, anything else → `FAILED`; "a person's error is a
  hard fail") → four statuses; every problem a flag; review still bills (ADR-011, 012 → 060).
- A load's "halves" checked as a pair of stage tickets → field events grouped on the bare number
  (ADR-019, 236). Pairing on a composite key (cert, zone, debris type, timing) → those are checks on
  a grouped ticket (ADR-010 → 019).
- Zone equality between the halves, "split members share a zone", and the collection route check
  (`MAX_ROUTE_DRIFT_M`, route drift) → the zone attached from the map; the boundary check (ADR-135,
  136, 141).
- Load call valid only in `0 < n ≤ 100`, and load-call limits as rule conditions → 0 accepted and
  flagged; limits a project setting (ADR-116, 164, 181).
- Cert expiry judged against "now", driver's licence expiry flagged, `CERT_WRONG_PROJECT` → work
  time; tag expiry, revocation and replacement flag; licence flags nothing (ADR-048, 079, 153).
- Rules targeted at one `ticketType` stage, "do not make rules type-agnostic", and the silent no-op
  table (rules on `HAUL_OUT_DISPOSAL`, `LOAD`, `HAUL_OUT` never run) → rules belong to a form and all
  of its active rules run; each criterion names its field event (ADR-109, 239; KD-15).
- Rule violations resolving to a failure, match vs require conditions, the same-fee-kind conflict
  → criteria only match; *Add / Remove transaction #n*, *Void ticket*; the # is the conflict key
  (ADR-089 → 109, 118, 130, 131).
- A contractor condition and a contract on each action ("the ticket's own contract") → one contract
  per rule, run only on its prime's tickets (ADR-054, 174 → 239).
- Each half carrying the service code its monitor picked, "pay items differ" and a wrong-prime-code
  flag, rules reading the collection's code, a "requires weight" box and a scale-data rule condition
  → the monitor picks a debris type; a load carries no pay item; one quantity from the paying pay
  item's Unit of Measure; a line missing its quantity is flagged (ADR-182, 186, 191, 175 → 207,
  223, 227, 237).
- Site options Disposal · Staging · Haul-out, then the legacy boxes Allow Collection · Allow Disposal
  · Disposal Fee · Ineligible · Critical, and "no site option flags anything" → site facts; a ticket
  at a site without the matching fact is flagged (ADR-193, 205 → 215, 219, 222, 226, 234).
- `compute_volume` (feet box, unrounded, crew cert returns nothing) → the cert's capacity from
  `adms-certifications` §3A.3 × the load call (ADR-076). Stumps paid from the stump's CY, or the fill
  from 3.6 × D → paid from the stump or the fill CY, the fill from the measured root ball (ADR-187,
  189 → 196, 198, 203).
- Round 13–22 ⚠️ notes stacked on the historical body → absorbed; rewritten in the present tense,
  in field events and today's words (ADR-138, 234, 236, 244).
