-- Guard: pay items in full, their rates per prime and a crew day's steps (spec/DATA-MODEL.md §2.2
-- (AssignmentPayItem), §3 "Pay items and rates"; ARCHITECTURE §5; ADR-087, 113, 128, 206, 210,
-- 217, 221, 223, 271, 292, 305, 309; REQ-102, 112d). Written by hand into Prisma's --create-only
-- stub; never edited once applied.
--
-- The models are the migration before this one. Here: each new table's guards, and the checks
-- Prisma can't declare. That a pay item has one rate per prime, that the prime is one of the pay
-- item's own project's primes, and that an assignment names only its own project's unit rate pay
-- items, are the unique keys and the foreign keys of the models' migration, not triggers here.
-- That the size bands of one payable type don't overlap is setup's to refuse (packages/domain's
-- SizeBands, ADR-217, 309), not the database's.

-- 1. The new configuration tables, one line each (ADR-271): the API writes them, the worker reads
-- them, nothing is deleted, every change is audited, a rate's change with its prior value (ADR-090).
-- Both are where a rate and its quantity live, so their changes are the billing reviewer's to
-- read, as the pay item's are (ADR-286). No read-only viewer sees either: neither has a viewer view
-- or a grant to adms_readonly, so neither needs row-level security (as ADR-281…308 decided for the
-- other setup tables; what a viewer sees of a project's setup comes with BACKLOG 1.1.10).
SELECT guard_table('pay_item_rate', 'CONFIGURATION', 'BILLING');
SELECT guard_table('pay_item_crew_day_step', 'CONFIGURATION', 'BILLING');

-- 2. A size band is in inches, never below nought, its from no more than its to; either end may be
-- open, as "24 in and up" is (ADR-210, 217).
ALTER TABLE "pay_item" ADD CONSTRAINT "pay_item_band_check" CHECK (
  ("band_from" IS NULL OR "band_from" >= 0)
  AND ("band_to" IS NULL OR "band_to" >= 0)
  AND ("band_from" IS NULL OR "band_to" IS NULL OR "band_from" <= "band_to")
);

-- 3. How hours become a quantity is said on a pay item by the hour or by the crew day, and only
-- there: per hour on HR; exact or in steps on CREW_DAY (ADR-087).
ALTER TABLE "pay_item" ADD CONSTRAINT "pay_item_crew_time_conversion_check" CHECK (
  ("unit" = 'HR' AND "crew_time_conversion" IS NOT DISTINCT FROM 'PER_HOUR')
  OR ("unit" = 'CREW_DAY' AND "crew_time_conversion" IS NOT NULL
    AND "crew_time_conversion" <> 'PER_HOUR')
  OR ("unit" NOT IN ('HR', 'CREW_DAY') AND "crew_time_conversion" IS NULL)
);

-- 4. A crew day by exact division has its day length, and only it does: more than nought, no more
-- than a day (ADR-087).
ALTER TABLE "pay_item" ADD CONSTRAINT "pay_item_crew_day_hours_check" CHECK (
  ("crew_time_conversion" IS NOT DISTINCT FROM 'PER_DAY_EXACT') = ("crew_day_hours" IS NOT NULL)
  AND ("crew_day_hours" IS NULL OR ("crew_day_hours" > 0 AND "crew_day_hours" <= 24))
);

-- 5. A crew day's step runs within a day, its from no more than its to, and bills a quantity of
-- nought or more (ADR-087).
ALTER TABLE "pay_item_crew_day_step" ADD CONSTRAINT "pay_item_crew_day_step_hours_check" CHECK (
  "from_hours" >= 0 AND "from_hours" <= "to_hours" AND "to_hours" <= 24
);
ALTER TABLE "pay_item_crew_day_step" ADD CONSTRAINT "pay_item_crew_day_step_quantity_check" CHECK (
  "quantity" >= 0
);

-- 6. A rate is nought or more. A prime with no rate on a pay item has no row: a $0 line, flagged
-- (ADR-128, 212).
ALTER TABLE "pay_item_rate" ADD CONSTRAINT "pay_item_rate_rate_check" CHECK ("rate" >= 0);
