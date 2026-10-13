-- WMS-authoritative availability, reservation and outbound projections.
BEGIN;

CREATE TABLE inv_availability_projection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, warehouse_id text NOT NULL,
  product_id text NOT NULL, qualified_on_hand_qty decimal(18,6) NOT NULL CHECK (qualified_on_hand_qty >= 0),
  allocated_reserved_qty decimal(18,6) NOT NULL CHECK (allocated_reserved_qty >= 0),
  frozen_qty decimal(18,6) NOT NULL CHECK (frozen_qty >= 0), safety_stock_qty decimal(18,6) NOT NULL CHECK (safety_stock_qty >= 0),
  in_transit_qty decimal(18,6) NOT NULL CHECK (in_transit_qty >= 0), fulfillable_qty decimal(18,6) NOT NULL CHECK (fulfillable_qty >= 0),
  uom text NOT NULL, formula_version text NOT NULL, fact_version bigint NOT NULL CHECK (fact_version > 0),
  source_system text NOT NULL, source_event_id uuid NOT NULL, as_of timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, id), UNIQUE (tenant_id, warehouse_id, product_id)
);

CREATE TABLE inv_shipment_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, shipment_request_id uuid NOT NULL,
  sales_order_id uuid NOT NULL, request_no text NOT NULL, warehouse_id text NOT NULL,
  workflow_status text NOT NULL DEFAULT 'REQUESTED', availability_status text NOT NULL DEFAULT 'UNCHECKED',
  replenishment_status text NOT NULL DEFAULT 'NOT_REQUIRED', posting_status text NOT NULL DEFAULT 'NOT_STARTED',
  inventory_fact_version bigint, outbound_id uuid, recipient_snapshot jsonb NOT NULL,
  correlation_id uuid NOT NULL, row_version bigint NOT NULL DEFAULT 1,
  aggregate_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, shipment_request_id),
  CHECK (workflow_status IN ('DRAFT','REQUESTED','PROCESSING','ACTIVE','PROCESSING_UNKNOWN','MANUAL_INTERVENTION','COMPLETED')),
  CHECK (availability_status IN ('UNCHECKED','CHECKING','PARTIALLY_RESERVED','RESERVED','SHORTAGE','RECHECKING')),
  CHECK (replenishment_status IN ('NOT_REQUIRED','REQUIRED','REQUESTED','IN_PROGRESS','AVAILABLE','CLOSED','FAILED')),
  CHECK (posting_status IN ('NOT_STARTED','PARTIALLY_POSTED','POSTED'))
);

CREATE TABLE inv_shipment_task_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, shipment_task_id uuid NOT NULL,
  shipment_request_line_id uuid NOT NULL, order_line_id uuid NOT NULL, product_id text NOT NULL,
  requested_qty decimal(18,6) NOT NULL CHECK (requested_qty > 0), reserved_qty decimal(18,6) NOT NULL DEFAULT 0,
  posted_qty decimal(18,6) NOT NULL DEFAULT 0, shortage_qty decimal(18,6) NOT NULL DEFAULT 0,
  uom text NOT NULL, allow_partial_shipment boolean NOT NULL, promised_date date NOT NULL,
  production_demand_id uuid, row_version bigint NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, shipment_task_id, order_line_id),
  FOREIGN KEY (tenant_id, shipment_task_id) REFERENCES inv_shipment_task (tenant_id, id),
  CHECK (reserved_qty >= 0 AND posted_qty >= 0 AND shortage_qty >= 0)
);

CREATE TABLE inv_reservation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, shipment_task_id uuid NOT NULL,
  warehouse_id text NOT NULL, external_reservation_id text NOT NULL, status text NOT NULL,
  fact_version bigint NOT NULL, formula_version text NOT NULL, reserved_qty decimal(18,6) NOT NULL DEFAULT 0,
  consumed_qty decimal(18,6) NOT NULL DEFAULT 0, released_qty decimal(18,6) NOT NULL DEFAULT 0,
  uom text NOT NULL, row_version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  aggregate_snapshot jsonb NOT NULL,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, external_reservation_id),
  FOREIGN KEY (tenant_id, shipment_task_id) REFERENCES inv_shipment_task (tenant_id, id),
  CHECK (status IN ('PENDING','PARTIAL','ACTIVE','CONSUMED','RELEASED','EXPIRED','FAILED')),
  CHECK (reserved_qty >= 0 AND consumed_qty >= 0 AND released_qty >= 0),
  CHECK (consumed_qty + released_qty <= reserved_qty)
);

CREATE TABLE inv_reservation_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, reservation_id uuid NOT NULL,
  task_line_id uuid NOT NULL, order_line_id uuid NOT NULL, product_id text NOT NULL,
  requested_qty decimal(18,6) NOT NULL, reserved_qty decimal(18,6) NOT NULL,
  consumed_qty decimal(18,6) NOT NULL DEFAULT 0, released_qty decimal(18,6) NOT NULL DEFAULT 0, uom text NOT NULL,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, reservation_id, task_line_id),
  FOREIGN KEY (tenant_id, reservation_id) REFERENCES inv_reservation (tenant_id, id),
  FOREIGN KEY (tenant_id, task_line_id) REFERENCES inv_shipment_task_line (tenant_id, id),
  CHECK (requested_qty > 0 AND reserved_qty >= 0 AND consumed_qty >= 0 AND released_qty >= 0),
  CHECK (consumed_qty + released_qty <= reserved_qty)
);

CREATE TABLE inv_sales_outbound (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, shipment_task_id uuid NOT NULL,
  shipment_request_id uuid NOT NULL, sales_order_id uuid NOT NULL, outbound_no text NOT NULL,
  warehouse_id text NOT NULL, status text NOT NULL DEFAULT 'CREATED', posting_key text,
  row_version bigint NOT NULL DEFAULT 1, correlation_id uuid NOT NULL,
  aggregate_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), posted_at timestamptz,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, outbound_no), UNIQUE (tenant_id, posting_key),
  FOREIGN KEY (tenant_id, shipment_task_id) REFERENCES inv_shipment_task (tenant_id, id),
  CHECK (status IN ('CREATED','RESERVED','POSTING','PARTIALLY_POSTED','POSTED','PROCESSING_UNKNOWN','MANUAL_INTERVENTION','FAILED'))
);

CREATE TABLE inv_sales_outbound_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, outbound_id uuid NOT NULL,
  task_line_id uuid NOT NULL, order_line_id uuid NOT NULL, product_id text NOT NULL,
  reserved_qty decimal(18,6) NOT NULL, posted_qty decimal(18,6) NOT NULL DEFAULT 0, uom text NOT NULL,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, outbound_id, order_line_id),
  FOREIGN KEY (tenant_id, outbound_id) REFERENCES inv_sales_outbound (tenant_id, id),
  FOREIGN KEY (tenant_id, task_line_id) REFERENCES inv_shipment_task_line (tenant_id, id),
  CHECK (reserved_qty >= 0 AND posted_qty >= 0 AND posted_qty <= reserved_qty)
);

CREATE TABLE inv_transaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, transaction_no text NOT NULL, external_transaction_id text NOT NULL,
  transaction_type text NOT NULL, warehouse_id text NOT NULL, product_id text NOT NULL,
  qty decimal(18,6) NOT NULL CHECK (qty > 0), uom text NOT NULL, source_type text NOT NULL,
  source_id text NOT NULL, source_line_id text, fact_version bigint, correlation_id uuid NOT NULL,
  trace_id text NOT NULL, occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, transaction_no), UNIQUE (tenant_id, external_transaction_id),
  CHECK (transaction_type IN ('SALES_OUTBOUND','FG_COMPLETION_INBOUND','RESERVATION_RELEASE'))
);

CREATE INDEX inv_task_query_idx ON inv_shipment_task (tenant_id, warehouse_id, workflow_status, updated_at DESC);
CREATE INDEX inv_transaction_query_idx ON inv_transaction (tenant_id, warehouse_id, product_id, occurred_at DESC);
CREATE TRIGGER inv_task_touch BEFORE UPDATE ON inv_shipment_task FOR EACH ROW EXECUTE FUNCTION fulfill_touch_updated_at();
CREATE TRIGGER inv_reservation_touch BEFORE UPDATE ON inv_reservation FOR EACH ROW EXECUTE FUNCTION fulfill_touch_updated_at();
CREATE TRIGGER inv_outbound_touch BEFORE UPDATE ON inv_sales_outbound FOR EACH ROW EXECUTE FUNCTION fulfill_touch_updated_at();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'inv_availability_projection','inv_shipment_task','inv_shipment_task_line','inv_reservation',
    'inv_reservation_line','inv_sales_outbound','inv_sales_outbound_line','inv_transaction'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))', table_name || '_tenant_policy', table_name);
  END LOOP;
END $$;

COMMIT;
