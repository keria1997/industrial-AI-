import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ClipboardCheck, Factory, Gauge, PackageCheck, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { ApiError, type ApiContext } from "../../../api/client";
import { listFulfillmentShipmentTasks } from "../../../api/fulfillment";
import { productionOperationsApi, type CompletionDto, type DashboardDto, type DemandDto, type InspectionDto, type OperationTaskDto, type WorkOrderDto } from "../../../api/production/operations";

type Props = {
  currentTenant: { id: string; name: string };
  currentUser: { accessToken?: string; account?: string; name?: string };
};

type Tab = "overview" | "demands" | "orders" | "quality" | "tasks";
type Notice = { type: "success" | "warning" | "error"; message: string } | null;
type DemandTrace = { salesOrderId: string; salesOrderNo: string; orderLineId: string; shipmentTaskId: string; inventoryFactVersion?: number };

const completionStorageKey = (tenantId: string) => `industrial-ai-production-live-completions:v1:${tenantId}`;
const planningTaskStorageKey = (tenantId: string) => `industrial-ai-production-planning-tasks:v1:${tenantId}`;

const loadStoredIds = (key: string) => {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const saveStoredIds = (key: string, ids: string[]) =>
  sessionStorage.setItem(key, JSON.stringify(Array.from(new Set(ids))));

const stableUuid = (seed: string) => {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < seed.length; index += 1) {
    left = Math.imul(left ^ seed.charCodeAt(index), 0x01000193);
    right = Math.imul(right ^ seed.charCodeAt(index), 0x85ebca6b);
  }
  const hex = `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}${((left ^ right) >>> 0).toString(16).padStart(8, "0")}${((left + right) >>> 0).toString(16).padStart(8, "0")}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const scaled = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole || "0") * 1_000_000n + BigInt(fraction.padEnd(6, "0").slice(0, 6));
};

const decimal = (value: bigint) => {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
};

const remainingReportQty = (order: WorkOrderDto) => decimal(
  scaled(order.plannedQty) - scaled(order.reportedGoodQty) - scaled(order.reportedDefectQty) - scaled(order.reportedScrapQty),
);

const statusTone = (status: string) => {
  if (["APPROVED", "PASSED", "POSTED", "CLOSED", "COMPLETED"].includes(status)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["BLOCKED", "FAILED", "REJECTED", "DISPOSITION_PENDING"].includes(status)) return "border-rose-200 bg-rose-50 text-rose-700";
  if (["PENDING_REVIEW", "POSTING", "PAUSED", "RUNNING"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
};

const Status = ({ value }: { value: string }) => <span className={`inline-flex min-h-6 items-center border px-2 py-1 text-[11px] font-bold ${statusTone(value)}`}>{value}</span>;

const ActionButton = ({ children, onClick, disabled, tone = "primary", title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "primary" | "secondary" | "danger"; title?: string }) => (
  <button type="button" title={title} disabled={disabled} onClick={onClick} className={`min-h-9 px-3 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${tone === "primary" ? "bg-blue-700 text-white hover:bg-blue-800" : tone === "danger" ? "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
    {children}
  </button>
);

export default function ProductionOperations({ currentTenant, currentUser }: Props) {
  const isDevelopment = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  const [tab, setTab] = useState<Tab>("overview");
  const [dashboard, setDashboard] = useState<DashboardDto | null>(null);
  const [demands, setDemands] = useState<DemandDto[]>([]);
  const [orders, setOrders] = useState<WorkOrderDto[]>([]);
  const [inspections, setInspections] = useState<InspectionDto[]>([]);
  const [completions, setCompletions] = useState<CompletionDto[]>([]);
  const [planningTasks, setPlanningTasks] = useState<OperationTaskDto[]>([]);
  const [demandTraces, setDemandTraces] = useState<Record<string, DemandTrace>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const context = useMemo<ApiContext | null>(() => currentUser.accessToken ? ({ tenantId: currentTenant.id, accessToken: currentUser.accessToken }) : null, [currentTenant.id, currentUser.accessToken]);

  const refresh = useCallback(async () => {
    if (!context) return;
    setLoading(true);
    try {
      const [nextDashboard, nextDemands, nextOrders, nextInspections, shipmentTasks] = await Promise.all([
        productionOperationsApi.dashboard(context),
        productionOperationsApi.listDemands(context),
        productionOperationsApi.listWorkOrders(context),
        productionOperationsApi.listInspections(context),
        listFulfillmentShipmentTasks(context).catch(() => ({ items: [], total: 0 })),
      ]);
      const completionIds = loadStoredIds(completionStorageKey(context.tenantId));
      const planningTaskIds = loadStoredIds(planningTaskStorageKey(context.tenantId));
      const [completionResults, planningTaskResults] = await Promise.all([
        Promise.allSettled(completionIds.map((id) => productionOperationsApi.getCompletion(context, id))),
        Promise.allSettled(planningTaskIds.map((id) => productionOperationsApi.getTask(context, id))),
      ]);
      setDashboard(nextDashboard);
      setDemands(nextDemands.items);
      setOrders(nextOrders.items);
      setInspections(nextInspections);
      setCompletions(completionResults.flatMap((item) => item.status === "fulfilled" ? [item.value] : []));
      setPlanningTasks(planningTaskResults.flatMap((item) => item.status === "fulfilled" ? [item.value] : []));
      const nextTraces: Record<string, DemandTrace> = {};
      for (const task of shipmentTasks.items) {
        for (const line of task.lines) {
          if (!line.productionDemandId) continue;
          nextTraces[line.productionDemandId] = {
            salesOrderId: task.salesOrderId,
            salesOrderNo: task.salesOrderNo,
            orderLineId: line.orderLineId,
            shipmentTaskId: task.id,
            inventoryFactVersion: task.inventoryFactVersion,
          };
        }
      }
      setDemandTraces(nextTraces);
      setNotice(null);
    } catch (error) {
      setNotice({ type: "error", message: error instanceof ApiError ? `${error.message}${error.traceId ? ` · Trace ${error.traceId}` : ""}` : "生产数据加载失败" });
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => { void refresh(); }, [refresh]);

  const execute = async (key: string, successMessage: string, action: () => Promise<unknown>) => {
    setSubmitting(key);
    setNotice(null);
    try {
      await action();
      setNotice({ type: "success", message: successMessage });
      await refresh();
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      const fieldMessage = apiError?.fieldErrors.map((item) => `${item.field}: ${item.message}`).join("；");
      setNotice({ type: "error", message: [apiError?.message || "操作失败", fieldMessage || apiError?.suggestion, apiError?.traceId ? `Trace ${apiError.traceId}` : ""].filter(Boolean).join(" · ") });
    } finally {
      setSubmitting("");
    }
  };

  const createOrder = (demand: DemandDto, scheduleCandidateId: string) => {
    if (!context) return;
    const seed = `${context.tenantId}:${demand.id}:${demand.version}`;
    void execute(`order:${demand.id}`, `工单已创建并关联需求 ${demand.code}`, () => productionOperationsApi.createWorkOrder(context, {
      productId: demand.productId,
      productName: demand.productName,
      factoryResourceId: demand.factoryResourceId,
      workCenterResourceId: demand.factoryResourceId === "FAC-SZ-01" ? "WC-SZ-ASSY-01" : "WC-SH-ASSY-01",
      plannedQty: demand.qty,
      inputQty: demand.qty,
      uom: demand.uom,
      dueDate: demand.dueDate,
      bomSnapshotId: stableUuid(`${seed}:bom`),
      routingSnapshotId: stableUuid(`${seed}:routing`),
      scheduleCandidateId,
      kittingStatus: "READY",
      correlationId: demand.correlationId,
      demandLinks: [{ demandId: demand.id, allocatedQty: demand.qty, promisedDate: demand.dueDate }],
    }, `work-order-create:${seed}`));
  };

  const releaseOrder = (order: WorkOrderDto) => {
    if (!context) return;
    void execute(`release:${order.id}`, `工单 ${order.code} 已下达`, async () => {
      const impact = await productionOperationsApi.releaseImpact(context, order.id);
      if (!impact.canRelease) throw new ApiError("工单未满足下达条件", 422, "RELEASE_BLOCKED", impact.blockers.map((item) => item.message).join("；"));
      return productionOperationsApi.workOrderCommand(context, order, "release", "影响预览通过，正式下达");
    });
  };

  const reportOrder = (order: WorkOrderDto) => {
    if (!context) return;
    const qty = remainingReportQty(order);
    void execute(`report:${order.id}`, `工单 ${order.code} 已报工 ${qty} ${order.uom}`, () => productionOperationsApi.submitReport(context, order, qty));
  };

  const createFqc = (order: WorkOrderDto) => {
    if (!context) return;
    const qty = order.reportedGoodQty;
    void execute(`fqc:${order.id}`, `工单 ${order.code} 已创建 FQC`, () => productionOperationsApi.createInspection(context, order, qty));
  };

  const createCompletion = (inspection: InspectionDto) => {
    if (!context) return;
    const order = orders.find((item) => item.id === inspection.workOrderId);
    if (!order) return;
    const inventoryWarehouseId = order.parameterSnapshot?.inventoryWarehouseId;
    if (!inventoryWarehouseId) {
      setNotice({ type: "error", message: `${order.code} 缺少目标成品仓，无法提交完工入库` });
      return;
    }
    void execute(`completion:${inspection.id}`, `${inspection.code} 已提交完工入库，当前等待 WMS 结果`, async () => {
      const result = await productionOperationsApi.createCompletion(context, order, inspection, inventoryWarehouseId);
      const key = completionStorageKey(context.tenantId);
      saveStoredIds(key, [...loadStoredIds(key), result.completionId]);
      return result;
    });
  };

  const startPlanningTask = (type: "MRP" | "APS", demandIds: string[]) => {
    if (!context) return;
    const runId = crypto.randomUUID();
    void execute(`planning:${type}:${demandIds.join(':')}`, `${type} 计划计算已完成`, async () => {
      const result = await productionOperationsApi.startPlanningTask(context, type, demandIds, runId);
      if (result.status !== "SUCCEEDED") throw new ApiError(`${type} 计划计算尚未完成`, 409, "PLANNING_NOT_COMPLETED", "刷新任务状态后再继续");
      const key = planningTaskStorageKey(context.tenantId);
      saveStoredIds(key, [result.taskId, ...loadStoredIds(key)]);
      return result;
    });
  };

  const scheduleCandidateFor = (demandId: string) => planningTasks
    .filter((task) => task.taskType === "APS_RUN" && task.status === "SUCCEEDED")
    .flatMap((task) => ((task.result as { scheduleCandidates?: Array<{ id: string; demandIds: string[] }> } | undefined)?.scheduleCandidates ?? []))
    .find((candidate) => candidate.demandIds.includes(demandId));

  if (!context) return <div className="border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">登录会话缺少访问令牌，请重新登录。</div>;

  const tabs: Array<{ key: Tab; label: string; icon: typeof Gauge }> = [
    { key: "overview", label: "生产概览", icon: Gauge },
    { key: "demands", label: "生产需求", icon: ClipboardCheck },
    { key: "orders", label: "工单执行", icon: Factory },
    { key: "quality", label: "质量与完工", icon: ShieldCheck },
    { key: "tasks", label: "计划任务", icon: Play },
  ];

  return <div className="min-h-full bg-[#F5F7FA]">
    <header className="border-b border-slate-200 bg-white px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="mb-2 text-[11px] font-bold text-slate-400">{currentTenant.name}</div><h1 className="text-[21px] font-black text-slate-950">生产作业台</h1><p className="mt-1 text-[12px] text-slate-500">集中处理生产需求、计划、工单、报工、质量检验和完工入库。</p></div>
        <ActionButton tone="secondary" disabled={loading} onClick={() => void refresh()}><span className="inline-flex items-center gap-2"><RefreshCw size={14} className={loading ? "animate-spin" : ""} />刷新</span></ActionButton>
      </div>
    </header>
    <nav className="flex overflow-x-auto border-b border-slate-200 bg-white px-6" aria-label="生产作业台页面">
      {tabs.map((item) => { const Icon = item.icon; return <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-[13px] font-bold ${tab === item.key ? "border-blue-700 text-blue-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}><Icon size={15} />{item.label}</button>; })}
    </nav>
    <main className="p-6">
      {notice && <div aria-live="polite" className={`mb-4 border px-4 py-3 text-[12px] font-bold ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : notice.type === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.message}</div>}
      {loading && !dashboard ? <div className="flex min-h-64 items-center justify-center text-[13px] text-slate-500"><RefreshCw size={18} className="mr-2 animate-spin" />正在读取生产服务</div> : null}

      {tab === "overview" && dashboard && <div className="space-y-5">
        <section className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-5">
          {[["活动工单", dashboard.kpis.activeWorkOrders], ["逾期工单", dashboard.kpis.overdueWorkOrders], ["完工率", `${dashboard.kpis.completionRatePercent}%`], ["待处理需求", dashboard.kpis.pendingDemands], ["未关闭 FQC", dashboard.kpis.openFqc]].map(([label, value]) => <div key={label} className="bg-white px-5 py-5"><div className="text-[11px] font-bold text-slate-500">{label}</div><div className="mt-2 text-[24px] font-black tabular-nums text-slate-950">{value}</div></div>)}
        </section>
        <section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="text-[15px] font-black text-slate-900">交付风险</h2></div>{dashboard.risks.length ? <div className="divide-y divide-slate-100">{dashboard.risks.map((risk) => <div key={risk.workOrderId} className="flex flex-wrap items-center gap-3 px-5 py-4 text-[12px]"><AlertTriangle size={15} className="text-rose-600" /><b>{risk.code}</b><span className="text-slate-500">交期 {risk.dueDate}</span><Status value={risk.status} /></div>)}</div> : <div className="px-5 py-10 text-center text-[12px] text-slate-500">当前没有逾期工单</div>}</section>
        <div className="flex items-start gap-3 border border-blue-200 bg-blue-50 p-4 text-[11px] leading-5 text-blue-900"><Activity size={16} className="mt-0.5 shrink-0" /><p>已审批需求需依次完成 MRP 物料计划和 APS 排程，取得可用排程后才能创建工单。</p></div>
      </div>}

      {tab === "demands" && <section className="overflow-hidden border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-[12px]"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">需求</th><th className="px-4 py-3">来源追溯</th><th className="px-4 py-3">产品</th><th className="px-4 py-3">数量</th><th className="px-4 py-3">交期</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{demands.map((demand) => { const trace = demandTraces[demand.id]; const candidate = scheduleCandidateFor(demand.id); return <tr key={demand.id} className="hover:bg-slate-50"><td className="px-4 py-4"><b>{demand.code}</b><div className="mt-1 text-[10px] text-slate-400">v{demand.version} · {demand.correlationId}</div></td><td className="px-4 py-4">{trace ? <><b className="text-blue-700">{trace.salesOrderNo}</b><div className="mt-1 max-w-[260px] break-all text-[10px] text-slate-500">订单行 {trace.orderLineId} · 发货任务 {trace.shipmentTaskId}{trace.inventoryFactVersion ? ` · 库存事实 v${trace.inventoryFactVersion}` : ""}</div></> : demand.sourceType}</td><td className="px-4 py-4">{demand.productId}<div className="text-[10px] text-slate-500">{demand.productName}</div></td><td className="px-4 py-4 tabular-nums">{demand.qty} {demand.uom}</td><td className="px-4 py-4">{demand.dueDate}</td><td className="px-4 py-4"><Status value={demand.status} /></td><td className="px-4 py-4"><div className="flex justify-end gap-2">{["RECEIVED", "BLOCKED"].includes(demand.status) && <ActionButton disabled={Boolean(submitting)} onClick={() => void execute(`validate:${demand.id}`, `${demand.code} 已完成主数据校验`, () => productionOperationsApi.validateDemand(context, demand))}>校验</ActionButton>}{demand.status === "PENDING_REVIEW" && <ActionButton disabled={Boolean(submitting)} onClick={() => void execute(`approve:${demand.id}`, `${demand.code} 已审批`, () => productionOperationsApi.approveDemand(context, demand))}>审批</ActionButton>}{demand.status === "APPROVED" && <ActionButton disabled={Boolean(submitting)} onClick={() => startPlanningTask("MRP", [demand.id])}>运行 MRP</ActionButton>}{demand.status === "PLANNED" && !candidate && <ActionButton disabled={Boolean(submitting)} onClick={() => startPlanningTask("APS", [demand.id])}>运行 APS</ActionButton>}{demand.status === "PLANNED" && candidate && <ActionButton disabled={Boolean(submitting)} onClick={() => createOrder(demand, candidate.id)}>创建工单</ActionButton>}</div></td></tr>; })}{!demands.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">当前租户没有生产需求</td></tr>}</tbody></table></div></section>}

      {tab === "orders" && <section className="overflow-hidden border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-[12px]"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">工单</th><th className="px-4 py-3">产品</th><th className="px-4 py-3">计划/投入</th><th className="px-4 py-3">合格/入库</th><th className="px-4 py-3">齐套</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">版本</th><th className="px-4 py-3 text-right">正式动作</th></tr></thead><tbody className="divide-y divide-slate-100">{orders.map((order) => { const hasInspection = inspections.some((item) => item.workOrderId === order.id); const remaining = remainingReportQty(order); return <tr key={order.id} className="hover:bg-slate-50"><td className="px-4 py-4"><b>{order.code}</b><div className="mt-1 text-[10px] text-slate-400">{order.id}</div></td><td className="px-4 py-4">{order.productId}<div className="text-[10px] text-slate-500">{order.productName}</div></td><td className="px-4 py-4 tabular-nums">{order.plannedQty} / {order.inputQty}</td><td className="px-4 py-4 tabular-nums">{order.reportedGoodQty} / {order.postedQty}</td><td className="px-4 py-4"><Status value={order.kittingStatus || "未检查"} /></td><td className="px-4 py-4"><Status value={order.status} /></td><td className="px-4 py-4">v{order.version}</td><td className="px-4 py-4"><div className="flex justify-end gap-2">{["PLANNED", "SCHEDULED", "KITTING"].includes(order.status) && <ActionButton disabled={Boolean(submitting)} onClick={() => releaseOrder(order)}>预览并下达</ActionButton>}{order.status === "RELEASED" && <ActionButton disabled={Boolean(submitting)} onClick={() => void execute(`start:${order.id}`, `${order.code} 已开工`, () => productionOperationsApi.workOrderCommand(context, order, "start"))}>开工</ActionButton>}{order.status === "IN_PROGRESS" && remaining !== "0" && <ActionButton disabled={Boolean(submitting)} onClick={() => reportOrder(order)}>报工 {remaining}</ActionButton>}{order.status === "IN_PROGRESS" && !hasInspection && order.reportedGoodQty !== "0" && <ActionButton tone="secondary" disabled={Boolean(submitting)} onClick={() => createFqc(order)}>创建 FQC</ActionButton>}{order.status === "IN_PROGRESS" && <ActionButton tone="secondary" disabled={Boolean(submitting)} onClick={() => void execute(`pause:${order.id}`, `${order.code} 已暂停`, () => productionOperationsApi.workOrderCommand(context, order, "pause", "现场人工暂停"))}>暂停</ActionButton>}{order.status === "PAUSED" && <ActionButton disabled={Boolean(submitting)} onClick={() => void execute(`resume:${order.id}`, `${order.code} 已恢复`, () => productionOperationsApi.workOrderCommand(context, order, "resume", "暂停原因已处理"))}>恢复</ActionButton>}</div></td></tr>; })}{!orders.length && <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-500">当前租户没有生产工单</td></tr>}</tbody></table></div></section>}

      {tab === "quality" && <div className="space-y-5"><section className="overflow-hidden border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="text-[15px] font-black text-slate-900">FQC 检验</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-[12px]"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">检验单</th><th className="px-4 py-3">工单</th><th className="px-4 py-3">送检</th><th className="px-4 py-3">合格/不合格</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">动作</th></tr></thead><tbody className="divide-y divide-slate-100">{inspections.map((inspection) => { const hasCompletion = completions.some((item) => item.inspectionId === inspection.id); return <tr key={inspection.id}><td className="px-4 py-4"><b>{inspection.code}</b><div className="text-[10px] text-slate-400">v{inspection.version}</div></td><td className="px-4 py-4">{orders.find((item) => item.id === inspection.workOrderId)?.code || inspection.workOrderId}</td><td className="px-4 py-4">{inspection.sampleQty}</td><td className="px-4 py-4">{inspection.passedQty} / {inspection.failedQty}</td><td className="px-4 py-4"><Status value={inspection.status} /></td><td className="px-4 py-4"><div className="flex justify-end gap-2">{["CREATED", "REINSPECTION"].includes(inspection.status) && <ActionButton disabled={Boolean(submitting)} onClick={() => void execute(`pass:${inspection.id}`, `${inspection.code} FQC 已判定合格`, () => productionOperationsApi.passInspection(context, inspection))}>登记合格</ActionButton>}{inspection.status === "PASSED" && !hasCompletion && <ActionButton disabled={Boolean(submitting)} onClick={() => createCompletion(inspection)}>提交完工入库</ActionButton>}</div></td></tr>; })}{!inspections.length && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">暂无 FQC 检验记录</td></tr>}</tbody></table></div></section>
        <section className="overflow-hidden border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="text-[15px] font-black text-slate-900">完工与库存结果</h2><p className="mt-1 text-[11px] text-slate-500">库存确认入账后会显示库存流水；处理中状态不计入可用库存。</p></div><div className="divide-y divide-slate-100">{completions.map((completion) => <div key={completion.id} className="flex flex-wrap items-center gap-4 px-5 py-4 text-[12px]"><PackageCheck size={17} className="text-blue-700" /><div className="min-w-48"><b>{completion.code}</b><div className="mt-1 text-[10px] text-slate-400">{completion.id}</div></div><span>{completion.qty} {completion.uom}</span><Status value={completion.status} /><span className="text-slate-500">{completion.externalTransactionId || completion.failureMessage || "等待库存确认"}</span>{isDevelopment && completion.status === "POSTING" && <ActionButton tone="secondary" disabled={Boolean(submitting)} title="模拟外部仓储系统确认入账" onClick={() => void execute(`inventory-posted:${completion.id}`, `${completion.code} 已取得库存入账流水`, () => productionOperationsApi.inventoryResult(context, completion.id, "POSTED"))}>模拟库存确认入账</ActionButton>}</div>)}{!completions.length && <div className="px-5 py-10 text-center text-[12px] text-slate-500">当前没有完工入库记录</div>}</div></section>
      </div>}

      {tab === "tasks" && <div className="space-y-5">
        <section className="flex flex-wrap items-start justify-between gap-4 border border-slate-200 bg-white px-5 py-4">
          <div><h2 className="text-[15px] font-black text-slate-900">MRP / APS 计划任务</h2><p className="mt-1 text-[11px] leading-5 text-slate-500">在生产需求页选择需求并依次运行 MRP 和 APS；只有成功任务的排程结果可以创建工单。</p></div>
        </section>
        <section className="overflow-hidden border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-[12px]"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">任务 ID</th><th className="px-4 py-3">类型</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">进度</th><th className="px-4 py-3">重试</th><th className="px-4 py-3">创建人</th><th className="px-4 py-3">更新时间</th></tr></thead><tbody className="divide-y divide-slate-100">{planningTasks.map((task) => <tr key={task.id} className="hover:bg-slate-50"><td className="px-4 py-4 font-mono text-[11px]">{task.id}</td><td className="px-4 py-4 font-bold">{task.taskType}</td><td className="px-4 py-4"><Status value={task.status} /></td><td className="px-4 py-4 tabular-nums">{task.progress}%</td><td className="px-4 py-4 tabular-nums">{task.retryCount} / {task.maxRetryCount}</td><td className="px-4 py-4">{task.createdBy}</td><td className="px-4 py-4">{new Date(task.updatedAt).toLocaleString("zh-CN", { hour12: false })}</td></tr>)}{!planningTasks.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">本会话尚未创建计划任务</td></tr>}</tbody></table></div></section>
      </div>}
    </main>
  </div>;
}
