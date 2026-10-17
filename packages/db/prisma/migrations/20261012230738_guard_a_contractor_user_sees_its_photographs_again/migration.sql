-- Guard: a contractor user sees its own tickets' photographs again (spec/acceptance/02-people-
-- phones-access.md AC-02-78…82; ARCHITECTURE §5.5; ADR-361, 482). Written by hand into Prisma's
-- --create-only stub; never edited once applied.
--
-- The migration before this one reran guard_viewer on the photograph for its two new columns
-- and left out its `own`, so a contractor user's policy on a photograph lost the photographs of
-- its own field events, certifications and scale receipts (seen by
-- scale-receipts-and-photos.test.ts and catalog.test.ts before anything was committed). A
-- rerun of guard_viewer on such a table repeats its `own`: here it is, as ADR-361's migration
-- wrote it, with the new columns still shown and where the files are kept still hidden.
SELECT guard_viewer('photo', 'PROJECT',
  hidden => ARRAY['object_key', 'depth_object_key'],
  own => 'EXISTS (SELECT 1 FROM public.field_event WHERE field_event."id" = photo."field_event_id") OR EXISTS (SELECT 1 FROM public.certification WHERE certification."id" = photo."certification_id") OR EXISTS (SELECT 1 FROM public.scale_receipt WHERE scale_receipt."id" = photo."scale_receipt_id")');
