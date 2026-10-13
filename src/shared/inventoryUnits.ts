const singleItemUnits = new Set(['PCS', '件', '台', '个']);

export const canonicalInventoryUnit = (unit: string): string =>
  singleItemUnits.has(unit) ? 'PCS' : unit;

export const inventoryUnitsCompatible = (left: string, right: string): boolean =>
  Boolean(left && right) && canonicalInventoryUnit(left) === canonicalInventoryUnit(right);
