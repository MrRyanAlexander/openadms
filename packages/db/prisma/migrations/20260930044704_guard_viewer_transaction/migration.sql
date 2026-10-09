-- Guard fix: a contractor viewer sees its own transactions (ARCHITECTURE §5.5; ADR-169, 270).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
-- The row-level security guard found a transaction's project by reading completed_load, but that
-- read is itself filtered for the viewer, and a contractor viewer sees no completed loads yet
-- (they carry no contractor, ADR-268), so a contractor saw none of its own transactions. The
-- load's project is now looked up with the owner's rights; it answers only whether this viewer
-- may see that load's project, never a row.

CREATE FUNCTION viewer_sees_load_project(load_id uuid) RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(
    (SELECT viewer_sees_project("project_id") FROM "completed_load" WHERE "id" = load_id),
    false
  )
$$;

GRANT EXECUTE ON FUNCTION viewer_sees_load_project(uuid) TO adms_readonly;

DROP POLICY "transaction_viewer" ON "transaction";
CREATE POLICY "transaction_viewer" ON "transaction" FOR SELECT TO adms_readonly
  USING (
    viewer_sees_load_project("completed_load_id")
    AND (viewer_sees_every_ticket() OR viewer_is_contractor("prime_id"))
  );
