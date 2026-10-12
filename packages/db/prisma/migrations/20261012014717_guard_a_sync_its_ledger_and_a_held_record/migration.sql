-- Guard: a sync, the idempotency ledger and a held record (spec/DATA-MODEL.md §4.5;
-- spec/acceptance/05-sync.md AC-05-04, 16, 46; spec/acceptance/06-reconciliation.md AC-06-58;
-- ARCHITECTURE §5.1…§5.5, §9 (1), (3), (4), §10; ADR-022, 097, 100, 113, 169, 336, 438, 440,
-- 467, 468, 469, 471; invariants 1, 3; BACKLOG 2.6.2, C69, C70, C128; REQ-016, 203). Written by
-- hand into Prisma's --create-only stub; never edited once applied.
--
-- The tables are the migration before this one; that a synced or a held record's phone is its
-- sync's is that migration's two-column foreign key. Their guards are their own, since no kind
-- of guard_table's fits. Now:
--   1. a sync: the API adds one and reads it, the worker reads it (the clock's difference),
--      nothing is deleted, and nothing of it is changed but the setup version its answer
--      carried, written once;
--   2. what a sync says of the clocks is true of itself: an offset a clock can stand at, the
--      difference the two instants give, a setup version from 1;
--   3. the ledger: the API adds a row and reads it, the worker reads it, nobody changes one;
--      its kind is a word of the contract's;
--   4. a held record: the API's alone to add, read and resolve; the worker holds nothing on
--      it. What was sent is never changed; its fingerprint is a SHA-256; what the phone was
--      told is words; a resolution is who, when and what, by a person;
--   5. each of the three is written only for a phone, stated by name, and names that phone: no
--      sync, no ledger row and no held record is written about another phone, or from the back
--      office;
--   6. what a read-only viewer sees: a held record of their project, what was sent only where
--      the firm lets them see private citizens; no sync and no ledger row.

-- 1.
REVOKE ALL ON "sync" FROM PUBLIC, adms_api, adms_worker;
GRANT SELECT, INSERT, UPDATE ON "sync" TO adms_api;
GRANT SELECT ON "sync" TO adms_worker;
CREATE TRIGGER "sync_refuse_delete" BEFORE DELETE ON "sync"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "sync_refuse_truncate" BEFORE TRUNCATE ON "sync"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "sync_audit" AFTER INSERT OR UPDATE ON "sync"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('RECORDS');
CREATE TRIGGER "sync_refuse_reported_edit"
  BEFORE UPDATE OF "id", "device_id", "started_at", "device_clock_at",
    "device_utc_offset_minutes", "clock_difference_seconds" ON "sync"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();
CREATE TRIGGER "sync_refuse_edit_once_answered" BEFORE UPDATE ON "sync"
  FOR EACH ROW WHEN (OLD."setup_version_sent" IS NOT NULL) EXECUTE FUNCTION refuse_edit();

-- 2. The difference is the phone's clock less the server's, in whole seconds, however the
-- fraction was rounded.
ALTER TABLE "sync" ADD CONSTRAINT "sync_device_utc_offset_check" CHECK (
  "device_utc_offset_minutes" BETWEEN -720 AND 840
);
ALTER TABLE "sync" ADD CONSTRAINT "sync_clock_difference_check" CHECK (
  abs(extract(epoch FROM ("device_clock_at" - "started_at")) - "clock_difference_seconds") < 1
);
ALTER TABLE "sync" ADD CONSTRAINT "sync_setup_version_sent_check" CHECK (
  "setup_version_sent" >= 1
);

-- 3.
REVOKE ALL ON "synced_record" FROM PUBLIC, adms_api, adms_worker;
GRANT SELECT, INSERT ON "synced_record" TO adms_api;
GRANT SELECT ON "synced_record" TO adms_worker;
CREATE TRIGGER "synced_record_refuse_delete" BEFORE DELETE ON "synced_record"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "synced_record_refuse_truncate" BEFORE TRUNCATE ON "synced_record"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "synced_record_audit" AFTER INSERT OR UPDATE ON "synced_record"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('RECORDS');
CREATE TRIGGER "synced_record_refuse_edit" BEFORE UPDATE ON "synced_record"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();
ALTER TABLE "synced_record" ADD CONSTRAINT "synced_record_record_kind_check" CHECK (
  "record_kind" ~ '^[A-Z]+(_[A-Z]+)*$'
);

-- 4. What was sent is kept in its own row and can't be changed there, so the audit log says
-- that a held record was made and never copies what was sent a second time.
REVOKE ALL ON "held_record" FROM PUBLIC, adms_api, adms_worker;
GRANT SELECT, INSERT, UPDATE ON "held_record" TO adms_api;
CREATE TRIGGER "held_record_refuse_delete" BEFORE DELETE ON "held_record"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "held_record_refuse_truncate" BEFORE TRUNCATE ON "held_record"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "held_record_audit" AFTER INSERT OR UPDATE ON "held_record"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('RECORDS', 'payload');
CREATE TRIGGER "held_record_refuse_sent_edit"
  BEFORE UPDATE OF "id", "device_id", "sync_id", "sent_id", "project_id", "sent_monitor_id",
    "payload", "sent_sha256", "reason", "message", "received_at" ON "held_record"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();
ALTER TABLE "held_record" ADD CONSTRAINT "held_record_sent_sha256_check" CHECK (
  "sent_sha256" ~ '^[0-9a-f]{64}$'
);
ALTER TABLE "held_record" ADD CONSTRAINT "held_record_message_check" CHECK (
  btrim("message") <> ''
);
ALTER TABLE "held_record" ADD CONSTRAINT "held_record_resolution_check" CHECK ((
  num_nonnulls("resolved_by_id", "resolved_at", "resolution") IN (0, 3)
  AND ("resolution" IS NULL OR btrim("resolution") <> '')
) IS TRUE);
-- A person resolves one: never the system actor, the master passcode's or the device key's
-- (ADR-276, 438, 440).
ALTER TABLE "held_record" ADD CONSTRAINT "held_record_resolved_by_check" CHECK (
  "resolved_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid
);
ALTER TABLE "held_record" ADD CONSTRAINT "held_record_resolved_by_id_not_master_passcode_check" CHECK (
  "resolved_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'::uuid
);
ALTER TABLE "held_record" ADD CONSTRAINT "held_record_resolved_by_id_not_device_key_check" CHECK (
  "resolved_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000003'::uuid
);

-- 5. Asked when a row is made, and of a sync when its setup version is written.
CREATE FUNCTION sync_from_its_phone_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF nullif(current_setting('adms.source', true), '') IS DISTINCT FROM 'DEVICE'
    OR nullif(current_setting('adms.device_id', true), '') IS DISTINCT FROM NEW."device_id"::text THEN
    RAISE EXCEPTION 'A % row is written when a phone syncs: state the phone it names', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "sync_from_its_phone" BEFORE INSERT OR UPDATE ON "sync"
  FOR EACH ROW EXECUTE FUNCTION sync_from_its_phone_guard();
CREATE TRIGGER "synced_record_from_its_phone" BEFORE INSERT ON "synced_record"
  FOR EACH ROW EXECUTE FUNCTION sync_from_its_phone_guard();
CREATE TRIGGER "held_record_from_its_phone" BEFORE INSERT ON "held_record"
  FOR EACH ROW EXECUTE FUNCTION sync_from_its_phone_guard();

-- 6. A client user or an auditor sees that a record of their project is held, why, and how it
-- was resolved; what was sent may name a private citizen, so it is shown only by
-- viewer_held_record_citizen (ADR-336, 468 (5)). The project is only what the record said: one
-- that names no project of theirs is seen by none of them. A contractor user sees none.
SELECT guard_viewer('held_record', 'PROJECT', citizen => ARRAY['payload']);
