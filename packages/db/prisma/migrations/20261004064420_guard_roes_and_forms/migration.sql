-- Guard: ROEs and forms (spec/DATA-MODEL.md §3 "ROEs", §4.1 (2), §4.3, §4.4, §8;
-- spec/acceptance/04-field-capture.md section H; ARCHITECTURE §5; ADR-047, 052, 149, 150, 156,
-- 160, 169, 181, 184, 188, 236, 271, 276, 278, 292, 293, 294, 315, 327; BACKLOG C36, C59, C63
-- points 7, 16, 17, C64, C65; REQ-105i, 107). Written by hand into Prisma's --create-only stub;
-- never edited once applied.
--
-- The five tables, a field event's link to the ROE it found and a photograph's four new owners
-- are the migration before this one. Here: the tables' guards, the checks Prisma can't declare,
-- and what a viewer sees. That a scope line's ROE and debris type, a survey's ROE, a drop-off
-- log's site, a field event's ROE, a photograph's owner and the definition a record answered are
-- each of its own project are the foreign keys of that migration, not triggers here. Nothing
-- below judges whether work was eligible (ADR-052): each check refuses a record that isn't one.
-- An ROE that is unsigned, missing or out of scope, a post-work survey with no pre-work survey
-- and an incident of any kind are each taken; the first four are flags, the last stops nothing.

-- 1. An ROE is edited as setup is: freely, audited, never deleted (ADR-294). Its scope lines
-- with it. A survey, an incident and a drop-off log are evidence, as a field event is: the API
-- inserts and corrects them, the worker reads them and writes none of their columns (they have
-- no status: they never pair and never bill, ADR-236). A field event and a photograph gained
-- captured columns: rerun (ADR-271).
SELECT guard_table('roe', 'CONFIGURATION', 'RECORDS');
SELECT guard_table('roe_scope_item', 'CONFIGURATION', 'RECORDS');
SELECT guard_table('survey', 'EVIDENCE', 'RECORDS');
SELECT guard_table('incident', 'EVIDENCE', 'RECORDS');
SELECT guard_table('drop_off_log', 'EVIDENCE', 'RECORDS');
SELECT guard_table('field_event', 'EVIDENCE', 'RECORDS', ARRAY['status', 'reconciled_at']);
SELECT guard_table('photo', 'EVIDENCE', 'RECORDS');

-- 2. The ROE a field event found belongs where its number does: on a collection and on unit
-- rate work (ADR-149, 292).
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_roe_check" CHECK (
  "roe_id" IS NULL OR "kind" IN ('COLLECTION', 'UNIT_RATE')
);

-- 3. An ROE has its number, kept as issued or as typed off the paper (ADR-181): a blank isn't
-- one.
ALTER TABLE "roe" ADD CONSTRAINT "roe_number_check" CHECK (
  btrim("roe_number") <> ''
);

-- 4. One a phone made says who made it, on which phone, under which assignment, and when by
-- the phone's clock. One the back office made has no phone, no assignment and no phone's
-- offset; who made it there, and when, may be given (the audit record has the actor either way).
-- Every branch answers true or false, never null.
ALTER TABLE "roe" ADD CONSTRAINT "roe_source_check" CHECK ((
  CASE "source"
    WHEN 'DEVICE' THEN num_nonnulls("made_by_id", "device_id", "assignment_id", "made_at",
      "device_utc_offset_minutes") = 5
    WHEN 'BACK_OFFICE' THEN num_nonnulls("device_id", "assignment_id",
      "device_utc_offset_minutes") = 0
    ELSE false
  END
) IS TRUE);

-- 5. The system actor is not a person: it makes no ROE (ADR-276).
ALTER TABLE "roe" ADD CONSTRAINT "roe_made_by_check" CHECK (
  "made_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid
);

-- 6. A latitude and a longitude together, on the earth, or neither (invariant 15). Whether a
-- fix is required is the ROE form's setting, and a missing one is the phone's to ask for
-- (ADR-181).
ALTER TABLE "roe" ADD CONSTRAINT "roe_gps_check" CHECK ((
  num_nonnulls("latitude", "longitude") IN (0, 2)
  AND ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
  AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
) IS TRUE);

-- 7. The firm's own fields: answers keyed by field id, with the version of the definition they
-- answered, which is one of its own project's ROE form's (the form and its document type hold
-- it there, all three or none). With no definition there is nothing to answer. Whether each
-- answer fits its field is the schema packages/contracts makes from the definition (C36).
ALTER TABLE "roe" ADD CONSTRAINT "roe_answers_check" CHECK ((
  jsonb_typeof("answers") = 'object'
  AND num_nonnulls("form_definition_id", "form_id", "form_document_type") IN (0, 3)
  AND ("form_document_type" IS NULL OR "form_document_type" = 'ROE')
  AND ("form_definition_id" IS NOT NULL OR "answers" = '{}'::jsonb)
) IS TRUE);

-- 8. A scope line is one thing the project already has: a debris type on its load form, or a
-- payable type, never both and never neither (ADR-293). A debris type comes with its form and
-- that form's document type, which is the load form's. A count, where the ROE gives one, is one
-- or more; it is recorded and never checked against the work.
ALTER TABLE "roe_scope_item" ADD CONSTRAINT "roe_scope_item_pick_check" CHECK ((
  num_nonnulls("form_debris_type_id", "payable_type_id") = 1
  AND num_nonnulls("form_debris_type_id", "form_id", "form_document_type") IN (0, 3)
  AND ("form_document_type" IS NULL OR "form_document_type" = 'LOAD')
) IS TRUE);
ALTER TABLE "roe_scope_item" ADD CONSTRAINT "roe_scope_item_count_check" CHECK (
  "count" IS NULL OR "count" >= 1
);

-- 9. A survey, an incident and a drop-off log each say where they came from as a field event
-- does (ADR-047, 156): a phone's carries its phone, the assignment it held and the version of
-- its lists, and no back-office person or reason; one created in the back office the person and
-- the reason, and no phone, assignment or setup version. The system actor makes none and
-- creates none. Whatever fix the phone had, or none. The firm's own fields as an ROE's are, each
-- on its own kind of form.

ALTER TABLE "survey" ADD CONSTRAINT "survey_source_check" CHECK ((
  CASE "source"
    WHEN 'DEVICE' THEN num_nonnulls("device_id", "assignment_id", "setup_version") = 3
      AND num_nonnulls("created_by_id", "created_reason_id") = 0
    WHEN 'BACK_OFFICE' THEN num_nonnulls("device_id", "assignment_id", "setup_version") = 0
      AND num_nonnulls("created_by_id", "created_reason_id") = 2
    ELSE false
  END
) IS TRUE);
ALTER TABLE "survey" ADD CONSTRAINT "survey_monitor_check" CHECK (
  "monitor_id" <> '00000000-0000-7000-8000-000000000001'::uuid
);
ALTER TABLE "survey" ADD CONSTRAINT "survey_created_by_check" CHECK (
  "created_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid
);
ALTER TABLE "survey" ADD CONSTRAINT "survey_gps_check" CHECK ((
  num_nonnulls("latitude", "longitude") IN (0, 2)
  AND ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
  AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
) IS TRUE);
ALTER TABLE "survey" ADD CONSTRAINT "survey_answers_check" CHECK ((
  jsonb_typeof("answers") = 'object'
  AND num_nonnulls("form_definition_id", "form_id", "form_document_type") IN (0, 3)
  AND ("form_document_type" IS NULL OR "form_document_type" = 'SURVEY')
  AND ("form_definition_id" IS NOT NULL OR "answers" = '{}'::jsonb)
) IS TRUE);

ALTER TABLE "incident" ADD CONSTRAINT "incident_source_check" CHECK ((
  CASE "source"
    WHEN 'DEVICE' THEN num_nonnulls("device_id", "assignment_id", "setup_version") = 3
      AND num_nonnulls("created_by_id", "created_reason_id") = 0
    WHEN 'BACK_OFFICE' THEN num_nonnulls("device_id", "assignment_id", "setup_version") = 0
      AND num_nonnulls("created_by_id", "created_reason_id") = 2
    ELSE false
  END
) IS TRUE);
ALTER TABLE "incident" ADD CONSTRAINT "incident_monitor_check" CHECK (
  "monitor_id" <> '00000000-0000-7000-8000-000000000001'::uuid
);
ALTER TABLE "incident" ADD CONSTRAINT "incident_created_by_check" CHECK (
  "created_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid
);
ALTER TABLE "incident" ADD CONSTRAINT "incident_gps_check" CHECK ((
  num_nonnulls("latitude", "longitude") IN (0, 2)
  AND ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
  AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
) IS TRUE);
ALTER TABLE "incident" ADD CONSTRAINT "incident_answers_check" CHECK ((
  jsonb_typeof("answers") = 'object'
  AND num_nonnulls("form_definition_id", "form_id", "form_document_type") IN (0, 3)
  AND ("form_document_type" IS NULL OR "form_document_type" = 'INCIDENT')
  AND ("form_definition_id" IS NOT NULL OR "answers" = '{}'::jsonb)
) IS TRUE);

ALTER TABLE "drop_off_log" ADD CONSTRAINT "drop_off_log_source_check" CHECK ((
  CASE "source"
    WHEN 'DEVICE' THEN num_nonnulls("device_id", "assignment_id", "setup_version") = 3
      AND num_nonnulls("created_by_id", "created_reason_id") = 0
    WHEN 'BACK_OFFICE' THEN num_nonnulls("device_id", "assignment_id", "setup_version") = 0
      AND num_nonnulls("created_by_id", "created_reason_id") = 2
    ELSE false
  END
) IS TRUE);
ALTER TABLE "drop_off_log" ADD CONSTRAINT "drop_off_log_monitor_check" CHECK (
  "monitor_id" <> '00000000-0000-7000-8000-000000000001'::uuid
);
ALTER TABLE "drop_off_log" ADD CONSTRAINT "drop_off_log_created_by_check" CHECK (
  "created_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid
);
ALTER TABLE "drop_off_log" ADD CONSTRAINT "drop_off_log_gps_check" CHECK ((
  num_nonnulls("latitude", "longitude") IN (0, 2)
  AND ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
  AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
) IS TRUE);
ALTER TABLE "drop_off_log" ADD CONSTRAINT "drop_off_log_answers_check" CHECK ((
  jsonb_typeof("answers") = 'object'
  AND num_nonnulls("form_definition_id", "form_id", "form_document_type") IN (0, 3)
  AND ("form_document_type" IS NULL OR "form_document_type" = 'DROP_OFF_LOG')
  AND ("form_definition_id" IS NOT NULL OR "answers" = '{}'::jsonb)
) IS TRUE);

-- 10. A photograph belongs to exactly one thing (ADR-101, 292): the four new owners join the
-- check. A record waiting in quarantine joins it with its own table (BACKLOG 1.4.2).
ALTER TABLE "photo" DROP CONSTRAINT "photo_owner_check";
ALTER TABLE "photo" ADD CONSTRAINT "photo_owner_check" CHECK (
  num_nonnulls("field_event_id", "certification_id", "scale_receipt_id", "roe_id", "survey_id",
    "incident_id", "drop_off_log_id") = 1
);

-- 11. What a client user or an auditor sees (ADR-169, 315; C59): every column of their
-- projects' field events and their photographs' records, the new ones included (each view is
-- replaced in place: the columns were added at its end), a photograph still without where its
-- file is kept; and their projects' ROEs, scope lines, surveys, incidents and drop-off logs,
-- every column. A contractor user sees none (BACKLOG 1.7.1, C18).
SELECT guard_viewer('field_event', 'PROJECT');
SELECT guard_viewer('photo', 'PROJECT', hidden => ARRAY['object_key', 'depth_object_key']);
SELECT guard_viewer('roe', 'PROJECT');
SELECT guard_viewer('roe_scope_item', 'PROJECT');
SELECT guard_viewer('survey', 'PROJECT');
SELECT guard_viewer('incident', 'PROJECT');
SELECT guard_viewer('drop_off_log', 'PROJECT');
