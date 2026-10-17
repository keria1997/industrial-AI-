import { useCallback, useEffect, useRef, useState } from 'react';
import { inventoryApi, type ApiContext, type WarehouseDto } from '../../../api/fulfillment';
import { buildFormalInventory } from './formalInventory';
import { createInventoryMasterDataSeed, type InventoryMasterData, type InventoryStockFact } from './inventoryMasterData';

type Snapshot = {
  key: string;
  status: 'loading' | 'ready' | 'error';
  error: string;
  warehouses: WarehouseDto[];
  masterData: InventoryMasterData;
  stockData: InventoryStockFact[];
};

export const useFormalInventory = (context: ApiContext | null) => {
  const key = context ? `${context.tenantId}:${context.accessToken}` : '';
  const revision = useRef(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    const empty = { key, warehouses: [], masterData: createInventoryMasterDataSeed(), stockData: [], error: '' };
    setSnapshot(previous => ({
      ...empty,
      ...(previous?.key === key ? { warehouses: previous.warehouses, masterData: previous.masterData } : {}),
      status: context ? 'loading' : 'error',
      error: context ? '' : '请登录后查看库存',
    }));
    if (!context) return;
    try {
      const [warehouses, facts, products, materials] = await Promise.all([
        inventoryApi.listWarehouses(context), inventoryApi.listAvailability(context),
        inventoryApi.listProducts(context), inventoryApi.listMaterials(context),
      ]);
      if (request !== revision.current) return;
      setSnapshot({
        key, status: 'ready', error: '', warehouses: warehouses.items,
        ...buildFormalInventory(createInventoryMasterDataSeed(),
          warehouses.items, facts, products.items, materials.items),
      });
    } catch (error) {
      if (request !== revision.current) return;
      setSnapshot({ ...empty, status: 'error', error: error instanceof Error ? error.message : '库存加载失败，请重试' });
    }
  }, [key]);

  useEffect(() => {
    void refresh();
    const changed = (event: Event) => {
      const tenantId = (event as CustomEvent<{ tenantId?: string }>).detail?.tenantId;
      if (!tenantId || tenantId === context?.tenantId) void refresh();
    };
    window.addEventListener('focus', changed);
    window.addEventListener('sales-fulfillment-changed', changed);
    window.addEventListener('inventory-master-data-changed', changed);
    return () => {
      ++revision.current;
      window.removeEventListener('focus', changed);
      window.removeEventListener('sales-fulfillment-changed', changed);
      window.removeEventListener('inventory-master-data-changed', changed);
    };
  }, [refresh]);

  const current = snapshot?.key === key ? snapshot : null;
  return {
    status: current?.status || 'loading' as const,
    error: current?.error || '',
    warehouses: current?.warehouses || [],
    masterData: current?.masterData,
    stockData: current?.stockData || [],
    refresh,
  };
};
