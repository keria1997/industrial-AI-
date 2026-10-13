-- AI Intelligence: model gateway, conversations, insights, audit.
BEGIN;

CREATE OR REPLACE FUNCTION ai_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ===== Model Gateway Config =====
CREATE TABLE ai_model_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  provider text NOT NULL DEFAULT 'openai',
  model_name text NOT NULL,
  api_key_ciphertext text NOT NULL DEFAULT '',
  api_key_key_id text NOT NULL DEFAULT '',
  api_key_masked text NOT NULL DEFAULT '',
  base_url text NOT NULL DEFAULT '',
  temperature numeric(3,2) NOT NULL DEFAULT 0.30,
  max_tokens integer NOT NULL DEFAULT 2048,
  timeout_seconds integer NOT NULL DEFAULT 15,
  is_active boolean NOT NULL DEFAULT true,
  is_primary boolean NOT NULL DEFAULT false,
  fallback_model_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  remark text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, code),
  CHECK (provider IN ('openai','anthropic','azure','local','custom')),
  CHECK (temperature >= 0 AND temperature <= 2),
  CHECK (max_tokens > 0 AND max_tokens <= 32000),
  CHECK (timeout_seconds > 0 AND timeout_seconds <= 300)
);
CREATE TRIGGER ai_model_config_touch BEFORE UPDATE ON ai_model_config
  FOR EACH ROW EXECUTE FUNCTION ai_touch_updated_at();
CREATE INDEX idx_ai_model_tenant ON ai_model_config(tenant_id);
CREATE INDEX idx_ai_model_active ON ai_model_config(tenant_id, is_active);

-- ===== AI Conversations =====
CREATE TABLE ai_conversation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  conversation_no text NOT NULL,
  user_id text NOT NULL,
  user_role text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  domain text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'active',
  message_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, conversation_no),
  CHECK (domain IN ('inventory','sales','production','procurement','finance','general')),
  CHECK (status IN ('active','archived','deleted'))
);
CREATE TRIGGER ai_conversation_touch BEFORE UPDATE ON ai_conversation
  FOR EACH ROW EXECUTE FUNCTION ai_touch_updated_at();
CREATE INDEX idx_ai_conv_tenant ON ai_conversation(tenant_id);
CREATE INDEX idx_ai_conv_user ON ai_conversation(tenant_id, user_id);
CREATE INDEX idx_ai_conv_status ON ai_conversation(tenant_id, status);

-- ===== AI Messages (chat history) =====
CREATE TABLE ai_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  conversation_id text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  intent text NOT NULL DEFAULT 'general',
  domain text NOT NULL DEFAULT 'general',
  tokens_used integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  model_config_id text,
  model_name text NOT NULL DEFAULT '',
  action_plan jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_helpful boolean,
  feedback text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (role IN ('user','assistant','system')),
  CHECK (intent IN ('query','action','prediction','analysis','general')),
  CHECK (domain IN ('inventory','sales','production','procurement','finance','general'))
);
CREATE INDEX idx_ai_msg_conv ON ai_message(tenant_id, conversation_id);
CREATE INDEX idx_ai_msg_tenant ON ai_message(tenant_id);
CREATE INDEX idx_ai_msg_created ON ai_message(tenant_id, created_at DESC);

-- ===== AI Insights (predictions, anomaly detection, recommendations) =====
CREATE TABLE ai_insight (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  insight_no text NOT NULL,
  type text NOT NULL DEFAULT 'recommendation',
  domain text NOT NULL DEFAULT 'production',
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  summary text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_type text NOT NULL DEFAULT '',
  source_id text NOT NULL DEFAULT '',
  confidence numeric(5,2) NOT NULL DEFAULT 0.00,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  dismissed_by text NOT NULL DEFAULT '',
  dismissed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system',
  UNIQUE (tenant_id, insight_no),
  CHECK (type IN ('anomaly','prediction','recommendation','optimization','alert')),
  CHECK (domain IN ('inventory','sales','production','procurement','finance','general')),
  CHECK (severity IN ('critical','warning','info','success')),
  CHECK (status IN ('active','dismissed','expired','applied')),
  CHECK (confidence >= 0 AND confidence <= 100)
);
CREATE TRIGGER ai_insight_touch BEFORE UPDATE ON ai_insight
  FOR EACH ROW EXECUTE FUNCTION ai_touch_updated_at();
CREATE INDEX idx_ai_insight_tenant ON ai_insight(tenant_id);
CREATE INDEX idx_ai_insight_domain ON ai_insight(tenant_id, domain);
CREATE INDEX idx_ai_insight_status ON ai_insight(tenant_id, status);
CREATE INDEX idx_ai_insight_severity ON ai_insight(tenant_id, severity, status);

-- ===== AI Action Plans (for approval workflow) =====
CREATE TABLE ai_action_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  message_id text NOT NULL,
  conversation_id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  target_module text NOT NULL DEFAULT '',
  target_entity text NOT NULL DEFAULT '',
  target_action text NOT NULL DEFAULT '',
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  impact_scope text NOT NULL DEFAULT '',
  risk_level text NOT NULL DEFAULT 'low',
  data_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  approval_path text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  submitted_by text NOT NULL DEFAULT '',
  submitted_at timestamptz,
  approved_by text NOT NULL DEFAULT '',
  approved_at timestamptz,
  rejected_reason text NOT NULL DEFAULT '',
  executed_at timestamptz,
  execution_result jsonb,
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (risk_level IN ('low','medium','high','critical')),
  CHECK (status IN ('draft','submitted','approved','rejected','executed','cancelled'))
);
CREATE TRIGGER ai_action_plan_touch BEFORE UPDATE ON ai_action_plan
  FOR EACH ROW EXECUTE FUNCTION ai_touch_updated_at();
CREATE INDEX idx_ai_action_tenant ON ai_action_plan(tenant_id);
CREATE INDEX idx_ai_action_msg ON ai_action_plan(tenant_id, message_id);
CREATE INDEX idx_ai_action_status ON ai_action_plan(tenant_id, status);

-- ===== AI Audit Log =====
CREATE TABLE ai_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  aggregate_version bigint NOT NULL DEFAULT 1,
  action text NOT NULL,
  actor_id text NOT NULL DEFAULT '',
  before jsonb,
  after jsonb,
  correlation_id text NOT NULL DEFAULT '',
  trace_id text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_audit_tenant ON ai_audit_log(tenant_id);
CREATE INDEX idx_ai_audit_agg ON ai_audit_log(tenant_id, aggregate_type, aggregate_id);

-- ===== AI Idempotency =====
CREATE TABLE ai_idempotency_record (
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
CREATE INDEX idx_ai_idem_tenant ON ai_idempotency_record(tenant_id, command_type, idempotency_key);

-- ===== RLS Policies =====
ALTER TABLE ai_model_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversation ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insight ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_action_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_idempotency_record ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_tenant_iso_model ON ai_model_config
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ai_tenant_iso_conv ON ai_conversation
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ai_tenant_iso_msg ON ai_message
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ai_tenant_iso_insight ON ai_insight
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ai_tenant_iso_action ON ai_action_plan
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ai_tenant_iso_audit ON ai_audit_log
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ai_tenant_iso_idem ON ai_idempotency_record
  USING (tenant_id = current_setting('app.current_tenant_id', true));

ALTER TABLE ai_model_config FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_conversation FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_message FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_insight FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_action_plan FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_idempotency_record FORCE ROW LEVEL SECURITY;

-- ===== Seed default model config =====
INSERT INTO ai_model_config (tenant_id, code, name, provider, model_name, api_key_masked, base_url, temperature, max_tokens, timeout_seconds, is_active, is_primary, metadata, created_by) VALUES
  ('default', 'gpt-4o-primary', 'GPT-4o 主模型', 'openai', 'gpt-4o',
   'sk-****-7a3f', 'https://api.openai.com/v1', 0.30, 2048, 15, true, true,
   '{"capabilities":["chat","nl2sql","analysis"],"fallbackStrategy":"retry-then-fallback"}'::jsonb, 'system'),
  ('default', 'claude-backup', 'Claude 3.5 备用', 'anthropic', 'claude-3-5-sonnet-20241022',
   'sk-ant-****-b2c1', 'https://api.anthropic.com/v1', 0.20, 4096, 20, true, false,
   '{"capabilities":["chat","analysis"],"fallbackStrategy":"retry"}'::jsonb, 'system')
ON CONFLICT DO NOTHING;

COMMIT;
