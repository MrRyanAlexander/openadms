-- Guard: what a contractor user sees of its own tickets (spec/DATA-MODEL.md §2.2, §5, §8;
-- spec/acceptance/02-people-and-devices.md AC-02-66, 78…82; 04-field-capture.md AC-04-31;
-- ARCHITECTURE §5.5; ADR-113, 169, 270, 315, 336, 358, 361; BACKLOG 1.7.3, C18, C59, C62, C65,
-- C66, C70; REQ-014). Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- No model changes. Until now a contractor user read its own contractor's priced lines and
-- nothing else of a ticket. Here: its own tickets, told by the certification (the one place that
-- says whose work a ticket is); a sub's lines without their rate and amount (the user,
-- 2026-10-06); and the three names of setup it needs to read them.

-- 1. guard_viewer learns a seventh thing to be told: the question that makes a row a contractor
-- user's own.
--   SELECT guard_viewer('certification', 'PROJECT', own => 'viewer_is_contractor("prime_id")');
-- A client user and an auditor see the table as before, every row of their projects; a
-- contractor user sees the rows of the projects it is given that the question answers yes to.
-- The question is asked as the viewer: one that looks in another viewed table (a field event's
-- certification) is answered by that table's own policy, so whose work a ticket is stays said in
-- one place. Only a table seen by its own project takes one. A private citizen's columns stay a
-- client user's and an auditor's: the citizen view never asks it. The rest is the function as it
-- was; every rerun of a table's line repeats its question, as it repeats its hidden columns.
DROP FUNCTION guard_viewer(text, text, text, text, text[], text[]);
CREATE FUNCTION guard_viewer(
  table_name text,
  sight text,
  relation text DEFAULT NULL,
  key_column text DEFAULT NULL,
  hidden text[] DEFAULT '{}',
  citizen text[] DEFAULT '{}',
  own text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  target regclass := to_regclass(format('public.%I', table_name));
  whole text;
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
  IF own IS NOT NULL AND sight <> 'PROJECT' THEN
    RAISE EXCEPTION 'guard_viewer: only a table seen by its PROJECT says which rows are a contractor user''s own';
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

  whole := CASE sight
    WHEN 'PROJECT' THEN 'viewer_sees_project("project_id") AND viewer_sees_every_ticket()'
    WHEN 'FIRM' THEN 'viewer_sees_every_ticket()'
    WHEN 'PART_OF' THEN format(
      'EXISTS (SELECT 1 FROM public.%1$I WHERE %1$I."id" = %2$I.%3$I)', relation, table_name, key_column)
    ELSE format(
      'EXISTS (SELECT 1 FROM public.%1$I WHERE %1$I.%3$I = %2$I."id")', relation, table_name, key_column)
  END;
  seen := CASE
    WHEN own IS NULL THEN whole
    ELSE format('viewer_sees_project("project_id") AND (viewer_sees_every_ticket() OR (%s))', own)
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
      'viewer_' || table_name || '_citizen', named, target, whole
    );
    EXECUTE format('GRANT SELECT ON public.%I TO adms_readonly', 'viewer_' || table_name || '_citizen');
  END IF;
END;
$$;

-- 2. Whose work a ticket is: the certification's prime and subs (ADR-108, 169). A contractor
-- user sees a certification that names its contractor, as the prime (so a prime sees its subs'
-- too) or as either tier of sub; never its driver's phone or licence number, which no viewer
-- reads. Its measured boxes and helpers are seen with it (their policies ask for their parent).
SELECT guard_viewer('certification', 'PROJECT',
  hidden => ARRAY['driver_phone', 'driver_licence_number'],
  own => 'viewer_is_contractor("prime_id") OR viewer_is_contractor("first_tier_sub_id") OR viewer_is_contractor("second_tier_sub_id")');

-- 3. Its own place on the project and, for a prime, its subs' (C59), so the contractors a line
-- names can be read by name: the firm-wide contractor is seen through the place that names it,
-- without its contact details, as before.
SELECT guard_viewer('project_contractor', 'PROJECT',
  own => 'viewer_is_contractor("contractor_id") OR viewer_is_contractor("prime_id")');

-- 4. Its own tickets. A field event is its own when the certification it found is; one whose
-- badge found no certification is nobody's yet (fail closed). Its item lines and carried
-- tickets are seen with it. Who recorded it stays a client user's and an auditor's.
SELECT guard_viewer('field_event', 'PROJECT',
  own => 'EXISTS (SELECT 1 FROM public.certification WHERE certification."id" = field_event."certification_id")');

-- What the worker concluded from them: a completed load or haul-out with its disposal event, a
-- property's or a pile's row with its collection event. A flag stays the back office's, a client
-- user's and an auditor's.
SELECT guard_viewer('completed_load', 'PROJECT',
  own => 'EXISTS (SELECT 1 FROM public.field_event WHERE field_event."id" = completed_load."disposal_event_id")');
SELECT guard_viewer('completed_load_collection', 'PROJECT',
  own => 'EXISTS (SELECT 1 FROM public.field_event WHERE field_event."id" = completed_load_collection."collection_event_id")');
SELECT guard_viewer('completed_haul_out', 'PROJECT',
  own => 'EXISTS (SELECT 1 FROM public.field_event WHERE field_event."id" = completed_haul_out."disposal_event_id")');
SELECT guard_viewer('completed_haul_out_collection', 'PROJECT',
  own => 'EXISTS (SELECT 1 FROM public.field_event WHERE field_event."id" = completed_haul_out_collection."collection_event_id")');

-- A scale receipt one of its field events points at, and the photographs' records of its field
-- events, its certifications and those receipts; never where a file is kept. An ROE's, a
-- form's and a quarantined record's photographs stay unseen, as those records do.
SELECT guard_viewer('scale_receipt', 'PROJECT',
  own => 'EXISTS (SELECT 1 FROM public.field_event WHERE field_event."scale_receipt_id" = scale_receipt."id")');
SELECT guard_viewer('photo', 'PROJECT',
  hidden => ARRAY['object_key', 'depth_object_key'],
  own => 'EXISTS (SELECT 1 FROM public.field_event WHERE field_event."id" = photo."field_event_id") OR EXISTS (SELECT 1 FROM public.certification WHERE certification."id" = photo."certification_id") OR EXISTS (SELECT 1 FROM public.scale_receipt WHERE scale_receipt."id" = photo."scale_receipt_id")');

-- 5. A line's money (the user, 2026-10-06, ADR-361). The rate and the amount on a line are the
-- prime's price with the client: a sub's contractor user reads its lines' pay item and quantity
-- and no money. Row-level security can't tell columns apart, so the two columns leave
-- viewer_transaction and the read-only login's grant, and are shown by a second view,
-- viewer_transaction_money (the line's id, its project, its rate and amount), which runs with
-- the owner's rights and holds the viewer's questions itself, behind a security barrier, as a
-- private citizen's columns are (ADR-336): a client user, an auditor, and the contractor user of
-- the line's own prime. Which lines a contractor user sees is as it was (ADR-358).
DROP VIEW "viewer_transaction";
REVOKE ALL ON "transaction" FROM adms_readonly;
CREATE VIEW "viewer_transaction" WITH (security_invoker = true, security_barrier = true) AS
  SELECT "id", "project_id", "completed_load_id", "completed_load_collection_id",
    "completed_haul_out_id", "completed_haul_out_collection_id", "field_event_id", "slot",
    "rule_id", "pay_item_id", "contract_id", "prime_id", "operating_sub_id", "unit", "quantity",
    "reconciliation_run_id", "created_at"
  FROM "transaction";
GRANT SELECT ON "viewer_transaction" TO adms_readonly;
GRANT SELECT (
  "id", "project_id", "completed_load_id", "completed_load_collection_id",
  "completed_haul_out_id", "completed_haul_out_collection_id", "field_event_id", "slot",
  "rule_id", "pay_item_id", "contract_id", "prime_id", "operating_sub_id", "unit", "quantity",
  "reconciliation_run_id", "created_at"
) ON "transaction" TO adms_readonly;

CREATE VIEW "viewer_transaction_money" WITH (security_barrier = true) AS
  SELECT "id", "project_id", "rate", "amount"
  FROM "transaction"
  WHERE viewer_sees_project("project_id")
    AND (viewer_sees_every_ticket() OR viewer_is_contractor("prime_id"));
GRANT SELECT ON "viewer_transaction_money" TO adms_readonly;

-- 6. The names of setup a ticket is read with, and nothing more of setup (ADR-315 stands: a
-- contractor user sees no pay item's settings or rates, no rule, no site's facts, no list): a
-- pay item's code and description, a disposal site's name, and the name of a debris type on the
-- project's forms. Each view runs with the owner's rights and asks only whether the viewer is
-- given the project, so every kind of viewer reads it.
CREATE VIEW "viewer_pay_item_name" WITH (security_barrier = true) AS
  SELECT "id", "project_id", "code", "description"
  FROM "pay_item"
  WHERE viewer_sees_project("project_id");
GRANT SELECT ON "viewer_pay_item_name" TO adms_readonly;

CREATE VIEW "viewer_disposal_site_name" WITH (security_barrier = true) AS
  SELECT "id", "project_id", "name"
  FROM "disposal_site"
  WHERE viewer_sees_project("project_id");
GRANT SELECT ON "viewer_disposal_site_name" TO adms_readonly;

CREATE VIEW "viewer_debris_type_name" WITH (security_barrier = true) AS
  SELECT "form_debris_type"."id", "form"."project_id", "debris_type"."name"
  FROM "form_debris_type"
  JOIN "form" ON "form"."id" = "form_debris_type"."form_id"
  JOIN "debris_type" ON "debris_type"."id" = "form_debris_type"."debris_type_id"
  WHERE viewer_sees_project("form"."project_id");
GRANT SELECT ON "viewer_debris_type_name" TO adms_readonly;
