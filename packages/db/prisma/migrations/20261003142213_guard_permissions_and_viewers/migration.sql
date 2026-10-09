-- Guard: people's permissions, read-only viewers, a phone's revoked key, and row-level security
-- for the setup tables a viewer sees (spec/DATA-MODEL.md §2.2; spec/acceptance/02-people-and-
-- devices.md; ARCHITECTURE §5.1, §5.5, §7.4; ADR-050, 113, 169, 270, 271, 315; BACKLOG C18, C47,
-- C54). Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The models are the migration before this one. Here: the two new tables' guards, the checks
-- Prisma can't declare, who the viewer of a request is (now read from the viewer's own record),
-- and one line per setup table a client user or an auditor sees.

-- 1. The new configuration tables, one line each (ADR-271): the API writes them, the worker reads
-- them, nothing is deleted, every change is audited. Who may do what, and who may see which
-- project, is the security reviewer's to read, as a person's record is (ADR-315). No read-only
-- viewer sees either.
SELECT guard_table('user_permission', 'CONFIGURATION', 'SECURITY');
SELECT guard_table('user_viewer_project', 'CONFIGURATION', 'SECURITY');

-- The system actor is never granted a permission and is never a viewer (ADR-276).
ALTER TABLE "user_permission" ADD CONSTRAINT "user_permission_system_actor_check" CHECK (
  "user_id" <> '00000000-0000-7000-8000-000000000001'
);
ALTER TABLE "user_viewer_project" ADD CONSTRAINT "user_viewer_project_system_actor_check" CHECK (
  "user_id" <> '00000000-0000-7000-8000-000000000001'
);

-- 2. A read-only viewer says what kind it is, and nobody else does; a contractor user names its
-- contractor, and nobody else does (ADR-169, 315).
ALTER TABLE "user" ADD CONSTRAINT "user_viewer_kind_check" CHECK (
  ("role" = 'READ_ONLY_VIEWER') = ("viewer_kind" IS NOT NULL)
);
ALTER TABLE "user" ADD CONSTRAINT "user_viewer_contractor_check" CHECK (
  ("viewer_kind" IS NOT DISTINCT FROM 'CONTRACTOR') = ("contractor_id" IS NOT NULL)
);

-- 3. A phone's key is revoked only once the phone is out of service, never before its removal
-- time (ADR-134; ARCHITECTURE §7.4). Refusing a revoked key is the API's (Phase 2, C47).
ALTER TABLE "device" ADD CONSTRAINT "device_key_revoked_check" CHECK (
  "key_revoked_at" IS NULL
  OR ("out_of_service_at" IS NOT NULL AND "key_revoked_at" >= "out_of_service_at")
);

-- 4. The viewer of a request (ADR-169, 315; C22). The API reads for a viewer as adms_readonly and
-- states who is looking:
--   adms.viewer_id   the viewer's own id
-- What they may see is then read here, from their record and their projects, never taken from the
-- request: a person who isn't a read-only viewer, an archived one, a project taken away, and a
-- request that states nobody, all see nothing. These replace the row-level security guard's three
-- questions (same names, so its policies stand); they read "user" and user_viewer_project, which
-- no viewer may, so they run with the owner's rights and answer only yes or no.
CREATE OR REPLACE FUNCTION viewer_sees_project(project_id uuid) RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "user" AS viewer
    JOIN "user_viewer_project" AS given ON given."user_id" = viewer."id"
    WHERE viewer."id" = nullif(current_setting('adms.viewer_id', true), '')::uuid
      AND viewer."role" = 'READ_ONLY_VIEWER'
      AND viewer."archived_at" IS NULL
      AND given."project_id" = viewer_sees_project.project_id
      AND given."archived_at" IS NULL
  )
$$;

-- A client user or an auditor: the whole of their projects.
CREATE OR REPLACE FUNCTION viewer_sees_every_ticket() RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "user" AS viewer
    WHERE viewer."id" = nullif(current_setting('adms.viewer_id', true), '')::uuid
      AND viewer."role" = 'READ_ONLY_VIEWER'
      AND viewer."archived_at" IS NULL
      AND viewer."viewer_kind" IN ('CLIENT', 'AUDITOR')
  )
$$;

-- A contractor user sees this contractor's rows.
CREATE OR REPLACE FUNCTION viewer_is_contractor(contractor_id uuid) RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "user" AS viewer
    WHERE viewer."id" = nullif(current_setting('adms.viewer_id', true), '')::uuid
      AND viewer."role" = 'READ_ONLY_VIEWER'
      AND viewer."archived_at" IS NULL
      AND viewer."viewer_kind" = 'CONTRACTOR'
      AND viewer."contractor_id" = viewer_is_contractor.contractor_id
  )
$$;

-- 5. One line gives a table its row-level security for viewers (ADR-271's way, for §5.5):
--   SELECT guard_viewer('pay_item', 'PROJECT');
--   SELECT guard_viewer('zone', 'PART_OF', 'map_version', 'map_version_id');
--   SELECT guard_viewer('contractor', 'NAMED_BY', 'project_contractor', 'contractor_id',
--     ARRAY['contact_phone']);
-- It turns row-level security on, lets the API and the worker see every row (their grants limit
-- what they may do), lets the read-only login see only the rows its viewer may, makes the viewer
-- view viewer_<table> (run as the viewer, behind a security barrier), and grants the read-only
-- login the view and exactly the columns it shows. Safe to repeat: rerun it when a model gains a
-- column. What a client user or an auditor sees, by the table's sight:
--   PROJECT   a row of one of their projects (the table's own project_id)
--   PART_OF   a row whose parent they see (relation: the parent; key_column: this table's link)
--   NAMED_BY  a firm-wide row something they see names (relation, and its column naming this row)
--   FIRM      a firm-wide list: every row
-- A contractor user sees none of them (ADR-315). hidden: columns no viewer reads.
CREATE FUNCTION guard_viewer(
  table_name text,
  sight text,
  relation text DEFAULT NULL,
  key_column text DEFAULT NULL,
  hidden text[] DEFAULT '{}'
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  target regclass := to_regclass(format('public.%I', table_name));
  seen text;
  shown text;
  unknown text;
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'guard_viewer: there is no table %', table_name;
  END IF;
  IF sight NOT IN ('PROJECT', 'PART_OF', 'NAMED_BY', 'FIRM') THEN
    RAISE EXCEPTION 'guard_viewer: % is not a sight (PROJECT, PART_OF, NAMED_BY, FIRM)', sight;
  END IF;
  IF (sight IN ('PART_OF', 'NAMED_BY')) <> (relation IS NOT NULL AND key_column IS NOT NULL) THEN
    RAISE EXCEPTION 'guard_viewer: PART_OF and NAMED_BY, and only they, name a relation and a column';
  END IF;
  SELECT string_agg(wanted, ', ') INTO unknown
    FROM unnest(hidden) AS wanted
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = target AND attname = wanted AND attnum > 0 AND NOT attisdropped
    );
  IF unknown IS NOT NULL THEN
    RAISE EXCEPTION 'guard_viewer: % has no column %', table_name, unknown;
  END IF;

  seen := CASE sight
    WHEN 'PROJECT' THEN 'viewer_sees_project("project_id") AND viewer_sees_every_ticket()'
    WHEN 'FIRM' THEN 'viewer_sees_every_ticket()'
    WHEN 'PART_OF' THEN format(
      'EXISTS (SELECT 1 FROM public.%1$I WHERE %1$I."id" = %2$I.%3$I)', relation, table_name, key_column)
    ELSE format(
      'EXISTS (SELECT 1 FROM public.%1$I WHERE %1$I.%3$I = %2$I."id")', relation, table_name, key_column)
  END;
  SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum) INTO shown
    FROM pg_attribute
    WHERE attrelid = target AND attnum > 0 AND NOT attisdropped AND attname <> ALL (hidden);

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', table_name || '_services', target);
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR ALL TO adms_api, adms_worker USING (true) WITH CHECK (true)',
    table_name || '_services', target
  );
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', table_name || '_viewer', target);
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR SELECT TO adms_readonly USING (%s)',
    table_name || '_viewer', target, seen
  );
  EXECUTE format(
    'CREATE OR REPLACE VIEW public.%I WITH (security_invoker = true, security_barrier = true) AS SELECT %s FROM %s',
    'viewer_' || table_name, shown, target
  );
  EXECUTE format('REVOKE ALL ON %s FROM adms_readonly', target);
  EXECUTE format('GRANT SELECT (%s) ON %s TO adms_readonly', shown, target);
  EXECUTE format('GRANT SELECT ON public.%I TO adms_readonly', 'viewer_' || table_name);
END;
$$;

-- 6. What a client user or an auditor sees of a project's setup: the whole of it (ADR-169; C54).
-- A project's own tables.
SELECT guard_viewer('project_kind_of_work', 'PROJECT');
SELECT guard_viewer('project_contractor', 'PROJECT');
SELECT guard_viewer('contract', 'PROJECT');
SELECT guard_viewer('form', 'PROJECT');
SELECT guard_viewer('form_debris_type', 'PART_OF', 'form', 'form_id');
SELECT guard_viewer('form_definition', 'PART_OF', 'form', 'form_id');
SELECT guard_viewer('field_tag', 'PROJECT');
SELECT guard_viewer('pay_item', 'PROJECT');
SELECT guard_viewer('pay_item_rate', 'PROJECT');
SELECT guard_viewer('pay_item_crew_day_step', 'PART_OF', 'pay_item', 'pay_item_id');
SELECT guard_viewer('disposal_site', 'PROJECT');
SELECT guard_viewer('disposal_site_label', 'PART_OF', 'disposal_site', 'site_id');
SELECT guard_viewer('disposal_site_tipping_fee', 'PROJECT');
SELECT guard_viewer('site_area_version', 'PART_OF', 'disposal_site', 'site_id');
-- Where the uploaded file is kept is the firm's own storage, not the project's record.
SELECT guard_viewer('map_version', 'PROJECT', hidden => ARRAY['uploaded_file_key']);
SELECT guard_viewer('zone', 'PART_OF', 'map_version', 'map_version_id');
SELECT guard_viewer('rule', 'PROJECT');
SELECT guard_viewer('rule_criterion', 'PROJECT');
SELECT guard_viewer('rule_criterion_pick', 'PROJECT');
SELECT guard_viewer('rule_action', 'PROJECT');
SELECT guard_viewer('rule_action_item', 'PART_OF', 'rule_action', 'action_id');

-- The project itself, with its client, declaration event, window and settings. The row-level
-- security guard's viewer_project (five columns) stays what every viewer sees, a contractor user
-- included; the settings (the load call limits among them) are for a client user and an auditor
-- only. Row-level security can't tell columns apart, so this one view runs with the owner's
-- rights and holds the viewer's question itself, behind a security barrier; the read-only login
-- is granted the view and none of these columns on the table.
CREATE VIEW "viewer_project_setup" WITH (security_barrier = true) AS
  SELECT "id", "name", "client_id", "declaration_event_id", "program_type_id", "allow_split_loads",
    "time_zone", "active_from", "active_to", "ticket_number_source", "workflows",
    "load_call_low_limit", "load_call_high_limit", "stump_fill_depth_inches",
    "stump_check_root_ball_wider", "stump_check_fill_needs_exposure", "site_circle_meters",
    "time_clock_enabled", "created_at", "closed_at"
  FROM "project"
  WHERE viewer_sees_project("id") AND viewer_sees_every_ticket();
GRANT SELECT ON "viewer_project_setup" TO adms_readonly;

-- The firm-wide records a project names: its client, its declaration event, the contractors on
-- it. No viewer reads a client's or a contractor's contact name, email or phone (ADR-169 keeps
-- personal phone numbers from them; ADR-315), nor the firm's notes on a client.
SELECT guard_viewer('client', 'NAMED_BY', 'viewer_project_setup', 'client_id',
  ARRAY['contact_name', 'contact_email', 'contact_phone', 'notes']);
SELECT guard_viewer('declaration_event', 'NAMED_BY', 'viewer_project_setup', 'declaration_event_id');
SELECT guard_viewer('contractor', 'NAMED_BY', 'project_contractor', 'contractor_id',
  ARRAY['contact_name', 'contact_email', 'contact_phone']);

-- The firm's lists: the names setup picks from. None holds a person, a rate or a ticket.
SELECT guard_viewer('program_type', 'FIRM');
SELECT guard_viewer('declaration_reference_type', 'FIRM');
SELECT guard_viewer('debris_type', 'FIRM');
SELECT guard_viewer('reduction_method', 'FIRM');
SELECT guard_viewer('payable_type', 'FIRM');
SELECT guard_viewer('kind_of_work', 'FIRM');
SELECT guard_viewer('item_name', 'FIRM');
SELECT guard_viewer('vehicle_type', 'FIRM');
SELECT guard_viewer('vehicle_feature', 'FIRM');
SELECT guard_viewer('crew_type', 'FIRM');
SELECT guard_viewer('site_type', 'FIRM');
SELECT guard_viewer('site_label', 'FIRM');
SELECT guard_viewer('incident_type', 'FIRM');
SELECT guard_viewer('incident_sub_type', 'FIRM');
SELECT guard_viewer('reason', 'FIRM');
SELECT guard_viewer('survey_work_type', 'FIRM');
SELECT guard_viewer('clock_activity', 'FIRM');
