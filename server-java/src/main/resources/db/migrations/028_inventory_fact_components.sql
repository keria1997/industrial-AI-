-- Upgrade persisted legacy stock components; never copy frontend inventory seeds.
SET LOCAL app.bootstrap_mode = 'true';

WITH legacy AS (
    SELECT module, tenant_id, kind, doc_id, data,
        COALESCE(data ->> 'qualifiedOnHandQty', data ->> 'onHandQty')::numeric AS qualified,
        COALESCE(data ->> 'allocatedReservedQty', data ->> 'reservedQty', '0')::numeric AS allocated,
        COALESCE(data ->> 'frozenQty', '0')::numeric AS frozen,
        COALESCE(data ->> 'safetyStockQty', '0')::numeric AS safety,
        COALESCE(data ->> 'inTransitQty', '0')::numeric AS in_transit
    FROM module_document
    WHERE module = 'fulfillment' AND kind = 'availability'
      AND (data ? 'onHandQty' OR NOT data ? 'qualifiedOnHandQty'
        OR NOT data ? 'allocatedReservedQty' OR NOT data ? 'frozenQty'
        OR NOT data ? 'inTransitQty')
      AND COALESCE(data ->> 'qualifiedOnHandQty', data ->> 'onHandQty') IS NOT NULL
)
UPDATE module_document target
SET data = (target.data - 'onHandQty' - 'reservedQty') || jsonb_build_object(
        'qualifiedOnHandQty', legacy.qualified::text,
        'allocatedReservedQty', legacy.allocated::text,
        'frozenQty', legacy.frozen::text,
        'safetyStockQty', legacy.safety::text,
        'inTransitQty', legacy.in_transit::text,
        'fulfillableQty', GREATEST(legacy.qualified - legacy.allocated - legacy.frozen - legacy.safety, 0)::text,
        'formulaVersion', 'FULFILLABLE-V1',
        'factVersion', COALESCE((target.data ->> 'factVersion')::integer, 0) + 1,
        'sourceSystem', 'LEGACY_INVENTORY_MIGRATION',
        'sourceEventId', gen_random_uuid()::text,
        'asOf', COALESCE(target.data ->> 'asOf', target.data ->> 'updatedAt', now()::text)
    ),
    updated_at = now()
FROM legacy
WHERE target.module = legacy.module AND target.tenant_id = legacy.tenant_id
  AND target.kind = legacy.kind AND target.doc_id = legacy.doc_id;
