# Entity relationships

The spine, minus the lookup tables.

```mermaid
erDiagram
    CLIENTS ||--o{ CONTRACTS : "party to"
    CONTRACTORS ||--o{ CONTRACTS : "party to"
    CONTRACTORS ||--o{ EQUIPMENT : owns
    CLIENTS ||--o{ PROJECTS : "applicant on"
    DISASTERS ||--o{ PROJECTS : "declared for"

    PROJECTS ||--o{ PROJECT_CONTRACTORS : links
    PROJECTS ||--o{ PROJECT_CONTRACTS : links
    PROJECTS ||--o{ PROJECT_SITES : links
    PROJECTS ||--o{ PROJECT_ZONES : defines
    PROJECTS ||--o{ PROJECT_TICKET_TYPES : enables
    PROJECTS ||--o{ PROJECT_ASSIGNMENTS : staffs

    CONTRACTS ||--o{ PROJECT_CONTRACTS : "linked by"
    CONTRACTORS ||--o{ PROJECT_CONTRACTORS : "linked by"
    DISPOSAL_SITES ||--o{ PROJECT_SITES : "linked by"
    USERS ||--o{ PROJECT_ASSIGNMENTS : "assigned by"
    TICKET_TYPES ||--o{ PROJECT_TICKET_TYPES : "enabled by"

    PROJECTS ||--o{ TICKETS : contains
    TICKET_TYPES ||--o{ TICKETS : shapes
    EQUIPMENT ||--o{ TICKETS : hauls
    DISPOSAL_SITES ||--o{ TICKETS : receives
    TICKETS ||--o{ TICKET_STAGES : "advances through"
    TICKETS ||--o{ TICKET_WAYPOINTS : traces
    TICKETS ||--o{ TICKET_MEDIA : documents
    TICKETS ||--o{ PENDING_HANDOFFS : "hands off via"

    PROJECTS ||--o{ SERVICE_CODES : prices
    CONTRACTORS ||--o{ SERVICE_CODES : performs
    SERVICE_CODES ||--o{ RATES : "priced by"

    PROJECTS ||--o{ RULES : governs
    TICKET_TYPES ||--o{ RULES : "applies to"
    SERVICE_CODES ||--o{ RULES : "billed as"
    CONTRACTS ||--o{ RULES : "billed under"
    RULES ||--o{ RULE_STATEMENTS : "composed of"

    TICKETS ||--o{ TRANSACTIONS : produces
    RULES ||--o{ TRANSACTIONS : "matched by"
    RATES ||--o{ TRANSACTIONS : "priced by"
    TRANSACTIONS ||--o| INVOICE_LINES : "billed on"
    INVOICES ||--o{ INVOICE_LINES : contains

    INSTANCE ||--o{ PEER_INSTANCES : trusts
```

## The evaluation path

```mermaid
flowchart TD
    A[Ticket reaches status completed] --> B{Void?}
    B -- yes --> Z[processing_state = excluded]
    B -- no --> C[Read ticket_evaluation:<br/>flat row of columns + derived metrics]
    C --> D[For each active rule on this project<br/>for this ticket type, by priority]
    D --> E{adms_rule_matches?}
    E -- no --> D
    E -- yes --> F[adms_rate_for service code, service date]
    F -- none effective --> G[Record why in processing_error]
    F -- found --> H[adms_quantity_for ticket, rate unit type<br/>reads ticket_metrics; defaults to 1]
    H --> I[amount = quantity x rate]
    I --> J[(INSERT transaction<br/>locked, with ticket + rule snapshot)]
    J --> K{stop_on_match?}
    K -- no --> D
    K -- yes --> L[Done]
    D --> M[processing_state = processed or no_match]
```

## Quantity sources

| Unit type | Reads | Derived from |
|---|---|---|
| `per_cubic_yard` | `billable_cubic_yards` | certified capacity × load call % |
| `per_ton` | `net_tons` | net weight, else gross − tare, ÷ 2000 |
| `per_mile` | `haul_miles` | odometer, else waypoint path, else straight line |
| `per_labor_hour` | `labor_hours` | recorded on the ticket |
| `per_equip_hour` | `equipment_hours` | recorded on the ticket |
| `per_unit` | `unit_count` | `tickets.quantity`, else 1 |
| `per_each` / `flat_fee` | `each` / `flat` | always 1 |
| `per_diameter_in` | `stump_diameter_inches` | `tickets.data` |
| `per_linear_foot` | `linear_feet` | `tickets.data` |
