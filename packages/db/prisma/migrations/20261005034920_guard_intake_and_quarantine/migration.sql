-- Guard: intake and quarantine (spec/DATA-MODEL.md §4.1, §4.4, §4.5; spec/acceptance/05-sync.md
-- sections C and E, AC-05-18, 19, 22, 23, 26, 39; ARCHITECTURE §5, §9; adms-exceptions §4.3a;
-- ADR-022, 052, 101, 113, 169, 236, 271, 276, 292, 315, 329 (5), 336, 338; BACKLOG 1.4.2, C59,
-- C65, C66, C67 (f); REQ-120b). Written by hand into Prisma's --create-only stub; never edited
-- once applied.
--
-- The table, its reason, a photograph's eighth owner and the field event's unreadable fix are
-- the migration before this one; that a quarantined record's holder and a photograph's
-- quarantined record are each of its own project are that migration's foreign keys. Here: the
-- tables' guards, the checks Prisma can't declare, what is never changed, and what a viewer
-- sees. Nothing below makes a second field event of one kind on one ticket possible: the field
-- event's own unique key stands as it was (invariant 17), and quarantine is where intake puts
-- the record it can't save.

-- 1. A quarantined record is evidence: the API inserts it, the worker may read it and writes
-- none of it; nobody deletes it. A field event and a photograph gained a column, and evidence is
-- granted column by column: rerun (ADR-271).
SELECT guard_table('quarantined_record', 'EVIDENCE', 'RECORDS');
SELECT guard_table('field_event', 'EVIDENCE', 'RECORDS', ARRAY['status', 'reconciled_at']);
SELECT guard_table('photo', 'EVIDENCE', 'RECORDS');

-- 2. What the phone sent is never changed, by anyone: the record as sent, whose it is, why it is
-- here, what holds its number and when it arrived are written once. Only its resolution is
-- written later (ADR-022; AC-05-23).
CREATE TRIGGER "quarantined_record_refuse_sent_edit"
  BEFORE UPDATE OF "id", "project_id", "device_id", "monitor_id", "payload", "reason",
    "holding_event_id", "holding_roe_id", "received_at" ON "quarantined_record"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();

-- 3. The record as sent is a record: an object, never a bare value.
ALTER TABLE "quarantined_record" ADD CONSTRAINT "quarantined_record_payload_check" CHECK (
  jsonb_typeof("payload") = 'object'
);

-- 4. The reason names what holds the number, and exactly that is there: a field event for a
-- second field event of one kind on one ticket, an ROE for an ROE number already on the project.
-- Every branch answers true or false, never null.
ALTER TABLE "quarantined_record" ADD CONSTRAINT "quarantined_record_holder_check" CHECK ((
  CASE "reason"
    WHEN 'DUPLICATE_FIELD_EVENT' THEN "holding_event_id" IS NOT NULL AND "holding_roe_id" IS NULL
    WHEN 'DUPLICATE_ROE_NUMBER' THEN "holding_roe_id" IS NOT NULL AND "holding_event_id" IS NULL
    ELSE false
  END
) IS TRUE);

-- 5. The system actor is not a person: it made no record a phone sent, and it resolves none
-- (ADR-276).
ALTER TABLE "quarantined_record" ADD CONSTRAINT "quarantined_record_monitor_check" CHECK (
  "monitor_id" <> '00000000-0000-7000-8000-000000000001'::uuid
);
ALTER TABLE "quarantined_record" ADD CONSTRAINT "quarantined_record_resolved_by_check" CHECK (
  "resolved_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid
);

-- 6. A resolution says who, when and what, all three or none; what was done is words, and a
-- blank isn't any (its wording is the reviewer's task, BACKLOG 1.8.x).
ALTER TABLE "quarantined_record" ADD CONSTRAINT "quarantined_record_resolution_check" CHECK ((
  num_nonnulls("resolved_by_id", "resolved_at", "resolution") IN (0, 3)
  AND ("resolution" IS NULL OR btrim("resolution") <> '')
) IS TRUE);

-- 7. A fix a phone sent that couldn't be one is kept as sent, by which end it was: an object
-- that holds something, or nothing at all. The field event's own fix columns keep their checks
-- (ADR-329 (5)): the unreadable fix is never written there.
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_unreadable_gps_check" CHECK ((
  "unreadable_gps" IS NULL
  OR (jsonb_typeof("unreadable_gps") = 'object' AND "unreadable_gps" <> '{}'::jsonb)
) IS TRUE);

-- 8. A photograph belongs to exactly one thing (ADR-101, 292): a record waiting in quarantine
-- joins the check, as the eighth owner.
ALTER TABLE "photo" DROP CONSTRAINT "photo_owner_check";
ALTER TABLE "photo" ADD CONSTRAINT "photo_owner_check" CHECK (
  num_nonnulls("field_event_id", "certification_id", "scale_receipt_id", "roe_id", "survey_id",
    "incident_id", "drop_off_log_id", "quarantined_record_id") = 1
);

-- 9. What a client user or an auditor sees (ADR-169, 315, 336; C59): every column of their
-- projects' field events and their photographs' records, the new ones included (each view is
-- replaced in place: the column was added at its end), a photograph still without where its file
-- is kept; and that a record of their project waits in quarantine, why, what holds its number
-- and how it was resolved. The record as sent may name a private citizen (an ROE's owner), so it
-- is shown only by viewer_quarantined_record_citizen, to a viewer the firm lets see private
-- citizens. A contractor user sees none (BACKLOG 1.7.1, C18).
SELECT guard_viewer('field_event', 'PROJECT');
SELECT guard_viewer('photo', 'PROJECT', hidden => ARRAY['object_key', 'depth_object_key']);
SELECT guard_viewer('quarantined_record', 'PROJECT', citizen => ARRAY['payload']);
