---
title: Data model
description: The records Open ADMS keeps and how they link - firm-wide records, a project's setup, the evidence monitors capture, the worker's conclusions, people's marks and the audit log - and what the database refuses by itself.
---

The data model follows one idea: **field events are the evidence; everything the system writes is
drawn from them.** Each record below belongs to one of six kinds, and the kind decides who may write
it. Model names are the Prisma schema's (`packages/db/prisma/schema/`), which is the source of truth
for every field, enum and model name.

## The spine

```text
Client ──► Project ◄── DeclarationEvent          (a project: one client, one declaration event)
             │
             ├── Contract (a prime) ──► Rule ──► RuleCriterion, RuleAction ──► PayItem
             ├── Form ──► FormDebrisType          PayItem ──► PayItemRate (one per prime)
             ├── DisposalSite, MapVersion ──► Zone
             ├── Certification ──► CertificationBox
             ├── Roe ──► RoeScopeItem
             ├── Assignment (a person, a day, their work, a site, a phone)
             │
             └── FieldEvent (COL · DIS · HOC · HOD · URT), grouped by workflow + bare ticket number
                    │
                    ▼  the worker
                 CompletedLoad / CompletedHaulOut · Transaction · Flag · ReconciliationRun
```

## Firm-wide records

| Records                                    | What they are                                                                                                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Client`, `DeclarationEvent`               | The jurisdiction paying; the disaster and its reference (`DR-9001-FL`), shared by many clients' projects                                                                                                                                                |
| `Contractor`                               | A hauling company (or a monitoring sub, such as a temp agency): a prime on a project, or a sub typed in at certification, at most two tiers                                                                                                             |
| `User`, `UserPermission`, `ViewerProject`  | People with a login: admins, managers/analysts (with their grants), field monitors, read-only viewers (with their projects)                                                                                                                             |
| `Device`, `MasterPasscode`, `FirmSettings` | Enrolled phones; the firm's one master passcode (only its slow hash); the installation's settings, such as what the firm calls its ADMS                                                                                                                 |
| The firm's lists                           | `ProgramType`, `DebrisType`, `PayableType`, `KindOfWork`, `ItemName`, `VehicleType`, `VehicleFeature`, `CrewType`, `SiteType`, `SiteLabel`, `IncidentType`, `Reason`, `SurveyWorkType`, `ClockActivity`, `FieldTag`, … (see [Lists](/reference/lists/)) |

## A project's setup

| Records                                                     | What they are                                                                                                                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Project`                                                   | One body of work for one client under one declaration event: program type, active window, time zone, how tickets are numbered, split loads allowed, its check settings |
| `Contract`                                                  | A name, its prime and an optional link to the signed copy                                                                                                              |
| `Form`, `FormDebrisType`, `FormDefinition`                  | One form per kind of document; the debris types added to it; the firm's own fields                                                                                     |
| `PayItem`, `PayItemRate`, `PayItemCrewDayStep`              | A priced line of the contract, a rate for each prime, crew-day steps                                                                                                   |
| `Rule`, `RuleCriterion`, `RuleAction`                       | Pricing: one contract, its ifs, its actions (_Add_, _Remove_, _Void ticket_)                                                                                           |
| `DisposalSite`, `SiteAreaVersion`, `DisposalSiteTippingFee` | Where debris goes, its type and facts, its area, the pay item for its tipping fee                                                                                      |
| `MapVersion`, `Zone`                                        | The project's boundary and zones, by version                                                                                                                           |
| `NumberSeries`, `NumberBlock`, `ControlRange`               | Ticket, cert and ROE number series, the blocks phones hold, the ranges of pre-printed stock                                                                            |
| `Certification`, `CertificationBox`                         | A container or a crew, its measured boxes (capacity is computed from them)                                                                                             |
| `Roe`, `RoeScopeItem`                                       | A right of entry and its scope                                                                                                                                         |
| `Assignment`                                                | One person's work for one day                                                                                                                                          |

## Evidence: what monitors saw

| Records                                                   | What they are                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FieldEvent`                                              | **One model, five kinds**: collection, disposal, haul-out collection, haul-out disposal, unit rate. Its ticket number, times with the phone's offset, GPS as exact decimals, the cert number as scanned, debris type, load call or weight, measurement, the assignment and setup version it was made under |
| `FieldEventItem`, `CarriedTicket`, `FieldEventWaypoint`   | Itemised counts and hours; tickets a load carries; waypoints marked on a collection                                                                                                                                                                                                                        |
| `ScaleReceipt`                                            | A hand-transcribed scale receipt, referenced by the disposals it weighs                                                                                                                                                                                                                                    |
| `Survey`, `Incident`, `DropOffLog`                        | Forms: records, never a ticket's field events                                                                                                                                                                                                                                                              |
| `Photo`, `PhotoFile`                                      | Photograph metadata (its hash taken at capture); the files themselves live in object storage                                                                                                                                                                                                               |
| `ClockEntry`                                              | Time-clock entries                                                                                                                                                                                                                                                                                         |
| `Sync`, `SyncedRecord`, `QuarantinedRecord`, `HeldRecord` | What each sync sent and was answered; duplicates kept in full; records held for a person                                                                                                                                                                                                                   |

## Derived: the worker's conclusions

| Records                                                            | What they are                                                                                                              |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `CompletedLoad`, `CompletedHaulOut`                                | The record concluded from a ticket's field events. Its links to its field events are unique, so one load never bills twice |
| `Transaction`                                                      | One priced line, regenerated whenever its ticket changes                                                                   |
| `Flag`                                                             | A problem, with its code and the facts it was raised on                                                                    |
| `ReconciliationRun`, `ReconciliationDecision`, `ReconciliationJob` | Each run of the worker, what it decided, and the job queue                                                                 |

## Marks: what people set, without changing the record

`QcMark`, `InvoiceLock`, `InvoiceBatch`, `FlagAcceptance`, `TicketVoid`, `TicketUnvoid` and
`DayApproval` are records of their own, keyed to what they mark, written by the API. A reprocess
never loses one, and the API never writes a derived record.

## Audit

`AuditRecord` holds every insert and update on a tracked table: prior and new values, the fields
that changed, the actor, the device, the source, the reason and the request. The database writes it
by trigger and refuses a write with no actor; no role may change or remove one. `SecurityEvent`
records every sign-in, failure, lockout, phone setup and use of the master passcode.

## What the database refuses by itself

- **Any hard delete** of operational data: records are archived, closed or voided.
- Any update or delete of an `AuditRecord`.
- A write with no actor.
- A completed load, haul-out or transaction written by anyone but the worker's login.
- A transaction removed without its full row copied to the audit log first, or on a ticket locked
  as invoiced.
- A second pay item with the same code on a project; two completed records on the same field event.
- A read beyond what a viewer may see: row-level security, not only the screens.

## Statuses and closed sets

Some sets are fixed in code because each value **is** a piece of behaviour: field event kinds,
workflows (`LOAD`, `HAUL_OUT`, `UNIT_RATE`), statuses (`PENDING`, `COMPLETED`, `MANUAL_REVIEW`,
`VOID`), QC statuses, billing units (`CY`, `TN`, `EA`, `LB`, `HR`, `CREW_DAY`, `TBN`), site facts,
rule actions, user roles and flag codes. See [Lists](/reference/lists/).

## Related

- [Architecture](/reference/architecture/)
- [The ledger and the audit trail](/concepts/ledger-and-audit/)
