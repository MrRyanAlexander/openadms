---
name: adms-domain
description: Open ADMS domain grounding and glossary. Read this before your first task in any conversation, and before explaining or demonstrating the domain. Covers what an ADMS is, why a load is recorded as two field events by two monitors who cannot see each other, joined on the ticket number, the load call, who's who (the firm that installs it, its users, client users, the outside parties it keeps records of), a ticket's life from setup to the client package, why nothing is deleted, the glossary in today's terms, the system invariants, and where the product is headed.
---

<!-- skill-status: current (ADR-138, rewritten 2026-09-29, ADR-232; field events and pay items, ADR-236, 237; contracts on rules, assignments, time clock, ADR-239…241; a pay item's unique code and description, ADR-301; the policy values built, ADR-303; the number at New, ADR-571; the number typed again only where a person copied it, ADR-573; a number the phone makes never typed again, ADR-589) -->

> **This page states today's rules** (last changed by ADR-589, as its status line lists). Each rule cites its ADR; what changed is in
> the History list at the end. The user's own words are quoted and marked **User**. If this page and
> `agent_store/SUMMARY.md` disagree, SUMMARY wins: log a KD (`adms-decisions`). The worked example
> of all of it is `spec/golden/MISSION.md`. **Names and examples** follow `spec/CONVENTIONS.md`
> (ADR-234, 235): the industry's keyword or plain English, never a legacy screen label; examples from
> its example world, never the retired ones (its §7).

> **User, 2026-09-28 (ADR-197):** "What the firm using Open ADMS sets up, ultimately decides how
> things play out. The agents goal needs to be to hardcode as little as possible to give the end
> user (a firm, a non profit, whoever) the flexiblilty and configuration. The system should have
> default setup that are tailored to debris removal monitoring work" … "Create a project, name
> things in ways the match the contract and document the work. QC it up and done."
>
> So before proposing a new ticket type, unit, criterion or behaviour, or asking how a contract line
> works, check whether a project, names, pay items, rules and lists already express it. Propose code
> only when setup can't, as a built-in value or setting with a default the firm can change.

# PART 1 — WHAT AN ADMS IS

## 1.1 The real-world problem

After a hurricane, tornado, wildfire or flood, a jurisdiction (county, city, state agency) is buried
in debris. FEMA and/or USACE reimburse it for hauling that debris away, **but only for debris that
is proven eligible, measured and documented.** Undocumented debris is unreimbursed debris.

The jurisdiction hires **hauling contractors** to pick debris up, and separately hires a
**monitoring firm** to watch the contractors and document every load. Contractors are paid per
unit. That is the central tension of the industry:

> **The party being paid per unit is the same party reporting how many units there were.**

Debris fraud is real and prosecuted: trucks that haul air, beds measured dishonestly, loads recorded
twice, debris from outside the eligible area, ineligible material billed as eligible, trucks that
leave the dump half full and bill the same debris again.

**Everything happens offline.** Curb and dump alike have no signal. Every phone is disconnected all
day and syncs at the office that evening, or later, in any order. So **every control is an
after-the-fact control** (ADR-030).

**An ADMS is the evidence machine that makes that fraud hard and honest work reimbursable.** It is a
chain-of-custody and billing-integrity system that happens to run in the field, not a logistics app.
It serves one sentence:

> **For every dollar billed, produce a GPS-stamped, photo-backed, dual-witnessed, audited record
> proving that a specific certified container or crew did specific eligible work, from a specific
> place to a specific approved site, at a specific time.**

## 1.2 Why a load is recorded as two field events

A truckload is **two events**, far apart in place and time, witnessed by **two monitors who cannot
see each other**. Each monitor records a **field event**: what they saw, where, when, under the
ticket's number (ADR-236).

| Event | Where | What that monitor can honestly attest to |
|---|---|---|
| **Collection event** (`COL`) | the curb, the property, the right of way | where the debris came from, what kind it is, when it was loaded |
| **Disposal event** (`DIS`) | the tower at the disposal site | how full the truck arrived (the load call), where and when it dumped, that it left empty |

**The number carries the load from one event to the next.** The collection monitor makes the number
(scans a pre-printed control ticket or shows a generated one) and the truck carries it to the tower,
whose monitor scans it. **User, 2026-09-29:** "a collection monitor "makes" a number for a disposal
monitor who calls the loads size from a tower … So in the end we have Event "collection" for ticket
#12345, and Event "disposal" for ticket #12345."

Neither monitor can fabricate a billable load alone. **Only the server joins the events**, by their
shared bare ticket number, and flags anything their independently captured facts disagree on. A
collection with no disposal is a truck that never dumped; a disposal with no collection is debris
from nowhere. **A ticket is its number and the events recorded under it.**

| Workflow | Events, in field order | Makes the number | Takes the quantity | The system concludes |
|---|---|---|---|---|
| **Load** | collection `COL` → disposal `DIS` (a split: one `COL` per property, `-A`, `-B`…) | the collection | the disposal: load call or scale weight | the completed load `CLT` |
| **Haul-out** | haul-out collection `HOC` at the TDSR → haul-out disposal `HOD` at the final site (a split: one `HOC` per pile, `-A`, `-B`…, ADR-295) | the haul-out collection | the haul-out collection: its load call from the tower (flipped from a load); the disposal confirms it dumped and left empty | the completed haul-out `CHO` |
| **Unit rate** | one unit rate event `URT`, complete on its own | the unit rate event | its own count, measurement or hours | its transactions |

**The events are the evidence; everything else is the system's conclusion from them.** The
completed load, the status, the flags, the zone, the mileage and the transactions are **not events**:
the worker draws them from a ticket's current events and the firm's current setup, writes them
itself, and draws them again whenever an event or the setup changes (ADR-019, 062, 085, 086). No
person can author a completed load or haul-out.

- **Arrival order means nothing.** Events sync in any order, on any day; the engine orders them by
  field time. A ticket waiting for its other event is `PENDING` and **never expires** (ADR-030, 053).
- **One event of each kind per ticket** (one collection per split property). A second one on the
  same number is a duplicate, quarantined at sync for a person (ADR-022).
- **Events are corrected, never replaced.** A monitor never edits an event after submitting it on the phone (ADR-477); a
  permitted person corrects any field in place, the prior value kept in `AuditRecord` (ADR-051, 097).
  This is event-*driven*, not event-*sourced*: there are no "correction events", and the audit log
  keeps every prior value (ADR-236).
- **Forms and certifications are records, not a ticket's events**: an ROE, a survey, an incident or
  a drop-off log never pairs and never bills (ADR-236, agent default).
- **Words:** say *field event* or its kind (*the collection event*); **never a bare "event"** where it
  could mean the disaster, which is always the *declaration event* (`spec/CONVENTIONS.md` §2).

## 1.3 The load call: the number the money hangs on

A container is **certified** once (measured, photographed, given a cert number) to fix its capacity
in cubic yards. Nobody re-measures a truck per trip. At the tower the monitor looks into the bed and
types **what percentage of that capacity is filled**: the **load call**, a whole number 0–100.

```
billable CY = certified capacity × load call %
```

- **A load call is a money decision, not data entry.** Ten points on a 40 CY truck is 4 CY of public
  money, every trip.
- **Extreme calls are flagged, never refused:** at or under **5%** and at or over **95%** by default,
  a **project setting** the firm changes or turns off; not a rule criterion (ADR-164). **0% is always
  flagged** and bills nothing (ADR-116, 181).
- **One quantity, never both.** When the pay item the firm's rules pay a load at is measured by weight
  (its **Unit of Measure**), the tower enters the **scale weight instead of a load call**; the back
  office works out ahead what each site's phones ask for (ADR-165, 223, 227).
- **Where the call is taken depends on the workflow:** at the tower for a load; **at the loading end
  (the TDSR)** for a haul-out, whose disposal has no load call (ADR-013, 027).
- **Some loads have no call at all:** a load of stumps or of white goods takes its quantity **from
  the tickets it carries** (a setting on the pay item) (ADR-192, 204, 215).

## 1.4 Who's who

**The firm and its installation.** Open ADMS is self-installed open source (AGPL-3.0). **A firm
installs it and runs it in its own cloud**: one organisation per **installation** (never an
"instance"), no multi-tenancy. The firm is usually a debris
**monitoring firm**, sometimes a non-profit doing like-kind work. It sets **one master passcode**, and
its setup decides how everything plays out (ADR-050, 063, 099, 106, 112, 171, 197). A firm asking
for an ADMS (e.g. "Gates Disaster Recovery") is the **firm**, not a client.

**Users: people with a login** (ADR-050, 105, 169, 170):

| User | Who | Created by | Signs in | Can |
|---|---|---|---|---|
| **Admin** | the firm's back office | an admin | back office, two-step sign-in required | everything, setup included |
| **Manager / analyst** | the firm's back office | an admin | back office, two-step required | what they're granted: review, correct, renumber, void, accept flags, QC, lock as invoiced; and which parts of the back office they see (view review, setup, dispatch; an act needs its part's view, the user, ADR-539) |
| **Field monitor** | the firm's (or a monitoring sub's) field staff; each has a system **Monitor ID** (`M004127`) | the master user, **on a phone, online** | Monitor ID + password on an **enrolled phone**, which takes their day's **assignment**; offline from its login list | make records on their assignment's one project; never edit one after submitting it; never see a rate or a code |
| **Read-only viewer** | a **client user**, a **contractor user** or an **auditor** | an admin | web, two-step optional | clients and auditors see their whole project except personal phone and licence numbers; a contractor sees only its own tickets and transactions (a prime, its subs' too) |

The **master passcode** is not a user: whoever holds it (a supervisor) can enrol a phone, set one up
when its monitor has no assignment, create monitors on it, sign in as its monitor, switch its
monitor, and sync and turn it in (ADR-095, 105, 240).

**Records the firm keeps: parties, not logins.** A **client** is a record; a **client user** is a
viewer login belonging to it.

| Record | What it is |
|---|---|
| **Client** | the jurisdiction or agency paying for cleanup. Reused across disasters; editable; archived, never deleted |
| **Declaration event** | the disaster and its reference (`DR-9001-FL`, a state or local declaration, an internal code). One shared record; many clients' projects point at it (ADR-023, 026) |
| **Project** | one body of work for one client under one event: the hub everything hangs off. A **separate project per funder or kind of work** (ROW, PPDR…) (ADR-024, 148) |
| **Contractor** | a hauling company: a **prime** holds a contract; a **sub** works under one prime, at most two tiers, typed in at certification. Monitoring subs and temp agencies are contractors of the monitoring kind (ADR-108, Q-97) |
| **Contract** | a name, its prime, an optional link to the signed copy. A pricing rule names one, and runs only on tickets of its prime (ADR-146, 174, 239) |
| **Disposal site** | where debris legally goes, entered on each project that uses it (ADR-145, 215) |
| **Property owner** | named on an **ROE** (Right of Entry), required where the program type requires it (ADR-149) |
| **Driver** | a name on the certification only; there is no driver list (ADR-153) |

## 1.5 Why nothing is deleted

Every operational record may be evidence in a federal audit or a fraud case years later. A deleted
ticket is a destroyed record. So:

- Reference data (clients, contractors, pay items, rules, sites, users) is **archived**; a project is
  **closed**.
- **Tickets are never deleted.** Work that never happened is **voided**, with a reason; mistakes are
  **corrected in place** by permission, prior values kept (ADR-051, 060).
- **`AuditRecord` is append-only**, absolutely. Every change writes one, attributed to a real actor;
  the database writes it itself (ADR-097).
- **Transactions are the current truth, regenerated** when a ticket changes; each removed row is
  copied in full to `AuditRecord` first. No reversal rows (ADR-085).

## 1.6 A ticket's life, end to end

Which records exist: a **load** (collection + disposal → completed load), a **haul-out** (haul-out
collection at the TDSR + haul-out disposal at the final site → completed haul-out), a **unit rate
ticket** (one record: hangers, leaners, stumps, white goods, crew time…), and **forms** that never
bill (ROE, pre- and post-work surveys, incidents, citizen drop-off logs). Numbers are **bare**, from a
per-project series per workflow (100,001 and up); `COL` `DIS` `CLT` `HOC` `HOD` `CHO` `URT` are
display labels only (ADR-046, 062). The life of one load:

1. **Setup (back office).** Client → event → project; contracts; forms with their debris types;
   pay items with a rate per prime; sites and their facts; rules; certifications. A setup check lists
   gaps before the field day (ADR-229).
2. **Dispatch (back office, daily).** Each phone is **enrolled** once. The **dispatch board** gives
   each person the day's **assignment**: one project, their work, **one site** if they work at one
   (tower, haul-out ends). The monitor signs in on any enrolled phone and it takes their assignment.
   With none, the master passcode sets the phone up on the spot, recorded as an *unplanned
   assignment* (ADR-095, 195, 240).
3. **Capture (offline): each monitor records a field event.** **New** → scan the badge (the
   certification says whose work it is) → **the number**, scanned, or made by the phone and opening at once (ADR-589); typed again by hand only where a person copied a pre-printed one (ADR-573) →
   the event waits in the open list while the truck loads, left and resumed as the work allows (one
   open per truck on a phone) → **Complete**: the details (a load's **debris type**; the tower's load
   call or weight) → printed receipt (ADR-571 moved the number to New). **Sealed for the monitor once submitted**: never reopened or edited by them, synced or
   not; until then open and theirs to adjust, for days if the work takes days (ADR-209, 477). Each event records its assignment and the setup version the phone had.
4. **Sync (whenever there's signal, any order).** Every event is received, and each one queues reconciliation of
   its ticket. The only rejection is a duplicate
   number, quarantined in full for a person (ADR-022).
5. **Reconcile (the worker).** Group events by project + workflow + bare number. A ticket with only
   one of its events stays `PENDING` and **never expires** (preloads are normal). A pair is checked (certification at work
   time, times, the site's area and facts, the project boundary); the zone and mileage are attached;
   every passing rule runs in # order (creates, deletes, voids) and writes transactions; the system
   writes the completed load. **Status:** `COMPLETED` when nothing is open, `MANUAL_REVIEW` when a
   flag is (it **still bills** if an amount can be computed) (ADR-052, 053, 060).
6. **Review (back office, one queue).** A permitted person **corrects** any captured field in place,
   **renumbers** real work, **voids** what never happened (`VOID`, reason required, stops billing) or
   **accepts** a flag that's right as it is (reason). Each reprocesses the ticket: the worker draws
   its conclusions again from the corrected events (ADR-051, 166).
7. **QC (by hand).** QC Review → QC Approved / QC Issues / QC Void, on the **completed load, never a
   single event**; unit rate tickets, forms and certifications are QC'd on their own. QC changes nothing on
   the record (ADR-107, 168).
8. **Invoice lock.** Only QC Approved tickets lock, optionally in a named **invoice batch**; an
   unlock is audited. A rate or rule change regenerates only un-invoiced tickets (ADR-057, 090, 121,
   228).
9. **Client package.** The back office assembles tickets, photos, receipts and transactions from the
   exports, by hand, and zips it (ADR-057, 088).

Every step writes `AuditRecord`. A unit rate ticket skips pairing; a form never reaches pricing.

---

# PART 2 — GLOSSARY (today's words)

| Term | Meaning |
|---|---|
| **Active window** | A project's start and end dates. Tickets outside it are flagged "project not active", judged by a load's time (its collection's end) (ADR-057, 161) |
| **Assignment** | One person's work for a day: project, their work (ticket types, unit rate pay items, certifying), one site where the work is at one, optionally a phone. Written on the back office's **dispatch board**, or on the phone with the master passcode when there's none (an *unplanned assignment*, marked). What a phone may make comes from it; the time clock hangs on it. Never expires, never stops work (ADR-240, 241) |
| **Badge** | Carries the certification number; scanned at **New** to load the truck's or crew's certification (ADR-056, 209) |
| **Certification** | A one-time inspection of **a container** (measured, capacity in CY, five photos) or **a crew** (not measured), **never a vehicle**. Never ends on its own; tag expiry, revocation and replacement flag later tickets. A crew **is** its certification (ADR-015, 079, 157, 228; `adms-certifications`) |
| **Cert number** | One number: cert = placard = badge. System-issued from the project's series or taken from pre-printed paper; unique per project; copied onto every ticket (ADR-045) |
| **Citizen drop-off log** | A reference log like an incident, not a ticket: a drop-off happened at a site. No quantity, number or cost; the pile bills when it's hauled out (ADR-184, 188, 215) |
| **Client package** | The deliverable: a project's final tickets, photos, receipts and transactions, assembled by hand and zipped. There is no invoice record (ADR-057, 061) |
| **Completed load / haul-out** | `CLT` / `CHO`: the record the system concludes from a ticket's two field events (a split's collections included); **not an event** itself. The only load record that is QC'd and locked (ADR-168) |
| **Contract line item** | A line on the paper contract. The firm enters pay items and rules for it; a contract usually prices a line **per CY and per ton**, and the firm's setup picks (ADR-202) |
| **Control ticket / generated number** | A project numbers tickets from pre-printed barcoded stock (ranges entered at setup) or from **1,000-number blocks** on each phone (ADR-056, 065) |
| **Crew time** | A unit rate ticket listing items (Skid Steer, Truck…) with hours to the quarter hour; bills the **highest item's hours**, once, through the pay item's conversion (ADR-084, 126) |
| **Debris type** | What a load or haul-out monitor picks on Complete, **at both ends**: an entry on the project's form, named as the contract names the work (Vegetative, C&D, Mulch, Ash, White Goods). A difference between the two events is flagged; a rule matches only the exact entry. *Reduced* marks reduced ones. **"Debris class" is the same thing**, the legacy's word, used by ADR-207…233 (ADR-234 went back to "debris type"). **User, 2026-09-29:** "debris class and debris type are the same.. legacy had it as class" (ADR-074, 211, 214, 226, 233, 234) |
| **Declaration event** | See §1.4 |
| **Dispatch board** | The back office's daily plan of assignments (replaces the dispatch spreadsheet); shows planned against actual as views, never ticket flags (ADR-240) |
| **Disposal site** | A **site type** (TDSR/DMS · Final Disposal · Transfer Station · Other) plus facts: **Haul-outs leave here** (haul-outs leave from it), **Takes loads** (loads end there), **Charges a tipping fee** (the firm writes the site's tipping fee pay item from it), **Ineligible site** (flagged, still bills). A permit, GPS, an area (circle or shape), activation and close dates. A ticket at a site without the matching fact is flagged (ADR-111, 136, 145, 173, 215, 222) |
| **Field event** | What one monitor records under a ticket number: one thing witnessed at one place and time. Kinds: collection `COL`, disposal `DIS`, haul-out collection `HOC`, haul-out disposal `HOD`, unit rate `URT`. Evidence: received at sync, never edited by the monitor after, corrected in place by permission. Everything the system writes is drawn from events. Never a bare "event" (the disaster is the *declaration event*) (ADR-236) |
| **Field tag** | The legacy "Special Class": a project list the firm fills, starting empty (e.g. Mixed); read only by the *Field tag* rule criterion and exports. **No monitor picks one on a phone** (the user, ADR-591); whether it stays as a back-office label is KD-80 (ADR-216, 218, 234, 591) |
| **FDS / TDSR** | Final Disposal Site / Temporary Debris **Staging** and Reduction Site (DMS means the same). Debris is reduced at a TDSR and hauled out to an FDS; a haul-out never dumps at a TDSR (ADR-091, 226) |
| **Flag** | How every problem is raised after setup: a plain message ("Ticket 101008: debris type mismatch. Flagged for review."), never a refusal. A reviewer fixes it or **accepts** it with a reason (ADR-052, 166) |
| **Form** | The legacy "Document Format": a project picks one per document type (load, haul-out, unit rate, truck certificate…); debris types are added to it. Surveys, ROE forms and incidents may carry the firm's own fields (ADR-160, 211) |
| **Haul-out** | The second leg: debris leaving a TDSR for final disposal. Load call at the loading end (§1.2, §1.3). Where the project allows split loads it may be loaded from several **piles**: one haul-out collection per pile (`-A`, `-B`…), each giving the load call so far; the last is the haul-out's, and rules run per pile (ADR-295; golden mission 201004) |
| **Installation** | One firm's running copy of Open ADMS (never "instance") (ADR-112) |
| **Invoice lock / batch** | "Invoicing" means locking QC Approved tickets as invoiced, optionally grouped in a named batch; a locked ticket is unlocked (audited) before an edit (ADR-057, 121, 228) |
| **Load call** | §1.3 |
| **Login list** | The sign-in checks a set-up phone holds for its project's monitors, for offline sign-in (ADR-105) |
| **Master passcode** | One per firm; opens phone setup and the supervisor's actions (§1.4) (ADR-095, 106) |
| **Mileage** | The road distance of the shortest route on public roads from the collection's end GPS (snapped to the nearest road) to **the disposal site's own GPS**, from our own routing server; no route → straight line, flagged (ADR-110, 163, 208) |
| **Monitor / Monitor ID** | A field observer who makes records; the system issues the ID (`M004127`), usable as their username (ADR-105, 120) |
| **Pay item** | A payable thing (the legacy "Service"; renamed by ADR-237, see History): the public-works word for a priced line of the contract as set up: its **code** (the firm's string; setup suggests one from the convention, e.g. `VEG-HAUL-CY-15`, `HNG-RMV-EA`, `spec/CONVENTIONS.md` §5; **unique on its project**, ADR-301), its description (the firm's own words for the work; there is no separate name), payable type, Unit of Measure, size band, capture settings, and **a rate for each prime**. The only place a rate lives. **A load carries no pay item**; a unit rate ticket carries one, worked out from the monitor's payable type and measurement (ADR-206, 207, 213, 221) |
| **Payable type** | **The work** a pay item prices (each pay item is a priced line of it: one work at two rates by distance is two pay items). What a pay item pays for, from the firm's list (the legacy "Classification"; seeded from USACE's umbrella debris types: Vegetative, C&D, Leaners, Hangers, Stumps…): what the unit rate monitor's list shows, each once; exported as a type column. Every pay item has one (ADR-173, 207, 213, 221, 234) |
| **Preload** | A load collected one day and dumped the next. Normal, not flagged; it counts on its collection's day (ADR-053, 161) |
| **Program type** | The kind of work (ROW, PARKS, PPDR, WATERWAY, firm-extendable), each with a "requires ROE" setting (ADR-070) |
| **QC status** | QC Review / QC Approved / QC Issues / QC Void: the back office's mark, set by hand, separate from the status (ADR-107) |
| **Reconciliation** | The worker's run: group, check, attach, price, write (§1.6 step 5) |
| **ROE** | Right of Entry: a record like a ticket (number, parcel, owner, signed date, scope, photo), made on a phone or in the back office; on an ROE project every collection, unit rate ticket and survey carries one (ADR-149) |
| **Rule** | The firm's own pricing tool, per form: **one contract** (runs only on its prime's tickets; blank on a remove/void-only rule) → criteria ("ifs") → actions *Add transaction #n* (a pay item), *Remove transaction #n*, *Void ticket*. All passing rules run in # order (ADR-109, 118, 130, 174, 239; `spec/RULES.md`) |
| **Scale receipt** | The paper an FDS hands the tower; industry says "scale ticket", but it is **not a ticket** and never pairs. Hand-transcribed, only where the contract asks (`adms-scale-receipts`) |
| **Setup (of a phone)** | **Enrolment** once (online, master passcode: its device key). Its work then comes from the day's assignment; setting it up by hand (master passcode: one project, its work, one site, one monitor) is the fallback when there's none. **Never "provisioning"** (ADR-095, 240) |
| **Split load** | One truck gathering from several properties: collections `-A`, `-B`… and one disposal on the base number; each property's share = its estimate ÷ the total; rules run per property. Where the project allows split loads (ADR-032, 055, 137, 162) |
| **Status** | `PENDING` · `COMPLETED` · `MANUAL_REVIEW` · `VOID`. Review still bills; only a person (with a reason) or a rule's Void ticket action voids (ADR-060, 118) |
| **Stump** | A unit rate ticket, kind of work Stumps: diameter two feet up (under 24 in flagged), root-ball diameter, "half or more exposed". Paid from the stump (1 each, by size band) or the **fill CY** = 0.7854 × root ball² × 31 ÷ 46,656, never the stump's CY (ADR-189, 198, 203) |
| **TBN** | "To be negotiated": a pay item whose price isn't agreed; bills nothing until it is (Q-22) |
| **Ticket** | A ticket **number** and the field events recorded under it: a load's collection and disposal, a haul-out's two, a unit rate ticket's one. Flags and the review queue speak of tickets ("Ticket 101008: …"). Paper and printouts are receipts, never records (ADR-236) |
| **Time clock** | Optional per-project add-on for workers' own hours, on an **assignment**: anyone with one clocks in, breaks and out by hand, with simple nudges; activity pre-filled from their field events; a manager approves the day; exported for payroll and client billing (ICS-214 data). Never related to crew-time billing (ADR-063, 241) |
| **Transaction** | One priced line (pay item, quantity, the named contract's prime's rate, prime + operating sub), created by a rule; regenerated when its ticket changes (ADR-085, 212) |
| **Unit rate work** | Per-item work billed per each, per pound or per hour, not per load: one monitor, one place, one ticket, no pairing (`adms-ticket-workflows`) |
| **Zone** | A named shape on the project's map. No monitor records it: reconciliation attaches it from the GPS; outside the project boundary is flagged (ADR-135, 141) |

---

# PART 7 — SYSTEM INVARIANTS

Breaking one is a defect whatever the tests say. Numbers are stable; other docs cite them.

1. **No hard deletes on operational data.** Archive, close or void.
2. **`AuditRecord` is append-only.** Transactions are regenerated; each removed row is first copied
   in full to `AuditRecord` (ADR-085).
3. **Every change writes an audit record** with a real actor, written by the database (ADR-097).
4. **Completed loads and haul-outs are system-written only**, never by a person or a user-facing path.
5. **Records are correctable by permission; the audit log is not.** Any captured field, GPS and times
   included, by a permitted person, in place, prior value kept, then reprocessed. A monitor never
   edits a field event after submitting it on the phone (ADR-477). A locked ticket is unlocked first (ADR-051, 057).
6. **Pick-list values are picked, never typed**; the firm extends the lists it uses (`spec/LISTS.md`).
7. **Rates live only on pay items**, one per prime; never on a ticket, never in code (ADR-206).
8. **A certification certifies a container or a crew, never a vehicle.**
9. **The cert number is the placard number is the badge number.** Never a second field.
10. **A crew certification has no measurement**, by design.
11. **Rules that must match on phone and server live once**, in `packages/domain` (ARCHITECTURE §18).
12. **Only `packages/db` and the two server apps touch Postgres**; no hand-written SQL for modelling
    (ADR-094).
13. *(Merged into 11: validation rules live once, in the domain package. See History.)*
14. **Distance is geodesic**, in one TypeScript module; never Euclidean.
15. **Coordinates are exact decimals** (WGS84), never floats.
16. **Thresholds are policy**: built-in defaults in `.env`, project settings where the firm may change
    them; never literals, **never relaxed to pass a test**. (Built, ADR-303: the release's built-in
    defaults are the env file `packages/domain/policy.env`, read by the domain's `Policy`.)
17. **A pair's links on its completed record stay unique**: they stop the same load billing twice.
18. **Schema changes go through Prisma migrations**; never edit a generated or applied migration
    (ADR-113).
19. **Flag, never block.** After setup nothing refuses field work or a record over eligibility; the
    only sync rejection is a duplicate number, quarantined in full (ADR-022, 052).
20. **Monitors never see a rate or a code.** They pick by name; rules create every transaction
    (ADR-207, 224).
21. **Field events are the evidence; the system's records are conclusions from them.** An event is
    what one monitor recorded; a completed load, a status, a flag, a zone, a mileage and a transaction
    are never events, are written only by the worker, and are drawn again from the current events and
    setup on every reprocess (ADR-236).

---

# PART 8 — WHERE IT'S HEADED

- **Where the product ends up and the road there:** `agent_store/NEXT.md` (the Handoff) and
  `spec/VISION.md` (approved, ADR-269). Phases: 0 foundation → 1 data core and engine → 2 API and sync → 3 field
  app → 4 back office → 5 later features. Later requirements: `agent_store/REQUIREMENTS-LATER.md`.
- **There is no USACE mode** (ADR-077): every project runs the same rules, plus an optional "USACE
  approved" flag on the load call.
- The two long documents in `development/` (the USACE-style requirements worksheet and the target
  architecture) are **read-only background**, not current scope. Where they differ from this page,
  this page wins. **Their truck-capacity section is wrong** (user, 2026-09-24): capacity is only ever
  computed as in `adms-certifications` §3A.3. Their "truck placard number" is the cert number,
  never a second field.
- `database/` is **historical** code (ADR-093): never a source for a rule or a name.

---

## History

What this page used to say, and why it changed. Never build from the left-hand side.

- Statuses `MATCHED` / `FAILED` → `PENDING · COMPLETED · MANUAL_REVIEW · VOID` (ADR-060).
- Reconciled records named `LoadTicket` / `HaulOutTicket` with prefixed numbers → the completed load
  / haul-out on the bare number; labels are display only (ADR-062).
- "A 0 load call is rejected" → accepted, flagged, bills nothing (ADR-116).
- Extreme load calls as rules → a project setting (ADR-164).
- "Service code" picked by monitors, one per prime, binding a debris type → service codes with a rate per
  prime; monitors pick a debris type (loads) or a payable type (unit rate); a load carries no
  service code (ADR-173, 182 → 206, 207, 213, 223).
- Site types including HHW; options Disposal · Haul-out · Staging · Citizen drop-off · HHW → site
  type plus Haul-outs leave here · Takes loads · Charges a tipping fee · Ineligible (ADR-190, 205 → 215).
- Monitors recorded a zone → reconciliation attaches it from the project map (ADR-135).
- Mileage to the disposal's end GPS → to the site's own GPS (ADR-208).
- "Only a person voids" → a rule's Void ticket action may too (ADR-118).
- QC on every half → on the completed load only (ADR-168).
- Actors table with "not built" markers and the `Program` model → the who's who in §1.4; everything
  is rebuilt (ADR-093).
- Invariants 11–14 and 18 named historical files (`database/src/services/`, `queries.py`,
  `validators.py`, `gps.py`, `db:migrate`) → the rebuild's packages (ADR-093, 094); invariant 16's
  `MAX_ROUTE_DRIFT_M` withdrawn (ADR-136).
- Part 8 said the Phase 5 deltas were in `REQUIREMENTS.md` → `REQUIREMENTS-LATER.md` (KD-33).
- Rewritten in the present tense, with a who's who and a ticket's life (ADR-138, ADR-232).
- The legacy screens' names, Service (`service_code`), Classification, debris class, Location Type,
  Allow Collection · Allow Disposal · Disposal Fee · Ineligible, Special Class, *Create / Delete
  Transaction* → service code (code), payable type, debris type, site type, the plain site facts,
  field tag, *Add / Remove transaction*; example values `6A`, `90A`, `M003490`, `DR-4673-FL`,
  "Ticket 104499" → the example world (ADR-234, 235; `spec/CONVENTIONS.md`).
- "A load is recorded in two halves", "a lone half" → **two field events** under one ticket number;
  "an unpartnered event"; the system's records are conclusions from events, and it is event-driven,
  not event-sourced (ADR-236). The workflow table in §1.2 is new.
- "Service code" (ADR-234's word, `ServiceCode`) → **pay item** (`PayItem`); its code stays the code;
  words only (ADR-237).
- "Every rule action names a contract" → a rule names one contract and runs only on its prime's
  tickets (ADR-239).
- "Phone setup (online, master passcode)" each day, synced at the end of the day, reopenable until it
  syncs → enrolled once, the day's **assignment** from the dispatch board, sync whenever there's
  signal, reopenable until the shift ends (ADR-240). Time clock for monitors → anyone with an
  assignment (ADR-241).
- A pay item with a code, a name and a description → a code, unique on its project, and a
  description, both the firm's own (ADR-301, correcting ADR-147's reading of Q-139).
- "New → badge … Complete → the number last" → the number at New, right after the badge; tickets
  left and resumed, one open per truck on a phone (the user, ADR-209 → 571).
- A number the phone made "shown and typed again" (ADR-573) → opens the ticket at once; only a
  pre-printed number typed by hand is typed again (the user, ADR-589).
- "The collecting or unit rate monitor may pick a field tag" → no phone takes one (the user, ADR-591; KD-80).
- "Reopenable until the monitor ends the shift", the phone's edit log (ADR-072, 240 (6)) → **sealed for
  the monitor once submitted on the phone**, synced or not; only the back office changes it; one not
  yet submitted stays open and theirs to adjust (ADR-477, the user, 2026-10-12).
