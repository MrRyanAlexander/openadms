---
title: Architecture
description: The system layer by layer, who may write which kind of record, the stack, the repository's workspaces and how they depend on each other, and how it is tested.
---

Open ADMS is **TypeScript end to end**, with Prisma for the database: one language on the phone, the
server, the worker and the web, so a rule that must give the same answer on the phone and on the
server (capacity, volume, number blocks) is written once.

## The system, layer by layer

```text
 FIELD (offline all day)                      THE FIRM'S OWN CLOUD (or a laptop, for local testing)
┌─────────────────────────┐                  ┌───────────────────────────────────────────────────┐
│ Field app on an         │   sync (HTTPS)   │  API                         Worker               │
│ enrolled phone          │ ───────────────▶ │  • phone sync endpoints      • reconciliation     │
│ • encrypted local store │ ◀─────────────── │  • back-office endpoints     • pricing, ledger    │
│ • number blocks         │   lists, numbers │  • viewer portal endpoints   • repricing jobs     │
│ • printer, scanner      │                  │  writes: evidence + setup    writes: derived only │
└─────────────────────────┘                  │            │                        │             │
┌─────────────────────────┐                  │            ▼                        ▼             │
│ Back office (web)       │ ──── HTTPS ────▶ │  ┌─────────────────────────────────────────────┐  │
│ Viewer portal (web)     │                  │  │ PostgreSQL: the source of truth             │  │
└─────────────────────────┘                  │  │ roles · grants · constraints · triggers     │  │
                                             │  │ audit written by the database itself        │  │
                                             │  └─────────────────────────────────────────────┘  │
                                             │  Object storage (S3-compatible): photographs      │
                                             │  Valhalla (road miles) · Nominatim (addresses)    │
                                             └───────────────────────────────────────────────────┘
```

Every app reaches the server **only through the API, over HTTPS**. Only the database package and the
two server apps touch Postgres.

## Who writes what

The one boundary that matters is **who may write which kind of record**. The database enforces it
with a login role per service.

| Kind of record                    | Examples                                                                                                              | Written by                                                                 | Never written by                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- |
| **Evidence** (what a monitor saw) | Field events, forms, incidents, photo metadata, time-clock entries                                                    | The API: phone sync (insert) and back-office corrections (update, audited) | The worker, except its reconciliation columns |
| **Configuration**                 | Clients, declaration events, projects, contracts, pay items, rules, sites, certifications, users, phones, assignments | The API (back office), audited                                             | The worker                                    |
| **Derived**                       | Completed loads and haul-outs, transactions, flags, reconciliation runs                                               | **The worker only**                                                        | The API, any person                           |
| **Audit**                         | `AuditRecord`                                                                                                         | **The database's own triggers only**                                       | Anyone directly, ever                         |

A person never writes a derived record. Correcting evidence queues a reprocess, and the worker
decides again. The marks people set on a derived record (QC status, the invoice lock, a flag's
acceptance) are records of their own, written by the API.

## The stack

| Concern                  | Choice                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                  | Node.js 24, pinned                                                                                                                                |
| Database                 | PostgreSQL, with roles, grants, constraints, triggers and row-level security for viewers                                                          |
| ORM and migrations       | Prisma, a schema split across files; no hand-written SQL for ordinary modelling                                                                   |
| Contracts                | Zod schemas in one shared package, used by phone, API and web; the OpenAPI document generated from them                                           |
| API                      | NestJS on the Fastify adapter                                                                                                                     |
| Background jobs          | A Postgres-backed job queue: no extra infrastructure, transactional with the data                                                                 |
| Web apps                 | React and Vite; components on React Aria; one translation layer                                                                                   |
| Field app                | The same React code: a browser build today; wrapped with Capacitor for iPhone and Android (planned)                                               |
| Phone store              | Encrypted at rest: SQLite with SQLCipher on the native builds (planned); IndexedDB sealed with non-exportable WebCrypto keys in the browser build |
| Object storage           | Any S3-compatible store                                                                                                                           |
| Local HTTPS              | Caddy, issuing from the stack's own certificate authority                                                                                         |
| Road miles and addresses | Valhalla and Nominatim, self-hosted, on OpenStreetMap data for the project's region                                                               |
| Distance                 | Geodesic, in one module; never Euclidean. Coordinates are exact decimals, never floats                                                            |
| Tests                    | Vitest, the scenario harness, Playwright for the browser                                                                                          |

## The repository

```text
apps/
  api/            NestJS: phone sync, the back office's and the portal's endpoints
  worker/         reconciliation, pricing, repricing, media jobs
  back-office/    React + Vite: the back office and the read-only viewer portal
  field/          React + Vite: the field app (browser build; iPhone and Android planned)
  docs/           this documentation site (Astro Starlight)
packages/
  db/             the Prisma schema, migrations, the database's hardening, seed data
  domain/         the rules as classes: capacity, volume, pricing, time, numbering, policy
  contracts/      Zod schemas for every API and sync payload
  receipts/       the receipt content model, to ZPL and PDF, Code 128
  look/           the web apps' tokens, components, translation layer and accessibility checks
  scenarios/      the scenario harness and the golden mission
infra/local/      the local HTTPS stack: Docker Compose, Caddy
tools/            the installer, the chain, the licence and security checks
spec/             how the system works, part by part
```

Each package has one owner and one direction of dependency: `domain` depends on nothing;
`contracts` and `receipts` depend on `domain`; `look` depends on nothing of ours; the apps depend on
the packages, never on each other. **A rule lives once, in `packages/domain`; a payload once, in
`packages/contracts`.**

## The worker

The worker runs **reconciliation**: for each queued ticket, it groups the field events by project,
workflow and bare number, checks the pair, attaches the zone and road mileage, runs the rules in #
order, writes the transactions and the completed record, and sets the status. A ticket's run is
**one piece of work**: a crash leaves nothing half-written, and a ticket it can't process is flagged
and skipped while the run goes on. It runs the same way on every reprocess.

## Testing

| Layer                         | What it proves                                                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit** (the domain package) | Capacity math against the paper form's examples; volume, apportionment and split shares sum exactly; time rules; number blocks                                                                  |
| **Database**                  | Every grant and refusal: the API can't write a completed load; nobody can update an audit record; a delete is refused; a transaction's delete copies to audit first                             |
| **API**                       | Sign-in, permissions, the CORS allow-list, rate limits, validation, the sync contract                                                                                                           |
| **Scenario harness**          | Whole projects told as stories (set up, enrol phones, a shift offline, break things, sync out of order, reconcile, price, correct, lock), asserting the exact statuses, review queue and ledger |
| **Browser end-to-end**        | The web apps and the field app's browser build, with automated WCAG 2.2 AA checks in light and dark                                                                                             |

The **golden mission** is the reference story: two projects, several field days with duplicates, a
preload, a phantom, a split, late syncs, corrections and an invoice lock, run through every screen to
the approved ledger. `pnpm chain` runs every check in order; see [Commands](/reference/commands/).

## Related

- [Data model](/reference/data-model/)
- [Security](/security/)
- [API reference](/reference/api/)
