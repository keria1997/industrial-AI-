SET LOCAL app.tenant_id = 'TENANT-SHWS';

UPDATE module_document
SET data = jsonb_set(data, '{metadata}', (data ->> 'metadata')::jsonb)
WHERE tenant_id = 'TENANT-SHWS'
  AND jsonb_typeof(data -> 'metadata') = 'string';

UPDATE module_document
SET data = jsonb_set(data, '{detail}', (data ->> 'detail')::jsonb)
WHERE tenant_id = 'TENANT-SHWS'
  AND jsonb_typeof(data -> 'detail') = 'string';

UPDATE module_document
SET data = jsonb_set(data, '{alerts}', (data ->> 'alerts')::jsonb)
WHERE tenant_id = 'TENANT-SHWS'
  AND jsonb_typeof(data -> 'alerts') = 'string';
