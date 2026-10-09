-- Guard: the master passcode's own actor, and wrong tries at the passcode (spec/DATA-MODEL.md
-- §2.2; spec/acceptance/10-api-and-sync.md AC-10-22; spec/THREAT-MODEL.md §5 (4); ARCHITECTURE
-- §5.1…§5.3, §6, §7.5; ADR-106, 113, 240, 273, 276, 281, 399, 401, 438, 439; BACKLOG 2.5.1, C45,
-- C88; REQ-209). Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The role, the two security event kinds and the table are the migration before this one.
--
-- Whoever holds the master passcode is not known, so an act under it (enrolling a phone; later,
-- creating a monitor) is written as a user that is no person: the master passcode's actor (user
-- 00000000-0000-7000-8000-000000000002, role MASTER_PASSCODE), made by the installer's seed as
-- the system actor is (packages/db/src/master-passcode-actor.ts). Now:
--   1. a write stating it is refused unless adms_api makes it, with source DEVICE;
--   2. no login but adms_owner may change its row, make it, or give anyone role MASTER_PASSCODE;
--   3. the role belongs to that one id only, which is never a person: no Monitor ID, contractor,
--      employer, contact or viewer's settings, and never archived;
--   4. no record names it: every column that names a user refuses it, but the audit record's
--      actor, which is the one place it is written;
--   5. the record of wrong tries has its own guards, as sign-in's records have.

-- 1. The audit guard's writer, as before (the system actor's guard), refusing the master
-- passcode's actor from anyone but the API, and with any source but DEVICE.
CREATE OR REPLACE FUNCTION audit_write(
  table_name text,
  record_id text,
  operation audit_operation,
  prior_value jsonb,
  new_value jsonb,
  changed_fields text[],
  domain audit_domain
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor uuid := audit_actor(table_name);
  source text := nullif(current_setting('adms.source', true), '');
  login text := writing_login();
BEGIN
  IF source IS NULL THEN
    RAISE EXCEPTION 'A write to % needs its source: state adms.source before writing', table_name
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF actor = '00000000-0000-7000-8000-000000000001' AND login NOT IN ('adms_worker', 'adms_owner') THEN
    RAISE EXCEPTION 'Only the worker writes as the system actor: % may not state it (a write to %)', login, table_name
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF source = 'SYSTEM' AND login NOT IN ('adms_worker', 'adms_owner') THEN
    RAISE EXCEPTION 'Only the worker writes with source SYSTEM: % may not state it (a write to %)', login, table_name
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF actor = '00000000-0000-7000-8000-000000000002' AND login <> 'adms_api' THEN
    RAISE EXCEPTION 'Only the API writes as the master passcode''s actor: % may not state it (a write to %)', login, table_name
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF actor = '00000000-0000-7000-8000-000000000002' AND source <> 'DEVICE' THEN
    RAISE EXCEPTION 'The master passcode''s actor writes only for a phone: source % may not be stated with it (a write to %)', source, table_name
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO "audit_record" (
    "table_name", "record_id", "operation", "prior_value", "new_value", "changed_fields",
    "actor_id", "device_id", "source", "reason", "request_id", "domain"
  ) VALUES (
    audit_write.table_name, audit_write.record_id, audit_write.operation, audit_write.prior_value,
    audit_write.new_value, audit_write.changed_fields, actor,
    nullif(current_setting('adms.device_id', true), '')::uuid,
    source::audit_source,
    nullif(current_setting('adms.reason', true), ''),
    nullif(current_setting('adms.request_id', true), ''),
    audit_write.domain
  );
END;
$$;

-- 2. The two users that are no person: each made by the seed, then never changed by a runtime
-- login, and nobody else is given either's role or id. The system actor's half is as before.
CREATE OR REPLACE FUNCTION user_system_actor_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user = 'adms_owner' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."id" = '00000000-0000-7000-8000-000000000001' THEN
    RAISE EXCEPTION 'The system actor can''t be changed: % may not update it', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."id" = '00000000-0000-7000-8000-000000000001' OR NEW."role" = 'SYSTEM' THEN
    RAISE EXCEPTION 'Only the installer''s seed makes the system actor: % may not write role SYSTEM or its id', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."id" = '00000000-0000-7000-8000-000000000002' THEN
    RAISE EXCEPTION 'The master passcode''s actor can''t be changed: % may not update it', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."id" = '00000000-0000-7000-8000-000000000002' OR NEW."role" = 'MASTER_PASSCODE' THEN
    RAISE EXCEPTION 'Only the installer''s seed makes the master passcode''s actor: % may not write role MASTER_PASSCODE or its id', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Role MASTER_PASSCODE on the one id only, and never a person's.
ALTER TABLE "user" ADD CONSTRAINT "user_master_passcode_actor_check" CHECK (
  ("role" = 'MASTER_PASSCODE') = ("id" = '00000000-0000-7000-8000-000000000002')
  AND (
    "role" <> 'MASTER_PASSCODE'
    OR (
      "monitor_number" IS NULL AND "contractor_id" IS NULL AND "employer_id" IS NULL
      AND "employer_number" IS NULL AND "email" IS NULL AND "phone" IS NULL
      AND "viewer_kind" IS NULL AND "sees_private_citizens" IS NULL AND "archived_at" IS NULL
    )
  )
);

-- 4. No record names it. Every column that names a user gets a check refusing its id: it is
-- never who a record is about, who made it, who holds a permission or who signs in. The one
-- exception is the audit record's actor. Written from the catalog, so none is missed; a later
-- table that names a user adds the same check in its own guard (the database tests hold every
-- such column to it).
DO $$
DECLARE
  named record;
BEGIN
  FOR named IN
    SELECT t.relname AS table_name, a.attname AS column_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = '"user"'::regclass
      AND c.connamespace = 'public'::regnamespace
      AND NOT (t.relname = 'audit_record' AND a.attname = 'actor_id')
    ORDER BY t.relname, a.attname
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (%I IS DISTINCT FROM %L::uuid)',
      named.table_name,
      named.table_name || '_' || named.column_name || '_not_master_passcode_check',
      named.column_name,
      '00000000-0000-7000-8000-000000000002'
    );
  END LOOP;
END;
$$;

-- 5. Wrong tries at a version of the master passcode: the API reads the record, adds it and
-- changes its count and its wait; the worker and the read-only login hold nothing on it;
-- nothing is deleted; every write is audited in the security domain. Which version it is of
-- never changes, and a count is never below nought.
REVOKE ALL ON "master_passcode_tries" FROM PUBLIC, adms_api, adms_worker;
GRANT SELECT, INSERT, UPDATE ON "master_passcode_tries" TO adms_api;
CREATE TRIGGER "master_passcode_tries_refuse_delete" BEFORE DELETE ON "master_passcode_tries"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "master_passcode_tries_refuse_truncate" BEFORE TRUNCATE ON "master_passcode_tries"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "master_passcode_tries_audit" AFTER INSERT OR UPDATE ON "master_passcode_tries"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('SECURITY');
CREATE TRIGGER "master_passcode_tries_refuse_version_edit" BEFORE UPDATE OF "id", "version", "created_at"
  ON "master_passcode_tries" FOR EACH ROW EXECUTE FUNCTION refuse_edit();
ALTER TABLE "master_passcode_tries" ADD CONSTRAINT "master_passcode_tries_failed_tries_check" CHECK (
  "failed_tries" >= 0
);
