-- =============================================================================
-- Open ADMS :: 0015 :: Contacts
--
-- A client is not one person. There is someone running the project, someone in
-- finance who wants the invoice, and someone who signs the permit. One
-- `primary_contact` text column held exactly one of them and lost the rest.
--
-- Keyed on entity_type + entity_id like audit_events and documents, so the
-- same table serves clients, contractors and site operators. This is now the
-- house pattern: any child record that attaches to more than one kind of
-- parent inherits this shape rather than adding a table.
-- =============================================================================

CREATE TABLE contacts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type   text NOT NULL,
    entity_id     uuid NOT NULL,
    first_name    text,
    last_name     text,
    full_name     text NOT NULL GENERATED ALWAYS AS (
                      btrim(regexp_replace(
                          coalesce(first_name, '') || ' ' || coalesce(last_name, ''),
                          '\s+', ' ', 'g'))
                  ) STORED,
    title         text,
    email         citext,
    phone         text,
    mobile        text,
    contact_role  text NOT NULL DEFAULT 'primary',
    is_primary    boolean NOT NULL DEFAULT false,
    notes         text,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    deleted_at    timestamptz,
    CONSTRAINT contacts_entity_valid CHECK (entity_type IN (
        'clients', 'contractors', 'disposal_sites', 'projects')),
    CONSTRAINT contacts_role_valid CHECK (contact_role IN (
        'primary', 'finance', 'permits', 'operations', 'field', 'other')),
    CONSTRAINT contacts_name_present CHECK (
        coalesce(btrim(first_name), '') <> '' OR coalesce(btrim(last_name), '') <> '')
);

CREATE INDEX contacts_entity_idx ON contacts (entity_type, entity_id)
    WHERE deleted_at IS NULL;
CREATE INDEX contacts_email_idx ON contacts (email)
    WHERE deleted_at IS NULL AND email IS NOT NULL;
-- One parent, one primary. Anything else is an argument waiting to happen.
CREATE UNIQUE INDEX contacts_one_primary_per_entity
    ON contacts (entity_type, entity_id)
    WHERE is_primary AND deleted_at IS NULL;
SELECT adms_attach_touch('contacts');
SELECT adms_attach_audit('contacts');

-- ---------------------------------------------------------------------------
-- clients.primary_contact stays populated for one release so every screen and
-- report that reads it keeps working. The database writes it; nothing else
-- should. It drops once the last reader is gone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_sync_client_primary_contact()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_entity uuid := COALESCE(NEW.entity_id, OLD.entity_id);
    v_type   text := COALESCE(NEW.entity_type, OLD.entity_type);
BEGIN
    IF v_type <> 'clients' THEN
        RETURN NULL;
    END IF;

    UPDATE clients c
       SET primary_contact = (
               SELECT ct.full_name
                 FROM contacts ct
                WHERE ct.entity_type = 'clients'
                  AND ct.entity_id = v_entity
                  AND ct.is_primary
                  AND ct.deleted_at IS NULL
                LIMIT 1)
     WHERE c.id = v_entity;

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_contacts_sync_client
    AFTER INSERT OR UPDATE OR DELETE ON contacts
    FOR EACH ROW EXECUTE FUNCTION adms_sync_client_primary_contact();

COMMENT ON COLUMN clients.primary_contact IS
    'Derived from the primary row in contacts. Kept for one release so older '
    'readers keep working; write through contacts instead.';

-- ---------------------------------------------------------------------------
-- Anything already carrying a bare contact name becomes a real row, so no
-- client loses the person it knew about.
-- ---------------------------------------------------------------------------
INSERT INTO contacts (entity_type, entity_id, first_name, last_name,
                      email, phone, contact_role, is_primary)
SELECT 'clients',
       c.id,
       split_part(btrim(c.primary_contact), ' ', 1),
       NULLIF(btrim(substr(btrim(c.primary_contact),
                    length(split_part(btrim(c.primary_contact), ' ', 1)) + 1)), ''),
       c.contact_email,
       c.contact_phone,
       'primary',
       true
  FROM clients c
 WHERE c.deleted_at IS NULL
   AND coalesce(btrim(c.primary_contact), '') <> '';

INSERT INTO contacts (entity_type, entity_id, first_name, last_name,
                      email, phone, contact_role, is_primary)
SELECT 'contractors',
       c.id,
       split_part(btrim(c.primary_contact), ' ', 1),
       NULLIF(btrim(substr(btrim(c.primary_contact),
                    length(split_part(btrim(c.primary_contact), ' ', 1)) + 1)), ''),
       c.contact_email,
       c.contact_phone,
       'primary',
       true
  FROM contractors c
 WHERE c.deleted_at IS NULL
   AND coalesce(btrim(c.primary_contact), '') <> '';
