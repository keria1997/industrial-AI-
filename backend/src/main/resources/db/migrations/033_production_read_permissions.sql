BEGIN;
INSERT INTO module_document (module, tenant_id, kind, doc_id, data)
SELECT 'platform', tenant.tenant_id, 'permission', permission.id,
  jsonb_build_object('id', permission.id, 'tenantId', tenant.tenant_id, 'code', permission.code,
    'name', permission.name, 'module', '生产管理', 'type', 'api', 'risk', 'normal', 'version', 1,
    'createdAt', now(), 'updatedAt', now())
FROM (SELECT DISTINCT tenant_id FROM module_document WHERE module='platform' AND kind='tenant') tenant
CROSS JOIN (VALUES
  ('PERM-PROD-DEMAND-READ', 'production.demand.read', '生产需求读取'),
  ('PERM-PROD-WORK-ORDER-READ', 'production.work-order.read', '生产工单读取'),
  ('PERM-PROD-TASK-READ', 'production.task.read', '生产任务读取'),
  ('PERM-PROD-QUALITY-READ', 'production.quality.read', '生产检验读取'),
  ('PERM-PROD-COMPLETION-READ', 'production.completion.read', '生产完工读取'),
  ('PERM-PROD-CLOSE-READ', 'production.close.read', '生产结案读取'),
  ('PERM-PROD-DASHBOARD-READ', 'production.dashboard.read', '生产驾驶舱读取')
) permission(id, code, name)
ON CONFLICT (module, tenant_id, kind, doc_id) DO NOTHING;
COMMIT;
