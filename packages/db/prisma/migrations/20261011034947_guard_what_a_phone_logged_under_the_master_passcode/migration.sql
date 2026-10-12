-- Guard: what a phone logged under the master passcode, reported (spec/DATA-MODEL.md §2.2;
-- spec/acceptance/02-people-and-devices.md AC-02-23, 42, 46; ARCHITECTURE §5.1…§5.4, §7's
-- notes, §7.3, §7.5, §10; ADR-097, 106, 113, 438, 456 (3), (5)(e), 457, 462, 464; BACKLOG 2.5.4,
-- C122…C125; REQ-202b, 209). Written by hand into Prisma's --create-only stub; never edited
-- once applied.
--
-- The column is the migration before this one. Now:
--   1. only a use of the master passcode a phone reported, for a monitor, says which way a
--      session was opened (one opened with a connection says it on its own row);
--   2. a security event a phone reported (it carries the phone's offset) is an act done on that
--      phone under the master passcode: it is written only as the master passcode's actor, for
--      a phone, and names that phone. So nobody signed in can write one that reads as the
--      phone's own log, and no phone's report is written about another phone.

-- 1.
ALTER TABLE "security_event" ADD CONSTRAINT "security_event_master_passcode_session_check" CHECK (
  "master_passcode_session" IS NULL
  OR ("kind" = 'MASTER_PASSCODE_USE' AND "user_id" IS NOT NULL
    AND "device_utc_offset_minutes" IS NOT NULL)
);

-- 2.
CREATE FUNCTION security_event_a_phone_reported_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."device_utc_offset_minutes" IS NOT NULL AND (
    nullif(current_setting('adms.actor_id', true), '')
      IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'
    OR nullif(current_setting('adms.source', true), '') IS DISTINCT FROM 'DEVICE'
    OR nullif(current_setting('adms.device_id', true), '') IS DISTINCT FROM NEW."device_id"::text
  ) THEN
    RAISE EXCEPTION 'A security event a phone reported is what was done on it under the master passcode: state the master passcode''s actor and the phone it names'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "security_event_a_phone_reported" BEFORE INSERT ON "security_event"
  FOR EACH ROW EXECUTE FUNCTION security_event_a_phone_reported_guard();
