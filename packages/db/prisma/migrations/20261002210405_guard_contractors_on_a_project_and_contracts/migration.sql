-- Guard: contractors on a project, and contracts (spec/DATA-MODEL.md §2.1, §3 "Contracts and
-- forms"; ARCHITECTURE §5; ADR-108, 113, 146, 239, 271, 305; REQ-106e).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The models are the migration before this one. Here: each new table's guards, and the checks
-- Prisma can't declare. That a contractor has one place on a project, that the prime a sub names
-- is one of its own project's primes, and that a contract's prime is one too, are the unique keys
-- and the two-column foreign keys of the models' migration, not triggers here.

-- 1. The new configuration tables, one line each (ADR-271): the API writes them, the worker reads
-- them, nothing is deleted, every change is audited. A contractor's place on a project is in the
-- operations domain, as the contractor is. A contract is what a pricing rule names, and its prime
-- is whose rate a transaction takes (ADR-239), so its changes are the billing reviewer's to read.
-- No read-only viewer sees either table yet: neither has a viewer view or a grant to
-- adms_readonly, so neither needs row-level security (as ADR-281, 286, 302 and 303 decided for the
-- other setup tables; what a viewer sees of a project's setup, and a prime's sight of its subs'
-- tickets, come with BACKLOG 1.1.10).
SELECT guard_table('project_contractor', 'CONFIGURATION', 'OPERATIONS');
SELECT guard_table('contract', 'CONFIGURATION', 'BILLING');

-- 2. A sub names the prime it works under; a prime names none (ADR-108).
ALTER TABLE "project_contractor" ADD CONSTRAINT "project_contractor_prime_check" CHECK (
  ("position" = 'PRIME') = ("prime_id" IS NULL)
);

-- 3. A prime's row carries its own contractor again as "as_prime_id"; a sub's row leaves it empty.
-- It is the key a sub's prime and a contract's prime are held to, so neither can name a sub, a
-- contractor of another project or one that isn't on the project at all; and a prime can't be made
-- a sub while a sub or a contract names it.
ALTER TABLE "project_contractor" ADD CONSTRAINT "project_contractor_as_prime_check" CHECK (
  "as_prime_id" IS NOT DISTINCT FROM (CASE WHEN "position" = 'PRIME' THEN "contractor_id" END)
);

-- 4. A contractor merged into another (a sub typed twice at certification, ADR-108) is merged into
-- a different record, and is archived: never deleted, and never still offered.
ALTER TABLE "contractor" ADD CONSTRAINT "contractor_merged_into_another_check" CHECK (
  "merged_into_id" IS NULL OR "merged_into_id" <> "id"
);
ALTER TABLE "contractor" ADD CONSTRAINT "contractor_merged_is_archived_check" CHECK (
  "merged_into_id" IS NULL OR "archived_at" IS NOT NULL
);
