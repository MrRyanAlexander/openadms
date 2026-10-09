-- Guard: a monitor's session on a phone (spec/DATA-MODEL.md §2.2; spec/acceptance/02-people-and-
-- devices.md AC-02-39; spec/acceptance/10-api-and-sync.md AC-10-19; spec/THREAT-MODEL.md T-14,
-- T-16; ARCHITECTURE §5.1…§5.3, §6 (Device sessions), §7.2; ADR-105, 113, 134, 398, 441, 443;
-- BACKLOG 2.5.2, C113; REQ-202). Written by hand into Prisma's --create-only stub; never edited
-- once applied.
--
-- The column is the migration before this one. The session's own guards (ADR-398) stand: only
-- the API reads and writes it, nothing is deleted, the token's hash is kept out of the audit log,
-- and a revoked session never changes again. Now:
--   1. a monitor's session names the phone they signed in on, and no other session names one:
--      so a monitor's ID and password open a session on a phone and nowhere else (AC-02-39);
--   2. a session on a phone is opened only for a monitor who isn't archived, on a phone in
--      service whose key stands, and is written by the monitor themselves, stated for that
--      phone, as a phone's write;
--   3. the phone a session names never changes.

-- 1 and 2. Asked when a session is opened.
CREATE FUNCTION session_on_a_phone_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  person_role text;
  person_archived timestamptz;
  phone record;
BEGIN
  SELECT "role"::text, "archived_at" INTO person_role, person_archived
    FROM "user" WHERE "id" = NEW."user_id";
  IF NEW."device_id" IS NULL THEN
    IF person_role = 'MONITOR' THEN
      RAISE EXCEPTION 'A monitor signs in on a phone only: their session names the phone'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF person_role IS DISTINCT FROM 'MONITOR' OR person_archived IS NOT NULL THEN
    RAISE EXCEPTION 'Only a monitor in service signs in on a phone'
      USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT "status"::text AS status, "key_revoked_at" INTO phone
    FROM "device" WHERE "id" = NEW."device_id";
  IF phone.status IS DISTINCT FROM 'ACTIVE' OR phone.key_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'A phone out of service signs nobody in'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF nullif(current_setting('adms.actor_id', true), '') IS DISTINCT FROM NEW."user_id"::text
    OR nullif(current_setting('adms.source', true), '') IS DISTINCT FROM 'DEVICE'
    OR nullif(current_setting('adms.device_id', true), '') IS DISTINCT FROM NEW."device_id"::text THEN
    RAISE EXCEPTION 'A monitor''s session is opened by their own sign-in, on that phone'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "session_on_a_phone" BEFORE INSERT ON "session"
  FOR EACH ROW EXECUTE FUNCTION session_on_a_phone_guard();

-- 3. The phone a session names, as whose it is and when it began, never changes.
CREATE TRIGGER "session_refuse_device_edit" BEFORE UPDATE OF "device_id"
  ON "session" FOR EACH ROW EXECUTE FUNCTION refuse_edit();
