---
title: What is Open ADMS?
description: The problem Open ADMS solves, the one sentence it serves, who uses it, what it guarantees and what it deliberately is not.
---

Open ADMS is an **automated debris management system** (ADMS): the system of record for a debris
mission after a hurricane, tornado, wildfire or flood, from the disaster's declaration to the audit
years later. It is open source, offline-capable in the field, and installed and run by the firm
that uses it.

## The problem

After a disaster, a jurisdiction (a county, a city, a state agency) is buried in debris. FEMA and
the US Army Corps of Engineers reimburse it for hauling that debris away, **but only for debris that
is proven eligible, measured and documented.** Undocumented debris is unreimbursed debris.

The jurisdiction hires **hauling contractors** to pick the debris up, and separately hires a
**monitoring firm** to watch the contractors and document every load. Contractors are paid per
unit, which is the central tension of the industry:

> The party being paid per unit is the same party reporting how many units there were.

Debris fraud is real and prosecuted: trucks that haul air, beds measured dishonestly, loads recorded
twice, debris from outside the eligible area, ineligible material billed as eligible. And
**everything happens offline**: curb and dump alike usually have no signal, so every control has to
work after the fact.

## The one sentence it serves

> For every dollar billed, produce a GPS-stamped, photo-backed, dual-witnessed, audited record
> proving that a specific certified container or crew did specific eligible work, from a specific
> place to a specific approved site, at a specific time.

Open ADMS is a **chain-of-custody and billing-integrity system that happens to run in the field**,
not a logistics app.

## How it works, in five ideas

1. **Two witnesses per load.** A load is recorded as two field events by two monitors who cannot see
   each other: a **collection** at the curb and a **disposal** at the dump, under one ticket number.
   Only the server joins them, and it flags anything their facts disagree on.
   See [Two field events, one ticket](/concepts/two-field-events/).
2. **The load call is money.** Billable volume is the container's certified capacity times the
   percentage full called at the dump. See [The load call](/concepts/load-call/).
3. **Offline is normal.** Phones work all day without a connection and sync whenever there is
   signal, in any order. See [Offline and sync](/concepts/offline-and-sync/).
4. **Flag, never block.** After a project is set up nothing stops field work. Problems are flagged
   for review with a plain message, and people fix them. See [Flags, never blocks](/concepts/flags/).
5. **Nothing is lost, and everything is audited.** Records are corrected in place by permission and
   every prior value is kept; the ledger of money always shows the current truth. See
   [The ledger and the audit trail](/concepts/ledger-and-audit/).

## Who uses it

A **firm**, usually a debris monitoring firm, sometimes a non-profit doing like-kind work,
**installs Open ADMS and runs its own installation**: one organisation per installation. Its setup
decides how everything plays out.

| Who                                                                 | Signs in                                               | Does                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **Admin** (the firm's back office)                                  | The back office, with two-step sign-in                 | Everything, project setup included                                                                   |
| **Manager / analyst**                                               | The back office, with two-step sign-in                 | What they are granted: dispatch, review, correct, renumber, void, accept flags, QC, lock as invoiced |
| **Field monitor**                                                   | An enrolled phone, with a Monitor ID such as `M004127` | Records what they witnessed, fast and offline; never sees a rate or a code                           |
| **Read-only viewer** (a client user, a contractor user, an auditor) | The web, two-step optional                             | Reads their own project's tickets and reports                                                        |

The **client** (the jurisdiction paying, such as Bayline County), the **contractors** (such as
Coastline Haulers LLC and its sub Rivera Trucking) and property owners are **records** the firm
keeps, not logins. A client user is a viewer login that belongs to a client.

## What it guarantees

- No billable load without two independent witnesses. Unit rate work is the one-witness exception,
  by design.
- Field events are the evidence; everything the system writes is drawn from them, by the worker
  only. No person authors a completed load.
- No hard deletes; a regenerated transaction's old row is copied to the audit log first; the audit
  log is append-only.
- Every change is attributable to a real person, with its prior value kept.
- One load bills once: unique numbers, unique pair links, a scale receipt used once, phantoms voided
  and never renumbered.
- Money is computed on the server, deterministically: the same field events and setup always give
  the same transactions.
- After setup, nothing refuses field work or a record over eligibility.

## What it deliberately is not

- **Not a truck-routing or logistics system.** It plans people (the dispatch board), never trucks.
- **Not a payment, invoicing or payroll system.** It records what work is worth and the hours
  worked, locks what was invoiced or approved, and exports. Money moves elsewhere.
- **Not a real-time validator.** Every control runs after the fact.
- **Not a guesser.** It never infers a tandem, where debris was headed, which of two matching rules
  wins, or a missing weight.
- **Not a stop-work system.** Incidents are recorded; stopping work is decided outside it.

:::note[What is built today]
The API, the reconciliation engine and worker, the back office, the read-only viewer portal and the
field app's **browser build** are built and run locally with one command. The field app's native
**iPhone and Android builds are planned**: the same React code wrapped with Capacitor.
:::

## Next steps

- [Quick start](/get-started/quick-start/): bring an installation up on your machine.
- [Two field events, one ticket](/concepts/two-field-events/): the idea everything else rests on.
- [Glossary](/reference/glossary/): every term in its exact meaning.
