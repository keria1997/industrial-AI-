-- Promote reviewed sales-domain customers to the canonical supply-chain master.
-- Stable IDs are intentionally preserved so sales-order references remain valid.
-- The fulfillment/customer records remain as a legacy projection and are not deleted.

DO $$
DECLARE
  duplicate_source_name text;
BEGIN
  SELECT source.data->>'name' INTO duplicate_source_name
  FROM module_document source
  JOIN module_document canonical
    ON canonical.module = 'supplychain'
   AND canonical.kind = 'customer'
   AND canonical.tenant_id = source.tenant_id
   AND canonical.data->>'name' = source.data->>'name'
  WHERE source.module = 'fulfillment'
    AND source.kind = 'customer'
    AND source.data->>'status' = 'active'
  LIMIT 1;

  IF duplicate_source_name IS NOT NULL THEN
    RAISE EXCEPTION 'Customer name conflicts with canonical master: %', duplicate_source_name;
  END IF;
END
$$;

INSERT INTO module_document (
  module, tenant_id, kind, doc_id, data, created_at, updated_at
)
SELECT
  'supplychain',
  source.tenant_id,
  'customer',
  source.data->>'id',
  jsonb_build_object(
    'id', source.data->>'id',
    'tenantId', source.tenant_id,
    'customerNo', source.data->>'code',
    'name', source.data->>'name',
    'creditCode', '',
    'legalRepresentative', '',
    'operationStatus', '',
    'businessStatus', '',
    'enterpriseSize', '',
    'industry', source.data->>'industry',
    'revenue', '0',
    'receivable', '0',
    'overdueDays', 0,
    'exposureLevel', '低',
    'pressureLevel', '低',
    'role', 'sales-customer',
    'alerts', '[]'::jsonb,
    'status', source.data->>'status',
    'metadata', jsonb_build_object(
      'canonicalSourceModule', 'fulfillment',
      'canonicalSourceKind', 'customer',
      'reconciledAt', now()
    ),
    'remark', 'Promoted from reviewed sales-domain customer master',
    'version', 1,
    'createdAt', now(),
    'updatedAt', now(),
    'createdBy', 'migration-035'
  ),
  now(),
  now()
FROM module_document source
WHERE source.module = 'fulfillment'
  AND source.kind = 'customer'
  AND source.data->>'status' = 'active'
  AND source.data ? 'id'
  AND source.data ? 'name'
  AND NOT EXISTS (
    SELECT 1 FROM module_document canonical
    WHERE canonical.module = 'supplychain'
      AND canonical.kind = 'customer'
      AND canonical.tenant_id = source.tenant_id
      AND canonical.data->>'id' = source.data->>'id'
  );
