-- Guard: an unvoid's own record (spec/DATA-MODEL.md §6; spec/acceptance/08-review-and-corrections.md
-- AC-08-37, 38, 67; ARCHITECTURE §5.1…§5.5; ADR-051, 060, 113, 167, 245, 271, 315, 360, 363, 365,
-- 366; invariants 1, 3; BACKLOG 1.8.4, C80; REQ-105p, 120g). Written by hand into Prisma's
-- --create-only stub; never edited once applied.
--
-- The table and its columns are the migration before this one. Here: who writes it, the check
-- Prisma can't declare, that it stays as written, and what a viewer sees.

-- 1. An unvoid is a person's mark, written by the API as its own record: it inserts, the worker
-- reads, nobody deletes, every write audited (the user, ADR-366: unvoiding anything always leaves
-- an audit record). Like a void, it says what is billed.
SELECT guard_table('ticket_unvoid', 'MARK', 'BILLING');

-- 2. An unvoid names its ticket; a note is never blank; a person unvoids, never the system actor.
ALTER TABLE "ticket_unvoid" ADD CONSTRAINT "ticket_unvoid_ticket_check" CHECK ((
  btrim("ticket_number") <> ''
  AND ("note" IS NULL OR btrim("note") <> '')
  AND "unvoided_by_id" <> '00000000-0000-7000-8000-000000000001'::uuid
) IS TRUE);

-- 3. Once written it is history: nothing of it changes, by any login.
CREATE TRIGGER "ticket_unvoid_refuse_edit" BEFORE UPDATE ON "ticket_unvoid"
  FOR EACH ROW EXECUTE FUNCTION refuse_edit();

-- 4. What a viewer sees (ADR-169, 315, 363): a client user and an auditor see an unvoid on their
-- projects, as they see a void; a contractor user sees neither.
SELECT guard_viewer('ticket_unvoid', 'PROJECT');
