import type { AvailabilityFactDto, FulfillmentShipmentTask } from '../../../api/fulfillment';
import { addQuantity, compareQuantity, subtractQuantity } from '../../../shared/decimal';
import { inventoryUnitsCompatible } from '../../../shared/inventoryUnits';

export const formalShipmentStock = (
  task: FulfillmentShipmentTask,
  facts: AvailabilityFactDto[],
  selectedWarehouseId = task.warehouseId,
) => {
  const factsByProduct = new Map(facts.map(fact => [fact.productId, fact]));
  const freeByProduct = new Map(facts.map(fact => [fact.productId, fact.fulfillableQty]));
  return task.lines.map(line => {
    const fact = factsByProduct.get(line.productId);
    const unitMismatch = Boolean(fact && !inventoryUnitsCompatible(line.uom, fact.uom));
    const usableFact = fact && fact.warehouseId === selectedWarehouseId && !unitMismatch;
    const remaining = subtractQuantity(line.requestedQty, line.postedQty);
    const reserved = selectedWarehouseId !== task.warehouseId || (fact && !usableFact)
      ? '0' : subtractQuantity(line.reservedQty, line.postedQty);
    const free = usableFact ? freeByProduct.get(line.productId) ?? '0' : '0';
    const unreserved = subtractQuantity(remaining, reserved);
    const allocated = compareQuantity(free, unreserved) > 0 ? unreserved : free;
    freeByProduct.set(line.productId, subtractQuantity(free, allocated));
    const available = addQuantity(reserved, allocated);
    return {
      lineId: line.id, orderLineId: line.orderLineId, productId: line.productId,
      qty: Number(line.requestedQty), shippedQty: Number(line.postedQty),
      remainingQty: Number(remaining), availQty: Number(available),
      shortage: Number(subtractQuantity(remaining, available)),
      uom: line.uom, unit: line.uom, factVersion: fact?.factVersion, warehouseId: fact?.warehouseId,
      unitMismatch, inventoryUom: fact?.uom,
      allowPartialShipment: line.allowPartialShipment, promisedDate: line.promisedDate,
      sourceLineRevision: line.sourceLineRevision,
    };
  });
};
