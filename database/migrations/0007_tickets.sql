-- =============================================================================
-- Open ADMS :: 0007 :: Tickets, stages, waypoints, media
-- The ticket is the unit of work and the unit of billing. Common columns are
-- first class (so they index and query fast); anything a ticket type declares
-- in field_schema lands in tickets.data.
-- =============================================================================

CREATE TABLE ticket_statuses (
    code          text PRIMARY KEY,
    label         text NOT NULL,
    is_terminal   boolean NOT NULL DEFAULT false,
    is_billable   boolean NOT NULL DEFAULT false,
    color         text,
    sort_order    integer NOT NULL DEFAULT 0
);

CREATE TABLE tickets (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number         text NOT NULL,
    project_id            uuid NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
    ticket_type_id        uuid NOT NULL REFERENCES ticket_types (id) ON DELETE RESTRICT,
    status                text NOT NULL DEFAULT 'draft'
                          REFERENCES ticket_statuses (code) ON UPDATE CASCADE,

    -- Who and what
    contractor_id         uuid REFERENCES contractors (id) ON DELETE RESTRICT,
    equipment_id          uuid REFERENCES equipment (id) ON DELETE RESTRICT,
    contract_id           uuid REFERENCES contracts (id) ON DELETE RESTRICT,
    zone_id               uuid REFERENCES project_zones (id) ON DELETE SET NULL,
    crew_id               uuid REFERENCES equipment (id) ON DELETE SET NULL,
    driver_name           text,
    barcode               text,

    -- Classification
    debris_type           text REFERENCES debris_types (code) ON UPDATE CASCADE,
    special_class         text,

    -- Origin (collection / loading event)
    origin_site_id        uuid REFERENCES disposal_sites (id) ON DELETE SET NULL,
    origin_address        text,
    origin_house_number   text,
    origin_street         text,
    origin_city           text,
    origin_state          text,
    origin_postal_code    text,
    origin_latitude       numeric(9, 6),
    origin_longitude      numeric(9, 6),
    origin_at             timestamptz,

    -- Destination (disposal / haul-out event)
    destination_site_id   uuid REFERENCES disposal_sites (id) ON DELETE SET NULL,
    destination_address   text,
    destination_latitude  numeric(9, 6),
    destination_longitude numeric(9, 6),
    destination_at        timestamptz,

    -- Measurement
    load_call_pct         numeric(5, 2),
    certified_capacity_cy numeric(10, 2),
    scale_ticket_number   text,
    gross_weight_lbs      numeric(12, 2),
    tare_weight_lbs       numeric(12, 2),
    net_weight_lbs        numeric(12, 2),
    quantity              numeric(14, 4),
    quantity_unit         text REFERENCES unit_types (code) ON UPDATE CASCADE,
    haul_distance_miles   numeric(10, 4),
    labor_hours           numeric(10, 2),
    equipment_hours       numeric(10, 2),

    -- Incident-specific
    incident_category_id  uuid REFERENCES incident_categories (id) ON DELETE SET NULL,
    severity              text,
    is_ongoing            boolean,

    -- Type-declared fields
    data                  jsonb NOT NULL DEFAULT '{}'::jsonb,
    notes                 text,

    -- Void / replacement workflow (carried from Open Recover 2014)
    is_void               boolean NOT NULL DEFAULT false,
    voided_at             timestamptz,
    voided_by             uuid REFERENCES users (id) ON DELETE SET NULL,
    void_reason           text,
    replaces_ticket_id    uuid REFERENCES tickets (id) ON DELETE SET NULL,

    -- Rules processing
    processing_state      text NOT NULL DEFAULT 'unprocessed',
    processed_at          timestamptz,
    processing_error      text,
    rules_matched         integer NOT NULL DEFAULT 0,

    -- Federation / sharing
    owner_instance_key    text,
    visibility_flag       text NOT NULL DEFAULT 'private'
                          REFERENCES visibility_flags (code) ON UPDATE CASCADE,
    allowed_viewers       text[] NOT NULL DEFAULT '{}',

    -- Provenance
    created_by            uuid REFERENCES users (id) ON DELETE SET NULL,
    completed_by          uuid REFERENCES users (id) ON DELETE SET NULL,
    completed_at          timestamptz,
    client_uuid           uuid,
    source                text NOT NULL DEFAULT 'field_app',
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    deleted_at            timestamptz,

    CONSTRAINT tickets_load_call_range CHECK (
        load_call_pct IS NULL OR load_call_pct BETWEEN 0 AND 100),
    CONSTRAINT tickets_severity_valid CHECK (
        severity IS NULL OR severity IN ('info', 'low', 'medium', 'high', 'critical')),
    CONSTRAINT tickets_processing_state_valid CHECK (processing_state IN (
        'unprocessed', 'queued', 'processed', 'no_match', 'error', 'excluded')),
    CONSTRAINT tickets_source_valid CHECK (source IN (
        'field_app', 'back_office', 'import', 'api', 'peer_sync')),
    CONSTRAINT tickets_origin_lat_range CHECK (
        origin_latitude IS NULL OR origin_latitude BETWEEN -90 AND 90),
    CONSTRAINT tickets_origin_lon_range CHECK (
        origin_longitude IS NULL OR origin_longitude BETWEEN -180 AND 180),
    CONSTRAINT tickets_void_has_reason CHECK (
        NOT is_void OR void_reason IS NOT NULL),
    CONSTRAINT tickets_data_is_object CHECK (jsonb_typeof(data) = 'object')
);

CREATE UNIQUE INDEX tickets_number_key
    ON tickets (lower(ticket_number)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX tickets_client_uuid_key
    ON tickets (client_uuid) WHERE client_uuid IS NOT NULL;
CREATE INDEX tickets_project_idx        ON tickets (project_id);
CREATE INDEX tickets_type_idx           ON tickets (ticket_type_id);
CREATE INDEX tickets_status_idx         ON tickets (project_id, status);
CREATE INDEX tickets_contractor_idx     ON tickets (contractor_id);
CREATE INDEX tickets_equipment_idx      ON tickets (equipment_id);
CREATE INDEX tickets_origin_at_idx      ON tickets (origin_at DESC);

-- M6: "the list pages without stalling" at tens of thousands of tickets.
--
-- The ticket list reads a view that carries per-ticket totals: how many
-- transactions, how much they came to, how many photos. Ordering a project's
-- tickets with only project_id indexed means every row in the project is read
-- and every one of those totals is computed before the sort throws all but the
-- first page away. At a hundred tickets nobody notices. At twenty-five thousand
-- it is a two second page.
--
-- One index per column the list actually sorts by turns that into an index
-- scan that stops after the page, so the totals are computed for the fifty rows
-- being shown and no others.
-- The null ordering has to match what the list asks for, or the index is not
-- usable for the sort and none of this helps. completed_at and origin_at are
-- nullable and the list puts those last; created_at and ticket_number are NOT
-- NULL and the list says nothing about nulls, so a plain index serves both
-- directions.
CREATE INDEX tickets_project_created_idx   ON tickets (project_id, created_at DESC);
CREATE INDEX tickets_project_completed_idx ON tickets (project_id, completed_at DESC NULLS LAST);
CREATE INDEX tickets_project_origin_idx    ON tickets (project_id, origin_at DESC NULLS LAST);
CREATE INDEX tickets_project_number_idx    ON tickets (project_id, ticket_number);
CREATE INDEX tickets_processing_idx     ON tickets (processing_state)
    WHERE processing_state IN ('unprocessed', 'queued', 'error');
CREATE INDEX tickets_barcode_idx        ON tickets (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX tickets_data_gin           ON tickets USING gin (data jsonb_path_ops);
CREATE INDEX tickets_allowed_viewers_idx ON tickets USING gin (allowed_viewers);
SELECT adms_attach_touch('tickets');

COMMENT ON COLUMN tickets.client_uuid IS
    'UUID minted by the field app before the ticket reaches the server. Makes '
    'offline queue replay idempotent.';
COMMENT ON COLUMN tickets.quantity IS
    'Explicit billable quantity for unit-rate work. When null the rules engine '
    'derives the quantity from ticket_metrics using the rate unit type.';

-- ---------------------------------------------------------------------------
-- Lifecycle stages. One row per stage the ticket type declares, created as the
-- field advances the ticket.
-- ---------------------------------------------------------------------------
CREATE TABLE ticket_stages (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id         uuid NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    stage_code        text NOT NULL,
    sequence          integer NOT NULL DEFAULT 0,
    status            text NOT NULL DEFAULT 'open',
    monitor_id        uuid REFERENCES users (id) ON DELETE SET NULL,
    monitor_name      text,
    monitor_code      text,
    site_id           uuid REFERENCES disposal_sites (id) ON DELETE SET NULL,
    latitude          numeric(9, 6),
    longitude         numeric(9, 6),
    accuracy_m        numeric(8, 2),
    address           text,
    debris_type       text REFERENCES debris_types (code) ON UPDATE CASCADE,
    load_call_pct     numeric(5, 2),
    scale_ticket_number text,
    weight_lbs        numeric(12, 2),
    occurred_at       timestamptz,
    data              jsonb NOT NULL DEFAULT '{}'::jsonb,
    notes             text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (ticket_id, stage_code),
    CONSTRAINT ticket_stages_status_valid CHECK (status IN (
        'open', 'complete', 'skipped', 'voided')),
    CONSTRAINT ticket_stages_load_call_range CHECK (
        load_call_pct IS NULL OR load_call_pct BETWEEN 0 AND 100)
);

CREATE INDEX ticket_stages_ticket_idx ON ticket_stages (ticket_id, sequence);
CREATE INDEX ticket_stages_monitor_idx ON ticket_stages (monitor_id);
SELECT adms_attach_touch('ticket_stages');

-- ---------------------------------------------------------------------------
-- GPS trail captured between stages.
-- ---------------------------------------------------------------------------
CREATE TABLE ticket_waypoints (
    id            bigserial PRIMARY KEY,
    ticket_id     uuid NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    sequence      integer NOT NULL,
    latitude      numeric(9, 6) NOT NULL,
    longitude     numeric(9, 6) NOT NULL,
    accuracy_m    numeric(8, 2),
    heading_deg   numeric(6, 2),
    speed_mph     numeric(8, 2),
    label         text,
    recorded_at   timestamptz NOT NULL DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (ticket_id, sequence),
    CONSTRAINT ticket_waypoints_lat_range CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT ticket_waypoints_lon_range CHECK (longitude BETWEEN -180 AND 180)
);

CREATE INDEX ticket_waypoints_ticket_idx ON ticket_waypoints (ticket_id, sequence);

-- ---------------------------------------------------------------------------
-- Photos, scanned documents, signatures.
-- ---------------------------------------------------------------------------
CREATE TABLE ticket_media (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id      uuid NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    stage_code     text,
    media_kind     text NOT NULL DEFAULT 'photo',
    description    text,
    storage_url    text NOT NULL,
    thumbnail_url  text,
    content_type   text,
    byte_size      bigint,
    checksum_sha256 text,
    width_px       integer,
    height_px      integer,
    latitude       numeric(9, 6),
    longitude      numeric(9, 6),
    captured_at    timestamptz,
    is_primary     boolean NOT NULL DEFAULT false,
    uploaded_by    uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    deleted_at     timestamptz,
    CONSTRAINT ticket_media_kind_valid CHECK (media_kind IN (
        'photo', 'scan', 'signature', 'document', 'video'))
);

CREATE UNIQUE INDEX ticket_media_one_primary
    ON ticket_media (ticket_id) WHERE is_primary AND deleted_at IS NULL;
CREATE INDEX ticket_media_ticket_idx ON ticket_media (ticket_id);
SELECT adms_attach_touch('ticket_media');

-- ---------------------------------------------------------------------------
-- Pending objects. The two hidden ticket types are modelled as short-lived
-- handoff rows keyed by the barcode the driver carries between monitors.
-- ---------------------------------------------------------------------------
CREATE TABLE pending_handoffs (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id      uuid NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    project_id     uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    handoff_kind   text NOT NULL,
    barcode        text NOT NULL,
    payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
    issued_by      uuid REFERENCES users (id) ON DELETE SET NULL,
    issued_at      timestamptz NOT NULL DEFAULT now(),
    claimed_by     uuid REFERENCES users (id) ON DELETE SET NULL,
    claimed_at     timestamptz,
    expires_at     timestamptz,
    CONSTRAINT pending_handoffs_kind_valid CHECK (handoff_kind IN (
        'pending_collection', 'pending_disposal', 'pending_haul_out'))
);

CREATE UNIQUE INDEX pending_handoffs_open_barcode
    ON pending_handoffs (project_id, barcode) WHERE claimed_at IS NULL;
CREATE INDEX pending_handoffs_ticket_idx ON pending_handoffs (ticket_id);
