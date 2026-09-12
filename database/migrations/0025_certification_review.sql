-- ===========================================================================
-- 0025  Certification evidence and review
--
-- "Certifications should be treated as reviewable records just like tickets
--  and incidents."
--
-- Two halves. The evidence a certification carries, which is the photographs
-- the requirement names: truck front, truck side, truck interior, the
-- certification placard, and the measurement shots. And the detector that
-- decides which certifications a reviewer has to look at, which raises into
-- the same review_flags table the ticket detector uses.
--
-- The first check is the important one. Every certification written before
-- this sprint is a capacity somebody typed, with no measurements behind it,
-- and `capacity_not_measured` says so out loud rather than letting those rows
-- pass as if they had been measured. That is the honest answer to how the
-- current numbers were produced, and it puts each of them on somebody's list.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The photographs. Same rule as everywhere else in this system: the file lives
-- in Box or SharePoint, this holds the link.
-- ---------------------------------------------------------------------------
CREATE TABLE certification_media (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    certification_id uuid NOT NULL
                    REFERENCES project_equipment_certifications (id) ON DELETE CASCADE,
    -- Which of the required shots this is. The set a certification needs comes
    -- from its container type, so what is required is data rather than a list
    -- hardcoded in a screen.
    slot            text NOT NULL DEFAULT 'other',
    -- A measurement photo can name the section it evidences, so a reviewer
    -- looking at a dimension can see the tape against it.
    section_id      uuid REFERENCES certification_sections (id) ON DELETE SET NULL,
    description     text,
    storage_url     text NOT NULL,
    thumbnail_url   text,
    content_type    text,
    byte_size       bigint,
    checksum_sha256 text,
    width_px        integer,
    height_px       integer,
    latitude        numeric(9, 6),
    longitude       numeric(9, 6),
    captured_at     timestamptz,
    uploaded_by     uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,
    CONSTRAINT certification_media_slot_valid CHECK (slot IN (
        'front', 'rear', 'side', 'interior', 'placard', 'measurement',
        'paper_form', 'other')),
    CONSTRAINT certification_media_lat_range CHECK (
        latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT certification_media_lon_range CHECK (
        longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE INDEX certification_media_cert_idx
    ON certification_media (certification_id) WHERE deleted_at IS NULL;
CREATE INDEX certification_media_section_idx
    ON certification_media (section_id) WHERE section_id IS NOT NULL;

SELECT adms_attach_touch('certification_media');

COMMENT ON TABLE certification_media IS
    'Photographs backing a certification. The requirement names four: truck '
    'front, truck side, truck interior and the placard, plus the measurement '
    'shots. Which ones are required comes from the container type.';

-- ---------------------------------------------------------------------------
-- What was required against what was collected.
--
-- A reviewer should not have to hold the required set in their head. This says
-- it, and names what is missing, which is the difference between "no photo in
-- that position" and "nobody knows whether one was supposed to be there".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW certification_evidence AS
SELECT
    c.id                        AS certification_id,
    c.project_id,
    -- A certification with no worksheet still owes the four photographs, so
    -- the required set falls back rather than coming out empty and reading as
    -- though nothing was ever asked for.
    COALESCE(ct.required_photo_slots,
             ARRAY['front', 'side', 'interior', 'placard'])
                                AS required_slots,
    COALESCE(got.slots, '{}'::text[]) AS collected_slots,
    COALESCE(miss.missing, '{}'::text[]) AS missing_slots,
    COALESCE(got.media_count, 0) AS media_count,
    cardinality(COALESCE(miss.missing, '{}'::text[])) = 0 AS evidence_complete
FROM project_equipment_certifications c
LEFT JOIN certification_measurements m ON m.certification_id = c.id
LEFT JOIN container_types ct ON ct.code = m.container_type_code
LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT cm.slot) AS slots, count(*) AS media_count
      FROM certification_media cm
     WHERE cm.certification_id = c.id AND cm.deleted_at IS NULL
) got ON true
LEFT JOIN LATERAL (
    SELECT COALESCE(array_agg(r ORDER BY r), '{}'::text[]) AS missing
      FROM unnest(COALESCE(ct.required_photo_slots,
                           ARRAY['front', 'side', 'interior', 'placard'])) AS r
     WHERE NOT (r = ANY (COALESCE(got.slots, '{}'::text[])))
) miss ON true;

COMMENT ON VIEW certification_evidence IS
    'Required photographs against collected ones for a certification. A gap is '
    'named rather than left as an absence.';

-- ---------------------------------------------------------------------------
-- What a reviewer is asked to look at on a certification.
-- ---------------------------------------------------------------------------
INSERT INTO review_issue_kinds (code, label, description, severity, domain, subject_kinds, sort_order) VALUES
    ('capacity_not_measured', 'Capacity with no measurements behind it',
     'This capacity was typed rather than measured. Nothing in the record says how the number was reached, and every load this unit hauls is priced on it.',
     'serious', 'measurement', ARRAY['certification'], 200),
    ('manual_volume_used', 'Volume worked out off the system',
     'A section was entered as a finished cubic inch figure rather than as dimensions, so nothing here can check the arithmetic.',
     'review', 'measurement', ARRAY['certification'], 210),
    ('capacity_outside_type_range', 'Capacity unusual for this kind of equipment',
     'The measured volume is outside the normal band for this container type. Unusual equipment is real, so this is worth a look rather than an error.',
     'review', 'measurement', ARRAY['certification'], 220),
    ('deduction_share_high', 'Deductions remove a lot of the container',
     'More than a quarter of the measured volume is being deducted. Usually right on a trailer full of intrusions, and worth confirming.',
     'review', 'measurement', ARRAY['certification'], 230),
    ('dimension_implausible', 'A dimension outside what fits on a road',
     'An interior measurement is wider, taller or longer than road legal equipment. Often feet entered where inches were asked for.',
     'serious', 'measurement', ARRAY['certification'], 240),
    ('photo_slot_missing', 'A required photograph is missing',
     'This container type requires a photograph that was not collected. The placard and the interior are what a reviewer checks the number against.',
     'serious', 'evidence', ARRAY['certification'], 250),
    ('placard_mismatch', 'Certification number does not match the placard',
     'The number on this certification is not the placard code recorded against the unit. One of the two belongs to another truck.',
     'review', 'compliance', ARRAY['certification'], 260),
    ('capacity_moved_materially', 'Capacity moved by more than ten percent',
     'This measurement changes the capacity enough to move the money on every load it reaches. Check it against the tickets it reprices.',
     'serious', 'measurement', ARRAY['certification'], 270),
    ('measured_long_before_use', 'Measured long before it counts from',
     'The measurement date is well before the date this capacity applies from. Often a certification carried over from another declaration, which is not allowed.',
     'review', 'compliance', ARRAY['certification'], 280)
ON CONFLICT (code) DO UPDATE
    SET label = EXCLUDED.label, description = EXCLUDED.description,
        severity = EXCLUDED.severity, domain = EXCLUDED.domain,
        subject_kinds = EXCLUDED.subject_kinds,
        sort_order = EXCLUDED.sort_order;

-- Certifications are reviewable from here on.
UPDATE review_subject_kinds SET is_active = true WHERE code = 'certification';

-- ---------------------------------------------------------------------------
-- Run the detectors over one certification.
--
-- Same contract as adms_flag_ticket: idempotent, clears what has stopped being
-- true, and returns how many checks fired.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_flag_certification(p_certification uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    c          record;
    v_found    text[] := '{}';
    v_detail   jsonb := '{}'::jsonb;
    v_missing  text[];
    v_bad      text;
    v_prev_cap numeric;
    v_change   numeric;
    s          record;
    k          record;
    v_limit    numeric;
BEGIN
    SELECT pec.*, e.placard_code, e.unit_number,
           m.id AS measurement_id, m.total_cubic_yards, m.base_cubic_inches,
           m.deduction_cubic_inches, m.container_type_code,
           ct.typical_min_cy, ct.typical_max_cy, ct.label AS container_label
      INTO c
      FROM project_equipment_certifications pec
      JOIN equipment e ON e.id = pec.equipment_id
      LEFT JOIN certification_measurements m ON m.certification_id = pec.id
      LEFT JOIN container_types ct ON ct.code = m.container_type_code
     WHERE pec.id = p_certification;

    IF NOT FOUND OR c.status IN ('draft', 'superseded', 'revoked') THEN
        RETURN 0;
    END IF;

    -- ----------------------------------------------------------- measurement
    IF c.measurement_id IS NULL THEN
        v_found := array_append(v_found, 'capacity_not_measured');
        v_detail := v_detail || jsonb_build_object(
            'certified_capacity_cy', c.certified_capacity_cy);
    ELSE
        IF EXISTS (SELECT 1 FROM certification_sections
                    WHERE measurement_id = c.measurement_id
                      AND shape_code = 'manual_volume') THEN
            v_found := array_append(v_found, 'manual_volume_used');
        END IF;

        IF c.typical_min_cy IS NOT NULL AND c.typical_max_cy IS NOT NULL
           AND (c.total_cubic_yards < c.typical_min_cy
                OR c.total_cubic_yards > c.typical_max_cy) THEN
            v_found := array_append(v_found, 'capacity_outside_type_range');
            v_detail := v_detail || jsonb_build_object(
                'measured_cy', c.total_cubic_yards,
                'container_label', c.container_label,
                'typical_min_cy', c.typical_min_cy,
                'typical_max_cy', c.typical_max_cy);
        END IF;

        IF c.base_cubic_inches > 0
           AND c.deduction_cubic_inches > c.base_cubic_inches * 0.25 THEN
            v_found := array_append(v_found, 'deduction_share_high');
            v_detail := v_detail || jsonb_build_object(
                'deducted_share_pct',
                round(100.0 * c.deduction_cubic_inches / c.base_cubic_inches, 1));
        END IF;

        -- Road legal interior bounds, in inches. A trailer wider than 102 in
        -- or longer than 53 ft is usually feet typed into an inches box.
        FOR s IN SELECT cs.label, cs.dimensions FROM certification_sections cs
                  WHERE cs.measurement_id = c.measurement_id LOOP
            FOR k IN SELECT key, value FROM jsonb_each_text(s.dimensions) LOOP
                v_limit := CASE
                    WHEN k.key LIKE '%width%'  THEN 102
                    WHEN k.key LIKE '%height%' THEN 144
                    WHEN k.key LIKE '%length%' THEN 636
                    WHEN k.key LIKE '%diameter%' THEN 144
                    ELSE NULL END;
                IF v_limit IS NOT NULL
                   AND NULLIF(btrim(k.value), '')::numeric > v_limit THEN
                    v_bad := format('%s %s of %s inches', s.label, k.key, k.value);
                    v_found := array_append(v_found, 'dimension_implausible');
                    v_detail := v_detail || jsonb_build_object(
                        'dimension', v_bad, 'limit_inches', v_limit);
                END IF;
            END LOOP;
        END LOOP;
    END IF;

    -- ------------------------------------------------------------- evidence
    -- A certification with no worksheet at all is already saying, loudly,
    -- that it was never really measured. Adding a second flag for the photos
    -- it also never had is noise on top of the same fact.
    SELECT missing_slots INTO v_missing
      FROM certification_evidence WHERE certification_id = p_certification;
    IF c.measurement_id IS NOT NULL
       AND v_missing IS NOT NULL AND cardinality(v_missing) > 0 THEN
        v_found := array_append(v_found, 'photo_slot_missing');
        v_detail := v_detail || jsonb_build_object('missing_slots', v_missing);
    END IF;

    -- ------------------------------------------------------------ compliance
    IF COALESCE(btrim(c.certification_number), '') <> ''
       AND COALESCE(btrim(c.placard_code), '') <> ''
       AND lower(btrim(c.certification_number)) <> lower(btrim(c.placard_code)) THEN
        v_found := array_append(v_found, 'placard_mismatch');
        v_detail := v_detail || jsonb_build_object(
            'certification_number', c.certification_number,
            'placard_code', c.placard_code);
    END IF;

    IF c.measured_on < c.applies_from - 90 THEN
        v_found := array_append(v_found, 'measured_long_before_use');
        v_detail := v_detail || jsonb_build_object(
            'measured_on', c.measured_on, 'applies_from', c.applies_from,
            'days_before', c.applies_from - c.measured_on);
    END IF;

    IF c.supersedes_id IS NOT NULL AND c.certified_capacity_cy IS NOT NULL THEN
        SELECT certified_capacity_cy INTO v_prev_cap
          FROM project_equipment_certifications WHERE id = c.supersedes_id;
        IF v_prev_cap IS NOT NULL AND v_prev_cap > 0 THEN
            v_change := abs(c.certified_capacity_cy - v_prev_cap) / v_prev_cap;
            IF v_change > 0.10 THEN
                v_found := array_append(v_found, 'capacity_moved_materially');
                v_detail := v_detail || jsonb_build_object(
                    'was_cy', v_prev_cap, 'is_cy', c.certified_capacity_cy,
                    'change_pct', round(100.0 * v_change, 1),
                    'tickets_priced', (
                        SELECT count(*) FROM tickets t
                         WHERE t.certification_id = c.supersedes_id
                           AND t.deleted_at IS NULL AND NOT t.is_void));
            END IF;
        END IF;
    END IF;

    -- ------------------------------------------------------------- write it
    INSERT INTO review_flags (
        subject_kind, subject_id, project_id, issue_code, severity, detail)
    SELECT 'certification', p_certification, c.project_id, k2.code, k2.severity,
           jsonb_strip_nulls(v_detail)
      FROM review_issue_kinds k2
     WHERE k2.code = ANY (v_found) AND k2.is_active
    ON CONFLICT (subject_kind, subject_id, issue_code) DO UPDATE
       SET cleared_at = NULL, cleared_by = NULL, cleared_reason = NULL,
           raised_at = now(), detail = EXCLUDED.detail;

    UPDATE review_flags
       SET cleared_at = now(),
           cleared_reason = 'No longer true when the certification was re-checked'
     WHERE subject_kind = 'certification'
       AND subject_id = p_certification
       AND cleared_at IS NULL
       AND NOT (issue_code = ANY (v_found));

    RETURN cardinality(v_found);
END;
$$;

COMMENT ON FUNCTION adms_flag_certification IS
    'Runs every certification check over one certification. The first one it '
    'can raise is that the capacity has no measurements behind it, which is '
    'true of every certification written before this sprint.';

-- ---------------------------------------------------------------------------
-- Certifications join the queue.
--
-- Column for column identical to the ticket branch, which is what lets this be
-- a replace rather than a rebuild of everything standing on it.
--
-- Drafts stay out: a worksheet in progress is not waiting on a reviewer.
-- Superseded and revoked rows stay out because their moment has passed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW review_subjects AS
SELECT
    'ticket'::text            AS subject_kind,
    t.id                      AS subject_id,
    t.project_id,
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
WHERE t.deleted_at IS NULL AND NOT t.is_void

UNION ALL

SELECT
    'certification'::text     AS subject_kind,
    c.id                      AS subject_id,
    c.project_id,
    'certification'::text     AS record_kind,
    COALESCE(m.container_type_code, 'uncategorised')::text AS record_type_code,
    COALESCE(ct.label, 'Certification')::text AS record_kind_label,
    e.unit_number::text       AS title,
    (COALESCE(ct.label, 'Capacity')
     || COALESCE(' at ' || c.certified_capacity_cy::text || ' CY', ''))::text
                              AS subtitle,
    COALESCE(c.submitted_at, c.created_at) AS occurred_at,
    COALESCE(m.measured_by, c.created_by) AS party_id,
    COALESCE(m.measured_by_name, c.measured_by_name)::text AS party_name,
    e.unit_number::text       AS unit_number,
    ctr.name::text            AS contractor_name,
    NULL::numeric             AS value_amount,
    c.certified_capacity_cy::numeric AS quantity,
    'CY'::text                AS quantity_unit,
    COALESCE(med.media_count, 0)::integer AS evidence_count,
    c.status::text            AS record_status
FROM project_equipment_certifications c
JOIN equipment e ON e.id = c.equipment_id
LEFT JOIN contractors ctr ON ctr.id = e.contractor_id
LEFT JOIN certification_measurements m ON m.certification_id = c.id
LEFT JOIN container_types ct ON ct.code = m.container_type_code
LEFT JOIN LATERAL (
    SELECT count(*) AS media_count FROM certification_media cm
     WHERE cm.certification_id = c.id AND cm.deleted_at IS NULL
) med ON true
WHERE c.status IN ('submitted', 'active', 'rejected');

COMMENT ON VIEW review_subjects IS
    'One row per record that can be reviewed, in a single shape across kinds. '
    'Adding a kind is a UNION branch here, not a change to the queue.';

-- A certification that goes away takes its review with it, the same as a
-- ticket. Polymorphic keys have no cascade, so this stands in for one.
CREATE TRIGGER trg_certifications_review_cleanup
    AFTER DELETE ON project_equipment_certifications
    FOR EACH ROW EXECUTE FUNCTION adms_review_subject_deleted('certification');
