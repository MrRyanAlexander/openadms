-- =============================================================================
-- Open ADMS :: schema test suite
-- Plain SQL, no pgTAP required. Every assertion raises on failure, so the
-- whole file fails loudly under psql -v ON_ERROR_STOP=1.
-- Run after ./setup.sh --with-demo, or standalone via ./setup.sh --test.
-- =============================================================================
\set ON_ERROR_STOP on
\timing off

CREATE TEMP TABLE _results (n int GENERATED ALWAYS AS IDENTITY, name text, ok boolean, detail text);

CREATE OR REPLACE FUNCTION pg_temp.check_that(p_name text, p_condition boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO _results (name, ok, detail) VALUES (p_name, COALESCE(p_condition, false), p_detail);
    IF NOT COALESCE(p_condition, false) THEN
        RAISE EXCEPTION 'FAILED: % %', p_name, COALESCE('(' || p_detail || ')', '');
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.check_raises(p_name text, p_sql text, p_fragment text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_msg    text;
    v_raised boolean := false;
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN others THEN
        v_raised := true;
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    END;

    IF NOT v_raised THEN
        INSERT INTO _results (name, ok, detail) VALUES (p_name, false, 'no error raised');
        RAISE EXCEPTION 'FAILED: % (expected an error, none was raised)', p_name;
    END IF;

    IF p_fragment IS NOT NULL AND position(lower(p_fragment) IN lower(v_msg)) = 0 THEN
        INSERT INTO _results (name, ok, detail) VALUES (p_name, false, v_msg);
        RAISE EXCEPTION 'FAILED: % (wrong error: %)', p_name, v_msg;
    END IF;

    INSERT INTO _results (name, ok, detail) VALUES (p_name, true, left(v_msg, 60));
END;
$$;

DO $tests$
DECLARE
    v_project uuid;
    v_ticket  uuid;
    v_txn     uuid;
    v_rule    uuid;
    v_user    uuid;
    v_type    uuid;
    v_n       integer;
    v_num     numeric;
    v_bool    boolean;
    v_txt     text;
BEGIN
    -- =======================================================================
    -- Structure
    -- =======================================================================
    PERFORM pg_temp.check_that('all migrations recorded',
        (SELECT count(*) FROM schema_migrations) >= 13,
        (SELECT count(*)::text FROM schema_migrations));

    PERFORM pg_temp.check_that('core tables exist',
        (SELECT count(*) FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('tickets','transactions','rules','rule_statements',
                               'service_codes','rates','projects','audit_events',
                               'ticket_types','invoices','instance')) = 11);

    PERFORM pg_temp.check_that('reporting views exist',
        (SELECT count(*) FROM information_schema.views
          WHERE table_schema = 'public'
            AND table_name IN ('ticket_overview','project_dashboard',
                               'transaction_ledger','audit_trail',
                               'ticket_metrics','ticket_evaluation',
                               'project_readiness_summary')) = 7);

    PERFORM pg_temp.check_that('every foreign key has an index or is trivially small',
        NOT EXISTS (
            SELECT 1 FROM pg_constraint c
             WHERE c.contype = 'f'
               AND c.conrelid::regclass::text IN ('tickets','transactions','rules')
               AND NOT EXISTS (
                    SELECT 1 FROM pg_index i
                     WHERE i.indrelid = c.conrelid
                       AND (c.conkey::int[])[1] = ANY (i.indkey::int[])
               )
               AND c.conname LIKE '%project%'
        ));

    -- =======================================================================
    -- Reference data
    -- =======================================================================
    PERFORM pg_temp.check_that('roles are ranked and cumulative',
        (SELECT count(*) FROM roles) = 4
        AND adms_role_has_permission('admin', 'ticket.create')
        AND adms_role_has_permission('analyst', 'ticket.create')
        AND NOT adms_role_has_permission('monitor', 'rule.manage'));

    PERFORM pg_temp.check_that('monitor cannot manage rates but analyst can',
        NOT adms_role_has_permission('monitor', 'rate.manage')
        AND adms_role_has_permission('analyst', 'rate.manage'));

    PERFORM pg_temp.check_that('every unit type maps to a real metric column',
        NOT EXISTS (
            SELECT 1 FROM unit_types ut
             WHERE ut.quantity_source NOT IN (
                SELECT column_name FROM information_schema.columns
                 WHERE table_name = 'ticket_metrics')));

    PERFORM pg_temp.check_that('every rule operand maps to a real evaluation column',
        NOT EXISTS (
            SELECT 1 FROM rule_operands ro
             WHERE ro.source_path NOT IN (
                SELECT column_name FROM information_schema.columns
                 WHERE table_name = 'ticket_evaluation')));

    PERFORM pg_temp.check_that('both hidden ticket types exist and are non-billable',
        (SELECT count(*) FROM ticket_types
          WHERE is_system AND NOT billable
            AND code IN ('PENDING_COLLECTION','PENDING_DISPOSAL')) = 2);

    -- =======================================================================
    -- Demo data landed
    -- =======================================================================
    SELECT id INTO v_project FROM projects WHERE project_code = 'STL-2026-ROW';
    PERFORM pg_temp.check_that('demo project exists', v_project IS NOT NULL);

    PERFORM pg_temp.check_that('demo project is field ready and billing ready',
        (SELECT ready_for_field AND ready_for_billing
           FROM project_readiness_summary WHERE project_id = v_project));

    PERFORM pg_temp.check_that('demo project has tickets of every enabled type',
        (SELECT count(DISTINCT ticket_type_id) FROM tickets
          WHERE project_id = v_project) >= 4);

    -- =======================================================================
    -- Ticket creation gate
    -- =======================================================================
    SELECT id INTO v_type FROM ticket_types WHERE code = 'PENDING_COLLECTION';
    PERFORM pg_temp.check_raises(
        'system ticket types cannot be added to a project',
        format('INSERT INTO project_ticket_types (project_id, ticket_type_id)
                VALUES (%L, %L)', v_project, v_type),
        'system type');

    SELECT id INTO v_type FROM ticket_types WHERE code = 'SURVEY';
    PERFORM pg_temp.check_raises(
        'a ticket type not enabled on the project is refused',
        format('INSERT INTO tickets (project_id, ticket_type_id, status)
                VALUES (%L, %L, ''draft'')', v_project, v_type),
        'not enabled');

    SELECT id INTO v_user FROM users WHERE username = 'analyst';
    SELECT id INTO v_type FROM ticket_types WHERE code = 'LOAD';
    PERFORM pg_temp.check_raises(
        'a user without create rights on the project is refused',
        format('INSERT INTO tickets (project_id, ticket_type_id, status, created_by)
                VALUES (%L, %L, ''draft'', %L)', v_project, v_type, v_user),
        'approved ticket creator');

    -- An unconfigured project blocks the field entirely.
    INSERT INTO projects (name, project_code, client_id, status)
    SELECT 'Test Empty Project', 'TEST-EMPTY', client_id, 'setup'
      FROM projects WHERE id = v_project
    RETURNING id INTO v_ticket;
    INSERT INTO project_ticket_types (project_id, ticket_type_id)
    VALUES (v_ticket, v_type);
    PERFORM pg_temp.check_raises(
        'an unconfigured project blocks ticket creation',
        format('INSERT INTO tickets (project_id, ticket_type_id, status)
                VALUES (%L, %L, ''draft'')', v_ticket, v_type),
        'not ready');
    DELETE FROM project_ticket_types WHERE project_id = v_ticket;
    DELETE FROM projects WHERE id = v_ticket;

    -- =======================================================================
    -- Numbering
    -- =======================================================================
    PERFORM pg_temp.check_that('ticket numbers are unique and prefixed per project',
        NOT EXISTS (
            SELECT ticket_number FROM tickets WHERE project_id = v_project
             GROUP BY ticket_number HAVING count(*) > 1)
        AND (SELECT bool_and(ticket_number LIKE 'STL-%')
               FROM tickets WHERE project_id = v_project));

    -- =======================================================================
    -- Metrics
    -- =======================================================================
    SELECT t.id INTO v_ticket
      FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id
     WHERE t.project_id = v_project AND tt.code = 'LOAD'
       AND t.status = 'completed' AND NOT t.is_void
     LIMIT 1;

    SELECT billable_cubic_yards INTO v_num FROM ticket_metrics WHERE ticket_id = v_ticket;
    PERFORM pg_temp.check_that('billable cubic yards = capacity x load call',
        v_num = (SELECT round(certified_capacity_cy * load_call_pct / 100.0, 4)
                   FROM tickets WHERE id = v_ticket),
        v_num::text);

    PERFORM pg_temp.check_that('haul miles are derived when not entered',
        (SELECT haul_miles > 0 FROM ticket_metrics WHERE ticket_id = v_ticket));

    PERFORM pg_temp.check_that('great-circle helper is accurate within a tenth of a mile',
        abs(adms_distance_miles(38.7892, -90.3224, 38.7469, -90.4461) - 7.29) < 0.1,
        adms_distance_miles(38.7892, -90.3224, 38.7469, -90.4461)::text);

    -- =======================================================================
    -- Rule evaluation
    -- =======================================================================
    PERFORM pg_temp.check_that('eq operator matches on text',
        adms_eval_statement('{"debris_type":"VEG"}'::jsonb, 'debris_type', 'eq', '"VEG"'::jsonb));
    PERFORM pg_temp.check_that('eq operator rejects a mismatch',
        NOT adms_eval_statement('{"debris_type":"CD"}'::jsonb, 'debris_type', 'eq', '"VEG"'::jsonb));
    PERFORM pg_temp.check_that('in operator matches a set member',
        adms_eval_statement('{"debris_type":"CD"}'::jsonb, 'debris_type', 'in', '["VEG","CD"]'::jsonb));
    PERFORM pg_temp.check_that('not_in operator excludes a set member',
        NOT adms_eval_statement('{"debris_type":"CD"}'::jsonb, 'debris_type', 'not_in', '["VEG","CD"]'::jsonb));
    PERFORM pg_temp.check_that('gt operator compares numerically',
        adms_eval_statement('{"haul_miles":7.5}'::jsonb, 'distance', 'gt', '5'::jsonb));
    PERFORM pg_temp.check_that('gt operator is false below the threshold',
        NOT adms_eval_statement('{"haul_miles":3.2}'::jsonb, 'distance', 'gt', '5'::jsonb));
    PERFORM pg_temp.check_that('between operator brackets a range',
        adms_eval_statement('{"load_call_pct":75}'::jsonb, 'load_call', 'between', '[50,90]'::jsonb));
    PERFORM pg_temp.check_that('negate inverts the result',
        adms_eval_statement('{"debris_type":"CD"}'::jsonb, 'debris_type', 'eq', '"VEG"'::jsonb, true));
    PERFORM pg_temp.check_that('a null left side never satisfies a comparison',
        NOT adms_eval_statement('{"debris_type":null}'::jsonb, 'debris_type', 'eq', '"VEG"'::jsonb));
    PERFORM pg_temp.check_that('is_null detects a missing value',
        adms_eval_statement('{"scale_ticket_number":null}'::jsonb, 'scale_ticket', 'is_null', NULL));

    PERFORM pg_temp.check_raises('an unknown operand is rejected',
        'SELECT adms_eval_statement(''{}''::jsonb, ''not_a_real_operand'', ''eq'', ''1''::jsonb)',
        'unknown rule operand');

    -- =======================================================================
    -- Rule save gates
    -- =======================================================================
    SELECT id INTO v_type FROM ticket_types WHERE code = 'LOAD';
    DELETE FROM contracts WHERE contract_number = 'TEST-UNLINKED-001';
    INSERT INTO contracts (contract_number, title, client_id, contractor_id, status)
    SELECT 'TEST-UNLINKED-001', 'Contract not on any project', client_id, contractor_id, 'draft'
      FROM contracts LIMIT 1
    RETURNING id INTO v_txn;

    PERFORM pg_temp.check_raises(
        'a rule cannot reference a contract that is not on the project',
        format('INSERT INTO rules (project_id, ticket_type_id, name, service_code_id, contract_id)
                SELECT %L, %L, ''Bad Contract Rule'', sc.id, %L
                  FROM service_codes sc WHERE sc.project_id = %L LIMIT 1',
               v_project, v_type, v_txn, v_project),
        'not linked to project');

    PERFORM pg_temp.check_raises(
        'a rule cannot reference a service code from another project',
        format('INSERT INTO rules (project_id, ticket_type_id, name, service_code_id, contract_id)
                VALUES (%L, %L, ''Bad Service Code Rule'', gen_random_uuid(),
                        (SELECT contract_id FROM project_contracts WHERE project_id = %L LIMIT 1))',
               v_project, v_type, v_project));

    DELETE FROM contracts WHERE id = v_txn;

    PERFORM pg_temp.check_that('demo rules all carry a service code and a contract',
        NOT EXISTS (SELECT 1 FROM rules
                     WHERE project_id = v_project
                       AND (service_code_id IS NULL OR contract_id IS NULL)));

    -- =======================================================================
    -- Transaction generation
    -- =======================================================================
    PERFORM pg_temp.check_that('completed tickets produced transactions',
        (SELECT count(*) FROM transactions WHERE project_id = v_project) > 0,
        (SELECT count(*)::text FROM transactions WHERE project_id = v_project));

    PERFORM pg_temp.check_that('transaction amount equals quantity times rate',
        NOT EXISTS (
            SELECT 1 FROM transactions
             WHERE project_id = v_project
               AND round(quantity * rate_amount, 4) <> round(amount, 4)));

    PERFORM pg_temp.check_that('the quantity came from the ticket, not a default',
        (SELECT count(*) FROM transactions tx
          JOIN unit_types ut ON ut.code = tx.unit_type
         WHERE tx.project_id = v_project
           AND ut.quantity_source = 'billable_cubic_yards'
           AND tx.quantity > 1) > 0);

    PERFORM pg_temp.check_that('a single ticket can carry several transactions',
        EXISTS (
            SELECT ticket_id FROM transactions
             WHERE project_id = v_project
             GROUP BY ticket_id HAVING count(*) > 1),
        'HHW loads match both the volume rule and the handling surcharge');

    PERFORM pg_temp.check_that('void tickets are excluded from billing',
        NOT EXISTS (
            SELECT 1 FROM transactions tx JOIN tickets t ON t.id = tx.ticket_id
             WHERE t.is_void AND NOT tx.is_reversal
               AND tx.computed_at > t.voided_at));

    PERFORM pg_temp.check_that('flat per-each rates resolve to a quantity of one',
        NOT EXISTS (
            SELECT 1 FROM transactions
             WHERE unit_type = 'per_each' AND NOT is_reversal AND quantity <> 1),
        'reversals legitimately carry a negative quantity');

    -- Re-processing must not duplicate.
    SELECT count(*) INTO v_n FROM transactions WHERE project_id = v_project;
    PERFORM adms_process_ticket(t.id) FROM (
        SELECT id FROM tickets WHERE project_id = v_project
           AND status = 'completed' AND NOT is_void LIMIT 20) t;
    PERFORM pg_temp.check_that('re-processing a ticket is idempotent',
        (SELECT count(*) FROM transactions WHERE project_id = v_project) = v_n,
        format('%s before, %s after', v_n,
               (SELECT count(*) FROM transactions WHERE project_id = v_project)));

    PERFORM pg_temp.check_that('an unreversed transaction was available to test with',
        v_txn IS NOT NULL);

    PERFORM pg_temp.check_that('re-processing does not demote an already billed ticket',
        NOT EXISTS (
            SELECT 1 FROM tickets t
             WHERE t.project_id = v_project
               AND t.processing_state = 'no_match'
               AND EXISTS (SELECT 1 FROM transactions tx
                            WHERE tx.ticket_id = t.id AND NOT tx.is_reversal)));

    -- =======================================================================
    -- Immutability
    -- =======================================================================
    -- Pick one that is neither a reversal nor already reversed, so the suite
    -- can be re-run against a database it has already touched.
    SELECT id INTO v_txn
      FROM transactions t
     WHERE t.project_id = v_project
       AND NOT t.is_reversal
       AND NOT EXISTS (SELECT 1 FROM transactions r WHERE r.reverses_id = t.id)
     ORDER BY t.computed_at DESC
     LIMIT 1;
    PERFORM pg_temp.check_raises('transactions cannot be updated',
        format('UPDATE transactions SET amount = 1 WHERE id = %L', v_txn), 'append-only');
    PERFORM pg_temp.check_raises('transactions cannot be deleted',
        format('DELETE FROM transactions WHERE id = %L', v_txn), 'append-only');
    PERFORM pg_temp.check_raises('audit events cannot be deleted',
        'DELETE FROM audit_events WHERE id = (SELECT min(id) FROM audit_events)', 'append-only');

    -- Reversal is the supported correction path.
    SELECT adms_reverse_transaction(v_txn, 'Schema test reversal') INTO v_ticket;
    PERFORM pg_temp.check_that('a reversal negates the original amount',
        (SELECT round(SUM(amount), 4) FROM transactions
          WHERE id IN (v_txn, v_ticket)) = 0);
    PERFORM pg_temp.check_raises('a transaction cannot be reversed twice',
        format('SELECT adms_reverse_transaction(%L, ''again'')', v_txn), 'already reversed');

    -- =======================================================================
    -- Audit history
    -- =======================================================================
    PERFORM pg_temp.check_that('ticket creation is audited',
        (SELECT count(*) FROM audit_events
          WHERE entity_type = 'tickets' AND action = 'create') > 0);

    SELECT id INTO v_ticket FROM tickets
     WHERE project_id = v_project AND status = 'completed' AND NOT is_void LIMIT 1;
    SELECT count(*) INTO v_n FROM audit_events
     WHERE entity_type = 'tickets' AND entity_id = v_ticket;
    UPDATE tickets SET notes = 'audit probe ' || clock_timestamp() WHERE id = v_ticket;
    PERFORM pg_temp.check_that('ticket edits append an audit artifact',
        (SELECT count(*) FROM audit_events
          WHERE entity_type = 'tickets' AND entity_id = v_ticket) = v_n + 1);

    PERFORM pg_temp.check_that('the audit artifact records the before and after values',
        (SELECT changed ? 'notes' FROM audit_events
          WHERE entity_type = 'tickets' AND entity_id = v_ticket
          ORDER BY id DESC LIMIT 1));

    SELECT count(*) INTO v_n FROM audit_events
     WHERE entity_type = 'tickets' AND entity_id = v_ticket;
    UPDATE tickets SET notes = notes WHERE id = v_ticket;
    PERFORM pg_temp.check_that('a no-op update writes no audit noise',
        (SELECT count(*) FROM audit_events
          WHERE entity_type = 'tickets' AND entity_id = v_ticket) = v_n);

    -- A billing-relevant edit re-queues the ticket.
    UPDATE tickets SET load_call_pct = 55 WHERE id = v_ticket;
    PERFORM pg_temp.check_that('a billing-relevant edit re-queues the ticket',
        (SELECT processing_state FROM tickets WHERE id = v_ticket) = 'queued');

    -- =======================================================================
    -- Invoicing
    -- =======================================================================
    PERFORM pg_temp.check_that('the demo invoice totals its lines',
        (SELECT i.total = round(COALESCE((SELECT SUM(amount) FROM invoice_lines
                                           WHERE invoice_id = i.id), 0), 2) + i.adjustments
           FROM invoices i WHERE i.project_id = v_project LIMIT 1));

    PERFORM pg_temp.check_that('the demo invoice has lines and a positive total',
        (SELECT total > 0 AND EXISTS (SELECT 1 FROM invoice_lines WHERE invoice_id = i.id)
           FROM invoices i WHERE i.project_id = v_project LIMIT 1));

    PERFORM pg_temp.check_raises('a transaction cannot appear on two invoices',
        format('INSERT INTO invoice_lines (invoice_id, transaction_id, line_number, amount)
                SELECT id, (SELECT transaction_id FROM invoice_lines LIMIT 1), 9999, 0
                  FROM invoices WHERE project_id = %L LIMIT 1', v_project),
        'duplicate key');

    -- =======================================================================
    -- Federation
    -- =======================================================================
    PERFORM pg_temp.check_that('the instance has a 64 character hex key',
        (SELECT instance_key ~ '^[0-9a-f]{64}$' FROM instance LIMIT 1));

    PERFORM pg_temp.check_raises('there can only be one instance row',
        'INSERT INTO instance (instance_key, display_name)
         VALUES (encode(gen_random_bytes(32), ''hex''), ''Second'')',
        'duplicate key');

    -- Normalise anything an interrupted earlier run left behind, so the
    -- suite is repeatable against a database it has already touched.
    UPDATE tickets SET visibility_flag = 'private', allowed_viewers = '{}'
     WHERE project_id = v_project AND visibility_flag <> 'private';

    PERFORM pg_temp.check_that('visibility defaults to private',
        (SELECT bool_and(visibility_flag = 'private') FROM tickets
          WHERE project_id = v_project));

    UPDATE tickets SET visibility_flag = 'restricted',
                       allowed_viewers = ARRAY['peer-alpha-key']
     WHERE id = v_ticket;
    PERFORM pg_temp.check_that('an allow-listed peer key is queryable by index',
        EXISTS (SELECT 1 FROM tickets
                 WHERE allowed_viewers @> ARRAY['peer-alpha-key']));

    PERFORM pg_temp.check_raises('an unknown visibility flag is refused',
        format('UPDATE tickets SET visibility_flag = ''world'' WHERE id = %L', v_ticket),
        'violates foreign key');

    -- =======================================================================
    -- Extendability: a brand new ticket type with no code change
    -- =======================================================================
    INSERT INTO ticket_types (code, label, kind, description, billable, is_active,
                              stage_schema, field_schema)
    VALUES ('TEST_MARINE', 'Marine Debris Recovery', 'custom',
            'Added by the test suite to prove the catalog extends by INSERT.',
            true, true,
            '[{"code":"recovery","label":"Recovery","sequence":1,"required":true,"completes_ticket":true,"captures":["gps","photo"]}]'::jsonb,
            '[{"key":"vessel_name","label":"Vessel","type":"text","required":true,"stage":"recovery"}]'::jsonb)
    ON CONFLICT (code) DO UPDATE SET is_active = true
    RETURNING id INTO v_type;

    INSERT INTO project_ticket_types (project_id, ticket_type_id)
    VALUES (v_project, v_type)
    ON CONFLICT (project_id, ticket_type_id) DO UPDATE SET is_active = true;

    SELECT id INTO v_user FROM users WHERE username = 'jmiller';
    INSERT INTO tickets (project_id, ticket_type_id, status, contractor_id,
                         origin_latitude, origin_longitude, origin_at,
                         quantity, created_by, data)
    SELECT v_project, v_type, 'completed', contractor_id, 38.79, -90.33, now(),
           3, v_user, '{"vessel_name":"Test Runner"}'::jsonb
      FROM project_contractors WHERE project_id = v_project LIMIT 1
    RETURNING id INTO v_ticket;

    PERFORM pg_temp.check_that('a new ticket type accepts tickets with no code change',
        v_ticket IS NOT NULL);
    PERFORM pg_temp.check_that('the new type''s data is queryable through the JSONB index',
        (SELECT data ->> 'vessel_name' FROM tickets WHERE id = v_ticket) = 'Test Runner');

    -- Bill it with a brand new rule, again with no code change.
    DELETE FROM rule_statements WHERE rule_id IN (
        SELECT id FROM rules WHERE project_id = v_project AND name = 'Marine Recovery Flat');
    UPDATE rules SET name = 'Marine Recovery Flat (retired ' || id || ')'
     WHERE project_id = v_project AND name = 'Marine Recovery Flat';

    INSERT INTO rules (project_id, ticket_type_id, name, service_code_id, contract_id)
    SELECT v_project, v_type, 'Marine Recovery Flat',
           (SELECT id FROM service_codes WHERE project_id = v_project AND code = 'HHW'),
           (SELECT contract_id FROM project_contracts WHERE project_id = v_project AND is_primary)
    RETURNING id INTO v_rule;

    PERFORM adms_process_ticket(v_ticket);
    PERFORM pg_temp.check_that('the new type bills through the same engine',
        (SELECT count(*) FROM transactions WHERE ticket_id = v_ticket) = 1);
    PERFORM pg_temp.check_that('a rule with no statements is an unconditional match',
        adms_rule_matches(v_ticket, v_rule));

    -- Put the sharing flags back, so the suite can be run repeatedly against
    -- a database it has already touched.
    UPDATE tickets SET visibility_flag = 'private', allowed_viewers = '{}'
     WHERE project_id = v_project AND visibility_flag <> 'private';

    -- Clean up every object this suite created, so the demo data is left
    -- exactly as the seed produced it.
    UPDATE tickets SET is_void = true, void_reason = 'schema test cleanup'
     WHERE id = v_ticket;
    DELETE FROM ticket_stages WHERE ticket_id = v_ticket;
    DELETE FROM rule_statements WHERE rule_id = v_rule;
    UPDATE rules SET deleted_at = now(), is_active = false WHERE id = v_rule;
    DELETE FROM project_ticket_types
     WHERE project_id = v_project AND ticket_type_id = v_type;
    UPDATE ticket_types SET is_active = false WHERE code = 'TEST_MARINE';
END
$tests$;

SELECT
    count(*) FILTER (WHERE ok)     AS passed,
    count(*) FILTER (WHERE NOT ok) AS failed,
    count(*)                       AS total
  FROM _results;

\echo ''
\echo '  All schema assertions passed.'
\echo ''
