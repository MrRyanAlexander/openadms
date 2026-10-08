-- Guard: the job queue (spec/DATA-MODEL.md §5; spec/acceptance/10-api-and-sync.md AC-10-50, 54,
-- point 14; spec/THREAT-MODEL.md T-30, T-31, T-34; ARCHITECTURE §5.1…§5.3, §13; ADR-097, 113,
-- 271, 360, 418; invariants 1, 3; BACKLOG 2.3.1, C71, C75; REQ-206). Written by hand into
-- Prisma's --create-only stub; never edited once applied.
--
-- The tables are the migration before this one. Their guards are their own, since no kind of
-- guard_table's fits: the API adds a job and its tickets, in the piece of work of the change that
-- asks for them, and changes neither; the worker reads them and writes only how a job went; no
-- read-only viewer reads either; nothing is deleted; every write is audited as how the work went.

-- 1. A job: the API reads and adds one; the worker reads it and updates it. What was asked (its
-- project, what asked for it, who and when) never changes, by any login; and once it is finished
-- or set aside the row is history.
REVOKE ALL ON "reconciliation_job" FROM PUBLIC, adms_api, adms_worker;
GRANT SELECT, INSERT ON "reconciliation_job" TO adms_api;
GRANT SELECT, UPDATE ON "reconciliation_job" TO adms_worker;
CREATE TRIGGER "reconciliation_job_refuse_delete" BEFORE DELETE ON "reconciliation_job"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "reconciliation_job_refuse_truncate" BEFORE TRUNCATE ON "reconciliation_job"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "reconciliation_job_audit" AFTER INSERT OR UPDATE ON "reconciliation_job"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('OPERATIONS');
CREATE TRIGGER "reconciliation_job_refuse_asked_edit"
  BEFORE UPDATE OF "id", "project_id", "trigger", "requested_by_id", "queued_at"
  ON "reconciliation_job" FOR EACH ROW EXECUTE FUNCTION refuse_edit();
CREATE TRIGGER "reconciliation_job_refuse_edit_once_ended" BEFORE UPDATE ON "reconciliation_job"
  FOR EACH ROW WHEN (OLD."finished_at" IS NOT NULL OR OLD."set_aside_at" IS NOT NULL)
  EXECUTE FUNCTION refuse_edit();

-- 2. How a job went: its tries are counted from nought; a finished job names the run that worked
-- it; a job is finished or set aside, never both; one set aside says why; an error's words are
-- never blank.
ALTER TABLE "reconciliation_job" ADD CONSTRAINT "reconciliation_job_attempts_check" CHECK (
  "attempts" >= 0
);
ALTER TABLE "reconciliation_job" ADD CONSTRAINT "reconciliation_job_ended_check" CHECK ((
  ("finished_at" IS NULL OR "reconciliation_run_id" IS NOT NULL)
  AND ("finished_at" IS NULL OR "set_aside_at" IS NULL)
  AND ("set_aside_at" IS NULL OR "last_error" IS NOT NULL)
  AND ("last_error" IS NULL OR btrim("last_error") <> '')
) IS TRUE);

-- 3. A job's ticket: the API reads and adds one; the worker reads it; nobody edits one. It names
-- its ticket.
REVOKE ALL ON "reconciliation_job_ticket" FROM PUBLIC, adms_api, adms_worker;
GRANT SELECT, INSERT ON "reconciliation_job_ticket" TO adms_api;
GRANT SELECT ON "reconciliation_job_ticket" TO adms_worker;
CREATE TRIGGER "reconciliation_job_ticket_refuse_delete" BEFORE DELETE ON "reconciliation_job_ticket"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "reconciliation_job_ticket_refuse_truncate" BEFORE TRUNCATE ON "reconciliation_job_ticket"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "reconciliation_job_ticket_audit" AFTER INSERT OR UPDATE ON "reconciliation_job_ticket"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('OPERATIONS');
CREATE TRIGGER "reconciliation_job_ticket_refuse_edit" BEFORE UPDATE ON "reconciliation_job_ticket"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();
ALTER TABLE "reconciliation_job_ticket" ADD CONSTRAINT "reconciliation_job_ticket_number_check" CHECK (
  btrim("ticket_number") <> ''
);
