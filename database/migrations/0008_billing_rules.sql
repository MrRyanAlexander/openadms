-- =============================================================================
-- Open ADMS :: 0008 :: Service codes, rates, and the rule engine
-- A rule says: "when these conditions hold on a completed ticket of this type,
-- bill this service code under this contract." A rule cannot be saved without
-- both a service code and a contract, and every operand it can reference is
-- resolved from what has actually been configured on the project.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Service codes. Project-scoped, always tied to one contractor on that project.
-- ---------------------------------------------------------------------------
CREATE TABLE service_codes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    code            text NOT NULL,
    name            text NOT NULL,
    contractor_id   uuid NOT NULL REFERENCES contractors (id) ON DELETE RESTRICT,
    description     text,
    fema_category   text,
    is_active       boolean NOT NULL DEFAULT true,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);

-- Partial, so a retired code's name can be reused. A plain unique constraint
-- would let a soft-deleted row hold a code hostage forever.
CREATE UNIQUE INDEX service_codes_project_code_key
    ON service_codes (project_id, lower(code)) WHERE deleted_at IS NULL;
CREATE INDEX service_codes_project_idx ON service_codes (project_id);
CREATE INDEX service_codes_contractor_idx ON service_codes (contractor_id);
SELECT adms_attach_touch('service_codes');

-- The contractor on a service code must be linked to the same project.
CREATE OR REPLACE FUNCTION adms_check_service_code_contractor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM project_contractors pc
         WHERE pc.project_id = NEW.project_id
           AND pc.contractor_id = NEW.contractor_id
           AND pc.is_active
    ) THEN
        RAISE EXCEPTION
            'Contractor % is not linked to project %', NEW.contractor_id, NEW.project_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_service_codes_contractor_scope
    BEFORE INSERT OR UPDATE ON service_codes
    FOR EACH ROW EXECUTE FUNCTION adms_check_service_code_contractor();

-- ---------------------------------------------------------------------------
-- Rates. Effective-dated so a mid-project rate change does not rewrite history.
-- ---------------------------------------------------------------------------
CREATE TABLE rates (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_code_id   uuid NOT NULL REFERENCES service_codes (id) ON DELETE CASCADE,
    amount            numeric(14, 4) NOT NULL,
    unit_type         text NOT NULL REFERENCES unit_types (code) ON UPDATE CASCADE,
    currency          text NOT NULL DEFAULT 'USD',
    minimum_quantity  numeric(14, 4),
    maximum_quantity  numeric(14, 4),
    effective_from    date NOT NULL DEFAULT current_date,
    effective_to      date,
    notes             text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT rates_amount_non_negative CHECK (amount >= 0),
    CONSTRAINT rates_dates_ordered CHECK (
        effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX rates_service_code_idx ON rates (service_code_id, effective_from DESC);
SELECT adms_attach_touch('rates');

CREATE OR REPLACE FUNCTION adms_rate_for(p_service_code uuid, p_on date)
RETURNS rates
LANGUAGE sql
STABLE
AS $$
    SELECT r.*
      FROM rates r
     WHERE r.service_code_id = p_service_code
       AND r.effective_from <= COALESCE(p_on, current_date)
       AND (r.effective_to IS NULL OR r.effective_to >= COALESCE(p_on, current_date))
     ORDER BY r.effective_from DESC
     LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- Operand catalog. What the left side of a rule statement may reference, and
-- where the back office should source its dropdown options. Adding a new
-- operand is an INSERT.
-- ---------------------------------------------------------------------------
CREATE TABLE rule_operands (
    code            text PRIMARY KEY,
    label           text NOT NULL,
    data_type       text NOT NULL,
    source_path     text NOT NULL,
    options_source  text,
    applies_to_kinds text[] NOT NULL DEFAULT '{}',
    unit_hint       text,
    description     text,
    is_active       boolean NOT NULL DEFAULT true,
    sort_order      integer NOT NULL DEFAULT 0,
    CONSTRAINT rule_operands_data_type_valid CHECK (data_type IN (
        'uuid', 'text', 'number', 'boolean', 'date', 'timestamp', 'text[]'))
);

COMMENT ON COLUMN rule_operands.source_path IS
    'Column name on the ticket_evaluation view the engine reads for this operand.';
COMMENT ON COLUMN rule_operands.options_source IS
    'Named, project-scoped option list the rule builder calls to populate its '
    'value picker (project_contractors, debris_types, project_zones, ...).';

CREATE TABLE rule_operators (
    code          text PRIMARY KEY,
    label         text NOT NULL,
    symbol        text NOT NULL,
    arity         text NOT NULL DEFAULT 'binary',
    data_types    text[] NOT NULL,
    sort_order    integer NOT NULL DEFAULT 0,
    CONSTRAINT rule_operators_arity_valid CHECK (arity IN ('unary', 'binary', 'range', 'set'))
);

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------
CREATE TABLE rules (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    ticket_type_id    uuid NOT NULL REFERENCES ticket_types (id) ON DELETE RESTRICT,
    name              text NOT NULL,
    description       text,
    service_code_id   uuid NOT NULL REFERENCES service_codes (id) ON DELETE RESTRICT,
    contract_id       uuid NOT NULL REFERENCES contracts (id) ON DELETE RESTRICT,
    match_mode        text NOT NULL DEFAULT 'all',
    priority          integer NOT NULL DEFAULT 100,
    is_active         boolean NOT NULL DEFAULT true,
    stop_on_match     boolean NOT NULL DEFAULT false,
    quantity_override numeric(14, 4),
    effective_from    date,
    effective_to      date,
    metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    UNIQUE (project_id, name),
    CONSTRAINT rules_match_mode_valid CHECK (match_mode IN ('all', 'any')),
    CONSTRAINT rules_dates_ordered CHECK (
        effective_to IS NULL OR effective_from IS NULL
        OR effective_to >= effective_from)
);

CREATE INDEX rules_project_type_idx ON rules (project_id, ticket_type_id)
    WHERE is_active AND deleted_at IS NULL;
CREATE INDEX rules_service_code_idx ON rules (service_code_id);
SELECT adms_attach_touch('rules');

COMMENT ON COLUMN rules.stop_on_match IS
    'When false (the default) a ticket keeps being evaluated against remaining '
    'rules, so one ticket can produce several transactions.';

-- A rule''s service code and contract must both belong to its project.
CREATE OR REPLACE FUNCTION adms_check_rule_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM service_codes sc
         WHERE sc.id = NEW.service_code_id
           AND sc.project_id = NEW.project_id
           AND sc.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'Service code % does not belong to project %',
            NEW.service_code_id, NEW.project_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM project_contracts pc
         WHERE pc.project_id = NEW.project_id
           AND pc.contract_id = NEW.contract_id
    ) THEN
        RAISE EXCEPTION
            'Contract % is not linked to project %. Add the contract to the '
            'project before saving this rule.',
            NEW.contract_id, NEW.project_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM project_ticket_types ptt
         WHERE ptt.project_id = NEW.project_id
           AND ptt.ticket_type_id = NEW.ticket_type_id
           AND ptt.is_active
    ) THEN
        RAISE EXCEPTION
            'Ticket type % is not enabled on project %',
            NEW.ticket_type_id, NEW.project_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rules_scope
    BEFORE INSERT OR UPDATE ON rules
    FOR EACH ROW EXECUTE FUNCTION adms_check_rule_scope();

-- ---------------------------------------------------------------------------
-- Rule statement lines
-- ---------------------------------------------------------------------------
CREATE TABLE rule_statements (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id         uuid NOT NULL REFERENCES rules (id) ON DELETE CASCADE,
    sequence        integer NOT NULL DEFAULT 0,
    operand_code    text NOT NULL REFERENCES rule_operands (code) ON UPDATE CASCADE,
    operator_code   text NOT NULL REFERENCES rule_operators (code) ON UPDATE CASCADE,
    value           jsonb,
    value_label     text,
    negate          boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (rule_id, sequence)
);

CREATE INDEX rule_statements_rule_idx ON rule_statements (rule_id, sequence);
SELECT adms_attach_touch('rule_statements');

COMMENT ON COLUMN rule_statements.value_label IS
    'Display text captured at save time so an audit reader sees '
    '"Ceres Environmental" rather than a bare uuid years later.';
