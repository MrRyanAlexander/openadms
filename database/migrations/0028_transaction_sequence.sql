-- =============================================================================
-- Open ADMS :: 0028 :: The order transactions run on one ticket
--
-- A ticket does not always produce one transaction. A load hauled to a tipping
-- site produces the haul and then the tipping fee, and the two are not
-- interchangeable: the haul is the work, the fee is what the site charged to
-- take it, and an invoice that lists them in whatever order the rules happened
-- to be created in is an invoice somebody has to re-sort by hand.
--
-- The engine already wrote one transaction per matching rule. What it had no
-- way to express was the order, because priority was carrying two unrelated
-- jobs at once:
--
--   * which of several mutually exclusive rules wins   (if / else)
--   * which order the transactions stack on the ticket (haul, then tipping)
--
-- Those are different questions and they need different columns, so this adds
-- transaction_sequence and leaves priority to the job it was named for.
--
-- The second half of that split is what makes an if/else pair safe. stop_on_match
-- used to EXIT the whole loop, so an else branch that stopped the loop also
-- killed every later transaction on the ticket: write "if VEG else CD" at
-- sequence 1 and the tipping fee at sequence 2, and the tipping fee silently
-- never billed. stop_on_match now stops the rest of ITS OWN sequence group and
-- nothing beyond it, which is what "else" has always meant and what a second
-- transaction has always needed.
--
-- Nothing changes for an instance that has never used either: every existing
-- rule takes sequence 1, so every transaction already written is already at
-- the sequence its rule carries, and a single rule per ticket behaves exactly
-- as before.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The column, on the rule and mirrored onto what the rule produced.
-- ---------------------------------------------------------------------------
ALTER TABLE rules
    ADD COLUMN IF NOT EXISTS transaction_sequence integer NOT NULL DEFAULT 1;

ALTER TABLE rules
    DROP CONSTRAINT IF EXISTS rules_transaction_sequence_positive;
ALTER TABLE rules
    ADD CONSTRAINT rules_transaction_sequence_positive
    CHECK (transaction_sequence >= 1);

-- On the transaction too, so a ticket's transactions can be ordered without
-- joining back to a rule that may since have been retired, and so the order an
-- invoice was built in stays readable after the fact.
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS transaction_sequence integer NOT NULL DEFAULT 1;

-- No backfill, and none is needed: every rule that already exists takes the
-- default 1 from the column above, so every transaction it produced is already
-- at the sequence its rule carries. It would also be refused. 0020 narrowed the
-- transactions trigger to permit exactly one UPDATE, the supersede marker, by
-- comparing the whole row, which means a migration cannot quietly edit a
-- priced row either. That is the guarantee working, not an obstacle.

CREATE INDEX IF NOT EXISTS transactions_ticket_sequence_idx
    ON transactions (ticket_id, transaction_sequence);

COMMENT ON COLUMN rules.transaction_sequence IS
    'The order this rule''s transaction runs on a ticket that produces more '
    'than one. Haul is 1, the tipping fee it incurs is 2. Rules sharing a '
    'sequence are alternatives to each other, decided by priority.';
COMMENT ON COLUMN rules.priority IS
    'Which rule wins among the alternatives at the same transaction_sequence. '
    'Lower runs first, and stop_on_match on a winner skips the rest of that '
    'sequence group only. This is the if/else, never the ordering of separate '
    'transactions.';
COMMENT ON COLUMN transactions.transaction_sequence IS
    'Copied from the rule when the transaction was computed, so a ticket''s '
    'transactions keep their order independently of the rule''s later life.';

-- ---------------------------------------------------------------------------
-- A retired rule stops holding its name.
--
-- Found while proving the above: run the API suite twice against one database
-- and the rule proposal fails with rules_project_id_name_key. rules carried a
-- plain UNIQUE (project_id, name), and a rule is never deleted, it is retired,
-- because every transaction it priced names it and a transaction whose rule
-- vanished cannot be explained to an auditor. So a name was spent the first
-- time it was used and never came back, and "ROW Vegetative Load" could be
-- written exactly once in the life of a project.
--
-- service_codes already knew this. 0008 gave it a partial index with the
-- comment "a plain unique constraint would let a soft-deleted row hold a code
-- hostage forever". rules got the constraint rather than the index. This is
-- that same index, and it matters more now: retiring a rule and writing its
-- replacement under the same name is the ordinary way to correct one.
-- ---------------------------------------------------------------------------
ALTER TABLE rules DROP CONSTRAINT IF EXISTS rules_project_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS rules_project_name_key
    ON rules (project_id, name) WHERE deleted_at IS NULL;

COMMENT ON INDEX rules_project_name_key IS
    'Unique per live rule, not per row ever written. A retired rule keeps its '
    'name in the ledger and releases it for reuse.';

-- ---------------------------------------------------------------------------
-- The engine, with the loop ordered by sequence and stop_on_match scoped to
-- the group it stopped. Carried forward from 0022, which is the definition in
-- force: tiered pricing, the non-billable exclusion and the named no-match
-- reason are all 0022's and are reproduced here unchanged.
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
    v_billable   boolean;
    v_type_label text;
    -- The sequence group a matched stop_on_match rule closed. Every later rule
    -- in that same group is skipped; a different group is untouched.
    v_settled    integer := NULL;
BEGIN
    SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket % not found', p_ticket USING ERRCODE = 'no_data_found';
    END IF;

    SELECT tt.billable, tt.label INTO v_billable, v_type_label
      FROM ticket_types tt WHERE tt.id = v_ticket.ticket_type_id;

    -- An incident, a survey or a right of entry carries no transaction by
    -- design. Sending it through the rule loop and calling the empty result
    -- "no_match" said the configuration was wrong when it was not, and buried
    -- the tickets that really did fall through. Excluded is the honest state.
    IF NOT COALESCE(v_billable, true) THEN
        UPDATE tickets
           SET processing_state = 'excluded', processed_at = now(),
               processing_error = format(
                   '%s tickets do not carry transactions. Recorded, not billed.',
                   COALESCE(v_type_label, 'This type')),
               rules_matched = 0
         WHERE id = p_ticket;
        RETURN;
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
         ORDER BY r.transaction_sequence ASC, r.priority ASC, r.created_at ASC
    LOOP
        CONTINUE WHEN v_settled IS NOT NULL
                  AND v_rule.transaction_sequence = v_settled;
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
            transaction_number, transaction_sequence, project_id, ticket_id,
            rule_id, service_code_id, rate_id, contract_id, contractor_id,
            quantity, unit_type, rate_amount, amount, currency, snapshot,
            rule_snapshot, quantity_source, tier_label, computed_by
        )
        SELECT
            adms_next_number('txn', 'TXN-'),
            v_rule.transaction_sequence,
            v_ticket.project_id, p_ticket, v_rule.id, v_rule.service_code_id,
            v_rate.id, v_rule.contract_id, v_rule.sc_contractor_id,
            v_qty, v_rate.unit_type, v_unit_price, v_amount, v_rate.currency,
            v_eval,
            jsonb_build_object(
                'rule_name', v_rule.name,
                'match_mode', v_rule.match_mode,
                'priority', v_rule.priority,
                'transaction_sequence', v_rule.transaction_sequence,
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

        -- The else branch, and only the else branch. Alternatives at this
        -- sequence are done; a tipping fee at the next sequence still runs.
        IF v_rule.stop_on_match THEN
            v_settled := v_rule.transaction_sequence;
        END IF;
    END LOOP;

    -- State reflects what the ticket has, not only what this pass wrote.
    -- Re-running the engine over an already billed ticket is a no-op, and must
    -- not demote it to no_match.
    SELECT count(*) INTO v_existing
      FROM transactions
     WHERE ticket_id = p_ticket AND NOT is_reversal
       AND superseded_at IS NULL;

    -- A billable ticket that matched nothing is a configuration failure, not a
    -- quiet skip. It gets a named error a person can act on, and the detector
    -- in adms_flag_ticket raises no_rule_matched so it reaches the review queue
    -- rather than sitting in a column nobody opens.
    UPDATE tickets
       SET processing_state = CASE
               WHEN v_existing > 0 THEN 'processed'
               WHEN cardinality(v_no_rate) > 0 THEN 'error'
               ELSE 'no_match' END,
           processed_at     = now(),
           processing_error = CASE
               WHEN v_existing > 0 THEN NULL
               WHEN cardinality(v_no_rate) > 0
               THEN format(
                   'Matched %s but no rate is effective on %s: %s',
                   CASE WHEN cardinality(v_no_rate) = 1 THEN 'rule' ELSE 'rules' END,
                   v_service_dt, array_to_string(v_no_rate, ', '))
               WHEN NOT EXISTS (
                   SELECT 1 FROM rules r
                    WHERE r.project_id = v_ticket.project_id
                      AND r.ticket_type_id = v_ticket.ticket_type_id
                      AND r.is_active AND r.deleted_at IS NULL)
               THEN format(
                   'No rule on this project covers a %s ticket, so nothing can '
                   'be billed against it. Add a rule for that type.',
                   COALESCE(v_type_label, 'ticket'))
               ELSE format(
                   'No rule matched this ticket on %s. Rules for %s exist but '
                   'none of their conditions held, or none was effective on '
                   'that date.',
                   v_service_dt, COALESCE(v_type_label, 'this type'))
               END,
           rules_matched    = GREATEST(v_matched, v_existing)
     WHERE id = p_ticket;

    RETURN;
END;
$$;

COMMENT ON FUNCTION adms_process_ticket IS
    'Evaluates every active rule for the ticket type on the ticket project, in '
    'transaction_sequence then priority order. Each match writes one immutable '
    'transaction, so a single ticket can produce several, and stop_on_match '
    'closes only the sequence group it matched in rather than the whole loop. '
    'Idempotent: re-running never duplicates a transaction, and a superseded '
    'transaction leaves its slot free for the replacement. A tiered service '
    'code is priced from the band its measurement falls in. A non-billable '
    'type is excluded rather than reported as no_match, and a billable ticket '
    'that matched nothing carries a named reason.';

-- ---------------------------------------------------------------------------
-- rule_map carries it too, so the rules screen can group a ticket type's rules
-- the way the engine will run them. CREATE OR REPLACE only allows new columns
-- at the end, which is the only reason the sequence sits after problems here.
-- ---------------------------------------------------------------------------
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
    ], NULL)                AS problems,

    r.transaction_sequence
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


-- ---------------------------------------------------------------------------
-- Numbering scopes
--
-- transaction_number and invoice_number are unique across the instance, so both
-- are drawn on a single instance wide scope. A database seeded before this
-- migration has per-project scopes ('txn:<uuid>') and its highest number could
-- be anywhere, so the instance wide scopes start above whatever is already
-- there rather than at one. On a fresh database both of these insert nothing
-- and the sequences start where they always did.
-- ---------------------------------------------------------------------------
INSERT INTO number_sequences AS ns (scope_key, last_value)
SELECT 'txn', COALESCE(max(NULLIF(regexp_replace(transaction_number, '\D', '', 'g'), ''))::bigint, 0)
  FROM transactions
 HAVING count(*) > 0
ON CONFLICT (scope_key) DO UPDATE
       SET last_value = GREATEST(ns.last_value, EXCLUDED.last_value);

INSERT INTO number_sequences AS ns (scope_key, last_value)
SELECT 'invoice', COALESCE(max(NULLIF(regexp_replace(invoice_number, '\D', '', 'g'), ''))::bigint, 0)
  FROM invoices
 HAVING count(*) > 0
ON CONFLICT (scope_key) DO UPDATE
       SET last_value = GREATEST(ns.last_value, EXCLUDED.last_value);
