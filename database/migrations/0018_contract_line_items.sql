-- =============================================================================
-- Open ADMS :: 0018 :: Contract line items and the service code bridge
--
-- This is the structural gap under the whole automation idea. service_codes
-- carried project_id and contractor_id but no contract_id. Rules carried
-- contract_id, which meant the connection between what a contract says and
-- what the system bills only appeared at rule time, one layer too late. And
-- nothing held the contract's line items at all.
--
-- A contract PDF is a list of priced line items the contractor sends to clients
-- over and over. Each contract is treated as unique and only what is in that
-- contract goes in. Those line items are what service codes, rates and rules
-- are built from, so they belong in the database as rows.
--
-- The parser comes in a later pass. What lands here is the structure, the
-- manual and pasted entry path, and the accept and reject state the review
-- screen writes, because that accept and reject history is exactly what makes
-- ranking possible later.
-- =============================================================================

CREATE TABLE contract_line_items (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id           uuid NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
    line_number           integer,
    item_code             text,
    description           text NOT NULL,
    unit_type_code        text REFERENCES unit_types (code) ON UPDATE CASCADE,
    unit_price            numeric(14, 4),
    debris_type_code      text REFERENCES debris_types (code) ON UPDATE CASCADE,
    service_category      text,
    effective_from        date,
    effective_to          date,
    -- Where this line came from, kept whether a person typed it or a parser
    -- proposed it, so a wrong line can always be traced back to the page.
    source_page           integer,
    source_text           text,
    extraction_confidence numeric(4, 3),
    status                text NOT NULL DEFAULT 'draft',
    accepted_service_code_id uuid REFERENCES service_codes (id) ON DELETE SET NULL,
    reviewed_by           uuid REFERENCES users (id) ON DELETE SET NULL,
    reviewed_at           timestamptz,
    notes                 text,
    metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    deleted_at            timestamptz,
    CONSTRAINT contract_line_items_status_valid CHECK (status IN (
        'draft', 'accepted', 'rejected')),
    CONSTRAINT contract_line_items_price_positive CHECK (
        unit_price IS NULL OR unit_price >= 0),
    CONSTRAINT contract_line_items_confidence_range CHECK (
        extraction_confidence IS NULL
        OR (extraction_confidence >= 0 AND extraction_confidence <= 1)),
    CONSTRAINT contract_line_items_dates_ordered CHECK (
        effective_to IS NULL OR effective_from IS NULL
        OR effective_to >= effective_from)
);

CREATE INDEX contract_line_items_contract_idx
    ON contract_line_items (contract_id) WHERE deleted_at IS NULL;
CREATE INDEX contract_line_items_status_idx
    ON contract_line_items (contract_id, status) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX contract_line_items_number_key
    ON contract_line_items (contract_id, line_number)
    WHERE deleted_at IS NULL AND line_number IS NOT NULL;
SELECT adms_attach_touch('contract_line_items');
SELECT adms_attach_audit('contract_line_items');

COMMENT ON COLUMN contract_line_items.status IS
    'draft until a person rules on it. The accept and reject history this '
    'produces is what a later ranking pass learns from.';

-- ---------------------------------------------------------------------------
-- The bridge. A service code now says which contract, and which line of it, it
-- came from.
-- ---------------------------------------------------------------------------
ALTER TABLE service_codes
    ADD COLUMN contract_id uuid REFERENCES contracts (id) ON DELETE RESTRICT,
    ADD COLUMN contract_line_item_id uuid
        REFERENCES contract_line_items (id) ON DELETE SET NULL;

CREATE INDEX service_codes_contract_idx ON service_codes (contract_id)
    WHERE contract_id IS NOT NULL;

COMMENT ON COLUMN service_codes.contract_id IS
    'The contract this code bills under. Rules already carried this; having it '
    'here is what lets a contract be traced to its billing without a rule.';

-- A service code may only point at a contract that is on its project, and at a
-- line item belonging to that same contract. Both halves in one trigger, so
-- neither can be satisfied alone.
CREATE OR REPLACE FUNCTION adms_check_service_code_contract()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_line_contract uuid;
BEGIN
    IF NEW.contract_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM project_contracts pc
         WHERE pc.project_id = NEW.project_id
           AND pc.contract_id = NEW.contract_id
    ) THEN
        RAISE EXCEPTION
            'Contract % is not linked to project %', NEW.contract_id, NEW.project_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.contract_line_item_id IS NOT NULL THEN
        SELECT contract_id INTO v_line_contract
          FROM contract_line_items
         WHERE id = NEW.contract_line_item_id AND deleted_at IS NULL;

        IF v_line_contract IS NULL THEN
            RAISE EXCEPTION 'The contract line item does not exist'
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF NEW.contract_id IS NULL THEN
            NEW.contract_id := v_line_contract;
        ELSIF NEW.contract_id <> v_line_contract THEN
            RAISE EXCEPTION
                'Line item % belongs to contract %, not to contract %',
                NEW.contract_line_item_id, v_line_contract, NEW.contract_id
                USING ERRCODE = 'check_violation';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM project_contracts pc
             WHERE pc.project_id = NEW.project_id
               AND pc.contract_id = v_line_contract
        ) THEN
            RAISE EXCEPTION
                'Contract % is not linked to project %', v_line_contract, NEW.project_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_service_codes_contract_scope
    BEFORE INSERT OR UPDATE ON service_codes
    FOR EACH ROW EXECUTE FUNCTION adms_check_service_code_contract();

-- ---------------------------------------------------------------------------
-- Staging for contract intake. Created now so the parser pass needs no further
-- migration, and so the review screen can be built and tested against real
-- rows before anything is reading PDFs.
-- ---------------------------------------------------------------------------
CREATE TABLE contract_ingestions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id     uuid NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
    document_id     uuid REFERENCES documents (id) ON DELETE SET NULL,
    status          text NOT NULL DEFAULT 'registered',
    uploaded_by     uuid REFERENCES users (id) ON DELETE SET NULL,
    parsed_at       timestamptz,
    parser_version  text,
    raw_payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
    proposed_count  integer NOT NULL DEFAULT 0,
    accepted_count  integer NOT NULL DEFAULT 0,
    rejected_count  integer NOT NULL DEFAULT 0,
    error           text,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT contract_ingestions_status_valid CHECK (status IN (
        'registered', 'parsing_not_enabled', 'parsed', 'reviewed', 'failed'))
);

CREATE INDEX contract_ingestions_contract_idx ON contract_ingestions (contract_id);
SELECT adms_attach_touch('contract_ingestions');

COMMENT ON TABLE contract_ingestions IS
    'One row per contract document staged for line item extraction. Until the '
    'parser ships, rows sit in parsing_not_enabled and the interface says so.';

-- Which staged document a line item came from. Declared here rather than in a
-- later migration because contract_ingestions does not exist until this point,
-- and because Phase 6 was promised no further migration.
ALTER TABLE contract_line_items
    ADD COLUMN ingestion_id uuid REFERENCES contract_ingestions (id) ON DELETE SET NULL;

CREATE INDEX contract_line_items_ingestion_idx ON contract_line_items (ingestion_id)
    WHERE ingestion_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- What the review screen and the contract detail view both read.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW contract_line_item_review AS
SELECT li.id,
       li.contract_id,
       li.ingestion_id,
       c.contract_number,
       c.title              AS contract_title,
       li.line_number,
       li.item_code,
       li.description,
       li.unit_type_code,
       u.label              AS unit_label,
       u.abbreviation       AS unit_abbreviation,
       li.unit_price,
       li.debris_type_code,
       d.label              AS debris_label,
       li.service_category,
       li.status,
       li.accepted_service_code_id,
       sc.code              AS service_code,
       li.source_page,
       li.extraction_confidence,
       li.reviewed_by,
       li.reviewed_at,
       li.created_at
  FROM contract_line_items li
  JOIN contracts c ON c.id = li.contract_id
  LEFT JOIN unit_types u ON u.code = li.unit_type_code
  LEFT JOIN debris_types d ON d.code = li.debris_type_code
  LEFT JOIN service_codes sc ON sc.id = li.accepted_service_code_id
 WHERE li.deleted_at IS NULL;
