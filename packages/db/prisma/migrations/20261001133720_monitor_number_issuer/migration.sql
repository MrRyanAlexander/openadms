-- Guard: the system issues every Monitor ID (REQ-021; Q-97; ADR-102, 113, 120, 281).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- A Monitor ID (M004127) is a business number the system makes, never one a person types: "M" and
-- the next number of one series for the whole installation, at least six digits. The next
-- migration makes it the default of "user"."monitor_number", so a person written without one gets
-- one from the database, whoever writes the row. Gaps in the series are normal (a number taken by
-- a write that was undone is never reissued).
CREATE SEQUENCE "monitor_number_seq" AS bigint MINVALUE 1 NO CYCLE;

CREATE FUNCTION next_monitor_number() RETURNS text
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, public
AS $$
  SELECT 'M' || lpad(issued::text, greatest(6, length(issued::text)), '0')
  FROM nextval('monitor_number_seq') AS issued
$$;

-- The API writes people (ARCHITECTURE §5.1), so the default runs as it. Nobody else is granted:
-- the owner (the installer's seed) needs no grant, and the worker writes no people.
GRANT USAGE ON SEQUENCE "monitor_number_seq" TO adms_api;
GRANT EXECUTE ON FUNCTION next_monitor_number() TO adms_api;
