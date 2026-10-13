-- Sales order, review and warehouse handoff aggregates.
BEGIN;

CREATE TABLE sales_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, order_no text NOT NULL,
  customer_id text NOT NULL, customer_name text NOT NULL, owner_employee_id text NOT NULL,
  fulfillment_warehouse_id text NOT NULL, factory_resource_id text NOT NULL,
  requested_delivery_date date NOT NULL, allow_partial_shipment boolean NOT NULL,
  currency char(3) NOT NULL, total_amount decimal(20,6) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  overall_status text NOT NULL DEFAULT 'PENDING_CONFIRMATION', review_status text NOT NULL,
  shipment_status text NOT NULL DEFAULT 'NOT_REQUESTED', review_required boolean NOT NULL,
  review_policy_version text NOT NULL, recipient_name text NOT NULL, recipient_phone_ciphertext text NOT NULL,
  recipient_phone_key_id text NOT NULL, recipient_phone_masked text NOT NULL, recipient_country text NOT NULL,
  recipient_province text NOT NULL, recipient_city text NOT NULL, recipient_district text,
  recipient_address text NOT NULL, recipient_postal_code text, source_quote_id uuid,
  source_quote_revision integer, cancel_reason text, canceled_at timestamptz,
  correlation_id uuid NOT NULL, created_by text NOT NULL, row_version bigint NOT NULL DEFAULT 1,
  aggregate_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, order_no),
  CHECK (overall_status IN ('PENDING_CONFIRMATION','CONFIRMED','REPLENISHING','PARTIALLY_SHIPPED','SHIPPED','CANCELED')),
  CHECK (review_status IN ('NOT_REQUIRED','PENDING','APPROVED','REJECTED','RETURNED','CANCELED')),
  CHECK (shipment_status IN ('NOT_REQUESTED','REQUESTED','PARTIALLY_SHIPPED','SHIPPED')),
  CHECK ((source_quote_id IS NULL) = (source_quote_revision IS NULL))
);

CREATE TABLE sales_order_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, sales_order_id uuid NOT NULL,
  line_no integer NOT NULL CHECK (line_no > 0), product_id text NOT NULL,
  ordered_qty decimal(18,6) NOT NULL CHECK (ordered_qty > 0), shipped_qty decimal(18,6) NOT NULL DEFAULT 0,
  active_requested_qty decimal(18,6) NOT NULL DEFAULT 0, reserved_qty decimal(18,6) NOT NULL DEFAULT 0,
  uom text NOT NULL, unit_price decimal(20,6) NOT NULL CHECK (unit_price >= 0),
  tax_rate decimal(9,6) NOT NULL CHECK (tax_rate >= 0), promised_date date NOT NULL,
  allow_partial_shipment boolean NOT NULL, line_status text NOT NULL DEFAULT 'OPEN',
  row_version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, sales_order_id, line_no),
  FOREIGN KEY (tenant_id, sales_order_id) REFERENCES sales_order (tenant_id, id),
  CHECK (shipped_qty >= 0 AND active_requested_qty >= 0 AND reserved_qty >= 0),
  CHECK (shipped_qty <= ordered_qty),
  CHECK (line_status IN ('OPEN','RESERVED','PARTIALLY_SHIPPED','SHIPPED','CANCELED'))
);

CREATE TABLE sales_review_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, sales_order_id uuid NOT NULL,
  order_version bigint NOT NULL, action text NOT NULL, from_status text, to_status text NOT NULL,
  comment text, actor_id text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, sales_order_id) REFERENCES sales_order (tenant_id, id),
  CHECK (action IN ('SUBMIT','APPROVE','RETURN','REJECT','CANCEL'))
);

CREATE TABLE sales_shipment_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, request_no text NOT NULL,
  sales_order_id uuid NOT NULL, warehouse_id text NOT NULL, order_revision bigint NOT NULL,
  workflow_status text NOT NULL DEFAULT 'REQUESTED', availability_status text NOT NULL DEFAULT 'UNCHECKED',
  replenishment_status text NOT NULL DEFAULT 'NOT_REQUIRED', posting_status text NOT NULL DEFAULT 'NOT_STARTED',
  inventory_fact_version bigint, outbound_id uuid, correlation_id uuid NOT NULL,
  aggregate_snapshot jsonb NOT NULL,
  row_version bigint NOT NULL DEFAULT 1, created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, request_no),
  FOREIGN KEY (tenant_id, sales_order_id) REFERENCES sales_order (tenant_id, id),
  CHECK (workflow_status IN ('DRAFT','REQUESTED','PROCESSING','ACTIVE','PROCESSING_UNKNOWN','MANUAL_INTERVENTION','COMPLETED')),
  CHECK (availability_status IN ('UNCHECKED','CHECKING','PARTIALLY_RESERVED','RESERVED','SHORTAGE','RECHECKING')),
  CHECK (replenishment_status IN ('NOT_REQUIRED','REQUIRED','REQUESTED','IN_PROGRESS','AVAILABLE','CLOSED','FAILED')),
  CHECK (posting_status IN ('NOT_STARTED','PARTIALLY_POSTED','POSTED'))
);

CREATE TABLE sales_shipment_request_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, shipment_request_id uuid NOT NULL,
  order_line_id uuid NOT NULL, source_line_revision bigint NOT NULL, product_id text NOT NULL,
  requested_qty decimal(18,6) NOT NULL CHECK (requested_qty > 0), reserved_qty decimal(18,6) NOT NULL DEFAULT 0,
  posted_qty decimal(18,6) NOT NULL DEFAULT 0, shortage_qty decimal(18,6) NOT NULL DEFAULT 0,
  uom text NOT NULL, production_demand_id uuid, row_version bigint NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, shipment_request_id, order_line_id),
  FOREIGN KEY (tenant_id, shipment_request_id) REFERENCES sales_shipment_request (tenant_id, id),
  FOREIGN KEY (tenant_id, order_line_id) REFERENCES sales_order_line (tenant_id, id),
  CHECK (reserved_qty >= 0 AND posted_qty >= 0 AND shortage_qty >= 0),
  CHECK (reserved_qty + shortage_qty <= requested_qty)
);

CREATE INDEX sales_order_query_idx ON sales_order (tenant_id, overall_status, updated_at DESC);
CREATE INDEX sales_order_owner_idx ON sales_order (tenant_id, owner_employee_id, updated_at DESC);
CREATE INDEX sales_request_order_idx ON sales_shipment_request (tenant_id, sales_order_id, created_at DESC);

CREATE TRIGGER sales_order_touch BEFORE UPDATE ON sales_order FOR EACH ROW EXECUTE FUNCTION fulfill_touch_updated_at();
CREATE TRIGGER sales_order_line_touch BEFORE UPDATE ON sales_order_line FOR EACH ROW EXECUTE FUNCTION fulfill_touch_updated_at();
CREATE TRIGGER sales_request_touch BEFORE UPDATE ON sales_shipment_request FOR EACH ROW EXECUTE FUNCTION fulfill_touch_updated_at();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['sales_order','sales_order_line','sales_review_action','sales_shipment_request','sales_shipment_request_line'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))', table_name || '_tenant_policy', table_name);
  END LOOP;
END $$;

COMMIT;
