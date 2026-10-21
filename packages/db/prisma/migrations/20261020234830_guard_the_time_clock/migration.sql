-- Guard: the time clock's records (spec/DATA-MODEL.md §3, "The time clock";
-- spec/acceptance/02-people-and-devices.md AC-02-50, 53…55; ARCHITECTURE §5.1…§5.5, §10;
-- ADR-063, 097, 100, 113, 241, 598; BACKLOG 3.7.1; REQ-310). Written by hand into Prisma's
-- --create-only stub; never edited once applied.
--
-- The three tables are the migration before this one, and so is everything held by a key: an
-- entry's worker is its assignment's own person, of its own project; an activity line is
-- carried by its own clock-out's entry, and names an activity of the firm's list; a day's
-- approval is of an assignment of its own project. Here: who writes them, the checks Prisma
-- can't declare, what stays as written, an approved day locked, one approval in force, a closed
-- project, and that no viewer sees them. **Nothing here relates any of it to crew time**: no
-- column or check names a field event's items or hours (ADR-241 (7)).

-- 1. An entry and its lines are evidence, the worker's own word: the API inserts them and may
-- correct them as it does any evidence (by a person's permission, Phase 4), the worker reads
-- nothing of them it needs and writes none of them; nobody deletes, every write audited. A
-- day's approval is a person's mark (ADR-245; invariants 1, 3).
SELECT guard_table('clock_entry', 'EVIDENCE', 'RECORDS');
SELECT guard_table('clock_activity_line', 'EVIDENCE', 'RECORDS');
SELECT guard_table('day_approval', 'MARK', 'RECORDS');

-- 2. An entry is the phone's clock with an offset a clock can have (UTC−12:00 to UTC+14:00), and
-- its worker is a person: never the system actor, the master passcode's or the device key's
-- (ADR-276, 438, 440), whatever an assignment says.
ALTER TABLE "clock_entry" ADD CONSTRAINT "clock_entry_device_utc_offset_check" CHECK (
  "device_utc_offset_minutes" BETWEEN -720 AND 840
);
ALTER TABLE "clock_entry" ADD CONSTRAINT "clock_entry_worker_check" CHECK (
  "worker_id" <> '00000000-0000-7000-8000-000000000001'::uuid
);
ALTER TABLE "clock_entry" ADD CONSTRAINT "clock_entry_worker_id_not_master_passcode_check" CHECK (
  "worker_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'::uuid
);
ALTER TABLE "clock_entry" ADD CONSTRAINT "clock_entry_worker_id_not_device_key_check" CHECK (
  "worker_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000003'::uuid
);

-- 3. A line is carried by a clock-out (the worker approves the day's lines as they clock out);
-- it is one thing, an activity of the firm's list or a field event it was pre-filled from, never
-- both and never neither; a place among its clock-out's lines from 1; a note, where there is
-- one, isn't blank. When it started and ended is the worker's, taken as sent.
ALTER TABLE "clock_activity_line" ADD CONSTRAINT "clock_activity_line_check" CHECK ((
  "clock_entry_kind" = 'OUT'
  AND num_nonnulls("activity_id", "field_event_id") = 1
  AND "position" >= 1
  AND ("note" IS NULL OR btrim("note") <> '')
) IS TRUE);

-- 4. An entry and its lines are what a phone reported for the worker signed in on it: written
-- only as that worker, from a phone, the one the entry names (a line as its own entry's worker).
-- What the entry is of (its assignment, worker, phone, kind) and when the server received it
-- never change; and while a manager's approval of its day is in force, nothing of an entry or a
-- line is changed (ADR-241 (4)). A phone's record that arrives after the day was approved is
-- still taken (offline is normal; nothing is lost): the hours read say so.
CREATE FUNCTION clock_record_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  entry record;
BEGIN
  IF TG_TABLE_NAME = 'clock_entry' THEN
    entry := NEW;
  ELSE
    SELECT * INTO entry FROM public."clock_entry" WHERE "id" = NEW."clock_entry_id";
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF nullif(current_setting('adms.actor_id', true), '') IS DISTINCT FROM entry."worker_id"::text
      OR nullif(current_setting('adms.source', true), '') IS DISTINCT FROM 'DEVICE'
      OR nullif(current_setting('adms.device_id', true), '') IS DISTINCT FROM entry."device_id"::text
    THEN
      RAISE EXCEPTION 'A time-clock record is the worker''s own, from the phone it names: state the worker as the actor and that phone'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  -- Each table's own columns are asked in its own branch: a condition naming a column the other
  -- table hasn't fails when it is planned.
  IF TG_TABLE_NAME = 'clock_entry' THEN
    IF NEW."assignment_id" IS DISTINCT FROM OLD."assignment_id"
      OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
      OR NEW."worker_id" IS DISTINCT FROM OLD."worker_id"
      OR NEW."device_id" IS DISTINCT FROM OLD."device_id"
      OR NEW."kind" IS DISTINCT FROM OLD."kind" THEN
      RAISE EXCEPTION 'What a time-clock entry is of never changes'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW."received_at" IS DISTINCT FROM OLD."received_at" THEN
      RAISE EXCEPTION 'When the server received a time-clock entry never changes'
        USING ERRCODE = 'restrict_violation';
    END IF;
  ELSE
    IF NEW."clock_entry_id" IS DISTINCT FROM OLD."clock_entry_id"
      OR NEW."clock_entry_kind" IS DISTINCT FROM OLD."clock_entry_kind" THEN
      RAISE EXCEPTION 'Which clock-out carried an activity line never changes'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."day_approval" a
    WHERE a."assignment_id" = entry."assignment_id" AND a."unlocked_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'The day is approved: its time clock is locked until it is unlocked'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'clock_day_approved';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "clock_entry_guard" BEFORE INSERT OR UPDATE ON "clock_entry"
  FOR EACH ROW EXECUTE FUNCTION clock_record_guard();
CREATE TRIGGER "clock_activity_line_guard" BEFORE INSERT OR UPDATE ON "clock_activity_line"
  FOR EACH ROW EXECUTE FUNCTION clock_record_guard();

-- 5. A day's approval is a person's, and never the worker's own day; the unlock is who, when and
-- why together, by a person. A day has one approval in force at most; approving again after an
-- unlock is a new row. What was approved, by whom and when never changes, and once unlocked the
-- row is history.
ALTER TABLE "day_approval" ADD CONSTRAINT "day_approval_unlock_check" CHECK ((
  num_nonnulls("unlocked_by_id", "unlocked_at", "unlock_note") IN (0, 3)
  AND ("unlock_note" IS NULL OR btrim("unlock_note") <> '')
) IS TRUE);
ALTER TABLE "day_approval" ADD CONSTRAINT "day_approval_approved_by_check" CHECK (
  "approved_by_id" <> '00000000-0000-7000-8000-000000000001'::uuid
);
ALTER TABLE "day_approval" ADD CONSTRAINT "day_approval_approved_by_id_not_master_passcode_check" CHECK (
  "approved_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'::uuid
);
ALTER TABLE "day_approval" ADD CONSTRAINT "day_approval_approved_by_id_not_device_key_check" CHECK (
  "approved_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000003'::uuid
);
ALTER TABLE "day_approval" ADD CONSTRAINT "day_approval_unlocked_by_check" CHECK (
  "unlocked_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid
);
ALTER TABLE "day_approval" ADD CONSTRAINT "day_approval_unlocked_by_id_not_master_passcode_check" CHECK (
  "unlocked_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'::uuid
);
ALTER TABLE "day_approval" ADD CONSTRAINT "day_approval_unlocked_by_id_not_device_key_check" CHECK (
  "unlocked_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000003'::uuid
);
ALTER TABLE "day_approval" ADD CONSTRAINT "day_approval_approved_once"
  EXCLUDE USING btree ("assignment_id" WITH =) WHERE ("unlocked_at" IS NULL);
CREATE TRIGGER "day_approval_refuse_approval_edit" BEFORE UPDATE OF "id", "project_id",
  "assignment_id", "approved_by_id", "approved_at" ON "day_approval"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();
CREATE TRIGGER "day_approval_refuse_edit_once_unlocked" BEFORE UPDATE ON "day_approval"
  FOR EACH ROW WHEN (OLD."unlocked_at" IS NOT NULL) EXECUTE FUNCTION refuse_edit();

CREATE FUNCTION day_approval_not_own_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."assignment" a
    WHERE a."id" = NEW."assignment_id" AND a."person_id" = NEW."approved_by_id"
  ) THEN
    RAISE EXCEPTION 'Nobody approves their own day'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'day_approval_not_own_day';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "day_approval_not_own" BEFORE INSERT ON "day_approval"
  FOR EACH ROW EXECUTE FUNCTION day_approval_not_own_guard();

-- 6. Nothing in a closed project is written, changed or taken away (ADR-529 (b)): an entry and a
-- day's approval by their project, a line by its entry's.
CREATE TRIGGER "clock_entry_project_open" BEFORE INSERT OR UPDATE OR DELETE ON "clock_entry"
  FOR EACH ROW EXECUTE FUNCTION project_open_guard();
CREATE TRIGGER "day_approval_project_open" BEFORE INSERT OR UPDATE OR DELETE ON "day_approval"
  FOR EACH ROW EXECUTE FUNCTION project_open_guard();
CREATE TRIGGER "clock_activity_line_project_open" BEFORE INSERT OR UPDATE OR DELETE
  ON "clock_activity_line"
  FOR EACH ROW EXECUTE FUNCTION project_open_guard('clock_entry', 'clock_entry_id');

-- 7. No read-only viewer sees anyone's hours (ADR-241 (8)): no view, no grant, no policy. The
-- firm sends approved hours to its client from the export.
