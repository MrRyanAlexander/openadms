# API reference

Base path `/api/v1`. Bearer JWT, except `/health`, `/auth/login`,
`/auth/refresh`, `/peer/identity` and the signed peer read surface.

Interactive documentation is served at `/docs`.

Errors are one envelope:

```json
{ "error": { "code": "unprocessable", "message": "...", "details": { } } }
```

## Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | Returns access + refresh tokens, the user, and their project assignments |
| POST | `/auth/refresh` | Single-use rotation |
| POST | `/auth/logout` | Revokes the refresh token |
| GET | `/auth/me` | User, projects, effective permissions |
| POST | `/auth/password` | Changes password and revokes other sessions |

## Reference data

| Method | Path | Notes |
|---|---|---|
| GET | `/lookups` | One call the clients make at boot |
| GET | `/ticket-types` | `include_system`, `kind` |
| GET | `/projects/{id}/options/{source}` | Project-scoped option lists for every dropdown |
| GET | `/projects/{id}/rule-operands` | Operands filtered to a ticket type, each with its operators |

Option sources: `project_contractors`, `project_contracts`, `project_sites`,
`project_zones`, `project_equipment`, `project_workers`,
`project_service_codes`, `project_ticket_types`, `debris_types`,
`debris_categories`, `ticket_statuses`, `incident_categories`,
`incident_subcategories`, `site_kinds`, `equipment_types`, `severities`,
`ticket_sources`.

## Organization

Full CRUD on `/clients`, `/contractors`, `/contracts`, `/sites`, `/equipment`,
`/disasters`, `/users`. All support `q`, `limit`, `offset`, `active_only`.

## Projects

| Method | Path |
|---|---|
| GET / POST | `/projects` |
| GET / PATCH / DELETE | `/projects/{id}` |
| GET | `/projects/{id}/readiness` |
| PUT | `/projects/{id}/share` |
| POST / DELETE | `/projects/{id}/contractors`, `/contracts`, `/sites`, `/ticket-types`, `/zones`, `/assignments` |

## Tickets

| Method | Path | Notes |
|---|---|---|
| GET | `/projects/{id}/tickets` | Search, filter, sort, with window totals |
| POST | `/projects/{id}/tickets` | `client_uuid` makes offline replay idempotent |
| GET | `/tickets/{id}` | Ticket, overview, type, stages, waypoints, media, transactions, metrics, audit |
| PATCH | `/tickets/{id}` | `_reason` is written into the audit artifact |
| POST | `/tickets/{id}/stages` | Advance a lifecycle stage; completes and bills where the schema says so |
| POST | `/tickets/{id}/waypoints` | Batch |
| POST / PATCH / DELETE | `/tickets/{id}/media` |
| POST | `/tickets/{id}/handoff` | Mint the pending object |
| GET | `/projects/{id}/scan/{barcode}` | Returns an open handoff, else the truck |
| POST | `/tickets/{id}/void` | Reverses existing transactions |
| PUT | `/tickets/{id}/share` |
| POST | `/tickets/{id}/process` | Run the rules engine over one ticket |
| POST | `/projects/{id}/tickets/process` | Drain the queue |

## Billing

| Method | Path |
|---|---|
| GET / POST | `/projects/{id}/service-codes` |
| PATCH / DELETE | `/service-codes/{id}` |
| POST | `/service-codes/{id}/rates` |
| GET / POST | `/projects/{id}/rules` |
| GET | `/rules/{id}` |
| PUT / DELETE | `/rules/{id}` |
| POST | `/rules/{id}/test` | Dry run; writes nothing |
| GET | `/projects/{id}/transactions` |
| POST | `/transactions/{id}/reverse` |
| GET / POST | `/projects/{id}/invoices` |
| GET / PATCH | `/invoices/{id}` |
| DELETE | `/invoices/{id}/lines/{lineId}` |

## Reporting

| Method | Path |
|---|---|
| GET | `/projects/{id}/dashboard?days=` |
| GET | `/audit` |
| GET | `/query/sources` |
| POST | `/query/run` |
| GET | `/projects/{id}/export/{dataset}` |

The query builder validates column names and operators against the live view
definition server side, and every value is a bound parameter.

## Instance and peers

| Method | Path |
|---|---|
| GET / POST / PATCH | `/instance` |
| POST | `/instance/rotate-keys` |
| GET / POST | `/peers` |
| PATCH / DELETE | `/peers/{id}` |
| GET | `/peer/identity` | Unauthenticated discovery |
| GET | `/peer/projects/{id}/tickets` | The signed peer read |

### Signing a peer request

```
payload = METHOD + "\n" + path + "\n" + instance_key + "\n"
        + timestamp + "\n" + nonce + "\n" + sha256(body)

X-Instance-Key: <64 hex>
X-Timestamp:    <ISO 8601>
X-Nonce:        <single use>
X-Signature:    base64(ed25519_sign(payload))
```
