-- Guard: the firm's lists (spec/LISTS.md, "Built-in values plus the firm's own"; spec/DATA-MODEL.md
-- §2.3; ARCHITECTURE §5; ADR-070, 113, 194, 271, 302; REQ-106c).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The eighteen list tables are the migration before this one. Each is configuration: the API
-- writes it (an admin adds, renames and archives the firm's own values), the worker reads it,
-- nothing is deleted, every change is audited (guard_table, ADR-271). A list also holds the
-- built-in values, the few the system acts on, each known by its fixed key (the closed set is
-- packages/domain's). Two rules about them are the database's own to keep:
--   1. only a release writes a key. The seed and the migrations run as adms_owner; no other login
--      may add a row with a key, or give, change or take away a key. So a firm's own value never
--      has one, and a built-in value's never changes;
--   2. a value with a key is never archived, by anyone: it is part of the product.
-- A built-in value's name and position stay the firm's to change.
--
-- No read-only viewer sees a list yet: none has a viewer view or a grant to adms_readonly, so none
-- needs row-level security (as ADR-281 and 286 decided for the other setup tables; the views a
-- viewer needs come with BACKLOG 1.1.10).

-- Rule 1. Runs with the writer's own rights, so current_user is the login (or the role a test set),
-- as the system actor's guard does.
CREATE FUNCTION list_built_in_key_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user = 'adms_owner' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW."key" IS NOT NULL THEN
    RAISE EXCEPTION 'Only a release adds a built-in value: % may not write a % row with a key', current_user, TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."key" IS DISTINCT FROM OLD."key" THEN
    RAISE EXCEPTION 'A key is a release''s to write: % may not change the key of a % row', current_user, TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- One line guards a list: guard_table's grants, delete and truncate refusals and audit trigger for
-- a configuration table, then the two rules above. Safe to repeat. The owner's alone, like
-- guard_table (the grants guard's default: no login may call a function it isn't granted).
--   SELECT guard_list('site_type', 'OPERATIONS');
CREATE FUNCTION guard_list(table_name text, domain audit_domain) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  target regclass;
BEGIN
  PERFORM guard_table(table_name, 'CONFIGURATION', domain);
  target := to_regclass(format('public.%I', table_name));
  IF (
    SELECT count(*) FROM pg_attribute
    WHERE attrelid = target AND attname IN ('key', 'archived_at') AND attnum > 0 AND NOT attisdropped
  ) <> 2 THEN
    RAISE EXCEPTION 'guard_list: % is not a list (a list has a key and an archived_at column)', table_name;
  END IF;
  EXECUTE format(
    'ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I',
    target, table_name || '_built_in_never_archived_check'
  );
  EXECUTE format(
    'ALTER TABLE %s ADD CONSTRAINT %I CHECK ("key" IS NULL OR "archived_at" IS NULL)',
    target, table_name || '_built_in_never_archived_check'
  );
  EXECUTE format(
    'CREATE OR REPLACE TRIGGER %I BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION list_built_in_key_guard()',
    table_name || '_built_in_key', target
  );
END;
$$;

-- The eighteen lists. All in the operations domain: none holds a rate, a login or a ticket.
SELECT guard_list('program_type', 'OPERATIONS');
SELECT guard_list('declaration_reference_type', 'OPERATIONS');
SELECT guard_list('debris_type', 'OPERATIONS');
SELECT guard_list('reduction_method', 'OPERATIONS');
SELECT guard_list('payable_type', 'OPERATIONS');
SELECT guard_list('kind_of_work', 'OPERATIONS');
SELECT guard_list('item_name', 'OPERATIONS');
SELECT guard_list('vehicle_type', 'OPERATIONS');
SELECT guard_list('vehicle_feature', 'OPERATIONS');
SELECT guard_list('crew_type', 'OPERATIONS');
SELECT guard_list('site_type', 'OPERATIONS');
SELECT guard_list('site_label', 'OPERATIONS');
SELECT guard_list('incident_type', 'OPERATIONS');
SELECT guard_list('incident_sub_type', 'OPERATIONS');
SELECT guard_list('reason', 'OPERATIONS');
SELECT guard_list('survey_work_type', 'OPERATIONS');
SELECT guard_list('clock_activity', 'OPERATIONS');
SELECT guard_list('field_tag', 'OPERATIONS');
