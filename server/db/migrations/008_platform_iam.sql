-- Platform IAM: tenant, org, identity, access, audit and session governance.
BEGIN;

CREATE OR REPLACE FUNCTION iam_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE iam_tenant (
  id text PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  edition text NOT NULL DEFAULT 'standard',
  status text NOT NULL DEFAULT 'init_created',
  bootstrap_owner_account_id text,
  formal_admin_account_id text,
  expire_at timestamptz,
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('init_created','init_org_ready','init_permission_ready','running','disabled','expired','init_blocked'))
);

CREATE TABLE iam_org_unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES iam_tenant(id),
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  parent_id uuid,
  manager_employee_id uuid,
  status text NOT NULL DEFAULT 'enabled',
  sort_order integer NOT NULL DEFAULT 0,
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (type IN ('company','department','factory','workshop')),
  CHECK (status IN ('enabled','disabled'))
);

CREATE TABLE iam_enterprise_resource (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  owner_org_id uuid NOT NULL,
  factory_org_id uuid,
  workshop_org_id uuid,
  manager_employee_id uuid,
  specification text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'enabled',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (type IN ('line','warehouse','work_center')),
  CHECK (status IN ('enabled','disabled'))
);

CREATE TABLE iam_position (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  org_id uuid NOT NULL,
  default_role_ids text[] NOT NULL DEFAULT '{}',
  resource_ids text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'enabled',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (status IN ('enabled','disabled'))
);

CREATE TABLE iam_employee (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  employee_no text NOT NULL,
  name text NOT NULL,
  primary_org_id uuid NOT NULL,
  primary_position_id uuid,
  mobile text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_no),
  CHECK (status IN ('active','transferring','leave','resigned'))
);

CREATE TABLE iam_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  login_name text NOT NULL,
  employee_id uuid NOT NULL,
  auth_type text NOT NULL DEFAULT 'password',
  status text NOT NULL DEFAULT 'pending_activation',
  direct_role_ids text[] NOT NULL DEFAULT '{}',
  password_hash text,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, login_name),
  CHECK (auth_type IN ('password','sso','legacy_erp')),
  CHECK (status IN ('pending_activation','enabled','locked','disabled'))
);

CREATE TABLE iam_role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  data_scope text NOT NULL DEFAULT 'tenant_all',
  scope_values text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'enabled',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (status IN ('enabled','disabled')),
  CHECK (data_scope IN ('tenant_all','org_tree','factory_set','warehouse_set','customer_owner','supplier_buyer'))
);

CREATE TABLE iam_permission_resource (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  module text NOT NULL,
  type text NOT NULL,
  risk text NOT NULL DEFAULT 'normal',
  UNIQUE (tenant_id, code),
  CHECK (type IN ('menu','page','button','api','field','export','ai')),
  CHECK (risk IN ('normal','sensitive','critical'))
);

CREATE TABLE iam_role_grant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  role_id uuid NOT NULL,
  permission_id uuid NOT NULL,
  effect text NOT NULL,
  field_mode text,
  UNIQUE (tenant_id, role_id, permission_id),
  CHECK (effect IN ('allow','deny')),
  CHECK (field_mode IS NULL OR field_mode IN ('visible','hidden','masked','readonly','export_denied'))
);

CREATE TABLE iam_permission_adapter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  permission_code text NOT NULL,
  permission_name text NOT NULL,
  module text NOT NULL,
  legacy_role_code text NOT NULL,
  legacy_scope text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  last_sync_at timestamptz,
  error_message text NOT NULL DEFAULT '',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('draft','pending_sync','synced','conflict','failed','disabled'))
);

CREATE TABLE iam_approval_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  module text NOT NULL,
  document_type text NOT NULL,
  resolver text NOT NULL,
  resolver_value text NOT NULL,
  fallback text NOT NULL DEFAULT 'block',
  status text NOT NULL DEFAULT 'enabled',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (resolver IN ('by_role','by_position','by_org_manager')),
  CHECK (fallback IN ('block','tenant_admin','unassigned_pool')),
  CHECK (status IN ('enabled','disabled'))
);

CREATE TABLE iam_dictionary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  category text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'enabled',
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, category, code),
  CHECK (status IN ('enabled','disabled'))
);

CREATE TABLE iam_parameter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  value text NOT NULL,
  value_type text NOT NULL DEFAULT 'text',
  effective_mode text NOT NULL DEFAULT 'immediate',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (value_type IN ('integer','boolean','text')),
  CHECK (effective_mode IN ('immediate','next_login'))
);

CREATE TABLE iam_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  operator text NOT NULL,
  module text NOT NULL,
  action text NOT NULL,
  target text NOT NULL DEFAULT '',
  result text NOT NULL DEFAULT 'success',
  trace_id text NOT NULL,
  ip_address text,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (result IN ('success','failed','denied'))
);

CREATE INDEX iam_audit_lookup_idx ON iam_audit_log (tenant_id, module, occurred_at);

CREATE TABLE iam_session_revocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  account text NOT NULL,
  jti text,
  reason text NOT NULL DEFAULT 'logout',
  revoked_by text NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX iam_session_revocation_lookup_idx ON iam_session_revocation (tenant_id, account, expires_at);

CREATE TABLE iam_capability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  quota text NOT NULL DEFAULT '',
  used text NOT NULL DEFAULT '',
  UNIQUE (tenant_id, code)
);

CREATE TABLE iam_idempotency_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  command_type text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  trace_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, command_type, idempotency_key)
);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'iam_org_unit','iam_enterprise_resource','iam_position','iam_employee',
    'iam_account','iam_role','iam_permission_adapter','iam_approval_rule',
    'iam_parameter'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION iam_touch_updated_at()', tbl || '_touch', tbl);
  END LOOP;
END $$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'iam_org_unit','iam_enterprise_resource','iam_position','iam_employee',
    'iam_account','iam_role','iam_permission_resource','iam_role_grant',
    'iam_permission_adapter','iam_approval_rule','iam_dictionary','iam_parameter',
    'iam_audit_log','iam_session_revocation','iam_capability','iam_idempotency_record'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('CREATE POLICY %I ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))', tbl || '_tenant_policy', tbl);
  END LOOP;
END $$;

COMMIT;
