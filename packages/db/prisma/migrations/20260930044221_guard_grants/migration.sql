-- Guard: least-privilege grants for the runtime logins (ARCHITECTURE §5.1; ADR-097, 113, 270).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
-- The installer creates the logins (ADR-266); this only grants. adms_owner owns everything and
-- is never a running service. Nobody but the owner may TRUNCATE, create, alter or drop. Every new
-- table gets its grants in the migration that adds it: nothing is granted by default.

-- The schema: usable by the three runtime logins, by nobody else, and creatable only by its owner.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO adms_api, adms_worker, adms_readonly;

-- Nothing on a table, sequence or function reaches everyone. Functions the owner makes later
-- (the guards' own) aren't executable by everyone either; each is granted where it's needed.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE adms_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Configuration: the API writes it (archived or closed, never deleted); the worker reads it.
GRANT SELECT, INSERT, UPDATE ON "project", "contractor", "user", "device" TO adms_api;
GRANT SELECT ON "project", "contractor", "user", "device" TO adms_worker;

-- Evidence: the API inserts field events at sync and corrects the captured columns (audited).
-- The id and the server's received time never change; the reconciliation columns are the worker's.
GRANT SELECT, INSERT ON "field_event" TO adms_api;
GRANT UPDATE (
  "project_id", "workflow", "kind", "ticket_number", "split_suffix", "monitor_id", "device_id",
  "started_at", "ended_at", "device_utc_offset_minutes", "end_latitude", "end_longitude",
  "load_call"
) ON "field_event" TO adms_api;
GRANT SELECT ON "field_event" TO adms_worker;
GRANT UPDATE ("status", "reconciled_at") ON "field_event" TO adms_worker;

-- Derived: written by the worker only; the API reads them. A transaction is deleted only through
-- regeneration, which copies it to audit first (the transaction-delete guard); never updated.
GRANT SELECT ON "completed_load", "transaction" TO adms_api;
GRANT SELECT, INSERT, UPDATE ON "completed_load" TO adms_worker;
GRANT SELECT, INSERT, DELETE ON "transaction" TO adms_worker;

-- A person's mark: the API locks a load as invoiced; the worker reads the lock.
GRANT SELECT, INSERT ON "invoice_lock" TO adms_api;
GRANT SELECT ON "invoice_lock" TO adms_worker;

-- Audit: read only. Only the capture triggers, running as the owner, insert (ARCHITECTURE §5.3).
GRANT SELECT ON "audit_record" TO adms_api, adms_worker;

-- adms_readonly reads only the viewer views, granted with row-level security (its own guard).
