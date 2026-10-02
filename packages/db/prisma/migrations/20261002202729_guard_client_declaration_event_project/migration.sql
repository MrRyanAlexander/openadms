-- Guard: the client, the declaration event and the project in full (spec/DATA-MODEL.md §2.1, §3
-- "The project"; ARCHITECTURE §5; ADR-023, 026, 113, 127, 142, 161, 164, 203, 271, 303;
-- REQ-105b, 105c, 105f, 105j).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The models are the migration before this one. Here: each new table's guards, and the checks on a
-- project's own settings that Prisma can't declare.

-- 1. The new configuration tables, one line each (ADR-271): the API writes them, the worker reads
-- them, nothing is deleted, every change is audited. All in the operations domain: none holds a
-- rate, a login or a ticket. No read-only viewer sees any of them yet: none has a viewer view or a
-- grant to adms_readonly, so none needs row-level security (as ADR-281, 286 and 302 decided for the
-- other setup tables; the views a viewer needs come with BACKLOG 1.1.10). The project itself is
-- already row-secured, and its viewer view names its columns, so it shows none of the new ones.
SELECT guard_table('client', 'CONFIGURATION', 'OPERATIONS');
SELECT guard_table('declaration_event', 'CONFIGURATION', 'OPERATIONS');
SELECT guard_table('project_kind_of_work', 'CONFIGURATION', 'OPERATIONS');

-- 2. A project says which ticket types it allows (ADR-041): the list may be empty, never missing.
-- (Prisma makes a list column without NOT NULL; a check says it, so Prisma's own picture of the
-- column stays true.)
ALTER TABLE "project" ADD CONSTRAINT "project_workflows_check" CHECK ("workflows" IS NOT NULL);

-- 3. The active window (ADR-057, 161): its end may be empty, and is never before its start. A
-- ticket outside the window is flagged by the worker, never refused here.
ALTER TABLE "project" ADD CONSTRAINT "project_active_window_check" CHECK (
  "active_to" IS NULL OR "active_to" >= "active_from"
);

-- 4. The load-call limits (ADR-164): each is empty (off) or a load call's own range, a whole number
-- 0 to 100. What they start as is policy, not written here (invariant 16).
ALTER TABLE "project" ADD CONSTRAINT "project_load_call_limits_check" CHECK (
  ("load_call_low_limit" IS NULL OR "load_call_low_limit" BETWEEN 0 AND 100)
  AND ("load_call_high_limit" IS NULL OR "load_call_high_limit" BETWEEN 0 AND 100)
);

-- 5. The stump fill depth (ADR-203) and the site circle (ADR-142) are sizes: at least one inch,
-- one metre.
ALTER TABLE "project" ADD CONSTRAINT "project_stump_fill_depth_check" CHECK (
  "stump_fill_depth_inches" >= 1
);
ALTER TABLE "project" ADD CONSTRAINT "project_site_circle_check" CHECK ("site_circle_meters" >= 1);
