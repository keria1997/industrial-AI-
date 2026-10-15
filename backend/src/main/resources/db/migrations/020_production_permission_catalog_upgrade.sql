-- Upgrade existing platform JSON baselines with production routing permissions.
BEGIN;

ALTER TABLE module_document NO FORCE ROW LEVEL SECURITY;

INSERT INTO module_document (module, tenant_id, kind, doc_id, data)
SELECT
  'platform',
  tenant.tenant_id,
  'permission',
  permission.id,
  jsonb_build_object(
    'id', permission.id,
    'tenantId', tenant.tenant_id,
    'code', permission.code,
    'name', permission.name,
    'module', '生产管理',
    'type', permission.type,
    'risk', permission.risk,
    'version', 1,
    'createdAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
FROM (
  SELECT DISTINCT tenant_id
  FROM module_document
  WHERE module = 'platform' AND kind = 'tenant'
) AS tenant
CROSS JOIN (VALUES
  ('PERM-PROD-DEMAND-REVIEW', 'production.demand.review', '生产需求校验', 'api', 'sensitive'),
  ('PERM-PROD-DEMAND-APPROVE', 'production.demand.approve', '生产需求审批', 'api', 'critical'),
  ('PERM-PROD-DEMAND-CLAIM', 'production.demand.claim', '生产需求接收', 'api', 'sensitive'),
  ('PERM-PROD-MRP-RUN', 'production.mrp.run', 'MRP展算执行', 'api', 'sensitive'),
  ('PERM-PROD-APS-RUN', 'production.aps.run', 'APS排程执行', 'api', 'sensitive')
) AS permission(id, code, name, type, risk)
ON CONFLICT (module, tenant_id, kind, doc_id) DO NOTHING;

UPDATE module_document grant_doc
SET data = jsonb_set(
  grant_doc.data,
  '{grants}',
  COALESCE(grant_doc.data->'grants', '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object('roleId', 'ROLE-MFG', 'tenantId', grant_doc.tenant_id, 'permissionId', 'PERM-PROD-DEMAND-REVIEW', 'effect', 'allow', 'version', 1, 'updatedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    jsonb_build_object('roleId', 'ROLE-MFG', 'tenantId', grant_doc.tenant_id, 'permissionId', 'PERM-PROD-DEMAND-APPROVE', 'effect', 'allow', 'version', 1, 'updatedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    jsonb_build_object('roleId', 'ROLE-MFG', 'tenantId', grant_doc.tenant_id, 'permissionId', 'PERM-PROD-DEMAND-CLAIM', 'effect', 'allow', 'version', 1, 'updatedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    jsonb_build_object('roleId', 'ROLE-MFG', 'tenantId', grant_doc.tenant_id, 'permissionId', 'PERM-PROD-MRP-RUN', 'effect', 'allow', 'version', 1, 'updatedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    jsonb_build_object('roleId', 'ROLE-MFG', 'tenantId', grant_doc.tenant_id, 'permissionId', 'PERM-PROD-APS-RUN', 'effect', 'allow', 'version', 1, 'updatedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  )
)
FROM (
  SELECT DISTINCT tenant_id
  FROM module_document
  WHERE module = 'platform' AND kind = 'tenant'
) AS tenant
WHERE grant_doc.module = 'platform'
  AND grant_doc.tenant_id = tenant.tenant_id
  AND grant_doc.kind = 'roleGrant'
  AND grant_doc.doc_id IN ('ROLE-ADMIN', 'ROLE-MFG')
  AND NOT (grant_doc.data->'grants' @> jsonb_build_array(jsonb_build_object('permissionId', 'PERM-PROD-DEMAND-CLAIM')));

ALTER TABLE module_document FORCE ROW LEVEL SECURITY;

COMMIT;
