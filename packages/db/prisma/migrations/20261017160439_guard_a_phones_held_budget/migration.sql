-- Guard: what a phone makes the server hold, counted (spec/acceptance/10-api-and-sync.md
-- AC-10-113; ARCHITECTURE §9 (4); ADR-468, 471, 472, 546; the Phase 2 audit's F7). Written by hand
-- into Prisma's --create-only stub; never edited once applied.
--
-- The column and the security event's kind are the migration before this one. A held record now
-- says how many bytes what was sent is, so a phone's daily budget can be counted without reading
-- what every phone sent. Now:
--   1. the count is never below nought, nor more than the most a record may weigh at a sync (one
--      mebibyte) or at its own endpoint;
--   2. like everything that says what was sent, it is never changed afterwards: the trigger is
--      made again to name it; nothing is written between the two.

-- 1.
ALTER TABLE "held_record" ADD CONSTRAINT "held_record_sent_bytes_check" CHECK (
  "sent_bytes" BETWEEN 0 AND 16777216
);

-- 2.
DROP TRIGGER "held_record_refuse_sent_edit" ON "held_record";
CREATE TRIGGER "held_record_refuse_sent_edit"
  BEFORE UPDATE OF "id", "device_id", "sync_id", "sent_id", "project_id", "sent_monitor_id",
    "payload", "sent_sha256", "sent_bytes", "reason", "message", "received_at" ON "held_record"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();
