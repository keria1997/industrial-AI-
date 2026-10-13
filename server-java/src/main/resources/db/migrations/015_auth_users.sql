-- Registered users, SMS codes, password reset tokens

CREATE TABLE IF NOT EXISTS registered_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(200) NOT NULL,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  tenant_id VARCHAR(100) UNIQUE NOT NULL,
  tenant_name VARCHAR(200) NOT NULL,
  industry VARCHAR(100) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT '老板',
  permissions JSONB NOT NULL DEFAULT '["*"]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registered_users_phone ON registered_users(phone);
CREATE INDEX IF NOT EXISTS idx_registered_users_email ON registered_users(email);

CREATE TABLE IF NOT EXISTS sms_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_codes_phone ON sms_codes(phone, expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(64) UNIQUE NOT NULL,
  email VARCHAR(200) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);

-- RLS
ALTER TABLE registered_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY registered_users_tenant_isolation ON registered_users
  USING (tenant_id = current_setting('app.tenant_id', true));
