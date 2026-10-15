-- ================================================
-- 036: 客户签收表
-- PRD 7.3.9.2.7: 客户签收是销售完成关闭的独立业务事实
-- ================================================

CREATE TABLE IF NOT EXISTS customer_receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  order_id uuid NOT NULL,
  receipt_no text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  signed_qty decimal(18,6) NOT NULL DEFAULT 0,
  rejected_qty decimal(18,6) NOT NULL DEFAULT 0,
  damaged_qty decimal(18,6) NOT NULL DEFAULT 0,
  signed_by text NOT NULL DEFAULT '',
  signed_at timestamptz,
  source_outbound_version bigint NOT NULL DEFAULT 1,
  source_fact_version bigint NOT NULL DEFAULT 1,
  evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_id),
  UNIQUE (tenant_id, receipt_no),
  CHECK (status IN ('PENDING','PARTIALLY_SIGNED','SIGNED','REJECTED','DISPUTED')),
  CHECK (signed_qty >= 0 AND rejected_qty >= 0 AND damaged_qty >= 0)
);

COMMENT ON TABLE customer_receipt IS '客户签收聚合，销售完成关闭的前置条件之一';

CREATE INDEX idx_customer_receipt_tenant_order ON customer_receipt (tenant_id, order_id);
CREATE INDEX idx_customer_receipt_status ON customer_receipt (tenant_id, status);

CREATE TRIGGER customer_receipt_touch BEFORE UPDATE ON customer_receipt
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
