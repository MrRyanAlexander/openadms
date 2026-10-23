---
title: The ledger and the audit trail
description: Pay items hold every rate, rules turn tickets into transactions, the ledger is regenerated rather than reversed, and the audit log keeps every prior value for ever.
---

The money in Open ADMS is the firm's own setup applied to the evidence. The monitor enters only the
main ticket; **pay items, rules and transactions are the system's work**, and every change to any of
them is kept.

## Pay items: the only place a rate lives

A **pay item** is a priced line of the contract as the firm sets it up. The firm types each line of
the paper contract in by hand.

| Field                | What it is                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code**             | The firm's own string, unique on its project. Setup suggests one from the published convention `TYPE-WORK-UNIT[-DETAIL]`, such as `VEG-HAUL-CY-15` (vegetative haul, per cubic yard, up to 15 miles) or `HNG-RMV-EA` (hanger removal, each) |
| **Description**      | The firm's own words for the work ("ROW VEG haul 0–15 mi")                                                                                                                                                                                  |
| **Payable type**     | The work it prices, from the firm's list (Vegetative, C&D, Hangers, Stumps, Crew time, Tipping fee…)                                                                                                                                        |
| **Unit of measure**  | `CY`, `TN`, `EA`, `LB`, `HR`, `CREW_DAY` or `TBN` (to be negotiated: bills nothing until agreed)                                                                                                                                            |
| **Size band**        | From and to, where several pay items of one payable type are told apart by size (leaners 6–24 in, 24.1–99 in)                                                                                                                               |
| **Capture settings** | Count is always 1, GPS required, measurement required, decimals allowed, photos required, monitor may mark ineligible, quantity from the tickets it carries                                                                                 |
| **Rates**            | **A rate for each prime** that works under it, never a copy per prime                                                                                                                                                                       |

**Monitors never see a rate or a code.** A load carries no pay item at all: the monitor picks its
debris type by name, and the rules decide what it is paid at, after sync. A unit rate ticket carries
the pay item its size band gives for the work the monitor picked.

## Rules: from tickets to transactions

A **rule** is the firm's own pricing tool, on one form (load, haul-out or unit rate):

- it names **one contract**, and runs only on tickets whose prime holds that contract (the prime
  comes from the certification, never from a monitor's pick);
- its **criteria** ("ifs") read only the ticket: debris type, mileage, disposal site, site type,
  zone, ticket date, weight, volume, pay item, measurement, unit count, item…, all of which must hold;
- its **actions** are _Add transaction #n_ (with a pay item), _Remove transaction #n_ and _Void
  ticket_.

Every passing rule runs. All the adds run in # order, then every remove, then any void. The # is
the line's slot, so a load's hauling line and its tipping fee line stay apart. A split load is priced
once per property, on its share.

For example, on _Bayline County ROW_ the load form holds:

| If                                             | Then                                             |
| ---------------------------------------------- | ------------------------------------------------ |
| Debris type = Vegetative, Mileage AT MOST 15.0 | Add #1 `VEG-HAUL-CY-15`                          |
| Debris type = C&D, Mileage AT MOST 15.0        | Add #1 `CD-HAUL-CY-15`                           |
| Disposal site = Bayline County Landfill        | Add #2 `TIP-FEE-CY-BCL` (the site's tipping fee) |

Most rules are written for the firm: a pay item's **Pays when** part saves and keeps its own rule.
Free-standing rules remain for removes, voids and date ranges. Before a rate or rule change is saved,
the back office shows how many tickets and lines it would change (**Show matches**), then runs it
(**Reprocess**).

## Transactions: the current truth

A **transaction** is one priced line: the ticket (and, on a split, the property), the rule and its
slot, the pay item, the quantity, the rate, the cost, the rule's contract, **the prime and the
operating sub**. Cost = quantity × the pay item's rate for that prime, rounded to the cent, half up.

Ticket `101002` (Rivera Trucking's 48 CY self-loader, C&D, called 75%, dumped at Bayline County
Landfill, 11.4 road miles):

| #   | Pay item         | Quantity | Rate  | Cost    |
| --- | ---------------- | -------- | ----- | ------- |
| 1   | `CD-HAUL-CY-15`  | 36.0 CY  | $8.25 | $297.00 |
| 2   | `TIP-FEE-CY-BCL` | 36.0 CY  | $4.00 | $144.00 |

Both lines are recorded as prime Coastline Haulers LLC with sub Rivera Trucking. Subs work under their
prime's rate; the prime pays its subs outside the system.

**The ledger always shows the current truth.** When a ticket changes, its transactions are removed
and written again: **regenerated, never reversed**, with no reversal rows. Before a transaction is
removed, **its entire row is copied to the audit log**; the database does that itself. The same
field events and setup always give the same lines. **Only the worker writes transactions**; no
person edits one.

## The audit log: append-only, absolutely

Every insert and update on a tracked table writes an **`AuditRecord`**: the prior and new values and
the fields that changed, who (a real person, or the system's actor for the worker), which device,
the source, the reason and the request.

- **The database writes it itself, by trigger.** Every write states its actor first, and a write
  with no actor is refused.
- **No role may update or delete an audit record.**
- It is the only history, and it is **why everything else can change safely**: records are corrected
  in place and transactions regenerated because every prior value is kept here for ever.

## Nothing is lost

- **No hard deletes.** Reference data (clients, contractors, pay items, rules, sites, users) is
  **archived**; a project is **closed**.
- **Tickets are never deleted.** Work that never happened is **voided**, with a reason.
- A rate or rule change regenerates only tickets **not locked as invoiced**. Invoice-locked tickets
  are never touched.

## Related

- [QC, the lock and the client package](/guides/back-office/qc-lock-and-deliver/)
- [Set up a project](/guides/back-office/set-up-a-project/): pay items and rules in the back office
- [Data model](/reference/data-model/): who may write which record
