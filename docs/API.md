<div align="center">
<sub>

[Docs index](README.md) · [Architecture](ARCHITECTURE.md) · [Data model](DATA_MODEL.md) · [ERD](ERD.md) · [Ticket types](TICKET_TYPES.md) · [Rules](RULES_ENGINE.md) · [Access](ACCESS_CONTROL.md) · [Federation](FEDERATION.md) · **API** · [Deploy](DEPLOYMENT.md) · [Testing](TESTING.md) · [Troubleshooting](TROUBLESHOOTING.md)

</sub>
</div>

# API reference

Base path `/api/v1`. Bearer JWT on everything except `/health`, `/auth/login`, `/auth/refresh`, `/peer/identity` and the signed peer read surface.

**Interactive OpenAPI documentation is served at `/docs`** on any running instance, and the machine readable document at `/openapi.json`. This page is the map. That is the reference.

<br>

## Conventions

Errors are one envelope, whatever went wrong:

```json
{ "error": { "code": "unprocessable", "message": "...", "details": { } } }
```

| Header | On every response |
|---|---|
| `X-Request-Id` | Echoed from the request or minted. Appears in the audit trail as `request_id` |
| `X-Response-Time` | Server side milliseconds |

| Convention | Applies to |
|---|---|
| `q`, `limit`, `offset`, `active_only` | Every list endpoint |
| `_reason` in a `PATCH` body | Written into the audit artifact for that change |
| `client_uuid` on ticket creation | Makes offline replay idempotent |
| `include_system` | Ticket type listings, admin only |

<br>

## Meta

| Method | Path | Notes |
|---|---|---|
| `GET` | `/` | Name, version, environment |
| `GET` | `/health` | Liveness plus a real query, so a half open database reports `degraded` rather than `ok`. Returns project, ticket and migration counts |
| `GET` | `/docs` | Interactive OpenAPI |

<br>

## Auth

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/login` | Returns access and refresh tokens, the user, and their project assignments |
| `POST` | `/auth/refresh` | Single use rotation |
| `POST` | `/auth/logout` | Revokes the refresh token |
| `GET` | `/auth/me` | User, projects, effective permissions |
| `POST` | `/auth/password` | Changes password and revokes other sessions |

See [Access control](ACCESS_CONTROL.md) for token lifetimes and the rank model.

<br>

## Reference data

| Method | Path | Notes |
|---|---|---|
| `GET` | `/lookups` | One call the clients make at boot. Everything static in a single payload |
| `GET` | `/ticket-types` | Filters: `include_system`, `kind` |
| `GET` `PUT` `DELETE` | `/ticket-types/{id}` | System types cannot be edited |
| `GET` | `/projects/{id}/options/{source}` | Project scoped option lists for every dropdown |
| `GET` | `/projects/{id}/rule-operands` | Operands filtered to a ticket type, each with its operators |

**Option sources:** `project_contractors`, `project_contracts`, `project_sites`, `project_zones`, `project_equipment`, `project_workers`, `project_service_codes`, `project_ticket_types`, `debris_types`, `debris_categories`, `ticket_statuses`, `incident_categories`, `incident_subcategories`, `site_kinds`, `equipment_types`, `severities`, `ticket_sources`.

<br>

## Organization

Full CRUD on `/clients`, `/contractors`, `/contracts`, `/sites`, `/equipment`, `/disasters`, `/users`. All support `q`, `limit`, `offset` and `active_only`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/contracts/remediation` | Contracts missing a document link, which the API refuses to accept silently |
| `GET` `POST` | `/contracts/{id}/line-items` | The priced lines a contract contains |
| `POST` | `/contracts/{id}/line-items/import` | Paste a table. Dry run first, then commit atomically |
| `PATCH` `DELETE` | `/line-items/{id}` | |
| `GET` `POST` | `/contracts/{id}/ingestions` | Contract intake staging |
| `GET` `POST` | `/ingestions/{id}/proposals` | Proposed line items awaiting review |
| `POST` | `/ingestions/{id}/close` | Finish the review |

> [!NOTE]
> A contract cannot be created without a document link, and the link has to be a URL. `test_a_contract_without_a_document_link_is_refused` and `test_a_contract_document_link_must_be_a_url` cover it. The reason is closeout: a contract nobody can produce a copy of is a finding.

<br>

## Projects

| Method | Path | Notes |
|---|---|---|
| `GET` `POST` | `/projects` | Sorting and filtering. A manager sees only their assignments |
| `GET` `PATCH` `DELETE` | `/projects/{id}` | Detail carries everything the back office needs in one call |
| `GET` | `/projects/summary` | Portfolio level rollup, above project scope |
| `GET` | `/projects/{id}/readiness` | The nine booleans and the `missing` array |
| `GET` `PUT` | `/projects/{id}/scope` | Confirmed work streams |
| `GET` `POST` | `/projects/{id}/estimates` | Append only by `as_of_date` |
| `GET` | `/projects/{id}/permits` | Site permit state, with days pending |
| `POST` | `/projects/{id}/sites/{linkId}/permit/request` | Start the clock |
| `PATCH` | `/projects/{id}/sites/{linkId}/permit` | Verify. Refused without a document behind it |
| `GET` | `/projects/{id}/alerts` | Every category with a severity: expiring documents, pending permits, unprocessed tickets |
| `PUT` | `/projects/{id}/share` | Federation visibility |
| `POST` `DELETE` | `/projects/{id}/contractors`, `/contracts`, `/sites`, `/ticket-types`, `/zones`, `/assignments` | Linking |
| `PATCH` | `/projects/{id}/assignments/{id}` | |

<br>

## Tickets

| Method | Path | Notes |
|---|---|---|
| `GET` | `/projects/{id}/tickets` | Search, filter, sort, with window totals |
| `POST` | `/projects/{id}/tickets` | `client_uuid` makes offline replay idempotent |
| `GET` | `/tickets/{id}` | Ticket, overview, type, stages, waypoints, media, transactions, metrics, audit |
| `PATCH` | `/tickets/{id}` | `_reason` is written into the audit artifact |
| `POST` | `/tickets/{id}/stages` | Advance a lifecycle stage. Completes and bills where the schema says so |
| `POST` | `/tickets/{id}/waypoints` | Batched |
| `POST` `PATCH` `DELETE` | `/tickets/{id}/media` | One primary per ticket |
| `POST` | `/tickets/{id}/handoff` | Mint the pending object the driver carries |
| `GET` | `/projects/{id}/scan/{barcode}` | Returns an open handoff, else the truck |
| `POST` | `/tickets/{id}/void` | Reverses existing transactions |
| `PUT` | `/tickets/{id}/share` | Federation visibility |
| `POST` | `/tickets/{id}/process` | Run the rules engine over one ticket |
| `POST` | `/projects/{id}/tickets/process` | Drain the queue. Idempotent |

<br>

## Billing

| Method | Path | Notes |
|---|---|---|
| `GET` `POST` | `/projects/{id}/service-codes` | |
| `POST` | `/projects/{id}/service-codes/from-line-items` | Generate codes from selected contract lines |
| `PATCH` `DELETE` | `/service-codes/{id}` | |
| `POST` | `/service-codes/{id}/rates` | A new rate supersedes without rewriting history |
| `GET` `POST` | `/projects/{id}/rules` | |
| `GET` `PUT` `DELETE` | `/rules/{id}` | |
| `POST` | `/rules/{id}/test` | Dry run. Reports matches and totals, writes nothing |
| `GET` | `/projects/{id}/transactions` | |
| `POST` | `/transactions/{id}/reverse` | Requires a reason |
| `GET` `POST` | `/projects/{id}/invoices` | |
| `GET` `PATCH` | `/invoices/{id}` | |
| `DELETE` | `/invoices/{id}/lines/{lineId}` | |

See [The rules engine](RULES_ENGINE.md).

<br>

## Documents

The registry holds links, not bytes. The file itself stays in Box or SharePoint.

| Method | Path | Notes |
|---|---|---|
| `GET` `PATCH` `DELETE` | `/documents/{id}` | |
| `GET` | `/documents/expiring` | Drives the sweep. Boundary is inclusive |
| `POST` | `/documents/{id}/request` | Starts the clock the alerts feed nags on |
| `POST` | `/documents/{id}/verify` | Records who verified it and when |

A document registers against any entity through `entity_type` plus `entity_id`. A link has to be a link.

<br>

## Reporting

| Method | Path | Notes |
|---|---|---|
| `GET` | `/projects/{id}/dashboard?days=` | Every panel in one call |
| `GET` | `/audit` | The audit trail, filterable |
| `GET` | `/query/sources` | What the query builder may read |
| `POST` | `/query/run` | Column names and operators validated against the live view definition, every value a bound parameter |
| `GET` | `/projects/{id}/export/{dataset}` | Recorded in the audit trail |

<br>

## Closeout

At project completion the client gets a zip: the data exported to spreadsheets under an agreed naming convention, and a manifest accounting for every document the project collected.

| Method | Path | Notes |
|---|---|---|
| `GET` `PUT` | `/projects/{id}/closeout/naming` | The filename template. A template with no tokens is refused |
| `GET` | `/projects/{id}/closeout/manifest` | Accounts for every document, and says plainly what is still unverified |
| `GET` | `/projects/{id}/closeout/package` | The zip. Recorded in the audit trail |

> [!IMPORTANT]
> The manifest reports unverified documents rather than omitting them. `test_the_manifest_says_what_is_unverified_rather_than_hiding_it` exists because a closeout package that looks complete and is not is worse than one that names its own gaps.

<br>

## Instance and peers

| Method | Path | Notes |
|---|---|---|
| `GET` `POST` `PATCH` | `/instance` | This deployment's identity |
| `POST` | `/instance/rotate-keys` | New Ed25519 pair |
| `GET` `POST` | `/peers` | |
| `PATCH` `DELETE` | `/peers/{id}` | |
| `GET` | `/peer/identity` | Unauthenticated discovery |
| `GET` | `/peer/projects/{id}/tickets` | The signed peer read |

### Signing a peer request

```
payload = METHOD + "\n" + path + "\n" + instance_key + "\n"
        + timestamp + "\n" + nonce + "\n" + sha256(body)

X-Instance-Key: <64 hex>
X-Timestamp:    <ISO 8601>
X-Nonce:        <single use>
X-Signature:    base64(ed25519_sign(payload))
```

Full detail, including a working Python signer: [Federation](FEDERATION.md).

<br>

## A worked call sequence

<details>
<summary><b>Running a load ticket end to end with curl</b></summary>
<br>

```bash
API=http://localhost:8080/api/v1

# 1. Sign in
TOKEN=$(curl -s -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"jmiller","password":"openadms"}' | jq -r .access_token)

AUTH="Authorization: Bearer $TOKEN"

# 2. What can this monitor see
PROJECT=$(curl -s $API/auth/me -H "$AUTH" | jq -r '.projects[0].id')

# 3. Open the ticket. client_uuid is minted before the request leaves
curl -s -X POST $API/projects/$PROJECT/tickets -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"client_uuid":"7f1c...","ticket_type_code":"LOAD"}' | jq .

# 4. Save the collection stage
curl -s -X POST $API/tickets/$TICKET/stages -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"stage_code":"collection","data":{ ... }}'

# 5. Hand off on the barcode
curl -s -X POST $API/tickets/$TICKET/handoff -H "$AUTH"

# 6. The disposal monitor scans it
curl -s $API/projects/$PROJECT/scan/GES001BC -H "$AUTH"

# 7. Save the disposal stage. completes_ticket fires the rules engine
curl -s -X POST $API/tickets/$TICKET/stages -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"stage_code":"disposal","data":{"load_call_pct":85, ... }}'

# 8. The locked transaction is on the ticket detail
curl -s $API/tickets/$TICKET -H "$AUTH" | jq '.transactions'
```

`test_the_field_app_can_run_a_load_ticket_end_to_end` is this sequence as a test.

</details>

<br>

<div align="center">
<sub>

**[Docs index](README.md)** · **[Testing](TESTING.md)** · **[Repository](../README.md)**

</sub>
</div>
