-- ================================================
-- 035: 销售监控舱数据支持
-- 新增 sales_quote / sales_outreach_setting 表
-- 扩展 sc_customer 字段
-- 创建销售监控舱聚合视图
-- ================================================

-- 1. 产品报价表
CREATE TABLE IF NOT EXISTS sales_quote (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  quote_no text NOT NULL,
  customer_id text NOT NULL,
  customer_name text NOT NULL,
  owner_employee_id text NOT NULL,
  quote_date date NOT NULL,
  valid_until date NOT NULL,
  currency char(3) NOT NULL DEFAULT 'CNY',
  total_amount decimal(20,6) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status text NOT NULL DEFAULT 'DRAFT',
  product_id text NOT NULL,
  product_name text NOT NULL,
  spec text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'PCS',
  qty decimal(18,6) NOT NULL DEFAULT 0 CHECK (qty >= 0),
  unit_price decimal(20,6) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_rate decimal(9,4) NOT NULL DEFAULT 100.0000,
  discount_amount decimal(20,6) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  remark text NOT NULL DEFAULT '',
  source_rma_id uuid,
  converted_order_id uuid,
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, quote_no),
  CHECK (status IN ('DRAFT','PENDING_APPROVAL','ACTIVE','EXPIRING','EXPIRED','CONVERTED','VOID'))
);

COMMENT ON TABLE sales_quote IS '产品报价单，销售监控舱"生效报价数"指标来源';
COMMENT ON COLUMN sales_quote.status IS 'DRAFT=草稿, PENDING_APPROVAL=待审批, ACTIVE=正常, EXPIRING=临期, EXPIRED=已过期, CONVERTED=已转单, VOID=已作废';

CREATE INDEX idx_sales_quote_tenant_status ON sales_quote (tenant_id, status);
CREATE INDEX idx_sales_quote_valid_until ON sales_quote (tenant_id, valid_until);

-- 2. 触达设置表（异常停滞阈值）
CREATE TABLE IF NOT EXISTS sales_outreach_setting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  threshold_days integer NOT NULL DEFAULT 3 CHECK (threshold_days > 0),
  reminder_enabled boolean NOT NULL DEFAULT true,
  updated_by text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

COMMENT ON TABLE sales_outreach_setting IS '销售触达规则设置，控制"异常停滞订单"阈值天数';

-- 3. 扩展 sc_customer 字段（沉睡客户检测）
ALTER TABLE sc_customer ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'C';
ALTER TABLE sc_customer ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT '';
ALTER TABLE sc_customer ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz;
ALTER TABLE sc_customer ADD COLUMN IF NOT EXISTS owner_employee_id text NOT NULL DEFAULT '';

COMMENT ON COLUMN sc_customer.level IS '客户等级 A/B/C/D，D级+资料不全+30天未互动 = 沉睡客户';
COMMENT ON COLUMN sc_customer.last_interaction_at IS '最近互动时间，用于计算沉睡天数';

CREATE INDEX idx_sc_customer_tenant_level ON sc_customer (tenant_id, level);

-- 4. 销售监控舱聚合视图
CREATE OR REPLACE VIEW v_sales_dashboard AS
SELECT
  so.tenant_id,
  -- 生效报价数（状态为 ACTIVE 或 EXPIRING 的报价）
  (SELECT count(*) FROM sales_quote sq
   WHERE sq.tenant_id = so.tenant_id
     AND sq.status IN ('ACTIVE','EXPIRING')
     AND sq.valid_until >= CURRENT_DATE
  ) AS active_quote_count,
  -- 报价转订单数（当前销售订单总量）
  count(DISTINCT so.id) AS order_count,
  -- 异常停滞订单数（待发货超过阈值天数）
  (SELECT count(*) FROM sales_order stalled
   WHERE stalled.tenant_id = so.tenant_id
     AND stalled.overall_status = 'PENDING_CONFIRMATION'
     AND stalled.created_at < now() - make_interval(days => COALESCE(
       (SELECT threshold_days FROM sales_outreach_setting WHERE tenant_id = so.tenant_id LIMIT 1), 3))
  ) AS stalled_order_count,
  -- 订单销售额合计
  COALESCE(sum(so.total_amount), 0) AS total_sales_amount,
  -- 交付高危订单数（交期在3天内的未完成订单）
  (SELECT count(*) FROM sales_order risk
   WHERE risk.tenant_id = so.tenant_id
     AND risk.overall_status IN ('PENDING_CONFIRMATION','CONFIRMED','REPLENISHING','PARTIALLY_SHIPPED')
     AND risk.requested_delivery_date <= CURRENT_DATE + 3
  ) AS delivery_risk_count,
  -- 沉睡客户数
  (SELECT count(*) FROM sc_customer sc
   WHERE sc.tenant_id = so.tenant_id
     AND sc.level = 'D'
     AND (sc.contact_phone IS NULL OR sc.contact_phone = '' OR sc.contact_phone = '-')
     AND (sc.last_interaction_at IS NULL
          OR sc.last_interaction_at < now() - interval '30 days')
  ) AS dormant_customer_count,
  max(so.updated_at) AS last_updated
FROM sales_order so
WHERE so.overall_status != 'CANCELED'
GROUP BY so.tenant_id;

COMMENT ON VIEW v_sales_dashboard IS '销售监控舱聚合数据，供 GET /api/v1/workbench/dashboard 或销售监控舱页面调用';

-- 5. 种子数据：触达设置
INSERT INTO sales_outreach_setting (tenant_id, threshold_days)
VALUES ('TENANT-SHWS', 3)
ON CONFLICT (tenant_id) DO NOTHING;

-- 6. 种子数据：产品报价
INSERT INTO sales_quote (tenant_id, quote_no, customer_id, customer_name, owner_employee_id, quote_date, valid_until, total_amount, status, product_id, product_name, qty, unit_price)
VALUES
  ('TENANT-SHWS', 'QT-2026-001', 'CUST-001', '华为技术有限公司', 'test01', CURRENT_DATE - 10, CURRENT_DATE + 30, 120000.000000, 'ACTIVE', 'PROD-001', '工业网关A', 10, 12000.000000),
  ('TENANT-SHWS', 'QT-2026-002', 'CUST-002', '中兴通讯股份有限公司', 'test01', CURRENT_DATE - 5, CURRENT_DATE + 15, 85000.000000, 'ACTIVE', 'PROD-002', '边缘计算盒子B', 5, 17000.000000),
  ('TENANT-SHWS', 'QT-2026-003', 'CUST-003', '比亚迪股份有限公司', 'test01', CURRENT_DATE - 35, CURRENT_DATE - 5, 95000.000000, 'EXPIRED', 'PROD-001', '工业网关A', 8, 11875.000000)
ON CONFLICT (tenant_id, quote_no) DO NOTHING;

-- 7. 种子数据：客户等级和互动时间
UPDATE sc_customer SET
  level = 'A', contact_phone = '0755-28780808', last_interaction_at = now() - interval '3 days'
WHERE tenant_id = 'TENANT-SHWS' AND customer_no = 'CUST-001';

UPDATE sc_customer SET
  level = 'B', contact_phone = '0755-26770000', last_interaction_at = now() - interval '7 days'
WHERE tenant_id = 'TENANT-SHWS' AND customer_no = 'CUST-002';

UPDATE sc_customer SET
  level = 'D', contact_phone = '-', last_interaction_at = now() - interval '45 days'
WHERE tenant_id = 'TENANT-SHWS' AND customer_no = 'CUST-003';

-- 8. 种子数据：销售订单（如果不存在）
INSERT INTO sales_order (
  tenant_id, order_no, customer_id, customer_name, owner_employee_id,
  fulfillment_warehouse_id, factory_resource_id, requested_delivery_date,
  allow_partial_shipment, currency, total_amount, overall_status,
  review_status, shipment_status, review_required, review_policy_version,
  recipient_name, recipient_phone_ciphertext, recipient_phone_key_id, recipient_phone_masked,
  recipient_country, recipient_province, recipient_city, recipient_address,
  correlation_id, created_by
)
VALUES
  ('TENANT-SHWS', 'SO-2026-001', 'CUST-001', '华为技术有限公司', 'test01',
   'WH-SZ-001', 'FACTORY-SZ-001', CURRENT_DATE + 5,
   true, 'CNY', 125000.000000, 'CONFIRMED',
   'APPROVED', 'NOT_REQUESTED', false, 'v1',
   '张三', 'encrypted', 'key-1', '138****0001',
   'CN', '广东省', '深圳市', '南山区科技园',
   gen_random_uuid(), 'test01'),
  ('TENANT-SHWS', 'SO-2026-002', 'CUST-002', '中兴通讯股份有限公司', 'test01',
   'WH-SZ-001', 'FACTORY-SZ-001', CURRENT_DATE + 10,
   true, 'CNY', 80000.000000, 'PARTIALLY_SHIPPED',
   'APPROVED', 'PARTIALLY_SHIPPED', false, 'v1',
   '李四', 'encrypted', 'key-1', '139****0002',
   'CN', '广东省', '深圳市', '福田区',
   gen_random_uuid(), 'test01'),
  ('TENANT-SHWS', 'SO-2026-003', 'CUST-003', '比亚迪股份有限公司', 'test01',
   'WH-SZ-001', 'FACTORY-SZ-001', CURRENT_DATE + 20,
   false, 'CNY', 220000.000000, 'PENDING_CONFIRMATION',
   'PENDING', 'NOT_REQUESTED', true, 'v1',
   '王五', 'encrypted', 'key-1', '137****0003',
   'CN', '广东省', '深圳市', '坪山区',
   gen_random_uuid(), 'test01'),
  ('TENANT-SHWS', 'SO-2026-004', 'CUST-004', '宁德时代新能源', 'test01',
   'WH-SZ-001', 'FACTORY-SZ-001', CURRENT_DATE - 5,
   true, 'CNY', 95000.000000, 'PENDING_CONFIRMATION',
   'NOT_REQUIRED', 'NOT_REQUESTED', false, 'v1',
   '赵六', 'encrypted', 'key-1', '136****0004',
   'CN', '福建省', '宁德市', '蕉城区',
   gen_random_uuid(), 'test01')
ON CONFLICT (tenant_id, order_no) DO NOTHING;
