BEGIN;
ALTER TABLE module_document NO FORCE ROW LEVEL SECURITY;

INSERT INTO module_document (module, tenant_id, kind, doc_id, data)
SELECT 'platform', tenant_id, 'permission', 'PERM-MPS-MENU',
  jsonb_build_object('id', 'PERM-MPS-MENU', 'tenantId', tenant_id,
    'code', 'production.mps.view', 'name', '主生产计划', 'module', '生产管理',
    'type', 'menu', 'risk', 'sensitive', 'version', 1,
    'createdAt', now(), 'updatedAt', now())
FROM module_document WHERE module = 'platform' AND kind = 'tenant'
ON CONFLICT (module, tenant_id, kind, doc_id) DO NOTHING;

UPDATE module_document
SET data = jsonb_set(data, '{grants}', COALESCE(data->'grants', '[]'::jsonb) ||
  jsonb_build_array(jsonb_build_object('roleId', doc_id, 'tenantId', tenant_id,
    'permissionId', 'PERM-MPS-MENU', 'effect', 'allow', 'version', 1, 'updatedAt', now())))
WHERE module = 'platform' AND kind = 'roleGrant' AND doc_id IN ('ROLE-ADMIN', 'ROLE-MFG')
  AND NOT (COALESCE(data->'grants', '[]'::jsonb) @> '[{"permissionId":"PERM-MPS-MENU"}]'::jsonb);

ALTER TABLE module_document FORCE ROW LEVEL SECURITY;
COMMIT;
