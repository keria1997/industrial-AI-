/**
 * 辅助模块页面集合
 *
 * 人员管理、产业链管理、AI智能中枢、AI数据分析、消息管理、平台管理、问题反馈。
 * 使用统一的 PageHeader + TabNav + DataTable 模式。
 */

import { useState } from 'react';
import { Users, Network, Sparkles, BrainCircuit, MessageSquare, Building, MessageCircle } from 'lucide-react';
import { TabNav } from '../../components/TabNav';
import { DataTable, type Column } from '../../components/DataTable';
import { Badge } from '../../components/Badge';
import { PageHeader } from '../../components/PageHeader';
import { ModuleHeader } from '../../components/ModuleHeader';

/* ---- 简易占位组件 ---- */
function Placeholder({ text }: { text: string }) {
  return <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-[13px]">{text}</div>;
}

/* ---- 人员管理 ---- */
const PERSONNEL_TABS = [
  { id: 'employees', label: '员工列表' },
  { id: 'org', label: '组织架构' },
];
interface Employee { code: string; name: string; dept: string; position: string; phone: string; status: string; }
const SAMPLE_EMPLOYEES: Employee[] = [
  { code: 'EMP-001', name: '张三', dept: '销售部', position: '销售主管', phone: '13800138001', status: '在职' },
  { code: 'EMP-002', name: '李四', dept: '生产部', position: '计划员', phone: '13800138002', status: '在职' },
  { code: 'EMP-003', name: '王五', dept: '采购部', position: '采购经理', phone: '13800138003', status: '在职' },
  { code: 'EMP-004', name: '赵六', dept: '仓库', position: '仓管员', phone: '13800138004', status: '在职' },
  { code: 'EMP-005', name: '孙七', dept: '财务部', position: '会计', phone: '13800138005', status: '在职' },
];

export function PersonnelPage() {
  const [tab, setTab] = useState('employees');
  const cols: Column<Employee>[] = [
    { key: 'code', label: '员工编码' },
    { key: 'name', label: '姓名' },
    { key: 'dept', label: '部门' },
    { key: 'position', label: '岗位' },
    { key: 'phone', label: '手机号' },
    { key: 'status', label: '状态', align: 'center', render: () => <Badge color="emerald">在职</Badge> },
  ];
  return (
    <div>
      <ModuleHeader icon={Users} title="人员管理" subtitle="员工 · 组织 · 岗位" theme="rose" />
      <TabNav tabs={PERSONNEL_TABS} active={tab} onChange={setTab} />
      {tab === 'employees' && <DataTable columns={cols} data={SAMPLE_EMPLOYEES} emptyText="暂无员工数据" />}
      {tab === 'org' && <Placeholder text="组织架构管理开发中" />}
    </div>
  );
}

/* ---- 产业链管理 ---- */
export function SupplyChainPage() {
  return (
    <div>
      <PageHeader title="产业链管理" subtitle="供应商与客户协同" />
      <Placeholder text="产业链管理模块按 PRD 7.9 开发中" />
    </div>
  );
}

/* ---- AI 智能中枢 ---- */
export function AiHubPage() {
  return (
    <div>
      <PageHeader title="AI智能中枢" subtitle="AI 数据导入、模型管理和工业助手" />
      <Placeholder text="AI 智能中枢模块按 PRD 7.10 开发中" />
    </div>
  );
}

/* ---- AI 数据分析 ---- */
export function AnalyticsPage() {
  return (
    <div>
      <PageHeader title="AI数据分析" subtitle="经营决策舱、归因分析" />
      <Placeholder text="AI 数据分析模块按 PRD 7.11 开发中" />
    </div>
  );
}

/* ---- 消息管理 ---- */
const MESSAGE_TABS = [
  { id: 'inbox', label: '收件箱' },
  { id: 'approval', label: '审批消息' },
  { id: 'system', label: '系统通知' },
  { id: 'archived', label: '已归档' },
];
interface Msg { id: string; title: string; source: string; time: string; read: boolean; type: string; }
const SAMPLE_MSGS: Msg[] = [
  { id: 'MSG-001', title: '销售订单 SO-2026-004 待确认', source: '销售管理', time: '5分钟前', read: false, type: '审批消息' },
  { id: 'MSG-002', title: '采购申请 PR-2026-001 待审批', source: '采购管理', time: '1小时前', read: false, type: '审批消息' },
  { id: 'MSG-003', title: '生产需求 DEM-002 已提交校验', source: '生产管理', time: '2小时前', read: true, type: '系统通知' },
];

export function MessagesPage() {
  const [tab, setTab] = useState('inbox');
  const cols: Column<Msg>[] = [
    { key: 'title', label: '消息标题', render: r => (
      <div className="flex items-center gap-2">
        {!r.read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
        <button className={`text-left hover:text-blue-600 ${r.read ? 'text-slate-500' : 'text-slate-800 font-medium'}`}>{r.title}</button>
      </div>
    )},
    { key: 'source', label: '来源模块' },
    { key: 'type', label: '类型', align: 'center', render: r => <Badge color={r.type === '审批消息' ? 'amber' : 'blue'}>{r.type}</Badge> },
    { key: 'time', label: '时间', align: 'right' },
  ];
  return (
    <div>
      <PageHeader title="消息管理" />
      <TabNav tabs={MESSAGE_TABS} active={tab} onChange={setTab} />
      {tab === 'inbox' && <DataTable columns={cols} data={SAMPLE_MSGS} emptyText="暂无消息" />}
      {tab !== 'inbox' && <Placeholder text={`${MESSAGE_TABS.find(t => t.id === tab)?.label}开发中`} />}
    </div>
  );
}

/* ---- 平台管理 ---- */
const PLATFORM_TABS = [
  { id: 'tenant', label: '租户信息' },
  { id: 'accounts', label: '员工账号' },
  { id: 'roles', label: '角色权限' },
  { id: 'resources', label: '资源目录' },
  { id: 'audit', label: '审计日志' },
];
interface AuditLog { id: string; operator: string; action: string; target: string; time: string; }
const SAMPLE_AUDITS: AuditLog[] = [
  { id: 'AUD-001', operator: 'admin', action: '登录', target: '系统', time: '2026-10-15 09:00:00' },
  { id: 'AUD-002', operator: '张三', action: '创建销售订单', target: 'SO-2026-001', time: '2026-10-15 09:30:00' },
  { id: 'AUD-003', operator: '李四', action: '审批生产需求', target: 'DEM-001', time: '2026-10-15 10:00:00' },
];

export function PlatformPage() {
  const [tab, setTab] = useState('tenant');
  const cols: Column<AuditLog>[] = [
    { key: 'id', label: '日志编号' },
    { key: 'operator', label: '操作者' },
    { key: 'action', label: '操作' },
    { key: 'target', label: '目标对象' },
    { key: 'time', label: '时间', align: 'right' },
  ];
  return (
    <div>
      <PageHeader title="平台管理" />
      <TabNav tabs={PLATFORM_TABS} active={tab} onChange={setTab} />
      {tab === 'audit' && <DataTable columns={cols} data={SAMPLE_AUDITS} emptyText="暂无审计日志" />}
      {tab !== 'audit' && <Placeholder text={`${PLATFORM_TABS.find(t => t.id === tab)?.label}开发中`} />}
    </div>
  );
}

/* ---- 问题反馈 ---- */
export function FeedbackPage() {
  return (
    <div>
      <PageHeader title="问题反馈" />
      <Placeholder text="问题反馈模块开发中" />
    </div>
  );
}
