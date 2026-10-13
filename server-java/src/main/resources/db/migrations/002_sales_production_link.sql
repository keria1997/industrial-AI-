-- Transactional sales-to-production intake and inventory availability projection.
BEGIN;

CREATE TABLE prod_inventory_availability (
  tenant_id text NOT NULL,
  product_id text NOT NULL,
  inventory_warehouse_id text NOT NULL,
  available_qty decimal(18,6) NOT NULL CHECK (available_qty >= 0),
  uom text NOT NULL,
  fact_version bigint NOT NULL CHECK (fact_version >= 1),
  source_event_id text NOT NULL,
  source_system text NOT NULL,
  as_of timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, product_id, inventory_warehouse_id),
  UNIQUE (tenant_id, source_event_id)
);

CREATE TABLE prod_sales_order_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  sales_order_id text NOT NULL,
  source_line_id text NOT NULL DEFAULT '1',
  source_revision integer NOT NULL DEFAULT 1 CHECK (source_revision >= 1),
  product_id text NOT NULL,
  product_name text,
  ordered_qty decimal(18,6) NOT NULL CHECK (ordered_qty > 0),
  available_qty decimal(18,6) NOT NULL CHECK (available_qty >= 0),
  shortage_qty decimal(18,6) NOT NULL CHECK (shortage_qty >= 0),
  uom text NOT NULL,
  due_date date NOT NULL,
  factory_resource_id text NOT NULL,
  inventory_warehouse_id text NOT NULL,
  inventory_fact_version bigint NOT NULL CHECK (inventory_fact_version >= 1),
  decision text NOT NULL,
  demand_id uuid REFERENCES prod_demand(id),
  status text NOT NULL DEFAULT 'COMPLETED',
  correlation_id text NOT NULL,
  trace_id text NOT NULL,
  created_by text NOT NULL,
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sales_order_id, source_line_id, source_revision),
  CHECK (decision IN ('FULFILL_FROM_STOCK','CREATE_PRODUCTION_DEMAND')),
  CHECK (status IN ('COMPLETED')),
  CHECK ((decision = 'CREATE_PRODUCTION_DEMAND' AND shortage_qty > 0 AND demand_id IS NOT NULL)
      OR (decision = 'FULFILL_FROM_STOCK' AND shortage_qty = 0 AND demand_id IS NULL))
);

CREATE INDEX idx_prod_sales_intake_source ON prod_sales_order_intake (tenant_id, sales_order_id, source_line_id);
CREATE INDEX idx_prod_inventory_availability_as_of ON prod_inventory_availability (tenant_id, as_of);

ALTER TABLE prod_inventory_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE prod_sales_order_intake ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_prod_inventory_availability ON prod_inventory_availability
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY tenant_isolation_prod_sales_order_intake ON prod_sales_order_intake
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

COMMIT;
