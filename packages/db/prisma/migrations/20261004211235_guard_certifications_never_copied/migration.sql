-- Guard: a certification is never copied (ADR-328, 329; spec/DATA-MODEL.md §3 "Certifications").
-- The migration before this one took "copied_from_id" off the certification, and its check
-- ("certification_copied_from_check") went with the column. Here: what a client user or an auditor
-- sees is written again from the columns that are left, without the driver's phone or licence
-- number, as before (ADR-315, 321). Written by hand into Prisma's --create-only stub; never edited
-- once applied.
SELECT guard_viewer('certification', 'PROJECT',
  hidden => ARRAY['driver_phone', 'driver_licence_number']);
