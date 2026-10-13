-- Message Center: templates, records, user preferences, subscriptions, outbox.
BEGIN;

CREATE OR REPLACE FUNCTION msg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ===== Message Templates =====
CREATE TABLE msg_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'system',
  channel text NOT NULL DEFAULT 'in_app',
  title_template text NOT NULL,
  body_template text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority text NOT NULL DEFAULT 'normal',
  is_active boolean NOT NULL DEFAULT true,
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, code),
  CHECK (category IN ('order','payment','shipping','inventory','production','procurement','finance','system')),
  CHECK (channel IN ('in_app','email','sms','webhook')),
  CHECK (priority IN ('urgent','high','normal','low'))
);
CREATE TRIGGER msg_template_touch BEFORE UPDATE ON msg_template
  FOR EACH ROW EXECUTE FUNCTION msg_touch_updated_at();
CREATE INDEX idx_msg_template_tenant ON msg_template(tenant_id);
CREATE INDEX idx_msg_template_category ON msg_template(tenant_id, category);
CREATE INDEX idx_msg_template_active ON msg_template(tenant_id, is_active);

-- ===== Message Records =====
CREATE TABLE msg_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  msg_no text NOT NULL,
  template_code text,
  category text NOT NULL DEFAULT 'system',
  channel text NOT NULL DEFAULT 'in_app',
  priority text NOT NULL DEFAULT 'normal',
  title text NOT NULL,
  body text NOT NULL,
  recipient_id text NOT NULL,
  recipient_name text NOT NULL DEFAULT '',
  sender_id text NOT NULL DEFAULT 'system',
  sender_name text NOT NULL DEFAULT '系统',
  source_type text NOT NULL DEFAULT '',
  source_id text NOT NULL DEFAULT '',
  source_doc_no text NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  is_starred boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'sent',
  error_message text NOT NULL DEFAULT '',
  sent_at timestamptz,
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, msg_no),
  CHECK (category IN ('order','payment','shipping','inventory','production','procurement','finance','system')),
  CHECK (channel IN ('in_app','email','sms','webhook')),
  CHECK (priority IN ('urgent','high','normal','low')),
  CHECK (status IN ('draft','pending','sent','failed','cancelled'))
);
CREATE TRIGGER msg_record_touch BEFORE UPDATE ON msg_record
  FOR EACH ROW EXECUTE FUNCTION msg_touch_updated_at();
CREATE INDEX idx_msg_record_tenant ON msg_record(tenant_id);
CREATE INDEX idx_msg_record_recipient ON msg_record(tenant_id, recipient_id, is_read);
CREATE INDEX idx_msg_record_category ON msg_record(tenant_id, category);
CREATE INDEX idx_msg_record_priority ON msg_record(tenant_id, priority, is_read);
CREATE INDEX idx_msg_record_source ON msg_record(tenant_id, source_type, source_id);
CREATE INDEX idx_msg_record_created ON msg_record(tenant_id, created_at DESC);

-- ===== User Notification Preferences =====
CREATE TABLE msg_user_preference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  category text NOT NULL,
  channel text NOT NULL DEFAULT 'in_app',
  enabled boolean NOT NULL DEFAULT true,
  min_priority text NOT NULL DEFAULT 'low',
  quiet_hours_start text NOT NULL DEFAULT '',
  quiet_hours_end text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, category, channel),
  CHECK (category IN ('order','payment','shipping','inventory','production','procurement','finance','system')),
  CHECK (channel IN ('in_app','email','sms','webhook')),
  CHECK (min_priority IN ('urgent','high','normal','low'))
);
CREATE TRIGGER msg_user_preference_touch BEFORE UPDATE ON msg_user_preference
  FOR EACH ROW EXECUTE FUNCTION msg_touch_updated_at();
CREATE INDEX idx_msg_pref_tenant ON msg_user_preference(tenant_id);
CREATE INDEX idx_msg_pref_user ON msg_user_preference(tenant_id, user_id);

-- ===== Message Subscriptions =====
CREATE TABLE msg_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  event_type text NOT NULL,
  category text NOT NULL DEFAULT 'system',
  enabled boolean NOT NULL DEFAULT true,
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, event_type),
  CHECK (category IN ('order','payment','shipping','inventory','production','procurement','finance','system'))
);
CREATE TRIGGER msg_subscription_touch BEFORE UPDATE ON msg_subscription
  FOR EACH ROW EXECUTE FUNCTION msg_touch_updated_at();
CREATE INDEX idx_msg_sub_tenant ON msg_subscription(tenant_id);
CREATE INDEX idx_msg_sub_user ON msg_subscription(tenant_id, user_id);
CREATE INDEX idx_msg_sub_event ON msg_subscription(tenant_id, event_type);

-- ===== Message Outbox (event-driven delivery) =====
CREATE TABLE msg_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  aggregate_version bigint NOT NULL DEFAULT 1,
  correlation_id text NOT NULL DEFAULT '',
  trace_id text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, event_id),
  CHECK (status IN ('PENDING','PUBLISHED','DEAD_LETTER'))
);
CREATE INDEX idx_msg_outbox_pending ON msg_outbox(tenant_id, status);

-- ===== Message Audit Log =====
CREATE TABLE msg_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  aggregate_version bigint NOT NULL DEFAULT 1,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  correlation_id text NOT NULL DEFAULT '',
  trace_id text NOT NULL DEFAULT '',
  operator_id text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_msg_audit_tenant ON msg_audit_log(tenant_id);
CREATE INDEX idx_msg_audit_aggregate ON msg_audit_log(tenant_id, aggregate_type, aggregate_id);

-- ===== Message Idempotency =====
CREATE TABLE msg_idempotency_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  command_type text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL DEFAULT '',
  response_status integer NOT NULL,
  response_body jsonb,
  trace_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, command_type, idempotency_key)
);
CREATE INDEX idx_msg_idem_tenant ON msg_idempotency_record(tenant_id, command_type, idempotency_key);

-- ===== RLS Policies =====
ALTER TABLE msg_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE msg_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE msg_user_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE msg_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE msg_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE msg_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE msg_idempotency_record ENABLE ROW LEVEL SECURITY;

CREATE POLICY msg_tenant_isolation_template ON msg_template
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY msg_tenant_isolation_record ON msg_record
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY msg_tenant_isolation_pref ON msg_user_preference
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY msg_tenant_isolation_sub ON msg_subscription
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY msg_tenant_isolation_outbox ON msg_outbox
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY msg_tenant_isolation_audit ON msg_audit_log
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY msg_tenant_isolation_idem ON msg_idempotency_record
  USING (tenant_id = current_setting('app.current_tenant_id', true));

ALTER TABLE msg_template FORCE ROW LEVEL SECURITY;
ALTER TABLE msg_record FORCE ROW LEVEL SECURITY;
ALTER TABLE msg_user_preference FORCE ROW LEVEL SECURITY;
ALTER TABLE msg_subscription FORCE ROW LEVEL SECURITY;
ALTER TABLE msg_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE msg_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE msg_idempotency_record FORCE ROW LEVEL SECURITY;

-- ===== Seed default templates =====
INSERT INTO msg_template (tenant_id, code, name, category, channel, title_template, body_template, variables, priority, is_active, created_by) VALUES
  ('default', 'ORDER_CREATED', '销售订单创建通知', 'order', 'in_app',
   '新订单 {{orderNo}} 已创建', '客户 {{customerName}} 的销售订单 {{orderNo}} 已创建，总金额 {{totalAmount}} 元。',
   '[{"name":"orderNo","desc":"订单编号"},{"name":"customerName","desc":"客户名称"},{"name":"totalAmount","desc":"总金额"}]'::jsonb,
   'normal', true, 'system'),
  ('default', 'ORDER_CONFIRMED', '销售订单确认通知', 'order', 'in_app',
   '订单 {{orderNo}} 已确认', '销售订单 {{orderNo}} 已确认，预计交期 {{deliveryDate}}。',
   '[{"name":"orderNo","desc":"订单编号"},{"name":"deliveryDate","desc":"交货日期"}]'::jsonb,
   'normal', true, 'system'),
  ('default', 'SHIPMENT_DISPATCHED', '发货通知', 'shipping', 'in_app',
   '订单 {{orderNo}} 已发货', '销售订单 {{orderNo}} 已发货，物流单号 {{trackingNo}}。',
   '[{"name":"orderNo","desc":"订单编号"},{"name":"trackingNo","desc":"物流单号"}]'::jsonb,
   'high', true, 'system'),
  ('default', 'PAYMENT_RECEIVED', '收款通知', 'payment', 'in_app',
   '收到付款 {{amount}} 元', '客户 {{customerName}} 的应收账款 {{docNo}} 已收款 {{amount}} 元。',
   '[{"name":"docNo","desc":"单据编号"},{"name":"customerName","desc":"客户名称"},{"name":"amount","desc":"收款金额"}]'::jsonb,
   'high', true, 'system'),
  ('default', 'INVENTORY_SHORTAGE', '库存缺口预警', 'inventory', 'in_app',
   '产品 {{productName}} 库存不足', '产品 {{productCode}} {{productName}} 当前可用量 {{availableQty}}，低于安全库存 {{safetyStockQty}}。',
   '[{"name":"productCode","desc":"产品编码"},{"name":"productName","desc":"产品名称"},{"name":"availableQty","desc":"可用量"},{"name":"safetyStockQty","desc":"安全库存"}]'::jsonb,
   'urgent', true, 'system'),
  ('default', 'PRODUCTION_COMPLETION', '完工入库通知', 'production', 'in_app',
   '工单 {{workOrderNo}} 已完工', '工单 {{workOrderNo}} 生产产品 {{productName}} 已完工入库，数量 {{qty}} {{uom}}。',
   '[{"name":"workOrderNo","desc":"工单编号"},{"name":"productName","desc":"产品名称"},{"name":"qty","desc":"完工数量"},{"name":"uom","desc":"单位"}]'::jsonb,
   'normal', true, 'system'),
  ('default', 'PURCHASE_RECEIPT', '采购入库通知', 'procurement', 'in_app',
   '采购订单 {{poNo}} 已入库', '采购订单 {{poNo}} 已入库，产品 {{productName}} 数量 {{qty}} {{uom}}。',
   '[{"name":"poNo","desc":"采购订单号"},{"name":"productName","desc":"产品名称"},{"name":"qty","desc":"入库数量"},{"name":"uom","desc":"单位"}]'::jsonb,
   'normal', true, 'system'),
  ('default', 'PURCHASE_REQUEST_CREATED', '采购申请通知', 'procurement', 'in_app',
   '新采购申请 {{prNo}}', '采购申请 {{prNo}} 已创建，请及时审批。',
   '[{"name":"prNo","desc":"采购申请编号"}]'::jsonb,
   'high', true, 'system'),
  ('default', 'SYSTEM_ANNOUNCEMENT', '系统公告', 'system', 'in_app',
   '{{title}}', '{{content}}',
   '[{"name":"title","desc":"公告标题"},{"name":"content","desc":"公告内容"}]'::jsonb,
   'normal', true, 'system')
ON CONFLICT DO NOTHING;

COMMIT;
