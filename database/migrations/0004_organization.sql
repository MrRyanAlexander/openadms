-- =============================================================================
-- Open ADMS :: 0004 :: Clients, contractors, contracts, disposal sites
-- These live above the project layer: they are created once for the instance
-- and then linked into any number of projects.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Clients (the applicant: county, parish, municipality, state agency)
-- ---------------------------------------------------------------------------
CREATE TABLE clients (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL,
    code              text,
    client_type       text NOT NULL DEFAULT 'local_government',
    fema_applicant_id text,
    duns_uei          text,
    primary_contact   text,
    contact_email     citext,
    contact_phone     text,
    address_line1     text,
    address_line2     text,
    city              text,
    state_code        text,
    postal_code       text,
    notes             text,
    is_active         boolean NOT NULL DEFAULT true,
    metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    CONSTRAINT clients_type_valid CHECK (client_type IN (
        'local_government', 'state_agency', 'federal_agency',
        'tribal_nation', 'special_district', 'private'))
);

CREATE UNIQUE INDEX clients_name_key
    ON clients (lower(name)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX clients_code_key
    ON clients (lower(code)) WHERE deleted_at IS NULL AND code IS NOT NULL;
SELECT adms_attach_touch('clients');

-- ---------------------------------------------------------------------------
-- Contractors (the firms hauling and processing debris)
-- ---------------------------------------------------------------------------
CREATE TABLE contractors (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL,
    code              text,
    contractor_type   text NOT NULL DEFAULT 'hauler',
    primary_contact   text,
    contact_email     citext,
    contact_phone     text,
    address_line1     text,
    city              text,
    state_code        text,
    postal_code       text,
    is_active         boolean NOT NULL DEFAULT true,
    metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    -- The four kinds of firm that actually show up on a debris program. A
    -- firm's tier on a given project (prime, first or second tier sub) is a
    -- property of the project link, not of the firm.
    CONSTRAINT contractors_type_valid CHECK (contractor_type IN (
        'hauler', 'tree_removal', 'monitoring', 'other'))
);

CREATE UNIQUE INDEX contractors_name_key
    ON contractors (lower(name)) WHERE deleted_at IS NULL;
SELECT adms_attach_touch('contractors');

-- ---------------------------------------------------------------------------
-- Who pays a worker. Declared here rather than in 0003 because it points at
-- contractors, which does not exist until this file. A temp worker on the same
-- contract paid by a staffing firm carries employer_name instead.
-- ---------------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN employer_contractor_id uuid REFERENCES contractors (id)
        ON DELETE SET NULL;

CREATE INDEX users_employer_idx ON users (employer_contractor_id)
    WHERE employer_contractor_id IS NOT NULL;

-- An employee ID is unique inside an employer and meaningless across them.
CREATE UNIQUE INDEX users_employer_employee_id_key
    ON users (employer_contractor_id, employee_id)
    WHERE deleted_at IS NULL
      AND employer_contractor_id IS NOT NULL
      AND employee_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Contracts. Signed before any project work. A contract belongs to one client
-- and one contractor and is linked into projects explicitly.
-- ---------------------------------------------------------------------------
CREATE TABLE contracts (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_number   text NOT NULL,
    title             text NOT NULL,
    client_id         uuid NOT NULL REFERENCES clients (id) ON DELETE RESTRICT,
    contractor_id     uuid NOT NULL REFERENCES contractors (id) ON DELETE RESTRICT,
    contract_type     text NOT NULL DEFAULT 'unit_price',
    status            text NOT NULL DEFAULT 'draft',
    executed_on       date,
    effective_from    date NOT NULL,
    effective_to      date,
    not_to_exceed     numeric(16, 2),
    -- The executed contract lives in Box or SharePoint. The system tracks the
    -- link and packages it at closeout; it never takes custody of the file.
    -- Required, because a contract nothing can point at is a contract nothing
    -- can safely bill under.
    document_url      text NOT NULL,
    notes             text,
    metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    CONSTRAINT contracts_type_valid CHECK (contract_type IN (
        'unit_price', 'time_and_materials', 'lump_sum', 'cost_plus')),
    CONSTRAINT contracts_status_valid CHECK (status IN (
        'draft', 'executed', 'active', 'suspended', 'closed')),
    CONSTRAINT contracts_dates_ordered CHECK (
        effective_to IS NULL OR effective_from IS NULL
        OR effective_to >= effective_from),
    CONSTRAINT contracts_document_url_shape CHECK (
        document_url ~* '^https?://[^[:space:]]+$')
);

CREATE UNIQUE INDEX contracts_number_key
    ON contracts (lower(contract_number)) WHERE deleted_at IS NULL;
CREATE INDEX contracts_client_idx ON contracts (client_id);
CREATE INDEX contracts_contractor_idx ON contracts (contractor_id);
SELECT adms_attach_touch('contracts');

-- ---------------------------------------------------------------------------
-- Disposal sites. DMS = debris management site (temporary reduction/staging).
-- FDS = final disposal site (landfill, mulch market, C&D facility).
-- ---------------------------------------------------------------------------
CREATE TABLE disposal_sites (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL,
    site_code         text,
    site_kind         text NOT NULL,
    operator_id       uuid REFERENCES contractors (id) ON DELETE SET NULL,
    address_line1     text,
    city              text,
    state_code        text,
    postal_code       text,
    latitude          numeric(9, 6),
    longitude         numeric(9, 6),
    permit_number     text,
    permit_expires_on date,
    permit_url        text,
    has_scale         boolean NOT NULL DEFAULT false,
    accepted_debris   text[] NOT NULL DEFAULT '{}',
    capacity_cy       numeric(14, 2),
    is_active         boolean NOT NULL DEFAULT true,
    metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    CONSTRAINT disposal_sites_kind_valid CHECK (site_kind IN (
        'DMS', 'FDS', 'TDSRS', 'TRANSFER', 'RECYCLING')),
    CONSTRAINT disposal_sites_lat_range CHECK (
        latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT disposal_sites_lon_range CHECK (
        longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE UNIQUE INDEX disposal_sites_name_key
    ON disposal_sites (lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX disposal_sites_kind_idx ON disposal_sites (site_kind);
SELECT adms_attach_touch('disposal_sites');

COMMENT ON COLUMN disposal_sites.site_kind IS
    'TDSRS is retained as an alias of DMS for legacy Open Recover imports.';

-- ---------------------------------------------------------------------------
-- Trucks / equipment. Certified capacity is what load-call percentage is
-- applied against to derive billable cubic yards.
-- ---------------------------------------------------------------------------
CREATE TABLE equipment (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_number       text NOT NULL,
    contractor_id     uuid NOT NULL REFERENCES contractors (id) ON DELETE RESTRICT,
    equipment_type    text NOT NULL DEFAULT 'truck',
    make              text,
    model             text,
    model_year        integer,
    license_plate     text,
    vin               text,
    capacity_cy       numeric(10, 2),
    tare_weight_lbs   numeric(10, 2),
    certified_on      date,
    certification_exp date,
    placard_code      text,
    barcode           text,
    is_active         boolean NOT NULL DEFAULT true,
    metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    CONSTRAINT equipment_type_valid CHECK (equipment_type IN (
        'truck', 'trailer', 'grapple', 'loader', 'chipper', 'grinder',
        'excavator', 'crew', 'other')),
    CONSTRAINT equipment_capacity_positive CHECK (
        capacity_cy IS NULL OR capacity_cy > 0)
);

CREATE UNIQUE INDEX equipment_unit_key
    ON equipment (contractor_id, lower(unit_number)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX equipment_barcode_key
    ON equipment (barcode) WHERE deleted_at IS NULL AND barcode IS NOT NULL;
CREATE INDEX equipment_contractor_idx ON equipment (contractor_id);
SELECT adms_attach_touch('equipment');
