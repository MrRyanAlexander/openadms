<div align="center">
<sub>

[Docs index](README.md) · [Architecture](ARCHITECTURE.md) · **Data model** · [ERD](ERD.md) · [Ticket types](TICKET_TYPES.md) · [Rules](RULES_ENGINE.md) · [Access](ACCESS_CONTROL.md) · [Federation](FEDERATION.md) · [API](API.md) · [Deploy](DEPLOYMENT.md) · [Testing](TESTING.md) · [Troubleshooting](TROUBLESHOOTING.md)

</sub>
</div>

# Data model

**50 tables, 13 views, 27 functions, 13 named triggers**, across [18 forward only migrations](../database/migrations). Grouped below by what they are for.

> [!TIP]
> If you want the shape rather than the inventory, read [the ERD](ERD.md) first and come back here for the column level detail.

<br>

## Instance and federation

| Table | Purpose |
|---|---|
| `instance` | This deployment. Exactly one row, enforced by a partial unique index. Holds the `INSTANCE_UNIQUE_KEY` and the Ed25519 key pair |
| `peer_instances` | Other deployments this instance recognises, with their public key and trust state |
| `peer_request_nonces` | Replay protection for signed reads |
| `visibility_flags` | `private`, `restricted`, `public` |

See [Federation](FEDERATION.md) for how these are used.

## Identity

| Table | Purpose |
|---|---|
| `roles` | Monitor 10, Manager 20, Analyst 30, Admin 40. The rank is the inheritance ordinal |
| `permissions` | Each carries `min_rank`. A role holds every permission at or below its rank, so there is no grant table to maintain |
| `users` | `global_role` is the deployment wide floor. A project assignment can raise it |
| `user_sessions` | Refresh tokens stored as sha256 digests, never in the clear |

`role_permission_matrix` is the view the API and the Settings screen read. See [Access control](ACCESS_CONTROL.md).

## Organization

`clients`, `contractors`, `contracts`, `disposal_sites`, `equipment`, `disasters`, `programs`. These live above the project layer: created once for the instance, then linked into any number of projects.

| Detail | Value |
|---|---|
| `disposal_sites.site_kind` | `DMS` (debris management site), `FDS` (final disposal site), `TDSRS` (legacy alias for DMS), `TRANSFER`, `RECYCLING` |
| `equipment.capacity_cy` | The certified capacity that load call percentage is applied against |
| `contacts` | Keyed on `entity_type` + `entity_id`, so one table serves clients, contractors and site operators |

<details>
<summary><b>The entity_type + entity_id pattern</b></summary>
<br>

`audit_events`, `documents` and `contacts` all key on `entity_type` plus `entity_id` rather than carrying a foreign key per parent kind. This is the house pattern: any child record that attaches to more than one kind of parent inherits this shape rather than adding a table.

The tradeoff is a loss of referential integrity at the database level for those three tables specifically, taken deliberately. The alternative was a `client_contacts`, `contractor_contacts` and `site_contacts` triple that drifts apart the first time someone adds a column to one of them.

</details>

## Projects

| Table | Purpose |
|---|---|
| `projects` | The organizing unit. Carries the ticket prefix, the timezone, and the federation visibility flag |
| `project_contractors` | Rules and service codes may only reference contractors linked here |
| `project_contracts` | A rule cannot be saved unless its contract appears here |
| `project_sites` | Disposal sites available to the field, each with its permit state |
| `project_zones` | Optional subdivision. Gives the rule builder a `zone in [...]` operand |
| `project_ticket_types` | Which ticket types the field may create. A trigger refuses system types |
| `project_assignments` | The active project context, and the gate on ticket creation |
| `project_scopes` | Confirmed work streams. A stream appears here because someone confirmed it, and the ticket types offered on the project follow from it |
| `project_estimates` | Append only by `as_of_date`. The current estimate is the newest row for a stream, and the original client number stays readable underneath it |

> [!IMPORTANT]
> `project_readiness` computes nine booleans. `project_readiness_summary` adds `ready_for_field`, `ready_for_billing` and a `missing` array. The ticket creation trigger reads that view, so the setup order is **enforced rather than documented**.

<details>
<summary><b>Why estimates are a number and never a range</b></summary>
<br>

A bucket of 100 to 500 cannot answer "are we at 60 percent of the hanger estimate", which is the question asked by week three. Where a number is not known, the row is simply absent. A null estimate is honest, a bucket is fake precision.

Revisions are append only, so the original client number stays readable next to the current one. `project_estimate_current` is the view that resolves the newest row per stream.

</details>

## The ticket catalog

| Table | Purpose |
|---|---|
| `ticket_types` | Code, kind, flags, and the two JSON documents that make the system extendable: `stage_schema` and `field_schema` |
| `debris_types` | Classification with FEMA category and default density |
| `unit_types` | Units a rate can be denominated in. `quantity_source` names a column on `ticket_metrics` |
| `incident_categories` | Self referencing category and sub category tree |
| `ticket_statuses` | Lookup with colour and terminal / billable flags |

Shipped types: `LOAD`, `HAULOUT`, `UNIT`, `INCIDENT`, plus `ROE`, `TM` and `SURVEY` as worked examples, plus the two hidden system types `PENDING_COLLECTION` and `PENDING_DISPOSAL`. Full reference: [Ticket types](TICKET_TYPES.md).

## Tickets

| Table | Purpose |
|---|---|
| `tickets` | Common columns are first class, so they index and query fast. Anything a type invents lands in `data` JSONB, GIN indexed. Carries the void and replacement workflow, the processing state, and the federation columns |
| `ticket_stages` | One row per lifecycle stage instance: monitor, site, GPS, debris, load call, scale, time |
| `ticket_waypoints` | The GPS trail, used to derive haul distance |
| `ticket_media` | Photos, scans, signatures and documents, with one primary per ticket. `slot` names which of the photographs the ticket type asked for this one is |
| `pending_handoffs` | The two hidden ticket types, modelled as short lived rows keyed by the barcode the driver carries |

`tickets.client_uuid` is minted by the field app before the ticket reaches the server, which is what makes the offline queue idempotent.

## Billing

| Table | Purpose |
|---|---|
| `service_codes` | Project scoped, tied to one contractor on that project |
| `rates` | Amount plus unit type plus effective dates, with optional min and max quantity |
| `rule_operands` | What the left side of a statement may reference, and which project scoped option list the value picker should call |
| `rule_operators` | `=`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `not in`, `between`, `contains`, `starts with`, `is empty`, `is not empty` |
| `rules` | Name, ticket type, service code, contract, match mode, priority, effective dates |
| `rule_statements` | The line items, each storing a `value_label` captured at save time so an audit reader sees "Gateway Environmental Services" and not a bare uuid |

Full reference: [The rules engine](RULES_ENGINE.md).

## Money

| Table | Purpose |
|---|---|
| `transactions` | Append only. Carries the ticket snapshot and the rule snapshot it was computed from, plus the `quantity_source` that produced the number |
| `invoices` | Draft, submitted, approved, paid. Totals maintained by trigger |
| `invoice_lines` | Join to transactions, so a transaction is never mutated by being invoiced |

## Documents and contract intake

| Table | Purpose |
|---|---|
| `document_kinds` | Contracts, rate sheets, certificates, permits, insurance |
| `documents` | The registry. Holds the link, who verified it, when it expires, and who it was asked for. The file itself stays in Box or SharePoint |
| `contract_line_items` | The priced lines a contract actually contains, which service codes are generated from |
| `contract_ingestions` | Staging for contract intake, plus the accept and reject history that makes ranking possible later |

> [!NOTE]
> The registry holds **links, not bytes**. That is the same promise the rest of the system makes: your documents stay where your organization already keeps them, and Open ADMS records what it knows about them.

## Audit

`audit_events` carries entity, action, actor, before, after, a computed `changed` diff, reason and request id. It is append only, enforced by trigger. `audit_trail` is the reader facing view with actor and project resolved.

<br>

## Views

| View | Purpose |
|---|---|
| `ticket_metrics` | Every derived quantity a rate can be denominated in |
| `ticket_evaluation` | The flat row a rule statement is evaluated against |
| `ticket_overview` | The back office ticket list and detail header |
| `project_dashboard` | Per project rollups |
| `project_readiness` / `project_readiness_summary` | The setup gate |
| `project_estimate_current` | Newest estimate per work stream |
| `project_permit_watch` | Sites with a pending or expiring permit, and how long it has been pending |
| `document_watch` | The expiring sweep the alerts feed reads |
| `contract_line_item_review` | The intake review queue |
| `review_subjects` | Every reviewable record flattened to one shape. The seam a new record kind is added at |
| `review_queue` | What needs review, why, how long it has waited, and whether it is decided or escalated |
| `review_issue_patterns` | A run of the same issue from the same monitor or contractor, counted over rolling windows |
| `ticket_review_queue` / `monitor_accuracy` | The ticket queue and the monitor scoreboard, over the generic spine |
| `ticket_evidence` / `certification_evidence` / `review_evidence` | Required photographs against collected ones |
| `certification_measurement_detail` | A worksheet with its sections, dimensions, formulas and totals |
| `project_equipment_current` | The live certification for every truck on every project, with expiry |
| `transaction_ledger` | Transactions joined to ticket, rule, code, contract, invoice |
| `audit_trail` | Audit events with actor and project resolved |
| `role_permission_matrix` | Effective permissions per role |

<br>

## Functions

| Function | Purpose |
|---|---|
| `adms_shape_volume(shape, dims)` | Cubic inches for one measured shape. The single source of the arithmetic, shared by the field app, the back office and the tests |
| `adms_certification_volume(measurement)` | Recomputes a worksheet from its sections and writes the derived capacity onto the draft certification |
| `adms_round_capacity(cy, rule)` | How the exact volume becomes the certified capacity |
| `adms_certification_in_force(project, equipment, on)` | Which approved measurement governs work done on a date |
| `adms_flag_ticket(ticket)` / `adms_flag_certification(cert)` | Run every detector over one record. Idempotent, and clears a flag that has stopped being true |
| `adms_review_item(kind, subject, project, ...)` | The review row for a record, opened on first use |
| `adms_review_escalation_candidates(project)` | Items meeting this project's escalation thresholds, with the reason spelled out |
| `adms_process_ticket(ticket, actor)` | Evaluate every active rule for the type on the project, write one locked transaction per match. Idempotent |
| `adms_rule_matches(ticket, rule)` | Whole rule evaluation honouring `match_mode` |
| `adms_eval_statement(row, operand, operator, value, negate)` | One statement line, typed by the operand's `data_type` |
| `adms_quantity_for(ticket, unit_type)` | Pull the billable quantity. Defaults to 1 |
| `adms_rate_for(service_code, on_date)` | The effective rate on a date |
| `adms_reverse_transaction(txn, reason, actor)` | Write the negating row. The original is untouched |
| `adms_distance_miles(lat1, lon1, lat2, lon2)` | Great circle miles, so distance rules behave identically without PostGIS |
| `adms_tickets_near(lat, lon, radius)` | Proximity search, PostGIS accelerated where available |
| `adms_next_number(scope, prefix)` | Human readable sequential document numbers, scoped per project |
| `adms_jsonb_diff(before, after)` | The `changed` column on every audit event |
| `adms_role_has_permission(role, permission)` | Rank comparison, used by the API and the matrix view |
| `adms_attach_audit(table)` / `adms_attach_touch(table)` | Attach the standard triggers without repeating boilerplate |

<details>
<summary><b>The full trigger list</b></summary>
<br>

| Trigger | Table | Refuses |
|---|---|---|
| `trg_transactions_immutable` | `transactions` | Any `UPDATE` or `DELETE` |
| `trg_audit_events_immutable` | `audit_events` | Any `UPDATE` or `DELETE` |
| `trg_project_estimates_append_only` | `project_estimates` | Any `UPDATE` or `DELETE` |
| `trg_tickets_before_insert` | `tickets` | A ticket on an unready project, or from an unassigned creator |
| `trg_tickets_before_update` | `tickets` | Stage and state transitions that are not legal |
| `trg_rules_scope` | `rules` | A rule whose service code or contract is not on the project |
| `trg_service_codes_contract_scope` | `service_codes` | A code whose contract is not on the project |
| `trg_service_codes_contractor_scope` | `service_codes` | A code whose contractor is not on the project |
| `trg_project_ticket_types_block_system` | `project_ticket_types` | Adding `PENDING_COLLECTION` or `PENDING_DISPOSAL` |
| `trg_project_contractors_parent_scope` | `project_contractors` | A subcontractor whose prime is not on the project |
| `trg_project_sites_permit_document` | `project_sites` | Verifying a permit with no document behind it |
| `trg_invoice_lines_totals` | `invoice_lines` | Nothing. It recalculates invoice totals |
| `trg_contacts_sync_client` | `contacts` | Nothing. It keeps `clients.primary_contact` in step |

Plus the audit and touch triggers attached dynamically to 24 tables by `adms_attach_audit` and `adms_attach_touch`.

</details>

<br>

<div align="center">
<sub>

**[Docs index](README.md)** · **[Entity relationships](ERD.md)** · **[Repository](../README.md)**

</sub>
</div>
