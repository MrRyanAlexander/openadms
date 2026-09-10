-- =============================================================================
-- Open ADMS :: 0005 :: Projects and their membership tables
-- The project is the organizing unit. Nothing in the field is creatable until
-- a project is fully configured; readiness is computed, not hand-flagged.
-- =============================================================================

CREATE TABLE disasters (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    declaration_code  text NOT NULL,
    name              text NOT NULL,
    incident_type     text,
    declared_on       date,
    incident_start    date,
    incident_end      date,
    state_code        text,
    metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX disasters_code_key ON disasters (lower(declaration_code));
SELECT adms_attach_touch('disasters');

COMMENT ON TABLE disasters IS
    'FEMA declaration the project bills under. Keyed to the declaration date, '
    'which is the clock every eligibility question is answered against.';

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL,
    project_code      text NOT NULL,
    client_id         uuid NOT NULL REFERENCES clients (id) ON DELETE RESTRICT,
    disaster_id       uuid REFERENCES disasters (id) ON DELETE SET NULL,
    primary_contract_id uuid REFERENCES contracts (id) ON DELETE SET NULL,
    status            text NOT NULL DEFAULT 'setup',
    program           text,
    description       text,
    starts_on         date,
    ends_on           date,
    timezone          text NOT NULL DEFAULT 'America/Chicago',
    ticket_prefix     text NOT NULL DEFAULT 'T',
    -- Federation / sharing, carried over from the OmniTodo visibility engine
    owner_instance_key text,
    visibility_flag   text NOT NULL DEFAULT 'private'
                      REFERENCES visibility_flags (code) ON UPDATE CASCADE,
    allowed_viewers   text[] NOT NULL DEFAULT '{}',
    settings          jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    CONSTRAINT projects_status_valid CHECK (status IN (
        'setup', 'active', 'paused', 'closeout', 'closed', 'archived')),
    CONSTRAINT projects_dates_ordered CHECK (
        ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE UNIQUE INDEX projects_code_key
    ON projects (lower(project_code)) WHERE deleted_at IS NULL;
CREATE INDEX projects_client_idx ON projects (client_id);
CREATE INDEX projects_status_idx ON projects (status);
CREATE INDEX projects_visibility_idx ON projects (visibility_flag);
CREATE INDEX projects_allowed_viewers_idx ON projects USING gin (allowed_viewers);
SELECT adms_attach_touch('projects');

-- ---------------------------------------------------------------------------
-- Contractors linked to a project. Rules and service codes may only reference
-- contractors that appear here.
-- ---------------------------------------------------------------------------
CREATE TABLE project_contractors (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    contractor_id     uuid NOT NULL REFERENCES contractors (id) ON DELETE RESTRICT,
    -- Tier lives here and not on the contractor, because a firm can be prime on
    -- one declaration and a second tier sub on the next.
    role_on_project   text NOT NULL DEFAULT 'prime',
    parent_contractor_id uuid REFERENCES contractors (id) ON DELETE RESTRICT,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, contractor_id),
    CONSTRAINT project_contractors_role_valid CHECK (role_on_project IN (
        'prime', 'sub_tier_1', 'sub_tier_2', 'monitoring_firm')),
    CONSTRAINT project_contractors_top_tier_has_no_parent CHECK (
        role_on_project NOT IN ('prime', 'monitoring_firm')
        OR parent_contractor_id IS NULL),
    CONSTRAINT project_contractors_second_tier_has_a_parent CHECK (
        role_on_project <> 'sub_tier_2' OR parent_contractor_id IS NOT NULL),
    CONSTRAINT project_contractors_parent_is_not_self CHECK (
        parent_contractor_id IS NULL OR parent_contractor_id <> contractor_id)
);

CREATE INDEX project_contractors_project_idx ON project_contractors (project_id);
CREATE INDEX project_contractors_parent_idx ON project_contractors (parent_contractor_id)
    WHERE parent_contractor_id IS NOT NULL;
SELECT adms_attach_touch('project_contractors');

COMMENT ON COLUMN project_contractors.parent_contractor_id IS
    'The firm this one works under on this project. A second tier sub must '
    'name one, and that firm must itself be linked to the same project.';

-- A tier chain that points off the project is not a chain. Enforced in a
-- trigger because the check needs another row of the same table.
CREATE OR REPLACE FUNCTION adms_check_contractor_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.parent_contractor_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM project_contractors pc
         WHERE pc.project_id = NEW.project_id
           AND pc.contractor_id = NEW.parent_contractor_id
           AND pc.is_active
    ) THEN
        RAISE EXCEPTION
            'Contractor % is not linked to project %, so it cannot be the tier '
            'parent of contractor %',
            NEW.parent_contractor_id, NEW.project_id, NEW.contractor_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_contractors_parent_scope
    BEFORE INSERT OR UPDATE ON project_contractors
    FOR EACH ROW EXECUTE FUNCTION adms_check_contractor_parent();

-- ---------------------------------------------------------------------------
-- Contracts linked to a project. A rule cannot be saved without one of these.
-- ---------------------------------------------------------------------------
CREATE TABLE project_contracts (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    contract_id       uuid NOT NULL REFERENCES contracts (id) ON DELETE RESTRICT,
    is_primary        boolean NOT NULL DEFAULT false,
    linked_on         date NOT NULL DEFAULT current_date,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, contract_id)
);

CREATE UNIQUE INDEX project_contracts_one_primary
    ON project_contracts (project_id) WHERE is_primary;
CREATE INDEX project_contracts_project_idx ON project_contracts (project_id);
SELECT adms_attach_touch('project_contracts');

-- ---------------------------------------------------------------------------
-- Disposal sites linked to a project.
-- ---------------------------------------------------------------------------
CREATE TABLE project_sites (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    site_id           uuid NOT NULL REFERENCES disposal_sites (id) ON DELETE RESTRICT,
    opened_on         date,
    closed_on         date,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, site_id)
);

CREATE INDEX project_sites_project_idx ON project_sites (project_id);
SELECT adms_attach_touch('project_sites');

-- ---------------------------------------------------------------------------
-- Zones. Optional geographic subdivision used in rule statements
-- (`zone in [001, 002]`) and in reporting.
-- ---------------------------------------------------------------------------
CREATE TABLE project_zones (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    zone_code         text NOT NULL,
    name              text,
    description       text,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, zone_code)
);

CREATE INDEX project_zones_project_idx ON project_zones (project_id);
SELECT adms_attach_touch('project_zones');

-- ---------------------------------------------------------------------------
-- Worker assignment. This is the gate on ticket creation: a user must appear
-- here, be active, and hold can_create_tickets to open a ticket.
-- ---------------------------------------------------------------------------
CREATE TABLE project_assignments (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id            uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    project_role       text NOT NULL REFERENCES roles (code) ON UPDATE CASCADE,
    contractor_id      uuid REFERENCES contractors (id) ON DELETE SET NULL,
    can_create_tickets boolean NOT NULL DEFAULT true,
    can_review_tickets boolean NOT NULL DEFAULT false,
    assigned_on        date NOT NULL DEFAULT current_date,
    unassigned_on      date,
    is_active          boolean NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, user_id)
);

CREATE INDEX project_assignments_user_idx ON project_assignments (user_id);
CREATE INDEX project_assignments_project_idx ON project_assignments (project_id);
SELECT adms_attach_touch('project_assignments');

COMMENT ON TABLE project_assignments IS
    'Active project context. The API refuses any ticket write for a project '
    'the acting user is not assigned to.';
