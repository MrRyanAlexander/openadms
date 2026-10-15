-- Guard: the closed project's check, made again (ADR-529 (b); ADR-113). Written by hand into
-- Prisma's --create-only stub; never edited once applied.
--
-- The function the migration before this one made named its variable `project`, which is also
-- the table it asks: inside its own question the name was ambiguous, and every write of a record
-- of a project failed (seen by the database tests, before anything else used it). The function
-- is the same, its variable named `of_project`.
CREATE OR REPLACE FUNCTION project_open_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  asked jsonb;
  of_project uuid;
BEGIN
  FOREACH asked IN ARRAY CASE TG_OP
    WHEN 'INSERT' THEN ARRAY[to_jsonb(NEW)]
    WHEN 'UPDATE' THEN ARRAY[to_jsonb(NEW), to_jsonb(OLD)]
    ELSE ARRAY[to_jsonb(OLD)]
  END LOOP
    -- A photograph kept with a held record waits for a person, as the record does.
    IF TG_TABLE_NAME = 'photo' AND asked ->> 'held_record_id' IS NOT NULL THEN
      CONTINUE;
    END IF;
    IF TG_NARGS = 0 THEN
      of_project := (asked ->> 'project_id')::uuid;
    ELSE
      EXECUTE format('SELECT "project_id" FROM public.%I WHERE "id" = $1', TG_ARGV[0])
        INTO of_project USING (asked ->> TG_ARGV[1])::uuid;
    END IF;
    IF of_project IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public."project" p WHERE p."id" = of_project AND p."closed_at" IS NOT NULL
      ) THEN
      RAISE EXCEPTION 'The project is closed: nothing in it is written, changed or taken away'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'project_closed';
    END IF;
  END LOOP;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
