-- Guard: what each kind of field event records (spec/DATA-MODEL.md §4.1 (2), §8;
-- spec/acceptance/04-field-capture.md sections C–F; ARCHITECTURE §5; ADR-006, 013, 032, 040, 055,
-- 084, 149, 177, 192, 198, 207, 210, 213, 218, 226, 243, 271, 292, 295, 315, 325; BACKLOG C59,
-- C63 points 7–12; REQ-103, 110, 111, 111a, 112, 112a, 112b, 115). Written by hand into Prisma's
-- --create-only stub; never edited once applied.
--
-- The columns and the two tables are the migration before this one. Here: the tables' guards, the
-- checks Prisma can't declare, and what a viewer sees. That a debris type's entry is on its own
-- project's form, that a field tag and a pay item are its own project's, and that an item line and
-- a carried ticket sit on the kind of field event they belong on, are the foreign keys of the
-- columns' migration, not triggers here. Nothing below judges whether work was eligible (ADR-052):
-- each check refuses a record that isn't one (an estimate on a tower's record, a measurement on a
-- load), never work that looks wrong, and none requires a pick: a detail that didn't reach the
-- server is a flag's.

-- 1. A field event gained captured columns: rerun, so the API can correct each of them and the
-- worker still writes only the ticket's status and the time it was reconciled (ADR-271). The two
-- new tables are evidence too: the API inserts and corrects them, the worker reads them, nothing
-- is deleted, every change is audited with the field event's own domain.
SELECT guard_table('field_event', 'EVIDENCE', 'RECORDS', ARRAY['status', 'reconciled_at']);
SELECT guard_table('field_event_item', 'EVIDENCE', 'RECORDS');
SELECT guard_table('carried_ticket', 'EVIDENCE', 'RECORDS');

-- 2. A split suffix is capital letters (A, B… AA), kept without its hyphen, and only a collection
-- or a haul-out collection has one: a load's properties and a haul-out's piles (ADR-032, 295).
-- A suffix on a disposal would let a second disposal onto the ticket beside the bare one, past
-- the key that keeps one field event of each kind (ADR-155, 325).
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_split_suffix_check" CHECK (
  "split_suffix" = ''
  OR ("kind" IN ('COLLECTION', 'HAUL_OUT_COLLECTION') AND "split_suffix" ~ '^[A-Z]+$')
);

-- 3. A split load's property has its suffix and its estimate, both or neither (ADR-006, 055); an
-- estimate is nought or more. No other kind holds one: a haul-out's pile gives a load call
-- instead (ADR-295). Every branch answers true or false, never null, which a check would let
-- through.
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_estimate_check" CHECK ((
  CASE
    WHEN "kind" = 'COLLECTION'
      THEN ("split_suffix" <> '') = ("estimate_cy" IS NOT NULL)
        AND ("estimate_cy" IS NULL OR "estimate_cy" >= 0)
    ELSE "estimate_cy" IS NULL
  END
) IS TRUE);

-- 4. A debris type is picked on a load or a haul-out, at each end, never on unit rate work
-- (ADR-207). The field event repeats the entry's form and that form's document type, all three
-- or none, and the document type is its workflow's: with the columns' foreign keys, the entry is
-- one of its own project's form for its own workflow (ADR-226, 325).
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_debris_type_check" CHECK ((
  num_nonnulls("form_debris_type_id", "form_id", "form_document_type") IN (0, 3)
  AND (
    "form_debris_type_id" IS NULL
    OR ("workflow" = 'LOAD' AND "form_document_type" = 'LOAD')
    OR ("workflow" = 'HAUL_OUT' AND "form_document_type" = 'HAUL_OUT')
  )
) IS TRUE);

-- 5. A field tag is the collecting monitor's, the loading end's of a haul-out, or a unit rate
-- monitor's; a tower takes none (ADR-218).
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_field_tag_check" CHECK (
  "field_tag_id" IS NULL OR "kind" IN ('COLLECTION', 'HAUL_OUT_COLLECTION', 'UNIT_RATE')
);

-- 6. An ROE is carried by a collection and by unit rate work (ADR-149).
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_roe_number_check" CHECK (
  "roe_number" IS NULL OR "kind" IN ('COLLECTION', 'UNIT_RATE')
);

-- 7. The count of what a load carries is the tower's, nought or more (ADR-243).
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_carried_count_check" CHECK (
  "carried_count" IS NULL OR ("kind" = 'DISPOSAL' AND "carried_count" >= 0)
);

-- 8. What unit rate work records, no load or haul-out does: the kind of work, the payable type,
-- the pay item, the count, the measurement and how it was read, a stump's root ball, its exposure
-- and its survey number, and "marked ineligible".
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_unit_rate_check" CHECK (
  "kind" = 'UNIT_RATE'
  OR num_nonnulls(
    "kind_of_work_id", "payable_type_id", "pay_item_id", "unit_count", "measurement_inches",
    "measured_as", "root_ball_inches", "root_ball_half_exposed", "survey_number",
    "marked_ineligible"
  ) = 0
);

-- 9. A measurement says whether it was read as a circumference or a diameter, and only a
-- measurement does (ADR-177); a measurement, a root ball and a count are nought or more.
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_measurement_check" CHECK ((
  ("measurement_inches" IS NULL) = ("measured_as" IS NULL)
  AND ("measurement_inches" IS NULL OR "measurement_inches" >= 0)
  AND ("root_ball_inches" IS NULL OR "root_ball_inches" >= 0)
  AND ("unit_count" IS NULL OR "unit_count" >= 0)
) IS TRUE);

-- 10. An item line is a unit rate event's and a carried ticket is a collection's. Each repeats its
-- field event's kind, which its foreign key holds to the field event's own, so neither can sit on
-- another kind and a field event that has them can't be made one (ADR-308's idiom). A line's
-- count or hours is nought or more.
ALTER TABLE "field_event_item" ADD CONSTRAINT "field_event_item_kind_check" CHECK (
  "field_event_kind" = 'UNIT_RATE'
);
ALTER TABLE "field_event_item" ADD CONSTRAINT "field_event_item_quantity_check" CHECK (
  "quantity" >= 0
);
ALTER TABLE "carried_ticket" ADD CONSTRAINT "carried_ticket_kind_check" CHECK (
  "field_event_kind" = 'COLLECTION'
);

-- 11. What a client user or an auditor sees (ADR-169, 315; C59): every column of their projects'
-- field events, the new ones included (the view is replaced in place: columns were only added at
-- its end), and the item lines and carried tickets of the field events they see. A contractor
-- user sees none until a ticket carries its contractor (BACKLOG 1.7.1, C18).
SELECT guard_viewer('field_event', 'PROJECT');
SELECT guard_viewer('field_event_item', 'PART_OF', 'field_event', 'field_event_id');
SELECT guard_viewer('carried_ticket', 'PART_OF', 'field_event', 'field_event_id');
