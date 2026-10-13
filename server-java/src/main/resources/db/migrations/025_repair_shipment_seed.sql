-- Bring the seeded SO-SEED-001 fulfillment projection up to the reserve/post contract.
BEGIN;
SET LOCAL app.tenant_id = 'TENANT-SHWS';

UPDATE module_document
SET data = data
    || jsonb_build_object(
        'allocatedReservedQty', COALESCE(data ->> 'allocatedReservedQty', '0'),
        'qualifiedOnHandQty', COALESCE(data ->> 'qualifiedOnHandQty', data ->> 'onHandQty', '0'),
        'frozenQty', COALESCE(data ->> 'frozenQty', '0'),
        'inTransitQty', COALESCE(data ->> 'inTransitQty', '0'),
        'formulaVersion', COALESCE(data ->> 'formulaVersion', 'FULFILLABLE-V1'),
        'updatedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
WHERE module = 'fulfillment'
  AND kind = 'availability'
  AND tenant_id = 'TENANT-SHWS'
  AND doc_id = 'TENANT-SHWS:WH-FG-01:PROD-1002';

-- PersistentJsonMap stores aggregates under the tenant-qualified in-memory key.
-- Older seed migrations used logical IDs, so list scans worked but get-by-id missed.
INSERT INTO module_document (module, tenant_id, kind, doc_id, data)
SELECT module, tenant_id, kind, tenant_id || ':' || doc_id, data
FROM module_document source
WHERE source.module = 'fulfillment'
  AND source.tenant_id = 'TENANT-SHWS'
  AND source.kind IN ('order', 'shipmentRequest', 'shipmentTask')
  AND source.doc_id IN ('so-seed-001', 'so-seed-002', 'request-seed-001', 'shipment-seed-001')
ON CONFLICT (module, tenant_id, kind, doc_id) DO UPDATE
SET data = EXCLUDED.data,
    updated_at = now();

DELETE FROM module_document
WHERE module = 'fulfillment'
  AND tenant_id = 'TENANT-SHWS'
  AND kind IN ('order', 'shipmentRequest', 'shipmentTask')
  AND doc_id IN ('so-seed-001', 'so-seed-002', 'request-seed-001', 'shipment-seed-001');

UPDATE module_document
SET data = jsonb_set(
        jsonb_set(
            data || jsonb_build_object(
                'shipmentStatus', 'REQUESTED',
                'totalAmount', '16000',
                'version', 2,
                'updatedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            ),
            '{lines,0,productId}', '"PROD-1002"'
        ),
        '{lines,0,activeRequestedQty}', '"10"'
    )
WHERE module = 'fulfillment'
  AND kind = 'order'
  AND tenant_id = 'TENANT-SHWS'
  AND doc_id = 'TENANT-SHWS:so-seed-001'
  AND COALESCE((data ->> 'version')::int, 0) < 2;

INSERT INTO module_document (module, tenant_id, kind, doc_id, data)
VALUES (
    'fulfillment', 'TENANT-SHWS', 'shipmentRequest', 'TENANT-SHWS:request-seed-001',
    jsonb_build_object(
        'id', 'request-seed-001',
        'tenantId', 'TENANT-SHWS',
        'requestNo', 'SR-SEED-001',
        'salesOrderId', 'so-seed-001',
        'warehouseId', 'WH-FG-01',
        'orderRevision', 1,
        'workflowStatus', 'REQUESTED',
        'availabilityStatus', 'UNCHECKED',
        'replenishmentStatus', 'NOT_REQUIRED',
        'postingStatus', 'NOT_STARTED',
        'version', 1,
        'correlationId', gen_random_uuid(),
        'createdBy', 'admin',
        'createdAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'updatedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'lines', jsonb_build_array(jsonb_build_object(
            'id', 'request-seed-001-line-1',
            'orderLineId', 'so-seed-001-line-1',
            'sourceLineRevision', 1,
            'productId', 'PROD-1002',
            'requestedQty', '10',
            'uom', 'PCS',
            'reservedQty', '0',
            'postedQty', '0',
            'shortageQty', '0'
        ))
    )
)
ON CONFLICT (module, tenant_id, kind, doc_id) DO UPDATE
SET data = EXCLUDED.data,
    updated_at = now()
WHERE module_document.data ->> 'workflowStatus' = 'REQUESTED';

UPDATE module_document
SET data = jsonb_build_object(
        'id', 'shipment-seed-001',
        'tenantId', 'TENANT-SHWS',
        'shipmentRequestId', 'request-seed-001',
        'salesOrderId', 'so-seed-001',
        'requestNo', 'SR-SEED-001',
        'salesOrderNo', 'SO-SEED-001',
        'orderRevision', 1,
        'allowPartialShipment', false,
        'warehouseId', 'WH-FG-01',
        'factoryResourceId', 'ORG-FAC-01',
        'workflowStatus', 'REQUESTED',
        'availabilityStatus', 'UNCHECKED',
        'replenishmentStatus', 'NOT_REQUIRED',
        'postingStatus', 'NOT_STARTED',
        'version', 1,
        'correlationId', gen_random_uuid(),
        'createdAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'updatedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'recipientSnapshot', (SELECT data -> 'recipient' FROM module_document
            WHERE module = 'fulfillment' AND tenant_id = 'TENANT-SHWS'
              AND kind = 'order' AND doc_id = 'so-seed-001'),
        'lines', jsonb_build_array(jsonb_build_object(
            'id', 'request-seed-001-line-1',
            'shipmentRequestLineId', 'request-seed-001-line-1',
            'orderLineId', 'so-seed-001-line-1',
            'sourceLineRevision', 1,
            'productId', 'PROD-1002',
            'requestedQty', '10',
            'reservedQty', '0',
            'postedQty', '0',
            'shortageQty', '0',
            'uom', 'PCS',
            'allowPartialShipment', false,
            'promisedDate', (SELECT data -> 'lines' -> 0 ->> 'promisedDate'
                FROM module_document
                WHERE module = 'fulfillment' AND tenant_id = 'TENANT-SHWS'
                  AND kind = 'order' AND doc_id = 'so-seed-001')
        ))
    ),
    updated_at = now()
WHERE module = 'fulfillment'
  AND kind = 'shipmentTask'
  AND tenant_id = 'TENANT-SHWS'
  AND doc_id = 'TENANT-SHWS:shipment-seed-001'
  AND data ->> 'workflowStatus' = 'REQUESTED'
  AND COALESCE(data ->> 'outboundId', '') = '';

COMMIT;
