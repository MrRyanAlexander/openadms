-- ===========================================================================
-- 0026  Required evidence, and the reviewer's read of a record
--
-- "The system must understand that evidence requirements are dependent on the
--  record/ticket type and project rules."
--
-- The reviewer's questions, in order: what was supposed to be collected, what
-- was required, what was actually collected, does the evidence support the
-- record. The first two are already declared. `ticket_types.field_schema`
-- names every photograph a type asks for, with a label and the stage it
-- belongs to, and the field app builds its form from exactly that. Nothing was
-- reading it back on the review side, so a missing photograph looked the same
-- as a photograph nobody ever wanted.
--
-- This makes the comparison a view rather than something a screen works out,
-- which is what lets the ticket detector and the review surfaces agree.
-- ===========================================================================

CREATE OR REPLACE VIEW ticket_evidence AS
SELECT
    t.id                        AS ticket_id,
    t.project_id,
    tt.code                     AS ticket_type_code,
    COALESCE(req.required_slots, '{}'::text[])   AS required_slots,
    COALESCE(req.slot_detail, '[]'::jsonb)       AS required_detail,
    COALESCE(got.slots, '{}'::text[])            AS collected_slots,
    COALESCE(miss.missing, '{}'::text[])         AS missing_slots,
    COALESCE(got.media_count, 0)                 AS media_count,
    COALESCE(got.unslotted, 0)                   AS unslotted_count,
    cardinality(COALESCE(miss.missing, '{}'::text[])) = 0 AS evidence_complete
FROM tickets t
JOIN ticket_types tt ON tt.id = t.ticket_type_id
LEFT JOIN LATERAL (
    -- Every photograph this type requires, in the order the field app asks
    -- for them.
    SELECT array_agg(f ->> 'key' ORDER BY ord) AS required_slots,
           jsonb_agg(jsonb_build_object(
               'slot', f ->> 'key',
               'label', f ->> 'label',
               'stage', f ->> 'stage',
               'help', f ->> 'help') ORDER BY ord) AS slot_detail
      FROM jsonb_array_elements(tt.field_schema) WITH ORDINALITY AS x(f, ord)
     WHERE f ->> 'type' = 'photo'
       AND COALESCE((f ->> 'required')::boolean, false)
) req ON true
LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT tm.slot) FILTER (WHERE tm.slot IS NOT NULL) AS slots,
           count(*) AS media_count,
           count(*) FILTER (WHERE tm.slot IS NULL) AS unslotted
      FROM ticket_media tm
     WHERE tm.ticket_id = t.id AND tm.deleted_at IS NULL
) got ON true
LEFT JOIN LATERAL (
    SELECT COALESCE(array_agg(r ORDER BY r), '{}'::text[]) AS missing
      FROM unnest(COALESCE(req.required_slots, '{}'::text[])) AS r
     WHERE NOT (r = ANY (COALESCE(got.slots, '{}'::text[])))
) miss ON true
WHERE t.deleted_at IS NULL;

COMMENT ON VIEW ticket_evidence IS
    'What a ticket type requires photographed against what came back from the '
    'field. Driven by field_schema, so the answer to "was this supposed to be '
    'here" is the same declaration the field app was built from.';

-- ---------------------------------------------------------------------------
-- The photo checks stop counting and start reading the declaration.
--
-- `photos_incomplete` used to mean "a unit rate ticket with one or two
-- photographs", which is a guess at the before, measure and after convention.
-- Now it means a photograph the type actually asked for did not come back, and
-- the flag can say which one.
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
    v_missing    text[];
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

    IF e.net_tons > 0 AND e.billable_cubic_yards > 0
       AND e.default_density_lbs_cy IS NOT NULL THEN
        v_density := (e.net_tons * 2000.0) / e.billable_cubic_yards;
        IF v_density > e.default_density_lbs_cy * 2.5
           OR v_density < e.default_density_lbs_cy * 0.25 THEN
            v_found := array_append(v_found, 'density_implausible');
        END IF;
    END IF;

    -- -------------------------------------------------------------- evidence
    SELECT missing_slots INTO v_missing
      FROM ticket_evidence WHERE ticket_id = p_ticket;

    IF e.requires_photo AND COALESCE(e.photo_count, 0) = 0 THEN
        v_found := array_append(v_found, 'photo_missing');
    ELSIF v_missing IS NOT NULL AND cardinality(v_missing) > 0 THEN
        -- Something came back, but not everything the type asked for.
        v_found := array_append(v_found, 'photos_incomplete');
    END IF;

    -- ----------------------------------------------------------- duplication
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
               'missing_photos', to_jsonb(NULLIF(v_missing, '{}'::text[])),
               'origin_street', e.origin_street))
      FROM review_issue_kinds k
     WHERE k.code = ANY (v_found) AND k.is_active
    ON CONFLICT (subject_kind, subject_id, issue_code) DO UPDATE
       SET cleared_at = NULL, cleared_by = NULL, cleared_reason = NULL,
           raised_at = now(), detail = EXCLUDED.detail;

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

UPDATE review_issue_kinds
   SET label = 'A required photograph is missing',
       description = 'Something came back from the field, but not every '
                     'photograph this ticket type asks for. The flag names '
                     'which one is absent.'
 WHERE code = 'photos_incomplete';

-- ---------------------------------------------------------------------------
-- Required against collected, for any reviewable record.
--
-- The review screen asks one question of every kind of record, so it reads one
-- view rather than knowing which table to look in.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW review_evidence AS
SELECT 'ticket'::text AS subject_kind, ticket_id AS subject_id, project_id,
       required_slots, collected_slots, missing_slots,
       media_count, evidence_complete
  FROM ticket_evidence
UNION ALL
SELECT 'certification'::text, certification_id, project_id,
       required_slots, collected_slots, missing_slots,
       media_count, evidence_complete
  FROM certification_evidence;

COMMENT ON VIEW review_evidence IS
    'What was required and what was collected, for every kind of reviewable '
    'record. One read, so the review screen never has to know which table a '
    'photograph lives in.';
