-- Guard: the checks Prisma can't declare (ARCHITECTURE §5.4; ADR-113, 270).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- A field event's kind belongs to one workflow (adms-domain §1.2, ADR-236): a load is a collection
-- and a disposal, a haul-out its own two, a unit rate ticket one unit rate event.
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_kind_in_workflow_check" CHECK (
  ("workflow" = 'LOAD' AND "kind" IN ('COLLECTION', 'DISPOSAL'))
  OR ("workflow" = 'HAUL_OUT' AND "kind" IN ('HAUL_OUT_COLLECTION', 'HAUL_OUT_DISPOSAL'))
  OR ("workflow" = 'UNIT_RATE' AND "kind" = 'UNIT_RATE')
);

-- The load call: a whole number 0-100 (a 0 is accepted and flagged, ADR-116), taken only at the
-- tower on a load's disposal and at the loading end on a haul-out's collection (ADR-013, 027).
-- Missing is allowed: a weight or a count of carried tickets replaces it (ADR-192, 223), and a
-- missing call is flagged, never refused.
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_load_call_check" CHECK (
  "load_call" IS NULL
  OR ("kind" IN ('DISPOSAL', 'HAUL_OUT_COLLECTION') AND "load_call" BETWEEN 0 AND 100)
);
