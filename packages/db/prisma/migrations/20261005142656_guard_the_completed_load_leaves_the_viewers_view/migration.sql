-- Guard, before the models' migration: the derived records (spec/DATA-MODEL.md §5; ADR-055, 162,
-- 268, 315, 330, 340; BACKLOG 1.5.2, C16). The next migration takes "collection_event_id" off the
-- completed load: a load's collections, one for each property on a split, become rows of their
-- own. The view a client user or an auditor reads names every column it shows, so it goes first;
-- the migration after the next writes it again from the completed load's new columns. Written by
-- hand into Prisma's --create-only stub; never edited once applied.
DROP VIEW "viewer_completed_load";
