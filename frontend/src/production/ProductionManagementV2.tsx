import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Box,
  Boxes,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  ClipboardCheck,
  ClipboardList,
  Database,
  Factory,
  FileCheck2,
  FileWarning,
  Filter,
  GitBranch,
  Hammer,
  Info,
  LayoutDashboard,
  ListChecks,
  Lock,
  PackageCheck,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  UserSearch,
  Warehouse,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  createTenantProductionState,
  loadTenantProductionState,
  makeId,
  parseSerials,
  saveTenantProductionState,
  warehouseMappings,
  type Completion,
  type FactoryId,
  type ProductionPage,
  type ProductionTask,
  type PrototypeState,
  type QualityTask,
  type WorkOrder,
} from './productionPrototype';
import {
  getAuthorizedFactoryCodes,
  hasPlatformPermission,
  isPlatformActorEnabled,
  isPlatformCapabilityEnabled,
  type PlatformState,
} from '../platform/platformSeed';

type Tone = 'blue' | 'green' | 'amber' | 'red' | 'slate';
type Notify = (message: string, type?: 'success' | 'warning' | 'error') => void;
type StoreSetter = Dispatch<SetStateAction<PrototypeState>>;
type ProductionEmployee = { name: string; no: string; dept: string; role: string; mobile: string; skill: string; valid: string; state: string };
type ProductionResource = { id: string; code: string; name: string };
type ProductionWarehouse = { id: keyof typeof warehouseMappings; code: string; name: string };

const toneClass: Record<Tone, string> = {
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-rose-200 bg-rose-50 text-rose-700',
  slate: 'border-slate-200 bg-slate-100 text-slate-700',
};

const statusTone = (status: string): Tone => {
  if (['POSTED', 'PASSED', 'READY', 'SUCCEEDED', 'COMPLETED', 'CLOSED', 'ACTIVE', 'RELEASED', '已批准', '计划中', '可用'].includes(status)) return 'green';
  if (['FAILED', 'SHORTAGE', '阻断', 'DISPOSITION_PENDING', 'SCRAPPED', '严重缺料'].includes(status)) return 'red';
  if (['POSTING', 'RUNNING', 'WAITING_CONFIRM', 'PARTIAL', 'KITTING', 'INSPECTING', 'CLOSING', '待评审', '到货可齐套'].includes(status)) return 'amber';
  return 'blue';
};

const statusLabel: Record<string, string> = {
  ACTIVE: '已生效',
  DRAFT: '草稿',
  SUBMITTED: '待审批',
  RELEASED: '已下达',
  SCHEDULED: '已排产',
  KITTING: '齐套中',
  READY: '齐套完成',
  PARTIAL: '部分齐套',
  SHORTAGE: '缺料',
  IN_PROGRESS: '生产中',
  COMPLETED: '已完工',
  CLOSING: '结案中',
  CLOSED: '已结案',
  INSPECTING: '检验中',
  PASSED: '已通过',
  DISPOSITION_PENDING: '待质量处置',
  SCRAPPED: '已报废',
  POSTING: '入库处理中',
  POSTED: '已入库',
  FAILED: '处理失败',
  RUNNING: '处理中',
  WAITING_CONFIRM: '等待确认',
  SUCCEEDED: '已完成',
};

const Status = ({ children, tone = 'slate' }: { children: ReactNode; tone?: Tone }) => {
  const display = React.Children.map(children, child => typeof child === 'string' ? (statusLabel[child] || child) : child);
  return <span className={`inline-flex min-h-6 items-center gap-1 rounded-lg border px-2.5 py-0.5 text-[11px] font-bold ${toneClass[tone]}`}>{display}</span>;
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'secondary' | 'danger' | 'quiet';
  icon?: LucideIcon;
};

const Button = ({ children, tone = 'primary', icon: Icon, className = '', type = 'button', ...props }: ButtonProps) => {
  const styles = tone === 'primary'
    ? 'border-[#2563EB] bg-[#2563EB] text-white shadow-sm hover:bg-blue-700'
    : tone === 'danger'
      ? 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
      : tone === 'quiet'
        ? 'border-transparent bg-transparent text-slate-600 hover:bg-slate-100'
        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50';
  return (
    <button type={type} {...props} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${styles} ${className}`}>
      {Icon && <Icon size={16} aria-hidden="true" />}{children}
    </button>
  );
};

const Field = ({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: ReactNode }) => (
  <label className="block min-w-0">
    <span className="mb-1.5 flex items-center gap-1 text-[12px] font-bold text-slate-700">{label}{required && <span className="text-rose-600" aria-label="必填">*</span>}</span>
    {children}
    {(error || hint) && <span className={`mt-1.5 block text-[11px] leading-5 ${error ? 'text-rose-600' : 'text-slate-500'}`}>{error || hint}</span>}
  </label>
);

const PageHeading = (_props: { eyebrow: string; title: string; description: string; actions?: ReactNode }) => null;

const EmptyState = ({ title, description, action }: { title: string; description: string; action?: ReactNode }) => (
  <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-8 text-center shadow-sm">
    <Box className="mb-4 text-slate-300" size={34} />
    <h3 className="text-[15px] font-black text-slate-800">{title}</h3>
    <p className="mt-2 max-w-lg text-[12px] leading-5 text-slate-500">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

const TableShell = ({ children, hint = '表格可左右滑动查看完整字段' }: { children: ReactNode; hint?: string }) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="prod-table-hint border-b border-slate-100 px-3 py-2 text-[10px] font-bold text-slate-500">{hint}</div>
    <div className="custom-scrollbar overflow-x-auto">{children}</div>
  </div>
);

function Modal({ open, onClose, eyebrow, title, description, children, footer, size = 'md' }: { open: boolean; onClose: () => void; eyebrow?: string; title: string; description?: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);
  return (
    <dialog ref={ref} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} className={`prod-dialog ${size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : size === 'xl' ? 'max-w-5xl' : 'max-w-xl'}`}>
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>{eyebrow && <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-700">{eyebrow}</div>}<h3 className="mt-1 text-[19px] font-black text-slate-950">{title}</h3>{description && <p className="mt-1.5 max-w-[70ch] text-[12px] leading-5 text-slate-500">{description}</p>}</div>
          <button type="button" aria-label="关闭弹窗" onClick={onClose} className="-mr-2 rounded-md p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
      </div>
      <div className="custom-scrollbar max-h-[65vh] overflow-y-auto p-5">{children}</div>
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">{footer}</div>}
    </dialog>
  );
}

type ProductionModule = {
  key: string;
  label: string;
  defaultPage: ProductionPage;
  pages: ProductionPage[];
  icon: LucideIcon;
};

const productionModules: ProductionModule[] = [
  { key: 'dashboard', label: '生产管理驾驶舱', defaultPage: 'dashboard', pages: ['dashboard'], icon: LayoutDashboard },
  { key: 'master', label: '生产主数据', defaultPage: 'master', pages: ['master', 'calendar'], icon: Database },
  { key: 'demand', label: '需求管理', defaultPage: 'demand', pages: ['demand'], icon: Target },
  { key: 'plan', label: '生产计划', defaultPage: 'plan', pages: ['plan'], icon: ClipboardList },
  { key: 'aps', label: 'APS', defaultPage: 'aps', pages: ['aps'], icon: CalendarRange },
  { key: 'kitting', label: '物料齐套与投料', defaultPage: 'kitting', pages: ['kitting'], icon: Boxes },
  { key: 'execution', label: '车间执行', defaultPage: 'orders', pages: ['orders', 'report'], icon: Hammer },
  { key: 'quality', label: '质量管理（精简）', defaultPage: 'quality', pages: ['quality'], icon: ShieldCheck },
  { key: 'completion', label: '完工结案', defaultPage: 'completion', pages: ['completion'], icon: PackageCheck },
];

const productionPages: { key: ProductionPage; label: string }[] = [
  { key: 'dashboard', label: '生产管理驾驶舱' },
  { key: 'master', label: 'BOM 与工艺' },
  { key: 'calendar', label: '日历、班次与技能' },
  { key: 'demand', label: '生产需求池' },
  { key: 'plan', label: '生产计划' },
  { key: 'aps', label: 'APS 排产' },
  { key: 'kitting', label: '齐套与投料' },
  { key: 'orders', label: '工单列表' },
  { key: 'report', label: '报工录入' },
  { key: 'quality', label: 'FQC 任务' },
  { key: 'completion', label: '完工入库与结案' },
  { key: 'tasks', label: '任务中心' },
];

const validPages = new Set(productionPages.map(item => item.key));

type PageProps = {
  state: PrototypeState;
  setState: StoreSetter;
  factory: FactoryId;
  canWrite: boolean;
  notify: Notify;
  navigate: (page: ProductionPage) => void;
  employees: ProductionEmployee[];
  workCenters: ProductionResource[];
  warehouses: ProductionWarehouse[];
};

function DashboardPage({ state, factory, navigate, notify }: PageProps) {
  const orders = state.orders.filter(item => item.factory === factory);
  const quality = state.quality.filter(item => item.factory === factory);
  const completions = state.completions.filter(item => item.factory === factory);
  const posted = completions.filter(item => item.status === 'POSTED').reduce((sum, item) => sum + item.qty, 0);
  const metrics = [
    { label: '计划达成率', value: factory === 'FAC-SH-01' ? '93.6%' : '88.4%', note: '已发布 MPS', tone: 'blue', page: 'plan' as ProductionPage },
    { label: '延期工单', value: String(orders.filter(item => item.status !== 'COMPLETED' && item.status !== 'CLOSED').length), note: '按承诺交期与当前进度', tone: 'red', page: 'orders' as ProductionPage },
    { label: '待齐套', value: String(orders.filter(item => item.kitting !== 'READY').length), note: '关键料短缺优先', tone: 'amber', page: 'kitting' as ProductionPage },
    { label: '执行中工单', value: String(orders.filter(item => item.status === 'IN_PROGRESS').length), note: `${new Set(orders.map(item => item.center)).size} 个工作中心`, tone: 'blue', page: 'orders' as ProductionPage },
    { label: '待 FQC', value: String(quality.filter(item => item.status === 'INSPECTING').length), note: '只统计授权工厂', tone: 'amber', page: 'quality' as ProductionPage },
    { label: '已入库', value: String(posted), note: 'PCS · 已入库', tone: 'green', page: 'completion' as ProductionPage },
  ];
  const risks = factory === 'FAC-SH-01'
    ? [{ level: '高', title: 'WO-260112 非关键料仅部分齐套', owner: '物料计划组', page: 'kitting' as ProductionPage }, { level: '中', title: 'FQC-260801 等待检验录入', owner: '质量部', page: 'quality' as ProductionPage }]
    : [{ level: '高', title: 'WO-260109 关键芯片缺口 60 PCS', owner: '物料计划组', page: 'kitting' as ProductionPage }, { level: '高', title: 'CMP-260722-064 库位冻结被库存拒绝', owner: '成品仓', page: 'completion' as ProductionPage }];
  const chart = factory === 'FAC-SH-01' ? [410, 520, 468, 620, 710, 590, 486] : [180, 220, 206, 310, 286, 340, 298];
  return (
    <>
      <PageHeading eyebrow="生产经营总览" title="生产管理驾驶舱" description="统一查看计划、齐套、执行、质量和成品入库情况，所有指标均可下钻到对应业务单据。" actions={<Button icon={RefreshCw} tone="secondary" onClick={() => notify('驾驶舱已按当前工厂和时间口径刷新')}>刷新数据</Button>} />
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 lg:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
          {metrics.map(metric => <button key={metric.label} onClick={() => navigate(metric.page)} className="group min-h-[126px] p-4 text-left hover:bg-slate-50"><div className="flex items-center justify-between text-[11px] font-bold text-slate-500"><span>{metric.label}</span><ChevronRight size={14} className="opacity-40 transition-opacity group-hover:opacity-100" /></div><div className="mt-3 text-[27px] font-black tracking-[-0.04em] text-slate-950">{metric.value}</div><div className={`mt-2 text-[11px] font-bold ${metric.tone === 'red' ? 'text-rose-600' : metric.tone === 'amber' ? 'text-amber-700' : metric.tone === 'green' ? 'text-emerald-700' : 'text-slate-500'}`}>{metric.note}</div></button>)}
        </div>
      </section>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h3 className="text-[15px] font-black text-slate-900">生产流量</h3><p className="mt-1 text-[11px] text-slate-500">合格报工与库存已过账量，单位 PCS</p></div><Status tone="blue">当前数据范围</Status></div>
          <div className="grid min-h-[280px] grid-cols-[40px_1fr] gap-3 p-5"><div className="flex flex-col justify-between pb-7 text-right text-[10px] text-slate-400"><span>800</span><span>600</span><span>400</span><span>200</span><span>0</span></div><div className="prod-chart-grid flex items-end justify-around gap-3 border-b border-slate-300 px-2">{chart.map((value, index) => <div key={index} className="flex h-full flex-1 flex-col justify-end"><div className="flex h-[210px] items-end justify-center gap-1"><div className="w-[28%] min-w-3 bg-blue-300" style={{ height: `${value / 8}%` }} title={`合格报工 ${value}`} /><div className="w-[28%] min-w-3 bg-blue-600" style={{ height: `${Math.max(8, value - 42) / 8}%` }} title={`已入库 ${Math.max(0, value - 42)}`} /></div><div className="mt-2 text-center text-[10px] font-bold text-slate-500">{index === 6 ? '今日' : `07-${17 + index}`}</div></div>)}</div></div>
          <div className="flex gap-5 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-600"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 bg-blue-300" />合格报工</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 bg-blue-600" />库存已过账</span></div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4"><h3 className="text-[15px] font-black text-slate-900">需要处理</h3><p className="mt-1 text-[11px] text-slate-500">按风险级别和承诺时间排序</p></div><div className="divide-y divide-slate-100">{risks.map(risk => <div key={risk.title} className="p-5"><div className="flex items-start gap-3"><CircleAlert size={18} className={`mt-0.5 ${risk.level === '高' ? 'text-rose-600' : 'text-amber-600'}`} /><div className="min-w-0 flex-1"><div className="text-[13px] font-black leading-5 text-slate-900">{risk.title}</div><div className="mt-1.5 text-[11px] text-slate-500">责任人：{risk.owner}</div></div></div><button onClick={() => navigate(risk.page)} className="mt-3 inline-flex min-h-9 items-center gap-1 text-[12px] font-bold text-blue-700">进入处理<ArrowRight size={14} /></button></div>)}</div></section>
      </div>
      <section className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 text-slate-700"><div className="grid items-center gap-3 lg:grid-cols-[auto_1fr]"><div className="text-[12px] font-black text-blue-700">当前生产链路</div><div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">{['需求受理', 'MPS / MRP', 'APS 排产', '齐套与预占', '工单执行', 'FQC', '成品入库', '结案'].map((item, index) => <React.Fragment key={item}><span className={index < 6 ? 'text-slate-700' : index === 6 ? 'text-blue-700' : 'text-slate-400'}>{item}</span>{index < 7 && <ChevronRight size={13} className="text-slate-300" />}</React.Fragment>)}</div></div></section>
    </>
  );
}

function MasterPage({ factory, canWrite, notify }: PageProps) {
  const [tab, setTab] = useState<'bom' | 'routing'>('bom');
  const [modal, setModal] = useState<'create' | 'import' | 'detail' | null>(null);
  const [selected, setSelected] = useState('');
  const rows = [
    { code: 'BOM-FG001', kind: 'bom', product: 'FG001 工业控制器', version: 'V1.2', factory: 'FAC-SH-01', valid: '2026-07-01 起', status: 'ACTIVE', owner: '工艺组' },
    { code: 'BOM-FG002', kind: 'bom', product: 'FG002 边缘网关', version: 'V2.0', factory: 'FAC-SH-01', valid: '2026-07-20 起', status: 'ACTIVE', owner: '工艺组' },
    { code: 'BOM-FG003', kind: 'bom', product: 'FG003 数据采集器', version: 'V1.1', factory: 'FAC-SZ-01', valid: '计划 08-01', status: 'SUBMITTED', owner: '叶工 / E0261' },
    { code: 'RT-FG001', kind: 'routing', product: 'FG001 控制器标准装配', version: 'V3.1', factory: 'FAC-SH-01', valid: '4 道工序', status: 'ACTIVE', owner: 'SMT-01 / ASSY-01' },
    { code: 'RT-FG003', kind: 'routing', product: 'FG003 采集器装配', version: 'V1.1', factory: 'FAC-SZ-01', valid: '3 道工序', status: 'DRAFT', owner: 'ASSY-02' },
  ].filter(item => item.factory === factory && item.kind === tab);
  const openDetail = (code: string) => { setSelected(code); setModal('detail'); };
  return (
    <>
      <PageHeading eyebrow="生产专属主数据" title="BOM 与工艺路线" description="平台维护工厂、产线和工作中心；生产侧只维护版本化 BOM、工艺路线与生效规则，工单下达时固化不可变快照。" actions={<><Button tone="secondary" icon={Filter} onClick={() => setModal('import')} disabled={!canWrite}>导入校验</Button><Button icon={Plus} onClick={() => setModal('create')} disabled={!canWrite}>新建版本</Button></>} />
      <div className="mb-4 flex border-b border-slate-200" role="tablist">{([['bom', 'BOM 版本'], ['routing', '工艺路线']] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-11 border-b-2 px-5 text-[13px] font-black ${tab === key ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>)}</div>
      <TableShell><table className="prod-table"><thead><tr><th>编码</th><th>产品 / 名称</th><th>版本</th><th>有效期 / 工序</th><th>状态</th><th>负责人 / 工作中心</th><th>动作</th></tr></thead><tbody>{rows.map(row => <tr key={row.code}><td className="font-black text-slate-900">{row.code}</td><td>{row.product}</td><td>{row.version}</td><td>{row.valid}</td><td><Status tone={statusTone(row.status)}>{row.status}</Status></td><td>{row.owner}</td><td><button onClick={() => openDetail(row.code)} className="font-bold text-blue-700">查看{tab === 'bom' ? '版本' : '工序'}</button></td></tr>)}</tbody></table></TableShell>
      <div className="mt-4 flex items-start gap-3 border border-blue-200 bg-blue-50 p-4 text-[12px] leading-5 text-blue-900"><Info size={17} className="mt-0.5 shrink-0" /><p><b>版本规则：</b>已生效版本不可覆盖或删除。提交前检查计量单位、循环引用、工作中心、班次和技能；存量工单继续使用原快照。</p></div>
      <Modal open={modal === 'detail'} onClose={() => setModal(null)} eyebrow="版本快照" title={selected || '主数据详情'} footer={<Button onClick={() => setModal(null)}>关闭详情</Button>}><div className="grid gap-3 text-[12px] sm:grid-cols-2">{[['版本状态', 'ACTIVE · 已生效'], ['审批人', '李主管 / E0018'], ['适用范围', '按当前账号的数据权限'], ['快照引用', '当前 4 张工单'], ['最近变更', '2026-07-20 16:42'], ['审计编号', 'AUD-MD-260720-118']].map(item => <div key={item[0]} className="border border-slate-200 p-3"><div className="text-slate-500">{item[0]}</div><div className="mt-1 font-black text-slate-900">{item[1]}</div></div>)}</div></Modal>
      <Modal open={modal === 'create'} onClose={() => setModal(null)} eyebrow="新版本" title={`创建${tab === 'bom' ? ' BOM' : '工艺路线'}草稿`} description="新版本不会立即生效，保存后需要由不同账号完成审批。" footer={<><Button tone="secondary" onClick={() => setModal(null)}>继续查看</Button><Button onClick={() => { setModal(null); notify('新版本草稿已创建，原生效版本未改变'); }}>保存草稿</Button></>}><div className="grid gap-4 sm:grid-cols-2"><Field label="产品" required><select className="prod-input w-full"><option>FG001 工业控制器</option><option>FG002 边缘网关</option></select></Field><Field label="计划生效日期" required><input type="date" defaultValue="2026-08-01" className="prod-input w-full" /></Field><div className="sm:col-span-2"><Field label="变更说明" required><textarea className="prod-input min-h-24 w-full resize-y" defaultValue="根据量产反馈创建后续版本" maxLength={200} /></Field></div></div></Modal>
      <Modal open={modal === 'import'} onClose={() => setModal(null)} eyebrow="导入前校验" title="校验主数据文件" description="这里只生成校验报告，不会覆盖生效版本。" footer={<><Button tone="secondary" onClick={() => setModal(null)}>取消导入</Button><Button onClick={() => { setModal(null); notify('导入校验完成：18 行通过，2 行需要修复', 'warning'); }}>开始校验</Button></>}><Field label="Excel 或 CSV 文件" required><input type="file" accept=".xlsx,.xls,.csv" className="prod-input w-full file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:font-bold" /></Field><div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">将检查必填字段、单位、物料循环引用、工作中心可用性和版本重复。</div></Modal>
    </>
  );
}

function EmployeePicker({ value, onChange, employees }: { value: string; onChange: (value: string) => void; employees: ProductionEmployee[] }) {
  const [open, setOpen] = useState(false);
  const [dept, setDept] = useState('全部部门');
  const normalizedQuery = value.replace(/[\s/]/g, '').toLowerCase();
  const matches = employees.filter(item => (dept === '全部部门' || item.dept === dept) && `${item.name}${item.no}${item.dept}${item.role}${item.mobile}`.toLowerCase().includes(normalizedQuery));
  return <div className="relative" onFocusCapture={() => setOpen(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}><div className="relative"><UserSearch size={15} className="absolute left-3 top-3 text-slate-400" /><input value={value} onChange={event => { onChange(event.target.value); setOpen(true); }} className="prod-input w-full pl-9" placeholder="姓名、工号、岗位或手机后四位" role="combobox" aria-expanded={open} aria-autocomplete="list" /></div>{open && <div className="absolute z-40 mt-1 w-full min-w-[300px] border border-slate-300 bg-white p-2 shadow-xl"><select aria-label="按部门筛选人员" value={dept} onChange={event => setDept(event.target.value)} className="prod-input mb-2 w-full"><option>全部部门</option>{Array.from(new Set(employees.map(item => item.dept))).map(item => <option key={item}>{item}</option>)}</select><div role="listbox" className="max-h-52 overflow-y-auto">{matches.map(item => <button type="button" role="option" key={item.no} onClick={() => { onChange(`${item.name} / ${item.no}`); setOpen(false); }} className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left hover:bg-blue-50"><span><b className="text-[12px] text-slate-900">{item.name} · {item.no}</b><span className="mt-0.5 block text-[10px] text-slate-500">{item.dept} · {item.role}</span></span><span className="text-[10px] text-slate-400">尾号 {item.mobile}</span></button>)}{!matches.length && <div className="px-3 py-5 text-center text-[11px] text-slate-500">未找到在职人员，请调整关键词或部门。</div>}</div></div>}</div>;
}

function CalendarPage({ factory, canWrite, notify, employees }: PageProps) {
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('全部部门');
  const [open, setOpen] = useState(false);
  const matches = employees.filter(item => (dept === '全部部门' || item.dept === dept) && `${item.name}${item.no}${item.dept}${item.role}${item.mobile}`.toLowerCase().includes(query.toLowerCase()));
  return <><PageHeading eyebrow="产能基础" title="日历、班次与技能" description="工作时间决定可排时段，人员技能决定可执行资格；员工身份来自平台管理，生产侧只维护技能等级和有效期。" actions={<Button icon={Plus} disabled={!canWrite} onClick={() => setOpen(true)}>新建未来版本</Button>} /><div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]"><section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 p-5"><div className="flex items-center justify-between"><h3 className="font-black text-slate-900">本周班次</h3><Status tone="green">当前版本 V6</Status></div><p className="mt-1 text-[11px] text-slate-500">班次数据按当前账号权限加载</p></div><div className="divide-y divide-slate-100">{[['早班', '08:00—16:30', 'SMT / 总装', '8 小时'], ['中班', '16:30—00:30', 'SMT', '7.5 小时'], ['周末加班', '周六 08:30—17:00', '总装', '待主管确认']].map(row => <div key={row[0]} className="grid grid-cols-[100px_1fr] gap-3 p-5"><div className="text-[13px] font-black text-slate-900">{row[0]}</div><div><div className="text-[13px] text-slate-700">{row[1]}</div><div className="mt-1 text-[11px] text-slate-500">{row[2]} · {row[3]}</div></div></div>)}</div></section><section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 p-5"><div><h3 className="font-black text-slate-900">人员技能资格</h3><p className="mt-1 text-[11px] text-slate-500">岗位用于筛选，最终责任主体始终是具体员工</p></div><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_160px]"><div className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} className="prod-input w-full pl-9" placeholder="姓名、工号、岗位或尾号" /></div><select value={dept} onChange={event => setDept(event.target.value)} className="prod-input"><option>全部部门</option>{Array.from(new Set(employees.map(item => item.dept))).map(item => <option key={item}>{item}</option>)}</select></div></div><div className="overflow-x-auto"><table className="prod-table"><thead><tr><th>员工</th><th>部门 / 岗位</th><th>技能</th><th>有效期</th><th>状态</th></tr></thead><tbody>{matches.map(row => <tr key={row.no}><td><div className="font-black text-slate-900">{row.name}</div><div className="text-[10px] text-slate-400">{row.no}</div></td><td>{row.dept}<div className="text-[10px] text-slate-400">{row.role}</div></td><td>{row.skill}</td><td>{row.valid}</td><td><Status tone={row.state === '有效' ? 'green' : 'amber'}>{row.state}</Status></td></tr>)}</tbody></table></div>{!matches.length && <EmptyState title="没有找到在职员工" description="请调整姓名、工号、部门、岗位或手机号后四位。离职员工不会出现在结果中。" />}</section></div><Modal open={open} onClose={() => setOpen(false)} eyebrow="版本化排班" title="创建未来班次版本" footer={<><Button tone="secondary" onClick={() => setOpen(false)}>继续查看</Button><Button onClick={() => { setOpen(false); notify('未来班次版本已保存，当前版本保持不变'); }}>保存未来版本</Button></>}><div className="grid gap-4 sm:grid-cols-2"><Field label="生效日期" required><input type="date" className="prod-input w-full" defaultValue="2026-08-01" /></Field><Field label="班次模板" required><select className="prod-input w-full"><option>标准两班制</option><option>单班制</option></select></Field><div className="sm:col-span-2"><Field label="变更原因" required><textarea className="prod-input min-h-24 w-full" defaultValue="8 月产能安排调整" /></Field></div></div></Modal></>;
}

function DemandPage({ state, setState, factory, canWrite, notify, employees }: PageProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('全部状态');
  const [priority, setPriority] = useState('全部优先级');
  const [advanced, setAdvanced] = useState(false);
  const [modal, setModal] = useState<'create' | 'detail' | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({ source: '内部改善需求', product: 'FG001 工业控制器', qty: '100', due: '2026-08-05', priority: '普通' as '紧急' | '高' | '普通', owner: '周计划 / E0182' });
  const rows = state.demands.filter(item => item.factory === factory && (status === '全部状态' || item.status === status) && (priority === '全部优先级' || item.priority === priority) && `${item.id}${item.source}${item.product}`.toLowerCase().includes(query.toLowerCase()));
  const selected = state.demands.find(item => item.id === selectedId);
  const create = () => {
    if (!form.product.trim() || Number(form.qty) <= 0 || !form.due || !form.owner.includes('/')) { notify('请填写产品、正数数量、需求日期，并从在职人员结果中选择责任人', 'error'); return; }
    const next = { id: makeId('PD'), factory, source: form.source, product: form.product, qty: Number(form.qty), due: form.due.slice(5), priority: form.priority, status: '待评审' as const, owner: form.owner, correlationId: makeId('corr-internal') };
    setState(prev => ({ ...prev, demands: [next, ...prev.demands] })); setModal(null); notify(`${next.id} 已创建并进入需求评审`);
  };
  const approve = () => { if (!selected) return; setState(prev => ({ ...prev, demands: prev.demands.map(item => item.id === selected.id ? { ...item, status: '已批准' } : item) })); setModal(null); notify(`${selected.id} 已批准，将进入下一次 MPS 增量计划`); };
  return <><PageHeading eyebrow="需求管理" title="生产需求池" description="销售缺货、普通订单、预测、安全库存和内部需求统一进入评审；紧急需求不会绕过 MPS、MRP、APS 与齐套。" actions={<Button icon={Plus} disabled={!canWrite} onClick={() => setModal('create')}>创建内部需求</Button>} /><div className="mb-4 border border-slate-200 bg-white p-3"><div className="grid gap-3 md:grid-cols-[1fr_160px_auto]"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} className="prod-input w-full pl-9" placeholder="搜索需求号、来源或产品" /></div><select value={status} onChange={event => setStatus(event.target.value)} className="prod-input"><option>全部状态</option><option>待评审</option><option>已批准</option><option>计划中</option><option>阻断</option></select><Button tone="secondary" icon={Filter} aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}>更多筛选</Button></div>{advanced && <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-[180px_1fr]"><select value={priority} onChange={event => setPriority(event.target.value)} className="prod-input"><option>全部优先级</option><option>紧急</option><option>高</option><option>普通</option></select><div className="flex items-center text-[11px] text-slate-500">当前仅显示所选工厂的数据；来源和责任人可在详情中继续核验。</div></div>}</div><TableShell><table className="prod-table"><thead><tr><th>需求号 / 来源</th><th>产品</th><th>缺口数量</th><th>需求日期</th><th>优先级</th><th>状态</th><th>责任人</th><th>下一动作</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><div className="font-black text-slate-900">{row.id}</div><div className="mt-1 max-w-52 truncate text-[10px] text-slate-500" title={row.source}>{row.source}</div></td><td>{row.product}</td><td className="font-black text-slate-900">{row.qty} PCS</td><td>{row.due}</td><td><Status tone={row.priority === '紧急' ? 'red' : row.priority === '高' ? 'amber' : 'slate'}>{row.priority}</Status></td><td><Status tone={statusTone(row.status)}>{row.status}</Status></td><td>{row.owner}</td><td><button onClick={() => { setSelectedId(row.id); setModal('detail'); }} className="font-bold text-blue-700">{row.status === '待评审' ? '评审需求' : row.status === '阻断' ? '查看修复项' : '查看计划进度'}</button></td></tr>)}</tbody></table></TableShell>{!rows.length && <EmptyState title="当前条件下没有生产需求" description="调整筛选条件，或创建一条有明确产品、数量、日期和责任人的内部需求。" action={<Button icon={Plus} disabled={!canWrite} onClick={() => setModal('create')}>创建内部需求</Button>} />}<div className="mt-3 text-right text-[11px] text-slate-500">共 {rows.length} 条 · 按状态风险、需求日期排序</div><Modal open={modal === 'create'} onClose={() => setModal(null)} eyebrow="内部需求" title="创建生产需求" footer={<><Button tone="secondary" onClick={() => setModal(null)}>保留当前列表</Button><Button onClick={create}>创建并进入评审</Button></>}><div className="grid gap-4 sm:grid-cols-2"><Field label="来源说明" required><input value={form.source} onChange={event => setForm(prev => ({ ...prev, source: event.target.value }))} className="prod-input w-full" maxLength={100} /></Field><Field label="产品" required><select value={form.product} onChange={event => setForm(prev => ({ ...prev, product: event.target.value }))} className="prod-input w-full"><option>FG001 工业控制器</option><option>FG002 边缘网关</option><option>FG003 数据采集器</option></select></Field><Field label="需求数量" required><input type="number" min="1" step="1" value={form.qty} onChange={event => setForm(prev => ({ ...prev, qty: event.target.value }))} className="prod-input w-full" /></Field><Field label="需求日期" required><input type="date" value={form.due} onChange={event => setForm(prev => ({ ...prev, due: event.target.value }))} className="prod-input w-full" /></Field><Field label="优先级" required><select value={form.priority} onChange={event => setForm(prev => ({ ...prev, priority: event.target.value as typeof form.priority }))} className="prod-input w-full"><option>普通</option><option>高</option><option>紧急</option></select></Field><Field label="责任人" required hint="最终保存员工 ID；岗位只用于搜索">
<EmployeePicker value={form.owner} onChange={value => setForm(prev => ({ ...prev, owner: value }))} employees={employees} />
</Field></div></Modal><Modal open={modal === 'detail'} onClose={() => setModal(null)} eyebrow="需求影响预览" title={selected?.id || '生产需求'} size="lg" footer={<><Button tone="secondary" onClick={() => notify(`已定位销售来源：${selected?.source || '—'}`)}>查看来源单据</Button>{selected?.status === '待评审' && <Button disabled={!canWrite} onClick={approve}>批准并进入计划</Button>}<Button tone="quiet" onClick={() => setModal(null)}>关闭预览</Button></>}><div className="grid gap-4 sm:grid-cols-2"><div className="border border-slate-200 p-4"><div className="text-[11px] text-slate-500">产品与数量</div><div className="mt-1 font-black text-slate-900">{selected?.product} · {selected?.qty} PCS</div></div><div className="border border-slate-200 p-4"><div className="text-[11px] text-slate-500">稳定关联</div><div className="mt-1 font-mono text-[11px] font-bold text-slate-900">{selected?.correlationId}</div></div></div><div className="mt-4 border border-amber-200 bg-amber-50 p-4 text-[12px] leading-6 text-amber-950"><b>影响检查：</b>有效 BOM、工艺和工作中心均已匹配；当前工厂在需求日期前仍存在原料风险。批准只进入计划，不会直接生成已下达工单。</div></Modal></>;
}

function PlanPage({ state, setState, factory, canWrite, notify }: PageProps) {
  const [modal, setModal] = useState<'version' | 'mrp' | null>(null);
  const lastRun = state.tasks.find(item => item.factory === factory && item.type === 'MRP 运算');
  const run = () => { const object = makeId('MRP-RUN'); const task: ProductionTask = { id: makeId('TASK'), factory, type: 'MRP 运算', object, step: '展开 BOM 与净需求计算', status: 'RUNNING', retry: 0, owner: '生产计划组', trace: makeId('tr'), evidence: '任务已接受；输入快照为 MPS-V12，离开页面不会中断。' }; setState(prev => ({ ...prev, tasks: [task, ...prev.tasks] })); setModal(null); notify(`${object} 已创建，可在任务中心跟踪`); };
  const results = [['RM201 AI 算力芯片', '采购件', 640, '380 / 200', 60, 100, 'PD-018 → FG001 L1', '采购建议'], ['RM202 12 层 PCB 板', '采购件', 320, '500 / 0', 0, 0, 'PD-018 → FG001 L1', '无需补充'], ['SA101 核心主板组件', '自制件', 320, '40 / 0', 280, 280, 'PD-018 → FG001 L1', '自制计划'], ['FG002 边缘网关', '自制件', 180, '0 / 120', 60, 60, 'PD-017', '自制计划']];
  return <><PageHeading eyebrow="生产计划" title="MPS / MRP" description="MPS 负责产品层计划、版本审批和冻结；MRP 作为本页长任务展开 BOM、计算净需求并形成采购建议或自制计划订单。" actions={<><Button tone="secondary" icon={GitBranch} onClick={() => setModal('version')}>版本 V12 · 已发布</Button><Button icon={Play} disabled={!canWrite || lastRun?.status === 'RUNNING'} onClick={() => setModal('mrp')}>{lastRun?.status === 'RUNNING' ? 'MRP 任务执行中' : '运行 MRP'}</Button></>} /><div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['计划周期', '2026-07-21 — 08-17'], ['冻结区', '前 7 天 · 至 07-30'], ['已批准需求', `${state.demands.filter(item => item.factory === factory && item.status === '已批准').length} 条`], ['当前版本', 'V12 · RELEASED']].map(item => <div key={item[0]} className="border-t-2 border-blue-700 bg-white px-4 py-4 shadow-[inset_0_0_0_1px_#e2e8f0]"><div className="text-[11px] font-bold text-slate-500">{item[0]}</div><div className="mt-2 text-[14px] font-black text-slate-900">{item[1]}</div></div>)}</div><section className="border border-slate-200 bg-white"><div className="flex items-center justify-between gap-4 border-b border-slate-200 p-4"><div><h3 className="font-black text-slate-900">最近一次 MRP 结果</h3><p className="mt-1 text-[11px] text-slate-500">MRP-RUN-260723-08 · 输入快照 V12 · 算法 mrp-2.6.1</p></div><Status tone="amber">2 项需处理</Status></div><div className="overflow-x-auto"><table className="prod-table"><thead><tr><th>物料</th><th>类型</th><th>毛需求</th><th>可用 / 在途</th><th>净需求</th><th>建议量</th><th>Pegging</th><th>结果</th></tr></thead><tbody>{results.map((row: (string | number)[]) => <tr key={String(row[0])}><td className="font-black text-slate-900">{row[0]}</td><td>{row[1]}</td><td>{row[2]}</td><td>{row[3]}</td><td className={Number(row[4]) ? 'font-black text-rose-700' : 'text-slate-500'}>{row[4]}</td><td>{row[5]}</td><td className="text-[11px] text-slate-500">{row[6]}</td><td><Status tone={row[7] === '无需补充' ? 'green' : row[7] === '采购建议' ? 'amber' : 'blue'}>{row[7]}</Status></td></tr>)}</tbody></table></div></section><Modal open={modal === 'version'} onClose={() => setModal(null)} eyebrow="不可变计划版本" title="MPS V12 发布快照" footer={<Button onClick={() => setModal(null)}>关闭版本详情</Button>}><dl className="grid gap-3 text-[12px] sm:grid-cols-2">{[['状态', 'RELEASED'], ['发布人', '刘主管 / E0018'], ['需求快照', '18 条 / 2,460 PCS'], ['冻结天数', '7 天'], ['发布时间', '2026-07-23 09:58'], ['审计记录', 'AUD-MPS-12028']].map(item => <div key={item[0]} className="border border-slate-200 p-3"><dt className="text-slate-500">{item[0]}</dt><dd className="mt-1 font-black text-slate-900">{item[1]}</dd></div>)}</dl></Modal><Modal open={modal === 'mrp'} onClose={() => setModal(null)} eyebrow="长任务影响预览" title="创建 MRP 运算任务" description="页面可以离开；运算结果不会自动转采购单或下达工单。" footer={<><Button tone="secondary" onClick={() => setModal(null)}>继续检查</Button><Button onClick={run}>创建运算任务</Button></>}><div className="space-y-3 text-[12px]"><div className="flex justify-between border-b border-slate-100 pb-3"><span className="text-slate-500">输入版本</span><b>MPS V12</b></div><div className="flex justify-between border-b border-slate-100 pb-3"><span className="text-slate-500">计算范围</span><b>按当前账号的数据权限</b></div><div className="flex justify-between"><span className="text-slate-500">计划策略</span><b>净需求 · 保留 Pegging</b></div></div></Modal></>;
}

function ApsPage({ setState, factory, canWrite, notify }: PageProps) {
  const [zoom, setZoom] = useState<'day' | 'week'>('day');
  const [selected, setSelected] = useState('OP-260101-20');
  const [modal, setModal] = useState<'constraints' | 'impact' | null>(null);
  const operations = [{ id: 'OP-260112-10', lane: 'SMT-01', label: 'WO-260112 · SMT', left: 7, width: 19, tone: 'blue', risk: '齐套风险' }, { id: 'OP-260101-20', lane: 'ASSY-01', label: 'WO-260101 · 总装', left: 25, width: 24, tone: 'green', risk: '正常' }, { id: 'OP-260104-30', lane: 'TEST-01', label: 'WO-260104 · 测试', left: 47, width: 16, tone: 'green', risk: '正常' }, { id: 'OP-260109-10', lane: 'SMT-02', label: 'WO-260109 · SMT', left: 56, width: 23, tone: 'red', risk: '缺料阻断' }, { id: 'OP-260118-20', lane: 'ASSY-02', label: 'WO-260118 · 总装', left: 73, width: 20, tone: 'amber', risk: '预计延期' }];
  const visible = operations.filter(item => factory === 'FAC-SH-01' ? !['SMT-02', 'ASSY-02'].includes(item.lane) : ['SMT-02', 'ASSY-02'].includes(item.lane));
  const lanes = Array.from(new Set(visible.map(item => item.lane)));
  const active = visible.find(item => item.id === selected) || visible[0];
  useEffect(() => { if (visible[0] && !visible.some(item => item.id === selected)) setSelected(visible[0].id); }, [factory]);
  const generate = () => { const task: ProductionTask = { id: makeId('TASK'), factory, type: 'APS 排程', object: makeId('APS-CAND'), step: '有限产能约束求解', status: 'RUNNING', retry: 0, owner: '生产计划组', trace: makeId('tr'), evidence: '候选方案任务已创建；未发布，不改变当前排程。' }; setState(prev => ({ ...prev, tasks: [task, ...prev.tasks] })); notify('APS 候选任务已创建，当前发布版本未改变'); };
  return <><PageHeading eyebrow="有限产能排程" title="APS 排产" description="甘特图是默认主视图：横轴为时间，纵轴为工作中心；发布前必须查看延期、缺料、加班和被挤压订单影响。" actions={<><Button tone="secondary" icon={SlidersHorizontal} onClick={() => setModal('constraints')}>约束与权重</Button><Button icon={Play} disabled={!canWrite} onClick={generate}>生成候选方案</Button></>} /><section className="border border-slate-200 bg-white"><div className="flex flex-col gap-3 border-b border-slate-200 p-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2"><Status tone="blue">候选 V18</Status><Status tone="green">硬约束已通过</Status><Status tone="amber">2 个交期风险</Status></div><div className="flex items-center gap-1"><Button tone="quiet" icon={ZoomOut} aria-label="缩小时间范围" onClick={() => setZoom('week')} /><div className="flex rounded-lg border border-slate-300 p-0.5">{([['day', '日'], ['week', '周']] as const).map(item => <button key={item[0]} onClick={() => setZoom(item[0])} className={`min-h-8 rounded-md px-3 text-[11px] font-black ${zoom === item[0] ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>{item[1]}</button>)}</div><Button tone="quiet" icon={ZoomIn} aria-label="放大时间范围" onClick={() => setZoom('day')} /></div></div><div className="grid xl:grid-cols-[1fr_300px]"><div className="min-w-0 overflow-x-auto border-r border-slate-200"><div className={zoom === 'day' ? 'min-w-[880px]' : 'min-w-[1120px]'}><div className="grid grid-cols-[120px_1fr] border-b border-slate-200 bg-slate-50"><div className="border-r border-slate-200 p-3 text-[11px] font-black text-slate-600">工作中心</div><div className="grid grid-cols-8 text-center text-[10px] font-bold text-slate-500">{['07-23', '07-24', '07-25', '07-26', '07-27', '07-28', '07-29', '07-30'].map(date => <div key={date} className="border-r border-slate-200 py-3 last:border-0">{date}</div>)}</div></div><div className="relative"><div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-rose-500" style={{ left: '31%' }}><span className="absolute -top-5 -translate-x-1/2 whitespace-nowrap bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold text-white">当前</span></div><div className="pointer-events-none absolute bottom-0 left-[120px] top-0 w-[16%] border-r border-blue-200 bg-blue-50/70"><span className="absolute bottom-2 left-2 flex items-center gap-1 text-[9px] font-bold text-blue-600"><Lock size={10} />冻结区</span></div>{lanes.map(lane => <div key={lane} className="grid min-h-[78px] grid-cols-[120px_1fr] border-b border-slate-100 last:border-0"><div className="flex items-center border-r border-slate-200 bg-slate-50/60 px-3 text-[11px] font-black text-slate-700">{lane}</div><div className="prod-gantt-lane relative">{visible.filter(item => item.lane === lane).map(item => <button key={item.id} onClick={() => setSelected(item.id)} style={{ left: `${item.left}%`, width: `${item.width}%` }} className={`absolute top-5 h-9 overflow-hidden border px-2 text-left text-[10px] font-black transition-transform hover:-translate-y-0.5 ${item.id === active?.id ? 'z-10 ring-2 ring-slate-900 ring-offset-1' : ''} ${item.tone === 'green' ? 'border-emerald-600 bg-emerald-100 text-emerald-900' : item.tone === 'red' ? 'border-rose-500 bg-rose-100 text-rose-900' : item.tone === 'amber' ? 'border-amber-500 bg-amber-100 text-amber-950' : 'border-blue-500 bg-blue-100 text-blue-900'}`}>{item.label}</button>)}</div></div>)}</div></div></div><aside className="p-5"><div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">当前工序</div><div className="mt-2 text-[14px] font-black text-slate-900">{active?.label}</div><dl className="mt-5 space-y-3 text-[12px]"><div className="flex justify-between"><dt className="text-slate-500">工序编号</dt><dd className="font-bold">{active?.id}</dd></div><div className="flex justify-between"><dt className="text-slate-500">工作中心</dt><dd className="font-bold">{active?.lane}</dd></div><div className="flex justify-between"><dt className="text-slate-500">状态</dt><dd><Status tone={statusTone(active?.risk || '')}>{active?.risk}</Status></dd></div></dl><div className="mt-5 border-t border-slate-200 pt-4"><div className="text-[11px] font-black text-slate-800">影响摘要</div><ul className="mt-2 space-y-2 text-[11px] leading-5 text-slate-600"><li>• 工作中心时段硬约束已校验</li><li>• 调整将影响 1 个后续工序</li><li>• 不显示 P1 设备与成本字段</li></ul></div><Button className="mt-5 w-full" tone="secondary" disabled={!canWrite} onClick={() => setModal('impact')}>预览并保存调整</Button></aside></div></section><Modal open={modal === 'constraints'} onClose={() => setModal(null)} eyebrow="求解参数" title="APS 约束与权重" footer={<Button onClick={() => setModal(null)}>保存候选参数</Button>}><div className="space-y-4"><Field label="冻结区" hint="冻结区内普通计划员不可移动"><select className="prod-input w-full"><option>7 天</option><option>5 天</option></select></Field><Field label="交期权重"><input type="range" min="1" max="10" defaultValue="8" className="w-full" /></Field><Field label="换线惩罚"><input type="range" min="1" max="10" defaultValue="6" className="w-full" /></Field></div></Modal><Modal open={modal === 'impact'} onClose={() => setModal(null)} eyebrow="排程影响预览" title="保存候选调整" footer={<><Button tone="secondary" onClick={() => setModal(null)}>继续检查</Button><Button onClick={() => { setModal(null); notify('调整已保存到候选 V18，发布版本未改变'); }}>保存候选调整</Button></>}><div className="grid gap-3 sm:grid-cols-2">{[['延期变化', 'WO-260118 +6 小时'], ['缺料变化', 'RM201 风险不变'], ['加班需求', '周六 4 小时'], ['被挤压订单', 'WO-260121']].map(item => <div key={item[0]} className="border border-slate-200 p-3"><div className="text-[11px] text-slate-500">{item[0]}</div><div className="mt-1 text-[12px] font-black text-slate-900">{item[1]}</div></div>)}</div></Modal></>;
}

function KittingPage({ setState, factory, canWrite, notify }: PageProps) {
  const [detail, setDetail] = useState<string | null>(null);
  const rows = factory === 'FAC-SH-01' ? [{ code: 'RM201', name: 'AI 算力芯片', required: 640, available: 380, onWay: 200, frozen: 0, shortage: 60, status: '严重缺料' }, { code: 'RM202', name: '12 层 PCB 板', required: 320, available: 500, onWay: 0, frozen: 20, shortage: 0, status: '可用' }, { code: 'RM305', name: '铝合金防护外壳', required: 320, available: 280, onWay: 80, frozen: 0, shortage: 0, status: '到货可齐套' }, { code: 'PK101', name: '控制器包装套件', required: 320, available: 460, onWay: 0, frozen: 0, shortage: 0, status: '可用' }] : [{ code: 'RM411', name: '无线通信模组', required: 240, available: 160, onWay: 40, frozen: 0, shortage: 40, status: '严重缺料' }, { code: 'PK205', name: '终端包装套件', required: 120, available: 180, onWay: 0, frozen: 0, shortage: 0, status: '可用' }];
  const addTask = (type: '齐套重检' | '库存预占') => { const task: ProductionTask = { id: makeId('TASK'), factory, type, object: factory === 'FAC-SH-01' ? 'WO-260112' : 'WO-260109', step: type === '齐套重检' ? '重新读取可用量与在途' : '等待库存确认预占', status: type === '齐套重检' ? 'RUNNING' : 'WAITING_CONFIRM', retry: 0, owner: type === '齐套重检' ? '物料计划组' : '库存责任组', trace: makeId('tr'), evidence: '使用原业务对象和幂等键创建；未确认前不增加预占量。' }; setState(prev => ({ ...prev, tasks: [task, ...prev.tasks] })); notify(`${type}任务已创建，可在任务中心跟踪`, type === '库存预占' ? 'warning' : 'success'); };
  const selected = rows.find(item => item.code === detail);
  return <><PageHeading eyebrow="排产与准备" title="物料齐套与投料" description="按工单 BOM 快照核对可用、在途、冻结与缺口；预占、投料、补料和退料只有在库存确认后才累计数量。" actions={<><Button tone="secondary" icon={RefreshCw} disabled={!canWrite} onClick={() => addTask('齐套重检')}>重新检查</Button><Button icon={Lock} disabled={!canWrite || rows.some(item => item.shortage > 0)} title={rows.some(item => item.shortage > 0) ? '关键料存在缺口，不能请求整单预占' : undefined} onClick={() => addTask('库存预占')}>请求预占</Button></>} /><div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['工单', factory === 'FAC-SH-01' ? 'WO-260112' : 'WO-260109'], ['齐套等级', rows.some(item => item.shortage > 0) ? 'SHORTAGE' : 'READY'], ['物料行', `${rows.length} 项`], ['预计齐套', '07-25 14:00']].map((item, index) => <div key={item[0]} className="border border-slate-200 bg-white p-4"><div className="text-[11px] font-bold text-slate-500">{item[0]}</div><div className={`mt-2 text-[15px] font-black ${index === 1 && item[1] === 'SHORTAGE' ? 'text-rose-700' : 'text-slate-900'}`}>{item[1]}</div></div>)}</div><TableShell><table className="prod-table"><thead><tr><th>物料</th><th>需要量</th><th>可用量</th><th>在途</th><th>冻结</th><th>缺口</th><th>状态</th><th>下一动作</th></tr></thead><tbody>{rows.map(row => <tr key={row.code}><td><div className="font-black text-slate-900">{row.code}</div><div className="text-[10px] text-slate-500">{row.name}</div></td><td>{row.required}</td><td>{row.available}</td><td>{row.onWay}</td><td>{row.frozen}</td><td className={row.shortage ? 'font-black text-rose-700' : ''}>{row.shortage}</td><td><Status tone={statusTone(row.status)}>{row.status}</Status></td><td><button onClick={() => setDetail(row.code)} className="font-bold text-blue-700">{row.shortage ? '查看采购建议' : '查看库存明细'}</button></td></tr>)}</tbody></table></TableShell><div className="mt-4 grid gap-4 lg:grid-cols-3"><div className="border-l-4 border-rose-500 bg-rose-50 p-4"><div className="text-[12px] font-black text-rose-900">下达阻断</div><p className="mt-1 text-[11px] leading-5 text-rose-800">关键料在需用日前不可得时，工单不得越权下达。</p></div><div className="border-l-4 border-amber-500 bg-amber-50 p-4"><div className="text-[12px] font-black text-amber-950">到货风险</div><p className="mt-1 text-[11px] leading-5 text-amber-900">ETA 变化或库存被占用后，READY 会过期并触发重检。</p></div><div className="border-l-4 border-blue-600 bg-blue-50 p-4"><div className="text-[12px] font-black text-blue-950">库存口径</div><p className="mt-1 text-[11px] leading-5 text-blue-900">页面不直接改库存；唯一库存流水才是数量事实。</p></div></div><Modal open={Boolean(detail)} onClose={() => setDetail(null)} eyebrow={selected?.shortage ? '采购建议' : '库存明细'} title={`${selected?.code || ''} ${selected?.name || ''}`} footer={<><Button tone="secondary" onClick={() => setDetail(null)}>关闭详情</Button>{selected?.shortage ? <Button onClick={() => { setDetail(null); notify('采购建议影响已发送采购模块，尚未生成采购单'); }}>发送采购建议</Button> : <Button onClick={() => notify('已打开库存批次与冻结明细')}>查看批次明细</Button>}</>}><div className="grid gap-3 sm:grid-cols-2">{[['当前可用', `${selected?.available || 0} PCS`], ['在途数量', `${selected?.onWay || 0} PCS`], ['冻结数量', `${selected?.frozen || 0} PCS`], ['最终缺口', `${selected?.shortage || 0} PCS`]].map(item => <div key={item[0]} className="border border-slate-200 p-3"><div className="text-[11px] text-slate-500">{item[0]}</div><div className="mt-1 font-black text-slate-900">{item[1]}</div></div>)}</div></Modal></>;
}

const orderTabs = ['工序', '齐套', '投退料', '报工', '质量', '完工入库', '审计'] as const;

function OrdersPage({ state, setState, factory, canWrite, notify, navigate, workCenters }: PageProps) {
  const rows = state.orders.filter(item => item.factory === factory);
  const [selectedId, setSelectedId] = useState(rows[0]?.id || '');
  const [tab, setTab] = useState<(typeof orderTabs)[number]>('工序');
  const [modal, setModal] = useState<'create' | 'release' | null>(null);
  const [draft, setDraft] = useState({ product: 'FG001 工业控制器', qty: '100', due: '2026-08-06T18:00', center: workCenters[0]?.code || '' });
  useEffect(() => { if (!workCenters.some((item) => item.code === draft.center)) setDraft((previous) => ({ ...previous, center: workCenters[0]?.code || '' })); }, [workCenters, draft.center]);
  useEffect(() => { const next = state.orders.find(item => item.id === selectedId && item.factory === factory) || rows[0]; setSelectedId(next?.id || ''); }, [factory]);
  const selected = state.orders.find(item => item.id === selectedId) || rows[0];
  const selectRow = (id: string) => setSelectedId(id);
  const createDraft = () => { if (Number(draft.qty) <= 0 || !draft.due || !draft.center) { notify('计划数量、计划完工时间和启用的工作中心均为必填', 'error'); return; } const next: WorkOrder = { id: makeId('WO'), factory, product: draft.product, qty: Number(draft.qty), good: 0, posted: 0, due: draft.due.replace('T', ' ').slice(5, 16), status: 'DRAFT', kitting: 'PARTIAL', progress: 0, source: '授权手工草稿', center: draft.center }; setState(prev => ({ ...prev, orders: [next, ...prev.orders] })); setSelectedId(next.id); setModal(null); notify(`${next.id} 草稿已创建，需完成 APS、齐套和预占后才能下达`); };
  const release = () => { if (!selected || selected.kitting !== 'READY') return; setState(prev => ({ ...prev, orders: prev.orders.map(item => item.id === selected.id ? { ...item, status: 'RELEASED' } : item) })); setModal(null); notify(`${selected.id} 已下达，影响预览与审计记录已保存`); };
  return <><PageHeading eyebrow="车间执行" title="生产工单" description="从已发布排程承接工单，统一查看工序、齐套、投退料、报工、质量、完工入库与审计；下达和取消必须先做影响预览。" actions={<Button icon={Plus} disabled={!canWrite} onClick={() => setModal('create')}>创建授权草稿</Button>} /><div className="grid gap-5 2xl:grid-cols-[1fr_390px]"><TableShell><table className="prod-table"><thead><tr><th>工单</th><th>产品 / 来源</th><th>计划数量</th><th>进度</th><th>齐套</th><th>状态</th><th>交期</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} role="button" tabIndex={0} aria-selected={selectedId === row.id} onClick={() => selectRow(row.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRow(row.id); } }} className={`cursor-pointer ${selectedId === row.id ? 'bg-blue-50/70' : ''}`}><td className="font-black text-slate-900">{row.id}</td><td>{row.product}<div className="text-[10px] text-slate-500">{row.source}</div></td><td>{row.qty} PCS</td><td><div className="flex min-w-28 items-center gap-2"><div className="h-1.5 flex-1 bg-slate-200"><div className="h-full bg-blue-600" style={{ width: `${row.progress}%` }} /></div><span className="text-[10px] font-bold">{row.progress}%</span></div></td><td><Status tone={statusTone(row.kitting)}>{row.kitting}</Status></td><td><Status tone={statusTone(row.status)}>{row.status}</Status></td><td>{row.due}</td></tr>)}</tbody></table></TableShell><aside className="border border-slate-200 bg-white"><div className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">工单详情</div><h3 className="mt-1 text-[18px] font-black text-slate-950">{selected?.id || '未选择'}</h3></div>{selected && <Status tone={statusTone(selected.status)}>{selected.status}</Status>}</div><div className="mt-4 grid grid-cols-2 gap-2 text-[11px]"><div className="border border-slate-200 p-3 text-slate-500">计划数量<b className="mt-1 block text-slate-900">{selected?.qty || 0} PCS</b></div><div className="border border-slate-200 p-3 text-slate-500">合格 / 已入库<b className="mt-1 block text-slate-900">{selected?.good || 0} / {selected?.posted || 0}</b></div></div></div><div className="custom-scrollbar flex overflow-x-auto border-y border-slate-200" role="tablist">{orderTabs.map(item => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`min-h-10 shrink-0 border-b-2 px-3 text-[11px] font-black ${tab === item ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500'}`}>{item}</button>)}</div><div className="min-h-44 p-5 text-[11px] leading-5 text-slate-600">{tab === '工序' && <ol className="space-y-3">{['10 · SMT 贴片 · 已完成', '20 · 总装 · 执行中', '30 · 功能测试 · 待开始'].map((item, index) => <li key={item} className="flex gap-2"><span className={`mt-1 h-2.5 w-2.5 rounded-full ${index < 2 ? 'bg-emerald-500' : 'bg-slate-200'}`} />{item}</li>)}</ol>}{tab === '齐套' && <div><Status tone={statusTone(selected?.kitting || '')}>{selected?.kitting}</Status><p className="mt-3">关键料、非关键料和预占状态均来自库存快照。</p></div>}{tab === '投退料' && <div>累计投料 148 PCS · 退料 0 PCS<div className="mt-3 border border-slate-200 p-3">库存流水：STK-ISSUE-260723-1028</div></div>}{tab === '报工' && <div>{state.reports.filter(item => item.order === selected?.id).length ? state.reports.filter(item => item.order === selected?.id).map(item => <div key={item.id} className="mb-2 border border-slate-200 p-3"><b>{item.id}</b> · 合格 {item.good} · {item.status}</div>) : '暂无本原型会话新增的报工记录。'}</div>}{tab === '质量' && <div>{state.quality.filter(item => item.order === selected?.id).map(item => <div key={item.id} className="mb-2 border border-slate-200 p-3"><b>{item.id}</b> · {item.result}</div>)}</div>}{tab === '完工入库' && <div>{state.completions.filter(item => item.order === selected?.id).map(item => <div key={item.id} className="mb-2 border border-slate-200 p-3"><b>{item.id}</b> · {item.qty} PCS · {item.status}</div>)}</div>}{tab === '审计' && <div className="space-y-2"><div>07-23 09:18 · 周计划 · 查看工单</div><div>07-22 16:42 · 系统 · 固化 BOM/工艺快照</div></div>}</div><div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-4"><Button tone="secondary" disabled={!selected} onClick={() => navigate('report')}>录入报工</Button><Button disabled={!selected || !canWrite || selected.kitting !== 'READY' || ['RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'].includes(selected.status)} title={selected?.kitting !== 'READY' ? '齐套或预占未通过，不能下达' : undefined} onClick={() => setModal('release')}>预览并下达</Button></div></aside></div><Modal open={modal === 'create'} onClose={() => setModal(null)} eyebrow="授权手工草稿" title="创建生产工单草稿" description="草稿必须参与 APS、齐套和库存预占，不会直接变成已下达工单。" footer={<><Button tone="secondary" onClick={() => setModal(null)}>继续查看</Button><Button onClick={createDraft}>保存工单草稿</Button></>}><div className="grid gap-4 sm:grid-cols-2"><Field label="产品" required><select value={draft.product} onChange={event => setDraft(prev => ({ ...prev, product: event.target.value }))} className="prod-input w-full"><option>FG001 工业控制器</option><option>FG002 边缘网关</option></select></Field><Field label="计划数量" required><input type="number" min="1" value={draft.qty} onChange={event => setDraft(prev => ({ ...prev, qty: event.target.value }))} className="prod-input w-full" /></Field><Field label="计划完工" required><input type="datetime-local" value={draft.due} onChange={event => setDraft(prev => ({ ...prev, due: event.target.value }))} className="prod-input w-full" /></Field>
<Field label="工作中心" required hint="仅显示平台中已启用且属于当前授权工厂的资源"><select value={draft.center} onChange={event => setDraft(prev => ({ ...prev, center: event.target.value }))} className="prod-input w-full" disabled={!workCenters.length}>{workCenters.map((item) => <option key={item.id} value={item.code}>{item.name} · {item.code}</option>)}</select></Field>
</div></Modal><Modal open={modal === 'release'} onClose={() => setModal(null)} eyebrow="敏感操作确认" title={`下达工单 ${selected?.id || ''}`} description="下达后车间可开工和报工；取消需要另行进行影响预览。" footer={<><Button tone="secondary" onClick={() => setModal(null)}>继续检查</Button><Button onClick={release}>确认下达工单</Button></>}><div className="space-y-3 text-[12px]"><div className="flex justify-between border-b border-slate-100 pb-3"><span className="text-slate-500">BOM / 工艺快照</span><b>有效 · 已固化</b></div><div className="flex justify-between border-b border-slate-100 pb-3"><span className="text-slate-500">齐套 / 预占</span><b>{selected?.kitting} / 已确认</b></div><div className="flex justify-between"><span className="text-slate-500">人员与班次</span><b>技能有效 · 工作时段内</b></div></div></Modal></>;
}

function ReportPage({ state, setState, factory, canWrite, notify, employees }: PageProps) {
  const orders = state.orders.filter(item => item.factory === factory && !['CLOSED'].includes(item.status));
  const [values, setValues] = useState({ order: orders[0]?.id || '', operation: '20 · 总装', batch: 'WIP-260723-A', input: '40', good: '38', bad: '2', scrap: '0', hours: '4.5', operator: '张伟 / E0081' });
  useEffect(() => { if (!orders.some(item => item.id === values.order)) setValues(prev => ({ ...prev, order: orders[0]?.id || '' })); }, [factory]);
  const total = Number(values.good || 0) + Number(values.bad || 0) + Number(values.scrap || 0);
  const input = Number(values.input || 0);
  const error = input <= 0 ? '投入量必须大于 0。' : [values.good, values.bad, values.scrap].some(item => Number(item) < 0) ? '数量不能为负数。' : total > input ? `合格、不良与报废合计 ${total}，超过可报上限 ${input}。` : '';
  const change = (key: string, value: string) => setValues(prev => ({ ...prev, [key]: value }));
  const save = (status: 'DRAFT' | 'POSTED') => { if (status === 'POSTED' && (error || !values.order || !values.batch.trim() || !values.operator.includes('/') || Number(values.hours) <= 0)) { notify(error || '请完整填写工单、批次、操作人和正数基础工时', 'error'); return; } const existing = state.reports.find(item => item.order === values.order && item.batch === values.batch && item.status === 'DRAFT'); const id = existing?.id || makeId('RPT'); const report = { id, factory, order: values.order, operation: values.operation, batch: values.batch, input, good: Number(values.good), bad: Number(values.bad), scrap: Number(values.scrap), hours: Number(values.hours), operator: values.operator, status, time: '刚刚' } as const; setState(prev => ({ ...prev, reports: [report, ...prev.reports.filter(item => item.id !== id)], orders: status === 'POSTED' ? prev.orders.map(item => item.id === values.order ? { ...item, good: Math.min(item.qty, item.good + Number(values.good)), progress: Math.min(100, Math.round(((item.good + Number(values.good)) / item.qty) * 100)), status: 'IN_PROGRESS' } : item) : prev.orders })); notify(status === 'DRAFT' ? '报工草稿已保存；未改变工单进度' : `报工 ${id} 已记录，数量守恒校验通过`); };
  return <><PageHeading eyebrow="车间执行" title="报工录入" description="采集工序投入、合格、不良、报废和基础工时；保存草稿不提交，更正已过账记录时生成反向记录和新记录。" /><div className="grid gap-5 xl:grid-cols-[1fr_320px]"><form onSubmit={event => { event.preventDefault(); save('POSTED'); }} className="border border-slate-200 bg-white p-5"><div className="grid gap-5 md:grid-cols-2"><Field label="生产工单" required><select className="prod-input w-full" value={values.order} onChange={event => change('order', event.target.value)}>{orders.map(item => <option key={item.id}>{item.id}</option>)}</select></Field><Field label="工序" required><select className="prod-input w-full" value={values.operation} onChange={event => change('operation', event.target.value)}><option>20 · 总装</option><option>30 · 功能测试</option></select></Field><Field label="在制批次" required><input className="prod-input w-full" value={values.batch} onChange={event => change('batch', event.target.value)} maxLength={64} /></Field><Field label="操作人" required hint="可按姓名、工号、部门、岗位或手机号后四位搜索">
<EmployeePicker value={values.operator} onChange={value => change('operator', value)} employees={employees} />
</Field></div><div className="my-5 border-t border-slate-200" /><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5"><Field label="投入量" required><input type="number" min="0" className="prod-input w-full" value={values.input} onChange={event => change('input', event.target.value)} /></Field><Field label="合格量" required><input type="number" min="0" className="prod-input w-full" value={values.good} onChange={event => change('good', event.target.value)} /></Field><Field label="不良量" required><input type="number" min="0" className="prod-input w-full" value={values.bad} onChange={event => change('bad', event.target.value)} /></Field><Field label="报废量" required error={error}><input type="number" min="0" aria-invalid={Boolean(error)} className={`prod-input w-full ${error ? 'border-rose-500' : ''}`} value={values.scrap} onChange={event => change('scrap', event.target.value)} /></Field><Field label="基础工时" required><input type="number" min="0.1" step="0.1" className="prod-input w-full" value={values.hours} onChange={event => change('hours', event.target.value)} /></Field></div><div className="mt-6 flex justify-end gap-2"><Button tone="secondary" onClick={() => save('DRAFT')} disabled={!canWrite}>保存草稿</Button><Button type="submit" disabled={!canWrite || Boolean(error)}>提交报工</Button></div></form><aside className="border border-slate-800 bg-slate-950 p-5 text-slate-100"><div className="text-[11px] font-black uppercase tracking-[0.15em] text-blue-300">数量守恒</div><div className="mt-4 text-[30px] font-black">{total}<span className="ml-1 text-[12px] text-slate-400">/ {input} PCS</span></div><div className="mt-3 h-2 bg-slate-800"><div className={`h-full ${error ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (total / Math.max(1, input)) * 100)}%` }} /></div><p className="mt-4 text-[11px] leading-5 text-slate-400">合格 + 不良 + 报废不得超过投入量。重复提交使用同一业务关系，不产生第二笔记录。</p><div className="mt-5 border-t border-slate-800 pt-4 text-[11px] text-slate-400">本会话记录：<b className="text-white">{state.reports.filter(item => item.factory === factory).length}</b> 条</div></aside></div></>;
}

function QualityPage({ state, setState, factory, canWrite, notify, navigate }: PageProps) {
  const rows = state.quality.filter(item => item.factory === factory);
  const [selectedId, setSelectedId] = useState(rows[0]?.id || '');
  const [modal, setModal] = useState<'inspect' | 'rework' | 'scrap' | null>(null);
  const [form, setForm] = useState({ passed: '20', failed: '0', defect: '', value: '12.08', note: '' });
  useEffect(() => { if (!rows.some(item => item.id === selectedId)) setSelectedId(rows[0]?.id || ''); }, [factory]);
  const selected = state.quality.find(item => item.id === selectedId) || rows[0];
  const record = () => { if (!selected) return; const pass = Number(form.passed); const fail = Number(form.failed); if (pass < 0 || fail < 0 || pass + fail !== selected.sample) { notify(`抽样合格与不合格合计必须等于抽样数 ${selected.sample}`, 'error'); return; } if (fail > 0 && !form.defect) { notify('存在不合格样本时必须选择缺陷代码', 'error'); return; } setState(prev => ({ ...prev, quality: prev.quality.map(item => item.id === selected.id ? { ...item, passedSamples: pass, failedSamples: fail, defectCode: form.defect, status: fail ? 'DISPOSITION_PENDING' : 'PASSED', result: fail ? `不合格 ${fail} · 待处置` : `合格 ${item.pending}` } : item) })); setModal(null); notify(fail ? `${selected.id} 已进入处置待办，不允许直接改为合格` : `${selected.id} 已判定合格，可发起对应数量完工入库`, fail ? 'warning' : 'success'); };
  const rework = () => { if (!selected) return; const next: QualityTask = { ...selected, id: makeId('FQC-RW'), status: 'INSPECTING', passedSamples: 0, failedSamples: 0, defectCode: '', result: '返工后待复检' }; const task: ProductionTask = { id: makeId('TASK'), factory, type: 'FQC 处置', object: next.id, step: '等待返工报工与复检', status: 'RUNNING', retry: 0, owner: '质量责任组', trace: makeId('tr'), evidence: `来源检验 ${selected.id} 保留；新复检合格后才允许完工。` }; setState(prev => ({ ...prev, quality: [next, ...prev.quality], tasks: [task, ...prev.tasks] })); setSelectedId(next.id); setModal(null); notify(`返工复检 ${next.id} 已创建，原失败检验保留`); };
  const scrap = () => { if (!selected) return; setState(prev => ({ ...prev, quality: prev.quality.map(item => item.id === selected.id ? { ...item, status: 'SCRAPPED', result: `报废 ${item.failedSamples || item.pending} · 已终止完工` } : item) })); setModal(null); notify('报废终止已记录；该数量不会进入完工，并提示补产或差异结案', 'warning'); };
  const choose = (id: string) => setSelectedId(id);
  return <><PageHeading eyebrow="P0 精简 QMS" title="FQC 任务" description="FQC 是成品入库前置条件；检验录入包含抽样结果、实测值和缺陷代码，失败后只能返工复检或报废终止。" actions={<Button tone="secondary" icon={RefreshCw} onClick={() => notify('FQC 任务已按当前工厂刷新')}>刷新任务</Button>} /><div className="grid gap-5 xl:grid-cols-[1fr_360px]"><TableShell><table className="prod-table"><thead><tr><th>检验单</th><th>工单 / 产品</th><th>待检量</th><th>抽样数</th><th>结果</th><th>状态</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} role="button" tabIndex={0} onClick={() => choose(row.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(row.id); } }} className={`cursor-pointer ${selectedId === row.id ? 'bg-blue-50/70' : ''}`}><td className="font-black text-slate-900">{row.id}</td><td>{row.order}<div className="text-[10px] text-slate-500">{row.product}</div></td><td>{row.pending} PCS</td><td>{row.sample}</td><td>{row.result}</td><td><Status tone={statusTone(row.status)}>{row.status}</Status></td></tr>)}</tbody></table></TableShell><aside className="border border-slate-200 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">检验判定</div><div className="mt-2 text-[17px] font-black text-slate-950">{selected?.id}</div><div className="mt-4 space-y-3 text-[12px]"><div className="flex justify-between"><span className="text-slate-500">工单</span><b>{selected?.order}</b></div><div className="flex justify-between"><span className="text-slate-500">待检量</span><b>{selected?.pending} PCS</b></div><div className="flex justify-between"><span className="text-slate-500">抽样方案</span><b>GB/T 2828.1 · II</b></div></div>{selected?.status === 'INSPECTING' ? <Button className="mt-5 w-full" icon={ClipboardCheck} disabled={!canWrite} onClick={() => { setForm({ passed: String(selected.sample), failed: '0', defect: '', value: '12.08', note: '' }); setModal('inspect'); }}>录入检验结果</Button> : selected?.status === 'PASSED' ? <Button className="mt-5 w-full" icon={PackageCheck} onClick={() => navigate('completion')}>前往完工入库</Button> : selected?.status === 'DISPOSITION_PENDING' ? <div className="mt-5 space-y-2"><Button className="w-full" tone="secondary" icon={RotateCcw} disabled={!canWrite} onClick={() => setModal('rework')}>创建返工复检</Button><Button className="w-full" tone="danger" icon={FileWarning} disabled={!canWrite} onClick={() => setModal('scrap')}>提交报废终止</Button></div> : <div className="mt-5 border border-rose-200 bg-rose-50 p-3 text-[11px] leading-5 text-rose-900">已报废终止，不允许该数量完工入库。</div>}</aside></div><Modal open={modal === 'inspect'} onClose={() => setModal(null)} eyebrow="检验录入" title={`${selected?.id || ''} 抽样结果`} footer={<><Button tone="secondary" onClick={() => setModal(null)}>继续检查</Button><Button onClick={record}>保存检验判定</Button></>}><div className="grid gap-4 sm:grid-cols-2"><Field label="抽样合格数" required><input type="number" min="0" value={form.passed} onChange={event => setForm(prev => ({ ...prev, passed: event.target.value }))} className="prod-input w-full" /></Field><Field label="抽样不合格数" required><input type="number" min="0" value={form.failed} onChange={event => setForm(prev => ({ ...prev, failed: event.target.value }))} className="prod-input w-full" /></Field><Field label="电压实测值（V）" required><input type="number" step="0.01" value={form.value} onChange={event => setForm(prev => ({ ...prev, value: event.target.value }))} className="prod-input w-full" /></Field><Field label="缺陷代码" required={Number(form.failed) > 0}><select value={form.defect} onChange={event => setForm(prev => ({ ...prev, defect: event.target.value }))} className="prod-input w-full"><option value="">无缺陷</option><option value="DEF-COS-02">DEF-COS-02 · 外观划伤</option><option value="DEF-FUN-01">DEF-FUN-01 · 功能异常</option></select></Field><div className="sm:col-span-2"><Field label="检验备注"><textarea value={form.note} onChange={event => setForm(prev => ({ ...prev, note: event.target.value }))} className="prod-input min-h-20 w-full" maxLength={200} /></Field></div></div></Modal><Modal open={modal === 'rework'} onClose={() => setModal(null)} eyebrow="不合格处置" title="创建返工复检" description="原失败检验不会被覆盖；返工报工后生成新的复检任务。" footer={<><Button tone="secondary" onClick={() => setModal(null)}>继续检查</Button><Button onClick={rework}>确认创建返工复检</Button></>}><div className="border border-blue-200 bg-blue-50 p-4 text-[12px] leading-6 text-blue-900">返工对象：{selected?.order} · 缺陷：{selected?.defectCode || '待补充'} · 数量：{selected?.failedSamples || selected?.pending} PCS。</div></Modal><Modal open={modal === 'scrap'} onClose={() => setModal(null)} eyebrow="高风险操作" title="提交报废终止" description="报废审批人必须与检验人不同；该数量不会产生完工入库。" footer={<><Button tone="secondary" onClick={() => setModal(null)}>保留待处置</Button><Button tone="danger" onClick={scrap}>提交报废审批</Button></>}><Field label="报废原因" required><select className="prod-input w-full"><option>不可返修的功能失效</option><option>材料缺陷导致不可修复</option></select></Field></Modal></>;
}

type CompletionErrors = Partial<Record<'qty' | 'bin' | 'trace' | 'date', string>>;

function CompletionPage({ state, setState, factory, canWrite, notify, warehouses }: PageProps) {
  const eligible = state.quality.filter(item => item.factory === factory && item.status === 'PASSED');
  const defaultWarehouse = warehouses[0]?.id || (factory === 'FAC-SZ-01' ? 'RES-WH-FG-02' : 'RES-WH-FG-01');
  const [form, setForm] = useState({ inspection: eligible[0]?.id || '', qty: eligible[0]?.product.includes('边缘网关') ? '2' : '40', warehouseResource: defaultWarehouse, bin: warehouseMappings[defaultWarehouse].bins[0].id, traceValue: eligible[0]?.product.includes('边缘网关') ? '' : 'FG001-260723-B', productionDate: '2026-07-23', remark: '' });
  const [errors, setErrors] = useState<CompletionErrors>({});
  const [modal, setModal] = useState<'confirm' | 'allocation' | 'close' | null>(null);
  const [selectedCompletion, setSelectedCompletion] = useState<string>('');
  useEffect(() => { const first = state.quality.find(item => item.factory === factory && item.status === 'PASSED'); const resource = warehouses[0]?.id || (factory === 'FAC-SZ-01' ? 'RES-WH-FG-02' : 'RES-WH-FG-01'); setForm(prev => ({ ...prev, inspection: first?.id || '', qty: first?.product.includes('边缘网关') ? '2' : first ? String(Math.min(40, first.pending)) : '', warehouseResource: resource, bin: warehouseMappings[resource].bins[0].id, traceValue: first?.product.includes('边缘网关') ? '' : first ? `${first.order.replace('WO-', 'LOT-')}-A` : '' })); setErrors({}); }, [factory, warehouses]);
  const quality = state.quality.find(item => item.id === form.inspection);
  const order = state.orders.find(item => item.id === quality?.order);
  const mapping = warehouseMappings[form.warehouseResource];
  const traceMode: 'BATCH' | 'SERIAL' = quality?.product.includes('边缘网关') ? 'SERIAL' : 'BATCH';
  const alreadyRequested = state.completions.filter(item => item.inspection === form.inspection && item.status !== 'FAILED').reduce((sum, item) => sum + item.qty, 0);
  const available = Math.max(0, (quality?.pending || 0) - alreadyRequested);
  const qty = Number(form.qty || 0);
  const allocation = [{ orderLine: 'SO-260902-01-L1', shortage: 32, qty: Math.min(qty, 32) }, { orderLine: '普通成品库存', shortage: 9999, qty: Math.max(0, qty - 32) }].filter(item => item.qty > 0);
  const setWarehouse = (value: keyof typeof warehouseMappings) => setForm(prev => ({ ...prev, warehouseResource: value, bin: warehouseMappings[value].bins[0].id }));
  const setInspection = (value: string) => { const next = state.quality.find(item => item.id === value); setForm(prev => ({ ...prev, inspection: value, qty: next?.product.includes('边缘网关') ? '2' : String(Math.min(40, next?.pending || 0)), traceValue: next?.product.includes('边缘网关') ? '' : `${next?.order.replace('WO-', 'LOT-')}-A` })); setErrors({}); };
  const validate = () => { const next: CompletionErrors = {}; if (!Number.isInteger(qty) || qty <= 0) next.qty = '本次入库量必须为正整数。'; else if (qty > available) next.qty = `不能超过该 FQC 的合格待入库量 ${available} PCS。`; if (!form.bin) next.bin = '请选择库存库位。'; if (!form.productionDate) next.date = '请选择生产日期。'; if (traceMode === 'BATCH' && !/^[A-Za-z0-9._-]{1,64}$/.test(form.traceValue.trim())) next.trace = '批次号需为 1—64 位字母、数字、点、短横线或下划线。'; if (traceMode === 'SERIAL') { const serials = parseSerials(form.traceValue); const existing = new Set(state.completions.filter(item => item.traceMode === 'SERIAL').flatMap(item => parseSerials(item.traceValue))); if (serials.length !== qty) next.trace = `当前识别 ${serials.length} 个序列号，必须与入库量 ${qty} 一致。`; else if (new Set(serials).size !== serials.length) next.trace = '序列号清单存在重复，请去重后再提交。'; else if (serials.some(item => existing.has(item))) next.trace = '序列号已在历史完工记录中使用，请核对扫描结果。'; } setErrors(next); return Object.keys(next).length === 0; };
  const submit = () => { if (!quality || !order) return; const id = makeId('CMP'); const completion: Completion = { id, factory, order: order.id, inspection: quality.id, qty, warehouseResource: form.warehouseResource, inventoryWarehouse: mapping.inventoryWarehouse, bin: form.bin, traceMode, traceValue: form.traceValue.trim(), status: 'POSTING', stockTx: '等待库存确认', time: '刚刚', allocation: allocation.filter(item => item.orderLine !== '普通成品库存').map(item => ({ orderLine: item.orderLine, qty: item.qty })) }; const task: ProductionTask = { id: makeId('TASK'), factory, type: '完工入库', object: id, step: '等待库存确认或明确拒绝', status: 'WAITING_CONFIRM', retry: 0, owner: '仓库接口责任组', trace: makeId('tr'), evidence: `请求 ${mapping.inventoryWarehouse}/${form.bin}，幂等业务对象 ${id}；尚未增加库存和销售可履约量。` }; setState(prev => ({ ...prev, completions: [completion, ...prev.completions], tasks: [task, ...prev.tasks] })); setModal(null); notify(`${id} 已提交库存，当前为 POSTING；请到任务中心模拟确认或拒绝`, 'warning'); };
  const completions = state.completions.filter(item => item.factory === factory);
  const blockers = [...completions.filter(item => item.status !== 'POSTED').map(item => `${item.id} · ${item.status} · ${item.stockTx}`), ...state.quality.filter(item => item.factory === factory && ['INSPECTING', 'DISPOSITION_PENDING'].includes(item.status)).map(item => `${item.id} · ${item.status} · 质量任务未关闭`)];
  const selected = state.completions.find(item => item.id === selectedCompletion);
  return <><PageHeading eyebrow="质量、库存与结案" title="完工入库与结案" description="生产创建成品入库申请，库存完成仓库、库位和追溯校验；只有取得唯一库存流水后，才累计完工、回写销售并允许结案。" actions={<Button tone="secondary" icon={ClipboardCheck} onClick={() => setModal('close')}>执行结案检查</Button>} /><div className="grid gap-5 2xl:grid-cols-[1fr_430px]"><section className="min-w-0 border border-slate-200 bg-white"><div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4"><div><h3 className="font-black text-slate-900">完工入库记录</h3><p className="mt-1 text-[11px] text-slate-500">POSTING 和 FAILED 优先处理，库存流水为空时不算成功</p></div><Status tone="blue">一工单多次入库</Status></div><div className="overflow-x-auto"><table className="prod-table"><thead><tr><th>完工记录</th><th>工单 / FQC</th><th>数量</th><th>平台仓 → 库存仓 / 库位</th><th>批次 / 序列号</th><th>状态</th><th>库存流水 / 动作</th></tr></thead><tbody>{completions.map(item => <tr key={item.id}><td><div className="font-black text-slate-900">{item.id}</div><div className="text-[10px] text-slate-400">{item.time}</div></td><td>{item.order}<div className="text-[10px] text-slate-500">{item.inspection}</div></td><td className="font-black text-slate-900">{item.qty} PCS</td><td>{warehouseMappings[item.warehouseResource as keyof typeof warehouseMappings]?.label || item.warehouseResource} → {item.inventoryWarehouse}<div className="text-[10px] text-slate-500">{item.bin.replace('BIN-', '')}</div></td><td className="max-w-48 truncate" title={item.traceValue}>{item.traceMode} · {item.traceValue}</td><td><Status tone={statusTone(item.status)}>{item.status === 'POSTED' ? <CheckCircle2 size={12} /> : item.status === 'POSTING' ? <CircleDashed size={12} /> : <AlertTriangle size={12} />}{item.status}</Status></td><td><div className="max-w-52 truncate text-[11px]" title={item.stockTx}>{item.stockTx}</div><button onClick={() => { setSelectedCompletion(item.id); setModal('allocation'); }} className="mt-1 font-bold text-blue-700">查看分配</button></td></tr>)}</tbody></table></div></section><section className="border border-slate-300 bg-slate-50"><div className="border-b border-slate-300 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-700">新建申请</div><h3 className="mt-1 text-[17px] font-black text-slate-950">成品完工入库</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">提交后进入 POSTING，库存确认前不会显示成功。</p></div>{eligible.length ? <><div className="grid gap-4 p-5 sm:grid-cols-2 2xl:grid-cols-2"><div className="sm:col-span-2"><Field label="已通过 FQC 的工单" required><select value={form.inspection} onChange={event => setInspection(event.target.value)} className="prod-input w-full">{eligible.map(item => <option key={item.id} value={item.id}>{item.order} · {item.id} · 合格 {item.pending}</option>)}</select></Field></div><Field label="合格待入库量"><input readOnly className="prod-input w-full bg-slate-100 font-black" value={`${available} PCS`} /></Field><Field label="本次入库量" required error={errors.qty}><input type="number" min="1" step="1" value={form.qty} onChange={event => { setForm(prev => ({ ...prev, qty: event.target.value })); setErrors(prev => ({ ...prev, qty: undefined })); }} aria-invalid={Boolean(errors.qty)} className={`prod-input w-full ${errors.qty ? 'border-rose-500' : ''}`} /></Field>
<Field label="平台成品仓" required hint="仅显示平台中已启用且属于当前授权工厂的成品仓"><select value={form.warehouseResource} onChange={event => setWarehouse(event.target.value as keyof typeof warehouseMappings)} className="prod-input w-full" disabled={!warehouses.length}>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}</select></Field>
<Field label="库存仓库" required hint="由平台仓库映射，只读"><input readOnly className="prod-input w-full bg-slate-100" value={mapping.inventoryWarehouse} /></Field><Field label="库存库位" required error={errors.bin}><select value={form.bin} onChange={event => setForm(prev => ({ ...prev, bin: event.target.value }))} className="prod-input w-full">{mapping.bins.map(bin => <option key={bin.id} value={bin.id}>{bin.label} · {bin.state}</option>)}</select></Field><Field label="追溯方式" hint="由产品追溯策略决定"><input readOnly className="prod-input w-full bg-slate-100 font-black" value={traceMode === 'BATCH' ? '批次追溯 · BATCH' : '序列号追溯 · SERIAL'} /></Field><div className="sm:col-span-2"><Field label={traceMode === 'BATCH' ? '批次号' : '序列号清单'} required error={errors.trace} hint={traceMode === 'SERIAL' ? '支持换行、空格或逗号分隔；数量必须与本次入库量一致' : undefined}><div className="relative"><ScanLine size={15} className="absolute left-3 top-3 text-slate-400" />{traceMode === 'BATCH' ? <input value={form.traceValue} onChange={event => { setForm(prev => ({ ...prev, traceValue: event.target.value })); setErrors(prev => ({ ...prev, trace: undefined })); }} className={`prod-input w-full pl-9 ${errors.trace ? 'border-rose-500' : ''}`} placeholder="输入或扫描批次号" /> : <textarea value={form.traceValue} onChange={event => { setForm(prev => ({ ...prev, traceValue: event.target.value })); setErrors(prev => ({ ...prev, trace: undefined })); }} className={`prod-input min-h-24 w-full pl-9 ${errors.trace ? 'border-rose-500' : ''}`} placeholder="例如：SN2607230001 SN2607230002" />}</div></Field></div><Field label="生产日期" required error={errors.date}><input type="date" value={form.productionDate} onChange={event => setForm(prev => ({ ...prev, productionDate: event.target.value }))} className="prod-input w-full" /></Field><Field label="销售分配预览"><div className="min-h-10 border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] leading-5 text-blue-900">订单优先 {Math.min(qty || 0, 32)}，普通库存 {Math.max(0, (qty || 0) - 32)}</div></Field><div className="sm:col-span-2"><Field label="备注"><textarea rows={2} value={form.remark} onChange={event => setForm(prev => ({ ...prev, remark: event.target.value }))} className="prod-input w-full resize-none" maxLength={200} placeholder="可填写本批次说明" /></Field></div></div><div className="border-t border-slate-300 bg-white p-4"><Button className="w-full" icon={PackageCheck} disabled={!canWrite || available <= 0} onClick={() => { if (validate()) setModal('confirm'); }}>预览并提交入库申请</Button></div></> : <div className="p-5"><EmptyState title="没有可入库的 FQC 合格记录" description="先在质量管理完成 FQC；未判定、失败或处置未关闭的数量不能完工入库。" /></div>}</section></div><Modal open={modal === 'confirm'} onClose={() => setModal(null)} eyebrow="敏感操作确认" title="提交成品入库申请" description="确认后仅创建库存处理请求，必须等待库存确认。" footer={<><Button tone="secondary" onClick={() => setModal(null)}>继续检查</Button><Button onClick={submit}>提交库存处理</Button></>}><div className="space-y-3 text-[12px]"><div className="flex justify-between border-b border-slate-100 pb-3"><span className="text-slate-500">工单 / FQC</span><b>{order?.id} / {quality?.id}</b></div><div className="flex justify-between border-b border-slate-100 pb-3"><span className="text-slate-500">目标仓位</span><b>{mapping.label} → {mapping.inventoryWarehouse} / {form.bin.replace('BIN-', '')}</b></div><div className="flex justify-between border-b border-slate-100 pb-3"><span className="text-slate-500">追溯信息</span><b className="max-w-64 truncate" title={form.traceValue}>{traceMode} · {traceMode === 'SERIAL' ? `${parseSerials(form.traceValue).length} 个序列号` : form.traceValue}</b></div><div className="border border-amber-200 bg-amber-50 p-3 leading-5 text-amber-900">本次 {qty} PCS；提交后状态为 POSTING。任务中心明确确认后才生成唯一库存流水、累计完工并释放销售可履约量。</div></div></Modal><Modal open={modal === 'allocation'} onClose={() => setModal(null)} eyebrow="确定性分配" title={`${selected?.id || ''} 销售分配`} footer={<Button onClick={() => setModal(null)}>关闭分配详情</Button>}><div className="space-y-3">{selected?.allocation.length ? selected.allocation.map(item => <div key={item.orderLine} className="flex justify-between border border-slate-200 p-3 text-[12px]"><span>{item.orderLine}</span><b>{item.qty} PCS</b></div>) : <div className="border border-slate-200 p-4 text-[12px] text-slate-500">尚未确认入库或无强 Pegging 分配；不会提前唤醒销售。</div>}<div className="border border-blue-200 bg-blue-50 p-3 text-[11px] leading-5 text-blue-900">顺序：强 Pegging → 客户锁定 → 交期 → 优先级 → 确认时间 → 订单行 ID；重复执行结果一致。</div></div></Modal><Modal open={modal === 'close'} onClose={() => setModal(null)} eyebrow="结案完整性检查" title={blockers.length ? '当前不可结案' : '结案检查通过'} footer={<><Button tone="secondary" onClick={() => setModal(null)}>关闭检查结果</Button>{!blockers.length && <Button disabled={!canWrite} onClick={() => { setModal(null); notify('结案已提交不同账号复核；制单人不能复核本人申请'); }}>提交第二人复核</Button>}</>}>{blockers.length ? <div className="space-y-2">{blockers.map(item => <div key={item} className="flex items-start gap-2 border border-rose-200 bg-rose-50 p-3 text-[11px] leading-5 text-rose-900"><CircleAlert size={15} className="mt-0.5 shrink-0" />{item}</div>)}</div> : <div className="border border-emerald-200 bg-emerald-50 p-4 text-[12px] leading-6 text-emerald-900">质量、投退料与库存入账任务均已关闭，可以提交不同账号完成结案复核。</div>}</Modal></>;
}

function TasksPage({ state, setState, factory, notify }: PageProps) {
  const [evidence, setEvidence] = useState<ProductionTask | null>(null);
  const tasks = state.tasks.filter(item => item.factory === factory);
  const confirmInventory = (task: ProductionTask, accepted: boolean) => { const completion = state.completions.find(item => item.id === task.object); if (!completion) return; setState(prev => ({ ...prev, tasks: prev.tasks.map(item => item.id === task.id ? { ...item, status: accepted ? 'SUCCEEDED' : 'FAILED', step: accepted ? '库存已确认过账' : '库存明确拒绝', evidence: accepted ? `库存返回唯一流水，成品库存增加 ${completion.qty} PCS；销售按 Pegging 释放。` : '演示拒绝：库位或追溯校验未通过；未增加任何业务数量。' } : item), completions: prev.completions.map(item => item.id === completion.id ? { ...item, status: accepted ? 'POSTED' : 'FAILED', stockTx: accepted ? `STK-IN-${Date.now().toString().slice(-10)}` : '库存拒绝：演示校验失败' } : item), orders: accepted ? prev.orders.map(item => item.id === completion.order ? { ...item, posted: Math.min(item.qty, item.posted + completion.qty) } : item) : prev.orders })); notify(accepted ? `${completion.id} 已取得唯一库存流水，完工和销售分配已更新` : `${completion.id} 已被库存明确拒绝，业务数量保持不变`, accepted ? 'success' : 'warning'); };
  const retry = (task: ProductionTask) => { setState(prev => ({ ...prev, tasks: prev.tasks.map(item => item.id === task.id ? { ...item, status: 'WAITING_CONFIRM', step: '复用原幂等关系等待库存确认', retry: item.retry + 1, evidence: `${item.evidence} 已修复映射并复用原业务对象重试。` } : item), completions: prev.completions.map(item => item.id === task.object ? { ...item, status: 'POSTING', stockTx: '修复后等待库存确认' } : item) })); notify(`${task.id} 已复用原业务关系重试，不会新增完工记录`, 'warning'); };
  const finish = (task: ProductionTask) => { setState(prev => ({ ...prev, tasks: prev.tasks.map(item => item.id === task.id ? { ...item, status: 'SUCCEEDED', step: '任务处理完成', evidence: `${item.evidence} 演示任务已完成，结果快照与审计已保存。` } : item) })); notify(`${task.id} 已完成，可查看证据`); };
  return <><PageHeading eyebrow="可靠性与补偿" title="任务中心" description="跟踪 MRP、APS、库存与补偿任务；失败任务显示责任模块、修复动作、重试次数和 Trace ID，并复用原业务关系重试。" actions={<Button tone="secondary" icon={RefreshCw} onClick={() => notify('任务状态已刷新')}>刷新状态</Button>} />{tasks.length ? <TableShell><table className="prod-table"><thead><tr><th>任务号</th><th>类型 / 业务对象</th><th>当前步骤</th><th>状态</th><th>重试</th><th>责任人</th><th>Trace ID</th><th>动作</th></tr></thead><tbody>{tasks.map(row => <tr key={row.id}><td className="font-black text-slate-900">{row.id}</td><td>{row.type}<div className="text-[10px] text-slate-500">{row.object}</div></td><td>{row.step}</td><td><Status tone={statusTone(row.status)}>{['RUNNING', 'WAITING_CONFIRM'].includes(row.status) && <CircleDashed size={12} />}{row.status}</Status></td><td>{row.retry}</td><td>{row.owner}</td><td className="font-mono text-[10px] text-slate-500">{row.trace}</td><td><div className="flex min-w-max flex-wrap gap-2">{row.type === '完工入库' && row.status === 'WAITING_CONFIRM' ? <><button onClick={() => confirmInventory(row, true)} className="font-bold text-emerald-700">模拟库存确认</button><button onClick={() => confirmInventory(row, false)} className="font-bold text-rose-700">模拟拒绝</button></> : row.type === '完工入库' && row.status === 'FAILED' ? <button onClick={() => retry(row)} className="font-bold text-blue-700">修复并重试</button> : row.status === 'RUNNING' || row.status === 'WAITING_CONFIRM' ? <button onClick={() => finish(row)} className="font-bold text-blue-700">模拟任务完成</button> : <button onClick={() => setEvidence(row)} className="font-bold text-slate-600">查看证据</button>}</div></td></tr>)}</tbody></table></TableShell> : <EmptyState title="当前工厂没有任务" description="长任务、库存等待和补偿任务将在这里统一追踪。" />}<div className="mt-4 flex items-start gap-3 border border-blue-200 bg-blue-50 p-4 text-[11px] leading-5 text-blue-900"><Info size={16} className="mt-0.5 shrink-0" /><p><b>原型说明：</b>“模拟确认/拒绝”是显式演示库存外部结果，用于验证状态联动；页面不会通过定时器伪装后端成功。</p></div><Modal open={Boolean(evidence)} onClose={() => setEvidence(null)} eyebrow="任务证据" title={evidence?.id || ''} footer={<Button onClick={() => setEvidence(null)}>关闭证据</Button>}><dl className="space-y-3 text-[12px]"><div className="flex justify-between border-b border-slate-100 pb-3"><dt className="text-slate-500">业务对象</dt><dd className="font-bold">{evidence?.object}</dd></div><div className="flex justify-between border-b border-slate-100 pb-3"><dt className="text-slate-500">Trace ID</dt><dd className="font-mono text-[11px]">{evidence?.trace}</dd></div><div><dt className="text-slate-500">处理证据</dt><dd className="mt-2 border border-slate-200 bg-slate-50 p-3 leading-6 text-slate-800">{evidence?.evidence}</dd></div></dl></Modal></>;
}

const pagePermissionCodes: Record<ProductionPage, string> = {
  dashboard: 'production.view',
  master: 'production.master.manage',
  calendar: 'production.master.manage',
  demand: 'production.demand.manage',
  plan: 'production.plan.manage',
  aps: 'production.aps.manage',
  kitting: 'production.kitting.manage',
  orders: 'production.execution.manage',
  report: 'production.execution.manage',
  quality: 'production.quality.manage',
  completion: 'production.completion.manage',
  tasks: 'production.tasks.view',
};

type ProductionManagementProps = {
  businessFlow?: { orderId?: string; currentStep?: string };
  onBusinessFlowAction?: (...args: unknown[]) => void;
  currentUser?: { name?: string; role?: string; account?: string };
  currentTenant?: { id?: string; code?: string; name?: string };
  activeRole?: string;
  platformState: PlatformState;
};

export default function ProductionManagementV2({ currentUser, currentTenant, activeRole, platformState }: ProductionManagementProps) {
  const role = activeRole || currentUser?.role || '';
  const actor = { ...currentUser, role };
  const capabilityEnabled = isPlatformCapabilityEnabled(platformState, 'production');
  const actorEnabled = isPlatformActorEnabled(platformState, actor);
  const canViewProduction = hasPlatformPermission(platformState, actor, role, 'production.view');
  const authorizedFactoryCodes = getAuthorizedFactoryCodes(platformState, actor, role);
  const factory = authorizedFactoryCodes.find((code): code is FactoryId => code === 'FAC-SH-01' || code === 'FAC-SZ-01');
  const tenantId = currentTenant?.id || platformState.tenant.id;
  const safeFactory: FactoryId = factory || 'FAC-SH-01';
  const canViewTasks = hasPlatformPermission(platformState, actor, role, 'production.tasks.view');
  const initialPage = (): ProductionPage => { if (typeof window === 'undefined') return 'dashboard'; const page = new URLSearchParams(window.location.search).get('production') as ProductionPage | null; return page && validPages.has(page) && (page !== 'tasks' || canViewTasks) ? page : 'dashboard'; };
  const [activePage, setActivePage] = useState<ProductionPage>(initialPage);
  const [state, setState] = useState<PrototypeState>(() => factory ? loadTenantProductionState(tenantId, factory) : createTenantProductionState(safeFactory));
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const skipNextPersistence = useRef(true);
  const canWrite = activePage === 'dashboard'
    ? Object.values(pagePermissionCodes).filter((code) => code.endsWith('.manage')).some((code) => hasPlatformPermission(platformState, actor, role, code))
    : hasPlatformPermission(platformState, actor, role, pagePermissionCodes[activePage]);

  const factoryOrg = platformState.orgUnits.find((item) => item.type === 'factory' && item.code === factory);
  const enabledFactoryResources = useMemo(() => platformState.resources.filter((item) => item.status === 'enabled' && item.factoryOrgId === factoryOrg?.id), [platformState.resources, factoryOrg?.id]);
  const workCenters = useMemo<ProductionResource[]>(() => enabledFactoryResources.filter((item) => item.type === 'work_center').map(({ id, code, name }) => ({ id, code, name })), [enabledFactoryResources]);
  const warehouses = useMemo<ProductionWarehouse[]>(() => enabledFactoryResources.filter((item) => item.type === 'warehouse' && item.specification.includes('成品') && item.id in warehouseMappings).map((item) => ({ id: item.id as keyof typeof warehouseMappings, code: item.code, name: item.name })), [enabledFactoryResources]);
  const employees = useMemo<ProductionEmployee[]>(() => {
    const resourceIds = new Set(enabledFactoryResources.map((item) => item.id));
    return platformState.employees.filter((employee) => {
      if (employee.status !== 'active') return false;
      const position = platformState.positions.find((item) => item.id === employee.primaryPositionId && item.status === 'enabled');
      return Boolean(position?.resourceIds.some((resourceId) => resourceIds.has(resourceId)));
    }).map((employee) => {
      const org = platformState.orgUnits.find((item) => item.id === employee.primaryOrgId);
      const position = platformState.positions.find((item) => item.id === employee.primaryPositionId);
      return { name: employee.name, no: employee.employeeNo, dept: org?.name || '未配置组织', role: position?.name || '未配置岗位', mobile: employee.mobile.replace(/\D/g, '').slice(-4), skill: position?.code || '岗位资格', valid: '由平台岗位控制', state: '有效' };
    });
  }, [platformState.employees, platformState.positions, platformState.orgUnits, enabledFactoryResources]);

  const notify = useCallback<Notify>((message, type = 'success') => { if (toastTimer.current) window.clearTimeout(toastTimer.current); setToast({ message, type }); toastTimer.current = window.setTimeout(() => setToast(null), 3600); }, []);
  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);
  useEffect(() => { if (factory) { skipNextPersistence.current = true; setState(loadTenantProductionState(tenantId, factory)); } }, [tenantId, factory]);
  useEffect(() => { if (!factory) return; if (skipNextPersistence.current) { skipNextPersistence.current = false; return; } saveTenantProductionState(tenantId, state); }, [tenantId, factory, state]);
  useEffect(() => { const pop = () => setActivePage(initialPage()); window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  useEffect(() => {
    if (canViewTasks) return;
    const url = new URL(window.location.href);
    if (activePage !== 'tasks' && url.searchParams.get('production') !== 'tasks') return;
    setActivePage('dashboard');
    url.searchParams.set('production', 'dashboard');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [activePage, canViewTasks]);

  const navigate = (page: ProductionPage) => { if (!validPages.has(page) || (page === 'tasks' && !canViewTasks)) return; setActivePage(page); const url = new URL(window.location.href); url.searchParams.set('production', page); window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`); };
  const activeModule = productionModules.find(item => item.pages.includes(activePage));
  const pageLabel = productionPages.find(item => item.key === activePage)?.label || '生产管理驾驶舱';
  const secondaryNavigation = activeModule?.key === 'master'
    ? [{ key: 'master' as ProductionPage, label: 'BOM 与工艺' }, { key: 'calendar' as ProductionPage, label: '日历、班次与技能' }]
    : activeModule?.key === 'execution'
      ? [{ key: 'orders' as ProductionPage, label: '工单列表' }, { key: 'report' as ProductionPage, label: '报工录入' }]
      : [];
  const pageProps: PageProps = { state, setState, factory: safeFactory, canWrite, notify, navigate, employees, workCenters, warehouses };

  const accessBlocker = !capabilityEnabled
    ? '平台管理已关闭生产管理应用。'
    : !actorEnabled
      ? '当前平台账号或关联员工已停用。'
      : !canViewProduction
        ? '当前角色没有生产管理查看权限。'
        : !factory
          ? '当前角色没有已启用工厂的数据范围。'
          : '';

  if (accessBlocker) return <div className="flex h-full min-h-0 items-center justify-center bg-[#F5F7FA] p-6"><section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700"><Lock size={22} /></div><h1 className="mt-5 text-[19px] font-black text-slate-900">生产管理暂不可用</h1><p className="mt-2 text-[13px] leading-6 text-slate-600">{accessBlocker}</p><p className="mt-4 text-[11px] leading-5 text-slate-400">入口、页面和数据接口使用同一平台运行态校验，无法通过直接地址绕过。</p></section></div>;

  return <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#F5F7FA] text-slate-800 selection:bg-blue-100">
    <a href="#production-main" className="prod-skip-link">跳到生产内容</a>
    {toast && <div role="status" aria-live="polite" className={`fixed right-4 top-4 z-[250] max-w-md rounded-xl border px-4 py-3 shadow-xl sm:right-6 sm:top-6 ${toast.type === 'warning' ? 'border-amber-300 bg-amber-50 text-amber-950' : toast.type === 'error' ? 'border-rose-300 bg-rose-50 text-rose-950' : 'border-emerald-300 bg-emerald-50 text-emerald-950'}`}><div className="flex items-start gap-2 text-[12px] font-bold leading-5">{toast.type === 'warning' || toast.type === 'error' ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}{toast.message}</div></div>}
    <main id="production-main" className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center">
            <div className="mr-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm"><Factory size={24} /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-[20px] font-bold leading-tight tracking-wide text-slate-800">生产管理</h1>{!canWrite && <Status tone="amber">只读</Status>}</div>
              <p className="mt-1 text-[13px] font-medium text-slate-500">{currentTenant?.name || '上海万申工业'} · {pageLabel}</p>
            </div>
          </div>
        </header>
        <nav aria-label="生产管理模块" className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="custom-scrollbar flex items-center gap-1 overflow-x-auto p-1.5">
            {productionModules.map(item => { const Icon = item.icon; const isActive = item.pages.includes(activePage); return <button key={item.key} onClick={() => navigate(item.defaultPage)} aria-current={isActive ? 'page' : undefined} title={item.label} className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-[12px] font-bold transition-all duration-200 ${isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-600'}`}><Icon size={14} />{item.label}</button>; })}
          </div>
        </nav>
        {secondaryNavigation.length > 0 && <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm" aria-label={`${activeModule?.label}页面`}><span className="px-2 text-[11px] font-bold text-slate-400">{activeModule?.label}</span>{secondaryNavigation.map(item => <button key={item.key} onClick={() => navigate(item.key)} aria-current={activePage === item.key ? 'page' : undefined} className={`min-h-9 rounded-lg px-3.5 text-[12px] font-bold transition-colors ${activePage === item.key ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>{item.label}</button>)}</div>}
        <div>{activePage === 'dashboard' && <DashboardPage {...pageProps} />}{activePage === 'master' && <MasterPage {...pageProps} />}{activePage === 'calendar' && <CalendarPage {...pageProps} />}{activePage === 'demand' && <DemandPage {...pageProps} />}{activePage === 'plan' && <PlanPage {...pageProps} />}{activePage === 'aps' && <ApsPage {...pageProps} />}{activePage === 'kitting' && <KittingPage {...pageProps} />}{activePage === 'orders' && <OrdersPage {...pageProps} />}{activePage === 'report' && <ReportPage {...pageProps} />}{activePage === 'quality' && <QualityPage {...pageProps} />}{activePage === 'completion' && <CompletionPage {...pageProps} />}{activePage === 'tasks' && canViewTasks && <TasksPage {...pageProps} />}</div>
      </div>
    </main>
  </div>;
}
