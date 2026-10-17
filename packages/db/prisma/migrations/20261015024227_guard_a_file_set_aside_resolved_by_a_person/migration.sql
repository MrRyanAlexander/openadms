-- Guard: who resolves a file set aside, checked as every column that names a person is (ADR-276,
-- 438, 440, 526 (7)). Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The migration that gave a file set aside its resolution refused the system actor, the master
-- passcode's actor and the device key's in one check. Every other column that names a person
-- has three, one for each, named for the column: the tests of each actor ask every such column
-- for its own (`columnsNamingAUser`), as a later table's column joins them. The same rule, so
-- written; no row changes, and none could have broken it.

ALTER TABLE "set_aside_file" DROP CONSTRAINT "set_aside_file_resolved_by_check";
ALTER TABLE "set_aside_file" ADD CONSTRAINT "set_aside_file_resolved_by_check" CHECK (
  "resolved_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid
);
ALTER TABLE "set_aside_file" ADD CONSTRAINT "set_aside_file_resolved_by_id_not_master_passcode_check" CHECK (
  "resolved_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'::uuid
);
ALTER TABLE "set_aside_file" ADD CONSTRAINT "set_aside_file_resolved_by_id_not_device_key_check" CHECK (
  "resolved_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000003'::uuid
);
