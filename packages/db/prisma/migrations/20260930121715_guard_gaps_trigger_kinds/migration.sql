-- Guard fix: guard_gaps() asks what each trigger fires on, not only what it calls (ADR-271, 272).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
-- Found by the database tests (BACKLOG 0.3.3): a table's delete refusal and its truncate refusal
-- call the same function (refuse_delete; refuse_audit_change on audit_record), so with the row
-- trigger dropped, the truncate trigger still counted as "deletes refused" and the gap went unseen.
-- Now a delete refusal must be a row trigger on DELETE, and an audit trigger a row trigger on
-- INSERT and UPDATE. Same name, columns and answers otherwise; the owner keeps it to itself.

CREATE OR REPLACE FUNCTION guard_gaps() RETURNS TABLE (table_name text, gap text)
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  WITH guarded AS (
    SELECT c.oid, c.relname::text AS name
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind IN ('r', 'p')
      AND c.relname <> '_prisma_migrations'
  ),
  -- Enabled triggers, with what they fire on (pg_trigger.tgtype: 1 row, 4 insert, 8 delete,
  -- 16 update, 32 truncate).
  has_trigger AS (
    SELECT t.tgrelid, p.proname::text AS function_name,
      t.tgtype & 1 <> 0 AS per_row,
      t.tgtype & 4 <> 0 AS on_insert,
      t.tgtype & 8 <> 0 AS on_delete,
      t.tgtype & 16 <> 0 AS on_update,
      t.tgtype & 32 <> 0 AS on_truncate
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal AND t.tgenabled <> 'D'
  )
  SELECT g.name, 'no audit trigger'
    FROM guarded g
    WHERE g.name <> 'audit_record'
      AND NOT EXISTS (
        SELECT 1 FROM has_trigger h
        WHERE h.tgrelid = g.oid AND h.function_name = 'audit_capture'
          AND h.per_row AND h.on_insert AND h.on_update
      )
  UNION ALL
  SELECT g.name, 'deletes not refused'
    FROM guarded g
    WHERE NOT EXISTS (
      SELECT 1 FROM has_trigger h
      WHERE h.tgrelid = g.oid AND h.per_row AND h.on_delete
        AND h.function_name = CASE g.name
          WHEN 'transaction' THEN 'transaction_delete_to_audit'
          WHEN 'audit_record' THEN 'refuse_audit_change'
          ELSE 'refuse_delete' END
    )
  UNION ALL
  SELECT g.name, 'truncate not refused'
    FROM guarded g
    WHERE NOT EXISTS (
      SELECT 1 FROM has_trigger h
      WHERE h.tgrelid = g.oid AND h.on_truncate
        AND h.function_name IN ('refuse_delete', 'refuse_audit_change')
    )
  UNION ALL
  SELECT g.name, 'no grants: the API can''t read it'
    FROM guarded g
    WHERE NOT has_table_privilege('adms_api', g.oid, 'SELECT')
  UNION ALL
  SELECT g.name, format('column %s can''t be corrected: rerun guard_table', a.attname)
    FROM guarded g
    JOIN pg_attribute a ON a.attrelid = g.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE a.attname NOT IN ('id', 'created_at', 'received_at')
      AND NOT has_column_privilege('adms_api', g.oid, a.attnum, 'UPDATE')
      AND NOT has_column_privilege('adms_worker', g.oid, a.attnum, 'UPDATE')
      AND EXISTS (
        SELECT 1 FROM pg_attribute other
        WHERE other.attrelid = g.oid AND other.attnum > 0 AND NOT other.attisdropped
          AND (has_column_privilege('adms_api', g.oid, other.attnum, 'UPDATE')
            OR has_column_privilege('adms_worker', g.oid, other.attnum, 'UPDATE'))
      )
  ORDER BY 1, 2
$$;
