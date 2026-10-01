-- Guard: nothing is hard-deleted (ARCHITECTURE §5.2; invariant 1; ADR-097, 113, 270).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
-- No runtime login holds DELETE on these tables (the grants guard); these triggers refuse the
-- delete anyway, for every role, the owner included. Archive, close and void are updates.
-- "transaction" is left out of the row refusal: regeneration deletes its rows through their own
-- guard, which copies each to audit first. audit_record has its own guard too.

CREATE FUNCTION refuse_delete() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'Open ADMS never deletes a % row: archive, close or void it instead', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "project_refuse_delete" BEFORE DELETE ON "project"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "contractor_refuse_delete" BEFORE DELETE ON "contractor"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "user_refuse_delete" BEFORE DELETE ON "user"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "device_refuse_delete" BEFORE DELETE ON "device"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "field_event_refuse_delete" BEFORE DELETE ON "field_event"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "completed_load_refuse_delete" BEFORE DELETE ON "completed_load"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "invoice_lock_refuse_delete" BEFORE DELETE ON "invoice_lock"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();

-- TRUNCATE skips row triggers, so it is refused per statement, "transaction" included (a
-- truncate would skip the copy to audit).
CREATE TRIGGER "project_refuse_truncate" BEFORE TRUNCATE ON "project"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "contractor_refuse_truncate" BEFORE TRUNCATE ON "contractor"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "user_refuse_truncate" BEFORE TRUNCATE ON "user"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "device_refuse_truncate" BEFORE TRUNCATE ON "device"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "field_event_refuse_truncate" BEFORE TRUNCATE ON "field_event"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "completed_load_refuse_truncate" BEFORE TRUNCATE ON "completed_load"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "transaction_refuse_truncate" BEFORE TRUNCATE ON "transaction"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "invoice_lock_refuse_truncate" BEFORE TRUNCATE ON "invoice_lock"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
