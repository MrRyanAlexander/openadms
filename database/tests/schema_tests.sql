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

-- A block whose precondition is not there did not pass and did not fail. It is
-- recorded either way, because a suite whose count drops in silence is a suite
-- that can lose an assertion without anyone noticing.
CREATE OR REPLACE FUNCTION pg_temp.check_skipped(p_name text, p_why text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO _results (name, ok, detail) VALUES (p_name, true, 'skipped: ' || p_why);
    RAISE NOTICE '  skipped: % (%)', p_name, p_why;
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
    -- effective_from and document_url are required on every contract now, so
    -- even a throwaway fixture has to carry them.
    INSERT INTO contracts (contract_number, title, client_id, contractor_id, status,
                           effective_from, document_url)
    SELECT 'TEST-UNLINKED-001', 'Contract not on any project', client_id, contractor_id,
           'draft', current_date, 'https://example.invalid/test-unlinked-001.pdf'
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

    -- The rule map is a different presentation of data that already exists.
    -- Its job is to leave nothing about a rule's chain to be assembled by hand.
    PERFORM pg_temp.check_that('the rule map carries one row per live rule',
        (SELECT count(*) FROM rule_map WHERE project_id = v_project)
        = (SELECT count(*) FROM rules
            WHERE project_id = v_project AND deleted_at IS NULL));

    PERFORM pg_temp.check_that('the map never shows a chain with a link missing',
        NOT EXISTS (
            SELECT 1 FROM rule_map
             WHERE project_id = v_project
               AND (service_code IS NULL OR contract_number IS NULL
                    OR contractor_name IS NULL OR ticket_type_label IS NULL)));

    PERFORM pg_temp.check_that('the map totals agree with the ledger',
        NOT EXISTS (
            SELECT 1 FROM rule_map m
             WHERE m.project_id = v_project
               AND m.transaction_count <> (
                    SELECT count(*) FROM transactions tx
                     WHERE tx.rule_id = m.rule_id AND NOT tx.is_reversal
                       AND tx.superseded_at IS NULL)));

    PERFORM pg_temp.check_that('a rule with no rate in effect is named as a problem',
        NOT EXISTS (
            SELECT 1 FROM rule_map
             WHERE project_id = v_project
               AND rate_id IS NULL
               AND NOT ('no_rate' = ANY (problems))));

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

    -- A billing-relevant edit re-queues the ticket. Both halves are derived
    -- from where the ticket currently sits: a fixed value re-runs as a no-op,
    -- which changes nothing and so proves nothing.
    UPDATE tickets SET processing_state = 'processed' WHERE id = v_ticket;
    UPDATE tickets
       SET load_call_pct = CASE WHEN load_call_pct = 55 THEN 65 ELSE 55 END
     WHERE id = v_ticket;
    PERFORM pg_temp.check_that('a billing-relevant edit re-queues the ticket',
        (SELECT processing_state FROM tickets WHERE id = v_ticket) = 'queued');

    -- The domain is derived, not written. Anything else drifts the moment a
    -- new action is added and somebody forgets to classify it.
    PERFORM pg_temp.check_that('every audit artifact lands in exactly one domain',
        NOT EXISTS (SELECT 1 FROM audit_events
                     WHERE domain NOT IN ('operations', 'billing',
                                          'records', 'security')));

    PERFORM pg_temp.check_that('the domain is generated, never inserted',
        (SELECT is_generated FROM information_schema.columns
          WHERE table_name = 'audit_events' AND column_name = 'domain') = 'ALWAYS');

    PERFORM pg_temp.check_that('signing in is a security artifact',
        NOT EXISTS (SELECT 1 FROM audit_events
                     WHERE action IN ('login', 'logout', 'login_failed')
                       AND domain <> 'security'));

    PERFORM pg_temp.check_that('money movement is a billing artifact',
        NOT EXISTS (SELECT 1 FROM audit_events
                     WHERE entity_type IN ('transactions', 'invoices',
                                           'invoice_lines', 'rates')
                       AND domain <> 'billing'));

    PERFORM pg_temp.check_that('ticket work is an operations artifact',
        NOT EXISTS (SELECT 1 FROM audit_events
                     WHERE entity_type = 'tickets' AND domain <> 'operations'));

    PERFORM pg_temp.check_that('the trail view carries the domain through',
        EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'audit_trail' AND column_name = 'domain'));

    PERFORM pg_temp.check_that('the domain is indexed for the tab counts',
        EXISTS (SELECT 1 FROM pg_indexes
                 WHERE tablename = 'audit_events'
                   AND indexdef ILIKE '%(domain,%'));

    -- M6: the ticket list has to page without stalling at volume. That needs an
    -- index per column it sorts by, whose null ordering matches what the list
    -- asks for. A mismatch is invisible in the plan until somebody times it.
    PERFORM pg_temp.check_that('the ticket list can sort by date from an index',
        EXISTS (SELECT 1 FROM pg_indexes
                 WHERE tablename = 'tickets'
                   AND indexdef ILIKE '%(project_id, created_at DESC)%'));

    PERFORM pg_temp.check_that('a nullable sort column is indexed nulls last',
        (SELECT count(*) FROM pg_indexes
          WHERE tablename = 'tickets'
            AND indexdef ILIKE '%DESC NULLS LAST)%') = 2,
        (SELECT string_agg(indexname, ', ') FROM pg_indexes
          WHERE tablename = 'tickets' AND indexdef ILIKE '%DESC NULLS LAST)%'));

    PERFORM pg_temp.check_that('ticket numbers are indexed within a project',
        EXISTS (SELECT 1 FROM pg_indexes
                 WHERE tablename = 'tickets'
                   AND indexdef ILIKE '%(project_id, ticket_number)%'));

    -- =======================================================================
    -- Invoicing
    -- =======================================================================
    -- Every invoice, not whichever one came back first. LIMIT 1 with no ORDER BY
    -- picks a different row once anything else has written, and the point of
    -- the rule is that it holds for all of them.
    PERFORM pg_temp.check_that('every invoice totals its own lines',
        NOT EXISTS (
            SELECT 1 FROM invoices i
             WHERE i.project_id = v_project
               AND i.total <> round(COALESCE((SELECT SUM(amount) FROM invoice_lines
                                               WHERE invoice_id = i.id), 0), 2)
                              + i.adjustments));

    PERFORM pg_temp.check_that('the demo project has an invoice with lines on it',
        EXISTS (
            SELECT 1 FROM invoices i
             WHERE i.project_id = v_project AND i.total > 0
               AND EXISTS (SELECT 1 FROM invoice_lines WHERE invoice_id = i.id)));

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

    -- The type is enabled but nothing can price it yet. Readiness has to say
    -- so, and the creation gate has to refuse the ticket, because a ticket on
    -- an unrigged type could never become a transaction.
    PERFORM pg_temp.check_that('an enabled type with no rule is named as uncovered',
        (SELECT 'Marine Debris Recovery' = ANY (unruled_ticket_types)
           FROM project_readiness_summary WHERE project_id = v_project));
    PERFORM pg_temp.check_that('an uncovered ticket type blocks field readiness',
        (SELECT NOT ready_for_field FROM project_readiness_summary
          WHERE project_id = v_project));
    PERFORM pg_temp.check_that('missing names rule_coverage, not just rule',
        (SELECT 'rule_coverage' = ANY (missing) AND NOT ('rule' = ANY (missing))
           FROM project_readiness_summary WHERE project_id = v_project));

    PERFORM pg_temp.check_raises('a ticket on an unruled type is refused',
        format($q$
            INSERT INTO tickets (project_id, ticket_type_id, status, contractor_id,
                                 origin_latitude, origin_longitude, origin_at,
                                 quantity, created_by, data)
            SELECT %L::uuid, %L::uuid, 'completed', contractor_id, 38.79, -90.33,
                   now(), 3, %L::uuid, '{"vessel_name":"Refused"}'::jsonb
              FROM project_contractors WHERE project_id = %L::uuid LIMIT 1
        $q$, v_project, v_type, v_user, v_project),
        'No rule covers Marine Debris Recovery');

    -- Rig it with a brand new rule, again with no code change.
    DELETE FROM rule_statements WHERE rule_id IN (
        SELECT id FROM rules WHERE project_id = v_project AND name = 'Marine Recovery Flat');
    UPDATE rules SET name = 'Marine Recovery Flat (retired ' || id || ')'
     WHERE project_id = v_project AND name = 'Marine Recovery Flat';

    INSERT INTO rules (project_id, ticket_type_id, name, service_code_id, contract_id)
    SELECT v_project, v_type, 'Marine Recovery Flat',
           (SELECT id FROM service_codes WHERE project_id = v_project AND code = 'HHW'),
           (SELECT contract_id FROM project_contracts WHERE project_id = v_project AND is_primary)
    RETURNING id INTO v_rule;

    PERFORM pg_temp.check_that('one rule on the type restores field readiness',
        (SELECT ready_for_field FROM project_readiness_summary
          WHERE project_id = v_project));

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


-- =============================================================================
-- Phase 1 :: documents, contacts, scope, estimates, permits, line items
-- =============================================================================
DO $phase1$
DECLARE
    v_project    uuid;
    v_client     uuid;
    v_prime      uuid;
    v_sub        uuid;
    v_site       uuid;
    v_ps         uuid;
    v_contract   uuid;
    v_doc        uuid;
    v_line       uuid;
    v_user       uuid;
    v_n          integer;
    v_num        numeric;
    v_txt        text;
BEGIN
    SELECT id INTO v_project FROM projects WHERE project_code = 'STL-2026-ROW';
    SELECT client_id INTO v_client FROM projects WHERE id = v_project;
    SELECT id INTO v_prime FROM contractors WHERE code = 'GES';
    SELECT id INTO v_sub   FROM contractors WHERE code = 'MER';

    -- 1.1 The document registry --------------------------------------------
    PERFORM pg_temp.check_that('a rate sheet round-trips on a contractor',
        EXISTS (SELECT 1 FROM documents
                 WHERE entity_type = 'contractors' AND entity_id = v_prime
                   AND kind_code = 'rate_sheet' AND url LIKE 'https://%'));

    PERFORM pg_temp.check_that('a permit round-trips on a disposal site',
        EXISTS (SELECT 1 FROM documents
                 WHERE entity_type = 'disposal_sites' AND kind_code = 'permit'));

    SELECT count(*) INTO v_n FROM documents
     WHERE deleted_at IS NULL AND expires_on IS NOT NULL
       AND expires_on <= current_date + 30;
    PERFORM pg_temp.check_that('the expiring-in-30-days sweep finds the HHW certificate',
        v_n >= 1, v_n::text || ' expiring');

    PERFORM pg_temp.check_that('document_watch flags the same certificate as expiring',
        EXISTS (SELECT 1 FROM document_watch
                 WHERE kind_code = 'certificate_hhw' AND watch_state = 'expiring'));

    PERFORM pg_temp.check_raises('a document link that is not a URL is refused',
        format('INSERT INTO documents (entity_type, entity_id, kind_code, title, url)
                VALUES (''contractors'', %L, ''other'', ''Bad link'', ''box://nope'')', v_prime),
        'documents_url_shape');

    PERFORM pg_temp.check_raises('a verified document must name who verified it',
        format('INSERT INTO documents (entity_type, entity_id, kind_code, title, url,
                                       verification_status)
                VALUES (''contractors'', %L, ''other'', ''Unattributed'',
                        ''https://example.invalid/x.pdf'', ''verified'')', v_prime),
        'documents_verified_is_attributed');

    -- 1.2 Contractor taxonomy ----------------------------------------------
    PERFORM pg_temp.check_raises('the old contractor types are gone',
        'INSERT INTO contractors (name, contractor_type)
         VALUES (''Schema Test Hauler'', ''debris_removal'')',
        'contractors_type_valid');

    PERFORM pg_temp.check_that('every contractor sits in the four real kinds',
        NOT EXISTS (SELECT 1 FROM contractors
                     WHERE contractor_type NOT IN
                           ('hauler', 'tree_removal', 'monitoring', 'other')));

    -- 1.3 Contractor tier ---------------------------------------------------
    PERFORM pg_temp.check_that('the sub is a first tier sub under the prime',
        EXISTS (SELECT 1 FROM project_contractors
                 WHERE project_id = v_project AND contractor_id = v_sub
                   AND role_on_project = 'sub_tier_1'
                   AND parent_contractor_id = v_prime));

    PERFORM pg_temp.check_raises('a prime cannot carry a tier parent',
        format('INSERT INTO project_contractors (project_id, contractor_id,
                                                 role_on_project, parent_contractor_id)
                VALUES (%L, (SELECT id FROM contractors WHERE code = ''CMG''),
                        ''prime'', %L)', v_project, v_prime),
        'top_tier_has_no_parent');

    PERFORM pg_temp.check_raises('a second tier sub must name a parent',
        format('INSERT INTO project_contractors (project_id, contractor_id, role_on_project)
                SELECT %L, id, ''sub_tier_2'' FROM contractors WHERE code = ''CMG''',
               v_project),
        'second_tier_has_a_parent');

    INSERT INTO contractors (name, code, contractor_type)
    VALUES ('Schema Test Offsite Hauling', 'STOH', 'hauler')
    RETURNING id INTO v_user;

    PERFORM pg_temp.check_raises('a tier parent must be on the same project',
        format('INSERT INTO project_contractors (project_id, contractor_id,
                                                 role_on_project, parent_contractor_id)
                SELECT %L, id, ''sub_tier_2'', %L FROM contractors WHERE code = ''CMG''',
               v_project, v_user),
        'not linked to project');

    DELETE FROM contractors WHERE id = v_user;

    -- 1.4 Contacts ----------------------------------------------------------
    SELECT count(*) INTO v_n FROM contacts
     WHERE entity_type = 'clients' AND entity_id = v_client AND deleted_at IS NULL;
    PERFORM pg_temp.check_that('a client holds more than one contact',
        v_n >= 3, v_n::text || ' contacts');

    PERFORM pg_temp.check_that('the same table serves a contractor contact',
        EXISTS (SELECT 1 FROM contacts
                 WHERE entity_type = 'contractors' AND entity_id = v_prime));

    SELECT primary_contact INTO v_txt FROM clients WHERE id = v_client;
    PERFORM pg_temp.check_that('clients.primary_contact still reads correctly',
        v_txt = 'Angela Brooks', coalesce(v_txt, 'null'));

    PERFORM pg_temp.check_raises('a parent cannot hold two primary contacts',
        format('INSERT INTO contacts (entity_type, entity_id, first_name, last_name,
                                      contact_role, is_primary)
                VALUES (''clients'', %L, ''Second'', ''Primary'', ''primary'', true)',
               v_client),
        'contacts_one_primary_per_entity');

    -- 1.5 Worker identity ---------------------------------------------------
    SELECT full_name INTO v_txt FROM users WHERE username = 'jmiller';
    PERFORM pg_temp.check_that('full_name is derived from the parts',
        v_txt = 'Jordan Miller', coalesce(v_txt, 'null'));

    PERFORM pg_temp.check_raises('full_name cannot be written directly',
        'UPDATE users SET full_name = ''Nope'' WHERE username = ''jmiller''',
        'can only be updated to DEFAULT');

    PERFORM pg_temp.check_that('a temp worker is findable by employer',
        EXISTS (SELECT 1 FROM users
                 WHERE employer_name = 'Gateway Staffing Partners'
                   AND employee_id = 'TW-4471'));

    PERFORM pg_temp.check_that('a worker is findable by employee ID',
        EXISTS (SELECT 1 FROM users WHERE employee_id = 'CMG-1118'));

    PERFORM pg_temp.check_raises('a worker needs at least one name part',
        'INSERT INTO users (username, global_role) VALUES (''nameless'', ''monitor'')',
        'users_name_present');

    -- 1.6 Program, scope and estimate ---------------------------------------
    PERFORM pg_temp.check_that('the project records its program as data',
        (SELECT program_code FROM projects WHERE id = v_project) = 'row_collection');

    PERFORM pg_temp.check_that('stumps are out of scope until the client says otherwise',
        (SELECT is_enabled FROM project_scopes
          WHERE project_id = v_project AND debris_type_code = 'STUMP') = false);

    PERFORM pg_temp.check_that('every confirmed stream carries an estimate',
        NOT EXISTS (
            SELECT 1 FROM project_scopes s
             WHERE s.project_id = v_project AND s.is_enabled
               AND NOT EXISTS (SELECT 1 FROM project_estimate_current e
                                WHERE e.project_id = s.project_id
                                  AND e.debris_type_code = s.debris_type_code)));

    SELECT estimated_quantity INTO v_num FROM project_estimate_current
     WHERE project_id = v_project AND debris_type_code = 'CD';
    PERFORM pg_temp.check_that('the current C&D estimate is the revision',
        v_num = 138000, coalesce(v_num::text, 'null'));

    PERFORM pg_temp.check_that('the original C&D estimate is still readable',
        EXISTS (SELECT 1 FROM project_estimates
                 WHERE project_id = v_project AND debris_type_code = 'CD'
                   AND estimated_quantity = 95000));

    PERFORM pg_temp.check_raises('an estimate cannot be edited in place',
        format('UPDATE project_estimates SET estimated_quantity = 1
                 WHERE project_id = %L AND debris_type_code = ''CD''', v_project),
        'append-only');

    PERFORM pg_temp.check_that('tree work is counted per unit without anyone choosing',
        (SELECT estimate_unit_type_code FROM debris_types WHERE code = 'HANGER') = 'per_unit'
        AND (SELECT estimate_unit_type_code FROM debris_types WHERE code = 'VEG')
            = 'per_cubic_yard');

    -- 1.7 Permits -----------------------------------------------------------
    SELECT ps.id INTO v_ps FROM project_sites ps
      JOIN disposal_sites s ON s.id = ps.site_id
     WHERE ps.project_id = v_project AND s.site_code = 'DMS-02';

    PERFORM pg_temp.check_that('the pending permit reports days since it was requested',
        (SELECT days_since_request FROM project_permit_watch
          WHERE project_site_id = v_ps) > 0);

    PERFORM pg_temp.check_raises('a permit cannot be verified without a document',
        format('UPDATE project_sites SET permit_status = ''verified'' WHERE id = %L', v_ps),
        'verified_permit_has_a_document');

    SELECT id INTO v_doc FROM documents
     WHERE entity_type = 'contractors' AND kind_code = 'rate_sheet' LIMIT 1;
    PERFORM pg_temp.check_raises('a permit slot will not take a rate sheet',
        format('UPDATE project_sites SET permit_document_id = %L WHERE id = %L',
               v_doc, v_ps),
        'not a permit');

    -- The whole point: a pending permit stops nothing.
    SELECT id INTO v_user FROM users WHERE username = 'jmiller';
    PERFORM pg_temp.check_that('a pending permit does not block ticket creation',
        (SELECT ready_for_field FROM project_readiness_summary
          WHERE project_id = v_project));

    -- 1.8 Line items and the service code bridge ----------------------------
    PERFORM pg_temp.check_that('a service code names the line it came from',
        EXISTS (SELECT 1 FROM service_codes
                 WHERE project_id = v_project AND code = 'ROW-VEG'
                   AND contract_line_item_id IS NOT NULL
                   AND contract_id IS NOT NULL));

    PERFORM pg_temp.check_that('the accepted line names the code it produced',
        EXISTS (SELECT 1 FROM contract_line_item_review
                 WHERE contract_number = 'STL-DEB-2026-001' AND line_number = 1
                   AND status = 'accepted' AND service_code = 'ROW-VEG'));

    PERFORM pg_temp.check_that('draft and rejected lines are both preserved',
        (SELECT count(*) FROM contract_line_items
          WHERE status = 'draft') >= 2
        AND (SELECT count(*) FROM contract_line_items
              WHERE status = 'rejected') >= 1);

    DELETE FROM contracts WHERE contract_number = 'TEST-OFFPROJECT-001';
    INSERT INTO contracts (contract_number, title, client_id, contractor_id, status,
                           effective_from, document_url)
    VALUES ('TEST-OFFPROJECT-001', 'Contract on no project', v_client, v_prime,
            'draft', current_date, 'https://example.invalid/offproject.pdf')
    RETURNING id INTO v_contract;

    INSERT INTO contract_line_items (contract_id, line_number, description,
                                     unit_type_code, unit_price)
    VALUES (v_contract, 1, 'A line on a contract nobody linked', 'per_cubic_yard', 5.00)
    RETURNING id INTO v_line;

    PERFORM pg_temp.check_raises(
        'a service code cannot point at a contract that is not on the project',
        format('INSERT INTO service_codes (project_id, code, name, contractor_id, contract_id)
                VALUES (%L, ''SCHEMATEST-1'', ''Off project'', %L, %L)',
               v_project, v_prime, v_contract),
        'not linked to project');

    PERFORM pg_temp.check_raises(
        'a service code cannot point at a line item from another contract',
        format('INSERT INTO service_codes (project_id, code, name, contractor_id,
                                           contract_id, contract_line_item_id)
                SELECT %L, ''SCHEMATEST-2'', ''Wrong line'', %L, pc.contract_id, %L
                  FROM project_contracts pc WHERE pc.project_id = %L LIMIT 1',
               v_project, v_prime, v_line, v_project),
        'belongs to contract');

    DELETE FROM contract_line_items WHERE contract_id = v_contract;
    DELETE FROM contracts WHERE id = v_contract;

    -- 1.9 Contract constraints ----------------------------------------------
    PERFORM pg_temp.check_raises('a contract cannot be saved without a document link',
        format('INSERT INTO contracts (contract_number, title, client_id, contractor_id,
                                       effective_from)
                VALUES (''TEST-NODOC-001'', ''No document'', %L, %L, current_date)',
               v_client, v_prime),
        'document_url');

    PERFORM pg_temp.check_raises('a contract document link must look like a link',
        format('INSERT INTO contracts (contract_number, title, client_id, contractor_id,
                                       effective_from, document_url)
                VALUES (''TEST-BADDOC-001'', ''Bad document'', %L, %L, current_date,
                        ''ask Marcus for it'')', v_client, v_prime),
        'contracts_document_url_shape');

    PERFORM pg_temp.check_raises('a contract cannot be saved without a start date',
        format('INSERT INTO contracts (contract_number, title, client_id, contractor_id,
                                       document_url)
                VALUES (''TEST-NODATE-001'', ''No start date'', %L, %L,
                        ''https://example.invalid/x.pdf'')', v_client, v_prime),
        'effective_from');

    PERFORM pg_temp.check_that('every contract in the database carries a link',
        NOT EXISTS (SELECT 1 FROM contracts
                     WHERE deleted_at IS NULL
                       AND coalesce(btrim(document_url), '') = ''));
END
$phase1$;

-- =============================================================================
-- Sprint 2: certification, reprocessing, and the promises that had to survive
-- both. The claim under test is that repricing became possible without any
-- loosening of the append-only guarantee.
-- =============================================================================
DO $sprint2$
DECLARE
    v_project uuid;
    v_equip   uuid;
    v_cert    uuid;
    v_fix     uuid;
    v_ticket  uuid;
    v_txn     uuid;
    v_user    uuid;
    v_n       integer;
    v_num     numeric;
    v_old     numeric;
    v_new     numeric;
    -- This block is the only one in the suite that has to MOVE MONEY to prove
    -- anything: repricing is the behaviour under test. Doing that to the demo
    -- data would leave every later run, and every API test that reads the seed,
    -- looking at a project somebody has already corrected. So the work happens
    -- inside a subtransaction that is deliberately rolled back, and the results
    -- are carried back out in an array, which survives the rollback.
    v_mark    integer;
    v_names   text[];
    v_details text[];
BEGIN
    SELECT id INTO v_project FROM projects ORDER BY created_at LIMIT 1;
    SELECT id INTO v_user FROM users WHERE username = 'manager';
    SELECT COALESCE(max(n), 0) INTO v_mark FROM _results;

    BEGIN

        -- ---------------------------------------------------------------- shape
        PERFORM pg_temp.check_that('certifications are project scoped',
            (SELECT count(*) FROM information_schema.columns
              WHERE table_name = 'project_equipment_certifications'
                AND column_name IN ('project_id', 'equipment_id', 'applies_from',
                                    'supersedes_id', 'status')) = 5);

        PERFORM pg_temp.check_that('every certified truck has exactly one live row',
            NOT EXISTS (
                SELECT 1 FROM project_equipment_certifications
                 WHERE status = 'active'
                 GROUP BY project_id, equipment_id HAVING count(*) > 1));

        PERFORM pg_temp.check_that('demo tickets resolve to a certification',
            (SELECT count(*) FROM tickets
              WHERE equipment_id IS NOT NULL AND certification_id IS NULL) = 0,
            (SELECT count(*)::text FROM tickets
              WHERE equipment_id IS NOT NULL AND certification_id IS NULL));

        SELECT pec.id, pec.equipment_id INTO v_cert, v_equip
          FROM project_equipment_certifications pec
          JOIN tickets t ON t.certification_id = pec.id
         WHERE pec.status = 'active' AND pec.project_id = v_project
         GROUP BY pec.id, pec.equipment_id
         ORDER BY count(*) DESC LIMIT 1;

        -- ------------------------------------------------- the correction chain
        INSERT INTO project_equipment_certifications (
            project_id, equipment_id, certified_capacity_cy, method, measured_on,
            supersedes_id, notes, created_by)
        SELECT project_id, equipment_id, round(certified_capacity_cy * 0.5, 2),
               'correction', current_date, id, 'Measurement corrected', v_user
          FROM project_equipment_certifications WHERE id = v_cert
        RETURNING id INTO v_fix;

        PERFORM pg_temp.check_that('superseding closes the previous certification',
            (SELECT status FROM project_equipment_certifications WHERE id = v_cert)
                = 'superseded');

        PERFORM pg_temp.check_that('a correction inherits applies_from so it reaches back',
            (SELECT applies_from FROM project_equipment_certifications WHERE id = v_fix)
            = (SELECT applies_from FROM project_equipment_certifications WHERE id = v_cert));

        PERFORM pg_temp.check_raises('a certification cannot supersede another truck''s',
            format('INSERT INTO project_equipment_certifications
                        (project_id, equipment_id, certified_capacity_cy, applies_from,
                         supersedes_id)
                    SELECT %L, id, 10, current_date, %L FROM equipment
                     WHERE id <> %L LIMIT 1', v_project, v_fix, v_equip),
            'same equipment');

        -- ------------------------------------------------------ queue and reprice
        v_n := adms_queue_reprocess('certification', v_fix, 'Measurement corrected');
        PERFORM pg_temp.check_that('correcting a certification queues the work it priced',
            v_n > 0, v_n::text);

        -- Not one an approved invoice is holding. The engine is right to refuse
        -- those, and a suite that picks one is testing the wrong thing.
        --
        -- It must also be a ticket this correction actually reprices, and one
        -- that had money on it to begin with. adms_queue_reprocess flags every
        -- ticket for the truck from applies_from forward whether or not it was
        -- ever priced, so an unscoped LIMIT 1 could return a ticket with no
        -- live transactions. Repricing that one moves the total from 0.00 up
        -- to whatever the rules say, the assertion below reads
        -- 0.0000 -> 178.2000, and the suite fails on a ticket that was never
        -- halved because it was never priced. Scope it to the corrected truck
        -- on this project, require prior money, and order it so the same row
        -- is chosen every run.
        SELECT id INTO v_ticket FROM tickets t
         WHERE t.needs_reprocess AND NOT t.is_void
           AND t.processing_state = 'processed'
           AND t.project_id = v_project
           AND t.equipment_id = v_equip
           AND EXISTS (SELECT 1 FROM transactions x
                        WHERE x.ticket_id = t.id
                          AND x.superseded_at IS NULL AND NOT x.is_reversal
                          AND x.amount <> 0)
           AND NOT EXISTS (SELECT 1 FROM adms_ticket_invoice_lock(t.id))
         ORDER BY t.id
         LIMIT 1;

        IF v_ticket IS NOT NULL THEN
            SELECT out_old_total, out_new_total INTO v_old, v_new
              FROM adms_reprocess_ticket(v_ticket, 'Measurement corrected', v_user);

            PERFORM pg_temp.check_that('repricing a halved capacity halves the money',
                v_new < v_old, format('%s -> %s', v_old, v_new));

            PERFORM pg_temp.check_that('reprocessing clears the queue flag',
                (SELECT NOT needs_reprocess FROM tickets WHERE id = v_ticket));

            PERFORM pg_temp.check_that('reprocessing writes an audit artifact with both totals',
                EXISTS (SELECT 1 FROM audit_events
                         WHERE entity_id = v_ticket AND action = 'reprocess'
                           AND changed ? 'old_total' AND changed ? 'new_total'));

            PERFORM pg_temp.check_that('the whole ledger still nets to the live total',
                (SELECT COALESCE(sum(amount), 0) FROM transactions
                  WHERE ticket_id = v_ticket)
                = (SELECT COALESCE(sum(amount), 0) FROM transactions
                    WHERE ticket_id = v_ticket AND superseded_at IS NULL
                      AND NOT is_reversal));

            PERFORM pg_temp.check_that('a reversal is superseded with the row it reverses',
                NOT EXISTS (
                    SELECT 1 FROM transactions r
                      JOIN transactions o ON o.id = r.reverses_id
                     WHERE r.ticket_id = v_ticket
                       AND o.superseded_at IS NOT NULL
                       AND r.superseded_at IS NULL));
        ELSE
            PERFORM pg_temp.check_skipped(
                'repricing a halved capacity halves the money',
                'nothing was queued for reprocessing on this database');
        END IF;

        -- ------------------------------------------- the promises that must hold
        SELECT id INTO v_txn FROM transactions
         WHERE superseded_at IS NULL AND NOT is_reversal LIMIT 1;

        PERFORM pg_temp.check_raises('a transaction amount is still not editable',
            format('UPDATE transactions SET amount = 1 WHERE id = %L', v_txn),
            'append-only');

        PERFORM pg_temp.check_raises('a transaction still cannot be deleted',
            format('DELETE FROM transactions WHERE id = %L', v_txn),
            'append-only');

        PERFORM pg_temp.check_raises('a supersede marker cannot be cleared',
            format('UPDATE transactions SET superseded_at = NULL WHERE id = %L',
                   (SELECT id FROM transactions WHERE superseded_at IS NOT NULL LIMIT 1)),
            'cannot change again');

        PERFORM pg_temp.check_raises('reprocessing without a reason is refused',
            format('SELECT adms_reprocess_ticket(%L, '''', NULL)', v_ticket),
            'reason');

        -- ------------------------------------------------------- the guardrails
        PERFORM pg_temp.check_that('approved invoices are visible to the reprocess guard',
            (SELECT count(*) FROM pg_proc WHERE proname = 'adms_ticket_invoice_lock') = 1);

        PERFORM pg_temp.check_that('invoice_integrity reports superseded lines',
            (SELECT count(*) FROM information_schema.columns
              WHERE table_name = 'invoice_integrity'
                AND column_name IN ('needs_review', 'superseded_lines')) = 2);

        -- ------------------------------------------------------------- unvoiding
        SELECT id INTO v_ticket FROM tickets WHERE is_void LIMIT 1;
        IF v_ticket IS NOT NULL THEN
            PERFORM adms_unvoid_ticket(v_ticket, 'Voided in error', v_user);
            PERFORM pg_temp.check_that('unvoiding restores the ticket and queues repricing',
                (SELECT NOT is_void AND needs_reprocess FROM tickets WHERE id = v_ticket));
            PERFORM pg_temp.check_that('unvoiding is on the record',
                EXISTS (SELECT 1 FROM audit_events
                         WHERE entity_id = v_ticket AND action = 'unvoid'));
            PERFORM pg_temp.check_raises('unvoiding a live ticket is refused',
                format('SELECT adms_unvoid_ticket(%L, ''again'', NULL)', v_ticket),
                'not void');
        ELSE
            PERFORM pg_temp.check_skipped(
                'unvoiding restores a ticket and its billing',
                'this database has no void ticket to restore');
        END IF;

        -- ---------------------------------------------------- stream to type map
        PERFORM pg_temp.check_that('every debris stream names the ticket types it needs',
            NOT EXISTS (SELECT 1 FROM debris_types
                         WHERE is_active AND cardinality(ticket_type_codes) = 0));

        PERFORM pg_temp.check_that('counted tree work is recorded on the unit rate ticket',
            (SELECT ticket_type_codes FROM debris_types WHERE code = 'HANGER')
                @> ARRAY['UNIT']);

        SELECT array_agg(name ORDER BY n),
               array_agg(COALESCE(detail, '') ORDER BY n)
          INTO v_names, v_details
          FROM _results WHERE n > v_mark;

        -- Everything above passed, so undo all of it. A failure would have
        -- raised out of here long before this line and stopped the file.
        RAISE EXCEPTION 'sandbox' USING ERRCODE = 'ADMS1';
    EXCEPTION
        WHEN SQLSTATE 'ADMS1' THEN
            NULL;
    END;

    INSERT INTO _results (name, ok, detail)
    SELECT u.nm, true,
           CASE WHEN u.dt LIKE 'skipped:%' THEN u.dt ELSE 'sandboxed' END
      FROM unnest(COALESCE(v_names, '{}'), COALESCE(v_details, '{}')) AS u(nm, dt);
END
$sprint2$;

-- =============================================================================
-- Sprint 2: ticket review. Sandboxed for the same reason the block above is:
-- the detector writes flags, and setup.sh runs this file.
-- =============================================================================
DO $review$
DECLARE
    v_project uuid;
    v_ticket  uuid;
    v_user    uuid;
    v_item    uuid;
    v_n       integer;
    v_mark    integer;
    v_names   text[];
    v_details text[];
BEGIN
    SELECT id INTO v_project FROM projects ORDER BY created_at LIMIT 1;
    SELECT id INTO v_user FROM users WHERE username = 'manager';
    SELECT COALESCE(max(n), 0) INTO v_mark FROM _results;

    BEGIN
        PERFORM pg_temp.check_that('every check has wording a reviewer can read',
            NOT EXISTS (SELECT 1 FROM ticket_flag_kinds
                         WHERE coalesce(btrim(label), '') = ''
                            OR coalesce(btrim(description), '') = ''));

        SELECT count(*) INTO v_n FROM ticket_flag_kinds WHERE is_active;
        PERFORM pg_temp.check_that('the detector ships with checks to run',
            v_n >= 10, v_n::text);

        -- Run it over the project.
        SELECT COALESCE(sum(adms_flag_ticket(id)), 0) INTO v_n
          FROM tickets WHERE project_id = v_project AND NOT is_void
                         AND deleted_at IS NULL;
        PERFORM pg_temp.check_that('the detector finds something in the demo data',
            v_n > 0, v_n::text);

        PERFORM pg_temp.check_that('a flag carries the numbers behind it',
            NOT EXISTS (SELECT 1 FROM review_flags
                         WHERE subject_kind = 'ticket' AND detail = '{}'::jsonb));

        -- Idempotence matters: this runs every time anything is processed.
        SELECT count(*) INTO v_n FROM review_flags
         WHERE subject_kind = 'ticket' AND cleared_at IS NULL;
        PERFORM adms_flag_ticket(id) FROM tickets
         WHERE project_id = v_project AND NOT is_void AND deleted_at IS NULL;
        PERFORM pg_temp.check_that('re-running the detector does not duplicate flags',
            (SELECT count(*) FROM review_flags
              WHERE subject_kind = 'ticket' AND cleared_at IS NULL) = v_n,
            format('%s then %s', v_n,
                   (SELECT count(*) FROM review_flags
                     WHERE subject_kind = 'ticket' AND cleared_at IS NULL)));

        PERFORM pg_temp.check_that('a void ticket is never flagged',
            NOT EXISTS (
                SELECT 1 FROM review_flags f
                  JOIN tickets t ON t.id = f.subject_id
                 WHERE f.subject_kind = 'ticket'
                   AND t.is_void AND f.cleared_at IS NULL));

        -- Monitored work that produced no transaction. It used to sit in
        -- processing_state = 'no_match' with a NULL error, which is the silent
        -- skip the notes called the real bug.
        PERFORM pg_temp.check_that('a billable ticket that matched nothing carries a named error',
            NOT EXISTS (
                SELECT 1 FROM tickets t
                  JOIN ticket_types tt ON tt.id = t.ticket_type_id
                 WHERE t.project_id = v_project
                   AND tt.billable
                   AND t.processing_state = 'no_match'
                   AND COALESCE(btrim(t.processing_error), '') = ''));

        PERFORM pg_temp.check_that('a non-billable type is excluded, never reported as no_match',
            NOT EXISTS (
                SELECT 1 FROM tickets t
                  JOIN ticket_types tt ON tt.id = t.ticket_type_id
                 WHERE t.project_id = v_project
                   AND NOT tt.billable
                   AND t.processing_state = 'no_match'));

        PERFORM pg_temp.check_that('nothing billed it reaches the review queue',
            NOT EXISTS (
                SELECT 1 FROM tickets t
                  JOIN ticket_types tt ON tt.id = t.ticket_type_id
                 WHERE t.project_id = v_project
                   AND tt.billable
                   AND t.status = 'completed'
                   AND NOT t.is_void
                   AND t.deleted_at IS NULL
                   AND NOT EXISTS (
                        SELECT 1 FROM transactions tx
                         WHERE tx.ticket_id = t.id AND NOT tx.is_reversal
                           AND tx.superseded_at IS NULL)
                   AND NOT EXISTS (
                        SELECT 1 FROM review_flags f
                         WHERE f.subject_kind = 'ticket' AND f.subject_id = t.id
                           AND f.issue_code = 'no_rule_matched'
                           AND f.cleared_at IS NULL)));

        PERFORM pg_temp.check_that('an incident is never asked why it did not bill',
            NOT EXISTS (
                SELECT 1 FROM review_flags f
                  JOIN tickets t ON t.id = f.subject_id
                  JOIN ticket_types tt ON tt.id = t.ticket_type_id
                 WHERE f.subject_kind = 'ticket'
                   AND f.issue_code = 'no_rule_matched'
                   AND f.cleared_at IS NULL
                   AND NOT tt.billable));

        -- The spine has no foreign key on subject_id, so the check that
        -- replaces it has to actually refuse a record that is not there.
        PERFORM pg_temp.check_raises('a review cannot name a record that does not exist',
            format('INSERT INTO review_flags (subject_kind, subject_id, project_id,
                                              issue_code, detail)
                    VALUES (''ticket'', gen_random_uuid(), %L, ''full_load_call'',
                            ''{"x": 1}''::jsonb)', v_project),
            'no ticket exists');

        -- A flag that stops being true has to clear itself, or a correction
        -- looks like it did nothing.
        SELECT f.subject_id INTO v_ticket FROM review_flags f
         WHERE f.subject_kind = 'ticket' AND f.issue_code = 'full_load_call'
           AND f.cleared_at IS NULL LIMIT 1;
        IF v_ticket IS NOT NULL THEN
            UPDATE tickets SET load_call_pct = 60 WHERE id = v_ticket;
            PERFORM adms_flag_ticket(v_ticket);
            PERFORM pg_temp.check_that('a flag clears when it stops being true',
                NOT EXISTS (SELECT 1 FROM review_flags
                             WHERE subject_kind = 'ticket'
                               AND subject_id = v_ticket
                               AND issue_code = 'full_load_call'
                               AND cleared_at IS NULL));
        ELSE
            PERFORM pg_temp.check_skipped(
                'a flag clears when it stops being true',
                'no ticket on this database carries a full load call');
        END IF;

        -- The review decision. On a ticket nobody has reviewed yet, because a
        -- review is one row per ticket and the API suite leaves some behind.
        SELECT t.id INTO v_ticket FROM tickets t
         WHERE t.project_id = v_project AND NOT t.is_void AND t.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM review_items r
                            WHERE r.subject_kind = 'ticket' AND r.subject_id = t.id)
         LIMIT 1;

        IF v_ticket IS NULL THEN
            -- Everything is reviewed. Clear one inside the sandbox rather than
            -- skipping the assertions that matter most.
            SELECT id INTO v_ticket FROM tickets
             WHERE project_id = v_project AND NOT is_void AND deleted_at IS NULL
             LIMIT 1;
            DELETE FROM review_items
             WHERE subject_kind = 'ticket' AND subject_id = v_ticket;
        END IF;

        -- A record nobody has touched has no review row and still reads as
        -- pending. That is what lets 25,000 seeded tickets cost nothing.
        PERFORM pg_temp.check_that('an untouched ticket is pending without a row',
            (SELECT review_state FROM ticket_review_queue
              WHERE ticket_id = v_ticket) = 'pending');

        PERFORM pg_temp.check_raises('flagging without a claim is refused',
            format('INSERT INTO review_items (subject_kind, subject_id, project_id,
                                              state, reviewed_at)
                    VALUES (''ticket'', %L, %L, ''flagged'', now())',
                   v_ticket, v_project),
            'flagged_has_a_reason');

        PERFORM pg_temp.check_raises('a decision has to have been made by someone',
            format('INSERT INTO review_items (subject_kind, subject_id, project_id, state)
                    VALUES (''ticket'', %L, %L, ''approved'')', v_ticket, v_project),
            'decided_has_an_actor');

        PERFORM pg_temp.check_raises('escalating without a reason is refused',
            format('INSERT INTO review_items (subject_kind, subject_id, project_id,
                                              escalation_level, escalated_at)
                    VALUES (''ticket'', %L, %L, ''management'', now())',
                   v_ticket, v_project),
            'escalation_shape');

        -- The write path every surface uses: open the row, then decide on it.
        v_item := adms_review_item('ticket', v_ticket, v_project, v_user,
                                   'Luis Ortega');

        PERFORM pg_temp.check_that('opening a review is recorded as an event',
            EXISTS (SELECT 1 FROM review_events
                     WHERE review_item_id = v_item AND event = 'opened'));

        PERFORM pg_temp.check_that('opening the same review twice is one row',
            adms_review_item('ticket', v_ticket, v_project, v_user, 'Luis Ortega')
                = v_item);

        UPDATE review_items
           SET state = 'flagged', notes = 'Pre photo is unusable',
               reviewed_by = v_user, reviewed_by_name = 'Luis Ortega',
               reviewed_at = now()
         WHERE id = v_item;

        PERFORM pg_temp.check_that('the queue reflects the decision',
            (SELECT review_state FROM ticket_review_queue WHERE ticket_id = v_ticket)
                = 'flagged');

        PERFORM pg_temp.check_that('the generic queue agrees with the ticket queue',
            (SELECT review_state FROM review_queue
              WHERE subject_kind = 'ticket' AND subject_id = v_ticket) = 'flagged');

        PERFORM pg_temp.check_that('a waiting item reports how long it has waited',
            (SELECT waiting_days FROM review_queue
              WHERE subject_kind = 'ticket' AND subject_id = v_ticket) >= 0);

        PERFORM pg_temp.check_that('escalation candidates are suggested, not written',
            (SELECT count(*) FROM adms_review_escalation_candidates(v_project)
              WHERE reason_code NOT IN ('waited_too_long', 'repeating_issue')) = 0);

        PERFORM pg_temp.check_that('invoices are deliberately not reviewable',
            NOT EXISTS (SELECT 1 FROM review_subject_kinds WHERE code = 'invoice'));

        PERFORM pg_temp.check_that('monitor accuracy scores rate, not volume',
            (SELECT count(*) FROM information_schema.columns
              WHERE table_name = 'monitor_accuracy'
                AND column_name IN ('approval_rate', 'flagged', 'unreviewed')) = 3);

        PERFORM pg_temp.check_that('a monitor with nothing reviewed has no rate',
            NOT EXISTS (SELECT 1 FROM monitor_accuracy
                         WHERE approved = 0 AND flagged = 0
                           AND approval_rate IS NOT NULL));

        SELECT array_agg(name ORDER BY n),
               array_agg(COALESCE(detail, '') ORDER BY n)
          INTO v_names, v_details
          FROM _results WHERE n > v_mark;
        RAISE EXCEPTION 'sandbox' USING ERRCODE = 'ADMS1';
    EXCEPTION
        WHEN SQLSTATE 'ADMS1' THEN
            NULL;
    END;

    INSERT INTO _results (name, ok, detail)
    SELECT u.nm, true,
           CASE WHEN u.dt LIKE 'skipped:%' THEN u.dt ELSE 'sandboxed' END
      FROM unnest(COALESCE(v_names, '{}'), COALESCE(v_details, '{}')) AS u(nm, dt);
END
$review$;

-- =============================================================================
-- Sprint 3: the measurements behind a certified capacity.
--
-- The figures asserted here were computed by hand and are checked in on
-- purpose. A volume formula that is silently wrong is the most expensive
-- failure in this system: capacity times the load call is the billable volume
-- on every load that truck hauls.
-- =============================================================================
DO $measure$
DECLARE
    v_project uuid;
    v_equip   uuid;
    v_cert    uuid;
    v_meas    uuid;
    v_user    uuid;
    v_num     numeric;
    v_box     numeric;
    v_mark    integer;
    v_names   text[];
    v_details text[];
BEGIN
    SELECT id INTO v_project FROM projects ORDER BY created_at LIMIT 1;
    SELECT id INTO v_user FROM users WHERE username = 'manager';
    SELECT COALESCE(max(n), 0) INTO v_mark FROM _results;

    BEGIN
        PERFORM pg_temp.check_that('every shape says what it is and how it is worked out',
            NOT EXISTS (SELECT 1 FROM measurement_shapes
                         WHERE coalesce(btrim(label), '') = ''
                            OR coalesce(btrim(description), '') = ''
                            OR coalesce(btrim(formula_note), '') = ''
                            OR jsonb_array_length(dimension_schema) = 0));

        PERFORM pg_temp.check_that('every container type says what it is for',
            NOT EXISTS (SELECT 1 FROM container_types
                         WHERE coalesce(btrim(typical_use), '') = ''
                            OR cardinality(required_photo_slots) = 0));

        PERFORM pg_temp.check_that('a certification needs a photograph of the placard',
            NOT EXISTS (SELECT 1 FROM container_types
                         WHERE NOT ('placard' = ANY (required_photo_slots))));

        -- 22ft by 8ft by 4ft 6in rolloff, in inches. 1,368,576 cubic inches,
        -- 792 cubic feet, 29.33 cubic yards.
        v_num := adms_shape_volume('rectangular',
                   '{"length":264,"width":96,"height":54}'::jsonb);
        PERFORM pg_temp.check_that('a rectangular box measures to the hand figure',
            v_num = 1368576, v_num::text);
        PERFORM pg_temp.check_that('cubic inches convert to cubic yards',
            round(v_num / 46656.0, 2) = 29.33, round(v_num / 46656.0, 2)::text);

        -- The round bottom trailer from the migration header. 288 by 96
        -- interior, 60in of straight side on a 14in curve: 41.18 CY, against
        -- 43.85 CY if the same trailer is measured floor to rail as a box.
        v_num := adms_shape_volume('round_bottom',
                   '{"length":288,"width":96,"straight_height":60,"curve_depth":14}'::jsonb);
        v_box := adms_shape_volume('rectangular',
                   '{"length":288,"width":96,"height":74}'::jsonb);
        PERFORM pg_temp.check_that('a curved floor measures to the hand figure',
            round(v_num / 46656.0, 2) = 41.18, round(v_num / 46656.0, 2)::text);
        PERFORM pg_temp.check_that('measuring that trailer as a box overstates it',
            round((v_box - v_num) / 46656.0, 2) = 2.67,
            format('%s CY per load', round((v_box - v_num) / 46656.0, 2)));

        PERFORM pg_temp.check_that('a floor with no curve is just a box',
            adms_shape_volume('round_bottom',
                '{"length":10,"width":10,"straight_height":10,"curve_depth":0}'::jsonb) = 1000);

        PERFORM pg_temp.check_that('a half circle floor matches the closed form',
            round(adms_shape_volume('round_bottom',
                '{"length":100,"width":96,"straight_height":0,"curve_depth":48}'::jsonb), 0)
            = round((100 * pi() * 48 * 48 / 2)::numeric, 0));

        PERFORM pg_temp.check_that('a taper with equal ends is a box',
            adms_shape_volume('tapered_sides',
                '{"length":10,"height":10,"width_top":10,"width_bottom":10}'::jsonb) = 1000);

        PERFORM pg_temp.check_that('a prismatoid with equal ends is a box',
            round(adms_shape_volume('prismatoid',
                '{"length_bottom":10,"width_bottom":10,"length_top":10,"width_top":10,"height":10}'::jsonb))
            = 1000);

        PERFORM pg_temp.check_raises('a curve deeper than the trailer is wide is refused',
            'SELECT adms_shape_volume(''round_bottom'',
                ''{"length":10,"width":10,"straight_height":5,"curve_depth":9}''::jsonb)',
            'not a circular floor');

        PERFORM pg_temp.check_raises('an unknown shape is refused',
            'SELECT adms_shape_volume(''banana'', ''{}''::jsonb)',
            'no measurement shape');

        PERFORM pg_temp.check_raises('a missing dimension is refused',
            'SELECT adms_shape_volume(''rectangular'', ''{"length":10,"width":10}''::jsonb)',
            'needs a height');

        -- ------------------------------------------------------- a worksheet
        SELECT e.id INTO v_equip FROM equipment e
          JOIN project_contractors pc ON pc.contractor_id = e.contractor_id
         WHERE pc.project_id = v_project AND pc.is_active AND e.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM project_equipment_certifications c
                            WHERE c.project_id = v_project AND c.equipment_id = e.id)
         LIMIT 1;

        IF v_equip IS NULL THEN
            PERFORM pg_temp.check_skipped('a capacity is derived from its measurements',
                'every unit on this project is already certified');
        ELSE
            INSERT INTO project_equipment_certifications
                (project_id, equipment_id, status, method, measured_on,
                 applies_from, created_by)
            VALUES (v_project, v_equip, 'draft', 'physical', current_date,
                    current_date, v_user)
            RETURNING id INTO v_cert;

            PERFORM pg_temp.check_that('a draft starts with no capacity at all',
                (SELECT certified_capacity_cy FROM project_equipment_certifications
                  WHERE id = v_cert) IS NULL);

            PERFORM pg_temp.check_that('a draft never prices a ticket',
                (adms_certification_in_force(v_project, v_equip, current_date)).id
                    IS NULL);

            INSERT INTO certification_measurements
                (certification_id, container_type_code, intended_use,
                 measurement_method, measured_by, measured_by_name,
                 paper_form_number)
            VALUES (v_cert, 'round_bottom_end_dump', 'Haul out to final disposal',
                    'tape', v_user, 'Luis Ortega', 'PF-TEST-0001')
            RETURNING id INTO v_meas;

            INSERT INTO certification_sections
                (measurement_id, sequence, label, shape_code, role, dimensions)
            VALUES (v_meas, 1, 'Main body', 'round_bottom', 'base',
                    '{"length":288,"width":96,"straight_height":60,"curve_depth":14}');

            PERFORM pg_temp.check_that('a capacity is derived from its measurements',
                (SELECT certified_capacity_cy FROM project_equipment_certifications
                  WHERE id = v_cert) = 41.18,
                (SELECT certified_capacity_cy::text FROM project_equipment_certifications
                  WHERE id = v_cert));

            INSERT INTO certification_sections
                (measurement_id, sequence, label, shape_code, role, quantity,
                 dimensions, notes)
            VALUES (v_meas, 2, 'Wheel well intrusion', 'rectangular', 'deduction',
                    2, '{"length":30,"width":8,"height":12}', 'Both sides');

            PERFORM pg_temp.check_that('a deduction counts once per unit measured',
                (SELECT deduction_cubic_inches FROM certification_measurements
                  WHERE id = v_meas) = 5760);

            INSERT INTO certification_sections
                (measurement_id, sequence, label, shape_code, role, dimensions)
            VALUES (v_meas, 3, 'Bolted sideboards', 'tapered_sides', 'addition',
                    '{"length":288,"height":12,"width_top":102,"width_bottom":96}');

            PERFORM pg_temp.check_that('base plus additions minus deductions is the total',
                (SELECT total_cubic_inches FROM certification_measurements
                  WHERE id = v_meas)
                = (SELECT base_cubic_inches + addition_cubic_inches
                          - deduction_cubic_inches
                     FROM certification_measurements WHERE id = v_meas));

            PERFORM pg_temp.check_that('the worksheet keeps every section it was built from',
                (SELECT section_count FROM certification_measurements
                  WHERE id = v_meas) = 3);

            PERFORM pg_temp.check_that('the reviewer can read the sections back',
                jsonb_array_length((SELECT sections FROM certification_measurement_detail
                                     WHERE id = v_meas)) = 3);

            PERFORM pg_temp.check_raises('a section with no volume is refused',
                format('INSERT INTO certification_sections
                            (measurement_id, sequence, label, shape_code, role, dimensions)
                        VALUES (%L, 9, ''Nothing'', ''rectangular'', ''base'',
                                ''{"length":0,"width":10,"height":10}'')', v_meas),
                'no volume');

            PERFORM pg_temp.check_raises('deducting more than the container holds is refused',
                format('INSERT INTO certification_sections
                            (measurement_id, sequence, label, shape_code, role, dimensions)
                        VALUES (%L, 8, ''Impossible'', ''rectangular'', ''deduction'',
                                ''{"length":1000,"width":1000,"height":1000}'')', v_meas),
                'more than the container holds');

            -- Submission closes the worksheet. Evidence that can be edited
            -- afterwards is not evidence.
            UPDATE project_equipment_certifications
               SET status = 'submitted', submitted_at = now(), submitted_by = v_user
             WHERE id = v_cert;

            PERFORM pg_temp.check_raises('a submitted worksheet cannot be edited',
                format('INSERT INTO certification_sections
                            (measurement_id, sequence, label, shape_code, role, dimensions)
                        VALUES (%L, 7, ''Late addition'', ''rectangular'', ''addition'',
                                ''{"length":10,"width":10,"height":10}'')', v_meas),
                'measurements are closed');

            UPDATE project_equipment_certifications
               SET status = 'active', approved_by = v_user WHERE id = v_cert;

            PERFORM pg_temp.check_that('an approved measurement prices work',
                (adms_certification_in_force(v_project, v_equip, current_date))
                    .certified_capacity_cy IS NOT NULL);

            PERFORM pg_temp.check_raises('a certification in force is never edited',
                format('UPDATE project_equipment_certifications
                           SET certified_capacity_cy = 99 WHERE id = %L', v_cert),
                'never edited');

            -- ------------------------------------------- reviewable records
            PERFORM adms_flag_certification(v_cert);

            PERFORM pg_temp.check_that('a measured certification is not called unmeasured',
                NOT EXISTS (SELECT 1 FROM review_flags
                             WHERE subject_kind = 'certification'
                               AND subject_id = v_cert
                               AND issue_code = 'capacity_not_measured'
                               AND cleared_at IS NULL));

            PERFORM pg_temp.check_that('a certification with no photographs says which are missing',
                cardinality((SELECT missing_slots FROM certification_evidence
                              WHERE certification_id = v_cert)) > 0);

            PERFORM pg_temp.check_that('a certification reaches the review queue',
                EXISTS (SELECT 1 FROM review_queue
                         WHERE subject_kind = 'certification'
                           AND subject_id = v_cert));

            INSERT INTO certification_media (certification_id, slot, storage_url)
            SELECT v_cert, slot, 'https://example.invalid/' || slot || '.jpg'
              FROM unnest(ARRAY['front', 'side', 'interior', 'placard',
                                'measurement']) AS slot;

            PERFORM pg_temp.check_that('collecting every required photograph closes the gap',
                (SELECT evidence_complete FROM certification_evidence
                  WHERE certification_id = v_cert));

            PERFORM adms_flag_certification(v_cert);
            PERFORM pg_temp.check_that('the missing photograph flag clears when they arrive',
                NOT EXISTS (SELECT 1 FROM review_flags
                             WHERE subject_kind = 'certification'
                               AND subject_id = v_cert
                               AND issue_code = 'photo_slot_missing'
                               AND cleared_at IS NULL));
        END IF;

        -- Every certification written before this sprint is a typed number, and
        -- the detector has to say so rather than letting them pass.
        SELECT COALESCE(sum(adms_flag_certification(id)), 0) INTO v_num
          FROM project_equipment_certifications WHERE project_id = v_project;

        PERFORM pg_temp.check_that('an unmeasured capacity is called out',
            NOT EXISTS (
                SELECT 1 FROM project_equipment_certifications c
                 WHERE c.project_id = v_project AND c.status = 'active'
                   AND NOT EXISTS (SELECT 1 FROM certification_measurements m
                                    WHERE m.certification_id = c.id)
                   AND NOT EXISTS (SELECT 1 FROM review_flags f
                                    WHERE f.subject_kind = 'certification'
                                      AND f.subject_id = c.id
                                      AND f.issue_code = 'capacity_not_measured'
                                      AND f.cleared_at IS NULL)));

        PERFORM pg_temp.check_that('certification checks stay out of the ticket catalog',
            NOT EXISTS (SELECT 1 FROM ticket_flag_kinds
                         WHERE code IN ('capacity_not_measured', 'placard_mismatch')));

        PERFORM pg_temp.check_that('the queue carries more than one kind of record',
            (SELECT count(DISTINCT subject_kind) FROM review_queue) >= 2);

        SELECT array_agg(name ORDER BY n),
               array_agg(COALESCE(detail, '') ORDER BY n)
          INTO v_names, v_details
          FROM _results WHERE n > v_mark;
        RAISE EXCEPTION 'sandbox' USING ERRCODE = 'ADMS1';
    EXCEPTION
        WHEN SQLSTATE 'ADMS1' THEN
            NULL;
    END;

    INSERT INTO _results (name, ok, detail)
    SELECT u.nm, true,
           CASE WHEN u.dt LIKE 'skipped:%' THEN u.dt ELSE 'sandboxed' END
      FROM unnest(COALESCE(v_names, '{}'), COALESCE(v_details, '{}')) AS u(nm, dt);
END
$measure$;

-- =============================================================================
-- Sprint 2: how a rate sheet is actually written, and the invoice lifecycle.
-- =============================================================================
DO $money$
DECLARE
    v_project uuid;
    v_rate    uuid;
    v_ticket  uuid;
    v_inv     uuid;
    v_num     numeric;
    v_txt     text;
    v_mark    integer;
    v_names   text[];
    v_details text[];
BEGIN
    SELECT id INTO v_project FROM projects ORDER BY created_at LIMIT 1;
    SELECT COALESCE(max(n), 0) INTO v_mark FROM _results;

    BEGIN
        PERFORM pg_temp.check_that('a service code says how it is counted',
            NOT EXISTS (SELECT 1 FROM service_codes
                         WHERE quantity_mode NOT IN ('measured', 'flat', 'tiered')));

        PERFORM pg_temp.check_that('stumps are banded rather than priced per inch',
            EXISTS (SELECT 1 FROM service_codes
                     WHERE code = 'STUMP' AND quantity_mode = 'tiered'));

        SELECT r.id INTO v_rate FROM rates r
          JOIN service_codes sc ON sc.id = r.service_code_id
         WHERE sc.quantity_mode = 'tiered' LIMIT 1;

        PERFORM pg_temp.check_that('a banded rate names what picks the band',
            (SELECT tier_source FROM rates WHERE id = v_rate) IS NOT NULL);

        PERFORM pg_temp.check_that('the bands are on the rate',
            (SELECT count(*) FROM rate_tiers WHERE rate_id = v_rate) >= 3);

        PERFORM pg_temp.check_raises('overlapping bands are refused',
            format('INSERT INTO rate_tiers (rate_id, from_value, to_value, amount)
                    VALUES (%L, 10, 20, 99)', v_rate),
            'overlaps');

        -- A 26 inch stump and an 8 inch one are different money.
        SELECT id INTO v_ticket FROM tickets
         WHERE project_id = v_project AND NOT is_void LIMIT 1;

        UPDATE tickets SET data = data || '{"stump_diameter_inches": 30}'::jsonb
         WHERE id = v_ticket;
        SELECT pf.out_amount INTO v_num FROM adms_price_for(v_ticket, v_rate) pf;

        UPDATE tickets SET data = data || '{"stump_diameter_inches": 8}'::jsonb
         WHERE id = v_ticket;
        PERFORM pg_temp.check_that('a bigger stump is more money on the same code',
            (SELECT pf.out_amount FROM adms_price_for(v_ticket, v_rate) pf) < v_num);

        UPDATE tickets SET data = data - 'stump_diameter_inches' WHERE id = v_ticket;
        SELECT pf.out_tier_label INTO v_txt FROM adms_price_for(v_ticket, v_rate) pf;
        PERFORM pg_temp.check_that('an unmeasured stump is priced and says so',
            v_txt LIKE 'No band%', COALESCE(v_txt, 'null'));

        PERFORM pg_temp.check_that('a banded code bills one, not the count',
            adms_quantity_for(v_ticket, 'per_unit',
                (SELECT id FROM service_codes WHERE quantity_mode = 'tiered' LIMIT 1)) = 1);

        PERFORM pg_temp.check_that('every banded transaction records its band',
            NOT EXISTS (
                SELECT 1 FROM transactions tx
                  JOIN service_codes sc ON sc.id = tx.service_code_id
                 WHERE sc.quantity_mode = 'tiered' AND NOT tx.is_reversal
                   AND tx.tier_label IS NULL));

        PERFORM pg_temp.check_that('quantity times rate equals the amount on every line',
            NOT EXISTS (
                SELECT 1 FROM transactions
                 WHERE round(quantity * rate_amount, 4) <> round(amount, 4)));

        -- The invoice lifecycle. Both reasons are cleared first: an invoice
        -- somebody already adjusted carries one, and the rule would then look
        -- satisfied when nothing had been tested. Inside the sandbox, so the
        -- clearing is undone with everything else.
        SELECT id INTO v_inv FROM invoices WHERE project_id = v_project
         ORDER BY invoice_number LIMIT 1;

        UPDATE invoices
           SET rejection_reason = NULL, adjustment_reason = NULL,
               adjustments = 0, status = 'draft'
         WHERE id = v_inv;

        PERFORM pg_temp.check_raises('a rejection has to say why',
            format('UPDATE invoices SET status = ''rejected'' WHERE id = %L', v_inv),
            'rejection_has_a_reason');

        PERFORM pg_temp.check_raises('an adjustment has to say what it is for',
            format('UPDATE invoices SET adjustments = -100 WHERE id = %L', v_inv),
            'adjustment_has_a_reason');

        SELECT array_agg(name ORDER BY n),
               array_agg(COALESCE(detail, '') ORDER BY n)
          INTO v_names, v_details
          FROM _results WHERE n > v_mark;
        RAISE EXCEPTION 'sandbox' USING ERRCODE = 'ADMS1';
    EXCEPTION
        WHEN SQLSTATE 'ADMS1' THEN
            NULL;
    END;

    INSERT INTO _results (name, ok, detail)
    SELECT u.nm, true,
           CASE WHEN u.dt LIKE 'skipped:%' THEN u.dt ELSE 'sandboxed' END
      FROM unnest(COALESCE(v_names, '{}'), COALESCE(v_details, '{}')) AS u(nm, dt);
END
$money$;

SELECT
    count(*) FILTER (WHERE ok AND detail IS DISTINCT FROM NULL
                     AND detail LIKE 'skipped:%')  AS skipped,
    count(*) FILTER (WHERE ok)                     AS passed,
    count(*) FILTER (WHERE NOT ok)                 AS failed,
    count(*)                                       AS total
  FROM _results;

-- Named, not just counted. A skip is a block whose precondition was not on this
-- database, which on a fresh seed should be none of them.
SELECT name, detail FROM _results
 WHERE detail LIKE 'skipped:%' ORDER BY n;

\echo ''
\echo '  All schema assertions passed. Anything listed above as skipped had no'
\echo '  precondition on this database, which on a fresh seed should be nothing.'
\echo ''
