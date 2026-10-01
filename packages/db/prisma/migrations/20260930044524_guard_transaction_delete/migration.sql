-- Guard: a transaction is deleted only by regeneration, copied in full to audit first, and never
-- while its load is locked as invoiced (ARCHITECTURE §5.3; invariant 2; ADR-085, 090, 113, 270).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
-- Only the worker holds DELETE on "transaction" (the grants guard). The copy needs the delete's
-- actor like any other write (the audit capture guard), so it can't be skipped or left unsigned.
-- It runs as the owner, as the runtime logins may only SELECT audit_record.

CREATE FUNCTION transaction_delete_to_audit() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  prior_value jsonb := to_jsonb(OLD);
BEGIN
  IF EXISTS (SELECT 1 FROM "invoice_lock" WHERE "completed_load_id" = OLD."completed_load_id") THEN
    RAISE EXCEPTION 'Transaction % can''t be removed: its load is locked as invoiced. Unlock it first', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  PERFORM audit_write(
    TG_TABLE_NAME, OLD."id"::text, 'DELETE', prior_value, NULL,
    ARRAY(SELECT jsonb_object_keys(prior_value) ORDER BY 1), 'BILLING'
  );
  RETURN OLD;
END;
$$;

CREATE TRIGGER "transaction_delete_to_audit" BEFORE DELETE ON "transaction"
  FOR EACH ROW EXECUTE FUNCTION transaction_delete_to_audit();
