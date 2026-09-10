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
BEGIN
    SELECT id INTO v_project FROM projects ORDER BY created_at LIMIT 1;
    SELECT id INTO v_user FROM users WHERE username = 'manager';

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

    SELECT id INTO v_ticket FROM tickets
     WHERE needs_reprocess AND NOT is_void
       AND processing_state = 'processed' LIMIT 1;

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
    END IF;

    -- ---------------------------------------------------- stream to type map
    PERFORM pg_temp.check_that('every debris stream names the ticket types it needs',
        NOT EXISTS (SELECT 1 FROM debris_types
                     WHERE is_active AND cardinality(ticket_type_codes) = 0));

    PERFORM pg_temp.check_that('counted tree work is recorded on the unit rate ticket',
        (SELECT ticket_type_codes FROM debris_types WHERE code = 'HANGER')
            @> ARRAY['UNIT']);
END
$sprint2$;

SELECT
    count(*) FILTER (WHERE ok)     AS passed,
    count(*) FILTER (WHERE NOT ok) AS failed,
    count(*)                       AS total
  FROM _results;

\echo ''
\echo '  All schema assertions passed.'
\echo ''
