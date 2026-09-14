-- ===========================================================================
-- 0021  Review
--
-- The dashboard answers "what did we produce", which is the question a project
-- manager asks. The data manager's question is "what looks wrong", and this is
-- what answers it. In Ryan's words, the 9am job is:
--
--   "we are hunting for the issues: times that don't make sense, duplicate
--    tickets ... location data that doesn't match up. Address details the
--    monitor typed in manually"
--
--   "I spend most of my day auditing tickets for accuracy, especially photos
--    for tree work ... and then marking each ticket QC approved or if there is
--    some issue"
--
-- This file previously modelled that as two tables keyed on ticket_id. That was
-- the right shape and the wrong key. The requirement is explicit that the same
-- review concept has to carry tickets, incidents, certifications, permits,
-- contracts and eventually surveys, and that invoices stay out of it because
-- they belong to an invoice analyst rather than the data review function.
--
-- So the spine is keyed on a subject: a kind and an id, the same polymorphic
-- shape `documents` already uses for entity_type and entity_id. Four concepts:
--
--   review_issue_kinds  what a detector can raise, and on which kinds of record
--   review_flags        what a detector noticed about one record
--   review_items        what a person decided about one record
--   review_events       what has happened to that decision, append only
--
-- A flag is never a verdict. The detectors are deliberately noisy in the
-- direction of showing too much, because a missed bad load costs more than a
-- second look at a good one. And nothing here blocks anything: a flagged ticket
-- still bills, it is simply visible. That matches the standing decision on
-- permits, where operations do not stop because paperwork is behind.
--
-- A review_items row is written lazily, on the first human action. An untouched
-- record reads as pending from the queue view, and its age counts from when the
-- work happened rather than from a row somebody had to create first. That keeps
-- 25,000 seeded tickets from needing 25,000 review rows to say "nobody has
-- looked at this yet".
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The kinds of record that can be reviewed.
--
-- subject_id points into the table named here. Adding a kind is a row plus a
-- branch in review_subjects, never a schema change to the spine.
-- ---------------------------------------------------------------------------
CREATE TABLE review_subject_kinds (
    code             text PRIMARY KEY,
    label            text NOT NULL,
    plural_label     text NOT NULL,
    description      text NOT NULL,
    -- The table subject_id refers to. Used by the existence check below.
    subject_table    text NOT NULL,
    -- What a user needs in order to see records of this kind in the queue.
    permission_code  text NOT NULL,
    supports_escalation boolean NOT NULL DEFAULT true,
    is_active        boolean NOT NULL DEFAULT true,
    sort_order       integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE review_subject_kinds IS
    'What can be reviewed. Invoices are deliberately absent: they are an '
    'invoice analyst job, not data review, and forcing them in here would make '
    'the queue somebody else''s work as well.';

INSERT INTO review_subject_kinds (
    code, label, plural_label, description, subject_table, permission_code,
    supports_escalation, is_active, sort_order) VALUES
    ('ticket', 'Ticket', 'Tickets',
     'Load, haul out, unit rate and incident records from the field.',
     'tickets', 'ticket.read.project', true, true, 10),
    ('certification', 'Certification', 'Certifications',
     'Equipment measured and certified for capacity on this project.',
     'project_equipment_certifications', 'equipment.manage', true, false, 20),
    ('permit', 'Permit', 'Permits',
     'Disposal site permit verification for this declaration.',
     'project_sites', 'project.update', true, false, 30),
    ('contract', 'Contract', 'Contracts',
     'Contract and rate sheet intake awaiting a data check.',
     'contracts', 'contract.manage', true, false, 40);

-- Surveys are not a fifth kind. A damage survey is ticket type SURVEY, so it
-- is already a ticket here and the queue tells it apart by record_type_code.
-- Registering it separately would give one record two review rows.

-- ---------------------------------------------------------------------------
-- What the detectors can raise.
--
-- subject_kinds keeps a certification check out of a ticket filter. A new check
-- is a seed row plus a branch in the detector, never a migration.
-- ---------------------------------------------------------------------------
CREATE TABLE review_issue_kinds (
    code          text PRIMARY KEY,
    label         text NOT NULL,
    description   text NOT NULL,
    severity      text NOT NULL DEFAULT 'review',
    -- What a reviewer is being asked to look at, so the queue can group by the
    -- kind of work rather than by the individual check.
    domain        text NOT NULL DEFAULT 'data',
    subject_kinds text[] NOT NULL DEFAULT ARRAY['ticket'],
    is_active     boolean NOT NULL DEFAULT true,
    sort_order    integer NOT NULL DEFAULT 0,
    CONSTRAINT issue_kind_severity_valid CHECK (severity IN ('info', 'review', 'serious')),
    CONSTRAINT issue_kind_domain_valid CHECK (domain IN (
        'timing', 'location', 'volume', 'evidence', 'duplication',
        'measurement', 'compliance', 'billing', 'data')),
    CONSTRAINT issue_kind_has_a_subject CHECK (cardinality(subject_kinds) > 0)
);

CREATE INDEX review_issue_kinds_subject_idx
    ON review_issue_kinds USING gin (subject_kinds);

COMMENT ON TABLE review_issue_kinds IS
    'The checks the detectors can raise, and the record kinds each applies to. '
    'Adding one is a seed row and a branch, so a new exception a program '
    'teaches us does not need a migration.';

-- ---------------------------------------------------------------------------
-- What a detector noticed about one record.
-- ---------------------------------------------------------------------------
CREATE TABLE review_flags (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_kind  text NOT NULL REFERENCES review_subject_kinds (code) ON UPDATE CASCADE,
    subject_id    uuid NOT NULL,
    project_id    uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    issue_code    text NOT NULL REFERENCES review_issue_kinds (code) ON UPDATE CASCADE,
    severity      text NOT NULL DEFAULT 'review',
    -- The numbers behind the flag, so the queue can say "17 minutes for 8.4
    -- miles" instead of "timing looks wrong".
    detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
    raised_at     timestamptz NOT NULL DEFAULT now(),
    cleared_at    timestamptz,
    cleared_by    uuid REFERENCES users (id) ON DELETE SET NULL,
    cleared_reason text,
    UNIQUE (subject_kind, subject_id, issue_code),
    CONSTRAINT review_flag_severity_valid CHECK (
        severity IN ('info', 'review', 'serious'))
);

CREATE INDEX review_flags_open_idx
    ON review_flags (project_id, subject_kind, severity) WHERE cleared_at IS NULL;
CREATE INDEX review_flags_subject_idx ON review_flags (subject_kind, subject_id);
CREATE INDEX review_flags_issue_idx ON review_flags (project_id, issue_code, raised_at);

COMMENT ON TABLE review_flags IS
    'Exceptions a detector raised on a record. Noisy on purpose: a missed bad '
    'load costs more than a second look at a good one. A flag never blocks '
    'billing, it only makes a record visible.';

-- ---------------------------------------------------------------------------
-- What a person decided. One row per record, written on first human action.
-- ---------------------------------------------------------------------------
CREATE TABLE review_items (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_kind  text NOT NULL REFERENCES review_subject_kinds (code) ON UPDATE CASCADE,
    subject_id    uuid NOT NULL,
    project_id    uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    state         text NOT NULL DEFAULT 'pending',
    issue_code    text REFERENCES review_issue_kinds (code) ON UPDATE CASCADE,
    notes         text,

    assigned_to   uuid REFERENCES users (id) ON DELETE SET NULL,
    assigned_at   timestamptz,

    -- When this record first became somebody's problem. The queue prefers the
    -- record's own date when no row exists yet, so age never depends on
    -- somebody having clicked first.
    first_seen_at timestamptz NOT NULL DEFAULT now(),

    reviewed_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    reviewed_by_name text,
    reviewed_at   timestamptz,
    resolved_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    resolved_at   timestamptz,
    resolution    text,

    -- Escalation is a state on the item, not a separate object. It is suggested
    -- by the policy thresholds and chosen by a person.
    escalation_level  text NOT NULL DEFAULT 'none',
    escalated_at      timestamptz,
    escalated_by      uuid REFERENCES users (id) ON DELETE SET NULL,
    escalation_reason text,

    reopened_count integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    UNIQUE (subject_kind, subject_id),
    CONSTRAINT review_item_state_valid CHECK (state IN (
        'pending', 'approved', 'flagged', 'resolved')),
    -- Flagging is a claim about a record, so it has to say what and why.
    CONSTRAINT review_item_flagged_has_a_reason CHECK (
        state <> 'flagged'
        OR (issue_code IS NOT NULL OR COALESCE(btrim(notes), '') <> '')),
    CONSTRAINT review_item_decided_has_an_actor CHECK (
        state = 'pending' OR reviewed_at IS NOT NULL),
    CONSTRAINT review_item_escalation_valid CHECK (
        escalation_level IN ('none', 'supervisor', 'management')),
    CONSTRAINT review_item_escalation_shape CHECK (
        (escalation_level = 'none' AND escalated_at IS NULL)
        OR (escalation_level <> 'none' AND escalated_at IS NOT NULL
            AND COALESCE(btrim(escalation_reason), '') <> ''))
);

CREATE INDEX review_items_state_idx ON review_items (project_id, subject_kind, state);
CREATE INDEX review_items_reviewer_idx ON review_items (reviewed_by);
CREATE INDEX review_items_assigned_idx ON review_items (assigned_to)
    WHERE assigned_to IS NOT NULL;
CREATE INDEX review_items_escalated_idx ON review_items (project_id, escalation_level)
    WHERE escalation_level <> 'none';

SELECT adms_attach_touch('review_items');
SELECT adms_attach_audit('review_items');

COMMENT ON TABLE review_items IS
    'The QC decision on a record: approved, or flagged with an issue somebody '
    'has to fix, then resolved. This is the record that a load was actually '
    'looked at, which is what a closeout package is asserting.';

-- ---------------------------------------------------------------------------
-- What has happened to that decision. Append only.
--
-- The old ticket_reviews row was overwritten on every decision, so a ticket
-- approved, reopened and approved again read exactly like one approved once.
-- Age, escalation and "has this been round the loop before" all need the
-- history, so the history is a table.
-- ---------------------------------------------------------------------------
CREATE TABLE review_events (
    id            bigserial PRIMARY KEY,
    review_item_id uuid NOT NULL REFERENCES review_items (id) ON DELETE CASCADE,
    event         text NOT NULL,
    from_state    text,
    to_state      text,
    issue_code    text,
    note          text,
    detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
    actor_id      uuid REFERENCES users (id) ON DELETE SET NULL,
    actor_name    text,
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT review_event_valid CHECK (event IN (
        'opened', 'decided', 'noted', 'assigned', 'alerted', 'escalated',
        'de_escalated', 'reopened', 'updated'))
);

CREATE INDEX review_events_item_idx ON review_events (review_item_id, occurred_at);

COMMENT ON TABLE review_events IS
    'Everything that happened to one review, in order. This is what makes "how '
    'long has it waited" and "has this been escalated before" answerable.';

-- ---------------------------------------------------------------------------
-- An issue sent to the person who has to act on it.
--
-- In app only. The channel column is here so email becomes an addition rather
-- than a rewrite, not because anything sends email today.
-- ---------------------------------------------------------------------------
CREATE TABLE review_alerts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_item_id uuid NOT NULL REFERENCES review_items (id) ON DELETE CASCADE,
    project_id    uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    channel       text NOT NULL DEFAULT 'in_app',
    to_user_id    uuid REFERENCES users (id) ON DELETE CASCADE,
    to_role_code  text,
    subject       text NOT NULL,
    body          text,
    severity      text NOT NULL DEFAULT 'review',
    sent_by       uuid REFERENCES users (id) ON DELETE SET NULL,
    sent_by_name  text,
    sent_at       timestamptz NOT NULL DEFAULT now(),
    read_at       timestamptz,
    acknowledged_at timestamptz,
    acknowledged_by uuid REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT review_alert_channel_valid CHECK (channel IN ('in_app')),
    CONSTRAINT review_alert_severity_valid CHECK (
        severity IN ('info', 'review', 'serious')),
    CONSTRAINT review_alert_has_a_recipient CHECK (
        to_user_id IS NOT NULL OR to_role_code IS NOT NULL)
);

CREATE INDEX review_alerts_inbox_idx ON review_alerts (to_user_id, read_at)
    WHERE to_user_id IS NOT NULL;
CREATE INDEX review_alerts_item_idx ON review_alerts (review_item_id);

COMMENT ON TABLE review_alerts IS
    'A review issue put in front of the person who has to act on it, so the '
    'queue is not the only place somebody learns there is work waiting.';

-- ---------------------------------------------------------------------------
-- When a project calls something overdue, and when a repeat becomes a pattern.
--
-- Thresholds belong to the declaration. A three week event and a nine month
-- program do not agree on what "waited too long" means.
-- ---------------------------------------------------------------------------
CREATE TABLE project_review_policy (
    project_id          uuid PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
    overdue_days        integer NOT NULL DEFAULT 3,
    repeat_count        integer NOT NULL DEFAULT 3,
    repeat_window_days  integer NOT NULL DEFAULT 7,
    escalate_to_role    text,
    escalate_to_user    uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT review_policy_overdue_sane CHECK (overdue_days BETWEEN 1 AND 90),
    CONSTRAINT review_policy_repeat_sane CHECK (repeat_count BETWEEN 2 AND 50),
    CONSTRAINT review_policy_window_sane CHECK (repeat_window_days BETWEEN 1 AND 180)
);

SELECT adms_attach_touch('project_review_policy');

COMMENT ON TABLE project_review_policy IS
    'Per declaration thresholds for overdue review work and for calling a run '
    'of the same issue a pattern. Defaults live in adms_review_policy so a '
    'project without a row still behaves.';

CREATE OR REPLACE FUNCTION adms_review_policy(p_project uuid)
RETURNS project_review_policy
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (SELECT p FROM project_review_policy p WHERE p.project_id = p_project),
        ROW(p_project, 3, 3, 7, NULL, NULL, now(), now())::project_review_policy);
$$;

COMMENT ON FUNCTION adms_review_policy IS
    'The review thresholds in force for a project, falling back to the '
    'defaults so every caller can assume a row.';

-- ---------------------------------------------------------------------------
-- subject_id has no foreign key, because it points at four different tables.
-- The same trade documents made with entity_type and entity_id. What replaces
-- the constraint is a check on the way in and a cleanup on the way out, so a
-- review can never name a record that is not there.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_review_subject_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_table  text;
    v_exists boolean;
BEGIN
    SELECT subject_table INTO v_table
      FROM review_subject_kinds WHERE code = NEW.subject_kind;

    IF v_table IS NULL THEN
        RAISE EXCEPTION 'There is no review subject kind called %', NEW.subject_kind
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1)', v_table)
       INTO v_exists USING NEW.subject_id;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'No % exists with id %', NEW.subject_kind, NEW.subject_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_review_items_subject
    BEFORE INSERT OR UPDATE OF subject_kind, subject_id ON review_items
    FOR EACH ROW EXECUTE FUNCTION adms_review_subject_check();

CREATE TRIGGER trg_review_flags_subject
    BEFORE INSERT OR UPDATE OF subject_kind, subject_id ON review_flags
    FOR EACH ROW EXECUTE FUNCTION adms_review_subject_check();

CREATE OR REPLACE FUNCTION adms_review_subject_deleted()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM review_flags
     WHERE subject_kind = TG_ARGV[0] AND subject_id = OLD.id;
    DELETE FROM review_items
     WHERE subject_kind = TG_ARGV[0] AND subject_id = OLD.id;
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_tickets_review_cleanup
    AFTER DELETE ON tickets
    FOR EACH ROW EXECUTE FUNCTION adms_review_subject_deleted('ticket');

COMMENT ON FUNCTION adms_review_subject_deleted IS
    'Stands in for the ON DELETE CASCADE a polymorphic key cannot have. One '
    'trigger per subject table, passing its kind.';

-- ---------------------------------------------------------------------------
-- Get the review row for a record, opening it if this is the first time
-- anybody has touched it.
--
-- Every write path goes through here, which is what keeps the lazy row honest:
-- the item exists from the first human action and never before it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_review_item(
    p_kind       text,
    p_subject    uuid,
    p_project    uuid,
    p_actor      uuid DEFAULT NULL,
    p_actor_name text DEFAULT NULL,
    p_first_seen timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_id uuid;
BEGIN
    SELECT id INTO v_id FROM review_items
     WHERE subject_kind = p_kind AND subject_id = p_subject;
    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    INSERT INTO review_items (subject_kind, subject_id, project_id, first_seen_at)
    VALUES (p_kind, p_subject, p_project, COALESCE(p_first_seen, now()))
    ON CONFLICT (subject_kind, subject_id) DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
        SELECT id INTO v_id FROM review_items
         WHERE subject_kind = p_kind AND subject_id = p_subject;
    ELSE
        INSERT INTO review_events (
            review_item_id, event, to_state, actor_id, actor_name)
        VALUES (v_id, 'opened', 'pending', p_actor, p_actor_name);
    END IF;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION adms_review_item IS
    'The review row for one record, created on first use. An untouched record '
    'has no row and still reads as pending from the queue, so seeding 25,000 '
    'tickets does not mean seeding 25,000 reviews.';

-- ---------------------------------------------------------------------------
-- Run the detectors over one ticket.
--
-- Idempotent: a flag that is still true is left alone, one that has become
-- untrue is cleared with a reason, and a new one is raised. That means running
-- this after a correction tells the truth about what the correction fixed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_flag_ticket(p_ticket uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    e            record;
    v_found      text[] := '{}';
    v_density    numeric;
    v_expected   numeric;
    v_minutes    numeric;
    v_count      integer;
BEGIN
    SELECT te.*, t.origin_site_id, t.certification_id,
           t.origin_street, t.origin_latitude, t.origin_longitude,
           t.origin_at AS started_at,
           dt.default_density_lbs_cy,
           tt.requires_photo, tt.kind AS type_kind,
           pec.certified_capacity_cy
      INTO e
      FROM ticket_evaluation te
      JOIN tickets t ON t.id = te.ticket_id
      JOIN ticket_types tt ON tt.id = t.ticket_type_id
      LEFT JOIN debris_types dt ON dt.code = t.debris_type
      LEFT JOIN project_equipment_certifications pec ON pec.id = t.certification_id
     WHERE te.ticket_id = p_ticket;

    IF NOT FOUND OR e.is_void THEN
        RETURN 0;
    END IF;

    -- ---------------------------------------------------------------- timing
    -- A load that left the curb and reached the site faster than the distance
    -- allows is the classic thing a reviewer looks for first.
    IF e.cycle_minutes IS NOT NULL AND e.haul_miles > 0 THEN
        v_minutes := e.cycle_minutes;
        -- 45 mph is generous for a loaded debris truck on residential streets.
        v_expected := (e.haul_miles / 45.0) * 60.0;
        IF v_minutes < v_expected THEN
            v_found := array_append(v_found, 'turnaround_impossible');
        ELSIF v_minutes > GREATEST(v_expected * 6, 240) THEN
            v_found := array_append(v_found, 'turnaround_long');
        END IF;
    END IF;

    -- -------------------------------------------------------------- location
    -- An address typed by hand is the signal Ryan described: the monitor's
    -- offline copy of the street list did not download, so they entered the
    -- last street they remembered.
    IF e.origin_site_id IS NULL
       AND COALESCE(btrim(e.origin_street), '') <> ''
       AND NOT EXISTS (
            SELECT 1 FROM tickets other
             WHERE other.project_id = e.project_id
               AND other.id <> p_ticket
               AND other.deleted_at IS NULL
               AND lower(btrim(other.origin_street)) = lower(btrim(e.origin_street))) THEN
        v_found := array_append(v_found, 'street_seen_once');
    END IF;

    IF e.origin_latitude IS NULL OR e.origin_longitude IS NULL THEN
        v_found := array_append(v_found, 'origin_not_located');
    END IF;

    -- ---------------------------------------------------------------- volume
    IF e.certified_capacity_cy IS NOT NULL
       AND e.billable_cubic_yards > e.certified_capacity_cy THEN
        v_found := array_append(v_found, 'over_certified_capacity');
    END IF;

    IF e.load_call_pct IS NOT NULL AND e.load_call_pct >= 100 THEN
        v_found := array_append(v_found, 'full_load_call');
    END IF;

    -- Weight against volume, using the stream's own density. A number well
    -- outside it usually means the scale ticket belongs to a different load.
    IF e.net_tons > 0 AND e.billable_cubic_yards > 0
       AND e.default_density_lbs_cy IS NOT NULL THEN
        v_density := (e.net_tons * 2000.0) / e.billable_cubic_yards;
        IF v_density > e.default_density_lbs_cy * 2.5
           OR v_density < e.default_density_lbs_cy * 0.25 THEN
            v_found := array_append(v_found, 'density_implausible');
        END IF;
    END IF;

    -- -------------------------------------------------------------- evidence
    IF e.requires_photo AND COALESCE(e.photo_count, 0) = 0 THEN
        v_found := array_append(v_found, 'photo_missing');
    END IF;

    -- Tree work is judged on before, measure and after, so one photo is not
    -- enough even though the type only demands that there is one.
    IF e.type_kind = 'unit_rate' AND COALESCE(e.photo_count, 0) BETWEEN 1 AND 2 THEN
        v_found := array_append(v_found, 'photos_incomplete');
    END IF;

    -- ----------------------------------------------------------- duplication
    -- Not a duplicate ticket number, which the database already refuses. The
    -- same truck at the same site twice inside half an hour, which is what a
    -- second scan at the gate looks like.
    SELECT count(*) INTO v_count
      FROM tickets other
     WHERE other.project_id = e.project_id
       AND other.id <> p_ticket
       AND other.equipment_id = e.equipment_id
       AND other.destination_site_id = e.destination_site_id
       AND other.deleted_at IS NULL AND NOT other.is_void
       AND other.destination_at BETWEEN e.destination_at - interval '30 minutes'
                                    AND e.destination_at + interval '30 minutes';
    IF v_count > 0 THEN
        v_found := array_append(v_found, 'possible_duplicate_load');
    END IF;

    -- The same truck loading in two places at once cannot both be true.
    SELECT count(*) INTO v_count
      FROM tickets other
     WHERE other.project_id = e.project_id
       AND other.id <> p_ticket
       AND other.equipment_id = e.equipment_id
       AND other.deleted_at IS NULL AND NOT other.is_void
       AND other.origin_at < e.destination_at
       AND other.destination_at > e.started_at;
    IF v_count > 0 THEN
        v_found := array_append(v_found, 'truck_overlaps');
    END IF;

    -- ------------------------------------------------------------- write it
    -- Raise what is newly true.
    INSERT INTO review_flags (
        subject_kind, subject_id, project_id, issue_code, severity, detail)
    SELECT 'ticket', p_ticket, e.project_id, k.code, k.severity,
           jsonb_strip_nulls(jsonb_build_object(
               'cycle_minutes', round(e.cycle_minutes, 1),
               'haul_miles', round(e.haul_miles, 2),
               'billable_cubic_yards', e.billable_cubic_yards,
               'certified_capacity_cy', e.certified_capacity_cy,
               'load_call_pct', e.load_call_pct,
               'net_tons', NULLIF(e.net_tons, 0),
               'photo_count', e.photo_count,
               'origin_street', e.origin_street))
      FROM review_issue_kinds k
     WHERE k.code = ANY (v_found) AND k.is_active
    ON CONFLICT (subject_kind, subject_id, issue_code) DO UPDATE
       SET cleared_at = NULL, cleared_by = NULL, cleared_reason = NULL,
           raised_at = now(), detail = EXCLUDED.detail;

    -- Clear what has stopped being true. A correction that fixes a load call
    -- should visibly close the flag it raised.
    UPDATE review_flags
       SET cleared_at = now(),
           cleared_reason = 'No longer true when the ticket was re-checked'
     WHERE subject_kind = 'ticket'
       AND subject_id = p_ticket
       AND cleared_at IS NULL
       AND NOT (issue_code = ANY (v_found));

    RETURN cardinality(v_found);
END;
$$;

COMMENT ON FUNCTION adms_flag_ticket IS
    'Runs every ticket detector over one ticket. Idempotent, and clears a flag '
    'that has stopped being true, so re-running after a correction reports what '
    'the correction actually fixed.';

-- ---------------------------------------------------------------------------
-- Every reviewable record, flattened to one shape.
--
-- This is the seam. A new subject kind is a branch here with the same columns,
-- and review_queue above it never changes. Later migrations drop and recreate
-- this view to add a branch; nothing else has to move.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW review_subjects AS
SELECT
    'ticket'::text            AS subject_kind,
    t.id                      AS subject_id,
    t.project_id,
    -- What a person calls it. For a ticket that is the type kind, so incidents
    -- are filterable without pretending they live in another table.
    o.kind::text              AS record_kind,
    o.ticket_type_code::text  AS record_type_code,
    o.ticket_type_label::text AS record_kind_label,
    o.ticket_number::text     AS title,
    o.ticket_type_label::text AS subtitle,
    COALESCE(t.completed_at, t.destination_at, t.origin_at, t.created_at)
                              AS occurred_at,
    t.created_by              AS party_id,
    o.created_by_name::text   AS party_name,
    o.truck_number::text      AS unit_number,
    o.contractor_name::text   AS contractor_name,
    o.transaction_total::numeric AS value_amount,
    o.billable_cubic_yards::numeric AS quantity,
    'CY'::text                AS quantity_unit,
    o.media_count::integer    AS evidence_count,
    t.status::text            AS record_status
FROM tickets t
JOIN ticket_overview o ON o.id = t.id
WHERE t.deleted_at IS NULL AND NOT t.is_void;

COMMENT ON VIEW review_subjects IS
    'One row per record that can be reviewed, in a single shape across kinds. '
    'Adding a kind is a UNION branch here, not a change to the queue.';

-- ---------------------------------------------------------------------------
-- The queue a reviewer works.
--
-- Driven from the subjects rather than from review_items, so a record nobody
-- has touched still appears, and its age counts from when the work happened
-- rather than from when somebody first clicked on it.
--
-- The repeat signal is deliberately not here. Joining the pattern view for
-- every row would cost a table scan on a project with 25,000 tickets, so the
-- API attaches it to the page it is about to return.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW review_queue AS
SELECT
    s.subject_kind,
    s.subject_id,
    s.project_id,
    s.record_kind,
    s.record_type_code,
    s.record_kind_label,
    s.title,
    s.subtitle,
    s.occurred_at,
    s.party_id,
    s.party_name,
    s.unit_number,
    s.contractor_name,
    s.value_amount,
    s.quantity,
    s.quantity_unit,
    s.evidence_count,
    s.record_status,
    ri.id                             AS review_item_id,
    COALESCE(ri.state, 'pending')     AS review_state,
    ri.issue_code,
    ri.notes                          AS review_notes,
    ri.assigned_to,
    ri.reviewed_by_name,
    ri.reviewed_at,
    ri.resolution,
    COALESCE(ri.escalation_level, 'none') AS escalation_level,
    ri.escalated_at,
    COALESCE(ri.reopened_count, 0)    AS reopened_count,
    COALESCE(ri.first_seen_at, s.occurred_at) AS waiting_since,
    GREATEST(0, EXTRACT(epoch FROM now()
        - COALESCE(ri.first_seen_at, s.occurred_at)) / 86400.0)::numeric(10, 2)
                                      AS waiting_days,
    COALESCE(f.open_flags, 0)         AS open_flags,
    COALESCE(f.worst, 'none')         AS worst_severity,
    f.codes                           AS flag_codes
FROM review_subjects s
LEFT JOIN review_items ri
       ON ri.subject_kind = s.subject_kind AND ri.subject_id = s.subject_id
LEFT JOIN LATERAL (
    SELECT count(*) AS open_flags,
           CASE WHEN count(*) = 0 THEN 'none'
                WHEN bool_or(severity = 'serious') THEN 'serious'
                WHEN bool_or(severity = 'review')  THEN 'review'
                ELSE 'info' END AS worst,
           array_agg(issue_code ORDER BY issue_code) AS codes
      FROM review_flags rf
     WHERE rf.subject_kind = s.subject_kind
       AND rf.subject_id = s.subject_id
       AND rf.cleared_at IS NULL
) f ON true;

COMMENT ON VIEW review_queue IS
    'What needs review, what kind it is, why, how long it has waited, and '
    'whether somebody has already decided or escalated. The screen a data '
    'manager works all day.';

-- ---------------------------------------------------------------------------
-- The ticket queue, unchanged in name and columns.
--
-- The screens and the API tests that already exist read this. Rebuilding it
-- over the spine rather than replacing it is what lets the new surfaces be
-- built without a flag day.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW ticket_review_queue AS
SELECT
    t.id                    AS ticket_id,
    t.project_id,
    t.ticket_number,
    tt.code                 AS ticket_type_code,
    tt.label                AS ticket_type_label,
    t.status,
    t.completed_at,
    t.debris_type,
    t.load_call_pct,
    o.billable_cubic_yards,
    o.transaction_total,
    o.created_by_name       AS monitor_name,
    t.created_by            AS monitor_id,
    e.unit_number,
    c.name                  AS contractor_name,
    COALESCE(r.state, 'pending')  AS review_state,
    r.issue_code,
    r.notes                 AS review_notes,
    r.reviewed_by_name,
    r.reviewed_at,
    o.media_count,
    COALESCE(f.open_flags, 0)     AS open_flags,
    COALESCE(f.worst, 'none')     AS worst_severity,
    f.codes                 AS flag_codes
FROM tickets t
JOIN ticket_types tt      ON tt.id = t.ticket_type_id
JOIN ticket_overview o    ON o.id = t.id
LEFT JOIN equipment e     ON e.id = t.equipment_id
LEFT JOIN contractors c   ON c.id = t.contractor_id
LEFT JOIN review_items r  ON r.subject_kind = 'ticket' AND r.subject_id = t.id
LEFT JOIN LATERAL (
    SELECT count(*) AS open_flags,
           CASE WHEN count(*) = 0 THEN 'none'
                WHEN bool_or(severity = 'serious') THEN 'serious'
                WHEN bool_or(severity = 'review')  THEN 'review'
                ELSE 'info' END AS worst,
           array_agg(issue_code ORDER BY issue_code) AS codes
      FROM review_flags rf
     WHERE rf.subject_kind = 'ticket' AND rf.subject_id = t.id
       AND rf.cleared_at IS NULL
) f ON true
WHERE t.deleted_at IS NULL AND NOT t.is_void;

COMMENT ON VIEW ticket_review_queue IS
    'One row per live ticket with its QC state and open flags. Kept as a named '
    'view over the generic spine so the ticket screens did not have to move on '
    'the same day the spine did.';

-- The ticket flag catalog, as it was, now a window onto the shared one.
CREATE OR REPLACE VIEW ticket_flag_kinds AS
SELECT code, label, description, severity, domain, is_active, sort_order
  FROM review_issue_kinds
 WHERE 'ticket' = ANY (subject_kinds);

COMMENT ON VIEW ticket_flag_kinds IS
    'The checks that apply to tickets. A view now, because certification checks '
    'share the catalog and have no business in a ticket filter.';

CREATE OR REPLACE VIEW monitor_accuracy AS
SELECT
    q.project_id,
    q.monitor_id,
    q.monitor_name,
    count(*)                                              AS tickets,
    count(*) FILTER (WHERE q.review_state = 'approved')   AS approved,
    count(*) FILTER (WHERE q.review_state = 'flagged')    AS flagged,
    count(*) FILTER (WHERE q.review_state = 'pending')    AS unreviewed,
    count(*) FILTER (WHERE q.open_flags > 0)              AS with_open_flags,
    round(
        100.0 * count(*) FILTER (WHERE q.review_state = 'approved')
        / NULLIF(count(*) FILTER (WHERE q.review_state <> 'pending'), 0), 1)
                                                          AS approval_rate,
    COALESCE(sum(q.billable_cubic_yards), 0)              AS cubic_yards
FROM ticket_review_queue q
WHERE q.monitor_id IS NOT NULL
GROUP BY q.project_id, q.monitor_id, q.monitor_name;

COMMENT ON VIEW monitor_accuracy IS
    'Most accurate and least accurate, rather than most active. Approval rate '
    'counts only reviewed tickets, so a monitor is never penalised for work '
    'nobody has looked at yet.';

-- ---------------------------------------------------------------------------
-- The same problem, again.
--
-- "The system should eventually help identify repeated issues rather than
--  treating every issue as an isolated event." One row per issue code per
-- party, with the counts that turn a hunch into a number.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW review_issue_patterns AS
SELECT
    f.project_id,
    f.subject_kind,
    f.issue_code,
    k.label                AS issue_label,
    k.severity,
    k.domain,
    s.party_id,
    s.party_name,
    s.contractor_name,
    count(*)                                                     AS occurrences,
    count(*) FILTER (WHERE f.cleared_at IS NULL)                 AS open_occurrences,
    count(*) FILTER (WHERE f.raised_at > now() - interval '7 days')  AS last_7_days,
    count(*) FILTER (WHERE f.raised_at > now() - interval '30 days') AS last_30_days,
    min(f.raised_at)       AS first_raised,
    max(f.raised_at)       AS last_raised
FROM review_flags f
JOIN review_issue_kinds k ON k.code = f.issue_code
JOIN review_subjects s ON s.subject_kind = f.subject_kind
                      AND s.subject_id = f.subject_id
WHERE f.raised_at > now() - interval '90 days'
GROUP BY f.project_id, f.subject_kind, f.issue_code, k.label, k.severity,
         k.domain, s.party_id, s.party_name, s.contractor_name;

COMMENT ON VIEW review_issue_patterns IS
    'A run of the same issue from the same monitor or contractor, counted over '
    'rolling windows. Four times this week is a different decision from once.';

-- ---------------------------------------------------------------------------
-- What should probably be escalated, and why.
--
-- Suggested, never automatic. The requirement is that the system helps spot a
-- pattern, not that it takes the decision away from the person who understands
-- the program.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_review_escalation_candidates(p_project uuid)
RETURNS TABLE (
    subject_kind   text,
    subject_id     uuid,
    title          text,
    reason_code    text,
    reason         text,
    detail         jsonb
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    pol project_review_policy;
BEGIN
    pol := adms_review_policy(p_project);

    -- Waited too long while carrying something a person still has to answer.
    RETURN QUERY
    SELECT q.subject_kind, q.subject_id, q.title,
           'waited_too_long'::text,
           format('Waiting %s days, over the %s day threshold for this project',
                  round(q.waiting_days), pol.overdue_days),
           jsonb_build_object('waiting_days', q.waiting_days,
                              'overdue_days', pol.overdue_days,
                              'state', q.review_state,
                              'worst_severity', q.worst_severity)
      FROM review_queue q
     WHERE q.project_id = p_project
       AND q.escalation_level = 'none'
       AND q.review_state IN ('pending', 'flagged')
       AND (q.open_flags > 0 OR q.review_state = 'flagged')
       AND q.waiting_days > pol.overdue_days;

    -- The same issue, from the same party, enough times to be a pattern rather
    -- than an accident.
    RETURN QUERY
    SELECT q.subject_kind, q.subject_id, q.title,
           'repeating_issue'::text,
           format('%s is the %sth %s from %s in %s days',
                  q.title, p.last_30_days, p.issue_label,
                  COALESCE(p.party_name, 'this source'), pol.repeat_window_days),
           jsonb_build_object('issue_code', p.issue_code,
                              'occurrences', p.last_30_days,
                              'open', p.open_occurrences,
                              'party_name', p.party_name,
                              'repeat_count', pol.repeat_count)
      FROM review_issue_patterns p
      JOIN review_flags f ON f.project_id = p.project_id
                         AND f.issue_code = p.issue_code
                         AND f.cleared_at IS NULL
      JOIN review_queue q ON q.subject_kind = f.subject_kind
                         AND q.subject_id = f.subject_id
     WHERE p.project_id = p_project
       AND p.party_id IS NOT NULL
       AND q.party_id = p.party_id
       AND q.escalation_level = 'none'
       AND q.review_state <> 'approved'
       AND CASE WHEN pol.repeat_window_days <= 7 THEN p.last_7_days
                ELSE p.last_30_days END >= pol.repeat_count;
END;
$$;

COMMENT ON FUNCTION adms_review_escalation_candidates IS
    'Items that meet this project''s escalation thresholds, with the reason '
    'spelled out. Suggestion only. A person escalates.';

-- ---------------------------------------------------------------------------
-- Support for the street check, which asks whether any other ticket on the
-- project has ever recorded the same street.
-- ---------------------------------------------------------------------------
CREATE INDEX tickets_origin_street_idx
    ON tickets (project_id, lower(btrim(origin_street)))
    WHERE origin_street IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- The checks themselves. Wording matters here: this text is what a reviewer
-- reads at nine in the morning, so it says what was seen, not what rule fired.
-- ---------------------------------------------------------------------------
INSERT INTO review_issue_kinds (code, label, description, severity, domain, subject_kinds, sort_order) VALUES
    ('turnaround_impossible', 'Too fast for the distance',
     'The trip took less time than the haul distance allows, even at highway speed.',
     'serious', 'timing', ARRAY['ticket'], 10),
    ('turnaround_long', 'Unusually long trip',
     'The trip took far longer than the distance explains. Often a stage saved late rather than a real delay.',
     'review', 'timing', ARRAY['ticket'], 20),
    ('truck_overlaps', 'Truck in two places at once',
     'This unit was loading somewhere else while this ticket was open. One of the two is wrong.',
     'serious', 'duplication', ARRAY['ticket'], 30),
    ('possible_duplicate_load', 'Possible duplicate load',
     'The same unit reached the same site within half an hour. Usually a second scan at the gate.',
     'review', 'duplication', ARRAY['ticket'], 40),
    ('over_certified_capacity', 'More than the unit is certified to carry',
     'Billable volume exceeds the certified capacity, which should not be arithmetically possible.',
     'serious', 'volume', ARRAY['ticket'], 50),
    ('density_implausible', 'Weight does not match the volume',
     'Net weight against volume is far outside the normal density for this debris stream. Often a scale ticket from another load.',
     'review', 'volume', ARRAY['ticket'], 60),
    ('full_load_call', 'Called at one hundred percent',
     'A full load call is legitimate and worth a glance, particularly in a run of them from one monitor.',
     'info', 'volume', ARRAY['ticket'], 70),
    ('photo_missing', 'No photo',
     'This ticket type requires a photograph and none was attached.',
     'serious', 'evidence', ARRAY['ticket'], 80),
    ('photos_incomplete', 'Not enough photos for tree work',
     'Unit rate work is judged on before, measure and after. Fewer than three means the reviewer cannot verify it.',
     'review', 'evidence', ARRAY['ticket'], 90),
    ('origin_not_located', 'No location recorded',
     'The loading point has no coordinates, so nothing can confirm where this load came from.',
     'review', 'location', ARRAY['ticket'], 100),
    ('street_seen_once', 'Street recorded only here',
     'No other ticket on this project names this street. Often the address was typed by hand because the street list had not downloaded.',
     'review', 'location', ARRAY['ticket'], 110),
    ('no_rule_matched', 'Nothing billed it',
     'This ticket completed and no rule produced a transaction, so it is monitored work that cannot reach an invoice. Either no rule covers the ticket type or none of the conditions held.',
     'serious', 'billing', ARRAY['ticket'], 120)
ON CONFLICT (code) DO UPDATE
    SET label = EXCLUDED.label, description = EXCLUDED.description,
        severity = EXCLUDED.severity, domain = EXCLUDED.domain,
        subject_kinds = EXCLUDED.subject_kinds,
        sort_order = EXCLUDED.sort_order;
