-- Guard: a field event written in this piece of work writes its own lines, even on a locked
-- ticket's number (spec/DATA-MODEL.md §6; ADR-057, 090, 534 (10); BACKLOG C81). Written by hand
-- into Prisma's --create-only stub; never edited once applied.
--
-- The guard on a locked ticket's item lines and carried tickets asked only whether the ticket was
-- locked, so a field event arriving now under a locked ticket's number (a split's late
-- collection, a disposal sent again whose number another took) could not write the tickets it
-- carries or its lines: the record was refused as the server's failure. What is held is the
-- locked ticket's own records as they stood: a line of a field event written before this piece
-- of work. A field event this piece of work wrote (its row's `xmin` is this transaction's) writes
-- its own lines; the field event itself is new, and no guard holds a new one.

CREATE OR REPLACE FUNCTION field_event_line_locked_ticket_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  event record;
BEGIN
  SELECT "id", "project_id", "workflow", "ticket_number", xmin = pg_current_xact_id()::xid AS new
    INTO event
    FROM "field_event" WHERE "id" = NEW."field_event_id";
  IF FOUND AND NOT event.new AND EXISTS (
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
