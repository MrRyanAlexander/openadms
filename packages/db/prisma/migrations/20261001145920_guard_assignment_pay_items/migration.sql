-- Guard: the pay item and the unit rate pay items an assignment names (REQ-020; ARCHITECTURE §5;
-- ADR-113, 127, 240, 271, 286; BACKLOG carry-forward C42).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The models are the migration before this one. Both are configuration: the API writes them, the
-- worker reads them, nothing is deleted, every change is audited (ADR-271). A pay item is where a
-- rate will live, so its changes are the billing reviewer's to read. No read-only viewer sees
-- either table: neither has a viewer view or a grant to adms_readonly, so neither needs row-level
-- security yet (as ADR-281 (10) decided for the other dispatch tables).
--
-- That an assignment's pay items are its own project's is the pair of two-column foreign keys in
-- the models' migration, not a check here.
SELECT guard_table('pay_item', 'CONFIGURATION', 'BILLING');
SELECT guard_table('assignment_pay_item', 'CONFIGURATION', 'OPERATIONS');
