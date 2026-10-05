-- Guard: a photograph's archive mark and label (spec/DATA-MODEL.md §4.4;
-- spec/acceptance/04-field-capture.md section G, AC-04-102, AC-04-103; ARCHITECTURE §5, §11;
-- ADR-101, 113, 169, 271, 315, 329 (9), 337; BACKLOG C67 (e)). Written by hand into Prisma's
-- --create-only stub; never edited once applied.
--
-- The two columns are the migration before this one. Here: the table's guard again, the one
-- check Prisma can't declare, and what a viewer sees. Removing a photograph from the record
-- deletes nothing: the mark is a column, the row and the file stay (no login may delete a
-- photograph, and its fingerprints and places in storage are refused any change by
-- photo_refuse_file_edit, as before). Who removed or labelled it, and when, is the audit record
-- the table's guard writes.

-- 1. A photograph gained two columns, and evidence is granted column by column: rerun, so the
-- API can set and clear them and the worker still only reads (ADR-271).
SELECT guard_table('photo', 'EVIDENCE', 'RECORDS');

-- 2. A label is the firm's own words: any text, but a blank isn't one (no label is no value).
ALTER TABLE "photo" ADD CONSTRAINT "photo_label_check" CHECK (
  "label" IS NULL OR btrim("label") <> ''
);

-- 3. What a client user or an auditor sees (ADR-169, 315; C59): their projects' photographs'
-- records with the two new columns (the view is replaced in place: the columns were added at
-- its end), still without where a file is kept. A removed photograph's record is shown with its
-- mark; what a screen or an export does with it is theirs (Phase 4).
SELECT guard_viewer('photo', 'PROJECT', hidden => ARRAY['object_key', 'depth_object_key']);
