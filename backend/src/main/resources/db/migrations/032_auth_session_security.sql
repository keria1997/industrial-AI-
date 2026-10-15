BEGIN;

ALTER TABLE registered_users DROP CONSTRAINT IF EXISTS registered_users_tenant_id_key;
ALTER TABLE registered_users ALTER COLUMN permissions SET DEFAULT '[]'::jsonb;
ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS session_version BIGINT NOT NULL DEFAULT 1;
UPDATE registered_users SET permissions = permissions - '*'
WHERE NOT is_tenant_admin AND jsonb_typeof(permissions) = 'array' AND permissions ? '*';

-- Global identity discovery is read-only; all identity writes still bind a tenant.
ALTER TABLE registered_users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS registered_users_auth_lookup ON registered_users;
CREATE POLICY registered_users_auth_lookup ON registered_users FOR SELECT
USING (current_setting('app.auth_lookup', true) = 'true');

-- Invalidate previously exposed plaintext reset links.
DELETE FROM password_reset_tokens;
CREATE TABLE IF NOT EXISTS auth_consumed_session (
  jti VARCHAR(64) PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_consumed_session_expiry ON auth_consumed_session(expires_at);

COMMIT;
