-- Guard: row-level security for read-only viewers (ARCHITECTURE §5.1, §5.5; ADR-050, 097, 113,
-- 169, 270). Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- Clients, contractors and auditors see only their own projects; a contractor only its own
-- tickets and transactions. The API enforces it; this enforces it again. Viewers never hold a
-- database login: the API reads for them as adms_readonly, stating each request's viewer first:
--   adms.viewer_project_ids    the viewer's projects, comma-separated ids
--   adms.viewer_contractor_id  the viewer's contractor's id, or 'none' for a client user or an
--                              auditor (who see the whole project)
-- Unstated, a viewer sees nothing: the API must say who is looking.
-- PROVISIONAL with the schema (ADR-268): a field event and a completed load carry no contractor
-- yet, so a contractor viewer sees none of them until spec/DATA-MODEL.md adds it; a prime's view
-- of its subs' transactions comes with the operating sub. Personal phone and licence numbers
-- (clients and auditors never see them) are left out of the views when those columns exist.

-- The viewer stated for this request. STABLE: they read settings only, never a table.
CREATE FUNCTION viewer_sees_project(project_id uuid) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT nullif(current_setting('adms.viewer_contractor_id', true), '') IS NOT NULL
    AND project_id = ANY (string_to_array(nullif(current_setting('adms.viewer_project_ids', true), ''), ',')::uuid[])
$$;

-- A client user or an auditor: every ticket in their projects.
CREATE FUNCTION viewer_sees_every_ticket() RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT current_setting('adms.viewer_contractor_id', true) = 'none'
$$;

-- A contractor viewer sees this contractor's rows.
CREATE FUNCTION viewer_is_contractor(contractor_id uuid) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT current_setting('adms.viewer_contractor_id', true) = contractor_id::text
$$;

GRANT EXECUTE ON FUNCTION viewer_sees_project(uuid), viewer_sees_every_ticket(),
  viewer_is_contractor(uuid) TO adms_readonly;

-- Row-level security on the project-scoped tables. The API and the worker see every row (their
-- grants limit what they may do); the owner, running migrations, isn't subject to it.
ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "field_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "completed_load" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transaction" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_services" ON "project" FOR ALL TO adms_api, adms_worker
  USING (true) WITH CHECK (true);
CREATE POLICY "field_event_services" ON "field_event" FOR ALL TO adms_api, adms_worker
  USING (true) WITH CHECK (true);
CREATE POLICY "completed_load_services" ON "completed_load" FOR ALL TO adms_api, adms_worker
  USING (true) WITH CHECK (true);
CREATE POLICY "transaction_services" ON "transaction" FOR ALL TO adms_api, adms_worker
  USING (true) WITH CHECK (true);

CREATE POLICY "project_viewer" ON "project" FOR SELECT TO adms_readonly
  USING (viewer_sees_project("id"));
CREATE POLICY "field_event_viewer" ON "field_event" FOR SELECT TO adms_readonly
  USING (viewer_sees_project("project_id") AND viewer_sees_every_ticket());
CREATE POLICY "completed_load_viewer" ON "completed_load" FOR SELECT TO adms_readonly
  USING (viewer_sees_project("project_id") AND viewer_sees_every_ticket());
CREATE POLICY "transaction_viewer" ON "transaction" FOR SELECT TO adms_readonly
  USING (
    EXISTS (
      SELECT 1 FROM "completed_load"
      WHERE "completed_load"."id" = "transaction"."completed_load_id"
        AND viewer_sees_project("completed_load"."project_id")
    )
    AND (viewer_sees_every_ticket() OR viewer_is_contractor("prime_id"))
  );

-- The viewer views: run as the viewer (security_invoker), so the policies above apply to them.
-- adms_readonly may read only the columns they show, and nothing else in the database.
CREATE VIEW "viewer_project" WITH (security_invoker = true, security_barrier = true) AS
  SELECT "id", "name", "time_zone", "created_at", "closed_at" FROM "project";

CREATE VIEW "viewer_field_event" WITH (security_invoker = true, security_barrier = true) AS
  SELECT "id", "project_id", "workflow", "kind", "ticket_number", "split_suffix", "monitor_id",
    "device_id", "started_at", "ended_at", "device_utc_offset_minutes", "received_at",
    "end_latitude", "end_longitude", "load_call", "status", "reconciled_at"
  FROM "field_event";

CREATE VIEW "viewer_completed_load" WITH (security_invoker = true, security_barrier = true) AS
  SELECT "id", "project_id", "ticket_number", "collection_event_id", "disposal_event_id",
    "created_at", "updated_at"
  FROM "completed_load";

CREATE VIEW "viewer_transaction" WITH (security_invoker = true, security_barrier = true) AS
  SELECT "id", "completed_load_id", "slot", "quantity", "rate", "amount", "prime_id", "created_at"
  FROM "transaction";

GRANT SELECT ON "viewer_project", "viewer_field_event", "viewer_completed_load",
  "viewer_transaction" TO adms_readonly;
GRANT SELECT ("id", "name", "time_zone", "created_at", "closed_at") ON "project" TO adms_readonly;
GRANT SELECT (
  "id", "project_id", "workflow", "kind", "ticket_number", "split_suffix", "monitor_id",
  "device_id", "started_at", "ended_at", "device_utc_offset_minutes", "received_at",
  "end_latitude", "end_longitude", "load_call", "status", "reconciled_at"
) ON "field_event" TO adms_readonly;
GRANT SELECT (
  "id", "project_id", "ticket_number", "collection_event_id", "disposal_event_id", "created_at",
  "updated_at"
) ON "completed_load" TO adms_readonly;
GRANT SELECT (
  "id", "completed_load_id", "slot", "quantity", "rate", "amount", "prime_id", "created_at"
) ON "transaction" TO adms_readonly;
