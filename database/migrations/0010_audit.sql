-- =============================================================================
-- Open ADMS :: 0010 :: Immutable audit history
-- Every write to a tracked table produces an artifact: what changed, from what
-- to what, by whom, when. Append-only at the database level, so no application
-- bug and no API caller can rewrite the record.
-- =============================================================================

CREATE TABLE audit_events (
    id            bigserial PRIMARY KEY,
    event_uuid    uuid NOT NULL DEFAULT gen_random_uuid(),
    entity_type   text NOT NULL,
    entity_id     uuid,
    entity_label  text,
    project_id    uuid,
    action        text NOT NULL,
    actor_id      uuid,
    actor_name    text,
    actor_role    text,
    actor_instance_key text,
    source        text NOT NULL DEFAULT 'api',
    before_state  jsonb,
    after_state   jsonb,
    changed       jsonb NOT NULL DEFAULT '{}'::jsonb,
    reason        text,
    ip_address    inet,
    user_agent    text,
    request_id    text,
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_events_action_valid CHECK (action IN (
        'create', 'update', 'delete', 'void', 'unvoid', 'restore', 'archive',
        'login', 'logout', 'login_failed', 'export', 'process', 'reprocess',
        'reverse', 'supersede', 'share', 'peer_read',
        'approve', 'reject', 'submit', 'review'))
);

CREATE INDEX audit_events_entity_idx  ON audit_events (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_events_project_idx ON audit_events (project_id, occurred_at DESC);
CREATE INDEX audit_events_actor_idx   ON audit_events (actor_id, occurred_at DESC);
CREATE INDEX audit_events_changed_gin ON audit_events USING gin (changed jsonb_path_ops);

CREATE TRIGGER trg_audit_events_immutable
    BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION adms_forbid_mutation();

COMMENT ON TABLE audit_events IS
    'Immutable audit artifacts. The API writes actor context into the session '
    'GUCs adms.actor_id / adms.actor_name / adms.actor_role before each '
    'statement so the database trigger can attribute the change.';

-- ---------------------------------------------------------------------------
-- Generic row-level audit trigger. Reads actor context from session settings
-- so it works identically for API writes, migrations, and psql corrections.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_audit_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_before   jsonb;
    v_after    jsonb;
    v_changed  jsonb;
    v_action   text;
    v_entity   uuid;
    v_project  uuid;
    v_label    text;
    v_actor    uuid;
    v_skip     text[] := ARRAY['updated_at', 'created_at'];
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'create';
        v_after  := to_jsonb(NEW);
        v_before := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update';
        v_before := to_jsonb(OLD);
        v_after  := to_jsonb(NEW);
    ELSE
        v_action := 'delete';
        v_before := to_jsonb(OLD);
        v_after  := NULL;
    END IF;

    v_changed := adms_jsonb_diff(v_before, v_after) - v_skip;

    IF TG_OP = 'UPDATE' AND v_changed = '{}'::jsonb THEN
        RETURN NULL;
    END IF;

    v_entity  := (COALESCE(v_after, v_before) ->> 'id')::uuid;
    v_project := NULLIF(COALESCE(v_after, v_before) ->> 'project_id', '')::uuid;
    v_label   := COALESCE(
                    COALESCE(v_after, v_before) ->> 'ticket_number',
                    COALESCE(v_after, v_before) ->> 'name',
                    COALESCE(v_after, v_before) ->> 'code',
                    COALESCE(v_after, v_before) ->> 'invoice_number');

    BEGIN
        v_actor := NULLIF(current_setting('adms.actor_id', true), '')::uuid;
    EXCEPTION WHEN others THEN
        v_actor := NULL;
    END;

    IF TG_OP = 'UPDATE' AND v_before IS NOT NULL THEN
        v_before := v_before - (
            SELECT COALESCE(array_agg(k), '{}')
              FROM jsonb_object_keys(v_before) k
             WHERE NOT v_changed ? k
        );
        v_after := v_after - (
            SELECT COALESCE(array_agg(k), '{}')
              FROM jsonb_object_keys(v_after) k
             WHERE NOT v_changed ? k
        );
    END IF;

    INSERT INTO audit_events (
        entity_type, entity_id, entity_label, project_id, action,
        actor_id, actor_name, actor_role, actor_instance_key, source,
        before_state, after_state, changed, reason, request_id
    ) VALUES (
        TG_TABLE_NAME, v_entity, v_label, v_project, v_action,
        v_actor,
        NULLIF(current_setting('adms.actor_name', true), ''),
        NULLIF(current_setting('adms.actor_role', true), ''),
        NULLIF(current_setting('adms.instance_key', true), ''),
        COALESCE(NULLIF(current_setting('adms.source', true), ''), 'api'),
        v_before, v_after, v_changed,
        NULLIF(current_setting('adms.reason', true), ''),
        NULLIF(current_setting('adms.request_id', true), '')
    );

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION adms_attach_audit(p_table regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    trg_name text := 'trg_audit_' || replace(p_table::text, '.', '_');
BEGIN
    SET LOCAL client_min_messages = warning;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', trg_name, p_table);
    EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %s
         FOR EACH ROW EXECUTE FUNCTION adms_audit_row()',
        trg_name, p_table);
END;
$$;

-- Attach audit to everything that carries operational or financial meaning.
SELECT adms_attach_audit(t) FROM unnest(ARRAY[
    'clients', 'contractors', 'contracts', 'disposal_sites', 'equipment',
    'projects', 'project_contractors', 'project_contracts', 'project_sites',
    'project_zones', 'project_assignments', 'project_ticket_types',
    'ticket_types', 'tickets', 'ticket_stages', 'ticket_media',
    'service_codes', 'rates', 'rules', 'rule_statements',
    'invoices', 'invoice_lines', 'users', 'peer_instances'
]::regclass[]) AS t;
