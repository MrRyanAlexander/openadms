-- Guard: forms, the debris types on them, and the firm's own fields (spec/DATA-MODEL.md §2.2
-- (Assignment), §3 "Contracts and forms"; ARCHITECTURE §5; ADR-113, 160, 188, 211, 214, 271, 278,
-- 308; REQ-101, 105a). Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The models are the migration before this one. Here: each new table's guards, and the checks
-- Prisma can't declare. That a project has at most one form of each document type, that a debris
-- type is on a form once, and that a definition's versions don't repeat, are the unique keys of the
-- models' migration; that a debris type's entry and a definition sit on their form, with its
-- document type, is their two-column foreign keys.

-- 1. The new configuration tables, one line each (ADR-271): the API writes them, the worker reads
-- them, nothing is deleted, every change is audited. No read-only viewer sees any of them: none has
-- a viewer view or a grant to adms_readonly, so none needs row-level security (as ADR-281, 286,
-- 302, 303 and 305 decided for the other setup tables; what a viewer sees of a project's setup comes
-- with BACKLOG 1.1.10).
SELECT guard_table('form', 'CONFIGURATION', 'OPERATIONS');
SELECT guard_table('form_debris_type', 'CONFIGURATION', 'OPERATIONS');
SELECT guard_table('form_definition', 'CONFIGURATION', 'OPERATIONS');

-- 2. A definition's version is never edited (ADR-278): the API adds a version and reads them,
-- never updates one, and nobody else may either. Deletes and truncates are refused by section 1.
REVOKE UPDATE ON "form_definition" FROM adms_api;
CREATE FUNCTION refuse_edit() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'Open ADMS never edits a % row: a change is a new version', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER "form_definition_refuse_edit" BEFORE UPDATE ON "form_definition"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();

-- Versions count from 1; the fields are a list (each field's shape is packages/contracts').
ALTER TABLE "form_definition" ADD CONSTRAINT "form_definition_version_check" CHECK ("version" >= 1);
ALTER TABLE "form_definition" ADD CONSTRAINT "form_definition_fields_check" CHECK (
  jsonb_typeof("fields") = 'array'
);

-- 3. Which forms hold what (ADR-308): the firm's own fields only on the four kinds of record that
-- have somewhere to keep the answers (ADR-160, 188); debris types only on a load or haul-out form
-- (ADR-211, 214). Each row repeats its form's document type, which its foreign key holds to the
-- form's own.
ALTER TABLE "form_definition" ADD CONSTRAINT "form_definition_document_type_check" CHECK (
  "document_type" IN ('ROE', 'SURVEY', 'INCIDENT', 'DROP_OFF_LOG')
);
ALTER TABLE "form_debris_type" ADD CONSTRAINT "form_debris_type_document_type_check" CHECK (
  "document_type" IN ('LOAD', 'HAUL_OUT')
);

-- 4. "GPS required" is the ROE form's setting, stated there and on no other form (ADR-181).
ALTER TABLE "form" ADD CONSTRAINT "form_gps_required_check" CHECK (
  ("document_type" = 'ROE') = ("gps_required" IS NOT NULL)
);

-- 5. The forms an assignment names are the four that aren't a ticket's: a ticket's kinds are its
-- field event kinds, and certifying is its own setting (C42; ADR-240, 308). Never null: an
-- assignment that names none holds an empty list.
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_form_document_types_check" CHECK (
  "form_document_types" IS NOT NULL
  AND "form_document_types" <@ ARRAY['ROE', 'SURVEY', 'INCIDENT', 'DROP_OFF_LOG']::"form_document_type"[]
);
