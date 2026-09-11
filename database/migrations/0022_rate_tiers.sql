-- ===========================================================================
-- 0022  How a unit rate is actually priced
--
-- The engine has always pulled a quantity off the ticket by the rate's unit
-- type and multiplied. That is right for a load and wrong for tree work, which
-- the walkthrough put plainly:
--
--   "When a hanger is removed it means a tree had at least one branch that was
--    above 2 inches but there were likely more and noted as such on the hanger
--    count, but that count has no impact on the paid unit of 1"
--
--   "Hangers are flat rate.. Even if the hanger is 26 inches
--    Leaners and stumps are on tiers based on the rate sheet"
--
-- Two things follow. A flat code bills one whatever the ticket counted, so the
-- hanger count stays on the record as evidence without becoming a multiplier.
-- And a tiered code takes its price from a band, so a 26 inch stump and a 6
-- inch stump are different money on the same service code, which is how every
-- rate sheet in this domain is written.
-- ===========================================================================

ALTER TABLE service_codes
    ADD COLUMN quantity_mode text NOT NULL DEFAULT 'measured';

ALTER TABLE service_codes
    ADD CONSTRAINT service_codes_quantity_mode_valid CHECK (
        quantity_mode IN ('measured', 'flat', 'tiered'));

COMMENT ON COLUMN service_codes.quantity_mode IS
    'measured multiplies the rate by what the ticket measured, which is right '
    'for a load. flat always bills one, which is right for a hanger: the count '
    'is evidence, not a multiplier. tiered prices from a band on the rate '
    'sheet, which is how leaners and stumps are written.';

-- ---------------------------------------------------------------------------
-- The bands. from_value is inclusive and to_value exclusive, so bands written
-- straight off a rate sheet ("6 to 12 inches, 12 to 24, 24 and over") cannot
-- overlap or leave a gap at the boundary.
-- ---------------------------------------------------------------------------
CREATE TABLE rate_tiers (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_id       uuid NOT NULL REFERENCES rates (id) ON DELETE CASCADE,
    label         text,
    from_value    numeric(14, 4) NOT NULL DEFAULT 0,
    to_value      numeric(14, 4),
    amount        numeric(14, 4) NOT NULL,
    sort_order    integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT rate_tiers_band_ordered CHECK (
        to_value IS NULL OR to_value > from_value),
    CONSTRAINT rate_tiers_amount_non_negative CHECK (amount >= 0),
    CONSTRAINT rate_tiers_from_non_negative CHECK (from_value >= 0)
);

CREATE INDEX rate_tiers_rate_idx ON rate_tiers (rate_id, from_value);

COMMENT ON TABLE rate_tiers IS
    'Price bands for a tiered rate. from_value inclusive, to_value exclusive, '
    'so bands copied off a rate sheet meet exactly at the boundary.';

-- Which measurement picks the band. A column on ticket_metrics, so a new
-- measurement becomes tierable without touching the engine.
ALTER TABLE rates
    ADD COLUMN tier_source text;

COMMENT ON COLUMN rates.tier_source IS
    'The ticket_metrics column whose value selects the band, for example '
    'stump_diameter_inches. Only read when the service code is tiered.';

-- ---------------------------------------------------------------------------
-- Overlapping bands would make the price depend on row order, so they are
-- refused rather than resolved.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_check_rate_tier_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM rate_tiers t
         WHERE t.rate_id = NEW.rate_id
           AND t.id <> NEW.id
           AND NEW.from_value < COALESCE(t.to_value, 'infinity'::numeric)
           AND COALESCE(NEW.to_value, 'infinity'::numeric) > t.from_value
    ) THEN
        RAISE EXCEPTION
            'This band overlaps one already on the rate. Bands have to meet at '
            'the boundary, not across it.'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rate_tiers_no_overlap
    BEFORE INSERT OR UPDATE ON rate_tiers
    FOR EACH ROW EXECUTE FUNCTION adms_check_rate_tier_overlap();

-- ---------------------------------------------------------------------------
-- The price for one ticket under one rate.
--
-- Returns the unit price and the band that produced it, so a transaction can
-- record which line of the rate sheet it was billed on rather than leaving
-- somebody to work it out from the number.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_price_for(
    p_ticket uuid,
    p_rate   uuid
) RETURNS TABLE (out_amount numeric, out_tier_label text, out_tier_value numeric)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_rate    rates%ROWTYPE;
    v_mode    text;
    v_metrics jsonb;
    v_value   numeric;
    v_tier    rate_tiers%ROWTYPE;
BEGIN
    SELECT * INTO v_rate FROM rates WHERE id = p_rate;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT quantity_mode INTO v_mode
      FROM service_codes WHERE id = v_rate.service_code_id;

    IF v_mode <> 'tiered' OR v_rate.tier_source IS NULL THEN
        out_amount := v_rate.amount;
        RETURN NEXT;
        RETURN;
    END IF;

    SELECT to_jsonb(m) INTO v_metrics FROM ticket_metrics m WHERE m.ticket_id = p_ticket;
    BEGIN
        v_value := (v_metrics ->> v_rate.tier_source)::numeric;
    EXCEPTION WHEN others THEN
        v_value := NULL;
    END;

    SELECT * INTO v_tier FROM rate_tiers
     WHERE rate_id = p_rate
       AND COALESCE(v_value, 0) >= from_value
       AND (to_value IS NULL OR COALESCE(v_value, 0) < to_value)
     ORDER BY from_value DESC LIMIT 1;

    IF v_tier.id IS NULL THEN
        -- No band covers the measurement. The rate's own amount is the
        -- fallback rather than a refusal, because a ticket that cannot be
        -- priced is worse than one priced at the base figure and visible.
        out_amount := v_rate.amount;
        out_tier_label := 'No band for ' || COALESCE(v_value::text, 'a missing measurement');
        out_tier_value := v_value;
    ELSE
        out_amount := v_tier.amount;
        out_tier_label := COALESCE(v_tier.label,
            v_tier.from_value::text || ' to ' ||
            COALESCE(v_tier.to_value::text, 'over'));
        out_tier_value := v_value;
    END IF;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION adms_price_for IS
    'The unit price for a ticket under a rate, and the band that produced it. '
    'A measurement no band covers falls back to the rate amount and says so, '
    'because an unpriced ticket is worse than a visible approximation.';

-- ---------------------------------------------------------------------------
-- The quantity, now that a flat code exists.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS adms_quantity_for(uuid, text);

CREATE OR REPLACE FUNCTION adms_quantity_for(
    p_ticket uuid,
    p_unit_type text,
    p_service_code uuid DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_source  text;
    v_metrics jsonb;
    v_value   numeric;
    v_mode    text;
BEGIN
    IF p_service_code IS NOT NULL THEN
        SELECT quantity_mode INTO v_mode FROM service_codes WHERE id = p_service_code;
        -- A hanger is one hanger however many branches were on the tree. The
        -- count stays on the ticket as evidence and never becomes a multiplier.
        IF v_mode IN ('flat', 'tiered') THEN
            RETURN 1;
        END IF;
    END IF;

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

    RETURN COALESCE(NULLIF(v_value, 0), 1);
END;
$$;

COMMENT ON FUNCTION adms_quantity_for IS
    'The billable quantity. A flat or tiered service code always bills one, '
    'because its price already accounts for the size of the thing; every other '
    'code multiplies by what the ticket measured.';

-- ---------------------------------------------------------------------------
-- Where a rate sheet shows its bands.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW rate_card AS
SELECT
    r.id                  AS rate_id,
    r.service_code_id,
    sc.project_id,
    sc.code               AS service_code,
    sc.name               AS service_code_name,
    sc.quantity_mode,
    r.unit_type,
    ut.abbreviation       AS unit_abbrev,
    r.amount              AS base_amount,
    r.tier_source,
    r.effective_from,
    r.effective_to,
    COALESCE(jsonb_agg(
        jsonb_build_object(
            'label', COALESCE(t.label,
                t.from_value::text || ' to ' || COALESCE(t.to_value::text, 'over')),
            'from', t.from_value, 'to', t.to_value, 'amount', t.amount)
        ORDER BY t.from_value) FILTER (WHERE t.id IS NOT NULL), '[]'::jsonb)
                          AS tiers
FROM rates r
JOIN service_codes sc ON sc.id = r.service_code_id
JOIN unit_types ut    ON ut.code = r.unit_type
LEFT JOIN rate_tiers t ON t.rate_id = r.id
GROUP BY r.id, sc.project_id, sc.code, sc.name, sc.quantity_mode,
         ut.abbreviation;

COMMENT ON VIEW rate_card IS
    'Every rate with its bands, which is the shape a contract rate sheet is '
    'written in and the shape somebody checking an invoice wants to read.';

-- ---------------------------------------------------------------------------
-- A transaction records which line of the rate sheet priced it.
-- ---------------------------------------------------------------------------
ALTER TABLE transactions ADD COLUMN tier_label text;

COMMENT ON COLUMN transactions.tier_label IS
    'The rate sheet band this was billed on, where the code is tiered. Written '
    'so an invoice line can be checked against the contract without anyone '
    'reverse engineering it from the amount.';

-- ---------------------------------------------------------------------------
-- The engine, taught how a rate sheet is actually written.
--
-- rate_amount on the transaction is now the price that was APPLIED, which for
-- a tiered code is the band's figure rather than the rate's base. That keeps
-- quantity times rate_amount equal to amount on every row, which is what
-- anybody checking an invoice line does first.
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
    v_unit_price numeric;
    v_tier_label text;
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

        -- Price and quantity are separate questions now. A tiered code takes
        -- its unit price from the band the measurement falls in; a flat or
        -- tiered code always bills one, because the price already accounts for
        -- the size of the thing.
        -- Aliased, because adms_process_ticket has its own out_amount and an
        -- unqualified reference is ambiguous between the two.
        SELECT pf.out_amount, pf.out_tier_label INTO v_unit_price, v_tier_label
          FROM adms_price_for(p_ticket, v_rate.id) pf;

        v_qty := COALESCE(v_rule.quantity_override,
                          adms_quantity_for(p_ticket, v_rate.unit_type,
                                            v_rule.service_code_id));

        IF v_rate.minimum_quantity IS NOT NULL THEN
            v_qty := GREATEST(v_qty, v_rate.minimum_quantity);
        END IF;
        IF v_rate.maximum_quantity IS NOT NULL THEN
            v_qty := LEAST(v_qty, v_rate.maximum_quantity);
        END IF;

        v_amount := round(v_qty * v_unit_price, 4);

        INSERT INTO transactions (
            transaction_number, project_id, ticket_id, rule_id, service_code_id,
            rate_id, contract_id, contractor_id, quantity, unit_type,
            rate_amount, amount, currency, snapshot, rule_snapshot,
            quantity_source, tier_label, computed_by
        )
        SELECT
            adms_next_number('txn:' || v_ticket.project_id::text, 'TXN-'),
            v_ticket.project_id, p_ticket, v_rule.id, v_rule.service_code_id,
            v_rate.id, v_rule.contract_id, v_rule.sc_contractor_id,
            v_qty, v_rate.unit_type, v_unit_price, v_amount, v_rate.currency,
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
            v_tier_label,
            p_actor
        ON CONFLICT (ticket_id, rule_id)
            WHERE NOT is_reversal AND superseded_at IS NULL DO NOTHING
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
      FROM transactions
     WHERE ticket_id = p_ticket AND NOT is_reversal
       AND superseded_at IS NULL;

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
    'produce several. Idempotent: re-running never duplicates a transaction, '
    'and a superseded transaction leaves its slot free for the replacement. '
    'A tiered service code is priced from the band its measurement falls in.';

-- ---------------------------------------------------------------------------
-- The ledger carries the band, so an invoice line can be checked against the
-- rate sheet without anyone reverse engineering it from the amount.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW transaction_ledger AS
SELECT
    tx.id, tx.transaction_number, tx.project_id, p.name AS project_name,
    tx.ticket_id, t.ticket_number, tt.label AS ticket_type_label,
    r.name AS rule_name, sc.code AS service_code, sc.name AS service_code_name,
    ct.name AS contractor_name, k.contract_number,
    tx.quantity, tx.unit_type, ut.abbreviation AS unit_abbrev,
    tx.rate_amount, tx.amount, tx.currency, tx.is_reversal,
    tx.quantity_source, tx.computed_at,
    il.invoice_id, iv.invoice_number, iv.status AS invoice_status,
    tx.superseded_at, tx.superseded_by, tx.supersede_reason,
    (tx.superseded_at IS NULL) AS is_live,
    tx.tier_label
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
COMMENT ON VIEW transaction_ledger IS
    'Every transaction with its ticket, rule, rate, band and invoice. is_live '
    'marks the rows that make up the current billable total; superseded rows '
    'stay visible because they are the evidence of what changed and why.';
