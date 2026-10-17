import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  BadgeCheck,
  BookOpen,
  Box,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleOff,
  Clock3,
  Factory,
  FileClock,
  Filter,
  GitCompareArrows,
  KeyRound,
  ListChecks,
  LockKeyhole,
  MoreHorizontal,
  Network,
  PackageOpen,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  UserPlus,
  Users,
  Warehouse,
  Workflow,
  X,
} from 'lucide-react';
import {
  AuditRecord,
  PlatformState,
  loadPlatformState,
} from './platformSeed';
import EmployeeAccountManagement from './EmployeeAccountManagement';
import { PlatformAuditPanel } from './PlatformAuditPanel';
import { platformApi } from '../api/platform/client';
import { ApiError } from '../api/client';
import { persistPlatformChange } from './persistPlatformChange';
import { PLATFORM_STATE_CHANGED_EVENT } from './platformSeed';

type Props = {
  currentTenant?: { id?: string; code?: string; name?: string };
  currentUser?: { name?: string; account?: string; accessToken?: string };
  onToast?: (message: string, type?: string) => void;
};

type NavId = 'tenant' | 'org' | 'resource' | 'identity' | 'employee-accounts' | 'access' | 'adapter' | 'governance' | 'config' | 'audit' | 'init';
type FieldType = 'text' | 'select' | 'combobox' | 'date' | 'textarea';
type FormOption = { value: string; label: string; description?: string; searchText?: string };
type FormField = {
  key: string;
  label: string;
  type?: FieldType;
  typeFor?: (draft: Record<string, string>) => FieldType;
  placeholder?: string;
  required?: boolean;
  requiredWhen?: (draft: Record<string, string>) => boolean;
  disabled?: boolean;
  wide?: boolean;
  options?: FormOption[];
  optionsFor?: (draft: Record<string, string>) => FormOption[];
  visibleWhen?: (draft: Record<string, string>) => boolean;
  clearOnChange?: string[];
  normalize?: (value: string) => string;
  maxLength?: number;
  min?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  help?: string;
};
type ValidationError = { key: string; message: string };
type DrawerConfig = {
  title: string;
  description: string;
  submitLabel: string;
  fields: FormField[];
  initial: Record<string, string>;
  validate?: (draft: Record<string, string>) => ValidationError | null;
  onSubmit: (draft: Record<string, string>) => void | boolean | Promise<void | boolean>;
};
type ImpactConfig = {
  eyebrow?: string;
  title: string;
  description: string;
  impacts?: string[];
  blockers?: string[];
  confirmLabel: string;
  hideSecondary?: boolean;
  tone?: 'default' | 'danger';
  onConfirm: () => void | boolean | Promise<void | boolean>;
};

const NAV_GROUPS = [
  {
    label: '企业基础',
    icon: Building2,
    items: [
      { id: 'tenant' as NavId, label: '企业与应用', icon: Building2 },
      { id: 'org' as NavId, label: '组织与岗位', icon: Network },
      { id: 'resource' as NavId, label: '企业资源', icon: Factory },
    ],
  },
  {
    label: '人员与权限',
    icon: ShieldCheck,
    items: [
      { id: 'identity' as NavId, label: '员工与账号', icon: Users },
      { id: 'employee-accounts' as NavId, label: '登录账号管理', icon: KeyRound },
      { id: 'access' as NavId, label: '角色与权限', icon: ShieldCheck },
    ],
  },
  {
    label: '规则与治理',
    icon: SlidersHorizontal,
    items: [
      { id: 'adapter' as NavId, label: '权限适配', icon: GitCompareArrows },
      { id: 'governance' as NavId, label: '审批与待办', icon: Workflow },
      { id: 'config' as NavId, label: '字典与参数', icon: SlidersHorizontal },
      { id: 'audit' as NavId, label: '审计日志', icon: FileClock },
    ],
  },
];
const NAV_IDS: NavId[] = ['tenant', 'org', 'resource', 'identity', 'employee-accounts', 'access', 'adapter', 'governance', 'config', 'audit', 'init'];
const readPlatformViewFromUrl = (): NavId => {
  if (typeof window === 'undefined') return 'tenant';
  const value = new URLSearchParams(window.location.search).get('platform');
  return value && NAV_IDS.includes(value as NavId) ? value as NavId : 'tenant';
};

const orgTypeLabel: Record<string, string> = { company: '公司', department: '部门', factory: '工厂', workshop: '车间' };
const resourceTypeLabel: Record<string, string> = { line: '产线', warehouse: '仓库', work_center: '工作中心' };
const accountStatusLabel: Record<string, string> = { pending_activation: '待激活', enabled: '正常', locked: '已锁定', disabled: '已停用' };
const employeeStatusLabel: Record<string, string> = { active: '在职', transferring: '调岗中', leave: '休假', resigned: '已离职' };
const adapterStatusLabel: Record<string, string> = { draft: '待配置', pending_sync: '待同步', synced: '已同步', conflict: '需处理', failed: '同步失败', disabled: '已停用' };
const authTypeLabel: Record<string, string> = { password: '密码登录', sso: '统一身份登录', legacy_erp: '旧 ERP 账号' };
const legacyScopeLabel: Record<string, string> = { tenant_all: '当前企业全部数据', production_org: '生产组织', customer_org_tree: '客户所属组织树', supplier_org_tree: '供应商所属组织树', warehouse_set: '指定仓库集合' };
const parameterValueTypeLabel: Record<string, string> = { integer: '整数', boolean: '是 / 否', text: '文本' };
const enterpriseEditionOptions: FormOption[] = ['工业标准版', '工业专业版', '工业旗舰版'].map((label) => ({ value: label, label }));
const approvalDocumentsByModule: Record<string, string[]> = {
  销售管理: ['销售报价', '销售订单', '客户信用调整'],
  生产管理: ['生产计划', '生产工单', '异常报废'],
  库存管理: ['库存调整', '销售出库', '库存调拨'],
  采购管理: ['采购申请', '采购订单', '供应商准入'],
  财务管理: ['付款申请', '费用报销', '凭证审核'],
  平台管理: ['企业资料变更', '组织调整', '员工离职', '角色权限发布'],
};
const approvalModuleOptions: FormOption[] = Object.keys(approvalDocumentsByModule).map((label) => ({ value: label, label }));
const BUSINESS_CODE_PATTERN = /^[A-Z][A-Z0-9_-]{1,39}$/;
const LOGIN_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{2,31}$/;
const DICTIONARY_CODE_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
const PARAMETER_CODE_PATTERN = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/;
const LEGACY_SCOPE_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
const MOBILE_PATTERN = /^1[3-9]\d(?:\d{8}|\*{4}\d{4})$/;
const unsafeTextPattern = /[<>]/;

const validateDisplayName = (value: string, label: string, minimum = 2) => {
  if (value.length < minimum) return `${label}至少需要 ${minimum} 个字符。`;
  if (unsafeTextPattern.test(value)) return `${label}不能包含尖括号。`;
  return null;
};

const inferParameterValueType = (parameter?: PlatformState['parameters'][number]): 'integer' | 'boolean' | 'text' => {
  if (parameter?.valueType) return parameter.valueType;
  if (parameter && ['true', 'false'].includes(parameter.value)) return 'boolean';
  if (parameter && /^-?\d+$/.test(parameter.value)) return 'integer';
  return 'text';
};

const validateParameterValue = (code: string, valueType: string, value: string): string | null => {
  if (valueType === 'boolean') return ['true', 'false'].includes(value) ? null : '布尔参数只能选择“是”或“否”。';
  if (valueType === 'integer') {
    if (!/^-?\d+$/.test(value)) return '整数参数只能填写整数。';
    const numericValue = Number(value);
    if (!Number.isSafeInteger(numericValue)) return '参数值超出可用整数范围。';
    if (code === 'security.login.maxFailures' && (numericValue < 1 || numericValue > 20)) return '登录失败锁定次数必须在 1–20 之间。';
    if (code.endsWith('.hours') && (numericValue < 1 || numericValue > 720)) return '小时数必须在 1–720 之间。';
  }
  if (valueType === 'text' && value.length > 200) return '文本参数最多 200 个字符。';
  return null;
};

const migratePlatformState = (value: PlatformState): PlatformState => {
  const aliases: Record<string, string> = { 销售主管: 'ROLE-SALE', 采购组织负责人: 'ORG-SCM' };
  const resolveReference = (items: Array<{ id: string; code: string; name: string }>, reference: string) => aliases[reference] || items.find((item) => [item.id, item.code, item.name].includes(reference))?.id || reference;
  return {
    ...value,
    approvalRules: value.approvalRules.map((rule) => ({
      ...rule,
      resolverValue: rule.resolver === 'by_role' ? resolveReference(value.roles, rule.resolverValue) : rule.resolver === 'by_position' ? resolveReference(value.positions, rule.resolverValue) : resolveReference(value.orgUnits, rule.resolverValue),
    })),
    parameters: value.parameters.map((parameter) => ({ ...parameter, valueType: inferParameterValueType(parameter) })),
  };
};

const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;
const nowText = () => new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');

const toneFor = (value: string) => {
  if (['enabled', 'running', 'active', 'synced', 'success', '正常', '在职', '已同步'].includes(value)) return 'ok';
  if (['locked', 'disabled', 'resigned', 'failed', 'denied', 'conflict', '需处理', '同步失败'].includes(value)) return 'danger';
  if (['pending_activation', 'pending_sync', 'draft', 'transferring', 'leave', '待激活', '待同步', '待配置'].includes(value)) return 'warning';
  return 'neutral';
};

function StatusPill({ value, label }: { value: string; label?: string }) {
  const tone = toneFor(value);
  const styles = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    danger: 'border-rose-200 bg-rose-50 text-rose-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    neutral: 'border-slate-200 bg-slate-50 text-slate-600',
  }[tone];
  return <span className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold ${styles}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{label || value}</span>;
}

function Button({ children, icon: Icon, variant = 'secondary', onClick, disabled, type = 'button', testId, title }: any) {
  const styles: Record<string, string> = {
    primary: 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
    quiet: 'border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50',
  };
  return (
    <button data-testid={testId} type={type} title={title} onClick={onClick} disabled={disabled} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3.5 text-[12px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]}`}>
      {Icon && <Icon size={15} />}{children}
    </button>
  );
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="mb-2 text-[10px] font-black tracking-[0.16em] text-[#1e5fbf]">{eyebrow}</div>
        <h1 className="text-[24px] font-black tracking-[-0.03em] text-slate-950">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-slate-500">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

function Panel({ title, description, actions, children, className = '' }: { title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}>
      {(title || actions) && (
        <div className="flex min-h-16 items-center justify-between gap-4 border-b border-slate-100 px-5 py-3.5">
          <div>
            {title && <h2 className="text-[14px] font-black text-slate-900">{title}</h2>}
            {description && <p className="mt-1 text-[11px] leading-4 text-slate-500">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

function Segmented({ items, value, onChange }: { items: Array<{ value: string; label: string; count?: number }>; value: string; onChange: (value: string) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1" role="tablist">
      {items.map((item) => <button key={item.value} role="tab" aria-selected={value === item.value} tabIndex={value === item.value ? 0 : -1} onClick={() => onChange(item.value)} className={`min-h-11 rounded-md px-3 text-[11px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${value === item.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{item.label}{item.count !== undefined && <span className="ml-1.5 text-slate-400">{item.count}</span>}</button>)}
    </div>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange} style={{ backgroundColor: checked ? '#1e5fbf' : '#cbd5e1' }} className="relative h-6 w-11 rounded-full transition-colors"><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'left-6' : 'left-1'}`} /></button>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400"><PackageOpen size={19} /></div>
      <div className="text-[13px] font-black text-slate-800">{title}</div>
      <p className="mt-1.5 max-w-md text-[12px] leading-5 text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function SearchableSelect({ id, value, options, placeholder = '请选择', searchPlaceholder = '搜索名称或编码', disabled, invalid, onChange }: { id: string; value: string; options: FormOption[]; placeholder?: string; searchPlaceholder?: string; disabled?: boolean; invalid?: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);
  const normalized = searchText.trim().toLowerCase();
  const filtered = normalized ? options.filter((option) => `${option.label}${option.description || ''}${option.searchText || ''}`.toLowerCase().includes(normalized)) : options;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);
  useEffect(() => { setHighlightedIndex(0); }, [open, searchText]);

  return (
    <div ref={rootRef} className="relative">
      <button ref={buttonRef} id={id} type="button" disabled={disabled} aria-haspopup="listbox" aria-controls={`${id}-listbox`} aria-expanded={open} aria-invalid={invalid || undefined} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }} className={`flex min-h-11 w-full items-center gap-3 rounded-lg border bg-white px-3 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400 ${invalid ? 'border-rose-400' : 'border-slate-200 focus-visible:border-[#1e5fbf]'}`}>
        <span className="min-w-0 flex-1"><span className={`block truncate ${selected ? 'font-bold text-slate-800' : 'text-slate-400'}`}>{selected?.label || placeholder}</span>{selected?.description && <span className="mt-0.5 block truncate text-[10px] text-slate-400">{selected.description}</span>}</span>
        <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div id={`${id}-listbox`} className="absolute z-[190] mt-2 w-full min-w-[260px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]" role="listbox" aria-label={searchPlaceholder}>
        <div className="border-b border-slate-100 p-2"><div className="relative"><Search size={14} className="absolute left-3 top-3 text-slate-400" /><input ref={searchRef} value={searchText} onChange={(event) => setSearchText(event.target.value)} aria-controls={`${id}-listbox`} aria-activedescendant={filtered[highlightedIndex] ? `${id}-option-${highlightedIndex}` : undefined} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); requestAnimationFrame(() => buttonRef.current?.focus()); } else if (event.key === 'ArrowDown' && filtered.length) { event.preventDefault(); setHighlightedIndex((current) => (current + 1) % filtered.length); } else if (event.key === 'ArrowUp' && filtered.length) { event.preventDefault(); setHighlightedIndex((current) => (current - 1 + filtered.length) % filtered.length); } else if (event.key === 'Enter' && filtered[highlightedIndex]) { event.preventDefault(); onChange(filtered[highlightedIndex].value); setOpen(false); setSearchText(''); requestAnimationFrame(() => buttonRef.current?.focus()); } }} placeholder={searchPlaceholder} className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-[12px] outline-none focus:border-[#1e5fbf] focus:ring-2 focus:ring-blue-100" /></div></div>
        <div className="custom-scrollbar max-h-64 overflow-y-auto p-2">
          {value && <button type="button" role="option" aria-selected={false} onClick={() => { onChange(''); setOpen(false); setSearchText(''); }} className="mb-1 flex min-h-11 w-full items-center rounded-lg px-3 text-left text-[12px] font-bold text-slate-500 hover:bg-slate-50">清除当前选择</button>}
          {filtered.slice(0, 100).map((option, optionIndex) => <button id={`${id}-option-${optionIndex}`} key={option.value} type="button" role="option" aria-selected={option.value === value} onMouseEnter={() => setHighlightedIndex(optionIndex)} onClick={() => { onChange(option.value); setOpen(false); setSearchText(''); }} className={`mb-1 flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left last:mb-0 ${option.value === value ? 'bg-blue-50 text-blue-700' : highlightedIndex === optionIndex ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-50'}`}><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-black">{option.label}</span>{option.description && <span className="mt-1 block truncate text-[10px] text-slate-400">{option.description}</span>}</span>{option.value === value && <Check size={15} className="shrink-0" />}</button>)}
          {filtered.length === 0 && <div className="px-3 py-8 text-center"><div className="text-[12px] font-black text-slate-700">没有匹配结果</div><div className="mt-1 text-[11px] text-slate-400">请尝试姓名、编号、组织或岗位</div></div>}
        </div>
      </div>}
    </div>
  );
}

function EditorDrawer({ config, onClose }: { config: DrawerConfig | null; onClose: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<ValidationError | null>(null);
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => { setDraft(config?.initial || {}); setError(null); }, [config]);
  useEffect(() => {
    if (!config) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll(focusableSelector)) as HTMLElement[];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => {
      const firstField = panelRef.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button[aria-haspopup="listbox"]:not([disabled])');
      (firstField || panelRef.current?.querySelector<HTMLElement>('button:not([disabled])'))?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [config]);
  if (!config) return null;
  const submit = async () => {
    if (saving) return;
    const normalizedDraft = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, String(value ?? '').trim()]));
    const visibleFields = config.fields.filter((field) => !field.visibleWhen || field.visibleWhen(normalizedDraft));
    const missing = visibleFields.find((field) => (field.required || field.requiredWhen?.(normalizedDraft)) && !normalizedDraft[field.key]);
    if (missing) {
      setError({ key: missing.key, message: `请选择或填写${missing.label}` });
      requestAnimationFrame(() => document.getElementById(`editor-${missing.key}`)?.focus());
      return;
    }
    const validationError = config.validate?.(normalizedDraft);
    if (validationError) {
      setError(validationError);
      requestAnimationFrame(() => document.getElementById(`editor-${validationError.key}`)?.focus());
      return;
    }
    setSaving(true);
    try {
      if (await config.onSubmit(normalizedDraft) === false) return;
      onClose();
    } catch (reason) {
      setError({ key: '', message: reason instanceof Error ? reason.message : '保存失败，请重试' });
    } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[160] flex justify-end bg-slate-950/30" role="dialog" aria-modal="true" aria-label={config.title}>
      <button className="absolute inset-0 cursor-default" aria-label="关闭编辑面板" onClick={onClose} />
      <aside ref={panelRef} className="relative flex h-full w-full max-w-[540px] flex-col bg-[#fbfcfe] shadow-[-18px_0_50px_rgba(15,23,42,0.16)]">
        <div className="flex items-start justify-between border-b border-slate-200 bg-white px-6 py-5">
          <div className="pr-6"><h2 className="text-[18px] font-black text-slate-950">{config.title}</h2><p className="mt-1 text-[12px] leading-5 text-slate-500">{config.description}</p></div>
          <button onClick={onClose} aria-label="关闭" className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="custom-scrollbar flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {config.fields.filter((field) => !field.visibleWhen || field.visibleWhen(draft)).map((field) => {
              const fieldId = `editor-${field.key}`;
              const isRequired = Boolean(field.required || field.requiredWhen?.(draft));
              const fieldError = error?.key === field.key;
              const options = field.optionsFor?.(draft) || field.options || [];
              const fieldType = field.typeFor?.(draft) || field.type;
              const updateValue = (value: string) => {
                const normalizedValue = field.normalize ? field.normalize(value) : value;
                setDraft((previous) => {
                  const next = { ...previous, [field.key]: normalizedValue };
                  field.clearOnChange?.forEach((dependentKey) => { next[dependentKey] = ''; });
                  return next;
                });
                if (error) setError(null);
              };
              return (
              <div key={field.key} className={field.wide ? 'sm:col-span-2' : ''}>
                <label htmlFor={fieldId} className="mb-1.5 block text-[12px] font-extrabold text-slate-700">{field.label}{isRequired && <span className="ml-1 text-rose-500" aria-hidden="true">*</span>} {isRequired && <span className="sr-only">必填</span>}</label>
                {fieldType === 'select' ? (
                  <div className="relative"><select id={fieldId} value={draft[field.key] || ''} disabled={field.disabled} required={isRequired} aria-required={isRequired} aria-invalid={fieldError || undefined} aria-describedby={fieldError ? 'drawer-form-error' : field.help ? `${fieldId}-help` : undefined} onChange={(event) => updateValue(event.target.value)} className={`h-11 w-full appearance-none rounded-lg border bg-white px-3 pr-9 text-[13px] text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400 ${fieldError ? 'border-rose-400' : 'border-slate-200 focus:border-[#1e5fbf]'}`}><option value="">请选择</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-3.5 text-slate-400" /></div>
                ) : fieldType === 'combobox' ? (
                  <SearchableSelect id={fieldId} value={draft[field.key] || ''} options={options} disabled={field.disabled} invalid={fieldError} searchPlaceholder={field.placeholder || `搜索${field.label}`} onChange={updateValue} />
                ) : fieldType === 'textarea' ? (
                  <textarea id={fieldId} value={draft[field.key] || ''} disabled={field.disabled} required={isRequired} aria-required={isRequired} aria-invalid={fieldError || undefined} aria-describedby={fieldError ? 'drawer-form-error' : field.help ? `${fieldId}-help` : undefined} onChange={(event) => updateValue(event.target.value)} placeholder={field.placeholder} maxLength={field.maxLength || 500} className={`min-h-28 w-full resize-none rounded-lg border bg-white px-3 py-2.5 text-[13px] text-slate-800 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 ${fieldError ? 'border-rose-400' : 'border-slate-200 focus:border-[#1e5fbf]'}`} />
                ) : (
                  <input id={fieldId} type={fieldType === 'date' ? 'date' : 'text'} inputMode={field.inputMode} value={draft[field.key] || ''} disabled={field.disabled} required={isRequired} aria-required={isRequired} aria-invalid={fieldError || undefined} aria-describedby={fieldError ? 'drawer-form-error' : field.help ? `${fieldId}-help` : undefined} onChange={(event) => updateValue(event.target.value)} placeholder={field.placeholder} min={field.min} maxLength={field.maxLength || 120} className={`h-11 w-full rounded-lg border bg-white px-3 text-[13px] text-slate-800 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400 ${fieldError ? 'border-rose-400' : 'border-slate-200 focus:border-[#1e5fbf]'}`} />
                )}
                {field.help && <span id={`${fieldId}-help`} className="mt-1.5 block text-[11px] leading-4 text-slate-400">{field.help}</span>}
              </div>
            );})}
          </div>
          {error && <div id="drawer-form-error" role="alert" aria-live="assertive" className="mt-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] font-bold text-rose-700"><CircleAlert size={15} className="mt-0.5 shrink-0" />{error.message}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4"><Button disabled={saving} onClick={onClose}>暂不保存</Button><Button disabled={saving} variant="primary" onClick={submit} icon={Save}>{saving ? '保存中' : config.submitLabel}</Button></div>
      </aside>
    </div>
  );
}

function ImpactDialog({ config, onClose }: { config: ImpactConfig | null; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!config) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])')) as HTMLElement[];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus());
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocusRef.current?.focus(); };
  }, [config]);
  if (!config) return null;
  const danger = config.tone === 'danger';
  const blocked = Boolean(config.blockers?.length);
  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-label={config.title}>
      <button className="absolute inset-0 cursor-default" aria-label="关闭确认窗口" onClick={onClose} />
      <div ref={panelRef} className="relative flex max-h-[90vh] w-full max-w-[520px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="min-h-0 overflow-y-auto px-6 pb-5 pt-6">
          <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-full ${danger ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-[#1e5fbf]'}`}>{danger ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}</div>
          {config.eyebrow && <div className="mb-1.5 text-[10px] font-black tracking-[0.14em] text-slate-400">{config.eyebrow}</div>}
          <h2 className="text-[18px] font-black text-slate-950">{config.title}</h2>
          <p className="mt-2 text-[13px] leading-6 text-slate-600">{config.description}</p>
          {config.impacts?.length ? <div className="mt-5 border-y border-slate-100 py-2">{config.impacts.map((impact) => <div key={impact} className="flex gap-2.5 py-2 text-[12px] leading-5 text-slate-600"><span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${danger ? 'bg-rose-500' : 'bg-[#1e5fbf]'}`} />{impact}</div>)}</div> : null}
          {config.blockers?.length ? <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3"><div className="flex items-center gap-2 text-[12px] font-black text-rose-800"><CircleAlert size={15} />需要先处理以下阻断项</div><ul className="mt-2 space-y-1.5 pl-5 text-[11px] leading-5 text-rose-700">{config.blockers.map((blocker) => <li key={blocker} className="list-disc">{blocker}</li>)}</ul></div> : null}
        </div>
        <div className="flex justify-end gap-2 bg-slate-50 px-6 py-4">{!config.hideSecondary && <Button disabled={saving} onClick={onClose}>{blocked ? '返回处理' : '返回检查'}</Button>}<Button disabled={blocked || saving} title={blocked ? '请先处理阻断项' : undefined} variant={danger ? 'danger' : 'primary'} onClick={async () => {
          if (saving) return;
          setSaving(true);
          try { if (await config.onConfirm() !== false) onClose(); }
          finally { setSaving(false); }
        }}>{saving ? '处理中' : blocked ? '存在阻断项' : config.confirmLabel}</Button></div>
      </div>
    </div>
  );
}

export default function PlatformManagement({ currentTenant, currentUser, onToast }: Props) {
  const tenantIdentity = currentTenant || { id: 'TENANT-SHWS', code: 'SHWS', name: '上海万申工业集团' };
  const storageKey = `industrial-ai-platform-v2:${tenantIdentity.id || 'TENANT-SHWS'}`;
  const [activeView, setActiveView] = useState<NavId>(readPlatformViewFromUrl);
  const [state, setState] = useState<PlatformState>(() => {
    return migratePlatformState(loadPlatformState(tenantIdentity));
  });
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  const [impact, setImpact] = useState<ImpactConfig | null>(null);
  const [query, setQuery] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('ORG-ROOT');
  const [orgTab, setOrgTab] = useState('overview');
  const [resourceType, setResourceType] = useState('all');
  const [identityMode, setIdentityMode] = useState('employee');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('EMP-001');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [permissionDraft, setPermissionDraft] = useState<Record<string, 'allow' | 'deny' | 'unset'>>({});
  const [permissionLoaded, setPermissionLoaded] = useState(false);
  const [permissionSaving, setPermissionSaving] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [roleVersions, setRoleVersions] = useState<Record<string, number>>({});
  const [configMode, setConfigMode] = useState('dictionary');
  const [auditDetail, setAuditDetail] = useState<AuditRecord | null>(null);
  const [openNavGroup, setOpenNavGroup] = useState<string | null>(null);
  const [collapsedOrgIds, setCollapsedOrgIds] = useState<string[]>([]);
  const navRef = useRef<HTMLElement>(null);
  const auditPanelRef = useRef<HTMLElement>(null);
  const auditCloseRef = useRef<HTMLButtonElement>(null);
  const auditReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setState(migratePlatformState(loadPlatformState(tenantIdentity)));
    setSelectedOrgId('ORG-ROOT');
  }, [storageKey]);
  useEffect(() => {
    let active = true;
    setPermissionLoaded(false);
    setPermissionError('');
    if (!currentUser?.accessToken) {
      setPermissionError('请登录后管理角色权限');
      return;
    }
    const context = { tenantId: tenantIdentity.id, accessToken: currentUser.accessToken };
    platformApi.getSnapshot(context)
      .then(snapshot => {
        if (!active) return;
        setState(migratePlatformState(snapshot));
        setRoleVersions(Object.fromEntries(snapshot.roles.map(role => [role.id, role.version])));
        setPermissionLoaded(true);
      })
      .catch(error => {
        if (active) setPermissionError(error instanceof Error ? error.message : '角色权限加载失败');
      });
    return () => { active = false; };
  }, [storageKey, currentUser?.accessToken]);
  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpenNavGroup(null);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);
  useEffect(() => {
    const onPopState = () => {
      setActiveView(readPlatformViewFromUrl());
      setQuery('');
      setOpenNavGroup(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateToView = (view: NavId, replace = false) => {
    setActiveView(view);
    setQuery('');
    setOpenNavGroup(null);
    const url = new URL(window.location.href);
    url.searchParams.set('platform', view);
    window.history[replace ? 'replaceState' : 'pushState']({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  useEffect(() => {
    if (!auditDetail) return;
    auditReturnFocusRef.current = document.activeElement as HTMLElement | null;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setAuditDetail(null);
        return;
      }
      if (event.key !== 'Tab' || !auditPanelRef.current) return;
      const focusable = Array.from(auditPanelRef.current.querySelectorAll(focusableSelector)) as HTMLElement[];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => auditCloseRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      auditReturnFocusRef.current?.focus();
    };
  }, [auditDetail]);

  const toast = (message: string, type = 'success') => onToast?.(message, type);
  const mutationRunning = useRef(false);
  const identityRef = useRef('');
  identityRef.current = `${tenantIdentity.id}:${currentUser?.accessToken || ''}`;
  const reloadSnapshot = async () => {
    if (!currentUser?.accessToken) throw new Error('请登录后管理平台数据');
    const identity = identityRef.current;
    const snapshot = await platformApi.getSnapshot({ tenantId: tenantIdentity.id, accessToken: currentUser.accessToken });
    if (identity !== identityRef.current) return;
    setState(migratePlatformState(snapshot));
    setRoleVersions(Object.fromEntries(snapshot.roles.map(role => [role.id, role.version])));
    setPermissionLoaded(true); setPermissionError('');
    window.dispatchEvent(new CustomEvent(PLATFORM_STATE_CHANGED_EVENT, { detail: { tenantId: tenantIdentity.id } }));
  };
  const commit = async (updater: (previous: PlatformState) => PlatformState, message: string, action: string, target: string, type = 'success') => {
    if (mutationRunning.current) { toast('正在保存，请勿重复提交', 'error'); return false; }
    if (!permissionLoaded || !currentUser?.accessToken) { toast('平台数据未加载，请刷新后重试', 'error'); return false; }
    mutationRunning.current = true;
    const submittedIdentity = identityRef.current;
    let submitted = false;
    try {
      await persistPlatformChange({ tenantId: tenantIdentity.id, accessToken: currentUser.accessToken }, state, updater(state));
      submitted = true;
      if (identityRef.current !== submittedIdentity) return true;
      await reloadSnapshot();
      toast(message, type);
      return true;
    } catch (reason) {
      if (identityRef.current !== submittedIdentity) return submitted;
      if (submitted) {
        toast('操作已提交，刷新失败，请重新查询确认结果', 'warning');
        return true;
      }
      toast(reason instanceof Error ? reason.message : '保存失败，请重试', 'error');
      return false;
    } finally { mutationRunning.current = false; }
  };

  const orgById = useMemo(() => Object.fromEntries(state.orgUnits.map((item) => [item.id, item])), [state.orgUnits]);
  const employeeById = useMemo(() => Object.fromEntries(state.employees.map((item) => [item.id, item])), [state.employees]);
  const positionById = useMemo(() => Object.fromEntries(state.positions.map((item) => [item.id, item])), [state.positions]);
  const roleById = useMemo(() => Object.fromEntries(state.roles.map((item) => [item.id, item])), [state.roles]);
  const accountByEmployee = useMemo(() => Object.fromEntries(state.accounts.map((item) => [item.employeeId, item])), [state.accounts]);
  const orgOptions: FormOption[] = state.orgUnits.filter((item) => item.status === 'enabled').map((item) => ({ value: item.id, label: item.name, description: `${orgTypeLabel[item.type]} · ${item.code}`, searchText: `${item.name}${item.code}${orgTypeLabel[item.type]}` }));
  const employeeOptions: FormOption[] = state.employees.filter((item) => item.status === 'active').map((item) => ({ value: item.id, label: `${item.name} · ${item.employeeNo}`, description: `${orgById[item.primaryOrgId]?.name || '未归属组织'} · ${positionById[item.primaryPositionId]?.name || '未设置岗位'}`, searchText: `${item.name}${item.employeeNo}${item.mobile}${item.email}${orgById[item.primaryOrgId]?.name || ''}${positionById[item.primaryPositionId]?.name || ''}` }));
  const positionOptions: FormOption[] = state.positions.filter((item) => item.status === 'enabled').map((item) => ({ value: item.id, label: item.name, description: `${orgById[item.orgId]?.name || '-'} · ${item.code}`, searchText: `${item.name}${item.code}${orgById[item.orgId]?.name || ''}` }));
  const roleOptions: FormOption[] = state.roles.filter((item) => item.status === 'enabled').map((item) => ({ value: item.id, label: item.name, description: item.code, searchText: `${item.name}${item.code}${item.description}` }));
  const selectedOrg = orgById[selectedOrgId] || state.orgUnits[0];
  const selectedEmployee = employeeById[selectedEmployeeId] || state.employees[0];
  const selectedRole = roleById[selectedRoleId] || state.roles[0];
  const getDescendantOrgIds = (orgId: string) => {
    const found = new Set<string>();
    const visit = (parentId: string) => state.orgUnits.filter((item) => item.parentId === parentId).forEach((item) => { if (!found.has(item.id)) { found.add(item.id); visit(item.id); } });
    visit(orgId);
    return found;
  };
  const isSameOrAncestorOrg = (ancestorId: string, orgId: string) => {
    let current: string | null = orgId;
    while (current) {
      if (current === ancestorId) return true;
      current = orgById[current]?.parentId || null;
    }
    return false;
  };

  useEffect(() => {
    if (!state.roles.some(role => role.id === selectedRoleId)) setSelectedRoleId(state.roles[0]?.id || '');
  }, [state.roles, selectedRoleId]);

  useEffect(() => {
    const draft: Record<string, 'allow' | 'deny' | 'unset'> = {};
    state.permissions.forEach((permission) => {
      const grant = state.roleGrants.find((item) => item.roleId === selectedRoleId && item.permissionId === permission.id);
      draft[permission.id] = grant?.effect || 'unset';
    });
    setPermissionDraft(draft);
  }, [selectedRoleId, state.permissions, state.roleGrants]);

  const permissionDirty = useMemo(() => state.permissions.some((permission) => {
    const saved = state.roleGrants.find((item) => item.roleId === selectedRoleId && item.permissionId === permission.id)?.effect || 'unset';
    return permissionDraft[permission.id] !== undefined && permissionDraft[permission.id] !== saved;
  }), [permissionDraft, selectedRoleId, state.permissions, state.roleGrants]);

  const openTenantEditor = () => setDrawer({
    title: '编辑企业资料', description: '这些信息会用于业务单据抬头和平台通知。', submitLabel: '保存企业资料',
    fields: [
      { key: 'name', label: '企业名称', required: true, wide: true, maxLength: 100, help: '填写工商登记或正式使用的企业全称，2–100 个字符。' },
      { key: 'edition', label: '当前版本', type: 'select', required: true, options: enterpriseEditionOptions },
      { key: 'expireAt', label: '服务到期日', type: 'date', required: true, min: new Date().toLocaleDateString('sv-SE'), help: '到期日不能早于今天。' },
    ],
    initial: { name: state.tenant.name, edition: state.tenant.edition, expireAt: state.tenant.expireAt },
    validate: (draft) => {
      const nameError = validateDisplayName(draft.name, '企业名称');
      if (nameError) return { key: 'name', message: nameError };
      if (!enterpriseEditionOptions.some((option) => option.value === draft.edition)) return { key: 'edition', message: '请选择有效的平台版本。' };
      if (draft.expireAt < new Date().toLocaleDateString('sv-SE')) return { key: 'expireAt', message: '服务到期日不能早于今天。' };
      return null;
    },
    onSubmit: (draft) => commit((prev) => ({ ...prev, tenant: { ...prev.tenant, name: draft.name, edition: draft.edition, expireAt: draft.expireAt } }), '企业资料已保存', '编辑企业资料', draft.name),
  });

  const openAdminEditor = () => setDrawer({
    title: '更换企业管理员', description: '新管理员将获得当前企业的管理权限，原管理员保留普通账号。', submitLabel: '确认更换',
    fields: [{ key: 'accountId', label: '新管理员账号', type: 'combobox', required: true, wide: true, placeholder: '搜索姓名、员工编号或登录账号', options: state.accounts.filter((item) => item.status === 'enabled' && employeeById[item.employeeId]?.status === 'active').map((item) => ({ value: item.id, label: `${employeeById[item.employeeId]?.name || item.loginName} · ${item.loginName}`, description: `${employeeById[item.employeeId]?.employeeNo || '-'} · ${orgById[employeeById[item.employeeId]?.primaryOrgId]?.name || '未归属组织'}`, searchText: `${employeeById[item.employeeId]?.name || ''}${employeeById[item.employeeId]?.employeeNo || ''}${item.loginName}` })) }],
    initial: { accountId: state.tenant.formalAdminAccountId },
    onSubmit: (draft) => commit((prev) => ({ ...prev, tenant: { ...prev.tenant, formalAdminAccountId: draft.accountId } }), '企业管理员已更换', '更换企业管理员', draft.accountId),
  });

  const renderTenant = () => {
    const adminAccount = state.accounts.find((item) => item.id === state.tenant.formalAdminAccountId);
    const admin = adminAccount ? employeeById[adminAccount.employeeId] : null;
    return (
      <div data-testid="platform-view-tenant">
        <PageHeader eyebrow="企业基础" title="企业与应用" description="维护企业资料和业务应用。只有已启用的应用会出现在成员工作区。" actions={<Button icon={Pencil} onClick={openTenantEditor}>编辑企业资料</Button>} />
        <div className="platform-tenant-layout grid gap-5">
          <Panel title="企业资料" actions={<StatusPill value={state.tenant.status} label={state.tenant.status === 'running' ? '服务正常' : '需处理'} />}>
            <dl className="divide-y divide-slate-100 px-5">
              {[
                ['企业名称', state.tenant.name], ['企业编码', state.tenant.code], ['当前版本', state.tenant.edition], ['服务到期', state.tenant.expireAt], ['企业管理员', admin?.name || '尚未指定'], ['管理员账号', adminAccount?.loginName || '-'],
              ].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-5 py-3.5"><dt className="text-[12px] font-bold text-slate-400">{label}</dt><dd className="text-right text-[12px] font-extrabold text-slate-800">{value}</dd></div>)}
            </dl>
            <div className="border-t border-slate-100 p-4"><Button icon={UserCog} onClick={openAdminEditor}>更换企业管理员</Button></div>
          </Panel>
          <Panel title="业务应用" description="关闭应用前会先说明对成员和进行中业务的影响。">
            <div className="divide-y divide-slate-100">
              {state.capabilities.map((capability) => (
                <div key={capability.code} className="flex items-center gap-4 px-5 py-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${capability.enabled ? 'bg-blue-50 text-[#1e5fbf]' : 'bg-slate-100 text-slate-400'}`}><Box size={17} /></div>
                  <div className="min-w-0 flex-1"><div className="text-[13px] font-black text-slate-900">{capability.name}</div><div className="mt-1 text-[11px] text-slate-500">{capability.enabled ? '成员可按角色权限访问' : '已从成员工作区隐藏'}</div></div>
                  <StatusPill value={capability.enabled ? 'enabled' : 'disabled'} label={capability.enabled ? '已启用' : '已关闭'} />
                  <Toggle checked={capability.enabled} label={`${capability.enabled ? '关闭' : '启用'}${capability.name}`} onChange={() => {
                    if (capability.enabled) setImpact({ eyebrow: '影响确认', title: `关闭${capability.name}？`, description: '关闭后数据仍会保留，重新启用即可继续使用。', impacts: [`成员工作区将隐藏${capability.name}入口`, '相关接口、导出和 AI 操作会同步停止', '进行中的业务不会被删除，但无法继续处理'], confirmLabel: `关闭${capability.name}`, tone: 'danger', onConfirm: () => commit((prev) => ({ ...prev, capabilities: prev.capabilities.map((item) => item.code === capability.code ? { ...item, enabled: false } : item) }), `${capability.name}已关闭`, '关闭业务应用', capability.name) });
                    else commit((prev) => ({ ...prev, capabilities: prev.capabilities.map((item) => item.code === capability.code ? { ...item, enabled: true } : item) }), `${capability.name}已启用`, '启用业务应用', capability.name);
                  }} />
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    );
  };

  const renderOrgTree = (parentId: string | null, depth = 0): React.ReactNode => state.orgUnits.filter((item) => item.parentId === parentId).map((item) => {
    const children = state.orgUnits.filter((child) => child.parentId === item.id);
    const Icon = item.type === 'factory' ? Factory : item.type === 'workshop' ? Warehouse : item.type === 'department' ? Users : Building2;
    const collapsed = collapsedOrgIds.includes(item.id);
    return <React.Fragment key={item.id}><div className={`flex min-h-11 w-full items-center rounded-lg transition-colors ${selectedOrgId === item.id ? 'bg-[#eaf2ff] text-[#174f9f]' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`} style={{ paddingLeft: `${Math.max(2, depth * 14)}px` }}>
      {children.length ? <button type="button" aria-label={`${collapsed ? '展开' : '收起'}${item.name}`} aria-expanded={!collapsed} onClick={() => setCollapsedOrgIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} className="flex h-11 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><ChevronDown size={14} className={`transition-transform ${collapsed ? '-rotate-90' : ''}`} /></button> : <span className="w-9 shrink-0" />}
      <button type="button" onClick={() => { setSelectedOrgId(item.id); setOrgTab('overview'); }} className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 pr-2 text-left text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selectedOrgId === item.id ? 'font-black' : 'font-bold'}`}><Icon size={14} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{item.name}</span>{item.status === 'disabled' && <CircleOff size={12} className="text-slate-400" />}</button>
    </div>{!collapsed && renderOrgTree(item.id, depth + 1)}</React.Fragment>;
  });

  const openOrgEditor = (mode: 'add' | 'edit', parentId?: string) => {
    const editing = mode === 'edit' ? selectedOrg : null;
    const protectedIds = editing ? new Set([editing.id, ...getDescendantOrgIds(editing.id)]) : new Set<string>();
    const parentOptions = orgOptions.filter((option) => !protectedIds.has(option.value));
    setDrawer({
      title: editing ? '编辑组织' : '新增下级组织', description: editing ? '更新组织名称、负责人和上级组织。组织编码与类型创建后不可修改。' : '创建前请确认组织类型与上级组织的层级关系。', submitLabel: editing ? '保存修改' : '创建组织',
      fields: [
        { key: 'name', label: '组织名称', required: true, wide: true, maxLength: 60, help: '2–60 个字符，同一企业内应清晰可辨。' },
        { key: 'code', label: '组织编码', required: true, disabled: Boolean(editing), normalize: (value) => value.toUpperCase(), maxLength: 40, help: '自动转为大写；仅支持字母、数字、下划线和短横线，创建后不可修改。' },
        { key: 'type', label: '组织类型', type: 'select', required: true, disabled: Boolean(editing), options: Object.entries(orgTypeLabel).map(([value, label]) => ({ value, label })) },
        { key: 'parentId', label: '上级组织', type: 'combobox', required: true, wide: true, options: parentOptions, placeholder: '搜索组织名称或编码', visibleWhen: () => editing?.id !== 'ORG-ROOT' },
        { key: 'managerEmployeeId', label: '负责人（员工）', type: 'combobox', wide: true, options: employeeOptions, placeholder: '搜索姓名、员工编号、组织或岗位' },
      ],
      initial: editing ? { name: editing.name, code: editing.code, type: editing.type, parentId: editing.parentId || '', managerEmployeeId: editing.managerEmployeeId || '' } : { name: '', code: '', type: selectedOrg?.type === 'factory' ? 'workshop' : 'department', parentId: parentId || selectedOrgId, managerEmployeeId: '' },
      validate: (draft) => {
        const nameError = validateDisplayName(draft.name, '组织名称');
        if (nameError) return { key: 'name', message: nameError };
        if (!BUSINESS_CODE_PATTERN.test(draft.code)) return { key: 'code', message: '组织编码须以字母开头，仅使用大写字母、数字、下划线或短横线，共 2–40 位。' };
        if (state.orgUnits.some((item) => item.code.trim().toLowerCase() === draft.code.trim().toLowerCase() && item.id !== editing?.id)) return { key: 'code', message: '组织编码已存在，请使用唯一编码。' };
        if (editing?.id === 'ORG-ROOT') return null;
        const parent = orgById[draft.parentId];
        if (!parent) return { key: 'parentId', message: '请选择有效的上级组织。' };
        if (draft.type === 'company') return { key: 'type', message: '当前企业只能有一个公司根组织，请选择部门、工厂或车间。' };
        if (draft.type === 'workshop' && parent.type !== 'factory') return { key: 'parentId', message: '车间必须归属于工厂。' };
        if (draft.type === 'factory' && !['company', 'department'].includes(parent.type)) return { key: 'parentId', message: '工厂只能归属于公司或部门。' };
        if (draft.type === 'department' && !['company', 'department'].includes(parent.type)) return { key: 'parentId', message: '部门只能归属于公司或部门。' };
        return null;
      },
      onSubmit: async (draft) => {
        if (editing) return commit((prev) => ({ ...prev, orgUnits: prev.orgUnits.map((item) => item.id === editing.id ? { ...item, name: draft.name, code: draft.code, type: draft.type as any, parentId: editing.id === 'ORG-ROOT' ? null : draft.parentId, managerEmployeeId: draft.managerEmployeeId || null } : item) }), '组织信息已更新', '编辑组织', draft.name);
        else {
          const id = makeId('ORG');
          const saved = await commit((prev) => ({ ...prev, orgUnits: [...prev.orgUnits, { id, name: draft.name, code: draft.code, type: draft.type as any, parentId: draft.parentId, managerEmployeeId: draft.managerEmployeeId || null, status: 'enabled' }] }), '下级组织已创建', '创建组织', draft.name);
          if (saved === false) return false;
          setSelectedOrgId(id);
        }
      },
    });
  };

  const openPositionEditor = () => setDrawer({
    title: '新增岗位',
    description: `岗位将归属“${selectedOrg?.name}”，编码在企业内必须唯一。`,
    submitLabel: '创建岗位',
    fields: [
      { key: 'name', label: '岗位名称', required: true, maxLength: 60, help: '2–60 个字符，建议使用职责名称。' },
      { key: 'code', label: '岗位编码', required: true, normalize: (value) => value.toUpperCase(), maxLength: 40, help: '自动转为大写；仅支持字母、数字、下划线和短横线。' },
      { key: 'roleId', label: '默认角色', type: 'select', wide: true, options: roleOptions },
    ],
    initial: { name: '', code: '', roleId: '' },
    validate: (draft) => {
      const nameError = validateDisplayName(draft.name, '岗位名称');
      if (nameError) return { key: 'name', message: nameError };
      if (!BUSINESS_CODE_PATTERN.test(draft.code)) return { key: 'code', message: '岗位编码须以字母开头，仅使用大写字母、数字、下划线或短横线，共 2–40 位。' };
      if (state.positions.some((position) => position.code.toLowerCase() === draft.code.toLowerCase())) return { key: 'code', message: '岗位编码已存在，请使用唯一编码。' };
      return null;
    },
    onSubmit: (draft) => commit((prev) => ({ ...prev, positions: [...prev.positions, { id: makeId('POS'), name: draft.name, code: draft.code, orgId: selectedOrg.id, defaultRoleIds: draft.roleId ? [draft.roleId] : [], resourceIds: [], status: 'enabled' }] }), '岗位已创建', '创建岗位', draft.name),
  });

  const renderOrg = () => {
    const manager = selectedOrg ? employeeById[selectedOrg.managerEmployeeId || ''] : null;
    const children = state.orgUnits.filter((item) => item.parentId === selectedOrg?.id);
    const positions = state.positions.filter((item) => item.orgId === selectedOrg?.id);
    const employees = state.employees.filter((item) => item.primaryOrgId === selectedOrg?.id);
    const resources = state.resources.filter((item) => item.ownerOrgId === selectedOrg?.id);
    return (
      <div data-testid="platform-view-org">
        <PageHeader eyebrow="企业基础" title="组织与岗位" description="公司、部门、工厂和车间在这里维护；产线、仓库与工作中心作为企业资源单独管理。" actions={<Button variant="primary" icon={Plus} onClick={() => openOrgEditor('add')}>新增下级组织</Button>} />
        <div className="platform-org-layout grid min-h-[650px] gap-5">
          <Panel title="组织架构" actions={<span className="text-[11px] font-bold text-slate-400">{state.orgUnits.length} 个组织</span>}>
            <div className="border-b border-slate-100 p-3"><div className="relative"><Search size={14} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索组织" placeholder="搜索组织名称或编码" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-[12px] outline-none focus:border-[#1e5fbf]" /></div></div>
            <div className="custom-scrollbar max-h-[570px] overflow-y-auto p-2">{query ? state.orgUnits.filter((item) => `${item.name}${item.code}`.toLowerCase().includes(query.toLowerCase())).map((item) => <button key={item.id} onClick={() => setSelectedOrgId(item.id)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-[12px] font-bold text-slate-600 hover:bg-slate-50"><Network size={14} /><span className="flex-1 truncate">{item.name}</span><span className="text-[10px] text-slate-400">{orgTypeLabel[item.type]}</span></button>) : renderOrgTree(null)}</div>
          </Panel>
          <Panel className="min-w-0">
            <div className="border-b border-slate-100 px-5 pb-0 pt-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><h2 className="text-[19px] font-black text-slate-950">{selectedOrg?.name}</h2><StatusPill value={selectedOrg?.status || 'enabled'} label={selectedOrg?.status === 'enabled' ? '启用' : '已停用'} /></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-slate-400"><span>{orgTypeLabel[selectedOrg?.type]}</span><span>{selectedOrg?.code}</span><span>负责人：{manager?.name || '未设置'}</span></div></div><div className="flex gap-2"><Button icon={Pencil} onClick={() => openOrgEditor('edit')}>编辑组织</Button>{selectedOrg?.id === 'ORG-ROOT' ? <Button disabled title="根组织是企业权限与业务范围的基础，不可停用">根组织不可停用</Button> : <Button variant="danger" icon={MoreHorizontal} onClick={() => setImpact({ eyebrow: '停用前检查', title: `停用“${selectedOrg?.name}”？`, description: '系统会保留历史数据，但必须先处理所有在用关系。', impacts: [`${children.length} 个下级组织`, `${employees.length} 名在职员工`, `${positions.length} 个岗位`, `${resources.length} 项企业资源`], blockers: [...(children.length ? [`请先迁移或停用 ${children.length} 个下级组织`] : []), ...(employees.length ? [`请先调整 ${employees.length} 名员工的所属组织`] : []), ...(positions.length ? [`请先停用或迁移 ${positions.length} 个岗位`] : []), ...(resources.length ? [`请先迁移或停用 ${resources.length} 项企业资源`] : [])], confirmLabel: '停用组织', tone: 'danger', onConfirm: () => commit((prev) => ({ ...prev, orgUnits: prev.orgUnits.map((item) => item.id === selectedOrg?.id ? { ...item, status: 'disabled' } : item) }), '组织已停用', '停用组织', selectedOrg?.name || '') })}>停用组织</Button>}</div></div>
              <div className="mt-5 flex gap-1 overflow-x-auto" role="tablist" aria-label="组织详情">{[{ value: 'overview', label: '概况' }, { value: 'positions', label: '岗位与人员' }, { value: 'resources', label: '关联资源' }, { value: 'changes', label: '变更记录' }].map((tab) => <button key={tab.value} role="tab" aria-selected={orgTab === tab.value} tabIndex={orgTab === tab.value ? 0 : -1} onClick={() => setOrgTab(tab.value)} className={`min-h-11 shrink-0 border-b-2 px-3 text-[12px] font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${orgTab === tab.value ? 'border-[#1e5fbf] text-[#174f9f]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{tab.label}</button>)}</div>
            </div>
            {orgTab === 'overview' && <div className="grid gap-6 p-5 lg:grid-cols-2"><div><h3 className="text-[12px] font-black text-slate-800">基础信息</h3><dl className="mt-3 divide-y divide-slate-100 border-y border-slate-100">{[['完整路径', `${selectedOrg?.parentId ? `${orgById[selectedOrg.parentId]?.name} / ` : ''}${selectedOrg?.name}`], ['组织类型', orgTypeLabel[selectedOrg?.type]], ['负责人', manager?.name || '未设置'], ['下级组织', `${children.length} 个`]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-3"><dt className="text-[12px] text-slate-400">{label}</dt><dd className="text-right text-[12px] font-bold text-slate-700">{value}</dd></div>)}</dl></div><div><h3 className="text-[12px] font-black text-slate-800">下级组织</h3><div className="mt-3 divide-y divide-slate-100 border-y border-slate-100">{children.length ? children.map((item) => <button key={item.id} onClick={() => setSelectedOrgId(item.id)} className="flex min-h-12 w-full items-center gap-3 text-left"><Network size={14} className="text-slate-400" /><span className="flex-1 text-[12px] font-bold text-slate-700">{item.name}</span><span className="text-[11px] text-slate-400">{orgTypeLabel[item.type]}</span><ChevronRight size={14} className="text-slate-300" /></button>) : <EmptyState title="没有下级组织" description="可按实际管理层级新增部门、工厂或车间。" action={<Button icon={Plus} onClick={() => openOrgEditor('add')}>新增下级组织</Button>} />}</div></div></div>}
            {orgTab === 'positions' && <div className="p-5"><div className="mb-3 flex items-center justify-between"><h3 className="text-[12px] font-black text-slate-800">岗位与当前任职</h3><Button icon={Plus} onClick={openPositionEditor}>新增岗位</Button></div><div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[620px] text-left"><thead className="bg-slate-50 text-[11px] font-bold text-slate-500"><tr><th className="px-4 py-3">岗位</th><th className="px-4 py-3">默认角色</th><th className="px-4 py-3">在岗人数</th><th className="px-4 py-3">状态</th></tr></thead><tbody className="divide-y divide-slate-100">{positions.map((position) => <tr key={position.id} className="text-[12px]"><td className="px-4 py-3.5"><div className="font-black text-slate-800">{position.name}</div><div className="mt-0.5 text-[10px] text-slate-400">{position.code}</div></td><td className="px-4 py-3.5 text-slate-600">{position.defaultRoleIds.map((id) => roleById[id]?.name).filter(Boolean).join('、') || '未配置'}</td><td className="px-4 py-3.5 font-bold text-slate-700">{state.employees.filter((item) => item.primaryPositionId === position.id).length}</td><td className="px-4 py-3.5"><StatusPill value={position.status} label={position.status === 'enabled' ? '启用' : '停用'} /></td></tr>)}</tbody></table>{positions.length === 0 && <EmptyState title="还没有岗位" description="创建岗位后，可为其设置默认角色和资源范围。" />}</div></div>}
            {orgTab === 'resources' && <div className="p-5"><div className="grid gap-3 sm:grid-cols-2">{resources.map((item) => <div key={item.id} className="flex items-center gap-3 border-b border-slate-100 py-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">{item.type === 'line' ? <Factory size={16} /> : item.type === 'warehouse' ? <Warehouse size={16} /> : <Settings2 size={16} />}</div><div className="min-w-0 flex-1"><div className="truncate text-[12px] font-black text-slate-800">{item.name}</div><div className="mt-1 text-[10px] text-slate-400">{resourceTypeLabel[item.type]} · {item.code}</div></div><StatusPill value={item.status} label={item.status === 'enabled' ? '启用' : '停用'} /></div>)}</div>{resources.length === 0 && <EmptyState title="暂无关联资源" description="产线、仓库和工作中心请在企业资源中创建。" />}</div>}
            {orgTab === 'changes' && <div className="p-5"><div className="divide-y divide-slate-100">{state.audits.filter((item) => item.target.includes(selectedOrg?.name || '')).slice(0, 8).map((item) => <div key={item.id} className="flex gap-4 py-3"><Clock3 size={14} className="mt-0.5 text-slate-400" /><div className="flex-1"><div className="text-[12px] font-bold text-slate-700">{item.action}</div><div className="mt-1 text-[11px] text-slate-400">{item.operator} · {item.time}</div></div></div>)}</div>{state.audits.filter((item) => item.target.includes(selectedOrg?.name || '')).length === 0 && <EmptyState title="没有变更记录" description="此组织的迁移、停用和负责人调整会记录在这里。" />}</div>}
          </Panel>
        </div>
      </div>
    );
  };

  const openResourceEditor = (item?: any) => {
    const factoryOptions: FormOption[] = state.orgUnits.filter((org) => org.type === 'factory' && org.status === 'enabled').map((org) => ({ value: org.id, label: org.name, description: org.code }));
    const workshopOptions: FormOption[] = state.orgUnits.filter((org) => org.type === 'workshop' && org.status === 'enabled').map((org) => ({ value: org.id, label: org.name, description: `${orgById[org.parentId || '']?.name || '未绑定工厂'} · ${org.code}` }));
    setDrawer({
      title: item ? '编辑企业资源' : '新增企业资源', description: '资源必须归属组织；产线和工作中心必须选择同一工厂下的车间。', submitLabel: item ? '保存修改' : '创建资源',
      fields: [
        { key: 'name', label: '资源名称', required: true, wide: true, maxLength: 60, help: '2–60 个字符，建议包含区域或用途。' }, { key: 'code', label: '资源编码', required: true, disabled: Boolean(item), normalize: (value) => value.toUpperCase(), maxLength: 40, help: '自动转为大写；创建后不可修改。' },
        { key: 'type', label: '资源类型', type: 'select', required: true, disabled: Boolean(item), options: Object.entries(resourceTypeLabel).map(([value, label]) => ({ value, label })) },
        { key: 'ownerOrgId', label: '归属组织', type: 'combobox', requiredWhen: (draft) => draft.type === 'warehouse', visibleWhen: (draft) => draft.type === 'warehouse', wide: true, options: orgOptions, placeholder: '搜索组织名称或编码', help: '产线和工作中心将自动归属所选车间。' },
        { key: 'factoryOrgId', label: '所属工厂', type: 'combobox', options: factoryOptions, requiredWhen: (draft) => ['line', 'work_center'].includes(draft.type), clearOnChange: ['workshopOrgId'], placeholder: '搜索工厂名称或编码' },
        { key: 'workshopOrgId', label: '所属车间', type: 'combobox', optionsFor: (draft) => workshopOptions.filter((option) => !draft.factoryOrgId || orgById[option.value]?.parentId === draft.factoryOrgId), requiredWhen: (draft) => ['line', 'work_center'].includes(draft.type), placeholder: '搜索车间名称或编码' },
        { key: 'managerEmployeeId', label: '负责人（员工）', type: 'combobox', wide: true, options: employeeOptions, placeholder: '搜索姓名、员工编号、组织或岗位' },
        { key: 'specification', label: '用途或说明', type: 'textarea', wide: true, placeholder: '例如：成品仓、SMT 贴片与回流焊' },
      ],
      initial: item ? { name: item.name, code: item.code, type: item.type, ownerOrgId: item.ownerOrgId, factoryOrgId: item.factoryOrgId || '', workshopOrgId: item.workshopOrgId || '', managerEmployeeId: item.managerEmployeeId || '', specification: item.specification } : { name: '', code: '', type: 'line', ownerOrgId: '', factoryOrgId: '', workshopOrgId: '', managerEmployeeId: '', specification: '' },
      validate: (draft) => {
        const nameError = validateDisplayName(draft.name, '资源名称');
        if (nameError) return { key: 'name', message: nameError };
        if (!BUSINESS_CODE_PATTERN.test(draft.code)) return { key: 'code', message: '资源编码须以字母开头，仅使用大写字母、数字、下划线或短横线，共 2–40 位。' };
        if (state.resources.some((resource) => resource.code.trim().toLowerCase() === draft.code.trim().toLowerCase() && resource.id !== item?.id)) return { key: 'code', message: '资源编码已存在，请使用唯一编码。' };
        if (draft.workshopOrgId && orgById[draft.workshopOrgId]?.parentId !== draft.factoryOrgId) return { key: 'workshopOrgId', message: '所选车间不属于当前工厂，请重新选择。' };
        return null;
      },
      onSubmit: (draft) => {
        const values = { name: draft.name, code: draft.code, type: draft.type as any, ownerOrgId: ['line', 'work_center'].includes(draft.type) ? draft.workshopOrgId : draft.ownerOrgId, factoryOrgId: draft.factoryOrgId || null, workshopOrgId: draft.workshopOrgId || null, managerEmployeeId: draft.managerEmployeeId || null, specification: draft.specification };
        if (item) return commit((prev) => ({ ...prev, resources: prev.resources.map((resource) => resource.id === item.id ? { ...resource, ...values } : resource) }), '企业资源已更新', '编辑企业资源', draft.name);
        return commit((prev) => ({ ...prev, resources: [...prev.resources, { id: makeId('RES'), ...values, status: 'enabled' }] }), '企业资源已创建', '创建企业资源', draft.name);
      },
    });
  };

  const renderResources = () => {
    const filtered = state.resources.filter((item) => (resourceType === 'all' || item.type === resourceType) && `${item.name}${item.code}${orgById[item.ownerOrgId]?.name || ''}`.toLowerCase().includes(query.toLowerCase()));
    return (
      <div data-testid="platform-view-resource">
        <PageHeader eyebrow="企业基础" title="企业资源" description="维护产线、仓库和工作中心，组织架构与生产专属资料保持分离。" actions={<Button variant="primary" icon={Plus} onClick={() => openResourceEditor()}>新增资源</Button>} />
        <Panel>
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><Segmented value={resourceType} onChange={setResourceType} items={[{ value: 'all', label: '全部', count: state.resources.length }, { value: 'line', label: '产线', count: state.resources.filter((item) => item.type === 'line').length }, { value: 'warehouse', label: '仓库', count: state.resources.filter((item) => item.type === 'warehouse').length }, { value: 'work_center', label: '工作中心', count: state.resources.filter((item) => item.type === 'work_center').length }]} /><div className="relative w-full sm:w-72"><Search size={14} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索企业资源" placeholder="搜索名称、编码或归属组织" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-[12px] outline-none focus:border-[#1e5fbf]" /></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500"><tr><th className="px-5 py-3.5">资源</th><th className="px-4 py-3.5">类型</th><th className="px-4 py-3.5">归属组织</th><th className="px-4 py-3.5">负责人</th><th className="px-4 py-3.5">用途</th><th className="px-4 py-3.5">状态</th><th className="px-5 py-3.5 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((item) => <tr key={item.id} className="text-[12px] text-slate-600 hover:bg-slate-50/70"><td className="px-5 py-4"><div className="font-black text-slate-900">{item.name}</div><div className="mt-1 text-[10px] text-slate-400">{item.code}</div></td><td className="px-4 py-4 font-bold text-slate-700">{resourceTypeLabel[item.type]}</td><td className="px-4 py-4">{orgById[item.ownerOrgId]?.name || '-'}</td><td className="px-4 py-4">{employeeById[item.managerEmployeeId || '']?.name || '未设置'}</td><td className="max-w-[220px] truncate px-4 py-4">{item.specification || '-'}</td><td className="px-4 py-4"><StatusPill value={item.status} label={item.status === 'enabled' ? '启用' : '停用'} /></td><td className="px-5 py-4 text-right"><Button variant="quiet" icon={Pencil} onClick={() => openResourceEditor(item)}>编辑</Button></td></tr>)}</tbody></table></div>
          {filtered.length === 0 && <EmptyState title="没有匹配的企业资源" description="调整筛选条件，或新增一项产线、仓库或工作中心。" action={<Button icon={Plus} onClick={() => openResourceEditor()}>新增资源</Button>} />}
        </Panel>
      </div>
    );
  };

  const openEmployeeEditor = (employee?: any) => setDrawer({
    title: employee ? '编辑员工档案' : '新建员工档案', description: '员工档案与登录账号分开维护，可先建档，之后再开通账号。', submitLabel: employee ? '保存档案' : '创建员工',
    fields: [
      { key: 'name', label: '姓名', required: true, maxLength: 40, help: '2–40 个字符，与员工正式档案保持一致。' },
      { key: 'employeeNo', label: '员工编号', required: true, disabled: Boolean(employee), normalize: (value) => value.toUpperCase(), maxLength: 40, help: '自动转为大写；企业内必须唯一，创建后不可修改。' },
      { key: 'primaryOrgId', label: '所属组织', type: 'combobox', required: true, options: orgOptions, clearOnChange: ['primaryPositionId'], placeholder: '搜索组织名称或编码' },
      { key: 'primaryPositionId', label: '主岗位', type: 'combobox', required: true, optionsFor: (draft) => positionOptions.filter((option) => !draft.primaryOrgId || isSameOrAncestorOrg(positionById[option.value]?.orgId, draft.primaryOrgId)), placeholder: '搜索岗位名称或编码' },
      { key: 'mobile', label: '手机号', required: true, inputMode: 'tel', maxLength: 11, help: '填写 11 位中国大陆手机号。' },
      { key: 'email', label: '工作邮箱', required: true, inputMode: 'email', maxLength: 100, help: '例如 name@company.com。' },
    ],
    initial: employee ? { name: employee.name, employeeNo: employee.employeeNo, primaryOrgId: employee.primaryOrgId, primaryPositionId: employee.primaryPositionId, mobile: employee.mobile, email: employee.email } : { name: '', employeeNo: '', primaryOrgId: '', primaryPositionId: '', mobile: '', email: '' },
    validate: (draft) => {
      const nameError = validateDisplayName(draft.name, '姓名');
      if (nameError) return { key: 'name', message: nameError };
      if (!BUSINESS_CODE_PATTERN.test(draft.employeeNo)) return { key: 'employeeNo', message: '员工编号须以字母开头，仅使用大写字母、数字、下划线或短横线，共 2–40 位。' };
      if (state.employees.some((item) => item.employeeNo.trim().toLowerCase() === draft.employeeNo.trim().toLowerCase() && item.id !== employee?.id)) return { key: 'employeeNo', message: '员工编号已存在，请核对后再保存。' };
      if (!draft.mobile?.trim()) return { key: 'mobile', message: '手机号为必填项，请填写 11 位中国大陆手机号。' };
      if (!MOBILE_PATTERN.test(draft.mobile)) return { key: 'mobile', message: '手机号格式不正确，请填写 11 位中国大陆手机号。' };
      if (!draft.email?.trim()) return { key: 'email', message: '工作邮箱为必填项，请填写有效邮箱地址。' };
      if (!/^\S+@\S+\.\S+$/.test(draft.email)) return { key: 'email', message: '工作邮箱格式不正确，例如 name@company.com。' };
      if (draft.primaryPositionId && !isSameOrAncestorOrg(positionById[draft.primaryPositionId]?.orgId, draft.primaryOrgId)) return { key: 'primaryPositionId', message: '所选岗位不属于该组织或其上级组织。' };
      return null;
    },
    onSubmit: async (draft) => {
      if (employee) return commit((prev) => ({ ...prev, employees: prev.employees.map((item) => item.id === employee.id ? { ...item, ...draft } : item) }), '员工档案已保存', '编辑员工档案', draft.name);
      const id = makeId('EMP');
      const saved = await commit((prev) => ({ ...prev, employees: [...prev.employees, { id, ...draft, status: 'active' } as any] }), '员工档案已创建，可按需开通账号', '创建员工档案', draft.name);
      if (saved === false) return false;
      setSelectedEmployeeId(id);
    },
  });

  const openAccountFor = (employee: any) => setDrawer({
    title: '开通登录账号', description: `为 ${employee.name} 创建登录身份。一个员工同一时间只能有一个启用账号。`, submitLabel: '开通账号',
    fields: [{ key: 'loginName', label: '登录账号', required: true, wide: true, normalize: (value) => value.toLowerCase(), maxLength: 32, help: '自动转为小写；3–32 位，以字母开头，可使用数字、点、下划线和短横线。' }, { key: 'authType', label: '认证方式', type: 'select', required: true, wide: true, options: [{ value: 'password', label: '密码登录' }, { value: 'sso', label: '统一身份登录' }, { value: 'legacy_erp', label: '旧 ERP 账号' }] }],
    initial: { loginName: '', authType: 'password' },
    validate: (draft) => {
      if (!LOGIN_NAME_PATTERN.test(draft.loginName)) return { key: 'loginName', message: '登录账号须以字母开头，共 3–32 位，仅支持字母、数字、点、下划线和短横线。' };
      if (state.accounts.some((account) => account.loginName.trim().toLowerCase() === draft.loginName.trim().toLowerCase())) return { key: 'loginName', message: '登录账号已存在，请使用其他账号。' };
      if (state.accounts.some((account) => account.employeeId === employee.id && ['enabled', 'pending_activation', 'locked'].includes(account.status))) return { key: 'loginName', message: '该员工已有可用或待激活账号，不能重复开通。' };
      return null;
    },
    onSubmit: (draft) => commit((prev) => ({ ...prev, accounts: [...prev.accounts, { id: makeId('ACC'), loginName: draft.loginName, employeeId: employee.id, authType: draft.authType as any, status: 'pending_activation', directRoleIds: [], lastLoginAt: '-' }] }), '账号已创建，等待员工激活', '开通登录账号', draft.loginName),
  });

  const renderIdentity = () => {
    const filteredEmployees = state.employees.filter((item) => `${item.name}${item.employeeNo}${orgById[item.primaryOrgId]?.name || ''}`.toLowerCase().includes(query.toLowerCase()));
    const filteredAccounts = state.accounts.filter((item) => `${item.loginName}${employeeById[item.employeeId]?.name || ''}`.toLowerCase().includes(query.toLowerCase()));
    const account = selectedEmployee ? accountByEmployee[selectedEmployee.id] : null;
    return (
      <div data-testid="platform-view-identity">
        <PageHeader eyebrow="人员与权限" title="员工与账号" description="员工是人员档案，账号是登录身份；未开通账号的员工不会被误标为停用。" actions={<Button variant="primary" icon={UserPlus} onClick={() => openEmployeeEditor()}>新建员工档案</Button>} />
        <Panel>
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><Segmented value={identityMode} onChange={setIdentityMode} items={[{ value: 'employee', label: '员工档案', count: state.employees.length }, { value: 'account', label: '登录账号', count: state.accounts.length }]} /><div className="relative w-full sm:w-72"><Search size={14} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索员工或账号" placeholder="搜索姓名、工号或账号" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-[12px] outline-none focus:border-[#1e5fbf]" /></div></div>
          {identityMode === 'employee' ? <div className="platform-identity-layout grid min-h-[570px]"><div className="overflow-x-auto border-b border-slate-200 lg:border-b-0 lg:border-r"><table className="w-full min-w-[620px] text-left"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500"><tr><th className="px-5 py-3.5">员工</th><th className="px-4 py-3.5">组织 / 主岗</th><th className="px-4 py-3.5">账号</th><th className="px-4 py-3.5">状态</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredEmployees.map((item) => { const itemAccount = accountByEmployee[item.id]; return <tr key={item.id} onClick={() => setSelectedEmployeeId(item.id)} className={`cursor-pointer text-[12px] ${selectedEmployeeId === item.id ? 'bg-blue-50/70' : 'hover:bg-slate-50'}`}><td className="px-5 py-4"><div className="font-black text-slate-900">{item.name}</div><div className="mt-1 text-[10px] text-slate-400">{item.employeeNo}</div></td><td className="px-4 py-4"><div className="font-bold text-slate-700">{orgById[item.primaryOrgId]?.name}</div><div className="mt-1 text-[10px] text-slate-400">{positionById[item.primaryPositionId]?.name}</div></td><td className="px-4 py-4">{itemAccount ? <span className="font-bold text-slate-600">{itemAccount.loginName}</span> : <span className="text-amber-700">未开通账号</span>}</td><td className="px-4 py-4"><StatusPill value={item.status} label={employeeStatusLabel[item.status]} /></td></tr>; })}</tbody></table></div><aside className="bg-[#fbfcfe] p-5"><div className="flex items-start justify-between"><div><h2 className="text-[17px] font-black text-slate-950">{selectedEmployee?.name}</h2><p className="mt-1 text-[11px] font-bold text-slate-400">{selectedEmployee?.employeeNo}</p></div><Button variant="quiet" icon={Pencil} onClick={() => openEmployeeEditor(selectedEmployee)}>编辑</Button></div><div className="mt-5 border-y border-slate-200 py-1">{[['所属组织', orgById[selectedEmployee?.primaryOrgId]?.name || '-'], ['主岗位', positionById[selectedEmployee?.primaryPositionId]?.name || '-'], ['工作邮箱', selectedEmployee?.email || '-'], ['手机号', selectedEmployee?.mobile || '-']].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-3"><span className="text-[11px] text-slate-400">{label}</span><span className="text-right text-[11px] font-bold text-slate-700">{value}</span></div>)}</div><div className="mt-5"><div className="mb-3 text-[11px] font-black text-slate-800">登录账号</div>{account ? <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><div><div className="text-[12px] font-black text-slate-800">{account.loginName}</div><div className="mt-1 text-[10px] text-slate-400">{authTypeLabel[account.authType]}</div></div><StatusPill value={account.status} label={accountStatusLabel[account.status]} /></div><div className="mt-3 text-[10px] text-slate-400">最近登录：{account.lastLoginAt}</div>{account.status === 'locked' && <div className="mt-3"><Button icon={LockKeyhole} onClick={() => commit((prev) => ({ ...prev, accounts: prev.accounts.map((item) => item.id === account.id ? { ...item, status: 'enabled' } : item) }), '账号已解锁', '解锁账号', account.loginName)}>解锁账号</Button></div>}</div> : <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4"><div className="text-[12px] font-bold text-slate-700">尚未开通账号</div><p className="mt-1 text-[11px] leading-5 text-slate-500">员工档案可正常参与组织和任职管理，需要登录平台时再开通。</p><div className="mt-3"><Button variant="primary" icon={KeyRound} onClick={() => openAccountFor(selectedEmployee)}>开通账号</Button></div></div>}</div></aside></div> : <div className="overflow-x-auto"><table className="w-full min-w-[880px] text-left"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500"><tr><th className="px-5 py-3.5">登录账号</th><th className="px-4 py-3.5">绑定员工</th><th className="px-4 py-3.5">认证方式</th><th className="px-4 py-3.5">最近登录</th><th className="px-4 py-3.5">状态</th><th className="px-5 py-3.5 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredAccounts.map((item) => <tr key={item.id} className="text-[12px] hover:bg-slate-50"><td className="px-5 py-4 font-black text-slate-900">{item.loginName}</td><td className="px-4 py-4"><div className="font-bold text-slate-700">{employeeById[item.employeeId]?.name}</div><div className="mt-1 text-[10px] text-slate-400">{employeeById[item.employeeId]?.employeeNo}</div></td><td className="px-4 py-4 text-slate-600">{authTypeLabel[item.authType]}</td><td className="px-4 py-4 text-slate-500">{item.lastLoginAt}</td><td className="px-4 py-4"><StatusPill value={item.status} label={accountStatusLabel[item.status]} /></td><td className="px-5 py-4 text-right">{item.status === 'locked' ? <Button variant="quiet" onClick={() => commit((prev) => ({ ...prev, accounts: prev.accounts.map((accountItem) => accountItem.id === item.id ? { ...accountItem, status: 'enabled' } : accountItem) }), '账号已解锁', '解锁账号', item.loginName)}>解锁</Button> : <Button variant="quiet" onClick={() => toast('未撤销：当前接口需要指定登录会话标识，尚不支持撤销该账号的全部会话', 'error')}>撤销会话</Button>}</td></tr>)}</tbody></table></div>}
        </Panel>
      </div>
    );
  };

  const openRoleScopeEditor = () => setDrawer({
    title: '调整数据范围', description: `设置“${selectedRole.name}”可访问的组织或资源范围。`, submitLabel: '保存数据范围',
    fields: [
      { key: 'dataScope', label: '范围类型', type: 'select', required: true, wide: true, clearOnChange: ['scopeValue'], options: [{ value: 'tenant_all', label: '当前企业全部数据' }, { value: 'org_tree', label: '指定组织及下级组织' }, { value: 'factory_set', label: '指定工厂' }, { value: 'warehouse_set', label: '指定仓库' }, { value: 'customer_owner', label: '本人负责客户' }, { value: 'supplier_buyer', label: '本人负责供应商' }] },
      { key: 'scopeValue', label: '组织或资源', type: 'combobox', wide: true, requiredWhen: (draft) => ['org_tree', 'factory_set', 'warehouse_set'].includes(draft.dataScope), visibleWhen: (draft) => ['org_tree', 'factory_set', 'warehouse_set'].includes(draft.dataScope), optionsFor: (draft) => draft.dataScope === 'warehouse_set' ? state.resources.filter((item) => item.type === 'warehouse' && item.status === 'enabled').map((item) => ({ value: item.id, label: item.name, description: item.code })) : draft.dataScope === 'factory_set' ? orgOptions.filter((option) => orgById[option.value]?.type === 'factory') : orgOptions, placeholder: '搜索组织、工厂或仓库' },
    ],
    initial: { dataScope: selectedRole.dataScope || '', scopeValue: Array.isArray(selectedRole.scopeValues) ? selectedRole.scopeValues[0] || '' : '' },
    validate: (draft) => {
      if (!['org_tree', 'factory_set', 'warehouse_set'].includes(draft.dataScope)) return null;
      const validOptions = draft.dataScope === 'warehouse_set' ? state.resources.filter((item) => item.type === 'warehouse' && item.status === 'enabled').map((item) => item.id) : draft.dataScope === 'factory_set' ? state.orgUnits.filter((item) => item.type === 'factory' && item.status === 'enabled').map((item) => item.id) : state.orgUnits.filter((item) => item.status === 'enabled').map((item) => item.id);
      return validOptions.includes(draft.scopeValue) ? null : { key: 'scopeValue', message: '请选择与范围类型匹配的有效组织或资源。' };
    },
    onSubmit: (draft) => commit((prev) => ({ ...prev, roles: prev.roles.map((role) => role.id === selectedRole.id ? { ...role, dataScope: draft.dataScope, scopeValues: draft.scopeValue ? [draft.scopeValue] : [] } : role) }), '角色数据范围已保存', '调整角色数据范围', selectedRole.name),
  });

  const openRoleEditor = () => setDrawer({
    title: '新建角色',
    description: '角色描述账号可以执行哪些操作，不等同于员工岗位；名称与编码在企业内必须唯一。',
    submitLabel: '创建角色',
    fields: [
      { key: 'name', label: '角色名称', required: true, wide: true, maxLength: 60, help: '2–60 个字符，建议体现职责或权限边界。' },
      { key: 'code', label: '角色编码', required: true, wide: true, normalize: (value) => value.toUpperCase(), maxLength: 40, help: '自动转为大写；仅支持字母、数字、下划线和短横线。' },
      { key: 'description', label: '角色说明', type: 'textarea', wide: true, maxLength: 300 },
    ],
    initial: { name: '', code: '', description: '' },
    validate: (draft) => {
      const nameError = validateDisplayName(draft.name, '角色名称');
      if (nameError) return { key: 'name', message: nameError };
      if (!BUSINESS_CODE_PATTERN.test(draft.code)) return { key: 'code', message: '角色编码须以字母开头，仅使用大写字母、数字、下划线或短横线，共 2–40 位。' };
      if (state.roles.some((role) => role.code.toLowerCase() === draft.code.toLowerCase())) return { key: 'code', message: '角色编码已存在，请使用唯一编码。' };
      if (state.roles.some((role) => role.name.trim().toLowerCase() === draft.name.toLowerCase())) return { key: 'name', message: '角色名称已存在，请使用更清晰的名称。' };
      return null;
    },
    onSubmit: async (draft) => {
      const id = makeId('ROLE');
      const saved = await commit((prev) => ({ ...prev, roles: [...prev.roles, { id, name: draft.name, code: draft.code, description: draft.description, dataScope: 'org_tree', scopeValues: [], status: 'enabled' }] }), '角色已创建', '创建角色', draft.name);
      if (saved === false) return false;
      setSelectedRoleId(id);
    },
  });

  const selectRoleSafely = (roleId: string) => {
    if (roleId === selectedRoleId) return;
    if (!permissionDirty) { setSelectedRoleId(roleId); return; }
    const nextRole = roleById[roleId];
    setImpact({ eyebrow: '未发布变更', title: `切换到“${nextRole?.name || '其他角色'}”？`, description: `“${selectedRole.name}”还有未发布的权限修改。`, impacts: ['继续切换会放弃当前权限草稿', '已发布的权限不会受影响'], confirmLabel: '放弃草稿并切换', tone: 'danger', onConfirm: () => setSelectedRoleId(roleId) });
  };

  const renderAccess = () => {
    if (!selectedRole) return <EmptyState title={permissionError || '暂无角色数据'} description="请在角色数据加载完成后操作。" />;
    // Missing scope facts must not become an empty or unrestricted authorization.
    const roleScopeLoaded = typeof selectedRole.dataScope === 'string' && selectedRole.dataScope.trim() !== ''
      && Array.isArray(selectedRole.scopeValues) && selectedRole.scopeValues.every(value => typeof value === 'string');
    const grouped = Object.entries(state.permissions.reduce((acc: Record<string, typeof state.permissions>, permission) => { (acc[permission.module] ||= []).push(permission); return acc; }, {})) as Array<[string, typeof state.permissions]>;
    const setEffect = (permissionId: string, effect: 'allow' | 'deny' | 'unset') => setPermissionDraft((prev) => ({ ...prev, [permissionId]: effect }));
    const publishPermissions = async () => {
      if (!permissionLoaded || !roleScopeLoaded || permissionSaving || !currentUser?.accessToken) return;
      const roleId = selectedRoleId;
      const version = roleVersions[roleId];
      if (!version) { toast('请先保存角色再发布权限', 'error'); return; }
      setPermissionSaving(true);
      try {
        const grants = Object.entries(permissionDraft).filter(([, effect]) => effect !== 'unset')
          .map(([permissionId, effect]) => ({ permissionId, effect: effect as 'allow' | 'deny' }));
        const context = { tenantId: tenantIdentity.id, accessToken: currentUser.accessToken };
        await platformApi.replaceRoleGrants(context, roleId, grants, version);
        window.dispatchEvent(new CustomEvent('industrial-ai-permissions-changed', { detail: context }));
        const snapshot = await platformApi.getSnapshot(context);
        const published = snapshot.roles.find(role => role.id === roleId);
        if (!published || !Number.isInteger(published.version)) throw new Error('授权已提交，但尚未取得发布版本，请重新查询后核对');
        setState(migratePlatformState(snapshot));
        setRoleVersions(Object.fromEntries(snapshot.roles.map(role => [role.id, role.version])));
        setPermissionError('');
        toast('角色权限已发布');
      } catch (error) {
        const message = error instanceof Error ? error.message : '权限发布失败';
        setPermissionError(message);
        toast(message, 'error');
      } finally { setPermissionSaving(false); }
    };
    const changes = state.permissions.flatMap(permission => {
      const saved = state.roleGrants.find(grant => grant.roleId === selectedRoleId && grant.permissionId === permission.id)?.effect || 'unset';
      const next = permissionDraft[permission.id] || 'unset';
      const label = { allow: '允许', deny: '拒绝', unset: '未设置' };
      return saved === next ? [] : [`${permission.name} (${permission.code})：${label[saved]} → ${label[next]}`];
    });
    const savePermissions = () => setImpact({ eyebrow: '发布确认', title: `发布“${selectedRole.name}”权限变更？`, description: '发布后按服务端授权版本执行，数据范围和职责分离仍由服务端校验。', impacts: changes, confirmLabel: '发布权限变更', onConfirm: () => { void publishPermissions(); } });
    return (
      <div data-testid="platform-view-access">
        <PageHeader eyebrow="人员与权限" title="角色与权限" description="分别设置允许与拒绝；拒绝始终优先。修改发布前只保存在当前草稿中。" actions={<>
          <Button icon={BadgeCheck} onClick={() => setImpact({ eyebrow: '权限草稿预览', title: `“${selectedRole.name}”权限差异`, description: '逐项对比当前已发布授权与本页草稿。', impacts: changes.length ? changes : ['当前没有权限变更'], confirmLabel: '关闭预览', hideSecondary: true, onConfirm: () => {} })}>预览草稿</Button>
          <Button disabled={!permissionDirty || !permissionLoaded || !roleScopeLoaded || permissionSaving} title={!roleScopeLoaded ? '角色数据范围字段缺失，请补全后再发布权限' : !permissionLoaded ? '请等待角色权限加载完成' : !permissionDirty ? '当前没有待发布修改' : undefined} variant="primary" icon={Save} onClick={savePermissions}>{permissionSaving ? '发布中' : '发布变更'}</Button>
        </>} />
        {permissionError && <p role="alert" className="mb-4 text-[12px] text-rose-700">{permissionError}</p>}
        {!roleScopeLoaded && <p role="alert" className="mb-4 text-[12px] text-amber-800">角色数据范围字段缺失或格式不正确，暂不能发布权限。请补全数据范围后重新核对。</p>}
        <div className="platform-access-layout grid min-h-[670px] gap-5">
          <Panel title="角色" actions={<Button variant="quiet" icon={Plus} onClick={openRoleEditor}>新建</Button>}>
            <div className="custom-scrollbar max-h-[590px] overflow-y-auto p-2">{state.roles.map((role) => <button key={role.id} aria-pressed={selectedRoleId === role.id} onClick={() => selectRoleSafely(role.id)} className={`mb-1 min-h-12 w-full rounded-lg px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selectedRoleId === role.id ? 'bg-[#eaf2ff]' : 'hover:bg-slate-50'}`}><div className={`text-[12px] font-black ${selectedRoleId === role.id ? 'text-[#174f9f]' : 'text-slate-800'}`}>{role.name}</div><div className="mt-1 truncate text-[10px] text-slate-400">{role.description || role.code}</div></button>)}</div>
          </Panel>
          <Panel className="min-w-0">
            <div className="border-b border-slate-100 px-5 py-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-[18px] font-black text-slate-950">{selectedRole.name}</h2><p className="mt-1 text-[11px] leading-5 text-slate-500">{selectedRole.description}</p></div><StatusPill value={selectedRole.status} label={selectedRole.status === 'enabled' ? '使用中' : '已停用'} /></div><div className="mt-4 flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-4 py-3"><div><div className="text-[11px] font-black text-slate-700">默认数据范围</div><div className="mt-1 text-[10px] text-slate-400">{!roleScopeLoaded ? '数据范围待补全' : <>{selectedRole.dataScope} {selectedRole.scopeValues.length ? `· ${selectedRole.scopeValues.map((id) => orgById[id]?.name || state.resources.find((resource) => resource.id === id)?.name || id).join('、')}` : '· 无额外范围'}</>}</div></div><Button variant="quiet" icon={Pencil} onClick={openRoleScopeEditor}>调整范围</Button></div>{permissionDirty && <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-amber-700"><CircleAlert size={14} />当前角色有未发布的权限修改</div>}</div>
            <div className="custom-scrollbar max-h-[550px] overflow-y-auto"><div className="grid grid-cols-[minmax(190px,1fr)_180px] border-b border-slate-200 bg-slate-50 px-5 py-3 text-[10px] font-black text-slate-500 sm:grid-cols-[minmax(220px,1fr)_210px]"><div>权限资源</div><div className="grid grid-cols-3 text-center"><span>允许</span><span>拒绝</span><span>未设置</span></div></div>{grouped.map(([module, permissions]) => <div key={module} className="border-b border-slate-100"><div className="bg-[#fbfcfe] px-5 py-2.5 text-[11px] font-black text-slate-700">{module}</div>{permissions.map((permission) => <div key={permission.id} className="grid grid-cols-[minmax(190px,1fr)_180px] items-center px-5 py-3 hover:bg-slate-50 sm:grid-cols-[minmax(220px,1fr)_210px]"><div className="min-w-0"><div className="truncate text-[12px] font-bold text-slate-700">{permission.name}</div><div className="mt-1 text-[10px] text-slate-400">{permission.type === 'page' ? '页面' : permission.type === 'button' ? '操作' : permission.type === 'api' ? '接口' : permission.type === 'field' ? '字段' : permission.type === 'export' ? '导出' : permission.type === 'ai' ? 'AI' : '菜单'} · {permission.code}</div></div><div className="grid grid-cols-3 place-items-center" role="radiogroup" aria-label={`${permission.name}权限效果`}>{(['allow', 'deny', 'unset'] as const).map((effect) => <button key={effect} type="button" role="radio" aria-checked={permissionDraft[permission.id] === effect} onClick={() => setEffect(permission.id, effect)} aria-label={`${permission.name}-${effect === 'allow' ? '允许' : effect === 'deny' ? '拒绝' : '未设置'}`} className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${permissionDraft[permission.id] === effect ? effect === 'allow' ? 'border-emerald-600 bg-emerald-600 text-white' : effect === 'deny' ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-500 bg-slate-500 text-white' : 'border-slate-200 bg-white text-transparent hover:border-slate-400'}`}><Check size={14} /></button>)}</div></div>)}</div>)}</div>
          </Panel>
        </div>
      </div>
    );
  };

  const openAdapterEditor = (item: PlatformState['adapters'][number]) => {
    const scopeValues = Array.from(new Set([...Object.keys(legacyScopeLabel), ...state.adapters.map((adapter) => adapter.legacyScope).filter(Boolean)]));
    const legacyScopeOptions = scopeValues.map((value) => ({ value, label: legacyScopeLabel[value] || value, description: value }));
    setDrawer({
      title: item.status === 'conflict' || item.status === 'failed' ? '处理权限映射' : '编辑权限映射', description: '修改后状态会变为“待同步”，需重新运行预检后才会写入旧 ERP。', submitLabel: '保存并等待预检',
      fields: [
        { key: 'permissionCode', label: '平台权限编码', disabled: true, wide: true },
        { key: 'legacyRoleCode', label: '旧 ERP 角色编码', required: true, wide: true, normalize: (value) => value.toUpperCase(), maxLength: 40, help: '自动转为大写；请输入旧 ERP 中真实存在的角色编码。' },
        { key: 'legacyScope', label: '旧系统数据范围', type: 'combobox', required: true, wide: true, options: legacyScopeOptions, placeholder: '搜索旧系统数据范围' },
      ],
      initial: { permissionCode: item.permissionCode, legacyRoleCode: item.legacyRoleCode, legacyScope: item.legacyScope },
      validate: (draft) => {
        if (!BUSINESS_CODE_PATTERN.test(draft.legacyRoleCode)) return { key: 'legacyRoleCode', message: '旧 ERP 角色编码须以字母开头，仅使用大写字母、数字、下划线或短横线，共 2–40 位。' };
        if (!LEGACY_SCOPE_PATTERN.test(draft.legacyScope) || !scopeValues.includes(draft.legacyScope)) return { key: 'legacyScope', message: '请选择旧 ERP 已登记的数据范围。' };
        return null;
      },
      onSubmit: (draft) => commit((prev) => ({ ...prev, adapters: prev.adapters.map((adapter) => adapter.id === item.id ? { ...adapter, legacyRoleCode: draft.legacyRoleCode, legacyScope: draft.legacyScope, status: 'pending_sync', errorMessage: '', lastSyncAt: null } : adapter) }), '映射已保存，请运行预检', '编辑权限映射', item.permissionCode),
    });
  };

  const renderAdapters = () => {
    const issues = state.adapters.filter((item) => item.status === 'conflict' || item.status === 'failed');
    const pending = state.adapters.filter((item) => item.status === 'pending_sync');
    return (
      <div data-testid="platform-view-adapter">
        <PageHeader eyebrow="规则与治理" title="权限适配" description="将平台权限映射到旧 ERP。同步前先预检，冲突和失败需要逐项处理。" actions={<><Button icon={ListChecks} disabled={pending.length === 0} title={pending.length === 0 ? '当前没有待同步映射' : undefined} onClick={() => toast('未执行：后端尚未提供权限适配预检/同步接口', 'error')}>运行预检</Button><Button variant="primary" icon={RefreshCw} onClick={() => void reloadSnapshot().catch(error => toast(error.message || '刷新失败', 'error'))}>刷新状态</Button></>} />
        {issues.length > 0 && <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5"><AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-700" /><div className="flex-1"><div className="text-[12px] font-black text-amber-900">有 {issues.length} 项映射需要处理</div><p className="mt-1 text-[11px] leading-5 text-amber-800">已同步项目不受影响。处理冲突或补全旧角色后，可单独重试。</p></div></div>}
        <Panel>
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="text-[11px] font-bold text-slate-500">{state.adapters.filter((item) => item.status === 'synced').length} 项已同步 · {issues.length} 项需处理</div><div className="relative w-full sm:w-72"><Search size={14} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索权限适配" placeholder="搜索本地权限或旧角色" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-[12px] outline-none focus:border-[#1e5fbf]" /></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500"><tr><th className="px-5 py-3.5">平台权限</th><th className="px-4 py-3.5">业务模块</th><th className="px-4 py-3.5">旧 ERP 角色</th><th className="px-4 py-3.5">旧系统范围</th><th className="px-4 py-3.5">状态</th><th className="px-5 py-3.5 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{state.adapters.filter((item) => `${item.permissionCode}${item.permissionName}${item.legacyRoleCode}`.toLowerCase().includes(query.toLowerCase())).map((item) => <tr key={item.id} className="text-[12px] hover:bg-slate-50"><td className="px-5 py-4"><div className="font-black text-slate-800">{item.permissionName}</div><div className="mt-1 text-[10px] text-slate-400">{item.permissionCode}</div>{item.errorMessage && <div className="mt-2 max-w-[340px] text-[11px] leading-4 text-rose-600">{item.errorMessage}</div>}</td><td className="px-4 py-4 text-slate-600">{item.module}</td><td className="px-4 py-4 font-bold text-slate-700">{item.legacyRoleCode || '未映射'}</td><td className="px-4 py-4 text-slate-500">{item.legacyScope || '-'}</td><td className="px-4 py-4"><StatusPill value={item.status} label={adapterStatusLabel[item.status]} /></td><td className="px-5 py-4 text-right"><Button variant="quiet" icon={item.status === 'failed' || item.status === 'conflict' ? RefreshCw : Pencil} onClick={() => openAdapterEditor(item)}>{item.status === 'failed' || item.status === 'conflict' ? '处理映射' : '编辑映射'}</Button></td></tr>)}</tbody></table></div>
        </Panel>
      </div>
    );
  };

  const resolverLabel: Record<string, string> = { by_role: '按角色', by_position: '按岗位', by_org_manager: '按组织负责人' };
  const fallbackLabel: Record<string, string> = { block: '无审批人时阻断', tenant_admin: '转企业管理员', unassigned_pool: '进入待分配池' };
  const approvalTargetOptions = (resolver: string): FormOption[] => resolver === 'by_role' ? roleOptions : resolver === 'by_position' ? positionOptions : orgOptions;
  const approvalTargetLabel = (rule: PlatformState['approvalRules'][number]) => rule.resolver === 'by_role' ? roleById[rule.resolverValue]?.name || rule.resolverValue : rule.resolver === 'by_position' ? positionById[rule.resolverValue]?.name || rule.resolverValue : orgById[rule.resolverValue]?.name || rule.resolverValue;
  const resolveApprovalCandidates = (rule: PlatformState['approvalRules'][number]) => {
    const employeeIds = new Set<string>();
    if (rule.resolver === 'by_role') {
      const role = state.roles.find((item) => [item.id, item.code, item.name].includes(rule.resolverValue));
      if (role) {
        state.accounts.filter((account) => account.status === 'enabled' && account.directRoleIds.includes(role.id)).forEach((account) => employeeIds.add(account.employeeId));
        state.employees.filter((employee) => positionById[employee.primaryPositionId]?.defaultRoleIds.includes(role.id)).forEach((employee) => employeeIds.add(employee.id));
      }
    } else if (rule.resolver === 'by_position') {
      const position = state.positions.find((item) => [item.id, item.code, item.name].includes(rule.resolverValue));
      state.employees.filter((employee) => employee.primaryPositionId === position?.id).forEach((employee) => employeeIds.add(employee.id));
    } else {
      const org = state.orgUnits.find((item) => [item.id, item.code, item.name].includes(rule.resolverValue));
      if (org?.managerEmployeeId) employeeIds.add(org.managerEmployeeId);
    }
    return [...employeeIds].map((id) => employeeById[id]).filter((employee) => employee?.status === 'active' && state.accounts.some((account) => account.employeeId === employee.id && account.status === 'enabled'));
  };
  const openApprovalRuleEditor = (rule?: PlatformState['approvalRules'][number]) => setDrawer({
    title: rule ? '编辑审批规则' : '新建审批规则', description: '审批对象必须从有效角色、岗位或组织中选择，系统会解析到具体在职账号。', submitLabel: rule ? '保存规则' : '创建规则',
    fields: [
      { key: 'module', label: '业务模块', type: 'select', required: true, clearOnChange: ['documentType'], options: approvalModuleOptions },
      { key: 'documentType', label: '单据类型', type: 'select', required: true, optionsFor: (draft) => (approvalDocumentsByModule[draft.module] || []).map((label) => ({ value: label, label })) },
      { key: 'resolver', label: '审批人来源', type: 'select', required: true, clearOnChange: ['resolverValue'], options: Object.entries(resolverLabel).map(([value, label]) => ({ value, label })) },
      { key: 'resolverValue', label: '匹配对象', type: 'combobox', required: true, wide: true, optionsFor: (draft) => approvalTargetOptions(draft.resolver), placeholder: '搜索角色、岗位或组织' },
      { key: 'fallback', label: '无人可审批时', type: 'select', required: true, wide: true, options: Object.entries(fallbackLabel).map(([value, label]) => ({ value, label })) },
    ],
    initial: rule ? { module: rule.module, documentType: rule.documentType, resolver: rule.resolver, resolverValue: rule.resolverValue, fallback: rule.fallback } : { module: '', documentType: '', resolver: 'by_role', resolverValue: '', fallback: 'block' },
    validate: (draft) => {
      if (!approvalDocumentsByModule[draft.module]?.includes(draft.documentType)) return { key: 'documentType', message: '请选择当前业务模块下的有效单据类型。' };
      if (state.approvalRules.some((item) => item.module === draft.module && item.documentType === draft.documentType && item.id !== rule?.id)) return { key: 'documentType', message: '该业务模块和单据类型已有审批规则，请直接编辑原规则。' };
      if (!approvalTargetOptions(draft.resolver).some((option) => option.value === draft.resolverValue)) return { key: 'resolverValue', message: '请选择列表中的有效角色、岗位或组织。' };
      return null;
    },
    onSubmit: (draft) => {
      if (rule) return commit((prev) => ({ ...prev, approvalRules: prev.approvalRules.map((item) => item.id === rule.id ? { ...item, module: draft.module, documentType: draft.documentType, resolver: draft.resolver as any, resolverValue: draft.resolverValue, fallback: draft.fallback as any } : item) }), '审批规则已保存', '编辑审批规则', `${draft.module}/${draft.documentType}`);
      return commit((prev) => ({ ...prev, approvalRules: [...prev.approvalRules, { id: makeId('APR'), module: draft.module, documentType: draft.documentType, resolver: draft.resolver as any, resolverValue: draft.resolverValue, fallback: draft.fallback as any, status: 'enabled' }] }), '审批规则已创建', '创建审批规则', `${draft.module}/${draft.documentType}`);
    },
  });
  const renderGovernance = () => (
    <div data-testid="platform-view-governance">
      <PageHeader eyebrow="规则与治理" title="审批与待办" description="按业务单据设置审批人来源；调岗或离职时，待办会按规则移交。" actions={<Button variant="primary" icon={Plus} onClick={() => openApprovalRuleEditor()}>新建规则</Button>} />
      <Panel>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500"><tr><th className="px-5 py-3.5">适用单据</th><th className="px-4 py-3.5">审批人来源</th><th className="px-4 py-3.5">匹配对象</th><th className="px-4 py-3.5">无人可审批时</th><th className="px-4 py-3.5">状态</th><th className="px-5 py-3.5 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{state.approvalRules.map((rule) => { const candidates = resolveApprovalCandidates(rule); return <tr key={rule.id} className="text-[12px] hover:bg-slate-50"><td className="px-5 py-4"><div className="font-black text-slate-800">{rule.documentType}</div><div className="mt-1 text-[10px] text-slate-400">{rule.module}</div></td><td className="px-4 py-4 font-bold text-slate-700">{resolverLabel[rule.resolver]}</td><td className="px-4 py-4 text-slate-600"><div>{approvalTargetLabel(rule)}</div><div className={`mt-1 text-[10px] ${candidates.length ? 'text-emerald-600' : 'text-rose-600'}`}>{candidates.length ? `可解析 ${candidates.length} 人` : '当前无法解析有效账号'}</div></td><td className="px-4 py-4 text-slate-500">{fallbackLabel[rule.fallback]}</td><td className="px-4 py-4"><StatusPill value={rule.status} label={rule.status === 'enabled' ? '使用中' : '已停用'} /></td><td className="px-5 py-4 text-right"><div className="inline-flex gap-1"><Button variant="quiet" icon={Pencil} onClick={() => openApprovalRuleEditor(rule)}>编辑</Button><Button variant="quiet" icon={CheckCircle2} onClick={() => setImpact({ eyebrow: '规则测试结果', title: candidates.length ? '已找到有效审批人' : '未找到有效审批人', description: candidates.length ? `“${rule.module} / ${rule.documentType}”可以正常生成审批待办。` : `“${rule.module} / ${rule.documentType}”当前无法生成审批待办。`, impacts: candidates.length ? candidates.map((employee) => `${employee.name} · ${orgById[employee.primaryOrgId]?.name || '未归属组织'} · ${accountByEmployee[employee.id]?.loginName || '无可用账号'}`) : [`匹配对象：${approvalTargetLabel(rule)}`, `系统将按规则${fallbackLabel[rule.fallback]}`], confirmLabel: '关闭结果', hideSecondary: true, tone: candidates.length ? 'default' : 'danger', onConfirm: () => {} })}>测试规则</Button></div></td></tr>;})}</tbody></table></div>
      </Panel>
    </div>
  );

  const openDictionaryEditor = (row?: PlatformState['dictionaries'][number]) => setDrawer({
    title: row ? '编辑字典项' : '新增字典项', description: '字典编码被业务引用后应保持稳定；可修改分类和显示名称。', submitLabel: row ? '保存字典项' : '新增字典项',
    fields: [{ key: 'category', label: '字典分类', required: true, maxLength: 30, help: '2–30 个字符，例如“组织类型”。' }, { key: 'code', label: '字典编码', required: true, disabled: Boolean(row), normalize: (value) => value.toLowerCase(), maxLength: 64, help: '自动转为小写；以字母开头，仅支持字母、数字和下划线。' }, { key: 'name', label: '显示名称', required: true, wide: true, maxLength: 60 }],
    initial: row ? { category: row.category, code: row.code, name: row.name } : { category: '', code: '', name: '' },
    validate: (draft) => {
      const categoryError = validateDisplayName(draft.category, '字典分类');
      if (categoryError) return { key: 'category', message: categoryError };
      const nameError = validateDisplayName(draft.name, '显示名称', 1);
      if (nameError) return { key: 'name', message: nameError };
      if (!DICTIONARY_CODE_PATTERN.test(draft.code)) return { key: 'code', message: '字典编码须以小写字母开头，仅使用小写字母、数字和下划线，共 2–64 位。' };
      if (state.dictionaries.some((item) => item.code.trim().toLowerCase() === draft.code.trim().toLowerCase() && item.id !== row?.id)) return { key: 'code', message: '字典编码已存在，请使用唯一编码。' };
      return null;
    },
    onSubmit: (draft) => row ? commit((prev) => ({ ...prev, dictionaries: prev.dictionaries.map((item) => item.id === row.id ? { ...item, category: draft.category, name: draft.name } : item) }), '字典项已保存', '编辑字典项', draft.name) : commit((prev) => ({ ...prev, dictionaries: [...prev.dictionaries, { id: makeId('DICT'), category: draft.category, code: draft.code, name: draft.name, status: 'enabled' }] }), '字典项已新增', '新增字典项', draft.name),
  });

  const openParameterEditor = (row?: PlatformState['parameters'][number]) => {
    const valueType = inferParameterValueType(row);
    setDrawer({
      title: row ? '编辑系统参数' : '新增系统参数', description: '参数编码和类型创建后不可修改；参数值会按类型和业务范围校验。', submitLabel: row ? '保存参数' : '新增参数',
      fields: [
        { key: 'name', label: '参数名称', required: true, maxLength: 60 },
        { key: 'code', label: '参数编码', required: true, disabled: Boolean(row), maxLength: 100, help: '采用分段编码，例如 approval.timeout.hours。' },
        { key: 'valueType', label: '参数类型', type: 'select', required: true, disabled: Boolean(row), clearOnChange: ['value'], options: [{ value: 'integer', label: '整数' }, { value: 'boolean', label: '是 / 否' }, { value: 'text', label: '文本' }] },
        { key: 'value', label: '参数值', typeFor: (draft) => draft.valueType === 'boolean' ? 'select' : 'text', required: true, maxLength: 200, optionsFor: (draft) => draft.valueType === 'boolean' ? [{ value: 'true', label: '是' }, { value: 'false', label: '否' }] : [], help: '整数参数使用纯数字；小时类参数范围为 1–720。' },
        { key: 'effectiveMode', label: '生效方式', type: 'select', required: true, options: [{ value: 'immediate', label: '立即生效' }, { value: 'next_login', label: '下次登录生效' }] },
      ],
      initial: row ? { name: row.name, code: row.code, value: row.value, valueType, effectiveMode: row.effectiveMode } : { name: '', code: '', value: '', valueType: 'text', effectiveMode: 'immediate' },
      validate: (draft) => {
        const nameError = validateDisplayName(draft.name, '参数名称');
        if (nameError) return { key: 'name', message: nameError };
        if (!PARAMETER_CODE_PATTERN.test(draft.code) || draft.code.length > 100) return { key: 'code', message: '参数编码应为点分格式，例如 approval.timeout.hours，且不超过 100 位。' };
        if (state.parameters.some((item) => item.code.trim().toLowerCase() === draft.code.trim().toLowerCase() && item.id !== row?.id)) return { key: 'code', message: '参数编码已存在，请使用唯一编码。' };
        const valueError = validateParameterValue(draft.code, draft.valueType, draft.value);
        return valueError ? { key: 'value', message: valueError } : null;
      },
      onSubmit: (draft) => row ? commit((prev) => ({ ...prev, parameters: prev.parameters.map((item) => item.id === row.id ? { ...item, name: draft.name, value: draft.value, valueType: draft.valueType as any, effectiveMode: draft.effectiveMode as any } : item) }), '系统参数已保存', '编辑系统参数', draft.name) : commit((prev) => ({ ...prev, parameters: [...prev.parameters, { id: makeId('PAR'), code: draft.code, name: draft.name, value: draft.value, valueType: draft.valueType as any, effectiveMode: draft.effectiveMode as any }] }), '系统参数已新增', '新增系统参数', draft.name),
    });
  };

  const renderConfig = () => {
    const rows = configMode === 'dictionary' ? state.dictionaries : state.parameters;
    return (
      <div data-testid="platform-view-config">
        <PageHeader eyebrow="规则与治理" title="字典与参数" description="维护可复用的业务选项和系统规则；变更会按各自的生效方式应用。" actions={<Button variant="primary" icon={Plus} onClick={() => configMode === 'dictionary' ? openDictionaryEditor() : openParameterEditor()}>{configMode === 'dictionary' ? '新增字典项' : '新增参数'}</Button>} />
        <Panel>
          <div className="border-b border-slate-100 p-4"><Segmented value={configMode} onChange={setConfigMode} items={[{ value: 'dictionary', label: '数据字典', count: state.dictionaries.length }, { value: 'parameter', label: '系统参数', count: state.parameters.length }]} /></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500">{configMode === 'dictionary' ? <tr><th className="px-5 py-3.5">字典分类</th><th className="px-4 py-3.5">显示名称</th><th className="px-4 py-3.5">编码</th><th className="px-4 py-3.5">状态</th><th className="px-5 py-3.5 text-right">操作</th></tr> : <tr><th className="px-5 py-3.5">参数</th><th className="px-4 py-3.5">编码</th><th className="px-4 py-3.5">当前值</th><th className="px-4 py-3.5">类型 / 生效</th><th className="px-5 py-3.5 text-right">操作</th></tr>}</thead><tbody className="divide-y divide-slate-100">{rows.map((row: any) => configMode === 'dictionary' ? <tr key={row.id} className="text-[12px] hover:bg-slate-50"><td className="px-5 py-4 font-black text-slate-800">{row.category}</td><td className="px-4 py-4 text-slate-600">{row.name}</td><td className="px-4 py-4 text-slate-500">{row.code}</td><td className="px-4 py-4"><StatusPill value={row.status} label={row.status === 'enabled' ? '启用' : '停用'} /></td><td className="px-5 py-4 text-right"><Button variant="quiet" icon={Pencil} onClick={() => openDictionaryEditor(row)}>编辑</Button></td></tr> : <tr key={row.id} className="text-[12px] hover:bg-slate-50"><td className="px-5 py-4 font-black text-slate-800">{row.name}</td><td className="px-4 py-4 text-slate-500">{row.code}</td><td className="px-4 py-4 font-bold text-slate-700">{row.value}</td><td className="px-4 py-4"><div className="font-bold text-slate-600">{parameterValueTypeLabel[inferParameterValueType(row)]}</div><div className="mt-1 text-[10px] text-slate-400">{row.effectiveMode === 'immediate' ? '立即生效' : '下次登录生效'}</div></td><td className="px-5 py-4 text-right"><Button variant="quiet" icon={Pencil} onClick={() => openParameterEditor(row)}>编辑</Button></td></tr>)}</tbody></table></div>
        </Panel>
      </div>
    );
  };

  const renderAudit = () => {
    return <PlatformAuditPanel context={currentUser?.accessToken ? { tenantId: tenantIdentity.id, accessToken: currentUser.accessToken } : null} onSelect={setAuditDetail} />;
  };

  const initChecks = [
    { title: '建立组织架构', description: '至少创建公司、工厂和启用应用所需的负责人', ready: state.orgUnits.some((item) => item.type === 'factory' && item.status === 'enabled'), route: 'org' as NavId },
    { title: '配置企业资源', description: '生产应用需要产线，库存应用需要仓库', ready: state.resources.some((item) => item.type === 'line' && item.status === 'enabled') && state.resources.some((item) => item.type === 'warehouse' && item.status === 'enabled'), route: 'resource' as NavId },
    { title: '准备管理员账号', description: '指定正式管理员并确保账号可用', ready: state.accounts.some((item) => item.id === state.tenant.formalAdminAccountId && item.status === 'enabled'), route: 'identity' as NavId },
    { title: '发布基础权限', description: '管理员角色需要至少一项有效权限', ready: state.roleGrants.some((item) => item.roleId === 'ROLE-ADMIN' && item.effect === 'allow'), route: 'access' as NavId },
  ];
  const renderInitialization = () => (
    <div data-testid="platform-view-init"><PageHeader eyebrow="首次设置" title="完成企业初始化" description="按业务顺序补齐必要资料；完成后即可开放成员工作区。" actions={initChecks.every((item) => item.ready) ? <Button variant="primary" icon={CheckCircle2} onClick={() => commit((prev) => ({ ...prev, tenant: { ...prev.tenant, status: 'running' } }), '企业已正式启用', '正式启用企业', state.tenant.name)}>正式启用</Button> : undefined} /><Panel><div className="divide-y divide-slate-100">{initChecks.map((item, index) => <div key={item.title} className="flex items-center gap-4 px-5 py-5"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-black ${item.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{item.ready ? <Check size={16} /> : index + 1}</div><div className="min-w-0 flex-1"><div className="text-[13px] font-black text-slate-800">{item.title}</div><p className="mt-1 text-[11px] leading-5 text-slate-500">{item.description}</p></div>{item.ready ? <StatusPill value="enabled" label="已完成" /> : <Button icon={ChevronRight} onClick={() => navigateToView(item.route)}>去处理</Button>}</div>)}</div></Panel></div>
  );

  const renderEmployeeAccounts = () => (
    <div data-testid="platform-view-employee-accounts">
      <div className="p-4">
        <EmployeeAccountManagement key={`${tenantIdentity.id}:${currentUser?.accessToken}`}
          apiContext={{ tenantId: tenantIdentity.id, accessToken: currentUser?.accessToken ?? '' }}
          orgUnits={state.orgUnits} positions={state.positions}
          onToast={(msg, type) => toast(msg, type ?? 'success')} />
      </div>
    </div>
  );

  const viewMap: Record<NavId, () => React.ReactNode> = { tenant: renderTenant, org: renderOrg, resource: renderResources, identity: renderIdentity, 'employee-accounts': renderEmployeeAccounts, access: renderAccess, adapter: renderAdapters, governance: renderGovernance, config: renderConfig, audit: renderAudit, init: renderInitialization };
  const visibleGroups = state.tenant.status === 'running'
    ? NAV_GROUPS
    : NAV_GROUPS.map((group, index) => index === 0
      ? { ...group, items: [{ id: 'init' as NavId, label: '初始化企业', icon: ListChecks }, ...group.items] }
      : group);
  const activeGroup = visibleGroups.find((group) => group.items.some((item) => item.id === activeView));

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#f4f6f9]" data-testid="platform-v3-root">
      <EditorDrawer config={drawer} onClose={() => setDrawer(null)} />
      <ImpactDialog config={impact} onClose={() => setImpact(null)} />
      {permissionError && <div role="alert" className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{permissionError}<button className="ml-3 underline" onClick={() => void reloadSnapshot().catch(error => setPermissionError(error.message || '平台数据加载失败'))}>重新加载</button></div>}
      {auditDetail && <div className="fixed inset-0 z-[160] flex justify-end bg-slate-950/30"><button tabIndex={-1} className="absolute inset-0 cursor-default" aria-label="关闭审计详情" onClick={() => setAuditDetail(null)} /><aside ref={auditPanelRef} role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" className="relative flex h-full w-full max-w-[460px] flex-col bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-200 px-6 py-5"><div><h2 id="audit-detail-title" className="text-[18px] font-black text-slate-950">审计详情</h2><p className="mt-1 text-[11px] text-slate-400">仅在排查问题时使用技术追踪编号</p></div><button ref={auditCloseRef} onClick={() => setAuditDetail(null)} aria-label="关闭" className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><X size={18} /></button></div><dl className="custom-scrollbar flex-1 divide-y divide-slate-100 overflow-y-auto p-6">{[['操作时间', auditDetail.time], ['操作人', auditDetail.operator], ['所属模块', auditDetail.module], ['执行动作', auditDetail.action], ['操作对象', auditDetail.target], ['结果', auditDetail.result === 'success' ? '成功' : auditDetail.result === 'failed' ? '失败' : '已拒绝'], ['技术追踪编号', auditDetail.traceId]].map(([label, value]) => <div key={label} className="py-3"><dt className="text-[11px] font-bold text-slate-400">{label}</dt><dd className="mt-1.5 break-all text-[12px] font-bold text-slate-700">{value}</dd></div>)}</dl></aside></div>}
      <header className="relative z-[80] shrink-0 border-b border-slate-200 bg-[#f7f9fc] px-4 py-4 sm:px-6 xl:px-8">
        <div className="mx-auto w-full max-w-[1440px]">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm"><Building2 size={23} /></div>
            <div className="min-w-0"><div className="text-[22px] font-black tracking-[-0.03em] text-slate-950">平台管理</div><p className="mt-1 truncate text-[12px] font-bold text-slate-500">{state.tenant.name}</p></div>
          </div>
          <nav ref={navRef} data-platform-nav className="relative flex w-full items-stretch gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:w-fit sm:gap-2" aria-label="平台管理功能分组">
            {visibleGroups.map((group, index) => {
              const GroupIcon = group.icon;
              const isCurrentGroup = activeGroup?.label === group.label;
              const isOpen = openNavGroup === group.label;
              const currentItem = group.items.find((item) => item.id === activeView);
              const focusMenuItem = (targetIndex: number) => requestAnimationFrame(() => {
                const items = navRef.current?.querySelectorAll<HTMLButtonElement>(`[data-platform-menu="${index}"] [role="menuitem"]`);
                if (!items?.length) return;
                items[Math.max(0, Math.min(targetIndex, items.length - 1))]?.focus();
              });
              return (
                <div key={group.label} className="relative min-w-0 flex-1 sm:flex-none">
                  <button
                    type="button"
                    data-testid={`platform-group-${index}`}
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    aria-controls={`platform-menu-${index}`}
                    onClick={() => setOpenNavGroup(isOpen ? null : group.label)}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                      event.preventDefault();
                      setOpenNavGroup(group.label);
                      focusMenuItem(event.key === 'ArrowUp' ? group.items.length - 1 : 0);
                    }}
                    className={`flex min-h-12 w-full items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 sm:min-w-[164px] sm:gap-2 sm:px-4 sm:text-[12px] ${isCurrentGroup ? 'bg-blue-600 text-white shadow-sm' : isOpen ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                  >
                    <GroupIcon size={16} className="hidden shrink-0 sm:block" />
                    <span className="min-w-0 text-left"><span className="block whitespace-nowrap">{group.label}</span>{currentItem && <span className={`mt-0.5 block whitespace-nowrap text-[10px] ${isCurrentGroup ? 'text-blue-100' : 'text-slate-400'}`}>{currentItem.label}</span>}</span>
                    <ChevronDown size={14} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div id={`platform-menu-${index}`} data-platform-menu={index} role="menu" aria-label={`${group.label}子项`} onKeyDown={(event) => {
                      const items = Array.from((event.currentTarget as HTMLDivElement).querySelectorAll('[role="menuitem"]')) as HTMLButtonElement[];
                      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setOpenNavGroup(null);
                        requestAnimationFrame(() => navRef.current?.querySelector<HTMLButtonElement>(`[data-testid="platform-group-${index}"]`)?.focus());
                      } else if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        items[(currentIndex + 1 + items.length) % items.length]?.focus();
                      } else if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        items[(currentIndex - 1 + items.length) % items.length]?.focus();
                      } else if (event.key === 'Home') {
                        event.preventDefault();
                        items[0]?.focus();
                      } else if (event.key === 'End') {
                        event.preventDefault();
                        items[items.length - 1]?.focus();
                      } else if (event.key === 'Tab') setOpenNavGroup(null);
                    }} className={`absolute top-[calc(100%+8px)] z-[90] w-[230px] overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-[0_18px_45px_rgba(15,23,42,0.16)] ${index === visibleGroups.length - 1 ? 'right-0' : 'left-0'}`}>
                      <div className="px-3 pb-2 pt-1 text-[10px] font-black tracking-[0.12em] text-slate-400">{group.label}</div>
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeView === item.id;
                        return (
                          <button key={item.id} role="menuitem" aria-current={isActive ? 'page' : undefined} data-testid={`platform-nav-${item.id}`} onClick={() => navigateToView(item.id)} className={`mb-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[12px] font-extrabold transition-colors last:mb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}><Icon size={15} className={isActive ? 'text-blue-600' : 'text-slate-400'} /><span className="flex-1">{item.label}</span>{isActive && <Check size={14} />}</button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 xl:p-8"><div className="mx-auto w-full max-w-[1440px]">{viewMap[activeView]()}</div></main>
    </div>
  );
}
