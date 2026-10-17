-- Guard: a certification's photograph kept with it while it is held keeps its view (ADR-179,
-- 526 (4); AC-04-78; BACKLOG 2.8.4). Written by hand into Prisma's --create-only stub; never
-- edited once applied.
--
-- A photograph says which of a certification's five views it is, and no other photograph has a
-- view. A certification a phone sent that the server couldn't save is held for a person, and
-- its five photographs are kept with the held record until a person saves it, when they move to
-- the certification. Kept so, each still says its view (seen by held.test.ts: the check refused
-- them, and the photographs could not be kept). What a photograph belongs to is the kind it was
-- sent naming, and the sync's own contract takes a view only on a certification's photograph.

ALTER TABLE "photo" DROP CONSTRAINT "photo_view_check";
ALTER TABLE "photo" ADD CONSTRAINT "photo_view_check" CHECK (
  "view" IS NULL OR "certification_id" IS NOT NULL OR "held_record_id" IS NOT NULL
);
