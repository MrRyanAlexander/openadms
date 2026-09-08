-- =============================================================================
-- Open ADMS :: 0011 :: Derived metrics, the rule evaluator, transaction writer
-- Quantity is never typed by a human. It is derived from what the ticket
-- actually recorded, selected by the unit type on the matched rate, and
-- defaults to 1 when the ticket carries no measurable value.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Every derived number a rule or a rate can reference, in one place.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW ticket_metrics AS
SELECT
    t.id AS ticket_id,
    t.project_id,

    -- Volume: certified capacity times the monitor's load call
    round(
        COALESCE(t.certified_capacity_cy, e.capacity_cy, 0)
        * COALESCE(t.load_call_pct, 0) / 100.0, 4
    )::numeric(14, 4) AS billable_cubic_yards,

    -- Weight: prefer an explicit net, else gross minus tare
    round(
        COALESCE(
            t.net_weight_lbs,
            NULLIF(t.gross_weight_lbs, 0) - COALESCE(t.tare_weight_lbs, e.tare_weight_lbs, 0)
        ) / 2000.0, 4
    )::numeric(14, 4) AS net_tons,

    -- Distance: an explicit odometer value, else the recorded waypoint path,
    -- else straight-line origin to destination
    round(COALESCE(
        t.haul_distance_miles,
        wp.path_miles,
        adms_distance_miles(t.origin_latitude, t.origin_longitude,
                            t.destination_latitude, t.destination_longitude),
        0
    ), 4)::numeric(14, 4) AS haul_miles,

    COALESCE(t.labor_hours, 0)::numeric(14, 4)     AS labor_hours,
    COALESCE(t.equipment_hours, 0)::numeric(14, 4) AS equipment_hours,
    COALESCE(t.quantity, 1)::numeric(14, 4)        AS unit_count,
    1::numeric(14, 4)                              AS each,
    1::numeric(14, 4)                              AS flat,
    COALESCE((t.data ->> 'stump_diameter_inches')::numeric, 0)::numeric(14, 4)
                                                   AS stump_diameter_inches,
    COALESCE((t.data ->> 'linear_feet')::numeric, 0)::numeric(14, 4)
                                                   AS linear_feet,

    -- Cycle timings, surfaced for reporting and for time-based rules
    EXTRACT(EPOCH FROM (t.destination_at - t.origin_at)) / 60.0
                                                   AS cycle_minutes,
    wp.waypoint_count
FROM tickets t
LEFT JOIN equipment e ON e.id = t.equipment_id
LEFT JOIN LATERAL (
    SELECT count(*) AS waypoint_count,
           SUM(adms_distance_miles(prev_lat, prev_lon, w.latitude, w.longitude))
               AS path_miles
      FROM (
            SELECT latitude, longitude,
                   lag(latitude)  OVER (ORDER BY sequence) AS prev_lat,
                   lag(longitude) OVER (ORDER BY sequence) AS prev_lon
              FROM ticket_waypoints
             WHERE ticket_id = t.id
           ) w
) wp ON true;

COMMENT ON VIEW ticket_metrics IS
    'The billable quantity candidates for a ticket. unit_types.quantity_source '
    'names the column the engine reads.';

-- ---------------------------------------------------------------------------
-- The flat row a rule statement is evaluated against.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW ticket_evaluation AS
SELECT
    t.id                        AS ticket_id,
    t.ticket_number,
    t.project_id,
    t.ticket_type_id,
    tt.code                     AS ticket_type_code,
    tt.kind                     AS ticket_type_kind,
    t.status,
    t.is_void,
    t.contractor_id,
    c.name                      AS contractor_name,
    t.equipment_id,
    e.unit_number               AS equipment_unit_number,
    e.equipment_type,
    t.contract_id,
    t.zone_id,
    z.zone_code,
    t.debris_type,
    dt.category                 AS debris_category,
    dt.fema_category            AS debris_fema_category,
    t.special_class,
    t.origin_site_id,
    t.destination_site_id,
    ds.site_kind                AS destination_site_kind,
    ds.has_scale                AS destination_has_scale,
    t.load_call_pct,
    t.scale_ticket_number,
    t.origin_at,
    t.destination_at,
    t.completed_at,
    t.severity,
    t.incident_category_id,
    t.created_by,
    t.source,
    t.data,
    m.billable_cubic_yards,
    m.net_tons,
    m.haul_miles,
    m.labor_hours,
    m.equipment_hours,
    m.unit_count,
    m.each,
    m.flat,
    m.stump_diameter_inches,
    m.linear_feet,
    m.cycle_minutes,
    m.waypoint_count,
    (SELECT count(*) FROM ticket_media tm
      WHERE tm.ticket_id = t.id AND tm.deleted_at IS NULL) AS photo_count,
    COALESCE(t.completed_at, t.destination_at, t.origin_at, t.created_at)::date
                                AS service_date
FROM tickets t
JOIN ticket_types tt      ON tt.id = t.ticket_type_id
JOIN ticket_metrics m     ON m.ticket_id = t.id
LEFT JOIN contractors c   ON c.id = t.contractor_id
LEFT JOIN equipment e     ON e.id = t.equipment_id
LEFT JOIN project_zones z ON z.id = t.zone_id
LEFT JOIN debris_types dt ON dt.code = t.debris_type
LEFT JOIN disposal_sites ds ON ds.id = t.destination_site_id;

-- ---------------------------------------------------------------------------
-- Statement evaluation. Operand values are pulled by name out of the
-- evaluation row so a new operand is a catalog INSERT, not a code change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_eval_statement(
    p_row       jsonb,
    p_operand   text,
    p_operator  text,
    p_value     jsonb,
    p_negate    boolean DEFAULT false
) RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_path      text;
    v_type      text;
    v_raw       jsonb;
    v_left_txt  text;
    v_left_num  numeric;
    v_left_ts   timestamptz;
    v_result    boolean;
BEGIN
    SELECT source_path, data_type INTO v_path, v_type
      FROM rule_operands WHERE code = p_operand;

    IF v_path IS NULL THEN
        RAISE EXCEPTION 'Unknown rule operand: %', p_operand
            USING ERRCODE = 'undefined_object';
    END IF;

    v_raw := p_row -> v_path;
    IF v_raw = 'null'::jsonb THEN
        v_raw := NULL;
    END IF;

    IF p_operator = 'is_null' THEN
        v_result := v_raw IS NULL;
        RETURN CASE WHEN p_negate THEN NOT v_result ELSE v_result END;
    ELSIF p_operator = 'is_not_null' THEN
        v_result := v_raw IS NOT NULL;
        RETURN CASE WHEN p_negate THEN NOT v_result ELSE v_result END;
    END IF;

    -- A null left side never satisfies a comparison.
    IF v_raw IS NULL THEN
        RETURN CASE WHEN p_negate THEN true ELSE false END;
    END IF;

    v_left_txt := trim(both '"' FROM v_raw::text);

    IF v_type = 'number' THEN
        BEGIN
            v_left_num := v_left_txt::numeric;
        EXCEPTION WHEN others THEN
            v_left_num := NULL;
        END;
    ELSIF v_type IN ('date', 'timestamp') THEN
        BEGIN
            v_left_ts := v_left_txt::timestamptz;
        EXCEPTION WHEN others THEN
            v_left_ts := NULL;
        END;
    END IF;

    v_result := CASE p_operator
        WHEN 'eq' THEN
            CASE WHEN v_type = 'number'
                 THEN v_left_num = (p_value #>> '{}')::numeric
                 WHEN v_type IN ('date', 'timestamp')
                 THEN v_left_ts = (p_value #>> '{}')::timestamptz
                 WHEN v_type = 'boolean'
                 THEN (v_left_txt::boolean) = (p_value #>> '{}')::boolean
                 ELSE lower(v_left_txt) = lower(p_value #>> '{}')
            END
        WHEN 'ne' THEN
            CASE WHEN v_type = 'number'
                 THEN v_left_num <> (p_value #>> '{}')::numeric
                 WHEN v_type IN ('date', 'timestamp')
                 THEN v_left_ts <> (p_value #>> '{}')::timestamptz
                 ELSE lower(v_left_txt) <> lower(p_value #>> '{}')
            END
        WHEN 'gt' THEN
            CASE WHEN v_type IN ('date', 'timestamp')
                 THEN v_left_ts > (p_value #>> '{}')::timestamptz
                 ELSE v_left_num > (p_value #>> '{}')::numeric
            END
        WHEN 'gte' THEN
            CASE WHEN v_type IN ('date', 'timestamp')
                 THEN v_left_ts >= (p_value #>> '{}')::timestamptz
                 ELSE v_left_num >= (p_value #>> '{}')::numeric
            END
        WHEN 'lt' THEN
            CASE WHEN v_type IN ('date', 'timestamp')
                 THEN v_left_ts < (p_value #>> '{}')::timestamptz
                 ELSE v_left_num < (p_value #>> '{}')::numeric
            END
        WHEN 'lte' THEN
            CASE WHEN v_type IN ('date', 'timestamp')
                 THEN v_left_ts <= (p_value #>> '{}')::timestamptz
                 ELSE v_left_num <= (p_value #>> '{}')::numeric
            END
        WHEN 'in' THEN
            EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(p_value) opt
                 WHERE CASE WHEN v_type = 'number'
                            THEN opt::numeric = v_left_num
                            ELSE lower(opt) = lower(v_left_txt) END
            )
        WHEN 'not_in' THEN
            NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(p_value) opt
                 WHERE CASE WHEN v_type = 'number'
                            THEN opt::numeric = v_left_num
                            ELSE lower(opt) = lower(v_left_txt) END
            )
        WHEN 'between' THEN
            v_left_num BETWEEN (p_value ->> 0)::numeric AND (p_value ->> 1)::numeric
        WHEN 'contains' THEN
            position(lower(p_value #>> '{}') IN lower(v_left_txt)) > 0
        WHEN 'starts_with' THEN
            v_left_txt ILIKE (p_value #>> '{}') || '%'
        ELSE
            NULL
    END;

    IF v_result IS NULL THEN
        RETURN false;
    END IF;

    RETURN CASE WHEN p_negate THEN NOT v_result ELSE v_result END;
END;
$$;

-- ---------------------------------------------------------------------------
-- Does a whole rule match this ticket?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_rule_matches(p_ticket uuid, p_rule uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_row        jsonb;
    v_mode       text;
    v_total      integer := 0;
    v_matched    integer := 0;
    r            record;
BEGIN
    SELECT to_jsonb(te) INTO v_row
      FROM ticket_evaluation te WHERE te.ticket_id = p_ticket;

    IF v_row IS NULL THEN
        RETURN false;
    END IF;

    SELECT match_mode INTO v_mode FROM rules WHERE id = p_rule;

    FOR r IN
        SELECT operand_code, operator_code, value, negate
          FROM rule_statements
         WHERE rule_id = p_rule
         ORDER BY sequence
    LOOP
        v_total := v_total + 1;
        IF adms_eval_statement(v_row, r.operand_code, r.operator_code,
                               r.value, r.negate) THEN
            v_matched := v_matched + 1;
        ELSIF v_mode = 'all' THEN
            RETURN false;
        END IF;
    END LOOP;

    -- A rule with no statements is an unconditional catch-all for its type.
    IF v_total = 0 THEN
        RETURN true;
    END IF;

    RETURN CASE WHEN v_mode = 'any' THEN v_matched > 0 ELSE v_matched = v_total END;
END;
$$;

-- ---------------------------------------------------------------------------
-- Pull the billable quantity for a given unit type off the ticket.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_quantity_for(p_ticket uuid, p_unit_type text)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_source  text;
    v_metrics jsonb;
    v_value   numeric;
BEGIN
    SELECT quantity_source INTO v_source FROM unit_types WHERE code = p_unit_type;
    IF v_source IS NULL THEN
        RETURN 1;
    END IF;

    SELECT to_jsonb(m) INTO v_metrics FROM ticket_metrics m WHERE m.ticket_id = p_ticket;
    IF v_metrics IS NULL THEN
        RETURN 1;
    END IF;

    BEGIN
        v_value := (v_metrics ->> v_source)::numeric;
    EXCEPTION WHEN others THEN
        v_value := NULL;
    END;

    -- No measurable value on this ticket means a quantity of one.
    RETURN COALESCE(NULLIF(v_value, 0), 1);
END;
$$;

-- ---------------------------------------------------------------------------
-- Process a ticket: evaluate every active rule for its type on its project and
-- write one locked transaction per match.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_process_ticket(
    p_ticket uuid,
    p_actor  uuid DEFAULT NULL
) RETURNS TABLE (out_transaction_id uuid, out_rule_id uuid, out_amount numeric)
LANGUAGE plpgsql
AS $$
DECLARE
    v_ticket     tickets%ROWTYPE;
    v_eval       jsonb;
    v_rule       record;
    v_rate       rates%ROWTYPE;
    v_qty        numeric;
    v_amount     numeric;
    v_txn        uuid;
    v_created    integer := 0;
    v_matched    integer := 0;
    v_existing   integer := 0;
    v_no_rate    text[] := '{}';
    v_service_dt date;
BEGIN
    SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket % not found', p_ticket USING ERRCODE = 'no_data_found';
    END IF;

    IF v_ticket.is_void THEN
        UPDATE tickets SET processing_state = 'excluded', processed_at = now(),
                          processing_error = 'Ticket is void'
         WHERE id = p_ticket;
        RETURN;
    END IF;

    IF v_ticket.status <> 'completed' THEN
        UPDATE tickets SET processing_state = 'excluded', processed_at = now(),
                          processing_error = 'Ticket is not complete'
         WHERE id = p_ticket;
        RETURN;
    END IF;

    SELECT to_jsonb(te), te.service_date INTO v_eval, v_service_dt
      FROM ticket_evaluation te WHERE te.ticket_id = p_ticket;

    FOR v_rule IN
        SELECT r.*, sc.contractor_id AS sc_contractor_id
          FROM rules r
          JOIN service_codes sc ON sc.id = r.service_code_id
         WHERE r.project_id = v_ticket.project_id
           AND r.ticket_type_id = v_ticket.ticket_type_id
           AND r.is_active
           AND r.deleted_at IS NULL
           AND (r.effective_from IS NULL OR r.effective_from <= v_service_dt)
           AND (r.effective_to IS NULL OR r.effective_to >= v_service_dt)
         ORDER BY r.priority ASC, r.created_at ASC
    LOOP
        CONTINUE WHEN NOT adms_rule_matches(p_ticket, v_rule.id);

        v_matched := v_matched + 1;

        v_rate := adms_rate_for(v_rule.service_code_id, v_service_dt);
        IF v_rate.id IS NULL THEN
            -- The rule matched but no rate is effective on the service date.
            -- Record it rather than dropping the ticket silently.
            v_no_rate := v_no_rate || v_rule.name;
            CONTINUE;
        END IF;

        v_qty := COALESCE(v_rule.quantity_override,
                          adms_quantity_for(p_ticket, v_rate.unit_type));

        IF v_rate.minimum_quantity IS NOT NULL THEN
            v_qty := GREATEST(v_qty, v_rate.minimum_quantity);
        END IF;
        IF v_rate.maximum_quantity IS NOT NULL THEN
            v_qty := LEAST(v_qty, v_rate.maximum_quantity);
        END IF;

        v_amount := round(v_qty * v_rate.amount, 4);

        INSERT INTO transactions (
            transaction_number, project_id, ticket_id, rule_id, service_code_id,
            rate_id, contract_id, contractor_id, quantity, unit_type,
            rate_amount, amount, currency, snapshot, rule_snapshot,
            quantity_source, computed_by
        )
        SELECT
            adms_next_number('txn:' || v_ticket.project_id::text, 'TXN-'),
            v_ticket.project_id, p_ticket, v_rule.id, v_rule.service_code_id,
            v_rate.id, v_rule.contract_id, v_rule.sc_contractor_id,
            v_qty, v_rate.unit_type, v_rate.amount, v_amount, v_rate.currency,
            v_eval,
            jsonb_build_object(
                'rule_name', v_rule.name,
                'match_mode', v_rule.match_mode,
                'priority', v_rule.priority,
                'statements', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'operand', rs.operand_code,
                        'operator', rs.operator_code,
                        'value', rs.value,
                        'value_label', rs.value_label,
                        'negate', rs.negate
                    ) ORDER BY rs.sequence)
                      FROM rule_statements rs WHERE rs.rule_id = v_rule.id
                ), '[]'::jsonb)
            ),
            (SELECT quantity_source FROM unit_types WHERE code = v_rate.unit_type),
            p_actor
        ON CONFLICT (ticket_id, rule_id) WHERE NOT is_reversal DO NOTHING
        RETURNING id INTO v_txn;

        IF v_txn IS NOT NULL THEN
            v_created := v_created + 1;
            out_transaction_id := v_txn;
            out_rule_id := v_rule.id;
            out_amount := v_amount;
            RETURN NEXT;
        END IF;

        EXIT WHEN v_rule.stop_on_match;
    END LOOP;

    -- State reflects what the ticket has, not only what this pass wrote.
    -- Re-running the engine over an already billed ticket is a no-op, and must
    -- not demote it to no_match.
    SELECT count(*) INTO v_existing
      FROM transactions WHERE ticket_id = p_ticket AND NOT is_reversal;

    UPDATE tickets
       SET processing_state = CASE
               WHEN v_existing > 0 THEN 'processed'
               WHEN cardinality(v_no_rate) > 0 THEN 'error'
               ELSE 'no_match' END,
           processed_at     = now(),
           processing_error = CASE
               WHEN v_existing = 0 AND cardinality(v_no_rate) > 0
               THEN format(
                   'Matched %s but no rate is effective on %s: %s',
                   CASE WHEN cardinality(v_no_rate) = 1 THEN 'rule' ELSE 'rules' END,
                   v_service_dt, array_to_string(v_no_rate, ', '))
               END,
           rules_matched    = GREATEST(v_matched, v_existing)
     WHERE id = p_ticket;

    RETURN;
END;
$$;

COMMENT ON FUNCTION adms_process_ticket IS
    'Evaluates every active rule for the ticket type on the ticket project. '
    'Each match writes one immutable transaction, so a single ticket can '
    'produce several. Idempotent: re-running never duplicates a transaction.';

-- ---------------------------------------------------------------------------
-- Reverse a transaction. The original is never touched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_reverse_transaction(
    p_transaction uuid,
    p_reason      text,
    p_actor       uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_orig transactions%ROWTYPE;
    v_new  uuid;
BEGIN
    SELECT * INTO v_orig FROM transactions WHERE id = p_transaction;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction % not found', p_transaction
            USING ERRCODE = 'no_data_found';
    END IF;

    IF EXISTS (SELECT 1 FROM transactions WHERE reverses_id = p_transaction) THEN
        RAISE EXCEPTION 'Transaction % is already reversed', p_transaction
            USING ERRCODE = 'unique_violation';
    END IF;

    INSERT INTO transactions (
        transaction_number, project_id, ticket_id, rule_id, service_code_id,
        rate_id, contract_id, contractor_id, quantity, unit_type, rate_amount,
        amount, currency, snapshot, rule_snapshot, quantity_source,
        is_reversal, reverses_id, reversal_reason, computed_by
    ) VALUES (
        adms_next_number('txn:' || v_orig.project_id::text, 'TXN-'),
        v_orig.project_id, v_orig.ticket_id, v_orig.rule_id, v_orig.service_code_id,
        v_orig.rate_id, v_orig.contract_id, v_orig.contractor_id,
        -v_orig.quantity, v_orig.unit_type, v_orig.rate_amount,
        -v_orig.amount, v_orig.currency, v_orig.snapshot, v_orig.rule_snapshot,
        v_orig.quantity_source, true, p_transaction, p_reason, p_actor
    ) RETURNING id INTO v_new;

    INSERT INTO audit_events (
        entity_type, entity_id, entity_label, project_id, action,
        actor_id, changed, reason
    ) VALUES (
        'transactions', p_transaction, v_orig.transaction_number,
        v_orig.project_id, 'reverse', p_actor,
        jsonb_build_object('reversed_by', v_new), p_reason
    );

    RETURN v_new;
END;
$$;
