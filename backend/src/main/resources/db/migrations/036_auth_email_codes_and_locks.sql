BEGIN;

CREATE TABLE IF NOT EXISTS auth_email_code (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'PASSWORD_RESET',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_email_code_lookup_idx
  ON auth_email_code (email_hash, purpose, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS auth_email_code_active_uq
  ON auth_email_code (email_hash, purpose) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_login_lock (
  account TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE auth_email_code ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_login_lock ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_email_code FORCE ROW LEVEL SECURITY;
ALTER TABLE auth_login_lock FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_email_code_tenant_policy ON auth_email_code
  USING (current_setting('app.auth_lookup', true) = 'true')
  WITH CHECK (current_setting('app.auth_lookup', true) = 'true');
CREATE POLICY auth_login_lock_tenant_policy ON auth_login_lock
  USING (current_setting('app.auth_lookup', true) = 'true')
  WITH CHECK (current_setting('app.auth_lookup', true) = 'true');

COMMIT;
