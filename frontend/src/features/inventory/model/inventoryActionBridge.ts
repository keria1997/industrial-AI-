export const suggestInventoryReplenishmentQty = (availableQty: number, safetyStock: number) =>
  Math.max(1, Math.ceil(Number(safetyStock || 0) - Number(availableQty || 0)));
