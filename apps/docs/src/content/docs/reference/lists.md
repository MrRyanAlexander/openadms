---
title: Lists
description: Every pick-list in Open ADMS - which ones the firm extends after install and what each starts with, which are fixed because each value is behaviour, and how built-in values sit beside the firm's own.
---

Every pick-list falls into one of three groups. The group tells you whether a firm can add to the
list after installing, and whether adding a value needs code.

**Rules for every list the firm extends:**

- **Global:** added once, available to every project, like clients and contractors (field tags are
  the one project list).
- **Admin-managed:** admins add, rename and archive values; every change is audited; nothing is
  deleted.
- **Picked, never typed:** people choose from the list, which keeps reports clean. "Other (typed)"
  is allowed only on lists that describe something (a vehicle type), never on lists that drive
  behaviour or billing.
- Where a value drives behaviour, the behaviour is **a setting on the value**, not code: a program
  type's _Requires ROE_ box, for example.

## Extendable: the firm adds values

Seeded by the installer once; after that every value is the firm's to rename, reorder, archive and
add to.

| List                             | Where it's used                                                                                                  | Starts with                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Program types**                | Project setup                                                                                                    | ROW · PARKS · PPDR · WATERWAY. Only PPDR starts with _Requires ROE_ ticked                                                                                                                                                                                                                                                       |
| **Declaration reference types**  | Declaration events                                                                                               | FEMA disaster (DR) · FEMA emergency (EM) · State · Local · Internal                                                                                                                                                                                                                                                              |
| **Debris types**                 | Added to each load and haul-out form, named as the contract names the work; picked at both ends of a load        | C&D · Vegetative · Metals · Concrete · White Goods · Titled Property (vehicles and vessels) · HHW · RACM · Soil · Leaners · Hangers · Stumps                                                                                                                                                                                     |
| **Payable types**                | Every pay item has one; the unit rate list shows each once; exported as the type column                          | The same twelve, then Crew time · Tipping fee                                                                                                                                                                                                                                                                                    |
| **Reduction methods**            | A debris type's entry on a form                                                                                  | Grinding · Incineration · Compaction                                                                                                                                                                                                                                                                                             |
| **Kinds of unit rate work**      | Project setup; each unit rate pay item names one                                                                 | Hangers, Leaners, **Stumps** (built in): a number, photographed by stage · HHW, White Goods: counts by item · Crew time: hours by item                                                                                                                                                                                           |
| **Item names** (per kind)        | Unit rate capture                                                                                                | HHW: Paint cans · Propane tanks · Pesticide. White Goods: Washer · Dryer · Fridge, freon recovered · Fridge, no freon · Fridge, freon staged · Oven · Microwave. Crew time: Skid Steer · Truck · Sign                                                                                                                            |
| **Vehicle types**                | Certifications                                                                                                   | Dump Truck · Semi-Trailer · Hydraulic Dump Trailer · Non-Hydraulic Dump Trailer · Self-Loading Truck                                                                                                                                                                                                                             |
| **Vehicle features**             | Each labels a measured box after the primary, marked add or subtract and ÷2 or not                               | Sideboards · Tail Gate Extension · Dog Box · Wheel Wells · Curved/Angled Sides/Floor                                                                                                                                                                                                                                             |
| **Crew types**                   | Crew certifications                                                                                              | Bucket Truck · Skid Steer                                                                                                                                                                                                                                                                                                        |
| **Disposal site types**          | Disposal sites; the _Disposal site type_ rule criterion                                                          | **TDSR/DMS** · **Final Disposal** (both built in) · Transfer Station · Other                                                                                                                                                                                                                                                     |
| **Site labels**                  | Beside a site's facts, labels only                                                                               | Empty; the firm adds its own (burn site, grinding)                                                                                                                                                                                                                                                                               |
| **Incident types** and sub-types | Incident reports                                                                                                 | Property damage · Personal injury · Near miss · Equipment failure · Environmental · Other; sub-types empty                                                                                                                                                                                                                       |
| **Reasons**                      | Voiding, a typed ticket number, accepting a flag, a record made in the back office, a phone taken out of service | Voiding: Duplicate ticket · Work never happened · Not eligible work. A typed number: Barcode damaged · Scanner not working. Accepting a flag: Photos confirm · Confirmed with the monitor. A record made in the back office: Device failed · Device lost. A phone out of service: Lost in the field · Stolen · Broken · Replaced |
| **Survey and ROE work types**    | The first list when starting a survey or ROE                                                                     | Pre-work survey · Post-work survey · ROE (all built in)                                                                                                                                                                                                                                                                          |
| **Time-clock activities**        | Activity lines the app can't pre-fill                                                                            | Travel · Standby · Training                                                                                                                                                                                                                                                                                                      |
| **Field tags** (a project list)  | Read by the _Field tag_ rule criterion and exports; no phone asks for one                                        | Empty                                                                                                                                                                                                                                                                                                                            |

There are **no fee kinds**: a load's lines are kept apart by their transaction # slot, a tipping fee
line is known by the site's link to its tipping fee pay item, and the payable type groups lines in
exports.

## Fixed: each value is behaviour

Adding a value to one of these means writing code, because each value **is** a piece of behaviour.

| List                  | Values                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Field event kinds** | `COLLECTION` · `DISPOSAL` · `HAUL_OUT_COLLECTION` · `HAUL_OUT_DISPOSAL` · `UNIT_RATE` (shown `COL` `DIS` `HOC` `HOD` `URT`) |
| **Workflows**         | Load · Haul-out · Unit rate, each with its own number series                                                                |
| **Statuses**          | Pending · Completed · Manual review · Void                                                                                  |
| **QC statuses**       | QC Review · QC Approved · QC Issues · QC Void                                                                               |
| **Billing units**     | `CY` · `TN` · `EA` · `LB` · `HR` · `CREW_DAY` · `TBN`, each with its own quantity math                                      |
| **Site facts**        | Takes loads · Haul-outs leave here (only on a TDSR/DMS) · Charges a tipping fee · Ineligible site                           |
| **Rule actions**      | _Add transaction #n_ · _Remove transaction #n_ · _Void ticket_                                                              |
| **User roles**        | Admin · Manager/analyst · Field monitor · Read-only viewer                                                                  |

## Records, not lists

Some things look like pick-lists on a screen but are full records the back office creates and
reuses: **clients, declaration events, contractors, contracts, pay items, rules, disposal sites,
ROEs, users and certifications**. The firm's own fields on surveys, ROE forms, incidents and drop-off
logs are records too. A contractor's tier is a position (prime, first tier, second tier), not a list
value.

## Built-in values beside the firm's own

Some lists hold both a few values the **system acts on** and any number the **firm adds**. The kinds
of unit rate work are the example: **Stumps** is built in (its screen takes the stump readings and
works out the fill), and a firm adds the kinds its contract needs.

|               | Built-in value                                      | The firm's own value                                           |
| ------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| **Key**       | Fixed, such as `STUMPS`; never changes              | None                                                           |
| **Name**      | A shipped default the firm may rename; translatable | Typed by an admin; translatable                                |
| **Behaviour** | What the product defines for that key               | None, ever                                                     |
| **Added**     | Only by a release                                   | By an admin, any time                                          |
| **Archived**  | Never                                               | Yes: hidden from new picks, kept on old records, never deleted |

The system only ever acts on a built-in value, and recognises it by its **key**, never its name, so
renaming a value never changes what the system does. Your own values are for finding and reporting
on things.

## Related

- [Set up a project](/guides/back-office/set-up-a-project/)
- [Data model](/reference/data-model/)
