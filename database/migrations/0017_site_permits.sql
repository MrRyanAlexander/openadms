-- =============================================================================
-- Open ADMS :: 0017 :: Permit verification, per project
--
-- A permit is declaration-specific. The same landfill can be permitted for one
-- project and pending on the next, so verification state belongs on the project
-- link and not on the site record. disposal_sites keeps the site's standing
-- permit metadata; this carries what is true for this declaration.
--
-- A permit is treated exactly like a contract: it cannot be marked verified
-- without a document record carrying a real URL, and that is enforced here
-- rather than by the interface. Pending deliberately needs no document, which
-- is the entire point of the pending state.
--
-- This is NOT a gate. Operations do not stop because a project manager is slow
-- with paperwork. Readiness surfaces the pending permit, the alerts feed nags
-- about it, and ticket creation is never refused on it.
-- =============================================================================

ALTER TABLE project_sites
    ADD COLUMN permit_status         text NOT NULL DEFAULT 'pending',
    ADD COLUMN permit_document_id    uuid REFERENCES documents (id) ON DELETE SET NULL,
    ADD COLUMN permit_requested_from text,
    ADD COLUMN permit_requested_on   date,
    ADD COLUMN permit_verified_by    uuid REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN permit_verified_on    date,
    ADD COLUMN permit_notes          text;

ALTER TABLE project_sites
    ADD CONSTRAINT project_sites_permit_status_valid CHECK (
        permit_status IN ('verified', 'pending', 'not_required')),
    ADD CONSTRAINT project_sites_permit_requested_from_valid CHECK (
        permit_requested_from IS NULL
        OR permit_requested_from IN ('client', 'pm', 'contractor')),
    -- The constraint that makes a permit behave like a contract.
    ADD CONSTRAINT project_sites_verified_permit_has_a_document CHECK (
        permit_status <> 'verified' OR permit_document_id IS NOT NULL);

CREATE INDEX project_sites_permit_status_idx
    ON project_sites (project_id, permit_status);

COMMENT ON COLUMN project_sites.permit_status IS
    'Verification state for this declaration. Never a gate on ticket creation.';
COMMENT ON COLUMN project_sites.permit_document_id IS
    'The permit in Box or SharePoint. Required before verified, and the record '
    'future permit fields hang off, so the permit can grow without a migration.';

-- The document a permit points at has to actually be a permit, and it has to
-- still exist. The URL itself is already guaranteed by documents_url_shape.
CREATE OR REPLACE FUNCTION adms_check_permit_document()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_kind text;
BEGIN
    IF NEW.permit_document_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT kind_code INTO v_kind
      FROM documents
     WHERE id = NEW.permit_document_id AND deleted_at IS NULL;

    IF v_kind IS NULL THEN
        RAISE EXCEPTION 'The permit document does not exist or has been removed'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_kind <> 'permit' THEN
        RAISE EXCEPTION
            'Document % is a %, not a permit', NEW.permit_document_id, v_kind
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_sites_permit_document
    BEFORE INSERT OR UPDATE ON project_sites
    FOR EACH ROW EXECUTE FUNCTION adms_check_permit_document();

-- ---------------------------------------------------------------------------
-- What the permit tracker and the alerts tile both read.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW project_permit_watch AS
SELECT ps.project_id,
       ps.id                            AS project_site_id,
       ps.site_id,
       s.name                           AS site_name,
       s.site_code,
       s.site_kind,
       ps.permit_status,
       ps.permit_document_id,
       d.url                            AS permit_url,
       d.expires_on                     AS permit_expires_on,
       ps.permit_requested_from,
       ps.permit_requested_on,
       (current_date - ps.permit_requested_on) AS days_since_request,
       ps.permit_verified_on,
       ps.permit_notes,
       CASE
           WHEN ps.permit_status = 'verified'
                AND d.expires_on IS NOT NULL AND d.expires_on < current_date
               THEN 'expired'
           WHEN ps.permit_status = 'verified'     THEN 'ok'
           WHEN ps.permit_status = 'not_required' THEN 'ok'
           WHEN ps.permit_requested_on IS NULL    THEN 'not_requested'
           WHEN ps.permit_requested_on < current_date - 14 THEN 'overdue'
           ELSE 'awaiting'
       END                              AS watch_state
  FROM project_sites ps
  JOIN disposal_sites s ON s.id = ps.site_id
  LEFT JOIN documents d ON d.id = ps.permit_document_id AND d.deleted_at IS NULL
 WHERE ps.is_active;
