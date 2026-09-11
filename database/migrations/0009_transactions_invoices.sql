-- =============================================================================
-- Open ADMS :: 0009 :: Transactions and invoicing
-- Transactions are system-generated and permanently locked. Nothing updates a
-- transaction: a correction is a reversal row plus a fresh computation, and
-- invoice membership lives in a join table so the transaction never moves.
-- =============================================================================

CREATE TABLE transactions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_number text NOT NULL UNIQUE,
    project_id         uuid NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
    ticket_id          uuid NOT NULL REFERENCES tickets (id) ON DELETE RESTRICT,
    rule_id            uuid NOT NULL REFERENCES rules (id) ON DELETE RESTRICT,
    service_code_id    uuid NOT NULL REFERENCES service_codes (id) ON DELETE RESTRICT,
    rate_id            uuid NOT NULL REFERENCES rates (id) ON DELETE RESTRICT,
    contract_id        uuid NOT NULL REFERENCES contracts (id) ON DELETE RESTRICT,
    contractor_id      uuid NOT NULL REFERENCES contractors (id) ON DELETE RESTRICT,

    quantity           numeric(14, 4) NOT NULL,
    unit_type          text NOT NULL REFERENCES unit_types (code) ON UPDATE CASCADE,
    rate_amount        numeric(14, 4) NOT NULL,
    amount             numeric(16, 4) NOT NULL,
    currency           text NOT NULL DEFAULT 'USD',

    -- Immutable evidence of how this number was reached
    snapshot           jsonb NOT NULL DEFAULT '{}'::jsonb,
    rule_snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb,
    quantity_source    text NOT NULL,

    is_reversal        boolean NOT NULL DEFAULT false,
    reverses_id        uuid REFERENCES transactions (id) ON DELETE RESTRICT,
    reversal_reason    text,

    computed_at        timestamptz NOT NULL DEFAULT now(),
    computed_by        uuid REFERENCES users (id) ON DELETE SET NULL,
    engine_version     text NOT NULL DEFAULT '1.0.0',

    CONSTRAINT transactions_quantity_sign CHECK (
        (is_reversal AND quantity <= 0) OR (NOT is_reversal AND quantity >= 0)),
    CONSTRAINT transactions_reversal_shape CHECK (
        (NOT is_reversal AND reverses_id IS NULL)
        OR (is_reversal AND reverses_id IS NOT NULL AND reversal_reason IS NOT NULL))
);

CREATE INDEX transactions_ticket_idx     ON transactions (ticket_id);
CREATE INDEX transactions_project_idx    ON transactions (project_id);
CREATE INDEX transactions_rule_idx       ON transactions (rule_id);
CREATE INDEX transactions_contractor_idx ON transactions (contractor_id);
CREATE INDEX transactions_computed_idx   ON transactions (computed_at DESC);
CREATE UNIQUE INDEX transactions_one_per_ticket_rule
    ON transactions (ticket_id, rule_id) WHERE NOT is_reversal;

-- Locked forever.
CREATE TRIGGER trg_transactions_immutable
    BEFORE UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION adms_forbid_mutation();

COMMENT ON TABLE transactions IS
    'Append-only. UPDATE and DELETE are blocked at the database level; a '
    'correction is written as a reversal row followed by a new computation.';
COMMENT ON COLUMN transactions.snapshot IS
    'The ticket values the amount was computed from, frozen at compute time.';

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
CREATE TABLE invoices (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number    text NOT NULL UNIQUE,
    project_id        uuid NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
    contractor_id     uuid NOT NULL REFERENCES contractors (id) ON DELETE RESTRICT,
    contract_id       uuid NOT NULL REFERENCES contracts (id) ON DELETE RESTRICT,
    status            text NOT NULL DEFAULT 'draft',
    period_start      date,
    period_end        date,
    subtotal          numeric(16, 2) NOT NULL DEFAULT 0,
    adjustments       numeric(16, 2) NOT NULL DEFAULT 0,
    total             numeric(16, 2) NOT NULL DEFAULT 0,
    currency          text NOT NULL DEFAULT 'USD',
    notes             text,
    submitted_at      timestamptz,
    approved_at       timestamptz,
    approved_by       uuid REFERENCES users (id) ON DELETE SET NULL,
    paid_at           timestamptz,
    -- A rejection that says nothing is a phone call somebody has to make
    -- instead, so the reason travels with the invoice and survives a reopen.
    rejected_at       timestamptz,
    rejected_by       uuid REFERENCES users (id) ON DELETE SET NULL,
    rejection_reason  text,
    adjustment_reason text,
    metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT invoices_status_valid CHECK (status IN (
        'draft', 'submitted', 'approved', 'rejected', 'paid', 'void')),
    CONSTRAINT invoices_rejection_has_a_reason CHECK (
        status <> 'rejected' OR COALESCE(btrim(rejection_reason), '') <> ''),
    CONSTRAINT invoices_adjustment_has_a_reason CHECK (
        adjustments = 0 OR COALESCE(btrim(adjustment_reason), '') <> ''),
    CONSTRAINT invoices_period_ordered CHECK (
        period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);

CREATE INDEX invoices_project_idx ON invoices (project_id, status);
SELECT adms_attach_touch('invoices');

CREATE TABLE invoice_lines (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
    transaction_id  uuid NOT NULL REFERENCES transactions (id) ON DELETE RESTRICT,
    line_number     integer NOT NULL,
    amount          numeric(16, 4) NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (invoice_id, transaction_id),
    UNIQUE (invoice_id, line_number)
);

-- A transaction can only ever appear on one non-void invoice.
CREATE UNIQUE INDEX invoice_lines_transaction_once ON invoice_lines (transaction_id);
CREATE INDEX invoice_lines_invoice_idx ON invoice_lines (invoice_id);

CREATE OR REPLACE FUNCTION adms_recalc_invoice_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_invoice uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
    UPDATE invoices i
       SET subtotal = round(COALESCE(sums.total, 0), 2),
           total    = round(COALESCE(sums.total, 0), 2) + i.adjustments
      FROM (
            SELECT SUM(amount) AS total
              FROM invoice_lines
             WHERE invoice_id = v_invoice
           ) sums
     WHERE i.id = v_invoice;

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_invoice_lines_totals
    AFTER INSERT OR UPDATE OR DELETE ON invoice_lines
    FOR EACH ROW EXECUTE FUNCTION adms_recalc_invoice_totals();
