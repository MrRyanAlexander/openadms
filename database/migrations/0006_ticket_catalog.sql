-- =============================================================================
-- Open ADMS :: 0006 :: The extendable ticket catalog
-- A ticket type is DATA, not code. Its form fields and its lifecycle stages
-- are declared as JSONB, so a new ticket type (ROE, Stump, Time & Material,
-- Survey, Work Order, anything a future contract invents) is added by INSERT
-- rather than by shipping a release.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Debris classification
-- ---------------------------------------------------------------------------
CREATE TABLE debris_types (
    code            text PRIMARY KEY,
    label           text NOT NULL,
    category        text NOT NULL,
    fema_category   text,
    description     text,
    default_density_lbs_cy numeric(10, 2),
    is_active       boolean NOT NULL DEFAULT true,
    sort_order      integer NOT NULL DEFAULT 0,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT debris_types_category_valid CHECK (category IN (
        'vegetative', 'construction_demolition', 'hazardous', 'white_goods',
        'electronic', 'soil_mud_sand', 'vehicle_vessel', 'putrescent', 'other'))
);

-- ---------------------------------------------------------------------------
-- Units of measure a rate can be denominated in. `quantity_source` names the
-- derived ticket metric the engine multiplies the rate against.
-- ---------------------------------------------------------------------------
CREATE TABLE unit_types (
    code             text PRIMARY KEY,
    label            text NOT NULL,
    abbreviation     text NOT NULL,
    quantity_source  text NOT NULL,
    precision_digits integer NOT NULL DEFAULT 2,
    description      text,
    is_active        boolean NOT NULL DEFAULT true,
    sort_order       integer NOT NULL DEFAULT 0,
    CONSTRAINT unit_types_source_valid CHECK (quantity_source IN (
        'billable_cubic_yards', 'net_tons', 'haul_miles', 'labor_hours',
        'equipment_hours', 'unit_count', 'each', 'stump_diameter_inches',
        'linear_feet', 'flat'))
);

COMMENT ON COLUMN unit_types.quantity_source IS
    'Name of the column on ticket_metrics the rules engine reads to get the '
    'billable quantity. "flat" and "each" resolve to 1.';

-- ---------------------------------------------------------------------------
-- Ticket types. `is_system` types (Pending Collection / Pending Disposal) are
-- transient objects the engine creates itself and can never be added to a
-- project.
-- ---------------------------------------------------------------------------
CREATE TABLE ticket_types (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code             text NOT NULL UNIQUE,
    label            text NOT NULL,
    kind             text NOT NULL,
    description      text,
    is_system        boolean NOT NULL DEFAULT false,
    is_active        boolean NOT NULL DEFAULT true,
    requires_equipment boolean NOT NULL DEFAULT false,
    requires_barcode boolean NOT NULL DEFAULT false,
    requires_photo   boolean NOT NULL DEFAULT false,
    supports_waypoints boolean NOT NULL DEFAULT false,
    billable         boolean NOT NULL DEFAULT true,
    icon             text,
    color            text,
    sort_order       integer NOT NULL DEFAULT 0,
    stage_schema     jsonb NOT NULL DEFAULT '[]'::jsonb,
    field_schema     jsonb NOT NULL DEFAULT '[]'::jsonb,
    metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ticket_types_kind_valid CHECK (kind IN (
        'load', 'haul_out', 'unit_rate', 'incident', 'pending', 'custom')),
    CONSTRAINT ticket_types_stage_schema_is_array CHECK (
        jsonb_typeof(stage_schema) = 'array'),
    CONSTRAINT ticket_types_field_schema_is_array CHECK (
        jsonb_typeof(field_schema) = 'array'),
    CONSTRAINT ticket_types_system_not_billable CHECK (
        NOT (is_system AND billable))
);

SELECT adms_attach_touch('ticket_types');

COMMENT ON COLUMN ticket_types.stage_schema IS
    'Ordered lifecycle. Each element: {code, label, actor_role, required, '
    'captures:[...], completes_ticket:bool}. The API drives the field app '
    'entirely from this, so a new ticket type needs no client release.';
COMMENT ON COLUMN ticket_types.field_schema IS
    'Ordered form definition. Each element: {key, label, type, required, '
    'stage, options|source, min, max, help}. Values land in tickets.data.';

-- ---------------------------------------------------------------------------
-- Ticket types enabled on a project. System types are rejected by trigger.
-- ---------------------------------------------------------------------------
CREATE TABLE project_ticket_types (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    ticket_type_id   uuid NOT NULL REFERENCES ticket_types (id) ON DELETE RESTRICT,
    is_active        boolean NOT NULL DEFAULT true,
    field_overrides  jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, ticket_type_id)
);

CREATE INDEX project_ticket_types_project_idx ON project_ticket_types (project_id);
SELECT adms_attach_touch('project_ticket_types');

CREATE OR REPLACE FUNCTION adms_block_system_ticket_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_code text;
    v_is_system boolean;
BEGIN
    SELECT code, is_system INTO v_code, v_is_system
      FROM ticket_types WHERE id = NEW.ticket_type_id;

    IF v_is_system THEN
        RAISE EXCEPTION
            'Ticket type % is a system type and cannot be added to a project',
            v_code
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_ticket_types_block_system
    BEFORE INSERT OR UPDATE ON project_ticket_types
    FOR EACH ROW EXECUTE FUNCTION adms_block_system_ticket_type();

-- ---------------------------------------------------------------------------
-- Incident taxonomy, used by the incident report ticket kind.
-- ---------------------------------------------------------------------------
CREATE TABLE incident_categories (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code          text NOT NULL UNIQUE,
    label         text NOT NULL,
    parent_id     uuid REFERENCES incident_categories (id) ON DELETE CASCADE,
    default_severity text,
    is_active     boolean NOT NULL DEFAULT true,
    sort_order    integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incident_categories_parent_idx ON incident_categories (parent_id);
