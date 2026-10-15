-- Guard, before the migration that drops a form's Enabled column (ADR-529 (d); ADR-113, 315).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- What a read-only viewer sees of a form is a view that names its columns, so the column can't
-- be dropped under it. The view goes here, the column in the next migration, and the guard after
-- it makes the view again, by `guard_viewer`, with the columns the form has then.
DROP VIEW "viewer_form";
