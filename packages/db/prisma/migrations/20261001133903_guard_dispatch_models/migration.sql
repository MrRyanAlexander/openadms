-- Guard: the time zone, device, assignment and Monitor ID models (REQ-019, 020, 021; ARCHITECTURE
-- §5, §7, §10; ADR-100, 113, 240, 271, 281; BACKLOG carry-forward C12-C15).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The models are the migration before this one. Here: each new table's guards, the checks Prisma
-- can't declare, and one change to the audit capture, so a secret column is never copied into the
-- audit log.

-- 1. The audit capture, as before (the audit capture guard), now leaving named columns out of what
-- it copies. A trigger names them after its domain: audit_capture('SECURITY', 'hash'). The audit
-- record still says the column changed (changed_fields), who changed it and when; its value, before
-- and after, is replaced by a marker. The logins that may read the audit log (the API and the
-- worker) so never read a secret out of it.
CREATE OR REPLACE FUNCTION audit_capture() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_value jsonb := to_jsonb(NEW);
  prior_value jsonb;
  changed_fields text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(field ORDER BY field) INTO changed_fields FROM jsonb_object_keys(new_value) AS field;
  ELSE
    prior_value := to_jsonb(OLD);
    SELECT array_agg(field.key ORDER BY field.key) INTO changed_fields
      FROM jsonb_each(new_value) AS field
      WHERE field.value IS DISTINCT FROM prior_value -> field.key;
    IF changed_fields IS NULL THEN
      PERFORM audit_actor(TG_TABLE_NAME);
      RETURN NULL;
    END IF;
  END IF;
  FOR argument IN 1 .. TG_NARGS - 1 LOOP
    new_value := jsonb_set(new_value, ARRAY[TG_ARGV[argument]], '"[kept out of the audit]"', false);
    IF prior_value IS NOT NULL THEN
      prior_value := jsonb_set(prior_value, ARRAY[TG_ARGV[argument]], '"[kept out of the audit]"', false);
    END IF;
  END LOOP;
  PERFORM audit_write(
    TG_TABLE_NAME, new_value ->> 'id', TG_OP::audit_operation, prior_value, new_value,
    changed_fields, TG_ARGV[0]::audit_domain
  );
  RETURN NULL;
END;
$$;

-- 2. The new configuration tables, one line each (ADR-271): the API writes them, the worker reads
-- them, nothing is deleted, every change is audited. No read-only viewer sees any of them: none has
-- a viewer view or a grant to adms_readonly, so none needs row-level security yet (ADR-281).
SELECT guard_table('disposal_site', 'CONFIGURATION', 'OPERATIONS');
SELECT guard_table('number_block', 'CONFIGURATION', 'OPERATIONS');
SELECT guard_table('assignment', 'CONFIGURATION', 'OPERATIONS');

-- A field event gained two captured columns (its assignment and its setup version): rerun, so the
-- API can correct them.
SELECT guard_table('field_event', 'EVIDENCE', 'RECORDS', ARRAY['status', 'reconciled_at']);

-- 3. The master passcode has its own guards, tighter than guard_table's: the API reads it and adds
-- a version, and never edits one; the worker can't read it; its hash stays out of the audit log.
REVOKE ALL ON "master_passcode" FROM PUBLIC, adms_api, adms_worker;
GRANT SELECT, INSERT ON "master_passcode" TO adms_api;
CREATE TRIGGER "master_passcode_refuse_delete" BEFORE DELETE ON "master_passcode"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "master_passcode_refuse_truncate" BEFORE TRUNCATE ON "master_passcode"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "master_passcode_audit" AFTER INSERT OR UPDATE ON "master_passcode"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('SECURITY', 'hash');

-- Only ever a slow hash (Argon2id, as a PHC string), never the passcode; versions count from 1.
ALTER TABLE "master_passcode" ADD CONSTRAINT "master_passcode_hash_check" CHECK (
  "hash" LIKE '$argon2id$%'
);
ALTER TABLE "master_passcode" ADD CONSTRAINT "master_passcode_version_check" CHECK ("version" >= 1);

-- 4. A project's time zone is an IANA name (ADR-100): an area and a location (America/Chicago), or
-- UTC, and one this server's time zone data knows, so "which day" can always be worked out. An
-- unknown name is refused by the conversion itself (SQLSTATE 22023), not as a check violation.
ALTER TABLE "project" ADD CONSTRAINT "project_time_zone_named_check" CHECK (
  "time_zone" = 'UTC' OR "time_zone" ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$'
);
ALTER TABLE "project" ADD CONSTRAINT "project_time_zone_known_check" CHECK (
  (TIMESTAMPTZ '2000-01-01 00:00:00+00' AT TIME ZONE "time_zone") IS NOT NULL
);

-- 5. People (REQ-021; Q-97). A Monitor ID is "M" and at least six digits; every monitor has one.
-- An employer's own ID needs the employer, a contractor record. The system actor is never a
-- person: no employer either (its Monitor ID and contractor: the system actor's guard, ADR-276).
ALTER TABLE "user" ADD CONSTRAINT "user_monitor_number_check" CHECK (
  "monitor_number" IS NULL OR "monitor_number" ~ '^M[0-9]{6,}$'
);
ALTER TABLE "user" ADD CONSTRAINT "user_monitor_has_number_check" CHECK (
  "role" <> 'MONITOR' OR "monitor_number" IS NOT NULL
);
ALTER TABLE "user" ADD CONSTRAINT "user_employer_number_check" CHECK (
  "employer_number" IS NULL OR "employer_id" IS NOT NULL
);
ALTER TABLE "user" ADD CONSTRAINT "user_system_actor_employer_check" CHECK (
  "role" <> 'SYSTEM' OR ("employer_id" IS NULL AND "employer_number" IS NULL)
);

-- 6. A phone is in service, or out of it from its removal time (ADR-134): lost or retired exactly
-- when that time is set.
ALTER TABLE "device" ADD CONSTRAINT "device_out_of_service_check" CHECK (
  ("status" = 'ACTIVE') = ("out_of_service_at" IS NULL)
);

-- 7. A number block is a run of numbers, first to last; the last number its phone reported using
-- is inside it; it has ended exactly when it was reclaimed or retired (ADR-065).
ALTER TABLE "number_block" ADD CONSTRAINT "number_block_range_check" CHECK (
  "first_number" >= 1 AND "first_number" <= "last_number"
);
ALTER TABLE "number_block" ADD CONSTRAINT "number_block_last_used_check" CHECK (
  "last_used_number" IS NULL OR "last_used_number" BETWEEN "first_number" AND "last_number"
);
ALTER TABLE "number_block" ADD CONSTRAINT "number_block_ended_check" CHECK (
  ("status" = 'ISSUED') = ("ended_at" IS NULL)
);

-- 8. An assignment written on the dispatch board says who wrote it; an unplanned one, made on a
-- phone with the master passcode, has no author and always has its phone (ADR-240). The system
-- actor is never assigned work and never writes the board (C15), and never recorded a field event.
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_origin_check" CHECK (
  ("origin" = 'PLANNED' AND "made_by_id" IS NOT NULL)
  OR ("origin" = 'UNPLANNED' AND "made_by_id" IS NULL AND "device_id" IS NOT NULL)
);
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_system_actor_check" CHECK (
  "person_id" <> '00000000-0000-7000-8000-000000000001'
  AND "made_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid
);
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_monitor_check" CHECK (
  "monitor_id" <> '00000000-0000-7000-8000-000000000001'
);
