-- Upgrade the initial fulfillment order seeds to the current order contract.
BEGIN;
SET LOCAL app.tenant_id = 'TENANT-SHWS';

UPDATE module_document
SET data = data
    || jsonb_build_object('ownerEmployeeId', 'admin', 'fulfillmentWarehouseId', 'WH-FG-01')
    || jsonb_build_object('recipient', jsonb_build_object(
        'name', CASE doc_id WHEN 'so-seed-001' THEN 'Shanghai Receiver' ELSE 'Suzhou Receiver' END,
        'phoneMasked', CASE doc_id WHEN 'so-seed-001' THEN '138****8000' ELSE '139****9000' END,
        'country', 'China', 'province', CASE doc_id WHEN 'so-seed-001' THEN 'Shanghai' ELSE 'Jiangsu' END,
        'city', CASE doc_id WHEN 'so-seed-001' THEN 'Shanghai' ELSE 'Suzhou' END,
        'address', CASE doc_id
            WHEN 'so-seed-001' THEN 'Century Avenue 100'
            ELSE 'Suzhou Industrial Park 88' END))
    || jsonb_build_object('lines', jsonb_build_array(jsonb_build_object(
        'id', doc_id || '-line-1',
        'lineNo', 1,
        'productId', CASE doc_id WHEN 'so-seed-001' THEN 'PROD-1001' ELSE 'PROD-1003' END,
        'orderedQty', CASE doc_id WHEN 'so-seed-001' THEN '80' ELSE '100' END,
        'shippedQty', '0',
        'activeRequestedQty', '0',
        'reservedQty', '0',
        'remainingQty', CASE doc_id WHEN 'so-seed-001' THEN '80' ELSE '100' END,
        'uom', 'PCS',
        'unitPrice', CASE doc_id WHEN 'so-seed-001' THEN '1600' ELSE '3860' END,
        'taxRate', '0',
        'promisedDate', data->>'requestedDeliveryDate',
        'allowPartialShipment', COALESCE((data->>'allowPartialShipment')::boolean, false),
        'lineStatus', 'OPEN',
        'version', 1)))
WHERE module = 'fulfillment'
  AND kind = 'order'
  AND doc_id IN ('so-seed-001', 'so-seed-002');

COMMIT;
