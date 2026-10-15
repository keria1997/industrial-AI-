export type OutboundShipmentStockLine = {
  lineId?: string;
  orderLineId?: string;
  productId: string;
  qty?: number;
  requestedQty?: number;
  shippedQty?: number;
  postedQty?: number;
  remainingQty?: number;
  availQty: number;
  factVersion?: number;
  warehouseId?: string;
  allowPartialShipment?: boolean;
};

export type OutboundShipmentAction = 'missing-product' | 'production-only' | 'partial-shipment' | 'ship' | 'not-loaded';

export type OutboundShipmentDecision = {
  action: OutboundShipmentAction;
  activeLines: OutboundShipmentStockLine[];
  shippableLines: OutboundShipmentStockLine[];
  shortageLines: OutboundShipmentStockLine[];
  missingProductIds: string[];
  allowPartial: boolean;
};

export const classifyOutboundShipment = (
  lines: OutboundShipmentStockLine[] | undefined | null,
  options: { allowPartialShipment?: boolean } = {},
): OutboundShipmentDecision => {
  const activeLines = (lines || []).filter(line => Number(line.remainingQty ?? line.qty ?? line.requestedQty ?? 0) > 0);
  const missingProductIds = activeLines
    .filter(line => line.factVersion == null || line.warehouseId == null)
    .map(line => line.productId);

  if (!activeLines.length) {
    return { action: 'not-loaded', activeLines: [], shippableLines: [], shortageLines: [], missingProductIds: [], allowPartial: false };
  }
  if (missingProductIds.length === activeLines.length) {
    return { action: 'missing-product', activeLines, shippableLines: [], shortageLines: [], missingProductIds, allowPartial: false };
  }

  const shippableLines = activeLines.filter(line => Number(line.availQty) > 0);
  const shortageLines = activeLines.filter(line => Number(line.availQty) < Number(line.remainingQty ?? line.qty ?? line.requestedQty ?? 0));
  const allowPartial = options.allowPartialShipment !== false
    && activeLines.every(line => line.allowPartialShipment !== false);

  if (shippableLines.length > 0 && shortageLines.length > 0 && allowPartial) {
    return { action: 'partial-shipment', activeLines, shippableLines, shortageLines, missingProductIds, allowPartial };
  }
  if (shortageLines.length > 0 && (shippableLines.length === 0 || !allowPartial)) {
    return { action: 'production-only', activeLines, shippableLines, shortageLines, missingProductIds, allowPartial };
  }
  if (shortageLines.length === 0) {
    return { action: 'ship', activeLines, shippableLines, shortageLines: [], missingProductIds, allowPartial };
  }
  return { action: 'not-loaded', activeLines, shippableLines, shortageLines, missingProductIds, allowPartial };
};
