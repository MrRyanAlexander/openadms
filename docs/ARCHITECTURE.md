<div align="center">
<sub>

**[Docs index](README.md)** · [Data model](DATA_MODEL.md) · [ERD](ERD.md) · [Ticket types](TICKET_TYPES.md) · [Rules](RULES_ENGINE.md) · [Access](ACCESS_CONTROL.md) · [Federation](FEDERATION.md) · [API](API.md) · [Deploy](DEPLOYMENT.md) · [Testing](TESTING.md) · [Troubleshooting](TROUBLESHOOTING.md)

</sub>
</div>

# Architecture

Four deployable parts, one contract between them.

```mermaid
flowchart TB
    subgraph C["Clients, rendered from the catalog"]
      direction LR
      FE["<b>frontend/</b><br/>Back office<br/>Vite + React<br/>Netlify"]
      MO["<b>mobile/</b><br/>Field companion<br/>Vite + React, PWA<br/>Netlify"]
    end

    API["<b>backend/</b><br/>FastAPI + asyncpg<br/>Docker, EXPOSE 8080"]
    DB[("<b>database/</b><br/>Postgres 16<br/>PostGIS optional")]
    PEER["<b>Peer instances</b><br/>Ed25519 signed reads"]

    FE -->|VITE_API_URL| API
    MO -->|VITE_API_URL| API
    API -->|DATABASE_URL| DB
    API <-->|X-Signature| PEER

    classDef paper fill:#F3EDE1,stroke:#CFC6B5,color:#0A0C10
    classDef yellow fill:#F5C93F,stroke:#D9A517,color:#07090C
    classDef blue fill:#4E9BEE,stroke:#2C6FBF,color:#07090C
    classDef mute fill:#B9B2A4,stroke:#8C8473,color:#0A0C10
    class FE,MO paper
    class API blue
    class DB yellow
    class PEER mute
```

Each part takes exactly one variable from the part below it. The API takes `DATABASE_URL`. Both frontends take `VITE_API_URL`. There is no service discovery layer, no message broker and no cache tier to keep coherent.

<br>

## Why the logic lives in the database

Debris monitoring data is read years later by someone looking for a reason to deobligate. The properties that matter under that reading, an audit artifact for every change, transactions that cannot be edited, a ticket that cannot exist on an unconfigured project, are worth nothing if an application bug or a direct `psql` session can bypass them. So they are enforced where nothing can.

| Property | Enforced by |
|---|---|
| Transactions never change | `BEFORE UPDATE OR DELETE` trigger raising `restrict_violation` |
| Audit history never changes | The same trigger on `audit_events` |
| Every write is audited | `AFTER INSERT/UPDATE/DELETE` row trigger on 24 tables |
| Tickets need a ready project | `BEFORE INSERT` trigger reading `project_readiness_summary` |
| Tickets need an approved creator | The same trigger against `project_assignments` |
| Rules need a project scoped code and contract | `BEFORE INSERT OR UPDATE` trigger on `rules` |
| Service codes need a project contractor | `BEFORE INSERT OR UPDATE` trigger on `service_codes` |
| Hidden ticket types stay hidden | `BEFORE INSERT` trigger on `project_ticket_types` |
| Estimates are append only | `BEFORE UPDATE OR DELETE` trigger on `project_estimates` |
| A permit cannot be verified without a document | `BEFORE UPDATE` trigger on `project_sites` |
| One transaction per ticket per rule | Partial unique index |
| One transaction per invoice | Unique index on `invoice_lines.transaction_id` |

> [!TIP]
> The API sets `adms.actor_id`, `adms.actor_name`, `adms.actor_role`, `adms.reason` and `adms.request_id` as transaction local settings before every write, so the audit trigger can attribute the change without the application having to remember to log it. A write that forgets to set them still gets audited, just without a name attached.

<br>

## Portability

PostGIS is **optional**. Every coordinate is stored as plain `numeric` latitude and longitude, and distance falls back to `adms_distance_miles`, a great circle function written in SQL. Migration [`0013_postgis_optional.sql`](../database/migrations/0013_postgis_optional.sql) detects PostGIS and, where present, layers generated `geography` columns and GiST indexes on top.

The same schema runs unchanged on Railway, Neon, Supabase, RDS and Cloud SQL.

<details>
<summary><b>The small compatibility details that make that true</b></summary>
<br>

| Detail | Why it exists |
|---|---|
| `DATABASE_URL` is normalised in [`config.py`](../backend/app/config.py) | Hosts hand out `postgres://`, `postgresql://` and `postgresql+asyncpg://`. All three are accepted |
| CORS is configured by **regex**, not by list | Netlify deploy previews get a generated hostname on every build |
| `Content-Disposition` is in `expose_headers` | Otherwise a download arrives named `download` whatever the server called it |
| Every migration records its `sha256` | `./database/migrate.sh --verify` fails if an applied file changed on disk |
| The API image is a plain `Dockerfile` with `EXPOSE 8080` | App Runner, Cloud Run and Railway all accept it without modification |

</details>

<br>

## The catalog is the contract between server and clients

Neither client hard codes a ticket type. Both fetch `ticket_types.stage_schema` and `ticket_types.field_schema` and render from them.

- The **field app** walks the stages in order, showing only the fields declared for the current stage, choosing an input per `type`. A `percent` becomes load call buttons plus a slider, `photo` opens the camera, `barcode` offers a scan, `gps` is captured automatically.
- The **back office** renders the same schema as a read only lifecycle timeline, and edits it in the Ticket Catalog screen.

A field the type invents that has no column lands in `tickets.data`, which is JSONB and GIN indexed, and is still queryable, reportable and rule addressable.

Full reference: [Ticket types](TICKET_TYPES.md).

<br>

## Request flow, a load ticket

```mermaid
sequenceDiagram
    autonumber
    participant M1 as Loading monitor
    participant M2 as Disposal monitor
    participant API as backend/
    participant DB as Postgres

    M1->>API: GET /auth/me
    API-->>M1: user + project assignments
    M1->>API: GET /ticket-types
    API-->>M1: stage_schema + field_schema
    M1->>API: POST /projects/{id}/tickets (client_uuid)
    API->>DB: INSERT, creation gate runs
    DB-->>API: STL-0000123
    M1->>API: POST /tickets/{id}/waypoints (batched)
    M1->>API: POST /tickets/{id}/handoff
    API->>DB: mint pending handoff object
    M2->>API: GET /projects/{id}/scan/{barcode}
    API-->>M2: the open handoff
    M2->>API: POST /tickets/{id}/stages (disposal)
    API->>DB: mirror stage onto flat columns, mark complete
    DB->>DB: adms_process_ticket, evaluate every rule
    DB-->>API: one locked transaction per match
    API-->>M2: processing_state = processed
```

Every write in that sequence left an audit artifact.

<br>

## Offline

The field app treats loss of signal as normal rather than as an error state.

| Behavior | How |
|---|---|
| No duplicate tickets on replay | Each ticket is minted with a `client_uuid` before it leaves the phone. The server returns the ticket it already stored rather than creating a second one |
| Writes survive a dead zone | Anything that cannot reach the server is held in `localStorage` and flushed automatically when connectivity returns |
| Drafts survive a locked phone | Stage input is persisted as it is typed, not on submit |
| The queue cannot wedge | A 4xx response is treated as a permanent rejection and dropped. A 5xx or a network failure is retried |

> [!NOTE]
> Idempotency is the property that makes the rest of it safe. Without `client_uuid`, a monitor in a dead zone who retries three times creates three tickets and three transactions, and someone spends a week reconciling them at closeout.

<br>

## Where to read next

| You want to | Go to |
|---|---|
| Understand the tables | [Data model](DATA_MODEL.md) and [ERD](ERD.md) |
| Add a ticket type | [Ticket types](TICKET_TYPES.md) |
| Understand billing | [The rules engine](RULES_ENGINE.md) |
| Call the API | [API reference](API.md) |
| Run two instances against each other | [Federation](FEDERATION.md) |

<div align="center">
<sub>

**[Docs index](README.md)** · **[Repository](../README.md)**

</sub>
</div>
