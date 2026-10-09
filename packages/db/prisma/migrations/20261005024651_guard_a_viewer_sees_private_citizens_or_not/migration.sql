-- Guard: whether a read-only viewer sees private citizens by name (spec/DATA-MODEL.md §2.2, §3
-- "ROEs", §4.4; spec/acceptance/02-people-and-devices.md section I; ARCHITECTURE §5.5; ADR-113,
-- 169, 270, 315, 327, 328 (4), 336; BACKLOG C67 (d)). Written by hand into Prisma's --create-only
-- stub; never edited once applied.
--
-- The setting on the viewer is the migration before this one. Here: who states it, the viewer's
-- question that reads it, and the two tables that hold a private citizen's name, an ROE (its
-- owner) and a drop-off log (the resident, and where their debris came from).

-- 1. A viewer issued before the setting existed sees private citizens by name, as every new one
-- does until the firm says otherwise (ADR-328 (4)). Written as the system actor, so the audit
-- record says who (the owner's login may, as the seed does: ADR-276). One statement, so the
-- actor stated holds for the write.
DO $$
BEGIN
  PERFORM set_config('adms.actor_id', '00000000-0000-7000-8000-000000000001', true),
    set_config('adms.source', 'SYSTEM', true);
  UPDATE "user" SET "sees_private_citizens" = true
    WHERE "role" = 'READ_ONLY_VIEWER' AND "sees_private_citizens" IS NULL;
END;
$$;

-- 2. Every read-only viewer says whether they see private citizens by name, and nobody else
-- does: whoever adds the viewer says which.
ALTER TABLE "user" ADD CONSTRAINT "user_viewer_private_citizens_check" CHECK (
  ("role" = 'READ_ONLY_VIEWER') = ("sees_private_citizens" IS NOT NULL)
);

-- 3. The viewer's fourth question: may the viewer of this request see private citizens by name?
-- Read from their own record, as the other three are (ADR-315): a person who isn't a read-only
-- viewer, an archived one, and a request that states nobody, do not.
CREATE FUNCTION viewer_sees_private_citizens() RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "user" AS viewer
    WHERE viewer."id" = nullif(current_setting('adms.viewer_id', true), '')::uuid
      AND viewer."role" = 'READ_ONLY_VIEWER'
      AND viewer."archived_at" IS NULL
      AND viewer."sees_private_citizens"
  )
$$;
GRANT EXECUTE ON FUNCTION viewer_sees_private_citizens() TO adms_readonly;

-- 4. guard_viewer learns a sixth thing to be told: the columns that name a private citizen.
--   SELECT guard_viewer('roe', 'PROJECT', citizen => ARRAY['owner_name']);
-- They are left out of viewer_<table> and of the read-only login's grant, as hidden columns are,
-- so no viewer reads them from the table. Row-level security can't tell columns apart, so they
-- are shown by a second view, viewer_<table>_citizen (the row's id, its project, those columns),
-- which runs with the owner's rights and holds the viewer's questions itself, behind a security
-- barrier, as viewer_project_setup does: a row of one of the viewer's projects, for a client
-- user or an auditor the firm lets see private citizens. Anyone else reads no row of it. Only a
-- table seen by its own project takes citizen columns. The rest is the function as it was.
DROP FUNCTION guard_viewer(text, text, text, text, text[]);
CREATE FUNCTION guard_viewer(
  table_name text,
  sight text,
  relation text DEFAULT NULL,
  key_column text DEFAULT NULL,
  hidden text[] DEFAULT '{}',
  citizen text[] DEFAULT '{}'
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  target regclass := to_regclass(format('public.%I', table_name));
  seen text;
  shown text;
  named text;
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
  IF cardinality(citizen) > 0 AND sight <> 'PROJECT' THEN
    RAISE EXCEPTION 'guard_viewer: only a table seen by its PROJECT names citizen columns';
  END IF;
  SELECT string_agg(wanted, ', ') INTO unknown
    FROM unnest(hidden || citizen) AS wanted
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
    WHERE attrelid = target AND attnum > 0 AND NOT attisdropped
      AND attname <> ALL (hidden || citizen);

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

  IF cardinality(citizen) > 0 THEN
    SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum) INTO named
      FROM pg_attribute
      WHERE attrelid = target AND attnum > 0 AND NOT attisdropped AND attname = ANY (citizen);
    EXECUTE format(
      'CREATE OR REPLACE VIEW public.%I WITH (security_barrier = true) AS SELECT "id", "project_id", %s FROM %s WHERE %s AND viewer_sees_private_citizens()',
      'viewer_' || table_name || '_citizen', named, target, seen
    );
    EXECUTE format('GRANT SELECT ON public.%I TO adms_readonly', 'viewer_' || table_name || '_citizen');
  END IF;
END;
$$;

-- 5. The two tables that name a private citizen (ADR-328 (4), 336). Each view showed the
-- columns until now, and a view can't lose a column in place, so it goes first; guard_viewer
-- writes it again without them, with the same two policies, and the citizen view beside it. A
-- contractor user still sees neither table (BACKLOG 1.7.1, C18).
DROP VIEW "viewer_roe";
SELECT guard_viewer('roe', 'PROJECT', citizen => ARRAY['owner_name']);
DROP VIEW "viewer_drop_off_log";
SELECT guard_viewer('drop_off_log', 'PROJECT',
  citizen => ARRAY['resident_name', 'origin_address']);
