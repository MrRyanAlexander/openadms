-- Guard: the derived records (spec/DATA-MODEL.md §4.1 (3), §5, §8, §9;
-- spec/acceptance/06-reconciliation.md AC-06-06, 19, 21, 137, 138, 144, 145, 146, 148, 152;
-- ARCHITECTURE §5, §13; ADR-055, 086, 097, 113, 155, 162, 166, 169, 175, 236, 270, 271, 294, 295,
-- 315, 340; invariants 1, 4, 17, 21; BACKLOG 1.5.2, C16; REQ-113, 116). Written by hand into
-- Prisma's --create-only stub; never edited once applied.
--
-- The tables, their closed sets and the field event's three new columns are the migration before
-- this one; that a completed record's disposal, a collection row's load and collection, a flag's
-- record and run, and a field event's map version, zone and worked-out pay item are each of its
-- own project are that migration's foreign keys, and so is the one completed record a disposal
-- may have (a unique key). Here: who writes them, what is live once, the checks Prisma can't
-- declare, and what a viewer sees.

-- 1. Derived records are the worker's alone: it inserts and updates them, the API reads, nobody
-- deletes (invariants 1, 4, 21). The completed load was guarded by hand before the helper
-- existed; it takes the same line now. On a field event the worker writes its status and run
-- time and, from here, the zone, the map version used and a unit rate event's worked-out pay
-- item, and nothing a monitor captured; evidence is granted column by column, so rerun (ADR-271).
SELECT guard_table('completed_load', 'DERIVED', 'BILLING');
SELECT guard_table('completed_load_collection', 'DERIVED', 'BILLING');
SELECT guard_table('completed_haul_out', 'DERIVED', 'BILLING');
SELECT guard_table('completed_haul_out_collection', 'DERIVED', 'BILLING');
SELECT guard_table('flag', 'DERIVED', 'OPERATIONS');
SELECT guard_table('reconciliation_run', 'DERIVED', 'OPERATIONS');
SELECT guard_table('reconciliation_decision', 'DERIVED', 'OPERATIONS');
SELECT guard_table('field_event', 'EVIDENCE', 'RECORDS',
  ARRAY['status', 'reconciled_at', 'zone_id', 'map_version_id', 'worked_out_pay_item_id']);

-- 2. Live once (invariant 17). A completed load or haul-out that a correction dissolved is kept,
-- marked, and no longer holds its number or its collections; a live one does. Written as
-- exclusions on equality, which hold exactly what a unique key over the live rows would: a ticket
-- number once per project among live completed loads, and among live completed haul-outs; a
-- collection event a live row of one completed record at most, so it can't bill twice; and a
-- split suffix once among a completed record's live rows, one row for each property or pile.
ALTER TABLE "completed_load" ADD CONSTRAINT "completed_load_live_ticket_number_once"
  EXCLUDE USING btree ("project_id" WITH =, "ticket_number" WITH =) WHERE ("dissolved_at" IS NULL);
ALTER TABLE "completed_haul_out" ADD CONSTRAINT "completed_haul_out_live_ticket_number_once"
  EXCLUDE USING btree ("project_id" WITH =, "ticket_number" WITH =) WHERE ("dissolved_at" IS NULL);
ALTER TABLE "completed_load_collection" ADD CONSTRAINT "completed_load_collection_live_event_once"
  EXCLUDE USING btree ("collection_event_id" WITH =) WHERE ("dissolved_at" IS NULL);
ALTER TABLE "completed_haul_out_collection"
  ADD CONSTRAINT "completed_haul_out_collection_live_event_once"
  EXCLUDE USING btree ("collection_event_id" WITH =) WHERE ("dissolved_at" IS NULL);
ALTER TABLE "completed_load_collection" ADD CONSTRAINT "completed_load_collection_live_suffix_once"
  EXCLUDE USING btree ("completed_load_id" WITH =, "split_suffix" WITH =)
  WHERE ("dissolved_at" IS NULL);
ALTER TABLE "completed_haul_out_collection"
  ADD CONSTRAINT "completed_haul_out_collection_live_suffix_once"
  EXCLUDE USING btree ("completed_haul_out_id" WITH =, "split_suffix" WITH =)
  WHERE ("dissolved_at" IS NULL);

-- 3. A completed load's and a completed haul-out's quantity: a number that isn't blank, a load
-- call 0-100 (ADR-116), nothing below nought, and a weight marked as a share only where there is
-- a weight (ADR-175). A haul-out never takes its quantity from carried tickets.
ALTER TABLE "completed_load" ADD CONSTRAINT "completed_load_quantity_check" CHECK ((
  btrim("ticket_number") <> ''
  AND ("load_call" IS NULL OR "load_call" BETWEEN 0 AND 100)
  AND ("capacity_cy" IS NULL OR "capacity_cy" >= 0)
  AND ("volume_cy" IS NULL OR "volume_cy" >= 0)
  AND ("weight_tons" IS NULL OR "weight_tons" >= 0)
  AND ("carried_count" IS NULL OR "carried_count" >= 0)
  AND (NOT "weight_is_share" OR "weight_tons" IS NOT NULL)
) IS TRUE);
ALTER TABLE "completed_haul_out" ADD CONSTRAINT "completed_haul_out_quantity_check" CHECK ((
  btrim("ticket_number") <> ''
  AND "quantity_source" <> 'CARRIED_TICKETS'
  AND ("load_call" IS NULL OR "load_call" BETWEEN 0 AND 100)
  AND ("capacity_cy" IS NULL OR "capacity_cy" >= 0)
  AND ("volume_cy" IS NULL OR "volume_cy" >= 0)
  AND ("weight_tons" IS NULL OR "weight_tons" >= 0)
  AND (NOT "weight_is_share" OR "weight_tons" IS NOT NULL)
) IS TRUE);

-- 4. A collection row's share: its suffix empty or capital letters, as on its field event; a
-- fraction from nought to one; nothing below nought.
ALTER TABLE "completed_load_collection" ADD CONSTRAINT "completed_load_collection_share_check"
CHECK ((
  ("split_suffix" = '' OR "split_suffix" ~ '^[A-Z]+$')
  AND "share_fraction" BETWEEN 0 AND 1
  AND ("volume_cy" IS NULL OR "volume_cy" >= 0)
  AND ("weight_tons" IS NULL OR "weight_tons" >= 0)
) IS TRUE);
ALTER TABLE "completed_haul_out_collection"
  ADD CONSTRAINT "completed_haul_out_collection_share_check"
CHECK ((
  ("split_suffix" = '' OR "split_suffix" ~ '^[A-Z]+$')
  AND "share_fraction" BETWEEN 0 AND 1
  AND ("volume_cy" IS NULL OR "volume_cy" >= 0)
  AND ("weight_tons" IS NULL OR "weight_tons" >= 0)
) IS TRUE);

-- 5. A collection row's mileage comes with where it came from, both or neither, and is nought
-- or more; the road point routed from is a latitude and a longitude together, on the earth, or
-- neither (invariant 15); the map extract's date and hash come together, the hash a SHA-256 as
-- 64 lower-case hexadecimal digits (ADR-282); a looked-up address isn't blank.
ALTER TABLE "completed_load_collection" ADD CONSTRAINT "completed_load_collection_mileage_check"
CHECK ((
  num_nonnulls("mileage", "mileage_source") IN (0, 2)
  AND ("mileage" IS NULL OR "mileage" >= 0)
  AND num_nonnulls("snapped_latitude", "snapped_longitude") IN (0, 2)
  AND ("snapped_latitude" IS NULL OR "snapped_latitude" BETWEEN -90 AND 90)
  AND ("snapped_longitude" IS NULL OR "snapped_longitude" BETWEEN -180 AND 180)
  AND num_nonnulls("map_data_date", "map_data_sha256") IN (0, 2)
  AND ("map_data_sha256" IS NULL OR "map_data_sha256" ~ '^[0-9a-f]{64}$')
  AND ("snapped_address" IS NULL OR btrim("snapped_address") <> '')
) IS TRUE);
ALTER TABLE "completed_haul_out_collection"
  ADD CONSTRAINT "completed_haul_out_collection_mileage_check"
CHECK ((
  num_nonnulls("mileage", "mileage_source") IN (0, 2)
  AND ("mileage" IS NULL OR "mileage" >= 0)
  AND num_nonnulls("snapped_latitude", "snapped_longitude") IN (0, 2)
  AND ("snapped_latitude" IS NULL OR "snapped_latitude" BETWEEN -90 AND 90)
  AND ("snapped_longitude" IS NULL OR "snapped_longitude" BETWEEN -180 AND 180)
  AND num_nonnulls("map_data_date", "map_data_sha256") IN (0, 2)
  AND ("map_data_sha256" IS NULL OR "map_data_sha256" ~ '^[0-9a-f]{64}$')
  AND ("snapped_address" IS NULL OR btrim("snapped_address") <> '')
) IS TRUE);

-- 6. A flag is on something: a ticket (its workflow and number, both or neither, the number not
-- blank) or a record it names. It says something, and keeps the facts it was raised on as an
-- object with their hash, a SHA-256 as 64 lower-case hexadecimal digits (ADR-166). It is never
-- cleared before it was raised.
ALTER TABLE "flag" ADD CONSTRAINT "flag_subject_check" CHECK ((
  num_nonnulls("workflow", "ticket_number") IN (0, 2)
  AND ("ticket_number" IS NULL OR btrim("ticket_number") <> '')
  AND num_nonnulls("ticket_number", "field_event_id", "certification_id", "disposal_site_id",
    "survey_id") >= 1
) IS TRUE);
ALTER TABLE "flag" ADD CONSTRAINT "flag_message_check" CHECK (btrim("message") <> '');
ALTER TABLE "flag" ADD CONSTRAINT "flag_facts_check" CHECK ((
  jsonb_typeof("facts") = 'object' AND "facts_sha256" ~ '^[0-9a-f]{64}$'
) IS TRUE);
ALTER TABLE "flag" ADD CONSTRAINT "flag_cleared_check" CHECK (
  "cleared_at" IS NULL OR "cleared_at" >= "raised_at"
);

-- 7. A run never finishes before it starts, and counts nought or more tickets. A decision names
-- its ticket, its summary is an object for a person to read, and an error says something.
ALTER TABLE "reconciliation_run" ADD CONSTRAINT "reconciliation_run_finished_check" CHECK ((
  ("finished_at" IS NULL OR "finished_at" >= "started_at")
  AND ("tickets_done" IS NULL OR "tickets_done" >= 0)
  AND ("tickets_failed" IS NULL OR "tickets_failed" >= 0)
) IS TRUE);
ALTER TABLE "reconciliation_decision" ADD CONSTRAINT "reconciliation_decision_summary_check"
CHECK ((
  btrim("ticket_number") <> ''
  AND jsonb_typeof("summary") = 'object'
  AND ("error" IS NULL OR btrim("error") <> '')
) IS TRUE);

-- 8. On a field event, a zone comes with the map version it is a zone of (the foreign key holds
-- the pair only when both are there), and only a unit rate event has a worked-out pay item
-- (ADR-217).
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_zone_check" CHECK (
  "zone_id" IS NULL OR "map_version_id" IS NOT NULL
);
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_worked_out_pay_item_check" CHECK (
  "worked_out_pay_item_id" IS NULL OR "kind" = 'UNIT_RATE'
);

-- 9. What a client user or an auditor sees (ADR-169, 315; C59): their projects' completed loads
-- and haul-outs with their collection rows, and their flags, every column; the completed load's
-- view, dropped before its column went, is written again here; and every column of their
-- projects' field events, the three new ones included (the view is replaced in place: the
-- columns were added at its end). A run and its decisions are the back office's: no viewer reads
-- them. A contractor user sees none of these (BACKLOG 1.7.1, C18).
SELECT guard_viewer('completed_load', 'PROJECT');
SELECT guard_viewer('completed_load_collection', 'PROJECT');
SELECT guard_viewer('completed_haul_out', 'PROJECT');
SELECT guard_viewer('completed_haul_out_collection', 'PROJECT');
SELECT guard_viewer('flag', 'PROJECT');
SELECT guard_viewer('field_event', 'PROJECT');
