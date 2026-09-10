<div align="center">
<sub>

[Docs index](README.md) · [Architecture](ARCHITECTURE.md) · [Data model](DATA_MODEL.md) · **ERD** · [Ticket types](TICKET_TYPES.md) · [Rules](RULES_ENGINE.md) · [Access](ACCESS_CONTROL.md) · [Federation](FEDERATION.md) · [API](API.md) · [Deploy](DEPLOYMENT.md) · [Testing](TESTING.md) · [Troubleshooting](TROUBLESHOOTING.md)

</sub>
</div>

# Entity relationships

The spine, minus the lookup tables. Column level detail lives in [the data model](DATA_MODEL.md).

```mermaid
erDiagram
    CLIENTS ||--o{ CONTRACTS : "party to"
    CONTRACTORS ||--o{ CONTRACTS : "party to"
    CONTRACTORS ||--o{ EQUIPMENT : owns
    CLIENTS ||--o{ PROJECTS : "applicant on"
    DISASTERS ||--o{ PROJECTS : "declared for"
    CONTRACTS ||--o{ CONTRACT_LINE_ITEMS : prices

    PROJECTS ||--o{ PROJECT_CONTRACTORS : links
    PROJECTS ||--o{ PROJECT_CONTRACTS : links
    PROJECTS ||--o{ PROJECT_SITES : links
    PROJECTS ||--o{ PROJECT_ZONES : defines
    PROJECTS ||--o{ PROJECT_TICKET_TYPES : enables
    PROJECTS ||--o{ PROJECT_ASSIGNMENTS : staffs
    PROJECTS ||--o{ PROJECT_SCOPES : confirms
    PROJECT_SCOPES ||--o{ PROJECT_ESTIMATES : "measured by"

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
    CONTRACT_LINE_ITEMS ||--o{ SERVICE_CODES : "generates"

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

    DOCUMENTS }o--|| DOCUMENT_KINDS : "classified as"
    INSTANCE ||--o{ PEER_INSTANCES : trusts
```

> [!NOTE]
> `DOCUMENTS`, `CONTACTS` and `AUDIT_EVENTS` attach to any parent through `entity_type` plus `entity_id` rather than a foreign key per parent kind, so they do not appear as edges above. They hang off nearly everything.

<br>

## The evaluation path

What happens the moment a ticket reaches `completed`.

```mermaid
flowchart TD
    A["Ticket reaches status completed"] --> B{"Void?"}
    B -- yes --> Z["processing_state = excluded"]
    B -- no --> C["Read ticket_evaluation:<br/>flat row of columns + derived metrics"]
    C --> D["For each active rule on this project<br/>for this ticket type, by priority"]
    D --> E{"adms_rule_matches?"}
    E -- no --> D
    E -- yes --> F["adms_rate_for<br/>service code, service date"]
    F -- "none effective" --> G["Record why in processing_error"]
    F -- found --> H["adms_quantity_for<br/>reads ticket_metrics, defaults to 1"]
    H --> I["amount = quantity × rate"]
    I --> J[("INSERT transaction<br/>locked, with ticket + rule snapshot")]
    J --> K{"stop_on_match?"}
    K -- no --> D
    K -- yes --> L["Done"]
    D --> M["processing_state =<br/>processed or no_match"]

    classDef paper fill:#F3EDE1,stroke:#CFC6B5,color:#0A0C10
    classDef yellow fill:#F5C93F,stroke:#D9A517,color:#07090C
    classDef blue fill:#4E9BEE,stroke:#2C6FBF,color:#07090C
    classDef mute fill:#B9B2A4,stroke:#8C8473,color:#0A0C10
    class A,C,D,H,I paper
    class E,F,K,B yellow
    class J blue
    class G,M,L,Z mute
```

Re-running this over an already processed ticket is safe. A partial unique index on ticket plus rule means the second pass writes nothing.

<br>

## Quantity sources

The unit type on the rate names the column on `ticket_metrics` that the engine reads. Nothing here is typed by a human.

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

Adding a tenth unit type is a row in `unit_types` plus a column on `ticket_metrics`. See [The rules engine](RULES_ENGINE.md).

<br>

## Ticket lifecycle states

```mermaid
stateDiagram-v2
    [*] --> open: created on a ready project<br/>by an assigned worker
    open --> in_progress: first stage saved
    in_progress --> in_progress: stage advanced
    in_progress --> completed: stage with completes_ticket
    open --> voided: voided with a reason
    in_progress --> voided: voided with a reason
    completed --> voided: voided, existing transactions reversed
    completed --> [*]
    voided --> [*]

    note right of completed
        adms_process_ticket runs here.
        processing_state becomes
        processed, no_match or error.
    end note
```

<br>

<div align="center">
<sub>

**[Docs index](README.md)** · **[Data model](DATA_MODEL.md)** · **[Repository](../README.md)**

</sub>
</div>
