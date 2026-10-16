-- Guard: a locked ticket's field events, asked inside each trigger (spec/DATA-MODEL.md §6;
-- ADR-057, 090, 534 (10); BACKLOG C81). Written by hand into Prisma's --create-only stub; never
-- edited once applied.
--
-- The migration before this one asked whether a lock stands on a field event's ticket through a
-- function of its own, which no login may call (a function's EXECUTE is granted to nobody but
-- its owner here), so every correction to a field event failed. A trigger's own function runs
-- for whoever writes; the question is asked inside the two, as the lock's guards on a
-- transaction ask theirs, and the function is dropped. What is held is the same: while a lock
-- stands on a ticket (on the live completed load or haul-out of its project and number, or on a
-- unit rate ticket's own field event), nothing changes its field events, their item lines or the
-- tickets they carry, but the two links a number finds (`certification_id`, `roe_id`).

CREATE OR REPLACE FUNCTION field_event_locked_ticket_guard() RETURNS trigger
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
  IF EXISTS (
    SELECT 1 FROM "invoice_lock" l
    WHERE l."unlocked_at" IS NULL
      AND (
        l."completed_load_id" IN (
          SELECT c."id" FROM "completed_load" c
          WHERE (OLD."workflow" = 'LOAD' AND c."project_id" = OLD."project_id"
              AND c."ticket_number" = OLD."ticket_number")
            OR (NEW."workflow" = 'LOAD' AND c."project_id" = NEW."project_id"
              AND c."ticket_number" = NEW."ticket_number"))
        OR l."completed_haul_out_id" IN (
          SELECT c."id" FROM "completed_haul_out" c
          WHERE (OLD."workflow" = 'HAUL_OUT' AND c."project_id" = OLD."project_id"
              AND c."ticket_number" = OLD."ticket_number")
            OR (NEW."workflow" = 'HAUL_OUT' AND c."project_id" = NEW."project_id"
              AND c."ticket_number" = NEW."ticket_number"))
        OR l."field_event_id" = OLD."id"
      )
  ) THEN
    RAISE EXCEPTION 'Ticket % is locked as invoiced: its field events don''t change. Unlock it first', OLD."ticket_number"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION field_event_line_locked_ticket_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  event record;
BEGIN
  SELECT "id", "project_id", "workflow", "ticket_number" INTO event
    FROM "field_event" WHERE "id" = NEW."field_event_id";
  IF FOUND AND EXISTS (
    SELECT 1 FROM "invoice_lock" l
    WHERE l."unlocked_at" IS NULL
      AND (
        (event.workflow = 'LOAD' AND l."completed_load_id" IN (
          SELECT c."id" FROM "completed_load" c
          WHERE c."project_id" = event.project_id AND c."ticket_number" = event.ticket_number))
        OR (event.workflow = 'HAUL_OUT' AND l."completed_haul_out_id" IN (
          SELECT c."id" FROM "completed_haul_out" c
          WHERE c."project_id" = event.project_id AND c."ticket_number" = event.ticket_number))
        OR l."field_event_id" = event.id
      )
  ) THEN
    RAISE EXCEPTION 'Ticket % is locked as invoiced: its field events don''t change. Unlock it first', event.ticket_number
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION field_event_ticket_locked(uuid, "workflow", text, uuid);
