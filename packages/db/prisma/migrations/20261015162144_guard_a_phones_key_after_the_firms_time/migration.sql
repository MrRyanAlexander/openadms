-- Guard: a phone's key after the firm's time, and the firm's settings (spec/DATA-MODEL.md §2.2;
-- spec/acceptance/02-people-and-devices.md AC-02-58, 61; spec/acceptance/10-api-and-sync.md
-- AC-10-46, 81…84; ARCHITECTURE §7.4; ADR-065, 113, 134, 488, 520, 530; BACKLOG 2.8.6; REQ-214,
-- 215). Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The tables and columns are the migration before this one. Now:
--   1. the firm's settings: one row, guarded as configuration, audited in the security domain;
--      the seed writes it, the API changes it and never adds one, the worker reads it;
--   2. what stood before is written in the new columns: a phone out of service was marked when it
--      was taken out, and a key revoked so far was revoked by its turn-in;
--   3. a phone is marked, and has a reason, only while it is out of service; a key revoked says
--      which revoked it;
--   4. a phone's key is revoked by its turn-in as before, or by the firm's time: the system actor
--      alone, a phone out of service, the firm's record not off and its hours past the mark by the
--      database's own clock, no block still issued. A key revoked by the firm's time may be turned
--      in once, and nothing else of it changes; one turned in never changes again;
--   5. a phone whose key the firm's time revoked still answers a challenge (its passcode beside
--      it is the API's to ask); one turned in proves nothing;
--   6. the worker may revoke such a key, retire the phone's blocks, end its sessions and write the
--      security event, and nothing more.

-- 1. The firm's settings.
SELECT guard_table('firm_settings', 'CONFIGURATION', 'SECURITY');
REVOKE INSERT ON "firm_settings" FROM adms_api;
ALTER TABLE "firm_settings" ADD CONSTRAINT "firm_settings_one_row_check" CHECK ("id" = 1);
ALTER TABLE "firm_settings" ADD CONSTRAINT "firm_settings_phone_key_hours_check" CHECK (
  "phone_key_revoked_after_hours" IS NULL OR "phone_key_revoked_after_hours" BETWEEN 1 AND 8760
);

-- 2. What stood before, as the system actor, in one block (a setting lasts only its statement's
-- transaction in a migration run statement by statement).
DO $$
BEGIN
  PERFORM set_config('adms.actor_id', '00000000-0000-7000-8000-000000000001', true);
  PERFORM set_config('adms.source', 'SYSTEM', true);
  PERFORM set_config('adms.reason', 'ADR-530: a phone out of service was marked when it was taken out; a key revoked so far was revoked by its turn-in', true);
  UPDATE "device" SET "out_of_service_marked_at" = "out_of_service_at"
    WHERE "out_of_service_at" IS NOT NULL;
  UPDATE "device" SET "key_revoked_by" = 'TURN_IN'
    WHERE "key_revoked_at" IS NOT NULL;
END;
$$;

-- 3. A mark and a reason only while out of service; a revocation says which.
ALTER TABLE "device" ADD CONSTRAINT "device_out_of_service_marked_check" CHECK (
  ("status" = 'ACTIVE') = ("out_of_service_marked_at" IS NULL)
);
ALTER TABLE "device" ADD CONSTRAINT "device_out_of_service_reason_check" CHECK (
  "status" <> 'ACTIVE' OR "out_of_service_reason_id" IS NULL
);
ALTER TABLE "device" ADD CONSTRAINT "device_key_revoked_by_check" CHECK (
  ("key_revoked_at" IS NULL) = ("key_revoked_by" IS NULL)
);

-- 4. A phone's key, revoked by its turn-in or by the firm's time; then kept as it was.
CREATE OR REPLACE FUNCTION device_key_revocation_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor text := nullif(current_setting('adms.actor_id', true), '');
  on_phone text := nullif(current_setting('adms.device_id', true), '');
  hours integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."key_revoked_at" IS NOT NULL OR NEW."key_revoked_by" IS NOT NULL THEN
      RAISE EXCEPTION 'A phone is enrolled with its key standing: only its turn-in or the firm''s time revokes it'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."key_revoked_by" = 'TURN_IN' THEN
    IF NEW."key_revoked_at" IS DISTINCT FROM OLD."key_revoked_at"
      OR NEW."key_revoked_by" IS DISTINCT FROM OLD."key_revoked_by"
      OR NEW."status" IS DISTINCT FROM OLD."status"
      OR NEW."out_of_service_at" IS DISTINCT FROM OLD."out_of_service_at"
      OR NEW."out_of_service_marked_at" IS DISTINCT FROM OLD."out_of_service_marked_at" THEN
      RAISE EXCEPTION 'A phone turned in stays as it was turned in: its key, its status and its removal time don''t change'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."key_revoked_by" = 'FIRM_TIME' THEN
    IF NEW."key_revoked_at" IS DISTINCT FROM OLD."key_revoked_at"
      OR NEW."status" IS DISTINCT FROM OLD."status"
      OR NEW."out_of_service_at" IS DISTINCT FROM OLD."out_of_service_at"
      OR NEW."out_of_service_marked_at" IS DISTINCT FROM OLD."out_of_service_marked_at"
      OR NEW."key_revoked_by" NOT IN ('FIRM_TIME', 'TURN_IN') THEN
      RAISE EXCEPTION 'A phone whose key the firm''s time revoked stays as it was, until it is turned in'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW."key_revoked_by" = 'TURN_IN'
      AND (actor IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'
        OR on_phone IS DISTINCT FROM NEW."id"::text) THEN
      RAISE EXCEPTION 'Only a phone''s turn-in, under the master passcode on that phone, turns it in'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."key_revoked_at" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."key_revoked_by" = 'TURN_IN' THEN
    IF actor IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'
      OR on_phone IS DISTINCT FROM NEW."id"::text THEN
      RAISE EXCEPTION 'Only a phone''s turn-in, under the master passcode on that phone, revokes its key'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    IF actor IS DISTINCT FROM '00000000-0000-7000-8000-000000000001' THEN
      RAISE EXCEPTION 'Only the worker revokes a key for the firm''s time'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW."status" = 'ACTIVE' OR NEW."status" IS DISTINCT FROM OLD."status"
      OR NEW."out_of_service_at" IS DISTINCT FROM OLD."out_of_service_at"
      OR NEW."out_of_service_marked_at" IS DISTINCT FROM OLD."out_of_service_marked_at" THEN
      RAISE EXCEPTION 'The firm''s time revokes the key of a phone out of service, and changes nothing else of it'
        USING ERRCODE = 'restrict_violation';
    END IF;
    SELECT "phone_key_revoked_after_hours" INTO hours FROM "firm_settings" WHERE "id" = 1;
    IF hours IS NULL THEN
      RAISE EXCEPTION 'The firm has no time after which a phone''s key is revoked'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD."out_of_service_marked_at" + make_interval(hours => hours) > now()
      OR NEW."key_revoked_at" < OLD."out_of_service_marked_at" + make_interval(hours => hours) THEN
      RAISE EXCEPTION 'A phone keeps its key until the firm''s time has passed since it was marked'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "number_block" WHERE "device_id" = NEW."id" AND "status" = 'ISSUED'
  ) THEN
    RAISE EXCEPTION 'A phone''s numbers are handed back or retired before its key is revoked'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 5. A key the firm's time revoked still answers a challenge; one turned in never does.
CREATE OR REPLACE FUNCTION device_answered_challenge_guard() RETURNS trigger
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
  IF OLD."key_revoked_by" IS DISTINCT FROM NEW."key_revoked_by"
    OR OLD."key_revoked_by" = 'TURN_IN' THEN
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

-- 6. The worker's part: the firm's record read (guard_table), a key revoked, a phone's blocks
-- retired, its sessions ended, the security event written. Never a session's token, never a
-- security event read back.
GRANT UPDATE ("key_revoked_at", "key_revoked_by") ON "device" TO adms_worker;
GRANT UPDATE ("status", "ended_at") ON "number_block" TO adms_worker;
GRANT SELECT ("id", "device_id", "revoked_at"), UPDATE ("revoked_at") ON "session" TO adms_worker;
GRANT INSERT ON "security_event" TO adms_worker;
