-- Guard: audit_record is append-only, absolutely (ARCHITECTURE §5.3; invariant 2; ADR-085, 097,
-- 113, 270). Written by hand into Prisma's --create-only stub; never edited once applied.
-- The runtime logins may only SELECT it (the grants guard); only the capture triggers insert.
-- These triggers refuse any update, delete or truncate by anyone, the owner included.

CREATE FUNCTION refuse_audit_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_record is append-only: % is refused', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "audit_record_refuse_change" BEFORE UPDATE OR DELETE ON "audit_record"
  FOR EACH ROW EXECUTE FUNCTION refuse_audit_change();
CREATE TRIGGER "audit_record_refuse_truncate" BEFORE TRUNCATE ON "audit_record"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_audit_change();
