-- Guard: a certification entered in the back office, an acceptance taken back, which way a
-- passcode session was opened, a locked ticket's field events, and a photograph added in the back
-- office (spec/DATA-MODEL.md §3, §4.1, §4.4, §6; ARCHITECTURE §5, §7.2; AC-02-42; ADR-057, 090,
-- 097, 156, 166, 365, 462, 521, 534; invariants 1, 3, 5; BACKLOG 2.8.7, C81, C124). Written by
-- hand into Prisma's --create-only stub; never edited once applied.
--
-- The columns are the migration before this one. Now:
--   1. a certification entered in the back office names who entered it and why, both or neither,
--      and then has no phone and no assignment; who entered it is a person;
--   2. an acceptance taken back says who and when, both or neither, a note only with them; who
--      took it back is a person; a flag has one acceptance in force at most (the unique key the
--      migration before this one dropped, held now among those not taken back); an acceptance
--      taken back is history;
--   3. a field event says which way the session it was made in was opened under the master
--      passcode, only on a phone's record, and a temporary session's is exactly what
--      `temporary_session` says; evidence is granted column by column: rerun;
--   4. while a lock as invoiced stands on a ticket, nothing changes its field events, their item
--      lines or the tickets they carry, but the two links a number finds (`certification_id`,
--      `roe_id`), which a correction to a certification or an ROE several tickets share moves and
--      the ticket reads only once unlocked;
--   5. a photograph with no phone, added in the back office, has its upload time written by a
--      person from the back office; a phone's is still written by that phone alone;
--   6. what a read-only viewer sees: the new columns, with the views as they were.

-- 1.
ALTER TABLE "certification" ADD CONSTRAINT "certification_created_check" CHECK ((
  num_nonnulls("created_by_id", "created_reason_id") IN (0, 2)
  AND ("created_by_id" IS NULL OR num_nonnulls("device_id", "assignment_id") = 0)
  AND "created_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid
) IS TRUE);
ALTER TABLE "certification" ADD CONSTRAINT "certification_created_by_id_not_master_passcode_check" CHECK (
  "created_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'::uuid
);
ALTER TABLE "certification" ADD CONSTRAINT "certification_created_by_id_not_device_key_check" CHECK (
  "created_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000003'::uuid
);
-- Who entered it, and why, never change: a mistake there is the audit log's to show.
CREATE TRIGGER "certification_refuse_created_edit"
  BEFORE UPDATE OF "created_by_id", "created_reason_id" ON "certification"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();

-- 2.
ALTER TABLE "flag_acceptance" ADD CONSTRAINT "flag_acceptance_withdrawn_check" CHECK ((
  num_nonnulls("withdrawn_by_id", "withdrawn_at") IN (0, 2)
  AND ("withdraw_note" IS NULL OR ("withdrawn_at" IS NOT NULL AND btrim("withdraw_note") <> ''))
  AND "withdrawn_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid
) IS TRUE);
ALTER TABLE "flag_acceptance" ADD CONSTRAINT "flag_acceptance_withdrawn_by_id_not_master_passcode_check" CHECK (
  "withdrawn_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'::uuid
);
ALTER TABLE "flag_acceptance" ADD CONSTRAINT "flag_acceptance_withdrawn_by_id_not_device_key_check" CHECK (
  "withdrawn_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000003'::uuid
);
ALTER TABLE "flag_acceptance" ADD CONSTRAINT "flag_acceptance_accepted_once"
  EXCLUDE USING btree ("flag_id" WITH =) WHERE ("withdrawn_at" IS NULL);
CREATE TRIGGER "flag_acceptance_refuse_edit_once_withdrawn" BEFORE UPDATE ON "flag_acceptance"
  FOR EACH ROW WHEN (OLD."withdrawn_at" IS NOT NULL) EXECUTE FUNCTION refuse_edit();

-- 3.
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_master_passcode_session_check" CHECK ((
  ("master_passcode_session" IS NULL OR "source" = 'DEVICE')
  AND "temporary_session" = ("master_passcode_session" IS NOT DISTINCT FROM 'TEMPORARY')
) IS TRUE);
SELECT guard_table('field_event', 'EVIDENCE', 'RECORDS',
  ARRAY['status', 'reconciled_at', 'zone_id', 'map_version_id', 'worked_out_pay_item_id']);

-- 4. Whether a lock stands on a field event's ticket, as the review services and the worker ask
-- it: on the live completed load or haul-out of its project and number, or on the unit rate
-- ticket's own field event.
CREATE FUNCTION field_event_ticket_locked(project uuid, flow "workflow", number text, event uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "invoice_lock" l
    WHERE l."unlocked_at" IS NULL
      AND (
        (flow = 'LOAD' AND l."completed_load_id" IN (
          SELECT c."id" FROM "completed_load" c
          WHERE c."project_id" = project AND c."ticket_number" = number))
        OR (flow = 'HAUL_OUT' AND l."completed_haul_out_id" IN (
          SELECT c."id" FROM "completed_haul_out" c
          WHERE c."project_id" = project AND c."ticket_number" = number))
        OR (flow = 'UNIT_RATE' AND l."field_event_id" = event)
      )
  );
$$;

CREATE FUNCTION field_event_locked_ticket_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  before jsonb := to_jsonb(OLD) - 'certification_id' - 'roe_id';
  after jsonb := to_jsonb(NEW) - 'certification_id' - 'roe_id';
BEGIN
  IF before = after THEN
    RETURN NEW;
  END IF;
  IF field_event_ticket_locked(OLD."project_id", OLD."workflow", OLD."ticket_number", OLD."id")
    OR field_event_ticket_locked(NEW."project_id", NEW."workflow", NEW."ticket_number", NEW."id") THEN
    RAISE EXCEPTION 'Ticket % is locked as invoiced: its field events don''t change. Unlock it first', OLD."ticket_number"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "field_event_locked_ticket" BEFORE UPDATE ON "field_event"
  FOR EACH ROW EXECUTE FUNCTION field_event_locked_ticket_guard();

-- A field event's item line or carried ticket, added or changed: its field event's ticket asked.
CREATE FUNCTION field_event_line_locked_ticket_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  event record;
BEGIN
  SELECT "id", "project_id", "workflow", "ticket_number" INTO event
    FROM "field_event" WHERE "id" = NEW."field_event_id";
  IF FOUND AND field_event_ticket_locked(event.project_id, event.workflow, event.ticket_number, event.id) THEN
    RAISE EXCEPTION 'Ticket % is locked as invoiced: its field events don''t change. Unlock it first', event.ticket_number
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "field_event_item_locked_ticket" BEFORE INSERT OR UPDATE ON "field_event_item"
  FOR EACH ROW EXECUTE FUNCTION field_event_line_locked_ticket_guard();
CREATE TRIGGER "carried_ticket_locked_ticket" BEFORE INSERT OR UPDATE ON "carried_ticket"
  FOR EACH ROW EXECUTE FUNCTION field_event_line_locked_ticket_guard();

-- 5. ADR-482's guard, with a photograph that has no phone: its time is written from the back
-- office, by a person.
CREATE OR REPLACE FUNCTION photo_upload_guard() RETURNS trigger
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
  IF NEW."device_id" IS NULL THEN
    IF nullif(current_setting('adms.source', true), '') IS DISTINCT FROM 'BACK_OFFICE' THEN
      RAISE EXCEPTION 'A photograph added in the back office is uploaded from the back office, by a person'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF nullif(current_setting('adms.source', true), '') IS DISTINCT FROM 'DEVICE'
    OR nullif(current_setting('adms.device_id', true), '') IS DISTINCT FROM NEW."device_id"::text THEN
    RAISE EXCEPTION 'A photograph''s file is uploaded by the phone that took it: state that phone'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- 6. (ADR-169, 315, 361; C59, C76.) Each view replaced in place, with its own, as before.
SELECT guard_viewer('certification', 'PROJECT',
  hidden => ARRAY['driver_phone', 'driver_licence_number'],
  own => 'viewer_is_contractor("prime_id") OR viewer_is_contractor("first_tier_sub_id") OR viewer_is_contractor("second_tier_sub_id")');
SELECT guard_viewer('field_event', 'PROJECT',
  own => 'EXISTS (SELECT 1 FROM public.certification WHERE certification."id" = field_event."certification_id")');
SELECT guard_viewer('flag_acceptance', 'PROJECT');
