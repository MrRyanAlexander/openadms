---
title: Two field events, one ticket
description: Why every truckload is recorded twice, by two monitors who cannot see each other, joined only on the server by the bare ticket number, and what the system concludes from the pair.
---

A truckload is **two events**, far apart in place and time, witnessed by **two monitors who cannot
see each other**. Each monitor records a **field event**: what they saw, where and when, under the
ticket's number. Only the server joins the two, and it flags anything their independently captured
facts disagree on.

## The two witnesses

| Field event            | Where                                    | What that monitor can honestly attest to                                                                         |
| ---------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Collection** (`COL`) | The curb, the property, the right of way | Where the debris came from, what kind it is, when it was loaded                                                  |
| **Disposal** (`DIS`)   | The tower at the disposal site           | How full the truck arrived (the [load call](/concepts/load-call/)), where and when it dumped, that it left empty |

**The number carries the load from one event to the next.** The collection monitor makes the number
(scans a pre-printed control ticket, or the phone generates one) and the truck carries it to the
tower, whose monitor scans it. In the end there is a collection event for ticket `101001` and a
disposal event for ticket `101001`.

Neither monitor can fabricate a billable load alone. A collection with no disposal is a truck that
never dumped; a disposal with no collection is debris from nowhere.

> **A ticket is its number and the field events recorded under it.** Paper and printouts are
> receipts, never records.

## The three workflows

| Workflow      | Field events, in field order                                                      | Makes the number        | Takes the quantity                                         | The system concludes         |
| ------------- | --------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------- | ---------------------------- |
| **Load**      | Collection `COL` → disposal `DIS`                                                 | The collection          | The disposal: a load call or a scale weight                | The completed load `CLT`     |
| **Haul-out**  | Haul-out collection `HOC` at the TDSR → haul-out disposal `HOD` at the final site | The haul-out collection | The haul-out collection: its load call, at the loading end | The completed haul-out `CHO` |
| **Unit rate** | One unit rate event `URT`, complete on its own                                    | The unit rate event     | Its own count, measurement or hours                        | Its transactions             |

- A **haul-out** is the second leg: debris reduced at a temporary debris staging and reduction site
  (TDSR) leaving for final disposal (FDS). It never dumps at a TDSR.
- **Unit rate work** (hangers, leaners, stumps, white goods, household hazardous waste, crew time) is
  one monitor, one place, one ticket: the one-witness exception, by design.
- A **split load** is one truck gathering from several properties: one collection per property
  (`102001-A`, `102001-B`…) and one disposal on the base number, where the project allows split
  loads. A haul-out may likewise be loaded from several piles.
- **Forms and certifications are records, not a ticket's events**: a right of entry (ROE), a survey,
  an incident or a citizen drop-off log never pairs and never bills.

## How the server joins them

The worker groups field events by **project, workflow and bare ticket number** (a split's `-A`,
`-B` suffix stripped). It never parses meaning from a number.

- **Arrival order means nothing.** Phones sync in any order, on any day; the worker orders field
  events by field time.
- **A ticket waiting for its other event is `PENDING` and never expires.** A preload (collected one
  day, dumped the next) is normal and not flagged.
- **One event of each kind per ticket.** A second collection or disposal on the same number is a
  duplicate: it is quarantined at sync, in full, for a person to resolve. It is never dropped.
- Once a pair is whole, the worker checks it (the certification at work time, the times, the site's
  area and facts, the project boundary), attaches the zone and the road mileage, runs the pricing
  rules, writes the transactions and writes the completed load.

## Evidence and conclusions

**The field events are the evidence; everything else is the system's conclusion from them.** The
completed load, the status, the flags, the zone, the mileage and the transactions are not events:
the worker draws them from a ticket's current field events and the firm's current setup, writes them
itself, and draws them again whenever an event or the setup changes. No person can author a
completed load or haul-out.

- **A monitor never edits a field event after submitting it** on the phone. It is sealed for them.
- **A permitted person in the back office corrects** any captured field in place, and the prior
  value is kept in the audit log. Open ADMS is event-driven, not event-sourced: there are no
  "correction events". See [Review and correct](/guides/back-office/review-and-correct/).

:::note[Words]
Say **field event**, or its kind (_the collection event_). Never a bare "event" where it could mean
the disaster: the disaster is always the **declaration event** (such as Hurricane Delphine,
`DR-9001-FL`).
:::

## An example

Ticket `101001` on the project _Bayline County ROW, Hurricane Delphine_:

1. **Monday 08:40.** Ana Brooks (`M004127`) records the collection at 14 Heron St: certification
   `730415` (Coastline's 65 CY dump trailer), Vegetative.
2. **Monday 09:25.** Kim Nguyen (`M004128`) records the disposal at Marsh Road TDSR: Vegetative,
   load call 80%.
3. **That evening**, both phones sync. The worker pairs the two, attaches the zone and 6.2 road
   miles, and runs the rules: one line, `VEG-HAUL-CY-15`, 52.0 CY × $7.50 = **$390.00**. No flags:
   the ticket is `COMPLETED`.

## Related

- [The load call](/concepts/load-call/)
- [Statuses](/concepts/statuses/)
- [Offline and sync](/concepts/offline-and-sync/)
