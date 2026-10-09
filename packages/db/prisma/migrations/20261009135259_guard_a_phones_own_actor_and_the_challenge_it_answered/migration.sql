-- Guard: a phone's own actor, the challenge a phone answered, and the shape of a device key
-- (spec/DATA-MODEL.md §2.2; spec/acceptance/10-api-and-sync.md AC-10-44, 45, 46;
-- spec/THREAT-MODEL.md T-02, T-11; ARCHITECTURE §5.1…§5.3, §7.4, §9 (1); ADR-113, 273, 276, 436,
-- 437, 438, 439, 440; BACKLOG 2.5.1, C110, C111; REQ-202a). Written by hand into Prisma's
-- --create-only stub; never edited once applied.
--
-- The role and the column are the migration before this one.
--
-- A phone proves itself with its device key before anybody on it is known to the server, so
-- what the server writes then is written as a user that is no person: the device key's actor
-- (user 00000000-0000-7000-8000-000000000003, role DEVICE_KEY), made by the installer's seed as
-- the system actor and the master passcode's actor are (packages/db/src/device-key-actor.ts).
-- Now:
--   1. a write stating it is refused unless adms_api makes it, with source DEVICE, naming the
--      phone;
--   2. no login but adms_owner may change its row, make it, or give anyone role DEVICE_KEY;
--   3. the role belongs to that one id only, which is never a person;
--   4. no record names it, but the audit record's actor;
--   5. the challenge a phone last proved itself with is written by that phone's own proof
--      alone, only ever later, and never for a phone whose key is revoked;
--   6. a device key is kept as a P-256 public key is written, and as nothing else.

-- 1. The audit guard's writer, as before (the master passcode's actor's guard), refusing the
-- device key's actor from anyone but the API, with any source but DEVICE, or with no phone.
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
  IF actor = '00000000-0000-7000-8000-000000000003' AND login <> 'adms_api' THEN
    RAISE EXCEPTION 'Only the API writes as the device key''s actor: % may not state it (a write to %)', login, table_name
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF actor = '00000000-0000-7000-8000-000000000003' AND source <> 'DEVICE' THEN
    RAISE EXCEPTION 'The device key''s actor writes only for a phone: source % may not be stated with it (a write to %)', source, table_name
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF actor = '00000000-0000-7000-8000-000000000003'
    AND nullif(current_setting('adms.device_id', true), '') IS NULL THEN
    RAISE EXCEPTION 'The device key''s actor writes only for the phone whose key it is: state adms.device_id with it (a write to %)', table_name
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

-- 2. The three users that are no person: each made by the seed, then never changed by a runtime
-- login, and nobody else is given any's role or id. The first two halves are as before.
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
  IF TG_OP = 'UPDATE' AND OLD."id" = '00000000-0000-7000-8000-000000000003' THEN
    RAISE EXCEPTION 'The device key''s actor can''t be changed: % may not update it', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."id" = '00000000-0000-7000-8000-000000000003' OR NEW."role" = 'DEVICE_KEY' THEN
    RAISE EXCEPTION 'Only the installer''s seed makes the device key''s actor: % may not write role DEVICE_KEY or its id', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Role DEVICE_KEY on the one id only, and never a person's.
ALTER TABLE "user" ADD CONSTRAINT "user_device_key_actor_check" CHECK (
  ("role" = 'DEVICE_KEY') = ("id" = '00000000-0000-7000-8000-000000000003')
  AND (
    "role" <> 'DEVICE_KEY'
    OR (
      "monitor_number" IS NULL AND "contractor_id" IS NULL AND "employer_id" IS NULL
      AND "employer_number" IS NULL AND "email" IS NULL AND "phone" IS NULL
      AND "viewer_kind" IS NULL AND "sees_private_citizens" IS NULL AND "archived_at" IS NULL
    )
  )
);

-- 4. No record names it. Every column that names a user gets a check refusing its id, as each
-- has one refusing the master passcode's actor; the one exception is the audit record's actor.
-- Written from the catalog, so none is missed; a later table that names a user adds both checks
-- in its own guard (the database tests hold every such column to them).
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
      named.table_name || '_' || named.column_name || '_not_device_key_check',
      named.column_name,
      '00000000-0000-7000-8000-000000000003'
    );
  END LOOP;
END;
$$;

-- 5. The challenge a phone last proved itself with (AC-10-45, 46): a phone is enrolled with
-- none; afterwards it is written only by the device key's actor for that same phone, only to a
-- later moment than the one before, and never once the phone's key is revoked. So a recorded
-- proof sent again changes nothing, whatever the API does.
CREATE FUNCTION device_answered_challenge_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."last_answered_challenge_made_at" IS NOT NULL THEN
      RAISE EXCEPTION 'A phone is enrolled having answered no challenge'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."last_answered_challenge_made_at" IS NOT DISTINCT FROM OLD."last_answered_challenge_made_at" THEN
    RETURN NEW;
  END IF;
  IF nullif(current_setting('adms.actor_id', true), '') IS DISTINCT FROM '00000000-0000-7000-8000-000000000003'
    OR nullif(current_setting('adms.device_id', true), '') IS DISTINCT FROM NEW."id"::text THEN
    RAISE EXCEPTION 'Only a phone''s own proof says which challenge it answered'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."key_revoked_at" IS NOT NULL OR NEW."key_revoked_at" IS NOT NULL THEN
    RAISE EXCEPTION 'A phone whose key is revoked proves nothing'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."last_answered_challenge_made_at" IS NULL
    OR NEW."last_answered_challenge_made_at" <= OLD."last_answered_challenge_made_at" THEN
    RAISE EXCEPTION 'A challenge is good once: a phone answers only one made after the last it answered'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "device_answered_challenge" BEFORE INSERT OR UPDATE ON "device"
  FOR EACH ROW EXECUTE FUNCTION device_answered_challenge_guard();

-- 6. A device key as it is kept (AC-02-16, AC-10-44; ADR-437): the base64 of a P-256 public
-- key's SubjectPublicKeyInfo, its point written whole. That is 91 bytes, the first 27 the same
-- for every such key. Whether the point is on the curve is the API's to check before it writes.
ALTER TABLE "device" ADD CONSTRAINT "device_public_key_check" CHECK (
  "public_key" ~ '^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{86}==$'
);
