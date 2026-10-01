-- Guard: every insert and update is audited by the database, with a required actor
-- (ARCHITECTURE §5.3; invariant 3; ADR-097, 113, 270).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- Every write transaction states who is writing first, as transaction-local settings (one shared
-- Prisma client extension, BACKLOG 0.3.4), e.g.
--   SELECT set_config('adms.actor_id', '<user id>', true), set_config('adms.source', 'BACK_OFFICE', true);
-- adms.actor_id   the user making the change (the worker states its system actor): required
-- adms.source     DEVICE, BACK_OFFICE or SYSTEM: required
-- adms.device_id  the phone, when the change came from one
-- adms.reason     why (a correction's or a void's reason)
-- adms.request_id the API request, to trace a change back to its call
-- A write without an actor or a source is refused, so an unattributed change can't happen.
-- The functions run as the owner (the runtime logins may only SELECT audit_record) and aren't
-- executable by the logins (the grants guard's default); a trigger needs no EXECUTE to fire.

-- The actor stated for this transaction; refuses the write when there is none.
CREATE FUNCTION audit_actor(table_name text) RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor text := nullif(current_setting('adms.actor_id', true), '');
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'A write to % needs its actor: set adms.actor_id for the transaction first', table_name
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN actor::uuid;
END;
$$;

-- Writes one audit record for a change, with who, where from, why and which request.
CREATE FUNCTION audit_write(
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
    RAISE EXCEPTION 'A write to % needs its source: set adms.source for the transaction first', table_name
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

-- The capture trigger: the whole row before and after, and the fields that changed. An update
-- that changes nothing writes no record, but still needs its actor. The domain is the trigger's
-- argument.
CREATE FUNCTION audit_capture() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_value jsonb := to_jsonb(NEW);
  prior_value jsonb;
  changed_fields text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(field ORDER BY field) INTO changed_fields FROM jsonb_object_keys(new_value) AS field;
  ELSE
    prior_value := to_jsonb(OLD);
    SELECT array_agg(field.key ORDER BY field.key) INTO changed_fields
      FROM jsonb_each(new_value) AS field
      WHERE field.value IS DISTINCT FROM prior_value -> field.key;
    IF changed_fields IS NULL THEN
      PERFORM audit_actor(TG_TABLE_NAME);
      RETURN NULL;
    END IF;
  END IF;
  PERFORM audit_write(
    TG_TABLE_NAME, new_value ->> 'id', TG_OP::audit_operation, prior_value, new_value,
    changed_fields, TG_ARGV[0]::audit_domain
  );
  RETURN NULL;
END;
$$;

-- The tracked tables, each with its audit domain (so a billing reviewer isn't reading sign-ins).
CREATE TRIGGER "project_audit" AFTER INSERT OR UPDATE ON "project"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('OPERATIONS');
CREATE TRIGGER "contractor_audit" AFTER INSERT OR UPDATE ON "contractor"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('OPERATIONS');
CREATE TRIGGER "user_audit" AFTER INSERT OR UPDATE ON "user"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('SECURITY');
CREATE TRIGGER "device_audit" AFTER INSERT OR UPDATE ON "device"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('SECURITY');
CREATE TRIGGER "field_event_audit" AFTER INSERT OR UPDATE ON "field_event"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('RECORDS');
CREATE TRIGGER "completed_load_audit" AFTER INSERT OR UPDATE ON "completed_load"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('BILLING');
CREATE TRIGGER "transaction_audit" AFTER INSERT OR UPDATE ON "transaction"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('BILLING');
CREATE TRIGGER "invoice_lock_audit" AFTER INSERT OR UPDATE ON "invoice_lock"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('BILLING');
