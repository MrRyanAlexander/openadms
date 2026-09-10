-- ===========================================================================
-- 0019  Equipment certification, per project, with a supersede chain
--
-- A truck is certified under a declaration, not once for all time. The same
-- trailer working two counties is measured twice and carries two capacities,
-- and a certification is never copied from one project to another. Capacity
-- multiplied by the monitor's load call is the billable volume on every load
-- ticket, so this table sits directly under the money.
--
-- Corrections are the reason the chain exists. A tare read as 3 instead of 1
-- can add forty cubic yards to every load that trailer hauled for a week, and
-- the fix has to reach the tickets that were already priced. That is what
-- `method = 'correction'` means here: it inherits the applies_from of the row
-- it replaces, so the tickets that used the wrong number resolve to the right
-- one and reprocess. A recertification is the opposite and applies forward
-- only, because the truck really did change on that date.
-- ===========================================================================

CREATE TABLE project_equipment_certifications (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    equipment_id          uuid NOT NULL REFERENCES equipment (id) ON DELETE RESTRICT,

    certification_number  text,
    certified_capacity_cy numeric(10, 2) NOT NULL,
    tare_weight_lbs       numeric(10, 2),

    -- How the number was arrived at, and from when it counts.
    method                text NOT NULL DEFAULT 'physical',
    measured_on           date NOT NULL DEFAULT current_date,
    applies_from          date NOT NULL,
    expires_on            date,

    measured_by           uuid REFERENCES users (id) ON DELETE SET NULL,
    measured_by_name      text,
    document_id           uuid REFERENCES documents (id) ON DELETE SET NULL,

    status                text NOT NULL DEFAULT 'active',
    supersedes_id         uuid REFERENCES project_equipment_certifications (id)
                          ON DELETE RESTRICT,
    superseded_at         timestamptz,
    superseded_reason     text,

    notes                 text,
    created_by            uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pec_capacity_positive CHECK (certified_capacity_cy > 0),
    CONSTRAINT pec_tare_positive CHECK (
        tare_weight_lbs IS NULL OR tare_weight_lbs >= 0),
    CONSTRAINT pec_method_valid CHECK (method IN (
        'physical', 'manufacturer', 'recertification', 'correction')),
    CONSTRAINT pec_status_valid CHECK (status IN (
        'active', 'superseded', 'revoked')),
    CONSTRAINT pec_superseded_shape CHECK (
        (status = 'active' AND superseded_at IS NULL)
        OR (status <> 'active' AND superseded_at IS NOT NULL)),
    CONSTRAINT pec_expiry_after_measurement CHECK (
        expires_on IS NULL OR expires_on >= measured_on),
    CONSTRAINT pec_not_self_superseding CHECK (
        supersedes_id IS NULL OR supersedes_id <> id)
);

-- One live certification per truck per project. Everything else in the chain
-- is superseded or revoked, which is what makes "the current capacity" a fact
-- rather than a query with a tie-break.
CREATE UNIQUE INDEX pec_one_active_per_project_equipment
    ON project_equipment_certifications (project_id, equipment_id)
    WHERE status = 'active';

CREATE INDEX pec_equipment_idx ON project_equipment_certifications (equipment_id);
CREATE INDEX pec_project_idx   ON project_equipment_certifications (project_id, status);
CREATE INDEX pec_expiry_idx    ON project_equipment_certifications (expires_on)
    WHERE expires_on IS NOT NULL AND status = 'active';

SELECT adms_attach_touch('project_equipment_certifications');
SELECT adms_attach_audit('project_equipment_certifications');

COMMENT ON TABLE project_equipment_certifications IS
    'Certified capacity for one piece of equipment on one project. Never '
    'copied between projects: a truck working two declarations is measured '
    'twice. Superseding a row rather than editing it is what lets a correction '
    'reach tickets that were already priced.';
COMMENT ON COLUMN project_equipment_certifications.applies_from IS
    'The service date this capacity counts from. A correction inherits the '
    'applies_from of the row it replaces so it reaches back over the same '
    'tickets; a recertification starts at its own measurement date.';
COMMENT ON COLUMN project_equipment_certifications.method IS
    'physical and manufacturer are original measurements. recertification is a '
    'new measurement that counts forward. correction says the previous number '
    'was wrong, and repricing follows.';

-- ---------------------------------------------------------------------------
-- applies_from is derived, not typed. A correction inherits; everything else
-- starts at its own measurement.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_certification_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_prev project_equipment_certifications%ROWTYPE;
BEGIN
    IF NEW.supersedes_id IS NOT NULL THEN
        SELECT * INTO v_prev FROM project_equipment_certifications
         WHERE id = NEW.supersedes_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Certification % does not exist', NEW.supersedes_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF v_prev.project_id <> NEW.project_id
           OR v_prev.equipment_id <> NEW.equipment_id THEN
            RAISE EXCEPTION
                'A certification can only supersede one for the same equipment '
                'on the same project'
                USING ERRCODE = 'check_violation';
        END IF;

        -- A correction says the previous number was wrong, so it stands where
        -- that number stood. Anything sent by the caller is overruled here on
        -- purpose: a correction that started later would leave the tickets it
        -- was written to fix still resolving to the wrong capacity.
        IF NEW.method = 'correction' THEN
            NEW.applies_from := v_prev.applies_from;
        END IF;
    END IF;

    NEW.applies_from := COALESCE(NEW.applies_from, NEW.measured_on);

    -- Close the previous row here rather than in an AFTER trigger. The partial
    -- unique index below allows one active certification per truck per project
    -- and is checked as this row goes in, so the handover has to happen first.
    IF NEW.supersedes_id IS NOT NULL AND NEW.status = 'active' THEN
        UPDATE project_equipment_certifications
           SET status = 'superseded',
               superseded_at = now(),
               superseded_reason = COALESCE(superseded_reason, NEW.notes)
         WHERE id = NEW.supersedes_id
           AND status = 'active';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_certification_before_insert
    BEFORE INSERT ON project_equipment_certifications
    FOR EACH ROW EXECUTE FUNCTION adms_certification_before_insert();

-- ---------------------------------------------------------------------------
-- Which certification governs a ticket completed on a given date.
--
-- The latest applies_from at or before the service date wins, and a correction
-- written later beats the row it corrected because it carries the same
-- applies_from and a later created_at. Revoked rows never govern anything.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_certification_in_force(
    p_project   uuid,
    p_equipment uuid,
    p_on        date
) RETURNS project_equipment_certifications
LANGUAGE sql
STABLE
AS $$
    SELECT *
      FROM project_equipment_certifications
     WHERE project_id = p_project
       AND equipment_id = p_equipment
       AND status <> 'revoked'
       AND applies_from <= COALESCE(p_on, current_date)
     ORDER BY applies_from DESC, created_at DESC
     LIMIT 1;
$$;

COMMENT ON FUNCTION adms_certification_in_force IS
    'The certification that governs work done on a date. Used when a ticket is '
    'created and again when it is reprocessed, so a correction reaches the '
    'tickets the wrong number already priced.';

-- ---------------------------------------------------------------------------
-- The current certification per project and truck, for lists and expiry sweeps.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW project_equipment_current AS
SELECT
    pec.id                AS certification_id,
    pec.project_id,
    p.project_code,
    pec.equipment_id,
    e.unit_number,
    e.equipment_type,
    e.contractor_id,
    c.name                AS contractor_name,
    pec.certification_number,
    pec.certified_capacity_cy,
    pec.tare_weight_lbs,
    pec.method,
    pec.measured_on,
    pec.applies_from,
    pec.expires_on,
    pec.measured_by_name,
    pec.document_id,
    (pec.expires_on IS NOT NULL AND pec.expires_on < current_date) AS is_expired,
    CASE WHEN pec.expires_on IS NULL THEN NULL
         ELSE pec.expires_on - current_date END AS days_to_expiry,
    (SELECT count(*) FROM project_equipment_certifications older
      WHERE older.project_id = pec.project_id
        AND older.equipment_id = pec.equipment_id
        AND older.id <> pec.id) AS revision_count
FROM project_equipment_certifications pec
JOIN equipment e   ON e.id = pec.equipment_id
JOIN projects p    ON p.id = pec.project_id
LEFT JOIN contractors c ON c.id = e.contractor_id
WHERE pec.status = 'active';

COMMENT ON VIEW project_equipment_current IS
    'The live certification for every truck on every project, with expiry. '
    'Answers "how many trucks are certified and working this project right now" '
    'without a query builder.';

-- ---------------------------------------------------------------------------
-- Tickets remember which certification priced them.
--
-- certified_capacity_cy already existed as a snapshot on the ticket, which is
-- the right instinct: the evidence has to survive a later measurement. What was
-- missing is the pointer back to the row that produced it, so a correction can
-- find every ticket it touched instead of guessing from the truck alone.
-- ---------------------------------------------------------------------------
ALTER TABLE tickets
    ADD COLUMN certification_id uuid
        REFERENCES project_equipment_certifications (id) ON DELETE RESTRICT;

CREATE INDEX tickets_certification_idx ON tickets (certification_id)
    WHERE certification_id IS NOT NULL;

COMMENT ON COLUMN tickets.certification_id IS
    'The certification in force when this ticket was created. Reprocessing '
    're-resolves it, so a corrected measurement reprices the work it touched.';

-- ---------------------------------------------------------------------------
-- Stamp the certification and its capacity onto a ticket as it is created.
-- The field app sends a truck, never a certification: which one applies is the
-- database's answer, not something a phone should have to know.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_stamp_ticket_certification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_cert project_equipment_certifications%ROWTYPE;
    v_on   date;
BEGIN
    IF NEW.equipment_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_on := COALESCE(NEW.completed_at, NEW.destination_at, NEW.origin_at,
                     NEW.created_at, now())::date;
    v_cert := adms_certification_in_force(NEW.project_id, NEW.equipment_id, v_on);

    IF v_cert.id IS NOT NULL THEN
        NEW.certification_id := v_cert.id;
        NEW.certified_capacity_cy :=
            COALESCE(NEW.certified_capacity_cy, v_cert.certified_capacity_cy);
        NEW.tare_weight_lbs :=
            COALESCE(NEW.tare_weight_lbs, v_cert.tare_weight_lbs);
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_stamp_certification
    BEFORE INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION adms_stamp_ticket_certification();

COMMENT ON FUNCTION adms_stamp_ticket_certification IS
    'Resolves the certification a new ticket falls under and snapshots its '
    'capacity. Never overwrites a value the field explicitly sent.';
