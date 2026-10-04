-- Guard: scale receipts and photographs (spec/DATA-MODEL.md §4.1 (2), §4.2, §4.4, §8;
-- spec/acceptance/04-field-capture.md section G; ARCHITECTURE §5, §11; ADR-034, 036, 038, 083,
-- 101, 169, 175, 179, 227, 271, 276, 292, 315, 326; BACKLOG C59, C61 point 14, C62, C63 points
-- 7, 11, 14, 15; REQ-106f, 126a). Written by hand into Prisma's --create-only stub; never edited
-- once applied.
--
-- The two tables and a field event's link to its scale receipt are the migration before this
-- one. Here: the tables' guards, the checks Prisma can't declare, and what a viewer sees. That a
-- receipt's site, a disposal's receipt and a photograph's owner are each of its own project are
-- the foreign keys of that migration, not triggers here. Nothing below judges whether work was
-- eligible (ADR-052): each check refuses a record that isn't one, never work that looks wrong.
-- A weight that is missing, a net that doesn't follow from its gross and tare, and a receipt at a
-- site with no scale are each a flag's.

-- 1. A field event gained a captured column: rerun, so the API can correct it and the worker
-- still writes only the ticket's status and the time it was reconciled (ADR-271). The two new
-- tables are evidence too: the API inserts and corrects them, the worker reads them, nothing is
-- deleted, every change is audited with the field event's own domain.
SELECT guard_table('field_event', 'EVIDENCE', 'RECORDS', ARRAY['status', 'reconciled_at']);
SELECT guard_table('scale_receipt', 'EVIDENCE', 'RECORDS');
SELECT guard_table('photo', 'EVIDENCE', 'RECORDS');

-- 2. Only a disposal and a haul-out disposal point at a scale receipt: the tower's, where the
-- paper is handed over (ADR-034, 227). A load call or a count beside it is taken: which quantity
-- bills is the worker's to read from the paying pay item (ADR-325, 326).
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_scale_receipt_check" CHECK (
  "scale_receipt_id" IS NULL OR "kind" IN ('DISPOSAL', 'HAUL_OUT_DISPOSAL')
);

-- 3. A receipt has the site's number, kept exactly as written (ADR-034): a blank isn't one.
ALTER TABLE "scale_receipt" ADD CONSTRAINT "scale_receipt_number_check" CHECK (
  btrim("receipt_number") <> ''
);

-- 4. The system actor is not a person: it copies no paper (ADR-276).
ALTER TABLE "scale_receipt" ADD CONSTRAINT "scale_receipt_entered_by_check" CHECK (
  "entered_by_id" <> '00000000-0000-7000-8000-000000000001'::uuid
);

-- 5. What a scale reads is nought or more. The net and its tons are kept as the paper has them,
-- below nought included: that is a transcription error or a tare taken loaded, flagged with the
-- weight unused, never refused (adms-scale-receipts, "Cases to handle"). Any of the four may be
-- missing: a receipt-book slip has a number and nothing else (ADR-036, 038).
ALTER TABLE "scale_receipt" ADD CONSTRAINT "scale_receipt_weights_check" CHECK (
  ("gross_weight_lb" IS NULL OR "gross_weight_lb" >= 0)
  AND ("tare_weight_lb" IS NULL OR "tare_weight_lb" >= 0)
);

-- 6. A photograph belongs to exactly one thing (ADR-101, 292). Its other owners join this check
-- with their own records: an ROE, a survey, an incident and a drop-off log (BACKLOG 1.3.6), a
-- record waiting in quarantine (1.4.2).
ALTER TABLE "photo" ADD CONSTRAINT "photo_owner_check" CHECK (
  num_nonnulls("field_event_id", "certification_id", "scale_receipt_id") = 1
);

-- 7. A view is one of a certification's five (ADR-179); no other photograph has one. A
-- certification's photograph with none is taken (a crew's has no views to name).
ALTER TABLE "photo" ADD CONSTRAINT "photo_view_check" CHECK (
  "view" IS NULL OR "certification_id" IS NOT NULL
);

-- 8. Whatever fix the phone had: a latitude and a longitude together, on the earth, or neither
-- (ADR-083; invariant 15).
ALTER TABLE "photo" ADD CONSTRAINT "photo_gps_check" CHECK ((
  num_nonnulls("latitude", "longitude") IN (0, 2)
  AND ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
  AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
) IS TRUE);

-- 9. A fingerprint is a SHA-256, as 64 lower-case hexadecimal digits; a file's place in storage
-- isn't blank (ARCHITECTURE §11).
ALTER TABLE "photo" ADD CONSTRAINT "photo_file_check" CHECK ((
  "original_sha256" ~ '^[0-9a-f]{64}$'
  AND "uploaded_sha256" ~ '^[0-9a-f]{64}$'
  AND btrim("object_key") <> ''
  AND ("depth_object_key" IS NULL OR btrim("depth_object_key") <> '')
) IS TRUE);

-- 10. A photograph's file is never overwritten, so neither is what says which file it is: the two
-- fingerprints and the two places in storage are written once, by anyone (ADR-101). The rest of
-- the record (its owner, when a reviewer resolves a quarantined record; its time and place, by
-- permission) is corrected as any evidence is.
CREATE TRIGGER "photo_refuse_file_edit"
  BEFORE UPDATE OF "original_sha256", "uploaded_sha256", "object_key", "depth_object_key" ON "photo"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();

-- 11. What a client user or an auditor sees (ADR-169, 315; C59): every column of their projects'
-- field events, the new one included (the view is replaced in place: the column was added at its
-- end), their projects' scale receipts, and their projects' photographs without where the files
-- are kept (the API hands a file out, as it does a map's uploaded file). A contractor user sees
-- none until a ticket carries its contractor (BACKLOG 1.7.1, C18).
SELECT guard_viewer('field_event', 'PROJECT');
SELECT guard_viewer('scale_receipt', 'PROJECT');
SELECT guard_viewer('photo', 'PROJECT', hidden => ARRAY['object_key', 'depth_object_key']);
