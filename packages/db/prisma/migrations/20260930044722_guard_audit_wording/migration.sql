-- Guard fix: the audit guard's refusals no longer say "transaction" for a database transaction
-- ("transaction" means only the ledger line, spec/CONVENTIONS.md §3; ADR-270). On the
-- "transaction" table the old wording read as if a ledger line were missing its actor.
-- Written by hand into Prisma's --create-only stub; never edited once applied.
-- Same functions, same behaviour; only the messages change.

CREATE OR REPLACE FUNCTION audit_actor(table_name text) RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor text := nullif(current_setting('adms.actor_id', true), '');
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'A write to % needs its actor: state adms.actor_id before writing', table_name
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN actor::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION audit_write(
  table_name text,
  record_id text,
  operation audit_operation,
  prior_value jsonb,
  new_value jsonb,
  changed_fields text[],
  domain audit_domain
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor uuid := audit_actor(table_name);
  source text := nullif(current_setting('adms.source', true), '');
BEGIN
  IF source IS NULL THEN
    RAISE EXCEPTION 'A write to % needs its source: state adms.source before writing', table_name
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO "audit_record" (
    "table_name", "record_id", "operation", "prior_value", "new_value", "changed_fields",
    "actor_id", "device_id", "source", "reason", "request_id", "domain"
  ) VALUES (
    audit_write.table_name, audit_write.record_id, audit_write.operation, audit_write.prior_value,
    audit_write.new_value, audit_write.changed_fields, actor,
    nullif(current_setting('adms.device_id', true), '')::uuid,
    source::audit_source,
    nullif(current_setting('adms.reason', true), ''),
    nullif(current_setting('adms.request_id', true), ''),
    audit_write.domain
  );
END;
$$;
