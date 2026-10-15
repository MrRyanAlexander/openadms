-- Guard: setup records changed, archived and put back; a map or a site's shape from KML or an
-- Esri layer (spec/DATA-MODEL.md §3; ARCHITECTURE §3 "Project boundary and zones", §5; ADR-113,
-- 141, 142, 169, 240, 315, 485, 527; BACKLOG 2.8.5, C103, C140; REQ-213). Written by hand into
-- Prisma's --create-only stub; never edited once applied.
--
-- The enum value and the four columns are the migration before this one. Here:
--   1. a withdrawal's note is on a withdrawn assignment only, in a few words;
--   2. a map version's zones come from a layer of their own only on a map fetched from Esri,
--      named in the field picked, and a kept copy of them has their layer's address;
--   3. a site's shape fetched from Esri names its layer;
--   4. what a read-only viewer sees: a map version and a site's shape with their new columns,
--      never where a file is kept.

-- 1. (ADR-527 (13).) Cleared when the assignment is put back; the audit keeps it.
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_withdrawal_note_check" CHECK (
  "withdrawal_note" IS NULL
  OR ("archived_at" IS NOT NULL AND length(btrim("withdrawal_note")) BETWEEN 1 AND 500)
);

-- 2. (ADR-527 (15).)
ALTER TABLE "map_version" ADD CONSTRAINT "map_version_zones_layer_check" CHECK (
  "zones_source_name" IS NULL
  OR ("source" = 'ESRI_LAYER' AND "zone_name_field" IS NOT NULL)
);
ALTER TABLE "map_version" ADD CONSTRAINT "map_version_zones_file_check" CHECK (
  "zones_file_key" IS NULL OR "zones_source_name" IS NOT NULL
);

-- 3. (ADR-527 (10).)
ALTER TABLE "site_area_version" ADD CONSTRAINT "site_area_version_esri_layer_check" CHECK (
  "source" <> 'ESRI_LAYER' OR "source_name" IS NOT NULL
);

-- 4. (ADR-169, 315, 361.) Each view is replaced in place: the columns were added at its end.
SELECT guard_viewer('site_area_version', 'PART_OF', 'disposal_site', 'site_id',
  hidden => ARRAY['uploaded_file_key']);
SELECT guard_viewer('map_version', 'PROJECT', hidden => ARRAY['uploaded_file_key', 'zones_file_key']);
