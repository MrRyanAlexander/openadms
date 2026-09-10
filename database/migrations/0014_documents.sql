-- =============================================================================
-- Open ADMS :: 0014 :: The document registry
--
-- Contracts, contractor rate sheets, HHW and asbestos certificates, disposal
-- site permits, insurance certificates and W-9s all live in Box or SharePoint
-- and always will. This is a link registry, not a file store: the system tracks
-- what exists, whether anyone has verified it, when it expires, and who it was
-- requested from, then packages the list at closeout. It never takes custody of
-- the file.
--
-- Keyed on entity_type + entity_id, the same convention audit_events already
-- uses, so a document can hang off any parent without another table.
-- =============================================================================

CREATE TABLE document_kinds (
    code            text PRIMARY KEY,
    label           text NOT NULL,
    description     text,
    -- Which parents this kind sensibly belongs to. Advisory: it drives the
    -- picker, and nothing refuses a document because of it.
    applies_to      text[] NOT NULL DEFAULT '{}',
    expects_expiry  boolean NOT NULL DEFAULT false,
    is_active       boolean NOT NULL DEFAULT true,
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN document_kinds.expects_expiry IS
    'True where a missing expiry date is a gap worth flagging: certificates, '
    'permits and insurance. False for a contract, which does not expire so '
    'much as end.';

-- ---------------------------------------------------------------------------
-- The registry itself
-- ---------------------------------------------------------------------------
CREATE TABLE documents (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type         text NOT NULL,
    entity_id           uuid NOT NULL,
    -- Set where the document belongs to one declaration rather than to the
    -- firm in general: a site permit for this project, not the site's standing
    -- paperwork. Null means it travels with the parent record everywhere.
    project_id          uuid REFERENCES projects (id) ON DELETE CASCADE,
    kind_code           text NOT NULL REFERENCES document_kinds (code) ON UPDATE CASCADE,
    title               text NOT NULL,
    url                 text NOT NULL,
    provider            text NOT NULL DEFAULT 'other',
    effective_from      date,
    expires_on          date,
    verification_status text NOT NULL DEFAULT 'pending',
    verified_by         uuid REFERENCES users (id) ON DELETE SET NULL,
    verified_at         timestamptz,
    -- The pending clock. Who was asked, and when, is what the alerts feed nags
    -- on, and what answers "how long has this been outstanding".
    requested_from      text,
    requested_on        date,
    notes               text,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by          uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz,
    CONSTRAINT documents_entity_valid CHECK (entity_type IN (
        'clients', 'contractors', 'contracts', 'disposal_sites', 'projects',
        'project_sites', 'equipment', 'users')),
    CONSTRAINT documents_provider_valid CHECK (provider IN (
        'box', 'sharepoint', 'gdrive', 'dropbox', 'other')),
    CONSTRAINT documents_status_valid CHECK (verification_status IN (
        'verified', 'pending', 'expired', 'not_required')),
    CONSTRAINT documents_requested_from_valid CHECK (
        requested_from IS NULL OR requested_from IN ('client', 'pm', 'contractor')),
    -- A link that is not a link is the one thing this table cannot hold.
    CONSTRAINT documents_url_shape CHECK (url ~* '^https?://[^[:space:]]+$'),
    CONSTRAINT documents_dates_ordered CHECK (
        expires_on IS NULL OR effective_from IS NULL OR expires_on >= effective_from),
    CONSTRAINT documents_verified_is_attributed CHECK (
        verification_status <> 'verified'
        OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);

CREATE INDEX documents_entity_idx ON documents (entity_type, entity_id)
    WHERE deleted_at IS NULL;
CREATE INDEX documents_project_idx ON documents (project_id)
    WHERE deleted_at IS NULL AND project_id IS NOT NULL;
CREATE INDEX documents_kind_idx ON documents (kind_code) WHERE deleted_at IS NULL;
-- The expiry sweep runs often and only ever cares about live, dated rows.
CREATE INDEX documents_expiry_idx ON documents (expires_on)
    WHERE deleted_at IS NULL AND expires_on IS NOT NULL;
CREATE INDEX documents_pending_idx ON documents (requested_on)
    WHERE deleted_at IS NULL AND verification_status = 'pending';
SELECT adms_attach_touch('documents');
SELECT adms_attach_audit('documents');

COMMENT ON TABLE documents IS
    'Link registry for everything the closeout package has to account for. '
    'Holds the URL, never the file.';

-- ---------------------------------------------------------------------------
-- What is expiring, and what has been outstanding too long. One view so the
-- alerts feed and the expiry sweep cannot drift apart.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW document_watch AS
SELECT d.id,
       d.entity_type,
       d.entity_id,
       d.project_id,
       d.kind_code,
       k.label                             AS kind_label,
       d.title,
       d.url,
       d.provider,
       d.verification_status,
       d.expires_on,
       d.requested_from,
       d.requested_on,
       (d.expires_on - current_date)       AS days_until_expiry,
       (current_date - d.requested_on)     AS days_since_request,
       CASE
           WHEN d.expires_on IS NOT NULL AND d.expires_on < current_date
               THEN 'expired'
           WHEN d.expires_on IS NOT NULL AND d.expires_on <= current_date + 30
               THEN 'expiring'
           WHEN d.verification_status = 'pending' AND d.requested_on IS NOT NULL
                AND d.requested_on < current_date - 14
               THEN 'overdue'
           WHEN d.verification_status = 'pending'
               THEN 'awaiting'
           ELSE 'ok'
       END                                 AS watch_state
  FROM documents d
  JOIN document_kinds k ON k.code = d.kind_code
 WHERE d.deleted_at IS NULL;
