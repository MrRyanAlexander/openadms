# Part 4 — Capture in the field

✅ **Approved**

← [Part 3 — Certify](03-certification.md) · [Index](../INDEX.md) · Next: [Part 5 — Sync](05-sync.md)

> **Approved by the user 2026-09-29** (ADR-269), in today's rules (rewritten 2026-09-29, ADR-247). Sequence here; rules in the
> skills, which win on disagreement (the detail of every workflow: `adms-ticket-workflows` §4.1a–§4.6).
> How the phone stores, prints, scans and photographs: `spec/ARCHITECTURE.md` §8, §11, §12.

## What it does

Each monitor records a **field event**: what they saw, where and when, under a ticket number,
**offline**, on an enrolled phone holding their day's assignment (ADR-236, 240). The monitor enters
only the main ticket, fast; fees, pricing, zones, mileage and checks are the system's work, after
sync (ADR-224). The phone never refuses honest work; every problem is flagged later (ADR-052).

## Every capture: badge first, number last (ADR-209)

1. **New: scan the badge** (the crew badge for unit rate). The certification loads, capacity
   included; **a monitor never types capacity** except for a truck keyed in by hand, which is flagged
   and bills the certification's capacity (ADR-154). **The certification says whose work it is**
   (ADR-186). The field event waits in the phone's open list while the truck loads.
2. **The phone records** who (the monitor), which phone, the **assignment** and **setup version**
   (ADR-240), the device clock's time, shown in the project's time zone (ADR-100), and whatever GPS
   fix it has, never judged on the phone (ADR-083). **Photos** come from the camera, never the
   gallery, fingerprinted when taken, at most 8 per ticket (ADR-101, 157).
3. **Complete: the details**, picked **by name, never a code or a rate** (ADR-207).
4. **The number**: the control ticket scanned, or a generated number shown at that point, then
   **re-entered by hand** to confirm. A number typed because a barcode won't read is flagged and
   needs a reason (ADR-111, 209). Then **the receipt prints**, on every project (ADR-102, 115).

A field event started by mistake can be **cancelled**; it stays on the phone, unsynced (ADR-056). A
finished one can be **reopened until the monitor ends the shift** (ADR-240). **The site comes from the
assignment**, never picked (ADR-195, 240).

## Workflow A — a load (`COL` → `DIS`)

**The collection event, at the curb** (the phone has no site):
1. **New**: scan the badge. GPS at load start and load end.
2. **Complete**: the **debris type** from the load form's list, and optionally a **field tag**
   (ADR-211, 218); on an ROE project the **ROE**; on a split the property's **estimate**; on a load
   that carries tickets, each carried ticket **by its number** (ADR-192, 204). **Capture GPS**, then
   **Look up address** (our own Nominatim server when online; else the street number and name typed)
   (ADR-111, 119). No load call, no zone, no destination: the system checks where debris went,
   never where it was headed (ADR-135, 205).
3. **The number**, scanned or shown, re-entered. **Print** two copies, or hand over the control
   ticket and keep its stub (Q-95). The truck carries the number.

**The disposal event, at the tower** (a different monitor who never saw the curb). The phone's
assignment names the site, and its lists carry **that site's lookup** of what to ask for, per
debris type and prime (ADR-227, 240, 243):
1. **New**: scan the badge (it gives the prime).
2. **Complete**: the **debris type**, picked on its own (compared later, never copied).
3. **One quantity, never both** (ADR-223):
   - the **load call**, a whole percentage of certified capacity, typed: **the billing number**. No
     picker, no suggestion; 0 is accepted and flagged (ADR-111, 116);
   - or the **scale weight** from the scale receipt, where the lookup says the load is paid by weight
     (`adms-scale-receipts`); a Final Disposal tower may also offer the receipt number (ADR-227);
   - or, for a load that carries tickets, a **count** of the stumps or items on the truck; the worker
     compares it with the collection's list after sync (ADR-192, 243).
4. **The number** the truck carries, scanned and re-entered; never generated here. The tower holds no
   ticket list and trusts the scan (ADR-071).
5. The end GPS (checked later against the site's area) and **empty-bed photos**. **Print** the
   disposal copy for the driver; on a control-ticket project the details may be written on the back of
   the control ticket instead (ADR-115).

A load collected one day and dumped the next (a **preload**) is normal. A load turned away isn't
recorded; a load has one disposal (ADR-053, 155).

## Split loads — one truck, several properties

Only on a project that **allows split loads** (ADR-137), where "normal or split?" is asked at the
start of a collection:
1. At the first property the collection is **`-A`** on the base number, never bare (ADR-173): its
   ROE, its **estimate** in CY.
2. At the next property, **split**: a new collection event, `-B`, with its own time, GPS, ROE and
   estimate. Repeat.
3. The driver carries **one** barcode, the base number; one disposal is recorded against it (ADR-032).

Each property's share of the load = its estimate ÷ the total (ADR-055). How the phone chains the
suffixes: `adms-field-app` §4A.3.

## Workflow B — a haul-out (`HOC` → `HOD`)

The same two events with **one inversion: the load call is taken at the loading end**, at the TDSR,
always, since that end can't know where the truck goes (ADR-013, 227). Each end's site comes from its
phone's assignment (ADR-195). The haul-out collection picks the debris type from the haul-out form
(Mulch, Ash…), takes the load call, makes the number and prints. The haul-out disposal at the final
site picks the debris type on its own, takes the **scale weight** only where its site's lookup says
the haul-out is paid by weight (then the loading end's call is kept, unbilled), and photographs the
empty bed (ADR-223, 243). **A haul-out never dumps at a TDSR** (ADR-226).

## Workflow C — unit rate (`URT`, one event, no pairing)

1. **New**: scan the **crew badge**; it stays on the phone until the monitor changes crew (ADR-111).
   A crew is its certification (ADR-228).
2. **The crew photo**, then pick the **payable type** by name (Hangers, Leaners, Stumps, White Goods,
   Crew time…; each shown once). The phone **works out the pay item** from the size bands and prints
   it; the monitor never sees a code or a rate (ADR-207, 213).
3. **Record the work** as its kind asks: hangers removed and one measurement; a leaner's measurement
   at chest height, **as a circumference or a diameter** (the monitor says which); a stump's diameter
   two feet up, root-ball diameter, "half or more exposed" and survey number; white goods or HHW as
   an item list (HHW pounds as the count); crew time as items with hours to the quarter hour
   (ADR-126, 158, 177, 198). Optionally a field tag; the ROE on an ROE project. Where the pay item
   allows it, the monitor may **mark the work ineligible** (flagged, ADR-210).
4. **The number** (always generated), shown and re-entered; **print** the crew copy (Q-95).

What each kind captures and bills, bands, stumps and fill: `adms-ticket-workflows` §4.5.

## Workflow D — forms (records, never billed)

Started as "start → pick the work type or type → details" (ADR-127): **ROE** (number, parcel, owner,
signed and date, scope, a photo of the signed form; ADR-149, 181), **pre-work** and **post-work
survey** (linked by ROE number; ADR-150), **incident** (type, then the firm's sub-type; records only,
never stops work; ADR-052, 137), **citizen drop-off log** at a site (no quantity, number or cost;
ADR-184, 188). Surveys, ROE forms, incidents and drop-off logs may carry the firm's own fields
(ADR-160). Each is QC'd on its own (ADR-168).

**A device failed?** The back office creates the record, marked with the person and a reason,
flagged, and it pairs normally (ADR-156).

## Rules it follows

- Field events, the load call, who's who → `adms-domain` §1.2–§1.4
- Every workflow's events, fields, splits, loads that carry tickets, unit rate kinds, forms →
  `adms-ticket-workflows` §4.1a–§4.6
- The phone: offline, advisory checks, the capture screens and order, printing → `adms-field-app`
- Scale weights → `adms-scale-receipts`; checks after sync → `adms-validation`

## Where it will live

The capture screens in `apps/field` (Phase 3: browser, then iPhone, then Android); the rules shared
with the server (capacity, bands, numbering) in `packages/domain`; the sync payloads in
`packages/contracts` (ARCHITECTURE §18). Not built yet: Phase 0 has only a provisional database schema (ADR-268).

## Open questions

None (ADR-230).
