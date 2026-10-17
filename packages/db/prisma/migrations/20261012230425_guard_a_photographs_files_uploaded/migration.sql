-- Guard: a photograph's files uploaded, and a file set aside (spec/DATA-MODEL.md §4.4;
-- spec/acceptance/04-field-capture.md AC-04-77; spec/acceptance/05-sync.md AC-05-09;
-- spec/acceptance/10-api-and-sync.md AC-10-47…49; ARCHITECTURE §5, §6 "Uploads", §11;
-- spec/THREAT-MODEL.md T-25; ADR-097, 101, 113, 326, 480, 481, 482; invariants 1, 3; BACKLOG
-- 2.6.4, C84 (12), C137). Written by hand into Prisma's --create-only stub; never edited once
-- applied.
--
-- The columns and the table are the migration before this one. Here:
--   1. a photograph gained two columns, and evidence is granted column by column: rerun;
--   2. the depth file's fingerprint is a SHA-256, there exactly where a depth file goes beside
--      the photograph, and written once, as the other two are; its upload time only there;
--   3. when a file reached storage is empty when the record is kept, then written once, and only
--      by the phone that took the photograph, stated by name;
--   4. a file set aside: the API's alone to add and read; never changed, never deleted; what it
--      is, as the server read it; written only by the phone that took its photograph;
--   5. what a read-only viewer sees: a photograph's record with the two new columns, still
--      without where its files are kept; no file set aside.

-- 1.
SELECT guard_table('photo', 'EVIDENCE', 'RECORDS');

-- 2.
ALTER TABLE "photo" ADD CONSTRAINT "photo_depth_check" CHECK ((
  ("depth_object_key" IS NULL) = ("depth_sha256" IS NULL)
  AND ("depth_sha256" IS NULL OR "depth_sha256" ~ '^[0-9a-f]{64}$')
  AND ("depth_uploaded_at" IS NULL OR "depth_object_key" IS NOT NULL)
) IS TRUE);
CREATE TRIGGER "photo_refuse_depth_fingerprint_edit"
  BEFORE UPDATE OF "depth_sha256" ON "photo"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();

-- 3. Asked whenever either time is written: a record made with one is refused, a time once
-- written is never changed, and a time is written only with the phone's own source and id.
CREATE FUNCTION photo_upload_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."uploaded_at" IS NOT NULL OR NEW."depth_uploaded_at" IS NOT NULL THEN
      RAISE EXCEPTION 'A photograph''s record is kept before its files reach storage'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."uploaded_at" IS NOT DISTINCT FROM OLD."uploaded_at"
    AND NEW."depth_uploaded_at" IS NOT DISTINCT FROM OLD."depth_uploaded_at" THEN
    RETURN NEW;
  END IF;
  IF (OLD."uploaded_at" IS NOT NULL AND NEW."uploaded_at" IS DISTINCT FROM OLD."uploaded_at")
    OR (OLD."depth_uploaded_at" IS NOT NULL
      AND NEW."depth_uploaded_at" IS DISTINCT FROM OLD."depth_uploaded_at") THEN
    RAISE EXCEPTION 'When a photograph''s file reached storage is written once'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF nullif(current_setting('adms.source', true), '') IS DISTINCT FROM 'DEVICE'
    OR nullif(current_setting('adms.device_id', true), '') IS DISTINCT FROM NEW."device_id"::text THEN
    RAISE EXCEPTION 'A photograph''s file is uploaded by the phone that took it: state that phone'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "photo_upload" BEFORE INSERT OR UPDATE OF "uploaded_at", "depth_uploaded_at"
  ON "photo" FOR EACH ROW EXECUTE FUNCTION photo_upload_guard();

-- 4. What arrived is kept in storage and in its own row, and can't be changed there.
REVOKE ALL ON "set_aside_file" FROM PUBLIC, adms_api, adms_worker;
GRANT SELECT, INSERT ON "set_aside_file" TO adms_api;
CREATE TRIGGER "set_aside_file_refuse_delete" BEFORE DELETE ON "set_aside_file"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "set_aside_file_refuse_truncate" BEFORE TRUNCATE ON "set_aside_file"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "set_aside_file_audit" AFTER INSERT OR UPDATE ON "set_aside_file"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('RECORDS');
CREATE TRIGGER "set_aside_file_refuse_edit" BEFORE UPDATE ON "set_aside_file"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();
ALTER TABLE "set_aside_file" ADD CONSTRAINT "set_aside_file_received_check" CHECK ((
  "received_sha256" ~ '^[0-9a-f]{64}$'
  AND "byte_count" > 0
  AND "content_type" ~ '^[a-z0-9][a-z0-9.+-]{0,62}/[a-z0-9][a-z0-9.+-]{0,62}$'
  AND btrim("object_key") <> ''
) IS TRUE);

CREATE FUNCTION set_aside_file_from_its_phone_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF nullif(current_setting('adms.source', true), '') IS DISTINCT FROM 'DEVICE'
    OR nullif(current_setting('adms.device_id', true), '') IS DISTINCT FROM NEW."device_id"::text
    OR NOT EXISTS (
      SELECT 1 FROM "photo" WHERE "id" = NEW."photo_id" AND "device_id" = NEW."device_id"
    ) THEN
    RAISE EXCEPTION 'A file is set aside when the phone that took its photograph uploads it: state that phone'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "set_aside_file_from_its_phone" BEFORE INSERT ON "set_aside_file"
  FOR EACH ROW EXECUTE FUNCTION set_aside_file_from_its_phone_guard();

-- 5. (ADR-169, 315; C59.) The view is replaced in place: the columns were added at its end.
SELECT guard_viewer('photo', 'PROJECT', hidden => ARRAY['object_key', 'depth_object_key']);
