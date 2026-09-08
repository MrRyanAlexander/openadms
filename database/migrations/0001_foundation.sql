-- =============================================================================
-- Open ADMS :: 0001 :: Foundation
-- Extensions, schema, shared helper functions, migration bookkeeping support.
-- Portable by design: PostGIS is OPTIONAL. Every spatial value is stored as
-- plain numeric lat/lon so the schema runs on any Postgres (Railway, Neon,
-- Supabase, RDS, Cloud SQL). When PostGIS is present the setup script layers
-- generated geography columns + GiST indexes on top (see 0011).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- Migration bookkeeping
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
    version      text PRIMARY KEY,
    checksum     text        NOT NULL,
    applied_at   timestamptz NOT NULL DEFAULT now(),
    runtime_ms   integer
);

COMMENT ON TABLE schema_migrations IS
    'One row per applied migration file. Managed by database/migrate.py.';

-- ---------------------------------------------------------------------------
-- Helper: updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Helper: attach the updated_at trigger to a table without repeating boilerplate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_attach_touch(p_table regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    trg_name text := 'trg_touch_' || replace(p_table::text, '.', '_');
BEGIN
    SET LOCAL client_min_messages = warning;
    EXECUTE format(
        'DROP TRIGGER IF EXISTS %I ON %s', trg_name, p_table);
    EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %s
         FOR EACH ROW EXECUTE FUNCTION adms_touch_updated_at()',
        trg_name, p_table);
END;
$$;

-- ---------------------------------------------------------------------------
-- Helper: block UPDATE / DELETE on immutable tables (transactions, audit)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'Table % is append-only; % is not permitted (record %)',
        TG_TABLE_NAME, TG_OP, COALESCE(OLD.id::text, '?')
        USING ERRCODE = 'restrict_violation';
END;
$$;

-- ---------------------------------------------------------------------------
-- Helper: great-circle distance in miles. Used when PostGIS is unavailable so
-- rules like `distance > 5 miles` evaluate identically on every deployment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_distance_miles(
    lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric
) RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL
            THEN NULL
        ELSE round(
            (3958.7613 * 2 * asin(sqrt(
                power(sin(radians(lat2 - lat1) / 2), 2) +
                cos(radians(lat1)) * cos(radians(lat2)) *
                power(sin(radians(lon2 - lon1) / 2), 2)
            )))::numeric, 4)
    END;
$$;

-- ---------------------------------------------------------------------------
-- Helper: human-readable sequential document numbers, scoped per project.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS number_sequences (
    scope_key    text PRIMARY KEY,
    last_value   bigint NOT NULL DEFAULT 0,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION adms_next_number(p_scope text, p_prefix text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_next bigint;
BEGIN
    INSERT INTO number_sequences AS ns (scope_key, last_value)
         VALUES (p_scope, 1)
    ON CONFLICT (scope_key) DO UPDATE
            SET last_value = ns.last_value + 1,
                updated_at = now()
      RETURNING last_value INTO v_next;

    RETURN p_prefix || lpad(v_next::text, 7, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- Helper: stable JSON diff between two records, used by the audit engine.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_jsonb_diff(before jsonb, after jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
      FROM (
            SELECT k AS key,
                   jsonb_build_object(
                       'from', before -> k,
                       'to',   after  -> k
                   ) AS value
              FROM (
                    SELECT jsonb_object_keys(COALESCE(before, '{}'::jsonb)) AS k
                    UNION
                    SELECT jsonb_object_keys(COALESCE(after,  '{}'::jsonb))
                   ) keys
             WHERE COALESCE(before -> k, 'null'::jsonb)
                   IS DISTINCT FROM
                   COALESCE(after -> k, 'null'::jsonb)
           ) changed;
$$;
