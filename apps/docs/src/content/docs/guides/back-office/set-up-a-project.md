---
title: Set up a project
description: From the client down to the setup check, in the order a mission needs it - client, declaration event, project, contractors and contracts, forms and debris types, pay items, rules, sites, the project map, certifications and ROEs.
---

Everything a monitor's phone offers, and everything the worker checks and prices, comes from the
project's setup. **The firm's setup decides; very little is hard-coded.** Name things the way the
contract names them, and the system does the rest. This guide uses the example world's
_Bayline County ROW, Hurricane Delphine_.

Setting up needs the **Setup** grant (an admin holds every grant). Every change is audited.

:::tip[Order matters, a little]
Each step below needs the one before it to exist. The **Setup check** at the end lists any gap
before the first field day; nothing in it stops field work.
:::

## 1. The firm's records

In **The firm** area:

1. **Clients**: the jurisdiction paying, such as _Bayline County_. Reused across disasters,
   archived and never deleted.
2. **Declaration events**: the disaster and its reference, such as _Hurricane Delphine_,
   `DR-9001-FL`. One shared record; several clients' projects may point at it.
3. **Contractors**: each hauling company, such as _Coastline Haulers LLC_. A **prime** holds a
   contract; subs are typed in under their prime when their truck is certified, at most two tiers.
4. **The firm's lists**: program types, debris types, payable types, reasons and the rest. Seeded at
   install; add, rename and archive what your contracts need. See [Lists](/reference/lists/).

## 2. The project

**Projects → New project.** One body of work for one client under one declaration event. Use a
separate project per funder or kind of work (ROW, PPDR…).

| Setting                                  | Example                                                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Project name                             | As the contract names it: _Bayline County ROW, Hurricane Delphine_                                                   |
| Client, declaration event                | Bayline County, Hurricane Delphine                                                                                   |
| Program type                             | ROW (a program type that requires ROEs, such as PPDR, makes every collection, unit rate ticket and survey carry one) |
| Time zone                                | America/New_York: every ticket's time is read in it                                                                  |
| Active from, to                          | 12 October 2026 to 31 January 2027 (leave the end empty while it isn't known)                                        |
| How tickets are numbered                 | **Numbers the phones make** (blocks of 1,000 per phone), or **pre-printed control tickets** (enter their ranges)     |
| Ticket types and kinds of unit rate work | Loads, haul-outs, unit rate work: hangers, leaners, stumps…                                                          |

Then, in **Project setup**: _Allow split loads_, the load call limits (5% and 95% unless you change
them; empty turns a check off; 0% is always flagged), the stump checks and fill depth, the site
circle's radius, field tags, and the project's **primes and contracts**. A contract is a name, its
prime and an optional link to the signed copy: _"Coastline, Bayline ROW 2026"_.

## 3. Forms and debris types

**Setup → Forms.** One form per kind of document: load, haul-out, unit rate, truck certificate, ROE,
survey, incident, citizen drop-off log. Add **debris types** to the load and haul-out forms as the
contract names the work (on P1's load form: _Vegetative_, _C&D_; on its haul-out form: _Mulch_,
marked reduced, grinding). Monitors pick from these at both ends of a load; a rule matches only the
exact entry. Surveys, ROEs, incidents and drop-off logs may carry the firm's own fields.

## 4. Pay items

**Setup → Pay items.** Each priced line of the contract: a **code** unique on the project
(`VEG-HAUL-CY-15`), the firm's **description** ("ROW VEG haul 0–15 mi"), the **payable type** it
prices, the **unit**, a **size band** where several pay items of one type are told apart by size,
the **capture settings**, and **a rate for each prime**.

| Code             | Description                          | Unit | Coastline's rate |
| ---------------- | ------------------------------------ | ---- | ---------------- |
| `VEG-HAUL-CY-15` | ROW VEG haul 0–15 mi                 | CY   | $7.50            |
| `CD-HAUL-CY-15`  | ROW C&D haul 0–15 mi                 | CY   | $8.25            |
| `TIP-FEE-CY-BCL` | Tipping fee, Bayline County Landfill | CY   | $4.00            |
| `HNG-RMV-EA`     | Hanger removal                       | EA   | $68.00           |

A pay item's **Pays when** part writes and keeps its own rule, one per contract whose prime has a
rate on it and per form it pays on, so most pricing is set up right here.

## 5. Rules

**Setup → Rules.** For everything _Pays when_ doesn't cover: each rule names **one contract**, has
**ifs** that must all hold, and **actions** (_Add transaction #n_, _Remove transaction #n_, _Void
ticket_). All passing rules run, in number order. A rule with no add (a remove or void rule) may
name no contract, such as _"Old Quarry Pit: void"_. Before a change is saved, **Show matches** says
how many tickets and lines it would change; **Reprocess** applies it to every ticket not locked as
invoiced. See [The ledger and the audit trail](/concepts/ledger-and-audit/).

## 6. Disposal sites

**Setup → Disposal sites.** Each site the project uses, entered on each project that uses it:

| Field                      | Example: Bayline County Landfill                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Site type                  | Final Disposal (the others: TDSR/DMS, Transfer Station, Other, or the firm's own)                                          |
| Site facts                 | **Takes loads**, **Charges a tipping fee** (the others: _Haul-outs leave here_, only on a TDSR/DMS, and _Ineligible site_) |
| Short code, permit         | `BCL`, `FDEP-SW-0098`                                                                                                      |
| GPS                        | 39.00000000, −75.58000000 (decimal degrees, up to eight places)                                                            |
| Activation and close dates | Active from 12 October 2026                                                                                                |

A ticket at a site without the matching fact is flagged. The site's **quantity lookup** is worked
out from your rules: what a tower there asks for (a load call, or a scale weight where the paying
pay item is by weight).

## 7. The project map

**Setup → Project map.** Load the boundary and its zones from a shapefile (`.zip`), GeoJSON or KML,
or from an Esri layer, and name the field that names each zone. Reconciliation attaches a zone from
each ticket's GPS; a collection outside the boundary is flagged. Each map loaded is kept as a
version.

## 8. Certifications and ROEs

- **Certifications** are made on phones assigned to certify (see
  [Certifications](/concepts/certifications/)). A certification on paper is entered in the back office
  with its measured boxes: the server works out the capacity; nobody types it.
- **ROEs** come from the phones or from paper. Enter a paper ROE's number, parcel, owner and signed
  date, and its **scope** from the paper: the debris types and unit rate work the owner allowed.

## 9. The setup check

**Setup → Setup check** lists what the setup leaves open before the field day, each said plainly,
so no rule or setting is silently inert:

- a site that charges a tipping fee with no tipping fee pay item linked;
- a debris type on a load or haul-out form that no rule of the form can pay;
- a pay item a rule adds on a prime's contract that holds no rate for that prime;
- size bands of one payable type that overlap, or leave a stretch in no band;
- crew-day steps that leave hours in no step;
- an active rule that isn't valid, and why: it never runs.

It lists and never refuses. Fix what it says, then [dispatch](/guides/back-office/dispatch/) the
first day.
