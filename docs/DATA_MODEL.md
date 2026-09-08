# Data model

44 tables, 11 views. Grouped by what they are for.

## Instance and federation

| Table | Purpose |
|---|---|
| `instance` | This deployment. Exactly one row, enforced by a partial unique index. Holds the `INSTANCE_UNIQUE_KEY` and the Ed25519 key pair. |
| `peer_instances` | Other deployments this instance recognises, with their public key and trust state. |
| `peer_request_nonces` | Replay protection for signed reads. |
| `visibility_flags` | `private`, `restricted`, `public`. |

## Identity

| Table | Purpose |
|---|---|
| `roles` | Monitor 10, Manager 20, Analyst 30, Admin 40. The rank is the inheritance ordinal. |
| `permissions` | Each carries `min_rank`; a role holds every permission at or below its rank. No grant table to maintain. |
| `users` | `global_role` is the deployment-wide floor; a project assignment can raise it. |
| `user_sessions` | Refresh tokens stored as sha256 digests. |

`role_permission_matrix` is the view the API and the Settings screen read.

## Organization

`clients`, `contractors`, `contracts`, `disposal_sites`, `equipment`,
`disasters`. These live above the project layer: created once for the instance,
then linked into any number of projects.

`disposal_sites.site_kind` distinguishes DMS (debris management site), FDS
(final disposal site), TDSRS (retained as a legacy alias for DMS), TRANSFER and
RECYCLING. `equipment.capacity_cy` is the certified capacity load-call
percentage is applied against.

## Projects

| Table | Purpose |
|---|---|
| `projects` | The organizing unit. Carries the ticket prefix, the timezone, and the federation visibility flag. |
| `project_contractors` | Rules and service codes may only reference contractors linked here. |
| `project_contracts` | A rule cannot be saved unless its contract appears here. |
| `project_sites` | Disposal sites available to the field. |
| `project_zones` | Optional subdivision; gives the rule builder a `zone in [...]` operand. |
| `project_ticket_types` | Which ticket types the field may create. A trigger refuses system types. |
| `project_assignments` | The active project context, and the gate on ticket creation. |

`project_readiness` computes nine booleans; `project_readiness_summary` adds
`ready_for_field`, `ready_for_billing` and a `missing` array. The ticket
creation trigger reads that view, so the setup order described in the ADMS
document is enforced rather than documented.

## The ticket catalog

| Table | Purpose |
|---|---|
| `ticket_types` | Code, kind, flags, and the two JSON documents that make the system extendable: `stage_schema` and `field_schema`. |
| `debris_types` | Classification with FEMA category and default density. |
| `unit_types` | Units a rate can be denominated in. `quantity_source` names a column on `ticket_metrics`. |
| `incident_categories` | Self-referencing category / sub-category tree. |
| `ticket_statuses` | Lookup with colour and terminal/billable flags. |

Shipped types: `LOAD`, `HAULOUT`, `UNIT`, `INCIDENT`, plus `ROE`, `TM` and
`SURVEY` as worked examples, plus the two hidden system types
`PENDING_COLLECTION` and `PENDING_DISPOSAL`.

## Tickets

| Table | Purpose |
|---|---|
| `tickets` | Common columns first-class (so they index and query fast); anything a type invents lands in `data` JSONB. Carries the void/replacement workflow, the processing state, and the federation columns. |
| `ticket_stages` | One row per lifecycle stage instance: monitor, site, GPS, debris, load call, scale, time. |
| `ticket_waypoints` | The GPS trail, used to derive haul distance. |
| `ticket_media` | Photos, scans, signatures and documents, with one primary per ticket. |
| `pending_handoffs` | The two hidden ticket types, modelled as short-lived rows keyed by the barcode the driver carries. |

`tickets.client_uuid` is minted by the field app before the ticket reaches the
server, which is what makes the offline queue idempotent.

## Billing

| Table | Purpose |
|---|---|
| `service_codes` | Project scoped, tied to one contractor on that project. |
| `rates` | Amount + unit type + effective dates, with optional min/max quantity. |
| `rule_operands` | What the left side of a statement may reference, and which project-scoped option list the value picker should call. |
| `rule_operators` | `=`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `not in`, `between`, `contains`, `starts with`, `is empty`, `is not empty`. |
| `rules` | Name, ticket type, service code, contract, match mode, priority, effective dates. |
| `rule_statements` | The line items, each storing a `value_label` captured at save time so an audit reader sees "Ceres Environmental" and not a bare uuid. |

## Money

| Table | Purpose |
|---|---|
| `transactions` | Append-only. Carries the ticket snapshot and the rule snapshot it was computed from, plus the `quantity_source` that produced the number. |
| `invoices` | Draft → submitted → approved → paid, with totals maintained by trigger. |
| `invoice_lines` | Join to transactions, so a transaction is never mutated by being invoiced. |

## Audit

`audit_events` — entity, action, actor, before, after, a computed `changed`
diff, reason, request id. Append-only. `audit_trail` is the reader-facing view.

## Views

| View | Purpose |
|---|---|
| `ticket_metrics` | Every derived quantity a rate can be denominated in. |
| `ticket_evaluation` | The flat row a rule statement is evaluated against. |
| `ticket_overview` | The back office ticket list and detail header. |
| `project_dashboard` | Per-project rollups. |
| `project_readiness` / `project_readiness_summary` | The setup gate. |
| `transaction_ledger` | Transactions joined to ticket, rule, code, contract, invoice. |
| `audit_trail` | Audit events with actor and project resolved. |
| `role_permission_matrix` | Effective permissions per role. |

## Functions

| Function | Purpose |
|---|---|
| `adms_process_ticket(ticket, actor)` | Evaluate every active rule for the type on the project; write one locked transaction per match. Idempotent. |
| `adms_rule_matches(ticket, rule)` | Whole-rule evaluation honouring `match_mode`. |
| `adms_eval_statement(row, operand, operator, value, negate)` | One statement line, typed by the operand's `data_type`. |
| `adms_quantity_for(ticket, unit_type)` | Pull the billable quantity; defaults to 1. |
| `adms_rate_for(service_code, on_date)` | The effective rate on a date. |
| `adms_reverse_transaction(txn, reason, actor)` | Write the negating row; the original is untouched. |
| `adms_distance_miles(lat1, lon1, lat2, lon2)` | Great-circle miles, so distance rules behave identically without PostGIS. |
| `adms_next_number(scope, prefix)` | Human-readable sequential document numbers, scoped per project. |
| `adms_attach_audit(table)` / `adms_attach_touch(table)` | Attach the standard triggers without repeating boilerplate. |
