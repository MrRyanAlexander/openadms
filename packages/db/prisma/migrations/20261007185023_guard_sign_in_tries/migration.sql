-- Guard: the count of wrong tries on a person's sign-in record (spec/acceptance/10-api-and-sync.md
-- AC-10-18; spec/THREAT-MODEL.md T-16; ARCHITECTURE §6, Abuse; ADR-113, 397, 401, 409; BACKLOG
-- 2.2.3). Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The two columns are the migration before this one. The table's own guards (its grants, its
-- audit, no delete) already hold them: a grant is on the table, and the audit captures the row.
-- One rule is added: a count of wrong tries is never below nought.
ALTER TABLE "user_credential" ADD CONSTRAINT "user_credential_failed_sign_ins_check" CHECK (
  "failed_sign_ins" >= 0
);
