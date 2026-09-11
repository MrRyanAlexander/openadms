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
