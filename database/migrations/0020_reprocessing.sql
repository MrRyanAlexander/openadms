-- ===========================================================================
-- 0020  Reprocessing
--
-- The second walkthrough's largest finding, in one sentence: nothing downstream
-- of a completed ticket could be corrected. `PATCH /tickets/{id}` existed and
-- no screen called it, and even a screen that did could not have repriced the
-- work, because `transactions_one_per_ticket_rule` is unique over
-- (ticket_id, rule_id) and reversing a transaction leaves the original row in
-- place. A second pass of the engine hit the conflict and did nothing.
--
-- This adds the missing half. A transaction can be SUPERSEDED, which takes it
-- out of that unique index without touching a number on it, and the engine
-- gains a reprocess entry point that reverses, supersedes and recomputes in one
-- transaction.
--
-- Two promises are kept exactly as they were. Amounts are still immutable: the
-- narrowed trigger below permits one transition, from live to superseded, and
-- refuses every other UPDATE and every DELETE. And money already invoiced is
-- never moved out from under an approved invoice without someone saying so.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Transactions gain a lifecycle marker. Not a financial field: the amount, the
-- rate and the quantity are as locked as they ever were.
-- ---------------------------------------------------------------------------
ALTER TABLE transactions
    ADD COLUMN superseded_at    timestamptz,
    ADD COLUMN superseded_by    uuid REFERENCES transactions (id) ON DELETE RESTRICT,
    ADD COLUMN supersede_reason text;

COMMENT ON COLUMN transactions.superseded_at IS
    'Set when this transaction has been reversed and recomputed. The row is '
    'untouched otherwise and stays in the ledger as evidence.';

-- The index that made repricing impossible. A superseded transaction no longer
-- occupies its ticket-and-rule slot, so the engine can write the replacement.
DROP INDEX transactions_one_per_ticket_rule;
CREATE UNIQUE INDEX transactions_one_live_per_ticket_rule
    ON transactions (ticket_id, rule_id)
    WHERE NOT is_reversal AND superseded_at IS NULL;

-- ---------------------------------------------------------------------------
-- Immutability, narrowed rather than dropped.
--
-- adms_forbid_mutation blocked every UPDATE, which is why a supersede marker
-- needed its own gate. This permits exactly one transition and nothing else,
-- so the append-only promise in the table comment still holds.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_transaction_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'Transactions are append-only; DELETE is not permitted (record %)',
            OLD.id USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD.superseded_at IS NOT NULL THEN
        RAISE EXCEPTION
            'Transaction % is already superseded and cannot change again',
            OLD.id USING ERRCODE = 'restrict_violation';
    END IF;

    -- Everything except the three supersede columns has to come through
    -- unchanged. Comparing the whole row means a column added later is
    -- protected the day it is added, with no list here to keep in step.
    IF (SELECT to_jsonb(OLD) - 'superseded_at' - 'superseded_by' - 'supersede_reason')
       IS DISTINCT FROM
       (SELECT to_jsonb(NEW) - 'superseded_at' - 'superseded_by' - 'supersede_reason')
    THEN
        RAISE EXCEPTION
            'Transactions are append-only; only the supersede marker may be '
            'set (record %). Write a reversal instead.',
            OLD.id USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.superseded_at IS NULL THEN
        RAISE EXCEPTION
            'A supersede marker cannot be cleared (record %)', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER trg_transactions_immutable ON transactions;
CREATE TRIGGER trg_transactions_guard
    BEFORE UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION adms_transaction_guard();

COMMENT ON TABLE transactions IS
    'Append-only. DELETE is blocked and every value is locked at the database '
    'level; the single permitted UPDATE marks a row superseded after it has '
    'been reversed and recomputed. A correction is still a reversal followed '
    'by a new computation, never an edit.';

-- ---------------------------------------------------------------------------
-- Tickets carry why they are waiting to be repriced.
-- ---------------------------------------------------------------------------
ALTER TABLE tickets
    ADD COLUMN needs_reprocess      boolean NOT NULL DEFAULT false,
    ADD COLUMN reprocess_reason     text,
    ADD COLUMN reprocess_queued_at  timestamptz,
    ADD COLUMN last_reprocessed_at  timestamptz;

CREATE INDEX tickets_needs_reprocess_idx ON tickets (project_id)
    WHERE needs_reprocess;

COMMENT ON COLUMN tickets.needs_reprocess IS
    'Something this ticket was priced from has changed. Queued rather than '
    'repriced on the spot, because correcting one truck certificate can touch '
    'a week of loads and that does not belong inside somebody''s save.';

-- ---------------------------------------------------------------------------
-- Is any of this ticket's money already on an invoice that has been approved?
-- The guardrail every correction path asks about first.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_ticket_invoice_lock(p_ticket uuid)
RETURNS TABLE (invoice_id uuid, invoice_number text, status text)
LANGUAGE sql
STABLE
AS $$
    SELECT DISTINCT i.id, i.invoice_number, i.status
      FROM invoice_lines il
      JOIN invoices i ON i.id = il.invoice_id
      JOIN transactions tx ON tx.id = il.transaction_id
     WHERE tx.ticket_id = p_ticket
       AND tx.superseded_at IS NULL
       AND i.status IN ('approved', 'paid');
$$;

COMMENT ON FUNCTION adms_ticket_invoice_lock IS
    'Approved or paid invoices carrying this ticket. Repricing has to stop and '
    'name them rather than quietly changing a number a client has already '
    'agreed to pay.';

-- ---------------------------------------------------------------------------
-- Reprocess one ticket.
--
-- Re-resolves the certification in force, re-snapshots what the ticket is
-- measured from, reverses and supersedes every live transaction, then runs the
-- engine again. All in one transaction, so a ticket is never half repriced.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_reprocess_ticket(
    p_ticket uuid,
    p_reason text,
    p_actor  uuid DEFAULT NULL,
    p_force  boolean DEFAULT false
) RETURNS TABLE (
    out_reversed    integer,
    out_created     integer,
    out_old_total   numeric,
    out_new_total   numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_ticket   tickets%ROWTYPE;
    v_cert     project_equipment_certifications%ROWTYPE;
    v_on       date;
    v_locked   text[];
    v_txn      record;
    v_rev      uuid;
    v_reversed integer := 0;
    v_created  integer := 0;
    v_old      numeric := 0;
    v_new      numeric := 0;
BEGIN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'Reprocessing needs a reason'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_ticket FROM tickets
     WHERE id = p_ticket AND deleted_at IS NULL FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket % not found', p_ticket USING ERRCODE = 'no_data_found';
    END IF;

    SELECT array_agg(invoice_number) INTO v_locked
      FROM adms_ticket_invoice_lock(p_ticket);

    IF v_locked IS NOT NULL AND NOT p_force THEN
        RAISE EXCEPTION
            'This ticket is on % which has been approved. Reopen it, or '
            'reprocess with force to leave an adjustment behind.',
            array_to_string(v_locked, ', ')
            USING ERRCODE = 'restrict_violation';
    END IF;

    SELECT COALESCE(sum(amount), 0) INTO v_old
      FROM transactions
     WHERE ticket_id = p_ticket AND superseded_at IS NULL AND NOT is_reversal;

    -- Re-resolve what the ticket is measured from. A corrected certification
    -- carries the applies_from of the row it replaced, so this lands on the
    -- corrected capacity for exactly the tickets the wrong one priced.
    v_on := COALESCE(v_ticket.completed_at, v_ticket.destination_at,
                     v_ticket.origin_at, v_ticket.created_at)::date;

    IF v_ticket.equipment_id IS NOT NULL THEN
        v_cert := adms_certification_in_force(
            v_ticket.project_id, v_ticket.equipment_id, v_on);
        IF v_cert.id IS NOT NULL THEN
            UPDATE tickets
               SET certification_id = v_cert.id,
                   certified_capacity_cy = v_cert.certified_capacity_cy,
                   tare_weight_lbs = COALESCE(v_cert.tare_weight_lbs, tare_weight_lbs)
             WHERE id = p_ticket;
        END IF;
    END IF;

    -- Reverse and supersede. The reversal is the audit artifact; the marker is
    -- what frees the ticket-and-rule slot for the recomputation.
    FOR v_txn IN
        SELECT tx.id,
               EXISTS (SELECT 1 FROM transactions r WHERE r.reverses_id = tx.id)
                   AS already_reversed
          FROM transactions tx
         WHERE tx.ticket_id = p_ticket
           AND NOT tx.is_reversal
           AND tx.superseded_at IS NULL
    LOOP
        -- A transaction reversed by hand earlier is already backed out of the
        -- ledger and must not be reversed twice. It still needs the marker, or
        -- its ticket-and-rule slot stays occupied and the recomputation below
        -- silently writes nothing.
        IF v_txn.already_reversed THEN
            v_rev := NULL;
        ELSE
            v_rev := adms_reverse_transaction(v_txn.id, p_reason, p_actor);
            v_reversed := v_reversed + 1;
        END IF;

        UPDATE transactions
           SET superseded_at = now(), superseded_by = v_rev,
               supersede_reason = p_reason
         WHERE id = v_txn.id;

        -- The reversal goes with it. The pair nets to zero and has been
        -- replaced, so leaving the reversal live would subtract it a second
        -- time from every total that sums the whole ledger.
        UPDATE transactions
           SET superseded_at = now(), supersede_reason = p_reason
         WHERE reverses_id = v_txn.id
           AND superseded_at IS NULL;
    END LOOP;

    -- Back to unprocessed so the engine treats this as a fresh evaluation
    -- rather than a re-run over a ticket it has already priced.
    UPDATE tickets
       SET processing_state = 'unprocessed', processed_at = NULL,
           processing_error = NULL
     WHERE id = p_ticket;

    SELECT count(*) INTO v_created FROM adms_process_ticket(p_ticket, p_actor);

    SELECT COALESCE(sum(amount), 0) INTO v_new
      FROM transactions
     WHERE ticket_id = p_ticket AND superseded_at IS NULL AND NOT is_reversal;

    UPDATE tickets
       SET needs_reprocess = false, reprocess_reason = NULL,
           reprocess_queued_at = NULL, last_reprocessed_at = now()
     WHERE id = p_ticket;

    INSERT INTO audit_events (
        entity_type, entity_id, entity_label, project_id, action, actor_id,
        changed, reason
    ) VALUES (
        'tickets', p_ticket, v_ticket.ticket_number, v_ticket.project_id,
        'reprocess', p_actor,
        jsonb_build_object('reversed', v_reversed, 'created', v_created,
                           'old_total', v_old, 'new_total', v_new,
                           'forced', p_force),
        p_reason);

    out_reversed := v_reversed;
    out_created := v_created;
    out_old_total := v_old;
    out_new_total := v_new;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION adms_reprocess_ticket IS
    'Reverse, supersede and recompute one ticket in a single transaction. The '
    'reason is required and lands in the audit trail with both totals, so what '
    'a correction cost is a matter of record rather than a diff someone has to '
    'reconstruct.';

-- ---------------------------------------------------------------------------
-- Queue the tickets a change reaches.
--
-- Correcting one trailer's tare can touch a week of loads. Repricing them
-- inside the PATCH that changed the certificate would make a save unbounded,
-- so the change queues them and the operator reprocesses knowing the count.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_queue_reprocess(
    p_entity text,
    p_id     uuid,
    p_reason text
) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    IF p_entity = 'certification' THEN
        -- Every ticket that resolves to a different certification than the one
        -- stamped on it, for this truck on this project, from the corrected
        -- date forward.
        WITH cert AS (
            SELECT project_id, equipment_id, applies_from
              FROM project_equipment_certifications WHERE id = p_id
        )
        UPDATE tickets t
           SET needs_reprocess = true, reprocess_reason = p_reason,
               reprocess_queued_at = now()
          FROM cert
         WHERE t.project_id = cert.project_id
           AND t.equipment_id = cert.equipment_id
           AND t.deleted_at IS NULL
           AND NOT t.is_void
           AND COALESCE(t.completed_at, t.destination_at, t.origin_at,
                        t.created_at)::date >= cert.applies_from
           AND t.certification_id IS DISTINCT FROM p_id;

    ELSIF p_entity = 'rate' THEN
        UPDATE tickets t
           SET needs_reprocess = true, reprocess_reason = p_reason,
               reprocess_queued_at = now()
          FROM transactions tx
         WHERE tx.ticket_id = t.id
           AND tx.rate_id = p_id
           AND tx.superseded_at IS NULL
           AND t.deleted_at IS NULL;

    ELSIF p_entity = 'rule' THEN
        UPDATE tickets t
           SET needs_reprocess = true, reprocess_reason = p_reason,
               reprocess_queued_at = now()
          FROM transactions tx
         WHERE tx.ticket_id = t.id
           AND tx.rule_id = p_id
           AND tx.superseded_at IS NULL
           AND t.deleted_at IS NULL;

    ELSIF p_entity = 'ticket' THEN
        UPDATE tickets
           SET needs_reprocess = true, reprocess_reason = p_reason,
               reprocess_queued_at = now()
         WHERE id = p_id AND deleted_at IS NULL;

    ELSE
        RAISE EXCEPTION 'Unknown reprocess trigger: %', p_entity
            USING ERRCODE = 'undefined_object';
    END IF;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION adms_queue_reprocess IS
    'Marks the tickets a change reaches, and returns how many. Nothing is '
    'repriced here: the count is what the operator sees before deciding.';

-- ---------------------------------------------------------------------------
-- Unvoid. A void was always reversible in principle and had no path in
-- practice, which left an operator with one irreversible button.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_unvoid_ticket(
    p_ticket uuid,
    p_reason text,
    p_actor  uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_ticket tickets%ROWTYPE;
BEGIN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'Unvoiding needs a reason' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket % not found', p_ticket USING ERRCODE = 'no_data_found';
    END IF;
    IF NOT v_ticket.is_void THEN
        RAISE EXCEPTION 'Ticket % is not void', v_ticket.ticket_number
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE tickets
       SET is_void = false, voided_at = NULL, voided_by = NULL,
           void_reason = NULL,
           needs_reprocess = true,
           reprocess_reason = 'Unvoided: ' || p_reason,
           reprocess_queued_at = now()
     WHERE id = p_ticket;

    INSERT INTO audit_events (
        entity_type, entity_id, entity_label, project_id, action, actor_id,
        changed, reason
    ) VALUES (
        'tickets', p_ticket, v_ticket.ticket_number, v_ticket.project_id,
        'unvoid', p_actor,
        jsonb_build_object('was_void_for', v_ticket.void_reason), p_reason);
END;
$$;

COMMENT ON FUNCTION adms_unvoid_ticket IS
    'Restores a voided ticket and queues it for repricing. The original void '
    'reason is carried into the audit artifact, so the round trip reads as two '
    'decisions rather than one that never happened.';

-- ---------------------------------------------------------------------------
-- Invoices carrying superseded money.
--
-- A reversal against an invoiced transaction used to move the ledger and leave
-- the invoice reading its old total. This is what the invoice screen reads to
-- say so.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW invoice_integrity AS
SELECT
    i.id                AS invoice_id,
    i.invoice_number,
    i.project_id,
    i.status,
    i.total,
    count(*) FILTER (WHERE tx.superseded_at IS NOT NULL) AS superseded_lines,
    COALESCE(sum(tx.amount) FILTER (WHERE tx.superseded_at IS NOT NULL), 0)
                        AS superseded_amount,
    count(*)            AS line_count,
    (count(*) FILTER (WHERE tx.superseded_at IS NOT NULL) > 0) AS needs_review
FROM invoices i
JOIN invoice_lines il ON il.invoice_id = i.id
JOIN transactions tx  ON tx.id = il.transaction_id
GROUP BY i.id, i.invoice_number, i.project_id, i.status, i.total;

COMMENT ON VIEW invoice_integrity IS
    'Invoices holding lines whose transaction has since been reversed and '
    'recomputed. needs_review is what the walkthrough found missing when a void '
    'moved the ledger and left the invoice reading its old total.';

-- ---------------------------------------------------------------------------
-- The engine, taught about superseded rows.
--
-- Two changes, both consequences of the index above. The conflict target names
-- the new predicate, so a recomputation after a supersede writes instead of
-- silently doing nothing. And "this ticket already has money on it" now counts
-- live money only, so a reprocessed ticket whose rules no longer match is
-- correctly reported as no_match rather than staying processed on the strength
-- of transactions that have been reversed.
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
    'and a superseded transaction leaves its slot free for the replacement.';

-- ---------------------------------------------------------------------------
-- The reads, taught the same distinction.
--
-- Every total that sums the whole ledger stays correct without a change,
-- because an original and its reversal are superseded together and still net
-- to zero. What did need saying is which rows are live, so the ledger screen
-- can show a correction as a correction rather than as three mysterious rows.
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
    (tx.superseded_at IS NULL) AS is_live
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
    'Every transaction with its ticket, rule, rate and invoice. is_live marks '
    'the rows that make up the current billable total; superseded rows stay '
    'visible because they are the evidence of what changed and why.';

-- ticket_overview counted every ledger row against a ticket, which after a
-- correction reads as six transactions on a ticket that bills one.
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
WHERE t.deleted_at IS NULL;
