-- =============================================================================
-- Open ADMS :: demo kit cleanup
--
-- The kit was only ever for the run that just finished. Leaving it behind would
-- mean a database that has been seeded with demo volume no longer matches one
-- built by setup.sh alone, and the next person to read \df would find four
-- routines that are not part of the product.
-- =============================================================================

\set ON_ERROR_STOP on

DROP PROCEDURE IF EXISTS adms_demo_finish_project(uuid, jsonb);
DROP PROCEDURE IF EXISTS adms_demo_price_project(uuid, integer);
DROP PROCEDURE IF EXISTS adms_demo_fill_tickets(uuid, integer, integer, jsonb, boolean);
DROP PROCEDURE IF EXISTS adms_demo_write_tickets(uuid, text, integer, integer, boolean);
DROP FUNCTION  IF EXISTS adms_demo_build_project(integer, jsonb);
