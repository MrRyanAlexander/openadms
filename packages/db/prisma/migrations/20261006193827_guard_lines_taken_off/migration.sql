-- Guard: an item line and a carried ticket taken off by a correction (spec/DATA-MODEL.md §4.1;
-- spec/acceptance/08-review-and-corrections.md AC-08-66; ARCHITECTURE §5; adms-exceptions
-- "Corrections: in place, by permission"; ADR-051, 097, 113, 271, 315, 325, 364; BACKLOG 1.8.3,
-- C63; REQ-105g). Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The column is the migration before this one: `archived_at` on `field_event_item` and on
-- `carried_ticket`, a mark with its time, cleared to put the line back. Nothing is deleted: both
-- tables keep their refusal of a delete, and the row stays with everything it held.

-- 1. Evidence is granted column by column, so a table that gains a column is guarded again: the
-- API may write the mark, as a correction; the worker reads it and writes none of it (ADR-271).
SELECT guard_table('field_event_item', 'EVIDENCE', 'RECORDS');
SELECT guard_table('carried_ticket', 'EVIDENCE', 'RECORDS');

-- 2. What a client user or an auditor sees (ADR-315; C59): every column of their projects' item
-- lines and carried tickets, the mark included, so a line taken off is seen as taken off. Each
-- view is replaced in place: the column was added at its end.
SELECT guard_viewer('field_event_item', 'PART_OF', 'field_event', 'field_event_id');
SELECT guard_viewer('carried_ticket', 'PART_OF', 'field_event', 'field_event_id');
