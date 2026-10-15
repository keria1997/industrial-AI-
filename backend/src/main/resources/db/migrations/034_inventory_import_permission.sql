BEGIN;

INSERT INTO module_document (module, tenant_id, kind, doc_id, data)
SELECT 'platform', tenant.tenant_id, 'permission', permission.id,
  jsonb_build_object('id', permission.id, 'tenantId', tenant.tenant_id, 'code', permission.code,
    'name', permission.name, 'module', '库存管理', 'type', 'api', 'risk', 'critical', 'version', 1,
    'createdAt', now(), 'updatedAt', now())
FROM (SELECT DISTINCT tenant_id FROM module_document WHERE module='platform' AND kind='tenant') tenant
CROSS JOIN (VALUES
  ('PERM-INVENTORY-IMPORT', 'inventory.availability.import', 'WMS库存快照导入')
) permission(id, code, name)
ON CONFLICT (module, tenant_id, kind, doc_id) DO NOTHING;

INSERT INTO module_document (module, tenant_id, kind, doc_id, data)
SELECT 'platform', existing_grant.tenant_id, 'roleGrant', existing_grant.doc_id,
  jsonb_build_object('id', existing_grant.doc_id, 'tenantId', existing_grant.tenant_id, 'roleId', 'ROLE-WMS',
    'permissionId', 'PERM-INVENTORY-IMPORT', 'effect', 'allow', 'version', 1,
    'createdAt', now(), 'updatedAt', now())
FROM (
  SELECT DISTINCT tenant_id, 'ROLE-WMS:PERM-INVENTORY-IMPORT' AS doc_id
  FROM module_document
  WHERE module='platform' AND kind='roleGrant' AND data->>'roleId'='ROLE-WMS'
) existing_grant
ON CONFLICT (module, tenant_id, kind, doc_id) DO NOTHING;

COMMIT;
