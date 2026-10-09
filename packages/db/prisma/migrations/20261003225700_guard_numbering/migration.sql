-- Guard: a project's number series, its control ranges, and number blocks that never hold the same
-- number (spec/DATA-MODEL.md §3 "Numbering", §8; spec/acceptance/04-field-capture.md AC-04-01,
-- 04…09, 14; ARCHITECTURE §5; ADR-046, 056, 062, 065, 151, 181, 271, 310, 315, 323; REQ-105k,
-- 106a, 114). Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The models are the migration before this one. Here: each new table's guards, the checks Prisma
-- can't declare, and what a viewer sees. That a block is cut only from a series its project has is
-- a foreign key of the models' migration, not a trigger here. Which numbers the next block takes
-- is packages/domain's (NumberSeriesBook), asked by the service that writes the block: the
-- database works out nothing, and refuses what would put one number on two phones.

-- 1. The new configuration tables, one line each (ADR-271): the API writes them, the worker reads
-- them, nothing is deleted, every change is audited with its prior value.
SELECT guard_table('project_number_series', 'CONFIGURATION', 'OPERATIONS');
SELECT guard_table('control_range', 'CONFIGURATION', 'OPERATIONS');

-- 2. A series starts at a number of one or more, and its next number is never before its start.
-- A ticket series (load, haul-out, unit rate) runs from 100,001 to 9,999,999 (ADR-062): its next
-- number is at most one past the end, where it is used up. A cert-number or ROE series starts
-- where the firm says. Every branch answers true or false, never null.
ALTER TABLE "project_number_series" ADD CONSTRAINT "project_number_series_range_check" CHECK (
  "first_number" >= 1 AND "next_number" >= "first_number"
);
ALTER TABLE "project_number_series" ADD CONSTRAINT "project_number_series_ticket_range_check" CHECK ((
  "series" NOT IN ('LOAD', 'HAUL_OUT', 'UNIT_RATE')
  OR ("first_number" >= 100001 AND "next_number" <= 10000000)
) IS TRUE);

-- 3. A number block of a ticket series lies inside 100,001 to 9,999,999 too: a number outside
-- that is never issued (ADR-062).
ALTER TABLE "number_block" ADD CONSTRAINT "number_block_ticket_range_check" CHECK ((
  "series" NOT IN ('LOAD', 'HAUL_OUT', 'UNIT_RATE')
  OR ("first_number" >= 100001 AND "last_number" <= 9999999)
) IS TRUE);

-- 4. Two phones never hold the same number (ADR-065). On one project and one series, the numbers
-- two blocks hold never overlap. An issued block holds its whole run, and so does a retired one,
-- for good: nobody can be sure what a lost phone used. A reclaimed block holds only what its
-- phone used, first to last used (nothing, if it used none): the rest was handed back and may be
-- cut again for the next phone, once. The range is written half-open so that a block that used
-- nothing is an empty range, which overlaps nothing.
ALTER TABLE "number_block" ADD CONSTRAINT "number_blocks_never_overlap" EXCLUDE USING gist (
  "project_id" WITH =,
  "series" WITH =,
  int4range(
    "first_number",
    CASE
      WHEN "status" = 'RECLAIMED' THEN COALESCE("last_used_number", "first_number" - 1)
      ELSE "last_number"
    END + 1,
    '[)'
  ) WITH &&
);

-- 5. A control range is a run of pre-printed ticket numbers, first to last (ADR-056). Only loads
-- and haul-outs are numbered from control tickets: unit rate tickets are generated on every
-- project, a pre-printed cert number or a paper ROE's number is typed and kept as written. The
-- stock's own numbers are the printer's: no 100,001 to 9,999,999 here.
ALTER TABLE "control_range" ADD CONSTRAINT "control_range_range_check" CHECK (
  "first_number" >= 1 AND "first_number" <= "last_number"
);
ALTER TABLE "control_range" ADD CONSTRAINT "control_range_series_check" CHECK (
  "series" IN ('LOAD', 'HAUL_OUT')
);

-- 6. On one project and one series, two ranges, neither archived, never share a number: the same
-- stock entered twice is a setup mistake (ADR-323). An archived range takes no part, so one that
-- overlaps can't be put back while the other stands.
ALTER TABLE "control_range" ADD CONSTRAINT "control_ranges_never_overlap" EXCLUDE USING gist (
  "project_id" WITH =,
  "series" WITH =,
  int4range("first_number", "last_number", '[]') WITH &&
) WHERE ("archived_at" IS NULL);

-- 7. What a read-only viewer sees (ADR-315): a client user and an auditor see their projects'
-- whole setup, so its series and its control ranges; a contractor user none. A phone's blocks
-- stay unseen, as they were (ADR-281).
SELECT guard_viewer('project_number_series', 'PROJECT');
SELECT guard_viewer('control_range', 'PROJECT');
