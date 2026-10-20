-- Guard: a unit rate ticket's photographs by stage (the user, ADR-590; AC-04-104, AC-11-90).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The migration before this one adds a photograph's stage of the work and a kind of work's
-- setting, whether its tickets' photographs are taken by stage. Here: which photographs may say a
-- stage, the API's grant to correct it, the viewers' views with each new column, and the setting
-- on as shipped where an installation already holds the kinds of work.

-- 1. Only a field event's photograph says a stage of the work. One kept with its record while that
-- record waits in quarantine or is held for a person keeps it, as a certification's photograph
-- keeps its view (ADR-526 (4)): what a photograph belongs to is the kind it was sent naming, and
-- the sync's own contract takes a stage only on a field event's photograph.
ALTER TABLE "photo" ADD CONSTRAINT "photo_stage_check" CHECK (
  "stage" IS NULL
    OR "field_event_id" IS NOT NULL
    OR "quarantined_record_id" IS NOT NULL
    OR "held_record_id" IS NOT NULL
);

-- 2. (ADR-271.) The stage is corrected as the rest of the photograph's record is: the API's grant
-- given again, with the new column.
SELECT guard_table('photo', 'EVIDENCE', 'RECORDS');

-- 3. (ADR-169, 315, 361; C59.) Each view replaced in place, with its own, as before: each column was
-- added at its table's end.
SELECT guard_viewer('photo', 'PROJECT',
  hidden => ARRAY['object_key', 'depth_object_key'],
  own => 'EXISTS (SELECT 1 FROM public.field_event WHERE field_event."id" = photo."field_event_id") OR EXISTS (SELECT 1 FROM public.certification WHERE certification."id" = photo."certification_id") OR EXISTS (SELECT 1 FROM public.scale_receipt WHERE scale_receipt."id" = photo."scale_receipt_id")');
SELECT guard_viewer('kind_of_work', 'FIRM');

-- 4. Hangers, Leaners and Stumps photographed by stage where an installation already holds them
-- (the seed sets it on a new one, ADR-590): Stumps by its built-in key, the other two by the names
-- the seed gave them, unrenamed. Written as the system actor, so the audit record says who. One
-- statement, so the actor stated holds for the write.
DO $$
BEGIN
  PERFORM set_config('adms.actor_id', '00000000-0000-7000-8000-000000000001', true),
    set_config('adms.source', 'SYSTEM', true);
  UPDATE "kind_of_work" SET "photos_by_stage" = true
    WHERE "key" = 'STUMPS' OR ("key" IS NULL AND "name" IN ('Hangers', 'Leaners'));
END;
$$;
