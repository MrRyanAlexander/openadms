-- =============================================================================
-- Open ADMS :: 0003 :: Users, roles, permissions
-- Roles are cumulative by rank: Monitor < Manager < Analyst < Admin.
-- A role grants every permission of every role at or below its rank, so new
-- roles slot in by rank without rewriting the grant table.
-- =============================================================================

CREATE TABLE roles (
    code         text PRIMARY KEY,
    label        text NOT NULL,
    rank         integer NOT NULL UNIQUE,
    description  text,
    is_system    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN roles.rank IS
    'Cumulative inheritance ordinal. A user holding rank N holds every '
    'permission attached to any role of rank <= N.';

CREATE TABLE permissions (
    code         text PRIMARY KEY,
    label        text NOT NULL,
    domain       text NOT NULL,
    description  text,
    min_rank     integer NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN permissions.min_rank IS
    'Lowest role rank that holds this permission. Inheritance is implicit.';

CREATE INDEX permissions_domain_idx ON permissions (domain);
CREATE INDEX permissions_min_rank_idx ON permissions (min_rank);

-- ---------------------------------------------------------------------------
-- Users. `global_role` is the deployment-wide floor; project assignments can
-- raise a user's effective role for a specific project but never lower it.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email            citext,
    username         text NOT NULL,
    -- A worker is looked for by the parts of their name, by the badge their
    -- employer knows them by, and by who signs their cheque. One `full_name`
    -- column answered none of those, so the parts are the stored truth and
    -- full_name is derived from them.
    first_name       text,
    middle_name      text,
    last_name        text,
    full_name        text NOT NULL GENERATED ALWAYS AS (
                         btrim(regexp_replace(
                             coalesce(first_name, '') || ' ' ||
                             coalesce(middle_name, '') || ' ' ||
                             coalesce(last_name, ''),
                             '\s+', ' ', 'g'))
                     ) STORED,
    employee_id      text,
    -- employer_contractor_id is added in 0004, once contractors exists.
    employer_name    text,
    monitor_id       text,
    password_hash    text,
    global_role      text NOT NULL REFERENCES roles (code) ON UPDATE CASCADE,
    phone            text,
    is_active        boolean NOT NULL DEFAULT true,
    must_reset       boolean NOT NULL DEFAULT false,
    last_login_at    timestamptz,
    failed_logins    integer NOT NULL DEFAULT 0,
    locked_until     timestamptz,
    preferences      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    CONSTRAINT users_name_present CHECK (
        coalesce(btrim(first_name), '') <> ''
        OR coalesce(btrim(last_name), '') <> '')
);

CREATE UNIQUE INDEX users_username_key
    ON users (lower(username)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX users_email_key
    ON users (email) WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE UNIQUE INDEX users_monitor_id_key
    ON users (monitor_id) WHERE deleted_at IS NULL AND monitor_id IS NOT NULL;
SELECT adms_attach_touch('users');

CREATE INDEX users_employee_id_idx ON users (employee_id)
    WHERE employee_id IS NOT NULL;
CREATE INDEX users_employer_name_idx ON users (lower(employer_name))
    WHERE employer_name IS NOT NULL;
CREATE INDEX users_last_name_idx ON users (lower(last_name));

COMMENT ON COLUMN users.monitor_id IS
    'Field-facing Monitor ID printed on tickets. Distinct from the surrogate id.';
COMMENT ON COLUMN users.employee_id IS
    'The badge or payroll number the employer knows this person by. Unique '
    'within an employer, never across employers.';
COMMENT ON COLUMN users.employer_name IS
    'Free text for a staffing firm that is not a contractor on any project. '
    'Where the employer is a contractor, employer_contractor_id carries it.';
COMMENT ON COLUMN users.full_name IS
    'Derived from the name parts. Written by the database, never by a client.';

-- ---------------------------------------------------------------------------
-- Refresh / session tokens
-- ---------------------------------------------------------------------------
CREATE TABLE user_sessions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    refresh_hash   text NOT NULL,
    user_agent     text,
    ip_address     inet,
    issued_at      timestamptz NOT NULL DEFAULT now(),
    expires_at     timestamptz NOT NULL,
    revoked_at     timestamptz
);

CREATE INDEX user_sessions_user_idx ON user_sessions (user_id);
CREATE INDEX user_sessions_refresh_idx ON user_sessions (refresh_hash);

-- ---------------------------------------------------------------------------
-- Effective permission resolution, exposed to the API as a single lookup.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_role_rank(p_role text)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
    SELECT rank FROM roles WHERE code = p_role;
$$;

CREATE OR REPLACE FUNCTION adms_role_has_permission(p_role text, p_perm text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM permissions p
          JOIN roles r ON r.code = p_role
         WHERE p.code = p_perm
           AND r.rank >= p.min_rank
    );
$$;

CREATE OR REPLACE VIEW role_permission_matrix AS
    SELECT r.code       AS role_code,
           r.label      AS role_label,
           r.rank       AS role_rank,
           p.code       AS permission_code,
           p.domain     AS permission_domain,
           p.label      AS permission_label
      FROM roles r
      JOIN permissions p ON r.rank >= p.min_rank;
