-- Stable links from an inventory shortage line to the existing production intake.
BEGIN;

ALTER TABLE prod_sales_order_intake
  ADD COLUMN shipment_request_id uuid,
  ADD COLUMN shipment_request_line_id uuid,
  ADD COLUMN sales_order_line_id uuid;

ALTER TABLE prod_demand_source
  ADD COLUMN shipment_request_id uuid,
  ADD COLUMN shipment_request_line_id uuid,
  ADD COLUMN sales_order_line_id uuid;

ALTER TABLE prod_event_outbox
  ADD COLUMN error_message text;

CREATE UNIQUE INDEX prod_intake_shipment_line_uq
  ON prod_sales_order_intake (tenant_id, shipment_request_line_id)
  WHERE shipment_request_line_id IS NOT NULL;

CREATE INDEX prod_demand_source_shipment_line_idx
  ON prod_demand_source (tenant_id, shipment_request_line_id)
  WHERE shipment_request_line_id IS NOT NULL;

COMMIT;
