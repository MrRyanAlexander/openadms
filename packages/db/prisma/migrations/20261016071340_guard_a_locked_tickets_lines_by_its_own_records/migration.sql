-- Guard: a locked ticket's lines held by its own records (spec/DATA-MODEL.md §6; ADR-057, 090,
-- 534 (10); BACKLOG C81). Written by hand into Prisma's --create-only stub; never edited once
-- applied.
--
-- The guard on a locked ticket's item lines and carried tickets asked by the ticket's number,
-- so a field event arriving now under a locked ticket's number (a split's late collection) could
-- not write its own lines; the migration before this one let a field event written in the same
-- piece of work through, which held nothing where the records are written together (a test's
-- world, a story's). What the lock holds is what was invoiced: the field events of the locked
-- completed load or haul-out (its disposal, and its collections not dissolved) and the unit rate
-- ticket's own field event. A line of one of those changes no more, for anybody; any other field
-- event writes its own. The field events themselves are still held by their ticket's number
-- (`field_event_locked_ticket_guard`), so none is moved into or out of a locked ticket.

CREATE OR REPLACE FUNCTION field_event_line_locked_ticket_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  event uuid := NEW."field_event_id";
BEGIN
  IF EXISTS (
    SELECT 1 FROM "invoice_lock" l
    WHERE l."unlocked_at" IS NULL
      AND (
        l."field_event_id" = event
        OR l."completed_load_id" IN (
          SELECT c."id" FROM "completed_load" c WHERE c."disposal_event_id" = event
          UNION
          SELECT r."completed_load_id" FROM "completed_load_collection" r
          WHERE r."collection_event_id" = event AND r."dissolved_at" IS NULL)
        OR l."completed_haul_out_id" IN (
          SELECT c."id" FROM "completed_haul_out" c WHERE c."disposal_event_id" = event
          UNION
          SELECT r."completed_haul_out_id" FROM "completed_haul_out_collection" r
          WHERE r."collection_event_id" = event AND r."dissolved_at" IS NULL)
      )
  ) THEN
    RAISE EXCEPTION 'Ticket % is locked as invoiced: its field events don''t change. Unlock it first',
      (SELECT "ticket_number" FROM "field_event" WHERE "id" = event)
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
