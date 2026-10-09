-- Guard: one line guards a new table (ARCHITECTURE §5; ADR-113, 270, 271).
-- Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The models stay in the Prisma schema, split by kind of record (configuration.prisma,
-- evidence.prisma, derived.prisma, audit.prisma). A migration that adds a table guards it in one
-- line, in its own guard migration, naming the table's kind of record and its audit domain:
--   SELECT guard_table('pay_item', 'CONFIGURATION', 'BILLING');
--   SELECT guard_table('roe', 'EVIDENCE', 'RECORDS');
--   SELECT guard_table('flag', 'DERIVED', 'OPERATIONS');
-- An evidence table with columns the worker writes names them:
--   SELECT guard_table('field_event', 'EVIDENCE', 'RECORDS', ARRAY['status', 'reconciled_at']);
-- It gives the table its grants (ARCHITECTURE §5.1), its delete and truncate refusal (§5.2) and
-- its audit trigger (§5.3). Safe to repeat: rerun it when a model gains a column, so an evidence
-- table's new column can be corrected. guard_gaps() lists every table missing a guard; the
-- installer refuses to finish while it lists any.
-- Not here, because each is its own decision: row-level security (a table readonly viewers see
-- needs its policy and view, like the row-level security guard's), and the two tables with their
-- own guards, "transaction" and audit_record.

-- The kinds of record (adms-data-model §3.1b) and who may write each:
--   CONFIGURATION  the API inserts and updates (archived or closed, never deleted); the worker reads
--   MARK           a person's mark on a record (QC status, invoice lock, flag acceptance): as
--                  configuration, its own record, never the marked row (ADR-245)
--   EVIDENCE       the API inserts it and corrects its captured columns; the worker writes only
--                  its named columns; the id, created_at and received_at never change
--   DERIVED        the worker inserts and updates; the API reads
CREATE FUNCTION guard_table(
  table_name text,
  kind text,
  domain audit_domain,
  worker_columns text[] DEFAULT '{}'
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  target regclass := to_regclass(format('public.%I', table_name));
  unknown text;
  api_columns text;
  worker_list text;
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'guard_table: there is no table %', table_name;
  END IF;
  IF table_name IN ('transaction', 'audit_record') THEN
    RAISE EXCEPTION 'guard_table: % has its own guards', table_name;
  END IF;
  IF kind NOT IN ('CONFIGURATION', 'MARK', 'EVIDENCE', 'DERIVED') THEN
    RAISE EXCEPTION 'guard_table: % is not a kind of record (CONFIGURATION, MARK, EVIDENCE, DERIVED)', kind;
  END IF;
  IF kind <> 'EVIDENCE' AND cardinality(worker_columns) > 0 THEN
    RAISE EXCEPTION 'guard_table: only an evidence table names the worker''s columns';
  END IF;
  SELECT string_agg(wanted, ', ') INTO unknown
    FROM unnest(worker_columns) AS wanted
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = target AND attname = wanted AND attnum > 0 AND NOT attisdropped
    );
  IF unknown IS NOT NULL THEN
    RAISE EXCEPTION 'guard_table: % has no column %', table_name, unknown;
  END IF;

  -- Grants: from nothing (a table-level revoke clears column grants too), then by kind.
  EXECUTE format('REVOKE ALL ON %s FROM PUBLIC, adms_api, adms_worker', target);
  IF kind IN ('CONFIGURATION', 'MARK') THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %s TO adms_api', target);
    EXECUTE format('GRANT SELECT ON %s TO adms_worker', target);
  ELSIF kind = 'DERIVED' THEN
    EXECUTE format('GRANT SELECT ON %s TO adms_api', target);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %s TO adms_worker', target);
  ELSE
    SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum) INTO api_columns
      FROM pg_attribute
      WHERE attrelid = target AND attnum > 0 AND NOT attisdropped
        AND attname NOT IN ('id', 'created_at', 'received_at')
        AND attname <> ALL (worker_columns);
    EXECUTE format('GRANT SELECT, INSERT ON %s TO adms_api', target);
    IF api_columns IS NOT NULL THEN
      EXECUTE format('GRANT UPDATE (%s) ON %s TO adms_api', api_columns, target);
    END IF;
    EXECUTE format('GRANT SELECT ON %s TO adms_worker', target);
    IF cardinality(worker_columns) > 0 THEN
      SELECT string_agg(format('%I', wanted), ', ') INTO worker_list FROM unnest(worker_columns) AS wanted;
      EXECUTE format('GRANT UPDATE (%s) ON %s TO adms_worker', worker_list, target);
    END IF;
  END IF;

  -- Nothing is deleted or truncated, by anyone (the no-delete guard's function).
  EXECUTE format(
    'CREATE OR REPLACE TRIGGER %I BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION refuse_delete()',
    table_name || '_refuse_delete', target
  );
  EXECUTE format(
    'CREATE OR REPLACE TRIGGER %I BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete()',
    table_name || '_refuse_truncate', target
  );
  -- Every insert and update audited, with its actor (the audit capture guard's function).
  EXECUTE format(
    'CREATE OR REPLACE TRIGGER %I AFTER INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION audit_capture(%L)',
    table_name || '_audit', target, domain
  );
END;
$$;

-- Every table missing a guard, and what it misses. Empty when every table is guarded.
CREATE FUNCTION guard_gaps() RETURNS TABLE (table_name text, gap text)
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
  has_trigger AS (
    SELECT t.tgrelid, p.proname::text AS function_name, t.tgtype
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal AND t.tgenabled <> 'D'
  )
  SELECT g.name, 'no audit trigger'
    FROM guarded g
    WHERE g.name <> 'audit_record'
      AND NOT EXISTS (SELECT 1 FROM has_trigger h WHERE h.tgrelid = g.oid AND h.function_name = 'audit_capture')
  UNION ALL
  SELECT g.name, 'deletes not refused'
    FROM guarded g
    WHERE NOT EXISTS (
      SELECT 1 FROM has_trigger h
      WHERE h.tgrelid = g.oid AND h.function_name = CASE g.name
        WHEN 'transaction' THEN 'transaction_delete_to_audit'
        WHEN 'audit_record' THEN 'refuse_audit_change'
        ELSE 'refuse_delete' END
    )
  UNION ALL
  SELECT g.name, 'truncate not refused'
    FROM guarded g
    WHERE NOT EXISTS (
      SELECT 1 FROM has_trigger h
      WHERE h.tgrelid = g.oid AND h.tgtype & 32 <> 0
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
