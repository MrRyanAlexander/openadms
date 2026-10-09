-- Guard: the size bands of one payable type never overlap, refused by the database itself
-- (spec/DATA-MODEL.md §3 "PayItem", §8; ARCHITECTURE §5; ADR-217, 309, 310). Written by hand into
-- Prisma's --create-only stub; never edited once applied.
--
-- Setup refuses an overlap first, naming the bands it overlaps (packages/domain's SizeBands,
-- AC-01-45); this is the database refusing it too, as ADR-309 left for an extension of its own.

-- 1. The btree_gist extension (PostgreSQL's own contrib module, its licence PostgreSQL's; trusted,
-- so the database's owner installs it without a superuser), pinned to the version Postgres 18
-- ships. It lets one exclusion constraint compare plain values (a project, a payable type) beside a
-- range. It lives in a schema of its own that no runtime login may use: its functions are callable
-- by anyone by default and pin no search path, so they stay out of public, which holds only
-- adms_owner's own guarded functions (grants.test.ts, catalog.test.ts). An index calls them without
-- that right; nobody else can.
CREATE SCHEMA "extensions";
REVOKE ALL ON SCHEMA "extensions" FROM PUBLIC;
CREATE EXTENSION "btree_gist" WITH SCHEMA "extensions" VERSION '1.8';

-- 2. On a project, two pay items of one payable type, neither archived, never have bands that
-- share a tenth of an inch. A band holds both its ends; an open end runs on without limit, as
-- "24 in and up" does (ADR-210, 217). A pay item with no band takes no part, nor does an archived
-- one, so an overlapping one can't be put back while the other stands.
ALTER TABLE "pay_item" ADD CONSTRAINT "pay_item_bands_never_overlap" EXCLUDE USING gist (
  "project_id" WITH =,
  "payable_type_id" WITH =,
  numrange("band_from", "band_to", '[]') WITH &&
) WHERE ("archived_at" IS NULL AND ("band_from" IS NOT NULL OR "band_to" IS NOT NULL));
