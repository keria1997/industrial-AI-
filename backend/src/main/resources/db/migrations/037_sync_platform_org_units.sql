BEGIN;

ALTER TABLE iam_tenant ADD COLUMN IF NOT EXISTS source_id text;
CREATE UNIQUE INDEX IF NOT EXISTS iam_tenant_source_id_uq
  ON iam_tenant (source_id);

ALTER TABLE iam_org_unit ADD COLUMN IF NOT EXISTS source_id text;
ALTER TABLE iam_org_unit ADD COLUMN IF NOT EXISTS source_parent_id text;
ALTER TABLE iam_org_unit ADD COLUMN IF NOT EXISTS source_manager_employee_id text;
ALTER TABLE iam_org_unit ADD COLUMN IF NOT EXISTS api_snapshot jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS iam_org_unit_source_id_uq
  ON iam_org_unit (tenant_id, source_id);

INSERT INTO iam_tenant (
  id, source_id, code, name, edition, status, bootstrap_owner_account_id,
  formal_admin_account_id, expire_at, row_version, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  tenant_doc.doc_id,
  COALESCE(tenant_doc.data->>'code', tenant_doc.doc_id),
  COALESCE(tenant_doc.data->>'name', tenant_doc.doc_id),
  COALESCE(tenant_doc.data->>'edition', 'standard'),
  CASE WHEN tenant_doc.data->>'status' IN
      ('init_created','init_org_ready','init_permission_ready','running','disabled','expired','init_blocked')
    THEN tenant_doc.data->>'status' ELSE 'running' END,
  NULLIF(tenant_doc.data->>'bootstrapOwnerAccountId', ''),
  NULLIF(tenant_doc.data->>'formalAdminAccountId', ''),
  NULLIF(tenant_doc.data->>'expireAt', '')::timestamptz,
  COALESCE((tenant_doc.data->>'version')::bigint, 1),
  COALESCE((tenant_doc.data->>'createdAt')::timestamptz, tenant_doc.created_at, now()),
  COALESCE((tenant_doc.data->>'updatedAt')::timestamptz, tenant_doc.updated_at, now())
FROM module_document AS tenant_doc
WHERE module = 'platform' AND kind = 'tenant'
ON CONFLICT (source_id) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  edition = EXCLUDED.edition,
  status = EXCLUDED.status,
  bootstrap_owner_account_id = EXCLUDED.bootstrap_owner_account_id,
  formal_admin_account_id = EXCLUDED.formal_admin_account_id,
  expire_at = EXCLUDED.expire_at,
  row_version = GREATEST(iam_tenant.row_version, EXCLUDED.row_version),
  updated_at = now();

INSERT INTO iam_org_unit (
  id, tenant_id, source_id, code, name, type,
  source_parent_id, source_manager_employee_id, status,
  row_version, created_at, updated_at, api_snapshot
)
SELECT
  gen_random_uuid(),
  tenant.id,
  org_doc.doc_id,
  COALESCE(NULLIF(org_doc.data->>'code', ''), org_doc.doc_id),
  org_doc.data->>'name',
  org_doc.data->>'type',
  NULLIF(org_doc.data->>'parentId', ''),
  NULLIF(org_doc.data->>'managerEmployeeId', ''),
  CASE WHEN org_doc.data->>'status' IN ('enabled','disabled')
    THEN org_doc.data->>'status' ELSE 'enabled' END,
  COALESCE((org_doc.data->>'version')::bigint, 1),
  COALESCE((org_doc.data->>'createdAt')::timestamptz, org_doc.created_at, now()),
  COALESCE((org_doc.data->>'updatedAt')::timestamptz, org_doc.updated_at, now()),
  org_doc.data
FROM module_document AS org_doc
JOIN iam_tenant AS tenant ON tenant.source_id = org_doc.tenant_id
WHERE module = 'platform' AND kind = 'orgUnit'
ON CONFLICT (tenant_id, source_id) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  source_parent_id = EXCLUDED.source_parent_id,
  source_manager_employee_id = EXCLUDED.source_manager_employee_id,
  status = EXCLUDED.status,
  row_version = GREATEST(iam_org_unit.row_version, EXCLUDED.row_version),
  api_snapshot = EXCLUDED.api_snapshot,
  updated_at = now();

ALTER TABLE iam_org_unit ALTER COLUMN source_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS iam_org_unit_source_parent_idx
  ON iam_org_unit (tenant_id, source_parent_id);

COMMIT;
