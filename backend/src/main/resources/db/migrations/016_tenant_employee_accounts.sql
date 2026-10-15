-- Tenant employee accounts: extend registered_users for sub-accounts

ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS is_tenant_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS first_login BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS position VARCHAR(100);
ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS employee_no VARCHAR(50);
ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_registered_users_tenant ON registered_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_registered_users_status ON registered_users(status);
