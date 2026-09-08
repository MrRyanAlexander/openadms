# Architecture

Four deployable parts, one contract between them.

```
┌──────────────────┐        ┌──────────────────┐
│  frontend/       │        │  mobile/         │
│  Back office     │        │  Field companion │
│  Vite + React    │        │  Vite + React    │
│  Netlify         │        │  Netlify (PWA)   │
└────────┬─────────┘        └────────┬─────────┘
         │  VITE_API_URL              │  VITE_API_URL
         └────────────┬───────────────┘
                      ▼
            ┌──────────────────────┐        ┌──────────────────────┐
            │  backend/            │◄──────►│  Peer instances      │
            │  FastAPI + asyncpg   │ signed │  X-Signature reads   │
            │  Docker, EXPOSE 8080 │  reads └──────────────────────┘
            └──────────┬───────────┘
                       │  DATABASE_URL
                       ▼
            ┌──────────────────────┐
            │  database/           │
            │  Postgres 16         │
            │  PostGIS optional    │
            └──────────────────────┘
```

## Why the logic lives in the database

Debris monitoring data is read years later by someone looking for a reason to
deobligate. The properties that matter — an audit artifact for every change,
transactions that cannot be edited, a ticket that cannot exist on an
unconfigured project — are worth nothing if an application bug or a direct
`psql` session can bypass them. So they are enforced where nothing can:

| Property | Enforced by |
|---|---|
| Transactions never change | `BEFORE UPDATE OR DELETE` trigger raising `restrict_violation` |
| Audit history never changes | The same trigger on `audit_events` |
| Every write is audited | `AFTER INSERT/UPDATE/DELETE` row trigger on 24 tables |
| Tickets need a ready project | `BEFORE INSERT` trigger reading `project_readiness_summary` |
| Tickets need an approved creator | The same trigger against `project_assignments` |
| Rules need a project-scoped code and contract | `BEFORE INSERT OR UPDATE` trigger on `rules` |
| Service codes need a project contractor | `BEFORE INSERT OR UPDATE` trigger on `service_codes` |
| Hidden ticket types stay hidden | `BEFORE INSERT` trigger on `project_ticket_types` |
| One transaction per ticket per rule | Partial unique index |
| One transaction per invoice | Unique index on `invoice_lines.transaction_id` |

The API sets `adms.actor_id`, `adms.actor_name`, `adms.actor_role`,
`adms.reason` and `adms.request_id` as transaction-local settings before every
write, so the audit trigger can attribute the change without the application
having to remember to log it.

## Portability

PostGIS is **optional**. Every coordinate is stored as plain `numeric` latitude
and longitude, and distance falls back to a great-circle function written in
SQL. Migration `0013` detects PostGIS and, where present, layers generated
`geography` columns and GiST indexes on top. The same schema runs unchanged on
Railway, Neon, Supabase, RDS and Cloud SQL.

The API takes exactly one database variable, `DATABASE_URL`, and normalises the
`postgres://` and `postgresql+asyncpg://` spellings different hosts hand out.

CORS is configured by **regex**, not by list, because Netlify deploy previews get
a generated hostname on every build.

## The catalog is the contract between server and clients

Neither client hard-codes a ticket type. Both fetch
`ticket_types.stage_schema` and `ticket_types.field_schema` and render from
them:

- The field app walks the stages in order, showing only the fields declared for
  the current stage, choosing an input per `type` (`percent` becomes load-call
  buttons plus a slider, `photo` opens the camera, `barcode` offers a scan,
  `gps` is captured automatically).
- The back office renders the same schema as a read-only lifecycle timeline, and
  edits it in the Ticket Catalog screen.

A field the type invents that has no column lands in `tickets.data` (JSONB, GIN
indexed) and is still queryable, reportable and rule-addressable.

## Request flow, a load ticket

1. Monitor opens the app; `/auth/me` returns their project assignments.
2. They pick Load Ticket; the client renders stage 1 from `stage_schema`.
3. `POST /projects/{id}/tickets` with a `client_uuid` minted on the phone. The
   database assigns `STL-0000123` and runs the creation gate.
4. Waypoints stream in as the truck moves.
5. `POST /tickets/{id}/handoff` mints the pending object the driver carries.
6. At the site the second monitor scans; `GET /projects/{id}/scan/{barcode}`
   returns the open handoff.
7. `POST /tickets/{id}/stages` with the disposal stage. The API mirrors the
   stage onto the ticket's flat columns, marks it complete, and calls
   `adms_process_ticket`.
8. Each matching rule writes one locked transaction. The ticket's
   `processing_state` becomes `processed`.
9. Every one of those writes left an audit artifact.

## Offline

The field app treats loss of signal as normal. Each ticket is minted with a
`client_uuid` before it leaves the phone; the server returns the ticket it
already stored rather than creating a second one, so replaying the queue is
idempotent. Writes that cannot reach the server are held in `localStorage` and
flushed automatically when connectivity returns. Drafts survive a locked phone.
A 4xx response is treated as a permanent rejection and dropped from the queue; a
5xx or a network failure is retried.
