BEGIN;

CREATE TABLE proc_purchase_request (
  id uuid PRIMARY KEY, tenant_id text NOT NULL, request_no text NOT NULL, mrp_task_id uuid NOT NULL,
  demand_id uuid NOT NULL, material_id text NOT NULL, warehouse_id text NOT NULL,
  status text NOT NULL, purchase_order_id uuid, correlation_id uuid NOT NULL,
  row_version bigint NOT NULL DEFAULT 1, aggregate_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  UNIQUE (tenant_id, request_no), UNIQUE (tenant_id, mrp_task_id, demand_id, material_id),
  CHECK (status IN ('PENDING_APPROVAL','APPROVED','CONVERTED'))
);

CREATE TABLE proc_purchase_order (
  id uuid PRIMARY KEY, tenant_id text NOT NULL, order_no text NOT NULL,
  purchase_request_id uuid NOT NULL, demand_id uuid NOT NULL, material_id text NOT NULL,
  warehouse_id text NOT NULL, status text NOT NULL, correlation_id uuid NOT NULL,
  row_version bigint NOT NULL DEFAULT 1, aggregate_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  UNIQUE (tenant_id, order_no), UNIQUE (tenant_id, purchase_request_id),
  CHECK (status IN ('CREATED','CONFIRMED','RECEIVED'))
);

ALTER TABLE proc_purchase_request
  ADD CONSTRAINT proc_purchase_request_order_fk FOREIGN KEY (purchase_order_id) REFERENCES proc_purchase_order(id);

CREATE TABLE proc_purchase_receipt (
  id uuid PRIMARY KEY, tenant_id text NOT NULL, receipt_no text NOT NULL,
  purchase_order_id uuid NOT NULL, demand_id uuid NOT NULL, material_id text NOT NULL,
  warehouse_id text NOT NULL, external_transaction_id text NOT NULL, status text NOT NULL,
  correlation_id uuid NOT NULL, row_version bigint NOT NULL DEFAULT 1,
  aggregate_snapshot jsonb NOT NULL, received_at timestamptz NOT NULL,
  UNIQUE (tenant_id, receipt_no), UNIQUE (tenant_id, external_transaction_id),
  CHECK (status = 'POSTED')
);

CREATE INDEX proc_purchase_request_demand_idx ON proc_purchase_request (tenant_id, demand_id, status);
CREATE INDEX proc_purchase_order_demand_idx ON proc_purchase_order (tenant_id, demand_id, status);
CREATE INDEX proc_purchase_receipt_order_idx ON proc_purchase_receipt (tenant_id, purchase_order_id);

ALTER TABLE proc_purchase_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE proc_purchase_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE proc_purchase_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE proc_purchase_request FORCE ROW LEVEL SECURITY;
ALTER TABLE proc_purchase_order FORCE ROW LEVEL SECURITY;
ALTER TABLE proc_purchase_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY proc_purchase_request_tenant ON proc_purchase_request USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY proc_purchase_order_tenant ON proc_purchase_order USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY proc_purchase_receipt_tenant ON proc_purchase_receipt USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE inv_transaction DROP CONSTRAINT IF EXISTS inv_transaction_transaction_type_check;
ALTER TABLE inv_transaction ADD CONSTRAINT inv_transaction_transaction_type_check
  CHECK (transaction_type IN ('SALES_OUTBOUND','FG_COMPLETION_INBOUND','PURCHASE_RECEIPT_INBOUND','RESERVATION_RELEASE'));

COMMIT;
