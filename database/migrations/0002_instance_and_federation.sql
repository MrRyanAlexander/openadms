-- =============================================================================
-- Open ADMS :: 0002 :: Instance identity + peer federation
-- Carries the OmniTodo cryptographic sharing engine forward: every deployment
-- is a sovereign instance with its own key pair, and records carry a
-- visibility flag plus an allow-list of peer instance keys.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- This deployment. Exactly one row, enforced by a partial unique index.
-- ---------------------------------------------------------------------------
CREATE TABLE instance (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    singleton           boolean NOT NULL DEFAULT true,
    instance_key        text NOT NULL UNIQUE,
    display_name        text NOT NULL,
    organization        text,
    public_key_pem      text,
    private_key_pem     text,
    registry_opt_in     boolean NOT NULL DEFAULT false,
    registry_url        text,
    settings            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT instance_singleton_flag CHECK (singleton)
);

CREATE UNIQUE INDEX instance_only_one ON instance ((singleton));
SELECT adms_attach_touch('instance');

COMMENT ON COLUMN instance.instance_key IS
    'INSTANCE_UNIQUE_KEY - 64 hex chars from crypto.randomBytes(32). Peers '
    'reference this deployment by this value.';
COMMENT ON COLUMN instance.private_key_pem IS
    'Ed25519 private key used to sign outbound peer requests. Never exposed '
    'over the API.';

-- ---------------------------------------------------------------------------
-- Known peer deployments we may read from or grant reads to.
-- ---------------------------------------------------------------------------
CREATE TABLE peer_instances (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_key        text NOT NULL UNIQUE,
    display_name        text NOT NULL,
    base_url            text,
    public_key_pem      text,
    trust_state         text NOT NULL DEFAULT 'pending',
    last_seen_at        timestamptz,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT peer_trust_state_valid
        CHECK (trust_state IN ('pending', 'trusted', 'revoked'))
);

SELECT adms_attach_touch('peer_instances');
CREATE INDEX peer_instances_trust_idx ON peer_instances (trust_state);

-- ---------------------------------------------------------------------------
-- Replay protection for signed peer reads.
-- ---------------------------------------------------------------------------
CREATE TABLE peer_request_nonces (
    nonce        text PRIMARY KEY,
    instance_key text NOT NULL,
    seen_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX peer_request_nonces_seen_idx ON peer_request_nonces (seen_at);

-- ---------------------------------------------------------------------------
-- Shared vocabulary for visibility. Used by projects and tickets.
-- ---------------------------------------------------------------------------
CREATE TABLE visibility_flags (
    code         text PRIMARY KEY,
    label        text NOT NULL,
    description  text NOT NULL,
    sort_order   integer NOT NULL DEFAULT 0
);

INSERT INTO visibility_flags (code, label, description, sort_order) VALUES
    ('private',    'Private',
     'Readable only by authenticated users of this instance.', 10),
    ('restricted', 'Restricted',
     'Readable by this instance plus peer instances listed in allowed_viewers, '
     'which must present a valid X-Signature.', 20),
    ('public',     'Public',
     'Readable by any caller with no signature check.', 30);
