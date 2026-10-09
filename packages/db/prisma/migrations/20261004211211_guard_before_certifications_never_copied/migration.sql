-- Guard, before the models' migration: a certification is never copied (ADR-328, 329, the user,
-- 2026-10-04: a truck that works another project is certified there from scratch). The next
-- migration takes "copied_from_id" off the certification. The view a client user or an auditor
-- reads names every column it shows, so it goes first; the migration after the next writes it
-- again from the columns that are left (ADR-315). Written by hand into Prisma's --create-only
-- stub; never edited once applied.
DROP VIEW "viewer_certification";
