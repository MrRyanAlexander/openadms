-- =============================================================================
-- Open ADMS :: 0012 :: Ticket lifecycle guards, readiness, reporting views
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Project readiness. The field is blocked until every one of these is true.
--
-- Rule coverage is part of the field gate, not an afterthought on the billing
-- side. A project with no rule covering an enabled ticket type cannot produce a
-- transaction on any ticket of that type, so calling it "ready for field work"
-- was the system saying something that was not true. has_rule only ever asked
-- whether one rule existed anywhere on the project, which a project with a
-- single load rule and three other enabled types passed.
--
-- Two directions of coverage, deliberately weighted differently:
--
--   unruled_ticket_types  an enabled, billable type with no rule. Blocks the
--                         field, because a ticket of that type can never bill.
--   unruled_service_codes an active code no rule references. Blocks billing
--                         readiness and is named in the wizard, because it is a
--                         configuration gap rather than a reason to stop work.
--
-- System types and non-billable types are excluded from both. An incident
-- carries no transaction by design and must never be asked for a rule.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW project_readiness AS
SELECT
    p.id AS project_id,
    p.name,
    p.project_code,
    p.status,
    (p.client_id IS NOT NULL)                                AS has_client,
    EXISTS (SELECT 1 FROM project_contracts pc
             WHERE pc.project_id = p.id)                     AS has_contract,
    EXISTS (SELECT 1 FROM project_contractors pc
             WHERE pc.project_id = p.id AND pc.is_active)    AS has_contractor,
    EXISTS (SELECT 1 FROM project_sites ps
             WHERE ps.project_id = p.id AND ps.is_active)    AS has_site,
    EXISTS (SELECT 1 FROM project_ticket_types ptt
             WHERE ptt.project_id = p.id AND ptt.is_active)  AS has_ticket_type,
    EXISTS (SELECT 1 FROM service_codes sc
             WHERE sc.project_id = p.id AND sc.is_active
               AND sc.deleted_at IS NULL)                    AS has_service_code,
    EXISTS (SELECT 1 FROM service_codes sc
              JOIN rates r ON r.service_code_id = sc.id
             WHERE sc.project_id = p.id
               AND sc.deleted_at IS NULL)                    AS has_rate,
    EXISTS (SELECT 1 FROM rules r
             WHERE r.project_id = p.id AND r.is_active
               AND r.deleted_at IS NULL)                     AS has_rule,
    EXISTS (SELECT 1 FROM project_assignments pa
             WHERE pa.project_id = p.id AND pa.is_active
               AND pa.can_create_tickets)                    AS has_field_worker,

    -- Enabled, billable ticket types with nothing that can price them.
    COALESCE((
        SELECT array_agg(DISTINCT tt.label ORDER BY tt.label)
          FROM project_ticket_types ptt
          JOIN ticket_types tt ON tt.id = ptt.ticket_type_id
         WHERE ptt.project_id = p.id
           AND ptt.is_active
           AND tt.is_active
           AND tt.billable
           AND NOT tt.is_system
           AND NOT EXISTS (
                SELECT 1 FROM rules r
                 WHERE r.project_id = p.id
                   AND r.ticket_type_id = tt.id
                   AND r.is_active
                   AND r.deleted_at IS NULL)
    ), '{}'::text[])                                         AS unruled_ticket_types,

    -- Active codes no rule references. These can never reach an invoice.
    COALESCE((
        SELECT array_agg(DISTINCT sc.code ORDER BY sc.code)
          FROM service_codes sc
         WHERE sc.project_id = p.id
           AND sc.is_active
           AND sc.deleted_at IS NULL
           AND NOT EXISTS (
                SELECT 1 FROM rules r
                 WHERE r.service_code_id = sc.id
                   AND r.is_active
                   AND r.deleted_at IS NULL)
    ), '{}'::text[])                                         AS unruled_service_codes
FROM projects p
WHERE p.deleted_at IS NULL;

COMMENT ON VIEW project_readiness IS
    'One row per project saying what is configured and what is not. Rule '
    'coverage is computed per enabled ticket type rather than as a single '
    'does-any-rule-exist flag, because the latter let a project with one load '
    'rule and three other enabled types call itself ready.';

CREATE OR REPLACE VIEW project_readiness_summary AS
SELECT r.*,
       (cardinality(r.unruled_ticket_types) = 0 AND r.has_rule)
                                                      AS has_rule_coverage,
       (cardinality(r.unruled_service_codes) = 0)     AS has_code_coverage,
       (r.has_client AND r.has_contract AND r.has_contractor AND r.has_site
        AND r.has_ticket_type AND r.has_field_worker
        AND r.has_rule
        AND cardinality(r.unruled_ticket_types) = 0)  AS ready_for_field,
       (r.has_service_code AND r.has_rate AND r.has_rule
        AND cardinality(r.unruled_service_codes) = 0) AS ready_for_billing,
       ARRAY_REMOVE(ARRAY[
           CASE WHEN NOT r.has_client        THEN 'client'        END,
           CASE WHEN NOT r.has_contract      THEN 'contract'      END,
           CASE WHEN NOT r.has_contractor    THEN 'contractor'    END,
           CASE WHEN NOT r.has_site          THEN 'disposal_site' END,
           CASE WHEN NOT r.has_ticket_type   THEN 'ticket_type'   END,
           CASE WHEN NOT r.has_service_code  THEN 'service_code'  END,
           CASE WHEN NOT r.has_rate          THEN 'rate'          END,
           CASE WHEN NOT r.has_rule          THEN 'rule'          END,
           CASE WHEN r.has_rule AND cardinality(r.unruled_ticket_types) > 0
                                             THEN 'rule_coverage' END,
           CASE WHEN cardinality(r.unruled_service_codes) > 0
                                             THEN 'code_coverage' END,
           CASE WHEN NOT r.has_field_worker  THEN 'field_worker'  END
       ], NULL) AS missing
FROM project_readiness r;

COMMENT ON VIEW project_readiness_summary IS
    'The readiness view with the two gates resolved. ready_for_field now '
    'includes rule coverage, so the creation gate refuses a ticket on a '
    'project that could not price it. missing names rule_coverage separately '
    'from rule, because "no rules at all" and "three types covered, one not" '
    'are different jobs for whoever has to fix it.';

-- ---------------------------------------------------------------------------
-- Ticket number assignment + the creation gate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_ticket_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_prefix    text;
    v_is_system boolean;
    v_type_code text;
    v_enforce   text := COALESCE(current_setting('adms.enforce_gate', true), 'on');
    v_ready     boolean;
    v_unruled   text[];
BEGIN
    SELECT ticket_prefix INTO v_prefix FROM projects WHERE id = NEW.project_id;
    SELECT is_system, code INTO v_is_system, v_type_code
      FROM ticket_types WHERE id = NEW.ticket_type_id;

    IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
        NEW.ticket_number := adms_next_number(
            'ticket:' || NEW.project_id::text, COALESCE(v_prefix, 'T') || '-');
    END IF;

    IF NEW.owner_instance_key IS NULL THEN
        NEW.owner_instance_key := (SELECT instance_key FROM instance LIMIT 1);
    END IF;

    IF v_enforce = 'off' THEN
        RETURN NEW;
    END IF;

    -- The ticket type must be enabled on the project (system types excepted).
    IF NOT v_is_system AND NOT EXISTS (
        SELECT 1 FROM project_ticket_types ptt
         WHERE ptt.project_id = NEW.project_id
           AND ptt.ticket_type_id = NEW.ticket_type_id
           AND ptt.is_active
    ) THEN
        RAISE EXCEPTION
            'Ticket type % is not enabled on this project', v_type_code
            USING ERRCODE = 'check_violation';
    END IF;

    -- The project must be configured far enough for field work. Rule coverage
    -- is part of that now, so this refuses a ticket on a project that could
    -- not have priced it, and names the uncovered type rather than the flag.
    SELECT ready_for_field, unruled_ticket_types
      INTO v_ready, v_unruled
      FROM project_readiness_summary WHERE project_id = NEW.project_id;

    IF NOT COALESCE(v_ready, false) THEN
        IF v_unruled IS NOT NULL AND cardinality(v_unruled) > 0 THEN
            RAISE EXCEPTION
                'Project is not ready for field work. No rule covers %, so a '
                'ticket of that type could never be billed. Still missing: %',
                array_to_string(v_unruled, ', '),
                (SELECT array_to_string(missing, ', ')
                   FROM project_readiness_summary WHERE project_id = NEW.project_id)
                USING ERRCODE = 'check_violation';
        END IF;
        RAISE EXCEPTION
            'Project is not ready for field work; missing: %',
            (SELECT array_to_string(missing, ', ')
               FROM project_readiness_summary WHERE project_id = NEW.project_id)
            USING ERRCODE = 'check_violation';
    END IF;

    -- The creator must be an assigned worker cleared to create tickets.
    IF NEW.created_by IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM project_assignments pa
         WHERE pa.project_id = NEW.project_id
           AND pa.user_id = NEW.created_by
           AND pa.is_active
           AND pa.can_create_tickets
    ) THEN
        RAISE EXCEPTION
            'User % is not an approved ticket creator on this project',
            NEW.created_by
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_before_insert
    BEFORE INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION adms_ticket_before_insert();

-- ---------------------------------------------------------------------------
-- Completion / void bookkeeping
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_ticket_before_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status <> 'completed'
       AND NEW.completed_at IS NULL THEN
        NEW.completed_at := now();
    END IF;

    IF NEW.is_void AND NOT OLD.is_void THEN
        NEW.voided_at := COALESCE(NEW.voided_at, now());
        NEW.status := 'voided';
        NEW.processing_state := 'excluded';
    END IF;

    -- Any change to a billing-relevant field puts the ticket back in the queue.
    IF NEW.status = 'completed' AND NOT NEW.is_void AND (
           NEW.load_call_pct       IS DISTINCT FROM OLD.load_call_pct
        OR NEW.debris_type         IS DISTINCT FROM OLD.debris_type
        OR NEW.net_weight_lbs      IS DISTINCT FROM OLD.net_weight_lbs
        OR NEW.gross_weight_lbs    IS DISTINCT FROM OLD.gross_weight_lbs
        OR NEW.contractor_id       IS DISTINCT FROM OLD.contractor_id
        OR NEW.equipment_id        IS DISTINCT FROM OLD.equipment_id
        OR NEW.zone_id             IS DISTINCT FROM OLD.zone_id
        OR NEW.haul_distance_miles IS DISTINCT FROM OLD.haul_distance_miles
        OR NEW.quantity            IS DISTINCT FROM OLD.quantity
        OR NEW.destination_site_id IS DISTINCT FROM OLD.destination_site_id
        OR (NEW.status <> OLD.status)
    ) THEN
        NEW.processing_state := 'queued';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_before_update
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION adms_ticket_before_update();

-- ---------------------------------------------------------------------------
-- Reporting views used by the back office dashboards
-- ---------------------------------------------------------------------------
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
    COALESCE(md.media_count, 0) AS media_count
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
    SELECT count(*) AS txn_count, SUM(amount) AS txn_total
      FROM transactions tx WHERE tx.ticket_id = t.id
) x ON true
LEFT JOIN LATERAL (
    SELECT count(*) AS media_count FROM ticket_media tm
     WHERE tm.ticket_id = t.id AND tm.deleted_at IS NULL
) md ON true
WHERE t.deleted_at IS NULL;

CREATE OR REPLACE VIEW project_dashboard AS
SELECT
    p.id AS project_id, p.name, p.project_code, p.status,
    cl.name AS client_name,
    COUNT(t.id) FILTER (WHERE t.id IS NOT NULL)                    AS ticket_total,
    COUNT(t.id) FILTER (WHERE t.status = 'completed')              AS ticket_completed,
    COUNT(t.id) FILTER (WHERE t.status NOT IN ('completed','voided')) AS ticket_open,
    COUNT(t.id) FILTER (WHERE t.is_void)                           AS ticket_void,
    COUNT(t.id) FILTER (WHERE t.processing_state IN ('unprocessed','queued'))
                                                                   AS awaiting_processing,
    COALESCE(SUM(m.billable_cubic_yards) FILTER (WHERE t.status = 'completed'), 0)
                                                                   AS total_cubic_yards,
    COALESCE(SUM(m.net_tons) FILTER (WHERE t.status = 'completed'), 0)
                                                                   AS total_tons,
    COALESCE((SELECT SUM(amount) FROM transactions tx WHERE tx.project_id = p.id), 0)
                                                                   AS billable_total
FROM projects p
JOIN clients cl        ON cl.id = p.client_id
LEFT JOIN tickets t    ON t.project_id = p.id AND t.deleted_at IS NULL
LEFT JOIN ticket_metrics m ON m.ticket_id = t.id
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name, p.project_code, p.status, cl.name;

CREATE OR REPLACE VIEW transaction_ledger AS
SELECT
    tx.id, tx.transaction_number, tx.project_id, p.name AS project_name,
    tx.ticket_id, t.ticket_number, tt.label AS ticket_type_label,
    r.name AS rule_name, sc.code AS service_code, sc.name AS service_code_name,
    ct.name AS contractor_name, k.contract_number,
    tx.quantity, tx.unit_type, ut.abbreviation AS unit_abbrev,
    tx.rate_amount, tx.amount, tx.currency, tx.is_reversal,
    tx.quantity_source, tx.computed_at,
    il.invoice_id, iv.invoice_number, iv.status AS invoice_status
FROM transactions tx
JOIN projects p         ON p.id = tx.project_id
JOIN tickets t          ON t.id = tx.ticket_id
JOIN ticket_types tt    ON tt.id = t.ticket_type_id
JOIN rules r            ON r.id = tx.rule_id
JOIN service_codes sc   ON sc.id = tx.service_code_id
JOIN contractors ct     ON ct.id = tx.contractor_id
JOIN contracts k        ON k.id = tx.contract_id
JOIN unit_types ut      ON ut.code = tx.unit_type
LEFT JOIN invoice_lines il ON il.transaction_id = tx.id
LEFT JOIN invoices iv      ON iv.id = il.invoice_id;

CREATE OR REPLACE VIEW audit_trail AS
SELECT
    a.id, a.event_uuid, a.entity_type, a.entity_id, a.entity_label,
    a.project_id, p.name AS project_name, a.action,
    COALESCE(a.actor_name, u.full_name, 'system') AS actor,
    a.actor_role, a.source, a.changed, a.reason, a.occurred_at,
    -- Appended, never inserted: CREATE OR REPLACE VIEW cannot reorder columns,
    -- so every later addition lands at the end.
    a.domain
FROM audit_events a
LEFT JOIN users u    ON u.id = a.actor_id
LEFT JOIN projects p ON p.id = a.project_id;
