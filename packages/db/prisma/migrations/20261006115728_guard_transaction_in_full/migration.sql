-- Guard: a transaction in full (spec/DATA-MODEL.md §5, §6, §8;
-- spec/acceptance/07-pricing-ledger-audit.md AC-07-85…90, 96, 97; ARCHITECTURE §5.1, §5.3, §5.5;
-- ADR-057, 081, 085, 090, 113, 118, 169, 212, 239, 270, 295, 315, 358; invariants 2, 4, 17, 21;
-- BACKLOG 1.7.1, C16, C17, C18; REQ-106g, 130, 133). Written by hand into Prisma's --create-only
-- stub; never edited once applied.
--
-- The columns are the migration before this one, and so is everything a line is held to by a
-- key: each thing it names is its own project's (two-column foreign keys), the property or pile
-- it prices is a row of its own load or haul-out, its prime is one of its project's primes, its
-- operating sub is placed on the project under that prime, and a # is once per property, pile or
-- unit rate ticket (unique keys). "transaction" keeps its own guards (the grants and the
-- delete's copy to audit, ADR-270): guard_table doesn't take it. Here: the checks Prisma can't
-- declare, the lock followed through all three kinds of ticket, and what a viewer sees.

-- 1. A line is on exactly one kind of ticket: a completed load with the property it prices, a
-- completed haul-out with the pile it prices, or a unit rate ticket's field event (ADR-295).
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_ticket_check" CHECK ((
  CASE
    WHEN "completed_load_id" IS NOT NULL THEN
      "completed_load_collection_id" IS NOT NULL
      AND num_nonnulls("completed_haul_out_id", "completed_haul_out_collection_id",
        "field_event_id") = 0
    WHEN "completed_haul_out_id" IS NOT NULL THEN
      "completed_haul_out_collection_id" IS NOT NULL
      AND num_nonnulls("completed_load_collection_id", "field_event_id") = 0
    ELSE
      "field_event_id" IS NOT NULL
      AND num_nonnulls("completed_load_collection_id", "completed_haul_out_collection_id") = 0
  END
) IS TRUE);

-- 2. Its # is 1 or more, as a rule action's is, and nothing on it is below nought. The amount is
-- the worker's own figure (packages/domain rounds it to the cent): the database doesn't work it
-- out again (ARCHITECTURE §5.6).
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_figures_check" CHECK ((
  "slot" >= 1 AND "quantity" >= 0 AND "rate" >= 0 AND "amount" >= 0
) IS TRUE);

-- 3. An invoice lock is on exactly one ticket: a completed load, a completed haul-out or a unit
-- rate ticket's field event (spec/DATA-MODEL.md §6). Its unlock columns and its batch are task
-- 1.8.2's.
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_target_check" CHECK (
  num_nonnulls("completed_load_id", "completed_haul_out_id", "field_event_id") = 1
);

-- 4. The lock, followed through all three kinds of ticket (ADR-057, 090; C17). A line of a
-- ticket locked as invoiced is neither removed nor written, by anyone: the removal's guard, as
-- before, now asks about the line's own ticket, whichever kind it is; and a line can't be added
-- to a locked ticket either (it runs as whoever writes: the worker reads invoice_lock). The worker
-- leaves locked tickets alone; this holds it to that.
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
    WHERE "completed_load_id" = OLD."completed_load_id"
      OR "completed_haul_out_id" = OLD."completed_haul_out_id"
      OR "field_event_id" = OLD."field_event_id"
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

CREATE FUNCTION transaction_refuse_on_locked_ticket() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "invoice_lock"
    WHERE "completed_load_id" = NEW."completed_load_id"
      OR "completed_haul_out_id" = NEW."completed_haul_out_id"
      OR "field_event_id" = NEW."field_event_id"
  ) THEN
    RAISE EXCEPTION 'A transaction can''t be written: its ticket is locked as invoiced. Unlock it first'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "transaction_refuse_on_locked_ticket" BEFORE INSERT ON "transaction"
  FOR EACH ROW EXECUTE FUNCTION transaction_refuse_on_locked_ticket();

-- 5. What a viewer sees (ADR-169, 315; C18). A line carries its own project now, so its policy
-- asks about that, and the question that looked the project up through the completed load goes.
-- A client user and an auditor see every line of their projects. A contractor user sees the
-- lines of its own contractor's work in the projects it is given: a prime's at its rate, its
-- subs' among them, and a sub's the lines it did the work of; never another prime's.
DROP POLICY "transaction_viewer" ON "transaction";
CREATE POLICY "transaction_viewer" ON "transaction" FOR SELECT TO adms_readonly
  USING (
    viewer_sees_project("project_id")
    AND (
      viewer_sees_every_ticket()
      OR viewer_is_contractor("prime_id")
      OR viewer_is_contractor("operating_sub_id")
    )
  );
DROP FUNCTION viewer_sees_load_project(uuid);

-- The viewer's view and grant, written again with every column a line holds now.
DROP VIEW "viewer_transaction";
REVOKE ALL ON "transaction" FROM adms_readonly;
CREATE VIEW "viewer_transaction" WITH (security_invoker = true, security_barrier = true) AS
  SELECT "id", "project_id", "completed_load_id", "completed_load_collection_id",
    "completed_haul_out_id", "completed_haul_out_collection_id", "field_event_id", "slot",
    "rule_id", "pay_item_id", "contract_id", "prime_id", "operating_sub_id", "unit", "quantity",
    "rate", "amount", "reconciliation_run_id", "created_at"
  FROM "transaction";
GRANT SELECT ON "viewer_transaction" TO adms_readonly;
GRANT SELECT (
  "id", "project_id", "completed_load_id", "completed_load_collection_id",
  "completed_haul_out_id", "completed_haul_out_collection_id", "field_event_id", "slot",
  "rule_id", "pay_item_id", "contract_id", "prime_id", "operating_sub_id", "unit", "quantity",
  "rate", "amount", "reconciliation_run_id", "created_at"
) ON "transaction" TO adms_readonly;
