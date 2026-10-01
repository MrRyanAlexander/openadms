# Part 1 — Set up the project

✅ **Approved**

← [Index](../INDEX.md) · Next: [Part 2 — People & devices](02-people-and-devices.md)

> **Approved by the user 2026-09-29** (ADR-269), in today's rules (rewritten 2026-09-29, ADR-247). Sequence here; rules in the
> skills, which win on disagreement. Names and examples: `spec/CONVENTIONS.md`.

## What it does

The back office builds everything a field event depends on, before any work starts. **The firm's
setup decides how work plays out** (ADR-197): read the contract into projects, names, pay items and
rules before asking for anything new. **User, 2026-09-28 (Q-193):** "Create a project, name things
in ways the match the contract and document the work. QC it up and done." Once setup is in place,
nothing in the system refuses field work (ADR-052). Setup records are reused, stay editable, every
edit is audited, and nothing is deleted.

**Who:** an admin, or a manager/analyst with permission. **When:** before the first field event;
edited any time after (a change reprocesses the un-invoiced tickets it touches, ADR-090).

## Step by step

**The ordered spine**: each step needs the one before it.

1. **Client.** Search for the jurisdiction (Bayline County). If it exists, **select it**, and update
   its contact details if they've changed; otherwise create it (ADR-023).
2. **Declaration event.** Search for the disaster (Hurricane Delphine, `DR-9001-FL`, or a state,
   local or internal reference, with its reference type). Select it or create it. One declaration
   event is shared by every client and project under it (ADR-026).
3. **Project.** Create it under that client and declaration event. **A separate project per funder
   or kind of work** (ROW, PARKS, WATERWAY…), no funder field (ADR-148). Set:
   - its **program type** from the firm's list; its "requires ROE" setting makes every collection,
     unit rate ticket and survey carry an ROE (ADR-070, 149);
   - **Allow split loads**, ticked by default where the program type requires ROEs (ADR-137);
   - its **time zone** (`America/New_York`) and **active window**, judged by a load's time, its
     collection's end (ADR-100, 161);
   - its **ticket-number source**: control tickets (the pre-printed ranges) or generated (a series
     per workflow, load · haul-out · unit rate, from 100,001; phones take 1,000-number blocks)
     (ADR-056, 062, 065);
   - its **cert-number series** for system-issued cert numbers, e.g. from `730415` (Q-96);
   - its **project map**: a boundary and optional zones, uploaded (shapefile, GeoJSON, KML) or
     linked (an Esri layer), kept as dated map versions; the site circle size in its GIS settings
     (built in 200 m) (ADR-135, 136, 141, 142, 144);
   - its **settings**: the load-call limits (at or under 5%, at or over 95%, changeable or off; 0% is
     always flagged), the stump fill depth (31 in) and the two stump checks, the time clock on or off
     (ADR-164, 181, 203, 241).

**Then, in any order**: none needs the others, and all come before the first field event.

4. **Contractors and contracts.** Add each prime to the project, then each **contract**: a name, its
   prime and an optional link to the signed copy (ADR-146). A project may have **several primes**.
   **Subs aren't entered here**: they're typed in at certification under their prime, tier 1 or 2
   ([Part 3](03-certification.md), ADR-108).
5. **Forms and debris types.** The project picks a **form** for each document type (load, haul-out,
   unit rate ticket, truck certificate…) and **adds debris types to each form, named as the contract
   names the work** (Mulch and Ash are two debris types on the haul-out form), each with *Reduced*, a
   reduction method and *Hidden on phones*. Setup warns, never refuses, when a debris type not marked
   Reduced is added to the haul-out form (ADR-211, 214). The **kinds of unit rate work** the project
   allows (ADR-127). **Field tags**, a project list starting empty (ADR-216, 218).
6. **Pay items.** Read the **line items off the paper contract** and enter each: its **code** (setup
   suggests one, `VEG-HAUL-CY-15`, never forces it), name, **payable type** (the work it prices),
   description (the contract's words and line number), **Unit of Measure** (`TN` or `LB` means the
   load is weighed), a **size band** where one payable type has several pay items, its capture
   settings, and **a rate for each prime** (ADR-206, 207, 213, 221, 223, 235). A contract usually
   prices a line per CY and per ton; the firm enters the pay items it needs and its rules pick
   (ADR-202). There is no fee label on a pay item (ADR-246).
7. **Disposal sites.** Entered **on each project** that uses one (ADR-145): a **site type**
   (TDSR/DMS · Final Disposal · Transfer Station · Other), the **site facts** *Takes loads*,
   *Haul-outs leave here*, *Charges a tipping fee*, *Ineligible site*, the firm's own labels, its
   **GPS**, its **area** (the project's circle or its own shape, drawn or uploaded), a **permit** (a
   missing one is flagged as outstanding, never blocked), an **activation date** and an optional
   **close date** (ADR-111, 136, 142, 173, 215). Ticking *Charges a tipping fee* leads the firm to
   write the site's **tipping fee pay item** (a rate per prime) and its rule there and then; the site
   keeps the link (ADR-222).
8. **Rules** ([`spec/RULES.md`](../RULES.md)). Per form: a name, **one contract** (the rule runs only
   on tickets of its prime; blank only on a rule that just removes or voids), **criteria** (all must
   hold; each value picked or typed), **actions** *Add transaction #n* (a pay item), *Remove
   transaction #n*, *Void ticket*; Active; Show matches; Reprocess (ADR-109, 118, 125, 239). The pay
   item screen's **"Pays when"** writes and keeps most rules for the firm (ADR-229).
9. **Certifications.** On a phone whose assignment includes certifying ([Part 3](03-certification.md),
   ADR-240).
10. **ROEs.** Where the program type requires them, in the back office or on a phone
    ([Part 4](04-field-capture.md), ADR-149).
11. **The other lists** the project uses: incident sub-types (start empty), reasons, the firm's
    added fields on surveys, ROE forms, incidents and drop-off logs (ADR-137, 160, 173;
    [`spec/LISTS.md`](../LISTS.md)).

**Reuse:** a firm **library** (debris types, pay items, incident types, reasons) and **copy from a
past project** (ADR-228). **The setup check** lists gaps before the field day (a tipping fee site
with no fee pay item, a debris type no rule pays, a prime with no rate, overlapping bands), and every
change shows what it would change first (ADR-229).

**What each site's phones will ask for** is worked out here, ahead: for each site, debris type and
prime, from the rules that could match there and the Unit of Measure and capture settings of the pay
items they pay: a load call, a scale weight, or a count of the tickets a load carries. It's shown on
the site's page and sent with the phones' lists (ADR-227, 243).

**Then dispatch** ([Part 2](02-people-and-devices.md)): phones are enrolled once, and each day's
**assignments** say who works where on what (ADR-240). Only then does a monitor record a field event.

## Rules it follows

- The setup spine and what each record holds → `adms-ticket-workflows` §4.0, §4.0a
- The records and their links; reference data editable, never deleted → `adms-data-model` §3.1–§3.1b
- Which lists the firm extends → `adms-data-model` §3.2, [`spec/LISTS.md`](../LISTS.md)
- Pay items, rates per prime, rules and pricing → `adms-ledger-audit`, [`spec/RULES.md`](../RULES.md)
- Sites and the checks on where debris went → `adms-validation` §5.2
- The worked example of all of it → [`spec/golden/MISSION.md`](../golden/MISSION.md) §1

## Where it will live

Setup records in `packages/db` (Prisma models, `adms-data-model`); the setup check and "what it would
change" in `packages/domain`; the screens in `apps/back-office` (Phase 4) through `apps/api`
(ARCHITECTURE §18). Not built yet: Phase 0 has only a provisional database schema (ADR-268).

## Open questions

None (ADR-230).
