-- Guard: disposal sites in full, their labels, tipping fees and own shapes, and the project map
-- (spec/DATA-MODEL.md §3 "Sites and the map"; ARCHITECTURE §3, §5; ADR-005, 111, 135, 141, 142,
-- 144, 145, 173, 208, 215, 222, 271, 298, 308, 311; REQ-104, 105q, 124b). Written by hand into
-- Prisma's --create-only stub; never edited once applied.
--
-- The models are the migration before this one. Here: each new table's guards, and the checks
-- Prisma can't declare. That a site's tipping fee is its own project's pay item, and that a site's
-- type key is its type's own, are the foreign keys of the models' migration, not triggers here.

-- 1. The new configuration tables, one line each (ADR-271): the API writes them, the worker reads
-- them, nothing is deleted, every change is audited. A site's tipping fee link tells a fee line from
-- a hauling line, so its changes are the billing reviewer's to read, as a pay item's are (ADR-286).
-- No read-only viewer sees any of them: none has a viewer view or a grant to adms_readonly, so none
-- needs row-level security (as ADR-281…309 decided for the other setup tables; what a viewer sees
-- of a project's setup comes with BACKLOG 1.1.10).
SELECT guard_table('disposal_site_label', 'CONFIGURATION', 'OPERATIONS');
SELECT guard_table('disposal_site_tipping_fee', 'CONFIGURATION', 'BILLING');
SELECT guard_table('site_area_version', 'CONFIGURATION', 'OPERATIONS');
SELECT guard_table('map_version', 'CONFIGURATION', 'OPERATIONS');
SELECT guard_table('zone', 'CONFIGURATION', 'OPERATIONS');

-- 2. A site's shape, a map version and its zones are never edited (ADR-141, 144): a change is a new
-- version, and the shape a ticket was checked against stays as it was. The API adds versions and
-- reads them, never updates one, and nobody else may either (refuse_edit, ADR-308). Deletes and
-- truncates are refused by section 1.
REVOKE UPDATE ON "site_area_version", "map_version", "zone" FROM adms_api;
CREATE TRIGGER "site_area_version_refuse_edit" BEFORE UPDATE ON "site_area_version"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();
CREATE TRIGGER "map_version_refuse_edit" BEFORE UPDATE ON "map_version"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();
CREATE TRIGGER "zone_refuse_edit" BEFORE UPDATE ON "zone"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();

-- 3. A zone is written with its map version, in the same piece of work, never added to a version
-- loaded earlier: otherwise version 1 would gain a zone after tickets were checked against it.
-- The version's loaded_at is the piece of work's own time, which now() is throughout it.
CREATE FUNCTION zone_with_its_map_version() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "map_version"
    WHERE "id" = NEW."map_version_id" AND "loaded_at" = now()::timestamptz(3)
  ) THEN
    RAISE EXCEPTION 'Open ADMS writes a zone with its map version, never into one loaded earlier: a change is a new version'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "zone_with_its_map_version" BEFORE INSERT ON "zone"
  FOR EACH ROW EXECUTE FUNCTION zone_with_its_map_version();

-- Versions count from 1.
ALTER TABLE "site_area_version" ADD CONSTRAINT "site_area_version_version_check" CHECK ("version" >= 1);
ALTER TABLE "map_version" ADD CONSTRAINT "map_version_version_check" CHECK ("version" >= 1);

-- 4. A shape is a GeoJSON Polygon or MultiPolygon (ARCHITECTURE §3; ADR-311): what the engine reads
-- is fixed-shape data, never the firm's free-form JSON. Its bounding box is in longitude and
-- latitude, WGS84, south no further north than north. West may lie east of east: a shape across the
-- 180th meridian.
ALTER TABLE "site_area_version" ADD CONSTRAINT "site_area_version_geometry_check" CHECK (
  jsonb_typeof("geometry") = 'object'
  AND "geometry"->>'type' IN ('Polygon', 'MultiPolygon')
  AND jsonb_typeof("geometry"->'coordinates') = 'array'
);
ALTER TABLE "map_version" ADD CONSTRAINT "map_version_boundary_check" CHECK (
  jsonb_typeof("boundary") = 'object'
  AND "boundary"->>'type' IN ('Polygon', 'MultiPolygon')
  AND jsonb_typeof("boundary"->'coordinates') = 'array'
);
ALTER TABLE "zone" ADD CONSTRAINT "zone_geometry_check" CHECK (
  jsonb_typeof("geometry") = 'object'
  AND "geometry"->>'type' IN ('Polygon', 'MultiPolygon')
  AND jsonb_typeof("geometry"->'coordinates') = 'array'
);
ALTER TABLE "site_area_version" ADD CONSTRAINT "site_area_version_bounding_box_check" CHECK (
  "west_longitude" BETWEEN -180 AND 180 AND "east_longitude" BETWEEN -180 AND 180
  AND "south_latitude" BETWEEN -90 AND 90 AND "north_latitude" BETWEEN -90 AND 90
  AND "south_latitude" <= "north_latitude"
);
ALTER TABLE "map_version" ADD CONSTRAINT "map_version_bounding_box_check" CHECK (
  "west_longitude" BETWEEN -180 AND 180 AND "east_longitude" BETWEEN -180 AND 180
  AND "south_latitude" BETWEEN -90 AND 90 AND "north_latitude" BETWEEN -90 AND 90
  AND "south_latitude" <= "north_latitude"
);
ALTER TABLE "zone" ADD CONSTRAINT "zone_bounding_box_check" CHECK (
  "west_longitude" BETWEEN -180 AND 180 AND "east_longitude" BETWEEN -180 AND 180
  AND "south_latitude" BETWEEN -90 AND 90 AND "north_latitude" BETWEEN -90 AND 90
  AND "south_latitude" <= "north_latitude"
);

-- 5. A site's GPS is a point on the earth, WGS84 (ADR-005, 208).
ALTER TABLE "disposal_site" ADD CONSTRAINT "disposal_site_coordinates_check" CHECK (
  "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180
);

-- 6. A site closes on or after the day it opens; the close date may be empty (ADR-173).
ALTER TABLE "disposal_site" ADD CONSTRAINT "disposal_site_dates_check" CHECK (
  "close_date" IS NULL OR "close_date" >= "activation_date"
);

-- 7. Haul-outs leave only from a TDSR/DMS site (ADR-298; C52). The site repeats its type's built-in
-- key, which its foreign key holds to the type's own; a list value's key is written only by a
-- release (ADR-302). So the mark is refused on any other site, and a marked site's type can't
-- change away from TDSR/DMS while it's marked. Setup says so first, in plain words
-- (packages/domain's SiteFacts); this is the database refusing it too.
ALTER TABLE "disposal_site" ADD CONSTRAINT "disposal_site_haul_outs_check" CHECK (
  NOT "haul_outs_leave_here" OR "site_type_key" IS NOT DISTINCT FROM 'TDSR'
);
