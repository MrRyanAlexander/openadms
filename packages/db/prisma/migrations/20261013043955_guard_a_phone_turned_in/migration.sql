-- Guard: a phone turned in (spec/DATA-MODEL.md §2.2; spec/acceptance/02-people-and-devices.md
-- AC-02-58, 61; spec/acceptance/10-api-and-sync.md AC-10-46; ARCHITECTURE §7.4, §8; ADR-065, 096,
-- 113, 134, 438, 488; BACKLOG 2.6.5, C47, C64; REQ-202a, 209). Written by hand into Prisma's
-- --create-only stub; never edited once applied.
--
-- The security event kind DEVICE_TURN_IN is the migration before this one. Now:
--   1. a phone's key is revoked only by its turn-in: as the master passcode's actor for that same
--      phone, never at enrolment, and only once it holds no block of numbers still issued;
--   2. once revoked, the phone stays as it was turned in: when its key was revoked, its status
--      and its removal time never change again;
--   3. no block of numbers is issued to a phone whose key is revoked, whoever asks. The phone's
--      row is read under a share lock, which its turn-in's own update waits for and holds: a
--      block cut at the same moment as the turn-in either waits for it and is then refused, or
--      is seen by it, and the turn-in is refused.

-- 1, 2. A phone's key, revoked by its turn-in alone, once.
CREATE FUNCTION device_key_revocation_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."key_revoked_at" IS NOT NULL THEN
      RAISE EXCEPTION 'A phone is enrolled with its key standing: only its turn-in revokes it'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."key_revoked_at" IS NOT NULL THEN
    IF NEW."key_revoked_at" IS DISTINCT FROM OLD."key_revoked_at"
      OR NEW."status" IS DISTINCT FROM OLD."status"
      OR NEW."out_of_service_at" IS DISTINCT FROM OLD."out_of_service_at" THEN
      RAISE EXCEPTION 'A phone turned in stays as it was turned in: its key, its status and its removal time don''t change'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."key_revoked_at" IS NULL THEN
    RETURN NEW;
  END IF;
  IF nullif(current_setting('adms.actor_id', true), '') IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'
    OR nullif(current_setting('adms.device_id', true), '') IS DISTINCT FROM NEW."id"::text THEN
    RAISE EXCEPTION 'Only a phone''s turn-in, under the master passcode on that phone, revokes its key'
      USING ERRCODE = 'insufficient_privilege';
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

CREATE TRIGGER "device_key_revocation" BEFORE INSERT OR UPDATE ON "device"
  FOR EACH ROW EXECUTE FUNCTION device_key_revocation_guard();

-- 3. A block issued, or still issued after a change, only to a phone whose key stands.
CREATE FUNCTION number_block_key_standing_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  revoked timestamptz;
BEGIN
  IF NEW."status" <> 'ISSUED' THEN
    RETURN NEW;
  END IF;
  -- A phone nobody enrolled is the foreign key's to refuse.
  SELECT "key_revoked_at" INTO revoked FROM "device" WHERE "id" = NEW."device_id" FOR SHARE;
  IF revoked IS NOT NULL THEN
    RAISE EXCEPTION 'A phone turned in is issued no numbers: its key is revoked'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "number_block_key_standing" BEFORE INSERT OR UPDATE ON "number_block"
  FOR EACH ROW EXECUTE FUNCTION number_block_key_standing_guard();
