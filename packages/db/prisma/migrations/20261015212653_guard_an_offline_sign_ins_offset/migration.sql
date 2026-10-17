-- Guard: a sign-in made offline says its offset too (ARCHITECTURE §7.2; ADR-100, 113, 531).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The migration before this one let a session carry the sign-in's id and the phone's time with
-- no offset: a missing offset made its comparison unknown, and a check that comes out unknown
-- passes. Its test caught it. The check is made again so that it must come out true.
ALTER TABLE "session" DROP CONSTRAINT "session_offline_sign_in_check";
ALTER TABLE "session" ADD CONSTRAINT "session_offline_sign_in_check" CHECK ((
  ("offline_sign_in_id" IS NULL AND "signed_in_at" IS NULL AND "signed_in_utc_offset_minutes" IS NULL)
  OR (
    "device_id" IS NOT NULL
    AND "offline_sign_in_id" IS NOT NULL
    AND "signed_in_at" IS NOT NULL
    AND "signed_in_utc_offset_minutes" IS NOT NULL
    AND "signed_in_utc_offset_minutes" BETWEEN -720 AND 840
  )
) IS TRUE);
