# Open ADMS

An **Automated Debris Management System**: a self-hosted, portable platform that
tracks debris per load or unit of work from start to completion, and surfaces the
result for review, reporting, invoicing and audit.

Built on the OmniTodo engineering pattern — decoupled monorepo, one
`DATABASE_URL`, one `VITE_API_URL`, regex CORS, a container for the API,
Infrastructure as Code for three clouds, an interactive installer, and per-record
cryptographic sharing between independent instances.

```
openadms/
├── database/     Postgres schema, migrations, seeds, setup script, test suite
├── backend/      FastAPI server app (its own Dockerfile, EXPOSE 8080)
├── frontend/     Back office — desktop web app (Netlify)
├── mobile/       Field companion — mobile web app / PWA (Netlify)
├── deploy/       Terraform for Netlify+Railway, AWS, GCP
└── installer.js  Interactive CLI installer
```

---

## The idea in one paragraph

**Tickets are the main focus of an ADMS.** A ticket is linked to a project, a
piece of equipment, and the metadata describing the work done. When a ticket
completes, it is evaluated against every rule configured for its type on its
project; each rule that matches produces one immutable transaction whose amount
is the service code's rate multiplied by a quantity pulled automatically from the
ticket's own recorded data. Every change to anything, including the ticket's
creation, lands in an immutable audit history.

```
Project
 ├── Contracts, Contractors, Disposal sites, Zones, Workers
 ├── Ticket types (enabled from the catalog)
 ├── Service codes ── Rates (value + unit type, effective dated)
 └── Rules ── statement lines built from project-bound options
                └── each rule points at one service code and one contract

Completed ticket
 └── evaluated against ALL rules for its type on its project
      ├── Rule A matches → Transaction A   (locked)
      ├── Rule B matches → Transaction B   (locked)
      └── Rule C no match → nothing

Transactions → Invoices → Reports
Every write → Audit artifact (append-only, enforced in the database)
```

---

## Quick start, locally

You need a Postgres that exists. If you do not have one:

```bash
docker compose up -d db      # Postgres 16 + PostGIS on localhost:5432
```

Then:

```bash
npm run setup                # asks what it needs, writes every .env, applies the schema
```

Or by hand:

```bash
export DATABASE_URL=postgresql://adms:adms@localhost:5432/openadms
./database/setup.sh --with-demo --test

cd backend  && pip install -r requirements.txt && uvicorn app.main:app --port 8080
cd frontend && npm install && npm run dev     # back office  → :5173
cd mobile   && npm install && npm run dev     # field app    → :5174
```

Demo accounts (password `openadms`): `admin`, `manager`, `analyst`, `jmiller`,
`tnguyen`, `rcarter`, `sboyd`.

## Deploying to Netlify + Railway

No dashboard clicking and no GitHub connection: both platform CLIs do the work,
and the frontends are built locally and pushed as static assets.

```bash
npm run preflight            # what is installed, what you are signed in to
npm run deploy:plan          # the exact commands, without running any of them
npm run setup                # choose "Netlify + Railway" and let it run
```

If a CLI is missing the installer names it, explains what it is for, shows the
install command, offers to run it, then re-checks. If you are not signed in it
offers to run the login flow. Either way you come back to the same place rather
than being dropped at a shell prompt.

It runs, in order: create the Railway project, provision Postgres, apply the
migrations and the test suite, deploy the API and generate its domain, build
both frontends against that domain, create and deploy both Netlify sites, then
set the API's CORS policy to the real site URLs.

Progress is recorded in `.deploy-state.json`, so if a step fails you fix it and
re-run rather than starting over.

Something not working? [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md).

---

## What makes it extendable

**A ticket type is data, not code.** Each row in `ticket_types` declares its own
lifecycle (`stage_schema`) and its own form (`field_schema`) as JSON. The field
app and the back office render entirely from those two documents, so adding a
Right of Entry, a Time and Material ticket, a Damage Survey — or something a
contract invents next season — is an `INSERT`, not a release.

```json
{
  "code": "ROE", "label": "Right of Entry", "kind": "custom",
  "stage_schema": [
    {"code": "intake", "label": "Intake", "sequence": 1,
     "completes_ticket": true, "captures": ["gps", "signature", "photo"]}
  ],
  "field_schema": [
    {"key": "owner_name", "label": "Property Owner", "type": "text",
     "required": true, "stage": "intake"}
  ]
}
```

The same principle runs through the rest of the system:

| Extension point | How you extend it |
|---|---|
| Ticket types | Row in `ticket_types` with stage and field schemas |
| Rule operands | Row in `rule_operands` naming a column on `ticket_evaluation` |
| Operators | Row in `rule_operators` |
| Units of measure | Row in `unit_types` naming a column on `ticket_metrics` |
| Debris classification | Row in `debris_types` |
| Incident taxonomy | Row in `incident_categories` (self-referencing tree) |
| Roles | Row in `roles` with a rank; permissions inherit by rank |
| Type-specific fields | `tickets.data` JSONB, GIN indexed |

Two ticket types are **hidden system types** — Pending Collection and Pending
Disposal. They exist as transient handoff objects and a database trigger refuses
to let them be added to a project.

---

## The billing engine

A rule reads: *when these conditions hold on a completed ticket of this type,
bill this service code under this contract.*

- Statement lines are built from project-bound options. If three contractors are
  on the project, those three are what the `Contractor =` picker offers.
- A rule **cannot be saved** without a service code and a contract, and both must
  already belong to the project. Enforced by trigger, not by the UI.
- A rate carries a **unit type**, and the unit type names the derived measurement
  the engine reads: `per_cubic_yard` → certified capacity × load call,
  `per_ton` → net scale weight ÷ 2000, `per_mile` → odometer, else the recorded
  waypoint path, else straight-line origin to destination.
- Quantity is **never typed by a human**. Where a ticket carries no measurable
  value it defaults to 1.
- Transactions are **system generated and permanently locked**: `UPDATE` and
  `DELETE` are blocked by a database trigger. A correction is a reversal row plus
  a fresh computation, and both stay in the ledger.
- Rates are effective dated, so a mid-project rate change never rewrites a
  transaction that was already computed.

---

## Roles

Cumulative by rank — a role holds every permission of every role beneath it.

| Role | Rank | Adds |
|---|---|---|
| Monitor | 10 | Create tickets, advance stages, file incidents, read own tickets |
| Manager | 20 | Clients, contracts, workers, project assignments, project ticket types, audit read |
| Analyst | 30 | Rules, service codes, rates, disposal sites, transaction processing, query builder |
| Admin | 40 | Ticket type catalog, users, instance and peer settings, transaction reversal, invoice approval |

**The active project is always in context.** The API refuses any ticket write for
a project the acting user is not assigned to, and a ticket can only be created
when the project is fully configured *and* the creator is an approved worker on
it. Both gates live in the database.

---

## Federation

Every deployment is a sovereign instance with a 64-hex `INSTANCE_UNIQUE_KEY` and
an Ed25519 key pair. Projects and tickets carry a visibility flag:

| Flag | Who can read it |
|---|---|
| `private` | Authenticated users of this instance only |
| `restricted` | Peers listed in `allowed_viewers`, presenting a valid `X-Signature` |
| `public` | Any caller, no signature |

A signed peer read presents `X-Instance-Key`, `X-Timestamp`, `X-Nonce` and
`X-Signature` over `METHOD\npath\ninstance_key\ntimestamp\nnonce\nbody_sha256`.
Timestamps outside the skew window are refused, nonces are single use, unknown or
untrusted peers are refused outright, and every peer read is written to the audit
trail.

---

## Verification

```bash
./database/setup.sh --with-demo --test   # 64 schema assertions
cd backend && python3 -m pytest          # 37 API tests
npm run build                            # both frontends
```

The schema suite asserts the creation gate, rule save gates, quantity derivation,
multi-rule matching, idempotent re-processing, transaction and audit
immutability, reversal arithmetic, and that a brand new ticket type bills through
the same engine with no code change. The API suite drives a full load ticket from
the right of way through the barcode handoff to a locked transaction, and proves
peer isolation: Instance Beta reads a restricted project, a forged signature and
an unregistered third party do not.

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the four parts fit together
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — every table and why it exists
- [`docs/API.md`](docs/API.md) — endpoint reference
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Netlify, AWS, GCP
- [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) — the errors people actually hit
- [`docs/omnitodo-prompt.md`](docs/omnitodo-prompt.md) — the original build pattern this follows
