-- Guard: a collection's waypoints (spec/DATA-MODEL.md §4.1; spec/acceptance/11-field-app.md
-- AC-11-77; ARCHITECTURE §5; adms-field-app §4A.4; ADR-083, 097, 113, 271, 315, 325, 364, 571,
-- 581; BACKLOG 3.5.1, C180; REQ-303). Written by hand into Prisma's --create-only stub; never
-- edited once applied.
--
-- The table is the migration before this one: `field_event_waypoint`, the phone's time and
-- whatever fix it had each time its monitor pressed "Mark waypoint" while a collection was open,
-- in order. Evidence like any captured field: kept as sent, corrected in place by permission, a
-- waypoint taken off by a correction marked, never deleted. Nothing in the engine reads it.

-- 1. Evidence, audited, never deleted or truncated: the API writes it (a phone's sync, a
-- reviewer's correction); the worker reads it and writes none of it (ADR-271).
SELECT guard_table('field_event_waypoint', 'EVIDENCE', 'RECORDS');

-- 2. A waypoint is a load's collection's (ADR-571, 581): it repeats its field event's kind, which
-- its foreign key holds to the field event's own, so it can't sit on another kind and a field
-- event that has one can't be made another (ADR-308's idiom). Its place in the order starts at 1.
ALTER TABLE "field_event_waypoint" ADD CONSTRAINT "field_event_waypoint_kind_check" CHECK (
  "field_event_kind" = 'COLLECTION'
);
ALTER TABLE "field_event_waypoint" ADD CONSTRAINT "field_event_waypoint_position_check" CHECK (
  "position" >= 1
);

-- 3. Whatever fix the phone had: a latitude and a longitude together, on the earth, or neither
-- (ADR-083; invariant 15). A fix sent that couldn't be one is kept as sent, an object that holds
-- something, and never written into the fix's own columns (ADR-329 (5)).
ALTER TABLE "field_event_waypoint" ADD CONSTRAINT "field_event_waypoint_gps_check" CHECK ((
  num_nonnulls("latitude", "longitude") IN (0, 2)
  AND ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
  AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
) IS TRUE);
ALTER TABLE "field_event_waypoint" ADD CONSTRAINT "field_event_waypoint_unreadable_gps_check" CHECK ((
  "unreadable_gps" IS NULL
  OR (jsonb_typeof("unreadable_gps") = 'object' AND "unreadable_gps" <> '{}'::jsonb)
) IS TRUE);

-- 4. Its field event's project: nothing is added to or changed on a closed project's records
-- (ADR-529's guard, as for an item line and a carried ticket), and a ticket locked as invoiced
-- keeps its field events as they are, waypoints included (ADR-057, 090's guard).
CREATE TRIGGER "field_event_waypoint_project_open" BEFORE INSERT OR UPDATE OR DELETE
  ON "field_event_waypoint"
  FOR EACH ROW EXECUTE FUNCTION project_open_guard('field_event', 'field_event_id');
CREATE TRIGGER "field_event_waypoint_locked_ticket" BEFORE INSERT OR UPDATE
  ON "field_event_waypoint"
  FOR EACH ROW EXECUTE FUNCTION field_event_line_locked_ticket_guard();

-- 5. What a client user or an auditor sees (ADR-315; C59): every column of the waypoints of the
-- field events they see, the mark included, so one taken off is seen as taken off. A contractor
-- user sees those of its own tickets, as it sees their field events.
SELECT guard_viewer('field_event_waypoint', 'PART_OF', 'field_event', 'field_event_id');
