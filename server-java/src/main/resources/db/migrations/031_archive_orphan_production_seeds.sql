-- Retain initialization samples for history; current MPS uses formal business demands.
UPDATE module_document
SET data = data || jsonb_build_object(
    'archived', true,
    'archivedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'archiveReason', 'Replaced orphan initialization samples with traceable business orders')
WHERE module = 'production' AND tenant_id = 'TENANT-SHWS' AND kind = 'demand'
  AND doc_id IN ('TENANT-SHWS:demand-seed-001', 'TENANT-SHWS:demand-seed-002', 'TENANT-SHWS:demand-seed-003');
