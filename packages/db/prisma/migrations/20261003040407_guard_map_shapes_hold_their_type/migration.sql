-- Guard: a shape on a map always holds its type and its coordinates (spec/DATA-MODEL.md §3
-- "Sites and the map"; ARCHITECTURE §3; ADR-311). Written by hand into Prisma's --create-only stub;
-- never edited once applied.
--
-- The shape checks of the guard before this one let a shape with no type or no coordinates through
-- ({"type": "Polygon"}): a member that isn't there reads as null, and a check that comes out null
-- passes. Here each is written again so that only a shape that is plainly a Polygon or MultiPolygon,
-- with its coordinates, is kept. Seen by sites.test.ts before any shape was written.
ALTER TABLE "site_area_version" DROP CONSTRAINT "site_area_version_geometry_check";
ALTER TABLE "site_area_version" ADD CONSTRAINT "site_area_version_geometry_check" CHECK ((
  jsonb_typeof("geometry") = 'object'
  AND "geometry"->>'type' IN ('Polygon', 'MultiPolygon')
  AND jsonb_typeof("geometry"->'coordinates') = 'array'
) IS TRUE);

ALTER TABLE "map_version" DROP CONSTRAINT "map_version_boundary_check";
ALTER TABLE "map_version" ADD CONSTRAINT "map_version_boundary_check" CHECK ((
  jsonb_typeof("boundary") = 'object'
  AND "boundary"->>'type' IN ('Polygon', 'MultiPolygon')
  AND jsonb_typeof("boundary"->'coordinates') = 'array'
) IS TRUE);

ALTER TABLE "zone" DROP CONSTRAINT "zone_geometry_check";
ALTER TABLE "zone" ADD CONSTRAINT "zone_geometry_check" CHECK ((
  jsonb_typeof("geometry") = 'object'
  AND "geometry"->>'type' IN ('Polygon', 'MultiPolygon')
  AND jsonb_typeof("geometry"->'coordinates') = 'array'
) IS TRUE);
