-- Guard: what a sync holds for a person, resolved (spec/DATA-MODEL.md §4.4, §4.5;
-- spec/acceptance/10-api-and-sync.md AC-10-73…76; ARCHITECTURE §5, §8, §9; ADR-022, 097, 101,
-- 113, 276, 292 (5), 438, 440, 468, 471, 481, 482, 526; invariants 1, 3; BACKLOG 2.8.4, C141;
-- REQ-212). Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The new reason, a held record's sync left empty, a photograph's ninth owner and a file set
-- aside's resolution are the migration before this one. Here:
--   1. a photograph gained a column, and evidence is granted column by column: rerun;
--   2. a photograph belongs to exactly one thing: a held record joins as the ninth;
--   3. a photograph is kept with a record held from its own phone, of its own project, and only
--      when it is kept; it leaves one only for the record a person saved from it;
--   4. a held record's sync is left empty only for a report made to its own endpoint;
--   5. a file set aside is changed in nothing but its resolution;
--   6. a resolution, of a held record or of a file set aside, is all three or none, by a person,
--      written once, from the back office, by the person it names;
--   7. what a read-only viewer sees: a photograph's record with its new column, still without
--      where its files are kept, a contractor user's own photographs as before; no file set
--      aside.

-- 1.
SELECT guard_table('photo', 'EVIDENCE', 'RECORDS');

-- 2.
ALTER TABLE "photo" DROP CONSTRAINT "photo_owner_check";
ALTER TABLE "photo" ADD CONSTRAINT "photo_owner_check" CHECK (
  num_nonnulls("field_event_id", "certification_id", "scale_receipt_id", "roe_id", "survey_id",
    "incident_id", "drop_off_log_id", "quarantined_record_id", "held_record_id") = 1
);

-- 3. Asked when a photograph is kept and whenever its held record or what it belongs to moves.
-- Kept with a held record: one held from the photograph's own phone and naming its project,
-- still waiting. Moved from one: only once a person resolved it, and only to the record of the
-- id its phone made, which is the one saved from it (ADR-526 (2)). Never moved onto one.
CREATE FUNCTION photo_held_record_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  held held_record%ROWTYPE;
  moved_to uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."held_record_id" IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT * INTO held FROM "held_record" WHERE "id" = NEW."held_record_id";
    IF NOT FOUND
      OR held."device_id" IS DISTINCT FROM NEW."device_id"
      OR held."project_id" IS DISTINCT FROM NEW."project_id"
      OR held."resolved_at" IS NOT NULL THEN
      RAISE EXCEPTION 'A photograph is kept with a record held from its own phone, of its own project, while it waits'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."held_record_id" IS NOT DISTINCT FROM OLD."held_record_id" THEN
    IF NEW."held_record_id" IS NOT NULL AND (
      NEW."device_id" IS DISTINCT FROM OLD."device_id"
      OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
    ) THEN
      RAISE EXCEPTION 'A photograph kept with a held record stays its phone''s and its project''s'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."held_record_id" IS NULL THEN
    RAISE EXCEPTION 'A photograph is kept with a held record only when it is kept'
      USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT * INTO held FROM "held_record" WHERE "id" = OLD."held_record_id";
  moved_to := coalesce(NEW."field_event_id", NEW."certification_id", NEW."scale_receipt_id",
    NEW."roe_id", NEW."survey_id", NEW."incident_id", NEW."drop_off_log_id");
  IF NEW."held_record_id" IS NOT NULL
    OR held."resolved_at" IS NULL
    OR held."sent_id" IS NULL
    OR moved_to IS DISTINCT FROM held."sent_id"
    OR NEW."project_id" IS DISTINCT FROM OLD."project_id" THEN
    RAISE EXCEPTION 'A photograph leaves a held record only for the record a person saved from it'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "photo_held_record"
  BEFORE INSERT OR UPDATE OF "held_record_id", "field_event_id", "certification_id",
    "scale_receipt_id", "roe_id", "survey_id", "incident_id", "drop_off_log_id",
    "quarantined_record_id", "project_id", "device_id"
  ON "photo" FOR EACH ROW EXECUTE FUNCTION photo_held_record_guard();

-- 4.
ALTER TABLE "held_record" ADD CONSTRAINT "held_record_sync_check" CHECK (
  "sync_id" IS NOT NULL OR "reason" = 'REPORT_NOT_SAVED'
);

-- 5. What arrived can't be changed; its resolution is written later, by a person. As a held
-- record's: the API may update the row, and a trigger refuses every column but the resolution
-- (a grant by column would leave the rest of the row reading as uncorrectable to guard_gaps).
DROP TRIGGER "set_aside_file_refuse_edit" ON "set_aside_file";
GRANT UPDATE ON "set_aside_file" TO adms_api;
CREATE TRIGGER "set_aside_file_refuse_received_edit"
  BEFORE UPDATE OF "id", "photo_id", "file", "device_id", "received_sha256", "byte_count",
    "content_type", "object_key", "received_at" ON "set_aside_file"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();
ALTER TABLE "set_aside_file" ADD CONSTRAINT "set_aside_file_resolution_check" CHECK ((
  num_nonnulls("resolved_by_id", "resolved_at", "resolution") IN (0, 3)
  AND ("resolution" IS NULL OR btrim("resolution") <> '')
) IS TRUE);
-- A person resolves one: never the system actor, the master passcode's or the device key's
-- (ADR-276, 438, 440).
ALTER TABLE "set_aside_file" ADD CONSTRAINT "set_aside_file_resolved_by_check" CHECK (
  "resolved_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid
  AND "resolved_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'::uuid
  AND "resolved_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000003'::uuid
);

-- 6. Asked whenever a resolution is written, on either table.
CREATE FUNCTION resolved_once_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."resolved_by_id" IS NOT DISTINCT FROM OLD."resolved_by_id"
    AND NEW."resolved_at" IS NOT DISTINCT FROM OLD."resolved_at"
    AND NEW."resolution" IS NOT DISTINCT FROM OLD."resolution" THEN
    RETURN NEW;
  END IF;
  IF num_nonnulls(OLD."resolved_by_id", OLD."resolved_at", OLD."resolution") > 0 THEN
    RAISE EXCEPTION 'A % is resolved once', TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF nullif(current_setting('adms.source', true), '') IS DISTINCT FROM 'BACK_OFFICE'
    OR nullif(current_setting('adms.actor_id', true), '') IS DISTINCT FROM NEW."resolved_by_id"::text THEN
    RAISE EXCEPTION 'A % is resolved by a person at the back office, who is named on it', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "held_record_resolved_once"
  BEFORE UPDATE OF "resolved_by_id", "resolved_at", "resolution" ON "held_record"
  FOR EACH ROW EXECUTE FUNCTION resolved_once_guard();
CREATE TRIGGER "set_aside_file_resolved_once"
  BEFORE UPDATE OF "resolved_by_id", "resolved_at", "resolution" ON "set_aside_file"
  FOR EACH ROW EXECUTE FUNCTION resolved_once_guard();

-- 7. (ADR-169, 315, 361; C59.) The view is replaced in place: the column was added at its end.
SELECT guard_viewer('photo', 'PROJECT',
  hidden => ARRAY['object_key', 'depth_object_key'],
  own => 'EXISTS (SELECT 1 FROM public.field_event WHERE field_event."id" = photo."field_event_id") OR EXISTS (SELECT 1 FROM public.certification WHERE certification."id" = photo."certification_id") OR EXISTS (SELECT 1 FROM public.scale_receipt WHERE scale_receipt."id" = photo."scale_receipt_id")');
