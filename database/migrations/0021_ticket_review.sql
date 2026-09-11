-- ===========================================================================
-- 0021  Ticket review
--
-- The dashboard answers "what did we produce", which is the question a project
-- manager asks. The data manager's question is "what looks wrong", and until
-- now nothing answered it. In Ryan's words, the 9am job is:
--
--   "we are hunting for the issues: times that don't make sense, duplicate
--    tickets ... location data that doesn't match up. Address details the
--    monitor typed in manually"
--
--   "I spend most of my day auditing tickets for accuracy, especially photos
--    for tree work ... and then marking each ticket QC approved or if there is
--    some issue"
--
-- Two tables. `ticket_flags` is what the system noticed, raised by a detector
-- that runs over a ticket. `ticket_reviews` is what a person decided, which is
-- the part that actually closes a ticket out. A flag is never a verdict: the
-- detectors are deliberately noisy in the direction of showing too much,
-- because a missed bad load costs more than a second look at a good one.
--
-- Nothing here blocks anything. A flagged ticket still bills; it is simply
-- visible. That matches the standing decision on permits: operations do not
-- stop because paperwork is behind.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- What the detectors can raise. A new check is a seed row plus a branch in
-- adms_flag_ticket, never a schema change.
-- ---------------------------------------------------------------------------
CREATE TABLE ticket_flag_kinds (
    code          text PRIMARY KEY,
    label         text NOT NULL,
    description   text NOT NULL,
    severity      text NOT NULL DEFAULT 'review',
    -- What a reviewer is being asked to look at, so the queue can group by the
    -- kind of work rather than by the individual check.
    domain        text NOT NULL DEFAULT 'data',
    is_active     boolean NOT NULL DEFAULT true,
    sort_order    integer NOT NULL DEFAULT 0,
    CONSTRAINT flag_kind_severity_valid CHECK (severity IN ('info', 'review', 'serious')),
    CONSTRAINT flag_kind_domain_valid CHECK (domain IN (
        'timing', 'location', 'volume', 'evidence', 'duplication', 'data'))
);

COMMENT ON TABLE ticket_flag_kinds IS
    'The checks the detector can raise. Adding one is a seed row and a branch, '
    'so a new exception a program teaches us does not need a migration.';

-- ---------------------------------------------------------------------------
-- What the detector noticed on one ticket.
-- ---------------------------------------------------------------------------
CREATE TABLE ticket_flags (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id     uuid NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    project_id    uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    flag_code     text NOT NULL REFERENCES ticket_flag_kinds (code) ON UPDATE CASCADE,
    severity      text NOT NULL DEFAULT 'review',
    -- The numbers behind the flag, so the queue can say "17 minutes for 8.4
    -- miles" instead of "timing looks wrong".
    detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
    raised_at     timestamptz NOT NULL DEFAULT now(),
    cleared_at    timestamptz,
    cleared_by    uuid REFERENCES users (id) ON DELETE SET NULL,
    cleared_reason text,
    UNIQUE (ticket_id, flag_code),
    CONSTRAINT ticket_flag_severity_valid CHECK (
        severity IN ('info', 'review', 'serious'))
);

CREATE INDEX ticket_flags_open_idx ON ticket_flags (project_id, severity)
    WHERE cleared_at IS NULL;
CREATE INDEX ticket_flags_ticket_idx ON ticket_flags (ticket_id);

COMMENT ON TABLE ticket_flags IS
    'Exceptions the detector raised on a ticket. Noisy on purpose: a missed bad '
    'load costs more than a second look at a good one. A flag never blocks '
    'billing, it only makes a ticket visible.';

-- ---------------------------------------------------------------------------
-- What a person decided. One row per ticket, the current state of the audit.
-- ---------------------------------------------------------------------------
CREATE TABLE ticket_reviews (
    ticket_id     uuid PRIMARY KEY REFERENCES tickets (id) ON DELETE CASCADE,
    project_id    uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    state         text NOT NULL DEFAULT 'pending',
    issue_code    text REFERENCES ticket_flag_kinds (code) ON UPDATE CASCADE,
    notes         text,
    reviewed_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    reviewed_by_name text,
    reviewed_at   timestamptz,
    resolved_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    resolved_at   timestamptz,
    resolution    text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ticket_review_state_valid CHECK (state IN (
        'pending', 'approved', 'flagged', 'resolved')),
    -- Flagging is a claim about a ticket, so it has to say what and why.
    CONSTRAINT ticket_review_flagged_has_a_reason CHECK (
        state <> 'flagged'
        OR (issue_code IS NOT NULL OR COALESCE(btrim(notes), '') <> '')),
    CONSTRAINT ticket_review_decided_has_an_actor CHECK (
        state = 'pending' OR reviewed_at IS NOT NULL)
);

CREATE INDEX ticket_reviews_state_idx ON ticket_reviews (project_id, state);
CREATE INDEX ticket_reviews_reviewer_idx ON ticket_reviews (reviewed_by);

SELECT adms_attach_touch('ticket_reviews');
SELECT adms_attach_audit('ticket_reviews');

COMMENT ON TABLE ticket_reviews IS
    'The QC decision on a ticket: approved, or flagged with an issue somebody '
    'has to fix, then resolved. This is the record that a load was actually '
    'looked at, which is what a closeout package is asserting.';

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
    INSERT INTO ticket_flags (ticket_id, project_id, flag_code, severity, detail)
    SELECT p_ticket, e.project_id, k.code, k.severity,
           jsonb_strip_nulls(jsonb_build_object(
               'cycle_minutes', round(e.cycle_minutes, 1),
               'haul_miles', round(e.haul_miles, 2),
               'billable_cubic_yards', e.billable_cubic_yards,
               'certified_capacity_cy', e.certified_capacity_cy,
               'load_call_pct', e.load_call_pct,
               'net_tons', NULLIF(e.net_tons, 0),
               'photo_count', e.photo_count,
               'origin_street', e.origin_street))
      FROM ticket_flag_kinds k
     WHERE k.code = ANY (v_found) AND k.is_active
    ON CONFLICT (ticket_id, flag_code) DO UPDATE
       SET cleared_at = NULL, cleared_by = NULL, cleared_reason = NULL,
           raised_at = now(), detail = EXCLUDED.detail;

    -- Clear what has stopped being true. A correction that fixes a load call
    -- should visibly close the flag it raised.
    UPDATE ticket_flags
       SET cleared_at = now(),
           cleared_reason = 'No longer true when the ticket was re-checked'
     WHERE ticket_id = p_ticket
       AND cleared_at IS NULL
       AND NOT (flag_code = ANY (v_found));

    RETURN cardinality(v_found);
END;
$$;

COMMENT ON FUNCTION adms_flag_ticket IS
    'Runs every detector over one ticket. Idempotent, and clears a flag that '
    'has stopped being true, so re-running after a correction reports what the '
    'correction actually fixed.';

-- ---------------------------------------------------------------------------
-- The queue a data manager works, and the monitor scoreboard behind it.
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
LEFT JOIN ticket_reviews r ON r.ticket_id = t.id
LEFT JOIN LATERAL (
    SELECT count(*) AS open_flags,
           CASE WHEN count(*) = 0 THEN 'none'
                WHEN bool_or(severity = 'serious') THEN 'serious'
                WHEN bool_or(severity = 'review')  THEN 'review'
                ELSE 'info' END AS worst,
           array_agg(flag_code ORDER BY flag_code) AS codes
      FROM ticket_flags tf
     WHERE tf.ticket_id = t.id AND tf.cleared_at IS NULL
) f ON true
WHERE t.deleted_at IS NULL AND NOT t.is_void;

COMMENT ON VIEW ticket_review_queue IS
    'One row per live ticket with its QC state and open flags. This is the '
    'screen a data manager works all day, which the product did not have.';

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
INSERT INTO ticket_flag_kinds (code, label, description, severity, domain, sort_order) VALUES
    ('turnaround_impossible', 'Too fast for the distance',
     'The trip took less time than the haul distance allows, even at highway speed.',
     'serious', 'timing', 10),
    ('turnaround_long', 'Unusually long trip',
     'The trip took far longer than the distance explains. Often a stage saved late rather than a real delay.',
     'review', 'timing', 20),
    ('truck_overlaps', 'Truck in two places at once',
     'This unit was loading somewhere else while this ticket was open. One of the two is wrong.',
     'serious', 'duplication', 30),
    ('possible_duplicate_load', 'Possible duplicate load',
     'The same unit reached the same site within half an hour. Usually a second scan at the gate.',
     'review', 'duplication', 40),
    ('over_certified_capacity', 'More than the unit is certified to carry',
     'Billable volume exceeds the certified capacity, which should not be arithmetically possible.',
     'serious', 'volume', 50),
    ('density_implausible', 'Weight does not match the volume',
     'Net weight against volume is far outside the normal density for this debris stream. Often a scale ticket from another load.',
     'review', 'volume', 60),
    ('full_load_call', 'Called at one hundred percent',
     'A full load call is legitimate and worth a glance, particularly in a run of them from one monitor.',
     'info', 'volume', 70),
    ('photo_missing', 'No photo',
     'This ticket type requires a photograph and none was attached.',
     'serious', 'evidence', 80),
    ('photos_incomplete', 'Not enough photos for tree work',
     'Unit rate work is judged on before, measure and after. Fewer than three means the reviewer cannot verify it.',
     'review', 'evidence', 90),
    ('origin_not_located', 'No location recorded',
     'The loading point has no coordinates, so nothing can confirm where this load came from.',
     'review', 'location', 100),
    ('street_seen_once', 'Street recorded only here',
     'No other ticket on this project names this street. Often the address was typed by hand because the street list had not downloaded.',
     'review', 'location', 110)
ON CONFLICT (code) DO UPDATE
    SET label = EXCLUDED.label, description = EXCLUDED.description,
        severity = EXCLUDED.severity, domain = EXCLUDED.domain,
        sort_order = EXCLUDED.sort_order;
