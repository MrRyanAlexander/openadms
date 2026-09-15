<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/banner-light.svg">
  <img alt="Open ADMS. Automated Debris Management System. Self-hosted, MIT licensed." src="docs/assets/banner-dark.svg" width="100%">
</picture>

<br>

[![License](https://img.shields.io/badge/license-MIT-F5C93F?style=flat-square&labelColor=07090C)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/MrRyanAlexander/openadms/ci.yml?branch=main&style=flat-square&label=CI&labelColor=07090C&color=4E9BEE)](../../actions/workflows/ci.yml)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4E9BEE?style=flat-square&labelColor=07090C)](docs/DATA_MODEL.md)
[![Python](https://img.shields.io/badge/Python-3.11+-4E9BEE?style=flat-square&labelColor=07090C)](backend/requirements.txt)
[![Node](https://img.shields.io/badge/Node-18+-4E9BEE?style=flat-square&labelColor=07090C)](package.json)
[![Tests](https://img.shields.io/badge/tests-160%20schema%20%2B%20151%20API-8A929E?style=flat-square&labelColor=07090C)](docs/TESTING.md)
[![PAPPG](https://img.shields.io/badge/built%20for-FEMA%20PA%20debris-8A929E?style=flat-square&labelColor=07090C)](docs/spec/01-product-definition.md)

**[Quick start](#quick-start) · [How it works](#how-it-works) · [Documentation](docs/) · [API](docs/API.md) · [Deploy](docs/DEPLOYMENT.md) · [Contributing](CONTRIBUTING.md)**

</div>

---

An **Automated Debris Management System**. It tracks debris per load or unit of work from the moment a monitor opens a ticket to the moment that work is invoiced, and it keeps the whole record in a database you control.

Open ADMS is part of [OpenRecover](https://openrecover.com), a set of free, open tools for disaster recovery data. Every deployment is a sovereign instance: your own Postgres, your own keys, your own copy of every ticket, photo, transaction and audit artifact. Nothing phones home.

> [!NOTE]
> Debris monitoring data gets read years after the work, by someone looking for a reason to deobligate a reimbursement. That single fact drives most of the design decisions in this repository. The properties that matter under audit are enforced in the database, where no application bug and no direct `psql` session can route around them.

<br>

## Table of contents

| | |
|---|---|
| [The idea in one paragraph](#the-idea-in-one-paragraph) | What a ticket is and what happens when it completes |
| [What it looks like](#what-it-looks-like) | Back office and field app screenshots |
| [Quick start](#quick-start) | Running locally in about five minutes |
| [How it works](#how-it-works) | Ticket types, the billing engine, roles, federation |
| [Repository map](#repository-map) | Where everything lives |
| [Verification](#verification) | The test suites and what they assert |
| [Deploying](#deploying) | Netlify and Railway, AWS, GCP |
| [Documentation](#documentation) | The full docs index |
| [License and credits](#license-and-credits) | MIT, and who maintains this |

<br>

## The idea in one paragraph

**Tickets are the main focus of an ADMS.** A ticket is linked to a project, a piece of equipment, and the metadata describing the work done. When a ticket completes, it is evaluated against every rule configured for its type on its project. Each rule that matches produces one immutable transaction whose amount is the service code's rate multiplied by a quantity pulled automatically from the ticket's own recorded data. Every change to anything, including the ticket's creation, lands in an immutable audit history.

```mermaid
flowchart LR
    subgraph FIELD["Field"]
      A["Monitor opens<br/>a ticket"] --> B["Barcode handoff<br/>to the second monitor"]
      B --> C["Ticket completes"]
    end
    subgraph ENGINE["Database"]
      C --> D{"Evaluate against<br/>every rule for this<br/>type on this project"}
      D -->|match| E["Transaction<br/>locked on write"]
      D -->|no match| F["no_match,<br/>recorded with a reason"]
    end
    subgraph MONEY["Back office"]
      E --> G["Invoice"]
      G --> H["Closeout package"]
    end
    C -.-> X["Audit artifact"]
    E -.-> X
    G -.-> X

    classDef paper fill:#F3EDE1,stroke:#CFC6B5,color:#0A0C10
    classDef yellow fill:#F5C93F,stroke:#D9A517,color:#07090C
    classDef blue fill:#4E9BEE,stroke:#2C6FBF,color:#07090C
    classDef mute fill:#B9B2A4,stroke:#8C8473,color:#0A0C10
    class A,B,C paper
    class D,E yellow
    class G,H blue
    class F,X mute
```

The structure underneath it:

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

Transactions → Invoices → Reports → Closeout package
Every write → Audit artifact (append-only, enforced in the database)
```

<br>

## What it looks like

<table>
<tr>
<td width="50%" valign="top">

**Back office** · project setup, ticket review, rules, invoicing, audit

<img src="docs/assets/back-office-dashboard.png" alt="Open ADMS back office dashboard showing ticket counts, cubic yards, billable total, project readiness checklist, volume chart, and open incidents" width="100%">

</td>
<td width="50%" valign="top">

**Rule builder** · plain-language rules with a live dry run

<img src="docs/assets/back-office-rule-builder.png" alt="Open ADMS rule builder listing rules grouped by ticket type, each showing its conditions, the service code and contract it bills under, matched ticket count and billed total" width="100%">

</td>
</tr>
</table>

<details>
<summary><b>The field app</b> · one shared record, offline tolerant, rendered entirely from the ticket type schema</summary>
<br>
<table>
<tr>
<td width="50%" valign="top"><img src="docs/assets/field-app-home.png" alt="Open ADMS field app home screen" width="100%"></td>
<td width="50%" valign="top"><img src="docs/assets/field-app-load-ticket.png" alt="Open ADMS field app load ticket collection stage with GPS capture, truck selection, barcode scan and certified capacity" width="100%"></td>
</tr>
</table>

Neither client hard codes a ticket type. Both fetch `stage_schema` and `field_schema` from the catalog and render from them, which is why a new ticket type is an `INSERT` rather than a release. See [Ticket types](docs/TICKET_TYPES.md).

</details>

<br>

## Quick start

You need Postgres. If you do not have one running, this repository ships a container for it.

```bash
git clone https://github.com/MrRyanAlexander/openadms.git
cd openadms
docker compose up -d db        # Postgres 16 with PostGIS on localhost:5432
npm run setup                  # asks what it needs, writes every .env, applies the schema
```

`npm run setup` is an interactive installer. It collects the deployment destination, the `DATABASE_URL` and the instance name, mints a fresh 64 hex `INSTANCE_UNIQUE_KEY` and an Ed25519 key pair, writes every `.env` file, and offers to apply the schema with the test suite attached.

<details>
<summary><b>Prefer to do it by hand?</b></summary>
<br>

```bash
export DATABASE_URL=postgresql://adms:adms@localhost:5432/openadms
./database/setup.sh --with-demo --test

cd backend  && pip install -r requirements.txt && uvicorn app.main:app --port 8080
cd frontend && npm install && npm run dev     # back office  → http://localhost:5173
cd mobile   && npm install && npm run dev     # field app    → http://localhost:5174
```

The API serves interactive OpenAPI documentation at `http://localhost:8080/docs`, and `GET /health` runs a real query so a half open database reports as degraded rather than healthy.

</details>

<details>
<summary><b>Demo accounts</b></summary>
<br>

`./database/setup.sh --with-demo` seeds **DEMO Project 01 - Hurricane Vesper**, a right of way collection project with 100+ tickets, contractors, disposal sites, service codes, rates, rules and processed transactions. Every name in it is invented, down to the state code `XX`, so demo data can never be mistaken for a real programme.

Want more of it? There are two shapes of demo data, and they answer different questions.

**Showcase** is the one to run first. Twenty projects across six declarations inside ten thousand tickets, small enough for a free Postgres:

```bash
npm run db:seed:showcase                  # 20 projects, 6 declarations, 10,000 tickets
./database/seed-showcase.sh 4000          # the same 20 projects, fewer tickets
./database/seed-showcase.sh 10000 -s 7    # a different random spread of the work
```

Two hurricanes, a flood, a wildfire, an ice storm and a state river flood, and inside those: six of the seven programs, five kinds of client, seven ticket types, per cubic yard and per ton and per unit and per hour and banded pricing, projects in setup, active, paused, closeout and closed, a contract shared by two projects and decided separately on each, an approved invoice that locks its tickets, a corrected certification that reprices what it touched, permits verified and pending and expired, and loads still out in the field. About two minutes and 150 MB.

**Volume** answers "is it still fast at this size":

```bash
npm run db:seed:large                     # 25,000 more tickets on the demo project
./database/seed-large.sh 250000 -p 10     # 10 more DEMO projects, 250,000 tickets split across them
./database/seed-large.sh 1000000 -p 20    # the ceiling: 1,000,000 tickets, 20 projects
```

Every generated project is complete on its own: its own client, contractors, contract and line items, sites, zones, crew, trucks, certifications, service codes, rates and rules, named after a storm that does not exist. The volume seed costs about four minutes and a quarter of a gigabyte per 25,000 tickets, so a million tickets wants a paid database and an hour or two.

| Username | Role | What it is useful for |
|---|---|---|
| `admin` | Admin | Ticket catalog, users, instance and peer settings, reversals |
| `manager` | Manager | Clients, contracts, workers, project assignments |
| `analyst` | Analyst | Rules, service codes, rates, the query builder |
| `monitor1` `monitor2` `monitor3` `monitor4` | Monitor | The field app |

Password for all of them is `openadms`.

> [!WARNING]
> The demo seed exists to make the system explorable. Never run `--with-demo` against an instance that will hold real project data.

</details>

<br>

## How it works

### A ticket type is data, not code

Each row in `ticket_types` declares its own lifecycle (`stage_schema`) and its own form (`field_schema`) as JSON. The field app and the back office render entirely from those two documents, so adding a Right of Entry, a Time and Material ticket, a Damage Survey, or something a contract invents next season is an `INSERT`, not a release.

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

<details>
<summary><b>Every extension point in the system</b></summary>
<br>

| Extension point | How you extend it |
|---|---|
| Ticket types | Row in `ticket_types` with stage and field schemas |
| Rule operands | Row in `rule_operands` naming a column on `ticket_evaluation` |
| Operators | Row in `rule_operators` |
| Units of measure | Row in `unit_types` naming a column on `ticket_metrics` |
| Debris classification | Row in `debris_types` |
| Incident taxonomy | Row in `incident_categories` (self referencing tree) |
| Roles | Row in `roles` with a rank; permissions inherit by rank |
| Type specific fields | `tickets.data` JSONB, GIN indexed |

Two ticket types are **hidden system types**, Pending Collection and Pending Disposal. They exist as transient handoff objects and a database trigger refuses to let them be added to a project.

Full reference: [Ticket types](docs/TICKET_TYPES.md).

</details>

### The billing engine

A rule reads: *when these conditions hold on a completed ticket of this type, bill this service code under this contract.*

- Statement lines are built from project bound options. If three contractors are on the project, those three are what the `Contractor =` picker offers.
- A rule **cannot be saved** without a service code and a contract, and both must already belong to the project. Enforced by trigger, not by the UI.
- A rate carries a **unit type**, and the unit type names the derived measurement the engine reads. `per_cubic_yard` uses certified capacity multiplied by load call, `per_ton` uses net scale weight divided by 2000, `per_mile` uses the odometer, else the recorded waypoint path, else straight line origin to destination.
- Quantity is **never typed by a human**. Where a ticket carries no measurable value it defaults to 1.
- Transactions are **system generated and permanently locked**. `UPDATE` and `DELETE` are blocked by a database trigger. A correction is a reversal row plus a fresh computation, and both stay in the ledger.
- Rates are effective dated, so a mid project rate change never rewrites a transaction that was already computed.

<details>
<summary><b>Where each quantity comes from</b></summary>
<br>

| Unit type | Reads | Derived from |
|---|---|---|
| `per_cubic_yard` | `billable_cubic_yards` | certified capacity × load call % |
| `per_ton` | `net_tons` | net weight, else gross − tare, ÷ 2000 |
| `per_mile` | `haul_miles` | odometer, else waypoint path, else straight line |
| `per_labor_hour` | `labor_hours` | recorded on the ticket |
| `per_equip_hour` | `equipment_hours` | recorded on the ticket |
| `per_unit` | `unit_count` | `tickets.quantity`, else 1 |
| `per_each` / `flat` | `each` / `flat` | always 1 |
| `per_diameter_in` | `stump_diameter_inches` | `tickets.data` |
| `per_linear_foot` | `linear_feet` | `tickets.data` |

Full reference: [The rules engine](docs/RULES_ENGINE.md).

</details>

### Roles are cumulative by rank

A role holds every permission of every role beneath it, so there is no grant table to maintain and no way for two roles to drift apart.

| Role | Rank | Adds |
|---|---|---|
| **Monitor** | 10 | Create tickets, advance stages, file incidents, read own tickets |
| **Manager** | 20 | Clients, contracts, workers, project assignments, documents, project ticket types, audit read |
| **Analyst** | 30 | Rules, service codes, rates, disposal sites, transaction processing, query builder |
| **Admin** | 40 | Ticket type catalog, users, instance and peer settings, transaction reversal, invoice approval |

**The active project is always in context.** The API refuses any ticket write for a project the acting user is not assigned to, and a ticket can only be created when the project is fully configured *and* the creator is an approved worker on it. Both gates live in the database. See [Access control](docs/ACCESS_CONTROL.md).

### Federation between independent instances

Every deployment is sovereign. Two agencies, a county and its monitoring firm, or a prime and its subcontractor can each run their own instance and still read specific records from each other without either one surrendering their database.

| Visibility flag | Who can read it |
|---|---|
| `private` | Authenticated users of this instance only |
| `restricted` | Peers listed in `allowed_viewers`, presenting a valid `X-Signature` |
| `public` | Any caller, no signature |

A signed peer read presents `X-Instance-Key`, `X-Timestamp`, `X-Nonce` and `X-Signature` over `METHOD\npath\ninstance_key\ntimestamp\nnonce\nbody_sha256`. Timestamps outside the skew window are refused, nonces are single use, unknown or untrusted peers are refused outright, and every peer read is written to the audit trail. See [Federation](docs/FEDERATION.md).

<br>

## Repository map

```
openadms/
├── database/      Postgres schema, 18 migrations, seeds, setup script, test suite
├── backend/       FastAPI server app (EXPOSE 8080)
├── frontend/      Back office, desktop web app (Netlify)
├── mobile/        Field companion, mobile web app / PWA (Netlify)
├── deploy/        npm run setup / teardown, plus Terraform for Netlify+Railway, AWS, GCP
├── e2e/           Playwright walk of both frontends
├── docs/          Everything below
└── Dockerfile     The API image. One file, built by Railway, compose, App Runner and Cloud Run.
```

`npm run setup` is the installer and `npm run teardown` is its inverse. Both
live in [`deploy/`](deploy), which has its own [README](deploy/README.md)
explaining the layout and how the API image gets built.

| Directory | What lives there | Lines |
|---|---|---|
| [`database/`](database) | 18 forward-only migrations, 13 views, 27 functions, 13 triggers, 3 seed files | ~5,900 |
| [`backend/`](backend) | FastAPI, asyncpg, 11 routers under `/api/v1` | ~8,000 |
| [`frontend/`](frontend) | React and Vite, 13 pages | ~8,700 |
| [`mobile/`](mobile) | React and Vite, 7 screens, offline queue | ~2,100 |
| [`deploy/`](deploy) | Terraform for three clouds, plus the Railway and Netlify CLI provisioner | ~2,900 |

<br>

## Verification

```bash
./database/setup.sh --with-demo --test   # 160 schema assertions
cd backend && python3 -m pytest          # 151 API tests
npm run build                            # both frontends
npm run test:ui                          # Playwright walk of the back office
```

Every suite is written to be re-runnable against the same database, not only against a fresh one. A test that passes once and then quietly passes for the wrong reason is worse than no test, so anything that mutates the demo data derives its target from the current state rather than from a written-in value.

To work the screens at real volume:

```bash
npm run db:seed:large            # 25,000 tickets on the demo project
npm run db:seed:large -- 50000   # a specific number
npm run setup -- --large-seed=25000   # or load it during the initial setup
```

`npm run setup` offers it once, after the migrations and the demo seed, and defaults to no. Answering no builds exactly the database the Railway and Netlify path has always expected. An unattended run gets it only when `--large-seed` names a number, the count is recorded in `.deploy-state.json` so a resumed run does not add a second batch, and a volume seed that fails never fails the install. Either way it states what it is about to do and prices every ticket it generates through the real rules engine.

The schema suite runs as plain SQL with no pgTAP dependency. Every assertion raises on failure, so the whole file fails loudly under `psql -v ON_ERROR_STOP=1`.

<details>
<summary><b>What the suites actually assert</b></summary>
<br>

The schema suite covers the creation gate, rule save gates, quantity derivation, multi rule matching, idempotent re-processing, transaction and audit immutability, reversal arithmetic, and that a brand new ticket type bills through the same engine with no code change.

The API suite drives a full load ticket from the right of way through the barcode handoff to a locked transaction. A sample of the test names, which double as a specification:

```
test_the_field_app_can_run_a_load_ticket_end_to_end
test_a_rule_cannot_be_saved_without_a_contract_on_the_project
test_a_new_rate_supersedes_the_old_one_without_rewriting_history
test_transactions_are_immutable_through_the_api
test_voiding_reverses_the_ledger
test_every_edit_leaves_an_audit_artifact
test_query_builder_rejects_injected_columns
test_a_new_ticket_type_is_added_as_data
test_system_ticket_types_cannot_be_added_to_a_project
test_a_restricted_project_needs_a_valid_signature
test_a_peer_read_is_written_to_the_audit_trail
test_a_manager_cannot_grant_admin_rank
test_a_pending_permit_never_blocks_a_ticket
test_the_manifest_says_what_is_unverified_rather_than_hiding_it
```

Federation is proven with two live instances. `test_a_restricted_project_needs_a_valid_signature` registers Beta on Alpha, restricts a project to Beta's key, then asserts that Beta reads it, that a replayed nonce is refused, that a forged signature is refused, that an unregistered third party receives 403, and that an unsigned request receives 403.

Full reference: [Testing](docs/TESTING.md).

</details>

<br>

## Deploying

No dashboard clicking and no GitHub connection required. Both platform CLIs do the work, and the frontends are built locally and pushed as static assets.

```bash
npm run preflight            # what is installed, what you are signed in to
npm run deploy:plan          # the exact commands, without running any of them
npm run setup                # choose "Netlify + Railway" and let it run
```

If a CLI is missing the installer names it, explains what it is for, shows the install command, offers to run it, then re-checks. If you are not signed in it offers to run the login flow. Either way you come back to the same place rather than being dropped at a shell prompt.

Progress is recorded in `.deploy-state.json`, so a failed step is fixed and re-run rather than starting over.

| Target | Frontends | API | Database |
|---|---|---|---|
| **Netlify + Railway** (default) | Netlify, two sites | Railway, Docker | Railway Postgres |
| **AWS** | S3 and CloudFront | App Runner | RDS Postgres 16 |
| **Google Cloud** | Firebase Hosting | Cloud Run | Cloud SQL Postgres 16 |

Full guide: [Deployment](docs/DEPLOYMENT.md). When something breaks: [Troubleshooting](docs/TROUBLESHOOTING.md).

<br>

## Documentation

| Page | Covers |
|---|---|
| [**Documentation index**](docs/) | Start here. Every page, grouped by what you are trying to do. |
| [Architecture](docs/ARCHITECTURE.md) | The four parts, why the logic lives in the database, request flow, offline |
| [Data model](docs/DATA_MODEL.md) | Every table and why it exists |
| [Entity relationships](docs/ERD.md) | The spine as a diagram, plus the evaluation path |
| [Ticket types](docs/TICKET_TYPES.md) | `stage_schema`, `field_schema`, and writing a new type |
| [The rules engine](docs/RULES_ENGINE.md) | Operands, operators, matching, quantity derivation, reversals |
| [Access control](docs/ACCESS_CONTROL.md) | Roles, ranks, permissions, project scoping, sessions |
| [Federation](docs/FEDERATION.md) | Instance identity, peers, signing, the trust model |
| [API reference](docs/API.md) | Every endpoint under `/api/v1` |
| [Deployment](docs/DEPLOYMENT.md) | Netlify and Railway, AWS, GCP, migrations in production |
| [Testing](docs/TESTING.md) | Both suites, what they cover, how to add to them |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | The errors people actually hit |
| [Product specification](docs/spec/) | The numbered, testable definition of correct for v1.0 |

<br>

## Contributing

Field experience counts as much as code here. A monitor who can describe exactly why a load call gets disputed is contributing something a developer cannot.

- [Contributing guide](CONTRIBUTING.md) covers the development setup, the migration rules, and what a good pull request looks like.
- [Propose a ticket type](../../issues/new?template=ticket_type.yml) if your contract needs a form this catalog does not have yet.
- [Report a bug](../../issues/new?template=bug_report.yml) or [request a feature](../../issues/new?template=feature_request.yml).
- [Security policy](SECURITY.md) for anything involving data exposure, authentication or the peer signing scheme. Do not open a public issue for those.

> [!IMPORTANT]
> Migrations are forward only and each file records its `sha256`. Editing a migration that has already been applied is schema drift, and `./database/migrate.sh --verify` is what catches it in CI. Add a new file instead.

<br>

## License and credits

Released under the [MIT License](LICENSE). Use it, fork it, sell services around it, run it inside a prime contractor's shop. The only thing asked is that the copyright notice travels with it.

Maintained by [Ryan Price](https://github.com/MrRyanAlexander), a debris data manager with seven years of recovery operations across multiple federal declarations, and independent of any prime contractor.

Part of [OpenRecover](https://openrecover.com). The related tools, Companion Dispatch and the ArcGIS Pro drop-ins, are listed there.

<div align="center">
<br>
<sub><b>Open data. Real recovery.</b></sub>
</div>
