-- ================================================
-- 037: RMA 退货表
-- PRD 7.3.9.2.6
-- ================================================

CREATE TABLE IF NOT EXISTS sales_rma (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  rma_no text NOT NULL,
  order_id uuid NOT NULL,
  order_no text NOT NULL,
  product_id text NOT NULL,
  product_name text NOT NULL DEFAULT '',
  requested_qty decimal(18,6) NOT NULL DEFAULT 0,
  approved_qty decimal(18,6),
  received_qty decimal(18,6),
  qualified_qty decimal(18,6),
  scrap_qty decimal(18,6),
  status text NOT NULL DEFAULT 'REQUESTED',
  reason text NOT NULL DEFAULT '',
  credit_ar_id uuid,
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, rma_no),
  CHECK (status IN ('REQUESTED','APPROVED','IN_TRANSIT','INSPECTING','INSPECTION_COMPLETED','RESTOCKED','CLOSED'))
);

COMMENT ON TABLE sales_rma IS 'RMA退货，销售完成关闭的前置条件之一（无未关闭RMA）';

CREATE INDEX idx_sales_rma_tenant ON sales_rma(tenant_id);
CREATE INDEX idx_sales_rma_status ON sales_rma(tenant_id, status);
