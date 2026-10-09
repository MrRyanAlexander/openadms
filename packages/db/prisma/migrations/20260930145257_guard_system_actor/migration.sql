-- Guard: only the worker writes as the system actor, and nobody changes it (ARCHITECTURE §5.3;
-- invariant 3; ADR-113, 273, 276; BACKLOG carry-forward C4).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The system actor (user 00000000-0000-7000-8000-000000000001, role SYSTEM) is the user the worker
-- writes as; the installer's seed makes it, as adms_owner (packages/db/src/system-actor.ts). Until
-- now the database checked only that a write's actor was a user, so the API could state the system
-- actor, or source SYSTEM, on its own writes, change the system actor's row, or make a second SYSTEM
-- user. Now:
--   1. a write stating the system actor, or source SYSTEM, is refused unless adms_worker or
--      adms_owner (the seed) makes it;
--   2. no login but adms_owner may change the system actor's row, make it, or give anyone role SYSTEM;
--   3. role SYSTEM belongs to that one id only, which has no Monitor ID and no contractor (C15).
-- The worker may still state a person (a reprocess a person asked for): ARCHITECTURE §5.3 allows it,
-- and restricting it is the worker's own decision, in Phase 1 (ADR-276).

-- The login a write runs as. Inside an owner's-rights function current_user is the owner, so this
-- reads the role the session set (SET ROLE, as the database tests do) or, with none, the session's
-- own login (as the services connect). A runtime login is a member of no other role, so it can't
-- SET ROLE to one. Called only from the guards' owner's-rights functions; not executable by the
-- logins (the grants guard's default).
CREATE FUNCTION writing_login() RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE current_setting('role') WHEN 'none' THEN session_user::text ELSE current_setting('role') END
$$;

-- The audit guard's writer, as before, refusing the system actor and source SYSTEM from anyone but
-- the worker and the seed. Everything else is unchanged (the audit wording guard's version).
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
  login text := writing_login();
BEGIN
  IF source IS NULL THEN
    RAISE EXCEPTION 'A write to % needs its source: state adms.source before writing', table_name
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF actor = '00000000-0000-7000-8000-000000000001' AND login NOT IN ('adms_worker', 'adms_owner') THEN
    RAISE EXCEPTION 'Only the worker writes as the system actor: % may not state it (a write to %)', login, table_name
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF source = 'SYSTEM' AND login NOT IN ('adms_worker', 'adms_owner') THEN
    RAISE EXCEPTION 'Only the worker writes with source SYSTEM: % may not state it (a write to %)', login, table_name
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

-- The system actor's row: made by the seed, then never changed by a runtime login (renamed,
-- re-roled, archived or re-keyed), and nobody else is made SYSTEM or given its id. Runs with the
-- writer's own rights, so current_user is the login (or the role a test set).
CREATE FUNCTION user_system_actor_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user = 'adms_owner' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."id" = '00000000-0000-7000-8000-000000000001' THEN
    RAISE EXCEPTION 'The system actor can''t be changed: % may not update it', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."id" = '00000000-0000-7000-8000-000000000001' OR NEW."role" = 'SYSTEM' THEN
    RAISE EXCEPTION 'Only the installer''s seed makes the system actor: % may not write role SYSTEM or its id', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "user_system_actor" BEFORE INSERT OR UPDATE ON "user"
  FOR EACH ROW EXECUTE FUNCTION user_system_actor_guard();

-- Role SYSTEM on the one id only, and never a person's: no Monitor ID, no contractor.
ALTER TABLE "user" ADD CONSTRAINT "user_system_actor_check" CHECK (
  "role" <> 'SYSTEM'
  OR ("id" = '00000000-0000-7000-8000-000000000001' AND "monitor_number" IS NULL AND "contractor_id" IS NULL)
);
