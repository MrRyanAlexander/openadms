-- Guard: a sign-in made offline, the monitor's hours, and a phone out of service given no numbers
-- (spec/DATA-MODEL.md §2.2, §3 "Numbering"; ARCHITECTURE §7.2, §7.4; ADR-065, 113, 134, 443,
-- 488, 530, 531; BACKLOG C170). Written by hand into Prisma's --create-only stub; never edited
-- once applied.
--
-- The columns are the migration before this one. Now:
--   1. a monitor's sign-in on a phone lasts 1 to 24 hours, as the firm sets it (NIST SP 800-63B-4
--      §2.2.3 allows a day at most);
--   2. a session says it was made from a sign-in on the phone with no connection only on a phone,
--      with all three of its id, the phone's time and its offset, and never changes them;
--   3. a new block of numbers is issued only to a phone in service whose key stands: a phone
--      marked lost or retired keeps what it holds until its turn-in or the firm's time ends it,
--      and is given nothing more (ADR-065, 134). Only a new block is asked: one it already holds
--      is still written on (its last used number, its end) at its turn-in.

-- 1.
ALTER TABLE "firm_settings" ADD CONSTRAINT "firm_settings_monitor_session_hours_check" CHECK (
  "monitor_session_hours" BETWEEN 1 AND 24
);

-- 2.
ALTER TABLE "session" ADD CONSTRAINT "session_offline_sign_in_check" CHECK (
  ("offline_sign_in_id" IS NULL AND "signed_in_at" IS NULL AND "signed_in_utc_offset_minutes" IS NULL)
  OR (
    "device_id" IS NOT NULL
    AND "offline_sign_in_id" IS NOT NULL
    AND "signed_in_at" IS NOT NULL
    AND "signed_in_utc_offset_minutes" BETWEEN -720 AND 840
  )
);
CREATE TRIGGER "session_refuse_offline_sign_in_edit"
  BEFORE UPDATE OF "offline_sign_in_id", "signed_in_at", "signed_in_utc_offset_minutes"
  ON "session" FOR EACH ROW EXECUTE FUNCTION refuse_edit();

-- 3. The function of ADR-488's guard, with a new block asked of the phone's service too.
CREATE OR REPLACE FUNCTION number_block_key_standing_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  phone record;
BEGIN
  IF NEW."status" <> 'ISSUED' THEN
    RETURN NEW;
  END IF;
  -- A phone nobody enrolled is the foreign key's to refuse.
  SELECT "key_revoked_at", "status"::text AS status INTO phone
    FROM "device" WHERE "id" = NEW."device_id" FOR SHARE;
  IF phone.key_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'A phone turned in is issued no numbers: its key is revoked'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' AND phone.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'A phone out of service is issued no new numbers'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
