/**
 * 统一 API 数据加载 Hook
 *
 * 替代 localStorage/硬编码数据：从后端 API 获取数据，失败时返回空数组。
 * 调用链路: 页面组件 -> useApiData -> api/*.ts -> 后端 Controller -> PostgreSQL
 */

import { useState, useEffect, useCallback } from 'react';
import type { ApiContext } from '../api/client';
import {
  listFulfillmentOrders,
  listFulfillmentShipmentTasks,
  inventoryApi,
  type FulfillmentOrder,
  type FulfillmentShipmentTask,
} from '../api/fulfillment';
import { listProductionDemands } from '../api/production/salesProduction';
import { productionOperationsApi } from '../api/production/operations';

export interface ApiDataState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function useApiEndpoint<T>(
  fetcher: (ctx: ApiContext) => Promise<T[]>,
  context: ApiContext | null,
): ApiDataState<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!context?.accessToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher(context)
      .then(result => { if (!cancelled) setData(result); })
      .catch(err => { if (!cancelled) setError(err?.message ?? '加载失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [context?.accessToken, tick]);

  return { data, loading, error, refresh };
}

export function useSalesOrders(context: ApiContext | null) {
  return useApiEndpoint<FulfillmentOrder>(async ctx => {
    const res = await listFulfillmentOrders(ctx);
    return res.items;
  }, context);
}

export function useShipmentTasks(context: ApiContext | null) {
  return useApiEndpoint<FulfillmentShipmentTask>(async ctx => {
    const res = await listFulfillmentShipmentTasks(ctx);
    return res.items;
  }, context);
}

export function useInventoryAvailability(context: ApiContext | null) {
  return useApiEndpoint(ctx => inventoryApi.listAvailability(ctx), context);
}

export function useInventoryProducts(context: ApiContext | null) {
  return useApiEndpoint(async ctx => {
    const res = await inventoryApi.listProducts(ctx);
    return res.items;
  }, context);
}

export function useInventoryMaterials(context: ApiContext | null) {
  return useApiEndpoint(async ctx => {
    const res = await inventoryApi.listMaterials(ctx);
    return res.items;
  }, context);
}

export function useProductionDemands(context: ApiContext | null) {
  return useApiEndpoint(async ctx => {
    const res = await listProductionDemands(context as any);
    return (res as any).items ?? [];
  }, context);
}

export function useWorkOrders(context: ApiContext | null) {
  return useApiEndpoint(async ctx => {
    const res = await productionOperationsApi.listWorkOrders(ctx);
    return res.items;
  }, context);
}
