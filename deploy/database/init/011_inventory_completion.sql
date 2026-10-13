-- Inventory domain completion: transfer orders, stocktake tasks, master data.
BEGIN;

-- =============================================================
-- 1. Warehouse master data
-- =============================================================
CREATE TABLE inv_warehouse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'standard',
  address text NOT NULL DEFAULT '',
  manager text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  aggregate_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (type IN ('standard','transit','virtual','production')),
  CHECK (status IN ('active','inactive','locked'))
);

-- =============================================================
-- 2. Product master data
-- =============================================================
CREATE TABLE inv_product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  specification text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  uom text NOT NULL DEFAULT 'PCS',
  unit_weight numeric(18,6) NOT NULL DEFAULT 0,
  unit_volume numeric(18,6) NOT NULL DEFAULT 0,
  safety_stock_qty numeric(18,6) NOT NULL DEFAULT 0,
  max_stock_qty numeric(18,6) NOT NULL DEFAULT 0,
  product_type text NOT NULL DEFAULT 'finished',
  status text NOT NULL DEFAULT 'active',
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  aggregate_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (product_type IN ('finished','semi_finished','raw_material')),
  CHECK (status IN ('active','inactive','discontinued'))
);

-- =============================================================
-- 3. Material master data
-- =============================================================
CREATE TABLE inv_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  specification text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  uom text NOT NULL DEFAULT 'PCS',
  unit_weight numeric(18,6) NOT NULL DEFAULT 0,
  safety_stock_qty numeric(18,6) NOT NULL DEFAULT 0,
  max_stock_qty numeric(18,6) NOT NULL DEFAULT 0,
  material_type text NOT NULL DEFAULT 'purchased',
  status text NOT NULL DEFAULT 'active',
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  aggregate_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (material_type IN ('purchased','self_made')),
  CHECK (status IN ('active','inactive','discontinued'))
);

-- =============================================================
-- 4. Transfer order (调拨单)
-- =============================================================
CREATE TABLE inv_transfer_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  transfer_no text NOT NULL,
  from_warehouse_id text NOT NULL,
  to_warehouse_id text NOT NULL,
  product_id text NOT NULL,
  product_code text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  transfer_qty numeric(18,6) NOT NULL CHECK (transfer_qty > 0),
  received_qty numeric(18,6) NOT NULL DEFAULT 0,
  uom text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  reason text NOT NULL DEFAULT '',
  external_transaction_id text,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by text NOT NULL DEFAULT '',
  approved_by text,
  approved_at timestamptz,
  shipped_at timestamptz,
  received_at timestamptz,
  row_version bigint NOT NULL DEFAULT 1,
  aggregate_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, transfer_no),
  UNIQUE (tenant_id, id),
  CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','SHIPPING','IN_TRANSIT','RECEIVED','REJECTED','CANCELED')),
  CHECK (received_qty >= 0 AND received_qty <= transfer_qty)
);

CREATE TABLE inv_transfer_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  transfer_order_id uuid NOT NULL,
  product_id text NOT NULL,
  product_code text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  transfer_qty numeric(18,6) NOT NULL CHECK (transfer_qty > 0),
  received_qty numeric(18,6) NOT NULL DEFAULT 0,
  uom text NOT NULL,
  row_version bigint NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, transfer_order_id, product_id),
  FOREIGN KEY (tenant_id, transfer_order_id) REFERENCES inv_transfer_order (tenant_id, id),
  CHECK (received_qty >= 0 AND received_qty <= transfer_qty)
);

-- =============================================================
-- 5. Stocktake task (盘点单)
-- =============================================================
CREATE TABLE inv_stocktake_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  stocktake_no text NOT NULL,
  warehouse_id text NOT NULL,
  scope text NOT NULL DEFAULT 'full',
  status text NOT NULL DEFAULT 'DRAFT',
  reason text NOT NULL DEFAULT '',
  assigned_to text NOT NULL DEFAULT '',
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by text NOT NULL DEFAULT '',
  approved_by text,
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  row_version bigint NOT NULL DEFAULT 1,
  aggregate_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, stocktake_no),
  UNIQUE (tenant_id, id),
  CHECK (scope IN ('full','partial','cycle','spot')),
  CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','IN_PROGRESS','COMPLETED','REJECTED','CANCELED'))
);

CREATE TABLE inv_stocktake_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  stocktake_task_id uuid NOT NULL,
  product_id text NOT NULL,
  product_code text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  system_qty numeric(18,6) NOT NULL DEFAULT 0,
  counted_qty numeric(18,6),
  variance_qty numeric(18,6),
  uom text NOT NULL,
  bin_location text NOT NULL DEFAULT '',
  line_status text NOT NULL DEFAULT 'PENDING',
  counted_by text,
  counted_at timestamptz,
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, stocktake_task_id, product_id),
  FOREIGN KEY (tenant_id, stocktake_task_id) REFERENCES inv_stocktake_task (tenant_id, id),
  CHECK (line_status IN ('PENDING','COUNTED','CONFIRMED','ADJUSTED','SKIP'))
);

-- =============================================================
-- 6. Extend inv_transaction types for transfer and stocktake
-- =============================================================
ALTER TABLE inv_transaction DROP CONSTRAINT IF EXISTS inv_transaction_transaction_type_check;
ALTER TABLE inv_transaction ADD CONSTRAINT inv_transaction_transaction_type_check
  CHECK (transaction_type IN (
    'SALES_OUTBOUND','FG_COMPLETION_INBOUND','PURCHASE_RECEIPT_INBOUND',
    'RESERVATION_RELEASE','TRANSFER_OUTBOUND','TRANSFER_INBOUND',
    'STOCKTAKE_ADJUSTMENT_INBOUND','STOCKTAKE_ADJUSTMENT_OUTBOUND'
  ));

-- =============================================================
-- Indexes
-- =============================================================
CREATE INDEX inv_transfer_query_idx ON inv_transfer_order (tenant_id, status, updated_at DESC);
CREATE INDEX inv_stocktake_query_idx ON inv_stocktake_task (tenant_id, status, updated_at DESC);
CREATE INDEX inv_warehouse_query_idx ON inv_warehouse (tenant_id, status);
CREATE INDEX inv_product_query_idx ON inv_product (tenant_id, status);
CREATE INDEX inv_material_query_idx ON inv_material (tenant_id, status);

-- =============================================================
-- Triggers
-- =============================================================
CREATE TRIGGER inv_warehouse_touch BEFORE UPDATE ON inv_warehouse FOR EACH ROW EXECUTE FUNCTION fulfill_touch_updated_at();
CREATE TRIGGER inv_product_touch BEFORE UPDATE ON inv_product FOR EACH ROW EXECUTE FUNCTION fulfill_touch_updated_at();
CREATE TRIGGER inv_material_touch BEFORE UPDATE ON inv_material FOR EACH ROW EXECUTE FUNCTION fulfill_touch_updated_at();
CREATE TRIGGER inv_transfer_touch BEFORE UPDATE ON inv_transfer_order FOR EACH ROW EXECUTE FUNCTION fulfill_touch_updated_at();
CREATE TRIGGER inv_stocktake_touch BEFORE UPDATE ON inv_stocktake_task FOR EACH ROW EXECUTE FUNCTION fulfill_touch_updated_at();

-- =============================================================
-- RLS + FORCE
-- =============================================================
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'inv_warehouse','inv_product','inv_material',
    'inv_transfer_order','inv_transfer_line',
    'inv_stocktake_task','inv_stocktake_line'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))', table_name || '_tenant_policy', table_name);
  END LOOP;
END $$;

COMMIT;
