-- Guard: a resolution's own guard asked after the tables' checks (ADR-113, 526 (7); BACKLOG
-- 2.8.4). Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The migration before this one asked whether a held record's or a file set aside's resolution
-- is written once, from the back office, by the person it names, in a trigger run before the
-- row's own checks: so a resolution that names nobody, or the system actor, was refused as one
-- not written by its person, never by the check that says what it is (found reading
-- syncs.test.ts's refusals after the migration was applied to this installation, and an applied
-- migration is never edited). The
-- same function, now run after the checks: a resolution that isn't one is refused by them
-- first, and one that is, by this, as before.

DROP TRIGGER "held_record_resolved_once" ON "held_record";
DROP TRIGGER "set_aside_file_resolved_once" ON "set_aside_file";

CREATE OR REPLACE FUNCTION resolved_once_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."resolved_by_id" IS NOT DISTINCT FROM OLD."resolved_by_id"
    AND NEW."resolved_at" IS NOT DISTINCT FROM OLD."resolved_at"
    AND NEW."resolution" IS NOT DISTINCT FROM OLD."resolution" THEN
    RETURN NULL;
  END IF;
  IF num_nonnulls(OLD."resolved_by_id", OLD."resolved_at", OLD."resolution") > 0 THEN
    RAISE EXCEPTION 'A % is resolved once', TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF nullif(current_setting('adms.source', true), '') IS DISTINCT FROM 'BACK_OFFICE'
    OR nullif(current_setting('adms.actor_id', true), '') IS DISTINCT FROM NEW."resolved_by_id"::text THEN
    RAISE EXCEPTION 'A % is resolved by a person at the back office, who is named on it', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "held_record_resolved_once"
  AFTER UPDATE OF "resolved_by_id", "resolved_at", "resolution" ON "held_record"
  FOR EACH ROW EXECUTE FUNCTION resolved_once_guard();
CREATE TRIGGER "set_aside_file_resolved_once"
  AFTER UPDATE OF "resolved_by_id", "resolved_at", "resolution" ON "set_aside_file"
  FOR EACH ROW EXECUTE FUNCTION resolved_once_guard();
