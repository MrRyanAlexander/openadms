-- Guard: who a phone's record names, as the server found it (spec/acceptance/10-api-and-sync.md
-- AC-10-110; spec/acceptance/05-sync.md point 11; spec/FLAGS.md §3.13; spec/THREAT-MODEL.md T-13;
-- ARCHITECTURE §5.1…§5.3, §9; ADR-097, 113, 438…440, 471, 543; the Phase 2 audit's F4). Written by
-- hand into Prisma's --create-only stub; never edited once applied.
--
-- The two columns and the two flag codes are the migration before this one. The ledger row the
-- API writes for a field event a phone synced now says who the record named as its monitor and
-- whether, when it arrived, they had a session on that phone over its field time (or the phone
-- was set up for them under the master passcode). The worker flags a record from it; nothing is
-- refused. The table's own guards (written once, by the API for the phone that synced, never
-- deleted, audited) hold the columns already. Now:
--   1. the two are said together, and only of a field event saved;
--   2. the person named is a person: never the master passcode's actor or the device key's, as
--      for every column that names a user (ADR-438, 440).

-- 1.
ALTER TABLE "synced_record" ADD CONSTRAINT "synced_record_monitor_check" CHECK ((
  ("monitor_id" IS NULL) = ("monitor_signed_in" IS NULL)
  AND ("monitor_id" IS NULL OR ("record_kind" = 'FIELD_EVENT' AND "answer" = 'SAVED'))
) IS TRUE);

-- 2.
ALTER TABLE "synced_record" ADD CONSTRAINT "synced_record_monitor_id_not_master_passcode_check"
  CHECK ("monitor_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'::uuid);
ALTER TABLE "synced_record" ADD CONSTRAINT "synced_record_monitor_id_not_device_key_check"
  CHECK ("monitor_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000003'::uuid);
