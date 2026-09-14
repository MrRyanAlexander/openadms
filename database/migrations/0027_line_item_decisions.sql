-- =============================================================================
-- Open ADMS :: 0027 :: A line item decision belongs to a project, not a contract
--
-- 0018 put the accept and reject state on contract_line_items itself. That was
-- wrong, and the setup wizard is where it shows. A contract is a priced
-- schedule a contractor sends to client after client, and project_contracts is
-- many to many precisely so the same contract can sit on several projects. The
-- service codes built from it are project scoped and always were. The decision
-- that produces them was not, so:
--
--   * a line accepted on any earlier project read 'accepted' forever, the
--     review screen gave it no checkbox, and a new project could never build
--     its own service codes from that contract at all;
--   * accepted_service_code_id is a single column, so a second project's
--     acceptance would quietly overwrite the first project's provenance;
--   * a line rejected on one project was rejected everywhere, even on a
--     project where that work is genuinely billable. Standby time is the
--     obvious case.
--
-- The decision moves here, one row per project and line. contract_line_items
-- keeps its own status column as the contract level curation signal the parser
-- ranking pass learns from. It no longer gates a project.
-- =============================================================================

CREATE TABLE contract_line_item_decisions (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    contract_line_item_id uuid NOT NULL
        REFERENCES contract_line_items (id) ON DELETE CASCADE,
    status               text NOT NULL,
    -- The code this decision produced on this project. Null on a rejection,
    -- and nulled rather than orphaned if that code is later retired.
    service_code_id      uuid REFERENCES service_codes (id) ON DELETE SET NULL,
    reviewed_by          uuid REFERENCES users (id) ON DELETE SET NULL,
    reviewed_at          timestamptz NOT NULL DEFAULT now(),
    notes                text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT contract_line_item_decisions_status_valid
        CHECK (status IN ('accepted', 'rejected')),
    -- A rejection has nothing to point at. Saying so here stops a rejected row
    -- from carrying a stale code id forward.
    CONSTRAINT contract_line_item_decisions_code_matches_status
        CHECK (status = 'accepted' OR service_code_id IS NULL),
    UNIQUE (project_id, contract_line_item_id)
);

CREATE INDEX contract_line_item_decisions_line_idx
    ON contract_line_item_decisions (contract_line_item_id);
CREATE INDEX contract_line_item_decisions_project_idx
    ON contract_line_item_decisions (project_id, status);
SELECT adms_attach_touch('contract_line_item_decisions');

COMMENT ON TABLE contract_line_item_decisions IS
    'One row per project and contract line. A decision on one project says '
    'nothing about the same line on another project, which is what lets a '
    'contract be reused across declarations the way it is in the field.';

-- The same scope rule the service codes carry: a project can only rule on a
-- line that belongs to a contract actually linked to it.
CREATE OR REPLACE FUNCTION adms_check_line_item_decision_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_contract uuid;
BEGIN
    SELECT contract_id INTO v_contract
      FROM contract_line_items
     WHERE id = NEW.contract_line_item_id AND deleted_at IS NULL;

    IF v_contract IS NULL THEN
        RAISE EXCEPTION 'The contract line item does not exist'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM project_contracts pc
         WHERE pc.project_id = NEW.project_id AND pc.contract_id = v_contract
    ) THEN
        RAISE EXCEPTION
            'Contract % is not linked to project %', v_contract, NEW.project_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.service_code_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM service_codes sc
         WHERE sc.id = NEW.service_code_id AND sc.project_id = NEW.project_id
    ) THEN
        RAISE EXCEPTION
            'Service code % is not on project %', NEW.service_code_id, NEW.project_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_line_item_decision_scope
    BEFORE INSERT OR UPDATE ON contract_line_item_decisions
    FOR EACH ROW EXECUTE FUNCTION adms_check_line_item_decision_scope();

-- ---------------------------------------------------------------------------
-- Backfill. The service codes already in the database are the only honest
-- record of which project accepted which line, so they are read directly.
-- DISTINCT ON because nothing until now stopped two codes on one project from
-- naming the same line; the earliest one is the acceptance.
-- ---------------------------------------------------------------------------
INSERT INTO contract_line_item_decisions
    (project_id, contract_line_item_id, status, service_code_id,
     reviewed_by, reviewed_at, notes)
SELECT DISTINCT ON (sc.project_id, sc.contract_line_item_id)
       sc.project_id, sc.contract_line_item_id, 'accepted', sc.id,
       li.reviewed_by, COALESCE(li.reviewed_at, sc.created_at),
       'Backfilled in 0027 from the service code this line produced.'
  FROM service_codes sc
  JOIN contract_line_items li ON li.id = sc.contract_line_item_id
  -- Only where the link still stands. A project that has since dropped the
  -- contract keeps its codes but gets no decision row, which is the honest
  -- reading and keeps the scope trigger below from aborting the migration.
  JOIN project_contracts pc ON pc.project_id = sc.project_id
                           AND pc.contract_id = li.contract_id
 WHERE sc.contract_line_item_id IS NOT NULL
   AND sc.deleted_at IS NULL
   AND li.deleted_at IS NULL
 ORDER BY sc.project_id, sc.contract_line_item_id, sc.created_at;

-- A rejection produced no code, so it can only be read off the old column.
-- Applying it to every project the contract is on keeps what people are
-- currently looking at unchanged; from here a rejection is per project and
-- any one of them can be cleared without touching the others.
INSERT INTO contract_line_item_decisions
    (project_id, contract_line_item_id, status, reviewed_by, reviewed_at, notes)
SELECT pc.project_id, li.id, 'rejected', li.reviewed_by,
       COALESCE(li.reviewed_at, now()),
       'Backfilled in 0027 from the contract level rejection.'
  FROM contract_line_items li
  JOIN project_contracts pc ON pc.contract_id = li.contract_id
 WHERE li.status = 'rejected' AND li.deleted_at IS NULL
ON CONFLICT (project_id, contract_line_item_id) DO NOTHING;

-- Audit goes on after the backfill, so the history starts with real decisions
-- people made rather than a few hundred rows this migration wrote.
SELECT adms_attach_audit('contract_line_item_decisions');

-- ---------------------------------------------------------------------------
-- What the review screen reads. One row per project and line, so the same
-- contract shows a different, correct picture on each project it is on.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW contract_line_item_project_review AS
SELECT pc.project_id,
       li.id,
       li.contract_id,
       li.ingestion_id,
       c.contract_number,
       c.title                AS contract_title,
       li.line_number,
       li.item_code,
       li.description,
       li.unit_type_code,
       u.label                AS unit_label,
       u.abbreviation         AS unit_abbreviation,
       li.unit_price,
       li.debris_type_code,
       d.label                AS debris_label,
       li.service_category,
       -- A decision whose service code has since been retired is no decision
       -- at all: the line goes back on offer rather than sitting accepted with
       -- nothing to bill against.
       CASE
           WHEN dec.status = 'accepted' AND dec.service_code_id IS NOT NULL
                AND sc.id IS NULL THEN 'draft'
           ELSE COALESCE(dec.status, 'draft')
       END                    AS status,
       li.status              AS contract_status,
       dec.service_code_id    AS accepted_service_code_id,
       sc.code                AS service_code,
       li.source_page,
       li.extraction_confidence,
       dec.reviewed_by,
       dec.reviewed_at,
       li.created_at,
       -- The code this same line already carries on another project. The
       -- generator reuses it when it is free here, so one contract line reads
       -- the same on every project instead of picking up a new invented name.
       (SELECT s2.code
          FROM contract_line_item_decisions d2
          JOIN service_codes s2 ON s2.id = d2.service_code_id
         WHERE d2.contract_line_item_id = li.id
           AND d2.project_id <> pc.project_id
           AND d2.status = 'accepted'
           AND s2.deleted_at IS NULL
         ORDER BY d2.reviewed_at
         LIMIT 1)             AS code_used_elsewhere,
       (SELECT count(*)
          FROM contract_line_item_decisions d3
         WHERE d3.contract_line_item_id = li.id
           AND d3.project_id <> pc.project_id
           AND d3.status = 'accepted') AS accepted_on_other_projects
  FROM project_contracts pc
  JOIN contract_line_items li
    ON li.contract_id = pc.contract_id AND li.deleted_at IS NULL
  JOIN contracts c ON c.id = li.contract_id
  LEFT JOIN contract_line_item_decisions dec
    ON dec.contract_line_item_id = li.id AND dec.project_id = pc.project_id
  LEFT JOIN service_codes sc
    ON sc.id = dec.service_code_id AND sc.deleted_at IS NULL
  LEFT JOIN unit_types u ON u.code = li.unit_type_code
  LEFT JOIN debris_types d ON d.code = li.debris_type_code;

COMMENT ON VIEW contract_line_item_project_review IS
    'The review screen read. status here is this project''s decision; '
    'contract_status is the contract level curation flag 0018 introduced.';

-- The old contract wide view stays, because the contract detail screen is
-- about the contract rather than any one project. Its status column is now
-- documented for what it is.
COMMENT ON COLUMN contract_line_items.status IS
    'Contract level curation only, and the accept and reject history a later '
    'ranking pass learns from. A project decision lives in '
    'contract_line_item_decisions; this column does not gate one.';
