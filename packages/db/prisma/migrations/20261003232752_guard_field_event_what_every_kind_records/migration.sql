-- Guard: what every kind of field event records (spec/DATA-MODEL.md §4.1 (1), §8;
-- spec/acceptance/04-field-capture.md section B; ARCHITECTURE §5; ADR-017, 083, 111, 120, 154,
-- 156, 169, 173, 195, 236, 240, 271, 315, 324; BACKLOG C44, C59; REQ-105i, 115). Written by hand
-- into Prisma's --create-only stub; never edited once applied.
--
-- The columns are the migration before this one. Here: the table's guards again, the checks
-- Prisma can't declare, and what a viewer sees. That a field event's certification and its site
-- are its own project's are the foreign keys of the columns' migration, not triggers here.
-- Nothing below judges whether work was eligible (ADR-052): each check refuses a record that
-- isn't one, never work that looks wrong.

-- 1. A field event gained captured columns: rerun, so the API can correct each of them and the
-- worker still writes only the ticket's status and the time it was reconciled (ADR-271).
SELECT guard_table('field_event', 'EVIDENCE', 'RECORDS', ARRAY['status', 'reconciled_at']);

-- 2. A phone's record carries its phone, the assignment it held and the version of its lists, and
-- no back-office person or reason. One created in the back office carries the person who created
-- it and why, and no phone, assignment or setup version; it was made in nobody's temporary
-- session (C44; ADR-156, 240). Every branch answers true or false, never null, which a check
-- would let through.
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_source_check" CHECK ((
  CASE "source"
    WHEN 'DEVICE' THEN num_nonnulls("device_id", "assignment_id", "setup_version") = 3
      AND num_nonnulls("created_by_id", "created_reason_id") = 0
    WHEN 'BACK_OFFICE' THEN num_nonnulls("device_id", "assignment_id", "setup_version") = 0
      AND num_nonnulls("created_by_id", "created_reason_id") = 2
      AND NOT "temporary_session"
    ELSE false
  END
) IS TRUE);

-- 3. The system actor is not a person: it creates no field event in the back office, as it
-- witnesses none (ADR-276; the dispatch models' guard holds the monitor).
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_created_by_check" CHECK (
  "created_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid
);

-- 4. A reason for typing the number belongs only on a number that was typed. A typed number with
-- no reason is taken: the phone asks for one, and a record that reached the server without it is
-- still what the monitor saw (ADR-111, 173, 324).
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_number_typed_check" CHECK (
  "number_typed" OR "number_typed_reason_id" IS NULL
);

-- 5. The capacity a monitor typed belongs only on a truck keyed in by hand, and is whole cubic
-- yards, nought or more. A crew keyed in by hand has no capacity to type, so keyed in by hand
-- with none is taken (ADR-154, 324).
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_typed_capacity_check" CHECK (
  "typed_capacity_cy" IS NULL OR ("cert_keyed_by_hand" AND "typed_capacity_cy" >= 0)
);

-- 6. Whatever fix the phone had, at each end: a latitude and a longitude together, on the earth,
-- or neither. No fix at all is taken (ADR-083; invariant 15).
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_start_gps_check" CHECK ((
  num_nonnulls("start_latitude", "start_longitude") IN (0, 2)
  AND ("start_latitude" IS NULL OR "start_latitude" BETWEEN -90 AND 90)
  AND ("start_longitude" IS NULL OR "start_longitude" BETWEEN -180 AND 180)
) IS TRUE);
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_end_gps_check" CHECK ((
  num_nonnulls("end_latitude", "end_longitude") IN (0, 2)
  AND ("end_latitude" IS NULL OR "end_latitude" BETWEEN -90 AND 90)
  AND ("end_longitude" IS NULL OR "end_longitude" BETWEEN -180 AND 180)
) IS TRUE);

-- 7. An address says whether it was looked up or typed, and only an address does (ADR-111).
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_address_check" CHECK (
  ("address" IS NULL) = ("address_source" IS NULL)
);

-- 8. What a client user or an auditor sees (ADR-169, 315; C59): their projects' field events, every
-- column, in the table's real shape. The row-level security guard's view named its columns one by
-- one, so it goes first; guard_viewer writes it again with the same two policies. A contractor
-- user sees none until a ticket carries its contractor (BACKLOG 1.7.1, C18).
DROP VIEW "viewer_field_event";
SELECT guard_viewer('field_event', 'PROJECT');

-- 9. Who recorded each: the monitor's name and Monitor ID, and nothing else of a person (no
-- phone, email or employer). No viewer reads "user"; row-level security can't tell columns apart,
-- so this view runs with the owner's rights and holds the viewer's question itself, behind a
-- security barrier, as viewer_project_setup does: a monitor is shown only to a client user or an
-- auditor, and only when they recorded a field event on one of that viewer's projects.
CREATE VIEW "viewer_field_event_monitor" WITH (security_barrier = true) AS
  SELECT "user"."id", "user"."name", "user"."monitor_number"
  FROM "user"
  WHERE viewer_sees_every_ticket() AND EXISTS (
    SELECT 1 FROM "field_event"
    WHERE "field_event"."monitor_id" = "user"."id"
      AND viewer_sees_project("field_event"."project_id")
  );
GRANT SELECT ON "viewer_field_event_monitor" TO adms_readonly;
