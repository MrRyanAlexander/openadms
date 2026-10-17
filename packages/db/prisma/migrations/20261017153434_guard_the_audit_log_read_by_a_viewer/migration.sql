-- Guard: the audit log, read by a client user or an auditor (spec/acceptance/10-api-and-sync.md
-- AC-10-111; ARCHITECTURE §5.3, §5.5; invariants 2, 3; ADR-097, 315, 361, 544; the Phase 2
-- audit's F5). Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- No table changes. The log is the database's, append-only, its values written whole; "corrected
-- in place, prior value kept" is a promise to the client's auditor, who until now could read none
-- of it. This view shows a client user and an auditor, and nobody else, the rows of the log about
-- their projects' records, and of each row only what the read-only login may read:
--   1. a row is shown when its table is one the read-only login reads at all, the row it copies
--      names a project (`project_id`) the viewer is given, the viewer sees every ticket of their
--      projects (a client user or an auditor; never a contractor user), and it isn't the log's
--      security domain;
--   2. of its values before and after, and of what it says changed, only the columns the
--      read-only login may read of that table: a column hidden from every viewer (a driver's
--      phone, a private citizen's name) is left out here too, whatever the firm lets one see;
--   3. who made it (their id and name: a person, the system, the master passcode, a phone's key),
--      from where and on which phone; never the reason given or the request.
-- Like viewer_project_setup it runs with the owner's rights and asks the viewer's questions
-- itself, since row-level security can't tell one column of a JSON value from another.
CREATE VIEW "viewer_audit_record" WITH (security_barrier = true) AS
  SELECT
    a."id",
    a."occurred_at",
    a."table_name",
    a."record_id",
    a."operation",
    ARRAY(
      SELECT field FROM unnest(a."changed_fields") AS field
      WHERE EXISTS (
        SELECT 1 FROM pg_attribute AS shown
        WHERE shown.attrelid = to_regclass(format('public.%I', a."table_name"))
          AND shown.attname = field AND shown.attnum > 0 AND NOT shown.attisdropped
          AND has_column_privilege('adms_readonly', shown.attrelid, shown.attnum, 'SELECT')
      )
    ) AS "changed_fields",
    (
      SELECT jsonb_object_agg(held.key, held.value) FROM jsonb_each(a."prior_value") AS held
      WHERE EXISTS (
        SELECT 1 FROM pg_attribute AS shown
        WHERE shown.attrelid = to_regclass(format('public.%I', a."table_name"))
          AND shown.attname = held.key AND shown.attnum > 0 AND NOT shown.attisdropped
          AND has_column_privilege('adms_readonly', shown.attrelid, shown.attnum, 'SELECT')
      )
    ) AS "prior_value",
    (
      SELECT jsonb_object_agg(held.key, held.value) FROM jsonb_each(a."new_value") AS held
      WHERE EXISTS (
        SELECT 1 FROM pg_attribute AS shown
        WHERE shown.attrelid = to_regclass(format('public.%I', a."table_name"))
          AND shown.attname = held.key AND shown.attnum > 0 AND NOT shown.attisdropped
          AND has_column_privilege('adms_readonly', shown.attrelid, shown.attnum, 'SELECT')
      )
    ) AS "new_value",
    a."actor_id",
    (SELECT actor."name" FROM "user" AS actor WHERE actor."id" = a."actor_id") AS "actor_name",
    a."source",
    a."device_id",
    (coalesce(a."new_value", a."prior_value") ->> 'project_id')::uuid AS "project_id"
  FROM "audit_record" AS a
  WHERE viewer_sees_every_ticket()
    AND a."domain" <> 'SECURITY'
    AND to_regclass(format('public.%I', a."table_name")) IS NOT NULL
    AND has_any_column_privilege(
      'adms_readonly', to_regclass(format('public.%I', a."table_name")), 'SELECT'
    )
    AND coalesce(a."new_value", a."prior_value") ->> 'project_id'
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND viewer_sees_project((coalesce(a."new_value", a."prior_value") ->> 'project_id')::uuid);
GRANT SELECT ON "viewer_audit_record" TO adms_readonly;
