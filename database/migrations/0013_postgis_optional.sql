-- =============================================================================
-- Open ADMS :: 0013 :: Optional PostGIS layer
-- Runs on every deployment. Where PostGIS is available it adds generated
-- geography columns and GiST indexes on top of the portable lat/lon columns.
-- Where it is not, it is a no-op and every feature above still works.
-- =============================================================================

DO $outer$
DECLARE
    v_available boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_available_extensions WHERE name = 'postgis'
    ) INTO v_available;

    IF NOT v_available THEN
        RAISE NOTICE
            'PostGIS not available on this server; using portable numeric '
            'lat/lon columns and adms_distance_miles(). No action needed.';
        RETURN;
    END IF;

    BEGIN
        CREATE EXTENSION IF NOT EXISTS postgis;
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'PostGIS present but not installable by this role; skipping.';
        RETURN;
    END;

    -- Disposal sites
    EXECUTE $sql$
        ALTER TABLE disposal_sites
            ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)
            GENERATED ALWAYS AS (
                CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL
                     THEN ST_SetSRID(ST_MakePoint(longitude::float8,
                                                  latitude::float8), 4326)::geography
                END
            ) STORED
    $sql$;
    EXECUTE 'CREATE INDEX IF NOT EXISTS disposal_sites_geom_idx
             ON disposal_sites USING gist (geom)';

    -- Tickets: origin and destination
    EXECUTE $sql$
        ALTER TABLE tickets
            ADD COLUMN IF NOT EXISTS origin_geom geography(Point, 4326)
            GENERATED ALWAYS AS (
                CASE WHEN origin_latitude IS NOT NULL AND origin_longitude IS NOT NULL
                     THEN ST_SetSRID(ST_MakePoint(origin_longitude::float8,
                                                  origin_latitude::float8), 4326)::geography
                END
            ) STORED
    $sql$;
    EXECUTE $sql$
        ALTER TABLE tickets
            ADD COLUMN IF NOT EXISTS destination_geom geography(Point, 4326)
            GENERATED ALWAYS AS (
                CASE WHEN destination_latitude IS NOT NULL
                      AND destination_longitude IS NOT NULL
                     THEN ST_SetSRID(ST_MakePoint(destination_longitude::float8,
                                                  destination_latitude::float8), 4326)::geography
                END
            ) STORED
    $sql$;
    EXECUTE 'CREATE INDEX IF NOT EXISTS tickets_origin_geom_idx
             ON tickets USING gist (origin_geom)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS tickets_destination_geom_idx
             ON tickets USING gist (destination_geom)';

    -- Waypoints
    EXECUTE $sql$
        ALTER TABLE ticket_waypoints
            ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)
            GENERATED ALWAYS AS (
                ST_SetSRID(ST_MakePoint(longitude::float8,
                                        latitude::float8), 4326)::geography
            ) STORED
    $sql$;
    EXECUTE 'CREATE INDEX IF NOT EXISTS ticket_waypoints_geom_idx
             ON ticket_waypoints USING gist (geom)';

    -- Spatial helper: tickets within a radius of a point
    EXECUTE $sql$
        CREATE OR REPLACE FUNCTION adms_tickets_near(
            p_project uuid, p_lat numeric, p_lon numeric, p_radius_miles numeric
        ) RETURNS SETOF tickets
        LANGUAGE sql STABLE AS $fn$
            SELECT t.* FROM tickets t
             WHERE t.project_id = p_project
               AND t.origin_geom IS NOT NULL
               AND ST_DWithin(
                     t.origin_geom,
                     ST_SetSRID(ST_MakePoint(p_lon::float8, p_lat::float8), 4326)::geography,
                     p_radius_miles * 1609.344)
        $fn$
    $sql$;

    RAISE NOTICE 'PostGIS layer installed: geography columns and GiST indexes added.';
END
$outer$;
