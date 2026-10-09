-- Guard: the firm's last admin, and the email address a person signs in with
-- (spec/acceptance/02-people-and-devices.md AC-02-13, 83; spec/THREAT-MODEL.md T-14;
-- ARCHITECTURE §5.4, §6 Authorization; ADR-097, 113, 409 (7), 415; BACKLOG 2.2.5). Written by
-- hand into Prisma's --create-only stub; never edited once applied.
--
-- No model changes: "user" keeps its columns and its own guards (its grants, its audit, no
-- delete). Two rules are added that the API's services also ask, so that neither rests on the
-- code alone.

-- 1. No two people who sign in at the back office or the portal, and aren't archived, have one
-- email address: it is what each signs in with (ADR-409 (7)), so two who shared one could
-- neither sign in nor reset a password. Compared without regard to capitals or the spaces
-- around it, as sign-in compares it. A monitor signs in with a Monitor ID, never an address,
-- so a monitor's address is no key; an archived person's is free again. A rule among live rows
-- is an exclusion, never a partial unique index (ADR-340).
ALTER TABLE "user" ADD CONSTRAINT "user_sign_in_email_once"
  EXCLUDE USING btree (lower(btrim("email")) WITH =)
  WHERE (
    "role" IN ('ADMIN', 'MANAGER_ANALYST', 'READ_ONLY_VIEWER')
    AND "archived_at" IS NULL
    AND "email" IS NOT NULL
  );

-- 2. The last admin stays (ARCHITECTURE §6: "the last admin can't be removed"). An admin in
-- service is never archived or made anything else while no other admin is in service, whoever
-- asks and by whatever path. Two such changes at one moment are taken one after the other (the
-- lock is this rule's own and ends with the piece of work), so two admins can't each remove
-- the other. A firm that has no admin yet is not this rule's: its first is made on the server
-- (pnpm installer:admin).
CREATE FUNCTION user_last_admin_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD."role" = 'ADMIN' AND OLD."archived_at" IS NULL
     AND (NEW."role" <> 'ADMIN' OR NEW."archived_at" IS NOT NULL) THEN
    PERFORM pg_advisory_xact_lock(hashtext('open-adms: the last admin'));
    IF NOT EXISTS (
      SELECT 1 FROM "user" AS other
      WHERE other."role" = 'ADMIN' AND other."archived_at" IS NULL AND other."id" <> OLD."id"
    ) THEN
      RAISE EXCEPTION 'The firm''s last admin can''t be archived or made anything else: make another admin first'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "user_last_admin" BEFORE UPDATE OF "role", "archived_at" ON "user"
  FOR EACH ROW EXECUTE FUNCTION user_last_admin_guard();
