---
title: Field monitors
description: Signing in on an enrolled phone, starting every ticket with the badge and the number at New, completing a load, a haul-out and unit rate work, forms, and syncing.
---

A field monitor records **what they witnessed**, fast, offline, and is never blocked. The phone
already knows the monitor's project, work and site from their assignment; the monitor never sees a
rate or a code and picks everything by name.

:::note[Where the field app runs today]
The field app runs as a **browser build**, at `https://field.adms.localhost` on a local stack. The
native iPhone and Android builds are planned.
:::

## Start the day

1. Take any **enrolled phone** and sign in with your **Monitor ID** (such as `M004127`) and
   password.
2. Online, the phone takes **your assignment** for the day: the project, your work and your site.
   With none, it says "No assignment today: ask your supervisor." A supervisor can set the phone up
   on the spot with the master passcode.
3. Offline, you can still sign in on the phone that holds your project's lists. After five wrong
   tries in a row the phone makes you wait; after ten it locks until the master passcode.

## Every ticket starts the same way: New

1. **New**, then **scan the driver's badge**. The badge carries the certification number, so the
   phone loads the truck (or crew) and its capacity, and knows whose work it is.
2. **The number.** Scan the pre-printed control ticket, or let the phone make the next number,
   which opens the ticket at once. Only a number copied off pre-printed stock by hand (a barcode
   that won't read) is typed again, and it is flagged with a reason you pick, such as _Barcode
   damaged_.
3. The ticket waits in your **open list** while the truck loads. Leave it and come back as the work
   allows; what you entered is kept on the phone. One open ticket per truck on a phone.
4. **Complete**: the details, then submit. The receipt prints.

:::caution[Once you submit, it's sealed]
A ticket you have submitted is **sealed for you**: no reopening and no editing, synced or not. If
you made a mistake, tell the back office; a permitted person corrects it there, and the change is
audited. Until you submit, the ticket is yours to adjust, for days if the work takes days.
:::

## A load

- **At the curb (collection).** Where the project allows split loads, say first whether it's a
  normal or a split load. Capture GPS, then look up the address (or type the street number and
  name with no connection). Take photographs at any step. On Complete, pick the **debris type** from
  the load form's list.
- **At the tower (disposal).** Your site comes from your assignment. Scan the badge and the driver's
  ticket. On Complete, pick the debris type and enter the **one quantity the site asks for**: the
  **load call** (a whole number from 0 to 100, typed), or the scale weight copied from the scale
  receipt where that site's loads are paid by weight. A load call of 0 is accepted and flagged
  later.

## A haul-out

At the TDSR (haul-out collection), the monitor calls the load as the truck leaves: **the load call is
always taken at the loading end**. At the final site (haul-out disposal), the monitor confirms it
dumped, and copies the scale receipt where that site weighs.

## Unit rate work

Scan the **crew badge**; it stays the working crew until you change it. Take the crew photograph,
then pick the **work by name** (Hangers, Leaners, Stumps, White Goods, Household hazardous waste,
Crew time…) and enter what its screen asks: a count, a **measurement** (say whether it's a diameter
or a circumference; a stump is its diameter two feet up, with its root ball), items with counts, or
items with hours to the quarter hour. The phone works out the pay item from the size bands; you
never see its code or rate. Where the pay item allows it, you may mark the work ineligible.

## Forms

- **ROE** (right of entry) and **surveys** (pre-work and post-work): on a project that requires ROEs,
  collections, unit rate tickets and surveys carry one.
- **Incident**: its type and sub-type, and, where the form offers them, the contractor involved, a
  cert number or an ROE number. It records and never stops work.
- **Citizen drop-off log**, at a site: the resident's name and address (optional), photographs,
  notes. No quantity, number or cost.

Forms are records, never a ticket's field events: they never pair and never bill.

## Photographs

From the camera only, never the gallery; up to eight per ticket; taken at any step while the ticket
is open. Before you submit, you can retake or remove one.

## Sync

You don't need to do anything: the phone syncs **whenever it finds signal**, every few minutes while
you are signed in. Records go first, photographs after. A record the server turned away (a second
ticket under a number already used) shows as **not saved**, and the back office resolves it; nothing
is lost.

## Related

- [Two field events, one ticket](/concepts/two-field-events/)
- [Assignments and phones](/concepts/assignments-and-phones/)
