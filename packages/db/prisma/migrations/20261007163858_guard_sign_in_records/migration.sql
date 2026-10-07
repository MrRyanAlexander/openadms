-- Guard: sign-in's records (spec/DATA-MODEL.md §2.2; spec/acceptance/10-api-and-sync.md
-- AC-10-10, 11, 19; spec/THREAT-MODEL.md T-14, T-26, T-43; ARCHITECTURE §5.1…§5.3, §6; ADR-113,
-- 170, 271, 273, 281, 397, 398, 399; BACKLOG 2.2.1, C21; REQ-202, 202b). Written by hand into
-- Prisma's --create-only stub; never edited once applied.
--
-- The tables are the migration before this one. Each has its own guards, tighter than
-- guard_table's, as the master passcode has (ADR-281): only the API reads them, the worker and
-- the read-only login hold nothing on them, nothing is deleted, every write is audited in the
-- security domain, and a column that holds a secret or a secret's hash is named on its audit
-- trigger, so the audit log says that it changed and never what to.

-- 1. What sign-in keeps of a person: the API reads it, adds it and changes it. Whose it is never
-- changes. A password is only ever a slow hash (Argon2id, as a PHC string), never the password;
-- an authenticator's secret is never blank. The system actor never signs in, so it never has one
-- (ADR-273; C21).
REVOKE ALL ON "user_credential" FROM PUBLIC, adms_api, adms_worker;
GRANT SELECT, INSERT, UPDATE ON "user_credential" TO adms_api;
CREATE TRIGGER "user_credential_refuse_delete" BEFORE DELETE ON "user_credential"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "user_credential_refuse_truncate" BEFORE TRUNCATE ON "user_credential"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "user_credential_audit" AFTER INSERT OR UPDATE ON "user_credential"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('SECURITY', 'password_hash', 'two_step_secret');
CREATE TRIGGER "user_credential_refuse_person_edit" BEFORE UPDATE OF "id", "user_id", "created_at"
  ON "user_credential" FOR EACH ROW EXECUTE FUNCTION refuse_edit();
ALTER TABLE "user_credential" ADD CONSTRAINT "user_credential_password_hash_check" CHECK (
  "password_hash" LIKE '$argon2id$%'
);
ALTER TABLE "user_credential" ADD CONSTRAINT "user_credential_two_step_secret_check" CHECK (
  btrim("two_step_secret") <> ''
);
ALTER TABLE "user_credential" ADD CONSTRAINT "user_credential_system_actor_check" CHECK (
  "user_id" <> '00000000-0000-7000-8000-000000000001'
);

-- 2. A session: the API reads it, opens it, rotates its refresh token and revokes it. The token
-- is only ever its SHA-256 (64 hexadecimal digits), never the token. Whose it is and when it
-- began never change; it ends after it began; and once revoked the row is history: no rotation
-- and no second life (ARCHITECTURE §6, "revocable"). Never the system actor's.
REVOKE ALL ON "session" FROM PUBLIC, adms_api, adms_worker;
GRANT SELECT, INSERT, UPDATE ON "session" TO adms_api;
CREATE TRIGGER "session_refuse_delete" BEFORE DELETE ON "session"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "session_refuse_truncate" BEFORE TRUNCATE ON "session"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "session_audit" AFTER INSERT OR UPDATE ON "session"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('SECURITY', 'refresh_token_hash');
CREATE TRIGGER "session_refuse_person_edit" BEFORE UPDATE OF "id", "user_id", "created_at"
  ON "session" FOR EACH ROW EXECUTE FUNCTION refuse_edit();
CREATE TRIGGER "session_refuse_edit_once_revoked" BEFORE UPDATE ON "session"
  FOR EACH ROW WHEN (OLD."revoked_at" IS NOT NULL) EXECUTE FUNCTION refuse_edit();
ALTER TABLE "session" ADD CONSTRAINT "session_refresh_token_hash_check" CHECK (
  "refresh_token_hash" ~ '^[0-9a-f]{64}$'
);
ALTER TABLE "session" ADD CONSTRAINT "session_times_check" CHECK ((
  "expires_at" > "created_at"
  AND ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
) IS TRUE);
ALTER TABLE "session" ADD CONSTRAINT "session_system_actor_check" CHECK (
  "user_id" <> '00000000-0000-7000-8000-000000000001'
);

-- 3. A security event: the API reads it and adds one; nobody edits one. The audit capture copies
-- each into the audit log's security domain, with who wrote it and in which request, so it is
-- there as every other change is and can't be removed from there either (ARCHITECTURE §5.3). A
-- request's id, when stated, is never blank.
REVOKE ALL ON "security_event" FROM PUBLIC, adms_api, adms_worker;
GRANT SELECT, INSERT ON "security_event" TO adms_api;
CREATE TRIGGER "security_event_refuse_delete" BEFORE DELETE ON "security_event"
  FOR EACH ROW EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "security_event_refuse_truncate" BEFORE TRUNCATE ON "security_event"
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete();
CREATE TRIGGER "security_event_audit" AFTER INSERT OR UPDATE ON "security_event"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('SECURITY');
CREATE TRIGGER "security_event_refuse_edit" BEFORE UPDATE ON "security_event"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();
ALTER TABLE "security_event" ADD CONSTRAINT "security_event_request_id_check" CHECK (
  btrim("request_id") <> ''
);
