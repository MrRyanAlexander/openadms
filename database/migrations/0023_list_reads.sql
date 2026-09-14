-- ===========================================================================
-- 0023  What the lists need to read
--
-- C15: "This list appears to reuse the same headers as the tickets list mostly.
-- Incident are meant to capture something that went wrong or otherwise needed
-- special notation. The list should have a severity column and a description so
-- we have a clear heads up about things from the list."
--
-- The incident screen was showing cubic yards and a load call, which an incident
-- does not have, and hiding severity and the note, which is the whole point of
-- filing one. Those columns were simply not on the view the list reads.
-- ===========================================================================

CREATE OR REPLACE VIEW ticket_overview AS
SELECT
    t.id, t.ticket_number, t.project_id, p.name AS project_name,
    p.project_code, t.status, t.is_void, t.processing_state,
    tt.code AS ticket_type_code, tt.label AS ticket_type_label, tt.kind,
    c.name AS contractor_name, e.unit_number AS truck_number,
    t.driver_name, t.debris_type, dtp.label AS debris_label,
    t.load_call_pct, t.certified_capacity_cy,
    m.billable_cubic_yards, m.net_tons, m.haul_miles,
    t.origin_address, t.origin_latitude, t.origin_longitude, t.origin_at,
    ds.name AS destination_site_name, t.destination_at,
    t.scale_ticket_number, t.rules_matched,
    u.full_name AS created_by_name, t.created_at, t.completed_at,
    t.visibility_flag,
    COALESCE(x.txn_count, 0)  AS transaction_count,
    COALESCE(x.txn_total, 0)  AS transaction_total,
    COALESCE(md.media_count, 0) AS media_count,
    -- An incident is judged on how bad it is and what happened, neither of
    -- which the load ticket columns carry.
    t.severity,
    ic.label                  AS incident_category,
    t.is_ongoing,
    t.notes,
    t.needs_reprocess,
    t.reprocess_reason
FROM tickets t
JOIN projects p            ON p.id = t.project_id
JOIN ticket_types tt       ON tt.id = t.ticket_type_id
JOIN ticket_metrics m      ON m.ticket_id = t.id
LEFT JOIN contractors c    ON c.id = t.contractor_id
LEFT JOIN equipment e      ON e.id = t.equipment_id
LEFT JOIN debris_types dtp ON dtp.code = t.debris_type
LEFT JOIN disposal_sites ds ON ds.id = t.destination_site_id
LEFT JOIN users u          ON u.id = t.created_by
LEFT JOIN LATERAL (
    -- txn_count is what the ticket bills now. txn_total sums the whole ledger
    -- on purpose: an original and its reversal are superseded together and
    -- still net to zero, so the figure survives a correction untouched.
    SELECT count(*) FILTER (
               WHERE NOT tx.is_reversal AND tx.superseded_at IS NULL)
               AS txn_count,
           count(*) FILTER (WHERE tx.superseded_at IS NOT NULL)
               AS superseded_txn_count,
           SUM(tx.amount) AS txn_total
      FROM transactions tx WHERE tx.ticket_id = t.id
) x ON true
LEFT JOIN LATERAL (
    SELECT count(*) AS media_count FROM ticket_media tm
     WHERE tm.ticket_id = t.id AND tm.deleted_at IS NULL
) md ON true
LEFT JOIN incident_categories ic ON ic.id = t.incident_category_id
WHERE t.deleted_at IS NULL;

COMMENT ON VIEW ticket_overview IS
    'Every live ticket, flattened for a list. Carries the load columns and the '
    'incident columns, because one screen renders both and an incident judged '
    'on cubic yards tells a reviewer nothing.';


-- ===========================================================================
-- The rule map
--
-- A rule is only half a thought on its own. What a person checking a project
-- wants is the chain: which rule, on which ticket type, billing which service
-- code, at which rate, under which contract, for which contractor, and what it
-- has actually produced. Opening rules one at a time to assemble that in your
-- head is how a wrong service code survives a whole event.
--
-- This is a different presentation of data that already exists, not a new
-- resource. Nothing here is stored twice.
-- ===========================================================================
CREATE OR REPLACE VIEW rule_map AS
SELECT
    r.id                    AS rule_id,
    r.project_id,
    r.name                  AS rule_name,
    r.description           AS rule_description,
    r.priority,
    r.match_mode,
    r.stop_on_match,
    r.is_active,
    r.effective_from,
    r.effective_to,

    tt.id                   AS ticket_type_id,
    tt.code                 AS ticket_type_code,
    tt.label                AS ticket_type_label,
    tt.kind                 AS ticket_type_kind,

    sc.id                   AS service_code_id,
    sc.code                 AS service_code,
    sc.name                 AS service_code_name,
    sc.quantity_mode,
    sc.contract_line_item_id,
    li.line_number,
    li.item_code,

    rt.id                   AS rate_id,
    rt.amount               AS rate_amount,
    rt.unit_type,
    ut.abbreviation         AS unit_abbrev,
    rt.tier_source,
    (SELECT count(*) FROM rate_tiers t WHERE t.rate_id = rt.id) AS tier_count,

    k.id                    AS contract_id,
    k.contract_number,
    k.title                 AS contract_title,

    ct.id                   AS contractor_id,
    ct.name                 AS contractor_name,

    COALESCE(x.txn_count, 0)  AS transaction_count,
    COALESCE(x.txn_total, 0)  AS billed_total,
    x.last_billed_at,

    -- What is wrong with this link in the chain, said plainly, so the map can
    -- lead with the rows that cannot bill rather than the rows that can.
    ARRAY_REMOVE(ARRAY[
        CASE WHEN NOT r.is_active                THEN 'rule_inactive'  END,
        CASE WHEN rt.id IS NULL                  THEN 'no_rate'        END,
        CASE WHEN NOT sc.is_active               THEN 'code_inactive'  END,
        CASE WHEN sc.quantity_mode = 'tiered'
              AND (rt.tier_source IS NULL
                   OR NOT EXISTS (SELECT 1 FROM rate_tiers t
                                   WHERE t.rate_id = rt.id))
                                                 THEN 'tiered_without_bands' END,
        CASE WHEN r.effective_to IS NOT NULL
              AND r.effective_to < current_date  THEN 'expired'        END
    ], NULL)                AS problems
FROM rules r
JOIN ticket_types tt   ON tt.id = r.ticket_type_id
JOIN service_codes sc  ON sc.id = r.service_code_id
JOIN contractors ct    ON ct.id = sc.contractor_id
JOIN contracts k       ON k.id = r.contract_id
LEFT JOIN contract_line_items li ON li.id = sc.contract_line_item_id
LEFT JOIN LATERAL adms_rate_for(sc.id, current_date) rt ON true
LEFT JOIN unit_types ut ON ut.code = rt.unit_type
LEFT JOIN LATERAL (
    SELECT count(*) AS txn_count,
           COALESCE(sum(tx.amount), 0) AS txn_total,
           max(tx.computed_at) AS last_billed_at
      FROM transactions tx
     WHERE tx.rule_id = r.id AND NOT tx.is_reversal AND tx.superseded_at IS NULL
) x ON true
WHERE r.deleted_at IS NULL;

COMMENT ON VIEW rule_map IS
    'One row per rule carrying the whole chain: ticket type, service code, the '
    'contract line it came from, the rate and its bands, the contract and the '
    'contractor, and what the rule has produced. problems names the links that '
    'cannot bill, so the map leads with those.';
