-- Procurement Domain Completion: supplier master, PO pricing, IQC, returns, partial delivery.
BEGIN;

-- ===== Supplier Master Data =====
CREATE TABLE proc_supplier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  short_name text NOT NULL DEFAULT '',
  contact_person text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  bank_account text NOT NULL DEFAULT '',
  tax_no text NOT NULL DEFAULT '',
  rating text NOT NULL DEFAULT 'B',
  lead_time_days integer NOT NULL DEFAULT 7,
  min_order_qty numeric(18,6) NOT NULL DEFAULT 1,
  payment_terms text NOT NULL DEFAULT 'net30',
  status text NOT NULL DEFAULT 'enabled',
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (status IN ('enabled','disabled','blacklisted')),
  CHECK (rating IN ('A','B','C','D'))
);
CREATE INDEX idx_proc_supplier_tenant ON proc_supplier(tenant_id, status);

-- ===== Extend Purchase Order: pricing, tax, partial delivery status =====
ALTER TABLE proc_purchase_order DROP CONSTRAINT IF EXISTS proc_purchase_order_status_check;
ALTER TABLE proc_purchase_order ADD CONSTRAINT proc_purchase_order_status_check
  CHECK (status IN ('CREATED','CONFIRMED','PARTIALLY_RECEIVED','RECEIVED','CANCELED'));

-- ===== Extend Purchase Receipt: quality inspection =====
ALTER TABLE proc_purchase_receipt DROP CONSTRAINT IF EXISTS proc_purchase_receipt_status_check;
ALTER TABLE proc_purchase_receipt ADD CONSTRAINT proc_purchase_receipt_status_check
  CHECK (status IN ('PENDING_INSPECTION','INSPECTING','ACCEPTED','REJECTED','POSTED'));

-- ===== Purchase Returns =====
CREATE TABLE proc_purchase_return (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  return_no text NOT NULL,
  purchase_receipt_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL,
  supplier_id text NOT NULL,
  supplier_name text NOT NULL,
  material_id text NOT NULL,
  warehouse_id text NOT NULL,
  return_qty numeric(18,6) NOT NULL,
  uom text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  external_transaction_id text,
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, return_no),
  CHECK (status IN ('draft','pending','processing','done','rejected','void'))
);
CREATE INDEX idx_proc_return_tenant ON proc_purchase_return(tenant_id);
CREATE INDEX idx_proc_return_receipt ON proc_purchase_return(tenant_id, purchase_receipt_id);

-- ===== Extend PR status: add REJECTED =====
ALTER TABLE proc_purchase_request DROP CONSTRAINT IF EXISTS proc_purchase_request_status_check;
ALTER TABLE proc_purchase_request ADD CONSTRAINT proc_purchase_request_status_check
  CHECK (status IN ('PENDING_APPROVAL','APPROVED','CONVERTED','REJECTED','CANCELED'));

-- ===== RLS =====
ALTER TABLE proc_supplier ENABLE ROW LEVEL SECURITY;
ALTER TABLE proc_supplier FORCE ROW LEVEL SECURITY;
CREATE POLICY proc_supplier_tenant ON proc_supplier
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE proc_purchase_return ENABLE ROW LEVEL SECURITY;
ALTER TABLE proc_purchase_return FORCE ROW LEVEL SECURITY;
CREATE POLICY proc_purchase_return_tenant ON proc_purchase_return
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

COMMIT;
