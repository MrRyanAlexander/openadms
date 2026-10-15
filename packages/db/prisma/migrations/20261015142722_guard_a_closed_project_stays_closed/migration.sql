-- Guard: a closed project stays closed (spec/DATA-MODEL.md §3; ARCHITECTURE §5; ADR-097, 113,
-- 315, 526, 529 (b), (d); invariant 1; BACKLOG 2.8.5; REQ-213). Written by hand into Prisma's
-- --create-only stub; never edited once applied.
--
-- The user (ADR-529): "A closed project … Nothing else will be done to it ever. Its records are
-- an archive for history at that point." Here:
--   1. what a viewer sees of a form, made again without the column the migration before dropped;
--   2. a closed project's own row changes no more, but for an admin's reopening, with a reason;
--   3. nothing in a closed project is written, changed or taken away: every table that holds its
--      records, and every table of the records under them (found through their parent), whoever
--      writes, the worker included. What is not a record of the project is left out: a held
--      record and a file set aside (they wait for a person, ADR-526), a photograph kept with a
--      held record, a viewer's grant to the project (an auditor is given one later).

-- 1. (ADR-169, 315.)
SELECT guard_viewer('form', 'PROJECT');

-- 2. Closing is a change like any other (the close's time, audited); after it the row is read
-- only, but for putting `closed_at` back to empty and nothing else, which states why.
CREATE FUNCTION project_closed_stays_closed() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD."closed_at" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."closed_at" IS NULL
    AND (to_jsonb(NEW) - 'closed_at') = (to_jsonb(OLD) - 'closed_at')
    AND coalesce(current_setting('adms.reason', true), '') <> '' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A closed project changes no more; it is reopened, with a reason, and nothing else'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'project_closed';
END;
$$;
CREATE TRIGGER "project_closed_stays_closed" BEFORE UPDATE ON "project"
  FOR EACH ROW EXECUTE FUNCTION project_closed_stays_closed();

-- 3. The row's project: its own `project_id`, or, for a record under another, its parent's,
-- named by the trigger's two arguments (the parent table and the column that points at it). An
-- update is asked of the row before and after, so nothing moves into or out of a closed project.
CREATE FUNCTION project_open_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  asked jsonb;
  project uuid;
BEGIN
  FOREACH asked IN ARRAY CASE TG_OP
    WHEN 'INSERT' THEN ARRAY[to_jsonb(NEW)]
    WHEN 'UPDATE' THEN ARRAY[to_jsonb(NEW), to_jsonb(OLD)]
    ELSE ARRAY[to_jsonb(OLD)]
  END LOOP
    -- A photograph kept with a held record waits for a person, as the record does.
    IF TG_TABLE_NAME = 'photo' AND asked ->> 'held_record_id' IS NOT NULL THEN
      CONTINUE;
    END IF;
    IF TG_NARGS = 0 THEN
      project := (asked ->> 'project_id')::uuid;
    ELSE
      EXECUTE format('SELECT "project_id" FROM public.%I WHERE "id" = $1', TG_ARGV[0])
        INTO project USING (asked ->> TG_ARGV[1])::uuid;
    END IF;
    IF project IS NOT NULL
      AND EXISTS (SELECT 1 FROM "project" WHERE "id" = project AND "closed_at" IS NOT NULL) THEN
      RAISE EXCEPTION 'The project is closed: nothing in it is written, changed or taken away'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'project_closed';
    END IF;
  END LOOP;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DO $$
DECLARE
  scoped text;
  child text[];
BEGIN
  FOREACH scoped IN ARRAY ARRAY[
    'assignment', 'assignment_pay_item', 'certification', 'completed_haul_out',
    'completed_haul_out_collection', 'completed_load', 'completed_load_collection', 'contract',
    'control_range', 'disposal_site', 'disposal_site_tipping_fee', 'drop_off_log', 'field_event',
    'field_tag', 'flag', 'flag_acceptance', 'form', 'incident', 'invoice_batch', 'invoice_lock',
    'map_version', 'number_block', 'pay_item', 'pay_item_rate', 'photo', 'project_contractor',
    'project_kind_of_work', 'project_number_series', 'qc_mark', 'quarantined_record',
    'reconciliation_job', 'reconciliation_job_ticket', 'reconciliation_run', 'roe',
    'roe_scope_item', 'rule', 'rule_action', 'rule_criterion', 'rule_criterion_pick',
    'scale_receipt', 'setup_manifest', 'survey', 'ticket_unvoid', 'ticket_void', 'transaction'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION project_open_guard()',
      scoped || '_project_open', scoped);
  END LOOP;
  FOREACH child SLICE 1 IN ARRAY ARRAY[
    ['carried_ticket', 'field_event', 'field_event_id'],
    ['certification_box', 'certification', 'certification_id'],
    ['certification_helper', 'certification', 'certification_id'],
    ['disposal_site_label', 'disposal_site', 'site_id'],
    ['field_event_item', 'field_event', 'field_event_id'],
    ['form_debris_type', 'form', 'form_id'],
    ['form_definition', 'form', 'form_id'],
    ['pay_item_crew_day_step', 'pay_item', 'pay_item_id'],
    ['reconciliation_decision', 'reconciliation_run', 'reconciliation_run_id'],
    ['rule_action_item', 'rule_action', 'action_id'],
    ['site_area_version', 'disposal_site', 'site_id'],
    ['zone', 'map_version', 'map_version_id']
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION project_open_guard(%L, %L)',
      child[1] || '_project_open', child[1], child[2], child[3]);
  END LOOP;
END;
$$;
