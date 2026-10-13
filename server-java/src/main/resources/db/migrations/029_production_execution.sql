-- Normalize historical production keys once, retaining newer command documents.
DELETE FROM module_document legacy
USING module_document current
WHERE legacy.module = 'production' AND current.module = legacy.module
  AND current.tenant_id = legacy.tenant_id AND current.kind = legacy.kind
  AND current.doc_id = legacy.tenant_id || ':' || legacy.doc_id
  AND legacy.doc_id NOT LIKE legacy.tenant_id || ':%';
UPDATE module_document
SET doc_id = tenant_id || ':' || doc_id
WHERE module = 'production' AND doc_id NOT LIKE tenant_id || ':%';

-- Reference BOM is configuration only; material quantities come from inventory.
-- Nested FG001 -> SA101 is flattened, including 5%/2% material loss.
INSERT INTO module_document(module, tenant_id, kind, doc_id, data)
VALUES ('production', 'TENANT-SHWS', 'bomSnapshot', 'TENANT-SHWS:FG001',
  '{"id":"BOM-FG001-V1.2","tenantId":"TENANT-SHWS","productId":"FG001","version":1,
    "routingSnapshotId":"ROUTE-FG001-V1","sourceSystem":"REFERENCE_BOM","lines":[
      {"materialId":"RM201","materialName":"AI算力芯片","qtyPer":"2.1","uom":"PCS","warehouseId":"WH-RM-01"},
      {"materialId":"RM202","materialName":"12层空PCB板","qtyPer":"1.02","uom":"PCS","warehouseId":"WH-RM-01"},
      {"materialId":"RM305","materialName":"铝合金防护外壳","qtyPer":"1","uom":"PCS","warehouseId":"WH-RM-01"}
    ]}'::jsonb)
ON CONFLICT (module, tenant_id, kind, doc_id) DO NOTHING;
