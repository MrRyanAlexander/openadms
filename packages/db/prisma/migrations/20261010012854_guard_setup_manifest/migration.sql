-- Guard: a setup version (spec/DATA-MODEL.md §4.5; spec/acceptance/02-people-and-devices.md
-- AC-02-37, AC-02-43; spec/acceptance/05-sync.md AC-05-48; ARCHITECTURE §5.1…§5.3, §7's note,
-- §9 (6); ADR-097, 113, 240, 440, 449, 453; invariants 1, 3; BACKLOG 2.5.3, C117, C118;
-- REQ-203). Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The table is the migration before this one. Its guards are its own, since no kind of
-- guard_table's fits: the API reads a version and adds one, and nobody changes one; the worker
-- and the read-only viewers read none; nothing is deleted; every one made is audited as a record.
-- Now:
--   1. the grants, the delete and truncate refusals, the audit trigger, and no edit by anyone;
--   2. what a version holds is an object;
--   3. a version is made only for a phone, stated by name: it is what a phone was sent;
--   4. a project's versions are numbered 1, 2, 3… with no gap, and a new one is made only when
--      what its phones are shown differs from the version before. Two made at one moment are
--      taken one after the other (the lock is this rule's own and ends with the piece of work).

-- 1.
REVOKE ALL ON "setup_manifest" FROM PUBLIC, adms_api, adms_worker;
GRANT SELECT, INSERT ON "setup_manifest" TO adms_api;
CREATE TRIGGER "setup_manifest_refuse_delete" BEFORE DELETE ON "setup_manifest"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "setup_manifest_refuse_truncate" BEFORE TRUNCATE ON "setup_manifest"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "setup_manifest_audit" AFTER INSERT OR UPDATE ON "setup_manifest"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('RECORDS');
CREATE TRIGGER "setup_manifest_refuse_edit" BEFORE UPDATE ON "setup_manifest"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();

-- 2.
ALTER TABLE "setup_manifest" ADD CONSTRAINT "setup_manifest_content_check" CHECK (
  jsonb_typeof("content") = 'object'
);

-- 3 and 4. Asked when a version is made.
CREATE FUNCTION setup_manifest_numbered_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  newest_version integer;
  newest_content jsonb;
BEGIN
  IF nullif(current_setting('adms.source', true), '') IS DISTINCT FROM 'DEVICE'
    OR nullif(current_setting('adms.device_id', true), '') IS NULL THEN
    RAISE EXCEPTION 'A setup version is made when a phone is sent its lists: state the phone'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('open-adms: setup version ' || NEW."project_id"::text, 0)
  );
  SELECT "version", "content" INTO newest_version, newest_content
    FROM "setup_manifest" WHERE "project_id" = NEW."project_id"
    ORDER BY "version" DESC LIMIT 1;
  IF NEW."version" IS DISTINCT FROM coalesce(newest_version, 0) + 1 THEN
    RAISE EXCEPTION 'A project''s setup versions are numbered 1, 2, 3…: its next is %, not %',
      coalesce(newest_version, 0) + 1, NEW."version"
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF newest_content IS NOT DISTINCT FROM NEW."content" THEN
    RAISE EXCEPTION 'A new setup version is made only when what the project''s phones are shown has changed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "setup_manifest_numbered" BEFORE INSERT ON "setup_manifest"
  FOR EACH ROW EXECUTE FUNCTION setup_manifest_numbered_guard();
