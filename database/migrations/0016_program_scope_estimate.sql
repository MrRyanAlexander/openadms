-- =============================================================================
-- Open ADMS :: 0016 :: Program, confirmed scope, and the debris estimate
--
-- Three gaps, one subject: what work did the client actually authorise, and how
-- much of it is there.
--
--   programs          what kind of program this is, as data rather than a
--                     free-text label nothing can be filtered on
--   project_scopes    which debris streams the client confirmed. Nothing is
--                     assumed; a stream that is not here is not in scope
--   project_estimates how much of each stream is expected. Append-only, so the
--                     client's opening number and every revision both survive
--
-- The estimate is a real number, never a range. A bucket of 100 to 500 cannot
-- answer "are we at 60 percent of the hanger estimate", which is the question
-- asked by week three. Where a number is not known, the row is simply absent:
-- a null estimate is honest, a bucket is fake precision.
-- =============================================================================

CREATE TABLE programs (
    code            text PRIMARY KEY,
    label           text NOT NULL,
    description     text,
    -- Which streams to pre-select when this program is chosen. A hint at the
    -- setup screen and nothing more: it never gates what can be enabled,
    -- because the contract, not the program name, decides the work.
    default_debris_types text[] NOT NULL DEFAULT '{}',
    is_active       boolean NOT NULL DEFAULT true,
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE projects
    ADD COLUMN program_code text REFERENCES programs (code) ON UPDATE CASCADE;

CREATE INDEX projects_program_idx ON projects (program_code)
    WHERE program_code IS NOT NULL;

COMMENT ON COLUMN projects.program_code IS
    'The kind of program, as data. Filterable, and drives which debris streams '
    'the scope step offers first.';
COMMENT ON COLUMN projects.program IS
    'Free-text sub-label kept for the client''s own wording, for example '
    '"ROW Collection, Phase 2". program_code is the classification.';

-- ---------------------------------------------------------------------------
-- The unit an estimate for a stream is counted in is a property of the stream,
-- not a choice anyone should be asked to make. Cubic yards for vegetative,
-- C&D and mixed; each for hangers, leaners, stumps and white goods.
-- ---------------------------------------------------------------------------
ALTER TABLE debris_types
    ADD COLUMN estimate_unit_type_code text REFERENCES unit_types (code) ON UPDATE CASCADE;

COMMENT ON COLUMN debris_types.estimate_unit_type_code IS
    'How this stream is estimated and measured against production. Fixed here '
    'so tree work is counted each without anyone choosing.';

-- ---------------------------------------------------------------------------
-- Confirmed scope. A stream appears here because someone confirmed it, and the
-- ticket types offered on the project follow from it.
-- ---------------------------------------------------------------------------
CREATE TABLE project_scopes (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    debris_type_code  text NOT NULL REFERENCES debris_types (code) ON UPDATE CASCADE,
    is_enabled        boolean NOT NULL DEFAULT true,
    confirmed_by      uuid REFERENCES users (id) ON DELETE SET NULL,
    confirmed_on      date NOT NULL DEFAULT current_date,
    notes             text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, debris_type_code)
);

CREATE INDEX project_scopes_project_idx ON project_scopes (project_id);
SELECT adms_attach_touch('project_scopes');
SELECT adms_attach_audit('project_scopes');

COMMENT ON TABLE project_scopes IS
    'Debris streams the client confirmed. Never assume scope: a stream that is '
    'not enabled here was not authorised.';

-- ---------------------------------------------------------------------------
-- Estimates. Append-only by as_of_date: the current estimate is the newest row
-- for a stream, and the original client number stays readable underneath it.
-- ---------------------------------------------------------------------------
CREATE TABLE project_estimates (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    debris_type_code   text NOT NULL REFERENCES debris_types (code) ON UPDATE CASCADE,
    estimated_quantity numeric(16, 2) NOT NULL,
    unit_type_code     text NOT NULL REFERENCES unit_types (code) ON UPDATE CASCADE,
    source             text NOT NULL DEFAULT 'client',
    confidence         text NOT NULL DEFAULT 'rough',
    as_of_date         date NOT NULL DEFAULT current_date,
    notes              text,
    created_by         uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_estimates_quantity_positive CHECK (estimated_quantity > 0),
    CONSTRAINT project_estimates_source_valid CHECK (source IN (
        'client', 'field_survey', 'historical', 'contractor', 'other')),
    CONSTRAINT project_estimates_confidence_valid CHECK (confidence IN (
        'rough', 'client_provided', 'surveyed'))
);

CREATE INDEX project_estimates_project_idx
    ON project_estimates (project_id, debris_type_code, as_of_date DESC, created_at DESC);
SELECT adms_attach_audit('project_estimates');

COMMENT ON TABLE project_estimates IS
    'Append-only. A revision is a new row, never an edit, so the number the '
    'client first gave is still there when someone asks what changed.';

CREATE OR REPLACE FUNCTION adms_estimates_are_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'Estimates are append-only. Record a revision as a new row with a later '
        'as_of_date rather than editing this one.'
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER trg_project_estimates_append_only
    BEFORE UPDATE OR DELETE ON project_estimates
    FOR EACH ROW EXECUTE FUNCTION adms_estimates_are_append_only();

-- ---------------------------------------------------------------------------
-- The current estimate per stream, and how far production has run against it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW project_estimate_current AS
SELECT DISTINCT ON (e.project_id, e.debris_type_code)
       e.project_id,
       e.debris_type_code,
       d.label            AS debris_label,
       e.estimated_quantity,
       e.unit_type_code,
       u.abbreviation     AS unit_abbreviation,
       e.source,
       e.confidence,
       e.as_of_date,
       e.notes,
       e.created_at,
       (SELECT count(*) FROM project_estimates p
         WHERE p.project_id = e.project_id
           AND p.debris_type_code = e.debris_type_code) AS revision_count
  FROM project_estimates e
  JOIN debris_types d ON d.code = e.debris_type_code
  JOIN unit_types u ON u.code = e.unit_type_code
 ORDER BY e.project_id, e.debris_type_code, e.as_of_date DESC, e.created_at DESC;
