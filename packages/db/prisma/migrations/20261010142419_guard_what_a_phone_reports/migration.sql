-- Guard: the phone's times on what a phone reports, and an unplanned assignment's making
-- (spec/DATA-MODEL.md §1 "Time", §2.2; spec/acceptance/02-people-and-devices.md AC-02-26, 38;
-- spec/acceptance/05-sync.md AC-05-40; ARCHITECTURE §5.1…§5.4, §7's note, §7.5, §10; ADR-097,
-- 100, 113, 240, 281, 438, 456, 457; BACKLOG 2.5.4, C46, C111; REQ-019, 202b, 209). Written by
-- hand into Prisma's --create-only stub; never edited once applied.
--
-- The columns are the migration before this one. Now:
--   1. an unplanned assignment says when it was made by its phone's clock, with the clock's
--      offset, and when the server received it; one written on the board has none of the three;
--   2. an offset is one a clock can have (UTC−12:00 to UTC+14:00);
--   3. an unplanned assignment is made only as the master passcode's actor, for a phone, and
--      names that phone: it is what the phone reported of an act under the passcode. Whether an
--      assignment was planned never changes, nor when the server received it;
--   4. a security event carries an offset only where a phone reported it, so only with its phone.

-- 1.
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_phone_times_check" CHECK (
  num_nonnulls("made_at", "device_utc_offset_minutes", "received_at")
    = CASE "origin" WHEN 'UNPLANNED' THEN 3 ELSE 0 END
);

-- 2.
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_device_utc_offset_check" CHECK (
  "device_utc_offset_minutes" BETWEEN -720 AND 840
);

-- 3.
CREATE FUNCTION assignment_unplanned_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."origin" IS DISTINCT FROM OLD."origin" THEN
      RAISE EXCEPTION 'Whether an assignment was written on the board or made on a phone never changes'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW."received_at" IS DISTINCT FROM OLD."received_at" THEN
      RAISE EXCEPTION 'When the server received an unplanned assignment never changes'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."origin" = 'UNPLANNED' AND (
    nullif(current_setting('adms.actor_id', true), '')
      IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'
    OR nullif(current_setting('adms.source', true), '') IS DISTINCT FROM 'DEVICE'
    OR nullif(current_setting('adms.device_id', true), '') IS DISTINCT FROM NEW."device_id"::text
  ) THEN
    RAISE EXCEPTION 'An unplanned assignment is made on a phone under the master passcode: state the master passcode''s actor and the phone it names'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "assignment_unplanned" BEFORE INSERT OR UPDATE ON "assignment"
  FOR EACH ROW EXECUTE FUNCTION assignment_unplanned_guard();

-- 4.
ALTER TABLE "security_event" ADD CONSTRAINT "security_event_device_utc_offset_check" CHECK (
  "device_utc_offset_minutes" IS NULL
  OR ("device_id" IS NOT NULL AND "device_utc_offset_minutes" BETWEEN -720 AND 840)
);
