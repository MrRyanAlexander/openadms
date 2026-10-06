-- Guard: people's marks (spec/DATA-MODEL.md §6, §8, §9; spec/acceptance/08-review-and-corrections.md
-- AC-08-09, 33, 48, 49, 53, 55…59; 09-invoice-deliver-closeout.md AC-09-01, 07, 09, 10, 17;
-- 03-certification.md AC-03-38; 04-field-capture.md AC-04-90; ARCHITECTURE §5.1…§5.5; ADR-057,
-- 061, 090, 107, 113, 121, 166, 168, 169, 228, 245, 270, 271, 315, 358, 361, 363; invariants 1, 3,
-- 4, 5; BACKLOG 1.8.2, C16, C17, C19, C75, C76, C77; REQ-105h, 105m, 107). Written by hand into
-- Prisma's --create-only stub; never edited once applied.
--
-- The tables and columns are the migration before this one, and so is everything a mark is held
-- to by a key: what it marks is its own project's (two-column foreign keys), a field event it
-- marks is a unit rate ticket's (the mark repeats the kind, held to the field event's own), a
-- lock's batch is its own project's, a record has one QC mark and a flag one acceptance (unique
-- keys), a batch's name is used once on its project. Here: who writes them, the checks Prisma
-- can't declare, what stays as written, what is in force once, the lock's two guards on a
-- transaction asking only about locks in force, and what a viewer sees.

-- 1. A mark is a person's, written by the API as its own record: it inserts and updates, the
-- worker reads, nobody deletes, every write audited (ADR-245; invariants 1, 3). The invoice lock
-- was guarded by hand before the helper existed and could only be added; it takes the same line
-- now, so an unlock can be written on its row (C17). A QC mark is a mark on a record; a lock, a
-- batch and a void say what is billed; an acceptance sits with its flag.
SELECT guard_table('qc_mark', 'MARK', 'RECORDS');
SELECT guard_table('invoice_batch', 'MARK', 'BILLING');
SELECT guard_table('invoice_lock', 'MARK', 'BILLING');
SELECT guard_table('flag_acceptance', 'MARK', 'OPERATIONS');
SELECT guard_table('ticket_void', 'MARK', 'BILLING');

-- 2. A QC mark is on exactly one record (ADR-107, 168): a completed load, a completed haul-out, a
-- unit rate ticket's field event, a certification, an ROE, a survey, an incident or a drop-off
-- log. A field event comes with its kind, and the kind is UNIT_RATE: a load's or a haul-out's
-- single field event takes no mark. Only a person sets one, never the system actor.
ALTER TABLE "qc_mark" ADD CONSTRAINT "qc_mark_target_check" CHECK ((
  num_nonnulls("completed_load_id", "completed_haul_out_id", "field_event_id",
    "certification_id", "roe_id", "survey_id", "incident_id", "drop_off_log_id") = 1
  AND num_nonnulls("field_event_id", "field_event_kind") IN (0, 2)
  AND ("field_event_kind" IS NULL OR "field_event_kind" = 'UNIT_RATE')
) IS TRUE);
ALTER TABLE "qc_mark" ADD CONSTRAINT "qc_mark_set_by_check" CHECK ((
  "set_by_id" <> '00000000-0000-7000-8000-000000000001'::uuid
  AND ("note" IS NULL OR btrim("note") <> '')
) IS TRUE);
-- A change of status is the same mark changed; what it marks never changes.
CREATE TRIGGER "qc_mark_refuse_target_edit" BEFORE UPDATE OF "id", "project_id",
  "completed_load_id", "completed_haul_out_id", "field_event_id", "field_event_kind",
  "certification_id", "roe_id", "survey_id", "incident_id", "drop_off_log_id" ON "qc_mark"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();

-- 3. An invoice batch has a name, and whoever made it is a person (ADR-228).
ALTER TABLE "invoice_batch" ADD CONSTRAINT "invoice_batch_name_check" CHECK ((
  btrim("name") <> ''
  AND "created_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid
) IS TRUE);

-- 4. An invoice lock is on exactly one ticket, as before; its field event now comes with its
-- kind, UNIT_RATE (C16). The unlock is who and when together, a note only with them; a person
-- locks and unlocks, never the system actor.
ALTER TABLE "invoice_lock" DROP CONSTRAINT "invoice_lock_target_check";
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_target_check" CHECK ((
  num_nonnulls("completed_load_id", "completed_haul_out_id", "field_event_id") = 1
  AND num_nonnulls("field_event_id", "field_event_kind") IN (0, 2)
  AND ("field_event_kind" IS NULL OR "field_event_kind" = 'UNIT_RATE')
) IS TRUE);
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_unlock_check" CHECK ((
  num_nonnulls("unlocked_by_id", "unlocked_at") IN (0, 2)
  AND ("unlock_note" IS NULL OR ("unlocked_at" IS NOT NULL AND btrim("unlock_note") <> ''))
  AND "locked_by_id" <> '00000000-0000-7000-8000-000000000001'::uuid
  AND "unlocked_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid
) IS TRUE);
-- A ticket has one lock in force at most: locked once among the locks not unlocked, where the
-- unique keys this replaces held it among all of them (spec/DATA-MODEL.md §6, "unique among live
-- locks"). Exclusions on equality, as the live completed records are held (ADR-340).
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_load_locked_once"
  EXCLUDE USING btree ("completed_load_id" WITH =) WHERE ("unlocked_at" IS NULL);
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_haul_out_locked_once"
  EXCLUDE USING btree ("completed_haul_out_id" WITH =) WHERE ("unlocked_at" IS NULL);
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_unit_rate_ticket_locked_once"
  EXCLUDE USING btree ("field_event_id" WITH =) WHERE ("unlocked_at" IS NULL);
-- What was locked, by whom and when never changes; and once unlocked the row is history:
-- locking again is a new row (C17).
CREATE TRIGGER "invoice_lock_refuse_lock_edit" BEFORE UPDATE OF "id", "project_id",
  "completed_load_id", "completed_haul_out_id", "field_event_id", "field_event_kind",
  "locked_by_id", "locked_at" ON "invoice_lock"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();
CREATE TRIGGER "invoice_lock_refuse_edit_once_unlocked" BEFORE UPDATE ON "invoice_lock"
  FOR EACH ROW WHEN (OLD."unlocked_at" IS NOT NULL) EXECUTE FUNCTION refuse_edit();

-- 5. The lock's two guards on a transaction ask only about a lock in force (ADR-057, 090; C16,
-- C17): an unlocked ticket gives up its lines and takes new ones again, and the worker's next
-- run regenerates it. The functions as they were, with that one condition.
CREATE OR REPLACE FUNCTION transaction_delete_to_audit() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  prior_value jsonb := to_jsonb(OLD);
BEGIN
  IF EXISTS (
    SELECT 1 FROM "invoice_lock"
    WHERE "unlocked_at" IS NULL
      AND ("completed_load_id" = OLD."completed_load_id"
        OR "completed_haul_out_id" = OLD."completed_haul_out_id"
        OR "field_event_id" = OLD."field_event_id")
  ) THEN
    RAISE EXCEPTION 'Transaction % can''t be removed: its ticket is locked as invoiced. Unlock it first', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  PERFORM audit_write(
    TG_TABLE_NAME, OLD."id"::text, 'DELETE', prior_value, NULL,
    ARRAY(SELECT jsonb_object_keys(prior_value) ORDER BY 1), 'BILLING'
  );
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION transaction_refuse_on_locked_ticket() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "invoice_lock"
    WHERE "unlocked_at" IS NULL
      AND ("completed_load_id" = NEW."completed_load_id"
        OR "completed_haul_out_id" = NEW."completed_haul_out_id"
        OR "field_event_id" = NEW."field_event_id")
  ) THEN
    RAISE EXCEPTION 'A transaction can''t be written: its ticket is locked as invoiced. Unlock it first'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 6. A flag's acceptance is a person's (ADR-166); the flag it accepts, who accepted it and when
-- never change. That a flag is accepted once is the migration before this one's unique key.
ALTER TABLE "flag_acceptance" ADD CONSTRAINT "flag_acceptance_accepted_by_check" CHECK ((
  "accepted_by_id" <> '00000000-0000-7000-8000-000000000001'::uuid
  AND ("note" IS NULL OR btrim("note") <> '')
) IS TRUE);
CREATE TRIGGER "flag_acceptance_refuse_flag_edit" BEFORE UPDATE OF "id", "project_id", "flag_id",
  "accepted_by_id", "accepted_at" ON "flag_acceptance"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();

-- 7. A person's void names its ticket (C19). The unvoid is who and when together, a note only
-- with them; a person voids and unvoids, never the system actor (a rule's void is the worker's
-- own and has no row here).
ALTER TABLE "ticket_void" ADD CONSTRAINT "ticket_void_ticket_check" CHECK ((
  btrim("ticket_number") <> ''
  AND ("note" IS NULL OR btrim("note") <> '')
  AND "voided_by_id" <> '00000000-0000-7000-8000-000000000001'::uuid
) IS TRUE);
ALTER TABLE "ticket_void" ADD CONSTRAINT "ticket_void_lift_check" CHECK ((
  num_nonnulls("lifted_by_id", "lifted_at") IN (0, 2)
  AND ("lift_note" IS NULL OR ("lifted_at" IS NOT NULL AND btrim("lift_note") <> ''))
  AND "lifted_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid
) IS TRUE);
-- A ticket has one void in force at most; voiding it again after an unvoid is a new row.
ALTER TABLE "ticket_void" ADD CONSTRAINT "ticket_void_voided_once"
  EXCLUDE USING btree ("project_id" WITH =, "workflow" WITH =, "ticket_number" WITH =)
  WHERE ("lifted_at" IS NULL);
-- Which ticket was voided, by whom and when never changes; once lifted the row is history.
CREATE TRIGGER "ticket_void_refuse_void_edit" BEFORE UPDATE OF "id", "project_id", "workflow",
  "ticket_number", "voided_by_id", "voided_at" ON "ticket_void"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();
CREATE TRIGGER "ticket_void_refuse_edit_once_lifted" BEFORE UPDATE ON "ticket_void"
  FOR EACH ROW WHEN (OLD."lifted_at" IS NOT NULL) EXECUTE FUNCTION refuse_edit();

-- 8. What a viewer sees (ADR-169, 315, 361; C59, C76). A client user and an auditor see every
-- mark on their projects' records: the QC status, a flag's acceptance, a void and its reason, a
-- lock and its batch. A contractor user sees that its own tickets are locked as invoiced and in
-- which batch, since it pulls its report by the batch's name (ADR-228): a lock on a completed
-- record or a unit rate ticket it sees, and a batch that holds one of those. It sees no QC mark,
-- no acceptance (it sees no flag) and no void. An unlock's note is the back office's and no
-- viewer reads it.
SELECT guard_viewer('qc_mark', 'PROJECT');
SELECT guard_viewer('invoice_lock', 'PROJECT',
  hidden => ARRAY['unlock_note'],
  own => 'EXISTS (SELECT 1 FROM public.completed_load WHERE completed_load."id" = invoice_lock."completed_load_id") OR EXISTS (SELECT 1 FROM public.completed_haul_out WHERE completed_haul_out."id" = invoice_lock."completed_haul_out_id") OR EXISTS (SELECT 1 FROM public.field_event WHERE field_event."id" = invoice_lock."field_event_id")');
SELECT guard_viewer('invoice_batch', 'PROJECT',
  own => 'EXISTS (SELECT 1 FROM public.invoice_lock WHERE invoice_lock."invoice_batch_id" = invoice_batch."id")');
SELECT guard_viewer('flag_acceptance', 'PROJECT');
SELECT guard_viewer('ticket_void', 'PROJECT');
