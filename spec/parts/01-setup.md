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
   suggests one, `VEG-HAUL-CY-15`, never forces it; **unique on the project**), its **description**
   (what the work is, in the firm's own words), **payable type** (the work it prices), **Unit of
   Measure** (`TN` or `LB` means the load is weighed), a **size band** where one payable type has
   several pay items, its capture settings, and **a rate for each prime** (ADR-206, 207, 213, 221,
   223, 235, 301). A rate that changes from a date is a second pay item with a code of its own. A contract usually
   prices a line per CY and per ton; the firm enters the pay items it needs and its rules pick
   (ADR-202). There is no fee label on a pay item (ADR-246).
7. **Disposal sites.** Entered **on each project** that uses one (ADR-145): a **site type**
   (TDSR/DMS · Final Disposal · Transfer Station · Other), the **site facts** *Takes loads*,
   *Haul-outs leave here*, *Charges a tipping fee*, *Ineligible site*, the firm's own labels, its
   **GPS**, its **area** (the project's circle or its own shape, drawn or uploaded), a **permit** (a
   missing one is flagged as outstanding, never blocked), an **activation date** and an optional
   **close date** (ADR-111, 136, 142, 173, 215). *Haul-outs leave here* can be ticked only on a
   TDSR/DMS site: a haul-out is reduced debris leaving a TDSR, never a trip from one landfill to
   another or back to the site it left (ADR-298). Ticking *Charges a tipping fee* leads the firm to
   write the site's **tipping fee pay item** (a rate per prime) and its rule there and then; the site
   keeps the link (ADR-222).
8. **Rules** ([`spec/RULES.md`](../RULES.md)). Per form: a name, **one contract** (the rule runs only
   on tickets of its prime; blank only on a rule that just removes or voids), **criteria** (all must
   hold; each value picked or typed), **actions** *Add transaction #n* (a pay item), *Remove
   transaction #n*, *Void ticket*; Active; Show matches; Reprocess (ADR-109, 118, 125, 239). The pay
   item screen's **"Pays when"** writes and keeps most rules for the firm (ADR-229). **A rule that is
   an exact copy of another** (same form, contract, criteria and actions, whatever it is named) **is
   refused before it's saved**, with an error naming the rule it copies (ADR-301).
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
change shows what it would change first (ADR-229). It also lists a stretch between two size bands or
two crew-day steps that falls in neither, and every active rule that isn't valid, with why (a rule
left naming an archived form, contract or pay item among them); it never refuses anything (built at
the domain, ADR-357: `SetupCheck`).

**Nothing set up is deleted; everything is changed** (ADR-025, 527, 529): a client, a declaration
event, a contractor (a prime's name too), a contract's name and link, a form, a debris type on a
form, a pay item and a prime's rate, a rule and a site are changed, each change audited with the value
before, and the tickets it moves re-checked. **Something is retired only where it must stop being
offered** (the user, ADR-529): a person who left, and a value of one of the firm's lists (a built-in
value is renamed, never archived); a site's label and its tipping fee link given by mistake are
removed, audited. The rest has its own switch (a rule's Active, a debris type hidden on phones, a
site's close date) or is history the project reports on. A contract keeps its prime: a contract has
one prime, a project may have several. A form has no on/off: the day's assignment says which forms a
person may make. Two spellings of one sub are never merged: each certification naming a sub whose
name looks like another's on the project is flagged (`SUB_NAME_ALIKE`), and a person corrects the sub
or accepts the flag. A map or a site's own shape also comes from a KML file or straight from the
firm's Esri feature layer, refreshed when the firm says (built at the API, ADR-527).

**A project is closed by an admin, by hand, and then nothing in it changes** (the user, ADR-529): the
admin sees what is still open (phones not turned in, tickets not QC Approved or not invoiced, records
waiting for a person) and confirms; it never stops the close. At the close its assignments are
withdrawn and its phones' unused number blocks retired; the database refuses every change to its
records after; field work for it that arrives later is held for a person, "closed on 12-Oct-2026,
before this arrived". An admin may reopen it with a reason, audited (built at the API, ADR-529).

**What each site's phones will ask for** is worked out here, ahead: for each site, debris type and
prime, from the rules that could match there and the Unit of Measure and capture settings of the pay
items they pay: a load call, a scale weight, or a count of the tickets a load carries. It's shown on
the site's page and sent with the phones' lists (ADR-227, 243). A haul-out's disposal is asked for
the scale weight or nothing more (built at the domain, ADR-357: `QuantityLookup`).

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
