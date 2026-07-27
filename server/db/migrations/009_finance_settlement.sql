-- Financial Settlement: receivables, payables, payments, invoices, vouchers, cost accounting.
BEGIN;

CREATE OR REPLACE FUNCTION fin_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ===== Accounts Receivable (AR) =====
CREATE TABLE fin_receivable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  doc_no text NOT NULL,
  title text NOT NULL,
  customer_id text NOT NULL,
  customer_name text NOT NULL,
  business_type text NOT NULL DEFAULT 'AR',
  source_type text NOT NULL,
  source_id text NOT NULL,
  source_doc_no text,
  currency text NOT NULL DEFAULT 'CNY',
  total_amount numeric(18,6) NOT NULL DEFAULT 0,
  received_amount numeric(18,6) NOT NULL DEFAULT 0,
  outstanding_amount numeric(18,6) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  due_date date,
  issued_at timestamptz,
  settled_at timestamptz,
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, doc_no),
  CHECK (business_type IN ('AR','AP')),
  CHECK (status IN ('draft','pending','processing','done','rejected','void'))
);
CREATE TRIGGER fin_receivable_touch BEFORE UPDATE ON fin_receivable
  FOR EACH ROW EXECUTE FUNCTION fin_touch_updated_at();
CREATE INDEX idx_fin_receivable_tenant ON fin_receivable(tenant_id);
CREATE INDEX idx_fin_receivable_status ON fin_receivable(tenant_id, status);
CREATE INDEX idx_fin_receivable_source ON fin_receivable(tenant_id, source_type, source_id);

-- ===== Accounts Payable (AP) =====
CREATE TABLE fin_payable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  doc_no text NOT NULL,
  title text NOT NULL,
  supplier_id text NOT NULL,
  supplier_name text NOT NULL,
  business_type text NOT NULL DEFAULT 'AP',
  source_type text NOT NULL,
  source_id text NOT NULL,
  source_doc_no text,
  currency text NOT NULL DEFAULT 'CNY',
  total_amount numeric(18,6) NOT NULL DEFAULT 0,
  paid_amount numeric(18,6) NOT NULL DEFAULT 0,
  outstanding_amount numeric(18,6) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  due_date date,
  issued_at timestamptz,
  settled_at timestamptz,
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, doc_no),
  CHECK (business_type IN ('AR','AP')),
  CHECK (status IN ('draft','pending','processing','done','rejected','void'))
);
CREATE TRIGGER fin_payable_touch BEFORE UPDATE ON fin_payable
  FOR EACH ROW EXECUTE FUNCTION fin_touch_updated_at();
CREATE INDEX idx_fin_payable_tenant ON fin_payable(tenant_id);
CREATE INDEX idx_fin_payable_status ON fin_payable(tenant_id, status);
CREATE INDEX idx_fin_payable_source ON fin_payable(tenant_id, source_type, source_id);

-- ===== Payment Records (receipts for AR / payments for AP) =====
CREATE TABLE fin_payment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  doc_no text NOT NULL,
  direction text NOT NULL,
  receivable_id uuid,
  payable_id uuid,
  counterparty_id text NOT NULL,
  counterparty_name text NOT NULL,
  currency text NOT NULL DEFAULT 'CNY',
  amount numeric(18,6) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'bank_transfer',
  payment_date date NOT NULL,
  bank_account text NOT NULL DEFAULT '',
  reference_no text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, doc_no),
  CHECK (direction IN ('INBOUND','OUTBOUND')),
  CHECK (payment_method IN ('bank_transfer','cash','check','offset','other')),
  CHECK (status IN ('draft','pending','processing','done','rejected','void'))
);
CREATE TRIGGER fin_payment_touch BEFORE UPDATE ON fin_payment
  FOR EACH ROW EXECUTE FUNCTION fin_touch_updated_at();
CREATE INDEX idx_fin_payment_tenant ON fin_payment(tenant_id);
CREATE INDEX idx_fin_payment_receivable ON fin_payment(tenant_id, receivable_id);
CREATE INDEX idx_fin_payment_payable ON fin_payment(tenant_id, payable_id);

-- ===== Invoice Records =====
CREATE TABLE fin_invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  doc_no text NOT NULL,
  invoice_type text NOT NULL,
  receivable_id uuid,
  payable_id uuid,
  counterparty_id text NOT NULL,
  counterparty_name text NOT NULL,
  currency text NOT NULL DEFAULT 'CNY',
  amount numeric(18,6) NOT NULL DEFAULT 0,
  tax_amount numeric(18,6) NOT NULL DEFAULT 0,
  tax_rate numeric(6,4) NOT NULL DEFAULT 0,
  invoice_no text NOT NULL DEFAULT '',
  invoice_date date,
  status text NOT NULL DEFAULT 'draft',
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, doc_no),
  CHECK (invoice_type IN ('SALES','PURCHASE')),
  CHECK (status IN ('draft','pending','processing','done','rejected','void'))
);
CREATE TRIGGER fin_invoice_touch BEFORE UPDATE ON fin_invoice
  FOR EACH ROW EXECUTE FUNCTION fin_touch_updated_at();
CREATE INDEX idx_fin_invoice_tenant ON fin_invoice(tenant_id);

-- ===== Accounting Vouchers =====
CREATE TABLE fin_voucher (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  doc_no text NOT NULL,
  voucher_type text NOT NULL DEFAULT 'general',
  summary text NOT NULL DEFAULT '',
  total_debit numeric(18,6) NOT NULL DEFAULT 0,
  total_credit numeric(18,6) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  posting_date date,
  lines jsonb NOT NULL DEFAULT '[]',
  source_type text NOT NULL DEFAULT '',
  source_id text NOT NULL DEFAULT '',
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, doc_no),
  CHECK (voucher_type IN ('general','receipt','payment','transfer')),
  CHECK (status IN ('draft','pending','posted','void'))
);
CREATE TRIGGER fin_voucher_touch BEFORE UPDATE ON fin_voucher
  FOR EACH ROW EXECUTE FUNCTION fin_touch_updated_at();
CREATE INDEX idx_fin_voucher_tenant ON fin_voucher(tenant_id);

-- ===== Cost Accounting =====
CREATE TABLE fin_cost_accounting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  doc_no text NOT NULL,
  work_order_id text,
  work_order_no text,
  product_id text NOT NULL,
  product_name text NOT NULL,
  material_cost numeric(18,6) NOT NULL DEFAULT 0,
  manufacturing_cost numeric(18,6) NOT NULL DEFAULT 0,
  labor_cost numeric(18,6) NOT NULL DEFAULT 0,
  total_cost numeric(18,6) NOT NULL DEFAULT 0,
  output_qty numeric(18,6) NOT NULL DEFAULT 0,
  unit_cost numeric(18,6) NOT NULL DEFAULT 0,
  standard_unit_cost numeric(18,6) NOT NULL DEFAULT 0,
  variance_pct numeric(8,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, doc_no),
  CHECK (status IN ('draft','pending','processing','done','rejected','void'))
);
CREATE TRIGGER fin_cost_accounting_touch BEFORE UPDATE ON fin_cost_accounting
  FOR EACH ROW EXECUTE FUNCTION fin_touch_updated_at();
CREATE INDEX idx_fin_cost_tenant ON fin_cost_accounting(tenant_id);
CREATE INDEX idx_fin_cost_wo ON fin_cost_accounting(tenant_id, work_order_id);

-- ===== Financial Outbox (event-driven integration) =====
CREATE TABLE fin_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  aggregate_version bigint NOT NULL DEFAULT 1,
  correlation_id text NOT NULL DEFAULT '',
  trace_id text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, event_id),
  CHECK (status IN ('PENDING','PUBLISHED','DEAD_LETTER'))
);
CREATE INDEX idx_fin_outbox_pending ON fin_outbox(tenant_id, status);

-- ===== RLS Policies =====
ALTER TABLE fin_receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_invoice ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_voucher ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_cost_accounting ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_tenant_isolation_receivable ON fin_receivable
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY fin_tenant_isolation_payable ON fin_payable
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY fin_tenant_isolation_payment ON fin_payment
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY fin_tenant_isolation_invoice ON fin_invoice
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY fin_tenant_isolation_voucher ON fin_voucher
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY fin_tenant_isolation_cost ON fin_cost_accounting
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY fin_tenant_isolation_outbox ON fin_outbox
  USING (tenant_id = current_setting('app.current_tenant_id', true));

ALTER TABLE fin_receivable FORCE ROW LEVEL SECURITY;
ALTER TABLE fin_payable FORCE ROW LEVEL SECURITY;
ALTER TABLE fin_payment FORCE ROW LEVEL SECURITY;
ALTER TABLE fin_invoice FORCE ROW LEVEL SECURITY;
ALTER TABLE fin_voucher FORCE ROW LEVEL SECURITY;
ALTER TABLE fin_cost_accounting FORCE ROW LEVEL SECURITY;
ALTER TABLE fin_outbox FORCE ROW LEVEL SECURITY;

COMMIT;
