import { useCallback, useEffect, useRef, useState } from "react";
import { productionOperationsApi, type WorkOrderDto, type InspectionDto, type CompletionDto, type CloseRequestDto } from "../../../api/production/operations";
import type { ApiContext } from "../../../api/client";

type Snapshot = { orders: WorkOrderDto[]; inspections: InspectionDto[]; completions: CompletionDto[]; closes: CloseRequestDto[]; permissions: string[] };
export function useFormalProduction(context: ApiContext | null) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!context) return;
    const revision = generation.current;
    const [orders, inspections, completions, closes, access] = await Promise.all([
      productionOperationsApi.listWorkOrders(context), productionOperationsApi.listInspections(context),
      productionOperationsApi.listCompletions(context), productionOperationsApi.listCloses(context),
      productionOperationsApi.readiness(context),
    ]);
    if (revision !== generation.current) return;
    setSnapshot({ orders: orders.items, inspections, completions, closes, permissions: access.permissions });
    setError("");
  }, [context?.tenantId, context?.accessToken]);
  useEffect(() => {
    generation.current += 1;
    setSnapshot(null);
    if (!context) return;
    let active = true;
    const load = () => refresh().catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : "生产数据加载失败");
    });
    void load();
    const interval = window.setInterval(load, 3000);
    return () => { active = false; generation.current += 1; window.clearInterval(interval); };
  }, [refresh]);
  return { snapshot, error, refresh };
}
